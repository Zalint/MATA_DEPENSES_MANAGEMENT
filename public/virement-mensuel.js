// ========================================
// 💸 VIREMENT MENSUEL - JavaScript Frontend
// ========================================

// Variables globales
let currentVirementMonth = null;
let virementData = {};
let clientsList = new Set();
let currentFilters = {
    dateStart: null,
    dateEnd: null,
    client: null,
    excludeZero: false
};

// Initialiser le module Virement Mensuel
function initVirementMensuel() {
    console.log('💸 Initialisation module Virement Mensuel');
    
    // Définir le mois par défaut (mois en cours)
    const today = new Date();
    const currentMonth = `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}`;
    document.getElementById('virement-mensuel-month').value = currentMonth;
    
    // Attacher les événements
    document.getElementById('load-virement-mensuel-btn').addEventListener('click', loadVirementMensuel);
    document.getElementById('save-virement-mensuel-btn').addEventListener('click', saveVirementMensuel);
    document.getElementById('add-client-btn').addEventListener('click', addNewClient);
    document.getElementById('virement-apply-filters-btn').addEventListener('click', applyFilters);
    document.getElementById('virement-reset-filters-btn').addEventListener('click', resetFilters);
    document.getElementById('virement-exclude-zero').addEventListener('change', handleExcludeZeroChange);
    
    // Accordéon pour "Gérer les Clients"
    const accordionHeader = document.getElementById('clients-accordion-header');
    if (accordionHeader) {
        accordionHeader.addEventListener('click', toggleClientsAccordion);
    }
    
    console.log('✅ Module Virement Mensuel initialisé');
}

// Charger les données d'un mois
async function loadVirementMensuel() {
    try {
        const monthInput = document.getElementById('virement-mensuel-month');
        const monthYear = monthInput.value;
        
        if (!monthYear) {
            showNotification('Veuillez sélectionner un mois', 'error');
            return;
        }
        
        console.log(`💸 Chargement Virement Mensuel pour ${monthYear}`);
        
        // Afficher le loading
        const loadBtn = document.getElementById('load-virement-mensuel-btn');
        const originalText = loadBtn.innerHTML;
        loadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Chargement...';
        loadBtn.disabled = true;
        
        currentVirementMonth = monthYear;
        
        // Récupérer les données du mois
        const response = await fetch(`/api/virement-mensuel/${monthYear}`);
        
        if (!response.ok) {
            let errorMsg = 'Erreur lors du chargement des données';
            try {
                const errorData = await response.json();
                errorMsg = errorData.error || errorMsg;
            } catch (e) {
                errorMsg = await response.text() || errorMsg;
            }
            console.error('❌ Erreur chargement:', errorMsg);
            throw new Error(errorMsg);
        }
        
        const data = await response.json();
        
        console.log(`💸 Données reçues:`, data);
        
        // Générer toutes les dates du mois
        const [year, month] = monthYear.split('-').map(Number);
        // Calculer le nombre de jours en utilisant une chaîne de date explicite
        const nextMonth = month === 12 ? 1 : month + 1;
        const nextYear = month === 12 ? year + 1 : year;
        const lastDayDate = new Date(`${nextYear}-${nextMonth.toString().padStart(2, '0')}-01T00:00:00`);
        lastDayDate.setDate(lastDayDate.getDate() - 1);
        const daysInMonth = lastDayDate.getDate();
        
        // Réinitialiser les données
        virementData = {};
        clientsList = new Set(); // Pas de clients par défaut - uniquement ceux de la DB
        
        // Remplir avec les dates du mois
        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
            virementData[dateStr] = {};
        }
        
        // Ajouter les données existantes
        if (data.data && Array.isArray(data.data)) {
            data.data.forEach(row => {
                const dateStr = row.date;
                const client = row.client;
                const valeur = parseInt(row.valeur) || 0;
                
                if (!virementData[dateStr]) {
                    virementData[dateStr] = {};
                }
                
                virementData[dateStr][client] = valeur;
                clientsList.add(client);
            });
        }
        
        // Afficher les badges des clients
        renderClientsBadges();
        
        // Initialiser les filtres
        initializeFilters();
        
        // Afficher les données
        renderVirementTable();
        
        // Calculer et afficher les totaux
        await calculateAndDisplayTotals();
        
        // Afficher la zone principale
        document.getElementById('virement-mensuel-main-content').style.display = 'block';
        
        // Mettre à jour le titre
        const monthName = new Date(`${year}-${month.toString().padStart(2, '0')}-01T00:00:00`).toLocaleDateString('fr-FR', { 
            month: 'long', 
            year: 'numeric' 
        });
        document.getElementById('virement-mensuel-month-title').textContent = `Mois : ${monthName}`;
        
        // Activer le bouton sauvegarder
        document.getElementById('save-virement-mensuel-btn').disabled = false;
        
        // Afficher les permissions
        updatePermissionsInfo();
        
        // Restaurer le bouton
        loadBtn.innerHTML = originalText;
        loadBtn.disabled = false;
        
        showNotification(`Données de ${monthName} chargées`, 'success');
        
    } catch (error) {
        console.error('❌ Erreur chargement Virement Mensuel:', error);
        showNotification('Erreur lors du chargement des données', 'error');
        
        // Restaurer le bouton
        const loadBtn = document.getElementById('load-virement-mensuel-btn');
        loadBtn.innerHTML = '<i class="fas fa-calendar-alt"></i> Charger le mois';
        loadBtn.disabled = false;
    }
}

// Ajouter un nouveau client
function addNewClient() {
    const input = document.getElementById('new-client-name');
    const clientName = input.value.trim();
    
    if (!clientName) {
        showNotification('Veuillez entrer un nom de client', 'error');
        return;
    }
    
    if (clientsList.has(clientName)) {
        showNotification('Ce client existe déjà', 'error');
        return;
    }
    
    // Ajouter le client
    clientsList.add(clientName);
    
    // Initialiser les données pour ce client
    Object.keys(virementData).forEach(date => {
        if (!virementData[date][clientName]) {
            virementData[date][clientName] = 0;
        }
    });
    
    // Réafficher
    renderClientsBadges();
    renderVirementTable();
    calculateAndDisplayTotals();
    
    // Vider l'input
    input.value = '';
    
    showNotification(`Client "${clientName}" ajouté`, 'success');
}

// Supprimer un client
async function removeClient(clientName) {
    if (!confirm(`Voulez-vous vraiment supprimer le client "${clientName}" ?\n\nToutes ses données seront supprimées immédiatement.`)) {
        return;
    }
    
    try {
        // Appeler l'API pour supprimer le client de la base de données
        if (currentVirementMonth) {
            const response = await fetch(`/api/virement-mensuel/${currentVirementMonth}/client/${encodeURIComponent(clientName)}`, {
                method: 'DELETE'
            });
            
            const result = await response.json();
            
            if (!result.success) {
                throw new Error(result.error || 'Erreur lors de la suppression');
            }
            
            console.log(`💸 Client supprimé en base:`, result);
        }
        
        // Retirer le client de l'UI
        clientsList.delete(clientName);
        
        // Supprimer les données de ce client
        Object.keys(virementData).forEach(date => {
            delete virementData[date][clientName];
        });
        
        // Réafficher
        renderClientsBadges();
        renderVirementTable();
        calculateAndDisplayTotals();
        
        showNotification(`Client "${clientName}" supprimé avec succès`, 'success');
        
    } catch (error) {
        console.error('❌ Erreur suppression client:', error);
        showNotification('Erreur lors de la suppression: ' + error.message, 'error');
    }
}

// Afficher les badges des clients
function renderClientsBadges() {
    const container = document.getElementById('active-clients-badges');
    container.innerHTML = '';
    
    const clientsArray = Array.from(clientsList).sort();
    
    clientsArray.forEach(client => {
        const badge = document.createElement('div');
        badge.className = 'client-badge';
        
        // Create client name span
        const clientSpan = document.createElement('span');
        clientSpan.textContent = client;
        badge.appendChild(clientSpan);
        
        // Create remove icon
        const removeIcon = document.createElement('i');
        removeIcon.className = 'fas fa-times-circle remove-icon';
        badge.appendChild(removeIcon);
        
        badge.onclick = () => removeClient(client);
        container.appendChild(badge);
    });
    
    // Mettre à jour le select des filtres
    updateClientFilterSelect();
}

// Mettre à jour le select des clients dans les filtres
function updateClientFilterSelect() {
    const select = document.getElementById('virement-filter-client');
    const currentValue = select.value;
    
    select.innerHTML = '<option value="">Tous les clients</option>';
    
    const clientsArray = Array.from(clientsList).sort();
    clientsArray.forEach(client => {
        const option = document.createElement('option');
        option.value = client;
        option.textContent = client;
        select.appendChild(option);
    });
    
    // Restaurer la valeur sélectionnée si elle existe toujours
    if (currentValue && clientsArray.includes(currentValue)) {
        select.value = currentValue;
    }
}

// Initialiser les filtres de date avec les valeurs par défaut
function initializeFilters() {
    if (!currentVirementMonth) return;
    
    // Obtenir le premier et dernier jour du mois
    const [year, month] = currentVirementMonth.split('-').map(Number);
    const firstDay = `${year}-${month.toString().padStart(2, '0')}-01`;
    
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    const lastDayDate = new Date(`${nextYear}-${nextMonth.toString().padStart(2, '0')}-01T00:00:00`);
    lastDayDate.setDate(lastDayDate.getDate() - 1);
    const lastDay = `${year}-${month.toString().padStart(2, '0')}-${lastDayDate.getDate().toString().padStart(2, '0')}`;
    
    // Mettre la date du jour par défaut si on est dans le mois en cours
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getDate().toString().padStart(2, '0')}`;
    
    // Si aujourd'hui est dans le mois chargé, utiliser aujourd'hui pour les deux dates, sinon utiliser le premier et dernier jour du mois
    const defaultStartDate = (todayStr >= firstDay && todayStr <= lastDay) ? todayStr : firstDay;
    const defaultEndDate = (todayStr >= firstDay && todayStr <= lastDay) ? todayStr : lastDay;
    
    document.getElementById('virement-filter-date-start').value = defaultStartDate;
    document.getElementById('virement-filter-date-end').value = defaultEndDate;
    document.getElementById('virement-filter-client').value = '';
    document.getElementById('virement-exclude-zero').checked = false;
    
    // Appliquer automatiquement les filtres par défaut
    currentFilters = {
        dateStart: defaultStartDate,
        dateEnd: defaultEndDate,
        client: null,
        excludeZero: false
    };
    
    updateFiltersStatus();
}

// Appliquer les filtres
function applyFilters() {
    const dateStart = document.getElementById('virement-filter-date-start').value;
    const dateEnd = document.getElementById('virement-filter-date-end').value;
    const client = document.getElementById('virement-filter-client').value;
    const excludeZero = document.getElementById('virement-exclude-zero').checked;
    
    // Valider que date début <= date fin
    if (dateStart && dateEnd && dateStart > dateEnd) {
        showNotification('La date de début doit être avant la date de fin', 'error');
        return;
    }
    
    currentFilters = {
        dateStart: dateStart || null,
        dateEnd: dateEnd || null,
        client: client || null,
        excludeZero: excludeZero
    };
    
    console.log('💸 Filtres appliqués:', currentFilters);
    
    renderVirementTable();
    updateFiltersStatus();
    showNotification('Filtres appliqués', 'success');
}

// Gérer le changement du checkbox "Exclure valeurs à 0"
function handleExcludeZeroChange() {
    const excludeZero = document.getElementById('virement-exclude-zero').checked;
    currentFilters.excludeZero = excludeZero;
    
    console.log('💸 Filtre exclure zéro:', excludeZero);
    
    renderVirementTable();
    updateFiltersStatus();
}

// Réinitialiser les filtres
function resetFilters() {
    initializeFilters();
    renderVirementTable();
    showNotification('Filtres réinitialisés', 'info');
}

// Mettre à jour le statut des filtres
function updateFiltersStatus() {
    const statusSpan = document.getElementById('virement-filters-status');
    
    const activeFilters = [];
    
    if (currentFilters.dateStart && currentFilters.dateEnd) {
        activeFilters.push(`Dates: ${currentFilters.dateStart} au ${currentFilters.dateEnd}`);
    } else if (currentFilters.dateStart) {
        activeFilters.push(`À partir du: ${currentFilters.dateStart}`);
    } else if (currentFilters.dateEnd) {
        activeFilters.push(`Jusqu'au: ${currentFilters.dateEnd}`);
    }
    
    if (currentFilters.client) {
        activeFilters.push(`Client: ${currentFilters.client}`);
    }
    
    if (currentFilters.excludeZero) {
        activeFilters.push(`Valeurs à 0 masquées`);
    }
    
    if (activeFilters.length > 0) {
        statusSpan.textContent = 'Filtres actifs: ' + activeFilters.join(' | ');
        statusSpan.style.color = '#0066cc';
        statusSpan.style.fontWeight = '600';
    } else {
        statusSpan.textContent = 'Aucun filtre actif';
        statusSpan.style.color = '#6c757d';
        statusSpan.style.fontWeight = 'normal';
    }
}

// Afficher le tableau des virements
function renderVirementTable() {
    const tbody = document.getElementById('virement-mensuel-tbody');
    tbody.innerHTML = '';
    
    let clientsArray = Array.from(clientsList).sort();
    
    // Appliquer le filtre client
    if (currentFilters.client) {
        clientsArray = clientsArray.filter(c => c === currentFilters.client);
    }
    
    // Si aucun client après filtrage, afficher un message
    if (clientsArray.length === 0) {
        const tr = document.createElement('tr');
        tr.innerHTML = '<td colspan="4" style="text-align: center; padding: 20px; color: #6c757d;">Aucun client ne correspond aux filtres</td>';
        tbody.appendChild(tr);
        return;
    }
    
    // Filtrer les dates
    const dates = Object.keys(virementData).sort().filter(dateStr => {
        // Appliquer le filtre de date début
        if (currentFilters.dateStart && dateStr < currentFilters.dateStart) {
            return false;
        }
        // Appliquer le filtre de date fin
        if (currentFilters.dateEnd && dateStr > currentFilters.dateEnd) {
            return false;
        }
        return true;
    });
    
    // Si aucune date après filtrage, afficher un message
    if (dates.length === 0) {
        const tr = document.createElement('tr');
        tr.innerHTML = '<td colspan="4" style="text-align: center; padding: 20px; color: #6c757d;">Aucune date ne correspond aux filtres</td>';
        tbody.appendChild(tr);
        return;
    }
    
    // Pour chaque date
    dates.forEach(dateStr => {
        const date = new Date(dateStr + 'T00:00:00');
        const dayName = date.toLocaleDateString('fr-FR', { weekday: 'long' });
        const dayOfWeek = date.getDay();
        const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
        
        // Filtrer les clients avec valeur > 0 si excludeZero est actif
        let clientsToDisplay = clientsArray;
        if (currentFilters.excludeZero) {
            clientsToDisplay = clientsArray.filter(client => {
                const valeur = virementData[dateStr][client] || 0;
                return valeur > 0;
            });
        }
        
        // Si aucun client à afficher pour cette date, passer à la date suivante
        if (clientsToDisplay.length === 0) {
            return;
        }
        
        // Pour chaque client
        clientsToDisplay.forEach((client, clientIndex) => {
            const valeur = virementData[dateStr][client] || 0;
            
            const tr = document.createElement('tr');
            if (isWeekend) {
                tr.classList.add('weekend-row');
            }
            
            // Afficher la date et le jour seulement pour le premier client
            if (clientIndex === 0) {
                // Create date cell
                const dateTd = document.createElement('td');
                dateTd.setAttribute('rowspan', clientsToDisplay.length.toString());
                dateTd.textContent = dateStr;
                tr.appendChild(dateTd);
                
                // Create day name cell
                const dayTd = document.createElement('td');
                dayTd.setAttribute('rowspan', clientsToDisplay.length.toString());
                dayTd.className = isWeekend ? 'day-name weekend' : 'day-name';
                dayTd.textContent = dayName;
                tr.appendChild(dayTd);
            }
            
            // Create virement input cell
            const virementTd = document.createElement('td');
            const virementInput = document.createElement('input');
            virementInput.type = 'number';
            virementInput.className = 'virement-input';
            virementInput.value = valeur || '';
            virementInput.setAttribute('data-date', dateStr);
            virementInput.setAttribute('data-client', client);
            virementInput.placeholder = '0';
            virementTd.appendChild(virementInput);
            tr.appendChild(virementTd);
            
            // Create client input cell
            const clientTd = document.createElement('td');
            const clientInput = document.createElement('input');
            clientInput.type = 'text';
            clientInput.className = 'client-input';
            clientInput.value = client;
            clientInput.setAttribute('data-date', dateStr);
            clientInput.setAttribute('data-old-client', client);
            clientInput.readOnly = true;
            clientTd.appendChild(clientInput);
            tr.appendChild(clientTd);
            
            tbody.appendChild(tr);
        });
    });
    
    // Attacher les événements de changement
    tbody.querySelectorAll('.virement-input').forEach(input => {
        input.addEventListener('change', handleVirementInputChange);
    });
}

// Gérer le changement de valeur
function handleVirementInputChange(event) {
    const input = event.target;
    const date = input.getAttribute('data-date');
    const client = input.getAttribute('data-client');
    const valeur = parseInt(input.value) || 0;
    
    // Mettre à jour les données
    if (!virementData[date]) {
        virementData[date] = {};
    }
    virementData[date][client] = valeur;
    
    console.log(`💸 Modification: ${date} - ${client} = ${valeur}`);
    
    // Recalculer les totaux
    calculateAndDisplayTotals();
}

// Calculer et afficher les totaux
async function calculateAndDisplayTotals() {
    let totalGeneral = 0;
    const totalsByClient = {};
    
    // Calculer les totaux
    Object.keys(virementData).forEach(date => {
        Object.keys(virementData[date]).forEach(client => {
            const valeur = virementData[date][client] || 0;
            totalGeneral += valeur;
            
            if (!totalsByClient[client]) {
                totalsByClient[client] = 0;
            }
            totalsByClient[client] += valeur;
        });
    });
    
    // Afficher le total général
    document.getElementById('virement-mensuel-total').textContent = formatCurrency(totalGeneral);
    
    // Afficher les totaux par client
    const clientsContainer = document.getElementById('virement-clients-totaux');
    clientsContainer.innerHTML = '';
    
    Object.keys(totalsByClient).sort().forEach(client => {
        const total = totalsByClient[client];
        
        if (total > 0) {
            const card = document.createElement('div');
            card.className = 'client-total-card';
            card.innerHTML = `
                <div class="client-name">${client}</div>
                <div class="client-amount">${formatCurrency(total)}</div>
            `;
            clientsContainer.appendChild(card);
        }
    });
    
    console.log(`💸 Total général: ${formatCurrency(totalGeneral)}`);
    console.log(`💸 Totaux par client:`, totalsByClient);
}

// Sauvegarder les données
async function saveVirementMensuel() {
    try {
        if (!currentVirementMonth) {
            showNotification('Aucun mois chargé', 'error');
            return;
        }
        
        console.log(`💸 Sauvegarde Virement Mensuel pour ${currentVirementMonth}`);
        
        // Préparer les données à envoyer (uniquement les clients actifs)
        const dataToSend = [];
        
        Object.keys(virementData).forEach(date => {
            // Sauvegarder uniquement les clients actifs
            Array.from(clientsList).forEach(client => {
                const valeur = virementData[date][client] || 0;
                
                dataToSend.push({
                    date: date,
                    valeur: valeur,
                    client: client
                });
            });
        });
        
        console.log(`💸 Envoi de ${dataToSend.length} enregistrements`);
        
        // Afficher le loading
        const saveBtn = document.getElementById('save-virement-mensuel-btn');
        const originalText = saveBtn.innerHTML;
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sauvegarde...';
        saveBtn.disabled = true;
        
        // Envoyer au serveur
        const response = await fetch(`/api/virement-mensuel/${currentVirementMonth}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ data: dataToSend })
        });
        
        if (!response.ok) {
            let errorMsg = 'Erreur lors de la sauvegarde';
            try {
                const errorData = await response.json();
                errorMsg = errorData.error || errorMsg;
            } catch (e) {
                errorMsg = await response.text() || errorMsg;
            }
            console.error('❌ Erreur sauvegarde:', errorMsg);
            throw new Error(errorMsg);
        }
        
        const result = await response.json();
        
        if (result.success) {
            console.log(`✅ Sauvegarde réussie:`, result.stats);
            showNotification('Données sauvegardées avec succès', 'success');
            
            // Recharger pour synchroniser
            await loadVirementMensuel();
        } else {
            throw new Error(result.message || 'Erreur de sauvegarde');
        }
        
        // Restaurer le bouton
        saveBtn.innerHTML = originalText;
        saveBtn.disabled = false;
        
    } catch (error) {
        console.error('❌ Erreur sauvegarde Virement Mensuel:', error);
        showNotification('Erreur lors de la sauvegarde: ' + error.message, 'error');
        
        // Restaurer le bouton
        const saveBtn = document.getElementById('save-virement-mensuel-btn');
        saveBtn.innerHTML = '<i class="fas fa-save"></i> Sauvegarder';
        saveBtn.disabled = false;
    }
}

// Mettre à jour les informations de permissions
function updatePermissionsInfo() {
    const permissionsText = document.getElementById('virement-permissions-text');
    const userRole = window.currentUser?.role || 'unknown';
    
    const currentDate = new Date();
    const currentMonthYear = `${currentDate.getFullYear()}-${(currentDate.getMonth() + 1).toString().padStart(2, '0')}`;
    
    if (userRole === 'admin') {
        permissionsText.textContent = '✅ Admin: Vous pouvez modifier tous les mois';
    } else if (currentVirementMonth === currentMonthYear) {
        permissionsText.textContent = '✅ Vous pouvez modifier le mois en cours';
    } else {
        permissionsText.textContent = '⚠️ Vous ne pouvez modifier que le mois en cours';
        document.getElementById('save-virement-mensuel-btn').disabled = true;
    }
}

// Fonction utilitaire pour formater la monnaie
function formatCurrency(amount) {
    return parseInt(amount || 0).toLocaleString('fr-FR') + ' FCFA';
}

// Toggle accordéon "Gérer les Clients"
function toggleClientsAccordion() {
    const header = document.getElementById('clients-accordion-header');
    const content = document.getElementById('clients-accordion-content');
    
    if (header && content) {
        const isCollapsed = header.classList.toggle('collapsed');
        content.classList.toggle('collapsed');
        // Update ARIA attribute for accessibility
        header.setAttribute('aria-expanded', !isCollapsed);
    }
}

// Initialiser au chargement du DOM
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initVirementMensuel);
} else {
    initVirementMensuel();
}

console.log('💸 Module Virement Mensuel chargé');
