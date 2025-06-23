# 🌱 GUIDE DE DÉPLOIEMENT - SYSTÈME STOCK VIVANT

## 📋 Vue d'ensemble

Ce guide décrit le déploiement du nouveau système de gestion du **Stock Vivant** (animaux et aliments) dans l'application MataBanq.

### 🎯 Fonctionnalités principales
- ✅ Gestion complète du stock vivant par catégories (Ovin, Caprin, Bovin, etc.)
- ✅ Système de permissions granulaires par rôle
- ✅ Interface de saisie intuitive avec calculs automatiques
- ✅ Copie de stocks d'une date précédente
- ✅ Gestion des doublons avec confirmation
- ✅ Configuration modifiable des catégories/produits
- ✅ Permissions spéciales pour directeurs simples

### 👥 Accès par rôle
- **Directeur Général** : Accès complet + gestion permissions + configuration
- **PCA** : Accès complet + gestion permissions + configuration  
- **Admin** : Accès complet + gestion permissions + configuration
- **Directeur** : Accès sur autorisation du DG uniquement

---

## 🚀 ÉTAPES DE DÉPLOIEMENT

### 1. Prérequis
```bash
# Vérifier que Node.js et PostgreSQL sont installés
node --version  # >= 14.x
psql --version  # >= 12.x

# S'assurer que l'application est arrêtée
pm2 stop all   # ou la méthode utilisée
```

### 2. Sauvegarde des données
```bash
# Créer une sauvegarde complète de la base
pg_dump depenses_management > backup_before_stock_vivant_$(date +%Y%m%d_%H%M%S).sql

# Sauvegarder les fichiers existants
cp -r public/ backup_public_$(date +%Y%m%d_%H%M%S)/
cp server.js backup_server_$(date +%Y%m%d_%H%M%S).js
```

### 3. Mise à jour de la base de données

#### Étape 3.1 : Créer la table principale
```sql
-- Exécuter le script create_stock_vivant_table.sql
\i create_stock_vivant_table.sql
```

#### Étape 3.2 : Créer le système de permissions
```sql
-- Exécuter le script create_stock_vivant_permissions.sql  
\i create_stock_vivant_permissions.sql
```

#### Étape 3.3 : Vérifier les tables créées
```sql
-- Vérifier la structure
\d stock_vivant
\d stock_vivant_permissions

-- Tester la fonction de permissions
SELECT can_access_stock_vivant(1); -- Remplacer 1 par un ID utilisateur DG
```

### 4. Mise à jour du serveur

#### Étape 4.1 : Ajouter les nouvelles routes
Le fichier `server.js` a été mis à jour avec :
- Middleware `requireStockVivantAuth`
- Routes CRUD pour le stock vivant
- Routes de gestion des permissions
- Routes de configuration

#### Étape 4.2 : Ajouter la configuration JSON
```bash
# Le fichier stock_vivant_config.json doit être présent à la racine
cp stock_vivant_config.json /path/to/app/
```

### 5. Mise à jour du frontend

#### Étape 5.1 : HTML (index.html)
- ✅ Nouveau menu "Stock Vivant" ajouté
- ✅ Section complète avec formulaires et tableaux
- ✅ Gestion des permissions et configuration

#### Étape 5.2 : JavaScript (app.js)  
- ✅ Module complet `STOCK VIVANT MODULE`
- ✅ Intégration dans `showSection()` et `loadInitialData()`
- ✅ Gestion des événements et API calls

#### Étape 5.3 : CSS (styles.css)
- ✅ Styles dédiés pour l'interface stock vivant
- ✅ Design responsive mobile-first
- ✅ Thème cohérent avec l'application

### 6. Tests du système

#### Étape 6.1 : Test automatisé
```bash
# Exécuter le script de test complet
node test_stock_vivant_system.js
```

#### Étape 6.2 : Tests manuels
1. **Connexion et navigation**
   - Se connecter en tant que DG/PCA/Admin
   - Vérifier la présence du menu "Stock Vivant" 
   - Naviguer vers la section

2. **Configuration** (DG/PCA/Admin uniquement)
   - Visualiser la configuration actuelle
   - Modifier et sauvegarder une configuration
   - Vérifier la persistance

3. **Permissions** (DG uniquement)
   - Voir la liste des directeurs disponibles
   - Accorder une permission à un directeur
   - Révoquer une permission
   - Se connecter en tant que directeur autorisé

4. **Gestion des stocks**
   - Créer un nouveau stock pour une date
   - Copier depuis une date existante  
   - Modifier des quantités/prix
   - Sauvegarder et vérifier la gestion des doublons

5. **Consultation**
   - Afficher les stocks par date
   - Filtrer par catégorie
   - Supprimer une entrée

---

## 🔧 CONFIGURATION

### Configuration des catégories (stock_vivant_config.json)

```json
{
  "categories": {
    "Ovin": ["Brebis", "Belier", "Agneau", "NouveauNeMouton", "Ladoum", "Autre"],
    "Caprin": ["Chevere", "Autre"],
    "Bovin": ["Boeuf", "Veau", "Autre"],
    "Cheval": ["Autre"],
    "Ane": ["Autre"],
    "Aliments": ["PailleArachide", "Ripasse", "Panicum", "Luzerne", "Autre"],
    "Autres": ["Autre"]
  },
  "labels": {
    "Ovin": "Ovin",
    "Caprin": "Caprin",
    "Bovin": "Bovin", 
    "Cheval": "Cheval",
    "Ane": "Âne",
    "Aliments": "Aliments",
    "Autres": "Autres",
    "Brebis": "Brebis",
    "Belier": "Bélier",
    "Agneau": "Agneau",
    "NouveauNeMouton": "Nouveau-né Mouton",
    "Ladoum": "Ladoum",
    "Chevere": "Chèvre",
    "Boeuf": "Bœuf",
    "Veau": "Veau",
    "PailleArachide": "Paille d'Arachide",
    "Ripasse": "Ripasse",
    "Panicum": "Panicum",
    "Luzerne": "Luzerne",
    "Autre": "Autre"
  }
}
```

### Variables d'environnement requises

Aucune nouvelle variable d'environnement n'est nécessaire. Le système utilise la même configuration de base de données existante.

---

## 🛡️ SÉCURITÉ & PERMISSIONS

### Matrice des permissions

| Rôle | Consulter | Saisir/Modifier | Config | Permissions |
|------|-----------|-----------------|--------|-------------|
| **Directeur Général** | ✅ | ✅ | ✅ | ✅ |
| **PCA** | ✅ | ✅ | ✅ | ✅ |
| **Admin** | ✅ | ✅ | ✅ | ✅ |
| **Directeur** | ⚠️* | ⚠️* | ❌ | ❌ |
| **Autres** | ❌ | ❌ | ❌ | ❌ |

*⚠️ Uniquement si autorisé par le DG/PCA/Admin*

### Contrôles de sécurité

1. **Authentification** : Session utilisateur requise
2. **Autorisation** : Fonction PostgreSQL `can_access_stock_vivant()`
3. **Validation** : Contrôles côté serveur sur toutes les entrées
4. **Audit** : Timestamps automatiques sur toutes les modifications
5. **Contraintes** : Clés uniques pour éviter les doublons

---

## 📊 SURVEILLANCE & MAINTENANCE

### Requêtes de monitoring

```sql
-- Statistiques générales
SELECT 
    COUNT(*) as total_entries,
    COUNT(DISTINCT date_stock) as unique_dates,
    COUNT(DISTINCT categorie) as categories,
    MAX(date_stock) as latest_date,
    SUM(total) as total_value
FROM stock_vivant;

-- Activité récente
SELECT 
    date_stock,
    categorie,
    COUNT(*) as entries,
    SUM(total) as value
FROM stock_vivant 
WHERE date_stock >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY date_stock, categorie
ORDER BY date_stock DESC;

-- Permissions actives
SELECT 
    u.full_name,
    u.username,
    svp.granted_at,
    ug.full_name as granted_by
FROM stock_vivant_permissions svp
JOIN users u ON svp.user_id = u.id
JOIN users ug ON svp.granted_by = ug.id
WHERE svp.is_active = true;
```

### Maintenance périodique

#### Hebdomadaire
- Vérifier les totaux calculés automatiquement
- Contrôler les permissions accordées

#### Mensuelle  
- Analyser les statistiques d'utilisation
- Vérifier l'intégrité des données

#### Trimestrielle
- Évaluer les performances des requêtes
- Nettoyer les données obsolètes si nécessaire

---

## 🚨 RÉSOLUTION DE PROBLÈMES

### Problèmes courants

#### 1. Menu Stock Vivant invisible
**Cause** : Permissions insuffisantes
**Solution** :
```sql
-- Vérifier le rôle utilisateur
SELECT role FROM users WHERE id = [USER_ID];

-- Vérifier les permissions pour directeur
SELECT * FROM stock_vivant_permissions WHERE user_id = [USER_ID] AND is_active = true;
```

#### 2. Erreur lors de la sauvegarde
**Cause** : Contrainte unique violée
**Solution** : Le système gère automatiquement via confirmation utilisateur

#### 3. Configuration non modifiable
**Cause** : Permissions insuffisantes (DG/PCA/Admin uniquement)
**Solution** : Vérifier le rôle utilisateur

#### 4. Calculs incorrects
**Cause** : Problème JavaScript frontend
**Solution** : Vérifier les fonctions `calculateStockVivantTotal()`

### Logs utiles

```bash
# Logs serveur Node.js (erreurs API)
tail -f logs/server.log | grep "stock-vivant"

# Logs PostgreSQL (erreurs base)
tail -f /var/log/postgresql/postgresql-*.log | grep "stock_vivant"
```

---

## 📝 POST-DÉPLOIEMENT

### Checklist de validation

- [ ] ✅ Tables créées sans erreur
- [ ] ✅ Tests automatisés passent  
- [ ] ✅ Menu visible pour DG/PCA/Admin
- [ ] ✅ Configuration modifiable
- [ ] ✅ Permissions fonctionnelles
- [ ] ✅ Saisie de stock opérationnelle
- [ ] ✅ Copie de stocks fonctionnelle
- [ ] ✅ Consultation/filtrage OK
- [ ] ✅ Design responsive mobile
- [ ] ✅ Pas de régression sur fonctionnalités existantes

### Formation utilisateurs

#### DG/PCA/Admin
1. Présentation de l'interface complète
2. Gestion des permissions pour directeurs  
3. Configuration des catégories/produits
4. Workflow de saisie quotidienne

#### Directeurs autorisés
1. Navigation vers le module
2. Saisie basique de stock
3. Copie depuis dates précédentes
4. Consultation des données

---

## 🔄 ROLLBACK (si nécessaire)

### Procédure de rollback rapide

```bash
# 1. Arrêter l'application
pm2 stop all

# 2. Restaurer les fichiers
cp backup_server_*.js server.js
cp -r backup_public_*/* public/

# 3. Supprimer les nouvelles tables (ATTENTION!)
psql depenses_management -c "DROP TABLE IF EXISTS stock_vivant_permissions CASCADE;"
psql depenses_management -c "DROP TABLE IF EXISTS stock_vivant CASCADE;"
psql depenses_management -c "DROP FUNCTION IF EXISTS can_access_stock_vivant(INTEGER);"

# 4. Redémarrer
pm2 start server.js
```

### Rollback partiel (garder les données)

```bash
# Désactiver seulement le menu frontend
# Modifier public/index.html pour masquer le menu stock-vivant-menu
# Les données restent en base pour réactivation ultérieure
```

---

## ✅ CONCLUSION

Le système Stock Vivant ajoute une fonctionnalité robuste de gestion des animaux et aliments avec :

- **Sécurité** : Contrôle d'accès granulaire par rôle
- **Flexibilité** : Configuration modifiable des catégories
- **Ergonomie** : Interface intuitive et responsive
- **Fiabilité** : Gestion des contraintes et validation complète
- **Audit** : Traçabilité complète des modifications

Le déploiement préserve toutes les fonctionnalités existantes et s'intègre naturellement dans l'écosystème MataBanq.

---

*📞 Support technique : Contactez l'équipe de développement en cas de problème* 