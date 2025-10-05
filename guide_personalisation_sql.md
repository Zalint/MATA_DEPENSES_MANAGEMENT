# Guide de Personnalisation du Script SQL

## 🔧 Variables à remplacer dans create_complete_database_schema.sql

### 1. Nom de la base de données
**Rechercher et remplacer :**
```sql
# Ligne ~1396 dans les messages de validation
'TARGET DATABASE: matavolaille_db'
→ 'TARGET DATABASE: votre_nom_de_base'
```

### 2. Utilisateur de base de données  
**Rechercher et remplacer :**
```sql
# Lignes ~1295-1297 - Création du rôle
IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'zalint') THEN
    CREATE ROLE zalint WITH LOGIN PASSWORD 'bonea2024';
→ 
IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'votre_utilisateur') THEN
    CREATE ROLE votre_utilisateur WITH LOGIN PASSWORD 'votre_mot_de_passe';

# Lignes ~1301-1309 - Permissions
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO zalint;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO zalint;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO zalint;
→
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO votre_utilisateur;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO votre_utilisateur;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO votre_utilisateur;
```

### 3. Message de validation
**Rechercher et remplacer :**
```sql
# Ligne ~1397 dans les messages
'DATABASE USER: zalint'
→ 'DATABASE USER: votre_utilisateur'
```

## 🎯 Exemple complet de remplacement

Si vous voulez :
- Base : `ma_comptabilite_db`
- User : `compta_user` 
- Password : `MonMotDePasse2024`

Remplacer :
- `matavolaille_db` → `ma_comptabilite_db`
- `zalint` → `compta_user`
- `bonea2024` → `MonMotDePasse2024`
