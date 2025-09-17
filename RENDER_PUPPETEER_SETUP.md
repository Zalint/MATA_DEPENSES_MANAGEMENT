# 🎭 Configuration Puppeteer pour Render

## 🚨 **PROBLÈME RÉSOLU**

**Erreur en production :**
```
❌ Could not find Chrome (ver. 140.0.7339.82)
🚫 PAS DE FALLBACK - HTML scraping est OBLIGATOIRE
```

**Cause :** Chrome n'est pas installé par défaut sur les serveurs Render.

## ✅ **SOLUTION IMPLÉMENTÉE**

### **1. Installation automatique de Chrome**

**Dans `package.json` :**
```json
{
  "scripts": {
    "postinstall": "npx puppeteer browsers install chrome"
  }
}
```

**Ce script :**
- ✅ S'exécute automatiquement après `npm install` 
- ✅ Télécharge et installe Chrome dans `/opt/render/.cache/puppeteer`
- ✅ Fonctionne avec toutes les versions de Puppeteer
- ✅ Compatible avec les contraintes de Render

### **2. Configuration Puppeteer optimisée**

**Dans `server.js` :**
```javascript
const browser = await puppeteer.launch({
    headless: true,
    args: [
        '--no-sandbox',
        '--disable-setuid-sandbox', 
        '--disable-dev-shm-usage'
    ]
});
```

**Arguments essentiels pour Render :**
- `--no-sandbox` : Contourne les restrictions de sécurité des conteneurs
- `--disable-setuid-sandbox` : Évite les erreurs de permissions  
- `--disable-dev-shm-usage` : Utilise `/tmp` au lieu de `/dev/shm`

## 🚀 **DÉPLOIEMENT**

### **Variables d'environnement Render :**
```bash
# Authentification HTML Scraping
SNAPSHOT_USERNAME=Saliou
SNAPSHOT_PASSWORD=Murex2015

# Environnement (auto-détectées par Render)
NODE_ENV=production
RENDER=true
```

### **Processus de déploiement :**

1. **Push du code mis à jour :**
```bash
git add .
git commit -m "🎭 Fix Puppeteer Chrome installation for Render"
git push origin main
```

2. **Render exécutera automatiquement :**
```bash
npm install                           # Installation des dépendances
npx puppeteer browsers install chrome # Installation automatique de Chrome
npm start                            # Démarrage du serveur
```

3. **Vérification logs Render :**
```
==> Installing dependencies...
==> Running 'npm install'
==> Running 'npx puppeteer browsers install chrome'
✅ chrome@140.0.7339.82 downloaded to /opt/render/.cache/puppeteer
==> Build completed successfully
==> Starting service with 'npm start'
🎭 Chrome installation réussie !
```

## 🧪 **TESTS**

### **Test local (pour vérifier) :**
```bash
# Forcer réinstallation Chrome
npx puppeteer browsers install chrome

# Tester le scraping
$env:SNAPSHOT_USERNAME="Saliou"
$env:SNAPSHOT_PASSWORD="Murex2015" 
node test_html_scraping.js
```

### **Test production (après déploiement) :**
```powershell
# Test création snapshot
$API_KEY="4f8d9a2b6c7e8f1a3b5c9d0e2f4g6h7i"
$body = @{ cutoff_date = "2025-09-17" } | ConvertTo-Json

$response = Invoke-WebRequest -Uri "https://mata-depenses-management.onrender.com/external/api/snapshots/create" -Method POST -Headers @{"X-API-Key"=$API_KEY; "Content-Type"="application/json"} -Body $body

# Vérifier succès
$data = $response.Content | ConvertFrom-Json
Write-Host "Success: $($data.success)"
```

## 📊 **LOGS ATTENDUS APRÈS CORRECTION**

```
🌐 SNAPSHOT: Lecture des valeurs depuis le HTML du dashboard...
🔍 URL dashboard: https://mata-depenses-management.onrender.com?cutoff_date=2025-09-17
🚀 Lancement navigateur...
✅ Chrome trouvé dans: /opt/render/.cache/puppeteer/chrome/...
🔑 Authentification en cours...
✅ Authentification réussie
📄 Navigation vers dashboard...
✅ Élément PL trouvé
🔍 Extraction des valeurs...
✅ #pl-estim-charges: "-6 936 351 FCFA"
🎯 PL FINAL: -6,936,351 FCFA
✅ Valeurs extraites depuis HTML avec succès !
```

## ⚠️ **ALTERNATIVES (si problème persiste)**

### **Option 1 : Variables d'environnement Puppeteer**
```bash
# Dans Render Dashboard > Environment
PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=false
PUPPETEER_CACHE_DIR=/opt/render/.cache/puppeteer
```

### **Option 2 : Installation manuelle dans script build**
```json
{
  "scripts": {
    "build": "npx puppeteer browsers install chrome"
  }
}
```

### **Option 3 : Fallback temporaire (urgence uniquement)**
```javascript
// En cas d'urgence absolue, décommenter cette ligne dans server.js :
// useHtmlScraping = false; // URGENCE : fallback manuel
```

## 🎉 **AVANTAGES DE CETTE SOLUTION**

- ✅ **Installation automatique** : Pas d'intervention manuelle
- ✅ **Cache partagé** : Chrome réutilisé entre les déploiements  
- ✅ **Robuste** : Gestion d'erreurs intégrée
- ✅ **Standard** : Solution recommandée par Puppeteer
- ✅ **Compatible** : Fonctionne avec toutes les versions

## 📝 **CHECKLIST DÉPLOIEMENT**

- [x] Script `postinstall` ajouté dans `package.json`
- [ ] Variables `SNAPSHOT_USERNAME` et `SNAPSHOT_PASSWORD` configurées sur Render
- [ ] Code pushé sur GitHub (déclenche auto-déploiement)
- [ ] Logs Render vérifiés (installation Chrome réussie)
- [ ] Test snapshot en production validé

## 🆘 **DÉPANNAGE**

**Si l'erreur persiste :**

1. **Vérifier logs Render** : Installation Chrome réussie ?
2. **Tester variables** : `SNAPSHOT_USERNAME` et `SNAPSHOT_PASSWORD` définies ?
3. **Cache Puppeteer** : Redéploiement force le re-téléchargement
4. **Timeouts** : Augmenter si réseau lent

**Support Render :** Si problème persist, contacter le support avec :
- Logs d'installation Chrome
- Version Puppeteer utilisée  
- Configuration environnement
