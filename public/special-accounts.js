// ========================================
// 🔹 COMPTES SPECIAL - JavaScript
// ========================================

// Variables globales pour stocker les comptes et filtres
let specialAccountsData = [];
let specialFilters = {
    dateStart: null,
    dateEnd: null
};
const ITEMS_PER_PAGE = 50;

// Charger et afficher les comptes special
async function loadSpecialAccounts() {
    const container = document.getElementById('special-accounts-container');
    const loading = document.getElementById('special-accounts-loading');
    const empty = document.getElementById('special-accounts-empty');
    const select = document.getElementById('special-account-select');
    const addBtn = document.getElementById('add-special-expense-btn');
    
    try {
        console.log('🔹 Chargement des comptes special...');
        
        // Afficher le loading
        if (loading) loading.style.display = 'block';
        if (empty) empty.style.display = 'none';
        if (container) container.innerHTML = '';
        
        const response = await fetch('/api/special-accounts');
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.message || 'Erreur inconnue');
        }
        
        // Cacher le loading maintenant que les données sont arrivées
        loading.style.display = 'none';
        
        if (data.accounts.length === 0) {
            empty.style.display = 'block';
            container.innerHTML = '';
            if (addBtn) addBtn.disabled = true;
            return;
        }
        
        empty.style.display = 'none';
        
        // Stocker les données globalement
        specialAccountsData = data.accounts;
        
        // Remplir le dropdown
        if (select) {
            select.innerHTML = '<option value="all">Tous les comptes</option>';
            data.accounts.forEach(acc => {
                const option = document.createElement('option');
                option.value = acc.id;
                option.textContent = acc.account_name;
                select.appendChild(option);
            });
            
            // Activer le bouton si un compte est sélectionné
            select.addEventListener('change', function() {
                if (addBtn) {
                    addBtn.disabled = this.value === 'all';
                }
                filterSpecialAccounts(this.value);
            });
        }
        
        if (addBtn) {
            addBtn.disabled = true; // Désactivé par défaut
        }
        
        // Afficher tous les comptes par défaut
        renderSpecialAccounts(data.accounts);
        
        console.log(`🔹 ${data.accounts.length} comptes special affichés`);
        
    } catch (error) {
        console.error('❌ Erreur chargement comptes special:', error);
        
        // Cacher le loading en cas d'erreur
        if (loading) loading.style.display = 'none';
        if (empty) {
            empty.style.display = 'block';
            empty.innerHTML = '<i class="fas fa-exclamation-triangle" style="font-size: 48px; color: #e74c3c;"></i><p style="margin-top: 10px; color: #e74c3c;">Erreur lors du chargement: ' + error.message + '</p>';
        }
        
        showNotification('Erreur lors du chargement des comptes special: ' + error.message, 'error');
    }
}

// Afficher un onglet spécifique (tous, crédits, dépenses)
function showSpecialTab(accountId, tab, event) {
    // Changer l'onglet actif
    const card = document.querySelector(`#special-movements-${accountId}`).closest('.special-account-card');
    const buttons = card.querySelectorAll('.special-tab-btn');
    buttons.forEach(btn => btn.classList.remove('active'));
    event.target.closest('.special-tab-btn').classList.add('active');
    
    // Récupérer les données du dataset
    const movementsContainer = document.getElementById(`special-movements-${accountId}`);
    let movements;
    
    switch(tab) {
        case 'all':
            movements = JSON.parse(movementsContainer.dataset.all);
            break;
        case 'credits':
            movements = JSON.parse(movementsContainer.dataset.credits).map(c => ({...c, type: c.type || 'credit', date: c.created_at}));
            break;
        case 'expenses':
            movements = JSON.parse(movementsContainer.dataset.expenses).map(e => ({...e, type: 'expense', date: e.expense_date}));
            break;
        default:
            movements = JSON.parse(movementsContainer.dataset.all);
    }
    
    // Mettre à jour l'affichage
    movementsContainer.innerHTML = renderSpecialMovements(movements);
}

// Rendre les mouvements
function renderSpecialMovements(movements, accountId, page = 1) {
    // Filtrer par date
    const filteredMovements = filterMovementsByDate(movements);
    
    if (filteredMovements.length === 0) {
        return '<div class="special-empty-state"><i class="fas fa-inbox" style="font-size: 32px; margin-bottom: 10px;"></i><p>Aucun mouvement pour cette période</p></div>';
    }
    
    // Paginer
    const paginated = paginateMovements(filteredMovements, page);
    
    const movementsHtml = paginated.movements.map(movement => {
        let icon, amountClass, amountPrefix, description, details;
        
        if (movement.type === 'credit' || movement.type === 'special_credit' || movement.type === 'normal' || movement.type === 'special') {
            icon = '<i class="fas fa-plus-circle"></i>';
            amountClass = 'special-movement-credit';
            amountPrefix = '+';
            description = movement.description || movement.comment || 'Crédit';
            details = movement.credited_by_name ? `Par ${movement.credited_by_name}` : '';
        } else {
            icon = '<i class="fas fa-minus-circle"></i>';
            amountClass = 'special-movement-expense';
            amountPrefix = '-';
            description = movement.designation;
            details = movement.supplier ? `Fournisseur: ${movement.supplier}` : '';
            if (movement.category) {
                details += details ? ` | ${movement.category}` : movement.category;
            }
        }
        
        const date = new Date(movement.date).toLocaleDateString('fr-FR', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
        
        const actionButtons = movement.type === 'expense' ? `
            <div class="special-movement-actions">
                <button class="btn-icon" onclick="viewSpecialExpenseDetails(${movement.id})" title="Voir détails">
                    <i class="fas fa-eye"></i>
                </button>
                <button class="btn-icon" onclick="editSpecialExpense(${movement.id})" title="Modifier">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn-icon btn-danger" onclick="deleteSpecialExpense(${movement.id})" title="Supprimer">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        ` : '';
        
        return `
            <div class="special-movement-item" data-movement-id="${movement.id}" data-movement-type="${movement.type}">
                <div class="special-movement-info">
                    <div class="special-movement-date">${icon} ${date}</div>
                    <div class="special-movement-desc">${description}${details ? ` <span class="special-movement-details">${details}</span>` : ''}</div>
                </div>
                <div class="special-movement-right">
                    <div class="special-movement-amount ${amountClass}">
                        ${amountPrefix}${formatCurrency(movement.amount)}
                    </div>
                    ${actionButtons}
                </div>
            </div>
        `;
    }).join('');
    
    // Ajouter la pagination
    let paginationHtml = '';
    if (paginated.totalPages > 1) {
        paginationHtml = `
            <div class="pagination-container">
                <div class="pagination-info">
                    Affichage ${(paginated.currentPage - 1) * ITEMS_PER_PAGE + 1} - ${Math.min(paginated.currentPage * ITEMS_PER_PAGE, paginated.totalItems)} sur ${paginated.totalItems} mouvements
                </div>
                <div class="pagination-buttons">
                    ${paginated.currentPage > 1 ? `<button class="btn-pagination" onclick="renderMovementsPage(${accountId}, ${paginated.currentPage - 1})"><i class="fas fa-chevron-left"></i></button>` : ''}
                    ${Array.from({length: paginated.totalPages}, (_, i) => i + 1).map(p => 
                        `<button class="btn-pagination ${p === paginated.currentPage ? 'active' : ''}" onclick="renderMovementsPage(${accountId}, ${p})">${p}</button>`
                    ).join('')}
                    ${paginated.currentPage < paginated.totalPages ? `<button class="btn-pagination" onclick="renderMovementsPage(${accountId}, ${paginated.currentPage + 1})"><i class="fas fa-chevron-right"></i></button>` : ''}
                </div>
            </div>
        `;
    }
    
    return movementsHtml + paginationHtml;
}

// Fonction pour afficher les comptes
function renderSpecialAccounts(accounts) {
    const container = document.getElementById('special-accounts-container');
    if (!container) return;
    
    container.innerHTML = accounts.map(account => {
        const allMovements = [
            ...account.credits.map(c => ({...c, type: 'credit', date: c.created_at})),
            ...account.special_credits.map(c => ({...c, type: 'special_credit', date: c.created_at})),
            ...account.expenses.map(e => ({...e, type: 'expense', date: e.expense_date}))
        ].sort((a, b) => new Date(b.date) - new Date(a.date));
        
        return `
            <div class="special-account-card" data-account-id="${account.id}">
                <div class="special-account-header">
                    <div class="special-account-title">
                        <i class="fas fa-gem"></i>
                        ${account.account_name}
                    </div>
                    <div class="special-account-balance">
                        <div class="special-balance-label">Solde Actuel</div>
                        <div class="special-balance-amount">${formatCurrency(account.current_balance)}</div>
                    </div>
                </div>
                
                <div class="special-account-stats">
                    <div class="special-stat-box">
                        <div class="special-stat-label">Total Crédité</div>
                        <div class="special-stat-value">${formatCurrency(account.total_credited)}</div>
                    </div>
                    <div class="special-stat-box">
                        <div class="special-stat-label">Total Dépensé</div>
                        <div class="special-stat-value">${formatCurrency(account.total_spent)}</div>
                    </div>
                    <div class="special-stat-box">
                        <div class="special-stat-label">Mouvements</div>
                        <div class="special-stat-value">${allMovements.length}</div>
                    </div>
                </div>
                
                <div class="special-account-tabs">
                    <button class="special-tab-btn active" onclick="showSpecialTab(${account.id}, 'all', event)">
                        <i class="fas fa-list"></i> Tous
                    </button>
                    <button class="special-tab-btn" onclick="showSpecialTab(${account.id}, 'credits', event)">
                        <i class="fas fa-plus-circle"></i> Crédits (${account.credits.length + account.special_credits.length})
                    </button>
                    <button class="special-tab-btn" onclick="showSpecialTab(${account.id}, 'expenses', event)">
                        <i class="fas fa-minus-circle"></i> Dépenses (${account.expenses.length})
                    </button>
                </div>
                
                <div class="special-movements-list" id="special-movements-${account.id}" data-account-id="${account.id}" data-all='${JSON.stringify(allMovements)}' data-credits='${JSON.stringify([...account.credits, ...account.special_credits])}' data-expenses='${JSON.stringify(account.expenses)}'>
                    ${renderSpecialMovements(allMovements, account.id)}
                </div>
            </div>
        `;
    }).join('');
}

// Fonction pour filtrer les comptes par ID
function filterSpecialAccounts(accountId) {
    if (accountId === 'all') {
        renderSpecialAccounts(specialAccountsData);
    } else {
        const filtered = specialAccountsData.filter(acc => acc.id == accountId);
        renderSpecialAccounts(filtered);
    }
}

// Voir les détails d'une dépense
function viewSpecialExpenseDetails(expenseId) {
    console.log('🔹 Voir détails dépense:', expenseId);
    
    // Trouver la dépense dans les données
    let expense = null;
    for (const account of specialAccountsData) {
        expense = account.expenses.find(e => e.id === expenseId);
        if (expense) break;
    }
    
    if (!expense) {
        showNotification('Dépense non trouvée', 'error');
        return;
    }
    
    const modal = document.getElementById('special-expense-details-modal');
    const content = document.getElementById('special-expense-details-content');
    
    content.innerHTML = `
        <div class="expense-details">
            <div class="detail-row">
                <label>Date:</label>
                <span>${new Date(expense.expense_date).toLocaleDateString('fr-FR')}</span>
            </div>
            <div class="detail-row">
                <label>Catégorie:</label>
                <span>${expense.category || '-'}</span>
            </div>
            <div class="detail-row">
                <label>Désignation:</label>
                <span>${expense.designation}</span>
            </div>
            <div class="detail-row">
                <label>Fournisseur:</label>
                <span>${expense.supplier || '-'}</span>
            </div>
            <div class="detail-row">
                <label>Quantité:</label>
                <span>${expense.quantity || '-'}</span>
            </div>
            <div class="detail-row">
                <label>Prix Unitaire:</label>
                <span>${expense.unit_price ? formatCurrency(expense.unit_price) : '-'}</span>
            </div>
            <div class="detail-row highlight">
                <label>Montant Total:</label>
                <span class="amount">${formatCurrency(expense.amount)}</span>
            </div>
            <div class="detail-row">
                <label>Description:</label>
                <span>${expense.description || '-'}</span>
            </div>
            <div class="detail-row">
                <label>Utilisateur:</label>
                <span>${expense.user_name} (${expense.username})</span>
            </div>
        </div>
    `;
    
    modal.style.display = 'flex';
}

function closeSpecialExpenseDetailsModal() {
    const modal = document.getElementById('special-expense-details-modal');
    modal.style.display = 'none';
}

// Modifier une dépense
async function editSpecialExpense(expenseId) {
    console.log('🔹 Modifier dépense:', expenseId);
    
    // Trouver la dépense dans les données
    let expense = null;
    let accountId = null;
    for (const account of specialAccountsData) {
        expense = account.expenses.find(e => e.id === expenseId);
        if (expense) {
            accountId = account.id;
            break;
        }
    }
    
    if (!expense) {
        showNotification('Dépense non trouvée', 'error');
        return;
    }
    
    // Charger les catégories
    await loadCategoriesForSpecialExpense();
    
    // Remplir le formulaire
    document.getElementById('special-expense-form-title').textContent = 'Modifier la dépense';
    document.getElementById('special-expense-id').value = expense.id;
    document.getElementById('special-expense-account-id').value = accountId;
    document.getElementById('special-expense-date').value = expense.expense_date;
    
    // Pré-remplir la catégorie existante
    // Note: la BD stocke la catégorie hiérarchique (ex: "Carburant > Essence")
    // On laisse l'utilisateur sélectionner à nouveau via les dropdowns
    const categoryParts = (expense.category || '').split(' > ');
    if (categoryParts.length > 0) {
        // Essayer de retrouver la catégorie dans le config
        const mlcType = window.specialCategoriesConfig?.types?.[0];
        if (mlcType) {
            const cat = mlcType.categories.find(c => c.name === categoryParts[0]);
            if (cat) {
                document.getElementById('special-expense-category').value = cat.id;
                // Charger les sous-catégories si applicable
                if (categoryParts.length > 1) {
                    loadSpecialSubcategoriesByCategory(cat.id);
                    // Attendre un peu pour que les options se chargent
                    setTimeout(() => {
                        const subcat = cat.subcategories?.find(sc => sc.name === categoryParts[1]);
                        if (subcat) {
                            document.getElementById('special-expense-subcategory').value = subcat.id;
                        }
                    }, 100);
                }
            }
        }
    }
    
    document.getElementById('special-expense-designation').value = expense.designation;
    document.getElementById('special-expense-supplier').value = expense.supplier || '';
    document.getElementById('special-expense-quantity').value = expense.quantity || '';
    document.getElementById('special-expense-unit-price').value = expense.unit_price || '';
    document.getElementById('special-expense-amount').value = expense.amount;
    document.getElementById('special-expense-description').value = expense.description || '';
    
    const modal = document.getElementById('special-expense-form-modal');
    modal.style.display = 'flex';
}

// Ouvrir le modal pour créer une dépense
async function openCreateSpecialExpenseModal() {
    console.log('🔹 Ouverture modal création dépense');
    const select = document.getElementById('special-account-select');
    const accountId = select.value;
    
    console.log('🔹 Compte sélectionné:', accountId);
    
    if (!accountId || accountId === 'all') {
        showNotification('Veuillez sélectionner un compte', 'error');
        return;
    }
    
    // Charger les catégories
    await loadCategoriesForSpecialExpense();
    
    // Réinitialiser le formulaire
    document.getElementById('special-expense-form-title').textContent = 'Créer une dépense';
    document.getElementById('special-expense-form').reset();
    document.getElementById('special-expense-id').value = '';
    document.getElementById('special-expense-account-id').value = accountId;
    document.getElementById('special-expense-date').value = new Date().toISOString().split('T')[0];
    
    const modal = document.getElementById('special-expense-form-modal');
    modal.style.display = 'flex';
}

function closeSpecialExpenseFormModal() {
    const modal = document.getElementById('special-expense-form-modal');
    modal.style.display = 'none';
}

// Charger les catégories pour le formulaire
async function loadCategoriesForSpecialExpense() {
    try {
        // Charger les catégories spécifiques pour les comptes spéciaux
        const response = await fetch('/special-categories.json');
        const categoriesData = await response.json();
        
        // Stocker les données globalement pour les comptes spéciaux
        window.specialCategoriesConfig = categoriesData;
        
        // Charger les catégories (pas de types multiples, juste MLC)
        const categorySelect = document.getElementById('special-expense-category');
        categorySelect.innerHTML = '<option value="">Sélectionner une catégorie</option>';
        categorySelect.disabled = false;
        
        if (categoriesData.types && categoriesData.types.length > 0) {
            const mlcType = categoriesData.types[0]; // Type MLC
            if (mlcType.categories) {
                mlcType.categories.forEach(category => {
                    const option = document.createElement('option');
                    option.value = category.id;
                    option.textContent = category.name;
                    categorySelect.appendChild(option);
                });
            }
        }
    } catch (error) {
        console.error('\u274c Erreur chargement catégories:', error);
        showNotification('Erreur lors du chargement des catégories', 'error');
    }
}

// Charger les catégories en fonction du type pour les comptes spéciaux
function loadSpecialCategoriesByType(typeId) {
    const categorySelect = document.getElementById('special-expense-category');
    const subcategorySelect = document.getElementById('special-expense-subcategory');
    
    // Réinitialiser
    categorySelect.innerHTML = '<option value="">Sélectionner une catégorie</option>';
    subcategorySelect.innerHTML = '<option value="">Sélectionner d\'abord une catégorie</option>';
    subcategorySelect.disabled = true;
    
    if (!typeId || !window.specialCategoriesConfig) {
        categorySelect.disabled = true;
        return;
    }
    
    const selectedType = window.specialCategoriesConfig.types.find(type => type.id === typeId);
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

// Charger les sous-catégories pour les comptes spéciaux
function loadSpecialSubcategoriesByCategory(typeId, categoryId) {
    const subcategorySelect = document.getElementById('special-expense-subcategory');
    
    subcategorySelect.innerHTML = '<option value="">Sélectionner une sous-catégorie</option>';
    
    if (!typeId || !categoryId || !window.specialCategoriesConfig) {
        subcategorySelect.disabled = true;
        return;
    }
    
    const selectedType = window.specialCategoriesConfig.types.find(type => type.id === typeId);
    if (!selectedType) return;
    
    subcategorySelect.disabled = false;
    
    // Pour les types avec sous-catégories communes
    if (selectedType.subcategories) {
        selectedType.subcategories.forEach(subcategory => {
            const option = document.createElement('option');
            option.value = subcategory.id;
            option.textContent = subcategory.name;
            subcategorySelect.appendChild(option);
        });
    }
    // Pour les types avec sous-catégories spécifiques
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

// Supprimer une dépense
async function deleteSpecialExpense(expenseId) {
    console.log('🔹 Supprimer dépense:', expenseId);
    
    if (!confirm('\u00cates-vous s\u00fbr de vouloir supprimer cette d\u00e9pense ?')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/special-accounts/expenses/${expenseId}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('D\u00e9pense supprim\u00e9e avec succ\u00e8s', 'success');
            // Recharger les comptes
            await loadSpecialAccounts();
        } else {
            showNotification(data.message || 'Erreur lors de la suppression', 'error');
        }
    } catch (error) {
        console.error('\u274c Erreur suppression:', error);
        showNotification('Erreur lors de la suppression: ' + error.message, 'error');
    }
}

// Gestionnaire de soumission du formulaire
async function handleSpecialExpenseFormSubmit(event) {
    event.preventDefault();
    
    const form = event.target;
    const expenseId = document.getElementById('special-expense-id').value;
    const isEdit = expenseId !== '';
    
    // Construire la catégorie hiérarchique
    const categorySelect = document.getElementById('special-expense-category');
    const subcategorySelect = document.getElementById('special-expense-subcategory');
    
    let categoryFull = '';
    if (categorySelect.selectedOptions[0] && categorySelect.selectedOptions[0].text !== 'Sélectionner une catégorie') {
        categoryFull = categorySelect.selectedOptions[0].text;
        if (subcategorySelect.selectedOptions[0] && subcategorySelect.selectedOptions[0].text !== 'Sélectionner une sous-catégorie' && subcategorySelect.selectedOptions[0].text !== "Sélectionner d'abord une catégorie") {
            categoryFull += ' > ' + subcategorySelect.selectedOptions[0].text;
        }
    }
    
    const formData = {
        account_id: document.getElementById('special-expense-account-id').value,
        expense_date: document.getElementById('special-expense-date').value,
        category: categoryFull,
        designation: document.getElementById('special-expense-designation').value,
        supplier: document.getElementById('special-expense-supplier').value,
        quantity: parseFloat(document.getElementById('special-expense-quantity').value) || null,
        unit_price: parseFloat(document.getElementById('special-expense-unit-price').value) || null,
        amount: parseFloat(document.getElementById('special-expense-amount').value),
        description: document.getElementById('special-expense-description').value
    };
    
    try {
        const url = isEdit 
            ? `/api/special-accounts/expenses/${expenseId}`
            : '/api/special-accounts/expenses';
        const method = isEdit ? 'PUT' : 'POST';
        
        const response = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification(data.message, 'success');
            closeSpecialExpenseFormModal();
            // Recharger les comptes
            await loadSpecialAccounts();
        } else {
            showNotification(data.message || 'Erreur lors de l\'enregistrement', 'error');
        }
    } catch (error) {
        console.error('\u274c Erreur enregistrement:', error);
        showNotification('Erreur lors de l\'enregistrement: ' + error.message, 'error');
    }
}

// Initialiser les filtres de date
function initializeSpecialFilters() {
    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    
    const dateStartInput = document.getElementById('special-date-start');
    const dateEndInput = document.getElementById('special-date-end');
    
    if (dateStartInput) {
        // Utiliser la date locale pour éviter les problèmes de timezone
        const year = firstDayOfMonth.getFullYear();
        const month = String(firstDayOfMonth.getMonth() + 1).padStart(2, '0');
        const day = '01';
        dateStartInput.value = `${year}-${month}-${day}`;
        specialFilters.dateStart = new Date(year, firstDayOfMonth.getMonth(), 1);
    }
    
    if (dateEndInput) {
        // Utiliser la date locale pour éviter les problèmes de timezone
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        dateEndInput.value = `${year}-${month}-${day}`;
        specialFilters.dateEnd = new Date(year, today.getMonth(), today.getDate());
    }
}

// Filtrer les mouvements par date
function filterMovementsByDate(movements) {
    if (!specialFilters.dateStart && !specialFilters.dateEnd) {
        return movements;
    }
    
    return movements.filter(movement => {
        const movementDate = new Date(movement.date);
        
        if (specialFilters.dateStart && movementDate < specialFilters.dateStart) {
            return false;
        }
        
        if (specialFilters.dateEnd) {
            const endOfDay = new Date(specialFilters.dateEnd);
            endOfDay.setHours(23, 59, 59, 999);
            if (movementDate > endOfDay) {
                return false;
            }
        }
        
        return true;
    });
}

// Paginer les mouvements
function paginateMovements(movements, page = 1) {
    const startIndex = (page - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    return {
        movements: movements.slice(startIndex, endIndex),
        totalPages: Math.ceil(movements.length / ITEMS_PER_PAGE),
        currentPage: page,
        totalItems: movements.length
    };
}

// Appliquer les filtres
function applySpecialFilters() {
    const dateStartInput = document.getElementById('special-date-start');
    const dateEndInput = document.getElementById('special-date-end');
    
    specialFilters.dateStart = dateStartInput.value ? new Date(dateStartInput.value) : null;
    specialFilters.dateEnd = dateEndInput.value ? new Date(dateEndInput.value) : null;
    
    // Réafficher les comptes avec les nouveaux filtres
    const select = document.getElementById('special-account-select');
    if (select.value === 'all') {
        renderSpecialAccounts(specialAccountsData);
    } else {
        filterSpecialAccounts(select.value);
    }
}

// Réinitialiser les filtres
function resetSpecialFilters() {
    initializeSpecialFilters();
    applySpecialFilters();
}

// Initialisation au chargement
document.addEventListener('DOMContentLoaded', function() {
    // Initialiser les filtres de date
    initializeSpecialFilters();
    // Attacher le gestionnaire au formulaire
    const form = document.getElementById('special-expense-form');
    if (form) {
        form.addEventListener('submit', handleSpecialExpenseFormSubmit);
    }
    
    // Attacher le gestionnaire au bouton cr\u00e9er d\u00e9pense
    const addBtn = document.getElementById('add-special-expense-btn');
    if (addBtn) {
        addBtn.addEventListener('click', openCreateSpecialExpenseModal);
    }
    
    // Fermer les modals en cliquant en dehors
    const modals = ['special-expense-details-modal', 'special-expense-form-modal'];
    modals.forEach(modalId => {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.addEventListener('click', function(e) {
                if (e.target === modal) {
                    modal.style.display = 'none';
                }
            });
        }
    });
    
    // Calculer automatiquement le montant total
    const quantityInput = document.getElementById('special-expense-quantity');
    const unitPriceInput = document.getElementById('special-expense-unit-price');
    const amountInput = document.getElementById('special-expense-amount');
    
    function calculateTotal() {
        const quantity = parseFloat(quantityInput.value) || 0;
        const unitPrice = parseFloat(unitPriceInput.value) || 0;
        if (quantity > 0 && unitPrice > 0) {
            amountInput.value = (quantity * unitPrice).toFixed(2);
        }
    }
    
    if (quantityInput && unitPriceInput) {
        quantityInput.addEventListener('input', calculateTotal);
        unitPriceInput.addEventListener('input', calculateTotal);
    }
    
    // Gestionnaires pour Catégorie / Sous-catégorie (pas de Type)
    const categorySelect = document.getElementById('special-expense-category');
    
    if (categorySelect) {
        categorySelect.addEventListener('change', function() {
            loadSpecialSubcategoriesByCategory(this.value);
        });
    }
    
    // Event listeners pour les filtres
    const applyFiltersBtn = document.getElementById('apply-special-filters-btn');
    const resetFiltersBtn = document.getElementById('reset-special-filters-btn');
    
    if (applyFiltersBtn) {
        applyFiltersBtn.addEventListener('click', applySpecialFilters);
    }
    
    if (resetFiltersBtn) {
        resetFiltersBtn.addEventListener('click', resetSpecialFilters);
    }
});

// Changer de page pour un compte
function renderMovementsPage(accountId, page) {
    const movementsContainer = document.getElementById(`special-movements-${accountId}`);
    if (!movementsContainer) return;
    
    const allMovements = JSON.parse(movementsContainer.dataset.all);
    movementsContainer.innerHTML = renderSpecialMovements(allMovements, accountId, page);
}

// Charger les sous-catégories en fonction de la catégorie sélectionnée
function loadSpecialSubcategoriesByCategory(categoryId) {
    const subcategorySelect = document.getElementById('special-expense-subcategory');
    
    subcategorySelect.innerHTML = '<option value="">Sélectionner une sous-catégorie</option>';
    
    if (!categoryId || !window.specialCategoriesConfig) {
        subcategorySelect.disabled = true;
        return;
    }
    
    // Trouver la catégorie dans le type MLC
    const mlcType = window.specialCategoriesConfig.types[0];
    if (!mlcType || !mlcType.categories) return;
    
    const selectedCategory = mlcType.categories.find(cat => cat.id === categoryId);
    if (!selectedCategory || !selectedCategory.subcategories) {
        subcategorySelect.disabled = true;
        return;
    }
    
    subcategorySelect.disabled = false;
    
    // Charger les sous-catégories
    selectedCategory.subcategories.forEach(subcategory => {
        const option = document.createElement('option');
        option.value = subcategory.id;
        option.textContent = subcategory.name;
        subcategorySelect.appendChild(option);
    });
}
