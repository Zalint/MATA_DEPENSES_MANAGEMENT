const fs = require('fs');
const path = require('path');

/**
 * Script de personnalisation automatique pour create_complete_database_schema.sql
 * Permet de générer un script SQL personnalisé avec vos paramètres
 */

// ===== CONFIGURATION =====
// Modifiez ces valeurs selon vos besoins :
const CONFIG = {
    DATABASE_NAME: 'ma_compta_db',           // ← Votre nom de base de données
    DB_USER: 'compta_user',                  // ← Votre utilisateur de base de données  
    DB_PASSWORD: 'MonMotDePasse123',         // ← Votre mot de passe
    OUTPUT_FILE: 'schema_personnalise.sql'   // ← Nom du fichier de sortie
};

// ===== SCRIPT =====
function customizeSQL() {
    console.log('🔧 PERSONNALISATION DU SCRIPT SQL');
    console.log('🔧 ================================');
    console.log('');
    
    const sourceFile = 'create_complete_database_schema.sql';
    const outputFile = CONFIG.OUTPUT_FILE;
    
    // Vérifier que le fichier source existe
    if (!fs.existsSync(sourceFile)) {
        console.error('❌ Fichier source non trouvé :', sourceFile);
        console.error('💡 Assurez-vous que create_complete_database_schema.sql est dans le même répertoire.');
        process.exit(1);
    }
    
    console.log('📖 Lecture du fichier source :', sourceFile);
    let sqlContent = fs.readFileSync(sourceFile, 'utf8');
    
    console.log('🔄 Application des personnalisations...');
    
    // Remplacements des paramètres
    const replacements = [
        // Utilisateur de base de données
        {
            from: /zalint/g,
            to: CONFIG.DB_USER,
            description: `Utilisateur de base de données : zalint → ${CONFIG.DB_USER}`
        },
        // Mot de passe
        {
            from: /bonea2024/g,
            to: CONFIG.DB_PASSWORD,
            description: `Mot de passe : bonea2024 → ${CONFIG.DB_PASSWORD}`
        },
        // Nom de base dans les messages
        {
            from: /matavolaille_db/g,
            to: CONFIG.DATABASE_NAME,
            description: `Nom de base : matavolaille_db → ${CONFIG.DATABASE_NAME}`
        }
    ];
    
    // Appliquer les remplacements
    replacements.forEach((replacement, index) => {
        const matches = sqlContent.match(replacement.from);
        const count = matches ? matches.length : 0;
        
        sqlContent = sqlContent.replace(replacement.from, replacement.to);
        
        console.log(`   ${index + 1}. ${replacement.description} (${count} remplacements)`);
    });
    
    // Ajouter un en-tête personnalisé
    const header = `-- =====================================================
-- SCRIPT SQL PERSONNALISÉ - MATA DÉPENSES MANAGEMENT
-- =====================================================
-- Généré automatiquement le : ${new Date().toLocaleString('fr-FR')}
-- Configuration :
--   - Base de données : ${CONFIG.DATABASE_NAME}
--   - Utilisateur DB  : ${CONFIG.DB_USER}
--   - Mot de passe    : ${CONFIG.DB_PASSWORD}
-- 
-- IMPORTANT : Ce script créera automatiquement :
--   - L'utilisateur de base de données avec les permissions
--   - Toutes les tables (24 tables)
--   - L'utilisateur admin (login: admin/Mata@2024!)
--   - Les paramètres système
-- =====================================================

`;
    
    const finalContent = header + sqlContent;
    
    console.log('💾 Écriture du fichier personnalisé :', outputFile);
    fs.writeFileSync(outputFile, finalContent, 'utf8');
    
    console.log('');
    console.log('🎉 ====================================================');
    console.log('🎉 PERSONNALISATION TERMINÉE AVEC SUCCÈS !');
    console.log('🎉 ====================================================');
    console.log('📄 Fichier généré :', outputFile);
    console.log('📊 Taille du fichier :', Math.round(finalContent.length / 1024) + ' KB');
    console.log('');
    console.log('🚀 PROCHAINES ÉTAPES :');
    console.log('   1. Ouvrez votre interface PostgreSQL (pgAdmin, DBeaver, etc.)');
    console.log('   2. Créez une nouvelle base de données nommée :', CONFIG.DATABASE_NAME);
    console.log('   3. Ouvrez le Query Editor/SQL Editor');
    console.log('   4. Chargez et exécutez le fichier :', outputFile);
    console.log('   5. Connectez-vous avec : admin/admin123');
    console.log('');
    console.log('💡 Le script créera automatiquement l\\'utilisateur', CONFIG.DB_USER);
    console.log('   avec le mot de passe', CONFIG.DB_PASSWORD);
    console.log('');
}

// Exécution
customizeSQL();
