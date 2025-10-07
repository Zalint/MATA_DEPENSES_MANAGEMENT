# Guide de Synchronisation Fork - Correction Calcul Soldes Comptes Statut

## 🎯 Objectif

Appliquer une correction critique dans le calcul des soldes pour les comptes de type **statut** et **depot**. Le bug causait l'exclusion des transferts dans le calcul des soldes, affichant des montants incorrects dans le "Détail du Cash disponible".

---

## 🐛 Description du Bug

### Problème Identifié

Les comptes de type **statut** n'incluaient pas les **transferts** (transfer_history) dans le calcul de leur solde. Seuls les snapshots de `special_credit_history` étaient pris en compte.

### Symptômes

Si vous avez un compte statut qui :
1. ✅ A un snapshot dans `special_credit_history`
2. ✅ Reçoit un transfert APRÈS ce snapshot
3. ❌ Le solde affiché ignore complètement le transfert

**Exemple concret :**
```
📅 Chronologie :
- 03/10 : Snapshot dans special_credit_history = 100 000 FCFA
- 06/10 : Transfert entrant de 500 000 FCFA

❌ Ancien calcul : 100 000 FCFA (ignore le transfert)
✅ Nouveau calcul : 500 000 FCFA (le transfert REMPLACE le snapshot)
```

---

## 📝 Logique Métier à Appliquer

### Pour les Comptes STATUT

**Principe fondamental :** Chaque crédit ou transfert entrant **REMPLACE** le solde précédent (ne s'additionne pas).

**Formule de calcul :**
```
Solde = Dernier Événement Entrant (REMPLACE) 
        - Transferts Sortants Postérieurs 
        - Dépenses Postérieures
```

**Événements entrants considérés :**
1. Crédits normaux (`credit_history`)
2. Snapshots/crédits spéciaux (`special_credit_history` avec `is_balance_override = true`)
3. **Transferts ENTRANTS** (`transfer_history` avec `destination_id = compte`)

### Étapes du Calcul

**Étape 1 : Trouver le dernier événement ENTRANT**

Le système doit chercher parmi TOUTES les sources :
- Crédits de `credit_history`
- Snapshots de `special_credit_history`
- Transferts entrants de `transfer_history`

→ Prendre le plus récent chronologiquement (ORDER BY date DESC)
→ Ce montant **REMPLACE** tout ce qui précède

**Étape 2 : Soustraire les transferts SORTANTS postérieurs**

Tous les transferts avec `source_id = compte` qui ont eu lieu APRÈS la date du dernier entrant.

**Étape 3 : Soustraire les dépenses postérieures**

Toutes les dépenses qui ont eu lieu APRÈS la date du dernier entrant.

### Exemple Complet

```
📊 Compte : SOLDE COURANT BANQUE (type: statut)

📅 Chronologie complète :
- 01/10 10:00 : Snapshot = 50 000 FCFA
- 03/10 14:30 : Transfert entrant = 200 000 FCFA  ← DERNIER ENTRANT
- 05/10 09:15 : Transfert sortant = -30 000 FCFA
- 06/10 16:00 : Dépense = -15 000 FCFA

💰 Calcul :
1️⃣ Dernier entrant (03/10) : 200 000 FCFA
2️⃣ Transferts sortants après 03/10 : -30 000 FCFA
3️⃣ Dépenses après 03/10 : -15 000 FCFA
─────────────────────────────────────────────
TOTAL : 155 000 FCFA ✅

⚠️ Note : Le snapshot du 01/10 (50 000 FCFA) est IGNORÉ car le transfert du 03/10 est plus récent et REMPLACE tout.
```

---

## 🚀 Instructions de Synchronisation

### Option 1 : Merge depuis le Repo Principal (Recommandé)

```bash
# 1. Ajouter le repo principal comme remote (si pas déjà fait)
git remote add upstream https://github.com/Zalint/MATA_DEPENSES_MANAGEMENT.git

# 2. Récupérer les dernières modifications
git fetch upstream

# 3. Voir les commits à merger
git log upstream/main --oneline -10

# 4. Merger les changements (commit abcd871)
git checkout main
git merge upstream/main

# 5. En cas de conflits, les résoudre puis :
git add .
git commit -m "Merge upstream - Correction calcul soldes comptes statut"

# 6. Push vers votre fork
git push origin main
```

### Option 2 : Cherry-pick du Commit Spécifique

```bash
# Si vous voulez uniquement cette correction sans tout merger
git fetch upstream
git cherry-pick abcd871
git push origin main
```

### Option 3 : Appliquer Manuellement les Changements

Si vous avez modifié `server.js`, vous devrez peut-être appliquer manuellement.

**Fichier à modifier :** `server.js` (environ lignes 2356-2454)

**Section à remplacer :** Le CASE WHEN 'statut' THEN dans la requête accountBurnQuery de `/api/dashboard/stats`

Voir la section "Code SQL à Appliquer" ci-dessous.

---

## 🔧 Code SQL à Appliquer

### Nouvelle Logique pour Comptes STATUT

Remplacer le calcul actuel par :

```sql
WHEN 'statut' THEN
    -- Pour STATUT : dernier crédit/transfert entrant REMPLACE, puis soustraction des sorties/dépenses
    (
        -- 1. Trouver le dernier montant entrant (crédit, special_credit, OU transfert entrant)
        COALESCE((
            SELECT montant FROM (
                -- Crédits normaux
                SELECT amount as montant, created_at as date_operation
                FROM credit_history 
                WHERE account_id = a.id 
                    AND created_at <= ($2::date + INTERVAL '1 day')
                
                UNION ALL
                
                -- Snapshots / crédits spéciaux
                SELECT amount as montant, created_at as date_operation
                FROM special_credit_history 
                WHERE account_id = a.id 
                    AND credit_date <= ($2::date + INTERVAL '1 day')
                    AND is_balance_override = true
                
                UNION ALL
                
                -- Transferts ENTRANTS uniquement
                SELECT montant, created_at as date_operation
                FROM transfer_history
                WHERE destination_id = a.id
                    AND created_at <= ($2::date + INTERVAL '1 day')
            ) all_incoming
            ORDER BY date_operation DESC
            LIMIT 1
        ), 0)
        -
        -- 2. Soustraire les transferts SORTANTS postérieurs au dernier entrant
        COALESCE((
            SELECT SUM(th.montant)
            FROM transfer_history th
            WHERE th.source_id = a.id
                AND th.created_at > COALESCE((
                    SELECT date_operation FROM (
                        SELECT created_at as date_operation
                        FROM credit_history 
                        WHERE account_id = a.id 
                            AND created_at <= ($2::date + INTERVAL '1 day')
                        
                        UNION ALL
                        
                        SELECT created_at as date_operation
                        FROM special_credit_history 
                        WHERE account_id = a.id 
                            AND credit_date <= ($2::date + INTERVAL '1 day')
                            AND is_balance_override = true
                        
                        UNION ALL
                        
                        SELECT created_at as date_operation
                        FROM transfer_history
                        WHERE destination_id = a.id
                            AND created_at <= ($2::date + INTERVAL '1 day')
                    ) all_incoming
                    ORDER BY date_operation DESC
                    LIMIT 1
                ), '1900-01-01'::timestamp)
                AND th.created_at <= ($2::date + INTERVAL '1 day')
        ), 0)
        -
        -- 3. Soustraire les dépenses postérieures au dernier entrant
        COALESCE((
            SELECT SUM(e2.total)
            FROM expenses e2
            WHERE e2.account_id = a.id
                AND e2.expense_date > COALESCE((
                    SELECT date_operation::date FROM (
                        SELECT created_at as date_operation
                        FROM credit_history 
                        WHERE account_id = a.id 
                            AND created_at <= ($2::date + INTERVAL '1 day')
                        
                        UNION ALL
                        
                        SELECT created_at as date_operation
                        FROM special_credit_history 
                        WHERE account_id = a.id 
                            AND credit_date <= ($2::date + INTERVAL '1 day')
                            AND is_balance_override = true
                        
                        UNION ALL
                        
                        SELECT created_at as date_operation
                        FROM transfer_history
                        WHERE destination_id = a.id
                            AND created_at <= ($2::date + INTERVAL '1 day')
                    ) all_incoming
                    ORDER BY date_operation DESC
                    LIMIT 1
                ), '1900-01-01'::date)
                AND e2.expense_date <= ($2::date + INTERVAL '1 day')
        ), 0)
    )
```

---

## 🧪 Tests et Validation

### 1. Script de Diagnostic SQL

Avant et après la correction, exécutez ce script pour identifier les comptes affectés :

```sql
-- Identifier les comptes statut avec transferts après leur dernier snapshot
WITH derniers_entrants AS (
    SELECT 
        a.id,
        a.account_name,
        a.account_type,
        a.current_balance as db_balance,
        (
            SELECT date_operation FROM (
                SELECT created_at as date_operation, amount as montant
                FROM credit_history 
                WHERE account_id = a.id
                
                UNION ALL
                
                SELECT created_at as date_operation, amount as montant
                FROM special_credit_history 
                WHERE account_id = a.id AND is_balance_override = true
                
                UNION ALL
                
                SELECT created_at as date_operation, montant
                FROM transfer_history
                WHERE destination_id = a.id
            ) all_incoming
            ORDER BY date_operation DESC
            LIMIT 1
        ) as date_dernier_entrant,
        (
            SELECT montant FROM (
                SELECT created_at as date_operation, amount as montant
                FROM credit_history 
                WHERE account_id = a.id
                
                UNION ALL
                
                SELECT created_at as date_operation, amount as montant
                FROM special_credit_history 
                WHERE account_id = a.id AND is_balance_override = true
                
                UNION ALL
                
                SELECT created_at as date_operation, montant
                FROM transfer_history
                WHERE destination_id = a.id
            ) all_incoming
            ORDER BY date_operation DESC
            LIMIT 1
        ) as montant_dernier_entrant
    FROM accounts a
    WHERE a.account_type = 'statut' AND a.is_active = true
)
SELECT 
    de.*,
    (
        SELECT COUNT(*)
        FROM transfer_history th
        WHERE (th.source_id = de.id OR th.destination_id = de.id)
            AND th.created_at > COALESCE(de.date_dernier_entrant, '1900-01-01'::timestamp)
    ) as nb_transferts_apres_dernier_entrant,
    -- Nouveau calcul
    (
        COALESCE(de.montant_dernier_entrant, 0)
        -
        COALESCE((
            SELECT SUM(th.montant)
            FROM transfer_history th
            WHERE th.source_id = de.id
                AND th.created_at > COALESCE(de.date_dernier_entrant, '1900-01-01'::timestamp)
        ), 0)
        -
        COALESCE((
            SELECT SUM(e.total)
            FROM expenses e
            WHERE e.account_id = de.id
                AND e.expense_date > COALESCE(de.date_dernier_entrant::date, '1900-01-01'::date)
        ), 0)
    ) as nouveau_solde_calcule
FROM derniers_entrants de
ORDER BY (
    COALESCE(de.montant_dernier_entrant, 0)
    -
    COALESCE((
        SELECT SUM(th.montant)
        FROM transfer_history th
        WHERE th.source_id = de.id
            AND th.created_at > COALESCE(de.date_dernier_entrant, '1900-01-01'::timestamp)
    ), 0)
    -
    COALESCE((
        SELECT SUM(e.total)
        FROM expenses e
        WHERE e.account_id = de.id
            AND e.expense_date > COALESCE(de.date_dernier_entrant::date, '1900-01-01'::date)
    ), 0)
) - de.db_balance DESC;
```

**Interprétation :**
- `db_balance` : Solde actuellement stocké dans la DB
- `nouveau_solde_calcule` : Solde avec la nouvelle logique
- `nb_transferts_apres_dernier_entrant` : Nombre de transferts qui étaient ignorés

### 2. Test Visuel dans l'Application

1. **Identifier un compte statut** qui a des transferts récents
2. **Ouvrir le dashboard**
3. **Cliquer sur le bouton ℹ️** à côté de "Cash disponible"
4. **Vérifier** que le solde affiché correspond au dernier événement entrant (crédit ou transfert), moins les sorties/dépenses postérieures

### 3. Script de Test Détaillé pour un Compte

Remplacez `XXX` par l'ID d'un de vos comptes statut :

```sql
-- Test détaillé pour un compte spécifique
WITH compte_test AS (
    SELECT 
        id, 
        account_name, 
        account_type,
        current_balance
    FROM accounts 
    WHERE id = XXX  -- ← Remplacer par l'ID de votre compte
)
SELECT 
    'Compte testé' as etape,
    ct.account_name as info,
    ct.current_balance as montant
FROM compte_test ct

UNION ALL

SELECT 
    '1️⃣ Tous les événements ENTRANTS' as etape,
    CONCAT(
        TO_CHAR(date_operation, 'DD/MM/YYYY HH24:MI'), 
        ' - ', 
        source, 
        ' : ', 
        TO_CHAR(montant, 'FM999,999,999')
    ) as info,
    montant
FROM (
    SELECT 
        created_at as date_operation,
        'credit_history' as source,
        amount as montant
    FROM credit_history 
    WHERE account_id = XXX
    
    UNION ALL
    
    SELECT 
        created_at as date_operation,
        'special_credit_history' as source,
        amount as montant
    FROM special_credit_history 
    WHERE account_id = XXX AND is_balance_override = true
    
    UNION ALL
    
    SELECT 
        created_at as date_operation,
        'transfer_IN' as source,
        montant
    FROM transfer_history
    WHERE destination_id = XXX
) all_events
ORDER BY date_operation DESC

UNION ALL

SELECT 
    '👑 DERNIER ENTRANT (base du calcul)' as etape,
    CONCAT(
        TO_CHAR(date_operation, 'DD/MM/YYYY HH24:MI'), 
        ' - ', 
        source
    ) as info,
    montant
FROM (
    SELECT 
        created_at as date_operation,
        'credit_history' as source,
        amount as montant
    FROM credit_history 
    WHERE account_id = XXX
    
    UNION ALL
    
    SELECT 
        created_at as date_operation,
        'special_credit_history' as source,
        amount as montant
    FROM special_credit_history 
    WHERE account_id = XXX AND is_balance_override = true
    
    UNION ALL
    
    SELECT 
        created_at as date_operation,
        'transfer_IN' as source,
        montant
    FROM transfer_history
    WHERE destination_id = XXX
) all_events
ORDER BY date_operation DESC
LIMIT 1

UNION ALL

SELECT 
    '2️⃣ Transferts SORTANTS après dernier entrant' as etape,
    CONCAT(TO_CHAR(th.created_at, 'DD/MM/YYYY HH24:MI'), ' - Transfert OUT') as info,
    -th.montant as montant
FROM transfer_history th
WHERE th.source_id = XXX
    AND th.created_at > (
        SELECT date_operation FROM (
            SELECT created_at as date_operation
            FROM credit_history 
            WHERE account_id = XXX
            
            UNION ALL
            
            SELECT created_at as date_operation
            FROM special_credit_history 
            WHERE account_id = XXX AND is_balance_override = true
            
            UNION ALL
            
            SELECT created_at as date_operation
            FROM transfer_history
            WHERE destination_id = XXX
        ) all_incoming
        ORDER BY date_operation DESC
        LIMIT 1
    )
ORDER BY th.created_at

UNION ALL

SELECT 
    '3️⃣ Dépenses après dernier entrant' as etape,
    CONCAT(TO_CHAR(e.expense_date, 'DD/MM/YYYY'), ' - ', COALESCE(e.description, 'Sans description')) as info,
    -e.total as montant
FROM expenses e
WHERE e.account_id = XXX
    AND e.expense_date > (
        SELECT date_operation::date FROM (
            SELECT created_at as date_operation
            FROM credit_history 
            WHERE account_id = XXX
            
            UNION ALL
            
            SELECT created_at as date_operation
            FROM special_credit_history 
            WHERE account_id = XXX AND is_balance_override = true
            
            UNION ALL
            
            SELECT created_at as date_operation
            FROM transfer_history
            WHERE destination_id = XXX
        ) all_incoming
        ORDER BY date_operation DESC
        LIMIT 1
    )
ORDER BY e.expense_date

UNION ALL

SELECT 
    '💰 SOLDE CALCULÉ' as etape,
    'Nouveau calcul avec correction' as info,
    (
        COALESCE((
            SELECT montant FROM (
                SELECT created_at as date_operation, amount as montant
                FROM credit_history 
                WHERE account_id = XXX
                
                UNION ALL
                
                SELECT created_at as date_operation, amount as montant
                FROM special_credit_history 
                WHERE account_id = XXX AND is_balance_override = true
                
                UNION ALL
                
                SELECT created_at as date_operation, montant
                FROM transfer_history
                WHERE destination_id = XXX
            ) all_incoming
            ORDER BY date_operation DESC
            LIMIT 1
        ), 0)
        -
        COALESCE((
            SELECT SUM(th.montant)
            FROM transfer_history th
            WHERE th.source_id = XXX
                AND th.created_at > (
                    SELECT date_operation FROM (
                        SELECT created_at as date_operation
                        FROM credit_history 
                        WHERE account_id = XXX
                        
                        UNION ALL
                        
                        SELECT created_at as date_operation
                        FROM special_credit_history 
                        WHERE account_id = XXX AND is_balance_override = true
                        
                        UNION ALL
                        
                        SELECT created_at as date_operation
                        FROM transfer_history
                        WHERE destination_id = XXX
                    ) all_incoming
                    ORDER BY date_operation DESC
                    LIMIT 1
                )
        ), 0)
        -
        COALESCE((
            SELECT SUM(e.total)
            FROM expenses e
            WHERE e.account_id = XXX
                AND e.expense_date > (
                    SELECT date_operation::date FROM (
                        SELECT created_at as date_operation
                        FROM credit_history 
                        WHERE account_id = XXX
                        
                        UNION ALL
                        
                        SELECT created_at as date_operation
                        FROM special_credit_history 
                        WHERE account_id = XXX AND is_balance_override = true
                        
                        UNION ALL
                        
                        SELECT created_at as date_operation
                        FROM transfer_history
                        WHERE destination_id = XXX
                    ) all_incoming
                    ORDER BY date_operation DESC
                    LIMIT 1
                )
        ), 0)
    ) as montant;
```

---

## ⚠️ Points d'Attention

### 1. Pas de Migration de Données Nécessaire

Cette correction modifie uniquement la **logique de calcul**. Aucune modification de schéma de base de données n'est requise.

### 2. Redémarrage du Serveur

Après avoir appliqué les changements :
```bash
# Redémarrer l'application
pm2 restart app  # ou votre méthode de restart
```

### 3. Vider le Cache Navigateur

Les utilisateurs devront peut-être vider leur cache :
- **Chrome/Edge :** Ctrl + Shift + R
- **Firefox :** Ctrl + Shift + Delete

### 4. Comptes Affectés

Seuls les comptes de type **statut** et **depot** sont concernés. Les comptes **classique**, **partenaire**, et **creance** ne changent pas.

### 5. Performance

La nouvelle requête utilise des sous-requêtes optimisées avec `LIMIT 1`. L'impact sur les performances devrait être minimal.

---

## 📊 Impact Attendu

### Avant la Correction

Les comptes statut qui ont :
- ✅ Un snapshot dans `special_credit_history`
- ✅ Des transferts APRÈS ce snapshot

→ Affichent un solde incorrect (ignore les transferts)

### Après la Correction

- ✅ Le dernier événement entrant (crédit OU transfert) est pris en compte
- ✅ Ce montant REMPLACE le solde précédent
- ✅ Les transferts sortants et dépenses postérieurs sont soustraits
- ✅ Le "Détail du Cash disponible" affiche le bon solde

---

## ✅ Checklist de Déploiement

- [ ] Fork synchronisé ou modifications appliquées manuellement
- [ ] Script de diagnostic SQL exécuté (avant correction)
- [ ] Comptes affectés identifiés et documentés
- [ ] Code modifié dans `server.js`
- [ ] Application redémarrée
- [ ] Script de diagnostic SQL réexécuté (après correction)
- [ ] Validation visuelle dans le dashboard
- [ ] "Détail du Cash disponible" vérifié pour plusieurs comptes
- [ ] Tests de non-régression passés (si disponibles)
- [ ] Utilisateurs informés du changement
- [ ] Documentation mise à jour

---

## 🆘 En Cas de Problème

### Les soldes semblent toujours incorrects

1. ✅ Vérifier que le serveur a bien redémarré avec le nouveau code
2. ✅ Vider le cache du navigateur (Ctrl+Shift+R)
3. ✅ Exécuter le script de diagnostic SQL pour un compte spécifique
4. ✅ Vérifier les logs serveur pour des erreurs SQL

### Erreur SQL lors du démarrage

1. ✅ Vérifier que la syntaxe SQL est exacte (parenthèses, virgules)
2. ✅ Vérifier que les noms de tables sont corrects dans votre schéma
3. ✅ Tester la requête isolément dans pgAdmin ou psql

### Différences de calcul importantes

C'est normal ! Si les transferts étaient ignorés avant, les soldes vont changer significativement. Utilisez le script de diagnostic pour comprendre les différences.

---

## 📞 Support

Pour toute question ou problème :
1. Consulter la documentation dans `CORRECTION_COMPTES_STATUT_TRANSFERTS.md`
2. Exécuter les scripts de diagnostic fournis
3. Vérifier les logs serveur
4. Contacter l'équipe de développement du repo principal

---

**Version du Guide :** 1.0  
**Date :** 07 octobre 2025  
**Commit de référence :** abcd871  
**Repo principal :** https://github.com/Zalint/MATA_DEPENSES_MANAGEMENT.git

