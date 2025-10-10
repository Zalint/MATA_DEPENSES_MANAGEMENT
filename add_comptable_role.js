const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'depenses_management_preprod',
    user: process.env.DB_USER || 'zalint',
    password: process.env.DB_PASSWORD || 'bonea2024'
});

async function addComptableRole() {
    try {
        console.log('📊 Connexion à la base de données...');
        console.log(`   Database: ${process.env.DB_NAME || 'depenses_management_preprod'}`);
        
        // Lire le script SQL
        const sql = fs.readFileSync('./add_comptable_role.sql', 'utf8');
        
        console.log('🔧 Ajout du rôle comptable...');
        const result = await pool.query(sql);
        
        console.log('✅ Rôle comptable ajouté avec succès!');
        console.log('');
        console.log('📝 Rôles disponibles:');
        console.log('   - directeur');
        console.log('   - directeur_general');
        console.log('   - pca');
        console.log('   - admin');
        console.log('   - comptable (nouveau) ← Accès en lecture seule');
        
    } catch (error) {
        console.error('❌ Erreur:', error.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

addComptableRole();

