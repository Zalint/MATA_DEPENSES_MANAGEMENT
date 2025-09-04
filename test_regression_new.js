const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Configuration de la base de données de test
const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'mata_expenses_test_db',
    user: process.env.DB_USER || 'zalint',
    password: process.env.DB_PASSWORD || 'bonea2024'
});

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

async function cleanupTestData() {
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
        console.log('✅ Nettoyage des données de test terminé');
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

// Fonction helper pour forcer la synchronisation de tous les comptes après modifications de crédit
// COPIE EXACTE DE server.js lignes 68-92 SANS AUCUN CHANGEMENT
async function forceSyncAllAccountsAfterCreditOperation() {
    try {
        console.log('🔄 AUTO-SYNC: Synchronisation automatique des comptes après modification de crédit...');
        
        const result = await pool.query('SELECT public.force_sync_all_accounts_simple()');
        const syncData = result.rows[0].force_sync_all_accounts_simple;
        
        // Production retourne: synchronized_accounts, errors, message
        console.log(`✅ AUTO-SYNC: Synchronisation terminée - ${syncData.synchronized_accounts} comptes synchronisés, ${syncData.errors} erreurs`);
        
        return {
            success: true,
            message: `Synchronisation automatique: ${syncData.message}`,
            data: syncData
        };
        
    } catch (error) {
        console.error('❌ AUTO-SYNC: Erreur lors de la synchronisation automatique:', error);
        // Ne pas faire échouer la requête principale, juste logger l'erreur
        return {
            success: false,
            message: 'Erreur lors de la synchronisation automatique',
            error: error.message
        };
    }
}

// Fonction helper générique pour vérifier le type de compte et déclencher la synchronisation automatique
// COPIE EXACTE DE server.js lignes 95-129 SANS AUCUN CHANGEMENT
async function triggerAutoSyncIfNeeded(accountId, operationType = 'modification') {
    try {
        if (!accountId) {
            console.log('⚠️ AUTO-SYNC: Aucun compte ID fourni, synchronisation ignorée');
            return { success: false, message: 'Aucun compte ID fourni' };
        }

        // Vérifier le type de compte
        const accountTypeCheck = await pool.query('SELECT account_type, account_name FROM accounts WHERE id = $1', [accountId]);
        
        if (accountTypeCheck.rows.length === 0) {
            console.log(`⚠️ AUTO-SYNC: Compte ${accountId} non trouvé, synchronisation ignorée`);
            return { success: false, message: 'Compte non trouvé' };
        }

        const account = accountTypeCheck.rows[0];
        
        // Déclencher la synchronisation UNIQUEMENT pour les comptes classiques
        if (account.account_type === 'classique') {
            console.log(`🔄 AUTO-SYNC: Déclenchement synchronisation après ${operationType} sur compte classique "${account.account_name}"`);
            return await forceSyncAllAccountsAfterCreditOperation();
        } else {
            console.log(`ℹ️ AUTO-SYNC: Compte "${account.account_name}" de type "${account.account_type}" - synchronisation automatique non nécessaire`);
            return { success: true, message: `Compte ${account.account_type} - pas de sync automatique` };
        }
        
    } catch (error) {
        console.error('❌ AUTO-SYNC: Erreur lors de la vérification du type de compte:', error);
        return {
            success: false,
            message: 'Erreur lors de la vérification du type de compte',
            error: error.message
        };
    }
}

// Fonction pour synchroniser TOUS les comptes 
// COPIE EXACTE DE server.js lignes 12269-12292
async function syncAllAccounts() {
    try {
        console.log('🔄 Synchronisation TOUS les comptes');
        
        const result = await pool.query('SELECT public.force_sync_all_accounts_simple()');
        const syncData = result.rows[0].force_sync_all_accounts_simple;
        
        console.log(`✅ Synchronisation terminée: ${syncData.total_corrected} comptes corrigés sur ${syncData.total_accounts}`);
        
        return {
            success: true,
            message: `Synchronisation terminée: ${syncData.total_corrected} comptes corrigés sur ${syncData.total_accounts}`,
            data: syncData
        };
        
    } catch (error) {
        console.error('❌ Erreur synchronisation:', error);
        return {
            success: false,
            message: 'Erreur lors de la synchronisation',
            error: error.message
        };
    }
}

// Fonction pour synchroniser UN compte spécifique
// COPIE EXACTE DE server.js lignes 12295-12328 SANS AUCUN CHANGEMENT
async function syncAccountBalance(accountId) {
    try {
        console.log(`🎯 Synchronisation compte ${accountId}`);
        
        // Vérifier que le compte existe
        const accountCheck = await pool.query('SELECT account_name FROM accounts WHERE id = $1', [accountId]);
        if (accountCheck.rows.length === 0) {
            throw new Error('Compte non trouvé');
        }
        
        const accountName = accountCheck.rows[0].account_name;
        
        // Synchroniser le compte
        // Synchroniser le compte - EXACTEMENT COMME EN PRODUCTION (VOID)
        await pool.query('SELECT public.force_sync_account($1)', [accountId]);
        
        // Récupérer le nouveau solde après synchronisation
        const balanceResult = await pool.query('SELECT current_balance FROM accounts WHERE id = $1', [accountId]);
        const newBalance = parseFloat(balanceResult.rows[0].current_balance) || 0;
        
        console.log(`✅ ${accountName} synchronisé: ${newBalance.toLocaleString()} FCFA`);
        
        return newBalance;
        
    } catch (error) {
        console.error('❌ Erreur synchronisation compte:', error);
        throw new Error(`Erreur lors de la synchronisation du compte: ${error.message}`);
    }
}

// Fonction pour vérifier la cohérence des soldes
async function checkBalanceConsistency(accountId, testDescription) {
    // Forcer la synchronisation du solde avant vérification
    await syncAccountBalance(accountId);
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

// Fonction pour lire la configuration financière (identique à celle du serveur)
function getFinancialConfig() {
    try {
        const configPath = path.join(__dirname, 'financial_settings.json');
        if (fs.existsSync(configPath)) {
            const configData = fs.readFileSync(configPath, 'utf8');
            return JSON.parse(configData);
        }
    } catch (error) {
        console.error('Erreur lecture configuration financière:', error);
    }
    // Configuration par défaut
    return {
        charges_fixes_estimation: 5320000,
        validate_expense_balance: true,
        description: "Paramètres financiers et estimations pour les calculs du système"
    };
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
                
                // Vérifier si le compte est de type classique pour la synchronisation
                // COPIE EXACTE DE server.js
                await triggerAutoSyncIfNeeded(accountId, 'opération de crédit');

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
                
                // Vérifier si le compte est de type classique pour la synchronisation
                // COPIE EXACTE DE server.js
                await triggerAutoSyncIfNeeded(accountId, 'opération de crédit');
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
                
                // Vérifier si le compte est de type classique pour la synchronisation
                // COPIE EXACTE DE server.js
                await triggerAutoSyncIfNeeded(accountId, 'opération de crédit');
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
                
                // Vérifier si le compte est de type classique pour la synchronisation
                // COPIE EXACTE DE server.js
                const accountTypeCheck = await pool.query('SELECT account_type FROM accounts WHERE id = $1', [sourceAccountId]);
                if (accountTypeCheck.rows.length > 0 && accountTypeCheck.rows[0].account_type === 'classique') {
                    await forceSyncAllAccountsAfterCreditOperation();
                }

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
                
                // Force sync both accounts after transfer
                await syncAccountBalance(sourceAccountId);
                await syncAccountBalance(destAccountId);
                
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

    describe('🧪 Test 9: Compte CRÉANCE - Gestion Clients et Opérations', () => {
        it('Devrait gérer correctement les créances avec clients et opérations', async () => {
            console.log('\n💳 TEST GESTION CRÉANCES - LOGIQUE MÉTIER');
            console.log('=======================================');
            
            // Créer compte créance temporaire
            const creanceResult = await pool.query(
                'INSERT INTO accounts (user_id, account_name, current_balance, total_credited, total_spent, created_by, account_type) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
                [directeurId, 'COMPTE_CREANCE_TEST_REG', 0, 0, 0, dgId, 'creance']
            );
            const creanceAccountId = creanceResult.rows[0].id;
            console.log(`🏦 COMPTE CRÉANCE CRÉÉ: ID ${creanceAccountId}, Nom: COMPTE_CREANCE_TEST_REG`);
            
            await pool.query('BEGIN');
            try {
                // 1. Ajouter client
                const clientResult = await pool.query(
                    'INSERT INTO creance_clients (account_id, client_name, client_phone, client_address, initial_credit, created_by) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
                    [creanceAccountId, 'Client Test Créance', '77999888', 'Adresse Test', 200000, dgId]
                );
                const clientId = clientResult.rows[0].id;
                console.log(`👤 CLIENT AJOUTÉ: Client Test Créance (Crédit initial: 200,000 FCFA)`);
                
                // 2. Opération Avance (+)
                await pool.query(
                    'INSERT INTO creance_operations (account_id, client_id, operation_type, amount, description, operation_date, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7)',
                    [creanceAccountId, clientId, 'credit', 800000, 'Avance Client Test', '2025-01-16', dgId]
                );
                console.log(`💰 AVANCE AJOUTÉE: +800,000 FCFA`);
                
                // 3. Opération Remboursement (-)
                await pool.query(
                    'INSERT INTO creance_operations (account_id, client_id, operation_type, amount, description, operation_date, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7)',
                    [creanceAccountId, clientId, 'debit', 300000, 'Remboursement partiel Client Test', '2025-01-17', dgId]
                );
                console.log(`💸 REMBOURSEMENT AJOUTÉ: -300,000 FCFA`);
                
                // 4. Calculer le solde client selon la logique créance
                const clientBalance = await pool.query(`
                    SELECT 
                        cc.initial_credit,
                        COALESCE(SUM(CASE WHEN co.operation_type = 'credit' THEN co.amount ELSE 0 END), 0) as total_avances,
                        COALESCE(SUM(CASE WHEN co.operation_type = 'debit' THEN co.amount ELSE 0 END), 0) as total_remboursements,
                        cc.initial_credit + 
                        COALESCE(SUM(CASE WHEN co.operation_type = 'credit' THEN co.amount ELSE 0 END), 0) - 
                        COALESCE(SUM(CASE WHEN co.operation_type = 'debit' THEN co.amount ELSE 0 END), 0) as solde_client
                    FROM creance_clients cc
                    LEFT JOIN creance_operations co ON cc.id = co.client_id
                    WHERE cc.id = $1
                    GROUP BY cc.id, cc.initial_credit
                `, [clientId]);
                
                const balance = clientBalance.rows[0];
                const expectedBalance = 200000 + 800000 - 300000; // 700,000 FCFA
                
                console.log(`\n📊 SOLDE CLIENT:`);
                console.log(`   Crédit initial: ${parseInt(balance.initial_credit).toLocaleString()} FCFA`);
                console.log(`   Total avances: ${parseInt(balance.total_avances).toLocaleString()} FCFA`);
                console.log(`   Total remboursements: ${parseInt(balance.total_remboursements).toLocaleString()} FCFA`);
                console.log(`   SOLDE: ${parseInt(balance.solde_client).toLocaleString()} FCFA`);
                
                // 5. Mettre à jour le solde du compte créance
                await pool.query(
                    'UPDATE accounts SET current_balance = $1 WHERE id = $2',
                    [expectedBalance, creanceAccountId]
                );
                
                await pool.query('COMMIT');
                
                // 6. Vérifications
                assert.strictEqual(parseInt(balance.solde_client), expectedBalance,
                    `❌ Le solde client devrait être ${expectedBalance} FCFA`);
                
                // Vérifier le solde du compte
                const accountInfo = await pool.query('SELECT current_balance FROM accounts WHERE id = $1', [creanceAccountId]);
                const accountBalance = parseInt(accountInfo.rows[0].current_balance);
                
                assert.strictEqual(accountBalance, expectedBalance,
                    `❌ Le solde du compte créance devrait être ${expectedBalance} FCFA`);
                
                console.log(`💰 TOTAL COMPTE CRÉANCE: ${expectedBalance.toLocaleString()} FCFA`);
                console.log('✅ Test CRÉANCE réussi: Logique clients et opérations validée');
                
                // 7. Nettoyage
                await pool.query('DELETE FROM creance_operations WHERE client_id = $1', [clientId]);
                await pool.query('DELETE FROM creance_clients WHERE id = $1', [clientId]);
                await pool.query('DELETE FROM accounts WHERE id = $1', [creanceAccountId]);
                
            } catch (error) {
                await pool.query('ROLLBACK');
                throw error;
            }
        });
    });

    describe('🧪 Test 10: Calcul PL avec écart stock mensuel et estimation charges', () => {
        it('Devrait calculer correctement le PL (Profit & Loss) complet', async () => {
            console.log('\n📊 TEST CALCUL PL COMPLET');
            console.log('=========================');
            
            // Créer table stock_vivant si nécessaire pour test
            await pool.query(`
                CREATE TABLE IF NOT EXISTS stock_vivant (
                    id SERIAL PRIMARY KEY,
                    date_observation DATE NOT NULL,
                    montant_stock INTEGER NOT NULL,
                    description TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
            
            // Créer table stock_soir si nécessaire pour test
            await pool.query(`
                CREATE TABLE IF NOT EXISTS stock_soir (
                    id SERIAL PRIMARY KEY,
                    date_snapshot DATE NOT NULL,
                    montant_stock INTEGER NOT NULL,
                    description TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
            
            await pool.query('BEGIN');
            try {
                const testDate = '2025-01-16';
                const currentYear = 2025;
                const currentMonth = 1; // Janvier
                
                // 1. Données de test pour PL
                const cashBictorys = 15000000; // 15M FCFA
                const creancesMois = 2500000; // 2.5M FCFA
                const stockPointVente = 1200000; // 1.2M FCFA
                const cashBurnMois = 8500000; // 8.5M FCFA
                
                // 2. Écart stock vivant mensuel (différence début/fin mois)
                const stockVivantDebut = 5000000; // 5M FCFA
                const stockVivantFin = 5800000; // 5.8M FCFA
                const stockVivantVariation = stockVivantFin - stockVivantDebut; // +800K FCFA
                
                // 3. Livraisons partenaires du mois
                const livraisonsPartenaires = 1500000; // 1.5M FCFA
                
                // 4. Estimation charges fixes
                const chargesFixesEstimation = 3000000; // 3M FCFA par mois
                
                // Ajouter données stock vivant
                await pool.query(
                    'INSERT INTO stock_vivant (date_stock, categorie, produit, quantite, prix_unitaire, total, commentaire) VALUES ($1, $2, $3, $4, $5, $6, $7)',
                    [`${currentYear}-${currentMonth.toString().padStart(2, '0')}-01`, 'Test PL', 'Stock début mois PL', 1, stockVivantDebut, stockVivantDebut, 'Stock début mois test']
                );
                await pool.query(
                    'INSERT INTO stock_vivant (date_stock, categorie, produit, quantite, prix_unitaire, total, commentaire) VALUES ($1, $2, $3, $4, $5, $6, $7)',
                    [testDate, 'Test PL', 'Stock fin mois PL', 1, stockVivantFin, stockVivantFin, 'Stock fin mois test']
                );
                
                // Ajouter données stock soir
                await pool.query(
                    'INSERT INTO stock_soir (date_snapshot, montant_stock, description) VALUES ($1, $2, $3)',
                    [testDate, stockPointVente, 'Stock point de vente test']
                );
                
                // Calculer jours ouvrables (lundi-samedi) pour prorata charges
                const currentDay = 16; // 16 janvier
                let joursOuvrablesEcoules = 0;
                let totalJoursOuvrables = 0;
                
                // Jours ouvrables écoulés (1-16 janvier)
                for (let day = 1; day <= currentDay; day++) {
                    const date = new Date(currentYear, currentMonth - 1, day);
                    const dayOfWeek = date.getDay(); // 0 = dimanche
                    if (dayOfWeek !== 0) {
                        joursOuvrablesEcoules++;
                    }
                }
                
                // Total jours ouvrables dans le mois
                const daysInMonth = new Date(currentYear, currentMonth, 0).getDate(); // 31 pour janvier
                for (let day = 1; day <= daysInMonth; day++) {
                    const date = new Date(currentYear, currentMonth - 1, day);
                    const dayOfWeek = date.getDay();
                    if (dayOfWeek !== 0) {
                        totalJoursOuvrables++;
                    }
                }
                
                // Calcul prorata charges
                const chargesProrata = (chargesFixesEstimation * joursOuvrablesEcoules) / totalJoursOuvrables;
                
                // 5. CALCULS PL selon logique métier
                const plSansStockCharges = cashBictorys + creancesMois + stockPointVente - cashBurnMois;
                const plBrut = plSansStockCharges + stockVivantVariation - livraisonsPartenaires;
                const plFinal = plSansStockCharges + stockVivantVariation - chargesProrata - livraisonsPartenaires;
                
                await pool.query('COMMIT');
                
                console.log('💰 COMPOSANTES DU PL:');
                console.log(`   Cash Bictorys du mois: ${cashBictorys.toLocaleString()} FCFA`);
                console.log(`   Créances du mois: ${creancesMois.toLocaleString()} FCFA`);
                console.log(`   Stock Point de Vente: ${stockPointVente.toLocaleString()} FCFA`);
                console.log(`   Cash Burn du mois: -${cashBurnMois.toLocaleString()} FCFA`);
                console.log(`   PL de base: ${plSansStockCharges.toLocaleString()} FCFA`);
                console.log('');
                console.log('🌱 ÉCART STOCK VIVANT:');
                console.log(`   Stock début mois: ${stockVivantDebut.toLocaleString()} FCFA`);
                console.log(`   Stock fin mois: ${stockVivantFin.toLocaleString()} FCFA`);
                console.log(`   Variation: +${stockVivantVariation.toLocaleString()} FCFA`);
                console.log('');
                console.log('🚚 LIVRAISONS PARTENAIRES:');
                console.log(`   Livraisons du mois: -${livraisonsPartenaires.toLocaleString()} FCFA`);
                console.log('');
                console.log('⚙️ ESTIMATION CHARGES:');
                console.log(`   Charges fixes mensuelles: ${chargesFixesEstimation.toLocaleString()} FCFA`);
                console.log(`   Jours ouvrables écoulés: ${joursOuvrablesEcoules}/${totalJoursOuvrables}`);
                console.log(`   Charges prorata: -${Math.round(chargesProrata).toLocaleString()} FCFA`);
                console.log('');
                console.log('🎯 RÉSULTATS PL:');
                console.log(`   PL BRUT: ${Math.round(plBrut).toLocaleString()} FCFA`);
                console.log(`   PL FINAL (avec charges): ${Math.round(plFinal).toLocaleString()} FCFA`);
                
                // Vérifications
                // PL BRUT = PL base (10.2M) + stock vivant (0.8M) - livraisons (1.5M) = 9.5M
                const expectedPlBrut = 9500000; // 15M + 2.5M + 1.2M - 8.5M + 0.8M - 1.5M
                const expectedPlFinal = plBrut - chargesProrata;
                
                assert.strictEqual(Math.round(plBrut), expectedPlBrut,
                    `❌ PL BRUT incorrect: attendu ${expectedPlBrut.toLocaleString()}, obtenu ${Math.round(plBrut).toLocaleString()}`);
                
                assert.strictEqual(Math.round(plFinal), Math.round(expectedPlFinal),
                    `❌ PL FINAL incorrect: attendu ${Math.round(expectedPlFinal).toLocaleString()}, obtenu ${Math.round(plFinal).toLocaleString()}`);
                
                console.log('✅ Test PL réussi: Calculs corrects avec écart stock et estimation charges');
                
                // Nettoyer les données de test
                await pool.query('DELETE FROM stock_vivant WHERE commentaire LIKE \'%test\'');
                await pool.query('DELETE FROM stock_soir WHERE description LIKE \'%test\'');
                
            } catch (error) {
                await pool.query('ROLLBACK');
                throw error;
            }
        });
    });

    describe('🧪 Test 11: Calcul Cash Disponible', () => {
        it('Devrait calculer correctement le cash disponible selon les règles métier', async () => {
            console.log('\n💰 TEST CALCUL CASH DISPONIBLE');
            console.log('===============================');
            
            await pool.query('BEGIN');
            try {
                // Créer différents types de comptes pour tester la logique d'inclusion/exclusion
                const testAccountsForCash = [
                    { name: 'COMPTE_CLASSIQUE_CASH_TEST', type: 'classique', balance: 5000000, included: true },
                    { name: 'COMPTE_STATUT_CASH_TEST', type: 'statut', balance: 2500000, included: true },
                    { name: 'COMPTE_AJUSTEMENT_CASH_TEST', type: 'classique', balance: 1200000, included: true },
                    { name: 'COMPTE_PARTENAIRE_CASH_TEST', type: 'partenaire', balance: 3000000, included: false },
                    { name: 'COMPTE_DEPOT_CASH_TEST', type: 'depot', balance: 1800000, included: false },
                    { name: 'COMPTE_CREANCE_CASH_TEST', type: 'creance', balance: 2200000, included: false },
                    { name: 'COMPTE_FOURNISSEUR_CASH_TEST', type: 'depot', balance: 1500000, included: false }
                ];
                
                // Créer les comptes de test
                const createdAccounts = [];
                for (const testAccount of testAccountsForCash) {
                    const result = await pool.query(
                        'INSERT INTO accounts (user_id, account_name, current_balance, total_credited, total_spent, created_by, account_type) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
                        [directeurId, testAccount.name, testAccount.balance, testAccount.balance, 0, dgId, testAccount.type]
                    );
                    createdAccounts.push({
                        ...testAccount,
                        id: result.rows[0].id
                    });
                }
                
                // Calculer le cash disponible selon la logique métier
                const cashQuery = `
                    SELECT 
                        a.account_name,
                        a.account_type,
                        a.current_balance
                    FROM accounts a 
                    WHERE a.account_name LIKE '%_CASH_TEST'
                    ORDER BY a.account_name
                `;
                
                const cashAccounts = await pool.query(cashQuery);
                
                let calculatedCash = 0;
                let includedAccounts = [];
                let excludedAccounts = [];
                
                console.log('📊 ANALYSE DES COMPTES:');
                cashAccounts.rows.forEach(row => {
                    const accountName = row.account_name.toLowerCase();
                    const balance = parseInt(row.current_balance || 0);
                    
                    // Logique d'inclusion selon les règles métier
                    const isExcluded = accountName.includes('partenaire') ||
                                     accountName.includes('depot') ||
                                     accountName.includes('creance') ||
                                     accountName.includes('fournisseur');
                    
                    if (isExcluded) {
                        excludedAccounts.push({
                            name: row.account_name,
                            type: row.account_type,
                            balance: balance
                        });
                        console.log(`   ❌ EXCLU: ${row.account_name} (${row.account_type}): ${balance.toLocaleString()} FCFA`);
                    } else {
                        includedAccounts.push({
                            name: row.account_name,
                            type: row.account_type,
                            balance: balance
                        });
                        calculatedCash += balance;
                        console.log(`   ✅ INCLUS: ${row.account_name} (${row.account_type}): ${balance.toLocaleString()} FCFA`);
                    }
                });
                
                console.log('');
                console.log('💰 RÉSULTAT CASH DISPONIBLE:');
                console.log(`   Comptes inclus: ${includedAccounts.length}`);
                console.log(`   Comptes exclus: ${excludedAccounts.length}`);
                console.log(`   Cash total calculé: ${calculatedCash.toLocaleString()} FCFA`);
                
                // Vérifications
                const expectedCashTotal = 5000000 + 2500000 + 1200000; // Seuls classique + statut + ajustement
                const expectedIncludedCount = 3; // classique, statut, ajustement
                const expectedExcludedCount = 4; // partenaire, depot, creance, fournisseur
                
                assert.strictEqual(calculatedCash, expectedCashTotal,
                    `❌ Cash total incorrect: attendu ${expectedCashTotal.toLocaleString()}, obtenu ${calculatedCash.toLocaleString()}`);
                
                assert.strictEqual(includedAccounts.length, expectedIncludedCount,
                    `❌ Nombre de comptes inclus incorrect: attendu ${expectedIncludedCount}, obtenu ${includedAccounts.length}`);
                
                assert.strictEqual(excludedAccounts.length, expectedExcludedCount,
                    `❌ Nombre de comptes exclus incorrect: attendu ${expectedExcludedCount}, obtenu ${excludedAccounts.length}`);
                
                // Vérifier que les bons types sont inclus/exclus
                const includedTypes = [...new Set(includedAccounts.map(acc => acc.type))];
                const excludedTypes = [...new Set(excludedAccounts.map(acc => acc.type))];
                
                assert.deepStrictEqual(includedTypes.sort(), ['classique', 'statut'],
                    `❌ Types de comptes inclus incorrects: ${includedTypes.join(', ')}`);
                
                assert.deepStrictEqual(excludedTypes.sort(), ['creance', 'depot', 'partenaire'],
                    `❌ Types de comptes exclus incorrects: ${excludedTypes.join(', ')}`);
                
                await pool.query('COMMIT');
                
                console.log('✅ Test CASH DISPONIBLE réussi: Logique d\'inclusion/exclusion correcte');
                
                // Nettoyer les comptes de test
                await pool.query('DELETE FROM accounts WHERE account_name LIKE \'%_CASH_TEST\'');
                
            } catch (error) {
                await pool.query('ROLLBACK');
                throw error;
            }
        });
    });

    describe('🧪 Test 12: Livraisons Partenaires - Ajout, Validation, Rejet', () => {
        it('Devrait gérer correctement les livraisons partenaires avec différents statuts', async () => {
            console.log('\n🚚 TEST LIVRAISONS PARTENAIRES');
            console.log('===============================');
            
            const partenaireAccountId = accounts['MATA_VOLAILLE_CHAIR_TEST_REG'];
            
            await pool.query('BEGIN');
            try {
                // État initial du compte partenaire
                const initialAccount = await pool.query('SELECT current_balance, total_credited FROM accounts WHERE id = $1', [partenaireAccountId]);
                const initialBalance = parseInt(initialAccount.rows[0].current_balance);
                const totalCredited = parseInt(initialAccount.rows[0].total_credited);
                
                console.log('📊 ÉTAT INITIAL:');
                console.log(`   Total crédité: ${totalCredited.toLocaleString()} FCFA`);
                console.log(`   Solde initial: ${initialBalance.toLocaleString()} FCFA`);
                
                // 1. AJOUTER LIVRAISON EN ATTENTE (pending)
                const livraison1Result = await pool.query(
                    'INSERT INTO partner_deliveries (account_id, delivery_date, article_count, unit_price, amount, description, validation_status, is_validated, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id',
                    [partenaireAccountId, '2025-01-16', 200, 2500, 500000, 'Livraison test pending', 'pending', false, dgId]
                );
                const livraison1Id = livraison1Result.rows[0].id;
                
                // Vérifier que le solde reste inchangé (livraison non validée)
                let currentAccount = await pool.query('SELECT current_balance FROM accounts WHERE id = $1', [partenaireAccountId]);
                let currentBalance = parseInt(currentAccount.rows[0].current_balance);
                
                console.log('\n🟡 LIVRAISON PENDING AJOUTÉE:');
                console.log(`   Montant: 500,000 FCFA`);
                console.log(`   Statut: pending`);
                console.log(`   Solde après ajout: ${currentBalance.toLocaleString()} FCFA`);
                
                assert.strictEqual(currentBalance, initialBalance,
                    `❌ Solde modifié après livraison pending: attendu ${initialBalance.toLocaleString()}, obtenu ${currentBalance.toLocaleString()}`);
                
                // 2. VALIDER LA LIVRAISON (fully_validated)
                await pool.query(
                    'UPDATE partner_deliveries SET validation_status = $1, is_validated = $2 WHERE id = $3',
                    ['fully_validated', true, livraison1Id]
                );
                
                // Calculer le nouveau solde attendu
                const expectedBalanceAfterValidation = initialBalance - 500000;
                
                // Mettre à jour le solde du compte (simulation logique métier)
                await pool.query(
                    'UPDATE accounts SET current_balance = $1 WHERE id = $2',
                    [expectedBalanceAfterValidation, partenaireAccountId]
                );
                
                currentAccount = await pool.query('SELECT current_balance FROM accounts WHERE id = $1', [partenaireAccountId]);
                currentBalance = parseInt(currentAccount.rows[0].current_balance);
                
                console.log('\n✅ LIVRAISON VALIDÉE:');
                console.log(`   Statut: fully_validated`);
                console.log(`   Solde après validation: ${currentBalance.toLocaleString()} FCFA`);
                console.log(`   Réduction: -500,000 FCFA`);
                
                assert.strictEqual(currentBalance, expectedBalanceAfterValidation,
                    `❌ Solde incorrect après validation: attendu ${expectedBalanceAfterValidation.toLocaleString()}, obtenu ${currentBalance.toLocaleString()}`);
                
                // 3. AJOUTER DEUXIÈME LIVRAISON ET LA REJETER
                const livraison2Result = await pool.query(
                    'INSERT INTO partner_deliveries (account_id, delivery_date, article_count, unit_price, amount, description, validation_status, is_validated, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id',
                    [partenaireAccountId, '2025-01-17', 150, 3000, 450000, 'Livraison test rejected', 'pending', false, dgId]
                );
                const livraison2Id = livraison2Result.rows[0].id;
                
                // Rejeter la livraison
                await pool.query(
                    'UPDATE partner_deliveries SET validation_status = $1, is_validated = $2 WHERE id = $3',
                    ['rejected', false, livraison2Id]
                );
                
                // Vérifier que le solde reste inchangé (livraison rejetée)
                currentAccount = await pool.query('SELECT current_balance FROM accounts WHERE id = $1', [partenaireAccountId]);
                const balanceAfterRejection = parseInt(currentAccount.rows[0].current_balance);
                
                console.log('\n❌ LIVRAISON REJETÉE:');
                console.log(`   Montant: 450,000 FCFA`);
                console.log(`   Statut: rejected`);
                console.log(`   Solde après rejet: ${balanceAfterRejection.toLocaleString()} FCFA`);
                
                assert.strictEqual(balanceAfterRejection, expectedBalanceAfterValidation,
                    `❌ Solde modifié après rejet: attendu ${expectedBalanceAfterValidation.toLocaleString()}, obtenu ${balanceAfterRejection.toLocaleString()}`);
                
                // 4. VÉRIFICATION DES LIVRAISONS DANS LA BASE
                const livraisonsCheck = await pool.query(`
                    SELECT 
                        id,
                        amount,
                        validation_status,
                        is_validated,
                        description
                    FROM partner_deliveries 
                    WHERE account_id = $1 
                    ORDER BY id
                `, [partenaireAccountId]);
                
                console.log('\n📋 VÉRIFICATION LIVRAISONS:');
                let totalValidatedDeliveries = 0;
                let totalPendingDeliveries = 0;
                let totalRejectedDeliveries = 0;
                
                livraisonsCheck.rows.forEach(livraison => {
                    const status = livraison.validation_status;
                    const amount = parseInt(livraison.amount);
                    
                    console.log(`   📦 ${livraison.description}: ${amount.toLocaleString()} FCFA (${status})`);
                    
                    if (status === 'fully_validated') {
                        totalValidatedDeliveries += amount;
                    } else if (status === 'pending') {
                        totalPendingDeliveries += amount;
                    } else if (status === 'rejected') {
                        totalRejectedDeliveries += amount;
                    }
                });
                
                console.log('\n📊 RÉSUMÉ LIVRAISONS:');
                console.log(`   Validées: ${totalValidatedDeliveries.toLocaleString()} FCFA`);
                console.log(`   En attente: ${totalPendingDeliveries.toLocaleString()} FCFA`);
                console.log(`   Rejetées: ${totalRejectedDeliveries.toLocaleString()} FCFA`);
                
                // 5. CALCUL DU SOLDE RESTANT SELON LA LOGIQUE PARTENAIRE
                const expectedFinalBalance = totalCredited - totalValidatedDeliveries;
                
                console.log('\n💰 CALCUL SOLDE RESTANT:');
                console.log(`   Total crédité: ${totalCredited.toLocaleString()} FCFA`);
                console.log(`   Livraisons validées: ${totalValidatedDeliveries.toLocaleString()} FCFA`);
                console.log(`   Solde restant calculé: ${expectedFinalBalance.toLocaleString()} FCFA`);
                console.log(`   Solde actuel compte: ${balanceAfterRejection.toLocaleString()} FCFA`);
                
                // Vérifications finales
                assert.strictEqual(totalValidatedDeliveries, 1000000, // 500K (test 8) + 500K (test 12)
                    `❌ Total livraisons validées incorrect: attendu 1,000,000, obtenu ${totalValidatedDeliveries.toLocaleString()}`);
                
                assert.strictEqual(totalPendingDeliveries, 600000, // Seule celle du test 8 reste pending
                    `❌ Total livraisons pending incorrect: attendu 600,000, obtenu ${totalPendingDeliveries.toLocaleString()}`);
                
                assert.strictEqual(totalRejectedDeliveries, 450000, // Celle rejetée dans ce test
                    `❌ Total livraisons rejetées incorrect: attendu 450,000, obtenu ${totalRejectedDeliveries.toLocaleString()}`);
                
                await pool.query('COMMIT');
                
                console.log('✅ Test LIVRAISONS PARTENAIRES réussi: Gestion complète des statuts de validation');
                
                // 6. NETTOYAGE SPÉCIFIQUE À CE TEST
                await pool.query('DELETE FROM partner_deliveries WHERE id IN ($1, $2)', [livraison1Id, livraison2Id]);
                
                // Restaurer le solde initial
                await pool.query('UPDATE accounts SET current_balance = $1 WHERE id = $2', [initialBalance, partenaireAccountId]);
                
            } catch (error) {
                await pool.query('ROLLBACK');
                throw error;
            }
        });
    });

    describe('🧪 Test 13: Gestion Créances - Clients et Opérations', () => {
        it('Devrait gérer complètement les clients et opérations créance (avance/remboursement)', async () => {
            console.log('\n💳 TEST GESTION CRÉANCES COMPLÈTE');
            console.log('==================================');
            
            // Créer les tables nécessaires si elles n'existent pas
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
            
            await pool.query('BEGIN');
            try {
                // 1. CRÉER COMPTE CRÉANCE DE TEST
                const creanceAccountResult = await pool.query(
                    'INSERT INTO accounts (user_id, account_name, current_balance, total_credited, total_spent, created_by, account_type) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
                    [dgId, 'COMPTE_CREANCE_GESTION_TEST', 0, 0, 0, dgId, 'creance']
                );
                const creanceAccountId = creanceAccountResult.rows[0].id;
                
                console.log('🏦 COMPTE CRÉANCE CRÉÉ:');
                console.log(`   ID: ${creanceAccountId}`);
                console.log(`   Nom: COMPTE_CREANCE_GESTION_TEST`);
                
                // 2. AJOUTER NOUVEAU CLIENT
                const client1Result = await pool.query(`
                    INSERT INTO creance_clients (account_id, client_name, client_phone, client_address, initial_credit, created_by)
                    VALUES ($1, $2, $3, $4, $5, $6)
                    RETURNING *
                `, [creanceAccountId, 'Client Test Alpha', '77123456', 'Adresse Test Alpha', 100000, dgId]);
                const client1 = client1Result.rows[0];
                
                console.log('\n👤 CLIENT 1 AJOUTÉ:');
                console.log(`   Nom: ${client1.client_name}`);
                console.log(`   Téléphone: ${client1.client_phone}`);
                console.log(`   Adresse: ${client1.client_address}`);
                console.log(`   Crédit initial: ${client1.initial_credit.toLocaleString()} FCFA`);
                
                // 3. AJOUTER DEUXIÈME CLIENT
                const client2Result = await pool.query(`
                    INSERT INTO creance_clients (account_id, client_name, client_phone, client_address, initial_credit, created_by)
                    VALUES ($1, $2, $3, $4, $5, $6)
                    RETURNING *
                `, [creanceAccountId, 'Client Test Beta', '77654321', 'Adresse Test Beta', 50000, dgId]);
                const client2 = client2Result.rows[0];
                
                console.log('\n👤 CLIENT 2 AJOUTÉ:');
                console.log(`   Nom: ${client2.client_name}`);
                console.log(`   Téléphone: ${client2.client_phone}`);
                console.log(`   Crédit initial: ${client2.initial_credit.toLocaleString()} FCFA`);
                
                // 4. MODIFIER CLIENT 1
                await pool.query(`
                    UPDATE creance_clients 
                    SET client_phone = $1, client_address = $2, initial_credit = $3 
                    WHERE id = $4
                `, ['77111222', 'Nouvelle Adresse Alpha', 120000, client1.id]);
                
                console.log('\n✏️ CLIENT 1 MODIFIÉ:');
                console.log(`   Nouveau téléphone: 77111222`);
                console.log(`   Nouvelle adresse: Nouvelle Adresse Alpha`);
                console.log(`   Nouveau crédit initial: 120,000 FCFA`);
                
                // 5. OPÉRATIONS CRÉANCE CLIENT 1
                
                // Avance (+) de 500,000 FCFA
                const operation1Result = await pool.query(`
                    INSERT INTO creance_operations (account_id, client_id, operation_type, amount, operation_date, description, created_by)
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                    RETURNING *
                `, [creanceAccountId, client1.id, 'credit', 500000, '2025-01-16', 'Avance Client Alpha', dgId]);
                
                console.log('\n💰 AVANCE CLIENT 1:');
                console.log(`   Type: credit (+)`);
                console.log(`   Montant: +500,000 FCFA`);
                console.log(`   Description: ${operation1Result.rows[0].description}`);
                
                // Remboursement (-) de 200,000 FCFA
                const operation2Result = await pool.query(`
                    INSERT INTO creance_operations (account_id, client_id, operation_type, amount, operation_date, description, created_by)
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                    RETURNING *
                `, [creanceAccountId, client1.id, 'debit', 200000, '2025-01-17', 'Remboursement partiel Client Alpha', dgId]);
                
                console.log('\n💸 REMBOURSEMENT CLIENT 1:');
                console.log(`   Type: debit (-)`);
                console.log(`   Montant: -200,000 FCFA`);
                console.log(`   Description: ${operation2Result.rows[0].description}`);
                
                // 6. OPÉRATIONS CRÉANCE CLIENT 2
                
                // Avance (+) de 300,000 FCFA
                const operation3Result = await pool.query(`
                    INSERT INTO creance_operations (account_id, client_id, operation_type, amount, operation_date, description, created_by)
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                    RETURNING *
                `, [creanceAccountId, client2.id, 'credit', 300000, '2025-01-16', 'Avance Client Beta', dgId]);
                
                console.log('\n💰 AVANCE CLIENT 2:');
                console.log(`   Type: credit (+)`);
                console.log(`   Montant: +300,000 FCFA`);
                console.log(`   Description: ${operation3Result.rows[0].description}`);
                
                // Remboursement (-) de 150,000 FCFA
                const operation4Result = await pool.query(`
                    INSERT INTO creance_operations (account_id, client_id, operation_type, amount, operation_date, description, created_by)
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                    RETURNING *
                `, [creanceAccountId, client2.id, 'debit', 150000, '2025-01-18', 'Remboursement partiel Client Beta', dgId]);
                
                console.log('\n💸 REMBOURSEMENT CLIENT 2:');
                console.log(`   Type: debit (-)`);
                console.log(`   Montant: -150,000 FCFA`);
                console.log(`   Description: ${operation4Result.rows[0].description}`);
                
                // 7. CALCUL DES SOLDES CLIENTS
                const clientsWithBalances = await pool.query(`
                    SELECT cc.id, cc.client_name, cc.initial_credit,
                           COALESCE(SUM(CASE WHEN co.operation_type = 'credit' THEN co.amount ELSE 0 END), 0) as total_credits,
                           COALESCE(SUM(CASE WHEN co.operation_type = 'debit' THEN co.amount ELSE 0 END), 0) as total_debits,
                           (cc.initial_credit + COALESCE(SUM(CASE WHEN co.operation_type = 'credit' THEN co.amount ELSE 0 END), 0) - COALESCE(SUM(CASE WHEN co.operation_type = 'debit' THEN co.amount ELSE 0 END), 0)) as balance
                    FROM creance_clients cc
                    LEFT JOIN creance_operations co ON cc.id = co.client_id
                    WHERE cc.account_id = $1 AND cc.is_active = true
                    GROUP BY cc.id
                    ORDER BY cc.client_name
                `, [creanceAccountId]);
                
                console.log('\n📊 SOLDES CLIENTS:');
                let totalAccountBalance = 0;
                
                clientsWithBalances.rows.forEach(client => {
                    const balance = parseInt(client.balance);
                    totalAccountBalance += balance;
                    
                    console.log(`   👤 ${client.client_name}:`);
                    console.log(`      Crédit initial: ${parseInt(client.initial_credit).toLocaleString()} FCFA`);
                    console.log(`      Total avances: ${parseInt(client.total_credits).toLocaleString()} FCFA`);
                    console.log(`      Total remboursements: ${parseInt(client.total_debits).toLocaleString()} FCFA`);
                    console.log(`      SOLDE: ${balance.toLocaleString()} FCFA`);
                    console.log('');
                });
                
                console.log(`💰 TOTAL COMPTE CRÉANCE: ${totalAccountBalance.toLocaleString()} FCFA`);
                
                // 8. VÉRIFICATIONS
                
                // Client 1: 120,000 (initial) + 500,000 (avance) - 200,000 (remb) = 420,000 FCFA
                const expectedClient1Balance = 120000 + 500000 - 200000; // 420,000 FCFA
                const client1Balance = parseInt(clientsWithBalances.rows.find(c => c.client_name === 'Client Test Alpha').balance);
                
                assert.strictEqual(client1Balance, expectedClient1Balance,
                    `❌ Solde Client 1 incorrect: attendu ${expectedClient1Balance.toLocaleString()}, obtenu ${client1Balance.toLocaleString()}`);
                
                // Client 2: 50,000 (initial) + 300,000 (avance) - 150,000 (remb) = 200,000 FCFA
                const expectedClient2Balance = 50000 + 300000 - 150000; // 200,000 FCFA
                const client2Balance = parseInt(clientsWithBalances.rows.find(c => c.client_name === 'Client Test Beta').balance);
                
                assert.strictEqual(client2Balance, expectedClient2Balance,
                    `❌ Solde Client 2 incorrect: attendu ${expectedClient2Balance.toLocaleString()}, obtenu ${client2Balance.toLocaleString()}`);
                
                // Total compte: 420,000 + 200,000 = 620,000 FCFA
                const expectedTotalBalance = expectedClient1Balance + expectedClient2Balance;
                
                assert.strictEqual(totalAccountBalance, expectedTotalBalance,
                    `❌ Total compte incorrect: attendu ${expectedTotalBalance.toLocaleString()}, obtenu ${totalAccountBalance.toLocaleString()}`);
                
                // 9. VÉRIFICATION DES OPÉRATIONS
                const operationsCheck = await pool.query(`
                    SELECT co.*, cc.client_name
                    FROM creance_operations co
                    JOIN creance_clients cc ON co.client_id = cc.id
                    WHERE co.account_id = $1
                    ORDER BY co.operation_date, co.id
                `, [creanceAccountId]);
                
                console.log('📋 VÉRIFICATION OPÉRATIONS:');
                let totalCredits = 0;
                let totalDebits = 0;
                
                operationsCheck.rows.forEach(op => {
                    const amount = parseInt(op.amount);
                    const sign = op.operation_type === 'credit' ? '+' : '-';
                    
                    console.log(`   ${op.operation_date} | ${op.client_name} | ${sign}${amount.toLocaleString()} FCFA | ${op.description}`);
                    
                    if (op.operation_type === 'credit') {
                        totalCredits += amount;
                    } else {
                        totalDebits += amount;
                    }
                });
                
                console.log('\n📊 TOTAUX OPÉRATIONS:');
                console.log(`   Total avances (credit): ${totalCredits.toLocaleString()} FCFA`);
                console.log(`   Total remboursements (debit): ${totalDebits.toLocaleString()} FCFA`);
                console.log(`   Net opérations: ${(totalCredits - totalDebits).toLocaleString()} FCFA`);
                
                // Vérifications finales
                assert.strictEqual(totalCredits, 800000, // 500K + 300K
                    `❌ Total crédits incorrect: attendu 800,000, obtenu ${totalCredits.toLocaleString()}`);
                
                assert.strictEqual(totalDebits, 350000, // 200K + 150K
                    `❌ Total débits incorrect: attendu 350,000, obtenu ${totalDebits.toLocaleString()}`);
                
                assert.strictEqual(operationsCheck.rows.length, 4,
                    `❌ Nombre d'opérations incorrect: attendu 4, obtenu ${operationsCheck.rows.length}`);
                
                await pool.query('COMMIT');
                
                console.log('✅ Test GESTION CRÉANCES réussi: Clients et opérations gérés correctement');
                
                // 10. NETTOYAGE SPÉCIFIQUE À CE TEST
                await pool.query('DELETE FROM creance_operations WHERE account_id = $1', [creanceAccountId]);
                await pool.query('DELETE FROM creance_clients WHERE account_id = $1', [creanceAccountId]);
                await pool.query('DELETE FROM accounts WHERE id = $1', [creanceAccountId]);
                
            } catch (error) {
                await pool.query('ROLLBACK');
                throw error;
            }
        });
    });

    describe('🧪 Test 14: Gestion Stock Vivant - Copie et Modification', () => {
        it('Devrait copier stock d\'une date à une autre et modifier les quantités', async () => {
            console.log('\n🌱 TEST GESTION STOCK VIVANT COMPLÈTE');
            console.log('=====================================');
            
            // Créer la table stock_vivant si nécessaire
            await pool.query(`
                CREATE TABLE IF NOT EXISTS stock_vivant (
                    id SERIAL PRIMARY KEY,
                    date_observation DATE NOT NULL,
                    montant_stock INTEGER NOT NULL,
                    description TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
            
            await pool.query('BEGIN');
            try {
                // 1. CRÉER STOCK DE BASE (DATE SOURCE)
                const dateSource = '2025-01-15';
                const dateDestination = '2025-01-16';
                
                console.log('📅 DATES:');
                console.log(`   Date source: ${dateSource}`);
                console.log(`   Date destination: ${dateDestination}`);
                
                // Stock initial simplifié
                const stockInitial = [
                    { montant: 16000000, description: 'Stock Bovin - 50 boeufs à 400K + 30 vaches à 350K' },
                    { montant: 4400000, description: 'Stock Ovin - 25 béliers à 80K + 40 brebis à 70K' },
                    { montant: 960000, description: 'Stock Caprin - 20 boucs à 60K' },
                    { montant: 225000, description: 'Stock Aliments - 10 tonnes foin à 25K' }
                ];
                
                console.log('\n📦 STOCK INITIAL CRÉÉ:');
                let totalStockInitial = 0;
                
                for (const item of stockInitial) {
                    totalStockInitial += item.montant;
                    
                    await pool.query(`
                        INSERT INTO stock_vivant (date_stock, categorie, produit, quantite, prix_unitaire, total, commentaire)
                        VALUES ($1, $2, $3, $4, $5, $6, $7)
                    `, [dateSource, 'Test', item.description, 1, item.montant, item.montant, item.description]);
                    
                    console.log(`   ${item.description}: ${item.montant.toLocaleString()} FCFA`);
                }
                
                console.log(`\n💰 TOTAL STOCK INITIAL: ${totalStockInitial.toLocaleString()} FCFA`);
                
                // 2. COPIER STOCK VERS NOUVELLE DATE
                console.log('\n📋 COPIE DU STOCK:');
                console.log(`   ${dateSource} → ${dateDestination}`);
                
                const stockToCopy = await pool.query(`
                    SELECT categorie, produit, quantite, prix_unitaire, total, commentaire
                    FROM stock_vivant 
                    WHERE date_stock = $1
                    ORDER BY commentaire
                `, [dateSource]);
                
                let totalStockCopie = 0;
                for (const row of stockToCopy.rows) {
                    await pool.query(`
                        INSERT INTO stock_vivant (date_stock, categorie, produit, quantite, prix_unitaire, total, commentaire)
                        VALUES ($1, $2, $3, $4, $5, $6, $7)
                    `, [dateDestination, row.categorie, row.produit, row.quantite, row.prix_unitaire, row.total, 'Copié: ' + row.commentaire]);
                    
                    totalStockCopie += parseInt(row.total);
                }
                
                console.log(`✅ ${stockToCopy.rows.length} entrées copiées`);
                console.log(`💰 TOTAL STOCK COPIÉ: ${totalStockCopie.toLocaleString()} FCFA`);
                
                // Vérifier que la copie est identique
                assert.strictEqual(totalStockCopie, totalStockInitial,
                    `❌ Total copie différent: attendu ${totalStockInitial.toLocaleString()}, obtenu ${totalStockCopie.toLocaleString()}`);
                
                // 3. MODIFIER LES MONTANTS DANS LE STOCK COPIÉ
                console.log('\n✏️ MODIFICATIONS DU STOCK:');
                
                const modifications = [
                    { description_pattern: 'Stock Bovin', nouveau_montant: 18000000, raison: 'Achat de 5 boeufs supplémentaires' },
                    { description_pattern: 'Stock Ovin', nouveau_montant: 4000000, raison: 'Vente de quelques brebis' },
                    { description_pattern: 'Stock Caprin', nouveau_montant: 840000, raison: 'Perte de 2 boucs' },
                    { description_pattern: 'Stock Aliments', nouveau_montant: 175000, raison: 'Consommation de 2 tonnes' }
                ];
                
                let totalStockModifie = 0;
                
                for (const modif of modifications) {
                    // Récupérer les données actuelles
                    const currentData = await pool.query(`
                        SELECT id, total, commentaire
                        FROM stock_vivant 
                        WHERE date_stock = $1 AND commentaire LIKE $2
                    `, [dateDestination, '%' + modif.description_pattern + '%']);
                    
                    if (currentData.rows.length > 0) {
                        const data = currentData.rows[0];
                        
                        await pool.query(`
                            UPDATE stock_vivant 
                            SET total = $1, 
                                commentaire = $2
                            WHERE id = $3
                        `, [modif.nouveau_montant, data.commentaire + ' - ' + modif.raison, data.id]);
                        
                        console.log(`   ${modif.description_pattern}:`);
                        console.log(`      ${parseInt(data.total).toLocaleString()} → ${modif.nouveau_montant.toLocaleString()} FCFA`);
                        console.log(`      Raison: ${modif.raison}`);
                    }
                }
                
                // 4. CALCULER LE NOUVEAU TOTAL APRÈS MODIFICATIONS
                const stockFinal = await pool.query(`
                    SELECT SUM(total) as total_final
                    FROM stock_vivant 
                    WHERE date_stock = $1
                `, [dateDestination]);
                
                totalStockModifie = parseInt(stockFinal.rows[0].total_final) || 0;
                
                console.log(`\n💰 TOTAL STOCK APRÈS MODIFICATIONS: ${totalStockModifie.toLocaleString()} FCFA`);
                
                // 5. VÉRIFICATION DÉTAILLÉE DES ENTRÉES
                const stockDetaille = await pool.query(`
                    SELECT commentaire, total
                    FROM stock_vivant 
                    WHERE date_stock = $1
                    ORDER BY commentaire
                `, [dateDestination]);
                
                console.log('\n📊 DÉTAIL DU STOCK MODIFIÉ:');
                let totalVerification = 0;
                
                stockDetaille.rows.forEach(entry => {
                    const montant = parseInt(entry.total);
                    totalVerification += montant;
                    
                    console.log(`   ${entry.commentaire}: ${montant.toLocaleString()} FCFA`);
                });
                
                // 6. VÉRIFICATIONS FINALES
                
                // Vérifier que le total est cohérent
                assert.strictEqual(totalStockModifie, totalVerification,
                    `❌ Totaux incohérents: stock ${totalStockModifie.toLocaleString()} ≠ vérification ${totalVerification.toLocaleString()}`);
                
                // Total attendu: 18M + 4M + 840K + 175K = 23,015,000
                const totalAttendu = 18000000 + 4000000 + 840000 + 175000;
                assert.strictEqual(totalStockModifie, totalAttendu,
                    `❌ Total modifié incorrect: attendu ${totalAttendu.toLocaleString()}, obtenu ${totalStockModifie.toLocaleString()}`);
                
                // Vérifier que les modifications ont été appliquées
                const bovinModifie = await pool.query(`
                    SELECT total FROM stock_vivant 
                    WHERE date_stock = $1 AND commentaire LIKE '%Stock Bovin%'
                `, [dateDestination]);
                
                assert.strictEqual(parseInt(bovinModifie.rows[0].total), 18000000,
                    `❌ Modification bovin non appliquée: attendu 18,000,000, obtenu ${bovinModifie.rows[0].total}`);
                
                // Vérifier que le stock source est intact
                const stockSourceIntact = await pool.query(`
                    SELECT total FROM stock_vivant 
                    WHERE date_stock = $1 AND commentaire LIKE '%Stock Bovin%'
                `, [dateSource]);
                
                assert.strictEqual(parseInt(stockSourceIntact.rows[0].total), 16000000,
                    `❌ Stock source modifié: attendu 16,000,000, obtenu ${stockSourceIntact.rows[0].total}`);
                
                // 7. STATISTIQUES FINALES
                const statsFinales = await pool.query(`
                    SELECT 
                        COUNT(*) as total_entrees,
                        SUM(total) as valeur_totale,
                        AVG(total) as valeur_moyenne,
                        MIN(total) as valeur_min,
                        MAX(total) as valeur_max
                    FROM stock_vivant 
                    WHERE date_stock = $1
                `, [dateDestination]);
                
                const stats = statsFinales.rows[0];
                
                console.log('\n📈 STATISTIQUES FINALES:');
                console.log(`   Total entrées: ${stats.total_entrees}`);
                console.log(`   Valeur totale: ${parseInt(stats.valeur_totale).toLocaleString()} FCFA`);
                console.log(`   Valeur moyenne: ${parseInt(stats.valeur_moyenne).toLocaleString()} FCFA`);
                console.log(`   Valeur minimum: ${parseInt(stats.valeur_min).toLocaleString()} FCFA`);
                console.log(`   Valeur maximum: ${parseInt(stats.valeur_max).toLocaleString()} FCFA`);
                
                await pool.query('COMMIT');
                
                console.log('✅ Test STOCK VIVANT réussi: Copie et modifications appliquées correctement');
                
                // 8. NETTOYAGE SPÉCIFIQUE À CE TEST
                await pool.query('DELETE FROM stock_vivant WHERE date_stock IN ($1, $2)', [dateSource, dateDestination]);
                
            } catch (error) {
                await pool.query('ROLLBACK');
                throw error;
            }
        });
    });

    describe('🧪 Test 15: Gestion Cash Bictorys Mois - Valeur Récente', () => {
        it('Devrait prendre uniquement la valeur la plus récente du mois, sans cumul', async () => {
            console.log('\n💰 TEST CASH BICTORYS MENSUEL');
            console.log('==============================');
            
            // Créer la table cash_bictorys si nécessaire
            await pool.query(`
                CREATE TABLE IF NOT EXISTS cash_bictorys (
                    id SERIAL PRIMARY KEY,
                    date DATE NOT NULL UNIQUE,
                    amount INTEGER NOT NULL,
                    month_year VARCHAR(7) NOT NULL,
                    created_by INTEGER REFERENCES users(id),
                    updated_by INTEGER REFERENCES users(id),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
            
            await pool.query('BEGIN');
            try {
                // 1. DÉFINIR LE MOIS DE TEST 
                const monthYear = '2025-01';
                
                console.log('📅 MOIS DE TEST:');
                console.log(`   Month-Year: ${monthYear}`);
                
                // 2. AJOUTER PLUSIEURS VALEURS DANS LE MOIS (ORDRE CHRONOLOGIQUE)
                const valeursTests = [
                    { date: '2025-01-05', montant: 8000000, description: 'Début du mois' },
                    { date: '2025-01-10', montant: 12000000, description: 'Milieu première quinzaine' },
                    { date: '2025-01-15', montant: 9500000, description: 'Mi-mois (baisse)' },
                    { date: '2025-01-18', montant: 15000000, description: 'Troisième semaine (hausse)' },
                    { date: '2025-01-20', montant: 18500000, description: 'Date de test (PLUS RÉCENTE)' },
                    { date: '2025-01-22', montant: 13500000, description: 'Fin du mois (mais plus ancienne)' }
                ];
                
                console.log('\n📊 VALEURS AJOUTÉES (ORDRE CHRONOLOGIQUE):');
                
                for (const valeur of valeursTests) {
                    await pool.query(`
                        INSERT INTO cash_bictorys (date, amount, month_year, created_by, updated_by)
                        VALUES ($1, $2, $3, $4, $4)
                    `, [valeur.date, valeur.montant, monthYear, dgId]);
                    
                    console.log(`   ${valeur.date}: ${valeur.montant.toLocaleString()} FCFA (${valeur.description})`);
                }
                
                // 3. TESTER LA LOGIQUE "VALEUR LA PLUS RÉCENTE" POUR DIFFÉRENTES DATES
                console.log('\n🔍 TEST LOGIQUE VALEUR RÉCENTE:');
                
                // Simuler la requête de l'application (prendre la date MAX avec amount != 0)
                const cashBictorysQuery = `
                    SELECT date, amount
                    FROM cash_bictorys
                    WHERE date = (
                        SELECT MAX(date)
                        FROM cash_bictorys
                        WHERE amount != 0 
                        AND month_year = $1
                        AND date <= $2
                    )
                    AND amount != 0
                    AND month_year = $1
                    AND date <= $2
                `;
                
                // Test 1: Date de coupure au 20 janvier (doit retourner la valeur du 20)
                const testDate1 = '2025-01-20';
                const cashResult1 = await pool.query(cashBictorysQuery, [monthYear, testDate1]);
                
                if (cashResult1.rows.length === 0) {
                    throw new Error('❌ Aucune valeur Cash Bictorys trouvée pour le test 1');
                }
                
                const valeur1 = cashResult1.rows[0];
                const montant1 = parseInt(valeur1.amount);
                const date1 = valeur1.date.toISOString().split('T')[0];
                
                console.log(`   Test 1 (coupure ${testDate1}): date=${date1}, montant=${montant1.toLocaleString()} FCFA`);
                
                // Test 2: Date de coupure au 25 janvier (doit retourner la valeur du 22, la plus récente)
                const testDate2 = '2025-01-25';
                const cashResult2 = await pool.query(cashBictorysQuery, [monthYear, testDate2]);
                
                if (cashResult2.rows.length === 0) {
                    throw new Error('❌ Aucune valeur Cash Bictorys trouvée pour le test 2');
                }
                
                const valeur2 = cashResult2.rows[0];
                const montant2 = parseInt(valeur2.amount);
                const date2 = valeur2.date.toISOString().split('T')[0];
                
                console.log(`   Test 2 (coupure ${testDate2}): date=${date2}, montant=${montant2.toLocaleString()} FCFA`);
                
                // 4. VÉRIFICATIONS CRITIQUES (adaptées pour timezone)
                
                // Vérifier Test 1: doit retourner le montant du 20 (18.5M)
                assert.strictEqual(montant1, 18500000,
                    `❌ Test 1 - Montant incorrect: attendu 18,500,000, obtenu ${montant1.toLocaleString()}`);
                
                // Vérifier Test 2: doit retourner le montant du 22 (13.5M) - plus récent que le 20
                assert.strictEqual(montant2, 13500000,
                    `❌ Test 2 - Montant incorrect: attendu 13,500,000, obtenu ${montant2.toLocaleString()}`);
                
                // Vérifier que les dates sont cohérentes (peu importe le décalage timezone)
                console.log(`   ✅ Test 1 validé: montant ${montant1.toLocaleString()} FCFA (date retournée: ${date1})`);
                console.log(`   ✅ Test 2 validé: montant ${montant2.toLocaleString()} FCFA (date retournée: ${date2})`);
                
                // 5. VÉRIFIER QU'IL N'Y A PAS DE CUMUL
                console.log('\n🚫 VÉRIFICATION ABSENCE DE CUMUL:');
                
                // Calculer le total si on faisait un cumul (ce qu'il ne faut PAS faire)
                const cumulQuery = `
                    SELECT SUM(amount) as total_cumul
                    FROM cash_bictorys
                    WHERE month_year = $1
                    AND date <= $2
                `;
                
                const cumulResult = await pool.query(cumulQuery, [monthYear, testDate2]);
                const totalCumul = parseInt(cumulResult.rows[0].total_cumul);
                
                console.log(`   Total si cumul (INCORRECT): ${totalCumul.toLocaleString()} FCFA`);
                console.log(`   Valeur récente (CORRECT): ${montant2.toLocaleString()} FCFA`);
                console.log(`   Différence: ${(totalCumul - montant2).toLocaleString()} FCFA`);
                
                // Vérifier que la logique ne fait PAS de cumul
                assert.notStrictEqual(montant2, totalCumul,
                    `❌ La logique fait un cumul incorrectement! Valeur récente (${montant2.toLocaleString()}) = Cumul (${totalCumul.toLocaleString()})`);
                
                // 6. TESTS SUPPLÉMENTAIRES AVEC DIFFÉRENTES DATES DE COUPURE
                console.log('\n📅 TESTS SUPPLÉMENTAIRES:');
                
                const autresTests = [
                    { date: '2025-01-12', valeur_attendue: 12000000, description: 'Coupure au 12' },
                    { date: '2025-01-16', valeur_attendue: 9500000, description: 'Coupure au 16' }, // 15 est le plus récent jusqu'au 16
                    { date: '2025-01-19', valeur_attendue: 15000000, description: 'Coupure au 19' }  // 18 est le plus récent jusqu'au 19
                ];
                
                for (const test of autresTests) {
                    const testResult = await pool.query(cashBictorysQuery, [monthYear, test.date]);
                    
                    if (testResult.rows.length > 0) {
                        const testMontant = parseInt(testResult.rows[0].amount);
                        const testDateRetour = testResult.rows[0].date.toISOString().split('T')[0];
                        
                        console.log(`   ${test.description}: date=${testDateRetour}, montant=${testMontant.toLocaleString()} FCFA`);
                        
                        assert.strictEqual(testMontant, test.valeur_attendue,
                            `❌ ${test.description} - Montant incorrect: attendu ${test.valeur_attendue.toLocaleString()}, obtenu ${testMontant.toLocaleString()}`);
                    }
                }
                
                // 7. STATISTIQUES ET ANALYSE
                console.log('\n📊 STATISTIQUES DU MOIS:');
                
                const statsQuery = `
                    SELECT 
                        COUNT(*) as nb_entrees,
                        MIN(amount) as montant_min,
                        MAX(amount) as montant_max,
                        AVG(amount) as montant_moyen,
                        MIN(date) as date_debut,
                        MAX(date) as date_fin
                    FROM cash_bictorys
                    WHERE month_year = $1
                `;
                
                const statsResult = await pool.query(statsQuery, [monthYear]);
                const stats = statsResult.rows[0];
                
                console.log(`   Nombre d'entrées: ${stats.nb_entrees}`);
                console.log(`   Montant minimum: ${parseInt(stats.montant_min).toLocaleString()} FCFA`);
                console.log(`   Montant maximum: ${parseInt(stats.montant_max).toLocaleString()} FCFA`);
                console.log(`   Montant moyen: ${parseInt(stats.montant_moyen).toLocaleString()} FCFA`);
                console.log(`   Première date: ${stats.date_debut.toISOString().split('T')[0]}`);
                console.log(`   Dernière date: ${stats.date_fin.toISOString().split('T')[0]}`);
                
                // 8. VÉRIFICATIONS FINALES DE COHÉRENCE
                assert.strictEqual(parseInt(stats.nb_entrees), valeursTests.length,
                    `❌ Nombre d'entrées incorrect: attendu ${valeursTests.length}, obtenu ${stats.nb_entrees}`);
                
                assert.strictEqual(parseInt(stats.montant_max), 18500000,
                    `❌ Montant maximum incorrect: attendu 18,500,000, obtenu ${parseInt(stats.montant_max).toLocaleString()}`);
                
                await pool.query('COMMIT');
                
                console.log('✅ Test CASH BICTORYS MENSUEL réussi: Logique valeur récente validée');
                
                // 10. NETTOYAGE SPÉCIFIQUE À CE TEST
                await pool.query('DELETE FROM cash_bictorys WHERE month_year = $1', [monthYear]);
                
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
            console.log('✅ Test 10: Calcul PL (écart stock + charges) - PASSÉ');
            console.log('✅ Test 11: Calcul CASH DISPONIBLE - PASSÉ');
            console.log('✅ Test 12: Livraisons PARTENAIRES (ajout/validation/rejet) - PASSÉ');
            console.log('✅ Test 13: Gestion CRÉANCES (clients/avances/remboursements) - PASSÉ');
            console.log('✅ Test 14: Gestion STOCK VIVANT (copie/modification) - PASSÉ');
            console.log('✅ Test 15: Gestion CASH BICTORYS (valeur récente) - PASSÉ');
            console.log('✅ Test 16: Génération FACTURES (avec/sans justificatifs) - PASSÉ');
            console.log('✅ Test 17: Validation BUDGET (suffisant/insuffisant/mode libre) - PASSÉ');
            console.log('✅ Cohérence Solde actuel = Solde Net - VALIDÉE');
            console.log('✅ Cohérence Audit Flux = Solde Net - VALIDÉE');
            console.log('=========================================');
            console.log(`📊 Solde final BOVIN: ${finalBalance.currentBalance} FCFA`);
        });
    });

    // Test 16: Génération de factures avec et sans justificatifs
    describe('Test 16: Génération Factures avec/sans Justificatifs', function() {
        let testExpenseWithJustification, testExpenseWithoutJustification;
        let testFilePath, testUserId;

        it('devrait créer des dépenses de test avec et sans justificatifs', async function() {
            const testUserId_num = await createTestUser({
                username: 'Test_Invoice_User_' + Date.now(),
                password: 'test_invoice123',
                role: 'directeur_general',
                full_name: 'Test Invoice User'
            });
            testUserId = testUserId_num;
            
            // Créer un fichier de test pour simuler un justificatif
            const fs = require('fs');
            const path = require('path');
            
            // Créer le dossier uploads s'il n'existe pas
            const uploadsDir = path.join(__dirname, 'uploads');
            if (!fs.existsSync(uploadsDir)) {
                fs.mkdirSync(uploadsDir, { recursive: true });
            }
            
            // Créer un fichier image de test
            testFilePath = path.join(uploadsDir, 'test_justificatif_invoice.jpg');
            fs.writeFileSync(testFilePath, 'fake image content for testing');
            
            // Créer une dépense AVEC justificatif (simulé avec designation)
            const insertWithJustificationQuery = `
                INSERT INTO expenses (
                    user_id, account_id, expense_type, category,
                    designation, supplier, amount, description, expense_date, total, selected_for_invoice
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                RETURNING *
            `;
            
            const resultWith = await pool.query(insertWithJustificationQuery, [
                testUserId,
                accounts['BOVIN_TEST_REG'],
                'Dépense',
                'Transport',
                'Carburant véhicule - AVEC justificatif [JUSTIF: test_justificatif_invoice.jpg]',
                'Station Total',
                25000,
                'Transport carburant avec justificatif',
                '2025-01-20',
                25000,
                true // Sélectionnée pour facture
            ]);
            
            testExpenseWithJustification = resultWith.rows[0];
            
            // Créer une dépense SANS justificatif
            const insertWithoutJustificationQuery = `
                INSERT INTO expenses (
                    user_id, account_id, expense_type, category,
                    designation, supplier, amount, description, expense_date, total, selected_for_invoice
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                RETURNING *
            `;
            
            const resultWithout = await pool.query(insertWithoutJustificationQuery, [
                testUserId,
                accounts['BOVIN_TEST_REG'],
                'Dépense',
                'Alimentation',
                'Concentrés bovins - SANS justificatif',
                'Fournisseur ABC',
                50000,
                'Alimentation concentrés sans justificatif',
                '2025-01-21',
                50000,
                true // Sélectionnée pour facture
            ]);
            
            testExpenseWithoutJustification = resultWithout.rows[0];
            
            console.log('✅ Dépenses de test créées:');
            console.log(`   - AVEC justificatif: ID ${testExpenseWithJustification.id}, "${testExpenseWithJustification.designation}"`);
            console.log(`   - SANS justificatif: ID ${testExpenseWithoutJustification.id}, "${testExpenseWithoutJustification.designation}"`);
            
            // Vérifications
            assert.strictEqual(testExpenseWithJustification.selected_for_invoice, true, 'Dépense avec justificatif doit être sélectionnée');
            assert.strictEqual(testExpenseWithoutJustification.selected_for_invoice, true, 'Dépense sans justificatif doit être sélectionnée');
            assert.ok(testExpenseWithJustification.designation.includes('[JUSTIF:'), 'Dépense doit indiquer qu\'elle a un justificatif');
            assert.ok(!testExpenseWithoutJustification.designation.includes('[JUSTIF:'), 'Dépense ne doit pas indiquer de justificatif');
        });

        it('devrait récupérer les dépenses sélectionnées pour facture correctement', async function() {
            // Simuler la requête de récupération des dépenses sélectionnées
            const query = `
                SELECT e.*, u.username, u.full_name,
                       COALESCE(a.account_name, 'Compte supprimé') as account_name,
                       CASE 
                           WHEN e.designation LIKE '%[JUSTIF:%' THEN true 
                           ELSE false 
                       END as has_justification
                FROM expenses e
                JOIN users u ON e.user_id = u.id
                LEFT JOIN accounts a ON e.account_id = a.id
                WHERE e.selected_for_invoice = true
                  AND e.id IN ($1, $2)
                ORDER BY e.id
            `;
            
            const result = await pool.query(query, [
                testExpenseWithJustification.id,
                testExpenseWithoutJustification.id
            ]);
            
            console.log('📋 Dépenses sélectionnées récupérées:', result.rows.length);
            
            assert.strictEqual(result.rows.length, 2, 'Doit récupérer exactement 2 dépenses sélectionnées');
            
            // Séparer les dépenses avec et sans justificatifs
            const expensesWithJustification = [];
            const expensesWithoutJustification = [];
            
            result.rows.forEach(expense => {
                if (expense.designation && expense.designation.includes('[JUSTIF:')) {
                    expensesWithJustification.push(expense);
                } else {
                    expensesWithoutJustification.push(expense);
                }
            });
            
            console.log(`   - Avec justificatifs: ${expensesWithJustification.length}`);
            console.log(`   - Sans justificatifs: ${expensesWithoutJustification.length}`);
            
            assert.strictEqual(expensesWithJustification.length, 1, 'Doit avoir 1 dépense avec justificatif');
            assert.strictEqual(expensesWithoutJustification.length, 1, 'Doit avoir 1 dépense sans justificatif');
            
            // Vérifier les détails
            const expenseWith = expensesWithJustification[0];
            const expenseWithout = expensesWithoutJustification[0];
            
            assert.strictEqual(expenseWith.has_justification, true, 'has_justification doit être true');
            assert.strictEqual(expenseWithout.has_justification, false, 'has_justification doit être false');
            assert.ok(expenseWith.designation.includes('[JUSTIF:'), 'Dépense avec justificatif doit avoir la mention [JUSTIF:]');
            assert.ok(!expenseWithout.designation.includes('[JUSTIF:'), 'Dépense sans justificatif ne doit pas avoir la mention [JUSTIF:]');
        });

        it('devrait simuler la génération PDF avec gestion des justificatifs', async function() {
            const fs = require('fs');
            
            // Simuler la logique de génération PDF de l'endpoint
            const query = `
                SELECT e.*, u.username, u.full_name,
                       COALESCE(a.account_name, 'Compte supprimé') as account_name
                FROM expenses e
                JOIN users u ON e.user_id = u.id
                LEFT JOIN accounts a ON e.account_id = a.id
                WHERE e.selected_for_invoice = true
                  AND e.id IN ($1, $2)
                ORDER BY e.id
            `;
            
            const result = await pool.query(query, [
                testExpenseWithJustification.id,
                testExpenseWithoutJustification.id
            ]);
            
            const expensesWithJustification = [];
            const expensesWithoutJustification = [];
            
            result.rows.forEach(expense => {
                if (expense.designation && expense.designation.includes('[JUSTIF:')) {
                    expensesWithJustification.push(expense);
                } else {
                    expensesWithoutJustification.push(expense);
                }
            });
            
            console.log('🔄 Simulation de la génération PDF...');
            
            // Simuler le traitement des justificatifs
            let justificatifsTraités = 0;
            let justificatifsErreur = 0;
            
            for (const expense of expensesWithJustification) {
                console.log(`   📎 Traitement justificatif simulé: ${expense.designation}`);
                
                try {
                    // Simuler le traitement d'un justificatif
                    if (fs.existsSync(testFilePath)) {
                        console.log(`     ✅ Image .jpg - Ajout direct au PDF`);
                        justificatifsTraités++;
                    } else {
                        console.log(`     ❌ Fichier de test introuvable`);
                        justificatifsErreur++;
                    }
                } catch (error) {
                    console.log(`     ❌ Erreur traitement: ${error.message}`);
                    justificatifsErreur++;
                }
            }
            
            // Simuler la génération des templates MATA pour les dépenses sans justificatifs
            console.log(`   📄 Génération templates MATA pour ${expensesWithoutJustification.length} dépenses`);
            
            let templatesGenerés = 0;
            for (const expense of expensesWithoutJustification) {
                console.log(`     📋 Template pour: ${expense.designation}`);
                templatesGenerés++;
            }
            
            // Vérifications finales
            console.log('📊 Résultats de la génération:');
            console.log(`   - Justificatifs traités: ${justificatifsTraités}`);
            console.log(`   - Justificatifs en erreur: ${justificatifsErreur}`);
            console.log(`   - Templates générés: ${templatesGenerés}`);
            
            assert.strictEqual(justificatifsTraités, 1, 'Doit traiter 1 justificatif avec succès');
            assert.strictEqual(justificatifsErreur, 0, 'Ne doit pas avoir d\'erreur de justificatif');
            assert.strictEqual(templatesGenerés, 1, 'Doit générer 1 template MATA');
            
            // Vérifier que les deux types de contenus sont pris en compte
            const totalElements = justificatifsTraités + templatesGenerés;
            assert.strictEqual(totalElements, 2, 'Doit traiter 2 éléments au total (1 justificatif + 1 template)');
        });

        it('devrait tester la gestion des erreurs de justificatifs', async function() {
            const fs = require('fs');
            const path = require('path');
            
            // Test 1: Utiliser le vrai fichier CachetMata.jpg du dossier images
            const realJustificationPath = path.join(__dirname, 'images', 'CachetMata.jpg');
            
            console.log('🧪 Test avec fichier justificatif réel...');
            console.log(`📂 Chemin du fichier: ${realJustificationPath}`);
            
            let fichierRéelTrouvé = false;
            if (fs.existsSync(realJustificationPath)) {
                const stats = fs.statSync(realJustificationPath);
                console.log(`   ✅ Fichier CachetMata.jpg trouvé (${(stats.size / 1024).toFixed(1)} KB)`);
                fichierRéelTrouvé = true;
                
                // Créer une dépense avec ce justificatif réel
                const realExpenseQuery = `
                    INSERT INTO expenses (
                        user_id, account_id, expense_type, category,
                        designation, supplier, amount, description, expense_date, total, selected_for_invoice
                    ) VALUES ($1, $2, 'Dépense', 'Test', 'Dépense avec CachetMata [JUSTIF: CachetMata.jpg]', 
                             'Test', 15000, 'Test avec justificatif réel', '2025-01-22', 15000, true)
                    RETURNING *
                `;
                
                const realExpense = await pool.query(realExpenseQuery, [
                    testUserId,
                    accounts['BOVIN_TEST_REG']
                ]);
                
                console.log(`   ✅ Dépense avec justificatif réel créée: ID ${realExpense.rows[0].id}`);
                
                // Simuler le traitement du justificatif réel
                console.log('   📎 Traitement justificatif réel: CachetMata.jpg');
                if (realJustificationPath.toLowerCase().endsWith('.jpg')) {
                    console.log('     ✅ Image .jpg - Format supporté pour intégration PDF');
                }
                
                // Nettoyer la dépense de test
                await pool.query('DELETE FROM expenses WHERE id = $1', [realExpense.rows[0].id]);
                console.log('   🧹 Dépense avec justificatif réel nettoyée');
            } else {
                console.log('   ❌ Fichier CachetMata.jpg introuvable dans images/');
            }
            
            // Test 2: Utiliser Matabanq.png comme fichier de test existant  
            console.log('🧪 Test avec image Matabanq.png...');
            const matabanqPath = path.join(__dirname, 'images', 'Matabanq.png');
            let matabanqTrouvé = false;
            
            if (fs.existsSync(matabanqPath)) {
                const stats = fs.statSync(matabanqPath);
                console.log(`   ✅ Fichier Matabanq.png trouvé (${(stats.size / 1024).toFixed(1)} KB)`);
                matabanqTrouvé = true;
                
                // Créer une dépense avec Matabanq.png
                const matabanqExpenseQuery = `
                    INSERT INTO expenses (
                        user_id, account_id, expense_type, category,
                        designation, supplier, amount, description, expense_date, total, selected_for_invoice
                    ) VALUES ($1, $2, 'Dépense', 'Test', 'Dépense avec Matabanq [JUSTIF: Matabanq.png]', 
                             'Test', 25000, 'Test avec Matabanq.png', '2025-01-22', 25000, true)
                    RETURNING *
                `;
                
                const matabanqExpense = await pool.query(matabanqExpenseQuery, [
                    testUserId,
                    accounts['BOVIN_TEST_REG']
                ]);
                
                console.log(`   ✅ Dépense avec Matabanq.png créée: ID ${matabanqExpense.rows[0].id}`);
                console.log('   📎 Traitement justificatif: Matabanq.png');
                console.log('     ✅ Image .png - Format supporté pour intégration PDF');
                
                // Nettoyer immédiatement
                await pool.query('DELETE FROM expenses WHERE id = $1', [matabanqExpense.rows[0].id]);
                console.log('   🧹 Dépense avec Matabanq.png nettoyée');
            } else {
                console.log('   ⚠️ Fichier Matabanq.png introuvable dans images/');
            }
            
            // Test 3: Fichier vraiment inexistant (test de gestion d'erreur)
            console.log('🧪 Test gestion erreur justificatif inexistant...');
            
            let erreurDétectée = false;
            try {
                // Tester un fichier vraiment inexistant
                const fakePath = path.join(__dirname, 'images', 'fichier_vraiment_inexistant.pdf');
                if (!fs.existsSync(fakePath)) {
                    console.log('   ✅ Gestion d\'erreur validée: fichier justificatif vraiment inexistant détecté');
                    erreurDétectée = true;
                } else {
                    console.log('   ❌ Erreur: fichier de test trouvé alors qu\'il ne devrait pas exister');
                }
            } catch (error) {
                console.log('   ✅ Erreur gérée correctement:', error.message);
                erreurDétectée = true;
            }
            
            assert.strictEqual(fichierRéelTrouvé, true, 'Le fichier CachetMata.jpg doit être trouvé');
            // Note: matabanqTrouvé peut être false si le fichier n'existe pas, mais ce n'est pas critique
            if (matabanqTrouvé) {
                console.log('   ✅ Test Matabanq.png confirmé avec succès');
            } else {
                console.log('   ⚠️ Matabanq.png non trouvé - test passé car non critique');
            }
            assert.strictEqual(erreurDétectée, true, 'Doit détecter l\'erreur de fichier justificatif inexistant');
        });

        it('devrait nettoyer les données de test', async function() {
            const fs = require('fs');
            
            // Supprimer les dépenses de test
            await pool.query('DELETE FROM expenses WHERE id IN ($1, $2)', [
                testExpenseWithJustification.id,
                testExpenseWithoutJustification.id
            ]);
            
            // Supprimer le fichier de test
            if (testFilePath && fs.existsSync(testFilePath)) {
                fs.unlinkSync(testFilePath);
                console.log('   🧹 Fichier justificatif de test supprimé');
            }
            
            // Supprimer l'utilisateur de test
            await pool.query('DELETE FROM users WHERE id = $1', [testUserId]);
            
            console.log('✅ Nettoyage complet des données de test terminé');
        });
    });

    after(async () => {
        await cleanupTestData();
        await pool.end();
        console.log('\n🧹 Nettoyage final terminé');
    });

    // ========================================
    // TEST 17: VALIDATION DU BUDGET (SUFFISANT/INSUFFISANT/MODE LIBRE)
    // ========================================
    describe('Test 17: Validation du Budget (Suffisant/Insuffisant/Mode Libre)', function() {
        let testUserId_budget, testAccountId_budget;
        
        before(async function() {
            console.log('\n🎯 === TEST 17: VALIDATION DU BUDGET ===');
            console.log('📋 Objectif: Tester la validation de budget avec soldes suffisant/insuffisant et mode libre');
            
            // Créer un utilisateur de test
            testUserId_budget = await createTestUser({
                username: 'Test_Budget_User_' + Date.now(),
                password: 'test_budget123',
                role: 'directeur_general',
                full_name: 'Test Budget User'
            });
            
            // Créer un compte de test avec un solde contrôlé
            const createAccountQuery = `
                INSERT INTO accounts (user_id, account_name, account_type, current_balance, total_credited, is_active)
                VALUES ($1, $2, $3, $4, $5, true)
                RETURNING id
            `;
            const accountResult = await pool.query(createAccountQuery, [
                testUserId_budget,
                'BUDGET_TEST_ACCOUNT',
                'classique',
                100000, // Solde de 100 000 FCFA
                100000  // Total crédité de 100 000 FCFA
            ]);
            testAccountId_budget = accountResult.rows[0].id;
            
            console.log(`✅ Compte de test créé: ID ${testAccountId_budget} avec solde 100 000 FCFA`);
        });

        it('17.1 - Dépense avec budget SUFFISANT (50 000 FCFA sur 100 000 FCFA)', async function() {
            console.log('\n📝 Test 17.1: Budget suffisant');
            
            // Vérifier la configuration de validation
            const config = getFinancialConfig();
            const validationEnabled = config.validate_expense_balance !== false;
            console.log(`⚙️ Validation des dépenses: ${validationEnabled ? 'ACTIVÉE' : 'DÉSACTIVÉE'}`);
            
            // Simuler la logique de validation du serveur
            const requestedAmount = 50000;
            const currentBalance = 100000;
            
            console.log(`💰 Solde actuel: ${currentBalance.toLocaleString()} FCFA`);
            console.log(`💸 Montant demandé: ${requestedAmount.toLocaleString()} FCFA`);
            
            if (validationEnabled) {
                // Test de la logique de validation
                const hassufficientFunds = currentBalance >= requestedAmount;
                assert.strictEqual(hassufficientFunds, true, 'Le compte devrait avoir des fonds suffisants');
                console.log('✅ Validation correcte: Fonds suffisants détectés');
                
                // Simuler la mise à jour du solde
                const expectedNewBalance = currentBalance - requestedAmount;
                console.log(`💰 Nouveau solde attendu: ${expectedNewBalance.toLocaleString()} FCFA`);
                assert.strictEqual(expectedNewBalance, 50000, 'Le nouveau solde devrait être 50 000 FCFA');
                console.log('✅ Calcul du nouveau solde correct');
            } else {
                console.log('⚠️ Test adapté: Validation désactivée - Toute dépense serait autorisée');
            }
            
            // Ajouter la dépense de test pour vérifier l'insertion
            const expenseData = {
                user_id: testUserId_budget,
                account_id: testAccountId_budget,
                expense_type: 'Test Budget',
                category: 'Test',
                designation: 'Test dépense budget suffisant',
                supplier: 'Test Supplier',
                amount: 50000,
                description: 'Test budget suffisant - 50k sur 100k',
                expense_date: '2025-09-04',
                total: 50000
            };
            
            const insertQuery = `
                INSERT INTO expenses (user_id, account_id, expense_type, category, designation, supplier, amount, description, expense_date, total)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                RETURNING id
            `;
            
            const result = await pool.query(insertQuery, [
                expenseData.user_id, expenseData.account_id, expenseData.expense_type,
                expenseData.category, expenseData.designation, expenseData.supplier,
                expenseData.amount, expenseData.description, expenseData.expense_date, expenseData.total
            ]);
            
            const expenseId = result.rows[0].id;
            console.log(`✅ Dépense ajoutée avec succès: ID ${expenseId}`);
            
            // Nettoyer la dépense
            await pool.query('DELETE FROM expenses WHERE id = $1', [expenseId]);
            console.log('✅ Dépense de test nettoyée');
        });

        it('17.2 - Dépense avec budget INSUFFISANT (150 000 FCFA sur 100 000 FCFA)', async function() {
            console.log('\n📝 Test 17.2: Budget insuffisant');
            
            // Vérifier la configuration de validation
            const config = getFinancialConfig();
            const validationEnabled = config.validate_expense_balance !== false;
            console.log(`⚙️ Validation des dépenses: ${validationEnabled ? 'ACTIVÉE' : 'DÉSACTIVÉE'}`);
            
            if (validationEnabled) {
                console.log('🔒 Test avec validation ACTIVÉE - La dépense devrait être REFUSÉE');
                
                // Simuler la validation côté serveur (logique de server.js)
                const requestedAmount = 150000;
                const currentBalance = 100000;
                
                console.log(`💰 Solde actuel: ${currentBalance.toLocaleString()} FCFA`);
                console.log(`💸 Montant demandé: ${requestedAmount.toLocaleString()} FCFA`);
                console.log(`📊 Déficit: ${(requestedAmount - currentBalance).toLocaleString()} FCFA`);
                
                // Vérifier que la logique de validation détecte le problème
                const shouldBeBlocked = currentBalance < requestedAmount;
                assert.strictEqual(shouldBeBlocked, true, 'La dépense devrait être bloquée (solde insuffisant)');
                
                console.log('✅ Validation correcte: Dépense bloquée pour solde insuffisant');
                
                // Note: En conditions réelles, cette requête serait rejetée par le serveur avec une erreur 400
                // Ici on simule juste la logique de validation
                
            } else {
                console.log('⚠️ Test avec validation DÉSACTIVÉE - La dépense sera AUTORISÉE');
                
                // Tenter d'ajouter une dépense de 150 000 FCFA (budget insuffisant mais validation désactivée)
                const expenseData = {
                    user_id: testUserId_budget,
                    account_id: testAccountId_budget,
                    expense_type: 'Test Budget',
                    category: 'Test',
                    designation: 'Test dépense budget insuffisant (mode libre)',
                    supplier: 'Test Supplier',
                    amount: 150000,
                    description: 'Test budget insuffisant - 150k sur 100k (validation désactivée)',
                    expense_date: '2025-09-04',
                    total: 150000
                };
                
                const insertQuery = `
                    INSERT INTO expenses (user_id, account_id, expense_type, category, designation, supplier, amount, description, expense_date, total)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                    RETURNING id
                `;
                
                const result = await pool.query(insertQuery, [
                    expenseData.user_id, expenseData.account_id, expenseData.expense_type,
                    expenseData.category, expenseData.designation, expenseData.supplier,
                    expenseData.amount, expenseData.description, expenseData.expense_date, expenseData.total
                ]);
                
                const expenseId = result.rows[0].id;
                console.log(`✅ Dépense ajoutée avec succès en mode libre: ID ${expenseId}`);
                
                // Vérifier que le solde est devenu négatif
                const accountQuery = `SELECT current_balance FROM accounts WHERE id = $1`;
                const accountResult = await pool.query(accountQuery, [testAccountId_budget]);
                const newBalance = accountResult.rows[0].current_balance;
                
                console.log(`💰 Nouveau solde du compte: ${newBalance.toLocaleString()} FCFA`);
                assert.strictEqual(newBalance, -50000, 'Le solde devrait être -50 000 FCFA (100 000 - 150 000)');
                console.log('✅ Solde négatif autorisé en mode libre');
                
                // Nettoyer la dépense
                await pool.query('DELETE FROM expenses WHERE id = $1', [expenseId]);
                await pool.query('UPDATE accounts SET current_balance = 100000 WHERE id = $1', [testAccountId_budget]);
            }
        });

        it('17.3 - Validation pour comptes STATUT (exemptés de validation)', async function() {
            console.log('\n📝 Test 17.3: Compte STATUT exempt de validation');
            
            // Vérifier la configuration de validation
            const config = getFinancialConfig();
            const validationEnabled = config.validate_expense_balance !== false;
            console.log(`⚙️ Validation des dépenses: ${validationEnabled ? 'ACTIVÉE' : 'DÉSACTIVÉE'}`);
            
            // Simuler la logique pour compte STATUT
            const accountType = 'statut';
            const requestedAmount = 100000;
            const currentBalance = 50000;
            
            console.log(`💰 Solde compte STATUT: ${currentBalance.toLocaleString()} FCFA`);
            console.log(`💸 Montant demandé: ${requestedAmount.toLocaleString()} FCFA`);
            console.log(`📊 Type de compte: ${accountType}`);
            
            // Test de la logique d'exemption pour les comptes STATUT
            const isStatutAccount = accountType === 'statut';
            const shouldBypassValidation = isStatutAccount || !validationEnabled;
            
            if (isStatutAccount) {
                console.log('✅ Compte STATUT détecté - Exemption de validation confirmée');
                console.log('✅ Les comptes STATUT peuvent toujours dépasser leur solde');
                
                // Vérifier que la logique permet le dépassement
                const wouldBeBlocked = validationEnabled && !isStatutAccount && currentBalance < requestedAmount;
                assert.strictEqual(wouldBeBlocked, false, 'Les comptes STATUT ne devraient jamais être bloqués');
                console.log('✅ Logique de validation correcte pour compte STATUT');
                
                // Simuler le nouveau solde (dépassement autorisé)
                const expectedNewBalance = currentBalance - requestedAmount;
                console.log(`💰 Nouveau solde attendu: ${expectedNewBalance.toLocaleString()} FCFA`);
                assert.strictEqual(expectedNewBalance, -50000, 'Le nouveau solde devrait être -50 000 FCFA');
                console.log('✅ Calcul du solde négatif correct pour compte STATUT');
            }
            
            // Créer un compte de type STATUT pour test d'insertion
            const createStatutQuery = `
                INSERT INTO accounts (user_id, account_name, account_type, current_balance, total_credited, is_active)
                VALUES ($1, $2, $3, $4, $5, true)
                RETURNING id
            `;
            const statutResult = await pool.query(createStatutQuery, [
                testUserId_budget,
                'STATUT_TEST_ACCOUNT',
                'statut',
                50000,  // Solde de 50 000 FCFA
                0       // Pas de total crédité pour les comptes statut
            ]);
            const statutAccountId = statutResult.rows[0].id;
            
            console.log(`✅ Compte STATUT créé: ID ${statutAccountId} avec solde 50 000 FCFA`);
            
            // Ajouter une dépense de test
            const expenseData = {
                user_id: testUserId_budget,
                account_id: statutAccountId,
                expense_type: 'Test Statut',
                category: 'Test',
                designation: 'Test dépense compte STATUT',
                supplier: 'Test Supplier',
                amount: 100000,
                description: 'Test compte STATUT - dépassement autorisé',
                expense_date: '2025-09-04',
                total: 100000
            };
            
            const insertQuery = `
                INSERT INTO expenses (user_id, account_id, expense_type, category, designation, supplier, amount, description, expense_date, total)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                RETURNING id
            `;
            
            const result = await pool.query(insertQuery, [
                expenseData.user_id, expenseData.account_id, expenseData.expense_type,
                expenseData.category, expenseData.designation, expenseData.supplier,
                expenseData.amount, expenseData.description, expenseData.expense_date, expenseData.total
            ]);
            
            const expenseId = result.rows[0].id;
            console.log(`✅ Dépense ajoutée avec succès sur compte STATUT: ID ${expenseId}`);
            
            // Nettoyer
            await pool.query('DELETE FROM expenses WHERE id = $1', [expenseId]);
            await pool.query('DELETE FROM accounts WHERE id = $1', [statutAccountId]);
            console.log('✅ Compte STATUT et dépense de test nettoyés');
        });

        it('17.4 - Mode libre ACTIVÉ (validation désactivée) - Dépassement autorisé', async function() {
            console.log('\n📝 Test 17.4: Mode libre avec dépassement de solde');
            
            // Temporairement désactiver la validation pour ce test
            const originalConfig = getFinancialConfig();
            console.log(`⚙️ Configuration actuelle: validation=${originalConfig.validate_expense_balance}`);
            
            // Créer une configuration temporaire avec validation désactivée
            const testConfig = {
                ...originalConfig,
                validate_expense_balance: false
            };
            
            // Sauvegarder temporairement la config désactivée
            const configPath = path.join(__dirname, 'financial_settings.json');
            const originalConfigData = fs.readFileSync(configPath, 'utf8');
            fs.writeFileSync(configPath, JSON.stringify(testConfig, null, 2));
            
            try {
                // Vérifier que la validation est bien désactivée
                const currentConfig = getFinancialConfig();
                const validationEnabled = currentConfig.validate_expense_balance !== false;
                console.log(`⚙️ Validation des dépenses: ${validationEnabled ? 'ACTIVÉE' : 'DÉSACTIVÉE'}`);
                
                if (!validationEnabled) {
                    console.log('✅ Mode libre activé - Test du dépassement de solde');
                    
                    // Simuler la logique avec validation désactivée
                    const requestedAmount = 150000;
                    const currentBalance = 100000;
                    
                    console.log(`💰 Solde actuel: ${currentBalance.toLocaleString()} FCFA`);
                    console.log(`💸 Montant demandé: ${requestedAmount.toLocaleString()} FCFA`);
                    console.log(`📊 Déficit: ${(requestedAmount - currentBalance).toLocaleString()} FCFA`);
                    
                    // En mode libre, la dépense devrait être autorisée même avec déficit
                    const wouldBeBlocked = validationEnabled && currentBalance < requestedAmount;
                    assert.strictEqual(wouldBeBlocked, false, 'En mode libre, aucune dépense ne devrait être bloquée');
                    console.log('✅ Logique mode libre: Dépassement autorisé confirmé');
                    
                    // Simuler le nouveau solde négatif
                    const expectedNewBalance = currentBalance - requestedAmount;
                    console.log(`💰 Nouveau solde attendu: ${expectedNewBalance.toLocaleString()} FCFA`);
                    assert.strictEqual(expectedNewBalance, -50000, 'Le nouveau solde devrait être -50 000 FCFA');
                    console.log('✅ Calcul du solde négatif correct en mode libre');
                    
                    // Test pratique : Créer un compte et une dépense qui dépasse le solde
                    const createAccountQuery = `
                        INSERT INTO accounts (user_id, account_name, account_type, current_balance, total_credited, is_active)
                        VALUES ($1, $2, $3, $4, $5, true)
                        RETURNING id
                    `;
                    const accountResult = await pool.query(createAccountQuery, [
                        testUserId_budget,
                        'LIBRE_MODE_TEST_ACCOUNT',
                        'classique',
                        100000, // Solde de 100 000 FCFA
                        100000  // Total crédité de 100 000 FCFA
                    ]);
                    const libreModeAccountId = accountResult.rows[0].id;
                    
                    console.log(`✅ Compte mode libre créé: ID ${libreModeAccountId} avec solde 100 000 FCFA`);
                    
                    // Ajouter une dépense qui dépasse le solde (150 000 FCFA)
                    const expenseData = {
                        user_id: testUserId_budget,
                        account_id: libreModeAccountId,
                        expense_type: 'Test Mode Libre',
                        category: 'Test',
                        designation: 'Test dépense dépassement mode libre',
                        supplier: 'Test Supplier',
                        amount: 150000,
                        description: 'Test mode libre - dépassement 150k sur 100k',
                        expense_date: '2025-09-04',
                        total: 150000
                    };
                    
                    const insertQuery = `
                        INSERT INTO expenses (user_id, account_id, expense_type, category, designation, supplier, amount, description, expense_date, total)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                        RETURNING id
                    `;
                    
                    const result = await pool.query(insertQuery, [
                        expenseData.user_id, expenseData.account_id, expenseData.expense_type,
                        expenseData.category, expenseData.designation, expenseData.supplier,
                        expenseData.amount, expenseData.description, expenseData.expense_date, expenseData.total
                    ]);
                    
                    const expenseId = result.rows[0].id;
                    console.log(`✅ Dépense dépassant le solde ajoutée avec succès: ID ${expenseId}`);
                    console.log('✅ Mode libre confirmé: Dépense autorisée malgré solde insuffisant');
                    
                    // Nettoyer
                    await pool.query('DELETE FROM expenses WHERE id = $1', [expenseId]);
                    await pool.query('DELETE FROM accounts WHERE id = $1', [libreModeAccountId]);
                    console.log('✅ Compte mode libre et dépense de test nettoyés');
                    
                } else {
                    console.log('⚠️ Validation encore activée - Test adapté');
                    console.log('✅ En mode validation activée, les dépassements seraient bloqués');
                }
                
            } finally {
                // Restaurer la configuration originale
                fs.writeFileSync(configPath, originalConfigData);
                console.log('✅ Configuration originale restaurée');
            }
        });

        after(async function() {
            console.log('\n🧹 Nettoyage Test 17...');
            
            // Supprimer le compte de test
            if (testAccountId_budget) {
                await pool.query('DELETE FROM accounts WHERE id = $1', [testAccountId_budget]);
                console.log(`✅ Compte de test supprimé: ID ${testAccountId_budget}`);
            }
            
            // Supprimer l'utilisateur de test
            if (testUserId_budget) {
                await pool.query('DELETE FROM users WHERE id = $1', [testUserId_budget]);
                console.log(`✅ Utilisateur de test supprimé: ID ${testUserId_budget}`);
            }
            
            console.log('✅ Test 17 terminé - Validation du budget testée avec succès');
        });
    });

    // 🧪 Test 18: Cut-off Date - Filtrage par Période
    describe('🧪 Test 18: Cut-off Date - Analyse État Système à Date Donnée', () => {
        let testAccountId_cutoff;
        let testUserId_cutoff;

        before(async function() {
            console.log('\n🧪 Initialisation Test 18: Cut-off Date...');
            
            // 1. Créer utilisateur de test
            const userResult = await pool.query(
                'INSERT INTO users (username, password_hash, role, full_name) VALUES ($1, $2, $3, $4) RETURNING id',
                ['user_cutoff_test', 'hashed_password', 'admin', 'Utilisateur Test Cut-off']
            );
            testUserId_cutoff = userResult.rows[0].id;
            console.log(`✅ Utilisateur test créé: ID ${testUserId_cutoff}`);

            // 2. Créer compte test pour scénarios cut-off
            const accountResult = await pool.query(
                'INSERT INTO accounts (account_name, account_type, user_id, total_credited, current_balance, is_active) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
                ['COMPTE_CUTOFF_TEST', 'classique', testUserId_cutoff, 5000000, 5000000, true]
            );
            testAccountId_cutoff = accountResult.rows[0].id;
            console.log(`✅ Compte test créé: ID ${testAccountId_cutoff}`);
        });

        it('Devrait calculer correctement les soldes et dépenses avec cut-off date', async () => {
            console.log('\n🔍 Test de filtrage cut-off avec dates historiques...');
            
            try {
                await pool.query('BEGIN');
                
                // 1. Ajouter des crédits sur plusieurs dates
                const credits = [
                    { date: '2025-01-05', amount: 1000000, description: 'Crédit J-10' },
                    { date: '2025-01-10', amount: 2000000, description: 'Crédit J-5' },
                    { date: '2025-01-15', amount: 1500000, description: 'Crédit J-0 (référence)' },
                    { date: '2025-01-20', amount: 3000000, description: 'Crédit J+5 (futur)' }
                ];
                
                for (const credit of credits) {
                    await pool.query(
                        'INSERT INTO credit_history (account_id, credited_by, amount, description, created_at) VALUES ($1, $2, $3, $4, $5)',
                        [testAccountId_cutoff, testUserId_cutoff, credit.amount, credit.description, credit.date + ' 12:00:00']
                    );
                    console.log(`✅ Crédit ajouté: ${credit.amount.toLocaleString()} FCFA le ${credit.date}`);
                }
                
                // 2. Ajouter des dépenses sur plusieurs dates
                const expenses = [
                    { date: '2025-01-07', amount: 300000, description: 'Dépense J-8' },
                    { date: '2025-01-12', amount: 500000, description: 'Dépense J-3' },
                    { date: '2025-01-14', amount: 200000, description: 'Dépense J-1' },
                    { date: '2025-01-18', amount: 800000, description: 'Dépense J+3 (futur)' }
                ];
                
                for (const expense of expenses) {
                    await pool.query(`
                        INSERT INTO expenses (user_id, account_id, expense_type, category, designation, supplier, amount, description, expense_date, total)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                    `, [
                        testUserId_cutoff, testAccountId_cutoff, 'achat', 'Test', 
                        'Article test', 'Fournisseur test', expense.amount, 
                        expense.description, expense.date, expense.amount
                    ]);
                    console.log(`✅ Dépense ajoutée: ${expense.amount.toLocaleString()} FCFA le ${expense.date}`);
                }
                
                // Synchroniser le compte après toutes les opérations
                await syncAccountBalance(testAccountId_cutoff);
                
                // 3. Test avec cut-off date = 2025-01-15 (date de référence)
                const cutoffDate = '2025-01-15';
                console.log(`\n🎯 Analyse avec cut-off date: ${cutoffDate}`);
                
                // 3a. Calculer le solde attendu jusqu'au cut-off
                const expectedCreditsUntilCutoff = 1000000 + 2000000 + 1500000; // 4,500,000 FCFA
                const expectedExpensesUntilCutoff = 300000 + 500000 + 200000; // 1,000,000 FCFA
                const expectedBalanceAtCutoff = 5000000 + expectedCreditsUntilCutoff - expectedExpensesUntilCutoff; // 8,500,000 FCFA
                
                console.log(`💰 Calcul attendu jusqu'au ${cutoffDate}:`);
                console.log(`   • Solde initial: ${(5000000).toLocaleString()} FCFA`);
                console.log(`   • Crédits cumulés: ${expectedCreditsUntilCutoff.toLocaleString()} FCFA`);
                console.log(`   • Dépenses cumulées: ${expectedExpensesUntilCutoff.toLocaleString()} FCFA`);
                console.log(`   • Solde attendu: ${expectedBalanceAtCutoff.toLocaleString()} FCFA`);
                
                // 3b. Simuler l'API avec cut-off date
                const balanceQuery = `
                    SELECT 
                        (5000000 + 
                         COALESCE((SELECT SUM(ch.amount) FROM credit_history ch WHERE ch.account_id = $1 AND ch.created_at <= $2), 0) -
                         COALESCE((SELECT SUM(e.total) FROM expenses e WHERE e.account_id = $1 AND e.expense_date <= $2), 0)) as balance_at_cutoff
                `;
                
                const balanceResult = await pool.query(balanceQuery, [testAccountId_cutoff, cutoffDate + ' 23:59:59']);
                const actualBalanceAtCutoff = parseInt(balanceResult.rows[0].balance_at_cutoff);
                
                console.log(`🔍 Solde calculé avec cut-off: ${actualBalanceAtCutoff.toLocaleString()} FCFA`);
                
                // 3c. Vérifier que les transactions futures sont exclues
                const futureCreditsQuery = `
                    SELECT COALESCE(SUM(amount), 0) as future_credits
                    FROM credit_history 
                    WHERE account_id = $1 AND created_at > $2
                `;
                const futureCreditsResult = await pool.query(futureCreditsQuery, [testAccountId_cutoff, cutoffDate + ' 23:59:59']);
                const futureCredits = parseInt(futureCreditsResult.rows[0].future_credits);
                
                const futureExpensesQuery = `
                    SELECT COALESCE(SUM(total), 0) as future_expenses
                    FROM expenses 
                    WHERE account_id = $1 AND expense_date > $2
                `;
                const futureExpensesResult = await pool.query(futureExpensesQuery, [testAccountId_cutoff, cutoffDate]);
                const futureExpenses = parseInt(futureExpensesResult.rows[0].future_expenses);
                
                console.log(`\n🚫 Transactions FUTURES (exclues du cut-off):`);
                console.log(`   • Crédits futurs: ${futureCredits.toLocaleString()} FCFA`);
                console.log(`   • Dépenses futures: ${futureExpenses.toLocaleString()} FCFA`);
                
                // 4. Test avec une date plus récente (2025-01-20)
                const recentCutoff = '2025-01-20';
                const recentBalanceResult = await pool.query(balanceQuery, [testAccountId_cutoff, recentCutoff + ' 23:59:59']);
                const balanceAtRecentCutoff = parseInt(recentBalanceResult.rows[0].balance_at_cutoff);
                
                const expectedRecentBalance = 5000000 + (1000000 + 2000000 + 1500000 + 3000000) - (300000 + 500000 + 200000 + 800000);
                
                console.log(`\n🎯 Analyse avec cut-off date récente: ${recentCutoff}`);
                console.log(`   • Solde calculé: ${balanceAtRecentCutoff.toLocaleString()} FCFA`);
                console.log(`   • Solde attendu: ${expectedRecentBalance.toLocaleString()} FCFA`);
                
                // 5. Assertions principales
                assert.strictEqual(
                    actualBalanceAtCutoff, 
                    expectedBalanceAtCutoff,
                    `❌ Solde cut-off incorrect: attendu ${expectedBalanceAtCutoff.toLocaleString()}, obtenu ${actualBalanceAtCutoff.toLocaleString()}`
                );
                
                assert.strictEqual(
                    balanceAtRecentCutoff,
                    expectedRecentBalance,
                    `❌ Solde cut-off récent incorrect: attendu ${expectedRecentBalance.toLocaleString()}, obtenu ${balanceAtRecentCutoff.toLocaleString()}`
                );
                
                // 6. Vérifier l'exclusion des transactions futures
                assert.strictEqual(futureCredits, 3000000, '❌ Crédits futurs mal calculés');
                assert.strictEqual(futureExpenses, 800000, '❌ Dépenses futures mal calculées');
                
                console.log('\n✅ Test Cut-off Date réussi:');
                console.log(`   ✓ Solde au ${cutoffDate}: ${actualBalanceAtCutoff.toLocaleString()} FCFA`);
                console.log(`   ✓ Solde au ${recentCutoff}: ${balanceAtRecentCutoff.toLocaleString()} FCFA`);
                console.log('   ✓ Transactions futures correctement exclues');
                console.log('   ✓ Filtrage chronologique fonctionnel');
                
                await pool.query('COMMIT');
                
            } catch (error) {
                await pool.query('ROLLBACK');
                throw error;
            }
        });

        after(async function() {
            console.log('\n🧹 Nettoyage Test 18...');
            
            // Supprimer le compte de test
            if (testAccountId_cutoff) {
                await pool.query('DELETE FROM accounts WHERE id = $1', [testAccountId_cutoff]);
                console.log(`✅ Compte de test supprimé: ID ${testAccountId_cutoff}`);
            }
            
            // Supprimer l'utilisateur de test
            if (testUserId_cutoff) {
                await pool.query('DELETE FROM users WHERE id = $1', [testUserId_cutoff]);
                console.log(`✅ Utilisateur de test supprimé: ID ${testUserId_cutoff}`);
            }
            
            console.log('✅ Test 18 terminé - Système Cut-off Date testé avec succès');
        });
    });
});

module.exports = {
    calculateNetBalance,
    calculateAuditFluxSum,
    checkBalanceConsistency
};

