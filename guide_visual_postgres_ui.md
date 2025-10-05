# 🎯 Guide Visuel : Exécuter le Script SQL dans l'Interface PostgreSQL

## 📋 **MÉTHODE 1 : Utilisation Automatique (Recommandée)**

### Étape 1 : Personnaliser automatiquement le script
```powershell
# Modifier les paramètres dans customize_sql_script.js puis exécuter :
node customize_sql_script.js
```

### Étape 2 : Utiliser le fichier généré dans votre interface PostgreSQL

---

## 🖥️ **MÉTHODE 2 : Interface pgAdmin (Étapes Détaillées)**

### **Étape A : Créer la Base de Données**
1. **Ouvrir pgAdmin**
2. **Se connecter** au serveur PostgreSQL
3. **Créer la base :**
   ```
   Clic droit sur "Databases" 
   → "Create" 
   → "Database..."
   ```
4. **Configuration :**
   - **Database :** `votre_nom_de_base`
   - **Owner :** `postgres`
   - **Encoding :** `UTF8`
   - Cliquer **"Save"**

### **Étape B : Exécuter le Script**
1. **Sélectionner votre base** nouvellement créée
2. **Ouvrir Query Tool :**
   ```
   Clic droit sur votre base 
   → "Query Tool"
   ```
3. **Charger le script :**
   - **Option 1 :** Menu `File` → `Open` → Sélectionner votre fichier SQL
   - **Option 2 :** Copier-coller le contenu du script
4. **Exécuter :**
   - Cliquer sur l'icône **"Execute"** (▶️)
   - Ou appuyer sur **F5**

### **Étape C : Vérification**
✅ Dans l'onglet **"Messages"**, vous devriez voir :
```
NOTICE: 🎉 MATA GROUP DATABASE CREATION COMPLETED SUCCESSFULLY!
NOTICE: 📋 Tables: 24
NOTICE: ✅ Admin user created: username = "admin", password = "admin123"
```

---

## 🔧 **MÉTHODE 3 : Interface DBeaver**

### **Étape A : Créer la Base**
1. **Ouvrir DBeaver**
2. **Se connecter** à PostgreSQL
3. **Créer la base :**
   ```
   Clic droit sur "Databases" 
   → "Create New Database"
   ```
4. **Nom :** `votre_nom_de_base`

### **Étape B : Exécuter le Script**
1. **Clic droit** sur votre base → **"SQL Editor"** → **"New SQL Script"**
2. **Coller** le contenu de votre script SQL personnalisé
3. **Exécuter :** **Ctrl+Enter** ou cliquer sur ▶️

### **Étape C : Vérification des Tables**
1. **Rafraîchir** votre base (F5)
2. **Développer** le nœud "Tables"
3. **Vérifier** la présence des 24 tables

---

## 📊 **MÉTHODE 4 : Interface DataGrip/IntelliJ**

### **Étape A : Configuration**
1. **Data Sources** → **PostgreSQL**
2. **Créer nouvelle base** via console :
   ```sql
   CREATE DATABASE votre_nom_de_base;
   ```

### **Étape B : Exécution**
1. **Clic droit** sur votre base → **"New"** → **"Query Console"**
2. **Coller** le script SQL
3. **Exécuter :** **Ctrl+Enter**

---

## ✅ **Validation du Succès**

### **Après exécution réussie, vérifiez :**

#### 1. **Tables Créées (24 tables attendues) :**
- `users` (Gestion des utilisateurs)
- `accounts` (Comptes financiers)
- `expenses` (Dépenses)
- `credit_history` (Historique crédits)
- `transfer_history` (Transferts)
- `partner_deliveries` (Livraisons partenaires)
- ... et 18 autres tables

#### 2. **Utilisateur Admin Créé :**
```
Login : admin
Mot de passe : admin123
```

#### 3. **Messages de Succès :**
```
🎉 MATA GROUP DATABASE CREATION COMPLETED SUCCESSFULLY!
✅ All tables are EMPTY and ready for data import/usage
✅ Admin user created
✅ Essential settings configured
```

---

## 🛠️ **Résolution de Problèmes Courants**

### **Erreur : "role does not exist"**
**Solution :** Exécuter en tant que superuser (postgres)

### **Erreur : "permission denied"**
**Solution :** 
1. Se connecter comme `postgres`
2. Créer d'abord la base vide
3. Puis exécuter le script

### **Erreur : "database already exists"**
**Solution :**
1. Supprimer la base existante
2. Ou utiliser un nom différent

---

## 🎯 **Résumé des Avantages**

✅ **Script complet** : Tout en un seul fichier  
✅ **Personnalisable** : Paramètres ajustables  
✅ **Sécurisé** : Utilisateur admin créé automatiquement  
✅ **Production-ready** : Toutes les fonctionnalités incluses  
✅ **Compatible** : Fonctionne avec toutes les interfaces PostgreSQL  

---

## 📞 **Support**

En cas de problème :
1. Vérifier que PostgreSQL est démarré
2. Vérifier les permissions utilisateur
3. Consulter les logs d'erreur de l'interface
4. S'assurer que la base de données cible est vide
