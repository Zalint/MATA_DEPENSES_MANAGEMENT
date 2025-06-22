// État global de l'application
let currentUser = null;
let categories = [];
let users = [];
let stockVivantConfig = null;

// Décote par défaut (20%)
const DEFAULT_DISCOUNT = 0.20;

// Configuration dynamique du serveur
function getServerConfig() {
    const hostname = window.location.hostname;
    const protocol = window.location.protocol;
    const port = window.location.port;
    
    // Détection automatique de l'environnement
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('192.168.')) {
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
            baseUrl: 'https://mata-depenses-management.onrender.com',
            apiUrl: 'https://mata-depenses-management.onrender.com/api'
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
    return new Date(dateString).toLocaleDateString('fr-FR');
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
    
    // Afficher le menu admin si nécessaire
    if (['directeur_general', 'pca', 'admin'].includes(currentUser.role)) {
        document.getElementById('admin-menu').style.display = 'block';
        document.getElementById('admin-users-menu').style.display = 'block';
        document.getElementById('stock-menu').style.display = 'block';
        document.getElementById('stock-vivant-menu').style.display = 'block';
        document.getElementById('stock-vivant-permissions-menu').style.display = 'block';
        document.getElementById('user-column').style.display = 'table-cell';
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
            loadDashboard();
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
            if (['directeur', 'directeur_general', 'pca', 'admin'].includes(currentUser.role)) {
                loadAccountBalance();
                loadUserAccounts();
            }
            break;
        case 'partner-tracking':
            loadPartnerSummary();
            break;
        case 'manage-users':
            loadAllUsers();
            break;
        case 'remboursements':
            // La synthèse est chargée via le gestionnaire de menu, ne rien faire ici
            break;
        case 'transfert':
            showTransfertMenuIfAllowed();
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
        case 'stock-vivant-permissions':
            console.log('🔄 CLIENT: showSection - stock-vivant-permissions appelé');
            try {
                await initStockVivantPermissions();
                console.log('✅ CLIENT: showSection - stock-vivant-permissions terminé avec succès');
            } catch (error) {
                console.error('❌ CLIENT: Erreur dans showSection - stock-vivant-permissions:', error);
                showNotification('Erreur lors du chargement des Permissions Stock Vivant', 'error');
            }
            break;
    }
}

// Chargement des données initiales
async function loadInitialData() {
    await loadCategories();
    
    // Définir les dates par défaut AVANT de charger le dashboard
    // Utiliser une plage de dates élargie pour inclure toutes les dépenses existantes
    const startDate = '2025-01-01'; // Début de l'année pour capturer toutes les dépenses
    const endDate = '2025-12-31';   // Fin de l'année pour capturer toutes les dépenses
    
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
    if (['directeur_general', 'pca', 'admin'] || ['directeur', 'directeur_general', 'pca', 'admin'].includes(currentUser.role)) {
        await loadDashboard();
    }
    setDefaultDate();
    initTransfertModule();
    await initDirectorCreditModule();
    // Stock vivant sera initialisé seulement quand on clique sur le menu
    console.log('ℹ️ CLIENT: Stock vivant sera initialisé à la demande');
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

// Fonction pour valider le montant par rapport au solde disponible
async function validateExpenseAmount() {
    try {
        const accountSelect = document.getElementById('expense-account');
        const totalField = document.getElementById('expense-total');
        const submitButton = document.querySelector('#expense-form button[type="submit"]');
        
        if (!accountSelect || !totalField || !submitButton) return;
        
        const accountId = accountSelect.value;
        const amount = parseFloat(totalField.value) || 0;
        
        // Supprimer les anciens messages d'erreur
        let errorDiv = document.getElementById('balance-error');
        if (errorDiv) {
            errorDiv.remove();
        }
        
        if (!accountId || amount <= 0) {
            submitButton.disabled = false;
            submitButton.style.opacity = '1';
            return;
        }
        
        // Récupérer les informations du compte
        const response = await fetch('/api/accounts');
        const accounts = await response.json();
        const selectedAccount = accounts.find(acc => acc.id.toString() === accountId);
        
        if (!selectedAccount) return;
        
        const currentBalance = selectedAccount.current_balance;
        const totalCredited = selectedAccount.total_credited;
        
        // Créer le div d'erreur s'il n'existe pas
        errorDiv = document.createElement('div');
        errorDiv.id = 'balance-error';
        errorDiv.style.marginTop = '10px';
        errorDiv.style.padding = '10px';
        errorDiv.style.borderRadius = '5px';
        errorDiv.style.fontSize = '14px';
        
        let hasError = false;
        
        if (amount > currentBalance) {
            errorDiv.style.backgroundColor = '#fee';
            errorDiv.style.color = '#c33';
            errorDiv.style.border = '1px solid #fcc';
            errorDiv.innerHTML = `
                <strong>⚠️ Solde insuffisant!</strong><br>
                Solde disponible: <strong>${currentBalance.toLocaleString()} FCFA</strong><br>
                Montant demandé: <strong>${amount.toLocaleString()} FCFA</strong><br>
                Manque: <strong>${(amount - currentBalance).toLocaleString()} FCFA</strong>
            `;
            hasError = true;
        } else if (totalCredited > 0 && amount <= currentBalance) {
            // Calculer les dépenses existantes
            const expensesResponse = await fetch(`/api/accounts/${selectedAccount.account_name}/expenses`);
            const expensesData = await expensesResponse.json();
            const currentTotalSpent = expensesData.expenses.reduce((sum, exp) => sum + (parseInt(exp.total) || 0), 0);
            const newTotalSpent = currentTotalSpent + amount;
            
            if (newTotalSpent > totalCredited) {
                errorDiv.style.backgroundColor = '#fee';
                errorDiv.style.color = '#c33';
                errorDiv.style.border = '1px solid #fcc';
                errorDiv.innerHTML = `
                    <strong>⚠️ Budget dépassé!</strong><br>
                    Budget total: <strong>${totalCredited.toLocaleString()} FCFA</strong><br>
                    Déjà dépensé: <strong>${currentTotalSpent.toLocaleString()} FCFA</strong><br>
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
                        Budget restant après cette dépense: <strong>${remainingBudget.toLocaleString()} FCFA</strong>
                    `;
                } else {
                    errorDiv.style.backgroundColor = '#d4edda';
                    errorDiv.style.color = '#155724';
                    errorDiv.style.border = '1px solid #c3e6cb';
                    errorDiv.innerHTML = `
                        <strong>✓ Budget OK</strong><br>
                        Budget restant après cette dépense: <strong>${remainingBudget.toLocaleString()} FCFA</strong>
                    `;
                }
            }
        }
        
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
        await loadDashboardData();
        await loadStockSummary();
        await loadStockVivantTotal(); // Ajouter le chargement du total stock vivant
        await loadTransfersCard(); // Ajouter le chargement des transferts
    } catch (error) {
        console.error('Erreur lors du chargement du dashboard:', error);
        showAlert('Erreur lors du chargement du dashboard', 'danger');
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
async function updateStatsCards(startDate, endDate) {
    try {
        // Construire l'URL avec les paramètres de date
        let url = '/api/dashboard/stats-cards';
        const params = new URLSearchParams();
        
        if (startDate) params.append('start_date', startDate);
        if (endDate) params.append('end_date', endDate);
        
        if (params.toString()) {
            url += '?' + params.toString();
        }
        
        const response = await fetch(url);
        const stats = await response.json();
        
        // Mettre à jour les valeurs des cartes
        document.getElementById('total-spent-amount').textContent = formatCurrency(stats.totalSpent || 0);
        document.getElementById('total-remaining-amount').textContent = formatCurrency(stats.totalRemaining || 0);
        document.getElementById('total-credited-with-expenses').textContent = formatCurrency(stats.totalCreditedWithExpenses || 0);
        document.getElementById('total-credited-general').textContent = formatCurrency(stats.totalCreditedGeneral || 0);
        document.getElementById('total-depot-balance').textContent = formatCurrency(stats.totalDepotBalance || 0);
        document.getElementById('total-partner-balance').textContent = formatCurrency(stats.totalPartnerBalance || 0);
        
        // Mettre à jour les périodes
        const periodText = startDate && endDate ? 
            `Du ${formatDate(startDate)} au ${formatDate(endDate)}` : 
            'Période sélectionnée';
        
        document.getElementById('spent-period').textContent = periodText;
        document.getElementById('remaining-period').textContent = 'Soldes actuels';
        document.getElementById('credited-expenses-period').textContent = 'Comptes avec activité';
        document.getElementById('credited-general-period').textContent = 'Tous les comptes';
        
    } catch (error) {
        console.error('Erreur chargement statistiques cartes:', error);
        // Afficher des valeurs par défaut en cas d'erreur
        document.getElementById('total-spent-amount').textContent = '0 FCFA';
        document.getElementById('total-remaining-amount').textContent = '0 FCFA';
        document.getElementById('total-credited-with-expenses').textContent = '0 FCFA';
        document.getElementById('total-credited-general').textContent = '0 FCFA';
        document.getElementById('total-depot-balance').textContent = '0 FCFA';
        document.getElementById('total-partner-balance').textContent = '0 FCFA';
    }
}

function createChart(containerId, data, type) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    
    if (!data || data.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #666;">Aucune donnée disponible</p>';
        return;
    }
    
    // Vérifier si on doit afficher les comptes avec zéro dépenses
    const showZeroAccounts = document.getElementById('show-zero-accounts')?.checked || false;
    
    // Filtrer les données selon l'option sélectionnée
    let filteredData;
    if (type === 'account') {
        if (showZeroAccounts) {
            // Pour les comptes, si l'option est cochée, afficher tous les comptes
            filteredData = data;
        } else {
            // Pour les comptes, afficher ceux qui ont des dépenses OU un solde > 0
            filteredData = data.filter(item => {
                const spent = parseInt(item.spent) || parseInt(item.amount) || 0;
                const balance = parseInt(item.current_balance) || 0;
                const totalCredited = parseInt(item.total_credited) || 0;
                return spent > 0 || balance > 0 || totalCredited > 0;
            });
        }
    } else {
        // Pour les catégories, filtrer les données avec un montant > 0 (comportement par défaut)
        filteredData = data.filter(item => item.amount > 0);
    }
    
    if (filteredData.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #666;">Aucune dépense pour cette période</p>';
        return;
    }
    
    // Créer le tableau
    const table = document.createElement('table');
    table.className = 'summary-table';
    
    // En-tête du tableau
    const thead = document.createElement('thead');
    let headerRow = '';
    
    if (type === 'account') {
        headerRow = `
            <tr>
                <th>Compte</th>
                <th>Montant Dépensé</th>
                <th>Montant Restant</th>
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
    
    // Corps du tableau
    const tbody = document.createElement('tbody');
    
    // Calculer le total des dépenses pour les pourcentages (seulement pour les catégories)
    let totalExpenses = 0;
    if (type === 'category') {
        totalExpenses = filteredData.reduce((sum, item) => sum + (parseInt(item.amount) || 0), 0);
    }
    
    filteredData.forEach(item => {
        const row = document.createElement('tr');
        
        // Déterminer le label selon le type
        let label = '';
        if (type === 'account') {
            label = item.account;
        } else if (type === 'category') {
            label = item.category;
        } else {
            label = item.category || item.user || item.account;
        }
        
        if (type === 'account' && item.total_credited && item.total_credited > 0) {
            const spent = parseInt(item.spent) || 0;
            const totalCredited = parseInt(item.total_credited) || 0;
            const remaining = parseInt(item.current_balance) || 0; // Utiliser current_balance au lieu de totalCredited - spent
            
            row.innerHTML = `
                <td class="label-cell">
                  <span class="clickable-account-name" onclick="showAccountExpenseDetails('${label}', ${spent}, ${remaining}, ${totalCredited})" 
                        style="cursor: pointer; color: #007bff; text-decoration: underline;" 
                        title="Cliquer pour voir les détails des dépenses">
                    ${label}
                  </span>
                </td>
                <td class="amount-cell spent">${formatCurrency(spent)}</td>
                <td class="amount-cell remaining">${formatCurrency(remaining)}</td>
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
    const tbody = document.getElementById('expenses-tbody');
    tbody.innerHTML = '';
    
    const colSpan = ['directeur', 'directeur_general', 'pca', 'admin'].includes(currentUser.role) ? '16' : '15';
    
    if (expenses.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${colSpan}" style="text-align: center;">Aucune dépense trouvée</td></tr>`;
        return;
    }
    
    expenses.forEach(expense => {
        const row = document.createElement('tr');
        row.className = 'expense-row';
        row.dataset.expenseId = expense.id;
        
        // Déterminer si c'est une dépense faite par le DG sur le compte d'un directeur
        const isDGExpenseOnDirectorAccount = ['directeur', 'directeur_general', 'pca', 'admin'].includes(currentUser.role) && 
                                             expense.username !== currentUser.username;
        
        // Ajouter une classe CSS ou un style pour les dépenses du DG
        if (isDGExpenseOnDirectorAccount) {
            row.style.fontStyle = 'italic';
            row.style.opacity = '0.8';
            row.title = 'Dépense effectuée par le Directeur Général sur votre compte';
        }
        
        // Bouton pour télécharger le justificatif
        const justificationButton = expense.has_justification ? 
            `<button class="btn btn-sm btn-primary" onclick="downloadJustification(${expense.id})" title="Télécharger le justificatif">
                <i class="fas fa-download"></i>
            </button>` : 
            '<span style="color: #999;">Aucun</span>';
        
        // Bouton pour modifier la dépense avec vérification des restrictions
        let editButton = '';
        
        if (isDGExpenseOnDirectorAccount && ['directeur', 'directeur_general', 'pca', 'admin'].includes(currentUser.role)) {
            // Dépense du DG sur compte directeur - pas d'édition
            editButton = '<span style="color: #999;" title="Seul le Directeur Général peut modifier cette dépense"><i class="fas fa-lock"></i></span>';
        } else if (['directeur', 'directeur_general', 'pca', 'admin'].includes(currentUser.role)) {
            // Vérifier la restriction de 48 heures pour les directeurs
            const expenseDate = new Date(expense.created_at);
            const now = new Date();
            const hoursDifference = (now - expenseDate) / (1000 * 60 * 60);
            
            if (hoursDifference > 48) {
                editButton = '<span style="color: #dc3545;" title="Modification non autorisée - Plus de 48 heures écoulées"><i class="fas fa-clock"></i></span>';
            } else {
                const remainingHours = 48 - hoursDifference;
                if (remainingHours <= 12) {
                    // Avertissement - proche de la limite
                    editButton = `<button class="btn btn-sm btn-warning" onclick="openEditModal(${expense.id})" title="⚠️ Il reste ${Math.floor(remainingHours)}h${Math.floor((remainingHours % 1) * 60)}min pour modifier">
                        <i class="fas fa-edit"></i> <i class="fas fa-exclamation-triangle" style="font-size: 0.7em;"></i>
                    </button>`;
                } else {
                    // Modification normale
                    editButton = `<button class="btn btn-sm btn-warning" onclick="openEditModal(${expense.id})" title="Modifier la dépense (${Math.floor(remainingHours)}h restantes)">
                <i class="fas fa-edit"></i>
                    </button>`;
                }
            }
        } else if (['directeur_general', 'pca', 'admin'].includes(currentUser.role)) {
            // DG, PCA et Admin peuvent toujours modifier
            editButton = `<button class="btn btn-sm btn-warning" onclick="openEditModal(${expense.id})" title="Modifier la dépense">
                <i class="fas fa-edit"></i>
            </button>`;
        }
        
        row.innerHTML = `
            <td>
                <input type="checkbox" class="expense-checkbox" data-expense-id="${expense.id}">
            </td>
            <td>${formatDate(expense.expense_date)}</td>
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
            <td>${expense.username || '-'}${isDGExpenseOnDirectorAccount ? ' <small style="color: #007bff;">(DG)</small>' : ''}</td>
            ${['directeur', 'directeur_general', 'pca', 'admin'].includes(currentUser.role) ? `<td>${expense.user_name}</td>` : ''}
            <td>
                <div class="action-buttons">
                    ${editButton}
                    ${generateDeleteButton(expense, isDGExpenseOnDirectorAccount)}
                </div>
            </td>
        `;
        
        // Les lignes ne sont plus marquées comme sélectionnées automatiquement
        
        tbody.appendChild(row);
    });
    
    // Mettre à jour le compteur de sélection
    updateSelectedCount();
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
    
    if (isDGExpenseOnDirectorAccount && currentUser.role === 'directeur') {
        // Dépense du DG sur compte directeur - seuls les directeurs simples ne peuvent pas supprimer
        deleteButton = '<span style="color: #999;" title="Seul le Directeur Général peut supprimer cette dépense"><i class="fas fa-lock"></i></span>';
    } else if (currentUser.role === 'directeur') {
        // Vérifier la restriction de 48 heures pour les directeurs simples (leurs propres dépenses)
        const expenseDate = new Date(expense.created_at);
        const now = new Date();
        const hoursDifference = (now - expenseDate) / (1000 * 60 * 60);
        
        if (hoursDifference > 48) {
            deleteButton = '<span style="color: #dc3545;" title="Suppression non autorisée - Plus de 48 heures écoulées"><i class="fas fa-clock"></i></span>';
        } else {
            const remainingHours = 48 - hoursDifference;
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
    try {
        showNotification('Génération du PDF en cours...', 'info');
        
        const response = await fetch('/api/expenses/generate-invoices-pdf', {
            method: 'POST'
        });
        
        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = `factures_${new Date().toISOString().split('T')[0]}.pdf`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            
            showNotification('PDF des factures généré avec succès !', 'success');
        } else {
            const error = await response.json();
            throw new Error(error.error);
        }
    } catch (error) {
        console.error('Erreur génération PDF:', error);
        showNotification(`Erreur: ${error.message}`, 'error');
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
        
        // Appliquer les filtres et afficher
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
    
    // Appliquer le tri
    sortExpenses(filteredExpenses);
    
    // Afficher les résultats
    displayExpenses(filteredExpenses);
    
    // Mettre à jour le compteur
    updateFilteredCount(filteredExpenses.length, currentExpenses.length);
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
    
    // Créer le tableau
    const tableHtml = `
        <div class="table-responsive" style="border-radius: 15px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.1);">
            <table class="table table-striped table-hover mb-0" id="accounts-table" style="border-radius: 15px; overflow: hidden;">
                <thead style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white;">
                    <tr>
                        <th style="border: none; padding: 15px; font-weight: 600;">
                            <i class="fas fa-university" style="margin-right: 8px;"></i>Compte
                        </th>
                        <th style="border: none; padding: 15px; font-weight: 600;">
                            <i class="fas fa-tags" style="margin-right: 8px;"></i>Type
                        </th>
                        <th style="border: none; padding: 15px; font-weight: 600;">
                            <i class="fas fa-user" style="margin-right: 8px;"></i>Utilisateur
                        </th>
                        <th style="border: none; padding: 15px; font-weight: 600;">
                            <i class="fas fa-folder" style="margin-right: 8px;"></i>Catégorie
                        </th>
                        <th style="border: none; padding: 15px; font-weight: 600;">
                            <i class="fas fa-wallet" style="margin-right: 8px;"></i>Solde
                        </th>
                        <th style="border: none; padding: 15px; font-weight: 600;">
                            <i class="fas fa-plus-circle" style="margin-right: 8px;"></i>Crédité
                        </th>
                        <th style="border: none; padding: 15px; font-weight: 600;">
                            <i class="fas fa-minus-circle" style="margin-right: 8px;"></i>Dépensé
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
    
    accountsList.innerHTML = filtersHtml + tableHtml;
    
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
        tbody.innerHTML = '<tr><td colspan="10" style="text-align: center;">Aucun compte trouvé avec ces filtres</td></tr>';
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
                <td>${account.category_type || '-'}</td>
                <td><strong>${formatCurrency(account.current_balance)}</strong></td>
                <td>${formatCurrency(account.total_credited)}</td>
                <td>${formatCurrency(account.total_spent)}</td>
                <td>${formatDate(account.created_at)}</td>
                <td><span class="${statusClass}"><strong>${statusText}</strong></span></td>
                <td>${actionButtons}</td>
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

        }, 100); // Reduced timeout
        
        // Changer le texte du bouton et ajouter un attribut pour identifier la modification
        const submitButton = document.querySelector('#createAccountForm button[type="submit"]');
        const cancelButton = document.getElementById('cancelAccountEdit');
        submitButton.textContent = 'Modifier le Compte';
        submitButton.dataset.editingId = accountId;
        cancelButton.style.display = 'inline-block';
        console.log('[editAccount] Changed button to "Modifier le Compte" and set editingId.');

        
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
async function loadCreditHistory() {
    try {
        const response = await fetch('/api/credit-history');
        const credits = await response.json();
        
        displayCreditHistory(credits);
        
    } catch (error) {
        console.error('Erreur chargement historique crédits:', error);
    }
}

function displayCreditHistory(credits) {
    const tbody = document.getElementById('credit-history-tbody');
    tbody.innerHTML = '';
    
    if (credits.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">Aucun crédit trouvé</td></tr>';
        return;
    }
    
    credits.forEach(credit => {
        const row = document.createElement('tr');
        
        // Générer le bouton de suppression selon les permissions
        const deleteButton = generateCreditDeleteButton(credit);
        
        row.innerHTML = `
            <td>${formatDate(credit.created_at)}</td>
            <td>${credit.account_name}</td>
            <td>${formatCurrency(parseInt(credit.amount))}</td>
            <td>${credit.credited_by_name}</td>
            <td>${credit.description || 'N/A'}</td>
            <td style="text-align: center;">${deleteButton}</td>
        `;
        tbody.appendChild(row);
    });
}

// Fonction pour générer le bouton de suppression d'un crédit
function generateCreditDeleteButton(credit) {
    let deleteButton = '';
    
    // Vérifier les permissions
    const canDelete = canDeleteCredit(credit);
    
    if (canDelete.allowed) {
        if (canDelete.timeWarning) {
            // Avertissement - proche de la limite de 48h pour les directeurs
            deleteButton = `<button class="btn btn-sm btn-danger" onclick="deleteCredit(${credit.id})" title="${canDelete.timeWarning}">
                <i class="fas fa-trash" style="color: #fbbf24;"></i>
            </button>`;
        } else {
            // Suppression normale
            deleteButton = `<button class="btn btn-sm btn-danger" onclick="deleteCredit(${credit.id})" title="Supprimer ce crédit">
                <i class="fas fa-trash"></i>
            </button>`;
        }
    } else {
        // Pas autorisé
        deleteButton = `<span style="color: #dc3545;" title="${canDelete.reason}"><i class="fas fa-lock"></i></span>`;
    }
    
    return deleteButton;
}

// Fonction pour vérifier si un crédit peut être supprimé
function canDeleteCredit(credit) {
    // Admin, DG, PCA peuvent toujours supprimer
    if (['admin', 'directeur_general', 'pca'].includes(currentUser.role)) {
        return { allowed: true };
    }
    
    // Directeurs simples : vérifier s'ils ont les droits de crédit sur ce compte ET dans les 48h
    if (currentUser.role === 'directeur') {
        // TODO: Vérifier les permissions de crédit du directeur sur ce compte
        // Pour l'instant, on vérifie juste les 48h
        const creditDate = new Date(credit.created_at);
        const now = new Date();
        const hoursDifference = (now - creditDate) / (1000 * 60 * 60);
        
        if (hoursDifference > 48) {
            return {
                allowed: false,
                reason: `Suppression non autorisée - Plus de 48 heures écoulées (${Math.floor(hoursDifference)}h)`
            };
        }
        
        const remainingHours = 48 - hoursDifference;
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

// Fonction pour supprimer un crédit
async function deleteCredit(creditId) {
    // Demander confirmation
    const confirmMessage = 'Êtes-vous sûr de vouloir supprimer ce crédit ?\n\nCette action est irréversible et affectera le solde du compte.';
    
    if (!confirm(confirmMessage)) {
        return;
    }
    
    try {
        const response = await fetch(`/api/credit-history/${creditId}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            showNotification('Crédit supprimé avec succès !', 'success');
            // Recharger l'historique des crédits
            await loadCreditHistory();
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
        const response = await fetch('/api/users');
        const users = await response.json();
        
        const userSelect = document.getElementById('createDirectorSelect');
        userSelect.innerHTML = '<option value="">Sélectionner un utilisateur directeur</option>';
        
        users.forEach(user => {
            const option = document.createElement('option');
            option.value = user.id;
            option.textContent = user.username;
            userSelect.appendChild(option);
        });
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
    submitButton.textContent = 'Créer le Compte';
    delete submitButton.dataset.editingId;
    cancelButton.style.display = 'none';
    
    // Masquer les sections spécifiques
    document.getElementById('categoryTypeGroup').style.display = 'none';
    document.getElementById('permissionsSection').style.display = 'none';
    document.getElementById('userSelectGroup').style.display = 'block';
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
}

// Gestionnaires d'événements
document.addEventListener('DOMContentLoaded', function() {
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
        
        addExpenseWithFile(formData);
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
            initial_amount: parseInt(document.getElementById('initialAmount').value) || 0,
            description: document.getElementById('createDescription').value,
            account_type: accountType,
            credit_permission_user_id: document.getElementById('creditPermissionDirectorSelect').value || null
        };
        
        // Pour les comptes classiques, ajouter le type de catégorie
        if (accountType === 'classique') {
            const categoryType = document.getElementById('categoryTypeSelect').value;
            if (categoryType) {
                formData.category_type = categoryType;
            }
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
        const formData = {
            account_id: parseInt(document.getElementById('creditAccountSelect').value),
            amount: parseInt(document.getElementById('creditAmount').value),
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
        loadDashboard();
    });
    
    document.getElementById('reset-dashboard').addEventListener('click', function() {
        // Remettre la date d'aujourd'hui
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('dashboard-start-date').value = today;
        document.getElementById('dashboard-end-date').value = today;
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
    
    // Cacher toutes les sections spécifiques
    console.log('[handleAccountTypeChange] Hiding all specific sections.');
    categoryTypeGroup.style.display = 'none';
    permissionsSection.style.display = 'none';
    creditPermissionGroup.style.display = 'none';
    
    // Rétablir la visibilité du sélecteur d'utilisateur par défaut
    userSelectGroup.style.display = 'block';
    createDirectorSelect.required = true;

    // Messages d'aide selon le type
    const helpMessages = {
        'classique': 'Compte standard assigné à un directeur. Le DG peut donner des permissions de crédit.',
        'partenaire': 'Compte accessible à tous les utilisateurs.',
        'statut': 'Compte où le crédit écrase le solde existant (DG/PCA uniquement).',
        'Ajustement': 'Compte spécial pour les ajustements comptables (DG/PCA uniquement).',
        'depot': 'Compte dépôt exclu du calcul de solde global (DG/PCA uniquement).'
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
            // La section des permissions existantes n'est montrée que pour la modification
            // permissionsSection.style.display = 'block';
            loadCategoryTypes(); // Charger les types de catégories
            loadDirectorsForCreditPermission(); // Charger les directeurs pour la permission
            break;
            
        case 'partenaire':
        case 'statut':
        case 'Ajustement':
        case 'depot':
            console.log(`[handleAccountTypeChange] Type is "${accountType}". Hiding userSelectGroup.`);
            userSelectGroup.style.display = 'none';
            createDirectorSelect.required = false;
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
            const option1 = document.createElement('option');
            option1.value = director.id;
            option1.textContent = director.username;
            creanceDirectorSelect.appendChild(option1);
            
            const option2 = document.createElement('option');
            option2.value = director.id;
            option2.textContent = director.username;
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
    
    historyContainer.style.display = 'none';
    historyBody.innerHTML = '';
    
    if (!accountId) return;

    try {
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
        // Récupérer les détails de la dépense
        const response = await fetch(`/api/expenses/${expenseId}`);
        if (!response.ok) {
            throw new Error('Erreur lors de la récupération de la dépense');
        }
        
        const expense = await response.json();
        
        // Vérifier les restrictions de modification pour les directeurs réguliers
        if (currentUser.role === 'directeur') {
            const expenseDate = new Date(expense.created_at);
            const now = new Date();
            const hoursDifference = (now - expenseDate) / (1000 * 60 * 60); // Différence en heures
            
            if (hoursDifference > 48) {
                const confirmMessage = `⚠️ RESTRICTION DE MODIFICATION ⚠️\n\n` +
                    `Cette dépense a été créée il y a ${Math.floor(hoursDifference)} heures.\n\n` +
                    `En tant que Directeur, vous ne pouvez modifier une dépense que dans les 48 heures suivant sa création.\n\n` +
                    `Seuls le Directeur Général et le PCA peuvent modifier les dépenses après 48 heures.\n\n` +
                    `Voulez-vous contacter un administrateur pour cette modification ?`;
                
                if (confirm(confirmMessage)) {
                    showNotification('Veuillez contacter le Directeur Général ou le PCA pour modifier cette dépense.', 'info');
                }
                return; // Empêcher l'ouverture du modal
            } else {
                // Afficher un avertissement si proche de la limite
                const remainingHours = 48 - hoursDifference;
                if (remainingHours <= 12) {
                    const warningMessage = `⏰ ATTENTION ⏰\n\n` +
                        `Il vous reste ${Math.floor(remainingHours)} heures et ${Math.floor((remainingHours % 1) * 60)} minutes ` +
                        `pour modifier cette dépense.\n\n` +
                        `Après 48 heures, seuls le DG et le PCA pourront la modifier.\n\n` +
                        `Voulez-vous continuer la modification ?`;
                    
                    if (!confirm(warningMessage)) {
                        return; // L'utilisateur a choisi d'annuler
                    }
                }
            }
        }
        
        // Charger les catégories dans le modal
        await loadEditCategories();
        
        // Charger les comptes dans le modal  
        await loadEditAccounts();
        
        // Remplir le formulaire avec les données existantes
        document.getElementById('edit-expense-id').value = expense.id;
        document.getElementById('edit-expense-account').value = expense.account_id || '';
        
        // Formater la date correctement pour l'input date HTML
        if (expense.expense_date) {
            const date = new Date(expense.expense_date);
            const formattedDate = date.toISOString().split('T')[0];
            document.getElementById('edit-expense-date').value = formattedDate;
        }
        
        document.getElementById('edit-expense-designation').value = expense.designation || '';
        document.getElementById('edit-expense-supplier').value = expense.supplier || '';
        document.getElementById('edit-expense-quantity').value = expense.quantity || '';
        document.getElementById('edit-expense-unit-price').value = expense.unit_price || '';
        document.getElementById('edit-expense-total').value = expense.total || expense.amount || '';
        document.getElementById('edit-expense-predictable').value = expense.predictable || '';
        document.getElementById('edit-expense-description').value = expense.description || '';
        
        // Gérer les catégories hiérarchiques
        if (expense.expense_type) {
            document.getElementById('edit-expense-type').value = expense.expense_type;
            loadEditCategoriesByType(expense.expense_type);
            
            setTimeout(() => {
                if (expense.category) {
                    document.getElementById('edit-expense-category').value = expense.category;
                    loadEditSubcategoriesByCategory(expense.expense_type, expense.category);
                    
                    setTimeout(() => {
                        if (expense.subcategory) {
                            document.getElementById('edit-expense-subcategory').value = expense.subcategory;
                            handleEditSubcategoryChange(expense.subcategory);
                            
                            setTimeout(() => {
                                if (expense.social_network_detail) {
                                    document.getElementById('edit-social-network-detail').value = expense.social_network_detail;
                                }
                            }, 100);
                        }
                    }, 100);
                }
            }, 100);
        }
        
        // Afficher le modal
        document.getElementById('edit-expense-modal').style.display = 'block';
        
    } catch (error) {
        console.error('Erreur ouverture modal:', error);
        showNotification(`Erreur: ${error.message}`, 'error');
    }
}

function closeEditModal() {
    document.getElementById('edit-expense-modal').style.display = 'none';
    document.getElementById('edit-expense-form').reset();
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
    
    if (!totalField.dataset.manuallyEdited && quantity && unitPrice) {
        const total = Math.round(quantity * unitPrice);
        totalField.value = total;
    }
    
    // Valider le solde après calcul
    validateEditExpenseAmount();
}

// Fonction pour valider le montant lors de l'édition
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
        } else if (totalCredited > 0) {
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
        
        const formData = new FormData(this);
        const expenseData = Object.fromEntries(formData.entries());
        
        try {
            const response = await fetch(`/api/expenses/${expenseData.expense_id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(expenseData)
            });
            
            if (response.ok) {
                showNotification('Dépense modifiée avec succès !', 'success');
                closeEditModal();
                await loadExpenses(); // Recharger la liste des dépenses
            } else {
                const error = await response.json();
                throw new Error(error.error);
            }
        } catch (error) {
            console.error('Erreur modification dépense:', error);
            showNotification(`Erreur: ${error.message}`, 'error');
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
async function showAccountExpenseDetails(accountName, totalAmount, remainingAmount, totalCredited) {
    try {
        // Récupérer les dates du dashboard
        const startDate = document.getElementById('dashboard-start-date').value || '2025-01-01';
        const endDate = document.getElementById('dashboard-end-date').value || '2025-12-31';
        
        // Appel API pour récupérer les détails
        const response = await fetch(`/api/accounts/${encodeURIComponent(accountName)}/expenses?start_date=${startDate}&end_date=${endDate}`);
        
        if (!response.ok) {
            throw new Error('Erreur lors de la récupération des détails');
        }
        
        const data = await response.json();
        displayExpenseDetailsModal(data, totalAmount, remainingAmount, totalCredited);
        
    } catch (error) {
        console.error('Erreur récupération détails dépenses:', error);
        showNotification('Erreur lors de la récupération des détails des dépenses', 'error');
    }
}

// Fonction pour afficher le modal avec les détails des dépenses
function displayExpenseDetailsModal(data, totalAmount, remainingAmount, totalCredited) {
    // Créer le modal s'il n'existe pas
    let modal = document.getElementById('expense-details-modal');
    if (!modal) {
        modal = createExpenseDetailsModal();
        document.body.appendChild(modal);
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
        extraAmounts += `<span><strong>Total Crédité:</strong> ${formatCurrency(totalCredited)}</span>`;
    }
    modalContent.querySelector('.total-amount').innerHTML = extraAmounts;
    // Stocker les montants pour le tableau
    window.modalRemainingAmount = remainingAmount;
    window.modalTotalCredited = totalCredited;
    // Stocker les dépenses pour le filtrage et tri
    window.modalExpenses = data.expenses || [];
    window.modalCurrentSortField = 'expense_date';
    window.modalCurrentSortDirection = 'desc';
    // Populer les options de filtres
    populateModalFilterOptions(window.modalExpenses);
    // Afficher les dépenses avec tri par défaut
    applyModalFiltersAndDisplay();
    // Afficher le modal
    modal.style.display = 'block';
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
                                    Date <i class="fas fa-sort sort-icon" style="margin-left: 5px; opacity: 0.5;"></i>
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
                                <th style="padding: 12px; text-align: right;">Total restant</th>
                                <th style="padding: 12px; text-align: right;">Total crédité</th>
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
                <td colspan="13" style="text-align: center; padding: 20px; color: #666;">
                    Aucune dépense trouvée avec les filtres appliqués.
                </td>
            </tr>
        `;
        return;
    }
    // Calcul du total crédité
    const totalCredited = typeof window.modalTotalCredited !== 'undefined' ? window.modalTotalCredited : 0;
    // Calcul cumulatif selon l'ordre d'affichage (après tri et filtres)
    let cumulative = 0;
    tbody.innerHTML = expenses.map(expense => {
        const isDGExpense = currentUser.role === 'directeur' && expense.username !== currentUser.username;
        const rowStyle = isDGExpense ? 'font-style: italic; opacity: 0.8;' : '';
        cumulative += parseInt(expense.total) || 0;
        const remaining = totalCredited - cumulative;
        return `
            <tr style="${rowStyle}">
                <td style="padding: 12px;">${formatDate(expense.expense_date)}</td>
                <td style="padding: 12px;">
                        ${expense.designation || 'Sans désignation'}
                        ${isDGExpense ? '<span style=\"color: #007bff; font-size: 0.8rem; margin-left: 8px;\">(DG)</span>' : ''}
                </td>
                <td style="padding: 12px;">${expense.category || 'N/A'}</td>
                <td style="padding: 12px;">${expense.supplier || 'N/A'}</td>
                <td style="padding: 12px; text-align: center;">${expense.quantity || 'N/A'}</td>
                <td style="padding: 12px; text-align: right;">${expense.unit_price ? formatCurrency(expense.unit_price) : 'N/A'}</td>
                <td style="padding: 12px; text-align: right; font-weight: bold; color: #e74c3c;">${formatCurrency(expense.total)}</td>
                <td style="padding: 12px; text-align: right; font-weight: bold; color: #2980b9;">${formatCurrency(remaining)}</td>
                <td style="padding: 12px; text-align: right; font-weight: bold; color: #27ae60;">${typeof window.modalTotalCredited !== 'undefined' ? formatCurrency(window.modalTotalCredited) : '-'}</td>
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
    if (countElement) {
        countElement.textContent = `Affichage de ${filtered} dépense${filtered > 1 ? 's' : ''} sur ${total} au total`;
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
        const calculatedAmount = parseInt(articleCount) * parseInt(unitPrice);
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
                article_count: parseInt(document.getElementById('delivery-article-count').value),
                unit_price: parseInt(document.getElementById('delivery-unit-price').value),
                amount: parseInt(document.getElementById('delivery-amount').value),
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
        const response = await fetch('/api/partner/delivery-summary');
        const partnerSummary = await response.json();
        
        displayPartnerSummary(partnerSummary);
        
        // Charger aussi la configuration si admin
        if (currentUser.role === 'directeur_general' || currentUser.role === 'pca' || currentUser.role === 'admin') {
            await loadPartnerConfiguration();
        }
    } catch (error) {
        console.error('Erreur chargement résumé partenaires:', error);
    }
}

// Afficher le résumé des comptes partenaires
function displayPartnerSummary(partnerSummary) {
    const tbody = document.getElementById('partner-summary-tbody');
    tbody.innerHTML = '';
    
    if (partnerSummary.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center;">Aucun compte partenaire trouvé</td></tr>';
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

// Afficher les détails d'un compte partenaire
async function showPartnerDetails(accountId, accountName) {
    try {
        // Vérifier les permissions pour ajouter des livraisons
        const permResponse = await fetch(`/api/partner/${accountId}/can-expense`);
        const permResult = await permResponse.json();
        
        // Charger les directeurs assignés au compte
        const directorsResponse = await fetch(`/api/partner/${accountId}/directors`);
        const directorsResult = await directorsResponse.json();
        window.currentAccountDirectors = directorsResult.assigned_director_ids || [];
        console.log('Directeurs chargés pour le compte', accountId, ':', directorsResult);
        
        // Charger les livraisons
        const response = await fetch(`/api/partner/${accountId}/deliveries`);
        const deliveries = await response.json();
        
        // Afficher la section détails
        document.querySelector('.partner-summary').style.display = 'none';
        document.getElementById('partner-details').style.display = 'block';
        document.getElementById('partner-details-title').textContent = `Détails - ${accountName}`;
        
        // Configurer le formulaire
        document.getElementById('delivery-account-id').value = accountId;
        const warningDiv = document.getElementById('delivery-authorization-warning');
        const warningText = document.getElementById('delivery-warning-text');
        const addBtn = document.getElementById('add-delivery-btn');
        
        if (permResult.canExpense) {
            warningDiv.style.display = 'none';
            addBtn.disabled = false;
        } else {
            warningDiv.style.display = 'block';
            warningText.textContent = permResult.reason;
            addBtn.disabled = true;
        }
        
        // Afficher les livraisons
        displayDeliveries(deliveries);
        
    } catch (error) {
        console.error('Erreur chargement détails partenaire:', error);
        showNotification('Erreur lors du chargement des détails', 'error');
    }
}

// Afficher la liste des livraisons
// Générer les boutons d'action selon le statut de la livraison
function getDeliveryActionButtons(delivery) {
    const validationStatus = delivery.validation_status || 'pending';
    const canUserValidate = canValidateDelivery(delivery);
    const userId = currentUser.id;
    const isFirstValidator = delivery.first_validated_by === userId;
    
    switch (validationStatus) {
        case 'pending':
            // Livraison en attente de première validation
            if (canUserValidate) {
                return `<button class="btn-validate" onclick="firstValidateDelivery(${delivery.id})">1ère Validation</button>`;
            }
            return '-';
            
        case 'first_validated':
            // Livraison en attente de seconde validation
            if (canUserValidate && !isFirstValidator) {
                return `
                    <button class="btn-validate" onclick="finalValidateDelivery(${delivery.id})">Approuver</button>
                    <button class="btn-reject" onclick="rejectDelivery(${delivery.id})">Rejeter</button>
                `;
            } else if (isFirstValidator) {
                return 'En attente 2ème validation';
            }
            return '-';
            
        case 'fully_validated':
            return 'Validée';
            
        case 'rejected':
            // Livraison rejetée, peut être modifiée et resoumise
            if (delivery.created_by === userId) {
                return `<button class="btn-edit" onclick="editRejectedDelivery(${delivery.id})">Modifier</button>`;
            }
            return 'Rejetée';
            
        default:
            return '-';
    }
}

// Vérifier si l'utilisateur peut valider une livraison
function canValidateDelivery(delivery) {
    console.log('Vérification validation pour:', currentUser.username, 'ID:', currentUser.id);
    console.log('Directeurs assignés au compte:', window.currentAccountDirectors);
    console.log('Rôle utilisateur:', currentUser.role);
    
    // Le DG et Admin peuvent toujours valider
    if (currentUser.role === 'directeur_general' || currentUser.role === 'admin') {
        console.log('Utilisateur est DG/Admin, peut valider');
        return true;
    }
    
    // Les directeurs assignés peuvent valider si ils ne l'ont pas déjà fait
    // On vérifie dans la variable globale stockée lors du chargement des détails
    if (window.currentAccountDirectors && window.currentAccountDirectors.includes(currentUser.id)) {
        console.log('Utilisateur est dans les directeurs assignés, peut valider');
        return true;
    }
    
    console.log('Utilisateur ne peut pas valider');
    return false;
}

function displayDeliveries(deliveries) {
    const tbody = document.getElementById('deliveries-tbody');
    tbody.innerHTML = '';
    
    if (deliveries.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center;">Aucune livraison trouvée</td></tr>';
        return;
    }
    
    deliveries.forEach(delivery => {
        const validationStatus = delivery.validation_status || 'pending';
        let statusClass, statusText, statusDetails = '';
        
        switch (validationStatus) {
            case 'pending':
                statusClass = 'pending';
                statusText = 'En attente';
                break;
            case 'first_validated':
                statusClass = 'first-validated';
                statusText = 'Première validation';
                statusDetails = delivery.first_validated_by_name ? `<br><small>Par: ${delivery.first_validated_by_name}</small>` : '';
                break;
            case 'fully_validated':
                statusClass = 'validated';
                statusText = 'Validée définitivement';
                statusDetails = delivery.validated_by_name ? `<br><small>Par: ${delivery.validated_by_name}</small>` : '';
                break;
            case 'rejected':
                statusClass = 'rejected';
                statusText = 'Rejetée';
                statusDetails = delivery.rejected_by_name ? `<br><small>Par: ${delivery.rejected_by_name}</small>` : '';
                if (delivery.rejection_comment) {
                    statusDetails += `<br><small>Motif: ${delivery.rejection_comment}</small>`;
                }
                break;
        }
        
        const actionButtons = getDeliveryActionButtons(delivery);
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${formatDate(delivery.delivery_date)}</td>
            <td>${delivery.article_count}</td>
            <td>${delivery.unit_price ? formatCurrency(delivery.unit_price) + ' × ' + delivery.article_count : '-'}</td>
            <td>${formatCurrency(delivery.amount)}</td>
            <td>${delivery.description}</td>
            <td>${delivery.created_by_name}</td>
            <td>
                <span class="delivery-status ${statusClass}">${statusText}</span>
                ${statusDetails}
            </td>
            <td>${actionButtons}</td>
        `;
        tbody.appendChild(row);
    });
}

// Fermer les détails partenaire
function closePartnerDetails() {
    document.getElementById('partner-details').style.display = 'none';
    document.querySelector('.partner-summary').style.display = 'block';
    
    // Réinitialiser le formulaire
    document.getElementById('addDeliveryForm').reset();
    document.getElementById('delivery-date').value = new Date().toISOString().split('T')[0];
}

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
        
        // Afficher la section config pour les admins
        document.getElementById('partner-config').style.display = 'block';
    } catch (error) {
        console.error('Erreur chargement configuration partenaires:', error);
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
                            'pca': 'PCA'
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

// Event listeners pour le formulaire utilisateur
document.addEventListener('DOMContentLoaded', function() {
    // Setup mobile menu
    setupMobileMenu();
    
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
    // Masquer la section au départ
    const section = document.getElementById('transfert-section');
    if (section) section.classList.remove('active');
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
    console.log('[Transfert] Submit:', { sourceId, destId, montant });
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
    if (montant > solde) {
        notif.textContent = 'Le montant dépasse le solde disponible.';
        notif.className = 'notification error';
        notif.style.display = 'block';
        return;
    }
    
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
            body: JSON.stringify({ source_id: sourceId, destination_id: destId, montant })
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
            const dashboardSection = document.getElementById('dashboard-section');
            if (dashboardSection && dashboardSection.classList.contains('active') && typeof loadDashboard === 'function') {
                await loadDashboard();
            }
            
            // Mettre à jour la liste des comptes si affichée
            if (typeof loadAccounts === 'function') {
                const accountsSection = document.getElementById('manage-accounts-section');
                if (accountsSection && accountsSection.classList.contains('active')) {
                    await loadAccounts();
                }
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
    sourceSelect.innerHTML = '<option value="">Sélectionner un compte</option>';
    destSelect.innerHTML = '<option value="">Sélectionner un compte</option>';
    try {
        const resp = await fetch('/api/accounts');
        const accounts = await resp.json();
        console.log('[Transfert] Comptes reçus:', accounts);
        // Filtrer les comptes autorisés
        const allowedTypes = ['classique', 'statut', 'Ajustement'];
        const filtered = accounts.filter(acc => allowedTypes.includes(acc.account_type) && acc.is_active);
        filtered.forEach(acc => {
            const opt1 = document.createElement('option');
            opt1.value = acc.id;
            opt1.textContent = acc.account_name + ' (' + parseInt(acc.current_balance).toLocaleString() + ' FCFA)';
            opt1.dataset.solde = acc.current_balance;
            sourceSelect.appendChild(opt1);
            const opt2 = document.createElement('option');
            opt2.value = acc.id;
            opt2.textContent = acc.account_name + ' (' + parseInt(acc.current_balance).toLocaleString() + ' FCFA)';
            destSelect.appendChild(opt2);
            console.log('[Transfert] Option ajoutée:', acc.account_name, acc.current_balance);
        });
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
    } catch (e) {
        console.error('[Transfert] Erreur chargement comptes transfert:', e);
    }
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
async function loadDashboardData() {
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
            stats.account_breakdown.forEach(acc => {
                const name = (acc.account || '').toLowerCase();
                if (
                    name.includes('classique') ||
                    name.includes('statut') ||
                    name.includes('ajustement') ||
                    (!name.includes('partenaire') && !name.includes('fournisseur') && !name.includes('depot'))
                ) {
                    if (typeof acc.remaining !== 'undefined') {
                        solde += parseInt(acc.remaining) || 0;
                    } else if (typeof acc.current_balance !== 'undefined') {
                        solde += parseInt(acc.current_balance) || 0;
                    } else if (typeof acc.total_credited !== 'undefined' && typeof acc.spent !== 'undefined') {
                        solde += (parseInt(acc.total_credited) || 0) - (parseInt(acc.spent) || 0);
                    }
                }
            });
        }
        document.getElementById('solde-amount').textContent = formatCurrency(solde);
        
        // Créer les graphiques
        createChart('account-chart', stats.account_breakdown, 'account');
        createChart('category-chart', stats.category_breakdown, 'category');
        
        // Mettre à jour les cartes de statistiques
        await updateStatsCards(startDate, endDate);
        
        // Charger les données de stock
        await loadStockSummary();
        
        // Charger les données du stock vivant
        await loadStockVivantTotal();
        
    } catch (error) {
        console.error('Erreur chargement dashboard:', error);
    }
}

// Fonction pour charger le résumé du stock
async function loadStockSummary() {
    try {
        const response = await fetch(apiUrl('/api/dashboard/stock-summary'));
        const stockData = await response.json();
        
        const stockTotalElement = document.getElementById('stock-total');
        const stockDateElement = document.getElementById('stock-date');
        
        if (stockTotalElement && stockDateElement) {
            if (stockData.totalStock > 0) {
                stockTotalElement.textContent = stockData.totalStock.toLocaleString('fr-FR');
                stockDateElement.textContent = `(${stockData.formattedDate})`;
            } else {
                stockTotalElement.textContent = '0';
                stockDateElement.textContent = stockData.message || 'Aucune donnée';
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

// Fonction principale pour charger le dashboard
async function loadDashboard() {
    try {
        await loadDashboardData();
        await loadStockSummary();
        await loadStockVivantTotal(); // Ajouter le chargement du total stock vivant
        await loadTransfersCard(); // Ajouter le chargement des transferts
    } catch (error) {
        console.error('Erreur lors du chargement du dashboard:', error);
        showAlert('Erreur lors du chargement du dashboard', 'danger');
    }
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
            const selectedOption = this.options[this.selectedIndex];
            
            if (selectedOption.value) {
                const accountType = selectedOption.dataset.accountType;
                const balance = parseInt(selectedOption.dataset.balance).toLocaleString('fr-FR');
                
                let helpMessage = `Solde actuel: ${balance} FCFA`;
                
                if (accountType === 'statut') {
                    helpMessage += ' - ⚠️ Le crédit écrasera le solde existant';
                }
                
                helpText.textContent = helpMessage;
                helpText.style.display = 'block';
            } else {
                helpText.style.display = 'none';
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
            // Avertissement - proche de la limite de 48h pour les directeurs
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
    
    // Directeurs simples : vérifier s'ils ont créé ce crédit ET dans les 48h
    if (currentUser.role === 'directeur') {
        // Vérifier si c'est le directeur qui a créé ce crédit
        if (credit.credited_by !== currentUser.id) {
            return {
                allowed: false,
                reason: 'Vous ne pouvez supprimer que vos propres crédits'
            };
        }
        
        // Vérifier les 48h
        const creditDate = new Date(credit.created_at || credit.credit_date);
        const now = new Date();
        const hoursDifference = (now - creditDate) / (1000 * 60 * 60);
        
        if (hoursDifference > 48) {
            return {
                allowed: false,
                reason: `Suppression non autorisée - Plus de 48 heures écoulées (${Math.floor(hoursDifference)}h)`
            };
        }
        
        const remainingHours = 48 - hoursDifference;
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
        
        if (!accountId || !amount || !creditDate || !comment) {
            showDirectorCreditNotification('Veuillez remplir tous les champs', 'error');
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
        console.log('❌ CLIENT: Formulaire d\'upload non trouvé!');
    }

    // Boutons de contrôle
    const filterBtn = document.getElementById('filter-stock');
    if (filterBtn && !filterBtn.dataset.listenerAttached) {
        filterBtn.addEventListener('click', applyStockFilters);
        filterBtn.dataset.listenerAttached = 'true';
    }

    // Filtrage automatique lors du changement de date
    const dateFilter = document.getElementById('stock-date-filter');
    if (dateFilter && !dateFilter.dataset.listenerAttached) {
        dateFilter.addEventListener('change', () => {
            applyStockFilters();
        });
        dateFilter.dataset.listenerAttached = 'true';
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

    console.log('📅 Chargement des données stock...');
    console.log('📍 Point sélectionné:', pointFilter || 'Tous');

    let url = apiUrl('/api/stock-mata');
    const params = new URLSearchParams();

    // On ne filtre plus par date côté serveur, on le fait côté client
    if (pointFilter) {
        console.log('📍 Filtrage par point:', pointFilter);
        params.append('point_de_vente', pointFilter);
    }

    if (params.toString()) {
        url += '?' + params.toString();
    }

    console.log('🌐 URL finale:', url);

    try {
        const response = await fetch(url);
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
        return;
    }

    const filteredData = applyStockFilters(true);

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

function applyStockFilters(calledFromDisplay = false) {
    const dateFilter = document.getElementById('stock-date-filter').value;
    const pointFilter = document.getElementById('stock-point-filter').value;
    
    const filteredData = window.currentStockData.filter(item => {
        // Convertir la date de l'item en date locale pour comparaison
        const itemDate = new Date(item.date);
        const localDateStr = itemDate.toLocaleDateString('en-CA'); // Format YYYY-MM-DD en local
        
        const dateMatch = !dateFilter || localDateStr === dateFilter;
        const pointMatch = !pointFilter || item.point_de_vente === pointFilter;
        
        return dateMatch && pointMatch;
    });

    if (!calledFromDisplay) {
        displayStockData(filteredData);
    }
    
    return filteredData;
}

function resetStockFilters() {
    document.getElementById('stock-date-filter').value = '';
    document.getElementById('stock-point-filter').value = '';
    displayStockData(window.currentStockData);
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
                loadStockSummary() // Actualiser la carte du dashboard
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
        document.getElementById('stock-modal-form').reset();
        document.getElementById('stock-id').value = '';
    }
}

function closeStockModal() {
    const modal = document.getElementById('stock-modal');
    modal.style.display = 'none';
}

async function loadStockItemForEdit(stockId) {
    try {
        const response = await fetch(`/api/stock-mata/${stockId}`);
        if (!response.ok) {
            throw new Error('Impossible de charger les données de l\'entrée.');
        }
        const item = await response.json();
        document.getElementById('stock-id').value = item.id;
        document.getElementById('stock-date').value = new Date(item.date).toISOString().split('T')[0];
        document.getElementById('stock-point-de-vente').value = item.point_de_vente;
        document.getElementById('stock-produit').value = item.produit;
        document.getElementById('stock-matin').value = item.stock_matin;
        document.getElementById('stock-soir-input').value = item.stock_soir;
        document.getElementById('stock-transfert').value = item.transfert;
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
        const response = await fetch(`/api/stock-mata/${stockId}`, { method: 'DELETE' });
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

// La fonction calculateVenteTheorique a été supprimée car la colonne "Vente Théorique" n'est plus affichée

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
        const response = await fetch('/api/stock-mata/stats'); // Note: L'API pour cela n'est pas encore définie
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
    const container = document.getElementById('stock-notification');
    container.textContent = message;
    container.className = `notification ${type} show`;

    setTimeout(() => {
        container.classList.remove('show');
    }, 5000);
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
function setupStockVivantEventListeners() {
    // Configuration
    document.getElementById('view-config-btn')?.addEventListener('click', viewStockVivantConfig);
    document.getElementById('edit-config-btn')?.addEventListener('click', editStockVivantConfig);
    document.getElementById('save-config-btn')?.addEventListener('click', saveStockVivantConfig);
    document.getElementById('cancel-config-btn')?.addEventListener('click', cancelEditConfig);
    
    // Permissions
    document.getElementById('grant-permission-btn')?.addEventListener('click', grantStockVivantPermission);
    
    // Gestion des stocks
    document.getElementById('load-stock-vivant-btn')?.addEventListener('click', loadStockVivantForm);
    document.getElementById('save-stock-vivant-btn')?.addEventListener('click', saveStockVivantData);
    document.getElementById('cancel-stock-vivant-btn')?.addEventListener('click', cancelStockVivantEdit);
    
    // Consultation
    document.getElementById('load-view-stock-btn')?.addEventListener('click', loadViewStockVivant);
    
    console.log('✅ Event listeners stock vivant configurés');
}

async function viewStockVivantConfig() {
    const configContent = document.getElementById('config-content');
    const configEditor = document.getElementById('config-editor');
    
    configEditor.value = JSON.stringify(stockVivantConfig, null, 2);
    configEditor.readOnly = true;
    configContent.style.display = 'block';
    
    document.getElementById('save-config-btn').style.display = 'none';
    document.getElementById('cancel-config-btn').style.display = 'none';
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
        loadStockVivantDirectors();
        
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
        loadStockVivantDirectors();
        
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
    const selectedDate = document.getElementById('stock-vivant-date').value;
    const stockData = [];
    
    // Collecter toutes les données des tableaux
    const rows = document.querySelectorAll('#stock-vivant-tables tr[data-category]');
    
    rows.forEach(row => {
        const category = row.dataset.category;
        const product = row.dataset.product;
        const quantity = parseFloat(row.querySelector('.stock-quantity').value) || 0;
        const price = parseFloat(row.querySelector('.stock-price').value) || 0;
        const comment = row.querySelector('.stock-comment').value.trim();
        
        // Inclure seulement les entrées avec une quantité ou un prix > 0
        if (quantity > 0 || price > 0) {
            stockData.push({
                categorie: category,
                produit: product,
                quantite: quantity,
                prix_unitaire: price,
                commentaire: comment
            });
        }
    });
    
    if (stockData.length === 0) {
        showStockVivantNotification('Aucune donnée à sauvegarder', 'warning');
        return;
    }
    
    try {
        const response = await fetch(apiUrl('/api/stock-vivant/update'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                date_stock: selectedDate,
                stockData: stockData,
                replace_existing: false
            })
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            if (response.status === 409 && result.error === 'duplicate_data') {
                // Demander confirmation pour remplacer les données existantes
                if (confirm(`Des données existent déjà pour le ${formatDate(selectedDate)}. Voulez-vous les remplacer ?`)) {
                    await saveStockVivantDataForced(selectedDate, stockData);
                }
                return;
            }
            throw new Error(result.error || 'Erreur lors de la sauvegarde');
        }
        
        showStockVivantNotification(`Stock sauvegardé avec succès (${result.processedCount} entrées)`, 'success');
        cancelStockVivantEdit();
        loadStockVivantDates(); // Recharger les dates disponibles
        
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
        cancelStockVivantEdit();
        loadStockVivantDates();
        
    } catch (error) {
        console.error('Erreur remplacement stock vivant:', error);
        showStockVivantNotification('Erreur: ' + error.message, 'error');
    }
}

function cancelStockVivantEdit() {
    document.getElementById('stock-vivant-data-container').style.display = 'none';
    document.getElementById('stock-vivant-date').value = '';
    document.getElementById('copy-from-date').value = '';
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
    if (!stockVivantConfig || !stockVivantConfig.categories) {
        console.error('Configuration Stock Vivant invalide ou manquante.');
        showStockVivantNotification('Erreur: Configuration du stock non disponible.', 'error');
        return;
    }
    
    const container = document.getElementById('stock-vivant-simple-table');
    if (!container) {
        console.error('Conteneur #stock-vivant-simple-table non trouvé.');
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
                    
                    // Recharger les données après sauvegarde
                    await displaySimpleStockVivantTable();
                }
                return;
            }
            throw new Error(result.error || 'Erreur lors de la sauvegarde');
        }

        showStockVivantNotification(`Stock sauvegardé avec succès (${result.processedCount} entrées)`, 'success');
        
        // Recharger les données après sauvegarde
        await displaySimpleStockVivantTable();

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
    const totals = document.querySelectorAll('#stock-vivant-simple-table .stock-total');
    
    totals.forEach(totalSpan => {
        const total = parseFloat(totalSpan.textContent.replace(/[^\d.-]/g, '')) || 0;
        grandTotal += total;
    });
    
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
    const dateInput = document.getElementById('stock-vivant-date');
    if (dateInput) {
        dateInput.addEventListener('change', function() {
            console.log('📅 Date changée:', this.value);
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
        saveBtn.addEventListener('click', saveSimpleStockVivant);
    }
    
    const clearBtn = document.getElementById('clear-stock-btn');
    if (clearBtn) {
        clearBtn.addEventListener('click', clearSimpleStockVivant);
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
    
    // Load data based on mode
    switch(mode) {
        case 'saisie':
            console.log('📝 Mode saisie activé');
            await displaySimpleStockVivantTable();
            break;
        case 'consultation':
            console.log('👁️ Mode consultation activé');
            await loadStockVivantForConsultation();
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
    container.innerHTML = '<p class="info-text">Chargement des données...</p>';
    
    try {
        // Get selected date
        const dateInput = document.getElementById('stock-vivant-date');
        const selectedDate = dateInput ? dateInput.value : null;
        
        let existingData = [];
        
        // Load existing data for the selected date
        if (selectedDate) {
            try {
                const response = await fetch(apiUrl(`/api/stock-vivant?date=${selectedDate}`));
                if (response.ok) {
                    existingData = await response.json();
                    console.log('📊 Données existantes chargées:', existingData.length, 'entrées');
                }
            } catch (error) {
                console.warn('⚠️ Impossible de charger les données existantes:', error.message);
            }
        }
        
        // Generate table with existing data
        container.innerHTML = generateStockVivantTables(existingData);
        updateGrandTotal();
        
    } catch (error) {
        console.error('❌ Erreur lors de l\'affichage du tableau:', error);
        container.innerHTML = '<p class="info-text text-error">Erreur lors du chargement</p>';
    }
}

// Load stock vivant for consultation mode
async function loadStockVivantForConsultation() {
    const container = document.getElementById('stock-vivant-view-table');
    if (!container) return;
    
    try {
        const dateInput = document.getElementById('stock-vivant-date');
        const selectedDate = dateInput ? dateInput.value : null;
        
        if (!selectedDate) {
            container.innerHTML = '<p class="info-text">Veuillez sélectionner une date</p>';
            return;
        }
        
        const response = await fetch(`/api/stock-vivant?date=${selectedDate}`);
        const data = await response.json();
        
        if (data.length === 0) {
            container.innerHTML = '<p class="info-text">Aucune donnée pour cette date</p>';
            return;
        }
        
        displayStockVivantViewData(data);
        
    } catch (error) {
        console.error('Erreur chargement consultation:', error);
        container.innerHTML = '<p class="info-text text-error">Erreur lors du chargement</p>';
    }
}

// Reset stock filters
async function resetStockFilters() {
    console.log('🔄 CLIENT: Réinitialisation des filtres');
    
    // Reset date to today
    const dateInput = document.getElementById('stock-vivant-date');
    if (dateInput) {
        dateInput.value = new Date().toISOString().split('T')[0];
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
        const response = await fetch(`/api/stock-vivant?date=${selectedDate}`);
        const data = await response.json();
        
        const container = document.getElementById('stock-vivant-history-table');
        if (container) {
            if (data.length === 0) {
                container.innerHTML = '<p class="info-text">Aucune donnée pour cette date</p>';
            } else {
                displayStockVivantViewData(data);
            }
        }
        
    } catch (error) {
        console.error('Erreur chargement historique:', error);
        showStockVivantNotification('Erreur lors du chargement de l\'historique', 'error');
    }
}

// Initialize modern Stock Vivant interface
async function initializeModernStockVivant() {
    console.log('🎨 CLIENT: Initialisation interface Stock Vivant moderne');
    
    // Set default date to today
    const today = new Date().toISOString().split('T')[0];
    const dateInput = document.getElementById('stock-vivant-date');
    if (dateInput) {
        dateInput.value = today;
    }
    
    // Populate category filter
    populateStockVivantCategoryFilter();
    
    // Setup modern events
    setupModernStockVivantEvents();
    
    // Show default mode (saisie) only if config is loaded
    if (stockVivantConfig && stockVivantConfig.categories) {
        await showStockMode('saisie');
    } else {
        console.log('⏳ Configuration pas encore chargée, attente...');
        // Show loading message
        const container = document.getElementById('stock-vivant-simple-table');
        if (container) {
            container.innerHTML = '<p class="info-text">Chargement de la configuration...</p>';
        }
    }
    
    console.log('✅ CLIENT: Interface moderne initialisée');
}