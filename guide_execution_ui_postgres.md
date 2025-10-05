# 🚀 Guide d'Exécution du Script SQL dans l'Interface PostgreSQL

## 📝 Étape 1 : Personnalisation du Script

### Variables à Remplacer dans create_complete_database_schema.sql

#### 1. **Utilisateur de Base de Données** (lignes ~1295-1296)
```sql
# CHERCHER :
IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'zalint') THEN
    CREATE ROLE zalint WITH LOGIN PASSWORD 'bonea2024';

# REMPLACER PAR :
IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'VOTRE_UTILISATEUR') THEN
    CREATE ROLE VOTRE_UTILISATEUR WITH LOGIN PASSWORD 'VOTRE_MOT_DE_PASSE';
```

#### 2. **Permissions Utilisateur** (lignes ~1301-1310)
```sql
# CHERCHER toutes les occurrences de "TO zalint" :
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO zalint;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO zalint;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO zalint;
GRANT USAGE ON SCHEMA public TO zalint;
GRANT CREATE ON SCHEMA public TO zalint;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO zalint;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO zalint;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO zalint;

# REMPLACER PAR :
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO VOTRE_UTILISATEUR;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO VOTRE_UTILISATEUR;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO VOTRE_UTILISATEUR;
GRANT USAGE ON SCHEMA public TO VOTRE_UTILISATEUR;
GRANT CREATE ON SCHEMA public TO VOTRE_UTILISATEUR;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO VOTRE_UTILISATEUR;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO VOTRE_UTILISATEUR;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO VOTRE_UTILISATEUR;
```

#### 3. **Messages de Validation** (lignes ~1395-1397)
```sql
# CHERCHER :
RAISE NOTICE 'TARGET DATABASE: matavolaille_db';
RAISE NOTICE 'DATABASE USER: zalint';

# REMPLACER PAR :
RAISE NOTICE 'TARGET DATABASE: VOTRE_NOM_DE_BASE';
RAISE NOTICE 'DATABASE USER: VOTRE_UTILISATEUR';
```

## 📋 Exemple Complet de Personnalisation

### Si vous voulez :
- **Nom de base :** `ma_compta_db`
- **Utilisateur :** `compta_user`
- **Mot de passe :** `MonMotDePasse123`

### Remplacements à effectuer :
1. `zalint` → `compta_user` (toutes les occurrences)
2. `bonea2024` → `MonMotDePasse123`
3. `matavolaille_db` → `ma_compta_db` (dans les messages)

---

## 🎯 Étape 2 : Processus d'Exécution

### A. **Dans pgAdmin**
1. **Se connecter** au serveur PostgreSQL
2. **Créer la base de données :**
   - Clic droit sur "Databases" → "Create" → "Database"
   - Nom : `VOTRE_NOM_DE_BASE`
   - Owner : `postgres` ou votre superuser
3. **Ouvrir Query Tool :**
   - Clic droit sur votre base → "Query Tool"
4. **Charger le script :**
   - Menu "File" → "Open" → Sélectionner `create_complete_database_schema.sql`
5. **Exécuter :** F5 ou bouton "Execute"

### B. **Dans DBeaver**
1. **Se connecter** à PostgreSQL
2. **Créer la base de données :**
   - Clic droit sur "Databases" → "Create New Database"
   - Nom : `VOTRE_NOM_DE_BASE`
3. **Ouvrir SQL Editor :**
   - Clic droit sur votre base → "SQL Editor" → "New SQL Script"
4. **Charger le script :**
   - Copier-coller le contenu de `create_complete_database_schema.sql`
5. **Exécuter :** Ctrl+Enter

### C. **Dans DataGrip/IntelliJ**
1. **Se connecter** à PostgreSQL
2. **Créer la base de données :**
   - Clic droit sur data source → "New" → "Database"
3. **Ouvrir Console :**
   - Clic droit sur votre base → "New" → "Query Console"
4. **Charger et exécuter** le script

---

## ✅ Résultat Attendu

Après exécution réussie, vous devriez voir :
- ✅ 24 tables créées
- ✅ Utilisateur admin créé (login: admin/admin123)
- ✅ Paramètres système configurés
- ✅ Message de succès affiché
