# Guide de la Gestion des Stocks du Soir

## Vue d'ensemble

La nouvelle fonctionnalité de **Gestion des Stocks du Soir** permet aux utilisateurs privilégiés (Directeur Général, PCA, Admin) de gérer les données de stock par point de vente et par produit.

## Accès à la fonctionnalité

### Utilisateurs autorisés
- **Directeur Général** (`directeur_general`)
- **PCA** (`pca`)
- **Admin** (`admin`)

### Accès au menu
1. Connectez-vous avec un compte autorisé
2. Le menu **"Gestion Stock"** apparaît automatiquement dans la barre latérale
3. Cliquez sur le menu pour accéder à l'interface

## Fonctionnalités disponibles

### 1. Import de fichier JSON de réconciliation

#### Structure JSON attendue
```json
[
  {
    "success": true,
    "data": {
      "date": "18-06-2025",
      "details": {
        "Mbao": {
          "Boeuf": {
            "stockMatin": 336735.33,
            "stockSoir": 86899.44,
            "transferts": 0
          },
          "Poulet": {
            "stockMatin": 176800,
            "stockSoir": 176800,
            "transferts": 0
          }
        }
      }
    }
  }
]
```

#### Règles d'import
- **Produits exclus** : `Bovin` et `Non spécifié` sont automatiquement ignorés
- **Format de date** : DD-MM-YYYY (converti automatiquement en YYYY-MM-DD)
- **Gestion des doublons** : Les entrées existantes sont mises à jour
- **Validation** : Structure JSON vérifiée avant traitement

#### Procédure d'import
1. Cliquez sur **"Choisir un fichier"**
2. Sélectionnez votre fichier JSON
3. Cliquez sur **"Importer les données"** 
4. Vérifiez le message de confirmation avec le nombre d'enregistrements traités

### 2. Gestion manuelle des entrées

#### Ajouter une nouvelle entrée
1. Cliquez sur le bouton **"Ajouter"**
2. Remplissez le formulaire :
   - **Date** : Date de référence
   - **Point de Vente** : Nom du point de vente
   - **Produit** : Type de produit
   - **Stock Matin** : Montant en FCFA
   - **Stock Soir** : Montant en FCFA
   - **Transfert** : Montant en FCFA (peut être négatif)
3. La **Vente Théorique** se calcule automatiquement : `Stock Matin - Stock Soir + Transfert`
4. Cliquez sur **"Ajouter"** pour confirmer

#### Modifier une entrée existante
1. Cliquez sur l'icône **"Modifier"** (crayon) dans la ligne souhaitée
2. Modifiez les champs nécessaires
3. Vérifiez le calcul automatique de la vente théorique
4. Cliquez sur **"Modifier"** pour confirmer

#### Supprimer une entrée
1. Cliquez sur l'icône **"Supprimer"** (corbeille) dans la ligne souhaitée
2. Confirmez la suppression dans la boîte de dialogue
3. L'entrée est définitivement supprimée

### 3. Filtrage et recherche

#### Filtres disponibles
- **Par Date** : Sélectionnez une date spécifique ou "Toutes les dates"
- **Par Point de Vente** : Filtrez par point de vente ou "Tous les points"

#### Utilisation des filtres
1. Sélectionnez vos critères dans les listes déroulantes
2. Cliquez sur **"Filtrer"** pour appliquer
3. Cliquez sur **"Actualiser"** pour recharger toutes les données

### 4. Statistiques par point de vente

#### Affichage des statistiques
1. Cliquez sur le bouton **"Statistiques"**
2. Consultez le tableau récapitulatif qui affiche :
   - **Nombre de produits** par point de vente
   - **Total Stock Matin**
   - **Total Stock Soir**
   - **Total Transfert**
   - **Total Ventes Théoriques**

#### Filtrage des statistiques
- Les statistiques respectent le filtre de date actuel
- Pour voir les stats d'une date spécifique, filtrez d'abord puis affichez les statistiques

## Structure de la base de données

### Table `stock_soir`
```sql
CREATE TABLE stock_soir (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL,
    point_de_vente VARCHAR(100) NOT NULL,
    produit VARCHAR(100) NOT NULL,
    stock_matin DECIMAL(15,2) DEFAULT 0,
    stock_soir DECIMAL(15,2) DEFAULT 0,
    transfert DECIMAL(15,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(date, point_de_vente, produit)
);
```

### Index créés
- `idx_stock_soir_date` : Index sur la date
- `idx_stock_soir_point_vente` : Index sur le point de vente
- `idx_stock_soir_produit` : Index sur le produit
- `idx_stock_soir_date_point` : Index composite date + point de vente
- `idx_stock_soir_unique` : Contrainte unique sur (date, point_de_vente, produit)

## API Endpoints

### Routes disponibles
- `POST /api/stock-soir/upload` : Import de fichier JSON
- `GET /api/stock-soir` : Récupération des données (avec filtres)
- `POST /api/stock-soir` : Ajout d'une nouvelle entrée
- `PUT /api/stock-soir/:id` : Modification d'une entrée
- `DELETE /api/stock-soir/:id` : Suppression d'une entrée
- `GET /api/stock-soir/:id` : Récupération d'une entrée spécifique
- `GET /api/stock-soir/dates` : Liste des dates disponibles
- `GET /api/stock-soir/statistiques` : Statistiques par point de vente

### Authentification
Toutes les routes nécessitent une authentification avec un rôle privilégié (`requireAdminAuth`).

## Calculs automatiques

### Vente Théorique
**Formule** : `Stock Matin - Stock Soir + Transfert`

**Exemples** :
- Stock Matin: 100,000 FCFA, Stock Soir: 20,000 FCFA, Transfert: 5,000 FCFA
- Vente Théorique = 100,000 - 20,000 + 5,000 = **85,000 FCFA**

### Statistiques globales
- **Total Stock Matin** : Somme de tous les stocks du matin
- **Total Stock Soir** : Somme de tous les stocks du soir
- **Total Transfert** : Somme de tous les transferts
- **Total Ventes Théoriques** : Somme de toutes les ventes théoriques calculées

## Gestion des erreurs

### Erreurs courantes
1. **"Fichier JSON invalide"** : Structure JSON incorrecte
2. **"Structure JSON invalide"** : Champs obligatoires manquants
3. **"Une entrée existe déjà"** : Tentative de doublon (même date + point de vente + produit)
4. **"Accès refusé"** : Utilisateur non autorisé

### Résolution
1. Vérifiez la structure de votre fichier JSON
2. Assurez-vous que tous les champs obligatoires sont remplis
3. Vérifiez vos permissions utilisateur
4. Contactez l'administrateur si les problèmes persistent

## Bonnes pratiques

### Import de données
1. **Sauvegardez** vos données avant l'import
2. **Testez** avec un petit fichier d'abord
3. **Vérifiez** les résultats après import
4. **Documentez** les imports effectués

### Saisie manuelle
1. **Vérifiez** les calculs de vente théorique
2. **Utilisez des formats cohérents** pour les noms de points de vente et produits
3. **Soyez précis** avec les montants et dates
4. **Validez** régulièrement les données saisies

### Maintenance
1. **Filtrez par date** pour analyser des périodes spécifiques
2. **Consultez les statistiques** pour détecter des anomalies  
3. **Exportez** régulièrement les données pour archivage
4. **Formez** les utilisateurs aux bonnes pratiques

## Installation et configuration

### Prérequis
- Base de données PostgreSQL configurée
- Serveur Node.js avec Express
- Utilisateur avec rôle privilégié

### Installation
1. Exécutez le script de création de table : `node test_stock_system.js`
2. Redémarrez le serveur
3. Connectez-vous avec un compte autorisé
4. Vérifiez que le menu "Gestion Stock" est visible

## Support et maintenance

### En cas de problème
1. Vérifiez les logs du serveur
2. Consultez la base de données directement si besoin
3. Utilisez les outils de développement du navigateur
4. Contactez l'équipe technique avec les détails de l'erreur

### Mises à jour futures
Cette fonctionnalité peut être étendue avec :
- Export des données vers Excel/CSV
- Graphiques et tableaux de bord
- Alertes automatiques sur les anomalies
- Intégration avec d'autres systèmes 