# 📡 API Externe Cash Bictorys

## 🎯 Vue d'ensemble

API externe permettant de mettre à jour les données Cash Bictorys via des appels HTTP avec authentification par clé API.

## 🔐 Authentification

**Clé API requise** : `4f8d9a2b6c7e8f1a3b5c9d0e2f4g6h7i`

### Méthodes d'authentification supportées :
- **Header X-API-Key** : `X-API-Key: 4f8d9a2b6c7e8f1a3b5c9d0e2f4g6h7i`
- **Authorization Bearer** : `Authorization: Bearer 4f8d9a2b6c7e8f1a3b5c9d0e2f4g6h7i`
- **Query Parameter** : `?api_key=4f8d9a2b6c7e8f1a3b5c9d0e2f4g6h7i`

## 🚀 Endpoint

### POST `/api/external/cash-bictorys`

**URL** : `https://your-render-app.onrender.com/api/external/cash-bictorys`

## 📝 Format des données

### Structure du body (JSON Array)
```json
[
  {
    "DATE": "2025-09-17",
    "VALEUR": 5000000,
    "BALANCE": 12000000
  },
  {
    "DATE": "18/09/2025",
    "VALEUR": 6000000,
    "BALANCE": 13000000
  }
]
```

### Champs requis
- **DATE** : Date au format supporté (voir formats ci-dessous)
- **VALEUR** : Montant en FCFA (nombre entier)

### Champs optionnels
- **BALANCE** : Solde en FCFA (défaut: 0)

## 📅 Formats de dates supportés

| Format | Exemple | Description |
|--------|---------|-------------|
| `YYYY-MM-DD` | `2025-09-17` | Format ISO (recommandé) |
| `DD-MM-YYYY` | `17-09-2025` | Format français avec tirets |
| `DD/MM/YYYY` | `17/09/2025` | Format français avec slashes |
| `DD/MM/YY` | `17/09/25` | Format court (suppose 20XX) |

## 🔧 Exemples d'utilisation

### 1. Curl avec X-API-Key
```bash
curl -X POST "https://your-render-app.onrender.com/api/external/cash-bictorys" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: 4f8d9a2b6c7e8f1a3b5c9d0e2f4g6h7i" \
  -d '[
    {
      "DATE": "2025-09-17",
      "VALEUR": 5000000,
      "BALANCE": 12000000
    }
  ]'
```

### 2. Curl avec Authorization Bearer
```bash
curl -X POST "https://your-render-app.onrender.com/api/external/cash-bictorys" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer 4f8d9a2b6c7e8f1a3b5c9d0e2f4g6h7i" \
  -d '[
    {
      "DATE": "17/09/2025",
      "VALEUR": 6000000,
      "BALANCE": 13000000
    }
  ]'
```

### 3. Entrées multiples avec formats mixtes
```bash
curl -X POST "https://your-render-app.onrender.com/api/external/cash-bictorys" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: 4f8d9a2b6c7e8f1a3b5c9d0e2f4g6h7i" \
  -d '[
    {
      "DATE": "2025-09-17",
      "VALEUR": 5000000,
      "BALANCE": 12000000
    },
    {
      "DATE": "18/09/2025",
      "VALEUR": 6000000,
      "BALANCE": 13000000
    },
    {
      "DATE": "19-09-2025",
      "VALEUR": 7000000
    }
  ]'
```

### 4. JavaScript/Node.js
```javascript
const fetch = require('node-fetch');

// URL de production sur Render
const API_URL = process.env.API_URL || 'https://your-render-app.onrender.com';

const response = await fetch(`${API_URL}/api/external/cash-bictorys`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': '4f8d9a2b6c7e8f1a3b5c9d0e2f4g6h7i'
  },
  body: JSON.stringify([
    {
      DATE: '2025-09-17',
      VALEUR: 5000000,
      BALANCE: 12000000
    }
  ])
});

const result = await response.json();
console.log(result);
```

### 5. Python
```python
import requests
import json
import os

# URL de production sur Render
api_url = os.getenv('API_URL', 'https://your-render-app.onrender.com')
url = f'{api_url}/api/external/cash-bictorys'

headers = {
    'Content-Type': 'application/json',
    'X-API-Key': '4f8d9a2b6c7e8f1a3b5c9d0e2f4g6h7i'
}
data = [
    {
        "DATE": "2025-09-17",
        "VALEUR": 5000000,
        "BALANCE": 12000000
    }
]

response = requests.post(url, headers=headers, data=json.dumps(data))
print(response.json())
```

## 📊 Réponses

### ✅ Succès (200)
```json
{
  "success": true,
  "message": "Traitement terminé. 3 entrées traitées.",
  "imported_count": 3,
  "error_count": 0,
  "errors": [],
  "supported_date_formats": ["YYYY-MM-DD", "DD-MM-YYYY", "DD/MM/YYYY", "DD/MM/YY"]
}
```

### ❌ Erreur de validation (400)
```json
{
  "error": "Format de date invalide dans l'objet 1: \"invalid-date\". Formats supportés: YYYY-MM-DD, DD-MM-YYYY, DD/MM/YYYY, DD/MM/YY"
}
```

### 🔑 Erreur d'authentification (401)
```json
{
  "error": "Clé API invalide"
}
```

### 🚨 Erreur serveur (500)
```json
{
  "success": false,
  "error": "Erreur serveur lors du traitement",
  "details": "Message d'erreur détaillé"
}
```

## 🔄 Fonctionnement

1. **Validation des données** : Vérification des formats de dates et types de données
2. **Normalisation des dates** : Conversion automatique vers le format YYYY-MM-DD
3. **Insertion/Mise à jour** : Upsert en base de données (INSERT ... ON CONFLICT DO UPDATE)
4. **Gestion des erreurs** : Traitement individuel de chaque entrée avec rapport détaillé

## ⚙️ Caractéristiques techniques

- **Authentification** : Clé API avec middleware `requireCashBictorysAuth`
- **Base de données** : PostgreSQL avec table `cash_bictorys`
- **Traçabilité** : Champs `created_by` et `updated_by` automatiques
- **Robustesse** : Gestion des erreurs par entrée individuelle
- **Flexibilité** : Support de multiples formats de dates

## 📋 Notes importantes

1. **Upsert automatique** : Si une date existe déjà, les données sont mises à jour
2. **Validation stricte** : Toutes les données sont validées avant insertion
3. **Traçabilité** : Utilise l'ID de l'utilisateur admin pour la traçabilité
4. **Formats de dates** : Supporte les formats français et internationaux
5. **Gestion des erreurs** : Continue le traitement même en cas d'erreur sur une entrée

## 🧪 Tests disponibles

Exécuter les tests : `node test_external_cash_bictorys_api.js`

Les tests incluent :
- Validation des différents formats de dates
- Gestion des erreurs de validation
- Test d'authentification
- Vérification des données en base
