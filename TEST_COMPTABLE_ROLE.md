# Test du Rôle Comptable - Checklist

## ✅ Migration Base de Données
- [x] Contrainte de rôle mise à jour pour inclure 'comptable'
- [x] Utilisateur comptable créé (ID: 363)
- [x] Username: `comptable` / Password: `comptable123`

## Tests à effectuer

### 1. Test de Connexion
- [ ] Se connecter avec `comptable` / `comptable123`
- [ ] Vérifier que la connexion réussit
- [ ] Vérifier que le nom "Comptable" s'affiche en haut à droite

### 2. Test de la Navigation
- [ ] Vérifier que seul le menu "Mes Dépenses" est visible
- [ ] Vérifier que les autres menus sont masqués:
  - [ ] Tableau de bord
  - [ ] Visualisation
  - [ ] Ajouter Dépense
  - [ ] Créditer Compte
  - [ ] Transfert
  - [ ] Créance
  - [ ] Etc.

### 3. Test des Dates Par Défaut
- [ ] À la connexion, vérifier que "Date de début" = 1er jour du mois courant
- [ ] Vérifier que "Date de fin" = date du jour
- [ ] Vérifier que les dépenses se chargent automatiquement

### 4. Test de Consultation
- [ ] Voir la liste des dépenses affichées
- [ ] Vérifier que toutes les colonnes sont visibles
- [ ] Cliquer sur le bouton "œil" pour voir les détails d'une dépense
- [ ] Vérifier que les détails s'affichent correctement

### 5. Test de Sélection
- [ ] Cocher une checkbox d'une dépense
- [ ] Vérifier que le compteur "X dépense(s) sélectionnée(s)" s'incrémente
- [ ] Cliquer sur "Tout sélectionner"
- [ ] Vérifier que toutes les checkboxes se cochent
- [ ] Cliquer sur "Tout désélectionner"
- [ ] Vérifier que toutes les checkboxes se décochent

### 6. Test de Téléchargement Individual
- [ ] Cliquer sur le bouton de téléchargement (icône download) d'une dépense avec justificatif
- [ ] Vérifier que le fichier se télécharge correctement
- [ ] Vérifier le nom du fichier téléchargé

### 7. Test de Génération de PDF Groupé
- [ ] Sélectionner plusieurs dépenses (cocher les checkboxes)
- [ ] Cliquer sur "Gérer factures"
- [ ] Vérifier que le PDF se génère et se télécharge
- [ ] Ouvrir le PDF et vérifier son contenu
- [ ] Vérifier que toutes les factures sélectionnées sont incluses

### 8. Test d'Export CSV
- [ ] Appliquer des filtres (dates, compte, catégorie)
- [ ] Cliquer sur "Exporter" (si visible)
- [ ] Vérifier que le CSV se télécharge
- [ ] Ouvrir le CSV et vérifier le contenu

### 9. Test des Restrictions d'Édition
- [ ] Vérifier qu'aucun bouton "Modifier" (crayon) n'est visible
- [ ] Vérifier qu'aucun bouton "Supprimer" (poubelle) n'est visible
- [ ] Vérifier que seuls les boutons "Voir" et "Télécharger" sont présents

### 10. Test des Restrictions Backend
- [ ] Essayer de faire une requête POST à `/api/expenses` (via console navigateur ou outil comme Postman)
- [ ] Vérifier que le serveur retourne une erreur 403
- [ ] Vérifier le message: "Accès refusé - Le rôle Comptable est en lecture seule"
- [ ] Essayer PUT `/api/expenses/:id` - doit retourner 403
- [ ] Essayer DELETE `/api/expenses/:id` - doit retourner 403

### 11. Test de Filtrage
- [ ] Changer la date de début
- [ ] Changer la date de fin
- [ ] Cliquer sur "Appliquer les filtres"
- [ ] Vérifier que les dépenses se rechargent avec les nouvelles dates
- [ ] Filtrer par compte
- [ ] Filtrer par catégorie
- [ ] Filtrer par fournisseur
- [ ] Filtrer par "Prévisible"

### 12. Test du Total Affiché
- [ ] Vérifier que le "Total des dépenses affichées" en haut à droite se met à jour
- [ ] Appliquer des filtres et vérifier que le total se recalcule

## Tests de Sécurité

### Test 1: Tentative d'accès direct à d'autres sections
En tant que comptable, essayer d'accéder directement à:
- [ ] `/` (devrait rester sur expenses-section)
- [ ] Cliquer sur le logo ou autre élément de navigation

### Test 2: Tentative de modification via DevTools
- [ ] Ouvrir DevTools (F12)
- [ ] Essayer de modifier `currentUser.role` dans la console
- [ ] Essayer de créer une dépense via `fetch('/api/expenses', {method: 'POST', ...})`
- [ ] Vérifier que le backend refuse (403)

### Test 3: Session et déconnexion
- [ ] Rester connecté 10 minutes
- [ ] Vérifier que la session est toujours active
- [ ] Se déconnecter
- [ ] Vérifier que la redirection vers login fonctionne

## Résultats Attendus

### ✅ Comportement Correct
- Menu limité à "Mes Dépenses" uniquement
- Dates par défaut: 1er du mois à aujourd'hui
- Affichage automatique de la section dépenses
- Checkboxes fonctionnelles pour sélection
- Téléchargement de justificatifs opérationnel
- Génération de PDF groupés fonctionnelle
- Aucun bouton d'édition/suppression visible
- Backend refuse les opérations d'écriture (403)

### ❌ Comportements Interdits (à ne PAS observer)
- Accès à d'autres sections
- Boutons modifier/supprimer visibles
- Possibilité de créer/modifier/supprimer via API
- Accès à des données sensibles (gestion comptes, etc.)

## Commande pour démarrer le serveur de test

```powershell
$env:DB_HOST="localhost"; $env:DB_PORT="5432"; $env:DB_NAME="depenses_management_preprod"; $env:DB_USER="zalint"; $env:DB_PASSWORD="bonea2024"; node server.js
```

## Vérification des Logs

Lors de la connexion comptable, vous devriez voir dans les logs serveur:
```
📋 GET EXPENSES: Utilisateur: comptable, Role: comptable
👁️ Comptable: Affichage limité à "Mes Dépenses" uniquement
📅 Comptable: Dates définies - YYYY-MM-01 à YYYY-MM-DD
```

## Problèmes Potentiels et Solutions

### Problème 1: Le comptable ne peut pas se connecter
**Solution**: Vérifier que la migration a réussi et que l'utilisateur existe:
```sql
SELECT * FROM users WHERE username = 'comptable';
```

### Problème 2: Les menus ne sont pas masqués
**Solution**: Vider le cache du navigateur (Ctrl+Shift+Del) et recharger

### Problème 3: Les dates par défaut ne s'appliquent pas
**Solution**: Vérifier la console navigateur pour les erreurs JavaScript

### Problème 4: Le téléchargement ne fonctionne pas
**Solution**: Vérifier les permissions du dossier `uploads/` et que les justificatifs existent

## Notes de Test

Date du test: ________________

Testeur: ________________

### Résultats:
- [ ] Tous les tests passent
- [ ] Quelques tests échouent (détailler ci-dessous)
- [ ] Nécessite des corrections

### Détails des échecs (si applicable):
```
[Espace pour noter les problèmes rencontrés]
```

### Commentaires additionnels:
```
[Espace pour notes supplémentaires]
```

---

**Version**: 1.0
**Date**: 2025-10-10


