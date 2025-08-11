// Test script pour l'API Créance en production
// Usage: node test_production_creance.js

const axios = require('axios');

// Configuration pour production
const PRODUCTION_URL = 'https://mata-depenses-management.onrender.com';
const API_KEY = process.env.API_KEY || '4f8d9a2b6c7e8f1a3b5c9d0e2f4g6h7i';

async function testProductionCreanceAPI() {
    console.log('🚀 Test API Créance - Production Render');
    console.log('=======================================\n');

    console.log('🔗 URL Production:', PRODUCTION_URL);
    console.log('🔑 Clé API:', API_KEY ? API_KEY.substring(0, 8) + '...' : 'NON DÉFINIE');
    console.log('\n');

    try {
        // Test 1: Vérifier que le serveur est accessible
        console.log('🏥 Test 1: Health Check du serveur...');
        const healthResponse = await axios.get(`${PRODUCTION_URL}/health`);
        console.log('✅ Statut serveur:', healthResponse.status, '- Serveur accessible');
        console.log('📊 Uptime:', JSON.parse(healthResponse.data).uptime || 'N/A', 'secondes');
        console.log('\n');

        // Test 2: API Créance sans date (aujourd'hui)
        console.log('📅 Test 2: API Créance sans date (aujourd\'hui par défaut)');
        const response1 = await axios.get(`${PRODUCTION_URL}/external/api/creance`, {
            headers: {
                'X-API-Key': API_KEY
            },
            timeout: 30000 // 30 secondes de timeout pour OpenAI
        });

        console.log('✅ Statut API:', response1.status);
        console.log('📊 Summary:', {
            date_selected: response1.data.summary.date_selected,
            date_previous: response1.data.summary.date_previous,
            portfolios_count: response1.data.summary.portfolios_count,
            total_difference: response1.data.summary.totals?.total_difference || 0
        });

        console.log('🤖 AI Insights:');
        if (response1.data.ai_insights && response1.data.ai_insights.analysis) {
            console.log('   Status: ✅ Disponible');
            console.log('   Modèle:', response1.data.ai_insights.model_used);
            console.log('   Tokens:', response1.data.ai_insights.tokens_used);
            console.log('   Analyse:', response1.data.ai_insights.analysis.substring(0, 200) + '...');
        } else if (response1.data.ai_insights && response1.data.ai_insights.error) {
            console.log('   Status: ❌ Erreur -', response1.data.ai_insights.error);
        } else {
            console.log('   Status: ⚠️ Données manquantes');
        }

        console.log('📈 Métadonnées:', {
            total_clients: response1.data.metadata.total_clients,
            total_operations: response1.data.metadata.total_operations,
            openai_status: response1.data.metadata.openai_integration
        });
        console.log('\n');

        // Test 3: API avec date spécifique
        const testDate = '2024-01-20';
        console.log(`📅 Test 3: API avec date spécifique (${testDate})`);
        const response2 = await axios.get(`${PRODUCTION_URL}/external/api/creance?date=${testDate}`, {
            headers: {
                'X-API-Key': API_KEY
            },
            timeout: 30000
        });

        console.log('✅ Statut:', response2.status);
        console.log('📊 Summary avec date:', {
            date_selected: response2.data.summary.date_selected,
            date_previous: response2.data.summary.date_previous,
            portfolios_count: response2.data.summary.portfolios_count
        });
        console.log('\n');

        // Test 4: Vérifier la structure des détails
        if (response1.data.details && response1.data.details.length > 0) {
            const firstPortfolio = response1.data.details[0];
            console.log('📋 Structure des Détails - Premier Portfolio:');
            console.log('============================================');
            console.log(`📁 Nom: ${firstPortfolio.portfolio_name}`);
            console.log(`👤 Directeur: ${firstPortfolio.assigned_director}`);
            console.log(`👥 Clients: ${firstPortfolio.status.length}`);
            console.log(`📈 Opérations: ${firstPortfolio.operations.length}`);
            
            if (firstPortfolio.status.length > 0) {
                console.log('\n👤 Premier Client:');
                const client = firstPortfolio.status[0];
                console.log(`   - Nom: ${client.client_name}`);
                console.log(`   - Crédit Initial: ${client.credit_initial.toLocaleString()} FCFA`);
                console.log(`   - Total Avances: ${client.total_avances.toLocaleString()} FCFA`);
                console.log(`   - Total Remboursements: ${client.total_remboursements.toLocaleString()} FCFA`);
                console.log(`   - Solde Final: ${client.solde_final.toLocaleString()} FCFA`);
                console.log(`   - Téléphone: ${client.telephone || 'Non renseigné'}`);
                console.log(`   - Adresse: ${client.adresse || 'Non renseignée'}`);
            }

            if (firstPortfolio.operations.length > 0) {
                console.log('\n📈 Dernière Opération:');
                const operation = firstPortfolio.operations[0];
                console.log(`   - Date: ${operation.date_operation}`);
                console.log(`   - Client: ${operation.client}`);
                console.log(`   - Type: ${operation.type}`);
                console.log(`   - Montant: ${operation.montant.toLocaleString()} FCFA`);
                console.log(`   - Créé par: ${operation.created_by}`);
            }
        } else {
            console.log('📋 Aucun portfolio détaillé disponible');
        }

        // Afficher l'analyse complète OpenAI si disponible
        if (response1.data.ai_insights && response1.data.ai_insights.analysis) {
            console.log('\n🤖 Analyse Complète OpenAI:');
            console.log('============================');
            console.log(response1.data.ai_insights.analysis);
            console.log(`\n📊 Modèle: ${response1.data.ai_insights.model_used}`);
            console.log(`📊 Tokens utilisés: ${response1.data.ai_insights.tokens_used}`);
            console.log(`📊 Généré le: ${response1.data.ai_insights.generated_at}`);
        }

    } catch (error) {
        console.error('❌ Erreur lors des tests:', error.response?.data || error.message);
        
        if (error.response?.status === 401) {
            console.error('🔑 Vérifiez votre clé API');
        }
        
        if (error.response?.data?.code === 'OPENAI_CONFIG_MISSING') {
            console.error('🤖 La variable OPENAI_API_KEY n\'est pas configurée sur Render');
        }

        if (error.code === 'ECONNREFUSED') {
            console.error('🌐 Impossible de se connecter au serveur Render');
        }

        if (error.code === 'ETIMEDOUT') {
            console.error('⏰ Timeout - Le serveur Render met trop de temps à répondre');
        }
    }
}

// Test d'authentification
async function testProductionAuth() {
    console.log('\n🔐 Test Authentification Production');
    console.log('===================================\n');

    try {
        // Test sans clé API
        console.log('🔑 Test sans clé API...');
        await axios.get(`${PRODUCTION_URL}/external/api/creance`);
    } catch (error) {
        console.log('✅ Erreur attendue:', error.response?.status, error.response?.data?.error);
    }

    try {
        // Test avec mauvaise clé API
        console.log('🔑 Test avec mauvaise clé API...');
        await axios.get(`${PRODUCTION_URL}/external/api/creance`, {
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
    console.log('🏦 Test API Créance - Production Mata Group');
    console.log('==========================================\n');
    
    // Tests principaux
    await testProductionCreanceAPI();
    
    // Tests d'authentification
    await testProductionAuth();

    console.log('\n✅ Tests de production terminés !');
    console.log('\n💡 Pour tester localement, utilisez: node test_creance_api.js');
}

// Lancer les tests
if (require.main === module) {
    main().catch(console.error);
}

module.exports = { testProductionCreanceAPI, testProductionAuth };
