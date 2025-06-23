# Système de Permissions de Crédit 

## 🎯 Vue d'ensemble

Le système de permissions de crédit détermine qui peut créditer (ajouter de l'argent) à quels comptes. Les règles varient selon le type de compte et le rôle de l'utilisateur.

## 📊 Règles par Type de Compte

### 🏛️ Comptes Classiques
- **DG/PCA** : Peuvent toujours créditer
- **Directeurs** : Peuvent créditer SEULEMENT s'ils ont reçu une permission explicite du DG/PCA
- **Aucun accès automatique** : Les directeurs n'ont plus accès automatique à leurs propres comptes

### 🤝 Comptes Partenaires  
- **Tous les utilisateurs autorisés** peuvent créditer
- Aucune restriction particulière

### 📊 Comptes Statut
- **Seuls DG/PCA** peuvent créditer
- **Comportement spécial** : Le crédit écrase le solde existant (pas d'addition)

### ⚖️ Comptes Ajustement
- **Seuls DG/PCA** peuvent créditer
- Réservés aux ajustements comptables

## 🔑 Système de Permissions

### Attribution de Permissions
1. Se rendre dans **"Gérer les Comptes"**
2. Lors de la création ou modification d'un compte classique
3. Utiliser le champ **"Donner la Permission de Crédit à (Optionnel)"**
4. Sélectionner le directeur qui pourra créditer ce compte

### Gestion des Permissions
- **Ajout** : Via le formulaire de création/modification de compte
- **Suppression** : Via l'interface de gestion des permissions
- **Visualisation** : Dans la section "Permissions de Crédit" du compte

## 🗃️ Tables de Base de Données

### `account_credit_permissions`
```sql
- id (SERIAL PRIMARY KEY)
- account_id (INTEGER) → Compte concerné
- user_id (INTEGER) → Directeur autorisé  
- granted_by (INTEGER) → Qui a accordé la permission
- created_at (TIMESTAMP) → Date d'attribution
```

### `special_credit_history`
```sql
- id (SERIAL PRIMARY KEY)
- account_id (INTEGER) → Compte crédité
- credited_by (INTEGER) → Qui a effectué le crédit
- amount (INTEGER) → Montant crédité
- comment (TEXT) → Commentaire/justification
- credit_date (DATE) → Date du crédit
- account_type (VARCHAR) → Type de compte au moment du crédit
- is_balance_override (BOOLEAN) → Si le solde a été écrasé (comptes statut)
- created_at (TIMESTAMP) → Horodatage
```

## 🔧 Fonctions PostgreSQL

### `can_user_credit_account(user_id, account_id)`
Fonction qui vérifie si un utilisateur peut créditer un compte donné.

**Retourne** : `BOOLEAN`
- `true` : L'utilisateur peut créditer
- `false` : L'utilisateur n'a pas la permission

## 🎛️ Interface Utilisateur

### Pour les DG/PCA
- Accès complet à tous les comptes
- Peuvent attribuer des permissions aux directeurs
- Voient l'historique complet des crédits

### Pour les Directeurs
- Accès uniquement aux comptes pour lesquels ils ont une permission
- Ne peuvent plus créditer automatiquement leurs propres comptes
- Doivent recevoir une autorisation explicite

## ⚠️ Points Importants

1. **Changement majeur** : Les directeurs n'ont plus d'accès automatique à leurs comptes
2. **Permission explicite** : Chaque accès de crédit doit être autorisé par le DG/PCA
3. **Traçabilité** : Tous les crédits sont enregistrés dans `special_credit_history`
4. **Sécurité** : Système basé sur les rôles avec vérifications strictes

## 🚀 Migration

Le script `fix_credit_system.js` a créé :
- ✅ Tables de permissions
- ✅ Historique des crédits spéciaux  
- ✅ Fonction de vérification des permissions
- ✅ Index pour les performances

## 📝 Utilisation Pratique

### Donner une permission à un directeur
1. Aller dans "Gérer les Comptes"
2. Modifier un compte classique existant
3. Dans "Donner la Permission de Crédit à", sélectionner le directeur
4. Sauvegarder

### Créditer un compte
1. Le système vérifie automatiquement les permissions
2. Seuls les utilisateurs autorisés voient l'option de crédit
3. L'historique est automatiquement enregistré 