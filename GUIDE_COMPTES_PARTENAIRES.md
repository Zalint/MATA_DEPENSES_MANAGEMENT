# Guide des Comptes Partenaires - Système de Suivi des Livraisons

## Vue d'ensemble

Le système de gestion des comptes partenaires permet de suivre les montants alloués aux partenaires et de tracker leur conversion en livraisons de stock/produits au fil du temps.

## Nouvelles Règles des Comptes Partenaires

### Permissions et Accès

1. **Visibilité** : Tous les utilisateurs peuvent voir les comptes partenaires
2. **Créditer un compte** : Seul le Directeur Général (DG) peut créditer les comptes partenaires
3. **Effectuer des dépenses** : Seuls le DG et maximum 2 directeurs assignés peuvent effectuer des dépenses
4. **Ajouter des livraisons** : Seuls le DG et les directeurs assignés peuvent ajouter des livraisons
5. **Valider les livraisons** : Seul le DG peut valider les livraisons

## Fonctionnalités Principales

### 1. Résumé des Comptes Partenaires

Le tableau de bord affiche pour chaque compte partenaire :
- **Compte** : Nom du compte partenaire
- **Montant Total** : Montant total crédité au compte
- **Livré** : Montant total des livraisons validées
- **Restant** : Solde disponible (Total - Livré)
- **Articles** : Nombre total d'articles livrés
- **Progression** : Barre de progression avec pourcentage de livraison
- **Actions** : Bouton pour voir les détails

### 2. Suivi des Livraisons

#### Ajouter une Livraison

Pour enregistrer une livraison de stock/produits :

1. Cliquez sur **"Détails"** pour un compte partenaire
2. Remplissez le formulaire :
   - **Date de Livraison** : Date effective de la livraison
   - **Nombre d'Articles** : Quantité d'articles livrés
   - **Montant (FCFA)** : Valeur monétaire de la livraison
   - **Description** : Description détaillée des articles livrés

3. Cliquez sur **"Ajouter la Livraison"**

> **Note** : Les livraisons sont créées avec le statut "En attente" et nécessitent une validation du DG.

#### Validation des Livraisons

**Pour les DG uniquement :**

1. Dans la liste des livraisons, cliquez sur **"Valider"** 
2. Confirmez la validation
3. Le montant sera automatiquement déduit du solde du compte
4. La livraison passera au statut "Validée"

### 3. Configuration des Directeurs (Admin)

**Pour les DG et PCA uniquement :**

1. Dans la section "Configuration des Directeurs Partenaires"
2. Pour chaque compte partenaire :
   - Sélectionnez jusqu'à 2 directeurs dans les listes déroulantes
   - Cliquez sur **"Mettre à jour"**
3. Les directeurs assignés apparaîtront avec des badges verts

## Interface de Suivi

### Navigation

- **Menu principal** → **"Suivi Partenaires"**

### Sections Disponibles

1. **Résumé des Livraisons** : Vue d'ensemble de tous les comptes partenaires
2. **Détails du Compte** : Gestion des livraisons pour un compte spécifique
3. **Configuration des Directeurs** : Attribution des permissions (Admin uniquement)

## Workflow Typique

### Pour un Directeur Assigné :

1. **Consulter le résumé** des comptes partenaires
2. **Sélectionner un compte** dont vous êtes responsable
3. **Ajouter une livraison** quand des articles sont fournis
4. **Attendre la validation** du DG

### Pour le Directeur Général :

1. **Créditer les comptes** partenaires selon les besoins
2. **Assigner des directeurs** aux comptes partenaires
3. **Valider les livraisons** soumises par les directeurs
4. **Suivre la progression** globale des livraisons

## Exemple d'Utilisation

### Scenario : Partenariat avec un Fournisseur

1. **Initialisation** :
   - DG crédite le compte "Partenaire ABC" avec 1,000,000 FCFA
   - DG assigne les directeurs Jean et Marie au compte

2. **Première Livraison** :
   - Jean ajoute une livraison : 50 articles pour 300,000 FCFA
   - Description : "Ordinateurs portables - Commande janvier"
   - Statut : En attente

3. **Validation** :
   - DG valide la livraison
   - Solde du compte : 700,000 FCFA restants
   - Progression : 30% (300k/1000k)

4. **Suivi** :
   - Le tableau de bord montre la progression en temps réel
   - Historique complet des livraisons disponible

## Avantages du Système

### Transparence
- Suivi précis des montants alloués vs livrés
- Historique complet des livraisons
- Statuts clairs (En attente/Validé)

### Contrôle
- Validation obligatoire par le DG
- Permissions granulaires par compte
- Audit trail complet

### Pilotage
- Progression visuelle des livraisons
- Tableaux de bord en temps réel
- Identification rapide des écarts

## Notifications et États

### États des Livraisons
- **En attente** : Livraison créée, attend validation
- **Validée** : Livraison confirmée, montant déduit

### Messages d'Autorisation
- Affichage automatique des permissions pour chaque utilisateur
- Blocage des actions non autorisées avec explication

## Support et Maintenance

### En cas de Problème
1. Vérifiez vos permissions (directeur assigné ?)
2. Contactez le DG pour les validations
3. Consultez l'historique pour tracer les opérations

### Bonnes Pratiques
- Descriptions détaillées des livraisons
- Validation rapide par le DG
- Mise à jour régulière des assignations

---

*Ce guide sera mis à jour selon l'évolution du système et les retours utilisateurs.* 