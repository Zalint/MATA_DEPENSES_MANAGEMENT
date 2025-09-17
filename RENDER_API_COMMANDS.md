# 🚀 Commandes API Snapshots pour Render Production

## ✅ **Problème "NaN MB" Corrigé !**

Le problème d'affichage de taille "NaN MB" dans l'interface a été résolu. Les snapshots affichent maintenant correctement leur taille (ex: 0.32 MB).

## 🌐 **Utilisation sur Render Production**

### 📸 **1. Créer un Snapshot**

```bash
curl -X POST https://votre-app.onrender.com/external/api/snapshots/create \
  -H "X-API-Key: 4f8d9a2b6c7e8f1a3b5c9d0e2f4g6h7i" \
  -H "Content-Type: application/json" \
  -d '{"cutoff_date": "2025-09-17"}'
```

**Réponse attendue :**
```json
{
  "success": true,
  "message": "Snapshot créé avec succès",
  "data": {
    "snapshot_date": "2025-09-17",
    "snapshot_date_fr": "17/09/2025",
    "creation_timestamp": "2025-09-17T15:30:22.123Z",
    "file_path": "snapshots/2025-09-17/snapshot.json",
    "file_size_mb": "0.32",
    "created_via": "external_api",
    "summary": {
      "total_accounts": 20,
      "total_expenses": 434,
      "total_clients": 100,
      "stocks_actifs": 29,
      "period": "2025-09-01 à 2025-09-17"
    }
  }
}
```

### 📋 **2. Lister les Snapshots**

```bash
curl -H "X-API-Key: 4f8d9a2b6c7e8f1a3b5c9d0e2f4g6h7i" \
  https://votre-app.onrender.com/external/api/snapshots
```

### 🔍 **3. Récupérer un Snapshot Spécifique**

```bash
curl -H "X-API-Key: 4f8d9a2b6c7e8f1a3b5c9d0e2f4g6h7i" \
  https://votre-app.onrender.com/external/api/snapshots/2025-09-17
```

## 🔧 **Remplacez l'URL :**

**Trouvez votre URL Render :**
1. Allez sur votre dashboard Render
2. Votre service aura une URL comme :
   - `https://depenses-management.onrender.com`
   - `https://mata-depenses-xyz123.onrender.com`

**Remplacez dans les commandes :**
```bash
# Remplacez ceci
https://votre-app.onrender.com

# Par votre vraie URL Render
https://votre-nom-app.onrender.com
```

## 🔑 **Configuration de la Clé API :**

### **Option 1 : Clé fournie**
Utilisez la clé que vous avez fournie :
```bash
X-API-Key: 4f8d9a2b6c7e8f1a3b5c9d0e2f4g6h7i
```

### **Option 2 : Variable d'environnement**
```bash
# Définir la clé une fois
export API_KEY="4f8d9a2b6c7e8f1a3b5c9d0e2f4g6h7i"

# Utiliser dans les commandes
curl -X POST https://votre-app.onrender.com/external/api/snapshots/create \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"cutoff_date": "2025-09-17"}'
```

## 📅 **Paramètres de Date :**

### **Date spécifique :**
```bash
-d '{"cutoff_date": "2025-09-17"}'
```

### **Date du jour :**
```bash
# Linux/Mac
-d "{\"cutoff_date\": \"$(date +%Y-%m-%d)\"}"

# Windows PowerShell
-d "{`"cutoff_date`": `"$(Get-Date -Format yyyy-MM-dd)`"}"
```

### **Sans date (défaut = aujourd'hui) :**
```bash
-d '{}'
```

## 🔄 **Automatisation :**

### **Script Bash quotidien :**
```bash
#!/bin/bash
# daily_snapshot.sh

API_KEY="4f8d9a2b6c7e8f1a3b5c9d0e2f4g6h7i"
RENDER_URL="https://votre-app.onrender.com"
DATE=$(date +%Y-%m-%d)

echo "🚀 Création snapshot pour $DATE..."

response=$(curl -s -X POST "$RENDER_URL/external/api/snapshots/create" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"cutoff_date\": \"$DATE\"}")

if echo "$response" | grep -q '"success":true'; then
    echo "✅ Snapshot créé avec succès"
    echo "$response" | jq '.data.summary'
else
    echo "❌ Erreur création snapshot"
    echo "$response"
fi
```

### **Cron job (exécution quotidienne) :**
```bash
# Éditer crontab
crontab -e

# Ajouter ligne pour exécution tous les jours à 20h
0 20 * * * /path/to/daily_snapshot.sh >> /var/log/snapshots.log 2>&1
```

### **GitHub Action :**
```yaml
name: Daily Snapshot
on:
  schedule:
    - cron: '0 20 * * *'  # 20h UTC chaque jour

jobs:
  create-snapshot:
    runs-on: ubuntu-latest
    steps:
      - name: Create Snapshot
        run: |
          curl -X POST ${{ secrets.RENDER_URL }}/external/api/snapshots/create \
            -H "X-API-Key: ${{ secrets.API_KEY }}" \
            -H "Content-Type: application/json" \
            -d '{"cutoff_date": "'$(date +%Y-%m-%d)'"}'
```

## ⚠️ **Gestion d'Erreurs :**

### **Erreur 401 - Non autorisé :**
```json
{"error": "Non autorisé"}
```
**Solution :** Vérifiez votre clé API

### **Erreur 500 - Erreur serveur :**
```json
{
  "success": false,
  "error": "Erreur lors de la création du snapshot",
  "code": "SNAPSHOT_CREATION_ERROR"
}
```
**Solution :** Vérifiez les logs Render ou contactez le support

### **Test avec verbose :**
```bash
curl -v -X POST https://votre-app.onrender.com/external/api/snapshots/create \
  -H "X-API-Key: 4f8d9a2b6c7e8f1a3b5c9d0e2f4g6h7i" \
  -H "Content-Type: application/json" \
  -d '{"cutoff_date": "2025-09-17"}'
```

## 🎯 **Validation :**

### **1. Test de connexion :**
```bash
curl -I https://votre-app.onrender.com
```

### **2. Test d'authentification :**
```bash
curl -H "X-API-Key: 4f8d9a2b6c7e8f1a3b5c9d0e2f4g6h7i" \
  https://votre-app.onrender.com/external/api/snapshots
```

### **3. Création et vérification :**
```bash
# Créer
curl -X POST https://votre-app.onrender.com/external/api/snapshots/create \
  -H "X-API-Key: 4f8d9a2b6c7e8f1a3b5c9d0e2f4g6h7i" \
  -H "Content-Type: application/json" \
  -d '{"cutoff_date": "2025-09-17"}'

# Vérifier
curl -H "X-API-Key: 4f8d9a2b6c7e8f1a3b5c9d0e2f4g6h7i" \
  https://votre-app.onrender.com/external/api/snapshots
```

---

## 🔥 **Nouveautés Incluses :**

- ✅ **Taille corrigée** : Plus de "NaN MB"
- ✅ **Section Stock** : Stocks du soir actifs
- ✅ **Dates dynamiques** : Période mensuelle intelligente
- ✅ **Métadonnées API** : Traçabilité des appels externes
- ✅ **Sécurité robuste** : Authentification par clé API

**🎉 Votre API snapshots est prête pour la production !**
