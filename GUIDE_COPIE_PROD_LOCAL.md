# 🔄 GUIDE COMPLET - COPIE BASE PRODUCTION → LOCAL

## 📋 Vue d'ensemble

Ce guide vous explique comment créer une copie locale de votre base de données de production pour les tests et le développement, sans risquer de corrompre l'environnement de production.

### 🎯 Configuration cible

- **Production**: `postgresql://depenses_management_user:***@dpg-d18i9lemcj7s73ddi0bg-a.frankfurt-postgres.render.com/depenses_management`
- **Local**: `localhost:5432/depenses_management_preprod` (user: zalint, pass: bonea2024)

### ⚡ Méthodes disponibles

1. **Script PowerShell** (recommandé pour Windows) - `backup_prod_to_local.ps1`
2. **Script Node.js** (multiplateforme) - `backup_prod_to_local.js`

---

## 🛠️ PRÉREQUIS

### 1. PostgreSQL Client Tools
```bash
# Vérifier que les outils sont installés
pg_dump --version
psql --version
```

**Installation Windows:**
- Télécharger depuis [PostgreSQL.org](https://www.postgresql.org/download/windows/)
- Ou via Chocolatey: `choco install postgresql`
- Ou via Scoop: `scoop install postgresql`

### 2. Connexion locale PostgreSQL
- PostgreSQL server démarré sur localhost:5432
- Utilisateur `zalint` avec mot de passe `bonea2024`
- Droits pour créer des bases de données

### 3. Connexion internet
- Pour accéder à la base de production sur Render

---

## 🚀 MÉTHODE 1: SCRIPT POWERSHELL (Recommandé)

### ✅ Utilisation simple
```powershell
# Copie complète avec vérification
.\backup_prod_to_local.ps1

# Copie rapide sans vérification
.\backup_prod_to_local.ps1 -SkipVerify

# Conserver le fichier de sauvegarde
.\backup_prod_to_local.ps1 -KeepDump

# Nom personnalisé pour la sauvegarde
.\backup_prod_to_local.ps1 -DumpFile "ma_copie_2024.sql"
```

### 📊 Sortie attendue
```
🚀 === DÉBUT DE LA COPIE PRODUCTION → LOCAL ===

🔍 === VÉRIFICATION DES PRÉREQUIS ===
✅ pg_dump trouvé
✅ psql trouvé
✅ Connexion locale OK

🗄️ === CRÉATION DE LA BASE LOCALE ===
📝 Suppression de la base existante
✅ Succès
📝 Création de la nouvelle base
✅ Succès
✅ Base de données locale 'depenses_management_preprod' créée avec succès !

📦 === DUMP DE LA BASE DE PRODUCTION ===
🔄 Téléchargement des données de production...
📁 Fichier de sauvegarde: prod_backup_2024-01-25_14-30-45.sql
✅ Dump terminé ! Taille: 15.67 MB

📥 === RESTAURATION DANS LA BASE LOCALE ===
🔄 Restauration des données...
✅ Restauration terminée avec succès !

🔍 === VÉRIFICATION DE LA COPIE ===
📊 === STATISTIQUES DE LA BASE LOCALE ===
📋 Tables: 25
👥 Utilisateurs: 12
💰 Comptes: 8
✅ La copie semble avoir réussi !

🎉 === COPIE TERMINÉE AVEC SUCCÈS ===
⏱️ Durée: 45.32 secondes
📁 Fichier de sauvegarde: prod_backup_2024-01-25_14-30-45.sql
🗄️ Base locale: depenses_management_preprod

💡 Vous pouvez maintenant utiliser votre copie locale pour les tests !
```

---

## 🚀 MÉTHODE 2: SCRIPT NODE.JS

### ✅ Utilisation
```bash
# Exécution simple
node backup_prod_to_local.js

# Ou avec npm
npm run backup-prod  # (si ajouté dans package.json)
```

### 📦 Fonctionnalités identiques
- Même processus que le script PowerShell
- Compatible Windows/Mac/Linux
- Vérification automatique des prérequis

---

## 🔧 CONFIGURATION DE L'ENVIRONNEMENT LOCAL

### 1. Modifier server.js pour le développement

Créez un fichier `.env.local` :
```env
NODE_ENV=development
DB_HOST=localhost
DB_PORT=5432
DB_NAME=depenses_management_preprod
DB_USER=zalint
DB_PASSWORD=bonea2024
SESSION_SECRET=votre_secret_local
```

### 2. Lancer l'application en mode local
```powershell
# Sauvegarder les variables actuelles
$env:NODE_ENV_BACKUP = $env:NODE_ENV
$env:DB_NAME_BACKUP = $env:DB_NAME

# Configurer pour la base locale
$env:NODE_ENV = "development"
$env:DB_HOST = "localhost"
$env:DB_PORT = "5432"
$env:DB_NAME = "depenses_management_preprod"
$env:DB_USER = "zalint"
$env:DB_PASSWORD = "bonea2024"

# Lancer l'application
node server.js

# Restaurer les variables (après arrêt)
$env:NODE_ENV = $env:NODE_ENV_BACKUP
$env:DB_NAME = $env:DB_NAME_BACKUP
```

---

## ⚠️ SÉCURITÉ ET BONNES PRATIQUES

### ✅ Ce qui est SÉCURISÉ
- ✅ **Lecture seule** de la production via `pg_dump`
- ✅ **Aucune modification** possible sur la prod
- ✅ **Connexions chiffrées** SSL/TLS
- ✅ **Credentials protégés** dans les variables temporaires

### 🚫 ATTENTION
- ⚠️ **Données sensibles** : la copie locale contient les vraies données
- ⚠️ **Mots de passe** : changez les mots de passe en local si nécessaire
- ⚠️ **Espace disque** : les dumps peuvent être volumineux (10-50 MB)

### 🛡️ Recommandations
1. **Supprimez** les fichiers dump après usage
2. **Ne committez jamais** les dumps dans Git
3. **Limitez l'accès** à votre machine de développement
4. **Utilisez** cette copie uniquement pour les tests

---

## 🔍 RÉSOLUTION DE PROBLÈMES

### ❌ "pg_dump non trouvé"
```powershell
# Vérifier l'installation
where.exe pg_dump

# Ajouter au PATH si nécessaire
$env:PATH += ";C:\Program Files\PostgreSQL\16\bin"
```

### ❌ "Connection refused"
```powershell
# Vérifier que PostgreSQL est démarré
Get-Service postgresql*

# Démarrer le service si nécessaire
Start-Service postgresql-x64-16  # (ajustez le nom)
```

### ❌ "Database does not exist"
```sql
-- Créer l'utilisateur local si nécessaire
CREATE USER zalint WITH PASSWORD 'bonea2024';
ALTER USER zalint CREATEDB;
```

### ❌ "Permission denied"
```sql
-- Donner les droits à l'utilisateur
ALTER USER zalint WITH SUPERUSER;
-- ou
GRANT ALL PRIVILEGES ON DATABASE postgres TO zalint;
```

### ❌ "SSL connection error"
```powershell
# Test de connexion manuelle à la production
$env:PGPASSWORD = "zbigeeX2oCEi5ElEVFZrjN3lEERRnVMu"
psql -h dpg-d18i9lemcj7s73ddi0bg-a.frankfurt-postgres.render.com -p 5432 -U depenses_management_user -d depenses_management -c "\q"
```

---

## 📝 COMMANDES UTILES

### 🔄 Mettre à jour la copie locale
```powershell
# Re-lancer la copie (écrasera la base existante)
.\backup_prod_to_local.ps1
```

### 🗑️ Supprimer la base locale
```sql
DROP DATABASE IF EXISTS depenses_management_preprod;
```

### 📊 Vérifier les données copiées
```sql
-- Se connecter à la base locale
psql -h localhost -p 5432 -U zalint -d depenses_management_preprod

-- Vérifier les tables
\dt

-- Compter les enregistrements
SELECT 'users' as table_name, COUNT(*) as count FROM users
UNION
SELECT 'accounts', COUNT(*) FROM accounts
UNION  
SELECT 'expenses', COUNT(*) FROM expenses;

-- Vérifier les derniers comptes créés
SELECT account_name, balance, created_at 
FROM accounts 
ORDER BY created_at DESC 
LIMIT 5;
```

### 🔄 Synchroniser régulièrement
```powershell
# Script pour synchronisation automatique (à programmer)
# Créer une tâche planifiée Windows pour exécuter:
.\backup_prod_to_local.ps1 -SkipVerify
```

---

## 📈 UTILISATION EN DÉVELOPPEMENT

### 1. Tests de nouvelles fonctionnalités
- Utilisez `depenses_management_preprod` pour vos tests
- Testez les modifications sans risque
- Validez les migrations de base de données

### 2. Débogage
- Analysez les données réelles sans affecter la production
- Reproduisez les bugs avec les vraies données
- Testez les corrections en toute sécurité

### 3. Formation
- Formez les utilisateurs sur des données réelles
- Créez des scénarios de test réalistes
- Validez les procédures métier

---

## ✅ CHECKLIST DE SUCCÈS

- [ ] PostgreSQL client tools installés
- [ ] Connexion locale PostgreSQL OK
- [ ] Script PowerShell exécuté sans erreur
- [ ] Base `depenses_management_preprod` créée
- [ ] Données copiées et vérifiées
- [ ] Application locale connectée à la nouvelle base
- [ ] Tests fonctionnels OK
- [ ] Fichiers dump nettoyés (si souhaité)

---

## 🆘 SUPPORT

En cas de problème :

1. **Vérifiez les logs** du script (affichage détaillé)
2. **Testez manuellement** les connexions avec `psql`
3. **Vérifiez les services** PostgreSQL
4. **Contrôlez l'espace disque** disponible
5. **Vérifiez la connectivité** internet pour la production

**Fichiers créés :**
- `backup_prod_to_local.ps1` - Script PowerShell principal
- `backup_prod_to_local.js` - Script Node.js alternatif  
- `GUIDE_COPIE_PROD_LOCAL.md` - Ce guide

**Commande de test rapide :**
```powershell
.\backup_prod_to_local.ps1 -SkipVerify
```

---

**🎉 Votre environnement de développement est maintenant prêt avec une copie fidèle de la production !**
