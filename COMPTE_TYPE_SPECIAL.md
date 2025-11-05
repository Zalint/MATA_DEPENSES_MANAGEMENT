# Type de Compte "Special"

## 📋 Vue d'ensemble

Le type de compte **"Special"** a été ajouté pour permettre le suivi de mouvements financiers isolés qui ne contribuent pas aux indicateurs globaux (PL, Cash disponible, Solde total).

## 🎯 Caractéristiques

### Opérations Autorisées
- ✅ **Crédit Normal** - Via `/api/accounts/credit`
- ✅ **Crédit Spécial** - Via `/api/special-credit`
- ✅ **Dépense** - Via `/api/expenses`

### Opérations Bloquées
- ❌ **Transfert Sortant** - Les comptes Special ne peuvent pas transférer d'argent
- ❌ **Transfert Entrant** - Les comptes Special ne peuvent pas recevoir de transferts

## 🚫 Exclusions des Calculs

Les comptes de type "special" sont **exclus** des calculs suivants :

### Dashboard
```sql
-- Total Cash Disponible
WHERE account_type NOT IN ('depot', 'partenaire', 'special')

-- Total Crédité
WHERE account_type NOT IN ('depot', 'partenaire', 'special')

-- PL / Profit & Loss
WHERE account_type NOT IN ('depot', 'partenaire', 'special')
```

### Snapshots
Les comptes Special sont exclus de tous les calculs de snapshot :
- Dashboard stats
- PL calculations
- Cash calculations
- Solde global

## 🎨 Interface Utilisateur

### Badge Visuel
Les comptes Special ont un badge distinctif avec gradient violet :
```
🔹 SPECIAL
Background: linear-gradient(135deg, #667eea 0%, #764ba2 100%)
```

### Formulaire de Transfert
Les comptes Special n'apparaissent pas dans les listes déroulantes de source/destination pour les transferts.

## 📦 Implémentation

### Base de Données
```sql
-- Contrainte CHECK mise à jour
account_type VARCHAR(20) DEFAULT 'classique' 
CHECK (account_type IN ('classique', 'partenaire', 'statut', 'Ajustement', 'depot', 'special'))
```

### Backend (server.js)
```javascript
// Blocage des transferts
if (source.account_type === 'special') {
    return res.status(403).json({ 
        error: 'Les comptes Special ne peuvent pas effectuer de transferts' 
    });
}
```

### Frontend (app.js)
```javascript
// Filtrage dans loadTransfertAccounts()
const filtered = accounts.filter(acc => {
    if (acc.account_type === 'special') {
        return false; // Exclus des transferts
    }
    return allowedTypes.includes(acc.account_type) && acc.is_active;
});
```

## 📝 Utilisation

### Créer un Compte Special
```sql
INSERT INTO accounts (account_name, account_type, user_id, created_by) 
VALUES ('Mon Compte Special', 'special', 1, 1);
```

### Convertir un Compte Existant
```sql
UPDATE accounts 
SET account_type = 'special' 
WHERE id = <compte_id>;
```

## 🔧 Migration

Pour appliquer les changements en production :
```bash
psql -U username -d database_name -f migrate_add_special_account_type.sql
```

## ⚠️ Points d'Attention

1. **Non-Régression** : Les comptes existants ne sont pas affectés
2. **Isolation Complète** : Les mouvements Special sont totalement isolés du reste
3. **Reporting** : Les comptes Special peuvent être filtrés séparément pour analyse

## 📊 Cas d'Usage

- **Projets pilotes** : Suivre des fonds de projets sans impact sur le PL global
- **Comptes temporaires** : Gestion de fonds temporaires isolés
- **Tests** : Simulations financières sans affecter les indicateurs réels
- **Portefeuille isolé** : Voir uniquement les mouvements d'un portefeuille spécifique

## 🔗 Fichiers Modifiés

1. **database_schema.sql** - Contrainte CHECK mise à jour
2. **migrate_add_special_account_type.sql** - Script de migration
3. **server.js** - Exclusions et blocage transferts (lignes 182, 187, 207, 227, 231, 253, 265, 2325, 2346, 2558, 10947-10952)
4. **public/app.js** - Badge UI et filtrage transferts (lignes 3150-3176, 8831-8840)

## 📅 Date de Création
2025-10-28

## ✅ Tests Recommandés

1. Créer un compte Special
2. Créditer le compte Special
3. Faire une dépense sur le compte Special
4. Vérifier que le compte n'apparaît pas dans les transferts
5. Vérifier l'exclusion des calculs Dashboard
6. Vérifier l'exclusion des snapshots
