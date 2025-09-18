const { Pool } = require('pg');

async function checkProductionUser() {
    console.log('🔍 Vérification utilisateur Saliou en PRODUCTION...');
    
    const pool = new Pool({
        host: 'dpg-d18i9lemcj7s73ddi0bg-a.frankfurt-postgres.render.com',
        port: 5432,
        database: 'depenses_management',
        user: 'depenses_management_user',
        password: 'zbigeeX2oCEi5ElEVFZrjN3lEERRnVMu',
        ssl: true
    });

    try {
        // Vérifier l'utilisateur Saliou
        console.log('\n📋 Recherche utilisateur "Saliou"...');
        const userResult = await pool.query(
            'SELECT id, username, role, full_name, created_at FROM users WHERE username = $1',
            ['Saliou']
        );

        if (userResult.rows.length === 0) {
            console.log('❌ Utilisateur "Saliou" NON TROUVÉ en production !');
            
            // Lister tous les utilisateurs
            console.log('\n📋 Liste de TOUS les utilisateurs en production :');
            const allUsersResult = await pool.query(
                'SELECT id, username, role, full_name FROM users ORDER BY id'
            );
            
            allUsersResult.rows.forEach(user => {
                console.log(`  👤 ${user.username} (${user.role}) - ${user.full_name || 'Pas de nom'}`);
            });
            
        } else {
            const user = userResult.rows[0];
            console.log('✅ Utilisateur "Saliou" TROUVÉ :');
            console.log(`  👤 ID: ${user.id}`);
            console.log(`  🏷️  Username: ${user.username}`);
            console.log(`  🔑 Rôle: ${user.role}`);
            console.log(`  📝 Nom complet: ${user.full_name || 'Non défini'}`);
            console.log(`  📅 Créé le: ${user.created_at}`);
            
            // Vérifier si le rôle est autorisé pour les snapshots
            const allowedRoles = ['directeur_general', 'pca', 'admin'];
            if (allowedRoles.includes(user.role)) {
                console.log(`✅ Rôle "${user.role}" AUTORISÉ pour les snapshots`);
            } else {
                console.log(`❌ Rôle "${user.role}" NON AUTORISÉ pour les snapshots`);
                console.log(`   Rôles autorisés: ${allowedRoles.join(', ')}`);
            }
        }

        // Vérifier la structure de la table users
        console.log('\n📊 Structure table users :');
        const columnsResult = await pool.query(`
            SELECT column_name, data_type, is_nullable 
            FROM information_schema.columns 
            WHERE table_name = 'users' 
            ORDER BY ordinal_position
        `);
        
        columnsResult.rows.forEach(col => {
            console.log(`  📋 ${col.column_name}: ${col.data_type} (${col.is_nullable === 'YES' ? 'nullable' : 'not null'})`);
        });

    } catch (error) {
        console.error('❌ Erreur:', error.message);
    } finally {
        await pool.end();
    }
}

checkProductionUser();
