// Test de l'API externe des snapshots
const https = require('https');
const http = require('http');

// Configuration de test
const CONFIG = {
    // Pour test local
    local: {
        baseUrl: 'http://localhost:3000',
        apiKey: 'test_api_key_local' // Remplacez par votre clé API locale
    },
    // Pour test Render production
    production: {
        baseUrl: 'https://votre-app.onrender.com', // Remplacez par votre URL Render
        apiKey: 'your_production_api_key' // Remplacez par votre clé API production
    }
};

// Sélectionner l'environnement (local ou production)
const ENV = process.argv[2] || 'local';
const config = CONFIG[ENV];

if (!config) {
    console.error('❌ Environnement invalide. Utilisez: node test_external_snapshots_api.js [local|production]');
    process.exit(1);
}

console.log(`🧪 TEST: API Snapshots Externe (Environnement: ${ENV})`);
console.log(`🌐 URL: ${config.baseUrl}`);
console.log(`🔑 API Key: ${config.apiKey ? 'Configurée' : 'MANQUANTE'}\n`);

// Fonction utilitaire pour faire des requêtes HTTP/HTTPS
function makeRequest(options, postData = null) {
    const isHttps = options.hostname && options.hostname.includes('.onrender.com');
    const httpModule = isHttps ? https : http;
    
    return new Promise((resolve, reject) => {
        const req = httpModule.request(options, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                try {
                    const parsedData = JSON.parse(data);
                    resolve({
                        statusCode: res.statusCode,
                        headers: res.headers,
                        data: parsedData
                    });
                } catch (error) {
                    resolve({
                        statusCode: res.statusCode,
                        headers: res.headers,
                        data: data
                    });
                }
            });
        });
        
        req.on('error', (error) => {
            reject(error);
        });
        
        if (postData) {
            req.write(postData);
        }
        
        req.end();
    });
}

// Fonction pour parser l'URL
function parseUrl(urlString) {
    const url = new URL(urlString);
    return {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search
    };
}

// Test 1: Créer un snapshot avec clé API
async function testCreateSnapshot() {
    console.log('🔍 TEST 1: Création de snapshot avec API Key');
    
    try {
        const testDate = new Date().toISOString().split('T')[0];
        const urlParts = parseUrl(`${config.baseUrl}/external/api/snapshots/create`);
        
        const options = {
            hostname: urlParts.hostname,
            port: urlParts.port,
            path: urlParts.path,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': config.apiKey
            }
        };
        
        const postData = JSON.stringify({
            cutoff_date: testDate
        });
        
        console.log(`   📅 Date de test: ${testDate}`);
        console.log(`   📡 Envoi de la requête...`);
        
        const response = await makeRequest(options, postData);
        
        console.log(`   📊 Status: ${response.statusCode}`);
        
        if (response.statusCode === 200 && response.data.success) {
            console.log(`   ✅ Snapshot créé avec succès!`);
            console.log(`   📁 Fichier: ${response.data.data.file_path}`);
            console.log(`   📦 Taille: ${response.data.data.file_size_mb} MB`);
            console.log(`   📈 Résumé:`);
            console.log(`      - Comptes: ${response.data.data.summary.total_accounts}`);
            console.log(`      - Dépenses: ${response.data.data.summary.total_expenses}`);
            console.log(`      - Clients: ${response.data.data.summary.total_clients}`);
            console.log(`      - Stocks actifs: ${response.data.data.summary.stocks_actifs}`);
            return response.data.data.snapshot_date;
        } else {
            console.log(`   ❌ Erreur: ${JSON.stringify(response.data, null, 2)}`);
            return null;
        }
        
    } catch (error) {
        console.log(`   ❌ Erreur réseau: ${error.message}`);
        return null;
    }
}

// Test 2: Lister les snapshots
async function testListSnapshots() {
    console.log('\n🔍 TEST 2: Liste des snapshots');
    
    try {
        const urlParts = parseUrl(`${config.baseUrl}/external/api/snapshots`);
        
        const options = {
            hostname: urlParts.hostname,
            port: urlParts.port,
            path: urlParts.path,
            method: 'GET',
            headers: {
                'X-API-Key': config.apiKey
            }
        };
        
        console.log(`   📡 Récupération de la liste...`);
        
        const response = await makeRequest(options);
        
        console.log(`   📊 Status: ${response.statusCode}`);
        
        if (response.statusCode === 200 && response.data.success) {
            console.log(`   ✅ Liste récupérée avec succès!`);
            console.log(`   📋 Total snapshots: ${response.data.total_snapshots}`);
            
            if (response.data.snapshots.length > 0) {
                console.log(`   📅 Snapshots récents:`);
                response.data.snapshots.slice(0, 3).forEach((snapshot, index) => {
                    const apiFlag = snapshot.api_call ? '🤖' : '👤';
                    console.log(`      ${index + 1}. ${apiFlag} ${snapshot.snapshot_date_fr} (${snapshot.file_size_mb} MB) par ${snapshot.created_by_username}`);
                });
            }
            
            return response.data.snapshots;
        } else {
            console.log(`   ❌ Erreur: ${JSON.stringify(response.data, null, 2)}`);
            return [];
        }
        
    } catch (error) {
        console.log(`   ❌ Erreur réseau: ${error.message}`);
        return [];
    }
}

// Test 3: Récupérer un snapshot spécifique
async function testGetSnapshot(snapshotDate) {
    if (!snapshotDate) {
        console.log('\n⚠️ TEST 3: Aucune date de snapshot pour le test de récupération');
        return;
    }
    
    console.log(`\n🔍 TEST 3: Récupération du snapshot ${snapshotDate}`);
    
    try {
        const urlParts = parseUrl(`${config.baseUrl}/external/api/snapshots/${snapshotDate}`);
        
        const options = {
            hostname: urlParts.hostname,
            port: urlParts.port,
            path: urlParts.path,
            method: 'GET',
            headers: {
                'X-API-Key': config.apiKey
            }
        };
        
        console.log(`   📡 Récupération des données...`);
        
        const response = await makeRequest(options);
        
        console.log(`   📊 Status: ${response.statusCode}`);
        
        if (response.statusCode === 200 && response.data.success) {
            console.log(`   ✅ Snapshot récupéré avec succès!`);
            console.log(`   📅 Date: ${response.data.snapshot_date_fr}`);
            
            if (response.data.metadata) {
                console.log(`   📊 Métadonnées:`);
                console.log(`      - Version: ${response.data.metadata.version}`);
                console.log(`      - Créé par: ${response.data.metadata.created_by_username}`);
                console.log(`      - Appel API: ${response.data.metadata.api_call ? 'Oui' : 'Non'}`);
            }
            
            if (response.data.data) {
                console.log(`   📈 Données incluses:`);
                console.log(`      - Dashboard: ${response.data.data.dashboard ? 'Oui' : 'Non'}`);
                console.log(`      - Dépenses: ${response.data.data.depenses ? 'Oui' : 'Non'}`);
                console.log(`      - Créances: ${response.data.data.creances ? 'Oui' : 'Non'}`);
                console.log(`      - Stock: ${response.data.data.gestion_stock ? 'Oui' : 'Non'}`);
                console.log(`      - Partenaires: ${response.data.data.comptes_partenaires ? 'Oui' : 'Non'}`);
            }
            
        } else if (response.statusCode === 404) {
            console.log(`   ⚠️ Snapshot non trouvé`);
        } else {
            console.log(`   ❌ Erreur: ${JSON.stringify(response.data, null, 2)}`);
        }
        
    } catch (error) {
        console.log(`   ❌ Erreur réseau: ${error.message}`);
    }
}

// Test 4: Test avec clé API invalide
async function testInvalidApiKey() {
    console.log('\n🔍 TEST 4: Test avec clé API invalide');
    
    try {
        const urlParts = parseUrl(`${config.baseUrl}/external/api/snapshots`);
        
        const options = {
            hostname: urlParts.hostname,
            port: urlParts.port,
            path: urlParts.path,
            method: 'GET',
            headers: {
                'X-API-Key': 'invalid_key_12345'
            }
        };
        
        console.log(`   📡 Test avec clé invalide...`);
        
        const response = await makeRequest(options);
        
        console.log(`   📊 Status: ${response.statusCode}`);
        
        if (response.statusCode === 401) {
            console.log(`   ✅ Sécurité validée: accès refusé avec clé invalide`);
        } else {
            console.log(`   ⚠️ Réponse inattendue: ${JSON.stringify(response.data, null, 2)}`);
        }
        
    } catch (error) {
        console.log(`   ❌ Erreur réseau: ${error.message}`);
    }
}

// Fonction principale
async function runAllTests() {
    console.log(`${'='.repeat(60)}`);
    console.log(`🚀 DÉBUT DES TESTS API SNAPSHOTS EXTERNE`);
    console.log(`${'='.repeat(60)}`);
    
    // Test 1: Créer un snapshot
    const snapshotDate = await testCreateSnapshot();
    
    // Test 2: Lister les snapshots
    const snapshots = await testListSnapshots();
    
    // Test 3: Récupérer un snapshot spécifique
    const testDate = snapshotDate || (snapshots.length > 0 ? snapshots[0].snapshot_date : null);
    await testGetSnapshot(testDate);
    
    // Test 4: Test sécurité
    await testInvalidApiKey();
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🎉 TESTS TERMINÉS`);
    console.log(`${'='.repeat(60)}`);
    
    // Instructions finales
    console.log(`\n📋 Instructions pour utilisation:`);
    console.log(`\n1. Créer un snapshot:`);
    console.log(`   curl -X POST "${config.baseUrl}/external/api/snapshots/create" \\`);
    console.log(`     -H "X-API-Key: ${config.apiKey}" \\`);
    console.log(`     -H "Content-Type: application/json" \\`);
    console.log(`     -d '{"cutoff_date": "$(date +%Y-%m-%d)"}'`);
    
    console.log(`\n2. Lister les snapshots:`);
    console.log(`   curl -H "X-API-Key: ${config.apiKey}" \\`);
    console.log(`     "${config.baseUrl}/external/api/snapshots"`);
    
    console.log(`\n3. Récupérer un snapshot:`);
    console.log(`   curl -H "X-API-Key: ${config.apiKey}" \\`);
    console.log(`     "${config.baseUrl}/external/api/snapshots/2025-09-17"`);
}

// Exécuter les tests
if (require.main === module) {
    runAllTests()
        .then(() => process.exit(0))
        .catch(error => {
            console.error('💥 Erreur globale:', error);
            process.exit(1);
        });
}

module.exports = { testCreateSnapshot, testListSnapshots, testGetSnapshot };
