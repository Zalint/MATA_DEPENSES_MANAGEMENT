const puppeteer = require('puppeteer');

// Fonction utilitaire pour déterminer l'URL de l'application (même logique que server.js)
function getAppBaseUrl() {
    if (process.env.APP_URL) return process.env.APP_URL;
    if (process.env.RENDER_EXTERNAL_URL) return process.env.RENDER_EXTERNAL_URL;
    
    const isProduction = process.env.NODE_ENV === 'production' || process.env.RENDER;
    if (isProduction) {
        console.warn('⚠️ WARNING: No APP_URL or RENDER_EXTERNAL_URL defined in production!');
        return `https://${process.env.RENDER_SERVICE_NAME || 'localhost'}`;
    }
    return `http://localhost:${process.env.PORT || 3000}`;
}

async function testProductionAuth() {
    console.log('🧪 TEST AUTHENTIFICATION PRODUCTION');
    console.log('=====================================');
    
    const username = process.env.SNAPSHOT_USERNAME || 'Saliou';
    const password = process.env.SNAPSHOT_PASSWORD || 'Murex2015';
    const baseUrl = getAppBaseUrl();
    
    console.log(`📡 URL: ${baseUrl}`);
    console.log(`👤 Username: ${username}`);
    console.log(`🔑 Password: ${password.replace(/./g, '*')}`);
    console.log('');
    
    try {
        console.log('🚀 Lancement navigateur...');
        const browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        });
        
        const page = await browser.newPage();
        
        await page.setExtraHTTPHeaders({
            'User-Agent': 'Snapshot-Service/1.0'
        });
        
        console.log('📄 Navigation vers la page principale...');
        await page.goto(baseUrl, { waitUntil: 'networkidle0', timeout: 30000 });
        
        console.log('⏳ Attente du formulaire de connexion...');
        await page.waitForSelector('#login-page', { timeout: 10000 });
        console.log('✅ Formulaire de connexion trouvé');
        
        // Vérifier si les champs username et password existent
        const usernameField = await page.$('#username');
        const passwordField = await page.$('#password');
        
        if (!usernameField) {
            throw new Error('Champ #username non trouvé');
        }
        if (!passwordField) {
            throw new Error('Champ #password non trouvé');
        }
        
        console.log('✅ Champs username et password trouvés');
        
        console.log('📝 Saisie des identifiants...');
        await page.type('#username', username);
        await page.type('#password', password);
        
        console.log('🔄 Soumission du formulaire...');
        await page.click('button[type="submit"]');
        
        // Attendre soit l'application principale, soit une erreur
        try {
            await page.waitForSelector('#app', { timeout: 10000 });
            console.log('✅ AUTHENTIFICATION RÉUSSIE !');
            console.log('✅ Application principale chargée');
            
            // Vérifier le nom d'utilisateur dans l'interface
            try {
                const userInfo = await page.$eval('.user-info, .username, [data-user]', el => el.textContent);
                console.log(`👤 Utilisateur connecté: ${userInfo}`);
            } catch (e) {
                console.log('ℹ️  Impossible de récupérer l\'info utilisateur (mais connexion OK)');
            }
            
        } catch (e) {
            // Vérifier s'il y a un message d'erreur
            try {
                const errorMsg = await page.$eval('.error, .alert-danger, [class*="error"]', el => el.textContent);
                console.log(`❌ ERREUR D'AUTHENTIFICATION: ${errorMsg}`);
            } catch (e2) {
                console.log('❌ AUTHENTIFICATION ÉCHOUÉE (timeout ou redirection)');
                
                // Capturer l'URL actuelle pour diagnostic
                const currentUrl = page.url();
                console.log(`📍 URL actuelle: ${currentUrl}`);
                
                // Capturer le contenu de la page pour diagnostic
                const pageTitle = await page.title();
                console.log(`📄 Titre de la page: ${pageTitle}`);
            }
        }
        
        await browser.close();
        
    } catch (error) {
        console.error('❌ ERREUR CRITIQUE:', error.message);
        console.error('📝 Stack:', error.stack);
    }
}

// Variables d'environnement pour le test
console.log('🔧 Variables d\'environnement:');
console.log(`  SNAPSHOT_USERNAME: ${process.env.SNAPSHOT_USERNAME || 'non définie (défaut: Saliou)'}`);
console.log(`  SNAPSHOT_PASSWORD: ${process.env.SNAPSHOT_PASSWORD ? '***définie***' : 'non définie (défaut: Murex2015)'}`);
console.log('');

testProductionAuth();
