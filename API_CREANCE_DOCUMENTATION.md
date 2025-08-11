# 🏦 API Créance - Documentation Complète

## 📋 Vue d'ensemble

L'API `/external/api/creance` fournit une analyse complète des portfolios de créance avec intégration OpenAI pour des insights automatisés.

## 🌐 Endpoint

```
GET /external/api/creance
```

### Authentification
- **Clé API requise** : `X-API-Key` header ou `Authorization: Bearer <key>` ou `?api_key=<key>`
- **Rôles autorisés** : Directeur Général, PCA, Admin
- **Variable d'environnement** : `OPENAI_API_KEY` (obligatoire)

## 📊 Paramètres

| Paramètre | Type | Requis | Description | Défaut |
|-----------|------|--------|-------------|---------|
| `date` | string | Non | Date au format YYYY-MM-DD | Aujourd'hui |

### Exemples d'appels

```bash
# Sans date (utilise aujourd'hui)
curl -H "X-API-Key: your-api-key" "https://your-host/external/api/creance"

# Avec date spécifique
curl -H "X-API-Key: your-api-key" "https://your-host/external/api/creance?date=2024-01-25"

# Avec Authorization header
curl -H "Authorization: Bearer your-api-key" "https://your-host/external/api/creance?date=2024-01-25"
```

## 📤 Structure de la Réponse

### Réponse Complète

```json
{
  "summary": {
    "date_selected": "2024-01-25",
    "date_previous": "2024-01-24", 
    "portfolios_count": 3,
    "portfolios": [
      {
        "portfolio_name": "Créances Dakar",
        "portfolio_id": 15,
        "assigned_director": "Mame Diarra NDIAYE",
        "current_balance": 2500000,
        "previous_balance": 2300000,
        "difference": 200000
      }
    ],
    "totals": {
      "current_balance": 7500000,
      "previous_balance": 7200000,
      "total_difference": 300000
    }
  },
  "details": [
    {
      "portfolio_name": "Créances Dakar",
      "portfolio_id": 15,
      "assigned_director": "Mame Diarra NDIAYE",
      "status": [
        {
          "client_name": "Société ABC",
          "credit_initial": 1000000,
          "total_avances": 500000,
          "total_remboursements": 200000,
          "solde_final": 1300000,
          "telephone": "+221 77 123 45 67",
          "adresse": "Dakar, Sénégal"
        }
      ],
      "operations": [
        {
          "date_operation": "2024-01-25",
          "timestamp": "2024-01-25T14:30:00Z",
          "client": "Société ABC",
          "type": "credit",
          "montant": 500000,
          "description": "Crédit initial",
          "created_by": "Mame Diarra NDIAYE"
        }
      ]
    }
  ],
  "ai_insights": {
    "analysis": "Analyse des tendances générées par OpenAI...",
    "model_used": "gpt-3.5-turbo",
    "generated_at": "2024-01-25T15:00:00Z",
    "tokens_used": 250
  },
  "metadata": {
    "generated_at": "2024-01-25T15:00:00Z",
    "openai_integration": "success",
    "api_version": "1.0",
    "year_filter": 2024,
    "total_clients": 25,
    "total_operations": 150
  }
}
```

## 🔍 Description des Sections

### 1. Summary
- **Différence des soldes** entre la date sélectionnée et la date précédente
- **Totaux globaux** pour tous les portfolios
- **Résumé par portfolio** avec directeur assigné

### 2. Details

#### Status (par portfolio)
- **Crédit Initial** : Montant initial accordé au client
- **Total Avances** : Somme des avances accordées
- **Total Remboursements** : Somme des remboursements reçus
- **Solde Final** : Crédit Initial + Total Avances - Total Remboursements
- **Coordonnées** : Téléphone et adresse du client

#### Opérations (par portfolio)
- **Historique** des opérations de l'année courante jusqu'à la date sélectionnée
- **Types d'opérations** : `credit`, `debit`, `advance`
- **Métadonnées** : Date, timestamp, créateur, description

### 3. AI Insights
- **Analyse automatique** générée par OpenAI
- **Tendances** et recommandations
- **Informations techniques** (modèle utilisé, tokens consommés)

## ⚠️ Gestion des Erreurs

### Erreurs d'Authentification
```json
{
  "error": "Clé API invalide",
  "code": "UNAUTHORIZED"
}
```

### Configuration OpenAI Manquante
```json
{
  "error": "Configuration OpenAI manquante",
  "code": "OPENAI_CONFIG_MISSING"
}
```

### Erreur Serveur
```json
{
  "error": "Erreur serveur lors de la génération des données créance",
  "code": "CREANCE_API_ERROR",
  "details": "Message détaillé (en développement uniquement)"
}
```

### AI Insights Indisponibles
```json
{
  "ai_insights": {
    "error": "Analyse automatique temporairement indisponible",
    "error_details": "Détails de l'erreur OpenAI",
    "generated_at": "2024-01-25T15:00:00Z"
  }
}
```

## 🏗️ Types d'Opérations Créance

| Type | Description | Impact sur Solde |
|------|-------------|------------------|
| `credit` | Crédit initial accordé | +Montant |
| `advance` | Avance supplémentaire | +Montant |
| `debit` | Remboursement reçu | -Montant |

## 📈 Calculs Automatiques

### Solde Final Client
```
Solde Final = Crédit Initial + Total Avances - Total Remboursements
```

### Différence Portfolio
```
Différence = Solde Final (Date Sélectionnée) - Solde Final (Date Précédente)
```

## 🔧 Configuration Requise

### Variables d'Environnement
```bash
OPENAI_API_KEY=sk-your-openai-api-key
API_KEY=your-internal-api-key
```

### Base de Données
- Tables requises : `accounts`, `creance_clients`, `creance_operations`, `users`
- Comptes de type `'creance'` dans la table `accounts`

## 📅 Logique des Dates

- **Date par défaut** : Aujourd'hui
- **Date précédente** : Date sélectionnée - 1 jour
- **Filtre année** : Opérations de l'année courante jusqu'à la date sélectionnée
- **Calculs** : Cumuls depuis le début jusqu'à la date spécifiée

## 🎯 Cas d'Usage

### 1. Rapport Quotidien
```bash
# Évolution d'hier à aujourd'hui
curl -H "X-API-Key: key" "/external/api/creance"
```

### 2. Analyse Historique
```bash
# État au 31 décembre vs 30 décembre
curl -H "X-API-Key: key" "/external/api/creance?date=2023-12-31"
```

### 3. Intégration BI
```javascript
const response = await fetch('/external/api/creance?date=2024-01-25', {
  headers: { 'X-API-Key': process.env.API_KEY }
});
const data = await response.json();
```

## 📊 Exemple de Données Retournées

Pour un portfolio "Créances Dakar" avec 2 clients :

### Summary
- **Portfolio** : Créances Dakar (ID: 15)
- **Directeur** : Mame Diarra NDIAYE  
- **Solde actuel** : 2,500,000 FCFA
- **Différence** : +200,000 FCFA vs hier

### Details
**Client 1** : Société ABC
- Crédit Initial : 1,000,000 FCFA
- Total Avances : 500,000 FCFA  
- Total Remboursements : 200,000 FCFA
- **Solde Final** : 1,300,000 FCFA

**Opérations 2024** : 8 opérations (5 crédits, 3 remboursements)

### AI Insights
*"Les créances montrent une croissance stable de 8.7% avec un taux de remboursement satisfaisant de 73%. Le portfolio Dakar surperforme avec +200K FCFA. Recommandation : surveiller les créances > 90 jours."*

## 🚀 Performance

- **Requêtes parallèles** pour optimiser les temps de réponse
- **Cache OpenAI** recommandé pour les environnements à fort trafic  
- **Index database** sur `operation_date`, `account_id`, `client_id`

## 🔒 Sécurité

- Authentification obligatoire par clé API
- Logs détaillés des accès
- Validation des paramètres d'entrée
- Gestion gracieuse des erreurs sans exposition de données sensibles
