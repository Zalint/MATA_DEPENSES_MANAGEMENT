# 📊 DOCUMENTATION - CALCUL DES SOLDES

## 🎯 Vue d'ensemble

Ce document explique comment les soldes des comptes sont calculés dans l'application de gestion des dépenses. Le système utilise **3 logiques différentes** selon le type de compte.

---

## 🏷️ Types de Comptes

### 1. 🔹 **Comptes CLASSIQUES**
- **Exemples** : BOVIN, OVIN, MARKETING, PRODUCTION, COMMERCIAL
- **Logique** : Cumul de toutes les transactions
- **Usage** : Comptes opérationnels standard

### 2. 🔸 **Comptes STATUT** 
- **Exemples** : BICTORYS ENCOURS, SOLDE COURANT BANQUE, BICTORYS AFFICHE
- **Logique** : Dernière transaction chronologique uniquement
- **Usage** : Comptes représentant un état ou statut

### 3. 🔶 **Comptes PARTENAIRES**
- **Exemples** : Comptes fournisseurs/partenaires
- **Logique** : Total crédité - livraisons validées
- **Usage** : Gestion des relations commerciales

### 4. 🔷 **Comptes DEPOT**
- **Exemples** : Comptes de dépôt
- **Logique** : Même que STATUT (dernière transaction)
- **Usage** : Comptes de stockage/dépôt

---

## 🧮 Formules de Calcul

### 🔹 **COMPTES CLASSIQUES**

```sql
Solde = Total Crédité - Total Dépensé + Transferts Net + Ajustements
```

**Composants détaillés :**
- **Crédits** : `credit_history` + `special_credit_history`
- **Dépenses** : `expenses` (total des achats, frais, charges)
- **Transferts** : `transfer_history` (entrants - sortants)
- **Ajustements** : `montant_debut_mois` (si applicable)

**Filtrage temporel :**
```sql
WHERE transaction_date <= date_fin_periode
```

### 🔸 **COMPTES STATUT/DEPOT**

```sql
Solde = Montant de la dernière transaction chronologique
```

**Logique de sélection :**
```sql
ORDER BY transaction_date DESC, 
         original_timestamp DESC, 
         record_id DESC
LIMIT 1
```

**Sources de transactions :**
1. `credit_history` (crédits réguliers)
2. `special_credit_history` (crédits spéciaux)
3. `expenses` (dépenses)
4. `montant_debut_mois` (montant initial)

**Critères d'ordre (en cas d'égalité) :**
1. **Date** la plus récente
2. **Timestamp** le plus récent
3. **ID** le plus élevé (dernier inséré)

### 🔶 **COMPTES PARTENAIRES**

```sql
Solde = Total Crédité - Livraisons Validées
```

**Détail :**
```sql
Solde = accounts.total_credited - 
        SUM(partner_deliveries.amount WHERE validation_status = 'fully_validated')
```

---

## ⚡ Gestion des Timestamps Identiques

### 🚨 Problème Identifié
Certaines transactions peuvent avoir **exactement le même timestamp** (ex: imports en lot, créations simultanées).

### ✅ Solution Implémentée
**Ordre de priorité pour départager :**
1. `transaction_date DESC` (date la plus récente)
2. `original_timestamp DESC` (timestamp le plus récent)  
3. `record_id DESC` (ID le plus élevé = dernier inséré)

**Exemple :**
```
Transaction A: ID 174, Timestamp 2025-09-01 20:00:00, Montant -22,687,602 FCFA
Transaction B: ID 175, Timestamp 2025-09-01 20:00:00, Montant  3,247,870 FCFA
→ Sélection: Transaction B (ID 175 > ID 174)
```

---

## 📅 Filtrage par Période

### 🔍 Condition de Date

**Pour tous les types de comptes :**
```sql
WHERE transaction_date <= (date_fin::date + INTERVAL '1 day')
```

**Raison :** Inclure toutes les transactions du jour sélectionné, même celles créées après 00:00:00.

**Exemple :**
- Date sélectionnée : `2025-09-02`
- Condition : `<= 2025-09-03 00:00:00`
- Inclut : Toutes les transactions du 02/09/2025, y compris à 23h59

---

## 🎯 Cash Disponible

### 📊 Logique d'Inclusion

**Comptes INCLUS dans le cash disponible :**
- ✅ Comptes `classique`
- ✅ Comptes `statut`  
- ✅ Comptes `ajustement`

**Comptes EXCLUS du cash disponible :**
- ❌ Comptes `partenaire`
- ❌ Comptes `depot`
- ❌ Comptes `creance`
- ❌ Comptes `fournisseur`

### 🧮 Calcul
```sql
Cash Disponible = SUM(solde_compte) WHERE compte_inclus = true
```

---

## 🔧 Implémentation Technique

### 📍 Fichier Principal
**`server.js`** - Route `/api/dashboard/stats` (lignes ~1243-1325)

### 🔍 Structure SQL
```sql
CASE a.account_type
    WHEN 'statut' THEN
        -- Logique dernière transaction
    WHEN 'depot' THEN  
        -- Logique dernière transaction
    WHEN 'partenaire' THEN
        -- Logique crédité - livraisons
    ELSE
        -- Logique cumul complet (classique)
END as balance_at_end_date
```

### 📝 Logs de Debug
```sql
console.log('[CASH LOG] Calcul pour compte:', account_name);
console.log('[CASH LOG] Type:', account_type);  
console.log('[CASH LOG] Solde calculé:', balance);
```

---

## 🧪 Tests et Validation

### ✅ Tests Recommandés

1. **Test Comptes Classiques :**
   - Vérifier cumul correct des transactions
   - Valider inclusion des transferts
   - Contrôler filtrage par date

2. **Test Comptes Statut :**
   - Vérifier sélection dernière transaction
   - Tester gestion timestamps identiques
   - Valider ordre par ID

3. **Test Cash Disponible :**
   - Vérifier alignement avec Audit Flux
   - Contrôler inclusion/exclusion des comptes
   - Valider calcul global

### 🔍 Cas de Test Critiques

**SOLDE COURANT BANQUE (statut) :**
- Transactions multiples même date
- Validation sélection par ID
- Résultat attendu : 3,247,870 FCFA

**BOVIN (classique) :**
- Transferts du jour inclus  
- Alignement Cash/Audit Flux
- Résultat attendu : 3,943,875 FCFA

---

## 🚨 Points d'Attention

### ⚠️ Timestamps Identiques
- **Cause** : Imports en lot, créations simultanées
- **Solution** : Ordre par ID décroissant
- **Impact** : Sélection du dernier inséré

### ⚠️ Transferts Jour J
- **Problème** : Exclusion transactions après 00:00:00
- **Solution** : `<= (date + 1 jour)`
- **Impact** : Inclusion correcte des transferts

### ⚠️ Cache/Synchronisation
- **Redémarrage serveur** requis après modifications
- **Vider cache navigateur** si nécessaire
- **Vérifier logs** pour diagnostic

---

## 📋 Troubleshooting

### 🔍 Problèmes Courants

**1. Solde incorrect pour compte statut :**
```sql
-- Vérifier ordre des transactions
SELECT * FROM special_credit_history 
WHERE account_id = X AND date = 'YYYY-MM-DD'
ORDER BY credit_date DESC, id DESC;
```

**2. Transfert non inclus :**
```sql
-- Vérifier condition de date
SELECT * FROM transfer_history 
WHERE created_at <= (date + INTERVAL '1 day');
```

**3. Cash disponible ≠ Audit Flux :**
```sql
-- Comparer calculs
SELECT account_name, account_type, balance_calculated
FROM dashboard_stats WHERE ...;
```

### 🔧 Commandes de Diagnostic

```bash
# Vérifier logs serveur
tail -f server.log | grep "CASH LOG"

# Tester API directement  
curl -X GET "/api/dashboard/stats?start_date=2025-09-01&end_date=2025-09-02"

# Vérifier base de données
psql -c "SELECT * FROM accounts WHERE account_type = 'statut';"
```

---

## 📚 Historique des Modifications

### v1.0 - Logic de Base
- Implémentation logiques par type de compte
- Calcul cash disponible

### v1.1 - Correction Transferts  
- Fix condition date pour transferts jour J
- Alignement Cash/Audit Flux

### v1.2 - Gestion Timestamps
- Ajout ordre par ID pour timestamps identiques
- Fix régression SOLDE COURANT BANQUE

---

## 👥 Contacts

**Questions techniques :** Équipe développement  
**Questions métier :** Équipe comptabilité  
**Bugs/Support :** Créer un ticket avec logs et contexte

---

*Dernière mise à jour : Septembre 2025*

