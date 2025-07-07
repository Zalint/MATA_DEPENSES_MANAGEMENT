const { Pool } = require('pg');

const pool = new Pool({
    user: 'zalint',
    host: 'localhost',
    database: 'depenses_management',
    password: 'bonea2024',
    port: 5432,
});

(async () => {
    try {
        // Paramètre pour éviter l'injection SQL
        const accountName = 'Compte Directeur Commercial';
        
        const result = await pool.query(`
            SELECT 
                date_operation,
                heure_operation,
                type_operation,
                montant,
                description,
                effectue_par
            FROM (
                -- 1. CRÉDITS RÉGULIERS
                SELECT 
                    ch.created_at::date as date_operation,
                    ch.created_at::time as heure_operation,
                    'CRÉDIT' as type_operation,
                    ch.amount as montant,
                    COALESCE(ch.description, 'Crédit de compte') as description,
                    u.full_name as effectue_par,
                    ch.created_at as timestamp_tri
                FROM credit_history ch
                LEFT JOIN users u ON ch.credited_by = u.id
                LEFT JOIN accounts a ON ch.account_id = a.id
                WHERE a.account_name = $1
                
                UNION ALL
                
                -- 2. CRÉDITS SPÉCIAUX
                SELECT 
                    sch.credit_date as date_operation,
                    sch.created_at::time as heure_operation,
                    CASE 
                        WHEN sch.is_balance_override THEN 'CRÉDIT STATUT'
                        ELSE 'CRÉDIT SPÉCIAL'
                    END as type_operation,
                    sch.amount as montant,
                    COALESCE(sch.comment, 'Crédit spécial') as description,
                    u.full_name as effectue_par,
                    sch.created_at as timestamp_tri
                FROM special_credit_history sch
                LEFT JOIN users u ON sch.credited_by = u.id
                LEFT JOIN accounts a ON sch.account_id = a.id
                WHERE a.account_name = $1
                
                UNION ALL
                
                -- 3. DÉPENSES
                SELECT 
                    e.expense_date as date_operation,
                    e.created_at::time as heure_operation,
                    'DÉPENSE' as type_operation,
                    -e.total as montant,
                    COALESCE(e.designation, e.description, 'Dépense') as description,
                    u.full_name as effectue_par,
                    e.created_at as timestamp_tri
                FROM expenses e
                LEFT JOIN users u ON e.user_id = u.id
                LEFT JOIN accounts a ON e.account_id = a.id
                WHERE a.account_name = $1
                
                UNION ALL
                
                -- 4. OPÉRATIONS CRÉANCE
                SELECT 
                    co.operation_date as date_operation,
                    co.created_at::time as heure_operation,
                    CASE 
                        WHEN co.operation_type = 'credit' THEN 'CRÉDIT CRÉANCE'
                        WHEN co.operation_type = 'debit' THEN 'DÉBIT CRÉANCE'
                    END as type_operation,
                    CASE 
                        WHEN co.operation_type = 'credit' THEN co.amount
                        WHEN co.operation_type = 'debit' THEN -co.amount
                    END as montant,
                    COALESCE(co.description, cc.client_name) as description,
                    u.full_name as effectue_par,
                    co.created_at as timestamp_tri
                FROM creance_operations co
                LEFT JOIN creance_clients cc ON co.client_id = cc.id
                LEFT JOIN users u ON co.created_by = u.id
                LEFT JOIN accounts a ON cc.account_id = a.id
                WHERE a.account_name = $1
                
            ) mouvements
            ORDER BY timestamp_tri DESC
        `, [accountName]);

        console.log('Historique des mouvements :');
        console.log('----------------------------');
        result.rows.forEach(row => {
            console.log(`${row.date_operation} | ${row.heure_operation} | ${row.type_operation} | ${row.montant} | ${row.description} | ${row.effectue_par}`);
        });

        // Récupérer les informations du compte
        const accountInfo = await pool.query(`
            SELECT 
                account_name as nom_compte,
                account_type as type_compte,
                current_balance as solde_actuel,
                total_credited as total_credite,
                total_spent as total_depense
            FROM accounts 
            WHERE account_name = $1
        `, [accountName]);

        console.log('\nInformations du compte :');
        console.log('------------------------');
        console.log(accountInfo.rows[0]);

    } catch (err) {
        console.error('Erreur :', err);
    } finally {
        await pool.end();
    }
})(); 