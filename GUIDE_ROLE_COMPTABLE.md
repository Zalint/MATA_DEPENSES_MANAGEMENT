# Guide du Rôle Comptable

## Vue d'ensemble

Le rôle **Comptable** a été créé pour offrir un accès en **lecture seule** à la section "Mes Dépenses" avec la capacité de consulter, sélectionner et télécharger les factures/justificatifs.

## Caractéristiques du rôle Comptable

### ✅ Permissions ACCORDÉES

1. **Consultation des dépenses**
   - Accès complet à la liste de toutes les dépenses
   - Visualisation des détails des dépenses (bouton œil)
   - Filtrage par dates, comptes, catégories, fournisseurs

2. **Sélection des dépenses**
   - Cocher/décocher les checkboxes pour sélectionner les dépenses
   - Voir le compteur de dépenses sélectionnées
   - Fonction "Tout sélectionner" / "Tout désélectionner"

3. **Téléchargement de documents**
   - Télécharger les justificatifs individuels (bouton télécharger)
   - Générer et télécharger des PDF groupés de factures (bouton "Gérer factures")
   - Exporter les dépenses en CSV

### ❌ Permissions REFUSÉES

1. **Opérations d'écriture**
   - ❌ Créer de nouvelles dépenses
   - ❌ Modifier des dépenses existantes
   - ❌ Supprimer des dépenses
   - ❌ Ajouter ou modifier des comptes
   - ❌ Crédit de comptes
   - ❌ Effectuer des transferts

2. **Accès aux autres sections**
   - ❌ Tableau de bord
   - ❌ Visualisation
   - ❌ Suivi Partenaires
   - ❌ Audit Flux
   - ❌ Historique
   - ❌ Ajouter Dépense
   - ❌ Créditer Compte
   - ❌ Transfert
   - ❌ Créance
   - ❌ Cash Bictorys Mois
   - ❌ Montant début de mois
   - ❌ Gérer Comptes
   - ❌ Gestion Stock / Stock Vivant

## Comportement par défaut

### Dates de filtrage automatiques
Lorsqu'un comptable se connecte:
- **Date de début**: Premier jour du mois en cours (YYYY-MM-01)
- **Date de fin**: Date du jour (YYYY-MM-DD)

Exemple: Si connexion le 10 octobre 2025:
- Date de début: `2025-10-01`
- Date de fin: `2025-10-10`

### Affichage automatique
- La section "Mes Dépenses" s'affiche automatiquement à la connexion
- Seul le menu "Mes Dépenses" est visible dans le menu latéral
- Les dépenses sont chargées automatiquement avec les dates par défaut

## Identifiants par défaut

### Utilisateur Comptable créé par défaut

```
Nom d'utilisateur: comptable
Mot de passe: comptable123
Rôle: comptable
```

**⚠️ IMPORTANT**: Changez le mot de passe après la première connexion pour des raisons de sécurité!

## Installation / Configuration

### 1. Migration de la base de données

Exécuter le fichier SQL de migration:

```bash
psql -h localhost -U zalint -d depenses_management_preprod -f add_comptable_role.sql
```

Ou via l'outil de votre choix (DBeaver, pgAdmin, etc.)

### 2. Vérification

Vérifier que le rôle a été ajouté:

```sql
SELECT username, role, full_name, is_active 
FROM users 
WHERE role = 'comptable';
```

## Création d'utilisateurs Comptable supplémentaires

### Via SQL

```sql
INSERT INTO users (username, password_hash, full_name, email, role, is_active)
VALUES (
    'comptable2',
    '$2b$10$VOTRE_HASH_BCRYPT',
    'Comptable Secondaire',
    'comptable2@matagroup.com',
    'comptable',
    true
);
```

### Via l'interface (si implémenté)

Les administrateurs (DG/PCA/Admin) peuvent créer de nouveaux utilisateurs avec le rôle "Comptable" via la section "Gérer Comptes" en sélectionnant le rôle approprié.

## Cas d'usage typiques

### Consultation mensuelle
1. Comptable se connecte
2. Voit automatiquement les dépenses du mois en cours
3. Peut ajuster les dates pour voir d'autres périodes
4. Consulte les détails, vérifie les justificatifs

### Génération de rapports
1. Filtrer par période (ex: tout le mois d'octobre)
2. Filtrer par compte ou catégorie si nécessaire
3. Sélectionner les dépenses pertinentes (checkboxes)
4. Cliquer sur "Gérer factures" pour générer un PDF groupé
5. Télécharger le PDF pour archivage/reporting

### Export pour traitement externe
1. Appliquer les filtres souhaités
2. Cliquer sur "Exporter" pour télécharger un CSV
3. Importer dans Excel/comptabilité pour traitement

## Sécurité

### Protection backend
- Toutes les routes d'écriture (`POST`, `PUT`, `DELETE`) vérifient le rôle
- Le middleware `requireWriteAccess` bloque les opérations d'écriture pour comptable
- Messages d'erreur: "Accès refusé - Le rôle Comptable est en lecture seule"

### Protection frontend
- Boutons d'édition/suppression masqués pour comptable
- Menus inaccessibles cachés de l'interface
- Navigation limitée à "Mes Dépenses" uniquement

## Logs et traçabilité

Toutes les actions du comptable sont journalisées:
```
📋 GET EXPENSES: Utilisateur: comptable, Role: comptable
📋 GET EXPENSES: Dates - Start: 2025-10-01, End: 2025-10-10
👁️ Comptable: Affichage limité à "Mes Dépenses" uniquement
```

## Résolution de problèmes

### Le comptable ne peut pas se connecter
- Vérifier que l'utilisateur existe et `is_active = true`
- Vérifier le mot de passe
- Vérifier que la contrainte de rôle autorise 'comptable'

### Les dépenses ne s'affichent pas
- Vérifier les filtres de date
- Vérifier que des dépenses existent dans la période
- Vérifier les logs du serveur

### Le bouton "Gérer factures" ne fonctionne pas
- Vérifier que des dépenses sont sélectionnées (checkboxes cochées)
- Vérifier que les dépenses sélectionnées ont des justificatifs
- Vérifier les permissions du serveur sur le dossier uploads/

## Architecture technique

### Fichiers modifiés

1. **add_comptable_role.sql** - Migration de la base de données
2. **server.js** - Ajout du middleware `requireWriteAccess`
3. **public/app.js** - Gestion de l'affichage et des permissions frontend

### Middleware backend
```javascript
const requireWriteAccess = (req, res, next) => {
    if (req.session.user && req.session.user.role === 'comptable') {
        return res.status(403).json({ 
            error: 'Accès refusé - Le rôle Comptable est en lecture seule' 
        });
    }
    next();
};
```

### Vérification frontend
```javascript
if (currentUser.role === 'comptable') {
    // Masquer les menus non autorisés
    // Afficher uniquement "Mes Dépenses"
    // Définir dates par défaut
    // Masquer boutons édition/suppression
}
```

## Évolutions futures possibles

- [ ] Export PDF personnalisé par période
- [ ] Rapports de synthèse automatiques
- [ ] Notifications par email des nouvelles dépenses
- [ ] Dashboard comptable simplifié (lecture seule)
- [ ] Export vers logiciels comptables (format standard)

## Support

Pour toute question ou problème:
1. Consulter les logs serveur pour diagnostiquer
2. Vérifier la base de données
3. Consulter ce guide
4. Contacter l'administrateur système

---

**Date de création**: 2025-10-10
**Version**: 1.0
**Auteur**: Système de gestion Mata Group


