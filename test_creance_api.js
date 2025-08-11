// Test script pour l'API Créance
// Usage: node test_creance_api.js

const axios = require('axios');

// Configuration
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const API_KEY = process.env.API_KEY || '4f8d9a2b6c7e8f1a3b5c9d0e2f4g6h7i';

async function testCreanceAPI() {
    console.log('🧪 Test de l\'API Créance');
    console.log('==========================\n');

    try {
        // Test 1: Sans date (utilise aujourd'hui)
        console.log('📅 Test 1: API sans date (aujourd\'hui par défaut)');
        const response1 = await axios.get(`${API_BASE_URL}/external/api/creance`, {
            headers: {
                'X-API-Key': API_KEY
            }
        });

        console.log('✅ Statut:', response1.status);
        console.log('📊 Summary:', {
            date_selected: response1.data.summary.date_selected,
            date_previous: response1.data.summary.date_previous,
            portfolios_count: response1.data.summary.portfolios_count,
            total_difference: response1.data.summary.totals?.total_difference || 0
        });
        console.log('🤖 AI Insights:', response1.data.ai_insights?.analysis ? 'Disponible' : 'Indisponible');
        console.log('📈 Métadonnées:', {
            total_clients: response1.data.metadata.total_clients,
            total_operations: response1.data.metadata.total_operations,
            openai_status: response1.data.metadata.openai_integration
        });
        console.log('\n');

        // Test 2: Avec date spécifique
        const testDate = '2024-01-20';
        console.log(`📅 Test 2: API avec date spécifique (${testDate})`);
        const response2 = await axios.get(`${API_BASE_URL}/external/api/creance?date=${testDate}`, {
            headers: {
                'X-API-Key': API_KEY
            }
        });

        console.log('✅ Statut:', response2.status);
        console.log('📊 Summary:', {
            date_selected: response2.data.summary.date_selected,
            date_previous: response2.data.summary.date_previous,
            portfolios_count: response2.data.summary.portfolios_count
        });
        console.log('\n');

        // Test 3: Test avec Authorization Bearer
        console.log('🔑 Test 3: Authentification Bearer');
        const response3 = await axios.get(`${API_BASE_URL}/external/api/creance`, {
            headers: {
                'Authorization': `Bearer ${API_KEY}`
            }
        });

        console.log('✅ Statut:', response3.status);
        console.log('🔐 Auth Bearer: Succès');
        console.log('\n');

        // Afficher un exemple de portfolio détaillé
        if (response1.data.details && response1.data.details.length > 0) {
            const firstPortfolio = response1.data.details[0];
            console.log('📋 Exemple de Portfolio Détaillé:');
            console.log('================================');
            console.log(`Nom: ${firstPortfolio.portfolio_name}`);
            console.log(`Directeur: ${firstPortfolio.assigned_director}`);
            console.log(`Clients: ${firstPortfolio.status.length}`);
            console.log(`Opérations: ${firstPortfolio.operations.length}`);
            
            if (firstPortfolio.status.length > 0) {
                console.log('\n👤 Premier Client:');
                const client = firstPortfolio.status[0];
                console.log(`  - Nom: ${client.client_name}`);
                console.log(`  - Crédit Initial: ${client.credit_initial.toLocaleString()} FCFA`);
                console.log(`  - Total Avances: ${client.total_avances.toLocaleString()} FCFA`);
                console.log(`  - Total Remboursements: ${client.total_remboursements.toLocaleString()} FCFA`);
                console.log(`  - Solde Final: ${client.solde_final.toLocaleString()} FCFA`);
            }

            if (firstPortfolio.operations.length > 0) {
                console.log('\n📈 Dernière Opération:');
                const operation = firstPortfolio.operations[0];
                console.log(`  - Date: ${operation.date_operation}`);
                console.log(`  - Client: ${operation.client}`);
                console.log(`  - Type: ${operation.type}`);
                console.log(`  - Montant: ${operation.montant.toLocaleString()} FCFA`);
                console.log(`  - Créé par: ${operation.created_by}`);
            }
        }

        // Afficher l'analyse AI si disponible
        if (response1.data.ai_insights && response1.data.ai_insights.analysis) {
            console.log('\n🤖 Analyse OpenAI:');
            console.log('==================');
            console.log(response1.data.ai_insights.analysis);
            console.log(`\nModèle: ${response1.data.ai_insights.model_used}`);
            console.log(`Tokens utilisés: ${response1.data.ai_insights.tokens_used}`);
        }

    } catch (error) {
        console.error('❌ Erreur lors des tests:', error.response?.data || error.message);
        
        if (error.response?.status === 401) {
            console.error('🔑 Vérifiez votre clé API dans la variable d\'environnement API_KEY');
        }
        
        if (error.response?.data?.code === 'OPENAI_CONFIG_MISSING') {
            console.error('🤖 Vérifiez la variable d\'environnement OPENAI_API_KEY');
        }
    }
}

// Test des erreurs d'authentification
async function testAuthErrors() {
    console.log('\n🚫 Test des Erreurs d\'Authentification');
    console.log('======================================\n');

    try {
        // Test sans clé API
        console.log('🔑 Test sans clé API...');
        await axios.get(`${API_BASE_URL}/external/api/creance`);
    } catch (error) {
        console.log('✅ Erreur attendue:', error.response?.status, error.response?.data?.error);
    }

    try {
        // Test avec mauvaise clé API
        console.log('🔑 Test avec mauvaise clé API...');
        await axios.get(`${API_BASE_URL}/external/api/creance`, {
            headers: {
                'X-API-Key': 'bad-key-123'
            }
        });
    } catch (error) {
        console.log('✅ Erreur attendue:', error.response?.status, error.response?.data?.error);
    }
}

// Fonction principale
async function main() {
    console.log('🏦 Test API Créance - Mata Group');
    console.log('=================================\n');
    
    console.log('🔗 URL de base:', API_BASE_URL);
    console.log('🔑 Clé API:', API_KEY ? API_KEY.substring(0, 8) + '...' : 'NON DÉFINIE');
    console.log('\n');

    // Tests principaux
    await testCreanceAPI();
    
    // Tests d'erreurs
    await testAuthErrors();

    console.log('\n✅ Tests terminés !');
}

// Lancer les tests
if (require.main === module) {
    main().catch(console.error);
}

module.exports = { testCreanceAPI, testAuthErrors };
