# 🔧 Solution Chrome Persistant sur Render

## 🚨 **Problème Identifié**
Chrome installé dans `/opt/render/.cache` n'est **pas persistant** sur Render.
À chaque redéploiement → Chrome perdu → Erreur 500 sur snapshots.

## ✅ **Solution Implémentée**

### **🎯 Stratégie: Utiliser le répertoire `uploads` (déjà monté)**

Le répertoire `/opt/render/project/src/uploads` est déjà configuré comme **disque persistant** (10 GB).

### **🔧 Modifications Apportées**

#### **1. Script postinstall (package.json)**
```bash
# AVANT (problématique):
npx puppeteer browsers install chrome

# APRÈS (persistant):
PUPPETEER_CACHE_DIR=/opt/render/project/src/uploads/.puppeteer-cache npx puppeteer browsers install chrome
```

#### **2. Détection Chrome (server.js)**
```javascript
// Configuration cache persistant
process.env.PUPPETEER_CACHE_DIR = '/opt/render/project/src/uploads/.puppeteer-cache';

// Recherche Chrome dans uploads (persistant)
find /opt/render/project/src/uploads/.puppeteer-cache -name "chrome" -type f -executable
```

### **📂 Structure Résultante**
```
/opt/render/project/src/uploads/
├── snapshots/                    # Snapshots existants
├── .puppeteer-cache/            # 🆕 Chrome persistant
│   └── chrome/
│       └── linux-xxx/
│           └── chrome-linux64/
│               └── chrome       # Exécutable Chrome
└── autres-fichiers...
```

## 🎯 **Avantages**

1. ✅ **Persistance** : Chrome survit aux redéploiements
2. ✅ **Pas de coût** : Utilise le disque déjà monté
3. ✅ **Performance** : Chrome installé une seule fois
4. ✅ **Fiabilité** : Plus d'erreurs 500 liées à Chrome

## 🚀 **Test de la Solution**

### **Commandes de vérification:**
```bash
# Vérifier présence Chrome après déploiement
find /opt/render/project/src/uploads -name "chrome" -type f

# Tester snapshot
POST /external/api/snapshots/create
```

### **Logs attendus:**
```
🔍 === DÉTECTION CHROME DANS UPLOADS (PERSISTANT) ===
🔍 Recherche dans uploads/.puppeteer-cache...
✅ Chrome trouvé dans uploads: /opt/render/project/src/uploads/.puppeteer-cache/chrome/linux-xxx/chrome-linux64/chrome
🎉 Chrome configuré: /opt/render/project/src/uploads/.puppeteer-cache/chrome/linux-xxx/chrome-linux64/chrome
```

## 🔄 **Alternative: Mount dédié**

Si cette solution ne fonctionne pas, ajouter un mount dédié:
```
Mount path: /opt/render/.cache
Size: 2 GB
```

---
*Solution implémentée le 18/09/2025 pour résoudre définitivement les problèmes Chrome sur Render*
