const { Client } = require('pg');
const bcrypt = require('bcrypt');

// Configuration de la base de données
const dbConfig = {
    host: 'localhost',
    port: 5432,
    database: 'matavolaille_db',
    user: 'zalint',
    password: 'bonea2024'
};

async function checkAdminUser() {
    const client = new Client(dbConfig);
    
    try {
        await client.connect();
        console.log('🔗 Connecté à la base de données');
        
        // Vérifier l'utilisateur admin
        const result = await client.query('SELECT id, username, password_hash, role, is_active FROM users WHERE username = $1', ['admin']);
        
        if (result.rows.length > 0) {
            const user = result.rows[0];
            console.log('✅ Utilisateur admin trouvé:');
            console.log(`   ID: ${user.id}`);
            console.log(`   Username: ${user.username}`);
            console.log(`   Role: ${user.role}`);
            console.log(`   Actif: ${user.is_active}`);
            console.log(`   Hash: ${user.password_hash.substring(0, 20)}...`);
            
            // Tester le mot de passe
            const passwordMatch = await bcrypt.compare('admin123', user.password_hash);
            console.log(`🔑 Test mot de passe 'admin123': ${passwordMatch ? '✅ CORRECT' : '❌ INCORRECT'}`);
            
            if (!passwordMatch) {
                console.log('\n⚠️  Le mot de passe ne correspond pas. Recréation...');
                
                // Recréer le hash correct
                const newHash = await bcrypt.hash('admin123', 10);
                await client.query('UPDATE users SET password_hash = $1 WHERE username = $2', [newHash, 'admin']);
                console.log('✅ Mot de passe admin mis à jour');
                
                // Vérifier à nouveau
                const retest = await bcrypt.compare('admin123', newHash);
                console.log(`🔑 Nouveau test: ${retest ? '✅ CORRECT' : '❌ STILL WRONG'}`);
            }
            
        } else {
            console.log('❌ Aucun utilisateur admin trouvé dans la base de données');
            console.log('🔧 Création de l\'utilisateur admin...');
            
            const hashedPassword = await bcrypt.hash('admin123', 10);
            await client.query(`
                INSERT INTO users (username, password_hash, full_name, role, is_active) 
                VALUES ($1, $2, $3, $4, $5)
            `, ['admin', hashedPassword, 'Administrateur Système', 'admin', true]);
            
            console.log('✅ Utilisateur admin créé avec succès');
        }
        
    } catch (error) {
        console.error('❌ Erreur:', error.message);
    } finally {
        await client.end();
    }
}

checkAdminUser();
