// Load environment variables from .env file
require('dotenv').config();

const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const http = require('http');
const querystring = require('querystring');
const { Pool } = require('pg');
const bodyParser = require('body-parser');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const multer = require('multer');
const PDFDocument = require('pdfkit');
const OpenAI = require('openai');

// Fonction utilitaire pour formater la monnaie
function formatCurrency(amount) {
    return parseInt(amount).toLocaleString('fr-FR') + ' FCFA';
}

// Fonction utilitaire pour nettoyer l'encodage des caractères français
function cleanEncoding(obj) {
    if (typeof obj === 'string') {
        // Remplacer les caractères mal encodés
        return obj
            .replace(/├⌐/g, 'é')
            .replace(/├á/g, 'à')
            .replace(/├©/g, 'è')
            .replace(/├®/g, 'ê')
            .replace(/├¬/g, 'ì')
            .replace(/├│/g, 'ò')
            .replace(/├╣/g, 'ù')
            .replace(/├ç/g, 'ç')
            .replace(/├ü/g, 'ü')
            .replace(/├ö/g, 'ö')
            .replace(/├ä/g, 'ä')
            .replace(/├ï/g, 'ï')
            .replace(/├ë/g, 'ë');
    } else if (Array.isArray(obj)) {
        return obj.map(cleanEncoding);
    } else if (obj && typeof obj === 'object') {
        const cleaned = {};
        for (const [key, value] of Object.entries(obj)) {
            cleaned[key] = cleanEncoding(value);
        }
        return cleaned;
    }
    return obj;
}

// Fonction utilitaire pour lire la configuration financière
function getFinancialConfig() {
    try {
        const configPath = path.join(__dirname, 'financial_settings.json');
        if (fs.existsSync(configPath)) {
            const configData = fs.readFileSync(configPath, 'utf8');
            return JSON.parse(configData);
        }
    } catch (error) {
        console.error('Erreur lecture configuration financière:', error);
    }
    // Configuration par défaut si le fichier n'existe pas ou est corrompu
    return {
        charges_fixes_estimation: 5320000,
        validate_expense_balance: true,
        stock_mata_abattement: 0.10,
        description: "Paramètres financiers et estimations pour les calculs du système"
    };
}

// Fonction helper pour forcer la synchronisation de tous les comptes après modifications de crédit
async function forceSyncAllAccountsAfterCreditOperation() {
    try {
        console.log('🔄 AUTO-SYNC: Synchronisation automatique des comptes après modification de crédit...');
        
        const result = await pool.query('SELECT force_sync_all_accounts_simple()');
        const syncData = result.rows[0].force_sync_all_accounts_simple;
        
        console.log(`✅ AUTO-SYNC: Synchronisation terminée - ${syncData.total_corrected} comptes corrigés sur ${syncData.total_accounts}`);
        
        return {
            success: true,
            message: `Synchronisation automatique: ${syncData.total_corrected} comptes corrigés sur ${syncData.total_accounts}`,
            data: syncData
        };
        
    } catch (error) {
        console.error('❌ AUTO-SYNC: Erreur lors de la synchronisation automatique:', error);
        // Ne pas faire échouer la requête principale, juste logger l'erreur
        return {
            success: false,
            message: 'Erreur lors de la synchronisation automatique',
            error: error.message
        };
    }
}

// Fonction helper générique pour vérifier le type de compte et déclencher la synchronisation automatique
async function triggerAutoSyncIfNeeded(accountId, operationType = 'modification') {
    try {
        if (!accountId) {
            console.log('⚠️ AUTO-SYNC: Aucun compte ID fourni, synchronisation ignorée');
            return { success: false, message: 'Aucun compte ID fourni' };
        }

        // Vérifier le type de compte
        const accountTypeCheck = await pool.query('SELECT account_type, account_name FROM accounts WHERE id = $1', [accountId]);
        
        if (accountTypeCheck.rows.length === 0) {
            console.log(`⚠️ AUTO-SYNC: Compte ${accountId} non trouvé, synchronisation ignorée`);
            return { success: false, message: 'Compte non trouvé' };
        }

        const account = accountTypeCheck.rows[0];
        
        // Déclencher la synchronisation UNIQUEMENT pour les comptes classiques
        if (account.account_type === 'classique') {
            console.log(`🔄 AUTO-SYNC: Déclenchement synchronisation après ${operationType} sur compte classique "${account.account_name}"`);
            return await forceSyncAllAccountsAfterCreditOperation();
        } else {
            console.log(`ℹ️ AUTO-SYNC: Compte "${account.account_name}" de type "${account.account_type}" - synchronisation automatique non nécessaire`);
            return { success: true, message: `Compte ${account.account_type} - pas de sync automatique` };
        }
        
    } catch (error) {
        console.error('❌ AUTO-SYNC: Erreur lors de la vérification du type de compte:', error);
        return {
            success: false,
            message: 'Erreur lors de la vérification du type de compte',
            error: error.message
        };
    }
}

// ========================================
// 📸 SYSTÈME DE SNAPSHOTS
// ========================================

// Fonction utilitaire pour formater les dates en français
function formatDateFR(dateString, format = 'DD-MM-YYYY') {
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const yearShort = String(year).slice(-2);
    
    switch (format) {
        case 'DD-MM-YYYY': return `${day}-${month}-${year}`;
        case 'DD/MM/YYYY': return `${day}/${month}/${year}`;
        case 'DD/MM/YY': return `${day}/${month}/${yearShort}`;
        case 'YYYY-MM-DD': return `${year}-${month}-${day}`;
        default: return `${day}-${month}-${year}`;
    }
}

// Fonction principale pour collecter toutes les données du snapshot
async function collecteSnapshotData(cutoffDate = null) {
    console.log('📸 SNAPSHOT: Début collecte des données...');
    
    try {
        const snapshotDate = cutoffDate || new Date().toISOString().split('T')[0];
        const today = new Date().toISOString().split('T')[0];
        
        console.log(`📸 SNAPSHOT: Date de référence: ${snapshotDate}`);
        
        // 1. DONNÉES DASHBOARD PRINCIPAL
        console.log('📸 SNAPSHOT: Collecte dashboard...');
        
        // Calculer le début du mois pour la période courante
        const monthStart = snapshotDate.substring(0, 7) + '-01'; // Premier jour du mois
        console.log(`📸 SNAPSHOT: Période d'analyse dynamique: ${monthStart} à ${snapshotDate}`);
        
        // Stats cards principales
        const statsCardsQuery = `
            -- 1. Total dépensé (période courante - du début du mois à la date snapshot)
            SELECT COALESCE(SUM(amount), 0) as total_spent 
            FROM expenses 
            WHERE expense_date BETWEEN $2 AND $1;
            
            -- 2. Montant restant total (comptes actifs, hors depot/partenaire)
            SELECT COALESCE(SUM(a.current_balance), 0) as total_remaining 
            FROM accounts a 
            WHERE a.is_active = true AND a.account_type != 'depot' AND a.account_type != 'partenaire';
            
            -- 3. Total crédité avec dépenses
            SELECT COALESCE(SUM(a.total_credited), 0) as total_credited_with_expenses 
            FROM accounts a 
            WHERE a.is_active = true AND a.account_type != 'depot' AND a.account_type != 'partenaire';
            
            -- 4. Total crédité général
            SELECT COALESCE(SUM(
                COALESCE(ch.total_credited, 0) + 
                COALESCE(sch.total_special_credited, 0)
            ), 0) as total_credited_general
            FROM accounts a
            LEFT JOIN (
                SELECT account_id, SUM(amount) as total_credited 
                FROM credit_history 
                WHERE created_at::date <= $1 
                GROUP BY account_id
            ) ch ON a.id = ch.account_id
            LEFT JOIN (
                SELECT account_id, SUM(amount) as total_special_credited 
                FROM special_credit_history 
                WHERE credit_date <= $1 
                GROUP BY account_id
            ) sch ON a.id = sch.account_id
            WHERE a.is_active = true AND a.account_type != 'depot' AND a.account_type != 'partenaire';
            
            -- 5. Solde comptes dépôt
            SELECT COALESCE(SUM(a.current_balance), 0) as total_depot_balance 
            FROM accounts a 
            WHERE a.is_active = true AND a.account_type = 'depot';
            
            -- 6. Solde comptes partenaire
            SELECT COALESCE(SUM(a.current_balance), 0) as total_partner_balance 
            FROM accounts a 
            WHERE a.is_active = true AND a.account_type = 'partenaire';
        `;
        
        // Exécuter chaque requête séparément pour plus de clarté
        const totalSpentResult = await pool.query(
            'SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE expense_date BETWEEN $2 AND $1',
            [snapshotDate, monthStart]
        );
        
        const totalRemainingResult = await pool.query(
            'SELECT COALESCE(SUM(a.current_balance), 0) as total FROM accounts a WHERE a.is_active = true AND a.account_type != \'depot\' AND a.account_type != \'partenaire\''
        );
        
        const totalCreditedWithExpensesResult = await pool.query(
            'SELECT COALESCE(SUM(a.total_credited), 0) as total FROM accounts a WHERE a.is_active = true AND a.account_type != \'depot\' AND a.account_type != \'partenaire\''
        );
        
        const totalDepotBalanceResult = await pool.query(
            'SELECT COALESCE(SUM(a.current_balance), 0) as total FROM accounts a WHERE a.is_active = true AND a.account_type = \'depot\''
        );
        
        const totalPartnerBalanceResult = await pool.query(
            'SELECT COALESCE(SUM(a.current_balance), 0) as total FROM accounts a WHERE a.is_active = true AND a.account_type = \'partenaire\''
        );
        
        // dashboardStats sera mis à jour après le scraping HTML avec les vraies valeurs
        
        // 1.5. DONNÉES DÉTAILLÉES DU DASHBOARD (PL, Cash, etc.)
        console.log('📸 SNAPSHOT: Collecte données détaillées dashboard...');
        
        // Simuler l'appel à stats-cards pour récupérer les détails PL
        const dashboardDetailsResult = await pool.query(`
            SELECT 
                COALESCE(SUM(a.current_balance), 0) as total_cash_disponible
            FROM accounts a 
            WHERE a.is_active = true 
            AND a.account_type NOT IN ('depot', 'partenaire')
        `);
        
        // Récupérer les détails du cash disponible (comptes individuels)
        const cashDetailsResult = await pool.query(`
            SELECT 
                a.account_name,
                a.account_type,
                a.current_balance,
                a.category_type
            FROM accounts a 
            WHERE a.is_active = true 
            AND a.account_type NOT IN ('depot', 'partenaire')
            AND a.current_balance > 0
            ORDER BY a.current_balance DESC
        `);
        
        // Récupérer les données de stock pour les cartes additionnelles
        const stockMataResult = await pool.query(`
            SELECT 
                date as stock_date,
                SUM(stock_soir) as stock_value,
                MAX(created_at) as created_at
            FROM stock_mata 
            WHERE extract(year from date) = extract(year from $1::date)
            AND extract(month from date) = extract(month from $1::date)
            GROUP BY date
            ORDER BY date DESC
            LIMIT 2
        `, [snapshotDate]);
        
        const stockVivantResult = await pool.query(`
            SELECT 
                date_stock as stock_date,
                SUM(total) as stock_value,
                MAX(created_at) as created_at
            FROM stock_vivant 
            WHERE extract(year from date_stock) = extract(year from $1::date)
            AND extract(month from date_stock) = extract(month from $1::date)
            GROUP BY date_stock
            ORDER BY date_stock DESC
            LIMIT 2
        `, [snapshotDate]);
        
        // Calculer les écarts de stock
        let stockMataEcart = 0, stockVivantEcart = 0;
        if (stockMataResult.rows.length >= 2) {
            stockMataEcart = parseFloat(stockMataResult.rows[0].stock_value) - parseFloat(stockMataResult.rows[1].stock_value);
        }
        if (stockVivantResult.rows.length >= 2) {
            stockVivantEcart = parseFloat(stockVivantResult.rows[0].stock_value) - parseFloat(stockVivantResult.rows[1].stock_value);
        }
        
        // Récupérer les données Cash Bictorys du mois (MÊME LOGIQUE QUE LE DASHBOARD)
        const monthYear = snapshotDate.substring(0, 7); // Format YYYY-MM
        let cashBictorysResult = await pool.query(`
            SELECT amount as valeur_cash, date as date_valeur
            FROM cash_bictorys
            WHERE date = (
                SELECT MAX(date)
                FROM cash_bictorys
                WHERE amount != 0 
                AND month_year = $1
                AND date <= $2
            )
            AND amount != 0
            AND month_year = $1
            AND date <= $2
        `, [monthYear, snapshotDate]);
        
        // Fallback si aucune valeur non-nulle trouvée
        if (cashBictorysResult.rows.length === 0) {
            cashBictorysResult = await pool.query(`
                SELECT amount as valeur_cash, date as date_valeur
                FROM cash_bictorys
                WHERE date = (
                    SELECT MAX(date)
                    FROM cash_bictorys
                    WHERE month_year = $1
                    AND date <= $2
                )
                AND month_year = $1
                AND date <= $2
            `, [monthYear, snapshotDate]);
        }
        
        // Calculer les créances du mois
        const creancesMoisResult = await pool.query(`
            SELECT COALESCE(SUM(co.amount), 0) as total
            FROM creance_operations co
            WHERE extract(year from co.operation_date) = extract(year from $1::date)
            AND extract(month from co.operation_date) = extract(month from $1::date)
            AND co.operation_date <= $1
        `, [snapshotDate]);
        
        // Récupérer les livraisons partenaires du mois
        const livraisonsPartenairesPlResult = await pool.query(`
            SELECT COALESCE(SUM(pd.amount), 0) as total_livraisons
            FROM partner_deliveries pd
            JOIN accounts a ON pd.account_id = a.id
            WHERE pd.delivery_date >= $1 
            AND pd.delivery_date <= $2
            AND pd.validation_status = 'fully_validated'
            AND pd.is_validated = true
            AND a.account_type = 'partenaire'
            AND a.is_active = true
        `, [monthStart, snapshotDate]);
        
        // Calculer les charges prorata (même logique que le dashboard)
        const chargesFixesEstimation = 2000000; // Configuration par défaut
        const currentDate = new Date(snapshotDate);
        const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
        
        // Calculer jours ouvrables écoulés (lundi-samedi)
        let joursOuvrablesEcoules = 0;
        for (let d = new Date(firstDayOfMonth); d <= currentDate; d.setDate(d.getDate() + 1)) {
            const dayOfWeek = d.getDay();
            if (dayOfWeek >= 1 && dayOfWeek <= 6) { // Lundi (1) à Samedi (6)
                joursOuvrablesEcoules++;
            }
        }
        
        // Calculer total jours ouvrables du mois
        const lastDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
        let totalJoursOuvrables = 0;
        for (let d = new Date(firstDayOfMonth); d <= lastDayOfMonth; d.setDate(d.getDate() + 1)) {
            const dayOfWeek = d.getDay();
            if (dayOfWeek >= 1 && dayOfWeek <= 6) {
                totalJoursOuvrables++;
            }
        }
        
        const chargesProrata = totalJoursOuvrables > 0 ? Math.round((chargesFixesEstimation * joursOuvrablesEcoules) / totalJoursOuvrables) : 0;
        
        // SOLUTION PARFAITE : Lire les valeurs depuis le HTML du dashboard
        console.log('🌐 SNAPSHOT: Lecture des valeurs depuis le HTML du dashboard...');
        console.log('🔍 DEBUG: Tentative HTML scraping dans le contexte snapshot');
        
        // Déterminer l'URL base selon l'environnement
        const baseUrl = getAppBaseUrl();
        
        const dashboardUrl = `${baseUrl}?cutoff_date=${snapshotDate}`;
        console.log(`🔍 URL dashboard: ${dashboardUrl}`);
        
        let plDetails = {};
        
        try {
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
            
            // Utiliser puppeteer pour scraper le HTML
            const puppeteer = require('puppeteer');
            
            console.log('🚀 Lancement navigateur...');
            
            // Configuration Puppeteer corrigée (basée sur le test qui fonctionne)
            const isProduction = process.env.NODE_ENV === 'production' || process.env.RENDER;
            const puppeteerConfig = {
                headless: true, // Toujours en mode headless pour éviter l'ouverture du navigateur
                args: [
                    '--no-sandbox', 
                    '--disable-setuid-sandbox'
                ]
            };
            
            // DÉTECTION CHROME AVEC RÉPERTOIRE PERSISTANT
            if (isProduction) {
                console.log('🔍 === DÉTECTION CHROME DANS UPLOADS (PERSISTANT) ===');
                const fs = require('fs');
                const { execSync } = require('child_process');
                let foundChrome = false;
                
                // Configurer le cache Puppeteer vers uploads (persistant)
                process.env.PUPPETEER_CACHE_DIR = '/opt/render/project/src/uploads/.puppeteer-cache';
                
                // Méthode 1: Répertoire uploads persistant
                try {
                    console.log('🔍 Recherche dans uploads/.puppeteer-cache...');
                    const uploadsChromeResult = execSync('find /opt/render/project/src/uploads/.puppeteer-cache -name "chrome" -type f -executable 2>/dev/null | head -1', { 
                        encoding: 'utf8',
                        timeout: 5000
                    }).trim();
                    
                    if (uploadsChromeResult && fs.existsSync(uploadsChromeResult)) {
                        puppeteerConfig.executablePath = uploadsChromeResult;
                        console.log(`✅ Chrome trouvé dans uploads: ${uploadsChromeResult}`);
                        foundChrome = true;
                    }
                } catch (error) {
                    console.log(`❌ Recherche uploads échouée: ${error.message}`);
                }
                
                // Méthode 2: Puppeteer automatique (rapide)
                if (!foundChrome) {
                    try {
                        const executablePath = puppeteer.executablePath();
                        console.log(`🔍 Puppeteer détecte: ${executablePath}`);
                        
                        if (fs.existsSync(executablePath)) {
                            puppeteerConfig.executablePath = executablePath;
                            console.log(`✅ Chrome trouvé via Puppeteer: ${executablePath}`);
                            foundChrome = true;
                        }
                    } catch (error) {
                        console.log(`❌ Erreur Puppeteer: ${error.message}`);
                    }
                }
                
                // Méthode 3: Chemins legacy (ancien cache)
                if (!foundChrome) {
                    console.log('🔍 Chemins legacy...');
                    const legacyPaths = [
                        '/opt/render/.cache/puppeteer/chrome/linux-140.0.7339.82/chrome-linux64/chrome',
                        '/opt/render/.cache/puppeteer/chrome/linux-140.0.7336.61/chrome-linux64/chrome'
                    ];
                    
                    for (const path of legacyPaths) {
                        if (fs.existsSync(path)) {
                            puppeteerConfig.executablePath = path;
                            console.log(`✅ Chrome trouvé legacy: ${path}`);
                            foundChrome = true;
                            break;
                        }
                    }
                }
                
                if (!foundChrome) {
                    console.log('❌ Chrome non trouvé, utilisation configuration par défaut');
                } else {
                    console.log(`🎉 Chrome configuré: ${puppeteerConfig.executablePath}`);
                }
            }
            
            const browser = await puppeteer.launch(puppeteerConfig);
            
            const page = await browser.newPage();
            
            // Configuration des credentials pour l'authentification
            const SNAPSHOT_USERNAME = process.env.SNAPSHOT_USERNAME;
            const SNAPSHOT_PASSWORD = process.env.SNAPSHOT_PASSWORD;
            
            await page.setExtraHTTPHeaders({
                'User-Agent': 'Snapshot-Service/1.0'
            });
            
            // Configuration pour éviter les problèmes de frame
            await page.setDefaultNavigationTimeout(60000);
            await page.setDefaultTimeout(30000);
            
            // Gestionnaire d'erreurs pour les frames détachées
            page.on('error', (error) => {
                console.log(`⚠️ Erreur page: ${error.message}`);
            });
            
            page.on('pageerror', (error) => {
                console.log(`⚠️ Erreur JavaScript: ${error.message}`);
            });
            
            console.log('🔑 Authentification en cours...');
            
            // Étape 1: Aller sur la page principale (SPA avec login intégré)
            try {
                await page.goto(baseUrl, { 
                    waitUntil: 'networkidle0',
                    timeout: 60000 
                });
            } catch (navError) {
                console.error('❌ Erreur navigation:', navError.message);
                console.log('🔄 Tentative avec waitUntil: load...');
                await page.goto(baseUrl, { 
                    waitUntil: 'load',
                    timeout: 60000
                });
            }
            
            // Attendre un peu pour que la page se stabilise
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Vérifier si on est sur la page de login
            await page.waitForSelector('#login-page', { timeout: 10000 });
            
            // Étape 2: Remplir le formulaire de connexion
            await page.waitForSelector('#username', { timeout: 10000 });
            await page.type('#username', SNAPSHOT_USERNAME);
            await page.type('#password', SNAPSHOT_PASSWORD);
            
            // Étape 3: Soumettre le formulaire
            await page.click('button[type="submit"]');
            
            // Attendre que l'application principale se charge (SPA)
            await page.waitForSelector('#app', { timeout: 10000 });
            
            console.log('✅ Authentification réussie');
            
            // Étape 4: Naviguer vers le dashboard avec cutoff_date
            console.log('📄 Navigation vers dashboard...');
            
            try {
                await page.goto(dashboardUrl, { 
                    waitUntil: 'networkidle0',
                    timeout: 60000 
                });
            } catch (navError) {
                console.error('❌ Erreur navigation dashboard:', navError.message);
                console.log('🔄 Tentative avec waitUntil: load...');
                await page.goto(dashboardUrl, { 
                    waitUntil: 'load',
                    timeout: 60000
                });
            }
            
            // Attendre que la page se stabilise
            await new Promise(resolve => setTimeout(resolve, 5000));
            
            // Attendre que les éléments importants soient chargés avec retry
            let elementFound = false;
            for (let i = 0; i < 3; i++) {
                try {
                    await page.waitForSelector('#pl-estim-charges', { timeout: 15000 });
                    elementFound = true;
                    break;
                } catch (error) {
                    console.log(`⚠️ Tentative ${i + 1}/3 pour trouver #pl-estim-charges: ${error.message}`);
                    if (i < 2) {
                        await new Promise(resolve => setTimeout(resolve, 2000));
                        // Essayer de rafraîchir la page si nécessaire
                        if (error.message.includes('detached') || error.message.includes('timeout')) {
                            console.log('🔄 Rafraîchissement de la page...');
                            await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
                        }
                    }
                }
            }
            
            if (!elementFound) {
                throw new Error('Impossible de trouver l\'élément #pl-estim-charges après 3 tentatives');
            }
            
            console.log('🔍 Extraction des valeurs HTML...');
            
            // Extraire toutes les valeurs directement depuis le DOM avec vérification de frame
            let scrapedData;
            try {
                // Vérifier que la page est toujours accessible
                await page.evaluate(() => {
                    if (!document.body) {
                        throw new Error('Document body not available');
                    }
                });
                
                scrapedData = await page.evaluate(() => {
                    const getValue = (selector) => {
                        const element = document.querySelector(selector);
                        return element ? element.textContent.trim() : '0';
                    };
                    
                    return {
                        // PL avec écart stock mensuel et estimation charges (valeur principale)
                        plFinal: getValue('#pl-estim-charges'), // PL (avec ecart stock mensuel et une estim. charges)
                        plBrut: getValue('#pl-brut'), // PL brut avec écart stock mensuel
                        plSansStockCharges: getValue('#pl-sans-stock-charges'), // PL sans stock
                        
                        cashBictorys: getValue('#cash-bictorys-latest'),
                        creancesMois: getValue('#creances-mois'),
                        remboursementsMois: getValue('#pl-remboursements'),
                        totalSpent: getValue('#total-spent-amount'),
                        stockVivantVariation: getValue('#stock-vivant-variation'),
                        stockTotal: getValue('#stock-total'),
                        weeklyBurn: getValue('#weekly-burn'),
                        monthlyBurn: getValue('#monthly-burn'),
                        totalRemaining: getValue('#total-remaining-amount'),
                        totalCredits: getValue('#total-credited-amount'),
                        depotBalance: getValue('#total-depot-balance'),
                        partnerBalance: getValue('#total-partner-balance'),
                        virementsMois: getValue('#virements-mois-amount'),
                        
                        // Éléments du détail PL si disponibles
                        plBase: getValue('#pl-base-amount'),
                        plBrut: getValue('#pl-brut-amount'),
                        chargesProrata: getValue('#charges-prorata-amount')
                    };
                });
                
                console.log('✅ Extraction HTML réussie');
                
                // Debug: Afficher les valeurs brutes scrapées
                console.log('🔍 === VALEURS SCRAPPÉES (BRUTES) ===');
                console.log(`📊 PL Final (#pl-estim-charges): "${scrapedData.plFinal}"`);
                console.log(`📊 PL Brut (#pl-brut): "${scrapedData.plBrut}"`);
                console.log(`📊 PL Sans Stock (#pl-sans-stock-charges): "${scrapedData.plSansStockCharges}"`);
                console.log(`💰 Cash Bictorys (#cash-bictorys-latest): "${scrapedData.cashBictorys}"`);
                console.log(`💳 Créances (#creances-mois): "${scrapedData.creancesMois}"`);
                console.log(`💵 Remboursements (#pl-remboursements): "${scrapedData.remboursementsMois}"`);
                console.log(`💸 Total Dépensé (#total-spent-amount): "${scrapedData.totalSpent}"`);
                
            } catch (error) {
                console.log(`⚠️ Erreur lors de l'extraction HTML: ${error.message}`);
                throw new Error(`Erreur extraction HTML: ${error.message}`);
            } finally {
                // Fermer le navigateur de manière sécurisée
                try {
                    await browser.close();
                } catch (closeError) {
                    console.log(`⚠️ Erreur fermeture navigateur: ${closeError.message}`);
                }
            }
            
            // Convertir les valeurs extraites
            plDetails = {
                plFinal: parseFormattedNumber(scrapedData.plFinal),
                cashBictorys: parseFormattedNumber(scrapedData.cashBictorys),
                creancesMois: parseFormattedNumber(scrapedData.creancesMois),
                remboursementsMois: parseFormattedNumber(scrapedData.remboursementsMois),
                cashBurn: parseFormattedNumber(scrapedData.totalSpent),
                ecartStockVivant: parseFormattedNumber(scrapedData.stockVivantVariation),
                ecartStockMata: parseFormattedNumber(scrapedData.stockTotal),
                plBase: parseFormattedNumber(scrapedData.plBase),
                plBrut: parseFormattedNumber(scrapedData.plBrut),
                chargesProrata: parseFormattedNumber(scrapedData.chargesProrata),
                virementsMois: parseFormattedNumber(scrapedData.virementsMois),
                
                // Valeurs supplémentaires du dashboard
                totalRemaining: parseFormattedNumber(scrapedData.totalRemaining),
                totalCredits: parseFormattedNumber(scrapedData.totalCredits),
                depotBalance: parseFormattedNumber(scrapedData.depotBalance),
                partnerBalance: parseFormattedNumber(scrapedData.partnerBalance),
                weeklyBurn: parseFormattedNumber(scrapedData.weeklyBurn),
                monthlyBurn: parseFormattedNumber(scrapedData.monthlyBurn),
                
                source: 'html_scraping',
                baseUrl: baseUrl
            };
            
            console.log('✅ Valeurs extraites depuis HTML avec succès !');
            
        } catch (error) {
            console.error('❌ ERREUR HTML scraping:', error.message);
            console.error('📝 Stack complet:', error.stack);
            console.error('🚨 FALLBACK SUPPRIMÉ - L\'erreur va être propagée');
            
            // PROPAGER L'ERREUR AU LIEU DU FALLBACK
            throw new Error(`HTML scraping failed: ${error.message}`);
        }
        
        console.log(`📊 SNAPSHOT PL (source: ${plDetails.source}):`);
        console.log(`  🎯 PL FINAL: ${Math.round(plDetails.plFinal).toLocaleString()} FCFA`);
        console.log(`  💰 Cash Bictorys: ${plDetails.cashBictorys.toLocaleString()} FCFA`);
        console.log(`  📊 PL Base: ${Math.round(plDetails.plBase || 0).toLocaleString()} FCFA`);
        console.log(`  📊 PL Brut: ${Math.round(plDetails.plBrut || 0).toLocaleString()} FCFA`);
        
        if (plDetails.source === 'html_scraping') {
            console.log(`  🌐 Source: Dashboard HTML (${plDetails.baseUrl})`);
            console.log(`  ✅ Garantie de cohérence avec l'interface utilisateur !`);
        } else {
            console.log(`  🔄 Source: Base de données (fallback) - ${plDetails.baseUrl}`);
            console.log(`  ⚠️ Valeurs estimées (HTML scraping a échoué)`);
            if (plDetails.error) {
                console.log(`  📝 Erreur: ${plDetails.error}`);
            }
        }
        // Créer dashboardStats avec les valeurs scrappées (au lieu des valeurs calculées)
        const dashboardStats = {
            totalSpent: plDetails.cashBurn || parseFloat(totalSpentResult.rows[0].total),
            totalRemaining: plDetails.totalRemaining || parseFloat(totalRemainingResult.rows[0].total),
            totalCreditedWithExpenses: plDetails.totalCredits || parseFloat(totalCreditedWithExpensesResult.rows[0].total),
            totalDepotBalance: plDetails.depotBalance || parseFloat(totalDepotBalanceResult.rows[0].total),
            totalPartnerBalance: plDetails.partnerBalance || parseFloat(totalPartnerBalanceResult.rows[0].total),
            // Ajouter les valeurs PL scrappées - CLÉS PRINCIPALES
            plFinal: plDetails.plFinal,
            cashBictorys: plDetails.cashBictorys,
            creancesMois: plDetails.creancesMois,
            remboursementsMois: plDetails.remboursementsMois,
            stockVivantVariation: plDetails.ecartStockVivant,
            stockVivantVariation: plDetails.ecartStockVivant,
            weeklyBurn: plDetails.weeklyBurn,
            monthlyBurn: plDetails.monthlyBurn,
            source: plDetails.source || 'calculation'
        };
        
        console.log(`📊 DASHBOARD STATS (source: ${dashboardStats.source}):`);
        console.log(`  🎯 PL FINAL: ${Math.round(dashboardStats.plFinal).toLocaleString()} FCFA`);
        console.log(`  💰 Cash Bictorys: ${dashboardStats.cashBictorys.toLocaleString()} FCFA`);
        console.log(`  💸 Total Dépensé: ${dashboardStats.totalSpent.toLocaleString()} FCFA`);
        
        // 2. DÉTAILS PAR COMPTE
        console.log('📸 SNAPSHOT: Collecte détails comptes...');
        const accountsDetailsResult = await pool.query(`
            SELECT 
                a.id,
                a.account_name,
                a.account_type,
                a.current_balance as montant_restant,
                a.total_credited,
                u.full_name as user_name,
                a.category_type as category,
                -- Montant dépensé dans la période
                COALESCE(expenses_sum.montant_depense, 0) as montant_depense,
                -- Crédit du mois (dépenses = crédits dans ce système)
                COALESCE(expenses_sum.montant_depense, 0) as credit_du_mois,
                -- Balance du mois = current_balance 
                a.current_balance as balance_du_mois,
                -- Transferts entrants et sortants
                COALESCE(a.transfert_entrants, 0) as transfert_entrants,
                COALESCE(a.transfert_sortants, 0) as transfert_sortants
            FROM accounts a
            LEFT JOIN users u ON a.user_id = u.id
            LEFT JOIN (
                SELECT 
                    account_id, 
                    SUM(total) as montant_depense
                FROM expenses 
                WHERE expense_date >= $2 AND expense_date <= $1 
                GROUP BY account_id
            ) expenses_sum ON a.id = expenses_sum.account_id
            WHERE a.is_active = true
            ORDER BY a.account_type, a.account_name
        `, [snapshotDate, monthStart]);
        
        // 3. TRANSFERTS
        console.log('📸 SNAPSHOT: Collecte transferts...');
        const transfertsResult = await pool.query(`
            SELECT 
                th.id,
                th.created_at::date as transfer_date,
                th.montant as amount,
                th.comment as description,
                th.transferred_by as created_by,
                a_from.account_name as from_account,
                a_to.account_name as to_account,
                u.username as created_by_username
            FROM transfer_history th
            LEFT JOIN accounts a_from ON th.source_id = a_from.id
            LEFT JOIN accounts a_to ON th.destination_id = a_to.id
            LEFT JOIN users u ON th.transferred_by = u.id
            WHERE th.created_at::date <= $1
            ORDER BY th.created_at DESC, th.id DESC
            LIMIT 1000
        `, [snapshotDate]);
        
        // 4. DÉPENSES PAR CATÉGORIE
        console.log('📸 SNAPSHOT: Collecte dépenses par catégorie...');
        const depensesCategoriesResult = await pool.query(`
            SELECT 
                category,
                SUM(amount) as total_amount,
                COUNT(*) as count,
                ROUND((SUM(amount) * 100.0 / NULLIF((SELECT SUM(amount) FROM expenses WHERE expense_date BETWEEN $2 AND $1), 0)), 1) as percentage
            FROM expenses 
            WHERE expense_date BETWEEN $2 AND $1
            GROUP BY category
            ORDER BY total_amount DESC
        `, [snapshotDate, monthStart]);
        
        // 5. TOUTES LES DÉPENSES (depuis inception)
        console.log('📸 SNAPSHOT: Collecte toutes les dépenses...');
        const toutesDepensesResult = await pool.query(`
            SELECT 
                e.id,
                e.expense_date,
                e.amount,
                e.category,
                e.designation,
                e.supplier,
                e.description,
                e.expense_type,
                e.quantity,
                e.unit_price,
                e.justification_filename,
                e.predictable as is_predictable,
                e.is_selected,
                a.account_name,
                u.username
            FROM expenses e
            LEFT JOIN accounts a ON e.account_id = a.id
            LEFT JOIN users u ON e.user_id = u.id
            WHERE e.expense_date <= $1
            ORDER BY e.expense_date DESC, e.id DESC
        `, [snapshotDate]);
        
        // 6. CRÉANCES - Récapitulatif par client
        console.log('📸 SNAPSHOT: Collecte créances...');
        const creancesClientsResult = await pool.query(`
            SELECT 
                cc.client_name,
                cc.client_phone as phone,
                COALESCE(SUM(CASE WHEN co.operation_type = 'credit' THEN co.amount ELSE 0 END), 0) as credit_initial,
                COALESCE(SUM(CASE WHEN co.operation_type = 'debit' THEN co.amount ELSE 0 END), 0) as total_avances,
                COALESCE(SUM(CASE WHEN co.operation_type = 'remboursement' THEN co.amount ELSE 0 END), 0) as total_remboursements,
                COALESCE(
                    SUM(CASE WHEN co.operation_type = 'credit' THEN co.amount ELSE 0 END) - 
                    SUM(CASE WHEN co.operation_type = 'debit' THEN co.amount ELSE 0 END) + 
                    SUM(CASE WHEN co.operation_type = 'remboursement' THEN co.amount ELSE 0 END), 
                    0
                ) as solde_final
            FROM creance_clients cc
            LEFT JOIN creance_operations co ON cc.id = co.client_id AND co.operation_date <= $1
            WHERE cc.is_active = true
            GROUP BY cc.client_name, cc.client_phone, cc.id
            HAVING COALESCE(
                SUM(CASE WHEN co.operation_type = 'credit' THEN co.amount ELSE 0 END) - 
                SUM(CASE WHEN co.operation_type = 'debit' THEN co.amount ELSE 0 END) + 
                SUM(CASE WHEN co.operation_type = 'remboursement' THEN co.amount ELSE 0 END), 
                0
            ) != 0
            ORDER BY solde_final DESC
        `, [snapshotDate]);
        
        // 7. CRÉANCES - Historique des opérations
        const creancesOperationsResult = await pool.query(`
            SELECT 
                co.id,
                co.operation_date,
                cc.client_name,
                co.operation_type,
                co.amount,
                co.description,
                co.created_by,
                u.username as created_by_username
            FROM creance_operations co
            LEFT JOIN creance_clients cc ON co.client_id = cc.id
            LEFT JOIN users u ON co.created_by = u.id
            WHERE co.operation_date <= $1
            ORDER BY co.operation_date DESC, co.id DESC
            LIMIT 1000
        `, [snapshotDate]);
        
        // 8. COMPTES PARTENAIRES DÉTAILS
        console.log('📸 SNAPSHOT: Collecte comptes partenaires...');
        const comptesPartenairesResult = await pool.query(`
            SELECT 
                a.id,
                a.account_name,
                a.current_balance as montant_total,
                COALESCE(deliveries.total_delivered, 0) as livre,
                a.current_balance - COALESCE(deliveries.total_delivered, 0) as restant,
                COALESCE(deliveries.article_count, 0) as articles,
                COALESCE(deliveries.delivery_count, 0) as delivery_count,
                CASE 
                    WHEN a.current_balance > 0 THEN 
                        ROUND((COALESCE(deliveries.total_delivered, 0) * 100.0 / a.current_balance), 1)
                    ELSE 0 
                END as progression
            FROM accounts a
            LEFT JOIN (
                SELECT 
                    account_id,
                    SUM(CASE WHEN validation_status = 'fully_validated' THEN amount ELSE 0 END) as total_delivered,
                    SUM(CASE WHEN validation_status = 'fully_validated' THEN article_count ELSE 0 END) as article_count,
                    COUNT(CASE WHEN validation_status = 'fully_validated' THEN 1 ELSE NULL END) as delivery_count
                FROM partner_deliveries 
                WHERE delivery_date <= $1
                GROUP BY account_id
            ) deliveries ON a.id = deliveries.account_id
            WHERE a.account_type = 'partenaire' AND a.is_active = true
            ORDER BY a.account_name
        `, [snapshotDate]);
        
        // 9. LIVRAISONS PARTENAIRES DÉTAILS
        const livraisonsPartenairesResult = await pool.query(`
            SELECT 
                pd.id,
                pd.delivery_date,
                pd.article_count as articles,
                pd.unit_price,
                pd.amount as montant,
                pd.description,
                pd.validation_status,
                pd.created_by,
                a.account_name,
                u.username as created_by_username
            FROM partner_deliveries pd
            LEFT JOIN accounts a ON pd.account_id = a.id
            LEFT JOIN users u ON pd.created_by = u.id
            WHERE pd.delivery_date <= $1
            ORDER BY pd.delivery_date DESC, pd.id DESC
            LIMIT 1000
        `, [snapshotDate]);
        
        // 10. GESTION DE STOCK - Stocks du soir non-zéros pour la date la plus récente
        console.log('📸 SNAPSHOT: Collecte gestion de stock...');
        const gestionStockResult = await pool.query(`
            SELECT 
                sm.date,
                sm.point_de_vente,
                sm.produit,
                sm.stock_matin,
                sm.stock_soir,
                sm.transfert
            FROM stock_mata sm
            WHERE sm.date = (
                SELECT MAX(date) 
                FROM stock_mata 
                WHERE stock_soir != 0 AND stock_soir IS NOT NULL
            )
            AND sm.stock_soir != 0 
            AND sm.stock_soir IS NOT NULL
            ORDER BY sm.point_de_vente, sm.produit
        `);
        
        // Construire l'objet snapshot final
        const snapshot = {
            metadata: {
                snapshot_date: snapshotDate,
                creation_timestamp: new Date().toISOString(),
                snapshot_date_fr: formatDateFR(snapshotDate, 'DD/MM/YYYY'),
                period_label: `Du 01/09/2025 au ${formatDateFR(snapshotDate, 'DD/MM/YYYY')}`,
                version: '1.1'
            },
            dashboard: {
                stats_cards: dashboardStats,
                accounts_details: accountsDetailsResult.rows,
                transferts: transfertsResult.rows,
                depenses_categories: depensesCategoriesResult.rows,
                // Nouvelles données détaillées
                pl_details: plDetails,
                cash_details: {
                    total_cash_disponible: parseFloat(dashboardDetailsResult.rows[0].total_cash_disponible),
                    comptes_inclus: cashDetailsResult.rows.map(row => ({
                        account_name: row.account_name,
                        account_type: row.account_type,
                        current_balance: parseFloat(row.current_balance),
                        category_type: row.category_type
                    })),
                    nombre_comptes: cashDetailsResult.rows.length
                },
                cartes_additionnelles: {
                    stock_mata: {
                        historique: stockMataResult.rows.map(row => ({
                            stock_date: row.stock_date,
                            stock_value: parseFloat(row.stock_value),
                            created_at: row.created_at
                        })),
                        ecart_mensuel: stockMataEcart,
                        stock_actuel: stockMataResult.rows.length > 0 ? parseFloat(stockMataResult.rows[0].stock_value) : 0,
                        stock_precedent: stockMataResult.rows.length > 1 ? parseFloat(stockMataResult.rows[1].stock_value) : 0
                    },
                    stock_vivant: {
                        historique: stockVivantResult.rows.map(row => ({
                            stock_date: row.stock_date,
                            stock_value: parseFloat(row.stock_value),
                            created_at: row.created_at
                        })),
                        ecart_mensuel: stockVivantEcart,
                        stock_actuel: stockVivantResult.rows.length > 0 ? parseFloat(stockVivantResult.rows[0].stock_value) : 0,
                        stock_precedent: stockVivantResult.rows.length > 1 ? parseFloat(stockVivantResult.rows[1].stock_value) : 0
                    },
                    cash_bictorys: {
                        valeur_actuelle: cashBictorysResult.rows.length > 0 ? parseFloat(cashBictorysResult.rows[0].valeur_cash) : 0,
                        date_valeur: cashBictorysResult.rows.length > 0 ? cashBictorysResult.rows[0].date_valeur : null,
                        created_at: cashBictorysResult.rows.length > 0 ? cashBictorysResult.rows[0].created_at : null
                    },
                    totaux_depot_partenaire: {
                        solde_depot: dashboardStats.totalDepotBalance,
                        solde_partenaire: dashboardStats.totalPartnerBalance
                    }
                }
            },
            depenses: {
                toutes_depenses: toutesDepensesResult.rows,
                summary: {
                    total_amount: dashboardStats.totalSpent,
                    total_count: toutesDepensesResult.rows.length,
                    period: `${monthStart} à ${snapshotDate}`
                }
            },
            creances: {
                recapitulatif_clients: creancesClientsResult.rows,
                historique_operations: creancesOperationsResult.rows,
                summary: {
                    total_clients: creancesClientsResult.rows.length,
                    total_operations: creancesOperationsResult.rows.length
                }
            },
            comptes_partenaires: {
                comptes: comptesPartenairesResult.rows,
                livraisons: livraisonsPartenairesResult.rows,
                summary: {
                    total_comptes: comptesPartenairesResult.rows.length,
                    total_livraisons: livraisonsPartenairesResult.rows.length
                }
            },
            gestion_stock: {
                stocks_actifs: gestionStockResult.rows,
                summary: {
                    total_lignes: gestionStockResult.rows.length,
                    date_reference: gestionStockResult.rows.length > 0 ? gestionStockResult.rows[0].date : null,
                    points_de_vente: [...new Set(gestionStockResult.rows.map(row => row.point_de_vente))].length,
                    produits_uniques: [...new Set(gestionStockResult.rows.map(row => row.produit))].length
                }
            }
        };
        
        console.log('📸 SNAPSHOT: Collecte terminée avec succès');
        return snapshot;
        
    } catch (error) {
        console.error('❌ SNAPSHOT: Erreur lors de la collecte:', error);
        throw error;
    }
}

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration des timeouts pour les requêtes longues (PDF generation)
app.use((req, res, next) => {
    // Augmenter le timeout pour les requêtes de génération PDF
    if (req.path === '/api/expenses/generate-invoices-pdf') {
        req.setTimeout(300000); // 5 minutes pour la génération PDF
        res.setTimeout(300000); // 5 minutes pour la réponse
    } else {
        req.setTimeout(60000); // 1 minute pour les autres requêtes
        res.setTimeout(60000); // 1 minute pour les autres réponses
    }
    next();
});

// Configuration de la base de données PostgreSQL
// Priorité à DATABASE_URL (URL complète), sinon paramètres séparés
const dbConfig = process.env.DATABASE_URL ? {
    // Configuration via URL complète (Render.com/Production)
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    // Configuration optimisée pour Render.com
    max: 5, // Maximum 5 connexions dans le pool
    min: 1, // Minimum 1 connexion
    acquireTimeoutMillis: 30000, // 30 secondes pour acquérir une connexion
    createTimeoutMillis: 30000, // 30 secondes pour créer une connexion
    destroyTimeoutMillis: 5000, // 5 secondes pour détruire une connexion
    idleTimeoutMillis: 10000, // 10 secondes pour les connexions inactives
    createRetryIntervalMillis: 500, // 0.5 seconde entre les tentatives
    statement_timeout: 60000, // 1 minute pour les requêtes
    query_timeout: 60000 // 1 minute pour les requêtes
} : {
    // Configuration via paramètres séparés (développement/fallback)
    user: process.env.DB_USER || 'zalint',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'depenses_management',
    password: process.env.DB_PASSWORD || 'bonea2024',
    port: process.env.DB_PORT || 5432,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 10, // Plus de connexions en local
    statement_timeout: 300000,
    query_timeout: 300000,
    connectionTimeoutMillis: 60000,
    idleTimeoutMillis: 30000
};

console.log('🔗 Configuration DB:', process.env.DATABASE_URL ? 'DATABASE_URL (Production)' : 'Paramètres séparés (Dev)');
const pool = new Pool(dbConfig);

// Gestionnaires d'événements pour le pool de connexions
pool.on('connect', (client) => {
    console.log('🔗 Database client connected');
});

pool.on('error', (err, client) => {
    console.error('❌ Database pool error:', err);
});

pool.on('remove', (client) => {
    console.log('🔌 Database client removed from pool');
});

// DÉSACTIVÉ: Fonction de vérification des tables (causait des timeouts en production)
// La vérification sera faite uniquement si nécessaire via des requêtes normales
console.log('ℹ️ Table verification disabled to prevent connection timeouts');

// Fonction utilitaire pour déterminer l'URL de l'application
function getAppBaseUrl(req = null) {
    // 1. Priorité: Variable d'environnement explicite
    if (process.env.APP_URL) {
        return process.env.APP_URL;
    }
    
    // 2. Variable Render automatique
    if (process.env.RENDER_EXTERNAL_URL) {
        return process.env.RENDER_EXTERNAL_URL;
    }
    
    // 3. Si on a une requête HTTP, construire l'URL dynamiquement
    if (req && req.get) {
        const protocol = req.get('x-forwarded-proto') || req.protocol || 'https';
        const host = req.get('host');
        if (host) {
            return `${protocol}://${host}`;
        }
    }
    
    // 4. Environnement de production sans variables définies
    if (process.env.NODE_ENV === 'production' || process.env.RENDER) {
        console.warn('⚠️ WARNING: No APP_URL defined and no request context available!');
        return `https://${process.env.RENDER_SERVICE_NAME || 'your-app'}.onrender.com`;
    }
    
    // 5. Développement local
    return `http://localhost:${process.env.PORT || 3000}`;
}

// Configuration de multer pour l'upload de fichiers
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = './uploads';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        // Générer un nom unique pour éviter les conflits
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const extension = path.extname(file.originalname);
        cb(null, file.fieldname + '-' + uniqueSuffix + extension);
    }
});

const fileFilter = (req, file, cb) => {
    console.log('File upload attempt:', {
        originalname: file.originalname,
        mimetype: file.mimetype,
        fieldname: file.fieldname
    });

    // Si c'est une justification de dépense, autoriser les images
    if (file.fieldname === 'justification') {
        const allowedImageTypes = [
            'image/jpeg',
            'image/jpg', 
            'image/png',
            'image/gif',
            'image/webp',
            'application/pdf' // Aussi autoriser les PDF pour les justifications
        ];
        
        if (allowedImageTypes.includes(file.mimetype)) {
            console.log('Accepting justification file:', file.mimetype, file.originalname);
            cb(null, true);
            return;
        } else {
            console.log('Rejecting justification file:', file.mimetype);
            cb(new Error('Format de justification invalide. Images (JPEG, PNG, GIF, WebP) et PDF acceptés.'), false);
            return;
        }
    }

    // Pour les autres types de téléchargements (import de données), garder JSON uniquement
    
    // Allow JSON files by extension
    if (file.originalname.toLowerCase().endsWith('.json')) {
        console.log('Accepting JSON file:', file.originalname);
        cb(null, true);
        return;
    }

    // Types de fichiers autorisés par mimetype pour les données
    const allowedDataTypes = [
        'application/json', 
        'text/json',
        'application/octet-stream' // Allow binary stream for Windows curl
    ];
    
    if (allowedDataTypes.includes(file.mimetype)) {
        console.log('Accepting data file by mimetype:', file.mimetype);
        cb(null, true);
    } else {
        console.log('Rejecting data file:', file.mimetype);
        cb(new Error('Format de fichier invalide. Seuls les fichiers JSON sont acceptés pour l\'import de données.'), false);
    }
};

const upload = multer({ 
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB max
    }
});

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use('/uploads', express.static('uploads')); // Servir les fichiers uploadés

// Configuration des sessions
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key-here-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false, // Set to false for now to fix session issues on Render
        maxAge: 24 * 60 * 60 * 1000,
        httpOnly: true,
        sameSite: 'lax' // Changed from 'strict' to 'lax' for better compatibility
    } // 24 heures
}));

// Middleware d'authentification
const requireAuth = (req, res, next) => {
    // Vérifier d'abord si une clé API est fournie (from headers only, not query string)
    const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
    
    if (apiKey) {
        // Authentification par clé API avec timing-safe comparison
        if (!process.env.API_KEY) {
            return res.status(500).json({ error: 'Configuration serveur invalide: API_KEY manquante' });
        }
        
        try {
            const apiKeyBuffer = Buffer.from(apiKey, 'utf8');
            const envKeyBuffer = Buffer.from(process.env.API_KEY, 'utf8');
            
            // Check length first to avoid timingSafeEqual error
            if (apiKeyBuffer.length !== envKeyBuffer.length) {
                return res.status(403).json({ error: 'Clé API invalide' });
            }
            
            if (crypto.timingSafeEqual(apiKeyBuffer, envKeyBuffer)) {
                // Créer un objet user factice pour les routes qui en ont besoin
                req.user = { username: 'API', role: 'admin' };
                return next();
            }
        } catch (error) {
            console.error('Erreur comparaison API key:', error);
            return res.status(403).json({ error: 'Clé API invalide' });
        }
        return res.status(403).json({ error: 'Clé API invalide' });
    }
    
    // Sinon, vérifier la session
    if (req.session.user) {
        next();
    } else {
        res.status(401).json({ error: 'Non autorisé' });
    }
};

// Middleware pour bloquer les opérations d'écriture pour le rôle comptable
const requireWriteAccess = (req, res, next) => {
    if (req.session.user && req.session.user.role === 'comptable') {
        console.log('❌ WRITE ACCESS: Accès refusé pour comptable:', req.session.user.username);
        return res.status(403).json({ 
            error: 'Accès refusé - Le rôle Comptable est en lecture seule' 
        });
    }
    next();
};

const requireAdminAuth = (req, res, next) => {
    console.log('🔐 SERVER: requireAdminAuth appelé pour:', req.method, req.path);
    
    // Debug: Log all headers and query params
    console.log('🔍 DEBUG: Headers x-api-key:', req.headers['x-api-key']);
    console.log('🔍 DEBUG: Headers authorization:', req.headers['authorization']);
    console.log('🔍 DEBUG: Query api_key:', req.query.api_key);
    
    // Vérifier d'abord si une clé API est fournie
    const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '') || req.query.api_key;
    
    console.log('🔍 DEBUG: API Key extracted:', apiKey ? 'YES' : 'NO');
    if (apiKey) {
        console.log('🔍 DEBUG: API Key value:', apiKey.substring(0, 8) + '...');
    }
    
    if (apiKey) {
        // Authentification par clé API
        const validApiKey = process.env.API_KEY || '4f8d9a2b6c7e8f1a3b5c9d0e2f4g6h7i';
        console.log('🔍 DEBUG: Valid API Key:', validApiKey.substring(0, 8) + '...');
        console.log('🔍 DEBUG: API Keys match:', apiKey === validApiKey);
        
        if (apiKey === validApiKey) {
            // Créer un utilisateur virtuel admin pour l'API
            req.session = req.session || {};
            req.session.user = {
                id: 0,
                username: 'api_user',
                role: 'admin',
                full_name: 'API User'
            };
            req.user = req.session.user; // Pour les logs
            console.log('🔑 SERVER: Authentification par clé API réussie');
            return next();
        } else {
            console.log('❌ SERVER: Clé API invalide fournie:', apiKey.substring(0, 8) + '...');
            return res.status(401).json({ error: 'Clé API invalide' });
        }
    }
    
    // Authentification par session (existante)
    console.log('🔐 SERVER: Session user:', req.session?.user);
    console.log('🔐 SERVER: User role:', req.session?.user?.role);
    
    if (req.session?.user && (['directeur_general', 'pca', 'admin'].includes(req.session.user.role))) {
        console.log('✅ SERVER: Authentification par session réussie pour:', req.session.user.username);
        req.user = req.session.user; // Ajouter l'utilisateur à req pour les logs
        return next();
    } else {
        console.log('❌ SERVER: Accès refusé - Privilèges insuffisants');
        console.log('❌ SERVER: User présent:', !!req.session?.user);
        console.log('❌ SERVER: Role présent:', req.session?.user?.role);
        console.log('❌ SERVER: Roles autorisés:', ['directeur_general', 'pca', 'admin']);
        console.log('❌ SERVER: Role match:', req.session?.user ? ['directeur_general', 'pca', 'admin'].includes(req.session.user.role) : false);
        return res.status(403).json({ error: 'Accès refusé - Privilèges insuffisants' });
    }
};

// Middleware d'authentification stricte pour les utilisateurs ADMIN uniquement
const requireSuperAdminOnly = (req, res, next) => {
    console.log('🔐 SERVER: requireSuperAdminOnly appelé pour:', req.method, req.path);
    
    // Vérifier d'abord si une clé API est fournie
    const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '') || req.query.api_key;
    
    if (apiKey) {
        // Authentification par clé API (considérée comme admin)
        const validApiKey = process.env.API_KEY || '4f8d9a2b6c7e8f1a3b5c9d0e2f4g6h7i';
        
        if (apiKey === validApiKey) {
            req.session = req.session || {};
            req.session.user = {
                id: 0,
                username: 'api_user',
                role: 'admin',
                full_name: 'API User'
            };
            req.user = req.session.user;
            console.log('🔑 SERVER: Authentification API pour Super Admin réussie');
            return next();
        } else {
            return res.status(401).json({ error: 'Clé API invalide' });
        }
    }
    
    // Authentification par session - ADMIN UNIQUEMENT
    console.log('🔐 SERVER: Session user:', req.session?.user);
    console.log('🔐 SERVER: User role:', req.session?.user?.role);
    
    if (req.session?.user && req.session.user.role === 'admin') {
        console.log('✅ SERVER: Authentification Super Admin réussie pour:', req.session.user.username);
        req.user = req.session.user;
        return next();
    } else {
        console.log('❌ SERVER: Accès refusé - Seuls les utilisateurs ADMIN sont autorisés');
        return res.status(403).json({ error: 'Accès refusé - Privilèges Super Admin requis (rôle admin uniquement)' });
    }
};

// Middleware pour DG/PCA uniquement
function requireSuperAdmin(req, res, next) {
    if (!req.session.user || !['directeur_general', 'pca', 'admin'].includes(req.session.user.role)) {
        return res.status(403).json({ error: 'Accès refusé' });
    }
    next();
}

// Routes d'authentification
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        const result = await pool.query(
            'SELECT * FROM users WHERE username = $1',
            [username]
        );
        
        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Nom d\'utilisateur ou mot de passe incorrect' });
        }
        
        const user = result.rows[0];
        const validPassword = await bcrypt.compare(password, user.password_hash);
        
        if (!validPassword) {
            return res.status(401).json({ error: 'Nom d\'utilisateur ou mot de passe incorrect' });
        }
        
        req.session.user = {
            id: user.id,
            username: user.username,
            role: user.role,
            full_name: user.full_name
        };
        
        res.json({ 
            message: 'Connexion réussie',
            user: req.session.user
        });
    } catch (error) {
        console.error('Erreur de connexion:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.post('/api/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ error: 'Erreur lors de la déconnexion' });
        }
        res.json({ message: 'Déconnexion réussie' });
    });
});

// Route pour vérifier la session (utilisée au chargement de la page)
app.get('/api/check-session', (req, res) => {
    if (req.session?.user) {
        res.json({ 
            success: true,
            user: {
                id: req.session.user.id,
                username: req.session.user.username,
                full_name: req.session.user.full_name,
                role: req.session.user.role
            }
        });
    } else {
        res.status(401).json({ 
            success: false,
            message: 'No active session' 
        });
    }
});

app.get('/api/user', requireAuth, (req, res) => {
    res.json(req.session.user);
});

// Route pour servir les catégories de configuration
app.get('/api/categories-config', (req, res) => {
    try {
        const categoriesConfig = require('./categories_config.json');
        res.json(categoriesConfig);
    } catch (error) {
        console.error('Erreur lecture categories_config.json:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Routes pour les comptes (remplace les portefeuilles)
app.post('/api/accounts/credit', requireAuth, async (req, res) => {
    try {
        const { account_id, amount, description, credit_date } = req.body;
        const credited_by = req.session.user.id;
        const finalCreditDate = credit_date || new Date().toISOString().split('T')[0];
        
        // Vérifier que le compte existe et est actif
        const accountResult = await pool.query(
            'SELECT a.*, u.full_name as user_name FROM accounts a LEFT JOIN users u ON a.user_id = u.id WHERE a.id = $1 AND a.is_active = true',
            [account_id]
        );
        
        if (accountResult.rows.length === 0) {
            return res.status(404).json({ error: 'Compte non trouvé ou inactif' });
        }
        
        const account = accountResult.rows[0];
        
        await pool.query('BEGIN');
        
        // Vérification des permissions simplifiée
        const userRole = req.session.user.role;
        let canCredit = false;
        
        if (userRole === 'directeur_general' || userRole === 'pca') {
            // DG et PCA peuvent créditer tous les comptes
            canCredit = true;
        } else if (userRole === 'directeur') {
            // Directeurs peuvent créditer leurs propres comptes
            if (account.user_id === credited_by) {
                canCredit = true;
            }
        }
        
        if (!canCredit) {
            await pool.query('ROLLBACK');
            return res.status(403).json({ error: 'Vous n\'êtes pas autorisé à créditer ce compte' });
        }
        
        // Mise à jour directe du compte selon le type
        if (account.account_type === 'statut') {
            // Pour les comptes statut, écraser le total_credited
            await pool.query(
                'UPDATE accounts SET total_credited = $1, current_balance = $1 - total_spent, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
                [parseInt(amount), account_id]
            );
        } else {
            // Pour les comptes classiques, ajouter au total_credited
            await pool.query(
                'UPDATE accounts SET total_credited = total_credited + $1, current_balance = current_balance + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
                [parseInt(amount), account_id]
            );
        }
        
        // Enregistrer dans l'historique de crédit
        await pool.query(
            'INSERT INTO credit_history (account_id, credited_by, amount, description) VALUES ($1, $2, $3, $4)',
            [account_id, credited_by, parseInt(amount), description || 'Crédit de compte']
        );
        
        await pool.query('COMMIT');
        
        const message = account.account_type === 'statut' 
            ? 'Compte statut mis à jour avec succès (solde écrasé)' 
            : 'Compte crédité avec succès';
            
        res.json({ message, amount: parseInt(amount), account_type: account.account_type });
    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('Erreur crédit compte:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Routes pour les dépenses (modifiées pour utiliser les comptes, le système hiérarchique et les fichiers)
app.post('/api/expenses', requireAuth, requireWriteAccess, upload.single('justification'), async (req, res) => {
    try {
        console.log('🏷️ ===== DÉBUT AJOUT DÉPENSE =====');
        console.log('👤 Utilisateur:', req.session.user.username, '- Rôle:', req.session.user.role);
        console.log('📝 Body reçu:', JSON.stringify(req.body, null, 2));
        console.log('📎 Fichier uploadé:', req.file ? req.file.originalname : 'Aucun');
        
        const {
            account_id, expense_type, category, subcategory, social_network_detail,
            designation, supplier, quantity, unit_price, total, predictable,
            amount, description, expense_date, point_de_vente
        } = req.body;
        const user_id = req.session.user.id;
        
        console.log('💰 Paramètres extraits:');
        console.log('  - account_id:', account_id);
        console.log('  - expense_type:', expense_type);
        console.log('  - category:', category);
        console.log('  - designation:', designation);
        console.log('  - supplier:', supplier);
        console.log('  - quantity:', quantity);
        console.log('  - unit_price:', unit_price);
        console.log('  - total:', total);
        console.log('  - amount:', amount);
        console.log('  - expense_date:', expense_date);
        
        // Utiliser le total calculé comme montant principal
        const finalAmount = parseInt(total) || parseInt(amount) || 0;
        console.log('💵 Montant final calculé:', finalAmount);
        
        if (finalAmount <= 0) {
            console.log('❌ ERREUR 400: Montant invalide:', finalAmount);
            return res.status(400).json({ error: 'Le montant doit être supérieur à zéro' });
        }
        
        // Vérifier le solde du compte POUR TOUS LES UTILISATEURS
        console.log('🔍 Recherche du compte avec ID:', account_id);
        const accountResult = await pool.query(
            'SELECT current_balance, total_credited, account_name, user_id, COALESCE(account_type, \'classique\') as account_type FROM accounts WHERE id = $1 AND is_active = true',
            [account_id]
        );
        
        console.log('📊 Résultat requête compte:', accountResult.rows);
        
        if (accountResult.rows.length === 0) {
            console.log('❌ ERREUR 400: Compte non trouvé ou inactif pour ID:', account_id);
            return res.status(400).json({ error: 'Compte non trouvé ou inactif' });
        }
        
        const account = accountResult.rows[0];
        console.log('🏦 Compte trouvé:', {
            id: account_id,
            name: account.account_name,
            type: account.account_type,
            balance: account.current_balance,
            total_credited: account.total_credited,
            user_id: account.user_id
        });
        // Logique de validation automatique pour les comptes classiques
    let requiresValidation = true;
    let validationStatus = 'pending';
    if (account.account_type === 'classique') {
        requiresValidation = false;
        validationStatus = 'fully_validated';
        console.log('✅ Validation automatique: Compte classique. Statut mis à "approved".');
    } else {
        console.log('⏳ Dépense nécessite une validation manuelle.');
    }
        
        // Vérifier l'autorisation pour les directeurs
        if (req.session.user.role === 'directeur' && account.user_id !== user_id) {
            console.log('❌ ERREUR 403: Directeur ne peut pas dépenser sur ce compte');
            return res.status(403).json({ error: 'Vous ne pouvez pas dépenser sur ce compte' });
        }
        
        // EXCEPTION POUR LES COMPTES STATUT : PAS DE VALIDATION DE SOLDE
        if (account.account_type === 'statut') {
            console.log('✅ COMPTE STATUT: Validation du solde désactivée pour compte:', account.account_name);
        } else {
            // Lire la configuration pour savoir si la validation est activée
            const financialConfig = getFinancialConfig();
            const validateBalance = financialConfig.validate_expense_balance;
            
            console.log('💰 Vérification du solde pour compte classique');
            console.log('  - Solde actuel:', account.current_balance);
            console.log('  - Montant demandé:', finalAmount);
            console.log('  - Validation activée:', validateBalance);
            
            if (validateBalance) {
                const currentBalance = account.current_balance;
                
                // Vérification du solde disponible
                if (currentBalance < finalAmount) {
                    console.log('❌ ERREUR 400: Solde insuffisant');
                    return res.status(400).json({ 
                        error: `Solde insuffisant. Solde disponible: ${currentBalance.toLocaleString()} FCFA, Montant demandé: ${finalAmount.toLocaleString()} FCFA` 
                    });
                }
                
                // Vérification supplémentaire : le total des dépenses ne doit pas dépasser le total crédité
                // Cette validation s'applique SEULEMENT aux comptes statut, pas aux comptes classiques
                // qui peuvent recevoir des transferts (ce qui créerait une incohérence)
                if (account.total_credited > 0 && account.account_type === 'statut') {
                    console.log('💳 Vérification du budget total crédité (compte statut)');
                    const totalSpentAfter = await pool.query(
                        'SELECT COALESCE(SUM(total), 0) as total_spent FROM expenses WHERE account_id = $1',
                        [account_id]
                    );
                    
                    const currentTotalSpent = parseInt(totalSpentAfter.rows[0].total_spent);
                    const newTotalSpent = currentTotalSpent + finalAmount;
                    
                    console.log('  - Budget total:', account.total_credited);
                    console.log('  - Déjà dépensé:', currentTotalSpent);
                    console.log('  - Nouveau total après dépense:', newTotalSpent);
                    
                    if (newTotalSpent > account.total_credited) {
                        console.log('❌ ERREUR 400: Dépassement du budget total');
                        return res.status(400).json({ 
                            error: `Cette dépense dépasserait le budget total. Budget total: ${account.total_credited.toLocaleString()} FCFA, Déjà dépensé: ${currentTotalSpent.toLocaleString()} FCFA, Nouveau montant: ${finalAmount.toLocaleString()} FCFA` 
                        });
                    }
                } else if (account.account_type === 'classique') {
                    console.log('⚡ Validation du budget total ignorée pour compte classique (peut recevoir des transferts)');
                }
                
                console.log('✅ Validation des soldes passée avec succès');
            } else {
                console.log('⚠️ Validation des soldes désactivée par configuration');
            }
        }
        
        console.log('🚀 Début de la transaction pour ajouter la dépense');
        await pool.query('BEGIN');
        
        // Gérer le fichier uploadé
        let justificationFilename = null;
        let justificationPath = null;
        if (req.file) {
            justificationFilename = req.file.originalname;
            justificationPath = req.file.path;
            console.log('📎 Fichier justificatif:', justificationFilename);
        }
        
        console.log('📝 Préparation des données pour insertion:');
        const insertParams = [
            user_id, account_id, expense_type, category, subcategory, social_network_detail,
            designation, supplier, parseFloat(quantity) || null, parseInt(unit_price) || null, parseInt(total) || null, predictable,
            justificationFilename, justificationPath,
            finalAmount, description, expense_date, false, // selected_for_invoice
            requiresValidation, validationStatus,
            point_de_vente || null
        ];
        console.log('📋 Paramètres d\'insertion:', insertParams);
        
        // Insérer la dépense avec tous les nouveaux champs
        const expenseResult = await pool.query(`
            INSERT INTO expenses (
        user_id, account_id, expense_type, category, subcategory, social_network_detail,
        designation, supplier, quantity, unit_price, total, predictable,
        justification_filename, justification_path,
        amount, description, expense_date, selected_for_invoice,
        requires_validation, validation_status, point_de_vente
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
    RETURNING *`,
            insertParams
        );
        
        console.log('✅ Dépense insérée avec succès, ID:', expenseResult.rows[0].id);
        
        // Déduire du solde du compte POUR TOUS LES UTILISATEURS
        console.log('💳 Mise à jour du solde du compte');
        await pool.query(
            'UPDATE accounts SET current_balance = current_balance - $1, total_spent = total_spent + $1 WHERE id = $2',
            [finalAmount, account_id]
        );
        
        console.log('💾 Validation de la transaction');
        await pool.query('COMMIT');
        
        // Déclencher la synchronisation automatique si c'est un compte classique
        await triggerAutoSyncIfNeeded(account_id, 'ajout de dépense');
        
        console.log('🎉 SUCCÈS: Dépense ajoutée avec succès');
        res.json(expenseResult.rows[0]);
    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('💥 ERREUR CRITIQUE dans ajout dépense:', error);
        console.error('💥 Message d\'erreur:', error.message);
        console.error('💥 Stack trace:', error.stack);
        
        // Supprimer le fichier en cas d'erreur
        if (req.file && fs.existsSync(req.file.path)) {
            console.log('🗑️ Suppression du fichier uploadé suite à l\'erreur');
            fs.unlinkSync(req.file.path);
        }
        
        console.log('❌ RETOUR ERREUR 500 au client');
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour récupérer les comptes
app.get('/api/accounts', requireAuth, async (req, res) => {
    try {
        console.log('Récupération des comptes pour utilisateur:', req.session.user.username, 'Role:', req.session.user.role);
        let query = `
            SELECT a.id, a.account_name, a.user_id, a.current_balance, a.total_credited, a.total_spent, a.transfert_entrants, a.transfert_sortants,
                   a.is_active, a.created_at, a.updated_at, 
                   COALESCE(a.account_type, 'classique') as account_type,
                   a.category_type, a.access_restricted, a.allowed_roles, a.created_by,
                   u.full_name as user_name, u.username
            FROM accounts a
            LEFT JOIN users u ON a.user_id = u.id
            WHERE 1=1
        `;
        let params = [];
        if (req.session.user.role === 'directeur') {
            query += ' AND a.is_active = true AND a.user_id = $1';
            params.push(req.session.user.id);
        } else if (req.session.user.role === 'directeur_general' || req.session.user.role === 'pca' || req.session.user.role === 'admin') {
            // Les admins voient tous les comptes (actifs et inactifs)
        } else {
            query += ' AND a.is_active = true AND (a.access_restricted = false OR a.access_restricted IS NULL OR a.account_type = \'Ajustement\')';
        }
        query += ' ORDER BY COALESCE(a.account_type, \'classique\'), a.account_name';
        console.log('Requête SQL:', query);
        console.log('Paramètres:', params);
        const result = await pool.query(query, params);
        console.log('Comptes trouvés:', result.rows.length);
        // Retourner les comptes sans recalcul dynamique
        res.json(result.rows);
    } catch (error) {
        console.error('Erreur récupération comptes:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route spécifique pour les comptes disponibles pour le crédit
app.get('/api/accounts/for-credit', requireAdminAuth, async (req, res) => {
    try {
        const query = `
            SELECT a.id, a.account_name, COALESCE(a.account_type, 'classique') as account_type,
                   a.current_balance, a.total_credited, u.full_name as user_name
            FROM accounts a
            LEFT JOIN users u ON a.user_id = u.id
            WHERE a.is_active = true
            ORDER BY COALESCE(a.account_type, 'classique'), a.account_name
        `;
        
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (error) {
        console.error('Erreur récupération comptes pour crédit:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour récupérer les informations d'un compte spécifique avec son solde
app.get('/api/accounts/:accountId/balance', requireAuth, async (req, res) => {
    try {
        const accountId = parseInt(req.params.accountId);
        
        const query = `
            SELECT a.id, a.account_name, COALESCE(a.account_type, 'classique') as account_type,
                   a.current_balance, a.total_credited, u.full_name as user_name
            FROM accounts a
            LEFT JOIN users u ON a.user_id = u.id
            WHERE a.id = $1 AND a.is_active = true
        `;
        
        const result = await pool.query(query, [accountId]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Compte non trouvé' });
        }
        
        const account = result.rows[0];
        
        console.log('💰 API: Informations compte récupérées pour ID', accountId);
        console.log('  - Nom:', account.account_name);
        console.log('  - Type:', account.account_type);
        console.log('  - Solde actuel:', account.current_balance);
        console.log('  - Total crédité:', account.total_credited);
        
        res.json(account);
    } catch (error) {
        console.error('Erreur récupération compte par ID:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour l'historique des crédits avec pagination et filtres
app.get('/api/credit-history', requireAdminAuth, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const offset = (page - 1) * limit;
        const accountFilter = req.query.account || '';
        const typeFilter = req.query.type || '';
        
        console.log('🔍 API: Filtres reçus:', { accountFilter, typeFilter, page, limit, offset });
        
        // Requête simple avec filtres
        let whereConditions = [];
        let queryParams = [];
        let paramIndex = 1;
        
        if (accountFilter) {
            whereConditions.push(`account_name = $${paramIndex++}`);
            queryParams.push(accountFilter);
        }
        
        if (typeFilter) {
            whereConditions.push(`type_operation = $${paramIndex++}`);
            queryParams.push(typeFilter);
        }
        
        const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';
        
        // Requête unifiée simple
        const query = `
            SELECT 
                id, created_at, amount, description, account_name, credited_by_name,
                source_table, type_operation, account_id
            FROM (
                SELECT 
                    ch.id, ch.created_at, ch.amount, ch.description,
                    a.account_name, u.full_name as credited_by_name,
                    'credit_history' as source_table, 'CRÉDIT RÉGULIER' as type_operation,
                    ch.account_id
                FROM credit_history ch
                JOIN accounts a ON ch.account_id = a.id
                JOIN users u ON ch.credited_by = u.id
                
                UNION ALL
                
                SELECT 
                    sch.id, sch.created_at, sch.amount, sch.comment as description,
                    a.account_name, u.full_name as credited_by_name,
                    'special_credit_history' as source_table,
                    CASE WHEN sch.is_balance_override THEN 'CRÉDIT STATUT' ELSE 'CRÉDIT SPÉCIAL' END as type_operation,
                    sch.account_id
                FROM special_credit_history sch
                JOIN accounts a ON sch.account_id = a.id
                JOIN users u ON sch.credited_by = u.id
                
                UNION ALL
                
                SELECT 
                    co.id, co.created_at, co.amount, co.description,
                    a.account_name, u.full_name as credited_by_name,
                    'creance_operations' as source_table,
                    CASE WHEN co.operation_type = 'credit' THEN 'CRÉDIT CRÉANCE' ELSE 'DÉBIT CRÉANCE' END as type_operation,
                    cc.account_id
                FROM creance_operations co
                JOIN creance_clients cc ON co.client_id = cc.id
                JOIN accounts a ON cc.account_id = a.id
                JOIN users u ON co.created_by = u.id
                WHERE co.operation_type = 'credit'
            ) all_credits
            ${whereClause}
            ORDER BY created_at DESC
            LIMIT $${paramIndex++} OFFSET $${paramIndex}
        `;
        
        const finalParams = [...queryParams, limit, offset];
        console.log('🔍 API: Requête finale:', query);
        console.log('🔍 API: Paramètres:', finalParams);
        
        const result = await pool.query(query, finalParams);
        
        res.json({
            credits: result.rows,
            pagination: {
                page,
                limit,
                total: result.rows.length, // Simplifié pour l'instant
                totalPages: Math.ceil(result.rows.length / limit),
                hasNext: result.rows.length === limit,
                hasPrev: page > 1
            }
        });
    } catch (error) {
        console.error('Erreur récupération historique crédits:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour supprimer un crédit
app.delete('/api/credit-history/:id', requireAdminAuth, async (req, res) => {
    try {
        const creditId = req.params.id;
        const userId = req.session.user.id;
        const userRole = req.session.user.role;

        if (!['admin', 'directeur_general', 'pca'].includes(userRole)) {
            return res.status(403).json({ error: 'Accès non autorisé' });
        }

        console.log(`🔍 API: Suppression du crédit ${creditId} par ${req.session.user.username}`);

        // Chercher le crédit dans les trois tables
        let credit = null;
        let accountId = null;
        let sourceTable = null;

        // Chercher dans credit_history
        const creditHistoryResult = await pool.query(
            'SELECT ch.*, a.account_name FROM credit_history ch JOIN accounts a ON ch.account_id = a.id WHERE ch.id = $1',
            [creditId]
        );
        if (creditHistoryResult.rows.length > 0) {
            credit = creditHistoryResult.rows[0];
            accountId = credit.account_id;
            sourceTable = 'credit_history';
        }

        // Chercher dans special_credit_history
        if (!credit) {
            const specialCreditResult = await pool.query(
                'SELECT sch.*, a.account_name FROM special_credit_history sch JOIN accounts a ON sch.account_id = a.id WHERE sch.id = $1',
                [creditId]
            );
            if (specialCreditResult.rows.length > 0) {
                credit = specialCreditResult.rows[0];
                accountId = credit.account_id;
                sourceTable = 'special_credit_history';
            }
        }

        // Chercher dans creance_operations
        if (!credit) {
            const creanceResult = await pool.query(
                `SELECT co.*, a.account_name, cc.account_id
                 FROM creance_operations co
                 JOIN creance_clients cc ON co.client_id = cc.id
                 JOIN accounts a ON cc.account_id = a.id
                 WHERE co.id = $1 AND co.operation_type = 'credit'`,
                [creditId]
            );
            if (creanceResult.rows.length > 0) {
                credit = creanceResult.rows[0];
                accountId = credit.account_id;
                sourceTable = 'creance_operations';
            }
        }

        if (!credit) {
            return res.status(404).json({ error: 'Crédit non trouvé' });
        }

        const oldAmount = credit.amount;

        // Démarrer la transaction
        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');

            // Supprimer le crédit selon sa table source
            if (sourceTable === 'credit_history') {
                await client.query('DELETE FROM credit_history WHERE id = $1', [creditId]);
            } else if (sourceTable === 'special_credit_history') {
                await client.query('DELETE FROM special_credit_history WHERE id = $1', [creditId]);
            } else if (sourceTable === 'creance_operations') {
                await client.query('DELETE FROM creance_operations WHERE id = $1', [creditId]);
            }

            // Recalculer le solde du compte
            const accountStats = await client.query(`
                UPDATE accounts
                SET
                    total_credited = COALESCE((SELECT SUM(amount) FROM credit_history WHERE account_id = $1), 0) +
                                   COALESCE((SELECT SUM(amount) FROM special_credit_history WHERE account_id = $1), 0),
                    current_balance = COALESCE((SELECT SUM(amount) FROM credit_history WHERE account_id = $1), 0) +
                                    COALESCE((SELECT SUM(amount) FROM special_credit_history WHERE account_id = $1), 0) -
                                    COALESCE((SELECT SUM(total) FROM expenses WHERE account_id = $1), 0)
                WHERE id = $1
                RETURNING account_name, current_balance, total_credited
            `, [accountId]);

            await client.query('COMMIT');
            
            // Déclencher la synchronisation automatique si c'est un compte classique
            await triggerAutoSyncIfNeeded(accountId, 'suppression de crédit');

            console.log(`✅ API: Crédit ${creditId} supprimé par ${req.session.user.username}: ${formatCurrency(oldAmount)}`);

            res.json({
                success: true,
                message: `Crédit supprimé avec succès: ${formatCurrency(oldAmount)}`,
                account: accountStats.rows[0]
            });

        } catch (error) {
            await pool.query('ROLLBACK');
            throw error;
        }

    } catch (error) {
        console.error('❌ Erreur suppression crédit:', error);
        res.status(500).json({ error: 'Erreur serveur lors de la suppression' });
    }
});

// Route pour récupérer la liste des comptes pour le filtre
app.get('/api/credit-accounts', requireAdminAuth, async (req, res) => {
    try {
        console.log('🔍 API: Récupération des comptes avec crédits...');
        
        const result = await pool.query(`
            SELECT DISTINCT a.account_name, a.id
            FROM accounts a
            WHERE a.is_active = true 
            AND (
                EXISTS (SELECT 1 FROM credit_history ch WHERE ch.account_id = a.id)
                OR EXISTS (SELECT 1 FROM special_credit_history sch WHERE sch.account_id = a.id)
                OR EXISTS (
                    SELECT 1 FROM creance_operations co 
                    JOIN creance_clients cc ON co.client_id = cc.id 
                    WHERE cc.account_id = a.id AND co.operation_type = 'credit'
                )
            )
            ORDER BY a.account_name
        `);
        
        const accounts = result.rows.map(row => row.account_name);
        console.log(`✅ API: ${accounts.length} comptes trouvés:`, accounts);
        
        res.json(accounts);
    } catch (error) {
        console.error('❌ Erreur récupération comptes crédit:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour obtenir le solde d'un directeur
app.get('/api/account/balance', requireAuth, async (req, res) => {
    try {
        const user_id = req.session.user.id;
        
        if (req.session.user.role !== 'directeur') {
            return res.status(403).json({ error: 'Accès refusé' });
        }
        
        const result = await pool.query(
            'SELECT id, current_balance, total_credited, total_spent, transfert_entrants, transfert_sortants FROM accounts WHERE user_id = $1 AND is_active = true',
            [user_id]
        );
        
        if (result.rows.length === 0) {
            // Aucun compte actif trouvé
            res.json({ current_balance: 0, total_credited: 0, total_spent: 0 });
        } else {
            // Calculer les totaux pour tous les comptes du directeur
            let totalCredited = 0;
            let totalSpent = 0;
            let currentBalance = 0;
            
            for (const account of result.rows) {
                totalCredited += account.total_credited;
                
                // Calculer le total réellement dépensé pour ce compte
                const expensesResult = await pool.query(
                    'SELECT COALESCE(SUM(total), 0) as real_total_spent FROM expenses WHERE account_id = $1',
                    [account.id]
                );
                
                const accountSpent = parseInt(expensesResult.rows[0].real_total_spent) || 0;
                totalSpent += accountSpent;
                currentBalance += (account.total_credited - accountSpent);
            }
            
            res.json({
                current_balance: currentBalance,
                total_credited: totalCredited,
                total_spent: totalSpent
            });
        }
    } catch (error) {
        console.error('Erreur récupération solde:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour obtenir le solde d'un compte spécifique
app.get('/api/account/:accountId/balance', requireAuth, async (req, res) => {
    try {
        const { accountId } = req.params;
        const userRole = req.session.user.role;
        const userId = req.session.user.id;
        
        // Vérifications d'accès selon le rôle
        let accessQuery = 'SELECT id, current_balance, total_credited, total_spent, transfert_entrants, transfert_sortants FROM accounts WHERE id = $1 AND is_active = true';
        let accessParams = [accountId];
        
        if (userRole === 'directeur') {
            // Les directeurs ne peuvent voir que leurs propres comptes
            accessQuery += ' AND user_id = $2';
            accessParams.push(userId);
        }
        // DG, PCA et admin peuvent accéder à tous les comptes
        
        const result = await pool.query(accessQuery, accessParams);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Compte non trouvé ou accès refusé' });
        }
        
        const account = result.rows[0];
        
        // Calculer le total réellement dépensé pour ce compte
        const expensesResult = await pool.query(
            'SELECT COALESCE(SUM(total), 0) as real_total_spent FROM expenses WHERE account_id = $1',
            [accountId]
        );
        
        const realTotalSpent = parseInt(expensesResult.rows[0].real_total_spent) || 0;
        const currentBalance = account.total_credited - realTotalSpent;
        
        res.json({
            current_balance: currentBalance,
            total_credited: account.total_credited,
            total_spent: realTotalSpent
        });
        
    } catch (error) {
        console.error('Erreur récupération solde compte:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.get('/api/expenses', requireAuth, async (req, res) => {
    try {
        const user_id = req.session.user.id;
        const { start_date, end_date } = req.query;
        
        console.log('📋 GET EXPENSES: Début récupération des dépenses');
        console.log('📋 GET EXPENSES: Utilisateur:', req.session.user.username, 'Role:', req.session.user.role);
        console.log('📋 GET EXPENSES: Dates - Start:', start_date, 'End:', end_date);
        
        let query = `
            SELECT e.*, 
                   u.full_name as user_name, 
                   u.username, 
                   u.role as user_role, -- <<< CORRECTION APPLIQUÉE ICI
                   a.account_name,
                   e.expense_date as expense_date,
                   e.created_at as timestamp_creation,
                   CASE 
                       WHEN e.expense_type IS NOT NULL THEN 
                           CONCAT(e.expense_type, ' > ', e.category, ' > ', e.subcategory,
                                  CASE WHEN e.social_network_detail IS NOT NULL AND e.social_network_detail != '' 
                                       THEN CONCAT(' (', e.social_network_detail, ')') 
                                       ELSE '' END)
                       ELSE 'Catégorie non définie'
                   END as category_name,
                   CASE 
                       WHEN e.justification_filename IS NOT NULL THEN true 
                       ELSE false 
                   END as has_justification,
                   COALESCE(e.selected_for_invoice, false) as selected_for_invoice
            FROM expenses e
            JOIN users u ON e.user_id = u.id
            LEFT JOIN accounts a ON e.account_id = a.id
        `;
        let params = [];
        
        if (req.session.user.role === 'directeur') {
            query += ` WHERE (e.user_id = $1 OR (a.user_id = $1 AND e.user_id IN (
                SELECT id FROM users WHERE role IN ('directeur_general', 'pca', 'admin')
            )))`;
            params.push(user_id);
            console.log('📋 GET EXPENSES: Filtrage directeur appliqué pour UserID:', user_id);
        } else {
            query += ' WHERE 1=1';
            console.log('📋 GET EXPENSES: Aucun filtrage utilisateur (admin/DG/PCA/comptable)');
        }
        
        if (start_date) {
            params.push(start_date);
            query += ` AND e.expense_date >= $${params.length}`;
        }
        
        if (end_date) {
            params.push(end_date);
            query += ` AND e.expense_date <= $${params.length}`;
        }
        
        query += ' ORDER BY e.expense_date DESC, e.created_at DESC';
        
        const { rows } = await pool.query(query, params);


        // Correction pour les dépenses sans type
        rows.forEach(row => {
            if (!row.expense_type) {
                row.expense_type = 'Non Catégorisé';
            }
        });

        res.json(rows);
    } catch (error) {
        console.error('❌ GET EXPENSES: Erreur récupération dépenses:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});



// Routes pour les utilisateurs
app.get('/api/users', requireAdminAuth, async (req, res) => {
    try {
        let result;
        const role = req.session.user.role;
        if (['admin', 'directeur_general', 'pca'].includes(role)) {
            result = await pool.query('SELECT id, username, role, full_name FROM users ORDER BY username');
        } else {
            result = await pool.query('SELECT id, username, role, full_name FROM users WHERE role = $1 ORDER BY username', ['directeur']);
        }
        res.json(result.rows);
    } catch (error) {
        console.error('Erreur récupération utilisateurs:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});
// Routes pour le dashboard
app.get('/api/dashboard/stats', requireAuth, async (req, res) => {
    try {
        console.log('\n🚀 [CASH LOG] === DÉBUT API dashboard/stats ===');
        console.log('📅 [CASH LOG] Query params:', req.query);
        // Récupérer les paramètres de date depuis la query string
        const { start_date, end_date } = req.query;
        
        // Par défaut, utiliser aujourd'hui si aucune date n'est spécifiée
        const today = new Date().toISOString().split('T')[0];
        const startDate = start_date || today;
        const endDate = end_date || today;
        
        // Dates pour les statistiques fixes (aujourd'hui, semaine, mois)
        const monday = new Date();
        monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
        const week_start = monday.toISOString().split('T')[0];
        
        const firstDayOfMonth = new Date();
        firstDayOfMonth.setDate(1);
        const month_start = firstDayOfMonth.toISOString().split('T')[0];
        
        // Déterminer les filtres selon le rôle
        const isDirector = req.session.user.role === 'directeur';
        const userFilter = isDirector ? ` AND (e.user_id = $2 OR (EXISTS (
            SELECT 1 FROM accounts a WHERE a.id = e.account_id AND a.user_id = $2
        ) AND e.user_id IN (SELECT id FROM users WHERE role IN ('directeur_general', 'pca', 'admin'))))` : '';
        const userParam = isDirector ? [req.session.user.id] : [];
        
        // Cash burn du jour
        const dailyBurnQuery = `SELECT COALESCE(SUM(e.total), 0) as total FROM expenses e WHERE e.expense_date = $1${userFilter}`;
        const dailyBurn = await pool.query(dailyBurnQuery, [today, ...userParam]);
        
        // Cash burn depuis lundi
        const weeklyBurnQuery = `SELECT COALESCE(SUM(e.total), 0) as total FROM expenses e WHERE e.expense_date >= $1${userFilter}`;
        const weeklyBurn = await pool.query(weeklyBurnQuery, [week_start, ...userParam]);
        
        // Cash burn du mois
        const monthlyBurnQuery = `SELECT COALESCE(SUM(e.total), 0) as total FROM expenses e WHERE e.expense_date >= $1${userFilter}`;
        const monthlyBurn = await pool.query(monthlyBurnQuery, [month_start, ...userParam]);
        
        // Dépenses par compte (période sélectionnée) avec total crédité, sauf dépôts et partenaires
        // CALCUL DYNAMIQUE DU SOLDE À LA DATE SÉLECTIONNÉE
        let accountBurnQuery = `
            WITH monthly_credits AS (
                SELECT 
                    account_id,
                    SUM(credit_amount) as monthly_credits
                FROM (
                    -- Crédits réguliers
                    SELECT 
                        ch.account_id,
                        ch.amount as credit_amount
                    FROM credit_history ch
                    JOIN accounts a ON ch.account_id = a.id
                    WHERE ch.created_at >= $1 AND ch.created_at <= $2
                    AND a.account_type NOT IN ('depot', 'partenaire', 'creance')
                    
                    UNION ALL
                    
                    -- Crédits spéciaux : pour les comptes "statut", prendre seulement le dernier du mois
                    SELECT 
                        sch.account_id,
                        CASE 
                            WHEN a.account_type = 'statut' THEN
                                -- Pour les comptes statut, prendre seulement le dernier crédit du mois
                                CASE WHEN sch.created_at = (
                                    SELECT MAX(sch2.created_at) 
                                    FROM special_credit_history sch2 
                                    WHERE sch2.account_id = sch.account_id 
                                    AND sch2.credit_date >= $1 AND sch2.credit_date <= $2
                                ) THEN sch.amount ELSE 0 END
                            ELSE sch.amount
                        END as credit_amount
                    FROM special_credit_history sch
                    JOIN accounts a ON sch.account_id = a.id
                    WHERE sch.credit_date >= $1 AND sch.credit_date <= $2
                    AND a.account_type NOT IN ('depot', 'partenaire', 'creance')
                ) all_credits
                WHERE credit_amount > 0 OR (credit_amount < 0 AND EXISTS (
                    SELECT 1 FROM accounts a2 WHERE a2.id = account_id AND a2.account_type = 'statut'
                ))
                GROUP BY account_id
            ),
            monthly_transfers AS (
                SELECT 
                    a.id as account_id,
                    COALESCE(SUM(CASE 
                        WHEN th.source_id = a.id THEN -th.montant
                        WHEN th.destination_id = a.id THEN th.montant
                        ELSE 0
                    END), 0) as net_transfers
                FROM accounts a
                LEFT JOIN transfer_history th ON (th.source_id = a.id OR th.destination_id = a.id)
                    AND th.created_at >= $1 AND th.created_at < ($2::date + INTERVAL '1 day')
                GROUP BY a.id
            )
            SELECT 
                a.account_name as name,
                a.account_type,
                COALESCE(SUM(ABS(e.total)), 0) as spent,
                a.total_credited,
                a.current_balance,
                -- NOUVEAU CALCUL CORRECT selon le type de compte
                CASE a.account_type
                    WHEN 'statut' THEN
                        -- Pour STATUT : dernier crédit/transfert entrant REMPLACE, puis soustraction des sorties/dépenses
                        (
                            -- 1. Trouver le dernier montant entrant (crédit, special_credit, OU transfert entrant)
                            COALESCE((
                                SELECT montant FROM (
                                    -- Crédits normaux
                                    SELECT amount as montant, created_at as date_operation
                                    FROM credit_history 
                                    WHERE account_id = a.id 
                                        AND created_at <= ($2::date + INTERVAL '1 day')
                                    
                                    UNION ALL
                                    
                                    -- Snapshots / crédits spéciaux
                                    SELECT amount as montant, created_at as date_operation
                                    FROM special_credit_history 
                                    WHERE account_id = a.id 
                                        AND credit_date <= ($2::date + INTERVAL '1 day')
                                        AND is_balance_override = true
                                    
                                    UNION ALL
                                    
                                    -- Transferts ENTRANTS uniquement
                                    SELECT montant, created_at as date_operation
                                    FROM transfer_history
                                    WHERE destination_id = a.id
                                        AND created_at <= ($2::date + INTERVAL '1 day')
                                ) all_incoming
                                ORDER BY date_operation DESC
                                LIMIT 1
                            ), 0)
                            -
                            -- 2. Soustraire les transferts SORTANTS postérieurs au dernier entrant
                            COALESCE((
                                SELECT SUM(th.montant)
                                FROM transfer_history th
                                WHERE th.source_id = a.id
                                    AND th.created_at > COALESCE((
                                        SELECT date_operation FROM (
                                            SELECT created_at as date_operation
                                            FROM credit_history 
                                            WHERE account_id = a.id 
                                                AND created_at <= ($2::date + INTERVAL '1 day')
                                            
                                            UNION ALL
                                            
                                            SELECT created_at as date_operation
                                            FROM special_credit_history 
                                            WHERE account_id = a.id 
                                                AND credit_date <= ($2::date + INTERVAL '1 day')
                                                AND is_balance_override = true
                                            
                                            UNION ALL
                                            
                                            SELECT created_at as date_operation
                                            FROM transfer_history
                                            WHERE destination_id = a.id
                                                AND created_at <= ($2::date + INTERVAL '1 day')
                                        ) all_incoming
                                        ORDER BY date_operation DESC
                                        LIMIT 1
                                    ), '1900-01-01'::timestamp)
                                    AND th.created_at <= ($2::date + INTERVAL '1 day')
                            ), 0)
                            -
                            -- 3. Soustraire les dépenses postérieures au dernier entrant
                            COALESCE((
                                SELECT SUM(e2.total)
                                FROM expenses e2
                                WHERE e2.account_id = a.id
                                    AND e2.expense_date > COALESCE((
                                        SELECT date_operation::date FROM (
                                            SELECT created_at as date_operation
                                            FROM credit_history 
                                            WHERE account_id = a.id 
                                                AND created_at <= ($2::date + INTERVAL '1 day')
                                            
                                            UNION ALL
                                            
                                            SELECT created_at as date_operation
                                            FROM special_credit_history 
                                            WHERE account_id = a.id 
                                                AND credit_date <= ($2::date + INTERVAL '1 day')
                                                AND is_balance_override = true
                                            
                                            UNION ALL
                                            
                                            SELECT created_at as date_operation
                                            FROM transfer_history
                                            WHERE destination_id = a.id
                                                AND created_at <= ($2::date + INTERVAL '1 day')
                                        ) all_incoming
                                        ORDER BY date_operation DESC
                                        LIMIT 1
                                    ), '1900-01-01'::date)
                                    AND e2.expense_date <= ($2::date + INTERVAL '1 day')
                            ), 0)
                        )
                    
                    WHEN 'depot' THEN
                        -- Pour DEPOT : dernière transaction chronologique <= end_date (AVEC transferts inclus)
                        COALESCE((
                            SELECT balance FROM (
                                -- Calculer le cumul jusqu'à chaque transaction
                                SELECT 
                                    transaction_date,
                                    original_timestamp,
                                    record_id,
                                    SUM(amount) OVER (ORDER BY transaction_date, original_timestamp, record_id) as balance
                                FROM (
                                    SELECT amount, created_at::date as transaction_date, created_at as original_timestamp, id as record_id
                                    FROM credit_history 
                                    WHERE account_id = a.id AND created_at <= ($2::date + INTERVAL '1 day')
                                    
                                    UNION ALL
                                    
                                    SELECT amount, credit_date::date as transaction_date, credit_date as original_timestamp, id as record_id
                                    FROM special_credit_history 
                                    WHERE account_id = a.id AND credit_date <= ($2::date + INTERVAL '1 day')
                                    
                                    UNION ALL
                                    
                                    SELECT -total as amount, expense_date::date as transaction_date, expense_date as original_timestamp, id as record_id
                                    FROM expenses 
                                    WHERE account_id = a.id AND expense_date <= ($2::date + INTERVAL '1 day')
                                    
                                    UNION ALL
                                    
                                    SELECT 
                                        CASE 
                                            WHEN destination_id = a.id THEN montant 
                                            ELSE -montant 
                                        END as amount,
                                        created_at::date as transaction_date,
                                        created_at as original_timestamp,
                                        id as record_id
                                    FROM transfer_history
                                    WHERE (source_id = a.id OR destination_id = a.id) 
                                        AND created_at <= ($2::date + INTERVAL '1 day')
                                    
                                    UNION ALL
                                    
                                    SELECT montant as amount, ('2025-01-01')::DATE as transaction_date, ('2025-01-01')::timestamp as original_timestamp, 0 as record_id
                                    FROM montant_debut_mois 
                                    WHERE account_id = a.id
                                ) all_transactions
                            ) balances
                            ORDER BY transaction_date DESC, original_timestamp DESC, record_id DESC
                            LIMIT 1
                        ), 0)
                    
                    WHEN 'partenaire' THEN
                        -- Pour PARTENAIRE : total_credited - livraisons validées <= end_date
                        (a.total_credited - COALESCE(
                            (SELECT SUM(pd.amount) 
                             FROM partner_deliveries pd 
                             WHERE pd.account_id = a.id 
                             AND pd.validation_status = 'fully_validated' 
                             AND pd.is_validated = true
                             AND pd.delivery_date <= $2), 0))
                    
                    ELSE
                        -- Pour CLASSIQUE et autres : cumul complet <= end_date
                        (COALESCE((SELECT SUM(ch.amount) FROM credit_history ch WHERE ch.account_id = a.id AND ch.created_at <= $2), 0) +
                         COALESCE((SELECT SUM(sch.amount) FROM special_credit_history sch WHERE sch.account_id = a.id AND sch.credit_date <= $2), 0) -
                         COALESCE((SELECT SUM(e2.total) FROM expenses e2 WHERE e2.account_id = a.id AND e2.expense_date <= $2), 0) +
                         COALESCE((SELECT SUM(CASE WHEN th.destination_id = a.id THEN th.montant ELSE -th.montant END) 
                                  FROM transfer_history th 
                                  WHERE (th.source_id = a.id OR th.destination_id = a.id) AND th.created_at <= ($2::date + INTERVAL '1 day')), 0) +
                         COALESCE((SELECT montant FROM montant_debut_mois WHERE account_id = a.id), 0))
                END as balance_at_end_date,
                COALESCE(mc.monthly_credits, 0) as monthly_credits,
                COALESCE(mt.net_transfers, 0) as net_transfers,
                COALESCE(mdm.montant, 0) as montant_debut_mois
            FROM accounts a
            LEFT JOIN users u ON a.user_id = u.id
            LEFT JOIN expenses e ON a.id = e.account_id 
                AND e.expense_date >= $1 AND e.expense_date <= $2
            LEFT JOIN monthly_credits mc ON a.id = mc.account_id
            LEFT JOIN monthly_transfers mt ON a.id = mt.account_id
            LEFT JOIN montant_debut_mois mdm ON a.id = mdm.account_id 
                AND mdm.year = EXTRACT(YEAR FROM DATE($1))
                AND mdm.month = EXTRACT(MONTH FROM DATE($1))
            WHERE a.is_active = true AND a.account_type NOT IN ('depot', 'partenaire', 'creance')`;
        
        let accountParams = [startDate, endDate];
        
        console.log('\n🔍 PARAMÈTRES DE LA REQUÊTE:');
        console.log(`📅 Période: du ${startDate} au ${endDate}`);
        
        if (isDirector) {
            accountBurnQuery += ' AND a.user_id = $3';
            accountParams.push(req.session.user.id);
            console.log(`👤 Filtré pour le directeur ID: ${req.session.user.id}`);
        }
        
        accountBurnQuery += `
            GROUP BY a.id, a.account_name, a.account_type, a.total_credited, a.current_balance, mc.monthly_credits, mt.net_transfers, mdm.montant
            ORDER BY spent DESC`;
            
        console.log('\n📝 REQUÊTE SQL COMPLÈTE:');
        console.log(accountBurnQuery);
        console.log('📊 PARAMÈTRES:', accountParams);
        
        const accountBurn = await pool.query(accountBurnQuery, accountParams);
        
        // 🔍 LOG: Résultats de la requête principale
        console.log('\n🔍 [CASH LOG] Requête accountBurnQuery exécutée');
        console.log(`📊 [CASH LOG] ${accountBurn.rows.length} comptes trouvés`);
        console.log('📅 [CASH LOG] Période:', startDate, 'à', endDate);
        
        // Dépenses par sous-catégorie (période sélectionnée) - utilise le nouveau système hiérarchique
        let categoryBurnQuery = `
            SELECT 
                CASE 
                    WHEN e.subcategory IS NOT NULL AND e.subcategory != '' THEN 
                        CONCAT(COALESCE(e.expense_type, 'Non défini'), ' > ', COALESCE(e.category, 'Non défini'), ' > ', e.subcategory)
                    WHEN e.category IS NOT NULL AND e.category != '' THEN 
                        CONCAT(COALESCE(e.expense_type, 'Non défini'), ' > ', e.category)
                    WHEN e.expense_type IS NOT NULL AND e.expense_type != '' THEN 
                        e.expense_type
                    ELSE 'Non catégorisé'
                END as name,
                COALESCE(SUM(COALESCE(e.total, e.amount::integer, 0)), 0) as total
            FROM expenses e
            WHERE e.expense_date >= $1 AND e.expense_date <= $2`;
        
        let categoryParams = [startDate, endDate];
        
        if (isDirector) {
            categoryBurnQuery += ` AND (e.user_id = $3 OR (EXISTS (
                SELECT 1 FROM accounts a WHERE a.id = e.account_id AND a.user_id = $3
            ) AND e.user_id IN (SELECT id FROM users WHERE role IN ('directeur_general', 'pca', 'admin'))))`;
            categoryParams.push(req.session.user.id);
        }
        
        categoryBurnQuery += `
            GROUP BY e.expense_type, e.category, e.subcategory
            HAVING COALESCE(SUM(COALESCE(e.total, e.amount::integer, 0)), 0) > 0
            ORDER BY total DESC`;
        
        const categoryBurn = await pool.query(categoryBurnQuery, categoryParams);
        

        
        // 🔍 LOG: Réponse finale de l'API - APRÈS création account_breakdown
        console.log('\n💰 [CASH LOG] === RÉSULTAT FINAL API dashboard/stats ===');
        console.log(`📊 [CASH LOG] Nombre de comptes trouvés: ${accountBurn.rows.length}`);
        
        // Calculer le cash comme le fait le frontend (sur les données SQL directes)
        let calculatedCash = 0;
        accountBurn.rows.forEach(row => {
            const name = row.name.toLowerCase();
            if (name.includes('partenaire') ||
                name.includes('depot') ||
                name.includes('creance') ||
                name.includes('fournisseur')) {
                return; // Ignore ces comptes
            }
            // INCLUT: classique, statut, ajustement
            
            const balance = parseInt(row.balance_at_end_date || 0);
            if (!isNaN(balance)) {
                calculatedCash += balance;
                
                console.log(`🏦 [CASH LOG] ${row.name} (${row.account_type}): ${balance.toLocaleString()} FCFA`);
            }
        });
        
        console.log(`💰 [CASH LOG] CASH DISPONIBLE CALCULÉ: ${calculatedCash.toLocaleString()} FCFA`);
        if (calculatedCash === -4224960) {
            console.log('❌ [CASH LOG] PROBLÈME: Utilise encore l\'ancienne logique !');
        } else if (calculatedCash === -4385360) {
            console.log('✅ [CASH LOG] SUCCÈS: Utilise la nouvelle logique !');
        } else {
            console.log(`🤔 [CASH LOG] VALEUR INATTENDUE: ${calculatedCash.toLocaleString()}`);
        }
        console.log('💰 [CASH LOG] === FIN RÉSULTAT ===\n');
        


        res.json({
            daily_burn: parseInt(dailyBurn.rows[0].total),
            weekly_burn: parseInt(weeklyBurn.rows[0].total),
            monthly_burn: parseInt(monthlyBurn.rows[0].total),
            account_breakdown: accountBurn.rows.map(row => {
                // 🔥 LOG UNIQUE POUR CONFIRMER LA VERSION CORRIGÉE
                console.log('🔥 SERVEUR VERSION CORRIGÉE - ACTIVE ! 🔥');
                
                // Logs détaillés pour chaque compte
                console.log(`\n📊 DÉTAILS COMPTE: ${row.name}`);
                console.log(`🏷️ Type de compte: ${row.account_type}`);
                console.log(`💰 Crédits du mois: ${row.monthly_credits || 0} FCFA`);
                console.log(`🔄 Transferts nets: ${row.net_transfers || 0} FCFA`);
                console.log(`💸 Dépenses du mois: ${row.spent || 0} FCFA`);
                console.log(`📅 Montant début de mois: ${row.montant_debut_mois || 0} FCFA`);
                
                const netTransfers = parseInt(row.net_transfers || 0);
                const montantDebutMois = parseInt(row.montant_debut_mois || 0);
                
                // Pour les comptes classiques, inclure le montant début de mois dans le calcul
                let monthlyBalance;
                if (row.account_type === 'classique') {
                    monthlyBalance = parseInt(row.monthly_credits || 0) - parseInt(row.spent || 0) + netTransfers + montantDebutMois;
                    console.log(`📈 Balance du mois calculée (avec montant début): ${monthlyBalance} FCFA`);
                    console.log(`   (${row.monthly_credits || 0} - ${row.spent || 0} + ${netTransfers} + ${montantDebutMois})`);
                } else {
                    monthlyBalance = parseInt(row.monthly_credits || 0) - parseInt(row.spent || 0) + netTransfers;
                    console.log(`📈 Balance du mois calculée (standard): ${monthlyBalance} FCFA`);
                    console.log(`   (${row.monthly_credits || 0} - ${row.spent || 0} + ${netTransfers})`);
                }
                console.log('----------------------------------------');

                // 🔍 LOG: Traitement d'un compte
                console.log(`🏦 [CASH LOG] Traitement compte: ${row.name} (${row.account_type})`);
                console.log(`   💰 [CASH LOG] balance_at_end_date: ${parseInt(row.balance_at_end_date || 0).toLocaleString()}`);
                console.log(`   📊 [CASH LOG] current_balance DB: ${parseInt(row.current_balance || 0).toLocaleString()}`);
                console.log(`   🔢 [CASH LOG] total_credited: ${parseInt(row.total_credited || 0).toLocaleString()}`);
                console.log(`   📉 [CASH LOG] spent: ${parseInt(row.spent || 0).toLocaleString()}`);

                return {
                account: row.name,
                account_type: row.account_type,
                spent: parseInt(row.spent),
                total_credited: parseInt(row.total_credited || 0),
                    current_balance: parseInt(row.balance_at_end_date || 0),
                    remaining: parseInt(row.balance_at_end_date || 0),
                    amount: parseInt(row.spent),
                                    monthly_credits: parseInt(row.monthly_credits || 0),
                net_transfers: parseInt(row.net_transfers || 0),
                montant_debut_mois: parseInt(row.montant_debut_mois || 0),
                monthly_balance: monthlyBalance
                };
            }),
            category_breakdown: categoryBurn.rows.map(row => ({
                category: row.name,
                amount: parseInt(row.total)
            })),
            period: {
                start_date: startDate,
                end_date: endDate
            }
        });
    } catch (error) {
        console.error('Erreur récupération stats dashboard:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour les cartes de statistiques du dashboard
app.get('/api/dashboard/stats-cards', requireAuth, async (req, res) => {
    console.log(`🚚 ===== ROUTE STATS-CARDS DÉMARRÉE =====`);
    try {
        const { start_date, end_date, cutoff_date } = req.query;
        const user = req.session?.user || req.user;
        const isDirector = user?.role === 'directeur';
        const userId = user?.id || null;
        
        console.log(`🚚 ===== ROUTE /api/dashboard/stats-cards APPELÉE =====`);
        console.log(`🚚 DEBUG - Paramètres reçus: start_date=${start_date}, end_date=${end_date}, cutoff_date=${cutoff_date}`);
        
        // Si cutoff_date est fourni, utiliser cette date comme référence pour tous les calculs
        // Sinon, utiliser la logique actuelle (date du jour)
        const referenceDate = cutoff_date ? new Date(cutoff_date) : new Date();
        const referenceDateStr = cutoff_date || new Date().toISOString().split('T')[0];
        
        console.log(`🔍 CALCUL AVEC DATE DE RÉFÉRENCE: ${referenceDateStr}`);
        
        // 1. Montant Dépensé Total (période sélectionnée)
        let totalSpentQuery = `
            SELECT COALESCE(SUM(e.total), 0) as total 
            FROM expenses e
        `;
        let spentParams = [];
        
        // Si cutoff_date est fourni, l'utiliser comme filtre de fin
        // Sinon, utiliser la logique actuelle avec start_date/end_date
        if (cutoff_date) {
            // Pour le snapshot : calculer du début du mois jusqu'à cutoff_date (inclus)
            const cutoffMonth = referenceDateStr.substring(0, 7) + '-01'; // Premier jour du mois
            totalSpentQuery += ` WHERE e.expense_date >= $1 AND e.expense_date <= $2`;
            spentParams = [cutoffMonth, referenceDateStr];
        } else if (start_date && end_date) {
            totalSpentQuery += ` WHERE e.expense_date >= $1 AND e.expense_date <= $2`;
            spentParams = [start_date, end_date];
        }
        
        if (isDirector) {
            const whereClause = spentParams.length > 0 ? ' AND' : ' WHERE';
            totalSpentQuery += `${whereClause} (e.user_id = $${spentParams.length + 1} OR (EXISTS (
                SELECT 1 FROM accounts a WHERE a.id = e.account_id AND a.user_id = $${spentParams.length + 1}
            ) AND e.user_id IN (SELECT id FROM users WHERE role IN ('directeur_general', 'pca', 'admin'))))`;
            spentParams.push(userId);
        }
        
        const totalSpentResult = await pool.query(totalSpentQuery, spentParams);
        const totalSpent = parseInt(totalSpentResult.rows[0].total);
        

        
        // 1.5 Dépenses des mois précédents (jusqu'au dernier jour du mois précédent)
        let previousMonthsQuery = `
            SELECT 
                a.id as account_id,
                a.account_name,
                COALESCE(SUM(e.total), 0) as previous_months_spent
            FROM accounts a
            LEFT JOIN expenses e ON e.account_id = a.id 
                AND e.expense_date < DATE_TRUNC('month', $1::date)
            WHERE a.is_active = true AND a.account_type NOT IN ('depot', 'partenaire', 'creance')
        `;
        let previousMonthsParams = [referenceDateStr];
        
        if (isDirector) {
            previousMonthsQuery += ` AND a.user_id = $2`;
            previousMonthsParams.push(userId);
        }
        
        previousMonthsQuery += ` GROUP BY a.id, a.account_name ORDER BY a.account_name`;
        
        const previousMonthsResult = await pool.query(previousMonthsQuery, previousMonthsParams);
        
        // 2. Montant Restant Total (soldes calculés dynamiquement selon la date de référence)
        let totalRemainingQuery = `
            SELECT COALESCE(SUM(
                a.total_credited - COALESCE(
                    (SELECT SUM(e.total) 
                     FROM expenses e 
                     WHERE e.account_id = a.id 
                     AND e.expense_date <= $1), 0)
            ), 0) as total 
            FROM accounts a 
            WHERE a.is_active = true AND a.account_type NOT IN ('depot', 'partenaire', 'creance')
        `;
        let remainingParams = [referenceDateStr];
        
        if (isDirector) {
            totalRemainingQuery += ` AND a.user_id = $2`;
            remainingParams.push(userId);
        }
        
        const totalRemainingResult = await pool.query(totalRemainingQuery, remainingParams);
        const totalRemaining = parseInt(totalRemainingResult.rows[0].total);
        
        // 3. Total Crédité avec Dépenses (comptes qui ont eu des dépenses, sauf dépôts, partenaires et créances)
        let creditedWithExpensesQuery = `
            SELECT COALESCE(SUM(DISTINCT a.total_credited), 0) as total 
            FROM accounts a
            WHERE a.is_active = true AND a.account_type NOT IN ('depot', 'partenaire', 'creance')
            AND EXISTS (
                SELECT 1 FROM expenses e WHERE e.account_id = a.id
        `;
        let creditedExpensesParams = [];
        
        if (start_date && end_date) {
            creditedWithExpensesQuery += ` AND e.expense_date >= $1 AND e.expense_date <= $2`;
            creditedExpensesParams = [start_date, end_date];
        }
        
        creditedWithExpensesQuery += ')';
        
        if (isDirector) {
            creditedWithExpensesQuery += ` AND a.user_id = $${creditedExpensesParams.length + 1}`;
            creditedExpensesParams.push(userId);
        }
        
        const creditedWithExpensesResult = await pool.query(creditedWithExpensesQuery, creditedExpensesParams);
        const totalCreditedWithExpenses = parseInt(creditedWithExpensesResult.rows[0].total);
        
        // 4. Total Crédité Général (tous les comptes actifs, sauf dépôts, partenaires et créances)
        let totalCreditedQuery = `
            SELECT COALESCE(SUM(a.total_credited), 0) as total 
            FROM accounts a 
            WHERE a.is_active = true AND a.account_type NOT IN ('depot', 'partenaire', 'creance')
        `;
        let creditedParams = [];
        
        if (isDirector) {
            totalCreditedQuery += ` AND a.user_id = $1`;
            creditedParams = [userId];
        }
        
        const totalCreditedResult = await pool.query(totalCreditedQuery, creditedParams);
        const totalCreditedGeneral = parseInt(totalCreditedResult.rows[0].total);

        // 📊 LOGS DÉTAILLÉS pour comprendre la différence
        console.log('');
        console.log('📋 ===== COMPARAISON TOTAUX CRÉDITÉS =====');
        console.log('📋 🎯 Total Crédité avec ACTIVITÉ:', totalCreditedWithExpenses, 'FCFA');
        console.log('📋    └─ Comptes ayant eu des dépenses dans la période');
        console.log('📋 🌐 Total Crédité GÉNÉRAL:', totalCreditedGeneral, 'FCFA');
        console.log('📋    └─ TOUS les comptes actifs (avec ou sans dépenses)');
        
        const difference = totalCreditedGeneral - totalCreditedWithExpenses;
        if (difference === 0) {
            console.log('📋 ✅ RÉSULTAT: Identiques - Tous les comptes ont eu des dépenses');
        } else {
            console.log('📋 📊 DIFFÉRENCE:', difference, 'FCFA (comptes sans activité)');
        }
        console.log('📋 ==========================================');
        console.log('');
        
        // 5. Solde des comptes depot
        let depotBalanceQuery = `
            SELECT COALESCE(SUM(a.current_balance), 0) as total 
            FROM accounts a 
            WHERE a.is_active = true AND a.account_type = 'depot'
        `;
        let depotParams = [];
        
        if (isDirector) {
            depotBalanceQuery += ` AND a.user_id = $1`;
            depotParams = [userId];
        }
        
        const depotBalanceResult = await pool.query(depotBalanceQuery, depotParams);
        const totalDepotBalance = parseInt(depotBalanceResult.rows[0].total);
        
        // 6. Solde des comptes partenaire
        let partnerBalanceQuery = `
            SELECT COALESCE(SUM(
                a.total_credited - COALESCE(
                    (SELECT SUM(pd.amount)
                     FROM partner_deliveries pd
                     WHERE pd.account_id = a.id
                     AND pd.validation_status = 'fully_validated'
                     AND pd.is_validated = true), 0)
            ), 0) as total 
            FROM accounts a 
            WHERE a.is_active = true AND a.account_type = 'partenaire'
        `;
        let partnerParams = [];
        
        if (isDirector) {
            partnerBalanceQuery += ` AND a.user_id = $1`;
            partnerParams = [userId];
        }
        
        const partnerBalanceResult = await pool.query(partnerBalanceQuery, partnerParams);
        const totalPartnerBalance = parseInt(partnerBalanceResult.rows[0].total);
        
        // 7. Calcul de la nouvelle carte PL (sans stock + charges)
        // PL = Cash Bictorys Du mois + Créances du Mois - Remboursements du Mois + Stock Point de Vente - Cash Burn du Mois
        let plSansStockCharges = 0;
        let cashBictorysValue = 0;
        let creancesMoisValue = 25000;
        let remboursementsMoisValue = 0;
        let stockPointVenteValue = 0;
        
        // Variables pour stocker les détails des calculs
        let stockMataCurrentValue = 0, stockMataCurrentDate = null;
        let stockMataPreviousValue = 0, stockMataPreviousDate = null;
        let stockMataCurrentRawValue = 0, stockMataPreviousRawValue = 0, stockMataAbattementRate = 0.10;
        let stockVivantCurrentValue = 0, stockVivantCurrentDate = null;
        let stockVivantPreviousValue = 0, stockVivantPreviousDate = null;
        let livraisonsPeriodStart = null, livraisonsPeriodEnd = null;
        let livraisonsCount = 0, livraisonsNonValidees = 0;
        let livraisonsDetailsList = [];
        
        try {
            // Récupérer la vraie valeur Cash Bictorys du mois
            let monthYear;
            if (cutoff_date) {
                // Utiliser le mois de la cutoff_date
                monthYear = referenceDateStr.substring(0, 7); // Format YYYY-MM
            } else if (start_date && end_date) {
                // Utiliser les dates de filtre pour le mois
                monthYear = start_date.substring(0, 7); // Format YYYY-MM
            } else {
                // Si pas de dates, utiliser le mois en cours
                const now = new Date();
                monthYear = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
            }
            
            // Approche en deux étapes pour Cash Bictorys
            let cashBictorysResult;
            
            if (cutoff_date) {
                // Pour cutoff_date : récupérer la dernière valeur non-nulle avant ou égale à cette date
                cashBictorysResult = await pool.query(`
                    SELECT amount
                    FROM cash_bictorys
                    WHERE date = (
                        SELECT MAX(date)
                        FROM cash_bictorys
                        WHERE amount != 0 
                        AND month_year = $1
                        AND date <= $2
                    )
                    AND amount != 0
                    AND month_year = $1
                    AND date <= $2
                `, [monthYear, referenceDateStr]);
                
                // Si aucune valeur non-nulle trouvée, prendre la dernière valeur (même si 0)
                if (cashBictorysResult.rows.length === 0) {
                    console.log(`💰 DEBUG: Aucune valeur non-nulle trouvée pour ${monthYear} jusqu'au ${cutoff_date}, recherche de la dernière valeur...`);
                cashBictorysResult = await pool.query(`
                    SELECT amount
                    FROM cash_bictorys
                    WHERE date = (
                        SELECT MAX(date)
                        FROM cash_bictorys
                        WHERE month_year = $1
                        AND date <= $2
                    )
                    AND month_year = $1
                    AND date <= $2
                `, [monthYear, referenceDateStr]);
                }
            } else {
                // Étape 1 : Chercher des valeurs non-nulles pour le mois
                cashBictorysResult = await pool.query(`
                SELECT amount
                FROM cash_bictorys
                WHERE date = (
                    SELECT MAX(date)
                    FROM cash_bictorys
                    WHERE amount != 0 
                    AND month_year = $1
                )
                AND amount != 0
                AND month_year = $1
                `, [monthYear]);
                
                // Étape 2 : Si aucune valeur non-nulle, prendre la dernière valeur (même si 0)
                if (cashBictorysResult.rows.length === 0) {
                    console.log(`💰 DEBUG: Aucune valeur non-nulle trouvée pour ${monthYear}, recherche de la dernière valeur...`);
                    cashBictorysResult = await pool.query(`
                        SELECT amount
                        FROM cash_bictorys
                        WHERE date = (
                            SELECT MAX(date)
                            FROM cash_bictorys
                            WHERE month_year = $1
                        )
                        AND month_year = $1
                    `, [monthYear]);
                }
            }
            
            cashBictorysValue = cashBictorysResult.rows.length > 0 ? parseInt(cashBictorysResult.rows[0].amount) || 0 : 0;
            console.log(`💰 DEBUG: Cash Bictorys pour ${monthYear} (jusqu'au ${cutoff_date || 'aujourd\'hui'}): ${cashBictorysValue} FCFA`);
            
            // Récupérer Créances du Mois DIRECTEMENT (sans appel API interne)
            try {
                const userRole = user?.role;
                const userId = user?.id;

                let accountFilter = '';
                let creancesParams = [];

                // Filtrer selon les permissions
                if (userRole === 'directeur') {
                    accountFilter = 'AND a.user_id = $1';
                    creancesParams = [userId];
                }

                // Calculer les dates selon le mois demandé
                let startOfMonth, endOfMonth;
                
                const [year, monthNum] = monthYear.split('-').map(Number);
                startOfMonth = new Date(year, monthNum - 1, 1);
                endOfMonth = new Date(year, monthNum, 0, 23, 59, 59);

                const startOfMonthStr = startOfMonth.toISOString().split('T')[0];
                let endOfMonthStr = endOfMonth.toISOString().split('T')[0] + ' 23:59:59';
                
                // Si cutoff_date est fourni, l'utiliser comme date de fin
                if (cutoff_date) {
                    endOfMonthStr = referenceDateStr + ' 23:59:59';
                }

                // Paramètres pour la requête
                const queryParams = userRole === 'directeur' ? [userId, startOfMonthStr, endOfMonthStr] : [startOfMonthStr, endOfMonthStr];

                // Requête pour calculer les créances du mois (SEULEMENT les crédits/avances)
                // Utiliser la même logique que l'API /api/dashboard/creances-mois pour la cohérence
                const creancesQuery = `
                    SELECT 
                        COALESCE(SUM(co.amount), 0) as creances_mois
                    FROM creance_operations co
                    JOIN creance_clients cc ON co.client_id = cc.id
                    JOIN accounts a ON cc.account_id = a.id
                    WHERE co.operation_type = 'credit'
                    AND co.operation_date >= $${queryParams.length - 1}
                    AND co.operation_date <= $${queryParams.length}
                    AND a.account_type = 'creance' 
                    AND a.is_active = true 
                    AND cc.is_active = true
                    ${accountFilter}
                `;

                const creancesResult = await pool.query(creancesQuery, queryParams);
                creancesMoisValue = parseInt(creancesResult.rows[0].creances_mois) || 0;
                
                console.log(`💰 Créances du mois calculées directement (jusqu'au ${cutoff_date || 'aujourd\'hui'}): ${creancesMoisValue} FCFA`);
                
            } catch (error) {
                console.error('Erreur calcul créances du mois:', error);
                creancesMoisValue = 0;
            }
            
            // Calculer les remboursements du mois
            console.log('\n🔍 ===== DÉBUT CALCUL REMBOURSEMENTS =====');
            console.log(`🔍 monthYear: ${monthYear}`);
            console.log(`🔍 cutoff_date: ${cutoff_date}`);
            remboursementsMoisValue = 0;
            try {
                const userRole = user?.role;
                const userId = user?.id;
                console.log(`🔍 User role: ${userRole}, User ID: ${userId}`);

                let accountFilter = '';
                let remboursementsParams = [];

                // Filtrer selon les permissions
                if (userRole === 'directeur') {
                    accountFilter = 'AND a.user_id = $1';
                    remboursementsParams = [userId];
                }

                // Calculer les dates selon le mois demandé
                let startOfMonth, endOfMonth;
                
                const [year, monthNum] = monthYear.split('-').map(Number);
                startOfMonth = new Date(year, monthNum - 1, 1);
                endOfMonth = new Date(year, monthNum, 0, 23, 59, 59);

                const startOfMonthStr = startOfMonth.toISOString().split('T')[0];
                let endOfMonthStr = endOfMonth.toISOString().split('T')[0] + ' 23:59:59';
                
                // Si cutoff_date est fourni, l'utiliser comme date de fin
                if (cutoff_date) {
                    endOfMonthStr = referenceDateStr + ' 23:59:59';
                }

                // Paramètres pour la requête
                const queryParams = userRole === 'directeur' ? [userId, startOfMonthStr, endOfMonthStr] : [startOfMonthStr, endOfMonthStr];

                // Requête pour calculer les remboursements du mois (type 'debit' dans la base)
                const remboursementsQuery = `
                    SELECT 
                        COALESCE(SUM(co.amount), 0) as remboursements_mois
                    FROM creance_operations co
                    JOIN creance_clients cc ON co.client_id = cc.id
                    JOIN accounts a ON cc.account_id = a.id
                    WHERE co.operation_type = 'debit'
                    AND co.operation_date >= $${queryParams.length - 1}
                    AND co.operation_date <= $${queryParams.length}
                    AND a.account_type = 'creance' 
                    AND a.is_active = true 
                    AND cc.is_active = true
                    ${accountFilter}
                `;

                const remboursementsResult = await pool.query(remboursementsQuery, queryParams);
                remboursementsMoisValue = parseInt(remboursementsResult.rows[0].remboursements_mois) || 0;
                
                console.log(`💰 Remboursements du mois calculés directement (jusqu'au ${cutoff_date || 'aujourd\'hui'}): ${remboursementsMoisValue} FCFA`);
                
            } catch (error) {
                console.error('Erreur calcul remboursements du mois:', error);
                remboursementsMoisValue = 0;
            }
            
            // Calculer l'écart mensuel du Stock Mata (même logique que stock vivant)
            let stockMataVariation = 0;
            
            if (cutoff_date || end_date) {
                const effectiveDate = cutoff_date || end_date;
                console.log(`📦 CALCUL ÉCART STOCK MATA - Date effective: ${effectiveDate}`);
                
                // 1. Déterminer le premier jour du mois de la cutoff_date
                const refDate = new Date(effectiveDate);
                const firstDayOfCurrentMonth = `${refDate.getFullYear()}-${(refDate.getMonth() + 1).toString().padStart(2, '0')}-01`;
                
                // 2. Trouver la dernière date de stock mata AVANT le mois actuel
                const lastDateBeforeCurrentMonth = await pool.query(`
                    SELECT MAX(date) as last_date 
                    FROM stock_mata 
                    WHERE date < $1
                `, [firstDayOfCurrentMonth]);
                
                let previousStockMata = 0;
                let previousStockMataDate = null;
                
                if (lastDateBeforeCurrentMonth.rows[0]?.last_date) {
                    // Il y a des données avant le mois actuel, récupérer le stock pour cette date
                    const previousStockMataResult = await pool.query(`
                        SELECT COALESCE(SUM(stock_soir), 0) as total_stock,
                               date as latest_date
                        FROM stock_mata 
                        WHERE date = $1
                        GROUP BY date
                    `, [lastDateBeforeCurrentMonth.rows[0].last_date]);
                    
                    previousStockMata = Math.round(previousStockMataResult.rows[0]?.total_stock || 0);
                    previousStockMataDate = previousStockMataResult.rows[0]?.latest_date;
                    
                    console.log(`📦 Stock Mata mois précédent trouvé (${previousStockMataDate?.toISOString().split('T')[0]}): ${previousStockMata.toLocaleString()} FCFA`);
                } else {
                    // Aucune donnée avant le mois actuel
                    previousStockMata = 0;
                    previousStockMataDate = null;
                    console.log(`📦 Aucune donnée stock mata trouvée avant ${firstDayOfCurrentMonth} → Stock précédent = 0 FCFA`);
                }
                
                // 3. Récupérer le stock mata le plus proche de la date de cutoff (≤ cutoff_date)
                const currentStockMataQuery = `
                    SELECT COALESCE(SUM(stock_soir), 0) as total_stock,
                           MAX(date) as latest_date
                    FROM stock_mata
                    WHERE date <= $1::date
                    AND date = (
                        SELECT MAX(date) 
                        FROM stock_mata 
                        WHERE date <= $1::date
                    )
                `;
                const currentStockMataResult = await pool.query(currentStockMataQuery, [effectiveDate]);
                
                const currentStockMataRaw = Math.round(currentStockMataResult.rows[0]?.total_stock || 0);
                const currentStockMataDate = currentStockMataResult.rows[0]?.latest_date;

                // 4. Appliquer l'abattement (configurable dans financial_settings.json)
                const plFinancialConfig = getFinancialConfig();
                const _rawAbattement = plFinancialConfig.stock_mata_abattement;
                const stockMataAbattement = (typeof _rawAbattement === 'number' && isFinite(_rawAbattement))
                    ? Math.min(1, Math.max(0, _rawAbattement))
                    : 0.10;
                const currentStockMata = Math.round(currentStockMataRaw * (1 - stockMataAbattement));
                const previousStockMataAdjusted = Math.round(previousStockMata * (1 - stockMataAbattement));

                // Stocker les valeurs pour les détails (brut + ajusté)
                stockMataCurrentValue = currentStockMata;
                stockMataCurrentDate = currentStockMataDate;
                stockMataPreviousValue = previousStockMataAdjusted;
                stockMataPreviousDate = previousStockMataDate;
                stockMataCurrentRawValue = currentStockMataRaw;
                stockMataPreviousRawValue = previousStockMata;
                stockMataAbattementRate = stockMataAbattement;

                // 5. Calculer l'écart : stock actuel ajusté - stock précédent ajusté
                stockMataVariation = currentStockMata - previousStockMataAdjusted;

                console.log(`📦 Abattement stock Mata: ${(stockMataAbattement * 100).toFixed(0)}%`);
                console.log(`   📅 Stock actuel brut (${currentStockMataDate?.toISOString().split('T')[0] || 'N/A'}): ${currentStockMataRaw.toLocaleString()} FCFA → ajusté: ${currentStockMata.toLocaleString()} FCFA`);
                console.log(`   📅 Stock précédent brut (${previousStockMataDate?.toISOString().split('T')[0] || 'N/A'}): ${previousStockMata.toLocaleString()} FCFA → ajusté: ${previousStockMataAdjusted.toLocaleString()} FCFA`);
                console.log(`📦 Écart Stock Mata Mensuel PL: ${stockMataVariation.toLocaleString()} FCFA`);
                console.log(`   ➡️  Écart: ${currentStockMata.toLocaleString()} - ${previousStockMataAdjusted.toLocaleString()} = ${stockMataVariation.toLocaleString()} FCFA`);
                
                // Utiliser l'écart au lieu de la valeur brute
                stockPointVenteValue = stockMataVariation;
            } else {
                // Si pas de cutoff_date, utiliser 0 (logique par défaut)
                stockPointVenteValue = 0;
                console.log(`📦 Écart Stock Mata Mensuel PL: ${stockPointVenteValue} FCFA (pas de date de référence)`);
            }
            
        } catch (error) {
            console.error('Erreur calcul écart stock Mata:', error);
            stockPointVenteValue = 0;
        }

        // 7.5. Calculer les VIREMENTS DU MOIS (somme de tous les virements) - AVANT calcul PL de base
        console.log('\n💸 ===== CALCUL VIREMENTS DU MOIS =====');
        let totalVirementsMois = 0;
        try {
            // Récupérer le mois au format YYYY-MM depuis cutoff_date ou start_date
            const monthYearStr = (cutoff_date || start_date || referenceDateStr).substring(0, 7);
            console.log(`💸 Month extrait: ${monthYearStr}`);
            
            const virementsResult = await pool.query(`
                SELECT COALESCE(SUM(valeur), 0) as total_virements
                FROM virement_mensuel
                WHERE month_year = $1
            `, [monthYearStr]);

            totalVirementsMois = parseInt(virementsResult.rows[0].total_virements) || 0;
            
            console.log(`💸 Virements du mois ${monthYearStr}: ${totalVirementsMois.toLocaleString()} FCFA`);
            
        } catch (error) {
            console.error('❌ Erreur calcul virements du mois:', error);
            totalVirementsMois = 0;
        }
        console.log('💸 =====================================\n');

        // 7.6. Calculer PL de base (AVEC virements du mois)
        try {
            // PL de base = Cash Bictorys + Créances - Remboursements + Virements + Écart Stock Mata - Cash Burn
            plSansStockCharges = cashBictorysValue + creancesMoisValue - remboursementsMoisValue + totalVirementsMois + stockPointVenteValue - totalSpent;
            
            console.log(`📊 Calcul PL de base:`);
            console.log(`   Cash Bictorys: ${cashBictorysValue.toLocaleString()} FCFA`);
            console.log(`   Créances Mois: ${creancesMoisValue.toLocaleString()} FCFA`);
            console.log(`   Remboursements: -${remboursementsMoisValue.toLocaleString()} FCFA`);
            console.log(`   Virements: ${totalVirementsMois.toLocaleString()} FCFA`);
            console.log(`   Écart Stock Mata: ${stockPointVenteValue.toLocaleString()} FCFA`);
            console.log(`   Cash Burn: -${totalSpent.toLocaleString()} FCFA`);
            console.log(`   = ${plSansStockCharges.toLocaleString()} FCFA`);
            
        } catch (error) {
            console.error('Erreur calcul PL de base:', error);
            plSansStockCharges = 0;
        }
        
        // 8. Récupérer l'écart de stock vivant mensuel (UTILISE LA MÊME LOGIQUE QUE LA CARTE)
        let stockVivantVariation = 0;
        try {
            // Utiliser cutoff_date si disponible, sinon end_date
            const effectiveCutoffDate = cutoff_date || end_date;
            if (effectiveCutoffDate) {
                // Utiliser la MÊME logique que dans /api/dashboard/stock-vivant-variation
                const currentDate = new Date(effectiveCutoffDate);
            const currentYear = currentDate.getFullYear();
            const currentMonth = currentDate.getMonth() + 1;
            
            let previousYear = currentYear;
            let previousMonth = currentMonth - 1;
            if (previousMonth === 0) {
                previousMonth = 12;
                previousYear = currentYear - 1;
            }
            
                console.log(`🌱 CALCUL ÉCART STOCK VIVANT PL - Date de référence: ${effectiveCutoffDate} ${cutoff_date ? '(cutoff_date)' : '(end_date fallback)'}`);
                console.log(`🌱 Mois actuel: ${currentYear}-${currentMonth.toString().padStart(2, '0')}`);
                console.log(`🌱 Mois précédent: ${previousYear}-${previousMonth.toString().padStart(2, '0')}`);
                
                // 1. Récupérer le stock de la dernière date disponible AVANT le mois actuel
                let previousStock = 0;
                let previousStockDate = null;
                
                const firstDayOfCurrentMonth = `${currentYear}-${currentMonth.toString().padStart(2, '0')}-01`;
                
                // Chercher la dernière date disponible avant le mois actuel
                const lastDateBeforeCurrentMonth = await pool.query(`
                    SELECT MAX(date_stock) as last_date
                        FROM stock_vivant
                    WHERE date_stock < $1::date
                `, [firstDayOfCurrentMonth]);
                
                if (lastDateBeforeCurrentMonth.rows[0]?.last_date) {
                    // Il y a des données avant le mois actuel, récupérer le stock pour cette date
                    const previousStockResult = await pool.query(`
                        SELECT SUM(quantite * prix_unitaire * (1 - COALESCE(decote, 0))) as total_stock,
                               MAX(date_stock) as latest_date
                            FROM stock_vivant 
                        WHERE date_stock = $1
                    `, [lastDateBeforeCurrentMonth.rows[0].last_date]);
                    
                    previousStock = Math.round(previousStockResult.rows[0]?.total_stock || 0);
                    previousStockDate = previousStockResult.rows[0]?.latest_date;
                    
                    console.log(`🌱 Stock mois précédent trouvé (${previousStockDate?.toISOString().split('T')[0]}): ${previousStock.toLocaleString()} FCFA`);
                } else {
                    // Aucune donnée avant le mois actuel
                    previousStock = 0;
                    previousStockDate = null;
                    console.log(`🌱 Aucune donnée stock vivant trouvée avant ${firstDayOfCurrentMonth} → Stock précédent = 0 FCFA`);
                }
                
                // 2. Récupérer le stock le plus proche de la date de cutoff (≤ cutoff_date)
                const currentStockQuery = `
                    SELECT SUM(quantite * prix_unitaire * (1 - COALESCE(decote, 0))) as total_stock,
                           MAX(date_stock) as latest_date
                    FROM stock_vivant
                    WHERE date_stock <= $1::date
                    AND date_stock = (
                        SELECT MAX(date_stock) 
                        FROM stock_vivant 
                        WHERE date_stock <= $1::date
                    )
                `;
                const currentStockResult = await pool.query(currentStockQuery, [effectiveCutoffDate]);
                
                const currentStock = Math.round(currentStockResult.rows[0]?.total_stock || 0);
                const currentStockDate = currentStockResult.rows[0]?.latest_date;
                
                // Stocker les valeurs pour les détails
                stockVivantCurrentValue = currentStock;
                stockVivantCurrentDate = currentStockDate;
                stockVivantPreviousValue = previousStock;
                stockVivantPreviousDate = previousStockDate;
                
                // 3. Calculer l'écart : stock actuel - stock précédent
                stockVivantVariation = currentStock - previousStock;
                
                console.log(`🌱 Écart Stock Vivant Mensuel PL: ${stockVivantVariation.toLocaleString()} FCFA`);
                console.log(`   📅 Stock actuel (${currentStockDate?.toISOString().split('T')[0] || 'N/A'}): ${currentStock.toLocaleString()} FCFA`);
                console.log(`   📅 Stock précédent (${previousStockDate?.toISOString().split('T')[0] || 'N/A'}): ${previousStock.toLocaleString()} FCFA`);
                console.log(`   ➡️  Écart: ${currentStock.toLocaleString()} - ${previousStock.toLocaleString()} = ${stockVivantVariation.toLocaleString()} FCFA`);
            } else {
                // Si pas de cutoff_date NI end_date, utiliser 0 (logique par défaut)
                stockVivantVariation = 0;
                console.log(`🌱 Écart Stock Vivant Mensuel PL: ${stockVivantVariation} FCFA (pas de cutoff_date ni end_date)`);
            }
            
        } catch (error) {
            console.error('Erreur calcul écart stock vivant pour PL:', error);
            stockVivantVariation = 0;
        }
        // 9. Récupérer les livraisons partenaires validées du mois
        let livraisonsPartenaires = 0;
        try {
            // Calculer les dates selon le mois demandé
            let startOfMonth, endOfMonth;
            
            if (cutoff_date) {
                // Utiliser le mois de la cutoff_date - IMPORTANT: du 1er du mois de cutoff_date jusqu'à cutoff_date inclus
                const refDate = new Date(cutoff_date + 'T00:00:00'); // Force locale time
                const year = refDate.getFullYear();
                const month = refDate.getMonth() + 1; // 1-based month (septembre = 9)
                
                // Créer les dates avec des chaînes pour éviter les problèmes de timezone
                const startDateStr = `${year}-${month.toString().padStart(2, '0')}-01`;
                startOfMonth = new Date(startDateStr + 'T00:00:00');
                endOfMonth = new Date(cutoff_date + 'T23:59:59');
                
                console.log(`🚚 CALCUL LIVRAISONS PARTENAIRES - Cutoff_date utilisée: ${cutoff_date} (mois: ${year}-${month.toString().padStart(2, '0')})`);
                console.log(`🚚 DEBUG - startDateStr: ${startDateStr}`);
                console.log(`🚚 DEBUG - startOfMonth: ${startOfMonth.toISOString()}, endOfMonth: ${endOfMonth.toISOString()}`);
            } else {
                // Si pas de cutoff_date, utiliser le mois en cours
                const now = new Date();
                const year = now.getFullYear();
                const month = now.getMonth(); // 0-based month
                startOfMonth = new Date(year, month, 1);
                endOfMonth = now;
                console.log(`🚚 CALCUL LIVRAISONS PARTENAIRES - Mois en cours utilisé: ${year}-${(month + 1).toString().padStart(2, '0')}`);
                console.log(`🚚 DEBUG - startOfMonth: ${startOfMonth.toISOString()}, endOfMonth: ${endOfMonth.toISOString()}`);
            }

            const startOfMonthStr = startOfMonth.toISOString().split('T')[0];
            const endOfMonthStr = endOfMonth.toISOString().split('T')[0];

            // CORRECTION TIMEZONE: Forcer les bonnes dates pour l'affichage frontend
            if (cutoff_date) {
                const refDate = new Date(cutoff_date + 'T00:00:00');
                const year = refDate.getFullYear();
                const month = refDate.getMonth() + 1;
                livraisonsPeriodStart = `${year}-${month.toString().padStart(2, '0')}-01`;
                livraisonsPeriodEnd = cutoff_date;
            } else {
                livraisonsPeriodStart = startOfMonthStr;
                livraisonsPeriodEnd = endOfMonthStr;
            }

            console.log(`🚚 Période de calcul des livraisons: ${startOfMonthStr} au ${endOfMonthStr} (INCLUS)`);
            console.log(`🚚 DEBUG BACKEND - livraisonsPeriodStart: "${livraisonsPeriodStart}"`);
            console.log(`🚚 DEBUG BACKEND - livraisonsPeriodEnd: "${livraisonsPeriodEnd}"`);

            // Récupérer les livraisons partenaires validées du mois
            const livraisonsQuery = `
                SELECT COALESCE(SUM(pd.amount), 0) as total_livraisons,
                       COUNT(pd.id) as total_deliveries
                FROM partner_deliveries pd
                JOIN accounts a ON pd.account_id = a.id
                WHERE pd.delivery_date >= $1 
                AND pd.delivery_date <= $2
                AND pd.validation_status = 'fully_validated'
                AND pd.is_validated = true
                AND a.account_type = 'partenaire'
                AND a.is_active = true
            `;

            const livraisonsResult = await pool.query(livraisonsQuery, [startOfMonthStr, endOfMonthStr]);
            livraisonsPartenaires = parseInt(livraisonsResult.rows[0].total_livraisons) || 0;
            const totalValidatedDeliveries = parseInt(livraisonsResult.rows[0].total_deliveries) || 0;
            
            // Récupérer aussi les livraisons non validées
            const livraisonsNonValideesQuery = `
                SELECT COUNT(pd.id) as total_non_validated
                FROM partner_deliveries pd
                JOIN accounts a ON pd.account_id = a.id
                WHERE pd.delivery_date >= $1 
                AND pd.delivery_date <= $2
                AND (pd.validation_status != 'fully_validated' OR pd.is_validated = false OR pd.validation_status IS NULL)
                AND a.account_type = 'partenaire'
                AND a.is_active = true
            `;

            const livraisonsNonValideesResult = await pool.query(livraisonsNonValideesQuery, [startOfMonthStr, endOfMonthStr]);
            const totalNonValidatedDeliveries = parseInt(livraisonsNonValideesResult.rows[0].total_non_validated) || 0;
            
            // Stocker les nombres pour les détails
            livraisonsCount = totalValidatedDeliveries;
            livraisonsNonValidees = totalNonValidatedDeliveries;
            
            // Récupérer les détails individuels des livraisons pour l'affichage
            const livraisonsDetailsQuery = `
                SELECT 
                    pd.id,
                    pd.delivery_date,
                    pd.amount,
                    pd.description,
                    a.account_name as partner_name
                FROM partner_deliveries pd
                JOIN accounts a ON pd.account_id = a.id
                WHERE pd.delivery_date >= $1 
                AND pd.delivery_date <= $2
                AND pd.validation_status = 'fully_validated'
                AND pd.is_validated = true
                AND a.account_type = 'partenaire'
                AND a.is_active = true
                ORDER BY pd.delivery_date DESC, a.account_name ASC
            `;
            
            const livraisonsDetailsResult = await pool.query(livraisonsDetailsQuery, [startOfMonthStr, endOfMonthStr]);
            const livraisonsDetailsList = livraisonsDetailsResult.rows.map(row => ({
                id: row.id,
                date: row.delivery_date.toISOString().split('T')[0],
                amount: parseInt(row.amount),
                description: row.description || '',
                partnerName: row.partner_name
            }));
            
            console.log(`🚚 RÉSULTAT: ${totalValidatedDeliveries} livraisons validées (${livraisonsPartenaires} FCFA) + ${totalNonValidatedDeliveries} non validées`);
            
            // Debug: vérifier toutes les livraisons dans la période (même non validées)
            const allDeliveriesDebugResult = await pool.query(`
                SELECT pd.id, pd.delivery_date, pd.amount, pd.validation_status, pd.is_validated, a.account_name
                FROM partner_deliveries pd
                JOIN accounts a ON pd.account_id = a.id
                WHERE pd.delivery_date >= $1 AND pd.delivery_date <= $2
                ORDER BY pd.delivery_date DESC
            `, [startOfMonthStr, endOfMonthStr]);
            
            console.log(`📦 DEBUG - Total livraisons dans la période (toutes): ${allDeliveriesDebugResult.rows.length}`);
            if (allDeliveriesDebugResult.rows.length > 0) {
                allDeliveriesDebugResult.rows.forEach(delivery => {
                    const statusIcon = (delivery.validation_status === 'fully_validated' && delivery.is_validated) ? '✅' : '❌';
                    console.log(`   ${statusIcon} ${delivery.delivery_date}: ${delivery.amount} FCFA (${delivery.validation_status}, validated: ${delivery.is_validated}) - ${delivery.account_name}`);
                });
            } else {
                console.log(`📦 Aucune livraison trouvée dans la période ${startOfMonthStr} - ${endOfMonthStr}`);
            }
            
            // Debug: vérifier les comptes partenaires
            const partnerAccountsResult = await pool.query(`
                SELECT id, account_name, account_type, is_active
                FROM accounts 
                WHERE account_type = 'partenaire' AND is_active = true
            `);
            console.log(`👥 Comptes partenaires actifs: ${partnerAccountsResult.rows.length}`);
            
            // Debug: vérifier s'il y a des livraisons dans d'autres périodes
            const otherPeriodsResult = await pool.query(`
                SELECT COUNT(*) as count, MIN(delivery_date) as earliest, MAX(delivery_date) as latest
                FROM partner_deliveries pd
                JOIN accounts a ON pd.account_id = a.id
                WHERE a.account_type = 'partenaire' AND a.is_active = true
            `);
            if (otherPeriodsResult.rows[0].count > 0) {
                console.log(`📊 Total livraisons dans toute la base: ${otherPeriodsResult.rows[0].count} (du ${otherPeriodsResult.rows[0].earliest} au ${otherPeriodsResult.rows[0].latest})`);
            }
            
        } catch (error) {
            console.error('Erreur calcul livraisons partenaires pour PL:', error);
            livraisonsPartenaires = 0;
        }

        // 10. Calcul de la nouvelle carte PL avec estimation des charges fixes
        // PL = Cash Bictorys + Créances + Stock PV + Écart Stock Vivant - Cash Burn - Estim charge prorata - Livraisons partenaires
        let plEstimCharges = 0;
        let plBrut = 0;
        let chargesFixesEstimation = 0;
        let chargesProrata = 0;
        let joursOuvrablesEcoules = 0;
        let totalJoursOuvrables = 0;
        let currentDay = 0;
        let currentMonth = 0;
        let currentYear = 0;
        let plCalculationDetails = {};
        
        try {
            // Lire l'estimation des charges fixes depuis le fichier JSON
            try {
                const configPath = path.join(__dirname, 'financial_settings.json');
                if (fs.existsSync(configPath)) {
                    const configData = fs.readFileSync(configPath, 'utf8');
                    const financialConfig = JSON.parse(configData);
                    chargesFixesEstimation = parseFloat(financialConfig.charges_fixes_estimation) || 0;
                    console.log(`💰 Estimation charges fixes lue: ${chargesFixesEstimation} FCFA`);
                } else {
                    console.log('⚠️ Fichier financial_settings.json non trouvé, estimation = 0');
                }
            } catch (configError) {
                console.error('Erreur lecture config financière:', configError);
                chargesFixesEstimation = 0;
            }
            
            // Calculer le prorata des charges fixes basé sur les jours écoulés (hors dimanche)
            chargesProrata = 0;
            if (chargesFixesEstimation > 0) {
                // Utiliser la cutoff_date si fournie, sinon la date actuelle
                const refDate = cutoff_date ? new Date(cutoff_date) : new Date();
                currentDay = refDate.getDate();
                currentMonth = refDate.getMonth() + 1;
                currentYear = refDate.getFullYear();
                
                // Calculer le nombre de jours ouvrables écoulés dans le mois (lundi à samedi)
                // Du début du mois jusqu'à la date de référence (inclus)
                joursOuvrablesEcoules = 0;
                for (let day = 1; day <= currentDay; day++) {
                    const date = new Date(currentYear, currentMonth - 1, day);
                    const dayOfWeek = date.getDay(); // 0 = dimanche, 1 = lundi, ..., 6 = samedi
                    if (dayOfWeek !== 0) { // Exclure les dimanches
                        joursOuvrablesEcoules++;
                    }
                }
                
                // Calculer le nombre total de jours ouvrables dans le mois
                const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
                totalJoursOuvrables = 0;
                for (let day = 1; day <= daysInMonth; day++) {
                    const date = new Date(currentYear, currentMonth - 1, day);
                    const dayOfWeek = date.getDay();
                    if (dayOfWeek !== 0) { // Exclure les dimanches
                        totalJoursOuvrables++;
                    }
                }
                
                // Calculer le prorata
                chargesProrata = (chargesFixesEstimation * joursOuvrablesEcoules) / totalJoursOuvrables;
                
                console.log(`📅 Date de référence: ${currentDay}/${currentMonth}/${currentYear} ${cutoff_date ? '(cutoff_date)' : '(aujourd\'hui)'}`);
                console.log(`📅 Jours ouvrables écoulés (lundi-samedi): ${joursOuvrablesEcoules}`);
                console.log(`📅 Total jours ouvrables dans le mois: ${totalJoursOuvrables}`);
                console.log(`💸 Calcul prorata: ${chargesFixesEstimation} × ${joursOuvrablesEcoules}/${totalJoursOuvrables} = ${Math.round(chargesProrata)} FCFA`);
            }
            
            // Calculer le PL brut (sans estimation des charges)
            // Les virements sont maintenant dans plSansStockCharges, donc on ne les ajoute plus ici
            plBrut = plSansStockCharges + stockVivantVariation - livraisonsPartenaires;
            
            // Calculer le PL avec estimation des charges ET écart stock vivant ET livraisons partenaires
            plEstimCharges = plSansStockCharges + stockVivantVariation - chargesProrata - livraisonsPartenaires;
            
            console.log('🔍=== DÉTAIL CALCUL PL (avec ecart stock mensuel, virements et estim. charges) ===');
            console.log(`💰 Cash Bictorys du mois: ${cashBictorysValue} FCFA`);
            console.log(`💳 Créances du mois: ${creancesMoisValue} FCFA`);
            console.log(`💵 Remboursements du mois: ${remboursementsMoisValue} FCFA`);
            console.log(`💸 Virements du mois: ${totalVirementsMois} FCFA`);
            console.log(`📦 Écart Stock Mata Mensuel: ${stockPointVenteValue} FCFA`);
            console.log(`💸 Cash Burn du mois: ${totalSpent} FCFA`);
            console.log(`📊 PL de base = ${cashBictorysValue} + ${creancesMoisValue} - ${remboursementsMoisValue} + ${totalVirementsMois} + ${stockPointVenteValue} - ${totalSpent} = ${plSansStockCharges} FCFA`);
            console.log(`🌱 Écart Stock Vivant Mensuel: ${stockVivantVariation} FCFA`);
            console.log(`🚚 Livraisons partenaires du mois: ${livraisonsPartenaires} FCFA`);
            console.log(`⚙️ Estimation charges fixes mensuelle: ${chargesFixesEstimation} FCFA`);
            console.log(`⏰ Charges prorata (jours ouvrables): ${Math.round(chargesProrata)} FCFA`);
            console.log(`🎯 PL BRUT = ${plSansStockCharges} + ${stockVivantVariation} - ${livraisonsPartenaires} = ${Math.round(plBrut)} FCFA`);
            console.log(`🎯 PL FINAL = ${plSansStockCharges} + ${stockVivantVariation} - ${Math.round(chargesProrata)} - ${livraisonsPartenaires} = ${Math.round(plEstimCharges)} FCFA`);
            console.log('🔍===============================================');
            
            // Préparer les détails pour le frontend
            plCalculationDetails = {
                cashBictorys: cashBictorysValue,
                creances: creancesMoisValue,
                remboursements: remboursementsMoisValue,
                stockPointVente: stockPointVenteValue,
                stockVivantVariation: stockVivantVariation,
                livraisonsPartenaires: livraisonsPartenaires,
                virementsMois: totalVirementsMois,
                cashBurn: totalSpent,
                plBase: plSansStockCharges,
                plBrut: Math.round(plBrut),
                chargesFixesEstimation: chargesFixesEstimation,
                chargesProrata: Math.round(chargesProrata),
                plFinal: Math.round(plEstimCharges),
                prorata: {
                    joursEcoules: joursOuvrablesEcoules,
                    totalJours: totalJoursOuvrables,
                    pourcentage: totalJoursOuvrables > 0 ? Math.round((joursOuvrablesEcoules / totalJoursOuvrables) * 100) : 0
                },
                date: {
                    jour: currentDay,
                    mois: currentMonth,
                    annee: currentYear
                },
                // Détails supplémentaires pour l'affichage enrichi
                stockMataDetails: {
                    currentStock: stockMataCurrentValue,
                    currentStockRaw: stockMataCurrentRawValue,
                    currentStockDate: stockMataCurrentDate ? stockMataCurrentDate.toISOString().split('T')[0] : null,
                    previousStock: stockMataPreviousValue,
                    previousStockRaw: stockMataPreviousRawValue,
                    previousStockDate: stockMataPreviousDate ? stockMataPreviousDate.toISOString().split('T')[0] : null,
                    abattement: stockMataAbattementRate
                },
                stockVivantDetails: {
                    currentStock: stockVivantCurrentValue,
                    currentStockDate: stockVivantCurrentDate ? stockVivantCurrentDate.toISOString().split('T')[0] : null,
                    previousStock: stockVivantPreviousValue,
                    previousStockDate: stockVivantPreviousDate ? stockVivantPreviousDate.toISOString().split('T')[0] : null
                },
                livraisonsDetails: {
                    totalLivraisons: livraisonsPartenaires,
                    period: {
                        startDate: livraisonsPeriodStart,
                        endDate: livraisonsPeriodEnd
                    },
                    count: livraisonsCount,
                    countNonValidated: livraisonsNonValidees,
                    list: livraisonsDetailsList || []
                }
            };
            
            console.log(`🚚 DEBUG BACKEND - Envoi au frontend period.startDate: "${plCalculationDetails.livraisonsDetails.period.startDate}"`);
            console.log(`🚚 DEBUG BACKEND - Envoi au frontend period.endDate: "${plCalculationDetails.livraisonsDetails.period.endDate}"`);
            
        } catch (error) {
            console.error('🚨 ERREUR calcul PL avec estim charges:', error);
            console.log(`🚨 DEBUG ERREUR - livraisonsPeriodStart: "${livraisonsPeriodStart}"`);
            console.log(`🚨 DEBUG ERREUR - livraisonsPeriodEnd: "${livraisonsPeriodEnd}"`);
            // Virements déjà inclus dans plSansStockCharges, ne pas les ajouter à nouveau
            plEstimCharges = plSansStockCharges + stockVivantVariation; // Fallback au PL de base
            plBrut = plSansStockCharges + stockVivantVariation - livraisonsPartenaires; // Fallback PL brut
            
            // Préparer les détails d'erreur pour le frontend
            plCalculationDetails = {
                cashBictorys: cashBictorysValue,
                creances: creancesMoisValue,
                remboursements: remboursementsMoisValue,
                stockPointVente: stockPointVenteValue,
                stockVivantVariation: stockVivantVariation,
                livraisonsPartenaires: livraisonsPartenaires,
                virementsMois: totalVirementsMois,
                cashBurn: totalSpent,
                plBase: plSansStockCharges,
                plBrut: Math.round(plBrut),
                chargesFixesEstimation: 0,
                chargesProrata: 0,
                plFinal: Math.round(plEstimCharges),
                prorata: { joursEcoules: 0, totalJours: 0, pourcentage: 0 },
                date: { jour: 0, mois: 0, annee: 0 },
                error: error.message,
                // Détails supplémentaires même en cas d'erreur
                stockMataDetails: {
                    currentStock: stockMataCurrentValue,
                    currentStockRaw: stockMataCurrentRawValue,
                    currentStockDate: stockMataCurrentDate ? stockMataCurrentDate.toISOString().split('T')[0] : null,
                    previousStock: stockMataPreviousValue,
                    previousStockRaw: stockMataPreviousRawValue,
                    previousStockDate: stockMataPreviousDate ? stockMataPreviousDate.toISOString().split('T')[0] : null,
                    abattement: stockMataAbattementRate
                },
                stockVivantDetails: {
                    currentStock: stockVivantCurrentValue,
                    currentStockDate: stockVivantCurrentDate ? stockVivantCurrentDate.toISOString().split('T')[0] : null,
                    previousStock: stockVivantPreviousValue,
                    previousStockDate: stockVivantPreviousDate ? stockVivantPreviousDate.toISOString().split('T')[0] : null
                },
                livraisonsDetails: {
                    totalLivraisons: livraisonsPartenaires,
                    period: {
                        startDate: livraisonsPeriodStart,
                        endDate: livraisonsPeriodEnd
                    },
                    count: livraisonsCount,
                    countNonValidated: livraisonsNonValidees,
                    list: livraisonsDetailsList || []
                }
            };
        }
        
        // Calculer dynamiquement les PL alternatifs en fonction des configurations comptes_*
        const plAlternatifs = {};
        try {
            // Lire la configuration financière
            const configPath = path.join(__dirname, 'financial_settings.json');
            if (fs.existsSync(configPath)) {
                const configData = fs.readFileSync(configPath, 'utf8');
                const financialConfig = JSON.parse(configData);
                
                // Extraire tous les noeuds commençant par 'comptes_'
                const comptesConfigs = Object.keys(financialConfig)
                    .filter(key => key.startsWith('comptes_'))
                    .reduce((acc, key) => {
                        acc[key] = financialConfig[key];
                        return acc;
                    }, {});
                
                console.log(`\n📊 ===== CALCUL PL ALTERNATIFS =====`);
                console.log(`📊 Configurations trouvées: ${Object.keys(comptesConfigs).length}`);
                
                // Pour chaque configuration, calculer un PL alternatif
                for (const [configKey, comptesAExclure] of Object.entries(comptesConfigs)) {
                    if (!Array.isArray(comptesAExclure) || comptesAExclure.length === 0) {
                        console.log(`⚠️ Configuration ${configKey} invalide ou vide, ignorée`);
                        continue;
                    }
                    
                    // Générer un nom lisible pour la carte PL
                    const plName = configKey
                        .replace('comptes_', '')
                        .replace(/_/g, ' ')
                        .replace(/\b\w/g, l => l.toUpperCase());
                    
                    console.log(`\n📊 Calcul PL sans: ${plName}`);
                    console.log(`📊 Config key: ${configKey}`);
                    console.log(`📊 Comptes exclus: ${comptesAExclure.join(', ')}`);
                    
                    // Calculer le Cash Burn en excluant les comptes spécifiés
                    let cashBurnExclusQuery = `
                        SELECT COALESCE(SUM(e.total), 0) as total 
                        FROM expenses e
                        JOIN accounts a ON e.account_id = a.id
                        WHERE a.account_name NOT IN (${comptesAExclure.map((_, i) => `$${i + 1}`).join(', ')})
                    `;
                    let exclusParams = [...comptesAExclure];
                    
                    // Ajouter les filtres de date
                    if (cutoff_date) {
                        const cutoffMonth = referenceDateStr.substring(0, 7) + '-01';
                        cashBurnExclusQuery += ` AND e.expense_date >= $${exclusParams.length + 1} AND e.expense_date <= $${exclusParams.length + 2}`;
                        exclusParams.push(cutoffMonth, referenceDateStr);
                    } else if (start_date && end_date) {
                        cashBurnExclusQuery += ` AND e.expense_date >= $${exclusParams.length + 1} AND e.expense_date <= $${exclusParams.length + 2}`;
                        exclusParams.push(start_date, end_date);
                    }
                    
                    // Ajouter filtre directeur si nécessaire
                    if (isDirector) {
                        cashBurnExclusQuery += ` AND (e.user_id = $${exclusParams.length + 1} OR (EXISTS (
                            SELECT 1 FROM accounts a2 WHERE a2.id = e.account_id AND a2.user_id = $${exclusParams.length + 1}
                        ) AND e.user_id IN (SELECT id FROM users WHERE role IN ('directeur_general', 'pca', 'admin'))))`;
                        exclusParams.push(userId);
                    }
                    
                    const cashBurnExclusResult = await pool.query(cashBurnExclusQuery, exclusParams);
                    const cashBurnExclus = parseInt(cashBurnExclusResult.rows[0].total);
                    
                    // Calculer les montants exclus (pour affichage)
                    const depensesExclues = totalSpent - cashBurnExclus;
                    
                    // Recalculer les PL avec le Cash Burn alternatif (virements inclus dans PL de base)
                    const plBaseAlt = cashBictorysValue + creancesMoisValue - remboursementsMoisValue + totalVirementsMois + stockPointVenteValue - cashBurnExclus;
                    const plBrutAlt = plBaseAlt + stockVivantVariation - livraisonsPartenaires;
                    const plFinalAlt = plBrutAlt - chargesProrata;
                    
                    console.log(`📊 Cash Burn excluant ${comptesAExclure.join(', ')}: ${cashBurnExclus.toLocaleString()} FCFA`);
                    console.log(`📊 Dépenses exclues: ${depensesExclues.toLocaleString()} FCFA`);
                    console.log(`📊 PL Base alternatif: ${plBaseAlt.toLocaleString()} FCFA`);
                    console.log(`📊 PL Final alternatif: ${Math.round(plFinalAlt).toLocaleString()} FCFA`);
                    
                    // Stocker le résultat
                    plAlternatifs[configKey] = {
                        configKey: configKey,
                        nom: plName,
                        comptesExclus: comptesAExclure,
                        cashBurn: cashBurnExclus,
                        depensesExclues: depensesExclues,
                        plBase: plBaseAlt,
                        plBrut: Math.round(plBrutAlt),
                        plFinal: Math.round(plFinalAlt)
                    };
                }
                
                console.log(`📊 ===== FIN CALCUL PL ALTERNATIFS =====\n`);
            }
        } catch (error) {
            console.error('❌ Erreur calcul PL alternatifs:', error);
        }
        
        res.json({
            totalSpent,
            totalRemaining,
            totalCreditedWithExpenses,
            totalCreditedGeneral,
            totalDepotBalance,
            totalPartnerBalance,
            plSansStockCharges,
            plEstimCharges,
            plBrut: Math.round(plBrut),
            plCalculationDetails,
            plAlternatifs,
            // Summary fields for easy access
            summary: {
                cash_bictorys: plCalculationDetails.cashBictorys,
                creances: plCalculationDetails.creances,
                stock_pv: plCalculationDetails.stockPointVente,
                ecart_stock_vivant: plCalculationDetails.stockVivantVariation,
                livraisons_partenaires: plCalculationDetails.livraisonsPartenaires,
                cash_burn: plCalculationDetails.cashBurn,
                charges_estimees: plCalculationDetails.chargesProrata,
                pl_final: Math.round(plCalculationDetails.plFinal)
            },
            previousMonthsExpenses: previousMonthsResult.rows.map(row => ({
                account_id: row.account_id,
                account_name: row.account_name,
                previous_months_spent: parseInt(row.previous_months_spent)
            })),
            period: {
                start_date: start_date || null,
                end_date: end_date || null
            }
        });
        
    } catch (error) {
        console.error('Erreur récupération cartes statistiques:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour récupérer les données de stock pour le dashboard
app.get('/api/dashboard/stock-summary', requireAuth, async (req, res) => {
    try {
        const { cutoff_date, start_date, end_date } = req.query;
        
        // Utiliser cutoff_date ou end_date (même logique que le PL)
        const effectiveDate = cutoff_date || end_date;
        
        console.log(`📦 SERVER: Stock summary avec date effective: ${effectiveDate}`);
        
        let stockQuery, stockParams, latestDate;
        
        if (effectiveDate && /^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) {
            // Calculer l'écart mensuel Stock Mata (même logique que le PL)
            console.log(`📦 CARD CALCUL ÉCART STOCK MATA - Date effective: ${effectiveDate}`);
            
            // 1. Déterminer le premier jour du mois de la date effective
            const refDate = new Date(effectiveDate);
            const firstDayOfCurrentMonth = `${refDate.getFullYear()}-${(refDate.getMonth() + 1).toString().padStart(2, '0')}-01`;
            
            // 2. Trouver la dernière date de stock mata AVANT le mois actuel
            const lastDateBeforeCurrentMonth = await pool.query(`
                SELECT MAX(date) as last_date 
                FROM stock_mata 
                WHERE date < $1
            `, [firstDayOfCurrentMonth]);
            
            let previousStockMata = 0;
            let previousStockMataDate = null;
            
            if (lastDateBeforeCurrentMonth.rows[0]?.last_date) {
                // Il y a des données avant le mois actuel, récupérer le stock pour cette date
                const previousStockMataResult = await pool.query(`
                    SELECT COALESCE(SUM(stock_soir), 0) as total_stock,
                           date as latest_date
                    FROM stock_mata 
                    WHERE date = $1
                    GROUP BY date
                `, [lastDateBeforeCurrentMonth.rows[0].last_date]);
                
                previousStockMata = Math.round(previousStockMataResult.rows[0]?.total_stock || 0);
                previousStockMataDate = previousStockMataResult.rows[0]?.latest_date;
                
                console.log(`📦 CARD Stock Mata mois précédent trouvé (${previousStockMataDate?.toISOString().split('T')[0]}): ${previousStockMata.toLocaleString()} FCFA`);
            } else {
                // Aucune donnée avant le mois actuel
                previousStockMata = 0;
                previousStockMataDate = null;
                console.log(`📦 CARD Aucune donnée stock mata trouvée avant ${firstDayOfCurrentMonth} → Stock précédent = 0 FCFA`);
            }
            
            // 3. Récupérer le stock mata le plus proche de la date de cutoff (≤ cutoff_date)
            const currentStockMataQuery = `
                SELECT COALESCE(SUM(stock_soir), 0) as total_stock,
                       MAX(date) as latest_date
                FROM stock_mata
                WHERE date <= $1::date
                AND date = (
                    SELECT MAX(date) 
                    FROM stock_mata 
                    WHERE date <= $1::date
                )
            `;
            const currentStockMataResult = await pool.query(currentStockMataQuery, [effectiveDate]);
            
            const currentStockMataRaw = Math.round(currentStockMataResult.rows[0]?.total_stock || 0);
            const currentStockMataDate = currentStockMataResult.rows[0]?.latest_date;

            // 4. Appliquer l'abattement (configurable dans financial_settings.json)
            const cardFinancialConfig = getFinancialConfig();
            const _rawCardAbattement = cardFinancialConfig.stock_mata_abattement;
            const cardStockMataAbattement = (typeof _rawCardAbattement === 'number' && isFinite(_rawCardAbattement))
                ? Math.min(1, Math.max(0, _rawCardAbattement))
                : 0.10;
            const currentStockMata = Math.round(currentStockMataRaw * (1 - cardStockMataAbattement));
            const previousStockMataAdjusted = Math.round(previousStockMata * (1 - cardStockMataAbattement));

            // 5. Calculer l'écart : stock actuel ajusté - stock précédent ajusté
            const stockMataVariation = currentStockMata - previousStockMataAdjusted;

            console.log(`📦 CARD Abattement stock Mata: ${(cardStockMataAbattement * 100).toFixed(0)}%`);
            console.log(`   📅 Stock actuel brut (${currentStockMataDate?.toISOString().split('T')[0] || 'N/A'}): ${currentStockMataRaw.toLocaleString()} FCFA → ajusté: ${currentStockMata.toLocaleString()} FCFA`);
            console.log(`   📅 Stock précédent brut (${previousStockMataDate?.toISOString().split('T')[0] || 'N/A'}): ${previousStockMata.toLocaleString()} FCFA → ajusté: ${previousStockMataAdjusted.toLocaleString()} FCFA`);
            console.log(`📦 CARD Écart Stock Mata Mensuel: ${stockMataVariation.toLocaleString()} FCFA`);
            console.log(`   ➡️  Écart: ${currentStockMata.toLocaleString()} - ${previousStockMataAdjusted.toLocaleString()} = ${stockMataVariation.toLocaleString()} FCFA`);

            // Retourner l'écart au lieu de la valeur brute
            return res.json({
                totalStock: stockMataVariation,
                latestDate: currentStockMataDate,
                formattedDate: currentStockMataDate ? currentStockMataDate.toISOString().split('T')[0] : null,
                cutoff_date: effectiveDate,
                isVariation: true,
                currentStock: currentStockMata,
                currentStockRaw: currentStockMataRaw,
                previousStock: previousStockMataAdjusted,
                previousStockRaw: previousStockMata,
                abattement: cardStockMataAbattement,
                currentStockDate: currentStockMataDate ? currentStockMataDate.toISOString().split('T')[0] : null,
                previousStockDate: previousStockMataDate ? previousStockMataDate.toISOString().split('T')[0] : null,
                details: `Stock actuel (${currentStockMataDate?.toISOString().split('T')[0] || 'N/A'}): ${currentStockMataRaw.toLocaleString()} FCFA × ${(1 - cardStockMataAbattement) * 100}% = ${currentStockMata.toLocaleString()} FCFA | Stock précédent (${previousStockMataDate?.toISOString().split('T')[0] || 'N/A'}): ${previousStockMata.toLocaleString()} FCFA × ${(1 - cardStockMataAbattement) * 100}% = ${previousStockMataAdjusted.toLocaleString()} FCFA`,
                message: 'Écart Stock Mata mensuel calculé avec succès'
            });
        } else {
            // Logique actuelle : dernière date disponible
        const latestDateQuery = `
            SELECT MAX(date) as latest_date 
            FROM stock_mata 
            WHERE date IS NOT NULL
        `;
        const latestDateResult = await pool.query(latestDateQuery);
        
        if (!latestDateResult.rows[0].latest_date) {
            return res.json({
                totalStock: 0,
                latestDate: null,
                message: 'Aucune donnée de stock disponible'
            });
        }
        
            latestDate = latestDateResult.rows[0].latest_date;
        
            stockQuery = `
            SELECT 
                COALESCE(SUM(stock_soir), 0) as total_stock,
                COUNT(*) as total_entries,
                COUNT(DISTINCT point_de_vente) as total_points,
                    COUNT(DISTINCT produit) as total_products,
                    MAX(date) as stock_date
            FROM stock_mata 
            WHERE date = $1
        `;
            stockParams = [latestDate];
            console.log(`📦 SERVER: Utilisation dernière date disponible: ${latestDate}`);
        }
        
        const stockSummaryResult = await pool.query(stockQuery, stockParams);
        
        if (stockSummaryResult.rows.length === 0) {
            console.log(`📦 SERVER: Aucune donnée stock trouvée`);
            return res.json({
                totalStock: 0,
                latestDate: null,
                message: cutoff_date ? `Aucune donnée de stock trouvée pour ${cutoff_date}` : 'Aucune donnée de stock disponible'
            });
        }
        
        const summary = stockSummaryResult.rows[0];
        const stockDate = summary.stock_date;
        
        console.log(`📦 SERVER RÉSULTAT: Stock = ${summary.total_stock} FCFA (date: ${stockDate})`);
        
        res.json({
            totalStock: parseFloat(summary.total_stock),
            latestDate: stockDate,
            totalEntries: parseInt(summary.total_entries),
            totalPoints: parseInt(summary.total_points),
            totalProducts: parseInt(summary.total_products),
            formattedDate: new Date(stockDate).toLocaleDateString('fr-FR'),
            cutoff_date: cutoff_date || null
        });
        
    } catch (error) {
        console.error('Erreur récupération résumé stock:', error);
        res.status(500).json({ error: 'Erreur serveur lors de la récupération des données de stock' });
    }
});

// Route pour créer le compte Ajustement et associer les dépenses orphelines
app.post('/api/admin/create-adjustment-account', requireAdminAuth, async (req, res) => {
    try {
        console.log('=== CRÉATION DU COMPTE AJUSTEMENT ===');
        
        // Vérifier si le compte existe déjà
        const existingAccount = await pool.query(`
            SELECT id FROM accounts WHERE account_name = 'Ajustement'
        `);
        
        let adjustmentAccountId;
        
        if (existingAccount.rows.length > 0) {
            adjustmentAccountId = existingAccount.rows[0].id;
            console.log('Compte Ajustement existe déjà avec ID:', adjustmentAccountId);
        } else {
            // Créer le compte Ajustement
            const result = await pool.query(`
                INSERT INTO accounts (
                    account_name, 
                    account_type, 
                    user_id, 
                    total_credited, 
                    current_balance, 
                    is_active,
                    created_at
                ) VALUES (
                    'Ajustement', 
                    'Ajustement', 
                    (SELECT id FROM users WHERE role = 'directeur_general' LIMIT 1), 
                    0, 
                    0, 
                    true,
                    NOW()
                ) RETURNING id
            `);
            
            adjustmentAccountId = result.rows[0].id;
            console.log('Compte Ajustement créé avec ID:', adjustmentAccountId);
        }
        
        // Identifier les dépenses orphelines
        const orphanExpenses = await pool.query(`
            SELECT e.id, e.total, e.designation, e.expense_date
            FROM expenses e
            LEFT JOIN accounts a ON e.account_id = a.id
            WHERE a.id IS NULL
        `);
        
        console.log('Dépenses orphelines trouvées:', orphanExpenses.rows.length);
        
        let totalOrphan = 0;
        let updatedCount = 0;
        
        if (orphanExpenses.rows.length > 0) {
            console.log('=== DÉPENSES ORPHELINES ===');
            orphanExpenses.rows.forEach(expense => {
                console.log(`ID: ${expense.id}, Date: ${expense.expense_date}, Montant: ${expense.total} FCFA, Désignation: ${expense.designation}`);
                totalOrphan += parseInt(expense.total);
            });
            console.log(`Total des dépenses orphelines: ${totalOrphan} FCFA`);
            
            // Mettre à jour les dépenses orphelines
            const updateResult = await pool.query(`
                UPDATE expenses 
                SET account_id = $1 
                WHERE account_id NOT IN (SELECT id FROM accounts WHERE id IS NOT NULL)
                   OR account_id IS NULL
            `, [adjustmentAccountId]);
            
            updatedCount = updateResult.rowCount;
            console.log('Dépenses orphelines mises à jour:', updatedCount);
            
            // Mettre à jour le solde du compte Ajustement
            await pool.query(`
                UPDATE accounts 
                SET current_balance = current_balance - $1,
                    total_credited = total_credited + $1
                WHERE id = $2
            `, [totalOrphan, adjustmentAccountId]);
            
            console.log(`Solde du compte Ajustement mis à jour: -${totalOrphan} FCFA`);
        }
        
        // Vérification finale
        const checkResult = await pool.query(`
            SELECT COUNT(*) as count, COALESCE(SUM(total), 0) as total_amount
            FROM expenses 
            WHERE account_id = $1
        `, [adjustmentAccountId]);
        
        console.log('=== VÉRIFICATION FINALE ===');
        console.log('Nombre de dépenses dans le compte Ajustement:', checkResult.rows[0].count);
        console.log('Montant total dans le compte Ajustement:', checkResult.rows[0].total_amount, 'FCFA');
        
        res.json({
            success: true,
            message: 'Compte Ajustement créé avec succès',
            accountId: adjustmentAccountId,
            orphanExpensesFound: orphanExpenses.rows.length,
            orphanExpensesUpdated: updatedCount,
            totalOrphanAmount: totalOrphan,
            finalExpenseCount: parseInt(checkResult.rows[0].count),
            finalTotalAmount: parseInt(checkResult.rows[0].total_amount)
        });
        
    } catch (error) {
        console.error('Erreur création compte Ajustement:', error);
        res.status(500).json({ error: 'Erreur serveur lors de la création du compte Ajustement' });
    }
});

// Route pour ajouter une dépense d'ajustement (DG/PCA uniquement)
app.post('/api/admin/adjustment-expense', requireAdminAuth, async (req, res) => {
    try {
        const { adjustment_date, adjustment_amount, adjustment_comment } = req.body;
        
        // Validation des données
        if (!adjustment_date || !adjustment_amount || !adjustment_comment) {
            return res.status(400).json({ error: 'Tous les champs sont obligatoires' });
        }
        
        if (adjustment_amount <= 0) {
            return res.status(400).json({ error: 'Le montant doit être positif' });
        }
        
        await pool.query('BEGIN');
        
        // Vérifier si le compte Ajustement existe
        let adjustmentAccount = await pool.query(`
            SELECT id FROM accounts WHERE account_name = 'Ajustement'
        `);
        
        if (adjustmentAccount.rows.length === 0) {
            // Créer le compte Ajustement s'il n'existe pas
            const createAccountResult = await pool.query(`
                INSERT INTO accounts (
                    account_name, 
                    account_type, 
                    user_id, 
                    total_credited, 
                    current_balance, 
                    is_active,
                    created_at
                ) VALUES (
                    'Ajustement', 
                    'Ajustement', 
                    $1, 
                    0, 
                    0, 
                    true,
                    NOW()
                ) RETURNING id
            `, [req.session.user.id]);
            
            adjustmentAccount = createAccountResult;
        }
        
        const accountId = adjustmentAccount.rows[0].id;
        
        // Créer la dépense d'ajustement
        const result = await pool.query(`
            INSERT INTO expenses (
                account_id, expense_type, category, subcategory, designation, 
                supplier, quantity, unit_price, total, predictable, 
                amount, description, expense_date, user_id, created_at, selected_for_invoice
            ) VALUES (
                $1, 'Ajustement', 'Ajustement Comptable', 'Correction', 'Ajustement comptable',
                'Système', 1, $2, $2, 'Non',
                $2, $3, $4, $5, NOW(), $6
            ) RETURNING id
        `, [accountId, adjustment_amount, adjustment_comment, adjustment_date, req.session.user.id, false]);
        
        // Mettre à jour le solde du compte Ajustement
        await pool.query(`
            UPDATE accounts 
            SET current_balance = current_balance - $1
            WHERE id = $2
        `, [adjustment_amount, accountId]);
        
        console.log(`Ajustement créé: ${adjustment_amount} FCFA - ${adjustment_comment}`);
        
        await pool.query('COMMIT');
        
        res.json({
            success: true,
            message: 'Ajustement comptable créé avec succès',
            expenseId: result.rows[0].id,
            amount: adjustment_amount,
            comment: adjustment_comment
        });
        
    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('Erreur création ajustement:', error);
        res.status(500).json({ error: 'Erreur serveur lors de la création de l\'ajustement' });
    }
});
// Route pour récupérer les détails des dépenses par compte
app.get('/api/accounts/:accountName/expenses', requireAuth, async (req, res) => {
    try {
        const { accountName } = req.params;
        const { start_date, end_date } = req.query;
        const userId = req.session.user.id;
        
        // Par défaut, utiliser l'année entière si aucune date n'est spécifiée
        const startDate = start_date || '2025-01-01';
        const endDate = end_date || '2025-12-31';
        
        let query = `
            SELECT 
                e.id,
                e.expense_date,
                e.expense_type,
                e.category,
                e.subcategory,
                e.social_network_detail,
                e.designation,
                e.supplier,
                e.quantity,
                e.unit_price,
                e.total,
                e.predictable,
                e.description,
                e.created_at as timestamp_creation,
                u.full_name as user_name,
                u.username,
                a.account_name,
                CASE 
                    WHEN e.expense_type IS NOT NULL THEN 
                        CONCAT(e.expense_type, ' > ', COALESCE(e.category, ''), ' > ', COALESCE(e.subcategory, ''),
                               CASE WHEN e.social_network_detail IS NOT NULL AND e.social_network_detail != '' 
                                    THEN CONCAT(' (', e.social_network_detail, ')') 
                                    ELSE '' END)
                    ELSE 'Catégorie non définie'
                END as category_full
            FROM expenses e
            JOIN users u ON e.user_id = u.id
            JOIN accounts a ON e.account_id = a.id
            WHERE a.account_name = $1
            AND e.expense_date >= $2 
            AND e.expense_date <= $3
            AND a.account_type != 'creance'
        `;
        
        let params = [accountName, startDate, endDate];
        
        // Filtrer selon le rôle de l'utilisateur
        if (req.session.user.role === 'directeur') {
            // Les directeurs voient leurs propres dépenses ET les dépenses faites par le DG sur leurs comptes
            query += ` AND (e.user_id = $4 OR (a.user_id = $4 AND e.user_id IN (
                SELECT id FROM users WHERE role IN ('directeur_general', 'pca', 'admin')
            )))`;
            params.push(userId);
        }
        
        query += ' ORDER BY e.expense_date DESC, e.created_at DESC';
        
        const result = await pool.query(query, params);
        
        // Récupérer les informations financières du compte pour la période
        const accountInfoQuery = `
            WITH monthly_credits AS (
                SELECT 
                    account_id,
                    SUM(credit_amount) as monthly_credits
                FROM (
                    -- Crédits réguliers
                    SELECT 
                        ch.account_id,
                        ch.amount as credit_amount
                    FROM credit_history ch
                    JOIN accounts a ON ch.account_id = a.id
                    WHERE DATE(ch.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Abidjan') >= $2::date 
                    AND DATE(ch.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Abidjan') <= $3::date
                    AND a.account_type NOT IN ('depot', 'partenaire', 'creance')
                    
                    UNION ALL
                    
                    -- Crédits spéciaux : pour les comptes "statut", prendre seulement le dernier du mois
                    SELECT 
                        sch.account_id,
                        CASE 
                            WHEN a.account_type = 'statut' THEN
                                -- Pour les comptes statut, prendre seulement le dernier crédit du mois
                                CASE WHEN sch.created_at = (
                                    SELECT MAX(sch2.created_at) 
                                    FROM special_credit_history sch2 
                                    WHERE sch2.account_id = sch.account_id 
                                    AND sch2.credit_date >= $2 AND sch2.credit_date <= $3
                                ) THEN sch.amount ELSE 0 END
                            ELSE sch.amount
                        END as credit_amount
                    FROM special_credit_history sch
                    JOIN accounts a ON sch.account_id = a.id
                    WHERE sch.credit_date >= $2 AND sch.credit_date <= $3
                    AND a.account_type NOT IN ('depot', 'partenaire', 'creance')
                ) all_credits
                WHERE credit_amount > 0 OR (credit_amount < 0 AND EXISTS (
                    SELECT 1 FROM accounts a2 WHERE a2.id = account_id AND a2.account_type = 'statut'
                ))
                GROUP BY account_id
            ),
            monthly_transfers AS (
                SELECT 
                    a.id as account_id,
                    COALESCE(SUM(CASE 
                        WHEN th.source_id = a.id THEN -th.montant
                        WHEN th.destination_id = a.id THEN th.montant
                        ELSE 0
                    END), 0) as net_transfers
                FROM accounts a
                LEFT JOIN transfer_history th ON (th.source_id = a.id OR th.destination_id = a.id)
                    AND DATE(th.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Abidjan') >= $2::date 
                    AND DATE(th.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Abidjan') <= $3::date
                GROUP BY a.id
            )
            SELECT 
                a.account_name,
                COALESCE(SUM(ABS(e.total)), 0) as monthly_spent,
                COALESCE(mc.monthly_credits, 0) as monthly_credits,
                COALESCE(mt.net_transfers, 0) as net_transfers
            FROM accounts a
            LEFT JOIN expenses e ON a.id = e.account_id 
                AND e.expense_date >= $2 AND e.expense_date <= $3
            LEFT JOIN monthly_credits mc ON a.id = mc.account_id
            LEFT JOIN monthly_transfers mt ON a.id = mt.account_id
            WHERE a.account_name = $1
            GROUP BY a.id, a.account_name, mc.monthly_credits, mt.net_transfers
        `;
        
        const accountInfoResult = await pool.query(accountInfoQuery, [accountName, startDate, endDate]);
        
        let accountInfo = {};
        if (accountInfoResult.rows.length > 0) {
            const row = accountInfoResult.rows[0];
            const monthlyCredits = parseInt(row.monthly_credits || 0);
            const monthlySpent = parseInt(row.monthly_spent || 0);
            const netTransfers = parseInt(row.net_transfers || 0);
            const monthlyBalance = monthlyCredits - monthlySpent + netTransfers;
            
            accountInfo = {
                monthly_credits: monthlyCredits,
                monthly_spent: monthlySpent,
                net_transfers: netTransfers,
                monthly_balance: monthlyBalance
            };
        }
        
        // Récupérer les données jour par jour pour l'évolution
        const dailyEvolutionQuery = `
            WITH date_series AS (
                SELECT generate_series(
                    $2::date,
                    $3::date,
                    '1 day'::interval
                )::date as date
            ),
            daily_credits AS (
                SELECT 
                    DATE(ch.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Abidjan') as date,
                    SUM(ch.amount) as daily_credits
                FROM credit_history ch
                JOIN accounts a ON ch.account_id = a.id
                WHERE a.account_name = $1
                AND ch.created_at >= $2 AND ch.created_at <= $3
                GROUP BY DATE(ch.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Abidjan')
                
                UNION ALL
                
                SELECT 
                    DATE(sch.credit_date) as date,
                    SUM(sch.amount) as daily_credits
                FROM special_credit_history sch
                JOIN accounts a ON sch.account_id = a.id
                WHERE a.account_name = $1
                AND sch.credit_date >= $2 AND sch.credit_date <= $3
                GROUP BY DATE(sch.credit_date)
            ),
            daily_expenses AS (
                SELECT 
                    e.expense_date as date,
                    SUM(ABS(e.total)) as daily_spent
                FROM expenses e
                JOIN accounts a ON e.account_id = a.id
                WHERE a.account_name = $1
                AND e.expense_date >= $2 AND e.expense_date <= $3
                GROUP BY e.expense_date
            ),
            daily_transfers AS (
                SELECT 
                    DATE(th.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Abidjan') as date,
                    SUM(CASE 
                        WHEN th.source_id = a.id THEN -th.montant
                        WHEN th.destination_id = a.id THEN th.montant
                        ELSE 0
                    END) as daily_transfers
                FROM transfer_history th
                JOIN accounts a ON (th.source_id = a.id OR th.destination_id = a.id)
                WHERE a.account_name = $1
                AND th.created_at >= $2 AND th.created_at <= $3
                GROUP BY DATE(th.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Abidjan')
            )
            SELECT 
                ds.date,
                COALESCE(SUM(dc.daily_credits), 0) as daily_credits,
                COALESCE(de.daily_spent, 0) as daily_spent,
                COALESCE(dt.daily_transfers, 0) as daily_transfers
            FROM date_series ds
            LEFT JOIN daily_credits dc ON ds.date = dc.date
            LEFT JOIN daily_expenses de ON ds.date = de.date
            LEFT JOIN daily_transfers dt ON ds.date = dt.date
            GROUP BY ds.date, de.daily_spent, dt.daily_transfers
            ORDER BY ds.date
        `;
        
        const dailyEvolutionResult = await pool.query(dailyEvolutionQuery, [accountName, startDate, endDate]);
        
        res.json({
            account_name: accountName,
            period: { start_date: startDate, end_date: endDate },
            expenses: result.rows,
            daily_evolution: dailyEvolutionResult.rows,
            ...accountInfo
        });
        
    } catch (error) {
        console.error('Erreur récupération détails dépenses compte:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour télécharger les justificatifs
app.get('/api/expenses/:id/justification', requireAuth, async (req, res) => {
    try {
        const expenseId = req.params.id;
        const userId = req.session.user.id;
        
        // Récupérer les informations du fichier
        let query = 'SELECT justification_filename, justification_path FROM expenses WHERE id = $1';
        let params = [expenseId];
        
        // Les directeurs ne peuvent voir que leurs propres justificatifs
        if (req.session.user.role === 'directeur') {
            query += ' AND user_id = $2';
            params.push(userId);
        }
        
        const result = await pool.query(query, params);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Dépense non trouvée' });
        }
        
        const expense = result.rows[0];
        
        if (!expense.justification_path || !fs.existsSync(expense.justification_path)) {
            return res.status(404).json({ error: 'Fichier justificatif non trouvé' });
        }
        
        // Télécharger le fichier
        res.download(expense.justification_path, expense.justification_filename);
        
    } catch (error) {
        console.error('Erreur téléchargement justificatif:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Routes pour la gestion des factures
app.post('/api/expenses/:id/toggle-selection', requireAuth, async (req, res) => {
    try {
        const expenseId = req.params.id;
        const { selected } = req.body;
        const userId = req.session.user.id;
        
        console.log('🔄 TOGGLE SELECTION: Début toggle pour dépense ID:', expenseId);
        console.log('🔄 TOGGLE SELECTION: Nouvel état sélectionné:', selected);
        console.log('🔄 TOGGLE SELECTION: Utilisateur:', req.session.user.username, 'Role:', req.session.user.role);
        
        // Vérifier l'état actuel avant modification
        const beforeQuery = 'SELECT id, designation, selected_for_invoice, user_id FROM expenses WHERE id = $1';
        const beforeResult = await pool.query(beforeQuery, [expenseId]);
        if (beforeResult.rows.length > 0) {
            const expense = beforeResult.rows[0];
            console.log('🔄 TOGGLE SELECTION: État avant:', {
                id: expense.id,
                designation: expense.designation,
                selected_for_invoice: expense.selected_for_invoice,
                user_id: expense.user_id
            });
        }
        
        let query = 'UPDATE expenses SET selected_for_invoice = $1 WHERE id = $2';
        let params = [selected, expenseId];
        
        console.log('🔄 TOGGLE SELECTION: Requête de base:', query);
        console.log('🔄 TOGGLE SELECTION: Paramètres de base:', params);
        
        // Les directeurs peuvent cocher/décocher leurs propres dépenses ET les dépenses du DG/PCA sur leurs comptes
        if (req.session.user.role === 'directeur') {
            query += ` AND (user_id = $3 OR account_id IN (
                SELECT id FROM accounts WHERE user_id = $3
            ))`;
            params.push(userId);
            console.log('🔄 TOGGLE SELECTION: Filtrage directeur ajouté, UserID:', userId);
        }
        
        console.log('🔄 TOGGLE SELECTION: Requête finale:', query);
        console.log('🔄 TOGGLE SELECTION: Paramètres finaux:', params);
        
        const result = await pool.query(query, params);
        
        console.log('🔄 TOGGLE SELECTION: Nombre de lignes affectées:', result.rowCount);
        
        // Vérifier l'état après modification
        const afterResult = await pool.query(beforeQuery, [expenseId]);
        if (afterResult.rows.length > 0) {
            const expense = afterResult.rows[0];
            console.log('🔄 TOGGLE SELECTION: État après:', {
                id: expense.id,
                designation: expense.designation,
                selected_for_invoice: expense.selected_for_invoice,
                user_id: expense.user_id
            });
        }
        
        if (result.rowCount === 0) {
            console.log('❌ TOGGLE SELECTION: Aucune ligne affectée - dépense non trouvée ou non autorisée');
            return res.status(404).json({ error: 'Dépense non trouvée ou non autorisée' });
        }
        
        console.log('✅ TOGGLE SELECTION: Mise à jour réussie');
        res.json({ success: true });
        
    } catch (error) {
        console.error('❌ TOGGLE SELECTION: Erreur toggle sélection:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.post('/api/expenses/select-all', requireAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;
        
        let query = 'UPDATE expenses SET selected_for_invoice = true';
        let params = [];
        
        // Les directeurs peuvent sélectionner leurs propres dépenses ET les dépenses du DG/PCA sur leurs comptes
        if (req.session.user.role === 'directeur') {
            query += ` WHERE (user_id = $1 OR account_id IN (
                SELECT id FROM accounts WHERE user_id = $1
            ))`;
            params.push(userId);
        }
        
        await pool.query(query, params);
        res.json({ success: true });
        
    } catch (error) {
        console.error('Erreur sélection tout:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.post('/api/expenses/deselect-all', requireAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;
        
        let query = 'UPDATE expenses SET selected_for_invoice = false';
        let params = [];
        
        // Les directeurs peuvent désélectionner leurs propres dépenses ET les dépenses du DG/PCA sur leurs comptes
        if (req.session.user.role === 'directeur') {
            query += ` WHERE (user_id = $1 OR account_id IN (
                SELECT id FROM accounts WHERE user_id = $1
            ))`;
            params.push(userId);
        }
        
        await pool.query(query, params);
        res.json({ success: true });
        
    } catch (error) {
        console.error('Erreur désélection tout:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});


app.post('/api/expenses/generate-invoices-pdf', requireAuth, async (req, res) => {
    // Configuration spécifique pour cette route
    req.setTimeout(300000); // 5 minutes
    res.setTimeout(300000); // 5 minutes
    
    try {
        const userId = req.session.user.id;
        
        console.log('🔍 PDF GENERATION: Début de la génération de factures');
        console.log('🔍 PDF GENERATION: Utilisateur:', req.session.user.username, 'Role:', req.session.user.role);
        
        // D'abord, vérifier toutes les dépenses et leur statut selected_for_invoice
        const checkQuery = `
            SELECT id, designation, selected_for_invoice, user_id, account_id, total
            FROM expenses 
            ORDER BY id DESC 
            LIMIT 10
        `;
        const checkResult = await pool.query(checkQuery);
        console.log('🔍 PDF GENERATION: État des dernières dépenses:');
        checkResult.rows.forEach(expense => {
            console.log(`   ID: ${expense.id}, Désignation: ${expense.designation}, Sélectionnée: ${expense.selected_for_invoice}, UserID: ${expense.user_id}, AccountID: ${expense.account_id}, Total: ${expense.total}`);
        });
        
        // Récupérer les dépenses sélectionnées
        let query = `
                        SELECT e.*, 
                   u.full_name as user_name, 
                   u.username, 
                   u.role as user_role, -- <<< CORRECTION APPLIQUÉE ICI
                   a.account_name,
                   CASE 
                       WHEN e.expense_type IS NOT NULL THEN 
                           CONCAT(e.expense_type, ' > ', e.category, ' > ', e.subcategory,
                                  CASE WHEN e.social_network_detail IS NOT NULL AND e.social_network_detail != '' 
                                       THEN CONCAT(' (', e.social_network_detail, ')') 
                                       ELSE '' END)
                       ELSE 'Catégorie non définie'
                   END as category_name
            FROM expenses e
            JOIN users u ON e.user_id = u.id
            LEFT JOIN accounts a ON e.account_id = a.id
            WHERE e.selected_for_invoice = true
        `;
        let params = [];
        
        console.log('🔍 PDF GENERATION: Requête de base:', query);
        
        // Les directeurs voient leurs propres dépenses ET les dépenses du DG/PCA sur leurs comptes
        if (req.session.user.role === 'directeur') {
            query += ` AND (e.user_id = $1 OR (
                SELECT a.user_id FROM accounts a WHERE a.id = e.account_id
            ) = $1)`;
            params.push(userId);
            console.log('🔍 PDF GENERATION: Filtrage pour directeur ajouté, UserID:', userId);
        }
        
        query += ' ORDER BY e.expense_date DESC';
        
        console.log('🔍 PDF GENERATION: Requête finale:', query);
        console.log('🔍 PDF GENERATION: Paramètres:', params);
        
        const result = await pool.query(query, params);
        
        console.log('🔍 PDF GENERATION: Nombre de dépenses trouvées:', result.rows.length);
        result.rows.forEach(expense => {
            console.log(`   📋 Dépense trouvée: ID ${expense.id}, ${expense.designation}, ${expense.total} FCFA, User: ${expense.username}, Sélectionnée: ${expense.selected_for_invoice}`);
        });
        
        console.log('⏱️ PDF GENERATION: Début du traitement des justificatifs...');
        
        if (result.rows.length === 0) {
            return res.status(400).json({ error: 'Aucune dépense sélectionnée pour la génération de factures. Veuillez cocher les dépenses que vous souhaitez inclure dans le PDF.' });
        }
        
        // Séparer les dépenses avec et sans justificatifs
        const expensesWithJustification = [];
        const expensesWithoutJustification = [];
        
        result.rows.forEach(expense => {
            if (expense.justification_filename && expense.justification_filename.trim() !== '') {
                expensesWithJustification.push(expense);
            } else {
                expensesWithoutJustification.push(expense);
            }
        });
        
        // Créer un PDF combiné avec TOUS les éléments (justificatifs + templates MATA)
        if (expensesWithJustification.length > 0 || expensesWithoutJustification.length > 0) {
            const doc = new PDFDocument({ 
                margin: 0,
                size: 'A4'
            });
            
        // Headers pour éviter les restrictions de Chrome
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="factures_completes_${new Date().toISOString().split('T')[0]}.pdf"`);
        res.setHeader('X-Frame-Options', 'SAMEORIGIN');
        res.setHeader('Content-Security-Policy', "frame-ancestors 'self'");
        res.setHeader('Cache-Control', 'no-cache');
        
        doc.pipe(res);
        
            let isFirstPage = true;
            
            // PARTIE 1: Ajouter tous les justificatifs (pièces jointes)
            console.log(`⏱️ PDF GENERATION: Traitement de ${expensesWithJustification.length} justificatifs...`);
            
            for (let i = 0; i < expensesWithJustification.length; i++) {
                const expense = expensesWithJustification[i];
                console.log(`⏱️ PDF GENERATION: Progression ${i + 1}/${expensesWithJustification.length} - Dépense ID: ${expense.id}`);
                
                // Utiliser le chemin complet stocké dans justification_path
                let justificationPath;
                if (expense.justification_path) {
                    // Normaliser le chemin pour Windows/Linux
                    const normalizedPath = expense.justification_path.replace(/\\/g, '/');
                    justificationPath = path.join(__dirname, normalizedPath);
                } else {
                    justificationPath = path.join(__dirname, 'uploads', expense.justification_filename);
                }
                
                console.log(`Ajout justificatif: ${justificationPath}`);
                
                if (fs.existsSync(justificationPath)) {
                    try {
                        if (!isFirstPage) {
                doc.addPage();
            }
            
                        // Déterminer le type de fichier à partir du nom original
                        const fileExtension = path.extname(expense.justification_filename).toLowerCase();
                        
                        if (['.jpg', '.jpeg', '.png'].includes(fileExtension)) {
                            // Image - l'ajouter directement
                            doc.image(justificationPath, 0, 0, { 
                                fit: [doc.page.width, doc.page.height],
                                align: 'center',
                                valign: 'center'
                            });
                        } else if (fileExtension === '.pdf') {
                            // PDF - ajouter une note indiquant qu'il faut voir le fichier séparément
                            doc.fontSize(16).fillColor('black').text(
                                `Justificatif PDF pour la dépense #${expense.id}`, 
                                50, 100, { width: doc.page.width - 100 }
                            );
                            doc.fontSize(12).text(
                                `Désignation: ${expense.designation || 'N/A'}`, 
                                50, 150
                            );
                            doc.text(
                                `Montant: ${(expense.total || expense.amount || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} FCFA`, 
                                50, 170
                            );
                            doc.text(
                                `Fichier: ${expense.justification_filename}`, 
                                50, 190
                            );
                            doc.text(
                                'Note: Le justificatif PDF original doit être consulté séparément.', 
                                50, 220, { width: doc.page.width - 100 }
                            );
                        } else {
                            // Autres types de fichiers - ajouter une note
                            doc.fontSize(16).fillColor('black').text(
                                `Justificatif pour la dépense #${expense.id}`, 
                                50, 100, { width: doc.page.width - 100 }
                            );
                            doc.fontSize(12).text(
                                `Désignation: ${expense.designation || 'N/A'}`, 
                                50, 150
                            );
                            doc.text(
                                `Montant: ${(expense.total || expense.amount || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} FCFA`, 
                                50, 170
                            );
                            doc.text(
                                `Type de fichier: ${fileExtension.toUpperCase()}`, 
                                50, 190
                            );
                            doc.text(
                                `Fichier: ${expense.justification_filename}`, 
                                50, 210
                            );
                            doc.text(
                                'Note: Ce type de fichier ne peut pas être affiché dans le PDF. Consultez le fichier original.', 
                                50, 240, { width: doc.page.width - 100 }
                            );
                        }
                        
                        isFirstPage = false;
                    } catch (error) {
                        console.error('Erreur lors de l\'ajout du justificatif:', error);
                        // Ajouter une page d'erreur
                        if (!isFirstPage) {
                            doc.addPage();
                        }
                        doc.fontSize(16).fillColor('red').text(
                            `Erreur: Impossible de charger le justificatif pour la dépense #${expense.id}`, 
                            50, 100, { width: doc.page.width - 100 }
                        );
                        isFirstPage = false;
                    }
                } else {
                    // Fichier justificatif non trouvé
                    if (!isFirstPage) {
                        doc.addPage();
                    }
                    doc.fontSize(16).fillColor('orange').text(
                        `Attention: Justificatif non trouvé pour la dépense #${expense.id}`, 
                        50, 100, { width: doc.page.width - 100 }
                    );
                    doc.fontSize(12).text(
                        `Fichier attendu: ${expense.justification_filename}`, 
                        50, 150
                    );
                    doc.text(
                        `Chemin: ${expense.justification_path}`, 
                        50, 170
                    );
                    isFirstPage = false;
                }
            }
            
            // PARTIE 2: Ajouter les templates MATA pour les dépenses sans justificatifs
            console.log(`⏱️ PDF GENERATION: Traitement de ${expensesWithoutJustification.length} templates MATA...`);
            
            expensesWithoutJustification.forEach((expense, index) => {
                console.log(`⏱️ PDF GENERATION: Template ${index + 1}/${expensesWithoutJustification.length} - Dépense ID: ${expense.id}`);
                if (!isFirstPage || index > 0) {
                    doc.addPage();
                }
                
                // === EN-TÊTE MATA ===
                doc.fontSize(24).font('Helvetica-Bold').fillColor('#1e3a8a').text('MATA', 50, 50);
                
                doc.fontSize(9).font('Helvetica').fillColor('black');
                doc.text('Mirage, Apt Nord 603D, Résidence Aquanique', 50, 80);
                doc.text('A : 01387695 2Y3 / RC : SN DKR 2024 B 29149', 50, 95);
                doc.text('Ouest foire : 78 480 95 95', 50, 110);
                doc.text('Grand Mbao / cité Aliou Sow : 77 858 96 96', 50, 125);
                
                doc.fontSize(16).font('Helvetica-Bold').fillColor('#1e3a8a').text('FACTURE', 275, 55);
                
                doc.fontSize(10).font('Helvetica').fillColor('black');
                const currentDate = new Date().toLocaleDateString('fr-FR');
                doc.text(`Date : ${currentDate}`, 450, 50);
                doc.fontSize(12).font('Helvetica-Bold').fillColor('#dc2626');
                doc.text(`N° : ${expense.id.toString().padStart(8, '0')}`, 450, 70);
                
                doc.moveTo(50, 160).lineTo(545, 160).stroke('#1e3a8a').lineWidth(1);
                
                let yPos = 180;
                doc.fontSize(14).font('Helvetica-Bold').fillColor('black');
                doc.text('Dépenses', 50, yPos);
                yPos += 30;
                
                // Tableau
                const tableStartY = yPos;
                const colPositions = [50, 110, 330, 430];
                
                doc.rect(50, tableStartY, 495, 25).fill('#1e3a8a');
                doc.fontSize(11).font('Helvetica-Bold').fillColor('white');
                doc.text('QUANTITÉ', colPositions[0] + 5, tableStartY + 8);
                doc.text('DÉSIGNATION', colPositions[1] + 5, tableStartY + 8);
                doc.text('P. UNITAIRE', colPositions[2] + 5, tableStartY + 8);
                doc.text('PRIX TOTAL', colPositions[3] + 5, tableStartY + 8);
                
                yPos = tableStartY + 25;
                
                doc.rect(50, yPos, 495, 30).fill('#f8f9fa').stroke('#dee2e6');
                doc.fontSize(10).font('Helvetica').fillColor('black');
                
                const quantity = expense.quantity || '1.00';
                doc.text(quantity, colPositions[0] + 5, yPos + 10);
                
                let designation = expense.designation || 'Dépense';
                // Utiliser toujours la designation, pas la subcategory
                // La subcategory est un code technique, pas une description utilisateur
                doc.text(designation, colPositions[1] + 5, yPos + 10, { width: 200, height: 20 });
                
                const unitPrice = expense.unit_price || expense.total || expense.amount || 0;
                const formattedUnitPrice = unitPrice.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
                doc.text(formattedUnitPrice, colPositions[2] + 5, yPos + 10);
                
                const total = expense.total || expense.amount || 0;
                const formattedTotal = total.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
                doc.text(formattedTotal, colPositions[3] + 5, yPos + 10);
                
                yPos += 30;
                
                // Lignes vides
                for (let i = 0; i < 6; i++) {
                    doc.rect(50, yPos, 495, 25).stroke('#dee2e6');
                    yPos += 25;
                }
                
                // Montant total
                doc.rect(50, yPos, 495, 3).fill('#1e3a8a');
                yPos += 10;
                
                doc.rect(50, yPos, 360, 30).fill('#1e3a8a');
                doc.fontSize(14).font('Helvetica-Bold').fillColor('white');
                doc.text('MONTANT TOTAL', 60, yPos + 10);
                
                doc.rect(410, yPos, 135, 30).stroke('#1e3a8a').lineWidth(2);
                doc.fontSize(16).font('Helvetica-Bold').fillColor('#1e3a8a');
                const finalTotal = total.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
                doc.text(`${finalTotal} F`, 420, yPos + 8);
                
                yPos += 60;
                
                doc.fontSize(10).font('Helvetica').fillColor('black');
                doc.text(`Dépense effectuée par : ${expense.user_name || expense.username}`, 50, yPos);
                yPos += 15;
                
                if (expense.supplier) {
                    doc.text(`Fournisseur : ${expense.supplier}`, 50, yPos);
                    yPos += 15;
                }
                
                // Cachet MATA
            const cachetPath = path.join(__dirname, 'public', 'images', 'CachetMata.jpg');
            if (fs.existsSync(cachetPath)) {
                try {
                        doc.image(cachetPath, 400, doc.page.height - 180, { width: 120, height: 120 });
                } catch (error) {
                        doc.fontSize(12).font('Helvetica-Bold').fillColor('#1e3a8a');
                        doc.text('CACHET MATA', 450, doc.page.height - 100);
                }
                } else {
                    doc.rect(400, doc.page.height - 180, 120, 120).stroke('#1e3a8a').lineWidth(2);
                    doc.fontSize(10).font('Helvetica-Bold').fillColor('#1e3a8a');
                    doc.text('CACHET\nMATA', 440, doc.page.height - 130, { align: 'center' });
            }
                
                isFirstPage = false;
        });
        
        console.log('✅ PDF GENERATION: Génération terminée, envoi du PDF...');
        doc.end();
        } else {
            return res.status(400).json({ error: 'Aucune dépense à traiter' });
        }
        
    } catch (error) {
        console.error('Erreur génération PDF:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});
// Route GET pour génération et service direct du PDF (contourne les restrictions de Chrome)
app.get('/api/expenses/generate-invoices-pdf-direct', requireAuth, async (req, res) => {
    // Configuration spécifique pour cette route
    req.setTimeout(300000); // 5 minutes
    res.setTimeout(300000); // 5 minutes
    
    try {
        const userId = req.session.user.id;
        const filename = req.query.filename || `factures_${new Date().toISOString().split('T')[0]}.pdf`;
        
        // Récupérer et valider les filtres
        const { start_date, end_date, expense_types } = req.query;
        
        console.log('📄 PDF DIRECT: Génération pour', req.session.user.username);
        console.log('📄 PDF DIRECT: Filtres dates - Start:', start_date, 'End:', end_date);
        console.log('📄 PDF DIRECT: Types de dépenses:', expense_types);
        
        // Validation des dates
        let parsedStartDate = null;
        let parsedEndDate = null;
        
        if (start_date) {
            parsedStartDate = new Date(start_date);
            if (isNaN(parsedStartDate.getTime())) {
                throw new Error(`Format de date de début invalide: ${start_date}`);
            }
        }
        
        if (end_date) {
            parsedEndDate = new Date(end_date);
            if (isNaN(parsedEndDate.getTime())) {
                throw new Error(`Format de date de fin invalide: ${end_date}`);
            }
        }
        
        // Vérifier que la date de début n'est pas postérieure à la date de fin
        if (parsedStartDate && parsedEndDate && parsedStartDate > parsedEndDate) {
            throw new Error('La date de début ne peut pas être postérieure à la date de fin');
        }
        
        // Validation et parsing des types de dépenses
        let selectedExpenseTypes = [];
        if (expense_types) {
            selectedExpenseTypes = expense_types.split(',').map(type => type.trim()).filter(Boolean);
            console.log('📄 PDF DIRECT: Types sélectionnés:', selectedExpenseTypes);
        }
        
        // Récupérer les dépenses sélectionnées avec filtrage par dates
        let query = `
                        SELECT e.*, 
                   u.full_name as user_name, 
                   u.username, 
                   u.role as user_role,
                   a.account_name,
                   CASE 
                       WHEN e.expense_type IS NOT NULL THEN 
                           CONCAT(e.expense_type, ' > ', e.category, ' > ', e.subcategory,
                                  CASE WHEN e.social_network_detail IS NOT NULL AND e.social_network_detail != '' 
                                       THEN CONCAT(' (', e.social_network_detail, ')') 
                                       ELSE '' END)
                       ELSE 'Catégorie non définie'
                   END as category_name
            FROM expenses e
            JOIN users u ON e.user_id = u.id
            LEFT JOIN accounts a ON e.account_id = a.id
            WHERE e.selected_for_invoice = true
        `;
        let params = [];
        let paramIndex = 1;
        
        // Ajouter le filtrage par dates
        if (parsedStartDate) {
            query += ` AND e.expense_date >= $${paramIndex}`;
            params.push(parsedStartDate.toISOString().split('T')[0]);
            paramIndex++;
        }
        
        if (parsedEndDate) {
            query += ` AND e.expense_date <= $${paramIndex}`;
            params.push(parsedEndDate.toISOString().split('T')[0]);
            paramIndex++;
        }
        
        // Ajouter le filtrage par types de dépenses
        if (selectedExpenseTypes.length > 0) {
            const placeholders = selectedExpenseTypes.map((_, index) => `$${paramIndex + index}`).join(',');
            query += ` AND e.expense_type IN (${placeholders})`;
            params.push(...selectedExpenseTypes);
            paramIndex += selectedExpenseTypes.length;
        }
        
        // Les directeurs voient leurs propres dépenses ET les dépenses du DG/PCA sur leurs comptes
        if (req.session.user.role === 'directeur') {
            query += ` AND (e.user_id = $${paramIndex} OR (
                SELECT a.user_id FROM accounts a WHERE a.id = e.account_id
            ) = $${paramIndex})`;
            params.push(userId);
        }
        
        query += ' ORDER BY e.expense_date DESC';
        const result = await pool.query(query, params);
        console.log('📄 PDF DIRECT: Trouvé', result.rows.length, 'dépenses');
        
        if (result.rows.length === 0) {
            // Créer un message d'erreur avec les informations de filtrage
            let filterInfo = '';
            if (start_date || end_date || selectedExpenseTypes.length > 0) {
                const formatDate = (date) => {
                    if (!date) return 'Non définie';
                    return new Date(date).toLocaleDateString('fr-FR');
                };
                filterInfo = `<div class="date-filter">
                    <strong>Filtres appliqués:</strong><br>
                    Date de début: ${formatDate(start_date)}<br>
                    Date de fin: ${formatDate(end_date)}<br>`;
                
                if (selectedExpenseTypes.length > 0) {
                    filterInfo += `Types de dépenses: ${selectedExpenseTypes.join(', ')}<br>`;
                }
                
                filterInfo += '</div>';
            }
            
            // Envoyer une réponse HTML au lieu de JSON pour les GET requests
            const errorHtml = `
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Aucune dépense trouvée</title>
                    <style>
                        body { font-family: Arial, sans-serif; padding: 50px; text-align: center; }
                        .error { color: #dc3545; font-size: 18px; margin: 20px; }
                        .instruction { color: #6c757d; font-size: 14px; margin: 20px; }
                        .date-filter { color: #17a2b8; font-size: 14px; margin: 20px; padding: 15px; background-color: #f8f9fa; border-radius: 5px; }
                        .button { 
                            background-color: #007bff; 
                            color: white; 
                            padding: 10px 20px; 
                            text-decoration: none; 
                            border-radius: 5px; 
                            display: inline-block; 
                            margin: 20px;
                        }
                    </style>
                </head>
                <body>
                    <h1>⚠️ Aucune dépense trouvée</h1>
                    <div class="error">Aucune dépense correspondant aux critères n'a été trouvée.</div>
                    ${filterInfo}
                    <div class="instruction">
                        Vérifiez que vous avez sélectionné des dépenses et que les dates de filtre correspondent à des dépenses existantes.
                    </div>
                    <a href="javascript:window.close()" class="button">Fermer cette page</a>
                    <a href="/" class="button">Retourner aux dépenses</a>
                </body>
                </html>
            `;
            return res.send(errorHtml);
        }
        
        // Séparer les dépenses avec et sans justificatifs
        const expensesWithJustification = [];
        const expensesWithoutJustification = [];
        
        result.rows.forEach(expense => {
            if (expense.justification_filename && expense.justification_filename.trim() !== '') {
                expensesWithJustification.push(expense);
            } else {
                expensesWithoutJustification.push(expense);
            }
        });
        
        console.log(`📄 PDF DIRECT: ${expensesWithJustification.length} avec justificatifs, ${expensesWithoutJustification.length} sans`);
        
        // Créer le PDF
        const doc = new PDFDocument({ margin: 0, size: 'A4' });
        
        // Headers pour affichage direct dans le navigateur
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
        res.setHeader('Cache-Control', 'no-cache');
        
        doc.pipe(res);
        
        let isFirstPage = true;
        
        // PARTIE 1: Ajouter tous les justificatifs
        for (let i = 0; i < expensesWithJustification.length; i++) {
            const expense = expensesWithJustification[i];
            
            let justificationPath;
            if (expense.justification_path) {
                const normalizedPath = expense.justification_path.replace(/\\/g, '/');
                justificationPath = path.join(__dirname, normalizedPath);
            } else {
                justificationPath = path.join(__dirname, 'uploads', expense.justification_filename);
            }
            
            if (fs.existsSync(justificationPath)) {
                try {
                    if (!isFirstPage) {
                        doc.addPage();
                    }
                    
                    const fileExtension = path.extname(expense.justification_filename).toLowerCase();
                    
                    if (['.jpg', '.jpeg', '.png'].includes(fileExtension)) {
                        doc.image(justificationPath, 0, 0, { 
                            fit: [doc.page.width, doc.page.height],
                            align: 'center',
                            valign: 'center'
                        });
                    } else if (fileExtension === '.pdf') {
                        doc.fontSize(16).fillColor('black').text(
                            `Justificatif PDF pour la dépense #${expense.id}`, 
                            50, 100, { width: doc.page.width - 100 }
                        );
                        doc.fontSize(12).text(`Désignation: ${expense.designation || 'N/A'}`, 50, 150);
                        doc.text(`Montant: ${(expense.total || expense.amount || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} FCFA`, 50, 170);
                        doc.text(`Fichier: ${expense.justification_filename}`, 50, 190);
                        doc.text('Note: Le justificatif PDF original doit être consulté séparément.', 50, 220, { width: doc.page.width - 100 });
                    }
                    
                    isFirstPage = false;
                } catch (error) {
                    console.error('Erreur lors de l\'ajout du justificatif:', error);
                    if (!isFirstPage) {
                        doc.addPage();
                    }
                    doc.fontSize(16).fillColor('red').text(
                        `Erreur: Impossible de charger le justificatif pour la dépense #${expense.id}`, 
                        50, 100, { width: doc.page.width - 100 }
                    );
                    isFirstPage = false;
                }
            }
        }
        
        // PARTIE 2: Ajouter les templates MATA complets
        expensesWithoutJustification.forEach((expense, index) => {
            if (!isFirstPage || index > 0) {
                doc.addPage();
            }
            
            // === EN-TÊTE MATA ===
            doc.fontSize(24).font('Helvetica-Bold').fillColor('#1e3a8a').text('MATA', 50, 50);
            
            doc.fontSize(9).font('Helvetica').fillColor('black');
            doc.text('Mirage, Apt Nord 603D, Résidence Aquanique', 50, 80);
            doc.text('A : 01387695 2Y3 / RC : SN DKR 2024 B 29149', 50, 95);
            doc.text('Ouest foire : 78 480 95 95', 50, 110);
            doc.text('Grand Mbao / cité Aliou Sow : 77 858 96 96', 50, 125);
            
            doc.fontSize(16).font('Helvetica-Bold').fillColor('#1e3a8a').text('FACTURE', 275, 55);
            
            doc.fontSize(10).font('Helvetica').fillColor('black');
            // Utiliser la date de la dépense au lieu de la date actuelle
            const expenseDate = expense.expense_date ? new Date(expense.expense_date).toLocaleDateString('fr-FR') : new Date().toLocaleDateString('fr-FR');
            doc.text(`Date : ${expenseDate}`, 450, 50);
            doc.fontSize(12).font('Helvetica-Bold').fillColor('#dc2626');
            doc.text(`N° : ${expense.id.toString().padStart(8, '0')}`, 450, 70);
            
            doc.moveTo(50, 160).lineTo(545, 160).stroke('#1e3a8a').lineWidth(1);
            
            let yPos = 180;
            doc.fontSize(14).font('Helvetica-Bold').fillColor('black');
            doc.text('Dépenses', 50, yPos);
            yPos += 30;
            
            // Tableau complet
            const tableStartY = yPos;
            const colPositions = [50, 110, 330, 430];
            
            doc.rect(50, tableStartY, 495, 25).fill('#1e3a8a');
            doc.fontSize(11).font('Helvetica-Bold').fillColor('white');
            doc.text('QUANTITÉ', colPositions[0] + 5, tableStartY + 8);
            doc.text('DÉSIGNATION', colPositions[1] + 5, tableStartY + 8);
            doc.text('P. UNITAIRE', colPositions[2] + 5, tableStartY + 8);
            doc.text('PRIX TOTAL', colPositions[3] + 5, tableStartY + 8);
            
            yPos = tableStartY + 25;
            
            doc.rect(50, yPos, 495, 30).fill('#f8f9fa').stroke('#dee2e6');
            doc.fontSize(10).font('Helvetica').fillColor('black');
            
            const quantity = expense.quantity || '1.00';
            doc.text(quantity, colPositions[0] + 5, yPos + 10);
            
            let designation = expense.designation || 'Dépense';
            // Utiliser toujours la designation, pas la subcategory
            // La subcategory est un code technique, pas une description utilisateur
            doc.text(designation, colPositions[1] + 5, yPos + 10, { width: 200, height: 20 });
            
            const unitPrice = expense.unit_price || expense.total || expense.amount || 0;
            const formattedUnitPrice = unitPrice.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
            doc.text(formattedUnitPrice, colPositions[2] + 5, yPos + 10);
            
            const total = expense.total || expense.amount || 0;
            const formattedTotal = total.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
            doc.text(formattedTotal, colPositions[3] + 5, yPos + 10);
            
            yPos += 30;
            
            // Lignes vides
            for (let i = 0; i < 6; i++) {
                doc.rect(50, yPos, 495, 25).stroke('#dee2e6');
                yPos += 25;
            }
            
            // Montant total
            doc.rect(50, yPos, 495, 3).fill('#1e3a8a');
            yPos += 10;
            
            doc.rect(50, yPos, 360, 30).fill('#1e3a8a');
            doc.fontSize(14).font('Helvetica-Bold').fillColor('white');
            doc.text('MONTANT TOTAL', 60, yPos + 10);
            
            doc.rect(410, yPos, 135, 30).stroke('#1e3a8a').lineWidth(2);
            doc.fontSize(16).font('Helvetica-Bold').fillColor('#1e3a8a');
            const finalTotal = total.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
            doc.text(`${finalTotal} F`, 420, yPos + 8);
            
            yPos += 60;
            
            doc.fontSize(10).font('Helvetica').fillColor('black');
            doc.text(`Dépense effectuée par : ${expense.user_name || expense.username}`, 50, yPos);
            yPos += 15;
            
            if (expense.supplier) {
                doc.text(`Fournisseur : ${expense.supplier}`, 50, yPos);
                yPos += 15;
            }
            
            // Cachet MATA
            const cachetPath = path.join(__dirname, 'public', 'images', 'CachetMata.jpg');
            if (fs.existsSync(cachetPath)) {
                try {
                    doc.image(cachetPath, 400, doc.page.height - 180, { width: 120, height: 120 });
                } catch (error) {
                    doc.fontSize(12).font('Helvetica-Bold').fillColor('#1e3a8a');
                    doc.text('CACHET MATA', 450, doc.page.height - 100);
                }
            } else {
                doc.rect(400, doc.page.height - 180, 120, 120).stroke('#1e3a8a').lineWidth(2);
                doc.fontSize(10).font('Helvetica-Bold').fillColor('#1e3a8a');
                doc.text('CACHET\nMATA', 440, doc.page.height - 130, { align: 'center' });
            }
            
            isFirstPage = false;
        });
        
        // Vérification de sécurité: si aucun contenu n'a été ajouté, ajouter une page de test
        if (isFirstPage) {
            doc.fontSize(16).text('TEST: PDF généré avec succès', 50, 100);
            doc.text(`Nombre total de dépenses: ${result.rows.length}`, 50, 130);
            doc.text(`Avec justificatifs: ${expensesWithJustification.length}`, 50, 150);
            doc.text(`Sans justificatifs: ${expensesWithoutJustification.length}`, 50, 170);
            doc.text(`Date de génération: ${new Date().toLocaleString('fr-FR')}`, 50, 190);
        }
        
        console.log('📄 PDF DIRECT: Génération terminée');
        doc.end();
        
    } catch (error) {
        console.error('Erreur génération PDF direct:', error);
        
        // Envoyer une réponse HTML d'erreur au lieu de JSON
        const errorHtml = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Erreur de génération PDF</title>
                <style>
                    body { font-family: Arial, sans-serif; padding: 50px; text-align: center; }
                    .error { color: #dc3545; font-size: 18px; margin: 20px; }
                    .details { color: #6c757d; font-size: 14px; margin: 20px; }
                    .button { 
                        background-color: #007bff; 
                        color: white; 
                        padding: 10px 20px; 
                        text-decoration: none; 
                        border-radius: 5px; 
                        display: inline-block; 
                        margin: 20px;
                    }
                </style>
            </head>
            <body>
                <h1>❌ Erreur de génération PDF</h1>
                <div class="error">Une erreur s'est produite lors de la génération du PDF.</div>
                <div class="details">
                    Détails de l'erreur: ${error.message || 'Erreur inconnue'}
                </div>
                <a href="javascript:window.close()" class="button">Fermer cette page</a>
                <a href="/" class="button">Retourner aux dépenses</a>
            </body>
            </html>
        `;
        res.status(500).send(errorHtml);
    }
});

// Route pour récupérer une dépense spécifique
app.get('/api/expenses/:id', requireAuth, async (req, res) => {
    try {
        const expenseId = req.params.id;
        
        // Éviter les conflits avec les routes spécifiques
        if (expenseId === 'generate-invoices-pdf') {
            return res.status(405).json({ error: 'Méthode non autorisée. Utilisez POST pour générer un PDF.' });
        }
        const userId = req.session.user.id;
        
        let query = `
            SELECT e.*, u.full_name as user_name, u.username, a.account_name
            FROM expenses e
            JOIN users u ON e.user_id = u.id
            LEFT JOIN accounts a ON e.account_id = a.id
            WHERE e.id = $1
        `;
        let params = [expenseId];
        
        // Les directeurs ne peuvent voir que leurs propres dépenses
        if (req.session.user.role === 'directeur') {
            query += ' AND e.user_id = $2';
            params.push(userId);
        }
        
        const result = await pool.query(query, params);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Dépense non trouvée' });
        }
        
        res.json(result.rows[0]);
        
    } catch (error) {
        console.error('Erreur récupération dépense:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour modifier une dépense
app.put('/api/expenses/:id', requireAuth, requireWriteAccess, upload.single('justification'), async (req, res) => {
    try {
        console.log('🔄️ ===== DÉBUT MODIFICATION DÉPENSE =====');
        console.log('👤 Utilisateur:', req.session.user.username, '- Rôle:', req.session.user.role);
        console.log('📝 Body reçu:', JSON.stringify(req.body, null, 2));
        console.log('📎 Fichier uploadé:', req.file ? req.file.originalname : 'Aucun');

        const expenseId = req.params.id;
        const userId = req.session.user.id;
        const {
            account_id, expense_type, category, subcategory, social_network_detail,
            designation, supplier, quantity, unit_price, total, predictable,
            description, expense_date, remove_justification
        } = req.body;
        
        // Vérifier que la dépense existe et appartient à l'utilisateur (pour les directeurs)
        let checkQuery = 'SELECT * FROM expenses WHERE id = $1';
        let checkParams = [expenseId];
        
        if (req.session.user.role === 'directeur') {
            checkQuery += ' AND user_id = $2';
            checkParams.push(userId);
        }
        
        const existingExpenseResult = await pool.query(checkQuery, checkParams);
        
        if (existingExpenseResult.rows.length === 0) {
            console.log(`❌ ERREUR 404: Dépense ${expenseId} non trouvée ou non autorisée pour l'utilisateur ${userId}`);
            return res.status(404).json({ error: 'Dépense non trouvée ou non autorisée' });
        }
        
        const existingExpense = existingExpenseResult.rows[0];

        // Vérifier la restriction de 24 heures pour les directeurs réguliers (pas pour admin, DG, PCA)
        if (req.session.user.role === 'directeur') {
            const expenseCreatedAt = new Date(existingExpense.created_at);
            const now = new Date();
            const hoursDifference = (now - expenseCreatedAt) / (1000 * 60 * 60);
            
            if (hoursDifference > 24) {
                console.log(`❌ ERREUR 403: Tentative de modification de la dépense ${expenseId} après ${hoursDifference.toFixed(2)} heures par le directeur ${userId}`);
                return res.status(403).json({ 
                    error: `Modification non autorisée. Cette dépense a été créée il y a ${Math.floor(hoursDifference)} heures.`
                });
            }
        }
        
        const newAmount = parseFloat(total) || 0;
        console.log(`💰 Montant total extrait du body: "${total}", converti en: ${newAmount}`);
        
        if (newAmount <= 0) {
            console.log(`❌ ERREUR 400: Montant invalide: ${newAmount}`);
            return res.status(400).json({ error: 'Le montant doit être supérieur à zéro' });
        }
        
        // Gérer le justificatif
        let justificationFilename = existingExpense.justification_filename;
        let justificationPath = existingExpense.justification_path;

        if (req.file) {
            // Un nouveau fichier a été uploadé, on supprime l'ancien s'il existe
            if (justificationPath) {
                try {
                    const fullPath = path.join(__dirname, justificationPath);
                    if (fs.existsSync(fullPath)) {
                        fs.unlinkSync(fullPath);
                        console.log(`🗑️ Ancien justificatif supprimé: ${justificationPath}`);
                    }
                } catch (err) {
                    console.error(`⚠️ Erreur lors de la suppression de l'ancien justificatif: ${err.message}`);
                }
            }
            justificationFilename = req.file.originalname;
            justificationPath = req.file.path;
            console.log(`📎 Nouveau justificatif sauvegardé: ${justificationFilename} (${justificationPath})`);
        } else if (remove_justification === 'true') {
            // L'utilisateur a demandé à supprimer le justificatif existant
             if (justificationPath) {
                try {
                    const fullPath = path.join(__dirname, justificationPath);
                     if (fs.existsSync(fullPath)) {
                        fs.unlinkSync(fullPath);
                        console.log(`🗑️ Justificatif existant supprimé sur demande: ${justificationPath}`);
                    }
                } catch (err) {
                    console.error(`⚠️ Erreur lors de la suppression du justificatif sur demande: ${err.message}`);
                }
            }
            justificationFilename = null;
            justificationPath = null;
        }

        // Vérifier que le compte existe et est actif
        let account = null;
        if (account_id) {
            const accountResult = await pool.query(
                'SELECT id, current_balance, total_credited, account_name, user_id, is_active FROM accounts WHERE id = $1',
                [account_id]
            );
            
            if (accountResult.rows.length === 0) {
                console.log(`❌ ERREUR 400: Compte ${account_id} non trouvé`);
                return res.status(400).json({ error: 'Compte non trouvé' });
            }
            
            if (!accountResult.rows[0].is_active) {
                console.log(`❌ ERREUR 400: Compte ${account_id} inactif`);
                return res.status(400).json({ error: 'Le compte sélectionné est inactif' });
            }
            
            account = accountResult.rows[0];
            
            if (req.session.user.role === 'directeur' && account.user_id !== userId) {
                 console.log(`❌ ERREUR 403: Le directeur ${userId} n'est pas autorisé sur le compte ${account_id} (appartient à ${account.user_id})`);
                return res.status(403).json({ error: 'Vous ne pouvez pas dépenser sur ce compte' });
            }
        }
        
        console.log('🚀 Début de la transaction pour la modification');
        await pool.query('BEGIN');
        
        const oldAmount = parseFloat(existingExpense.total) || 0;
        const difference = newAmount - oldAmount;
        console.log(`📊 Calcul de la différence de montant: Nouveau=${newAmount}, Ancien=${oldAmount}, Différence=${difference}`);

        const oldAccountId = existingExpense.account_id;
        const newAccountId = account ? account.id : null;

        if (oldAccountId !== newAccountId) {
            console.log(`🔄 Changement de compte détecté: de ${oldAccountId || 'aucun'} à ${newAccountId || 'aucun'}`);
            if (oldAccountId) {
                await pool.query(
                    `UPDATE accounts SET 
                        current_balance = current_balance + $1,
                        total_spent = total_spent - $1
                    WHERE id = $2`,
                    [oldAmount, oldAccountId]
                );
            }
            if (newAccountId) {
                await pool.query(
                    `UPDATE accounts SET 
                        current_balance = current_balance - $1,
                        total_spent = total_spent + $1
                    WHERE id = $2`,
                    [newAmount, newAccountId]
                );
            }
        } else if (difference !== 0 && newAccountId) {
            await pool.query(
                `UPDATE accounts SET 
                    current_balance = current_balance - $1,
                    total_spent = total_spent + $1
                WHERE id = $2`,
                [difference, newAccountId]
            );
        }
        
        const updateResult = await pool.query(`
            UPDATE expenses SET
                account_id = $1, expense_type = $2, category = $3, subcategory = $4,
                social_network_detail = $5, designation = $6, supplier = $7,
                quantity = $8, unit_price = $9, total = $10, predictable = $11,
                description = $12, expense_date = $13,
                justification_filename = $14, justification_path = $15
            WHERE id = $16
            RETURNING *
        `, [
            newAccountId, expense_type, category, subcategory, social_network_detail,
            designation, supplier, parseFloat(quantity) || null, parseInt(unit_price) || null, 
            newAmount, predictable, description, expense_date,
            justificationFilename, justificationPath,
            expenseId
        ]);
        
        await pool.query('COMMIT');
        
        // Déclencher la synchronisation automatique si un compte classique est affecté
        if (oldAccountId) {
            await triggerAutoSyncIfNeeded(oldAccountId, 'modification de dépense (ancien compte)');
        }
        if (newAccountId && newAccountId !== oldAccountId) {
            await triggerAutoSyncIfNeeded(newAccountId, 'modification de dépense (nouveau compte)');
        }
        
        res.json({
            message: 'Dépense modifiée avec succès',
            expense: updateResult.rows[0]
        });
        
    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('Erreur modification dépense:', error);
        res.status(500).json({ error: 'Erreur serveur lors de la modification de la dépense' });
    }
});

// Route pour supprimer une dépense
app.delete('/api/expenses/:id', requireAuth, requireWriteAccess, async (req, res) => {
    try {
        const expenseId = req.params.id;
        const userId = req.session.user.id;
        
        // Vérifier que la dépense existe
        let checkQuery = 'SELECT e.*, a.account_name FROM expenses e LEFT JOIN accounts a ON e.account_id = a.id WHERE e.id = $1';
        let checkParams = [expenseId];
        
        // Pour les directeurs simples, vérifier qu'ils possèdent la dépense
        if (req.session.user.role === 'directeur') {
            checkQuery += ' AND e.user_id = $2';
            checkParams.push(userId);
        }
        
        const existingExpense = await pool.query(checkQuery, checkParams);
        
        if (existingExpense.rows.length === 0) {
            return res.status(404).json({ error: 'Dépense non trouvée ou non autorisée' });
        }
        
        const expense = existingExpense.rows[0];
        
        // Vérifier la restriction de 24 heures pour les directeurs réguliers (pas pour admin, DG, PCA)
        if (req.session.user.role === 'directeur') {
            const expenseCreatedAt = new Date(expense.created_at);
            const now = new Date();
            const hoursDifference = (now - expenseCreatedAt) / (1000 * 60 * 60);
            
            if (hoursDifference > 24) {
                return res.status(403).json({ 
                    error: `Suppression non autorisée. Cette dépense a été créée il y a ${Math.floor(hoursDifference)} heures. Les directeurs ne peuvent supprimer une dépense que dans les 24 heures suivant sa création.` 
                });
            }
        }
        
        await pool.query('BEGIN');
        
        // Restaurer le solde du compte si la dépense était associée à un compte
        if (expense.account_id) {
            const expenseAmount = parseInt(expense.total) || 0;
            await pool.query(
                `UPDATE accounts SET 
                    current_balance = current_balance + $1,
                    total_spent = total_spent - $1
                WHERE id = $2`,
                [expenseAmount, expense.account_id]
            );
        }
        
        // Supprimer la dépense
        await pool.query('DELETE FROM expenses WHERE id = $1', [expenseId]);
        
        await pool.query('COMMIT');
        
        // Déclencher la synchronisation automatique si c'est un compte classique
        if (expense.account_id) {
            await triggerAutoSyncIfNeeded(expense.account_id, 'suppression de dépense');
        }
        
        res.json({
            message: `Dépense supprimée avec succès. Le solde du compte "${expense.account_name}" a été restauré.`
        });
        
    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('Erreur suppression dépense:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour modifier un crédit (admin/DG/PCA seulement)
app.put('/api/credit-history/:id', requireAdminAuth, async (req, res) => {
    try {
        const creditId = req.params.id;
        const { amount, description, source_table } = req.body;
        const userId = req.session.user.id;
        const userRole = req.session.user.role;
        
        // Vérifier les permissions
        if (!['admin', 'directeur_general', 'pca'].includes(userRole)) {
            return res.status(403).json({ error: 'Accès non autorisé' });
        }
        
        // Vérifier que le crédit existe
        let existingCredit;
        let accountId;
        
        if (source_table === 'credit_history') {
            const result = await pool.query(
                'SELECT ch.*, a.account_name FROM credit_history ch JOIN accounts a ON ch.account_id = a.id WHERE ch.id = $1',
                [creditId]
            );
            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Crédit non trouvé' });
            }
            existingCredit = result.rows[0];
            accountId = existingCredit.account_id;
        } else if (source_table === 'special_credit_history') {
            const result = await pool.query(
                'SELECT sch.*, a.account_name FROM special_credit_history sch JOIN accounts a ON sch.account_id = a.id WHERE sch.id = $1',
                [creditId]
            );
            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Crédit non trouvé' });
            }
            existingCredit = result.rows[0];
            accountId = existingCredit.account_id;
        } else if (source_table === 'creance_operations') {
            const result = await pool.query(
                `SELECT co.*, a.account_name, cc.account_id 
                 FROM creance_operations co 
                 JOIN creance_clients cc ON co.client_id = cc.id 
                 JOIN accounts a ON cc.account_id = a.id 
                 WHERE co.id = $1 AND co.operation_type = 'credit'`,
                [creditId]
            );
            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Crédit non trouvé' });
            }
            existingCredit = result.rows[0];
            accountId = existingCredit.account_id;
        } else {
            return res.status(400).json({ error: 'Type de crédit invalide' });
        }
        
        const oldAmount = existingCredit.amount;
        const newAmount = parseInt(amount);
        
        if (isNaN(newAmount) || newAmount <= 0) {
            return res.status(400).json({ error: 'Montant invalide' });
        }
        
        await pool.query('BEGIN');
        
        try {
            // Mettre à jour le crédit selon sa table source
            if (source_table === 'credit_history') {
                await pool.query(
                    'UPDATE credit_history SET amount = $1, description = $2 WHERE id = $3',
                    [newAmount, description || existingCredit.description, creditId]
                );
            } else if (source_table === 'special_credit_history') {
                await pool.query(
                    'UPDATE special_credit_history SET amount = $1, comment = $2 WHERE id = $3',
                    [newAmount, description || existingCredit.comment, creditId]
                );
            } else if (source_table === 'creance_operations') {
                await pool.query(
                    'UPDATE creance_operations SET amount = $1, description = $2 WHERE id = $3',
                    [newAmount, description || existingCredit.description, creditId]
                );
            }
            
            // Recalculer le solde du compte
            const accountStats = await pool.query(`
                UPDATE accounts 
                SET 
                    total_credited = COALESCE((SELECT SUM(amount) FROM credit_history WHERE account_id = $1), 0) +
                                   COALESCE((SELECT SUM(amount) FROM special_credit_history WHERE account_id = $1), 0),
                    current_balance = COALESCE((SELECT SUM(amount) FROM credit_history WHERE account_id = $1), 0) +
                                    COALESCE((SELECT SUM(amount) FROM special_credit_history WHERE account_id = $1), 0) -
                                    COALESCE((SELECT SUM(total) FROM expenses WHERE account_id = $1), 0)
                WHERE id = $1
                RETURNING account_name, current_balance, total_credited
            `, [accountId]);
            
            await pool.query('COMMIT');
            
            // Vérifier si le compte modifié est de type classique pour la synchronisation
            const accountTypeCheck = await pool.query('SELECT account_type FROM accounts WHERE id = $1', [accountId]);
            if (accountTypeCheck.rows.length > 0 && accountTypeCheck.rows[0].account_type === 'classique') {
                await forceSyncAllAccountsAfterCreditOperation();
            }
            
            console.log(`[Admin] Crédit ${creditId} modifié par ${req.session.user.username}: ${oldAmount} → ${newAmount}`);
            
            res.json({ 
                success: true, 
                message: `Crédit modifié avec succès: ${formatCurrency(oldAmount)} → ${formatCurrency(newAmount)}`,
                account: accountStats.rows[0],
                credit: {
                    id: creditId,
                    amount: newAmount,
                    description: description || existingCredit.description,
                    account_name: existingCredit.account_name
                }
            });
            
        } catch (error) {
            await pool.query('ROLLBACK');
            throw error;
        }
        
    } catch (error) {
        console.error('Erreur modification crédit:', error);
        res.status(500).json({ error: 'Erreur serveur lors de la modification' });
    }
});

// Route pour supprimer un crédit (pour admin/DG/PCA)
app.delete('/api/credit-history/:id', requireAdminAuth, async (req, res) => {
    try {
        const creditId = req.params.id;
        const userId = req.session.user.id;
        const userRole = req.session.user.role;
        
        // Vérifier que le crédit existe
        const existingCredit = await pool.query(
            'SELECT ch.*, a.account_name FROM credit_history ch JOIN accounts a ON ch.account_id = a.id WHERE ch.id = $1',
            [creditId]
        );
        
        if (existingCredit.rows.length === 0) {
            return res.status(404).json({ error: 'Crédit non trouvé' });
        }
        
        const credit = existingCredit.rows[0];
        
        // Vérifications des permissions selon le rôle
        if (!['admin', 'directeur_general', 'pca'].includes(userRole)) {
            return res.status(403).json({ error: 'Accès non autorisé' });
        }
        
        // Démarrer la transaction avec un client dédié
        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');

            // Supprimer le crédit
            await client.query('DELETE FROM credit_history WHERE id = $1', [creditId]);
            
            // Recalculer le total crédité et le solde du compte
            const accountStats = await client.query(`
                UPDATE accounts 
                SET 
                    total_credited = COALESCE((SELECT SUM(amount) FROM credit_history WHERE account_id = $1), 0),
                    current_balance = COALESCE((SELECT SUM(amount) FROM credit_history WHERE account_id = $1), 0) - 
                                    COALESCE((SELECT SUM(total) FROM expenses WHERE account_id = $1), 0)
                WHERE id = $1
                RETURNING account_name, current_balance, total_credited
            `, [credit.account_id]);
            
            await client.query('COMMIT');
            
            // Déclencher la synchronisation automatique si c'est un compte classique
            await triggerAutoSyncIfNeeded(credit.account_id, 'suppression de crédit');
            
            console.log(`[Admin] Crédit ${creditId} supprimé par ${req.session.user.username}`);
            
            res.json({ 
                success: true, 
                message: `Crédit de ${formatCurrency(credit.amount)} sur ${credit.account_name} supprimé avec succès`,
                account: accountStats.rows[0]
            });
            
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
        
    } catch (error) {
        console.error('Erreur suppression crédit (admin):', error);
        res.status(500).json({ error: 'Erreur serveur lors de la suppression' });
    }
});
// Route pour supprimer un crédit de directeur
app.delete('/api/director/credit-history/:id', requireAuth, async (req, res) => {
    try {
        const creditId = req.params.id;
        const userId = req.session.user.id;
        const userRole = req.session.user.role;
        
        // Vérifier que le crédit existe dans special_credit_history
        const existingCredit = await pool.query(
            'SELECT sch.*, a.account_name FROM special_credit_history sch JOIN accounts a ON sch.account_id = a.id WHERE sch.id = $1',
            [creditId]
        );
        
        if (existingCredit.rows.length === 0) {
            return res.status(404).json({ error: 'Crédit non trouvé' });
        }
        
        const credit = existingCredit.rows[0];
        
        // Vérifications des permissions selon le rôle
        if (['admin', 'directeur_general', 'pca'].includes(userRole)) {
            // Admin/DG/PCA peuvent supprimer n'importe quel crédit
        } else if (userRole === 'directeur') {
            // Les directeurs ne peuvent supprimer que leurs propres crédits et dans les 24h
            if (credit.credited_by !== userId) {
                return res.status(403).json({ error: 'Vous ne pouvez supprimer que vos propres crédits' });
            }
            
            const creditDate = new Date(credit.created_at);
            const now = new Date();
            const hoursDifference = (now - creditDate) / (1000 * 60 * 60);
            
            if (hoursDifference > 24) {
                return res.status(403).json({ 
                    error: `Suppression non autorisée - Plus de 24 heures écoulées (${Math.floor(hoursDifference)}h)`
                });
            }
        } else {
            return res.status(403).json({ error: 'Accès non autorisé' });
        }
        
        // Démarrer la transaction avec un client dédié
        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');

            // Supprimer le crédit
            await client.query('DELETE FROM special_credit_history WHERE id = $1', [creditId]);
            
            // Recalculer le solde du compte en prenant en compte tous les types de crédits
            const accountStats = await client.query(`
                UPDATE accounts 
                SET 
                    total_credited = COALESCE((SELECT SUM(amount) FROM credit_history WHERE account_id = $1), 0) +
                                   COALESCE((SELECT SUM(amount) FROM special_credit_history WHERE account_id = $1), 0),
                    current_balance = COALESCE((SELECT SUM(amount) FROM credit_history WHERE account_id = $1), 0) +
                                    COALESCE((SELECT SUM(amount) FROM special_credit_history WHERE account_id = $1), 0) -
                                    COALESCE((SELECT SUM(total) FROM expenses WHERE account_id = $1), 0)
                WHERE id = $1
                RETURNING account_name, current_balance, total_credited
            `, [credit.account_id]);
            
            await client.query('COMMIT');
            
            // Déclencher la synchronisation automatique si c'est un compte classique
            await triggerAutoSyncIfNeeded(credit.account_id, 'suppression de crédit de directeur');
            
            console.log(`[Directeur] Crédit ${creditId} supprimé par ${req.session.user.username}`);
            
            res.json({ 
                success: true, 
                message: `Crédit de ${formatCurrency(credit.amount)} sur ${credit.account_name} supprimé avec succès`,
                account: accountStats.rows[0]
            });
            
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
        
    } catch (error) {
        console.error('Erreur suppression crédit (directeur):', error);
        res.status(500).json({ error: 'Erreur serveur lors de la suppression' });
    }
});

// Route pour les points de vente
app.get('/api/points-vente', requireAuth, async (req, res) => {
    try {
        const data = await fs.promises.readFile(path.join(__dirname, 'points_vente.json'), 'utf8');
        res.json(JSON.parse(data));
    } catch (error) {
        console.error('Erreur lecture points_vente.json:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Routes pour les catégories
app.get('/api/categories', requireAuth, (req, res) => {
    try {
        const categoriesData = JSON.parse(fs.readFileSync('categories_config.json', 'utf8'));
        res.json(categoriesData);
    } catch (error) {
        console.error('Erreur lecture fichier catégories:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.get('/api/categories/types', requireAuth, (req, res) => {
    try {
        const categoriesData = JSON.parse(fs.readFileSync('categories_config.json', 'utf8'));
        const types = categoriesData.types.map(type => ({
            id: type.id,
            name: type.name
        }));
        res.json(types);
    } catch (error) {
        console.error('Erreur lecture types:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// API endpoint to get distinct expense types from database
app.get('/api/expense-types', requireAuth, async (req, res) => {
    try {
        console.log('📋 GET EXPENSE TYPES: Fetching distinct expense types from database');
        
        const query = `
            SELECT 
                expense_type, 
                COUNT(*) as count 
            FROM expenses 
            GROUP BY expense_type 
            ORDER BY expense_type ASC
        `;
        
        const { rows } = await pool.query(query);
        
        // Map expense types with proper formatting
        const expenseTypes = rows.map(row => {
            let displayName = row.expense_type;
            let value = row.expense_type;
            
            // Handle null expense types
            if (!row.expense_type) {
                displayName = 'Non Catégorisé';
                value = 'Non Catégorisé';
            }
            
            // Create user-friendly display names
            const displayNameMap = {
                'tresorerie': 'Trésorerie',
                'achatbovin': 'Achat Bovin',
                'achatovin': 'Achat Ovin',
                'depense_mata_group': 'Dépense Mata Group',
                'depense_mata_prod': 'Dépense Mata Prod',
                'depense_marketing': 'Dépense Marketing',
                'fournisseur': 'Fournisseur',
                'autres': 'Autres',
                'achat': 'Achat',
                'AutresAll': 'Autres All'
            };
            
            if (displayNameMap[value]) {
                displayName = displayNameMap[value];
            }
            
            return {
                value: value,
                label: displayName,
                count: parseInt(row.count)
            };
        });
        
        console.log(`📋 GET EXPENSE TYPES: Found ${expenseTypes.length} distinct expense types`);
        res.json(expenseTypes);
        
    } catch (error) {
        console.error('❌ GET EXPENSE TYPES: Error fetching expense types:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.get('/api/categories/by-type/:typeId', requireAuth, (req, res) => {
    try {
        const { typeId } = req.params;
        const categoriesData = JSON.parse(fs.readFileSync('categories_config.json', 'utf8'));
        const type = categoriesData.types.find(t => t.id === typeId);
        
        if (!type) {
            return res.status(404).json({ error: 'Type non trouvé' });
        }
        
        res.json(type);
    } catch (error) {
        console.error('Erreur lecture catégories par type:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route principale
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Route pour la page de réconciliation Mata (alias /migrate-to-skills)
app.get('/migrate-to-skills', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'reconciliation_mata.html'));
});

// Route pour la page SQL (requêtes SELECT uniquement)
app.get('/sql-query', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'sql_query.html'));
});

// API : Exécuter une requête SQL SELECT uniquement (lecture seule)
app.post('/api/sql/execute', requireAdminAuth, async (req, res) => {
    try {
        const { query } = req.body;
        if (!query || typeof query !== 'string') {
            return res.status(400).json({ error: 'Requête SQL manquante' });
        }

        // Validation : requêtes SELECT uniquement
        const forbidden = ['INSERT', 'UPDATE', 'DELETE', 'DROP', 'CREATE', 'ALTER', 'TRUNCATE', 'GRANT', 'REVOKE', 'EXECUTE', 'EXEC'];
        let normalized = query
            .replace(/--[^\n]*/g, ' ')           // supprimer commentaires --
            .replace(/\/\*[\s\S]*?\*\//g, ' ')    // supprimer commentaires /* */
            .replace(/\s+/g, ' ')
            .trim()
            .toUpperCase();

        if (!normalized) {
            return res.status(400).json({ error: 'Requête vide' });
        }

        const startsWithSelect = normalized.startsWith('SELECT ') || normalized.startsWith('WITH ');
        if (!startsWithSelect) {
            return res.status(400).json({ error: 'Seules les requêtes SELECT (ou WITH) sont autorisées' });
        }

        for (const kw of forbidden) {
            const regex = new RegExp(`\\b${kw}\\b`, 'i');
            if (regex.test(query)) {
                return res.status(400).json({ error: `Mot-clé interdit: ${kw}` });
            }
        }

        const result = await pool.query(query);
        res.json({
            rows: result.rows,
            rowCount: result.rowCount
        });
    } catch (err) {
        console.error('Erreur SQL:', err.message);
        res.status(500).json({ error: err.message || 'Erreur lors de l\'exécution de la requête' });
    }
});

// Route pour créer/assigner un compte à un directeur
app.post('/api/accounts/create', requireAdminAuth, async (req, res) => {
    try {
        const { user_id, account_name, initial_amount, description, account_type, creditors, category_type, credit_permission_user_id, partner_directors } = req.body;
        const created_by = req.session.user.id;
        
        // Validation du type de compte
        const validTypes = ['classique', 'partenaire', 'statut', 'Ajustement', 'depot', 'creance'];
        if (account_type && !validTypes.includes(account_type)) {
            return res.status(400).json({ error: 'Type de compte invalide' });
        }
        
        const finalAccountType = account_type || 'classique';
        
        // Vérifier le directeur pour les comptes classiques et créance
        if ((finalAccountType === 'classique' || finalAccountType === 'creance') && user_id) {
            // Vérifier que l'utilisateur existe et est un directeur
            const userResult = await pool.query(
                'SELECT * FROM users WHERE id = $1 AND role = $2',
                [user_id, 'directeur']
            );
            
            if (userResult.rows.length === 0) {
                return res.status(404).json({ error: 'Directeur non trouvé' });
            }
        }
        
        // Vérifier si le nom du compte existe déjà
        const existingName = await pool.query(
            'SELECT * FROM accounts WHERE account_name = $1 AND is_active = true',
            [account_name]
        );
        
        if (existingName.rows.length > 0) {
            return res.status(400).json({ error: 'Ce nom de compte existe déjà' });
        }
        
        await pool.query('BEGIN');
        
        // Créer le compte avec le type spécifié
        const accountResult = await pool.query(
            `INSERT INTO accounts (user_id, account_name, current_balance, total_credited, total_spent, transfert_entrants, transfert_sortants, created_by, account_type, access_restricted, allowed_roles, category_type) 
             VALUES ($1, $2, $3, $4, 0, 0, 0, $5, $6, $7, $8, $9) RETURNING *`,
            [
                (finalAccountType === 'classique' || finalAccountType === 'creance') ? user_id : null,
                account_name, 
                parseInt(initial_amount) || 0, 
                parseInt(initial_amount) || 0, 
                created_by,
                finalAccountType,
                finalAccountType === 'Ajustement', // access_restricted seulement pour Ajustement
                finalAccountType === 'Ajustement' ? ['directeur_general', 'pca'] : null,
                finalAccountType === 'classique' ? category_type : null
            ]
        );
        
        const newAccount = accountResult.rows[0];

        // Si une permission de crédit est spécifiée pour un compte classique, l'ajouter
        if (newAccount.account_type === 'classique' && credit_permission_user_id) {
            console.log(`[API] Granting credit permission for account ${newAccount.id} to user ${credit_permission_user_id}`);
            await pool.query(
                'INSERT INTO account_credit_permissions (account_id, user_id, granted_by) VALUES ($1, $2, $3)',
                [newAccount.id, credit_permission_user_id, created_by]
            );
        }
        
        // Pour les comptes créance, ajouter les créditeurs
        if (finalAccountType === 'creance' && creditors && creditors.length > 0) {
            for (const creditor of creditors) {
                await pool.query(
                    'INSERT INTO account_creditors (account_id, user_id, creditor_type) VALUES ($1, $2, $3)',
                    [accountResult.rows[0].id, creditor.user_id, creditor.type]
                );
            }
        }
        
        // Pour les comptes partenaires, ajouter les directeurs assignés
        if (finalAccountType === 'partenaire' && partner_directors && partner_directors.length > 0) {
            console.log(`[API] Assigning ${partner_directors.length} directors to partner account ${newAccount.id}`);
            for (const directorId of partner_directors) {
                await pool.query(
                    'INSERT INTO partner_account_directors (account_id, user_id) VALUES ($1, $2)',
                    [newAccount.id, directorId]
                );
            }
        }
        
        // Si un montant initial est fourni, enregistrer l'historique
        if (initial_amount && parseInt(initial_amount) > 0) {
            await pool.query(
                'INSERT INTO credit_history (account_id, credited_by, amount, description) VALUES ($1, $2, $3, $4)',
                [newAccount.id, created_by, parseInt(initial_amount), description || 'Création du compte avec solde initial']
            );
        }
        
        await pool.query('COMMIT');
        
        res.json({ 
            message: 'Compte créé avec succès', 
            account: newAccount
        });
    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('Erreur création compte:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour désactiver un compte
app.delete('/api/accounts/:accountId', requireAdminAuth, async (req, res) => {
    try {
        const { accountId } = req.params;
        
        // Désactiver le compte au lieu de le supprimer
        const result = await pool.query(
            'UPDATE accounts SET is_active = false WHERE id = $1 RETURNING *',
            [accountId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Compte non trouvé' });
        }
        
        res.json({ message: 'Compte désactivé avec succès' });
    } catch (error) {
        console.error('Erreur désactivation compte:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour supprimer définitivement un compte (seulement si aucune dépense)
app.delete('/api/accounts/:accountId/delete', requireAdminAuth, async (req, res) => {
    try {
        const { accountId } = req.params;
        
        // Vérifier d'abord si le compte a des dépenses
        const expenseCheck = await pool.query(
            'SELECT COUNT(*) as count FROM expenses WHERE account_id = $1',
            [accountId]
        );
        
        if (parseInt(expenseCheck.rows[0].count) > 0) {
            return res.status(400).json({ error: 'Impossible de supprimer un compte avec des dépenses' });
        }
        
        await pool.query('BEGIN');
        
        // Supprimer les enregistrements liés
        await pool.query('DELETE FROM account_creditors WHERE account_id = $1', [accountId]);
        await pool.query('DELETE FROM partner_account_directors WHERE account_id = $1', [accountId]);
        await pool.query('DELETE FROM special_credit_history WHERE account_id = $1', [accountId]);
        await pool.query('DELETE FROM credit_history WHERE account_id = $1', [accountId]);
        
        // Supprimer le compte
        const result = await pool.query(
            'DELETE FROM accounts WHERE id = $1 RETURNING account_name',
            [accountId]
        );
        
        if (result.rows.length === 0) {
            await pool.query('ROLLBACK');
            return res.status(404).json({ error: 'Compte non trouvé' });
        }
        
        await pool.query('COMMIT');
        
        res.json({ message: `Compte "${result.rows[0].account_name}" supprimé définitivement` });
    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('Erreur suppression compte:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour modifier un compte
app.put('/api/accounts/:accountId/update', requireAdminAuth, async (req, res) => {
    try {
        const { accountId } = req.params;
        const { user_id, account_name, description, account_type, category_type, creditors, credit_permission_user_id, initial_amount } = req.body;
        
        console.log(`[API] Updating account ${accountId} with data:`, {
            user_id, account_name, account_type, category_type, 
            creditors: creditors ? creditors.length : 'undefined',
            credit_permission_user_id
        });
        
        await pool.query('BEGIN');
        
        // Mettre à jour les informations de base du compte
        // user_id peut être null pour certains types de comptes (partenaire, statut, Ajustement, depot)
        let updateQuery, updateValues;
        
        // Pour les comptes statut, permettre la modification du solde
        if (account_type === 'statut' && initial_amount !== undefined) {
            // Récupérer l'ancien solde pour l'historique
            const oldAccountResult = await pool.query('SELECT current_balance, total_spent FROM accounts WHERE id = $1', [accountId]);
            const oldBalance = oldAccountResult.rows[0]?.current_balance || 0;
            const oldTotalSpent = oldAccountResult.rows[0]?.total_spent || 0;
            
            updateQuery = `UPDATE accounts 
                          SET user_id = $1, account_name = $2, account_type = $3, category_type = $4, 
                              current_balance = $5, total_credited = $5, total_spent = 0, updated_at = CURRENT_TIMESTAMP
                          WHERE id = $6 RETURNING *`;
            updateValues = [user_id || null, account_name, account_type, category_type || null, parseFloat(initial_amount) || 0, accountId];
            
            // Historiser la modification si le solde a changé
            if (parseFloat(initial_amount) !== oldBalance) {
                await pool.query(
                    `INSERT INTO special_credit_history (account_id, amount, credited_by, comment, credit_date, operation_type, account_type) 
                     VALUES ($1, $2, $3, $4, CURRENT_DATE, 'balance_update', $5)`,
                    [
                        accountId, 
                        parseFloat(initial_amount) || 0, 
                        req.session.user.id, 
                        `Modification solde statut: ${oldBalance} → ${parseFloat(initial_amount) || 0} FCFA. Dépenses remises à zéro (ancien total: ${oldTotalSpent} FCFA)`,
                        account_type
                    ]
                );
            }
        } else {
            updateQuery = `UPDATE accounts 
                          SET user_id = $1, account_name = $2, account_type = $3, category_type = $4, updated_at = CURRENT_TIMESTAMP
                          WHERE id = $5 RETURNING *`;
            updateValues = [user_id || null, account_name, account_type, category_type || null, accountId];
        }
        
        const updateResult = await pool.query(updateQuery, updateValues);
        
        if (updateResult.rows.length === 0) {
            await pool.query('ROLLBACK');
            return res.status(404).json({ error: 'Compte non trouvé' });
        }
        
        const updatedBy = req.session.user.id;
        
        // Gérer les permissions de crédit pour les comptes classiques
        if (account_type === 'classique') {
            // Supprimer les anciennes permissions de crédit
            await pool.query('DELETE FROM account_credit_permissions WHERE account_id = $1', [accountId]);
            
            // Ajouter la nouvelle permission si spécifiée
            if (credit_permission_user_id && credit_permission_user_id !== '') {
                await pool.query(
                    'INSERT INTO account_credit_permissions (account_id, user_id, granted_by) VALUES ($1, $2, $3)',
                    [accountId, parseInt(credit_permission_user_id), updatedBy]
                );
                console.log(`[API] Added credit permission for account ${accountId} to user ${credit_permission_user_id}`);
            } else {
                console.log(`[API] No credit permission specified for classic account ${accountId}`);
            }
        }
        
        // Gérer les créditeurs pour les comptes créance (optionnel)
        if (account_type === 'creance') {
            // Supprimer les anciens créditeurs
            await pool.query('DELETE FROM account_creditors WHERE account_id = $1', [accountId]);
            
            // Ajouter les nouveaux créditeurs seulement s'ils sont fournis
            if (creditors && Array.isArray(creditors) && creditors.length > 0) {
                for (const creditor of creditors) {
                    if (creditor.user_id && creditor.type) {
                        await pool.query(
                            'INSERT INTO account_creditors (account_id, user_id, creditor_type) VALUES ($1, $2, $3)',
                            [accountId, creditor.user_id, creditor.type]
                        );
                    }
                }
                console.log(`[API] Added ${creditors.length} creditors for account ${accountId}`);
            } else {
                console.log(`[API] No creditors provided for creance account ${accountId}, keeping it empty`);
            }
        } else if (account_type !== 'creance') {
            // Supprimer les créditeurs si le type n'est plus créance
            await pool.query('DELETE FROM account_creditors WHERE account_id = $1', [accountId]);
            console.log(`[API] Removed creditors for non-creance account ${accountId}`);
        }
        
        await pool.query('COMMIT');
        
        console.log(`[API] Successfully updated account ${accountId}`);
        res.json({ message: 'Compte modifié avec succès', account: updateResult.rows[0] });
    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('Erreur modification compte:', error);
        console.error('Stack trace:', error.stack);
        console.error('SQL State:', error.code);
        console.error('Detail:', error.detail);
        res.status(500).json({ 
            error: 'Erreur serveur lors de la modification du compte',
            detail: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Route pour activer un compte
app.put('/api/accounts/:accountId/activate', requireAdminAuth, async (req, res) => {
    try {
        const { accountId } = req.params;
        
        const result = await pool.query(
            'UPDATE accounts SET is_active = true WHERE id = $1 RETURNING *',
            [accountId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Compte non trouvé' });
        }
        
        res.json({ message: 'Compte activé avec succès' });
    } catch (error) {
        console.error('Erreur activation compte:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour obtenir tous les directeurs pour la création de comptes
app.get('/api/users/directors-for-accounts', requireAdminAuth, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT DISTINCT u.id, u.username, u.full_name, u.role,
                   CASE WHEN EXISTS(SELECT 1 FROM accounts WHERE user_id = u.id AND is_active = true) 
                        THEN true ELSE false END as has_account
            FROM users u 
            WHERE u.role IN ('directeur', 'directeur_general', 'pca')
            ORDER BY u.role, u.username
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Erreur récupération directeurs pour comptes:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour obtenir seulement les directeurs (pas directeur_general ni pca)
app.get('/api/users/directors-only', requireAdminAuth, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT DISTINCT u.id, u.username, u.full_name, u.role,
                   CASE WHEN EXISTS(SELECT 1 FROM accounts WHERE user_id = u.id AND is_active = true) 
                        THEN true ELSE false END as has_account
            FROM users u 
            WHERE u.role = 'directeur'
            ORDER BY u.username
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Erreur récupération directeurs seulement:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour obtenir les directeurs sans compte
app.get('/api/users/without-account', requireAdminAuth, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT u.id, u.username, u.full_name 
            FROM users u 
            LEFT JOIN accounts a ON u.id = a.user_id 
            WHERE u.role = 'directeur' AND (a.id IS NULL OR a.is_active = false)
            ORDER BY u.username
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Erreur récupération utilisateurs sans compte:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour obtenir les types de comptes disponibles
app.get('/api/accounts/types', requireAuth, (req, res) => {
    const accountTypes = [
        { id: 'classique', name: 'Compte Classique', description: 'Compte standard assigné à un directeur. Le DG peut donner des permissions de crédit.' },
        { id: 'partenaire', name: 'Compte Partenaire', description: 'Compte accessible à tous les utilisateurs' },
        { id: 'statut', name: 'Compte Statut', description: 'Compte où le crédit écrase le solde existant (DG/PCA uniquement)' },
        { id: 'Ajustement', name: 'Compte Ajustement', description: 'Compte spécial pour les ajustements comptables (DG/PCA uniquement)' },
        { id: 'creance', name: 'Compte Créance', description: 'Compte spécial pour le suivi des créances clients. Isolé des calculs généraux.' }
    ];
    res.json(accountTypes);
});

// Route pour obtenir l'historique des crédits spéciaux
app.get('/api/accounts/:accountId/special-history', requireAuth, async (req, res) => {
    try {
        const { accountId } = req.params;
        
        const result = await pool.query(`
            SELECT sch.*, u.full_name as credited_by_name
            FROM special_credit_history sch
            JOIN users u ON sch.credited_by = u.id
            WHERE sch.account_id = $1
            ORDER BY sch.created_at DESC
        `, [accountId]);
        
        res.json(result.rows);
    } catch (error) {
        console.error('Erreur récupération historique spécial:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour ajouter/modifier les créditeurs d'un compte créance
app.post('/api/accounts/:accountId/creditors', requireAdminAuth, async (req, res) => {
    try {
        const { accountId } = req.params;
        const { creditors } = req.body;
        
        // Vérifier que le compte est de type créance
        const accountResult = await pool.query(
            'SELECT * FROM accounts WHERE id = $1 AND account_type = $2 AND is_active = true',
            [accountId, 'creance']
        );
        
        if (accountResult.rows.length === 0) {
            return res.status(404).json({ error: 'Compte créance non trouvé' });
        }
        
        await pool.query('BEGIN');
        
        // Supprimer les anciens créditeurs
        await pool.query('DELETE FROM account_creditors WHERE account_id = $1', [accountId]);
        
        // Ajouter les nouveaux créditeurs
        if (creditors && creditors.length > 0) {
            for (const creditor of creditors) {
                await pool.query(
                    'INSERT INTO account_creditors (account_id, user_id, creditor_type) VALUES ($1, $2, $3)',
                    [accountId, creditor.user_id, creditor.type]
                );
            }
        }
        
        await pool.query('COMMIT');
        
        res.json({ message: 'Créditeurs mis à jour avec succès' });
    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('Erreur mise à jour créditeurs:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour vérifier si un utilisateur peut créditer un compte spécifique
app.get('/api/accounts/:accountId/can-credit', requireAuth, async (req, res) => {
    try {
        const { accountId } = req.params;
        const userId = req.session.user.id;
        const userRole = req.session.user.role;
        
        const accountResult = await pool.query(
            'SELECT account_type FROM accounts WHERE id = $1 AND is_active = true',
            [accountId]
        );
        
        if (accountResult.rows.length === 0) {
            return res.json({ canCredit: false, reason: 'Compte non trouvé' });
        }
        
        const accountType = accountResult.rows[0].account_type;
        let canCredit = false;
        let reason = '';
        
        switch (accountType) {
            case 'classique':
            case 'fournisseur':
            case 'statut':
            case 'Ajustement':
                canCredit = userRole === 'directeur_general' || userRole === 'pca' || userRole === 'admin';
                reason = canCredit ? '' : 'Seuls le DG, le PCA et l\'admin peuvent créditer ce type de compte';
                break;
                
            case 'creance':
                if (userRole === 'directeur_general' || userRole === 'admin') {
                    canCredit = true;
                } else {
                    const creditorResult = await pool.query(
                        'SELECT 1 FROM account_creditors WHERE account_id = $1 AND user_id = $2',
                        [accountId, userId]
                    );
                    canCredit = creditorResult.rows.length > 0;
                    reason = canCredit ? '' : 'Vous n\'êtes pas autorisé à créditer ce compte créance';
                }
                break;
                
            case 'partenaire':
                canCredit = true;
                break;
                
            default:
                canCredit = false;
                reason = 'Type de compte non reconnu';
        }
        
        res.json({ canCredit, reason, accountType });
    } catch (error) {
        console.error('Erreur vérification crédit:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// === ROUTES POUR LES COMPTES PARTENAIRES ===

// Route pour obtenir le résumé des livraisons partenaires
app.get('/api/partner/delivery-summary', requireAuth, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT * FROM partner_delivery_summary
            ORDER BY account_name
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Erreur récupération résumé livraisons:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour obtenir les livraisons d'un compte partenaire
app.get('/api/partner/:accountId/deliveries', requireAuth, async (req, res) => {
    try {
        const { accountId } = req.params;
        
        const result = await pool.query(`
            SELECT pd.*, 
                   u.full_name as created_by_name, 
                   uv.full_name as validated_by_name,
                   ufv.full_name as first_validated_by_name,
                   ur.full_name as rejected_by_name
            FROM partner_deliveries pd
            JOIN users u ON pd.created_by = u.id
            LEFT JOIN users uv ON pd.validated_by = uv.id
            LEFT JOIN users ufv ON pd.first_validated_by = ufv.id
            LEFT JOIN users ur ON pd.rejected_by = ur.id
            WHERE pd.account_id = $1
            ORDER BY pd.delivery_date DESC, pd.created_at DESC
        `, [accountId]);
        
        res.json(result.rows);
    } catch (error) {
        console.error('Erreur récupération livraisons:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});


// === ROUTES POUR LA G+�N+�RATION DE FACTURES PARTENAIRES ===
// IMPORTANT: Ces routes doivent +�tre AVANT les routes g+�n+�rales avec :deliveryId

// Route pour pr+�visualiser les livraisons d'un partenaire pour une p+�riode donn+�e
app.get('/api/partner/deliveries/preview', requireAuth, async (req, res) => {
    try {
        const { account_id, start_date, end_date } = req.query;
        
        if (!account_id || !start_date || !end_date) {
            return res.status(400).json({ error: 'Param+�tres manquants: account_id, start_date, end_date requis' });
        }
        
        // V+�rifier que le compte existe et est de type partenaire
        const accountResult = await pool.query(
            'SELECT * FROM accounts WHERE id = $1 AND account_type = $2 AND is_active = true',
            [account_id, 'partenaire']
        );
        
        if (accountResult.rows.length === 0) {
            return res.status(404).json({ error: 'Compte partenaire non trouv+�' });
        }
        
        // R+�cup+�rer les livraisons valid+�es pour la p+�riode
        const deliveriesResult = await pool.query(`
            SELECT pd.*, u.full_name as created_by_name, v.full_name as validated_by_name
            FROM partner_deliveries pd
            LEFT JOIN users u ON pd.created_by = u.id
            LEFT JOIN users v ON pd.validated_by = v.id
            WHERE pd.account_id = $1 
            AND pd.is_validated = true 
            AND pd.delivery_date >= $2 
            AND pd.delivery_date <= $3
            ORDER BY pd.delivery_date ASC, pd.created_at ASC
        `, [account_id, start_date, end_date]);
        
        res.json({
            account: accountResult.rows[0],
            deliveries: deliveriesResult.rows,
            period: { start_date, end_date }
        });
        
    } catch (error) {
        console.error('Erreur pr+�visualisation livraisons partenaire:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour g+�n+�rer et servir directement le PDF de facture partenaire
app.get('/api/partner/generate-invoice-pdf-direct', requireAuth, async (req, res) => {
    // Configuration sp+�cifique pour cette route
    req.setTimeout(300000); // 5 minutes
    res.setTimeout(300000); // 5 minutes
    
    try {
        const { partner_name, account_id, start_date, end_date, filename } = req.query;
        
        if (!partner_name || !account_id || !start_date || !end_date) {
            return res.status(400).json({ error: 'Param+�tres manquants: partner_name, account_id, start_date, end_date requis' });
        }
        
        console.log('=��� PARTNER PDF: G+�n+�ration pour', req.session.user.username);
        console.log('=��� PARTNER PDF: Partenaire:', partner_name);
        console.log('=��� PARTNER PDF: P+�riode:', start_date, 'au', end_date);
        
        // V+�rifier que le compte existe et est de type partenaire
        const accountResult = await pool.query(
            'SELECT * FROM accounts WHERE id = $1 AND account_type = $2 AND is_active = true',
            [account_id, 'partenaire']
        );
        
        if (accountResult.rows.length === 0) {
            return res.status(404).json({ error: 'Compte partenaire non trouv+�' });
        }
        
        // R+�cup+�rer les livraisons valid+�es pour la p+�riode
        const deliveriesResult = await pool.query(`
            SELECT pd.*, u.full_name as created_by_name, v.full_name as validated_by_name
            FROM partner_deliveries pd
            LEFT JOIN users u ON pd.created_by = u.id
            LEFT JOIN users v ON pd.validated_by = v.id
            WHERE pd.account_id = $1 
            AND pd.is_validated = true 
            AND pd.delivery_date >= $2 
            AND pd.delivery_date <= $3
            ORDER BY pd.delivery_date ASC, pd.created_at ASC
        `, [account_id, start_date, end_date]);
        
        const deliveries = deliveriesResult.rows;
        const account = accountResult.rows[0];
        
        if (deliveries.length === 0) {
            return res.status(400).json({ error: 'Aucune livraison valid+�e trouv+�e pour cette p+�riode' });
        }
        
        console.log(`📄 PARTNER PDF: ${deliveries.length} livraisons trouvées`);
        
        // Fonction helper pour formater les nombres avec des espaces normaux
        const formatAmount = (amount) => {
            const num = parseFloat(amount) || 0;
            return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
        };
        
        // Créer le PDF
        const PDFDocument = require('pdfkit');
        const doc = new PDFDocument({ 
            margin: 50,
            size: 'A4'
        });
        
        // Headers pour le PDF
        const pdfFilename = filename || `facture_${partner_name.replace(/[^a-zA-Z0-9]/g, '_')}_${start_date.replace(/-/g, '')}_${end_date.replace(/-/g, '')}.pdf`;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${pdfFilename}"`);
        res.setHeader('X-Frame-Options', 'SAMEORIGIN');
        res.setHeader('Content-Security-Policy', "frame-ancestors 'self'");
        res.setHeader('Cache-Control', 'no-cache');
        
        doc.pipe(res);
        
        // === EN-T+�TE MATA (identique au template existant) ===
        doc.fontSize(24).font('Helvetica-Bold').fillColor('#1e3a8a').text('MATA', 50, 50);
        
        doc.fontSize(9).font('Helvetica').fillColor('black');
        doc.text('Mirage, Apt Nord 603D, Residence Aquanique', 50, 80);
        doc.text('A : 01387695 2Y3 / RC : SN DKR 2024 B 29149', 50, 95);
        doc.text('Ouest foire : 78 480 95 95', 50, 110);
        doc.text('Grand Mbao / cite Aliou Sow : 77 858 96 96', 50, 125);
        
        doc.fontSize(16).font('Helvetica-Bold').fillColor('#1e3a8a').text('FACTURE', 275, 55);
        
        doc.fontSize(10).font('Helvetica').fillColor('black');
        const currentDate = new Date().toLocaleDateString('fr-FR');
        doc.text(`Date : ${currentDate}`, 450, 50);
        
        // Numero de facture base sur la date et l'ID du compte
        const invoiceNumber = `${Date.now().toString().slice(-8)}`;
        doc.fontSize(12).font('Helvetica-Bold').fillColor('#dc2626');
        doc.text(`N° : ${invoiceNumber}`, 450, 70);
        
        // Ligne de s+�paration
        doc.moveTo(50, 160).lineTo(545, 160).stroke('#1e3a8a').lineWidth(1);
        
        let yPos = 180;
        
        // Informations partenaire et periode
        doc.fontSize(12).font('Helvetica-Bold').fillColor('black');
        doc.text(`PARTENAIRE : ${partner_name}`, 50, yPos);
        yPos += 20;
        
        const periodText = start_date === end_date 
            ? `le ${new Date(start_date).toLocaleDateString('fr-FR')}`
            : `du ${new Date(start_date).toLocaleDateString('fr-FR')} au ${new Date(end_date).toLocaleDateString('fr-FR')}`;
        doc.text(`PERIODE : ${periodText}`, 50, yPos);
        yPos += 30;
        
        doc.fontSize(14).font('Helvetica-Bold').fillColor('black');
        doc.text('Livraisons Partenaire', 50, yPos);
        yPos += 30;
        
        // Tableau des livraisons
        const tableStartY = yPos;
        const colPositions = [50, 130, 230, 310, 410];
        const colWidths = [80, 100, 80, 100, 135];
        
        // En-t+�te du tableau
        doc.rect(50, tableStartY, 495, 25).fill('#1e3a8a');
        doc.fontSize(11).font('Helvetica-Bold').fillColor('white');
        doc.text('ARTICLES', colPositions[0] + 5, tableStartY + 8);
        doc.text('DESCRIPTION', colPositions[1] + 5, tableStartY + 8);
        doc.text('P. UNITAIRE', colPositions[2] + 5, tableStartY + 8);
        doc.text('PRIX TOTAL', colPositions[3] + 5, tableStartY + 8);
        doc.text('DATE', colPositions[4] + 5, tableStartY + 8);
        
        yPos = tableStartY + 25;
        let totalAmount = 0;
        
        // Lignes du tableau
        doc.fontSize(10).font('Helvetica').fillColor('black');
        
        const rowHeight = 25;
        const pageHeight = 792; // A4 height in points
        const bottomMargin = 100; // Reserve space for total and footer
        
        deliveries.forEach((delivery, index) => {
            // Check if we need a new page
            if (yPos + rowHeight > pageHeight - bottomMargin) {
                doc.addPage({ margin: 50, size: 'A4' });
                yPos = 50;
                
                // Redraw table header on new page
                doc.rect(50, yPos, 495, 25).fill('#1e3a8a');
                doc.fontSize(11).font('Helvetica-Bold').fillColor('white');
                doc.text('ARTICLES', colPositions[0] + 5, yPos + 8);
                doc.text('DESCRIPTION', colPositions[1] + 5, yPos + 8);
                doc.text('P. UNITAIRE', colPositions[2] + 5, yPos + 8);
                doc.text('PRIX TOTAL', colPositions[3] + 5, yPos + 8);
                doc.text('DATE', colPositions[4] + 5, yPos + 8);
                yPos += 25;
                
                doc.fontSize(10).font('Helvetica').fillColor('black');
            }
            
            // Alternance de couleurs de fond
            if (index % 2 === 1) {
                doc.rect(50, yPos, 495, 25).fill('#f8f9fa');
            }
            
            doc.fillColor('black');
            doc.text(parseFloat(delivery.article_count).toFixed(2), colPositions[0] + 5, yPos + 8);
            
            // Tronquer la description si trop longue
            const description = delivery.description || '-';
            const truncatedDesc = description.length > 15 ? description.substring(0, 15) + '...' : description;
            doc.text(truncatedDesc, colPositions[1] + 5, yPos + 8);
            
            const unitPrice = parseFloat(delivery.unit_price || 0);
            doc.text(formatAmount(unitPrice) + ' F', colPositions[2] + 5, yPos + 8);
            
            const amount = parseFloat(delivery.amount);
            doc.text(formatAmount(amount) + ' F', colPositions[3] + 5, yPos + 8);
            
            doc.text(new Date(delivery.delivery_date).toLocaleDateString('fr-FR'), colPositions[4] + 5, yPos + 8);
            
            totalAmount += amount;
            yPos += rowHeight;
        });
        
        yPos += 20;
        
        // Check if total section fits on current page
        if (yPos + 100 > pageHeight - 50) {
            doc.addPage({ margin: 50, size: 'A4' });
            yPos = 50;
        }
        
        // Total
        doc.rect(50, yPos, 495, 35).fill('#1e3a8a');
        doc.fontSize(14).font('Helvetica-Bold').fillColor('white');
        doc.text('MONTANT TOTAL', 70, yPos + 12);
        doc.text(`${formatAmount(totalAmount)} F`, 400, yPos + 12);
        
        yPos += 50;
        
        // Informations complementaires
        doc.fontSize(10).font('Helvetica').fillColor('black');
        const validatedBy = deliveries.find(d => d.validated_by_name)?.validated_by_name || 'Systeme';
        doc.text(`Livraisons validees par : ${validatedBy}`, 50, yPos);
        doc.text(`Partenaire : ${partner_name}`, 50, yPos + 15);
        
        // Finaliser le PDF
        doc.end();
        
        console.log('G�� PARTNER PDF: PDF g+�n+�r+� avec succ+�s');
        
    } catch (error) {
        console.error('G�� PARTNER PDF: Erreur g+�n+�ration:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Erreur lors de la g+�n+�ration du PDF' });
        }
    }
});

// Route pour obtenir une livraison spécifique
app.get('/api/partner/deliveries/:deliveryId', requireAuth, async (req, res) => {
    try {
        const { deliveryId } = req.params;
        
        const result = await pool.query(`
            SELECT pd.*, 
                   u.full_name as created_by_name, 
                   uv.full_name as validated_by_name,
                   ufv.full_name as first_validated_by_name,
                   ur.full_name as rejected_by_name
            FROM partner_deliveries pd
            JOIN users u ON pd.created_by = u.id
            LEFT JOIN users uv ON pd.validated_by = uv.id
            LEFT JOIN users ufv ON pd.first_validated_by = ufv.id
            LEFT JOIN users ur ON pd.rejected_by = ur.id
            WHERE pd.id = $1
        `, [deliveryId]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Livraison non trouvée' });
        }
        
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Erreur récupération livraison:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour ajouter une livraison partenaire
app.post('/api/partner/:accountId/deliveries', requireAuth, async (req, res) => {
    try {
        const { accountId } = req.params;
        const { delivery_date, article_count, unit_price, amount, description } = req.body;
        const created_by = req.session.user.id;
        
        // Vérifier que le compte est de type partenaire
        const accountResult = await pool.query(
            'SELECT * FROM accounts WHERE id = $1 AND account_type = $2 AND is_active = true',
            [accountId, 'partenaire']
        );
        
        if (accountResult.rows.length === 0) {
            return res.status(404).json({ error: 'Compte partenaire non trouvé' });
        }
        
        // Vérifier les permissions (DG ou directeurs assignés)
        const userRole = req.session.user.role;
        let isAuthorized = userRole === 'directeur_general' || userRole === 'admin';
        
        if (!isAuthorized && userRole === 'directeur') {
            const directorResult = await pool.query(
                'SELECT 1 FROM partner_account_directors WHERE account_id = $1 AND user_id = $2',
                [accountId, created_by]
            );
            isAuthorized = directorResult.rows.length > 0;
        }
        
        if (!isAuthorized) {
            return res.status(403).json({ error: 'Vous n\'êtes pas autorisé à ajouter des livraisons à ce compte' });
        }
        
        const result = await pool.query(`
            INSERT INTO partner_deliveries (account_id, delivery_date, article_count, unit_price, amount, description, created_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `, [accountId, delivery_date, parseFloat(article_count), parseFloat(unit_price), parseFloat(amount), description, created_by]);
        
        res.json({ 
            message: 'Livraison ajoutée avec succès (en attente de validation)', 
            delivery: result.rows[0] 
        });
    } catch (error) {
        console.error('Erreur ajout livraison:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour première validation d'une livraison partenaire
app.post('/api/partner/deliveries/:deliveryId/first-validate', requireAuth, async (req, res) => {
    try {
        const { deliveryId } = req.params;
        const validated_by = req.session.user.id;
        const userRole = req.session.user.role;
        
        // Récupérer les informations de la livraison
        const deliveryResult = await pool.query(
            'SELECT account_id, validation_status, first_validated_by FROM partner_deliveries WHERE id = $1',
            [deliveryId]
        );
        
        if (deliveryResult.rows.length === 0) {
            return res.status(404).json({ error: 'Livraison non trouvée' });
        }
        
        const delivery = deliveryResult.rows[0];
        const accountId = delivery.account_id;
        
        // Vérifier que la livraison est en statut pending
        if (delivery.validation_status !== 'pending') {
            return res.status(400).json({ error: 'Cette livraison a déjà été traitée' });
        }
        
        // Vérifier les autorisations
        let canValidate = false;
        
        if (userRole === 'directeur_general' || userRole === 'admin') {
            canValidate = true;
        } else if (userRole === 'directeur') {
            const directorResult = await pool.query(
                'SELECT 1 FROM partner_account_directors WHERE account_id = $1 AND user_id = $2',
                [accountId, validated_by]
            );
            canValidate = directorResult.rows.length > 0;
        }
        
        if (!canValidate) {
            return res.status(403).json({ error: 'Vous n\'êtes pas autorisé à valider cette livraison' });
        }
        
        // Première validation
        await pool.query(
            'UPDATE partner_deliveries SET validation_status = $1, first_validated_by = $2, first_validated_at = CURRENT_TIMESTAMP WHERE id = $3',
            ['first_validated', validated_by, deliveryId]
        );
        
        res.json({ message: 'Première validation effectuée. En attente de la seconde validation.' });
        
    } catch (error) {
        console.error('Erreur première validation:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});
// Route pour validation finale d'une livraison partenaire
app.post('/api/partner/deliveries/:deliveryId/final-validate', requireAuth, async (req, res) => {
    try {
        const { deliveryId } = req.params;
        const validated_by = req.session.user.id;
        const userRole = req.session.user.role;
        
        // Récupérer les informations de la livraison
        const deliveryResult = await pool.query(
            'SELECT account_id, validation_status, first_validated_by, amount FROM partner_deliveries WHERE id = $1',
            [deliveryId]
        );
        
        if (deliveryResult.rows.length === 0) {
            return res.status(404).json({ error: 'Livraison non trouvée' });
        }
        
        const delivery = deliveryResult.rows[0];
        const accountId = delivery.account_id;
        
        // Vérifier que la livraison est en première validation
        if (delivery.validation_status !== 'first_validated') {
            return res.status(400).json({ error: 'Cette livraison doit d\'abord recevoir une première validation' });
        }
        
        // Vérifier que ce n'est pas le même directeur
        if (delivery.first_validated_by === validated_by) {
            return res.status(400).json({ error: 'Vous ne pouvez pas faire la seconde validation de votre propre première validation' });
        }
        
        // Vérifier les autorisations
        let canValidate = false;
        
        if (userRole === 'directeur_general' || userRole === 'pca' || userRole === 'admin') {
            canValidate = true;
        } else if (userRole === 'directeur') {
            const directorResult = await pool.query(
                'SELECT 1 FROM partner_account_directors WHERE account_id = $1 AND user_id = $2',
                [accountId, validated_by]
            );
            canValidate = directorResult.rows.length > 0;
        }
        
        if (!canValidate) {
            return res.status(403).json({ error: 'Vous n\'êtes pas autorisé à valider cette livraison' });
        }
        
        await pool.query('BEGIN');
        
        // Validation finale
        await pool.query(
            'UPDATE partner_deliveries SET validation_status = $1, validated_by = $2, validated_at = CURRENT_TIMESTAMP, is_validated = true WHERE id = $3',
            ['fully_validated', validated_by, deliveryId]
        );
        
        // Déduire le montant du solde du compte
        await pool.query(
            'UPDATE accounts SET current_balance = current_balance - $1, total_spent = total_spent + $1 WHERE id = $2',
            [delivery.amount, delivery.account_id]
        );
        
        await pool.query('COMMIT');
        
        res.json({ message: 'Livraison validée définitivement. Montant déduit du compte.' });
        
    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('Erreur validation finale:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour rejeter une livraison partenaire
app.post('/api/partner/deliveries/:deliveryId/reject', requireAuth, async (req, res) => {
    try {
        const { deliveryId } = req.params;
        const { comment } = req.body;
        const rejected_by = req.session.user.id;
        const userRole = req.session.user.role;
        
        if (!comment || comment.trim() === '') {
            return res.status(400).json({ error: 'Un commentaire de refus est obligatoire' });
        }
        
        // Récupérer les informations de la livraison
        const deliveryResult = await pool.query(
            'SELECT account_id, validation_status, first_validated_by FROM partner_deliveries WHERE id = $1',
            [deliveryId]
        );
        
        if (deliveryResult.rows.length === 0) {
            return res.status(404).json({ error: 'Livraison non trouvée' });
        }
        
        const delivery = deliveryResult.rows[0];
        const accountId = delivery.account_id;
        
        // Vérifier que la livraison peut être rejetée (pending ou first_validated, mais pas déjà rejetée ou fully_validated)
        if (delivery.validation_status === 'rejected') {
            return res.status(400).json({ error: 'Cette livraison est déjà rejetée' });
        }
        
        if (delivery.validation_status === 'fully_validated') {
            return res.status(400).json({ error: 'Cette livraison est déjà validée définitivement et ne peut plus être rejetée' });
        }
        
        // Si la livraison est en first_validated, vérifier que ce n'est pas le même directeur
        if (delivery.validation_status === 'first_validated' && delivery.first_validated_by === rejected_by) {
            return res.status(400).json({ error: 'Vous ne pouvez pas rejeter votre propre validation' });
        }
        
        // Vérifier les autorisations
        let canReject = false;
        
        if (userRole === 'directeur_general' || userRole === 'pca' || userRole === 'admin') {
            canReject = true;
        } else if (userRole === 'directeur') {
            const directorResult = await pool.query(
                'SELECT 1 FROM partner_account_directors WHERE account_id = $1 AND user_id = $2',
                [accountId, rejected_by]
            );
            canReject = directorResult.rows.length > 0;
        }
        
        if (!canReject) {
            return res.status(403).json({ error: 'Vous n\'êtes pas autorisé à rejeter cette livraison' });
        }
        
        // Rejeter la livraison
        await pool.query(
            'UPDATE partner_deliveries SET validation_status = $1, rejected_by = $2, rejected_at = CURRENT_TIMESTAMP, rejection_comment = $3 WHERE id = $4',
            ['rejected', rejected_by, comment, deliveryId]
        );
        
        res.json({ message: 'Livraison rejetée. Elle peut maintenant être modifiée.' });
        
    } catch (error) {
        console.error('Erreur rejet livraison:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour valider une livraison partenaire (ancienne, à supprimer)
app.post('/api/partner/deliveries/:deliveryId/validate', requireAuth, async (req, res) => {
    try {
        const { deliveryId } = req.params;
        const validated_by = req.session.user.id;
        const userRole = req.session.user.role;
        
        // Récupérer les informations de la livraison
        const deliveryResult = await pool.query(
            'SELECT account_id FROM partner_deliveries WHERE id = $1',
            [deliveryId]
        );
        
        if (deliveryResult.rows.length === 0) {
            return res.status(404).json({ error: 'Livraison non trouvée' });
        }
        
        const accountId = deliveryResult.rows[0].account_id;
        
        // Vérifier les autorisations
        let canValidate = false;
        
        if (userRole === 'directeur_general') {
            canValidate = true;
        } else if (userRole === 'directeur') {
            // Vérifier si le directeur est assigné à ce compte partenaire
            const directorResult = await pool.query(
                'SELECT 1 FROM partner_account_directors WHERE account_id = $1 AND user_id = $2',
                [accountId, validated_by]
            );
            canValidate = directorResult.rows.length > 0;
        }
        
        if (!canValidate) {
            return res.status(403).json({ error: 'Vous n\'êtes pas autorisé à valider cette livraison' });
        }
        
        // Utiliser une validation personnalisée au lieu de la fonction PostgreSQL
        await pool.query('BEGIN');
        
        // Récupérer les détails de la livraison
        const deliveryDetails = await pool.query(
            'SELECT * FROM partner_deliveries WHERE id = $1 AND is_validated = false',
            [deliveryId]
        );
        
        if (deliveryDetails.rows.length === 0) {
            await pool.query('ROLLBACK');
            return res.status(400).json({ error: 'Livraison déjà validée ou non trouvée' });
        }
        
        const delivery = deliveryDetails.rows[0];
        
        // Valider la livraison
        await pool.query(
            'UPDATE partner_deliveries SET is_validated = true, validated_by = $1, validated_at = CURRENT_TIMESTAMP WHERE id = $2',
            [validated_by, deliveryId]
        );
        
        // Déduire le montant du solde du compte
        await pool.query(
            'UPDATE accounts SET current_balance = current_balance - $1, total_spent = total_spent + $1 WHERE id = $2',
            [delivery.amount, delivery.account_id]
        );
        
        await pool.query('COMMIT');
        
        res.json({ message: 'Livraison validée avec succès' });
        
    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('Erreur validation livraison:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour supprimer une livraison partenaire (DG, PCA, Admin)
app.delete('/api/partner/deliveries/:deliveryId', requireAuth, async (req, res) => {
    try {
        const { deliveryId } = req.params;
        const userRole = req.session.user.role;
        
        // Récupérer les informations de la livraison pour vérifier les permissions
        const permissionCheckResult = await pool.query(
            'SELECT * FROM partner_deliveries WHERE id = $1',
            [deliveryId]
        );
        
        if (permissionCheckResult.rows.length === 0) {
            return res.status(404).json({ error: 'Livraison non trouvée' });
        }
        
        const deliveryForPermission = permissionCheckResult.rows[0];
        
        // Vérifier les permissions selon le rôle
        let canDelete = false;
        
        if (['directeur_general', 'pca', 'admin'].includes(userRole)) {
            canDelete = true;
        } else if (userRole === 'directeur') {
                         // Vérifier si le directeur est assigné au compte
            const assignmentResult = await pool.query(
                'SELECT 1 FROM partner_account_directors WHERE account_id = $1 AND user_id = $2',
                [deliveryForPermission.account_id, req.session.user.id]
            );
            
            if (assignmentResult.rows.length > 0) {
                // Vérifier le délai de 24h
                const deliveryDate = new Date(deliveryForPermission.delivery_date);
                const now = new Date();
                const timeDiff = now - deliveryDate;
                const hoursDiff = timeDiff / (1000 * 60 * 60);
                
                canDelete = hoursDiff <= 24;
                
                if (!canDelete) {
                    return res.status(403).json({ 
                        error: `Délai de suppression dépassé. Les directeurs peuvent supprimer des livraisons seulement dans les 24h suivant la date de livraison.`
                    });
                }
            }
        }
        
        if (!canDelete) {
            return res.status(403).json({ error: 'Vous n\'êtes pas autorisé à supprimer cette livraison' });
        }
        
        // Utiliser les informations déjà récupérées
        const delivery = deliveryForPermission;
        
        await pool.query('BEGIN');
        
        // Si la livraison était validée, rembourser le montant au compte
        if (delivery.validation_status === 'fully_validated' && delivery.is_validated) {
            await pool.query(
                'UPDATE accounts SET current_balance = current_balance + $1, total_spent = total_spent - $1 WHERE id = $2',
                [delivery.amount, delivery.account_id]
            );
            
            console.log(`Remboursement de ${delivery.amount} FCFA au compte ${delivery.account_id} suite à suppression admin de la livraison ${deliveryId}`);
        }
        
        // Supprimer la livraison
        await pool.query('DELETE FROM partner_deliveries WHERE id = $1', [deliveryId]);
        
        await pool.query('COMMIT');
        
        res.json({ 
            message: 'Livraison supprimée avec succès' + 
                    (delivery.validation_status === 'fully_validated' ? '. Montant remboursé au compte.' : '.'),
            wasValidated: delivery.validation_status === 'fully_validated'
        });
        
    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('Erreur suppression livraison admin:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour obtenir les comptes partenaires
app.get('/api/partner/accounts', requireAuth, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT a.*, u.full_name as user_name,
                   array_agg(pad.user_id) FILTER (WHERE pad.user_id IS NOT NULL) as assigned_director_ids,
                   array_agg(ud.full_name) FILTER (WHERE ud.full_name IS NOT NULL) as assigned_director_names
            FROM accounts a
            LEFT JOIN users u ON a.user_id = u.id
            LEFT JOIN partner_account_directors pad ON a.id = pad.account_id
            LEFT JOIN users ud ON pad.user_id = ud.id
            WHERE a.account_type = 'partenaire' AND a.is_active = true
            GROUP BY a.id, u.full_name
            ORDER BY a.account_name
        `);
        
        res.json(result.rows);
    } catch (error) {
        console.error('Erreur récupération comptes partenaires:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour assigner des directeurs à un compte partenaire
// Route de test pour vérifier les données partenaires
app.get('/api/debug/partner-directors', requireAuth, async (req, res) => {
    try {
        // Vérifier les comptes partenaires
        const accountsResult = await pool.query(`
            SELECT a.id, a.account_name, a.account_type 
            FROM accounts a 
            WHERE a.account_type = 'partenaire'
        `);
        
        // Vérifier les directeurs assignés
        const directorsResult = await pool.query(`
            SELECT pad.account_id, a.account_name, pad.user_id, u.username, u.role
            FROM partner_account_directors pad
            JOIN accounts a ON pad.account_id = a.id
            JOIN users u ON pad.user_id = u.id
        `);
        
        // Vérifier tous les directeurs
        const allDirectorsResult = await pool.query(`
            SELECT id, username, role FROM users WHERE role = 'directeur'
        `);
        
        res.json({
            partnerAccounts: accountsResult.rows,
            assignedDirectors: directorsResult.rows,
            allDirectors: allDirectorsResult.rows
        });
    } catch (error) {
        console.error('Erreur debug:', error);
        res.status(500).json({ error: error.message });
    }
});

// Route pour obtenir les directeurs assignés à un compte partenaire
app.get('/api/partner/:accountId/directors', requireAuth, async (req, res) => {
    try {
        const { accountId } = req.params;
        
        const result = await pool.query(`
            SELECT pad.user_id, u.username, u.full_name
            FROM partner_account_directors pad
            JOIN users u ON pad.user_id = u.id
            WHERE pad.account_id = $1
            ORDER BY u.full_name
        `, [accountId]);
        
        const assignedDirectorIds = result.rows.map(row => row.user_id);
        const assignedDirectors = result.rows;
        
        res.json({ 
            assigned_director_ids: assignedDirectorIds,
            assigned_directors: assignedDirectors
        });
    } catch (error) {
        console.error('Erreur récupération directeurs assignés:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour vérifier les autorisations d'un utilisateur sur un compte partenaire
app.get('/api/partner/:accountId/check-authorization', requireAuth, async (req, res) => {
    try {
        const { accountId } = req.params;
        const userId = req.session.user.id;
        const userRole = req.session.user.role;
        
        // Le DG peut toujours faire des dépenses
        if (userRole === 'directeur_general') {
            return res.json({ canExpend: true });
        }
        
        // Vérifier si l'utilisateur est un directeur assigné à ce compte partenaire
        const result = await pool.query(`
            SELECT 1 FROM partner_account_directors 
            WHERE account_id = $1 AND user_id = $2
        `, [accountId, userId]);
        
        const canExpend = result.rows.length > 0;
        
        res.json({ canExpend });
    } catch (error) {
        console.error('Erreur vérification autorisation partenaire:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.post('/api/partner/:accountId/directors', requireAdminAuth, async (req, res) => {
    try {
        const { accountId } = req.params;
        const { director_ids } = req.body;
        
        // Vérifier que le compte est de type partenaire
        const accountResult = await pool.query(
            'SELECT * FROM accounts WHERE id = $1 AND account_type = $2 AND is_active = true',
            [accountId, 'partenaire']
        );
        
        if (accountResult.rows.length === 0) {
            return res.status(404).json({ error: 'Compte partenaire non trouvé' });
        }
        
        await pool.query('BEGIN');
        
        // Supprimer les anciens directeurs assignés
        await pool.query('DELETE FROM partner_account_directors WHERE account_id = $1', [accountId]);
        
        // Ajouter les nouveaux directeurs (maximum 2)
        if (director_ids && director_ids.length > 0) {
            const limitedDirectors = director_ids.slice(0, 2); // Limiter à 2 directeurs
            for (const directorId of limitedDirectors) {
                await pool.query(
                    'INSERT INTO partner_account_directors (account_id, user_id) VALUES ($1, $2)',
                    [accountId, directorId]
                );
            }
        }
        
        await pool.query('COMMIT');
        
        res.json({ message: 'Directeurs assignés avec succès' });
    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('Erreur assignation directeurs:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour vérifier si un utilisateur peut effectuer des dépenses sur un compte partenaire
app.get('/api/partner/:accountId/can-expense', requireAuth, async (req, res) => {
    try {
        const { accountId } = req.params;
        const userId = req.session.user.id;
        const userRole = req.session.user.role;
        
        // Vérifier que le compte est de type partenaire
        const accountResult = await pool.query(
            'SELECT * FROM accounts WHERE id = $1 AND account_type = $2 AND is_active = true',
            [accountId, 'partenaire']
        );
        
        if (accountResult.rows.length === 0) {
            return res.json({ canExpense: false, reason: 'Compte partenaire non trouvé' });
        }
        
        let canExpense = false;
        let reason = '';
        
        if (userRole === 'directeur_general') {
            canExpense = true;
        } else if (userRole === 'directeur') {
            const directorResult = await pool.query(
                'SELECT 1 FROM partner_account_directors WHERE account_id = $1 AND user_id = $2',
                [accountId, userId]
            );
            canExpense = directorResult.rows.length > 0;
            reason = canExpense ? '' : 'Vous n\'êtes pas assigné à ce compte partenaire';
        } else {
            reason = 'Seuls le DG et les directeurs assignés peuvent effectuer des dépenses';
        }
        
        res.json({ canExpense, reason });
    } catch (error) {
        console.error('Erreur vérification dépense partenaire:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour activer un compte
app.put('/api/accounts/:accountId/activate', requireAdminAuth, async (req, res) => {
    try {
        const { accountId } = req.params;
        
        const result = await pool.query(
            'UPDATE accounts SET is_active = true WHERE id = $1 RETURNING *',
            [accountId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Compte non trouvé' });
        }
        
        res.json({ message: 'Compte activé avec succès', account: result.rows[0] });
    } catch (error) {
        console.error('Erreur activation compte:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// === ROUTES DE GESTION DES UTILISATEURS (ADMIN) ===

// Route pour obtenir tous les utilisateurs (admin uniquement)
app.get('/api/admin/users', requireAdminAuth, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id, username, full_name, email, role, is_active, created_at, updated_at
            FROM users 
            ORDER BY created_at DESC
        `);
        
        res.json(result.rows);
    } catch (error) {
        console.error('Erreur récupération utilisateurs:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour obtenir un utilisateur spécifique (admin uniquement)
app.get('/api/admin/users/:userId', requireAdminAuth, async (req, res) => {
    try {
        const { userId } = req.params;
        
        const result = await pool.query(`
            SELECT id, username, full_name, role, created_at,
                   NULL as email, true as is_active, created_at as updated_at
            FROM users 
            WHERE id = $1
        `, [userId]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Utilisateur non trouvé' });
        }
        
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Erreur récupération utilisateur:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour créer un nouvel utilisateur (admin uniquement)
app.post('/api/admin/users', requireAdminAuth, async (req, res) => {
    try {
        const { username, full_name, email, role, password } = req.body;
        
        // Validation des données
        if (!username || !role || !password) {
            return res.status(400).json({ error: 'Nom d\'utilisateur, rôle et mot de passe sont requis' });
        }
        
        // Vérifier que le nom d'utilisateur n'existe pas déjà
        const existingUser = await pool.query(
            'SELECT id FROM users WHERE username = $1',
            [username]
        );
        
        if (existingUser.rows.length > 0) {
            return res.status(400).json({ error: 'Ce nom d\'utilisateur existe déjà' });
        }
        
        // Vérifier que l'email n'existe pas déjà (si fourni et non vide)
        if (email && email.trim()) {
            const existingEmail = await pool.query(
                'SELECT id FROM users WHERE email = $1 AND email IS NOT NULL AND email != \'\'',
                [email.trim()]
            );
            
            if (existingEmail.rows.length > 0) {
                return res.status(400).json({ error: 'Cette adresse email existe déjà' });
            }
        }
        
        // Valider le rôle
        const validRoles = ['directeur', 'directeur_general', 'pca', 'admin', 'comptable'];
        if (!validRoles.includes(role)) {
            return res.status(400).json({ error: 'Rôle invalide' });
        }
        
        // Hacher le mot de passe
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Créer l'utilisateur
        const result = await pool.query(`
            INSERT INTO users (username, full_name, email, role, password_hash, is_active, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            RETURNING id, username, full_name, email, role, is_active, created_at
        `, [username, full_name || null, email && email.trim() ? email.trim() : null, role, hashedPassword]);
        
        res.json({ 
            message: 'Utilisateur créé avec succès', 
            user: result.rows[0] 
        });
    } catch (error) {
        console.error('Erreur création utilisateur:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour modifier un utilisateur (admin uniquement)
app.put('/api/admin/users/:userId', requireAdminAuth, async (req, res) => {
    try {
        const { userId } = req.params;
        const { username, full_name, email, role, password } = req.body;
        
        // Vérifier que l'utilisateur existe
        const existingUser = await pool.query(
            'SELECT id FROM users WHERE id = $1',
            [userId]
        );
        
        if (existingUser.rows.length === 0) {
            return res.status(404).json({ error: 'Utilisateur non trouvé' });
        }
        
        // Vérifier l'unicité du nom d'utilisateur (sauf pour l'utilisateur actuel)
        if (username) {
            const duplicateUsername = await pool.query(
                'SELECT id FROM users WHERE username = $1 AND id != $2',
                [username, userId]
            );
            
            if (duplicateUsername.rows.length > 0) {
                return res.status(400).json({ error: 'Ce nom d\'utilisateur existe déjà' });
            }
        }
        
        // Vérifier l'unicité de l'email (sauf pour l'utilisateur actuel, si fourni et non vide)
        if (email && email.trim()) {
            const duplicateEmail = await pool.query(
                'SELECT id FROM users WHERE email = $1 AND id != $2 AND email IS NOT NULL AND email != \'\'',
                [email.trim(), userId]
            );
            
            if (duplicateEmail.rows.length > 0) {
                return res.status(400).json({ error: 'Cette adresse email existe déjà' });
            }
        }
        
        // Valider le rôle
        if (role) {
            const validRoles = ['directeur', 'directeur_general', 'pca', 'admin', 'comptable'];
            if (!validRoles.includes(role)) {
                return res.status(400).json({ error: 'Rôle invalide' });
            }
        }
        
        // Construire la requête de mise à jour
        let updateQuery = 'UPDATE users SET updated_at = CURRENT_TIMESTAMP';
        let updateValues = [];
        let paramCount = 1;
        
        if (username) {
            updateQuery += `, username = $${paramCount}`;
            updateValues.push(username);
            paramCount++;
        }
        
        if (full_name !== undefined) {
            updateQuery += `, full_name = $${paramCount}`;
            updateValues.push(full_name);
            paramCount++;
        }
        
        if (email !== undefined) {
            updateQuery += `, email = $${paramCount}`;
            updateValues.push(email && email.trim() ? email.trim() : null);
            paramCount++;
        }
        
        if (role) {
            updateQuery += `, role = $${paramCount}`;
            updateValues.push(role);
            paramCount++;
        }
        
        if (password) {
            const hashedPassword = await bcrypt.hash(password, 10);
            updateQuery += `, password_hash = $${paramCount}`;
            updateValues.push(hashedPassword);
            paramCount++;
        }
        
        updateQuery += ` WHERE id = $${paramCount} RETURNING id, username, full_name, email, role, is_active, updated_at`;
        updateValues.push(userId);
        
        const result = await pool.query(updateQuery, updateValues);
        
        res.json({ 
            message: 'Utilisateur modifié avec succès', 
            user: result.rows[0] 
        });
    } catch (error) {
        console.error('Erreur modification utilisateur:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour désactiver un utilisateur (admin uniquement)
app.put('/api/admin/users/:userId/deactivate', requireAdminAuth, async (req, res) => {
    try {
        const { userId } = req.params;
        
        // Empêcher la désactivation de son propre compte
        if (parseInt(userId) === req.session.user.id) {
            return res.status(400).json({ error: 'Vous ne pouvez pas désactiver votre propre compte' });
        }
        
        const result = await pool.query(
            'UPDATE users SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING username',
            [userId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Utilisateur non trouvé' });
        }
        
        res.json({ message: `Utilisateur "${result.rows[0].username}" désactivé avec succès` });
    } catch (error) {
        console.error('Erreur désactivation utilisateur:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour activer un utilisateur (admin uniquement)
app.put('/api/admin/users/:userId/activate', requireAdminAuth, async (req, res) => {
    try {
        const { userId } = req.params;
        
        const result = await pool.query(
            'UPDATE users SET is_active = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING username',
            [userId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Utilisateur non trouvé' });
        }
        
        res.json({ message: `Utilisateur "${result.rows[0].username}" activé avec succès` });
    } catch (error) {
        console.error('Erreur activation utilisateur:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour réinitialiser le mot de passe d'un utilisateur (admin uniquement)
app.put('/api/admin/users/:userId/reset-password', requireAdminAuth, async (req, res) => {
    try {
        const { userId } = req.params;
        const { newPassword } = req.body;
        
        if (!newPassword) {
            return res.status(400).json({ error: 'Nouveau mot de passe requis' });
        }
        
        // Hacher le nouveau mot de passe
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        
        const result = await pool.query(
            'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING username',
            [hashedPassword, userId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Utilisateur non trouvé' });
        }
        
        res.json({ message: `Mot de passe réinitialisé pour "${result.rows[0].username}"` });
    } catch (error) {
        console.error('Erreur réinitialisation mot de passe:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Health check endpoint for Render
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development'
    });
});
// =====================================================
// ADMIN ROUTES
// =====================================================

// Import admin endpoints
const adminEndpoints = require('./admin_endpoints');

// Admin routes - Delete account with backup
app.post('/api/admin/accounts/:id/delete', adminEndpoints.requireAdmin, adminEndpoints.deleteAccount);

// Admin routes - Empty account with backup  
app.post('/api/admin/accounts/:id/empty', adminEndpoints.requireAdmin, adminEndpoints.emptyAccount);

// Admin routes - Get account backups
app.get('/api/admin/backups', adminEndpoints.requireAdmin, adminEndpoints.getAccountBackups);

// Admin routes - Configuration management
app.get('/api/admin/config/categories', requireAdminAuth, (req, res) => {
    try {
        const configPath = path.join(__dirname, 'categories_config.json');
        const configData = fs.readFileSync(configPath, 'utf8');
        res.json(JSON.parse(configData));
    } catch (error) {
        console.error('Error reading categories config:', error);
        res.status(500).json({ error: 'Error reading categories configuration' });
    }
});

app.put('/api/admin/config/categories', requireAdminAuth, (req, res) => {
    try {
        const configPath = path.join(__dirname, 'categories_config.json');
        const configData = JSON.stringify(req.body, null, 2);
        fs.writeFileSync(configPath, configData, 'utf8');
        res.json({ message: 'Categories configuration updated successfully' });
    } catch (error) {
        console.error('Error updating categories config:', error);
        res.status(500).json({ error: 'Error updating categories configuration' });
    }
});

app.get('/api/admin/config/stock-vivant', requireAdminAuth, (req, res) => {
    try {
        const configPath = path.join(__dirname, 'stock_vivant_config.json');
        const configData = fs.readFileSync(configPath, 'utf8');
        res.json(JSON.parse(configData));
    } catch (error) {
        console.error('Error reading stock vivant config:', error);
        res.status(500).json({ error: 'Error reading stock vivant configuration' });
    }
});

app.put('/api/admin/config/stock-vivant', requireAdminAuth, (req, res) => {
    try {
        const configPath = path.join(__dirname, 'stock_vivant_config.json');
        const configData = JSON.stringify(req.body, null, 2);
        fs.writeFileSync(configPath, configData, 'utf8');
        res.json({ message: 'Stock vivant configuration updated successfully' });
    } catch (error) {
        console.error('Error updating stock vivant config:', error);
        res.status(500).json({ error: 'Error updating stock vivant configuration' });
    }
});

app.get('/api/admin/config/financial', requireAdminAuth, (req, res) => {
    try {
        const configPath = path.join(__dirname, 'financial_settings.json');
        const configData = fs.readFileSync(configPath, 'utf8');
        res.json(JSON.parse(configData));
    } catch (error) {
        console.error('Error reading financial settings:', error);
        res.status(500).json({ error: 'Error reading financial settings configuration' });
    }
});

app.put('/api/admin/config/financial', requireAdminAuth, (req, res) => {
    try {
        const configPath = path.join(__dirname, 'financial_settings.json');
        const configData = JSON.stringify(req.body, null, 2);
        fs.writeFileSync(configPath, configData, 'utf8');
        res.json({ message: 'Financial settings configuration updated successfully' });
    } catch (error) {
        console.error('Error updating financial settings:', error);
        res.status(500).json({ error: 'Error updating financial settings configuration' });
    }
});

// Endpoint public pour récupérer le statut de validation des dépenses
app.get('/api/validation-status', requireAuth, (req, res) => {
    try {
        const financialConfig = getFinancialConfig();
        const validateBalance = financialConfig.validate_expense_balance !== false; // défaut à true
        
        res.json({
            validate_expense_balance: validateBalance,
            message: validateBalance 
                ? 'Validation des dépenses activée - Les dépenses ne peuvent pas dépasser le solde'
                : 'Validation des dépenses désactivée - Les dépenses peuvent dépasser le solde'
        });
    } catch (error) {
        console.error('Error reading validation status:', error);
        res.status(500).json({ error: 'Error reading validation status' });
    }
});

// Root endpoint
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// =====================================================
// EXTERNAL API FOR STATUS DASHBOARD
// =====================================================

// Endpoint pour l'API externe des status par compte avec tableau de bord complet
app.get('/external/api/status', requireAdminAuth, async (req, res) => {
    console.log('🌐 EXTERNAL: Appel API status avec params:', req.query);
    
    try {
        // Déterminer les dates (date range ou date unique)
        let startDateStr, endDateStr;
        let isRangeMode = false;
        
        // Si start_date ou end_date sont "undefined", les remplacer par date
        let effectiveStartDate = (req.query.start_date && req.query.start_date !== 'undefined') ? req.query.start_date : null;
        let effectiveEndDate = (req.query.end_date && req.query.end_date !== 'undefined') ? req.query.end_date : null;
        
        // Si start_date/end_date étaient undefined, fallback sur date
        if (!effectiveStartDate && !effectiveEndDate && req.query.date && req.query.date !== 'undefined') {
            effectiveStartDate = req.query.date;
            effectiveEndDate = req.query.date;
        }
        
        // Si une seule date est fournie, utiliser la même pour les deux
        if (effectiveStartDate && !effectiveEndDate) {
            effectiveEndDate = effectiveStartDate;
        } else if (effectiveEndDate && !effectiveStartDate) {
            effectiveStartDate = effectiveEndDate;
        }
        
        if (effectiveStartDate && effectiveEndDate) {
            // Mode date range
            isRangeMode = true;
            startDateStr = new Date(effectiveStartDate).toISOString().split('T')[0];
            endDateStr = new Date(effectiveEndDate).toISOString().split('T')[0];
        } else if (req.query.date && req.query.date !== 'undefined') {
            // Mode date unique (backward compatibility)
            startDateStr = new Date(req.query.date).toISOString().split('T')[0];
            endDateStr = startDateStr;
        } else {
            // Par défaut: date d'aujourd'hui
            const today = new Date().toISOString().split('T')[0];
            startDateStr = today;
            endDateStr = today;
            console.log('📅 Aucune date fournie, utilisation de la date d\'aujourd\'hui:', today);
        }
        
        // Pour la compatibilité avec le reste du code, selectedDate = endDate
        const selectedDate = new Date(endDateStr);
        const selectedDateStr = endDateStr;
        
        // Dates pour les calculs
        const startOfMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
        const startOfMonthStr = startOfMonth.toISOString().split('T')[0];
        
        const startOfWeek = new Date(selectedDate);
        const dayOfWeek = startOfWeek.getDay();
        const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        startOfWeek.setDate(selectedDate.getDate() + diffToMonday);
        const startOfWeekStr = startOfWeek.toISOString().split('T')[0];
        
        const previousMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth() - 1, 1);
        const endOfPreviousMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 0);
        const previousMonthStr = previousMonth.toISOString().split('T')[0];
        const endOfPreviousMonthStr = endOfPreviousMonth.toISOString().split('T')[0];
        
        console.log(`📅 EXTERNAL: Dates calculées - ${isRangeMode ? 'Range: ' + startDateStr + ' to ' + endDateStr : 'Sélectionnée: ' + selectedDateStr}, Début du mois: ${startOfMonthStr}, Début semaine: ${startOfWeekStr}`);

        // Récupérer tous les comptes actifs
        const accountsQuery = `
            SELECT DISTINCT a.id, a.account_name, a.user_id, a.account_type, a.current_balance,
                   u.full_name as assigned_director_name
            FROM accounts a 
            LEFT JOIN users u ON a.user_id = u.id 
            WHERE a.is_active = true 
            ORDER BY a.account_name
        `;
        
        const accountsResult = await pool.query(accountsQuery);
        const accounts = accountsResult.rows;
        
        if (accounts.length === 0) {
            return res.json({
                success: true,
                date_selected: selectedDateStr,
                message: 'Aucun compte actif trouvé',
                accounts: [],
                metadata: {
                    total_accounts: 0,
                    generation_timestamp: new Date().toISOString()
                }
            });
        }

        const statusData = {};

        // ===== TRAITEMENT PAR COMPTE =====
        for (const account of accounts) {
            const accountId = account.id;
            const accountName = account.account_name;
            
            console.log(`📊 EXTERNAL: Traitement du compte ${accountName} (ID: ${accountId})`);
            
            statusData[accountName] = {
                accountInfo: {
                    id: accountId,
                    name: accountName,
                    type: account.account_type,
                    assigned_director: account.assigned_director_name,
                    current_balance: parseFloat(account.current_balance) || 0
                }
            };

            // ===== 1. DAILY EXPENSES (or RANGE EXPENSES) =====
            const dailyExpensesQuery = `
                SELECT id, designation, supplier, total, category, subcategory, expense_type, 
                       created_at, description
                FROM expenses 
                WHERE account_id = $1 AND expense_date >= $2 AND expense_date <= $3
                ORDER BY created_at DESC
            `;
            const dailyExpensesResult = await pool.query(dailyExpensesQuery, [accountId, startDateStr, endDateStr]);
            
            const dailyExpensesTotal = dailyExpensesResult.rows.reduce((sum, exp) => sum + (parseFloat(exp.total) || 0), 0);
            const remainingDailyBalance = (parseFloat(account.current_balance) || 0) - dailyExpensesTotal;
            
            // Structure de base pour dailyExpenses
            let dailyExpensesStructure = {
                expenses: dailyExpensesResult.rows.map(exp => ({
                    id: exp.id,
                    description: exp.designation,
                    supplier: exp.supplier,
                    amount: parseFloat(exp.total) || 0,
                    category: exp.category,
                    subcategory: exp.subcategory,
                    type: exp.expense_type,
                    created_at: exp.created_at,
                    additional_description: exp.description
                })),
                total_daily_expenses: dailyExpensesTotal,
                remaining_balance: remainingDailyBalance
            };

            // ===== AJOUT DES DONNÉES CRÉANCE POUR LES COMPTES DE TYPE "CREANCE" =====
            if (account.account_type === 'creance') {
                try {
                    // Récupération des clients avec leurs soldes
                    const clientsQuery = `
                        SELECT 
                            cc.client_name,
                            cc.client_phone,
                            COALESCE(SUM(CASE WHEN co.operation_type = 'credit' THEN co.amount ELSE 0 END), 0) as credit_initial,
                            COALESCE(SUM(CASE WHEN co.operation_type = 'avance' THEN co.amount ELSE 0 END), 0) as total_avances,
                            COALESCE(SUM(CASE WHEN co.operation_type = 'remboursements' THEN co.amount ELSE 0 END), 0) as total_remboursements
                        FROM creance_clients cc
                        LEFT JOIN creance_operations co ON cc.id = co.client_id AND co.account_id = $1
                        WHERE cc.account_id = $1
                        GROUP BY cc.id, cc.client_name, cc.client_phone
                        ORDER BY cc.client_name
                    `;
                    const clientsResult = await pool.query(clientsQuery, [accountId]);
                    
                    const clients = clientsResult.rows.map(client => ({
                        client_name: client.client_name,
                        credit_initial: parseInt(client.credit_initial) || 0,
                        total_avances: parseInt(client.total_avances) || 0,
                        total_remboursements: parseInt(client.total_remboursements) || 0,
                        solde_final: (parseInt(client.credit_initial) || 0) + (parseInt(client.total_avances) || 0) - (parseInt(client.total_remboursements) || 0),
                        telephone: client.client_phone || "",
                        adresse: ""
                    }));

                    // Récupération des opérations de la date sélectionnée ou du range
                    const operationsQuery = `
                        SELECT 
                            co.operation_date,
                            co.created_at,
                            cc.client_name,
                            co.operation_type,
                            co.amount,
                            co.description,
                            u.username as created_by
                        FROM creance_operations co
                        JOIN creance_clients cc ON co.client_id = cc.id
                        LEFT JOIN users u ON co.created_by = u.id
                        WHERE co.operation_date >= $1 AND co.operation_date <= $2 AND co.account_id = $3
                        ORDER BY co.created_at DESC
                    `;
                    const operationsResult = await pool.query(operationsQuery, [startDateStr, endDateStr, accountId]);
                    
                    const operations = operationsResult.rows.map(op => ({
                        date_operation: op.operation_date,
                        timestamp: op.created_at,
                        client: op.client_name,
                        type: op.operation_type,
                        montant: parseInt(op.amount) || 0,
                        description: op.description || "",
                        created_by: op.created_by || "Système"
                    }));

                    // Ajout des données créance à dailyExpenses
                    dailyExpensesStructure.clients = clients;
                    dailyExpensesStructure.operations = operations;
                    
                } catch (creanceError) {
                    console.log(`⚠️ Erreur données créance pour compte ${accountName}:`, creanceError.message);
                    dailyExpensesStructure.clients = [];
                    dailyExpensesStructure.operations = [];
                    dailyExpensesStructure.creance_error = "Erreur lors de la récupération des données créance";
                }
            }

            statusData[accountName].dailyExpenses = dailyExpensesStructure;

            // ===== 2. WEEKLY EXPENSES =====
            const weeklyExpensesQuery = `
                SELECT SUM(total) as total_weekly
                FROM expenses 
                WHERE account_id = $1 AND expense_date >= $2 AND expense_date <= $3
            `;
            const weeklyExpensesResult = await pool.query(weeklyExpensesQuery, [accountId, startOfWeekStr, selectedDateStr]);
            const weeklyExpensesTotal = parseFloat(weeklyExpensesResult.rows[0]?.total_weekly) || 0;
            const remainingWeeklyBalance = (parseFloat(account.current_balance) || 0) - weeklyExpensesTotal;
            
            statusData[accountName].weeklyExpenses = {
                total_weekly_expenses: weeklyExpensesTotal,
                period: `${startOfWeekStr} to ${selectedDateStr}`,
                remaining_balance: remainingWeeklyBalance
            };

            // ===== 3. MONTHLY EXPENSES =====
            const monthlyExpensesQuery = `
                SELECT SUM(total) as total_monthly
                FROM expenses 
                WHERE account_id = $1 AND expense_date >= $2 AND expense_date <= $3
            `;
            const monthlyExpensesResult = await pool.query(monthlyExpensesQuery, [accountId, startOfMonthStr, selectedDateStr]);
            const monthlyExpensesTotal = parseFloat(monthlyExpensesResult.rows[0]?.total_monthly) || 0;
            const remainingMonthlyBalance = (parseFloat(account.current_balance) || 0) - monthlyExpensesTotal;
            
            statusData[accountName].monthlyExpenses = {
                total_monthly_expenses: monthlyExpensesTotal,
                period: `${startOfMonthStr} to ${selectedDateStr}`,
                remaining_balance: remainingMonthlyBalance
            };







            // ===== 4. DAILY CREANCE (or RANGE CREANCE) =====
            if (account.account_type === 'creance') {
                try {
                    const dailyCreanceQuery = `
                        SELECT cc.client_name, cc.client_phone, co.amount, co.operation_type, co.description
                        FROM creance_operations co
                        JOIN creance_clients cc ON co.client_id = cc.id
                        WHERE co.operation_date >= $1 AND co.operation_date <= $2 AND co.account_id = $3
                        ORDER BY cc.client_name
                    `;
                    const dailyCreanceResult = await pool.query(dailyCreanceQuery, [startDateStr, endDateStr, accountId]);
                    const dailyCreanceTotal = dailyCreanceResult.rows.reduce((sum, creance) => {
                        const amount = parseInt(creance.amount) || 0;
                        return sum + (creance.operation_type === 'credit' ? amount : -amount);
                    }, 0);
                    
                    statusData[accountName].dailyCreance = {
                        entries: dailyCreanceResult.rows.map(creance => ({
                            client_name: creance.client_name,
                            phone: creance.client_phone,
                            amount: parseInt(creance.amount) || 0,
                            action: creance.operation_type,
                            description: creance.description
                        })),
                        total_daily_creance: dailyCreanceTotal
                    };
                } catch (creanceError) {
                    console.log(`⚠️ Erreur créance quotidienne pour compte ${accountName}:`, creanceError.message);
                    statusData[accountName].dailyCreance = {
                        entries: [],
                        total_daily_creance: 0,
                        error: "Tables créance non disponibles"
                    };
                }
            }

            // ===== 5. MONTHLY CREANCE =====
            if (account.account_type === 'creance') {
                try {
                    const monthlyCreanceQuery = `
                        SELECT SUM(CASE WHEN co.operation_type = 'credit' THEN co.amount ELSE -co.amount END) as total_monthly
                        FROM creance_operations co
                        WHERE co.operation_date >= $1 AND co.operation_date <= $2 AND co.account_id = $3
                    `;
                    const monthlyCreanceResult = await pool.query(monthlyCreanceQuery, [startOfMonthStr, selectedDateStr, accountId]);
                    const monthlyCreanceTotal = parseInt(monthlyCreanceResult.rows[0]?.total_monthly) || 0;
                    
                    statusData[accountName].monthlyCreance = {
                        total_monthly_creance: monthlyCreanceTotal,
                        period: `${startOfMonthStr} to ${selectedDateStr}`
                    };
                } catch (monthlyCreanceError) {
                    console.log(`⚠️ Erreur créance mensuelle pour compte ${accountName}:`, monthlyCreanceError.message);
                    statusData[accountName].monthlyCreance = {
                        total_monthly_creance: 0,
                        period: `${startOfMonthStr} to ${selectedDateStr}`,
                        error: "Erreur lors du calcul des créances mensuelles"
                    };
                }
            }
        }

        // ===== STOCK VIVANT GLOBAL =====
        let globalStockVivantData = {
            date: selectedDateStr,
            latest_date_update: null,
            latest_entries: [],
            delta: {
                previous_date: null,
                current_date: null,
                difference: 0,
                percentage_change: 0
            }
        };

        try {
            // Récupérer les deux dernières dates distinctes dans stock_vivant
            const latestDatesQuery = `
                SELECT DISTINCT date_stock
                FROM stock_vivant 
                ORDER BY date_stock DESC
                LIMIT 2
            `;
            const latestDatesResult = await pool.query(latestDatesQuery);
            
            if (latestDatesResult.rows.length >= 2) {
                const currentDate = latestDatesResult.rows[0].date_stock;
                const previousDate = latestDatesResult.rows[1].date_stock;
                
                // Récupérer les entrées de la date la plus récente
                const latestEntriesQuery = `
                    SELECT date_stock, categorie, produit, quantite, prix_unitaire, total, commentaire
                    FROM stock_vivant 
                    WHERE date_stock = $1
                    ORDER BY categorie, produit
                `;
                const latestEntriesResult = await pool.query(latestEntriesQuery, [currentDate]);
                
                // Calculer les totaux pour les deux dates
                const currentTotalQuery = `
                    SELECT SUM(total) as total_current
                    FROM stock_vivant 
                    WHERE date_stock = $1
                `;
                const currentTotalResult = await pool.query(currentTotalQuery, [currentDate]);
                const currentTotal = parseFloat(currentTotalResult.rows[0]?.total_current) || 0;
                
                const previousTotalQuery = `
                    SELECT SUM(total) as total_previous
                    FROM stock_vivant 
                    WHERE date_stock = $1
                `;
                const previousTotalResult = await pool.query(previousTotalQuery, [previousDate]);
                const previousTotal = parseFloat(previousTotalResult.rows[0]?.total_previous) || 0;
                
                const difference = currentTotal - previousTotal;
                const percentageChange = previousTotal > 0 ? ((difference / previousTotal) * 100) : 0;
                
                // Récupérer les détails des produits qui ont bougé
                const productChangesQuery = `
                    SELECT 
                        COALESCE(c1.categorie, c2.categorie) as categorie,
                        COALESCE(c1.produit, c2.produit) as produit,
                        c1.quantite as current_quantity,
                        c2.quantite as previous_quantity,
                        c1.prix_unitaire as current_unit_price,
                        c2.prix_unitaire as previous_unit_price,
                        c1.total as current_total,
                        c2.total as previous_total,
                        (c1.quantite - c2.quantite) as quantity_change,
                        (c1.total - c2.total) as total_change
                    FROM (
                        SELECT categorie, produit, quantite, prix_unitaire, total
                        FROM stock_vivant 
                        WHERE date_stock = $1
                    ) c1
                    FULL OUTER JOIN (
                        SELECT categorie, produit, quantite, prix_unitaire, total
                        FROM stock_vivant 
                        WHERE date_stock = $2
                    ) c2 ON c1.categorie = c2.categorie AND c1.produit = c2.produit
                    WHERE c1.quantite IS DISTINCT FROM c2.quantite 
                       OR c1.prix_unitaire IS DISTINCT FROM c2.prix_unitaire
                       OR c1.total IS DISTINCT FROM c2.total
                    ORDER BY COALESCE(c1.categorie, c2.categorie), COALESCE(c1.produit, c2.produit)
                `;
                const productChangesResult = await pool.query(productChangesQuery, [currentDate, previousDate]);
                
                const productChanges = productChangesResult.rows.map(change => ({
                    category: change.categorie,
                    product: change.produit,
                    current_quantity: parseInt(change.current_quantity) || 0,
                    previous_quantity: parseInt(change.previous_quantity) || 0,
                    current_unit_price: parseFloat(change.current_unit_price) || 0,
                    previous_unit_price: parseFloat(change.previous_unit_price) || 0,
                    current_total: parseFloat(change.current_total) || 0,
                    previous_total: parseFloat(change.previous_total) || 0,
                    quantity_change: parseInt(change.quantity_change) || 0,
                    total_change: parseFloat(change.total_change) || 0
                }));
                
                globalStockVivantData = {
                    latest_date_update: currentDate.toISOString().split('T')[0],
                    latest_entries: latestEntriesResult.rows.map(stock => ({
                        date: stock.date_stock,
                        category: stock.categorie,
                        product: stock.produit,
                        quantity: parseInt(stock.quantite) || 0,
                        unit_price: parseFloat(stock.prix_unitaire) || 0,
                        total: parseFloat(stock.total) || 0
                    })),
                    delta: {
                        previous_date: previousDate,
                        current_date: currentDate,
                        previous_total: previousTotal,
                        current_total: currentTotal,
                        difference: difference,
                        percentage_change: percentageChange,
                        product_changes: productChanges
                    }
                };
            } else if (latestDatesResult.rows.length === 1) {
                // Une seule date disponible
                const currentDate = latestDatesResult.rows[0].date_stock;
                
                const latestEntriesQuery = `
                    SELECT date_stock, categorie, produit, quantite, prix_unitaire, total, commentaire
                    FROM stock_vivant 
                    WHERE date_stock = $1
                    ORDER BY categorie, produit
                `;
                const latestEntriesResult = await pool.query(latestEntriesQuery, [currentDate]);
                
                const currentTotalQuery = `
                    SELECT SUM(total) as total_current
                    FROM stock_vivant 
                    WHERE date_stock = $1
                `;
                const currentTotalResult = await pool.query(currentTotalQuery, [currentDate]);
                const currentTotal = parseFloat(currentTotalResult.rows[0]?.total_current) || 0;
                
                globalStockVivantData = {
                    latest_date_update: currentDate.toISOString().split('T')[0],
                    latest_entries: latestEntriesResult.rows.map(stock => ({
                        date: stock.date_stock,
                        category: stock.categorie,
                        product: stock.produit,
                        quantity: parseInt(stock.quantite) || 0,
                        unit_price: parseFloat(stock.prix_unitaire) || 0,
                        total: parseFloat(stock.total) || 0
                    })),
                    delta: {
                        previous_date: null,
                        current_date: currentDate,
                        previous_total: 0,
                        current_total: currentTotal,
                        difference: 0,
                        percentage_change: 0,
                        product_changes: []
                    }
                };
            }
            } catch (stockError) {
            console.log('⚠️ Erreur stock vivant global:', stockError.message);
            globalStockVivantData = {
                    latest_date_update: null,
                    latest_entries: [],
                delta: {
                    previous_date: null,
                    current_date: null,
                    previous_total: 0,
                    current_total: 0,
                    difference: 0,
                    percentage_change: 0,
                    product_changes: []
                    },
                    error: "Table stock_vivant non disponible"
                };
            }

        // ===== LIVRAISON PARTENAIRE GLOBALE =====
        let globalLivraisonPartenaireData = {
            latest_delivery_date: null
        };

            try {
                // Vérifier d'abord si la table existe
                const tableExistsQuery = `
                    SELECT EXISTS (
                        SELECT FROM information_schema.tables 
                        WHERE table_name = 'partner_deliveries'
                    )
                `;
                const tableExistsResult = await pool.query(tableExistsQuery);
                
                if (tableExistsResult.rows[0].exists) {
                // Récupérer tous les comptes partenaires
                const partnerAccountsQuery = `
                    SELECT id, account_name, current_balance, total_credited
                    FROM accounts 
                    WHERE account_type = 'partenaire' AND is_active = true
                    ORDER BY account_name
                `;
                const partnerAccountsResult = await pool.query(partnerAccountsQuery);
                
                for (const partnerAccount of partnerAccountsResult.rows) {
                    const accountId = partnerAccount.id;
                    const accountName = partnerAccount.account_name;
                    
                    // Récupérer la dernière livraison pour ce compte
                    const latestDeliveryQuery = `
                        SELECT id, delivery_date, amount, description, validation_status, created_at
                        FROM partner_deliveries 
                        WHERE account_id = $1
                        ORDER BY delivery_date DESC, created_at DESC
                        LIMIT 1
                    `;
                    const latestDeliveryResult = await pool.query(latestDeliveryQuery, [accountId]);
                    
                    // Calculer le total des livraisons validées pour ce compte
                    const totalDeliveriesQuery = `
                        SELECT SUM(amount) as total_deliveries
                        FROM partner_deliveries 
                        WHERE account_id = $1 AND validation_status = 'fully_validated'
                    `;
                    const totalDeliveriesResult = await pool.query(totalDeliveriesQuery, [accountId]);
                    const totalDeliveries = parseFloat(totalDeliveriesResult.rows[0]?.total_deliveries) || 0;
                    const remainingBalance = (parseFloat(partnerAccount.total_credited) || 0) - totalDeliveries;
                    
                    globalLivraisonPartenaireData[accountName] = {
                        latest_delivery: latestDeliveryResult.rows[0] ? {
                            id: latestDeliveryResult.rows[0].id,
                            date: latestDeliveryResult.rows[0].delivery_date.toISOString().split('T')[0],
                            amount: parseFloat(latestDeliveryResult.rows[0].amount) || 0,
                            description: latestDeliveryResult.rows[0].description,
                            status: latestDeliveryResult.rows[0].validation_status,
                            created_at: latestDeliveryResult.rows[0].created_at.toISOString()
                        } : null,
                        total_validated_deliveries: totalDeliveries,
                        remaining_balance: remainingBalance
                    };
                }
                
                // Récupérer la date de livraison la plus récente parmi tous les comptes partenaires
                const globalLatestDeliveryQuery = `
                    SELECT MAX(delivery_date) as latest_delivery_date
                    FROM partner_deliveries pd
                    JOIN accounts a ON pd.account_id = a.id
                    WHERE a.account_type = 'partenaire' AND a.is_active = true
                `;
                const globalLatestDeliveryResult = await pool.query(globalLatestDeliveryQuery);
                
                if (globalLatestDeliveryResult.rows[0]?.latest_delivery_date) {
                    globalLivraisonPartenaireData.latest_delivery_date = globalLatestDeliveryResult.rows[0].latest_delivery_date.toISOString().split('T')[0];
                }
                }
            } catch (deliveryError) {
            console.log('⚠️ Erreur livraisons partenaires globales:', deliveryError.message);
            globalLivraisonPartenaireData = {
                latest_delivery_date: null,
                error: "Erreur lors de la récupération des livraisons partenaires"
            };
        }

        // ===== STOCK SOIR MATA GLOBAL =====
        let globalStockSoirMataData = {
            date: selectedDateStr,
            entries: [],
            total_value: 0
        };

            try {
                const stockSoirQuery = `
                    SELECT date, point_de_vente, produit, stock_matin, stock_soir, transfert
                    FROM stock_mata 
                    WHERE date >= $1 AND date <= $2
                    ORDER BY point_de_vente, produit, date
                `;
                const stockSoirResult = await pool.query(stockSoirQuery, [startDateStr, endDateStr]);
                const totalStockSoir = stockSoirResult.rows.reduce((sum, stock) => sum + (parseFloat(stock.stock_soir) || 0), 0);
                
            globalStockSoirMataData = {
                    date: isRangeMode ? `${startDateStr} to ${endDateStr}` : selectedDateStr,
                    entries: stockSoirResult.rows.map(stock => ({
                        date: stock.date,
                        point_de_vente: stock.point_de_vente,
                        produit: stock.produit,
                        stock_matin: parseFloat(stock.stock_matin) || 0,
                        stock_soir: parseFloat(stock.stock_soir) || 0,
                        transfert: parseFloat(stock.transfert) || 0
                    })),
                    total_value: totalStockSoir
                };
            } catch (stockSoirError) {
            console.log('⚠️ Erreur stock soir global:', stockSoirError.message);
            globalStockSoirMataData = {
                    date: selectedDateStr,
                    entries: [],
                    total_value: 0,
                    error: "Table stock_mata non disponible"
                };
            }

        // ===== CALCULS GLOBAUX PL ET SOLDES =====
        
        // Définir monthYear pour les autres requêtes
        const monthYear = selectedDateStr.substring(0, 7); // Format YYYY-MM
        
        // Récupération des données pour les calculs PL
        // Calculer le Cash Disponible en utilisant les soldes HISTORIQUES à la date sélectionnée
        // (même logique que /api/dashboard/stats)
        let totalBalance = 0;
        try {
            const balanceQuery = `
                SELECT 
                    a.id,
                    a.account_name,
                    a.account_type,
                    -- CALCUL SELON LE TYPE DE COMPTE (logique identique à /api/dashboard/stats)
                    CASE a.account_type
                        WHEN 'statut' THEN
                            -- Pour STATUT : dernier crédit/transfert entrant REMPLACE, puis soustraction des sorties/dépenses
                            (
                                COALESCE((
                                    SELECT montant FROM (
                                        SELECT amount as montant, created_at as date_operation
                                        FROM credit_history 
                                        WHERE account_id = a.id 
                                            AND created_at <= ($1::date + INTERVAL '1 day')
                                        
                                        UNION ALL
                                        
                                        SELECT amount as montant, created_at as date_operation
                                        FROM special_credit_history 
                                        WHERE account_id = a.id 
                                            AND credit_date <= ($1::date + INTERVAL '1 day')
                                            AND is_balance_override = true
                                        
                                        UNION ALL
                                        
                                        SELECT montant, created_at as date_operation
                                        FROM transfer_history
                                        WHERE destination_id = a.id
                                            AND created_at <= ($1::date + INTERVAL '1 day')
                                    ) all_incoming
                                    ORDER BY date_operation DESC
                                    LIMIT 1
                                ), 0)
                                -
                                COALESCE((
                                    SELECT SUM(th.montant)
                                    FROM transfer_history th
                                    WHERE th.source_id = a.id
                                        AND th.created_at > COALESCE((
                                            SELECT date_operation FROM (
                                                SELECT created_at as date_operation
                                                FROM credit_history 
                                                WHERE account_id = a.id 
                                                    AND created_at <= ($1::date + INTERVAL '1 day')
                                                
                                                UNION ALL
                                                
                                                SELECT created_at as date_operation
                                                FROM special_credit_history 
                                                WHERE account_id = a.id 
                                                    AND credit_date <= ($1::date + INTERVAL '1 day')
                                                    AND is_balance_override = true
                                                
                                                UNION ALL
                                                
                                                SELECT created_at as date_operation
                                                FROM transfer_history
                                                WHERE destination_id = a.id
                                                    AND created_at <= ($1::date + INTERVAL '1 day')
                                            ) all_incoming
                                            ORDER BY date_operation DESC
                                            LIMIT 1
                                        ), '1900-01-01'::timestamp)
                                        AND th.created_at <= ($1::date + INTERVAL '1 day')
                                ), 0)
                                -
                                COALESCE((
                                    SELECT SUM(e2.total)
                                    FROM expenses e2
                                    WHERE e2.account_id = a.id
                                        AND e2.expense_date > COALESCE((
                                            SELECT date_operation::date FROM (
                                                SELECT created_at as date_operation
                                                FROM credit_history 
                                                WHERE account_id = a.id 
                                                    AND created_at <= ($1::date + INTERVAL '1 day')
                                                
                                                UNION ALL
                                                
                                                SELECT created_at as date_operation
                                                FROM special_credit_history 
                                                WHERE account_id = a.id 
                                                    AND credit_date <= ($1::date + INTERVAL '1 day')
                                                    AND is_balance_override = true
                                                
                                                UNION ALL
                                                
                                                SELECT created_at as date_operation
                                                FROM transfer_history
                                                WHERE destination_id = a.id
                                                    AND created_at <= ($1::date + INTERVAL '1 day')
                                            ) all_incoming
                                            ORDER BY date_operation DESC
                                            LIMIT 1
                                        ), '1900-01-01'::date)
                                        AND e2.expense_date <= ($1::date + INTERVAL '1 day')
                                ), 0)
                            )
                        
                        ELSE
                            -- Pour CLASSIQUE : cumul complet <= date sélectionnée
                            (COALESCE((SELECT SUM(ch.amount) FROM credit_history ch WHERE ch.account_id = a.id AND ch.created_at <= $1), 0) +
                             COALESCE((SELECT SUM(sch.amount) FROM special_credit_history sch WHERE sch.account_id = a.id AND sch.credit_date <= $1), 0) -
                             COALESCE((SELECT SUM(e2.total) FROM expenses e2 WHERE e2.account_id = a.id AND e2.expense_date <= $1), 0) +
                             COALESCE((SELECT SUM(CASE WHEN th.destination_id = a.id THEN th.montant ELSE -th.montant END) 
                                      FROM transfer_history th 
                                      WHERE (th.source_id = a.id OR th.destination_id = a.id) AND th.created_at <= ($1::date + INTERVAL '1 day')), 0) +
                             COALESCE((SELECT montant FROM montant_debut_mois WHERE account_id = a.id), 0))
                    END as balance_at_date
                FROM accounts a
                WHERE a.is_active = true
                AND a.account_type IN ('classique', 'statut')
            `;
            const balanceResult = await pool.query(balanceQuery, [selectedDateStr]);
            totalBalance = balanceResult.rows.reduce((sum, row) => sum + (parseFloat(row.balance_at_date) || 0), 0);
            console.log(`💰 Cash Disponible (soldes historiques au ${selectedDateStr}): ${totalBalance.toLocaleString()} FCFA`);
            console.log('📊 Détail par compte:');
            balanceResult.rows.forEach(row => {
                console.log(`   - ${row.account_name} (${row.account_type}): ${parseFloat(row.balance_at_date || 0).toLocaleString()} FCFA`);
            });
        } catch (error) {
            console.error('Erreur calcul cash disponible:', error);
            totalBalance = 0;
        }

        // Récupérer la vraie valeur Cash Bictorys du mois (même logique que l'application)
        const cashBictorysQuery = `
            SELECT amount
            FROM cash_bictorys
            WHERE date = (
                SELECT MAX(date)
                FROM cash_bictorys
                WHERE amount != 0 
                AND month_year = $1
                AND date <= $2
            )
            AND amount != 0
            AND month_year = $1
            AND date <= $2
        `;
        const cashBictorysResult = await pool.query(cashBictorysQuery, [monthYear, selectedDateStr]);
        let cashBictorysValue = 0;
        
        if (cashBictorysResult.rows.length > 0) {
            cashBictorysValue = parseInt(cashBictorysResult.rows[0].amount) || 0;
        } else {
            // Si aucune valeur non-nulle trouvée, prendre la dernière valeur (même si 0)
            const fallbackCashBictorysQuery = `
                SELECT amount
                FROM cash_bictorys
                WHERE date = (
                    SELECT MAX(date)
                    FROM cash_bictorys
                    WHERE month_year = $1
                    AND date <= $2
                )
                AND month_year = $1
                AND date <= $2
            `;
            const fallbackCashBictorysResult = await pool.query(fallbackCashBictorysQuery, [monthYear, selectedDateStr]);
            cashBictorysValue = fallbackCashBictorysResult.rows.length > 0 ? parseInt(fallbackCashBictorysResult.rows[0].amount) || 0 : 0;
        }

        // Calculer le Cash Burn du Mois en excluant depot, partenaire et creance (même logique que dashboard)
        const monthlyExpensesGlobalQuery = `
            SELECT SUM(total) as total_monthly_expenses
            FROM expenses e
            JOIN accounts a ON e.account_id = a.id
            WHERE a.is_active = true 
            AND a.account_type IN ('classique', 'statut')
            AND e.expense_date >= $1 AND e.expense_date <= $2
        `;
        const monthlyExpensesGlobalResult = await pool.query(monthlyExpensesGlobalQuery, [startOfMonthStr, selectedDateStr]);
        const totalMonthlyExpenses = parseFloat(monthlyExpensesGlobalResult.rows[0]?.total_monthly_expenses) || 0;

        const weeklyExpensesQuery = `
            SELECT SUM(total) as total_weekly_expenses
            FROM expenses e
            JOIN accounts a ON e.account_id = a.id
            WHERE a.is_active = true AND e.expense_date >= $1 AND e.expense_date <= $2
        `;
        const weeklyExpensesResult = await pool.query(weeklyExpensesQuery, [startOfWeekStr, selectedDateStr]);
        const totalWeeklyExpenses = parseFloat(weeklyExpensesResult.rows[0]?.total_weekly_expenses) || 0;

        // Calcul des créances (même logique que l'interface)
        let totalCreance = 0;
        try {
            const creancesQuery = `
                SELECT COALESCE(SUM(co.amount), 0) as creances_mois
            FROM creance_operations co
                JOIN creance_clients cc ON co.client_id = cc.id
                JOIN accounts a ON cc.account_id = a.id
                WHERE co.operation_type = 'credit'
                AND co.operation_date >= $1
                AND co.operation_date <= $2
                AND a.account_type = 'creance' 
                AND a.is_active = true 
                AND cc.is_active = true
            `;
            const creancesResult = await pool.query(creancesQuery, [startOfMonthStr, selectedDateStr]);
            totalCreance = parseInt(creancesResult.rows[0]?.creances_mois) || 0;
        } catch (error) {
            console.error('Erreur calcul créances:', error);
            totalCreance = 0;
        }

        // Calcul des remboursements du mois (à soustraire du PL car déjà dans Cash Bictorys)
        let totalRemboursements = 0;
        try {
            const remboursementsQuery = `
                SELECT COALESCE(SUM(co.amount), 0) as remboursements_mois
                FROM creance_operations co
                JOIN creance_clients cc ON co.client_id = cc.id
                JOIN accounts a ON cc.account_id = a.id
                WHERE co.operation_type = 'debit'
                AND co.operation_date >= $1
                AND co.operation_date <= $2
                AND a.account_type = 'creance' 
                AND a.is_active = true 
                AND cc.is_active = true
            `;
            const remboursementsResult = await pool.query(remboursementsQuery, [startOfMonthStr, selectedDateStr]);
            totalRemboursements = parseInt(remboursementsResult.rows[0]?.remboursements_mois) || 0;
            console.log(`💰 Remboursements du mois: ${totalRemboursements.toLocaleString()} FCFA`);
        } catch (error) {
            console.error('Erreur calcul remboursements:', error);
            totalRemboursements = 0;
        }

        const totalDeliveriesGlobalQuery = `
            SELECT SUM(amount) as total_deliveries
            FROM partner_deliveries 
            WHERE validation_status = 'fully_validated' AND delivery_date >= $1 AND delivery_date <= $2
        `;
        const totalDeliveriesGlobalResult = await pool.query(totalDeliveriesGlobalQuery, [startOfMonthStr, selectedDateStr]);
        const totalDeliveriesMonth = parseFloat(totalDeliveriesGlobalResult.rows[0]?.total_deliveries) || 0;

        // Calcul de l'écart stock vivant (même logique que l'interface)
        let stockVivantVariation = 0;
        try {
            const currentDate = new Date(selectedDateStr);
            const currentYear = currentDate.getFullYear();
            const currentMonth = currentDate.getMonth() + 1;
            
            let previousYear = currentYear;
            let previousMonth = currentMonth - 1;
            if (previousMonth === 0) {
                previousMonth = 12;
                previousYear = currentYear - 1;
            }
            
            const firstDayOfCurrentMonth = `${currentYear}-${currentMonth.toString().padStart(2, '0')}-01`;
            
            // 1. Récupérer le stock de la dernière date disponible AVANT le mois actuel
            let previousStock = 0;
            const lastDateBeforeCurrentMonth = await pool.query(`
                SELECT MAX(date_stock) as last_date
            FROM stock_vivant 
                WHERE date_stock < $1::date
            `, [firstDayOfCurrentMonth]);
            
            if (lastDateBeforeCurrentMonth.rows[0]?.last_date) {
                const previousStockResult = await pool.query(`
                    SELECT SUM(quantite * prix_unitaire * (1 - COALESCE(decote, 0))) as total_stock
            FROM stock_vivant 
                    WHERE date_stock = $1
                `, [lastDateBeforeCurrentMonth.rows[0].last_date]);
                
                previousStock = Math.round(previousStockResult.rows[0]?.total_stock || 0);
            }
            
            // 2. Récupérer le stock le plus proche de la date sélectionnée
            const currentStockQuery = `
                SELECT SUM(quantite * prix_unitaire * (1 - COALESCE(decote, 0))) as total_stock
                FROM stock_vivant
                WHERE date_stock <= $1::date
                AND date_stock = (
                    SELECT MAX(date_stock) 
                    FROM stock_vivant 
                    WHERE date_stock <= $1::date
                )
            `;
            const currentStockResult = await pool.query(currentStockQuery, [selectedDateStr]);
            
            const currentStock = Math.round(currentStockResult.rows[0]?.total_stock || 0);
            
            // 3. Calculer l'écart : stock actuel - stock précédent
            stockVivantVariation = currentStock - previousStock;
        } catch (error) {
            console.error('Erreur calcul écart stock vivant:', error);
            stockVivantVariation = 0;
        }

        // Calcul de l'écart stock mata (même logique que l'interface)
        let totalStockSoir = 0;
        try {
            const currentDate = new Date(selectedDateStr);
            const currentYear = currentDate.getFullYear();
            const currentMonth = currentDate.getMonth() + 1;
            const firstDayOfCurrentMonth = `${currentYear}-${currentMonth.toString().padStart(2, '0')}-01`;
            
            // 1. Trouver la dernière date de stock mata AVANT le mois actuel
            let previousStockMata = 0;
            const lastDateBeforeCurrentMonth = await pool.query(`
                SELECT MAX(date) as last_date 
                FROM stock_mata 
                WHERE date < $1
            `, [firstDayOfCurrentMonth]);
            
            if (lastDateBeforeCurrentMonth.rows[0]?.last_date) {
                const previousStockMataResult = await pool.query(`
                    SELECT COALESCE(SUM(stock_soir), 0) as total_stock
            FROM stock_mata 
            WHERE date = $1
                `, [lastDateBeforeCurrentMonth.rows[0].last_date]);
                
                previousStockMata = Math.round(previousStockMataResult.rows[0]?.total_stock || 0);
            }
            
            // 2. Récupérer le stock mata le plus proche de la date sélectionnée
            const currentStockMataQuery = `
                SELECT COALESCE(SUM(stock_soir), 0) as total_stock
                FROM stock_mata
                WHERE date <= $1::date
                AND date = (
                    SELECT MAX(date) 
                    FROM stock_mata 
                    WHERE date <= $1::date
                )
            `;
            const currentStockMataResult = await pool.query(currentStockMataQuery, [selectedDateStr]);
            
            const currentStockMata = Math.round(currentStockMataResult.rows[0]?.total_stock || 0);
            
            // 3. Calculer l'écart : stock actuel - stock précédent
            totalStockSoir = currentStockMata - previousStockMata;
        } catch (error) {
            console.error('Erreur calcul écart stock mata:', error);
            totalStockSoir = 0;
        }

        // Lire l'estimation des charges fixes depuis le fichier JSON (même logique que l'interface)
        let estimatedMonthlyFixedCharges = 0;
        try {
            const configPath = path.join(__dirname, 'financial_settings.json');
            const configExists = await fs.promises.access(configPath).then(() => true).catch(() => false);
            
            if (configExists) {
                const configData = await fs.promises.readFile(configPath, 'utf8');
                const financialConfig = JSON.parse(configData);
                estimatedMonthlyFixedCharges = parseFloat(financialConfig.charges_fixes_estimation) || 0;
            } else {
                console.log('⚠️ Fichier financial_settings.json non trouvé, estimation = 0');
                estimatedMonthlyFixedCharges = 0;
            }
        } catch (configError) {
            console.error('Erreur lecture config financière:', configError);
            estimatedMonthlyFixedCharges = 0;
        }

        // Calculer le prorata des charges fixes basé sur les jours écoulés (hors dimanche) - même logique que l'interface
        let chargesProrata = 0;
        let joursOuvrablesEcoules = 0;
        let totalJoursOuvrables = 0;
        
        if (estimatedMonthlyFixedCharges > 0) {
            const currentDate = new Date(selectedDateStr);
            const currentDay = currentDate.getDate();
            const currentMonth = currentDate.getMonth() + 1;
            const currentYear = currentDate.getFullYear();
            
            // Calculer le nombre de jours ouvrables écoulés dans le mois (lundi à samedi)
            // Du début du mois jusqu'à la date de référence (inclus)
            joursOuvrablesEcoules = 0;
            for (let day = 1; day <= currentDay; day++) {
                const date = new Date(currentYear, currentMonth - 1, day);
                const dayOfWeek = date.getDay(); // 0 = dimanche, 1 = lundi, ..., 6 = samedi
                if (dayOfWeek !== 0) { // Exclure les dimanches
                    joursOuvrablesEcoules++;
                }
            }
            
            // Calculer le nombre total de jours ouvrables dans le mois
            const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
            totalJoursOuvrables = 0;
            for (let day = 1; day <= daysInMonth; day++) {
                const date = new Date(currentYear, currentMonth - 1, day);
                const dayOfWeek = date.getDay();
                if (dayOfWeek !== 0) { // Exclure les dimanches
                    totalJoursOuvrables++;
                }
            }
            
            // Calculer le prorata
            chargesProrata = (estimatedMonthlyFixedCharges * joursOuvrablesEcoules) / totalJoursOuvrables;
        }

        // Calcul des virements du mois (même logique que l'interface)
        let totalVirementsMois = 0;
        try {
            const virementsResult = await pool.query(`
                SELECT COALESCE(SUM(valeur), 0) as total_virements
                FROM virement_mensuel
                WHERE month_year = $1
            `, [monthYear]);

            totalVirementsMois = parseInt(virementsResult.rows[0].total_virements, 10) || 0;
            console.log(`💸 Virements du mois ${monthYear}: ${totalVirementsMois.toLocaleString()} FCFA`);
        } catch (error) {
            console.error('❌ Erreur calcul virements du mois:', error);
            totalVirementsMois = 0;
        }
        
        // Calculs PL (même logique que l'interface)
        // NOTE: On soustrait totalRemboursements car ils sont déjà inclus dans cashBictorysValue
        // PL de base inclut maintenant les virements du mois (revenus)
        const plSansStockCharges = cashBictorysValue + totalCreance - totalRemboursements + totalVirementsMois + totalStockSoir - totalMonthlyExpenses;
        const brutPL = plSansStockCharges + stockVivantVariation - totalDeliveriesMonth;
        const estimatedPL = plSansStockCharges + stockVivantVariation - chargesProrata - totalDeliveriesMonth;

        // Calculer dynamiquement les PL alternatifs en fonction des configurations comptes_*
        const plAlternatifs = {};
        try {
            // Lire la configuration financière de manière asynchrone
            const configPath = path.join(__dirname, 'financial_settings.json');
            const configExists = await fs.promises.access(configPath).then(() => true).catch(() => false);
            
            if (configExists) {
                const configData = await fs.promises.readFile(configPath, 'utf8');
                const financialConfig = JSON.parse(configData);
                
                // Extraire tous les noeuds commençant par 'comptes_'
                const comptesConfigs = Object.keys(financialConfig)
                    .filter(key => key.startsWith('comptes_'))
                    .reduce((acc, key) => {
                        acc[key] = financialConfig[key];
                        return acc;
                    }, {});
                
                console.log(`\n📊 EXTERNAL API: CALCUL PL ALTERNATIFS`);
                console.log(`📊 Configurations trouvées: ${Object.keys(comptesConfigs).length}`);
                
                // Pour chaque configuration, calculer un PL alternatif
                for (const [configKey, comptesAExclure] of Object.entries(comptesConfigs)) {
                    if (!Array.isArray(comptesAExclure) || comptesAExclure.length === 0) {
                        console.log(`⚠️ Configuration ${configKey} invalide ou vide, ignorée`);
                        continue;
                    }
                    
                    // Générer un nom lisible pour la carte PL
                    const plName = configKey
                        .replace('comptes_', '')
                        .replace(/_/g, ' ')
                        .replace(/\b\w/g, l => l.toUpperCase());
                    
                    console.log(`\n📊 Calcul PL sans: ${plName}`);
                    console.log(`📊 Config key: ${configKey}`);
                    console.log(`📊 Comptes exclus: ${comptesAExclure.join(', ')}`);
                    
                    // Calculer le Cash Burn en excluant les comptes spécifiés
                    const cashBurnExclusQuery = `
                        SELECT COALESCE(SUM(e.total), 0) as total 
                        FROM expenses e
                        JOIN accounts a ON e.account_id = a.id
                        WHERE a.account_name NOT IN (${comptesAExclure.map((_, i) => `$${i + 1}`).join(', ')})
                        AND a.is_active = true 
                        AND a.account_type IN ('classique', 'statut')
                        AND e.expense_date >= $${comptesAExclure.length + 1} 
                        AND e.expense_date <= $${comptesAExclure.length + 2}
                    `;
                    const exclusParams = [...comptesAExclure, startOfMonthStr, selectedDateStr];
                    
                    const cashBurnExclusResult = await pool.query(cashBurnExclusQuery, exclusParams);
                    const cashBurnExclus = parseFloat(cashBurnExclusResult.rows[0].total) || 0;
                    
                    // Calculer les montants exclus (pour affichage)
                    const depensesExclues = totalMonthlyExpenses - cashBurnExclus;
                    
                    // Recalculer les PL avec le Cash Burn alternatif (virements inclus dans PL de base)
                    const plBaseAlt = cashBictorysValue + totalCreance - totalRemboursements + totalVirementsMois + totalStockSoir - cashBurnExclus;
                    const plBrutAlt = plBaseAlt + stockVivantVariation - totalDeliveriesMonth;
                    const plFinalAlt = plBrutAlt - chargesProrata;
                    
                    console.log(`📊 Cash Burn excluant ${comptesAExclure.join(', ')}: ${cashBurnExclus.toLocaleString()} FCFA`);
                    console.log(`📊 Dépenses exclues: ${depensesExclues.toLocaleString()} FCFA`);
                    console.log(`📊 PL Base alternatif: ${plBaseAlt.toLocaleString()} FCFA`);
                    console.log(`📊 PL Final alternatif: ${Math.round(plFinalAlt).toLocaleString()} FCFA`);
                    
                    // Stocker le résultat
                    plAlternatifs[configKey] = {
                        configKey: configKey,
                        nom: plName,
                        comptesExclus: comptesAExclure,
                        cashBurn: cashBurnExclus,
                        depensesExclues: depensesExclues,
                        plBase: plBaseAlt,
                        plBrut: Math.round(plBrutAlt),
                        plFinal: Math.round(plFinalAlt)
                    };
                }
                
                console.log(`📊 FIN CALCUL PL ALTERNATIFS\n`);
            }
        } catch (error) {
            console.error('❌ EXTERNAL API: Erreur calcul PL alternatifs:', error);
        }

        const globalMetrics = {
            profitAndLoss: {
                brutPL: {
                    value: brutPL,
                    components: {
                        cash_bictorys: cashBictorysValue,
                        creances: totalCreance,
                        virements: totalVirementsMois,
                        remboursements: -totalRemboursements,
                        stock_pv: totalStockSoir,
                        cash_burn: -totalMonthlyExpenses,
                        pl_sans_stock_charges: plSansStockCharges,
                        ecart_stock_vivant_mensuel: stockVivantVariation,
                        livraisons_partenaire: -totalDeliveriesMonth
                    }
                },
                estimatedProfitAndLoss: {
                    value: estimatedPL,
                    components: {
                        brut_pl: brutPL,
                        charges_prorata: -chargesProrata
                    }
                },
                chargesFixesTotales: estimatedMonthlyFixedCharges,
                chargesProrata: {
                    value: chargesProrata,
                    jours_ouvrables_ecoules: joursOuvrablesEcoules,
                    total_jours_ouvrables: totalJoursOuvrables,
                    pourcentage: totalJoursOuvrables > 0 ? Math.round((joursOuvrablesEcoules / totalJoursOuvrables) * 100) : 0
                },
                plAlternatifs: plAlternatifs
            },
            balances: {
                // Per request: ignore balance_du_mois in API (set to 0)
                balance_du_mois: 0,
                // Cash disponible computed directly as credits(all) - expenses + net transfers for classique/statut
                cash_disponible: totalBalance,
                cash_burn_du_mois: totalMonthlyExpenses,
                cash_bictorys_du_mois: cashBictorysValue,
                cash_burn_depuis_lundi: totalWeeklyExpenses,
                virements_du_mois: totalVirementsMois
            }
        };

        // ===== RESTRUCTURATION PAR TYPE DE COMPTE =====
        const accountsByType = {};
        
        // Grouper les comptes par type
        Object.keys(statusData).forEach(accountName => {
            const account = statusData[accountName];
            const accountType = account.accountInfo.type;
            
            if (!accountsByType[accountType]) {
                accountsByType[accountType] = {};
            }
            
            accountsByType[accountType][accountName] = account;
        });

        // ===== EXTRACTION DES DONNÉES GLOBALES =====
        // Aucune extraction nécessaire car toutes les données globales sont déjà traitées

        const response = {
            success: true,
            date_selected: isRangeMode ? `${startDateStr} to ${endDateStr}` : selectedDateStr,
            period_info: {
                is_range_mode: isRangeMode,
                start_date: startDateStr,
                end_date: endDateStr,
                selected_date: selectedDateStr,
                start_of_month: startOfMonthStr,
                start_of_week: startOfWeekStr,
                previous_month_period: `${previousMonthStr} to ${endOfPreviousMonthStr}`
            },
            accounts: accountsByType,
            stockVivant: globalStockVivantData,
            livraisonPartenaire: globalLivraisonPartenaireData,
            stockSoirMata: globalStockSoirMataData,
            global_metrics: globalMetrics,
            metadata: {
                total_accounts: accounts.length,
                accounts_processed: Object.keys(statusData).length,
                calculation_date: new Date().toISOString(),
                api_version: "1.0.0"
            }
        };

        console.log(`✅ EXTERNAL: API Status générée avec succès - ${accounts.length} comptes traités`);
        
        // Gestion de l'encodage pour les caractères spéciaux
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        
        // Nettoyer l'encodage de la réponse
        const cleanedResponse = cleanEncoding(response);
        res.json(cleanedResponse);

    } catch (error) {
        console.error('❌ EXTERNAL: Erreur lors de la génération de l\'API status:', error);
        res.status(500).json({ 
            error: 'Erreur serveur lors de la génération des données status',
            code: 'STATUS_API_ERROR',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// =====================================================
// EXTERNAL API FOR EXPENSES STATUS BY ACCOUNT
// =====================================================

// Endpoint pour récupérer les dépenses d'un compte sur une période
app.get('/external/api/depenses/status', requireAdminAuth, async (req, res) => {
    console.log('🌐 EXTERNAL: Appel API depenses/status avec params:', req.query);
    
    try {
        // Validation des paramètres obligatoires
        let { compte, date_debut, date_fin } = req.query;
        
        if (!compte) {
            return res.status(400).json({
                success: false,
                error: 'Paramètres manquants',
                message: 'Le paramètre "compte" est obligatoire',
                required_format: {
                    compte: 'Nom du compte (ex: BOVIN, COMMERCIAL)',
                    date_debut: 'YYYY-MM-DD (optionnel, défaut: aujourd\'hui)',
                    date_fin: 'YYYY-MM-DD (optionnel, défaut: aujourd\'hui)'
                }
            });
        }
        
        // Si une seule date est fournie, utiliser la même pour les deux
        if (date_debut && !date_fin) {
            date_fin = date_debut;
        } else if (date_fin && !date_debut) {
            date_debut = date_fin;
        } else if (!date_debut && !date_fin) {
            // Par défaut: date d'aujourd'hui
            const today = new Date().toISOString().split('T')[0];
            date_debut = today;
            date_fin = today;
            console.log('📅 Aucune date fournie, utilisation de la date d\'aujourd\'hui:', today);
        }
        
        // Validation du format des dates
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(date_debut) || !dateRegex.test(date_fin)) {
            return res.status(400).json({
                success: false,
                error: 'Format de date invalide',
                message: 'Les dates doivent être au format YYYY-MM-DD'
            });
        }
        
        // Normaliser les dates
        const startDateStr = new Date(date_debut).toISOString().split('T')[0];
        const endDateStr = new Date(date_fin).toISOString().split('T')[0];
        
        // Vérifier que date_debut <= date_fin
        if (new Date(startDateStr) > new Date(endDateStr)) {
            return res.status(400).json({
                success: false,
                error: 'Période invalide',
                message: 'La date de début doit être antérieure ou égale à la date de fin'
            });
        }
        
        console.log(`📅 EXTERNAL: Période demandée: ${startDateStr} à ${endDateStr}`);
        console.log(`📊 EXTERNAL: Compte demandé: ${compte}`);
        
        // Récupérer le compte par son nom
        const accountQuery = `
            SELECT a.id, a.account_name, a.user_id, a.account_type, a.current_balance,
                   u.full_name as assigned_director_name
            FROM accounts a
            LEFT JOIN users u ON a.user_id = u.id
            WHERE LOWER(a.account_name) = LOWER($1) AND a.is_active = true
        `;
        
        const accountResult = await pool.query(accountQuery, [compte]);
        
        if (accountResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Compte non trouvé',
                message: `Le compte "${compte}" n'existe pas ou n'est pas actif`
            });
        }
        
        const account = accountResult.rows[0];
        const accountId = account.id;
        const accountName = account.account_name;
        
        console.log(`✅ EXTERNAL: Compte trouvé - ${accountName} (ID: ${accountId})`);
        
        // Récupérer toutes les dépenses de la période
        const expensesQuery = `
            SELECT id, designation, supplier, total, category, subcategory, expense_type,
                   expense_date, created_at, description
            FROM expenses
            WHERE account_id = $1 AND expense_date >= $2 AND expense_date <= $3
            ORDER BY expense_date DESC, created_at DESC
        `;
        
        const expensesResult = await pool.query(expensesQuery, [accountId, startDateStr, endDateStr]);
        const expenses = expensesResult.rows;
        
        console.log(`📝 EXTERNAL: ${expenses.length} dépenses trouvées`);
        
        // Calcul des agrégations
        const totalDepenses = expenses.reduce((sum, exp) => sum + (parseFloat(exp.total) || 0), 0);
        const nombreDepenses = expenses.length;
        const depenseMoyenne = nombreDepenses > 0 ? totalDepenses / nombreDepenses : 0;
        
        // Trouver min et max
        let depenseMin = 0;
        let depenseMax = 0;
        if (nombreDepenses > 0) {
            const montants = expenses.map(exp => parseFloat(exp.total) || 0);
            depenseMin = Math.min(...montants);
            depenseMax = Math.max(...montants);
        }
        
        // Agrégation par catégorie
        const parCategorie = {};
        expenses.forEach(exp => {
            const cat = exp.category || 'Non catégorisé';
            if (!parCategorie[cat]) {
                parCategorie[cat] = { total: 0, count: 0 };
            }
            parCategorie[cat].total += parseFloat(exp.total) || 0;
            parCategorie[cat].count += 1;
        });
        
        // Agrégation par type de dépense
        const parType = {};
        expenses.forEach(exp => {
            const type = exp.expense_type || 'Non défini';
            if (!parType[type]) {
                parType[type] = { total: 0, count: 0 };
            }
            parType[type].total += parseFloat(exp.total) || 0;
            parType[type].count += 1;
        });
        
        // Agrégation par fournisseur
        const parFournisseur = {};
        expenses.forEach(exp => {
            const fournisseur = exp.supplier || 'Non spécifié';
            if (!parFournisseur[fournisseur]) {
                parFournisseur[fournisseur] = { total: 0, count: 0 };
            }
            parFournisseur[fournisseur].total += parseFloat(exp.total) || 0;
            parFournisseur[fournisseur].count += 1;
        });
        
        // Construction de la réponse
        const response = {
            success: true,
            metadata: {
                compte: accountName,
                compte_id: accountId,
                compte_type: account.account_type,
                directeur_assigne: account.assigned_director_name,
                solde_actuel: parseFloat(account.current_balance) || 0,
                periode: {
                    date_debut: startDateStr,
                    date_fin: endDateStr
                },
                generation_timestamp: new Date().toISOString()
            },
            aggregation: {
                total_depenses: totalDepenses,
                nombre_depenses: nombreDepenses,
                depense_moyenne: depenseMoyenne,
                depense_min: depenseMin,
                depense_max: depenseMax,
                par_categorie: parCategorie,
                par_type: parType,
                par_fournisseur: parFournisseur
            },
            details: expenses.map(exp => ({
                id: exp.id,
                date: exp.expense_date.toISOString().split('T')[0],
                designation: exp.designation,
                fournisseur: exp.supplier,
                montant: parseFloat(exp.total) || 0,
                categorie: exp.category,
                sous_categorie: exp.subcategory,
                type_depense: exp.expense_type,
                description: exp.description,
                created_at: exp.created_at.toISOString()
            }))
        };
        
        console.log(`✅ EXTERNAL: API depenses/status générée avec succès`);
        
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.json(response);
        
    } catch (error) {
        console.error('❌ EXTERNAL: Erreur lors de la génération de l\'API depenses/status:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur lors de la récupération des données',
            code: 'DEPENSES_STATUS_API_ERROR',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// =====================================================
// EXTERNAL API FOR PARTNER STATUS
// =====================================================

// Endpoint pour récupérer les livraisons d'un partenaire sur une période
app.get('/external/api/partenaire/status', requireAdminAuth, async (req, res) => {
    console.log('🌐 EXTERNAL: Appel API partenaire/status avec params:', req.query);
    
    try {
        // Validation des paramètres obligatoires
        let { partenaire, date_debut, date_fin } = req.query;
        
        if (!partenaire) {
            return res.status(400).json({
                success: false,
                error: 'Paramètres manquants',
                message: 'Le paramètre "partenaire" est obligatoire',
                required_format: {
                    partenaire: 'Nom du compte partenaire (ex: PARTENAIRE_A)',
                    date_debut: 'YYYY-MM-DD (optionnel, défaut: aujourd\'hui)',
                    date_fin: 'YYYY-MM-DD (optionnel, défaut: aujourd\'hui)'
                }
            });
        }
        
        // Si une seule date est fournie, utiliser la même pour les deux
        if (date_debut && !date_fin) {
            date_fin = date_debut;
        } else if (date_fin && !date_debut) {
            date_debut = date_fin;
        } else if (!date_debut && !date_fin) {
            // Par défaut: date d'aujourd'hui
            const today = new Date().toISOString().split('T')[0];
            date_debut = today;
            date_fin = today;
            console.log('📅 Aucune date fournie, utilisation de la date d\'aujourd\'hui:', today);
        }
        
        // Validation du format des dates
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(date_debut) || !dateRegex.test(date_fin)) {
            return res.status(400).json({
                success: false,
                error: 'Format de date invalide',
                message: 'Les dates doivent être au format YYYY-MM-DD'
            });
        }
        
        // Normaliser les dates
        const startDateStr = new Date(date_debut).toISOString().split('T')[0];
        const endDateStr = new Date(date_fin).toISOString().split('T')[0];
        
        // Vérifier que date_debut <= date_fin
        if (new Date(startDateStr) > new Date(endDateStr)) {
            return res.status(400).json({
                success: false,
                error: 'Période invalide',
                message: 'La date de début doit être antérieure ou égale à la date de fin'
            });
        }
        
        console.log(`📅 EXTERNAL: Période demandée: ${startDateStr} à ${endDateStr}`);
        console.log(`📊 EXTERNAL: Partenaire demandé: ${partenaire}`);
        
        // Récupérer le compte partenaire par son nom
        const accountQuery = `
            SELECT a.id, a.account_name, a.user_id, a.account_type, a.current_balance,
                   a.total_credited, a.total_spent
            FROM accounts a
            WHERE LOWER(a.account_name) = LOWER($1) 
                AND a.account_type = 'partenaire' 
                AND a.is_active = true
        `;
        
        const accountResult = await pool.query(accountQuery, [partenaire]);
        
        if (accountResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Compte partenaire non trouvé',
                message: `Le compte partenaire "${partenaire}" n'existe pas ou n'est pas actif`
            });
        }
        
        const account = accountResult.rows[0];
        const accountId = account.id;
        const accountName = account.account_name;
        
        console.log(`✅ EXTERNAL: Compte partenaire trouvé - ${accountName} (ID: ${accountId})`);
        
        // Récupérer les directeurs assignés
        const directorsQuery = `
            SELECT u.id, u.full_name
            FROM partner_account_directors pad
            JOIN users u ON pad.user_id = u.id
            WHERE pad.account_id = $1
            ORDER BY u.full_name
        `;
        
        const directorsResult = await pool.query(directorsQuery, [accountId]);
        const directors = directorsResult.rows.map(d => ({
            id: d.id,
            nom: d.full_name
        }));
        
        console.log(`👥 EXTERNAL: ${directors.length} directeur(s) assigné(s)`);
        
        // Récupérer toutes les livraisons de la période avec les informations de validation
        const deliveriesQuery = `
            SELECT 
                pd.id, pd.delivery_date, pd.amount, pd.article_count, pd.unit_price,
                pd.description, pd.validation_status, pd.created_at,
                pd.first_validated_at, pd.validated_at, pd.rejected_at,
                pd.rejection_comment,
                ufv.full_name as first_validator_name,
                uv.full_name as final_validator_name,
                ur.full_name as rejector_name
            FROM partner_deliveries pd
            LEFT JOIN users ufv ON pd.first_validated_by = ufv.id
            LEFT JOIN users uv ON pd.validated_by = uv.id
            LEFT JOIN users ur ON pd.rejected_by = ur.id
            WHERE pd.account_id = $1 
                AND pd.delivery_date >= $2 
                AND pd.delivery_date <= $3
            ORDER BY pd.delivery_date DESC, pd.created_at DESC
        `;
        
        const deliveriesResult = await pool.query(deliveriesQuery, [accountId, startDateStr, endDateStr]);
        const allDeliveries = deliveriesResult.rows;
        
        console.log(`📝 EXTERNAL: ${allDeliveries.length} livraison(s) trouvée(s)`);
        
        // Séparer les livraisons validées et non validées
        const validatedDeliveries = allDeliveries.filter(d => d.validation_status === 'fully_validated');
        const nonValidatedDeliveries = allDeliveries.filter(d => d.validation_status !== 'fully_validated');
        
        // Fonction helper pour formatter une livraison
        const formatDelivery = (delivery) => ({
            id: delivery.id,
            date_livraison: delivery.delivery_date.toISOString().split('T')[0],
            montant: parseFloat(delivery.amount) || 0,
            nb_articles: parseFloat(delivery.article_count) || 0,
            prix_unitaire: parseFloat(delivery.unit_price) || 0,
            description: delivery.description,
            statut: delivery.validation_status,
            premiere_validation: delivery.first_validator_name ? {
                par: delivery.first_validator_name,
                date: delivery.first_validated_at?.toISOString() || null
            } : null,
            validation_finale: delivery.final_validator_name ? {
                par: delivery.final_validator_name,
                date: delivery.validated_at?.toISOString() || null
            } : null,
            rejection: delivery.rejector_name ? {
                par: delivery.rejector_name,
                date: delivery.rejected_at?.toISOString() || null,
                commentaire: delivery.rejection_comment || ''
            } : null,
            created_at: delivery.created_at.toISOString()
        });
        
        // Calcul des agrégations pour les livraisons validées
        const totalValidated = validatedDeliveries.reduce((sum, d) => sum + (parseFloat(d.amount) || 0), 0);
        const nombreValidated = validatedDeliveries.length;
        const avgValidated = nombreValidated > 0 ? totalValidated / nombreValidated : 0;
        let minValidated = 0;
        let maxValidated = 0;
        if (nombreValidated > 0) {
            const montants = validatedDeliveries.map(d => parseFloat(d.amount) || 0);
            minValidated = Math.min(...montants);
            maxValidated = Math.max(...montants);
        }
        
        // Calcul des agrégations pour les livraisons non validées
        const totalNonValidated = nonValidatedDeliveries.reduce((sum, d) => sum + (parseFloat(d.amount) || 0), 0);
        const nombreNonValidated = nonValidatedDeliveries.length;
        const avgNonValidated = nombreNonValidated > 0 ? totalNonValidated / nombreNonValidated : 0;
        
        // Agrégation par statut pour les non validées
        const parStatut = {};
        nonValidatedDeliveries.forEach(d => {
            const status = d.validation_status;
            if (!parStatut[status]) {
                parStatut[status] = { total: 0, nombre: 0 };
            }
            parStatut[status].total += parseFloat(d.amount) || 0;
            parStatut[status].nombre += 1;
        });
        
        // Construction de la réponse
        const response = {
            success: true,
            metadata: {
                partenaire: accountName,
                partenaire_id: accountId,
                compte_type: account.account_type,
                directeurs_assignes: directors,
                solde_actuel: parseFloat(account.current_balance) || 0,
                total_credite: parseFloat(account.total_credited) || 0,
                total_depense: parseFloat(account.total_spent) || 0,
                periode: {
                    date_debut: startDateStr,
                    date_fin: endDateStr
                },
                generation_timestamp: new Date().toISOString()
            },
            aggregation: {
                livraisons_validees: {
                    total: totalValidated,
                    nombre: nombreValidated,
                    montant_moyen: avgValidated,
                    montant_min: minValidated,
                    montant_max: maxValidated
                },
                livraisons_non_validees: {
                    total: totalNonValidated,
                    nombre: nombreNonValidated,
                    montant_moyen: avgNonValidated,
                    par_statut: parStatut
                },
                total_general: {
                    total: totalValidated + totalNonValidated,
                    nombre: nombreValidated + nombreNonValidated
                }
            },
            livraisons_validees: validatedDeliveries.map(formatDelivery),
            livraisons_non_validees: nonValidatedDeliveries.map(formatDelivery)
        };
        
        console.log(`✅ EXTERNAL: API partenaire/status générée avec succès`);
        
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.json(response);
        
    } catch (error) {
        console.error('❌ EXTERNAL: Erreur lors de la génération de l\'API partenaire/status:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur lors de la récupération des données',
            code: 'PARTENAIRE_STATUS_API_ERROR',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// ========================================
// 📸 ENDPOINTS SYSTÈME DE SNAPSHOTS
// ========================================

// =====================================================
// EXTERNAL API FOR SNAPSHOTS
// =====================================================

// Endpoint externe pour créer des snapshots avec clé API
app.post('/external/api/snapshots/create', requireAdminAuth, async (req, res) => {
    console.log('🌐 EXTERNAL: Appel API création snapshot avec params:', req.body);
    
    try {
        const { cutoff_date } = req.body; // Date optionnelle au format YYYY-MM-DD
        const targetDate = cutoff_date || new Date().toISOString().split('T')[0];
        
        console.log(`🌐 EXTERNAL: Date cible pour le snapshot: ${targetDate}`);
        
        // Créer le répertoire de snapshots si nécessaire
        const snapshotsDir = path.join(__dirname, 'uploads', 'snapshots');
        if (!fs.existsSync(snapshotsDir)) {
            fs.mkdirSync(snapshotsDir, { recursive: true });
        }
        
        // Créer le répertoire pour cette date
        const dateDir = path.join(snapshotsDir, targetDate);
        if (!fs.existsSync(dateDir)) {
            fs.mkdirSync(dateDir, { recursive: true });
        }
        
        // Collecter toutes les données
        const snapshotData = await collecteSnapshotData(targetDate);
        
        // Ajouter les informations de création pour l'API externe
        snapshotData.metadata.created_by = 'api_external';
        snapshotData.metadata.created_by_username = 'External API';
        snapshotData.metadata.api_call = true;
        snapshotData.metadata.api_timestamp = new Date().toISOString();
        
        // Sauvegarder le snapshot
        const snapshotFilePath = path.join(dateDir, 'snapshot.json');
        fs.writeFileSync(snapshotFilePath, JSON.stringify(snapshotData, null, 2), 'utf8');
        
        // Créer aussi un fichier de métadonnées pour l'indexation
        const metadataFile = path.join(dateDir, 'metadata.json');
        const metadata = {
            snapshot_date: targetDate,
            snapshot_date_fr: formatDateFR(targetDate, 'DD/MM/YYYY'),
            creation_timestamp: new Date().toISOString(),
            created_by: 'api_external',
            created_by_username: 'External API',
            version: '1.2',
            file_size_mb: (Buffer.byteLength(JSON.stringify(snapshotData), 'utf8') / (1024 * 1024)).toFixed(2),
            api_call: true
        };
        fs.writeFileSync(metadataFile, JSON.stringify(metadata, null, 2), 'utf8');
        
        console.log(`🌐 EXTERNAL: Snapshot externe créé avec succès pour ${targetDate}`);
        
        // Réponse API externe optimisée
        res.json({
            success: true,
            message: 'Snapshot créé avec succès',
            data: {
                snapshot_date: targetDate,
                snapshot_date_fr: formatDateFR(targetDate, 'DD/MM/YYYY'),
                creation_timestamp: new Date().toISOString(),
                file_path: `snapshots/${targetDate}/snapshot.json`,
                file_size_mb: metadata.file_size_mb,
                created_via: 'external_api',
                summary: {
                    total_accounts: snapshotData.dashboard.accounts_details.length,
                    total_expenses: snapshotData.depenses.toutes_depenses.length,
                    total_clients: snapshotData.creances.summary.total_clients,
                    total_partner_accounts: snapshotData.comptes_partenaires.summary.total_comptes,
                    stocks_actifs: snapshotData.gestion_stock.summary.total_lignes,
                    period: snapshotData.depenses.summary.period
                }
            }
        });
        
    } catch (error) {
        console.error('🌐 EXTERNAL: Erreur création snapshot:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur lors de la création du snapshot',
            message: error.message,
            code: 'SNAPSHOT_CREATION_ERROR'
        });
    }
});

// Endpoint externe pour lister les snapshots disponibles
app.get('/external/api/snapshots', requireAdminAuth, async (req, res) => {
    console.log('🌐 EXTERNAL: Appel API liste snapshots');
    
    try {
        const snapshotsDir = path.join(__dirname, 'uploads', 'snapshots');
        
        if (!fs.existsSync(snapshotsDir)) {
            return res.json({
                success: true,
                snapshots: [],
                message: 'Aucun snapshot disponible'
            });
        }
        
        const snapshots = [];
        const directories = fs.readdirSync(snapshotsDir, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name)
            .sort((a, b) => b.localeCompare(a)); // Plus récent en premier
        
        for (const dir of directories) {
            const metadataPath = path.join(snapshotsDir, dir, 'metadata.json');
            if (fs.existsSync(metadataPath)) {
                try {
                    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
                    snapshots.push({
                        snapshot_date: metadata.snapshot_date,
                        snapshot_date_fr: metadata.snapshot_date_fr,
                        creation_timestamp: metadata.creation_timestamp,
                        created_by_username: metadata.created_by_username,
                        version: metadata.version,
                        file_size_mb: metadata.file_size_mb,
                        api_call: metadata.api_call || false
                    });
                } catch (parseError) {
                    console.error(`🌐 EXTERNAL: Erreur lecture metadata ${dir}:`, parseError);
                }
            }
        }
        
        res.json({
            success: true,
            total_snapshots: snapshots.length,
            snapshots: snapshots
        });
        
    } catch (error) {
        console.error('🌐 EXTERNAL: Erreur liste snapshots:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur lors de la récupération des snapshots',
            message: error.message
        });
    }
});

// Endpoint externe pour récupérer un snapshot spécifique
app.get('/external/api/snapshots/:date', requireAdminAuth, async (req, res) => {
    console.log('🌐 EXTERNAL: Appel API snapshot spécifique:', req.params.date);
    
    try {
        const { date } = req.params;
        const snapshotFile = path.join(__dirname, 'uploads', 'snapshots', date, 'snapshot.json');
        const metadataFile = path.join(__dirname, 'uploads', 'snapshots', date, 'metadata.json');
        
        if (!fs.existsSync(snapshotFile)) {
            return res.status(404).json({
                success: false,
                error: 'Snapshot non trouvé',
                snapshot_date: date
            });
        }
        
        const snapshotData = JSON.parse(fs.readFileSync(snapshotFile, 'utf8'));
        const metadata = fs.existsSync(metadataFile) 
            ? JSON.parse(fs.readFileSync(metadataFile, 'utf8'))
            : null;
        
        res.json({
            success: true,
            snapshot_date: date,
            snapshot_date_fr: formatDateFR(date, 'DD/MM/YYYY'),
            metadata: metadata,
            data: snapshotData
        });
        
    } catch (error) {
        console.error('🌐 EXTERNAL: Erreur lecture snapshot:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur lors de la lecture du snapshot',
            message: error.message
        });
    }
});

// =====================================================
// INTERNAL API FOR SNAPSHOTS (Interface Web)
// =====================================================

// Créer un nouveau snapshot (interface web)
app.post('/api/snapshots/create', requireAdminAuth, async (req, res) => {
    try {
        console.log('📸 SNAPSHOT: Début création snapshot');
        
        const { cutoff_date } = req.body; // Date optionnelle au format YYYY-MM-DD
        const targetDate = cutoff_date || new Date().toISOString().split('T')[0];
        const userId = req.session.user.id;
        
        console.log(`📸 SNAPSHOT: Date cible: ${targetDate}`);
        
        // Créer le répertoire de snapshots si nécessaire
        const snapshotsDir = path.join(__dirname, 'uploads', 'snapshots');
        if (!fs.existsSync(snapshotsDir)) {
            fs.mkdirSync(snapshotsDir, { recursive: true });
        }
        
        // Créer le répertoire pour cette date
        const dateDir = path.join(snapshotsDir, targetDate);
        if (!fs.existsSync(dateDir)) {
            fs.mkdirSync(dateDir, { recursive: true });
        }
        
        // Collecter toutes les données
        const snapshotData = await collecteSnapshotData(targetDate);
        
        // Ajouter les informations de création
        snapshotData.metadata.created_by = userId;
        snapshotData.metadata.created_by_username = req.session.user.username;
        
        // Sauvegarder le snapshot
        const snapshotFilePath = path.join(dateDir, 'snapshot.json');
        fs.writeFileSync(snapshotFilePath, JSON.stringify(snapshotData, null, 2), 'utf8');
        
        // Créer aussi un fichier de métadonnées pour l'indexation
        const metadataFile = path.join(dateDir, 'metadata.json');
        const fileSizeBytes = fs.statSync(snapshotFilePath).size;
        const metadata = {
            snapshot_date: targetDate,
            creation_timestamp: new Date().toISOString(),
            created_by: userId,
            created_by_username: req.session.user.username,
            file_size: fileSizeBytes,
            file_size_mb: (fileSizeBytes / (1024 * 1024)).toFixed(2),
            snapshot_date_fr: formatDateFR(targetDate, 'DD/MM/YYYY'),
            version: '1.1',
            api_call: false
        };
        fs.writeFileSync(metadataFile, JSON.stringify(metadata, null, 2), 'utf8');
        
        console.log(`📸 SNAPSHOT: Snapshot créé avec succès pour ${targetDate}`);
        console.log(`📸 SNAPSHOT: Taille du fichier: ${metadata.file_size_mb} MB`);
        
        res.json({
            success: true,
            message: `Snapshot créé avec succès pour le ${formatDateFR(targetDate, 'DD/MM/YYYY')}`,
            snapshot_date: targetDate,
            snapshot_date_fr: formatDateFR(targetDate, 'DD/MM/YYYY'),
            file_size: metadata.file_size,
            file_path: snapshotFilePath
        });
        
    } catch (error) {
        console.error('❌ SNAPSHOT: Erreur lors de la création:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la création du snapshot',
            error: error.message
        });
    }
});

// Lister tous les snapshots existants
app.get('/api/snapshots', requireAuth, async (req, res) => {
    try {
        console.log('📸 SNAPSHOT: Liste des snapshots demandée');
        
        const snapshotsDir = path.join(__dirname, 'uploads', 'snapshots');
        
        if (!fs.existsSync(snapshotsDir)) {
            return res.json({
                success: true,
                snapshots: [],
                message: 'Aucun snapshot trouvé'
            });
        }
        
        // Lire tous les répertoires de dates
        const dateDirs = fs.readdirSync(snapshotsDir)
            .filter(item => {
                const fullPath = path.join(snapshotsDir, item);
                return fs.statSync(fullPath).isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(item);
            })
            .sort((a, b) => b.localeCompare(a)); // Tri décroissant (plus récent d'abord)
        
        const snapshots = [];
        
        for (const dateDir of dateDirs) {
            const metadataPath = path.join(snapshotsDir, dateDir, 'metadata.json');
            const snapshotPath = path.join(snapshotsDir, dateDir, 'snapshot.json');
            
            if (fs.existsSync(metadataPath) && fs.existsSync(snapshotPath)) {
                try {
                    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
                    snapshots.push({
                        snapshot_date: metadata.snapshot_date,
                        snapshot_date_fr: metadata.snapshot_date_fr || formatDateFR(metadata.snapshot_date, 'DD/MM/YYYY'),
                        creation_timestamp: metadata.creation_timestamp,
                        created_by_username: metadata.created_by_username,
                        file_size: metadata.file_size,
                        file_size_mb: (metadata.file_size / (1024 * 1024)).toFixed(2),
                        version: metadata.version || '1.0'
                    });
                } catch (parseError) {
                    console.error(`❌ SNAPSHOT: Erreur lecture métadonnées ${dateDir}:`, parseError);
                }
            }
        }
        
        console.log(`📸 SNAPSHOT: ${snapshots.length} snapshots trouvés`);
        
        res.json({
            success: true,
            snapshots: snapshots,
            total_count: snapshots.length
        });
        
    } catch (error) {
        console.error('❌ SNAPSHOT: Erreur lors de la liste:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la récupération des snapshots',
            error: error.message
        });
    }
});

// Lire un snapshot spécifique
app.get('/api/snapshots/:date', requireAuth, async (req, res) => {
    try {
        const { date } = req.params;
        console.log(`📸 SNAPSHOT: Lecture snapshot ${date}`);
        
        // Valider le format de date
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return res.status(400).json({
                success: false,
                message: 'Format de date invalide. Utilisez YYYY-MM-DD'
            });
        }
        
        const snapshotPath = path.join(__dirname, 'uploads', 'snapshots', date, 'snapshot.json');
        const metadataPath = path.join(__dirname, 'uploads', 'snapshots', date, 'metadata.json');
        
        if (!fs.existsSync(snapshotPath)) {
            return res.status(404).json({
                success: false,
                message: `Aucun snapshot trouvé pour la date ${formatDateFR(date, 'DD/MM/YYYY')}`
            });
        }
        
        // Lire le snapshot
        const snapshotData = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
        
        // Lire les métadonnées si disponibles
        let metadata = null;
        if (fs.existsSync(metadataPath)) {
            metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
        }
        
        console.log(`📸 SNAPSHOT: Snapshot ${date} lu avec succès`);
        
        res.json({
            success: true,
            snapshot_date: date,
            snapshot_date_fr: formatDateFR(date, 'DD/MM/YYYY'),
            metadata: metadata,
            data: snapshotData
        });
        
    } catch (error) {
        console.error(`❌ SNAPSHOT: Erreur lecture snapshot ${req.params.date}:`, error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la lecture du snapshot',
            error: error.message
        });
    }
});

// Supprimer un snapshot spécifique (admin uniquement)
app.delete('/api/snapshots/:date', requireAdminAuth, async (req, res) => {
    try {
        const { date } = req.params;
        console.log(`📸 SNAPSHOT: Suppression snapshot ${date}`);
        
        // Valider le format de date
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return res.status(400).json({
                success: false,
                message: 'Format de date invalide. Utilisez YYYY-MM-DD'
            });
        }
        
        const snapshotDir = path.join(__dirname, 'uploads', 'snapshots', date);
        
        if (!fs.existsSync(snapshotDir)) {
            return res.status(404).json({
                success: false,
                message: `Aucun snapshot trouvé pour la date ${formatDateFR(date, 'DD/MM/YYYY')}`
            });
        }
        
        // Supprimer le répertoire complet
        fs.rmSync(snapshotDir, { recursive: true, force: true });
        
        console.log(`📸 SNAPSHOT: Snapshot ${date} supprimé avec succès`);
        
        res.json({
            success: true,
            message: `Snapshot du ${formatDateFR(date, 'DD/MM/YYYY')} supprimé avec succès`
        });
        
    } catch (error) {
        console.error(`❌ SNAPSHOT: Erreur suppression snapshot ${req.params.date}:`, error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la suppression du snapshot',
            error: error.message
        });
    }
});

// ========================================
// 🤖 AI ANALYSIS ENDPOINT
// ========================================

// Function to extract only essential data for AI analysis (reduce token usage)
function extractEssentialDataForAI(financialData) {
    const essential = {
        period_info: financialData.period_info,
        global_metrics: financialData.global_metrics,
        accounts_summary: {},
        all_expenses: []
    };
    
    // Extract account summaries and expenses
    if (financialData.accounts) {
        Object.keys(financialData.accounts).forEach(accountType => {
            const accountsOfType = financialData.accounts[accountType];
            
            Object.entries(accountsOfType).forEach(([accountName, accountData]) => {
                // Store account summary
                if (!essential.accounts_summary[accountType]) {
                    essential.accounts_summary[accountType] = [];
                }
                
                essential.accounts_summary[accountType].push({
                    name: accountName,
                    balance: accountData.accountInfo?.current_balance || 0,
                    monthly_expenses: accountData.monthlyExpenses?.total_monthly_expenses || 0,
                    daily_expenses: accountData.dailyExpenses?.total_daily_expenses || 0
                });
                
                // Extract expenses
                const monthlyExpenses = accountData.monthlyExpenses?.expenses || [];
                const dailyExpenses = accountData.dailyExpenses?.expenses || [];
                
                [...monthlyExpenses, ...dailyExpenses].forEach(expense => {
                    if (expense && expense.amount) {
                        essential.all_expenses.push({
                            account: accountName,
                            account_type: accountType,
                            description: expense.description,
                            supplier: expense.supplier,
                            amount: expense.amount,
                            category: expense.category,
                            subcategory: expense.subcategory,
                            type: expense.type,
                            date: expense.expense_date || expense.created_at
                        });
                    }
                });
            });
        });
    }
    
    // Agréger les dépenses par description/fournisseur identique
    const expenseMap = new Map();
    essential.all_expenses.forEach(expense => {
        // Créer une clé unique basée sur description et fournisseur
        const key = `${expense.description || 'N/A'}_${expense.supplier || 'N/A'}`;
        
        if (expenseMap.has(key)) {
            // Si la clé existe, additionner le montant
            const existing = expenseMap.get(key);
            existing.amount += expense.amount;
            existing.count = (existing.count || 1) + 1;
            existing.accounts = existing.accounts || [existing.account];
            if (!existing.accounts.includes(expense.account)) {
                existing.accounts.push(expense.account);
            }
        } else {
            // Nouvelle entrée
            expenseMap.set(key, {
                ...expense,
                count: 1,
                accounts: [expense.account]
            });
        }
    });
    
    // Convertir la map en array et trier par montant décroissant
    essential.all_expenses = Array.from(expenseMap.values())
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 50)
        .map(expense => ({
            ...expense,
            // Ajouter une note si plusieurs occurrences
            note: expense.count > 1 ? `${expense.count} achats similaires` : undefined,
            account: expense.accounts.length > 1 ? expense.accounts.join(', ') : expense.account
        }));
    
    return essential;
}

// Helper function to split array into chunks
function chunkArray(array, chunkSize) {
    const chunks = [];
    for (let i = 0; i < array.length; i += chunkSize) {
        chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
}

// Helper function to estimate token count
function estimateTokens(data) {
    return Math.ceil(JSON.stringify(data).length / 4);
}

// Analyze a single chunk of accounts
async function analyzeAccountChunk(openai, chunkData, systemPrompt, chunkIndex, totalChunks) {
    const userPrompt = `Ceci est le chunk ${chunkIndex + 1}/${totalChunks} de l'analyse.

Analyse ces données financières:

${JSON.stringify(chunkData, null, 2)}

Fournis une analyse concise pour ce segment en français.`;
    
    const completion = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4-turbo-preview',
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 1500
    });
    
    return {
        analysis: completion.choices[0].message.content,
        tokens_used: completion.usage.total_tokens
    };
}

// Synthesize all chunk analyses into a final report
async function synthesizeAnalyses(openai, chunkAnalyses, globalMetrics, periodInfo) {
    // Format period for display
    let periodText = '';
    if (periodInfo.selected_date) {
        const date = new Date(periodInfo.selected_date);
        periodText = `du ${date.toLocaleDateString('fr-FR')}`;
    } else if (periodInfo.start_date && periodInfo.end_date) {
        const startD = new Date(periodInfo.start_date);
        const endD = new Date(periodInfo.end_date);
        periodText = `du ${startD.toLocaleDateString('fr-FR')} au ${endD.toLocaleDateString('fr-FR')}`;
    }
    
    const synthesisPrompt = `Tu es un analyste financier senior. Tu as reçu plusieurs analyses partielles de données financières.

Voici le contexte global:
- Période: ${JSON.stringify(periodInfo)}
- Métriques globales: ${JSON.stringify(globalMetrics)}

Analyses partielles:
${chunkAnalyses.map((a, i) => '\n--- Segment ' + (i + 1) + ' ---\n' + a).join('\n')}

Tâche: Synthétise ces analyses en un rapport cohérent et structuré en français avec les sections suivantes (utilise EXACTEMENT ce format de numérotation) :

1. Dépenses de la Période
Vue d'ensemble des dépenses de la période analysée. IMPORTANT: Mentionne explicitement la période ${periodText} dans la première phrase.

2. Top 5 des Plus Grosses Dépenses
Liste des 5 plus grosses dépenses mentionnées avec leurs montants.

3. Résumé Exécutif
2-3 phrases sur la santé financière globale.

4. Métriques Clés
Position de trésorerie, P&L, burn rate.

5. Alertes
Problèmes critiques nécessitant attention immédiate.

6. Analyse des Comptes
Performance par type de compte.

7. Recommandations
Actions concrètes pour améliorer la situation.

IMPORTANT: Utilise le format "1. Titre de section" (pas de sous-numérotation). Sois concis et actionnable.`;
    
    const completion = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4-turbo-preview',
        messages: [
            { role: 'system', content: 'Tu es un analyste financier senior spécialisé dans la distribution de viande et volaille au Sénégal.' },
            { role: 'user', content: synthesisPrompt }
        ],
        temperature: 0.7,
        max_tokens: 3000
    });
    
    return {
        analysis: completion.choices[0].message.content,
        tokens_used: completion.usage.total_tokens
    };
}

// Initialize OpenAI client (optional)
let openai = null;
if (process.env.OPENAI_API_KEY) {
    openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
    });
    console.log('✅ OpenAI client initialized');
} else {
    console.log('⚠️ OpenAI API key not found - AI analysis will be disabled');
}

// AI Analysis endpoint
app.get('/api/ai-analysis', requireAuth, async (req, res) => {
    try {
        // Check if OpenAI is available
        if (!openai) {
            return res.status(503).json({
                success: false,
                error: 'Service d\'analyse IA non disponible - clé API manquante'
            });
        }
        
        const { selected_date, start_date, end_date } = req.query;
        
        console.log('🤖 AI Analysis request:', { selected_date, start_date, end_date });
        
        // Build parameters for external API
        const apiParams = new URLSearchParams();
        if (selected_date) {
            // /external/api/status expects 'date' parameter, not 'selected_date'
            apiParams.append('date', selected_date);
        } else if (start_date && end_date) {
            apiParams.append('start_date', start_date);
            apiParams.append('end_date', end_date);
        } else {
            return res.status(400).json({
                success: false,
                error: 'Veuillez fournir soit selected_date, soit start_date et end_date'
            });
        }
        
        // Fetch financial data from internal API
        const baseUrl = getAppBaseUrl(req);
        const apiUrl = `${baseUrl}/external/api/status?${apiParams.toString()}`;
        
        console.log('🔗 Fetching data from:', apiUrl);
        
        const axios = require('axios');
        const financialResponse = await axios.get(apiUrl, {
            headers: {
                'Cookie': req.headers.cookie // Forward session cookie
            }
        });
        
        const financialData = financialResponse.data;
        console.log('📊 Financial data received');
        
        // Extract only essential data for AI to reduce token usage
        const essentialData = extractEssentialDataForAI(financialData);
        const estimatedTokens = estimateTokens(essentialData);
        console.log('📄 Essential data extracted, estimated tokens:', estimatedTokens);
        
        // Build AI prompt with comprehensive context
        const systemPrompt = `You are analyzing financial status data from the Mata Group expense management system, a meat and poultry distribution business operating in Senegal.

## BUSINESS CONTEXT
**Company**: Mata Group - Meat & Poultry Distribution
**Operations**: Multiple sales points (Dahra, Linguere, Keur Massar, Mbao, Ouest Foire, Sacré Coeur) selling beef, lamb, chicken, and related products
**Business Model**: Direct sales, credit/debt management, poultry partnerships, live animal stock

Analyze financial data and provide insights in French. Be concise and actionable.`;
        
        let aiAnalysis;
        let totalTokensUsed = 0;
        
        // Determine if we're in range mode (start_date and end_date provided)
        const isRangeMode = start_date && end_date;
        
        // Check if data is too large AND we're in range mode
        if (isRangeMode && estimatedTokens > 80000) {
            console.log('🔄 Data too large, using chunked analysis...');
            
            // Prepare global context (always included)
            const globalContext = {
                period_info: essentialData.period_info,
                global_metrics: essentialData.global_metrics,
                top_expenses: essentialData.all_expenses.slice(0, 10) // Top 10 for context
            };
            
            // Split accounts into chunks
            const accountTypes = Object.keys(essentialData.accounts_summary);
            const chunkSize = Math.ceil(accountTypes.length / 3); // Split into ~3 chunks
            const accountChunks = chunkArray(accountTypes, chunkSize);
            
            console.log(`📦 Splitting into ${accountChunks.length} chunks...`);
            
            // Analyze each chunk
            const chunkAnalyses = [];
            for (let i = 0; i < accountChunks.length; i++) {
                const chunk = accountChunks[i];
                const chunkData = {
                    ...globalContext,
                    accounts: {}
                };
                
                // Add only accounts in this chunk
                chunk.forEach(accountType => {
                    chunkData.accounts[accountType] = essentialData.accounts_summary[accountType];
                });
                
                console.log(`🔍 Analyzing chunk ${i + 1}/${accountChunks.length}...`);
                const result = await analyzeAccountChunk(openai, chunkData, systemPrompt, i, accountChunks.length);
                chunkAnalyses.push(result.analysis);
                totalTokensUsed += result.tokens_used;
            }
            
            console.log('🔄 Synthesizing chunk analyses...');
            
            // Synthesize all analyses
            const synthesis = await synthesizeAnalyses(
                openai,
                chunkAnalyses,
                essentialData.global_metrics,
                essentialData.period_info
            );
            
            aiAnalysis = synthesis.analysis;
            totalTokensUsed += synthesis.tokens_used;
            
            console.log(`✅ Chunked analysis completed. Total tokens: ${totalTokensUsed}`);
            
        } else {
            console.log('🤖 Calling OpenAI API (single request)...');
            
            // Format period for display
            let periodText = '';
            if (selected_date) {
                const date = new Date(selected_date);
                periodText = `du ${date.toLocaleDateString('fr-FR')}`;
            } else if (start_date && end_date) {
                const startD = new Date(start_date);
                const endD = new Date(end_date);
                periodText = `du ${startD.toLocaleDateString('fr-FR')} au ${endD.toLocaleDateString('fr-FR')}`;
            }
            
            const userPrompt = `Analyse ces données financières:

${JSON.stringify(essentialData, null, 2)}

Fournis une analyse structurée en français avec:

1. **Paragraphe sur les Dépenses**: Vue d'ensemble (nombre, montant total, catégories). IMPORTANT: Mentionne explicitement la période analysée ${periodText} dans la première phrase.
2. **Top 5 des Plus Grosses Dépenses**: Liste détaillée
3. **Résumé Exécutif**: Santé financière globale
4. **Métriques Clés**: Trésorerie, P&L, burn rate
5. **Alertes**: Problèmes critiques
6. **Analyse des Comptes**: Performance par type
7. **Recommandations**: Actions prioritaires`;
            
            // Call OpenAI API
            const completion = await openai.chat.completions.create({
                model: process.env.OPENAI_MODEL || 'gpt-4-turbo-preview',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                temperature: 0.7,
                max_tokens: 3000
            });
            
            aiAnalysis = completion.choices[0].message.content;
            totalTokensUsed = completion.usage.total_tokens;
            
            console.log('✅ AI Analysis completed');
        }
        
        // Return both raw data and AI analysis
        res.json({
            success: true,
            data: {
                financial_data: financialData,
                ai_analysis: aiAnalysis,
                metadata: {
                    model: process.env.OPENAI_MODEL || 'gpt-4-turbo-preview',
                    tokens_used: totalTokensUsed,
                    analysis_date: new Date().toISOString(),
                    chunked: isRangeMode && estimatedTokens > 80000,
                    mode: isRangeMode ? 'range' : 'single_date'
                }
            }
        });
        
    } catch (error) {
        console.error('❌ Error in AI analysis:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur lors de l\'analyse AI',
            details: error.message
        });
    }
});

// Validation des variables d'environnement critiques au démarrage
if (!process.env.API_KEY) {
    console.error('❌ ERREUR FATALE: La variable d\'environnement API_KEY n\'est pas définie');
    console.error('❌ L\'application ne peut pas démarrer sans API_KEY pour sécuriser les endpoints');
    process.exit(1);
}

// Démarrage du serveur
app.listen(PORT, () => {
    console.log(`Serveur démarré sur le port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    
    // Déterminer l'URL de l'application
    const appUrl = getAppBaseUrl();
    console.log(`Accédez à l'application sur ${appUrl}`);
});

// Route pour ajouter une opération de remboursement/dette
app.post('/api/remboursements', requireAuth, async (req, res) => {
    try {
        const { nom_client, numero_tel, date, action, commentaire, montant } = req.body;
        console.log('Received remboursement request:', { nom_client, numero_tel, date, action, commentaire, montant });
        
        // Validate required fields
        const missingFields = [];
        if (!nom_client) missingFields.push('nom_client');
        if (!numero_tel) missingFields.push('numero_tel');
        if (!date) missingFields.push('date');
        if (!action) missingFields.push('action');
        if (!montant) missingFields.push('montant');
        
        if (missingFields.length > 0) {
            console.log('Missing required fields:', missingFields);
            return res.status(400).json({ error: `Champs obligatoires manquants: ${missingFields.join(', ')}` });
        }

        if (!['remboursement', 'dette'].includes(action)) {
            console.log('Invalid action:', action);
            return res.status(400).json({ error: 'Action invalide. Doit être "remboursement" ou "dette".' });
        }

        const result = await pool.query(
            `INSERT INTO remboursements (nom_client, numero_tel, date, action, commentaire, montant)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [nom_client, numero_tel, date, action, commentaire, montant]
        );
        console.log('Operation created:', result.rows[0]);
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Detailed error in remboursements:', error);
        res.status(500).json({ error: 'Erreur serveur: ' + error.message });
    }
});

// Route pour lister les opérations de remboursement/dette (avec filtres)
app.get('/api/remboursements', requireAuth, async (req, res) => {
    try {
        const { numero_tel, date_debut, date_fin } = req.query;
        let query = 'SELECT * FROM remboursements WHERE 1=1';
        const params = [];
        let idx = 1;
        if (numero_tel) {
            query += ` AND numero_tel = $${idx++}`;
            params.push(numero_tel);
        }
        if (date_debut) {
            query += ` AND date >= $${idx++}`;
            params.push(date_debut);
        }
        if (date_fin) {
            query += ` AND date <= $${idx++}`;
            params.push(date_fin);
        }
        query += ' ORDER BY date DESC, id DESC';
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error('Erreur récupération remboursements:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour la synthèse par client sur une plage de dates
app.get('/api/remboursements/synthese', requireAuth, async (req, res) => {
    try {
        const { date_debut, date_fin } = req.query;
        let query = `SELECT nom_client, numero_tel,
            SUM(CASE WHEN action = 'remboursement' THEN montant ELSE -montant END) AS total,
            MAX(date) AS dernier_paiement
            FROM remboursements WHERE 1=1`;
        const params = [];
        let idx = 1;
        if (date_debut) {
            query += ` AND date >= $${idx++}`;
            params.push(date_debut);
        }
        if (date_fin) {
            query += ` AND date <= $${idx++}`;
            params.push(date_fin);
        }
        query += ' GROUP BY nom_client, numero_tel ORDER BY nom_client';
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error('Erreur synthèse remboursements:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});
// Route pour ajouter une permission de crédit pour un compte classique
app.post('/api/accounts/:accountId/credit-permissions', requireAdminAuth, async (req, res) => {
    try {
        const { accountId } = req.params;
        const { user_id } = req.body;
        const granted_by = req.session.user.id;

        // Vérifier que le compte existe et est de type classique
        const accountCheck = await pool.query(
            'SELECT * FROM accounts WHERE id = $1 AND account_type = $2',
            [accountId, 'classique']
        );

        if (accountCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Compte classique non trouvé' });
        }

        // Vérifier que l'utilisateur existe et est un directeur
        const userCheck = await pool.query(
            'SELECT * FROM users WHERE id = $1 AND role = $2',
            [user_id, 'directeur']
        );

        if (userCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Directeur non trouvé' });
        }

        // Ajouter la permission (gérer les doublons avec ON CONFLICT)
        await pool.query(
            'INSERT INTO account_credit_permissions (account_id, user_id, granted_by) VALUES ($1, $2, $3) ON CONFLICT (account_id, user_id) DO NOTHING',
            [accountId, user_id, granted_by]
        );

        res.json({ message: 'Permission de crédit accordée avec succès' });
    } catch (error) {
        console.error('Erreur lors de l\'ajout de la permission:', error);
        res.status(500).json({ error: 'Erreur lors de l\'ajout de la permission' });
    }
});

// Route pour retirer une permission de crédit
app.delete('/api/accounts/:accountId/credit-permissions/:userId', requireAdminAuth, async (req, res) => {
    try {
        const { accountId, userId } = req.params;

        await pool.query(
            'DELETE FROM account_credit_permissions WHERE account_id = $1 AND user_id = $2',
            [accountId, userId]
        );

        res.json({ message: 'Permission de crédit retirée avec succès' });
    } catch (error) {
        console.error('Erreur lors du retrait de la permission:', error);
        res.status(500).json({ error: 'Erreur lors du retrait de la permission' });
    }
});

// =====================================================
// STOCK SOIR ROUTES
// =====================================================

// Route pour uploader un fichier JSON de réconciliation et créer les données de stock
app.post('/api/stock-mata/upload', requireAdminAuth, upload.single('reconciliation'), async (req, res) => {
    try {
        console.log('🚀 SERVER: Route /api/stock-mata/upload appelée');
        console.log('🚀 SERVER: Headers reçus:', req.headers);
        console.log('🚀 SERVER: User info:', {
            user: req.user?.username,
            role: req.user?.role,
            id: req.user?.id
        });
        
        console.log('🔍 SERVER: Début de l\'upload de fichier JSON');
        console.log('📂 SERVER: Fichier reçu:', req.file);
        console.log('📂 SERVER: Body reçu:', req.body);
        
        if (!req.file) {
            console.log('❌ SERVER: Aucun fichier fourni');
            return res.status(400).json({ error: 'Aucun fichier fourni' });
        }

        console.log('📄 SERVER: Chemin du fichier:', req.file.path);
        console.log('📄 SERVER: Nom original:', req.file.originalname);
        console.log('📄 SERVER: Taille:', req.file.size, 'bytes');
        console.log('📄 SERVER: Type MIME:', req.file.mimetype);

        // Lire le fichier JSON
        console.log('📖 SERVER: Lecture du fichier...');
        const fileContent = fs.readFileSync(req.file.path, 'utf8');
        console.log('📄 SERVER: Contenu lu, taille:', fileContent.length, 'caractères');
        console.log('📄 SERVER: Premiers 200 caractères:', fileContent.substring(0, 200));
        
        let reconciliationData;

        try {
            reconciliationData = JSON.parse(fileContent);
            console.log('✅ JSON parsé avec succès');
        } catch (parseError) {
            console.log('❌ Erreur parsing JSON:', parseError.message);
            fs.unlinkSync(req.file.path); // Supprimer le fichier temporaire
            return res.status(400).json({ error: 'Format JSON invalide' });
        }

        // Vérifier la structure du JSON
        console.log('🔍 Validation de la structure JSON:');
        console.log('- Est un array:', Array.isArray(reconciliationData));
        console.log('- Premier élément existe:', !!reconciliationData[0]);
        console.log('- Success property:', reconciliationData[0]?.success);
        console.log('- Data exists:', !!reconciliationData[0]?.data);
        console.log('- Details exists:', !!reconciliationData[0]?.data?.details);
        
        if (!Array.isArray(reconciliationData) || !reconciliationData[0] || 
            !reconciliationData[0].success || !reconciliationData[0].data || 
            !reconciliationData[0].data.details) {
            console.log('❌ Structure JSON invalide');
            fs.unlinkSync(req.file.path);
            return res.status(400).json({ error: 'Structure JSON invalide' });
        }
        
        console.log('✅ Structure JSON validée');

        const data = reconciliationData[0].data;
        const date = data.date; // Format: "18-06-2025"
        const details = data.details;

        // Convertir la date au format PostgreSQL (YYYY-MM-DD)
        const dateParts = date.split('-');
        const formattedDate = `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`;

        // Vérifier s'il y a des données existantes pour cette date
        const existingDataQuery = await pool.query(`
                    SELECT DISTINCT point_de_vente, produit, stock_matin, stock_soir, transfert
        FROM stock_mata 
            WHERE date = $1
            ORDER BY point_de_vente, produit
        `, [formattedDate]);

        const existingRecords = existingDataQuery.rows;
        
        // Produits agrégés dont les sous-produits doivent être comptés à la place
        // Si un point de vente a à la fois l'agrégat ET ses sous-produits, on ignore l'agrégat
        const AGGREGATE_PRODUCTS = {
            'Poisson': ['Dorade', 'Beurre', 'Sompote', 'Seud (barracuda)', 'Crevettes', 'Tilapia']
        };

        const getProductsToSkip = (pointData, pointVenteName = '') => {
            const toSkip = new Set(['Bovin']);
            for (const [aggregate, subProducts] of Object.entries(AGGREGATE_PRODUCTS)) {
                if (aggregate in pointData) {
                    const hasSubProducts = subProducts.some(sub =>
                        sub in pointData && (
                            (pointData[sub].stockMatin || 0) > 0 ||
                            (pointData[sub].stockSoir || 0) > 0 ||
                            (pointData[sub].transferts || 0) > 0
                        )
                    );
                    if (hasSubProducts) {
                        console.log(`⚠️ SKIP agrégat doublon: "${aggregate}" ignoré pour ${pointVenteName} (sous-produits détaillés présents)`);
                        toSkip.add(aggregate);
                    }
                }
            }
            return toSkip;
        };

        // Préparer la liste des nouveaux enregistrements
        const newRecords = [];
        for (const pointVente in details) {
            const pointData = details[pointVente];
            const productsToSkip = getProductsToSkip(pointData, pointVente);
            for (const produit in pointData) {
                if (productsToSkip.has(produit)) {
                    continue;
                }
                const productData = pointData[produit];
                newRecords.push({
                    point_de_vente: pointVente,
                    produit: produit,
                    stock_matin: productData.stockMatin || 0,
                    stock_soir: productData.stockSoir || 0,
                    transfert: productData.transferts || 0
                });
            }
        }

        // Si des données existent déjà pour cette date, retourner un avertissement
        if (existingRecords.length > 0) {
            fs.unlinkSync(req.file.path);
            return res.status(409).json({ 
                error: 'duplicate_data',
                message: 'Des données existent déjà pour cette date',
                date: formattedDate,
                existingRecords: existingRecords.length,
                newRecords: newRecords.length,
                existingData: existingRecords
            });
        }

        await pool.query('BEGIN');

        let insertedRecords = 0;
        let updatedRecords = 0;

        // Parcourir chaque point de vente
        for (const pointVente in details) {
            const pointData = details[pointVente];
            const productsToSkip = getProductsToSkip(pointData);

            // Parcourir chaque produit du point de vente
            for (const produit in pointData) {
                if (productsToSkip.has(produit)) {
                    continue;
                }

                const productData = pointData[produit];
                const stockMatin = productData.stockMatin || 0;
                const stockSoir = productData.stockSoir || 0;
                const transfert = productData.transferts || 0;

                // Insérer ou mettre à jour les données
                const result = await pool.query(`
                    INSERT INTO stock_mata (date, point_de_vente, produit, stock_matin, stock_soir, transfert)
                    VALUES ($1, $2, $3, $4, $5, $6)
                    ON CONFLICT (date, point_de_vente, produit)
                    DO UPDATE SET 
                        stock_matin = EXCLUDED.stock_matin,
                        stock_soir = EXCLUDED.stock_soir,
                        transfert = EXCLUDED.transfert,
                        updated_at = CURRENT_TIMESTAMP
                    RETURNING (xmax = 0) AS inserted
                `, [formattedDate, pointVente, produit, stockMatin, stockSoir, transfert]);

                if (result.rows[0].inserted) {
                    insertedRecords++;
                } else {
                    updatedRecords++;
                }
            }
        }

        await pool.query('COMMIT');

        // Supprimer le fichier temporaire
        fs.unlinkSync(req.file.path);

        res.json({
            message: 'Données de stock importées avec succès',
            date: formattedDate,
            insertedRecords,
            updatedRecords,
            totalRecords: insertedRecords + updatedRecords
        });

    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('Erreur lors de l\'import des données de stock:', error);
        
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        
        res.status(500).json({ error: 'Erreur lors de l\'import des données' });
    }
});

// Route pour forcer l'import après confirmation des doublons
app.post('/api/stock-mata/force-upload', requireAdminAuth, upload.single('reconciliation'), async (req, res) => {
    try {
        console.log('🔍 DEBUG: Import forcé après confirmation');
        
        if (!req.file) {
            console.log('❌ Aucun fichier fourni pour import forcé');
            return res.status(400).json({ error: 'Aucun fichier fourni' });
        }

        // Lire le fichier JSON
        const fileContent = fs.readFileSync(req.file.path, 'utf8');
        let reconciliationData;

        try {
            reconciliationData = JSON.parse(fileContent);
            console.log('✅ JSON parsé avec succès pour import forcé');
        } catch (parseError) {
            console.log('❌ Erreur parsing JSON pour import forcé:', parseError.message);
            fs.unlinkSync(req.file.path);
            return res.status(400).json({ error: 'Format JSON invalide' });
        }

        // Vérifier la structure du JSON
        if (!Array.isArray(reconciliationData) || !reconciliationData[0] || 
            !reconciliationData[0].success || !reconciliationData[0].data || 
            !reconciliationData[0].data.details) {
            console.log('❌ Structure JSON invalide pour import forcé');
            fs.unlinkSync(req.file.path);
            return res.status(400).json({ error: 'Structure JSON invalide' });
        }

        const data = reconciliationData[0].data;
        const date = data.date;
        const details = data.details;

        // Convertir la date au format PostgreSQL (YYYY-MM-DD)
        const dateParts = date.split('-');
        const formattedDate = `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`;

        console.log('🔄 Import forcé - Suppression des données existantes pour la date:', formattedDate);

        await pool.query('BEGIN');

        // Supprimer toutes les données existantes pour cette date
        const deleteResult = await pool.query('DELETE FROM stock_mata WHERE date = $1', [formattedDate]);
        console.log(`🗑️ ${deleteResult.rowCount} enregistrements supprimés`);

        // Produits agrégés dont les sous-produits doivent être comptés à la place
        const AGGREGATE_PRODUCTS_FORCE = {
            'Poisson': ['Dorade', 'Beurre', 'Sompote', 'Seud (barracuda)', 'Crevettes', 'Tilapia']
        };

        const getProductsToSkipForce = (pointData, pointVenteName = '') => {
            const toSkip = new Set(['Bovin', 'Non spécifié']);
            for (const [aggregate, subProducts] of Object.entries(AGGREGATE_PRODUCTS_FORCE)) {
                if (aggregate in pointData) {
                    const hasSubProducts = subProducts.some(sub =>
                        sub in pointData && (
                            (pointData[sub].stockMatin || 0) > 0 ||
                            (pointData[sub].stockSoir || 0) > 0 ||
                            (pointData[sub].transferts || 0) > 0
                        )
                    );
                    if (hasSubProducts) {
                        console.log(`⚠️ FORCE-SKIP agrégat doublon: "${aggregate}" ignoré pour ${pointVenteName} (sous-produits détaillés présents)`);
                        toSkip.add(aggregate);
                    }
                }
            }
            return toSkip;
        };

        let insertedRecords = 0;

        // Parcourir chaque point de vente et insérer les nouvelles données
        for (const pointVente in details) {
            const pointData = details[pointVente];
            const productsToSkip = getProductsToSkipForce(pointData, pointVente);

            for (const produit in pointData) {
                if (productsToSkip.has(produit)) {
                    continue;
                }

                const productData = pointData[produit];
                const stockMatin = productData.stockMatin || 0;
                const stockSoir = productData.stockSoir || 0;
                const transfert = productData.transferts || 0;

                await pool.query(`
                    INSERT INTO stock_mata (date, point_de_vente, produit, stock_matin, stock_soir, transfert)
                    VALUES ($1, $2, $3, $4, $5, $6)
                `, [formattedDate, pointVente, produit, stockMatin, stockSoir, transfert]);

                insertedRecords++;
            }
        }

        await pool.query('COMMIT');
        console.log(`✅ Import forcé terminé: ${insertedRecords} nouveaux enregistrements`);

        // Supprimer le fichier temporaire
        fs.unlinkSync(req.file.path);

        res.json({
            message: 'Données remplacées avec succès',
            date: formattedDate,
            deletedRecords: deleteResult.rowCount,
            insertedRecords,
            totalRecords: insertedRecords
        });

    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('Erreur lors de l\'import forcé:', error);
        
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        
        res.status(500).json({ error: 'Erreur lors de l\'import forcé' });
    }
});

// Route pour récupérer les données de stock par date
app.get('/api/stock-mata', requireAdminAuth, async (req, res) => {
    try {
        const { date, point_de_vente } = req.query;
        
        let query = 'SELECT * FROM stock_mata';
        let params = [];
        const conditions = [];

        if (date) {
            conditions.push(`date = $${params.length + 1}`);
            params.push(date);
        }
        if (point_de_vente) {
            conditions.push(`point_de_vente = $${params.length + 1}`);
            params.push(point_de_vente);
        }
        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }
        
        query += ' ORDER BY point_de_vente, produit';
        
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error('Erreur récupération données stock:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour récupérer les dates disponibles
app.get('/api/stock-mata/dates', requireAdminAuth, async (req, res) => {
    try {
        // Formatter la date directement en SQL pour éviter les problèmes de timezone
        const result = await pool.query(
            "SELECT DISTINCT TO_CHAR(date_stock, 'YYYY-MM-DD') as date FROM stock_mata ORDER BY date DESC"
        );
        res.json(result.rows);
    } catch (error) {
        console.error('Erreur lors de la récupération des dates de stock:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour récupérer les statistiques par point de vente
app.get('/api/stock-mata/statistiques', requireAdminAuth, async (req, res) => {
    try {
        const { date } = req.query;
        
        let query = `
            SELECT 
                point_de_vente,
                COUNT(*) as nombre_produits,
                SUM(stock_matin) as total_stock_matin,
                SUM(stock_soir) as total_stock_soir,
                SUM(transfert) as total_transfert,
                SUM(stock_matin - stock_soir + transfert) as total_ventes_theoriques
            FROM stock_mata
        `;
        let params = [];
        
        if (date) {
            query += ' WHERE date = $1';
            params.push(date);
        }
        
        query += ' GROUP BY point_de_vente ORDER BY point_de_vente';
        
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error('Erreur récupération statistiques stock:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour ajouter une nouvelle entrée de stock manuellement
app.post('/api/stock-mata', requireAdminAuth, async (req, res) => {
    try {
        const { date, point_de_vente, produit, stock_matin, stock_soir, transfert } = req.body;
        
        if (!date || !point_de_vente || !produit) {
            return res.status(400).json({ error: 'Date, point de vente et produit sont obligatoires' });
        }

        const result = await pool.query(`
            INSERT INTO stock_mata (date, point_de_vente, produit, stock_matin, stock_soir, transfert)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
        `, [date, point_de_vente, produit, stock_matin || 0, stock_soir || 0, transfert || 0]);

        res.json(result.rows[0]);
    } catch (error) {
        if (error.code === '23505') { // Violation de contrainte unique
            res.status(409).json({ error: 'Une entrée existe déjà pour cette date, ce point de vente et ce produit' });
        } else {
            console.error('Erreur ajout stock:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }
});

// Route pour modifier une entrée de stock
app.put('/api/stock-mata/:id', requireAdminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { date, point_de_vente, produit, stock_matin, stock_soir, transfert } = req.body;
        
        if (!date || !point_de_vente || !produit) {
            return res.status(400).json({ error: 'Date, point de vente et produit sont obligatoires' });
        }

        const result = await pool.query(`
            UPDATE stock_mata 
            SET date = $1, point_de_vente = $2, produit = $3, 
                stock_matin = $4, stock_soir = $5, transfert = $6,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $7
            RETURNING *
        `, [date, point_de_vente, produit, stock_matin || 0, stock_soir || 0, transfert || 0, id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Entrée non trouvée' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        if (error.code === '23505') { // Violation de contrainte unique
            res.status(409).json({ error: 'Une entrée existe déjà pour cette date, ce point de vente et ce produit' });
        } else {
            console.error('Erreur modification stock:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }
});

// Route pour supprimer une entrée de stock
app.delete('/api/stock-mata/:id', requireAdminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await pool.query('DELETE FROM stock_mata WHERE id = $1 RETURNING *', [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Entrée non trouvée' });
        }

        res.json({ message: 'Entrée supprimée avec succès', deleted: result.rows[0] });
    } catch (error) {
        console.error('Erreur suppression stock:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour supprimer toutes les entrées de stock d'une date donnée
app.delete('/api/stock-mata/delete-by-date/:date', requireAdminAuth, async (req, res) => {
    try {
        const { date } = req.params;
        const username = req.session?.user?.username || 'Unknown';
        const userRole = req.session?.user?.role || 'Unknown';
        
        console.log(`🗑️ SERVER: Demande de suppression de stock pour la date ${date} par ${username} (${userRole})`);
        
        // Vérifier que la date est au bon format (YYYY-MM-DD)
        if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            console.log('❌ SERVER: Format de date invalide:', date);
            return res.status(400).json({ error: 'Format de date invalide. Utilisez YYYY-MM-DD' });
        }
        
        // Compter d'abord le nombre d'entrées à supprimer
        const countResult = await pool.query(
            'SELECT COUNT(*) as count FROM stock_mata WHERE date = $1',
            [date]
        );
        
        const countToDelete = parseInt(countResult.rows[0].count);
        console.log(`📊 SERVER: ${countToDelete} entrée(s) trouvée(s) pour la date ${date}`);
        
        if (countToDelete === 0) {
            console.log('⚠️ SERVER: Aucune entrée à supprimer pour cette date');
            return res.status(404).json({ error: 'Aucune entrée trouvée pour cette date' });
        }
        
        // Supprimer toutes les entrées pour cette date
        const result = await pool.query(
            'DELETE FROM stock_mata WHERE date = $1 RETURNING id, point_de_vente, produit',
            [date]
        );
        
        console.log(`✅ SERVER: ${result.rows.length} entrée(s) supprimée(s) avec succès pour la date ${date}`);
        
        res.json({
            message: `${result.rows.length} entrée(s) de stock supprimée(s) avec succès pour la date ${date}`,
            count: result.rows.length,
            date: date,
            deleted_by: username,
            deleted_items: result.rows
        });
    } catch (error) {
        console.error('❌ SERVER: Erreur suppression stock par date:', error);
        res.status(500).json({ error: 'Erreur serveur lors de la suppression' });
    }
});

// Route pour récupérer une entrée spécifique
app.get('/api/stock-mata/:id', requireAdminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await pool.query('SELECT * FROM stock_mata WHERE id = $1', [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Entrée non trouvée' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Erreur récupération stock:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour lister les permissions de crédit d'un compte
app.get('/api/accounts/:accountId/credit-permissions', requireAuth, async (req, res) => {
    try {
        const { accountId } = req.params;

        const result = await pool.query(
            `SELECT acp.*, u.full_name, u.role, ug.full_name as granted_by_name
             FROM account_credit_permissions acp
             JOIN users u ON acp.user_id = u.id
             JOIN users ug ON acp.granted_by = ug.id
             WHERE acp.account_id = $1`,
            [accountId]
        );

        res.json(result.rows);
    } catch (error) {
        console.error('Erreur lors de la récupération des permissions:', error);
        res.status(500).json({ error: 'Erreur lors de la récupération des permissions' });
    }
});

// Route pour récupérer les comptes qu'un directeur peut créditer
app.get('/api/director/crediteable-accounts', requireAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const userRole = req.session.user.role;
        
        let query = `
            SELECT a.id, a.account_name, COALESCE(a.account_type, 'classique') as account_type,
                   a.current_balance, a.total_credited, u.full_name as user_name
            FROM accounts a
            LEFT JOIN users u ON a.user_id = u.id
            WHERE a.is_active = true
        `;
        let params = [];
        
        if (userRole === 'directeur_general' || userRole === 'pca' || userRole === 'admin') {
            // DG, PCA et admin voient tous les comptes
            query += ` ORDER BY a.account_name`;
        } else if (userRole === 'directeur') {
            // Directeurs voient seulement les comptes pour lesquels ils ont une permission
            query += ` AND EXISTS (
                SELECT 1 FROM account_credit_permissions acp 
                WHERE acp.account_id = a.id AND acp.user_id = $1
            ) ORDER BY a.account_name`;
            params.push(userId);
        } else {
            // Autres rôles n'ont pas accès
            return res.json([]);
        }
        
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error('Erreur récupération comptes créditables:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour récupérer l'historique des crédits d'un directeur
app.get('/api/director/credit-history', requireAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;
        
        const result = await pool.query(`
            SELECT sch.*, a.account_name
            FROM special_credit_history sch
            JOIN accounts a ON sch.account_id = a.id
            WHERE sch.credited_by = $1
            ORDER BY sch.created_at DESC
            LIMIT 20
        `, [userId]);
        
        res.json(result.rows);
    } catch (error) {
        console.error('Erreur récupération historique directeur:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour vérifier l'accès Stock Vivant d'un directeur
app.get('/api/director/stock-vivant-access', requireAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const userRole = req.session.user.role;
        
        // Si c'est un admin, il a toujours accès
        if (['directeur_general', 'pca', 'admin'].includes(userRole)) {
            return res.json({ hasAccess: true, reason: 'admin' });
        }
        
        // Pour les directeurs, vérifier s'ils ont une permission active
        if (userRole === 'directeur') {
            const result = await pool.query(`
                SELECT 1 
                FROM stock_vivant_permissions svp
                JOIN users u ON svp.user_id = u.id
                WHERE svp.user_id = $1 AND svp.is_active = true AND u.is_active = true
            `, [userId]);
            
            const hasAccess = result.rows.length > 0;
            return res.json({ 
                hasAccess: hasAccess,
                reason: hasAccess ? 'permission_granted' : 'no_permission'
            });
        }
        
        // Autres rôles n'ont pas accès
        res.json({ hasAccess: false, reason: 'role_not_allowed' });
        
    } catch (error) {
        console.error('Erreur lors de la vérification de l\'accès Stock Vivant:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route de crédit avec système de permissions amélioré
app.post('/api/accounts/:id/credit', requireAuth, async (req, res) => {
    try {
        const accountId = req.params.id;
        const { amount, description, credit_date } = req.body;
        const userId = req.session.user.id;
        const userRole = req.session.user.role;
        const finalCreditDate = credit_date || new Date().toISOString().split('T')[0];

        // Vérifier que le compte existe
        const accountResult = await pool.query(
            'SELECT * FROM accounts WHERE id = $1',
            [accountId]
        );

        if (accountResult.rows.length === 0) {
            return res.status(404).json({ error: 'Compte non trouvé' });
        }

        const account = accountResult.rows[0];
        
        // Utiliser la fonction PostgreSQL pour vérifier les permissions
        const permissionCheck = await pool.query(
            'SELECT can_user_credit_account($1, $2) as can_credit',
            [userId, accountId]
        );

        if (!permissionCheck.rows[0].can_credit) {
            return res.status(403).json({ error: 'Vous n\'avez pas la permission de créditer ce compte' });
        }

        await pool.query('BEGIN');

        // Mise à jour du compte selon le type
        if (account.account_type === 'statut') {
            // Pour les comptes statut, écraser le solde existant
            await pool.query(
                'UPDATE accounts SET current_balance = $1, total_credited = $1, total_spent = 0, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
                [parseInt(amount), accountId]
            );
        } else {
            // Pour les autres types, ajouter au solde existant
            await pool.query(
                'UPDATE accounts SET current_balance = current_balance + $1, total_credited = total_credited + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
                [parseInt(amount), accountId]
            );
        }

        // Enregistrer dans l'historique spécial
        await pool.query(
            'INSERT INTO special_credit_history (account_id, credited_by, amount, comment, credit_date, account_type, is_balance_override) VALUES ($1, $2, $3, $4, $5, $6, $7)',
            [accountId, userId, parseInt(amount), description || 'Crédit de compte', finalCreditDate, account.account_type, account.account_type === 'statut']
        );

        await pool.query('COMMIT');

        const message = account.account_type === 'statut' 
            ? 'Compte statut mis à jour avec succès (solde écrasé)' 
            : 'Compte crédité avec succès';
            
        res.json({ message, amount: parseInt(amount), account_type: account.account_type });
    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('Erreur crédit compte:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route de transfert de solde entre comptes
app.post('/api/transfert', requireSuperAdmin, async (req, res) => {
    const { source_id, destination_id, montant, comment } = req.body;
    if (!source_id || !destination_id || !montant || source_id === destination_id) {
        return res.status(400).json({ error: 'Champs invalides' });
    }
    const montantInt = parseInt(montant);
    if (montantInt <= 0) {
        return res.status(400).json({ error: 'Montant invalide' });
    }
    try {
        // Vérifier les comptes
        const accounts = await pool.query('SELECT id, account_type, is_active, current_balance FROM accounts WHERE id = ANY($1)', [[source_id, destination_id]]);
        if (accounts.rows.length !== 2) {
            return res.status(404).json({ error: 'Comptes non trouvés' });
        }
        const source = accounts.rows.find(a => a.id == source_id);
        const dest = accounts.rows.find(a => a.id == destination_id);
        console.log('[Transfert] Début:', { source_id, destination_id, montantInt });
        console.log('[Transfert] Soldes AVANT:', { source: source.current_balance, dest: dest.current_balance });
        const allowedTypes = ['classique', 'Ajustement', 'statut'];
        if (!source.is_active || !dest.is_active || !allowedTypes.includes(source.account_type) || !allowedTypes.includes(dest.account_type)) {
            return res.status(400).json({ error: 'Type ou statut de compte non autorisé' });
        }
        // Vérification du solde pour les transferts selon la configuration
        const financialConfig = getFinancialConfig();
        const validateBalance = financialConfig.validate_expense_balance;
        
        if (validateBalance && source.account_type !== 'statut') {
            console.log('💰 Vérification du solde pour transfert');
            console.log('  - Solde source:', source.current_balance);
            console.log('  - Montant à transférer:', montantInt);
            
            if (source.current_balance < montantInt) {
                console.log('❌ ERREUR 400: Solde insuffisant pour transfert');
                return res.status(400).json({ error: 'Solde insuffisant sur le compte source' });
            }
            
            console.log('✅ Validation du solde pour transfert passée');
        } else {
            console.log('⚠️ Validation des soldes pour transferts désactivée par configuration ou compte statut');
        }
        // Début transaction
        await pool.query('BEGIN');
        // Débiter le compte source
        await pool.query('UPDATE accounts SET current_balance = current_balance - $1, total_spent = total_spent + $1 WHERE id = $2', [montantInt, source_id]);
        // Créditer le compte destination
        await pool.query('UPDATE accounts SET current_balance = current_balance + $1, total_credited = total_credited + $1 WHERE id = $2', [montantInt, destination_id]);
        // Journaliser le transfert - Table créée par render_volaille_database_schema.sql
        // DÉSACTIVÉ: CREATE TABLE transfer_history (évite les timeouts en production)
        
        // DÉSACTIVÉ: Colonne comment déjà présente dans le script SQL
        // await pool.query(`ALTER TABLE transfer_history ADD COLUMN IF NOT EXISTS comment TEXT`);
        
        await pool.query('INSERT INTO transfer_history (source_id, destination_id, montant, comment, transferred_by) VALUES ($1, $2, $3, $4, $5)', [source_id, destination_id, montantInt, comment || null, req.session.user.id]);
        // Vérifier les soldes après
        const sourceAfter = await pool.query('SELECT current_balance FROM accounts WHERE id = $1', [source_id]);
        const destAfter = await pool.query('SELECT current_balance FROM accounts WHERE id = $1', [destination_id]);
        console.log('[Transfert] Soldes APRES:', { source: sourceAfter.rows[0].current_balance, dest: destAfter.rows[0].current_balance });
        await pool.query('COMMIT');
        
        // Déclencher la synchronisation automatique pour les comptes classiques impliqués
        await triggerAutoSyncIfNeeded(source_id, 'transfert sortant');
        await triggerAutoSyncIfNeeded(destination_id, 'transfert entrant');
        
        res.json({ success: true });
    } catch (e) {
        await pool.query('ROLLBACK');
        console.error('Erreur transfert:', e);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});
// Route pour récupérer l'historique des transferts
app.get('/api/transfers', requireAuth, async (req, res) => {
    try {
        const { start_date, end_date } = req.query;
        
        // D'abord vérifier si la table existe et combien de transferts on a
        const countQuery = 'SELECT COUNT(*) as count FROM transfer_history';
        const countResult = await pool.query(countQuery);
        
        if (parseInt(countResult.rows[0].count) === 0) {
            res.json({
                transfers: [],
                period: { start_date: null, end_date: null }
            });
            return;
        }
        
        // Si des dates sont spécifiées, les utiliser, sinon récupérer les 20 derniers transferts
        let query, queryParams = [];
        
        if (start_date && end_date) {
            query = `
                SELECT 
                    th.id,
                    th.montant,
                    th.comment,
                    th.created_at,
                    a_source.account_name as source_account,
                    a_dest.account_name as destination_account,
                    u.full_name as transferred_by
                FROM transfer_history th
                JOIN accounts a_source ON th.source_id = a_source.id
                JOIN accounts a_dest ON th.destination_id = a_dest.id
                JOIN users u ON th.transferred_by = u.id
                WHERE DATE(th.created_at) >= $1 AND DATE(th.created_at) <= $2
                ORDER BY th.created_at DESC
                LIMIT 20
            `;
            queryParams = [start_date, end_date];
        } else {
            query = `
                SELECT 
                    th.id,
                    th.montant,
                    th.comment,
                    th.created_at,
                    a_source.account_name as source_account,
                    a_dest.account_name as destination_account,
                    u.full_name as transferred_by
                FROM transfer_history th
                JOIN accounts a_source ON th.source_id = a_source.id
                JOIN accounts a_dest ON th.destination_id = a_dest.id
                JOIN users u ON th.transferred_by = u.id
                ORDER BY th.created_at DESC
                LIMIT 20
            `;
        }
        
        const result = await pool.query(query, queryParams);
        
        res.json({
            transfers: result.rows,
            period: { start_date: start_date || null, end_date: end_date || null }
        });
    } catch (error) {
        console.error('Erreur récupération transferts:', error);
        res.status(500).json({ error: 'Erreur serveur: ' + error.message });
    }
});

// Route pour récupérer l'historique des transferts d'un compte spécifique
app.get('/api/transfers/account/:accountId', requireAuth, async (req, res) => {
    try {
        const { accountId } = req.params;
        const { start_date, end_date } = req.query;
        
        // Vérifier que le compte existe
        const accountCheck = await pool.query('SELECT id, account_name FROM accounts WHERE id = $1', [accountId]);
        if (accountCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Compte non trouvé' });
        }
        
        const accountName = accountCheck.rows[0].account_name;
        
        // Construire la requête pour récupérer tous les transferts impliquant ce compte
        let query, queryParams = [];
        
        if (start_date && end_date) {
            query = `
                SELECT 
                    th.id,
                    th.montant,
                    th.comment,
                    th.created_at,
                    a_source.account_name as source_account,
                    a_dest.account_name as destination_account,
                    u.full_name as transferred_by,
                    CASE 
                        WHEN th.source_id = $1 THEN 'SORTANT'
                        WHEN th.destination_id = $1 THEN 'ENTRANT'
                    END as transfer_type
                FROM transfer_history th
                JOIN accounts a_source ON th.source_id = a_source.id
                JOIN accounts a_dest ON th.destination_id = a_dest.id
                JOIN users u ON th.transferred_by = u.id
                WHERE (th.source_id = $1 OR th.destination_id = $1)
                AND DATE(th.created_at) >= $2 AND DATE(th.created_at) <= $3
                ORDER BY th.created_at DESC
                LIMIT 50
            `;
            queryParams = [accountId, start_date, end_date];
        } else {
            query = `
                SELECT 
                    th.id,
                    th.montant,
                    th.comment,
                    th.created_at,
                    a_source.account_name as source_account,
                    a_dest.account_name as destination_account,
                    u.full_name as transferred_by,
                    CASE 
                        WHEN th.source_id = $1 THEN 'SORTANT'
                        WHEN th.destination_id = $1 THEN 'ENTRANT'
                    END as transfer_type
                FROM transfer_history th
                JOIN accounts a_source ON th.source_id = a_source.id
                JOIN accounts a_dest ON th.destination_id = a_dest.id
                JOIN users u ON th.transferred_by = u.id
                WHERE (th.source_id = $1 OR th.destination_id = $1)
                ORDER BY th.created_at DESC
                LIMIT 50
            `;
            queryParams = [accountId];
        }
        
        const result = await pool.query(query, queryParams);
        
        res.json({
            transfers: result.rows,
            account_name: accountName,
            period: { start_date: start_date || null, end_date: end_date || null }
        });
    } catch (error) {
        console.error('Erreur récupération transferts du compte:', error);
        res.status(500).json({ error: 'Erreur serveur: ' + error.message });
    }
});

// Route pour supprimer un transfert (DG/PCA/Admin uniquement)
app.delete('/api/transfers/:transferId', requireSuperAdmin, async (req, res) => {
    try {
        const { transferId } = req.params;
        
        // Vérifier que le transfert existe et récupérer ses détails
        const transferCheck = await pool.query(`
            SELECT 
                th.id,
                th.montant,
                th.source_id,
                th.destination_id,
                a_source.account_name as source_account,
                a_dest.account_name as destination_account,
                th.created_at
            FROM transfer_history th
            JOIN accounts a_source ON th.source_id = a_source.id
            JOIN accounts a_dest ON th.destination_id = a_dest.id
            WHERE th.id = $1
        `, [transferId]);
        
        if (transferCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Transfert non trouvé' });
        }
        
        const transfer = transferCheck.rows[0];
        
        // Vérifier que les comptes existent toujours
        const accountsCheck = await pool.query('SELECT id, current_balance FROM accounts WHERE id = ANY($1)', [[transfer.source_id, transfer.destination_id]]);
        if (accountsCheck.rows.length !== 2) {
            return res.status(400).json({ error: 'Un ou plusieurs comptes du transfert n\'existent plus' });
        }
        
        const sourceAccount = accountsCheck.rows.find(a => a.id == transfer.source_id);
        const destAccount = accountsCheck.rows.find(a => a.id == transfer.destination_id);
        
        // Vérifier que le compte destination a suffisamment de solde pour que l'argent en soit retiré
        if (destAccount.current_balance < transfer.montant) {
            return res.status(400).json({ 
                error: `Solde insuffisant sur le compte destination (${destAccount.current_balance} FCFA) pour annuler le transfert de ${transfer.montant} FCFA` 
            });
        }
        
        // Début transaction
        await pool.query('BEGIN');
        
        try {
            // Annuler le transfert : rembourser le compte source et débiter le compte destination
            await pool.query('UPDATE accounts SET current_balance = current_balance + $1, total_spent = total_spent - $1 WHERE id = $2', [transfer.montant, transfer.source_id]);
            await pool.query('UPDATE accounts SET current_balance = current_balance - $1, total_credited = total_credited - $1 WHERE id = $2', [transfer.montant, transfer.destination_id]);
            
            // Supprimer le transfert de l'historique
            await pool.query('DELETE FROM transfer_history WHERE id = $1', [transferId]);
            
            // Vérifier les soldes après annulation
            const sourceAfter = await pool.query('SELECT current_balance FROM accounts WHERE id = $1', [transfer.source_id]);
            const destAfter = await pool.query('SELECT current_balance FROM accounts WHERE id = $1', [transfer.destination_id]);
            
            console.log('[Suppression Transfert] Transfert supprimé:', {
                id: transferId,
                montant: transfer.montant,
                source: transfer.source_account,
                destination: transfer.destination_account,
                soldes_apres: {
                    source: sourceAfter.rows[0].current_balance,
                    destination: destAfter.rows[0].current_balance
                },
                supprime_par: req.session.user.username
            });
            
            await pool.query('COMMIT');
            
            // Déclencher la synchronisation automatique pour les comptes classiques impliqués
            await triggerAutoSyncIfNeeded(transfer.source_id, 'annulation transfert (remboursement)');
            await triggerAutoSyncIfNeeded(transfer.destination_id, 'annulation transfert (débit)');
            
            res.json({ 
                success: true,
                message: `Transfert de ${transfer.montant.toLocaleString('fr-FR')} FCFA supprimé avec succès`,
                transfer_details: {
                    montant: transfer.montant,
                    source_account: transfer.source_account,
                    destination_account: transfer.destination_account,
                    date: transfer.created_at
                }
            });
            
        } catch (error) {
            await pool.query('ROLLBACK');
            throw error;
        }
        
    } catch (error) {
        console.error('Erreur suppression transfert:', error);
        res.status(500).json({ error: 'Erreur serveur: ' + error.message });
    }
});

// =====================================================
// STOCK VIVANT ROUTES
// =====================================================

// Middleware pour vérifier les permissions stock vivant (similaire au système de crédit)
const requireStockVivantAuth = async (req, res, next) => {
    try {
        console.log('🔐 STOCK VIVANT: requireStockVivantAuth appelé pour:', req.method, req.path);
        
        if (!req.session.user) {
            console.log('❌ STOCK VIVANT: Pas de session utilisateur');
            return res.status(401).json({ error: 'Non autorisé' });
        }

        const userId = req.session.user.id;
        const userRole = req.session.user.role;
        const userName = req.session.user.username;
        console.log('👤 STOCK VIVANT: Utilisateur:', userName, 'Role:', userRole, 'ID:', userId);
        
        // Si c'est un admin, il a toujours accès
        if (['directeur_general', 'pca', 'admin'].includes(userRole)) {
            console.log('✅ STOCK VIVANT: Accès autorisé pour admin:', userName);
            return next();
        }
        
        // Pour les directeurs, vérifier s'ils ont une permission active
        if (userRole === 'directeur') {
            console.log('🔍 STOCK VIVANT: Vérification permissions directeur pour:', userName);
            const permissionCheck = await pool.query(`
                SELECT 1 
                FROM stock_vivant_permissions svp
                JOIN users u ON svp.user_id = u.id
                WHERE svp.user_id = $1 AND svp.is_active = true AND u.is_active = true
            `, [userId]);
            
            const hasPermission = permissionCheck.rows.length > 0;
            console.log('🔍 STOCK VIVANT: Directeur a permission:', hasPermission);
            
            if (hasPermission) {
                console.log('✅ STOCK VIVANT: Accès autorisé pour directeur avec permission:', userName);
                return next();
            } else {
                console.log('❌ STOCK VIVANT: Directeur sans permission:', userName);
                return res.status(403).json({ error: 'Accès refusé - Vous n\'avez pas la permission d\'accéder au stock vivant' });
            }
        }
        
        // Autres rôles n'ont pas accès
        console.log('❌ STOCK VIVANT: Accès refusé pour role:', userRole);
        return res.status(403).json({ error: 'Accès refusé - Rôle non autorisé pour le stock vivant' });
        
    } catch (error) {
        console.error('❌ STOCK VIVANT: Erreur vérification permissions:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
};

// Route pour récupérer la configuration des catégories de stock vivant
app.get('/api/stock-vivant/config', requireStockVivantAuth, (req, res) => {
    try {
        const config = require('./stock_vivant_config.json');
        res.json(config);
    } catch (error) {
        console.error('❌ STOCK VIVANT: Erreur chargement config:', error);
        res.status(500).json({ error: 'Configuration non disponible' });
    }
});

// Route pour mettre à jour la configuration (DG uniquement)
app.put('/api/stock-vivant/config', requireSuperAdmin, (req, res) => {
    try {
        const fs = require('fs');
        const newConfig = req.body;
        
        // Valider la structure de base
        if (!newConfig.categories || !newConfig.labels) {
            return res.status(400).json({ error: 'Structure de configuration invalide' });
        }

        // Sauvegarder la nouvelle configuration
        fs.writeFileSync('./stock_vivant_config.json', JSON.stringify(newConfig, null, 2));
        
        res.json({ message: 'Configuration mise à jour avec succès' });
    } catch (error) {
        console.error('Erreur mise à jour config stock vivant:', error);
        res.status(500).json({ error: 'Erreur lors de la mise à jour' });
    }
});

// Route pour récupérer les données de stock vivant
app.get('/api/stock-vivant', requireStockVivantAuth, async (req, res) => {
    try {
        const { date, categorie } = req.query;
        
        let query = 'SELECT * FROM stock_vivant';
        let params = [];
        let conditions = [];
        
        if (date) {
            conditions.push('date_stock = $' + (params.length + 1));
            params.push(date);
        }
        
        if (categorie) {
            conditions.push('categorie = $' + (params.length + 1));
            params.push(categorie);
        }
        
        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }
        
        query += ' ORDER BY date_stock DESC, categorie, produit';
        
        const result = await pool.query(query, params);
        
        // Nettoyer l'encodage et retourner les données
        const cleanedData = cleanEncoding(result.rows);
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.json(cleanedData);
    } catch (error) {
        console.error('Erreur récupération stock vivant:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour récupérer les dates disponibles
app.get('/api/stock-vivant/dates', requireStockVivantAuth, async (req, res) => {
    try {
        console.log('📅 SERVER: Récupération dates stock vivant pour:', req.session.user.username);
        const result = await pool.query(
            "SELECT DISTINCT TO_CHAR(date_stock, 'YYYY-MM-DD') as date FROM stock_vivant ORDER BY date DESC"
        );
        console.log('📅 SERVER: Dates trouvées:', result.rows.length);
        console.log('📅 SERVER: Dates détails:', result.rows);
        res.json(result.rows);
    } catch (error) {
        console.error('❌ SERVER: Erreur récupération dates stock vivant:', error);
        console.error('❌ SERVER: Stack trace dates:', error.stack);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour ajouter/modifier des données de stock vivant
app.post('/api/stock-vivant/update', requireStockVivantAuth, async (req, res) => {
    try {
        const { date_stock, stockData, replace_existing } = req.body;
        
        if (!date_stock || !stockData || !Array.isArray(stockData)) {
            return res.status(400).json({ error: 'Données invalides' });
        }

        // Vérifier s'il y a des données existantes pour cette date
        const existingCheck = await pool.query(
            'SELECT COUNT(*) as count FROM stock_vivant WHERE date_stock = $1',
            [date_stock]
        );

        const hasExistingData = parseInt(existingCheck.rows[0].count) > 0;

        // Si des données existent et qu'on ne force pas le remplacement, demander confirmation
        if (hasExistingData && !replace_existing) {
            return res.status(409).json({ 
                error: 'duplicate_data',
                message: 'Des données existent déjà pour cette date',
                date: date_stock,
                existingCount: existingCheck.rows[0].count
            });
        }

        await pool.query('BEGIN');

        // Si on remplace, supprimer les données existantes
        if (replace_existing && hasExistingData) {
            await pool.query('DELETE FROM stock_vivant WHERE date_stock = $1', [date_stock]);
        }

        let processedCount = 0;

        // Traiter chaque entrée de stock
        for (const item of stockData) {
            const { categorie, produit, quantite, prix_unitaire, decote, commentaire } = item;
            
            if (!categorie || !produit || quantite === undefined || prix_unitaire === undefined) {
                continue; // Ignorer les entrées incomplètes
            }

            const decoteValue = parseFloat(decote) || 0.20; // Décote par défaut de 20%
            const total = (parseFloat(quantite) || 0) * (parseFloat(prix_unitaire) || 0) * (1 - decoteValue);

            await pool.query(`
                INSERT INTO stock_vivant (date_stock, categorie, produit, quantite, prix_unitaire, decote, total, commentaire)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ON CONFLICT (date_stock, categorie, produit)
                DO UPDATE SET 
                    quantite = EXCLUDED.quantite,
                    prix_unitaire = EXCLUDED.prix_unitaire,
                    decote = EXCLUDED.decote,
                    total = EXCLUDED.total,
                    commentaire = EXCLUDED.commentaire,
                    updated_at = CURRENT_TIMESTAMP
            `, [date_stock, categorie, produit, quantite, prix_unitaire, decoteValue, total, commentaire || '']);

            processedCount++;
        }

        await pool.query('COMMIT');

        res.json({
            message: `Stock vivant mis à jour avec succès`,
            date: date_stock,
            processedCount,
            replaced: hasExistingData && replace_existing
        });

    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('Erreur mise à jour stock vivant:', error);
        res.status(500).json({ error: 'Erreur lors de la mise à jour' });
    }
});

// Route pour copier le stock d'une date précédente
app.post('/api/stock-vivant/copy-from-date', requireStockVivantAuth, async (req, res) => {
    try {
        const { source_date, target_date } = req.body;
        
        if (!source_date || !target_date) {
            return res.status(400).json({ error: 'Dates source et cible requises' });
        }

        // Vérifier qu'il y a des données à copier
        const sourceData = await pool.query(
            'SELECT * FROM stock_vivant WHERE date_stock = $1',
            [source_date]
        );

        if (sourceData.rows.length === 0) {
            return res.status(404).json({ error: 'Aucune donnée trouvée pour la date source' });
        }

        // Vérifier s'il y a déjà des données pour la date cible
        const targetCheck = await pool.query(
            'SELECT COUNT(*) as count FROM stock_vivant WHERE date_stock = $1',
            [target_date]
        );

        if (parseInt(targetCheck.rows[0].count) > 0) {
            return res.status(409).json({ 
                error: 'target_has_data',
                message: 'Des données existent déjà pour la date cible'
            });
        }

        await pool.query('BEGIN');

        // Copier les données
        await pool.query(`
            INSERT INTO stock_vivant (date_stock, categorie, produit, quantite, prix_unitaire, total, commentaire)
            SELECT $1, categorie, produit, quantite, prix_unitaire, total, commentaire
            FROM stock_vivant 
            WHERE date_stock = $2
        `, [target_date, source_date]);

        const copiedCount = sourceData.rows.length;

        await pool.query('COMMIT');

        res.json({
            message: `${copiedCount} entrées copiées avec succès`,
            source_date,
            target_date,
            copiedCount
        });

    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('Erreur copie stock vivant:', error);
        res.status(500).json({ error: 'Erreur lors de la copie' });
    }
});

// Route pour supprimer une entrée spécifique
app.delete('/api/stock-vivant/:id', requireStockVivantAuth, async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await pool.query('DELETE FROM stock_vivant WHERE id = $1 RETURNING *', [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Entrée non trouvée' });
        }

        res.json({ message: 'Entrée supprimée avec succès', deleted: result.rows[0] });
    } catch (error) {
        console.error('Erreur suppression stock vivant:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Routes pour la gestion des permissions (DG uniquement)
app.get('/api/stock-vivant/permissions', requireSuperAdmin, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                svp.id,
                svp.user_id,
                svp.is_active,
                svp.granted_at,
                u.username,
                u.full_name,
                ug.full_name as granted_by_name
            FROM stock_vivant_permissions svp
            JOIN users u ON svp.user_id = u.id
            LEFT JOIN users ug ON svp.granted_by = ug.id
            WHERE u.role = 'directeur' AND svp.is_active = true
            ORDER BY u.full_name
        `);
        
        res.json(result.rows);
    } catch (error) {
        console.error('Erreur récupération permissions stock vivant:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.post('/api/stock-vivant/permissions', requireSuperAdmin, async (req, res) => {
    try {
        const { user_id } = req.body;
        const granted_by = req.session.user.id;

        // Vérifier que l'utilisateur est un directeur
        const userCheck = await pool.query(
            'SELECT * FROM users WHERE id = $1 AND role = $2',
            [user_id, 'directeur']
        );

        if (userCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Directeur non trouvé' });
        }

        // Ajouter ou activer la permission
        await pool.query(`
            INSERT INTO stock_vivant_permissions (user_id, granted_by, is_active)
            VALUES ($1, $2, true)
            ON CONFLICT (user_id) 
            DO UPDATE SET is_active = true, granted_by = $2, granted_at = CURRENT_TIMESTAMP
        `, [user_id, granted_by]);

        res.json({ message: 'Permission accordée avec succès' });
    } catch (error) {
        console.error('Erreur ajout permission stock vivant:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.delete('/api/stock-vivant/permissions/:userId', requireSuperAdmin, async (req, res) => {
    try {
        const { userId } = req.params;
        
        const result = await pool.query(
            'UPDATE stock_vivant_permissions SET is_active = false WHERE user_id = $1 RETURNING *',
            [userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Permission non trouvée' });
        }

        res.json({ message: 'Permission révoquée avec succès' });
    } catch (error) {
        console.error('Erreur révocation permission stock vivant:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour obtenir les directeurs disponibles pour les permissions
app.get('/api/stock-vivant/available-directors', requireSuperAdmin, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                u.id,
                u.username,
                u.full_name,
                CASE 
                    WHEN svp.is_active = true THEN true 
                    ELSE false 
                END as has_permission
            FROM users u
            LEFT JOIN stock_vivant_permissions svp ON u.id = svp.user_id AND svp.is_active = true
            WHERE u.role = 'directeur' AND u.is_active = true
            ORDER BY u.full_name
        `);
        
        res.json(result.rows);
    } catch (error) {
        console.error('Erreur récupération directeurs disponibles:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour récupérer le total général du stock vivant
app.get('/api/stock-vivant/total', requireAuth, async (req, res) => {
    try {
        // Récupérer la dernière date disponible
        const latestDateQuery = `
            SELECT MAX(date_stock) as latest_date 
            FROM stock_vivant 
            WHERE date_stock IS NOT NULL
        `;
        const latestDateResult = await pool.query(latestDateQuery);
        
        if (!latestDateResult.rows[0].latest_date) {
            return res.json({
                totalStock: 0,
                formattedDate: null,
                message: 'Aucune donnée de stock vivant disponible'
            });
        }
        
        const latestDate = latestDateResult.rows[0].latest_date;
        
        // Calculer la somme totale pour la dernière date
        const totalQuery = `
            SELECT SUM(quantite * prix_unitaire * (1 - decote)) as total_stock
            FROM stock_vivant
            WHERE date_stock = $1
        `;
        const totalResult = await pool.query(totalQuery, [latestDate]);
        
        const totalStock = Math.round(totalResult.rows[0].total_stock || 0);
        const formattedDate = latestDate.toLocaleDateString('fr-FR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        
        res.json({
            totalStock,
            formattedDate,
            message: 'Total stock vivant récupéré avec succès'
        });
        
    } catch (error) {
        console.error('Erreur récupération total stock vivant:', error);
        res.status(500).json({ error: 'Erreur lors de la récupération du total stock vivant' });
    }
});

// Route pour récupérer le total général du stock vivant avec cutoff_date
app.get('/api/dashboard/stock-vivant-total', requireAuth, async (req, res) => {
    try {
        const { cutoff_date } = req.query;
        
        console.log(`🌱 SERVER: Récupération stock vivant total avec cutoff_date: ${cutoff_date}`);
        
        let stockQuery, stockParams, latestDate;
        
        if (cutoff_date && /^\d{4}-\d{2}-\d{2}$/.test(cutoff_date)) {
            // Récupérer le stock <= à la cutoff_date (le plus proche)
            const latestDateQuery = `
                SELECT MAX(date_stock) as latest_date 
                FROM stock_vivant 
                WHERE date_stock IS NOT NULL 
                AND date_stock <= $1::date
            `;
            const latestDateResult = await pool.query(latestDateQuery, [cutoff_date]);
            latestDate = latestDateResult.rows[0]?.latest_date;
            
            if (!latestDate) {
                console.log(`🌱 SERVER: Aucune donnée stock vivant trouvée <= ${cutoff_date}`);
                return res.json({
                    totalStock: 0,
                    formatted: '0 FCFA',
                    latest_date: null,
                    cutoff_date: cutoff_date,
                    message: `Aucune donnée de stock vivant trouvée <= ${cutoff_date}`
                });
            }
            
            stockQuery = `
                SELECT SUM(quantite * prix_unitaire * (1 - decote)) as total_stock
                FROM stock_vivant
                WHERE date_stock = $1
            `;
            stockParams = [latestDate];
            console.log(`🌱 SERVER: Utilisation de la date ${latestDate} (≤ ${cutoff_date})`);
        } else {
            // Récupérer la dernière date disponible
            const latestDateQuery = `
                SELECT MAX(date_stock) as latest_date 
                FROM stock_vivant 
                WHERE date_stock IS NOT NULL
            `;
            const latestDateResult = await pool.query(latestDateQuery);
            latestDate = latestDateResult.rows[0]?.latest_date;
            
            if (!latestDate) {
                return res.json({
                    totalStock: 0,
                    formatted: '0 FCFA',
                    latest_date: null,
                    message: 'Aucune donnée de stock vivant disponible'
                });
            }
            
            stockQuery = `
                SELECT SUM(quantite * prix_unitaire * (1 - decote)) as total_stock
                FROM stock_vivant
                WHERE date_stock = $1
            `;
            stockParams = [latestDate];
            console.log(`🌱 SERVER: Utilisation de la dernière date disponible: ${latestDate}`);
        }
        
        // Calculer la somme totale
        const totalResult = await pool.query(stockQuery, stockParams);
        const totalStock = Math.round(totalResult.rows[0]?.total_stock || 0);
        
        const formattedDate = latestDate.toLocaleDateString('fr-FR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        
        console.log(`🌱 SERVER RÉSULTAT: Stock vivant total = ${totalStock} FCFA (date: ${latestDate})`);
        
        res.json({
            totalStock,
            formatted: `${totalStock.toLocaleString()} FCFA`,
            latest_date: formattedDate,
            cutoff_date: cutoff_date || null,
            message: 'Total stock vivant récupéré avec succès'
        });
        
    } catch (error) {
        console.error('Erreur récupération total stock vivant avec cutoff:', error);
        res.status(500).json({ error: 'Erreur lors de la récupération du total stock vivant' });
    }
});
// Route pour récupérer l'écart de stock vivant mensuel
app.get('/api/stock-vivant/monthly-variation', requireAuth, async (req, res) => {
    try {
        // Obtenir la date actuelle et le mois précédent
        const currentDate = new Date();
        const currentYear = currentDate.getFullYear();
        const currentMonth = currentDate.getMonth() + 1; // JavaScript months are 0-indexed
        
        // Calculer le mois précédent
        let previousYear = currentYear;
        let previousMonth = currentMonth - 1;
        if (previousMonth === 0) {
            previousMonth = 12;
            previousYear = currentYear - 1;
        }
        
        // Récupérer le dernier stock du mois actuel
        const currentStockQuery = `
            SELECT SUM(quantite * prix_unitaire * (1 - decote)) as total_stock
            FROM stock_vivant
            WHERE date_stock = (
                SELECT MAX(date_stock) 
                FROM stock_vivant 
                WHERE date_stock >= $1::date 
                AND date_stock < ($1::date + INTERVAL '1 month')
            )
        `;
        const currentStockResult = await pool.query(currentStockQuery, [`${currentYear}-${currentMonth.toString().padStart(2, '0')}-01`]);
        
        // Récupérer le dernier stock du mois précédent
        const previousStockQuery = `
            SELECT SUM(quantite * prix_unitaire * (1 - decote)) as total_stock
            FROM stock_vivant
            WHERE date_stock = (
                SELECT MAX(date_stock) 
                FROM stock_vivant 
                WHERE date_stock >= $1::date 
                AND date_stock < ($1::date + INTERVAL '1 month')
            )
        `;
        const previousStockResult = await pool.query(previousStockQuery, [`${previousYear}-${previousMonth.toString().padStart(2, '0')}-01`]);
        
        const currentStock = Math.round(currentStockResult.rows[0]?.total_stock || 0);
        const previousStock = Math.round(previousStockResult.rows[0]?.total_stock || 0);
        
        // Si pas de données pour le mois précédent, utiliser le stock du mois actuel
        const referenceStock = previousStock > 0 ? previousStock : currentStock;
        const variation = currentStock - referenceStock;
        
        // Générer l'information de période
        const months = [
            'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
            'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
        ];
        
        let periodInfo;
        if (previousStock > 0) {
            periodInfo = `${months[currentMonth - 1]} vs ${months[previousMonth - 1]}`;
        } else {
            periodInfo = `${months[currentMonth - 1]} (pas de données mois précédent)`;
        }
        
        res.json({
            variation,
            currentStock,
            previousStock: referenceStock,
            periodInfo,
            currentMonth: `${currentYear}-${currentMonth.toString().padStart(2, '0')}`,
            previousMonth: `${previousYear}-${previousMonth.toString().padStart(2, '0')}`
        });
        
    } catch (error) {
        console.error('Erreur calcul écart stock vivant mensuel:', error);
        res.status(500).json({ error: 'Erreur lors du calcul de l\'écart mensuel' });
    }
});

// ===== GESTION MONTANT DEBUT DE MOIS =====

// Route pour récupérer les portefeuilles classiques avec leurs montants de début de mois
app.get('/api/montant-debut-mois/:year/:month', requireAdminAuth, async (req, res) => {
    try {
        const { year, month } = req.params;
        
        console.log(`[MONTANT_DEBUT] Récupération pour ${year}-${month}`);
        
        // Récupérer tous les portefeuilles classiques avec leurs montants de début de mois
                const query = `
            SELECT
                a.id as account_id,
                a.account_name,
                u.full_name as owner_name,
                u.username as owner_username,
                COALESCE(mdm.montant, 0) as montant_debut_mois,
                mdm.updated_at as last_modified,
                mdm.created_by,
                creator.full_name as created_by_name
            FROM accounts a
            LEFT JOIN users u ON a.user_id = u.id
            LEFT JOIN montant_debut_mois mdm ON a.id = mdm.account_id
                AND mdm.year = $1::integer AND mdm.month = $2::integer
            LEFT JOIN users creator ON mdm.created_by = creator.username
            WHERE COALESCE(a.account_type, 'classique') = 'classique'
                AND a.is_active = true
            ORDER BY a.account_name
        `;
        
        const result = await pool.query(query, [parseInt(year), parseInt(month)]);
        
        console.log(`[MONTANT_DEBUT] Trouvé ${result.rows.length} portefeuilles classiques`);
        
        res.json({
            success: true,
            data: result.rows,
            period: { year: parseInt(year), month: parseInt(month) }
        });
        
    } catch (error) {
        console.error('[MONTANT_DEBUT] Erreur lors de la récupération:', error);
        res.status(500).json({ error: 'Erreur lors de la récupération des données' });
    }
});

// Route pour sauvegarder/mettre à jour les montants de début de mois
app.post('/api/montant-debut-mois', requireAdminAuth, async (req, res) => {
    try {
        const { year, month, montants } = req.body;
        const createdBy = req.session.user.id;
        
        console.log(`[MONTANT_DEBUT] Sauvegarde pour ${year}-${month}, ${montants.length} portefeuilles`);
        
        if (!year || !month || !Array.isArray(montants)) {
            return res.status(400).json({ error: 'Paramètres invalides' });
        }
        
        if (month < 1 || month > 12) {
            return res.status(400).json({ error: 'Mois invalide (1-12)' });
        }
        
        await pool.query('BEGIN');
        
        let updatedCount = 0;
        let createdCount = 0;
        
        for (const montantData of montants) {
            const { account_id, montant } = montantData;
            
            if (!account_id || montant === undefined || montant === null) {
                continue; // Ignorer les entrées invalides
            }
            
            // Vérifier que le compte existe et est de type classique
            const accountCheck = await pool.query(
                'SELECT id FROM accounts WHERE id = $1 AND account_type = $2 AND is_active = true',
                [account_id, 'classique']
            );
            
            if (accountCheck.rows.length === 0) {
                console.log(`[MONTANT_DEBUT] Compte ${account_id} non trouvé ou non classique`);
                continue;
            }
            
            // Insérer ou mettre à jour le montant
            const upsertResult = await pool.query(`
                INSERT INTO montant_debut_mois (account_id, year, month, montant, created_by, updated_at)
                VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
                ON CONFLICT (account_id, year, month) 
                DO UPDATE SET 
                    montant = EXCLUDED.montant,
                    created_by = EXCLUDED.created_by,
                    updated_at = CURRENT_TIMESTAMP
                RETURNING (xmax = 0) AS inserted
            `, [account_id, year, month, parseInt(montant), createdBy]);
            
            if (upsertResult.rows[0].inserted) {
                createdCount++;
            } else {
                updatedCount++;
            }
        }
        
        await pool.query('COMMIT');
        
        console.log(`[MONTANT_DEBUT] Sauvegarde réussie: ${createdCount} créés, ${updatedCount} mis à jour`);
        
        res.json({
            success: true,
            message: `Montants sauvegardés avec succès (${createdCount} créés, ${updatedCount} mis à jour)`,
            statistics: {
                created: createdCount,
                updated: updatedCount,
                total: createdCount + updatedCount
            }
        });
        
    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('[MONTANT_DEBUT] Erreur lors de la sauvegarde:', error);
        res.status(500).json({ error: 'Erreur lors de la sauvegarde des données' });
    }
});

// Route pour obtenir les statistiques des montants de début de mois
app.get('/api/montant-debut-mois/stats/:year/:month', requireAdminAuth, async (req, res) => {
    try {
        const { year, month } = req.params;
        
        const statsQuery = `
            SELECT 
                COUNT(mdm.id) as portefeuilles_configures,
                COALESCE(SUM(mdm.montant), 0) as total_montants,
                COUNT(CASE WHEN mdm.montant > 0 THEN 1 END) as montants_positifs,
                COUNT(CASE WHEN mdm.montant < 0 THEN 1 END) as montants_negatifs,
                COUNT(CASE WHEN mdm.montant = 0 THEN 1 END) as montants_zero,
                (SELECT COUNT(*) FROM accounts WHERE account_type = 'classique' AND is_active = true) as total_portefeuilles_classiques
            FROM montant_debut_mois mdm
            WHERE mdm.year = $1 AND mdm.month = $2
        `;
        
        const result = await pool.query(statsQuery, [parseInt(year), parseInt(month)]);
        const stats = result.rows[0];
        
        res.json({
            success: true,
            stats: {
                portefeuilles_configures: parseInt(stats.portefeuilles_configures),
                total_portefeuilles_classiques: parseInt(stats.total_portefeuilles_classiques),
                total_montants: parseInt(stats.total_montants),
                montants_positifs: parseInt(stats.montants_positifs),
                montants_negatifs: parseInt(stats.montants_negatifs),
                montants_zero: parseInt(stats.montants_zero)
            },
            period: { year: parseInt(year), month: parseInt(month) }
        });
        
    } catch (error) {
        console.error('[MONTANT_DEBUT] Erreur lors du calcul des statistiques:', error);
        res.status(500).json({ error: 'Erreur lors du calcul des statistiques' });
    }
});

// ===== GESTION DES COMPTES CREANCE =====

// Créer les tables pour les créances si elles n'existent pas
async function createCreanceTablesIfNotExists() {
    // FONCTION DÉSACTIVÉE: Tables créées par render_volaille_database_schema.sql
    console.log('ℹ️ Creance tables creation SKIPPED - tables already exist from SQL script');
    return; // Pas de création de tables
}

// DÉSACTIVÉ: Les tables sont créées par render_volaille_database_schema.sql
// createCreanceTablesIfNotExists();
console.log('ℹ️ Automatic table creation disabled: creance tables managed by SQL script');

// DÉSACTIVÉ: Les tables sont créées par render_volaille_database_schema.sql  
// createDashboardSnapshotsTable();
console.log('ℹ️ Automatic table creation disabled: dashboard_snapshots managed by SQL script');

// Route pour obtenir les comptes créance accessibles à l'utilisateur
app.get('/api/creance/accounts', requireAuth, async (req, res) => {
    try {
        const userRole = req.session.user.role;
        const userId = req.session.user.id;

        let query;
        let params = [];

        if (userRole === 'directeur_general' || userRole === 'pca' || userRole === 'admin') {
            // Admin peut voir tous les comptes créance
            query = `
                SELECT a.*, u.full_name as assigned_director_name 
                FROM accounts a 
                LEFT JOIN users u ON a.user_id = u.id 
                WHERE a.account_type = 'creance' AND a.is_active = true 
                ORDER BY a.account_name
            `;
        } else if (userRole === 'directeur') {
            // Directeur ne peut voir que ses comptes assignés
            query = `
                SELECT a.*, u.full_name as assigned_director_name 
                FROM accounts a 
                LEFT JOIN users u ON a.user_id = u.id 
                WHERE a.account_type = 'creance' AND a.is_active = true AND a.user_id = $1 
                ORDER BY a.account_name
            `;
            params = [userId];
        } else {
            return res.status(403).json({ error: 'Accès non autorisé' });
        }

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error('Erreur récupération comptes créance:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour obtenir les clients d'un compte créance
app.get('/api/creance/:accountId/clients', requireAuth, async (req, res) => {
    try {
        const { accountId } = req.params;
        const userRole = req.session.user.role;
        const userId = req.session.user.id;

        // Vérifier l'accès au compte
        const accountResult = await pool.query(
            'SELECT * FROM accounts WHERE id = $1 AND account_type = $2 AND is_active = true',
            [accountId, 'creance']
        );

        if (accountResult.rows.length === 0) {
            return res.status(404).json({ error: 'Compte créance non trouvé' });
        }

        const account = accountResult.rows[0];

        // Vérifier les permissions
        if (userRole === 'directeur' && account.user_id !== userId) {
            return res.status(403).json({ error: 'Accès non autorisé à ce compte' });
        }

        const result = await pool.query(`
            SELECT cc.*, 
                   COALESCE(SUM(CASE WHEN co.operation_type = 'credit' THEN co.amount ELSE 0 END), 0) as total_credits,
                   COALESCE(SUM(CASE WHEN co.operation_type = 'debit' THEN co.amount ELSE 0 END), 0) as total_debits,
                   (cc.initial_credit + COALESCE(SUM(CASE WHEN co.operation_type = 'credit' THEN co.amount ELSE 0 END), 0) - COALESCE(SUM(CASE WHEN co.operation_type = 'debit' THEN co.amount ELSE 0 END), 0)) as balance
            FROM creance_clients cc
            LEFT JOIN creance_operations co ON cc.id = co.client_id
            WHERE cc.account_id = $1 AND cc.is_active = true
            GROUP BY cc.id
            ORDER BY cc.client_name
        `, [accountId]);

        res.json(result.rows);
    } catch (error) {
        console.error('Erreur récupération clients créance:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour ajouter un client à un compte créance (Admin seulement)
app.post('/api/creance/:accountId/clients', requireAdminAuth, async (req, res) => {
    try {
        const { accountId } = req.params;
        const { client_name, client_phone, client_address, initial_credit } = req.body;
        const created_by = req.session.user.id;

        // Vérifier que le compte existe et est de type créance
        const accountResult = await pool.query(
            'SELECT * FROM accounts WHERE id = $1 AND account_type = $2 AND is_active = true',
            [accountId, 'creance']
        );

        if (accountResult.rows.length === 0) {
            return res.status(404).json({ error: 'Compte créance non trouvé' });
        }

        // Vérifier qu'aucun client ACTIF avec ce nom n'existe déjà pour ce compte
        const existingClientResult = await pool.query(
            'SELECT id FROM creance_clients WHERE account_id = $1 AND client_name = $2 AND is_active = true',
            [accountId, client_name]
        );

        if (existingClientResult.rows.length > 0) {
            return res.status(400).json({ error: 'Un client avec ce nom existe déjà pour ce compte' });
        }

        const result = await pool.query(`
            INSERT INTO creance_clients (account_id, client_name, client_phone, client_address, initial_credit, created_by)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
        `, [accountId, client_name, client_phone || null, client_address || null, parseInt(initial_credit) || 0, created_by]);

        res.json({ 
            message: 'Client ajouté avec succès', 
            client: result.rows[0] 
        });
    } catch (error) {
        console.error('Erreur ajout client créance:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

    // Route pour ajouter une opération créance (avance/remboursement)
app.post('/api/creance/:accountId/operations', requireAuth, async (req, res) => {
    try {
        const { accountId } = req.params;
        const { client_id, operation_type, amount, operation_date, description } = req.body;
        const created_by = req.session.user.id;
        const userRole = req.session.user.role;

        // Vérifier que le compte existe et est de type créance
        const accountResult = await pool.query(
            'SELECT * FROM accounts WHERE id = $1 AND account_type = $2 AND is_active = true',
            [accountId, 'creance']
        );

        if (accountResult.rows.length === 0) {
            return res.status(404).json({ error: 'Compte créance non trouvé' });
        }

        const account = accountResult.rows[0];

        // Vérifier les permissions
        if (userRole === 'directeur' && account.user_id !== created_by) {
            return res.status(403).json({ error: 'Vous n\'êtes pas autorisé à effectuer des opérations sur ce compte' });
        }

        // Vérifier que le client existe et appartient au compte
        const clientResult = await pool.query(
            'SELECT * FROM creance_clients WHERE id = $1 AND account_id = $2 AND is_active = true',
            [client_id, accountId]
        );

        if (clientResult.rows.length === 0) {
            return res.status(404).json({ error: 'Client non trouvé pour ce compte' });
        }

        const result = await pool.query(`
            INSERT INTO creance_operations (account_id, client_id, operation_type, amount, operation_date, description, created_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `, [accountId, client_id, operation_type, parseInt(amount), operation_date, description || null, created_by]);

        res.json({ 
            message: `${operation_type === 'credit' ? 'Avance' : 'Remboursement'} ajouté avec succès`, 
            operation: result.rows[0] 
        });
    } catch (error) {
        console.error('Erreur ajout opération créance:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour obtenir l'historique des opérations d'un compte créance
app.get('/api/creance/:accountId/operations', requireAuth, async (req, res) => {
    try {
        const { accountId } = req.params;
        const userRole = req.session.user.role;
        const userId = req.session.user.id;

        // Vérifier l'accès au compte
        const accountResult = await pool.query(
            'SELECT * FROM accounts WHERE id = $1 AND account_type = $2 AND is_active = true',
            [accountId, 'creance']
        );

        if (accountResult.rows.length === 0) {
            return res.status(404).json({ error: 'Compte créance non trouvé' });
        }

        const account = accountResult.rows[0];

        // Vérifier les permissions
        if (userRole === 'directeur' && account.user_id !== userId) {
            return res.status(403).json({ error: 'Accès non autorisé à ce compte' });
        }

        const result = await pool.query(`
            SELECT co.*, cc.client_name, u.full_name as created_by_name,
                   co.operation_date as operation_date,
                   co.created_at as timestamp_creation
            FROM creance_operations co
            JOIN creance_clients cc ON co.client_id = cc.id
            JOIN users u ON co.created_by = u.id
            WHERE co.account_id = $1
            ORDER BY co.operation_date DESC, co.created_at DESC
        `, [accountId]);

        res.json(result.rows);
    } catch (error) {
        console.error('Erreur récupération opérations créance:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour récupérer une opération créance spécifique
app.get('/api/creance/operations/:operationId', requireAuth, async (req, res) => {
    try {
        const { operationId } = req.params;
        const userId = req.session.user.id;
        const userRole = req.session.user.role;

        // Récupérer l'opération
        const operationResult = await pool.query(`
            SELECT co.*, cc.client_name, u.full_name as created_by_name,
                   a.user_id as account_assigned_to
            FROM creance_operations co
            JOIN creance_clients cc ON co.client_id = cc.id  
            JOIN users u ON co.created_by = u.id
            JOIN accounts a ON co.account_id = a.id
            WHERE co.id = $1
        `, [operationId]);

        if (operationResult.rows.length === 0) {
            return res.status(404).json({ error: 'Opération non trouvée' });
        }

        const operation = operationResult.rows[0];

        // Vérifier les permissions d'accès
        if (userRole === 'directeur') {
            // Le directeur ne peut accéder qu'aux opérations de ses comptes
            if (operation.account_assigned_to !== userId) {
                return res.status(403).json({ error: 'Accès non autorisé' });
            }
        }

        res.json(operation);

    } catch (error) {
        console.error('Erreur récupération opération créance:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour modifier une opération créance
app.put('/api/creance/operations/:operationId', requireAuth, async (req, res) => {
    try {
        const { operationId } = req.params;
        const { client_id, operation_type, amount, operation_date, description } = req.body;
        const userId = req.session.user.id;
        const userRole = req.session.user.role;

        // Validation des données
        if (!client_id || !operation_type || !amount || !operation_date) {
            return res.status(400).json({ error: 'Données manquantes' });
        }

        if (!['credit', 'debit'].includes(operation_type)) {
            return res.status(400).json({ error: 'Type d\'opération invalide' });
        }

        if (amount <= 0) {
            return res.status(400).json({ error: 'Le montant doit être supérieur à 0' });
        }

        // Récupérer l'opération existante pour vérifier les permissions
        const operationResult = await pool.query(`
            SELECT co.*, a.user_id as account_assigned_to
            FROM creance_operations co
            JOIN accounts a ON co.account_id = a.id
            WHERE co.id = $1
        `, [operationId]);

        if (operationResult.rows.length === 0) {
            return res.status(404).json({ error: 'Opération non trouvée' });
        }

        const operation = operationResult.rows[0];

        // Vérifier les permissions de modification
        const canEdit = checkCreanceOperationEditPermission(
            userRole, 
            userId, 
            operation.created_by, 
            operation.account_assigned_to,
            operation.created_at
        );

        if (!canEdit) {
            return res.status(403).json({ 
                error: userRole === 'directeur' 
                    ? 'Vous ne pouvez modifier que vos propres opérations dans les 24h'
                    : 'Permission refusée' 
            });
        }

        // Mettre à jour l'opération
        const updateResult = await pool.query(`
            UPDATE creance_operations 
            SET client_id = $1, operation_type = $2, amount = $3, 
                operation_date = $4, description = $5
            WHERE id = $6 
            RETURNING *
        `, [client_id, operation_type, amount, operation_date, description, operationId]);

        res.json({ 
            message: `${operation_type === 'credit' ? 'Avance' : 'Remboursement'} mis à jour avec succès`, 
            operation: updateResult.rows[0] 
        });

    } catch (error) {
        console.error('Erreur modification opération créance:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour supprimer une opération créance  
app.delete('/api/creance/operations/:operationId', requireAuth, async (req, res) => {
    try {
        const { operationId } = req.params;
        const userId = req.session.user.id;
        const userRole = req.session.user.role;

        // Récupérer l'opération existante pour vérifier les permissions
        const operationResult = await pool.query(`
            SELECT co.*, a.user_id as account_assigned_to, cc.client_name
            FROM creance_operations co
            JOIN accounts a ON co.account_id = a.id
            JOIN creance_clients cc ON co.client_id = cc.id
            WHERE co.id = $1
        `, [operationId]);

        if (operationResult.rows.length === 0) {
            return res.status(404).json({ error: 'Opération non trouvée' });
        }

        const operation = operationResult.rows[0];

        // Vérifier les permissions de suppression
        const canDelete = checkCreanceOperationDeletePermission(
            userRole, 
            userId, 
            operation.created_by, 
            operation.account_assigned_to,
            operation.created_at
        );

        if (!canDelete) {
            return res.status(403).json({ 
                error: userRole === 'directeur' 
                    ? 'Vous ne pouvez supprimer que vos propres opérations dans les 24h'
                    : 'Seul l\'admin peut supprimer les opérations' 
            });
        }

        // Supprimer l'opération
        await pool.query('DELETE FROM creance_operations WHERE id = $1', [operationId]);

        res.json({ 
            message: `Opération supprimée avec succès (${operation.client_name} - ${operation.amount} FCFA)` 
        });

    } catch (error) {
        console.error('Erreur suppression opération créance:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Fonction utilitaire pour vérifier les permissions de modification
function checkCreanceOperationEditPermission(userRole, userId, operationCreatedBy, accountAssignedTo, operationCreatedAt) {
    // Admin, DG, PCA peuvent toujours modifier
    if (['admin', 'directeur_general', 'pca'].includes(userRole)) {
        return true;
    }
    
    // Directeur peut modifier ses propres opérations dans les 24h
    if (userRole === 'directeur' && 
        operationCreatedBy === userId && 
        accountAssignedTo === userId) {
        return isWithin24Hours(operationCreatedAt);
    }
    
    return false;
}

// Fonction utilitaire pour vérifier les permissions de suppression
function checkCreanceOperationDeletePermission(userRole, userId, operationCreatedBy, accountAssignedTo, operationCreatedAt) {
    // Seul l'admin peut supprimer
    if (userRole === 'admin') {
        return true;
    }
    
    // Directeur peut supprimer ses propres opérations dans les 24h
    if (userRole === 'directeur' && 
        operationCreatedBy === userId && 
        accountAssignedTo === userId) {
        return isWithin24Hours(operationCreatedAt);
    }
    
    return false;
}

// Fonction utilitaire pour vérifier si une date est dans les 24 heures
function isWithin24Hours(dateString) {
    if (!dateString) return false;
    
    const operationDate = new Date(dateString);
    const now = new Date();
    const diffHours = (now - operationDate) / (1000 * 60 * 60);
    
    return diffHours <= 24;
}

// Route pour obtenir le total des créances (somme des soldes de tous les clients)
app.get('/api/dashboard/total-creances', requireAuth, async (req, res) => {
    try {
        const userRole = req.session.user.role;
        const userId = req.session.user.id;

        let accountFilter = '';
        let params = [];

        // Filtrer selon les permissions
        if (userRole === 'directeur') {
            accountFilter = 'AND a.user_id = $1';
            params = [userId];
        }

        const result = await pool.query(`
                SELECT 
                COALESCE(SUM(
                    cc.initial_credit + 
                    COALESCE(credits.total_credits, 0) - 
                    COALESCE(debits.total_debits, 0)
                ), 0) as total_creances
            FROM creance_clients cc
            JOIN accounts a ON cc.account_id = a.id
            LEFT JOIN (
                SELECT client_id, SUM(amount) as total_credits
                FROM creance_operations 
                WHERE operation_type = 'credit'
                GROUP BY client_id
            ) credits ON cc.id = credits.client_id
            LEFT JOIN (
                SELECT client_id, SUM(amount) as total_debits
                FROM creance_operations 
                WHERE operation_type = 'debit'
                GROUP BY client_id
            ) debits ON cc.id = debits.client_id
            WHERE a.account_type = 'creance' 
            AND a.is_active = true 
            AND cc.is_active = true
            ${accountFilter}
        `, params);

        const totalCreances = parseInt(result.rows[0].total_creances) || 0;

        res.json({ 
            total_creances: totalCreances,
            formatted: `${totalCreances.toLocaleString('fr-FR')} FCFA`
        });

    } catch (error) {
        console.error('Erreur récupération total créances:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});
// Route pour obtenir les créances du mois (accepte paramètre month optionnel et cutoff_date)
app.get('/api/dashboard/creances-mois', requireAuth, async (req, res) => {
    try {
        const userRole = req.session.user.role;
        const userId = req.session.user.id;
        const { month, cutoff_date } = req.query; // Format optionnel YYYY-MM et YYYY-MM-DD

        let accountFilter = '';
        let params = [];

        // Filtrer selon les permissions
        if (userRole === 'directeur') {
            accountFilter = 'AND a.user_id = $1';
            params = [userId];
        }

        // Calculer les dates selon le mois demandé ou le mois en cours
        let startOfMonth, endOfMonth;
        
        if (month && /^\d{4}-\d{2}$/.test(month)) {
            // Mois spécifique fourni
            const [year, monthNum] = month.split('-').map(Number);
            startOfMonth = new Date(year, monthNum - 1, 1);
            endOfMonth = new Date(year, monthNum, 0, 23, 59, 59);
        } else {
            // Mois en cours par défaut
            const now = new Date();
            startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
        }

        const startOfMonthStr = startOfMonth.toISOString().split('T')[0];
        let endOfMonthStr = endOfMonth.toISOString().split('T')[0] + ' 23:59:59';
        
        // Si cutoff_date est fourni, l'utiliser comme date de fin
        if (cutoff_date) {
            endOfMonthStr = cutoff_date + ' 23:59:59';
        }

        // Paramètres pour la requête
        const queryParams = userRole === 'directeur' ? [userId, startOfMonthStr, endOfMonthStr] : [startOfMonthStr, endOfMonthStr];

        console.log(`🎯 Calcul créances pour période: ${startOfMonthStr} à ${endOfMonthStr.split(' ')[0]}${cutoff_date ? ' (cutoff_date)' : ''}`);

        const result = await pool.query(`
            SELECT 
                COALESCE(
                    -- Total des avances (crédits) du mois seulement
                    (SELECT SUM(co.amount)
                     FROM creance_operations co
                     JOIN creance_clients cc ON co.client_id = cc.id
                     JOIN accounts a ON cc.account_id = a.id
                     WHERE co.operation_type = 'credit'
                     AND co.operation_date >= $${userRole === 'directeur' ? '2' : '1'}
                     AND co.operation_date <= $${userRole === 'directeur' ? '3' : '2'}
                     AND a.account_type = 'creance' 
                     AND a.is_active = true 
                     AND cc.is_active = true
                     ${accountFilter}
                    ), 0
                ) as total_avances_mois
        `, queryParams);

        const totalAvancesMois = parseInt(result.rows[0].total_avances_mois) || 0;

        console.log(`💰 Créances du mois calculées: ${totalAvancesMois} FCFA`);

        // Si debug_details est demandé, calculer le détail jour par jour pour Créances du Mois
        let creancesDetails = null;
        if (req.query.debug_details === 'true') {
            const dailyCreancesResult = await pool.query(`
                SELECT 
                    co.operation_date::date as date,
                    COALESCE(SUM(co.amount), 0) as amount,
                    COUNT(co.id) as count,
                    STRING_AGG(DISTINCT cc.client_name, ', ') as clients,
                    co.operation_type as type
                FROM creance_operations co
                JOIN creance_clients cc ON co.client_id = cc.id
                JOIN accounts a ON cc.account_id = a.id
                WHERE co.operation_type = 'credit'
                AND co.operation_date >= $${userRole === 'directeur' ? '2' : '1'}
                AND co.operation_date <= $${userRole === 'directeur' ? '3' : '2'}
                AND a.account_type = 'creance' 
                AND a.is_active = true 
                AND cc.is_active = true
                ${accountFilter}
                GROUP BY co.operation_date::date, co.operation_type
                ORDER BY co.operation_date::date
            `, queryParams);

            creancesDetails = {
                startDate: startOfMonthStr,
                endDate: cutoff_date || endOfMonthStr.split(' ')[0],
                totalDays: dailyCreancesResult.rows.length || 0,
                totalAmount: totalAvancesMois,
                dailyBreakdown: dailyCreancesResult.rows.map(row => ({
                    date: row.date.toISOString().split('T')[0],
                    amount: parseInt(row.amount) || 0,
                    count: parseInt(row.count) || 0,
                    clients: row.clients || 'Aucun client',
                    type: row.type || 'credit'
                }))
            };
        }

        const responseData = { 
            creances_mois: totalAvancesMois,
            formatted: `${totalAvancesMois.toLocaleString('fr-FR')} FCFA`,
            period: `${startOfMonth.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}`,
            description: 'Total Avances'
        };

        // Ajouter les détails de debug si demandés
        if (creancesDetails) {
            responseData.creancesDetails = creancesDetails;
        }

        res.json(responseData);

    } catch (error) {
        console.error('Erreur récupération total avances du mois:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour modifier un client créance (DG, PCA, Admin)
app.put('/api/creance/:accountId/clients/:clientId', requireAdminAuth, async (req, res) => {
    try {
        const { accountId, clientId } = req.params;
        const { client_name, client_phone, client_address, initial_credit } = req.body;

        // Vérifier que le compte existe et est de type créance
        const accountResult = await pool.query(
            'SELECT * FROM accounts WHERE id = $1 AND account_type = $2 AND is_active = true',
            [accountId, 'creance']
        );

        if (accountResult.rows.length === 0) {
            return res.status(404).json({ error: 'Compte créance non trouvé' });
        }

        // Vérifier que le client existe pour ce compte
        const clientResult = await pool.query(
            'SELECT * FROM creance_clients WHERE id = $1 AND account_id = $2 AND is_active = true',
            [clientId, accountId]
        );

        if (clientResult.rows.length === 0) {
            return res.status(404).json({ error: 'Client non trouvé pour ce compte' });
        }

        // Vérifier qu'aucun autre client ACTIF avec ce nom n'existe pour ce compte
        const existingClientResult = await pool.query(
            'SELECT id FROM creance_clients WHERE account_id = $1 AND client_name = $2 AND is_active = true AND id != $3',
            [accountId, client_name, clientId]
        );

        if (existingClientResult.rows.length > 0) {
            return res.status(400).json({ error: 'Un autre client avec ce nom existe déjà pour ce compte' });
        }

        // Mettre à jour le client
        const updateResult = await pool.query(`
            UPDATE creance_clients 
            SET client_name = $1, client_phone = $2, client_address = $3, initial_credit = $4
            WHERE id = $5 AND account_id = $6
            RETURNING *
        `, [client_name, client_phone || null, client_address || null, parseInt(initial_credit) || 0, clientId, accountId]);

        res.json({ 
            message: 'Client modifié avec succès', 
            client: updateResult.rows[0] 
        });
    } catch (error) {
        console.error('Erreur modification client créance:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Middleware pour vérifier les permissions admin strictes (admin seulement)
const requireStrictAdminAuth = (req, res, next) => {
    if (!req.session?.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Accès refusé - Seul l\'admin peut effectuer cette action' });
    }
    next();
};

// Route pour supprimer un client créance (Admin seulement)
app.delete('/api/creance/:accountId/clients/:clientId', requireStrictAdminAuth, async (req, res) => {
    try {
        const { accountId, clientId } = req.params;

        // Vérifier que le compte existe et est de type créance
        const accountResult = await pool.query(
            'SELECT * FROM accounts WHERE id = $1 AND account_type = $2 AND is_active = true',
            [accountId, 'creance']
        );

        if (accountResult.rows.length === 0) {
            return res.status(404).json({ error: 'Compte créance non trouvé' });
        }

        // Vérifier que le client existe pour ce compte
        const clientResult = await pool.query(
            'SELECT * FROM creance_clients WHERE id = $1 AND account_id = $2 AND is_active = true',
            [clientId, accountId]
        );

        if (clientResult.rows.length === 0) {
            return res.status(404).json({ error: 'Client non trouvé pour ce compte' });
        }

        const client = clientResult.rows[0];

        await pool.query('BEGIN');

        try {
            // Supprimer toutes les opérations liées au client
            await pool.query('DELETE FROM creance_operations WHERE client_id = $1', [clientId]);

            // Supprimer définitivement le client
            await pool.query('DELETE FROM creance_clients WHERE id = $1', [clientId]);

            await pool.query('COMMIT');

            res.json({ 
                message: `Client "${client.client_name}" supprimé définitivement avec succès (ainsi que toutes ses opérations)` 
            });

        } catch (error) {
            await pool.query('ROLLBACK');
            throw error;
        }

    } catch (error) {
        console.error('Erreur suppression client créance:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ===== GESTION CASH BICTORYS MOIS =====

// Créer la table Cash Bictorys si elle n'existe pas
async function createCashBictorysTableIfNotExists() {
    // FONCTION DÉSACTIVÉE: Tables créées par render_volaille_database_schema.sql
    console.log('ℹ️ Cash Bictorys table creation SKIPPED - table already exists from SQL script');
    return; // Pas de création de tables
}

// DÉSACTIVÉ: Les tables sont créées par render_volaille_database_schema.sql
// createCashBictorysTableIfNotExists();
console.log('ℹ️ Automatic table creation disabled: cash_bictorys managed by SQL script');

// Middleware pour vérifier les permissions Cash Bictorys (Tous les utilisateurs connectés)
const requireCashBictorysAuth = (req, res, next) => {
    // Check for API key first
    const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '') || req.query.api_key;
    
    if (apiKey) {
        // API key authentication
        const validApiKey = process.env.API_KEY || '4f8d9a2b6c7e8f1a3b5c9d0e2f4g6h7i';
        
        if (apiKey === validApiKey) {
            // Create virtual admin user for API with ID 1 (assuming this is a valid admin ID in your users table)
            req.session = req.session || {};
            req.session.user = {
                id: 1, // Using ID 1 which should exist in users table
                username: 'api_user',
                role: 'admin',
                full_name: 'API User'
            };
            return next();
        }
        return res.status(401).json({ error: 'Clé API invalide' });
    }

    // Fallback to session authentication
    if (!req.session?.user) {
        return res.status(403).json({ error: 'Accès refusé - Connexion requise' });
    }
    next();
};

// Route pour obtenir les données Cash Bictorys d'un mois donné
app.get('/api/cash-bictorys/:monthYear', requireCashBictorysAuth, async (req, res) => {
    try {
        const { monthYear } = req.params; // Format YYYY-MM
        
        // Valider le format
        if (!/^\d{4}-\d{2}$/.test(monthYear)) {
            return res.status(400).json({ error: 'Format mois invalide. Utiliser YYYY-MM' });
        }

        // Générer toutes les dates du mois pour l'affichage frontend
        const [year, month] = monthYear.split('-').map(Number);
        const daysInMonth = new Date(year, month, 0).getDate();
        const allDates = [];
        
        for (let day = 1; day <= daysInMonth; day++) {
            allDates.push({
                date: `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`,
                amount: 0, // Valeur par défaut pour l'affichage uniquement
                balance: 0, // Valeur par défaut pour l'affichage uniquement
                fees: 0 // Valeur par défaut pour l'affichage uniquement
            });
        }

        // Récupérer TOUTES les données existantes (pas seulement > 0)
        const result = await pool.query(`
            SELECT date, amount, balance, fees
            FROM cash_bictorys 
            WHERE month_year = $1
            ORDER BY date
        `, [monthYear]);

        // Fusionner les données existantes avec les dates par défaut (pour l'affichage)
        const existingData = result.rows.reduce((acc, row) => {
            // Utiliser toLocaleDateString pour éviter les problèmes de timezone
            const date = new Date(row.date);
            const dateStr = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
            acc[dateStr] = {
                amount: parseFloat(row.amount) || 0,
                balance: parseFloat(row.balance) || 0,
                fees: parseFloat(row.fees) || 0
            };
            return acc;
        }, {});

        const finalData = allDates.map(dateObj => ({
            date: dateObj.date,
            amount: existingData[dateObj.date]?.amount || 0,
            balance: existingData[dateObj.date]?.balance || 0,
            fees: existingData[dateObj.date]?.fees || 0
        }));

        res.json({
            monthYear,
            data: finalData,
            monthName: new Date(year, month - 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
        });

    } catch (error) {
        console.error('Erreur récupération Cash Bictorys:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour mettre à jour les données Cash Bictorys d'un mois
app.put('/api/cash-bictorys/:monthYear', requireCashBictorysAuth, async (req, res) => {
    try {
        console.log('🔧 SERVER: Requête PUT Cash Bictorys reçue');
        console.log('🔧 SERVER: monthYear =', req.params.monthYear);
        console.log('🔧 SERVER: body =', req.body);
        console.log('🔧 SERVER: user =', req.session.user);
        
        const { monthYear } = req.params;
        const { data } = req.body; // Array d'objets {date, amount, balance, fees}
        const userId = req.session.user.id;
        const userRole = req.session.user.role;

        // Valider le format
        if (!/^\d{4}-\d{2}$/.test(monthYear)) {
            return res.status(400).json({ error: 'Format mois invalide. Utiliser YYYY-MM' });
        }

        // Vérifier les permissions de modification
        const currentDate = new Date();
        const currentMonthYear = `${currentDate.getFullYear()}-${(currentDate.getMonth() + 1).toString().padStart(2, '0')}`;
        
        // DG et PCA peuvent modifier seulement le mois en cours, Admin peut tout modifier
        if (userRole !== 'admin' && monthYear !== currentMonthYear) {
            return res.status(403).json({ 
                error: 'Vous ne pouvez modifier que les données du mois en cours' 
            });
        }

        if (!Array.isArray(data)) {
            return res.status(400).json({ error: 'Les données doivent être un tableau' });
        }

        await pool.query('BEGIN');

        try {
            // Mettre à jour chaque entrée
            for (const entry of data) {
                const { date, amount, balance, fees } = entry;
                
                if (!date || amount === undefined) {
                    continue; // Ignorer les entrées invalides
                }

                // Vérifier que la date appartient au mois spécifié
                if (!date.startsWith(monthYear)) {
                    continue;
                }

                const amountValue = parseInt(amount) || 0;
                const balanceValue = balance !== undefined ? parseInt(balance) || 0 : 0;
                const feesValue = fees !== undefined ? parseInt(fees) || 0 : 0;

                // Ne créer une entrée que si le montant, balance ou fees est > 0
                if (amountValue > 0 || balanceValue > 0 || feesValue > 0) {
                    // Insérer ou mettre à jour (avec balance et fees)
                    await pool.query(`
                        INSERT INTO cash_bictorys (date, amount, balance, fees, month_year, created_by, updated_by)
                        VALUES ($1, $2, $3, $4, $5, $6, $6)
                        ON CONFLICT (date) 
                        DO UPDATE SET 
                            amount = EXCLUDED.amount,
                            balance = EXCLUDED.balance,
                            fees = EXCLUDED.fees,
                            updated_by = EXCLUDED.updated_by,
                            updated_at = CURRENT_TIMESTAMP
                    `, [date, amountValue, balanceValue, feesValue, monthYear, userId]);
                    
                    console.log(`✅ Cash Bictorys: ${date} → Amount: ${amountValue}, Balance: ${balanceValue}, Fees: ${feesValue}`);
                } else {
                    // Si tout est 0, supprimer l'entrée existante (si elle existe)
                    await pool.query(`
                        DELETE FROM cash_bictorys 
                        WHERE date = $1
                    `, [date]);
                    
                    console.log(`🗑️ Cash Bictorys: ${date} supprimé (toutes les valeurs = 0)`);
                }
            }

            await pool.query('COMMIT');

            res.json({ 
                message: 'Données Cash Bictorys mises à jour avec succès',
                monthYear
            });

        } catch (error) {
            await pool.query('ROLLBACK');
            throw error;
        }

    } catch (error) {
        console.error('Erreur mise à jour Cash Bictorys:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour obtenir le total Cash Bictorys d'un mois (pour le dashboard)
app.get('/api/cash-bictorys/:monthYear/total', requireCashBictorysAuth, async (req, res) => {
    try {
        const { monthYear } = req.params;
        
        if (!/^\d{4}-\d{2}$/.test(monthYear)) {
            return res.status(400).json({ error: 'Format mois invalide. Utiliser YYYY-MM' });
        }

        const result = await pool.query(`
            SELECT amount
            FROM cash_bictorys
            WHERE date = (
                SELECT MAX(date)
                FROM cash_bictorys
                WHERE amount != 0 
                AND month_year = $1
            )
            AND amount != 0
            AND month_year = $1
        `, [monthYear]);

        const total = result.rows.length > 0 ? parseInt(result.rows[0].amount) || 0 : 0;

        res.json({
            monthYear,
            total,
            formatted: `${total.toLocaleString('fr-FR')} FCFA`
        });

    } catch (error) {
        console.error('Erreur total Cash Bictorys:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour obtenir la dernière valeur Cash Bictorys du mois en cours pour le dashboard
app.get('/api/dashboard/cash-bictorys-latest', requireAuth, async (req, res) => {
    try {
        // Calculer le mois en cours au format YYYY-MM
        const currentDate = new Date();
        const currentMonthYear = `${currentDate.getFullYear()}-${(currentDate.getMonth() + 1).toString().padStart(2, '0')}`;
        
        const result = await pool.query(`
            SELECT amount
            FROM cash_bictorys
            WHERE date = (
                SELECT MAX(date)
                FROM cash_bictorys
                WHERE amount != 0 
                AND month_year = $1
            )
            AND amount != 0
            AND month_year = $1
        `, [currentMonthYear]);

        const latestAmount = result.rows.length > 0 ? parseInt(result.rows[0].amount) || 0 : 0;

        res.json({
            latest_amount: latestAmount,
            formatted: `${latestAmount.toLocaleString('fr-FR')} FCFA`,
            month_year: currentMonthYear
        });

    } catch (error) {
        console.error('Erreur récupération dernière valeur Cash Bictorys:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour nettoyer les entrées Cash Bictorys avec montant = 0 (Admin seulement)
app.delete('/api/admin/cash-bictorys/cleanup-zeros', requireAdminAuth, async (req, res) => {
    try {
        const result = await pool.query(`
            DELETE FROM cash_bictorys 
            WHERE amount = 0 OR amount IS NULL
        `);

        res.json({
            message: `${result.rowCount} entrées avec montant nul supprimées`,
            deleted_count: result.rowCount
        });

    } catch (error) {
        console.error('Erreur nettoyage Cash Bictorys:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour importer les données Cash Bictorys depuis un fichier CSV
app.post('/api/cash-bictorys/upload', requireCashBictorysAuth, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Aucun fichier fourni' });
        }

        console.log('File received:', {
            originalname: req.file.originalname,
            mimetype: req.file.mimetype,
            size: req.file.size
        });

        // Read and parse JSON file
        const fileContent = fs.readFileSync(req.file.path, 'utf8');
        console.log('File content:', fileContent.substring(0, 200) + '...');
        
        let jsonData;
        try {
            jsonData = JSON.parse(fileContent);
        } catch (error) {
            return res.status(400).json({ error: 'Format JSON invalide: ' + error.message });
        }

        // Validate JSON structure
        if (!Array.isArray(jsonData)) {
            return res.status(400).json({ error: 'Le fichier JSON doit contenir un tableau d\'objets' });
        }

        // Validate required fields in each object
        const requiredFields = ['date', 'amount', 'balance', 'fees'];
        for (let i = 0; i < jsonData.length; i++) {
            const item = jsonData[i];
            const missingFields = requiredFields.filter(field => !(field in item));
            
            if (missingFields.length > 0) {
                return res.status(400).json({
                    error: `Champs manquants dans l'objet ${i + 1}: ${missingFields.join(', ')}`
                });
            }

            // Validate date format
            if (!/^\d{4}-\d{2}-\d{2}$/.test(item.date)) {
                return res.status(400).json({
                    error: `Format de date invalide dans l'objet ${i + 1}. Utiliser YYYY-MM-DD`
                });
            }

            // Validate numeric fields
            ['amount', 'balance', 'fees'].forEach(field => {
                if (typeof item[field] !== 'number') {
                    return res.status(400).json({
                        error: `Le champ ${field} doit être un nombre dans l'objet ${i + 1}`
                    });
                }
            });
        }

        // Initialiser les compteurs
        let importedCount = 0;
        let errorCount = 0;
        const errors = [];

        // Traiter chaque entrée JSON
        for (const data of jsonData) {
            try {
                // Extraire le mois-année pour la colonne month_year
                const monthYear = data.date.substring(0, 7);

                // Insérer ou mettre à jour les données
                console.log('Inserting data:', {
                    date: data.date,
                    amount: data.amount,
                    balance: data.balance,
                    fees: data.fees,
                    monthYear,
                    userId: req.session.user.id
                });
                
                await pool.query(`
                    INSERT INTO cash_bictorys (date, amount, balance, fees, month_year, created_by, updated_by)
                    VALUES ($1, $2, $3, $4, $5, $6, $6)
                    ON CONFLICT (date) 
                    DO UPDATE SET 
                        amount = EXCLUDED.amount,
                        balance = EXCLUDED.balance,
                        fees = EXCLUDED.fees,
                        updated_by = EXCLUDED.updated_by,
                        updated_at = CURRENT_TIMESTAMP
                `, [data.date, data.amount, data.balance, data.fees, monthYear, req.session.user.id]);

                importedCount++;
            } catch (error) {
                console.error('Erreur insertion/mise à jour pour la date', data.date, ':', error);
                errors.push(`Erreur d'insertion/mise à jour pour la date ${data.date}: ${error.message}`);
                errorCount++;
            }
        }

        // Renvoyer le résultat
        res.json({
            message: `Importation terminée. ${importedCount} entrées importées.`,
            imported_count: importedCount,
            error_count: errorCount,
            errors: errors
        });

    } catch (error) {
        console.error('Erreur importation Cash Bictorys:', error);
        res.status(500).json({ error: 'Erreur serveur lors de l\'importation' });
    }
});

// ===== API EXTERNE CASH BICTORYS =====

// Route pour mise à jour des données Cash Bictorys via API externe (avec clé API)
app.post('/api/external/cash-bictorys', requireCashBictorysAuth, async (req, res) => {
    try {
        console.log('🌐 EXTERNAL API: Requête Cash Bictorys reçue');
        console.log('🌐 EXTERNAL API: Body:', JSON.stringify(req.body, null, 2));

        // Valider que le body est un array
        if (!Array.isArray(req.body)) {
            return res.status(400).json({ 
                error: 'Le body doit contenir un tableau d\'objets avec les champs DATE, VALEUR, BALANCE' 
            });
        }

        const jsonData = req.body;

        // Valider la structure de chaque objet
        const requiredFields = ['DATE', 'VALEUR'];
        for (let i = 0; i < jsonData.length; i++) {
            const item = jsonData[i];
            
            // Vérifier les champs obligatoires
            const missingFields = requiredFields.filter(field => !(field in item));
            if (missingFields.length > 0) {
                return res.status(400).json({
                    error: `Champs manquants dans l'objet ${i + 1}: ${missingFields.join(', ')}`
                });
            }

            // Valider le format de date (supporter plusieurs formats)
            let dateStr = item.DATE;
            let normalizedDate = null;

            // Supporter les formats: YYYY-MM-DD, DD-MM-YYYY, DD/MM/YYYY, DD/MM/YY
            if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
                // Format YYYY-MM-DD (déjà correct)
                normalizedDate = dateStr;
            } else if (/^\d{2}-\d{2}-\d{4}$/.test(dateStr)) {
                // Format DD-MM-YYYY
                const [day, month, year] = dateStr.split('-');
                normalizedDate = `${year}-${month}-${day}`;
            } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
                // Format DD/MM/YYYY
                const [day, month, year] = dateStr.split('/');
                normalizedDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
            } else if (/^\d{2}\/\d{2}\/\d{2}$/.test(dateStr)) {
                // Format DD/MM/YY (supposer 20XX)
                const [day, month, year] = dateStr.split('/');
                const fullYear = `20${year}`;
                normalizedDate = `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
            } else {
                return res.status(400).json({
                    error: `Format de date invalide dans l'objet ${i + 1}: "${dateStr}". Formats supportés: YYYY-MM-DD, DD-MM-YYYY, DD/MM/YYYY, DD/MM/YY`
                });
            }

            // Valider que la date normalisée est valide
            const dateObj = new Date(normalizedDate);
            if (isNaN(dateObj.getTime())) {
                return res.status(400).json({
                    error: `Date invalide dans l'objet ${i + 1}: "${dateStr}"`
                });
            }

            // Mettre à jour l'objet avec la date normalisée
            item.DATE = normalizedDate;

            // Valider VALEUR (nombre)
            if (typeof item.VALEUR !== 'number' && !Number.isFinite(Number(item.VALEUR))) {
                return res.status(400).json({
                    error: `Le champ VALEUR doit être un nombre dans l'objet ${i + 1}`
                });
            }
            
            // Convertir VALEUR en nombre si c'est une string
            item.VALEUR = Number(item.VALEUR);

            // Valider BALANCE si présent (optionnel)
            if ('BALANCE' in item) {
                if (typeof item.BALANCE !== 'number' && !Number.isFinite(Number(item.BALANCE))) {
                    return res.status(400).json({
                        error: `Le champ BALANCE doit être un nombre dans l'objet ${i + 1}`
                    });
                }
                item.BALANCE = Number(item.BALANCE);
            } else {
                item.BALANCE = 0; // Valeur par défaut
            }
        }

        // Initialiser les compteurs
        let importedCount = 0;
        let errorCount = 0;
        const errors = [];

        // Traiter chaque entrée
        for (const data of jsonData) {
            try {
                // Extraire le mois-année pour la colonne month_year
                const monthYear = data.DATE.substring(0, 7);

                console.log('🌐 EXTERNAL API: Insertion données:', {
                    date: data.DATE,
                    amount: data.VALEUR,
                    balance: data.BALANCE,
                    monthYear
                });

                // Utiliser l'ID de l'utilisateur admin ou NULL pour les API externes
                let externalUserId = null;
                try {
                    const adminUser = await pool.query('SELECT id FROM users WHERE username = $1', ['admin']);
                    if (adminUser.rows.length > 0) {
                        externalUserId = adminUser.rows[0].id;
                    }
                } catch (error) {
                    console.log('🔍 EXTERNAL API: Utilisateur admin non trouvé, utilisation de NULL');
                }

                await pool.query(`
                    INSERT INTO cash_bictorys (date, amount, balance, fees, month_year, created_by, updated_by)
                    VALUES ($1, $2, $3, $4, $5, $6, $6)
                    ON CONFLICT (date) 
                    DO UPDATE SET 
                        amount = EXCLUDED.amount,
                        balance = EXCLUDED.balance,
                        fees = EXCLUDED.fees,
                        updated_by = EXCLUDED.updated_by,
                        updated_at = CURRENT_TIMESTAMP
                `, [data.DATE, data.VALEUR, data.BALANCE, 0, monthYear, externalUserId]);

                importedCount++;
            } catch (error) {
                console.error('🌐 EXTERNAL API: Erreur insertion pour la date', data.DATE, ':', error);
                errors.push(`Erreur d'insertion pour la date ${data.DATE}: ${error.message}`);
                errorCount++;
            }
        }

        console.log(`🌐 EXTERNAL API: Traitement terminé - ${importedCount} importées, ${errorCount} erreurs`);

        // Renvoyer le résultat
        res.json({
            success: true,
            message: `Traitement terminé. ${importedCount} entrées traitées.`,
            imported_count: importedCount,
            error_count: errorCount,
            errors: errors,
            supported_date_formats: ['YYYY-MM-DD', 'DD-MM-YYYY', 'DD/MM/YYYY', 'DD/MM/YY']
        });

    } catch (error) {
        console.error('🌐 EXTERNAL API: Erreur traitement Cash Bictorys:', error);
        res.status(500).json({ 
            success: false,
            error: 'Erreur serveur lors du traitement',
            details: error.message 
        });
    }
});

// ========================================
// 💸 VIREMENT MENSUEL - ROUTES API
// ========================================
// Module de suivi des virements quotidiens par client
// La somme mensuelle impacte le calcul du PL

// Middleware pour vérifier les permissions Virement Mensuel (Tous les utilisateurs connectés)
const requireVirementMensuelAuth = (req, res, next) => {
    // Check for API key from secure headers only (not query string)
    const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
    
    if (apiKey) {
        // API key authentication
        if (!process.env.API_KEY) {
            return res.status(500).json({ error: 'Configuration serveur invalide: API_KEY manquante' });
        }
        
        // Use timing-safe comparison to prevent timing attacks
        try {
            const apiKeyBuffer = Buffer.from(apiKey, 'utf8');
            const envKeyBuffer = Buffer.from(process.env.API_KEY, 'utf8');
            
            // Check length first to avoid timingSafeEqual error
            if (apiKeyBuffer.length !== envKeyBuffer.length) {
                return res.status(401).json({ error: 'Clé API invalide' });
            }
            
            if (crypto.timingSafeEqual(apiKeyBuffer, envKeyBuffer)) {
                req.session = req.session || {};
                req.session.user = {
                    id: 1,
                    username: 'api_user',
                    role: 'admin',
                    full_name: 'API User'
                };
                return next();
            }
        } catch (error) {
            console.error('Erreur comparaison API key:', error);
            return res.status(401).json({ error: 'Clé API invalide' });
        }
        return res.status(401).json({ error: 'Clé API invalide' });
    }

    // Fallback to session authentication
    if (!req.session?.user) {
        return res.status(403).json({ error: 'Accès refusé - Connexion requise' });
    }
    next();
};

// Route pour obtenir les données Virement Mensuel d'un mois donné
app.get('/api/virement-mensuel/:monthYear', requireVirementMensuelAuth, async (req, res) => {
    try {
        const { monthYear } = req.params; // Format YYYY-MM
        
        // Valider le format
        if (!/^\d{4}-\d{2}$/.test(monthYear)) {
            return res.status(400).json({ error: 'Format mois invalide. Utiliser YYYY-MM' });
        }

        console.log(`💸 VIREMENT: Récupération données pour ${monthYear}`);

        // Récupérer toutes les données du mois
        const result = await pool.query(`
            SELECT TO_CHAR(date, 'YYYY-MM-DD') as date, valeur, client
            FROM virement_mensuel 
            WHERE month_year = $1
            ORDER BY date, client
        `, [monthYear]);

        console.log(`💸 VIREMENT: ${result.rows.length} enregistrements trouvés`);

        res.json({
            monthYear,
            data: result.rows,
            count: result.rows.length
        });

    } catch (error) {
        console.error('❌ Erreur récupération Virement Mensuel:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour obtenir le total des virements d'un mois (pour le calcul PL)
app.get('/api/virement-mensuel/:monthYear/total', requireVirementMensuelAuth, async (req, res) => {
    try {
        const { monthYear } = req.params;
        
        if (!/^\d{4}-\d{2}$/.test(monthYear)) {
            return res.status(400).json({ error: 'Format mois invalide. Utiliser YYYY-MM' });
        }

        console.log(`💸 VIREMENT: Calcul total pour ${monthYear}`);

        const result = await pool.query(`
            SELECT COALESCE(SUM(valeur), 0) as total_virements
            FROM virement_mensuel
            WHERE month_year = $1
        `, [monthYear]);

        const total = parseInt(result.rows[0].total_virements) || 0;

        console.log(`💸 VIREMENT: Total calculé: ${total.toLocaleString()} FCFA`);

        res.json({
            monthYear,
            total_virements: total,
            formatted: `${total.toLocaleString('fr-FR')} FCFA`
        });

    } catch (error) {
        console.error('❌ Erreur calcul total Virement Mensuel:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour obtenir les totaux par client d'un mois
app.get('/api/virement-mensuel/:monthYear/totaux-par-client', requireVirementMensuelAuth, async (req, res) => {
    try {
        const { monthYear } = req.params;
        
        if (!/^\d{4}-\d{2}$/.test(monthYear)) {
            return res.status(400).json({ error: 'Format mois invalide. Utiliser YYYY-MM' });
        }

        console.log(`💸 VIREMENT: Calcul totaux par client pour ${monthYear}`);

        const result = await pool.query(`
            SELECT 
                client,
                SUM(valeur) as total_virement,
                COUNT(*) as nombre_virements
            FROM virement_mensuel
            WHERE month_year = $1
            GROUP BY client
            ORDER BY total_virement DESC
        `, [monthYear]);

        console.log(`💸 VIREMENT: ${result.rows.length} clients trouvés`);

        res.json({
            monthYear,
            totaux: result.rows.map(row => ({
                client: row.client,
                total: parseInt(row.total_virement),
                nombre: parseInt(row.nombre_virements),
                formatted: `${parseInt(row.total_virement).toLocaleString('fr-FR')} FCFA`
            }))
        });

    } catch (error) {
        console.error('❌ Erreur calcul totaux par client:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour mettre à jour les données Virement Mensuel d'un mois
app.put('/api/virement-mensuel/:monthYear', requireVirementMensuelAuth, async (req, res) => {
    try {
        console.log('💸 VIREMENT: Requête PUT reçue');
        console.log('💸 VIREMENT: monthYear =', req.params.monthYear);
        console.log('💸 VIREMENT: user =', req.session.user.username);
        
        const { monthYear } = req.params;
        const { data } = req.body; // Array d'objets {date, valeur, client}
        const userId = req.session.user.id;
        const userRole = req.session.user.role;

        // Valider le format
        if (!/^\d{4}-\d{2}$/.test(monthYear)) {
            return res.status(400).json({ error: 'Format mois invalide. Utiliser YYYY-MM' });
        }

        // Vérifier les permissions de modification
        const currentDate = new Date();
        const currentMonthYear = `${currentDate.getFullYear()}-${(currentDate.getMonth() + 1).toString().padStart(2, '0')}`;
        
        // DG et PCA peuvent modifier seulement le mois en cours, Admin peut tout modifier
        if (userRole !== 'admin' && monthYear !== currentMonthYear) {
            return res.status(403).json({ 
                error: 'Vous ne pouvez modifier que les données du mois en cours' 
            });
        }

        if (!Array.isArray(data)) {
            return res.status(400).json({ error: 'Les données doivent être un tableau' });
        }

        await pool.query('BEGIN');

        try {
            let insertedCount = 0;
            let updatedCount = 0;
            let deletedCount = 0;

            // Mettre à jour chaque entrée
            for (const entry of data) {
                const { date, valeur, client } = entry;
                
                if (!date || !client || valeur === undefined) {
                    continue; // Ignorer les entrées invalides
                }

                // Vérifier que la date appartient au mois spécifié
                if (!date.startsWith(monthYear)) {
                    continue;
                }

                const valeurValue = parseInt(valeur) || 0;

                // Ne créer une entrée que si le montant est > 0
                if (valeurValue > 0) {
                    // Insérer ou mettre à jour
                    const result = await pool.query(`
                        INSERT INTO virement_mensuel (date, valeur, client, month_year, created_by, updated_by)
                        VALUES ($1, $2, $3, $4, $5, $5)
                        ON CONFLICT (date, client) 
                        DO UPDATE SET 
                            valeur = EXCLUDED.valeur,
                            updated_by = EXCLUDED.updated_by,
                            updated_at = CURRENT_TIMESTAMP
                        RETURNING (xmax = 0) AS inserted
                    `, [date, valeurValue, client, monthYear, userId]);
                    
                    if (result.rows[0].inserted) {
                        insertedCount++;
                        console.log(`💸 VIREMENT: Inséré ${date} - ${client}: ${valeurValue.toLocaleString()} FCFA`);
                    } else {
                        updatedCount++;
                        console.log(`💸 VIREMENT: Mis à jour ${date} - ${client}: ${valeurValue.toLocaleString()} FCFA`);
                    }
                } else {
                    // Si valeur = 0, supprimer l'entrée existante (si elle existe)
                    const result = await pool.query(`
                        DELETE FROM virement_mensuel 
                        WHERE date = $1 AND client = $2
                    `, [date, client]);
                    
                    if (result.rowCount > 0) {
                        deletedCount++;
                        console.log(`💸 VIREMENT: Supprimé ${date} - ${client} (valeur = 0)`);
                    }
                }
            }

            await pool.query('COMMIT');

            console.log(`💸 VIREMENT: Traitement terminé - ${insertedCount} insérés, ${updatedCount} mis à jour, ${deletedCount} supprimés`);

            res.json({ 
                success: true,
                message: 'Données Virement Mensuel mises à jour avec succès',
                monthYear,
                stats: {
                    inserted: insertedCount,
                    updated: updatedCount,
                    deleted: deletedCount
                }
            });

        } catch (error) {
            await pool.query('ROLLBACK');
            throw error;
        }

    } catch (error) {
        console.error('❌ Erreur mise à jour Virement Mensuel:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour supprimer un client spécifique d'un mois
app.delete('/api/virement-mensuel/:monthYear/client/:clientName', requireVirementMensuelAuth, async (req, res) => {
    try {
        const { monthYear, clientName } = req.params;
        const userRole = req.session.user.role;
        
        if (!/^\d{4}-\d{2}$/.test(monthYear)) {
            return res.status(400).json({ error: 'Format mois invalide. Utiliser YYYY-MM' });
        }

        // Vérifier les permissions de suppression
        const currentDate = new Date();
        const currentMonthYear = `${currentDate.getFullYear()}-${(currentDate.getMonth() + 1).toString().padStart(2, '0')}`;
        
        // DG et PCA peuvent supprimer seulement le mois en cours, Admin peut tout supprimer
        if (userRole !== 'admin' && monthYear !== currentMonthYear) {
            return res.status(403).json({ 
                error: 'Vous ne pouvez supprimer que les données du mois en cours' 
            });
        }

        console.log(`💸 VIREMENT: Suppression du client "${clientName}" pour ${monthYear}`);

        const result = await pool.query(`
            DELETE FROM virement_mensuel 
            WHERE month_year = $1 AND client = $2
        `, [monthYear, clientName]);

        console.log(`💸 VIREMENT: ${result.rowCount} entrées supprimées pour le client "${clientName}"`);

        res.json({
            success: true,
            message: `Client "${clientName}" supprimé avec ${result.rowCount} entrées`,
            deleted_count: result.rowCount,
            client: clientName,
            monthYear
        });

    } catch (error) {
        console.error('❌ Erreur suppression client Virement Mensuel:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour supprimer toutes les entrées d'un mois (Admin seulement)
app.delete('/api/admin/virement-mensuel/:monthYear', requireAdminAuth, async (req, res) => {
    try {
        const { monthYear } = req.params;
        
        if (!/^\d{4}-\d{2}$/.test(monthYear)) {
            return res.status(400).json({ error: 'Format mois invalide. Utiliser YYYY-MM' });
        }

        const result = await pool.query(`
            DELETE FROM virement_mensuel 
            WHERE month_year = $1
        `, [monthYear]);

        console.log(`💸 VIREMENT: ${result.rowCount} entrées supprimées pour ${monthYear}`);

        res.json({
            success: true,
            message: `${result.rowCount} entrées supprimées pour ${monthYear}`,
            deleted_count: result.rowCount
        });

    } catch (error) {
        console.error('❌ Erreur suppression Virement Mensuel:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ===== APIS DE GESTION MENSUELLE =====

// Route pour obtenir toutes les données du dashboard pour un mois spécifique
app.get('/api/dashboard/monthly-data', requireAuth, async (req, res) => {
    try {
        const { month, cutoff_date, start_date, end_date } = req.query; // Format YYYY-MM et YYYY-MM-DD
        const userRole = req.session.user.role;
        const userId = req.session.user.id;

        if (!month || !/^\d{4}-\d{2}$/.test(month)) {
            return res.status(400).json({ error: 'Format mois invalide. Utiliser YYYY-MM' });
        }

        // Utiliser les dates fournies par le frontend si disponibles, sinon calculer
        let startDateStr, endDateStr;
        
        if (start_date && end_date && /^\d{4}-\d{2}-\d{2}$/.test(start_date) && /^\d{4}-\d{2}-\d{2}$/.test(end_date)) {
            // Utiliser les dates fournies par le frontend
            startDateStr = start_date;
            endDateStr = end_date + ' 23:59:59';
            console.log(`📅 SERVER: monthly-data avec dates frontend: ${start_date} à ${end_date}`);
        } else {
            // Calculer les dates de début et fin du mois (fallback)
            const [year, monthNum] = month.split('-').map(Number);
            const startDate = new Date(year, monthNum - 1, 1);
            
            // Si cutoff_date est fourni, utiliser cette date comme fin, sinon fin du mois
            let endDate;
            
            if (cutoff_date && /^\d{4}-\d{2}-\d{2}$/.test(cutoff_date)) {
                endDate = new Date(cutoff_date + ' 23:59:59');
                endDateStr = cutoff_date + ' 23:59:59';
                console.log(`📅 SERVER: monthly-data avec cutoff_date: ${cutoff_date}`);
            } else {
                endDate = new Date(year, monthNum, 0, 23, 59, 59);
                endDateStr = endDate.toISOString().split('T')[0] + ' 23:59:59';
            }
            
            startDateStr = startDate.toISOString().split('T')[0];
            console.log(`📅 SERVER: monthly-data avec dates calculées: ${startDateStr} à ${endDateStr}`);
        }

        // Définir year et monthNum pour compatibilité avec le code existant
        const [year, monthNum] = month.split('-').map(Number);

        let accountFilter = '';
        let params = [startDateStr, endDateStr];
        
        // Filtrer selon les permissions
        if (userRole === 'directeur') {
            accountFilter = 'AND a.user_id = $3';
            params.push(userId);
        }

        // Récupérer les données ACTUELLES (indépendantes du mois)
        const balanceResult = await pool.query(`
            SELECT 
                COALESCE(SUM(CASE WHEN a.account_type = 'depot' THEN a.current_balance ELSE 0 END), 0) as depot_balance,
                COALESCE(SUM(CASE WHEN a.account_type = 'partenaire' THEN a.current_balance ELSE 0 END), 0) as partner_balance,
                COALESCE(SUM(a.current_balance), 0) as total_balance,
                COALESCE(SUM(a.total_credited), 0) as total_credited_general
            FROM accounts a
            WHERE a.is_active = true ${accountFilter}
        `, userRole === 'directeur' ? [userId] : []);

        // Calculer les dépenses du mois en cours
        const expensesResult = await pool.query(`
            SELECT 
                COALESCE(SUM(e.total), 0) as monthly_spent,
                COALESCE(SUM(CASE WHEN a.total_credited > 0 THEN e.total ELSE 0 END), 0) as spent_with_expenses
            FROM expenses e
            JOIN accounts a ON e.account_id = a.id
            WHERE e.expense_date >= $1 AND e.expense_date <= $2 ${accountFilter}
        `, params);

        // Calculer les dépenses des mois précédents (jusqu'au dernier jour du mois précédent)
        const previousMonthsExpenses = await pool.query(`
            SELECT 
                a.id as account_id,
                a.account_name,
                COALESCE(SUM(e.total), 0) as previous_months_spent
            FROM accounts a
            LEFT JOIN expenses e ON e.account_id = a.id 
                AND e.expense_date <= $1::date - INTERVAL '1 day'
            WHERE a.is_active = true ${accountFilter}
            GROUP BY a.id, a.account_name
            ORDER BY a.account_name
        `, [startDateStr]);

        // Si debug_details est demandé, calculer le détail jour par jour pour Cash Burn
        let monthlyBurnDetails = null;
        if (req.query.debug_details === 'true') {
            const dailyExpensesResult = await pool.query(`
                SELECT 
                    e.expense_date::date as date,
                    COALESCE(SUM(e.total), 0) as amount,
                    COUNT(e.id) as count,
                    STRING_AGG(DISTINCT a.account_name, ', ') as accounts
                FROM expenses e
                JOIN accounts a ON e.account_id = a.id
                WHERE e.expense_date >= $1 AND e.expense_date <= $2 ${accountFilter}
                GROUP BY e.expense_date::date
                ORDER BY e.expense_date::date
            `, params);

            monthlyBurnDetails = {
                startDate: startDateStr,
                endDate: cutoff_date || endDateStr.split(' ')[0],
                totalDays: dailyExpensesResult.rows.length || 0,
                totalAmount: parseInt(expensesResult.rows[0].monthly_spent) || 0,
                dailyBreakdown: dailyExpensesResult.rows.map(row => ({
                    date: row.date.toISOString().split('T')[0],
                    amount: parseInt(row.amount) || 0,
                    count: parseInt(row.count) || 0,
                    accounts: row.accounts || 'Aucun compte'
                }))
            };
        }

        // Calculer les crédits du mois
        const creditsResult = await pool.query(`
            SELECT COALESCE(SUM(ch.amount), 0) as monthly_credits
            FROM credit_history ch
            JOIN accounts a ON ch.account_id = a.id
            WHERE ch.created_at >= $1 AND ch.created_at <= $2 ${accountFilter}
        `, params);


        // Données par compte pour le graphique (avec monthly_credits et monthly_balance)
        const accountDataResult = await pool.query(`
            WITH monthly_credits AS (
                SELECT 
                    account_id,
                    SUM(credit_amount) as monthly_credits
                FROM (
                    -- Crédits réguliers
                    SELECT 
                        ch.account_id,
                        ch.amount as credit_amount
                    FROM credit_history ch
                    JOIN accounts a ON ch.account_id = a.id
                    WHERE ch.created_at >= $1 AND ch.created_at <= $2
                    AND a.account_type NOT IN ('depot', 'partenaire', 'creance')
                    
                    UNION ALL
                    
                    -- Crédits spéciaux : pour les comptes "statut", prendre seulement le dernier du mois
                    SELECT 
                        sch.account_id,
                        CASE 
                            WHEN a.account_type = 'statut' THEN
                                -- Pour les comptes statut, prendre seulement le dernier crédit du mois
                                CASE WHEN sch.created_at = (
                                    SELECT MAX(sch2.created_at) 
                                    FROM special_credit_history sch2 
                                    WHERE sch2.account_id = sch.account_id 
                                    AND sch2.credit_date >= $1 AND sch2.credit_date <= $2
                                ) THEN sch.amount ELSE 0 END
                            ELSE sch.amount
                        END as credit_amount
                    FROM special_credit_history sch
                    JOIN accounts a ON sch.account_id = a.id
                    WHERE sch.credit_date >= $1 AND sch.credit_date <= $2
                    AND a.account_type NOT IN ('depot', 'partenaire', 'creance')
                ) all_credits
                WHERE credit_amount > 0 OR (credit_amount < 0 AND EXISTS (
                    SELECT 1 FROM accounts a2 WHERE a2.id = account_id AND a2.account_type = 'statut'
                ))
                GROUP BY account_id
            ),
            monthly_transfers AS (
                SELECT 
                    a.id as account_id,
                    COALESCE(SUM(CASE 
                        WHEN th.source_id = a.id THEN -th.montant
                        WHEN th.destination_id = a.id THEN th.montant
                        ELSE 0
                    END), 0) as net_transfers
                FROM accounts a
                LEFT JOIN transfer_history th ON (th.source_id = a.id OR th.destination_id = a.id)
                    AND th.created_at >= $1 AND th.created_at <= ($2::date + INTERVAL '1 day')
                GROUP BY a.id
            )
            SELECT 
                a.account_name as account,
                a.account_type,
                COALESCE(SUM(ABS(e.total)), 0) as spent,
                a.current_balance,
                a.total_credited,
                COALESCE(mc.monthly_credits, 0) as monthly_credits,
                COALESCE(mt.net_transfers, 0) as net_transfers,
                COALESCE(mdm.montant, 0) as montant_debut_mois
            FROM accounts a
            LEFT JOIN expenses e ON a.id = e.account_id 
                AND e.expense_date >= $1 AND e.expense_date <= $2
            LEFT JOIN monthly_credits mc ON a.id = mc.account_id
            LEFT JOIN monthly_transfers mt ON a.id = mt.account_id
            LEFT JOIN montant_debut_mois mdm ON a.id = mdm.account_id 
                AND mdm.year = ${year}
                AND mdm.month = ${monthNum}
            WHERE a.is_active = true AND a.account_type NOT IN ('depot', 'partenaire', 'creance') ${accountFilter}
            GROUP BY a.id, a.account_name, a.account_type, a.current_balance, a.total_credited, mc.monthly_credits, mt.net_transfers, mdm.montant
            ORDER BY spent DESC
        `, params);

        // Données par catégorie pour le graphique
        const categoryDataResult = await pool.query(`
            SELECT 
                e.category as category,
                COALESCE(SUM(e.total), 0) as amount
            FROM expenses e
            JOIN accounts a ON e.account_id = a.id
            WHERE e.expense_date >= $1 AND e.expense_date <= $2 ${accountFilter}
            GROUP BY e.category
            ORDER BY amount DESC
        `, params);

        const balance = balanceResult.rows[0];
        const expenses = expensesResult.rows[0];
        const credits = creditsResult.rows[0];

        // Calculer Cash Burn depuis lundi (TOUJOURS semaine en cours, indépendant du mois sélectionné)
        const now = new Date();
        const monday = new Date(now);
        monday.setDate(now.getDate() - now.getDay() + 1);
        const mondayStr = monday.toISOString().split('T')[0];

        const weeklyBurnParams = userRole === 'directeur' ? [mondayStr, userId] : [mondayStr];
        const weeklyBurnResult = await pool.query(`
            SELECT COALESCE(SUM(e.total), 0) as weekly_burn
            FROM expenses e
            JOIN accounts a ON e.account_id = a.id
            WHERE e.expense_date >= $1 ${accountFilter}
        `, weeklyBurnParams);

        // Calculer la somme totale des balances mensuelles
        let totalMonthlyBalance = 0;
        const accountChartData = accountDataResult.rows.map(row => {
            // Calculer monthly_balance pour chaque compte
            const monthlyCredits = parseInt(row.monthly_credits || 0);
            const spent = parseInt(row.spent || 0);
            const netTransfers = parseInt(row.net_transfers || 0);
            const montantDebutMois = parseInt(row.montant_debut_mois || 0);
            
            // Pour les comptes classiques, inclure le montant début de mois dans le calcul
            let monthlyBalance;
            if (row.account_type === 'classique') {
                monthlyBalance = monthlyCredits - spent + netTransfers + montantDebutMois;
                console.log(`🔥 MONTHLY-DATA (classique): ${row.account} - Crédits: ${monthlyCredits}, Dépenses: ${spent}, Transferts: ${netTransfers}, Début mois: ${montantDebutMois}, Balance: ${monthlyBalance}`);
            } else {
                monthlyBalance = monthlyCredits - spent + netTransfers;
                console.log(`🔥 MONTHLY-DATA (standard): ${row.account} - Crédits: ${monthlyCredits}, Dépenses: ${spent}, Transferts: ${netTransfers}, Balance: ${monthlyBalance}`);
            }
            
            // Ajouter à la somme totale
            totalMonthlyBalance += monthlyBalance;
            
            return {
                ...row,
                monthly_credits: monthlyCredits,
                net_transfers: netTransfers,
                montant_debut_mois: montantDebutMois,
                monthly_balance: monthlyBalance
            };
        });

        console.log(`📈 Balance du mois calculée: ${totalMonthlyBalance} FCFA`);

        const responseData = {
            currentBalance: `${parseInt(balance.total_balance).toLocaleString('fr-FR')} FCFA`,
            depotBalance: `${parseInt(balance.depot_balance).toLocaleString('fr-FR')} FCFA`,
            partnerBalance: `${parseInt(balance.partner_balance).toLocaleString('fr-FR')} FCFA`,
            monthlyBurn: `${parseInt(expenses.monthly_spent).toLocaleString('fr-FR')} FCFA`,
            weeklyBurn: `${parseInt(weeklyBurnResult.rows[0].weekly_burn).toLocaleString('fr-FR')} FCFA`,
            totalSpent: `${parseInt(expenses.monthly_spent).toLocaleString('fr-FR')} FCFA`,
            totalRemaining: `${parseInt(balance.total_balance).toLocaleString('fr-FR')} FCFA`,
            totalCreditedWithExpenses: `${parseInt(expenses.spent_with_expenses).toLocaleString('fr-FR')} FCFA`,
            totalCreditedGeneral: `${parseInt(balance.total_credited_general).toLocaleString('fr-FR')} FCFA`,
            monthlyBalanceTotal: totalMonthlyBalance,
            monthlyBalanceTotalFormatted: `${totalMonthlyBalance.toLocaleString('fr-FR')} FCFA`,
            accountChart: accountChartData,
            categoryChart: categoryDataResult.rows,
            monthInfo: {
                month,
                monthName: new Date(year, monthNum - 1).toLocaleDateString('fr-FR', { 
                    month: 'long', 
                    year: 'numeric' 
                })
            }
        };

        // Ajouter les détails de debug si demandés
        if (monthlyBurnDetails) {
            responseData.monthlyBurnDetails = monthlyBurnDetails;
        }

        res.json(responseData);

    } catch (error) {
        console.error('Erreur récupération données mensuelles:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour obtenir les créances totales pour un mois
app.get('/api/dashboard/monthly-creances', requireAuth, async (req, res) => {
    try {
        const { month, cutoff_date } = req.query;
        const userRole = req.session.user.role;
        const userId = req.session.user.id;

        if (!month || !/^\d{4}-\d{2}$/.test(month)) {
            return res.status(400).json({ error: 'Format mois invalide. Utiliser YYYY-MM' });
        }
        
        // Log pour le debugging avec cutoff
        if (cutoff_date) {
            console.log(`📅 SERVER: monthly-creances avec cutoff_date: ${cutoff_date}`);
        }

        let accountFilter = '';
        let params = [];

        if (userRole === 'directeur') {
            accountFilter = 'AND a.user_id = $1';
            params = [userId];
        }

        // Calculer le solde total des créances pour le mois (inclut report + nouvelles opérations)
        const result = await pool.query(`
            SELECT 
                COALESCE(SUM(
                    cc.initial_credit + 
                    COALESCE(credits.total_credits, 0) - 
                    COALESCE(debits.total_debits, 0)
                ), 0) as total_creances
            FROM creance_clients cc
            JOIN accounts a ON cc.account_id = a.id
            LEFT JOIN (
                SELECT client_id, SUM(amount) as total_credits
                FROM creance_operations 
                WHERE operation_type = 'credit'
                GROUP BY client_id
            ) credits ON cc.id = credits.client_id
            LEFT JOIN (
                SELECT client_id, SUM(amount) as total_debits
                FROM creance_operations 
                WHERE operation_type = 'debit'
                GROUP BY client_id
            ) debits ON cc.id = debits.client_id
            WHERE a.account_type = 'creance' 
            AND a.is_active = true 
            AND cc.is_active = true
            ${accountFilter}
        `, params);

        const totalCreances = parseInt(result.rows[0].total_creances) || 0;

        res.json({ 
            total_creances: totalCreances,
            formatted: `${totalCreances.toLocaleString('fr-FR')} FCFA`
        });

    } catch (error) {
        console.error('Erreur récupération créances mensuelles:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour obtenir Cash Bictorys pour un mois spécifique
app.get('/api/dashboard/monthly-cash-bictorys', requireAuth, async (req, res) => {
    try {
        const { month, cutoff_date } = req.query;

        if (!month || !/^\d{4}-\d{2}$/.test(month)) {
            return res.status(400).json({ error: 'Format mois invalide. Utiliser YYYY-MM' });
        }

        let query, params;
        
        if (cutoff_date) {
            // Si une date de cutoff est fournie, chercher le dernier Cash Bictorys <= cutoff_date
            console.log(`💰 SERVER: Récupération Cash Bictorys pour ${month} avec cutoff ${cutoff_date}`);
            
            query = `
                SELECT amount, date
            FROM cash_bictorys
            WHERE date = (
                SELECT MAX(date)
                FROM cash_bictorys
                WHERE amount != 0 
                AND month_year = $1
                    AND date <= $2
            )
            AND amount != 0
            AND month_year = $1
                AND date <= $2
            `;
            params = [month, cutoff_date];
        } else {
            // Requête normale sans cutoff
            query = `
                SELECT amount, date
                FROM cash_bictorys
                WHERE date = (
                    SELECT MAX(date)
                    FROM cash_bictorys
                    WHERE amount != 0 
                    AND month_year = $1
                )
                AND amount != 0
                AND month_year = $1
            `;
            params = [month];
        }

        const result = await pool.query(query, params);

        const latestAmount = result.rows.length > 0 ? parseInt(result.rows[0].amount) || 0 : 0;
        const latestDate = result.rows.length > 0 ? result.rows[0].date : null;

        if (cutoff_date && result.rows.length > 0) {
            console.log(`✅ SERVER: Cash Bictorys trouvé pour cutoff ${cutoff_date}: ${latestAmount} FCFA (date: ${latestDate})`);
        }

        // Si debug_details est demandé, calculer le détail jour par jour pour Cash Bictorys
        let cashBictorysDetails = null;
        if (req.query.debug_details === 'true') {
            // Calculer les dates de début et fin du mois
            const [year, monthNum] = month.split('-').map(Number);
            const startOfMonth = new Date(year, monthNum - 1, 1);
            const endOfMonth = cutoff_date ? new Date(cutoff_date) : new Date(year, monthNum, 0);
            
            const startDateStr = startOfMonth.toISOString().split('T')[0];
            const endDateStr = endOfMonth.toISOString().split('T')[0];
            
            // Récupérer toutes les entrées Cash Bictorys pour la période
            const dailyCashResult = await pool.query(`
                SELECT 
                    date,
                    amount,
                    ROW_NUMBER() OVER (ORDER BY date) as day_number
                FROM cash_bictorys
                WHERE month_year = $1 
                AND date >= $2 
                AND date <= $3
                AND amount != 0
                ORDER BY date
            `, [month, startDateStr, endDateStr]);

            // Calculer l'évolution et les détails
            let previousAmount = 0;
            const dailyBreakdown = dailyCashResult.rows.map((row, index) => {
                const currentAmount = parseInt(row.amount) || 0;
                const evolution = index === 0 ? 'Initial' : 
                    currentAmount > previousAmount ? 'Augmentation' :
                    currentAmount < previousAmount ? 'Diminution' : 'Stable';
                
                const result = {
                    date: row.date.toISOString().split('T')[0],
                    amount: currentAmount,
                    evolution: evolution,
                    note: index === 0 ? 'Première valeur du mois' : 
                          `${evolution} de ${Math.abs(currentAmount - previousAmount).toLocaleString('fr-FR')} FCFA`
                };
                
                previousAmount = currentAmount;
                return result;
            });

            const startAmount = dailyBreakdown.length > 0 ? dailyBreakdown[0].amount : 0;
            const finalAmount = latestAmount;

            cashBictorysDetails = {
                startDate: startDateStr,
                endDate: endDateStr,
                totalDays: dailyBreakdown.length,
                startAmount: startAmount,
                finalAmount: finalAmount,
                dailyBreakdown: dailyBreakdown
            };
        }

        const responseData = {
            latest_amount: latestAmount,
            formatted: `${latestAmount.toLocaleString('fr-FR')} FCFA`,
            month_year: month,
            cutoff_date: cutoff_date || null,
            latest_date: latestDate
        };

        // Ajouter les détails de debug si demandés
        if (cashBictorysDetails) {
            responseData.cashBictorysDetails = cashBictorysDetails;
        }

        res.json(responseData);

    } catch (error) {
        console.error('Erreur récupération Cash Bictorys mensuel:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour obtenir la variation de stock vivant mensuel
app.get('/api/dashboard/stock-vivant-variation', requireAuth, async (req, res) => {
    try {
        const { cutoff_date } = req.query;
        
        if (!cutoff_date || !/^\d{4}-\d{2}-\d{2}$/.test(cutoff_date)) {
            return res.status(400).json({ error: 'Format cutoff_date invalide. Utiliser YYYY-MM-DD' });
        }

        // Utiliser la MÊME logique que dans stats-cards
        const currentDate = new Date(cutoff_date);
        const currentYear = currentDate.getFullYear();
        const currentMonth = currentDate.getMonth() + 1;
        
        let previousYear = currentYear;
        let previousMonth = currentMonth - 1;
        if (previousMonth === 0) {
            previousMonth = 12;
            previousYear = currentYear - 1;
        }
        
        console.log(`🌱 CALCUL ÉCART STOCK VIVANT CARD - Date de référence: ${cutoff_date}`);
        console.log(`🌱 Mois actuel: ${currentYear}-${currentMonth.toString().padStart(2, '0')}`);
        console.log(`🌱 Mois précédent: ${previousYear}-${previousMonth.toString().padStart(2, '0')}`);
        
        // 1. Récupérer le stock de la dernière date disponible AVANT le mois actuel
        let previousStock = 0;
        let previousStockDate = null;
        
        const firstDayOfCurrentMonth = `${currentYear}-${currentMonth.toString().padStart(2, '0')}-01`;
        
        // Chercher la dernière date disponible avant le mois actuel
        const lastDateBeforeCurrentMonth = await pool.query(`
            SELECT MAX(date_stock) as last_date
                FROM stock_vivant 
            WHERE date_stock < $1::date
        `, [firstDayOfCurrentMonth]);
        
        if (lastDateBeforeCurrentMonth.rows[0]?.last_date) {
            // Il y a des données avant le mois actuel, récupérer le stock pour cette date
            const previousStockResult = await pool.query(`
                SELECT SUM(quantite * prix_unitaire * (1 - COALESCE(decote, 0))) as total_stock,
                       MAX(date_stock) as latest_date
                FROM stock_vivant 
                WHERE date_stock = $1
            `, [lastDateBeforeCurrentMonth.rows[0].last_date]);
            
            previousStock = Math.round(previousStockResult.rows[0]?.total_stock || 0);
            previousStockDate = previousStockResult.rows[0]?.latest_date;
            
            console.log(`🌱 CARD Stock mois précédent trouvé (${previousStockDate?.toISOString().split('T')[0]}): ${previousStock.toLocaleString()} FCFA`);
        } else {
            // Aucune donnée avant le mois actuel
            previousStock = 0;
            previousStockDate = null;
            console.log(`🌱 CARD Aucune donnée stock vivant trouvée avant ${firstDayOfCurrentMonth} → Stock précédent = 0 FCFA`);
        }
        
        // 2. Récupérer le stock le plus proche de la date de cutoff (≤ cutoff_date)
        const currentStockQuery = `
            SELECT SUM(quantite * prix_unitaire * (1 - COALESCE(decote, 0))) as total_stock,
                   MAX(date_stock) as latest_date
                FROM stock_vivant 
            WHERE date_stock <= $1::date
            AND date_stock = (
                SELECT MAX(date_stock) 
                FROM stock_vivant 
                WHERE date_stock <= $1::date
            )
        `;
        const currentStockResult = await pool.query(currentStockQuery, [cutoff_date]);
        
        const currentStock = Math.round(currentStockResult.rows[0]?.total_stock || 0);
        const currentStockDate = currentStockResult.rows[0]?.latest_date;
        
        // 3. Calculer l'écart : stock actuel - stock précédent
        let variationTotale = currentStock - previousStock;
        
        console.log(`🌱 Écart Stock Vivant Mensuel CARD: ${variationTotale.toLocaleString()} FCFA`);
        console.log(`   📅 Stock actuel (${currentStockDate?.toISOString().split('T')[0] || 'N/A'}): ${currentStock.toLocaleString()} FCFA`);
        console.log(`   📅 Stock précédent (${previousStockDate?.toISOString().split('T')[0] || 'N/A'}): ${previousStock.toLocaleString()} FCFA`);
        console.log(`   ➡️  Écart: ${currentStock.toLocaleString()} - ${previousStock.toLocaleString()} = ${variationTotale.toLocaleString()} FCFA`);

        // Si debug_details est demandé, créer des détails simplifiés basés sur les vraies données
        let stockVariationDetails = null;
        if (req.query.debug_details === 'true') {
            // Créer des détails basés sur les vraies données calculées
            const monthYear = `${currentYear}-${currentMonth.toString().padStart(2, '0')}`;
            const startDateStr = `${currentYear}-${currentMonth.toString().padStart(2, '0')}-01`;

            stockVariationDetails = {
                startDate: startDateStr,
                endDate: cutoff_date,
                totalDays: 1, // Simplifié
                startStockAmount: previousStock,
                finalStockAmount: currentStock,
                totalVariation: variationTotale,
                dailyBreakdown: [{
                    date: cutoff_date,
                    stockAmount: currentStock,
                    dailyVariation: variationTotale,
                    cumulativeVariation: variationTotale,
                    note: 'Début du mois'
                }]
            };
        }

        const monthYear = `${currentYear}-${currentMonth.toString().padStart(2, '0')}`;
        const responseData = {
            variation_total: variationTotale,
            formatted: `${variationTotale.toLocaleString('fr-FR')} FCFA`,
            month_year: monthYear,
            cutoff_date: cutoff_date,
            currentStock: currentStock,
            previousStock: previousStock,
            currentStockDate: currentStockDate ? currentStockDate.toISOString().split('T')[0] : null,
            previousStockDate: previousStockDate ? previousStockDate.toISOString().split('T')[0] : null,
            details: `Stock actuel (${currentStockDate?.toISOString().split('T')[0] || 'N/A'}): ${currentStock.toLocaleString()} FCFA | Stock précédent (${previousStockDate?.toISOString().split('T')[0] || 'N/A'}): ${previousStock.toLocaleString()} FCFA`
        };

        // Ajouter les détails de debug si demandés
        if (stockVariationDetails) {
            responseData.stockVariationDetails = stockVariationDetails;
        }

        res.json(responseData);

    } catch (error) {
        console.error('Erreur récupération variation stock vivant:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ===== ENDPOINTS DASHBOARD SNAPSHOTS =====

// Créer la table dashboard_snapshots au démarrage
async function createDashboardSnapshotsTable() {
    // FONCTION DÉSACTIVÉE: Tables créées par render_volaille_database_schema.sql
    console.log('ℹ️ Dashboard snapshots table creation SKIPPED - table already exists from SQL script');
    return; // Pas de création de tables
}
// Route pour sauvegarder un snapshot du tableau de bord
app.post('/api/dashboard/save-snapshot', requireAdminAuth, async (req, res) => {
    try {
        // Tous les champs sont optionnels sauf snapshot_date
        const {
            snapshot_date,
            total_spent_amount = 0,
            total_remaining_amount = 0,
            total_credited_with_expenses = 0,
            total_credited_general = 0,
            cash_bictorys_amount = 0,
            creances_total = 0,
            creances_mois = 0,
            stock_point_vente = 0,
            stock_vivant_total = 0,
            stock_vivant_variation = 0,
            daily_burn = 0,
            weekly_burn = 0,
            monthly_burn = 0,
            solde_depot = 0,
            solde_partner = 0,
            solde_general = 0,
            notes = ''
        } = req.body;
        
        if (!snapshot_date) {
            return res.status(400).json({ error: 'Date du snapshot requise' });
        }
        
        // Utiliser directement la date fournie sans conversion de fuseau horaire
        let correctedSnapshotDate = snapshot_date;
        console.log(`📅 Date snapshot reçue: ${snapshot_date} (utilisée directement)`);
        
        // Gérer le nom d'utilisateur (session ou API)
        const username = req.session?.user?.username || req.user?.username || 'API';
        
        // Calculer automatiquement les livraisons partenaires validées du mois
        let livraisons_partenaires = 0;
        try {
            // Utiliser le mois de la date corrigée
            const snapshotDate = new Date(correctedSnapshotDate);
            const year = snapshotDate.getFullYear();
            const month = snapshotDate.getMonth() + 1;
            const firstDayOfMonth = `${year}-${month.toString().padStart(2, '0')}-01`;
            const snapshotDateStr = correctedSnapshotDate;
            
            // Récupérer les livraisons partenaires validées du mois jusqu'à la date du snapshot
            const livraisonsQuery = `
                SELECT COALESCE(SUM(pd.amount), 0) as total_livraisons
                FROM partner_deliveries pd
                JOIN accounts a ON pd.account_id = a.id
                WHERE pd.delivery_date >= $1 
                AND pd.delivery_date <= $2
                AND pd.validation_status = 'fully_validated'
                AND pd.is_validated = true
                AND a.account_type = 'partenaire'
                AND a.is_active = true
            `;

            const livraisonsResult = await pool.query(livraisonsQuery, [firstDayOfMonth, snapshotDateStr]);
            livraisons_partenaires = parseInt(livraisonsResult.rows[0].total_livraisons) || 0;
            
            console.log(`🚚 Livraisons partenaires calculées pour snapshot ${correctedSnapshotDate}: ${livraisons_partenaires} FCFA`);
            
        } catch (error) {
            console.error('Erreur calcul livraisons partenaires pour snapshot:', error);
            livraisons_partenaires = 0;
        }
        
        // Utiliser directement le PL final envoyé par le frontend (valeur du dashboard)
        let pl_final = parseFloat(req.body.pl_final) || 0;
        console.log(`📊 PL final reçu du frontend pour snapshot ${correctedSnapshotDate}: ${pl_final} FCFA`);
        
        // Vérifier si un snapshot existe déjà pour cette date
        const existingCheck = await pool.query(
            'SELECT id, created_by, created_at FROM dashboard_snapshots WHERE snapshot_date = $1',
            [correctedSnapshotDate]
        );
        
        const isUpdate = existingCheck.rows.length > 0;
        const existingSnapshot = isUpdate ? existingCheck.rows[0] : null;
        
        if (isUpdate) {
            console.log(`⚠️  ÉCRASEMENT: Snapshot existant trouvé pour ${correctedSnapshotDate}`);
            console.log(`   Créé par: ${existingSnapshot.created_by}`);
            console.log(`   Créé le: ${existingSnapshot.created_at}`);
        }
        
        // Récupérer virements du mois (peut être envoyé par le frontend ou calculé)
        const virements_mois = req.body.virements_mois || 0;
        console.log(`💸 Virements du mois pour snapshot ${correctedSnapshotDate}: ${virements_mois} FCFA`);
        
        // Préparer les valeurs pour le logging
        const sqlValues = [
            correctedSnapshotDate, total_spent_amount || 0, total_remaining_amount || 0,
            total_credited_with_expenses || 0, total_credited_general || 0,
            cash_bictorys_amount || 0, creances_total || 0, creances_mois || 0,
            stock_point_vente || 0, stock_vivant_total || 0, stock_vivant_variation || 0,
            livraisons_partenaires, virements_mois,
            daily_burn || 0, weekly_burn || 0, monthly_burn || 0,
            solde_depot || 0, solde_partner || 0, solde_general || 0,
            pl_final,
            username, notes || ''
        ];
        
        const sqlQuery = `
            INSERT INTO dashboard_snapshots (
                snapshot_date, total_spent_amount, total_remaining_amount,
                total_credited_with_expenses, total_credited_general,
                cash_bictorys_amount, creances_total, creances_mois,
                stock_point_vente, stock_vivant_total, stock_vivant_variation,
                livraisons_partenaires, virements_mois,
                daily_burn, weekly_burn, monthly_burn,
                solde_depot, solde_partner, solde_general,
                pl_final,
                created_by, notes
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22
            )
            ON CONFLICT (snapshot_date) 
            DO UPDATE SET
                total_spent_amount = EXCLUDED.total_spent_amount,
                total_remaining_amount = EXCLUDED.total_remaining_amount,
                total_credited_with_expenses = EXCLUDED.total_credited_with_expenses,
                total_credited_general = EXCLUDED.total_credited_general,
                cash_bictorys_amount = EXCLUDED.cash_bictorys_amount,
                creances_total = EXCLUDED.creances_total,
                creances_mois = EXCLUDED.creances_mois,
                stock_point_vente = EXCLUDED.stock_point_vente,
                stock_vivant_total = EXCLUDED.stock_vivant_total,
                stock_vivant_variation = EXCLUDED.stock_vivant_variation,
                livraisons_partenaires = EXCLUDED.livraisons_partenaires,
                virements_mois = EXCLUDED.virements_mois,
                daily_burn = EXCLUDED.daily_burn,
                weekly_burn = EXCLUDED.weekly_burn,
                monthly_burn = EXCLUDED.monthly_burn,
                solde_depot = EXCLUDED.solde_depot,
                solde_partner = EXCLUDED.solde_partner,
                solde_general = EXCLUDED.solde_general,
                pl_final = EXCLUDED.pl_final,
                created_by = EXCLUDED.created_by,
                notes = EXCLUDED.notes,
                created_at = CURRENT_TIMESTAMP
            RETURNING id, snapshot_date
        `;
        
        // LOGS SQL DÉTAILLÉS
        console.log('\n🛠️  === LOGS SQL SNAPSHOT DASHBOARD ===');
        console.log('📅 Date:', new Date().toISOString());
        console.log('👤 Utilisateur:', username);
        console.log('📊 Date snapshot:', snapshot_date);
        console.log('\n📝 REQUÊTE SQL:');
        console.log(sqlQuery);
        console.log('\n📋 PARAMÈTRES:');
        console.log('$1 (snapshot_date):', sqlValues[0]);
        console.log('$2 (total_spent_amount):', sqlValues[1]);
        console.log('$3 (total_remaining_amount):', sqlValues[2]);
        console.log('$4 (total_credited_with_expenses):', sqlValues[3]);
        console.log('$5 (total_credited_general):', sqlValues[4]);
        console.log('$6 (cash_bictorys_amount):', sqlValues[5]);
        console.log('$7 (creances_total):', sqlValues[6]);
        console.log('$8 (creances_mois):', sqlValues[7]);
        console.log('$9 (stock_point_vente):', sqlValues[8]);
        console.log('$10 (stock_vivant_total):', sqlValues[9]);
        console.log('$11 (stock_vivant_variation):', sqlValues[10]);
        console.log('$12 (livraisons_partenaires):', sqlValues[11]);
        console.log('$13 (virements_mois):', sqlValues[12]);
        console.log('$14 (daily_burn):', sqlValues[13]);
        console.log('$15 (weekly_burn):', sqlValues[14]);
        console.log('$16 (monthly_burn):', sqlValues[15]);
        console.log('$17 (solde_depot):', sqlValues[16]);
        console.log('$18 (solde_partner):', sqlValues[17]);
        console.log('$19 (solde_general):', sqlValues[18]);
        console.log('$20 (pl_final):', sqlValues[19]);
        console.log('$21 (created_by):', sqlValues[20]);
        console.log('$22 (notes):', sqlValues[21]);
        console.log('\n⏳ Exécution de la requête...');
        
        // Insérer ou mettre à jour le snapshot (UPSERT)
        const result = await pool.query(sqlQuery, sqlValues);
        
        // LOGS RÉSULTAT SQL
        console.log('\n✅ RÉSULTAT SQL:');
        console.log('📊 Rows affected:', result.rowCount);
        console.log('📋 Returned data:', result.rows);
        console.log('🔄 Operation type:', result.rowCount > 0 ? (result.command === 'INSERT' ? 'INSERT' : 'UPDATE') : 'UNKNOWN');
        console.log('🆔 Snapshot ID:', result.rows[0]?.id);
        console.log('📅 Snapshot date confirmée:', result.rows[0]?.snapshot_date);
        console.log('=== FIN LOGS SQL SNAPSHOT ===\n');
        
        console.log(`✅ Snapshot sauvegardé pour ${correctedSnapshotDate} par ${username}`);
        
        // Préparer le message selon le type d'opération
        let message, messageType;
        if (isUpdate) {
            message = `Snapshot du ${correctedSnapshotDate} mis à jour (écrasement de l'ancien)`;
            messageType = 'overwrite';
        } else {
            message = `Nouveau snapshot créé pour le ${correctedSnapshotDate}`;
            messageType = 'create';
        }
        
        res.json({
            success: true,
            message: message,
            messageType: messageType,
            snapshot: result.rows[0],
            wasUpdate: isUpdate,
            previousSnapshot: existingSnapshot ? {
                created_by: existingSnapshot.created_by,
                created_at: existingSnapshot.created_at
            } : null
        });
        
    } catch (error) {
        console.error('❌ Erreur sauvegarde snapshot:', error);
        res.status(500).json({ error: 'Erreur lors de la sauvegarde du snapshot' });
    }
});

// Route pour vérifier l'existence d'un snapshot par date
app.get('/api/dashboard/snapshots/:date', requireAdminAuth, async (req, res) => {
    try {
        const { date } = req.params;
        
        if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return res.status(400).json({ error: 'Format de date invalide. Utiliser YYYY-MM-DD' });
        }
        
        const result = await pool.query(
            'SELECT id, created_by, created_at, notes FROM dashboard_snapshots WHERE snapshot_date = $1',
            [date]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Aucun snapshot trouvé pour cette date' });
        }
        
        res.json(result.rows[0]);
        
    } catch (error) {
        console.error('❌ Erreur vérification snapshot:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route simplifiée pour sauvegarder un snapshot en ne donnant que la date
// Calcule automatiquement toutes les valeurs du dashboard pour cette date
app.post('/api/dashboard/save-snapshot-auto', requireAdminAuth, async (req, res) => {
    try {
        const { snapshot_date, notes } = req.body;
        
        if (!snapshot_date) {
            return res.status(400).json({ error: 'La date du snapshot est requise' });
        }
        
        console.log(`📅 AUTO SNAPSHOT: Création snapshot automatique pour ${snapshot_date}`);
        
        // Créer un objet request simulé pour réutiliser la logique du handler stats-cards
        const mockReq = {
            query: {
                start_date: snapshot_date,
                end_date: snapshot_date,
                cutoff_date: snapshot_date
            },
            session: req.session,
            user: req.user
        };
        
        let stats;
        const mockRes = {
            json: (data) => { stats = data; },
            status: (code) => ({
                json: (data) => { throw new Error(data.error || 'Erreur calcul stats'); }
            })
        };
        
        console.log(`📡 AUTO SNAPSHOT: Appel direct au handler stats-cards`);
        
        // Appeler le handler GET /api/dashboard/stats-cards directement
        // On copie la logique principale ici pour éviter la dépendance circulaire
        try {
            const { start_date, end_date, cutoff_date } = mockReq.query;
            const user = mockReq.session?.user || mockReq.user;
            const isDirector = user?.role === 'directeur';
            const userId = user?.id || null;
            
            const referenceDate = cutoff_date ? new Date(cutoff_date) : new Date();
            const referenceDateStr = cutoff_date || new Date().toISOString().split('T')[0];
            
            // Note: Pour éviter de dupliquer 1000+ lignes de code, nous faisons un appel simplifié
            // Une vraie refactorisation extrairait toute la logique dans une fonction partagée
            // Pour l'instant, nous créons un endpoint interne qui peut être appelé sans HTTP
            
            // Créer une requête interne via le routeur Express plutôt que via HTTP
            const axios = require('axios').create({
                baseURL: `http://localhost:${process.env.PORT || 3000}`,
                headers: {
                    'Cookie': req.headers.cookie || '',
                    'x-api-key': req.headers['x-api-key'] || '',
                    'authorization': req.headers['authorization'] || ''
                },
                timeout: 120000 // 120 secondes (2 minutes) de timeout pour les calculs complexes
            });
            
            const response = await axios.get('/api/dashboard/stats-cards', {
                params: {
                    start_date: snapshot_date,
                    end_date: snapshot_date,
                    cutoff_date: snapshot_date
                }
            });
            
            stats = response.data;
        } catch (error) {
            console.error('❌ Erreur lors du calcul des stats:', error);
            throw new Error('Impossible de récupérer les statistiques');
        }
        
        if (!stats || stats.error) {
            throw new Error('Impossible de récupérer les statistiques');
        }
        
        console.log(`✅ AUTO SNAPSHOT: Stats récupérées, préparation des données`);
        
        // Préparer les données du snapshot
        // Map des propriétés de l'API stats-cards vers le format snapshot
        const details = stats.plCalculationDetails || {};
        const snapshotData = {
            snapshot_date: snapshot_date,
            notes: notes || `Snapshot automatique créé via API le ${new Date().toLocaleString('fr-FR')}`,
            total_spent_amount: stats.totalSpent || 0,
            total_remaining_amount: stats.totalRemaining || 0,
            cash_bictorys_amount: details.cashBictorys || 0,
            creances_total: details.creances || 0,
            creances_mois: details.creances || 0,
            stock_point_vente: details.stockPointVente || 0,
            stock_vivant_total: details.stockVivantVariation || 0,
            stock_vivant_variation: details.stockVivantVariation || 0,
            virements_mois: details.virementsMois || 0,
            daily_burn: 0,
            weekly_burn: 0,
            monthly_burn: details.cashBurn || 0,
            solde_general: stats.totalRemaining || 0,
            solde_depot: stats.totalDepotBalance || 0,
            solde_partner: stats.totalPartnerBalance || 0,
            pl_final: stats.plEstimCharges || 0,
            total_credited_with_expenses: stats.totalCreditedWithExpenses || 0,
            total_credited_general: stats.totalCreditedGeneral || 0
        };
        
        console.log(`📊 AUTO SNAPSHOT: Données préparées:`, snapshotData);
        
        // Faire un appel POST interne à /api/dashboard/save-snapshot
        const saveOptions = {
            hostname: 'localhost',
            port: process.env.PORT || 3000,
            path: '/api/dashboard/save-snapshot',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cookie': req.headers.cookie || '',
                'x-api-key': req.headers['x-api-key'] || '',
                'authorization': req.headers['authorization'] || ''
            }
        };
        
        const savePromise = new Promise((resolve, reject) => {
            const request = http.request(saveOptions, (response) => {
                let data = '';
                response.on('data', (chunk) => { data += chunk; });
                response.on('end', () => {
                    try {
                        const parsedData = JSON.parse(data);
                        
                        // Check if the response status is successful (2xx)
                        if (response.statusCode >= 200 && response.statusCode < 300) {
                            resolve(parsedData);
                        } else {
                            // Non-2xx status code, reject with error details
                            const errorMsg = parsedData.error || parsedData.message || `HTTP ${response.statusCode}`;
                            reject(new Error(`Échec sauvegarde snapshot: ${errorMsg}`));
                        }
                    } catch (e) {
                        reject(new Error('Erreur parsing réponse save: ' + e.message));
                    }
                });
            });
            
            // Add timeout (60 seconds)
            request.setTimeout(60000, () => {
                request.abort();
                reject(new Error('Timeout: La sauvegarde du snapshot a pris trop de temps'));
            });
            
            request.on('error', reject);
            request.write(JSON.stringify(snapshotData));
            request.end();
        });
        
        const result = await savePromise;
        
        console.log(`✅ AUTO SNAPSHOT: Snapshot sauvegardé avec succès`);
        
        res.json({
            success: true,
            message: `Snapshot automatique créé pour ${snapshot_date}`,
            snapshot: result.snapshot,
            auto_calculated: true,
            calculated_data: {
                total_spent_amount: snapshotData.total_spent_amount,
                total_remaining_amount: snapshotData.total_remaining_amount,
                total_credited_with_expenses: snapshotData.total_credited_with_expenses,
                total_credited_general: snapshotData.total_credited_general,
                cash_bictorys_amount: snapshotData.cash_bictorys_amount,
                creances_total: snapshotData.creances_total,
                creances_mois: snapshotData.creances_mois,
                stock_point_vente: snapshotData.stock_point_vente,
                stock_vivant_total: snapshotData.stock_vivant_total,
                stock_vivant_variation: snapshotData.stock_vivant_variation,
                livraisons_partenaires: stats.plCalculationDetails?.livraisonsPartenaires || 0,
                virements_mois: snapshotData.virements_mois,
                daily_burn: snapshotData.daily_burn,
                weekly_burn: snapshotData.weekly_burn,
                monthly_burn: snapshotData.monthly_burn,
                solde_depot: snapshotData.solde_depot,
                solde_partner: snapshotData.solde_partner,
                solde_general: snapshotData.solde_general,
                pl_final: snapshotData.pl_final
            }
        });
        
    } catch (error) {
        console.error('❌ Erreur création snapshot auto:', error);
        res.status(500).json({ error: 'Erreur serveur', details: error.message });
    }
});

// ===== ENDPOINTS VISUALISATION (avec vraies données) =====

// Route pour obtenir les données PL (Profit & Loss) depuis les snapshots sauvegardés
app.get('/api/visualisation/pl-data', requireAdminAuth, async (req, res) => {
    try {
        const { start_date, end_date, period_type = 'daily' } = req.query;
        
        console.log(`🔍 Visualisation PL - Paramètres reçus:`);
        console.log(`   start_date: ${start_date}`);
        console.log(`   end_date: ${end_date}`);
        console.log(`   period_type: ${period_type}`);
        
        if (!start_date || !end_date) {
            return res.status(400).json({ error: 'Les dates de début et fin sont requises' });
        }

        let query, groupBy;
        
        if (period_type === 'weekly') {
            // Grouper par semaine (lundi de chaque semaine) avec calcul correct
            query = `
                SELECT 
                    DATE_TRUNC('week', snapshot_date)::date as period,
                    AVG(cash_bictorys_amount) as cash_bictorys,
                    AVG(creances_mois) as creances,
                    AVG(stock_point_vente) as stock_pv,
                    AVG(stock_vivant_variation) as ecart_stock_vivant,
                    AVG(weekly_burn) as cash_burn_weekly,
                    AVG(monthly_burn) as cash_burn_monthly,
                    AVG(COALESCE(virements_mois, 0)) as virements_mois,
                    AVG(COALESCE(remboursements_mois, 0)) as remboursements_mois
                FROM dashboard_snapshots
                WHERE snapshot_date >= $1 AND snapshot_date <= $2
                GROUP BY DATE_TRUNC('week', snapshot_date)
                ORDER BY period
            `;
        } else {
            // Données journalières avec calcul du prorata correct
            query = `
                SELECT 
                    ds.snapshot_date as period,
                    ds.cash_bictorys_amount as cash_bictorys,
                    ds.creances_mois as creances,
                    ds.stock_point_vente as stock_pv,
                    ds.stock_vivant_variation as ecart_stock_vivant,
                    COALESCE(ds.livraisons_partenaires, 0) as livraisons_partenaires,
                    ds.monthly_burn as cash_burn,
                    ds.monthly_burn as cash_burn_monthly,
                    ds.weekly_burn as cash_burn_weekly,
                    COALESCE(ds.pl_final, 0) as pl_final,
                    COALESCE(ds.virements_mois, 0) as virements_mois,
                    (
                        SELECT COALESCE(SUM(co.amount), 0)
                        FROM creance_operations co
                        JOIN creance_clients cc ON co.client_id = cc.id
                        JOIN accounts a ON cc.account_id = a.id
                        WHERE co.operation_type = 'debit'
                        AND co.operation_date >= DATE_TRUNC('month', ds.snapshot_date)
                        AND co.operation_date <= ds.snapshot_date::date + INTERVAL '1 day' - INTERVAL '1 second'
                        AND a.account_type = 'creance'
                        AND a.is_active = true
                        AND cc.is_active = true
                    ) as remboursements_mois
                FROM dashboard_snapshots ds
                WHERE ds.snapshot_date::date >= $1::date AND ds.snapshot_date::date <= $2::date
                ORDER BY ds.snapshot_date
            `;
        }

        const result = await pool.query(query, [start_date, end_date]);
        
        console.log(`📊 Visualisation PL - Résultat SQL brut:`, result.rows);
        console.log(`📊 Visualisation PL - Nombre de lignes récupérées: ${result.rows.length}`);
        
        // Lire l'estimation des charges fixes depuis le fichier JSON
        let chargesFixesEstimation = 0; // Valeur par défaut (même que dashboard)
        try {
            const configPath = path.join(__dirname, 'financial_settings.json');
            if (fs.existsSync(configPath)) {
                const configData = fs.readFileSync(configPath, 'utf8');
                const financialConfig = JSON.parse(configData);
                chargesFixesEstimation = parseFloat(financialConfig.charges_fixes_estimation) || 0;
            }
        } catch (configError) {
            console.error('Erreur lecture config financière pour visualisation PL:', configError);
            chargesFixesEstimation = 0;
        }
        
        console.log(`📊 Visualisation PL - Charges fixes estimation: ${chargesFixesEstimation} FCFA`);
        console.log(`📊 Visualisation PL - Requête SQL: ${query}`);
        console.log(`📊 Visualisation PL - Paramètres: start_date=${start_date}, end_date=${end_date}`);
        
        const plData = result.rows.map((row, index) => {
            console.log(`📊 Visualisation PL - Traitement ligne ${index + 1}:`, row);
            console.log(`📅 Visualisation PL - Ligne ${index + 1} - row.period brut: "${row.period}" (type: ${typeof row.period})`);
            
            const snapshotDate = new Date(row.period);
            console.log(`📅 Visualisation PL - Ligne ${index + 1} - snapshotDate créé:`, snapshotDate);
            
            const cashBictorys = parseFloat(row.cash_bictorys) || 0;
            const creances = parseFloat(row.creances) || 0;
            const stockPv = parseFloat(row.stock_pv) || 0;
            const ecartStockVivant = parseFloat(row.ecart_stock_vivant) || 0;
            const livraisonsPartenaires = parseFloat(row.livraisons_partenaires) || 0;
            
            // Utiliser le cash burn approprié selon le type de période
            let cashBurn = 0;
            if (period_type === 'weekly') {
                cashBurn = parseFloat(row.cash_burn_weekly) || 0;
            } else {
                // Pour les données journalières, toujours utiliser monthly_burn
                cashBurn = parseFloat(row.cash_burn_monthly) || 0;
            }
            
            // Utiliser directement le PL final sauvegardé dans le snapshot
            const plFinal = parseFloat(row.pl_final) || 0;
            
            // Calculer le prorata des charges fixes pour l'affichage (même logique que dashboard)
            let chargesProrata = 0;
            if (chargesFixesEstimation > 0) {
                const currentDay = snapshotDate.getDate();
                const currentMonth = snapshotDate.getMonth() + 1;
                const currentYear = snapshotDate.getFullYear();
                
                // Calculer le nombre de jours ouvrables écoulés dans le mois (lundi à samedi)
                let joursOuvrablesEcoules = 0;
                for (let day = 1; day <= currentDay; day++) {
                    const date = new Date(currentYear, currentMonth - 1, day);
                    const dayOfWeek = date.getDay(); // 0 = dimanche, 1 = lundi, ..., 6 = samedi
                    if (dayOfWeek !== 0) { // Exclure les dimanches
                        joursOuvrablesEcoules++;
                    }
                }
                
                // Calculer le nombre total de jours ouvrables dans le mois
                const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
                let totalJoursOuvrables = 0;
                for (let day = 1; day <= daysInMonth; day++) {
                    const date = new Date(currentYear, currentMonth - 1, day);
                    const dayOfWeek = date.getDay();
                    if (dayOfWeek !== 0) { // Exclure les dimanches
                        totalJoursOuvrables++;
                    }
                }
                
                // Calculer le prorata
                chargesProrata = (chargesFixesEstimation * joursOuvrablesEcoules) / totalJoursOuvrables;
            }
            
            // Formater la date correctement pour le frontend
            let formattedDate;
            if (row.period instanceof Date) {
                // Utiliser les méthodes locales pour éviter le décalage de fuseau horaire
                const year = row.period.getFullYear();
                const month = String(row.period.getMonth() + 1).padStart(2, '0');
                const day = String(row.period.getDate()).padStart(2, '0');
                formattedDate = `${year}-${month}-${day}`;
            } else if (typeof row.period === 'string') {
                // Si c'est déjà une string, s'assurer qu'elle est au format YYYY-MM-DD
                formattedDate = row.period.split('T')[0];
            } else {
                formattedDate = row.period;
            }
            
            console.log(`📅 Visualisation PL - Ligne ${index + 1} - Date finale formatée: "${formattedDate}"`);
            
            const resultRow = {
                date: formattedDate,
                cash_bictorys: cashBictorys,
                creances: creances,
                stock_pv: stockPv,
                ecart_stock_vivant: ecartStockVivant,
                livraisons_partenaires: livraisonsPartenaires,
                cash_burn: cashBurn,
                charges_estimees: Math.round(chargesProrata),
                virements_mois: Math.round(parseFloat(row.virements_mois) || 0),
                remboursements_mois: Math.round(parseFloat(row.remboursements_mois) || 0),
                pl_final: Math.round(plFinal)
            };
            
            console.log(`📊 Visualisation PL - Ligne ${index + 1} - Résultat final:`, resultRow);
            return resultRow;
        });

        console.log(`✅ Données PL récupérées: ${plData.length} points de ${start_date} à ${end_date}`);

        res.json({
            period_type,
            start_date,
            end_date,
            data: plData
        });

    } catch (error) {
        console.error('Erreur récupération données PL:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour obtenir les données Stock Vivant (vraies données)
app.get('/api/visualisation/stock-vivant-data', requireAdminAuth, async (req, res) => {
    try {
        const { start_date, end_date, period_type = 'daily' } = req.query;
        
        if (!start_date || !end_date) {
            return res.status(400).json({ error: 'Les dates de début et fin sont requises' });
        }

        let groupByClause, selectClause;
        if (period_type === 'weekly') {
            // Grouper par semaine (lundi de chaque semaine)
            selectClause = "date_trunc('week', date_stock)::date as period";
            groupByClause = "date_trunc('week', date_stock)";
        } else {
            // Grouper par jour
            selectClause = "date_stock as period";
            groupByClause = "date_stock";
        }

        const result = await pool.query(`
            SELECT 
                ${selectClause},
                COALESCE(SUM(total), 0) as total_stock_vivant,
                COUNT(*) as nombre_entrees,
                COALESCE(SUM(quantite), 0) as quantite_totale
            FROM stock_vivant
            WHERE date_stock >= $1 AND date_stock <= $2
            GROUP BY ${groupByClause}
            ORDER BY period
        `, [start_date, end_date]);

        // Calculer les variations
        const stockVivantData = result.rows.map((row, index) => {
            const current = parseInt(row.total_stock_vivant);
            const previous = index > 0 ? parseInt(result.rows[index - 1].total_stock_vivant) : 0;
            const variation = current - previous;
            
            return {
                date: row.period instanceof Date ? row.period.toISOString().split('T')[0] : row.period,
                total_stock_vivant: current,
                variation: variation,
                nombre_entrees: parseInt(row.nombre_entrees),
                quantite_totale: parseInt(row.quantite_totale)
            };
        });

        res.json({
            period_type,
            start_date,
            end_date,
            data: stockVivantData
        });

    } catch (error) {
        console.error('Erreur récupération données Stock Vivant:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour obtenir les données Stock Point de Vente (table stock_mata)
app.get('/api/visualisation/stock-pv-data', requireAdminAuth, async (req, res) => {
    try {
        const { start_date, end_date, period_type = 'daily' } = req.query;
        
        if (!start_date || !end_date) {
            return res.status(400).json({ error: 'Les dates de début et fin sont requises' });
        }

        let groupByClause, selectClause;
        if (period_type === 'weekly') {
            // Grouper par semaine (lundi de chaque semaine)
            selectClause = "date_trunc('week', date)::date as period";
            groupByClause = "date_trunc('week', date)";
        } else {
            // Grouper par jour
            selectClause = "date as period";
            groupByClause = "date";
        }

        const result = await pool.query(`
            SELECT 
                ${selectClause},
                COALESCE(SUM(stock_matin + stock_soir), 0) as stock_total,
                COUNT(DISTINCT point_de_vente) as points_vente,
                COUNT(*) as nombre_entrees
            FROM stock_mata
            WHERE date >= $1 AND date <= $2
            GROUP BY ${groupByClause}
            ORDER BY period
        `, [start_date, end_date]);

        // Calculer les variations
        const stockPvData = result.rows.map((row, index) => {
            const current = Math.round(parseFloat(row.stock_total) || 0);
            const previous = index > 0 ? Math.round(parseFloat(result.rows[index - 1].stock_total) || 0) : 0;
            const variation = current - previous;
            
            return {
                date: row.period instanceof Date ? row.period.toISOString().split('T')[0] : row.period,
                stock_point_vente: current,
                variation: variation,
                points_vente: parseInt(row.points_vente),
                nombre_entrees: parseInt(row.nombre_entrees)
            };
        });

        res.json({
            period_type,
            start_date,
            end_date,
            data: stockPvData
        });

    } catch (error) {
        console.error('Erreur récupération données Stock PV:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour obtenir les données de Solde
app.get('/api/visualisation/solde-data', requireAdminAuth, async (req, res) => {
    try {
        const { start_date, end_date, period_type = 'daily' } = req.query;
        
        if (!start_date || !end_date) {
            return res.status(400).json({ error: 'Les dates de début et fin sont requises' });
        }

        // Génération des périodes selon le type
        let periods = [];
        const startDate = new Date(start_date);
        const endDate = new Date(end_date);
        
        if (period_type === 'daily') {
            for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
                periods.push(d.toISOString().split('T')[0]);
            }
        } else if (period_type === 'weekly') {
            let current = new Date(startDate);
            current.setDate(current.getDate() - current.getDay() + 1); // Ajuster au lundi
            
            while (current <= endDate) {
                periods.push(current.toISOString().split('T')[0]);
                current.setDate(current.getDate() + 7);
            }
        }

        const soldeData = [];
        
        for (const period of periods) {
            let periodEnd;
            
            if (period_type === 'daily') {
                periodEnd = period;
            } else {
                // Semaine : dimanche
                const monday = new Date(period);
                const sunday = new Date(monday);
                sunday.setDate(monday.getDate() + 6);
                periodEnd = sunday.toISOString().split('T')[0];
            }

            // Calculer le solde total à la fin de la période
            // Utiliser la même logique que l'API stats-cards (filtrage par account_type)
            const soldeResult = await pool.query(`
                SELECT 
                    COALESCE(SUM(a.current_balance), 0) as solde_total,
                    COUNT(a.id) as comptes_actifs
                FROM accounts a
                WHERE a.is_active = true 
                AND a.account_type NOT IN ('depot', 'partenaire', 'creance')
            `);

            const current = parseInt(soldeResult.rows[0].solde_total) || 0;
            const comptesActifs = parseInt(soldeResult.rows[0].comptes_actifs) || 0;
            
            // Calculer la variation par rapport à la période précédente
            let variation = 0;
            if (soldeData.length > 0) {
                const previous = soldeData[soldeData.length - 1].solde_total;
                variation = current - previous;
            }

            soldeData.push({
                date: period,
                solde_total: current,
                variation: variation,
                comptes_actifs: comptesActifs
            });
        }

        res.json({
            period_type,
            start_date,
            end_date,
            data: soldeData
        });

    } catch (error) {
        console.error('Erreur récupération données Solde:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});
// ===== ENDPOINT AUDIT FLUX =====

// Route pour auditer les flux d'un compte spécifique
app.get('/api/audit/account-flux/:accountId', requireAuth, async (req, res) => {
    try {
        const { accountId } = req.params;
        const { start_date, end_date } = req.query;
        const userRole = req.session.user.role;
        const userId = req.session.user.id;

        console.log(`🔍 AUDIT: Demande d'audit pour compte ID ${accountId}, utilisateur: ${req.session.user.username}`);

        // Vérifier que le compte existe et récupérer ses informations
        let accountFilter = '';
        let accountParams = [accountId];
        
        if (userRole === 'directeur') {
            accountFilter = 'AND a.user_id = $2';
            accountParams.push(userId);
        }

        const accountResult = await pool.query(`
            SELECT 
                a.id,
                a.account_name,
                a.account_type,
                a.current_balance,
                a.total_credited,
                a.total_spent,
                a.transfert_entrants,
                a.transfert_sortants,
                a.is_active,
                u.full_name as user_name,
                u.username
            FROM accounts a
            LEFT JOIN users u ON a.user_id = u.id
            WHERE a.id = $1 AND a.is_active = true ${accountFilter}
        `, accountParams);

        if (accountResult.rows.length === 0) {
            return res.status(404).json({ error: 'Compte non trouvé ou accès non autorisé' });
        }

        const account = accountResult.rows[0];
        console.log(`✅ AUDIT: Compte trouvé: ${account.account_name} (${account.account_type})`);

        // Construire la requête d'audit des flux avec filtre de dates optionnel
        let dateFilter = '';
        let queryParams = [account.account_name];
        
        if (start_date && end_date) {
            dateFilter = 'AND timestamp_tri >= $2 AND timestamp_tri <= $3';
            queryParams.push(start_date + ' 00:00:00', end_date + ' 23:59:59');
            console.log(`🗓️ AUDIT: Période filtrée: ${start_date} à ${end_date}`);
        }

        const auditQuery = `
            SELECT 
                date_operation,
                heure_operation,
                type_operation,
                montant,
                description,
                effectue_par,
                date_creation,
                timestamp_tri
            FROM (
                -- 1. CRÉDITS RÉGULIERS (table credit_history)
                SELECT 
                    ch.created_at::date as date_operation,
                    ch.created_at::time as heure_operation,
                    'CRÉDIT' as type_operation,
                    ch.amount as montant,
                    COALESCE(ch.description, 'Crédit de compte') as description,
                    COALESCE(u.full_name, 'Système') as effectue_par,
                    ch.created_at::date as date_creation,
                    ch.created_at as timestamp_tri
                FROM credit_history ch
                LEFT JOIN users u ON ch.credited_by = u.id
                LEFT JOIN accounts a ON ch.account_id = a.id
                WHERE a.account_name = $1
                
                UNION ALL
                
                -- 2. CRÉDITS SPÉCIAUX (table special_credit_history)
                SELECT 
                    sch.credit_date as date_operation,
                    sch.created_at::time as heure_operation,
                    CASE 
                        WHEN sch.is_balance_override THEN 'CRÉDIT STATUT'
                        ELSE 'CRÉDIT SPÉCIAL'
                    END as type_operation,
                    sch.amount as montant,
                    COALESCE(sch.comment, 'Crédit spécial') as description,
                    COALESCE(u.full_name, 'Système') as effectue_par,
                    sch.created_at::date as date_creation,
                    sch.created_at as timestamp_tri
                FROM special_credit_history sch
                LEFT JOIN users u ON sch.credited_by = u.id
                LEFT JOIN accounts a ON sch.account_id = a.id
                WHERE a.account_name = $1
                
                UNION ALL
                
                -- 3. DÉPENSES (table expenses)
                SELECT 
                    e.expense_date as date_operation,
                    e.created_at::time as heure_operation,
                    'DÉPENSE' as type_operation,
                    -e.total as montant, -- Négatif pour les dépenses
                    COALESCE(e.designation, e.description, 'Dépense') as description,
                    COALESCE(u.full_name, 'Système') as effectue_par,
                    e.created_at::date as date_creation,
                    e.created_at as timestamp_tri
                FROM expenses e
                LEFT JOIN users u ON e.user_id = u.id
                LEFT JOIN accounts a ON e.account_id = a.id
                WHERE a.account_name = $1
                
                UNION ALL
                
                -- 4. TRANSFERTS SORTANTS (table transfer_history)
                SELECT 
                    th.created_at::date as date_operation,
                    th.created_at::time as heure_operation,
                    'TRANSFERT SORTANT' as type_operation,
                    -th.montant as montant, -- Négatif pour les sorties
                    CONCAT('Transfert vers ', dest.account_name) as description,
                    COALESCE(u.full_name, 'Système') as effectue_par,
                    th.created_at::date as date_creation,
                    th.created_at as timestamp_tri
                FROM transfer_history th
                LEFT JOIN accounts source ON th.source_id = source.id
                LEFT JOIN accounts dest ON th.destination_id = dest.id
                LEFT JOIN users u ON th.transferred_by = u.id
                WHERE source.account_name = $1
                
                UNION ALL
                
                -- 5. TRANSFERTS ENTRANTS (table transfer_history)
                SELECT 
                    th.created_at::date as date_operation,
                    th.created_at::time as heure_operation,
                    'TRANSFERT ENTRANT' as type_operation,
                    th.montant as montant, -- Positif pour les entrées
                    CONCAT('Transfert depuis ', source.account_name) as description,
                    COALESCE(u.full_name, 'Système') as effectue_par,
                    th.created_at::date as date_creation,
                    th.created_at as timestamp_tri
                FROM transfer_history th
                LEFT JOIN accounts source ON th.source_id = source.id
                LEFT JOIN accounts dest ON th.destination_id = dest.id
                LEFT JOIN users u ON th.transferred_by = u.id
                WHERE dest.account_name = $1
                
                UNION ALL
                
                -- 6. OPÉRATIONS CRÉANCE (si le compte est de type créance)
                SELECT 
                    co.operation_date as date_operation,
                    co.created_at::time as heure_operation,
                    CASE 
                        WHEN co.operation_type = 'credit' THEN 'CRÉDIT CRÉANCE'
                        WHEN co.operation_type = 'debit' THEN 'DÉBIT CRÉANCE'
                    END as type_operation,
                    CASE 
                        WHEN co.operation_type = 'credit' THEN co.amount
                        WHEN co.operation_type = 'debit' THEN -co.amount
                    END as montant,
                    COALESCE(co.description, cc.client_name) as description,
                    COALESCE(u.full_name, 'Système') as effectue_par,
                    co.created_at::date as date_creation,
                    co.created_at as timestamp_tri
                FROM creance_operations co
                LEFT JOIN creance_clients cc ON co.client_id = cc.id
                LEFT JOIN users u ON co.created_by = u.id
                LEFT JOIN accounts a ON cc.account_id = a.id
                WHERE a.account_name = $1
                
                -- 7. MONTANT DÉBUT DE MOIS - IGNORÉ POUR AUDIT FLUX
                -- (Commenté car l'utilisateur a demandé d'ignorer montant_debut_mois pour l'audit)
                
            ) mouvements
            WHERE 1=1 ${dateFilter}
            ORDER BY timestamp_tri DESC
        `;

        console.log(`🔍 AUDIT: Exécution de la requête avec ${queryParams.length} paramètres`);
        const movementsResult = await pool.query(auditQuery, queryParams);
        const movements = movementsResult.rows;
        


        // Calculer les statistiques
        let totalCredits = 0;
        let totalDebits = 0;
        
        movements.forEach(movement => {
            const montant = parseFloat(movement.montant) || 0;
            if (montant > 0) {
                totalCredits += montant;
            } else {
                totalDebits += Math.abs(montant);
            }
        });

        const netBalance = totalCredits - totalDebits;

        console.log(`📊 AUDIT: ${movements.length} mouvements trouvés pour ${account.account_name}`);
        console.log(`💰 AUDIT: Total crédits: ${totalCredits}, Total débits: ${totalDebits}, Solde net: ${netBalance}`);

        // Récupérer les ajustements du mois courant
        const currentMonth = new Date().getMonth() + 1;
        const currentYear = new Date().getFullYear();
        
        const adjustmentResult = await pool.query(`
            SELECT COALESCE(SUM(mdm.montant), 0) as current_month_adjustment
            FROM montant_debut_mois mdm
            WHERE mdm.account_id = $1 
              AND mdm.year = $2 
              AND mdm.month = $3
        `, [account.id, currentYear, currentMonth]);
        
        const currentMonthAdjustment = parseFloat(adjustmentResult.rows[0]?.current_month_adjustment) || 0;

        res.json({
            account: {
                id: account.id,
                name: account.account_name,
                type: account.account_type,
                current_balance: parseInt(account.current_balance) || 0,
                total_credited: parseInt(account.total_credited) || 0,
                total_spent: parseInt(account.total_spent) || 0,
                transfert_entrants: parseFloat(account.transfert_entrants) || 0,
                transfert_sortants: parseFloat(account.transfert_sortants) || 0,
                current_month_adjustment: currentMonthAdjustment,
                user_name: account.user_name,
                username: account.username
            },
            audit_period: {
                start_date: start_date || 'Depuis le début',
                end_date: end_date || 'Jusqu\'à maintenant',
                filtered: !!(start_date && end_date)
            },
            statistics: {
                total_operations: movements.length,
                total_credits: totalCredits,
                total_debits: totalDebits,
                net_balance: netBalance
            },
            movements: movements.map(movement => ({
                date: movement.date_operation instanceof Date ? 
                      movement.date_operation.toISOString().split('T')[0] : 
                      movement.date_operation,
                time: movement.heure_operation,
                type: movement.type_operation,
                amount: parseFloat(movement.montant) || 0,
                description: movement.description,
                created_by: movement.effectue_par,
                date_creation: movement.date_creation instanceof Date ? 
                               movement.date_creation.toISOString().split('T')[0] : 
                               movement.date_creation,
                timestamp: movement.timestamp_tri
            })),
            sql_query: auditQuery,
            sql_params: queryParams
        });

    } catch (error) {
        console.error('❌ AUDIT: Erreur lors de l\'audit des flux:', error);
        res.status(500).json({ error: 'Erreur serveur lors de l\'audit' });
    }
});

// =====================================================
// EXTERNAL API FOR CREANCE PORTFOLIOS
// =====================================================

// Endpoint pour récupérer les opérations créance/remboursement par plage de dates
app.get('/external/api/creance/operations', requireAdminAuth, async (req, res) => {
    console.log('🌐 EXTERNAL: Appel API créance/operations avec params:', req.query);

    const { date_debut, date_fin } = req.query;

    if (!date_debut || !date_fin) {
        return res.status(400).json({ error: 'Les paramètres date_debut et date_fin sont requis (format YYYY-MM-DD).' });
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date_debut) || !dateRegex.test(date_fin)) {
        return res.status(400).json({ error: 'Format de date invalide. Utilisez YYYY-MM-DD.' });
    }

    try {
        const result = await pool.query(`
            SELECT
                co.id,
                co.operation_date AS date_operation,
                co.operation_type AS type_operation,
                co.amount AS montant,
                co.description,
                cc.client_name AS client,
                a.account_name AS portfolio,
                u.full_name AS cree_par,
                co.created_at
            FROM creance_operations co
            JOIN creance_clients cc ON co.client_id = cc.id
            LEFT JOIN accounts a ON co.account_id = a.id
            LEFT JOIN users u ON co.created_by = u.id
            WHERE co.operation_date >= $1
              AND co.operation_date <= $2
              AND co.operation_type IN ('credit', 'debit')
            ORDER BY co.operation_date, co.created_at
        `, [date_debut, date_fin]);

        return res.json({
            success: true,
            period: { date_debut, date_fin },
            total: result.rows.length,
            operations: result.rows,
            metadata: {
                generated_at: new Date().toISOString(),
                api_version: '1.0'
            }
        });
    } catch (error) {
        console.error('❌ EXTERNAL créance/operations error:', error);
        return res.status(500).json({ error: 'Erreur serveur', details: process.env.NODE_ENV !== 'production' ? error.message : undefined });
    }
});

// Endpoint pour l'API externe des créances avec intégration OpenAI
app.get('/external/api/creance', requireAdminAuth, async (req, res) => {
    console.log('🌐 EXTERNAL: Appel API créance avec params:', req.query);
    
    try {
        // Vérifier la présence de la clé OpenAI
        const openaiApiKey = process.env.OPENAI_API_KEY;
        if (!openaiApiKey) {
            console.log('⚠️ EXTERNAL: OPENAI_API_KEY manquante dans les variables d\'environnement');
            return res.status(500).json({ 
                error: 'Configuration OpenAI manquante',
                code: 'OPENAI_CONFIG_MISSING'
            });
        }

        // Déterminer la date sélectionnée (today par défaut)
        const selectedDate = req.query.date ? new Date(req.query.date) : new Date();
        const previousDate = new Date(selectedDate);
        previousDate.setDate(previousDate.getDate() - 1);

        // Formater les dates pour les requêtes SQL
        const selectedDateStr = selectedDate.toISOString().split('T')[0];
        const previousDateStr = previousDate.toISOString().split('T')[0];
        
        console.log(`📅 EXTERNAL: Dates calculées - Sélectionnée: ${selectedDateStr}, Précédente: ${previousDateStr}`);

        // ===== PARTIE 1: SUMMARY - Différence des soldes finaux =====
        
        // Récupérer tous les portfolios de type créance
        const portfoliosQuery = `
            SELECT DISTINCT a.id, a.account_name, a.user_id, u.full_name as assigned_director_name
            FROM accounts a 
            LEFT JOIN users u ON a.user_id = u.id 
            WHERE a.account_type = 'creance' AND a.is_active = true 
            ORDER BY a.account_name
        `;
        
        const portfoliosResult = await pool.query(portfoliosQuery);
        const portfolios = portfoliosResult.rows;
        
        if (portfolios.length === 0) {
            return res.json({
                summary: { message: "Aucun portfolio de type créance trouvé" },
                details: []
            });
        }

        console.log(`📊 EXTERNAL: ${portfolios.length} portfolios créance trouvés`);

        // Calculer les soldes finaux pour chaque portfolio aux deux dates
        const summaryData = [];
        
        for (const portfolio of portfolios) {
            // Solde à la date sélectionnée (même logique que l'interface web)
            const currentBalanceQuery = `
                SELECT 
                    COALESCE(SUM(
                        cc.initial_credit + 
                        COALESCE(credits.total_credits, 0) - 
                        COALESCE(debits.total_debits, 0)
                    ), 0) as solde_final
                FROM creance_clients cc
                LEFT JOIN (
                    SELECT client_id, SUM(amount) as total_credits
                    FROM creance_operations 
                    WHERE operation_type = 'credit' 
                    AND operation_date <= $2
                    GROUP BY client_id
                ) credits ON cc.id = credits.client_id
                LEFT JOIN (
                    SELECT client_id, SUM(amount) as total_debits
                    FROM creance_operations 
                    WHERE operation_type = 'debit' 
                    AND operation_date <= $2
                    GROUP BY client_id
                ) debits ON cc.id = debits.client_id
                WHERE cc.account_id = $1 
                AND cc.is_active = true
            `;
            
            // Solde à la date précédente (même logique que l'interface web)
            const previousBalanceQuery = `
                SELECT 
                    COALESCE(SUM(
                        cc.initial_credit + 
                        COALESCE(credits.total_credits, 0) - 
                        COALESCE(debits.total_debits, 0)
                    ), 0) as solde_final
                FROM creance_clients cc
                LEFT JOIN (
                    SELECT client_id, SUM(amount) as total_credits
                    FROM creance_operations 
                    WHERE operation_type = 'credit' 
                    AND operation_date <= $2
                    GROUP BY client_id
                ) credits ON cc.id = credits.client_id
                LEFT JOIN (
                    SELECT client_id, SUM(amount) as total_debits
                    FROM creance_operations 
                    WHERE operation_type = 'debit' 
                    AND operation_date <= $2
                    GROUP BY client_id
                ) debits ON cc.id = debits.client_id
                WHERE cc.account_id = $1 
                AND cc.is_active = true
            `;

            const [currentResult, previousResult] = await Promise.all([
                pool.query(currentBalanceQuery, [portfolio.id, selectedDateStr]),
                pool.query(previousBalanceQuery, [portfolio.id, previousDateStr])
            ]);

            const currentBalance = parseFloat(currentResult.rows[0]?.solde_final || 0);
            const previousBalance = parseFloat(previousResult.rows[0]?.solde_final || 0);
            const difference = currentBalance - previousBalance;

            summaryData.push({
                portfolio_name: portfolio.account_name,
                portfolio_id: portfolio.id,
                assigned_director: portfolio.assigned_director_name,
                current_balance: currentBalance,
                previous_balance: previousBalance,
                difference: difference
            });
        }

        // ===== PARTIE 2: DETAILS - Status et Opérations par portfolio =====
        
        const detailsData = [];
        
        for (const portfolio of portfolios) {
            console.log(`🔍 EXTERNAL: Traitement portfolio ${portfolio.account_name} (ID: ${portfolio.id})`);
            
            // STATUS: Information sur les clients (même logique que l'interface web)
            const clientsStatusQuery = `
                SELECT 
                    cc.id,
                    cc.client_name,
                    cc.initial_credit as credit_initial,
                    COALESCE(credits.total_credits, 0) as total_avances,
                    COALESCE(debits.total_debits, 0) as total_remboursements,
                    (cc.initial_credit + COALESCE(credits.total_credits, 0) - COALESCE(debits.total_debits, 0)) as solde_final
                FROM creance_clients cc
                LEFT JOIN (
                    SELECT client_id, SUM(amount) as total_credits
                    FROM creance_operations 
                    WHERE operation_type = 'credit' 
                    AND operation_date <= $2
                    GROUP BY client_id
                ) credits ON cc.id = credits.client_id
                LEFT JOIN (
                    SELECT client_id, SUM(amount) as total_debits
                    FROM creance_operations 
                    WHERE operation_type = 'debit' 
                    AND operation_date <= $2
                    GROUP BY client_id
                ) debits ON cc.id = debits.client_id
                WHERE cc.account_id = $1 
                AND cc.is_active = true
                ORDER BY cc.client_name
            `;

            // OPERATIONS: Historique des opérations de l'année courante jusqu'à la date sélectionnée
            const currentYear = selectedDate.getFullYear();
            const yearStartDate = `${currentYear}-01-01`;
            
            const operationsQuery = `
                SELECT 
                    co.operation_date as date_operation,
                    co.created_at as timestamp,
                    cc.client_name as client,
                    co.operation_type as type,
                    co.amount as montant,
                    co.description,
                    u.full_name as created_by
                FROM creance_operations co
                JOIN creance_clients cc ON co.client_id = cc.id
                LEFT JOIN users u ON co.created_by = u.id
                WHERE cc.account_id = $1
                AND co.operation_date >= $2
                AND co.operation_date <= $3
                ORDER BY co.operation_date DESC, co.created_at DESC
            `;

            const [statusResult, operationsResult] = await Promise.all([
                pool.query(clientsStatusQuery, [portfolio.id, selectedDateStr]),
                pool.query(operationsQuery, [portfolio.id, yearStartDate, selectedDateStr])
            ]);

            const clientsStatus = statusResult.rows.map(client => ({
                client_name: client.client_name,
                credit_initial: parseFloat(client.credit_initial || 0),
                total_avances: parseFloat(client.total_avances || 0),
                total_remboursements: parseFloat(client.total_remboursements || 0),
                solde_final: parseFloat(client.solde_final || 0),
                telephone: '',
                adresse: ''
            }));

            const operations = operationsResult.rows.map(op => ({
                date_operation: op.date_operation instanceof Date ? 
                               op.date_operation.toISOString().split('T')[0] : 
                               op.date_operation,
                timestamp: op.timestamp,
                client: op.client,
                type: op.type === 'credit' ? 'avance' : op.type === 'debit' ? 'remboursement' : op.type,
                montant: parseFloat(op.montant || 0),
                description: op.description || '',
                created_by: op.created_by || ''
            }));

            detailsData.push({
                portfolio_name: portfolio.account_name,
                portfolio_id: portfolio.id,
                assigned_director: portfolio.assigned_director_name,
                status: clientsStatus,
                operations: operations
            });
        }

        // ===== INTÉGRATION OPENAI =====
        
        let openaiInsights = null;
        try {
            const openai = new OpenAI({
                apiKey: openaiApiKey,
            });

            // Préparer un résumé des données pour OpenAI
            const summaryForAI = {
                date_selected: selectedDateStr,
                date_previous: previousDateStr,
                portfolios_count: portfolios.length,
                total_current_balance: summaryData.reduce((sum, p) => sum + p.current_balance, 0),
                total_previous_balance: summaryData.reduce((sum, p) => sum + p.previous_balance, 0),
                total_difference: summaryData.reduce((sum, p) => sum + p.difference, 0),
                portfolios_summary: summaryData.map(p => ({
                    name: p.portfolio_name,
                    difference: p.difference,
                    current_balance: p.current_balance
                })),
                total_clients: detailsData.reduce((sum, d) => sum + d.status.length, 0),
                total_operations: detailsData.reduce((sum, d) => sum + d.operations.length, 0)
            };

            const prompt = `En tant qu'analyste financier expert en créances, analysez ces données de portfolios de créance:

Date d'analyse: ${selectedDateStr} (comparé à ${previousDateStr})
Nombre de portfolios: ${summaryForAI.portfolios_count}
Solde total actuel: ${summaryForAI.total_current_balance} FCFA
Solde total précédent: ${summaryForAI.total_previous_balance} FCFA
Différence totale: ${summaryForAI.total_difference} FCFA
Nombre total de clients: ${summaryForAI.total_clients}
Nombre total d'opérations: ${summaryForAI.total_operations}

Détail par portfolio:
${summaryForAI.portfolios_summary.map(p => 
    `- ${p.name}: ${p.current_balance} FCFA (différence: ${p.difference} FCFA)`
).join('\n')}

Fournissez une analyse concise (maximum 200 mots) couvrant:
1. Tendance générale des créances
2. Portfolios performants vs préoccupants
3. Recommandations stratégiques
4. Points d'attention pour la gestion

Répondez en français de manière professionnelle.`;

            const completion = await openai.chat.completions.create({
                model: "gpt-3.5-turbo",
                messages: [
                    {
                        role: "system",
                        content: "Vous êtes un analyste financier expert spécialisé dans la gestion des créances et des portfolios financiers."
                    },
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                max_tokens: 300,
                temperature: 0.7,
            });

            openaiInsights = {
                analysis: completion.choices[0]?.message?.content || "Analyse non disponible",
                model_used: "gpt-3.5-turbo",
                generated_at: new Date().toISOString(),
                tokens_used: completion.usage?.total_tokens || 0
            };

            console.log(`🤖 EXTERNAL: Analyse OpenAI générée avec ${openaiInsights.tokens_used} tokens`);

        } catch (openaiError) {
            console.error('❌ EXTERNAL: Erreur OpenAI:', openaiError.message);
            openaiInsights = {
                error: "Analyse automatique temporairement indisponible",
                error_details: process.env.NODE_ENV === 'development' ? openaiError.message : undefined,
                generated_at: new Date().toISOString()
            };
        }

        // ===== RÉPONSE FINALE =====
        
        const response = {
            summary: {
                date_selected: selectedDateStr,
                date_previous: previousDateStr,
                portfolios_count: portfolios.length,
                portfolios: summaryData,
                totals: {
                    current_balance: summaryData.reduce((sum, p) => sum + p.current_balance, 0),
                    previous_balance: summaryData.reduce((sum, p) => sum + p.previous_balance, 0),
                    total_difference: summaryData.reduce((sum, p) => sum + p.difference, 0)
                }
            },
            details: detailsData,
            ai_insights: openaiInsights,
            metadata: {
                generated_at: new Date().toISOString(),
                openai_integration: openaiInsights?.error ? "error" : "success",
                api_version: "1.0",
                year_filter: selectedDate.getFullYear(),
                total_clients: detailsData.reduce((sum, d) => sum + d.status.length, 0),
                total_operations: detailsData.reduce((sum, d) => sum + d.operations.length, 0)
            }
        };

        console.log(`✅ EXTERNAL: Réponse générée avec ${portfolios.length} portfolios et analyse IA`);
        res.json(response);

    } catch (error) {
        console.error('❌ EXTERNAL: Erreur lors de la génération de l\'API créance:', error);
        res.status(500).json({ 
            error: 'Erreur serveur lors de la génération des données créance',
            code: 'CREANCE_API_ERROR',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// =====================================================
// EXTERNAL API FOR VIREMENT (DAILY TRANSFERS)
// =====================================================

// Endpoint pour l'API externe des virements par client
app.get('/external/api/virement', requireAdminAuth, async (req, res) => {
    console.log('🌐 EXTERNAL: Appel API virement avec params:', req.query);
    
    try {
        // Récupérer les paramètres de date
        const { startDate, endDate } = req.query;
        
        // Valider que les dates sont fournies
        if (!startDate || !endDate) {
            return res.status(400).json({ 
                error: 'Les paramètres startDate et endDate sont requis',
                code: 'MISSING_PARAMETERS',
                format: 'YYYY-MM-DD'
            });
        }

        // Valider le format des dates (YYYY-MM-DD)
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
            return res.status(400).json({ 
                error: 'Format de date invalide. Utiliser YYYY-MM-DD',
                code: 'INVALID_DATE_FORMAT'
            });
        }

        // Convertir en objets Date pour validation (forcer minuit local, éviter les décalages TZ)
        const start = new Date(`${startDate}T00:00:00`);
        const end = new Date(`${endDate}T00:00:00`);
        
        // Vérifier que les dates sont valides
        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            return res.status(400).json({ 
                error: 'Dates invalides',
                code: 'INVALID_DATES'
            });
        }

        // Vérifier que startDate <= endDate
        if (start > end) {
            return res.status(400).json({ 
                error: 'startDate doit être antérieure ou égale à endDate',
                code: 'INVALID_DATE_RANGE'
            });
        }

        console.log(`📅 EXTERNAL: Période demandée - Du ${startDate} au ${endDate}`);

        // Charger le mapping client -> point de vente
        let virementMapping = {};
        let exclusionList = [];
        try {
            const mappingPath = path.join(__dirname, 'virementMapping.json');
            if (fs.existsSync(mappingPath)) {
                const mappingData = fs.readFileSync(mappingPath, 'utf8');
                const fullMapping = JSON.parse(mappingData);
                
                // Extraire la liste d'exclusion
                exclusionList = fullMapping.virementPointDeVenteInterneToExclude || [];
                
                // Retirer la liste d'exclusion du mapping pour ne garder que les mappings client -> point de vente
                virementMapping = { ...fullMapping };
                delete virementMapping.virementPointDeVenteInterneToExclude;
                
                console.log('📋 EXTERNAL: Mapping virement chargé:', Object.keys(virementMapping).length, 'mappings');
                console.log('🚫 EXTERNAL: Points de vente à exclure:', exclusionList);
            } else {
                console.log('⚠️ EXTERNAL: Fichier virementMapping.json non trouvé, mapping vide');
            }
        } catch (error) {
            console.error('❌ EXTERNAL: Erreur chargement mapping virement:', error);
            // Continue sans mapping en cas d'erreur
        }

        // Récupérer les virements groupés par client pour la période
        const virementsQuery = `
            SELECT 
                client,
                SUM(valeur) as total_virement,
                COUNT(*) as nombre_virements,
                MIN(date) as premiere_date,
                MAX(date) as derniere_date
            FROM virement_mensuel
            WHERE date >= $1 AND date <= $2
            GROUP BY client
            ORDER BY total_virement DESC
        `;

        const result = await pool.query(virementsQuery, [startDate, endDate]);
        
        // Mapper les résultats avec le pointDevente
        let virementsParClient = result.rows.map(row => {
            const clientName = row.client;
            const pointDevente = virementMapping[clientName] || null;
            
            return {
                client: clientName,
                pointDevente: pointDevente,
                total_virement: parseInt(row.total_virement) || 0,
                nombre_virements: parseInt(row.nombre_virements) || 0,
                premiere_date: row.premiere_date,
                derniere_date: row.derniere_date,
                formatted_total: `${parseInt(row.total_virement).toLocaleString('fr-FR')} FCFA`
            };
        });

        // Filtrer les virements dont le nom de client (clé) est dans la liste d'exclusion
        virementsParClient = virementsParClient.filter(v => {
            if (exclusionList.includes(v.client)) {
                console.log(`🚫 EXTERNAL: Exclusion de ${v.client}`);
                return false;
            }
            return true;
        });

        // Calculer le total général après filtrage
        const totalGeneral = virementsParClient.reduce((sum, v) => sum + v.total_virement, 0);

        console.log(`✅ EXTERNAL: ${virementsParClient.length} clients trouvés, total général: ${totalGeneral.toLocaleString('fr-FR')} FCFA`);

        // Construire la réponse
        const response = {
            period: {
                start_date: startDate,
                end_date: endDate,
                days_count: Math.floor((end - start) / (1000 * 60 * 60 * 24)) + 1
            },
            summary: {
                total_clients: virementsParClient.length,
                total_virements_count: virementsParClient.reduce((sum, v) => sum + v.nombre_virements, 0),
                total_amount: totalGeneral,
                formatted_total: `${totalGeneral.toLocaleString('fr-FR')} FCFA`
            },
            virements_par_client: virementsParClient,
            metadata: {
                generated_at: new Date().toISOString(),
                api_version: "1.0"
            }
        };

        res.json(response);

    } catch (error) {
        console.error('❌ EXTERNAL: Erreur lors de la génération de l\'API virement:', error);
        res.status(500).json({ 
            error: 'Erreur serveur lors de la génération des données virement',
            code: 'VIREMENT_API_ERROR',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Endpoint externe pour les données virement-mensuel par plage de dates
app.get('/external/api/virement-mensuel', requireAdminAuth, async (req, res) => {
    console.log('🌐 EXTERNAL: Appel API virement-mensuel avec params:', req.query);

    const { date_debut, date_fin } = req.query;

    if (!date_debut || !date_fin) {
        return res.status(400).json({ error: 'Les paramètres date_debut et date_fin sont requis (format YYYY-MM-DD).' });
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date_debut) || !dateRegex.test(date_fin)) {
        return res.status(400).json({ error: 'Format de date invalide. Utilisez YYYY-MM-DD.' });
    }

    if (date_debut > date_fin) {
        return res.status(400).json({ error: 'date_debut doit être antérieure ou égale à date_fin.' });
    }

    try {
        const result = await pool.query(`
            SELECT
                TO_CHAR(date, 'YYYY-MM-DD') AS date,
                valeur,
                client,
                month_year
            FROM virement_mensuel
            WHERE date >= $1 AND date <= $2
            ORDER BY date, client
        `, [date_debut, date_fin]);

        return res.json({
            success: true,
            period: { date_debut, date_fin },
            total: result.rows.length,
            operations: result.rows,
            metadata: {
                generated_at: new Date().toISOString(),
                api_version: '1.0'
            }
        });
    } catch (error) {
        console.error('❌ EXTERNAL virement-mensuel error:', error);
        return res.status(500).json({ error: 'Erreur serveur', details: process.env.NODE_ENV !== 'production' ? error.message : undefined });
    }
});

// ===== ENDPOINTS AUDIT DE COHÉRENCE =====

// ROUTE SUPPRIMÉE - Dupliquée plus bas avec la nouvelle logique

// ====== FIN ROUTES SYNCHRONISATION ======

// ====== ROUTES DE DÉTECTION ET CORRECTION D'INCOHÉRENCES ======

// ====== ROUTES DE SYNCHRONISATION SÉLECTIVE ======

// Route pour récupérer la liste de tous les comptes
app.get('/api/admin/accounts-list', requireSuperAdminOnly, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                id, 
                account_name, 
                account_type,
                current_balance
            FROM accounts 
            ORDER BY account_name
        `);
        
        res.json({
            success: true,
            accounts: result.rows
        });
        
    } catch (error) {
        console.error('❌ Erreur récupération comptes:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la récupération des comptes',
            error: error.message
        });
    }
});

// Route pour synchroniser tous les comptes
app.post('/api/admin/force-sync-all-accounts', requireSuperAdminOnly, async (req, res) => {
    try {
        console.log('🔄 Synchronisation TOUS les comptes par:', req.user.username);
        
        const result = await pool.query('SELECT force_sync_all_accounts_simple()');
        const syncData = result.rows[0].force_sync_all_accounts_simple;
        
        console.log(`✅ Synchronisation terminée: ${syncData.total_corrected} comptes corrigés sur ${syncData.total_accounts}`);
        
        res.json({
            success: true,
            message: `Synchronisation terminée: ${syncData.total_corrected} comptes corrigés sur ${syncData.total_accounts}`,
            data: syncData
        });
        
    } catch (error) {
        console.error('❌ Erreur synchronisation:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la synchronisation',
            error: error.message
        });
    }
});

// Route pour synchroniser UN compte spécifique
app.post('/api/admin/force-sync-account/:accountId', requireSuperAdminOnly, async (req, res) => {
    try {
        const accountId = parseInt(req.params.accountId);
        console.log(`🎯 Synchronisation compte ${accountId} par:`, req.user.username);
        
        // Vérifier que le compte existe
        const accountCheck = await pool.query('SELECT account_name FROM accounts WHERE id = $1', [accountId]);
        if (accountCheck.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Compte non trouvé' });
        }
        
        const accountName = accountCheck.rows[0].account_name;
        
        // Synchroniser le compte
        const result = await pool.query('SELECT force_sync_account($1)', [accountId]);
        const syncData = result.rows[0].force_sync_account;
        
        console.log(`✅ ${accountName} synchronisé: ${parseFloat(syncData.new_balance).toLocaleString()} FCFA (${syncData.status})`);
        
        res.json({
            success: true,
            message: `${accountName} synchronisé: ${parseFloat(syncData.new_balance).toLocaleString()} FCFA (${syncData.status})`,
            data: syncData
        });
        
    } catch (error) {
        console.error('❌ Erreur synchronisation compte:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la synchronisation du compte',
            error: error.message
        });
    }
});

// ====== FIN ROUTES SYNCHRONISATION ======

// ====== ROUTES DE DÉTECTION ET CORRECTION D'INCOHÉRENCES ======

// Route pour détecter les incohérences dans les comptes
app.get('/api/audit/consistency/detect', requireSuperAdminOnly, async (req, res) => {
    try {
        console.log('🔍 CONSISTENCY: Détection des incohérences demandée par:', req.user.username);
        
        // Vérifier la cohérence avec la nouvelle fonction qui gère les comptes statut
        const result = await pool.query(`
            SELECT 
                a.id as account_id,
                a.account_name,
                a.account_type,
                COALESCE(a.current_balance, 0) as stored_balance,
                calculate_expected_balance(a.id) as calculated_balance,
                COALESCE(a.total_credited, 0) as stored_total_credited,
                (
                    COALESCE(
                        (SELECT SUM(ch.amount) FROM credit_history ch WHERE ch.account_id = a.id), 0
                    ) + 
                    COALESCE(
                        (SELECT SUM(sch.amount) FROM special_credit_history sch WHERE sch.account_id = a.id), 0
                    )
                ) as calculated_total_credited,
                COALESCE(a.total_spent, 0) as stored_total_spent,
                COALESCE(
                    (SELECT SUM(e.total) FROM expenses e WHERE e.account_id = a.id), 0
                ) as calculated_total_spent
            FROM accounts a
            WHERE a.account_name NOT IN ('Compte Ajustement', 'Ajustement')
              AND a.id IS NOT NULL
              AND a.is_active = true
            ORDER BY a.account_name
        `);
        
        // Filtrer les comptes avec des incohérences (différence > 0.01 FCFA)
        const inconsistencies = result.rows.filter(account => {
            const balanceDiff = Math.abs(parseFloat(account.stored_balance) - parseFloat(account.calculated_balance));
            const creditedDiff = Math.abs(parseFloat(account.stored_total_credited) - parseFloat(account.calculated_total_credited));
            const spentDiff = Math.abs(parseFloat(account.stored_total_spent) - parseFloat(account.calculated_total_spent));
            
            return balanceDiff > 0.01 || creditedDiff > 0.01 || spentDiff > 0.01;
        });
        
        console.log(`✅ CONSISTENCY: ${inconsistencies.length} incohérences détectées sur ${result.rows.length} comptes`);
        
        // Formater les résultats pour l'affichage
        const formattedInconsistencies = inconsistencies.map(account => ({
            account_id: account.account_id,
            account_name: account.account_name,
            balance_difference: parseFloat(account.stored_balance) - parseFloat(account.calculated_balance),
            credited_difference: parseFloat(account.stored_total_credited) - parseFloat(account.calculated_total_credited),
            spent_difference: parseFloat(account.stored_total_spent) - parseFloat(account.calculated_total_spent),
            stored_balance: parseFloat(account.stored_balance),
            calculated_balance: parseFloat(account.calculated_balance),
            stored_total_credited: parseFloat(account.stored_total_credited),
            calculated_total_credited: parseFloat(account.calculated_total_credited),
            stored_total_spent: parseFloat(account.stored_total_spent),
            calculated_total_spent: parseFloat(account.calculated_total_spent)
        }));
        
        res.json({
            success: true,
            total_accounts: result.rows.length,
            inconsistent_accounts: inconsistencies.length,
            inconsistencies: formattedInconsistencies,
            detected_at: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ CONSISTENCY: Erreur lors de la détection:', error);
        res.status(500).json({ 
            success: false,
            error: 'Erreur lors de la détection des incohérences',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Route pour corriger toutes les incohérences
app.post('/api/audit/consistency/fix-all', requireSuperAdminOnly, async (req, res) => {
    try {
        console.log('🔧 CONSISTENCY: Correction de toutes les incohérences demandée par:', req.user.username);
        
        // Utiliser la fonction de synchronisation globale
        const result = await pool.query('SELECT force_sync_all_accounts_simple()');
        const syncData = result.rows[0].force_sync_all_accounts_simple;
        
        console.log(`✅ CONSISTENCY: Correction terminée, ${syncData.total_corrected} comptes corrigés sur ${syncData.total_accounts}`);
        
        res.json({
            success: true,
            message: 'Correction des incohérences terminée',
            total_accounts: syncData.total_accounts,
            corrected_accounts: syncData.total_corrected,
            corrected_at: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ CONSISTENCY: Erreur lors de la correction:', error);
        res.status(500).json({ 
            success: false,
            error: 'Erreur lors de la correction des incohérences',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Route pour corriger un compte spécifique
app.post('/api/audit/consistency/fix-account/:accountId', requireSuperAdminOnly, async (req, res) => {
    try {
        const { accountId } = req.params;
        
        console.log(`🔧 CONSISTENCY: Correction du compte ${accountId} demandée par:`, req.user.username);
        
        // Utiliser la fonction de synchronisation spécifique
        const result = await pool.query('SELECT force_sync_account($1)', [accountId]);
        const syncData = result.rows[0].force_sync_account;
        
        console.log(`✅ CONSISTENCY: Compte ${accountId} corrigé - ${syncData.account_name}: ${parseFloat(syncData.new_balance).toLocaleString()} FCFA`);
        
        res.json({
            success: true,
            account_id: accountId,
            account_name: syncData.account_name,
            old_balance: parseFloat(syncData.old_balance),
            new_balance: parseFloat(syncData.new_balance),
            status: syncData.status,
            corrected_at: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ CONSISTENCY: Erreur lors de la correction du compte:', error);
        res.status(500).json({ 
            success: false,
            error: 'Erreur lors de la correction du compte',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// ====== FIN ROUTES INCOHÉRENCES ======
