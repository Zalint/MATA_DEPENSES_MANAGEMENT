   # 🧪 Guide des Tests de Non-Régression
   *Système de validation automatisée complet - 28 Tests*

   ---

   ## 📋 **Vue d'ensemble**

   Ce système de tests garantit l'intégrité complète du système de gestion des dépenses MATA. Il valide automatiquement :

   - **Solde actuel = Solde net calculé**
   - **Somme des transactions (audit flux) = Solde net**
   - **Logique métier** pour tous les types de comptes
   - **Fonctionnalités avancées** (PL, Cash, Stock, Factures, Validation)

   ### 🎯 **Résultats Actuels**
   - ✅ **28 tests passent** (100% de réussite)
   - ⏱️ **Temps d'exécution : ~1050ms**
   - 🔄 **Synchronisation EXACTEMENT identique à la PRODUCTION**
   - 📊 **Base de test isolée** (`github_test_database_setup.sql`)
   - 🏭 **Fonctions PostgreSQL PROD extraites directement**
   - 🚫 **ZÉRO fallback** - Code production pur

   ---

   ## 🧪 **Tests Implémentés (28 Tests Complets)**

   ### **🐄 Tests Compte CLASSIQUE (BOVIN) - Tests 1-6**

   #### **Test 1 & 2 : Dépense 1000 FCFA**
   ```javascript
   ✅ Ajout dépense 1000 FCFA → Vérification cohérence
   ✅ Suppression dépense 1000 FCFA → Vérification cohérence
   ```
   - **Objectif** : Valider les opérations de dépense
   - **Vérification** : `Solde = Total crédité - Total dépensé + Transferts net`

   #### **Test 3 & 4 : Créance 500 FCFA**
   ```javascript
   ✅ Ajout créance 500 FCFA → Vérification cohérence
   ✅ Suppression créance 500 FCFA → Vérification cohérence
   ```
   - **Objectif** : Valider les opérations de crédit
   - **Vérification** : Mise à jour correcte du `total_credited`

   #### **Test 5 & 6 : Transfert 750 FCFA**
   ```javascript
   ✅ Transfert BOVIN → OVIN (750 FCFA) → Vérification cohérence des 2 comptes
   ✅ Suppression transfert → Vérification cohérence des 2 comptes
   ```
   - **Objectif** : Valider les transferts inter-comptes
   - **Vérification** : Cohérence des soldes source ET destination

   ### **📊 Tests par Type de Compte - Tests 7-9**

   #### **Test 7 : Compte STATUT**
   ```javascript
   🏦 Compte : SOLDE_COURANT_BANQUE_TEST_REG
   📝 Logique : Solde = Dernière transaction chronologique
   🔍 Ordre : date DESC → timestamp DESC → ID DESC
   💰 Valeur testée : 3,247,870 FCFA
   ```

   #### **Test 8 : Compte PARTENAIRE**  
   ```javascript
   🤝 Compte : MATA_VOLAILLE_CHAIR_TEST_REG
   📝 Logique : Solde = Total crédité - Livraisons validées
   🔍 Seules les livraisons 'fully_validated' sont déduites
   💰 Valeur testée : 4,500,000 FCFA (5M - 500K validées)
   ```

   #### **Test 9 : Compte CRÉANCE - Logique Métier Authentique** 🆕
   ```javascript
   💳 Compte : COMPTE_CREANCE_TEST_REG (temporaire)
   👤 Client : Client Test Créance (crédit initial: 200,000 FCFA)
   💰 Avance : +800,000 FCFA (opération credit)
   💸 Remboursement : -300,000 FCFA (opération debit)
   📝 Logique : Solde = crédit_initial + avances - remboursements
   🎯 Résultat : 700,000 FCFA (200K + 800K - 300K)

   🔧 DIFFÉRENCE vs Comptes Classiques :
   ❌ PAS de crédits directs (credit_history)
   ❌ PAS de transferts inter-comptes  
   ✅ Clients avec crédit initial
   ✅ Opérations de créance (avances/remboursements)
   ```

   ### **💼 Tests Fonctionnels Avancés - Tests 10-17**

   #### **Test 10 : Calcul PL (Profit & Loss)**
   ```javascript
   💰 COMPOSANTES DU PL:
      • Cash Bictorys du mois: 15,000,000 FCFA
      • Créances du mois: 2,500,000 FCFA
      • Stock Point de Vente: 1,200,000 FCFA
      • Cash Burn du mois: -8,500,000 FCFA
      • PL de base: 10,200,000 FCFA

   🌱 ÉCART STOCK VIVANT: +800,000 FCFA
   🚚 LIVRAISONS PARTENAIRES: -1,500,000 FCFA
   ⚙️ CHARGES PRORATA: -1,555,556 FCFA
   🎯 PL FINAL: 7,944,444 FCFA
   ```

   #### **Test 11 : Cash Disponible**
   ```javascript
   📊 RÈGLES D'INCLUSION:
      ✅ INCLUS: classique, statut (8,700,000 FCFA)
      ❌ EXCLU: creance, depot, partenaire (8,500,000 FCFA)
   💰 RÉSULTAT: 8,700,000 FCFA
   ```

   #### **Test 12 : Livraisons Partenaires**
   ```javascript
   🚚 TESTS:
      • Ajout livraison (pending)
      • Validation livraison (fully_validated)
      • Rejet livraison (rejected)
      • Calcul solde restant = Total crédité - Validées
   💰 RÉSULTAT: 4,000,000 FCFA (5M - 1M validées)
   ```

   #### **Test 13 : Gestion Créances**
   ```javascript
   💳 FONCTIONNALITÉS:
      • Ajout/modification clients
      • Opérations créance (Avance +/Remboursement -)
      • Calcul soldes clients
   👤 CLIENT ALPHA: 420,000 FCFA (120K + 500K - 200K)
   👤 CLIENT BETA: 200,000 FCFA (50K + 300K - 150K)
   💰 TOTAL COMPTE: 620,000 FCFA
   ```

   #### **Test 14 : Stock Vivant**
   ```javascript
   🌱 FONCTIONNALITÉS:
      • Copie stock date → date
      • Modifications quantités/prix
      • Calculs totaux
   📦 STOCK INITIAL: 21,585,000 FCFA
   ✏️ APRÈS MODIFICATIONS: 23,015,000 FCFA
   📊 ENTRÉES: 4 | MIN: 175K | MAX: 18M
   ```

   #### **Test 15 : Cash Bictorys Mensuel**
   ```javascript
   💰 LOGIQUE VALEUR RÉCENTE:
      • Prend la valeur la plus récente (pas de cumul)
      • Respect de la date de coupure
   📅 TEST: 2025-01 → 13,500,000 FCFA (date 2025-01-21)
   🚫 PAS DE CUMUL: 76,500,000 vs 13,500,000 FCFA
   ```

   #### **Test 16 : Génération Factures**
```javascript
📋 FONCTIONNALITÉS:
   • Génération avec/sans justificatifs
   • Traitement images (.jpg/.png)
   • Templates MATA automatiques
   • Gestion erreurs justificatifs
📎 JUSTIFICATIFS TESTÉS:
   • CachetMata.jpg (218.4 KB) - Format .jpg
   • Matabanq.png (837.9 KB) - Format .png
📄 SANS JUSTIF: Template généré automatiquement
✅ GESTION ERREUR: Fichier inexistant détecté correctement
```

   #### **Test 17 : Validation Budget**
   ```javascript
   🎯 SCÉNARIOS:
      • Budget suffisant (50K/100K) → ✅ Autorisé
      • Budget insuffisant (150K/100K) → ❌ Bloqué
      • Compte STATUT → ✅ Exempt (toujours autorisé)
      • Mode libre → ✅ Dépassement autorisé
   ⚙️ Configuration dynamique via financial_settings.json
   ```

   #### **Test 18 : Cut-off Date - Analyse Historique**
   ```javascript
   📅 Dates test : 2025-01-05 à 2025-01-20 (transactions étalées)
   💰 Cut-off référence : 2025-01-15
   🔍 Calcul historique : 5M + 4.5M crédits - 1M dépenses = 8.5M FCFA
   🚫 Transactions futures : 3M crédits + 800K dépenses (exclues)
   📊 Cut-off récent : 2025-01-20 = 10.7M FCFA (inclut futures)
   🎯 Résultat : Filtrage chronologique précis et fonctionnel

   🔧 FONCTIONNALITÉS TESTÉES :
   ✓ Exclusion transactions > cut-off date
   ✓ Calcul solde à date donnée (historique)
   ✓ Filtrage crédits/dépenses par timestamp
   ✓ Support multiple dates de référence
   ```

   #### **Test 19 : Cohérence Colonnes Transferts** 🆕
   ```javascript
   🔄 SYNCHRONISATION AUTOMATIQUE:
      • Ajout transfert → Colonnes mises à jour automatiquement
      • Suppression transfert → Colonnes remises à zéro
      • Transferts multiples → Calculs cumulés corrects

   🧪 SCÉNARIOS TESTÉS:
      • Compte Source (50K FCFA) ⟷ Compte Destination (30K FCFA)
      • Transfert simple : 15K FCFA → Vérification entrants/sortants
      • Suppression : Retour à 0 → Vérification cohérence
      • Multiples : 10K + 5K + 8K → Calculs cumulés exacts

   📊 VALIDATION COHÉRENCE:
      ✓ transfert_entrants = SUM(transfer_history WHERE destination_id)
      ✓ transfert_sortants = SUM(transfer_history WHERE source_id)
      ✓ Trigger PostgreSQL automatique (INSERT/UPDATE/DELETE)
      ✓ Interface UI utilise nouvelles colonnes
      ✓ API backend retourne colonnes transferts

   🎯 OBJECTIF: Éliminer l'incohérence entre "Informations du Compte" 
   et "Historique des Mouvements" grâce aux colonnes de transferts
   
   📈 RÉSULTAT: Cohérence parfaite 7,432,987 FCFA = 7,432,987 FCFA
   ```

   ### **🔍 Test de Vérification Finale**
   - Synthèse complète de tous les tests
   - Rapport de cohérence globale
   - Validation de l'état final du système
   - Vérification solde BOVIN final : 6,000 FCFA

   ---

   ## 🏗️ **Architecture du Système**

   ### **📁 Fichiers Principaux**
   ```
   test_regression_new.js                    # Tests de non-régression (28 tests)
   copy_preprod_to_test.ps1                  # Script copie base préprod → test
   package.json                              # Scripts npm configurés
   .github/workflows/                        # Automatisation CI/CD
   .git/hooks/pre-push                      # Hook Git automatique
   start_preprod.bat                        # Script Windows test local
   financial_settings.json                  # Configuration validation budget
   create_sync_balance_trigger.sql          # Trigger sync Balance → SOLDE BICTORYS AFFICHE
   GUIDE_SYNC_BALANCE_SOLDE_COURANT.md     # Documentation trigger synchronisation
   ```

   ### **🔧 Fonctions de Synchronisation (Production Pure)**

   #### **`syncAccountBalance(accountId)`** 🏭
   - **COPIE EXACTE** de `server.js` lignes 12295-12328
   - Utilise `public.force_sync_account()` PostgreSQL **EXTRAITE DE PRODUCTION**
   - **VOID function** - pas de retour JSON (comme en production)
   - **AUCUN fallback** - fonction PostgreSQL obligatoire
   - Schema prefix `public.` obligatoire sur GitHub Actions
   - Exécutée automatiquement avant chaque vérification

   #### **`forceSyncAllAccountsAfterCreditOperation()`** 🏭
   - **COPIE EXACTE** de `server.js` lignes 68-92
   - Utilise `public.force_sync_all_accounts_simple()` **EXTRAITE DE PRODUCTION**
   - Retourne `synchronized_accounts`, `errors`, `message` (format PROD)
   - Schema prefix `public.` obligatoire sur GitHub Actions
   - Synchronisation automatique après opérations de crédit
   - Appliquée sur comptes `classique` uniquement
   - **AUCUN fallback** - mécanisme production strict

   ### **🔧 Fonctions Utilitaires de Test**

   #### **`checkBalanceConsistency(accountId, description)`**
   - Vérification complète de cohérence avec sync production
   - Synchronisation automatique via `syncAccountBalance()`
   - Assertions automatiques avec messages d'erreur détaillés
   - Logging complet des résultats

   #### **`calculateNetBalance(accountId)`**
   - Calcul du solde net selon la logique classique
   - Formule : `Crédits - Dépenses + Transferts net`
   - Gestion des transferts entrants/sortants
   - Utilisé pour validation et fallback

   #### **`calculateAuditFluxSum(accountName)`**
   - Calcul de la somme des transactions pour audit
   - Agrégation : `Crédits - Dépenses - Transferts sortants + Transferts entrants`
   - Validation de la cohérence des flux comptables

   #### **`getFinancialConfig()`** 💰
   - Lecture configuration validation budget
   - Gestion mode libre/strict pour validation des soldes
   - Synchronisée avec l'interface utilisateur

   ---

   ## 🏭 **Mécanisme de Synchronisation Production EXACTE**

   ### **🎯 Fonctions PostgreSQL Extraites Directement de Production**

   Les tests utilisent désormais **EXACTEMENT les mêmes fonctions PostgreSQL** que la production, extraites via :
   ```sql
   -- Extraction directe depuis production
   SELECT pg_get_functiondef(oid) as definition 
   FROM pg_proc 
   WHERE proname = 'force_sync_account'
   ```

   ### **🔧 GitHub Actions - Schéma EXACTEMENT Identique PROD**

   #### **💀 Problèmes de Colonnes Manquantes RÉSOLUS :**
   ```
   ❌ AVANT: column "unit_price" does not exist
   ❌ AVANT: column "validation_status" does not exist  
   ❌ AVANT: column "article_count" does not exist
   ✅ MAINTENANT: Schéma PRODUCTION complet extrait directement
   ```

   #### **🏭 Table partner_deliveries - Schéma Production Complet :**
   ```sql
   CREATE TABLE IF NOT EXISTS partner_deliveries (
       id SERIAL PRIMARY KEY,
       account_id INTEGER NOT NULL,
       delivery_date DATE NOT NULL,
       amount NUMERIC NOT NULL,
       description TEXT,
       status VARCHAR(255) DEFAULT 'pending',
       validated_by INTEGER,
       validation_date TIMESTAMP,
       rejection_reason TEXT,
       created_by INTEGER,
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
       updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
       unit_price NUMERIC,                    -- Était manquante
       article_count INTEGER,                 -- Était manquante  
       is_validated BOOLEAN DEFAULT false,
       validated_at TIMESTAMP,
       validation_status VARCHAR(255) DEFAULT 'pending',  -- Était manquante
       first_validated_by INTEGER,
       first_validated_at TIMESTAMP,
       rejection_comment TEXT,
       rejected_by INTEGER,
       rejected_at TIMESTAMP
   );
   ```

   #### **📋 Fonctions PostgreSQL Identiques PROD :**
   - `public.force_sync_account(accountId)` - **VOID**, logique complexe 3 types comptes
   - `public.force_sync_all_accounts_simple()` - Retourne JSON `synchronized_accounts`/`errors`
   - **Schema prefix** `public.` obligatoire sur GitHub Actions

   #### **🎯 Déclenchement Automatique (MODE PRODUCTION PUR) :**
   ```javascript
   // EXACTEMENT comme en production - AUCUN fallback
   const accountTypeCheck = await pool.query('SELECT account_type FROM accounts WHERE id = $1', [accountId]);
   if (accountTypeCheck.rows.length > 0 && accountTypeCheck.rows[0].account_type === 'classique') {
      await forceSyncAllAccountsAfterCreditOperation();
   }
   
   // GitHub Actions: Schema prefix obligatoire
   await pool.query('SELECT public.force_sync_account($1)', [accountId]);
   await pool.query('SELECT public.force_sync_all_accounts_simple()');
   ```

   #### **🚫 SUPPRESSION de TOUS les Fallbacks :**
   ```
   🔄 AUTO-SYNC: Synchronisation automatique des comptes après modification de crédit...
   ✅ AUTO-SYNC: Synchronisation terminée - 24 comptes synchronisés, 0 erreurs
   🎯 Synchronisation compte 3
   ✅ BOVIN_TEST_REG synchronisé: 4,000 FCFA
   ```

   ### **✅ Avantages du Mode Production Pur :**
   - **Fidélité TOTALE** à la production (100% identique)
   - **Fiabilité maximale** : si ça marche en test, ça marche en production
   - **Maintenance ZÉRO** : aucune logique spécifique aux tests
   - **Debugging authentique** : erreurs identiques à celles de production

   ### **🔄 Enchaînement Exact de Synchronisation en Production**

   #### **1. 🏭 Synchronisation AUTOMATIQUE (Opérations de Crédit)**

   **Déclenchement :** Ajout/Modification/Suppression de crédit sur compte `classique`

   ```javascript
   // 1. API Call: POST /api/credit-history
   app.post('/api/credit-history', requireAdminAuth, async (req, res) => {
      // ... logique ajout crédit ...
      
      // 2. Vérification Type de Compte
      const accountTypeCheck = await pool.query(
         'SELECT account_type FROM accounts WHERE id = $1', 
         [accountId]
      );
      
      // 3. Déclenchement Conditionnel
      if (accountTypeCheck.rows[0].account_type === 'classique') {
         await forceSyncAllAccountsAfterCreditOperation();
      }
   });

   // 4. Fonction de Sync Automatique
   async function forceSyncAllAccountsAfterCreditOperation() {
      console.log('🔄 AUTO-SYNC: Synchronisation automatique...');
      
      // 5. Appel PostgreSQL
      const result = await pool.query('SELECT force_sync_all_accounts_simple()');
      const syncData = result.rows[0].force_sync_all_accounts_simple;
      
      console.log(`✅ AUTO-SYNC: ${syncData.total_corrected} comptes corrigés`);
   }
   ```

   #### **2. 🏭 Synchronisation AUTOMATIQUE (Toutes Opérations) - NOUVEAU!**

   **Déclenchement :** Ajout/Modification/Suppression sur TOUS types d'opérations affectant les soldes

   ```javascript
   // 1. Fonction Helper Générique
   async function triggerAutoSyncIfNeeded(accountId, operationType = 'modification') {
      // Vérifier le type de compte
      const account = await pool.query('SELECT account_type, account_name FROM accounts WHERE id = $1', [accountId]);
      
      // Déclencher sync UNIQUEMENT pour comptes classiques
      if (account.rows[0].account_type === 'classique') {
         console.log(`🔄 AUTO-SYNC: Déclenchement après ${operationType} sur compte classique`);
         return await forceSyncAllAccountsAfterCreditOperation();
      } else {
         console.log(`ℹ️ AUTO-SYNC: Compte ${account.account_type} - pas de sync automatique`);
      }
   }

   // 2. Intégration dans TOUTES les opérations
   app.post('/api/expenses', requireAuth, async (req, res) => {
      // ... logique ajout dépense ...
      await pool.query('COMMIT');
      
      // ✅ NOUVEAU: Synchronisation automatique
      await triggerAutoSyncIfNeeded(account_id, 'ajout de dépense');
   });
   
   app.post('/api/transfert', requireSuperAdmin, async (req, res) => {
      // ... logique transfert ...
      await pool.query('COMMIT');
      
      // ✅ NOUVEAU: Synchronisation des 2 comptes
      await triggerAutoSyncIfNeeded(source_id, 'transfert sortant');
      await triggerAutoSyncIfNeeded(destination_id, 'transfert entrant');
   });
   ```

   #### **3. ⚙️ Synchronisation MANUELLE (Interface Admin)**

   **Scénario A :** Admin clique "Synchroniser Compte"
   ```javascript
   // API Call: POST /api/admin/force-sync-account/:accountId
   const result = await pool.query('SELECT force_sync_account($1)', [accountId]);
   const syncData = result.rows[0].force_sync_account;
   console.log(`✅ ${accountName} synchronisé: ${syncData.new_balance} FCFA`);
   ```

   **Scénario B :** Admin clique "Synchroniser Tous"
   ```javascript
   // API Call: POST /api/admin/force-sync-all-accounts
   const result = await pool.query('SELECT force_sync_all_accounts_simple()');
   const syncData = result.rows[0].force_sync_all_accounts_simple;
   console.log(`✅ ${syncData.total_corrected} comptes corrigés`);
   ```

   #### **📊 Tableau des Déclencheurs (NOUVELLE VERSION)**

   | **Opération** | **Compte Type** | **Sync Auto** | **API Utilisée** | **Nouveau** |
   |---------------|-----------------|---------------|-------------------|-------------|
   | Ajout Crédit | `classique` | ✅ OUI | `force_sync_all_accounts_simple()` | - |
   | Modif Crédit | `classique` | ✅ OUI | `force_sync_all_accounts_simple()` | - |
   | Suppr Crédit | `classique` | ✅ OUI | `force_sync_all_accounts_simple()` | - |
   | **Ajout Dépense** | **`classique`** | **✅ OUI** | **`force_sync_all_accounts_simple()`** | **🆕** |
   | **Modif Dépense** | **`classique`** | **✅ OUI** | **`force_sync_all_accounts_simple()`** | **🆕** |
   | **Suppr Dépense** | **`classique`** | **✅ OUI** | **`force_sync_all_accounts_simple()`** | **🆕** |
   | **Ajout Transfert** | **`classique`** | **✅ OUI** | **`force_sync_all_accounts_simple()`** | **🆕** |
   | **Suppr Transfert** | **`classique`** | **✅ OUI** | **`force_sync_all_accounts_simple()`** | **🆕** |
   | Toutes opérations | `statut/partenaire/creance/depot` | ❌ NON | - | - |
   | Admin Sync Un | Tous types | 🔧 MANUEL | `force_sync_account(id)` | - |
   | Admin Sync Tous | Tous types | 🔧 MANUEL | `force_sync_all_accounts_simple()` | - |

   ### **📅 Mécanisme Cut-off Date (Analyse Historique)**

   Le système intègre une fonctionnalité avancée de **cut-off date** permettant d'analyser l'état financier à n'importe quelle date passée.

   #### **🎯 Principe de Fonctionnement**

   ```javascript
   // 1. Paramètres d'entrée
   const { start_date, end_date, cutoff_date } = req.query;

   // 2. Logique conditionnelle
   if (cutoff_date) {
      // Mode Snapshot : calculs jusqu'à cutoff_date (incluse)
      const cutoffMonth = cutoff_date.substring(0, 7) + '-01';
      WHERE e.expense_date >= $1 AND e.expense_date <= $2
      params = [cutoffMonth, cutoff_date];
   } else {
      // Mode Normal : utiliser start_date/end_date
      WHERE e.expense_date >= $1 AND e.expense_date <= $2
      params = [start_date, end_date];
   }
   ```

   #### **📊 Applications dans le Dashboard**

   | **API Route** | **Paramètre Cut-off** | **Comportement** |
   |---------------|------------------------|------------------|
   | `/api/dashboard/stats-cards` | `cutoff_date` | Calcul soldes jusqu'à date donnée |
   | `/api/dashboard/monthly-data` | `cutoff_date` | Données mensuelles filtrées |
   | `/api/dashboard/monthly-cash-bictorys` | `cutoff_date` | Dernière valeur <= cutoff |
   | `/api/dashboard/stock-summary` | `cutoff_date` | Stock Mata à date spécifique |

   #### **🔍 Requêtes Typiques (Test 18)**

   ```sql
   -- Solde à une date donnée (cut-off)
   SELECT (solde_initial + 
         SUM(crédits WHERE created_at <= cutoff_date) -
         SUM(dépenses WHERE expense_date <= cutoff_date)) as balance_at_cutoff

   -- Exclusion des transactions futures
   SELECT COUNT(*) as futures_transactions
   FROM transactions 
   WHERE date > cutoff_date  -- Ces transactions sont ignorées
   ```

   #### **✅ Avantages du Système Cut-off**
   - **📈 Analyse rétroactive** : État exact du système à une date passée
   - **🔍 Audit financier** : Vérifier les soldes historiques
   - **📊 Reporting flexible** : Rapports sur période personnalisée
   - **🎯 Cohérence temporelle** : Exclusion automatique des transactions futures

   ---

   ## 📡 **APIs de l'Application - Documentation Complète**

   ### **🔐 Types d'Authentification**

   | **Middleware** | **Rôles Autorisés** | **Description** |
   |----------------|---------------------|-----------------|
   | `requireAuth` | Tous utilisateurs connectés | Authentification de base |
   | `requireAdminAuth` | admin, directeur_general, pca | Permissions administratives |
   | `requireSuperAdmin` | admin | Permissions super administrateur |
   | `requireSuperAdminOnly` | admin seulement | Admin exclusif (delete/reset) |
   | `requireStockVivantAuth` | Permissions spéciales | Accès stock vivant |
   | `requireCashBictorysAuth` | Permissions spéciales | Accès cash bictorys |
   | `requireStrictAdminAuth` | admin strict | Opérations critiques |

   ### **🔗 Authentification & Session**

   #### **🟢 POST** `/api/login`
   ```javascript
   // Input
   {
   "username": "string",
   "password": "string"
   }

   // Output Success (200)
   {
   "message": "Connexion réussie",
   "user": {
      "id": "number",
      "username": "string", 
      "role": "string",
      "full_name": "string"
   }
   }

   // Output Error (401)
   { "error": "Nom d'utilisateur ou mot de passe incorrect" }
   ```

   #### **🟢 POST** `/api/logout`
   ```javascript
   // Input: Aucun
   // Output (200)
   { "message": "Déconnexion réussie" }
   ```

   #### **🔵 GET** `/api/user`
   - **Auth**: `requireAuth`
   ```javascript
   // Output (200)
   {
   "id": "number",
   "username": "string",
   "role": "string", 
   "full_name": "string"
   }
   ```

   ### **💰 Gestion des Comptes**

   #### **🔵 GET** `/api/accounts`
   - **Auth**: `requireAuth`
   ```javascript
   // Query Params
   ?user_id=number&include_inactive=boolean

   // Output (200)
   [
   {
      "id": "number",
      "account_name": "string",
      "account_type": "classique|statut|partenaire|creance|depot",
      "current_balance": "number",
      "total_credited": "number",
      "is_active": "boolean",
      "user_name": "string",
      "category": "string"
   }
   ]
   ```

   #### **🔵 GET** `/api/accounts/for-credit`
   - **Auth**: `requireAdminAuth`
   ```javascript
   // Output (200)
   [
   {
      "id": "number",
      "account_name": "string",
      "account_type": "string",
      "current_balance": "number",
      "user_name": "string"
   }
   ]
   ```

   #### **🔵 GET** `/api/accounts/:accountId/balance`
   - **Auth**: `requireAuth`
   ```javascript
   // Output (200)
   {
   "account_id": "number",
   "account_name": "string",
   "current_balance": "number",
   "total_credited": "number",
   "net_balance": "number"
   }
   ```

   #### **🟢 POST** `/api/accounts/create`
   - **Auth**: `requireAdminAuth`
   ```javascript
   // Input
   {
   "account_name": "string",
   "account_type": "classique|statut|partenaire|creance|depot",
   "user_id": "number",
   "category": "string",
   "initial_balance": "number"
   }

   // Output (201)
   {
   "message": "Compte créé avec succès",
   "accountId": "number"
   }
   ```

   #### **🟡 PUT** `/api/accounts/:accountId/update`
   - **Auth**: `requireAdminAuth`
   ```javascript
   // Input
   {
   "account_name": "string",
   "account_type": "string",
   "user_id": "number",
   "category": "string"
   }

   // Output (200)
   { "message": "Compte mis à jour avec succès" }
   ```

   #### **🔴 DELETE** `/api/accounts/:accountId`
   - **Auth**: `requireAdminAuth`
   ```javascript
   // Output (200)
   { "message": "Compte supprimé avec succès" }
   ```

   ### **💳 Gestion des Crédits**

   #### **🟢 POST** `/api/accounts/credit`
   - **Auth**: `requireAuth`
   ```javascript
   // Input
   {
   "account_id": "number",
   "amount": "number",
   "description": "string",
   "credit_date": "YYYY-MM-DD" // optionnel
   }

   // Output (201)
   {
   "message": "Crédit ajouté avec succès",
   "creditId": "number",
   "newBalance": "number"
   }
   ```

   #### **🔵 GET** `/api/credit-history`
   - **Auth**: `requireAdminAuth`
   ```javascript
   // Query Params
   ?account_id=number&start_date=YYYY-MM-DD&end_date=YYYY-MM-DD

   // Output (200)
   [
   {
      "id": "number",
      "account_id": "number",
      "amount": "number",
      "description": "string",
      "created_at": "datetime",
      "credited_by": "number",
      "creditor_name": "string",
      "account_name": "string"
   }
   ]
   ```

   #### **🟡 PUT** `/api/credit-history/:id`
   - **Auth**: `requireAdminAuth`
   ```javascript
   // Input
   {
   "amount": "number",
   "description": "string"
   }

   // Output (200)
   { "message": "Crédit modifié avec succès" }
   ```

   #### **🔴 DELETE** `/api/credit-history/:id`
   - **Auth**: `requireAdminAuth`
   ```javascript
   // Output (200)
   { "message": "Crédit supprimé avec succès" }
   ```

   ### **💸 Gestion des Dépenses**

   #### **🟢 POST** `/api/expenses`
   - **Auth**: `requireAuth`
   - **Upload**: `multipart/form-data` (justification)
   ```javascript
   // Input (FormData)
   {
   "account_id": "number",
   "expense_type": "string",
   "category": "string",
   "designation": "string",
   "supplier": "string",
   "amount": "number",
   "description": "string",
   "expense_date": "YYYY-MM-DD",
   "justification": "File" // optionnel
   }

   // Output (201)
   {
   "message": "Dépense ajoutée avec succès",
   "expenseId": "number",
   "newBalance": "number"
   }
   ```

   #### **🔵 GET** `/api/expenses`
   - **Auth**: `requireAuth`
   ```javascript
   // Query Params
   ?account_id=number&start_date=YYYY-MM-DD&end_date=YYYY-MM-DD&page=number&limit=number

   // Output (200)
   {
   "expenses": [
      {
         "id": "number",
         "account_id": "number",
         "expense_type": "string",
         "category": "string",
         "designation": "string",
         "supplier": "string",
         "amount": "number",
         "description": "string",
         "expense_date": "YYYY-MM-DD",
         "total": "number",
         "justification_filename": "string",
         "is_selected": "boolean",
         "account_name": "string",
         "user_name": "string"
      }
   ],
   "totalCount": "number",
   "currentPage": "number",
   "totalPages": "number"
   }
   ```

   #### **🔵 GET** `/api/expenses/:id`
   - **Auth**: `requireAuth`
   ```javascript
   // Output (200)
   {
   "id": "number",
   "account_id": "number",
   "expense_type": "string",
   "category": "string",
   "designation": "string",
   "supplier": "string",
   "amount": "number",
   "description": "string",
   "expense_date": "YYYY-MM-DD",
   "total": "number",
   "justification_filename": "string",
   "account_name": "string"
   }
   ```

   #### **🟡 PUT** `/api/expenses/:id`
   - **Auth**: `requireAuth`
   - **Upload**: `multipart/form-data`
   ```javascript
   // Input (FormData)
   {
   "expense_type": "string",
   "category": "string", 
   "designation": "string",
   "supplier": "string",
   "amount": "number",
   "description": "string",
   "expense_date": "YYYY-MM-DD",
   "justification": "File" // optionnel
   }

   // Output (200)
   { "message": "Dépense modifiée avec succès" }
   ```

   #### **🔴 DELETE** `/api/expenses/:id`
   - **Auth**: `requireAuth`
   ```javascript
   // Output (200)
   { "message": "Dépense supprimée avec succès" }
   ```

   #### **🟢 POST** `/api/expenses/:id/toggle-selection`
   - **Auth**: `requireAuth`
   ```javascript
   // Output (200)
   {
   "message": "Sélection mise à jour",
   "is_selected": "boolean"
   }
   ```

   #### **🟢 POST** `/api/expenses/select-all`
   - **Auth**: `requireAuth`
   ```javascript
   // Output (200)
   {
   "message": "Toutes les dépenses sélectionnées",
   "selectedCount": "number"
   }
   ```

   #### **🟢 POST** `/api/expenses/deselect-all`
   - **Auth**: `requireAuth`
   ```javascript
   // Output (200)
   {
   "message": "Toutes les dépenses désélectionnées"
   }
   ```

   ### **📊 Dashboard & Analytics**

   #### **🔵 GET** `/api/dashboard/stats`
   - **Auth**: `requireAuth`
   ```javascript
   // Query Params
   ?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD

   // Output (200)
   {
   "daily_burn": "number",
   "weekly_burn": "number", 
   "monthly_burn": "number",
   "account_breakdown": [
      {
         "name": "string",
         "account_type": "string",
         "spent": "number",
         "total_credited": "number",
         "current_balance": "number",
         "remaining": "number"
      }
   ],
   "total_remaining": "number",
   "period_expenses": "number"
   }
   ```

   #### **🔵 GET** `/api/dashboard/stats-cards`
   - **Auth**: `requireAuth`
   ```javascript
   // Query Params
   ?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD&cutoff_date=YYYY-MM-DD

   // Output (200)
   {
   "total_spent": "number",
   "cash_bictorys": "number",
   "total_creances": "number",
   "stock_mata_total": "number",
   "stock_vivant_total": "number",
   "stock_vivant_variation": "number",
   "partner_deliveries": "number",
   "pl_calculation": {
      "pl_base": "number",
      "pl_final": "number",
      "stock_vivant_variation": "number",
      "partner_deliveries": "number",
      "estimated_charges": "number"
   }
   }
   ```

   #### **🔵 GET** `/api/dashboard/monthly-data`
   - **Auth**: `requireAuth`
   ```javascript
   // Query Params
   ?month=YYYY-MM&cutoff_date=YYYY-MM-DD&start_date=YYYY-MM-DD&end_date=YYYY-MM-DD

   // Output (200)
   {
   "account_breakdown": "Array",
   "monthly_expenses": "number",
   "cash_bictorys": "number", 
   "total_creances": "number",
   "stock_mata": "object",
   "stock_vivant_variation": "number",
   "partner_deliveries": "number"
   }
   ```

   ### **🏪 Gestion Stock**

   #### **🔵 GET** `/api/stock-vivant`
   - **Auth**: `requireStockVivantAuth`
   ```javascript
   // Query Params
   ?date=YYYY-MM-DD

   // Output (200)
   [
   {
      "id": "number",
      "date_stock": "YYYY-MM-DD",
      "categorie": "string",
      "produit": "string", 
      "total": "number",
      "commentaire": "string"
   }
   ]
   ```

   #### **🟢 POST** `/api/stock-vivant/update`
   - **Auth**: `requireStockVivantAuth`
   ```javascript
   // Input
   {
   "date_stock": "YYYY-MM-DD",
   "stock_data": [
      {
         "categorie": "string",
         "produit": "string",
         "total": "number",
         "commentaire": "string"
      }
   ]
   }

   // Output (201)
   { "message": "Stock vivant mis à jour avec succès" }
   ```

   #### **🟢 POST** `/api/stock-vivant/copy-from-date`
   - **Auth**: `requireStockVivantAuth`
   ```javascript
   // Input
   {
   "source_date": "YYYY-MM-DD",
   "target_date": "YYYY-MM-DD"
   }

   // Output (201)
   {
   "message": "Stock copié avec succès",
   "copied_count": "number"
   }
   ```

   ### **🚚 Livraisons Partenaires**

   #### **🔵 GET** `/api/partner/:accountId/deliveries`
   - **Auth**: `requireAuth`
   ```javascript
   // Output (200)
   [
   {
      "id": "number",
      "account_id": "number",
      "amount": "number",
      "delivery_date": "YYYY-MM-DD",
      "description": "string",
      "validation_status": "pending|first_validated|fully_validated|rejected",
      "is_validated": "boolean",
      "created_by": "number",
      "validated_by": "number",
      "creator_name": "string",
      "validator_name": "string"
   }
   ]
   ```

   #### **🟢 POST** `/api/partner/:accountId/deliveries`
   - **Auth**: `requireAuth`
   ```javascript
   // Input
   {
   "amount": "number",
   "delivery_date": "YYYY-MM-DD",
   "description": "string"
   }

   // Output (201)
   {
   "message": "Livraison ajoutée avec succès",
   "deliveryId": "number"
   }
   ```

   #### **🟢 POST** `/api/partner/deliveries/:deliveryId/final-validate`
   - **Auth**: `requireAuth`
   ```javascript
   // Output (200)
   {
   "message": "Livraison validée définitivement",
   "newBalance": "number"
   }
   ```

   ### **💳 Gestion Créances**

   #### **🔵 GET** `/api/creance/:accountId/clients`
   - **Auth**: `requireAuth`
   ```javascript
   // Output (200)
   [
   {
      "id": "number",
      "account_id": "number",
      "client_name": "string",
      "client_phone": "string",
      "client_address": "string",
      "initial_credit": "number",
      "current_balance": "number",
      "total_operations": "number"
   }
   ]
   ```

   #### **🟢 POST** `/api/creance/:accountId/clients`
   - **Auth**: `requireAdminAuth`
   ```javascript
   // Input
   {
   "client_name": "string",
   "client_phone": "string",
   "client_address": "string",
   "initial_credit": "number"
   }

   // Output (201)
   {
   "message": "Client créé avec succès",
   "clientId": "number"
   }
   ```

   #### **🔵 GET** `/api/creance/:accountId/operations`
   - **Auth**: `requireAuth`
   ```javascript
   // Query Params
   ?client_id=number&start_date=YYYY-MM-DD&end_date=YYYY-MM-DD

   // Output (200)
   [
   {
      "id": "number",
      "account_id": "number",
      "client_id": "number",
      "operation_type": "credit|debit",
      "amount": "number",
      "description": "string",
      "operation_date": "YYYY-MM-DD",
      "client_name": "string",
      "creator_name": "string"
   }
   ]
   ```

   #### **🟢 POST** `/api/creance/:accountId/operations`
   - **Auth**: `requireAuth`
   ```javascript
   // Input
   {
   "client_id": "number",
   "operation_type": "credit|debit",
   "amount": "number",
   "description": "string",
   "operation_date": "YYYY-MM-DD"
   }

   // Output (201)
   {
   "message": "Opération créée avec succès",
   "operationId": "number"
   }
   ```

   ### **💰 Cash Bictorys**

   #### **🔵 GET** `/api/cash-bictorys/:monthYear`
   - **Auth**: `requireCashBictorysAuth`
   ```javascript
   // Path Params: monthYear (YYYY-MM)
   // Query Params: ?cutoff_date=YYYY-MM-DD

   // Output (200)
   [
   {
      "id": "number",
      "month_year": "YYYY-MM",
      "date": "YYYY-MM-DD",
      "amount": "number",
      "description": "string"
   }
   ]
   ```

   #### **🟡 PUT** `/api/cash-bictorys/:monthYear`
   - **Auth**: `requireCashBictorysAuth`
   ```javascript
   // Input
   {
   "date": "YYYY-MM-DD",
   "amount": "number",
   "description": "string"
   }

   // Output (200)
   { "message": "Cash Bictorys mis à jour avec succès" }
   ```

   ### **🔧 Administration**

   #### **🔵 GET** `/api/admin/users`
   - **Auth**: `requireAdminAuth`
   ```javascript
   // Output (200)
   [
   {
      "id": "number",
      "username": "string",
      "full_name": "string",
      "role": "string",
      "is_active": "boolean",
      "created_at": "datetime"
   }
   ]
   ```

   #### **🟢 POST** `/api/admin/users`
   - **Auth**: `requireAdminAuth`
   ```javascript
   // Input
   {
   "username": "string",
   "password": "string",
   "full_name": "string",
   "role": "directeur|directeur_general|pca|admin"
   }

   // Output (201)
   {
   "message": "Utilisateur créé avec succès",
   "userId": "number"
   }
   ```

   #### **🟢 POST** `/api/admin/force-sync-all-accounts`
   - **Auth**: `requireSuperAdminOnly`
   ```javascript
   // Output (200)
   {
   "message": "Synchronisation effectuée",
   "total_corrected": "number",
   "accounts_synced": "Array"
   }
   ```

   #### **🟢 POST** `/api/admin/force-sync-account/:accountId`
   - **Auth**: `requireSuperAdminOnly`
   ```javascript
   // Output (200)
   {
   "message": "Compte synchronisé",
   "account_name": "string",
   "old_balance": "number", 
   "new_balance": "number"
   }
   ```

   #### **🔵 GET** `/api/validation-status`
   - **Auth**: `requireAuth`
   ```javascript
   // Output (200)
   {
   "validate_expense_balance": "boolean"
   }
   ```

   #### **🟡 PUT** `/api/admin/config/financial`
   - **Auth**: `requireAdminAuth`
   ```javascript
   // Input
   {
   "validate_expense_balance": "boolean"
   }

   // Output (200)
   { "message": "Configuration mise à jour avec succès" }
   ```

   ### **📈 Audit & Visualisation**

   #### **🔵 GET** `/api/audit/account-flux/:accountId`
   - **Auth**: `requireAuth`
   ```javascript
   // Query Params
   ?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD

   // Output (200)
   {
   "account_info": {
      "id": "number",
      "account_name": "string",
      "account_type": "string",
      "current_balance": "number"
   },
   "transactions": [
      {
         "date": "YYYY-MM-DD",
         "type": "credit|expense|transfer_in|transfer_out",
         "amount": "number",
         "description": "string",
         "balance_after": "number"
      }
   ],
   "summary": {
      "total_credits": "number",
      "total_expenses": "number",
      "net_flow": "number"
   }
   }
   ```

   #### **🔵 GET** `/api/visualisation/pl-data`
   - **Auth**: `requireAdminAuth`
   ```javascript
   // Query Params
   ?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD

   // Output (200)
   {
   "period_data": [
      {
         "date": "YYYY-MM-DD",
         "pl_base": "number",
         "pl_final": "number",
         "cash_bictorys": "number",
         "expenses": "number",
         "stock_variation": "number"
      }
   ]
   }
   ```

   ### **🔄 Transferts & Opérations**

   #### **🟢 POST** `/api/transfert`
   - **Auth**: `requireSuperAdmin`
   ```javascript
   // Input
   {
   "source_id": "number",
   "destination_id": "number", 
   "montant": "number",
   "description": "string"
   }

   // Output (201)
   {
   "message": "Transfert effectué avec succès",
   "transferId": "number"
   }
   ```

   #### **🔵 GET** `/api/transfers`
   - **Auth**: `requireAuth`
   ```javascript
   // Query Params
   ?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD&account_id=number

   // Output (200)
   [
   {
      "id": "number",
      "source_id": "number",
      "destination_id": "number",
      "montant": "number",
      "description": "string",
      "created_at": "datetime",
      "source_name": "string",
      "destination_name": "string",
      "created_by_name": "string"
   }
   ]
   ```

   #### **🔴 DELETE** `/api/transfers/:transferId`
   - **Auth**: `requireSuperAdmin`
   ```javascript
   // Output (200)
   { "message": "Transfert supprimé avec succès" }
   ```

   ### **📄 Factures & Documents**

   #### **🟢 POST** `/api/expenses/generate-invoices-pdf`
   - **Auth**: `requireAuth`
   ```javascript
   // Input
   {
   "start_date": "YYYY-MM-DD",
   "end_date": "YYYY-MM-DD",
   "expense_ids": ["number"] // optionnel
   }

   // Output (200)
   {
   "message": "Factures générées avec succès",
   "filename": "string",
   "total_expenses": "number",
   "expenses_with_justifications": "number",
   "expenses_without_justifications": "number"
   }
   ```

   #### **🔵 GET** `/api/expenses/:id/justification`
   - **Auth**: `requireAuth`
   ```javascript
   // Output (200) - Binary File
   // Headers: Content-Type: image/jpeg|image/png|application/pdf
   // ou
   // Output (404)
   { "error": "Justificatif non trouvé" }
   ```

   ### **📊 Catégories & Configuration**

   #### **🔵 GET** `/api/categories`
   - **Auth**: `requireAuth`
   ```javascript
   // Output (200)
   {
   "categories": {
      "expense_types": [
         {
         "id": "number",
         "name": "string",
         "description": "string"
         }
      ],
      "categories_by_type": {
         "type_id": [
         {
            "id": "number", 
            "name": "string",
            "type_id": "number"
         }
         ]
      }
   }
   }
   ```

   #### **🔵 GET** `/api/categories-config`
   - **Auth**: Aucune
   ```javascript
   // Output (200)
   {
   "expense_types": ["Array"],
   "categories": {
      "type_name": ["Array"]
   },
   "suppliers": ["Array"]
   }
   ```

   #### **🟡 PUT** `/api/admin/config/categories`
   - **Auth**: `requireAdminAuth`
   ```javascript
   // Input
   {
   "expense_types": ["Array"],
   "categories": "Object",
   "suppliers": ["Array"]
   }

   // Output (200)
   { "message": "Configuration des catégories mise à jour" }
   ```

   ### **📈 APIs Snapshot & Backup**

   #### **🟢 POST** `/api/dashboard/save-snapshot`
   - **Auth**: `requireAdminAuth`
   ```javascript
   // Input
   {
   "snapshot_date": "YYYY-MM-DD",
   "description": "string"
   }

   // Output (201)
   {
   "message": "Snapshot sauvegardé avec succès",
   "snapshot_id": "number"
   }
   ```

   #### **🔵 GET** `/api/dashboard/snapshots/:date`
   - **Auth**: `requireAdminAuth`
   ```javascript
   // Output (200)
   {
   "snapshot_date": "YYYY-MM-DD",
   "description": "string",
   "data": {
      "accounts": "Array",
      "total_balance": "number",
      "expenses_summary": "Object",
      "credits_summary": "Object"
   }
   }
   ```

   ### **🏦 Stock Mata & Montants Début Mois**

   #### **🔵 GET** `/api/stock-mata`
   - **Auth**: `requireAdminAuth`
   ```javascript
   // Query Params
   ?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD

   // Output (200)
   [
   {
      "id": "number",
      "date": "YYYY-MM-DD",
      "montant": "number",
      "description": "string",
      "created_at": "datetime"
   }
   ]
   ```

   #### **🟢 POST** `/api/stock-mata`
   - **Auth**: `requireAdminAuth`
   ```javascript
   // Input
   {
   "date": "YYYY-MM-DD",
   "montant": "number",
   "description": "string"
   }

   // Output (201)
   {
   "message": "Stock Mata ajouté avec succès",
   "stockId": "number"
   }
   ```

   #### **🔵 GET** `/api/montant-debut-mois/:year/:month`
   - **Auth**: `requireAdminAuth`
   ```javascript
   // Path Params: year (YYYY), month (MM)

   // Output (200)
   [
   {
      "id": "number",
      "account_id": "number",
      "year": "number",
      "month": "number",
      "montant": "number",
      "account_name": "string"
   }
   ]
   ```

   #### **🟢 POST** `/api/montant-debut-mois`
   - **Auth**: `requireAdminAuth`
   ```javascript
   // Input
   {
   "account_id": "number",
   "year": "number",
   "month": "number",
   "montant": "number"
   }

   // Output (201)
   {
   "message": "Montant début mois défini avec succès",
   "montantId": "number"
   }
   ```

   ### **🔧 Consistency & Repair**

   #### **🔵 GET** `/api/audit/consistency/detect`
   - **Auth**: `requireSuperAdminOnly`
   ```javascript
   // Output (200)
   {
   "inconsistent_accounts": [
      {
         "account_id": "number",
         "account_name": "string",
         "current_balance": "number",
         "calculated_balance": "number",
         "difference": "number"
      }
   ],
   "total_inconsistencies": "number"
   }
   ```

   #### **🟢 POST** `/api/audit/consistency/fix-all`
   - **Auth**: `requireSuperAdminOnly`
   ```javascript
   // Output (200)
   {
   "message": "Correction effectuée",
   "fixed_accounts": "number",
   "total_corrections": "number"
   }
   ```

   #### **🟢 POST** `/api/audit/consistency/fix-account/:accountId`
   - **Auth**: `requireSuperAdminOnly`
   ```javascript
   // Output (200)
   {
   "message": "Compte corrigé",
   "account_name": "string",
   "old_balance": "number",
   "new_balance": "number",
   "correction_amount": "number"
   }
   ```

   ### **📊 Résumé des APIs par Catégorie**

   | **Catégorie** | **APIs** | **Principales Fonctions** |
   |---------------|----------|---------------------------|
   | **🔐 Auth** | 3 APIs | Connexion, déconnexion, session |
   | **💰 Comptes** | 8 APIs | CRUD comptes, soldes, permissions |
   | **💳 Crédits** | 4 APIs | Ajout, historique, modification, suppression |
   | **💸 Dépenses** | 11 APIs | CRUD dépenses, sélection, justificatifs |
   | **📊 Dashboard** | 9 APIs | Stats, analytics, données mensuelles |
   | **🏪 Stock** | 7 APIs | Stock vivant, Stock Mata, variations |
   | **🚚 Livraisons** | 6 APIs | Partenaires, validation, statuts |
   | **💳 Créances** | 6 APIs | Clients, opérations, avances/remboursements |
   | **💰 Cash Bictorys** | 4 APIs | Gestion mensuelle, uploads, totaux |
   | **🔧 Admin** | 15 APIs | Utilisateurs, config, synchronisation |
   | **📈 Audit** | 4 APIs | Flux comptes, visualisation, cohérence |
   | **🔄 Transferts** | 3 APIs | Créer, lister, supprimer transferts |
   | **📄 Documents** | 3 APIs | Factures PDF, justificatifs, config |

   ### **⚡ Codes de Statut HTTP Utilisés**

   - **200 OK** : Succès pour GET, PUT, DELETE
   - **201 Created** : Succès pour POST (création)
   - **400 Bad Request** : Données invalides
   - **401 Unauthorized** : Non authentifié
   - **403 Forbidden** : Permissions insuffisantes  
   - **404 Not Found** : Ressource introuvable
   - **500 Internal Server Error** : Erreur serveur

   ---

   ## 🔄 **Triggers PostgreSQL & Automatisations**

   ### **⚡ Synchronisation automatique Balance → SOLDE BICTORYS AFFICHE**

   #### **📋 Vue d'ensemble**
   
   Système de synchronisation automatique qui copie la dernière valeur de la colonne `balance` de la table `cash_bictorys` vers le compte **"SOLDE BICTORYS AFFICHE"** en temps réel.

   #### **🎯 Objectif**

   **Avant** : Mise à jour manuelle quotidienne du solde  
   **Après** : Synchronisation automatique dès qu'une nouvelle valeur arrive via l'API externe

   #### **🔧 Implémentation technique**

   ```sql
   -- Trigger PostgreSQL
   Nom: trigger_sync_balance_to_solde_bictorys
   Fonction: sync_balance_to_solde_bictorys_affiche()
   Déclenchement: AFTER INSERT OR UPDATE ON cash_bictorys
   Fichier: create_sync_balance_trigger.sql
   ```

   #### **📊 Flux de données**

   ```
   Workflow externe (Make.com, n8n)
            ↓
   POST API → /api/cash-bictorys
            ↓
   Table cash_bictorys (balance mis à jour)
            ↓
   Trigger PostgreSQL (automatique)
            ↓
   Compte SOLDE BICTORYS AFFICHE (current_balance synchronisé)
   ```

   #### **✅ Règles de gestion**

   - **Date valide** : Seules les dates ≤ date du jour sont prises en compte
   - **Lignes valides** : Une ligne est ignorée seulement si `amount = 0 ET balance = 0`
   - **Balance zéro légitime** : Une `balance = 0` avec `amount > 0` est VALIDE (vraie valeur)
   - **Dernière valeur** : En cas de plusieurs lignes même date, la plus récemment modifiée (`updated_at DESC`)
   - **Sécurité** : Si le compte n'existe pas, log NOTICE uniquement (pas d'erreur)
   - **Traçabilité** : Logs PostgreSQL pour chaque synchronisation

   #### **🧪 Vérification manuelle**

   ```sql
   -- Vérifier l'état actuel
   SELECT date, balance, amount, fees
   FROM cash_bictorys
   WHERE date <= CURRENT_DATE
   ORDER BY date DESC
   LIMIT 5;

   SELECT account_name, current_balance, updated_at
   FROM accounts
   WHERE account_name = 'SOLDE BICTORYS AFFICHE';

   -- Tester le trigger
   UPDATE cash_bictorys
   SET updated_at = CURRENT_TIMESTAMP
   WHERE date = (SELECT MAX(date) FROM cash_bictorys WHERE date <= CURRENT_DATE);
   ```

   #### **🛠️ Maintenance**

   ```sql
   -- Désactiver temporairement
   DROP TRIGGER IF EXISTS trigger_sync_balance_to_solde_bictorys ON cash_bictorys;

   -- Voir l'état du trigger
   SELECT trigger_name, event_manipulation, action_timing
   FROM information_schema.triggers
   WHERE event_object_table = 'cash_bictorys';
   ```

   #### **📈 Avantages**

   - ✅ **Zéro intervention manuelle** : Plus besoin de mise à jour quotidienne
   - ✅ **Temps réel** : Synchronisation immédiate après chaque POST API
   - ✅ **Fiable** : Logique au niveau base de données (indépendant du serveur Node.js)
   - ✅ **Traçable** : Logs PostgreSQL pour chaque synchronisation
   - ✅ **Sécurisé** : Protection automatique contre les dates futures

   #### **🚨 Points d'attention**

   1. **Nom du compte** : Doit s'appeler exactement `"SOLDE BICTORYS AFFICHE"` (sensible à la casse)
   2. **Type de compte** : Doit être de type `'statut'`
   3. **Compte actif** : Le compte doit avoir `is_active = true`
   4. **Dates futures** : Les dates > CURRENT_DATE sont automatiquement ignorées

   #### **📝 Test de validation**

   ```javascript
   // Test initial réussi
   ✅ Dernière balance cash_bictorys:  1,000,000 FCFA (date: 2025-10-03)
   ✅ Solde SOLDE BICTORYS AFFICHE:    1,000,000 FCFA
   ✅ LES VALEURS CORRESPONDENT - Trigger fonctionnel !
   
   // Logique appliquée
   ✓ Ignore seulement si amount = 0 ET balance = 0
   ✓ Une balance = 0 avec amount > 0 est VALIDE
   ✓ Prend la dernière ligne où (amount > 0 OU balance > 0)
   ```

   #### **🔗 Fichiers associés**

   - `create_sync_balance_trigger.sql` - Script d'installation du trigger
   - `GUIDE_SYNC_BALANCE_SOLDE_COURANT.md` - Documentation complète

   #### **📅 Historique**

   - **Date de création** : 05/10/2025
   - **Version** : 1.2
   - **Statut** : ✅ Actif en production
   - **Compte cible** : SOLDE BICTORYS AFFICHE (modifié le 05/10/2025)
   - **Modifications** :
     - v1.1 : Changement cible vers SOLDE BICTORYS AFFICHE
     - v1.2 : Correction API PUT + logique trigger (ignore si amount ET balance = 0)
   - **Test validation** : ✅ Réussi (1,000,000 FCFA synchronisé - 2025-10-03)

   **Note** : Ce système est actif en production et fonctionne automatiquement sans intervention manuelle.

   ---

   ## 🚀 **Exécution des Tests**

   ### **📝 Commandes NPM**
   ```bash
   # Tests de régression complets (26 tests)
   npm run test:regression

   # Script pré-production (nouveau)
   npm run start_preprod

   # Tests de base + régression
   npm run test:all

   # Tests de base uniquement  
   npm run test
   ```

   ### **🖥️ Exécution Locale (Windows)**
   ```powershell
   # Script PowerShell complet
   .\start_preprod.bat

   # Script copie base de données
   .\copy_preprod_to_test.ps1

   # Avec Mocha directement
   npx mocha test_regression_new.js --timeout 15000
   ```

   ### **⚙️ Configuration Base de Données**
   ```javascript
   // Variables d'environnement (base de test isolée)
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=mata_expenses_test_db      // Base de test copiée depuis préprod
   DB_USER=zalint
   DB_PASSWORD=bonea2024
   NODE_ENV=test
   ```

   ---

   ## 🔄 **Automatisation CI/CD**

   ### **📦 GitHub Actions**
   ```yaml
   Déclencheurs:
   - Push vers main/master/develop
   - Pull requests

   Étapes:
   1. Setup Node.js 18.x
   2. Installation dépendances
   3. Setup PostgreSQL service
   4. Initialisation base de test complète
   5. Exécution tests de base
   6. Exécution tests de régression (26 tests)
   7. Rapport de couverture
   ```

   ### **🪝 Git Hooks (Pré-Push)**
   ```bash
   # Installation automatique
   chmod +x .git/hooks/pre-push

   # Validation locale avant push
   git push → Tests automatiques → Blocage si échec
   ```

   ---

   ## 📊 **Métriques et Rapports**

   ### **✅ Résultats de Test Actuels**
   ```
   🎉 RÉSUMÉ DES TESTS DE NON-RÉGRESSION
   =========================================
   ✅ Test 1: Ajout dépense 1000 FCFA - PASSÉ
   ✅ Test 2: Suppression dépense 1000 FCFA - PASSÉ
   ✅ Test 3: Ajout créance 500 FCFA - PASSÉ
   ✅ Test 4: Suppression créance 500 FCFA - PASSÉ
   ✅ Test 5: Ajout transfert 750 FCFA - PASSÉ
   ✅ Test 6: Suppression transfert 750 FCFA - PASSÉ
   ✅ Test 7: Compte STATUT (dernière transaction) - PASSÉ
   ✅ Test 8: Compte PARTENAIRE (solde restant) - PASSÉ
   ✅ Test 9: Compte CRÉANCE (solde restant) - PASSÉ
   ✅ Test 10: Calcul PL (écart stock + charges) - PASSÉ
   ✅ Test 11: Calcul CASH DISPONIBLE - PASSÉ
   ✅ Test 12: Livraisons PARTENAIRES (ajout/validation/rejet) - PASSÉ
   ✅ Test 13: Gestion CRÉANCES (clients/avances/remboursements) - PASSÉ
   ✅ Test 14: Gestion STOCK VIVANT (copie/modification) - PASSÉ
   ✅ Test 15: Gestion CASH BICTORYS (valeur récente) - PASSÉ
   ✅ Test 16: Génération FACTURES (avec/sans justificatifs) - PASSÉ
   ✅ Test 17: Validation BUDGET (suffisant/insuffisant/mode libre) - PASSÉ
   ✅ Test 18: Cut-off DATE (analyse historique/filtrage chronologique) - PASSÉ
   ✅ Cohérence Solde actuel = Solde Net - VALIDÉE
   ✅ Cohérence Audit Flux = Solde Net - VALIDÉE
   =========================================
   📊 Solde final BOVIN: 6,000 FCFA
   ⏱️ Temps d'exécution: ~940ms
   ```

   ### **📈 Exemple de Validation avec Synchronisation Production**
   ```
   🔄 AUTO-SYNC: Synchronisation automatique des comptes après modification de crédit...
   ⚠️ AUTO-SYNC: Fonction PROD appelée, retour vide (probablement succès)
   🎯 Synchronisation compte 181
   ⚠️ Fonction PROD retour vide, utilisation fallback pour BOVIN_TEST_REG
   ✅ BOVIN_TEST_REG synchronisé (fallback): 4,000 FCFA

   📊 Après ajout dépense 1000 FCFA
      Solde actuel: 4000 FCFA
      Solde net calculé: 4000 FCFA
      Somme audit flux: 4000 FCFA
      ✅ Cohérence vérifiée: Solde actuel = Solde Net = Audit Flux
   ```

   ---

   ## 🔧 **Corrections et Améliorations Récentes**

   ### **🔄 Migration Base de Données**
   - ✅ **Copie base préprod → test** : Script PowerShell automatisé
   - ✅ **Schéma identique** : Triggers et contraintes fonctionnels
   - ✅ **Isolation complète** : Tests sûrs sans impact production

   ### **⚖️ Synchronisation des Soldes (Production)**
   - ✅ **Mécanisme identique PRODUCTION** : Fonctions PostgreSQL copiées exactement
   - ✅ **`forceSyncAllAccountsAfterCreditOperation()`** : Auto-sync après crédits
   - ✅ **`syncAccountBalance()`** : Sync individuelle avec fallback intelligent
   - ✅ **Appels automatiques** : Déclenchement conditionnel sur comptes `classique`
   - ✅ **Tests 100% fiables** : Comportement authentique de production

   ### **📊 Corrections Schéma Stock**
   - ✅ **Colonnes `stock_vivant`** : `date_stock`, `total`, `commentaire`
   - ✅ **Contraintes uniques** : Gestion des doublons
   - ✅ **Tests Stock Vivant** : Fonctionnels complets

   ### **🏷️ Types de Comptes**
   - ✅ **Contraintes CHECK** : Types valides (`classique`, `statut`, `depot`, etc.)
   - ✅ **Tests adaptés** : Respect des contraintes base

   ---

   ## 🔧 **Maintenance et Évolution**

   ### **🏭 Synchronisation avec la Production**

   #### **📝 Procédure de Mise à Jour :**
   1. **Modification en Production** : Changement dans `server.js`
   2. **Copie dans Tests** : Copier la fonction modifiée dans `test_regression_new.js`
   3. **Commentaire** : Indiquer la source (ex: `// COPIE EXACTE DE server.js lignes X-Y`)
   4. **Test** : Exécuter `npm run test:regression` pour validation

   #### **🎯 Fonctions à Surveiller :**
   - `forceSyncAllAccountsAfterCreditOperation()` (lignes 68-92)
   - `syncAccountBalance()` / routes `/api/admin/force-sync-account` (lignes 12295-12328)
   - `syncAllAccounts()` / routes `/api/admin/force-sync-all-accounts` (lignes 12269-12292)

   #### **⚠️ Points d'Attention :**
   - **Format de retour** : Les fonctions PostgreSQL peuvent évoluer
   - **Conditions de déclenchement** : Types de comptes concernés par la sync
   - **Messages de logging** : Garder la cohérence avec la production

   ### **🔄 Mise à Jour Fonctions PostgreSQL**

   #### **📅 Extraction depuis Production :**
   ```bash
   # Connexion à la base de production
   postgresql://depenses_management_user:xxx@render.com/depenses_management
   
   # Extraction automatique des fonctions
   node extract_prod_functions.js
   
   # Mise à jour github_test_database_setup.sql
   ```

   #### **🛠️ Commandes de Synchronisation :**
   ```powershell
   # Test avec fonctions production pures
   npm run test:regression
   
   # Push vers GitHub Actions
   git push
   ```

   ---

   ## 🚨 **Gestion des Erreurs Résolues**

   ### **💡 Problèmes Résolus**

   #### **✅ Incohérence de Solde (Résolu)**
   ```
   ❌ AVANT: Solde actuel (5000) ≠ Solde net (4500)
   ✅ MAINTENANT: Synchronisation automatique → Cohérence garantie
   ```

   #### **✅ Problème Schéma (Résolu)**
   ```
   ❌ AVANT: column "date_observation" does not exist
   ✅ MAINTENANT: Base copiée → Schéma identique préprod
   ```

   #### **✅ Contraintes Violées (Résolu)**
   ```
   ❌ AVANT: violates check constraint "accounts_account_type_check"
   ✅ MAINTENANT: Types adaptés aux contraintes réelles
   ```

   #### **✅ Test 9 Créance - Logique Métier Corrigée (Résolu)** 🆕
   ```
   ❌ AVANT: Logique erronée avec crédits directs + transferts
   ✅ MAINTENANT: Logique authentique clients + opérations créance
   ```

   #### **✅ GitHub Actions - Colonnes Manquantes (Résolu)** 🔥
   ```
   ❌ AVANT: Jeu du chat et souris avec colonnes manquantes
   - unit_price missing → Fix → validation_status missing → Fix → ...
   ✅ MAINTENANT: Schéma COMPLET extrait de production
   - TOUS les 22 colonnes de partner_deliveries
   - FINI les surprises "column does not exist"
   - Schéma GitHub Actions = Schéma PRODUCTION (100%)
   ```

   ### **🔧 Solutions Implémentées**
   1. **Fonctions PROD extractées** : `github_test_database_setup.sql` avec fonctions réelles
   2. **Mode production pur** : ZÉRO fallback, code strictement identique à production
   3. **Tables PROD complètes** : `partner_delivery_summary`, `montant_debut_mois`
   4. **Synchronisation automatique ÉTENDUE** : TOUTES opérations sur comptes classiques 🆕
   5. **Fonction helper générique** : `triggerAutoSyncIfNeeded()` pour vérification type compte 🆕
   6. **Logique métier créance** : Test 9 avec clients et opérations authentiques
   7. **Corrections schéma** : Colonnes et contraintes adaptées (`client_name`, `initial_credit`)
   8. **GitHub Actions** : Base PostgreSQL identique à production
   9. **Schéma COMPLET extracté** : Table `partner_deliveries` avec ALL 22 colonnes
   10. **Schema prefix** : `public.` obligatoire pour fonctions PostgreSQL GitHub Actions
   11. **Colonnes manquantes** : `unit_price`, `validation_status`, `article_count` AJOUTÉES
   12. **Sync dépenses/transferts** : Automatisation complète de toutes les opérations financières 🆕

   ---

   ## 📚 **Bonnes Pratiques Mises à Jour**

   ### **✅ Dos**
   - **Fonctions PROD exactes** : Extraire directement depuis production PostgreSQL
   - **Mode production pur** : AUCUN fallback, code strictement identique
   - **GitHub Actions** : Base avec fonctions PostgreSQL identiques à production
   - **Schema COMPLET** : Extraire TOUT le schéma depuis production, pas à pièces
   - **Schema prefix** : Utiliser `public.` pour toutes fonctions PostgreSQL GitHub Actions
   - **Synchronisation automatique** : Laisser les fonctions PostgreSQL s'exécuter
   - **Nettoyage** : Tests indépendants et nettoyage automatique
   - **CI/CD** : Tests automatiques à chaque push avec hooks Git

   ### **❌ Don'ts**
   - **Fallbacks** : INTERDIT - si ça marche pas en test, ça marche pas en prod
   - **Colonnes manquantes** : JAMAIS deviner les colonnes, extraire le schéma complet
   - **Logique spécifique tests** : Code doit être strictement identique à production
   - **Sync manuelle** : Éviter les updates manuels de `current_balance`
   - **Fonctions modifiées** : Ne jamais adapter les fonctions PostgreSQL
   - **Tests dépendants** : Chaque test doit être indépendant
   - **Schema différent** : GitHub Actions doit avoir exactement le même schéma que production

   ---

   ## 🎯 **Conclusion**

   ### **🏆 Système de Tests Production Pure**
   - ✅ **26 tests** couvrant toutes les fonctionnalités
   - ✅ **100% de réussite** avec exécution en **3s** (temps réel)
   - ✅ **Fonctions PostgreSQL** extraites directement de production
   - ✅ **ZÉRO fallback** - code strictement identique à production
   - ✅ **GitHub Actions** avec base PostgreSQL identique
   - ✅ **Schéma COMPLET** - tous les 22 colonnes de partner_deliveries
   - ✅ **Schema prefix public.** - fonctions PostgreSQL GitHub Actions
   - ✅ **Mode production pur** - fiabilité maximale
   - ✅ **CI/CD intégré** avec hooks Git

   ### **🚀 Fonctionnalités Testées**
   - **Comptes** : Classique, Statut, Partenaire, Créance
   - **Opérations** : Dépenses, Crédits, Transferts
   - **Calculs** : PL, Cash Disponible, Stock Vivant
   - **Avancé** : Factures, Validation Budget, Cash Bictorys
   - **Cohérence** : Soldes, Audit Flux, Transactions
   - **Synchronisation** : Mécanisme production 100% fidèle
   - **Triggers PostgreSQL** : Sync automatique Balance → SOLDE BICTORYS AFFICHE

   **🎊 Le système garantit une fiabilité ABSOLUE avec les vraies fonctions PostgreSQL de production - ZÉRO différence !**

   **🔥 PLUS JAMAIS de "column does not exist" - Schéma GitHub Actions = PRODUCTION à 100% !**

   **🚀 SYNCHRONISATION AUTOMATIQUE TOTALE - Dépenses & Transferts inclus dans la synchronisation automatique !**

   **⚡ TRIGGER POSTGRESQL ACTIF - Synchronisation automatique Balance (cash_bictorys) → SOLDE BICTORYS AFFICHE en temps réel !**

   ---

   *Dernière mise à jour : 05 octobre 2025*  
   *Version : 3.3.1 - Trigger Synchronisation Balance → SOLDE BICTORYS AFFICHE (API PUT + logique corrigée)*  
   *Auteur : Système de Gestion des Dépenses MATA*