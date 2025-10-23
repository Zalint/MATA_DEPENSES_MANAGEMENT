# AI Analysis Feature - Documentation

## Vue d'ensemble

Le module d'Analyse AI utilise OpenAI (GPT-4) pour analyser automatiquement les données financières du système de gestion des dépenses Mata Group et fournir des insights intelligents.

## Architecture

```
Frontend (public/ai-analysis.js)
    ↓
Backend API (/api/ai-analysis)
    ↓
External API (/external/api/status) → Récupère les données financières
    ↓
OpenAI API (GPT-4) → Analyse les données
    ↓
Résultat structuré → Affiché dans l'interface
```

## Configuration

### 1. Variables d'environnement (.env)

```env
# OpenAI API Configuration
OPENAI_API_KEY=sk-proj-your_openai_key_here
OPENAI_MODEL=gpt-4-turbo-preview  # ou gpt-4, gpt-3.5-turbo
AI_ANALYSIS_ENABLED=true
```

### 2. Modèles OpenAI disponibles

- **gpt-4-turbo-preview** : Recommandé - Meilleur équilibre qualité/coût
- **gpt-4** : Plus précis mais plus coûteux
- **gpt-3.5-turbo** : Plus rapide et moins cher, mais moins précis

## Utilisation

### Interface utilisateur

1. Accéder au **Tableau de bord de Suivi**
2. Faire défiler jusqu'à la section **Analyse AI Financière**
3. Choisir le mode d'analyse :
   - **Date unique** : Analyse pour une date spécifique
   - **Période** : Analyse sur une plage de dates
4. Cliquer sur **Lancer l'Analyse AI**

### Résultats fournis

L'analyse AI génère automatiquement :

1. **Résumé Exécutif** : Vue d'ensemble de la santé financière (2-3 phrases)
2. **Métriques Clés** : 
   - Cash Disponible
   - Balance du Mois
   - Cash Burn
   - PL (Profit & Loss)
3. **Insights & Alertes** : 
   - Problèmes critiques détectés
   - Risques de trésorerie
   - Anomalies
4. **Analyse par Compte** :
   - Performance des comptes classiques
   - État des créances
   - Soldes partenaires
5. **Recommandations Actionnables** : 
   - Actions prioritaires à prendre
   - Optimisations suggérées

## API Endpoint

### GET `/api/ai-analysis`

**Paramètres** :
- `selected_date` (optionnel) : Date unique au format YYYY-MM-DD
- `start_date` et `end_date` (optionnel) : Plage de dates

**Exemple** :
```bash
GET /api/ai-analysis?selected_date=2025-01-15
GET /api/ai-analysis?start_date=2025-01-01&end_date=2025-01-31
```

**Réponse** :
```json
{
  "success": true,
  "data": {
    "financial_data": { /* Données financières brutes */ },
    "ai_analysis": "Analyse textuelle générée par l'AI...",
    "metadata": {
      "model": "gpt-4-turbo-preview",
      "tokens_used": 1523,
      "analysis_date": "2025-01-15T10:30:00Z"
    }
  }
}
```

## Contexte Métier fourni à l'AI

L'AI reçoit le contexte suivant sur Mata Group :

- **Secteur** : Distribution de viande et volaille au Sénégal
- **Points de vente** : Dahra, Linguere, Keur Massar, Mbao, Ouest Foire, Sacré Coeur
- **Produits** : Bœuf, agneau, poulet, œufs
- **Types de comptes** :
  - Classiques (dépenses opérationnelles)
  - Créances (gestion crédit clients)
  - Partenaires (comptes fournisseurs volaille)
  - Statut (indicateurs financiers)
  - Dépôt (réserves)

## Coûts estimés

Basé sur les prix OpenAI (janvier 2025) :

| Modèle | Prix par analyse* | Cas d'usage |
|--------|------------------|-------------|
| GPT-4 Turbo | ~$0.03 - $0.06 | Production recommandée |
| GPT-4 | ~$0.10 - $0.15 | Maximum de précision |
| GPT-3.5 Turbo | ~$0.002 - $0.005 | Tests/développement |

*Basé sur ~2000 tokens par analyse

## Sécurité

- ✅ Authentification requise (`requireAuth`)
- ✅ Clé API stockée dans `.env` (jamais exposée au frontend)
- ✅ Appels API via le backend uniquement
- ✅ Session cookies forwarded pour l'authentification

## Dépannage

### Erreur : "OPENAI_API_KEY not found"
- Vérifier que `.env` contient `OPENAI_API_KEY=sk-proj-...`
- Redémarrer le serveur après modification du `.env`

### Erreur : "Insufficient quota"
- Vérifier le quota/crédit OpenAI : https://platform.openai.com/usage
- Ajouter des crédits à votre compte OpenAI

### Analyse incomplète ou de mauvaise qualité
- Essayer un modèle plus puissant (GPT-4 au lieu de GPT-3.5)
- Augmenter `max_tokens` dans `server.js` (actuellement 2000)

## Développement futur

Améliorations possibles :
- [ ] Cache des analyses pour éviter les appels répétés
- [ ] Export PDF des analyses
- [ ] Analyse comparative (mois vs mois)
- [ ] Alertes automatiques par email
- [ ] Graphiques générés par l'AI
- [ ] Support multi-langues (EN/FR)

## Support

Pour toute question :
- Consulter la documentation OpenAI : https://platform.openai.com/docs
- Vérifier les logs serveur : `console.log` préfixés par 🤖
