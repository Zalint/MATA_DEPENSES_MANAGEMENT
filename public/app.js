// État global de l'application
let currentUser = null;
let categories = [];
let users = [];
let stockVivantConfig = null;

// Variables globales pour les dates du dashboard
let startDate, endDate;
let lastAccountBreakdown = null; // Cache pour account_breakdown
let lastCashCalculation = null; // Cache pour les détails du calcul cash

// Décote par défaut (20%)
const DEFAULT_DISCOUNT = 0.20;

// Helper to get current user data, with caching
let _currentUser = null;
async function getCurrentUser() {
    // If we have a cached user, return it
    if (_currentUser && _currentUser.id) {
        return _currentUser;
    }
    try {
        // Otherwise, fetch from the server
        const response = await fetch('/api/user');
        if (!response.ok) {
            console.error('Could not fetch user. User may not be logged in.');
            // Clear any stale user data
            _currentUser = null;
            return null;
        }
        _currentUser = await response.json();
        return _currentUser;
    } catch (error) {
        console.error('Error fetching current user:', error);
        _currentUser = null;
        return null;
    }
}

// Configuration dynamique du serveur
function getServerConfig() {
    const hostname = window.location.hostname;
    const protocol = window.location.protocol;
    const port = window.location.port;
    
    // Détection automatique de l'environnement
    // Check if we're in a development environment
const isDevelopment = hostname === 'localhost' || 
                     hostname === '127.0.0.1' || 
                     hostname.startsWith('192.168.') ||
                     hostname.endsWith('.local');

if (isDevelopment) {
        // Environnement local
        const baseUrl = port ? `${protocol}//${hostname}:${port}` : `${protocol}//${hostname}`;
        return {
            environment: 'development',
            baseUrl: baseUrl,
            apiUrl: `${baseUrl}/api`
        };
    } else {
        // Environnement de production
        return {
            environment: 'production', 
            baseUrl: window.location.origin,
            apiUrl: window.location.origin + '/api'
        };
    }
}

// Configuration globale
const SERVER_CONFIG = getServerConfig();
console.log('🌍 Environment detected:', SERVER_CONFIG.environment);
console.log('🔗 Base URL:', SERVER_CONFIG.baseUrl);
console.log('🔧 API URL:', SERVER_CONFIG.apiUrl);

// Fonction utilitaire pour construire les URLs d'API
function apiUrl(endpoint) {
    // Si l'endpoint commence déjà par /api, l'utiliser tel quel (compatibilité)
    if (endpoint.startsWith('/api')) {
        return SERVER_CONFIG.baseUrl + endpoint;
    }
    // Sinon, construire l'URL complète
    return SERVER_CONFIG.apiUrl + '/' + endpoint.replace(/^\//, '');
}

// Utilitaires
function formatCurrency(amount) {
    return new Intl.NumberFormat('fr-FR', {
        style: 'currency',
        currency: 'XOF',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(amount);
}

function formatDate(dateString) {
    console.log('🚚 DEBUG formatDate - Input dateString:', dateString);
    
    // Éviter les problèmes de timezone en parsant manuellement la date YYYY-MM-DD
    if (typeof dateString === 'string' && dateString.match(/^\d{4}-\d{2}-\d{2}$/)) {
        const [year, month, day] = dateString.split('-');
        // Créer la date en heure locale pour éviter le décalage UTC
        const date = new Date(year, month - 1, day);
        console.log('🚚 DEBUG formatDate - Parsed Date object (local):', date);
        const formatted = date.toLocaleDateString('fr-FR');
        console.log('🚚 DEBUG formatDate - Formatted result:', formatted);
        return formatted;
    }
    
    // Fallback pour les autres formats de date
    const date = new Date(dateString);
    console.log('🚚 DEBUG formatDate - Parsed Date object (fallback):', date);
    const formatted = date.toLocaleDateString('fr-FR');
    console.log('🚚 DEBUG formatDate - Formatted result:', formatted);
    return formatted;
}

function showNotification(message, type = 'info') {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.className = `notification ${type}`;
    notification.classList.add('show');
    
    // Supprimer tout timeout existant pour éviter les conflits
    if (notification.timeoutId) {
        clearTimeout(notification.timeoutId);
    }
    
    // Programmer la disparition après 5 secondes
    notification.timeoutId = setTimeout(() => {
        notification.classList.remove('show');
        notification.timeoutId = null;
    }, 5000);
}

// Fonction pour charger dynamiquement l'agent AI
function loadAIAgent() {
    // Vérifier si le script n'est pas déjà chargé
    if (document.querySelector('script[data-relevanceai-share-id]')) {
        console.log('🤖 Agent AI déjà chargé');
        return;
    }
    
    console.log('🤖 Chargement de l\'agent AI pour rôle:', currentUser.role);
    
    // Créer et ajouter le script dynamiquement
    const script = document.createElement('script');
    script.defer = true;
    script.setAttribute('data-relevanceai-share-id', 'd7b62b/454efacc47da-463b-877a-66e43c7b454a/57b92281-883c-434e-9319-c6027b3009a9');
    script.src = 'https://app.relevanceai.com/embed/chat-bubble.js';
    script.setAttribute('data-share-styles', 'starting_message_prompts=G%C3%A9n%C3%A9rez+un+%C3%A9tat+des+d%C3%A9penses+du+mois+en+cours%2C+d%C3%A9taill%C3%A9+par+sous-cat%C3%A9gorie.&hide_tool_steps=false&hide_file_uploads=false&hide_conversation_list=false&bubble_style=agent&primary_color=%23685FFF&bubble_icon=pd%2Fchat&input_placeholder_text=Type+your+message...&hide_logo=true&hide_description=false');
    
    document.body.appendChild(script);
    console.log('✅ Agent AI chargé avec succès');
}

// Gestion de l'authentification
async function login(username, password) {
    try {
        const response = await fetch(apiUrl('/api/login'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            currentUser = data.user;
            showNotification('Connexion réussie !', 'success');
            await showApp();
            await loadInitialData();
        } else {
            throw new Error(data.error);
        }
    } catch (error) {
        showError('login-error', error.message);
    }
}

async function logout() {
    try {
        await fetch(apiUrl('/api/logout'), { method: 'POST' });
        currentUser = null;
        showLogin();
        showNotification('Déconnexion réussie', 'info');
    } catch (error) {
        console.error('Erreur de déconnexion:', error);
    }
}

function showError(elementId, message) {
    const errorDiv = document.getElementById(elementId);
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
    setTimeout(() => {
        errorDiv.style.display = 'none';
    }, 5000);
}

// Navigation
function showLogin() {
    document.getElementById('login-page').classList.add('active');
    document.getElementById('app').classList.remove('active');
}

async function showApp() {
    document.getElementById('login-page').classList.remove('active');
    document.getElementById('app').classList.add('active');
    
    // Mettre à jour les informations utilisateur
    document.getElementById('user-name').textContent = currentUser.username;
    document.getElementById('user-role').textContent = currentUser.role.replace('_', ' ');
    
    // Activer le mode comptable (lecture seule, menus limités)
    if (currentUser.role === 'comptable') {
        document.body.classList.add('comptable-mode');
        // Rediriger vers "Mes Dépenses" pour les comptables
        showSection('expenses');
    } else {
        document.body.classList.remove('comptable-mode');
    }
    
    // Afficher le menu admin si nécessaire
    if (['directeur_general', 'pca', 'admin'].includes(currentUser.role)) {
        document.getElementById('admin-menu').style.display = 'block';
        document.getElementById('admin-users-menu').style.display = 'block';
        document.getElementById('admin-config-menu').style.display = 'block';
        document.getElementById('sql-query-menu').style.display = 'block';
        document.getElementById('visualisation-menu').style.display = 'block';
        document.getElementById('stock-menu').style.display = 'block';
        document.getElementById('stock-vivant-menu').style.display = 'block';
        document.getElementById('user-column').style.display = 'table-cell';
        
        // Afficher les cartes de dashboard réservées
        document.getElementById('pl-estim-charges-card').style.display = 'block';
        document.getElementById('pl-brut-card').style.display = 'block';
        document.getElementById('cash-bictorys-card').style.display = 'block';
        
        // Afficher les cartes PL alternatifs si elles existent
        const altCards = document.querySelectorAll('[id^="pl-alt-"]');
        altCards.forEach(card => {
            card.style.display = 'block';
        });

        // Section de sauvegarde du tableau de bord initialisée dans loadInitialData()
        
        // Charger dynamiquement l'agent AI pour les rôles autorisés
        loadAIAgent();
    }
    
    // Afficher le menu créance pour les utilisateurs autorisés
    if (['directeur_general', 'pca', 'admin', 'directeur'].includes(currentUser.role)) {
        document.getElementById('creance-menu').style.display = 'block';
    }
    
    // Initialize Stock Vivant module (similar to credit module)
    await initDirectorStockVivantModule();
}

async function showSection(sectionName) {
    // Masquer toutes les sections
    document.querySelectorAll('.section').forEach(section => {
        section.classList.remove('active');
    });
    
    // Désactiver tous les liens de navigation
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
    });
    
    // Afficher la section demandée
    document.getElementById(`${sectionName}-section`).classList.add('active');
    
    // Activer le lien de navigation correspondant
    document.querySelector(`[data-section="${sectionName}"]`).classList.add('active');
    
    // Charger les données spécifiques à la section
    switch (sectionName) {
        case 'dashboard':
            // Rechargement complet comme la première fois
            console.log('🔄 Dashboard: Rechargement complet comme première visite');
            
            // 1. Réinitialiser les dates avec la fonction dédiée
            resetDashboardDates();
            
            // 2. Appeler automatiquement "Charger le mois" pour recharger les données
            const loadButton = document.getElementById('load-month-data');
            if (loadButton) {
                console.log('🔄 Dashboard: Appel automatique du bouton "Charger le mois"');
                loadButton.click();
            } else {
                // Fallback si le bouton n'existe pas
                console.log('🔄 Dashboard: Fallback - chargement direct des données');
                await loadDashboardData();
                await loadStockSummary(startDate, endDate);
                await loadStockVivantTotal();
                await loadStockVivantVariation(startDate, endDate);
                await loadTotalCreances();
                await loadCreancesMois();
                await loadTransfersCard();
            }
            break;
        case 'expenses':
            loadExpenses();
            break;
        case 'manage-accounts':
            loadAccounts();
            loadUsersWithoutAccount();
            if (['directeur_general', 'pca', 'admin'].includes(currentUser.role)) {
            loadAccountsForCredit();
            loadCreditHistory();
            }
            break;
        case 'add-expense':
            loadCategories();
            setDefaultDate();
            loadValidationStatus(); // Charger le statut de validation
            if (['directeur', 'directeur_general', 'pca', 'admin'].includes(currentUser.role)) {
                loadAccountBalance();
                loadUserAccounts();
            }
            break;
        case 'partner-tracking':
            console.log('🔄 CLIENT: showSection - partner-tracking appelé');
            try {
                await loadPartnerSummary();
                // Initialiser la génération de factures partenaires
                initPartnerInvoiceGenerator();
                console.log('✅ CLIENT: showSection - partner-tracking terminé avec succès');
            } catch (error) {
                console.error('❌ CLIENT: Erreur dans showSection - partner-tracking:', error);
                showNotification('Erreur lors du chargement des Comptes Partenaires', 'error');
            }
            break;
        case 'manage-users':
            loadAllUsers();
            break;
        case 'remboursements':
            // La synthèse est chargée via le gestionnaire de menu, ne rien faire ici
            break;
        case 'transfert':
            initTransfertModule();
            break;
        case 'stock-soir':
            await initStockModule();
            break;
        case 'stock-vivant':
            console.log('🔄 CLIENT: showSection - stock-vivant appelé');
            try {
                const success = await initStockVivantModule();
                if (success) {
                    console.log('✅ CLIENT: showSection - stock-vivant terminé avec succès');
                }
            } catch (error) {
                console.error('❌ CLIENT: Erreur dans showSection - stock-vivant:', error);
                showNotification('Erreur lors du chargement du Stock Vivant', 'error');
            }
            break;

        case 'admin-config':
            console.log('🔄 CLIENT: showSection - admin-config appelé');
            try {
                await initAdminConfig();
                console.log('✅ CLIENT: showSection - admin-config terminé avec succès');
            } catch (error) {
                console.error('❌ CLIENT: Erreur dans showSection - admin-config:', error);
                showNotification('Erreur lors du chargement de la Configuration', 'error');
            }
            break;
        case 'creance':
            console.log('🔄 CLIENT: showSection - creance appelé');
            try {
                await initCreanceSection();
                console.log('✅ CLIENT: showSection - creance terminé avec succès');
            } catch (error) {
                console.error('❌ CLIENT: Erreur dans showSection - creance:', error);
                showNotification('Erreur lors du chargement des Créances', 'error');
            }
            break;
            
        case 'cash-bictorys':
            console.log('🔄 CLIENT: showSection - cash-bictorys appelé');
            try {
                await initCashBictorysSection();
                console.log('✅ CLIENT: showSection - cash-bictorys terminé avec succès');
            } catch (error) {
                console.error('❌ CLIENT: Erreur dans showSection - cash-bictorys:', error);
                showNotification('Erreur lors du chargement de Cash Bictorys', 'error');
            }
            break;
            
        case 'virement-mensuel':
            console.log('🔄 CLIENT: showSection - virement-mensuel appelé');
            try {
                await initVirementMensuel();
                console.log('✅ CLIENT: showSection - virement-mensuel terminé avec succès');
            } catch (error) {
                console.error('❌ CLIENT: Erreur dans showSection - virement-mensuel:', error);
                showNotification('Erreur lors du chargement de Virement Mensuel', 'error');
            }
            break;
            
        case 'visualisation':
            console.log('🔄 CLIENT: showSection - visualisation appelé');
            try {
                await initVisualisationModule();
                console.log('✅ CLIENT: showSection - visualisation terminé avec succès');
            } catch (error) {
                console.error('❌ CLIENT: Erreur dans showSection - visualisation:', error);
                showNotification('Erreur lors du chargement de la Visualisation', 'error');
            }
            break;
    }
}

// Initialiser la visibilité des menus selon les permissions
function initMenuVisibility() {
    // Pour le rôle Comptable: masquer TOUS les menus sauf "Mes Dépenses"
    if (currentUser.role === 'comptable') {
        // Masquer toutes les sections sauf "Mes Dépenses"
        const menuItems = document.querySelectorAll('.menu-item');
        menuItems.forEach(item => {
            const menuId = item.id;
            // Garder visible uniquement le menu "Mes Dépenses"
            if (menuId !== 'expenses-menu') {
                item.style.display = 'none';
            }
        });
        
        // Masquer les sections de navigation principales
        const suiviTableauSection = document.querySelector('.menu-section:has(#dashboard-menu)');
        const gestionFinanciereSection = document.querySelector('.menu-section:has(#add-expense-menu)');
        const gestionStocksSection = document.querySelector('.menu-section:has(#stock-management-menu)');
        
        if (suiviTableauSection) suiviTableauSection.style.display = 'none';
        if (gestionStocksSection) gestionStocksSection.style.display = 'none';
        
        // Garder visible uniquement la section contenant "Mes Dépenses"
        if (gestionFinanciereSection) {
            gestionFinanciereSection.style.display = 'block';
        }
        
        console.log('👁️ Comptable: Affichage limité à "Mes Dépenses" uniquement');
        return; // Sortir de la fonction pour le comptable
    }
    
    // Menu Cash Bictorys pour TOUS les autres utilisateurs
    const cashBictorysMenu = document.getElementById('cash-bictorys-menu');
    if (cashBictorysMenu) {
        cashBictorysMenu.style.display = 'block';
    }
    
    // Menu Virement Mensuel pour TOUS les autres utilisateurs
    const virementMensuelMenu = document.getElementById('virement-mensuel-menu');
    if (virementMensuelMenu) {
        virementMensuelMenu.style.display = 'block';
    }
    
    // Menu Créance pour DG, PCA, Admin, Directeur
    if (['directeur_general', 'pca', 'admin', 'directeur'].includes(currentUser.role)) {
        const creanceMenu = document.getElementById('creance-menu');
        if (creanceMenu) {
            creanceMenu.style.display = 'block';
        }
    }
    
    // Menu Montant Début de Mois pour DG, PCA, Admin uniquement
    if (['directeur_general', 'pca', 'admin'].includes(currentUser.role)) {
        const montantDebutMoisMenu = document.getElementById('montant-debut-mois-menu');
        if (montantDebutMoisMenu) {
            montantDebutMoisMenu.style.display = 'block';
            
            // Configurer le gestionnaire de navigation
            const navLink = montantDebutMoisMenu.querySelector('a');
            if (navLink) {
                navLink.addEventListener('click', function(e) {
                    e.preventDefault();
                    showSection('montant-debut-mois');
                    initMontantDebutMoisModule();
                });
            }
        }
    }
}

// Chargement des données initiales
async function loadInitialData() {
    // Initialize menu collapse
    initMenuCollapse();
    
    await loadCategories();
    
    // Charger les types de comptes pour le formulaire de création
    await loadAccountTypes();
    
    // Initialiser les menus selon les permissions
    initMenuVisibility();
    
    // Initialiser l'observer pour la section partenaires
    initPartnerSectionObserver();
    
    // Définir les dates par défaut AVANT de charger le dashboard
    // Utiliser une plage de dates élargie pour inclure toutes les dépenses existantes
    const defaultStartDate = '2025-01-01'; // Début de l'année pour capturer toutes les dépenses
    const defaultEndDate = '2025-12-31';   // Fin de l'année pour capturer toutes les dépenses
    
    // Initialiser les variables globales
    startDate = defaultStartDate;
    endDate = defaultEndDate;
    
    // Vérifier si les éléments existent avant de les utiliser
    const dashboardStartDate = document.getElementById('dashboard-start-date');
    const dashboardEndDate = document.getElementById('dashboard-end-date');
    
    if (dashboardStartDate && dashboardEndDate) {
        dashboardStartDate.value = startDate;
        dashboardEndDate.value = endDate;
    }
    
    if (['directeur_general', 'pca', 'admin'].includes(currentUser.role)) {
        await loadUsers();
        // Afficher le formulaire d'ajustement pour DG/PCA
        document.getElementById('adjustment-form-container').style.display = 'block';
        setupAdjustmentForm();
    } else {
        // Masquer la section transferts pour les directeurs simples
        const transfersChartCard = document.getElementById('transfers-chart-card');
        if (transfersChartCard) {
            transfersChartCard.style.display = 'none';
        }
    }
    // ✨ Initialiser la section de sauvegarde AVANT le chargement du dashboard
    if (['directeur_general', 'pca', 'admin'].includes(currentUser.role)) {
        const saveSection = document.getElementById('dashboard-save-section');
        if (saveSection) {
            saveSection.style.display = 'block';
            initDashboardSaveSection();
        }
    }
    
    // Pour le rôle Comptable: afficher directement "Mes Dépenses" avec dates du mois courant
    if (currentUser.role === 'comptable') {
        // Calculer le premier jour du mois courant
        const today = new Date();
        const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const firstDayStr = firstDayOfMonth.toISOString().split('T')[0];
        const todayStr = today.toISOString().split('T')[0];
        
        // Définir les dates par défaut pour les filtres de dépenses
        const filterStartDate = document.getElementById('filter-start-date');
        const filterEndDate = document.getElementById('filter-end-date');
        
        if (filterStartDate && filterEndDate) {
            filterStartDate.value = firstDayStr;
            filterEndDate.value = todayStr;
            console.log(`📅 Comptable: Dates définies - ${firstDayStr} à ${todayStr}`);
        }
        
        // Afficher directement la section "Mes Dépenses"
        showSection('expenses-section');
        await loadExpensesWithFilters();
        
        console.log('👁️ Comptable: Affichage automatique de "Mes Dépenses"');
        return; // Sortir de la fonction pour éviter d'exécuter le reste
    }
    
    if (['directeur_general', 'pca', 'admin'] || ['directeur', 'directeur_general', 'pca', 'admin'].includes(currentUser.role)) {
        await loadDashboard();
    }
    setDefaultDate();
    initTransfertModule();
    await initDirectorCreditModule();
    await initAuditFluxModule();
    
    // Initialiser les event listeners pour les filtres de crédit
    if (['directeur_general', 'pca', 'admin'].includes(currentUser.role)) {
        setupCreditFiltersEventListeners();
        // Charger les comptes pour le filtre immédiatement
        await loadCreditAccounts();
    }
    
    // Stock vivant sera initialisé seulement quand on clique sur le menu
    console.log('ℹ️ CLIENT: Stock vivant sera initialisé à la demande');
    
    // Initialize AI Analysis module
    if (typeof initAIAnalysis === 'function') {
        initAIAnalysis();
        console.log('✅ CLIENT: AI Analysis module initialized');
    }
}

// Initialiser le menu collapse
function initMenuCollapse() {
    // Get all menu section titles
    const menuSectionTitles = document.querySelectorAll('.menu-section-title');
    
    menuSectionTitles.forEach(title => {
        title.addEventListener('click', function() {
            // Get the associated section group
            const sectionGroup = document.querySelector(`.section-group[data-group="${this.getAttribute('data-section-group')}"]`);
            if (!sectionGroup) return;
            
            // Toggle collapsed state
            this.classList.toggle('collapsed');
            sectionGroup.classList.toggle('collapsed');
            
            // Rotate chevron
            const chevron = this.querySelector('.chevron');
            if (chevron) {
                chevron.style.transform = this.classList.contains('collapsed') ? 'rotate(-90deg)' : 'rotate(180deg)';
            }
            
            console.log('Menu section clicked:', {
                title: this,
                group: sectionGroup,
                collapsed: this.classList.contains('collapsed')
            });
        });
    });
}

// Initialiser l'observateur pour la section partenaires
function initPartnerSectionObserver() {
    const partnerSection = document.getElementById('partner-tracking-section');
    if (!partnerSection) return;
    
    // Observer les changements de visibilité de la section
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                const isVisible = partnerSection.classList.contains('active');
                if (isVisible) {
                    console.log('👁️ CLIENT: Section partenaires visible - rafraîchissement automatique');
                    // Petit délai pour s'assurer que la section est complètement affichée
                    setTimeout(() => {
                        loadPartnerSummary();
                    }, 100);
                }
            }
        });
    });
    
    observer.observe(partnerSection, {
        attributes: true,
        attributeFilter: ['class']
    });
    
    console.log('👁️ CLIENT: Observer section partenaires initialisé');
}

async function loadCategories() {
    try {
        const response = await fetch(apiUrl('/api/categories'));
        const categoriesData = await response.json();
        
        // Charger les types de dépenses
        const typeSelect = document.getElementById('expense-type');
        typeSelect.innerHTML = '<option value="">Sélectionner un type</option>';
        
        categoriesData.types.forEach(type => {
            const option = document.createElement('option');
            option.value = type.id;
            option.textContent = type.name;
            typeSelect.appendChild(option);
        });
        
        // Stocker les données pour utilisation ultérieure
        window.categoriesConfig = categoriesData;
        
    } catch (error) {
        console.error('Erreur chargement catégories:', error);
    }
}

function loadCategoriesByType(typeId) {
    const categorySelect = document.getElementById('expense-category');
    const subcategorySelect = document.getElementById('expense-subcategory');
    
    // Réinitialiser les sélections
    categorySelect.innerHTML = '<option value="">Sélectionner une catégorie</option>';
    subcategorySelect.innerHTML = '<option value="">Sélectionner d\'abord une catégorie</option>';
    subcategorySelect.disabled = true;
    
    if (!typeId || !window.categoriesConfig) {
        categorySelect.disabled = true;
        return;
    }
    
    const selectedType = window.categoriesConfig.types.find(type => type.id === typeId);
    if (!selectedType) return;
    
    categorySelect.disabled = false;
    
    // Charger les catégories pour ce type
    if (selectedType.categories) {
        selectedType.categories.forEach(category => {
            const option = document.createElement('option');
            option.value = category.id;
            option.textContent = category.name;
            categorySelect.appendChild(option);
        });
    }
}

function loadSubcategoriesByCategory(typeId, categoryId) {
    const subcategorySelect = document.getElementById('expense-subcategory');
    const socialNetworkRow = document.getElementById('social-network-row');
    const socialNetworkSelect = document.getElementById('social-network-detail');
    
    // Réinitialiser
    subcategorySelect.innerHTML = '<option value="">Sélectionner une sous-catégorie</option>';
    socialNetworkRow.style.display = 'none';
    socialNetworkSelect.innerHTML = '<option value="">Sélectionner un réseau</option>';
    
    if (!typeId || !categoryId || !window.categoriesConfig) {
        subcategorySelect.disabled = true;
        return;
    }
    
    const selectedType = window.categoriesConfig.types.find(type => type.id === typeId);
    if (!selectedType) return;
    
    subcategorySelect.disabled = false;
    
    // Pour les types avec sous-catégories communes (Mata Group, Mata Prod, Marketing)
    if (selectedType.subcategories) {
        selectedType.subcategories.forEach(subcategory => {
            const option = document.createElement('option');
            option.value = subcategory.id;
            option.textContent = subcategory.name;
            subcategorySelect.appendChild(option);
            
            // Si c'est "Réseau social", préparer les détails
            if (subcategory.id === 'reseau_social' && subcategory.details) {
                subcategory.details.forEach(detail => {
                    const detailOption = document.createElement('option');
                    detailOption.value = detail.toLowerCase();
                    detailOption.textContent = detail;
                    socialNetworkSelect.appendChild(detailOption);
                });
            }
        });
    }
    // Pour les types avec sous-catégories spécifiques (Achat)
    else if (selectedType.categories) {
        const selectedCategory = selectedType.categories.find(cat => cat.id === categoryId);
        if (selectedCategory && selectedCategory.subcategories) {
            selectedCategory.subcategories.forEach(subcategory => {
                const option = document.createElement('option');
                option.value = subcategory.id;
                option.textContent = subcategory.name;
                subcategorySelect.appendChild(option);
            });
        }
    }
}

function handleSubcategoryChange(subcategoryId) {
    const socialNetworkRow = document.getElementById('social-network-row');
    
    if (subcategoryId === 'reseau_social') {
        socialNetworkRow.style.display = 'block';
    } else {
        socialNetworkRow.style.display = 'none';
    }
}

// Fonction pour calculer automatiquement le total
function calculateTotal() {
    const quantity = parseFloat(document.getElementById('expense-quantity').value) || 0;
    const unitPrice = parseFloat(document.getElementById('expense-unit-price').value) || 0;
    const totalField = document.getElementById('expense-total');
    
    // Ne calculer automatiquement que si le champ total est vide ou si l'utilisateur n'a pas modifié manuellement
    if (!totalField.dataset.manuallyEdited) {
        const total = quantity * unitPrice;
        totalField.value = Math.round(total);
        
        // Supprimer les anciens messages de validation pendant le calcul automatique
        let errorDiv = document.getElementById('balance-error');
        if (errorDiv) {
            errorDiv.remove();
        }
    }
}

// BYPASS TEMPORAIRE - FONCTION DE VALIDATION COMPLÈTEMENT DÉSACTIVÉE
async function validateExpenseAmount() {
    try {
        const totalField = document.getElementById('expense-total');
        const submitButton = document.querySelector('#expense-form button[type="submit"]');
        
        // Supprimer l'ancien message d'erreur s'il existe
        let errorDiv = document.getElementById('balance-error');
        if (errorDiv) {
            errorDiv.remove();
        }
        
        // BYPASS TEMPORAIRE - TOUTES LES VALIDATIONS DÉSACTIVÉES
        console.log('✅ BYPASS: Validation de solde désactivée temporairement');
        
        // Activer le bouton sans condition (avec vérification de sécurité)
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.style.opacity = '1';
            submitButton.style.cursor = 'pointer';
        }
        
    } catch (error) {
        console.error('Erreur validation solde:', error);
    }
}
// Fonction pour valider les fichiers uploadés
function validateFile(fileInput) {
    const file = fileInput.files[0];
    const fileText = document.getElementById('file-input-text');
    
    if (!file) {
        fileText.textContent = 'Aucun fichier sélectionné';
        fileText.classList.remove('has-file');
        return;
    }
    
    // Vérifier la taille (5MB max)
    const maxSize = 5 * 1024 * 1024; // 5MB en bytes
    if (file.size > maxSize) {
        showNotification('Le fichier est trop volumineux. Taille maximum: 5MB', 'error');
        fileInput.value = '';
        fileText.textContent = 'Aucun fichier sélectionné';
        fileText.classList.remove('has-file');
        return;
    }
    
    // Vérifier le type de fichier
    const allowedTypes = [
        'image/jpeg', 'image/jpg', 'image/png',
        'application/pdf',
        'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];
    
    if (!allowedTypes.includes(file.type)) {
        showNotification('Type de fichier non autorisé. Formats acceptés: JPG, PNG, PDF, Word, Excel', 'error');
        fileInput.value = '';
        fileText.textContent = 'Aucun fichier sélectionné';
        fileText.classList.remove('has-file');
        return;
    }
    
    // Afficher le nom du fichier sélectionné
    fileText.textContent = file.name;
    fileText.classList.add('has-file');
    showNotification(`Fichier "${file.name}" sélectionné avec succès`, 'success');
}

// Fonction pour ajouter une dépense avec fichier
async function addExpenseWithFile(formData) {
    try {
        // Construire la description complète avec la hiérarchie
        const typeSelect = document.getElementById('expense-type');
        const categorySelect = document.getElementById('expense-category');
        const subcategorySelect = document.getElementById('expense-subcategory');
        const socialNetworkSelect = document.getElementById('social-network-detail');
        
        const typeName = typeSelect.options[typeSelect.selectedIndex]?.text || '';
        const categoryName = categorySelect.options[categorySelect.selectedIndex]?.text || '';
        const subcategoryName = subcategorySelect.options[subcategorySelect.selectedIndex]?.text || '';
        const socialNetwork = socialNetworkSelect.value ? ` (${socialNetworkSelect.options[socialNetworkSelect.selectedIndex].text})` : '';
        
        // Créer une description enrichie
        const hierarchyDescription = `${typeName} > ${categoryName} > ${subcategoryName}${socialNetwork}`;
        const originalDescription = formData.get('description') || '';
        const fullDescription = originalDescription ? `${hierarchyDescription}\n${originalDescription}` : hierarchyDescription;
        
        formData.set('description', fullDescription);
        formData.set('social_network_detail', socialNetworkSelect.value || '');
        
        const response = await fetch('/api/expenses', {
            method: 'POST',
            body: formData // FormData se charge automatiquement des headers
        });
        
        if (response.ok) {
            showNotification('Dépense ajoutée avec succès !', 'success');
            document.getElementById('expense-form').reset();
            setDefaultDate();
            // Réinitialiser les sélecteurs
            loadCategories();
            // Réinitialiser le total et son état
            const totalField = document.getElementById('expense-total');
            totalField.value = '';
            delete totalField.dataset.manuallyEdited;
            // Remettre la quantité à 1 par défaut
            const quantityField = document.getElementById('expense-quantity');
            if (quantityField) {
                quantityField.value = '1';
            }
            // Réinitialiser le texte du fichier
            const fileText = document.getElementById('file-input-text');
            if (fileText) {
                fileText.textContent = 'Aucun fichier sélectionné';
                fileText.classList.remove('has-file');
            }
        } else {
            const error = await response.json();
            throw new Error(error.error);
        }
    } catch (error) {
        showNotification(`Erreur: ${error.message}`, 'error');
    }
}

async function loadUsers() {
    try {
        const response = await fetch('/api/users');
        users = await response.json();
        
        // Vérifier si l'élément existe avant de l'utiliser
        const userSelect = document.getElementById('wallet-user');
        if (userSelect) {
            userSelect.innerHTML = '<option value="">Sélectionner un directeur</option>';
            
            users.forEach(user => {
                const option = document.createElement('option');
                option.value = user.id;
                option.textContent = user.username;
                userSelect.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Erreur chargement utilisateurs:', error);
    }
}

// Dashboard
async function loadDashboard() {
    try {
        console.log('🔄 DASHBOARD: Rafraîchissement complet - comme une première visite');
        
        // 1. Vider tous les éléments du dashboard pour forcer un rechargement
        clearDashboardCache();
        
        // 2. Réinitialiser les dates pour maintenir la cohérence
        resetDashboardDates();
        
        // 2. Charger toutes les données dans l'ordre (sans réinitialiser les dates)
        await loadDashboardData();
        await loadStockSummary(startDate, endDate);
        await loadStockVivantTotal(); // Ajouter le chargement du total stock vivant
        await loadStockVivantVariation(startDate, endDate); // Ajouter le chargement de l'écart mensuel
        await loadTotalCreances(); // Charger le total des créances
        await loadCreancesMois(); // Charger les créances du mois
        await loadTransfersCard(); // Ajouter le chargement des transferts
        
        console.log('✅ DASHBOARD: Rafraîchissement complet terminé');
    } catch (error) {
        console.error('Erreur lors du chargement du dashboard:', error);
        showAlert('Erreur lors du chargement du dashboard', 'danger');
    }
}

// Fonction pour vider le cache du dashboard
function clearDashboardCache() {
    console.log('🧹 Nettoyage du cache dashboard');
    
    // Réinitialiser les variables globales
    selectedMonth = null;
    
    // Vider les valeurs des cartes principales
    const elementsToReset = [
        'solde-amount',
        'total-spent-amount', 
        'total-remaining-amount',
        'total-credited-with-expenses',
        'total-credited-general',
        'total-depot-balance',
        'total-partner-balance',
        'pl-sans-stock-charges',
        'pl-estim-charges',
        'pl-brut',
        'weekly-burn',
        'monthly-burn',
        'stock-total',
        'stock-date'
    ];
    
    elementsToReset.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = 'Chargement...';
        }
    });
    
    // Vider les graphiques existants
    const chartElements = ['account-chart', 'category-chart'];
    chartElements.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.innerHTML = '';
        }
    });
}

// Fonction pour réinitialiser les dates du dashboard
function resetDashboardDates() {
    console.log('📅 Réinitialisation des dates dashboard');
    
    // Définir les dates par défaut (du 1er du mois à la date du jour)
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonthNum = currentDate.getMonth() + 1;
    const currentDay = currentDate.getDate();
    
    const currentMonth = `${currentYear}-${currentMonthNum.toString().padStart(2, '0')}`;
    const localStartDate = `${currentYear}-${currentMonthNum.toString().padStart(2, '0')}-01`;
    const localEndDate = `${currentYear}-${currentMonthNum.toString().padStart(2, '0')}-${currentDay.toString().padStart(2, '0')}`; // DATE DU JOUR
    
    // Mettre à jour les variables globales
    startDate = localStartDate;
    endDate = localEndDate;
    
    // Vérifier si les éléments existent avant de les utiliser
    const dashboardStartDate = document.getElementById('dashboard-start-date');
    const dashboardEndDate = document.getElementById('dashboard-end-date');
    const monthInput = document.getElementById('dashboard-month');
    const snapshotDate = document.getElementById('snapshot-date');
    
    if (dashboardStartDate && dashboardEndDate) {
        dashboardStartDate.value = startDate;
        dashboardEndDate.value = endDate;
        console.log('📅 Dates réinitialisées:', startDate, 'à', endDate);
    }
    
    if (monthInput) {
        monthInput.value = currentMonth;
        selectedMonth = currentMonth;
    }
    
    // Ne pas synchroniser automatiquement snapshot-date avec endDate
    // L'utilisateur doit pouvoir choisir librement la date de snapshot
    if (snapshotDate && !snapshotDate.value) {
        // Seulement initialiser si pas de valeur déjà définie
        snapshotDate.value = endDate;
        console.log('📅 Snapshot-date initialisé:', endDate);
    }
}

// Initialiser les listeners pour les champs de date du dashboard
function initDashboardDateListeners() {
    console.log('🔍 CLIENT: Tentative d\'initialisation des listeners de date du dashboard');
    
    const dashboardStartDate = document.getElementById('dashboard-start-date');
    const dashboardEndDate = document.getElementById('dashboard-end-date');
    const snapshotDate = document.getElementById('snapshot-date');
    
    console.log('🔍 CLIENT: Éléments trouvés:', {
        dashboardStartDate: !!dashboardStartDate,
        dashboardEndDate: !!dashboardEndDate,
        snapshotDate: !!snapshotDate
    });
    
    if (dashboardStartDate) {
        // Supprimer l'ancien listener s'il existe
        dashboardStartDate.removeEventListener('change', handleDashboardDateChange);
        dashboardStartDate.addEventListener('change', handleDashboardDateChange);
        console.log('✅ CLIENT: Listener ajouté pour dashboard-start-date');
        
        // Test manuel pour vérifier que l'élément fonctionne
        console.log('🔍 CLIENT: Test - Valeur actuelle dashboard-start-date:', dashboardStartDate.value);
    } else {
        console.warn('⚠️ CLIENT: Élément dashboard-start-date non trouvé');
    }
    
    if (dashboardEndDate) {
        // Supprimer l'ancien listener s'il existe
        dashboardEndDate.removeEventListener('change', handleDashboardDateChange);
        dashboardEndDate.addEventListener('change', handleDashboardDateChange);
        console.log('✅ CLIENT: Listener ajouté pour dashboard-end-date');
        
        // Test manuel pour vérifier que l'élément fonctionne
        console.log('🔍 CLIENT: Test - Valeur actuelle dashboard-end-date:', dashboardEndDate.value);
    } else {
        console.warn('⚠️ CLIENT: Élément dashboard-end-date non trouvé');
    }
    
    if (snapshotDate) {
        // Supprimer l'ancien listener s'il existe
        snapshotDate.removeEventListener('change', handleDashboardDateChange);
        snapshotDate.addEventListener('change', handleDashboardDateChange);
        console.log('✅ CLIENT: Listener ajouté pour snapshot-date');
        
        // Test manuel pour vérifier que l'élément fonctionne
        console.log('🔍 CLIENT: Test - Valeur actuelle snapshot-date:', snapshotDate.value);
    } else {
        console.warn('⚠️ CLIENT: Élément snapshot-date non trouvé');
    }
}

// Fonction appelée quand les dates du dashboard changent
async function handleDashboardDateChange(event) {
    console.log('📅 CLIENT: Changement de date détecté dans le dashboard');
    console.log('📅 CLIENT: Élément qui a changé:', event.target.id);
    console.log('📅 CLIENT: Nouvelle valeur:', event.target.value);
    
    const dashboardStartDate = document.getElementById('dashboard-start-date')?.value;
    const dashboardEndDate = document.getElementById('dashboard-end-date')?.value;
    
    console.log('📅 CLIENT: Valeurs actuelles des dates:', {
        startDate: dashboardStartDate,
        endDate: dashboardEndDate
    });
    
    if (!dashboardStartDate || !dashboardEndDate) {
        console.warn('⚠️ CLIENT: Dates manquantes, impossible de mettre à jour');
        return;
    }
    
    console.log(`📅 CLIENT: Mise à jour avec les dates: ${dashboardStartDate} à ${dashboardEndDate}`);
    
    try {
        // Recharger les données du dashboard avec les nouvelles dates
        await loadDashboardData();
        
        // Si un mois est sélectionné, recharger aussi les données mensuelles
        if (selectedMonth) {
            await loadMonthlySpecificData(selectedMonth);
        }
        
        console.log('✅ CLIENT: Données mises à jour après changement de date');
    } catch (error) {
        console.error('❌ CLIENT: Erreur lors de la mise à jour après changement de date:', error);
        showNotification('Erreur lors de la mise à jour des données', 'error');
    }
}

// Fonction appelée quand l'option "Afficher les comptes avec zéro dépenses" change
function onShowZeroAccountsChange() {
    // Recharger les données du dashboard pour refléter le changement
    loadDashboardData();
}

// Fonction pour créer le compte Ajustement et associer les dépenses orphelines
async function createAdjustmentAccount() {
    try {
        const response = await fetch('/api/admin/create-adjustment-account', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        const result = await response.json();
        
        if (response.ok) {
            console.log('Compte Ajustement créé:', result);
            showNotification(`Compte Ajustement créé avec succès ! ${result.orphanExpensesFound} dépenses orphelines (${formatCurrency(result.totalOrphanAmount)}) ont été associées.`, 'success');
            
            // Recharger les données
            await loadAccounts();
            await loadDashboard();
        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        console.error('Erreur création compte Ajustement:', error);
        showNotification(`Erreur: ${error.message}`, 'error');
    }
}

// Fonction pour mettre à jour les cartes de statistiques
async function updateStatsCards(startDate, endDate, cutoffDate) {
    console.log('🎯 updateStatsCards: ===== DÉBUT FONCTION =====');
    try {
        console.log('🎯 updateStatsCards: ENTRÉE dans le TRY');
        // Construire l'URL avec les paramètres de date
        let url = '/api/dashboard/stats-cards';
        const params = new URLSearchParams();
        
        if (startDate) params.append('start_date', startDate);
        if (endDate) params.append('end_date', endDate);
        if (cutoffDate) params.append('cutoff_date', cutoffDate);
        
        if (params.toString()) {
            url += '?' + params.toString();
        }
        
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`Erreur HTTP ${response.status}: ${response.statusText}`);
        }
        
        const stats = await response.json();
        
        // 🔍 LOG SPÉCIFIQUE POUR ACCOUNT_BREAKDOWN
        if (stats.account_breakdown) {
            console.log('🔍 CLIENT: account_breakdown trouvé avec', stats.account_breakdown.length, 'comptes');
            const compteDirecteur = stats.account_breakdown.find(item => item.account === 'Compte Directeur Commercial');
            if (compteDirecteur) {
                console.log('🎯 CLIENT: Compte Directeur Commercial dans account_breakdown:', compteDirecteur);
            } else {
                console.log('❌ CLIENT: Compte Directeur Commercial NOT FOUND dans account_breakdown');
            }
        } else {
            console.log('❌ CLIENT: account_breakdown ET lastAccountBreakdown sont undefined ou null');
        }
        
        // Mettre à jour les valeurs des cartes
        document.getElementById('total-spent-amount').textContent = formatCurrency(stats.totalSpent || 0);
        document.getElementById('total-remaining-amount').textContent = formatCurrency(stats.totalRemaining || 0);
        document.getElementById('total-credited-with-expenses').textContent = formatCurrency(stats.totalCreditedWithExpenses || 0);
        document.getElementById('total-credited-general').textContent = formatCurrency(stats.totalCreditedGeneral || 0);
        document.getElementById('total-depot-balance').textContent = formatCurrency(stats.totalDepotBalance || 0);
        document.getElementById('total-partner-balance').textContent = formatCurrency(stats.totalPartnerBalance || 0);
        document.getElementById('pl-sans-stock-charges').textContent = formatCurrency(stats.plSansStockCharges || 0);
        document.getElementById('pl-estim-charges').textContent = formatCurrency(stats.plEstimCharges || 0);
        document.getElementById('pl-brut').textContent = formatCurrency(stats.plBrut || 0);
        
        // Mettre à jour la carte virements du mois
        if (stats.plCalculationDetails && stats.plCalculationDetails.virementsMois !== undefined) {
            const virementsElement = document.getElementById('virements-mois-amount');
            if (virementsElement) {
                virementsElement.textContent = formatCurrency(stats.plCalculationDetails.virementsMois);
            }
        }
        
        // Mettre à jour les dépenses des mois précédents dans le tableau
        const expensesTable = document.querySelector('.expenses-table tbody');
        if (expensesTable && stats.previousMonthsExpenses) {
            const rows = expensesTable.querySelectorAll('tr');
            rows.forEach(row => {
                const accountName = row.querySelector('td:first-child').textContent;
                const previousMonthsCell = row.querySelector('td:nth-child(4)');
                if (previousMonthsCell) {
                    const accountData = stats.previousMonthsExpenses.find(acc => acc.account_name === accountName);
                    if (accountData) {
                        previousMonthsCell.textContent = formatCurrency(accountData.previous_months_spent);
                    }
                }
            });
        }
        
        // Mettre à jour la carte de solde principale avec le solde calculé dynamiquement
        // (surtout important quand cutoff_date est utilisé)
        // UTILISER LE NOUVEAU CALCUL BASÉ SUR balance_at_end_date AU LIEU DE totalRemaining
        let nouveauSolde = 0;
        const accountData = stats.account_breakdown || lastAccountBreakdown; // Utiliser le cache si nécessaire
        if (Array.isArray(accountData)) {
            console.log('💰 updateStatsCards: Utilisation de', accountData.length, 'comptes pour le calcul');
            accountData.forEach(acc => {
                const name = (acc.account || '').toLowerCase();
                if (
                    name.includes('classique') ||
                    name.includes('statut') ||
                    name.includes('ajustement') ||
                    (!name.includes('partenaire') && 
                     !name.includes('fournisseur') && 
                     !name.includes('depot'))
                ) {
                    if (typeof acc.remaining !== 'undefined') {
                        nouveauSolde += parseInt(acc.remaining) || 0;
                    } else if (typeof acc.current_balance !== 'undefined') {
                        nouveauSolde += parseInt(acc.current_balance) || 0;
                    } else if (typeof acc.total_credited !== 'undefined' && typeof acc.spent !== 'undefined') {
                        nouveauSolde += (parseInt(acc.total_credited) || 0) - (parseInt(acc.spent) || 0);
                    }
                }
            });
        }
        
        if (cutoffDate || (startDate && endDate)) {
            document.getElementById('solde-amount').textContent = formatCurrency(nouveauSolde);
            console.log('💰 updateStatsCards: Solde principal mis à jour avec NOUVEAU CALCUL:', formatCurrency(nouveauSolde));
            console.log('💰 updateStatsCards: (ancienne valeur totalRemaining était:', formatCurrency(stats.totalRemaining || 0), ')');
        }
        
        // Afficher les détails du calcul du solde dans la console client
        console.group('🔍 DÉTAIL CALCUL SOLDE (dynamique)');
        console.log('📅 Date de référence:', cutoffDate || endDate || 'Date actuelle');
        console.log('💰 Formule utilisée: Total Crédité - Dépenses jusqu\'à la date de référence');
        console.log('📊 Comptes inclus: Tous sauf dépôts, partenaires et créances');
        if (cutoffDate) {
            console.log('🎯 Mode Snapshot: Solde calculé jusqu\'au', cutoffDate);
        } else if (startDate && endDate) {
            console.log('🎯 Mode Période: Solde calculé jusqu\'au', endDate);
        } else {
            console.log('🎯 Mode Actuel: Solde calculé à aujourd\'hui');
        }
        console.log('');
        console.log('💸 ===== DÉPENSES TOTAUX (MISE EN EXERGUE) =====');
        console.log('💸 🔥 MONTANT TOTAL DÉPENSÉ:', formatCurrency(stats.totalSpent || 0));
        console.log('💸 📅 Période de calcul:', (cutoffDate ? `Du début du mois au ${cutoffDate}` : (startDate && endDate ? `Du ${startDate} au ${endDate}` : 'Aujourd\'hui')));
        console.log('💸 ================================================');
        console.log('');
        console.log('');
        console.log('📋 ===== TOTAUX CRÉDITÉS (COMPARAISON) =====');
        console.log('📋 🎯 Total Crédité avec ACTIVITÉ:', formatCurrency(stats.totalCreditedWithExpenses || 0));
        console.log('📋    └─ Comptes ayant eu des dépenses dans la période seulement');
        console.log('📋 🌐 Total Crédité GÉNÉRAL:', formatCurrency(stats.totalCreditedGeneral || 0));
        console.log('📋    └─ TOUS les comptes actifs (avec ou sans dépenses)');
        
        const difference = (stats.totalCreditedGeneral || 0) - (stats.totalCreditedWithExpenses || 0);
        if (difference === 0) {
            console.log('📋 ✅ RÉSULTAT: Identiques - Tous les comptes ont eu des dépenses');
        } else {
            console.log('📋 📊 DIFFÉRENCE:', formatCurrency(difference), '(comptes sans activité)');
        }
        console.log('📋 =============================================');
        console.log('💵 ✅ SOLDE FINAL CALCULÉ:', formatCurrency(nouveauSolde || 0));
        console.groupEnd();
        
        // Afficher les détails du calcul PL dans la console du navigateur (F12)
        if (stats.plCalculationDetails) {
            console.group('🔍 DÉTAIL CALCUL PL (sans stock + estim. charges)');
            console.log('💰 Cash Bictorys du mois:', formatCurrency(stats.plCalculationDetails.cashBictorys));
            console.log('💳 Créances du mois:', formatCurrency(stats.plCalculationDetails.creances));
            console.log('💵 Remboursements du mois:', formatCurrency(stats.plCalculationDetails.remboursements || 0));
            console.log('🔍 CLIENT: Valeur brute remboursements =', stats.plCalculationDetails.remboursements);
            console.log('💸 Virements du mois:', formatCurrency(stats.plCalculationDetails.virementsMois || 0));
            console.log('📦 Écart Stock Mata Mensuel:', formatCurrency(stats.plCalculationDetails.stockPointVente));
            console.log('💸 Cash Burn du mois:', formatCurrency(stats.plCalculationDetails.cashBurn));
            console.log('📊 PL de base =', 
                formatCurrency(stats.plCalculationDetails.cashBictorys), '+',
                formatCurrency(stats.plCalculationDetails.creances), '-',
                formatCurrency(stats.plCalculationDetails.remboursements || 0), '+',
                formatCurrency(stats.plCalculationDetails.virementsMois || 0), '+',
                formatCurrency(stats.plCalculationDetails.stockPointVente), '-',
                formatCurrency(stats.plCalculationDetails.cashBurn), '=',
                formatCurrency(stats.plCalculationDetails.plBase)
            );
            console.log('🌱 Écart Stock Vivant Mensuel:', formatCurrency(stats.plCalculationDetails.stockVivantVariation || 0));
            console.log('🚚 Livraisons partenaires du mois:', formatCurrency(stats.plCalculationDetails.livraisonsPartenaires || 0));
            console.log('⚙️ Estimation charges fixes mensuelle:', formatCurrency(stats.plCalculationDetails.chargesFixesEstimation));
            if (stats.plCalculationDetails.prorata.totalJours > 0) {
                console.log('📅 Date actuelle:', 
                    `${stats.plCalculationDetails.date.jour}/${stats.plCalculationDetails.date.mois}/${stats.plCalculationDetails.date.annee}`
                );
                console.log('📅 Jours ouvrables écoulés (lundi-samedi):', stats.plCalculationDetails.prorata.joursEcoules);
                console.log('📅 Total jours ouvrables dans le mois:', stats.plCalculationDetails.prorata.totalJours);
                console.log('📅 Pourcentage du mois écoulé:', stats.plCalculationDetails.prorata.pourcentage + '%');
                console.log('💸 Calcul prorata:', 
                    formatCurrency(stats.plCalculationDetails.chargesFixesEstimation), '×',
                    `${stats.plCalculationDetails.prorata.joursEcoules}/${stats.plCalculationDetails.prorata.totalJours}`, '=',
                    formatCurrency(stats.plCalculationDetails.chargesProrata)
                );
            }
            console.log('⏰ Charges prorata (jours ouvrables):', formatCurrency(stats.plCalculationDetails.chargesProrata));
            console.log('🎯 PL FINAL =', 
                formatCurrency(stats.plCalculationDetails.plBase), '+',
                formatCurrency(stats.plCalculationDetails.stockVivantVariation || 0), '-',
                formatCurrency(stats.plCalculationDetails.chargesProrata), '-',
                formatCurrency(stats.plCalculationDetails.livraisonsPartenaires || 0), '=',
                formatCurrency(stats.plCalculationDetails.plFinal)
            );
            if (stats.plCalculationDetails.error) {
                console.error('❌ Erreur dans le calcul:', stats.plCalculationDetails.error);
            }
            console.groupEnd();
            
            // Stocker les détails PL pour le modal
            window.currentPLDetails = stats.plCalculationDetails;
        }
        
        // Stocker les PL alternatifs pour le modal
        if (stats.plAlternatifs) {
            window.currentPLAlternatifs = stats.plAlternatifs;
            console.log('📊 CLIENT: PL alternatifs stockés pour le modal:', Object.keys(stats.plAlternatifs).length);
        }
        
        // Mettre à jour les périodes
        const periodText = startDate && endDate ? 
            `Du ${formatDate(startDate)} au ${formatDate(endDate)}` : 
            'Période sélectionnée';
        
        console.log('🎯 updateStatsCards: AVANT mise à jour des périodes');
        document.getElementById('spent-period').textContent = periodText;
        document.getElementById('remaining-period').textContent = 'Soldes actuels';
        document.getElementById('credited-expenses-period').textContent = 'Comptes avec activité';
        document.getElementById('credited-general-period').textContent = 'Tous les comptes';
        console.log('🎯 updateStatsCards: APRÈS mise à jour des périodes');
        
        // Créer dynamiquement les cartes PL alternatifs
        if (stats.plAlternatifs && Object.keys(stats.plAlternatifs).length > 0) {
            console.log('📊 CLIENT: Création des cartes PL alternatifs:', Object.keys(stats.plAlternatifs).length);
            
            // Trouver la première stats-grid qui contient les cartes PL principales
            const mainStatsGrid = document.querySelector('.stats-grid');
            if (!mainStatsGrid) return;
            
            // Supprimer les anciennes cartes PL alternatifs si elles existent
            const oldAltCards = mainStatsGrid.querySelectorAll('[id^="pl-alt-"]');
            oldAltCards.forEach(card => card.remove());
            
            for (const [configKey, plAlt] of Object.entries(stats.plAlternatifs)) {
                console.log(`📊 CLIENT: Création carte pour "${plAlt.nom}"`);
                
                const cardDiv = document.createElement('div');
                cardDiv.className = 'stat-card';
                cardDiv.id = `pl-alt-${configKey}`;
                // Visibilité contrôlée par le rôle utilisateur dans showApp()
                cardDiv.style.display = ['directeur_general', 'pca', 'admin'].includes(currentUser?.role) ? 'block' : 'none';
                cardDiv.title = `PL excluant les dépenses de: ${plAlt.comptesExclus.join(', ')}`;
                
                // Create stat-icon div
                const iconDiv = document.createElement('div');
                iconDiv.className = 'stat-icon';
                const icon = document.createElement('i');
                icon.className = 'fas fa-filter';
                iconDiv.appendChild(icon);
                cardDiv.appendChild(iconDiv);
                
                // Create stat-content div
                const contentDiv = document.createElement('div');
                contentDiv.className = 'stat-content';
                
                // Create h3 title
                const title = document.createElement('h3');
                title.textContent = 'PL sans ' + plAlt.nom;
                contentDiv.appendChild(title);
                
                // Create stat-value paragraph
                const valueP = document.createElement('p');
                valueP.className = 'stat-value';
                valueP.textContent = formatCurrency(plAlt.plFinal);
                contentDiv.appendChild(valueP);
                
                // Create config key small
                const configSmall = document.createElement('small');
                configSmall.className = 'stat-period';
                configSmall.style.cssText = 'font-size: 0.7em; color: #999;';
                configSmall.textContent = '🔑 ' + configKey;
                contentDiv.appendChild(configSmall);
                
                // Create details small
                const detailsSmall = document.createElement('small');
                detailsSmall.className = 'stat-period';
                detailsSmall.style.cssText = 'font-size: 0.75em; color: #666; white-space: pre-line;';
                detailsSmall.textContent = 'Excluant: ' + plAlt.comptesExclus.join(', ') + '\nCash Burn: ' + formatCurrency(plAlt.cashBurn) + ' | Exclus: ' + formatCurrency(plAlt.depensesExclues);
                contentDiv.appendChild(detailsSmall);
                
                cardDiv.appendChild(contentDiv);
                mainStatsGrid.appendChild(cardDiv);
            }
            
            console.log('✅ CLIENT: Cartes PL alternatifs créées et ajoutées à la grille principale');
        }
        
        console.log('✅ updateStatsCards: Mise à jour terminée avec succès');
        console.log('🎯 updateStatsCards: SORTIE du TRY avec succès');
        
    } catch (error) {
        console.log('🎯 updateStatsCards: ENTRÉE dans le CATCH');
        console.error('❌ updateStatsCards: Erreur chargement statistiques cartes:', error);
        
        console.log('🎯 updateStatsCards: AVANT gestion valeurs par défaut');
        // Afficher des valeurs par défaut en cas d'erreur
        const defaultElements = [
            'total-spent-amount', 'total-remaining-amount', 'total-credited-with-expenses',
            'total-credited-general', 'total-depot-balance', 'total-partner-balance', 
            'pl-sans-stock-charges', 'pl-estim-charges', 'pl-brut'
        ];
        
        defaultElements.forEach(elementId => {
            const element = document.getElementById(elementId);
            if (element) {
                element.textContent = '0 FCFA';
            }
        });
        console.log('🎯 updateStatsCards: APRÈS gestion valeurs par défaut');
        
        // Ne pas relancer l'erreur pour permettre au finally parent de s'exécuter
        console.warn('⚠️ updateStatsCards: Erreur gérée, continuant l\'exécution');
        console.log('🎯 updateStatsCards: SORTIE du CATCH');
    }
    console.log('🎯 updateStatsCards: ===== FIN FONCTION =====');
}

function createChart(containerId, data, type) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    if (!data || data.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #666;">Aucune donnée disponible</p>';
        return;
    }
    const showZeroAccounts = document.getElementById('show-zero-accounts')?.checked || false;
    let filteredData;
    if (type === 'account') {
        if (showZeroAccounts) {
            filteredData = data;
        } else {
            filteredData = data.filter(item => {
                const spent = parseInt(item.spent) || parseInt(item.amount) || 0;
                const balance = parseInt(item.current_balance) || 0;
                const totalCredited = parseInt(item.total_credited) || 0;
                return spent > 0 || balance > 0 || totalCredited > 0;
            });
        }
    } else {
        filteredData = data.filter(item => item.amount > 0);
    }
    if (filteredData.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #666;">Aucune dépense pour cette période</p>';
        return;
    }
    
    // Ajouter le bouton toggle pour les colonnes avancées si c'est un tableau de comptes
    if (type === 'account') {
        const toggleAdvancedBtn = document.createElement('div');
        toggleAdvancedBtn.style.cssText = 'margin-bottom: 15px; text-align: right;';
        toggleAdvancedBtn.innerHTML = `
            <button id="toggle-advanced-columns" class="btn btn-outline-secondary" style="border-radius: 10px; padding: 8px 15px; font-weight: 500; border: 2px solid #6c757d; color: #6c757d; background: white; transition: all 0.3s ease;">
                <i class="fas fa-eye" style="margin-right: 5px;"></i>Afficher colonnes avancées
            </button>
        `;
        container.appendChild(toggleAdvancedBtn);
        
        // Ajouter l'événement pour le toggle
        const toggleButton = toggleAdvancedBtn.querySelector('#toggle-advanced-columns');
        toggleButton.addEventListener('click', toggleAdvancedColumns);
    }
    
    const table = document.createElement('table');
    table.className = 'summary-table';
    const thead = document.createElement('thead');
    let headerRow = '';
    if (type === 'account') {
        headerRow = `
            <tr>
                            <th>Compte</th>
                            <th>Montant Restant</th>
                <th>Montant Dépensé</th>
                <th>Crédit du mois</th>
                <th style="display: none;" class="advanced-column">Montant début mois</th>
                <th>Balance du mois</th>
                <th style="display: none;" class="advanced-column">Dépenses mois précédents</th>
                <th>Total Crédité</th>
            </tr>
        `;
    } else {
        headerRow = `
            <tr>
                <th>Catégorie</th>
                <th>Montant Dépensé</th>
                <th colspan="2">Pourcentage</th>
            </tr>
        `;
    }
    thead.innerHTML = headerRow;
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    let totalExpenses = 0;
    if (type === 'category') {
        totalExpenses = filteredData.reduce((sum, item) => sum + (parseInt(item.amount) || 0), 0);
    }
    filteredData.forEach(item => {
        const row = document.createElement('tr');
        let label = '';
        if (type === 'account') {
            label = item.account;
        } else if (type === 'category') {
            label = item.category;
        } else {
            label = item.category || item.user || item.account;
        }
        if (type === 'account') {
            const spent = parseInt(item.spent) || 0;
            const totalCredited = parseInt(item.total_credited) || 0;
            const remaining = parseInt(item.current_balance) || 0;
            const previousMonths = totalCredited - remaining - spent;
            const monthlyCredits = parseInt(item.monthly_credits) || 0;
            const monthlyTransfers = parseInt(item.net_transfers) || 0;
            const montantDebutMois = parseInt(item.montant_debut_mois) || 0;
            
            // Calculer la balance du mois selon le type de compte
            let monthlyBalance;
            if (item.account_type === 'classique') {
                monthlyBalance = parseInt(item.monthly_balance) || (monthlyCredits - spent + monthlyTransfers + montantDebutMois);
            } else {
                monthlyBalance = parseInt(item.monthly_balance) || (monthlyCredits - spent + monthlyTransfers);
            }
            
            // 🔍 LOGS DEBUG - Balance du mois
            if (item.account === 'Compte Directeur Commercial') {
                console.group('🔍 DEBUG CLIENT - Compte Directeur Commercial');
                console.log('📊 Données reçues du serveur:', item);
                console.log('🏷️ Type de compte:', item.account_type);
                console.log('💰 monthly_credits:', item.monthly_credits);
                console.log('💸 spent:', spent);
                console.log('🔄 net_transfers:', monthlyTransfers);
                console.log('📅 montant_debut_mois:', montantDebutMois);
                console.log('📈 monthly_balance du serveur:', item.monthly_balance);
                console.log('📈 monthly_balance calculé côté client:', monthlyBalance);
                if (item.account_type === 'classique') {
                    console.log('📊 Formule (classique): ' + monthlyCredits + ' - ' + spent + ' + ' + monthlyTransfers + ' + ' + montantDebutMois + ' = ' + monthlyBalance);
                } else {
                    console.log('📊 Formule (standard): ' + monthlyCredits + ' - ' + spent + ' + ' + monthlyTransfers + ' = ' + monthlyBalance);
                }
                console.groupEnd();
            }
            
            row.innerHTML = `
                <td class="label-cell">
                  <span class="clickable-account-name" onclick="showAccountExpenseDetails('${label}', ${spent}, ${remaining}, ${totalCredited}, {
                    account: '${label}',
                    account_type: '${item.account_type || ''}',
                    totalCredited: ${totalCredited},
                    currentBalance: ${remaining},
                    spent: ${spent},
                    monthly_credits: ${monthlyCredits},
                    monthly_balance: ${monthlyBalance},
                    net_transfers: ${monthlyTransfers},
                    montant_debut_mois: ${montantDebutMois}
                  })" 
                        style="cursor: pointer; color: #007bff; text-decoration: underline;" 
                        title="Type: ${item.account_type || 'N/A'} • Cliquer pour voir les détails">
                    ${label}
                  </span>
                </td>
                <td class="amount-cell remaining">${formatCurrency(remaining)}</td>
                <td class="amount-cell spent">${formatCurrency(spent)}</td>
                <td class="amount-cell monthly-credits" style="color: ${monthlyCredits > 0 ? 'green' : 'gray'}; font-weight: bold;">${formatCurrency(monthlyCredits)}</td>
                <td class="amount-cell montant-debut-mois advanced-column" style="display: none; color: ${item.account_type === 'classique' ? (montantDebutMois >= 0 ? 'green' : 'red') : 'gray'}; font-weight: ${item.account_type === 'classique' ? 'bold' : 'normal'};">${item.account_type === 'classique' ? formatCurrency(montantDebutMois) : '-'}</td>
                <td class="amount-cell monthly-balance">${formatCurrency(monthlyBalance)}</td>
                <td class="amount-cell previous advanced-column" style="display: none;">${formatCurrency(previousMonths)}</td>
                <td class="amount-cell total">${formatCurrency(totalCredited)}</td>
            `;
        } else {
            const amount = parseInt(item.amount) || 0;
            const percentage = totalExpenses > 0 ? ((amount / totalExpenses) * 100).toFixed(1) : 0;
            row.innerHTML = `
                <td class="label-cell">${label}</td>
                <td class="amount-cell spent">${formatCurrency(amount)}</td>
                <td class="amount-cell percentage" colspan="2">${percentage}%</td>
            `;
        }
        tbody.appendChild(row);
    });
    table.appendChild(tbody);
    container.appendChild(table);
}

// Fonction pour afficher/masquer les colonnes avancées du dashboard
function toggleAdvancedColumns() {
    const advancedColumns = document.querySelectorAll('.advanced-column');
    const toggleButton = document.getElementById('toggle-advanced-columns');
    
    if (!advancedColumns.length || !toggleButton) return;
    
    const isHidden = advancedColumns[0].style.display === 'none';
    
    advancedColumns.forEach(column => {
        column.style.display = isHidden ? 'table-cell' : 'none';
    });
    
    // Mettre à jour le texte et l'icône du bouton
    if (isHidden) {
        toggleButton.innerHTML = '<i class="fas fa-eye-slash" style="margin-right: 5px;"></i>Masquer colonnes avancées';
        toggleButton.style.background = '#6c757d';
        toggleButton.style.color = 'white';
        toggleButton.style.borderColor = '#6c757d';
    } else {
        toggleButton.innerHTML = '<i class="fas fa-eye" style="margin-right: 5px;"></i>Afficher colonnes avancées';
        toggleButton.style.background = 'white';
        toggleButton.style.color = '#6c757d';
        toggleButton.style.borderColor = '#6c757d';
    }
}

// Gestion des dépenses
async function loadExpenses() {
    try {
        const startDate = document.getElementById('filter-start-date').value;
        const endDate = document.getElementById('filter-end-date').value;
        
        let url = '/api/expenses';
        const params = new URLSearchParams();
        
        if (startDate) params.append('start_date', startDate);
        if (endDate) params.append('end_date', endDate);
        
        if (params.toString()) {
            url += '?' + params.toString();
        }
        
        const response = await fetch(url);
        const expenses = await response.json();
        
        displayExpenses(expenses);
        
    } catch (error) {
        console.error('Erreur chargement dépenses:', error);
    }
}
function displayExpenses(expenses) {
    console.log('🎯 DISPLAY EXPENSES: Début affichage des dépenses');
    console.log('🎯 DISPLAY EXPENSES: Nombre de dépenses reçues:', expenses.length);
    
    const tbody = document.getElementById('expenses-tbody');
    tbody.innerHTML = '';
    
    const colSpan = ['directeur', 'directeur_general', 'pca', 'admin'].includes(currentUser.role) ? '17' : '16';
    
    if (expenses.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${colSpan}" style="text-align: center;">Aucune dépense trouvée</td></tr>`;
        return;
    }
    
    expenses.forEach(expense => {
        const row = document.createElement('tr');
        row.className = 'expense-row';
        row.dataset.expenseId = expense.id;
        
        // Qui peut modifier quoi ?
        const isCreator = expense.username === currentUser.username;
        const viewerIsPowerUser = ['directeur_general', 'pca', 'admin'].includes(currentUser.role);
        const isComptable = currentUser.role === 'comptable';
        // Assurez-vous que l'API renvoie bien `expense.user_role`
        const expenseIsFromPowerUser = ['directeur_general', 'pca', 'admin'].includes(expense.user_role);

        let canEdit = false;
        let cantEditReason = "";

        if (isComptable) {
            // Le comptable ne peut jamais modifier
            canEdit = false;
            cantEditReason = "Le rôle Comptable est en lecture seule.";
        } else if (viewerIsPowerUser) {
            // Un super-utilisateur (DG/PCA/Admin) peut modifier...
            if (isCreator) {
                canEdit = true; // ...ses propres dépenses.
            } else if (expenseIsFromPowerUser) {
                canEdit = false; // ...mais PAS celles d'un autre super-utilisateur.
                cantEditReason = "Vous ne pouvez pas modifier la dépense d'un autre administrateur/DG/PCA.";
            } else {
                canEdit = true; // ...les dépenses des utilisateurs standards (directeurs).
            }
        } else if (currentUser.role === 'directeur') {
            // Un directeur...
            if (isCreator) {
                 // ...peut modifier ses propres dépenses, mais avec une limite de temps.
                 const expenseDate = new Date(expense.created_at);
                 const now = new Date();
                 const hoursDifference = (now - expenseDate) / (1000 * 60 * 60);
                 if (hoursDifference > 24) {
                     canEdit = false;
                     cantEditReason = "Modification non autorisée - Plus de 24 heures écoulées.";
                 } else {
                     canEdit = true;
                 }
            } else {
                // ...ne peut PAS modifier les dépenses des autres.
                canEdit = false; 
                cantEditReason = "Vous ne pouvez modifier que vos propres dépenses.";
            }
        }
        
        // Déterminer si la dépense a été créée par un "power user" pour l'affichage
        const isDGExpenseOnDirectorAccount = expenseIsFromPowerUser && !isCreator;

        // Ajouter un style pour les dépenses faites par un autre utilisateur (souvent DG/Admin)
        if (isDGExpenseOnDirectorAccount) {
            row.style.fontStyle = 'italic';
            row.style.opacity = '0.8';
            row.title = `Dépense effectuée par ${expense.username} (${expense.user_role})`;
        }
        
        // Bouton pour télécharger le justificatif
        const justificationButton = expense.has_justification ? 
            `<button class="btn btn-sm btn-primary" onclick="downloadJustification(${expense.id})" title="Télécharger le justificatif">
                <i class="fas fa-download"></i>
            </button>` : 
            '<span style="color: #999;">Aucun</span>';
        
        // Bouton pour voir les détails (toujours disponible)
        const viewDetailsButton = `<button class="btn btn-sm btn-info" onclick="openViewDetailsModal(${expense.id})" title="Voir les détails de la dépense">
            <i class="fas fa-eye"></i>
        </button>`;
        
        // Bouton pour modifier la dépense avec la nouvelle logique
        let editButton = '';
        if (isComptable) {
            // Comptable: pas de bouton d'édition du tout (lecture seule)
            editButton = '';
        } else if (canEdit) {
            if (currentUser.role === 'directeur') {
                const expenseDate = new Date(expense.created_at);
                const now = new Date();
                const hoursDifference = (now - expenseDate) / (1000 * 60 * 60);
                const remainingHours = 24 - hoursDifference;

                if (remainingHours <= 12) {
                    editButton = `<button class="btn btn-sm btn-warning" onclick="openEditModal(${expense.id})" title="⚠️ Il reste ${Math.floor(remainingHours)}h${Math.floor((remainingHours % 1) * 60)}min pour modifier">
                        <i class="fas fa-edit"></i> <i class="fas fa-exclamation-triangle" style="font-size: 0.7em;"></i>
                    </button>`;
                } else {
                    editButton = `<button class="btn btn-sm btn-warning" onclick="openEditModal(${expense.id})" title="Modifier la dépense (${Math.floor(remainingHours)}h restantes)">
                        <i class="fas fa-edit"></i>
                    </button>`;
                }
            } else {
                 editButton = `<button class="btn btn-sm btn-warning" onclick="openEditModal(${expense.id})" title="Modifier la dépense">
                    <i class="fas fa-edit"></i>
                </button>`;
            }
        } else {
            // Afficher une icône de verrouillage avec la raison
            editButton = `<span style="color: #999;" title="${cantEditReason}"><i class="fas fa-lock"></i></span>`;
        }
        
        // Checkbox cochée selon l'état selected_for_invoice
        const isChecked = expense.selected_for_invoice ? 'checked' : '';
        
        // Formater les dates
        const expenseDate = formatDate(expense.expense_date);
        
        const timestamp = new Date(expense.timestamp_creation);
        const timestampDate = timestamp.toLocaleDateString('fr-FR');
        const timestampTime = timestamp.toLocaleTimeString('fr-FR', { 
            hour: '2-digit', 
            minute: '2-digit' 
        });

        row.innerHTML = `
            <td>
                <input type="checkbox" class="expense-checkbox" data-expense-id="${expense.id}" ${isChecked}>
            </td>
            <td>${expenseDate}</td>
            <td>${timestampDate}<br><small class="text-muted">${timestampTime}</small></td>
            <td title="${expense.category_name}">${expense.category_name.length > 25 ? expense.category_name.substring(0, 25) + '...' : expense.category_name}</td>
            <td title="${expense.designation || ''}">${expense.designation ? (expense.designation.length > 20 ? expense.designation.substring(0, 20) + '...' : expense.designation) : '-'}</td>
            <td title="${expense.supplier || ''}">${expense.supplier ? (expense.supplier.length > 15 ? expense.supplier.substring(0, 15) + '...' : expense.supplier) : '-'}</td>
            <td>${expense.quantity || '-'}</td>
            <td>${expense.unit_price ? formatCurrency(expense.unit_price) : '-'}</td>
            <td><strong>${formatCurrency(parseInt(expense.total || expense.amount))}</strong></td>
            <td title="${expense.description || ''}">${expense.description ? (expense.description.length > 30 ? expense.description.substring(0, 30) + '...' : expense.description) : '-'}</td>
            <td>
                <span class="badge ${expense.predictable === 'oui' ? 'badge-success' : 'badge-warning'}">
                    ${expense.predictable === 'oui' ? 'Oui' : 'Non'}
                </span>
            </td>
            <td>${justificationButton}</td>
            <td title="${expense.account_name || ''}">${expense.account_name ? (expense.account_name.length > 15 ? expense.account_name.substring(0, 15) + '...' : expense.account_name) : '-'}</td>
            <td>${expense.username || '-'}${isDGExpenseOnDirectorAccount ? ` <small style="color: #007bff;">(${expense.user_role})</small>` : ''}</td>
            ${['directeur', 'directeur_general', 'pca', 'admin'].includes(currentUser.role) ? `<td>${expense.user_name}</td>` : ''}
            <td>
                <div class="action-buttons">
                    ${viewDetailsButton}
                    ${editButton}
                    ${generateDeleteButton(expense, isDGExpenseOnDirectorAccount)}
                </div>
            </td>
        `;
        
        if (expense.selected_for_invoice) {
            row.classList.add('selected');
        }
        
        tbody.appendChild(row);
    });
    
    document.querySelectorAll('.expense-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', function() {
            const expenseId = this.dataset.expenseId;
            const isSelected = this.checked;
            toggleExpenseSelection(expenseId, isSelected);
        });
    });
    
    updateSelectedCount();
    
    // Mettre à jour le total des dépenses affichées
    updateExpensesTotal(expenses);
    
    console.log('🎯 DISPLAY EXPENSES: Affichage terminé');
}

// Fonction pour télécharger un justificatif
async function downloadJustification(expenseId) {
    try {
        const response = await fetch(`/api/expenses/${expenseId}/justification`);
        
        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            
            // Récupérer le nom du fichier depuis les headers
            const contentDisposition = response.headers.get('content-disposition');
            let filename = 'justificatif';
            if (contentDisposition) {
                const filenameMatch = contentDisposition.match(/filename="(.+)"/);
                if (filenameMatch) {
                    filename = filenameMatch[1];
                }
            }
            
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            
            showNotification('Justificatif téléchargé avec succès', 'success');
        } else {
            const error = await response.json();
            throw new Error(error.error);
        }
    } catch (error) {
        showNotification(`Erreur: ${error.message}`, 'error');
    }
}

// Fonction pour générer le bouton de suppression
function generateDeleteButton(expense, isDGExpenseOnDirectorAccount) {
    // Même logique que pour le bouton d'édition
    let deleteButton = '';
    
    // Comptable: accès en lecture seule, aucun bouton de suppression
    if (currentUser.role === 'comptable') {
        return '';
    }
    
    if (isDGExpenseOnDirectorAccount && currentUser.role === 'directeur') {
        // Dépense du DG sur compte directeur - seuls les directeurs simples ne peuvent pas supprimer
        deleteButton = '<span style="color: #999;" title="Seul le Directeur Général peut supprimer cette dépense"><i class="fas fa-lock"></i></span>';
    } else if (currentUser.role === 'directeur') {
        // Vérifier la restriction de 24 heures pour les directeurs simples (leurs propres dépenses)
        const expenseDate = new Date(expense.created_at);
        const now = new Date();
        const hoursDifference = (now - expenseDate) / (1000 * 60 * 60);
        
        if (hoursDifference > 24) {
            deleteButton = '<span style="color: #dc3545;" title="Suppression non autorisée - Plus de 24 heures écoulées"><i class="fas fa-clock"></i></span>';
        } else {
            const remainingHours = 24 - hoursDifference;
            if (remainingHours <= 12) {
                // Avertissement - proche de la limite
                deleteButton = `<button class="btn btn-sm btn-danger" onclick="deleteExpense(${expense.id})" title="⚠️ Il reste ${Math.floor(remainingHours)}h${Math.floor((remainingHours % 1) * 60)}min pour supprimer">
                    <i class="fas fa-trash"></i> <i class="fas fa-exclamation-triangle" style="font-size: 0.7em;"></i>
                </button>`;
            } else {
                // Suppression normale
                deleteButton = `<button class="btn btn-sm btn-danger" onclick="deleteExpense(${expense.id})" title="Supprimer la dépense (${Math.floor(remainingHours)}h restantes)">
                    <i class="fas fa-trash"></i>
                </button>`;
            }
        }
    } else if (['directeur_general', 'pca', 'admin'].includes(currentUser.role)) {
        // DG, PCA et Admin peuvent toujours supprimer
        deleteButton = `<button class="btn btn-sm btn-danger" onclick="deleteExpense(${expense.id})" title="Supprimer la dépense">
            <i class="fas fa-trash"></i>
        </button>`;
    }
    
    return deleteButton;
}

// Fonction pour supprimer une dépense
async function deleteExpense(expenseId) {
    // Demander confirmation
    if (!confirm('Êtes-vous sûr de vouloir supprimer cette dépense ? Cette action est irréversible.')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/expenses/${expenseId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' }
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showNotification(result.message, 'success');
            // Recharger les dépenses
            await loadExpenses();
            
            // Recharger le dashboard si affiché
            const dashboardSection = document.getElementById('dashboard-section');
            if (dashboardSection && dashboardSection.classList.contains('active') && typeof loadDashboard === 'function') {
                await loadDashboard();
            }
            
            // Recharger la liste des comptes si affichée
            if (typeof loadAccounts === 'function') {
                const accountsSection = document.getElementById('manage-accounts-section');
                if (accountsSection && accountsSection.classList.contains('active')) {
                    await loadAccounts();
                }
            }
        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        console.error('Erreur suppression dépense:', error);
        showNotification(`Erreur: ${error.message}`, 'error');
    }
}

// Fonctions pour la gestion des factures
function updateSelectedCount() {
    const checkboxes = document.querySelectorAll('.expense-checkbox:checked');
    const count = checkboxes.length;
    document.getElementById('selected-count').textContent = `${count} dépense(s) sélectionnée(s)`;
    document.getElementById('generate-invoices').disabled = count === 0;
}

async function toggleExpenseSelection(expenseId, isSelected) {
    try {
        const response = await fetch(`/api/expenses/${expenseId}/toggle-selection`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ selected: isSelected })
        });
        
        if (!response.ok) {
            throw new Error('Erreur lors de la mise à jour de la sélection');
        }
        
        // Mettre à jour l'affichage de la ligne
        const row = document.querySelector(`tr[data-expense-id="${expenseId}"]`);
        if (row) {
            if (isSelected) {
                row.classList.add('selected');
            } else {
                row.classList.remove('selected');
            }
        }
        
    } catch (error) {
        console.error('Erreur toggle sélection:', error);
        showNotification('Erreur lors de la mise à jour de la sélection', 'error');
    }
}

async function selectAllExpenses() {
    try {
        const response = await fetch('/api/expenses/select-all', {
            method: 'POST'
        });
        
        if (response.ok) {
            // Recharger les dépenses pour refléter les changements
            await loadExpenses();
            showNotification('Toutes les dépenses ont été sélectionnées', 'success');
        } else {
            throw new Error('Erreur lors de la sélection');
        }
    } catch (error) {
        console.error('Erreur sélection tout:', error);
        showNotification('Erreur lors de la sélection de toutes les dépenses', 'error');
    }
}

async function deselectAllExpenses() {
    try {
        const response = await fetch('/api/expenses/deselect-all', {
            method: 'POST'
        });
        
        if (response.ok) {
            // Recharger les dépenses pour refléter les changements
            await loadExpenses();
            showNotification('Toutes les dépenses ont été désélectionnées', 'success');
        } else {
            throw new Error('Erreur lors de la désélection');
        }
    } catch (error) {
        console.error('Erreur désélection tout:', error);
        showNotification('Erreur lors de la désélection de toutes les dépenses', 'error');
    }
}

async function generateInvoicesPDF() {
    let timeoutId, progressInterval;
    
    try {
        showNotification('Génération du PDF en cours...', 'info');
        
        // Créer un AbortController pour gérer le timeout
        const controller = new AbortController();
        timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minutes timeout
        
        // Afficher un indicateur de progression
        progressInterval = setInterval(() => {
            showNotification('Génération du PDF en cours... (patientez)', 'info');
        }, 10000); // Mettre à jour toutes les 10 secondes
        
        const response = await fetch('/api/expenses/generate-invoices-pdf', {
            method: 'POST',
            signal: controller.signal
        });
        
        clearTimeout(timeoutId); // Nettoyer le timeout si la requête réussit
        clearInterval(progressInterval); // Nettoyer l'intervalle de progression
        
        if (response.ok) {
            // Récupérer les dates du filtre
            const startDate = document.getElementById('filter-start-date').value;
            const endDate = document.getElementById('filter-end-date').value;
            
            // Créer un nom de fichier avec les dates de filtre
            let fileName = 'factures';
            if (startDate && endDate) {
                fileName += `_${startDate.replace(/-/g, '')}_${endDate.replace(/-/g, '')}`;
            } else if (startDate) {
                fileName += `_depuis_${startDate.replace(/-/g, '')}`;
            } else if (endDate) {
                fileName += `_jusqu_${endDate.replace(/-/g, '')}`;
            } else {
                fileName += `_${new Date().toISOString().split('T')[0]}`;
            }
            
            // Ajouter les types de dépenses au nom du fichier si filtré
            if (selectedExpenseTypes.length > 0) {
                fileName += `_${selectedExpenseTypes.length}types`;
            }
            fileName += '.pdf';
            
            // Ouvrir directement l'URL du PDF dans un nouvel onglet avec les filtres
            let pdfUrl = `/api/expenses/generate-invoices-pdf-direct?filename=${encodeURIComponent(fileName)}`;
            
            // Ajouter les dates de filtre si elles sont présentes
            if (startDate) {
                pdfUrl += `&start_date=${encodeURIComponent(startDate)}`;
            }
            if (endDate) {
                pdfUrl += `&end_date=${encodeURIComponent(endDate)}`;
            }
            
            // Ajouter les types de dépenses sélectionnés
            if (selectedExpenseTypes.length > 0) {
                pdfUrl += `&expense_types=${encodeURIComponent(selectedExpenseTypes.join(','))}`;
            }
            
            // Simple redirection vers le PDF
            window.open(pdfUrl, '_blank');
            showNotification('PDF des factures généré avec succès ! Le PDF s\'ouvre dans un nouvel onglet.', 'success');
        } else {
            const error = await response.json();
            throw new Error(error.error);
        }
    } catch (error) {
        console.error('Erreur génération PDF:', error);
        
        // Nettoyer les timeouts et intervalles en cas d'erreur
        if (timeoutId) clearTimeout(timeoutId);
        if (progressInterval) clearInterval(progressInterval);
        
        if (error.name === 'AbortError') {
            showNotification('Erreur: La génération du PDF a pris trop de temps. Veuillez réessayer ou réduire le nombre de dépenses sélectionnées.', 'error');
        } else {
            showNotification(`Erreur: ${error.message}`, 'error');
        }
    }
}

// Variables globales pour le tri et les filtres
let currentExpenses = [];
let currentSortField = 'expense_date';
let currentSortDirection = 'desc';

// Fonction pour charger les dépenses avec filtres avancés
async function loadExpensesWithFilters() {
    try {
        const startDate = document.getElementById('filter-start-date').value;
        const endDate = document.getElementById('filter-end-date').value;
        
        let url = '/api/expenses';
        const params = new URLSearchParams();
        
        if (startDate) params.append('start_date', startDate);
        if (endDate) params.append('end_date', endDate);
        
        if (params.toString()) {
            url += '?' + params.toString();
        }
        
        const response = await fetch(url);
        const expenses = await response.json();
        
        // Stocker les dépenses pour le filtrage côté client
        currentExpenses = expenses;
        
        // Charger les options de filtres
        populateFilterOptions(expenses);
        
        // Initialiser l'état des filtres par type et appliquer le filtre par défaut
        initializeExpenseTypeFilterState();
        applyFiltersAndDisplay(); 
        
    } catch (error) {
        console.error('Erreur chargement dépenses:', error);
    }
}

// Fonction pour peupler les options de filtres
function populateFilterOptions(expenses) {
    // Filtres de comptes
    const accountFilter = document.getElementById('filter-account');
    const accounts = [...new Set(expenses.map(e => e.account_name).filter(Boolean))].sort();
    accountFilter.innerHTML = '<option value="">Tous les comptes</option>';
    accounts.forEach(account => {
        accountFilter.innerHTML += `<option value="${account}">${account}</option>`;
    });
    
    // Filtres de catégories
    const categoryFilter = document.getElementById('filter-category');
    const categories = [...new Set(expenses.map(e => e.category_name).filter(Boolean))].sort();
    categoryFilter.innerHTML = '<option value="">Toutes les catégories</option>';
    categories.forEach(category => {
        categoryFilter.innerHTML += `<option value="${category}">${category}</option>`;
    });
    
    // Filtres d'utilisateurs
    const userFilter = document.getElementById('filter-user');
    const users = [...new Set(expenses.map(e => e.username).filter(Boolean))].sort();
    userFilter.innerHTML = '<option value="">Tous les utilisateurs</option>';
    users.forEach(user => {
        userFilter.innerHTML += `<option value="${user}">${user}</option>`;
    });
    
    // Charger les types de dépenses dynamiquement
    loadExpenseTypeFilters();
}

// Variables globales pour le filtre des types de dépenses
let selectedExpenseTypes = [];

// Fonction pour charger dynamiquement les types de dépenses depuis la base de données
async function loadExpenseTypeFilters() {
    try {
        console.log('🔍 Loading expense types from database...');
        
        const response = await fetch('/api/expense-types');
        if (!response.ok) {
            throw new Error('Failed to fetch expense types');
        }
        
        const expenseTypes = await response.json();
        console.log('📋 Received expense types:', expenseTypes);
        
        // Générer les checkboxes dynamiquement
        generateExpenseTypeCheckboxes(expenseTypes);
        
    } catch (error) {
        console.error('❌ Error loading expense types:', error);
    }
}

// Fonction pour générer dynamiquement les checkboxes des types de dépenses
function generateExpenseTypeCheckboxes(expenseTypes) {
    const container = document.getElementById('expense-type-checkboxes-container');
    container.innerHTML = ''; // Vider le conteneur
    
    // Trier les types : tresorerie en premier s'il existe, puis alphabétique
    const sortedTypes = [...expenseTypes].sort((a, b) => {
        if (a.value === 'tresorerie') return -1;
        if (b.value === 'tresorerie') return 1;
        return a.label.localeCompare(b.label);
    });
    
    sortedTypes.forEach((type, index) => {
        // Determiner si la checkbox doit être cochée par défaut
        // tresorerie est non-cochée, tous les autres sont cochés
        const isChecked = type.value !== 'tresorerie';
        
        // Créer l'élément div conteneur
        const div = document.createElement('div');
        div.style.cssText = index === sortedTypes.length - 1 ? 
            'display: flex; align-items: center;' : 
            'margin-bottom: 8px; display: flex; align-items: center;';
        
        // Créer la checkbox
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `expense-type-${type.value.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
        checkbox.value = type.value;
        checkbox.onchange = onExpenseTypeChange;
        checkbox.checked = isChecked;
        checkbox.style.cssText = 'margin-right: 10px; width: 14px; height: 14px; appearance: auto !important;';
        
        // Créer le label
        const label = document.createElement('label');
        label.htmlFor = checkbox.id;
        label.textContent = `${type.label} (${type.count})`;
        label.style.cssText = 'font-size: 14px; color: #333; cursor: pointer;';
        
        // Ajouter les éléments au div
        div.appendChild(checkbox);
        div.appendChild(label);
        
        // Ajouter le div au conteneur
        container.appendChild(div);
    });
    
    console.log(`✅ Generated ${sortedTypes.length} expense type checkboxes`);
}

// Fonction pour initialiser l'état des filtres par type de dépense au chargement de la page
function initializeExpenseTypeFilterState() {
    const checkboxes = document.querySelectorAll('#expense-type-checkboxes-container input[type="checkbox"]');
    selectedExpenseTypes = [];
    checkboxes.forEach(checkbox => {
        if (checkbox.checked) {
            selectedExpenseTypes.push(checkbox.value);
        }
    });
}

// Fonction appelée quand une checkbox change
function onExpenseTypeChange() {
    const checkboxes = document.querySelectorAll('#expense-type-checkboxes-container input[type="checkbox"]');
    selectedExpenseTypes = [];
    
    checkboxes.forEach(checkbox => {
        if (checkbox.checked) {
            selectedExpenseTypes.push(checkbox.value);
        }
    });
    
    applyFiltersAndDisplay();
}

// Fonction pour effacer le filtre des types de dépenses
function clearExpenseTypeFilter() {
    const checkboxes = document.querySelectorAll('#expense-type-checkboxes-container input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
        checkbox.checked = false;
    });
    selectedExpenseTypes = [];
}

// Fonction pour appliquer les filtres
function applyFiltersAndDisplay() {
    let filteredExpenses = [...currentExpenses];
    
    // Filtrer par compte
    const accountFilter = document.getElementById('filter-account').value;
    if (accountFilter) {
        filteredExpenses = filteredExpenses.filter(e => e.account_name === accountFilter);
    }
    
    // Filtrer par catégorie
    const categoryFilter = document.getElementById('filter-category').value;
    if (categoryFilter) {
        filteredExpenses = filteredExpenses.filter(e => e.category_name === categoryFilter);
    }
    
    // Filtrer par fournisseur
    const supplierFilter = document.getElementById('filter-supplier').value.toLowerCase();
    if (supplierFilter) {
        filteredExpenses = filteredExpenses.filter(e => 
            (e.supplier || '').toLowerCase().includes(supplierFilter)
        );
    }
    
    // Filtrer par prévisible
    const predictableFilter = document.getElementById('filter-predictable').value;
    if (predictableFilter) {
        filteredExpenses = filteredExpenses.filter(e => e.predictable === predictableFilter);
    }
    
    // Filtrer par montant
    const minAmount = parseFloat(document.getElementById('filter-amount-min').value) || 0;
    const maxAmount = parseFloat(document.getElementById('filter-amount-max').value) || Infinity;
    filteredExpenses = filteredExpenses.filter(e => {
        const amount = parseInt(e.total || e.amount);
        return amount >= minAmount && amount <= maxAmount;
    });
    
    // Filtrer par utilisateur
    const userFilter = document.getElementById('filter-user').value;
    if (userFilter) {
        filteredExpenses = filteredExpenses.filter(e => e.username === userFilter);
    }
    
    // Filtrer par types de dépenses sélectionnés
    if (selectedExpenseTypes.length > 0) {
        filteredExpenses = filteredExpenses.filter(e => 
            selectedExpenseTypes.includes(e.expense_type)
        );
    }
    
    // Appliquer le tri
    sortExpenses(filteredExpenses);
    
    // Afficher les résultats
    displayExpenses(filteredExpenses);
    
    // Mettre à jour le compteur
    updateFilteredCount(filteredExpenses.length, currentExpenses.length);
    
    // Mettre à jour le total des dépenses
    updateExpensesTotal(filteredExpenses);
}

// Fonction pour trier les dépenses
function sortExpenses(expenses) {
    expenses.sort((a, b) => {
        let aValue = a[currentSortField];
        let bValue = b[currentSortField];
        
        // Traitement spécial pour les dates
        if (currentSortField === 'expense_date') {
            aValue = new Date(aValue);
            bValue = new Date(bValue);
        }
        
        // Traitement spécial pour les montants
        if (currentSortField === 'total' || currentSortField === 'unit_price') {
            aValue = parseInt(aValue) || 0;
            bValue = parseInt(bValue) || 0;
        }
        
        // Traitement spécial pour les quantités
        if (currentSortField === 'quantity') {
            aValue = parseFloat(aValue) || 0;
            bValue = parseFloat(bValue) || 0;
        }
        
        // Traitement pour les chaînes
        if (typeof aValue === 'string') {
            aValue = aValue.toLowerCase();
            bValue = (bValue || '').toLowerCase();
        }
        
        if (aValue < bValue) return currentSortDirection === 'asc' ? -1 : 1;
        if (aValue > bValue) return currentSortDirection === 'asc' ? 1 : -1;
        return 0;
    });
}

// Fonction pour gérer le clic sur les en-têtes de colonnes
function handleColumnSort(field) {
    if (currentSortField === field) {
        currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        currentSortField = field;
        currentSortDirection = 'desc';
    }
    
    // Mettre à jour les icônes de tri
    updateSortIcons();
    
    // Réappliquer les filtres avec le nouveau tri
    applyFiltersAndDisplay();
}

// Fonction pour mettre à jour les icônes de tri
function updateSortIcons() {
    // Réinitialiser toutes les icônes
    document.querySelectorAll('.sortable i').forEach(icon => {
        icon.className = 'fas fa-sort';
    });
    
    // Mettre à jour l'icône de la colonne active
    const activeHeader = document.querySelector(`[data-sort="${currentSortField}"] i`);
    if (activeHeader) {
        activeHeader.className = currentSortDirection === 'asc' ? 'fas fa-sort-up' : 'fas fa-sort-down';
    }
}

// Fonction pour effacer tous les filtres
function clearAllFilters() {
    document.getElementById('filter-start-date').value = '';
    document.getElementById('filter-end-date').value = '';
    document.getElementById('filter-account').value = '';
    document.getElementById('filter-category').value = '';
    document.getElementById('filter-supplier').value = '';
    document.getElementById('filter-predictable').value = '';
    document.getElementById('filter-amount-min').value = '';
    document.getElementById('filter-amount-max').value = '';
    document.getElementById('filter-user').value = '';
    
    // Réinitialiser le filtre des types de dépenses
    clearExpenseTypeFilter();
    
    // Réappliquer les filtres (qui seront vides)
    applyFiltersAndDisplay();
    
    showNotification('Filtres effacés', 'info');
}

// Fonction pour exporter en CSV
function exportExpensesToCSV() {
    let filteredExpenses = [...currentExpenses];
    
    // Appliquer les mêmes filtres que l'affichage
    const accountFilter = document.getElementById('filter-account').value;
    if (accountFilter) {
        filteredExpenses = filteredExpenses.filter(e => e.account_name === accountFilter);
    }
    
    const categoryFilter = document.getElementById('filter-category').value;
    if (categoryFilter) {
        filteredExpenses = filteredExpenses.filter(e => e.category_name === categoryFilter);
    }
    
    const supplierFilter = document.getElementById('filter-supplier').value.toLowerCase();
    if (supplierFilter) {
        filteredExpenses = filteredExpenses.filter(e => 
            (e.supplier || '').toLowerCase().includes(supplierFilter)
        );
    }
    
    const predictableFilter = document.getElementById('filter-predictable').value;
    if (predictableFilter) {
        filteredExpenses = filteredExpenses.filter(e => e.predictable === predictableFilter);
    }
    
    const minAmount = parseFloat(document.getElementById('filter-amount-min').value) || 0;
    const maxAmount = parseFloat(document.getElementById('filter-amount-max').value) || Infinity;
    filteredExpenses = filteredExpenses.filter(e => {
        const amount = parseInt(e.total || e.amount);
        return amount >= minAmount && amount <= maxAmount;
    });
    
    const userFilter = document.getElementById('filter-user').value;
    if (userFilter) {
        filteredExpenses = filteredExpenses.filter(e => e.username === userFilter);
    }
    
    // Trier les données
    sortExpenses(filteredExpenses);
    
    // Créer le CSV
    const headers = [
        'Date', 'Catégorie', 'Désignation', 'Fournisseur', 'Quantité', 
        'Prix Unitaire', 'Montant Total', 'Description', 'Prévisible', 
        'Compte', 'Utilisateur', 'Directeur'
    ];
    
    let csvContent = headers.join(',') + '\n';
    
    filteredExpenses.forEach(expense => {
        const row = [
            formatDate(expense.expense_date),
            `"${expense.category_name || ''}"`,
            `"${expense.designation || ''}"`,
            `"${expense.supplier || ''}"`,
            expense.quantity || '',
            expense.unit_price || '',
            parseInt(expense.total || expense.amount),
            `"${expense.description || ''}"`,
            expense.predictable || '',
            `"${expense.account_name || ''}"`,
            expense.username || '',
            expense.user_name || ''
        ];
        csvContent += row.join(',') + '\n';
    });
    
    // Télécharger le fichier
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `depenses_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showNotification('Export CSV généré avec succès', 'success');
}
// Fonction pour mettre à jour le compteur de résultats filtrés
function updateFilteredCount(filtered, total) {
    const existingCounter = document.getElementById('filtered-count');
    if (existingCounter) {
        existingCounter.remove();
    }
    
    if (filtered !== total) {
        const counter = document.createElement('div');
        counter.id = 'filtered-count';
        counter.style.cssText = 'margin: 10px 0; padding: 8px 12px; background: #e3f2fd; border-radius: 4px; color: #1976d2; font-size: 14px;';
        counter.innerHTML = `<i class="fas fa-filter"></i> Affichage de ${filtered} dépense(s) sur ${total} au total`;
        
        const tableContainer = document.querySelector('.table-container');
        tableContainer.parentNode.insertBefore(counter, tableContainer);
    }
}

// Fonction pour mettre à jour le total des dépenses affichées
function updateExpensesTotal(expenses) {
    const totalElement = document.getElementById('total-amount');
    if (!totalElement) return;
    
    // Calculer le total de toutes les dépenses affichées
    const total = expenses.reduce((sum, expense) => {
        const amount = parseInt(expense.total || expense.amount) || 0;
        return sum + amount;
    }, 0);
    
    // Formater le montant avec le format français
    const formattedTotal = new Intl.NumberFormat('fr-FR', {
        style: 'currency',
        currency: 'XOF',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(total);
    
    // Mettre à jour l'affichage
    totalElement.textContent = formattedTotal;
    
    console.log(`💰 Total des dépenses affichées: ${formattedTotal} (${expenses.length} dépenses)`);
}

// Remplacer la fonction loadExpenses existante
async function loadExpenses() {
    await loadExpensesWithFilters();
}
async function addExpense(formData) {
    try {
        // Vérifier le type de compte sélectionné
        const accountSelect = document.getElementById('expense-account');
        const selectedOption = accountSelect.options[accountSelect.selectedIndex];
        const accountType = selectedOption?.dataset.accountType || 'classique';
        
        let expenseData;
        
        if (accountType === 'creance' || accountType === 'fournisseur') {
            // Formulaire simplifié pour créance et fournisseur
            expenseData = {
                account_id: formData.account_id,
                expense_date: formData.expense_date,
                total: formData.total,
                description: formData.description,
                // Valeurs par défaut pour les champs obligatoires
                designation: `Dépense ${accountType}`,
                supplier: 'N/A',
                quantity: 1,
                unit_price: formData.total,
                predictable: 'non',
                expense_type: null,
                category: null,
                subcategory: null,
                social_network_detail: null
            };
        } else {
            // Formulaire complet pour les autres types de comptes
        const typeSelect = document.getElementById('expense-type');
        const categorySelect = document.getElementById('expense-category');
        const subcategorySelect = document.getElementById('expense-subcategory');
        const socialNetworkSelect = document.getElementById('social-network-detail');
        
        const typeName = typeSelect.options[typeSelect.selectedIndex]?.text || '';
        const categoryName = categorySelect.options[categorySelect.selectedIndex]?.text || '';
        const subcategoryName = subcategorySelect.options[subcategorySelect.selectedIndex]?.text || '';
        const socialNetwork = socialNetworkSelect.value ? ` (${socialNetworkSelect.options[socialNetworkSelect.selectedIndex].text})` : '';
        
        // Créer une description enrichie
        const hierarchyDescription = `${typeName} > ${categoryName} > ${subcategoryName}${socialNetwork}`;
        const fullDescription = `${hierarchyDescription}\n${formData.description}`;
        
            expenseData = {
            ...formData,
            description: fullDescription,
            expense_type: formData.expense_type,
            category: formData.category,
            subcategory: formData.subcategory,
            social_network_detail: socialNetworkSelect.value || null
        };
        }
        
        const response = await fetch('/api/expenses', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(expenseData)
        });
        
        if (response.ok) {
            showNotification('Dépense ajoutée avec succès !', 'success');
            document.getElementById('expense-form').reset();
            setDefaultDate();
            
            // Réinitialiser le formulaire selon le type de compte
            if (accountType === 'creance' || accountType === 'fournisseur') {
                showSimplifiedExpenseForm();
            } else {
                // Réinitialiser les sélecteurs pour les comptes classiques
            loadCategories();
                showAllExpenseFields();
            }
        } else {
            const error = await response.json();
            throw new Error(error.error);
        }
    } catch (error) {
        showNotification(`Erreur: ${error.message}`, 'error');
    }
}

// Gestion des comptes (remplace les portefeuilles)
async function loadAccounts() {
    try {
        const response = await fetch('/api/accounts');
        const accounts = await response.json();
        
        displayAccounts(accounts);
        
        if (['directeur_general', 'pca', 'admin'].includes(currentUser.role)) {
        await loadAccountsForCredit();
        }
        
    } catch (error) {
        console.error('Erreur chargement comptes:', error);
    }
}

function displayAccounts(accounts) {
    const accountsList = document.getElementById('accounts-list');
    
    // Vérifier que accounts est bien un tableau
    if (!Array.isArray(accounts)) {
        console.error('displayAccounts: accounts n\'est pas un tableau:', accounts);
        accountsList.innerHTML = '<p>Erreur: impossible d\'afficher les comptes (format invalide).</p>';
        return;
    }
    
    if (accounts.length === 0) {
        accountsList.innerHTML = '<p>Aucun compte trouvé.</p>';
        return;
    }
    
    // Stocker les comptes pour le filtrage
    window.allAccounts = accounts;
    
    // Créer les filtres
    const filtersHtml = `
        <div class="accounts-filters-card" style="margin-bottom: 25px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 15px; padding: 25px; box-shadow: 0 10px 30px rgba(0,0,0,0.1);">
            <div style="display: flex; align-items: center; margin-bottom: 20px;">
                <i class="fas fa-filter" style="color: white; font-size: 20px; margin-right: 10px;"></i>
                <h5 style="color: white; margin: 0; font-weight: 600;">Filtres de Recherche</h5>
            </div>
            
            <div style="display: flex; flex-wrap: wrap; gap: 20px; align-items: end;">
                <div style="flex: 1; min-width: 250px;">
                    <label style="color: white; font-weight: 500; margin-bottom: 8px; display: block;">
                        <i class="fas fa-university" style="margin-right: 5px;"></i>Comptes Sélectionnés
                    </label>
                    <div class="dropdown" style="position: relative;">
                        <button class="btn btn-light dropdown-toggle" type="button" id="accountDropdown" onclick="toggleAccountDropdown()" style="width: 100%; border-radius: 10px; padding: 12px 15px; font-size: 14px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); text-align: left; background: white; border: none;">
                            <span id="selected-accounts-text">Tous les comptes</span>
                        </button>
                        <div class="dropdown-menu" id="accounts-dropdown" style="display: none; position: absolute; top: 100%; left: 0; width: 100%; max-height: 300px; overflow-y: auto; border-radius: 10px; border: none; box-shadow: 0 5px 20px rgba(0,0,0,0.15); background: white; z-index: 1000;">
                            <div class="px-3 py-2">
                                <div class="form-check">
                                    <input class="form-check-input" type="checkbox" id="select-all-accounts" checked>
                                    <label class="form-check-label font-weight-bold" for="select-all-accounts">
                                        Tous les comptes
                                    </label>
                    </div>
                                <hr style="margin: 10px 0;">
                                <div id="accounts-checkboxes">
                                    <!-- Les checkboxes seront ajoutées ici -->
                    </div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div style="flex: 0 0 180px;">
                    <label style="color: white; font-weight: 500; margin-bottom: 8px; display: block;">
                        <i class="fas fa-tags" style="margin-right: 5px;"></i>Type de Compte
                    </label>
                    <select id="filter-account-type" class="form-control filter-select" style="border: none; border-radius: 10px; padding: 12px 15px; font-size: 14px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); background: white;">
                        <option value="">Tous les types</option>
                        <option value="classique">🏛️ Classique</option>
                        <option value="creance">💳 Créance</option>
                        <option value="fournisseur">🏪 Fournisseur</option>
                        <option value="partenaire">🤝 Partenaire</option>
                        <option value="statut">📊 Statut</option>
                        <option value="Ajustement">⚖️ Ajustement</option>
                        <option value="depot">🏦 Dépôt</option>
                    </select>
                </div>
                
                <div style="flex: 0 0 160px;">
                    <label style="color: white; font-weight: 500; margin-bottom: 8px; display: block;">
                        <i class="fas fa-user" style="margin-right: 5px;"></i>Utilisateur
                    </label>
                    <select id="filter-username" class="form-control filter-select" style="border: none; border-radius: 10px; padding: 12px 15px; font-size: 14px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); background: white;">
                        <option value="">Tous les utilisateurs</option>
                    </select>
                </div>
                
                <div style="flex: 0 0 200px;">
                    <label style="color: white; font-weight: 500; margin-bottom: 8px; display: block;">
                        <i class="fas fa-folder" style="margin-right: 5px;"></i>Type de Catégorie
                    </label>
                    <select id="filter-category-type" class="form-control filter-select" style="border: none; border-radius: 10px; padding: 12px 15px; font-size: 14px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); background: white;">
                        <option value="">Tous les types</option>
                    </select>
                </div>
                
                <div style="flex: 0 0 160px;">
                    <label style="color: white; font-weight: 500; margin-bottom: 8px; display: block;">
                        <i class="fas fa-toggle-on" style="margin-right: 5px;"></i>Statut
                    </label>
                    <select id="filter-account-status" class="form-control filter-select" style="border: none; border-radius: 10px; padding: 12px 15px; font-size: 14px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); background: white;">
                        <option value="">Tous les statuts</option>
                        <option value="active">✅ Actifs uniquement</option>
                        <option value="inactive">❌ Inactifs uniquement</option>
                    </select>
                </div>
                
                <div style="flex: 0 0 140px;">
                    <button id="clear-filters" class="btn btn-light" style="width: 100%; border-radius: 10px; padding: 12px 20px; font-weight: 600; border: none; box-shadow: 0 2px 10px rgba(0,0,0,0.1); transition: all 0.3s ease;">
                        <i class="fas fa-eraser" style="margin-right: 8px;"></i>Effacer
                    </button>
                </div>
            </div>
        </div>
        
        <style>
            .filter-select:focus {
                outline: none !important;
                box-shadow: 0 0 0 3px rgba(255,255,255,0.3) !important;
                transform: translateY(-1px);
                transition: all 0.3s ease;
            }
            
            #clear-filters:hover {
                background: #f8f9fa !important;
                transform: translateY(-2px);
                box-shadow: 0 4px 15px rgba(0,0,0,0.2) !important;
            }
            
            .dropdown-menu {
                border: none !important;
            }
            
            .form-check-input:checked {
                background-color: #667eea;
                border-color: #667eea;
            }
            
            .form-check-label {
                cursor: pointer;
                font-size: 14px;
            }
            
            .dropdown-toggle::after {
                float: right;
                margin-top: 8px;
            }
            
            @media (max-width: 768px) {
                .accounts-filters-card > div:last-child {
                    flex-direction: column;
                    gap: 15px;
                }
                
                .accounts-filters-card > div:last-child > div {
                    flex: 1 1 100% !important;
                    min-width: auto !important;
                }
            }
        </style>
    `;
    
    // Bouton pour afficher/masquer les colonnes financières
    const toggleFinancialBtn = `
        <div style="margin-bottom: 15px; text-align: right;">
            <button id="toggle-financial-columns" class="btn btn-outline-primary" style="border-radius: 10px; padding: 8px 15px; font-weight: 500; border: 2px solid #667eea; color: #667eea; background: white; transition: all 0.3s ease;">
                <i class="fas fa-eye" style="margin-right: 5px;"></i>Afficher colonnes financières
            </button>
        </div>
    `;

    // Créer le tableau
    const tableHtml = `
        <div class="table-responsive" style="border-radius: 15px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.1);">
            <table class="table table-striped table-hover mb-0" id="accounts-table" style="border-radius: 15px; overflow: hidden;">
                <thead style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white;">
                    <tr>
                        <th style="border: none; padding: 15px; font-weight: 600;">
                            <i class="fas fa-university" style="margin-right: 8px;"></i>COMPTE
                        </th>
                        <th style="border: none; padding: 15px; font-weight: 600;">
                            <i class="fas fa-tags" style="margin-right: 8px;"></i>TYPE
                        </th>
                        <th style="border: none; padding: 15px; font-weight: 600;">
                            <i class="fas fa-user" style="margin-right: 8px;"></i>UTILISATEUR
                        </th>
                        <th style="border: none; padding: 15px; font-weight: 600;">
                            <i class="fas fa-cogs" style="margin-right: 8px;"></i>ACTIONS
                        </th>
                        <th style="border: none; padding: 15px; font-weight: 600;">
                            <i class="fas fa-folder" style="margin-right: 8px;"></i>CATÉGORIE
                        </th>
                        <th style="border: none; padding: 15px; font-weight: 600;">
                            <i class="fas fa-calendar" style="margin-right: 8px;"></i>CRÉATION
                        </th>
                        <th style="border: none; padding: 15px; font-weight: 600;">
                            <i class="fas fa-toggle-on" style="margin-right: 8px;"></i>STATUT
                        </th>
                        <th style="border: none; padding: 15px; font-weight: 600; display: none;" class="financial-column">
                            <i class="fas fa-wallet" style="margin-right: 8px;"></i>SOLDE
                        </th>
                        <th style="border: none; padding: 15px; font-weight: 600; display: none;" class="financial-column">
                            <i class="fas fa-plus-circle" style="margin-right: 8px;"></i>CRÉDITÉ
                        </th>
                        <th style="border: none; padding: 15px; font-weight: 600; display: none;" class="financial-column">
                            <i class="fas fa-minus-circle" style="margin-right: 8px;"></i>DÉPENSÉ
                        </th>
                        <th style="border: none; padding: 15px; font-weight: 600;">
                            <i class="fas fa-cogs" style="margin-right: 8px;"></i>Actions
                        </th>
                    </tr>
                </thead>
                <tbody id="accounts-table-body" style="background: white;">
                </tbody>
            </table>
                </div>
        
        <style>
            #accounts-table tbody tr {
                transition: all 0.3s ease;
                border-left: 4px solid transparent;
            }
            
            #accounts-table tbody tr:hover {
                background: linear-gradient(90deg, #f8f9ff 0%, #ffffff 100%) !important;
                border-left: 4px solid #667eea;
                transform: translateX(5px);
                box-shadow: 0 5px 15px rgba(0,0,0,0.1);
            }
            
            #accounts-table tbody td {
                padding: 15px;
                vertical-align: middle;
                border-color: #f1f3f4;
            }
            
            .badge {
                padding: 8px 12px;
                border-radius: 20px;
                font-weight: 500;
                font-size: 12px;
            }
            
            .badge-secondary {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
            }
            
            .btn-sm {
                padding: 8px 16px;
                border-radius: 20px;
                font-weight: 500;
                transition: all 0.3s ease;
            }
            
            .btn-danger:hover {
                transform: translateY(-2px);
                box-shadow: 0 5px 15px rgba(220, 53, 69, 0.3);
            }
            
            .btn-success:hover {
                transform: translateY(-2px);
                box-shadow: 0 5px 15px rgba(40, 167, 69, 0.3);
            }
        </style>
    `;
    
    accountsList.innerHTML = filtersHtml + toggleFinancialBtn + tableHtml;
    
    // Peupler les filtres
    populateAccountFilters(accounts);
    
    // Ajouter les event listeners pour les filtres
    setupAccountFilters();
    
    // Initialiser le texte des comptes sélectionnés
    updateSelectedAccountsText();
    
    // Afficher tous les comptes initialement
    filterAndDisplayAccounts();
}

function populateAccountFilters(accounts) {
    // Peupler les checkboxes des comptes
    const accountsCheckboxes = document.getElementById('accounts-checkboxes');
    accountsCheckboxes.innerHTML = '';
    
    accounts.forEach(account => {
        const checkboxDiv = document.createElement('div');
        checkboxDiv.className = 'form-check';
        checkboxDiv.innerHTML = `
            <input class="form-check-input account-checkbox" type="checkbox" id="account-${account.id}" value="${account.id}" checked>
            <label class="form-check-label" for="account-${account.id}">
                ${account.account_name}
            </label>
        `;
        accountsCheckboxes.appendChild(checkboxDiv);
    });
    
    // Peupler le filtre username
    const usernameFilter = document.getElementById('filter-username');
    const usernames = [...new Set(accounts.map(account => account.username).filter(Boolean))].sort();
    usernames.forEach(username => {
        const option = document.createElement('option');
        option.value = username;
        option.textContent = username;
        usernameFilter.appendChild(option);
    });
    
    // Peupler le filtre type de catégorie
    const categoryTypeFilter = document.getElementById('filter-category-type');
    const categoryTypes = [...new Set(accounts.map(account => account.category_type).filter(Boolean))].sort();
    categoryTypes.forEach(categoryType => {
        const option = document.createElement('option');
        option.value = categoryType;
        option.textContent = categoryType;
        categoryTypeFilter.appendChild(option);
    });
}

function toggleAccountDropdown() {
    const dropdown = document.getElementById('accounts-dropdown');
    const isVisible = dropdown.style.display !== 'none';
    
    if (isVisible) {
        dropdown.style.display = 'none';
    } else {
        dropdown.style.display = 'block';
    }
}

// Fermer le dropdown quand on clique ailleurs
document.addEventListener('click', function(event) {
    const dropdown = document.getElementById('accounts-dropdown');
    const button = document.getElementById('accountDropdown');
    
    if (dropdown && button && !dropdown.contains(event.target) && !button.contains(event.target)) {
        dropdown.style.display = 'none';
    }
});

function setupAccountFilters() {
    const filters = ['filter-account-type', 'filter-username', 'filter-category-type', 'filter-account-status'];
    
    filters.forEach(filterId => {
        const element = document.getElementById(filterId);
        if (element) {
            element.addEventListener('change', filterAndDisplayAccounts);
        }
    });
    
    // Gestion du "Tous les comptes"
    document.getElementById('select-all-accounts').addEventListener('change', function() {
        const accountCheckboxes = document.querySelectorAll('.account-checkbox');
        accountCheckboxes.forEach(checkbox => {
            checkbox.checked = this.checked;
        });
        updateSelectedAccountsText();
        filterAndDisplayAccounts();
    });
    
    // Gestion des checkboxes individuelles
    document.addEventListener('change', function(e) {
        if (e.target.classList.contains('account-checkbox')) {
            const allCheckboxes = document.querySelectorAll('.account-checkbox');
            const checkedCheckboxes = document.querySelectorAll('.account-checkbox:checked');
            const selectAllCheckbox = document.getElementById('select-all-accounts');
            
            if (checkedCheckboxes.length === 0) {
                selectAllCheckbox.indeterminate = false;
                selectAllCheckbox.checked = false;
            } else if (checkedCheckboxes.length === allCheckboxes.length) {
                selectAllCheckbox.indeterminate = false;
                selectAllCheckbox.checked = true;
            } else {
                selectAllCheckbox.indeterminate = true;
            }
            
            updateSelectedAccountsText();
            filterAndDisplayAccounts();
        }
    });
    
    // Empêcher la fermeture du dropdown quand on clique sur les checkboxes
    document.addEventListener('click', function(e) {
        if (e.target.closest('#accounts-dropdown')) {
            e.stopPropagation();
        }
    });
    
    // Bouton effacer filtres
    document.getElementById('clear-filters').addEventListener('click', () => {
        // Réinitialiser les filtres
        filters.forEach(filterId => {
            const element = document.getElementById(filterId);
            if (element) {
                element.value = '';
            }
        });
        
        // Sélectionner tous les comptes
        document.getElementById('select-all-accounts').checked = true;
        document.getElementById('select-all-accounts').indeterminate = false;
        document.querySelectorAll('.account-checkbox').forEach(checkbox => {
            checkbox.checked = true;
        });
        
        updateSelectedAccountsText();
        filterAndDisplayAccounts();
    });
    
    // Ajouter l'événement pour le toggle des colonnes financières
    const toggleButton = document.getElementById('toggle-financial-columns');
    if (toggleButton) {
        toggleButton.addEventListener('click', toggleFinancialColumns);
    }
}

// Fonction pour afficher/masquer les colonnes financières
function toggleFinancialColumns() {
    const financialColumns = document.querySelectorAll('.financial-column');
    const toggleButton = document.getElementById('toggle-financial-columns');
    const isHidden = financialColumns[0].style.display === 'none';
    
    financialColumns.forEach(column => {
        column.style.display = isHidden ? 'table-cell' : 'none';
    });
    
    // Mettre à jour le texte et l'icône du bouton
    if (isHidden) {
        toggleButton.innerHTML = '<i class="fas fa-eye-slash" style="margin-right: 5px;"></i>Masquer colonnes financières';
        toggleButton.style.background = '#667eea';
        toggleButton.style.color = 'white';
        // Ajuster le colspan si nécessaire
        const emptyRow = document.querySelector('#accounts-table-body tr td[colspan]');
        if (emptyRow) {
            emptyRow.setAttribute('colspan', '10');
        }
    } else {
        toggleButton.innerHTML = '<i class="fas fa-eye" style="margin-right: 5px;"></i>Afficher colonnes financières';
        toggleButton.style.background = 'white';
        toggleButton.style.color = '#667eea';
        // Ajuster le colspan si nécessaire
        const emptyRow = document.querySelector('#accounts-table-body tr td[colspan]');
        if (emptyRow) {
            emptyRow.setAttribute('colspan', '7');
        }
    }
}

function updateSelectedAccountsText() {
    const checkedCheckboxes = document.querySelectorAll('.account-checkbox:checked');
    const totalCheckboxes = document.querySelectorAll('.account-checkbox');
    const textElement = document.getElementById('selected-accounts-text');
    
    if (checkedCheckboxes.length === 0) {
        textElement.textContent = 'Aucun compte sélectionné';
    } else if (checkedCheckboxes.length === totalCheckboxes.length) {
        textElement.textContent = 'Tous les comptes';
    } else if (checkedCheckboxes.length === 1) {
        const accountName = checkedCheckboxes[0].nextElementSibling.textContent;
        textElement.textContent = accountName;
    } else {
        textElement.textContent = `${checkedCheckboxes.length} comptes sélectionnés`;
    }
}

function filterAndDisplayAccounts() {
    if (!window.allAccounts) return;
    
    // Récupérer les comptes sélectionnés
    const selectedAccountIds = Array.from(document.querySelectorAll('.account-checkbox:checked')).map(cb => parseInt(cb.value));
    const typeFilter = document.getElementById('filter-account-type').value;
    const usernameFilter = document.getElementById('filter-username').value;
    const categoryTypeFilter = document.getElementById('filter-category-type').value;
    const statusFilter = document.getElementById('filter-account-status').value;
    
    // Si aucun filtre n'est appliqué (sauf les checkboxes), utiliser la sélection des checkboxes
    const hasActiveFilters = typeFilter || usernameFilter || categoryTypeFilter || statusFilter;
    
    const filteredAccounts = window.allAccounts.filter(account => {
        // Si des filtres sont appliqués, ignorer la sélection des checkboxes et filtrer sur tous les comptes
        const matchesSelectedAccounts = hasActiveFilters ? true : selectedAccountIds.includes(account.id);
        const matchesType = !typeFilter || (account.account_type || 'classique') === typeFilter;
        const matchesUsername = !usernameFilter || account.username === usernameFilter;
        const matchesCategoryType = !categoryTypeFilter || account.category_type === categoryTypeFilter;
        const matchesStatus = !statusFilter || 
            (statusFilter === 'active' && account.is_active) || 
            (statusFilter === 'inactive' && !account.is_active);
        
        return matchesSelectedAccounts && matchesType && matchesUsername && matchesCategoryType && matchesStatus;
    });
    
    displayAccountsTable(filteredAccounts);
}

function displayAccountsTable(accounts) {
    const tbody = document.getElementById('accounts-table-body');
    
    // Mettre à jour le compteur de comptes filtrés
    updateAccountFilterCount(accounts.length, window.allAccounts ? window.allAccounts.length : 0);
    
    if (accounts.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center;">Aucun compte trouvé avec ces filtres</td></tr>';
        return;
    }
    
    tbody.innerHTML = accounts.map(account => {
        const statusClass = account.is_active ? 'text-success' : 'text-danger';
        const statusText = account.is_active ? 'Actif' : 'Inactif';
        // Boutons d'actions selon les permissions et l'état du compte
        let actionButtons = '';
        if (currentUser.role === 'admin') {
            // Admin-only delete button
            actionButtons += `<button class="btn btn-danger btn-sm me-1" style="background:#e74c3c;border:none;" onclick="deleteAccountAdmin(${account.id})" title="Supprimer définitivement (admin)">
                <i class="fas fa-trash" style="color:white;"></i>
            </button>`;
            // Admin-only reset button
            actionButtons += `<button class="btn btn-warning btn-sm me-1" style="background:#f39c12;border:none;" onclick="resetAccountAdmin(${account.id})" title="Vider le compte (admin)">
                <i class="fas fa-undo" style="color:white;"></i>
            </button>`;
        }
        if (["directeur_general", "pca", "admin"].includes(currentUser.role)) {
            actionButtons += `<button class="btn btn-primary btn-sm me-1" onclick="editAccount(${account.id})" title="Modifier">
                <i class="fas fa-edit"></i>
            </button>`;
            if (account.total_spent === 0) {
                actionButtons += `<button class="btn btn-warning btn-sm me-1" onclick="deleteAccount(${account.id})" title="Supprimer">
                    <i class="fas fa-trash"></i>
                </button>`;
            }
            if (account.is_active) {
                actionButtons += `<button class="btn btn-danger btn-sm" onclick="deactivateAccount(${account.id})" title="Désactiver">
                    <i class="fas fa-ban"></i>
                </button>`;
            } else {
                actionButtons += `<button class="btn btn-success btn-sm" onclick="activateAccount(${account.id})" title="Activer">
                    <i class="fas fa-check"></i>
                </button>`;
            }
        } else {
            actionButtons = '<span class="text-muted">-</span>';
        }
        
        // Pour les comptes partenaires, afficher les directeurs assignés
        let usernameDisplay = account.username || '-';
        if (account.account_type === 'partenaire' && account.partner_directors && account.partner_directors.length > 0) {
            const directorUsernames = account.partner_directors.map(d => d.username).join('-');
            usernameDisplay = `(${directorUsernames})`;
        }
        
        return `
            <tr>
                <td><strong>${account.account_name}</strong></td>
                <td><span class="badge badge-secondary">${account.account_type || 'classique'}</span></td>
                <td>${usernameDisplay}</td>
                <td>${actionButtons}</td>
                <td>${account.category_type || '-'}</td>
                <td>${formatDate(account.created_at)}</td>
                <td><span class="${statusClass}"><strong>${statusText}</strong></span></td>
                <td style="display: none;" class="financial-column"><strong>${formatCurrency(account.current_balance)}</strong></td>
                <td style="display: none;" class="financial-column">${formatCurrency(account.total_credited)}</td>
                <td style="display: none;" class="financial-column">${formatCurrency(account.total_spent)}</td>
            </tr>
        `;
    }).join('');
}

// Mettre à jour le compteur de comptes filtrés
function updateAccountFilterCount(filtered, total) {
    const existingCounter = document.querySelector('.account-filter-count');
    if (existingCounter) {
        existingCounter.remove();
    }
    
    if (filtered !== total) {
        const counter = document.createElement('div');
        counter.className = 'account-filter-count';
        counter.style.cssText = `
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 10px 15px;
            border-radius: 20px;
            margin-bottom: 15px;
            text-align: center;
            font-weight: 500;
            box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
        `;
        counter.innerHTML = `
            <i class="fas fa-filter" style="margin-right: 8px;"></i>
            ${filtered} compte${filtered > 1 ? 's' : ''} affiché${filtered > 1 ? 's' : ''} sur ${total}
        `;
        
        const tableContainer = document.querySelector('#accounts-table').parentElement;
        tableContainer.insertBefore(counter, tableContainer.firstChild);
    }
}

// Fonction pour désactiver un compte
async function deactivateAccount(accountId) {
    if (!confirm('Êtes-vous sûr de vouloir désactiver ce compte ?')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/accounts/${accountId}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            showNotification('Compte désactivé avec succès !', 'success');
            await loadAccounts();
            await loadUsersWithoutAccount();
        } else {
            const error = await response.json();
            throw new Error(error.error);
        }
    } catch (error) {
        showNotification(`Erreur: ${error.message}`, 'error');
    }
}

// Fonction pour activer un compte
async function activateAccount(accountId) {
    if (!confirm('Êtes-vous sûr de vouloir activer ce compte ?')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/accounts/${accountId}/activate`, {
            method: 'PUT'
        });
        
        if (response.ok) {
            showNotification('Compte activé avec succès !', 'success');
            await loadAccounts();
        } else {
            const error = await response.json();
            throw new Error(error.error);
        }
    } catch (error) {
        showNotification(`Erreur: ${error.message}`, 'error');
    }
}
// Fonction pour modifier un compte
async function editAccount(accountId) {
    try {
        console.log(`[editAccount] Starting edit for account ID: ${accountId}`);

        // Récupérer les détails du compte
        const response = await fetch('/api/accounts');
        const accounts = await response.json();
        const account = accounts.find(acc => acc.id === accountId);
        
        if (!account) {
            showNotification('Compte non trouvé', 'error');
            console.error(`[editAccount] Account with ID ${accountId} not found.`);
            return;
        }

        console.log('[editAccount] Found account data:', account);
        
        // Pré-remplir le formulaire avec les données existantes
        document.getElementById('accountName').value = account.account_name;
        console.log(`[editAccount] Set account name to: "${account.account_name}"`);

        document.getElementById('accountType').value = account.account_type || 'classique';
        console.log(`[editAccount] Set account type to: "${account.account_type || 'classique'}"`);
        
        // Déclencher le changement de type pour afficher les bons champs
        console.log('[editAccount] Calling handleAccountTypeChange() to update form display.');
        handleAccountTypeChange();
        
        // Attendre un peu pour que les champs se chargent
        setTimeout(() => {
            console.log('[editAccount] Populating specific fields after timeout.');
            // Pré-remplir les champs spécifiques selon le type
            if (account.account_type === 'classique' && account.category_type) {
                document.getElementById('categoryTypeSelect').value = account.category_type;
                console.log(`[editAccount] Set category type to: "${account.category_type}"`);
            }
            
            if (account.user_id) {
                document.getElementById('createDirectorSelect').value = account.user_id;
                console.log(`[editAccount] Set director to user ID: ${account.user_id}`);
            }
            
            document.getElementById('createDescription').value = account.description || '';
            console.log(`[editAccount] Set description.`);
            
            // En mode modification : griser le montant initial et afficher le solde courant
            const initialAmountField = document.getElementById('initialAmount');
            const initialAmountGroup = initialAmountField?.closest('.form-group');
            const initialAmountLabel = initialAmountGroup?.querySelector('label');
            
            if (initialAmountField) {
                initialAmountField.value = account.current_balance || 0;
                
                // Pour les comptes statut, rendre le champ éditable
                if (account.account_type === 'statut') {
                    initialAmountField.disabled = false;
                    initialAmountField.readOnly = false;
                    initialAmountField.removeAttribute('min');
                    initialAmountField.style.backgroundColor = '';
                    initialAmountField.style.color = '';
                    initialAmountField.placeholder = 'Solde négatif ou positif';
                    
                    if (initialAmountLabel) {
                        initialAmountLabel.textContent = 'Solde Actuel (modifiable)';
                    }
                } else {
                    initialAmountField.disabled = true;
                    initialAmountField.readOnly = true;
                    initialAmountField.setAttribute('min', '0');
                    initialAmountField.style.backgroundColor = '#f8f9fa';
                    initialAmountField.style.color = '#6c757d';
                    initialAmountField.placeholder = '';
                    
                    if (initialAmountLabel) {
                        initialAmountLabel.textContent = 'Solde Actuel (lecture seule)';
                    }
                }
                
                console.log(`[editAccount] Set current balance: ${account.current_balance}`);
            }

        }, 100); // Reduced timeout
        
        // Changer le texte du bouton et le titre du formulaire pour indiquer la modification
        const submitButton = document.querySelector('#createAccountForm button[type="submit"]');
        const cancelButton = document.getElementById('cancelAccountEdit');
        const formTitle = document.querySelector('#createAccountForm h3');
        
        submitButton.textContent = 'Modifier le Compte';
        submitButton.dataset.editingId = accountId;
        cancelButton.style.display = 'inline-block';
        
        // Changer le titre pour indiquer qu'on est en mode modification
        if (formTitle) {
            formTitle.textContent = '[Modification] Créer/Assigner un Compte';
            formTitle.style.color = '#d97706'; // Couleur orange pour indiquer la modification
        }
        
        console.log('[editAccount] Changed button to "Modifier le Compte", updated title with [Modification], and set editingId.');

        
        // Faire défiler vers le formulaire
        document.getElementById('createAccountForm').scrollIntoView({ behavior: 'smooth' });
        console.log('[editAccount] Scrolled to form.');
        
        showNotification('Formulaire pré-rempli pour modification', 'info');
        
    } catch (error) {
        console.error('[editAccount] Error:', error);
        showNotification(`Erreur: ${error.message}`, 'error');
    }
}

// Fonction pour supprimer un compte
async function deleteAccount(accountId) {
    try {
        // Vérifier d'abord si le compte a des dépenses
        const response = await fetch('/api/accounts');
        const accounts = await response.json();
        const account = accounts.find(acc => acc.id === accountId);
        
        if (!account) {
            showNotification('Compte non trouvé', 'error');
            return;
        }
        
        if (account.total_spent > 0) {
            showNotification('Impossible de supprimer un compte avec des dépenses', 'error');
            return;
        }
        
        if (!confirm(`Êtes-vous sûr de vouloir supprimer définitivement le compte "${account.account_name}" ?\n\nCette action est irréversible.`)) {
            return;
        }
        
        const deleteResponse = await fetch(`/api/accounts/${accountId}/delete`, {
            method: 'DELETE'
        });
        
        if (deleteResponse.ok) {
            showNotification('Compte supprimé avec succès !', 'success');
            await loadAccounts();
            await loadUsersWithoutAccount();
            if (['directeur_general', 'pca', 'admin'].includes(currentUser.role)) {
                await loadAccountsForCredit();
                console.log('🔍 CLIENT: Chargement des comptes pour le filtre...');
                await loadCreditAccounts(); // Charger les comptes pour le filtre
                await loadCreditHistory();
            }
        } else {
            const error = await deleteResponse.json();
            throw new Error(error.error);
        }
    } catch (error) {
        showNotification(`Erreur: ${error.message}`, 'error');
    }
}

// Fonction pour charger l'historique des crédits
// Variables globales pour la pagination et les filtres
let currentCreditPage = 1;
let creditPagination = null;
let creditFilters = {
    account: '',
    type: ''
};

async function loadCreditHistory(page = 1) {
    try {
        // Construire les paramètres de requête avec les filtres
        const params = new URLSearchParams({
            page: page,
            limit: 50
        });
        
        if (creditFilters.account) {
            params.append('account', creditFilters.account);
        }
        if (creditFilters.type) {
            params.append('type', creditFilters.type);
        }
        
        console.log('🔍 CLIENT: Envoi de la requête avec params:', params.toString());
        const response = await fetch(`/api/credit-history?${params.toString()}`, {
            credentials: 'include' // S'assurer que les cookies sont envoyés
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`HTTP ${response.status}: ${errorData.error || 'Erreur serveur'}`);
        }
        
        const data = await response.json();
        console.log('🔍 CLIENT: Données reçues:', data);
        
        if (data.credits && Array.isArray(data.credits)) {
            // Nouveau format avec pagination
            displayCreditHistory(data.credits);
            creditPagination = data.pagination;
            currentCreditPage = page;
            displayCreditPagination();
        } else if (Array.isArray(data)) {
            // Ancien format (rétrocompatibilité)
            displayCreditHistory(data);
        } else {
            console.error('❌ CLIENT: Format de données invalide:', data);
            throw new Error('Format de données invalide');
        }
        
    } catch (error) {
        console.error('Erreur chargement historique crédits:', error);
    }
}

function displayCreditHistory(credits) {
    const tbody = document.getElementById('credit-history-tbody');
    tbody.innerHTML = '';
    
    if (credits.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center;">Aucun crédit trouvé</td></tr>';
        return;
    }
    
    credits.forEach(credit => {
        const row = document.createElement('tr');
        
        // Générer les boutons d'action selon les permissions
        const actionButtons = generateCreditActionButtons(credit);
        
        row.innerHTML = `
            <td>${formatDate(credit.created_at)}</td>
            <td>${credit.account_name}</td>
            <td><span class="badge badge-${getTypeBadgeClass(credit.type_operation)}">${credit.type_operation}</span></td>
            <td>${formatCurrency(parseInt(credit.amount))}</td>
            <td>${credit.credited_by_name}</td>
            <td>${actionButtons}</td><td></td>
             <td>${credit.description || 'N/A'}</td>
        `;
        tbody.appendChild(row);
    });
}

function getTypeBadgeClass(type) {
    switch (type) {
        case 'CRÉDIT RÉGULIER': return 'success';
        case 'CRÉDIT SPÉCIAL': return 'primary';
        case 'CRÉDIT STATUT': return 'warning';
        case 'CRÉDIT CRÉANCE': return 'info';
        default: return 'secondary';
    }
}

function displayCreditPagination() {
    const paginationContainer = document.getElementById('credit-pagination');
    if (!paginationContainer || !creditPagination) return;
    
    const { page, totalPages, hasNext, hasPrev, total } = creditPagination;
    
    let paginationHTML = `
        <div class="pagination-info">
            Page ${page} sur ${totalPages} (${total} crédits au total)
        </div>
        <div class="pagination-controls">
    `;
    
    if (hasPrev) {
        paginationHTML += `<button class="btn btn-sm btn-outline-primary" onclick="loadCreditHistory(${page - 1})">
            <i class="fas fa-chevron-left"></i> Précédent
        </button>`;
    }
    
    // Afficher les numéros de page
    const startPage = Math.max(1, page - 2);
    const endPage = Math.min(totalPages, page + 2);
    
    for (let i = startPage; i <= endPage; i++) {
        if (i === page) {
            paginationHTML += `<button class="btn btn-sm btn-primary" disabled>${i}</button>`;
        } else {
            paginationHTML += `<button class="btn btn-sm btn-outline-primary" onclick="loadCreditHistory(${i})">${i}</button>`;
        }
    }
    
    if (hasNext) {
        paginationHTML += `<button class="btn btn-sm btn-outline-primary" onclick="loadCreditHistory(${page + 1})">
            Suivant <i class="fas fa-chevron-right"></i>
        </button>`;
    }
    
    paginationHTML += '</div>';
    paginationContainer.innerHTML = paginationHTML;
}

// Fonction pour charger les comptes pour le filtre
async function loadCreditAccounts() {
    try {
        console.log('🔍 CLIENT: Chargement des comptes pour le filtre...');
        
        const response = await fetch('/api/credit-accounts');
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const accounts = await response.json();
        console.log('✅ CLIENT: Comptes reçus:', accounts);
        
        const select = document.getElementById('credit-account-filter');
        if (select) {
            console.log('🔧 CLIENT: Mise à jour du select...');
            
            // Garder l'option "Tous les comptes"
            select.innerHTML = '<option value="">Tous les comptes</option>';
            
            // Ajouter les comptes
            accounts.forEach(account => {
                const option = document.createElement('option');
                option.value = account;
                option.textContent = account;
                select.appendChild(option);
            });
            
            console.log(`✅ CLIENT: ${accounts.length} comptes ajoutés au filtre`);
        } else {
            console.error('❌ CLIENT: Select credit-account-filter non trouvé');
        }
    } catch (error) {
        console.error('❌ CLIENT: Erreur chargement comptes:', error);
    }
}

// Fonction pour appliquer les filtres
function applyCreditFilters() {
    const accountFilter = document.getElementById('credit-account-filter');
    const typeFilter = document.getElementById('credit-type-filter');
    
    creditFilters.account = accountFilter ? accountFilter.value : '';
    creditFilters.type = typeFilter ? typeFilter.value : '';
    
    // Recharger l'historique avec les filtres
    loadCreditHistory(1);
}

// Fonction pour effacer les filtres
function clearCreditFilters() {
    const accountFilter = document.getElementById('credit-account-filter');
    const typeFilter = document.getElementById('credit-type-filter');
    
    if (accountFilter) accountFilter.value = '';
    if (typeFilter) typeFilter.value = '';
    
    creditFilters.account = '';
    creditFilters.type = '';
    
    // Recharger l'historique sans filtres
    loadCreditHistory(1);
}

// Fonction pour configurer les event listeners des filtres
function setupCreditFiltersEventListeners() {
    const accountFilter = document.getElementById('credit-account-filter');
    const typeFilter = document.getElementById('credit-type-filter');
    const clearFiltersBtn = document.getElementById('clear-credit-filters');
    
    if (accountFilter) {
        accountFilter.addEventListener('change', applyCreditFilters);
    }
    if (typeFilter) {
        typeFilter.addEventListener('change', applyCreditFilters);
    }
    if (clearFiltersBtn) {
        clearFiltersBtn.addEventListener('click', clearCreditFilters);
    }
}

// Fonction pour générer les boutons d'action d'un crédit
function generateCreditActionButtons(credit) {
    // FORCER l'affichage des deux boutons pour admin/DG/PCA
    const buttons = `
        <button class="btn btn-sm btn-warning me-1" onclick="editCredit(${credit.id}, '${credit.source_table}')" title="Modifier ce crédit" style="display: inline-flex !important;">
            <i class="fas fa-edit"></i>
        </button>
        <button class="btn btn-sm btn-danger ms-1" onclick="deleteCredit(${credit.id})" title="Supprimer ce crédit" style="display: inline-flex !important; background-color: #dc3545 !important; color: white !important;">
            <i class="fas fa-trash"></i>
        </button>
    `;
    
    return buttons;
}



// Fonction pour modifier un crédit
async function editCredit(creditId, sourceTable) {
    try {
        // Récupérer les détails du crédit pour pré-remplir le formulaire
        const response = await fetch(`/api/credit-history?page=1&limit=1000`);
        const data = await response.json();
        const credit = data.credits.find(c => c.id === creditId && c.source_table === sourceTable);
        
        if (!credit) {
            showNotification('Crédit non trouvé', 'error');
            return;
        }
        
        // Afficher le modal de modification
        showEditCreditModal(credit);
        
    } catch (error) {
        console.error('Erreur récupération crédit:', error);
        showNotification('Erreur lors de la récupération du crédit', 'error');
    }
}

// Fonction pour afficher le modal de modification
function showEditCreditModal(credit) {
    const modal = document.getElementById('editCreditModal');
    if (!modal) {
        // Créer le modal s'il n'existe pas
        createEditCreditModal();
    }
    
    // Pré-remplir les champs
    document.getElementById('edit-credit-id').value = credit.id;
    document.getElementById('edit-credit-source-table').value = credit.source_table;
    document.getElementById('edit-credit-amount').value = credit.amount;
    document.getElementById('edit-credit-description').value = credit.description || '';
    document.getElementById('edit-credit-account-name').textContent = credit.account_name;
    document.getElementById('edit-credit-type').textContent = credit.type_operation;
    document.getElementById('edit-credit-date').textContent = formatDate(credit.created_at);
    
    // Afficher le modal
    const modalElement = document.getElementById('editCreditModal');
    modalElement.style.display = 'flex';
    modalElement.classList.add('show');
    
    // Ajouter l'overlay
    const existingBackdrop = document.getElementById('editCreditModalBackdrop');
    if (existingBackdrop) {
        existingBackdrop.remove();
    }
    
    const overlay = document.createElement('div');
    overlay.className = 'modal-backdrop';
    overlay.id = 'editCreditModalBackdrop';
    document.body.appendChild(overlay);
    
    // Empêcher le scroll du body
    document.body.style.overflow = 'hidden';
    
    // Focus sur le premier champ
    setTimeout(() => {
        const amountInput = document.getElementById('edit-credit-amount');
        if (amountInput) {
            amountInput.focus();
            amountInput.select();
        }
    }, 100);
}

// Fonction pour créer le modal de modification
function createEditCreditModal() {
    const modalHTML = `
        <div class="modal" id="editCreditModal" tabindex="-1" aria-labelledby="editCreditModalLabel" aria-hidden="true">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title" id="editCreditModalLabel">
                            <i class="fas fa-edit"></i> Modifier un Crédit
                        </h5>
                        <button type="button" class="btn-close" onclick="closeEditCreditModal()" aria-label="Close">×</button>
                    </div>
                    <div class="modal-body">
                        <form id="editCreditForm">
                            <input type="hidden" id="edit-credit-id">
                            <input type="hidden" id="edit-credit-source-table">
                            
                            <div class="form-row">
                                <div class="form-group">
                                    <label class="form-label">Compte</label>
                                    <div class="form-control-plaintext" id="edit-credit-account-name"></div>
                                </div>
                                <div class="form-group">
                                    <label class="form-label">Type d'opération</label>
                                    <div class="form-control-plaintext" id="edit-credit-type"></div>
                                </div>
                            </div>
                            
                            <div class="form-row">
                                <div class="form-group">
                                    <label class="form-label">Date de création</label>
                                    <div class="form-control-plaintext" id="edit-credit-date"></div>
                                </div>
                                <div class="form-group">
                                    <label for="edit-credit-amount" class="form-label">Montant (FCFA) *</label>
                                    <input type="number" class="form-control" id="edit-credit-amount" required min="1" step="1">
                                </div>
                            </div>
                            
                            <div class="form-group">
                                <label for="edit-credit-description" class="form-label">Description/Commentaire</label>
                                <textarea class="form-control" id="edit-credit-description" rows="3" placeholder="Description du crédit..."></textarea>
                            </div>
                            
                            <div class="alert alert-warning">
                                <i class="fas fa-exclamation-triangle"></i>
                                <strong>Attention :</strong> La modification d'un crédit affectera le solde du compte associé.
                            </div>
                        </form>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" onclick="closeEditCreditModal()">Annuler</button>
                        <button type="button" class="btn btn-warning" onclick="saveCreditEdit()">
                            <i class="fas fa-save"></i> Enregistrer
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

// Fonction pour fermer le modal
function closeEditCreditModal() {
    const modalElement = document.getElementById('editCreditModal');
    const backdrop = document.getElementById('editCreditModalBackdrop');
    
    if (modalElement) {
        modalElement.style.display = 'none';
        modalElement.classList.remove('show');
    }
    
    if (backdrop) {
        backdrop.remove();
    }
    
    // Restaurer le scroll du body
    document.body.style.overflow = '';
}

// Fonction pour sauvegarder la modification
async function saveCreditEdit() {
    const creditId = document.getElementById('edit-credit-id').value;
    const sourceTable = document.getElementById('edit-credit-source-table').value;
    const amount = document.getElementById('edit-credit-amount').value;
    const description = document.getElementById('edit-credit-description').value;
    
    if (!amount || amount <= 0) {
        showNotification('Veuillez saisir un montant valide', 'error');
        return;
    }
    
    try {
        const response = await fetch(`/api/credit-history/${creditId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                amount: parseInt(amount),
                description: description,
                source_table: sourceTable
            })
        });
        
        if (response.ok) {
            const result = await response.json();
            showNotification(result.message, 'success');
            
            // Fermer le modal
            closeEditCreditModal();
            
            // Recharger l'historique des crédits
            await loadCreditHistory(currentCreditPage);
            
            // Recharger les comptes pour mettre à jour les soldes
            if (['directeur_general', 'pca', 'admin'].includes(currentUser.role)) {
                await loadAccountsForCredit();
            }
        } else {
            const error = await response.json();
            throw new Error(error.error);
        }
    } catch (error) {
        console.error('Erreur modification crédit:', error);
        showNotification(`Erreur: ${error.message}`, 'error');
    }
}

// Fonction pour supprimer un crédit
async function deleteCredit(creditId) {
    // Demander confirmation
    const confirmMessage = 'Êtes-vous sûr de vouloir supprimer ce crédit ?\n\nCette action est irréversible et affectera le solde du compte.';
    
    if (!confirm(confirmMessage)) {
        return;
    }
    
    try {
        const response = await fetch(`/api/credit-history/${creditId}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        
        if (response.ok) {
            showNotification('Crédit supprimé avec succès !', 'success');
            // Recharger l'historique des crédits
            await loadCreditHistory(currentCreditPage);
            // Recharger les comptes pour mettre à jour les soldes
            if (['directeur_general', 'pca', 'admin'].includes(currentUser.role)) {
                await loadAccountsForCredit();
            }
        } else {
            const error = await response.json();
            throw new Error(error.error);
        }
    } catch (error) {
        console.error('Erreur suppression crédit:', error);
        showNotification(`Erreur: ${error.message}`, 'error');
    }
}

// Fonction pour charger le solde du compte (pour les directeurs)
async function loadAccountBalance() {
    if (['directeur', 'directeur_general', 'pca', 'admin'].includes(currentUser.role)) return;
    
    try {
        const response = await fetch('/api/account/balance');
        if (response.ok) {
            const balance = await response.json();
            
            document.getElementById('current-balance').textContent = formatCurrency(balance.current_balance);
            document.getElementById('total-credited').textContent = formatCurrency(balance.total_credited);
            // Afficher "montant dépensé / montant total crédité"
            document.getElementById('total-spent').textContent = `${formatCurrency(balance.total_spent)} / ${formatCurrency(balance.total_credited)}`;
            document.getElementById('balance-info').style.display = 'block';
        }
    } catch (error) {
        console.error('Erreur chargement solde:', error);
    }
}

// Fonction pour charger tous les directeurs pour la création de comptes
async function loadUsersWithoutAccount() {
    try {
        // Détecter le type de compte sélectionné
        const accountType = document.getElementById('accountType').value;
        
        // Choisir la bonne API selon le type de compte
        let apiEndpoint = '/api/users/directors-only'; // Par défaut : seulement les directeurs
        if (accountType === 'partenaire') {
            apiEndpoint = '/api/users/directors-for-accounts'; // Partenaire : tous les directeurs
        }
        
        const response = await fetch(apiEndpoint);
        const users = await response.json();
        
        const userSelect = document.getElementById('createDirectorSelect');
        userSelect.innerHTML = '<option value="">Sélectionner un utilisateur directeur</option>';
        
        users.forEach(user => {
            const option = document.createElement('option');
            option.value = user.id;
            // Afficher le nom complet avec le rôle
            const displayName = `${user.full_name || user.username} (${user.role})`;
            option.textContent = displayName;
            userSelect.appendChild(option);
        });
        
        console.log(`[loadUsersWithoutAccount] Loaded ${users.length} users for account type: ${accountType}`);
    } catch (error) {
        console.error('Erreur chargement utilisateurs directeurs:', error);
    }
}

// Fonction pour créer un compte
async function createAccount(formData) {
    try {
        const response = await fetch('/api/accounts/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });
        
        if (response.ok) {
            showNotification('Compte créé avec succès !', 'success');
            resetAccountForm();
            await loadAccounts();
            await loadUsersWithoutAccount();
            if (currentUser.role === 'directeur_general' || currentUser.role === 'pca' || currentUser.role === 'admin') {
                await loadAccountsForCredit();
                await loadCreditAccounts(); // Charger les comptes pour le filtre
                await loadCreditHistory();
            }
        } else {
            const error = await response.json();
            throw new Error(error.error);
        }
    } catch (error) {
        showNotification(`Erreur: ${error.message}`, 'error');
    }
}

// Fonction pour modifier un compte
async function updateAccount(accountId, formData) {
    try {
        const response = await fetch(`/api/accounts/${accountId}/update`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });
        
        if (response.ok) {
            showNotification('Compte modifié avec succès !', 'success');
            resetAccountForm();
            await loadAccounts();
            await loadUsersWithoutAccount();
            if (currentUser.role === 'directeur_general' || currentUser.role === 'pca' || currentUser.role === 'admin') {
                await loadAccountsForCredit();
                await loadCreditAccounts(); // Charger les comptes pour le filtre
                await loadCreditHistory();
            }
        } else {
            const error = await response.json();
            throw new Error(error.error);
        }
    } catch (error) {
        showNotification(`Erreur: ${error.message}`, 'error');
    }
}

// Fonction pour réinitialiser le formulaire de compte
function resetAccountForm() {
    document.getElementById('createAccountForm').reset();
    const submitButton = document.querySelector('#createAccountForm button[type="submit"]');
    const cancelButton = document.getElementById('cancelAccountEdit');
    const formTitle = document.querySelector('#createAccountForm h3');
    
    submitButton.textContent = 'Créer le Compte';
    delete submitButton.dataset.editingId;
    cancelButton.style.display = 'none';
    
    // Remettre le titre original
    if (formTitle) {
        formTitle.textContent = 'Créer/Assigner un Compte';
        formTitle.style.color = ''; // Remettre la couleur par défaut
    }
    
    // Masquer les sections spécifiques
    document.getElementById('categoryTypeGroup').style.display = 'none';
    document.getElementById('permissionsSection').style.display = 'none';
    document.getElementById('partnerDirectorsGroup').style.display = 'none';
    document.getElementById('userSelectGroup').style.display = 'block';
    
    // Rétablir le champ montant initial en mode création
    const initialAmountField = document.getElementById('initialAmount');
    const initialAmountGroup = initialAmountField?.closest('.form-group');
    const initialAmountLabel = initialAmountGroup?.querySelector('label');
    
    if (initialAmountField) {
        initialAmountField.disabled = false;
        initialAmountField.style.backgroundColor = '';
        initialAmountField.style.color = '';
        initialAmountField.value = '0';
    }
    
    if (initialAmountLabel) {
        initialAmountLabel.textContent = 'Montant Initial (optionnel)';
    }
    
    // Rétablir la visibilité du montant initial
    if (initialAmountGroup) initialAmountGroup.style.display = 'block';
}

// Fonction pour charger les comptes pour le crédit
async function loadAccountsForCredit() {
    try {
        const response = await fetch('/api/accounts/for-credit');
        const accounts = await response.json();
        
        const accountSelect = document.getElementById('creditAccountSelect');
        accountSelect.innerHTML = '<option value="">Sélectionner un compte</option>';
        
        accounts.forEach(account => {
            const option = document.createElement('option');
            option.value = account.id;
            // Afficher le type de compte avec le nom pour plus de clarté
            const accountType = account.account_type || 'classique';
            const typeBadge = accountType.charAt(0).toUpperCase() + accountType.slice(1);
            option.textContent = `${account.account_name} [${typeBadge}]`;
            // Ajouter les données nécessaires pour la logique JavaScript
            option.dataset.accountType = accountType;
            option.dataset.balance = account.current_balance || 0;
            accountSelect.appendChild(option);
        });
    } catch (error) {
        console.error('Erreur chargement comptes pour crédit:', error);
        showNotification('Erreur lors du chargement des comptes', 'error');
    }
}

// Utilitaires de date
function setDefaultDate() {
    const today = new Date().toISOString().split('T')[0];
    // Initialiser la date du crédit
    const creditDateInput = document.getElementById('creditDate');
    if (creditDateInput) {
        creditDateInput.value = today;
    }
    document.getElementById('expense-date').value = today;
    // Initialiser la quantité à 1
    const quantityField = document.getElementById('expense-quantity');
    if (quantityField) {
        quantityField.value = '1';
    }
    // Initialiser prévisible à "oui"
    const predictableField = document.getElementById('expense-predictable');
    if (predictableField) {
        predictableField.value = 'oui';
    }
}
// Gestionnaires d'événements
document.addEventListener('DOMContentLoaded', function() {
    // Event listener pour le bouton info du Cash disponible
    setupCashDetailModal();
    
    // Vérifier si l'utilisateur est déjà connecté
    fetch('/api/user')
        .then(response => {
            if (response.ok) {
                return response.json();
            }
            throw new Error('Non connecté');
        })
        .then(async user => {
            currentUser = user;
            await showApp();
            await loadInitialData();
        })
        .catch((error) => {
            // Erreur normale au démarrage si non connecté
            console.log('Utilisateur non connecté, affichage de la page de connexion');
            showLogin();
        });
    
    // Gestionnaire de formulaire de connexion
    document.getElementById('login-form').addEventListener('submit', function(e) {
        e.preventDefault();
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        login(username, password);
    });
    
    // Gestionnaire de déconnexion
    document.getElementById('logout-btn').addEventListener('click', logout);
    
    // Gestionnaires de navigation
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const section = this.getAttribute('data-section');
            showSection(section);
        });
    });
    
    // Gestionnaire de formulaire de dépense
    document.getElementById('expense-form').addEventListener('submit', function(e) {
        e.preventDefault();
        
        // Créer un FormData pour gérer les fichiers
        const formData = new FormData();
        formData.append('account_id', document.getElementById('expense-account').value);
        formData.append('expense_type', document.getElementById('expense-type').value);
        formData.append('category', document.getElementById('expense-category').value);
        formData.append('subcategory', document.getElementById('expense-subcategory').value);
        formData.append('designation', document.getElementById('expense-designation').value);
        formData.append('supplier', document.getElementById('expense-supplier').value);
        formData.append('quantity', document.getElementById('expense-quantity').value);
        formData.append('unit_price', document.getElementById('expense-unit-price').value);
        formData.append('total', document.getElementById('expense-total').value);
        formData.append('predictable', document.getElementById('expense-predictable').value);
        formData.append('amount', document.getElementById('expense-total').value); // Le montant est le total calculé
        formData.append('description', document.getElementById('expense-description').value);
        formData.append('expense_date', document.getElementById('expense-date').value);
        
        // Ajouter le fichier s'il existe
        const fileInput = document.getElementById('expense-justification');
        if (fileInput.files[0]) {
            formData.append('justification', fileInput.files[0]);
        }
        
        // Stocker formData globalement et afficher la confirmation
        window.pendingExpenseFormData = formData;
        showExpenseConfirmationModal();
    });
    

    
    // Gestionnaires pour les sélecteurs de catégories hiérarchiques
    document.getElementById('expense-type').addEventListener('change', function() {
        const typeId = this.value;
        loadCategoriesByType(typeId);
    });
    
    document.getElementById('expense-category').addEventListener('change', function() {
        const typeId = document.getElementById('expense-type').value;
        const categoryId = this.value;
        loadSubcategoriesByCategory(typeId, categoryId);
    });
    
    document.getElementById('expense-subcategory').addEventListener('change', function() {
        const subcategoryId = this.value;
        handleSubcategoryChange(subcategoryId);
    });
    
    // Gestionnaires pour le calcul automatique du total
    document.getElementById('expense-quantity').addEventListener('input', calculateTotal);
    document.getElementById('expense-unit-price').addEventListener('input', calculateTotal);
    
    // Gestionnaires pour valider le budget quand on quitte les champs quantité/prix
    document.getElementById('expense-quantity').addEventListener('blur', function() {
        const totalField = document.getElementById('expense-total');
        if (totalField && totalField.value && parseFloat(totalField.value) > 0) {
            validateExpenseAmount();
        }
    });
    
    document.getElementById('expense-unit-price').addEventListener('blur', function() {
        const totalField = document.getElementById('expense-total');
        if (totalField && totalField.value && parseFloat(totalField.value) > 0) {
            validateExpenseAmount();
        }
    });
    
    // Gestionnaire pour l'édition manuelle du total
    document.getElementById('expense-total').addEventListener('input', function() {
        // Marquer que l'utilisateur a modifié manuellement le total
        this.dataset.manuallyEdited = 'true';
        // Supprimer les anciens messages de validation pendant la saisie
        let errorDiv = document.getElementById('balance-error');
        if (errorDiv) {
            errorDiv.remove();
        }
    });
    
    // Gestionnaire pour valider le budget quand on quitte le champ (perte de focus)
    document.getElementById('expense-total').addEventListener('blur', function() {
        // Valider le solde seulement quand on quitte le champ
        validateExpenseAmount();
    });
    
    // Gestionnaire pour réinitialiser le mode automatique quand on vide le champ total
    document.getElementById('expense-total').addEventListener('focus', function() {
        if (this.value === '' || this.value === '0') {
            delete this.dataset.manuallyEdited;
        }
    });
    
    // Gestionnaire pour valider le solde quand on change de compte
    document.getElementById('expense-account').addEventListener('change', function() {
        // Valider seulement si un montant est déjà saisi
        const totalField = document.getElementById('expense-total');
        if (totalField && totalField.value && parseFloat(totalField.value) > 0) {
        validateExpenseAmount();
        }
        handleAccountSelectionChange();
    });
    
    // Gestionnaire pour la validation des fichiers
    document.getElementById('expense-justification').addEventListener('change', function() {
        validateFile(this);
    });
    
    // Gestionnaire de formulaire de création/modification de compte
    document.getElementById('createAccountForm').addEventListener('submit', function(e) {
        e.preventDefault();
        const submitButton = this.querySelector('button[type="submit"]');
        const isEditing = submitButton.dataset.editingId;
        
        const accountType = document.getElementById('accountType').value;
        const formData = {
            user_id: (accountType === 'partenaire' || accountType === 'statut' || accountType === 'Ajustement' || accountType === 'depot')
                ? null : parseInt(document.getElementById('createDirectorSelect').value),
            account_name: document.getElementById('accountName').value,
            initial_amount: parseFloat(document.getElementById('initialAmount').value) || 0,
            description: document.getElementById('createDescription').value,
            account_type: accountType,
            credit_permission_user_id: document.getElementById('creditPermissionDirectorSelect').value || null
        };
        
        // Pour les comptes classiques, ajouter le type de catégorie (optionnel)
        if (accountType === 'classique') {
            const categoryType = document.getElementById('categoryTypeSelect').value;
            // Le type de catégorie est optionnel, on l'ajoute même s'il est vide
            formData.category_type = categoryType || null;
        }
        
        // Pour les comptes partenaires, ajouter les directeurs assignés (optionnel)
        if (accountType === 'partenaire') {
            const director1 = document.getElementById('partnerDirector1').value;
            const director2 = document.getElementById('partnerDirector2').value;
            const partnerDirectors = [];
            
            if (director1) partnerDirectors.push(parseInt(director1));
            if (director2) partnerDirectors.push(parseInt(director2));
            
            formData.partner_directors = partnerDirectors;
        }
        
        if (isEditing) {
            // Mode modification
            updateAccount(parseInt(isEditing), formData);
        } else {
            // Mode création
            createAccount(formData);
        }
    });
    
    // Gestionnaire de formulaire de crédit de compte
    document.getElementById('creditAccountForm').addEventListener('submit', function(e) {
        e.preventDefault();
        
        const accountSelect = document.getElementById('creditAccountSelect');
        const selectedOption = accountSelect.options[accountSelect.selectedIndex];
        const accountName = selectedOption.textContent;
        const amount = parseInt(document.getElementById('creditAmount').value);
        const formattedAmount = amount.toLocaleString('fr-FR');
        
        // Popup de confirmation
        const confirmMessage = `Êtes-vous sûr de vouloir créditer le compte "${accountName}" ?\n\nMontant: ${formattedAmount} FCFA\n\nCette action modifiera le solde du compte.`;
        
        if (!confirm(confirmMessage)) {
            return;
        }
        
        const formData = {
            account_id: parseInt(document.getElementById('creditAccountSelect').value),
            amount: amount,
            description: document.getElementById('creditDescription').value,
            credit_date: document.getElementById('creditDate').value
        };
        creditAccount(formData);
    });
    
    // Gestionnaire de filtre des dépenses
    document.getElementById('filter-expenses').addEventListener('click', function() {
        loadExpenses();
    });
    
    // Gestionnaires pour les filtres du dashboard
    document.getElementById('filter-dashboard').addEventListener('click', function() {
        // Utiliser le mois sélectionné pour actualiser les données
        if (selectedMonth) {
            loadMonthlyDashboard(selectedMonth);
        } else {
            loadDashboard();
        }
    });
    
    document.getElementById('reset-dashboard').addEventListener('click', function() {
        // Remettre le mois en cours
        const currentDate = new Date();
        const currentMonth = `${currentDate.getFullYear()}-${(currentDate.getMonth() + 1).toString().padStart(2, '0')}`;
        
        // Mettre à jour le sélecteur de mois
        const monthInput = document.getElementById('dashboard-month');
        if (monthInput) {
            monthInput.value = currentMonth;
            selectedMonth = currentMonth;
            updateMonthDisplay(currentMonth);
            updateDateFilters(currentMonth);
        }
        
        loadDashboard();
    });
    
    // Gestionnaires pour la gestion des factures
    document.getElementById('select-all-expenses').addEventListener('click', selectAllExpenses);
    document.getElementById('deselect-all-expenses').addEventListener('click', deselectAllExpenses);
    document.getElementById('generate-invoices').addEventListener('click', generateInvoicesPDF);
    
    // Gestionnaire pour la checkbox "tout sélectionner" dans l'en-tête
    document.getElementById('select-all-header').addEventListener('change', function() {
        const checkboxes = document.querySelectorAll('.expense-checkbox');
        checkboxes.forEach(checkbox => {
            checkbox.checked = this.checked;
            const expenseId = checkbox.dataset.expenseId;
            toggleExpenseSelection(expenseId, this.checked);
        });
        updateSelectedCount();
    });
    
    // Délégation d'événements pour les checkboxes des dépenses
    document.addEventListener('change', function(e) {
        if (e.target.classList.contains('expense-checkbox')) {
            const expenseId = e.target.dataset.expenseId;
            const isSelected = e.target.checked;
            toggleExpenseSelection(expenseId, isSelected);
            updateSelectedCount();
            
            // Mettre à jour la checkbox "tout sélectionner" dans l'en-tête
            const allCheckboxes = document.querySelectorAll('.expense-checkbox');
            const checkedCheckboxes = document.querySelectorAll('.expense-checkbox:checked');
            const headerCheckbox = document.getElementById('select-all-header');
            
            if (checkedCheckboxes.length === 0) {
                headerCheckbox.indeterminate = false;
                headerCheckbox.checked = false;
            } else if (checkedCheckboxes.length === allCheckboxes.length) {
                headerCheckbox.indeterminate = false;
                headerCheckbox.checked = true;
            } else {
                headerCheckbox.indeterminate = true;
            }
        }
    });
    
    // Définir les dates par défaut pour les filtres (semaine courante)
    const today = new Date();
    const monday = new Date(today);
    monday.setDate(today.getDate() - (today.getDay() + 6) % 7);
    
    document.getElementById('filter-start-date').value = monday.toISOString().split('T')[0];
    document.getElementById('filter-end-date').value = today.toISOString().split('T')[0];
    
    // Les dates par défaut du dashboard sont maintenant définies dans loadInitialData()
    
    // Configurer les event listeners pour le modal de modification
    setupEditModalEventListeners();
    
    // Configurer les event listeners pour les comptes partenaires
    setupPartnerEventListeners();
    
    // Gestionnaire pour le bouton toggle des cartes additionnelles du dashboard
    const toggleButton = document.getElementById('toggle-additional-cards');
    if (toggleButton) {
        let showingAll = false;
        
        toggleButton.addEventListener('click', function() {
            const additionalCards = document.querySelectorAll('.additional-card');
            
            if (showingAll) {
                // Masquer les cartes additionnelles
                additionalCards.forEach(card => {
                    card.style.display = 'none';
                    card.classList.remove('show');
                });
                this.innerHTML = '<i class="fas fa-eye"></i> Afficher toutes les cartes';
                showingAll = false;
            } else {
                // Afficher les cartes additionnelles
                additionalCards.forEach(card => {
                    // Vérifier les permissions pour les cartes restreintes
                    if (card.id === 'pl-sans-stock-charges-card' || card.id === 'total-depot-balance-card') {
                        if (['directeur_general', 'pca', 'admin'].includes(currentUser.role)) {
                            card.style.display = 'block';
                            card.classList.add('show');
                        }
                    } else {
                        card.style.display = 'block';
                        card.classList.add('show');
                    }
                });
                this.innerHTML = '<i class="fas fa-eye-slash"></i> Masquer les cartes additionnelles';
                showingAll = true;
            }
        });
    }
});

async function creditAccount(formData) {
    try {
        const response = await fetch('/api/accounts/credit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });
        
        if (response.ok) {
            const result = await response.json();
            showNotification(result.message, 'success');
            document.getElementById('creditAccountForm').reset();
            // Remettre la date à aujourd'hui
            document.getElementById('creditDate').value = new Date().toISOString().split('T')[0];
            await loadAccounts();
            await loadCreditHistory();
        } else {
            const error = await response.json();
            throw new Error(error.error);
        }
    } catch (error) {
        showNotification(`Erreur: ${error.message}`, 'error');
    }
}

// Fonction pour gérer le changement de type de compte
// Charger les types de catégories depuis l'API
async function loadCategoryTypes() {
    try {
        const response = await fetch('/api/categories-config');
        const config = await response.json();
        
        const categoryTypeSelect = document.getElementById('categoryTypeSelect');
        categoryTypeSelect.innerHTML = '<option value="">Sélectionner un type de catégorie</option>';
        
        config.types.forEach(type => {
            const option = document.createElement('option');
            option.value = type.name;
            option.textContent = type.name;
            categoryTypeSelect.appendChild(option);
        });
    } catch (error) {
        console.error('Erreur chargement types de catégories:', error);
    }
}

// Gérer les changements d'assignation d'utilisateur
function handleUserAssignmentChange() {
    const assignedUserId = document.getElementById('createDirectorSelect').value;
    const assignedDirectorGroup = document.getElementById('assignedDirectorGroup');
    
    if (assignedUserId && assignedDirectorGroup) {
        // Si un utilisateur est assigné, masquer le groupe "Directeur Créditeur"
        assignedDirectorGroup.style.display = 'none';
    } else if (assignedDirectorGroup) {
        // Si aucun utilisateur assigné, montrer le groupe "Directeur Créditeur"
        assignedDirectorGroup.style.display = 'block';
    }
}

// Fonction pour charger les types de comptes depuis l'API
async function loadAccountTypes() {
    try {
        const response = await fetch('/api/accounts/types');
        if (!response.ok) throw new Error('Failed to fetch account types');
        const accountTypes = await response.json();
        
        const select = document.getElementById('accountType');
        if (!select) return;
        
        // Vider le select et ajouter l'option par défaut
        select.innerHTML = '<option value="">Sélectionner un type</option>';
        
        // Ajouter les options depuis l'API
        accountTypes.forEach(type => {
            const option = document.createElement('option');
            option.value = type.id;
            option.textContent = type.name;
            select.appendChild(option);
        });
        
        console.log('[loadAccountTypes] Account types loaded successfully:', accountTypes.length);
    } catch (error) {
        console.error('Erreur chargement types de comptes:', error);
        // En cas d'erreur, restaurer les options par défaut
        const select = document.getElementById('accountType');
        if (select) {
            select.innerHTML = `
                <option value="">Sélectionner un type</option>
                <option value="classique">Compte Classique</option>
                <option value="partenaire">Compte Partenaire</option>
                <option value="statut">Compte Statut</option>
                <option value="Ajustement">Compte Ajustement</option>
                <option value="depot">Compte Dépôt</option>
                <option value="creance">Compte Créance</option>
            `;
        }
    }
}

function handleAccountTypeChange() {
    console.log('[handleAccountTypeChange] Fired.');
    const accountType = document.getElementById('accountType').value;
    console.log(`[handleAccountTypeChange] Selected account type: "${accountType}"`);

    const helpText = document.getElementById('accountTypeHelp');
    const userSelectGroup = document.getElementById('userSelectGroup');
    const createDirectorSelect = document.getElementById('createDirectorSelect');
    const categoryTypeGroup = document.getElementById('categoryTypeGroup');
    const permissionsSection = document.getElementById('permissionsSection');
    const creditPermissionGroup = document.getElementById('creditPermissionGroup');
    const partnerDirectorsGroup = document.getElementById('partnerDirectorsGroup');
    
    // Gérer l'affichage du champ montant initial
    const initialAmountGroup = document.getElementById('initialAmount')?.closest('.form-group');
    
    // Cacher toutes les sections spécifiques
    console.log('[handleAccountTypeChange] Hiding all specific sections.');
    categoryTypeGroup.style.display = 'none';
    permissionsSection.style.display = 'none';
    creditPermissionGroup.style.display = 'none';
    partnerDirectorsGroup.style.display = 'none';
    
    // Rétablir la visibilité du sélecteur d'utilisateur par défaut
    userSelectGroup.style.display = 'block';
    createDirectorSelect.required = true;
    
    // Rétablir la visibilité du montant initial par défaut
    if (initialAmountGroup) initialAmountGroup.style.display = 'block';

    // Messages d'aide selon le type
    const helpMessages = {
        'classique': 'Compte standard assigné à un directeur. Le DG peut donner des permissions de crédit.',
        'partenaire': 'Compte accessible à tous les utilisateurs.',
        'statut': 'Compte où le crédit écrase le solde existant (DG/PCA uniquement).',
        'Ajustement': 'Compte spécial pour les ajustements comptables (DG/PCA uniquement).',
        'depot': 'Compte dépôt exclu du calcul de solde global (DG/PCA uniquement).',
        'creance': 'Compte spécial pour le suivi des créances clients. Isolé des calculs généraux.'
    };
     
    if (accountType && helpMessages[accountType]) {
        helpText.textContent = helpMessages[accountType];
        console.log(`[handleAccountTypeChange] Set help text: "${helpMessages[accountType]}"`);
    } else {
        helpText.textContent = 'Sélectionnez d\'abord un type pour voir la description';
        console.log('[handleAccountTypeChange] Set default help text.');
    }
    
    // Gestion spécifique selon le type
    switch (accountType) {
        case 'classique':
            console.log('[handleAccountTypeChange] Type is "classique". Showing specific groups.');
            categoryTypeGroup.style.display = 'block';
            creditPermissionGroup.style.display = 'block';
            // Afficher le champ montant initial
            if (initialAmountGroup) initialAmountGroup.style.display = 'block';
            // La section des permissions existantes n'est montrée que pour la modification
            // permissionsSection.style.display = 'block';
            loadCategoryTypes(); // Charger les types de catégories
            loadDirectorsForCreditPermission(); // Charger les directeurs pour la permission
            // Recharger les utilisateurs selon le type de compte (directeurs seulement)
            loadUsersWithoutAccount();
            break;
            
        case 'creance':
            console.log('[handleAccountTypeChange] Type is "creance". Compte créance assignable à un directeur.');
            // Les comptes créance peuvent être assignés à un directeur comme les comptes classiques
            // Mais sans les options de catégorie et permission de crédit
            // Masquer le champ montant initial car le crédit est géré par client
            if (initialAmountGroup) initialAmountGroup.style.display = 'none';
            // Recharger les utilisateurs selon le type de compte (directeurs seulement)
            loadUsersWithoutAccount();
            break;
            
        case 'partenaire':
            console.log(`[handleAccountTypeChange] Type is "${accountType}". Showing partner directors section.`);
            userSelectGroup.style.display = 'none';
            createDirectorSelect.required = false;
            partnerDirectorsGroup.style.display = 'block';
            // Charger les directeurs pour l'assignation
            loadDirectorsForPartnerAssignment();
            // Afficher le champ montant initial
            if (initialAmountGroup) initialAmountGroup.style.display = 'block';
            break;
            
        case 'statut':
        case 'Ajustement':
        case 'depot':
            console.log(`[handleAccountTypeChange] Type is "${accountType}". Hiding userSelectGroup.`);
            userSelectGroup.style.display = 'none';
            createDirectorSelect.required = false;
            // Afficher le champ montant initial pour ces types
            if (initialAmountGroup) initialAmountGroup.style.display = 'block';
            break;
        
        default:
            // Pour les types non reconnus, afficher le montant initial par défaut
            if (initialAmountGroup) initialAmountGroup.style.display = 'block';
            // Recharger les utilisateurs selon le type de compte (directeurs seulement)
            loadUsersWithoutAccount();
            break;
    }
}

async function loadDirectorsForCreditPermission() {
    try {
        const response = await fetch('/api/users/directors-for-accounts');
        if (!response.ok) throw new Error('Failed to fetch directors');
        const directors = await response.json();
        
        const select = document.getElementById('creditPermissionDirectorSelect');
        select.innerHTML = '<option value="">Aucun directeur supplémentaire</option>'; // Reset
        
        directors.forEach(director => {
            const option = document.createElement('option');
            option.value = director.id;
            option.textContent = director.full_name || director.username;
            select.appendChild(option);
        });
        console.log('[loadDirectorsForCreditPermission] Successfully populated directors for credit permission.');

    } catch (error) {
        console.error('Erreur chargement directeurs pour permission:', error);
    }
}

async function loadDirectorsForPartnerAssignment() {
    try {
        const response = await fetch('/api/users/directors-for-accounts');
        if (!response.ok) throw new Error('Failed to fetch directors');
        const directors = await response.json();
        
        const select1 = document.getElementById('partnerDirector1');
        const select2 = document.getElementById('partnerDirector2');
        
        // Réinitialiser les listes
        select1.innerHTML = '<option value="">Sélectionner un directeur</option>';
        select2.innerHTML = '<option value="">Sélectionner un directeur</option>';
        
        // Ajouter les directeurs aux deux listes
        directors.forEach(director => {
            // Formater le nom avec le rôle
            const displayName = `${director.full_name || director.username} (${director.role})`;
            
            const option1 = document.createElement('option');
            option1.value = director.id;
            option1.textContent = displayName;
            select1.appendChild(option1);
            
            const option2 = document.createElement('option');
            option2.value = director.id;
            option2.textContent = displayName;
            select2.appendChild(option2);
        });
        
        console.log('[loadDirectorsForPartnerAssignment] Successfully populated directors for partner assignment.');
    } catch (error) {
        console.error('Erreur chargement directeurs pour assignation partenaire:', error);
    }
}

// Fonction pour charger les directeurs pour les comptes créance
async function loadDirectorsForCreance() {
    try {
        const response = await fetch('/api/users/directors-for-accounts');
        const directors = await response.json();
        
        const creanceDirectorSelect = document.getElementById('creanceDirectorSelect');
        const createDirectorSelect = document.getElementById('createDirectorSelect');
        
        // Remplir les deux selects
        creanceDirectorSelect.innerHTML = '<option value="">Sélectionner le directeur créditeur</option>';
        createDirectorSelect.innerHTML = '<option value="">Sélectionner un utilisateur directeur</option>';
        
        directors.forEach(director => {
            // Formater le nom avec le rôle
            const displayName = `${director.full_name || director.username} (${director.role})`;
            
            const option1 = document.createElement('option');
            option1.value = director.id;
            option1.textContent = displayName;
            creanceDirectorSelect.appendChild(option1);
            
            const option2 = document.createElement('option');
            option2.value = director.id;
            option2.textContent = displayName;
            createDirectorSelect.appendChild(option2);
        });
    } catch (error) {
        console.error('Erreur chargement directeurs:', error);
    }
}

// Fonction pour gérer le changement de compte dans le formulaire de crédit
async function handleCreditAccountChange() {
    const select = document.getElementById('creditAccountSelect');
    const accountId = select.value;
    const historyContainer = document.getElementById('special-credit-history-container');
    const historyBody = document.getElementById('special-credit-history-body');
    const amountInput = document.getElementById('creditAmount');
    const amountHelp = document.getElementById('credit-amount-help');
    
    historyContainer.style.display = 'none';
    historyBody.innerHTML = '';
    
    if (!accountId) {
        // Autoriser les montants négatifs par défaut
        amountInput.removeAttribute('min');
        amountHelp.style.display = 'none';
        return;
    }

    try {
        // Récupérer le type de compte sélectionné
        const selectedOption = select.options[select.selectedIndex];
        const accountType = selectedOption.dataset?.accountType;
        
        // Adapter le formulaire selon le type de compte
        // Autoriser les montants négatifs pour tous les types de comptes
        amountInput.removeAttribute('min');
        
        if (accountType === 'statut') {
            // Afficher l'aide spécifique pour les comptes statut
            amountHelp.style.display = 'block';
        } else {
            amountHelp.style.display = 'none';
        }

        const response = await fetch(`/api/accounts/${accountId}/special-history`);
        const history = await response.json();
        
        if (history.length > 0) {
            historyBody.innerHTML = history.map(h => `
                <tr>
                    <td>${formatDate(h.credit_date)}</td>
                    <td>${formatCurrency(h.amount)}</td>
                    <td>${h.credited_by_name}</td>
                    <td>${h.comment || '-'}</td>
                </tr>
            `).join('');
            historyContainer.style.display = 'block';
        }
    } catch (error) {
        console.error('Erreur chargement historique spécial:', error);
    }
}

// Fonction pour charger les comptes de l'utilisateur connecté (pour les dépenses)
async function loadUserAccounts() {
    // Permettre aux directeurs, directeurs généraux et PCA de voir leurs comptes
    if (currentUser.role !== 'directeur' && currentUser.role !== 'directeur_general' && currentUser.role !== 'pca' && currentUser.role !== 'admin') {
        console.log('Utilisateur non autorisé, pas de chargement de comptes');
        return;
    }
    
    try {
        console.log('Chargement des comptes pour l\'utilisateur:', currentUser.username, 'Role:', currentUser.role);
        const response = await fetch('/api/accounts');
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const accounts = await response.json();
        console.log('Comptes reçus:', accounts);
        
        const accountSelect = document.getElementById('expense-account');
        if (!accountSelect) {
            console.error('Élément expense-account non trouvé');
            return;
        }
        
        accountSelect.innerHTML = '<option value="">Sélectionner un compte</option>';
        
        // Filtrer les comptes partenaires (ils sont gérés séparément)
        const filteredAccounts = accounts.filter(account => account.account_type !== 'partenaire');
        
        if (filteredAccounts.length === 0) {
            console.log('Aucun compte (non-partenaire) trouvé pour cet utilisateur');
            accountSelect.innerHTML += '<option value="" disabled>Aucun compte disponible</option>';
            return;
        }
        
        filteredAccounts.forEach(account => {
            console.log('Ajout du compte:', account.account_name, 'ID:', account.id, 'Type:', account.account_type, 'Catégorie:', account.category_type);
            const option = document.createElement('option');
            option.value = account.id;
            option.textContent = account.account_name;
            option.dataset.accountType = account.account_type || 'classique';
            option.dataset.categoryType = account.category_type || '';
            accountSelect.appendChild(option);
        });
        
        // Ajouter un event listener pour gérer le changement de compte
        accountSelect.addEventListener('change', handleExpenseAccountChange);
        
        console.log('Comptes chargés avec succès:', filteredAccounts.length, 'comptes (hors partenaires)');
    } catch (error) {
        console.error('Erreur chargement comptes utilisateur:', error);
    }
}

// Fonction pour gérer le changement de compte et adapter le formulaire
function handleExpenseAccountChange() {
    const accountSelect = document.getElementById('expense-account');
    const selectedOption = accountSelect.options[accountSelect.selectedIndex];
    const accountTypeInfo = document.getElementById('account-type-info');
    
    if (!selectedOption || !selectedOption.value) {
        // Réinitialiser le formulaire si aucun compte n'est sélectionné
        showAllExpenseFields();
        accountTypeInfo.style.display = 'none';
        return;
    }
    
    const accountType = selectedOption.dataset.accountType || 'classique';
    
    // Afficher le type de compte sous le champ
    const typeLabels = {
        'classique': 'Classique',
        'creance': 'Créance',
        'fournisseur': 'Fournisseur',
        'partenaire': 'Partenaire',
        'statut': 'Statut'
    };
    
    accountTypeInfo.textContent = `(${typeLabels[accountType] || accountType})`;
    accountTypeInfo.style.display = 'block';
    
    // Afficher le formulaire approprié selon le type de compte
    if (accountType === 'creance' || accountType === 'fournisseur') {
        showSimplifiedExpenseForm();
    } else {
        showAllExpenseFields();
    }
}

// Fonction pour afficher le formulaire simplifié (créance/fournisseur)
function showSimplifiedExpenseForm() {
    // Masquer tous les champs non nécessaires
    const fieldsToHide = [
        'expense-type',
        'expense-category', 
        'expense-subcategory',
        'social-network-row',
        'expense-designation',
        'expense-supplier',
        'expense-quantity',
        'expense-unit-price',
        'expense-predictable',
        'expense-justification'
    ];
    
    fieldsToHide.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (field) {
            const formGroup = field.closest('.form-group') || field.closest('.form-row');
            if (formGroup) {
                formGroup.style.display = 'none';
            }
        }
    });
    
    // Afficher seulement les champs nécessaires
    const fieldsToShow = [
        'expense-date',
        'expense-total',
        'expense-description'
    ];
    
    fieldsToShow.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (field) {
            const formGroup = field.closest('.form-group') || field.closest('.form-row');
            if (formGroup) {
                formGroup.style.display = 'block';
            }
        }
    });
    
    // Modifier les labels pour le formulaire simplifié
    const totalField = document.getElementById('expense-total');
    if (totalField) {
        const label = totalField.closest('.form-group').querySelector('label');
        if (label) {
            label.textContent = 'Montant (FCFA)';
        }
        totalField.placeholder = 'Montant de la dépense';
        totalField.required = true;
    }
    
    const descriptionField = document.getElementById('expense-description');
    if (descriptionField) {
        const label = descriptionField.closest('.form-group').querySelector('label');
        if (label) {
            label.textContent = 'Description';
        }
        descriptionField.placeholder = 'Description de la dépense...';
        descriptionField.required = true;
    }
}
// Fonction pour afficher tous les champs (formulaire complet)
function showAllExpenseFields() {
    // Afficher tous les champs
    const allFields = [
        'expense-type',
        'expense-category', 
        'expense-subcategory',
        'expense-designation',
        'expense-supplier',
        'expense-quantity',
        'expense-unit-price',
        'expense-predictable',
        'expense-justification'
    ];
    
    allFields.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (field) {
            const formGroup = field.closest('.form-group') || field.closest('.form-row');
            if (formGroup) {
                formGroup.style.display = 'block';
            }
        }
    });
    
    // Restaurer les labels originaux
    const totalField = document.getElementById('expense-total');
    if (totalField) {
        const label = totalField.closest('.form-group').querySelector('label');
        if (label) {
            label.textContent = 'Montant Total (FCFA)';
        }
        totalField.placeholder = 'Calculé automatiquement';
        totalField.required = true;
    }
    
    const descriptionField = document.getElementById('expense-description');
    if (descriptionField) {
        const label = descriptionField.closest('.form-group').querySelector('label');
        if (label) {
            label.textContent = 'Description/Commentaires';
        }
        descriptionField.placeholder = 'Informations complémentaires...';
        descriptionField.required = false;
    }
}

// Fonctions pour la modification des dépenses
async function openEditModal(expenseId) {
    try {
        const response = await fetch(`/api/expenses/${expenseId}`);
        if (!response.ok) throw new Error('Erreur récupération de la dépense');
        const expense = await response.json();
        
        console.log('DEBUG: Données de la dépense reçues par le modal:', expense);

        if (currentUser.role === 'directeur') {
            const hoursDifference = (new Date() - new Date(expense.created_at)) / 36e5;
            if (hoursDifference > 24) {
                alert(`Modification non autorisée. La dépense a été créée il y a plus de 24 heures.`);
                return;
            }
        }
        
        await loadEditCategories();
        await loadEditAccounts();
        
        document.getElementById('edit-expense-id').value = expense.id;
        document.getElementById('edit-expense-account').value = expense.account_id || '';
        if (expense.expense_date) {
            document.getElementById('edit-expense-date').value = new Date(expense.expense_date).toISOString().split('T')[0];
        }
        document.getElementById('edit-expense-designation').value = expense.designation || '';
        document.getElementById('edit-expense-supplier').value = expense.supplier || '';
        document.getElementById('edit-expense-quantity').value = expense.quantity || '';
        document.getElementById('edit-expense-unit-price').value = expense.unit_price || '';
        document.getElementById('edit-expense-total').value = expense.total || expense.amount || '';
        document.getElementById('edit-expense-description').value = expense.description || '';
        
        // <<< CORRECTION ICI >>>
        // Cible un champ texte, et non une case à cocher.
        const predictableField = document.getElementById('edit-expense-predictable');
        if (predictableField) {
             predictableField.value = (expense.predictable === true || String(expense.predictable).toLowerCase() === 'oui') ? 'Oui' : 'Non';
        }

        const fileTextSpan = document.getElementById('edit-file-input-text');
        const downloadBtn = document.getElementById('download-existing-justification');
        const removeContainer = document.getElementById('remove-justification-container');

        if (expense.justification_filename) {
            fileTextSpan.textContent = expense.justification_filename;
            downloadBtn.style.display = 'inline-block';
            downloadBtn.onclick = () => window.open(expense.justification_path, '_blank');
            if(removeContainer) removeContainer.style.display = 'block';
        } else {
            fileTextSpan.textContent = 'Choisir un fichier';
            downloadBtn.style.display = 'none';
            if(removeContainer) removeContainer.style.display = 'none';
        }

        document.getElementById('edit-expense-justification').value = '';
        
        if (expense.expense_type) {
            document.getElementById('edit-expense-type').value = expense.expense_type;
            loadEditCategoriesByType(expense.expense_type);
            setTimeout(() => {
                if (expense.category) {
                    document.getElementById('edit-expense-category').value = expense.category;
                    loadEditSubcategoriesByCategory(expense.expense_type, expense.category);
                    setTimeout(() => {
                        if (expense.subcategory) document.getElementById('edit-expense-subcategory').value = expense.subcategory;
                    }, 100);
                }
            }, 100);
        }
        
        document.getElementById('edit-expense-modal').style.display = 'block';
    } catch (error) {
        console.error('Erreur ouverture modal:', error);
        showNotification(error.message, 'error');
    }
}

function closeEditModal() {
    document.getElementById('edit-expense-modal').style.display = 'none';
    document.getElementById('edit-expense-form').reset();
}

// Fonction pour ouvrir le modal de détails d'une dépense
async function openViewDetailsModal(expenseId) {
    try {
        const response = await fetch(`/api/expenses/${expenseId}`);
        if (!response.ok) throw new Error('Erreur récupération de la dépense');
        const expense = await response.json();
        
        console.log('DEBUG: Données de la dépense pour détails:', expense);

        // Remplir les champs de détails
        document.getElementById('view-expense-account').textContent = expense.account_name || 'Non renseigné';
        document.getElementById('view-expense-type').textContent = expense.expense_type || 'Non renseigné';
        document.getElementById('view-expense-category').textContent = expense.category_name || 'Non renseigné';
        document.getElementById('view-expense-subcategory').textContent = expense.subcategory || 'Non renseigné';
        
        // Afficher le réseau social si applicable
        const socialNetworkRow = document.getElementById('view-social-network-row');
        const socialNetworkDetail = document.getElementById('view-social-network-detail');
        if (expense.social_network_detail) {
            socialNetworkRow.style.display = 'block';
            socialNetworkDetail.textContent = expense.social_network_detail;
        } else {
            socialNetworkRow.style.display = 'none';
        }
        
        document.getElementById('view-expense-date').textContent = expense.expense_date ? formatDate(expense.expense_date) : 'Non renseigné';
        document.getElementById('view-expense-created').textContent = expense.created_at ? formatDate(expense.created_at) + ' ' + new Date(expense.created_at).toLocaleTimeString('fr-FR', {hour: '2-digit', minute: '2-digit'}) : 'Non renseigné';
        document.getElementById('view-expense-designation').textContent = expense.designation || 'Non renseigné';
        document.getElementById('view-expense-supplier').textContent = expense.supplier || 'Non renseigné';
        document.getElementById('view-expense-quantity').textContent = expense.quantity || 'Non renseigné';
        document.getElementById('view-expense-unit-price').textContent = expense.unit_price ? formatCurrency(expense.unit_price) : 'Non renseigné';
        document.getElementById('view-expense-total').textContent = expense.total || expense.amount ? formatCurrency(parseInt(expense.total || expense.amount)) : 'Non renseigné';
        document.getElementById('view-expense-predictable').textContent = expense.predictable === 'oui' ? 'Oui' : 'Non';
        document.getElementById('view-expense-username').textContent = expense.username || 'Non renseigné';
        document.getElementById('view-expense-description').textContent = expense.description || 'Non renseigné';
        
        // Gérer le justificatif
        const justificationElement = document.getElementById('view-expense-justification');
        if (expense.justification_filename) {
            justificationElement.innerHTML = `
                <div style="display: flex; align-items: center; gap: 10px;">
                    <span>${expense.justification_filename}</span>
                    <button class="btn btn-sm btn-primary" onclick="window.open('${expense.justification_path}', '_blank')" title="Télécharger le justificatif">
                        <i class="fas fa-download"></i> Télécharger
                    </button>
                </div>
            `;
        } else {
            justificationElement.textContent = 'Aucun justificatif';
        }
        
        document.getElementById('view-details-modal').style.display = 'block';
    } catch (error) {
        console.error('Erreur ouverture modal détails:', error);
        showNotification(error.message, 'error');
    }
}

function closeViewDetailsModal() {
    document.getElementById('view-details-modal').style.display = 'none';
}

// Charger les catégories pour le modal de modification
async function loadEditCategories() {
    try {
        const response = await fetch('/api/categories');
        const categoriesData = await response.json();
        
        const typeSelect = document.getElementById('edit-expense-type');
        typeSelect.innerHTML = '<option value="">Sélectionner un type</option>';
        
        categoriesData.types.forEach(type => {
            const option = document.createElement('option');
            option.value = type.id;
            option.textContent = type.name;
            typeSelect.appendChild(option);
        });
        
        window.editCategoriesConfig = categoriesData;
        
    } catch (error) {
        console.error('Erreur chargement catégories:', error);
    }
}

// Charger les comptes pour le modal de modification
async function loadEditAccounts() {
    try {
        const response = await fetch('/api/accounts');
        const accounts = await response.json();
        
        const accountSelect = document.getElementById('edit-expense-account');
        accountSelect.innerHTML = '<option value="">Sélectionner un compte</option>';
        
        // Filtrer les comptes partenaires (ils sont gérés séparément)
        const filteredAccounts = accounts.filter(account => account.account_type !== 'partenaire');
        
        filteredAccounts.forEach(account => {
            const option = document.createElement('option');
            option.value = account.id;
            option.textContent = account.account_name;
            option.dataset.accountType = account.account_type || 'classique';
            accountSelect.appendChild(option);
        });
        
    } catch (error) {
        console.error('Erreur chargement comptes:', error);
    }
}

function loadEditCategoriesByType(typeId) {
    const categorySelect = document.getElementById('edit-expense-category');
    const subcategorySelect = document.getElementById('edit-expense-subcategory');
    
    categorySelect.innerHTML = '<option value="">Sélectionner une catégorie</option>';
    subcategorySelect.innerHTML = '<option value="">Sélectionner d\'abord une catégorie</option>';
    subcategorySelect.disabled = true;
    
    if (!typeId || !window.editCategoriesConfig) {
        categorySelect.disabled = true;
        return;
    }
    
    const selectedType = window.editCategoriesConfig.types.find(type => type.id === typeId);
    if (!selectedType) return;
    
    categorySelect.disabled = false;
    
    if (selectedType.categories) {
        selectedType.categories.forEach(category => {
            const option = document.createElement('option');
            option.value = category.id;
            option.textContent = category.name;
            categorySelect.appendChild(option);
        });
    }
}

function loadEditSubcategoriesByCategory(typeId, categoryId) {
    const subcategorySelect = document.getElementById('edit-expense-subcategory');
    const socialNetworkRow = document.getElementById('edit-social-network-row');
    const socialNetworkSelect = document.getElementById('edit-social-network-detail');
    
    // Réinitialiser
    subcategorySelect.innerHTML = '<option value="">Sélectionner une sous-catégorie</option>';
    socialNetworkRow.style.display = 'none';
    socialNetworkSelect.innerHTML = '<option value="">Sélectionner un réseau</option>';
    
    if (!typeId || !categoryId || !window.editCategoriesConfig) {
        subcategorySelect.disabled = true;
        return;
    }
    
    const selectedType = window.editCategoriesConfig.types.find(type => type.id === typeId);
    if (!selectedType) return;
    
    subcategorySelect.disabled = false;
    
    // Pour les types avec sous-catégories communes (Mata Group, Mata Prod, Marketing)
    if (selectedType.subcategories) {
        selectedType.subcategories.forEach(subcategory => {
            const option = document.createElement('option');
            option.value = subcategory.id;
            option.textContent = subcategory.name;
            subcategorySelect.appendChild(option);
            
            // Si c'est "Réseau social", préparer les détails
            if (subcategory.id === 'reseau_social' && subcategory.details) {
                subcategory.details.forEach(detail => {
                    const detailOption = document.createElement('option');
                    detailOption.value = detail.toLowerCase();
                    detailOption.textContent = detail;
                    socialNetworkSelect.appendChild(detailOption);
                });
            }
        });
    }
    // Pour les types avec sous-catégories spécifiques (Achat)
    else if (selectedType.categories) {
        const selectedCategory = selectedType.categories.find(cat => cat.id === categoryId);
        if (selectedCategory && selectedCategory.subcategories) {
            selectedCategory.subcategories.forEach(subcategory => {
                const option = document.createElement('option');
                option.value = subcategory.id;
                option.textContent = subcategory.name;
                subcategorySelect.appendChild(option);
            });
        }
    }
}

function handleEditSubcategoryChange(subcategoryId) {
    const socialNetworkRow = document.getElementById('edit-social-network-row');
    
    if (subcategoryId === 'reseau_social') {
        socialNetworkRow.style.display = 'flex';
    } else {
        socialNetworkRow.style.display = 'none';
    }
}

// Calcul automatique du total dans le modal
function calculateEditTotal() {
    const quantity = parseFloat(document.getElementById('edit-expense-quantity').value) || 0;
    const unitPrice = parseFloat(document.getElementById('edit-expense-unit-price').value) || 0;
    const totalField = document.getElementById('edit-expense-total');
    const submitButton = document.querySelector('#edit-expense-form button[type="submit"]');
    
    if (!totalField.dataset.manuallyEdited && quantity && unitPrice) {
        const total = Math.round(quantity * unitPrice);
        totalField.value = total;
    }
    
    // Désactiver le bouton si le total est 0 ou invalide (avec vérification de sécurité)
    const currentTotal = parseFloat(totalField.value) || 0;
    if (currentTotal <= 0) {
        if (submitButton) {
            submitButton.disabled = true;
            submitButton.style.opacity = '0.5';
        }
        
        // Afficher un message d'erreur
        let errorDiv = document.getElementById('edit-total-error');
        if (!errorDiv) {
            errorDiv = document.createElement('div');
            errorDiv.id = 'edit-total-error';
            errorDiv.style.color = '#dc3545';
            errorDiv.style.marginTop = '5px';
            totalField.parentNode.appendChild(errorDiv);
        }
        errorDiv.textContent = 'Le montant total doit être supérieur à zéro';
    } else {
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.style.opacity = '1';
        }
        
        // Supprimer le message d'erreur s'il existe
        const errorDiv = document.getElementById('edit-total-error');
        if (errorDiv) {
            errorDiv.remove();
        }
    }
    
    // Valider le solde après calcul
    validateEditExpenseAmount();
}

// Fonction pour valider le montant lors de l'édition
// BYPASS TEMPORAIRE - FONCTION DE VALIDATION D'ÉDITION COMPLÈTEMENT DÉSACTIVÉE
async function validateEditExpenseAmount() {
    try {
        const accountSelect = document.getElementById('edit-expense-account');
        const totalField = document.getElementById('edit-expense-total');
        const submitButton = document.querySelector('#edit-expense-form button[type="submit"]');
        
        if (!accountSelect || !totalField || !submitButton) return;
        
        const accountId = accountSelect.value;
        const amount = parseFloat(totalField.value) || 0;
        
        // Récupérer l'ID de la dépense en cours d'édition
        const expenseId = document.getElementById('edit-expense-id').value;
        
        // Supprimer les anciens messages d'erreur
        let errorDiv = document.getElementById('edit-balance-error');
        if (errorDiv) {
            errorDiv.remove();
        }
        
        if (!accountId || amount <= 0) {
            submitButton.disabled = false;
            submitButton.style.opacity = '1';
            return;
        }
        
        // BYPASS TEMPORAIRE - TOUTE LA LOGIQUE DE VALIDATION DÉSACTIVÉE
        /*
        // Récupérer les informations du compte
        const response = await fetch('/api/accounts');
        const accounts = await response.json();
        const selectedAccount = accounts.find(acc => acc.id.toString() === accountId);
        
        if (!selectedAccount) return;
        
        // Récupérer la dépense actuelle pour connaître l'ancien montant
        const expenseResponse = await fetch(`/api/expenses/${expenseId}`);
        const currentExpense = await expenseResponse.json();
        const oldAmount = parseInt(currentExpense.total) || 0;
        const difference = amount - oldAmount;
        
        const currentBalance = selectedAccount.current_balance;
        const totalCredited = selectedAccount.total_credited;
        
        // Créer le div d'erreur s'il n'existe pas
        errorDiv = document.createElement('div');
        errorDiv.id = 'edit-balance-error';
        errorDiv.style.marginTop = '10px';
        errorDiv.style.padding = '10px';
        errorDiv.style.borderRadius = '5px';
        errorDiv.style.fontSize = '14px';
        
        let hasError = false;
        */
        
        // BYPASS TEMPORAIRE - VÉRIFICATION DE SOLDE POUR ÉDITION DÉSACTIVÉE
        /*
        // Si on augmente le montant, vérifier le solde
        if (difference > 0 && difference > currentBalance) {
            errorDiv.style.backgroundColor = '#fee';
            errorDiv.style.color = '#c33';
            errorDiv.style.border = '1px solid #fcc';
            errorDiv.innerHTML = `
                <strong>⚠️ Solde insuffisant pour cette modification!</strong><br>
                Solde disponible: <strong>${currentBalance.toLocaleString()} FCFA</strong><br>
                Augmentation demandée: <strong>${difference.toLocaleString()} FCFA</strong><br>
                Manque: <strong>${(difference - currentBalance).toLocaleString()} FCFA</strong>
            `;
            hasError = true;
        } else
        */
        if (totalCredited > 0) {
            // Calculer les dépenses existantes (excluant la dépense en cours d'édition)
            const expensesResponse = await fetch(`/api/accounts/${selectedAccount.account_name}/expenses`);
            const expensesData = await expensesResponse.json();
            const currentTotalSpent = expensesData.expenses
                .filter(exp => exp.id.toString() !== expenseId.toString())
                .reduce((sum, exp) => sum + (parseInt(exp.total) || 0), 0);
            const newTotalSpent = currentTotalSpent + amount;
            
            if (newTotalSpent > totalCredited) {
                errorDiv.style.backgroundColor = '#fee';
                errorDiv.style.color = '#c33';
                errorDiv.style.border = '1px solid #fcc';
                errorDiv.innerHTML = `
                    <strong>⚠️ Budget dépassé!</strong><br>
                    Budget total: <strong>${totalCredited.toLocaleString()} FCFA</strong><br>
                    Autres dépenses: <strong>${currentTotalSpent.toLocaleString()} FCFA</strong><br>
                    Nouveau montant: <strong>${amount.toLocaleString()} FCFA</strong><br>
                    Total après: <strong>${newTotalSpent.toLocaleString()} FCFA</strong><br>
                    Dépassement: <strong>${(newTotalSpent - totalCredited).toLocaleString()} FCFA</strong>
                `;
                hasError = true;
            } else {
                // Afficher un message informatif si proche de la limite
                const remainingBudget = totalCredited - newTotalSpent;
                const percentageUsed = (newTotalSpent / totalCredited) * 100;
                
                if (percentageUsed >= 80) {
                    errorDiv.style.backgroundColor = '#fff3cd';
                    errorDiv.style.color = '#856404';
                    errorDiv.style.border = '1px solid #ffeaa7';
                    errorDiv.innerHTML = `
                        <strong>⚡ Attention!</strong> Vous utilisez ${percentageUsed.toFixed(1)}% de votre budget.<br>
                        Budget restant après cette modification: <strong>${remainingBudget.toLocaleString()} FCFA</strong>
                    `;
                } else {
                    errorDiv.style.backgroundColor = '#d4edda';
                    errorDiv.style.color = '#155724';
                    errorDiv.style.border = '1px solid #c3e6cb';
                    errorDiv.innerHTML = `
                        <strong>✓ Budget OK</strong><br>
                        Budget restant après cette modification: <strong>${remainingBudget.toLocaleString()} FCFA</strong>
                    `;
                }
            }
        }
        
        // BYPASS TEMPORAIRE - BOUTON TOUJOURS ACTIVÉ
        /*
        // Ajouter le div après le champ total
        totalField.parentNode.appendChild(errorDiv);
        
        // Désactiver/activer le bouton de soumission
        if (hasError) {
            submitButton.disabled = true;
            submitButton.style.opacity = '0.5';
            submitButton.style.cursor = 'not-allowed';
        } else {
            submitButton.disabled = false;
            submitButton.style.opacity = '1';
            submitButton.style.cursor = 'pointer';
        }
        */
        
        // BYPASS TEMPORAIRE - BOUTON TOUJOURS ACTIVÉ
        submitButton.disabled = false;
        submitButton.style.opacity = '1';
        submitButton.style.cursor = 'pointer';
        
    } catch (error) {
        console.error('Erreur validation solde modification:', error);
    }
}

// Ajouter les event listeners pour le modal d'édition aux event listeners existants
function setupEditModalEventListeners() {
    // Event listeners pour le modal d'édition
    document.getElementById('edit-expense-type').addEventListener('change', function() {
        const typeId = this.value;
        loadEditCategoriesByType(typeId);
    });
    
    // Gestionnaire pour le changement de fichier dans le formulaire d'édition
    document.getElementById('edit-expense-justification').addEventListener('change', function() {
        const fileText = document.getElementById('edit-file-input-text');
        if (this.files.length > 0) {
            const file = this.files[0];
            // Vérifier la taille du fichier (5MB max)
            if (file.size > 5 * 1024 * 1024) {
                showNotification('Le fichier est trop volumineux. Taille maximum : 5MB', 'error');
                this.value = '';
                fileText.textContent = 'Aucun fichier sélectionné';
                fileText.classList.remove('has-file');
                return;
            }
            fileText.textContent = file.name;
            fileText.classList.add('has-file');
        } else {
            fileText.textContent = 'Aucun fichier sélectionné';
            fileText.classList.remove('has-file');
        }
    });
    
    document.getElementById('edit-expense-category').addEventListener('change', function() {
        const typeId = document.getElementById('edit-expense-type').value;
        const categoryId = this.value;
        loadEditSubcategoriesByCategory(typeId, categoryId);
    });
    
    document.getElementById('edit-expense-subcategory').addEventListener('change', function() {
        const subcategoryId = this.value;
        handleEditSubcategoryChange(subcategoryId);
    });
    
    // Calcul automatique du total
    document.getElementById('edit-expense-quantity').addEventListener('input', calculateEditTotal);
    document.getElementById('edit-expense-unit-price').addEventListener('input', calculateEditTotal);
    
    document.getElementById('edit-expense-total').addEventListener('input', function() {
        this.dataset.manuallyEdited = 'true';
        // Valider le solde après modification du montant
        validateEditExpenseAmount();
    });
    
    document.getElementById('edit-expense-total').addEventListener('focus', function() {
        if (this.value === '' || this.value === '0') {
            delete this.dataset.manuallyEdited;
        }
    });
    
    // Gestionnaire pour valider le solde quand on change de compte dans l'édition
    document.getElementById('edit-expense-account').addEventListener('change', function() {
        validateEditExpenseAmount();
    });
    
    // Soumission du formulaire de modification
    document.getElementById('edit-expense-form').addEventListener('submit', async function(e) {
        e.preventDefault();
        try {
            const formData = new FormData(this);
            const expenseData = new FormData();
            
            // Récupérer les données manuellement pour s'assurer de leur exactitude
            const accountId = document.getElementById('edit-expense-account').value;
            
            // Ajout des champs au FormData
            expenseData.append('expense_id', formData.get('expense_id'));
            expenseData.append('account_id', accountId || '');
            expenseData.append('expense_type', document.getElementById('edit-expense-type').value);
            expenseData.append('category', document.getElementById('edit-expense-category').value);
            expenseData.append('subcategory', document.getElementById('edit-expense-subcategory').value || '');
            expenseData.append('description', document.getElementById('edit-expense-description').value);
            expenseData.append('quantity', parseFloat(document.getElementById('edit-expense-quantity').value) || 0);
            expenseData.append('unit_price', parseFloat(document.getElementById('edit-expense-unit-price').value) || 0);
            expenseData.append('total', parseFloat(document.getElementById('edit-expense-total').value) || 0);
            expenseData.append('expense_date', document.getElementById('edit-expense-date').value);
            expenseData.append('supplier', document.getElementById('edit-expense-supplier').value || '');
            expenseData.append('designation', document.getElementById('edit-expense-designation').value || '');
          
            // Lit la valeur du champ texte pour "Prévisible"
            const predictableField = document.getElementById('edit-expense-predictable');
            if (predictableField) {
                expenseData.append('predictable', predictableField.value || 'Oui');
            }

            const fileInput = document.getElementById('edit-expense-justification');
            if (fileInput.files[0]) {
                expenseData.append('justification', fileInput.files[0]);
            } else {
                const removeCheckbox = document.getElementById('remove-existing-justification');
                if (removeCheckbox && removeCheckbox.checked) {
                    expenseData.append('remove_justification', 'true');
                }
            }
            
            const response = await fetch(`/api/expenses/${formData.get('expense_id')}`, {
                method: 'PUT',
                body: expenseData
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Erreur lors de la modification');
            }
            
            const result = await response.json();
            closeEditModal();
            await loadExpenses();
            showNotification(result.message || 'Dépense modifiée avec succès', 'success');
        } catch (error) {
            console.error('Erreur modification dépense:', error);
            showNotification(error.message, 'error');
        }
    });
    
    // Fermer le modal en cliquant à l'extérieur
    window.addEventListener('click', function(e) {
        const modal = document.getElementById('edit-expense-modal');
        if (e.target === modal) {
            closeEditModal();
        }
    });
}

// Fonction pour afficher les détails des dépenses d'un compte
async function showAccountExpenseDetails(accountName, totalAmount, remainingAmount, totalCredited, extendedData = {}) {
    try {
        // Récupérer la date de snapshot et calculer les dates pour la modal
        const snapshotDate = document.getElementById('snapshot-date')?.value;
        
        let startDate, endDate;
        
        if (snapshotDate) {
            // Date fin = date de snapshot choisie
            endDate = snapshotDate;
            
            // Date début = 1er du mois de la date de snapshot
            // CORRECTION TIMEZONE: Utiliser des chaînes de dates fixes au lieu de new Date()
            const year = snapshotDate.substring(0, 4);
            const month = snapshotDate.substring(5, 7);
            startDate = `${year}-${month}-01`;
        } else {
            // Fallback sur les dates du dashboard si pas de date de snapshot
            startDate = document.getElementById('dashboard-start-date').value || '2025-01-01';
            endDate = document.getElementById('dashboard-end-date').value || '2025-12-31';
        }
        
        // Appel API pour récupérer les détails
        const response = await fetch(`/api/accounts/${encodeURIComponent(accountName)}/expenses?start_date=${startDate}&end_date=${endDate}`);
        
        if (!response.ok) {
            throw new Error('Erreur lors de la récupération des détails');
        }
        
        const data = await response.json();
        
        // Fusionner les données étendues avec les données reçues de l'API
        const enrichedData = {
            ...data,
            ...extendedData
        };
        
        displayExpenseDetailsModal(enrichedData, totalAmount, remainingAmount, totalCredited, { startDate, endDate });
        
    } catch (error) {
        console.error('Erreur récupération détails dépenses:', error);
        showNotification('Erreur lors de la récupération des détails des dépenses', 'error');
    }
}

// Fonction pour afficher le modal avec les détails des dépenses
function displayExpenseDetailsModal(data, totalAmount, remainingAmount, totalCredited, dateOptions = {}) {
    // Créer le modal s'il n'existe pas
    let modal = document.getElementById('expense-details-modal');
    if (!modal) {
        modal = createExpenseDetailsModal();
        document.body.appendChild(modal);
    }
    
    // Pré-remplir les champs de date si fournis
    if (dateOptions.startDate && dateOptions.endDate) {
        const modalStartDate = modal.querySelector('#modal-start-date');
        const modalEndDate = modal.querySelector('#modal-end-date');
        
        if (modalStartDate) modalStartDate.value = dateOptions.startDate;
        if (modalEndDate) modalEndDate.value = dateOptions.endDate;
    }
    // Populer le contenu du modal
    const modalContent = modal.querySelector('.expense-details-content');
    // En-tête du modal
    modalContent.querySelector('.modal-header h3').textContent = `Détails - ${data.account_name}`;
    modalContent.querySelector('.period-info').textContent = `Période: ${formatDate(data.period.start_date)} - ${formatDate(data.period.end_date)}`;
    // Ajoute les montants dans le header
    let extraAmounts = `<span style='margin-right:20px;'><strong>Total Dépensé:</strong> ${formatCurrency(totalAmount)}</span>`;
    if (typeof remainingAmount !== 'undefined' && typeof totalCredited !== 'undefined') {
        extraAmounts += `<span style='margin-right:20px;'><strong>Montant Restant:</strong> ${formatCurrency(remainingAmount)}</span>`;
        extraAmounts += `<span style='margin-right:20px;'><strong>Total Crédité:</strong> ${formatCurrency(totalCredited)}</span>`;
    }
    
    // Ajouter le crédit du mois et la balance du mois si disponibles
    if (typeof data.monthly_credits !== 'undefined') {
        const monthlyCredits = parseInt(data.monthly_credits) || 0;
        extraAmounts += `<span style='margin-right:20px;'><strong>Crédit du mois:</strong> <span style='color: ${monthlyCredits > 0 ? 'green' : 'gray'}; font-weight: bold;'>${formatCurrency(monthlyCredits)}</span></span>`;
    }
    
    if (typeof data.monthly_balance !== 'undefined') {
        const monthlyBalance = parseInt(data.monthly_balance) || 0;
        extraAmounts += `<span style='margin-right:20px;'><strong>Balance du mois brut</strong> <span style='color: ${monthlyBalance >= 0 ? 'green' : 'red'}; font-weight: bold;'>${formatCurrency(monthlyBalance)}</span></span>`;
    }
    
    if (typeof data.montant_debut_mois !== 'undefined' && data.account_type === 'classique') {
        const montantDebutMois = parseInt(data.montant_debut_mois) || 0;
        extraAmounts += `<span style='margin-right:20px;'><strong>Montant début de mois:</strong> <span style='color: ${montantDebutMois >= 0 ? 'green' : 'red'}; font-weight: bold;'>${formatCurrency(montantDebutMois)}</span></span>`;
    }
    modalContent.querySelector('.total-amount').innerHTML = extraAmounts;
    // Stocker les montants pour le tableau
    window.modalRemainingAmount = remainingAmount;
    window.modalTotalCredited = totalCredited;
    // Stocker les données financières de la modal
    console.log('🔍 CLIENT: Données reçues pour la modal:', data);
    console.log('🔍 CLIENT: monthly_credits:', data.monthly_credits);
    console.log('🔍 CLIENT: monthly_balance:', data.monthly_balance);
    
    window.modalAccountData = {
        monthly_credits: data.monthly_credits,
        monthly_balance: data.monthly_balance,
        net_transfers: data.net_transfers,
        montant_debut_mois: data.montant_debut_mois,
        account_type: data.account_type
    };
    
    console.log('🔍 CLIENT: modalAccountData stocké:', window.modalAccountData);
    // Stocker les dépenses pour le filtrage et tri
    window.modalExpenses = data.expenses || [];
    window.modalCurrentSortField = 'expense_date';
    window.modalCurrentSortDirection = 'desc';
    // Populer les options de filtres
    populateModalFilterOptions(window.modalExpenses);
    // Afficher les dépenses avec tri par défaut
    applyModalFiltersAndDisplay();
    // Afficher l'évolution jour par jour et mettre à jour la balance dans l'en-tête
    const finalBalance = displayDailyEvolution(data.daily_evolution || []);
    
    // Mettre à jour la balance du mois dans l'en-tête avec la balance cumulative finale
    if (finalBalance !== null) {
        const totalAmountElement = modalContent.querySelector('.total-amount');
        let currentHTML = totalAmountElement.innerHTML;
        
        // Remplacer la balance du mois existante par la balance cumulative finale
        const balanceRegex = /<span style='margin-right:20px;'><strong>Balance du mois: brut<\/strong>.*?<\/span><\/span>/;
        const newBalanceHTML = `<span style='margin-right:20px;'><strong>Balance du mois net</strong> <span style='color: ${finalBalance >= 0 ? 'green' : 'red'}; font-weight: bold;'>${formatCurrency(finalBalance)}</span></span>`;
        
        if (balanceRegex.test(currentHTML)) {
            currentHTML = currentHTML.replace(balanceRegex, newBalanceHTML);
        } else {
            currentHTML += newBalanceHTML;
        }
        
        totalAmountElement.innerHTML = currentHTML;
    }
    
    // Afficher le modal
    modal.style.display = 'block';
}
// Fonction pour afficher l'évolution jour par jour
function displayDailyEvolution(dailyData) {
    const tbody = document.getElementById('modal-daily-evolution-tbody');
    if (!tbody) return null;
    
    tbody.innerHTML = '';
    
    if (!dailyData || dailyData.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; padding: 20px; color: #6c757d;">
                    Aucune donnée disponible pour cette période
                </td>
            </tr>
        `;
        return null;
    }
    
    let cumulativeBalance = 0;
    
    dailyData.forEach(day => {
        const date = new Date(day.date);
        const dailyCredits = parseInt(day.daily_credits) || 0;
        const dailySpent = parseInt(day.daily_spent) || 0;
        const dailyTransfers = parseInt(day.daily_transfers) || 0;
        const dailyBalance = dailyCredits - dailySpent + dailyTransfers;
        
        cumulativeBalance += dailyBalance;
        
        const row = document.createElement('tr');
        
        // Couleurs conditionnelles
        const creditColor = dailyCredits > 0 ? 'color: green; font-weight: bold;' : 'color: gray;';
        const spentColor = dailySpent > 0 ? 'color: red; font-weight: bold;' : 'color: gray;';
        const transferColor = dailyTransfers > 0 ? 'color: blue; font-weight: bold;' : 
                            dailyTransfers < 0 ? 'color: orange; font-weight: bold;' : 'color: gray;';
        const balanceColor = dailyBalance > 0 ? 'color: green; font-weight: bold;' : 
                           dailyBalance < 0 ? 'color: red; font-weight: bold;' : 'color: gray;';
        const cumulativeColor = cumulativeBalance > 0 ? 'color: green; font-weight: bold;' : 
                              cumulativeBalance < 0 ? 'color: red; font-weight: bold;' : 'color: gray;';
        
        row.innerHTML = `
            <td style="padding: 8px; text-align: center; border-bottom: 1px solid #dee2e6;">
                ${date.toLocaleDateString('fr-FR')}
            </td>
            <td style="padding: 8px; text-align: right; border-bottom: 1px solid #dee2e6; ${creditColor}">
                ${formatCurrency(dailyCredits)}
            </td>
            <td style="padding: 8px; text-align: right; border-bottom: 1px solid #dee2e6; ${spentColor}">
                ${formatCurrency(dailySpent)}
            </td>
            <td style="padding: 8px; text-align: right; border-bottom: 1px solid #dee2e6; ${transferColor}">
                ${formatCurrency(dailyTransfers)}
            </td>
            <td style="padding: 8px; text-align: right; border-bottom: 1px solid #dee2e6; ${balanceColor}">
                ${formatCurrency(dailyBalance)}
            </td>
            <td style="padding: 8px; text-align: right; border-bottom: 1px solid #dee2e6; ${cumulativeColor}">
                ${formatCurrency(cumulativeBalance)}
            </td>
        `;
        
        tbody.appendChild(row);
    });
    
    // Ajouter une ligne de total
    const totalCredits = dailyData.reduce((sum, day) => sum + (parseInt(day.daily_credits) || 0), 0);
    const totalSpent = dailyData.reduce((sum, day) => sum + (parseInt(day.daily_spent) || 0), 0);
    const totalTransfers = dailyData.reduce((sum, day) => sum + (parseInt(day.daily_transfers) || 0), 0);
    const totalBalance = totalCredits - totalSpent + totalTransfers;
    
    const totalRow = document.createElement('tr');
    totalRow.style.backgroundColor = '#f8f9fa';
    totalRow.style.fontWeight = 'bold';
    totalRow.innerHTML = `
        <td style="padding: 10px; text-align: center; border-top: 2px solid #dee2e6;">
            <strong>TOTAL</strong>
        </td>
        <td style="padding: 10px; text-align: right; border-top: 2px solid #dee2e6; color: green;">
            ${formatCurrency(totalCredits)}
        </td>
        <td style="padding: 10px; text-align: right; border-top: 2px solid #dee2e6; color: red;">
            ${formatCurrency(totalSpent)}
        </td>
        <td style="padding: 10px; text-align: right; border-top: 2px solid #dee2e6; color: ${totalTransfers >= 0 ? 'blue' : 'orange'};">
            ${formatCurrency(totalTransfers)}
        </td>
        <td style="padding: 10px; text-align: right; border-top: 2px solid #dee2e6; color: ${totalBalance >= 0 ? 'green' : 'red'};">
            ${formatCurrency(totalBalance)}
        </td>
        <td style="padding: 10px; text-align: right; border-top: 2px solid #dee2e6; color: ${cumulativeBalance >= 0 ? 'green' : 'red'};">
            ${formatCurrency(cumulativeBalance)}
        </td>
    `;
    
    tbody.appendChild(totalRow);
    
    // Retourner la balance cumulative finale
    return cumulativeBalance;
}

// Fonction pour créer le modal des détails des dépenses
function createExpenseDetailsModal() {
    const modal = document.createElement('div');
    modal.id = 'expense-details-modal';
    modal.className = 'modal';
    modal.style.cssText = `
        display: none;
        position: fixed;
        z-index: 1000;
        left: 0;
        top: 0;
        width: 100%;
        height: 100%;
        overflow: auto;
        background-color: rgba(0,0,0,0.5);
    `;
    
    modal.innerHTML = `
        <div class="expense-details-content" style="
            background-color: #fefefe;
            margin: 1% auto;
            padding: 0;
            border: none;
            border-radius: 8px;
            width: 95%;
            max-width: 1400px;
            max-height: 95vh;
            overflow: hidden;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        ">
            <div class="modal-header" style="
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 20px;
                border-radius: 8px 8px 0 0;
                position: relative;
            ">
                <span class="close" style="
                    color: white;
                    float: right;
                    font-size: 28px;
                    font-weight: bold;
                    cursor: pointer;
                    line-height: 1;
                ">&times;</span>
                <h3 style="margin: 0; font-size: 1.5rem;">Détails des dépenses</h3>
                <p class="period-info" style="margin: 5px 0 0 0; opacity: 0.9; font-size: 0.9rem;"></p>
                <p class="total-amount" style="margin: 5px 0 0 0; font-size: 1.1rem; font-weight: bold;"></p>
            </div>
            <div class="modal-body" style="
                padding: 20px;
                max-height: calc(95vh - 150px);
                overflow-y: auto;
            ">
                <!-- Filtres -->
                <div class="modal-filters-section" style="
                    background: #f8f9fa;
                    border: 1px solid #dee2e6;
                    border-radius: 8px;
                    padding: 20px;
                    margin-bottom: 20px;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                ">
                    <h4 style="margin: 0 0 15px 0; color: #495057; font-size: 1.1rem;">
                        <i class="fas fa-filter" style="margin-right: 8px;"></i>Filtres
                    </h4>
                    
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
                        <!-- Filtres de date -->
                        <div>
                            <label style="display: block; margin-bottom: 5px; font-weight: 500; color: #495057;">Date début:</label>
                            <input type="date" id="modal-start-date" style="width: 100%; padding: 8px; border: 1px solid #ced4da; border-radius: 4px;">
                        </div>
                        <div>
                            <label style="display: block; margin-bottom: 5px; font-weight: 500; color: #495057;">Date fin:</label>
                            <input type="date" id="modal-end-date" style="width: 100%; padding: 8px; border: 1px solid #ced4da; border-radius: 4px;">
                        </div>
                        
                        <!-- Filtre catégorie -->
                        <div>
                            <label style="display: block; margin-bottom: 5px; font-weight: 500; color: #495057;">Catégorie:</label>
                            <select id="modal-category-filter" style="width: 100%; padding: 8px; border: 1px solid #ced4da; border-radius: 4px;">
                                <option value="">Toutes les catégories</option>
                            </select>
                        </div>
                        
                        <!-- Filtre fournisseur -->
                        <div>
                            <label style="display: block; margin-bottom: 5px; font-weight: 500; color: #495057;">Fournisseur:</label>
                            <input type="text" id="modal-supplier-filter" placeholder="Rechercher un fournisseur..." 
                                   style="width: 100%; padding: 8px; border: 1px solid #ced4da; border-radius: 4px;">
                        </div>
                        
                        <!-- Filtre prévisible -->
                        <div>
                            <label style="display: block; margin-bottom: 5px; font-weight: 500; color: #495057;">Prévisible:</label>
                            <select id="modal-predictable-filter" style="width: 100%; padding: 8px; border: 1px solid #ced4da; border-radius: 4px;">
                                <option value="">Tous</option>
                                <option value="oui">Oui</option>
                                <option value="non">Non</option>
                            </select>
                        </div>
                        
                        <!-- Filtre utilisateur -->
                        <div>
                            <label style="display: block; margin-bottom: 5px; font-weight: 500; color: #495057;">Utilisateur:</label>
                            <select id="modal-user-filter" style="width: 100%; padding: 8px; border: 1px solid #ced4da; border-radius: 4px;">
                                <option value="">Tous les utilisateurs</option>
                            </select>
                        </div>
                    </div>
                    
                    <!-- Filtres de montant -->
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-top: 15px;">
                        <div>
                            <label style="display: block; margin-bottom: 5px; font-weight: 500; color: #495057;">Montant min (FCFA):</label>
                            <input type="number" id="modal-min-amount" placeholder="0" min="0" 
                                   style="width: 100%; padding: 8px; border: 1px solid #ced4da; border-radius: 4px;">
                        </div>
                        <div>
                            <label style="display: block; margin-bottom: 5px; font-weight: 500; color: #495057;">Montant max (FCFA):</label>
                            <input type="number" id="modal-max-amount" placeholder="Illimité" min="0" 
                                   style="width: 100%; padding: 8px; border: 1px solid #ced4da; border-radius: 4px;">
                        </div>
                    </div>
                    
                    <!-- Boutons d'action -->
                    <div style="margin-top: 15px; display: flex; gap: 10px; flex-wrap: wrap;">
                        <button id="modal-clear-filters" style="
                            background-color: #6c757d;
                            color: white;
                            border: none;
                            padding: 8px 16px;
                            border-radius: 4px;
                            cursor: pointer;
                            font-size: 0.9rem;
                        ">
                            <i class="fas fa-times" style="margin-right: 5px;"></i>Effacer les filtres
                        </button>
                        <button id="modal-export-csv" style="
                            background-color: #28a745;
                            color: white;
                            border: none;
                            padding: 8px 16px;
                            border-radius: 4px;
                            cursor: pointer;
                            font-size: 0.9rem;
                        ">
                            <i class="fas fa-download" style="margin-right: 5px;"></i>Exporter CSV
                        </button>
                    </div>
                </div>
                
                <!-- Compteur de résultats -->
                <div id="modal-filtered-count" style="
                    margin-bottom: 15px;
                    padding: 10px;
                    background-color: #e9ecef;
                    border-radius: 4px;
                    font-weight: 500;
                    color: #495057;
                "></div>
                
                <!-- Tableau des dépenses -->
                <div class="table-responsive">
                    <table class="table table-striped" id="modal-expenses-table" style="
                        width: 100%;
                        border-collapse: collapse;
                        background-color: white;
                        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                        border-radius: 8px;
                        overflow: hidden;
                    ">
                        <thead style="background-color: #f8f9fa; border-bottom: 2px solid #dee2e6;">
                            <tr>
                                <th class="sortable" data-field="expense_date" style="padding: 12px; text-align: left; cursor: pointer; user-select: none; position: relative;">
                                    Date Dépense <i class="fas fa-sort sort-icon" style="margin-left: 5px; opacity: 0.5;"></i>
                                </th>
                                <th class="sortable" data-field="created_at" style="padding: 12px; text-align: left; cursor: pointer; user-select: none; position: relative;">
                                    Timestamp <i class="fas fa-sort sort-icon" style="margin-left: 5px; opacity: 0.5;"></i>
                                </th>
                                <th class="sortable" data-field="designation" style="padding: 12px; text-align: left; cursor: pointer; user-select: none; position: relative;">
                                    Désignation <i class="fas fa-sort sort-icon" style="margin-left: 5px; opacity: 0.5;"></i>
                                </th>
                                <th class="sortable" data-field="category" style="padding: 12px; text-align: left; cursor: pointer; user-select: none; position: relative;">
                                    Catégorie <i class="fas fa-sort sort-icon" style="margin-left: 5px; opacity: 0.5;"></i>
                                </th>
                                <th class="sortable" data-field="supplier" style="padding: 12px; text-align: left; cursor: pointer; user-select: none; position: relative;">
                                    Fournisseur <i class="fas fa-sort sort-icon" style="margin-left: 5px; opacity: 0.5;"></i>
                                </th>
                                <th class="sortable" data-field="quantity" style="padding: 12px; text-align: center; cursor: pointer; user-select: none; position: relative;">
                                    Quantité <i class="fas fa-sort sort-icon" style="margin-left: 5px; opacity: 0.5;"></i>
                                </th>
                                <th class="sortable" data-field="unit_price" style="padding: 12px; text-align: right; cursor: pointer; user-select: none; position: relative;">
                                    Prix unitaire <i class="fas fa-sort sort-icon" style="margin-left: 5px; opacity: 0.5;"></i>
                                </th>
                                <th class="sortable" data-field="total" style="padding: 12px; text-align: right; cursor: pointer; user-select: none; position: relative;">
                                    Total Dépensé <i class="fas fa-sort sort-icon" style="margin-left: 5px; opacity: 0.5;"></i>
                                </th>
                                <th class="sortable" data-field="predictable" style="padding: 12px; text-align: center; cursor: pointer; user-select: none; position: relative;">
                                    Prévisible <i class="fas fa-sort sort-icon" style="margin-left: 5px; opacity: 0.5;"></i>
                                </th>
                                <th class="sortable" data-field="username" style="padding: 12px; text-align: left; cursor: pointer; user-select: none; position: relative;">
                                    Utilisateur <i class="fas fa-sort sort-icon" style="margin-left: 5px; opacity: 0.5;"></i>
                                </th>
                                <th style="padding: 12px; text-align: left;">Description</th>
                            </tr>
                        </thead>
                        <tbody id="modal-expenses-tbody">
                        </tbody>
                    </table>
                </div>
                
                <!-- Nouveau tableau d'évolution jour par jour -->
                <div class="daily-evolution-section" style="margin-top: 30px;">
                    <h4 style="margin-bottom: 15px; color: #495057; font-size: 1.1rem;">
                        <i class="fas fa-chart-line" style="margin-right: 8px;"></i>Évolution Jour par Jour - Crédits et Balance
                    </h4>
                    
                    <div class="table-responsive">
                        <table class="table table-striped" id="modal-daily-evolution-table" style="
                            width: 100%;
                            border-collapse: collapse;
                            background-color: white;
                            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                            border-radius: 8px;
                            overflow: hidden;
                            font-size: 0.9rem;
                        ">
                            <thead style="background-color: #f1f3f4; border-bottom: 2px solid #dee2e6;">
                                <tr>
                                    <th style="padding: 10px; text-align: center; font-weight: 600;">Date</th>
                                    <th style="padding: 10px; text-align: right; font-weight: 600;">Crédits du Jour</th>
                                    <th style="padding: 10px; text-align: right; font-weight: 600;">Dépenses du Jour</th>
                                    <th style="padding: 10px; text-align: right; font-weight: 600;">Transferts du Jour</th>
                                    <th style="padding: 10px; text-align: right; font-weight: 600;">Balance du Jour</th>
                                    <th style="padding: 10px; text-align: right; font-weight: 600;">Balance Cumulative</th>
                                </tr>
                            </thead>
                            <tbody id="modal-daily-evolution-tbody">
                                <!-- Les données seront générées par JavaScript -->
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Event listener pour fermer le modal
    const closeBtn = modal.querySelector('.close');
    closeBtn.onclick = () => modal.style.display = 'none';
    
    // Fermer en cliquant à l'extérieur
    modal.onclick = (event) => {
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    };
    
    // Ajouter les event listeners pour les filtres et le tri
    setupModalEventListeners(modal);
    
    return modal;
}

// Fonctions pour le modal des détails de dépenses

// Fonction pour configurer les event listeners du modal
function setupModalEventListeners(modal) {
    // Event listeners pour les filtres
    const startDate = modal.querySelector('#modal-start-date');
    const endDate = modal.querySelector('#modal-end-date');
    const categoryFilter = modal.querySelector('#modal-category-filter');
    const supplierFilter = modal.querySelector('#modal-supplier-filter');
    const predictableFilter = modal.querySelector('#modal-predictable-filter');
    const userFilter = modal.querySelector('#modal-user-filter');
    const minAmount = modal.querySelector('#modal-min-amount');
    const maxAmount = modal.querySelector('#modal-max-amount');
    const clearFilters = modal.querySelector('#modal-clear-filters');
    const exportCSV = modal.querySelector('#modal-export-csv');
    
    // Event listeners pour filtrage en temps réel
    [startDate, endDate, categoryFilter, supplierFilter, predictableFilter, userFilter, minAmount, maxAmount].forEach(element => {
        if (element) {
            element.addEventListener('input', applyModalFiltersAndDisplay);
            element.addEventListener('change', applyModalFiltersAndDisplay);
        }
    });
    
    // Event listener pour effacer les filtres
    if (clearFilters) {
        clearFilters.addEventListener('click', clearModalFilters);
    }
    
    // Event listener pour export CSV
    if (exportCSV) {
        exportCSV.addEventListener('click', exportModalExpensesToCSV);
    }
    
    // Event listeners pour le tri des colonnes
    const sortableHeaders = modal.querySelectorAll('.sortable');
    sortableHeaders.forEach(header => {
        header.addEventListener('click', () => {
            const field = header.getAttribute('data-field');
            handleModalColumnSort(field);
        });
    });
}

// Fonction pour populer les options de filtres du modal
function populateModalFilterOptions(expenses) {
    const modal = document.getElementById('expense-details-modal');
    if (!modal) return;
    
    // Populer les catégories
    const categories = [...new Set(expenses.map(e => e.category).filter(Boolean))].sort();
    const categorySelect = modal.querySelector('#modal-category-filter');
    if (categorySelect) {
        categorySelect.innerHTML = '<option value="">Toutes les catégories</option>';
        categories.forEach(category => {
            categorySelect.innerHTML += `<option value="${category}">${category}</option>`;
        });
    }
    
    // Populer les utilisateurs
    const users = [...new Set(expenses.map(e => e.username).filter(Boolean))].sort();
    const userSelect = modal.querySelector('#modal-user-filter');
    if (userSelect) {
        userSelect.innerHTML = '<option value="">Tous les utilisateurs</option>';
        users.forEach(user => {
            userSelect.innerHTML += `<option value="${user}">${user}</option>`;
        });
    }
}

// Fonction pour appliquer les filtres et afficher les résultats du modal
function applyModalFiltersAndDisplay() {
    if (!window.modalExpenses) return;
    
    const modal = document.getElementById('expense-details-modal');
    if (!modal) return;
    
    let filteredExpenses = [...window.modalExpenses];
    
    // Filtres de date
    const startDate = modal.querySelector('#modal-start-date')?.value;
    const endDate = modal.querySelector('#modal-end-date')?.value;
    
    if (startDate) {
        filteredExpenses = filteredExpenses.filter(expense => 
            new Date(expense.expense_date) >= new Date(startDate)
        );
    }
    
    if (endDate) {
        filteredExpenses = filteredExpenses.filter(expense => 
            new Date(expense.expense_date) <= new Date(endDate)
        );
    }
    
    // Filtre catégorie
    const categoryFilter = modal.querySelector('#modal-category-filter')?.value;
    if (categoryFilter) {
        filteredExpenses = filteredExpenses.filter(expense => 
            expense.category && expense.category.toLowerCase().includes(categoryFilter.toLowerCase())
        );
    }
    
    // Filtre fournisseur
    const supplierFilter = modal.querySelector('#modal-supplier-filter')?.value;
    if (supplierFilter) {
        filteredExpenses = filteredExpenses.filter(expense => 
            expense.supplier && expense.supplier.toLowerCase().includes(supplierFilter.toLowerCase())
        );
    }
    
    // Filtre prévisible
    const predictableFilter = modal.querySelector('#modal-predictable-filter')?.value;
    if (predictableFilter) {
        filteredExpenses = filteredExpenses.filter(expense => 
            expense.predictable === predictableFilter
        );
    }
    
    // Filtre utilisateur
    const userFilter = modal.querySelector('#modal-user-filter')?.value;
    if (userFilter) {
        filteredExpenses = filteredExpenses.filter(expense => 
            expense.username === userFilter
        );
    }
    
    // Filtres de montant
    const minAmount = parseFloat(modal.querySelector('#modal-min-amount')?.value) || 0;
    const maxAmount = parseFloat(modal.querySelector('#modal-max-amount')?.value) || Infinity;
    
    filteredExpenses = filteredExpenses.filter(expense => {
        const total = parseFloat(expense.total) || 0;
        return total >= minAmount && total <= maxAmount;
    });
    
    // Appliquer le tri
    const sortedExpenses = sortModalExpenses(filteredExpenses);
    
    // Afficher les résultats
    displayModalExpenses(sortedExpenses);
    // Stocker les dépenses filtrées pour le calcul du total
    window.modalFilteredExpenses = sortedExpenses;
    updateModalFilteredCount(sortedExpenses.length, window.modalExpenses.length);
}

// Fonction pour trier les dépenses du modal
function sortModalExpenses(expenses) {
    if (!window.modalCurrentSortField) return expenses;
    
    return [...expenses].sort((a, b) => {
        let aValue = a[window.modalCurrentSortField];
        let bValue = b[window.modalCurrentSortField];
        
        // Gestion des valeurs nulles/undefined
        if (aValue == null) aValue = '';
        if (bValue == null) bValue = '';
        
        // Tri spécial pour les dates
        if (window.modalCurrentSortField === 'expense_date') {
            aValue = new Date(aValue);
            bValue = new Date(bValue);
        }
        
        // Tri spécial pour les nombres
        if (['total', 'unit_price', 'quantity'].includes(window.modalCurrentSortField)) {
            aValue = parseFloat(aValue) || 0;
            bValue = parseFloat(bValue) || 0;
        }
        
        // Tri spécial pour les chaînes
        if (typeof aValue === 'string' && typeof bValue === 'string') {
            aValue = aValue.toLowerCase();
            bValue = bValue.toLowerCase();
        }
        
        let comparison = 0;
        if (aValue < bValue) comparison = -1;
        if (aValue > bValue) comparison = 1;
        
        return window.modalCurrentSortDirection === 'desc' ? -comparison : comparison;
    });
}

// Fonction pour gérer le tri des colonnes du modal
function handleModalColumnSort(field) {
    if (window.modalCurrentSortField === field) {
        // Inverser la direction si on clique sur la même colonne
        window.modalCurrentSortDirection = window.modalCurrentSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        // Nouvelle colonne, commencer par ordre décroissant pour les dates, croissant pour le reste
        window.modalCurrentSortField = field;
        window.modalCurrentSortDirection = field === 'expense_date' ? 'desc' : 'asc';
    }
    
    updateModalSortIcons();
    applyModalFiltersAndDisplay();
}

// Fonction pour mettre à jour les icônes de tri du modal
function updateModalSortIcons() {
    const modal = document.getElementById('expense-details-modal');
    if (!modal) return;
    
    // Réinitialiser toutes les icônes
    const allIcons = modal.querySelectorAll('.sort-icon');
    allIcons.forEach(icon => {
        icon.className = 'fas fa-sort sort-icon';
        icon.style.opacity = '0.5';
    });
    
    // Mettre à jour l'icône de la colonne active
    const activeHeader = modal.querySelector(`[data-field="${window.modalCurrentSortField}"]`);
    if (activeHeader) {
        const icon = activeHeader.querySelector('.sort-icon');
        if (icon) {
            icon.className = `fas fa-sort-${window.modalCurrentSortDirection === 'asc' ? 'up' : 'down'} sort-icon`;
            icon.style.opacity = '1';
        }
    }
}

// Fonction pour afficher les dépenses dans le tableau du modal
function displayModalExpenses(expenses) {
    const modal = document.getElementById('expense-details-modal');
    if (!modal) return;
    
    const tbody = modal.querySelector('#modal-expenses-tbody');
    if (!tbody) return;
    
    if (expenses.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="14" style="text-align: center; padding: 20px; color: #666;">
                    Aucune dépense trouvée avec les filtres appliqués.
                </td>
            </tr>
        `;
        return;
    }
    // Rendu des lignes du tableau
    tbody.innerHTML = expenses.map(expense => {
        const isDGExpense = currentUser.role === 'directeur' && expense.username !== currentUser.username;
        const rowStyle = isDGExpense ? 'font-style: italic; opacity: 0.8;' : '';
        
        // Formater les dates
        const expenseDate = formatDate(expense.expense_date);
        
        const timestamp = new Date(expense.timestamp_creation);
        const timestampDate = timestamp.toLocaleDateString('fr-FR');
        const timestampTime = timestamp.toLocaleTimeString('fr-FR', { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
        
        return `
            <tr style="${rowStyle}">
                <td style="padding: 12px;">${expenseDate}</td>
                <td style="padding: 12px;">${timestampDate}<br><small style="color: #999;">${timestampTime}</small></td>
                <td style="padding: 12px;">
                        ${expense.designation || 'Sans désignation'}
                        ${isDGExpense ? '<span style=\"color: #007bff; font-size: 0.8rem; margin-left: 8px;\">(DG)</span>' : ''}
                </td>
                <td style="padding: 12px;">${expense.category || 'N/A'}</td>
                <td style="padding: 12px;">${expense.supplier || 'N/A'}</td>
                <td style="padding: 12px; text-align: center;">${expense.quantity || 'N/A'}</td>
                <td style="padding: 12px; text-align: right;">${expense.unit_price ? formatCurrency(expense.unit_price) : 'N/A'}</td>
                <td style="padding: 12px; text-align: right; font-weight: bold; color: #e74c3c;">${formatCurrency(expense.total)}</td>
                <td style="padding: 12px; text-align: center;">
                    <span class="badge ${expense.predictable === 'oui' ? 'badge-success' : 'badge-warning'}" 
                          style="padding: 4px 8px; border-radius: 4px; font-size: 0.8rem; 
                                 background-color: ${expense.predictable === 'oui' ? '#28a745' : '#ffc107'}; 
                                 color: ${expense.predictable === 'oui' ? 'white' : 'black'};">
                        ${expense.predictable === 'oui' ? 'Oui' : 'Non'}
                    </span>
                </td>
                <td style="padding: 12px;">${expense.username}</td>
                <td style="padding: 12px; max-width: 200px;">
                    <span title="${expense.comment || 'Aucune description'}" style="
                        display: block;
                        white-space: nowrap;
                        overflow: hidden;
                        text-overflow: ellipsis;
                    ">
                        ${expense.comment || 'Aucune description'}
                    </span>
                </td>
            </tr>
        `;
    }).join('');
}

// Fonction pour effacer tous les filtres du modal
function clearModalFilters() {
    const modal = document.getElementById('expense-details-modal');
    if (!modal) return;
    
    // Effacer tous les champs de filtre
    modal.querySelector('#modal-start-date').value = '';
    modal.querySelector('#modal-end-date').value = '';
    modal.querySelector('#modal-category-filter').value = '';
    modal.querySelector('#modal-supplier-filter').value = '';
    modal.querySelector('#modal-predictable-filter').value = '';
    modal.querySelector('#modal-user-filter').value = '';
    modal.querySelector('#modal-min-amount').value = '';
    modal.querySelector('#modal-max-amount').value = '';
    
    // Réappliquer les filtres (maintenant vides)
    applyModalFiltersAndDisplay();
    
    showNotification('Filtres effacés', 'success');
}

// Fonction pour exporter les dépenses filtrées du modal en CSV
function exportModalExpensesToCSV() {
    if (!window.modalExpenses) return;
    
    const modal = document.getElementById('expense-details-modal');
    if (!modal) return;
    
    // Récupérer les dépenses filtrées et triées
    let filteredExpenses = [...window.modalExpenses];
    
    // Appliquer les mêmes filtres que dans applyModalFiltersAndDisplay
    const startDate = modal.querySelector('#modal-start-date')?.value;
    const endDate = modal.querySelector('#modal-end-date')?.value;
    const categoryFilter = modal.querySelector('#modal-category-filter')?.value;
    const supplierFilter = modal.querySelector('#modal-supplier-filter')?.value;
    const predictableFilter = modal.querySelector('#modal-predictable-filter')?.value;
    const userFilter = modal.querySelector('#modal-user-filter')?.value;
    const minAmount = parseFloat(modal.querySelector('#modal-min-amount')?.value) || 0;
    const maxAmount = parseFloat(modal.querySelector('#modal-max-amount')?.value) || Infinity;
    
    if (startDate) {
        filteredExpenses = filteredExpenses.filter(expense => 
            new Date(expense.expense_date) >= new Date(startDate)
        );
    }
    
    if (endDate) {
        filteredExpenses = filteredExpenses.filter(expense => 
            new Date(expense.expense_date) <= new Date(endDate)
        );
    }
    
    if (categoryFilter) {
        filteredExpenses = filteredExpenses.filter(expense => 
            expense.category && expense.category.toLowerCase().includes(categoryFilter.toLowerCase())
        );
    }
    
    if (supplierFilter) {
        filteredExpenses = filteredExpenses.filter(expense => 
            expense.supplier && expense.supplier.toLowerCase().includes(supplierFilter.toLowerCase())
        );
    }
    
    if (predictableFilter) {
        filteredExpenses = filteredExpenses.filter(expense => 
            expense.predictable === predictableFilter
        );
    }
    
    if (userFilter) {
        filteredExpenses = filteredExpenses.filter(expense => 
            expense.username === userFilter
        );
    }
    
    filteredExpenses = filteredExpenses.filter(expense => {
        const total = parseFloat(expense.total) || 0;
        return total >= minAmount && total <= maxAmount;
    });
    
    // Appliquer le tri
    const sortedExpenses = sortModalExpenses(filteredExpenses);
    
    if (sortedExpenses.length === 0) {
        showNotification('Aucune dépense à exporter', 'warning');
        return;
    }
    
    // Créer le contenu CSV
    const headers = [
        'Date',
        'Désignation',
        'Catégorie',
        'Sous-catégorie',
        'Fournisseur',
        'Quantité',
        'Prix unitaire (FCFA)',
        'Total (FCFA)',
        'Prévisible',
        'Utilisateur',
        'Description'
    ];
    
    const csvContent = [
        headers.join(','),
        ...sortedExpenses.map(expense => [
            formatDate(expense.expense_date),
            `"${(expense.designation || '').replace(/"/g, '""')}"`,
            `"${(expense.category || '').replace(/"/g, '""')}"`,
            `"${(expense.subcategory || '').replace(/"/g, '""')}"`,
            `"${(expense.supplier || '').replace(/"/g, '""')}"`,
            expense.quantity || '',
            expense.unit_price || '',
            expense.total || '',
            expense.predictable === 'oui' ? 'Oui' : 'Non',
            `"${(expense.username || '').replace(/"/g, '""')}"`,
            `"${(expense.comment || '').replace(/"/g, '""')}"`
        ].join(','))
    ].join('\n');
    
    // Télécharger le fichier
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `depenses_compte_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showNotification(`Export CSV réussi (${sortedExpenses.length} dépenses)`, 'success');
}
// Fonction pour mettre à jour le compteur de résultats filtrés du modal
function updateModalFilteredCount(filtered, total) {
    const modal = document.getElementById('expense-details-modal');
    if (!modal) return;
    
    const countElement = modal.querySelector('#modal-filtered-count');
    console.log('🔍 CLIENT updateModalFilteredCount: countElement trouvé:', countElement);
    if (countElement) {
        // Calculer le total des dépenses filtrées
    const filteredExpenses = window.modalFilteredExpenses || [];
    const filteredTotal = filteredExpenses.reduce((sum, expense) => sum + (parseInt(expense.total) || 0), 0);
    
    // Récupérer les informations financières depuis les données de la modal
    const modalData = window.modalAccountData || {};
    
    // Calculer les vraies valeurs en fonction des dépenses filtrées
    const totalExpenses = window.modalExpenses || [];
    const totalExpensesAmount = totalExpenses.reduce((sum, expense) => sum + (parseInt(expense.total) || 0), 0);
    
    // Récupérer les données de base
    const monthlyCredits = parseInt(modalData.monthly_credits) || 0;
    const netTransfers = parseInt(modalData.net_transfers) || 0;
    const montantDebutMois = parseInt(modalData.montant_debut_mois) || 0;
    
    // Calculer les vraies valeurs filtrées
    // Le crédit du mois reste le même (c'est un montant fixe)
    const monthlyCreditsFiltered = monthlyCredits;
    
    // La balance du mois filtrée = crédit du mois - dépenses filtrées + transferts nets + montant début de mois
    const monthlyBalanceFiltered = monthlyCreditsFiltered - filteredTotal + netTransfers + montantDebutMois;
    
    console.log('🔍 CLIENT updateModalFilteredCount: modalData:', modalData);
    console.log('🔍 CLIENT updateModalFilteredCount: totalExpensesAmount:', totalExpensesAmount);
    console.log('🔍 CLIENT updateModalFilteredCount: monthlyCreditsFiltered:', monthlyCreditsFiltered);
    console.log('🔍 CLIENT updateModalFilteredCount: monthlyBalanceFiltered:', monthlyBalanceFiltered);
    console.log('🔍 CLIENT updateModalFilteredCount: montantDebutMois:', montantDebutMois);
    
    // Créer le texte avec les informations financières
    let countText = `Affichage de ${filtered} dépense${filtered > 1 ? 's' : ''} sur ${total} au total`;
    countText += ` - Total filtré: ${formatCurrency(filteredTotal)}`;
    
    if (modalData.monthly_credits !== undefined) {
        countText += ` | Crédit du mois: ${formatCurrency(monthlyCreditsFiltered)}`;
    }
    
    if (modalData.monthly_balance !== undefined) {
        const balanceColor = monthlyBalanceFiltered >= 0 ? 'green' : 'red';
        countText += ` | Balance du mois brut <span style="color: ${balanceColor}; font-weight: bold;">${formatCurrency(monthlyBalanceFiltered)}</span>`;
    }
    
    if (modalData.montant_debut_mois !== undefined && modalData.account_type === 'classique') {
        const debutColor = montantDebutMois >= 0 ? 'green' : 'red';
        countText += ` | Montant début de mois: <span style="color: ${debutColor}; font-weight: bold;">${formatCurrency(montantDebutMois)}</span>`;
    }
    
    // Calculer et afficher la balance du mois net (brut - montant début de mois)
    if (modalData.monthly_balance !== undefined && modalData.montant_debut_mois !== undefined && modalData.account_type === 'classique') {
        const balanceNet = monthlyBalanceFiltered - montantDebutMois;
        const balanceNetColor = balanceNet >= 0 ? 'green' : 'red';
        countText += ` | Balance du mois net <span style="color: ${balanceNetColor}; font-weight: bold;">${formatCurrency(balanceNet)}</span>`;
    }
    
    console.log('🔍 CLIENT updateModalFilteredCount: countText final:', countText);
    countElement.innerHTML = countText;
    }
}

// === FONCTIONS POUR LES COMPTES PARTENAIRES ===

// Fonction pour gérer le changement de sélection de compte dans le formulaire de dépense
function handleAccountSelectionChange() {
    const accountSelect = document.getElementById('expense-account');
    const typeSelect = document.getElementById('expense-type');
    const categorySelect = document.getElementById('expense-category');
    const subcategorySelect = document.getElementById('expense-subcategory');
    
    if (!accountSelect || !typeSelect) return;
    
    const selectedOption = accountSelect.options[accountSelect.selectedIndex];
    const accountType = selectedOption.dataset.accountType;
    const categoryType = selectedOption.dataset.categoryType;
    
    console.log('Compte sélectionné:', selectedOption.textContent, 'Type:', accountType, 'Catégorie:', categoryType);
    
    // Pour les comptes classiques avec un category_type défini
    if (accountType === 'classique' && categoryType && categoryType !== 'null') {
        console.log('Compte classique avec catégorie prédéfinie:', categoryType);
        
        // Trouver et sélectionner automatiquement le bon type de dépense
        let typeFound = false;
        for (let i = 0; i < typeSelect.options.length; i++) {
            const option = typeSelect.options[i];
            if (option.textContent === categoryType) {
                typeSelect.value = option.value;
                typeFound = true;
                console.log('Type de dépense sélectionné automatiquement:', option.textContent);
                break;
            }
        }
        
        if (typeFound) {
            // Désactiver la sélection du type de dépense
            typeSelect.disabled = true;
            typeSelect.style.backgroundColor = '#f5f5f5';
            typeSelect.style.cursor = 'not-allowed';
            
            // Charger automatiquement les catégories pour ce type
            loadCategoriesByType(typeSelect.value);
            
            // Ajouter un indicateur visuel
            let indicator = document.getElementById('category-type-indicator');
            if (!indicator) {
                indicator = document.createElement('small');
                indicator.id = 'category-type-indicator';
                indicator.style.color = '#666';
                indicator.style.fontStyle = 'italic';
                indicator.style.display = 'block';
                indicator.style.marginTop = '5px';
                typeSelect.parentNode.appendChild(indicator);
            }
            indicator.textContent = `Type prédéfini pour ce compte: ${categoryType}`;
        }
    } else {
        // Pour les autres types de comptes, réactiver la sélection
        typeSelect.disabled = false;
        typeSelect.style.backgroundColor = '';
        typeSelect.style.cursor = '';
        
        // Supprimer l'indicateur s'il existe
        const indicator = document.getElementById('category-type-indicator');
        if (indicator) {
            indicator.remove();
        }
        
        // Réinitialiser les sélections
        typeSelect.value = '';
        categorySelect.innerHTML = '<option value="">Sélectionner d\'abord un type</option>';
        categorySelect.disabled = true;
        subcategorySelect.innerHTML = '<option value="">Sélectionner d\'abord une catégorie</option>';
        subcategorySelect.disabled = true;
    }
}



// Fonction pour calculer automatiquement le montant de livraison
function calculateDeliveryAmount() {
    const articleCount = document.getElementById('delivery-article-count').value;
    const unitPrice = document.getElementById('delivery-unit-price').value;
    const amountField = document.getElementById('delivery-amount');
    
    if (articleCount && unitPrice) {
        const calculatedAmount = parseFloat(articleCount) * parseFloat(unitPrice);
        amountField.value = calculatedAmount;
        amountField.placeholder = `${calculatedAmount} FCFA (calculé)`;
    } else {
        amountField.placeholder = "Calculé automatiquement";
    }
}

function setupPartnerEventListeners() {
    // Formulaire d'ajout de livraison
    const addDeliveryForm = document.getElementById('addDeliveryForm');
    if (addDeliveryForm) {
        addDeliveryForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const accountId = document.getElementById('delivery-account-id').value;
            const formData = {
                delivery_date: document.getElementById('delivery-date').value,
                article_count: parseFloat(document.getElementById('delivery-article-count').value),
                unit_price: parseFloat(document.getElementById('delivery-unit-price').value),
                amount: parseFloat(document.getElementById('delivery-amount').value),
                description: document.getElementById('delivery-description').value
            };
            addPartnerDelivery(accountId, formData);
        });
    }
    
    // Initialiser la date du jour pour les livraisons
    const deliveryDateInput = document.getElementById('delivery-date');
    if (deliveryDateInput) {
        deliveryDateInput.value = new Date().toISOString().split('T')[0];
    }
}

// Charger le résumé des comptes partenaires
async function loadPartnerSummary() {
    try {
        console.log('🔄 CLIENT: loadPartnerSummary - début du chargement');
        const response = await fetch('/api/partner/delivery-summary');
        const partnerSummary = await response.json();
        
        console.log('📊 CLIENT: loadPartnerSummary - données reçues:', partnerSummary.length, 'comptes');
        displayPartnerSummary(partnerSummary);
        
        // Charger aussi la configuration si admin
        if (currentUser.role === 'directeur_general' || currentUser.role === 'pca' || currentUser.role === 'admin') {
            await loadPartnerConfiguration();
        }
        
        console.log('✅ CLIENT: loadPartnerSummary - chargement terminé avec succès');
    } catch (error) {
        console.error('❌ CLIENT: Erreur chargement résumé partenaires:', error);
        showNotification('Erreur lors du chargement des données partenaires', 'error');
    }
}

// Afficher le résumé des comptes partenaires
function displayPartnerSummary(partnerSummary) {
    const tbody = document.getElementById('partner-summary-tbody');
    tbody.innerHTML = '';
    
    if (partnerSummary.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center;">Aucun compte partenaire trouvé</td></tr>';
        return;
    }
    
    partnerSummary.forEach(account => {
        const percentage = parseFloat(account.delivery_percentage) || 0;
        const remaining = account.total_credited - account.total_delivered;
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${account.account_name}</td>
            <td>${formatCurrency(account.total_credited)}</td>
            <td>${formatCurrency(account.total_delivered)}</td>
            <td>${formatCurrency(remaining)}</td>
            <td>${account.delivery_count || 0}</td>
            <td>${account.total_articles}</td>
            <td>
                <div class="partner-progress">
                    <div class="partner-progress-bar" style="width: ${percentage}%"></div>
                    <div class="partner-progress-text">${percentage.toFixed(1)}%</div>
                </div>
            </td>
            <td>
                <button class="btn btn-primary btn-sm" onclick="showPartnerDetails(${account.account_id}, '${account.account_name}')">
                    Détails
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// =================================================================
// START OF PARTNER DETAILS CODE BLOCK - COPY EVERYTHING BELOW
// =================================================================

// Main function to display the details of a partner account
async function showPartnerDetails(accountId, accountName) {
    console.log(`[Partner] Showing details for account ID: ${accountId}, Name: ${accountName}`);
    try {
        const partnerSummarySection = document.querySelector('.partner-summary');
        const partnerDetailsSection = document.getElementById('partner-details');

        // Hide summary view and show the details view
        if (partnerSummarySection) partnerSummarySection.style.display = 'none';
        if (partnerDetailsSection) partnerDetailsSection.style.display = 'block';
        
        // Show the back button when entering details view
        const backButton = document.querySelector('.partner-back-button');
        if (backButton) backButton.style.display = 'block';

        // Set the title and hidden input value
        document.getElementById('partner-details-title').textContent = `Détails - ${accountName}`;
        document.getElementById('delivery-account-id').value = accountId;

        // Fetch all necessary data in parallel for efficiency
        const [_, deliveries, directors] = await Promise.all([
            loadPartnerConfiguration(accountId), // Checks permissions and shows/hides form
            fetch(`/api/partner/${accountId}/deliveries`).then(res => res.json()),
            fetch(`/api/partner/${accountId}/directors`).then(res => res.json())
        ]);
        
        console.log(`[Partner] Directors loaded for account ${accountId}:`, directors);
        
        // Render the list of deliveries with all the data
        await displayDeliveries(accountId, deliveries, directors.assigned_director_ids);
        
    } catch (error) {
        console.error(`[Partner] CRITICAL: Error loading partner details:`, error);
        const detailsSection = document.getElementById('partner-details');
        if (detailsSection) {
            detailsSection.innerHTML = `<p class="error-message">Impossible de charger les détails pour ce partenaire. Vérifiez la console.</p>`;
        }
    }
}

// Renders the list of deliveries for the selected partner
async function displayDeliveries(accountId, deliveries, assignedDirectors) {
    const deliveriesTbody = document.getElementById('deliveries-tbody');
    if (!deliveriesTbody) {
        console.error('[Partner] ERROR: deliveries-tbody element not found!');
        return;
    }

    // CRITICAL FIX: Ensure currentUser is loaded before attempting to check permissions
    const currentUser = await getCurrentUser();
    if (!currentUser) {
        console.error('[Partner] CRITICAL: Could not get current user. Aborting render.');
        deliveriesTbody.innerHTML = '<tr><td colspan="9" class="error-message">Erreur: Utilisateur non chargé.</td></tr>';
        return;
    }
    
    deliveriesTbody.innerHTML = ''; // Clear previous content

    if (!deliveries || deliveries.length === 0) {
        deliveriesTbody.innerHTML = '<tr><td colspan="9" style="text-align: center;">Aucune livraison pour ce compte.</td></tr>';
    } else {
        deliveries.forEach(delivery => {
            const row = deliveriesTbody.insertRow();
            row.className = `status-${delivery.validation_status}`;
            
            // Pass currentUser to the function that generates action buttons
            const actionButtons = getDeliveryActionButtons(delivery, accountId, assignedDirectors, currentUser);
            const deleteButton = getDeliveryDeleteButton(delivery, currentUser, assignedDirectors);
            
            row.innerHTML = `
                <td>${new Date(delivery.delivery_date).toLocaleDateString()}</td>
                <td>${delivery.article_count}</td>
                <td>${formatCurrency(delivery.unit_price)}</td>
                <td>${formatCurrency(delivery.amount)}</td>
                <td>${delivery.description || ''}</td>
                <td>${delivery.created_by_name || 'N/A'}</td>
                <td>${getDeliveryStatusText(delivery)}</td>
                <td class="validation-cell">${actionButtons}</td>
                <td class="delete-cell">${deleteButton}</td>
            `;
        });
    }
}

// Generates the correct validation/rejection buttons based on user permissions
function getDeliveryActionButtons(delivery, accountId, assignedDirectors, currentUser) { 
    let buttons = '';
    // Pass the already-loaded currentUser to the permission checkers
    const canValidate = canValidateDelivery(delivery, currentUser, assignedDirectors);
    const canReject = canRejectDelivery(delivery, currentUser, assignedDirectors);

    if (canValidate) {
        buttons += `<button class="validate-delivery-btn" data-delivery-id="${delivery.id}" data-account-id="${accountId}">Valider</button>`;
    }
    if (canReject) {
        buttons += `<button class="reject-delivery-btn" data-delivery-id="${delivery.id}" data-account-id="${accountId}">Rejeter</button>`;
    }
    
    return buttons || '<span class="text-muted">-</span>';
}

// Generate delete button separately for isolation
function getDeliveryDeleteButton(delivery, currentUser, assignedDirectors) {
    const canDelete = canDeleteDelivery(delivery, currentUser, assignedDirectors);
    
    if (!canDelete) {
        return '<span class="text-muted">-</span>';
    }
    
    // Calculate remaining time for directors
    let timeWarning = '';
    if (currentUser.role === 'directeur') {
        const deliveryDate = new Date(delivery.delivery_date);
        const now = new Date();
        const timeDiff = now - deliveryDate;
        const hoursDiff = timeDiff / (1000 * 60 * 60);
        const remainingHours = 24 - hoursDiff;
        
        if (remainingHours > 0) {
            const hours = Math.floor(remainingHours);
            const minutes = Math.floor((remainingHours % 1) * 60);
            timeWarning = `Il reste ${hours}h${minutes}min`;
        }
    }
    
    const title = currentUser.role === 'directeur' && timeWarning ? 
                 `Supprimer (${timeWarning})` : 
                 'Supprimer définitivement';
    
    return `<button class="btn-delete-isolated" onclick="deletePartnerDelivery(${delivery.id})" title="${title}">
                <i class="fas fa-trash"></i>
            </button>`;
}

// Checks if the current user can validate a delivery
function canValidateDelivery(delivery, currentUser, assignedDirectors) {
    if (!currentUser) return false;
    
    // No actions allowed on fully validated or rejected deliveries
    if (delivery.validation_status === 'fully_validated' || delivery.validation_status === 'rejected') {
        return false;
    }
    
    // DG, PCA, and Admin can always validate (except for fully validated/rejected)
    if (['directeur_general', 'pca', 'admin'].includes(currentUser.role)) {
        return true;
    }
    // Directors have specific rules
    if (currentUser.role === 'directeur') {
        const isAssigned = assignedDirectors.includes(currentUser.id);
        if (!isAssigned) {
            return false;
        }
        // Can perform the first validation
        if (delivery.validation_status === 'pending') {
            return true;
        }
        // Can perform the second validation if they weren't the first validator
        if (delivery.validation_status === 'first_validated' && delivery.first_validated_by !== currentUser.id) {
            return true;
        }
    }
    return false;
}

// Checks if the current user can reject a delivery
function canRejectDelivery(delivery, currentUser, assignedDirectors) {
    if (!currentUser) return false;
    
    // No actions allowed on fully validated or rejected deliveries
    if (delivery.validation_status === 'fully_validated' || delivery.validation_status === 'rejected') {
        return false;
    }
    
    // DG, PCA, and Admin can reject (except for fully validated/rejected)
    if (['directeur_general', 'pca', 'admin'].includes(currentUser.role)) {
        return true;
    }
    // Assigned directors can reject deliveries that are not fully validated or rejected
    if (currentUser.role === 'directeur') {
        const isAssigned = assignedDirectors.includes(currentUser.id);
        return isAssigned;
    }
    return false;
}

// Checks if the current user can delete a delivery
function canDeleteDelivery(delivery, currentUser, assignedDirectors) {
    if (!currentUser) return false;
    
    // DG, PCA, and Admin can delete any delivery (including validated ones)
    if (['directeur_general', 'pca', 'admin'].includes(currentUser.role)) {
        return true;
    }
    
    // Assigned directors can delete within 24h regardless of status
    if (currentUser.role === 'directeur') {
        const isAssigned = assignedDirectors.includes(currentUser.id);
        if (!isAssigned) return false;
        
        // Check if delivery is within 24h window
        const deliveryDate = new Date(delivery.delivery_date);
        const now = new Date();
        const timeDiff = now - deliveryDate;
        const hoursDiff = timeDiff / (1000 * 60 * 60); // Convert to hours
        
        return hoursDiff <= 48;
    }
    
    return false;
}

// Returns a formatted HTML string for the delivery status
function getDeliveryStatusText(delivery) {
    const status = delivery.validation_status || 'pending';
    switch (status) {
        case 'pending':
            return '<span class="status-badge status-pending">En attente</span>';
        case 'first_validated':
            return `<span class="status-badge status-first-validated">Première validation</span><br><small>Par: ${delivery.first_validated_by_name || 'N/A'}</small>`;
        case 'fully_validated':
            return `<span class="status-badge status-fully-validated">Validée</span><br><small>Par: ${delivery.validated_by_name || 'N/A'}</small>`;
        case 'rejected':
            return `<span class="status-badge status-rejected">Rejetée</span><br><small>Par: ${delivery.rejected_by_name || 'N/A'}</small>`;
        default:
            return `<span class="status-badge">Inconnu</span>`;
    }
}

// Hides the details view and shows the summary view
function closePartnerDetails() {
    const detailsSection = document.getElementById('partner-details');
    const summarySection = document.querySelector('.partner-summary');
    if (detailsSection) detailsSection.style.display = 'none';
    if (summarySection) summarySection.style.display = 'block';
    
    // Hide the back button when returning to summary view
    const backButton = document.querySelector('.partner-back-button');
    if (backButton) backButton.style.display = 'none';
    
    // Force refresh of partner summary data
    console.log('🔄 CLIENT: closePartnerDetails - rafraîchissement des données');
    loadPartnerSummary(); // Refresh the summary view
}

// Get assigned directors for a partner account
async function getAssignedDirectors(accountId) {
    try {
        const response = await fetch(`/api/partner/${accountId}/directors`);
        if (!response.ok) {
            throw new Error('Failed to fetch assigned directors');
        }
        const directors = await response.json();
        return directors.assigned_director_ids || [];
    } catch (error) {
        console.error('[Partner] Error getting assigned directors:', error);
        return [];
    }
}

// =================================================================
// END OF PARTNER DETAILS CODE BLOCK
// =================================================================

// Ajouter une livraison partenaire
async function addPartnerDelivery(accountId, formData) {
    try {
        const response = await fetch(`/api/partner/${accountId}/deliveries`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });
        
        if (response.ok) {
            const result = await response.json();
            showNotification(result.message, 'success');
            
            // Réinitialiser le formulaire
            document.getElementById('addDeliveryForm').reset();
            document.getElementById('delivery-date').value = new Date().toISOString().split('T')[0];
            
            // Recharger les données
            await showPartnerDetails(accountId, document.getElementById('partner-details-title').textContent.split(' - ')[1]);
            await loadPartnerSummary();
        } else {
            const error = await response.json();
            throw new Error(error.error);
        }
    } catch (error) {
        showNotification(`Erreur: ${error.message}`, 'error');
    }
}

// Première validation d'une livraison partenaire
async function firstValidateDelivery(deliveryId) {
    if (!confirm('Effectuer la première validation de cette livraison ?')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/partner/deliveries/${deliveryId}/first-validate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showNotification(data.message, 'success');
            // Recharger les données
            const accountId = document.getElementById('delivery-account-id').value;
            const accountName = document.getElementById('partner-details-title').textContent.split(' - ')[1];
            await showPartnerDetails(accountId, accountName);
            await loadPartnerSummary();
        } else {
            showNotification(data.error, 'error');
        }
    } catch (error) {
        console.error('Erreur première validation:', error);
        showNotification('Erreur lors de la première validation', 'error');
    }
}

// Validation finale d'une livraison partenaire
async function finalValidateDelivery(deliveryId) {
    if (!confirm('Approuver définitivement cette livraison ? Le montant sera déduit du compte.')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/partner/deliveries/${deliveryId}/final-validate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showNotification(data.message, 'success');
            // Recharger les données
            const accountId = document.getElementById('delivery-account-id').value;
            const accountName = document.getElementById('partner-details-title').textContent.split(' - ')[1];
            await showPartnerDetails(accountId, accountName);
            await loadPartnerSummary();
        } else {
            showNotification(data.error, 'error');
        }
    } catch (error) {
        console.error('Erreur validation finale:', error);
        showNotification('Erreur lors de la validation finale', 'error');
    }
}

// Rejeter une livraison partenaire
async function rejectDelivery(deliveryId) {
    const comment = prompt('Motif du refus (obligatoire):');
    
    if (!comment || comment.trim() === '') {
        showNotification('Un commentaire de refus est obligatoire', 'error');
        return;
    }
    
    if (!confirm('Rejeter cette livraison ?')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/partner/deliveries/${deliveryId}/reject`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ comment: comment.trim() })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showNotification(data.message, 'success');
            // Recharger les données
            const accountId = document.getElementById('delivery-account-id').value;
            const accountName = document.getElementById('partner-details-title').textContent.split(' - ')[1];
            await showPartnerDetails(accountId, accountName);
            await loadPartnerSummary();
        } else {
            showNotification(data.error, 'error');
        }
    } catch (error) {
        console.error('Erreur rejet livraison:', error);
        showNotification('Erreur lors du rejet', 'error');
    }
}

// Modifier une livraison rejetée
async function editRejectedDelivery(deliveryId) {
    // Pour l'instant, on informe l'utilisateur qu'il peut créer une nouvelle livraison
    showNotification('Votre livraison a été rejetée. Vous pouvez créer une nouvelle livraison avec les corrections demandées.', 'info');
}

// Supprimer une livraison partenaire (DG, PCA, Admin)
async function deletePartnerDelivery(deliveryId) {
    // Vérifier que l'utilisateur a les permissions appropriées
    if (!['directeur_general', 'pca', 'admin'].includes(currentUser.role)) {
        showNotification('Seuls les directeurs généraux, PCA et admin peuvent supprimer des livraisons', 'error');
        return;
    }
    
    try {
        // D'abord récupérer les détails de la livraison pour afficher le montant
        const accountId = document.getElementById('delivery-account-id').value;
        const deliveriesResponse = await fetch(`/api/partner/${accountId}/deliveries`);
        const deliveries = await deliveriesResponse.json();
        const delivery = deliveries.find(d => d.id == deliveryId);
        
        if (!delivery) {
            showNotification('Livraison non trouvée', 'error');
            return;
        }
        
        const formattedAmount = formatCurrency(delivery.amount);
        const deliveryDate = new Date(delivery.delivery_date).toLocaleDateString();
        const statusText = delivery.validation_status === 'fully_validated' ? 'VALIDÉE' : 
                         delivery.validation_status === 'first_validated' ? 'partiellement validée' : 'en attente';
        
        // Calculer le temps restant pour les directeurs
        let timeWarning = '';
        if (currentUser.role === 'directeur') {
            const deliveryDateTime = new Date(delivery.delivery_date);
            const now = new Date();
            const timeDiff = now - deliveryDateTime;
            const hoursDiff = timeDiff / (1000 * 60 * 60);
            const remainingHours = 24 - hoursDiff;
            
            if (remainingHours > 0) {
                const hours = Math.floor(remainingHours);
                const minutes = Math.floor((remainingHours % 1) * 60);
                timeWarning = `⏰ Temps restant: ${hours}h${minutes}min\n`;
            } else {
                timeWarning = `❌ Délai de 24h dépassé - suppression non autorisée\n`;
            }
        }
        
        // Demander confirmation avec avertissement incluant le montant
        const confirmMessage = `⚠️ ATTENTION - Suppression ${currentUser.role === 'admin' ? 'Admin' : 'Directeur'} ⚠️\n\n` +
                              `Êtes-vous sûr de vouloir supprimer définitivement cette livraison ?\n\n` +
                              `📅 Date: ${deliveryDate}\n` +
                              `💰 Montant: ${formattedAmount}\n` +
                              `📊 Statut: ${statusText}\n` +
                              `📝 Description: ${delivery.description || 'N/A'}\n` +
                              `${timeWarning}\n` +
                              `Cette action :\n` +
                              `• Supprimera la livraison de façon permanente\n` +
                              `• ${delivery.validation_status === 'fully_validated' ? 
                                   `Remboursera automatiquement ${formattedAmount} au compte partenaire` : 
                                   'N\'affectera pas le solde du compte (livraison non validée)'}\n` +
                              `• Ne peut pas être annulée\n\n` +
                              `Confirmez-vous la suppression de cette livraison de ${formattedAmount} ?`;
        
        if (!confirm(confirmMessage)) {
            return;
        }
        
        // Procéder à la suppression
        const response = await fetch(`/api/partner/deliveries/${deliveryId}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showNotification(data.message, 'success');
            
            // Si la livraison était validée, afficher une notification spéciale
            if (data.wasValidated) {
                showNotification(`💰 Le montant de ${formattedAmount} a été automatiquement remboursé au compte partenaire.`, 'info');
            }
            
            // Recharger les données
            const accountName = document.getElementById('partner-details-title').textContent.split(' - ')[1];
            await showPartnerDetails(accountId, accountName);
            await loadPartnerSummary();
        } else {
            showNotification(data.error, 'error');
        }
    } catch (error) {
        console.error('Erreur suppression livraison:', error);
        showNotification('Erreur lors de la suppression de la livraison', 'error');
    }
}

// Valider une livraison partenaire (DG uniquement)
async function validateDelivery(deliveryId) {
    if (!confirm('Êtes-vous sûr de vouloir valider cette livraison ? Cette action déduira le montant du solde du compte.')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/partner/deliveries/${deliveryId}/validate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        if (response.ok) {
            const result = await response.json();
            showNotification(result.message, 'success');
            
            // Recharger les données
            const accountId = document.getElementById('delivery-account-id').value;
            const accountName = document.getElementById('partner-details-title').textContent.split(' - ')[1];
            await showPartnerDetails(accountId, accountName);
            await loadPartnerSummary();
        } else {
            const error = await response.json();
            throw new Error(error.error);
        }
    } catch (error) {
        showNotification(`Erreur: ${error.message}`, 'error');
    }
}

// Charger la configuration des comptes partenaires (Admin)
async function loadPartnerConfiguration() {
    if (currentUser.role !== 'directeur_general' && currentUser.role !== 'pca' && currentUser.role !== 'admin') {
        return;
    }
    
    try {
        const [accountsResponse, directorsResponse] = await Promise.all([
            fetch('/api/partner/accounts'),
            fetch('/api/users/directors-for-accounts')
        ]);
        
        const partnerAccounts = await accountsResponse.json();
        const directors = await directorsResponse.json();
        
        displayPartnerConfiguration(partnerAccounts, directors);
    } catch (error) {
        console.error('Erreur chargement configuration partenaires:', error);
    }
}

// === GÉNÉRATION DE FACTURES PARTENAIRES ===

// Initialiser l'interface de génération de factures partenaires
function initPartnerInvoiceGenerator() {
    // Gestionnaires d'événements pour les contrôles de période
    const periodRadios = document.querySelectorAll('input[name="invoice-period"]');
    const customDateRange = document.getElementById('custom-date-range');
    const startDateInput = document.getElementById('partner-invoice-start-date');
    const endDateInput = document.getElementById('partner-invoice-end-date');
    
    periodRadios.forEach(radio => {
        radio.addEventListener('change', function() {
            console.log('📅 Radio button changé vers:', this.value);
            
            if (this.value === 'custom') {
                customDateRange.style.display = 'block';
                // Vider les champs pour permettre la saisie personnalisée
                startDateInput.value = '';
                endDateInput.value = '';
                console.log('📅 Mode personnalisé activé - champs vidés');
            } else {
                // Mode "mois en cours"
                customDateRange.style.display = 'none';
                
                // Remettre les dates du mois en cours dans les champs cachés
                const now = new Date();
                const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
                const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                
                startDateInput.value = firstDay.toISOString().split('T')[0];
                endDateInput.value = lastDay.toISOString().split('T')[0];
                
                console.log('📅 Dates mois en cours restaurées:', {
                    startDate: startDateInput.value,
                    endDate: endDateInput.value
                });
            }
            updateDeliveriesPreview();
        });
    });
    
    // Gestionnaires pour les changements dans les champs
    const accountSelect = document.getElementById('partner-invoice-account');
    const partnerNameInput = document.getElementById('partner-invoice-name');
    const previewBtn = document.getElementById('preview-deliveries-btn');
    const generateBtn = document.getElementById('generate-partner-invoice-btn');
    
    if (accountSelect) {
        accountSelect.addEventListener('change', updateDeliveriesPreview);
    }
    
    if (startDateInput) {
        startDateInput.addEventListener('change', updateDeliveriesPreview);
    }
    
    if (endDateInput) {
        endDateInput.addEventListener('change', updateDeliveriesPreview);
    }
    
    if (partnerNameInput) {
        partnerNameInput.addEventListener('input', function() {
            updateGenerateButtonState();
        });
    }
    
    if (previewBtn) {
        previewBtn.addEventListener('click', previewPartnerDeliveries);
    }
    
    if (generateBtn) {
        generateBtn.addEventListener('click', generatePartnerInvoicePDF);
    }
    
    // Charger les comptes partenaires au démarrage
    loadPartnerAccountsForInvoice();
    
    // Définir les dates par défaut pour le mois en cours
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    
    // Définir les dates par défaut dans les champs (même si cachés)
    if (startDateInput) {
        startDateInput.value = firstDay.toISOString().split('T')[0];
    }
    if (endDateInput) {
        endDateInput.value = lastDay.toISOString().split('T')[0];
    }
    
    // S'assurer que l'état initial est correct
    const currentMonthRadio = document.querySelector('input[name="invoice-period"][value="current-month"]');
    if (currentMonthRadio && currentMonthRadio.checked) {
        customDateRange.style.display = 'none';
    }
    
    console.log('📅 Partner Invoice: Dates par défaut définies:', {
        startDate: firstDay.toISOString().split('T')[0],
        endDate: lastDay.toISOString().split('T')[0]
    });
    
    // Déclencher un aperçu initial après un petit délai pour s'assurer que tout est initialisé
    setTimeout(() => {
        if (accountSelect && accountSelect.value) {
            updateDeliveriesPreview();
        }
    }, 500);
}

// Charger les comptes partenaires pour la génération de factures
async function loadPartnerAccountsForInvoice() {
    try {
        const response = await fetch('/api/partner/accounts');
        const accounts = await response.json();
        
        const accountSelect = document.getElementById('partner-invoice-account');
        if (accountSelect) {
            accountSelect.innerHTML = '<option value="">Sélectionner un compte...</option>';
            accounts.forEach(account => {
                const option = document.createElement('option');
                option.value = account.id;
                option.textContent = account.account_name;
                accountSelect.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Erreur chargement comptes partenaires pour facture:', error);
        showNotification('Erreur lors du chargement des comptes partenaires', 'error');
    }
}

// Mettre à jour l'aperçu des livraisons
async function updateDeliveriesPreview() {
    const accountId = document.getElementById('partner-invoice-account').value;
    const periodType = document.querySelector('input[name="invoice-period"]:checked')?.value;
    const countSpan = document.getElementById('deliveries-count');
    const previewBtn = document.getElementById('preview-deliveries-btn');
    
    console.log('🔄 updateDeliveriesPreview appelé:', {
        accountId: accountId,
        periodType: periodType
    });
    
    if (!accountId) {
        countSpan.textContent = 'Sélectionnez un compte et une période';
        previewBtn.disabled = true;
        updateGenerateButtonState();
        return;
    }
    
    if (!periodType) {
        console.error('❌ Aucun type de période sélectionné');
        countSpan.textContent = 'Erreur: aucun type de période sélectionné';
        previewBtn.disabled = true;
        updateGenerateButtonState();
        return;
    }
    
    try {
        const dateRange = getInvoiceDateRange(periodType);
        
        // Vérifier que les dates sont valides
        if (!dateRange.startDate || !dateRange.endDate) {
            if (periodType === 'custom') {
                countSpan.textContent = 'Veuillez sélectionner une date de début et une date de fin';
            } else {
                countSpan.textContent = 'Erreur: dates non définies';
            }
            previewBtn.disabled = true;
            updateGenerateButtonState();
            return;
        }
        
        const params = new URLSearchParams({
            account_id: accountId,
            start_date: dateRange.startDate,
            end_date: dateRange.endDate
        });
        
        const response = await fetch(`/api/partner/deliveries/preview?${params}`);
        const data = await response.json();
        
        if (response.ok) {
            const count = data.deliveries.length;
            const totalAmount = data.deliveries.reduce((sum, d) => sum + parseFloat(d.amount), 0);
            
            if (count > 0) {
                countSpan.innerHTML = `<strong>${count}</strong> livraisons validées trouvées (${formatCurrency(totalAmount)})`;
                previewBtn.disabled = false;
            } else {
                countSpan.textContent = 'Aucune livraison validée trouvée pour cette période';
                previewBtn.disabled = true;
            }
        } else {
            countSpan.textContent = 'Erreur lors de la vérification';
            previewBtn.disabled = true;
        }
    } catch (error) {
        console.error('Erreur aperçu livraisons:', error);
        countSpan.textContent = 'Erreur lors de la vérification';
        previewBtn.disabled = true;
    }
    
    updateGenerateButtonState();
}

// Obtenir la plage de dates pour la facture
function getInvoiceDateRange(periodType) {
    console.log('📅 getInvoiceDateRange appelé avec periodType:', periodType);
    
    if (periodType === 'current-month') {
        const now = new Date();
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        
        const dateRange = {
            startDate: firstDay.toISOString().split('T')[0],
            endDate: lastDay.toISOString().split('T')[0]
        };
        
        console.log('📅 Dates mois en cours calculées:', dateRange);
        return dateRange;
    } else {
        const startDate = document.getElementById('partner-invoice-start-date').value;
        const endDate = document.getElementById('partner-invoice-end-date').value;
        
        const dateRange = {
            startDate: startDate,
            endDate: endDate
        };
        
        console.log('📅 Dates personnalisées récupérées:', dateRange);
        return dateRange;
    }
}

// Mettre à jour l'état du bouton de génération
function updateGenerateButtonState() {
    const partnerName = document.getElementById('partner-invoice-name').value.trim();
    const accountId = document.getElementById('partner-invoice-account').value;
    const countSpan = document.getElementById('deliveries-count');
    const generateBtn = document.getElementById('generate-partner-invoice-btn');
    
    const hasValidData = partnerName && accountId && countSpan.textContent.includes('livraisons validées trouvées');
    generateBtn.disabled = !hasValidData;
}

// Prévisualiser les livraisons
async function previewPartnerDeliveries() {
    const accountId = document.getElementById('partner-invoice-account').value;
    const periodType = document.querySelector('input[name="invoice-period"]:checked').value;
    
    try {
        const dateRange = getInvoiceDateRange(periodType);
        const params = new URLSearchParams({
            account_id: accountId,
            start_date: dateRange.startDate,
            end_date: dateRange.endDate
        });
        
        const response = await fetch(`/api/partner/deliveries/preview?${params}`);
        const data = await response.json();
        
        if (response.ok) {
            showDeliveriesPreviewModal(data.deliveries, dateRange);
        } else {
            showNotification(data.error || 'Erreur lors de la prévisualisation', 'error');
        }
    } catch (error) {
        console.error('Erreur prévisualisation:', error);
        showNotification('Erreur lors de la prévisualisation', 'error');
    }
}

// Afficher la modal de prévisualisation
function showDeliveriesPreviewModal(deliveries, dateRange) {
    const totalAmount = deliveries.reduce((sum, d) => sum + parseFloat(d.amount), 0);
    const periodText = dateRange.startDate === dateRange.endDate 
        ? `le ${formatDate(dateRange.startDate)}`
        : `du ${formatDate(dateRange.startDate)} au ${formatDate(dateRange.endDate)}`;
    
    let tableRows = '';
    deliveries.forEach(delivery => {
        tableRows += `
            <tr>
                <td>${formatDate(delivery.delivery_date)}</td>
                <td>${delivery.article_count}</td>
                <td>${formatCurrency(delivery.unit_price || 0)}</td>
                <td>${formatCurrency(delivery.amount)}</td>
                <td>${delivery.description || '-'}</td>
            </tr>
        `;
    });
    
    const modalHTML = `
        <div class="modal-overlay" onclick="closePreviewModal()">
            <div class="modal-content preview-modal" onclick="event.stopPropagation()">
                <div class="modal-header">
                    <h3><i class="fas fa-eye"></i> Aperçu des Livraisons</h3>
                    <button class="modal-close" onclick="closePreviewModal()">&times;</button>
                </div>
                <div class="modal-body">
                    <p><strong>Période:</strong> ${periodText}</p>
                    <p><strong>Nombre de livraisons:</strong> ${deliveries.length}</p>
                    <p><strong>Montant total:</strong> ${formatCurrency(totalAmount)}</p>
                    
                    <div class="table-container">
                        <table class="preview-table">
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Articles</th>
                                    <th>Prix Unit.</th>
                                    <th>Montant</th>
                                    <th>Description</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${tableRows}
                            </tbody>
                        </table>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="closePreviewModal()">Fermer</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

// Fermer la modal de prévisualisation
function closePreviewModal() {
    const modal = document.querySelector('.modal-overlay');
    if (modal) {
        modal.remove();
    }
}

// Générer la facture PDF
async function generatePartnerInvoicePDF() {
    const partnerName = document.getElementById('partner-invoice-name').value.trim();
    const accountId = document.getElementById('partner-invoice-account').value;
    const periodType = document.querySelector('input[name="invoice-period"]:checked').value;
    const generateBtn = document.getElementById('generate-partner-invoice-btn');
    
    if (!partnerName || !accountId) {
        showNotification('Veuillez remplir tous les champs requis', 'error');
        return;
    }
    
    try {
        // Désactiver le bouton et afficher le chargement
        generateBtn.disabled = true;
        generateBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Génération...';
        
        showNotification('Génération de la facture PDF en cours...', 'info');
        
        const dateRange = getInvoiceDateRange(periodType);
        
        // Vérifier que les dates sont valides
        if (!dateRange.startDate || !dateRange.endDate) {
            if (periodType === 'custom') {
                showNotification('Veuillez sélectionner une date de début et une date de fin', 'error');
            } else {
                showNotification('Erreur: dates non définies', 'error');
            }
            
            // Réactiver le bouton en cas d'erreur
            generateBtn.disabled = false;
            generateBtn.innerHTML = '<i class="fas fa-file-pdf"></i> Générer Facture PDF';
            updateGenerateButtonState();
            return;
        }
        
        // Créer les paramètres pour l'URL
        const params = new URLSearchParams({
            partner_name: partnerName,
            account_id: accountId,
            start_date: dateRange.startDate,
            end_date: dateRange.endDate,
            filename: `facture_${partnerName.replace(/[^a-zA-Z0-9]/g, '_')}_${dateRange.startDate.replace(/-/g, '')}_${dateRange.endDate.replace(/-/g, '')}.pdf`
        });
        
        // Ouvrir directement l'URL du PDF dans un nouvel onglet
        const pdfUrl = `/api/partner/generate-invoice-pdf-direct?${params}`;
        window.open(pdfUrl, '_blank');
        
        showNotification('Facture PDF générée avec succès !', 'success');
        
    } catch (error) {
        console.error('Erreur génération facture:', error);
        showNotification('Erreur lors de la génération de la facture', 'error');
    } finally {
        // Réactiver le bouton
        generateBtn.disabled = false;
        generateBtn.innerHTML = '<i class="fas fa-file-pdf"></i> Générer Facture PDF';
        updateGenerateButtonState(); // Réévaluer l'état du bouton
    }
}

// Afficher la configuration des comptes partenaires
function displayPartnerConfiguration(partnerAccounts, directors) {
    const configDiv = document.getElementById('partner-accounts-config');
    configDiv.innerHTML = '';
    
    if (partnerAccounts.length === 0) {
        configDiv.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-users-slash fa-3x text-muted mb-3"></i>
                <p class="text-muted">Aucun compte partenaire trouvé.</p>
                    </div>
        `;
        return;
    }
    
    partnerAccounts.forEach(account => {
        const configCard = document.createElement('div');
        configCard.className = 'partner-config-card';
        
        const assignedDirectorIds = account.assigned_director_ids || [];
        const assignedDirectorNames = account.assigned_director_names || [];
        
        configCard.innerHTML = `
            <div class="card-header">
                <div class="account-info">
                    <i class="fas fa-building text-primary me-2"></i>
                    <h5 class="account-title">${account.account_name}</h5>
                </div>
                <div class="account-status">
                    <span class="status-badge ${assignedDirectorNames.length > 0 ? 'status-active' : 'status-pending'}">
                        ${assignedDirectorNames.length > 0 ? 'Configuré' : 'En attente'}
                    </span>
                </div>
            </div>
            
            <div class="card-body">
                <div class="directors-grid">
                    <div class="director-field">
                        <label class="field-label">
                            <i class="fas fa-user-tie me-2"></i>
                            Directeur Principal
                        </label>
                        <select id="director1-${account.id}" class="form-select director-select">
                            <option value="">Sélectionner un directeur</option>
                            ${directors.map(d => `<option value="${d.id}" ${assignedDirectorIds.length > 0 && assignedDirectorIds[0] === d.id ? 'selected' : ''}>${d.username}</option>`).join('')}
                        </select>
                </div>
                    
                    <div class="director-field">
                        <label class="field-label">
                            <i class="fas fa-user-friends me-2"></i>
                            Directeur Secondaire
                        </label>
                        <select id="director2-${account.id}" class="form-select director-select">
                            <option value="">Sélectionner un directeur</option>
                            ${directors.map(d => `<option value="${d.id}" ${assignedDirectorIds.length > 1 && assignedDirectorIds[1] === d.id ? 'selected' : ''}>${d.username}</option>`).join('')}
                        </select>
                </div>
            </div>
            
                ${assignedDirectorNames.length > 0 ? `
                    <div class="current-assignment">
                        <h6 class="assignment-title">
                            <i class="fas fa-check-circle text-success me-2"></i>
                            Directeurs Assignés
                        </h6>
                        <div class="directors-list">
                            ${assignedDirectorNames.map((name, index) => `
                                <span class="director-badge ${index === 0 ? 'director-primary' : 'director-secondary'}">
                                    <i class="fas fa-user me-1"></i>
                                    ${name}
                                    <small class="role-text">${index === 0 ? 'Principal' : 'Secondaire'}</small>
                    </span>
                            `).join('')}
                </div>
            </div>
                ` : `
                    <div class="no-assignment">
                        <i class="fas fa-exclamation-triangle text-warning me-2"></i>
                        <span class="text-muted">Aucun directeur assigné</span>
                    </div>
                `}
            </div>
            
            <div class="card-footer">
                <button class="btn btn-update" onclick="updatePartnerDirectors(${account.id})">
                    <i class="fas fa-save me-2"></i>
                    Mettre à jour
                </button>
        </div>
    `;
    
        configDiv.appendChild(configCard);
    });
}

// Mettre à jour les directeurs assignés à un compte partenaire
async function updatePartnerDirectors(accountId) {
    try {
        // Vérifier que les éléments existent avant de les utiliser
        const director1Element = document.getElementById(`director1-${accountId}`);
        const director2Element = document.getElementById(`director2-${accountId}`);
        
        if (!director1Element || !director2Element) {
            throw new Error('Éléments de sélection des directeurs non trouvés');
        }
        
        const director1 = director1Element.value;
        const director2 = director2Element.value;
        
        const directorIds = [director1, director2].filter(id => id && id !== '');
        
        // Récupérer les noms des directeurs sélectionnés pour la confirmation
        const director1Name = director1 ? director1Element.selectedOptions[0].text : 'Aucun';
        const director2Name = director2 ? director2Element.selectedOptions[0].text : 'Aucun';
        
        // Récupérer le nom du compte de manière sécurisée
        let accountName = 'Compte partenaire';
        try {
            const accountConfig = director1Element.closest('.partner-account-config');
            if (accountConfig) {
                const h5Element = accountConfig.querySelector('h5');
                if (h5Element) {
                    accountName = h5Element.textContent.trim();
                }
            }
        } catch (e) {
            console.warn('Impossible de récupérer le nom du compte:', e);
        }
        
        // Message de confirmation
        const confirmMessage = `Êtes-vous sûr de vouloir mettre à jour les directeurs pour le compte "${accountName}" ?\n\n` +
                              `Directeur Principal: ${director1Name}\n` +
                              `Directeur Secondaire: ${director2Name}\n\n` +
                              `Cette action modifiera les permissions d'accès au compte.`;
        
        // Demander confirmation
        if (!confirm(confirmMessage)) {
            return; // Annuler si l'utilisateur refuse
        }
        
        const response = await fetch(`/api/partner/${accountId}/directors`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ director_ids: directorIds })
        });
        
        if (response.ok) {
            const result = await response.json();
            showNotification(result.message, 'success');
            await loadPartnerConfiguration();
        } else {
            const error = await response.json();
            throw new Error(error.error);
        }
    } catch (error) {
        console.error('Erreur dans updatePartnerDirectors:', error);
        showNotification(`Erreur: ${error.message}`, 'error');
    }
}

// Fonctions pour le formulaire d'ajustement
function setupAdjustmentForm() {
    // Définir la date par défaut
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('adjustment-date').value = today;
    
    // Gestionnaire de soumission du formulaire d'ajustement
    document.getElementById('adjustment-form').addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const formData = {
            adjustment_date: document.getElementById('adjustment-date').value,
            adjustment_amount: document.getElementById('adjustment-amount').value,
            adjustment_comment: document.getElementById('adjustment-comment').value
        };
        
        await addAdjustmentExpense(formData);
    });
    
    // Gestionnaire de réinitialisation
    document.getElementById('reset-adjustment-form').addEventListener('click', function() {
        document.getElementById('adjustment-form').reset();
        document.getElementById('adjustment-date').value = today;
    });
    
    // Créer automatiquement le compte Ajustement s'il n'existe pas
    ensureAdjustmentAccountExists();
}

async function ensureAdjustmentAccountExists() {
    try {
        // Vérifier si le compte Ajustement existe déjà
        const response = await fetch('/api/accounts');
        const accounts = await response.json();
        
        const adjustmentAccount = accounts.find(account => account.account_name === 'Ajustement');
        
        if (!adjustmentAccount) {
            console.log('Compte Ajustement non trouvé, création automatique...');
            await createAdjustmentAccount();
        } else {
            console.log('Compte Ajustement trouvé:', adjustmentAccount.id);
        }
    } catch (error) {
        console.error('Erreur vérification compte Ajustement:', error);
    }
}

async function addAdjustmentExpense(formData) {
    try {
        // D'abord, s'assurer que le compte Ajustement existe
        const accountsResponse = await fetch('/api/accounts');
        const accounts = await accountsResponse.json();
        
        let adjustmentAccount = accounts.find(account => account.account_name === 'Ajustement');
        
        if (!adjustmentAccount) {
            // Créer le compte Ajustement s'il n'existe pas
            await createAdjustmentAccount();
            
            // Recharger les comptes
            const newAccountsResponse = await fetch('/api/accounts');
            const newAccounts = await newAccountsResponse.json();
            adjustmentAccount = newAccounts.find(account => account.account_name === 'Ajustement');
        }
        
        if (!adjustmentAccount) {
            throw new Error('Impossible de créer ou trouver le compte Ajustement');
        }
        
        // Utiliser la route spécialisée pour les ajustements
        const response = await fetch('/api/admin/adjustment-expense', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });
        
        if (response.ok) {
            showNotification('Ajustement comptable ajouté avec succès !', 'success');
            
            // Réinitialiser le formulaire
            document.getElementById('adjustment-form').reset();
            const today = new Date().toISOString().split('T')[0];
            document.getElementById('adjustment-date').value = today;
            
            // Recharger les données
            await loadDashboard();
            await loadExpenses();
            
        } else {
            const error = await response.json();
            throw new Error(error.error);
        }
        
    } catch (error) {
        console.error('Erreur ajout ajustement:', error);
        showNotification(`Erreur: ${error.message}`, 'error');
    }
}

// Event listeners pour les filtres et le tri
document.addEventListener('DOMContentLoaded', function() {
    // Event listeners pour les filtres
    document.getElementById('filter-expenses').addEventListener('click', applyFiltersAndDisplay);
    document.getElementById('clear-filters').addEventListener('click', clearAllFilters);
    document.getElementById('export-expenses').addEventListener('click', exportExpensesToCSV);
    
    // Event listeners pour les filtres en temps réel
    document.getElementById('filter-account').addEventListener('change', applyFiltersAndDisplay);
    document.getElementById('filter-category').addEventListener('change', applyFiltersAndDisplay);
    document.getElementById('filter-supplier').addEventListener('input', applyFiltersAndDisplay);
    document.getElementById('filter-predictable').addEventListener('change', applyFiltersAndDisplay);
    document.getElementById('filter-amount-min').addEventListener('input', applyFiltersAndDisplay);
    document.getElementById('filter-amount-max').addEventListener('input', applyFiltersAndDisplay);
    document.getElementById('filter-user').addEventListener('change', applyFiltersAndDisplay);
    
    // Event listeners pour le tri des colonnes
    document.querySelectorAll('.sortable').forEach(header => {
        header.addEventListener('click', function() {
            const field = this.getAttribute('data-sort');
            handleColumnSort(field);
        });
        header.style.cursor = 'pointer';
    });
    
    // Initialiser les icônes de tri
    updateSortIcons();
});

// === FONCTIONS DE GESTION DES UTILISATEURS ===

// Charger tous les utilisateurs pour l'administration (réutilise loadUsers existante)
async function loadAllUsers() {
    try {
        // Réutiliser la fonction loadUsers existante mais avec l'endpoint admin
        const response = await fetch('/api/admin/users');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const users = await response.json();
        allUsersData = users; // Stocker les données pour les filtres
        displayAllUsers(users);
    } catch (error) {
        console.error('Erreur chargement utilisateurs:', error);
        showNotification('Erreur lors du chargement des utilisateurs', 'error');
    }
}

// Afficher la liste des utilisateurs avec options d'administration
function displayAllUsers(users) {
    const usersList = document.getElementById('users-list');
    
    if (!Array.isArray(users)) {
        console.error('displayAllUsers: users n\'est pas un tableau:', users);
        usersList.innerHTML = '<p>Erreur: impossible d\'afficher les utilisateurs.</p>';
        return;
    }
    
    if (users.length === 0) {
        usersList.innerHTML = '<p>Aucun utilisateur trouvé.</p>';
        return;
    }
    
    const tableHtml = `
        <div class="table-responsive" style="border-radius: 15px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.1);">
            <table class="table table-striped table-hover mb-0" style="border-radius: 15px; overflow: hidden;">
                <thead style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white;">
                    <tr>
                        <th style="border: none; padding: 15px; font-weight: 600;">
                            <i class="fas fa-user" style="margin-right: 8px;"></i>Nom d'utilisateur
                        </th>
                        <th style="border: none; padding: 15px; font-weight: 600;">
                            <i class="fas fa-id-card" style="margin-right: 8px;"></i>Nom complet
                        </th>
                        <th style="border: none; padding: 15px; font-weight: 600;">
                            <i class="fas fa-envelope" style="margin-right: 8px;"></i>Email
                        </th>
                        <th style="border: none; padding: 15px; font-weight: 600;">
                            <i class="fas fa-user-tag" style="margin-right: 8px;"></i>Rôle
                        </th>
                        <th style="border: none; padding: 15px; font-weight: 600;">
                            <i class="fas fa-calendar" style="margin-right: 8px;"></i>Création
                        </th>
                        <th style="border: none; padding: 15px; font-weight: 600;">
                            <i class="fas fa-toggle-on" style="margin-right: 8px;"></i>Statut
                        </th>
                        <th style="border: none; padding: 15px; font-weight: 600;">
                            <i class="fas fa-cogs" style="margin-right: 8px;"></i>Actions
                        </th>
                    </tr>
                </thead>
                <tbody style="background: white;">
                    ${users.map(user => {
                        const statusClass = user.is_active ? 'text-success' : 'text-danger';
                        const statusText = user.is_active ? 'Actif' : 'Inactif';
                        const roleLabels = {
                            'directeur': 'Directeur',
                            'directeur_general': 'Directeur Général',
                            'pca': 'PCA',
                            'comptable': 'Comptable'
                        };
                        
                        let actionButtons = '';
                        
                        // Ne pas permettre de modifier/désactiver son propre compte
                        if (user.id !== currentUser.id) {
                            // Bouton modifier
                            actionButtons += `<button class="btn btn-primary btn-sm me-1" onclick="editUser(${user.id})" title="Modifier">
                                <i class="fas fa-edit"></i>
                            </button>`;
                            
                            // Bouton activer/désactiver
                            if (user.is_active) {
                                actionButtons += `<button class="btn btn-warning btn-sm me-1" onclick="deactivateUser(${user.id})" title="Désactiver">
                                    <i class="fas fa-ban"></i>
                                </button>`;
                            } else {
                                actionButtons += `<button class="btn btn-success btn-sm me-1" onclick="activateUser(${user.id})" title="Activer">
                                    <i class="fas fa-check"></i>
                                </button>`;
                            }
                            
                            // Bouton réinitialiser mot de passe
                            actionButtons += `<button class="btn btn-info btn-sm" onclick="resetUserPassword(${user.id})" title="Réinitialiser mot de passe">
                                <i class="fas fa-key"></i>
                            </button>`;
                        } else {
                            actionButtons = '<span class="text-muted">Votre compte</span>';
                        }
                        
                        return `
                            <tr style="transition: all 0.3s ease; border-left: 4px solid transparent;">
                                <td style="padding: 15px; vertical-align: middle;"><strong>${user.username}</strong></td>
                                <td style="padding: 15px; vertical-align: middle;">${user.full_name || '-'}</td>
                                <td style="padding: 15px; vertical-align: middle;">${user.email || '-'}</td>
                                <td style="padding: 15px; vertical-align: middle;">
                                    <span class="badge badge-primary" style="padding: 8px 12px; border-radius: 20px; font-weight: 500;">
                                        ${roleLabels[user.role] || user.role}
                                    </span>
                                </td>
                                <td style="padding: 15px; vertical-align: middle;">${formatDate(user.created_at)}</td>
                                <td style="padding: 15px; vertical-align: middle;">
                                    <span class="${statusClass}"><strong>${statusText}</strong></span>
                                </td>
                                <td style="padding: 15px; vertical-align: middle;">${actionButtons}</td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        </div>
        
        <style>
            .users-list tbody tr:hover {
                background: linear-gradient(90deg, #f8f9ff 0%, #ffffff 100%) !important;
                border-left: 4px solid #667eea !important;
                transform: translateX(5px);
                box-shadow: 0 5px 15px rgba(0,0,0,0.1);
            }
            
            .badge-primary {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
            }
        </style>
    `;
    
    usersList.innerHTML = tableHtml;
}

// Variables globales pour les filtres utilisateurs
let allUsersData = [];

// Filtrer les utilisateurs selon les critères sélectionnés
function filterUsers() {
    const statusFilter = document.getElementById('statusFilter').value;
    const roleFilter = document.getElementById('roleFilter').value;
    
    let filteredUsers = allUsersData;
    
    // Filtrer par statut
    if (statusFilter) {
        if (statusFilter === 'active') {
            filteredUsers = filteredUsers.filter(user => user.is_active === true);
        } else if (statusFilter === 'inactive') {
            filteredUsers = filteredUsers.filter(user => user.is_active === false);
        }
    }
    
    // Filtrer par rôle
    if (roleFilter) {
        filteredUsers = filteredUsers.filter(user => user.role === roleFilter);
    }
    
    // Afficher les utilisateurs filtrés
    displayAllUsers(filteredUsers);
    
    // Mettre à jour le compteur
    updateUserFilterCount(filteredUsers.length, allUsersData.length);
}

// Effacer tous les filtres utilisateurs
function clearUserFilters() {
    document.getElementById('statusFilter').value = '';
    document.getElementById('roleFilter').value = '';
    displayAllUsers(allUsersData);
    updateUserFilterCount(allUsersData.length, allUsersData.length);
}

// Mettre à jour le compteur d'utilisateurs filtrés
function updateUserFilterCount(filtered, total) {
    const existingCounter = document.querySelector('.user-filter-count');
    if (existingCounter) {
        existingCounter.remove();
    }
    
    if (filtered !== total) {
        const counter = document.createElement('div');
        counter.className = 'user-filter-count';
        counter.style.cssText = `
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 10px 15px;
            border-radius: 20px;
            margin-bottom: 15px;
            text-align: center;
            font-weight: 500;
            box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
        `;
        counter.innerHTML = `
            <i class="fas fa-filter" style="margin-right: 8px;"></i>
            ${filtered} utilisateur${filtered > 1 ? 's' : ''} affiché${filtered > 1 ? 's' : ''} sur ${total}
        `;
        
        const usersList = document.getElementById('users-list');
        usersList.insertBefore(counter, usersList.firstChild);
    }
}

// Recharger les utilisateurs en maintenant les filtres actuels
async function reloadUsersWithFilters() {
    await loadAllUsers();
    // Réappliquer les filtres après le rechargement
    const statusFilter = document.getElementById('statusFilter');
    const roleFilter = document.getElementById('roleFilter');
    if ((statusFilter && statusFilter.value) || (roleFilter && roleFilter.value)) {
        filterUsers();
    }
}

// Créer un nouvel utilisateur
async function createUser(formData) {
    try {
        const response = await fetch('/api/admin/users', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showNotification('Utilisateur créé avec succès', 'success');
            resetUserForm();
            reloadUsersWithFilters(); // Recharger la liste
        } else {
            showNotification(result.error || 'Erreur lors de la création', 'error');
        }
    } catch (error) {
        console.error('Erreur création utilisateur:', error);
        showNotification('Erreur lors de la création de l\'utilisateur', 'error');
    }
}

// Modifier un utilisateur
async function editUser(userId) {
    try {
        const response = await fetch(`/api/admin/users/${userId}`);
        const user = await response.json();
        
        if (response.ok) {
            // Remplir le formulaire avec les données existantes
            document.getElementById('newUsername').value = user.username;
            document.getElementById('newFullName').value = user.full_name || '';
            document.getElementById('newEmail').value = user.email || '';
            document.getElementById('newUserRole').value = user.role;
            document.getElementById('newPassword').value = '';
            document.getElementById('newPassword').placeholder = 'Laisser vide pour ne pas changer';
            document.getElementById('newPassword').required = false;
            
            // Changer le bouton et ajouter l'ID en mode édition
            const submitButton = document.querySelector('#createUserForm button[type="submit"]');
            submitButton.textContent = 'Modifier l\'Utilisateur';
            submitButton.dataset.editingId = userId;
            
            // Afficher le bouton annuler
            document.getElementById('cancelUserEdit').style.display = 'inline-block';
            
            // Faire défiler vers le formulaire
            document.getElementById('createUserForm').scrollIntoView({ behavior: 'smooth' });
        } else {
            showNotification('Erreur lors du chargement des données utilisateur', 'error');
        }
    } catch (error) {
        console.error('Erreur chargement utilisateur:', error);
        showNotification('Erreur lors du chargement des données utilisateur', 'error');
    }
}

// Mettre à jour un utilisateur
async function updateUser(userId, formData) {
    try {
        const response = await fetch(`/api/admin/users/${userId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showNotification('Utilisateur modifié avec succès', 'success');
            resetUserForm();
            reloadUsersWithFilters(); // Recharger la liste
        } else {
            showNotification(result.error || 'Erreur lors de la modification', 'error');
        }
    } catch (error) {
        console.error('Erreur modification utilisateur:', error);
        showNotification('Erreur lors de la modification de l\'utilisateur', 'error');
    }
}

// Désactiver un utilisateur
async function deactivateUser(userId) {
    if (!confirm('Êtes-vous sûr de vouloir désactiver cet utilisateur ?')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/admin/users/${userId}/deactivate`, {
            method: 'PUT'
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showNotification('Utilisateur désactivé avec succès', 'success');
            reloadUsersWithFilters(); // Recharger la liste
        } else {
            showNotification(result.error || 'Erreur lors de la désactivation', 'error');
        }
    } catch (error) {
        console.error('Erreur désactivation utilisateur:', error);
        showNotification('Erreur lors de la désactivation de l\'utilisateur', 'error');
    }
}

// Activer un utilisateur
async function activateUser(userId) {
    try {
        const response = await fetch(`/api/admin/users/${userId}/activate`, {
            method: 'PUT'
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showNotification('Utilisateur activé avec succès', 'success');
            reloadUsersWithFilters(); // Recharger la liste
        } else {
            showNotification(result.error || 'Erreur lors de l\'activation', 'error');
        }
    } catch (error) {
        console.error('Erreur activation utilisateur:', error);
        showNotification('Erreur lors de l\'activation de l\'utilisateur', 'error');
    }
}

// Réinitialiser le mot de passe d'un utilisateur
async function resetUserPassword(userId) {
    const newPassword = prompt('Entrez le nouveau mot de passe temporaire :');
    if (!newPassword) {
        return;
    }
    
    try {
        const response = await fetch(`/api/admin/users/${userId}/reset-password`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ newPassword })
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showNotification('Mot de passe réinitialisé avec succès', 'success');
        } else {
            showNotification(result.error || 'Erreur lors de la réinitialisation', 'error');
        }
    } catch (error) {
        console.error('Erreur réinitialisation mot de passe:', error);
        showNotification('Erreur lors de la réinitialisation du mot de passe', 'error');
    }
}

// Réinitialiser le formulaire utilisateur
function resetUserForm() {
    document.getElementById('createUserForm').reset();
    document.getElementById('newPassword').placeholder = 'Mot de passe temporaire';
    document.getElementById('newPassword').required = true;
    
    const submitButton = document.querySelector('#createUserForm button[type="submit"]');
    submitButton.textContent = 'Créer l\'Utilisateur';
    delete submitButton.dataset.editingId;
    
    document.getElementById('cancelUserEdit').style.display = 'none';
}

// Mobile Menu Functions
function setupMobileMenu() {
    const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebar-overlay');
    
    if (mobileMenuToggle) {
        mobileMenuToggle.addEventListener('click', toggleMobileMenu);
    }
    
    if (sidebarOverlay) {
        sidebarOverlay.addEventListener('click', closeMobileMenu);
    }
    
    // Close menu on window resize if desktop
    window.addEventListener('resize', function() {
        if (window.innerWidth >= 768) {
            closeMobileMenu();
        }
    });
    
    // Close menu on escape key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            closeMobileMenu();
        }
    });
}

function toggleMobileMenu() {
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebar-overlay');
    
    if (sidebar && sidebarOverlay) {
        const isOpen = sidebar.classList.contains('active');
        
        if (isOpen) {
            closeMobileMenu();
        } else {
            openMobileMenu();
        }
    }
}

function openMobileMenu() {
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebar-overlay');
    const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
    
    if (sidebar && sidebarOverlay) {
        sidebar.classList.add('active');
        sidebarOverlay.classList.add('active');
        document.body.style.overflow = 'hidden'; // Prevent background scrolling
        
        if (mobileMenuToggle) {
            const icon = mobileMenuToggle.querySelector('i');
            if (icon) {
                icon.classList.remove('fa-bars');
                icon.classList.add('fa-times');
            }
        }
    }
}

function closeMobileMenu() {
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebar-overlay');
    const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
    
    if (sidebar && sidebarOverlay) {
        sidebar.classList.remove('active');
        sidebarOverlay.classList.remove('active');
        document.body.style.overflow = ''; // Restore scrolling
        
        if (mobileMenuToggle) {
            const icon = mobileMenuToggle.querySelector('i');
            if (icon) {
                icon.classList.remove('fa-times');
                icon.classList.add('fa-bars');
            }
        }
    }
}

// Desktop Menu Functions
function setupDesktopMenu() {
    const desktopMenuToggle = document.getElementById('desktop-menu-toggle');
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.querySelector('.main-content');
    
    if (desktopMenuToggle && sidebar) {
        desktopMenuToggle.addEventListener('click', toggleDesktopMenu);
        
        // Restore sidebar state from localStorage
        const isCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
        if (isCollapsed && window.innerWidth >= 1024) {
            sidebar.classList.add('collapsed');
            if (mainContent) {
                mainContent.classList.add('sidebar-collapsed');
            }
            // Set ARIA attribute to reflect collapsed state
            desktopMenuToggle.setAttribute('aria-expanded', 'false');
        } else {
            // Set ARIA attribute to reflect expanded state
            desktopMenuToggle.setAttribute('aria-expanded', 'true');
        }
    }
}

function toggleDesktopMenu() {
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.querySelector('.main-content');
    const desktopMenuToggle = document.getElementById('desktop-menu-toggle');
    
    if (sidebar) {
        const isCollapsed = sidebar.classList.toggle('collapsed');
        
        if (mainContent) {
            mainContent.classList.toggle('sidebar-collapsed');
        }
        
        // Update ARIA attribute for screen readers
        if (desktopMenuToggle) {
            desktopMenuToggle.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
        }
        
        // Save state to localStorage
        localStorage.setItem('sidebarCollapsed', isCollapsed);
    }
}

// Event listeners pour le formulaire utilisateur
document.addEventListener('DOMContentLoaded', function() {
    // Setup mobile menu
    setupMobileMenu();
    
    // Setup desktop menu
    setupDesktopMenu();
    
    // Update navigation links to close mobile menu
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', function() {
            closeMobileMenu();
        });
    });
    
    // Gestionnaire de formulaire de création/modification d'utilisateur
    document.getElementById('createUserForm').addEventListener('submit', function(e) {
        e.preventDefault();
        const submitButton = this.querySelector('button[type="submit"]');
        const isEditing = submitButton.dataset.editingId;
        
        const formData = {
            username: document.getElementById('newUsername').value,
            full_name: document.getElementById('newFullName').value,
            email: document.getElementById('newEmail').value,
            role: document.getElementById('newUserRole').value
        };
        
        // Ajouter le mot de passe seulement s'il est fourni
        const password = document.getElementById('newPassword').value;
        if (password) {
            formData.password = password;
        }
        
        if (isEditing) {
            // Mode modification
            updateUser(parseInt(isEditing), formData);
        } else {
            // Mode création - mot de passe requis
            if (!password) {
                showNotification('Le mot de passe est requis pour créer un utilisateur', 'error');
                return;
            }
            createUser(formData);
        }
    });
});

// Fonction pour charger les permissions de crédit d'un compte
async function loadCreditPermissions(accountId) {
    try {
        const response = await fetch(`/api/accounts/${accountId}/credit-permissions`);
        const permissions = await response.json();
        
        const permissionsContainer = document.getElementById('creditPermissionsContainer');
        if (!permissionsContainer) return;
        
        permissionsContainer.innerHTML = `
            <h4>Permissions de Crédit</h4>
            <table class="permissions-table">
                <thead>
                    <tr>
                        <th>Directeur</th>
                        <th>Accordé par</th>
                        <th>Date</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${permissions.map(p => `
                        <tr>
                            <td>${p.full_name}</td>
                            <td>${p.granted_by_name}</td>
                            <td>${new Date(p.granted_at).toLocaleDateString()}</td>
                            <td>
                                <button onclick="removePermission(${accountId}, ${p.user_id})" class="btn-danger">
                                    Retirer
                                </button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            <button onclick="showAddPermissionForm(${accountId})" class="btn-primary">
                Ajouter une Permission
            </button>
        `;
    } catch (error) {
        console.error('Erreur lors du chargement des permissions:', error);
        showError('Erreur lors du chargement des permissions');
    }
}

// Fonction pour ajouter une permission de crédit
async function addCreditPermission(accountId, userId) {
    try {
        const response = await fetch(`/api/accounts/${accountId}/credit-permissions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ user_id: userId })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Erreur lors de l\'ajout de la permission');
        }
        
        showSuccess('Permission accordée avec succès');
        loadCreditPermissions(accountId);
    } catch (error) {
        console.error('Erreur:', error);
        showError(error.message);
    }
}

// Fonction pour retirer une permission de crédit
async function removePermission(accountId, userId) {
    if (!confirm('Êtes-vous sûr de vouloir retirer cette permission ?')) return;
    
    try {
        const response = await fetch(`/api/accounts/${accountId}/credit-permissions/${userId}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Erreur lors du retrait de la permission');
        }
        
        showSuccess('Permission retirée avec succès');
        loadCreditPermissions(accountId);
    } catch (error) {
        console.error('Erreur:', error);
        showError(error.message);
    }
}

// Fonction pour afficher le formulaire d'ajout de permission
function showAddPermissionForm(accountId) {
    // Charger la liste des directeurs
    fetch('/api/users/directors')
        .then(response => response.json())
        .then(directors => {
            const modal = document.createElement('div');
            modal.className = 'modal';
            modal.innerHTML = `
                <div class="modal-content">
                    <h3>Ajouter une Permission de Crédit</h3>
                    <select id="directorSelect">
                        <option value="">Sélectionner un directeur</option>
                        ${directors.map(d => `
                            <option value="${d.id}">${d.full_name}</option>
                        `).join('')}
                    </select>
                    <div class="modal-buttons">
                        <button onclick="addCreditPermission(${accountId}, document.getElementById('directorSelect').value)" class="btn-primary">
                            Ajouter
                        </button>
                        <button onclick="this.closest('.modal').remove()" class="btn-secondary">
                            Annuler
                        </button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        })
        .catch(error => {
            console.error('Erreur:', error);
            showError('Erreur lors du chargement des directeurs');
        });
}

// ... existing code ...

// Initialisation du module Transfert
function initTransfertModule() {
    // Affiche le menu seulement pour DG/PCA
    const transfertMenu = document.getElementById('transfert-menu');
    if (!transfertMenu) return;
    if (currentUser && (currentUser.role === 'directeur_general' || currentUser.role === 'pca' || currentUser.role === 'admin')) {
        transfertMenu.style.display = '';
    } else {
        transfertMenu.style.display = 'none';
    }
    // Navigation
    const navLink = transfertMenu.querySelector('a');
    if (navLink) {
        navLink.addEventListener('click', function(e) {
            e.preventDefault();
            showSection('transfert');
        });
    }
    // Ne plus masquer automatiquement la section - laissé au contrôle de showSection
    // Remplir les comptes
    loadTransfertAccounts();
    // Attacher l'écouteur du formulaire UNE SEULE FOIS
    const form = document.getElementById('transfert-form');
    if (form && !form.dataset.listenerAttached) {
        form.addEventListener('submit', handleTransfertSubmit);
        form.dataset.listenerAttached = 'true';
    }
}

async function handleTransfertSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const notif = document.getElementById('transfert-notification');
    notif.style.display = 'none';
    const sourceId = form['transfert-source'].value;
    const destId = form['transfert-destination'].value;
    const montant = parseInt(form['transfert-montant'].value);
    const comment = form['transfert-comment'].value.trim();
    console.log('[Transfert] Submit:', { sourceId, destId, montant, comment });
    if (!sourceId || !destId || !montant || sourceId === destId) {
        notif.textContent = 'Veuillez remplir tous les champs correctement.';
        notif.className = 'notification error';
        notif.style.display = 'block';
        return;
    }
    // Vérifier le solde max
    const sourceOpt = form['transfert-source'].options[form['transfert-source'].selectedIndex];
    const destOpt = form['transfert-destination'].options[form['transfert-destination'].selectedIndex];
    const solde = parseInt(sourceOpt.dataset.solde) || 0;
    console.log('[Transfert] Solde source affiché:', solde);
    // BYPASS TEMPORAIRE - VÉRIFICATION DE SOLDE POUR TRANSFERTS DÉSACTIVÉE
    /*
    if (montant > solde) {
        notif.textContent = 'Le montant dépasse le solde disponible.';
        notif.className = 'notification error';
        notif.style.display = 'block';
        return;
    }
    */
    
    // Pop-up de confirmation
    const sourceAccountName = sourceOpt.textContent.split(' (')[0];
    const destAccountName = destOpt.textContent.split(' (')[0];
    const montantFormate = montant.toLocaleString('fr-FR') + ' FCFA';
    
    const confirmationMessage = `Êtes-vous sûr de vouloir effectuer ce transfert ?\n\n` +
        `De : ${sourceAccountName}\n` +
        `Vers : ${destAccountName}\n` +
        `Montant : ${montantFormate}\n\n` +
        `Cette action est irréversible.`;
    
    if (!confirm(confirmationMessage)) {
        return; // L'utilisateur a annulé
    }
    // Appel API réel
    try {
        const resp = await fetch('/api/transfert', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ source_id: sourceId, destination_id: destId, montant, comment })
        });
        const data = await resp.json();
        console.log('[Transfert] Réponse API:', data);
        if (resp.ok && data.success) {
            notif.textContent = 'Transfert effectué avec succès.';
            notif.className = 'notification success';
            notif.style.display = 'block';
            form.reset();
            document.getElementById('solde-source-info').style.display = 'none';
            
            // Mettre à jour les dropdowns avec les nouveaux soldes
            await loadTransfertAccounts();
            
            // Mettre à jour le dashboard si affiché
            await reloadDashboardIfActive();
            
            // Attendre un peu pour s'assurer que toutes les données sont mises à jour
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Rechargement final pour s'assurer de la cohérence
            await reloadDashboardIfActive();
            
            // Rechargement forcé des comptes dans la section de gestion des comptes
            const accountsSection = document.getElementById('manage-accounts-section');
            if (accountsSection && accountsSection.classList.contains('active')) {
                console.log('[Transfert] Rechargement forcé des comptes...');
                await loadAccounts();
            }
            
            // Mettre à jour la liste des comptes si affichée
            if (typeof loadAccounts === 'function') {
                const accountsSection = document.getElementById('manage-accounts-section');
                if (accountsSection && accountsSection.classList.contains('active')) {
                    await loadAccounts();
                }
            }
            
            // Recharger l'historique des transferts si un compte est sélectionné
            const historyAccountSelect = document.getElementById('transfert-history-account');
            if (historyAccountSelect && historyAccountSelect.value) {
                await loadTransfertHistory();
            }
        } else {
            notif.textContent = data.error || 'Erreur lors du transfert.';
            notif.className = 'notification error';
            notif.style.display = 'block';
        }
    } catch (err) {
        notif.textContent = 'Erreur réseau ou serveur.';
        notif.className = 'notification error';
        notif.style.display = 'block';
        console.error('[Transfert] Erreur réseau/serveur:', err);
    }
}

async function loadTransfertAccounts() {
    const sourceSelect = document.getElementById('transfert-source');
    const destSelect = document.getElementById('transfert-destination');
    if (!sourceSelect || !destSelect) return;
    
    // Protection contre les appels multiples
    if (sourceSelect.dataset.loading === 'true') {
        console.log('[Transfert] Chargement déjà en cours, ignoré');
        return;
    }
    sourceSelect.dataset.loading = 'true';
    
    // Vider complètement les selects pour éviter les doublons
    sourceSelect.innerHTML = '';
    destSelect.innerHTML = '';
    
    // Ajouter l'option par défaut
    const defaultOption1 = new Option('Sélectionner un compte', '');
    const defaultOption2 = new Option('Sélectionner un compte', '');
    sourceSelect.appendChild(defaultOption1);
    destSelect.appendChild(defaultOption2);
    
    try {
        const resp = await fetch('/api/accounts');
        const accounts = await resp.json();
        console.log('[Transfert] Comptes reçus:', accounts.length, 'comptes');
        
        // Filtrer les comptes autorisés
        const allowedTypes = ['classique', 'statut', 'Ajustement'];
        const filtered = accounts.filter(acc => allowedTypes.includes(acc.account_type) && acc.is_active);
        console.log('[Transfert] Comptes filtrés:', filtered.length, 'comptes autorisés');
        
        filtered.forEach(acc => {
            const optionText = acc.account_name + ' (' + parseInt(acc.current_balance).toLocaleString() + ' FCFA)';
            
            // Option pour le select source
            const opt1 = new Option(optionText, acc.id);
            opt1.dataset.solde = acc.current_balance;
            sourceSelect.appendChild(opt1);
            
            // Option pour le select destination
            const opt2 = new Option(optionText, acc.id);
            destSelect.appendChild(opt2);
        });
        
        console.log('[Transfert] Options ajoutées:', filtered.length, 'comptes dans chaque select');
        
        // Attacher les événements UNE SEULE FOIS avec protection
        if (!sourceSelect.dataset.eventsAttached) {
            // Empêcher de choisir le même compte
            sourceSelect.addEventListener('change', function() {
                const val = this.value;
                Array.from(destSelect.options).forEach(opt => {
                    opt.disabled = (opt.value === val && val !== '');
                });
                // Afficher le solde du compte source
                const soldeInfo = document.getElementById('solde-source-info');
                if (soldeInfo) {
                    const opt = this.options[this.selectedIndex];
                    if (opt && opt.dataset.solde) {
                        soldeInfo.textContent = 'Solde disponible : ' + parseInt(opt.dataset.solde).toLocaleString() + ' FCFA';
                        soldeInfo.style.display = 'block';
                        console.log('[Transfert] Solde affiché pour', opt.textContent, ':', opt.dataset.solde);
                    } else {
                        soldeInfo.style.display = 'none';
                    }
                }
            });
            
            // Réinitialiser le solde info si on change de compte destination
            destSelect.addEventListener('change', function() {
                const soldeInfo = document.getElementById('solde-source-info');
                if (soldeInfo) soldeInfo.style.display = 'block';
            });
            
            sourceSelect.dataset.eventsAttached = 'true';
            console.log('[Transfert] Event listeners attachés');
        }
        
        // Charger les comptes pour l'historique
        await loadTransfertHistoryAccounts();
        
        // Attacher les événements pour l'historique
        attachTransfertHistoryEvents();
        
    } catch (e) {
        console.error('[Transfert] Erreur chargement comptes transfert:', e);
    } finally {
        // Libérer le flag de chargement avec un petit délai pour éviter les appels rapides
        setTimeout(() => {
            sourceSelect.dataset.loading = 'false';
        }, 100);
    }
}

// Fonction pour charger les comptes dans le sélecteur d'historique
async function loadTransfertHistoryAccounts() {
    const historyAccountSelect = document.getElementById('transfert-history-account');
    if (!historyAccountSelect) return;
    
    try {
        const resp = await fetch('/api/accounts');
        const accounts = await resp.json();
        
        // Vider le sélecteur
        historyAccountSelect.innerHTML = '<option value="">Sélectionner un compte</option>';
        
        // Filtrer les comptes autorisés (même logique que pour les transferts)
        const allowedTypes = ['classique', 'statut', 'Ajustement'];
        const filtered = accounts.filter(acc => allowedTypes.includes(acc.account_type) && acc.is_active);
        
        filtered.forEach(acc => {
            const opt = document.createElement('option');
            opt.value = acc.id;
            opt.textContent = acc.account_name + ' (' + parseInt(acc.current_balance).toLocaleString() + ' FCFA)';
            historyAccountSelect.appendChild(opt);
        });
        
        console.log('[Transfert History] Comptes chargés:', filtered.length);
    } catch (e) {
        console.error('[Transfert History] Erreur chargement comptes:', e);
    }
}

// Fonction pour attacher les événements de l'historique
function attachTransfertHistoryEvents() {
    const loadHistoryBtn = document.getElementById('load-transfert-history');
    if (loadHistoryBtn) {
        loadHistoryBtn.addEventListener('click', loadTransfertHistory);
    }
    
    // Charger automatiquement l'historique quand on change de compte
    const historyAccountSelect = document.getElementById('transfert-history-account');
    if (historyAccountSelect) {
        historyAccountSelect.addEventListener('change', function() {
            if (this.value) {
                loadTransfertHistory();
            } else {
                // Réinitialiser l'affichage
                const historyList = document.getElementById('transfert-history-list');
                if (historyList) {
                    historyList.innerHTML = '<p class="text-muted text-center">Sélectionnez un compte pour voir son historique de transferts</p>';
                }
            }
        });
    }
}

// Fonction pour charger l'historique des transferts d'un compte
async function loadTransfertHistory() {
    const accountSelect = document.getElementById('transfert-history-account');
    const startDateInput = document.getElementById('transfert-history-start-date');
    const endDateInput = document.getElementById('transfert-history-end-date');
    const historyList = document.getElementById('transfert-history-list');
    const loadBtn = document.getElementById('load-transfert-history');
    
    if (!accountSelect || !historyList) return;
    
    const accountId = accountSelect.value;
    if (!accountId) {
        historyList.innerHTML = '<p class="text-muted text-center">Sélectionnez un compte pour voir son historique de transferts</p>';
        return;
    }
    
    // Afficher le chargement
    loadBtn.disabled = true;
    loadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Chargement...';
    historyList.innerHTML = '<p class="text-muted text-center">Chargement de l\'historique...</p>';
    
    try {
        // Construire l'URL avec les paramètres
        let url = `/api/transfers/account/${accountId}`;
        const params = new URLSearchParams();
        
        if (startDateInput && startDateInput.value) {
            params.append('start_date', startDateInput.value);
        }
        if (endDateInput && endDateInput.value) {
            params.append('end_date', endDateInput.value);
        }
        
        if (params.toString()) {
            url += '?' + params.toString();
        }
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Erreur lors du chargement de l\'historique');
        }
        
        // Afficher l'historique
        displayTransfertHistory(data);
        
    } catch (error) {
        console.error('[Transfert History] Erreur:', error);
        historyList.innerHTML = `
            <div class="alert alert-warning">
                <i class="fas fa-exclamation-triangle"></i>
                Erreur lors du chargement de l'historique: ${error.message}
            </div>
        `;
    } finally {
        // Réinitialiser le bouton
        loadBtn.disabled = false;
        loadBtn.innerHTML = '<i class="fas fa-search"></i> Charger l\'historique';
    }
}

// Fonction pour afficher l'historique des transferts
function displayTransfertHistory(data) {
    const historyList = document.getElementById('transfert-history-list');
    if (!historyList) return;
    
    if (!data.transfers || data.transfers.length === 0) {
        historyList.innerHTML = `
            <div class="text-center">
                <p class="text-muted">
                    <i class="fas fa-info-circle"></i>
                    Aucun transfert trouvé pour ce compte
                    ${data.account_name ? `(${data.account_name})` : ''}
                </p>
            </div>
        `;
        return;
    }
    
    // Créer le tableau
    let html = `
        <div class="table-responsive">
            <table class="transfert-table">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Type</th>
                        <th>Compte</th>
                        <th>Montant</th>
                        <th>Commentaire</th>
                        <th>Par</th>
                        <th class="transfert-actions-column">Actions</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    data.transfers.forEach(transfer => {
        const date = new Date(transfer.created_at).toLocaleDateString('fr-FR');
        const time = new Date(transfer.created_at).toLocaleTimeString('fr-FR', { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
        const montant = Number(transfer.montant).toLocaleString('fr-FR') + ' FCFA';
        
        // Déterminer le type et le compte concerné
        const isSortant = transfer.transfer_type === 'SORTANT';
        const otherAccount = isSortant ? transfer.destination_account : transfer.source_account;
        
        // Vérifier si l'utilisateur peut supprimer des transferts
        const canDelete = ['directeur_general', 'pca', 'admin'].includes(currentUser.role);
        
        const commentDisplay = transfer.comment ? 
            `<span class="transfert-comment" title="${transfer.comment}">${transfer.comment.length > 30 ? transfer.comment.substring(0, 30) + '...' : transfer.comment}</span>` : 
            '<span class="text-muted">-</span>';
        
        html += `
            <tr>
                <td class="transfert-date">${date}<br><small>${time}</small></td>
                <td>
                    <span class="transfert-type ${isSortant ? 'sortant' : 'entrant'}">
                        ${isSortant ? 'Sortant' : 'Entrant'}
                    </span>
                </td>
                <td class="transfert-user">${otherAccount}</td>
                <td class="transfert-amount ${isSortant ? 'negative' : 'positive'}">
                    ${isSortant ? '-' : '+'}${montant}
                </td>
                <td class="transfert-comment-cell">${commentDisplay}</td>
                <td class="transfert-user">${transfer.transferred_by}</td>
                <td class="transfert-actions ${canDelete ? '' : 'hidden'}">
                    <button class="btn-delete-transfert" onclick="showDeleteTransfertModal(${transfer.id}, '${transfer.source_account}', '${transfer.destination_account}', ${transfer.montant}, '${transfer.created_at}', '${transfer.transferred_by}')" title="Supprimer ce transfert">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </td>
            </tr>
        `;
    });
    
    html += `
                </tbody>
            </table>
        </div>
        <div class="mt-3">
            <small class="text-muted">
                <i class="fas fa-info-circle"></i>
                ${data.transfers.length} transfert(s) trouvé(s)
                ${data.account_name ? `pour ${data.account_name}` : ''}
            </small>
        </div>
    `;
    
    historyList.innerHTML = html;
}

// Variables globales pour la suppression de transfert
let currentTransferToDelete = null;

// Fonction pour afficher la modal de suppression de transfert
function showDeleteTransfertModal(transferId, sourceAccount, destinationAccount, montant, createdAt, transferredBy) {
    currentTransferToDelete = transferId;
    
    // Remplir les détails dans la modal
    document.getElementById('delete-transfert-montant').textContent = Number(montant).toLocaleString('fr-FR') + ' FCFA';
    document.getElementById('delete-transfert-source').textContent = sourceAccount;
    document.getElementById('delete-transfert-destination').textContent = destinationAccount;
    document.getElementById('delete-transfert-date').textContent = new Date(createdAt).toLocaleDateString('fr-FR') + ' ' + new Date(createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    document.getElementById('delete-transfert-user').textContent = transferredBy;
    
    // Afficher la modal
    const modal = document.getElementById('delete-transfert-modal');
    modal.style.display = 'block';
    
    // Attacher l'événement de confirmation
    const confirmBtn = document.getElementById('confirm-delete-transfert');
    confirmBtn.onclick = deleteTransfert;
}

// Fonction pour fermer la modal de suppression
function closeDeleteTransfertModal() {
    const modal = document.getElementById('delete-transfert-modal');
    modal.style.display = 'none';
    currentTransferToDelete = null;
}

// Fonction pour supprimer un transfert
async function deleteTransfert() {
    if (!currentTransferToDelete) return;
    
    const confirmBtn = document.getElementById('confirm-delete-transfert');
    const originalText = confirmBtn.innerHTML;
    
    // Afficher le chargement
    confirmBtn.disabled = true;
    confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Suppression...';
    
    try {
        const response = await fetch(`/api/transfers/${currentTransferToDelete}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            // Fermer la modal
            closeDeleteTransfertModal();
            
            // Afficher une notification de succès
            showNotification(data.message, 'success');
            
            // Recharger l'historique
            await loadTransfertHistory();
            
            // Recharger les comptes de transfert pour mettre à jour les soldes
            await loadTransfertAccounts();
            
            // Mettre à jour le dashboard si il est affiché
            await reloadDashboardIfActive();
            
        } else {
            throw new Error(data.error || 'Erreur lors de la suppression');
        }
        
    } catch (error) {
        console.error('[Suppression Transfert] Erreur:', error);
        showNotification('Erreur lors de la suppression: ' + error.message, 'error');
    } finally {
        // Réinitialiser le bouton
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = originalText;
    }
}

// Fermer la modal si on clique en dehors
window.onclick = function(event) {
    const modal = document.getElementById('delete-transfert-modal');
    if (event.target === modal) {
        closeDeleteTransfertModal();
    }
}

// Fonction utilitaire pour recharger le dashboard
async function reloadDashboardIfActive() {
    const dashboardSection = document.getElementById('dashboard-section');
    if (dashboardSection && dashboardSection.classList.contains('active')) {
        console.log('[Dashboard] Rechargement automatique...');
        
        try {
            // Récupérer les dates actuelles du dashboard
            const currentStartDate = document.getElementById('dashboard-start-date')?.value || 
                                   document.getElementById('filter-start-date')?.value || 
                                   new Date().toISOString().split('T')[0].substring(0, 7) + '-01';
            const currentEndDate = document.getElementById('dashboard-end-date')?.value || 
                                 document.getElementById('filter-end-date')?.value || 
                                 new Date().toISOString().split('T')[0];
            
            console.log('[Dashboard] Dates utilisées:', { currentStartDate, currentEndDate });
            
            // Recharger toutes les données du dashboard
            await loadDashboardData();
            await loadStockSummary(currentStartDate, currentEndDate);
            await loadStockVivantTotal();
            await loadStockVivantVariation(currentStartDate, currentEndDate);
            await loadTotalCreances();
            await loadCreancesMois();
            await loadTransfersCard();
            
            // Forcer la mise à jour des éléments d'affichage
            updateDashboardDisplay();
            
            console.log('[Dashboard] Rechargement terminé avec succès');
        } catch (error) {
            console.error('[Dashboard] Erreur lors du rechargement:', error);
        }
    }
}



// Fonction pour forcer la mise à jour de l'affichage du dashboard
function updateDashboardDisplay() {
    console.log('[Dashboard] Début de la mise à jour visuelle...');
    
    // Animation sur le conteneur principal du dashboard
    const dashboardSection = document.getElementById('dashboard-section');
    if (dashboardSection) {
        dashboardSection.classList.add('dashboard-updating');
        setTimeout(() => {
            dashboardSection.classList.remove('dashboard-updating');
        }, 1000);
    }
    
    // Animation sur les cartes de statistiques
    const statCards = document.querySelectorAll('.stat-card');
    statCards.forEach((card, index) => {
        setTimeout(() => {
            card.classList.add('updating');
            setTimeout(() => {
                card.classList.remove('updating');
            }, 800);
        }, index * 100);
    });
    
    // Animation sur les tableaux
    const tables = document.querySelectorAll('.table-responsive');
    tables.forEach(table => {
        table.classList.add('table-updating');
        setTimeout(() => {
            table.classList.remove('table-updating');
        }, 500);
    });
    
    // Forcer le re-rendu des éléments
    const elementsToUpdate = [
        '#solde-amount',
        '#monthly-balance-total',
        '#total-partner-balance',
        '#monthly-burn',
        '#cash-bictorys-latest',
        '#pl-estim-charges',
        '#pl-brut'
    ];
    
    elementsToUpdate.forEach(selector => {
        const element = document.querySelector(selector);
        if (element) {
            element.style.transform = 'scale(1.05)';
            element.style.transition = 'transform 0.3s ease';
            setTimeout(() => {
                element.style.transform = 'scale(1)';
            }, 300);
        }
    });
    
    console.log('[Dashboard] Mise à jour visuelle terminée');
}
// Fonction pour charger les données de transferts (DG/PCA uniquement)
async function loadTransfersCard() {
    // Masquer les transferts pour les directeurs simples
    const transfersChartCard = document.getElementById('transfers-chart-card');
    
    if (currentUser.role !== 'directeur_general' && currentUser.role !== 'pca' && currentUser.role !== 'admin') {
        if (transfersChartCard) {
            transfersChartCard.style.display = 'none';
        }
        return; // Ne pas charger les transferts pour les directeurs simples
    }
    
    // Afficher la section pour DG/PCA
    if (transfersChartCard) {
        transfersChartCard.style.display = 'block';
    }
    
    try {
        const response = await fetch('/api/transfers');
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Erreur lors du chargement des transferts');
        }
        
        const transfersContainer = document.getElementById('transfers-list');
        
        if (!transfersContainer) {
            console.error('Element transfers-list non trouvé !');
            return;
        }
        
        if (data.transfers.length === 0) {
            transfersContainer.innerHTML = '<p class="text-muted">Aucun transfert récent</p>';
            return;
        }
        
        // Créer le tableau des transferts
        let transfersHTML = `
            <div class="table-responsive">
                <table class="table table-sm">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>De</th>
                            <th>Vers</th>
                            <th>Montant</th>
                            <th>Par</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        data.transfers.forEach(transfer => {
            const date = new Date(transfer.created_at).toLocaleDateString('fr-FR');
            const montant = Number(transfer.montant).toLocaleString('fr-FR') + ' FCFA';
            
            transfersHTML += `
                <tr>
                    <td>${date}</td>
                    <td class="text-primary">${transfer.source_account}</td>
                    <td class="text-success">${transfer.destination_account}</td>
                    <td class="fw-bold">${montant}</td>
                    <td class="text-muted small">${transfer.transferred_by}</td>
                </tr>
            `;
        });
        
        transfersHTML += `
                    </tbody>
                </table>
            </div>
        `;
        
        transfersContainer.innerHTML = transfersHTML;
        
    } catch (error) {
        console.error('Erreur chargement transferts:', error);
        const transfersContainer = document.getElementById('transfers-list');
        if (transfersContainer) {
            transfersContainer.innerHTML = 
                '<div class="alert alert-warning">Erreur lors du chargement des transferts</div>';
        }
    }
}

// ... existing code ...

// Fonction pour charger les données du dashboard
async function loadDashboardData(cutoffDate = null) {
    if (currentUser.role !== 'directeur_general' && currentUser.role !== 'pca' && currentUser.role !== 'directeur' && currentUser.role !== 'admin') {
        return;
    }
    
    try {
        // Récupérer les dates des filtres (vérifier si les éléments existent)
        const startDateElement = document.getElementById('dashboard-start-date');
        const endDateElement = document.getElementById('dashboard-end-date');
        
        if (!startDateElement || !endDateElement) {
            console.log('Éléments de filtre dashboard non trouvés, chargement différé');
            return;
        }
        
        const startDate = startDateElement.value;
        const endDate = endDateElement.value;
        
        // Récupérer automatiquement le cutoff_date depuis l'interface si non fourni
        if (!cutoffDate) {
            const snapshotDateElement = document.getElementById('snapshot-date');
            if (snapshotDateElement && snapshotDateElement.value) {
                cutoffDate = snapshotDateElement.value;
                console.log(`📅 CLIENT: Cutoff_date récupéré automatiquement: ${cutoffDate}`);
            }
        }
        
        console.log('Chargement dashboard pour:', currentUser.username, 'Role:', currentUser.role);
        console.log('Dates:', startDate, 'à', endDate);
        
        let url = '/api/dashboard/stats';
        const params = new URLSearchParams();
        
        if (startDate) params.append('start_date', startDate);
        if (endDate) params.append('end_date', endDate);
        
        if (params.toString()) {
            url += '?' + params.toString();
        }
        
        console.log('URL de requête:', url);
        
        const response = await fetch(url);
        const stats = await response.json();
        
        console.log('Statistiques reçues:', stats);
        
        // Mettre à jour les statistiques
        document.getElementById('weekly-burn').textContent = formatCurrency(stats.weekly_burn);
        document.getElementById('monthly-burn').textContent = formatCurrency(stats.monthly_burn);

        // Calculer le solde (somme des Montant Restant des comptes classique, statut, Ajustement)
        let solde = 0;
        if (Array.isArray(stats.account_breakdown)) {
            console.log('🔍 CLIENT: Données account_breakdown reçues:', stats.account_breakdown.length, 'comptes');
            lastAccountBreakdown = stats.account_breakdown; // Sauvegarder pour updateStatsCards
            const compteDirecteur = stats.account_breakdown.find(item => item.account === 'Compte Directeur Commercial');
            if (compteDirecteur) {
                console.log('🎯 CLIENT: Compte Directeur Commercial trouvé:', compteDirecteur);
            }
            
            console.log('\n💰 [CLIENT CASH LOG] === CALCUL CASH CÔTÉ CLIENT ===');
            lastCashCalculation = {
                total: 0,
                accounts: [],
                excludedAccounts: []
            };
            
            stats.account_breakdown.forEach(acc => {
                const type = (acc.account_type || '').toLowerCase();
                console.log(`🏦 [CLIENT] Compte: ${acc.account} (${type || 'unknown'})`);
                console.log(`   💰 remaining: ${acc.remaining}, current_balance: ${acc.current_balance}, total_credited: ${acc.total_credited}, spent: ${acc.spent}`);
                
                // Inclure STRICTEMENT uniquement les comptes 'classique' et 'statut'
                if (type === 'classique' || type === 'statut') {
                    let balanceUsed = 0;
                    let sourceUsed = '';
                    if (typeof acc.remaining !== 'undefined') {
                        balanceUsed = parseInt(acc.remaining) || 0;
                        sourceUsed = 'remaining';
                        console.log(`   ✅ [CLIENT] INCLUS (type ${type}) avec remaining: ${balanceUsed.toLocaleString()} FCFA`);
                        solde += balanceUsed;
                    } else if (typeof acc.current_balance !== 'undefined') {
                        balanceUsed = parseInt(acc.current_balance) || 0;
                        sourceUsed = 'current_balance';
                        console.log(`   ✅ [CLIENT] INCLUS (type ${type}) avec current_balance: ${balanceUsed.toLocaleString()} FCFA`);
                        solde += balanceUsed;
                    } else if (typeof acc.total_credited !== 'undefined' && typeof acc.spent !== 'undefined') {
                        balanceUsed = (parseInt(acc.total_credited) || 0) - (parseInt(acc.spent) || 0);
                        sourceUsed = 'calculé';
                        console.log(`   ✅ [CLIENT] INCLUS (type ${type}) avec calcul: ${balanceUsed.toLocaleString()} FCFA`);
                        solde += balanceUsed;
                    }
                    
                    lastCashCalculation.accounts.push({
                        name: acc.account,
                        type: type || 'unknown',
                        balance: balanceUsed,
                        source: sourceUsed
                    });
                } else {
                    console.log(`   ❌ [CLIENT] EXCLU (type: ${type || 'unknown'})`);
                    lastCashCalculation.excludedAccounts.push({
                        name: acc.account,
                        type: type || 'unknown',
                        balance: parseInt(acc.remaining || acc.current_balance || 0)
                    });
                }
            });
            
            lastCashCalculation.total = solde;
            console.log(`💰 [CLIENT CASH LOG] TOTAL FINAL: ${solde.toLocaleString()} FCFA`);
            console.log('💰 [CLIENT CASH LOG] === FIN CALCUL ===\n');
        }
        document.getElementById('solde-amount').textContent = formatCurrency(solde);
        
        // Créer les graphiques
        createChart('account-chart', stats.account_breakdown, 'account');
        createChart('category-chart', stats.category_breakdown, 'category');
        
        // Mettre à jour les cartes de statistiques
        await updateStatsCards(startDate, endDate, cutoffDate);
        
        // Charger les données de stock
        await loadStockSummary(startDate, endDate);
        
        // Charger les données du stock vivant
        await loadStockVivantTotal();
        await loadStockVivantVariation(startDate, endDate);
        
    } catch (error) {
        console.error('Erreur chargement dashboard:', error);
    }
}

// Fonction pour charger le résumé du stock
async function loadStockSummary(startDate = null, endDate = null) {
    try {
        let url = '/api/dashboard/stock-summary';
        const params = new URLSearchParams();
        
        if (startDate) params.append('start_date', startDate);
        if (endDate) params.append('end_date', endDate);
        
        if (params.toString()) {
            url += '?' + params.toString();
        }
        
        const response = await fetch(apiUrl(url));
        const stockData = await response.json();
        
        // 📦 LOGS DÉTAILLÉS ÉCART STOCK MATA MENSUEL
        if (stockData.isVariation && endDate) {
            console.log(`📦 Écart Stock Mata Mensuel: ${stockData.totalStock.toLocaleString('fr-FR')} F CFA (valeur cutoff ${stockData.currentStock?.toLocaleString('fr-FR')} - valeur de ref ${stockData.previousStock?.toLocaleString('fr-FR')})`);
        }
        
        const stockTotalElement = document.getElementById('stock-total');
        const stockDateElement = document.getElementById('stock-date');
        const stockMataDetailsElement = document.getElementById('stock-mata-details');
        
        if (stockTotalElement && stockDateElement) {
            if (stockData.totalStock !== 0) {
                stockTotalElement.textContent = stockData.totalStock.toLocaleString('fr-FR');
                stockDateElement.textContent = `(${stockData.formattedDate || stockData.latestDate || 'Date inconnue'})`;
                
                // Afficher les détails des dates si disponibles
                if (stockMataDetailsElement && stockData.details) {
                    stockMataDetailsElement.textContent = stockData.details;
                    stockMataDetailsElement.style.display = 'block';
                }
            } else {
                stockTotalElement.textContent = '0';
                stockDateElement.textContent = stockData.message || 'Aucune donnée';
                if (stockMataDetailsElement) {
                    stockMataDetailsElement.style.display = 'none';
                }
            }
        }
        
    } catch (error) {
        console.error('Erreur chargement résumé stock:', error);
        const stockTotalElement = document.getElementById('stock-total');
        const stockDateElement = document.getElementById('stock-date');
        
        if (stockTotalElement && stockDateElement) {
            stockTotalElement.textContent = 'Erreur';
            stockDateElement.textContent = 'Données indisponibles';
        }
    }
}

// Variable globale pour le mois sélectionné
let selectedMonth = null;

// Initialiser le sélecteur de mois
function initMonthSelector() {
    const monthInput = document.getElementById('dashboard-month');
    const loadButton = document.getElementById('load-month-data');
    const monthDisplay = document.getElementById('current-month-display');
    
    if (!monthInput || !loadButton || !monthDisplay) return;
    
    // Définir le mois en cours par défaut
    const currentDate = new Date();
    const currentMonth = `${currentDate.getFullYear()}-${(currentDate.getMonth() + 1).toString().padStart(2, '0')}`;
    monthInput.value = currentMonth;
    selectedMonth = currentMonth;
    
    // Afficher le mois actuel et mettre à jour les filtres de date
    updateMonthDisplay(currentMonth);
    updateDateFilters(currentMonth);
    
    // S'assurer que les contraintes de snapshot-date sont définies dès le départ
    setTimeout(() => {
        updateSnapshotDateConstraints(currentMonth);
    }, 100);
    
    // Gestionnaire de changement de mois
    monthInput.addEventListener('change', function() {
        selectedMonth = this.value;
        updateMonthDisplay(selectedMonth);
        updateDateFilters(selectedMonth);
        
        // Afficher un message informatif à l'utilisateur
        showNotification(`Contraintes de date mises à jour pour ${getMonthName(selectedMonth)}`, 'info');
    });
    
    // Gestionnaire du bouton de chargement
    loadButton.addEventListener('click', async function() {
        if (selectedMonth) {
            await loadMonthlyDashboard(selectedMonth);
        }
    });
}

// Mettre à jour les filtres de date avec le premier et dernier jour du mois
function updateDateFilters(monthYear) {
    const [year, month] = monthYear.split('-').map(Number);
    
    // CORRECTION: Utiliser le fuseau horaire local au lieu d'UTC pour éviter les décalages
    
    // Premier jour du mois
    const firstDayStr = `${year}-${month.toString().padStart(2, '0')}-01`;
    
    // Dernier jour du mois - calculer le nombre de jours dans le mois
    const lastDayOfMonth = new Date(year, month, 0).getDate();
    const lastDayStr = `${year}-${month.toString().padStart(2, '0')}-${lastDayOfMonth.toString().padStart(2, '0')}`;
    
    // Mettre à jour les champs de filtres de date
    const dashboardStartDate = document.getElementById('dashboard-start-date');
    const dashboardEndDate = document.getElementById('dashboard-end-date');
    
    if (dashboardStartDate && dashboardEndDate) {
        dashboardStartDate.value = firstDayStr;
        
        // Vérifier si une date de snapshot existe pour maintenir la cohérence
        const snapshotDate = document.getElementById('snapshot-date')?.value;
        if (snapshotDate) {
            dashboardEndDate.value = snapshotDate;
            console.log(`📅 Filtres de date mis à jour pour ${monthYear}: ${firstDayStr} à ${snapshotDate} (cohérence snapshot)`);
        } else {
            dashboardEndDate.value = lastDayStr;
            console.log(`📅 Filtres de date mis à jour pour ${monthYear}: ${firstDayStr} à ${lastDayStr}`);
        }
    } else {
        console.error('❌ Éléments de date non trouvés:', { dashboardStartDate, dashboardEndDate });
    }
    
    // Mettre à jour les contraintes du champ snapshot-date
    updateSnapshotDateConstraints(monthYear);
}

// Mettre à jour les contraintes du champ snapshot-date selon le mois sélectionné
function updateSnapshotDateConstraints(monthYear = null) {
    const snapshotDateInput = document.getElementById('snapshot-date');
    if (!snapshotDateInput) return;
    
    // Utiliser le mois sélectionné ou le mois en cours
    const targetMonth = monthYear || selectedMonth || getCurrentMonth();
    const [year, month] = targetMonth.split('-').map(Number);
    
    // Premier jour du mois
    const firstDayStr = `${year}-${month.toString().padStart(2, '0')}-01`;
    
    // Dernier jour du mois - calculer le nombre de jours dans le mois
    const lastDayOfMonth = new Date(year, month, 0).getDate();
    const lastDayStr = `${year}-${month.toString().padStart(2, '0')}-${lastDayOfMonth.toString().padStart(2, '0')}`;
    
    // Date d'aujourd'hui pour empêcher les dates futures
    const today = new Date().toISOString().split('T')[0];
    
    // Contraindre entre le premier jour du mois et aujourd'hui (le plus restrictif)
    snapshotDateInput.min = firstDayStr;
    snapshotDateInput.max = today < lastDayStr ? today : lastDayStr;
    
    console.log(`📅 Contraintes snapshot-date mises à jour pour ${targetMonth}: min=${snapshotDateInput.min}, max=${snapshotDateInput.max}`);
    
    // Si la date actuelle est en dehors des contraintes, la corriger
    const currentValue = snapshotDateInput.value;
    if (currentValue) {
        if (currentValue < snapshotDateInput.min) {
            snapshotDateInput.value = snapshotDateInput.min;
            console.log(`📅 Date corrigée: ${currentValue} -> ${snapshotDateInput.min} (trop ancienne)`);
        } else if (currentValue > snapshotDateInput.max) {
            snapshotDateInput.value = snapshotDateInput.max;
            console.log(`📅 Date corrigée: ${currentValue} -> ${snapshotDateInput.max} (trop récente)`);
        }
    }
}

// Mettre à jour l'affichage du mois sélectionné
function updateMonthDisplay(monthYear) {
    const monthDisplay = document.getElementById('current-month-display');
    if (!monthDisplay) return;
    
    const [year, month] = monthYear.split('-');
    const monthName = new Date(year, month - 1).toLocaleDateString('fr-FR', { 
        month: 'long', 
        year: 'numeric' 
    });
    
    monthDisplay.textContent = `Données pour ${monthName}`;
}

// Charger le dashboard pour un mois spécifique
async function loadMonthlyDashboard(monthYear) {
    try {
        //showNotification('Chargement des données du mois...', 'info');
        
        // Mettre à jour les filtres de date avec le mois sélectionné
        updateDateFilters(monthYear);
        
        // Charger d'abord les données actuelles (soldes, etc.)
        // loadDashboardData() appelle déjà updateStatsCards avec les dates des filtres
        await loadDashboardData();
        
        // Puis charger SEULEMENT les données mensuelles spécifiques
        await loadMonthlySpecificData(monthYear);
        
        // Récupérer les dates des filtres pour le stock mata
        const dashboardStartDate = document.getElementById('dashboard-start-date')?.value;
        const dashboardEndDate = document.getElementById('dashboard-end-date')?.value;
        
        await loadStockSummary(dashboardStartDate, dashboardEndDate);
        await loadStockVivantTotal(); 
        await loadMonthlyCreances(monthYear);
        await loadMonthlyCreancesMois(monthYear);
        await loadMonthlyCashBictorys(monthYear);
        await loadStockVivantVariation(dashboardStartDate, dashboardEndDate); // Ajouter pour le mensuel
        await loadTransfersCard();
        
        // showNotification(`Données chargées pour ${getMonthName(monthYear)}`, 'success');
    } catch (error) {
        console.error('Erreur lors du chargement mensuel:', error);
        showNotification('Erreur lors du chargement des données mensuelles', 'error');
    }
}

// Fonction principale pour charger le dashboard (par défaut mois en cours)
async function loadDashboard() {
    try {
        // Initialiser le sélecteur si pas encore fait
        if (!selectedMonth) {
            initMonthSelector();
        }
        
        // Initialiser les listeners pour les champs de date du dashboard
        initDashboardDateListeners();
        
        // Charger les données du mois sélectionné ou mois en cours
        const currentMonth = selectedMonth || getCurrentMonth();
        await loadMonthlyDashboard(currentMonth);
    } catch (error) {
        console.error('Erreur lors du chargement du dashboard:', error);
        showAlert('Erreur lors du chargement du dashboard', 'danger');
    }
}

// Obtenir le mois en cours au format YYYY-MM
function getCurrentMonth() {
    const currentDate = new Date();
    return `${currentDate.getFullYear()}-${(currentDate.getMonth() + 1).toString().padStart(2, '0')}`;
}

// Obtenir le nom du mois formaté
function getMonthName(monthYear) {
    const [year, month] = monthYear.split('-');
    return new Date(year, month - 1).toLocaleDateString('fr-FR', { 
        month: 'long', 
        year: 'numeric' 
    });
}

// === MODULE DE CREDIT POUR DIRECTEURS ===

// Initialiser le module de crédit pour directeurs
async function initDirectorCreditModule() {
    const creditMenu = document.getElementById('credit-menu');
    if (!creditMenu) return;
    
    // Vérifier si l'utilisateur a des permissions de crédit
    if (currentUser && currentUser.role === 'directeur') {
        try {
            const response = await fetch('/api/director/crediteable-accounts');
            const accounts = await response.json();
            
            if (accounts.length > 0) {
                // Le directeur a des permissions, afficher le menu
                creditMenu.style.display = '';
                
                // Configurer le gestionnaire de navigation
                const navLink = creditMenu.querySelector('a');
                if (navLink) {
                    navLink.addEventListener('click', function(e) {
                        e.preventDefault();
                        showSection('credit-account');
                        loadDirectorCreditData();
                    });
                }
                
                // Initialiser le formulaire
                setupDirectorCreditForm();
            } else {
                // Pas de permissions, masquer le menu
                creditMenu.style.display = 'none';
            }
        } catch (error) {
            console.error('Erreur vérification permissions crédit:', error);
            creditMenu.style.display = 'none';
        }
    } else if (currentUser && (currentUser.role === 'directeur_general' || currentUser.role === 'pca' || currentUser.role === 'admin')) {
        // DG/PCA/Admin voient toujours le menu
        creditMenu.style.display = '';
        
        const navLink = creditMenu.querySelector('a');
        if (navLink) {
            navLink.addEventListener('click', function(e) {
                e.preventDefault();
                showSection('credit-account');
                loadDirectorCreditData();
            });
        }
        
        setupDirectorCreditForm();
    } else {
        creditMenu.style.display = 'none';
    }
}

// Charger les données pour le module de crédit directeur
async function loadDirectorCreditData() {
    await loadDirectorCreditableAccounts();
    await loadDirectorCreditHistory();
    
    // Initialiser la date du jour
    const dateInput = document.getElementById('director-credit-date');
    if (dateInput) {
        dateInput.value = new Date().toISOString().split('T')[0];
    }
}

// Charger les comptes que le directeur peut créditer
async function loadDirectorCreditableAccounts() {
    try {
        const response = await fetch('/api/director/crediteable-accounts');
        const accounts = await response.json();
        
        const accountSelect = document.getElementById('director-credit-account');
        if (!accountSelect) return;
        
        accountSelect.innerHTML = '<option value="">Sélectionner un compte</option>';
        
        accounts.forEach(account => {
            const option = document.createElement('option');
            option.value = account.id;
            
            const typeBadge = account.account_type.charAt(0).toUpperCase() + account.account_type.slice(1);
            const balance = parseInt(account.current_balance).toLocaleString('fr-FR');
            
            option.textContent = `${account.account_name} [${typeBadge}] (${balance} FCFA)`;
            option.dataset.accountType = account.account_type;
            option.dataset.balance = account.current_balance;
            
            accountSelect.appendChild(option);
        });
        
        // Gestionnaire de changement de compte
        accountSelect.addEventListener('change', function() {
            const helpText = document.getElementById('director-credit-help');
            const amountHelp = document.getElementById('director-amount-help');
            const amountInput = document.getElementById('director-credit-amount');
            const selectedOption = this.options[this.selectedIndex];
            
            if (selectedOption.value) {
                const accountType = selectedOption.dataset.accountType;
                const balance = parseInt(selectedOption.dataset.balance).toLocaleString('fr-FR');
                
                let helpMessage = `Solde actuel: ${balance} FCFA`;
                
                if (accountType === 'statut') {
                    helpMessage += ' - ⚠️ Le crédit écrasera le solde existant';
                    // Autoriser les montants négatifs pour les comptes statut
                    amountInput.removeAttribute('min');
                    amountHelp.style.display = 'block';
                } else {
                    // Autoriser les montants négatifs pour tous les types de comptes
                    amountInput.removeAttribute('min');
                    amountHelp.style.display = 'none';
                }
                
                helpText.textContent = helpMessage;
                helpText.style.display = 'block';
            } else {
                helpText.style.display = 'none';
                amountHelp.style.display = 'none';
                // Autoriser les montants négatifs par défaut
                amountInput.removeAttribute('min');
            }
        });
        
        console.log(`Chargé ${accounts.length} comptes créditables pour ${currentUser.username}`);
        
    } catch (error) {
        console.error('Erreur chargement comptes créditables:', error);
        showNotification('Erreur lors du chargement des comptes', 'error');
    }
}

// Charger l'historique des crédits du directeur
async function loadDirectorCreditHistory() {
    try {
        const response = await fetch('/api/director/credit-history');
        const history = await response.json();
        
        const tbody = document.getElementById('director-credit-history-tbody');
        if (!tbody) return;
        
        tbody.innerHTML = '';
        
        if (history.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #666;">Aucun crédit effectué</td></tr>';
            return;
        }
        
        history.forEach(credit => {
            const row = document.createElement('tr');
            
            // Générer le bouton de suppression selon les permissions
            const deleteButton = generateDirectorCreditDeleteButton(credit);
            
            row.innerHTML = `
                <td>${formatDate(credit.credit_date)}</td>
                <td>${credit.account_name}</td>
                <td><strong>${formatCurrency(credit.amount)}</strong></td>
                <td>${credit.comment || '-'}</td>
                <td style="text-align: center;">${deleteButton}</td>
            `;
            tbody.appendChild(row);
        });
        
    } catch (error) {
        console.error('Erreur chargement historique crédit:', error);
    }
}

// Fonction pour générer le bouton de suppression d'un crédit de directeur
function generateDirectorCreditDeleteButton(credit) {
    let deleteButton = '';
    
    // Vérifier les permissions
    const canDelete = canDeleteDirectorCredit(credit);
    
    if (canDelete.allowed) {
        if (canDelete.timeWarning) {
            // Avertissement - proche de la limite de 24h pour les directeurs
            deleteButton = `<button class="btn btn-sm btn-danger" onclick="deleteDirectorCredit(${credit.id})" title="${canDelete.timeWarning}">
                <i class="fas fa-trash" style="color: #fbbf24;"></i>
            </button>`;
        } else {
            // Suppression normale
            deleteButton = `<button class="btn btn-sm btn-danger" onclick="deleteDirectorCredit(${credit.id})" title="Supprimer ce crédit">
                <i class="fas fa-trash"></i>
            </button>`;
        }
    } else {
        // Pas autorisé
        deleteButton = `<span style="color: #dc3545;" title="${canDelete.reason}"><i class="fas fa-lock"></i></span>`;
    }
    
    return deleteButton;
}

// Fonction pour vérifier si un crédit de directeur peut être supprimé
function canDeleteDirectorCredit(credit) {
    // Admin, DG, PCA peuvent toujours supprimer
    if (['admin', 'directeur_general', 'pca'].includes(currentUser.role)) {
        return { allowed: true };
    }
    
    // Directeurs simples : vérifier s'ils ont créé ce crédit ET dans les 24h
    if (currentUser.role === 'directeur') {
        // Vérifier si c'est le directeur qui a créé ce crédit
        if (credit.credited_by !== currentUser.id) {
            return {
                allowed: false,
                reason: 'Vous ne pouvez supprimer que vos propres crédits'
            };
        }
        
        // Vérifier les 24h
        const creditDate = new Date(credit.created_at || credit.credit_date);
        const now = new Date();
        const hoursDifference = (now - creditDate) / (1000 * 60 * 60);
        
        if (hoursDifference > 24) {
            return {
                allowed: false,
                reason: `Suppression non autorisée - Plus de 24 heures écoulées (${Math.floor(hoursDifference)}h)`
            };
        }
        
        const remainingHours = 24 - hoursDifference;
        if (remainingHours <= 12) {
            return {
                allowed: true,
                timeWarning: `⚠️ Il reste ${Math.floor(remainingHours)}h${Math.floor((remainingHours % 1) * 60)}min pour supprimer`
            };
        }
        
        return { allowed: true };
    }
    
    return {
        allowed: false,
        reason: 'Suppression non autorisée pour votre rôle'
    };
}

// Fonction pour supprimer un crédit de directeur
async function deleteDirectorCredit(creditId) {
    // Demander confirmation
    const confirmMessage = 'Êtes-vous sûr de vouloir supprimer ce crédit ?\n\nCette action est irréversible et affectera le solde du compte.';
    
    if (!confirm(confirmMessage)) {
        return;
    }
    
    try {
        const response = await fetch(`/api/director/credit-history/${creditId}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            showDirectorCreditNotification('Crédit supprimé avec succès !', 'success');
            // Recharger l'historique des crédits du directeur
            await loadDirectorCreditHistory();
            // Recharger les comptes créditables pour mettre à jour les soldes
            await loadDirectorCreditableAccounts();
            
            // Mettre à jour les autres interfaces si nécessaire
            if (typeof loadAccounts === 'function') {
                await loadAccounts();
            }
            
            if (typeof loadDashboard === 'function') {
                const dashboardSection = document.getElementById('dashboard-section');
                if (dashboardSection && dashboardSection.classList.contains('active')) {
                    await loadDashboard();
                }
            }
        } else {
            const error = await response.json();
            throw new Error(error.error);
        }
    } catch (error) {
        console.error('Erreur suppression crédit directeur:', error);
        showDirectorCreditNotification(`Erreur: ${error.message}`, 'error');
    }
}
// Configurer le formulaire de crédit directeur
function setupDirectorCreditForm() {
    const form = document.getElementById('directorCreditForm');
    if (!form || form.dataset.listenerAttached) return;
    
    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const accountId = document.getElementById('director-credit-account').value;
        const amount = document.getElementById('director-credit-amount').value;
        const creditDate = document.getElementById('director-credit-date').value;
        const comment = document.getElementById('director-credit-comment').value;
        
        if (!accountId || !amount || !creditDate) {
            showDirectorCreditNotification('Veuillez remplir les champs obligatoires (compte, montant, date)', 'error');
            return;
        }
        
        // Popup de confirmation
        const accountSelect = document.getElementById('director-credit-account');
        const selectedOption = accountSelect.options[accountSelect.selectedIndex];
        const accountName = selectedOption.textContent.split(' [')[0]; // Enlever le badge de type
        const formattedAmount = parseInt(amount).toLocaleString('fr-FR');
        
        const confirmMessage = `Êtes-vous sûr de vouloir créditer le compte "${accountName}" ?\n\nMontant: ${formattedAmount} FCFA\n\nCette action modifiera le solde du compte.`;
        
        if (!confirm(confirmMessage)) {
            return;
        }
        
        try {
            const response = await fetch(`/api/accounts/${accountId}/credit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    amount: parseInt(amount),
                    credit_date: creditDate,
                    description: comment
                })
            });
            
            const result = await response.json();
            
            if (response.ok) {
                showDirectorCreditNotification(result.message, 'success');
                
                // Réinitialiser le formulaire
                form.reset();
                document.getElementById('director-credit-date').value = new Date().toISOString().split('T')[0];
                document.getElementById('director-credit-help').style.display = 'none';
                
                // Recharger les données
                await loadDirectorCreditData();
                
                // Mettre à jour les autres interfaces si nécessaire
                if (typeof loadAccounts === 'function') {
                    await loadAccounts();
                }
                
                if (typeof loadDashboard === 'function') {
                    const dashboardSection = document.getElementById('dashboard-section');
                    if (dashboardSection && dashboardSection.classList.contains('active')) {
                        await loadDashboard();
                    }
                }
            } else {
                showDirectorCreditNotification(result.error || 'Erreur lors du crédit', 'error');
            }
            
        } catch (error) {
            console.error('Erreur crédit directeur:', error);
            showDirectorCreditNotification('Erreur de connexion', 'error');
        }
    });
    
    form.dataset.listenerAttached = 'true';
}

// Afficher une notification dans le module crédit directeur
function showDirectorCreditNotification(message, type = 'info') {
    const notification = document.getElementById('director-credit-notification');
    if (!notification) return;
    
    notification.textContent = message;
    notification.className = `notification ${type}`;
    notification.style.display = 'block';
    
    setTimeout(() => {
        notification.style.display = 'none';
    }, 5000);
}

// ... existing code ...

// Admin-only: Delete account with backup
async function deleteAccountAdmin(accountId) {
    if (!confirm('Êtes-vous sûr de vouloir SUPPRIMER DÉFINITIVEMENT ce compte ? Cette action est irréversible et une sauvegarde sera créée.')) {
        return;
    }
    try {
        const response = await fetch(`/api/admin/accounts/${accountId}/delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason: 'Suppression admin via interface' })
        });
        const result = await response.json();
        if (response.ok && result.success) {
            showNotification(result.message || 'Compte supprimé avec sauvegarde', 'success');
            await loadAccounts();
        } else {
            showNotification(result.message || 'Erreur lors de la suppression', 'error');
        }
    } catch (error) {
        showNotification('Erreur lors de la suppression du compte', 'error');
    }
}

// Admin-only: Reset (empty) account with backup
async function resetAccountAdmin(accountId) {
    if (!confirm('Êtes-vous sûr de vouloir VIDER ce compte ? Toutes les opérations seront supprimées, une sauvegarde sera créée.')) {
        return;
    }
    try {
        const response = await fetch(`/api/admin/accounts/${accountId}/empty`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason: 'Remise à zéro admin via interface' })
        });
        const result = await response.json();
        if (response.ok && result.success) {
            showNotification(result.message || 'Compte vidé avec sauvegarde', 'success');
            await loadAccounts();
        } else {
            showNotification(result.message || 'Erreur lors de la remise à zéro', 'error');
        }
    } catch (error) {
        showNotification('Erreur lors de la remise à zéro du compte', 'error');
    }
}

// =====================================================
// GESTION DES STOCKS
// =====================================================

let currentStockData = [];
let stockFilters = {
    date: '',
    pointDeVente: ''
};

// Variables pour le tri
let stockSortField = 'date';
let stockSortDirection = 'desc';

// Initialiser le module de gestion des stocks
async function initStockModule() {
    console.log('🏭 CLIENT: Initialisation du module de gestion des stocks');
    console.log('🏭 CLIENT: Vérification de la présence des éléments DOM...');
    
    // Vérifier les éléments critiques
    const stockSection = document.getElementById('stock-soir-section');
    const uploadForm = document.getElementById('stock-upload-form');
    const fileInput = document.getElementById('reconciliation-file');
    
    console.log("🏭 CLIENT: Section stock-soir:", stockSection ? '✅ Trouvée' : '❌ Manquante');
    console.log("🏭 CLIENT: Formulaire upload:", uploadForm ? '✅ Trouvé' : '❌ Manquant');
    console.log("🏭 CLIENT: Input fichier:", fileInput ? '✅ Trouvé' : '❌ Manquant');
    
    // Configure role-based visibility for delete by date button
    const deleteByDateBtn = document.getElementById('delete-by-date-btn');
    if (deleteByDateBtn) {
        if (['directeur_general', 'pca', 'admin'].includes(currentUser.role)) {
            deleteByDateBtn.style.display = 'inline-block';
            console.log('🔓 CLIENT: Bouton "Supprimer par Date" activé pour', currentUser.role);
        } else {
            deleteByDateBtn.style.display = 'none';
            console.log('🔒 CLIENT: Bouton "Supprimer par Date" masqué pour', currentUser.role);
        }
    }
    
    // Assurez-vous que les écouteurs ne sont pas ajoutés plusieurs fois
    if (uploadForm && !uploadForm.dataset.initialized) {
        console.log('🏭 CLIENT: Configuration des event listeners...');
        setupStockEventListeners();
        uploadForm.dataset.initialized = 'true';
        console.log('🏭 CLIENT: Event listeners configurés et marqués comme initialisés');
    } else if (uploadForm) {
        console.log('⚠️ CLIENT: Module déjà initialisé');
    }
    
    try {
        // Default to today's date to avoid loading the entire table
        const dateFilter = document.getElementById('stock-date-filter');
        if (dateFilter && !dateFilter.value) {
            const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
            dateFilter.value = today;
        }

        console.log('🏭 CLIENT: Chargement des données...');
        await loadStockData();
        
        console.log('🏭 CLIENT: Chargement des filtres...');
        await loadStockFilters();
        
        console.log('✅ CLIENT: Module de gestion des stocks initialisé avec succès');
    } catch (error) {
        console.error("❌ CLIENT: Erreur lors de l'initialisation:", error);
        console.error("❌ CLIENT: Stack trace:", error.stack);
    }
}

function setupStockEventListeners() {
    console.log('🔧 CLIENT: setupStockEventListeners appelé');
    
    // Formulaire d'upload
    const uploadForm = document.getElementById('stock-upload-form');
    console.log('🔧 CLIENT: Formulaire d\'upload trouvé:', uploadForm);
    console.log('🔧 CLIENT: Listener déjà attaché?', uploadForm?.dataset?.listenerAttached);
    
    if (uploadForm && !uploadForm.dataset.listenerAttached) {
        uploadForm.addEventListener('submit', handleStockUpload);
        uploadForm.dataset.listenerAttached = 'true';
        console.log('✅ CLIENT: Event listener attaché au formulaire d\'upload');
    } else if (uploadForm) {
        console.log('⚠️ CLIENT: Event listener déjà attaché au formulaire d\'upload');
    } else {
        console.error('❌ CLIENT: Formulaire d\'upload non trouvé!');
    }

    // Boutons de contrôle
    const filterBtn = document.getElementById('filter-stock');
    if (filterBtn && !filterBtn.dataset.listenerAttached) {
        filterBtn.addEventListener('click', () => loadStockData());
        filterBtn.dataset.listenerAttached = 'true';
    }

    // Re-fetch from server when date changes (date filtering is server-side)
    const dateFilter = document.getElementById('stock-date-filter');
    if (dateFilter && !dateFilter.dataset.listenerAttached) {
        dateFilter.addEventListener('change', () => {
            loadStockData();
        });
        dateFilter.dataset.listenerAttached = 'true';
    }

    // Re-fetch from server when point de vente changes (filtering is server-side)
    const pointFilter = document.getElementById('stock-point-filter');
    if (pointFilter && !pointFilter.dataset.listenerAttached) {
        pointFilter.addEventListener('change', () => {
            loadStockData();
        });
        pointFilter.dataset.listenerAttached = 'true';
    }

    const refreshBtn = document.getElementById('refresh-stock');
    if (refreshBtn && !refreshBtn.dataset.listenerAttached) {
        refreshBtn.addEventListener('click', () => {
            resetStockFilters();
            loadStockData();
        });
        refreshBtn.dataset.listenerAttached = 'true';
    }

    const addBtn = document.getElementById('add-stock-btn');
    if (addBtn && !addBtn.dataset.listenerAttached) {
        addBtn.addEventListener('click', () => openStockModal());
        addBtn.dataset.listenerAttached = 'true';
    }

    const statsBtn = document.getElementById('view-stats-btn');
    if (statsBtn && !statsBtn.dataset.listenerAttached) {
        statsBtn.addEventListener('click', toggleStockStats);
        statsBtn.dataset.listenerAttached = 'true';
    }

    // Formulaire de stock modal
    const stockForm = document.getElementById('stock-form');
    if (stockForm && !stockForm.dataset.listenerAttached) {
        stockForm.addEventListener('submit', handleStockFormSubmit);
        stockForm.dataset.listenerAttached = 'true';
    }

    // Note: La fonction calculateVenteTheorique a été supprimée car la colonne Vente Théorique n'est plus utilisée
}

async function loadStockFilters() {
    // Plus besoin de charger les dates puisqu'on utilise un calendrier
    // Le chargement des points de vente se fait dans `displayStockData`
    console.log('📅 Calendrier de dates initialisé (plus de dropdown à charger)');
}

async function loadStockData() {
    const pointFilter = document.getElementById('stock-point-filter').value;
    const dateFilterEl = document.getElementById('stock-date-filter');
    const dateFilter = dateFilterEl ? dateFilterEl.value : '';

    console.log('📅 Chargement des données stock...');
    console.log('📅 Date sélectionnée:', dateFilter || 'Toutes');
    console.log('📍 Point sélectionné:', pointFilter || 'Tous');

    let url = apiUrl('/api/stock-mata');
    const params = new URLSearchParams();

    // Filter by date on the server to avoid loading the entire table
    if (dateFilter) {
        params.append('date', dateFilter);
    }
    if (pointFilter) {
        console.log('📍 Filtrage par point:', pointFilter);
        params.append('point_de_vente', pointFilter);
    }

    if (params.toString()) {
        url += '?' + params.toString();
    }

    console.log('🌐 URL finale:', url);

    try {
        const response = await fetch(url, {
            credentials: 'same-origin'
        });
        if (!response.ok) {
            throw new Error(`Erreur HTTP: ${response.status}`);
        }
        const data = await response.json();
        
        console.log('📊 Données reçues:', data.length, 'enregistrements');
        
        window.currentStockData = data;
        displayStockData(data); // displayStockData appellera applyStockFilters
        updateStockPointFilter(data);
    } catch (error) {
        console.error('❌ Erreur lors du chargement des données de stock:', error);
        showStockNotification(`Erreur chargement des données: ${error.message}`, 'error');
    }
}

// Fonctions supprimées : loadStockDates() et updateStockDateFilter()
// Plus nécessaires depuis l'utilisation du calendrier HTML5

function updateStockPointFilter(data) {
    const pointFilter = document.getElementById('stock-point-filter');
    const currentPoint = pointFilter.value;
    const pointsDeVente = [...new Set(data.map(item => item.point_de_vente))];

    // Garder l'option "Tous les points"
    const firstOption = pointFilter.options[0];
    pointFilter.innerHTML = '';
    pointFilter.appendChild(firstOption);
    
    pointsDeVente.sort().forEach(point => {
        const option = document.createElement('option');
        option.value = point;
        option.textContent = point;
        pointFilter.appendChild(option);
    });
    pointFilter.value = currentPoint;
}

function displayStockData(data) {
    const tbody = document.getElementById('stock-tbody');
    if (!tbody) {
        console.error("L'élément 'stock-tbody' est introuvable !");
        return;
    }
    tbody.innerHTML = ''; // Vider le tableau
    
    if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">Aucune donnée de stock disponible.</td></tr>';
        updateStockTotal(0); // Afficher 0 quand pas de données
        return;
    }

    const filteredData = applyStockFilters(true);
    const dateFilter = document.getElementById('stock-date-filter');
    const isDateSelected = dateFilter && dateFilter.value;

    let totalStockSoir;
    let isLatestValue = false;

    if (isDateSelected) {
        // Si une date est sélectionnée : calculer le total de cette date
        totalStockSoir = filteredData.reduce((total, item) => {
            return total + parseFloat(item.stock_soir || 0);
        }, 0);
        isLatestValue = false;
    } else {
        // Si aucune date n'est sélectionnée : prendre la dernière valeur
        if (filteredData.length > 0) {
            // Trier par date décroissante et prendre la première
            const sortedData = filteredData.sort((a, b) => new Date(b.date) - new Date(a.date));
            totalStockSoir = parseFloat(sortedData[0].stock_soir || 0);
            isLatestValue = true;
        } else {
            totalStockSoir = 0;
            isLatestValue = false;
        }
    }

    // Afficher le total avec le bon contexte
    updateStockTotal(totalStockSoir, isLatestValue);

    filteredData.forEach(item => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${new Date(item.date).toLocaleDateString('fr-FR')}</td>
            <td>${item.point_de_vente}</td>
            <td>${item.produit}</td>
            <td>${parseFloat(item.stock_matin).toFixed(2)}</td>
            <td>${parseFloat(item.stock_soir).toFixed(2)}</td>
            <td>${parseFloat(item.transfert).toFixed(2)}</td>
            <td class="actions">
                <button class="edit-btn" onclick="editStockItem(${item.id})">Modifier</button>
                <button class="delete-btn" onclick="deleteStockItem(${item.id})">Supprimer</button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function sortStockData(data) {
    // Logique de tri à implémenter
    return data;
}

function exportStockToExcel() {
    const data = applyStockFilters(true);
    if (!data || data.length === 0) {
        showStockNotification('Aucune donnée à exporter.', 'warning');
        return;
    }

    // Construire les lignes avec en-têtes lisibles
    const rows = data.map(item => ({
        'Date': new Date(item.date).toLocaleDateString('fr-FR'),
        'Point de Vente': item.point_de_vente,
        'Produit': item.produit,
        'Stock Matin (FCFA)': parseFloat(item.stock_matin || 0),
        'Stock Soir (FCFA)': parseFloat(item.stock_soir || 0),
        'Transfert (FCFA)': parseFloat(item.transfert || 0)
    }));

    // Ajouter une ligne de total en bas
    const totalSoir = data.reduce((s, i) => s + parseFloat(i.stock_soir || 0), 0);
    const totalMatin = data.reduce((s, i) => s + parseFloat(i.stock_matin || 0), 0);
    const totalTransfert = data.reduce((s, i) => s + parseFloat(i.transfert || 0), 0);
    rows.push({
        'Date': '',
        'Point de Vente': '',
        'Produit': 'TOTAL',
        'Stock Matin (FCFA)': totalMatin,
        'Stock Soir (FCFA)': totalSoir,
        'Transfert (FCFA)': totalTransfert
    });

    const ws = XLSX.utils.json_to_sheet(rows);

    // Largeurs de colonnes
    ws['!cols'] = [
        { wch: 12 }, // Date
        { wch: 18 }, // Point de vente
        { wch: 22 }, // Produit
        { wch: 20 }, // Stock Matin
        { wch: 20 }, // Stock Soir
        { wch: 20 }  // Transfert
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Stock Soir');

    // Nom du fichier avec la date filtrée si disponible
    const dateFilter = document.getElementById('stock-date-filter')?.value;
    const pointFilter = document.getElementById('stock-point-filter')?.value;
    const fileParts = ['Stock_Soir'];
    if (dateFilter) fileParts.push(dateFilter);
    if (pointFilter) fileParts.push(pointFilter.replace(/\s+/g, '_'));
    fileParts.push(new Date().toISOString().slice(0, 10));
    const fileName = fileParts.join('_') + '.xlsx';

    XLSX.writeFile(wb, fileName);
    showStockNotification(`Export Excel téléchargé : ${fileName}`, 'success');
}

// Fonction pour mettre à jour l'affichage du total des stocks soir
function updateStockTotal(total, isLatestValue = false) {
    const totalDisplay = document.getElementById('stock-total-display');
    const totalAmount = document.getElementById('stock-total-amount');
    const totalTitle = document.querySelector('#stock-total-display h4');
    
    if (totalDisplay && totalAmount && totalTitle) {
        // Formater le total avec des espaces pour les milliers
        const formattedTotal = total.toLocaleString('fr-FR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
        
        totalAmount.textContent = `${formattedTotal} FCFA`;
        
        // Mettre à jour le titre selon le contexte
        if (isLatestValue) {
            totalTitle.innerHTML = '<i class="fas fa-clock"></i> Dernière Valeur Stock Soir';
        } else {
            totalTitle.innerHTML = '<i class="fas fa-calculator"></i> Total Stock Soir';
        }
        
        // Afficher le total seulement s'il y a des données
        if (total > 0) {
            totalDisplay.style.display = 'block';
        } else {
            totalDisplay.style.display = 'none';
        }
    }
}

function applyStockFilters(calledFromDisplay = false) {
    // Filtering is now done server-side in loadStockData().
    // This function just returns the already-fetched data.
    const filteredData = window.currentStockData || [];

    if (!calledFromDisplay) {
        displayStockData(filteredData);
    }
    
    return filteredData;
}

function resetStockFilters() {
    const today = new Date().toLocaleDateString('en-CA');
    document.getElementById('stock-date-filter').value = today;
    document.getElementById('stock-point-filter').value = '';
    loadStockData();
}

async function handleStockUpload(e) {
    console.log('🚀 CLIENT: handleStockUpload appelé');
    console.log('🚀 CLIENT: Event object:', e);
    
    e.preventDefault();
    console.log('🚀 CLIENT: preventDefault() appelé');
    
    const fileInput = document.getElementById('reconciliation-file');
    console.log('🚀 CLIENT: FileInput trouvé:', fileInput);
    
    const file = fileInput ? fileInput.files[0] : null;
    console.log('🚀 CLIENT: Fichier sélectionné:', file);
    
    if (!file) {
        console.log('❌ CLIENT: Aucun fichier sélectionné');
        showStockNotification('Veuillez sélectionner un fichier.', 'error');
        return;
    }

    console.log('📁 CLIENT: Détails du fichier:');
    console.log('  - Nom:', file.name);
    console.log('  - Taille:', file.size, 'bytes');
    console.log('  - Type:', file.type);
    console.log('  - Dernière modification:', new Date(file.lastModified));

    const formData = new FormData();
    formData.append('reconciliation', file);
    console.log('📦 CLIENT: FormData créé avec le fichier');

    const uploadButton = e.target.querySelector('button[type="submit"]');
    console.log('🔘 CLIENT: Bouton d\'upload trouvé:', uploadButton);
    
    const originalButtonText = uploadButton ? uploadButton.innerHTML : '';
    if (uploadButton) {
        uploadButton.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Importation...';
        uploadButton.disabled = true;
        console.log('🔘 CLIENT: Bouton désactivé et spinner affiché');
    }

    try {
        console.log('🌐 CLIENT: Début de la requête fetch vers', apiUrl('/api/stock-mata/upload'));
        console.log('🌐 CLIENT: Environment:', SERVER_CONFIG.environment);
        
        const response = await fetch(apiUrl('/api/stock-mata/upload'), {
            method: 'POST',
            body: formData,
            credentials: 'same-origin'
        });

        console.log('📡 CLIENT: Réponse reçue du serveur:');
        console.log('  - Status:', response.status);
        console.log('  - StatusText:', response.statusText);
        console.log('  - Headers:', Object.fromEntries(response.headers.entries()));

        const result = await response.json();
        console.log('📄 CLIENT: Contenu de la réponse JSON:', result);

        if (response.ok) {
            console.log('✅ CLIENT: Upload réussi');
            showStockNotification(result.message || 'Importation réussie!', 'success');
            
            console.log('🔄 CLIENT: Rechargement immédiat des données...');
            // Réinitialiser le champ de fichier immédiatement
            fileInput.value = '';
            
            // Recharger les données et filtres
            await Promise.all([
                loadStockData(),
                loadStockSummary(document.getElementById('dashboard-start-date')?.value, document.getElementById('dashboard-end-date')?.value) // Actualiser la carte du dashboard
            ]);
            
            console.log('🔄 CLIENT: Données rechargées avec succès');
            showStockNotification(`Import terminé: ${result.totalRecords || 0} enregistrements traités`, 'success');
        } else {
            console.log('❌ CLIENT: Erreur HTTP:', response.status, result);
            // Utiliser le message d'erreur du serveur s'il existe
            throw new Error(result.error || 'Une erreur est survenue lors de l\'importation.');
        }
    } catch (error) {
        console.error('💥 CLIENT: Erreur lors de l\'upload:', error);
        console.error('💥 CLIENT: Stack trace:', error.stack);
        showStockNotification(error.message, 'error');
    } finally {
        if (uploadButton) {
            uploadButton.innerHTML = originalButtonText;
            uploadButton.disabled = false;
            console.log('🔘 CLIENT: Bouton réactivé');
        }
        console.log('🏁 CLIENT: handleStockUpload terminé');
    }
}

async function forceStockUpload(file) {
    // Cette fonction pourrait être utilisée pour un drag-and-drop, non implémenté pour l'instant
    console.log("Upload forcé demandé pour:", file.name);
}

function openStockModal(stockId = null) {
    const modal = document.getElementById('stock-modal');
    if (!modal) {
        console.error("L'élément 'stock-modal' est introuvable !");
        return;
    }

    modal.style.display = 'block';

    if (stockId) {
        document.getElementById('stock-modal-title').textContent = 'Modifier une entrée';
        loadStockItemForEdit(stockId);
    } else {
        document.getElementById('stock-modal-title').textContent = 'Ajouter une entrée';
        document.getElementById('stock-form').reset();
        document.getElementById('stock-id').value = '';
        
        // Set today's date as default
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('stock-date').value = today;
    }
    
    // Initialize automatic calculation when modal opens
    setTimeout(() => {
        initializeStockCalculation();
        calculateVenteTheorique(); // Calculate initial value
    }, 100);
}

function closeStockModal() {
    const modal = document.getElementById('stock-modal');
    modal.style.display = 'none';
}

async function loadStockItemForEdit(stockId) {
    try {
        const response = await fetch(`/api/stock-mata/${stockId}`, {
            credentials: 'same-origin'
        });
        if (!response.ok) {
            throw new Error('Impossible de charger les données de l\'entrée.');
        }
        const item = await response.json();
        document.getElementById('stock-id').value = item.id;
        document.getElementById('stock-date').value = new Date(item.date).toISOString().split('T')[0];
        document.getElementById('stock-point-vente').value = item.point_de_vente;
        document.getElementById('stock-produit').value = item.produit;
        document.getElementById('stock-matin').value = item.stock_matin;
        document.getElementById('stock-soir').value = item.stock_soir;
        document.getElementById('stock-transfert').value = item.transfert;
        
        // Calculate theoretical sales after loading data
        setTimeout(() => {
            calculateVenteTheorique();
        }, 50);
    } catch (error) {
        showStockNotification(error.message, 'error');
    }
}

async function handleStockFormSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const formData = new FormData(form);
    const id = document.getElementById('stock-id').value;
    const url = id ? `/api/stock-mata/${id}` : '/api/stock-mata';
    const method = id ? 'PUT' : 'POST';

    try {
        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(Object.fromEntries(formData)),
            credentials: 'same-origin'
        });

        if (response.ok) {
            showStockNotification(`Entrée ${id ? 'mise à jour' : 'ajoutée'} avec succès!`, 'success');
            closeStockModal();
            await loadStockData();
        } else {
            const result = await response.json();
            throw new Error(result.error || `Erreur lors de ${id ? 'la mise à jour' : 'l\'ajout'}`);
        }
    } catch (error) {
        showStockNotification(error.message, 'error');
    }
}

function editStockItem(stockId) {
    openStockModal(stockId);
}

async function deleteStockItem(stockId) {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cette entrée ?')) {
        return;
    }
    try {
        const response = await fetch(`/api/stock-mata/${stockId}`, { 
            method: 'DELETE',
            credentials: 'same-origin'
        });
        if (response.ok) {
            showStockNotification('Entrée supprimée avec succès.', 'success');
            await loadStockData();
        } else {
            const result = await response.json();
            throw new Error(result.error || 'Erreur lors de la suppression.');
        }
    } catch (error) {
        showStockNotification(error.message, 'error');
    }
}

// ============================================
// DELETE BY DATE FUNCTIONALITY
// ============================================

function openDeleteByDateModal() {
    const modal = document.getElementById('delete-by-date-modal');
    if (!modal) {
        console.error("L'élément 'delete-by-date-modal' est introuvable !");
        return;
    }
    
    // Reset form
    document.getElementById('delete-stock-date').value = '';
    document.getElementById('delete-stock-preview').style.display = 'none';
    document.getElementById('confirm-delete-by-date-btn').disabled = true;
    
    modal.style.display = 'block';
}

function closeDeleteByDateModal() {
    const modal = document.getElementById('delete-by-date-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

async function previewDeleteByDate() {
    const dateInput = document.getElementById('delete-stock-date');
    const date = dateInput.value;
    
    if (!date) {
        showStockNotification('Veuillez sélectionner une date', 'error');
        return;
    }
    
    try {
        // Fetch stock data for this date to preview
        const response = await fetch(`/api/stock-mata?date=${date}`, {
            credentials: 'same-origin'
        });
        if (!response.ok) {
            throw new Error('Erreur lors de la récupération des données');
        }
        
        const data = await response.json();
        
        if (data.length === 0) {
            showStockNotification('Aucune entrée trouvée pour cette date', 'warning');
            document.getElementById('delete-stock-preview').style.display = 'none';
            document.getElementById('confirm-delete-by-date-btn').disabled = true;
            return;
        }
        
        // Get unique points of sale
        const pointsDeVente = [...new Set(data.map(item => item.point_de_vente))];
        
        // Update preview
        document.getElementById('delete-preview-date').textContent = date;
        document.getElementById('delete-preview-count').textContent = data.length;
        document.getElementById('delete-preview-points').textContent = pointsDeVente.join(', ');
        
        // Show preview and enable delete button
        document.getElementById('delete-stock-preview').style.display = 'block';
        document.getElementById('confirm-delete-by-date-btn').disabled = false;
        
        showStockNotification(`${data.length} entrée(s) trouvée(s) pour cette date`, 'info');
        
    } catch (error) {
        console.error('Erreur lors de la prévisualisation:', error);
        showStockNotification(error.message, 'error');
    }
}

async function confirmDeleteByDate() {
    const dateInput = document.getElementById('delete-stock-date');
    const date = dateInput.value;
    
    if (!date) {
        showStockNotification('Veuillez sélectionner une date', 'error');
        return;
    }
    
    // Final confirmation
    const confirmMsg = `ATTENTION : Vous êtes sur le point de supprimer TOUTES les entrées de stock pour la date ${date}.\n\nCette action est IRRÉVERSIBLE.\n\nÊtes-vous absolument certain de vouloir continuer ?`;
    
    if (!confirm(confirmMsg)) {
        return;
    }
    
    try {
        const deleteBtn = document.getElementById('confirm-delete-by-date-btn');
        deleteBtn.disabled = true;
        deleteBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Suppression...';
        
        const response = await fetch(`/api/stock-mata/delete-by-date/${date}`, {
            method: 'DELETE',
            credentials: 'same-origin'
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showStockNotification(
                `✅ ${result.count} entrée(s) supprimée(s) avec succès pour la date ${date}`,
                'success'
            );
            
            // Close modal
            closeDeleteByDateModal();
            
            // Reload stock data
            await loadStockData();
            
            // Reload dashboard summary if visible
            const dashboardStartDate = document.getElementById('dashboard-start-date')?.value;
            const dashboardEndDate = document.getElementById('dashboard-end-date')?.value;
            if (dashboardStartDate && dashboardEndDate) {
                await loadStockSummary(dashboardStartDate, dashboardEndDate);
            }
            
        } else {
            throw new Error(result.error || 'Erreur lors de la suppression');
        }
        
    } catch (error) {
        console.error('Erreur lors de la suppression par date:', error);
        showStockNotification(`❌ ${error.message}`, 'error');
    } finally {
        // Reset button
        const deleteBtn = document.getElementById('confirm-delete-by-date-btn');
        if (deleteBtn) {
            deleteBtn.disabled = false;
            deleteBtn.innerHTML = '<i class="fas fa-trash-alt"></i> Supprimer Définitivement';
        }
    }
}

// Function to calculate theoretical sales automatically
function calculateVenteTheorique() {
    const stockMatin = parseFloat(document.getElementById('stock-matin').value) || 0;
    const stockSoir = parseFloat(document.getElementById('stock-soir').value) || 0;
    const transfert = parseFloat(document.getElementById('stock-transfert').value) || 0;
    
    // Formula: Stock Matin - Stock Soir + Transfert
    const venteTheorique = stockMatin - stockSoir + transfert;
    
    const venteTheoriqueField = document.getElementById('stock-vente-theorique');
    if (venteTheoriqueField) {
        venteTheoriqueField.value = venteTheorique.toFixed(2);
    }
}

// Add event listeners for automatic calculation
function initializeStockCalculation() {
    const stockMatin = document.getElementById('stock-matin');
    const stockSoir = document.getElementById('stock-soir');
    const stockTransfert = document.getElementById('stock-transfert');
    
    if (stockMatin) stockMatin.addEventListener('input', calculateVenteTheorique);
    if (stockSoir) stockSoir.addEventListener('input', calculateVenteTheorique);
    if (stockTransfert) stockTransfert.addEventListener('input', calculateVenteTheorique);
}

async function toggleStockStats() {
    const statsContainer = document.getElementById('stock-stats-container');
    if (statsContainer.style.display === 'none' || statsContainer.innerHTML.trim() === '') {
        await loadStockStatistics();
        statsContainer.style.display = 'block';
    } else {
        statsContainer.style.display = 'none';
    }
}

async function loadStockStatistics() {
    const container = document.getElementById('stock-stats-container');
    try {
        const response = await fetch('/api/stock-mata/stats', {
            credentials: 'same-origin'
        }); // Note: L'API pour cela n'est pas encore définie
        if (!response.ok) throw new Error('Statistiques non disponibles');
        const stats = await response.json();
        displayStockStatistics(stats);
    } catch (error) {
        console.error("Erreur chargement stats:", error);
        container.innerHTML = `<p class="text-error">${error.message}</p>`;
    }
}

function displayStockStatistics(stats) {
    const container = document.getElementById('stock-stats-container');
    // Logique d'affichage des statistiques
    container.innerHTML = `<pre>${JSON.stringify(stats, null, 2)}</pre>`;
}

function showStockNotification(message, type = 'info') {
    // Use the main notification system instead of a separate one
    showNotification(message, type);
}

// =====================================================
// STOCK VIVANT MODULE
// =====================================================

let currentStockVivantData = null;

async function getLastStockVivantDate() {
    try {
        // 1. Récupérer toutes les dates disponibles
        const response = await fetch(apiUrl('/api/stock-vivant/dates'));
        if (!response.ok) {
            throw new Error('Erreur lors du chargement des dates');
        }
        
        const dates = await response.json();
        if (!dates || dates.length === 0) {
            return null;
        }
        
        // 2. Trier les dates par ordre décroissant
        const sortedDates = dates.sort((a, b) => new Date(b.date) - new Date(a.date));
        
        // 3. Vérifier chaque date en commençant par la plus récente
        for (const dateObj of sortedDates) {
            const dataResponse = await fetch(apiUrl(`/api/stock-vivant?date=${dateObj.date}`));
            if (!dataResponse.ok) continue;
            
            const stockData = await dataResponse.json();
            if (stockData && stockData.length > 0) {
                // Retourner la première date qui a des données
                return dateObj.date;
            }
        }
        
        return null; // Aucune date n'a de données
    } catch (error) {
        console.error('Erreur lors de la récupération de la dernière date:', error);
        return null;
    }
}
async function initStockVivantModule() {
    try {
        // 1. Charger la configuration depuis l'API
        const response = await fetch(apiUrl('/api/stock-vivant/config'));
        
        if (!response.ok) {
            throw new Error(`Erreur API: ${response.status} - ${response.statusText}`);
        }
        
        // 2. Parser la configuration JSON et l'assigner
        const config = await response.json();
        stockVivantConfig = config;

        // 3. Initialize modern Stock Vivant interface
        await initializeModernStockVivant();
        
        // 4. Show default mode after config is loaded
        await showStockMode('saisie');
        
        // 5. Charger la dernière date disponible
        const lastDate = await getLastStockVivantDate();
        if (lastDate) {
            const dateInput = document.getElementById('stock-vivant-date');
            if (dateInput) {
                dateInput.value = lastDate;
                console.log('📅 CLIENT: Dernière date chargée:', lastDate);
            }
        }
        
        // 6. Rendre le menu visible
        const stockVivantMenu = document.getElementById('stock-vivant-menu');
        if (stockVivantMenu) {
            stockVivantMenu.style.display = 'block';
        }
        
        return true; // Indiquer le succès

    } catch (error) {
        console.error('❌ Erreur lors de l\'initialisation du module Stock Vivant:', error);
        showNotification('Erreur chargement Stock Vivant. Vérifiez la console.', 'error');
        throw error; // Propager l'erreur
    }
}

function editStockVivantConfig() {
    const configContent = document.getElementById('config-content');
    const configEditor = document.getElementById('config-editor');
    
    configEditor.value = JSON.stringify(stockVivantConfig, null, 2);
    configEditor.readOnly = false;
    configContent.style.display = 'block';
    
    document.getElementById('save-config-btn').style.display = 'inline-block';
    document.getElementById('cancel-config-btn').style.display = 'inline-block';
}

async function saveStockVivantConfig() {
    try {
        const configEditor = document.getElementById('config-editor');
        const newConfig = JSON.parse(configEditor.value);
        
        const response = await fetch(apiUrl('/api/stock-vivant/config'), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newConfig)
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Erreur lors de la sauvegarde');
        }
        
        stockVivantConfig = newConfig;
        showStockVivantNotification('Configuration mise à jour avec succès', 'success');
        cancelEditConfig();
        
    } catch (error) {
        console.error('Erreur sauvegarde config:', error);
        showStockVivantNotification('Erreur: ' + error.message, 'error');
    }
}

function cancelEditConfig() {
    const configContent = document.getElementById('config-content');
    configContent.style.display = 'none';
}

async function loadStockVivantDirectors() {
    try {
        const response = await fetch(apiUrl('/api/stock-vivant/available-directors'));
        if (!response.ok) throw new Error('Erreur chargement directeurs');
        
        const directors = await response.json();
        const directorSelect = document.getElementById('director-select');
        
        directorSelect.innerHTML = '<option value="">Sélectionner un directeur</option>';
        directors.forEach(director => {
            if (!director.has_permission) {
                const option = document.createElement('option');
                option.value = director.id;
                option.textContent = director.full_name;
                directorSelect.appendChild(option);
            }
        });
        
        loadStockVivantPermissions();
        
    } catch (error) {
        console.error('Erreur chargement directeurs:', error);
    }
}

async function loadStockVivantPermissions() {
    try {
        const response = await fetch(apiUrl('/api/stock-vivant/permissions'));
        if (!response.ok) throw new Error('Erreur chargement permissions');
        
        const permissions = await response.json();
        const permissionsList = document.getElementById('permissions-list');
        
        if (permissions.length === 0) {
            permissionsList.innerHTML = '<p>Aucune permission accordée</p>';
            return;
        }
        
        permissionsList.innerHTML = permissions.map(permission => `
            <div class="permission-item">
                <span>${permission.full_name} (${permission.username})</span>
                <span class="permission-date">Accordée le ${formatDate(permission.granted_at)}</span>
                <button onclick="revokeStockVivantPermission(${permission.user_id})" class="btn btn-sm btn-danger">
                    <i class="fas fa-times"></i> Révoquer
                </button>
            </div>
        `).join('');
        
    } catch (error) {
        console.error('Erreur chargement permissions:', error);
    }
}

async function grantStockVivantPermission() {
    const directorSelect = document.getElementById('director-select');
    const userId = directorSelect.value;
    
    if (!userId) {
        showStockVivantNotification('Veuillez sélectionner un directeur', 'error');
        return;
    }
    
    try {
        const response = await fetch(apiUrl('/api/stock-vivant/permissions'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: parseInt(userId) })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Erreur lors de l\'octroi de la permission');
        }
        
        showStockVivantNotification('Permission accordée avec succès', 'success');
        // Recharger les deux listes après ajout
        await loadStockVivantDirectors();
        await loadStockVivantPermissions();
        
    } catch (error) {
        console.error('Erreur octroi permission:', error);
        showStockVivantNotification('Erreur: ' + error.message, 'error');
    }
}

async function revokeStockVivantPermission(userId) {
    if (!confirm('Êtes-vous sûr de vouloir révoquer cette permission ?')) {
        return;
    }
    
    try {
        const response = await fetch(apiUrl(`/api/stock-vivant/permissions/${userId}`), {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Erreur lors de la révocation');
        }
        
        showStockVivantNotification('Permission révoquée avec succès', 'success');
        // Recharger les deux listes après suppression
        await loadStockVivantDirectors();
        await loadStockVivantPermissions();
        
    } catch (error) {
        console.error('Erreur révocation permission:', error);
        showStockVivantNotification('Erreur: ' + error.message, 'error');
    }
}

async function loadStockVivantDates() {
    try {
        console.log('📅 CLIENT: Début chargement dates stock vivant...');
        const response = await fetch(apiUrl('/api/stock-vivant/dates'));
        console.log('📅 CLIENT: Réponse API dates - status:', response.status);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.log('📅 CLIENT: Erreur API dates:', errorText);
            throw new Error('Erreur chargement dates');
        }
        
        const dates = await response.json();
        console.log('📅 CLIENT: Dates reçues:', dates);
        
        // Remplir les sélecteurs de dates
        const copyFromSelect = document.getElementById('copy-from-date');
        const viewDateSelect = document.getElementById('view-stock-date');
        
        console.log('📅 CLIENT: Éléments trouvés - copyFrom:', !!copyFromSelect, 'viewDate:', !!viewDateSelect);
        
        if (copyFromSelect) {
            copyFromSelect.innerHTML = '<option value="">Nouveau stock (vide)</option>';
            console.log('📅 CLIENT: copyFromSelect initialisé');
        }
        
        if (viewDateSelect) {
            viewDateSelect.innerHTML = '<option value="">Sélectionner une date</option>';
            console.log('📅 CLIENT: viewDateSelect initialisé');
        }
        
        dates.forEach((dateObj, index) => {
            console.log(`📅 CLIENT: Traitement date ${index}:`, dateObj);
            
            if (copyFromSelect) {
                const option1 = document.createElement('option');
                option1.value = dateObj.date;
                option1.textContent = formatDate(dateObj.date);
                copyFromSelect.appendChild(option1);
            }
            
            if (viewDateSelect) {
                const option2 = document.createElement('option');
                option2.value = dateObj.date;
                option2.textContent = formatDate(dateObj.date);
                viewDateSelect.appendChild(option2);
            }
        });
        
        console.log('📅 CLIENT: Chargement dates terminé - total:', dates.length);
        
    } catch (error) {
        console.error('❌ CLIENT: Erreur chargement dates:', error);
        console.error('❌ CLIENT: Stack trace dates:', error.stack);
    }
}

async function loadStockVivantForm() {
    const selectedDate = document.getElementById('stock-vivant-date').value;
    const copyFromDate = document.getElementById('copy-from-date').value;
    
    if (!selectedDate) {
        showStockVivantNotification('Veuillez sélectionner une date', 'error');
        return;
    }
    
    try {
        let stockData = [];
        
        if (copyFromDate) {
            // Copier depuis une date existante
            const response = await fetch(apiUrl(`/api/stock-vivant?date=${copyFromDate}`));
            if (response.ok) {
                stockData = await response.json();
            }
        } else {
            // Vérifier s'il y a déjà des données pour cette date
            const response = await fetch(apiUrl(`/api/stock-vivant?date=${selectedDate}`));
            if (response.ok) {
                const existingData = await response.json();
                if (existingData.length > 0) {
                    if (confirm('Des données existent déjà pour cette date. Voulez-vous les charger pour modification ?')) {
                        stockData = existingData;
                    }
                }
            }
        }
        
        generateStockVivantTables(stockData);
        document.getElementById('stock-vivant-data-container').style.display = 'block';
        
    } catch (error) {
        console.error('Erreur chargement formulaire:', error);
        showStockVivantNotification('Erreur: ' + error.message, 'error');
    }
}

function generateStockVivantTables(existingData = []) {
    if (!stockVivantConfig || !stockVivantConfig.categories) {
        showStockVivantNotification('Configuration non disponible', 'error');
        return '<p class="info-text text-error">Configuration non disponible</p>';
    }
    
    let html = '';
    
    // Add Grand Total Display Section
    html += `
        <div class="stock-grand-total-section mb-4">
            <div class="card bg-primary text-white">
                <div class="card-body">
                    <div class="row align-items-center">
                        <div class="col">
                            <h5 class="card-title mb-0 text-white">
                                <i class="fas fa-calculator me-2"></i>Total Général du Stock
                            </h5>
                        </div>
                        <div class="col-auto">
                            <h2 class="mb-0 text-white display-6" id="stock-grand-total">0 FCFA</h2>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    Object.keys(stockVivantConfig.categories).forEach(category => {
        const products = stockVivantConfig.categories[category];
        const categoryLabel = stockVivantConfig.labels[category] || category;
        
        html += `
            <div class="stock-category-table" data-category="${category}">
                <h4>${categoryLabel}</h4>
                <table class="modern-table">
                    <thead>
                        <tr>
                            <th>Produit</th>
                            <th>Quantité</th>
                            <th>Prix Unitaire (FCFA)</th>
                            <th>Décote (%)</th>
                            <th>Total (FCFA)</th>
                            <th>Commentaire</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${products.map(product => {
                            const existingItem = existingData.find(item => 
                                item.categorie === category && item.produit === product
                            );
                            const productLabel = stockVivantConfig.labels[product] || product;
                            const quantite = existingItem ? existingItem.quantite : 0;
                            const prixUnitaire = existingItem ? existingItem.prix_unitaire : 0;
                            const decote = existingItem ? existingItem.decote || 0.20 : 0.20; // Utiliser la décote de la DB ou 20% par défaut
                            const total = quantite * prixUnitaire * (1 - decote);
                            const commentaire = existingItem ? existingItem.commentaire : '';
                            
                            // Debug pour vérifier les données
                            if (existingItem) {
                                console.log(`🔍 Found data for ${category}/${product}:`, existingItem);
                            }
                            
                            return `
                                <tr data-category="${category}" data-product="${product}">
                                    <td>${productLabel}</td>
                                    <td>
                                        <input type="number" class="stock-quantity modern-input" 
                                               value="${quantite}" min="0" step="1"
                                               onchange="calculateStockVivantTotal(this)">
                                    </td>
                                    <td>
                                        <input type="number" class="stock-price modern-input" 
                                               value="${prixUnitaire}" min="0" step="0.01"
                                               onchange="calculateStockVivantTotal(this)">
                                    </td>
                                    <td>
                                        <input type="number" class="stock-decote modern-input" 
                                               value="${(decote * 100).toFixed(0)}" min="0" max="100" step="1"
                                               onchange="calculateStockVivantTotal(this)">
                                    </td>
                                    <td>
                                        <span class="stock-total font-weight-bold">${formatCurrency(total)}</span>
                                    </td>
                                    <td>
                                        <input type="text" class="stock-comment modern-input" 
                                               value="${commentaire}" placeholder="Commentaire optionnel">
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
    });
    
    return html;
}

function calculateStockVivantTotal(input) {
    const row = input.closest('tr');
    const quantity = parseFloat(row.querySelector('.stock-quantity').value) || 0;
    const price = parseFloat(row.querySelector('.stock-price').value) || 0;
    const decotePercent = parseFloat(row.querySelector('.stock-decote').value) || 20;
    const decote = decotePercent / 100; // Convertir le pourcentage en décimal
    const total = quantity * price * (1 - decote);
    
    row.querySelector('.stock-total').textContent = formatCurrency(total);
    
    // Mettre à jour le total général
    updateGrandTotal();
}

async function saveStockVivantData() {
    console.log('🚀 === DEBUT SAVE STOCK VIVANT DATA ===');
    
    // Use more specific selector to get the actual date input, not the display element
    const dateInput = document.querySelector('input[type="date"]#stock-vivant-date');
    const selectedDate = dateInput ? dateInput.value : null;
    
    console.log('🔍 DEBUGGING - Date input element:', dateInput);
    console.log('🔍 DEBUGGING - Selected date value:', selectedDate);
    console.log('🔍 DEBUGGING - Date input innerHTML:', dateInput?.outerHTML);
    console.log('🔍 DEBUGGING - User selected flag:', dateInput?.dataset?.userSelected);
    console.log('🔍 DEBUGGING - All data attributes:', dateInput?.dataset);
    
    // Also check for any other date inputs that might exist
    const allDateInputs = document.querySelectorAll('input[type="date"]');
    console.log('🔍 DEBUGGING - All date inputs found:', allDateInputs.length);
    allDateInputs.forEach((input, index) => {
        console.log(`🔍 DEBUGGING - Date input ${index}:`, {
            id: input.id,
            value: input.value,
            dataset: input.dataset
        });
    });
    
    if (!selectedDate) {
        console.log('❌ DEBUGGING - No date selected, aborting save');
        showStockVivantNotification('Veuillez sélectionner une date', 'error');
        return;
    }
    
    console.log('✅ DEBUGGING - Date validated, proceeding with save for date:', selectedDate);
    
    const stockData = [];
    
    // Collecter toutes les données des tableaux - updated selector
    const rows = document.querySelectorAll('tr[data-category]');
    console.log('🔍 Found rows for saving:', rows.length);
    
    rows.forEach(row => {
        const category = row.dataset.category;
        const product = row.dataset.product;
        const quantityInput = row.querySelector('.stock-quantity');
        const priceInput = row.querySelector('.stock-price');
        const decoteInput = row.querySelector('.stock-decote');
        const commentInput = row.querySelector('.stock-comment');
        
        if (quantityInput && priceInput) {
            const quantity = parseFloat(quantityInput.value) || 0;
            const price = parseFloat(priceInput.value) || 0;
            const decotePercent = parseFloat(decoteInput ? decoteInput.value : 20) || 20;
            const decote = decotePercent / 100;
            const comment = commentInput ? commentInput.value.trim() : '';
            
            console.log(`📊 Processing ${category}/${product}: qty=${quantity}, price=${price}`);
            
            // Inclure seulement les entrées avec une quantité ou un prix > 0
            if (quantity > 0 || price > 0) {
                stockData.push({
                    categorie: category,
                    produit: product,
                    quantite: quantity,
                    prix_unitaire: price,
                    decote: decote,
                    commentaire: comment
                });
            }
        }
    });
    
    console.log('📊 Final stock data to save:', stockData);
    console.log('📊 Stock data length:', stockData.length);
    
    if (stockData.length === 0) {
        showStockVivantNotification('Aucune donnée à sauvegarder', 'warning');
        console.log('❌ No data found to save - check table structure');
        return;
    }

    console.log('🔥 DEBUGGING - About to send API request with:');
    console.log('🔥 DEBUGGING - Date for API (date_stock):', selectedDate);
    console.log('🔥 DEBUGGING - API URL:', apiUrl('/api/stock-vivant/update'));
    
    const requestBody = {
        date_stock: selectedDate,
        stockData: stockData,
        replace_existing: false
    };
    console.log('🔥 DEBUGGING - Complete request body:', requestBody);
    console.log('🔥 DEBUGGING - Request body JSON:', JSON.stringify(requestBody));

    try {
        const response = await fetch(apiUrl('/api/stock-vivant/update'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });
        
        console.log('🔥 DEBUGGING - API Response status:', response.status);
        console.log('🔥 DEBUGGING - API Response ok:', response.ok);
        
        const result = await response.json();
        console.log('🔥 DEBUGGING - API Response result:', result);
        
        if (!response.ok) {
            if (response.status === 409 && result.error === 'duplicate_data') {
                console.log('🔥 DEBUGGING - Conflict detected (409)');
                console.log('🔥 DEBUGGING - selectedDate for confirmation dialog:', selectedDate);
                console.log('🔥 DEBUGGING - formatDate(selectedDate):', formatDate(selectedDate));
                console.log('🔥 DEBUGGING - result object:', result);
                console.log('🔥 DEBUGGING - result.existing_date if any:', result.existing_date);
                
                // Demander confirmation pour remplacer les données existantes
                const shouldReplace = confirm(`Des données existent déjà pour le ${formatDate(selectedDate)}. Voulez-vous les remplacer ?`);
                console.log('🔥 DEBUGGING - User choice shouldReplace:', shouldReplace);
                
                if (shouldReplace) {
                    // Remplacer directement ici au lieu d'appeler une autre fonction
                    try {
                        console.log('🔥 DEBUGGING - Retrying with replace_existing: true');
                        console.log('🔥 DEBUGGING - Retry date_stock:', selectedDate);
                        
                        const retryRequestBody = {
                            date_stock: selectedDate,
                            stockData: stockData,
                            replace_existing: true
                        };
                        console.log('🔥 DEBUGGING - Retry request body:', retryRequestBody);
                        
                        const retryResponse = await fetch(apiUrl('/api/stock-vivant/update'), {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(retryRequestBody)
                        });
                        
                        console.log('🔥 DEBUGGING - Retry response status:', retryResponse.status);
                        
                        const retryResult = await retryResponse.json();
                        
                        if (!retryResponse.ok) {
                            throw new Error(retryResult.error || 'Erreur lors du remplacement des données');
                        }
                        
                        showStockVivantNotification(`Stock remplacé avec succès (${retryResult.processedCount} entrées)`, 'success');
                        // Ne pas recharger pour préserver la date sélectionnée
                        return;
                        
                    } catch (retryError) {
                        console.error('Erreur remplacement stock vivant:', retryError);
                        showStockVivantNotification('Erreur lors du remplacement: ' + retryError.message, 'error');
                        return;
                    }
                } else {
                    showStockVivantNotification('Sauvegarde annulée', 'info');
                    return;
                }
            }
            throw new Error(result.error || 'Erreur lors de la sauvegarde');
        }
        
        showStockVivantNotification(`Stock sauvegardé avec succès (${result.processedCount} entrées)`, 'success');
        // Ne pas recharger automatiquement pour préserver la date sélectionnée par l'utilisateur
        
    } catch (error) {
        console.error('Erreur sauvegarde stock vivant:', error);
        showStockVivantNotification('Erreur: ' + error.message, 'error');
    }
}

async function saveStockVivantDataForced(date, stockData) {
    try {
        const response = await fetch(apiUrl('/api/stock-vivant/update'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                date_stock: date,
                stockData: stockData,
                replace_existing: true
            })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Erreur lors du remplacement');
        }
        
        const result = await response.json();
        showStockVivantNotification(`Stock remplacé avec succès (${result.processedCount} entrées)`, 'success');
        // Ne pas recharger automatiquement pour préserver la date sélectionnée
        
    } catch (error) {
        console.error('Erreur remplacement stock vivant:', error);
        showStockVivantNotification('Erreur: ' + error.message, 'error');
    }
}

function cancelStockVivantEdit() {
    // Handle elements that may not exist in modern interface
    const dataContainer = document.getElementById('stock-vivant-data-container');
    if (dataContainer) {
        dataContainer.style.display = 'none';
    }
    
    const dateInput = document.getElementById('stock-vivant-date');
    if (dateInput) {
        dateInput.value = '';
    }
    
    const copyFromDate = document.getElementById('copy-from-date');
    if (copyFromDate) {
        copyFromDate.value = '';
    }
    
    console.log('🧹 CLIENT: Nettoyage interface stock vivant');
}

async function loadViewStockVivant() {
    const selectedDate = document.getElementById('view-stock-date').value;
    const selectedCategory = document.getElementById('view-stock-category').value;
    
    if (!selectedDate) {
        showStockVivantNotification('Veuillez sélectionner une date', 'error');
        return;
    }
    
    try {
        let url = `/api/stock-vivant?date=${selectedDate}`;
        if (selectedCategory) {
            url += `&categorie=${selectedCategory}`;
        }
        
        const response = await fetch(apiUrl(url));
        if (!response.ok) throw new Error('Erreur chargement données');
        
        const data = await response.json();
        displayStockVivantViewData(data);
        
    } catch (error) {
        console.error('Erreur chargement vue stock vivant:', error);
        showStockVivantNotification('Erreur: ' + error.message, 'error');
    }
}

function displayStockVivantViewData(data) {
    const container = document.getElementById('stock-vivant-view-data');
    const tbody = document.getElementById('stock-vivant-view-tbody');
    
    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8">Aucune donnée trouvée</td></tr>';
        container.style.display = 'block';
        return;
    }
    
    tbody.innerHTML = data.map(item => `
        <tr>
            <td>${formatDate(item.date_stock)}</td>
            <td>${stockVivantConfig.labels[item.categorie] || item.categorie}</td>
            <td>${stockVivantConfig.labels[item.produit] || item.produit}</td>
            <td>${item.quantite}</td>
            <td>${formatCurrency(item.prix_unitaire)}</td>
            <td>${formatCurrency(item.total)}</td>
            <td>${item.commentaire || ''}</td>
            <td>
                <button onclick="deleteStockVivantItem(${item.id})" class="btn btn-sm btn-danger">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
    
    container.style.display = 'block';
}

async function deleteStockVivantItem(itemId) {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cette entrée ?')) {
        return;
    }
    
    try {
        const response = await fetch(apiUrl(`/api/stock-vivant/${itemId}`), {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Erreur lors de la suppression');
        }
        
        showStockVivantNotification('Entrée supprimée avec succès', 'success');
        loadViewStockVivant(); // Recharger l'affichage
        
    } catch (error) {
        console.error('Erreur suppression item stock vivant:', error);
        showStockVivantNotification('Erreur: ' + error.message, 'error');
    }
}

function populateStockVivantCategoryFilter() {
    console.log('🏷️ CLIENT: Début peuplement filtre catégories...');
    
    const categorySelect = document.getElementById('view-stock-category');
    if (categorySelect && stockVivantConfig && stockVivantConfig.categories) {
        categorySelect.innerHTML = '<option value="">Toutes les catégories</option>';
        Object.keys(stockVivantConfig.categories).forEach(category => {
            const option = document.createElement('option');
            option.value = category;
            option.textContent = stockVivantConfig.labels[category] || category;
            categorySelect.appendChild(option);
        });
        console.log('✅ CLIENT: Catégories chargées:', Object.keys(stockVivantConfig.categories).length);
    }
}
// Fonction simple pour afficher le tableau de stock vivant
function displaySimpleStockVivant() {
    console.log(`[Stock Vivant] Loading simple stock vivant table...`);
    if (!stockVivantConfig || !stockVivantConfig.categories) {
        console.error('[Stock Vivant] Invalid or missing Stock Vivant configuration.');
        showStockVivantNotification('Erreur: Configuration du stock non disponible.', 'error');
        return;
    }
    
    const container = document.getElementById('stock-vivant-simple-table');
    if (!container) {
        console.error('[Stock Vivant] Container #stock-vivant-simple-table not found.');
        return;
    }
    
    let html = `
    <div class="card mb-4">
        <div class="card-header">
            <h5>Stock Vivant - Saisie Simple</h5>
            <div class="form-group mb-3">
                <label for="stock-date">Date du Stock</label>
                <div class="input-group">
                    <input type="date" id="stock-date" class="form-control" required>
                    <button class="btn btn-info" onclick="loadStockVivantByDate()">
                        <i class="fas fa-sync"></i> Charger
                    </button>
                </div>
            </div>
        </div>
    </div>

    <div class="card mb-4 bg-light">
        <div class="card-body">
            <div class="row align-items-center">
                <div class="col">
                    <h5 class="card-title mb-0">Total Général du Stock</h5>
                </div>
                <div class="col-auto">
                    <h2 class="text-primary mb-0 display-6" id="stock-grand-total">0 FCFA</h2>
                </div>
            </div>
        </div>
    </div>

    <div class="card">
        <div class="card-body">
            <table class="table table-striped">
                <thead>
                    <tr>
                        <th>Catégorie</th>
                        <th>Produit</th>
                        <th>Quantité</th>
                        <th>Prix Unitaire (FCFA)</th>
                        <th>Décote</th>
                        <th>Total (FCFA)</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    // Parcourir toutes les catégories et produits
    Object.keys(stockVivantConfig.categories).forEach(categoryKey => {
        const categoryLabel = stockVivantConfig.labels[categoryKey] || categoryKey;
        const products = stockVivantConfig.categories[categoryKey];
        
        products.forEach((productKey, index) => {
            const productLabel = stockVivantConfig.labels[productKey] || productKey;
            const rowId = `${categoryKey}_${productKey}`;
            
            html += `
                <tr>
                    <td>${index === 0 ? categoryLabel : ''}</td>
                    <td>${productLabel}</td>
                    <td>
                        <input type="number" 
                               class="form-control stock-quantity" 
                               id="qty_${rowId}" 
                               min="0" 
                               value="0"
                               onchange="calculateRowTotal('${rowId}')">
                    </td>
                    <td>
                        <input type="number" 
                               class="form-control stock-price" 
                               id="price_${rowId}" 
                               min="0" 
                               value="0"
                               onchange="calculateRowTotal('${rowId}')">
                    </td>
                    <td>
                        <span class="stock-discount">${(DEFAULT_DISCOUNT * 100).toFixed(0)}%</span>
                    </td>
                    <td>
                        <span class="stock-total" id="total_${rowId}">0</span>
                    </td>
                </tr>
            `;
        });
    });
    
    html += `
                </tbody>
            </table>
            <div class="mt-3">
                <button class="btn btn-primary" onclick="saveSimpleStockVivant()">
                    <i class="fas fa-save"></i> Sauvegarder
                </button>
                <button class="btn btn-secondary ms-2" onclick="clearSimpleStockVivant()">
                    <i class="fas fa-eraser"></i> Effacer
                </button>
            </div>
        </div>
    </div>
    `;
    
    container.innerHTML = html;
    
    // Définir la date du jour par défaut
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('stock-date').value = today;
}

// Cette fonction a été remplacée par displaySimpleStockVivantTable() pour la nouvelle interface moderne
async function saveSimpleStockVivant() {
    try {
        // 1. Vérifier la date
        const dateInput = document.getElementById('stock-vivant-date');
        if (!dateInput || !dateInput.value) {
            showStockVivantNotification('Veuillez sélectionner une date', 'error');
            return;
        }

        // 2. Collecter les données depuis les tableaux générés
        const stockData = [];
        const rows = document.querySelectorAll('#stock-vivant-simple-table tr[data-category]');
        
        rows.forEach(row => {
            const category = row.dataset.category;
            const product = row.dataset.product;
            const quantityInput = row.querySelector('.stock-quantity');
            const priceInput = row.querySelector('.stock-price');
            const decoteInput = row.querySelector('.stock-decote');
            const commentInput = row.querySelector('.stock-comment');
            
            if (quantityInput && priceInput && decoteInput) {
                const quantity = parseFloat(quantityInput.value) || 0;
                const price = parseFloat(priceInput.value) || 0;
                const decotePercent = parseFloat(decoteInput.value) || 20;
                const decote = decotePercent / 100; // Convertir en décimal
                const comment = commentInput ? commentInput.value.trim() : '';
                
                // N'inclure que les lignes avec quantité ou prix > 0
                if (quantity > 0 || price > 0) {
                    stockData.push({
                        categorie: category,
                        produit: product,
                        quantite: quantity,
                        prix_unitaire: price,
                        decote: decote,
                        commentaire: comment
                    });
                }
            }
        });

        if (stockData.length === 0) {
            showStockVivantNotification('Aucune donnée à sauvegarder', 'warning');
            return;
        }

        console.log('📊 Données à sauvegarder:', stockData);

        // 3. Envoyer à l'API
        const response = await fetch(apiUrl('/api/stock-vivant/update'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                date_stock: dateInput.value,
                stockData: stockData,
                replace_existing: false
            })
        });

        const result = await response.json();

        if (!response.ok) {
            // Gérer le cas où des données existent déjà
            if (response.status === 409 && result.error === 'duplicate_data') {
                if (confirm(`Des données existent déjà pour le ${formatDate(dateInput.value)}. Voulez-vous les remplacer ?`)) {
                    // Réessayer avec replace_existing = true
                    const retryResponse = await fetch(apiUrl('/api/stock-vivant/update'), {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            date_stock: dateInput.value,
                            stockData: stockData,
                            replace_existing: true
                        })
                    });
                    
                    const retryResult = await retryResponse.json();
                    
                    if (!retryResponse.ok) {
                        throw new Error(retryResult.error || 'Erreur lors du remplacement des données');
                    }
                    
                    showStockVivantNotification(`Stock remplacé avec succès (${retryResult.processedCount} entrées)`, 'success');
                    // Ne pas recharger pour préserver la date
                }
                return;
            }
            throw new Error(result.error || 'Erreur lors de la sauvegarde');
        }

        showStockVivantNotification(`Stock sauvegardé avec succès (${result.processedCount} entrées)`, 'success');
        // Ne pas recharger pour préserver la date sélectionnée

    } catch (error) {
        console.error('Erreur sauvegarde stock:', error);
        showStockVivantNotification(`Erreur: ${error.message}`, 'error');
    }
}
// Calculer le total pour une ligne (version moderne)
function calculateRowTotal(row) {
    const qtyInput = row.querySelector('.stock-quantity');
    const priceInput = row.querySelector('.stock-price');
    const decoteInput = row.querySelector('.stock-decote');
    const totalSpan = row.querySelector('.stock-total');
    
    if (qtyInput && priceInput && decoteInput && totalSpan) {
        const qty = parseFloat(qtyInput.value) || 0;
        const price = parseFloat(priceInput.value) || 0;
        const decotePercent = parseFloat(decoteInput.value) || 20;
        const decote = decotePercent / 100; // Convertir le pourcentage en décimal
        const total = qty * price * (1 - decote);
        totalSpan.textContent = formatCurrency(total);
        
        // Mettre à jour le total général
        updateGrandTotal();
    }
}

// Calculer le total général
function calculateGrandTotal() {
    let grandTotal = 0;
    const totals = document.querySelectorAll('.stock-total');
    
    totals.forEach(totalSpan => {
        const totalText = totalSpan.textContent || totalSpan.innerText || '';
        const total = parseFloat(totalText.replace(/[^\d.-]/g, '')) || 0;
        grandTotal += total;
    });
    
    console.log('💰 Grand total calculated:', grandTotal, 'from', totals.length, 'items');
    return grandTotal;
}

// Mettre à jour le total général
function updateGrandTotal() {
    const grandTotal = calculateGrandTotal();
    const grandTotalElement = document.getElementById('stock-grand-total');
    if (grandTotalElement) {
        grandTotalElement.textContent = formatCurrency(grandTotal);
    }
}

// Effacer le stock simple
function clearSimpleStockVivant() {
    const rows = document.querySelectorAll('#stock-vivant-simple-table tr[data-category]');
    
    rows.forEach(row => {
        const quantityInput = row.querySelector('.stock-quantity');
        const priceInput = row.querySelector('.stock-price');
        const decoteInput = row.querySelector('.stock-decote');
        const commentInput = row.querySelector('.stock-comment');
        const totalSpan = row.querySelector('.stock-total');
        
        if (quantityInput) quantityInput.value = 0;
        if (priceInput) priceInput.value = 0;
        if (decoteInput) decoteInput.value = 20; // Remettre la décote par défaut à 20%
        if (commentInput) commentInput.value = '';
        if (totalSpan) totalSpan.textContent = formatCurrency(0);
    });
    
    // Mettre à jour le total général
    updateGrandTotal();
    
    console.log('🧹 CLIENT: Tableau effacé');
}

function showStockVivantNotification(message, type = 'info') {
    // Utiliser le système de notification global ou créer un spécifique
    showNotification(message, type);
}

// Fonction pour charger le total du stock vivant
async function loadStockVivantTotal() {
    try {
        const response = await fetch('/api/stock-vivant/total');
        if (!response.ok) {
            throw new Error('Erreur lors de la récupération du total stock vivant');
        }
        const data = await response.json();
        
        // Mettre à jour l'affichage
        const totalElement = document.getElementById('stock-vivant-total');
        const dateElement = document.getElementById('stock-vivant-date');
        
        if (totalElement && dateElement) {
            if (data.totalStock > 0) {
                totalElement.textContent = formatCurrency(data.totalStock);
                dateElement.textContent = `(${data.formattedDate})`;
            } else {
                totalElement.textContent = '0 FCFA';
                dateElement.textContent = data.message || 'Aucune donnée';
            }
        }
    } catch (error) {
        console.error('Erreur chargement total stock vivant:', error);
        const totalElement = document.getElementById('stock-vivant-total');
        const dateElement = document.getElementById('stock-vivant-date');
        
        if (totalElement && dateElement) {
            totalElement.textContent = 'Erreur';
            dateElement.textContent = 'Données indisponibles';
        }
    }
}

// Charger le total des créances
async function loadTotalCreances() {
    try {
        const response = await fetch(apiUrl('/api/dashboard/total-creances'));
        
        if (!response.ok) {
            throw new Error(`Erreur ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        const totalElement = document.getElementById('total-creances');
        
        if (totalElement) {
            totalElement.textContent = data.formatted;
        }
        
    } catch (error) {
        console.error('Erreur chargement total créances:', error);
        const totalElement = document.getElementById('total-creances');
        if (totalElement) {
            totalElement.textContent = '0 FCFA';
        }
    }
}

// Charger les créances du mois en cours
async function loadCreancesMois() {
    try {
        const response = await fetch(apiUrl('/api/dashboard/creances-mois'));
        
        if (!response.ok) {
            throw new Error(`Erreur ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        const totalElement = document.getElementById('creances-mois');
        const periodElement = document.getElementById('creances-mois-period');
        
        if (totalElement) {
            totalElement.textContent = data.formatted;
        }
        
        if (periodElement) {
            periodElement.textContent = data.period;
        }
        
    } catch (error) {
        console.error('Erreur chargement créances du mois:', error);
        const totalElement = document.getElementById('creances-mois');
        const periodElement = document.getElementById('creances-mois-period');
        
        if (totalElement) {
            totalElement.textContent = '0 FCFA';
        }
        
        if (periodElement) {
            periodElement.textContent = 'Mois en cours';
        }
    }
}

// Fonction pour charger l'écart de stock vivant mensuel
async function loadStockVivantVariation(startDate = null, endDate = null) {
    try {
        // Utiliser le même endpoint que le P&L avec cutoff_date
        let url = '/api/dashboard/stock-vivant-variation';
        const params = new URLSearchParams();
        
        // Utiliser end_date comme cutoff_date (même logique que Stock Mata)
        if (endDate) {
            params.append('cutoff_date', endDate);
        }
        
        if (params.toString()) {
            url += '?' + params.toString();
        }
        
        const response = await fetch(apiUrl(url));
        if (!response.ok) {
            throw new Error('Erreur lors de la récupération de l\'écart stock vivant');
        }
        const data = await response.json();
        
        // 🌱 LOGS DÉTAILLÉS ÉCART STOCK VIVANT MENSUEL
        if (endDate && data.variation_total !== undefined) {
            console.log(`🌱 Écart Stock Vivant Mensuel: ${data.variation_total.toLocaleString('fr-FR')} F CFA (cutoff_date: ${endDate})`);
        }
        
        // Mettre à jour l'affichage
        const variationElement = document.getElementById('stock-vivant-variation');
        const periodElement = document.getElementById('stock-variation-period');
        const stockVivantDetailsElement = document.getElementById('stock-vivant-details');
        
        if (variationElement && periodElement) {
            // Utiliser les nouvelles données
            const variation = data.variation_total || data.variation || 0;
            
            // Formater la valeur avec couleur selon si c'est positif/négatif
            variationElement.textContent = formatCurrency(variation);
            
            // Ajouter une classe CSS selon le signe
            variationElement.className = 'stat-value';
            if (variation > 0) {
                variationElement.classList.add('variation-positive');
            } else if (variation < 0) {
                variationElement.classList.add('variation-negative');
            } else {
                variationElement.classList.add('variation-neutral');
            }
            
            // Mettre à jour la période d'information
            periodElement.textContent = data.month_year ? `Mois: ${data.month_year}` : (data.periodInfo || 'Variation mois actuel vs précédent');
            
            // Afficher les détails des dates si disponibles
            if (stockVivantDetailsElement && data.details) {
                stockVivantDetailsElement.textContent = data.details;
                stockVivantDetailsElement.style.display = 'block';
            } else if (stockVivantDetailsElement) {
                stockVivantDetailsElement.style.display = 'none';
            }
        }
    } catch (error) {
        console.error('Erreur chargement écart stock vivant:', error);
        const variationElement = document.getElementById('stock-vivant-variation');
        const periodElement = document.getElementById('stock-variation-period');
        
        if (variationElement && periodElement) {
            variationElement.textContent = 'Erreur';
            variationElement.className = 'stat-value variation-error';
            periodElement.textContent = 'Données indisponibles';
        }
    }
}

// Charger la dernière valeur Cash Bictorys pour le dashboard
async function loadCashBictorysLatest() {
    try {
        const response = await fetch(apiUrl('/api/dashboard/cash-bictorys-latest'));
        
        if (!response.ok) {
            throw new Error(`Erreur ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        const latestElement = document.getElementById('cash-bictorys-latest');
        
        if (latestElement) {
            latestElement.textContent = data.formatted;
        }
        
    } catch (error) {
        console.error('Erreur chargement Cash Bictorys latest:', error);
        const latestElement = document.getElementById('cash-bictorys-latest');
        
        if (latestElement) {
            latestElement.textContent = '0 FCFA';
        }
    }
}

// ===== FONCTIONS DE CHARGEMENT MENSUEL =====

// Charger SEULEMENT les données spécifiques au mois (sans affecter les soldes actuels)
async function loadMonthlySpecificData(monthYear) {
    try {
        // Récupérer les dates de début et fin calculées par updateDateFilters
        const dashboardStartDate = document.getElementById('dashboard-start-date')?.value;
        const dashboardEndDate = document.getElementById('dashboard-end-date')?.value;
        
        // Construire l'URL avec les paramètres de date
        let apiUrlWithParams = `/api/dashboard/monthly-data?month=${monthYear}`;
        if (dashboardStartDate && dashboardEndDate) {
            apiUrlWithParams += `&start_date=${dashboardStartDate}&end_date=${dashboardEndDate}`;
        }
        
        const response = await fetch(apiUrl(apiUrlWithParams));
        const data = await response.json();
        
        if (response.ok) {
            // Mettre à jour SEULEMENT les données mensuelles (pas les soldes actuels)
            document.getElementById('monthly-burn').textContent = data.monthlyBurn || '0 FCFA';
            
            // Mettre à jour la nouvelle carte "Somme Balance du Mois"
            document.getElementById('monthly-balance-total').textContent = data.monthlyBalanceTotalFormatted || '0 FCFA';
            
            // Mettre à jour les cartes de statistiques mensuelles
            document.getElementById('total-spent-amount').textContent = data.totalSpent || '0 FCFA';
            document.getElementById('total-credited-with-expenses').textContent = data.totalCreditedWithExpenses || '0 FCFA';
            
            // Mettre à jour les graphiques pour le mois sélectionné
            if (data.accountChart) {
                console.log('✅ CLIENT: Création du tableau account-chart avec données CORRIGÉES de monthly-data');
                createChart('account-chart', data.accountChart, 'account');
            }
            if (data.categoryChart) {
                createChart('category-chart', data.categoryChart, 'category');
            }
        } else {
            console.error('Erreur données mensuelles:', data.error);
        }
    } catch (error) {
        console.error('Erreur chargement données mensuelles:', error);
    }
}

// Charger les données principales du dashboard pour un mois (DEPRECATED - remplacée par loadMonthlySpecificData)
async function loadMonthlyDashboardData(monthYear) {
    try {
        // Récupérer les dates de début et fin calculées par updateDateFilters
        const dashboardStartDate = document.getElementById('dashboard-start-date')?.value;
        const dashboardEndDate = document.getElementById('dashboard-end-date')?.value;
        
        // Construire l'URL avec les paramètres de date
        let apiUrlWithParams = `/api/dashboard/monthly-data?month=${monthYear}`;
        if (dashboardStartDate && dashboardEndDate) {
            apiUrlWithParams += `&start_date=${dashboardStartDate}&end_date=${dashboardEndDate}`;
        }
        
        const response = await fetch(apiUrl(apiUrlWithParams));
        const data = await response.json();
        
        if (response.ok) {
            // Mettre à jour les cartes principales
            document.getElementById('solde-amount').textContent = data.currentBalance || '0 FCFA';
            document.getElementById('total-depot-balance').textContent = data.depotBalance || '0 FCFA';
            document.getElementById('total-partner-balance').textContent = data.partnerBalance || '0 FCFA';
            document.getElementById('weekly-burn').textContent = data.weeklyBurn || '0 FCFA';
            document.getElementById('monthly-burn').textContent = data.monthlyBurn || '0 FCFA';
            
            // Mettre à jour les cartes de statistiques
            document.getElementById('total-spent-amount').textContent = data.totalSpent || '0 FCFA';
            document.getElementById('total-remaining-amount').textContent = data.totalRemaining || '0 FCFA';
            document.getElementById('total-credited-with-expenses').textContent = data.totalCreditedWithExpenses || '0 FCFA';
            document.getElementById('total-credited-general').textContent = data.totalCreditedGeneral || '0 FCFA';
            
            // Mettre à jour les graphiques
            if (data.accountChart) {
                console.log('✅ CLIENT: Création du tableau account-chart avec données CORRIGÉES de loadMonthlyDashboardData');
                createChart('account-chart', data.accountChart, 'account');
            }
            if (data.categoryChart) {
                createChart('category-chart', data.categoryChart, 'category');
            }
        } else {
            console.error('Erreur données mensuelles:', data.error);
        }
    } catch (error) {
        console.error('Erreur chargement données mensuelles:', error);
    }
}

// Charger les créances totales pour un mois
async function loadMonthlyCreances(monthYear) {
    try {
        const response = await fetch(apiUrl(`/api/dashboard/monthly-creances?month=${monthYear}`));
        const data = await response.json();
        
        if (response.ok) {
            document.getElementById('total-creances').textContent = data.formatted;
        } else {
            console.error('Erreur créances mensuelles:', data.error);
            document.getElementById('total-creances').textContent = '0 FCFA';
        }
    } catch (error) {
        console.error('Erreur chargement créances mensuelles:', error);
        document.getElementById('total-creances').textContent = '0 FCFA';
    }
}

// Charger les créances du mois pour un mois spécifique
async function loadMonthlyCreancesMois(monthYear) {
    try {
        const response = await fetch(apiUrl(`/api/dashboard/creances-mois?month=${monthYear}`));
        const data = await response.json();
        
        if (response.ok) {
            document.getElementById('creances-mois').textContent = data.formatted;
            document.getElementById('creances-mois-period').textContent = data.period;
        } else {
            console.error('Erreur créances du mois:', data.error);
            document.getElementById('creances-mois').textContent = '0 FCFA';
        }
    } catch (error) {
        console.error('Erreur chargement créances du mois:', error);
        document.getElementById('creances-mois').textContent = '0 FCFA';
    }
}

// Charger Cash Bictorys pour un mois spécifique
async function loadMonthlyCashBictorys(monthYear) {
    try {
        const response = await fetch(apiUrl(`/api/dashboard/monthly-cash-bictorys?month=${monthYear}`));
        const data = await response.json();
        
        if (response.ok) {
            document.getElementById('cash-bictorys-latest').textContent = data.formatted;
        } else {
            console.error('Erreur Cash Bictorys mensuel:', data.error);
            document.getElementById('cash-bictorys-latest').textContent = '0 FCFA';
        }
    } catch (error) {
        console.error('Erreur chargement Cash Bictorys mensuel:', error);
        document.getElementById('cash-bictorys-latest').textContent = '0 FCFA';
    }
}

// ✨ NOUVELLE FONCTION: Charger Cash Bictorys avec une date de cutoff
async function loadCashBictorysWithCutoff(cutoffDate) {
    try {
        console.log(`💰 CLIENT: Chargement Cash Bictorys avec cutoff: ${cutoffDate}`);
        
        // Extraire le mois de la date de cutoff pour l'API
        const date = new Date(cutoffDate);
        const monthYear = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
        
        // Appeler l'API avec le paramètre cutoff_date et debug_details
        const response = await fetch(apiUrl(`/api/dashboard/monthly-cash-bictorys?month=${monthYear}&cutoff_date=${cutoffDate}&debug_details=true`));
        const data = await response.json();
        
        if (response.ok) {
            document.getElementById('cash-bictorys-latest').textContent = data.formatted;
            
            // 📊 DEBUG: Vérifier si les données debug arrivent pour Cash Bictorys
            console.log(`🔥 FORCE DEBUG: cash-bictorys response FULL:`, data);
            console.log(`🔥 FORCE DEBUG: cash-bictorys response keys:`, Object.keys(data));
            console.log(`🔥 FORCE DEBUG: cashBictorysDetails présent?`, !!data.cashBictorysDetails);
            
            // 📊 LOGS DÉTAILLÉS CASH BICTORYS DU MOIS
            if (data.cashBictorysDetails) {
                console.group(`💰 CASH BICTORYS DU MOIS - Détail jour par jour (${monthYear} jusqu'au ${cutoffDate})`);
                console.log(`📅 Période analysée: ${data.cashBictorysDetails.startDate} à ${data.cashBictorysDetails.endDate}`);
                console.log(`📊 Total jours analysés: ${data.cashBictorysDetails.totalDays}`);
                
                if (data.cashBictorysDetails.dailyBreakdown && data.cashBictorysDetails.dailyBreakdown.length > 0) {
                    console.table(data.cashBictorysDetails.dailyBreakdown.map(day => ({
                        'Date': day.date,
                        'Montant (FCFA)': day.amount.toLocaleString('fr-FR'),
                        'Évolution': day.evolution || 'Stable',
                        'Note': day.note || ''
                    })));
                    
                    console.log(`💰 Valeur finale Cash Bictorys: ${data.cashBictorysDetails.finalAmount.toLocaleString('fr-FR')} FCFA`);
                    console.log(`📈 Valeur au début du mois: ${data.cashBictorysDetails.startAmount.toLocaleString('fr-FR')} FCFA`);
                    console.log(`📉 Évolution totale: ${(data.cashBictorysDetails.finalAmount - data.cashBictorysDetails.startAmount).toLocaleString('fr-FR')} FCFA`);
                } else {
                    console.log('📊 Aucune donnée Cash Bictorys trouvée pour cette période');
                }
                console.groupEnd();
            }
            
            console.log(`✅ CLIENT: Cash Bictorys mis à jour avec cutoff ${cutoffDate}: ${data.formatted}`);
        } else {
            console.error('❌ CLIENT: Erreur Cash Bictorys avec cutoff:', data.error);
            document.getElementById('cash-bictorys-latest').textContent = '0 FCFA';
        }
    } catch (error) {
        console.error('❌ CLIENT: Erreur chargement Cash Bictorys avec cutoff:', error);
        document.getElementById('cash-bictorys-latest').textContent = '0 FCFA';
    }
}

// ✨ NOUVELLE FONCTION CENTRALISÉE: Charger tout le dashboard avec une date de cutoff
async function loadDashboardWithCutoff(cutoffDate) {
    try {
        console.log(`🔄 CLIENT: Chargement complet du dashboard avec cutoff: ${cutoffDate}`);
        
        // Extraire le mois de la date de cutoff
        const date = new Date(cutoffDate);
        const monthYear = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
        
        // Mettre à jour toutes les cartes principales avec cutoff
        await Promise.all([
            // 1. Stats cards principales (déjà gère cutoff)
            updateStatsCards(null, null, cutoffDate),
            
            // 2. Cash Bictorys avec cutoff
            loadCashBictorysWithCutoff(cutoffDate),
            
            // 3. Données mensuelles spécifiques avec cutoff
            loadMonthlySpecificDataWithCutoff(monthYear, cutoffDate),
            
            // 4. Créances avec cutoff
            loadMonthlyCreancesWithCutoff(monthYear, cutoffDate),
            loadMonthlyCreancesMoisWithCutoff(monthYear, cutoffDate)
        ]);
        
        // Charger également les données de stock si elles existent
        try {
            await Promise.all([
                loadStockSummaryWithCutoff(cutoffDate),
                loadStockVivantTotalWithCutoff(cutoffDate),
                loadStockVivantVariationWithCutoff(cutoffDate)
            ]);
        } catch (stockError) {
            console.log('📊 Certaines données de stock ne sont pas disponibles avec cutoff:', stockError.message);
        }
        
        console.log(`✅ CLIENT: Dashboard complet mis à jour avec cutoff ${cutoffDate}`);
        
    } catch (error) {
        console.error('❌ CLIENT: Erreur chargement dashboard avec cutoff:', error);
        showNotification('Erreur lors de la mise à jour complète du dashboard', 'error');
    }
}

// ✨ NOUVELLES FONCTIONS AVEC CUTOFF

// Charger les données mensuelles spécifiques avec cutoff
async function loadMonthlySpecificDataWithCutoff(monthYear, cutoffDate) {
    try {
        const response = await fetch(apiUrl(`/api/dashboard/monthly-data?month=${monthYear}&cutoff_date=${cutoffDate}&debug_details=true`));
        const data = await response.json();
        
        if (response.ok) {
            // Mettre à jour les données mensuelles
            const monthlyBurnElement = document.getElementById('monthly-burn');
            const weeklyBurnElement = document.getElementById('weekly-burn');
            const monthlyBalanceTotalElement = document.getElementById('monthly-balance-total');
            
            if (monthlyBurnElement) {
                monthlyBurnElement.textContent = data.monthlyBurn || '0 FCFA';
            }
            if (weeklyBurnElement) {
                weeklyBurnElement.textContent = data.weeklyBurn || '0 FCFA';
            }
            if (monthlyBalanceTotalElement) {
                monthlyBalanceTotalElement.textContent = data.monthlyBalanceTotalFormatted || '0 FCFA';
            }
            
            // 📊 LOGS DÉTAILLÉS CASH BURN DU MOIS
            if (data.monthlyBurnDetails) {
                console.group(`💸 CASH BURN DU MOIS - Détail jour par jour (${monthYear} jusqu'au ${cutoffDate})`);
                console.log(`📅 Période analysée: ${data.monthlyBurnDetails.startDate} à ${data.monthlyBurnDetails.endDate}`);
                console.log(`📊 Total jours analysés: ${data.monthlyBurnDetails.totalDays}`);
                
                if (data.monthlyBurnDetails.dailyBreakdown && data.monthlyBurnDetails.dailyBreakdown.length > 0) {
                    console.table(data.monthlyBurnDetails.dailyBreakdown.map(day => ({
                        'Date': day.date,
                        'Montant (FCFA)': day.amount.toLocaleString('fr-FR'),
                        'Nb Dépenses': day.count,
                        'Comptes': day.accounts || 'N/A'
                    })));
                    
                    console.log(`💰 Total Cash Burn: ${data.monthlyBurnDetails.totalAmount.toLocaleString('fr-FR')} FCFA`);
                    console.log(`📈 Moyenne par jour: ${Math.round(data.monthlyBurnDetails.totalAmount / data.monthlyBurnDetails.totalDays).toLocaleString('fr-FR')} FCFA`);
                } else {
                    console.log('📊 Aucune dépense trouvée pour cette période');
                }
                console.groupEnd();
            } else {
                console.warn(`⚠️ ATTENTION: monthlyBurnDetails non reçu pour ${monthYear} avec cutoff ${cutoffDate}`);
            }
            
            console.log(`✅ CLIENT: Données mensuelles mises à jour avec cutoff ${cutoffDate}`);
        } else {
            console.error('❌ CLIENT: Erreur données mensuelles avec cutoff:', data.error);
        }
    } catch (error) {
        console.error('❌ CLIENT: Erreur chargement données mensuelles avec cutoff:', error);
    }
}
// Charger les créances totales avec cutoff
async function loadMonthlyCreancesWithCutoff(monthYear, cutoffDate) {
    try {
        const response = await fetch(apiUrl(`/api/dashboard/monthly-creances?month=${monthYear}&cutoff_date=${cutoffDate}`));
        const data = await response.json();
        
        if (response.ok) {
            const totalCreancesElement = document.getElementById('total-creances');
            if (totalCreancesElement) {
                totalCreancesElement.textContent = data.formatted;
            }
            console.log(`✅ CLIENT: Créances totales mises à jour avec cutoff ${cutoffDate}: ${data.formatted}`);
        } else {
            console.error('❌ CLIENT: Erreur créances avec cutoff:', data.error);
            const totalCreancesElement = document.getElementById('total-creances');
            if (totalCreancesElement) {
                totalCreancesElement.textContent = '0 FCFA';
            }
        }
    } catch (error) {
        console.error('❌ CLIENT: Erreur chargement créances avec cutoff:', error);
        const totalCreancesElement = document.getElementById('total-creances');
        if (totalCreancesElement) {
            totalCreancesElement.textContent = '0 FCFA';
        }
    }
}

// Charger les créances du mois avec cutoff
async function loadMonthlyCreancesMoisWithCutoff(monthYear, cutoffDate) {
    try {
        const response = await fetch(apiUrl(`/api/dashboard/creances-mois?month=${monthYear}&cutoff_date=${cutoffDate}&debug_details=true`));
        const data = await response.json();
        
        if (response.ok) {
            const creancesMoisElement = document.getElementById('creances-mois');
            if (creancesMoisElement) {
                creancesMoisElement.textContent = data.formatted;
            }
            
            // 📊 DEBUG: Vérifier si les données debug arrivent pour créances du mois
            console.log(`🔥 FORCE DEBUG: creances-mois response FULL:`, data);
            console.log(`🔥 FORCE DEBUG: creances-mois response keys:`, Object.keys(data));
            console.log(`🔥 FORCE DEBUG: creancesDetails présent?`, !!data.creancesDetails);
            
            // 📊 LOGS DÉTAILLÉS CRÉANCES DU MOIS
            if (data.creancesDetails) {
                console.group(`💳 CRÉANCES DU MOIS - Détail jour par jour (${monthYear} jusqu'au ${cutoffDate})`);
                console.log(`📅 Période analysée: ${data.creancesDetails.startDate} à ${data.creancesDetails.endDate}`);
                console.log(`📊 Total jours analysés: ${data.creancesDetails.totalDays}`);
                
                if (data.creancesDetails.dailyBreakdown && data.creancesDetails.dailyBreakdown.length > 0) {
                    console.table(data.creancesDetails.dailyBreakdown.map(day => ({
                        'Date': day.date,
                        'Montant (FCFA)': day.amount.toLocaleString('fr-FR'),
                        'Nb Opérations': day.count,
                        'Clients': day.clients || 'N/A',
                        'Type': day.type || 'Crédit'
                    })));
                    
                    console.log(`💰 Total Créances du Mois: ${data.creancesDetails.totalAmount.toLocaleString('fr-FR')} FCFA`);
                    console.log(`📈 Moyenne par jour: ${Math.round(data.creancesDetails.totalAmount / data.creancesDetails.totalDays).toLocaleString('fr-FR')} FCFA`);
                } else {
                    console.log('📊 Aucune opération de créance trouvée pour cette période');
                }
                console.groupEnd();
            } else {
                console.warn(`⚠️ ATTENTION: creancesDetails non reçu pour ${monthYear} avec cutoff ${cutoffDate}`);
            }
            
            console.log(`✅ CLIENT: Créances du mois mises à jour avec cutoff ${cutoffDate}: ${data.formatted}`);
        } else {
            console.error('❌ CLIENT: Erreur créances du mois avec cutoff:', data.error);
            const creancesMoisElement = document.getElementById('creances-mois');
            if (creancesMoisElement) {
                creancesMoisElement.textContent = '0 FCFA';
            }
        }
    } catch (error) {
        console.error('❌ CLIENT: Erreur chargement créances du mois avec cutoff:', error);
        const creancesMoisElement = document.getElementById('creances-mois');
        if (creancesMoisElement) {
            creancesMoisElement.textContent = '0 FCFA';
        }
    }
}

// Charger le stock summary avec cutoff (optionnel)
async function loadStockSummaryWithCutoff(cutoffDate) {
    try {
        const response = await fetch(apiUrl(`/api/dashboard/stock-summary?cutoff_date=${cutoffDate}`));
        const data = await response.json();
        
        if (response.ok) {
            const stockTotalElement = document.getElementById('stock-total');
            const stockDateElement = document.getElementById('stock-date');
            
            if (stockTotalElement && stockDateElement) {
                stockTotalElement.textContent = data.totalStock ? data.totalStock.toLocaleString('fr-FR') : '0';
                stockDateElement.textContent = data.latestDate ? `(${data.formattedDate || data.latestDate})` : 'Aucune date';
                console.log(`✅ CLIENT: Stock summary mis à jour avec cutoff ${cutoffDate}: ${data.totalStock} FCFA`);
            }
        } else {
            console.log(`📊 CLIENT: Stock summary avec cutoff non disponible: ${data.error}`);
        }
    } catch (error) {
        console.log(`📊 CLIENT: Stock summary avec cutoff non disponible: ${error.message}`);
    }
}

// Charger le stock vivant total avec cutoff (optionnel)
async function loadStockVivantTotalWithCutoff(cutoffDate) {
    try {
        const response = await fetch(apiUrl(`/api/dashboard/stock-vivant-total?cutoff_date=${cutoffDate}`));
        const data = await response.json();
        
        if (response.ok) {
            const stockVivantElement = document.getElementById('stock-vivant-total');
            const stockVivantDateElement = document.getElementById('stock-vivant-date');
            
            if (stockVivantElement && stockVivantDateElement) {
                stockVivantElement.textContent = data.formatted || '0 FCFA';
                stockVivantDateElement.textContent = data.latest_date ? `(${data.latest_date})` : 'Aucune date';
                console.log(`✅ CLIENT: Stock vivant total mis à jour avec cutoff ${cutoffDate}: ${data.formatted}`);
            }
        } else {
            console.log(`📊 CLIENT: Stock vivant total avec cutoff non disponible: ${data.error}`);
        }
    } catch (error) {
        console.log(`📊 CLIENT: Stock vivant total avec cutoff non disponible: ${error.message}`);
    }
}

// Charger la variation stock vivant avec cutoff (optionnel)
async function loadStockVivantVariationWithCutoff(cutoffDate) {
    try {
        const response = await fetch(apiUrl(`/api/dashboard/stock-vivant-variation?cutoff_date=${cutoffDate}&debug_details=true`));
        const data = await response.json();
        
        if (response.ok) {
            const variationElement = document.getElementById('stock-vivant-variation');
            
            if (variationElement) {
                variationElement.textContent = data.formatted || '0 FCFA';
                
                // 📊 LOGS DÉTAILLÉS ÉCART STOCK VIVANT MENSUEL
                if (data.stockVariationDetails) {
                    const cutoffMonth = cutoffDate.substring(0, 7); // YYYY-MM
                    console.group(`🌱 ÉCART STOCK VIVANT MENSUEL - Détail jour par jour (${cutoffMonth} jusqu'au ${cutoffDate})`);
                    console.log(`📅 Période analysée: ${data.stockVariationDetails.startDate} à ${data.stockVariationDetails.endDate}`);
                    console.log(`📊 Total jours analysés: ${data.stockVariationDetails.totalDays}`);
                    
                    if (data.stockVariationDetails.dailyBreakdown && data.stockVariationDetails.dailyBreakdown.length > 0) {
                        console.table(data.stockVariationDetails.dailyBreakdown.map(day => ({
                            'Date': day.date,
                            'Stock Vivant (FCFA)': day.stockAmount.toLocaleString('fr-FR'),
                            'Variation vs J-1 (FCFA)': day.dailyVariation.toLocaleString('fr-FR'),
                            'Variation Cumul (FCFA)': day.cumulativeVariation.toLocaleString('fr-FR'),
                            'Note': day.note || ''
                        })));
                        
                        console.log(`💰 Stock Vivant final: ${data.stockVariationDetails.finalStockAmount.toLocaleString('fr-FR')} FCFA`);
                        console.log(`📈 Stock Vivant début mois: ${data.stockVariationDetails.startStockAmount.toLocaleString('fr-FR')} FCFA`);
                        console.log(`📉 Écart Total du Mois: ${data.stockVariationDetails.totalVariation.toLocaleString('fr-FR')} FCFA`);
                        console.log(`📊 Variation moyenne par jour: ${Math.round(data.stockVariationDetails.totalVariation / data.stockVariationDetails.totalDays).toLocaleString('fr-FR')} FCFA`);
                    } else {
                        console.log('📊 Aucune donnée de stock vivant trouvée pour cette période');
                    }
                    console.groupEnd();
                }
                
                console.log(`✅ CLIENT: Stock vivant variation mis à jour avec cutoff ${cutoffDate}: ${data.formatted}`);
            }
        } else {
            console.log(`📊 CLIENT: Stock vivant variation avec cutoff non disponible: ${data.error}`);
        }
    } catch (error) {
        console.log(`📊 CLIENT: Stock vivant variation avec cutoff non disponible: ${error.message}`);
    }
}

// === MODULE STOCK VIVANT POUR DIRECTEURS ===

// Initialiser le module stock vivant pour directeurs (identique au module crédit)
async function initDirectorStockVivantModule() {
    const stockVivantMenu = document.getElementById('stock-vivant-menu');
    if (!stockVivantMenu) return;
    
    // Vérifier si l'utilisateur a des permissions stock vivant
    if (currentUser && currentUser.role === 'directeur') {
        try {
            const response = await fetch('/api/director/stock-vivant-access');
            const accessData = await response.json();
            
            if (accessData.hasAccess) {
                // Le directeur a des permissions, afficher le menu
                stockVivantMenu.style.display = 'block';
                
                // Configurer le gestionnaire de navigation
                const navLink = stockVivantMenu.querySelector('a');
                if (navLink) {
                    navLink.addEventListener('click', function(e) {
                        e.preventDefault();
                        showSection('stock-vivant');
                    });
                }
                
                console.log(`✅ Stock Vivant accessible pour le directeur ${currentUser.username}`);
            } else {
                // Pas de permissions, masquer le menu
                stockVivantMenu.style.display = 'none';
                console.log(`❌ Stock Vivant non accessible pour le directeur ${currentUser.username}: ${accessData.reason}`);
            }
        } catch (error) {
            console.error('Erreur vérification permissions stock vivant:', error);
            stockVivantMenu.style.display = 'none';
        }
    } else if (currentUser && (currentUser.role === 'directeur_general' || currentUser.role === 'pca' || currentUser.role === 'admin')) {
        // DG/PCA/Admin voient toujours le menu
        stockVivantMenu.style.display = 'block';
        
        const navLink = stockVivantMenu.querySelector('a');
        if (navLink) {
            navLink.addEventListener('click', function(e) {
                e.preventDefault();
                showSection('stock-vivant');
            });
        }
        
        console.log(`✅ Stock Vivant accessible pour l'admin ${currentUser.username}`);
    } else {
        stockVivantMenu.style.display = 'none';
        console.log(`❌ Stock Vivant non accessible pour le rôle ${currentUser?.role}`);
    }
}

// Initialize Stock Vivant Permissions section
async function initStockVivantPermissions() {
    console.log('🔄 CLIENT: Initialisation des permissions stock vivant');
    
    try {
        // Load directors and permissions
        await loadStockVivantDirectors();
        
        // Setup event listener for grant permission button
        const grantBtn = document.getElementById('grant-permission-btn');
        if (grantBtn) {
            grantBtn.removeEventListener('click', grantStockVivantPermission); // Remove any existing listener
            grantBtn.addEventListener('click', grantStockVivantPermission);
        }
        
        console.log('✅ CLIENT: Permissions stock vivant initialisées');
        return true;
        
    } catch (error) {
        console.error('❌ CLIENT: Erreur initialisation permissions stock vivant:', error);
        showStockVivantNotification('Erreur lors de l\'initialisation des permissions', 'error');
        return false;
    }
}

// === STOCK VIVANT MODERN DESIGN FUNCTIONS ===

// Setup modern Stock Vivant events
function setupModernStockVivantEvents() {
    console.log('🎨 CLIENT: Configuration des événements Stock Vivant moderne');
    
    // Mode selector
    const modeSelect = document.getElementById('stock-vivant-mode');
    if (modeSelect) {
        modeSelect.addEventListener('change', async function() {
            await showStockMode(this.value);
        });
    }
    
    // Date input
    const dateInput = document.querySelector('input[type="date"]#stock-vivant-date');
    if (dateInput) {
        dateInput.addEventListener('change', function() {
            console.log('📅 Date changée par utilisateur:', this.value);
            // Mark as user-selected to prevent auto-overriding
            this.dataset.userSelected = 'true';
            
            // Auto-reload data when date changes
            const currentMode = document.getElementById('stock-vivant-mode').value;
            if (currentMode === 'saisie') {
                displaySimpleStockVivantTable();
            } else if (currentMode === 'consultation') {
                loadStockVivantForConsultation();
            }
        });
    }
    
    // Load data button - THIS WAS MISSING!
    const loadDataBtn = document.getElementById('load-stock-data-btn');
    if (loadDataBtn) {
        loadDataBtn.addEventListener('click', async function() {
            const currentMode = document.getElementById('stock-vivant-mode').value;
            console.log('🔄 Load data button clicked, mode:', currentMode);
            
            switch(currentMode) {
                case 'saisie':
                    await displaySimpleStockVivantTable();
                    break;
                case 'consultation':
                    await loadStockVivantForConsultation();
                    break;
                case 'historique':
                    const selectedDate = document.getElementById('stock-vivant-date').value;
                    if (selectedDate) {
                        await loadStockVivantBySelectedDate(selectedDate);
                    } else {
                        showStockVivantNotification('Veuillez sélectionner une date', 'error');
                    }
                    break;
            }
        });
    }
    
    // Category filter
    const categoryFilter = document.getElementById('stock-vivant-category-filter');
    if (categoryFilter) {
        categoryFilter.addEventListener('change', function() {
            filterStockByCategory(this.value);
        });
    }
    
    // Action buttons - modern interface
    const resetBtn = document.getElementById('reset-stock-filters-btn');
    if (resetBtn) {
        resetBtn.addEventListener('click', async () => {
            await resetStockFilters();
        });
    }
    
    const saveBtn = document.getElementById('save-stock-btn');
    if (saveBtn) {
        // Remove any existing event listeners to prevent duplicates
        const newSaveBtn = saveBtn.cloneNode(true);
        saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
        
        // Add fresh event listener
        newSaveBtn.addEventListener('click', async () => {
            await saveStockVivantData();
        });
    }
    
    const clearBtn = document.getElementById('clear-stock-btn');
    if (clearBtn) {
        // Remove any existing event listeners to prevent duplicates
        const newClearBtn = clearBtn.cloneNode(true);
        clearBtn.parentNode.replaceChild(newClearBtn, clearBtn);
        
        // Add fresh event listener
        newClearBtn.addEventListener('click', clearSimpleStockVivant);
    }
    
    // Copy button
    const copyBtn = document.getElementById('copy-stock-btn');
    if (copyBtn) {
        // Remove any existing event listeners to prevent duplicates
        const newCopyBtn = copyBtn.cloneNode(true);
        copyBtn.parentNode.replaceChild(newCopyBtn, copyBtn);
        
        // Add fresh event listener
        newCopyBtn.addEventListener('click', openCopyStockModal);
    }
    
    const exportBtn = document.getElementById('export-stock-btn');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportStockData);
    }
    
    // Dates selector for history
    const datesSelect = document.getElementById('stock-dates-select');
    if (datesSelect) {
        datesSelect.addEventListener('change', function() {
            if (this.value) {
                loadStockVivantBySelectedDate(this.value);
            }
        });
    }
    
    console.log('✅ Event listeners stock vivant configurés');
}

// Show specific stock mode
async function showStockMode(mode) {
    console.log('🔄 CLIENT: Affichage mode:', mode);
    
    // Hide all panels
    document.querySelectorAll('.stock-mode-panel').forEach(panel => {
        panel.style.display = 'none';
    });
    
    // Show selected panel
    const selectedPanel = document.getElementById(`stock-vivant-${mode}`);
    if (selectedPanel) {
        selectedPanel.style.display = 'block';
    }
    
    // Load data based on mode and auto-load latest data
    switch(mode) {
        case 'saisie':
            console.log('📝 Mode saisie activé');
            await displaySimpleStockVivantTable();
            break;
        case 'consultation':
            console.log('👁️ Mode consultation activé');
            // Auto-load latest date for consultation
            const latestDate = await getLastStockVivantDate();
            if (latestDate) {
                const dateInput = document.getElementById('stock-vivant-date');
                if (dateInput) {
                    dateInput.value = latestDate;
                }
                await loadStockVivantForConsultation();
            }
            break;
        case 'historique':
            console.log('📜 Mode historique activé');
            await loadStockVivantDates();
            break;
    }
}

// Display simple stock vivant table (modern version)
async function displaySimpleStockVivantTable() {
    const container = document.getElementById('stock-vivant-simple-table');
    if (!container) {
        console.error('❌ Container stock-vivant-simple-table introuvable');
        return;
    }
    
    // Show loading message
    container.innerHTML = '<div class="loading-message"><i class="fas fa-spinner fa-spin"></i> Chargement des données...</div>';
    
    try {
        // Get selected date or use latest date ONLY on first load
        const dateInput = document.querySelector('input[type="date"]#stock-vivant-date');
        let selectedDate = dateInput ? dateInput.value : null;
        
        // If no date selected AND it's the first load, get the latest date with data
        if (!selectedDate) {
            // Only auto-load if the date input is empty (not manually set by user)
            selectedDate = await getLastStockVivantDate();
            if (selectedDate && dateInput && !dateInput.dataset.userSelected) {
                dateInput.value = selectedDate;
                console.log('📅 Auto-loaded latest date:', selectedDate);
            }
        } else {
            // Mark that user has manually selected a date
            if (dateInput) {
                dateInput.dataset.userSelected = 'true';
                console.log('📅 Using user-selected date:', selectedDate);
            }
        }
        
        let existingData = [];
        
        // Load existing data for the selected date
        if (selectedDate) {
            try {
                const response = await fetch(apiUrl(`/api/stock-vivant?date=${selectedDate}`));
                if (response.ok) {
                    existingData = await response.json();
                    console.log('📊 Données existantes chargées:', existingData.length, 'entrées pour', selectedDate);
                    console.log('📊 Sample data:', existingData.slice(0, 2)); // Log sample data for debugging
                } else {
                    console.log('📊 Aucune donnée existante pour', selectedDate);
                }
            } catch (error) {
                console.warn('⚠️ Impossible de charger les données existantes:', error.message);
            }
        }
        
        // Generate table with existing data
        const tableHtml = generateStockVivantTables(existingData);
        container.innerHTML = tableHtml;
        
        // Calculate and display grand total
        setTimeout(() => {
            updateGrandTotal();
        }, 100);
        
        // Show data info
        if (existingData.length > 0) {
            //showStockVivantNotification(`Données chargées pour ${formatDate(selectedDate)} (${existingData.length} entrées)`, 'success');
        } else if (selectedDate) {
            showStockVivantNotification(`Nouveau stock pour ${formatDate(selectedDate)}`, 'info');
        } else {
            showStockVivantNotification('Aucune date sélectionnée', 'warning');
        }
        
    } catch (error) {
        console.error('❌ Erreur lors de l\'affichage du tableau:', error);
        container.innerHTML = '<div class="error-message"><i class="fas fa-exclamation-triangle"></i> Erreur lors du chargement</div>';
        showStockVivantNotification('Erreur lors du chargement: ' + error.message, 'error');
    }
}

// Load stock vivant for consultation mode
async function loadStockVivantForConsultation() {
    const container = document.getElementById('stock-vivant-view-table');
    if (!container) {
        console.error('❌ Container stock-vivant-view-table introuvable');
        return;
    }
    
    container.innerHTML = '<div class="loading-message"><i class="fas fa-spinner fa-spin"></i> Chargement...</div>';
    
    try {
        const dateInput = document.getElementById('stock-vivant-date');
        let selectedDate = dateInput ? dateInput.value : null;
        
        // If no date selected, get the latest date with data
        if (!selectedDate) {
            selectedDate = await getLastStockVivantDate();
            if (selectedDate && dateInput) {
                dateInput.value = selectedDate;
                console.log('📅 Auto-loaded latest date for consultation:', selectedDate);
            }
        }
        
        if (!selectedDate) {
            container.innerHTML = '<div class="info-message"><i class="fas fa-info-circle"></i> Aucune donnée disponible</div>';
            return;
        }
        
        const response = await fetch(apiUrl(`/api/stock-vivant?date=${selectedDate}`));
        
        if (!response.ok) {
            throw new Error(`Erreur API: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.length === 0) {
            container.innerHTML = `<div class="info-message"><i class="fas fa-info-circle"></i> Aucune donnée pour le ${formatDate(selectedDate)}</div>`;
            return;
        }
        
        displayStockVivantViewData(data);
        showStockVivantNotification(`Consultation: ${data.length} entrées pour ${formatDate(selectedDate)}`, 'success');
        
    } catch (error) {
        console.error('❌ Erreur chargement consultation:', error);
        container.innerHTML = '<div class="error-message"><i class="fas fa-exclamation-triangle"></i> Erreur lors du chargement</div>';
        showStockVivantNotification('Erreur lors du chargement: ' + error.message, 'error');
    }
}

// Reset stock filters
async function resetStockFilters() {
    console.log('🔄 CLIENT: Réinitialisation des filtres');
    
    // Get latest date with data
    const latestDate = await getLastStockVivantDate();
    const dateToUse = latestDate || new Date().toISOString().split('T')[0];
    
    // Reset date to latest date or today
    const dateInput = document.getElementById('stock-vivant-date');
    if (dateInput) {
        dateInput.value = dateToUse;
    }
    
    // Reset mode to saisie
    const modeSelect = document.getElementById('stock-vivant-mode');
    if (modeSelect) {
        modeSelect.value = 'saisie';
        await showStockMode('saisie');
    }
    
    // Reset category filter
    const categoryFilter = document.getElementById('stock-vivant-category-filter');
    if (categoryFilter) {
        categoryFilter.value = '';
        filterStockByCategory('');
    }
    
    showStockVivantNotification('Filtres réinitialisés', 'info');
}

// Filter stock by category
function filterStockByCategory(categoryValue) {
    console.log('🔍 CLIENT: Filtrage par catégorie:', categoryValue);
    
    const tables = document.querySelectorAll('.stock-category-table');
    tables.forEach(table => {
        const category = table.dataset.category;
        if (!categoryValue || category === categoryValue) {
            table.style.display = 'block';
        } else {
            table.style.display = 'none';
        }
    });
    
    updateGrandTotal();
}

// Export stock data
function exportStockData() {
    console.log('📤 CLIENT: Export des données stock');
    showStockVivantNotification('Fonctionnalité d\'export en cours de développement', 'info');
}

// Load stock vivant by selected date
async function loadStockVivantBySelectedDate(selectedDate) {
    console.log('📅 CLIENT: Chargement stock pour date:', selectedDate);
    
    try {
        const response = await fetch(apiUrl(`/api/stock-vivant?date=${selectedDate}`));
        
        if (!response.ok) {
            throw new Error(`Erreur API: ${response.status}`);
        }
        
        const data = await response.json();
        
        const container = document.getElementById('stock-vivant-history-table');
        if (container) {
            if (data.length === 0) {
                container.innerHTML = `<div class="info-message"><i class="fas fa-info-circle"></i> Aucune donnée pour le ${formatDate(selectedDate)}</div>`;
            } else {
                displayStockVivantViewData(data);
                showStockVivantNotification(`Historique: ${data.length} entrées pour ${formatDate(selectedDate)}`, 'success');
            }
        }
        
    } catch (error) {
        console.error('❌ Erreur chargement historique:', error);
        showStockVivantNotification('Erreur lors du chargement de l\'historique: ' + error.message, 'error');
    }
}

// Initialize modern Stock Vivant interface
async function initializeModernStockVivant() {
    console.log('🎨 CLIENT: Initialisation interface Stock Vivant moderne');
    
    try {
        // Get latest date with data
        const latestDate = await getLastStockVivantDate();
        const dateToUse = latestDate || new Date().toISOString().split('T')[0];
        
        // Set date input
        const dateInput = document.getElementById('stock-vivant-date');
        if (dateInput) {
            dateInput.value = dateToUse;
            console.log('📅 Date par défaut définie:', dateToUse);
        }
        
        // Populate category filter
        populateStockVivantCategoryFilter();
        
        // Setup modern events
        setupModernStockVivantEvents();
        
        // Show default mode (saisie) with auto-load
        if (stockVivantConfig && stockVivantConfig.categories) {
            await showStockMode('saisie');
        } else {
            console.log('⏳ Configuration pas encore chargée, attente...');
            // Show loading message
            const container = document.getElementById('stock-vivant-simple-table');
            if (container) {
                container.innerHTML = '<div class="loading-message"><i class="fas fa-spinner fa-spin"></i> Chargement de la configuration...</div>';
            }
        }
        
        console.log('✅ CLIENT: Interface moderne initialisée');
        
    } catch (error) {
        console.error('❌ Erreur initialisation interface moderne:', error);
        showStockVivantNotification('Erreur lors de l\'initialisation: ' + error.message, 'error');
    }
}

// Fonctions pour le modal de confirmation de dépense
function showExpenseConfirmationModal() {
    try {
        // Remplir le résumé avec les données du formulaire
        populateExpenseConfirmationSummary();
        
        // Afficher la validation du budget
        displayBudgetValidationInModal();
        
        // Afficher le modal
        document.getElementById('expense-confirmation-modal').style.display = 'block';
        document.body.style.overflow = 'hidden';
        
    } catch (error) {
        console.error('Erreur lors de l\'affichage du modal de confirmation:', error);
        showNotification('Erreur lors de l\'affichage de la confirmation', 'error');
    }
}

function closeExpenseConfirmationModal() {
    document.getElementById('expense-confirmation-modal').style.display = 'none';
    document.body.style.overflow = 'auto';
    // Ne pas nettoyer les données ici - elles seront nettoyées après la soumission
}

function populateExpenseConfirmationSummary() {
    if (!window.pendingExpenseFormData) return;
    
    const formData = window.pendingExpenseFormData;
    
    // Récupérer les textes des sélections
    const accountSelect = document.getElementById('expense-account');
    const typeSelect = document.getElementById('expense-type');
    const categorySelect = document.getElementById('expense-category');
    const subcategorySelect = document.getElementById('expense-subcategory');
    const socialNetworkSelect = document.getElementById('social-network-detail');
    const predictableSelect = document.getElementById('expense-predictable');
    
    // Remplir les éléments du résumé
    document.getElementById('confirm-account').textContent = 
        accountSelect.options[accountSelect.selectedIndex]?.text || '—';
    
    document.getElementById('confirm-type').textContent = 
        typeSelect.options[typeSelect.selectedIndex]?.text || '—';
    
    document.getElementById('confirm-category').textContent = 
        categorySelect.options[categorySelect.selectedIndex]?.text || '—';
    
    document.getElementById('confirm-subcategory').textContent = 
        subcategorySelect.options[subcategorySelect.selectedIndex]?.text || '—';
    
    // Réseau social (si applicable)
    const socialRow = document.getElementById('confirm-social-row');
    if (socialNetworkSelect.value) {
        socialRow.style.display = 'flex';
        document.getElementById('confirm-social').textContent = 
            socialNetworkSelect.options[socialNetworkSelect.selectedIndex]?.text || '—';
    } else {
        socialRow.style.display = 'none';
    }
    
    // Date formatée
    const dateValue = formData.get('expense_date');
    document.getElementById('confirm-date').textContent = 
        dateValue ? formatDate(dateValue) : '—';
    
    document.getElementById('confirm-designation').textContent = 
        formData.get('designation') || '—';
    
    document.getElementById('confirm-supplier').textContent = 
        formData.get('supplier') || '—';
    
    document.getElementById('confirm-quantity').textContent = 
        formData.get('quantity') || '—';
    
    const unitPrice = parseInt(formData.get('unit_price')) || 0;
    document.getElementById('confirm-unit-price').textContent = 
        unitPrice > 0 ? formatCurrency(unitPrice) : '—';
    
    const total = parseInt(formData.get('total')) || 0;
    document.getElementById('confirm-total').textContent = 
        total > 0 ? formatCurrency(total) : '—';
    
    document.getElementById('confirm-predictable').textContent = 
        predictableSelect.options[predictableSelect.selectedIndex]?.text || '—';
    
    // Description (si fournie)
    const description = formData.get('description');
    const descriptionRow = document.getElementById('confirm-description-row');
    if (description && description.trim()) {
        descriptionRow.style.display = 'flex';
        document.getElementById('confirm-description').textContent = description;
    } else {
        descriptionRow.style.display = 'none';
    }
    
    // Fichier (si fourni)
    const fileRow = document.getElementById('confirm-file-row');
    const file = formData.get('justification');
    if (file && file.name) {
        fileRow.style.display = 'flex';
        document.getElementById('confirm-file').textContent = file.name;
    } else {
        fileRow.style.display = 'none';
    }
}
// FONCTION DE VALIDATION BUDGET DANS MODAL - AVEC CONFIGURATION DYNAMIQUE
async function displayBudgetValidationInModal() {
    try {
        const budgetContainer = document.getElementById('budget-validation');
        const confirmBtn = document.getElementById('confirm-expense-btn');
        
        // Charger le statut de validation actuel
        const response = await fetch('/api/validation-status');
        let validationEnabled = true; // Par défaut
        
        if (response.ok) {
            const statusData = await response.json();
            validationEnabled = statusData.validate_expense_balance;
        }
        
        console.log('💰 Statut validation dans modal:', validationEnabled ? 'ACTIVÉE' : 'DÉSACTIVÉE');
        
        if (validationEnabled) {
            // Validation activée - vérifier le budget
            await displayRealBudgetValidation(budgetContainer, confirmBtn);
        } else {
            // Validation désactivée - autoriser la dépense
            budgetContainer.className = 'budget-validation budget-ok';
            budgetContainer.innerHTML = `
                <strong>⚠️ Validation des dépenses désactivée</strong><br>
                Mode libre activé - Vous pouvez procéder à l'ajout de cette dépense.
            `;
            
            if (confirmBtn) {
                confirmBtn.disabled = false;
                confirmBtn.style.opacity = '1';
                confirmBtn.style.cursor = 'pointer';
            }
        }
        
    } catch (error) {
        console.error('Erreur validation budget dans modal:', error);
    }
}

// Fonction pour effectuer la vraie validation du budget quand elle est activée
async function displayRealBudgetValidation(budgetContainer, confirmBtn) {
    try {
        // Récupérer les données du formulaire depuis window.pendingExpenseFormData
        if (!window.pendingExpenseFormData) {
            budgetContainer.className = 'budget-validation budget-warning';
            budgetContainer.innerHTML = `
                <strong>⚠️ Données de formulaire manquantes</strong><br>
                Impossible de vérifier le budget.
            `;
            if (confirmBtn) confirmBtn.disabled = true;
            return;
        }
        
        const accountId = window.pendingExpenseFormData.get('account_id');
        const totalAmount = parseInt(window.pendingExpenseFormData.get('total')) || parseInt(document.getElementById('total-amount').textContent.replace(/[^\d]/g, ''));
        
        if (!accountId) {
            budgetContainer.className = 'budget-validation budget-warning';
            budgetContainer.innerHTML = `
                <strong>⚠️ Compte non sélectionné</strong><br>
                Veuillez sélectionner un compte pour vérifier le budget.
            `;
            if (confirmBtn) confirmBtn.disabled = true;
            return;
        }
        
        // Récupérer les informations du compte
        const response = await fetch(`/api/accounts/${accountId}/balance`);
        if (!response.ok) {
            budgetContainer.className = 'budget-validation budget-warning';
            budgetContainer.innerHTML = `
                <strong>⚠️ Erreur de vérification</strong><br>
                Impossible de vérifier le solde du compte.
            `;
            if (confirmBtn) confirmBtn.disabled = true;
            return;
        }
        
        const accountData = await response.json();
        const currentBalance = accountData.current_balance;
        
        console.log('💰 Vérification budget modal:');
        console.log('  - Compte:', accountData.account_name);
        console.log('  - Solde actuel:', currentBalance);
        console.log('  - Montant demandé:', totalAmount);
        
        // Vérification du solde (sauf comptes statut)
        if (accountData.account_type === 'statut') {
            budgetContainer.className = 'budget-validation budget-ok';
            budgetContainer.innerHTML = `
                <strong>✅ Compte STATUT - Validation ignorée</strong><br>
                Les comptes de statut ne sont pas soumis à la validation de solde.
            `;
            if (confirmBtn) {
                confirmBtn.disabled = false;
                confirmBtn.style.opacity = '1';
                confirmBtn.style.cursor = 'pointer';
            }
        } else if (currentBalance >= totalAmount) {
            budgetContainer.className = 'budget-validation budget-ok';
            budgetContainer.innerHTML = `
                <strong>✅ Budget suffisant</strong><br>
                Solde disponible: ${currentBalance.toLocaleString()} FCFA<br>
                Montant demandé: ${totalAmount.toLocaleString()} FCFA
            `;
            if (confirmBtn) {
                confirmBtn.disabled = false;
                confirmBtn.style.opacity = '1';
                confirmBtn.style.cursor = 'pointer';
            }
        } else {
            budgetContainer.className = 'budget-validation budget-error';
            budgetContainer.innerHTML = `
                <strong>❌ Budget insuffisant</strong><br>
                Solde disponible: ${currentBalance.toLocaleString()} FCFA<br>
                Montant demandé: ${totalAmount.toLocaleString()} FCFA<br>
                Déficit: ${(totalAmount - currentBalance).toLocaleString()} FCFA
            `;
            if (confirmBtn) {
                confirmBtn.disabled = true;
                confirmBtn.style.opacity = '0.5';
                confirmBtn.style.cursor = 'not-allowed';
            }
        }
        
    } catch (error) {
        console.error('Erreur validation budget réelle:', error);
        budgetContainer.className = 'budget-validation budget-warning';
        budgetContainer.innerHTML = `
            <strong>⚠️ Erreur de validation</strong><br>
            Une erreur est survenue lors de la vérification du budget.
        `;
        if (confirmBtn) confirmBtn.disabled = true;
    }
}

async function confirmAndSubmitExpense() {
    if (!window.pendingExpenseFormData) {
        showNotification('Erreur: données de dépense non trouvées', 'error');
        return;
    }
    
    try {
        // Sauvegarder les données avant de fermer le modal
        const formDataToSubmit = window.pendingExpenseFormData;
        
        // Fermer le modal
        closeExpenseConfirmationModal();
        
        // Procéder à l'ajout de la dépense
        await addExpenseWithFile(formDataToSubmit);
        
        // Nettoyer les données après succès
        delete window.pendingExpenseFormData;
        
    } catch (error) {
        console.error('Erreur lors de la soumission:', error);
        showNotification(`Erreur lors de l'ajout de la dépense: ${error.message}`, 'error');
        // Nettoyer les données même en cas d'erreur
        delete window.pendingExpenseFormData;
    }
}

// === FONCTIONS DE COPIE STOCK VIVANT ===

async function openCopyStockModal() {
    console.log('📋 Ouverture du modal de copie Stock Vivant');
    
    // Get the target date (currently selected date)
    const dateInput = document.querySelector('input[type="date"]#stock-vivant-date');
    const targetDate = dateInput ? dateInput.value : null;
    
    if (!targetDate) {
        showStockVivantNotification('Veuillez d\'abord sélectionner une date de destination', 'error');
        return;
    }
    
    // Display target date in modal
    document.getElementById('copy-target-date').textContent = formatDate(targetDate);
    
    // Show modal
    const modal = document.getElementById('copy-stock-modal');
    modal.style.display = 'block';
    
    // Load available past dates
    await loadPastDatesForCopy(targetDate);
}

function closeCopyStockModal() {
    const modal = document.getElementById('copy-stock-modal');
    modal.style.display = 'none';
    
    // Reset modal content
    document.getElementById('copy-source-date').innerHTML = '<option value="">Chargement des dates disponibles...</option>';
    document.getElementById('copy-source-preview').style.display = 'none';
    document.getElementById('confirm-copy-btn').disabled = true;
}

async function loadPastDatesForCopy(targetDate) {
    console.log('📅 Chargement des dates antérieures à:', targetDate);
    
    try {
        // Get all available dates
        const response = await fetch(apiUrl('/api/stock-vivant/dates'));
        if (!response.ok) throw new Error('Erreur lors du chargement des dates');
        
        const datesResponse = await response.json();
        const targetDateObj = new Date(targetDate);
        
        // Extract date strings from objects if needed
        const dates = Array.isArray(datesResponse) && datesResponse.length > 0 && typeof datesResponse[0] === 'object' 
            ? datesResponse.map(item => item.date) 
            : datesResponse;
        
        console.log('📅 Dates reçues du serveur:', dates.length, 'Format:', typeof dates[0]);
        
        // Filter to only past dates (antérieures)
        const pastDates = dates.filter(dateStr => {
            const dateObj = new Date(dateStr);
            return dateObj < targetDateObj;
        });
        
        console.log('📅 Dates antérieures trouvées:', pastDates.length);
        
        // Vérifier quelles dates ont vraiment des données (quantité > 0 ou prix > 0)
        const datesWithRealData = [];
        
        for (const dateStr of pastDates) {
            try {
                const response = await fetch(apiUrl(`/api/stock-vivant?date=${dateStr}`));
                if (response.ok) {
                    const data = await response.json();
                    // Vérifier s'il y a des données réelles (quantité > 0 ou prix > 0)
                    const hasRealData = data.some(item => 
                        (item.quantite && item.quantite > 0) || 
                        (item.prix_unitaire && item.prix_unitaire > 0)
                    );
                    
                    if (hasRealData) {
                        datesWithRealData.push(dateStr);
                        console.log(`✅ Date ${dateStr}: ${data.length} entrées avec données`);
                    } else {
                        console.log(`❌ Date ${dateStr}: ${data.length} entrées mais aucune donnée réelle`);
                    }
                }
            } catch (error) {
                console.warn(`⚠️ Erreur vérification date ${dateStr}:`, error.message);
            }
            
            // Limiter à 5 dates pour éviter trop de requêtes
            if (datesWithRealData.length >= 5) break;
        }
        
        console.log('📅 Dates avec vraies données:', datesWithRealData.length);
        
        const select = document.getElementById('copy-source-date');
        
        if (datesWithRealData.length === 0) {
            select.innerHTML = '<option value="">Aucune date antérieure avec des données réelles</option>';
            return;
        }
        
        // Sort dates in descending order (most recent first) - déjà triées
        const limitedDates = datesWithRealData;
        
        console.log('📅 Dates finales sélectionnées:', limitedDates.length);
        
        // Populate select
        select.innerHTML = '<option value="">Sélectionner une date source</option>';
        limitedDates.forEach(dateStr => {
            const option = document.createElement('option');
            option.value = dateStr;
            option.textContent = formatDate(dateStr);
            select.appendChild(option);
        });
        
        // Add change event listener
        select.addEventListener('change', function() {
            if (this.value) {
                loadSourceDataPreview(this.value);
                document.getElementById('confirm-copy-btn').disabled = false;
            } else {
                document.getElementById('copy-source-preview').style.display = 'none';
                document.getElementById('confirm-copy-btn').disabled = true;
            }
        });
        
    } catch (error) {
        console.error('Erreur chargement dates:', error);
        const select = document.getElementById('copy-source-date');
        select.innerHTML = '<option value="">Erreur lors du chargement</option>';
        showStockVivantNotification('Erreur lors du chargement des dates: ' + error.message, 'error');
    }
}

async function loadSourceDataPreview(sourceDate) {
    console.log('🔍 Chargement aperçu pour:', sourceDate);
    
    try {
        const response = await fetch(apiUrl(`/api/stock-vivant?date=${sourceDate}`));
        if (!response.ok) throw new Error('Erreur lors du chargement des données');
        
        const data = await response.json();
        console.log('📊 Données trouvées:', data.length, 'entrées');
        
        const previewContainer = document.getElementById('copy-source-preview');
        const previewContent = previewContainer.querySelector('.preview-content');
        
        if (data.length === 0) {
            previewContent.innerHTML = '<p class="text-muted">Aucune donnée trouvée pour cette date</p>';
        } else {
            let totalValue = 0;
            let html = '<div class="preview-summary">';
            
            data.forEach(item => {
                const total = item.quantite * item.prix_unitaire * (1 - item.decote);
                totalValue += total;
                
                html += `
                    <div class="preview-item">
                        <strong>${stockVivantConfig.labels[item.categorie] || item.categorie}</strong> - 
                        ${stockVivantConfig.labels[item.produit] || item.produit}: 
                        ${item.quantite} × ${formatCurrency(item.prix_unitaire)} = 
                        <strong>${formatCurrency(total)}</strong>
                    </div>
                `;
            });
            
            html += `<div class="preview-total"><strong>Total: ${formatCurrency(totalValue)}</strong></div>`;
            html += '</div>';
            
            previewContent.innerHTML = html;
        }
        
        previewContainer.style.display = 'block';
        
    } catch (error) {
        console.error('Erreur chargement aperçu:', error);
        const previewContent = document.getElementById('copy-source-preview').querySelector('.preview-content');
        previewContent.innerHTML = '<p class="text-error">Erreur lors du chargement de l\'aperçu</p>';
        showStockVivantNotification('Erreur lors du chargement de l\'aperçu: ' + error.message, 'error');
    }
}

async function confirmCopyStockData() {
    const targetDate = document.querySelector('input[type="date"]#stock-vivant-date').value;
    const sourceDate = document.getElementById('copy-source-date').value;
    
    if (!targetDate || !sourceDate) {
        showStockVivantNotification('Dates manquantes pour la copie', 'error');
        return;
    }
    
    console.log('🔄 Copie de', sourceDate, 'vers', targetDate);
    
    // Confirmation popup
    const confirmMessage = `Êtes-vous sûr de vouloir copier les données du ${formatDate(sourceDate)} vers le ${formatDate(targetDate)} ?

⚠️ Cette action remplacera toutes les données existantes pour le ${formatDate(targetDate)}.

📋 Les données de ${formatDate(sourceDate)} seront dupliquées pour ${formatDate(targetDate)}.`;
    
    if (!confirm(confirmMessage)) {
        return;
    }
    
    try {
        // Load source data
        const response = await fetch(apiUrl(`/api/stock-vivant?date=${sourceDate}`));
        if (!response.ok) throw new Error('Erreur lors du chargement des données source');
        
        const sourceData = await response.json();
        
        if (sourceData.length === 0) {
            showStockVivantNotification('Aucune donnée à copier', 'warning');
            return;
        }
        
        // Transform data for target date
        const stockData = sourceData.map(item => ({
            categorie: item.categorie,
            produit: item.produit,
            quantite: item.quantite,
            prix_unitaire: item.prix_unitaire,
            decote: item.decote,
            commentaire: item.commentaire ? `${item.commentaire} (Copié depuis ${formatDate(sourceDate)})` : `Copié depuis ${formatDate(sourceDate)}`
        }));
        
        console.log('📦 Données à copier:', stockData.length, 'entrées');
        
        // Save to target date with replace_existing = true
        const saveResponse = await fetch(apiUrl('/api/stock-vivant/update'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                date_stock: targetDate,
                stockData: stockData,
                replace_existing: true
            })
        });
        
        const saveResult = await saveResponse.json();
        
        if (!saveResponse.ok) {
            throw new Error(saveResult.error || 'Erreur lors de la sauvegarde');
        }
        
        console.log('✅ Copie terminée:', saveResult.processedCount, 'entrées');
        
        // Close modal
        closeCopyStockModal();
        
        // Reload the table to show copied data
        await displaySimpleStockVivantTable();
        
        // Show success message
        showStockVivantNotification(
            `Données copiées avec succès: ${saveResult.processedCount} entrées du ${formatDate(sourceDate)} vers le ${formatDate(targetDate)}`, 
            'success'
        );
        
    } catch (error) {
        console.error('Erreur lors de la copie:', error);
        showStockVivantNotification('Erreur lors de la copie: ' + error.message, 'error');
    }
}

// =====================================================
// ADMIN CONFIG FUNCTIONS
// =====================================================

async function initAdminConfig() {
    console.log('🔧 Initialisation de la configuration admin');
    
    // Vérifier les permissions
    if (!['directeur_general', 'pca', 'admin'].includes(currentUser.role)) {
        showNotification('Accès refusé - Privilèges administrateur requis', 'error');
        return;
    }

    // Initialiser les onglets
    setupConfigTabs();
    
    // Charger les configurations
    await loadCategoriesConfig();
    await loadStockVivantConfig();
    await loadFinancialConfig();
    
    // Charger les permissions stock vivant
    await loadStockVivantDirectors();
    
    // Configurer les événements
    setupConfigEventListeners();
    
    // Configurer le nettoyage des highlights d'accolades
    setupBraceHighlightCleanup('categories');
    setupBraceHighlightCleanup('stock-vivant');
    setupBraceHighlightCleanup('financial');
}

function setupConfigTabs() {
    const tabButtons = document.querySelectorAll('.tab-button');
    const configPanels = document.querySelectorAll('.config-panel');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const configType = button.getAttribute('data-config');
            
            // Désactiver tous les onglets et panneaux
            tabButtons.forEach(btn => btn.classList.remove('active'));
            configPanels.forEach(panel => panel.classList.remove('active'));
            
            // Activer l'onglet et le panneau sélectionnés
            button.classList.add('active');
            
            if (configType === 'categories') {
                document.getElementById('categories-config').classList.add('active');
            } else if (configType === 'stock-vivant') {
                document.getElementById('stock-vivant-config').classList.add('active');
            } else if (configType === 'financial') {
                document.getElementById('financial-config').classList.add('active');
            } else if (configType === 'stock-permissions') {
                document.getElementById('stock-permissions-config').classList.add('active');
                // Initialiser les permissions lorsque l'onglet est activé
                initStockVivantPermissions();
            }
        });
    });
}

function setupConfigEventListeners() {
    // Configuration des listeners pour l'interface financière conviviale
    setupFinancialSettingsListeners();
    
    // Événements pour la configuration des catégories
    document.getElementById('save-categories-config').addEventListener('click', saveCategoriesConfig);
    document.getElementById('reload-categories-config').addEventListener('click', loadCategoriesConfig);
    
    const categoriesEditor = document.getElementById('categories-json-editor');
    categoriesEditor.addEventListener('input', () => {
        document.getElementById('save-categories-config').disabled = false;
        updateLineNumbers('categories');
        updateCursorPosition('categories');
        validateJsonRealTime('categories');
    });
    
    categoriesEditor.addEventListener('scroll', () => syncLineNumbersScroll('categories'));
    categoriesEditor.addEventListener('keyup', () => updateCursorPosition('categories'));
    categoriesEditor.addEventListener('click', (e) => {
        updateCursorPosition('categories');
        handleBraceClick(e, 'categories');
    });

    // Toolbar categories
    document.getElementById('format-categories-json').addEventListener('click', () => formatJson('categories'));
    document.getElementById('minify-categories-json').addEventListener('click', () => minifyJson('categories'));
    document.getElementById('validate-categories-json').addEventListener('click', () => validateJson('categories'));
    document.getElementById('undo-categories').addEventListener('click', () => undoJsonChange('categories'));
    document.getElementById('redo-categories').addEventListener('click', () => redoJsonChange('categories'));

    // Événements pour la configuration du stock vivant
    document.getElementById('save-stock-vivant-config').addEventListener('click', saveStockVivantConfig);
    document.getElementById('reload-stock-vivant-config').addEventListener('click', loadStockVivantConfig);
    
    const stockVivantEditor = document.getElementById('stock-vivant-json-editor');
    stockVivantEditor.addEventListener('input', () => {
        document.getElementById('save-stock-vivant-config').disabled = false;
        updateLineNumbers('stock-vivant');
        updateCursorPosition('stock-vivant');
        validateJsonRealTime('stock-vivant');
    });
    
    stockVivantEditor.addEventListener('scroll', () => syncLineNumbersScroll('stock-vivant'));
    stockVivantEditor.addEventListener('keyup', () => updateCursorPosition('stock-vivant'));
    stockVivantEditor.addEventListener('click', (e) => {
        updateCursorPosition('stock-vivant');
        handleBraceClick(e, 'stock-vivant');
    });

    // Toolbar stock vivant
    document.getElementById('format-stock-vivant-json').addEventListener('click', () => formatJson('stock-vivant'));
    document.getElementById('minify-stock-vivant-json').addEventListener('click', () => minifyJson('stock-vivant'));
    document.getElementById('validate-stock-vivant-json').addEventListener('click', () => validateJson('stock-vivant'));
    document.getElementById('undo-stock-vivant').addEventListener('click', () => undoJsonChange('stock-vivant'));
    document.getElementById('redo-stock-vivant').addEventListener('click', () => redoJsonChange('stock-vivant'));

    // Événements pour la configuration des paramètres financiers
    document.getElementById('save-financial-config').addEventListener('click', saveFinancialConfig);
    document.getElementById('reload-financial-config').addEventListener('click', loadFinancialConfig);
    
    const financialEditor = document.getElementById('financial-json-editor');
    financialEditor.addEventListener('input', () => {
        document.getElementById('save-financial-config').disabled = false;
        updateLineNumbers('financial');
        updateCursorPosition('financial');
        validateJsonRealTime('financial');
    });
    
    financialEditor.addEventListener('scroll', () => syncLineNumbersScroll('financial'));
    financialEditor.addEventListener('keyup', () => updateCursorPosition('financial'));
    financialEditor.addEventListener('click', (e) => {
        updateCursorPosition('financial');
        handleBraceClick(e, 'financial');
    });

    // Toolbar paramètres financiers
    document.getElementById('format-financial-json').addEventListener('click', () => formatJson('financial'));
    document.getElementById('minify-financial-json').addEventListener('click', () => minifyJson('financial'));
    document.getElementById('validate-financial-json').addEventListener('click', () => validateJson('financial'));
    document.getElementById('undo-financial').addEventListener('click', () => undoJsonChange('financial'));
    document.getElementById('redo-financial').addEventListener('click', () => redoJsonChange('financial'));
}

// Variables globales pour l'historique des modifications
const jsonHistory = {
    categories: { undo: [], redo: [] },
    'stock-vivant': { undo: [], redo: [] },
    'financial': { undo: [], redo: [] }
};

async function loadCategoriesConfig() {
    try {
        const response = await fetch('/api/admin/config/categories');
        
        if (response.ok) {
            const config = await response.json();
            const editor = document.getElementById('categories-json-editor');
            editor.value = JSON.stringify(config, null, 2);
            document.getElementById('save-categories-config').disabled = true;
            
            // Initialiser les fonctionnalités de l'éditeur
            updateLineNumbers('categories');
            updateCursorPosition('categories');
            validateJsonRealTime('categories');
            saveToHistory('categories', editor.value);
            
           // showNotification('Configuration des catégories chargée', 'success');
        } else {
            const error = await response.json();
            throw new Error(error.error || 'Erreur lors du chargement');
        }
    } catch (error) {
        console.error('Erreur chargement config catégories:', error);
        showNotification(`Erreur: ${error.message}`, 'error');
    }
}

async function saveCategoriesConfig() {
    try {
        const editor = document.getElementById('categories-json-editor');
        const configText = editor.value.trim();
        
        if (!configText) {
            showNotification('La configuration ne peut pas être vide', 'error');
            return;
        }

        // Valider le JSON
        let config;
        try {
            config = JSON.parse(configText);
        } catch (parseError) {
            showNotification('JSON invalide: ' + parseError.message, 'error');
            updateJsonStatus('categories', 'error', `Erreur: ${parseError.message}`);
            return;
        }
        
        // Sauvegarder dans l'historique avant la modification
        saveToHistory('categories', configText);

        // Sauvegarder
        const response = await fetch('/api/admin/config/categories', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(config)
        });

        if (response.ok) {
            const result = await response.json();
            showNotification(result.message, 'success');
            document.getElementById('save-categories-config').disabled = true;
            
            // Recharger les catégories dans l'application
            await loadCategories();
        } else {
            const error = await response.json();
            throw new Error(error.error || 'Erreur lors de la sauvegarde');
        }
    } catch (error) {
        console.error('Erreur sauvegarde config catégories:', error);
        showNotification(`Erreur: ${error.message}`, 'error');
    }
}

async function loadStockVivantConfig() {
    try {
        const response = await fetch('/api/admin/config/stock-vivant');
        
        if (response.ok) {
            const config = await response.json();
            const editor = document.getElementById('stock-vivant-json-editor');
            editor.value = JSON.stringify(config, null, 2);
            document.getElementById('save-stock-vivant-config').disabled = true;
            
            // Initialiser les fonctionnalités de l'éditeur
            updateLineNumbers('stock-vivant');
            updateCursorPosition('stock-vivant');
            validateJsonRealTime('stock-vivant');
            saveToHistory('stock-vivant', editor.value);
            
            //showNotification('Configuration du stock vivant chargée', 'success');
        } else {
            const error = await response.json();
            throw new Error(error.error || 'Erreur lors du chargement');
        }
    } catch (error) {
        console.error('Erreur chargement config stock vivant:', error);
        showNotification(`Erreur: ${error.message}`, 'error');
    }
}

async function saveStockVivantConfig() {
    try {
        const editor = document.getElementById('stock-vivant-json-editor');
        const configText = editor.value.trim();
        
        if (!configText) {
            showNotification('La configuration ne peut pas être vide', 'error');
            return;
        }

        // Valider le JSON
        let config;
        try {
            config = JSON.parse(configText);
        } catch (parseError) {
            showNotification('JSON invalide: ' + parseError.message, 'error');
            updateJsonStatus('stock-vivant', 'error', `Erreur: ${parseError.message}`);
            return;
        }
        
        // Sauvegarder dans l'historique avant la modification
        saveToHistory('stock-vivant', configText);

        // Sauvegarder
        const response = await fetch('/api/admin/config/stock-vivant', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(config)
        });

        if (response.ok) {
            const result = await response.json();
            showNotification(result.message, 'success');
            document.getElementById('save-stock-vivant-config').disabled = true;
        } else {
            const error = await response.json();
            throw new Error(error.error || 'Erreur lors de la sauvegarde');
        }
    } catch (error) {
        console.error('Erreur sauvegarde config stock vivant:', error);
        showNotification(`Erreur: ${error.message}`, 'error');
    }
}

async function loadFinancialConfig() {
    try {
        const response = await fetch('/api/admin/config/financial');
        
        if (response.ok) {
            const config = await response.json();
            const editor = document.getElementById('financial-json-editor');
            editor.value = JSON.stringify(config, null, 2);
            document.getElementById('save-financial-config').disabled = true;
            
            // Mettre à jour l'interface conviviale
            updateFinancialSettingsUI(config);
            
            // Initialiser les fonctionnalités de l'éditeur
            updateLineNumbers('financial');
            updateCursorPosition('financial');
            validateJsonRealTime('financial');
            saveToHistory('financial', editor.value);
            
            //showNotification('Paramètres financiers chargés', 'success');
        } else {
            const error = await response.json();
            throw new Error(error.error || 'Erreur lors du chargement');
        }
    } catch (error) {
        console.error('Erreur chargement paramètres financiers:', error);
        showNotification(`Erreur: ${error.message}`, 'error');
    }
}

async function saveFinancialConfig() {
    try {
        const editor = document.getElementById('financial-json-editor');
        const configText = editor.value.trim();
        
        if (!configText) {
            showNotification('La configuration ne peut pas être vide', 'error');
            return;
        }

        // Valider le JSON
        let config;
        try {
            config = JSON.parse(configText);
        } catch (parseError) {
            showNotification('JSON invalide: ' + parseError.message, 'error');
            updateJsonStatus('financial', 'error', `Erreur: ${parseError.message}`);
            return;
        }
        
        // Sauvegarder dans l'historique avant la modification
        saveToHistory('financial', configText);

        // Sauvegarder
        const response = await fetch('/api/admin/config/financial', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(config)
        });

        if (response.ok) {
            const result = await response.json();
            showNotification(result.message, 'success');
            document.getElementById('save-financial-config').disabled = true;
            
            // Recharger le statut de validation si la section add-expense est active
            const addExpenseSection = document.getElementById('add-expense-section');
            if (addExpenseSection && addExpenseSection.classList.contains('active')) {
                loadValidationStatus();
            }
        } else {
            const error = await response.json();
            throw new Error(error.error || 'Erreur lors de la sauvegarde');
        }
    } catch (error) {
        console.error('Erreur sauvegarde paramètres financiers:', error);
        showNotification(`Erreur: ${error.message}`, 'error');
    }
}

// =====================================================
// ENHANCED JSON EDITOR FUNCTIONS
// =====================================================

// Fonctions pour l'interface conviviale des paramètres financiers
function updateFinancialSettingsUI(config) {
    // Mettre à jour le champ des charges fixes
    const chargesFixesInput = document.getElementById('charges-fixes-input');
    if (chargesFixesInput && config.charges_fixes_estimation) {
        chargesFixesInput.value = config.charges_fixes_estimation;
    }
    
    // Mettre à jour le slider de validation
    const validateToggle = document.getElementById('validate-balance-toggle');
    const statusText = document.getElementById('validation-status-text');
    const description = document.getElementById('validation-description');
    const validationIcon = document.getElementById('validation-icon');
    
    if (validateToggle && statusText && description && validationIcon) {
        const isValidationEnabled = config.validate_expense_balance !== false; // défaut à true
        
        validateToggle.checked = isValidationEnabled;
        
        // Mettre à jour le texte et les classes
        statusText.textContent = isValidationEnabled ? 'Validation activée' : 'Validation désactivée';
        statusText.className = isValidationEnabled ? 'slider-status enabled' : 'slider-status disabled';
        
        description.textContent = isValidationEnabled 
            ? 'Les dépenses ne peuvent pas dépasser le solde du compte'
            : 'Les dépenses peuvent dépasser le solde du compte (mode libre)';
            
        // Mettre à jour l'icône
        validationIcon.className = isValidationEnabled 
            ? 'fas fa-shield-alt slider-icon enabled' 
            : 'fas fa-exclamation-triangle slider-icon disabled';
    }
}

function setupFinancialSettingsListeners() {
    // Listener pour les charges fixes
    const chargesFixesInput = document.getElementById('charges-fixes-input');
    if (chargesFixesInput) {
        chargesFixesInput.addEventListener('input', function() {
            updateFinancialConfigFromUI();
        });
    }
    
    // Listener pour le slider de validation
    const validateToggle = document.getElementById('validate-balance-toggle');
    if (validateToggle) {
        validateToggle.addEventListener('change', function() {
            const statusText = document.getElementById('validation-status-text');
            const description = document.getElementById('validation-description');
            const validationIcon = document.getElementById('validation-icon');
            
            if (statusText && description && validationIcon) {
                const isEnabled = this.checked;
                
                // Mettre à jour le texte et les classes
                statusText.textContent = isEnabled ? 'Validation activée' : 'Validation désactivée';
                statusText.className = isEnabled ? 'slider-status enabled' : 'slider-status disabled';
                
                description.textContent = isEnabled 
                    ? 'Les dépenses ne peuvent pas dépasser le solde du compte'
                    : 'Les dépenses peuvent dépasser le solde du compte (mode libre)';
                    
                // Mettre à jour l'icône
                validationIcon.className = isEnabled 
                    ? 'fas fa-shield-alt slider-icon enabled' 
                    : 'fas fa-exclamation-triangle slider-icon disabled';
            }
            
            updateFinancialConfigFromUI();
        });
    }
}

function updateFinancialConfigFromUI() {
    try {
        const chargesFixesInput = document.getElementById('charges-fixes-input');
        const validateToggle = document.getElementById('validate-balance-toggle');
        const editor = document.getElementById('financial-json-editor');
        
        if (!editor) return;
        
        // Lire la configuration actuelle
        let config;
        try {
            config = JSON.parse(editor.value);
        } catch (e) {
            config = {
                description: "Paramètres financiers et estimations pour les calculs du système"
            };
        }
        
        // Mettre à jour avec les valeurs de l'interface
        if (chargesFixesInput && chargesFixesInput.value) {
            config.charges_fixes_estimation = parseInt(chargesFixesInput.value);
        }
        
        if (validateToggle) {
            config.validate_expense_balance = validateToggle.checked;
        }
        
        // Mettre à jour l'éditeur JSON
        editor.value = JSON.stringify(config, null, 2);
        
        // Activer le bouton de sauvegarde
        document.getElementById('save-financial-config').disabled = false;
        
        // Mettre à jour les numéros de ligne et la validation
        updateLineNumbers('financial');
        validateJsonRealTime('financial');
        
    } catch (error) {
        console.error('Erreur mise à jour config depuis UI:', error);
    }
}

function updateLineNumbers(configType) {
    const editor = document.getElementById(`${configType}-json-editor`);
    const lineNumbers = document.getElementById(`${configType}-line-numbers`);
    
    if (!editor || !lineNumbers) return;
    
    const lines = editor.value.split('\n');
    const lineNumbersText = lines.map((_, index) => index + 1).join('\n');
    lineNumbers.textContent = lineNumbersText;
}
function syncLineNumbersScroll(configType) {
    const editor = document.getElementById(`${configType}-json-editor`);
    const lineNumbers = document.getElementById(`${configType}-line-numbers`);
    
    if (!editor || !lineNumbers) return;
    
    lineNumbers.scrollTop = editor.scrollTop;
}

function updateCursorPosition(configType) {
    const editor = document.getElementById(`${configType}-json-editor`);
    const lineInfo = document.getElementById(`${configType}-line-info`);
    
    if (!editor || !lineInfo) return;
    
    const cursorPosition = editor.selectionStart;
    const textBeforeCursor = editor.value.substring(0, cursorPosition);
    const lines = textBeforeCursor.split('\n');
    const currentLine = lines.length;
    const currentColumn = lines[lines.length - 1].length + 1;
    
    lineInfo.textContent = `Ligne ${currentLine}, Col ${currentColumn}`;
}

function validateJsonRealTime(configType) {
    const editor = document.getElementById(`${configType}-json-editor`);
    const status = document.getElementById(`${configType}-json-status`);
    
    if (!editor || !status) return;
    
    try {
        const text = editor.value.trim();
        if (!text) {
            updateJsonStatus(configType, 'warning', 'JSON vide');
            return;
        }
        
        JSON.parse(text);
        updateJsonStatus(configType, 'valid', 'JSON valide');
        editor.classList.remove('error');
    } catch (error) {
        updateJsonStatus(configType, 'error', `Erreur JSON: ${error.message}`);
        editor.classList.add('error');
    }
}

function updateJsonStatus(configType, type, message) {
    const status = document.getElementById(`${configType}-json-status`);
    if (!status) return;
    
    const statusClasses = ['status-valid', 'status-error', 'status-warning'];
    const statusIcons = {
        valid: 'fas fa-check-circle',
        error: 'fas fa-exclamation-triangle',
        warning: 'fas fa-exclamation-circle'
    };
    
    const statusIndicator = status.querySelector('.status-indicator');
    statusIndicator.className = `status-indicator status-${type}`;
    statusIndicator.innerHTML = `<i class="${statusIcons[type]}"></i> ${message}`;
}

function formatJson(configType) {
    const editor = document.getElementById(`${configType}-json-editor`);
    if (!editor) return;
    
    try {
        const text = editor.value.trim();
        if (!text) {
            showNotification('Aucun contenu à formater', 'warning');
            return;
        }
        
        const parsed = JSON.parse(text);
        const formatted = JSON.stringify(parsed, null, 2);
        
        saveToHistory(configType, editor.value);
        editor.value = formatted;
        updateLineNumbers(configType);
        validateJsonRealTime(configType);
        document.getElementById(`save-${configType}-config`).disabled = false;
        
        showNotification('JSON formaté avec succès', 'success');
    } catch (error) {
        showNotification(`Erreur de formatage: ${error.message}`, 'error');
    }
}

function minifyJson(configType) {
    const editor = document.getElementById(`${configType}-json-editor`);
    if (!editor) return;
    
    try {
        const text = editor.value.trim();
        if (!text) {
            showNotification('Aucun contenu à minifier', 'warning');
            return;
        }
        
        const parsed = JSON.parse(text);
        const minified = JSON.stringify(parsed);
        
        saveToHistory(configType, editor.value);
        editor.value = minified;
        updateLineNumbers(configType);
        validateJsonRealTime(configType);
        document.getElementById(`save-${configType}-config`).disabled = false;
        
        showNotification('JSON minifié avec succès', 'success');
    } catch (error) {
        showNotification(`Erreur de minification: ${error.message}`, 'error');
    }
}

function validateJson(configType) {
    const editor = document.getElementById(`${configType}-json-editor`);
    if (!editor) return;
    
    try {
        const text = editor.value.trim();
        if (!text) {
            showNotification('Aucun contenu à valider', 'warning');
            return;
        }
        
        const parsed = JSON.parse(text);
        const objectCount = countJsonObjects(parsed);
        
        showNotification(`✅ JSON valide! ${objectCount.objects} objets, ${objectCount.arrays} tableaux`, 'success');
        updateJsonStatus(configType, 'valid', 'JSON valide');
    } catch (error) {
        showNotification(`❌ JSON invalide: ${error.message}`, 'error');
        updateJsonStatus(configType, 'error', `Erreur: ${error.message}`);
    }
}

function countJsonObjects(obj, counts = { objects: 0, arrays: 0 }) {
    if (Array.isArray(obj)) {
        counts.arrays++;
        obj.forEach(item => countJsonObjects(item, counts));
    } else if (typeof obj === 'object' && obj !== null) {
        counts.objects++;
        Object.values(obj).forEach(value => countJsonObjects(value, counts));
    }
    return counts;
}

function saveToHistory(configType, content) {
    const history = jsonHistory[configType];
    if (!history) return;
    
    // Éviter les doublons
    if (history.undo.length > 0 && history.undo[history.undo.length - 1] === content) {
        return;
    }
    
    history.undo.push(content);
    history.redo = []; // Vider le redo quand on ajoute quelque chose
    
    // Limiter l'historique à 50 éléments
    if (history.undo.length > 50) {
        history.undo.shift();
    }
}

function undoJsonChange(configType) {
    const editor = document.getElementById(`${configType}-json-editor`);
    const history = jsonHistory[configType];
    
    if (!editor || !history || history.undo.length <= 1) {
        showNotification('Rien à annuler', 'info');
        return;
    }
    
    // Sauvegarder l'état actuel dans redo
    history.redo.push(history.undo.pop());
    
    // Restaurer l'état précédent
    const previousState = history.undo[history.undo.length - 1];
    editor.value = previousState;
    
    updateLineNumbers(configType);
    validateJsonRealTime(configType);
    document.getElementById(`save-${configType}-config`).disabled = false;
    
    showNotification('Modification annulée', 'info');
}

function redoJsonChange(configType) {
    const editor = document.getElementById(`${configType}-json-editor`);
    const history = jsonHistory[configType];
    
    if (!editor || !history || history.redo.length === 0) {
        showNotification('Rien à refaire', 'info');
        return;
    }
    
    // Restaurer l'état suivant
    const nextState = history.redo.pop();
    history.undo.push(nextState);
    editor.value = nextState;
    
    updateLineNumbers(configType);
    validateJsonRealTime(configType);
    document.getElementById(`save-${configType}-config`).disabled = false;
    
    showNotification('Modification refaite', 'info');
}

// =====================================================
// BRACE HIGHLIGHTING FUNCTIONS
// =====================================================

let braceHighlightTimeout = null;

function handleBraceClick(event, configType) {
    const editor = document.getElementById(`${configType}-json-editor`);
    if (!editor) return;
    
    // Obtenir la position du curseur
    const cursorPosition = editor.selectionStart;
    const text = editor.value;
    const charAtCursor = text[cursorPosition];
    
    // Vérifier si on a cliqué sur une accolade/crochet
    const braces = {
        '{': '}',
        '[': ']',
        '(': ')',
        '}': '{',
        ']': '[',
        ')': '('
    };
    
    if (braces[charAtCursor]) {
        const matchingPosition = findMatchingBrace(text, cursorPosition, charAtCursor);
        if (matchingPosition !== -1) {
            highlightBraces(editor, cursorPosition, matchingPosition, charAtCursor, configType);
        }
    }
}

function findMatchingBrace(text, startPos, startChar) {
    const braceMap = {
        '{': '}',
        '[': ']',
        '(': ')',
        '}': '{',
        ']': '[',
        ')': '('
    };
    
    const targetChar = braceMap[startChar];
    const isOpening = ['{', '[', '('].includes(startChar);
    
    let count = 1;
    let pos = startPos + (isOpening ? 1 : -1);
    
    while (pos >= 0 && pos < text.length) {
        const char = text[pos];
        
        if (char === startChar) {
            count++;
        } else if (char === targetChar) {
            count--;
            if (count === 0) {
                return pos;
            }
        }
        
        pos += isOpening ? 1 : -1;
    }
    
    return -1; // Pas trouvé
}

function highlightBraces(editor, pos1, pos2, clickedChar, configType) {
    // Nettoyer les anciens highlights
    clearBraceHighlights(configType);
    
    // Approche alternative: sélectionner temporairement le contenu entre les accolades
    const text = editor.value;
    const start = Math.min(pos1, pos2);
    const end = Math.max(pos1, pos2) + 1;
    
    // Calculer les positions des lignes pour l'affichage
    const textBefore1 = text.substring(0, pos1);
    const textBefore2 = text.substring(0, pos2);
    const line1 = textBefore1.split('\n').length;
    const line2 = textBefore2.split('\n').length;
    const col1 = textBefore1.split('\n').pop().length + 1;
    const col2 = textBefore2.split('\n').pop().length + 1;
    
    // Ajouter un effet visuel à l'éditeur
    editor.classList.add('highlighting');
    
    // Sélectionner brièvement le contenu entre les accolades
    editor.focus();
    editor.setSelectionRange(start, end);
    
    // Afficher une notification informative
    const braceType = {
        '{': 'accolades',
        '[': 'crochets',
        '(': 'parenthèses'
    }[clickedChar] || {
        '}': 'accolades',
        ']': 'crochets',
        ')': 'parenthèses'
    }[clickedChar];
    
    showNotification(
        `🎯 Paire de ${braceType} trouvée: L${line1}:C${col1} ↔ L${line2}:C${col2}`,
        'info'
    );
    
    // Programmer la suppression des highlights
    if (braceHighlightTimeout) {
        clearTimeout(braceHighlightTimeout);
    }
    
    braceHighlightTimeout = setTimeout(() => {
        clearBraceHighlights(configType);
        // Remettre le curseur à la position originale
        editor.setSelectionRange(pos1, pos1);
    }, 2000); // 2 secondes
}

// Note: createBraceHighlight et getCharacterCoordinates supprimées car nous utilisons 
// maintenant une approche basée sur la sélection de texte qui est plus fiable

function clearBraceHighlights(configType) {
    const editor = document.getElementById(`${configType}-json-editor`);
    if (!editor) return;
    
    // Supprimer la classe de highlighting
    editor.classList.remove('highlighting');
    
    // Nettoyer le timeout
    if (braceHighlightTimeout) {
        clearTimeout(braceHighlightTimeout);
        braceHighlightTimeout = null;
    }
}

// Nettoyer les highlights quand on scroll ou qu'on tape
function setupBraceHighlightCleanup(configType) {
    const editor = document.getElementById(`${configType}-json-editor`);
    if (!editor) return;
    
    editor.addEventListener('scroll', () => clearBraceHighlights(configType));
    editor.addEventListener('input', () => clearBraceHighlights(configType));
    editor.addEventListener('keydown', () => clearBraceHighlights(configType));
}

// ===== GESTION DES CRÉANCES =====

// Variables globales pour créances
let currentCreanceAccount = null;

// Charger les comptes créance au démarrage
async function loadCreanceAccounts() {
    try {
        const response = await fetch(apiUrl('/api/creance/accounts'));
        if (!response.ok) {
            throw new Error(`Erreur ${response.status}: ${response.statusText}`);
        }
        
        const accounts = await response.json();
        const select = document.getElementById('creance-account-select');
        
        if (!select) return;
        
        // Vider les options existantes
        select.innerHTML = '<option value="">Choisir un compte créance...</option>';
        
        // Ajouter les comptes
        accounts.forEach(account => {
            const option = document.createElement('option');
            option.value = account.id;
            option.textContent = account.account_name;
            option.dataset.director = account.assigned_director_name || 'Non assigné';
            select.appendChild(option);
        });
        
        // Si il n'y a qu'un seul compte, le sélectionner automatiquement
        if (accounts.length === 1) {
            select.value = accounts[0].id;
            // Déclencher l'événement de sélection pour charger les données du compte
            handleCreanceAccountSelection();
        }
        
    } catch (error) {
        console.error('Erreur chargement comptes créance:', error);
        showNotification('Erreur lors du chargement des comptes créance', 'error');
    }
}

// Gérer la sélection d'un compte créance
function handleCreanceAccountSelection() {
    const select = document.getElementById('creance-account-select');
    const mainContent = document.getElementById('creance-main-content');
    const adminSection = document.getElementById('creance-admin-section');
    
    if (!select || !mainContent) return;
    
    const accountId = select.value;
    
    if (!accountId) {
        mainContent.style.display = 'none';
        currentCreanceAccount = null;
        return;
    }
    
    // Obtenir les infos du compte sélectionné
    const selectedOption = select.selectedOptions[0];
    const accountName = selectedOption.textContent;
    const directorName = selectedOption.dataset.director;
    
    currentCreanceAccount = {
        id: accountId,
        name: accountName,
        director: directorName
    };
    
    // Mettre à jour l'en-tête
    document.getElementById('creance-account-title').textContent = `Compte : ${accountName}`;
    document.getElementById('creance-account-director').textContent = `Directeur assigné : ${directorName}`;
    
    // Afficher le contenu principal
    mainContent.style.display = 'block';
    
    // Afficher la section admin si l'utilisateur est admin/DG/PCA
    if (currentUser.role === 'admin' || currentUser.role === 'directeur_general' || currentUser.role === 'pca') {
        adminSection.style.display = 'block';
    } else {
        adminSection.style.display = 'none';
    }
    
    // Charger les données du compte
    loadCreanceAccountData(accountId);
}

// Charger les données d'un compte créance (clients et opérations)
async function loadCreanceAccountData(accountId) {
    try {
        // Charger les clients
        await loadCreanceClients(accountId);
        
        // Charger l'historique des opérations
        await loadCreanceOperations(accountId);
        
    } catch (error) {
        console.error('Erreur chargement données créance:', error);
        showNotification('Erreur lors du chargement des données', 'error');
    }
}

// Charger les clients d'un compte créance
async function loadCreanceClients(accountId) {
    try {
        const response = await fetch(apiUrl(`/api/creance/${accountId}/clients`));
        if (!response.ok) {
            throw new Error(`Erreur ${response.status}`);
        }
        
        const clients = await response.json();
        
        // Mettre à jour le tableau récapitulatif
        updateClientsSummaryTable(clients);
        
        // Mettre à jour la liste des clients pour les opérations
        updateOperationClientSelect(clients);
        
    } catch (error) {
        console.error('Erreur chargement clients:', error);
        showNotification('Erreur lors du chargement des clients', 'error');
    }
}

// Mettre à jour le tableau récapitulatif des clients
function updateClientsSummaryTable(clients) {
    const tbody = document.getElementById('clients-summary-tbody');
    if (!tbody) return;
    
    // Stocker les données originales pour le filtrage
    window.originalClientsData = clients;
    
    // Calculer la somme totale des soldes
    const totalBalance = clients.reduce((sum, client) => sum + parseInt(client.balance || 0), 0);
    
    // Mettre à jour le titre du compte avec le solde total
    const accountTitle = document.getElementById('creance-account-title');
    if (accountTitle && currentCreanceAccount) {
        accountTitle.innerHTML = `Compte : ${currentCreanceAccount.name} <span style="margin-left: 15px; font-size: 0.9em; color: ${totalBalance >= 0 ? 'green' : 'red'};">(Solde total : ${formatCurrency(totalBalance)})</span>`;
    }
    
    tbody.innerHTML = '';
    
    if (clients.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: #999;">Aucun client trouvé</td></tr>';
        return;
    }
    
    displayFilteredClients(clients);
}

// Fonction pour afficher les clients filtrés
function displayFilteredClients(clients) {
    const tbody = document.getElementById('clients-summary-tbody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    if (clients.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: #999;">Aucun résultat trouvé</td></tr>';
        return;
    }
    
    clients.forEach(client => {
        const row = document.createElement('tr');
        
        const balance = parseInt(client.balance);
        let balanceClass = 'amount-neutral';
        if (balance > 0) balanceClass = 'amount-positive';
        else if (balance < 0) balanceClass = 'amount-negative';
        
        // Générer les boutons d'actions selon les permissions
        const actionsHtml = generateCreanceClientActions(client);
        
        row.innerHTML = `
            <td>${client.client_name}</td>
            <td>${client.client_phone || '-'}</td>
            <td class="amount-neutral">${formatCurrency(client.initial_credit)}</td>
            <td class="amount-positive">${formatCurrency(client.total_credits)}</td>
            <td class="amount-negative">${formatCurrency(client.total_debits)}</td>
            <td class="${balanceClass}">${formatCurrency(balance)}</td>
            <td>${actionsHtml}</td>
        `;
        
        tbody.appendChild(row);
    });
}

// Fonction pour filtrer les clients
function filterClients() {
    if (!window.originalClientsData) return;
    
    const clientFilter = document.getElementById('client-filter').value.toLowerCase();
    const phoneFilter = document.getElementById('phone-filter').value.toLowerCase();
    
    const filteredClients = window.originalClientsData.filter(client => {
        const clientName = (client.client_name || '').toLowerCase();
        const clientPhone = (client.client_phone || '').toLowerCase();
        
        const matchesClient = clientName.includes(clientFilter);
        const matchesPhone = clientPhone.includes(phoneFilter);
        
        return matchesClient && matchesPhone;
    });
    
    displayFilteredClients(filteredClients);
}

// Ajouter les écouteurs d'événements pour le filtrage
document.addEventListener('DOMContentLoaded', function() {
    const clientFilter = document.getElementById('client-filter');
    const phoneFilter = document.getElementById('phone-filter');
    
    if (clientFilter && phoneFilter) {
        clientFilter.addEventListener('input', filterClients);
        phoneFilter.addEventListener('input', filterClients);
    }
});

// Générer les boutons d'actions pour un client créance
function generateCreanceClientActions(client) {
    const actions = [];
    
    // Vérifier les permissions de modification (DG, PCA, Admin)
    if (canEditCreanceClient()) {
        actions.push(`
            <button type="button" class="btn-action btn-edit" onclick="editCreanceClient(${client.id})" title="Modifier le client">
                <i class="fas fa-edit"></i>
            </button>
        `);
    }
    
    // Vérifier les permissions de suppression (Admin seulement)
    if (canDeleteCreanceClient()) {
        actions.push(`
            <button type="button" class="btn-action btn-delete" onclick="deleteCreanceClient(${client.id}, '${client.client_name}')" title="Supprimer le client">
                <i class="fas fa-trash"></i>
            </button>
        `);
    }
    
    return actions.length > 0 ? actions.join(' ') : '<span class="text-muted">-</span>';
}

// Vérifier si l'utilisateur peut modifier un client créance
function canEditCreanceClient() {
    const userRole = currentUser.role;
    return ['admin', 'directeur_general', 'pca'].includes(userRole);
}

// Vérifier si l'utilisateur peut supprimer un client créance
function canDeleteCreanceClient() {
    const userRole = currentUser.role;
    return userRole === 'admin';
}

// Modifier un client créance
async function editCreanceClient(clientId) {
    try {
        if (!currentCreanceAccount) {
            showNotification('Aucun compte sélectionné', 'error');
            return;
        }
        
        // Charger les données du client
        const response = await fetch(apiUrl(`/api/creance/${currentCreanceAccount.id}/clients`));
        if (!response.ok) {
            throw new Error('Erreur lors du chargement des clients');
        }
        
        const clients = await response.json();
        const client = clients.find(c => c.id === clientId);
        
        if (!client) {
            throw new Error('Client non trouvé');
        }
        
        // Pré-remplir le formulaire avec les données existantes
        document.getElementById('client-name').value = client.client_name;
        document.getElementById('client-phone').value = client.client_phone || '';
        document.getElementById('client-address').value = client.client_address || '';
        document.getElementById('initial-credit').value = client.initial_credit || 0;
        
        // Modifier le bouton pour indiquer la mise à jour
        const submitButton = document.querySelector('#add-client-form button[type="submit"]');
        submitButton.innerHTML = '<i class="fas fa-save"></i> Modifier le client';
        submitButton.dataset.editingId = clientId;
        
        // Faire défiler vers le formulaire
        document.getElementById('add-client-form').scrollIntoView({ behavior: 'smooth' });
        
        showNotification('Formulaire prêt pour la modification du client', 'info');
        
    } catch (error) {
        console.error('Erreur modification client:', error);
        showNotification(error.message, 'error');
    }
}

// Supprimer un client créance
async function deleteCreanceClient(clientId, clientName) {
    if (!confirm(`Êtes-vous sûr de vouloir supprimer le client "${clientName}" ?\n\nCette action supprimera également toutes les opérations liées à ce client.\n\nCette action est irréversible.`)) {
        return;
    }
    
    try {
        if (!currentCreanceAccount) {
            showNotification('Aucun compte sélectionné', 'error');
            return;
        }
        
        const response = await fetch(apiUrl(`/api/creance/${currentCreanceAccount.id}/clients/${clientId}`), {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Erreur lors de la suppression');
        }
        
        const result = await response.json();
        showNotification(result.message, 'success');
        
        // Recharger les données
        loadCreanceAccountData(currentCreanceAccount.id);
        
    } catch (error) {
        console.error('Erreur suppression client:', error);
        showNotification(error.message, 'error');
    }
}

// Mettre à jour la liste des clients pour les opérations
function updateOperationClientSelect(clients) {
    const select = document.getElementById('operation-client');
    if (!select) return;
    
    select.innerHTML = '<option value="">Sélectionner un client...</option>';
    
    clients.forEach(client => {
        const option = document.createElement('option');
        option.value = client.id;
        option.textContent = client.client_name;
        select.appendChild(option);
    });
}

// Charger l'historique des opérations
async function loadCreanceOperations(accountId) {
    try {
        const response = await fetch(apiUrl(`/api/creance/${accountId}/operations`));
        if (!response.ok) {
            throw new Error(`Erreur ${response.status}`);
        }
        
        const operations = await response.json();
        updateOperationsHistoryTable(operations);
        
    } catch (error) {
        console.error('Erreur chargement opérations:', error);
        showNotification('Erreur lors du chargement de l\'historique', 'error');
    }
}

// Mettre à jour le tableau de l'historique des opérations
function updateOperationsHistoryTable(operations) {
    const tbody = document.getElementById('operations-history-tbody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    if (operations.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: #999;">Aucune opération trouvée</td></tr>';
        return;
    }
    
    operations.forEach(operation => {
        const row = document.createElement('tr');
        
        const typeClass = operation.operation_type === 'credit' ? 'amount-positive' : 'amount-negative';
        const typeText = operation.operation_type === 'credit' ? 'Avance (+)' : 'Remboursement (-)';
        
        // Générer les boutons d'actions selon les permissions
        const actionsHtml = generateCreanceOperationActions(operation);
        
        // Formater les dates
        const operationDate = formatDate(operation.operation_date);
        const timestamp = new Date(operation.timestamp_creation);
        const timestampDate = timestamp.toLocaleDateString('fr-FR');
        const timestampTime = timestamp.toLocaleTimeString('fr-FR', { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
        
        row.innerHTML = `
            <td>${operationDate}</td>
            <td>${timestampDate}<br><small class="text-muted">${timestampTime}</small></td>
            <td>${operation.client_name}</td>
            <td class="${typeClass}">${typeText}</td>
            <td class="${typeClass}">${formatCurrency(operation.amount)}</td>
            <td>${operation.description || '-'}</td>
            <td>${operation.created_by_name}</td>
            <td>${actionsHtml}</td>
        `;
        
        tbody.appendChild(row);
    });
}

// Générer les boutons d'actions pour une opération créance
function generateCreanceOperationActions(operation) {
    const actions = [];
    
    // Vérifier les permissions de modification
    if (canEditCreanceOperation(operation)) {
        actions.push(`
            <button type="button" class="btn-action btn-edit" onclick="editCreanceOperation(${operation.id})" title="Modifier">
                <i class="fas fa-edit"></i>
            </button>
        `);
    }
    
    // Vérifier les permissions de suppression
    if (canDeleteCreanceOperation(operation)) {
        actions.push(`
            <button type="button" class="btn-action btn-delete" onclick="deleteCreanceOperation(${operation.id})" title="Supprimer">
                <i class="fas fa-trash"></i>
            </button>
        `);
    }
    
    return actions.length > 0 ? actions.join(' ') : '<span class="text-muted">-</span>';
}
// Vérifier si l'utilisateur peut modifier une opération créance
function canEditCreanceOperation(operation) {
    const userRole = currentUser.role;
    const currentUserId = currentUser.id;
    const operationCreatedBy = operation.created_by;
    
    // Admin, DG, PCA peuvent toujours modifier
    if (['admin', 'directeur_general', 'pca'].includes(userRole)) {
        return true;
    }
    
    // Directeur peut modifier ses propres opérations dans les 24h
    if (userRole === 'directeur' && operationCreatedBy === currentUserId) {
        return isWithin24Hours(operation.created_at);
    }
    
    return false;
}

// Vérifier si l'utilisateur peut supprimer une opération créance  
function canDeleteCreanceOperation(operation) {
    const userRole = currentUser.role;
    const currentUserId = currentUser.id;
    const operationCreatedBy = operation.created_by;
    
    // Seul l'admin peut supprimer
    if (userRole === 'admin') {
        return true;
    }
    
    // Directeur peut supprimer ses propres opérations dans les 24h
    if (userRole === 'directeur' && operationCreatedBy === currentUserId) {
        return isWithin24Hours(operation.created_at);
    }
    
    return false;
}

// Vérifier si une date est dans les 24 heures
function isWithin24Hours(dateString) {
    if (!dateString) return false;
    
    const operationDate = new Date(dateString);
    const now = new Date();
    const diffHours = (now - operationDate) / (1000 * 60 * 60);
    
    return diffHours <= 24;
}

// Modifier une opération créance
async function editCreanceOperation(operationId) {
    try {
        // Charger les données de l'opération
        const response = await fetch(apiUrl(`/api/creance/operations/${operationId}`));
        if (!response.ok) {
            throw new Error('Erreur lors du chargement de l\'opération');
        }
        
        const operation = await response.json();
        
        // Pré-remplir le formulaire avec les données existantes
        document.getElementById('operation-client').value = operation.client_id;
        document.getElementById('operation-type').value = operation.operation_type;
        document.getElementById('operation-amount').value = operation.amount;
        document.getElementById('operation-date').value = operation.operation_date.split('T')[0];
        document.getElementById('operation-description').value = operation.description || '';
        
        // Modifier le bouton pour indiquer la mise à jour
        const submitButton = document.querySelector('#add-operation-form button[type="submit"]');
        const cancelButton = document.getElementById('cancel-operation-edit');
        
        submitButton.innerHTML = '<i class="fas fa-save"></i> Mettre à jour l\'opération';
        submitButton.dataset.editingId = operationId;
        
        // Afficher le bouton Annuler
        if (cancelButton) {
            cancelButton.style.display = 'inline-block';
        }
        
        // Faire défiler vers le formulaire
        document.getElementById('add-operation-form').scrollIntoView({ behavior: 'smooth' });
        
        showNotification('Formulaire prêt pour la modification', 'info');
        
    } catch (error) {
        console.error('Erreur modification opération:', error);
        showNotification(error.message, 'error');
    }
}

// Supprimer une opération créance
async function deleteCreanceOperation(operationId) {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cette opération ? Cette action est irréversible.')) {
        return;
    }
    
    try {
        const response = await fetch(apiUrl(`/api/creance/operations/${operationId}`), {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Erreur lors de la suppression');
        }
        
        const result = await response.json();
        showNotification(result.message, 'success');
        
        // Recharger les données
        if (currentCreanceAccount) {
            loadCreanceAccountData(currentCreanceAccount.id);
        }
        
    } catch (error) {
        console.error('Erreur suppression opération:', error);
        showNotification(error.message, 'error');
    }
}

// Annuler la modification d'une opération
function cancelOperationEdit() {
    // Réinitialiser le formulaire
    const form = document.getElementById('add-operation-form');
    if (form) {
        form.reset();
    }
    
    // Remettre le bouton en mode "ajouter"
    const submitButton = document.querySelector('#add-operation-form button[type="submit"]');
    const cancelButton = document.getElementById('cancel-operation-edit');
    
    if (submitButton) {
        submitButton.innerHTML = '<i class="fas fa-plus"></i> Enregistrer l\'opération';
        delete submitButton.dataset.editingId;
    }
    
    // Cacher le bouton Annuler
    if (cancelButton) {
        cancelButton.style.display = 'none';
    }
    
    // Remettre la date d'aujourd'hui par défaut
    const operationDateInput = document.getElementById('operation-date');
    if (operationDateInput) {
        operationDateInput.value = new Date().toISOString().split('T')[0];
    }
    
    showNotification('Modification annulée', 'info');
}

// Ajouter un nouveau client ou mettre à jour un existant
async function handleAddClient(event) {
    event.preventDefault();
    
    if (!currentCreanceAccount) {
        showNotification('Aucun compte sélectionné', 'error');
        return;
    }
    
    const submitButton = event.target.querySelector('button[type="submit"]');
    const isEditing = submitButton.dataset.editingId;
    
    const formData = new FormData(event.target);
    const clientData = {
        client_name: formData.get('client-name'),
        client_phone: formData.get('client-phone'),
        client_address: formData.get('client-address'),
        initial_credit: formData.get('initial-credit') || 0
    };
    
    // Validation
    if (!clientData.client_name || !clientData.client_name.trim()) {
        showNotification('Le nom du client est obligatoire', 'error');
        return;
    }
    
    try {
        let response;
        
        if (isEditing) {
            // Mise à jour d'un client existant
            response = await fetch(apiUrl(`/api/creance/${currentCreanceAccount.id}/clients/${isEditing}`), {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(clientData)
            });
        } else {
            // Création d'un nouveau client
            response = await fetch(apiUrl(`/api/creance/${currentCreanceAccount.id}/clients`), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(clientData)
            });
        }
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || `Erreur lors de ${isEditing ? 'la modification' : 'l\'ajout'} du client`);
        }
        
        const result = await response.json();
        showNotification(result.message, 'success');
        
        // Réinitialiser le formulaire et le bouton
        event.target.reset();
        submitButton.innerHTML = '<i class="fas fa-plus"></i> Ajouter le client';
        delete submitButton.dataset.editingId;
        
        // Recharger les données
        loadCreanceAccountData(currentCreanceAccount.id);
        
    } catch (error) {
        console.error('Erreur client créance:', error);
        showNotification(error.message, 'error');
    }
}

// Ajouter une nouvelle opération ou mettre à jour une existante
async function handleAddOperation(event) {
    event.preventDefault();
    
    if (!currentCreanceAccount) {
        showNotification('Aucun compte sélectionné', 'error');
        return;
    }
    
    const submitButton = event.target.querySelector('button[type="submit"]');
    const isEditing = submitButton.dataset.editingId;
    
    const formData = new FormData(event.target);
    const operationData = {
        client_id: formData.get('operation-client'),
        operation_type: formData.get('operation-type'),
        amount: formData.get('operation-amount'),
        operation_date: formData.get('operation-date'),
        description: formData.get('operation-description')
    };
    
    // Validation
    if (!operationData.client_id) {
        showNotification('Veuillez sélectionner un client', 'error');
        return;
    }
    
    if (!operationData.operation_type) {
        showNotification('Veuillez sélectionner le type d\'opération', 'error');
        return;
    }
    
    if (!operationData.amount || parseInt(operationData.amount) <= 0) {
        showNotification('Le montant doit être supérieur à 0', 'error');
        return;
    }
    
    if (!operationData.operation_date) {
        showNotification('La date est obligatoire', 'error');
        return;
    }
    
    try {
        let response;
        
        if (isEditing) {
            // Mise à jour d'une opération existante
            response = await fetch(apiUrl(`/api/creance/operations/${isEditing}`), {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(operationData)
            });
        } else {
            // Création d'une nouvelle opération
            response = await fetch(apiUrl(`/api/creance/${currentCreanceAccount.id}/operations`), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(operationData)
            });
        }
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || `Erreur lors de ${isEditing ? 'la mise à jour' : 'l\'enregistrement'} de l'opération`);
        }
        
        const result = await response.json();
        showNotification(result.message, 'success');
        
        // Réinitialiser le formulaire et le bouton
        event.target.reset();
        submitButton.innerHTML = '<i class="fas fa-plus"></i> Enregistrer l\'opération';
        delete submitButton.dataset.editingId;
        
        // Cacher le bouton Annuler
        const cancelButton = document.getElementById('cancel-operation-edit');
        if (cancelButton) {
            cancelButton.style.display = 'none';
        }
        
        // Recharger les données
        loadCreanceAccountData(currentCreanceAccount.id);
        
    } catch (error) {
        console.error('Erreur opération créance:', error);
        showNotification(error.message, 'error');
    }
}

// Initialiser la section créance
async function initCreanceSection() {
    
    // Charger les comptes créance
    await loadCreanceAccounts();
    
    // Gérer la sélection du compte
    const accountSelect = document.getElementById('creance-account-select');
    if (accountSelect) {
        accountSelect.addEventListener('change', handleCreanceAccountSelection);
    }
    
    // Gérer l'ajout de client
    const addClientForm = document.getElementById('add-client-form');
    if (addClientForm) {
        addClientForm.addEventListener('submit', handleAddClient);
    }
    
    // Gérer l'ajout d'opération
    const addOperationForm = document.getElementById('add-operation-form');
    if (addOperationForm) {
        addOperationForm.addEventListener('submit', handleAddOperation);
    }
    
    // Définir la date d'aujourd'hui par défaut
    const operationDateInput = document.getElementById('operation-date');
    if (operationDateInput) {
        operationDateInput.value = new Date().toISOString().split('T')[0];
    }
    
    // Initialiser les accordéons
    initCreanceAccordions();
    
    // Initialiser les filtres de l'historique
    initHistoryFilters();
}

// Initialiser les accordéons de la section créance
function initCreanceAccordions() {
    // Accordéon "Opérations Créance"
    const operationsHeader = document.getElementById('creance-operations-header');
    if (operationsHeader) {
        operationsHeader.addEventListener('click', function() {
            const isCollapsed = this.classList.toggle('collapsed');
            const content = document.getElementById('creance-operations-content');
            if (content) content.classList.toggle('collapsed');
            // Update ARIA attribute for accessibility
            this.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
        });
    }
    
    // Accordéon "Gestion des Clients"
    const clientsHeader = document.getElementById('creance-clients-header');
    if (clientsHeader) {
        clientsHeader.addEventListener('click', function() {
            const isCollapsed = this.classList.toggle('collapsed');
            const content = document.getElementById('creance-clients-content');
            if (content) content.classList.toggle('collapsed');
            // Update ARIA attribute for accessibility
            this.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
        });
    }
    
    // Accordéon "Récapitulatif par Client"
    const summaryHeader = document.getElementById('creance-summary-header');
    if (summaryHeader) {
        summaryHeader.addEventListener('click', function() {
            const isCollapsed = this.classList.toggle('collapsed');
            const content = document.getElementById('creance-summary-content');
            if (content) content.classList.toggle('collapsed');
            // Update ARIA attribute for accessibility
            this.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
        });
    }
}

// Initialiser les filtres de l'historique des opérations
function initHistoryFilters() {
    const filterDate = document.getElementById('history-filter-date');
    const filterClient = document.getElementById('history-filter-client');
    const filterType = document.getElementById('history-filter-type');
    const filterAmount = document.getElementById('history-filter-amount');
    const filterDescription = document.getElementById('history-filter-description');
    const resetBtn = document.getElementById('history-reset-filters');
    
    // Appliquer les filtres en temps réel
    if (filterDate) filterDate.addEventListener('input', applyHistoryFilters);
    if (filterClient) filterClient.addEventListener('input', applyHistoryFilters);
    if (filterType) filterType.addEventListener('change', applyHistoryFilters);
    if (filterAmount) filterAmount.addEventListener('input', applyHistoryFilters);
    if (filterDescription) filterDescription.addEventListener('input', applyHistoryFilters);
    
    // Bouton de réinitialisation
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            if (filterDate) filterDate.value = '';
            if (filterClient) filterClient.value = '';
            if (filterType) filterType.value = '';
            if (filterAmount) filterAmount.value = '';
            if (filterDescription) filterDescription.value = '';
            applyHistoryFilters();
        });
    }
}

// Appliquer les filtres sur l'historique des opérations
function applyHistoryFilters() {
    const filterDate = document.getElementById('history-filter-date')?.value || '';
    const filterClient = document.getElementById('history-filter-client')?.value.toLowerCase() || '';
    const filterType = document.getElementById('history-filter-type')?.value || '';
    const filterAmount = document.getElementById('history-filter-amount')?.value || '';
    const filterDescription = document.getElementById('history-filter-description')?.value.toLowerCase() || '';
    
    const tbody = document.getElementById('operations-history-tbody');
    if (!tbody) return;
    
    const rows = tbody.getElementsByTagName('tr');
    let visibleCount = 0;
    let activeFilters = [];
    
    // Construire la liste des filtres actifs
    if (filterDate) activeFilters.push(`Date: ${filterDate}`);
    if (filterClient) activeFilters.push(`Client: ${filterClient}`);
    if (filterType) activeFilters.push(`Type: ${filterType === 'credit' ? 'Avance' : 'Remboursement'}`);
    if (filterAmount) activeFilters.push(`Montant: ${filterAmount} FCFA`);
    if (filterDescription) activeFilters.push(`Description: ${filterDescription}`);
    
    // Convertir la date du filtre au format dd/mm/yyyy si elle existe
    let filterDateFormatted = '';
    if (filterDate) {
        const [year, month, day] = filterDate.split('-');
        filterDateFormatted = `${day}/${month}/${year}`;
    }
    
    // Filtrer les lignes
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const cells = row.getElementsByTagName('td');
        
        if (cells.length >= 6) {
            const dateOp = cells[0].textContent.trim();
            const client = cells[2].textContent.toLowerCase();
            const type = cells[3].textContent.toLowerCase();
            const montantText = cells[4].textContent.replace(/[^0-9]/g, ''); // Extraire les chiffres
            const description = cells[5].textContent.toLowerCase();
            
            let show = true;
            
            // Filtre par date
            if (filterDate && dateOp !== filterDateFormatted) {
                show = false;
            }
            
            // Filtre par client
            if (filterClient && !client.includes(filterClient)) {
                show = false;
            }
            
            // Filtre par type
            if (filterType) {
                if (filterType === 'credit' && !type.includes('avance')) {
                    show = false;
                }
                if (filterType === 'debit' && !type.includes('remboursement')) {
                    show = false;
                }
            }
            
            // Filtre par montant
            if (filterAmount && montantText !== filterAmount) {
                show = false;
            }
            
            // Filtre par description
            if (filterDescription && !description.includes(filterDescription)) {
                show = false;
            }
            
            row.style.display = show ? '' : 'none';
            if (show) visibleCount++;
        }
    }
    
    // Mettre à jour le statut
    const statusElement = document.getElementById('history-filter-status');
    if (statusElement) {
        if (activeFilters.length > 0) {
            statusElement.textContent = `Filtres actifs: ${activeFilters.join(' | ')} - ${visibleCount} résultat(s)`;
            statusElement.style.color = '#0066cc';
            statusElement.style.fontWeight = '600';
        } else {
            statusElement.textContent = 'Aucun filtre actif';
            statusElement.style.color = '#6c757d';
            statusElement.style.fontWeight = 'normal';
        }
    }
}

// Initialization functions
document.addEventListener('DOMContentLoaded', async () => {
    // Vérifier la session
    try {
        const response = await fetch(apiUrl('/api/check-session'));
        if (response.ok) {
            const data = await response.json();
            currentUser = data.user;
            await showApp();
            await loadInitialData();
        } else {
            showLogin();
        }
    } catch (error) {
        console.error('Erreur vérification session:', error);
        showLogin();
    }
    
    // Setup mobile menu
    setupMobileMenu();
});

// ===== GESTION CASH BICTORYS MOIS =====

// Variables globales pour Cash Bictorys
let currentCashBictorysData = [];
let currentMonthYear = '';
let canEditCashBictorys = false;

// Initialiser la section Cash Bictorys
async function initCashBictorysSection() {
    
    // Définir le mois en cours par défaut
    const today = new Date();
    const currentMonth = `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}`;
    
    const monthInput = document.getElementById('cash-bictorys-month');
    if (monthInput) {
        monthInput.value = currentMonth;
    }
    
    // Événements
    setupCashBictorysEventListeners();
}

// Configurer les événements Cash Bictorys
function setupCashBictorysEventListeners() {
    console.log('🔧 CASH: setupCashBictorysEventListeners appelée');
    
    // Charger le mois
    const loadBtn = document.getElementById('load-cash-bictorys-btn');
    console.log('🔧 CASH: Bouton load trouvé:', loadBtn);
    if (loadBtn) {
        loadBtn.addEventListener('click', handleLoadCashBictorysMonth);
    }
    
    // Sauvegarder
    const saveBtn = document.getElementById('save-cash-bictorys-btn');
    console.log('🔧 CASH: Bouton save trouvé:', saveBtn);
    console.log('🔧 CASH: Bouton save disabled?', saveBtn ? saveBtn.disabled : 'N/A');
    if (saveBtn) {
        console.log('✅ CASH: Attachement event listener au bouton save');
        saveBtn.addEventListener('click', handleSaveCashBictorys);
        
        // Test direct pour voir si le bouton répond
        saveBtn.addEventListener('click', function() {
            console.log('🔧 CASH: CLICK DIRECT détecté sur le bouton !');
        });
    } else {
        console.error('❌ CASH: Bouton save-cash-bictorys-btn introuvable !');
    }
}

// Gérer le chargement d'un mois
async function handleLoadCashBictorysMonth() {
    const monthInput = document.getElementById('cash-bictorys-month');
    const monthYear = monthInput.value;
    
    if (!monthYear) {
        showNotification('Veuillez sélectionner un mois', 'error');
        return;
    }
    
    await loadCashBictorysMonth(monthYear);
}

// Charger les données d'un mois spécifique
async function loadCashBictorysMonth(monthYear) {
    try {
        console.log(`🔍 CASH DEBUG: Chargement ${monthYear}...`);
        const response = await fetch(apiUrl(`/api/cash-bictorys/${monthYear}`));
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Erreur lors du chargement');
        }
        
        const data = await response.json();
        console.log(`🔍 CASH DEBUG: Données reçues:`, data);
        
        // Vérifier spécifiquement le 1er juillet
        const july1st = data.data.find(d => d.date === '2025-07-01');
        console.log(`🔍 CASH DEBUG: 1er juillet dans les données:`, july1st);
        
        // Initialiser les propriétés manquantes
        currentCashBictorysData = data.data.map(item => ({
            ...item,
            balance: item.balance || 0,
            fees: item.fees || 0
        }));
        currentMonthYear = monthYear;
        
        // Afficher la zone principale
        document.getElementById('cash-bictorys-main-content').style.display = 'block';
        
        // Mettre à jour l'en-tête
        document.getElementById('cash-bictorys-month-title').textContent = `Mois : ${data.monthName}`;
        
        // Mettre à jour les permissions
        updateCashBictorysPermissions(monthYear);
        
        // Afficher les données dans le tableau
        displayCashBictorysTable(currentCashBictorysData);
        
        // Calculer et afficher le total
        updateCashBictorysTotal();
        
        // Activer le bouton de sauvegarde si les permissions le permettent
        console.log('🔧 CASH: Avant appel updateCashBictorysSaveButtonState');
        updateCashBictorysSaveButtonState();
        console.log('🔧 CASH: Après appel updateCashBictorysSaveButtonState');
        
        showNotification(`Données du mois ${data.monthName} chargées`, 'success');
        
    } catch (error) {
        console.error('Erreur chargement Cash Bictorys:', error);
        showNotification(error.message, 'error');
    }
}

// Mettre à jour les informations de permissions
function updateCashBictorysPermissions(monthYear) {
    console.log('🔧 CASH: updateCashBictorysPermissions appelée');
    console.log('🔧 CASH: monthYear =', monthYear);
    console.log('🔧 CASH: currentUser =', currentUser);
    
    const userRole = currentUser.role;
    const today = new Date();
    const currentMonth = `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}`;
    
    console.log('🔧 CASH: userRole =', userRole);
    console.log('🔧 CASH: currentMonth calculé =', currentMonth);
    console.log('🔧 CASH: monthYear === currentMonth ?', monthYear === currentMonth);
    
    let permissionText = '';
    canEditCashBictorys = false;
    
    if (userRole === 'admin') {
        canEditCashBictorys = true;
        permissionText = 'Admin : Vous pouvez modifier toutes les données';
        console.log('✅ CASH: Permissions admin accordées');
    } else if (['directeur_general', 'pca'].includes(userRole)) {
        if (monthYear === currentMonth) {
            canEditCashBictorys = true;
            permissionText = 'Vous pouvez modifier les données du mois en cours';
            console.log('✅ CASH: Permissions DG/PCA accordées (mois en cours)');
        } else {
            canEditCashBictorys = false;
            permissionText = 'Vous ne pouvez modifier que les données du mois en cours';
            console.log('❌ CASH: Permissions DG/PCA refusées (pas le mois en cours)');
        }
    } else {
        canEditCashBictorys = false;
        permissionText = 'Accès en lecture seule';
        console.log('❌ CASH: Permissions refusées (rôle insuffisant)');
    }
    
    console.log('🔧 CASH: canEditCashBictorys final =', canEditCashBictorys);
    document.getElementById('permissions-text').textContent = permissionText;
}

// Afficher les données dans le tableau
function displayCashBictorysTable(data) {
    console.log(`🔍 CASH DEBUG: Affichage de ${data.length} jours de données`);
    const tbody = document.getElementById('cash-bictorys-tbody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    data.forEach((dayData, index) => {
        // Debug spécifique pour le 1er juillet
        if (dayData.date === '2025-07-01') {
            console.log(`🔍 CASH DEBUG: Affichage 1er juillet - amount: ${dayData.amount}, type: ${typeof dayData.amount}`);
        }
        
        const row = document.createElement('tr');
        
        // Convertir la date en objet Date pour obtenir le nom du jour
        const dateObj = new Date(dayData.date + 'T00:00:00');
        const dayName = dateObj.toLocaleDateString('fr-FR', { weekday: 'long' });
        
        // Classe pour distinguer les week-ends
        const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
        if (isWeekend) {
            row.classList.add('weekend-row');
        }
        
        row.innerHTML = `
            <td>${formatDate(dayData.date)}</td>
            <td class="day-name ${isWeekend ? 'weekend' : ''}">${dayName}</td>
            <td class="amount-cell">
                ${canEditCashBictorys 
                    ? `<input type="number" class="cash-amount-input" 
                         data-date="${dayData.date}" 
                         value="${dayData.amount}" 
                         min="0" step="1" 
                         onchange="updateCashBictorysValue('${dayData.date}', 'amount', this.value)">` 
                    : `<span class="amount-display">${formatCurrency(dayData.amount)}</span>`
                }
            </td>
            <td class="amount-cell">
                ${canEditCashBictorys 
                    ? `<input type="number" class="cash-amount-input" 
                         data-date="${dayData.date}" 
                         value="${dayData.balance || 0}" 
                         min="0" step="1" 
                         onchange="updateCashBictorysValue('${dayData.date}', 'balance', this.value)">` 
                    : `<span class="amount-display">${formatCurrency(dayData.balance || 0)}</span>`
                }
            </td>
            <td class="amount-cell">
                ${canEditCashBictorys 
                    ? `<input type="number" class="cash-amount-input" 
                         data-date="${dayData.date}" 
                         value="${dayData.fees || 0}" 
                         min="0" step="1" 
                         onchange="updateCashBictorysValue('${dayData.date}', 'fees', this.value)">` 
                    : `<span class="amount-display">${formatCurrency(dayData.fees || 0)}</span>`
                }
            </td>
        `;
        
        tbody.appendChild(row);
    });
}

// Mettre à jour une valeur dans les données
function updateCashBictorysValue(date, field, value) {
    const numericValue = parseInt(value) || 0;
    
    // Mettre à jour dans les données locales
    const dataItem = currentCashBictorysData.find(item => item.date === date);
    if (dataItem) {
        dataItem[field] = numericValue;
    }
    
    // Recalculer le total
    updateCashBictorysTotal();
}

// Calculer et afficher le total du mois (valeur de la dernière date avec valeur non-zéro)
function updateCashBictorysTotal() {
    let latestAmount = 0;
    let latestBalance = 0;
    let latestFees = 0;
    
    if (currentCashBictorysData && currentCashBictorysData.length > 0) {
        // Trier les données par date (la plus récente en premier)
        const sortedData = [...currentCashBictorysData].sort((a, b) => new Date(b.date) - new Date(a.date));
        
        // Trouver la dernière date avec une valeur différente de zéro
        const latestNonZeroEntry = sortedData.find(item => {
            const amount = parseInt(item.amount) || 0;
            const balance = parseInt(item.balance) || 0;
            const fees = parseInt(item.fees) || 0;
            return amount !== 0 || balance !== 0 || fees !== 0;
        });
        
        if (latestNonZeroEntry) {
            latestAmount = parseInt(latestNonZeroEntry.amount) || 0;
            latestBalance = parseInt(latestNonZeroEntry.balance) || 0;
            latestFees = parseInt(latestNonZeroEntry.fees) || 0;
        }
    }
    
    // Mettre à jour l'affichage des totaux
    const totalElement = document.getElementById('cash-bictorys-total');
    const balanceElement = document.getElementById('cash-bictorys-balance');
    const feesElement = document.getElementById('cash-bictorys-fees');
    
    if (totalElement) {
        totalElement.textContent = formatCurrency(latestAmount);
        totalElement.className = 'total-value';
        if (latestAmount > 0) totalElement.classList.add('amount-positive');
        else if (latestAmount < 0) totalElement.classList.add('amount-negative');
        else totalElement.classList.add('amount-neutral');
    }
    
    if (balanceElement) {
        balanceElement.textContent = formatCurrency(latestBalance);
        balanceElement.className = 'total-value';
        if (latestBalance > 0) balanceElement.classList.add('amount-positive');
        else if (latestBalance < 0) balanceElement.classList.add('amount-negative');
        else balanceElement.classList.add('amount-neutral');
    }
    
    if (feesElement) {
        feesElement.textContent = formatCurrency(latestFees);
        feesElement.className = 'total-value';
        if (latestFees > 0) feesElement.classList.add('amount-positive');
        else if (latestFees < 0) feesElement.classList.add('amount-negative');
        else feesElement.classList.add('amount-neutral');
    }
}

// Mettre à jour l'état du bouton de sauvegarde Cash Bictorys
function updateCashBictorysSaveButtonState() {
    console.log('🔧 CASH: updateCashBictorysSaveButtonState appelée');
    console.log('🔧 CASH: canEditCashBictorys =', canEditCashBictorys);
    
    const saveBtn = document.getElementById('save-cash-bictorys-btn');
    if (saveBtn) {
        saveBtn.disabled = !canEditCashBictorys;
        console.log('🔧 CASH: Bouton disabled set to:', saveBtn.disabled);
        
        if (canEditCashBictorys) {
            saveBtn.classList.remove('btn-disabled');
            saveBtn.title = 'Sauvegarder les modifications';
            console.log('✅ CASH: Bouton activé');
        } else {
            saveBtn.classList.add('btn-disabled');
            saveBtn.title = 'Vous n\'avez pas les permissions pour modifier';
            console.log('❌ CASH: Bouton désactivé');
        }
    } else {
        console.error('❌ CASH: Bouton save introuvable dans updateCashBictorysSaveButtonState');
    }
}

// Gérer la sauvegarde
async function handleSaveCashBictorys() {
    console.log('🔧 CLIENT: handleSaveCashBictorys démarée');
    console.log('🔧 CLIENT: canEditCashBictorys =', canEditCashBictorys);
    console.log('🔧 CLIENT: currentMonthYear =', currentMonthYear);
    console.log('🔧 CLIENT: currentCashBictorysData =', currentCashBictorysData);
    
    if (!canEditCashBictorys) {
        console.log('❌ CLIENT: Bloqué par permissions');
        showNotification('Vous n\'avez pas les permissions pour modifier ces données', 'error');
        return;
    }
    
    if (!currentMonthYear || currentCashBictorysData.length === 0) {
        console.log('❌ CLIENT: Bloqué par données manquantes');
        showNotification('Aucune donnée à sauvegarder', 'error');
        return;
    }
    
    try {
        // Préparer les données à envoyer
        const dataToSend = currentCashBictorysData.map(item => ({
            date: item.date,
            amount: parseInt(item.amount) || 0,
            balance: parseInt(item.balance) || 0,
            fees: parseInt(item.fees) || 0
        }));

        console.log('✅ CLIENT: Données préparées:', dataToSend);
        console.log('🌐 CLIENT: Envoi requête vers:', apiUrl(`/api/cash-bictorys/${currentMonthYear}`));

        const response = await fetch(apiUrl(`/api/cash-bictorys/${currentMonthYear}`), {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                data: dataToSend
            })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Erreur lors de la sauvegarde');
        }
        
        const result = await response.json();
        showNotification(result.message, 'success');
        
        // Recharger les données pour s'assurer de la synchronisation
        await loadCashBictorysMonth(currentMonthYear);
        
    } catch (error) {
        console.error('Erreur sauvegarde Cash Bictorys:', error);
        showNotification(error.message, 'error');
    }
}

// ===== MODULE DE VISUALISATION =====

// Variables globales pour la visualisation
let currentVisualisationTab = 'pl';
let visualisationCharts = {};
let currentVisualisationData = {};

// Fonction pour afficher/masquer l'indicateur de chargement de la visualisation
function showVisualisationLoading(show) {
    const loadingElements = document.querySelectorAll('.viz-loading');
    const contentElements = document.querySelectorAll('.viz-content');
    
    if (show) {
        loadingElements.forEach(el => {
            if (el) el.style.display = 'block';
        });
        contentElements.forEach(el => {
            if (el) el.style.opacity = '0.5';
        });
    } else {
        loadingElements.forEach(el => {
            if (el) el.style.display = 'none';
        });
        contentElements.forEach(el => {
            if (el) el.style.opacity = '1';
        });
    }
}

// Initialiser le module de visualisation
async function initVisualisationModule() {
    console.log('🔄 CLIENT: Initialisation du module de visualisation');
    
    try {
        // Configurer les dates par défaut (derniers 90 jours pour avoir plus de données)
        setupVisualisationDateControls();
        
        // Configurer les événements des onglets
        setupVisualisationTabs();
        
        // Configurer les événements des contrôles
        setupVisualisationControls();
        
        // Charger les données par défaut
        await loadVisualisationData();
        
        // Créer les graphiques après le chargement des données
        createVisualisationCharts();
        
        console.log('✅ CLIENT: Module de visualisation initialisé avec succès');
        
    } catch (error) {
        console.error('❌ CLIENT: Erreur initialisation visualisation:', error);
        showNotification('Erreur lors de l\'initialisation de la visualisation', 'error');
    }
}
// Créer les graphiques de visualisation
function createVisualisationCharts() {
    console.log('📊 CLIENT: Création des graphiques de visualisation');
    
    // Graphique PL
    createPLChart();
    
    // Graphique Stock Vivant
    createStockVivantChart();
    
    // Graphique Stock PV
    createStockPVChart();
    
    // Graphique Solde
    createSoldeChart();
}

// Créer le graphique PL
function createPLChart() {
    const ctx = document.getElementById('pl-chart').getContext('2d');
    
    // Détruire le graphique existant s'il y en a un
    if (visualisationCharts.plChart) {
        visualisationCharts.plChart.destroy();
    }
    
    const rawData = currentVisualisationData.pl;
    const data = rawData && rawData.data ? rawData.data : [];
    
    visualisationCharts.plChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.map(item => item.date),
            datasets: [{
                label: 'PL Final',
                data: data.map(item => item.pl_final),
                borderColor: 'rgb(75, 192, 192)',
                backgroundColor: 'rgba(75, 192, 192, 0.2)',
                tension: 0.4,
                fill: true
            }, {
                label: 'Cash Bictorys',
                data: data.map(item => item.cash_bictorys),
                borderColor: 'rgb(255, 99, 132)',
                backgroundColor: 'rgba(255, 99, 132, 0.1)',
                tension: 0.4
            }, {
                label: 'Créances',
                data: data.map(item => item.creances),
                borderColor: 'rgb(54, 162, 235)',
                backgroundColor: 'rgba(54, 162, 235, 0.1)',
                tension: 0.4
            }, {
                label: 'Dépenses (Cash Burn)',
                data: data.map(item => item.cash_burn),
                borderColor: 'rgb(255, 159, 64)',
                backgroundColor: 'rgba(255, 159, 64, 0.1)',
                tension: 0.4,
                borderDash: [5, 5]
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                intersect: false,
                mode: 'index'
            },
            plugins: {
                title: {
                    display: true,
                    text: 'Évolution du PL (Profit & Loss)'
                },
                legend: {
                    position: 'top'
                }
            },
            scales: {
                y: {
                    beginAtZero: false,
                    ticks: {
                        callback: function(value) {
                            return new Intl.NumberFormat('fr-FR', {
                                style: 'currency',
                                currency: 'XOF',
                                minimumFractionDigits: 0
                            }).format(value);
                        }
                    }
                }
            }
        }
    });
}

// Créer le graphique Stock Vivant
function createStockVivantChart() {
    const ctx = document.getElementById('stock-vivant-chart').getContext('2d');
    
    if (visualisationCharts.stockVivantChart) {
        visualisationCharts.stockVivantChart.destroy();
    }
    
    const rawData = currentVisualisationData.stockVivant;
    const data = rawData && rawData.data ? rawData.data : [];
    
    visualisationCharts.stockVivantChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.map(item => item.date),
            datasets: [{
                label: 'Stock Vivant Total',
                data: data.map(item => item.total_stock_vivant),
                backgroundColor: 'rgba(34, 197, 94, 0.8)',
                borderColor: 'rgba(34, 197, 94, 1)',
                borderWidth: 1
            }, {
                label: 'Variation',
                data: data.map(item => item.variation),
                type: 'line',
                borderColor: 'rgb(239, 68, 68)',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                tension: 0.4,
                yAxisID: 'y1'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                intersect: false,
                mode: 'index'
            },
            plugins: {
                title: {
                    display: true,
                    text: 'Évolution du Stock Vivant'
                }
            },
            scales: {
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    ticks: {
                        callback: function(value) {
                            return new Intl.NumberFormat('fr-FR').format(value) + ' FCFA';
                        }
                    }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    grid: {
                        drawOnChartArea: false
                    },
                    ticks: {
                        callback: function(value) {
                            return (value >= 0 ? '+' : '') + new Intl.NumberFormat('fr-FR').format(value);
                        }
                    }
                }
            }
        }
    });
}

// Créer le graphique Stock PV
function createStockPVChart() {
    const ctx = document.getElementById('stock-pv-chart').getContext('2d');
    
    if (visualisationCharts.stockPVChart) {
        visualisationCharts.stockPVChart.destroy();
    }
    
    const rawData = currentVisualisationData.stockPV;
    const data = rawData && rawData.data ? rawData.data : [];
    
    visualisationCharts.stockPVChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.map(item => item.date),
            datasets: [{
                label: 'Stock Point de Vente',
                data: data.map(item => item.stock_point_vente),
                borderColor: 'rgb(147, 51, 234)',
                backgroundColor: 'rgba(147, 51, 234, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: 'Évolution du Stock Point de Vente'
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return new Intl.NumberFormat('fr-FR').format(value) + ' FCFA';
                        }
                    }
                }
            }
        }
    });
}

// Créer le graphique Solde
function createSoldeChart() {
    const ctx = document.getElementById('solde-chart').getContext('2d');
    
    if (visualisationCharts.soldeChart) {
        visualisationCharts.soldeChart.destroy();
    }
    
    const rawData = currentVisualisationData.solde;
    const data = rawData && rawData.data ? rawData.data : [];
    
    visualisationCharts.soldeChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.map(item => item.date),
            datasets: [{
                label: 'Solde Total',
                data: data.map(item => item.solde_total),
                borderColor: 'rgb(59, 130, 246)',
                backgroundColor: 'rgba(59, 130, 246, 0.3)',
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: 'Évolution du Solde Général'
                }
            },
            scales: {
                y: {
                    beginAtZero: false,
                    ticks: {
                        callback: function(value) {
                            return new Intl.NumberFormat('fr-FR').format(value) + ' FCFA';
                        }
                    }
                }
            }
        }
    });
}

// Configurer les dates par défaut
function setupVisualisationDateControls() {
    const today = new Date();
    const ninetyDaysAgo = new Date(today);
    ninetyDaysAgo.setDate(today.getDate() - 90);
    
    const startDateInput = document.getElementById('viz-start-date');
    const endDateInput = document.getElementById('viz-end-date');
    
    if (startDateInput) {
        startDateInput.value = ninetyDaysAgo.toISOString().split('T')[0];
    }
    
    if (endDateInput) {
        endDateInput.value = today.toISOString().split('T')[0];
    }
    
    console.log(`📅 CLIENT: Dates par défaut configurées: ${ninetyDaysAgo.toISOString().split('T')[0]} à ${today.toISOString().split('T')[0]}`);
}

// Configurer les événements des onglets
function setupVisualisationTabs() {
    const tabButtons = document.querySelectorAll('.visualisation-tabs .tab-button');
    
    tabButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            e.preventDefault();
            const tabId = button.getAttribute('data-viz');
            switchVisualisationTab(tabId);
        });
    });
}

// Configurer les événements des contrôles
function setupVisualisationControls() {
    const refreshButton = document.getElementById('viz-refresh');
    const periodSelect = document.getElementById('viz-period-type');
    
    if (refreshButton) {
        refreshButton.addEventListener('click', loadVisualisationData);
    }
    
    if (periodSelect) {
        periodSelect.addEventListener('change', loadVisualisationData);
    }
}

// Changer d'onglet de visualisation
function switchVisualisationTab(tabId) {
    console.log('🔄 CLIENT: Changement vers l\'onglet:', tabId);
    
    // Mettre à jour les boutons d'onglets
    document.querySelectorAll('.visualisation-tabs .tab-button').forEach(btn => {
        btn.classList.remove('active');
    });
    
    document.querySelector(`[data-viz="${tabId}"]`).classList.add('active');
    
    // Masquer tous les panneaux
    document.querySelectorAll('.viz-panel').forEach(panel => {
        panel.classList.remove('active');
    });
    
    // Afficher le panneau sélectionné
    const targetPanel = document.getElementById(`${tabId}-viz`);
    if (targetPanel) {
        targetPanel.classList.add('active');
    }
    
    // Mettre à jour l'onglet actuel
    currentVisualisationTab = tabId;
    
    // Redessiner le graphique si les données sont déjà chargées
    const dataKey = getVisualisationDataKey(tabId);
    if (currentVisualisationData[dataKey]) {
        renderVisualisationChart(tabId, currentVisualisationData[dataKey]);
    }
}

// Convertir l'ID de l'onglet en clé de données
function getVisualisationDataKey(tabId) {
    const keyMap = {
        'pl': 'pl',
        'stock-vivant': 'stockVivant',
        'stock-pv': 'stockPV',
        'solde': 'solde'
    };
    return keyMap[tabId] || tabId;
}

// Charger les données de visualisation
async function loadVisualisationData() {
    console.log('🔄 CLIENT: Chargement des données de visualisation');
    
    const startDate = document.getElementById('viz-start-date').value;
    const endDate = document.getElementById('viz-end-date').value;
    const periodType = document.getElementById('viz-period-type').value;
    
    if (!startDate || !endDate) {
        showNotification('Veuillez sélectionner les dates de début et fin', 'error');
        return;
    }
    
    if (new Date(startDate) > new Date(endDate)) {
        showNotification('La date de début doit être antérieure à la date de fin', 'error');
        return;
    }
    
    try {
        // Afficher un indicateur de chargement
        showVisualisationLoading(true);
        
        // Charger les données pour chaque onglet
        await Promise.all([
            loadPLData(startDate, endDate, periodType),
            loadStockVivantVisualisationData(startDate, endDate, periodType),
            loadStockPVData(startDate, endDate, periodType),
            loadSoldeData(startDate, endDate, periodType)
        ]);
        
        // Créer les graphiques avec les nouvelles données
        createVisualisationCharts();
        
        // Afficher les données de l'onglet actuel
        const dataKey = getVisualisationDataKey(currentVisualisationTab);
        if (currentVisualisationData[dataKey]) {
            updateVisualisationTable(currentVisualisationTab, currentVisualisationData[dataKey]);
        }
        
        showNotification('Données de visualisation mises à jour', 'success');
        
    } catch (error) {
        console.error('❌ CLIENT: Erreur chargement données visualisation:', error);
        showNotification('Erreur lors du chargement des données', 'error');
    } finally {
        showVisualisationLoading(false);
    }
}

// ===== FONCTIONS DE CHARGEMENT DE DONNÉES POUR VISUALISATION =====

// Charger les données PL pour la visualisation
async function loadPLData(startDate, endDate, periodType) {
    try {
        console.log('📊 CLIENT: Chargement données PL pour visualisation');
        console.log(`📅 CLIENT: Paramètres - startDate: "${startDate}", endDate: "${endDate}", periodType: "${periodType}"`);
        
        const url = `/api/visualisation/pl-data?start_date=${startDate}&end_date=${endDate}&period_type=${periodType}`;
        console.log(`🌐 CLIENT: URL appelée: ${url}`);
        
        const response = await fetch(url);
        if (!response.ok) throw new Error('Erreur chargement données PL');
        
        const result = await response.json();
        
        console.log('📊 CLIENT: Réponse API brute:', result);
        console.log(`📊 CLIENT: Données reçues (${result.data?.length || 0} éléments):`, result.data);
        
        // Les données arrivent déjà formatées depuis l'API
        currentVisualisationData.pl = {
            data: result.data || [],
            summary: result.summary || {}
        };
        
        console.log('✅ CLIENT: Données PL chargées', currentVisualisationData.pl);
        console.log(`📈 CLIENT: ${result.data?.length || 0} points de données PL trouvés`);
    } catch (error) {
        console.error('❌ CLIENT: Erreur chargement données PL:', error);
        currentVisualisationData.pl = { data: [], summary: {} };
    }
}

// Charger les données Stock Vivant pour la visualisation
async function loadStockVivantVisualisationData(startDate, endDate, periodType) {
    try {
        console.log('📊 CLIENT: Chargement données Stock Vivant pour visualisation');
        const response = await fetch(`/api/visualisation/stock-vivant-data?start_date=${startDate}&end_date=${endDate}&period_type=${periodType}`);
        
        if (!response.ok) {
            throw new Error('Erreur chargement données Stock Vivant');
        }
        
        const result = await response.json();
        
        currentVisualisationData.stockVivant = {
            data: result.data || [],
            summary: result.summary || {}
        };
        
        console.log('✅ CLIENT: Données Stock Vivant chargées', currentVisualisationData.stockVivant);
        console.log(`📈 CLIENT: ${result.data?.length || 0} points de données Stock Vivant trouvés`);
    } catch (error) {
        console.error('❌ CLIENT: Erreur chargement données Stock Vivant:', error);
        currentVisualisationData.stockVivant = { data: [], summary: {} };
    }
}

// Charger les données Stock PV pour la visualisation
async function loadStockPVData(startDate, endDate, periodType) {
    try {
        console.log('📊 CLIENT: Chargement données Stock PV pour visualisation');
        const response = await fetch(`/api/visualisation/stock-pv-data?start_date=${startDate}&end_date=${endDate}&period_type=${periodType}`);
        if (!response.ok) throw new Error('Erreur chargement données Stock PV');
        
        const result = await response.json();
        
        currentVisualisationData.stockPV = {
            data: result.data || [],
            summary: result.summary || {}
        };
        
        console.log('✅ CLIENT: Données Stock PV chargées', currentVisualisationData.stockPV);
        console.log(`📈 CLIENT: ${result.data?.length || 0} points de données Stock PV trouvés`);
    } catch (error) {
        console.error('❌ CLIENT: Erreur chargement données Stock PV:', error);
        currentVisualisationData.stockPV = { data: [], summary: {} };
    }
}

// Charger les données de solde pour la visualisation
async function loadSoldeData(startDate, endDate, periodType) {
    try {
        console.log('📊 CLIENT: Chargement données Solde pour visualisation');
        const response = await fetch(`/api/visualisation/solde-data?start_date=${startDate}&end_date=${endDate}&period_type=${periodType}`);
        if (!response.ok) throw new Error('Erreur chargement données Solde');
        
        const result = await response.json();
        
        currentVisualisationData.solde = {
            data: result.data || [],
            summary: result.summary || {}
        };
        
        console.log('✅ CLIENT: Données Solde chargées', currentVisualisationData.solde);
        console.log(`📈 CLIENT: ${result.data?.length || 0} points de données Solde trouvés`);
    } catch (error) {
        console.error('❌ CLIENT: Erreur chargement données Solde:', error);
        currentVisualisationData.solde = { data: [], summary: {} };
    }
}

// Fonction utilitaire pour obtenir la clé des données selon l'onglet
function getVisualisationDataKey(tab) {
    const keyMap = {
        'pl': 'pl',
        'stock-vivant': 'stockVivant',
        'stock-pv': 'stockPV',
        'solde': 'solde'
    };
    return keyMap[tab] || 'pl';
}

// Fonction utilitaire pour mettre à jour le tableau de visualisation
function updateVisualisationTable(tab, data) {
    console.log(`📊 CLIENT: Mise à jour tableau pour onglet ${tab}`, data);
    
    if (!data || !data.data || !Array.isArray(data.data)) {
        console.warn(`⚠️ CLIENT: Données invalides pour l'onglet ${tab}`, data);
        return;
    }
    
    // Identifier le bon tableau selon l'onglet
    let tbodyId;
    switch (tab) {
        case 'pl':
            tbodyId = 'pl-data-tbody';
            break;
        case 'stock-vivant':
            tbodyId = 'stock-vivant-data-tbody';
            break;
        case 'stock-pv':
            tbodyId = 'stock-pv-data-tbody';
            break;
        case 'solde':
            tbodyId = 'solde-data-tbody';
            break;
        default:
            console.warn(`⚠️ CLIENT: Onglet inconnu: ${tab}`);
            return;
    }
    
    const tbody = document.getElementById(tbodyId);
    if (!tbody) {
        console.error(`❌ CLIENT: Élément ${tbodyId} non trouvé`);
        return;
    }
    
    // Vider le tableau
    tbody.innerHTML = '';
    
    // Trier les données par date en ordre décroissant (plus récent en premier)
    const sortedData = [...data.data].sort((a, b) => {
        const dateA = new Date(a.date);
        const dateB = new Date(b.date);
        return dateB - dateA; // Ordre décroissant
    });
    
    // Remplir avec les nouvelles données triées
    sortedData.forEach((row, index) => {
        console.log(`📊 CLIENT: Ligne ${index + 1} - Données brutes:`, row);
        console.log(`📅 CLIENT: Ligne ${index + 1} - Date brute: "${row.date}" (type: ${typeof row.date})`);
        
        const tr = document.createElement('tr');
        
        switch (tab) {
            case 'pl':
                tr.innerHTML = `
                    <td>${row.date}</td>
                    <td>${formatCurrency(row.cash_bictorys)}</td>
                    <td>${formatCurrency(row.creances)}</td>
                    <td>${formatCurrency(row.stock_pv)}</td>
                    <td>${formatCurrency(row.ecart_stock_vivant)}</td>
                    <td>${formatCurrency(row.livraisons_partenaires || 0)}</td>
                    <td>${formatCurrency(row.cash_burn)}</td>
                    <td>${formatCurrency(row.charges_estimees)}</td>
                    <td>${formatCurrency(row.virements_mois || 0)}</td>
                    <td>${formatCurrency(row.remboursements_mois || 0)}</td>
                    <td><strong>${formatCurrency(row.pl_final)}</strong></td>
                `;
                break;
                
            case 'stock-vivant':
                tr.innerHTML = `
                    <td>${row.date}</td>
                    <td>${formatCurrency(row.total_stock_vivant)}</td>
                    <td class="${row.variation >= 0 ? 'text-success' : 'text-danger'}">
                        ${row.variation >= 0 ? '+' : ''}${formatCurrency(row.variation)}
                    </td>
                    <td>${row.nombre_entrees || 0}</td>
                `;
                break;
                
            case 'stock-pv':
                tr.innerHTML = `
                    <td>${row.date}</td>
                    <td>${formatCurrency(row.stock_point_vente)}</td>
                    <td class="${row.variation >= 0 ? 'text-success' : 'text-danger'}">
                        ${row.variation >= 0 ? '+' : ''}${formatCurrency(row.variation)}
                    </td>
                    <td>${row.points_vente || 0}</td>
                `;
                break;
                
            case 'solde':
                tr.innerHTML = `
                    <td>${row.date}</td>
                    <td>${formatCurrency(row.solde_total)}</td>
                    <td class="${row.variation >= 0 ? 'text-success' : 'text-danger'}">
                        ${row.variation >= 0 ? '+' : ''}${formatCurrency(row.variation)}
                    </td>
                    <td>${row.comptes_actifs || 0}</td>
                `;
                break;
        }
        
        tbody.appendChild(tr);
    });
    
    console.log(`✅ CLIENT: Tableau ${tbodyId} mis à jour avec ${sortedData.length} lignes (triées par date décroissante)`);
}

// ===== FONCTIONS SETUP POUR LE MODULE VISUALISATION =====

// Configurer les contrôles de date pour la visualisation
function setupVisualisationDateControls() {
    console.log('📅 CLIENT: Configuration des contrôles de date visualisation');
    
    // Définir les dates par défaut (derniers 90 jours pour avoir plus de données)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - 90);
    
    const startDateInput = document.getElementById('viz-start-date');
    const endDateInput = document.getElementById('viz-end-date');
    
    if (startDateInput) startDateInput.value = startDate.toISOString().split('T')[0];
    if (endDateInput) endDateInput.value = endDate.toISOString().split('T')[0];
    
    console.log(`📅 CLIENT: Dates par défaut configurées: ${startDate.toISOString().split('T')[0]} à ${endDate.toISOString().split('T')[0]}`);
}

// Configurer les onglets de visualisation
function setupVisualisationTabs() {
    console.log('📑 CLIENT: Configuration des onglets visualisation');
    
    const tabButtons = document.querySelectorAll('.tab-button');
    tabButtons.forEach(button => {
        button.addEventListener('click', function() {
            const tabId = this.getAttribute('data-viz');
            switchVisualisationTab(tabId);
        });
    });
}

// Configurer les contrôles de visualisation
function setupVisualisationControls() {
    console.log('🎛️ CLIENT: Configuration des contrôles visualisation');
    
    const refreshButton = document.getElementById('viz-refresh');
    if (refreshButton) {
        refreshButton.addEventListener('click', loadVisualisationData);
    }
    
    const periodSelect = document.getElementById('viz-period-type');
    if (periodSelect) {
        periodSelect.addEventListener('change', function() {
            console.log('📊 CLIENT: Période changée:', this.value);
            loadVisualisationData(); // Recharger automatiquement les données
        });
    }
}

// Changer d'onglet de visualisation
function switchVisualisationTab(tabId) {
    console.log(`📑 CLIENT: Changement vers onglet ${tabId}`);
    
    // Mettre à jour l'onglet actuel
    currentVisualisationTab = tabId;
    
    // Mettre à jour l'interface
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabPanels = document.querySelectorAll('.viz-panel');
    
    // Mettre à jour les boutons
    tabButtons.forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-viz') === tabId);
    });
    
    // Mettre à jour les panneaux
    tabPanels.forEach(panel => {
        const panelId = `${tabId}-viz`;
        panel.classList.toggle('active', panel.id === panelId);
    });
    
    // Mettre à jour les données affichées
    const dataKey = getVisualisationDataKey(tabId);
    if (currentVisualisationData[dataKey]) {
        updateVisualisationTable(tabId, currentVisualisationData[dataKey]);
    }
}

// ===== MODULE DE SAUVEGARDE DU TABLEAU DE BORD =====

// Fonction simple pour synchroniser la date de fin avec le snapshot
function synchronizeEndDateWithSnapshot(snapshotDate) {
    const dashboardEndDate = document.getElementById('dashboard-end-date');
    if (dashboardEndDate && snapshotDate) {
        dashboardEndDate.value = snapshotDate;
        console.log(`📅 CLIENT: Date de fin synchronisée avec snapshot: ${snapshotDate}`);
    }
}

// Initialiser la section de sauvegarde du tableau de bord
function initDashboardSaveSection() {
    console.log('🔄 CLIENT: Initialisation de la section de sauvegarde du tableau de bord');
    
    // Définir la date par défaut (aujourd'hui)
    const today = new Date().toISOString().split('T')[0];
    const snapshotDateInput = document.getElementById('snapshot-date');
    if (snapshotDateInput) {
        // Contraindre la date selon le mois sélectionné
        updateSnapshotDateConstraints();
        snapshotDateInput.value = today;
        
        // ✨ SYNCHRONISATION INITIALE: Mettre à jour la "Date de fin" avec la date du snapshot
        synchronizeEndDateWithSnapshot(today);
        
                // ✨ NOUVEAU: Mise à jour automatique du dashboard quand la date change
        let isUpdating = false; // Flag pour prévenir les exécutions multiples
        
        async function handleDateChange() {
            // Prévenir les exécutions multiples
            if (isUpdating) {
                console.log('⚠️ handleDateChange: Mise à jour déjà en cours, ignoré');
                return;
            }
            
            isUpdating = true;
            const selectedDate = snapshotDateInput.value;

            // Afficher un indicateur de chargement
            const saveButton = document.getElementById('save-dashboard-snapshot');
            const originalText = saveButton ? saveButton.innerHTML : '';
            
            if (saveButton) {
                saveButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Mise à jour...';
                saveButton.disabled = true;
            }

            try {
                if (selectedDate) {
                    console.log(`📅 CLIENT: Date snapshot changée vers: ${selectedDate} - Mise à jour COMPLÈTE du dashboard...`);
                    
                    // ✨ SYNCHRONISATION AUTOMATIQUE: Mettre à jour la "Date de fin" avec la date du snapshot
                    synchronizeEndDateWithSnapshot(selectedDate);
                    
                    // ✨ NOUVELLE APPROCHE: Mettre à jour TOUTES les cartes avec la date cutoff
                    await loadDashboardWithCutoff(selectedDate);
                    
                    console.log('✅ CLIENT: Dashboard mis à jour COMPLÈTEMENT avec succès pour la date:', selectedDate);
                } else {
                    // Si pas de date, revenir aux valeurs actuelles (sans cutoff)
                    console.log('📅 CLIENT: Pas de date sélectionnée - retour aux valeurs actuelles');
                    
                    // Recharger toutes les données sans cutoff
                    const currentMonth = selectedMonth || getCurrentMonth();
                    await loadMonthlyDashboard(currentMonth);
                }
            } catch (error) {
                console.error('❌ CLIENT: Erreur mise à jour dashboard:', error);
                showNotification('Erreur lors de la mise à jour du dashboard', 'error');
            } finally {
                // Restaurer le bouton
                if (saveButton) {
                    saveButton.innerHTML = originalText || '<i class="fas fa-download"></i> Sauvegarder Snapshot';
                    saveButton.disabled = false;
                }
                
                // Libérer le flag pour permettre les futures exécutions
                isUpdating = false;
                
                console.log('🔄 CLIENT: Bouton de sauvegarde restauré');
            }
        }
        
        // Écouter les changements de date (sélecteur de date et saisie manuelle)
        // Attacher un seul event listener (change suffit pour les inputs de type date)
        snapshotDateInput.addEventListener('change', handleDateChange);
        
        // Ajouter validation en temps réel des contraintes
        snapshotDateInput.addEventListener('input', function() {
            validateSnapshotDate();
        });
        
        console.log('✅ CLIENT: Event listeners de changement de date attachés');
    }
    
    // Ajouter l'événement de sauvegarde
    const saveButton = document.getElementById('save-dashboard-snapshot');
    if (saveButton) {
        saveButton.addEventListener('click', saveDashboardSnapshot);
    }
    
    console.log('✅ CLIENT: Section de sauvegarde initialisée');
}
// Fonction de test manuel pour vérifier les listeners (à appeler depuis la console)
function testDashboardDateListeners() {
    console.log('🧪 CLIENT: Test manuel des listeners de date du dashboard');
    
    const dashboardStartDate = document.getElementById('dashboard-start-date');
    const dashboardEndDate = document.getElementById('dashboard-end-date');
    const snapshotDate = document.getElementById('snapshot-date');
    
    console.log('🧪 CLIENT: Éléments trouvés:', {
        dashboardStartDate: !!dashboardStartDate,
        dashboardEndDate: !!dashboardEndDate,
        snapshotDate: !!snapshotDate
    });
    
    if (dashboardStartDate) {
        console.log('🧪 CLIENT: Valeur actuelle start-date:', dashboardStartDate.value);
        console.log('🧪 CLIENT: Test de déclenchement manuel...');
        dashboardStartDate.dispatchEvent(new Event('change'));
    }
    
    if (dashboardEndDate) {
        console.log('🧪 CLIENT: Valeur actuelle end-date:', dashboardEndDate.value);
        console.log('🧪 CLIENT: Test de déclenchement manuel...');
        dashboardEndDate.dispatchEvent(new Event('change'));
    }
    
    if (snapshotDate) {
        console.log('🧪 CLIENT: Valeur actuelle snapshot-date:', snapshotDate.value);
        console.log('🧪 CLIENT: Test de déclenchement manuel...');
        snapshotDate.dispatchEvent(new Event('change'));
    }
}

// Valider la date de snapshot en temps réel
function validateSnapshotDate() {
    const snapshotDateInput = document.getElementById('snapshot-date');
    if (!snapshotDateInput) return;
    
    const selectedDate = snapshotDateInput.value;
    if (!selectedDate) return;
    
    const min = snapshotDateInput.min;
    const max = snapshotDateInput.max;
    
    let isValid = true;
    let message = '';
    let correctedValue = null;
    
    if (selectedDate < min) {
        isValid = false;
        const targetMonth = selectedMonth || getCurrentMonth();
        message = `La date doit être dans le mois de ${getMonthName(targetMonth)}`;
        correctedValue = min;
    } else if (selectedDate > max) {
        isValid = false;
        message = 'Impossible de sélectionner une date future';
        correctedValue = max;
    }
    
    if (!isValid && correctedValue) {
        // Appliquer la correction avec animation
        snapshotDateInput.value = correctedValue;
        snapshotDateInput.classList.add('corrected');
        
        // Supprimer la classe d'animation après qu'elle soit terminée
        setTimeout(() => {
            snapshotDateInput.classList.remove('corrected');
        }, 800);
        
        showNotification(message, 'warning');
        console.log(`📅 Date corrigée automatiquement: ${selectedDate} -> ${correctedValue}`);
    }
    
    // Ajouter une classe visuelle pour indiquer l'état
    snapshotDateInput.classList.toggle('date-constrained', min && max);
}

// Sauvegarder un snapshot du tableau de bord
async function saveDashboardSnapshot() {
    console.log('💾 CLIENT: Début sauvegarde snapshot tableau de bord');
    
    const snapshotDateInput = document.getElementById('snapshot-date');
    const snapshotNotesInput = document.getElementById('snapshot-notes');
    
    if (!snapshotDateInput) {
        console.error('❌ CLIENT: Élément snapshot-date non trouvé');
        alert('Erreur: champ date non trouvé');
        return;
    }
    
    const snapshotDate = snapshotDateInput.value;
    const notes = snapshotNotesInput ? snapshotNotesInput.value : '';
    
    if (!snapshotDate) {
        alert('Veuillez sélectionner une date pour le snapshot');
        return;
    }
    
    try {
        // Les données sont déjà mises à jour automatiquement quand la date change
        // Attendre un peu pour s'assurer que toutes les données sont à jour
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Fonction utilitaire pour parser les valeurs formatées en français
        function parseFormattedNumber(text) {
            if (!text) return 0;
            
            // Supprimer les devises et unités communes
            let cleanText = text.toString()
                .replace(/FCFA?/gi, '')  // Supprimer FCFA/CFA
                .replace(/F\s*CFA/gi, '') // Supprimer "F CFA"
                .replace(/€/g, '')       // Supprimer euro
                .replace(/\$/g, '')      // Supprimer dollar
                .trim();
            
            // Si le texte contient une virgule, c'est probablement le séparateur décimal français
            if (cleanText.includes(',')) {
                // Format français : "1 831 463,77"
                const parts = cleanText.split(',');
                if (parts.length === 2) {
                    // Partie entière : supprimer tous les espaces
                    const integerPart = parts[0].replace(/\s/g, '');
                    // Partie décimale : garder seulement les chiffres
                    const decimalPart = parts[1].replace(/[^\d]/g, '');
                    const result = parseFloat(`${integerPart}.${decimalPart}`);
                    console.log(`📊 Parse "${text}" -> "${integerPart}.${decimalPart}" -> ${result}`);
                    return isNaN(result) ? 0 : result;
                }
            }
            
            // Sinon, supprimer tous les caractères non-numériques sauf point et tiret
            const fallback = parseFloat(cleanText.replace(/[^\d.-]/g, '') || '0');
            console.log(`📊 Parse fallback "${text}" -> ${fallback}`);
            return isNaN(fallback) ? 0 : fallback;
        }
        
        // Collecter toutes les valeurs actuelles du tableau de bord
        const snapshotData = {
            snapshot_date: snapshotDate,
            notes: notes,
            // Valeurs des cartes de statistiques
            total_spent_amount: parseFormattedNumber(document.getElementById('total-spent-amount')?.textContent),
            total_remaining_amount: parseFormattedNumber(document.getElementById('total-remaining-amount')?.textContent),
            cash_bictorys_amount: parseFormattedNumber(document.getElementById('cash-bictorys-latest')?.textContent),
            creances_total: parseFormattedNumber(document.getElementById('total-creances')?.textContent),
            creances_mois: parseFormattedNumber(document.getElementById('creances-mois')?.textContent),
            stock_point_vente: parseFormattedNumber(document.getElementById('stock-total')?.textContent),
            stock_vivant_total: parseFormattedNumber(document.getElementById('stock-vivant-total')?.textContent),
            stock_vivant_variation: parseFormattedNumber(document.getElementById('stock-vivant-variation')?.textContent),
            virements_mois: parseFormattedNumber(document.getElementById('virements-mois-amount')?.textContent),
            daily_burn: 0, // À implémenter si nécessaire
            weekly_burn: parseFormattedNumber(document.getElementById('weekly-burn')?.textContent),
            monthly_burn: parseFormattedNumber(document.getElementById('monthly-burn')?.textContent),
            solde_general: parseFormattedNumber(document.getElementById('solde-amount')?.textContent),
            solde_depot: parseFormattedNumber(document.getElementById('total-depot-balance')?.textContent),
            solde_partner: parseFormattedNumber(document.getElementById('total-partner-balance')?.textContent),
            // Utiliser directement la valeur du PL affichée dans le dashboard
            pl_final: parseFormattedNumber(document.getElementById('pl-estim-charges')?.textContent),
            total_credited_with_expenses: 0, // À implémenter si nécessaire
            total_credited_general: 0 // À implémenter si nécessaire
        };
        
        console.log('📊 CLIENT: Données snapshot collectées:', snapshotData);
        console.log('📅 CLIENT: Date snapshot envoyée au serveur:', snapshotData.snapshot_date);
        
        const response = await fetch('/api/dashboard/save-snapshot', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(snapshotData)
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Erreur lors de la sauvegarde');
        }
        
        const result = await response.json();
        console.log('✅ CLIENT: Snapshot sauvegardé avec succès:', result);
        
        // Afficher un message de succès
        let alertMessage = result.message;
        if (result.wasUpdate && result.previousSnapshot) {
            alertMessage += `\n\nAncien snapshot créé par: ${result.previousSnapshot.created_by}`;
            alertMessage += `\nAncien snapshot créé le: ${new Date(result.previousSnapshot.created_at).toLocaleString()}`;
        }
        
        alert(alertMessage);
        
        // Optionnel: réinitialiser les notes
        if (snapshotNotesInput) {
            snapshotNotesInput.value = '';
        }
        
    } catch (error) {
        console.error('❌ CLIENT: Erreur sauvegarde snapshot:', error);
        alert(`Erreur lors de la sauvegarde du snapshot: ${error.message}`);
    }
}

// ... existing code ...

async function addPartnerDelivery(accountId, formData) {
    console.log(`[Partner] Submitting new delivery for account ${accountId}`, formData);
    try {
        const response = await fetch(`/api/partner/${accountId}/deliveries`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('[Partner] Failed to add delivery:', errorData);
            throw new Error(errorData.error || 'Erreur inconnue');
        }

        const newDelivery = await response.json();
        console.log('[Partner] Successfully added delivery:', newDelivery);
        
        // Réinitialiser le formulaire
        document.getElementById('addDeliveryForm').reset();
        document.getElementById('delivery-date').value = new Date().toISOString().split('T')[0];
        
        // Recharger les données des partenaires
        loadPartnerDeliveries(accountId);
        loadPartnerSummary();

    } catch (error) {
        console.error(`[Partner] CRITICAL: Exception while adding delivery for account ${accountId}:`, error);
        alert(`Erreur lors de l'ajout de la livraison: ${error.message}`);
    }
}

async function loadPartnerDeliveries(accountId) {
    const assignedDirectors = await getAssignedDirectors(accountId);
    const deliveriesList = document.getElementById('partner-deliveries-list');
    const loadingMessage = document.getElementById('partner-deliveries-loading');
    
    console.log(`[Partner] Loading deliveries for account ${accountId}...`);

    loadingMessage.style.display = 'block';
    deliveriesList.innerHTML = '';

    try {
        const response = await fetch(`/api/partner/${accountId}/deliveries`);
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[Partner] Failed to load deliveries with status ${response.status}:`, errorText);
            throw new Error('Impossible de charger les livraisons');
        }
        
        const deliveries = await response.json();
        console.log(`[Partner] Found ${deliveries.length} deliveries.`);

        loadingMessage.style.display = 'none';

        if (deliveries.length === 0) {
            deliveriesList.innerHTML = '<li>Aucune livraison pour ce compte.</li>';
            console.log('[Partner] No deliveries found, displaying message.');
        } else {
            const currentUser = await getCurrentUser();
            console.log('[Partner] Current user for validation checks:', currentUser);
            
            deliveries.forEach(delivery => {
                const item = document.createElement('li');
                item.className = `delivery-item status-${delivery.validation_status}`;
                item.dataset.deliveryId = delivery.id;

                const canValidate = canValidateDelivery(delivery, currentUser, assignedDirectors);
                const canReject = canRejectDelivery(delivery, currentUser, assignedDirectors);

                item.innerHTML = `
                    <div class="delivery-info">
                        <strong>${new Date(delivery.delivery_date).toLocaleDateString()}</strong> - ${delivery.description}
                        <br>
                        <span>${delivery.article_count} articles, ${formatCurrency(delivery.amount)}</span>
                        <br>
                        <small>Statut: ${getDeliveryStatusText(delivery)}</small>
                    </div>
                    <div class="delivery-actions">
                        ${canValidate ? `<button class="validate-delivery-btn" data-delivery-id="${delivery.id}" data-account-id="${accountId}">Valider</button>` : ''}
                        ${canReject ? `<button class="reject-delivery-btn" data-delivery-id="${delivery.id}" data-account-id="${accountId}">Rejeter</button>` : ''}
                    </div>
                `;
                deliveriesList.appendChild(item);
            });
        }
    } catch (error) {
        loadingMessage.style.display = 'none';
        deliveriesList.innerHTML = '<li>Erreur de chargement des livraisons.</li>';
        console.error(`[Partner] CRITICAL: Exception while loading deliveries for account ${accountId}:`, error);
    }
}

function canValidateDelivery(delivery, currentUser, assignedDirectors) {
    console.log(`[Partner] Checking validation permission for delivery ID ${delivery.id} by user:`, currentUser.username);
    
    // No actions allowed on fully validated or rejected deliveries
    if (delivery.validation_status === 'fully_validated' || delivery.validation_status === 'rejected') {
        console.log(`[Partner] Delivery is ${delivery.validation_status} - no actions allowed`);
        return false;
    }
    
    // Le DG, PCA et Admin peuvent toujours valider (sauf si déjà validé/rejeté)
    if (currentUser.role === 'directeur_general' || currentUser.role === 'pca' || currentUser.role === 'admin') {
        console.log('[Partner] User is DG/PCA/Admin, can validate.');
        return true;
    }

    if (currentUser.role === 'directeur') {
        const isAssigned = assignedDirectors.includes(currentUser.id);
        console.log(`[Partner] User is a director. Is assigned? ${isAssigned}`);
        
        if (!isAssigned) {
            console.log('[Partner] Director is not assigned to this account.');
            return false;
        }

        switch(delivery.validation_status) {
            case 'pending':
                console.log('[Partner] Status is pending. Director can perform first validation.');
                return true;
            case 'first_validated':
                const canSecondValidate = delivery.first_validated_by !== currentUser.id;
                console.log(`[Partner] Status is 'first_validated'. First validator ID: ${delivery.first_validated_by}, Current user ID: ${currentUser.id}. Can second-validate? ${canSecondValidate}`);
                return canSecondValidate;
            default:
                console.log(`[Partner] Status is '${delivery.validation_status}'. Director cannot validate further.`);
                return false;
        }
    }
    
    console.log('[Partner] User role does not permit validation.');
    return false;
}

function canRejectDelivery(delivery, currentUser, assignedDirectors) {
    console.log(`[Partner] Checking rejection permission for delivery ID ${delivery.id} by user:`, currentUser.username);
    
    // No actions allowed on fully validated or rejected deliveries
    if (delivery.validation_status === 'fully_validated' || delivery.validation_status === 'rejected') {
        console.log(`[Partner] Delivery is ${delivery.validation_status} - no actions allowed`);
        return false;
    }
    
    // DG, PCA et Admin peuvent rejeter (sauf si déjà validé/rejeté)
    if (currentUser.role === 'directeur_general' || currentUser.role === 'pca' || currentUser.role === 'admin') {
        console.log('[Partner] User is DG/PCA/Admin, can reject.');
        return true;
    }

    if (currentUser.role === 'directeur') {
        const isAssigned = assignedDirectors.includes(currentUser.id);
        console.log(`[Partner] User is a director. Is assigned? ${isAssigned}`);
        return isAssigned;
    }
    
    console.log('[Partner] User role does not permit rejection.');
    return false;
}

// ===== EVENT DELEGATION FOR DELIVERY VALIDATION BUTTONS =====
// Add event listeners for dynamically generated delivery validation buttons
document.addEventListener('DOMContentLoaded', function() {
    console.log('[Partner] Setting up delivery button event listeners');
    
    // Event delegation for validate delivery buttons
    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('validate-delivery-btn')) {
            e.preventDefault();
            console.log('[Partner] Validate button clicked');
            
            const deliveryId = e.target.getAttribute('data-delivery-id');
            const accountId = e.target.getAttribute('data-account-id');
            
            if (!deliveryId) {
                console.error('[Partner] No delivery ID found on validate button');
                showNotification('Erreur: ID de livraison manquant', 'error');
                return;
            }
            
            console.log(`[Partner] Attempting to validate delivery ${deliveryId}`);
            handleDeliveryValidation(deliveryId, accountId);
        }
    });
    
    // Event delegation for reject delivery buttons
    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('reject-delivery-btn')) {
            e.preventDefault();
            console.log('[Partner] Reject button clicked');
            
            const deliveryId = e.target.getAttribute('data-delivery-id');
            const accountId = e.target.getAttribute('data-account-id');
            
            if (!deliveryId) {
                console.error('[Partner] No delivery ID found on reject button');
                showNotification('Erreur: ID de livraison manquant', 'error');
                return;
            }
            
            console.log(`[Partner] Attempting to reject delivery ${deliveryId}`);
            rejectDelivery(deliveryId);
        }
    });
});

// Handle delivery validation logic (first or final validation)
async function handleDeliveryValidation(deliveryId, accountId) {
    try {
        console.log(`[Partner] Determining validation type for delivery ${deliveryId}`);
        
        // Get delivery details to determine if this is first or final validation
        const response = await fetch(`/api/partner/deliveries/${deliveryId}`);
        if (!response.ok) {
            throw new Error('Impossible de récupérer les détails de la livraison');
        }
        
        const delivery = await response.json();
        console.log(`[Partner] Delivery status: ${delivery.validation_status}`);
        
        if (delivery.validation_status === 'pending') {
            console.log('[Partner] Performing first validation');
            await firstValidateDelivery(deliveryId);
        } else if (delivery.validation_status === 'first_validated') {
            console.log('[Partner] Performing final validation');
            await finalValidateDelivery(deliveryId);
        } else {
            console.warn(`[Partner] Unexpected validation status: ${delivery.validation_status}`);
            showNotification('Cette livraison ne peut pas être validée dans son état actuel', 'error');
        }
        
    } catch (error) {
        console.error('[Partner] Error in validation handling:', error);
        showNotification(`Erreur: ${error.message}`, 'error');
    }
}

// ===== AUTO-CALCULATION FOR DELIVERY AMOUNT =====
// Add auto-calculation functionality for delivery form
document.addEventListener('DOMContentLoaded', function() {
    console.log('[Delivery] Setting up auto-calculation for delivery amount');
    
    const articleCountInput = document.getElementById('delivery-article-count');
    const unitPriceInput = document.getElementById('delivery-unit-price');
    const amountInput = document.getElementById('delivery-amount');
    
    // Flag to track if amount was manually edited after auto-calculation
    let isAmountManuallyEdited = false;
    
    // Function to calculate and update the total amount
    function calculateTotalAmount() {
        const articleCount = parseFloat(articleCountInput.value) || 0;
        const unitPrice = parseFloat(unitPriceInput.value) || 0;
        
        // Only auto-calculate if amount hasn't been manually edited
        if (!isAmountManuallyEdited && articleCount > 0 && unitPrice > 0) {
            const totalAmount = articleCount * unitPrice;
            amountInput.value = totalAmount;
            console.log(`[Delivery] Auto-calculated amount: ${articleCount} × ${unitPrice} = ${totalAmount} FCFA`);
        }
    }
    
    // Event listeners for auto-calculation
    if (articleCountInput && unitPriceInput && amountInput) {
        // Auto-calculate when article count changes
        articleCountInput.addEventListener('input', function() {
            console.log('[Delivery] Article count changed:', this.value);
            isAmountManuallyEdited = false; // Reset manual edit flag
            calculateTotalAmount();
        });
        
        // Auto-calculate when unit price changes
        unitPriceInput.addEventListener('input', function() {
            console.log('[Delivery] Unit price changed:', this.value);
            isAmountManuallyEdited = false; // Reset manual edit flag
            calculateTotalAmount();
        });
        
        // Track manual edits to amount field
        amountInput.addEventListener('input', function() {
            console.log('[Delivery] Amount manually edited:', this.value);
            isAmountManuallyEdited = true;
        });
        
        // Reset manual edit flag when form is reset
        const deliveryForm = document.getElementById('addDeliveryForm');
        if (deliveryForm) {
            deliveryForm.addEventListener('reset', function() {
                console.log('[Delivery] Form reset - clearing manual edit flag');
                isAmountManuallyEdited = false;
            });
        }
        
        console.log('[Delivery] ✅ Auto-calculation setup complete');
    } else {
        console.warn('[Delivery] ⚠️ Could not find delivery form fields for auto-calculation');
    }
});

// ===== MODULE AUDIT FLUX =====

// Variables globales pour l'audit
let currentAuditData = null;
let currentSqlQuery = '';

// Initialiser le module Audit Flux
async function initAuditFluxModule() {
    console.log('🔍 AUDIT: Initialisation du module Audit Flux');
    
    const auditMenu = document.getElementById('audit-flux-menu');
    if (!auditMenu) return;
    
    // Vérifier les permissions
    if (currentUser && ['directeur_general', 'pca', 'admin', 'directeur'].includes(currentUser.role)) {
        auditMenu.style.display = '';
        console.log('✅ AUDIT: Menu Audit Flux affiché pour:', currentUser.role);
        
        // Configurer les event listeners
        setupAuditFluxEventListeners();
        
        // Charger la liste des comptes
        await loadAuditAccountsList();
    } else {
        auditMenu.style.display = 'none';
        console.log('❌ AUDIT: Menu Audit Flux masqué - permissions insuffisantes');
    }
}

// Configurer les event listeners pour l'audit flux
function setupAuditFluxEventListeners() {
    console.log('🔍 AUDIT: Configuration des event listeners');
    
    // Sélection d'un compte
    const accountSelect = document.getElementById('audit-account-select');
    if (accountSelect) {
        accountSelect.addEventListener('change', onAuditAccountChange);
    }
    
    // Bouton d'audit
    const auditBtn = document.getElementById('audit-execute-btn');
    if (auditBtn) {
        auditBtn.addEventListener('click', executeAccountAudit);
    }
    
    // Filtres de date
    const filterBtn = document.getElementById('audit-filter-btn');
    if (filterBtn) {
        filterBtn.addEventListener('click', applyAuditDateFilter);
    }
    
    // Export CSV
    const exportCsvBtn = document.getElementById('audit-export-csv');
    if (exportCsvBtn) {
        exportCsvBtn.addEventListener('click', exportAuditToCSV);
    }
    
    // Affichage SQL
    const showSqlBtn = document.getElementById('audit-export-sql');
    if (showSqlBtn) {
        showSqlBtn.addEventListener('click', showAuditSqlQuery);
    }
    
    // Copier SQL
    const copySqlBtn = document.getElementById('copy-sql-btn');
    if (copySqlBtn) {
        copySqlBtn.addEventListener('click', copyAuditSqlQuery);
    }
    
    // Boutons d'audit de cohérence (pour ADMIN uniquement)
    if (currentUser.role === 'admin') {
        const detectBtn = document.getElementById('audit-detect-inconsistencies-btn');
        const fixBtn = document.getElementById('audit-fix-inconsistencies-btn');
        const fixAllBtn = document.getElementById('consistency-fix-all-btn');
        const exportCsvBtn = document.getElementById('consistency-export-csv');
        
        if (detectBtn) {
            detectBtn.addEventListener('click', detectAccountInconsistencies);
        }
        if (fixBtn) {
            fixBtn.addEventListener('click', fixAllAccountInconsistencies);
        }
        if (fixAllBtn) {
            fixAllBtn.addEventListener('click', fixAllAccountInconsistencies);
        }
        if (exportCsvBtn) {
            exportCsvBtn.addEventListener('click', exportConsistencyToCSV);
        }
        
        // Afficher les contrôles de cohérence
        const consistencyControls = document.getElementById('audit-consistency-controls');
        if (consistencyControls) {
            consistencyControls.style.display = 'block';
        }
    }
    
    // Boutons de synchronisation sélective (pour ADMIN uniquement)
    if (currentUser.role === 'admin') {
        const syncAllBtn = document.getElementById('audit-sync-all-btn');
        const syncSelectedBtn = document.getElementById('audit-sync-selected-btn');
        const syncAccountSelect = document.getElementById('audit-sync-account-select');
        
        if (syncAllBtn) {
            syncAllBtn.addEventListener('click', syncAllAccounts);
        }
        if (syncSelectedBtn) {
            syncSelectedBtn.addEventListener('click', syncSelectedAccount);
        }
        if (syncAccountSelect) {
            syncAccountSelect.addEventListener('change', updateSyncButton);
            // Charger la liste des comptes pour la synchronisation
            loadSyncAccountsList();
        }
        
        // Afficher les contrôles de synchronisation
        const syncControls = document.getElementById('audit-sync-controls');
        if (syncControls) {
            syncControls.style.display = 'block';
        }
    }
    
    console.log('✅ AUDIT: Event listeners configurés');
}

// Charger la liste des comptes pour l'audit
async function loadAuditAccountsList() {
    try {
        console.log('🔍 AUDIT: Chargement de la liste des comptes');
        
        const response = await fetch('/api/accounts');
        if (!response.ok) {
            throw new Error('Erreur lors du chargement des comptes');
        }
        
        const accounts = await response.json();
        const accountSelect = document.getElementById('audit-account-select');
        
        if (!accountSelect) return;
        
        accountSelect.innerHTML = '<option value="">Choisir un compte...</option>';
        
        accounts.forEach(account => {
            const option = document.createElement('option');
            option.value = account.id;
            
            const typeBadge = account.account_type ? 
                             account.account_type.charAt(0).toUpperCase() + account.account_type.slice(1) : 
                             'Classique';
            const balance = parseInt(account.current_balance || 0).toLocaleString('fr-FR');
            
            option.textContent = `${account.account_name} [${typeBadge}] (${balance} FCFA)`;
            option.dataset.accountType = account.account_type || 'classique';
            option.dataset.accountName = account.account_name;
            
            accountSelect.appendChild(option);
        });
        
        console.log(`✅ AUDIT: ${accounts.length} comptes chargés pour l'audit`);
        
    } catch (error) {
        console.error('❌ AUDIT: Erreur chargement comptes:', error);
        showNotification('Erreur lors du chargement des comptes', 'error');
    }
}

// Gestionnaire de changement de compte sélectionné
async function onAuditAccountChange() {
    const accountSelect = document.getElementById('audit-account-select');
    const auditBtn = document.getElementById('audit-execute-btn');
    const accountInfo = document.getElementById('audit-account-info');
    const auditResults = document.getElementById('audit-results');
    
    if (accountSelect.value) {
        auditBtn.disabled = false;
        const accountName = accountSelect.options[accountSelect.selectedIndex].text;
        console.log(`🔍 AUDIT: Compte sélectionné: ${accountName}`);
        
        // Synchroniser automatiquement le compte sélectionné
        await syncSelectedAccount(accountSelect.value, accountName);
    } else {
        auditBtn.disabled = true;
        accountInfo.style.display = 'none';
        auditResults.style.display = 'none';
        console.log('🔍 AUDIT: Aucun compte sélectionné');
    }
}

// Synchroniser le compte sélectionné
async function syncSelectedAccount(accountId, accountName) {
    try {
        console.log(`🔄 SYNC: Synchronisation automatique du compte "${accountName}" (ID: ${accountId})`);
        
        // Afficher un indicateur visuel discret
        const accountSelect = document.getElementById('audit-account-select');
        const originalText = accountSelect.options[accountSelect.selectedIndex].text;
        accountSelect.options[accountSelect.selectedIndex].text = `🔄 ${originalText}`;
        accountSelect.disabled = true;
        
        const response = await fetch(`/api/admin/force-sync-account/${accountId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`Erreur HTTP: ${response.status}`);
        }
        
        const result = await response.json();
        
        // Restaurer l'affichage
        accountSelect.options[accountSelect.selectedIndex].text = originalText;
        accountSelect.disabled = false;
        
        if (result.status === 'success') {
            console.log(`✅ SYNC: Compte "${accountName}" synchronisé avec succès`);
            showNotification(`✅ Compte "${accountName}" synchronisé`, 'success', 2000);
        } else {
            console.log(`⚠️ SYNC: Synchronisation du compte "${accountName}" terminée avec avertissements`);
            showNotification(`⚠️ Compte "${accountName}" synchronisé avec avertissements`, 'warning', 3000);
        }
        
    } catch (error) {
        console.error(`❌ SYNC: Erreur lors de la synchronisation du compte "${accountName}":`, error);
        
        // Restaurer l'affichage en cas d'erreur
        const accountSelect = document.getElementById('audit-account-select');
        const originalText = accountSelect.options[accountSelect.selectedIndex].text.replace('🔄 ', '');
        accountSelect.options[accountSelect.selectedIndex].text = originalText;
        accountSelect.disabled = false;
        
        showNotification(`❌ Erreur synchronisation: ${error.message}`, 'error', 5000);
    }
}

// Appliquer le filtre de dates
function applyAuditDateFilter() {
    const startDate = document.getElementById('audit-start-date').value;
    const endDate = document.getElementById('audit-end-date').value;
    
    if (!startDate || !endDate) {
        showNotification('Veuillez sélectionner les dates de début et fin', 'warning');
        return;
    }
    
    if (new Date(startDate) > new Date(endDate)) {
        showNotification('La date de début doit être antérieure à la date de fin', 'error');
        return;
    }
    
    console.log(`🗓️ AUDIT: Filtre appliqué - Du ${startDate} au ${endDate}`);
    showNotification(`Filtre appliqué: du ${startDate} au ${endDate}`, 'success');
}

// Variables globales pour l'audit de cohérence
let currentConsistencyData = null;

// Exécuter l'audit du compte sélectionné
async function executeAccountAudit() {
    try {
        const accountSelect = document.getElementById('audit-account-select');
        const accountId = accountSelect.value;
        
        if (!accountId) {
            showNotification('Veuillez sélectionner un compte', 'warning');
            return;
        }
        
        const startDate = document.getElementById('audit-start-date').value;
        const endDate = document.getElementById('audit-end-date').value;
        
        console.log(`🔍 AUDIT: Exécution audit pour compte ID ${accountId}`);
        
        // Afficher un indicateur de chargement
        const auditBtn = document.getElementById('audit-execute-btn');
        const originalText = auditBtn.innerHTML;
        auditBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Audit en cours...';
        auditBtn.disabled = true;
        
        // Construire l'URL avec les paramètres de date
        let url = `/api/audit/account-flux/${accountId}`;
        const params = new URLSearchParams();
        
        if (startDate && endDate) {
            params.append('start_date', startDate);
            params.append('end_date', endDate);
        }
        
        if (params.toString()) {
            url += '?' + params.toString();
        }
        
        const response = await fetch(url);
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Erreur lors de l\'audit');
        }
        
        const auditData = await response.json();
        currentAuditData = auditData;
        currentSqlQuery = auditData.sql_query;
        
        console.log(`✅ AUDIT: Audit terminé - ${auditData.movements.length} mouvements trouvés`);
        
        // Afficher les résultats
        displayAuditAccountInfo(auditData.account);
        displayAuditResults(auditData);
        
        showNotification(`Audit terminé: ${auditData.movements.length} mouvements trouvés`, 'success');
        
    } catch (error) {
        console.error('❌ AUDIT: Erreur lors de l\'audit:', error);
        showNotification(`Erreur: ${error.message}`, 'error');
    } finally {
        // Restaurer le bouton
        const auditBtn = document.getElementById('audit-execute-btn');
        auditBtn.innerHTML = '<i class="fas fa-search"></i> Auditer le Compte';
        auditBtn.disabled = false;
    }
}

// Détecter les incohérences dans tous les comptes
async function detectAccountInconsistencies() {
    try {
        console.log('🔍 CONSISTENCY: Détection des incohérences...');
        
        // Afficher un indicateur de chargement
        const detectBtn = document.getElementById('audit-detect-inconsistencies-btn');
        const originalText = detectBtn.innerHTML;
        detectBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Détection en cours...';
        detectBtn.disabled = true;
        
        const response = await fetch('/api/audit/consistency/detect');
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Erreur lors de la détection');
        }
        
        const data = await response.json();
        currentConsistencyData = data;
        
        console.log(`✅ CONSISTENCY: ${data.total_issues} incohérences détectées`);
        
        // Afficher les résultats
        displayConsistencyResults(data);
        
        showNotification(`${data.total_issues} incohérences détectées`, 'info');
        
    } catch (error) {
        console.error('❌ CONSISTENCY: Erreur lors de la détection:', error);
        showNotification('Erreur lors de la détection des incohérences', 'error');
    } finally {
        // Restaurer le bouton
        const detectBtn = document.getElementById('audit-detect-inconsistencies-btn');
        detectBtn.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Détecter les Incohérences';
        detectBtn.disabled = false;
    }
}

// Corriger toutes les incohérences
async function fixAllAccountInconsistencies() {
    try {
        console.log('🔧 CONSISTENCY: Correction de toutes les incohérences...');
        
        // Demander confirmation
        if (!confirm('Êtes-vous sûr de vouloir corriger toutes les incohérences détectées ? Cette action est irréversible.')) {
            return;
        }
        
        // Afficher un indicateur de chargement
        const fixBtn = document.getElementById('audit-fix-inconsistencies-btn');
        const originalText = fixBtn.innerHTML;
        fixBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Correction en cours...';
        fixBtn.disabled = true;
        
        const response = await fetch('/api/audit/consistency/fix-all', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Erreur lors de la correction');
        }
        
        const data = await response.json();
        
        console.log(`✅ CONSISTENCY: Correction terminée, ${data.remaining_issues} incohérences restantes`);
        
        showNotification(`Correction terminée. ${data.remaining_issues} incohérences restantes.`, 'success');
        
        // Recharger les données si des incohérences ont été corrigées
        if (data.remaining_issues < (currentConsistencyData?.total_issues || 0)) {
            await detectAccountInconsistencies();
        }
        
    } catch (error) {
        console.error('❌ CONSISTENCY: Erreur lors de la correction:', error);
        showNotification('Erreur lors de la correction des incohérences', 'error');
    } finally {
        // Restaurer le bouton
        const fixBtn = document.getElementById('audit-fix-inconsistencies-btn');
        fixBtn.innerHTML = '<i class="fas fa-wrench"></i> Corriger les Incohérences';
        fixBtn.disabled = false;
    }
}

// Afficher les résultats de cohérence
function displayConsistencyResults(data) {
    const resultsContainer = document.getElementById('audit-consistency-results');
    const tbody = document.getElementById('consistency-issues-tbody');
    const totalIssues = document.getElementById('consistency-total-issues');
    
    if (!resultsContainer || !tbody || !totalIssues) return;
    
    // Mettre à jour le compteur
    totalIssues.textContent = data.total_issues;
    
    // Vider le tableau
    tbody.innerHTML = '';
    
    if (data.inconsistencies.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="10" class="text-center text-success">
                    <i class="fas fa-check-circle"></i> Aucune incohérence détectée
                </td>
            </tr>
        `;
    } else {
        // Ajouter chaque incohérence
        data.inconsistencies.forEach(issue => {
            const row = document.createElement('tr');
            
            // Fonction pour formater les différences
            const formatDifference = (diff) => {
                if (diff === undefined || diff === null || isNaN(diff)) return '<span class="difference-error">--</span>';
                if (diff === 0) return '<span class="difference-zero">0</span>';
                if (diff > 0) return `<span class="difference-positive">+${diff.toLocaleString()}</span>`;
                return `<span class="difference-negative">${diff.toLocaleString()}</span>`;
            };
            
            // Fonction pour formater les nombres avec protection
            const formatNumber = (num) => {
                return (num !== undefined && num !== null && !isNaN(num)) ? parseFloat(num).toLocaleString() : '--';
            };
            
            row.innerHTML = `
                <td><strong>${issue.account_name || 'Compte inconnu'}</strong></td>
                <td>${formatNumber(issue.stored_total_credited)}</td>
                <td>${formatNumber(issue.calculated_total_credited)}</td>
                <td>${formatDifference(issue.credited_difference)}</td>
                <td>${formatNumber(issue.stored_total_spent)}</td>
                <td>${formatNumber(issue.calculated_total_spent)}</td>
                <td>${formatDifference(issue.spent_difference)}</td>
                <td>${formatNumber(issue.stored_balance)}</td>
                <td>${formatNumber(issue.calculated_balance)}</td>
                <td>${formatDifference(issue.balance_difference)}</td>
            `;
            
            tbody.appendChild(row);
        });
    }
    
    // Afficher la section
    resultsContainer.style.display = 'block';
}

// Exporter les résultats de cohérence en CSV
function exportConsistencyToCSV() {
    if (!currentConsistencyData || !currentConsistencyData.inconsistencies.length) {
        showNotification('Aucune donnée à exporter', 'warning');
        return;
    }
    
    try {
        const headers = [
            'Compte',
            'Total Crédité (Stocké)',
            'Total Crédité (Calculé)',
            'Différence Crédits',
            'Total Dépensé (Stocké)',
            'Total Dépensé (Calculé)',
            'Différence Dépenses',
            'Solde (Stocké)',
            'Solde (Calculé)',
            'Différence Solde'
        ];
        
        const csvContent = [
            headers.join(','),
            ...currentConsistencyData.inconsistencies.map(issue => [
                `"${issue.account_name}"`,
                issue.stored_total_credited,
                issue.calculated_total_credited,
                issue.total_credited_diff,
                issue.stored_total_spent,
                issue.calculated_total_spent,
                issue.total_spent_diff,
                issue.stored_balance,
                issue.calculated_balance,
                issue.balance_diff
            ].join(','))
        ].join('\n');
        
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `incoherences_comptes_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        showNotification('Export CSV réussi', 'success');
        
    } catch (error) {
        console.error('❌ CONSISTENCY: Erreur lors de l\'export CSV:', error);
        showNotification('Erreur lors de l\'export CSV', 'error');
    }
}

// Afficher les informations du compte audité
function displayAuditAccountInfo(account) {
    const accountInfo = document.getElementById('audit-account-info');
    
    document.getElementById('audit-account-name').textContent = account.name;
    document.getElementById('audit-account-type').textContent = account.type.charAt(0).toUpperCase() + account.type.slice(1);
    document.getElementById('audit-account-balance').textContent = `${account.current_balance.toLocaleString('fr-FR')} FCFA`;
    document.getElementById('audit-account-credited').textContent = `${account.total_credited.toLocaleString('fr-FR')} FCFA`;
    document.getElementById('audit-account-spent').textContent = `${account.total_spent.toLocaleString('fr-FR')} FCFA`;
    
    // Afficher les transferts
    const transfertEntrants = account.transfert_entrants || 0;
    const transfertSortants = account.transfert_sortants || 0;
    document.getElementById('audit-account-transfert-entrants').textContent = `${transfertEntrants.toLocaleString('fr-FR')} FCFA`;
    document.getElementById('audit-account-transfert-sortants').textContent = `${transfertSortants.toLocaleString('fr-FR')} FCFA`;
    
    // Afficher les ajustements du mois courant seulement si différent de zéro
    const adjustmentItem = document.getElementById('audit-adjustment-item');
    const adjustmentValue = document.getElementById('audit-account-adjustment');
    
    if (account.current_month_adjustment && account.current_month_adjustment !== 0) {
        const adjustment = parseFloat(account.current_month_adjustment);
        adjustmentValue.textContent = `${adjustment.toLocaleString('fr-FR')} FCFA`;
        adjustmentItem.style.display = 'block';
        console.log(`💰 AUDIT: Ajustement mois courant affiché: ${adjustment} FCFA`);
    } else {
        adjustmentItem.style.display = 'none';
        console.log(`💰 AUDIT: Aucun ajustement mois courant (${account.current_month_adjustment || 0})`);
    }
    
    accountInfo.style.display = 'block';
    
    console.log(`✅ AUDIT: Informations du compte "${account.name}" affichées`);
}

// Afficher les résultats de l'audit
function displayAuditResults(auditData) {
    const auditResults = document.getElementById('audit-results');
    const { account, audit_period, statistics, movements } = auditData;
    
    // Statistiques globales
    document.getElementById('audit-total-operations').textContent = statistics.total_operations;
    document.getElementById('audit-period').textContent = 
        audit_period.filtered ? 
        `${audit_period.start_date} au ${audit_period.end_date}` :
        'Toutes les opérations';
    
    // Cartes de résumé
    document.getElementById('audit-total-credits').textContent = `${statistics.total_credits.toLocaleString('fr-FR')} FCFA`;
    document.getElementById('audit-total-debits').textContent = `${statistics.total_debits.toLocaleString('fr-FR')} FCFA`;
    document.getElementById('audit-net-balance').textContent = `${statistics.net_balance.toLocaleString('fr-FR')} FCFA`;
    
    // Couleur du solde net
    const netBalanceElement = document.getElementById('audit-net-balance');
    if (statistics.net_balance > 0) {
        netBalanceElement.style.color = '#4CAF50'; // Vert
    } else if (statistics.net_balance < 0) {
        netBalanceElement.style.color = '#f44336'; // Rouge
    } else {
        netBalanceElement.style.color = '#666'; // Gris
    }
    
    // Tableau des mouvements
    displayAuditMovementsTable(movements);
    
    auditResults.style.display = 'block';
    
    console.log(`✅ AUDIT: Résultats d'audit affichés pour "${account.name}"`);
}
// Variable globale pour stocker tous les mouvements
let allAuditMovements = [];

// Afficher le tableau des mouvements avec filtrage
function displayAuditMovementsTable(movements) {
    // Stocker tous les mouvements pour le filtrage
    allAuditMovements = movements || [];
    
    // Mettre à jour les compteurs
    updateOperationCounts();
    
    // Afficher tous les mouvements initialement
    renderMovementsTable(allAuditMovements);
    
    // Configurer les événements de filtrage
    setupMovementFilters();
}

// Rendu du tableau de mouvements
function renderMovementsTable(movements) {
    const tbody = document.getElementById('audit-movements-tbody');
    tbody.innerHTML = '';
    
    movements.forEach(movement => {
        const row = document.createElement('tr');
        row.setAttribute('data-operation-type', movement.type_operation || movement.operation_type);
        
        // Date
        const dateCell = document.createElement('td');
        const date = new Date(movement.date_operation || movement.date);
        dateCell.textContent = date.toLocaleDateString('fr-FR');
        row.appendChild(dateCell);
        
        // Heure
        const timeCell = document.createElement('td');
        timeCell.textContent = movement.heure_operation || movement.time || '-';
        row.appendChild(timeCell);
        
        // Type d'opération
        const typeCell = document.createElement('td');
        const span = document.createElement('span');
        const operationType = movement.type_operation || movement.operation_type || movement.type;
        span.textContent = operationType;
        span.className = 'operation-type';
        
        // Couleur et icône selon le type
        if (operationType.includes('CRÉDIT')) {
            span.classList.add('credit');
            span.innerHTML = `<i class="fas fa-plus-circle"></i> ${operationType}`;
        } else if (operationType.includes('DÉPENSE')) {
            span.classList.add('expense');
            span.innerHTML = `<i class="fas fa-minus-circle"></i> ${operationType}`;
        } else if (operationType.includes('TRANSFERT ENTRANT')) {
            span.classList.add('transfer-in');
            span.innerHTML = `<i class="fas fa-arrow-right"></i> ${operationType}`;
        } else if (operationType.includes('TRANSFERT SORTANT')) {
            span.classList.add('transfer-out');
            span.innerHTML = `<i class="fas fa-arrow-left"></i> ${operationType}`;
        } else if (operationType.includes('TRANSFERT')) {
            span.classList.add('transfer');
            span.innerHTML = `<i class="fas fa-exchange-alt"></i> ${operationType}`;
        }
        
        typeCell.appendChild(span);
        row.appendChild(typeCell);
        
        // Montant
        const amountCell = document.createElement('td');
        const amount = parseFloat(movement.montant || movement.amount) || 0;
        amountCell.textContent = `${amount.toLocaleString('fr-FR')} FCFA`;
        amountCell.className = amount >= 0 ? 'amount-positive' : 'amount-negative';
        row.appendChild(amountCell);
        
        // Description
        const descCell = document.createElement('td');
        descCell.textContent = movement.description || '-';
        descCell.className = 'description-cell';
        row.appendChild(descCell);
        
        // Effectué par
        const userCell = document.createElement('td');
        userCell.textContent = movement.effectue_par || movement.created_by || 'Système';
        row.appendChild(userCell);
        
        // Date de création
        const creationDateCell = document.createElement('td');
        const creationDate = movement.date_creation || movement.date_creation;
        if (creationDate) {
            const dateCreation = new Date(creationDate);
            creationDateCell.textContent = dateCreation.toLocaleDateString('fr-FR');
        } else {
            creationDateCell.textContent = '-';
        }
        row.appendChild(creationDateCell);
        
        tbody.appendChild(row);
    });
    
    console.log(`✅ AUDIT: Tableau de ${movements.length} mouvements affiché`);
}

// Configurer les événements de filtrage
function setupMovementFilters() {
    const operationTypeFilter = document.getElementById('operation-type-filter');
    const resetFiltersBtn = document.getElementById('reset-filters-btn');
    
    // Filtre par type d'opération
    if (operationTypeFilter) {
        operationTypeFilter.addEventListener('change', function() {
            applyMovementFilters();
        });
    }
    
    // Reset des filtres
    if (resetFiltersBtn) {
        resetFiltersBtn.addEventListener('click', function() {
            resetMovementFilters();
        });
    }
}

// Appliquer les filtres aux mouvements
function applyMovementFilters() {
    const operationTypeFilter = document.getElementById('operation-type-filter');
    const selectedType = operationTypeFilter ? operationTypeFilter.value : 'all';
    
    let filteredMovements = [...allAuditMovements];
    
    // Filtrer par type d'opération
    if (selectedType !== 'all') {
        filteredMovements = filteredMovements.filter(movement => {
            const operationType = movement.type_operation || movement.operation_type || movement.type;
            return operationType === selectedType;
        });
    }
    
    // Afficher les mouvements filtrés
    renderMovementsTable(filteredMovements);
    
    // Mettre à jour les compteurs
    updateFilteredCounts(filteredMovements.length);
    
    console.log(`🔍 FILTER: ${filteredMovements.length} mouvements affichés après filtrage`);
}

// Reset des filtres
function resetMovementFilters() {
    const operationTypeFilter = document.getElementById('operation-type-filter');
    
    if (operationTypeFilter) {
        operationTypeFilter.value = 'all';
    }
    
    // Réafficher tous les mouvements
    renderMovementsTable(allAuditMovements);
    updateFilteredCounts(allAuditMovements.length);
    
    console.log(`🔄 FILTER: Filtres réinitialisés - ${allAuditMovements.length} mouvements affichés`);
}

// Mettre à jour les compteurs d'opérations
function updateOperationCounts() {
    const totalOperationsFilter = document.getElementById('total-operations-filter');
    const visibleOperations = document.getElementById('visible-operations');
    
    if (totalOperationsFilter) {
        totalOperationsFilter.textContent = allAuditMovements.length;
    }
    if (visibleOperations) {
        visibleOperations.textContent = allAuditMovements.length;
    }
}

// Mettre à jour le compteur des opérations filtrées
function updateFilteredCounts(visibleCount) {
    const visibleOperations = document.getElementById('visible-operations');
    
    if (visibleOperations) {
        visibleOperations.textContent = visibleCount;
    }
}

// Exporter l'audit en CSV
function exportAuditToCSV() {
    if (!currentAuditData) {
        showNotification('Aucune donnée d\'audit à exporter', 'warning');
        return;
    }
    
    try {
        const { account, movements } = currentAuditData;
        
        // En-têtes CSV
        const headers = ['Date', 'Heure', 'Type d\'Opération', 'Montant (FCFA)', 'Description', 'Effectué par', 'Date de création'];
        
        // Données CSV
        const csvRows = [headers.join(',')];
        
        movements.forEach(movement => {
            const row = [
                movement.date,
                movement.time || '',
                `"${movement.type}"`,
                movement.amount,
                `"${movement.description || ''}"`,
                `"${movement.created_by || 'Système'}"`,
                movement.date_creation || ''
            ];
            csvRows.push(row.join(','));
        });
        
        // Créer et télécharger le fichier
        const csvContent = csvRows.join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        
        if (link.download !== undefined) {
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', `audit_flux_${account.name}_${new Date().toISOString().split('T')[0]}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
        
        console.log(`✅ AUDIT: Export CSV généré pour "${account.name}"`);
        showNotification('Export CSV téléchargé avec succès', 'success');
        
    } catch (error) {
        console.error('❌ AUDIT: Erreur lors de l\'export CSV:', error);
        showNotification('Erreur lors de l\'export CSV', 'error');
    }
}

// Afficher la requête SQL dans une modal
function showAuditSqlQuery() {
    if (!currentSqlQuery) {
        showNotification('Aucune requête SQL disponible', 'warning');
        return;
    }
    
    const sqlDisplay = document.getElementById('sql-query-display');
    const sqlModal = document.getElementById('sql-modal');
    
    // Formater la requête SQL
    const formattedSql = currentSqlQuery
        .replace(/SELECT/g, '\nSELECT')
        .replace(/FROM/g, '\nFROM')
        .replace(/WHERE/g, '\nWHERE')
        .replace(/UNION ALL/g, '\n\nUNION ALL')
        .replace(/ORDER BY/g, '\nORDER BY');
    
    sqlDisplay.textContent = formattedSql;
    sqlModal.style.display = 'block';
    
    console.log('✅ AUDIT: Requête SQL affichée');
}

// Copier la requête SQL
function copyAuditSqlQuery() {
    if (!currentSqlQuery) {
        showNotification('Aucune requête SQL à copier', 'warning');
        return;
    }
    
    navigator.clipboard.writeText(currentSqlQuery).then(() => {
        showNotification('Requête SQL copiée dans le presse-papiers', 'success');
        console.log('✅ AUDIT: Requête SQL copiée');
    }).catch(err => {
        console.error('❌ AUDIT: Erreur lors de la copie:', err);
        showNotification('Erreur lors de la copie', 'error');
    });
}

// Fermer la modal SQL
function closeSqlModal() {
    const sqlModal = document.getElementById('sql-modal');
    sqlModal.style.display = 'none';
}

// ===== MODULE MONTANT DÉBUT DE MOIS =====

// Variables globales pour le module
let montantDebutMoisData = [];
let currentMontantDebutPeriod = null;
let hasUnsavedMontantChanges = false;

// Initialiser le module Montant Début de Mois
function initMontantDebutMoisModule() {
    console.log('🗓️ CLIENT: Initialisation du module Montant Début de Mois');
    
    // Réinitialiser l'état
    montantDebutMoisData = [];
    currentMontantDebutPeriod = null;
    hasUnsavedMontantChanges = false;
    
    // Masquer le contenu principal au départ
    const mainContent = document.getElementById('montant-debut-main-content');
    if (mainContent) {
        mainContent.style.display = 'none';
    }
    
    // Définir le mois actuel par défaut
    const monthInput = document.getElementById('montant-debut-month');
    if (monthInput) {
        const now = new Date();
        const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        monthInput.value = currentMonth;
    }
    
    // Configurer les gestionnaires d'événements
    setupMontantDebutMoisEvents();
    
    console.log('✅ CLIENT: Module Montant Début de Mois initialisé');
}

// Configurer les événements pour le module
function setupMontantDebutMoisEvents() {
    // Bouton Charger les données
    const loadBtn = document.getElementById('load-montant-debut-btn');
    if (loadBtn) {
        loadBtn.removeEventListener('click', loadMontantDebutMoisData);
        loadBtn.addEventListener('click', loadMontantDebutMoisData);
    }
    
    // Bouton Sauvegarder
    const saveBtn = document.getElementById('save-montant-debut-btn');
    if (saveBtn) {
        saveBtn.removeEventListener('click', saveMontantDebutMoisData);
        saveBtn.addEventListener('click', saveMontantDebutMoisData);
    }
    
    console.log('✅ CLIENT: Événements Montant Début de Mois configurés');
}

// Charger les données pour le mois sélectionné
async function loadMontantDebutMoisData() {
    const monthInput = document.getElementById('montant-debut-month');
    const loadBtn = document.getElementById('load-montant-debut-btn');
    const mainContent = document.getElementById('montant-debut-main-content');
    
    if (!monthInput.value) {
        showNotification('Veuillez sélectionner un mois', 'error');
        return;
    }
    
    // Vérifier s'il y a des changements non sauvegardés
    if (hasUnsavedMontantChanges) {
        if (!confirm('Vous avez des modifications non sauvegardées. Êtes-vous sûr de vouloir charger un autre mois ?')) {
            return;
        }
    }
    
    const [year, month] = monthInput.value.split('-');
    
    loadBtn.disabled = true;
    loadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Chargement...';
    
    try {
        console.log(`🗓️ CLIENT: Chargement des données pour ${year}-${month}`);
        
        const response = await fetch(apiUrl(`/api/montant-debut-mois/${year}/${month}`));
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Erreur lors du chargement');
        }
        
        montantDebutMoisData = data.data;
        currentMontantDebutPeriod = data.period;
        hasUnsavedMontantChanges = false;
        
        // Mettre à jour l'interface
        updateMontantDebutMoisHeader();
        displayMontantDebutMoisTable();
        await updateMontantDebutMoisStats();
        
        // Afficher le contenu principal
        mainContent.style.display = 'block';
        
        console.log(`✅ CLIENT: ${montantDebutMoisData.length} portefeuilles chargés`);
        showNotification(`Données chargées pour ${getMonthName(parseInt(month))} ${year}`, 'success');
        
    } catch (error) {
        console.error('❌ CLIENT: Erreur chargement montant début mois:', error);
        showNotification(`Erreur: ${error.message}`, 'error');
    } finally {
        loadBtn.disabled = false;
        loadBtn.innerHTML = '<i class="fas fa-search"></i> Charger les données';
    }
}

// Mettre à jour l'en-tête du mois
function updateMontantDebutMoisHeader() {
    const monthTitle = document.getElementById('montant-debut-month-title');
    if (monthTitle && currentMontantDebutPeriod) {
        const monthName = getMonthName(currentMontantDebutPeriod.month);
        monthTitle.textContent = `Mois : ${monthName} ${currentMontantDebutPeriod.year}`;
    }
}

// Afficher le tableau des portefeuilles
function displayMontantDebutMoisTable() {
    const tbody = document.getElementById('montant-debut-tbody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    if (montantDebutMoisData.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = '<td colspan="4" style="text-align: center;">Aucun portefeuille classique trouvé</td>';
        tbody.appendChild(row);
        return;
    }
    
    montantDebutMoisData.forEach((wallet, index) => {
        const row = document.createElement('tr');
        
        // Nom du portefeuille
        const nameCell = document.createElement('td');
        nameCell.innerHTML = `<span class="wallet-name">${wallet.account_name}</span>`;
        row.appendChild(nameCell);
        
        // Propriétaire
        const ownerCell = document.createElement('td');
        const ownerName = wallet.owner_name || wallet.owner_username || 'Non assigné';
        ownerCell.innerHTML = `<span class="owner-name">${ownerName}</span>`;
        row.appendChild(ownerCell);
        
        // Champ de saisie du montant
        const amountCell = document.createElement('td');
        const input = document.createElement('input');
        input.type = 'number';
        input.className = 'montant-debut-input';
        input.value = wallet.montant_debut_mois || 0;
        input.placeholder = '0';
        input.setAttribute('data-account-id', wallet.account_id);
        input.setAttribute('data-index', index);
        
        // Événement pour détecter les changements
        input.addEventListener('input', function() {
            hasUnsavedMontantChanges = true;
            updateSaveButtonState();
            updateMontantColor(this);
        });
        
        // Couleur initiale
        updateMontantColor(input);
        
        amountCell.appendChild(input);
        row.appendChild(amountCell);
        
        // Dernière modification
        const modifiedCell = document.createElement('td');
        if (wallet.last_modified) {
            const date = new Date(wallet.last_modified);
            const dateStr = date.toLocaleDateString('fr-FR');
            const timeStr = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
            const createdBy = wallet.created_by_name || 'Système';
            modifiedCell.innerHTML = `
                <span class="last-modified">${dateStr} à ${timeStr}</span><br>
                <small>par ${createdBy}</small>
            `;
        } else {
            modifiedCell.innerHTML = '<span class="last-modified">Jamais modifié</span>';
        }
        row.appendChild(modifiedCell);
        
        tbody.appendChild(row);
    });
    
    console.log(`✅ CLIENT: Tableau de ${montantDebutMoisData.length} portefeuilles affiché`);
}

// Mettre à jour la couleur du montant selon sa valeur
function updateMontantColor(input) {
    const value = parseFloat(input.value) || 0;
    input.classList.remove('montant-positive', 'montant-negative', 'montant-neutral');
    
    if (value > 0) {
        input.classList.add('montant-positive');
    } else if (value < 0) {
        input.classList.add('montant-negative');
    } else {
        input.classList.add('montant-neutral');
    }
}

// Mettre à jour l'état du bouton sauvegarder
function updateSaveButtonState() {
    const saveBtn = document.getElementById('save-montant-debut-btn');
    if (saveBtn) {
        saveBtn.disabled = !hasUnsavedMontantChanges;
        if (hasUnsavedMontantChanges) {
            saveBtn.innerHTML = '<i class="fas fa-save"></i> Sauvegarder *';
        } else {
            saveBtn.innerHTML = '<i class="fas fa-save"></i> Sauvegarder';
        }
    }
}

// Sauvegarder les montants de début de mois
async function saveMontantDebutMoisData() {
    if (!currentMontantDebutPeriod) {
        showNotification('Aucune période sélectionnée', 'error');
        return;
    }
    
    const saveBtn = document.getElementById('save-montant-debut-btn');
    const inputs = document.querySelectorAll('.montant-debut-input');
    
    // Collecter les données à sauvegarder
    const montants = [];
    inputs.forEach(input => {
        const accountId = parseInt(input.getAttribute('data-account-id'));
        const montant = parseFloat(input.value) || 0;
        
        montants.push({
            account_id: accountId,
            montant: montant
        });
    });
    
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sauvegarde...';
    
    try {
        console.log(`🗓️ CLIENT: Sauvegarde de ${montants.length} montants`);
        
        const response = await fetch(apiUrl('/api/montant-debut-mois'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                year: currentMontantDebutPeriod.year,
                month: currentMontantDebutPeriod.month,
                montants: montants
            })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Erreur lors de la sauvegarde');
        }
        
        hasUnsavedMontantChanges = false;
        updateSaveButtonState();
        
        // Recharger les données pour mettre à jour les timestamps
        await loadMontantDebutMoisData();
        
        console.log('✅ CLIENT: Montants sauvegardés avec succès');
        showNotification(data.message, 'success');
        
    } catch (error) {
        console.error('❌ CLIENT: Erreur sauvegarde montant début mois:', error);
        showNotification(`Erreur: ${error.message}`, 'error');
    } finally {
        updateSaveButtonState();
    }
}

// Mettre à jour les statistiques
async function updateMontantDebutMoisStats() {
    if (!currentMontantDebutPeriod) return;
    
    try {
        const response = await fetch(apiUrl(`/api/montant-debut-mois/stats/${currentMontantDebutPeriod.year}/${currentMontantDebutPeriod.month}`));
        const data = await response.json();
        
        if (response.ok && data.stats) {
            const configuredCount = document.getElementById('montant-debut-configured-count');
            const totalAmount = document.getElementById('montant-debut-total');
            
            if (configuredCount) {
                configuredCount.textContent = `${data.stats.portefeuilles_configures}/${data.stats.total_portefeuilles_classiques}`;
            }
            
            if (totalAmount) {
                totalAmount.textContent = `${data.stats.total_montants.toLocaleString('fr-FR')} FCFA`;
                
                // Couleur selon le total
                if (data.stats.total_montants > 0) {
                    totalAmount.classList.add('montant-positive');
                } else if (data.stats.total_montants < 0) {
                    totalAmount.classList.add('montant-negative');
                } else {
                    totalAmount.classList.add('montant-neutral');
                }
            }
            
            console.log('✅ CLIENT: Statistiques mises à jour');
        }
        
    } catch (error) {
        console.error('❌ CLIENT: Erreur calcul statistiques:', error);
    }
}

// Utilitaire : Obtenir le nom du mois
function getMonthName(monthNumber) {
    const months = [
        'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
        'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
    ];
    return months[monthNumber - 1] || 'Mois inconnu';
}

// ===== FONCTIONS MODAL PL DÉTAILS =====

// Fonction pour ouvrir le modal PL
function openPLDetailsModal() {
    const modal = document.getElementById('pl-details-modal');
    if (!modal) {
        console.error('❌ Modal PL non trouvé');
        return;
    }
    
    if (!window.currentPLDetails) {
        console.warn('⚠️ Aucun détail PL disponible');
        showNotification('Aucun détail de calcul PL disponible. Veuillez recharger le dashboard.', 'warning');
        return;
    }
    
    // Remplir les données du modal
    fillPLDetailsModal(window.currentPLDetails);
    
    // Afficher le modal
    modal.style.display = 'block';
    document.body.style.overflow = 'hidden';
    
    console.log('✅ Modal PL ouvert avec succès');
}

// Fonction pour fermer le modal PL
function closePLDetailsModal() {
    const modal = document.getElementById('pl-details-modal');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
        console.log('✅ Modal PL fermé');
    }
}

// Fonction pour exporter les détails PL en Excel
function exportPLDetailsToExcel() {
    if (!window.currentPLDetails) {
        alert('Aucune donnée PL disponible pour l\'export');
        return;
    }

    const currentDate = new Date().toLocaleDateString('fr-FR');
    const plDetails = window.currentPLDetails;
    
    // Fonction pour nettoyer les valeurs formatées (supprimer "F CFA" et espaces)
    const cleanCurrencyValue = (formattedValue) => {
        if (!formattedValue || formattedValue === 'N/A') return 0;
        // Supprimer "F CFA" et tous les espaces, puis convertir en nombre
        return parseInt(formattedValue.replace(/[^\d-]/g, '')) || 0;
    };
    
    // Fonction pour récupérer les valeurs brutes depuis les détails PL
    const getRawValue = (key) => {
        switch (key) {
            case 'cashBictorys': return plDetails.cashBictorys || 0;
            case 'creances': return plDetails.creances || 0;
            case 'virements': return plDetails.virementsMois || plDetails.virements || 0;
            case 'remboursements': return plDetails.remboursements || 0;
            case 'stockPointVente': return plDetails.stockPointVente || 0;
            case 'cashBurn': return plDetails.cashBurn || 0;
            case 'plBase': return plDetails.plBase || 0;
            case 'stockVivantVariation': return plDetails.stockVivantVariation || 0;
            case 'livraisonsPartenaires': return plDetails.livraisonsPartenaires || 0;
            case 'chargesFixesEstimation': return plDetails.chargesFixesEstimation || 0;
            case 'chargesProrata': return plDetails.chargesProrata || 0;
            case 'plFinal': return plDetails.plFinal || 0;
            default: return 0;
        }
    };
    
    // Date du PL (date de calcul)
    const plDate = plDetails.date ? 
        `${plDetails.date.jour}/${plDetails.date.mois}/${plDetails.date.annee}` : 
        'N/A';
    
    // Préparer les données pour l'export
    const exportData = [
        // En-tête
        ['DÉTAILS DU CALCUL PL - MATA GROUP', ''],
        ['Date d\'export:', currentDate],
        ['Date du PL:', plDate],
        ['', ''],
        
        // Section PL de Base
        ['PL DE BASE', ''],
        ['Cash Bictorys du mois', getRawValue('cashBictorys')],
        ['Créances du mois', getRawValue('creances')],
        ['Virements du mois', getRawValue('virements')],
        ['Remboursements du mois', -getRawValue('remboursements')],
        ['Écart Stock Mata Mensuel', getRawValue('stockPointVente')],
        ['Cash Burn du mois', getRawValue('cashBurn')],
        ['PL de base', getRawValue('plBase')],
        ['', ''],
        
        // Section Ajustements
        ['AJUSTEMENTS', ''],
        ['Écart Stock Vivant Mensuel', getRawValue('stockVivantVariation')],
        ['Livraisons partenaires du mois', getRawValue('livraisonsPartenaires')],
        ['', ''],
        
        // Section Charges Fixes
        ['ESTIMATION CHARGES FIXES', ''],
        ['Estimation charges fixes mensuelle', getRawValue('chargesFixesEstimation')],
        ['Jours ouvrables écoulés', plDetails.prorata?.joursEcoules || 0],
        ['Total jours ouvrables dans le mois', plDetails.prorata?.totalJours || 0],
        ['Pourcentage du mois écoulé', plDetails.prorata?.pourcentage ? plDetails.prorata.pourcentage + '%' : '0%'],
        ['Charges prorata (jours ouvrables)', getRawValue('chargesProrata')],
        ['', ''],
        
        // Section PL Final
        ['PL FINAL', ''],
        ['PL FINAL', getRawValue('plFinal')]
    ];

    // Créer le workbook et worksheet
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(exportData);

    // Définir les styles et largeurs de colonnes
    ws['!cols'] = [
        { width: 35 },
        { width: 20 }
    ];

    // Ajouter le worksheet au workbook
    XLSX.utils.book_append_sheet(wb, ws, 'Détails PL');

    // Générer le nom de fichier avec la date du PL
    const fileName = `Details_PL_Mata_${plDate.replace(/\//g, '-')}_export_${currentDate.replace(/\//g, '-')}.xlsx`;

    // Exporter le fichier
    XLSX.writeFile(wb, fileName);
}

// Fonction pour basculer l'affichage des détails PL
function togglePLDetails(section) {
    const detailsElement = document.getElementById(`pl-${section}-details`);
    const itemElement = document.getElementById(`pl-${section}-item`);
    
    if (detailsElement && itemElement) {
        const isVisible = detailsElement.classList.contains('show');
        
        if (isVisible) {
            // Cacher les détails
            detailsElement.classList.remove('show');
            itemElement.classList.remove('expanded');
            setTimeout(() => {
                detailsElement.style.display = 'none';
            }, 300);
        } else {
            // Afficher les détails
            detailsElement.style.display = 'block';
            setTimeout(() => {
                detailsElement.classList.add('show');
                itemElement.classList.add('expanded');
            }, 10);
        }
    }
}

// Fonction pour remplir le modal avec les détails PL
function fillPLDetailsModal(details) {
    // Section PL de base
    document.getElementById('pl-cash-bictorys').textContent = formatCurrency(details.cashBictorys);
    document.getElementById('pl-creances').textContent = formatCurrency(details.creances);
    document.getElementById('pl-virements').textContent = formatCurrency(details.virementsMois || details.virements || 0);
    
    // Afficher les remboursements (nouveau)
    console.log('🔍 CLIENT: Début affichage remboursements');
    console.log('🔍 CLIENT: details.remboursements =', details.remboursements);
    const remboursementsElement = document.getElementById('pl-remboursements');
    if (remboursementsElement) {
        const value = details.remboursements || 0;
        console.log('🔍 CLIENT: Valeur à afficher:', value);
        remboursementsElement.textContent = formatCurrency(value);
        console.log('🔍 CLIENT: Texte affiché:', remboursementsElement.textContent);
    } else {
        console.error('❌ CLIENT: Élément pl-remboursements non trouvé dans le DOM');
    }
    
    document.getElementById('pl-stock-mata').textContent = formatCurrency(details.stockPointVente);
    document.getElementById('pl-cash-burn').textContent = formatCurrency(details.cashBurn);
    document.getElementById('pl-base-result').textContent = formatCurrency(details.plBase);
    
    // Détails Stock Mata [[memory:290203]]
    if (details.stockMataDetails) {
        const stockMataDetails = document.getElementById('pl-stock-mata-details');
        if (stockMataDetails) {
            // Vérifier si on a des données valides
            if (details.stockMataDetails.currentStock !== undefined && details.stockMataDetails.previousStock !== undefined) {
                // Abattement
                const abattement = details.stockMataDetails.abattement ?? 0.10;
                const abattementPct = `${Math.round(abattement * 100)}%`;
                document.getElementById('pl-stock-mata-abattement').textContent = abattementPct;

                // Stock actuel
                document.getElementById('pl-stock-mata-current-date').textContent = 
                    details.stockMataDetails.currentStockDate ? formatDate(details.stockMataDetails.currentStockDate) : 'N/A';
                const rawCurrentEl = document.getElementById('pl-stock-mata-current-raw');
                if (rawCurrentEl) {
                    const rawCurrent = details.stockMataDetails.currentStockRaw;
                    const adjCurrent = details.stockMataDetails.currentStock;
                    if (rawCurrent && rawCurrent !== adjCurrent) {
                        rawCurrentEl.textContent = formatCurrency(rawCurrent);
                        rawCurrentEl.style.display = '';
                    } else {
                        rawCurrentEl.style.display = 'none';
                    }
                }
                document.getElementById('pl-stock-mata-current').textContent = 
                    formatCurrency(details.stockMataDetails.currentStock);

                // Stock précédent
                document.getElementById('pl-stock-mata-previous-date').textContent = 
                    details.stockMataDetails.previousStockDate ? formatDate(details.stockMataDetails.previousStockDate) : 'N/A';
                const rawPreviousEl = document.getElementById('pl-stock-mata-previous-raw');
                if (rawPreviousEl) {
                    const rawPrevious = details.stockMataDetails.previousStockRaw;
                    const adjPrevious = details.stockMataDetails.previousStock;
                    if (rawPrevious && rawPrevious !== adjPrevious) {
                        rawPreviousEl.textContent = formatCurrency(rawPrevious);
                        rawPreviousEl.style.display = '';
                    } else {
                        rawPreviousEl.style.display = 'none';
                    }
                }
                document.getElementById('pl-stock-mata-previous').textContent = 
                    formatCurrency(details.stockMataDetails.previousStock);

                // Calcul final
                document.getElementById('pl-stock-mata-calculation').textContent = 
                    `${formatCurrency(details.stockMataDetails.currentStock)} - ${formatCurrency(details.stockMataDetails.previousStock)} = ${formatCurrency(details.stockPointVente)}`;
                
                // Ne pas afficher automatiquement les détails (ils seront affichés au clic)
            }
        }
    }
    
    // Section Ajustements
    document.getElementById('pl-stock-vivant').textContent = formatCurrency(details.stockVivantVariation || 0);
    document.getElementById('pl-livraisons').textContent = formatCurrency(details.livraisonsPartenaires || 0);
    
    // Détails Stock Vivant
    if (details.stockVivantDetails) {
        const stockVivantDetails = document.getElementById('pl-stock-vivant-details');
        if (stockVivantDetails) {
            // Vérifier si on a des données valides
            if (details.stockVivantDetails.currentStock !== undefined && details.stockVivantDetails.previousStock !== undefined) {
                // Remplir les données
                document.getElementById('pl-stock-vivant-current-date').textContent = 
                    details.stockVivantDetails.currentStockDate ? formatDate(details.stockVivantDetails.currentStockDate) : 'N/A';
                document.getElementById('pl-stock-vivant-current').textContent = 
                    formatCurrency(details.stockVivantDetails.currentStock);
                document.getElementById('pl-stock-vivant-previous-date').textContent = 
                    details.stockVivantDetails.previousStockDate ? formatDate(details.stockVivantDetails.previousStockDate) : 'N/A';
                document.getElementById('pl-stock-vivant-previous').textContent = 
                    formatCurrency(details.stockVivantDetails.previousStock);
                document.getElementById('pl-stock-vivant-calculation').textContent = 
                    `${formatCurrency(details.stockVivantDetails.currentStock)} - ${formatCurrency(details.stockVivantDetails.previousStock)} = ${formatCurrency(details.stockVivantVariation || 0)}`;
                
                // Ne pas afficher automatiquement les détails (ils seront affichés au clic)
            }
        }
    }
    
    // Détails Livraisons
    if (details.livraisonsDetails) {
        const livraisonsDetails = document.getElementById('pl-livraisons-details');
        if (livraisonsDetails) {
            // Remplir les données
            console.log('🚚 DEBUG FRONTEND - Reçu details.livraisonsDetails:', details.livraisonsDetails);
            console.log('🚚 DEBUG FRONTEND - period.startDate:', details.livraisonsDetails.period?.startDate);
            console.log('🚚 DEBUG FRONTEND - period.endDate:', details.livraisonsDetails.period?.endDate);
            
            if (details.livraisonsDetails.period && details.livraisonsDetails.period.startDate && details.livraisonsDetails.period.endDate) {
                const formattedStart = formatDate(details.livraisonsDetails.period.startDate);
                const formattedEnd = formatDate(details.livraisonsDetails.period.endDate);
                console.log('🚚 DEBUG FRONTEND - formatDate(startDate):', formattedStart);
                console.log('🚚 DEBUG FRONTEND - formatDate(endDate):', formattedEnd);
                
                document.getElementById('pl-livraisons-period').textContent = 
                    `du ${formattedStart} au ${formattedEnd}`;
            } else {
                document.getElementById('pl-livraisons-period').textContent = 'Période non définie';
            }
            
            document.getElementById('pl-livraisons-count').textContent = 
                details.livraisonsDetails.count || 0;
            document.getElementById('pl-livraisons-count-non-validated').textContent = 
                details.livraisonsDetails.countNonValidated || 0;
            document.getElementById('pl-livraisons-total').textContent = 
                formatCurrency(details.livraisonsDetails.totalLivraisons || 0);
            
            // Remplir la liste des livraisons individuelles
            const livraisonsListElement = document.getElementById('pl-livraisons-list');
            if (livraisonsListElement && details.livraisonsDetails.list && details.livraisonsDetails.list.length > 0) {
                livraisonsListElement.innerHTML = ''; // Vider la liste existante
                
                details.livraisonsDetails.list.forEach(livraison => {
                    const livraisonDiv = document.createElement('div');
                    livraisonDiv.className = 'livraison-item';
                    
                    livraisonDiv.innerHTML = `
                        <div class="livraison-info">
                            <div class="livraison-partner">${livraison.partnerName}</div>
                            <div class="livraison-date">📅 ${formatDate(livraison.date)}</div>
                        </div>
                        <div class="livraison-amount">${formatCurrency(livraison.amount)}</div>
                    `;
                    
                    livraisonsListElement.appendChild(livraisonDiv);
                });
            } else if (livraisonsListElement) {
                // Si on a des livraisons mais pas de liste détaillée, afficher un message informatif
                if (details.livraisonsDetails.count > 0) {
                    livraisonsListElement.innerHTML = '<div style="text-align: center; color: #28a745; font-style: italic; padding: 10px;">📋 Détails des livraisons disponibles dans le système</div>';
                } else {
                    livraisonsListElement.innerHTML = '<div style="text-align: center; color: #6c757d; font-style: italic; padding: 10px;">Aucune livraison validée dans cette période</div>';
                }
            }
            
            // Ne pas afficher automatiquement les détails (ils seront affichés au clic)
        }
    }
    
    // Section Charges Fixes
    document.getElementById('pl-charges-prorata').textContent = formatCurrency(details.chargesProrata);
    document.getElementById('pl-charges-fixes').textContent = formatCurrency(details.chargesFixesEstimation);
    
    if (details.prorata && details.prorata.totalJours > 0) {
        document.getElementById('pl-jours-ouvrables').textContent = details.prorata.joursEcoules;
        document.getElementById('pl-total-jours').textContent = details.prorata.totalJours;
        document.getElementById('pl-pourcentage').textContent = details.prorata.pourcentage + '%';
        document.getElementById('pl-charges-calculation').textContent = 
            `${formatCurrency(details.chargesFixesEstimation)} × ${details.prorata.pourcentage}% = ${formatCurrency(details.chargesProrata)}`;
    } else {
        document.getElementById('pl-jours-ouvrables').textContent = '0';
        document.getElementById('pl-total-jours').textContent = '0';
        document.getElementById('pl-pourcentage').textContent = '0%';
        document.getElementById('pl-charges-calculation').textContent = 
            `${formatCurrency(details.chargesFixesEstimation)} × 0% = ${formatCurrency(details.chargesProrata)}`;
    }
    
    // Section PL Final
    document.getElementById('pl-final-result').textContent = formatCurrency(details.plFinal);
    
    // Section PL Alternatifs (si disponibles)
    if (window.currentPLAlternatifs && Object.keys(window.currentPLAlternatifs).length > 0) {
        console.log('📊 CLIENT: Ajout des PL alternatifs dans le modal:', Object.keys(window.currentPLAlternatifs).length);
        const alternatifSection = document.getElementById('pl-alternatifs-modal-section');
        const alternatifContent = document.getElementById('pl-alternatifs-modal-content');
        
        if (alternatifSection && alternatifContent) {
            alternatifContent.innerHTML = ''; // Vider le contenu
            
            for (const [configKey, plAlt] of Object.entries(window.currentPLAlternatifs)) {
                const itemDiv = document.createElement('div');
                itemDiv.className = 'formula-item';
                
                // Create wrapper div
                const wrapperDiv = document.createElement('div');
                wrapperDiv.style.cssText = 'margin-bottom: 10px; padding: 10px; background-color: #f8f9fa; border-radius: 5px;';
                
                // Title section
                const titleDiv = document.createElement('div');
                titleDiv.style.cssText = 'font-weight: bold; margin-bottom: 5px;';
                const icon = document.createElement('i');
                icon.className = 'fas fa-filter';
                titleDiv.appendChild(icon);
                titleDiv.appendChild(document.createTextNode(' PL sans ' + plAlt.nom));
                wrapperDiv.appendChild(titleDiv);
                
                // Config key section
                const configDiv = document.createElement('div');
                configDiv.style.cssText = 'font-size: 0.8em; color: #999; margin-bottom: 5px;';
                configDiv.textContent = '🔑 Config key: ' + configKey;
                wrapperDiv.appendChild(configDiv);
                
                // Comptes exclus section
                const comptesDiv = document.createElement('div');
                comptesDiv.style.cssText = 'font-size: 0.9em; color: #666; margin-bottom: 5px;';
                comptesDiv.textContent = '🚫 Comptes exclus: ' + plAlt.comptesExclus.join(', ');
                wrapperDiv.appendChild(comptesDiv);
                
                // Cash Burn section
                const cashBurnDiv = document.createElement('div');
                cashBurnDiv.style.cssText = 'font-size: 0.9em; color: #666; margin-bottom: 5px;';
                cashBurnDiv.textContent = '💸 Cash Burn excluant: ' + formatCurrency(plAlt.cashBurn);
                wrapperDiv.appendChild(cashBurnDiv);
                
                // Dépenses exclues section
                const depensesDiv = document.createElement('div');
                depensesDiv.style.cssText = 'font-size: 0.9em; color: #dc3545; margin-bottom: 5px;';
                depensesDiv.textContent = '➖ Dépenses exclues: ' + formatCurrency(plAlt.depensesExclues);
                wrapperDiv.appendChild(depensesDiv);
                
                // PL Final section
                const plFinalDiv = document.createElement('div');
                plFinalDiv.style.cssText = 'font-size: 1.1em; font-weight: bold; color: #28a745; margin-top: 8px;';
                plFinalDiv.textContent = '🎯 PL Final: ' + formatCurrency(plAlt.plFinal);
                wrapperDiv.appendChild(plFinalDiv);
                
                itemDiv.appendChild(wrapperDiv);
                alternatifContent.appendChild(itemDiv);
            }
            
            alternatifSection.style.display = 'block';
            console.log('✅ CLIENT: PL alternatifs ajoutés dans le modal');
        }
    } else {
        // Cacher la section si pas de PL alternatifs
        const alternatifSection = document.getElementById('pl-alternatifs-modal-section');
        if (alternatifSection) {
            alternatifSection.style.display = 'none';
        }
    }
    
    console.log('✅ Modal PL rempli avec les détails');
}

// Ajouter l'écouteur d'événement pour l'icône PL
document.addEventListener('DOMContentLoaded', function() {
    const plDetailsIcon = document.getElementById('pl-details-icon');
    if (plDetailsIcon) {
        plDetailsIcon.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            openPLDetailsModal();
        });
    }
    
    // Fermer le modal en cliquant sur le fond
    const plModal = document.getElementById('pl-details-modal');
    if (plModal) {
        plModal.addEventListener('click', function(e) {
            if (e.target === plModal) {
                closePLDetailsModal();
            }
        });
    }
    
    // Fermer le modal avec la touche Escape
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            const plModal = document.getElementById('pl-details-modal');
            if (plModal && plModal.style.display === 'block') {
                closePLDetailsModal();
            }
        }
    });
});

// ====== FONCTIONS DE SYNCHRONISATION SÉLECTIVE ======

// Charger la liste des comptes pour la synchronisation
async function loadSyncAccountsList() {
    try {
        console.log('🔄 SYNC: Chargement de la liste des comptes');
        
        const response = await fetch('/api/admin/accounts-list');
        if (!response.ok) {
            throw new Error('Erreur lors du chargement des comptes');
        }
        
        const data = await response.json();
        const syncAccountSelect = document.getElementById('audit-sync-account-select');
        
        if (!syncAccountSelect || !data.success) return;
        
        syncAccountSelect.innerHTML = '<option value="">-- Choisir un compte --</option>';
        
        data.accounts.forEach(account => {
            const option = document.createElement('option');
            option.value = account.id;
            const balance = parseFloat(account.current_balance).toLocaleString();
            option.textContent = `${account.account_name} (${balance} FCFA)`;
            option.dataset.accountName = account.account_name;
            option.dataset.accountType = account.account_type;
            option.dataset.balance = account.current_balance;
            syncAccountSelect.appendChild(option);
        });
        
        console.log(`✅ SYNC: ${data.accounts.length} comptes chargés pour la synchronisation`);
        
    } catch (error) {
        console.error('❌ SYNC: Erreur chargement comptes:', error);
        showNotification('Erreur lors du chargement des comptes pour la synchronisation', 'error');
    }
}

// Mettre à jour le bouton de synchronisation sélective
function updateSyncButton() {
    const select = document.getElementById('audit-sync-account-select');
    const btn = document.getElementById('audit-sync-selected-btn');
    
    if (select.value) {
        btn.disabled = false;
        const selectedOption = select.options[select.selectedIndex];
        const accountName = selectedOption.dataset.accountName;
        btn.innerHTML = `<i class="fas fa-sync me-2"></i>Synchroniser ${accountName}`;
    } else {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-sync me-2"></i>Synchroniser';
    }
}

// Synchroniser tous les comptes
async function syncAllAccounts() {
    const btn = document.getElementById('audit-sync-all-btn');
    const results = document.getElementById('sync-results');
    
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Synchronisation en cours...';
    
    try {
        const response = await fetch('/api/admin/force-sync-all-accounts', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            showSyncResults(`
                <div class="alert alert-success">
                    <h6><i class="fas fa-check-circle me-2"></i>${data.message}</h6>
                    <p class="mb-2">
                        <strong>${data.data.total_corrected}</strong> comptes ont été corrigés sur 
                        <strong>${data.data.total_accounts}</strong> comptes analysés.
                    </p>
                    <p class="mb-0">La page va se recharger automatiquement dans 3 secondes...</p>
                </div>
            `);
            
            showNotification(data.message, 'success');
            setTimeout(() => location.reload(), 3000);
            
        } else {
            throw new Error(data.message);
        }
        
    } catch (error) {
        showSyncResults(`
            <div class="alert alert-danger">
                <h6><i class="fas fa-exclamation-triangle me-2"></i>Erreur</h6>
                <p class="mb-0">Erreur lors de la synchronisation: ${error.message}</p>
            </div>
        `);
        showNotification('Erreur lors de la synchronisation globale', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-globe me-2"></i>Synchroniser TOUS les Comptes';
    }
}

// Synchroniser un compte spécifique
async function syncSelectedAccount() {
    const select = document.getElementById('audit-sync-account-select');
    const btn = document.getElementById('audit-sync-selected-btn');
    
    if (!select.value) {
        showNotification('Veuillez sélectionner un compte', 'warning');
        return;
    }
    
    const accountId = select.value;
    const selectedOption = select.options[select.selectedIndex];
    const accountName = selectedOption.dataset.accountName;
    
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Synchronisation...';
    
    try {
        const response = await fetch(`/api/admin/force-sync-account/${accountId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            showSyncResults(`
                <div class="alert alert-success">
                    <h6><i class="fas fa-check-circle me-2"></i>${data.message}</h6>
                    <p class="mb-2">
                        Le compte <strong>${accountName}</strong> a été synchronisé avec succès.
                    </p>
                    <p class="mb-0">La page va se recharger automatiquement dans 2 secondes...</p>
                </div>
            `);
            
            showNotification(`${accountName} synchronisé avec succès`, 'success');
            setTimeout(() => location.reload(), 2000);
            
        } else {
            throw new Error(data.message);
        }
        
    } catch (error) {
        showSyncResults(`
            <div class="alert alert-danger">
                <h6><i class="fas fa-exclamation-triangle me-2"></i>Erreur</h6>
                <p class="mb-0">Erreur lors de la synchronisation: ${error.message}</p>
            </div>
        `);
        showNotification('Erreur lors de la synchronisation du compte', 'error');
    } finally {
        btn.disabled = false;
        updateSyncButton(); // Remet le bon texte du bouton
    }
}

// Afficher les résultats de synchronisation
function showSyncResults(html) {
    const results = document.getElementById('sync-results');
    if (results) {
        results.style.display = 'block';
        results.innerHTML = html;
        results.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

// ===== MODAL DÉTAIL CASH DISPONIBLE =====

function setupCashDetailModal() {
    const cashInfoBtn = document.getElementById('cash-info-btn');
    const modal = document.getElementById('cash-detail-modal');
    const closeBtn = document.getElementById('close-cash-detail');
    
    if (cashInfoBtn) {
        cashInfoBtn.addEventListener('click', showCashDetailModal);
    }
    
    if (closeBtn) {
        closeBtn.addEventListener('click', hideCashDetailModal);
    }
    
    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                hideCashDetailModal();
            }
        });
    }
}

function showCashDetailModal() {
    const modal = document.getElementById('cash-detail-modal');
    const content = document.getElementById('cash-detail-content');
    
    if (!lastCashCalculation) {
        content.innerHTML = `
            <div class="info-message">
                <i class="fas fa-info-circle"></i>
                <p>Aucun calcul de cash disponible disponible. Veuillez actualiser le dashboard.</p>
            </div>
        `;
    } else {
        content.innerHTML = generateCashDetailHTML();
    }
    
    modal.style.display = 'block';
    document.body.style.overflow = 'hidden';
}

function hideCashDetailModal() {
    const modal = document.getElementById('cash-detail-modal');
    modal.style.display = 'none';
    document.body.style.overflow = '';
}

function generateCashDetailHTML() {
    if (!lastCashCalculation) return '<p>Aucune donnée disponible</p>';
    
    let html = `
        <div class="cash-detail-summary">
            <h4><i class="fas fa-calculator"></i> Résumé du calcul</h4>
            <div class="total-amount ${lastCashCalculation.total >= 0 ? 'positive' : 'negative'}">
                <strong>Total: ${formatCurrency(lastCashCalculation.total)}</strong>
            </div>
        </div>
        
        <div class="cash-detail-section">
            <h4><i class="fas fa-check-circle"></i> Comptes inclus (${lastCashCalculation.accounts.length})</h4>
            <div class="account-list">
    `;
    
    // Trier les comptes par solde décroissant
    const sortedAccounts = [...lastCashCalculation.accounts].sort((a, b) => b.balance - a.balance);
    
    sortedAccounts.forEach(account => {
        const isPositive = account.balance >= 0;
        html += `
            <div class="account-item ${isPositive ? 'positive' : 'negative'}">
                <div class="account-info">
                    <span class="account-name">${account.name}</span>
                    <span class="account-type">(${account.type})</span>
                </div>
                <div class="account-balance">
                    ${formatCurrency(account.balance)}
                </div>
            </div>
        `;
    });
    
    html += `
            </div>
        </div>
    `;
    
    if (lastCashCalculation.excludedAccounts.length > 0) {
        html += `
            <div class="cash-detail-section">
                <h4><i class="fas fa-times-circle"></i> Comptes exclus (${lastCashCalculation.excludedAccounts.length})</h4>
                <div class="account-list excluded">
        `;
        
        lastCashCalculation.excludedAccounts.forEach(account => {
            html += `
                <div class="account-item excluded">
                    <div class="account-info">
                        <span class="account-name">${account.name}</span>
                        <span class="account-type">(${account.type})</span>
                    </div>
                    <div class="account-balance">
                        ${formatCurrency(account.balance)}
                    </div>
                </div>
            `;
        });
        
        html += `
                </div>
                <div class="exclusion-note">
                    <i class="fas fa-info-circle"></i>
                    <small>Ces comptes sont exclus du calcul du cash disponible selon leurs types : partenaire, dépôt, créance, fournisseur.</small>
                </div>
            </div>
        `;
    }
    
    return html;
}

// ====== FIN FONCTIONS SYNCHRONISATION ======

// Fonction pour charger le statut de validation des dépenses
async function loadValidationStatus() {
    try {
        const response = await fetch('/api/validation-status');
        
        if (response.ok) {
            const statusData = await response.json();
            updateValidationStatusUI(statusData);
        } else {
            console.error('Erreur lors du chargement du statut de validation');
            // Interface par défaut en cas d'erreur
            updateValidationStatusUI({
                validate_expense_balance: true,
                message: 'Validation des dépenses activée par défaut'
            });
        }
    } catch (error) {
        console.error('Erreur loadValidationStatus:', error);
        // Interface par défaut en cas d'erreur
        updateValidationStatusUI({
            validate_expense_balance: true,
            message: 'Validation des dépenses activée par défaut'
        });
    }
}

// Fonction pour mettre à jour l'interface du statut de validation
function updateValidationStatusUI(statusData) {
    const statusCard = document.getElementById('validation-status-info');
    const icon = document.getElementById('validation-icon');
    const message = document.getElementById('validation-message');
    const details = document.getElementById('validation-details');
    
    if (!statusCard || !icon || !message || !details) return;
    
    const isValidationEnabled = statusData.validate_expense_balance;
    
    // Mettre à jour les classes CSS
    statusCard.className = 'validation-status-card';
    if (isValidationEnabled) {
        statusCard.classList.add('enabled');
        icon.className = 'fas fa-shield-alt';
        message.textContent = 'Validation des dépenses activée';
        details.textContent = 'Les dépenses ne peuvent pas dépasser le solde du compte (sauf comptes statut)';
    } else {
        statusCard.classList.add('disabled');
        icon.className = 'fas fa-exclamation-triangle';
        message.textContent = 'Validation des dépenses désactivée';
        details.textContent = 'Les dépenses peuvent dépasser le solde du compte - Mode libre activé';
    }
}