const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Configuration de la connexion
const pool = new Pool({
    user: process.env.DB_USER || 'zalint',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'depenses_management_preprod',
    password: process.env.DB_PASSWORD || 'bonea2024',
    port: process.env.DB_PORT || 5432
});

async function applyComptableRoleMigration() {
    const client = await pool.connect();
    
    try {
        console.log('🔄 Connexion à la base de données...');
        console.log(`📍 Base: ${process.env.DB_NAME || 'depenses_management_preprod'}`);
        
        await client.query('BEGIN');
        
        // Step 1: Drop existing constraint
        console.log('\n📝 Étape 1: Suppression de l\'ancienne contrainte de rôle...');
        await client.query('ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check');
        console.log('✅ Contrainte supprimée');
        
        // Step 2: Add new constraint with comptable role
        console.log('\n📝 Étape 2: Ajout de la nouvelle contrainte avec le rôle "comptable"...');
        await client.query(`
            ALTER TABLE users ADD CONSTRAINT users_role_check 
            CHECK (role IN ('directeur', 'directeur_general', 'pca', 'admin', 'comptable'))
        `);
        console.log('✅ Contrainte ajoutée');
        
        // Step 3: Create default comptable user
        console.log('\n📝 Étape 3: Création de l\'utilisateur comptable par défaut...');
        
        // Generate a bcrypt hash for 'comptable123'
        const bcrypt = require('bcrypt');
        const passwordHash = await bcrypt.hash('comptable123', 10);
        
        const insertResult = await client.query(`
            INSERT INTO users (username, password_hash, full_name, email, role, is_active)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (username) DO UPDATE
            SET 
                password_hash = EXCLUDED.password_hash,
                role = EXCLUDED.role,
                full_name = EXCLUDED.full_name,
                email = EXCLUDED.email,
                is_active = EXCLUDED.is_active
            RETURNING id, username, full_name, role
        `, ['comptable', passwordHash, 'Comptable', 'comptable@matagroup.com', 'comptable', true]);
        
        console.log('✅ Utilisateur comptable créé/mis à jour:');
        console.log(`   ID: ${insertResult.rows[0].id}`);
        console.log(`   Username: ${insertResult.rows[0].username}`);
        console.log(`   Nom: ${insertResult.rows[0].full_name}`);
        console.log(`   Rôle: ${insertResult.rows[0].role}`);
        
        // Step 4: Verify
        console.log('\n📝 Étape 4: Vérification...');
        const verifyResult = await client.query(`
            SELECT id, username, full_name, email, role, is_active, created_at
            FROM users
            WHERE role = 'comptable'
        `);
        
        console.log(`✅ ${verifyResult.rows.length} utilisateur(s) comptable trouvé(s):`);
        verifyResult.rows.forEach(user => {
            console.log(`   - ${user.username} (${user.full_name}) - Active: ${user.is_active}`);
        });
        
        await client.query('COMMIT');
        
        console.log('\n✅ Migration terminée avec succès!');
        console.log('\n📌 Identifiants par défaut:');
        console.log('   Username: comptable');
        console.log('   Password: comptable123');
        console.log('\n⚠️  Changez le mot de passe après la première connexion!');
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('\n❌ Erreur lors de la migration:', error);
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

// Exécuter la migration
applyComptableRoleMigration()
    .then(() => {
        console.log('\n✅ Script terminé');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Erreur fatale:', error);
        process.exit(1);
    });


