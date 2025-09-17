/**
 * Test de l'API externe Cash Bictorys
 * Endpoint: POST /api/external/cash-bictorys
 * Authentification: API Key
 */

const API_KEY = '4f8d9a2b6c7e8f1a3b5c9d0e2f4g6h7i';
const BASE_URL = process.env.API_URL || 'http://localhost:3000'; // localhost pour les tests locaux, remplacé par l'URL Render en prod

async function testExternalCashBictorysAPI() {
    console.log('🧪 =================================');
    console.log('🧪 TEST API EXTERNE CASH BICTORYS');
    console.log('🧪 =================================');
    console.log('🔑 Clé API:', API_KEY.substring(0, 8) + '...');
    console.log('🌐 URL:', BASE_URL);
    console.log('');

    // Test 1: Format YYYY-MM-DD
    console.log('📅 Test 1: Format YYYY-MM-DD');
    await testCashBictorysInsert([
        {
            "DATE": "2025-09-17",
            "VALEUR": 5000000,
            "BALANCE": 12000000
        },
        {
            "DATE": "2025-09-18",
            "VALEUR": 6500000,
            "BALANCE": 13500000
        }
    ]);

    // Test 2: Format DD-MM-YYYY
    console.log('📅 Test 2: Format DD-MM-YYYY');
    await testCashBictorysInsert([
        {
            "DATE": "19-09-2025",
            "VALEUR": 7200000,
            "BALANCE": 14200000
        }
    ]);

    // Test 3: Format DD/MM/YYYY
    console.log('📅 Test 3: Format DD/MM/YYYY');
    await testCashBictorysInsert([
        {
            "DATE": "20/09/2025",
            "VALEUR": 8000000,
            "BALANCE": 15000000
        }
    ]);

    // Test 4: Format DD/MM/YY
    console.log('📅 Test 4: Format DD/MM/YY');
    await testCashBictorysInsert([
        {
            "DATE": "21/09/25",
            "VALEUR": 8500000,
            "BALANCE": 15500000
        }
    ]);

    // Test 5: Sans BALANCE (optionnel)
    console.log('📅 Test 5: Sans champ BALANCE');
    await testCashBictorysInsert([
        {
            "DATE": "2025-09-22",
            "VALEUR": 9000000
        }
    ]);

    // Test 6: Données invalides
    console.log('❌ Test 6: Données invalides');
    await testCashBictorysInsert([
        {
            "DATE": "invalid-date",
            "VALEUR": 1000000
        }
    ]);

    // Test 7: API Key invalide
    console.log('🔑 Test 7: API Key invalide');
    await testCashBictorysInsert([
        {
            "DATE": "2025-09-23",
            "VALEUR": 1000000
        }
    ], 'invalid-api-key');

    console.log('🧪 ================================');
    console.log('🧪 TESTS TERMINÉS');
    console.log('🧪 ================================');
}

async function testCashBictorysInsert(data, customApiKey = null) {
    try {
        const response = await fetch(`${BASE_URL}/api/external/cash-bictorys`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': customApiKey || API_KEY
            },
            body: JSON.stringify(data)
        });

        const result = await response.json();
        
        console.log(`📡 Status: ${response.status}`);
        console.log('📦 Response:', JSON.stringify(result, null, 2));
        
        if (response.ok) {
            console.log('✅ Succès!');
        } else {
            console.log('❌ Erreur:', result.error);
        }
        
        console.log('');
        
    } catch (error) {
        console.error('🚨 Erreur réseau:', error.message);
        console.log('');
    }
}

// Exemples d'utilisation avec curl
function showCurlExamples() {
    console.log('🔧 ==============================');
    console.log('🔧 EXEMPLES CURL');
    console.log('🔧 ==============================');
    
    console.log('📄 1. Envoyer une seule entrée:');
    console.log(`curl -X POST "https://your-render-app.onrender.com/api/external/cash-bictorys" \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: ${API_KEY}" \\
  -d '[
    {
      "DATE": "2025-09-17",
      "VALEUR": 5000000,
      "BALANCE": 12000000
    }
  ]'`);
    
    console.log('');
    
    console.log('📄 2. Envoyer plusieurs entrées:');
    console.log(`curl -X POST "https://your-render-app.onrender.com/api/external/cash-bictorys" \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: ${API_KEY}" \\
  -d '[
    {
      "DATE": "17/09/2025",
      "VALEUR": 5000000,
      "BALANCE": 12000000
    },
    {
      "DATE": "18-09-2025",
      "VALEUR": 6500000,
      "BALANCE": 13500000
    },
    {
      "DATE": "2025-09-19",
      "VALEUR": 7200000
    }
  ]'`);
    
    console.log('');
    
    console.log('📄 3. Avec Authorization Bearer:');
    console.log(`curl -X POST "https://your-render-app.onrender.com/api/external/cash-bictorys" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${API_KEY}" \\
  -d '[{"DATE": "2025-09-20", "VALEUR": 8000000}]'`);
    
    console.log('');
    console.log('🔧 ==============================');
}

// Exemples de réponses
function showResponseExamples() {
    console.log('📝 ==============================');
    console.log('📝 EXEMPLES DE RÉPONSES');
    console.log('📝 ==============================');
    
    console.log('✅ Succès (200):');
    console.log(`{
  "success": true,
  "message": "Traitement terminé. 3 entrées traitées.",
  "imported_count": 3,
  "error_count": 0,
  "errors": [],
  "supported_date_formats": ["YYYY-MM-DD", "DD-MM-YYYY", "DD/MM/YYYY", "DD/MM/YY"]
}`);
    
    console.log('');
    
    console.log('❌ Erreur validation (400):');
    console.log(`{
  "error": "Format de date invalide dans l'objet 1: \\"invalid-date\\". Formats supportés: YYYY-MM-DD, DD-MM-YYYY, DD/MM/YYYY, DD/MM/YY"
}`);
    
    console.log('');
    
    console.log('🔑 Erreur authentification (401):');
    console.log(`{
  "error": "Clé API manquante ou invalide"
}`);
    
    console.log('');
    console.log('📝 ==============================');
}

// Exécution des tests si le script est lancé directement
if (require.main === module) {
    console.log('🚀 Démarrage des tests...');
    console.log('');
    
    // Afficher d'abord les exemples
    showCurlExamples();
    showResponseExamples();
    
    // Puis lancer les tests
    testExternalCashBictorysAPI().catch(error => {
        console.error('🚨 Erreur lors des tests:', error);
    });
}

module.exports = {
    testExternalCashBictorysAPI,
    testCashBictorysInsert,
    showCurlExamples,
    showResponseExamples
};
