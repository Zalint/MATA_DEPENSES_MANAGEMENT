const { Pool } = require('pg');

// Configuration pour Render (remplacez par vos vraies informations Render)
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

async function fixRenderCreditSystem() {
    try {
        console.log('🔧 === CORRECTION SYSTÈME CRÉDIT RENDER ===');
        console.log('🌐 Connexion à la base Render...');
        
        // Supprimer la fonction problématique
        await pool.query('DROP FUNCTION IF EXISTS handle_special_credit(integer, integer, integer, text, date);');
        
        console.log('✅ Fonction handle_special_credit supprimée sur Render');
        console.log('🎯 Le système de crédit devrait maintenant fonctionner');
        console.log('🔄 Redéployez votre application sur Render si nécessaire');
        
    } catch (error) {
        console.error('❌ Erreur:', error.message);
        console.log('\n💡 Solutions:');
        console.log('   - Vérifiez la variable DATABASE_URL');
        console.log('   - Ou exécutez le script SQL fix_render_credit_system.sql directement');
    } finally {
        await pool.end();
    }
}

// Exécuter uniquement si DATABASE_URL est définie
if (process.env.DATABASE_URL) {
    fixRenderCreditSystem();
} else {
    console.log('❌ Variable DATABASE_URL non définie');
    console.log('💡 Utilisez plutôt le script SQL: fix_render_credit_system.sql');
} 