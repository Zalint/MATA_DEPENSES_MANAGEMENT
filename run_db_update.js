const { Pool } = require('pg');
const fs = require('fs');

// Utiliser les credentials de l'administrateur pour les modifications de structure
const adminPool = new Pool({
    user: 'postgres', // Utilisateur admin
    host: 'localhost',
    database: 'depenses_management',
    password: 'your_postgres_password', // À remplacer par le vrai mot de passe
    port: 5432
});

// Pool pour l'utilisateur de l'application
const appPool = new Pool({
    user: 'depenses_app',
    host: 'localhost',
    database: 'depenses_management',
    password: 'depenses123!',
    port: 5432
});

async function updateDatabase() {
    try {
        console.log('=== MISE À JOUR DE LA BASE DE DONNÉES ===\n');
        
        // Lire le script SQL
        const sqlScript = fs.readFileSync('update_users_table.sql', 'utf8');
        
        console.log('1. Exécution du script de mise à jour...');
        
        // Exécuter chaque commande séparément
        const commands = sqlScript.split(';').filter(cmd => cmd.trim() && !cmd.trim().startsWith('--'));
        
        for (const command of commands) {
            const trimmedCommand = command.trim();
            if (trimmedCommand) {
                try {
                    console.log(`   Exécution: ${trimmedCommand.substring(0, 50)}...`);
                    await adminPool.query(trimmedCommand);
                    console.log('   ✓ Succès');
                } catch (error) {
                    if (error.code === '42701') { // Column already exists
                        console.log('   ⚠ Colonne déjà existante, ignorée');
                    } else {
                        console.error(`   ❌ Erreur: ${error.message}`);
                    }
                }
            }
        }
        
        console.log('\n2. Vérification avec l\'utilisateur de l\'application...');
        
        // Tester avec l'utilisateur de l'application
        const testResult = await appPool.query(`
            SELECT id, username, full_name, email, role, is_active, created_at, updated_at
            FROM users 
            LIMIT 1
        `);
        
        console.log('   ✓ L\'utilisateur depenses_app peut accéder à la table users mise à jour');
        
        console.log('\n3. Structure finale de la table users:');
        const columnsResult = await appPool.query(`
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns 
            WHERE table_name = 'users' 
            ORDER BY ordinal_position
        `);
        
        columnsResult.rows.forEach(row => {
            console.log(`   - ${row.column_name}: ${row.data_type} (nullable: ${row.is_nullable})`);
        });
        
        console.log('\n✅ Mise à jour terminée avec succès !');
        
    } catch (error) {
        console.error('❌ Erreur lors de la mise à jour:', error.message);
        console.log('\n📝 Instructions manuelles:');
        console.log('1. Connectez-vous à PostgreSQL en tant qu\'administrateur');
        console.log('2. Exécutez le fichier update_users_table.sql');
        console.log('3. Redémarrez le serveur Node.js');
    } finally {
        await adminPool.end();
        await appPool.end();
    }
}

updateDatabase(); 