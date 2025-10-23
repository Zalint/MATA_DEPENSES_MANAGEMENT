# Fonctionnalité AI Analysis - Paragraphe Dépenses et Top 5

## Vue d'ensemble

La fonctionnalité AI Analysis a été enrichie pour générer automatiquement :
1. **Un paragraphe sur les dépenses de la période** analysée
2. **Le top 5 des plus grosses dépenses** avec tous les détails

Ces informations sont générées par le LLM (OpenAI GPT-4) et apparaissent en tête de l'analyse.

## Architecture

### Backend (`server.js`)

#### Endpoint: `/api/ai-analysis`

Le prompt système a été modifié pour demander explicitement au LLM de :

1. **Générer un paragraphe sur les dépenses de la période** contenant :
   - Le nombre total de dépenses enregistrées
   - Le montant total des dépenses
   - Les catégories principales de dépenses

2. **Lister le Top 5 des plus grosses dépenses** avec pour chaque dépense :
   - Description
   - Fournisseur
   - Compte concerné
   - Catégorie
   - Montant

Le LLM reçoit toutes les données financières via l'API `/external/api/status` et analyse les dépenses de tous les comptes (classiques, partenaires, créances, etc.).

### Frontend (`public/ai-analysis.js`)

#### Fonction: `formatAIResponse(text)`

Cette fonction convertit la réponse markdown du LLM en HTML formaté :
- **Titres** : `# Titre` → `<h4>`
- **Listes numérotées** : `1. Item` → `<ol><li>`
- **Listes à puces** : `- Item` → `<ul><li>`
- **Gras** : `**texte**` → `<strong>`
- **Italique** : `*texte*` → `<em>`

### Styles (`public/styles.css`)

Les styles CSS ont été enrichis pour :

#### `.ai-text-response ol li`
- Fond blanc avec ombre légère
- Bordure gauche colorée (#667eea)
- Numérotation circulaire colorée
- Espacement optimal pour la lisibilité

#### `.ai-text-response ul li`
- Puces personnalisées colorées
- Espacement adapté

## Exemple de sortie LLM

```markdown
## Dépenses de la Période

Au cours de la période du 01/10/2025 au 23/10/2025, 2 dépense(s) ont été enregistrées 
pour un montant total de 500 000 FCFA. Les principales dépenses se concentrent sur 
les catégories bovin (achat de boeuf) et frais communs (électricité).

### Top 5 des Plus Grosses Dépenses

1. **Boeuf** - Aly KA | Compte: BOVIN | Catégorie: achatbovin | **475 000 FCFA**

2. **Courant** - Senelec | Compte: COMMERCIAL | Catégorie: electricite | **25 000 FCFA**
```

## Utilisation

1. Naviguer vers la section **AI Analysis** dans l'interface
2. Sélectionner une date unique OU une plage de dates
3. Cliquer sur **"Lancer l'Analyse AI"**
4. Le LLM génère l'analyse complète avec le paragraphe dépenses et le top 5 en premier

## Données analysées

Le LLM analyse les dépenses de tous les types de comptes :
- **Classiques** : BOVIN, OVIN, PRODUCTION, COMMERCIAL, MARKETING
- **Partenaires** : MATA VOLAILLE CHAIR, MATA VOLAILLE OEUFS, AGNEAUX
- **Créances** : CREANCE_DAHRA, CREANCE_LINGUERE, CREANCE_KEUR_MASSAR, CREANCE_ABATS
- **Statut** : SOLDE COURANT BANQUE, BICTORYS ENCOURS

## Configuration

### Variables d'environnement requises

```bash
OPENAI_API_KEY=sk-xxx...
OPENAI_MODEL=gpt-4-turbo-preview  # ou gpt-4, gpt-3.5-turbo
```

### Tokens utilisés

Le prompt système + données financières consomment environ 1500-2500 tokens.
La réponse générée consomme environ 500-1000 tokens.
**Total estimé : ~2000-3500 tokens par analyse**

## Améliorations futures

- [ ] Graphiques visuels pour le top 5 des dépenses
- [ ] Comparaison avec les périodes précédentes
- [ ] Alertes automatiques sur les dépenses anormales
- [ ] Export PDF de l'analyse
- [ ] Analyse prédictive des dépenses futures

## Notes techniques

- Le LLM utilise GPT-4 par défaut (configurable via `OPENAI_MODEL`)
- La température est réglée à 0.7 pour un équilibre entre créativité et précision
- Le max_tokens est limité à 2000 pour optimiser les coûts
- Le système prompt est en anglais, mais le userPrompt demande une réponse en français
