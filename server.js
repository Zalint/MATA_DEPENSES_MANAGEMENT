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

// Fonction utilitaire pour formater la monnaie
function formatCurrency(amount) {
    return parseInt(amount).toLocaleString('fr-FR') + ' FCFA';
}

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
        'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/json', 'text/json'
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
        secure: false, // Set to false for now to fix session issues on Render
        maxAge: 24 * 60 * 60 * 1000,
        httpOnly: true,
        sameSite: 'lax' // Changed from 'strict' to 'lax' for better compatibility
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
    console.log('🔐 SERVER: requireAdminAuth appelé pour:', req.method, req.path);
    
    // Debug: Log all headers and query params
    console.log('🔍 DEBUG: Headers x-api-key:', req.headers['x-api-key']);
    console.log('🔍 DEBUG: Headers authorization:', req.headers['authorization']);
    console.log('🔍 DEBUG: Query api_key:', req.query.api_key);
    
    // Vérifier d'abord si une clé API est fournie
    const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '') || req.query.api_key;
    
    console.log('🔍 DEBUG: API Key extracted:', apiKey ? 'YES' : 'NO');
    if (apiKey) {
        console.log('🔍 DEBUG: API Key value:', apiKey);
    }
    
    if (apiKey) {
        // Authentification par clé API
        const validApiKey = process.env.API_KEY || '4f8d9a2b6c7e8f1a3b5c9d0e2f4g6h7i';
        console.log('🔍 DEBUG: Valid API Key:', validApiKey);
        console.log('🔍 DEBUG: API Keys match:', apiKey === validApiKey);
        
        if (apiKey === validApiKey) {
            // Créer un utilisateur virtuel admin pour l'API
            req.session = req.session || {};
            req.session.user = {
                id: 0,
                username: 'api_user',
                role: 'admin',
                full_name: 'API User'
            };
            req.user = req.session.user; // Pour les logs
            console.log('🔑 SERVER: Authentification par clé API réussie');
            return next();
        } else {
            console.log('❌ SERVER: Clé API invalide fournie:', apiKey.substring(0, 8) + '...');
            return res.status(401).json({ error: 'Clé API invalide' });
        }
    }
    
    // Authentification par session (existante)
    console.log('🔐 SERVER: Session user:', req.session?.user);
    console.log('🔐 SERVER: User role:', req.session?.user?.role);
    
    if (req.session?.user && (['directeur_general', 'pca', 'admin'].includes(req.session.user.role))) {
        console.log('✅ SERVER: Authentification par session réussie pour:', req.session.user.username);
        req.user = req.session.user; // Ajouter l'utilisateur à req pour les logs
        return next();
    } else {
        console.log('❌ SERVER: Accès refusé - Privilèges insuffisants');
        console.log('❌ SERVER: User présent:', !!req.session?.user);
        console.log('❌ SERVER: Role présent:', req.session?.user?.role);
        console.log('❌ SERVER: Roles autorisés:', ['directeur_general', 'pca', 'admin']);
        console.log('❌ SERVER: Role match:', req.session?.user ? ['directeur_general', 'pca', 'admin'].includes(req.session.user.role) : false);
        return res.status(403).json({ error: 'Accès refusé - Privilèges insuffisants' });
    }
};

// Middleware pour DG/PCA uniquement
function requireSuperAdmin(req, res, next) {
    if (!req.session.user || !['directeur_general', 'pca', 'admin'].includes(req.session.user.role)) {
        return res.status(403).json({ error: 'Accès refusé' });
    }
    next();
}

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
        
        // Vérification des permissions simplifiée
        const userRole = req.session.user.role;
        let canCredit = false;
        
        if (userRole === 'directeur_general' || userRole === 'pca') {
            // DG et PCA peuvent créditer tous les comptes
            canCredit = true;
        } else if (userRole === 'directeur') {
            // Directeurs peuvent créditer leurs propres comptes
            if (account.user_id === credited_by) {
                canCredit = true;
            }
        }
        
        if (!canCredit) {
            await pool.query('ROLLBACK');
            return res.status(403).json({ error: 'Vous n\'êtes pas autorisé à créditer ce compte' });
        }
        
        // Mise à jour directe du compte selon le type
        if (account.account_type === 'statut') {
            // Pour les comptes statut, écraser le total_credited
            await pool.query(
                'UPDATE accounts SET total_credited = $1, current_balance = $1 - total_spent, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
                [parseInt(amount), account_id]
            );
        } else {
            // Pour les comptes classiques, ajouter au total_credited
            await pool.query(
                'UPDATE accounts SET total_credited = total_credited + $1, current_balance = current_balance + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
                [parseInt(amount), account_id]
            );
        }
        
        // Enregistrer dans l'historique de crédit
        await pool.query(
            'INSERT INTO credit_history (account_id, credited_by, amount, description) VALUES ($1, $2, $3, $4)',
            [account_id, credited_by, parseInt(amount), description || 'Crédit de compte']
        );
        
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
                   a.category_type, a.access_restricted, a.allowed_roles, a.created_by,
                   u.full_name as user_name, u.username
            FROM accounts a
            LEFT JOIN users u ON a.user_id = u.id
            WHERE 1=1
        `;
        let params = [];
        if (req.session.user.role === 'directeur') {
            query += ' AND a.is_active = true AND a.user_id = $1';
            params.push(req.session.user.id);
        } else if (req.session.user.role === 'directeur_general' || req.session.user.role === 'pca' || req.session.user.role === 'admin') {
            // Les admins voient tous les comptes (actifs et inactifs)
        } else {
            query += ' AND a.is_active = true AND (a.access_restricted = false OR a.access_restricted IS NULL OR a.account_type = \'Ajustement\')';
        }
        query += ' ORDER BY COALESCE(a.account_type, \'classique\'), a.account_name';
        console.log('Requête SQL:', query);
        console.log('Paramètres:', params);
        const result = await pool.query(query, params);
        console.log('Comptes trouvés:', result.rows.length);
        // Retourner les comptes sans recalcul dynamique
        res.json(result.rows);
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

// Route pour obtenir le solde d'un compte spécifique
app.get('/api/account/:accountId/balance', requireAuth, async (req, res) => {
    try {
        const { accountId } = req.params;
        const userRole = req.session.user.role;
        const userId = req.session.user.id;
        
        // Vérifications d'accès selon le rôle
        let accessQuery = 'SELECT id, current_balance, total_credited, total_spent FROM accounts WHERE id = $1 AND is_active = true';
        let accessParams = [accountId];
        
        if (userRole === 'directeur') {
            // Les directeurs ne peuvent voir que leurs propres comptes
            accessQuery += ' AND user_id = $2';
            accessParams.push(userId);
        }
        // DG, PCA et admin peuvent accéder à tous les comptes
        
        const result = await pool.query(accessQuery, accessParams);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Compte non trouvé ou accès refusé' });
        }
        
        const account = result.rows[0];
        
        // Calculer le total réellement dépensé pour ce compte
        const expensesResult = await pool.query(
            'SELECT COALESCE(SUM(total), 0) as real_total_spent FROM expenses WHERE account_id = $1',
            [accountId]
        );
        
        const realTotalSpent = parseInt(expensesResult.rows[0].real_total_spent) || 0;
        const currentBalance = account.total_credited - realTotalSpent;
        
        res.json({
            current_balance: currentBalance,
            total_credited: account.total_credited,
            total_spent: realTotalSpent
        });
        
    } catch (error) {
        console.error('Erreur récupération solde compte:', error);
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
                SELECT id FROM users WHERE role IN ('directeur_general', 'pca', 'admin')
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
        let result;
        const role = req.session.user.role;
        if (['admin', 'directeur_general', 'pca'].includes(role)) {
            result = await pool.query('SELECT id, username, role, full_name FROM users ORDER BY username');
        } else {
            result = await pool.query('SELECT id, username, role, full_name FROM users WHERE role = $1 ORDER BY username', ['directeur']);
        }
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
        ) AND e.user_id IN (SELECT id FROM users WHERE role IN ('directeur_general', 'pca', 'admin'))))` : '';
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
        
        // Dépenses par compte (période sélectionnée) avec total crédité, sauf dépôts et partenaires
        let accountBurnQuery = `
            SELECT 
                a.account_name as name,
                COALESCE(SUM(e.total), 0) as spent,
                a.total_credited,
                a.current_balance
            FROM accounts a
            LEFT JOIN users u ON a.user_id = u.id
            LEFT JOIN expenses e ON a.id = e.account_id 
                AND e.expense_date >= $1 AND e.expense_date <= $2
            WHERE a.is_active = true AND a.account_type != 'depot' AND a.account_type != 'partenaire'`;
        
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
            ) AND e.user_id IN (SELECT id FROM users WHERE role IN ('directeur_general', 'pca', 'admin'))))`;
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
                current_balance: parseInt(row.current_balance || 0), // Ajouter current_balance
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
            ) AND e.user_id IN (SELECT id FROM users WHERE role IN ('directeur_general', 'pca', 'admin'))))`;
            spentParams.push(userId);
        }
        
        const totalSpentResult = await pool.query(totalSpentQuery, spentParams);
        const totalSpent = parseInt(totalSpentResult.rows[0].total);
        

        
        // 2. Montant Restant Total (soldes actuels de tous les comptes, sauf dépôts, partenaires et créances)
        let totalRemainingQuery = `
            SELECT COALESCE(SUM(a.current_balance), 0) as total 
            FROM accounts a 
            WHERE a.is_active = true AND a.account_type NOT IN ('depot', 'partenaire', 'creance')
        `;
        let remainingParams = [];
        
        if (isDirector) {
            totalRemainingQuery += ` AND a.user_id = $1`;
            remainingParams = [userId];
        }
        
        const totalRemainingResult = await pool.query(totalRemainingQuery, remainingParams);
        const totalRemaining = parseInt(totalRemainingResult.rows[0].total);
        
        // 3. Total Crédité avec Dépenses (comptes qui ont eu des dépenses, sauf dépôts, partenaires et créances)
        let creditedWithExpensesQuery = `
            SELECT COALESCE(SUM(DISTINCT a.total_credited), 0) as total 
            FROM accounts a
            WHERE a.is_active = true AND a.account_type NOT IN ('depot', 'partenaire', 'creance')
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
        
        // 4. Total Crédité Général (tous les comptes actifs, sauf dépôts, partenaires et créances)
        let totalCreditedQuery = `
            SELECT COALESCE(SUM(a.total_credited), 0) as total 
            FROM accounts a 
            WHERE a.is_active = true AND a.account_type NOT IN ('depot', 'partenaire', 'creance')
        `;
        let creditedParams = [];
        
        if (isDirector) {
            totalCreditedQuery += ` AND a.user_id = $1`;
            creditedParams = [userId];
        }
        
        const totalCreditedResult = await pool.query(totalCreditedQuery, creditedParams);
        const totalCreditedGeneral = parseInt(totalCreditedResult.rows[0].total);
        
        // 5. Solde des comptes depot
        let depotBalanceQuery = `
            SELECT COALESCE(SUM(a.current_balance), 0) as total 
            FROM accounts a 
            WHERE a.is_active = true AND a.account_type = 'depot'
        `;
        let depotParams = [];
        
        if (isDirector) {
            depotBalanceQuery += ` AND a.user_id = $1`;
            depotParams = [userId];
        }
        
        const depotBalanceResult = await pool.query(depotBalanceQuery, depotParams);
        const totalDepotBalance = parseInt(depotBalanceResult.rows[0].total);
        
        // 6. Solde des comptes partenaire
        let partnerBalanceQuery = `
            SELECT COALESCE(SUM(a.current_balance), 0) as total 
            FROM accounts a 
            WHERE a.is_active = true AND a.account_type = 'partenaire'
        `;
        let partnerParams = [];
        
        if (isDirector) {
            partnerBalanceQuery += ` AND a.user_id = $1`;
            partnerParams = [userId];
        }
        
        const partnerBalanceResult = await pool.query(partnerBalanceQuery, partnerParams);
        const totalPartnerBalance = parseInt(partnerBalanceResult.rows[0].total);
        
        res.json({
            totalSpent,
            totalRemaining,
            totalCreditedWithExpenses,
            totalCreditedGeneral,
            totalDepotBalance,
            totalPartnerBalance,
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

// Route pour récupérer les données de stock pour le dashboard
app.get('/api/dashboard/stock-summary', requireAuth, async (req, res) => {
    try {
        // Récupérer la dernière date disponible dans la table stock_mata
        const latestDateQuery = `
            SELECT MAX(date) as latest_date 
            FROM stock_mata 
            WHERE date IS NOT NULL
        `;
        const latestDateResult = await pool.query(latestDateQuery);
        
        if (!latestDateResult.rows[0].latest_date) {
            return res.json({
                totalStock: 0,
                latestDate: null,
                message: 'Aucune donnée de stock disponible'
            });
        }
        
        const latestDate = latestDateResult.rows[0].latest_date;
        
        // Calculer la somme des stocks du soir pour la dernière date
        const stockSummaryQuery = `
            SELECT 
                COALESCE(SUM(stock_soir), 0) as total_stock,
                COUNT(*) as total_entries,
                COUNT(DISTINCT point_de_vente) as total_points,
                COUNT(DISTINCT produit) as total_products
            FROM stock_mata 
            WHERE date = $1
        `;
        const stockSummaryResult = await pool.query(stockSummaryQuery, [latestDate]);
        
        const summary = stockSummaryResult.rows[0];
        
        res.json({
            totalStock: parseFloat(summary.total_stock),
            latestDate: latestDate,
            totalEntries: parseInt(summary.total_entries),
            totalPoints: parseInt(summary.total_points),
            totalProducts: parseInt(summary.total_products),
            formattedDate: new Date(latestDate).toLocaleDateString('fr-FR')
        });
        
    } catch (error) {
        console.error('Erreur récupération résumé stock:', error);
        res.status(500).json({ error: 'Erreur serveur lors de la récupération des données de stock' });
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
            AND a.account_type != 'creance'
        `;
        
        let params = [accountName, startDate, endDate];
        
        // Filtrer selon le rôle de l'utilisateur
        if (req.session.user.role === 'directeur') {
            // Les directeurs voient leurs propres dépenses ET les dépenses faites par le DG sur leurs comptes
            query += ` AND (e.user_id = $4 OR (a.user_id = $4 AND e.user_id IN (
                SELECT id FROM users WHERE role IN ('directeur_general', 'pca', 'admin')
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
        
        // Vérifier la restriction de 48 heures pour les directeurs réguliers (pas pour admin, DG, PCA)
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
            
            // Vérifier l'autorisation pour les directeurs (admin, DG, PCA peuvent modifier sur tous les comptes)
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
                expense_date = $13
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

// Route pour supprimer une dépense
app.delete('/api/expenses/:id', requireAuth, async (req, res) => {
    try {
        const expenseId = req.params.id;
        const userId = req.session.user.id;
        
        // Vérifier que la dépense existe
        let checkQuery = 'SELECT e.*, a.account_name FROM expenses e LEFT JOIN accounts a ON e.account_id = a.id WHERE e.id = $1';
        let checkParams = [expenseId];
        
        // Pour les directeurs simples, vérifier qu'ils possèdent la dépense
        if (req.session.user.role === 'directeur') {
            checkQuery += ' AND e.user_id = $2';
            checkParams.push(userId);
        }
        
        const existingExpense = await pool.query(checkQuery, checkParams);
        
        if (existingExpense.rows.length === 0) {
            return res.status(404).json({ error: 'Dépense non trouvée ou non autorisée' });
        }
        
        const expense = existingExpense.rows[0];
        
        // Vérifier la restriction de 48 heures pour les directeurs réguliers (pas pour admin, DG, PCA)
        if (req.session.user.role === 'directeur') {
            const expenseCreatedAt = new Date(expense.created_at);
            const now = new Date();
            const hoursDifference = (now - expenseCreatedAt) / (1000 * 60 * 60);
            
            if (hoursDifference > 48) {
                return res.status(403).json({ 
                    error: `Suppression non autorisée. Cette dépense a été créée il y a ${Math.floor(hoursDifference)} heures. Les directeurs ne peuvent supprimer une dépense que dans les 48 heures suivant sa création.` 
                });
            }
        }
        
        await pool.query('BEGIN');
        
        // Restaurer le solde du compte si la dépense était associée à un compte
        if (expense.account_id) {
            const expenseAmount = parseInt(expense.total) || 0;
            await pool.query(
                `UPDATE accounts SET 
                    current_balance = current_balance + $1,
                    total_spent = total_spent - $1
                WHERE id = $2`,
                [expenseAmount, expense.account_id]
            );
        }
        
        // Supprimer la dépense
        await pool.query('DELETE FROM expenses WHERE id = $1', [expenseId]);
        
        await pool.query('COMMIT');
        
        res.json({
            message: `Dépense supprimée avec succès. Le solde du compte "${expense.account_name}" a été restauré.`
        });
        
    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('Erreur suppression dépense:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour supprimer un crédit (pour admin/DG/PCA)
app.delete('/api/credit-history/:id', requireAdminAuth, async (req, res) => {
    try {
        const creditId = req.params.id;
        const userId = req.session.user.id;
        const userRole = req.session.user.role;
        
        // Vérifier que le crédit existe
        const existingCredit = await pool.query(
            'SELECT ch.*, a.account_name FROM credit_history ch JOIN accounts a ON ch.account_id = a.id WHERE ch.id = $1',
            [creditId]
        );
        
        if (existingCredit.rows.length === 0) {
            return res.status(404).json({ error: 'Crédit non trouvé' });
        }
        
        const credit = existingCredit.rows[0];
        
        // Vérifications des permissions selon le rôle
        if (!['admin', 'directeur_general', 'pca'].includes(userRole)) {
            return res.status(403).json({ error: 'Accès non autorisé' });
        }
        
        // Supprimer le crédit et mettre à jour le solde du compte
        await pool.query('BEGIN');
        
        try {
            // Supprimer le crédit
            await pool.query('DELETE FROM credit_history WHERE id = $1', [creditId]);
            
            // Recalculer le total crédité et le solde du compte
            const accountStats = await pool.query(`
                UPDATE accounts 
                SET 
                    total_credited = COALESCE((SELECT SUM(amount) FROM credit_history WHERE account_id = $1), 0),
                    current_balance = COALESCE((SELECT SUM(amount) FROM credit_history WHERE account_id = $1), 0) - 
                                    COALESCE((SELECT SUM(total) FROM expenses WHERE account_id = $1), 0)
                WHERE id = $1
                RETURNING account_name, current_balance, total_credited
            `, [credit.account_id]);
            
            await pool.query('COMMIT');
            
            console.log(`[Admin] Crédit ${creditId} supprimé par ${req.session.user.username}`);
            
            res.json({ 
                success: true, 
                message: `Crédit de ${formatCurrency(credit.amount)} sur ${credit.account_name} supprimé avec succès`,
                account: accountStats.rows[0]
            });
            
        } catch (error) {
            await pool.query('ROLLBACK');
            throw error;
        }
        
    } catch (error) {
        console.error('Erreur suppression crédit (admin):', error);
        res.status(500).json({ error: 'Erreur serveur lors de la suppression' });
    }
});

// Route pour supprimer un crédit de directeur
app.delete('/api/director/credit-history/:id', requireAuth, async (req, res) => {
    try {
        const creditId = req.params.id;
        const userId = req.session.user.id;
        const userRole = req.session.user.role;
        
        // Vérifier que le crédit existe dans special_credit_history
        const existingCredit = await pool.query(
            'SELECT sch.*, a.account_name FROM special_credit_history sch JOIN accounts a ON sch.account_id = a.id WHERE sch.id = $1',
            [creditId]
        );
        
        if (existingCredit.rows.length === 0) {
            return res.status(404).json({ error: 'Crédit non trouvé' });
        }
        
        const credit = existingCredit.rows[0];
        
        // Vérifications des permissions selon le rôle
        if (['admin', 'directeur_general', 'pca'].includes(userRole)) {
            // Admin/DG/PCA peuvent supprimer n'importe quel crédit
        } else if (userRole === 'directeur') {
            // Les directeurs ne peuvent supprimer que leurs propres crédits et dans les 48h
            if (credit.credited_by !== userId) {
                return res.status(403).json({ error: 'Vous ne pouvez supprimer que vos propres crédits' });
            }
            
            const creditDate = new Date(credit.created_at);
            const now = new Date();
            const hoursDifference = (now - creditDate) / (1000 * 60 * 60);
            
            if (hoursDifference > 48) {
                return res.status(403).json({ 
                    error: `Suppression non autorisée - Plus de 48 heures écoulées (${Math.floor(hoursDifference)}h)`
                });
            }
        } else {
            return res.status(403).json({ error: 'Accès non autorisé' });
        }
        
        // Supprimer le crédit et mettre à jour le solde du compte
        await pool.query('BEGIN');
        
        try {
            // Supprimer le crédit
            await pool.query('DELETE FROM special_credit_history WHERE id = $1', [creditId]);
            
            // Recalculer le solde du compte en prenant en compte tous les types de crédits
            const accountStats = await pool.query(`
                UPDATE accounts 
                SET 
                    total_credited = COALESCE((SELECT SUM(amount) FROM credit_history WHERE account_id = $1), 0) +
                                   COALESCE((SELECT SUM(amount) FROM special_credit_history WHERE account_id = $1), 0),
                    current_balance = COALESCE((SELECT SUM(amount) FROM credit_history WHERE account_id = $1), 0) +
                                    COALESCE((SELECT SUM(amount) FROM special_credit_history WHERE account_id = $1), 0) -
                                    COALESCE((SELECT SUM(total) FROM expenses WHERE account_id = $1), 0)
                WHERE id = $1
                RETURNING account_name, current_balance, total_credited
            `, [credit.account_id]);
            
            await pool.query('COMMIT');
            
            console.log(`[Directeur] Crédit ${creditId} supprimé par ${req.session.user.username}`);
            
            res.json({ 
                success: true, 
                message: `Crédit de ${formatCurrency(credit.amount)} sur ${credit.account_name} supprimé avec succès`,
                account: accountStats.rows[0]
            });
            
        } catch (error) {
            await pool.query('ROLLBACK');
            throw error;
        }
        
    } catch (error) {
        console.error('Erreur suppression crédit (directeur):', error);
        res.status(500).json({ error: 'Erreur serveur lors de la suppression' });
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
        const { user_id, account_name, initial_amount, description, account_type, creditors, category_type, credit_permission_user_id } = req.body;
        const created_by = req.session.user.id;
        
        // Validation du type de compte
        const validTypes = ['classique', 'partenaire', 'statut', 'Ajustement', 'depot', 'creance'];
        if (account_type && !validTypes.includes(account_type)) {
            return res.status(400).json({ error: 'Type de compte invalide' });
        }
        
        const finalAccountType = account_type || 'classique';
        
        // Vérifier le directeur pour les comptes classiques et créance
        if ((finalAccountType === 'classique' || finalAccountType === 'creance') && user_id) {
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
                (finalAccountType === 'classique' || finalAccountType === 'creance') ? user_id : null,
                account_name, 
                parseInt(initial_amount) || 0, 
                parseInt(initial_amount) || 0, 
                created_by,
                finalAccountType,
                finalAccountType === 'Ajustement', // access_restricted seulement pour Ajustement
                finalAccountType === 'Ajustement' ? ['directeur_general', 'pca'] : null,
                finalAccountType === 'classique' ? category_type : null
            ]
        );
        
        const newAccount = accountResult.rows[0];

        // Si une permission de crédit est spécifiée pour un compte classique, l'ajouter
        if (newAccount.account_type === 'classique' && credit_permission_user_id) {
            console.log(`[API] Granting credit permission for account ${newAccount.id} to user ${credit_permission_user_id}`);
            await pool.query(
                'INSERT INTO account_credit_permissions (account_id, user_id, granted_by) VALUES ($1, $2, $3)',
                [newAccount.id, credit_permission_user_id, created_by]
            );
        }
        
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
                [newAccount.id, created_by, parseInt(initial_amount), description || 'Création du compte avec solde initial']
            );
        }
        
        await pool.query('COMMIT');
        
        res.json({ 
            message: 'Compte créé avec succès', 
            account: newAccount
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
             SET user_id = $1, account_name = $2, account_type = $3, category_type = $4
             WHERE id = $5 RETURNING *`,
            [user_id, account_name, account_type, category_type, accountId]
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
        { id: 'classique', name: 'Compte Classique', description: 'Compte standard assigné à un directeur. Le DG peut donner des permissions de crédit.' },
        { id: 'partenaire', name: 'Compte Partenaire', description: 'Compte accessible à tous les utilisateurs' },
        { id: 'statut', name: 'Compte Statut', description: 'Compte où le crédit écrase le solde existant (DG/PCA uniquement)' },
        { id: 'Ajustement', name: 'Compte Ajustement', description: 'Compte spécial pour les ajustements comptables (DG/PCA uniquement)' },
        { id: 'creance', name: 'Compte Créance', description: 'Compte spécial pour le suivi des créances clients. Isolé des calculs généraux.' }
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
                canCredit = userRole === 'directeur_general' || userRole === 'pca' || userRole === 'admin';
                reason = canCredit ? '' : 'Seuls le DG, le PCA et l\'admin peuvent créditer ce type de compte';
                break;
                
            case 'creance':
                if (userRole === 'directeur_general' || userRole === 'admin') {
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
        const { delivery_date, article_count, unit_price, amount, description } = req.body;
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
        let isAuthorized = userRole === 'directeur_general' || userRole === 'admin';
        
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
            INSERT INTO partner_deliveries (account_id, delivery_date, article_count, unit_price, amount, description, created_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `, [accountId, delivery_date, parseInt(article_count), parseInt(unit_price), parseInt(amount), description, created_by]);
        
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
        
        if (userRole === 'directeur_general' || userRole === 'admin') {
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

// Route pour supprimer une livraison partenaire (Admin uniquement)
app.delete('/api/partner/deliveries/:deliveryId', requireAuth, async (req, res) => {
    try {
        const { deliveryId } = req.params;
        const userRole = req.session.user.role;
        
        // Vérifier que l'utilisateur est admin
        if (userRole !== 'admin') {
            return res.status(403).json({ error: 'Seul l\'admin peut supprimer des livraisons' });
        }
        
        // Récupérer les informations de la livraison
        const deliveryResult = await pool.query(
            'SELECT * FROM partner_deliveries WHERE id = $1',
            [deliveryId]
        );
        
        if (deliveryResult.rows.length === 0) {
            return res.status(404).json({ error: 'Livraison non trouvée' });
        }
        
        const delivery = deliveryResult.rows[0];
        
        await pool.query('BEGIN');
        
        // Si la livraison était validée, rembourser le montant au compte
        if (delivery.validation_status === 'fully_validated' && delivery.is_validated) {
            await pool.query(
                'UPDATE accounts SET current_balance = current_balance + $1, total_spent = total_spent - $1 WHERE id = $2',
                [delivery.amount, delivery.account_id]
            );
            
            console.log(`Remboursement de ${delivery.amount} FCFA au compte ${delivery.account_id} suite à suppression admin de la livraison ${deliveryId}`);
        }
        
        // Supprimer la livraison
        await pool.query('DELETE FROM partner_deliveries WHERE id = $1', [deliveryId]);
        
        await pool.query('COMMIT');
        
        res.json({ 
            message: 'Livraison supprimée avec succès' + 
                    (delivery.validation_status === 'fully_validated' ? '. Montant remboursé au compte.' : '.'),
            wasValidated: delivery.validation_status === 'fully_validated'
        });
        
    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('Erreur suppression livraison admin:', error);
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

// =====================================================
// ADMIN ROUTES
// =====================================================

// Import admin endpoints
const adminEndpoints = require('./admin_endpoints');

// Admin routes - Delete account with backup
app.post('/api/admin/accounts/:id/delete', adminEndpoints.requireAdmin, adminEndpoints.deleteAccount);

// Admin routes - Empty account with backup  
app.post('/api/admin/accounts/:id/empty', adminEndpoints.requireAdmin, adminEndpoints.emptyAccount);

// Admin routes - Get account backups
app.get('/api/admin/backups', adminEndpoints.requireAdmin, adminEndpoints.getAccountBackups);

// Admin routes - Configuration management
app.get('/api/admin/config/categories', requireAdminAuth, (req, res) => {
    try {
        const configPath = path.join(__dirname, 'categories_config.json');
        const configData = fs.readFileSync(configPath, 'utf8');
        res.json(JSON.parse(configData));
    } catch (error) {
        console.error('Error reading categories config:', error);
        res.status(500).json({ error: 'Error reading categories configuration' });
    }
});

app.put('/api/admin/config/categories', requireAdminAuth, (req, res) => {
    try {
        const configPath = path.join(__dirname, 'categories_config.json');
        const configData = JSON.stringify(req.body, null, 2);
        fs.writeFileSync(configPath, configData, 'utf8');
        res.json({ message: 'Categories configuration updated successfully' });
    } catch (error) {
        console.error('Error updating categories config:', error);
        res.status(500).json({ error: 'Error updating categories configuration' });
    }
});

app.get('/api/admin/config/stock-vivant', requireAdminAuth, (req, res) => {
    try {
        const configPath = path.join(__dirname, 'stock_vivant_config.json');
        const configData = fs.readFileSync(configPath, 'utf8');
        res.json(JSON.parse(configData));
    } catch (error) {
        console.error('Error reading stock vivant config:', error);
        res.status(500).json({ error: 'Error reading stock vivant configuration' });
    }
});

app.put('/api/admin/config/stock-vivant', requireAdminAuth, (req, res) => {
    try {
        const configPath = path.join(__dirname, 'stock_vivant_config.json');
        const configData = JSON.stringify(req.body, null, 2);
        fs.writeFileSync(configPath, configData, 'utf8');
        res.json({ message: 'Stock vivant configuration updated successfully' });
    } catch (error) {
        console.error('Error updating stock vivant config:', error);
        res.status(500).json({ error: 'Error updating stock vivant configuration' });
    }
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

// Route pour ajouter une opération de remboursement/dette
app.post('/api/remboursements', requireAuth, async (req, res) => {
    try {
        const { nom_client, numero_tel, date, action, commentaire, montant } = req.body;
        console.log('Received remboursement request:', { nom_client, numero_tel, date, action, commentaire, montant });
        
        // Validate required fields
        const missingFields = [];
        if (!nom_client) missingFields.push('nom_client');
        if (!numero_tel) missingFields.push('numero_tel');
        if (!date) missingFields.push('date');
        if (!action) missingFields.push('action');
        if (!montant) missingFields.push('montant');
        
        if (missingFields.length > 0) {
            console.log('Missing required fields:', missingFields);
            return res.status(400).json({ error: `Champs obligatoires manquants: ${missingFields.join(', ')}` });
        }

        if (!['remboursement', 'dette'].includes(action)) {
            console.log('Invalid action:', action);
            return res.status(400).json({ error: 'Action invalide. Doit être "remboursement" ou "dette".' });
        }

        const result = await pool.query(
            `INSERT INTO remboursements (nom_client, numero_tel, date, action, commentaire, montant)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [nom_client, numero_tel, date, action, commentaire, montant]
        );
        console.log('Operation created:', result.rows[0]);
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Detailed error in remboursements:', error);
        res.status(500).json({ error: 'Erreur serveur: ' + error.message });
    }
});

// Route pour lister les opérations de remboursement/dette (avec filtres)
app.get('/api/remboursements', requireAuth, async (req, res) => {
    try {
        const { numero_tel, date_debut, date_fin } = req.query;
        let query = 'SELECT * FROM remboursements WHERE 1=1';
        const params = [];
        let idx = 1;
        if (numero_tel) {
            query += ` AND numero_tel = $${idx++}`;
            params.push(numero_tel);
        }
        if (date_debut) {
            query += ` AND date >= $${idx++}`;
            params.push(date_debut);
        }
        if (date_fin) {
            query += ` AND date <= $${idx++}`;
            params.push(date_fin);
        }
        query += ' ORDER BY date DESC, id DESC';
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error('Erreur récupération remboursements:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour la synthèse par client sur une plage de dates
app.get('/api/remboursements/synthese', requireAuth, async (req, res) => {
    try {
        const { date_debut, date_fin } = req.query;
        let query = `SELECT nom_client, numero_tel,
            SUM(CASE WHEN action = 'remboursement' THEN montant ELSE -montant END) AS total,
            MAX(date) AS dernier_paiement
            FROM remboursements WHERE 1=1`;
        const params = [];
        let idx = 1;
        if (date_debut) {
            query += ` AND date >= $${idx++}`;
            params.push(date_debut);
        }
        if (date_fin) {
            query += ` AND date <= $${idx++}`;
            params.push(date_fin);
        }
        query += ' GROUP BY nom_client, numero_tel ORDER BY nom_client';
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error('Erreur synthèse remboursements:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour ajouter une permission de crédit pour un compte classique
app.post('/api/accounts/:accountId/credit-permissions', requireAdminAuth, async (req, res) => {
    try {
        const { accountId } = req.params;
        const { user_id } = req.body;
        const granted_by = req.session.user.id;

        // Vérifier que le compte existe et est de type classique
        const accountCheck = await pool.query(
            'SELECT * FROM accounts WHERE id = $1 AND account_type = $2',
            [accountId, 'classique']
        );

        if (accountCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Compte classique non trouvé' });
        }

        // Vérifier que l'utilisateur existe et est un directeur
        const userCheck = await pool.query(
            'SELECT * FROM users WHERE id = $1 AND role = $2',
            [user_id, 'directeur']
        );

        if (userCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Directeur non trouvé' });
        }

        // Ajouter la permission (gérer les doublons avec ON CONFLICT)
        await pool.query(
            'INSERT INTO account_credit_permissions (account_id, user_id, granted_by) VALUES ($1, $2, $3) ON CONFLICT (account_id, user_id) DO NOTHING',
            [accountId, user_id, granted_by]
        );

        res.json({ message: 'Permission de crédit accordée avec succès' });
    } catch (error) {
        console.error('Erreur lors de l\'ajout de la permission:', error);
        res.status(500).json({ error: 'Erreur lors de l\'ajout de la permission' });
    }
});

// Route pour retirer une permission de crédit
app.delete('/api/accounts/:accountId/credit-permissions/:userId', requireAdminAuth, async (req, res) => {
    try {
        const { accountId, userId } = req.params;

        await pool.query(
            'DELETE FROM account_credit_permissions WHERE account_id = $1 AND user_id = $2',
            [accountId, userId]
        );

        res.json({ message: 'Permission de crédit retirée avec succès' });
    } catch (error) {
        console.error('Erreur lors du retrait de la permission:', error);
        res.status(500).json({ error: 'Erreur lors du retrait de la permission' });
    }
});

// =====================================================
// STOCK SOIR ROUTES
// =====================================================

// Route pour uploader un fichier JSON de réconciliation et créer les données de stock
app.post('/api/stock-mata/upload', requireAdminAuth, upload.single('reconciliation'), async (req, res) => {
    try {
        console.log('🚀 SERVER: Route /api/stock-mata/upload appelée');
        console.log('🚀 SERVER: Headers reçus:', req.headers);
        console.log('🚀 SERVER: User info:', {
            user: req.user?.username,
            role: req.user?.role,
            id: req.user?.id
        });
        
        console.log('🔍 SERVER: Début de l\'upload de fichier JSON');
        console.log('📂 SERVER: Fichier reçu:', req.file);
        console.log('📂 SERVER: Body reçu:', req.body);
        
        if (!req.file) {
            console.log('❌ SERVER: Aucun fichier fourni');
            return res.status(400).json({ error: 'Aucun fichier fourni' });
        }

        console.log('📄 SERVER: Chemin du fichier:', req.file.path);
        console.log('📄 SERVER: Nom original:', req.file.originalname);
        console.log('📄 SERVER: Taille:', req.file.size, 'bytes');
        console.log('📄 SERVER: Type MIME:', req.file.mimetype);

        // Lire le fichier JSON
        console.log('📖 SERVER: Lecture du fichier...');
        const fileContent = fs.readFileSync(req.file.path, 'utf8');
        console.log('📄 SERVER: Contenu lu, taille:', fileContent.length, 'caractères');
        console.log('📄 SERVER: Premiers 200 caractères:', fileContent.substring(0, 200));
        
        let reconciliationData;

        try {
            reconciliationData = JSON.parse(fileContent);
            console.log('✅ JSON parsé avec succès');
        } catch (parseError) {
            console.log('❌ Erreur parsing JSON:', parseError.message);
            fs.unlinkSync(req.file.path); // Supprimer le fichier temporaire
            return res.status(400).json({ error: 'Format JSON invalide' });
        }

        // Vérifier la structure du JSON
        console.log('🔍 Validation de la structure JSON:');
        console.log('- Est un array:', Array.isArray(reconciliationData));
        console.log('- Premier élément existe:', !!reconciliationData[0]);
        console.log('- Success property:', reconciliationData[0]?.success);
        console.log('- Data exists:', !!reconciliationData[0]?.data);
        console.log('- Details exists:', !!reconciliationData[0]?.data?.details);
        
        if (!Array.isArray(reconciliationData) || !reconciliationData[0] || 
            !reconciliationData[0].success || !reconciliationData[0].data || 
            !reconciliationData[0].data.details) {
            console.log('❌ Structure JSON invalide');
            fs.unlinkSync(req.file.path);
            return res.status(400).json({ error: 'Structure JSON invalide' });
        }
        
        console.log('✅ Structure JSON validée');

        const data = reconciliationData[0].data;
        const date = data.date; // Format: "18-06-2025"
        const details = data.details;

        // Convertir la date au format PostgreSQL (YYYY-MM-DD)
        const dateParts = date.split('-');
        const formattedDate = `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`;

        // Vérifier s'il y a des données existantes pour cette date
        const existingDataQuery = await pool.query(`
                    SELECT DISTINCT point_de_vente, produit, stock_matin, stock_soir, transfert
        FROM stock_mata 
            WHERE date = $1
            ORDER BY point_de_vente, produit
        `, [formattedDate]);

        const existingRecords = existingDataQuery.rows;
        
        // Préparer la liste des nouveaux enregistrements
        const newRecords = [];
        for (const pointVente in details) {
            const pointData = details[pointVente];
            for (const produit in pointData) {
                if (produit === 'Bovin' || produit === 'Non spécifié') {
                    continue;
                }
                const productData = pointData[produit];
                newRecords.push({
                    point_de_vente: pointVente,
                    produit: produit,
                    stock_matin: productData.stockMatin || 0,
                    stock_soir: productData.stockSoir || 0,
                    transfert: productData.transferts || 0
                });
            }
        }

        // Si des données existent déjà pour cette date, retourner un avertissement
        if (existingRecords.length > 0) {
            fs.unlinkSync(req.file.path);
            return res.status(409).json({ 
                error: 'duplicate_data',
                message: 'Des données existent déjà pour cette date',
                date: formattedDate,
                existingRecords: existingRecords.length,
                newRecords: newRecords.length,
                existingData: existingRecords
            });
        }

        await pool.query('BEGIN');

        let insertedRecords = 0;
        let updatedRecords = 0;

        // Parcourir chaque point de vente
        for (const pointVente in details) {
            const pointData = details[pointVente];

            // Parcourir chaque produit du point de vente
            for (const produit in pointData) {
                // Exclure "Bovin" et "Non spécifié"
                if (produit === 'Bovin' || produit === 'Non spécifié') {
                    continue;
                }

                const productData = pointData[produit];
                const stockMatin = productData.stockMatin || 0;
                const stockSoir = productData.stockSoir || 0;
                const transfert = productData.transferts || 0;

                // Insérer ou mettre à jour les données
                const result = await pool.query(`
                    INSERT INTO stock_mata (date, point_de_vente, produit, stock_matin, stock_soir, transfert)
                    VALUES ($1, $2, $3, $4, $5, $6)
                    ON CONFLICT (date, point_de_vente, produit)
                    DO UPDATE SET 
                        stock_matin = EXCLUDED.stock_matin,
                        stock_soir = EXCLUDED.stock_soir,
                        transfert = EXCLUDED.transfert,
                        updated_at = CURRENT_TIMESTAMP
                    RETURNING (xmax = 0) AS inserted
                `, [formattedDate, pointVente, produit, stockMatin, stockSoir, transfert]);

                if (result.rows[0].inserted) {
                    insertedRecords++;
                } else {
                    updatedRecords++;
                }
            }
        }

        await pool.query('COMMIT');

        // Supprimer le fichier temporaire
        fs.unlinkSync(req.file.path);

        res.json({
            message: 'Données de stock importées avec succès',
            date: formattedDate,
            insertedRecords,
            updatedRecords,
            totalRecords: insertedRecords + updatedRecords
        });

    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('Erreur lors de l\'import des données de stock:', error);
        
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        
        res.status(500).json({ error: 'Erreur lors de l\'import des données' });
    }
});

// Route pour forcer l'import après confirmation des doublons
app.post('/api/stock-mata/force-upload', requireAdminAuth, upload.single('reconciliation'), async (req, res) => {
    try {
        console.log('🔍 DEBUG: Import forcé après confirmation');
        
        if (!req.file) {
            console.log('❌ Aucun fichier fourni pour import forcé');
            return res.status(400).json({ error: 'Aucun fichier fourni' });
        }

        // Lire le fichier JSON
        const fileContent = fs.readFileSync(req.file.path, 'utf8');
        let reconciliationData;

        try {
            reconciliationData = JSON.parse(fileContent);
            console.log('✅ JSON parsé avec succès pour import forcé');
        } catch (parseError) {
            console.log('❌ Erreur parsing JSON pour import forcé:', parseError.message);
            fs.unlinkSync(req.file.path);
            return res.status(400).json({ error: 'Format JSON invalide' });
        }

        // Vérifier la structure du JSON
        if (!Array.isArray(reconciliationData) || !reconciliationData[0] || 
            !reconciliationData[0].success || !reconciliationData[0].data || 
            !reconciliationData[0].data.details) {
            console.log('❌ Structure JSON invalide pour import forcé');
            fs.unlinkSync(req.file.path);
            return res.status(400).json({ error: 'Structure JSON invalide' });
        }

        const data = reconciliationData[0].data;
        const date = data.date;
        const details = data.details;

        // Convertir la date au format PostgreSQL (YYYY-MM-DD)
        const dateParts = date.split('-');
        const formattedDate = `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`;

        console.log('🔄 Import forcé - Suppression des données existantes pour la date:', formattedDate);

        await pool.query('BEGIN');

        // Supprimer toutes les données existantes pour cette date
        const deleteResult = await pool.query('DELETE FROM stock_mata WHERE date = $1', [formattedDate]);
        console.log(`🗑️ ${deleteResult.rowCount} enregistrements supprimés`);

        let insertedRecords = 0;

        // Parcourir chaque point de vente et insérer les nouvelles données
        for (const pointVente in details) {
            const pointData = details[pointVente];

            for (const produit in pointData) {
                if (produit === 'Bovin' || produit === 'Non spécifié') {
                    continue;
                }

                const productData = pointData[produit];
                const stockMatin = productData.stockMatin || 0;
                const stockSoir = productData.stockSoir || 0;
                const transfert = productData.transferts || 0;

                await pool.query(`
                    INSERT INTO stock_mata (date, point_de_vente, produit, stock_matin, stock_soir, transfert)
                    VALUES ($1, $2, $3, $4, $5, $6)
                `, [formattedDate, pointVente, produit, stockMatin, stockSoir, transfert]);

                insertedRecords++;
            }
        }

        await pool.query('COMMIT');
        console.log(`✅ Import forcé terminé: ${insertedRecords} nouveaux enregistrements`);

        // Supprimer le fichier temporaire
        fs.unlinkSync(req.file.path);

        res.json({
            message: 'Données remplacées avec succès',
            date: formattedDate,
            deletedRecords: deleteResult.rowCount,
            insertedRecords,
            totalRecords: insertedRecords
        });

    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('Erreur lors de l\'import forcé:', error);
        
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        
        res.status(500).json({ error: 'Erreur lors de l\'import forcé' });
    }
});

// Route pour récupérer les données de stock par date
app.get('/api/stock-mata', requireAdminAuth, async (req, res) => {
    try {
        const { date } = req.query;
        
        let query = 'SELECT * FROM stock_mata';
        let params = [];
        
        if (date) {
            query += ' WHERE date = $1';
            params.push(date);
        }
        
        query += ' ORDER BY point_de_vente, produit';
        
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error('Erreur récupération données stock:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour récupérer les dates disponibles
app.get('/api/stock-mata/dates', requireAdminAuth, async (req, res) => {
    try {
        // Formatter la date directement en SQL pour éviter les problèmes de timezone
        const result = await pool.query(
            "SELECT DISTINCT TO_CHAR(date_stock, 'YYYY-MM-DD') as date FROM stock_mata ORDER BY date DESC"
        );
        res.json(result.rows);
    } catch (error) {
        console.error('Erreur lors de la récupération des dates de stock:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour récupérer les statistiques par point de vente
app.get('/api/stock-mata/statistiques', requireAdminAuth, async (req, res) => {
    try {
        const { date } = req.query;
        
        let query = `
            SELECT 
                point_de_vente,
                COUNT(*) as nombre_produits,
                SUM(stock_matin) as total_stock_matin,
                SUM(stock_soir) as total_stock_soir,
                SUM(transfert) as total_transfert,
                SUM(stock_matin - stock_soir + transfert) as total_ventes_theoriques
            FROM stock_mata
        `;
        let params = [];
        
        if (date) {
            query += ' WHERE date = $1';
            params.push(date);
        }
        
        query += ' GROUP BY point_de_vente ORDER BY point_de_vente';
        
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error('Erreur récupération statistiques stock:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour ajouter une nouvelle entrée de stock manuellement
app.post('/api/stock-mata', requireAdminAuth, async (req, res) => {
    try {
        const { date, point_de_vente, produit, stock_matin, stock_soir, transfert } = req.body;
        
        if (!date || !point_de_vente || !produit) {
            return res.status(400).json({ error: 'Date, point de vente et produit sont obligatoires' });
        }

        const result = await pool.query(`
            INSERT INTO stock_mata (date, point_de_vente, produit, stock_matin, stock_soir, transfert)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
        `, [date, point_de_vente, produit, stock_matin || 0, stock_soir || 0, transfert || 0]);

        res.json(result.rows[0]);
    } catch (error) {
        if (error.code === '23505') { // Violation de contrainte unique
            res.status(409).json({ error: 'Une entrée existe déjà pour cette date, ce point de vente et ce produit' });
        } else {
            console.error('Erreur ajout stock:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }
});

// Route pour modifier une entrée de stock
app.put('/api/stock-mata/:id', requireAdminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { date, point_de_vente, produit, stock_matin, stock_soir, transfert } = req.body;
        
        if (!date || !point_de_vente || !produit) {
            return res.status(400).json({ error: 'Date, point de vente et produit sont obligatoires' });
        }

        const result = await pool.query(`
            UPDATE stock_mata 
            SET date = $1, point_de_vente = $2, produit = $3, 
                stock_matin = $4, stock_soir = $5, transfert = $6,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $7
            RETURNING *
        `, [date, point_de_vente, produit, stock_matin || 0, stock_soir || 0, transfert || 0, id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Entrée non trouvée' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        if (error.code === '23505') { // Violation de contrainte unique
            res.status(409).json({ error: 'Une entrée existe déjà pour cette date, ce point de vente et ce produit' });
        } else {
            console.error('Erreur modification stock:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }
});

// Route pour supprimer une entrée de stock
app.delete('/api/stock-mata/:id', requireAdminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await pool.query('DELETE FROM stock_mata WHERE id = $1 RETURNING *', [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Entrée non trouvée' });
        }

        res.json({ message: 'Entrée supprimée avec succès', deleted: result.rows[0] });
    } catch (error) {
        console.error('Erreur suppression stock:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour récupérer une entrée spécifique
app.get('/api/stock-mata/:id', requireAdminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await pool.query('SELECT * FROM stock_mata WHERE id = $1', [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Entrée non trouvée' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Erreur récupération stock:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour lister les permissions de crédit d'un compte
app.get('/api/accounts/:accountId/credit-permissions', requireAuth, async (req, res) => {
    try {
        const { accountId } = req.params;

        const result = await pool.query(
            `SELECT acp.*, u.full_name, u.role, ug.full_name as granted_by_name
             FROM account_credit_permissions acp
             JOIN users u ON acp.user_id = u.id
             JOIN users ug ON acp.granted_by = ug.id
             WHERE acp.account_id = $1`,
            [accountId]
        );

        res.json(result.rows);
    } catch (error) {
        console.error('Erreur lors de la récupération des permissions:', error);
        res.status(500).json({ error: 'Erreur lors de la récupération des permissions' });
    }
});

// Route pour récupérer les comptes qu'un directeur peut créditer
app.get('/api/director/crediteable-accounts', requireAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const userRole = req.session.user.role;
        
        let query = `
            SELECT a.id, a.account_name, COALESCE(a.account_type, 'classique') as account_type,
                   a.current_balance, a.total_credited, u.full_name as user_name
            FROM accounts a
            LEFT JOIN users u ON a.user_id = u.id
            WHERE a.is_active = true
        `;
        let params = [];
        
        if (userRole === 'directeur_general' || userRole === 'pca' || userRole === 'admin') {
            // DG, PCA et admin voient tous les comptes
            query += ` ORDER BY a.account_name`;
        } else if (userRole === 'directeur') {
            // Directeurs voient seulement les comptes pour lesquels ils ont une permission
            query += ` AND EXISTS (
                SELECT 1 FROM account_credit_permissions acp 
                WHERE acp.account_id = a.id AND acp.user_id = $1
            ) ORDER BY a.account_name`;
            params.push(userId);
        } else {
            // Autres rôles n'ont pas accès
            return res.json([]);
        }
        
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error('Erreur récupération comptes créditables:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour récupérer l'historique des crédits d'un directeur
app.get('/api/director/credit-history', requireAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;
        
        const result = await pool.query(`
            SELECT sch.*, a.account_name
            FROM special_credit_history sch
            JOIN accounts a ON sch.account_id = a.id
            WHERE sch.credited_by = $1
            ORDER BY sch.created_at DESC
            LIMIT 20
        `, [userId]);
        
        res.json(result.rows);
    } catch (error) {
        console.error('Erreur récupération historique directeur:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour vérifier l'accès Stock Vivant d'un directeur
app.get('/api/director/stock-vivant-access', requireAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const userRole = req.session.user.role;
        
        // Si c'est un admin, il a toujours accès
        if (['directeur_general', 'pca', 'admin'].includes(userRole)) {
            return res.json({ hasAccess: true, reason: 'admin' });
        }
        
        // Pour les directeurs, vérifier s'ils ont une permission active
        if (userRole === 'directeur') {
            const result = await pool.query(`
                SELECT 1 
                FROM stock_vivant_permissions svp
                JOIN users u ON svp.user_id = u.id
                WHERE svp.user_id = $1 AND svp.is_active = true AND u.is_active = true
            `, [userId]);
            
            const hasAccess = result.rows.length > 0;
            return res.json({ 
                hasAccess: hasAccess,
                reason: hasAccess ? 'permission_granted' : 'no_permission'
            });
        }
        
        // Autres rôles n'ont pas accès
        res.json({ hasAccess: false, reason: 'role_not_allowed' });
        
    } catch (error) {
        console.error('Erreur lors de la vérification de l\'accès Stock Vivant:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route de crédit avec système de permissions amélioré
app.post('/api/accounts/:id/credit', requireAuth, async (req, res) => {
    try {
        const accountId = req.params.id;
        const { amount, description, credit_date } = req.body;
        const userId = req.session.user.id;
        const userRole = req.session.user.role;
        const finalCreditDate = credit_date || new Date().toISOString().split('T')[0];

        // Vérifier que le compte existe
        const accountResult = await pool.query(
            'SELECT * FROM accounts WHERE id = $1',
            [accountId]
        );

        if (accountResult.rows.length === 0) {
            return res.status(404).json({ error: 'Compte non trouvé' });
        }

        const account = accountResult.rows[0];
        
        // Utiliser la fonction PostgreSQL pour vérifier les permissions
        const permissionCheck = await pool.query(
            'SELECT can_user_credit_account($1, $2) as can_credit',
            [userId, accountId]
        );

        if (!permissionCheck.rows[0].can_credit) {
            return res.status(403).json({ error: 'Vous n\'avez pas la permission de créditer ce compte' });
        }

        await pool.query('BEGIN');

        // Mise à jour du compte selon le type
        if (account.account_type === 'statut') {
            // Pour les comptes statut, écraser le solde existant
            await pool.query(
                'UPDATE accounts SET current_balance = $1, total_credited = $1, total_spent = 0, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
                [parseInt(amount), accountId]
            );
        } else {
            // Pour les autres types, ajouter au solde existant
            await pool.query(
                'UPDATE accounts SET current_balance = current_balance + $1, total_credited = total_credited + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
                [parseInt(amount), accountId]
            );
        }

        // Enregistrer dans l'historique spécial
        await pool.query(
            'INSERT INTO special_credit_history (account_id, credited_by, amount, comment, credit_date, account_type, is_balance_override) VALUES ($1, $2, $3, $4, $5, $6, $7)',
            [accountId, userId, parseInt(amount), description || 'Crédit de compte', finalCreditDate, account.account_type, account.account_type === 'statut']
        );

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

// Route de transfert de solde entre comptes
app.post('/api/transfert', requireSuperAdmin, async (req, res) => {
    const { source_id, destination_id, montant } = req.body;
    if (!source_id || !destination_id || !montant || source_id === destination_id) {
        return res.status(400).json({ error: 'Champs invalides' });
    }
    const montantInt = parseInt(montant);
    if (montantInt <= 0) {
        return res.status(400).json({ error: 'Montant invalide' });
    }
    try {
        // Vérifier les comptes
        const accounts = await pool.query('SELECT id, account_type, is_active, current_balance FROM accounts WHERE id = ANY($1)', [[source_id, destination_id]]);
        if (accounts.rows.length !== 2) {
            return res.status(404).json({ error: 'Comptes non trouvés' });
        }
        const source = accounts.rows.find(a => a.id == source_id);
        const dest = accounts.rows.find(a => a.id == destination_id);
        console.log('[Transfert] Début:', { source_id, destination_id, montantInt });
        console.log('[Transfert] Soldes AVANT:', { source: source.current_balance, dest: dest.current_balance });
        const allowedTypes = ['classique', 'Ajustement', 'statut'];
        if (!source.is_active || !dest.is_active || !allowedTypes.includes(source.account_type) || !allowedTypes.includes(dest.account_type)) {
            return res.status(400).json({ error: 'Type ou statut de compte non autorisé' });
        }
        if (source.current_balance < montantInt) {
            return res.status(400).json({ error: 'Solde insuffisant sur le compte source' });
        }
        // Début transaction
        await pool.query('BEGIN');
        // Débiter le compte source
        await pool.query('UPDATE accounts SET current_balance = current_balance - $1, total_spent = total_spent + $1 WHERE id = $2', [montantInt, source_id]);
        // Créditer le compte destination
        await pool.query('UPDATE accounts SET current_balance = current_balance + $1, total_credited = total_credited + $1 WHERE id = $2', [montantInt, destination_id]);
        // Journaliser le transfert (créer la table si besoin)
        await pool.query(`CREATE TABLE IF NOT EXISTS transfer_history (
            id SERIAL PRIMARY KEY,
            source_id INTEGER REFERENCES accounts(id),
            destination_id INTEGER REFERENCES accounts(id),
            montant INTEGER NOT NULL,
            transferred_by INTEGER REFERENCES users(id),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);
        await pool.query('INSERT INTO transfer_history (source_id, destination_id, montant, transferred_by) VALUES ($1, $2, $3, $4)', [source_id, destination_id, montantInt, req.session.user.id]);
        // Vérifier les soldes après
        const sourceAfter = await pool.query('SELECT current_balance FROM accounts WHERE id = $1', [source_id]);
        const destAfter = await pool.query('SELECT current_balance FROM accounts WHERE id = $1', [destination_id]);
        console.log('[Transfert] Soldes APRES:', { source: sourceAfter.rows[0].current_balance, dest: destAfter.rows[0].current_balance });
        await pool.query('COMMIT');
        res.json({ success: true });
    } catch (e) {
        await pool.query('ROLLBACK');
        console.error('Erreur transfert:', e);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour récupérer l'historique des transferts
app.get('/api/transfers', requireAuth, async (req, res) => {
    try {
        const { start_date, end_date } = req.query;
        
        // D'abord vérifier si la table existe et combien de transferts on a
        const countQuery = 'SELECT COUNT(*) as count FROM transfer_history';
        const countResult = await pool.query(countQuery);
        
        if (parseInt(countResult.rows[0].count) === 0) {
            res.json({
                transfers: [],
                period: { start_date: null, end_date: null }
            });
            return;
        }
        
        // Si des dates sont spécifiées, les utiliser, sinon récupérer les 20 derniers transferts
        let query, queryParams = [];
        
        if (start_date && end_date) {
            query = `
                SELECT 
                    th.id,
                    th.montant,
                    th.created_at,
                    a_source.account_name as source_account,
                    a_dest.account_name as destination_account,
                    u.full_name as transferred_by
                FROM transfer_history th
                JOIN accounts a_source ON th.source_id = a_source.id
                JOIN accounts a_dest ON th.destination_id = a_dest.id
                JOIN users u ON th.transferred_by = u.id
                WHERE DATE(th.created_at) >= $1 AND DATE(th.created_at) <= $2
                ORDER BY th.created_at DESC
                LIMIT 20
            `;
            queryParams = [start_date, end_date];
        } else {
            query = `
                SELECT 
                    th.id,
                    th.montant,
                    th.created_at,
                    a_source.account_name as source_account,
                    a_dest.account_name as destination_account,
                    u.full_name as transferred_by
                FROM transfer_history th
                JOIN accounts a_source ON th.source_id = a_source.id
                JOIN accounts a_dest ON th.destination_id = a_dest.id
                JOIN users u ON th.transferred_by = u.id
                ORDER BY th.created_at DESC
                LIMIT 20
            `;
        }
        
        const result = await pool.query(query, queryParams);
        
        res.json({
            transfers: result.rows,
            period: { start_date: start_date || null, end_date: end_date || null }
        });
    } catch (error) {
        console.error('Erreur récupération transferts:', error);
        res.status(500).json({ error: 'Erreur serveur: ' + error.message });
    }
});

// =====================================================
// STOCK VIVANT ROUTES
// =====================================================

// Middleware pour vérifier les permissions stock vivant (similaire au système de crédit)
const requireStockVivantAuth = async (req, res, next) => {
    try {
        console.log('🔐 STOCK VIVANT: requireStockVivantAuth appelé pour:', req.method, req.path);
        
        if (!req.session.user) {
            console.log('❌ STOCK VIVANT: Pas de session utilisateur');
            return res.status(401).json({ error: 'Non autorisé' });
        }

        const userId = req.session.user.id;
        const userRole = req.session.user.role;
        const userName = req.session.user.username;
        console.log('👤 STOCK VIVANT: Utilisateur:', userName, 'Role:', userRole, 'ID:', userId);
        
        // Si c'est un admin, il a toujours accès
        if (['directeur_general', 'pca', 'admin'].includes(userRole)) {
            console.log('✅ STOCK VIVANT: Accès autorisé pour admin:', userName);
            return next();
        }
        
        // Pour les directeurs, vérifier s'ils ont une permission active
        if (userRole === 'directeur') {
            console.log('🔍 STOCK VIVANT: Vérification permissions directeur pour:', userName);
            const permissionCheck = await pool.query(`
                SELECT 1 
                FROM stock_vivant_permissions svp
                JOIN users u ON svp.user_id = u.id
                WHERE svp.user_id = $1 AND svp.is_active = true AND u.is_active = true
            `, [userId]);
            
            const hasPermission = permissionCheck.rows.length > 0;
            console.log('🔍 STOCK VIVANT: Directeur a permission:', hasPermission);
            
            if (hasPermission) {
                console.log('✅ STOCK VIVANT: Accès autorisé pour directeur avec permission:', userName);
                return next();
            } else {
                console.log('❌ STOCK VIVANT: Directeur sans permission:', userName);
                return res.status(403).json({ error: 'Accès refusé - Vous n\'avez pas la permission d\'accéder au stock vivant' });
            }
        }
        
        // Autres rôles n'ont pas accès
        console.log('❌ STOCK VIVANT: Accès refusé pour role:', userRole);
        return res.status(403).json({ error: 'Accès refusé - Rôle non autorisé pour le stock vivant' });
        
    } catch (error) {
        console.error('❌ STOCK VIVANT: Erreur vérification permissions:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
};

// Route pour récupérer la configuration des catégories de stock vivant
app.get('/api/stock-vivant/config', requireStockVivantAuth, (req, res) => {
    try {
        const config = require('./stock_vivant_config.json');
        res.json(config);
    } catch (error) {
        console.error('❌ STOCK VIVANT: Erreur chargement config:', error);
        res.status(500).json({ error: 'Configuration non disponible' });
    }
});

// Route pour mettre à jour la configuration (DG uniquement)
app.put('/api/stock-vivant/config', requireSuperAdmin, (req, res) => {
    try {
        const fs = require('fs');
        const newConfig = req.body;
        
        // Valider la structure de base
        if (!newConfig.categories || !newConfig.labels) {
            return res.status(400).json({ error: 'Structure de configuration invalide' });
        }

        // Sauvegarder la nouvelle configuration
        fs.writeFileSync('./stock_vivant_config.json', JSON.stringify(newConfig, null, 2));
        
        res.json({ message: 'Configuration mise à jour avec succès' });
    } catch (error) {
        console.error('Erreur mise à jour config stock vivant:', error);
        res.status(500).json({ error: 'Erreur lors de la mise à jour' });
    }
});

// Route pour récupérer les données de stock vivant
app.get('/api/stock-vivant', requireStockVivantAuth, async (req, res) => {
    try {
        const { date, categorie } = req.query;
        
        let query = 'SELECT * FROM stock_vivant';
        let params = [];
        let conditions = [];
        
        if (date) {
            conditions.push('date_stock = $' + (params.length + 1));
            params.push(date);
        }
        
        if (categorie) {
            conditions.push('categorie = $' + (params.length + 1));
            params.push(categorie);
        }
        
        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }
        
        query += ' ORDER BY date_stock DESC, categorie, produit';
        
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error('Erreur récupération stock vivant:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour récupérer les dates disponibles
app.get('/api/stock-vivant/dates', requireStockVivantAuth, async (req, res) => {
    try {
        console.log('📅 SERVER: Récupération dates stock vivant pour:', req.session.user.username);
        const result = await pool.query(
            "SELECT DISTINCT TO_CHAR(date_stock, 'YYYY-MM-DD') as date FROM stock_vivant ORDER BY date DESC"
        );
        console.log('📅 SERVER: Dates trouvées:', result.rows.length);
        console.log('📅 SERVER: Dates détails:', result.rows);
        res.json(result.rows);
    } catch (error) {
        console.error('❌ SERVER: Erreur récupération dates stock vivant:', error);
        console.error('❌ SERVER: Stack trace dates:', error.stack);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour ajouter/modifier des données de stock vivant
app.post('/api/stock-vivant/update', requireStockVivantAuth, async (req, res) => {
    try {
        const { date_stock, stockData, replace_existing } = req.body;
        
        if (!date_stock || !stockData || !Array.isArray(stockData)) {
            return res.status(400).json({ error: 'Données invalides' });
        }

        // Vérifier s'il y a des données existantes pour cette date
        const existingCheck = await pool.query(
            'SELECT COUNT(*) as count FROM stock_vivant WHERE date_stock = $1',
            [date_stock]
        );

        const hasExistingData = parseInt(existingCheck.rows[0].count) > 0;

        // Si des données existent et qu'on ne force pas le remplacement, demander confirmation
        if (hasExistingData && !replace_existing) {
            return res.status(409).json({ 
                error: 'duplicate_data',
                message: 'Des données existent déjà pour cette date',
                date: date_stock,
                existingCount: existingCheck.rows[0].count
            });
        }

        await pool.query('BEGIN');

        // Si on remplace, supprimer les données existantes
        if (replace_existing && hasExistingData) {
            await pool.query('DELETE FROM stock_vivant WHERE date_stock = $1', [date_stock]);
        }

        let processedCount = 0;

        // Traiter chaque entrée de stock
        for (const item of stockData) {
            const { categorie, produit, quantite, prix_unitaire, decote, commentaire } = item;
            
            if (!categorie || !produit || quantite === undefined || prix_unitaire === undefined) {
                continue; // Ignorer les entrées incomplètes
            }

            const decoteValue = parseFloat(decote) || 0.20; // Décote par défaut de 20%
            const total = (parseFloat(quantite) || 0) * (parseFloat(prix_unitaire) || 0) * (1 - decoteValue);

            await pool.query(`
                INSERT INTO stock_vivant (date_stock, categorie, produit, quantite, prix_unitaire, decote, total, commentaire)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ON CONFLICT (date_stock, categorie, produit)
                DO UPDATE SET 
                    quantite = EXCLUDED.quantite,
                    prix_unitaire = EXCLUDED.prix_unitaire,
                    decote = EXCLUDED.decote,
                    total = EXCLUDED.total,
                    commentaire = EXCLUDED.commentaire,
                    updated_at = CURRENT_TIMESTAMP
            `, [date_stock, categorie, produit, quantite, prix_unitaire, decoteValue, total, commentaire || '']);

            processedCount++;
        }

        await pool.query('COMMIT');

        res.json({
            message: `Stock vivant mis à jour avec succès`,
            date: date_stock,
            processedCount,
            replaced: hasExistingData && replace_existing
        });

    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('Erreur mise à jour stock vivant:', error);
        res.status(500).json({ error: 'Erreur lors de la mise à jour' });
    }
});

// Route pour copier le stock d'une date précédente
app.post('/api/stock-vivant/copy-from-date', requireStockVivantAuth, async (req, res) => {
    try {
        const { source_date, target_date } = req.body;
        
        if (!source_date || !target_date) {
            return res.status(400).json({ error: 'Dates source et cible requises' });
        }

        // Vérifier qu'il y a des données à copier
        const sourceData = await pool.query(
            'SELECT * FROM stock_vivant WHERE date_stock = $1',
            [source_date]
        );

        if (sourceData.rows.length === 0) {
            return res.status(404).json({ error: 'Aucune donnée trouvée pour la date source' });
        }

        // Vérifier s'il y a déjà des données pour la date cible
        const targetCheck = await pool.query(
            'SELECT COUNT(*) as count FROM stock_vivant WHERE date_stock = $1',
            [target_date]
        );

        if (parseInt(targetCheck.rows[0].count) > 0) {
            return res.status(409).json({ 
                error: 'target_has_data',
                message: 'Des données existent déjà pour la date cible'
            });
        }

        await pool.query('BEGIN');

        // Copier les données
        await pool.query(`
            INSERT INTO stock_vivant (date_stock, categorie, produit, quantite, prix_unitaire, total, commentaire)
            SELECT $1, categorie, produit, quantite, prix_unitaire, total, commentaire
            FROM stock_vivant 
            WHERE date_stock = $2
        `, [target_date, source_date]);

        const copiedCount = sourceData.rows.length;

        await pool.query('COMMIT');

        res.json({
            message: `${copiedCount} entrées copiées avec succès`,
            source_date,
            target_date,
            copiedCount
        });

    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('Erreur copie stock vivant:', error);
        res.status(500).json({ error: 'Erreur lors de la copie' });
    }
});

// Route pour supprimer une entrée spécifique
app.delete('/api/stock-vivant/:id', requireStockVivantAuth, async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await pool.query('DELETE FROM stock_vivant WHERE id = $1 RETURNING *', [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Entrée non trouvée' });
        }

        res.json({ message: 'Entrée supprimée avec succès', deleted: result.rows[0] });
    } catch (error) {
        console.error('Erreur suppression stock vivant:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Routes pour la gestion des permissions (DG uniquement)
app.get('/api/stock-vivant/permissions', requireSuperAdmin, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                svp.id,
                svp.user_id,
                svp.is_active,
                svp.granted_at,
                u.username,
                u.full_name,
                ug.full_name as granted_by_name
            FROM stock_vivant_permissions svp
            JOIN users u ON svp.user_id = u.id
            LEFT JOIN users ug ON svp.granted_by = ug.id
            WHERE u.role = 'directeur'
            ORDER BY u.full_name
        `);
        
        res.json(result.rows);
    } catch (error) {
        console.error('Erreur récupération permissions stock vivant:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.post('/api/stock-vivant/permissions', requireSuperAdmin, async (req, res) => {
    try {
        const { user_id } = req.body;
        const granted_by = req.session.user.id;

        // Vérifier que l'utilisateur est un directeur
        const userCheck = await pool.query(
            'SELECT * FROM users WHERE id = $1 AND role = $2',
            [user_id, 'directeur']
        );

        if (userCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Directeur non trouvé' });
        }

        // Ajouter ou activer la permission
        await pool.query(`
            INSERT INTO stock_vivant_permissions (user_id, granted_by, is_active)
            VALUES ($1, $2, true)
            ON CONFLICT (user_id) 
            DO UPDATE SET is_active = true, granted_by = $2, granted_at = CURRENT_TIMESTAMP
        `, [user_id, granted_by]);

        res.json({ message: 'Permission accordée avec succès' });
    } catch (error) {
        console.error('Erreur ajout permission stock vivant:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.delete('/api/stock-vivant/permissions/:userId', requireSuperAdmin, async (req, res) => {
    try {
        const { userId } = req.params;
        
        const result = await pool.query(
            'UPDATE stock_vivant_permissions SET is_active = false WHERE user_id = $1 RETURNING *',
            [userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Permission non trouvée' });
        }

        res.json({ message: 'Permission révoquée avec succès' });
    } catch (error) {
        console.error('Erreur révocation permission stock vivant:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour obtenir les directeurs disponibles pour les permissions
app.get('/api/stock-vivant/available-directors', requireSuperAdmin, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                u.id,
                u.username,
                u.full_name,
                CASE 
                    WHEN svp.is_active = true THEN true 
                    ELSE false 
                END as has_permission
            FROM users u
            LEFT JOIN stock_vivant_permissions svp ON u.id = svp.user_id AND svp.is_active = true
            WHERE u.role = 'directeur' AND u.is_active = true
            ORDER BY u.full_name
        `);
        
        res.json(result.rows);
    } catch (error) {
        console.error('Erreur récupération directeurs disponibles:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour récupérer le total général du stock vivant
app.get('/api/stock-vivant/total', requireAuth, async (req, res) => {
    try {
        // Récupérer la dernière date disponible
        const latestDateQuery = `
            SELECT MAX(date_stock) as latest_date 
            FROM stock_vivant 
            WHERE date_stock IS NOT NULL
        `;
        const latestDateResult = await pool.query(latestDateQuery);
        
        if (!latestDateResult.rows[0].latest_date) {
            return res.json({
                totalStock: 0,
                formattedDate: null,
                message: 'Aucune donnée de stock vivant disponible'
            });
        }
        
        const latestDate = latestDateResult.rows[0].latest_date;
        
        // Calculer la somme totale pour la dernière date
        const totalQuery = `
            SELECT SUM(quantite * prix_unitaire * (1 - decote)) as total_stock
            FROM stock_vivant
            WHERE date_stock = $1
        `;
        const totalResult = await pool.query(totalQuery, [latestDate]);
        
        const totalStock = Math.round(totalResult.rows[0].total_stock || 0);
        const formattedDate = latestDate.toLocaleDateString('fr-FR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        
        res.json({
            totalStock,
            formattedDate,
            message: 'Total stock vivant récupéré avec succès'
        });
        
    } catch (error) {
        console.error('Erreur récupération total stock vivant:', error);
        res.status(500).json({ error: 'Erreur lors de la récupération du total stock vivant' });
    }
});

// ===== GESTION DES COMPTES CREANCE =====

// Créer les tables pour les créances si elles n'existent pas
async function createCreanceTablesIfNotExists() {
    try {
        // Table pour les clients des comptes créance
        await pool.query(`
            CREATE TABLE IF NOT EXISTS creance_clients (
                id SERIAL PRIMARY KEY,
                account_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
                client_name VARCHAR(255) NOT NULL,
                client_phone VARCHAR(50),
                client_address TEXT,
                initial_credit INTEGER DEFAULT 0,
                created_by INTEGER REFERENCES users(id),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                is_active BOOLEAN DEFAULT true
            )
        `);

        // Créer un index unique partiel pour les clients actifs seulement
        await pool.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS idx_creance_clients_unique_active
            ON creance_clients (account_id, client_name) 
            WHERE is_active = true
        `);

        // Table pour les opérations créance (avances/remboursements)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS creance_operations (
                id SERIAL PRIMARY KEY,
                account_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
                client_id INTEGER REFERENCES creance_clients(id) ON DELETE CASCADE,
                operation_type VARCHAR(10) NOT NULL CHECK (operation_type IN ('credit', 'debit')),
                amount INTEGER NOT NULL,
                operation_date DATE NOT NULL,
                description TEXT,
                created_by INTEGER REFERENCES users(id),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        console.log('Tables créance créées avec succès');
    } catch (error) {
        console.error('Erreur création tables créance:', error);
    }
}

// Initialiser les tables créance au démarrage
createCreanceTablesIfNotExists();

// Route pour obtenir les comptes créance accessibles à l'utilisateur
app.get('/api/creance/accounts', requireAuth, async (req, res) => {
    try {
        const userRole = req.session.user.role;
        const userId = req.session.user.id;

        let query;
        let params = [];

        if (userRole === 'directeur_general' || userRole === 'pca' || userRole === 'admin') {
            // Admin peut voir tous les comptes créance
            query = `
                SELECT a.*, u.full_name as assigned_director_name 
                FROM accounts a 
                LEFT JOIN users u ON a.user_id = u.id 
                WHERE a.account_type = 'creance' AND a.is_active = true 
                ORDER BY a.account_name
            `;
        } else if (userRole === 'directeur') {
            // Directeur ne peut voir que ses comptes assignés
            query = `
                SELECT a.*, u.full_name as assigned_director_name 
                FROM accounts a 
                LEFT JOIN users u ON a.user_id = u.id 
                WHERE a.account_type = 'creance' AND a.is_active = true AND a.user_id = $1 
                ORDER BY a.account_name
            `;
            params = [userId];
        } else {
            return res.status(403).json({ error: 'Accès non autorisé' });
        }

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error('Erreur récupération comptes créance:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour obtenir les clients d'un compte créance
app.get('/api/creance/:accountId/clients', requireAuth, async (req, res) => {
    try {
        const { accountId } = req.params;
        const userRole = req.session.user.role;
        const userId = req.session.user.id;

        // Vérifier l'accès au compte
        const accountResult = await pool.query(
            'SELECT * FROM accounts WHERE id = $1 AND account_type = $2 AND is_active = true',
            [accountId, 'creance']
        );

        if (accountResult.rows.length === 0) {
            return res.status(404).json({ error: 'Compte créance non trouvé' });
        }

        const account = accountResult.rows[0];

        // Vérifier les permissions
        if (userRole === 'directeur' && account.user_id !== userId) {
            return res.status(403).json({ error: 'Accès non autorisé à ce compte' });
        }

        const result = await pool.query(`
            SELECT cc.*, 
                   COALESCE(SUM(CASE WHEN co.operation_type = 'credit' THEN co.amount ELSE 0 END), 0) as total_credits,
                   COALESCE(SUM(CASE WHEN co.operation_type = 'debit' THEN co.amount ELSE 0 END), 0) as total_debits,
                   (cc.initial_credit + COALESCE(SUM(CASE WHEN co.operation_type = 'credit' THEN co.amount ELSE 0 END), 0) - COALESCE(SUM(CASE WHEN co.operation_type = 'debit' THEN co.amount ELSE 0 END), 0)) as balance
            FROM creance_clients cc
            LEFT JOIN creance_operations co ON cc.id = co.client_id
            WHERE cc.account_id = $1 AND cc.is_active = true
            GROUP BY cc.id
            ORDER BY cc.client_name
        `, [accountId]);

        res.json(result.rows);
    } catch (error) {
        console.error('Erreur récupération clients créance:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour ajouter un client à un compte créance (Admin seulement)
app.post('/api/creance/:accountId/clients', requireAdminAuth, async (req, res) => {
    try {
        const { accountId } = req.params;
        const { client_name, client_phone, client_address, initial_credit } = req.body;
        const created_by = req.session.user.id;

        // Vérifier que le compte existe et est de type créance
        const accountResult = await pool.query(
            'SELECT * FROM accounts WHERE id = $1 AND account_type = $2 AND is_active = true',
            [accountId, 'creance']
        );

        if (accountResult.rows.length === 0) {
            return res.status(404).json({ error: 'Compte créance non trouvé' });
        }

        // Vérifier qu'aucun client ACTIF avec ce nom n'existe déjà pour ce compte
        const existingClientResult = await pool.query(
            'SELECT id FROM creance_clients WHERE account_id = $1 AND client_name = $2 AND is_active = true',
            [accountId, client_name]
        );

        if (existingClientResult.rows.length > 0) {
            return res.status(400).json({ error: 'Un client avec ce nom existe déjà pour ce compte' });
        }

        const result = await pool.query(`
            INSERT INTO creance_clients (account_id, client_name, client_phone, client_address, initial_credit, created_by)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
        `, [accountId, client_name, client_phone || null, client_address || null, parseInt(initial_credit) || 0, created_by]);

        res.json({ 
            message: 'Client ajouté avec succès', 
            client: result.rows[0] 
        });
    } catch (error) {
        console.error('Erreur ajout client créance:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

    // Route pour ajouter une opération créance (avance/remboursement)
app.post('/api/creance/:accountId/operations', requireAuth, async (req, res) => {
    try {
        const { accountId } = req.params;
        const { client_id, operation_type, amount, operation_date, description } = req.body;
        const created_by = req.session.user.id;
        const userRole = req.session.user.role;

        // Vérifier que le compte existe et est de type créance
        const accountResult = await pool.query(
            'SELECT * FROM accounts WHERE id = $1 AND account_type = $2 AND is_active = true',
            [accountId, 'creance']
        );

        if (accountResult.rows.length === 0) {
            return res.status(404).json({ error: 'Compte créance non trouvé' });
        }

        const account = accountResult.rows[0];

        // Vérifier les permissions
        if (userRole === 'directeur' && account.user_id !== created_by) {
            return res.status(403).json({ error: 'Vous n\'êtes pas autorisé à effectuer des opérations sur ce compte' });
        }

        // Vérifier que le client existe et appartient au compte
        const clientResult = await pool.query(
            'SELECT * FROM creance_clients WHERE id = $1 AND account_id = $2 AND is_active = true',
            [client_id, accountId]
        );

        if (clientResult.rows.length === 0) {
            return res.status(404).json({ error: 'Client non trouvé pour ce compte' });
        }

        const result = await pool.query(`
            INSERT INTO creance_operations (account_id, client_id, operation_type, amount, operation_date, description, created_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `, [accountId, client_id, operation_type, parseInt(amount), operation_date, description || null, created_by]);

        res.json({ 
            message: `${operation_type === 'credit' ? 'Avance' : 'Remboursement'} ajouté avec succès`, 
            operation: result.rows[0] 
        });
    } catch (error) {
        console.error('Erreur ajout opération créance:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour obtenir l'historique des opérations d'un compte créance
app.get('/api/creance/:accountId/operations', requireAuth, async (req, res) => {
    try {
        const { accountId } = req.params;
        const userRole = req.session.user.role;
        const userId = req.session.user.id;

        // Vérifier l'accès au compte
        const accountResult = await pool.query(
            'SELECT * FROM accounts WHERE id = $1 AND account_type = $2 AND is_active = true',
            [accountId, 'creance']
        );

        if (accountResult.rows.length === 0) {
            return res.status(404).json({ error: 'Compte créance non trouvé' });
        }

        const account = accountResult.rows[0];

        // Vérifier les permissions
        if (userRole === 'directeur' && account.user_id !== userId) {
            return res.status(403).json({ error: 'Accès non autorisé à ce compte' });
        }

        const result = await pool.query(`
            SELECT co.*, cc.client_name, u.full_name as created_by_name
            FROM creance_operations co
            JOIN creance_clients cc ON co.client_id = cc.id
            JOIN users u ON co.created_by = u.id
            WHERE co.account_id = $1
            ORDER BY co.operation_date DESC, co.created_at DESC
        `, [accountId]);

        res.json(result.rows);
    } catch (error) {
        console.error('Erreur récupération opérations créance:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour récupérer une opération créance spécifique
app.get('/api/creance/operations/:operationId', requireAuth, async (req, res) => {
    try {
        const { operationId } = req.params;
        const userId = req.session.user.id;
        const userRole = req.session.user.role;

        // Récupérer l'opération
        const operationResult = await pool.query(`
            SELECT co.*, cc.client_name, u.full_name as created_by_name,
                   a.user_id as account_assigned_to
            FROM creance_operations co
            JOIN creance_clients cc ON co.client_id = cc.id  
            JOIN users u ON co.created_by = u.id
            JOIN accounts a ON co.account_id = a.id
            WHERE co.id = $1
        `, [operationId]);

        if (operationResult.rows.length === 0) {
            return res.status(404).json({ error: 'Opération non trouvée' });
        }

        const operation = operationResult.rows[0];

        // Vérifier les permissions d'accès
        if (userRole === 'directeur') {
            // Le directeur ne peut accéder qu'aux opérations de ses comptes
            if (operation.account_assigned_to !== userId) {
                return res.status(403).json({ error: 'Accès non autorisé' });
            }
        }

        res.json(operation);

    } catch (error) {
        console.error('Erreur récupération opération créance:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour modifier une opération créance
app.put('/api/creance/operations/:operationId', requireAuth, async (req, res) => {
    try {
        const { operationId } = req.params;
        const { client_id, operation_type, amount, operation_date, description } = req.body;
        const userId = req.session.user.id;
        const userRole = req.session.user.role;

        // Validation des données
        if (!client_id || !operation_type || !amount || !operation_date) {
            return res.status(400).json({ error: 'Données manquantes' });
        }

        if (!['credit', 'debit'].includes(operation_type)) {
            return res.status(400).json({ error: 'Type d\'opération invalide' });
        }

        if (amount <= 0) {
            return res.status(400).json({ error: 'Le montant doit être supérieur à 0' });
        }

        // Récupérer l'opération existante pour vérifier les permissions
        const operationResult = await pool.query(`
            SELECT co.*, a.user_id as account_assigned_to
            FROM creance_operations co
            JOIN accounts a ON co.account_id = a.id
            WHERE co.id = $1
        `, [operationId]);

        if (operationResult.rows.length === 0) {
            return res.status(404).json({ error: 'Opération non trouvée' });
        }

        const operation = operationResult.rows[0];

        // Vérifier les permissions de modification
        const canEdit = checkCreanceOperationEditPermission(
            userRole, 
            userId, 
            operation.created_by, 
            operation.account_assigned_to,
            operation.created_at
        );

        if (!canEdit) {
            return res.status(403).json({ 
                error: userRole === 'directeur' 
                    ? 'Vous ne pouvez modifier que vos propres opérations dans les 48h'
                    : 'Permission refusée' 
            });
        }

        // Mettre à jour l'opération
        const updateResult = await pool.query(`
            UPDATE creance_operations 
            SET client_id = $1, operation_type = $2, amount = $3, 
                operation_date = $4, description = $5
            WHERE id = $6 
            RETURNING *
        `, [client_id, operation_type, amount, operation_date, description, operationId]);

        res.json({ 
            message: `${operation_type === 'credit' ? 'Avance' : 'Remboursement'} mis à jour avec succès`, 
            operation: updateResult.rows[0] 
        });

    } catch (error) {
        console.error('Erreur modification opération créance:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour supprimer une opération créance  
app.delete('/api/creance/operations/:operationId', requireAuth, async (req, res) => {
    try {
        const { operationId } = req.params;
        const userId = req.session.user.id;
        const userRole = req.session.user.role;

        // Récupérer l'opération existante pour vérifier les permissions
        const operationResult = await pool.query(`
            SELECT co.*, a.user_id as account_assigned_to, cc.client_name
            FROM creance_operations co
            JOIN accounts a ON co.account_id = a.id
            JOIN creance_clients cc ON co.client_id = cc.id
            WHERE co.id = $1
        `, [operationId]);

        if (operationResult.rows.length === 0) {
            return res.status(404).json({ error: 'Opération non trouvée' });
        }

        const operation = operationResult.rows[0];

        // Vérifier les permissions de suppression
        const canDelete = checkCreanceOperationDeletePermission(
            userRole, 
            userId, 
            operation.created_by, 
            operation.account_assigned_to,
            operation.created_at
        );

        if (!canDelete) {
            return res.status(403).json({ 
                error: userRole === 'directeur' 
                    ? 'Vous ne pouvez supprimer que vos propres opérations dans les 48h'
                    : 'Seul l\'admin peut supprimer les opérations' 
            });
        }

        // Supprimer l'opération
        await pool.query('DELETE FROM creance_operations WHERE id = $1', [operationId]);

        res.json({ 
            message: `Opération supprimée avec succès (${operation.client_name} - ${operation.amount} FCFA)` 
        });

    } catch (error) {
        console.error('Erreur suppression opération créance:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Fonction utilitaire pour vérifier les permissions de modification
function checkCreanceOperationEditPermission(userRole, userId, operationCreatedBy, accountAssignedTo, operationCreatedAt) {
    // Admin, DG, PCA peuvent toujours modifier
    if (['admin', 'directeur_general', 'pca'].includes(userRole)) {
        return true;
    }
    
    // Directeur peut modifier ses propres opérations dans les 48h
    if (userRole === 'directeur' && 
        operationCreatedBy === userId && 
        accountAssignedTo === userId) {
        return isWithin48Hours(operationCreatedAt);
    }
    
    return false;
}

// Fonction utilitaire pour vérifier les permissions de suppression
function checkCreanceOperationDeletePermission(userRole, userId, operationCreatedBy, accountAssignedTo, operationCreatedAt) {
    // Seul l'admin peut supprimer
    if (userRole === 'admin') {
        return true;
    }
    
    // Directeur peut supprimer ses propres opérations dans les 48h
    if (userRole === 'directeur' && 
        operationCreatedBy === userId && 
        accountAssignedTo === userId) {
        return isWithin48Hours(operationCreatedAt);
    }
    
    return false;
}

// Fonction utilitaire pour vérifier si une date est dans les 48 heures
function isWithin48Hours(dateString) {
    if (!dateString) return false;
    
    const operationDate = new Date(dateString);
    const now = new Date();
    const diffHours = (now - operationDate) / (1000 * 60 * 60);
    
    return diffHours <= 48;
}

// Route pour obtenir le total des créances (somme des soldes de tous les clients)
app.get('/api/dashboard/total-creances', requireAuth, async (req, res) => {
    try {
        const userRole = req.session.user.role;
        const userId = req.session.user.id;

        let accountFilter = '';
        let params = [];

        // Filtrer selon les permissions
        if (userRole === 'directeur') {
            accountFilter = 'AND a.user_id = $1';
            params = [userId];
        }

        const result = await pool.query(`
            SELECT 
                COALESCE(SUM(
                    cc.initial_credit + 
                    COALESCE(credits.total_credits, 0) - 
                    COALESCE(debits.total_debits, 0)
                ), 0) as total_creances
            FROM creance_clients cc
            JOIN accounts a ON cc.account_id = a.id
            LEFT JOIN (
                SELECT client_id, SUM(amount) as total_credits
                FROM creance_operations 
                WHERE operation_type = 'credit'
                GROUP BY client_id
            ) credits ON cc.id = credits.client_id
            LEFT JOIN (
                SELECT client_id, SUM(amount) as total_debits
                FROM creance_operations 
                WHERE operation_type = 'debit'
                GROUP BY client_id
            ) debits ON cc.id = debits.client_id
            WHERE a.account_type = 'creance' 
            AND a.is_active = true 
            AND cc.is_active = true
            ${accountFilter}
        `, params);

        const totalCreances = parseInt(result.rows[0].total_creances) || 0;

        res.json({ 
            total_creances: totalCreances,
            formatted: `${totalCreances.toLocaleString('fr-FR')} FCFA`
        });

    } catch (error) {
        console.error('Erreur récupération total créances:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour obtenir les créances du mois en cours (Total Avances seulement)
app.get('/api/dashboard/creances-mois', requireAuth, async (req, res) => {
    try {
        const userRole = req.session.user.role;
        const userId = req.session.user.id;

        let accountFilter = '';
        let params = [];

        // Filtrer selon les permissions
        if (userRole === 'directeur') {
            accountFilter = 'AND a.user_id = $1';
            params = [userId];
        }

        // Calculer le début et la fin du mois en cours
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

        const startOfMonthStr = startOfMonth.toISOString().split('T')[0];
        const endOfMonthStr = endOfMonth.toISOString().split('T')[0] + ' 23:59:59';

        // Paramètres pour la requête
        const queryParams = userRole === 'directeur' ? [userId, startOfMonthStr, endOfMonthStr] : [startOfMonthStr, endOfMonthStr];

        const result = await pool.query(`
            SELECT 
                COALESCE(
                    -- Total des avances (crédits) du mois seulement
                    (SELECT SUM(co.amount)
                     FROM creance_operations co
                     JOIN creance_clients cc ON co.client_id = cc.id
                     JOIN accounts a ON cc.account_id = a.id
                     WHERE co.operation_type = 'credit'
                     AND co.operation_date >= $${userRole === 'directeur' ? '2' : '1'}
                     AND co.operation_date <= $${userRole === 'directeur' ? '3' : '2'}
                     AND a.account_type = 'creance' 
                     AND a.is_active = true 
                     AND cc.is_active = true
                     ${accountFilter}
                    ), 0
                ) as total_avances_mois
        `, queryParams);

        const totalAvancesMois = parseInt(result.rows[0].total_avances_mois) || 0;

        res.json({ 
            creances_mois: totalAvancesMois,
            formatted: `${totalAvancesMois.toLocaleString('fr-FR')} FCFA`,
            period: `${startOfMonth.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}`,
            description: 'Total Avances'
        });

    } catch (error) {
        console.error('Erreur récupération total avances du mois:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour modifier un client créance (DG, PCA, Admin)
app.put('/api/creance/:accountId/clients/:clientId', requireAdminAuth, async (req, res) => {
    try {
        const { accountId, clientId } = req.params;
        const { client_name, client_phone, client_address, initial_credit } = req.body;

        // Vérifier que le compte existe et est de type créance
        const accountResult = await pool.query(
            'SELECT * FROM accounts WHERE id = $1 AND account_type = $2 AND is_active = true',
            [accountId, 'creance']
        );

        if (accountResult.rows.length === 0) {
            return res.status(404).json({ error: 'Compte créance non trouvé' });
        }

        // Vérifier que le client existe pour ce compte
        const clientResult = await pool.query(
            'SELECT * FROM creance_clients WHERE id = $1 AND account_id = $2 AND is_active = true',
            [clientId, accountId]
        );

        if (clientResult.rows.length === 0) {
            return res.status(404).json({ error: 'Client non trouvé pour ce compte' });
        }

        // Vérifier qu'aucun autre client ACTIF avec ce nom n'existe pour ce compte
        const existingClientResult = await pool.query(
            'SELECT id FROM creance_clients WHERE account_id = $1 AND client_name = $2 AND is_active = true AND id != $3',
            [accountId, client_name, clientId]
        );

        if (existingClientResult.rows.length > 0) {
            return res.status(400).json({ error: 'Un autre client avec ce nom existe déjà pour ce compte' });
        }

        // Mettre à jour le client
        const updateResult = await pool.query(`
            UPDATE creance_clients 
            SET client_name = $1, client_phone = $2, client_address = $3, initial_credit = $4
            WHERE id = $5 AND account_id = $6
            RETURNING *
        `, [client_name, client_phone || null, client_address || null, parseInt(initial_credit) || 0, clientId, accountId]);

        res.json({ 
            message: 'Client modifié avec succès', 
            client: updateResult.rows[0] 
        });
    } catch (error) {
        console.error('Erreur modification client créance:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Middleware pour vérifier les permissions admin strictes (admin seulement)
const requireStrictAdminAuth = (req, res, next) => {
    if (!req.session?.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Accès refusé - Seul l\'admin peut effectuer cette action' });
    }
    next();
};

// Route pour supprimer un client créance (Admin seulement)
app.delete('/api/creance/:accountId/clients/:clientId', requireStrictAdminAuth, async (req, res) => {
    try {
        const { accountId, clientId } = req.params;

        // Vérifier que le compte existe et est de type créance
        const accountResult = await pool.query(
            'SELECT * FROM accounts WHERE id = $1 AND account_type = $2 AND is_active = true',
            [accountId, 'creance']
        );

        if (accountResult.rows.length === 0) {
            return res.status(404).json({ error: 'Compte créance non trouvé' });
        }

        // Vérifier que le client existe pour ce compte
        const clientResult = await pool.query(
            'SELECT * FROM creance_clients WHERE id = $1 AND account_id = $2 AND is_active = true',
            [clientId, accountId]
        );

        if (clientResult.rows.length === 0) {
            return res.status(404).json({ error: 'Client non trouvé pour ce compte' });
        }

        const client = clientResult.rows[0];

        await pool.query('BEGIN');

        try {
            // Supprimer toutes les opérations liées au client
            await pool.query('DELETE FROM creance_operations WHERE client_id = $1', [clientId]);

            // Supprimer définitivement le client
            await pool.query('DELETE FROM creance_clients WHERE id = $1', [clientId]);

            await pool.query('COMMIT');

            res.json({ 
                message: `Client "${client.client_name}" supprimé définitivement avec succès (ainsi que toutes ses opérations)` 
            });

        } catch (error) {
            await pool.query('ROLLBACK');
            throw error;
        }

    } catch (error) {
        console.error('Erreur suppression client créance:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ===== GESTION CASH BICTORYS MOIS =====

// Créer la table Cash Bictorys si elle n'existe pas
async function createCashBictorysTableIfNotExists() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS cash_bictorys (
                id SERIAL PRIMARY KEY,
                date DATE NOT NULL,
                amount INTEGER DEFAULT 0,
                month_year VARCHAR(7) NOT NULL, -- Format YYYY-MM
                created_by INTEGER REFERENCES users(id),
                updated_by INTEGER REFERENCES users(id),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(date)
            )
        `);

        console.log('Table cash_bictorys créée avec succès');
    } catch (error) {
        console.error('Erreur création table cash_bictorys:', error);
    }
}

// Initialiser la table au démarrage
createCashBictorysTableIfNotExists();

// Middleware pour vérifier les permissions Cash Bictorys (Tous les utilisateurs connectés)
const requireCashBictorysAuth = (req, res, next) => {
    if (!req.session?.user) {
        return res.status(403).json({ error: 'Accès refusé - Connexion requise' });
    }
    next();
};

// Route pour obtenir les données Cash Bictorys d'un mois donné
app.get('/api/cash-bictorys/:monthYear', requireCashBictorysAuth, async (req, res) => {
    try {
        const { monthYear } = req.params; // Format YYYY-MM
        
        // Valider le format
        if (!/^\d{4}-\d{2}$/.test(monthYear)) {
            return res.status(400).json({ error: 'Format mois invalide. Utiliser YYYY-MM' });
        }

        // Générer toutes les dates du mois
        const [year, month] = monthYear.split('-').map(Number);
        const daysInMonth = new Date(year, month, 0).getDate();
        const allDates = [];
        
        for (let day = 1; day <= daysInMonth; day++) {
            allDates.push({
                date: `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`,
                amount: 0 // Valeur par défaut
            });
        }

        // Récupérer les données existantes
        const result = await pool.query(`
            SELECT date, amount
            FROM cash_bictorys 
            WHERE month_year = $1
            ORDER BY date
        `, [monthYear]);

        // Fusionner les données existantes avec les dates par défaut
        const existingData = result.rows.reduce((acc, row) => {
            const dateStr = row.date.toISOString().split('T')[0];
            acc[dateStr] = parseInt(row.amount) || 0;
            return acc;
        }, {});

        const finalData = allDates.map(dateObj => ({
            date: dateObj.date,
            amount: existingData[dateObj.date] || 0
        }));

        res.json({
            monthYear,
            data: finalData,
            monthName: new Date(year, month - 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
        });

    } catch (error) {
        console.error('Erreur récupération Cash Bictorys:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour mettre à jour les données Cash Bictorys d'un mois
app.put('/api/cash-bictorys/:monthYear', requireCashBictorysAuth, async (req, res) => {
    try {
        const { monthYear } = req.params;
        const { data } = req.body; // Array d'objets {date, amount}
        const userId = req.session.user.id;
        const userRole = req.session.user.role;

        // Valider le format
        if (!/^\d{4}-\d{2}$/.test(monthYear)) {
            return res.status(400).json({ error: 'Format mois invalide. Utiliser YYYY-MM' });
        }

        // Vérifier les permissions de modification
        const currentDate = new Date();
        const currentMonthYear = `${currentDate.getFullYear()}-${(currentDate.getMonth() + 1).toString().padStart(2, '0')}`;
        
        // DG et PCA peuvent modifier seulement le mois en cours, Admin peut tout modifier
        if (userRole !== 'admin' && monthYear !== currentMonthYear) {
            return res.status(403).json({ 
                error: 'Vous ne pouvez modifier que les données du mois en cours' 
            });
        }

        if (!Array.isArray(data)) {
            return res.status(400).json({ error: 'Les données doivent être un tableau' });
        }

        await pool.query('BEGIN');

        try {
            // Mettre à jour chaque entrée
            for (const entry of data) {
                const { date, amount } = entry;
                
                if (!date || amount === undefined) {
                    continue; // Ignorer les entrées invalides
                }

                // Vérifier que la date appartient au mois spécifié
                if (!date.startsWith(monthYear)) {
                    continue;
                }

                const amountValue = parseInt(amount) || 0;

                // Insérer ou mettre à jour
                await pool.query(`
                    INSERT INTO cash_bictorys (date, amount, month_year, created_by, updated_by)
                    VALUES ($1, $2, $3, $4, $4)
                    ON CONFLICT (date) 
                    DO UPDATE SET 
                        amount = $2,
                        updated_by = $4,
                        updated_at = CURRENT_TIMESTAMP
                `, [date, amountValue, monthYear, userId]);
            }

            await pool.query('COMMIT');

            res.json({ 
                message: 'Données Cash Bictorys mises à jour avec succès',
                monthYear
            });

        } catch (error) {
            await pool.query('ROLLBACK');
            throw error;
        }

    } catch (error) {
        console.error('Erreur mise à jour Cash Bictorys:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour obtenir le total Cash Bictorys d'un mois (pour le dashboard)
app.get('/api/cash-bictorys/:monthYear/total', requireCashBictorysAuth, async (req, res) => {
    try {
        const { monthYear } = req.params;
        
        if (!/^\d{4}-\d{2}$/.test(monthYear)) {
            return res.status(400).json({ error: 'Format mois invalide. Utiliser YYYY-MM' });
        }

        const result = await pool.query(`
            SELECT COALESCE(SUM(amount), 0) as total
            FROM cash_bictorys 
            WHERE month_year = $1
        `, [monthYear]);

        const total = parseInt(result.rows[0].total) || 0;

        res.json({
            monthYear,
            total,
            formatted: `${total.toLocaleString('fr-FR')} FCFA`
        });

    } catch (error) {
        console.error('Erreur total Cash Bictorys:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour obtenir la dernière valeur Cash Bictorys du mois en cours pour le dashboard
app.get('/api/dashboard/cash-bictorys-latest', requireAuth, async (req, res) => {
    try {
        // Calculer le mois en cours au format YYYY-MM
        const currentDate = new Date();
        const currentMonthYear = `${currentDate.getFullYear()}-${(currentDate.getMonth() + 1).toString().padStart(2, '0')}`;
        
        const result = await pool.query(`
            SELECT amount
            FROM cash_bictorys
            WHERE date = (
                SELECT MAX(date)
                FROM cash_bictorys
                WHERE amount != 0 
                AND month_year = $1
            )
            AND amount != 0
            AND month_year = $1
        `, [currentMonthYear]);

        const latestAmount = result.rows.length > 0 ? parseInt(result.rows[0].amount) || 0 : 0;

        res.json({
            latest_amount: latestAmount,
            formatted: `${latestAmount.toLocaleString('fr-FR')} FCFA`,
            month_year: currentMonthYear
        });

    } catch (error) {
        console.error('Erreur récupération dernière valeur Cash Bictorys:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});