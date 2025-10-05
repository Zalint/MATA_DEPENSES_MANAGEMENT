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

async function createAdminUser() {
    const client = new Client(dbConfig);
    
    try {
        console.log('🔌 Connexion à la base de données...');
        await client.connect();
        console.log('✅ Connecté avec succès !');
        
        // Créer l'utilisateur admin
        const username = 'admin';
        const password = 'admin123';
        const hashedPassword = await bcrypt.hash(password, 10);
        
        console.log('\n👤 Création de l\'utilisateur admin...');
        
        const result = await client.query(`
            INSERT INTO users (username, password_hash, full_name, role, is_active) 
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (username) DO UPDATE SET
                password_hash = $2,
                full_name = $3,
                role = $4,
                is_active = $5
            RETURNING id, username, full_name, role
        `, [username, hashedPassword, 'Administrateur Système', 'admin', true]);
        
        console.log('✅ Utilisateur admin créé avec succès !');
        console.log('📋 Détails:');
        console.log(`   ID: ${result.rows[0].id}`);
        console.log(`   Username: ${result.rows[0].username}`);
        console.log(`   Nom: ${result.rows[0].full_name}`);
        console.log(`   Rôle: ${result.rows[0].role}`);
        
        // Ajouter quelques paramètres essentiels
        console.log('\n⚙️ Ajout des paramètres système...');
        
        await client.query(`
            INSERT INTO financial_settings (setting_key, setting_value) VALUES
            ('validate_expenses', 'true'),
            ('default_currency', 'FCFA'),
            ('max_expense_amount', '10000000'),
            ('system_initialized', 'true')
            ON CONFLICT (setting_key) DO NOTHING
        `);
        
        console.log('✅ Paramètres système configurés !');
        
        console.log('\n🎉 =====================================================');
        console.log('🎉 UTILISATEUR ADMIN CRÉÉ AVEC SUCCÈS !');
        console.log('🎉 =====================================================');
        console.log('🔐 INFORMATIONS DE CONNEXION:');
        console.log('   👤 Nom d\'utilisateur: admin');
        console.log('   🔑 Mot de passe: admin123');
        console.log('🎉 =====================================================');
        console.log('🚀 Vous pouvez maintenant vous connecter à votre application !');
        
    } catch (error) {
        console.error('❌ Erreur lors de la création de l\'utilisateur:', error.message);
        if (error.message.includes('users') && error.message.includes('does not exist')) {
            console.error('💡 La table users n\'existe pas. Assurez-vous d\'avoir exécuté le script de création de base de données.');
        }
        process.exit(1);
        
    } finally {
        try {
            await client.end();
            console.log('📪 Connexion fermée.');
        } catch (closeError) {
            console.error('⚠️ Erreur lors de la fermeture:', closeError.message);
        }
    }
}

// Vérifier si bcrypt est disponible
try {
    require('bcrypt');
} catch (error) {
    console.error('❌ Le module bcrypt n\'est pas trouvé !');
    console.error('💡 Installez-le avec: npm install bcrypt');
    process.exit(1);
}

console.log('👤 CRÉATEUR D\'UTILISATEUR ADMIN - MATA GROUP');
console.log('👤 =========================================');
console.log('');

createAdminUser()
    .then(() => {
        console.log('\n🎉 Création terminée avec succès !');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Échec de la création:', error.message);
        process.exit(1);
    });
