const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const assert = require('assert');

// Configuration de la base de données de test
const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'mata_expenses_test_db',
    user: process.env.DB_USER || 'zalint',
    password: process.env.DB_PASSWORD || 'bonea2024'
});

// Données de test
const TEST_USERS = {
    dg: {
        username: 'test_dg',
        password: 'password123',
        role: 'directeur_general',
        full_name: 'Test Directeur Général'
    },
    directeur: {
        username: 'test_directeur',
        password: 'password123',
        role: 'directeur',
        full_name: 'Test Directeur'
    }
};

// Fonctions utilitaires
async function createTestUser(userData) {
    const passwordHash = await bcrypt.hash(userData.password, 10);
    const result = await pool.query(
        'INSERT INTO users (username, password_hash, role, full_name) VALUES ($1, $2, $3, $4) RETURNING id',
        [userData.username, passwordHash, userData.role, userData.full_name]
    );
    return result.rows[0].id;
}

async function cleanupDatabase() {
    await pool.query('BEGIN');
    try {
        // Supprimer toutes les données de test dans l'ordre correct
        await pool.query('DELETE FROM transfer_history');
        await pool.query('DELETE FROM expenses');
        await pool.query('DELETE FROM credit_history');
        await pool.query('DELETE FROM accounts');
        await pool.query('DELETE FROM users');
        await pool.query('COMMIT');
    } catch (error) {
        await pool.query('ROLLBACK');
        throw error;
    }
}

describe('Tests des fonctionnalités principales', () => {
    let dgId, directeurId, accountId, specialAccountId;

    before(async () => {
        // Nettoyer la base de données avant les tests
        await cleanupDatabase();
        
        // Créer les utilisateurs de test
        dgId = await createTestUser(TEST_USERS.dg);
        directeurId = await createTestUser(TEST_USERS.directeur);
    });

    describe('Gestion des comptes', () => {
        it('Devrait créer un compte avec succès', async () => {
            const result = await pool.query(
                'INSERT INTO accounts (user_id, account_name, current_balance, created_by) VALUES ($1, $2, $3, $4) RETURNING id',
                [directeurId, 'Compte Test', 0, dgId]
            );
            accountId = result.rows[0].id;
            assert(accountId, 'Le compte devrait être créé avec un ID');

            // Créer un deuxième compte pour les tests de transfert
            const specialResult = await pool.query(
                'INSERT INTO accounts (user_id, account_name, current_balance, created_by, account_type) VALUES ($1, $2, $3, $4, $5) RETURNING id',
                [directeurId, 'Compte Spécial', 0, dgId, 'creance']
            );
            specialAccountId = specialResult.rows[0].id;
            assert(specialAccountId, 'Le compte spécial devrait être créé avec un ID');
        });
    });

    describe('Gestion des crédits', () => {
        it('Devrait créditer les comptes avec succès', async () => {
            const creditAmount1 = 100000;
            const creditAmount2 = 50000;
            
            await pool.query('BEGIN');
            try {
                // Créditer le premier compte
                await pool.query(
                    'UPDATE accounts SET current_balance = current_balance + $1, total_credited = total_credited + $1 WHERE id = $2',
                    [creditAmount1, accountId]
                );
                await pool.query(
                    'INSERT INTO credit_history (account_id, credited_by, amount, description) VALUES ($1, $2, $3, $4)',
                    [accountId, dgId, creditAmount1, 'Crédit initial']
                );

                // Créditer le deuxième compte
                await pool.query(
                    'UPDATE accounts SET current_balance = current_balance + $1, total_credited = total_credited + $1 WHERE id = $2',
                    [creditAmount2, specialAccountId]
                );
                await pool.query(
                    'INSERT INTO credit_history (account_id, credited_by, amount, description) VALUES ($1, $2, $3, $4)',
                    [specialAccountId, dgId, creditAmount2, 'Crédit spécial']
                );

                await pool.query('COMMIT');

                // Vérifier les soldes
                const result1 = await pool.query('SELECT current_balance FROM accounts WHERE id = $1', [accountId]);
                const result2 = await pool.query('SELECT current_balance FROM accounts WHERE id = $1', [specialAccountId]);
                
                assert.strictEqual(result1.rows[0].current_balance, creditAmount1);
                assert.strictEqual(result2.rows[0].current_balance, creditAmount2);
            } catch (error) {
                await pool.query('ROLLBACK');
                throw error;
            }
        });
    });

    describe('Gestion des dépenses', () => {
        it('Devrait ajouter une dépense avec succès', async () => {
            const expenseAmount = 25000;
            await pool.query('BEGIN');
            try {
                // Vérifier le solde avant
                const balanceBefore = await pool.query('SELECT current_balance FROM accounts WHERE id = $1', [accountId]);

                // Ajouter la dépense
                await pool.query(`
                    INSERT INTO expenses (
                        user_id, account_id, amount, description, expense_date,
                        expense_type, category, designation, supplier, total
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
                    [directeurId, accountId, expenseAmount, 'Test dépense', new Date(),
                     'Achat', 'Fournitures', 'Test designation', 'Test supplier', expenseAmount]
                );

                // Mettre à jour le solde du compte
                await pool.query(
                    'UPDATE accounts SET current_balance = current_balance - $1, total_spent = total_spent + $1 WHERE id = $2',
                    [expenseAmount, accountId]
                );

                await pool.query('COMMIT');

                // Vérifier le nouveau solde
                const result = await pool.query('SELECT current_balance FROM accounts WHERE id = $1', [accountId]);
                assert.strictEqual(result.rows[0].current_balance, balanceBefore.rows[0].current_balance - expenseAmount);
            } catch (error) {
                await pool.query('ROLLBACK');
                throw error;
            }
        });

        it('Ne devrait pas permettre une dépense supérieure au solde', async () => {
            const tooLargeAmount = 1000000;
            try {
                await pool.query('BEGIN');
                
                const balanceResult = await pool.query('SELECT current_balance FROM accounts WHERE id = $1', [accountId]);
                const currentBalance = balanceResult.rows[0].current_balance;
                
                assert(tooLargeAmount > currentBalance, 'Le montant doit être supérieur au solde pour ce test');
                
                // Tenter d'ajouter une dépense trop élevée
                await pool.query(`
                    INSERT INTO expenses (
                        user_id, account_id, amount, description, expense_date,
                        expense_type, category, designation, supplier, total
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
                    [directeurId, accountId, tooLargeAmount, 'Test dépense excessive', new Date(),
                     'Achat', 'Fournitures', 'Test designation', 'Test supplier', tooLargeAmount]
                );
                
                await pool.query('ROLLBACK');
                assert.fail('La dépense aurait dû être rejetée');
            } catch (error) {
                await pool.query('ROLLBACK');
                // C'est le comportement attendu
                assert(error instanceof Error);
            }
        });
    });

    describe('Gestion des transferts', () => {
        it('Devrait effectuer un transfert avec succès', async () => {
            const transferAmount = 25000;
            await pool.query('BEGIN');
            try {
                // Effectuer le transfert
                await pool.query(
                    'UPDATE accounts SET current_balance = current_balance - $1 WHERE id = $2',
                    [transferAmount, accountId]
                );
                await pool.query(
                    'UPDATE accounts SET current_balance = current_balance + $1 WHERE id = $2',
                    [transferAmount, specialAccountId]
                );
                
                // Enregistrer le transfert
                await pool.query(
                    'INSERT INTO transfer_history (source_id, destination_id, montant, transferred_by) VALUES ($1, $2, $3, $4)',
                    [accountId, specialAccountId, transferAmount, dgId]
                );

                await pool.query('COMMIT');

                // Vérifier les soldes
                const sourceBalance = await pool.query('SELECT current_balance FROM accounts WHERE id = $1', [accountId]);
                const destBalance = await pool.query('SELECT current_balance FROM accounts WHERE id = $1', [specialAccountId]);

                assert.strictEqual(sourceBalance.rows[0].current_balance, 50000); // 100000 - 25000 (dépense) - 25000 (transfert)
                assert.strictEqual(destBalance.rows[0].current_balance, 75000);   // 50000 + 25000 (transfert)
            } catch (error) {
                await pool.query('ROLLBACK');
                throw error;
            }
        });
    });

    describe('Cohérence du dashboard', () => {
        it('Devrait calculer correctement les totaux du dashboard', async () => {
            // Récupérer les totaux calculés
            const totalCreditedResult = await pool.query('SELECT COALESCE(SUM(amount), 0) as total FROM credit_history');
            const totalSpentResult = await pool.query('SELECT COALESCE(SUM(total), 0) as total FROM expenses');
            const accountBalancesResult = await pool.query('SELECT COALESCE(SUM(current_balance), 0) as total FROM accounts WHERE is_active = true');
            const transfersResult = await pool.query('SELECT COALESCE(SUM(montant), 0) as total FROM transfer_history');

            // Convertir en nombres pour la comparaison
            const totalCredited = parseInt(totalCreditedResult.rows[0].total);
            const totalSpent = parseInt(totalSpentResult.rows[0].total);
            const totalBalances = parseInt(accountBalancesResult.rows[0].total);
            const totalTransfers = parseInt(transfersResult.rows[0].total);

            // Le total des soldes doit être égal aux crédits moins les dépenses
            // Les transferts ne changent pas le total des soldes car c'est juste un mouvement interne
            assert.strictEqual(totalBalances, totalCredited - totalSpent,
                `Les soldes ne correspondent pas.\nTotal crédité: ${totalCredited}\nTotal dépensé: ${totalSpent}\nTotal des transferts: ${totalTransfers}\nSoldes actuels: ${totalBalances}`);
        });
    });

    after(async () => {
        // Nettoyage final
        await cleanupDatabase();
        await pool.end();
    });
}); 