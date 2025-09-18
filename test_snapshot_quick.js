// Test rapide de l'authentification snapshot
const axios = require('axios');

async function testSnapshot() {
    console.log('🧪 Test snapshot avec variables d\'environnement...');
    
    try {
        const response = await axios.post(
            'https://mata-depenses-management.onrender.com/external/api/snapshots/create',
            { cutoff_date: '2025-09-17' },
            {
                headers: {
                    'X-API-Key': '4f8d9a2b6c7e8f1a3b5c9d0e2f4g6h7i',
                    'Content-Type': 'application/json'
                },
                timeout: 120000 // 2 minutes
            }
        );
        
        console.log('✅ Status:', response.status);
        
        if (response.data.success) {
            console.log('🎉 SNAPSHOT CRÉÉ AVEC SUCCÈS !');
            console.log('📊 Source:', response.data.data?.source || 'non spécifiée');
            console.log('📄 Fichier:', response.data.data?.filename || 'non spécifié');
        } else {
            console.log('❌ Échec:', response.data.error);
        }
        
    } catch (error) {
        console.log('❌ ERREUR:', error.message);
        
        if (error.response?.data) {
            console.log('📝 Détails:', error.response.data);
        }
        
        // Analyser les erreurs courantes
        if (error.message.includes('Could not find Chrome')) {
            console.log('🔧 DIAGNOSTIC: Chrome non installé');
            console.log('💡 SOLUTION: Redéployer le service');
        } else if (error.message.includes('Accès refusé') || error.message.includes('Privilèges')) {
            console.log('🔧 DIAGNOSTIC: Authentification échouée');
            console.log('💡 SOLUTION: Variables pas encore propagées, attendre redémarrage');
        } else if (error.message.includes('timeout')) {
            console.log('🔧 DIAGNOSTIC: Timeout - serveur occupé');
            console.log('💡 SOLUTION: Réessayer dans quelques minutes');
        }
    }
}

testSnapshot();
