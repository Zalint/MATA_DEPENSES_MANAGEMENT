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
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
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
    secret: process.env.SESSION_SECRET || 'your-secret-key-here-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: process.env.NODE_ENV === 'production', 
        maxAge: 24 * 60 * 60 * 1000,
        httpOnly: true,
        sameSite: 'strict'
    } // 24 heures
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

// Route pour servir les catégories de configuration
app.get('/api/categories-config', (req, res) => {
    try {
        const categoriesConfig = require('./categories_config.json');
        res.json(categoriesConfig);
    } catch (error) {
        console.error('Erreur lecture categories_config.json:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Routes pour les comptes (remplace les portefeuilles)
app.post('/api/accounts/credit', requireAuth, async (req, res) => {
    try {
        const { account_id, amount, description, credit_date } = req.body;
        const credited_by = req.session.user.id;
        const finalCreditDate = credit_date || new Date().toISOString().split('T')[0];
        
        // Vérifier que le compte existe et est actif
        const accountResult = await pool.query(
            'SELECT a.*, u.full_name as user_name FROM accounts a LEFT JOIN users u ON a.user_id = u.id WHERE a.id = $1 AND a.is_active = true',
            [account_id]
        );
        
        if (accountResult.rows.length === 0) {
            return res.status(404).json({ error: 'Compte non trouvé ou inactif' });
        }
        
        const account = accountResult.rows[0];
        
        await pool.query('BEGIN');
        
        // Utiliser la fonction PostgreSQL pour gérer les crédits selon le type
        const creditResult = await pool.query(
            'SELECT handle_special_credit($1, $2, $3, $4, $5) as success',
            [account_id, credited_by, parseInt(amount), description || 'Crédit de compte', finalCreditDate]
        );
        
        if (!creditResult.rows[0].success) {
            await pool.query('ROLLBACK');
            return res.status(403).json({ error: 'Vous n\'êtes pas autorisé à créditer ce compte' });
        }
        
        // Pour les comptes classiques, aussi enregistrer dans l'ancien historique
        if (account.account_type === 'classique') {
        await pool.query(
            'INSERT INTO credit_history (account_id, credited_by, amount, description) VALUES ($1, $2, $3, $4)',
            [account_id, credited_by, parseInt(amount), description || 'Crédit de compte']
        );
        }
        
        await pool.query('COMMIT');
        
        const message = account.account_type === 'statut' 
            ? 'Compte statut mis à jour avec succès (solde écrasé)' 
            : 'Compte crédité avec succès';
            
        res.json({ message, amount: parseInt(amount), account_type: account.account_type });
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
                amount, description, expense_date, selected_for_invoice
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18) 
            RETURNING *`,
            [
                user_id, account_id, expense_type, category, subcategory, social_network_detail,
                designation, supplier, parseFloat(quantity), parseInt(unit_price), parseInt(total), predictable,
                justificationFilename, justificationPath,
                finalAmount, description, expense_date, false
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
        console.log('Récupération des comptes pour utilisateur:', req.session.user.username, 'Role:', req.session.user.role);
        
        let query = `
            SELECT a.id, a.account_name, a.user_id, a.current_balance, a.total_credited, a.total_spent,
                   a.is_active, a.created_at, a.updated_at, 
                   COALESCE(a.account_type, 'classique') as account_type,
                   a.category_type, a.access_restricted, a.allowed_roles, a.created_by
            FROM accounts a
            WHERE 1=1
        `;
        let params = [];
        
        if (req.session.user.role === 'directeur') {
            // Les directeurs ne voient que LEURS PROPRES comptes actifs uniquement
            query += ' AND a.is_active = true AND a.user_id = $1';
            params.push(req.session.user.id);
        } else if (req.session.user.role === 'directeur_general' || req.session.user.role === 'pca') {
            // Les admins voient tous les comptes (actifs et inactifs)
            // Pas de filtre supplémentaire
        } else {
            // Pour les autres rôles, ne montrer que les comptes actifs non restreints + comptes Ajustement
            query += ' AND a.is_active = true AND (a.access_restricted = false OR a.access_restricted IS NULL OR a.account_type = \'Ajustement\')';
        }
        
        query += ' ORDER BY COALESCE(a.account_type, \'classique\'), a.account_name';
        
        console.log('Requête SQL:', query);
        console.log('Paramètres:', params);
        
        const result = await pool.query(query, params);
        console.log('Comptes trouvés:', result.rows.length);
        
        // Calculer les vrais totaux pour chaque compte et ajouter les informations utilisateur
        const accountsWithDetails = await Promise.all(result.rows.map(async (account) => {
            try {
            // Calculer le total réellement dépensé pour ce compte
            const expensesResult = await pool.query(
                'SELECT COALESCE(SUM(total), 0) as real_total_spent FROM expenses WHERE account_id = $1',
                [account.id]
            );
            
            const realTotalSpent = parseInt(expensesResult.rows[0].real_total_spent) || 0;
            const realCurrentBalance = account.total_credited - realTotalSpent;
                
                // Récupérer les informations utilisateur si nécessaire
                let userInfo = null;
                if (account.user_id) {
                    const userResult = await pool.query(
                        'SELECT username, full_name FROM users WHERE id = $1',
                        [account.user_id]
                    );
                    if (userResult.rows.length > 0) {
                        userInfo = userResult.rows[0];
                    }
                }
                
                // Pour les comptes créance, récupérer les créditeurs
                let creditors = null;
                if (account.account_type === 'creance') {
                    try {
                        const creditorsResult = await pool.query(
                            `SELECT ac.*, u.full_name, u.username, u.role 
                             FROM account_creditors ac 
                             JOIN users u ON ac.user_id = u.id 
                             WHERE ac.account_id = $1`,
                            [account.id]
                        );
                        creditors = creditorsResult.rows;
                    } catch (creditorError) {
                        console.log('Table account_creditors non trouvée, ignorée pour le compte', account.id);
                        creditors = null;
                    }
                }
                
                // Pour les comptes partenaires, récupérer les directeurs assignés
                let partnerDirectors = null;
                if (account.account_type === 'partenaire') {
                    try {
                        const directorsResult = await pool.query(
                            `SELECT pad.user_id, u.username, u.full_name
                             FROM partner_account_directors pad 
                             JOIN users u ON pad.user_id = u.id 
                             WHERE pad.account_id = $1
                             ORDER BY u.username`,
                            [account.id]
                        );
                        partnerDirectors = directorsResult.rows;
                    } catch (directorError) {
                        console.log('Erreur récupération directeurs partenaires pour compte', account.id, ':', directorError.message);
                        partnerDirectors = null;
                    }
                }
            
            return {
                ...account,
                total_spent: realTotalSpent,
                    current_balance: realCurrentBalance,
                    user_name: userInfo ? userInfo.full_name : null,
                    username: userInfo ? userInfo.username : null,
                    creditors: creditors,
                    partner_directors: partnerDirectors
                };
            } catch (accountError) {
                console.error('Erreur traitement compte:', account.id, accountError);
                return {
                    ...account,
                    total_spent: account.total_spent || 0,
                    current_balance: account.current_balance || 0,
                    user_name: null,
                    username: null,
                    creditors: null
                };
            }
        }));
        
        console.log('Comptes avec détails:', accountsWithDetails.length);
        res.json(accountsWithDetails);
    } catch (error) {
        console.error('Erreur récupération comptes:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route spécifique pour les comptes disponibles pour le crédit
app.get('/api/accounts/for-credit', requireAdminAuth, async (req, res) => {
    try {
        const query = `
            SELECT a.id, a.account_name, COALESCE(a.account_type, 'classique') as account_type,
                   a.current_balance, a.total_credited, u.full_name as user_name
            FROM accounts a
            LEFT JOIN users u ON a.user_id = u.id
            WHERE a.is_active = true
            ORDER BY COALESCE(a.account_type, 'classique'), a.account_name
        `;
        
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (error) {
        console.error('Erreur récupération comptes pour crédit:', error);
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
            'SELECT id, username, role, full_name FROM users WHERE role = $1 ORDER BY username',
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

// Route pour les cartes de statistiques du dashboard
app.get('/api/dashboard/stats-cards', requireAuth, async (req, res) => {
    try {
        const { start_date, end_date } = req.query;
        const isDirector = req.session.user.role === 'directeur';
        const userId = req.session.user.id;
        
        // 1. Montant Dépensé Total (période sélectionnée)
        let totalSpentQuery = `
            SELECT COALESCE(SUM(e.total), 0) as total 
            FROM expenses e
        `;
        let spentParams = [];
        
        if (start_date && end_date) {
            totalSpentQuery += ` WHERE e.expense_date >= $1 AND e.expense_date <= $2`;
            spentParams = [start_date, end_date];
        }
        
        if (isDirector) {
            const whereClause = spentParams.length > 0 ? ' AND' : ' WHERE';
            totalSpentQuery += `${whereClause} (e.user_id = $${spentParams.length + 1} OR (EXISTS (
                SELECT 1 FROM accounts a WHERE a.id = e.account_id AND a.user_id = $${spentParams.length + 1}
            ) AND e.user_id IN (SELECT id FROM users WHERE role IN ('directeur_general', 'pca'))))`;
            spentParams.push(userId);
        }
        
        const totalSpentResult = await pool.query(totalSpentQuery, spentParams);
        const totalSpent = parseInt(totalSpentResult.rows[0].total);
        

        
        // 2. Montant Restant Total (soldes actuels de tous les comptes)
        let totalRemainingQuery = `
            SELECT COALESCE(SUM(a.current_balance), 0) as total 
            FROM accounts a 
            WHERE a.is_active = true
        `;
        let remainingParams = [];
        
        if (isDirector) {
            totalRemainingQuery += ` AND a.user_id = $1`;
            remainingParams = [userId];
        }
        
        const totalRemainingResult = await pool.query(totalRemainingQuery, remainingParams);
        const totalRemaining = parseInt(totalRemainingResult.rows[0].total);
        
        // 3. Total Crédité avec Dépenses (comptes qui ont eu des dépenses)
        let creditedWithExpensesQuery = `
            SELECT COALESCE(SUM(DISTINCT a.total_credited), 0) as total 
            FROM accounts a
            WHERE a.is_active = true 
            AND EXISTS (
                SELECT 1 FROM expenses e WHERE e.account_id = a.id
        `;
        let creditedExpensesParams = [];
        
        if (start_date && end_date) {
            creditedWithExpensesQuery += ` AND e.expense_date >= $1 AND e.expense_date <= $2`;
            creditedExpensesParams = [start_date, end_date];
        }
        
        creditedWithExpensesQuery += ')';
        
        if (isDirector) {
            creditedWithExpensesQuery += ` AND a.user_id = $${creditedExpensesParams.length + 1}`;
            creditedExpensesParams.push(userId);
        }
        
        const creditedWithExpensesResult = await pool.query(creditedWithExpensesQuery, creditedExpensesParams);
        const totalCreditedWithExpenses = parseInt(creditedWithExpensesResult.rows[0].total);
        
        // 4. Total Crédité Général (tous les comptes actifs)
        let totalCreditedQuery = `
            SELECT COALESCE(SUM(a.total_credited), 0) as total 
            FROM accounts a 
            WHERE a.is_active = true
        `;
        let creditedParams = [];
        
        if (isDirector) {
            totalCreditedQuery += ` AND a.user_id = $1`;
            creditedParams = [userId];
        }
        
        const totalCreditedResult = await pool.query(totalCreditedQuery, creditedParams);
        const totalCreditedGeneral = parseInt(totalCreditedResult.rows[0].total);
        
        res.json({
            totalSpent,
            totalRemaining,
            totalCreditedWithExpenses,
            totalCreditedGeneral,
            period: {
                start_date: start_date || null,
                end_date: end_date || null
            }
        });
        
    } catch (error) {
        console.error('Erreur récupération cartes statistiques:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour créer le compte Ajustement et associer les dépenses orphelines
app.post('/api/admin/create-adjustment-account', requireAdminAuth, async (req, res) => {
    try {
        console.log('=== CRÉATION DU COMPTE AJUSTEMENT ===');
        
        // Vérifier si le compte existe déjà
        const existingAccount = await pool.query(`
            SELECT id FROM accounts WHERE account_name = 'Ajustement'
        `);
        
        let adjustmentAccountId;
        
        if (existingAccount.rows.length > 0) {
            adjustmentAccountId = existingAccount.rows[0].id;
            console.log('Compte Ajustement existe déjà avec ID:', adjustmentAccountId);
        } else {
            // Créer le compte Ajustement
            const result = await pool.query(`
                INSERT INTO accounts (
                    account_name, 
                    account_type, 
                    user_id, 
                    total_credited, 
                    current_balance, 
                    is_active,
                    created_at
                ) VALUES (
                    'Ajustement', 
                    'Ajustement', 
                    (SELECT id FROM users WHERE role = 'directeur_general' LIMIT 1), 
                    0, 
                    0, 
                    true,
                    NOW()
                ) RETURNING id
            `);
            
            adjustmentAccountId = result.rows[0].id;
            console.log('Compte Ajustement créé avec ID:', adjustmentAccountId);
        }
        
        // Identifier les dépenses orphelines
        const orphanExpenses = await pool.query(`
            SELECT e.id, e.total, e.designation, e.expense_date
            FROM expenses e
            LEFT JOIN accounts a ON e.account_id = a.id
            WHERE a.id IS NULL
        `);
        
        console.log('Dépenses orphelines trouvées:', orphanExpenses.rows.length);
        
        let totalOrphan = 0;
        let updatedCount = 0;
        
        if (orphanExpenses.rows.length > 0) {
            console.log('=== DÉPENSES ORPHELINES ===');
            orphanExpenses.rows.forEach(expense => {
                console.log(`ID: ${expense.id}, Date: ${expense.expense_date}, Montant: ${expense.total} FCFA, Désignation: ${expense.designation}`);
                totalOrphan += parseInt(expense.total);
            });
            console.log(`Total des dépenses orphelines: ${totalOrphan} FCFA`);
            
            // Mettre à jour les dépenses orphelines
            const updateResult = await pool.query(`
                UPDATE expenses 
                SET account_id = $1 
                WHERE account_id NOT IN (SELECT id FROM accounts WHERE id IS NOT NULL)
                   OR account_id IS NULL
            `, [adjustmentAccountId]);
            
            updatedCount = updateResult.rowCount;
            console.log('Dépenses orphelines mises à jour:', updatedCount);
            
            // Mettre à jour le solde du compte Ajustement
            await pool.query(`
                UPDATE accounts 
                SET current_balance = current_balance - $1,
                    total_credited = total_credited + $1
                WHERE id = $2
            `, [totalOrphan, adjustmentAccountId]);
            
            console.log(`Solde du compte Ajustement mis à jour: -${totalOrphan} FCFA`);
        }
        
        // Vérification finale
        const checkResult = await pool.query(`
            SELECT COUNT(*) as count, COALESCE(SUM(total), 0) as total_amount
            FROM expenses 
            WHERE account_id = $1
        `, [adjustmentAccountId]);
        
        console.log('=== VÉRIFICATION FINALE ===');
        console.log('Nombre de dépenses dans le compte Ajustement:', checkResult.rows[0].count);
        console.log('Montant total dans le compte Ajustement:', checkResult.rows[0].total_amount, 'FCFA');
        
        res.json({
            success: true,
            message: 'Compte Ajustement créé avec succès',
            accountId: adjustmentAccountId,
            orphanExpensesFound: orphanExpenses.rows.length,
            orphanExpensesUpdated: updatedCount,
            totalOrphanAmount: totalOrphan,
            finalExpenseCount: parseInt(checkResult.rows[0].count),
            finalTotalAmount: parseInt(checkResult.rows[0].total_amount)
        });
        
    } catch (error) {
        console.error('Erreur création compte Ajustement:', error);
        res.status(500).json({ error: 'Erreur serveur lors de la création du compte Ajustement' });
    }
});

// Route pour ajouter une dépense d'ajustement (DG/PCA uniquement)
app.post('/api/admin/adjustment-expense', requireAdminAuth, async (req, res) => {
    try {
        const { adjustment_date, adjustment_amount, adjustment_comment } = req.body;
        
        // Validation des données
        if (!adjustment_date || !adjustment_amount || !adjustment_comment) {
            return res.status(400).json({ error: 'Tous les champs sont obligatoires' });
        }
        
        if (adjustment_amount <= 0) {
            return res.status(400).json({ error: 'Le montant doit être positif' });
        }
        
        // Vérifier si le compte Ajustement existe
        let adjustmentAccount = await pool.query(`
            SELECT id FROM accounts WHERE account_name = 'Ajustement'
        `);
        
        if (adjustmentAccount.rows.length === 0) {
            // Créer le compte Ajustement s'il n'existe pas
            const createAccountResult = await pool.query(`
                INSERT INTO accounts (
                    account_name, 
                    account_type, 
                    user_id, 
                    total_credited, 
                    current_balance, 
                    is_active,
                    created_at
                ) VALUES (
                    'Ajustement', 
                    'Ajustement', 
                    $1, 
                    0, 
                    0, 
                    true,
                    NOW()
                ) RETURNING id
            `, [req.session.user.id]);
            
            adjustmentAccount = createAccountResult;
        }
        
        const accountId = adjustmentAccount.rows[0].id;
        
        // Créer la dépense d'ajustement
        const result = await pool.query(`
            INSERT INTO expenses (
                account_id, expense_type, category, subcategory, designation, 
                supplier, quantity, unit_price, total, predictable, 
                amount, description, expense_date, user_id, created_at, selected_for_invoice
            ) VALUES (
                $1, 'Ajustement', 'Ajustement Comptable', 'Correction', 'Ajustement comptable',
                'Système', 1, $2, $2, 'Non',
                $2, $3, $4, $5, NOW(), $6
            ) RETURNING id
        `, [accountId, adjustment_amount, adjustment_comment, adjustment_date, req.session.user.id, false]);
        
        // Mettre à jour le solde du compte Ajustement
        await pool.query(`
            UPDATE accounts 
            SET current_balance = current_balance - $1
            WHERE id = $2
        `, [adjustment_amount, accountId]);
        
        console.log(`Ajustement créé: ${adjustment_amount} FCFA - ${adjustment_comment}`);
        
        res.json({
            success: true,
            message: 'Ajustement comptable créé avec succès',
            expenseId: result.rows[0].id,
            amount: adjustment_amount,
            comment: adjustment_comment
        });
        
    } catch (error) {
        console.error('Erreur création ajustement:', error);
        res.status(500).json({ error: 'Erreur serveur lors de la création de l\'ajustement' });
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
            return res.status(400).json({ error: 'Aucune dépense sélectionnée pour la génération de factures. Veuillez cocher les dépenses que vous souhaitez inclure dans le PDF.' });
        }
        
        // Séparer les dépenses avec et sans justificatifs
        const expensesWithJustification = [];
        const expensesWithoutJustification = [];
        
        result.rows.forEach(expense => {
            if (expense.justification_filename && expense.justification_filename.trim() !== '') {
                expensesWithJustification.push(expense);
            } else {
                expensesWithoutJustification.push(expense);
            }
        });
        
        // Créer un PDF combiné avec TOUS les éléments (justificatifs + templates MATA)
        if (expensesWithJustification.length > 0 || expensesWithoutJustification.length > 0) {
            const doc = new PDFDocument({ 
                margin: 0,
                size: 'A4'
            });
            
        res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="factures_completes_${new Date().toISOString().split('T')[0]}.pdf"`);
        
        doc.pipe(res);
        
            let isFirstPage = true;
            
            // PARTIE 1: Ajouter tous les justificatifs (pièces jointes)
            for (const expense of expensesWithJustification) {
                // Utiliser le chemin complet stocké dans justification_path
                let justificationPath;
                if (expense.justification_path) {
                    // Normaliser le chemin pour Windows/Linux
                    const normalizedPath = expense.justification_path.replace(/\\/g, '/');
                    justificationPath = path.join(__dirname, normalizedPath);
                } else {
                    justificationPath = path.join(__dirname, 'uploads', expense.justification_filename);
                }
                
                console.log(`Ajout justificatif: ${justificationPath}`);
                
                if (fs.existsSync(justificationPath)) {
                    try {
                        if (!isFirstPage) {
                doc.addPage();
            }
            
                        // Déterminer le type de fichier à partir du nom original
                        const fileExtension = path.extname(expense.justification_filename).toLowerCase();
                        
                        if (['.jpg', '.jpeg', '.png'].includes(fileExtension)) {
                            // Image - l'ajouter directement
                            doc.image(justificationPath, 0, 0, { 
                                fit: [doc.page.width, doc.page.height],
                                align: 'center',
                                valign: 'center'
                            });
                        } else if (fileExtension === '.pdf') {
                            // PDF - ajouter une note indiquant qu'il faut voir le fichier séparément
                            doc.fontSize(16).fillColor('black').text(
                                `Justificatif PDF pour la dépense #${expense.id}`, 
                                50, 100, { width: doc.page.width - 100 }
                            );
                            doc.fontSize(12).text(
                                `Désignation: ${expense.designation || 'N/A'}`, 
                                50, 150
                            );
                            doc.text(
                                `Montant: ${(expense.total || expense.amount || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} FCFA`, 
                                50, 170
                            );
                            doc.text(
                                `Fichier: ${expense.justification_filename}`, 
                                50, 190
                            );
                            doc.text(
                                'Note: Le justificatif PDF original doit être consulté séparément.', 
                                50, 220, { width: doc.page.width - 100 }
                            );
                        } else {
                            // Autres types de fichiers - ajouter une note
                            doc.fontSize(16).fillColor('black').text(
                                `Justificatif pour la dépense #${expense.id}`, 
                                50, 100, { width: doc.page.width - 100 }
                            );
                            doc.fontSize(12).text(
                                `Désignation: ${expense.designation || 'N/A'}`, 
                                50, 150
                            );
                            doc.text(
                                `Montant: ${(expense.total || expense.amount || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} FCFA`, 
                                50, 170
                            );
                            doc.text(
                                `Type de fichier: ${fileExtension.toUpperCase()}`, 
                                50, 190
                            );
                            doc.text(
                                `Fichier: ${expense.justification_filename}`, 
                                50, 210
                            );
                            doc.text(
                                'Note: Ce type de fichier ne peut pas être affiché dans le PDF. Consultez le fichier original.', 
                                50, 240, { width: doc.page.width - 100 }
                            );
                        }
                        
                        isFirstPage = false;
                    } catch (error) {
                        console.error('Erreur lors de l\'ajout du justificatif:', error);
                        // Ajouter une page d'erreur
                        if (!isFirstPage) {
                            doc.addPage();
                        }
                        doc.fontSize(16).fillColor('red').text(
                            `Erreur: Impossible de charger le justificatif pour la dépense #${expense.id}`, 
                            50, 100, { width: doc.page.width - 100 }
                        );
                        isFirstPage = false;
                    }
                } else {
                    // Fichier justificatif non trouvé
                    if (!isFirstPage) {
                        doc.addPage();
                    }
                    doc.fontSize(16).fillColor('orange').text(
                        `Attention: Justificatif non trouvé pour la dépense #${expense.id}`, 
                        50, 100, { width: doc.page.width - 100 }
                    );
                    doc.fontSize(12).text(
                        `Fichier attendu: ${expense.justification_filename}`, 
                        50, 150
                    );
                    doc.text(
                        `Chemin: ${expense.justification_path}`, 
                        50, 170
                    );
                    isFirstPage = false;
                }
            }
            
            // PARTIE 2: Ajouter les templates MATA pour les dépenses sans justificatifs
            expensesWithoutJustification.forEach((expense, index) => {
                if (!isFirstPage || index > 0) {
                    doc.addPage();
                }
                
                // === EN-TÊTE MATA ===
                doc.fontSize(24).font('Helvetica-Bold').fillColor('#1e3a8a').text('MATA', 50, 50);
                
                doc.fontSize(9).font('Helvetica').fillColor('black');
                doc.text('Mirage, Apt Nord 603D, Résidence Aquanique', 50, 80);
                doc.text('A : 01387695 2Y3 / RC : SN DKR 2024 B 29149', 50, 95);
                doc.text('Ouest foire : 78 480 95 95', 50, 110);
                doc.text('Grand Mbao / cité Aliou Sow : 77 858 96 96', 50, 125);
                
                doc.fontSize(16).font('Helvetica-Bold').fillColor('#1e3a8a').text('FACTURE', 275, 55);
                
                doc.fontSize(10).font('Helvetica').fillColor('black');
                const currentDate = new Date().toLocaleDateString('fr-FR');
                doc.text(`Date : ${currentDate}`, 450, 50);
                doc.fontSize(12).font('Helvetica-Bold').fillColor('#dc2626');
                doc.text(`N° : ${expense.id.toString().padStart(8, '0')}`, 450, 70);
                
                doc.moveTo(50, 160).lineTo(545, 160).stroke('#1e3a8a').lineWidth(1);
                
                let yPos = 180;
                doc.fontSize(14).font('Helvetica-Bold').fillColor('black');
                doc.text('Dépenses', 50, yPos);
                yPos += 30;
                
                // Tableau
                const tableStartY = yPos;
                const colPositions = [50, 110, 330, 430];
                
                doc.rect(50, tableStartY, 495, 25).fill('#1e3a8a');
                doc.fontSize(11).font('Helvetica-Bold').fillColor('white');
                doc.text('QUANTITÉ', colPositions[0] + 5, tableStartY + 8);
                doc.text('DÉSIGNATION', colPositions[1] + 5, tableStartY + 8);
                doc.text('P. UNITAIRE', colPositions[2] + 5, tableStartY + 8);
                doc.text('PRIX TOTAL', colPositions[3] + 5, tableStartY + 8);
                
                yPos = tableStartY + 25;
                
                doc.rect(50, yPos, 495, 30).fill('#f8f9fa').stroke('#dee2e6');
                doc.fontSize(10).font('Helvetica').fillColor('black');
                
                const quantity = expense.quantity || '1.00';
                doc.text(quantity, colPositions[0] + 5, yPos + 10);
                
                let designation = expense.designation || 'Dépense';
                if (expense.subcategory) {
                    designation = expense.subcategory;
                }
                doc.text(designation, colPositions[1] + 5, yPos + 10, { width: 200, height: 20 });
                
                const unitPrice = expense.unit_price || expense.total || expense.amount || 0;
                const formattedUnitPrice = unitPrice.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
                doc.text(formattedUnitPrice, colPositions[2] + 5, yPos + 10);
                
                const total = expense.total || expense.amount || 0;
                const formattedTotal = total.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
                doc.text(formattedTotal, colPositions[3] + 5, yPos + 10);
                
                yPos += 30;
                
                // Lignes vides
                for (let i = 0; i < 6; i++) {
                    doc.rect(50, yPos, 495, 25).stroke('#dee2e6');
                    yPos += 25;
                }
                
                // Montant total
                doc.rect(50, yPos, 495, 3).fill('#1e3a8a');
                yPos += 10;
                
                doc.rect(50, yPos, 360, 30).fill('#1e3a8a');
                doc.fontSize(14).font('Helvetica-Bold').fillColor('white');
                doc.text('MONTANT TOTAL', 60, yPos + 10);
                
                doc.rect(410, yPos, 135, 30).stroke('#1e3a8a').lineWidth(2);
                doc.fontSize(16).font('Helvetica-Bold').fillColor('#1e3a8a');
                const finalTotal = total.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
                doc.text(`${finalTotal} F`, 420, yPos + 8);
                
                yPos += 60;
                
                doc.fontSize(10).font('Helvetica').fillColor('black');
                doc.text(`Dépense effectuée par : ${expense.user_name || expense.username}`, 50, yPos);
                yPos += 15;
                
                if (expense.supplier) {
                    doc.text(`Fournisseur : ${expense.supplier}`, 50, yPos);
                    yPos += 15;
                }
                
            if (expense.description && expense.description.trim() !== '') {
                    doc.text('Description :', 50, yPos);
                    yPos += 12;
                    doc.text(expense.description, 50, yPos, { width: 450 });
                }
                
                // Cachet MATA
            const cachetPath = path.join(__dirname, 'public', 'images', 'CachetMata.jpg');
            if (fs.existsSync(cachetPath)) {
                try {
                        doc.image(cachetPath, 400, doc.page.height - 180, { width: 120, height: 120 });
                } catch (error) {
                        doc.fontSize(12).font('Helvetica-Bold').fillColor('#1e3a8a');
                        doc.text('CACHET MATA', 450, doc.page.height - 100);
                }
                } else {
                    doc.rect(400, doc.page.height - 180, 120, 120).stroke('#1e3a8a').lineWidth(2);
                    doc.fontSize(10).font('Helvetica-Bold').fillColor('#1e3a8a');
                    doc.text('CACHET\nMATA', 440, doc.page.height - 130, { align: 'center' });
            }
                
                isFirstPage = false;
        });
        
        doc.end();
        } else {
            return res.status(400).json({ error: 'Aucune dépense à traiter' });
        }
        
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
        
        // Vérifier la restriction de 48 heures pour les directeurs réguliers
        if (req.session.user.role === 'directeur') {
            const expenseCreatedAt = new Date(existingExpense.rows[0].created_at);
            const now = new Date();
            const hoursDifference = (now - expenseCreatedAt) / (1000 * 60 * 60);
            
            if (hoursDifference > 48) {
                return res.status(403).json({ 
                    error: `Modification non autorisée. Cette dépense a été créée il y a ${Math.floor(hoursDifference)} heures. Les directeurs ne peuvent modifier une dépense que dans les 48 heures suivant sa création.` 
                });
            }
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
        const { user_id, account_name, initial_amount, description, account_type, creditors, category_type } = req.body;
        const created_by = req.session.user.id;
        
        // Validation du type de compte
        const validTypes = ['classique', 'creance', 'fournisseur', 'partenaire', 'statut', 'Ajustement'];
        if (account_type && !validTypes.includes(account_type)) {
            return res.status(400).json({ error: 'Type de compte invalide' });
        }
        
        const finalAccountType = account_type || 'classique';
        
        // Pour les comptes spéciaux (sauf créance), user_id peut être null
        if (finalAccountType === 'classique' || finalAccountType === 'creance') {
        // Vérifier que l'utilisateur existe et est un directeur
        const userResult = await pool.query(
            'SELECT * FROM users WHERE id = $1 AND role = $2',
            [user_id, 'directeur']
        );
        
        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'Directeur non trouvé' });
            }
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
        
        // Créer le compte avec le type spécifié
        const accountResult = await pool.query(
            `INSERT INTO accounts (user_id, account_name, current_balance, total_credited, total_spent, created_by, account_type, access_restricted, allowed_roles, category_type) 
             VALUES ($1, $2, $3, $4, 0, $5, $6, $7, $8, $9) RETURNING *`,
            [
                finalAccountType === 'fournisseur' || finalAccountType === 'partenaire' || finalAccountType === 'statut' || finalAccountType === 'Ajustement' ? null : user_id,
                account_name, 
                parseInt(initial_amount) || 0, 
                parseInt(initial_amount) || 0, 
                created_by,
                finalAccountType,
                finalAccountType === 'fournisseur' || finalAccountType === 'Ajustement', // access_restricted pour fournisseur et Ajustement
                finalAccountType === 'fournisseur' || finalAccountType === 'Ajustement' ? ['directeur_general', 'pca'] : null,
                finalAccountType === 'classique' ? category_type : null
            ]
        );
        
        // Pour les comptes créance, ajouter les créditeurs
        if (finalAccountType === 'creance' && creditors && creditors.length > 0) {
            for (const creditor of creditors) {
                await pool.query(
                    'INSERT INTO account_creditors (account_id, user_id, creditor_type) VALUES ($1, $2, $3)',
                    [accountResult.rows[0].id, creditor.user_id, creditor.type]
                );
            }
        }
        
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

// Route pour désactiver un compte
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

// Route pour supprimer définitivement un compte (seulement si aucune dépense)
app.delete('/api/accounts/:accountId/delete', requireAdminAuth, async (req, res) => {
    try {
        const { accountId } = req.params;
        
        // Vérifier d'abord si le compte a des dépenses
        const expenseCheck = await pool.query(
            'SELECT COUNT(*) as count FROM expenses WHERE account_id = $1',
            [accountId]
        );
        
        if (parseInt(expenseCheck.rows[0].count) > 0) {
            return res.status(400).json({ error: 'Impossible de supprimer un compte avec des dépenses' });
        }
        
        await pool.query('BEGIN');
        
        // Supprimer les enregistrements liés
        await pool.query('DELETE FROM account_creditors WHERE account_id = $1', [accountId]);
        await pool.query('DELETE FROM partner_account_directors WHERE account_id = $1', [accountId]);
        await pool.query('DELETE FROM special_credit_history WHERE account_id = $1', [accountId]);
        await pool.query('DELETE FROM credit_history WHERE account_id = $1', [accountId]);
        
        // Supprimer le compte
        const result = await pool.query(
            'DELETE FROM accounts WHERE id = $1 RETURNING account_name',
            [accountId]
        );
        
        if (result.rows.length === 0) {
            await pool.query('ROLLBACK');
            return res.status(404).json({ error: 'Compte non trouvé' });
        }
        
        await pool.query('COMMIT');
        
        res.json({ message: `Compte "${result.rows[0].account_name}" supprimé définitivement` });
    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('Erreur suppression compte:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour modifier un compte
app.put('/api/accounts/:accountId/update', requireAdminAuth, async (req, res) => {
    try {
        const { accountId } = req.params;
        const { user_id, account_name, description, account_type, category_type, creditors } = req.body;
        
        await pool.query('BEGIN');
        
        // Mettre à jour les informations de base du compte
        const updateResult = await pool.query(
            `UPDATE accounts 
             SET user_id = $1, account_name = $2, description = $3, account_type = $4, category_type = $5
             WHERE id = $6 RETURNING *`,
            [user_id, account_name, description, account_type, category_type, accountId]
        );
        
        if (updateResult.rows.length === 0) {
            await pool.query('ROLLBACK');
            return res.status(404).json({ error: 'Compte non trouvé' });
        }
        
        // Gérer les créditeurs pour les comptes créance
        if (account_type === 'creance' && creditors) {
            // Supprimer les anciens créditeurs
            await pool.query('DELETE FROM account_creditors WHERE account_id = $1', [accountId]);
            
            // Ajouter les nouveaux créditeurs
            for (const creditor of creditors) {
                await pool.query(
                    'INSERT INTO account_creditors (account_id, user_id, creditor_type) VALUES ($1, $2, $3)',
                    [accountId, creditor.user_id, creditor.type]
                );
            }
        } else if (account_type !== 'creance') {
            // Supprimer les créditeurs si le type n'est plus créance
            await pool.query('DELETE FROM account_creditors WHERE account_id = $1', [accountId]);
        }
        
        await pool.query('COMMIT');
        
        res.json({ message: 'Compte modifié avec succès', account: updateResult.rows[0] });
    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('Erreur modification compte:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour activer un compte
app.put('/api/accounts/:accountId/activate', requireAdminAuth, async (req, res) => {
    try {
        const { accountId } = req.params;
        
        const result = await pool.query(
            'UPDATE accounts SET is_active = true WHERE id = $1 RETURNING *',
            [accountId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Compte non trouvé' });
        }
        
        res.json({ message: 'Compte activé avec succès' });
    } catch (error) {
        console.error('Erreur activation compte:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour obtenir tous les directeurs pour la création de comptes
app.get('/api/users/directors-for-accounts', requireAdminAuth, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT DISTINCT u.id, u.username, u.full_name, 
                   CASE WHEN EXISTS(SELECT 1 FROM accounts WHERE user_id = u.id AND is_active = true) 
                        THEN true ELSE false END as has_account
            FROM users u 
            WHERE u.role = 'directeur'
            ORDER BY u.username
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
            ORDER BY u.username
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Erreur récupération utilisateurs sans compte:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour obtenir les types de comptes disponibles
app.get('/api/accounts/types', requireAuth, (req, res) => {
    const accountTypes = [
        { id: 'classique', name: 'Compte Classique', description: 'Compte standard assigné à un directeur' },
        { id: 'creance', name: 'Compte Créance', description: 'Compte avec créditeurs multiples (DG + directeur assigné)' },
        { id: 'fournisseur', name: 'Compte Fournisseur', description: 'Compte accessible uniquement au DG/PCA' },
        { id: 'partenaire', name: 'Compte Partenaire', description: 'Compte accessible à tous' },
        { id: 'statut', name: 'Compte Statut', description: 'Compte où le crédit écrase le solde existant' },
        { id: 'Ajustement', name: 'Compte Ajustement', description: 'Compte spécial pour les ajustements comptables (DG/PCA uniquement)' }
    ];
    res.json(accountTypes);
});

// Route pour obtenir l'historique des crédits spéciaux
app.get('/api/accounts/:accountId/special-history', requireAuth, async (req, res) => {
    try {
        const { accountId } = req.params;
        
        const result = await pool.query(`
            SELECT sch.*, u.full_name as credited_by_name
            FROM special_credit_history sch
            JOIN users u ON sch.credited_by = u.id
            WHERE sch.account_id = $1
            ORDER BY sch.created_at DESC
        `, [accountId]);
        
        res.json(result.rows);
    } catch (error) {
        console.error('Erreur récupération historique spécial:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour ajouter/modifier les créditeurs d'un compte créance
app.post('/api/accounts/:accountId/creditors', requireAdminAuth, async (req, res) => {
    try {
        const { accountId } = req.params;
        const { creditors } = req.body;
        
        // Vérifier que le compte est de type créance
        const accountResult = await pool.query(
            'SELECT * FROM accounts WHERE id = $1 AND account_type = $2 AND is_active = true',
            [accountId, 'creance']
        );
        
        if (accountResult.rows.length === 0) {
            return res.status(404).json({ error: 'Compte créance non trouvé' });
        }
        
        await pool.query('BEGIN');
        
        // Supprimer les anciens créditeurs
        await pool.query('DELETE FROM account_creditors WHERE account_id = $1', [accountId]);
        
        // Ajouter les nouveaux créditeurs
        if (creditors && creditors.length > 0) {
            for (const creditor of creditors) {
                await pool.query(
                    'INSERT INTO account_creditors (account_id, user_id, creditor_type) VALUES ($1, $2, $3)',
                    [accountId, creditor.user_id, creditor.type]
                );
            }
        }
        
        await pool.query('COMMIT');
        
        res.json({ message: 'Créditeurs mis à jour avec succès' });
    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('Erreur mise à jour créditeurs:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour vérifier si un utilisateur peut créditer un compte spécifique
app.get('/api/accounts/:accountId/can-credit', requireAuth, async (req, res) => {
    try {
        const { accountId } = req.params;
        const userId = req.session.user.id;
        const userRole = req.session.user.role;
        
        const accountResult = await pool.query(
            'SELECT account_type FROM accounts WHERE id = $1 AND is_active = true',
            [accountId]
        );
        
        if (accountResult.rows.length === 0) {
            return res.json({ canCredit: false, reason: 'Compte non trouvé' });
        }
        
        const accountType = accountResult.rows[0].account_type;
        let canCredit = false;
        let reason = '';
        
        switch (accountType) {
            case 'classique':
            case 'fournisseur':
            case 'statut':
            case 'Ajustement':
                canCredit = userRole === 'directeur_general' || userRole === 'pca';
                reason = canCredit ? '' : 'Seuls le DG et le PCA peuvent créditer ce type de compte';
                break;
                
            case 'creance':
                if (userRole === 'directeur_general') {
                    canCredit = true;
                } else {
                    const creditorResult = await pool.query(
                        'SELECT 1 FROM account_creditors WHERE account_id = $1 AND user_id = $2',
                        [accountId, userId]
                    );
                    canCredit = creditorResult.rows.length > 0;
                    reason = canCredit ? '' : 'Vous n\'êtes pas autorisé à créditer ce compte créance';
                }
                break;
                
            case 'partenaire':
                canCredit = true;
                break;
                
            default:
                canCredit = false;
                reason = 'Type de compte non reconnu';
        }
        
        res.json({ canCredit, reason, accountType });
    } catch (error) {
        console.error('Erreur vérification crédit:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// === ROUTES POUR LES COMPTES PARTENAIRES ===

// Route pour obtenir le résumé des livraisons partenaires
app.get('/api/partner/delivery-summary', requireAuth, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT * FROM partner_delivery_summary
            ORDER BY account_name
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Erreur récupération résumé livraisons:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour obtenir les livraisons d'un compte partenaire
app.get('/api/partner/:accountId/deliveries', requireAuth, async (req, res) => {
    try {
        const { accountId } = req.params;
        
        const result = await pool.query(`
            SELECT pd.*, 
                   u.full_name as created_by_name, 
                   uv.full_name as validated_by_name,
                   ufv.full_name as first_validated_by_name,
                   ur.full_name as rejected_by_name
            FROM partner_deliveries pd
            JOIN users u ON pd.created_by = u.id
            LEFT JOIN users uv ON pd.validated_by = uv.id
            LEFT JOIN users ufv ON pd.first_validated_by = ufv.id
            LEFT JOIN users ur ON pd.rejected_by = ur.id
            WHERE pd.account_id = $1
            ORDER BY pd.delivery_date DESC, pd.created_at DESC
        `, [accountId]);
        
        res.json(result.rows);
    } catch (error) {
        console.error('Erreur récupération livraisons:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour ajouter une livraison partenaire
app.post('/api/partner/:accountId/deliveries', requireAuth, async (req, res) => {
    try {
        const { accountId } = req.params;
        const { delivery_date, article_count, amount, description } = req.body;
        const created_by = req.session.user.id;
        
        // Vérifier que le compte est de type partenaire
        const accountResult = await pool.query(
            'SELECT * FROM accounts WHERE id = $1 AND account_type = $2 AND is_active = true',
            [accountId, 'partenaire']
        );
        
        if (accountResult.rows.length === 0) {
            return res.status(404).json({ error: 'Compte partenaire non trouvé' });
        }
        
        // Vérifier les permissions (DG ou directeurs assignés)
        const userRole = req.session.user.role;
        let isAuthorized = userRole === 'directeur_general';
        
        if (!isAuthorized && userRole === 'directeur') {
            const directorResult = await pool.query(
                'SELECT 1 FROM partner_account_directors WHERE account_id = $1 AND user_id = $2',
                [accountId, created_by]
            );
            isAuthorized = directorResult.rows.length > 0;
        }
        
        if (!isAuthorized) {
            return res.status(403).json({ error: 'Vous n\'êtes pas autorisé à ajouter des livraisons à ce compte' });
        }
        
        const result = await pool.query(`
            INSERT INTO partner_deliveries (account_id, delivery_date, article_count, amount, description, created_by)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
        `, [accountId, delivery_date, parseInt(article_count), parseInt(amount), description, created_by]);
        
        res.json({ 
            message: 'Livraison ajoutée avec succès (en attente de validation)', 
            delivery: result.rows[0] 
        });
    } catch (error) {
        console.error('Erreur ajout livraison:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour première validation d'une livraison partenaire
app.post('/api/partner/deliveries/:deliveryId/first-validate', requireAuth, async (req, res) => {
    try {
        const { deliveryId } = req.params;
        const validated_by = req.session.user.id;
        const userRole = req.session.user.role;
        
        // Récupérer les informations de la livraison
        const deliveryResult = await pool.query(
            'SELECT account_id, validation_status, first_validated_by FROM partner_deliveries WHERE id = $1',
            [deliveryId]
        );
        
        if (deliveryResult.rows.length === 0) {
            return res.status(404).json({ error: 'Livraison non trouvée' });
        }
        
        const delivery = deliveryResult.rows[0];
        const accountId = delivery.account_id;
        
        // Vérifier que la livraison est en statut pending
        if (delivery.validation_status !== 'pending') {
            return res.status(400).json({ error: 'Cette livraison a déjà été traitée' });
        }
        
        // Vérifier les autorisations
        let canValidate = false;
        
        if (userRole === 'directeur_general') {
            canValidate = true;
        } else if (userRole === 'directeur') {
            const directorResult = await pool.query(
                'SELECT 1 FROM partner_account_directors WHERE account_id = $1 AND user_id = $2',
                [accountId, validated_by]
            );
            canValidate = directorResult.rows.length > 0;
        }
        
        if (!canValidate) {
            return res.status(403).json({ error: 'Vous n\'êtes pas autorisé à valider cette livraison' });
        }
        
        // Première validation
        await pool.query(
            'UPDATE partner_deliveries SET validation_status = $1, first_validated_by = $2, first_validated_at = CURRENT_TIMESTAMP WHERE id = $3',
            ['first_validated', validated_by, deliveryId]
        );
        
        res.json({ message: 'Première validation effectuée. En attente de la seconde validation.' });
        
    } catch (error) {
        console.error('Erreur première validation:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour validation finale d'une livraison partenaire
app.post('/api/partner/deliveries/:deliveryId/final-validate', requireAuth, async (req, res) => {
    try {
        const { deliveryId } = req.params;
        const validated_by = req.session.user.id;
        const userRole = req.session.user.role;
        
        // Récupérer les informations de la livraison
        const deliveryResult = await pool.query(
            'SELECT account_id, validation_status, first_validated_by, amount FROM partner_deliveries WHERE id = $1',
            [deliveryId]
        );
        
        if (deliveryResult.rows.length === 0) {
            return res.status(404).json({ error: 'Livraison non trouvée' });
        }
        
        const delivery = deliveryResult.rows[0];
        const accountId = delivery.account_id;
        
        // Vérifier que la livraison est en première validation
        if (delivery.validation_status !== 'first_validated') {
            return res.status(400).json({ error: 'Cette livraison doit d\'abord recevoir une première validation' });
        }
        
        // Vérifier que ce n'est pas le même directeur
        if (delivery.first_validated_by === validated_by) {
            return res.status(400).json({ error: 'Vous ne pouvez pas faire la seconde validation de votre propre première validation' });
        }
        
        // Vérifier les autorisations
        let canValidate = false;
        
        if (userRole === 'directeur_general') {
            canValidate = true;
        } else if (userRole === 'directeur') {
            const directorResult = await pool.query(
                'SELECT 1 FROM partner_account_directors WHERE account_id = $1 AND user_id = $2',
                [accountId, validated_by]
            );
            canValidate = directorResult.rows.length > 0;
        }
        
        if (!canValidate) {
            return res.status(403).json({ error: 'Vous n\'êtes pas autorisé à valider cette livraison' });
        }
        
        await pool.query('BEGIN');
        
        // Validation finale
        await pool.query(
            'UPDATE partner_deliveries SET validation_status = $1, validated_by = $2, validated_at = CURRENT_TIMESTAMP, is_validated = true WHERE id = $3',
            ['fully_validated', validated_by, deliveryId]
        );
        
        // Déduire le montant du solde du compte
        await pool.query(
            'UPDATE accounts SET current_balance = current_balance - $1, total_spent = total_spent + $1 WHERE id = $2',
            [delivery.amount, delivery.account_id]
        );
        
        await pool.query('COMMIT');
        
        res.json({ message: 'Livraison validée définitivement. Montant déduit du compte.' });
        
    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('Erreur validation finale:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour rejeter une livraison partenaire
app.post('/api/partner/deliveries/:deliveryId/reject', requireAuth, async (req, res) => {
    try {
        const { deliveryId } = req.params;
        const { comment } = req.body;
        const rejected_by = req.session.user.id;
        const userRole = req.session.user.role;
        
        if (!comment || comment.trim() === '') {
            return res.status(400).json({ error: 'Un commentaire de refus est obligatoire' });
        }
        
        // Récupérer les informations de la livraison
        const deliveryResult = await pool.query(
            'SELECT account_id, validation_status, first_validated_by FROM partner_deliveries WHERE id = $1',
            [deliveryId]
        );
        
        if (deliveryResult.rows.length === 0) {
            return res.status(404).json({ error: 'Livraison non trouvée' });
        }
        
        const delivery = deliveryResult.rows[0];
        const accountId = delivery.account_id;
        
        // Vérifier que la livraison est en première validation
        if (delivery.validation_status !== 'first_validated') {
            return res.status(400).json({ error: 'Cette livraison doit être en première validation pour être rejetée' });
        }
        
        // Vérifier que ce n'est pas le même directeur
        if (delivery.first_validated_by === rejected_by) {
            return res.status(400).json({ error: 'Vous ne pouvez pas rejeter votre propre validation' });
        }
        
        // Vérifier les autorisations
        let canReject = false;
        
        if (userRole === 'directeur_general') {
            canReject = true;
        } else if (userRole === 'directeur') {
            const directorResult = await pool.query(
                'SELECT 1 FROM partner_account_directors WHERE account_id = $1 AND user_id = $2',
                [accountId, rejected_by]
            );
            canReject = directorResult.rows.length > 0;
        }
        
        if (!canReject) {
            return res.status(403).json({ error: 'Vous n\'êtes pas autorisé à rejeter cette livraison' });
        }
        
        // Rejeter la livraison
        await pool.query(
            'UPDATE partner_deliveries SET validation_status = $1, rejected_by = $2, rejected_at = CURRENT_TIMESTAMP, rejection_comment = $3 WHERE id = $4',
            ['rejected', rejected_by, comment, deliveryId]
        );
        
        res.json({ message: 'Livraison rejetée. Elle peut maintenant être modifiée.' });
        
    } catch (error) {
        console.error('Erreur rejet livraison:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour valider une livraison partenaire (ancienne, à supprimer)
app.post('/api/partner/deliveries/:deliveryId/validate', requireAuth, async (req, res) => {
    try {
        const { deliveryId } = req.params;
        const validated_by = req.session.user.id;
        const userRole = req.session.user.role;
        
        // Récupérer les informations de la livraison
        const deliveryResult = await pool.query(
            'SELECT account_id FROM partner_deliveries WHERE id = $1',
            [deliveryId]
        );
        
        if (deliveryResult.rows.length === 0) {
            return res.status(404).json({ error: 'Livraison non trouvée' });
        }
        
        const accountId = deliveryResult.rows[0].account_id;
        
        // Vérifier les autorisations
        let canValidate = false;
        
        if (userRole === 'directeur_general') {
            canValidate = true;
        } else if (userRole === 'directeur') {
            // Vérifier si le directeur est assigné à ce compte partenaire
            const directorResult = await pool.query(
                'SELECT 1 FROM partner_account_directors WHERE account_id = $1 AND user_id = $2',
                [accountId, validated_by]
            );
            canValidate = directorResult.rows.length > 0;
        }
        
        if (!canValidate) {
            return res.status(403).json({ error: 'Vous n\'êtes pas autorisé à valider cette livraison' });
        }
        
        // Utiliser une validation personnalisée au lieu de la fonction PostgreSQL
        await pool.query('BEGIN');
        
        // Récupérer les détails de la livraison
        const deliveryDetails = await pool.query(
            'SELECT * FROM partner_deliveries WHERE id = $1 AND is_validated = false',
            [deliveryId]
        );
        
        if (deliveryDetails.rows.length === 0) {
            await pool.query('ROLLBACK');
            return res.status(400).json({ error: 'Livraison déjà validée ou non trouvée' });
        }
        
        const delivery = deliveryDetails.rows[0];
        
        // Valider la livraison
        await pool.query(
            'UPDATE partner_deliveries SET is_validated = true, validated_by = $1, validated_at = CURRENT_TIMESTAMP WHERE id = $2',
            [validated_by, deliveryId]
        );
        
        // Déduire le montant du solde du compte
        await pool.query(
            'UPDATE accounts SET current_balance = current_balance - $1, total_spent = total_spent + $1 WHERE id = $2',
            [delivery.amount, delivery.account_id]
        );
        
        await pool.query('COMMIT');
        
        res.json({ message: 'Livraison validée avec succès' });
        
    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('Erreur validation livraison:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour obtenir les comptes partenaires
app.get('/api/partner/accounts', requireAuth, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT a.*, u.full_name as user_name,
                   array_agg(pad.user_id) FILTER (WHERE pad.user_id IS NOT NULL) as assigned_director_ids,
                   array_agg(ud.full_name) FILTER (WHERE ud.full_name IS NOT NULL) as assigned_director_names
            FROM accounts a
            LEFT JOIN users u ON a.user_id = u.id
            LEFT JOIN partner_account_directors pad ON a.id = pad.account_id
            LEFT JOIN users ud ON pad.user_id = ud.id
            WHERE a.account_type = 'partenaire' AND a.is_active = true
            GROUP BY a.id, u.full_name
            ORDER BY a.account_name
        `);
        
        res.json(result.rows);
    } catch (error) {
        console.error('Erreur récupération comptes partenaires:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour assigner des directeurs à un compte partenaire
// Route de test pour vérifier les données partenaires
app.get('/api/debug/partner-directors', requireAuth, async (req, res) => {
    try {
        // Vérifier les comptes partenaires
        const accountsResult = await pool.query(`
            SELECT a.id, a.account_name, a.account_type 
            FROM accounts a 
            WHERE a.account_type = 'partenaire'
        `);
        
        // Vérifier les directeurs assignés
        const directorsResult = await pool.query(`
            SELECT pad.account_id, a.account_name, pad.user_id, u.username, u.role
            FROM partner_account_directors pad
            JOIN accounts a ON pad.account_id = a.id
            JOIN users u ON pad.user_id = u.id
        `);
        
        // Vérifier tous les directeurs
        const allDirectorsResult = await pool.query(`
            SELECT id, username, role FROM users WHERE role = 'directeur'
        `);
        
        res.json({
            partnerAccounts: accountsResult.rows,
            assignedDirectors: directorsResult.rows,
            allDirectors: allDirectorsResult.rows
        });
    } catch (error) {
        console.error('Erreur debug:', error);
        res.status(500).json({ error: error.message });
    }
});

// Route pour obtenir les directeurs assignés à un compte partenaire
app.get('/api/partner/:accountId/directors', requireAuth, async (req, res) => {
    try {
        const { accountId } = req.params;
        
        const result = await pool.query(`
            SELECT pad.user_id, u.username, u.full_name
            FROM partner_account_directors pad
            JOIN users u ON pad.user_id = u.id
            WHERE pad.account_id = $1
            ORDER BY u.full_name
        `, [accountId]);
        
        const assignedDirectorIds = result.rows.map(row => row.user_id);
        const assignedDirectors = result.rows;
        
        res.json({ 
            assigned_director_ids: assignedDirectorIds,
            assigned_directors: assignedDirectors
        });
    } catch (error) {
        console.error('Erreur récupération directeurs assignés:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour vérifier les autorisations d'un utilisateur sur un compte partenaire
app.get('/api/partner/:accountId/check-authorization', requireAuth, async (req, res) => {
    try {
        const { accountId } = req.params;
        const userId = req.session.user.id;
        const userRole = req.session.user.role;
        
        // Le DG peut toujours faire des dépenses
        if (userRole === 'directeur_general') {
            return res.json({ canExpend: true });
        }
        
        // Vérifier si l'utilisateur est un directeur assigné à ce compte partenaire
        const result = await pool.query(`
            SELECT 1 FROM partner_account_directors 
            WHERE account_id = $1 AND user_id = $2
        `, [accountId, userId]);
        
        const canExpend = result.rows.length > 0;
        
        res.json({ canExpend });
    } catch (error) {
        console.error('Erreur vérification autorisation partenaire:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.post('/api/partner/:accountId/directors', requireAdminAuth, async (req, res) => {
    try {
        const { accountId } = req.params;
        const { director_ids } = req.body;
        
        // Vérifier que le compte est de type partenaire
        const accountResult = await pool.query(
            'SELECT * FROM accounts WHERE id = $1 AND account_type = $2 AND is_active = true',
            [accountId, 'partenaire']
        );
        
        if (accountResult.rows.length === 0) {
            return res.status(404).json({ error: 'Compte partenaire non trouvé' });
        }
        
        await pool.query('BEGIN');
        
        // Supprimer les anciens directeurs assignés
        await pool.query('DELETE FROM partner_account_directors WHERE account_id = $1', [accountId]);
        
        // Ajouter les nouveaux directeurs (maximum 2)
        if (director_ids && director_ids.length > 0) {
            const limitedDirectors = director_ids.slice(0, 2); // Limiter à 2 directeurs
            for (const directorId of limitedDirectors) {
                await pool.query(
                    'INSERT INTO partner_account_directors (account_id, user_id) VALUES ($1, $2)',
                    [accountId, directorId]
                );
            }
        }
        
        await pool.query('COMMIT');
        
        res.json({ message: 'Directeurs assignés avec succès' });
    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('Erreur assignation directeurs:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour vérifier si un utilisateur peut effectuer des dépenses sur un compte partenaire
app.get('/api/partner/:accountId/can-expense', requireAuth, async (req, res) => {
    try {
        const { accountId } = req.params;
        const userId = req.session.user.id;
        const userRole = req.session.user.role;
        
        // Vérifier que le compte est de type partenaire
        const accountResult = await pool.query(
            'SELECT * FROM accounts WHERE id = $1 AND account_type = $2 AND is_active = true',
            [accountId, 'partenaire']
        );
        
        if (accountResult.rows.length === 0) {
            return res.json({ canExpense: false, reason: 'Compte partenaire non trouvé' });
        }
        
        let canExpense = false;
        let reason = '';
        
        if (userRole === 'directeur_general') {
            canExpense = true;
        } else if (userRole === 'directeur') {
            const directorResult = await pool.query(
                'SELECT 1 FROM partner_account_directors WHERE account_id = $1 AND user_id = $2',
                [accountId, userId]
            );
            canExpense = directorResult.rows.length > 0;
            reason = canExpense ? '' : 'Vous n\'êtes pas assigné à ce compte partenaire';
        } else {
            reason = 'Seuls le DG et les directeurs assignés peuvent effectuer des dépenses';
        }
        
        res.json({ canExpense, reason });
    } catch (error) {
        console.error('Erreur vérification dépense partenaire:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour activer un compte
app.put('/api/accounts/:accountId/activate', requireAdminAuth, async (req, res) => {
    try {
        const { accountId } = req.params;
        
        const result = await pool.query(
            'UPDATE accounts SET is_active = true WHERE id = $1 RETURNING *',
            [accountId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Compte non trouvé' });
        }
        
        res.json({ message: 'Compte activé avec succès', account: result.rows[0] });
    } catch (error) {
        console.error('Erreur activation compte:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// === ROUTES DE GESTION DES UTILISATEURS (ADMIN) ===

// Route pour obtenir tous les utilisateurs (admin uniquement)
app.get('/api/admin/users', requireAdminAuth, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id, username, full_name, email, role, is_active, created_at, updated_at
            FROM users 
            ORDER BY created_at DESC
        `);
        
        res.json(result.rows);
    } catch (error) {
        console.error('Erreur récupération utilisateurs:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour obtenir un utilisateur spécifique (admin uniquement)
app.get('/api/admin/users/:userId', requireAdminAuth, async (req, res) => {
    try {
        const { userId } = req.params;
        
        const result = await pool.query(`
            SELECT id, username, full_name, role, created_at,
                   NULL as email, true as is_active, created_at as updated_at
            FROM users 
            WHERE id = $1
        `, [userId]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Utilisateur non trouvé' });
        }
        
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Erreur récupération utilisateur:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour créer un nouvel utilisateur (admin uniquement)
app.post('/api/admin/users', requireAdminAuth, async (req, res) => {
    try {
        const { username, full_name, email, role, password } = req.body;
        
        // Validation des données
        if (!username || !role || !password) {
            return res.status(400).json({ error: 'Nom d\'utilisateur, rôle et mot de passe sont requis' });
        }
        
        // Vérifier que le nom d'utilisateur n'existe pas déjà
        const existingUser = await pool.query(
            'SELECT id FROM users WHERE username = $1',
            [username]
        );
        
        if (existingUser.rows.length > 0) {
            return res.status(400).json({ error: 'Ce nom d\'utilisateur existe déjà' });
        }
        
        // Vérifier que l'email n'existe pas déjà (si fourni et non vide)
        if (email && email.trim()) {
            const existingEmail = await pool.query(
                'SELECT id FROM users WHERE email = $1 AND email IS NOT NULL AND email != \'\'',
                [email.trim()]
            );
            
            if (existingEmail.rows.length > 0) {
                return res.status(400).json({ error: 'Cette adresse email existe déjà' });
            }
        }
        
        // Valider le rôle
        const validRoles = ['directeur', 'directeur_general', 'pca'];
        if (!validRoles.includes(role)) {
            return res.status(400).json({ error: 'Rôle invalide' });
        }
        
        // Hacher le mot de passe
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Créer l'utilisateur
        const result = await pool.query(`
            INSERT INTO users (username, full_name, email, role, password_hash, is_active, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            RETURNING id, username, full_name, email, role, is_active, created_at
        `, [username, full_name || null, email && email.trim() ? email.trim() : null, role, hashedPassword]);
        
        res.json({ 
            message: 'Utilisateur créé avec succès', 
            user: result.rows[0] 
        });
    } catch (error) {
        console.error('Erreur création utilisateur:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour modifier un utilisateur (admin uniquement)
app.put('/api/admin/users/:userId', requireAdminAuth, async (req, res) => {
    try {
        const { userId } = req.params;
        const { username, full_name, email, role, password } = req.body;
        
        // Vérifier que l'utilisateur existe
        const existingUser = await pool.query(
            'SELECT id FROM users WHERE id = $1',
            [userId]
        );
        
        if (existingUser.rows.length === 0) {
            return res.status(404).json({ error: 'Utilisateur non trouvé' });
        }
        
        // Vérifier l'unicité du nom d'utilisateur (sauf pour l'utilisateur actuel)
        if (username) {
            const duplicateUsername = await pool.query(
                'SELECT id FROM users WHERE username = $1 AND id != $2',
                [username, userId]
            );
            
            if (duplicateUsername.rows.length > 0) {
                return res.status(400).json({ error: 'Ce nom d\'utilisateur existe déjà' });
            }
        }
        
        // Vérifier l'unicité de l'email (sauf pour l'utilisateur actuel, si fourni et non vide)
        if (email && email.trim()) {
            const duplicateEmail = await pool.query(
                'SELECT id FROM users WHERE email = $1 AND id != $2 AND email IS NOT NULL AND email != \'\'',
                [email.trim(), userId]
            );
            
            if (duplicateEmail.rows.length > 0) {
                return res.status(400).json({ error: 'Cette adresse email existe déjà' });
            }
        }
        
        // Valider le rôle
        if (role) {
            const validRoles = ['directeur', 'directeur_general', 'pca'];
            if (!validRoles.includes(role)) {
                return res.status(400).json({ error: 'Rôle invalide' });
            }
        }
        
        // Construire la requête de mise à jour
        let updateQuery = 'UPDATE users SET updated_at = CURRENT_TIMESTAMP';
        let updateValues = [];
        let paramCount = 1;
        
        if (username) {
            updateQuery += `, username = $${paramCount}`;
            updateValues.push(username);
            paramCount++;
        }
        
        if (full_name !== undefined) {
            updateQuery += `, full_name = $${paramCount}`;
            updateValues.push(full_name);
            paramCount++;
        }
        
        if (email !== undefined) {
            updateQuery += `, email = $${paramCount}`;
            updateValues.push(email && email.trim() ? email.trim() : null);
            paramCount++;
        }
        
        if (role) {
            updateQuery += `, role = $${paramCount}`;
            updateValues.push(role);
            paramCount++;
        }
        
        if (password) {
            const hashedPassword = await bcrypt.hash(password, 10);
            updateQuery += `, password_hash = $${paramCount}`;
            updateValues.push(hashedPassword);
            paramCount++;
        }
        
        updateQuery += ` WHERE id = $${paramCount} RETURNING id, username, full_name, email, role, is_active, updated_at`;
        updateValues.push(userId);
        
        const result = await pool.query(updateQuery, updateValues);
        
        res.json({ 
            message: 'Utilisateur modifié avec succès', 
            user: result.rows[0] 
        });
    } catch (error) {
        console.error('Erreur modification utilisateur:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour désactiver un utilisateur (admin uniquement)
app.put('/api/admin/users/:userId/deactivate', requireAdminAuth, async (req, res) => {
    try {
        const { userId } = req.params;
        
        // Empêcher la désactivation de son propre compte
        if (parseInt(userId) === req.session.user.id) {
            return res.status(400).json({ error: 'Vous ne pouvez pas désactiver votre propre compte' });
        }
        
        const result = await pool.query(
            'UPDATE users SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING username',
            [userId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Utilisateur non trouvé' });
        }
        
        res.json({ message: `Utilisateur "${result.rows[0].username}" désactivé avec succès` });
    } catch (error) {
        console.error('Erreur désactivation utilisateur:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour activer un utilisateur (admin uniquement)
app.put('/api/admin/users/:userId/activate', requireAdminAuth, async (req, res) => {
    try {
        const { userId } = req.params;
        
        const result = await pool.query(
            'UPDATE users SET is_active = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING username',
            [userId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Utilisateur non trouvé' });
        }
        
        res.json({ message: `Utilisateur "${result.rows[0].username}" activé avec succès` });
    } catch (error) {
        console.error('Erreur activation utilisateur:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour réinitialiser le mot de passe d'un utilisateur (admin uniquement)
app.put('/api/admin/users/:userId/reset-password', requireAdminAuth, async (req, res) => {
    try {
        const { userId } = req.params;
        const { newPassword } = req.body;
        
        if (!newPassword) {
            return res.status(400).json({ error: 'Nouveau mot de passe requis' });
        }
        
        // Hacher le nouveau mot de passe
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        
        const result = await pool.query(
            'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING username',
            [hashedPassword, userId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Utilisateur non trouvé' });
        }
        
        res.json({ message: `Mot de passe réinitialisé pour "${result.rows[0].username}"` });
    } catch (error) {
        console.error('Erreur réinitialisation mot de passe:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Health check endpoint for Render
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// Root endpoint
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Démarrage du serveur
app.listen(PORT, () => {
    console.log(`Serveur démarré sur le port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    if (process.env.NODE_ENV !== 'production') {
        console.log(`Accédez à l'application sur http://localhost:${PORT}`);
    }
}); 