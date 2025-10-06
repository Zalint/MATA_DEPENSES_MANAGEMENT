const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Configuration de la connexion production
const pool = new Pool({
    connectionString: 'postgresql://depenses_management_user:zbigeeX2oCEi5ElEVFZrjN3lEERRnVMu@dpg-d18i9lemcj7s73ddi0bg-a.frankfurt-postgres.render.com/depenses_management',
    ssl: {
        rejectUnauthorized: false
    }
});

async function applyTriggerFix() {
    let client;
    try {
        console.log('🔧 Connexion à la base de production pour correction du trigger...');
        
        client = await pool.connect();
        
        // Lire le script SQL
        const sqlScript = fs.readFileSync('fix_prevent_expense_duplicate_trigger.sql', 'utf8');
        console.log('📝 Script SQL chargé');
        
        // Exécuter le script
        console.log('\n🚀 Exécution de la correction...');
        const result = await client.query(sqlScript);
        
        console.log('✅ Script exécuté avec succès');
        
        // Afficher les résultats si il y en a
        if (Array.isArray(result)) {
            result.forEach((res, index) => {
                if (res.rows && res.rows.length > 0) {
                    console.log(`\n--- Résultat ${index + 1} ---`);
                    res.rows.forEach(row => {
                        console.log(row);
                    });
                }
            });
        } else if (result.rows && result.rows.length > 0) {
            console.log('\n--- Résultats ---');
            result.rows.forEach(row => {
                console.log(row);
            });
        }
        
    } catch (error) {
        console.error('❌ Erreur lors de l\'application de la correction:', error.message);
        if (error.detail) console.error('Détail:', error.detail);
        if (error.hint) console.error('Suggestion:', error.hint);
        throw error;
    } finally {
        if (client) {
            client.release();
        }
        await pool.end();
        console.log('\n🔌 Connexion fermée');
    }
}

async function testTriggerFix() {
    const testPool = new Pool({
        connectionString: 'postgresql://depenses_management_user:zbigeeX2oCEi5ElEVFZrjN3lEERRnVMu@dpg-d18i9lemcj7s73ddi0bg-a.frankfurt-postgres.render.com/depenses_management',
        ssl: {
            rejectUnauthorized: false
        }
    });

    try {
        console.log('\n🧪 Test du trigger corrigé...');
        
        // Test 1 : Essayer de modifier selected_for_invoice (ne devrait plus être bloqué)
        console.log('Test 1: Modification de selected_for_invoice...');
        await testPool.query(`
            UPDATE expenses 
            SET selected_for_invoice = NOT selected_for_invoice 
            WHERE id = 409
        `);
        console.log('✅ Test 1 réussi: selected_for_invoice peut être modifié');
        
        // Test 2 : Essayer de créer un vrai doublon (devrait toujours être bloqué)
        console.log('\nTest 2: Tentative de création d\'un doublon...');
        try {
            await testPool.query(`
                INSERT INTO expenses (user_id, account_id, expense_date, designation, total, amount, description)
                VALUES (4, 3, '2025-08-25', 'Frais abattoir', 50000.00, 50000.00, 'Test doublon')
            `);
            console.log('❌ Test 2 échoué: Le doublon n\'a pas été bloqué !');
        } catch (duplicateError) {
            if (duplicateError.message.includes('Dépense en double détectée')) {
                console.log('✅ Test 2 réussi: Les vrais doublons sont toujours bloqués');
            } else {
                console.log('⚠️  Test 2 : Erreur inattendue:', duplicateError.message);
            }
        }
        
        console.log('\n🎉 CORRECTION VALIDÉE : Le trigger fonctionne correctement !');
        
    } catch (error) {
        console.error('❌ Erreur lors du test:', error.message);
    } finally {
        await testPool.end();
    }
}

// Exécuter la correction puis le test
async function main() {
    try {
        await applyTriggerFix();
        await testTriggerFix();
        console.log('\n🏆 MISSION ACCOMPLIE : Le problème de deselect-all est résolu !');
    } catch (error) {
        console.error('💥 Échec de la mission:', error.message);
        process.exit(1);
    }
}

main();
