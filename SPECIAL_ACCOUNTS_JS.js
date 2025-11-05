// ========================================
// 🔹 COMPTES SPECIAL - JavaScript
// ========================================
// À ajouter dans public/app.js

// Charger et afficher les comptes special
async function loadSpecialAccounts() {
    try {
        console.log('🔹 Chargement des comptes special...');
        
        const response = await fetch('/api/special-accounts');
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.message);
        }
        
        const container = document.getElementById('special-accounts-container');
        const loading = document.getElementById('special-accounts-loading');
        const empty = document.getElementById('special-accounts-empty');
        
        loading.style.display = 'none';
        
        if (data.accounts.length === 0) {
            empty.style.display = 'block';
            container.innerHTML = '';
            return;
        }
        
        empty.style.display = 'none';
        
        // Afficher chaque compte
        container.innerHTML = data.accounts.map(account => {
            const allMovements = [
                ...account.credits.map(c => ({...c, type: 'credit', date: c.created_at})),
                ...account.special_credits.map(c => ({...c, type: 'special_credit', date: c.created_at})),
                ...account.expenses.map(e => ({...e, type: 'expense', date: e.expense_date}))
            ].sort((a, b) => new Date(b.date) - new Date(a.date));
            
            return `
                <div class="special-account-card">
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
                        <button class="special-tab-btn active" onclick="showSpecialTab(${account.id}, 'all')">
                            <i class="fas fa-list"></i> Tous
                        </button>
                        <button class="special-tab-btn" onclick="showSpecialTab(${account.id}, 'credits')">
                            <i class="fas fa-plus-circle"></i> Crédits (${account.credits.length + account.special_credits.length})
                        </button>
                        <button class="special-tab-btn" onclick="showSpecialTab(${account.id}, 'expenses')">
                            <i class="fas fa-minus-circle"></i> Dépenses (${account.expenses.length})
                        </button>
                    </div>
                    
                    <div class="special-movements-list" id="special-movements-${account.id}">
                        ${renderSpecialMovements(allMovements)}
                    </div>
                </div>
            `;
        }).join('');
        
        console.log(`🔹 ${data.accounts.length} comptes special affichés`);
        
    } catch (error) {
        console.error('❌ Erreur chargement comptes special:', error);
        showNotification('Erreur lors du chargement des comptes special', 'error');
    }
}

// Afficher un onglet spécifique (tous, crédits, dépenses)
function showSpecialTab(accountId, tab) {
    // Changer l'onglet actif
    const card = document.querySelector(`#special-movements-${accountId}`).closest('.special-account-card');
    const buttons = card.querySelectorAll('.special-tab-btn');
    buttons.forEach(btn => btn.classList.remove('active'));
    event.target.closest('.special-tab-btn').classList.add('active');
    
    // Recharger les données filtrées
    // (Pour simplifier, on recharge tout et on filtre côté client)
    loadSpecialAccounts();
}

// Rendre les mouvements
function renderSpecialMovements(movements) {
    if (movements.length === 0) {
        return '<div class="special-empty-state"><i class="fas fa-inbox" style="font-size: 32px; margin-bottom: 10px;"></i><p>Aucun mouvement</p></div>';
    }
    
    return movements.map(movement => {
        let icon, amountClass, amountPrefix, description, details;
        
        if (movement.type === 'credit' || movement.type === 'special_credit') {
            icon = '<i class="fas fa-plus-circle"></i>';
            amountClass = 'special-movement-credit';
            amountPrefix = '+';
            description = movement.description || 'Crédit';
            details = `Par ${movement.credited_by_name}`;
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
        
        return `
            <div class="special-movement-item">
                <div class="special-movement-info">
                    <div class="special-movement-date">${icon} ${date}</div>
                    <div class="special-movement-desc">${description}</div>
                    ${details ? `<div class="special-movement-details">${details}</div>` : ''}
                </div>
                <div class="special-movement-amount ${amountClass}">
                    ${amountPrefix}${formatCurrency(movement.amount)}
                </div>
            </div>
        `;
    }).join('');
}

// Fonction utilitaire pour formater la monnaie
function formatCurrency(amount) {
    return parseInt(amount).toLocaleString('fr-FR') + ' FCFA';
}
