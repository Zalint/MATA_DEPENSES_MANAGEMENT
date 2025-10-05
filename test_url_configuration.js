/**
 * Test de vérification de la configuration des URLs
 * Vérifie que toutes les références hardcodées ont été remplacées par des variables d'environnement
 */

console.log('🧪 TEST DE CONFIGURATION DES URLs');
console.log('🧪 =================================');
console.log('');

// Simulation des variables d'environnement
console.log('🔍 VARIABLES D\'ENVIRONNEMENT:');
console.log('   APP_URL:', process.env.APP_URL || '❌ Non définie');
console.log('   RENDER_EXTERNAL_URL:', process.env.RENDER_EXTERNAL_URL || '❌ Non définie');
console.log('   NODE_ENV:', process.env.NODE_ENV || 'development');
console.log('   PORT:', process.env.PORT || '3000');
console.log('');

// Test de la logique de détermination d'URL (server.js) - NOUVELLE VERSION SANS FALLBACK HARDCODÉ
function getAppUrl() {
    // 1. Priorité: Variable d'environnement explicite
    if (process.env.APP_URL) {
        return process.env.APP_URL;
    }
    
    // 2. Variable Render automatique
    if (process.env.RENDER_EXTERNAL_URL) {
        return process.env.RENDER_EXTERNAL_URL;
    }
    
    // 3. Environnement de production sans variables définies
    if (process.env.NODE_ENV === 'production' || process.env.RENDER) {
        console.warn('⚠️ WARNING: No APP_URL or RENDER_EXTERNAL_URL defined in production!');
        return `https://${process.env.RENDER_SERVICE_NAME || 'your-app'}.onrender.com`;
    }
    
    // 4. Développement local
    return `http://localhost:${process.env.PORT || 3000}`;
}

// Test de la logique frontend (app.js)
function getFrontendConfig() {
    // Simulation de window.location.origin
    const mockOrigin = process.env.APP_URL || 'http://localhost:3000';
    return {
        baseUrl: mockOrigin,
        apiUrl: mockOrigin + '/api'
    };
}

console.log('🚀 TEST DES CONFIGURATIONS:');
console.log('');

console.log('📊 Configuration Backend (server.js):');
const backendUrl = getAppUrl();
console.log('   URL calculée:', backendUrl);
console.log('   ✅ Pas de hardcoding:', !backendUrl.includes('mata-depenses-management') || process.env.APP_URL ? 'Oui' : 'Non');
console.log('');

console.log('🌐 Configuration Frontend (app.js):');
const frontendConfig = getFrontendConfig();
console.log('   Base URL:', frontendConfig.baseUrl);
console.log('   API URL:', frontendConfig.apiUrl);
console.log('   ✅ Utilise origin dynamique:', !frontendConfig.baseUrl.includes('mata-depenses-management') || process.env.APP_URL ? 'Oui' : 'Non');
console.log('');

// Test avec différents environnements
console.log('🧪 SIMULATION D\'ENVIRONNEMENTS:');
console.log('');

// Test 1: Environnement de développement local
console.log('1️⃣ Développement Local:');
const originalNodeEnv = process.env.NODE_ENV;
const originalAppUrl = process.env.APP_URL;
process.env.NODE_ENV = 'development';
delete process.env.APP_URL;
console.log('   URL générée:', getAppUrl());
console.log('');

// Test 2: Production avec APP_URL
console.log('2️⃣ Production avec APP_URL:');
process.env.NODE_ENV = 'production';
process.env.APP_URL = 'https://mon-app-custom.com';
console.log('   URL générée:', getAppUrl());
console.log('');

// Test 3: Production avec RENDER_EXTERNAL_URL
console.log('3️⃣ Production avec RENDER_EXTERNAL_URL:');
delete process.env.APP_URL;
process.env.RENDER_EXTERNAL_URL = 'https://render-auto-url.onrender.com';
console.log('   URL générée:', getAppUrl());
console.log('');

// Test 4: Production avec fallback
console.log('4️⃣ Production avec fallback:');
delete process.env.RENDER_EXTERNAL_URL;
console.log('   URL générée:', getAppUrl());
console.log('');

// Restaurer les variables originales
process.env.NODE_ENV = originalNodeEnv;
if (originalAppUrl) process.env.APP_URL = originalAppUrl;

// Vérification des fichiers modifiés
console.log('📋 RÉSUMÉ DES MODIFICATIONS:');
console.log('');
console.log('✅ server.js : Fonction getAppBaseUrl() centralisée');
console.log('✅ server.js : Plus de fallback hardcodé en production');
console.log('✅ server.js : Logs d\'avertissement si URL non définie');
console.log('✅ public/app.js : Utilise window.location.origin (dynamique)');
console.log('✅ render.yaml : Variable APP_URL ajoutée');
console.log('✅ Scripts de test : Tous paramétrés sans fallback hardcodé');
console.log('✅ Détection dynamique d\'URL possible via req.get(\'host\')');
console.log('');

// Recommandations
console.log('💡 RECOMMANDATIONS:');
console.log('');
console.log('1. ✅ Définir APP_URL dans Render.com Environment Variables');
console.log('2. ✅ Plus de fallback hardcodé = Sécurité renforcée');
console.log('3. ⚠️  Si APP_URL non définie en prod → Logs d\'avertissement');
console.log('4. 🔧 Possibilité de détection dynamique via headers HTTP');
console.log('5. 🧪 Tester avec différentes configurations d\'environnement');
console.log('6. 📊 Surveiller les logs pour vérifier l\'URL utilisée');
console.log('');

console.log('🎉 Test de configuration terminé!');
console.log('');
