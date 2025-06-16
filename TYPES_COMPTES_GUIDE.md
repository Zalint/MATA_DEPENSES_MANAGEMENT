# Guide des Types de Comptes

## Vue d'ensemble

Le système de gestion des dépenses supporte maintenant 5 types de comptes différents, chacun avec ses propres règles de fonctionnement et d'accès.

## Types de Comptes

### 1. Compte Classique
- **Description** : Compte standard assigné à un directeur spécifique
- **Créditeurs autorisés** : Directeur Général (DG) et Président du Conseil d'Administration (PCA) uniquement
- **Formulaire de crédit** : Montant, commentaire, date
- **Comportement** : Le crédit s'ajoute au solde existant

### 2. Compte Créance
- **Description** : Compte avec créditeurs multiples (DG + directeur assigné)
- **Créditeurs autorisés** : 
  - Directeur Général (automatiquement)
  - Directeur assigné (sélectionné lors de la création)
- **Formulaire de crédit** : Montant, commentaire, date
- **Comportement** : Le crédit s'ajoute au solde existant
- **Particularité** : Deux personnes peuvent créditer ce compte

### 3. Compte Fournisseur
- **Description** : Compte pour la gestion des paiements fournisseurs
- **Créditeurs autorisés** : Directeur Général (DG) et PCA uniquement
- **Formulaire de crédit** : Montant, commentaire, date
- **Comportement** : Le crédit s'ajoute au solde existant
- **Accès restreint** : Seuls le DG et PCA peuvent voir ce compte

### 4. Compte Partenaire
- **Description** : Compte accessible à tous les utilisateurs
- **Créditeurs autorisés** : Tous les utilisateurs connectés
- **Formulaire de crédit** : Montant, commentaire, date
- **Comportement** : Le crédit s'ajoute au solde existant
- **Accès ouvert** : Visible par tous

### 5. Compte Statut
- **Description** : Compte où le crédit écrase le solde existant
- **Créditeurs autorisés** : Directeur Général (DG) et PCA uniquement
- **Formulaire de crédit** : Montant, commentaire, date
- **Comportement** : **IMPORTANT** - Le crédit écrase complètement le solde précédent (pas d'addition)
- **Usage** : Idéal pour des indicateurs de statut ou des montants fixes

## Instructions d'Installation

### 1. Exécuter le script SQL
```sql
-- Exécutez le fichier add_account_types.sql dans votre base de données PostgreSQL
-- Cela ajoutera les colonnes nécessaires et les fonctions de gestion
```

### 2. Redémarrer l'application
```bash
# Arrêtez et redémarrez votre serveur Node.js
node server.js
```

## Utilisation

### Création d'un Compte

1. **Connectez-vous avec un compte DG ou PCA**
2. **Allez dans "Gérer les Comptes"**
3. **Remplissez le formulaire** :
   - Nom du compte
   - Type de compte (sélectionnez dans la liste)
   - Assignation utilisateur (si applicable)
   - Créditeurs (pour les comptes créance)
   - Montant initial (optionnel)
   - Description

### Crédit d'un Compte

1. **Dans la section "Créditer un Compte Existant"** :
   - Sélectionnez le compte
   - Le système vérifiera automatiquement vos autorisations
   - Saisissez le montant
   - Choisissez la date
   - Ajoutez un commentaire (obligatoire)

2. **Notifications spéciales** :
   - Compte Statut : Avertissement que le solde sera écrasé
   - Comptes restreints : Message d'autorisation refusée si non autorisé

### Affichage des Comptes

Les comptes sont maintenant groupés par type dans l'interface :
- Badge de couleur indiquant le type
- Informations sur les créditeurs (pour les comptes créance)
- Restriction d'accès selon le type

## Permissions par Rôle

| Type de Compte | Directeur | DG | PCA | Voir | Créditer |
|----------------|-----------|----|----|------|----------|
| Classique      | ✓ (propriétaire) | ✓ | ✓ | ✓ | DG/PCA |
| Créance        | ✓ (si créditeur) | ✓ | ✓ | ✓ | DG + Directeur assigné |
| Fournisseur    | ❌ | ✓ | ✓ | DG/PCA | DG/PCA |
| Partenaire     | ✓ | ✓ | ✓ | ✓ | Tous |
| Statut         | ✓ | ✓ | ✓ | ✓ | DG/PCA |

## Historique et Traçabilité

- Tous les crédits sont enregistrés dans `special_credit_history`
- L'historique indique le type de compte et l'utilisateur qui a crédité
- Pour les comptes statut, un flag `is_balance_override` indique l'écrasement

## Dépannage

### Problème : Compte non visible
- Vérifiez que votre rôle permet de voir ce type de compte
- Les comptes fournisseur ne sont visibles que par DG/PCA

### Problème : Impossible de créditer
- Vérifiez vos permissions selon le tableau ci-dessus
- Pour les comptes créance, vérifiez que vous êtes bien dans la liste des créditeurs

### Problème : Compte créance sans créditeurs
- Modifiez le compte via la route API `/api/accounts/:accountId/creditors`
- Ou recréez le compte avec les bons créditeurs

## API Endpoints Supplémentaires

- `GET /api/accounts/types` - Liste des types de comptes
- `GET /api/accounts/:accountId/can-credit` - Vérifier permission de crédit
- `GET /api/accounts/:accountId/special-history` - Historique spécifique d'un compte
- `POST /api/accounts/:accountId/creditors` - Gérer les créditeurs (comptes créance)

## Support

Pour toute question ou problème, contactez l'administrateur système. 