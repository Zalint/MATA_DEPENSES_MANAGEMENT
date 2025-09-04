const { Pool } = require('pg');

// Configuration de la base de données
const pool = new Pool({
    user: 'zalint',
    host: 'localhost',
    database: 'depenses_management',
    password: 'bonea2024',
    port: 5432
});

async function checkUsersTable() {
    try {
        console.log('🔍 Vérification de la structure de la table users...');
        
        // Vérifier la structure de la table users
        const structureResult = await pool.query(`
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns 
            WHERE table_name = 'users' 
            ORDER BY ordinal_position
        `);
        
        console.log('\n📋 Structure de la table users:');
        structureResult.rows.forEach(col => {
            console.log(`   ${col.column_name} (${col.data_type}) - Nullable: ${col.is_nullable}`);
        });
        
        // Vérifier les données existantes
        const dataResult = await pool.query(`
            SELECT username, full_name, role, is_active
            FROM users 
            WHERE username = 'Babacar'
        `);
        
        console.log('\n👤 Données de Babacar:');
        if (dataResult.rows.length > 0) {
            const user = dataResult.rows[0];
            console.log(`   Username: ${user.username}`);
            console.log(`   Nom complet: ${user.full_name}`);
            console.log(`   Rôle: ${user.role}`);
            console.log(`   Actif: ${user.is_active}`);
        } else {
            console.log('   Babacar non trouvé dans la table users');
        }
        
        // Lister tous les utilisateurs
        const allUsersResult = await pool.query(`
            SELECT username, full_name, role, is_active 
            FROM users 
            ORDER BY role, username
        `);
        
        console.log('\n👥 Tous les utilisateurs:');
        allUsersResult.rows.forEach(user => {
            console.log(`   ${user.username} (${user.role}) - ${user.full_name}`);
        });
        
    } catch (error) {
        console.error('❌ Erreur:', error);
    } finally {
        await pool.end();
    }
}

checkUsersTable(); 