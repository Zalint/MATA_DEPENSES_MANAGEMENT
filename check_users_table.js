const { Pool } = require('pg');

const pool = new Pool({
    user: 'depenses_app',
    host: 'localhost',
    database: 'depenses_management',
    password: 'depenses123!',
    port: 5432
});

async function checkAndUpdateUsersTable() {
    try {
        console.log('=== VÉRIFICATION DE LA TABLE USERS ===\n');
        
        // 1. Vérifier la structure actuelle
        console.log('1. Structure actuelle de la table users:');
        const columnsResult = await pool.query(`
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns 
            WHERE table_name = 'users' 
            ORDER BY ordinal_position
        `);
        
        columnsResult.rows.forEach(row => {
            console.log(`   - ${row.column_name}: ${row.data_type} (nullable: ${row.is_nullable})`);
        });
        
        // 2. Vérifier si les colonnes email et full_name existent
        const existingColumns = columnsResult.rows.map(row => row.column_name);
        const needsEmail = !existingColumns.includes('email');
        const needsFullName = !existingColumns.includes('full_name');
        const needsIsActive = !existingColumns.includes('is_active');
        const needsUpdatedAt = !existingColumns.includes('updated_at');
        
        console.log('\n2. Colonnes manquantes:');
        if (needsEmail) console.log('   - email: MANQUANTE');
        if (needsFullName) console.log('   - full_name: MANQUANTE');
        if (needsIsActive) console.log('   - is_active: MANQUANTE');
        if (needsUpdatedAt) console.log('   - updated_at: MANQUANTE');
        
        if (!needsEmail && !needsFullName && !needsIsActive && !needsUpdatedAt) {
            console.log('   - Toutes les colonnes nécessaires sont présentes');
            return;
        }
        
        // 3. Ajouter les colonnes manquantes
        console.log('\n3. Ajout des colonnes manquantes...');
        
        if (needsEmail) {
            await pool.query('ALTER TABLE users ADD COLUMN email VARCHAR(255) UNIQUE');
            console.log('   ✓ Colonne email ajoutée');
        }
        
        if (needsFullName) {
            await pool.query('ALTER TABLE users ADD COLUMN full_name VARCHAR(255)');
            console.log('   ✓ Colonne full_name ajoutée');
        }
        
        if (needsIsActive) {
            await pool.query('ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT true');
            console.log('   ✓ Colonne is_active ajoutée');
        }
        
        if (needsUpdatedAt) {
            await pool.query('ALTER TABLE users ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP');
            console.log('   ✓ Colonne updated_at ajoutée');
        }
        
        // 4. Mettre à jour les utilisateurs existants
        console.log('\n4. Mise à jour des utilisateurs existants...');
        
        if (needsIsActive) {
            await pool.query('UPDATE users SET is_active = true WHERE is_active IS NULL');
            console.log('   ✓ Tous les utilisateurs activés par défaut');
        }
        
        if (needsUpdatedAt) {
            await pool.query('UPDATE users SET updated_at = created_at WHERE updated_at IS NULL');
            console.log('   ✓ Dates de mise à jour initialisées');
        }
        
        // 5. Vérifier la structure finale
        console.log('\n5. Structure finale de la table users:');
        const finalResult = await pool.query(`
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns 
            WHERE table_name = 'users' 
            ORDER BY ordinal_position
        `);
        
        finalResult.rows.forEach(row => {
            console.log(`   - ${row.column_name}: ${row.data_type} (nullable: ${row.is_nullable})`);
        });
        
        // 6. Afficher les utilisateurs existants
        console.log('\n6. Utilisateurs existants:');
        const usersResult = await pool.query('SELECT id, username, full_name, email, role, is_active FROM users ORDER BY id');
        
        if (usersResult.rows.length === 0) {
            console.log('   - Aucun utilisateur trouvé');
        } else {
            usersResult.rows.forEach(user => {
                console.log(`   - ID: ${user.id}, Username: ${user.username}, Role: ${user.role}, Actif: ${user.is_active}`);
                if (user.full_name) console.log(`     Nom complet: ${user.full_name}`);
                if (user.email) console.log(`     Email: ${user.email}`);
            });
        }
        
        console.log('\n✅ Mise à jour de la table users terminée avec succès !');
        
    } catch (error) {
        console.error('❌ Erreur lors de la mise à jour:', error);
    } finally {
        await pool.end();
    }
}

checkAndUpdateUsersTable(); 