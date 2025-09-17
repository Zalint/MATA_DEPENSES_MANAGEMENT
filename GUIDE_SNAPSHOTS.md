# 📸 SYSTÈME DE SNAPSHOTS - GUIDE D'UTILISATION

## 🎯 Vue d'ensemble

Le système de snapshots permet de sauvegarder l'état complet de l'application à un moment donné et de consulter l'historique en mode lecture seule.

## ✨ Fonctionnalités

### 📋 Données sauvegardées dans chaque snapshot :
- **Dashboard complet** : Toutes les cartes et statistiques
- **Dépenses** : Historique complet depuis l'inception jusqu'à la date de snapshot
- **Créances** : Récapitulatif clients et historique des opérations
- **Comptes Partenaires** : Suivi complet avec détails des livraisons
- **Cash Bictorys** : Données mensuelles
- **Transferts** : Historique des transferts entre comptes

### 🔧 Fonctionnalités techniques :
- **Un snapshot par jour** : Si refait le même jour, écrase l'existant
- **Formats de date français** : DD-MM-YYYY, DD/MM/YYYY, DD/MM/YY, YYYY-MM-DD
- **Stockage organisé** : `uploads/snapshots/YYYY-MM-DD/`
- **Mode lecture seule** : Navigation dans l'historique sans modification
- **Interface intuitive** : Menu historique avec visualisation par onglets

## 🚀 Comment utiliser

### 1. Accéder au menu Historique
- Dans la navigation principale, section "SUIVI & TABLEAU DE BORD"
- Cliquer sur "Historique" (icône historique)

### 2. Créer un nouveau snapshot
- **Date de référence** : Optionnelle (défaut = aujourd'hui)
- Cliquer sur "Créer un Snapshot"
- Le système collecte toutes les données et crée le fichier JSON

### 3. Consulter les snapshots
- **Liste des snapshots** : Affichage en cartes avec date, taille, créateur
- **Visualisation** : Interface à onglets (Dashboard, Dépenses, Créances, Partenaires)
- **Navigation** : Onglets pour explorer les différentes sections

### 4. Gestion des snapshots
- **Voir** : Consultation en mode lecture seule
- **Supprimer** : Suppression définitive (admin uniquement)
- **Actualiser** : Recharger la liste

## 🔒 Permissions

- **Création de snapshots** : Admin uniquement (`requireAdminAuth`)
- **Consultation** : Tous les utilisateurs connectés (`requireAuth`)
- **Suppression** : Admin uniquement (`requireAdminAuth`)

## 📁 Structure des fichiers

```
uploads/snapshots/
├── 2025-09-17/
│   ├── snapshot.json       # Données complètes
│   └── metadata.json      # Métadonnées (taille, créateur, etc.)
├── 2025-09-16/
│   ├── snapshot.json
│   └── metadata.json
└── ...
```

## 🗂️ Contenu du snapshot JSON

```json
{
  "metadata": {
    "snapshot_date": "2025-09-17",
    "creation_timestamp": "...",
    "snapshot_date_fr": "17/09/2025",
    "period_label": "Du 01/09/2025 au 17/09/2025",
    "created_by": 1,
    "created_by_username": "admin",
    "version": "1.0"
  },
  "dashboard": {
    "stats_cards": { ... },
    "accounts_details": [ ... ],
    "transferts": [ ... ],
    "depenses_categories": [ ... ]
  },
  "depenses": {
    "toutes_depenses": [ ... ],
    "summary": { ... }
  },
  "creances": {
    "recapitulatif_clients": [ ... ],
    "historique_operations": [ ... ]
  },
  "comptes_partenaires": {
    "comptes": [ ... ],
    "livraisons": [ ... ]
  }
}
```

## 🔄 API Endpoints

### POST `/api/snapshots/create` (Admin)
```json
{
  "cutoff_date": "2025-09-17" // Optionnel
}
```

### GET `/api/snapshots` (Auth)
Liste tous les snapshots disponibles

### GET `/api/snapshots/:date` (Auth)
Lit un snapshot spécifique (date au format YYYY-MM-DD)

### DELETE `/api/snapshots/:date` (Admin)
Supprime un snapshot définitivement

## 💡 Cas d'usage

### 📊 Audit et conformité
- Sauvegarder l'état financier à des dates clés
- Conserver des preuves pour les audits
- Traçabilité des opérations

### 📈 Analyse temporelle
- Comparer les performances entre différentes périodes
- Analyser l'évolution des comptes partenaires
- Suivre les tendances de dépenses

### 🔍 Investigation
- Analyser l'état de l'application à une date précise
- Identifier les causes de variations
- Vérifier la cohérence des données

### 📋 Reporting
- Générer des rapports historiques
- Présenter l'évolution aux parties prenantes
- Documenter les décisions financières

## ⚠️ Bonnes pratiques

1. **Fréquence** : Créer un snapshot par jour ouvré minimum
2. **Dates clés** : Snapshots obligatoires en fin de mois/trimestre
3. **Conservation** : Garder au moins 3 mois d'historique
4. **Vérification** : Contrôler la cohérence après chaque snapshot
5. **Espace disque** : Surveiller la taille des fichiers (~ 1-5 MB par snapshot)

## 🔧 Maintenance

- **Nettoyage automatique** : Prévoir une purge des anciens snapshots
- **Sauvegarde** : Inclure le dossier snapshots dans les backups
- **Monitoring** : Surveiller les échecs de création
- **Performance** : La création peut prendre 10-30 secondes selon la taille des données

## 🚨 En cas de problème

1. **Erreur de création** : Vérifier les permissions du dossier uploads
2. **Timeout** : Augmenter les timeouts pour les gros volumes de données
3. **Espace disque** : Libérer de l'espace ou purger les anciens snapshots
4. **Corruption** : Les métadonnées permettent de détecter les fichiers corrompus
