# 🔐 Configuration Authentification Snapshot

## 📋 **AUTHENTIFICATION HTML SCRAPING**

Pour que le système de snapshot puisse lire les valeurs depuis le dashboard HTML, il utilise un système d'authentification automatique.

## 🔧 **VARIABLES D'ENVIRONNEMENT**

### **Obligatoires pour production :**

```bash
# Credentials pour l'authentification automatique
SNAPSHOT_USERNAME=Saliou
SNAPSHOT_PASSWORD=Murex2015

# Détection environnement (auto sur Render)
NODE_ENV=production
RENDER=true
```

### **Optionnelles (avec valeurs par défaut) :**

```bash
# Port du serveur (défaut: 3000)
PORT=3000

# URL base (auto-détectée)
# Local: http://localhost:3000
# Prod: https://mata-depenses-management.onrender.com
```

## 🎯 **FONCTIONNEMENT**

### **1. Processus d'authentification :**
1. **Lancement navigateur** Puppeteer
2. **Navigation** vers `/login`
3. **Saisie credentials** automatique
4. **Soumission formulaire** et attente navigation
5. **Accès dashboard** avec `cutoff_date`
6. **Extraction valeurs** HTML
7. **Fermeture navigateur**

### **2. Détection environnement :**
```javascript
const isProduction = process.env.NODE_ENV === 'production' || process.env.RENDER;
const baseUrl = isProduction 
    ? 'https://mata-depenses-management.onrender.com'
    : `http://localhost:${process.env.PORT || 3000}`;
```

### **3. URL de connexion :**
- **Local** : `http://localhost:3000/login`
- **Production** : `https://mata-depenses-management.onrender.com/login`

## 🔒 **SÉCURITÉ**

### **Credentials stockés :**
- ✅ **Variables d'environnement** (non dans le code)
- ✅ **Valeurs par défaut** pour développement
- ✅ **Logs sécurisés** (pas de mots de passe affichés)

### **Permissions requises :**
- **Utilisateur** : `Saliou`
- **Accès** : Dashboard complet avec tous les calculs
- **Rôle** : Admin ou utilisateur avec accès global

## 🧪 **TESTS**

### **Test local :**
```bash
# Avec credentials par défaut
node test_html_scraping.js

# Avec credentials custom
SNAPSHOT_USERNAME=MonUser SNAPSHOT_PASSWORD=MonPass node test_html_scraping.js
```

### **Test production :**
```bash
# Variables d'environnement dans Render Dashboard
NODE_ENV=production
SNAPSHOT_USERNAME=Saliou
SNAPSHOT_PASSWORD=Murex2015
```

## 📊 **LOGS ATTENDUS**

```
🧪 TEST: HTML Scraping du Dashboard
🔍 URL test: https://mata-depenses-management.onrender.com?cutoff_date=2025-09-17
🌐 Environnement: PRODUCTION
🚀 Lancement navigateur...
🔑 Authentification en cours...
✅ Authentification réussie
📄 Navigation vers dashboard...
⏳ Attente chargement éléments...
✅ Élément PL trouvé
🔍 Extraction des valeurs...
✅ #pl-estim-charges: "-6 936 351 FCFA"
✅ #cash-bictorys-latest: "5 000 000 FCFA"
🎯 PL FINAL: -6,936,351 FCFA
✅ HTML Scraping fonctionne !
🎉 PARFAITE COHÉRENCE !
```

## ⚠️ **DÉPANNAGE**

### **Erreurs communes :**

1. **"#username not found"**
   - Vérifier l'URL de login
   - Vérifier la structure HTML du formulaire

2. **"Navigation timeout"**
   - Augmenter les timeouts
   - Vérifier la connectivité réseau

3. **"Authentification échouée"**
   - Vérifier les credentials
   - Vérifier que l'utilisateur existe et est actif

### **Fallback automatique :**
Si l'authentification HTML échoue, le système utilise automatiquement le calcul manuel comme backup.

## 🎉 **AVANTAGES**

- ✅ **Authentification sécurisée** avec credentials existants
- ✅ **Pas de modification** du système d'auth existant
- ✅ **Fonctionnement identique** en local et production
- ✅ **Fallback automatique** en cas de problème
- ✅ **Configuration simple** via variables d'environnement
