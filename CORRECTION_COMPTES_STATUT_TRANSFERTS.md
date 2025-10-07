# Correction du Calcul des Soldes pour les Comptes Statut

**Date:** 07 octobre 2025  
**Version:** 1.0

## 🐛 Problème Identifié

Le système n'incluait pas les **transferts** dans le calcul des soldes pour les comptes de type **statut** et **depot**. Cela causait un affichage incorrect dans le "Détail du Cash disponible" du dashboard.

### Exemple du Bug
- **Compte:** BICTORYS ENCOURS (type: statut)
- **Solde affiché:** 2 306 963 FCFA ❌
- **Solde attendu:** 8 222 779 FCFA ✅

### Cause Racine
La requête SQL dans `/api/dashboard/stats` calculait le solde des comptes statut en prenant uniquement :
- credit_history
- special_credit_history
- expenses
- montant_debut_mois

**Les transferts (transfer_history) étaient complètement ignorés !**

## ✅ Solution Implémentée

### Logique Métier pour les Comptes Statut

Les comptes **statut** utilisent des **snapshots** de balance via `special_credit_history` avec `is_balance_override = true`. Chaque snapshot **remplace** la valeur précédente (ce n'est pas un cumul).

**Formule de calcul correcte :**
```
Solde = Dernier Crédit/Transfert Entrant (REMPLACE) - Transferts Sortants Postérieurs - Dépenses Postérieures
```

**Important :** Chaque crédit ou transfert entrant REMPLACE le solde précédent (ne s'additionne pas).

### Détails de l'Implémentation

**Fichier modifié :** `server.js` (lignes ~2356-2403)

**Étapes du calcul :**

1. **Trouver le dernier événement ENTRANT** (crédit, special_credit, OU transfert entrant)
   ```sql
   SELECT montant FROM (
       -- Crédits normaux
       SELECT amount as montant, created_at as date_operation
       FROM credit_history 
       WHERE account_id = X AND created_at <= date_fin
       
       UNION ALL
       
       -- Snapshots/crédits spéciaux
       SELECT amount as montant, created_at as date_operation
       FROM special_credit_history 
       WHERE account_id = X 
           AND credit_date <= date_fin
           AND is_balance_override = true
       
       UNION ALL
       
       -- Transferts ENTRANTS uniquement
       SELECT montant, created_at as date_operation
       FROM transfer_history
       WHERE destination_id = X
           AND created_at <= date_fin
   ) all_incoming
   ORDER BY date_operation DESC
   LIMIT 1
   ```
   → Ce montant **REMPLACE** le solde (ne s'additionne pas)

2. **Soustraire les transferts SORTANTS postérieurs**
   ```sql
   SUM(montant)
   FROM transfer_history
   WHERE source_id = X
       AND created_at > date_dernier_entrant
       AND created_at <= date_fin
   ```

3. **Soustraire les dépenses postérieures**
   ```sql
   SUM(total)
   FROM expenses
   WHERE expense_date > date_snapshot
       AND expense_date <= date_fin
   ```

### Exemple de Calcul

**Pour BICTORYS ENCOURS au 07/10/2025 :**

**Chronologie des événements :**
- 03/10/2025 : Snapshot = 2 306 963 FCFA
- 06/10/2025 12:45 : Transfert sortant = -2 306 963 FCFA
- 06/10/2025 12:46 : Transfert entrant = **8 222 779 FCFA** ← DERNIER ENTRANT

**Calcul selon la logique métier :**

| Étape | Description | Montant |
|-------|-------------|---------|
| 1️⃣ | Dernier entrant (transfert IN du 06/10) | 8 222 779 FCFA |
| 2️⃣ | Transferts sortants après le 06/10 12:46 | 0 FCFA |
| 3️⃣ | Dépenses après le 06/10 12:46 | 0 FCFA |
| **TOTAL** | **8 222 779 FCFA** | ✅ |

**Formule :** 8 222 779 - 0 - 0 = **8 222 779 FCFA**

**Note :** Le snapshot du 03/10 et le transfert sortant du 06/10 12:45 sont IGNORÉS car le transfert entrant du 06/10 12:46 est plus récent et REMPLACE tout.

## 🎯 Types de Comptes Affectés

Cette correction s'applique aux types de comptes suivants :

| Type | Logique de Calcul |
|------|-------------------|
| **statut** | Dernier snapshot + transferts nets + dépenses postérieurs |
| **depot** | Dernier snapshot + transferts nets + dépenses postérieurs |
| **classique** | Cumul complet (crédits + transferts - dépenses) |
| **partenaire** | total_credited - livraisons validées |

## 📊 Impact

### Avant la Correction
- Les transferts vers/depuis les comptes statut étaient invisibles dans le "Cash disponible"
- Le solde affiché correspondait uniquement au dernier snapshot, ignorant les mouvements ultérieurs
- Les utilisateurs voyaient des montants incorrects dans le dashboard

### Après la Correction
- ✅ Les transferts sont correctement pris en compte
- ✅ Le solde reflète la réalité financière à la date sélectionnée
- ✅ Cohérence entre les transferts et l'affichage du Cash disponible

## 🧪 Tests de Non-Régression

Pour vérifier que la correction fonctionne :

1. **Créer un compte statut** avec un snapshot initial
2. **Effectuer un transfert** vers ce compte
3. **Vérifier le "Détail du Cash disponible"** → Le solde doit inclure le transfert
4. **Effectuer un transfert sortant**
5. **Revérifier le solde** → Doit refléter le transfert sortant

### Script de Test SQL

```sql
-- Test pour un compte statut (exemple: ID 10)
SELECT 
    a.account_name,
    (
        COALESCE((
            SELECT amount 
            FROM special_credit_history 
            WHERE account_id = a.id 
                AND is_balance_override = true
            ORDER BY credit_date DESC, created_at DESC
            LIMIT 1
        ), 0)
        +
        COALESCE((
            SELECT SUM(CASE WHEN th.destination_id = a.id THEN th.montant ELSE -th.montant END)
            FROM transfer_history th
            WHERE (th.source_id = a.id OR th.destination_id = a.id)
                AND th.created_at > COALESCE((
                    SELECT created_at 
                    FROM special_credit_history 
                    WHERE account_id = a.id 
                        AND is_balance_override = true
                    ORDER BY credit_date DESC, created_at DESC
                    LIMIT 1
                ), '1900-01-01'::timestamp)
        ), 0)
    ) as calculated_balance,
    a.current_balance as db_balance
FROM accounts a
WHERE a.id = 10;
```

## 📝 Notes Importantes

1. **Snapshots vs Cumul :** Les comptes statut utilisent des snapshots qui **remplacent** la valeur précédente, contrairement aux comptes classiques qui **cumulent** les transactions.

2. **Ordre Chronologique :** Les transferts sont pris en compte par ordre chronologique (`created_at`), permettant un suivi précis des mouvements.

3. **Compatibilité :** Cette correction est rétrocompatible et ne nécessite aucune migration de données.

4. **Performance :** La requête utilise des sous-requêtes optimisées avec des LIMIT 1 pour minimiser l'impact sur les performances.

## 🔄 Prochaines Étapes

- [ ] Tester en production avec plusieurs comptes statut
- [ ] Vérifier l'impact sur les snapshots mensuels
- [ ] Valider avec les utilisateurs finaux
- [ ] Documenter dans le guide utilisateur

## 📞 Support

En cas de problème ou de question sur cette correction, contacter l'équipe de développement.

---

**Auteur :** Assistant AI  
**Validé par :** [À compléter]  
**Déployé le :** [À compléter]

