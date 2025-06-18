// MATA GROUP - ADMIN API ENDPOINTS
const express = require('express');
const { Pool } = require('pg');

// Database connection (use same config as server.js)
const pool = new Pool({
    user: process.env.DB_USER || 'zalint',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'depenses_management',
    password: process.env.DB_PASSWORD || 'bonea2024',
    port: process.env.DB_PORT || 5432,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Middleware to check admin role
const requireAdmin = async (req, res, next) => {
    try {
        // Support both session.user.id and session.userId for robustness
        const userId = (req.session.user && req.session.user.id) ? req.session.user.id : req.session.userId;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Non authentifié' });
        }
        const userResult = await pool.query(
            'SELECT role FROM users WHERE id = $1 AND is_active = true',
            [userId]
        );
        if (userResult.rows.length === 0) {
            return res.status(403).json({ success: false, message: 'Utilisateur non trouvé' });
        }
        const userRole = userResult.rows[0].role;
        if (!['directeur_general', 'pca', 'admin'].includes(userRole)) {
            return res.status(403).json({ 
                success: false, 
                message: 'Accès refusé. Privilèges administrateur requis.' 
            });
        }
        req.adminUserId = userId;
        next();
    } catch (error) {
        console.error('Erreur vérification admin:', error);
        res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
};

// POST /api/admin/accounts/:id/delete - Delete account with backup
const deleteAccount = async (req, res) => {
    try {
        const accountId = parseInt(req.params.id);
        const { reason } = req.body;
        const adminUserId = req.adminUserId;

        if (!accountId || isNaN(accountId)) {
            return res.status(400).json({ 
                success: false, 
                message: 'ID de compte invalide' 
            });
        }

        const result = await pool.query(
            'SELECT admin_delete_account($1, $2, $3) as result',
            [accountId, adminUserId, reason || 'Suppression administrative']
        );

        const deleteResult = result.rows[0].result;

        if (deleteResult.success) {
            res.json({
                success: true,
                message: `Compte "${deleteResult.account_name}" supprimé avec succès`,
                backup_id: deleteResult.backup_id
            });
        } else {
            res.status(400).json({
                success: false,
                message: deleteResult.message || 'Erreur lors de la suppression'
            });
        }
    } catch (error) {
        console.error('Erreur suppression compte:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Erreur lors de la suppression du compte' 
        });
    }
};

// POST /api/admin/accounts/:id/empty - Empty account with backup
const emptyAccount = async (req, res) => {
    try {
        const accountId = parseInt(req.params.id);
        const { reason } = req.body;
        const adminUserId = req.adminUserId;

        console.log('Empty account request:', {
            accountId,
            reason,
            adminUserId,
            headers: req.headers,
            body: req.body
        });

        if (!accountId || isNaN(accountId)) {
            console.log('Invalid account ID:', accountId);
            return res.status(400).json({ 
                success: false, 
                message: 'ID de compte invalide' 
            });
        }

        // Check if account exists before proceeding
        const accountCheck = await pool.query('SELECT * FROM accounts WHERE id = $1', [accountId]);
        console.log('Account check result:', accountCheck.rows[0]);

        const result = await pool.query(
            'SELECT admin_empty_account($1, $2, $3) as result',
            [accountId, adminUserId, reason || 'Remise à zéro administrative']
        );

        console.log('Empty account function result:', result.rows[0].result);

        const emptyResult = result.rows[0].result;

        if (emptyResult.success) {
            res.json({
                success: true,
                message: `Compte "${emptyResult.account_name}" remis à zéro avec succès`,
                backup_id: emptyResult.backup_id
            });
        } else {
            console.log('Empty account failed:', emptyResult);
            res.status(400).json({
                success: false,
                message: emptyResult.message || 'Erreur lors de la remise à zéro'
            });
        }
    } catch (error) {
        console.error('Erreur détaillée remise à zéro compte:', {
            error: error.message,
            stack: error.stack,
            params: {
                accountId: req.params.id,
                reason: req.body.reason,
                adminUserId: req.adminUserId
            }
        });
        res.status(500).json({ 
            success: false, 
            message: 'Erreur lors de la remise à zéro du compte' 
        });
    }
};

// GET /api/admin/backups - Get all account backups
const getAccountBackups = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT * FROM account_backup_summary
            ORDER BY backup_date DESC LIMIT 100
        `);

        res.json({
            success: true,
            backups: result.rows
        });
    } catch (error) {
        console.error('Erreur récupération sauvegardes:', error);
        res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
};

module.exports = {
    requireAdmin,
    deleteAccount,
    emptyAccount,
    getAccountBackups
}; 