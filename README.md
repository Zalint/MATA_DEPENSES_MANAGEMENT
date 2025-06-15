# Application de Gestion des Dépenses

Une application web complète pour la gestion des dépenses des directeurs avec tableau de bord en temps réel pour le suivi du cash burn.

## Fonctionnalités

### Pour les Directeurs
- ✅ Connexion sécurisée avec profil directeur
- ✅ Enregistrement quotidien des dépenses avec catégorisation (en FCFA)
- ✅ Consultation de l'historique de leurs dépenses
- ✅ Visualisation de leur portefeuille hebdomadaire

### Pour le Directeur Général et PCA
- ✅ Connexion avec privilèges administrateur
- ✅ Dashboard de suivi en temps réel du cash burn (en FCFA) :
  - Cash burn quotidien
  - Cash burn depuis lundi
  - Cash burn du mois
- ✅ Graphiques de répartition des dépenses par catégorie et par directeur
- ✅ Allocation de budget hebdomadaire pour chaque directeur (en FCFA)
- ✅ Vue globale de toutes les dépenses

## Technologies Utilisées

- **Frontend** : HTML5, CSS3, JavaScript (Vanilla)
- **Backend** : Node.js avec Express
- **Base de données** : PostgreSQL
- **Authentification** : Sessions avec bcrypt pour le hashage des mots de passe
- **Design** : Interface moderne et responsive
- **Monnaie** : Franc CFA (XOF) - montants en entiers

## Installation

### Prérequis
- Node.js (version 14 ou supérieure)
- PostgreSQL (version 12 ou supérieure)
- npm ou yarn

### Étapes d'installation

1. **Cloner ou télécharger le projet**
   ```bash
   cd depenses-management
   ```

2. **Installer les dépendances**
   ```bash
   npm install
   ```

3. **Configurer PostgreSQL**
   - Créer une base de données nommée `depenses_management`
   - Exécuter le script SQL d'initialisation :
   ```bash
   psql -d depenses_management -f database.sql
   ```

4. **Configuration des variables d'environnement (optionnel)**
   Créer un fichier `.env` à la racine du projet :
   ```env
   DB_USER=postgres
   DB_HOST=localhost
   DB_NAME=depenses_management
   DB_PASSWORD=votre_mot_de_passe
   DB_PORT=5432
   PORT=3000
   ```

5. **Démarrer l'application**
   ```bash
   npm start
   ```
   
   Pour le développement avec rechargement automatique :
   ```bash
   npm run dev
   ```

6. **Accéder à l'application**
   Ouvrez votre navigateur et allez sur : `http://localhost:3000`

## Comptes de Test

L'application est livrée avec des comptes de test prêts à utiliser :

### Directeur Général
- **Utilisateur** : `admin`
- **Mot de passe** : `password123`
- **Rôle** : Directeur Général (accès dashboard et gestion portefeuilles)

### PCA
- **Utilisateur** : `pca`
- **Mot de passe** : `password123`
- **Rôle** : Président du Conseil (accès dashboard et gestion portefeuilles)

### Directeurs
- **Utilisateur** : `directeur1` | **Mot de passe** : `password123` | **Nom** : Directeur Commercial
- **Utilisateur** : `directeur2` | **Mot de passe** : `password123` | **Nom** : Directeur Technique
- **Utilisateur** : `directeur3` | **Mot de passe** : `password123` | **Nom** : Directeur Marketing

## Utilisation

### Workflow typique

1. **Le Directeur Général/PCA se connecte** et alloue un budget hebdomadaire à chaque directeur
2. **Les directeurs se connectent** et enregistrent leurs dépenses quotidiennes
3. **Le Directeur Général/PCA consulte** le dashboard pour suivre :
   - Les dépenses du jour
   - Les dépenses depuis lundi
   - Les dépenses du mois
   - La répartition par catégorie et par directeur

### Fonctionnalités détaillées

#### Dashboard (Admin uniquement)
- **Statistiques en temps réel** : Cartes avec les montants de cash burn
- **Graphiques interactifs** : Visualisation des dépenses par catégorie et par directeur
- **Mise à jour automatique** : Les données se rafraîchissent en temps réel

#### Gestion des Dépenses
- **Ajout facile** : Formulaire simple avec catégories prédéfinies
- **Historique complet** : Liste filtrée par date
- **Catégorisation** : 8 catégories prédéfinies (Transport, Repas, Fournitures, etc.)
- **Montants en FCFA** : Saisie en francs CFA sans décimales

#### Gestion des Portefeuilles (Admin uniquement)
- **Allocation hebdomadaire** : Attribution de budget pour la semaine courante en FCFA
- **Suivi des soldes** : Visualisation des budgets initiaux et soldes actuels
- **Mise à jour automatique** : Les soldes se mettent à jour lors des dépenses

## Structure de la Base de Données

### Tables principales
- `users` : Utilisateurs avec rôles (directeur, directeur_general, pca)
- `wallets` : Portefeuilles hebdomadaires des directeurs
- `expenses` : Dépenses enregistrées par les directeurs
- `expense_categories` : Catégories de dépenses prédéfinies

### Sécurité
- Mots de passe hashés avec bcrypt
- Sessions sécurisées
- Contrôle d'accès basé sur les rôles
- Validation des données côté serveur

## API Endpoints

### Authentification
- `POST /api/login` - Connexion
- `POST /api/logout` - Déconnexion
- `GET /api/user` - Informations utilisateur

### Dépenses
- `GET /api/expenses` - Liste des dépenses (filtrées par rôle)
- `POST /api/expenses` - Ajouter une dépense
- `GET /api/categories` - Liste des catégories

### Portefeuilles (Admin uniquement)
- `GET /api/wallets` - Liste des portefeuilles
- `POST /api/wallets` - Créer/Mettre à jour un portefeuille

### Dashboard (Admin uniquement)
- `GET /api/dashboard/stats` - Statistiques pour le dashboard

### Utilisateurs (Admin uniquement)
- `GET /api/users` - Liste des directeurs

## Responsive Design

L'application est entièrement responsive et s'adapte à tous les écrans :
- **Desktop** : Interface complète avec sidebar
- **Tablette** : Adaptation de la mise en page
- **Mobile** : Navigation optimisée et interface tactile

## Support

Pour toute question ou problème, consultez les logs de l'application ou vérifiez :
1. La connexion à la base de données PostgreSQL
2. Les permissions utilisateur dans PostgreSQL
3. La configuration des ports (3000 par défaut)

## Développement

### Scripts disponibles
- `npm start` : Démarrage en production
- `npm run dev` : Démarrage en développement avec nodemon

### Structure du projet
```
depenses-management/
├── public/
│   ├── index.html      # Interface utilisateur
│   ├── styles.css      # Styles CSS
│   └── app.js          # Logique JavaScript
├── server.js           # Serveur Node.js/Express
├── database.sql        # Script d'initialisation DB
├── package.json        # Dépendances et scripts
└── README.md          # Documentation
``` 