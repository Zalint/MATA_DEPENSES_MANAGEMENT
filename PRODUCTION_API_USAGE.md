# 🚀 Utilisation de l'API Cash Bictorys en Production

## 📡 Configuration pour Render

### URL de l'API en production
Remplacez `your-render-app.onrender.com` par l'URL réelle de votre application Render.

**Exemple d'URL complète :**
```
https://mata-depenses-management.onrender.com/api/external/cash-bictorys
```

### 🔐 Configuration des variables d'environnement

Sur Render, configurez ces variables dans le dashboard :

#### Variables obligatoires :
- `API_KEY=4f8d9a2b6c7e8f1a3b5c9d0e2f4g6h7i`
- `DB_HOST=<host-postgresql-render>`
- `DB_PORT=5432`
- `DB_NAME=<nom-base-donnees>`
- `DB_USER=<utilisateur-db>`
- `DB_PASSWORD=<mot-de-passe-db>`

#### Variables optionnelles :
- `NODE_ENV=production`
- `PORT=3000` (automatique sur Render)

## 🧪 Test en production

### 1. Test simple avec curl
```bash
curl -X POST "https://mata-depenses-management.onrender.com/api/external/cash-bictorys" \
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

### 2. Test depuis un script Node.js en production
```javascript
const fetch = require('node-fetch');

// Configuration pour production
const API_URL = 'https://mata-depenses-management.onrender.com';
const API_KEY = process.env.CASH_BICTORYS_API_KEY || '4f8d9a2b6c7e8f1a3b5c9d0e2f4g6h7i';

async function sendCashBictorysData(data) {
    try {
        const response = await fetch(`${API_URL}/api/external/cash-bictorys`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': API_KEY
            },
            body: JSON.stringify(data)
        });

        const result = await response.json();
        
        if (response.ok) {
            console.log(`✅ Succès: ${result.imported_count} entrées importées`);
            return { success: true, data: result };
        } else {
            console.error(`❌ Erreur API: ${result.error}`);
            return { success: false, error: result.error };
        }
    } catch (error) {
        console.error(`🚨 Erreur réseau: ${error.message}`);
        return { success: false, error: error.message };
    }
}

// Exemple d'utilisation
const dailyData = [
    {
        DATE: "2025-09-17",
        VALEUR: 5000000,
        BALANCE: 12000000
    },
    {
        DATE: "18/09/2025", // Format français supporté
        VALEUR: 6000000,
        BALANCE: 13000000
    }
];

sendCashBictorysData(dailyData);
```

### 3. Script Python pour production
```python
import requests
import json
import os
from datetime import datetime

class CashBictorysAPI:
    def __init__(self, api_url=None, api_key=None):
        self.api_url = api_url or 'https://mata-depenses-management.onrender.com'
        self.api_key = api_key or os.getenv('CASH_BICTORYS_API_KEY', '4f8d9a2b6c7e8f1a3b5c9d0e2f4g6h7i')
        self.endpoint = f'{self.api_url}/api/external/cash-bictorys'
    
    def send_data(self, data_list):
        """
        Envoie les données Cash Bictorys
        
        Args:
            data_list (list): Liste des entrées avec DATE, VALEUR, BALANCE
        
        Returns:
            dict: Résultat de l'API
        """
        headers = {
            'Content-Type': 'application/json',
            'X-API-Key': self.api_key
        }
        
        try:
            response = requests.post(
                self.endpoint, 
                headers=headers, 
                data=json.dumps(data_list),
                timeout=30
            )
            
            result = response.json()
            
            if response.ok:
                print(f"✅ Succès: {result['imported_count']} entrées importées")
                if result['error_count'] > 0:
                    print(f"⚠️ {result['error_count']} erreurs:")
                    for error in result['errors']:
                        print(f"   - {error}")
                return result
            else:
                print(f"❌ Erreur API ({response.status_code}): {result.get('error', 'Erreur inconnue')}")
                return result
                
        except requests.exceptions.Timeout:
            print("🕐 Timeout: L'API n'a pas répondu dans les temps")
            return {"success": False, "error": "Timeout"}
        except requests.exceptions.RequestException as e:
            print(f"🚨 Erreur réseau: {e}")
            return {"success": False, "error": str(e)}

# Exemple d'utilisation
if __name__ == "__main__":
    api = CashBictorysAPI()
    
    # Données du jour
    today_data = [
        {
            "DATE": datetime.now().strftime("%Y-%m-%d"),
            "VALEUR": 5500000,
            "BALANCE": 15500000
        }
    ]
    
    result = api.send_data(today_data)
    print("Résultat:", json.dumps(result, indent=2))
```

## 📊 Monitoring et logs

### Vérification des logs sur Render
1. Accédez au dashboard Render
2. Sélectionnez votre service
3. Onglet "Logs" pour voir les appels API :
   ```
   🌐 EXTERNAL API: Requête Cash Bictorys reçue
   🌐 EXTERNAL API: Body: [{"DATE": "2025-09-17", "VALEUR": 5000000, "BALANCE": 12000000}]
   🌐 EXTERNAL API: Traitement terminé - 1 importées, 0 erreurs
   ```

### Healthcheck de l'API
```bash
# Vérifier que l'API est accessible
curl -I https://mata-depenses-management.onrender.com/api/external/cash-bictorys

# Doit retourner 405 Method Not Allowed (normal pour GET sur un endpoint POST)
```

## 🔒 Sécurité en production

### 1. Protection de la clé API
- ❌ Ne jamais exposer la clé dans le code
- ✅ Utiliser des variables d'environnement
- ✅ Rotation périodique de la clé si nécessaire

### 2. HTTPS obligatoire
- ✅ Render utilise automatiquement HTTPS
- ❌ Ne jamais utiliser HTTP en production

### 3. Rate limiting
L'API actuelle n'a pas de rate limiting. Pour l'ajouter :
```javascript
// Ajouter dans server.js si nécessaire
const rateLimit = require('express-rate-limit');

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limite à 100 requêtes par fenêtre
  message: 'Trop de requêtes, réessayez plus tard.'
});

app.use('/api/external/', apiLimiter);
```

## 📈 Bonnes pratiques

### 1. Gestion des erreurs
```javascript
// Toujours vérifier le statut de la réponse
if (result.success && result.error_count === 0) {
    console.log("Toutes les données ont été importées avec succès");
} else if (result.success && result.error_count > 0) {
    console.log("Importation partielle - vérifier les erreurs");
    // Implémenter logique de retry pour les erreurs
} else {
    console.log("Échec complet - vérifier la configuration");
}
```

### 2. Retry automatique
```javascript
async function sendWithRetry(data, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const result = await sendCashBictorysData(data);
            if (result.success) return result;
            
            if (attempt < maxRetries) {
                console.log(`Tentative ${attempt} échouée, retry dans ${attempt * 2}s`);
                await new Promise(resolve => setTimeout(resolve, attempt * 2000));
            }
        } catch (error) {
            if (attempt === maxRetries) throw error;
        }
    }
}
```

### 3. Validation côté client
```javascript
function validateCashBictorysData(data) {
    const errors = [];
    
    if (!Array.isArray(data)) {
        errors.push("Les données doivent être un tableau");
        return errors;
    }
    
    data.forEach((item, index) => {
        if (!item.DATE) {
            errors.push(`Objet ${index + 1}: DATE manquant`);
        }
        if (typeof item.VALEUR !== 'number') {
            errors.push(`Objet ${index + 1}: VALEUR doit être un nombre`);
        }
    });
    
    return errors;
}
```
