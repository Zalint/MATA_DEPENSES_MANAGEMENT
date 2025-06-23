# 🔐 MataBanq - Guide du Système Administrateur

## 📋 Vue d'ensemble

Le système administrateur de MataBanq permet la gestion avancée des comptes avec sauvegarde automatique. L'administrateur hérite de tous les privilèges du directeur général, plus la capacité de supprimer et vider des comptes.

## 👤 Rôle Administrateur

### Privilèges hérités du directeur général :
- ✅ Créer et gérer tous les comptes
- ✅ Créditer tous les comptes  
- ✅ Voir toutes les dépenses
- ✅ Gérer les utilisateurs
- ✅ Accès aux rapports et tableaux de bord

### Privilèges supplémentaires d'administrateur :
- 🗑️ **Supprimer des comptes** (avec sauvegarde automatique)
- 🔄 **Vider des comptes** (remettre à zéro avec sauvegarde)
- 📊 **Consulter les sauvegardes** d'audit
- 🔍 **Restaurer des données** depuis les sauvegardes JSON

## 🔑 Compte Administrateur par défaut

```
Username: admin
Password: admin123
Email: admin@matagroup.com
Rôle: admin
```

**⚠️ Important :** Changez ce mot de passe après la première connexion !

## 🗄️ Table de Sauvegarde

### Structure `account_backups`

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | SERIAL | ID unique de la sauvegarde |
| `account_name` | VARCHAR(100) | Nom du compte sauvegardé |
| `audit` | JSONB | **Données JSON complètes** du compte |
| `backup_type` | VARCHAR(20) | `DELETE` ou `EMPTY` |
| `backup_reason` | TEXT | Raison de l'opération |
| `original_account_id` | INTEGER | ID du compte original |
| `performed_by` | INTEGER | ID de l'administrateur |
| `backup_date` | TIMESTAMP | Date de la sauvegarde |
| `original_balance` | DECIMAL | Solde avant opération |
| `original_total_credited` | DECIMAL | Total crédité |
| `original_total_spent` | DECIMAL | Total dépensé |
| `movements_count` | INTEGER | Nombre de mouvements sauvegardés |

### Structure JSON d'audit

```json
{
  "account_info": {
    "id": 123,
    "account_name": "Compte Marketing",
    "current_balance": 15000.00,
    "total_credited": 50000.00,
    "total_spent": 35000.00,
    "account_type": "classique",
    "created_at": "2024-01-15T10:30:00Z"
  },
  "credit_history": [
    {
      "id": 456,
      "amount": 25000.00,
      "description": "Crédit initial",
      "credited_by": 1,
      "credited_by_name": "Directeur Général",
      "credit_date": "2024-01-15T10:30:00Z"
    }
  ],
  "expense_history": [
    {
      "id": 789,
      "designation": "Campagne publicitaire",
      "supplier": "Agence XYZ",
      "total": 15000.00,
      "expense_date": "2024-01-20",
      "user_name": "Directeur Marketing"
    }
  ],
  "backup_timestamp": "2024-01-25T14:30:00Z",
  "total_credits": 3,
  "total_expenses": 12
}
```

## 🔧 Fonctions de Base de Données

### 1. `generate_account_audit(account_id)`
Génère la représentation JSON complète d'un compte.

```sql
SELECT generate_account_audit(123);
```

### 2. `admin_delete_account(account_id, admin_user_id, reason)`
Supprime un compte avec sauvegarde complète.

```sql
SELECT admin_delete_account(
    123,                           -- ID du compte
    1,                            -- ID admin
    'Compte inactif depuis 6 mois' -- Raison
);
```

**Retour :**
```json
{
  "success": true,
  "message": "Account deleted and backed up",
  "backup_id": 45,
  "account_name": "Compte Marketing"
}
```

### 3. `admin_empty_account(account_id, admin_user_id, reason)`
Vide un compte (remet à zéro) avec sauvegarde.

```sql
SELECT admin_empty_account(
    123,                          -- ID du compte
    1,                           -- ID admin
    'Nouveau budget pour 2024'   -- Raison
);
```

**Retour :**
```json
{
  "success": true,
  "message": "Account emptied and backed up", 
  "backup_id": 46,
  "account_name": "Compte Marketing",
  "previous_balance": 15000.00
}
```

## 🌐 API Endpoints

### 1. Supprimer un compte
```http
POST /api/admin/accounts/{id}/delete
Authorization: Session (role: admin)
Content-Type: application/json

{
  "reason": "Compte obsolète"
}
```

**Réponse :**
```json
{
  "success": true,
  "message": "Compte 'Marketing' supprimé avec succès",
  "backup_id": 45
}
```

### 2. Vider un compte
```http
POST /api/admin/accounts/{id}/empty
Authorization: Session (role: admin)
Content-Type: application/json

{
  "reason": "Remise à zéro annuelle"
}
```

**Réponse :**
```json
{
  "success": true,
  "message": "Compte 'Marketing' remis à zéro avec succès",
  "backup_id": 46
}
```

### 3. Consulter les sauvegardes
```http
GET /api/admin/backups
Authorization: Session (role: admin)
```

**Réponse :**
```json
{
  "success": true,
  "backups": [
    {
      "id": 46,
      "account_name": "Compte Marketing",
      "backup_type": "EMPTY",
      "backup_reason": "Remise à zéro annuelle",
      "backup_date": "2024-01-25T14:30:00Z",
      "original_balance": 15000.00,
      "movements_count": 15,
      "performed_by_name": "Administrateur Système",
      "days_since_backup": 2
    }
  ]
}
```

## 📋 Procédures d'Installation

### 1. Exécuter le script SQL
```bash
psql -h your-host -d your-database -U your-user -f add_admin_role_and_backup.sql
```

### 2. Ajouter les routes dans server.js
```javascript
const adminEndpoints = require('./admin_endpoints');

app.post('/api/admin/accounts/:id/delete', adminEndpoints.requireAdmin, adminEndpoints.deleteAccount);
app.post('/api/admin/accounts/:id/empty', adminEndpoints.requireAdmin, adminEndpoints.emptyAccount);
app.get('/api/admin/backups', adminEndpoints.requireAdmin, adminEndpoints.getAccountBackups);
```

### 3. Vérification de l'installation
```sql
-- Vérifier que l'admin existe
SELECT username, role, full_name FROM users WHERE role = 'admin';

-- Vérifier les fonctions
SELECT routine_name FROM information_schema.routines 
WHERE routine_name LIKE 'admin_%';

-- Vérifier la table de sauvegarde
SELECT table_name FROM information_schema.tables 
WHERE table_name = 'account_backups';
```

## 🔒 Sécurité

### Contrôles d'accès
- ✅ **Authentification requise** : Session active obligatoire
- ✅ **Vérification du rôle** : Seuls les utilisateurs `admin` peuvent accéder
- ✅ **Validation des paramètres** : IDs et données validés
- ✅ **Audit trail complet** : Chaque action est tracée

### Protections
- 🛡️ **Sauvegarde automatique** : Impossible de perdre des données
- 🛡️ **Transactions atomiques** : Échec = aucune modification
- 🛡️ **Logs détaillés** : Toutes les erreurs sont enregistrées
- 🛡️ **Validation métier** : Vérifications avant suppression

## 📊 Cas d'Usage

### 1. Nettoyage de comptes inactifs
```sql
-- Identifier les comptes sans mouvement depuis 6 mois
SELECT a.id, a.account_name, a.current_balance
FROM accounts a
WHERE a.updated_at < CURRENT_DATE - INTERVAL '6 months'
  AND NOT EXISTS (
    SELECT 1 FROM expenses e WHERE e.account_id = a.id 
    AND e.created_at > CURRENT_DATE - INTERVAL '6 months'
  );

-- Supprimer avec sauvegarde
SELECT admin_delete_account(123, 1, 'Inactif depuis 6 mois');
```

### 2. Remise à zéro annuelle
```sql
-- Vider tous les comptes marketing pour nouveau budget
SELECT admin_empty_account(account_id, 1, 'Budget 2024')
FROM accounts 
WHERE account_name LIKE '%Marketing%';
```

### 3. Récupération de données
```sql
-- Récupérer les données d'un compte supprimé
SELECT audit->'account_info'->>'account_name' as nom,
       audit->'account_info'->>'current_balance' as solde
FROM account_backups 
WHERE backup_type = 'DELETE' 
  AND account_name = 'Ancien Compte';
```

## 🚨 Avertissements Importants

### ⚠️ Suppressions définitives
- **Les comptes supprimés ne peuvent pas être restaurés automatiquement**
- **Seules les données JSON sont conservées dans `account_backups`**
- **Vérifiez toujours avant de supprimer**

### ⚠️ Vidage des comptes
- **Toutes les dépenses et crédits sont supprimés**
- **Le compte reste actif mais avec solde zéro**
- **Utilisez pour les remises à zéro budgétaires**

### ⚠️ Permissions
- **Le rôle admin a un accès total au système**
- **Limitez le nombre d'administrateurs**
- **Surveillez les logs d'activité admin**

## 📈 Maintenance

### Nettoyage des sauvegardes anciennes
```sql
-- Supprimer les sauvegardes de plus d'un an
DELETE FROM account_backups 
WHERE backup_date < CURRENT_DATE - INTERVAL '1 year';
```

### Statistiques des sauvegardes
```sql
SELECT 
    backup_type,
    COUNT(*) as total,
    AVG(movements_count) as avg_movements,
    SUM(original_balance) as total_amount_backed_up
FROM account_backups 
GROUP BY backup_type;
```

## 📞 Support

Pour toute question sur le système administrateur :
1. Consultez les logs d'erreur dans la console serveur
2. Vérifiez les permissions en base de données
3. Contactez l'équipe technique MataBanq

---

**✨ Le système administrateur MataBanq garantit une gestion sécurisée et traçable de tous les comptes !** 