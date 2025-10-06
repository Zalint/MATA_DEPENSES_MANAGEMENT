# Guide : Synchronisation automatique Balance → SOLDE BICTORYS AFFICHE

## 📋 Vue d'ensemble

Ce système synchronise **automatiquement** la dernière valeur de la colonne `balance` de la table `cash_bictorys` vers le compte **"SOLDE BICTORYS AFFICHE"** en temps réel.

## 🎯 Objectif

**Avant** : Mise à jour manuelle quotidienne du solde  
**Après** : Synchronisation automatique dès qu'une nouvelle valeur arrive via l'API

## 🔧 Implémentation technique

### Trigger PostgreSQL installé

- **Nom du trigger** : `trigger_sync_balance_to_solde_bictorys`
- **Fonction** : `sync_balance_to_solde_bictorys_affiche()`
- **Déclenchement** : Après chaque `INSERT` ou `UPDATE` dans `cash_bictorys`
- **Fichier source** : `create_sync_balance_trigger.sql`

### Logique de synchronisation

```sql
-- Prend la dernière balance où (amount > 0 OU balance > 0)
SELECT balance 
FROM cash_bictorys
WHERE date <= CURRENT_DATE
AND (amount > 0 OR balance > 0)  -- Ignore seulement si BOTH sont nuls
ORDER BY date DESC, updated_at DESC
LIMIT 1;

-- Met à jour le compte SOLDE BICTORYS AFFICHE
UPDATE accounts
SET current_balance = [dernière balance],
    updated_at = CURRENT_TIMESTAMP
WHERE account_name = 'SOLDE BICTORYS AFFICHE'
AND account_type = 'statut';
```

## 📊 Flux de données

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Workflow externe (Make.com, n8n, etc.)                   │
│    Envoie POST API → /api/cash-bictorys                     │
└──────────────────────┬──────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. Table cash_bictorys                                       │
│    INSERT/UPDATE → balance = 15,500,000 FCFA                │
└──────────────────────┬──────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. Trigger PostgreSQL (automatique)                         │
│    trigger_sync_balance_to_solde_courant                    │
└──────────────────────┬──────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. Compte "SOLDE BICTORYS AFFICHE"                          │
│    current_balance = 15,500,000 FCFA (MIS À JOUR)           │
└─────────────────────────────────────────────────────────────┘
```

## ✅ Règles de gestion

1. **Date valide** : Seules les dates ≤ date du jour sont prises en compte
2. **Lignes valides** : Une ligne est ignorée seulement si `amount = 0 ET balance = 0`
3. **Balance zéro légitime** : Une `balance = 0` avec `amount > 0` est une valeur VALIDE
4. **Dernière valeur** : En cas de plusieurs lignes même date, la plus récemment modifiée (`updated_at DESC`)
5. **Sécurité** : Si le compte "SOLDE BICTORYS AFFICHE" n'existe pas, aucune erreur (log NOTICE uniquement)
6. **Traçabilité** : Les logs PostgreSQL enregistrent chaque synchronisation

## 🧪 Vérification manuelle

### Vérifier l'état actuel

```sql
-- Dernières valeurs cash_bictorys
SELECT date, balance, amount, fees
FROM cash_bictorys
WHERE date <= CURRENT_DATE
ORDER BY date DESC
LIMIT 5;

-- Solde du compte SOLDE BICTORYS AFFICHE
SELECT account_name, current_balance, updated_at
FROM accounts
WHERE account_name = 'SOLDE BICTORYS AFFICHE';
```

### Tester le trigger manuellement

```sql
-- Simuler une mise à jour (déclenche le trigger)
UPDATE cash_bictorys
SET updated_at = CURRENT_TIMESTAMP
WHERE date = (SELECT MAX(date) FROM cash_bictorys WHERE date <= CURRENT_DATE);

-- Vérifier que le solde a été mis à jour
SELECT current_balance, updated_at
FROM accounts
WHERE account_name = 'SOLDE BICTORYS AFFICHE';
```

## 🛠️ Maintenance

### Désactiver temporairement le trigger

```sql
DROP TRIGGER IF EXISTS trigger_sync_balance_to_solde_bictorys ON cash_bictorys;
```

### Réactiver le trigger

```sql
-- Réexécuter le fichier create_sync_balance_trigger.sql
\i create_sync_balance_trigger.sql
```

### Voir l'état du trigger

```sql
-- Lister les triggers sur cash_bictorys
SELECT 
    trigger_name,
    event_manipulation,
    action_timing,
    action_statement
FROM information_schema.triggers
WHERE event_object_table = 'cash_bictorys';
```

## 📈 Avantages

- ✅ **Zéro intervention manuelle** : Plus besoin de mise à jour quotidienne
- ✅ **Temps réel** : Synchronisation immédiate après chaque POST API
- ✅ **Fiable** : Logic au niveau base de données (pas dépendant du serveur Node.js)
- ✅ **Traçable** : Transaction créée dans `special_credit_history` pour audit complet
- ✅ **Visible** : Opération visible dans l'historique du compte et Cash disponible
- ✅ **Sécurisé** : Protection contre les dates futures et doublons (contrainte UNIQUE)

## 🚨 Points d'attention

1. **Nom du compte** : Le compte doit s'appeler exactement `"SOLDE BICTORYS AFFICHE"` (sensible à la casse)
2. **Type de compte** : Doit être de type `'statut'`
3. **Compte actif** : Le compte doit avoir `is_active = true`
4. **Dates futures** : Les dates > CURRENT_DATE sont automatiquement ignorées
5. **Balance = 0** : Une balance à 0 est une valeur VALIDE si amount > 0 (le compte est vraiment à zéro)
6. **Lignes vides** : Seules les lignes avec amount = 0 ET balance = 0 sont ignorées

## 📝 Historique

- **Date de création** : 05/10/2025
- **Version** : 1.3
- **Auteur** : Assistant AI (Claude)
- **Compte cible** : SOLDE BICTORYS AFFICHE (anciennement SOLDE COURANT BANQUE)
- **Modifications** :
  - v1.1 : Changement cible vers SOLDE BICTORYS AFFICHE
  - v1.2 : Correction API PUT + logique (ignore si amount ET balance = 0)
  - v1.3 : Création transaction dans special_credit_history pour traçabilité et Cash disponible
- **Test validation** : ✅ Réussi (2,000,000 FCFA synchronisé avec transaction visible)

## 🔗 Fichiers associés

- `create_sync_balance_trigger.sql` - Script d'installation du trigger
- `add_constraint_and_update_trigger.sql` - Script ajout contrainte UNIQUE
- `GUIDE_SYNC_BALANCE_SOLDE_COURANT.md` - Ce guide (documentation)

---

**Note** : Ce système est maintenant actif et ne nécessite aucune action manuelle pour fonctionner. Le trigger PostgreSQL s'exécute automatiquement à chaque modification dans `cash_bictorys`.

