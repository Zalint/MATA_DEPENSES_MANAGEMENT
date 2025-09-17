// Test du snapshot avec valeurs scrapées corrigées
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function testSnapshotFixedValues() {
    try {
        console.log('🧪 TEST: Snapshot avec valeurs HTML scrapées corrigées\n');
        
        const cutoffDate = '2025-09-17';
        
        // Étape 1: Créer un snapshot
        console.log('📸 Création du snapshot...');
        const createResponse = await fetch('http://localhost:3000/api/snapshots/create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cookie': 'session_admin=test'
            },
            body: JSON.stringify({
                cutoff_date: cutoffDate
            })
        });
        
        if (!createResponse.ok) {
            console.log(`❌ Erreur création: ${createResponse.status}`);
            const errorText = await createResponse.text();
            console.log('Détails:', errorText.substring(0, 200));
            return;
        }
        
        const createData = await createResponse.json();
        console.log('✅ Snapshot créé:', createData.snapshot_date);
        
        // Étape 2: Lire le snapshot
        console.log('\n📖 Lecture du snapshot...');
        const readResponse = await fetch(`http://localhost:3000/api/snapshots/${cutoffDate}`, {
            method: 'GET',
            headers: {
                'Cookie': 'session_admin=test'
            }
        });
        
        if (!readResponse.ok) {
            console.log(`❌ Erreur lecture: ${readResponse.status}`);
            return;
        }
        
        const snapshotData = await readResponse.json();
        
        // Étape 3: Analyser les valeurs
        console.log('\n🔍 === ANALYSE DES VALEURS ===');
        
        if (snapshotData.data.dashboard) {
            const dashboard = snapshotData.data.dashboard;
            
            console.log('📊 DASHBOARD STATS:');
            if (dashboard.stats_cards) {
                console.log(`  PL FINAL: ${Math.round(dashboard.stats_cards.plFinal || 0).toLocaleString()} FCFA`);
                console.log(`  Cash Bictorys: ${Math.round(dashboard.stats_cards.cashBictorys || 0).toLocaleString()} FCFA`);
                console.log(`  Total Dépensé: ${Math.round(dashboard.stats_cards.totalSpent || 0).toLocaleString()} FCFA`);
                console.log(`  Source: ${dashboard.stats_cards.source || 'NON SPÉCIFIÉ'}`);
            }
            
            console.log('\n📊 PL DETAILS:');
            if (dashboard.pl_details) {
                console.log(`  PL FINAL: ${Math.round(dashboard.pl_details.plFinal || 0).toLocaleString()} FCFA`);
                console.log(`  Cash Bictorys: ${Math.round(dashboard.pl_details.cashBictorys || 0).toLocaleString()} FCFA`);
                console.log(`  Source: ${dashboard.pl_details.source || 'NON SPÉCIFIÉ'}`);
            }
            
            // Comparaison
            console.log('\n🆚 === COMPARAISON ===');
            const statsCardsPL = dashboard.stats_cards?.plFinal || 0;
            const plDetailsPL = dashboard.pl_details?.plFinal || 0;
            
            console.log(`Dashboard Stats PL FINAL: ${Math.round(statsCardsPL).toLocaleString()} FCFA`);
            console.log(`PL Details PL FINAL: ${Math.round(plDetailsPL).toLocaleString()} FCFA`);
            console.log(`Attendu (HTML scraping): -6,936,350 FCFA`);
            
            const ecartStats = Math.abs(statsCardsPL + 6936350);
            const ecartDetails = Math.abs(plDetailsPL + 6936350);
            
            console.log(`\nÉcart Stats Cards: ${ecartStats.toLocaleString()} FCFA`);
            console.log(`Écart PL Details: ${ecartDetails.toLocaleString()} FCFA`);
            
            if (ecartStats < 100) {
                console.log('✅ SUCCESS: Dashboard Stats utilise les valeurs scrapées !');
            } else if (ecartDetails < 100) {
                console.log('⚠️ PARTIAL: PL Details correct, mais Stats Cards pas mis à jour');
            } else {
                console.log('❌ PROBLÈME: Aucune valeur ne correspond au scraping HTML');
            }
            
            // Vérifier la source
            const statsSource = dashboard.stats_cards?.source;
            const detailsSource = dashboard.pl_details?.source;
            
            console.log(`\n🔍 Sources:`);
            console.log(`  Stats Cards: ${statsSource || 'NON SPÉCIFIÉ'}`);
            console.log(`  PL Details: ${detailsSource || 'NON SPÉCIFIÉ'}`);
            
            if (statsSource === 'html_scraping' || detailsSource === 'html_scraping') {
                console.log('✅ HTML Scraping détecté !');
            } else {
                console.log('⚠️ Pas de source HTML scraping trouvée');
            }
            
        } else {
            console.log('❌ Pas de données dashboard trouvées');
        }
        
    } catch (error) {
        console.error('❌ Erreur test:', error.message);
    }
}

testSnapshotFixedValues();
