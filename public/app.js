// État global de l'application
let currentUser = null;
let categories = [];
let users = [];

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
    
    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}

// Gestion de l'authentification
async function login(username, password) {
    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            currentUser = data.user;
            showNotification('Connexion réussie !', 'success');
            showApp();
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
        await fetch('/api/logout', { method: 'POST' });
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

function showApp() {
    document.getElementById('login-page').classList.remove('active');
    document.getElementById('app').classList.add('active');
    
    // Mettre à jour les informations utilisateur
    document.getElementById('user-name').textContent = currentUser.username;
    document.getElementById('user-role').textContent = currentUser.role.replace('_', ' ');
    
    // Afficher le menu admin si nécessaire
    if (currentUser.role === 'directeur_general' || currentUser.role === 'pca') {
        document.getElementById('admin-menu').style.display = 'block';
        document.getElementById('user-column').style.display = 'table-cell';
    }
}

function showSection(sectionName) {
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
            loadAccountsForCredit();
            loadCreditHistory();
            break;
        case 'add-expense':
            loadCategories();
            setDefaultDate();
            if (currentUser.role === 'directeur' || currentUser.role === 'directeur_general' || currentUser.role === 'pca') {
                loadAccountBalance();
                loadUserAccounts();
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
    
    if (currentUser.role === 'directeur_general' || currentUser.role === 'pca') {
        await loadUsers();
    }
    if (currentUser.role === 'directeur_general' || currentUser.role === 'pca' || currentUser.role === 'directeur') {
        await loadDashboard();
    }
    setDefaultDate();
}

async function loadCategories() {
    try {
        const response = await fetch('/api/categories');
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
    }
    
    // Valider le solde après calcul
    validateExpenseAmount();
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
                option.textContent = user.full_name;
                userSelect.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Erreur chargement utilisateurs:', error);
    }
}

// Dashboard
async function loadDashboard() {
    if (currentUser.role !== 'directeur_general' && currentUser.role !== 'pca' && currentUser.role !== 'directeur') {
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
        document.getElementById('daily-burn').textContent = formatCurrency(stats.daily_burn);
        document.getElementById('weekly-burn').textContent = formatCurrency(stats.weekly_burn);
        document.getElementById('monthly-burn').textContent = formatCurrency(stats.monthly_burn);
        
        // Créer les graphiques
        createChart('account-chart', stats.account_breakdown, 'account');
        createChart('category-chart', stats.category_breakdown, 'category');
        
    } catch (error) {
        console.error('Erreur chargement dashboard:', error);
    }
}

function createChart(containerId, data, type) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    
    if (!data || data.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #666;">Aucune donnée disponible</p>';
        return;
    }
    
    // Filtrer les données avec un montant > 0
    const filteredData = data.filter(item => item.amount > 0);
    
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
            const remaining = totalCredited - spent;
            
            row.innerHTML = `
                <td class="label-cell">${label}</td>
                <td class="amount-cell spent">
                    <span class="clickable-amount" onclick="showAccountExpenseDetails('${label}', ${spent})" 
                          style="cursor: pointer; color: #007bff; text-decoration: underline;" 
                          title="Cliquer pour voir les détails des dépenses">
                        ${formatCurrency(spent)}
                    </span>
                </td>
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
    
    const colSpan = currentUser.role !== 'directeur' ? '14' : '13';
    
    if (expenses.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${colSpan}" style="text-align: center;">Aucune dépense trouvée</td></tr>`;
        return;
    }
    
    expenses.forEach(expense => {
        const row = document.createElement('tr');
        row.className = 'expense-row';
        row.dataset.expenseId = expense.id;
        
        // Déterminer si c'est une dépense faite par le DG sur le compte d'un directeur
        const isDGExpenseOnDirectorAccount = currentUser.role === 'directeur' && 
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
        
        // Bouton pour modifier la dépense (seulement pour les dépenses propres du directeur)
        const editButton = (!isDGExpenseOnDirectorAccount || currentUser.role !== 'directeur') ? 
            `<button class="btn btn-sm btn-warning" onclick="openEditModal(${expense.id})" title="Modifier la dépense">
                <i class="fas fa-edit"></i>
            </button>` : 
            '<span style="color: #999;" title="Seul le Directeur Général peut modifier cette dépense"><i class="fas fa-lock"></i></span>';
        
        row.innerHTML = `
            <td>
                <input type="checkbox" class="expense-checkbox" data-expense-id="${expense.id}">
            </td>
            <td>${formatDate(expense.expense_date)}</td>
            <td title="${expense.category_name}">${expense.category_name.length > 30 ? expense.category_name.substring(0, 30) + '...' : expense.category_name}</td>
            <td>${expense.designation || '-'}</td>
            <td>${expense.supplier || '-'}</td>
            <td>${expense.quantity || '-'}</td>
            <td>${expense.unit_price ? formatCurrency(expense.unit_price) : '-'}</td>
            <td><strong>${formatCurrency(parseInt(expense.total || expense.amount))}</strong></td>
            <td>
                <span class="badge ${expense.predictable === 'oui' ? 'badge-success' : 'badge-warning'}">
                    ${expense.predictable === 'oui' ? 'Oui' : 'Non'}
                </span>
            </td>
            <td>${justificationButton}</td>
            <td>${expense.account_name || '-'}</td>
            <td>${expense.username || '-'}${isDGExpenseOnDirectorAccount ? ' <small style="color: #007bff;">(DG)</small>' : ''}</td>
            ${currentUser.role !== 'directeur' ? `<td>${expense.user_name}</td>` : ''}
            <td>${editButton}</td>
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

async function addExpense(formData) {
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
        const fullDescription = `${hierarchyDescription}\n${formData.description}`;
        
        // Préparer les données à envoyer
        const expenseData = {
            ...formData,
            description: fullDescription,
            expense_type: formData.expense_type,
            category: formData.category,
            subcategory: formData.subcategory,
            social_network_detail: socialNetworkSelect.value || null
        };
        
        const response = await fetch('/api/expenses', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(expenseData)
        });
        
        if (response.ok) {
            showNotification('Dépense ajoutée avec succès !', 'success');
            document.getElementById('expense-form').reset();
            setDefaultDate();
            // Réinitialiser les sélecteurs
            loadCategories();
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
        await loadAccountsForCredit();
        
    } catch (error) {
        console.error('Erreur chargement comptes:', error);
    }
}

function displayAccounts(accounts) {
    const accountsList = document.getElementById('accounts-list');
    
    if (accounts.length === 0) {
        accountsList.innerHTML = '<p>Aucun compte trouvé.</p>';
        return;
    }
    
    // Grouper les comptes par username pour un meilleur affichage
    const accountsByUser = {};
    accounts.forEach(account => {
        if (!accountsByUser[account.username]) {
            accountsByUser[account.username] = [];
        }
        accountsByUser[account.username].push(account);
    });
    
    let html = '';
    Object.keys(accountsByUser).forEach(username => {
        const userAccounts = accountsByUser[username];
        html += `<div class="user-accounts-group">
            <h4 class="user-group-title">${username} (${userAccounts.length} compte${userAccounts.length > 1 ? 's' : ''})</h4>`;
        
        userAccounts.forEach(account => {
            html += `
                <div class="account-card">
                    <div class="account-header">
                        <h5>${account.account_name}</h5>
                        <span class="account-status ${account.is_active ? 'active' : 'inactive'}">
                            ${account.is_active ? 'Actif' : 'Inactif'}
                        </span>
                    </div>
                    <div class="account-info">
                        <p><strong>Solde actuel:</strong> ${formatCurrency(account.current_balance)}</p>
                        <p><strong>Total crédité:</strong> ${formatCurrency(account.total_credited)}</p>
                        <p><strong>Dépensé / Total:</strong> ${formatCurrency(account.total_spent)} / ${formatCurrency(account.total_credited)}</p>
                        <p><strong>Créé le:</strong> ${formatDate(account.created_at)}</p>
                        ${account.created_by_name ? `<p><strong>Créé par:</strong> ${account.created_by_name}</p>` : ''}
                    </div>
                    ${account.is_active && (currentUser.role === 'directeur_general' || currentUser.role === 'pca') ? 
                        `<button class="btn btn-danger btn-sm" onclick="deactivateAccount(${account.id})">Désactiver</button>` : 
                        ''
                    }
                </div>
            `;
        });
        html += '</div>';
    });
    
    accountsList.innerHTML = html;
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
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">Aucun crédit trouvé</td></tr>';
        return;
    }
    
    credits.forEach(credit => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${formatDate(credit.created_at)}</td>
            <td>${credit.account_name}</td>
            <td>${formatCurrency(parseInt(credit.amount))}</td>
            <td>${credit.credited_by_name}</td>
            <td>${credit.description || 'N/A'}</td>
        `;
        tbody.appendChild(row);
    });
}

// Fonction pour charger le solde du compte (pour les directeurs)
async function loadAccountBalance() {
    if (currentUser.role !== 'directeur') return;
    
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
            document.getElementById('createAccountForm').reset();
            await loadAccounts();
            await loadUsersWithoutAccount();
            await loadAccountsForCredit();
            await loadCreditHistory();
        } else {
            const error = await response.json();
            throw new Error(error.error);
        }
    } catch (error) {
        showNotification(`Erreur: ${error.message}`, 'error');
    }
}

// Fonction pour charger les comptes pour le crédit
async function loadAccountsForCredit() {
    try {
        const response = await fetch('/api/accounts');
        const accounts = await response.json();
        
        const accountSelect = document.getElementById('creditAccountSelect');
        accountSelect.innerHTML = '<option value="">Sélectionner un compte</option>';
        
        accounts.forEach(account => {
            const option = document.createElement('option');
            option.value = account.id;
            option.textContent = account.account_name;
            accountSelect.appendChild(option);
        });
    } catch (error) {
        console.error('Erreur chargement comptes pour crédit:', error);
    }
}

// Utilitaires de date
function setDefaultDate() {
    const today = new Date().toISOString().split('T')[0];
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
        .then(user => {
            currentUser = user;
            showApp();
            loadInitialData();
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
    
    // Gestionnaire pour l'édition manuelle du total
    document.getElementById('expense-total').addEventListener('input', function() {
        // Marquer que l'utilisateur a modifié manuellement le total
        this.dataset.manuallyEdited = 'true';
        // Valider le solde après modification du montant
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
        validateExpenseAmount();
    });
    
    // Gestionnaire pour la validation des fichiers
    document.getElementById('expense-justification').addEventListener('change', function() {
        validateFile(this);
    });
    
    // Gestionnaire de formulaire de création de compte
    document.getElementById('createAccountForm').addEventListener('submit', function(e) {
        e.preventDefault();
        const formData = {
            user_id: parseInt(document.getElementById('createDirectorSelect').value),
            account_name: document.getElementById('accountName').value,
            initial_amount: parseInt(document.getElementById('initialAmount').value) || 0,
            description: document.getElementById('createDescription').value
        };
        createAccount(formData);
    });
    
    // Gestionnaire de formulaire de crédit de compte
    document.getElementById('creditAccountForm').addEventListener('submit', function(e) {
        e.preventDefault();
        const formData = {
            account_id: parseInt(document.getElementById('creditAccountSelect').value),
            amount: parseInt(document.getElementById('creditAmount').value),
            description: document.getElementById('creditDescription').value
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
});

async function creditAccount(formData) {
    try {
        const response = await fetch('/api/accounts/credit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });
        
        if (response.ok) {
            showNotification('Compte crédité avec succès !', 'success');
            document.getElementById('creditAccountForm').reset();
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

// Fonction pour charger les comptes de l'utilisateur connecté (pour les dépenses)
async function loadUserAccounts() {
    // Permettre aux directeurs, directeurs généraux et PCA de voir leurs comptes
    if (currentUser.role !== 'directeur' && currentUser.role !== 'directeur_general' && currentUser.role !== 'pca') {
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
        
        if (accounts.length === 0) {
            console.log('Aucun compte trouvé pour cet utilisateur');
            accountSelect.innerHTML += '<option value="" disabled>Aucun compte disponible</option>';
            return;
        }
        
        accounts.forEach(account => {
            console.log('Ajout du compte:', account.account_name, 'ID:', account.id);
            const option = document.createElement('option');
            option.value = account.id;
            option.textContent = account.account_name;
            accountSelect.appendChild(option);
        });
        
        console.log('Comptes chargés avec succès:', accounts.length, 'comptes');
    } catch (error) {
        console.error('Erreur chargement comptes utilisateur:', error);
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
        
        accounts.forEach(account => {
            const option = document.createElement('option');
            option.value = account.id;
            option.textContent = account.account_name;
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
async function showAccountExpenseDetails(accountName, totalAmount) {
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
        displayExpenseDetailsModal(data, totalAmount);
        
    } catch (error) {
        console.error('Erreur récupération détails dépenses:', error);
        showNotification('Erreur lors de la récupération des détails des dépenses', 'error');
    }
}

// Fonction pour afficher le modal avec les détails des dépenses
function displayExpenseDetailsModal(data, totalAmount) {
    // Créer le modal s'il n'existe pas
    let modal = document.getElementById('expense-details-modal');
    if (!modal) {
        modal = createExpenseDetailsModal();
        document.body.appendChild(modal);
    }
    
    // Populer le contenu du modal
    const modalContent = modal.querySelector('.expense-details-content');
    const expensesList = modal.querySelector('.expenses-list');
    
    // En-tête du modal
    modalContent.querySelector('.modal-header h3').textContent = `Détails des dépenses - ${data.account_name}`;
    modalContent.querySelector('.period-info').textContent = `Période: ${formatDate(data.period.start_date)} - ${formatDate(data.period.end_date)}`;
    modalContent.querySelector('.total-amount').textContent = `Total: ${formatCurrency(totalAmount)}`;
    
    // Liste des dépenses
    expensesList.innerHTML = '';
    
    if (data.expenses.length === 0) {
        expensesList.innerHTML = '<p style="text-align: center; color: #666;">Aucune dépense trouvée pour cette période.</p>';
    } else {
        data.expenses.forEach(expense => {
            const expenseCard = createExpenseCard(expense);
            expensesList.appendChild(expenseCard);
        });
    }
    
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
            margin: 2% auto;
            padding: 0;
            border: none;
            border-radius: 8px;
            width: 90%;
            max-width: 1000px;
            max-height: 90vh;
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
                max-height: calc(90vh - 150px);
                overflow-y: auto;
            ">
                <div class="expenses-list"></div>
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
    
    return modal;
}

// Fonction pour créer une carte de dépense
function createExpenseCard(expense) {
    const card = document.createElement('div');
    card.style.cssText = `
        background: #f8f9fa;
        border: 1px solid #e9ecef;
        border-radius: 8px;
        padding: 15px;
        margin-bottom: 15px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    `;
    
    // Déterminer si c'est une dépense du DG
    const isDGExpense = currentUser.role === 'directeur' && expense.username !== currentUser.username;
    const cardStyle = isDGExpense ? 'font-style: italic; opacity: 0.8;' : '';
    
    card.innerHTML = `
        <div style="${cardStyle}">
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 10px;">
                <div>
                    <h4 style="margin: 0; color: #333; font-size: 1.1rem;">
                        ${expense.designation || 'Sans désignation'}
                        ${isDGExpense ? '<span style="color: #007bff; font-size: 0.8rem; margin-left: 8px;">(DG)</span>' : ''}
                    </h4>
                    <p style="margin: 2px 0; color: #666; font-size: 0.9rem;">
                        <strong>Date:</strong> ${formatDate(expense.expense_date)}
                    </p>
                </div>
                <div style="text-align: right;">
                    <div style="font-size: 1.2rem; font-weight: bold; color: #e74c3c;">
                        ${formatCurrency(expense.total)}
                    </div>
                </div>
            </div>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px;">
                <div>
                    <strong>Type:</strong> ${expense.expense_type || 'N/A'}<br>
                    <strong>Catégorie:</strong> ${expense.category || 'N/A'}<br>
                    <strong>Sous-catégorie:</strong> ${expense.subcategory || 'N/A'}
                    ${expense.social_network_detail ? `<br><strong>Réseau:</strong> ${expense.social_network_detail}` : ''}
                </div>
                <div>
                    <strong>Fournisseur:</strong> ${expense.supplier || 'N/A'}<br>
                    <strong>Quantité:</strong> ${expense.quantity || 'N/A'}<br>
                    <strong>Prix unitaire:</strong> ${expense.unit_price ? formatCurrency(expense.unit_price) : 'N/A'}
                </div>
            </div>
            
            <div style="border-top: 1px solid #dee2e6; padding-top: 10px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span><strong>Dépense effectuée par:</strong> ${expense.username}</span>
                    <span class="badge ${expense.predictable === 'oui' ? 'badge-success' : 'badge-warning'}" 
                          style="padding: 4px 8px; border-radius: 4px; font-size: 0.8rem; 
                                 background-color: ${expense.predictable === 'oui' ? '#28a745' : '#ffc107'}; 
                                 color: ${expense.predictable === 'oui' ? 'white' : 'black'};">
                        Prévisible: ${expense.predictable === 'oui' ? 'Oui' : 'Non'}
                    </span>
                </div>
            </div>
        </div>
    `;
    
    return card;
} 