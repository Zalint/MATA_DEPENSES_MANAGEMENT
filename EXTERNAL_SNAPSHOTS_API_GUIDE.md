# 🚀 API Externe Snapshots - Guide d'Utilisation

## 📋 Vue d'ensemble

L'API externe snapshots permet d'automatiser la création et la gestion des snapshots depuis des systèmes externes via des clés API.

## 🔐 Authentification

L'API utilise le même système d'authentification que l'API créances. Trois méthodes d'authentification sont supportées :

### 1. Header X-API-Key
```bash
curl -X POST https://votre-app.onrender.com/external/api/snapshots/create \
  -H "X-API-Key: VOTRE_CLE_API" \
  -H "Content-Type: application/json" \
  -d '{"cutoff_date": "2025-09-17"}'
```

### 2. Header Authorization Bearer
```bash
curl -X POST https://votre-app.onrender.com/external/api/snapshots/create \
  -H "Authorization: Bearer VOTRE_CLE_API" \
  -H "Content-Type: application/json" \
  -d '{"cutoff_date": "2025-09-17"}'
```

### 3. Query Parameter
```bash
curl -X POST "https://votre-app.onrender.com/external/api/snapshots/create?api_key=VOTRE_CLE_API" \
  -H "Content-Type: application/json" \
  -d '{"cutoff_date": "2025-09-17"}'
```

## 📌 Endpoints Disponibles

### 1. 📸 Créer un Snapshot

**POST** `/external/api/snapshots/create`

Crée un nouveau snapshot avec collecte complète des données.

#### Paramètres
```json
{
  "cutoff_date": "2025-09-17"  // Optionnel, défaut = aujourd'hui
}
```

#### Réponse Succès (200)
```json
{
  "success": true,
  "message": "Snapshot créé avec succès",
  "data": {
    "snapshot_date": "2025-09-17",
    "snapshot_date_fr": "17/09/2025",
    "creation_timestamp": "2025-09-17T14:30:25.123Z",
    "file_path": "snapshots/2025-09-17/snapshot.json",
    "file_size_mb": "0.45",
    "created_via": "external_api",
    "summary": {
      "total_accounts": 15,
      "total_expenses": 1247,
      "total_clients": 8,
      "total_partner_accounts": 4,
      "stocks_actifs": 29,
      "period": "2025-09-01 à 2025-09-17"
    }
  }
}
```

#### Réponse Erreur (500)
```json
{
  "success": false,
  "error": "Erreur lors de la création du snapshot",
  "message": "Database connection failed",
  "code": "SNAPSHOT_CREATION_ERROR"
}
```

### 2. 📋 Lister les Snapshots

**GET** `/external/api/snapshots`

Récupère la liste de tous les snapshots disponibles.

#### Réponse Succès (200)
```json
{
  "success": true,
  "total_snapshots": 5,
  "snapshots": [
    {
      "snapshot_date": "2025-09-17",
      "snapshot_date_fr": "17/09/2025",
      "creation_timestamp": "2025-09-17T14:30:25.123Z",
      "created_by_username": "External API",
      "version": "1.2",
      "file_size_mb": "0.45",
      "api_call": true
    }
  ]
}
```

### 3. 🔍 Récupérer un Snapshot Spécifique

**GET** `/external/api/snapshots/{date}`

Récupère les données complètes d'un snapshot spécifique.

#### Paramètres URL
- `date` : Date au format YYYY-MM-DD (ex: 2025-09-17)

#### Réponse Succès (200)
```json
{
  "success": true,
  "snapshot_date": "2025-09-17",
  "snapshot_date_fr": "17/09/2025",
  "metadata": {
    "snapshot_date": "2025-09-17",
    "creation_timestamp": "2025-09-17T14:30:25.123Z",
    "created_by_username": "External API",
    "version": "1.2",
    "api_call": true
  },
  "data": {
    "dashboard": { ... },
    "depenses": { ... },
    "creances": { ... },
    "gestion_stock": { ... },
    "comptes_partenaires": { ... }
  }
}
```

#### Réponse Erreur (404)
```json
{
  "success": false,
  "error": "Snapshot non trouvé",
  "snapshot_date": "2025-09-17"
}
```

## 🌐 Intégration depuis Render Production

### Depuis un autre service Render
```javascript
// API Call depuis un autre service Render
const response = await fetch('https://votre-app.onrender.com/external/api/snapshots/create', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': process.env.SNAPSHOTS_API_KEY
  },
  body: JSON.stringify({
    cutoff_date: '2025-09-17'
  })
});

const result = await response.json();
console.log('Snapshot créé:', result);
```

### Depuis un service externe (Python)
```python
import requests
import json

url = "https://votre-app.onrender.com/external/api/snapshots/create"
headers = {
    "Content-Type": "application/json",
    "X-API-Key": "VOTRE_CLE_API"
}
data = {
    "cutoff_date": "2025-09-17"
}

response = requests.post(url, headers=headers, data=json.dumps(data))
result = response.json()
print(f"Snapshot créé: {result}")
```

### Depuis une GitHub Action
```yaml
name: Daily Snapshot
on:
  schedule:
    - cron: '0 20 * * *'  # Tous les jours à 20h UTC

jobs:
  create-snapshot:
    runs-on: ubuntu-latest
    steps:
      - name: Create Daily Snapshot
        run: |
          curl -X POST https://votre-app.onrender.com/external/api/snapshots/create \
            -H "X-API-Key: ${{ secrets.SNAPSHOTS_API_KEY }}" \
            -H "Content-Type: application/json" \
            -d '{"cutoff_date": "'$(date +%Y-%m-%d)'"}'
```

## 🔄 Automatisation Recommandée

### 1. Snapshot Quotidien Automatique
```bash
#!/bin/bash
# Script cron pour snapshot quotidien
DATE=$(date +%Y-%m-%d)
API_KEY="VOTRE_CLE_API"
URL="https://votre-app.onrender.com/external/api/snapshots/create"

curl -X POST "$URL" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"cutoff_date\": \"$DATE\"}" \
  --silent --output /dev/null

echo "Snapshot créé pour $DATE"
```

### 2. Vérification et Récupération
```bash
#!/bin/bash
# Vérifier les snapshots disponibles
curl -H "X-API-Key: VOTRE_CLE_API" \
  https://votre-app.onrender.com/external/api/snapshots \
  | jq '.snapshots[0]'
```

## 📊 Données Incluses dans les Snapshots

### Dashboard
- Statistiques principales (dépensé, restant, crédité)
- Détails par compte avec enrichissements
- Calculs PL détaillés
- Détails du cash disponible
- Cartes additionnelles (stocks, dépôts)

### Dépenses
- Historique complet depuis le début du mois
- Analyse par catégorie
- Métadonnées de période

### Créances
- Récapitulatif par client
- Historique des opérations

### Gestion de Stock
- **Nouveau** : Stocks du soir actifs (> 0)
- Date de référence la plus récente
- Détails par point de vente et produit

### Comptes Partenaires
- Suivi des livraisons
- Progression des comptes

## ⚠️ Limitations et Considérations

### Limites Techniques
- **Timeout** : 60 secondes maximum par requête
- **Taille** : Snapshots peuvent être volumineux (0.5-2 MB)
- **Fréquence** : Limitée par les ressources serveur

### Bonnes Pratiques
1. **Éviter les doublons** : Vérifier d'abord si un snapshot existe
2. **Gestion d'erreurs** : Implémenter des retry avec backoff
3. **Monitoring** : Logger les appels API pour audit
4. **Sécurité** : Stocker les clés API de manière sécurisée

## 🔧 Dépannage

### Erreur 401 - Non autorisé
```json
{"error": "Non autorisé"}
```
**Solution** : Vérifier la clé API et le format d'authentification

### Erreur 500 - Erreur serveur
```json
{
  "success": false,
  "code": "SNAPSHOT_CREATION_ERROR"
}
```
**Solution** : Vérifier les logs serveur et la connectivité base de données

### Timeout
**Solution** : Retry avec délai ou contacter l'équipe technique

## 📝 Exemple Complet d'Utilisation

```javascript
// Script Node.js complet pour créer et vérifier un snapshot
const fetch = require('node-fetch');

const API_KEY = 'VOTRE_CLE_API';
const BASE_URL = 'https://votre-app.onrender.com';

async function createDailySnapshot() {
  try {
    // 1. Créer le snapshot
    const createResponse = await fetch(`${BASE_URL}/external/api/snapshots/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY
      },
      body: JSON.stringify({
        cutoff_date: new Date().toISOString().split('T')[0]
      })
    });
    
    const createResult = await createResponse.json();
    
    if (createResult.success) {
      console.log('✅ Snapshot créé:', createResult.data.snapshot_date);
      
      // 2. Vérifier la liste des snapshots
      const listResponse = await fetch(`${BASE_URL}/external/api/snapshots`, {
        headers: { 'X-API-Key': API_KEY }
      });
      
      const listResult = await listResponse.json();
      console.log(`📋 Total snapshots: ${listResult.total_snapshots}`);
      
      return createResult.data;
    } else {
      throw new Error(createResult.error);
    }
    
  } catch (error) {
    console.error('❌ Erreur:', error.message);
    throw error;
  }
}

// Exécuter
createDailySnapshot()
  .then(data => console.log('🎉 Succès:', data.file_path))
  .catch(error => console.error('💥 Échec:', error.message));
```

---

**📧 Support** : Pour toute question sur l'API, consultez les logs serveur ou contactez l'équipe technique.
