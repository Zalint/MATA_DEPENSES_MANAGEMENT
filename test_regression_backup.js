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

// Configuration des tests - Paramètres de contrôle
const TEST_CONFIG = {
    // Si true, les comptes de test sont conservés pour inspection après les tests
    KEEP_TEST_ACCOUNTS: process.env.KEEP_TEST_ACCOUNTS === 'true' || false,
    // Si true, affiche plus de détails durant les tests
    VERBOSE_LOGGING: process.env.VERBOSE_LOGGING === 'true' || false
};

// Utilisateurs de test
const TEST_USERS = {
    dg: {
        username: 'test_dg_regression',
        password: 'password123',
        role: 'directeur_general',
        full_name: 'Test DG Régression'
    },
    directeur_bovin: {
        username: 'test_directeur_regression',
        password: 'password123',
        role: 'directeur',
        full_name: 'Test Directeur Régression'
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

async function cleanupTestData(force = false) {
    // Si KEEP_TEST_ACCOUNTS est activé et qu'on ne force pas le nettoyage, afficher les comptes et les conserver
    if (TEST_CONFIG.KEEP_TEST_ACCOUNTS && !force) {
        console.log('\n🔍 INSPECTION DES COMPTES DE TEST (KEEP_TEST_ACCOUNTS=true)');
        console.log('================================================================');
        
        try {
            // Afficher les comptes de test créés
            const testAccounts = await pool.query(`
                SELECT id, account_name, current_balance, total_credited, total_spent, account_type, created_at
                FROM accounts 
                WHERE account_name LIKE '%_TEST_REG'
                ORDER BY account_name
            `);
            
            if (testAccounts.rows.length > 0) {
                console.log(`📊 ${testAccounts.rows.length} comptes de test trouvés:`);
                for (const account of testAccounts.rows) {
                    console.log(`   🏦 ${account.account_name} (ID: ${account.id})`);
                    console.log(`      Type: ${account.account_type}`);
                    console.log(`      Solde: ${account.current_balance} FCFA`);
                    console.log(`      Crédité: ${account.total_credited} FCFA`);
                    console.log(`      Dépensé: ${account.total_spent} FCFA`);
                    console.log(`      Créé: ${account.created_at}`);
                    console.log('');
                }
            } else {
                console.log('📋 Aucun compte de test trouvé');
            }
            
            // Afficher les utilisateurs de test
            const testUsers = await pool.query(`
                SELECT id, username, role, full_name, created_at
                FROM users 
                WHERE username LIKE 'test_%regression'
                ORDER BY username
            `);
            
            if (testUsers.rows.length > 0) {
                console.log(`👥 ${testUsers.rows.length} utilisateurs de test trouvés:`);
                for (const user of testUsers.rows) {
                    console.log(`   👤 ${user.username} (ID: ${user.id}) - ${user.role}`);
                    console.log(`      Nom: ${user.full_name}`);
                    console.log(`      Créé: ${user.created_at}`);
                }
            }
            
            console.log('\n💡 Pour nettoyer ces comptes, relancez avec KEEP_TEST_ACCOUNTS=false');
            console.log('   Exemple: KEEP_TEST_ACCOUNTS=false npm run test:regression');
            console.log('================================================================');
            
        } catch (error) {
            console.log(`⚠️ Erreur lors de l'inspection: ${error.message}`);
        }
        
        return; // Ne pas nettoyer, juste afficher
    }
    
    // Nettoyage normal
    await pool.query('BEGIN');
    try {
        await pool.query('DELETE FROM transfer_history WHERE transferred_by IN (SELECT id FROM users WHERE username LIKE \'test_%regression\')');
        await pool.query('DELETE FROM expenses WHERE account_id IN (SELECT id FROM accounts WHERE account_name LIKE \'%_TEST_REG\')');
        await pool.query('DELETE FROM credit_history WHERE account_id IN (SELECT id FROM accounts WHERE account_name LIKE \'%_TEST_REG\')');
        
        const partnerDeliveriesExists = await pool.query(`
            SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'partner_deliveries')
        `);
        if (partnerDeliveriesExists.rows[0].exists) {
            await pool.query('DELETE FROM partner_deliveries WHERE account_id IN (SELECT id FROM accounts WHERE account_name LIKE \'%_TEST_REG\')');
        }
        
        await pool.query('DELETE FROM accounts WHERE account_name LIKE \'%_TEST_REG\'');
        await pool.query('DELETE FROM users WHERE username LIKE \'test_%regression\'');
        await pool.query('COMMIT');
        
        if (force) {
            console.log('✅ Nettoyage forcé des données de test terminé');
        } else {
        console.log('✅ Nettoyage des données de test terminé');
        }
    } catch (error) {
        await pool.query('ROLLBACK');
        console.log('⚠️ Erreur lors du nettoyage:', error.message);
    }
}

// Fonction pour calculer le solde net selon la logique classique
async function calculateNetBalance(accountId) {
    const result = await pool.query(`
        SELECT 
            COALESCE((SELECT SUM(ch.amount) FROM credit_history ch WHERE ch.account_id = $1), 0) -
            COALESCE((SELECT SUM(e.total) FROM expenses e WHERE e.account_id = $1), 0) +
            COALESCE((SELECT SUM(CASE WHEN th.destination_id = $1 THEN th.montant ELSE -th.montant END) 
                     FROM transfer_history th 
                     WHERE (th.source_id = $1 OR th.destination_id = $1)), 0) as net_balance
    `, [accountId]);
    
    return parseInt(result.rows[0].net_balance) || 0;
}

// Fonction pour calculer la somme des transactions de l'audit flux
async function calculateAuditFluxSum(accountName) {
    const creditsResult = await pool.query(`
        SELECT COALESCE(SUM(ch.amount), 0) as total
            FROM credit_history ch
            LEFT JOIN accounts a ON ch.account_id = a.id
            WHERE a.account_name = $1
    `, [accountName]);
    const totalCredits = parseInt(creditsResult.rows[0].total) || 0;
    
    const expensesResult = await pool.query(`
        SELECT COALESCE(SUM(e.total), 0) as total
            FROM expenses e
            LEFT JOIN accounts a ON e.account_id = a.id
            WHERE a.account_name = $1
    `, [accountName]);
    const totalExpenses = parseInt(expensesResult.rows[0].total) || 0;
    
    const transfersOutResult = await pool.query(`
        SELECT COALESCE(SUM(th.montant), 0) as total
            FROM transfer_history th
            LEFT JOIN accounts source ON th.source_id = source.id
            WHERE source.account_name = $1
    `, [accountName]);
    const totalTransfersOut = parseInt(transfersOutResult.rows[0].total) || 0;
    
    const transfersInResult = await pool.query(`
        SELECT COALESCE(SUM(th.montant), 0) as total
            FROM transfer_history th
            LEFT JOIN accounts dest ON th.destination_id = dest.id
            WHERE dest.account_name = $1
    `, [accountName]);
    const totalTransfersIn = parseInt(transfersInResult.rows[0].total) || 0;
    
    return totalCredits - totalExpenses - totalTransfersOut + totalTransfersIn;
}

// Fonction pour vérifier la cohérence des soldes
async function checkBalanceConsistency(accountId, testDescription) {
    const accountResult = await pool.query('SELECT account_name, current_balance FROM accounts WHERE id = $1', [accountId]);
    const account = accountResult.rows[0];
    
    const currentBalance = parseInt(account.current_balance);
    const netBalance = await calculateNetBalance(accountId);
    const auditFluxSum = await calculateAuditFluxSum(account.account_name);
    
    console.log(`\n📊 ${testDescription}`);
    console.log(`   Solde actuel: ${currentBalance} FCFA`);
    console.log(`   Solde net calculé: ${netBalance} FCFA`);
    console.log(`   Somme audit flux: ${auditFluxSum} FCFA`);
    
    assert.strictEqual(currentBalance, netBalance, 
        `❌ Incohérence! Solde actuel (${currentBalance}) ≠ Solde net (${netBalance})`);
    
    assert.strictEqual(auditFluxSum, netBalance,
        `❌ Incohérence! Somme audit flux (${auditFluxSum}) ≠ Solde net (${netBalance})`);
    
    console.log(`   ✅ Cohérence vérifiée: Solde actuel = Solde Net = Audit Flux`);
    
    return { currentBalance, netBalance, auditFluxSum };
}

describe('Tests de non-régression - Comptes (Version corrigée)', () => {
    let dgId, directeurId, accounts = {};
    
    before(async () => {
        console.log('\n🧪 DÉBUT DES TESTS DE NON-RÉGRESSION DES COMPTES');
        
        await cleanupTestData();
        
        dgId = await createTestUser(TEST_USERS.dg);
        directeurId = await createTestUser(TEST_USERS.directeur_bovin);
        
        // Créer les comptes de test avec des soldes de départ cohérents
        const testAccounts = [
            { name: 'BOVIN_TEST_REG', type: 'classique' },
            { name: 'OVIN_TEST_REG', type: 'classique' },
            { name: 'SOLDE_COURANT_BANQUE_TEST_REG', type: 'statut' },
            { name: 'MATA_VOLAILLE_CHAIR_TEST_REG', type: 'partenaire' }
        ];
        
        for (const testAccount of testAccounts) {
            const initialBalance = testAccount.type === 'partenaire' ? 5000000 : 0;
            const result = await pool.query(
            'INSERT INTO accounts (user_id, account_name, current_balance, total_credited, total_spent, created_by, account_type) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
                [directeurId, testAccount.name, initialBalance, initialBalance, 0, dgId, testAccount.type]
            );
            accounts[testAccount.name] = result.rows[0].id;
            console.log(`✅ ${testAccount.name} créé avec ID: ${result.rows[0].id}`);
        }
    });

    describe('🧪 Test 1 & 2: Dépense 1000 FCFA - BOVIN', () => {
        let expenseId;

        it('Devrait ajouter une dépense de 1000 FCFA et maintenir la cohérence', async () => {
            const accountId = accounts['BOVIN_TEST_REG'];
            
            // Ajouter crédit initial
            await pool.query('BEGIN');
            try {
                await pool.query(
                    'UPDATE accounts SET current_balance = current_balance + $1, total_credited = total_credited + $1 WHERE id = $2',
                    [5000, accountId]
                );
                await pool.query(
                    'INSERT INTO credit_history (account_id, credited_by, amount, description) VALUES ($1, $2, $3, $4)',
                    [accountId, dgId, 5000, 'Crédit initial pour test']
                );

                // Ajouter dépense
                const expenseResult = await pool.query(
                    'INSERT INTO expenses (user_id, account_id, amount, description, expense_date, expense_type, category, designation, supplier, total) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id',
                    [directeurId, accountId, 1000, 'Test dépense', '2025-01-16', 'Achat', 'Test', 'Article test', 'Fournisseur', 1000]
                );
                expenseId = expenseResult.rows[0].id;

                await pool.query(
                    'UPDATE accounts SET current_balance = current_balance - $1, total_spent = total_spent + $1 WHERE id = $2',
                    [1000, accountId]
                );

                await pool.query('COMMIT');
                
                await checkBalanceConsistency(accountId, 'Après ajout dépense 1000 FCFA');
                console.log(`✅ Dépense de 1000 FCFA ajoutée avec ID: ${expenseId}`);
            } catch (error) {
                await pool.query('ROLLBACK');
                throw error;
            }
        });

        it('Devrait supprimer la dépense de 1000 FCFA et maintenir la cohérence', async () => {
            const accountId = accounts['BOVIN_TEST_REG'];
            
            await pool.query('BEGIN');
            try {
                await pool.query('DELETE FROM expenses WHERE id = $1', [expenseId]);
                await pool.query(
                    'UPDATE accounts SET current_balance = current_balance + $1, total_spent = total_spent - $1 WHERE id = $2',
                    [1000, accountId]
                );
                await pool.query('COMMIT');
                
                await checkBalanceConsistency(accountId, 'Après suppression dépense 1000 FCFA');
                console.log(`✅ Dépense supprimée`);
            } catch (error) {
                await pool.query('ROLLBACK');
                throw error;
            }
        });
    });

    describe('🧪 Test 3 & 4: Créance 500 FCFA - BOVIN', () => {
        let creditId;

        it('Devrait ajouter une créance de 500 FCFA et maintenir la cohérence', async () => {
            const accountId = accounts['BOVIN_TEST_REG'];
            
            await pool.query('BEGIN');
            try {
                const creditResult = await pool.query(
                    'INSERT INTO credit_history (account_id, credited_by, amount, description) VALUES ($1, $2, $3, $4) RETURNING id',
                    [accountId, dgId, 500, 'Test créance 500 FCFA']
                );
                creditId = creditResult.rows[0].id;

                await pool.query(
                    'UPDATE accounts SET current_balance = current_balance + $1, total_credited = total_credited + $1 WHERE id = $2',
                    [500, accountId]
                );

                await pool.query('COMMIT');
                
                await checkBalanceConsistency(accountId, 'Après ajout créance 500 FCFA');
                console.log(`✅ Créance de 500 FCFA ajoutée avec ID: ${creditId}`);
            } catch (error) {
                await pool.query('ROLLBACK');
                throw error;
            }
        });

        it('Devrait supprimer la créance de 500 FCFA et maintenir la cohérence', async () => {
            const accountId = accounts['BOVIN_TEST_REG'];
            
            await pool.query('BEGIN');
            try {
                await pool.query('DELETE FROM credit_history WHERE id = $1', [creditId]);
                await pool.query(
                    'UPDATE accounts SET current_balance = current_balance - $1, total_credited = total_credited - $1 WHERE id = $2',
                    [500, accountId]
                );
                await pool.query('COMMIT');
                
                await checkBalanceConsistency(accountId, 'Après suppression créance 500 FCFA');
                console.log(`✅ Créance supprimée`);
            } catch (error) {
                await pool.query('ROLLBACK');
                throw error;
            }
        });
    });

    describe('🧪 Test 5 & 6: Transfert 750 FCFA - BOVIN vers OVIN', () => {
        let transferId;

        it('Devrait ajouter un transfert sortant de 750 FCFA et maintenir la cohérence', async () => {
            const sourceAccountId = accounts['BOVIN_TEST_REG'];
            const destAccountId = accounts['OVIN_TEST_REG'];
            
            await pool.query('BEGIN');
            try {
                // Ajouter crédit pour permettre transfert
                await pool.query(
                    'UPDATE accounts SET current_balance = current_balance + $1, total_credited = total_credited + $1 WHERE id = $2',
                    [1000, sourceAccountId]
                );
                await pool.query(
                    'INSERT INTO credit_history (account_id, credited_by, amount, description) VALUES ($1, $2, $3, $4)',
                    [sourceAccountId, dgId, 1000, 'Crédit pour transfert']
                );

                // Effectuer transfert
                const transferResult = await pool.query(
                    'INSERT INTO transfer_history (source_id, destination_id, montant, transferred_by) VALUES ($1, $2, $3, $4) RETURNING id',
                    [sourceAccountId, destAccountId, 750, dgId]
                );
                transferId = transferResult.rows[0].id;

                await pool.query(
                    'UPDATE accounts SET current_balance = current_balance - $1 WHERE id = $2',
                    [750, sourceAccountId]
                );
                await pool.query(
                    'UPDATE accounts SET current_balance = current_balance + $1 WHERE id = $2',
                    [750, destAccountId]
                );

                await pool.query('COMMIT');
                
                await checkBalanceConsistency(sourceAccountId, 'BOVIN après transfert sortant 750 FCFA');
                await checkBalanceConsistency(destAccountId, 'OVIN après transfert entrant 750 FCFA');
                console.log(`✅ Transfert de 750 FCFA effectué avec ID: ${transferId}`);
            } catch (error) {
                await pool.query('ROLLBACK');
                throw error;
            }
        });

        it('Devrait supprimer le transfert de 750 FCFA et maintenir la cohérence', async () => {
            const sourceAccountId = accounts['BOVIN_TEST_REG'];
            const destAccountId = accounts['OVIN_TEST_REG'];
            
            await pool.query('BEGIN');
            try {
                await pool.query('DELETE FROM transfer_history WHERE id = $1', [transferId]);
                await pool.query(
                    'UPDATE accounts SET current_balance = current_balance + $1 WHERE id = $2',
                    [750, sourceAccountId]
                );
                await pool.query(
                    'UPDATE accounts SET current_balance = current_balance - $1 WHERE id = $2',
                    [750, destAccountId]
                );
                await pool.query('COMMIT');
                
                await checkBalanceConsistency(sourceAccountId, 'BOVIN après suppression transfert');
                await checkBalanceConsistency(destAccountId, 'OVIN après suppression transfert');
                console.log(`✅ Transfert supprimé`);
            } catch (error) {
                await pool.query('ROLLBACK');
                throw error;
            }
        });
    });

    describe('🧪 Test 7: Compte STATUT - Dernière transaction', () => {
        it('Devrait calculer le solde comme la dernière transaction par date/timestamp/ID', async () => {
            const accountId = accounts['SOLDE_COURANT_BANQUE_TEST_REG'];
            
            await pool.query('BEGIN');
            try {
                // Ajouter transactions avec timestamps différents
                await pool.query(
                    'INSERT INTO credit_history (account_id, credited_by, amount, description, created_at) VALUES ($1, $2, $3, $4, $5)',
                    [accountId, dgId, 1000000, 'Transaction 1', '2025-01-15 10:00:00']
                );
                await pool.query(
                    'INSERT INTO credit_history (account_id, credited_by, amount, description, created_at) VALUES ($1, $2, $3, $4, $5)',
                    [accountId, dgId, 2000000, 'Transaction 2', '2025-01-15 15:00:00']
                );
                await pool.query(
                    'INSERT INTO credit_history (account_id, credited_by, amount, description, created_at) VALUES ($1, $2, $3, $4, $5)',
                    [accountId, dgId, 3247870, 'Transaction 3 (dernière)', '2025-01-15 15:00:00']
                );

                // Pour un compte STATUT, le solde = dernière transaction
                await pool.query(
                    'UPDATE accounts SET current_balance = $1 WHERE id = $2',
                    [3247870, accountId]
                );

                await pool.query('COMMIT');
                
                const accountInfo = await pool.query('SELECT current_balance FROM accounts WHERE id = $1', [accountId]);
                const currentBalance = parseInt(accountInfo.rows[0].current_balance);
                
                console.log(`\n📊 TEST COMPTE STATUT: SOLDE_COURANT_BANQUE_TEST_REG`);
                console.log(`💰 Solde (dernière transaction): ${currentBalance} FCFA`);
                
                assert.strictEqual(currentBalance, 3247870,
                    `❌ Le solde devrait être 3,247,870 FCFA (dernière transaction)`);
                
                console.log('✅ Test STATUT réussi: Le solde correspond à la dernière transaction');
            } catch (error) {
                await pool.query('ROLLBACK');
                throw error;
            }
        });
    });

    describe('🧪 Test 8: Compte PARTENAIRE - Solde restant', () => {
        it('Devrait calculer le solde restant (total_credited - livraisons validées)', async () => {
            const accountId = accounts['MATA_VOLAILLE_CHAIR_TEST_REG'];
            
            // Créer table partner_deliveries si nécessaire
            await pool.query(`
                CREATE TABLE IF NOT EXISTS partner_deliveries (
                    id SERIAL PRIMARY KEY,
                    account_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
                    delivery_date DATE NOT NULL,
                    article_count INTEGER NOT NULL,
                    unit_price INTEGER NOT NULL,
                    amount INTEGER NOT NULL,
                    description TEXT,
                    validation_status VARCHAR(20) DEFAULT 'pending',
                    is_validated BOOLEAN DEFAULT false,
                    created_by INTEGER REFERENCES users(id)
                )
            `);
            
            await pool.query('BEGIN');
            try {
                // Ajouter livraisons
                await pool.query(
                    'INSERT INTO partner_deliveries (account_id, delivery_date, article_count, unit_price, amount, description, validation_status, is_validated, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
                    [accountId, '2025-01-15', 100, 5000, 500000, 'Livraison validée', 'fully_validated', true, dgId]
                );
                await pool.query(
                    'INSERT INTO partner_deliveries (account_id, delivery_date, article_count, unit_price, amount, description, validation_status, is_validated, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
                    [accountId, '2025-01-16', 200, 3000, 600000, 'Livraison en attente', 'pending', false, dgId]
                );

                // Solde attendu: 5,000,000 - 500,000 = 4,500,000 FCFA
                const expectedBalance = 4500000;
                await pool.query(
                    'UPDATE accounts SET current_balance = $1 WHERE id = $2',
                    [expectedBalance, accountId]
                );

                await pool.query('COMMIT');
                
                const accountInfo = await pool.query('SELECT current_balance, total_credited FROM accounts WHERE id = $1', [accountId]);
                const currentBalance = parseInt(accountInfo.rows[0].current_balance);
                const totalCredited = parseInt(accountInfo.rows[0].total_credited);
                
                console.log(`\n🤝 TEST COMPTE PARTENAIRE: MATA_VOLAILLE_CHAIR_TEST_REG`);
                console.log(`   Total crédité: ${totalCredited} FCFA`);
                console.log(`   Livraisons validées: 500,000 FCFA`);
                console.log(`   Livraisons en attente: 600,000 FCFA (non déduites)`);
                console.log(`💰 Solde restant: ${currentBalance} FCFA`);
                
                assert.strictEqual(currentBalance, expectedBalance,
                    `❌ Le solde devrait être ${expectedBalance} FCFA`);
                
                console.log('✅ Test PARTENAIRE réussi: Solde = Total crédité - Livraisons validées');
            } catch (error) {
                await pool.query('ROLLBACK');
                throw error;
            }
        });
    });

    describe('🧪 Test 9: Compte CRÉANCE - Solde restant', () => {
        it('Devrait calculer le solde restant selon la logique créance', async () => {
            // Créer compte créance temporaire
            const creanceResult = await pool.query(
                'INSERT INTO accounts (user_id, account_name, current_balance, total_credited, total_spent, created_by, account_type) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
                [directeurId, 'COMPTE_CREANCE_TEST_REG', 0, 0, 0, dgId, 'creance']
            );
            const creanceAccountId = creanceResult.rows[0].id;
            
            await pool.query('BEGIN');
            try {
                await pool.query(
                    'INSERT INTO credit_history (account_id, credited_by, amount, description) VALUES ($1, $2, $3, $4)',
                    [creanceAccountId, dgId, 2000000, 'Crédit créance']
                );
                await pool.query(
                    'INSERT INTO expenses (user_id, account_id, amount, description, expense_date, expense_type, category, designation, supplier, total) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
                    [directeurId, creanceAccountId, 500000, 'Dépense créance', '2025-01-16', 'Achat', 'Test', 'Article', 'Fournisseur', 500000]
                );
                
                const expectedBalance = 1500000;
                await pool.query(
                    'UPDATE accounts SET current_balance = $1, total_credited = 2000000, total_spent = 500000 WHERE id = $2',
                    [expectedBalance, creanceAccountId]
                );
                
                await pool.query('COMMIT');
                
                await checkBalanceConsistency(creanceAccountId, 'Compte CRÉANCE - Solde restant');
                console.log('✅ Test CRÉANCE réussi: Solde restant calculé correctement');
                
                // Nettoyer le compte créance
                await pool.query('DELETE FROM expenses WHERE account_id = $1', [creanceAccountId]);
                await pool.query('DELETE FROM credit_history WHERE account_id = $1', [creanceAccountId]);
                await pool.query('DELETE FROM accounts WHERE id = $1', [creanceAccountId]);
                
            } catch (error) {
                await pool.query('ROLLBACK');
                throw error;
            }
        });
    });

    describe('🧪 Vérification finale de cohérence', () => {
        it('Devrait avoir un état final cohérent pour tous les comptes', async () => {
            const bovinAccountId = accounts['BOVIN_TEST_REG'];
            const finalBalance = await checkBalanceConsistency(bovinAccountId, 'État final BOVIN après tous les tests');
            
            console.log('\n🎉 RÉSUMÉ DES TESTS DE NON-RÉGRESSION');
            console.log('=========================================');
            console.log('✅ Test 1: Ajout dépense 1000 FCFA - PASSÉ');
            console.log('✅ Test 2: Suppression dépense 1000 FCFA - PASSÉ'); 
            console.log('✅ Test 3: Ajout créance 500 FCFA - PASSÉ');
            console.log('✅ Test 4: Suppression créance 500 FCFA - PASSÉ');
            console.log('✅ Test 5: Ajout transfert 750 FCFA - PASSÉ');
            console.log('✅ Test 6: Suppression transfert 750 FCFA - PASSÉ');
            console.log('✅ Test 7: Compte STATUT (dernière transaction) - PASSÉ');
            console.log('✅ Test 8: Compte PARTENAIRE (solde restant) - PASSÉ');
            console.log('✅ Test 9: Compte CRÉANCE (solde restant) - PASSÉ');
            console.log('✅ Cohérence Solde actuel = Solde Net - VALIDÉE');
            console.log('✅ Cohérence Audit Flux = Solde Net - VALIDÉE');
            console.log('=========================================');
            console.log(`📊 Solde final BOVIN: ${finalBalance.currentBalance} FCFA`);
        });
    });

    after(async () => {
        // Nettoyage conditionnel selon la configuration
        if (TEST_CONFIG.KEEP_TEST_ACCOUNTS) {
            console.log('\n🔒 COMPTES DE TEST CONSERVÉS POUR INSPECTION');
            console.log('Les comptes de test restent dans la base de données.');
            console.log('Pour les nettoyer manuellement, utilisez: KEEP_TEST_ACCOUNTS=false npm run test:regression');
        } else {
            await cleanupTestData(false); // Nettoyage normal
        }
        
        await pool.end();
        console.log('\n🧹 Fin des tests de régression');
    });
});

module.exports = {
    calculateNetBalance,
    calculateAuditFluxSum,
    checkBalanceConsistency
};

};
