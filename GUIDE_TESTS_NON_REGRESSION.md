# 🧪 Guide des Tests de Non-Régression
*Système de validation automatisée des calculs de solde*

---

## 📋 **Vue d'ensemble**

Ce système de tests garantit l'intégrité des calculs de solde pour tous les types de comptes du système de gestion des dépenses. Il vérifie automatiquement que :

- **Solde actuel = Solde net calculé**
- **Somme des transactions (audit flux) = Solde net**
- **Logique métier** respectée pour chaque type de compte

---

## 🎯 **Objectifs des Tests**

### **Prévention des Régressions**
- Détection automatique des erreurs de calcul
- Validation après chaque modification du code
- Protection contre les bugs lors des mises à jour

### **Validation Métier**
- Cohérence des soldes en temps réel
- Respect des règles comptables
- Fiabilité des données financières

---

## 🧪 **Tests Implémentés**

### **🐄 Tests Compte CLASSIQUE (BOVIN)**

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

### **📊 Tests par Type de Compte**

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

#### **Test 9 : Compte CRÉANCE**
```javascript
💳 Compte : COMPTE_CREANCE_TEST_REG (temporaire)
📝 Logique : Solde = Total crédité - Total dépensé + Transferts net
💰 Valeur testée : 1,500,000 FCFA (2M - 500K)
```

### **Test 10 : Vérification Finale**
- Synthèse complète de tous les tests
- Rapport de cohérence globale
- Validation de l'état final du système

---

## 🏗️ **Architecture du Système**

### **📁 Fichiers Principaux**
```
test_regression.js          # Tests de non-régression
package.json               # Scripts npm configurés
.github/workflows/         # Automatisation CI/CD
run_regression_tests.ps1   # Script PowerShell local
install_git_hooks.ps1      # Installation hooks Git
```

### **🔧 Fonctions Utilitaires**

#### **`createTestUser(userData)`**
- Création d'utilisateurs de test sécurisés
- Hash des mots de passe avec bcrypt
- Rôles : `directeur_general`, `directeur`

#### **`cleanupTestData()`**
- Suppression automatique des données de test
- Nettoyage en cascade (transactions → comptes → utilisateurs)
- Protection contre la pollution de la base

#### **`calculateNetBalance(accountId)`**
- Calcul du solde net selon la logique classique
- Formule : `Crédits - Dépenses + Transferts net`
- Gestion des transferts entrants/sortants

#### **`calculateAuditFluxSum(accountName)`**
- Calcul de la somme des transactions pour audit
- Agrégation : `Crédits - Dépenses - Transferts sortants + Transferts entrants`
- Validation de la cohérence des flux

#### **`checkBalanceConsistency(accountId, description)`**
- Vérification complète de cohérence
- Assertions automatiques avec messages d'erreur
- Logging détaillé des résultats

---

## 🚀 **Exécution des Tests**

### **📝 Commandes NPM**
```bash
# Tests de régression uniquement
npm run test:regression

# Tests de base + régression
npm run test:all

# Tests de base uniquement  
npm run test
```

### **🖥️ Exécution Locale (Windows)**
```powershell
# Script PowerShell complet
.\run_regression_tests.ps1

# Avec Mocha directement
npx mocha test_regression.js --timeout 15000
```

### **⚙️ Configuration Base de Données**
```javascript
// Variables d'environnement
DB_HOST=localhost
DB_PORT=5432
DB_NAME=mata_expenses_test_db
DB_USER=zalint
DB_PASSWORD=bonea2024
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
  3. Setup PostgreSQL
  4. Initialisation base de test
  5. Exécution tests de base
  6. Exécution tests de régression
  7. Rapport de couverture
```

### **🪝 Git Hooks (Pré-Push)**
```bash
# Installation automatique
.\install_git_hooks.ps1

# Validation locale avant push
git push → Tests automatiques
```

---

## 📊 **Métriques et Rapports**

### **✅ Résultats de Test**
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
✅ Cohérence Solde actuel = Solde Net - VALIDÉE
✅ Cohérence Audit Flux = Solde Net - VALIDÉE
=========================================
```

### **📈 Exemple de Validation**
```
📊 Après ajout dépense 1000 FCFA
   Solde actuel: 4000 FCFA
   Solde net calculé: 4000 FCFA
   Somme audit flux: 4000 FCFA
   ✅ Cohérence vérifiée: Solde actuel = Solde Net = Audit Flux
```

---

## 🔧 **Maintenance et Évolution**

### **➕ Ajouter de Nouveaux Tests**
```javascript
describe('🧪 Nouveau Test', () => {
    it('Devrait valider [objectif]', async () => {
        const accountId = accounts['COMPTE_TEST'];
        
        // 1. Préparer les données
        // 2. Exécuter l'opération
        // 3. Vérifier la cohérence
        await checkBalanceConsistency(accountId, 'Description test');
    });
});
```

### **🔄 Mise à Jour des Données de Test**
```javascript
// Modifier les comptes par défaut dans before()
const testAccounts = [
    { name: 'NOUVEAU_COMPTE_TEST', type: 'nouveau_type' },
    // ...
];
```

### **⚡ Optimisation des Performances**
- Tests en parallèle si indépendants
- Utilisation de transactions pour rollback rapide
- Cache des connexions base de données

---

## 🚨 **Gestion des Erreurs**

### **💡 Erreurs Communes**

#### **Incohérence de Solde**
```
❌ Incohérence! Solde actuel (5000) ≠ Solde net (4500)
```
**Solutions :**
- Vérifier les calculs de mise à jour des soldes
- Contrôler les triggers de base de données
- Valider les formules de calcul

#### **Problème de Connexion BD**
```
⚠️ Erreur lors du nettoyage: connection timeout
```
**Solutions :**
- Vérifier la configuration PostgreSQL
- Contrôler les variables d'environnement
- Augmenter les timeouts si nécessaire

#### **Données de Test Corrompues**
```
📋 Aucun compte de test trouvé
```
**Solutions :**
- Relancer avec nettoyage forcé
- Vérifier les permissions base de données
- Contrôler le schéma de la base de test

---

## 📚 **Bonnes Pratiques**

### **✅ Dos**
- **Isolation** : Chaque test doit être indépendant
- **Nettoyage** : Toujours nettoyer après les tests
- **Assertions** : Vérifier tous les aspects critiques
- **Documentation** : Commenter les tests complexes
- **Performance** : Optimiser les requêtes de test

### **❌ Don'ts**
- **Données réelles** : Ne jamais utiliser de vraies données
- **État partagé** : Éviter les dépendances entre tests
- **Timeouts courts** : Prévoir suffisamment de temps
- **Tests flaky** : Éviter les tests instables
- **Nettoyage oublié** : Toujours nettoyer les données temporaires

---

## 🎯 **Conclusion**

Ce système de tests de non-régression offre :

- ✅ **Fiabilité** : Détection automatique des régressions
- ✅ **Couverture** : Tous les types de comptes testés
- ✅ **Automatisation** : Intégration CI/CD complète
- ✅ **Maintenabilité** : Code structuré et documenté
- ✅ **Performance** : Exécution rapide et efficace

**🚀 Le système garantit l'intégrité des calculs financiers et la stabilité de l'application !**

---

*Dernière mise à jour : 16 janvier 2025*  
*Version : 1.0*  
*Auteur : Système de Gestion des Dépenses MATA*
