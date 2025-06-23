# Guide de Test - Debug Upload Gestion des Stocks

## 🎯 Objectif
Ce guide vous aide à diagnostiquer pourquoi le bouton "Importer les données" ne fonctionne pas.

## 📋 Tests à effectuer

### Test 1: Page de Debug Autonome
1. Ouvrez votre navigateur
2. Allez sur `http://localhost:3000/test_upload_debug.html`
3. Testez l'upload avec votre fichier `Reconciliation_sample.json`
4. Regardez les logs dans la console du navigateur (F12)

### Test 2: Application Principale
1. Connectez-vous à `http://localhost:3000` avec un compte admin/DG/PCA
2. Allez dans "Gestion Stock"
3. Ouvrez la console du navigateur (F12)
4. Essayez d'importer le fichier `Reconciliation_sample.json`
5. Observez les logs détaillés

## 🔍 Logs à surveiller

### Côté Client (Console du navigateur)
```
🏭 CLIENT: Initialisation du module de gestion des stocks
🏭 CLIENT: Section stock-soir: ✅ Trouvée
🏭 CLIENT: Formulaire upload: ✅ Trouvé
🔧 CLIENT: setupStockEventListeners appelé
✅ CLIENT: Event listener attaché au formulaire d'upload
🚀 CLIENT: handleStockUpload appelé
📁 CLIENT: Détails du fichier: [nom, taille, type]
🌐 CLIENT: Début de la requête fetch
📡 CLIENT: Réponse reçue du serveur
```

### Côté Serveur (Terminal)
```
🔐 SERVER: requireAdminAuth appelé pour: POST /api/stock-soir/upload
✅ SERVER: Authentification admin réussie
🚀 SERVER: Route /api/stock-soir/upload appelée
📂 SERVER: Fichier reçu: [détails du fichier]
📖 SERVER: Lecture du fichier...
```

## 🚨 Problèmes possibles

### 1. Event Listener non attaché
**Symptôme**: Rien ne se passe au clic
**Log manquant**: `🚀 CLIENT: handleStockUpload appelé`
**Solution**: Vérifier que `setupStockEventListeners()` s'exécute

### 2. Formulaire non trouvé
**Symptôme**: Erreur dans la console
**Log**: `❌ CLIENT: Formulaire d'upload non trouvé!`
**Solution**: Vérifier que l'ID `stock-upload-form` existe dans le HTML

### 3. Problème d'authentification
**Symptôme**: Erreur 403
**Log**: `❌ SERVER: Accès refusé - Privilèges insuffisants`
**Solution**: Vérifier que vous êtes connecté avec le bon rôle

### 4. Fichier non reçu par le serveur
**Symptôme**: Erreur "Aucun fichier fourni"
**Log**: `❌ SERVER: Aucun fichier fourni`
**Solution**: Vérifier la configuration de multer

## 📝 Instructions de test

1. **Démarrez le serveur** (si pas déjà fait):
   ```bash
   node server.js
   ```

2. **Ouvrez deux onglets**:
   - Terminal pour voir les logs serveur
   - Navigateur avec F12 ouvert pour voir les logs client

3. **Testez étape par étape**:
   - D'abord la page de debug autonome
   - Puis l'application principale

4. **Notez les différences** entre ce qui s'affiche et ce qui devrait s'afficher

## 🔧 Actions correctives

### Si les event listeners ne s'attachent pas:
- Vérifier que `initStockModule()` est appelé
- Vérifier que la section stock est visible
- Vérifier les IDs des éléments HTML

### Si l'authentification échoue:
- Vérifier que vous êtes connecté
- Vérifier votre rôle utilisateur
- Tester avec un compte admin

### Si le fichier n'est pas reçu:
- Vérifier l'attribut `enctype="multipart/form-data"`
- Vérifier le nom du champ `reconciliation`
- Vérifier la configuration multer

## 📊 Résultats attendus

Avec tous les logs activés, vous devriez voir:
1. ✅ Initialisation du module côté client
2. ✅ Authentification réussie côté serveur  
3. ✅ Réception du fichier côté serveur
4. ✅ Traitement du JSON
5. ✅ Insertion en base de données
6. ✅ Réponse de succès

Si une étape manque, c'est là qu'est le problème ! 