// ========================================
// 💸 VIREMENT MENSUEL - JavaScript Frontend
// ========================================

// Variables globales
let currentVirementMonth = null;
let virementData = {};
let clientsList = new Set();

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
        badge.innerHTML = `
            <span>${client}</span>
            <i class="fas fa-times-circle remove-icon"></i>
        `;
        badge.onclick = () => removeClient(client);
        container.appendChild(badge);
    });
}

// Afficher le tableau des virements
function renderVirementTable() {
    const tbody = document.getElementById('virement-mensuel-tbody');
    tbody.innerHTML = '';
    
    const clientsArray = Array.from(clientsList).sort();
    
    // Pour chaque date
    Object.keys(virementData).sort().forEach(dateStr => {
        const date = new Date(dateStr + 'T00:00:00');
        const dayName = date.toLocaleDateString('fr-FR', { weekday: 'long' });
        const dayOfWeek = date.getDay();
        const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
        
        // Pour chaque client
        clientsArray.forEach((client, clientIndex) => {
            const valeur = virementData[dateStr][client] || 0;
            
            const tr = document.createElement('tr');
            if (isWeekend) {
                tr.classList.add('weekend-row');
            }
            
            // Afficher la date et le jour seulement pour le premier client
            if (clientIndex === 0) {
                tr.innerHTML = `
                    <td rowspan="${clientsArray.length}">${dateStr}</td>
                    <td rowspan="${clientsArray.length}" class="${isWeekend ? 'day-name weekend' : 'day-name'}">${dayName}</td>
                    <td>
                        <input type="number" 
                               class="virement-input" 
                               value="${valeur || ''}" 
                               data-date="${dateStr}"
                               data-client="${client}"
                               placeholder="0">
                    </td>
                    <td>
                        <input type="text" 
                               class="client-input" 
                               value="${client}" 
                               data-date="${dateStr}"
                               data-old-client="${client}"
                               readonly>
                    </td>
                `;
            } else {
                tr.innerHTML = `
                    <td>
                        <input type="number" 
                               class="virement-input" 
                               value="${valeur || ''}" 
                               data-date="${dateStr}"
                               data-client="${client}"
                               placeholder="0">
                    </td>
                    <td>
                        <input type="text" 
                               class="client-input" 
                               value="${client}" 
                               data-date="${dateStr}"
                               data-old-client="${client}"
                               readonly>
                    </td>
                `;
            }
            
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

// Initialiser au chargement du DOM
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initVirementMensuel);
} else {
    initVirementMensuel();
}

console.log('💸 Module Virement Mensuel chargé');
