// ========================================
// 📸 SYSTÈME DE GESTION DES SNAPSHOTS
// ========================================

// Variables globales pour les snapshots
let currentSnapshots = [];
let currentSnapshotData = null;
let currentPage = 1;
const itemsPerPage = 20;

// Utilitaires pour formatage des dates
function formatDateFR(dateString, format = 'DD/MM/YYYY') {
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
        default: return `${day}/${month}/${year}`;
    }
}

function formatCurrency(amount) {
    return parseInt(amount).toLocaleString('fr-FR') + ' FCFA';
}

// Afficher une notification pour les snapshots
function showSnapshotNotification(message, type = 'success') {
    const notification = document.getElementById('snapshots-notification');
    notification.textContent = message;
    notification.className = `notification ${type}`;
    notification.style.display = 'block';
    
    setTimeout(() => {
        notification.style.display = 'none';
    }, 5000);
}

// Initialiser la section snapshots
function initializeSnapshots() {
    console.log('📸 Initialisation du système de snapshots');
    
    // Event listeners
    const createBtn = document.getElementById('create-snapshot-btn');
    const refreshBtn = document.getElementById('refresh-snapshots-btn');
    const closeViewerBtn = document.getElementById('close-snapshot-viewer');
    
    if (createBtn) {
        createBtn.addEventListener('click', createSnapshot);
    }
    
    if (refreshBtn) {
        refreshBtn.addEventListener('click', loadSnapshotsList);
    }
    
    if (closeViewerBtn) {
        closeViewerBtn.addEventListener('click', closeSnapshotViewer);
    }
    
    // Initialiser les onglets du viewer
    initializeSnapshotTabs();
    
    // Charger la liste des snapshots
    loadSnapshotsList();
}

// Créer un nouveau snapshot
async function createSnapshot() {
    const createBtn = document.getElementById('create-snapshot-btn');
    const cutoffDateInput = document.getElementById('snapshot-cutoff-date');
    
    try {
        // Désactiver le bouton et montrer le loading
        createBtn.disabled = true;
        createBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Création en cours...';
        
        const cutoffDate = cutoffDateInput.value || null;
        
        const response = await fetch('/api/snapshots/create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                cutoff_date: cutoffDate
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showSnapshotNotification(result.message, 'success');
            // Recharger la liste des snapshots
            await loadSnapshotsList();
            // Vider le champ de date
            cutoffDateInput.value = '';
        } else {
            throw new Error(result.message);
        }
        
    } catch (error) {
        console.error('❌ Erreur création snapshot:', error);
        showSnapshotNotification(`Erreur: ${error.message}`, 'error');
    } finally {
        // Réactiver le bouton
        createBtn.disabled = false;
        createBtn.innerHTML = '<i class="fas fa-camera"></i> Créer un Snapshot';
    }
}

// Charger la liste des snapshots
async function loadSnapshotsList() {
    const loadingDiv = document.getElementById('snapshots-loading');
    const listDiv = document.getElementById('snapshots-list');
    
    try {
        // Afficher le loading
        loadingDiv.style.display = 'block';
        listDiv.innerHTML = '';
        
        const response = await fetch('/api/snapshots');
        const result = await response.json();
        
        if (result.success) {
            currentSnapshots = result.snapshots;
            currentPage = 1;
            renderSnapshotsList();
        } else {
            throw new Error(result.message);
        }
        
    } catch (error) {
        console.error('❌ Erreur chargement snapshots:', error);
        listDiv.innerHTML = `
            <div class="no-data-message">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Erreur lors du chargement</p>
                <small>${error.message}</small>
            </div>
        `;
    } finally {
        loadingDiv.style.display = 'none';
    }
}

// Rendre la liste des snapshots avec pagination
function renderSnapshotsList() {
    const listDiv = document.getElementById('snapshots-list');
    
    if (currentSnapshots.length === 0) {
        listDiv.innerHTML = `
            <div class="no-data-message">
                <i class="fas fa-inbox"></i>
                <p>Aucun snapshot disponible pour le moment</p>
                <small>Créez votre premier snapshot pour commencer</small>
            </div>
        `;
        return;
    }
    
    const totalPages = Math.ceil(currentSnapshots.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedSnapshots = currentSnapshots.slice(startIndex, endIndex);
    
    listDiv.innerHTML = `
        <div class="snapshots-table-container">
            <div class="snapshots-header">
                <h5><i class="fas fa-archive"></i> Snapshots Disponibles</h5>
                <div class="snapshots-count">
                    ${currentSnapshots.length} snapshot${currentSnapshots.length > 1 ? 's' : ''} au total
                </div>
            </div>
            
            <table class="snapshots-table">
                <thead>
                    <tr>
                        <th><i class="fas fa-calendar"></i> Date</th>
                        <th><i class="fas fa-user"></i> Créé par</th>
                        <th><i class="fas fa-clock"></i> Il y a</th>
                        <th><i class="fas fa-tag"></i> Version</th>
                        <th><i class="fas fa-cogs"></i> Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${paginatedSnapshots.map(snapshot => {
                        const creationDate = new Date(snapshot.creation_timestamp);
                        const timeAgo = getTimeAgo(creationDate);
                        
                        return `
                            <tr>
                                <td class="snapshot-date">
                                    <strong>${snapshot.snapshot_date_fr}</strong>
                                    <br>
                                    <small class="text-muted">${creationDate.toLocaleDateString('fr-FR')} ${creationDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</small>
                                </td>
                                <td class="snapshot-creator">
                                    <span class="creator-name">${snapshot.created_by_username}</span>
                                </td>
                                <td class="snapshot-time">
                                    <span class="time-ago">${timeAgo}</span>
                                </td>
                                <td class="snapshot-version">
                                    <span class="version-badge">v${snapshot.version}</span>
                                </td>
                                <td class="snapshot-actions">
                                    <button class="action-btn view-btn" onclick="viewSnapshot('${snapshot.snapshot_date}')" title="Voir le snapshot">
                                        <i class="fas fa-eye"></i> Voir
                                    </button>
                                    <button class="action-btn delete-btn" onclick="deleteSnapshot('${snapshot.snapshot_date}')" title="Supprimer le snapshot">
                                        <i class="fas fa-trash"></i> Supprimer
                                    </button>
                                </td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        </div>
        
        ${totalPages > 1 ? renderPagination(totalPages) : ''}
    `;
}

// [OBSOLÈTE] Ancienne fonction de création de cartes - remplacée par le tableau
// function createSnapshotCard(snapshot) { ... }

// Calculer le temps écoulé depuis une date
function getTimeAgo(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 60) {
        return `Il y a ${diffMins} minute${diffMins > 1 ? 's' : ''}`;
    } else if (diffHours < 24) {
        return `Il y a ${diffHours} heure${diffHours > 1 ? 's' : ''}`;
    } else {
        return `Il y a ${diffDays} jour${diffDays > 1 ? 's' : ''}`;
    }
}

// Voir un snapshot spécifique
async function viewSnapshot(snapshotDate) {
    const viewerSection = document.getElementById('snapshot-viewer-section');
    const viewerTitle = document.getElementById('viewer-title');
    
    try {
        // Afficher le loader
        viewerTitle.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Chargement du snapshot...';
        viewerSection.style.display = 'block';
        
        const response = await fetch(`/api/snapshots/${snapshotDate}`);
        const result = await response.json();
        
        if (result.success) {
            currentSnapshotData = result.data;
            viewerTitle.innerHTML = `<i class="fas fa-eye"></i> Snapshot du ${result.snapshot_date_fr}`;
            
            // Rendre le contenu du snapshot
            renderSnapshotContent(result.data);
            
            // Faire défiler vers le viewer
            viewerSection.scrollIntoView({ behavior: 'smooth' });
            
        } else {
            throw new Error(result.message);
        }
        
    } catch (error) {
        console.error('❌ Erreur lecture snapshot:', error);
        showSnapshotNotification(`Erreur: ${error.message}`, 'error');
        closeSnapshotViewer();
    }
}

// Rendre le contenu du snapshot
function renderSnapshotContent(snapshotData) {
    // Rendre le dashboard
    renderSnapshotDashboard(snapshotData.dashboard);
    
    // Rendre les dépenses
    renderSnapshotExpenses(snapshotData.depenses);
    
    // Rendre les créances
    renderSnapshotCreances(snapshotData.creances);
    
    // Rendre la gestion de stock
    renderSnapshotStock(snapshotData.gestion_stock);
    
    // Rendre les partenaires
    renderSnapshotPartners(snapshotData.comptes_partenaires);
}

// Rendre le dashboard du snapshot
function renderSnapshotDashboard(dashboardData) {
    const contentDiv = document.getElementById('snapshot-dashboard-content');
    
    const statsCards = dashboardData.stats_cards;
    
    contentDiv.innerHTML = `
        <div class="snapshot-stats-grid">
            <div class="snapshot-stat-card">
                <div class="stat-icon"><i class="fas fa-credit-card"></i></div>
                <div class="stat-value">${formatCurrency(statsCards.totalSpent)}</div>
                <div class="stat-label">Total Dépensé</div>
            </div>
            <div class="snapshot-stat-card">
                <div class="stat-icon"><i class="fas fa-wallet"></i></div>
                <div class="stat-value">${formatCurrency(statsCards.totalRemaining)}</div>
                <div class="stat-label">Montant Restant</div>
            </div>
            <div class="snapshot-stat-card">
                <div class="stat-icon"><i class="fas fa-plus-circle"></i></div>
                <div class="stat-value">${formatCurrency(statsCards.totalCreditedWithExpenses)}</div>
                <div class="stat-label">Total Crédité</div>
            </div>
            <div class="snapshot-stat-card">
                <div class="stat-icon"><i class="fas fa-warehouse"></i></div>
                <div class="stat-value">${formatCurrency(statsCards.totalDepotBalance)}</div>
                <div class="stat-label">Solde Dépôts</div>
            </div>
            <div class="snapshot-stat-card">
                <div class="stat-icon"><i class="fas fa-handshake"></i></div>
                <div class="stat-value">${formatCurrency(statsCards.totalPartnerBalance)}</div>
                <div class="stat-label">Solde Partenaires</div>
            </div>
        </div>
        
        ${dashboardData.pl_details ? renderPLDetails(dashboardData.pl_details) : ''}
        
        ${dashboardData.cash_details ? renderCashDetails(dashboardData.cash_details) : ''}
        
        ${dashboardData.cartes_additionnelles ? renderCartesAdditionnelles(dashboardData.cartes_additionnelles) : ''}
        
        ${dashboardData.cartes_additionnelles ? renderStockVivantHistorique(dashboardData.cartes_additionnelles) : ''}
        
        <div class="accounts-details-section">
            <div class="accounts-details-header">
                <h4><i class="fas fa-chart-bar"></i> Détails par Compte</h4>
                <button id="toggle-empty-accounts-btn" class="btn btn-outline-secondary btn-sm" onclick="toggleEmptyAccounts()">
                    <i class="fas fa-eye-slash"></i> <span id="empty-accounts-btn-text">Afficher les comptes vides</span>
                </button>
            </div>
            <div class="table-container">
                <table class="table">
                    <thead>
                        <tr>
                            <th>Compte</th>
                            <th>Type</th>
                            <th>Montant Restant</th>
                            <th>Montant Dépensé</th>
                            <th>Crédit du Mois</th>
                            <th>Balance du Mois</th>
                            <th>Total Crédité</th>
                            <th>Gestionnaire</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${dashboardData.accounts_details.map(account => {
                            // Vérifier si le compte a toutes les valeurs à zéro
                            const isEmptyAccount = 
                                parseFloat(account.montant_restant || 0) === 0 &&
                                parseFloat(account.montant_depense || 0) === 0 &&
                                parseFloat(account.credit_du_mois || 0) === 0 &&
                                parseFloat(account.balance_du_mois || 0) === 0 &&
                                parseFloat(account.total_credited || 0) === 0;
                            
                            return `
                                <tr class="${isEmptyAccount ? 'empty-account' : ''}" style="${isEmptyAccount ? 'display: none;' : ''}">
                                    <td><strong>${account.account_name}</strong></td>
                                    <td><span class="badge badge-info">${account.account_type}</span></td>
                                    <td class="${parseFloat(account.montant_restant) >= 0 ? 'text-success' : 'text-danger-soft'}">${formatCurrency(account.montant_restant)}</td>
                                    <td class="text-warning">${formatCurrency(account.montant_depense)}</td>
                                    <td class="text-success">${formatCurrency(account.credit_du_mois)}</td>
                                    <td class="${parseFloat(account.balance_du_mois) >= 0 ? 'text-success' : 'text-danger-soft'}">${formatCurrency(account.balance_du_mois)}</td>
                                    <td class="text-info">${formatCurrency(account.total_credited)}</td>
                                    <td>${account.user_name || '-'}</td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
            <div class="accounts-summary">
                <small class="text-muted">
                    <i class="fas fa-info-circle"></i> 
                    <span id="empty-accounts-count">${dashboardData.accounts_details.filter(account => 
                        parseFloat(account.montant_restant || 0) === 0 &&
                        parseFloat(account.montant_depense || 0) === 0 &&
                        parseFloat(account.credit_du_mois || 0) === 0 &&
                        parseFloat(account.balance_du_mois || 0) === 0 &&
                        parseFloat(account.total_credited || 0) === 0
                    ).length}</span> comptes vides masqués
                </small>
            </div>
        </div>
        
        <h4><i class="fas fa-chart-pie"></i> Dépenses par Catégorie</h4>
        <div class="table-container">
            <table class="table">
                <thead>
                    <tr>
                        <th>Catégorie</th>
                        <th>Montant</th>
                        <th>Pourcentage</th>
                        <th>Nombre</th>
                    </tr>
                </thead>
                <tbody>
                    ${dashboardData.depenses_categories.map(cat => `
                        <tr>
                            <td><strong>${cat.category}</strong></td>
                            <td>${formatCurrency(cat.total_amount)}</td>
                            <td>${cat.percentage}%</td>
                            <td>${cat.count}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

// Rendre les détails du PL
function renderPLDetails(plDetails) {
    return `
        <div class="collapsible-section">
            <div class="collapsible-header" onclick="toggleSection('pl-details')">
                <h4><i class="fas fa-chart-line"></i> Détail du Calcul PL</h4>
                <div class="pl-final-summary">
                    <span class="pl-final-label">PL FINAL =</span>
                    <span class="pl-final-value ${plDetails.plFinal >= 0 ? 'positive' : 'negative'}">
                        <strong>${formatCurrency(plDetails.plFinal)}</strong>
                    </span>
                </div>
                <i class="fas fa-chevron-down collapsible-icon" id="pl-details-icon"></i>
            </div>
            <div class="collapsible-content" id="pl-details-content" style="display: none;">
                <div class="pl-details-section">
                    <div class="pl-base-section">
                        <h5><i class="fas fa-calculator"></i> PL de Base</h5>
                        <div class="pl-calculation-grid">
                            <div class="pl-item positive">
                                <span class="pl-label">💰 Cash Bictorys du mois:</span>
                                <span class="pl-value">${formatCurrency(plDetails.cashBictorys)}</span>
                            </div>
                            <div class="pl-item positive">
                                <span class="pl-label">💳 Créances du mois:</span>
                                <span class="pl-value">${formatCurrency(plDetails.creancesMois)}</span>
                            </div>
                            <div class="pl-item ${plDetails.ecartStockMata >= 0 ? 'positive' : 'negative'}">
                                <span class="pl-label">📦 Écart Stock Mata Mensuel:</span>
                                <span class="pl-value">${formatCurrency(plDetails.ecartStockMata)}</span>
                            </div>
                            <div class="pl-item negative">
                                <span class="pl-label">💸 Cash Burn du mois:</span>
                                <span class="pl-value">-${formatCurrency(plDetails.cashBurn)}</span>
                            </div>
                            <div class="pl-total">
                                <span class="pl-label"><strong>📊 PL de base =</strong></span>
                                <span class="pl-value ${plDetails.plBase >= 0 ? 'positive' : 'negative'}">
                                    <strong>${formatCurrency(plDetails.plBase)}</strong>
                                </span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="pl-adjustments-section">
                        <h5><i class="fas fa-cogs"></i> Ajustements</h5>
                        <div class="pl-calculation-grid">
                            <div class="pl-item ${plDetails.ecartStockVivant >= 0 ? 'positive' : 'negative'}">
                                <span class="pl-label">🌱 Écart Stock Vivant Mensuel:</span>
                                <span class="pl-value">${formatCurrency(plDetails.ecartStockVivant)}</span>
                            </div>
                            <div class="pl-total">
                                <span class="pl-label"><strong>📊 PL BRUT =</strong></span>
                                <span class="pl-value ${plDetails.plBrut >= 0 ? 'positive' : 'negative'}">
                                    <strong>${formatCurrency(plDetails.plBrut)}</strong>
                                </span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="pl-charges-section">
                        <h5><i class="fas fa-calculator"></i> Estimation Charges Fixes</h5>
                        <div class="pl-calculation-grid">
                            <div class="pl-item negative">
                                <span class="pl-label">⚙️ Charges prorata (jours ouvrables):</span>
                                <span class="pl-value">-${formatCurrency(plDetails.estimationCharges)}</span>
                            </div>
                            <div class="pl-final">
                                <span class="pl-label"><strong>🎯 PL FINAL =</strong></span>
                                <span class="pl-value ${plDetails.plFinal >= 0 ? 'positive' : 'negative'}">
                                    <strong>${formatCurrency(plDetails.plFinal)}</strong>
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// Rendre les détails du cash disponible
function renderCashDetails(cashDetails) {
    return `
        <div class="collapsible-section">
            <div class="collapsible-header" onclick="toggleSection('cash-details')">
                <h4><i class="fas fa-info-circle"></i> Détail du Cash disponible</h4>
                <div class="cash-total-summary">
                    <span class="cash-total-label">Total:</span>
                    <span class="cash-total-value">${formatCurrency(cashDetails.total_cash_disponible)}</span>
                </div>
                <i class="fas fa-chevron-down collapsible-icon" id="cash-details-icon"></i>
            </div>
            <div class="collapsible-content" id="cash-details-content" style="display: none;">
                <div class="cash-details-section">
                    <div class="cash-accounts-section">
                        <h5><i class="fas fa-list"></i> Comptes inclus (${cashDetails.nombre_comptes})</h5>
                        <div class="table-container">
                            <table class="table">
                                <thead>
                                    <tr>
                                        <th>Compte</th>
                                        <th>Type</th>
                                        <th>Solde</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${cashDetails.comptes_inclus.map(compte => `
                                        <tr>
                                            <td><strong>${compte.account_name}</strong></td>
                                            <td><span class="badge badge-info">${compte.account_type}</span></td>
                                            <td class="text-success"><strong>${formatCurrency(compte.current_balance)}</strong></td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// Rendre les cartes additionnelles
function renderCartesAdditionnelles(cartesData) {
    return `
        <div class="collapsible-section">
            <div class="collapsible-header" onclick="toggleSection('cartes-additionnelles')">
                <h4><i class="fas fa-th-large"></i> Cartes Additionnelles</h4>
                <span class="cartes-summary">Stocks, Dépôts et Données Supplémentaires</span>
                <i class="fas fa-chevron-down collapsible-icon" id="cartes-additionnelles-icon"></i>
            </div>
            <div class="collapsible-content" id="cartes-additionnelles-content" style="display: none;">
                <div class="cartes-additionnelles-section">
                    <div class="snapshot-stats-grid">
                        <div class="snapshot-stat-card">
                            <div class="stat-icon"><i class="fas fa-warehouse"></i></div>
                            <div class="stat-value">${formatCurrency(cartesData.totaux_depot_partenaire.solde_depot)}</div>
                            <div class="stat-label">Solde Comptes Dépôt</div>
                        </div>
                        <div class="snapshot-stat-card">
                            <div class="stat-icon"><i class="fas fa-seedling"></i></div>
                            <div class="stat-value">${formatCurrency(cartesData.stock_vivant.stock_actuel)}</div>
                            <div class="stat-label">Total Général Stock Vivant</div>
                        </div>
                        <div class="snapshot-stat-card">
                            <div class="stat-icon"><i class="fas fa-boxes"></i></div>
                            <div class="stat-value">${formatCurrency(cartesData.stock_mata.stock_actuel)}</div>
                            <div class="stat-label">Écart Stock Mata Mensuel</div>
                        </div>
                        <div class="snapshot-stat-card">
                            <div class="stat-icon"><i class="fas fa-money-bill-wave"></i></div>
                            <div class="stat-value">${formatCurrency(cartesData.cash_bictorys.valeur_actuelle)}</div>
                            <div class="stat-label">Cash Bictorys Du mois</div>
                        </div>
                    </div>
                    
                    ${cartesData.stock_mata.historique.length > 0 ? `
                        <h5><i class="fas fa-boxes"></i> Stock Mata - Historique</h5>
                        <div class="table-container">
                            <table class="table">
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Valeur Stock</th>
                                        <th>Créé le</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${cartesData.stock_mata.historique.map(stock => `
                                        <tr>
                                            <td>${formatDateFR(stock.stock_date)}</td>
                                            <td><strong>${formatCurrency(stock.stock_value)}</strong></td>
                                            <td>${new Date(stock.created_at).toLocaleString('fr-FR')}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                        <p class="text-info">
                            <i class="fas fa-info-circle"></i> 
                            Écart mensuel: <strong class="${cartesData.stock_mata.ecart_mensuel >= 0 ? 'text-success' : 'text-danger'}">${formatCurrency(cartesData.stock_mata.ecart_mensuel)}</strong>
                        </p>
                    ` : ''}
                    
                </div>
            </div>
        </div>
    `;
}

// Rendre l'historique du Stock Vivant
function renderStockVivantHistorique(cartesData) {
    return `
        <div class="collapsible-section">
            <div class="collapsible-header" onclick="toggleSection('stock-vivant-historique')">
                <h4><i class="fas fa-seedling"></i> Stock Vivant - Historique</h4>
                <span class="stock-summary">
                    Écart mensuel: <strong class="${cartesData.stock_vivant.ecart_mensuel >= 0 ? 'text-success' : 'text-danger'}">${formatCurrency(cartesData.stock_vivant.ecart_mensuel)}</strong>
                </span>
                <i class="fas fa-chevron-down collapsible-icon" id="stock-vivant-historique-icon"></i>
            </div>
            <div class="collapsible-content" id="stock-vivant-historique-content" style="display: none;">
                <div class="stock-historique-section">
                    ${cartesData.stock_vivant.historique.length > 0 ? `
                        <div class="table-container">
                            <table class="table">
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Valeur Stock</th>
                                        <th>Créé le</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${cartesData.stock_vivant.historique.map(stock => `
                                        <tr>
                                            <td>${formatDateFR(stock.stock_date)}</td>
                                            <td><strong>${formatCurrency(stock.stock_value)}</strong></td>
                                            <td>${new Date(stock.created_at).toLocaleString('fr-FR')}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                        <p class="text-info stock-ecart-info">
                            <i class="fas fa-info-circle"></i> 
                            Évolution du stock vivant sur la période avec calcul automatique de l'écart mensuel
                        </p>
                    ` : `
                        <div class="no-data-message">
                            <i class="fas fa-exclamation-triangle"></i>
                            <p>Aucun historique de stock vivant disponible pour cette période</p>
                        </div>
                    `}
                </div>
            </div>
        </div>
    `;
}

// Rendre les dépenses du snapshot
function renderSnapshotExpenses(depensesData) {
    const contentDiv = document.getElementById('snapshot-expenses-content');
    
    contentDiv.innerHTML = `
        <div class="snapshot-stats-grid">
            <div class="snapshot-stat-card">
                <div class="stat-icon"><i class="fas fa-receipt"></i></div>
                <div class="stat-value">${formatCurrency(depensesData.summary.total_amount)}</div>
                <div class="stat-label">Montant Total</div>
            </div>
            <div class="snapshot-stat-card">
                <div class="stat-icon"><i class="fas fa-list"></i></div>
                <div class="stat-value">${depensesData.summary.total_count}</div>
                <div class="stat-label">Nombre de Dépenses</div>
            </div>
        </div>
        
        <h4><i class="fas fa-history"></i> Historique des Dépenses (${depensesData.summary.period})</h4>
        <div class="table-container">
            <table class="table">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Compte</th>
                        <th>Catégorie</th>
                        <th>Désignation</th>
                        <th>Fournisseur</th>
                        <th>Montant</th>
                    </tr>
                </thead>
                <tbody>
                    ${depensesData.toutes_depenses.slice(0, 100).map(expense => `
                        <tr>
                            <td>${formatDateFR(expense.expense_date)}</td>
                            <td>${expense.account_name}</td>
                            <td><span class="badge badge-secondary">${expense.category}</span></td>
                            <td>${expense.designation}</td>
                            <td>${expense.supplier}</td>
                            <td><strong>${formatCurrency(expense.amount)}</strong></td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            ${depensesData.toutes_depenses.length > 100 ? 
                `<p class="text-muted text-center">... et ${depensesData.toutes_depenses.length - 100} autres dépenses</p>` 
                : ''}
        </div>
    `;
}

// Rendre les créances du snapshot
function renderSnapshotCreances(creancesData) {
    const contentDiv = document.getElementById('snapshot-creances-content');
    
    contentDiv.innerHTML = `
        <div class="snapshot-stats-grid">
            <div class="snapshot-stat-card">
                <div class="stat-icon"><i class="fas fa-users"></i></div>
                <div class="stat-value">${creancesData.summary.total_clients}</div>
                <div class="stat-label">Clients</div>
            </div>
            <div class="snapshot-stat-card">
                <div class="stat-icon"><i class="fas fa-exchange-alt"></i></div>
                <div class="stat-value">${creancesData.summary.total_operations}</div>
                <div class="stat-label">Opérations</div>
            </div>
        </div>
        
        <h4><i class="fas fa-users"></i> Récapitulatif par Client</h4>
        <div class="table-container">
            <table class="table">
                <thead>
                    <tr>
                        <th>Client</th>
                        <th>Téléphone</th>
                        <th>Crédit Initial</th>
                        <th>Total Avances</th>
                        <th>Total Remboursements</th>
                        <th>Solde Final</th>
                    </tr>
                </thead>
                <tbody>
                    ${creancesData.recapitulatif_clients.map(client => `
                        <tr>
                            <td><strong>${client.client_name}</strong></td>
                            <td>${client.phone || '-'}</td>
                            <td>${formatCurrency(client.credit_initial)}</td>
                            <td>${formatCurrency(client.total_avances)}</td>
                            <td>${formatCurrency(client.total_remboursements)}</td>
                            <td><strong class="${client.solde_final >= 0 ? 'text-success' : 'text-danger'}">${formatCurrency(client.solde_final)}</strong></td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
        
        <h4><i class="fas fa-history"></i> Historique des Opérations</h4>
        <div class="table-container">
            <table class="table">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Client</th>
                        <th>Type</th>
                        <th>Montant</th>
                        <th>Description</th>
                        <th>Par</th>
                    </tr>
                </thead>
                <tbody>
                    ${creancesData.historique_operations.slice(0, 50).map(op => `
                        <tr>
                            <td>${formatDateFR(op.operation_date)}</td>
                            <td><strong>${op.client_name}</strong></td>
                            <td><span class="badge ${op.operation_type.includes('Remboursement') ? 'badge-success' : 'badge-primary'}">${op.operation_type}</span></td>
                            <td>${formatCurrency(op.amount)}</td>
                            <td>${op.description || '-'}</td>
                            <td>${op.created_by_username}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            ${creancesData.historique_operations.length > 50 ? 
                `<p class="text-muted text-center">... et ${creancesData.historique_operations.length - 50} autres opérations</p>` 
                : ''}
        </div>
    `;
}

// Rendre la gestion de stock du snapshot
function renderSnapshotStock(stockData) {
    const contentDiv = document.getElementById('snapshot-stock-content');
    
    if (!stockData || !stockData.stocks_actifs || stockData.stocks_actifs.length === 0) {
        contentDiv.innerHTML = `
            <div class="no-data-message">
                <i class="fas fa-warehouse"></i>
                <p>Aucune donnée de stock disponible</p>
                <small>Les stocks du soir sont tous à zéro ou aucune donnée n'est présente</small>
            </div>
        `;
        return;
    }
    
    contentDiv.innerHTML = `
        <div class="snapshot-stats-grid">
            <div class="snapshot-stat-card">
                <div class="stat-icon"><i class="fas fa-boxes"></i></div>
                <div class="stat-value">${stockData.summary.total_lignes}</div>
                <div class="stat-label">Produits en Stock</div>
            </div>
            <div class="snapshot-stat-card">
                <div class="stat-icon"><i class="fas fa-store"></i></div>
                <div class="stat-value">${stockData.summary.points_de_vente}</div>
                <div class="stat-label">Points de Vente</div>
            </div>
            <div class="snapshot-stat-card">
                <div class="stat-icon"><i class="fas fa-calendar-check"></i></div>
                <div class="stat-value">${stockData.summary.date_reference ? formatDateFR(stockData.summary.date_reference) : '-'}</div>
                <div class="stat-label">Date de Référence</div>
            </div>
            <div class="snapshot-stat-card">
                <div class="stat-icon"><i class="fas fa-list"></i></div>
                <div class="stat-value">${stockData.summary.produits_uniques}</div>
                <div class="stat-label">Produits Uniques</div>
            </div>
        </div>
        
        <h4><i class="fas fa-warehouse"></i> Gestion de Stock - Stocks du Soir Actifs</h4>
        <div class="table-container">
            <table class="table">
                <thead>
                    <tr>
                        <th><i class="fas fa-calendar"></i> Date</th>
                        <th><i class="fas fa-store"></i> Point de Vente</th>
                        <th><i class="fas fa-box"></i> Produit</th>
                        <th><i class="fas fa-sun"></i> Stock Matin</th>
                        <th><i class="fas fa-moon"></i> Stock Soir</th>
                        <th><i class="fas fa-exchange-alt"></i> Transfert</th>
                    </tr>
                </thead>
                <tbody>
                    ${stockData.stocks_actifs.map(stock => `
                        <tr>
                            <td>
                                <strong>${formatDateFR(stock.date)}</strong>
                            </td>
                            <td>
                                <span class="badge badge-primary">${stock.point_de_vente}</span>
                            </td>
                            <td>
                                <strong>${stock.produit}</strong>
                            </td>
                            <td class="text-info">
                                ${formatCurrency(stock.stock_matin)}
                            </td>
                            <td class="${parseFloat(stock.stock_soir) > 0 ? 'text-success' : 'text-muted'}">
                                <strong>${formatCurrency(stock.stock_soir)}</strong>
                            </td>
                            <td class="${parseFloat(stock.transfert) > 0 ? 'text-warning' : 'text-muted'}">
                                ${formatCurrency(stock.transfert)}
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
        
        <div class="stock-summary-info">
            <div class="alert alert-info">
                <i class="fas fa-info-circle"></i>
                <strong>Information :</strong> 
                Ce tableau affiche uniquement les produits ayant un stock du soir supérieur à zéro pour la date la plus récente disponible.
                ${stockData.summary.date_reference ? `Données du ${formatDateFR(stockData.summary.date_reference, 'DD/MM/YYYY')}.` : ''}
            </div>
        </div>
    `;
}

// Rendre les partenaires du snapshot
function renderSnapshotPartners(partnersData) {
    const contentDiv = document.getElementById('snapshot-partners-content');
    
    contentDiv.innerHTML = `
        <div class="snapshot-stats-grid">
            <div class="snapshot-stat-card">
                <div class="stat-icon"><i class="fas fa-handshake"></i></div>
                <div class="stat-value">${partnersData.summary.total_comptes}</div>
                <div class="stat-label">Comptes Partenaires</div>
            </div>
            <div class="snapshot-stat-card">
                <div class="stat-icon"><i class="fas fa-truck"></i></div>
                <div class="stat-value">${partnersData.summary.total_livraisons}</div>
                <div class="stat-label">Livraisons</div>
            </div>
        </div>
        
        <h4><i class="fas fa-handshake"></i> Suivi des Comptes Partenaires</h4>
        <div class="table-container">
            <table class="table">
                <thead>
                    <tr>
                        <th>Compte</th>
                        <th>Montant Total</th>
                        <th>Livré</th>
                        <th>Restant</th>
                        <th>Livraisons</th>
                        <th>Articles</th>
                        <th>Progression</th>
                    </tr>
                </thead>
                <tbody>
                    ${partnersData.comptes.map(compte => `
                        <tr>
                            <td><strong>${compte.account_name}</strong></td>
                            <td>${formatCurrency(compte.montant_total)}</td>
                            <td class="text-success">${formatCurrency(compte.livre)}</td>
                            <td class="text-warning">${formatCurrency(compte.restant)}</td>
                            <td>${compte.delivery_count || 0}</td>
                            <td>${compte.articles}</td>
                            <td>
                                <div class="progress" style="height: 20px; position: relative;">
                                    <div class="progress-bar bg-success" style="width: ${compte.progression}%"></div>
                                    <span style="position: absolute; width: 100%; text-align: center; line-height: 20px; color: #333; font-weight: 600; font-size: 12px;">
                                        ${compte.progression}%
                                    </span>
                                </div>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
        
        <h4><i class="fas fa-truck"></i> Détail des Livraisons</h4>
        <div class="table-container">
            <table class="table">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Compte</th>
                        <th>Articles</th>
                        <th>Prix Unitaire</th>
                        <th>Montant</th>
                        <th>Statut</th>
                        <th>Par</th>
                    </tr>
                </thead>
                <tbody>
                    ${partnersData.livraisons.slice(0, 50).map(livraison => `
                        <tr>
                            <td>${formatDateFR(livraison.delivery_date)}</td>
                            <td><strong>${livraison.account_name}</strong></td>
                            <td>${livraison.articles}</td>
                            <td>${formatCurrency(livraison.unit_price)}</td>
                            <td>${formatCurrency(livraison.montant)}</td>
                            <td><span class="badge ${livraison.validation_status === 'Validée' ? 'badge-success' : 'badge-warning'}">${livraison.validation_status}</span></td>
                            <td>${livraison.created_by_username}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            ${partnersData.livraisons.length > 50 ? 
                `<p class="text-muted text-center">... et ${partnersData.livraisons.length - 50} autres livraisons</p>` 
                : ''}
        </div>
    `;
}

// Supprimer un snapshot
async function deleteSnapshot(snapshotDate) {
    if (!confirm(`Êtes-vous sûr de vouloir supprimer le snapshot du ${formatDateFR(snapshotDate)} ?`)) {
        return;
    }
    
    try {
        const response = await fetch(`/api/snapshots/${snapshotDate}`, {
            method: 'DELETE'
        });
        
        const result = await response.json();
        
        if (result.success) {
            showSnapshotNotification(result.message, 'success');
            // Recharger la liste
            await loadSnapshotsList();
            // Fermer le viewer si c'est le snapshot en cours de consultation
            if (currentSnapshotData && currentSnapshotData.metadata.snapshot_date === snapshotDate) {
                closeSnapshotViewer();
            }
        } else {
            throw new Error(result.message);
        }
        
    } catch (error) {
        console.error('❌ Erreur suppression snapshot:', error);
        showSnapshotNotification(`Erreur: ${error.message}`, 'error');
    }
}

// Fermer le viewer de snapshot
function closeSnapshotViewer() {
    const viewerSection = document.getElementById('snapshot-viewer-section');
    viewerSection.style.display = 'none';
    currentSnapshotData = null;
}

// Initialiser les onglets du viewer
function initializeSnapshotTabs() {
    const tabBtns = document.querySelectorAll('.snapshot-tabs .tab-btn');
    
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.getAttribute('data-tab');
            switchSnapshotTab(targetTab);
        });
    });
}

// Changer d'onglet dans le viewer
function switchSnapshotTab(targetTab) {
    // Désactiver tous les onglets et leurs contenus
    const tabBtns = document.querySelectorAll('.snapshot-tabs .tab-btn');
    const tabPanes = document.querySelectorAll('.tab-content .tab-pane');
    
    tabBtns.forEach(btn => btn.classList.remove('active'));
    tabPanes.forEach(pane => pane.classList.remove('active'));
    
    // Activer l'onglet et le contenu ciblés
    const targetBtn = document.querySelector(`[data-tab="${targetTab}"]`);
    const targetPane = document.getElementById(targetTab);
    
    if (targetBtn && targetPane) {
        targetBtn.classList.add('active');
        targetPane.classList.add('active');
    }
}

// Initialiser les snapshots quand la page est chargée
document.addEventListener('DOMContentLoaded', function() {
    // Attendre un peu pour que le reste de l'app soit initialisé
    setTimeout(() => {
        if (document.getElementById('snapshots-history-section')) {
            initializeSnapshots();
        }
    }, 1000);
});

// Fonction pour gérer les sections collapsibles
function toggleSection(sectionId) {
    const content = document.getElementById(sectionId + '-content');
    const icon = document.getElementById(sectionId + '-icon');
    
    if (content && icon) {
        if (content.style.display === 'none') {
            content.style.display = 'block';
            icon.style.transform = 'rotate(180deg)';
        } else {
            content.style.display = 'none';
            icon.style.transform = 'rotate(0deg)';
        }
    }
}

// Rendre la pagination
function renderPagination(totalPages) {
    return `
        <div class="snapshots-pagination">
            <div class="pagination-info">
                Affichage de ${(currentPage - 1) * itemsPerPage + 1} à ${Math.min(currentPage * itemsPerPage, currentSnapshots.length)} sur ${currentSnapshots.length} snapshots
            </div>
            <div class="pagination-controls">
                <button class="pagination-btn" onclick="changePage(1)" ${currentPage === 1 ? 'disabled' : ''}>
                    <i class="fas fa-angle-double-left"></i>
                </button>
                <button class="pagination-btn" onclick="changePage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>
                    <i class="fas fa-angle-left"></i>
                </button>
                
                ${generatePageNumbers(totalPages).map(page => `
                    <button class="pagination-btn ${page === currentPage ? 'active' : ''}" 
                            onclick="changePage(${page})" 
                            ${typeof page !== 'number' ? 'disabled' : ''}>
                        ${page}
                    </button>
                `).join('')}
                
                <button class="pagination-btn" onclick="changePage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>
                    <i class="fas fa-angle-right"></i>
                </button>
                <button class="pagination-btn" onclick="changePage(${totalPages})" ${currentPage === totalPages ? 'disabled' : ''}>
                    <i class="fas fa-angle-double-right"></i>
                </button>
            </div>
        </div>
    `;
}

// Générer les numéros de pages avec ellipses
function generatePageNumbers(totalPages) {
    const pages = [];
    const maxVisible = 5;
    
    if (totalPages <= maxVisible) {
        for (let i = 1; i <= totalPages; i++) {
            pages.push(i);
        }
    } else {
        pages.push(1);
        
        if (currentPage > 3) {
            pages.push('...');
        }
        
        const start = Math.max(2, currentPage - 1);
        const end = Math.min(totalPages - 1, currentPage + 1);
        
        for (let i = start; i <= end; i++) {
            if (!pages.includes(i)) {
                pages.push(i);
            }
        }
        
        if (currentPage < totalPages - 2) {
            pages.push('...');
        }
        
        if (!pages.includes(totalPages)) {
            pages.push(totalPages);
        }
    }
    
    return pages;
}

// Changer de page
function changePage(page) {
    if (page >= 1 && page <= Math.ceil(currentSnapshots.length / itemsPerPage)) {
        currentPage = page;
        renderSnapshotsList();
        
        // Scroll vers le haut de la liste
        document.getElementById('snapshots-list').scrollIntoView({ 
            behavior: 'smooth', 
            block: 'start' 
        });
    }
}

// Afficher/masquer les comptes vides avec animation
function toggleEmptyAccounts() {
    const emptyAccountRows = document.querySelectorAll('.empty-account');
    const toggleBtn = document.getElementById('toggle-empty-accounts-btn');
    const btnText = document.getElementById('empty-accounts-btn-text');
    const btnIcon = toggleBtn.querySelector('i');
    const summaryText = document.querySelector('.accounts-summary');
    
    if (emptyAccountRows.length === 0) {
        return; // Aucun compte vide à afficher/masquer
    }
    
    // Vérifier l'état actuel (si les comptes vides sont cachés)
    const areHidden = emptyAccountRows[0].style.display === 'none';
    
    // Désactiver temporairement le bouton pendant l'animation
    toggleBtn.disabled = true;
    
    if (areHidden) {
        // Afficher les comptes vides avec animation
        emptyAccountRows.forEach((row, index) => {
            setTimeout(() => {
                row.style.display = '';
                row.classList.add('show');
                setTimeout(() => row.classList.remove('show'), 300);
            }, index * 50); // Décalage pour effet cascade
        });
        
        // Mettre à jour l'interface
        setTimeout(() => {
            btnText.textContent = 'Masquer les comptes vides';
            btnIcon.className = 'fas fa-eye';
            toggleBtn.className = 'btn btn-outline-warning btn-sm';
            if (summaryText) {
                summaryText.style.opacity = '0';
                summaryText.style.display = 'none';
            }
            toggleBtn.disabled = false;
        }, emptyAccountRows.length * 50 + 100);
        
    } else {
        // Masquer les comptes vides avec animation
        emptyAccountRows.forEach((row, index) => {
            setTimeout(() => {
                row.classList.add('hide');
                setTimeout(() => {
                    row.style.display = 'none';
                    row.classList.remove('hide');
                }, 300);
            }, index * 30); // Animation plus rapide pour masquer
        });
        
        // Mettre à jour l'interface
        setTimeout(() => {
            btnText.textContent = 'Afficher les comptes vides';
            btnIcon.className = 'fas fa-eye-slash';
            toggleBtn.className = 'btn btn-outline-secondary btn-sm';
            if (summaryText) {
                summaryText.style.display = 'block';
                summaryText.style.opacity = '1';
            }
            toggleBtn.disabled = false;
        }, emptyAccountRows.length * 30 + 350);
    }
}

// Exporter les fonctions globales
window.viewSnapshot = viewSnapshot;
window.deleteSnapshot = deleteSnapshot;
window.toggleSection = toggleSection;
window.changePage = changePage;
window.toggleEmptyAccounts = toggleEmptyAccounts;
