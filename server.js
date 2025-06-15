const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');
const bodyParser = require('body-parser');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const multer = require('multer');
const PDFDocument = require('pdfkit');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration de la base de données PostgreSQL
const pool = new Pool({
    user: process.env.DB_USER || 'zalint',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'depenses_management',
    password: process.env.DB_PASSWORD || 'bonea2024',
    port: process.env.DB_PORT || 5432,
});

// Configuration de multer pour l'upload de fichiers
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = './uploads';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        // Générer un nom unique pour éviter les conflits
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const extension = path.extname(file.originalname);
        cb(null, file.fieldname + '-' + uniqueSuffix + extension);
    }
});

const fileFilter = (req, file, cb) => {
    // Types de fichiers autorisés
    const allowedTypes = [
        'image/jpeg', 'image/jpg', 'image/png',
        'application/pdf',
        'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Type de fichier non autorisé'), false);
    }
};

const upload = multer({ 
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB max
    }
});

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use('/uploads', express.static('uploads')); // Servir les fichiers uploadés

// Configuration des sessions
app.use(session({
    secret: 'your-secret-key-here',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 24 heures
}));

// Middleware d'authentification
const requireAuth = (req, res, next) => {
    if (req.session.user) {
        next();
    } else {
        res.status(401).json({ error: 'Non autorisé' });
    }
};

const requireAdminAuth = (req, res, next) => {
    if (req.session.user && (req.session.user.role === 'directeur_general' || req.session.user.role === 'pca')) {
        next();
    } else {
        res.status(403).json({ error: 'Accès refusé - Privilèges insuffisants' });
    }
};

// Routes d'authentification
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        const result = await pool.query(
            'SELECT * FROM users WHERE username = $1',
            [username]
        );
        
        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Nom d\'utilisateur ou mot de passe incorrect' });
        }
        
        const user = result.rows[0];
        const validPassword = await bcrypt.compare(password, user.password_hash);
        
        if (!validPassword) {
            return res.status(401).json({ error: 'Nom d\'utilisateur ou mot de passe incorrect' });
        }
        
        req.session.user = {
            id: user.id,
            username: user.username,
            role: user.role,
            full_name: user.full_name
        };
        
        res.json({ 
            message: 'Connexion réussie',
            user: req.session.user
        });
    } catch (error) {
        console.error('Erreur de connexion:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.post('/api/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ error: 'Erreur lors de la déconnexion' });
        }
        res.json({ message: 'Déconnexion réussie' });
    });
});

app.get('/api/user', requireAuth, (req, res) => {
    res.json(req.session.user);
});

// Routes pour les comptes (remplace les portefeuilles)
app.post('/api/accounts/credit', requireAdminAuth, async (req, res) => {
    try {
        const { account_id, amount, description } = req.body;
        const credited_by = req.session.user.id;
        
        // Vérifier que le compte existe et est actif
        const accountResult = await pool.query(
            'SELECT a.*, u.full_name as user_name FROM accounts a JOIN users u ON a.user_id = u.id WHERE a.id = $1 AND a.is_active = true',
            [account_id]
        );
        
        if (accountResult.rows.length === 0) {
            return res.status(404).json({ error: 'Compte non trouvé ou inactif' });
        }
        
        await pool.query('BEGIN');
        
        // Mettre à jour le solde du compte
        await pool.query(
            'UPDATE accounts SET current_balance = current_balance + $1, total_credited = total_credited + $1 WHERE id = $2',
            [parseInt(amount), account_id]
        );
        
        // Enregistrer l'historique du crédit
        await pool.query(
            'INSERT INTO credit_history (account_id, credited_by, amount, description) VALUES ($1, $2, $3, $4)',
            [account_id, credited_by, parseInt(amount), description || 'Crédit de compte']
        );
        
        await pool.query('COMMIT');
        
        res.json({ message: 'Compte crédité avec succès', amount: parseInt(amount) });
    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('Erreur crédit compte:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Routes pour les dépenses (modifiées pour utiliser les comptes, le système hiérarchique et les fichiers)
app.post('/api/expenses', requireAuth, upload.single('justification'), async (req, res) => {
    try {
        const { 
            account_id, expense_type, category, subcategory, social_network_detail, 
            designation, supplier, quantity, unit_price, total, predictable,
            amount, description, expense_date 
        } = req.body;
        const user_id = req.session.user.id;
        
        // Utiliser le total calculé comme montant principal
        const finalAmount = parseInt(total) || parseInt(amount) || 0;
        
        if (finalAmount <= 0) {
            return res.status(400).json({ error: 'Le montant doit être supérieur à zéro' });
        }
        
        // Vérifier le solde du compte POUR TOUS LES UTILISATEURS
        const accountResult = await pool.query(
            'SELECT current_balance, total_credited, account_name, user_id FROM accounts WHERE id = $1 AND is_active = true',
            [account_id]
        );
        
        if (accountResult.rows.length === 0) {
            return res.status(400).json({ error: 'Compte non trouvé ou inactif' });
        }
        
        const account = accountResult.rows[0];
        
        // Vérifier l'autorisation pour les directeurs
        if (req.session.user.role === 'directeur' && account.user_id !== user_id) {
            return res.status(403).json({ error: 'Vous ne pouvez pas dépenser sur ce compte' });
        }
        
        // Vérification du solde disponible
        const currentBalance = account.current_balance;
        if (currentBalance < finalAmount) {
            return res.status(400).json({ 
                error: `Solde insuffisant. Solde disponible: ${currentBalance.toLocaleString()} FCFA, Montant demandé: ${finalAmount.toLocaleString()} FCFA` 
            });
        }
        
        // Vérification supplémentaire : le total des dépenses ne doit pas dépasser le total crédité
        if (account.total_credited > 0) {
            const totalSpentAfter = await pool.query(
                'SELECT COALESCE(SUM(total), 0) as total_spent FROM expenses WHERE account_id = $1',
                [account_id]
            );
            
            const currentTotalSpent = parseInt(totalSpentAfter.rows[0].total_spent);
            const newTotalSpent = currentTotalSpent + finalAmount;
            
            if (newTotalSpent > account.total_credited) {
                return res.status(400).json({ 
                    error: `Cette dépense dépasserait le budget total. Budget total: ${account.total_credited.toLocaleString()} FCFA, Déjà dépensé: ${currentTotalSpent.toLocaleString()} FCFA, Nouveau montant: ${finalAmount.toLocaleString()} FCFA` 
                });
            }
        }
        
        await pool.query('BEGIN');
        
        // Gérer le fichier uploadé
        let justificationFilename = null;
        let justificationPath = null;
        if (req.file) {
            justificationFilename = req.file.originalname;
            justificationPath = req.file.path;
        }
        
        // Insérer la dépense avec tous les nouveaux champs
        const expenseResult = await pool.query(`
            INSERT INTO expenses (
                user_id, account_id, expense_type, category, subcategory, social_network_detail,
                designation, supplier, quantity, unit_price, total, predictable,
                justification_filename, justification_path,
                amount, description, expense_date
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) 
            RETURNING *`,
            [
                user_id, account_id, expense_type, category, subcategory, social_network_detail,
                designation, supplier, parseFloat(quantity), parseInt(unit_price), parseInt(total), predictable,
                justificationFilename, justificationPath,
                finalAmount, description, expense_date
            ]
        );
        
        // Déduire du solde du compte POUR TOUS LES UTILISATEURS
        await pool.query(
            'UPDATE accounts SET current_balance = current_balance - $1, total_spent = total_spent + $1 WHERE id = $2',
            [finalAmount, account_id]
        );
        
        await pool.query('COMMIT');
        
        res.json(expenseResult.rows[0]);
    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('Erreur ajout dépense:', error);
        
        // Supprimer le fichier en cas d'erreur
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour récupérer les comptes
app.get('/api/accounts', requireAuth, async (req, res) => {
    try {
        let query = `
            SELECT a.*, u.full_name as user_name, u.username, uc.full_name as created_by_name
            FROM accounts a
            JOIN users u ON a.user_id = u.id
            LEFT JOIN users uc ON a.created_by = uc.id
            WHERE a.is_active = true
        `;
        let params = [];
        
        if (req.session.user.role === 'directeur') {
            query += ' AND a.user_id = $1';
            params.push(req.session.user.id);
        }
        
        query += ' ORDER BY a.account_name';
        
        const result = await pool.query(query, params);
        
        // Calculer les vrais totaux pour chaque compte
        const accountsWithRealTotals = await Promise.all(result.rows.map(async (account) => {
            // Calculer le total réellement dépensé pour ce compte
            const expensesResult = await pool.query(
                'SELECT COALESCE(SUM(total), 0) as real_total_spent FROM expenses WHERE account_id = $1',
                [account.id]
            );
            
            const realTotalSpent = parseInt(expensesResult.rows[0].real_total_spent) || 0;
            const realCurrentBalance = account.total_credited - realTotalSpent;
            
            return {
                ...account,
                total_spent: realTotalSpent,
                current_balance: realCurrentBalance
            };
        }));
        
        res.json(accountsWithRealTotals);
    } catch (error) {
        console.error('Erreur récupération comptes:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour l'historique des crédits
app.get('/api/credit-history', requireAdminAuth, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT ch.*, u.username as user_name, ub.username as credited_by_name, a.account_name
            FROM credit_history ch
            JOIN accounts a ON ch.account_id = a.id
            JOIN users u ON a.user_id = u.id
            JOIN users ub ON ch.credited_by = ub.id
            ORDER BY ch.created_at DESC
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Erreur récupération historique crédits:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour obtenir le solde d'un directeur
app.get('/api/account/balance', requireAuth, async (req, res) => {
    try {
        const user_id = req.session.user.id;
        
        if (req.session.user.role !== 'directeur') {
            return res.status(403).json({ error: 'Accès refusé' });
        }
        
        const result = await pool.query(
            'SELECT id, current_balance, total_credited, total_spent FROM accounts WHERE user_id = $1 AND is_active = true',
            [user_id]
        );
        
        if (result.rows.length === 0) {
            // Aucun compte actif trouvé
            res.json({ current_balance: 0, total_credited: 0, total_spent: 0 });
        } else {
            // Calculer les totaux pour tous les comptes du directeur
            let totalCredited = 0;
            let totalSpent = 0;
            let currentBalance = 0;
            
            for (const account of result.rows) {
                totalCredited += account.total_credited;
                
                // Calculer le total réellement dépensé pour ce compte
                const expensesResult = await pool.query(
                    'SELECT COALESCE(SUM(total), 0) as real_total_spent FROM expenses WHERE account_id = $1',
                    [account.id]
                );
                
                const accountSpent = parseInt(expensesResult.rows[0].real_total_spent) || 0;
                totalSpent += accountSpent;
                currentBalance += (account.total_credited - accountSpent);
            }
            
            res.json({
                current_balance: currentBalance,
                total_credited: totalCredited,
                total_spent: totalSpent
            });
        }
    } catch (error) {
        console.error('Erreur récupération solde:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.get('/api/expenses', requireAuth, async (req, res) => {
    try {
        const user_id = req.session.user.id;
        const { start_date, end_date } = req.query;
        
        let query = `
            SELECT e.*, u.full_name as user_name, u.username, a.account_name,
                   CASE 
                       WHEN e.expense_type IS NOT NULL THEN 
                           CONCAT(e.expense_type, ' > ', e.category, ' > ', e.subcategory,
                                  CASE WHEN e.social_network_detail IS NOT NULL AND e.social_network_detail != '' 
                                       THEN CONCAT(' (', e.social_network_detail, ')') 
                                       ELSE '' END)
                       ELSE 'Catégorie non définie'
                   END as category_name,
                   CASE 
                       WHEN e.justification_filename IS NOT NULL THEN true 
                       ELSE false 
                   END as has_justification,
                   COALESCE(e.selected_for_invoice, false) as selected_for_invoice
            FROM expenses e
            JOIN users u ON e.user_id = u.id
            LEFT JOIN accounts a ON e.account_id = a.id
        `;
        let params = [];
        
        if (req.session.user.role === 'directeur') {
            // Les directeurs voient leurs propres dépenses ET les dépenses faites par le DG sur leurs comptes
            query += ` WHERE (e.user_id = $1 OR (a.user_id = $1 AND e.user_id IN (
                SELECT id FROM users WHERE role IN ('directeur_general', 'pca')
            )))`;
            params.push(user_id);
        } else {
            query += ' WHERE 1=1';
        }
        
        if (start_date) {
            params.push(start_date);
            query += ` AND e.expense_date >= $${params.length}`;
        }
        
        if (end_date) {
            params.push(end_date);
            query += ` AND e.expense_date <= $${params.length}`;
        }
        
        query += ' ORDER BY e.expense_date DESC, e.created_at DESC';
        
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error('Erreur récupération dépenses:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});



// Routes pour les utilisateurs
app.get('/api/users', requireAdminAuth, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, username, role, full_name FROM users WHERE role = $1 ORDER BY full_name',
            ['directeur']
        );
        res.json(result.rows);
    } catch (error) {
        console.error('Erreur récupération utilisateurs:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Routes pour le dashboard
app.get('/api/dashboard/stats', requireAuth, async (req, res) => {
    try {
        // Récupérer les paramètres de date depuis la query string
        const { start_date, end_date } = req.query;
        
        // Par défaut, utiliser aujourd'hui si aucune date n'est spécifiée
        const today = new Date().toISOString().split('T')[0];
        const startDate = start_date || today;
        const endDate = end_date || today;
        
        // Dates pour les statistiques fixes (aujourd'hui, semaine, mois)
        const monday = new Date();
        monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
        const week_start = monday.toISOString().split('T')[0];
        
        const firstDayOfMonth = new Date();
        firstDayOfMonth.setDate(1);
        const month_start = firstDayOfMonth.toISOString().split('T')[0];
        
        // Déterminer les filtres selon le rôle
        const isDirector = req.session.user.role === 'directeur';
        const userFilter = isDirector ? ` AND (e.user_id = $2 OR (EXISTS (
            SELECT 1 FROM accounts a WHERE a.id = e.account_id AND a.user_id = $2
        ) AND e.user_id IN (SELECT id FROM users WHERE role IN ('directeur_general', 'pca'))))` : '';
        const userParam = isDirector ? [req.session.user.id] : [];
        
        // Cash burn du jour
        const dailyBurnQuery = `SELECT COALESCE(SUM(e.total), 0) as total FROM expenses e WHERE e.expense_date = $1${userFilter}`;
        const dailyBurn = await pool.query(dailyBurnQuery, [today, ...userParam]);
        
        // Cash burn depuis lundi
        const weeklyBurnQuery = `SELECT COALESCE(SUM(e.total), 0) as total FROM expenses e WHERE e.expense_date >= $1${userFilter}`;
        const weeklyBurn = await pool.query(weeklyBurnQuery, [week_start, ...userParam]);
        
        // Cash burn du mois
        const monthlyBurnQuery = `SELECT COALESCE(SUM(e.total), 0) as total FROM expenses e WHERE e.expense_date >= $1${userFilter}`;
        const monthlyBurn = await pool.query(monthlyBurnQuery, [month_start, ...userParam]);
        
        // Dépenses par compte (période sélectionnée) avec total crédité
        let accountBurnQuery = `
            SELECT 
                a.account_name as name,
                COALESCE(SUM(e.total), 0) as spent,
                a.total_credited,
                a.current_balance
            FROM accounts a
            JOIN users u ON a.user_id = u.id
            LEFT JOIN expenses e ON a.id = e.account_id 
                AND e.expense_date >= $1 AND e.expense_date <= $2
            WHERE a.is_active = true`;
        
        let accountParams = [startDate, endDate];
        
        if (isDirector) {
            accountBurnQuery += ' AND a.user_id = $3';
            accountParams.push(req.session.user.id);
        }
        
        accountBurnQuery += `
            GROUP BY a.id, a.account_name, a.total_credited, a.current_balance
            ORDER BY spent DESC`;
        
        const accountBurn = await pool.query(accountBurnQuery, accountParams);
        
        // Dépenses par sous-catégorie (période sélectionnée) - utilise le nouveau système hiérarchique
        let categoryBurnQuery = `
            SELECT 
                CASE 
                    WHEN e.subcategory IS NOT NULL AND e.subcategory != '' THEN 
                        CONCAT(COALESCE(e.expense_type, 'Non défini'), ' > ', COALESCE(e.category, 'Non défini'), ' > ', e.subcategory)
                    WHEN e.category IS NOT NULL AND e.category != '' THEN 
                        CONCAT(COALESCE(e.expense_type, 'Non défini'), ' > ', e.category)
                    WHEN e.expense_type IS NOT NULL AND e.expense_type != '' THEN 
                        e.expense_type
                    ELSE 'Non catégorisé'
                END as name,
                COALESCE(SUM(COALESCE(e.total, e.amount::integer, 0)), 0) as total
            FROM expenses e
            WHERE e.expense_date >= $1 AND e.expense_date <= $2`;
        
        let categoryParams = [startDate, endDate];
        
        if (isDirector) {
            categoryBurnQuery += ` AND (e.user_id = $3 OR (EXISTS (
                SELECT 1 FROM accounts a WHERE a.id = e.account_id AND a.user_id = $3
            ) AND e.user_id IN (SELECT id FROM users WHERE role IN ('directeur_general', 'pca'))))`;
            categoryParams.push(req.session.user.id);
        }
        
        categoryBurnQuery += `
            GROUP BY e.expense_type, e.category, e.subcategory
            HAVING COALESCE(SUM(COALESCE(e.total, e.amount::integer, 0)), 0) > 0
            ORDER BY total DESC`;
        
        const categoryBurn = await pool.query(categoryBurnQuery, categoryParams);
        

        
        res.json({
            daily_burn: parseInt(dailyBurn.rows[0].total),
            weekly_burn: parseInt(weeklyBurn.rows[0].total),
            monthly_burn: parseInt(monthlyBurn.rows[0].total),
            account_breakdown: accountBurn.rows.map(row => ({
                account: row.name,
                spent: parseInt(row.spent),
                total_credited: parseInt(row.total_credited || 0),
                amount: parseInt(row.spent) // Pour compatibilité avec le code existant
            })),
            category_breakdown: categoryBurn.rows.map(row => ({
                category: row.name,
                amount: parseInt(row.total)
            })),
            period: {
                start_date: startDate,
                end_date: endDate
            }
        });
    } catch (error) {
        console.error('Erreur récupération stats dashboard:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour récupérer les détails des dépenses par compte
app.get('/api/accounts/:accountName/expenses', requireAuth, async (req, res) => {
    try {
        const { accountName } = req.params;
        const { start_date, end_date } = req.query;
        const userId = req.session.user.id;
        
        // Par défaut, utiliser l'année entière si aucune date n'est spécifiée
        const startDate = start_date || '2025-01-01';
        const endDate = end_date || '2025-12-31';
        
        let query = `
            SELECT 
                e.id,
                e.expense_date,
                e.expense_type,
                e.category,
                e.subcategory,
                e.social_network_detail,
                e.designation,
                e.supplier,
                e.quantity,
                e.unit_price,
                e.total,
                e.predictable,
                e.description,
                u.full_name as user_name,
                u.username,
                a.account_name,
                CASE 
                    WHEN e.expense_type IS NOT NULL THEN 
                        CONCAT(e.expense_type, ' > ', COALESCE(e.category, ''), ' > ', COALESCE(e.subcategory, ''),
                               CASE WHEN e.social_network_detail IS NOT NULL AND e.social_network_detail != '' 
                                    THEN CONCAT(' (', e.social_network_detail, ')') 
                                    ELSE '' END)
                    ELSE 'Catégorie non définie'
                END as category_full
            FROM expenses e
            JOIN users u ON e.user_id = u.id
            JOIN accounts a ON e.account_id = a.id
            WHERE a.account_name = $1
            AND e.expense_date >= $2 
            AND e.expense_date <= $3
        `;
        
        let params = [accountName, startDate, endDate];
        
        // Filtrer selon le rôle de l'utilisateur
        if (req.session.user.role === 'directeur') {
            // Les directeurs voient leurs propres dépenses ET les dépenses faites par le DG sur leurs comptes
            query += ` AND (e.user_id = $4 OR (a.user_id = $4 AND e.user_id IN (
                SELECT id FROM users WHERE role IN ('directeur_general', 'pca')
            )))`;
            params.push(userId);
        }
        
        query += ' ORDER BY e.expense_date DESC, e.created_at DESC';
        
        const result = await pool.query(query, params);
        
        res.json({
            account_name: accountName,
            period: { start_date: startDate, end_date: endDate },
            expenses: result.rows
        });
        
    } catch (error) {
        console.error('Erreur récupération détails dépenses compte:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour télécharger les justificatifs
app.get('/api/expenses/:id/justification', requireAuth, async (req, res) => {
    try {
        const expenseId = req.params.id;
        const userId = req.session.user.id;
        
        // Récupérer les informations du fichier
        let query = 'SELECT justification_filename, justification_path FROM expenses WHERE id = $1';
        let params = [expenseId];
        
        // Les directeurs ne peuvent voir que leurs propres justificatifs
        if (req.session.user.role === 'directeur') {
            query += ' AND user_id = $2';
            params.push(userId);
        }
        
        const result = await pool.query(query, params);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Dépense non trouvée' });
        }
        
        const expense = result.rows[0];
        
        if (!expense.justification_path || !fs.existsSync(expense.justification_path)) {
            return res.status(404).json({ error: 'Fichier justificatif non trouvé' });
        }
        
        // Télécharger le fichier
        res.download(expense.justification_path, expense.justification_filename);
        
    } catch (error) {
        console.error('Erreur téléchargement justificatif:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Routes pour la gestion des factures
app.post('/api/expenses/:id/toggle-selection', requireAuth, async (req, res) => {
    try {
        const expenseId = req.params.id;
        const { selected } = req.body;
        const userId = req.session.user.id;
        
        let query = 'UPDATE expenses SET selected_for_invoice = $1 WHERE id = $2';
        let params = [selected, expenseId];
        
        // Les directeurs peuvent cocher/décocher leurs propres dépenses ET les dépenses du DG/PCA sur leurs comptes
        if (req.session.user.role === 'directeur') {
            query += ` AND (user_id = $3 OR (
                SELECT a.user_id FROM accounts a WHERE a.id = expenses.account_id
            ) = $3)`;
            params.push(userId);
        }
        
        const result = await pool.query(query, params);
        
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Dépense non trouvée ou non autorisée' });
        }
        
        res.json({ success: true });
        
    } catch (error) {
        console.error('Erreur toggle sélection:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.post('/api/expenses/select-all', requireAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;
        
        let query = 'UPDATE expenses SET selected_for_invoice = true';
        let params = [];
        
        // Les directeurs peuvent sélectionner leurs propres dépenses ET les dépenses du DG/PCA sur leurs comptes
        if (req.session.user.role === 'directeur') {
            query += ` WHERE (user_id = $1 OR (
                SELECT a.user_id FROM accounts a WHERE a.id = expenses.account_id
            ) = $1)`;
            params.push(userId);
        }
        
        await pool.query(query, params);
        res.json({ success: true });
        
    } catch (error) {
        console.error('Erreur sélection tout:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.post('/api/expenses/deselect-all', requireAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;
        
        let query = 'UPDATE expenses SET selected_for_invoice = false';
        let params = [];
        
        // Les directeurs peuvent désélectionner leurs propres dépenses ET les dépenses du DG/PCA sur leurs comptes
        if (req.session.user.role === 'directeur') {
            query += ` WHERE (user_id = $1 OR (
                SELECT a.user_id FROM accounts a WHERE a.id = expenses.account_id
            ) = $1)`;
            params.push(userId);
        }
        
        await pool.query(query, params);
        res.json({ success: true });
        
    } catch (error) {
        console.error('Erreur désélection tout:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.post('/api/expenses/generate-invoices-pdf', requireAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;
        
        // Récupérer les dépenses sélectionnées
        let query = `
                         SELECT e.*, u.full_name as user_name, u.username, a.account_name,
                    CASE 
                        WHEN e.expense_type IS NOT NULL THEN 
                            CONCAT(e.expense_type, ' > ', e.category, ' > ', e.subcategory,
                                   CASE WHEN e.social_network_detail IS NOT NULL AND e.social_network_detail != '' 
                                        THEN CONCAT(' (', e.social_network_detail, ')') 
                                        ELSE '' END)
                        ELSE 'Catégorie non définie'
                    END as category_name
            FROM expenses e
            JOIN users u ON e.user_id = u.id
            LEFT JOIN accounts a ON e.account_id = a.id
            WHERE e.selected_for_invoice = true
        `;
        let params = [];
        
        // Les directeurs voient leurs propres dépenses ET les dépenses du DG/PCA sur leurs comptes
        if (req.session.user.role === 'directeur') {
            query += ` AND (e.user_id = $1 OR (
                SELECT a.user_id FROM accounts a WHERE a.id = e.account_id
            ) = $1)`;
            params.push(userId);
        }
        
        query += ' ORDER BY e.expense_date DESC';
        
        const result = await pool.query(query, params);
        
        if (result.rows.length === 0) {
            return res.status(400).json({ error: 'Aucune dépense sélectionnée' });
        }
        
        // Générer le PDF
        const doc = new PDFDocument({ margin: 50 });
        
        // Configuration des headers pour le téléchargement
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="factures_${new Date().toISOString().split('T')[0]}.pdf"`);
        
        // Pipe le PDF vers la réponse
        doc.pipe(res);
        
        // Générer une page par dépense
        result.rows.forEach((expense, index) => {
            if (index > 0) {
                doc.addPage();
            }
            
            // En-tête de la facture
            doc.fontSize(18).font('Helvetica-Bold').text('FACTURE', { align: 'center' });
            doc.moveDown(1.5);
            
            // Informations de la facture (en haut à droite)
            doc.fontSize(12).font('Helvetica-Bold');
            doc.text(`N° : ${expense.id.toString().padStart(3, '0')}`, 400, 100, { align: 'right' });
            doc.text(`Date : ${new Date(expense.expense_date).toLocaleDateString('fr-FR')}`, 400, 120, { align: 'right' });
            
            // Section DÉTAILS DE LA DÉPENSE
            doc.fontSize(14).font('Helvetica-Bold').text('DÉTAILS DE LA DÉPENSE', 50, 180);
            doc.moveDown(0.5);
            
            // Liste à puces pour les détails
            let yPosition = 210;
            doc.fontSize(11).font('Helvetica');
            
            // Dépense effectuée par
            doc.circle(60, yPosition + 5, 2).fill('black');
            doc.text(`Dépense effectuée par : ${expense.username}`, 75, yPosition);
            yPosition += 20;
            
            // Catégorie
            doc.circle(60, yPosition + 5, 2).fill('black');
            doc.text(`Catégorie : ${expense.category_name}`, 75, yPosition);
            yPosition += 40;
            
            // Section INFORMATIONS SUR L'ARTICLE
            doc.fontSize(14).font('Helvetica-Bold').text('INFORMATIONS SUR L\'ARTICLE', 50, yPosition);
            yPosition += 30;
            
            doc.fontSize(11).font('Helvetica');
            
            // Désignation
            doc.circle(60, yPosition + 5, 2).fill('black');
            doc.text(`Désignation : ${expense.designation || 'N/A'}`, 75, yPosition);
            yPosition += 20;
            
            // Fournisseur
            doc.circle(60, yPosition + 5, 2).fill('black');
            doc.text(`Fournisseur : ${expense.supplier || 'N/A'}`, 75, yPosition);
            yPosition += 20;
            
            // Quantité
            if (expense.quantity) {
                doc.circle(60, yPosition + 5, 2).fill('black');
                doc.text(`Quantité : ${expense.quantity}`, 75, yPosition);
                yPosition += 20;
            }
            
            // Prix unitaire
            if (expense.unit_price) {
                doc.circle(60, yPosition + 5, 2).fill('black');
                doc.text(`Prix unitaire : ${expense.unit_price.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} FCFA`, 75, yPosition);
                yPosition += 20;
            }
            
            // Description si elle existe (seulement la vraie description, pas la catégorie)
            if (expense.description && expense.description.trim() !== '') {
                yPosition += 10;
                doc.circle(60, yPosition + 5, 2).fill('black');
                doc.text('Description :', 75, yPosition);
                yPosition += 15;
                doc.text(expense.description, 75, yPosition, { width: 450 });
                yPosition += 40;
            }
            
            // Section MONTANT TOTAL À PAYER
            yPosition += 30;
            doc.fontSize(14).font('Helvetica-Bold').text('MONTANT TOTAL À PAYER', 50, yPosition);
            yPosition += 25;
            // Formatage correct du montant avec espaces
            const montant = (expense.total || expense.amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
            doc.fontSize(16).font('Helvetica-Bold').text(`${montant} FCFA`, 50, yPosition);
            
            // Cachet MATA en bas à droite
            const cachetPath = path.join(__dirname, 'public', 'images', 'CachetMata.jpg');
            if (fs.existsSync(cachetPath)) {
                try {
                    doc.image(cachetPath, 400, doc.page.height - 200, { width: 150, height: 150 });
                } catch (error) {
                    console.log('Erreur lors de l\'ajout du cachet:', error);
                }
            }
        });
        
        // Finaliser le PDF
        doc.end();
        
    } catch (error) {
        console.error('Erreur génération PDF:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour récupérer une dépense spécifique
app.get('/api/expenses/:id', requireAuth, async (req, res) => {
    try {
        const expenseId = req.params.id;
        const userId = req.session.user.id;
        
        let query = `
            SELECT e.*, u.full_name as user_name, u.username, a.account_name
            FROM expenses e
            JOIN users u ON e.user_id = u.id
            LEFT JOIN accounts a ON e.account_id = a.id
            WHERE e.id = $1
        `;
        let params = [expenseId];
        
        // Les directeurs ne peuvent voir que leurs propres dépenses
        if (req.session.user.role === 'directeur') {
            query += ' AND e.user_id = $2';
            params.push(userId);
        }
        
        const result = await pool.query(query, params);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Dépense non trouvée' });
        }
        
        res.json(result.rows[0]);
        
    } catch (error) {
        console.error('Erreur récupération dépense:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour modifier une dépense
app.put('/api/expenses/:id', requireAuth, async (req, res) => {
    try {
        const expenseId = req.params.id;
        const userId = req.session.user.id;
        const {
            account_id, expense_type, category, subcategory, social_network_detail,
            designation, supplier, quantity, unit_price, total, predictable,
            description, expense_date
        } = req.body;
        
        // Vérifier que la dépense existe et appartient à l'utilisateur (pour les directeurs)
        let checkQuery = 'SELECT * FROM expenses WHERE id = $1';
        let checkParams = [expenseId];
        
        if (req.session.user.role === 'directeur') {
            checkQuery += ' AND user_id = $2';
            checkParams.push(userId);
        }
        
        const existingExpense = await pool.query(checkQuery, checkParams);
        
        if (existingExpense.rows.length === 0) {
            return res.status(404).json({ error: 'Dépense non trouvée ou non autorisée' });
        }
        
        const newAmount = parseInt(total) || 0;
        
        if (newAmount <= 0) {
            return res.status(400).json({ error: 'Le montant doit être supérieur à zéro' });
        }
        
        // Vérifier que le compte existe et est actif
        let account = null;
        if (account_id) {
            const accountResult = await pool.query(
                'SELECT current_balance, total_credited, account_name, user_id FROM accounts WHERE id = $1 AND is_active = true',
                [account_id]
            );
            
            if (accountResult.rows.length === 0) {
                return res.status(400).json({ error: 'Compte non trouvé ou inactif' });
            }
            
            account = accountResult.rows[0];
            
            // Vérifier l'autorisation pour les directeurs
            if (req.session.user.role === 'directeur' && account.user_id !== userId) {
                return res.status(403).json({ error: 'Vous ne pouvez pas dépenser sur ce compte' });
            }
        }
        
        await pool.query('BEGIN');
        
        // Calculer la différence de montant pour ajuster le solde du compte
        const oldAmount = parseInt(existingExpense.rows[0].total) || 0;
        const difference = newAmount - oldAmount;
        
        // Vérification du solde pour la modification
        if (account && difference > 0) {
            // Si on augmente le montant, vérifier le solde disponible
            if (account.current_balance < difference) {
                await pool.query('ROLLBACK');
                return res.status(400).json({ 
                    error: `Solde insuffisant pour cette modification. Solde disponible: ${account.current_balance.toLocaleString()} FCFA, Augmentation demandée: ${difference.toLocaleString()} FCFA` 
                });
            }
            
            // Vérifier que le total ne dépasse pas le budget alloué
            if (account.total_credited > 0) {
                const totalSpentResult = await pool.query(
                    'SELECT COALESCE(SUM(total), 0) as total_spent FROM expenses WHERE account_id = $1 AND id != $2',
                    [account_id, expenseId]
                );
                
                const currentTotalSpent = parseInt(totalSpentResult.rows[0].total_spent);
                const newTotalSpent = currentTotalSpent + newAmount;
                
                if (newTotalSpent > account.total_credited) {
                    await pool.query('ROLLBACK');
                    return res.status(400).json({ 
                        error: `Cette modification dépasserait le budget total. Budget total: ${account.total_credited.toLocaleString()} FCFA, Déjà dépensé (autres dépenses): ${currentTotalSpent.toLocaleString()} FCFA, Nouveau montant: ${newAmount.toLocaleString()} FCFA` 
                    });
                }
            }
        }
        
        // Mettre à jour la dépense
        const updateResult = await pool.query(`
            UPDATE expenses SET
                account_id = $1,
                expense_type = $2,
                category = $3,
                subcategory = $4,
                social_network_detail = $5,
                designation = $6,
                supplier = $7,
                quantity = $8,
                unit_price = $9,
                total = $10,
                predictable = $11,
                description = $12,
                expense_date = $13,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $14
            RETURNING *
        `, [
            account_id, expense_type, category, subcategory, social_network_detail,
            designation, supplier, parseFloat(quantity), parseInt(unit_price), 
            newAmount, predictable, description, expense_date, expenseId
        ]);
        
        // Ajuster le solde du compte si nécessaire
        if (difference !== 0 && account_id) {
            await pool.query(
                `UPDATE accounts SET 
                    current_balance = current_balance - $1,
                    total_spent = total_spent + $1
                WHERE id = $2`,
                [difference, account_id]
            );
        }
        
        await pool.query('COMMIT');
        
        res.json({
            message: 'Dépense modifiée avec succès',
            expense: updateResult.rows[0]
        });
        
    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('Erreur modification dépense:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Routes pour les catégories
app.get('/api/categories', requireAuth, (req, res) => {
    try {
        const categoriesData = JSON.parse(fs.readFileSync('categories_config.json', 'utf8'));
        res.json(categoriesData);
    } catch (error) {
        console.error('Erreur lecture fichier catégories:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.get('/api/categories/types', requireAuth, (req, res) => {
    try {
        const categoriesData = JSON.parse(fs.readFileSync('categories_config.json', 'utf8'));
        const types = categoriesData.types.map(type => ({
            id: type.id,
            name: type.name
        }));
        res.json(types);
    } catch (error) {
        console.error('Erreur lecture types:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.get('/api/categories/by-type/:typeId', requireAuth, (req, res) => {
    try {
        const { typeId } = req.params;
        const categoriesData = JSON.parse(fs.readFileSync('categories_config.json', 'utf8'));
        const type = categoriesData.types.find(t => t.id === typeId);
        
        if (!type) {
            return res.status(404).json({ error: 'Type non trouvé' });
        }
        
        res.json(type);
    } catch (error) {
        console.error('Erreur lecture catégories par type:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route principale
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Route pour créer/assigner un compte à un directeur
app.post('/api/accounts/create', requireAdminAuth, async (req, res) => {
    try {
        const { user_id, account_name, initial_amount, description } = req.body;
        const created_by = req.session.user.id;
        
        // Vérifier que l'utilisateur existe et est un directeur
        const userResult = await pool.query(
            'SELECT * FROM users WHERE id = $1 AND role = $2',
            [user_id, 'directeur']
        );
        
        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'Directeur non trouvé' });
        }
        
        // Vérifier si le nom du compte existe déjà
        const existingName = await pool.query(
            'SELECT * FROM accounts WHERE account_name = $1 AND is_active = true',
            [account_name]
        );
        
        if (existingName.rows.length > 0) {
            return res.status(400).json({ error: 'Ce nom de compte existe déjà' });
        }
        
        await pool.query('BEGIN');
        
        // Créer le compte
        const accountResult = await pool.query(
            'INSERT INTO accounts (user_id, account_name, current_balance, total_credited, total_spent, created_by) VALUES ($1, $2, $3, $4, 0, $5) RETURNING *',
            [user_id, account_name, parseInt(initial_amount) || 0, parseInt(initial_amount) || 0, created_by]
        );
        
        // Si un montant initial est fourni, enregistrer l'historique
        if (initial_amount && parseInt(initial_amount) > 0) {
            await pool.query(
                'INSERT INTO credit_history (account_id, credited_by, amount, description) VALUES ($1, $2, $3, $4)',
                [accountResult.rows[0].id, created_by, parseInt(initial_amount), description || 'Création du compte avec solde initial']
            );
        }
        
        await pool.query('COMMIT');
        
        res.json({ 
            message: 'Compte créé avec succès', 
            account: accountResult.rows[0]
        });
    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('Erreur création compte:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour désactiver/supprimer un compte
app.delete('/api/accounts/:accountId', requireAdminAuth, async (req, res) => {
    try {
        const { accountId } = req.params;
        
        // Désactiver le compte au lieu de le supprimer
        const result = await pool.query(
            'UPDATE accounts SET is_active = false WHERE id = $1 RETURNING *',
            [accountId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Compte non trouvé' });
        }
        
        res.json({ message: 'Compte désactivé avec succès' });
    } catch (error) {
        console.error('Erreur désactivation compte:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour obtenir tous les directeurs pour la création de comptes
app.get('/api/users/directors-for-accounts', requireAdminAuth, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT u.id, u.username, u.full_name, 
                   CASE WHEN a.id IS NOT NULL AND a.is_active = true THEN true ELSE false END as has_account
            FROM users u 
            LEFT JOIN accounts a ON u.id = a.user_id AND a.is_active = true
            WHERE u.role = 'directeur'
            ORDER BY u.full_name
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Erreur récupération directeurs pour comptes:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour obtenir les directeurs sans compte
app.get('/api/users/without-account', requireAdminAuth, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT u.id, u.username, u.full_name 
            FROM users u 
            LEFT JOIN accounts a ON u.id = a.user_id 
            WHERE u.role = 'directeur' AND (a.id IS NULL OR a.is_active = false)
            ORDER BY u.full_name
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Erreur récupération utilisateurs sans compte:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Démarrage du serveur
app.listen(PORT, () => {
    console.log(`Serveur démarré sur le port ${PORT}`);
    console.log(`Accédez à l'application sur http://localhost:${PORT}`);
}); 