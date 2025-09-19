const puppeteer = require('puppeteer');

async function quickPLTest() {
    try {
        console.log('🧪 TEST RAPIDE: Vérification PL scraping');
        
        const SNAPSHOT_USERNAME = 'Saliou';
        const SNAPSHOT_PASSWORD = 'Murex2015';
        const baseUrl = `http://localhost:${process.env.PORT || 3000}`;
        
        console.log(`🔍 URL: ${baseUrl}`);
        
        const browser = await puppeteer.launch({
            headless: false, // Mode visible pour debug
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        
        const page = await browser.newPage();
        await page.setDefaultNavigationTimeout(30000);
        
        console.log('🌐 Navigation vers login...');
        await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2000);
        
        console.log('🔑 Connexion...');
        await page.waitForSelector('#username');
        await page.type('#username', SNAPSHOT_USERNAME);
        await page.type('#password', SNAPSHOT_PASSWORD);
        await page.click('button[type="submit"]');
        
        await page.waitForSelector('#app');
        console.log('✅ Connecté');
        
        console.log('⏳ Attente chargement dashboard...');
        await page.waitForTimeout(5000);
        
        console.log('🔍 Recherche éléments PL...');
        const plValues = await page.evaluate(() => {
            const getValue = (selector) => {
                const element = document.querySelector(selector);
                return element ? element.textContent.trim() : 'ÉLÉMENT NON TROUVÉ';
            };
            
            return {
                plEstimCharges: getValue('#pl-estim-charges'),
                plBrut: getValue('#pl-brut'),
                plSansStock: getValue('#pl-sans-stock-charges')
            };
        });
        
        console.log('\n📊 === RÉSULTATS ===');
        console.log(`PL Estim Charges: "${plValues.plEstimCharges}"`);
        console.log(`PL Brut: "${plValues.plBrut}"`);
        console.log(`PL Sans Stock: "${plValues.plSansStock}"`);
        
        await browser.close();
        
        console.log('\n✅ Test terminé');
        
    } catch (error) {
        console.error('❌ Erreur:', error.message);
    }
}

quickPLTest();

