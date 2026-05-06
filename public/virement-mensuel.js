// ========================================
// 💸 VIREMENT MENSUEL - JavaScript Frontend
// ========================================

// Variables globales
let currentVirementMonth = null;
let virementData = {};
let clientsList = new Set();
// Métadonnées par client : Map<client_name, {point_de_vente: string|null, is_internal: boolean}>
let virementClientsMap = new Map();
// Liste des points de vente disponibles (chargée depuis /api/points-de-vente)
let pointsDeVente = [];
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
    document.getElementById('virement-export-excel-btn').addEventListener('click', exportVirementsToExcel);
    document.getElementById('virement-exclude-zero').addEventListener('change', handleExcludeZeroChange);

    // Accordéon pour "Gérer les Clients"
    const accordionHeader = document.getElementById('clients-accordion-header');
    if (accordionHeader) {
        accordionHeader.addEventListener('click', toggleClientsAccordion);
    }

    // Charger en arrière-plan les métadonnées clients et la liste des points de vente
    loadPointsDeVente();
    loadVirementClientsMeta();

    console.log('✅ Module Virement Mensuel initialisé');
}

// Charge la liste des points de vente actifs et peuple le <select>
async function loadPointsDeVente() {
    try {
        const response = await fetch('/api/points-de-vente');
        if (!response.ok) {
            console.warn('⚠️ Impossible de charger /api/points-de-vente:', response.status);
            return;
        }
        pointsDeVente = await response.json();

        const select = document.getElementById('new-client-pdv');
        if (!select) return;
        // On garde la première option ("Aucun point de vente") et on remplace le reste
        const placeholder = select.querySelector('option[value=""]');
        select.innerHTML = '';
        if (placeholder) select.appendChild(placeholder);
        for (const pdv of pointsDeVente) {
            const opt = document.createElement('option');
            opt.value = pdv;
            opt.textContent = pdv; // textContent : pas d'injection HTML
            select.appendChild(opt);
        }
    } catch (error) {
        console.warn('⚠️ Erreur chargement points de vente:', error);
    }
}

// Charge les métadonnées clients (point_de_vente + is_internal) depuis la DB
async function loadVirementClientsMeta() {
    try {
        const response = await fetch('/api/virement-clients');
        if (!response.ok) {
            console.warn('⚠️ Impossible de charger /api/virement-clients:', response.status);
            return;
        }
        const rows = await response.json();
        virementClientsMap = new Map(
            rows.map(r => [r.client_name, { point_de_vente: r.point_de_vente, is_internal: r.is_internal === true }])
        );
        // Si des badges sont déjà affichés, les rafraîchir pour faire apparaître les POS
        if (clientsList.size > 0) {
            renderClientsBadges();
        }
    } catch (error) {
        console.warn('⚠️ Erreur chargement metadata clients:', error);
    }
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

        // S'assurer que les clients déclarés dans virement_clients (métadonnées en DB)
        // apparaissent même s'ils n'ont aucune ligne dans virement_mensuel pour ce mois.
        // Sinon un client créé via le formulaire mais sauvegardé avec uniquement des 0
        // disparaît au rechargement (la sauvegarde ne persiste pas les valeurs nulles).
        // On rafraîchit d'abord la map au cas où d'autres onglets auraient ajouté un client.
        await loadVirementClientsMeta();
        for (const clientName of virementClientsMap.keys()) {
            if (!clientsList.has(clientName)) {
                clientsList.add(clientName);
                Object.keys(virementData).forEach(dateStr => {
                    if (virementData[dateStr][clientName] === undefined) {
                        virementData[dateStr][clientName] = 0;
                    }
                });
            }
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

// Ajouter un nouveau client (persiste en DB via /api/virement-clients)
async function addNewClient() {
    const input = document.getElementById('new-client-name');
    const pdvSelect = document.getElementById('new-client-pdv');
    const internalCheckbox = document.getElementById('new-client-internal');

    const clientName = input.value.trim();
    const pointDeVente = pdvSelect ? pdvSelect.value || null : null;
    const isInternal = internalCheckbox ? internalCheckbox.checked : false;

    if (!clientName) {
        showNotification('Veuillez entrer un nom de client', 'error');
        return;
    }
    // Validation côté client : caractères dangereux
    if (/[<>{}]/.test(clientName)) {
        showNotification('Le nom du client contient des caractères interdits (<, >, {, })', 'error');
        return;
    }

    // Vérification de doublon insensible à la casse : "ABC" et "abc" sont considérés
    // comme le même client. On compare contre les badges affichés ET contre les
    // métadonnées DB (qui peuvent contenir des clients sans virement saisi).
    const lowerName = clientName.toLowerCase();
    const dupFromBadges = Array.from(clientsList).find(c => c.toLowerCase() === lowerName);
    const dupFromMeta = Array.from(virementClientsMap.keys()).find(c => c.toLowerCase() === lowerName);
    const existing = dupFromBadges || dupFromMeta;
    if (existing) {
        showNotification(`Ce client existe déjà sous le nom "${existing}" (insensible à la casse)`, 'error');
        return;
    }

    // Persister la métadonnée en DB (point de vente + is_internal)
    try {
        const response = await fetch('/api/virement-clients', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                client_name: clientName,
                point_de_vente: pointDeVente,
                is_internal: isInternal
            })
        });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error || `Erreur HTTP ${response.status}`);
        }
        const saved = await response.json();
        virementClientsMap.set(saved.client_name, {
            point_de_vente: saved.point_de_vente,
            is_internal: saved.is_internal === true
        });
    } catch (error) {
        console.error('❌ Erreur création client:', error);
        showNotification(`Erreur création client: ${error.message}`, 'error');
        return;
    }

    // Ajouter le client à l'UI
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

    // Vider les inputs
    input.value = '';
    if (pdvSelect) pdvSelect.value = '';
    if (internalCheckbox) internalCheckbox.checked = false;

    showNotification(`Client "${clientName}" ajouté`, 'success');
}

// Modale d'édition de métadonnées client (remplace prompt + confirm natifs).
// Affiche un <select> de points de vente connus + une checkbox "interne", retourne
// une Promise<{ point_de_vente: string|null, is_internal: boolean } | null>.
// `null` = utilisateur a annulé. Tous les textes sont insérés via textContent (pas d'XSS).
function editClientMetaModal({ clientName, currentPointDeVente, currentIsInternal, pointsDeVenteList }) {
    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.className = 'confirm-modal-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');

        const dialog = document.createElement('div');
        dialog.className = 'confirm-modal-dialog edit-client-modal';

        const titleEl = document.createElement('div');
        titleEl.className = 'confirm-modal-title';
        titleEl.textContent = `Modifier "${clientName}"`;
        dialog.appendChild(titleEl);

        // Select Point de vente
        const pdvFieldId = 'edit-client-pdv-' + Date.now();
        const pdvLabel = document.createElement('label');
        pdvLabel.className = 'edit-client-field-label';
        pdvLabel.htmlFor = pdvFieldId;
        pdvLabel.textContent = 'Point de vente';
        dialog.appendChild(pdvLabel);

        const select = document.createElement('select');
        select.id = pdvFieldId;
        select.className = 'form-control edit-client-pdv-select';

        const noneOpt = document.createElement('option');
        noneOpt.value = '';
        noneOpt.textContent = 'Aucun point de vente';
        select.appendChild(noneOpt);

        // Construire la liste des choix : la liste connue + la valeur actuelle si elle est inconnue
        const choices = Array.isArray(pointsDeVenteList) ? pointsDeVenteList.slice() : [];
        if (currentPointDeVente && !choices.includes(currentPointDeVente)) {
            choices.unshift(currentPointDeVente);
        }
        for (const pdv of choices) {
            const opt = document.createElement('option');
            opt.value = pdv;
            opt.textContent = pdv;
            if (pdv === currentPointDeVente) opt.selected = true;
            select.appendChild(opt);
        }
        dialog.appendChild(select);

        // Checkbox is_internal
        const internalLabel = document.createElement('label');
        internalLabel.className = 'edit-client-internal';
        const internalCb = document.createElement('input');
        internalCb.type = 'checkbox';
        internalCb.checked = currentIsInternal === true;
        internalLabel.appendChild(internalCb);
        const internalText = document.createElement('span');
        internalText.textContent = ' Virement interne (exclu de l\'API externe)';
        internalLabel.appendChild(internalText);
        dialog.appendChild(internalLabel);

        // Boutons
        const actions = document.createElement('div');
        actions.className = 'confirm-modal-actions';

        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'btn btn-secondary confirm-modal-cancel';
        cancelBtn.textContent = 'Annuler';

        const saveBtn = document.createElement('button');
        saveBtn.type = 'button';
        saveBtn.className = 'btn btn-primary confirm-modal-ok';
        saveBtn.textContent = 'Enregistrer';

        actions.appendChild(cancelBtn);
        actions.appendChild(saveBtn);
        dialog.appendChild(actions);
        overlay.appendChild(dialog);

        const previouslyFocused = document.activeElement;
        const close = (result) => {
            overlay.removeEventListener('click', onOverlayClick);
            document.removeEventListener('keydown', onKey);
            overlay.classList.add('confirm-modal-closing');
            setTimeout(() => overlay.remove(), 120);
            if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
                previouslyFocused.focus();
            }
            resolve(result);
        };

        const onOverlayClick = (event) => { if (event.target === overlay) close(null); };
        const onKey = (event) => {
            if (event.key === 'Escape') { event.preventDefault(); close(null); }
            // Pas de Enter→submit ici : un select ouvert capture Enter, et on évite
            // un submit accidentel en cours d'édition de la checkbox.
        };

        cancelBtn.addEventListener('click', () => close(null));
        saveBtn.addEventListener('click', () => {
            const chosenPdv = select.value || null;
            // Validation : si l'utilisateur a sélectionné un PdV, il doit faire partie des choix proposés
            // (impossible normalement avec un <select>, mais on défend en profondeur).
            if (chosenPdv !== null && !choices.includes(chosenPdv)) {
                showNotification('Point de vente invalide', 'error');
                return;
            }
            close({ point_de_vente: chosenPdv, is_internal: internalCb.checked });
        });
        overlay.addEventListener('click', onOverlayClick);
        document.addEventListener('keydown', onKey);

        document.body.appendChild(overlay);
        select.focus();
    });
}

// Modifier les métadonnées d'un client existant (point de vente + is_internal)
async function editClientMeta(clientName) {
    const meta = virementClientsMap.get(clientName) || { point_de_vente: null, is_internal: false };

    const result = await editClientMetaModal({
        clientName,
        currentPointDeVente: meta.point_de_vente,
        currentIsInternal: meta.is_internal,
        pointsDeVenteList: pointsDeVente
    });
    if (result === null) return; // utilisateur a annulé : aucun appel réseau

    const { point_de_vente: newPdv, is_internal: newInternal } = result;

    try {
        const response = await fetch(`/api/virement-clients/${encodeURIComponent(clientName)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ point_de_vente: newPdv, is_internal: newInternal })
        });

        if (response.ok) {
            const updated = await response.json();
            virementClientsMap.set(updated.client_name, {
                point_de_vente: updated.point_de_vente,
                is_internal: updated.is_internal === true
            });
        } else if (response.status === 404) {
            // Client connu uniquement via virement_mensuel, pas encore de métadonnée → on crée
            const createRes = await fetch('/api/virement-clients', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    client_name: clientName,
                    point_de_vente: newPdv,
                    is_internal: newInternal
                })
            });
            if (!createRes.ok) {
                const e2 = await createRes.json().catch(() => ({}));
                throw new Error(e2.error || `Erreur HTTP ${createRes.status}`);
            }
            const created = await createRes.json();
            virementClientsMap.set(created.client_name, {
                point_de_vente: created.point_de_vente,
                is_internal: created.is_internal === true
            });
        } else {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error || `Erreur HTTP ${response.status}`);
        }

        renderClientsBadges();
        showNotification(`Client "${clientName}" mis à jour`, 'success');
    } catch (error) {
        console.error('❌ Erreur mise à jour client:', error);
        showNotification(`Erreur mise à jour: ${error.message}`, 'error');
    }
}

// Supprimer un client
async function removeClient(clientName) {
    const confirmed = await confirmModal({
        title: 'Supprimer le client',
        message: `Voulez-vous vraiment supprimer le client "${clientName}" ?\n\nToutes ses lignes de virement pour ce mois ainsi que ses métadonnées (point de vente, flag interne) seront supprimées définitivement.`,
        okLabel: 'Supprimer',
        cancelLabel: 'Annuler',
        danger: true
    });
    if (!confirmed) return;

    try {
        // 1. Supprimer les lignes de virement_mensuel pour le mois courant
        if (currentVirementMonth) {
            const response = await fetch(`/api/virement-mensuel/${currentVirementMonth}/client/${encodeURIComponent(clientName)}`, {
                method: 'DELETE'
            });
            const result = await response.json();
            if (!result.success) {
                throw new Error(result.error || 'Erreur suppression virements du mois');
            }
            console.log(`💸 Virements du mois supprimés:`, result);
        }

        // 2. Supprimer la métadonnée du client dans virement_clients.
        // Sinon le client réapparaît au prochain rechargement (loadVirementMensuel le récupère
        // depuis virementClientsMap pour les clients qui ont une métadonnée mais pas encore de virement).
        // 404 = pas de métadonnée → on ignore silencieusement (le client n'avait que des virements).
        const metaResponse = await fetch(`/api/virement-clients/${encodeURIComponent(clientName)}`, {
            method: 'DELETE'
        });
        if (metaResponse.ok) {
            console.log(`💸 Métadonnée client supprimée: ${clientName}`);
        } else if (metaResponse.status !== 404) {
            // Erreur réelle — on log mais on continue le nettoyage UI pour ne pas laisser un état incohérent
            const metaErr = await metaResponse.json().catch(() => ({}));
            console.warn(`⚠️ Échec suppression métadonnée client "${clientName}":`, metaErr.error || metaResponse.status);
        }

        // 3. Retirer du state local
        clientsList.delete(clientName);
        virementClientsMap.delete(clientName);
        Object.keys(virementData).forEach(date => {
            delete virementData[date][clientName];
        });

        // 4. Réafficher
        renderClientsBadges();
        renderVirementTable();
        calculateAndDisplayTotals();

        showNotification(`Client "${clientName}" supprimé avec succès`, 'success');

    } catch (error) {
        console.error('❌ Erreur suppression client:', error);
        showNotification('Erreur lors de la suppression: ' + error.message, 'error');
    }
}

// Afficher les badges des clients (avec point de vente et flag interne)
function renderClientsBadges() {
    const container = document.getElementById('active-clients-badges');
    container.innerHTML = '';

    const clientsArray = Array.from(clientsList).sort();

    clientsArray.forEach(client => {
        const meta = virementClientsMap.get(client) || { point_de_vente: null, is_internal: false };

        const badge = document.createElement('div');
        badge.className = meta.is_internal ? 'client-badge is-internal' : 'client-badge';
        if (meta.is_internal) {
            badge.title = 'Virement interne — exclu de l\'API externe';
        }

        // Nom du client (textContent, jamais innerHTML)
        const clientSpan = document.createElement('span');
        clientSpan.textContent = client;
        badge.appendChild(clientSpan);

        // Pastille point de vente (vide affiche un tiret en italique)
        const pdvSpan = document.createElement('span');
        pdvSpan.className = meta.point_de_vente ? 'client-badge-pdv' : 'client-badge-pdv empty';
        pdvSpan.textContent = meta.point_de_vente || '—';
        badge.appendChild(pdvSpan);

        // Crayon d'édition (button focusable au clavier, accessible aux lecteurs d'écran)
        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'client-badge-action edit-icon';
        editBtn.title = 'Modifier le point de vente / flag interne';
        editBtn.setAttribute('aria-label', `Modifier le client ${client}`);
        const editIconEl = document.createElement('i');
        editIconEl.className = 'fas fa-pencil-alt';
        editIconEl.setAttribute('aria-hidden', 'true');
        editBtn.appendChild(editIconEl);
        editBtn.onclick = (event) => {
            event.stopPropagation();
            editClientMeta(client);
        };
        badge.appendChild(editBtn);

        // Croix de suppression (idem)
        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'client-badge-action remove-icon';
        removeBtn.title = 'Supprimer le client';
        removeBtn.setAttribute('aria-label', `Supprimer le client ${client}`);
        const removeIconEl = document.createElement('i');
        removeIconEl.className = 'fas fa-times-circle';
        removeIconEl.setAttribute('aria-hidden', 'true');
        removeBtn.appendChild(removeIconEl);
        removeBtn.onclick = (event) => {
            event.stopPropagation();
            removeClient(client);
        };
        badge.appendChild(removeBtn);

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

// Exporter les virements en Excel (respecte date début, date fin et filtre client)
function exportVirementsToExcel() {
    if (!currentVirementMonth || Object.keys(virementData).length === 0) {
        showNotification('Aucune donnée à exporter. Chargez d\'abord un mois.', 'warning');
        return;
    }

    const dateStart = document.getElementById('virement-filter-date-start').value;
    const dateEnd = document.getElementById('virement-filter-date-end').value;

    if (!dateStart || !dateEnd) {
        showNotification('Veuillez définir les dates de début et de fin avant l\'export', 'warning');
        return;
    }

    if (dateStart > dateEnd) {
        showNotification('La date de début doit être avant la date de fin', 'error');
        return;
    }

    let clientsArray = Array.from(clientsList).sort();
    const clientFilter = document.getElementById('virement-filter-client').value;
    if (clientFilter) {
        clientsArray = clientsArray.filter(c => c === clientFilter);
    }

    const excludeZero = document.getElementById('virement-exclude-zero').checked;

    const dates = Object.keys(virementData).sort().filter(dateStr => {
        if (dateStr < dateStart) return false;
        if (dateStr > dateEnd) return false;
        return true;
    });

    const exportRows = [['Date', 'Jour', 'Client', 'Valeur (FCFA)']];

    dates.forEach(dateStr => {
        const date = new Date(dateStr + 'T00:00:00');
        const dayName = date.toLocaleDateString('fr-FR', { weekday: 'long' });

        clientsArray.forEach(client => {
            const valeur = virementData[dateStr][client] || 0;
            if (excludeZero && valeur === 0) return;

            exportRows.push([dateStr, dayName, client, valeur]);
        });
    });

    if (exportRows.length <= 1) {
        showNotification('Aucune donnée à exporter pour la période sélectionnée', 'warning');
        return;
    }

    try {
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(exportRows);
        ws['!cols'] = [
            { wch: 12 },
            { wch: 12 },
            { wch: 20 },
            { wch: 15 }
        ];
        XLSX.utils.book_append_sheet(wb, ws, 'Virements');

        const dateStartFormatted = dateStart.replace(/-/g, '');
        const dateEndFormatted = dateEnd.replace(/-/g, '');
        const fileName = `Virements_${dateStartFormatted}_${dateEndFormatted}.xlsx`;
        XLSX.writeFile(wb, fileName);

        showNotification(`Export Excel réussi (${exportRows.length - 1} lignes)`, 'success');
    } catch (error) {
        console.error('❌ Erreur export Excel:', error);
        showNotification('Erreur lors de l\'export Excel', 'error');
    }
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
            // Construction DOM via textContent pour éviter toute injection HTML via le nom du client
            const card = document.createElement('div');
            card.className = 'client-total-card';

            const nameDiv = document.createElement('div');
            nameDiv.className = 'client-name';
            nameDiv.textContent = client;
            card.appendChild(nameDiv);

            const amountDiv = document.createElement('div');
            amountDiv.className = 'client-amount';
            amountDiv.textContent = formatCurrency(total);
            card.appendChild(amountDiv);

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
