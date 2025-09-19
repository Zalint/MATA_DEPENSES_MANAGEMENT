const puppeteer = require('puppeteer');

async function testPLScraping() {
    try {
        console.log('🧪 TEST: PL Scraping avec credentials fournis');
        
        // Configuration
        const SNAPSHOT_USERNAME = 'Saliou';
        const SNAPSHOT_PASSWORD = 'Murex2015';
        const baseUrl = `http://localhost:${process.env.PORT || 3000}`;
        const dashboardUrl = `${baseUrl}?cutoff_date=2025-01-18`;
        
        console.log(`🔍 URL test: ${dashboardUrl}`);
        
        // Configuration Puppeteer
        const puppeteerConfig = {
            headless: true,
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox', 
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--no-first-run',
                '--no-zygote',
                '--single-process'
            ]
        };
        
        const browser = await puppeteer.launch(puppeteerConfig);
        const page = await browser.newPage();
        
        // Configuration pour éviter les problèmes de frame
        await page.setDefaultNavigationTimeout(60000);
        await page.setDefaultTimeout(30000);
        
        console.log('🚀 Lancement navigateur...');
        console.log('🔑 Authentification en cours...');
        
        // Étape 1: Aller sur la page principale
        try {
            await page.goto(baseUrl, { 
                waitUntil: 'domcontentloaded',
                timeout: 60000 
            });
            await page.waitForTimeout(2000);
        } catch (error) {
            console.log(`⚠️ Première navigation échouée: ${error.message}`);
            await page.goto(baseUrl, { 
                waitUntil: 'load',
                timeout: 60000 
            });
            await page.waitForTimeout(3000);
        }
        
        // Vérifier si on est sur la page de login
        await page.waitForSelector('#login-page', { timeout: 10000 });
        
        // Remplir le formulaire de connexion
        await page.waitForSelector('#username', { timeout: 10000 });
        await page.type('#username', SNAPSHOT_USERNAME);
        await page.type('#password', SNAPSHOT_PASSWORD);
        
        // Soumettre le formulaire
        await page.click('button[type="submit"]');
        
        // Attendre que l'application principale se charge
        await page.waitForSelector('#app', { timeout: 10000 });
        console.log('✅ Authentification réussie');
        
        // Naviguer vers le dashboard avec cutoff_date
        console.log('📄 Navigation vers dashboard...');
        try {
            await page.goto(dashboardUrl, { 
                waitUntil: 'domcontentloaded',
                timeout: 60000 
            });
            await page.waitForTimeout(3000);
        } catch (error) {
            console.log(`⚠️ Navigation dashboard échouée: ${error.message}`);
            await page.goto(dashboardUrl, { 
                waitUntil: 'load',
                timeout: 60000 
            });
            await page.waitForTimeout(5000);
        }
        
        // Attendre que les éléments importants soient chargés
        let elementFound = false;
        for (let i = 0; i < 3; i++) {
            try {
                await page.waitForSelector('#pl-estim-charges', { timeout: 15000 });
                elementFound = true;
                break;
            } catch (error) {
                console.log(`⚠️ Tentative ${i + 1}/3 pour trouver #pl-estim-charges: ${error.message}`);
                if (i < 2) {
                    await page.waitForTimeout(2000);
                }
            }
        }
        
        if (!elementFound) {
            throw new Error('Impossible de trouver l\'élément #pl-estim-charges après 3 tentatives');
        }
        
        console.log('🔍 Extraction des valeurs PL...');
        
        // Fonction pour parser les nombres formatés
        function parseFormattedNumber(text) {
            if (!text) return 0;
            const cleanText = text.toString()
                .replace(/[^\d,.-]/g, '') // Garder seulement chiffres, virgules, points, tirets
                .replace(/\s+/g, '')      // Supprimer espaces
                .replace(/,/g, '');       // Supprimer virgules de formatage
            
            const number = parseFloat(cleanText);
            return isNaN(number) ? 0 : number;
        }
        
        // Extraire toutes les valeurs PL disponibles
        const plValues = await page.evaluate(() => {
            const getValue = (selector) => {
                const element = document.querySelector(selector);
                return element ? element.textContent.trim() : '0';
            };
            
            return {
                // Valeurs PL actuelles (scraping incorrect)
                plEstimCharges: getValue('#pl-estim-charges'),
                plSansStockCharges: getValue('#pl-sans-stock-charges'),
                plBrut: getValue('#pl-brut'),
                
                // Valeurs composantes
                cashBictorys: getValue('#cash-bictorys-latest'),
                creancesMois: getValue('#creances-mois'),
                totalSpent: getValue('#total-spent-amount'),
                stockVivantVariation: getValue('#stock-vivant-variation'),
                stockTotal: getValue('#stock-total'),
                
                // Autres valeurs
                totalRemaining: getValue('#total-remaining-amount'),
                totalCredits: getValue('#total-credited-amount'),
                depotBalance: getValue('#total-depot-balance'),
                partnerBalance: getValue('#total-partner-balance')
            };
        });
        
        await browser.close();
        
        console.log('\n🎯 === VALEURS PL EXTRAITES ===');
        console.log(`📊 PL Estim Charges (actuel): ${parseFormattedNumber(plValues.plEstimCharges).toLocaleString()} FCFA (raw: "${plValues.plEstimCharges}")`);
        console.log(`📊 PL Sans Stock Charges: ${parseFormattedNumber(plValues.plSansStockCharges).toLocaleString()} FCFA (raw: "${plValues.plSansStockCharges}")`);
        console.log(`📊 PL Brut (REAL PL): ${parseFormattedNumber(plValues.plBrut).toLocaleString()} FCFA (raw: "${plValues.plBrut}")`);
        
        console.log('\n💰 === VALEURS COMPOSANTES ===');
        console.log(`💰 Cash Bictorys: ${parseFormattedNumber(plValues.cashBictorys).toLocaleString()} FCFA`);
        console.log(`💳 Créances Mois: ${parseFormattedNumber(plValues.creancesMois).toLocaleString()} FCFA`);
        console.log(`💸 Total Dépensé: ${parseFormattedNumber(plValues.totalSpent).toLocaleString()} FCFA`);
        console.log(`🌱 Stock Vivant Variation: ${parseFormattedNumber(plValues.stockVivantVariation).toLocaleString()} FCFA`);
        console.log(`📦 Stock Total: ${parseFormattedNumber(plValues.stockTotal).toLocaleString()} FCFA`);
        
        console.log('\n🎯 === RECOMMANDATION ===');
        const realPL = parseFormattedNumber(plValues.plBrut);
        const currentScraping = parseFormattedNumber(plValues.plEstimCharges);
        
        if (Math.abs(realPL - currentScraping) > 1000) {
            console.log(`❌ PROBLÈME: Écart de ${Math.abs(realPL - currentScraping).toLocaleString()} FCFA`);
            console.log(`✅ SOLUTION: Utiliser #pl-brut au lieu de #pl-estim-charges`);
            console.log(`🎯 VALEUR CORRECTE: ${realPL.toLocaleString()} FCFA`);
        } else {
            console.log(`✅ Valeurs cohérentes`);
        }
        
        console.log('\n✅ Test terminé avec succès !');
        
    } catch (error) {
        console.error('❌ Erreur lors du test:', error);
        throw error;
    }
}

// Exécuter le test
testPLScraping().catch(console.error);

