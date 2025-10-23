# 🚀 DÉPLOIEMENT RÔLE COMPTABLE - PRODUCTION RENDER

## ✅ Code Déployé

**Commit**: `2626fed` - feat: Ajout du rôle Comptable et génération de factures partenaires  
**Branche**: `main`  
**Date**: 2025-01-10  
**Status**: ✅ Tous les tests de régression passés (26/26)

---

## 📋 ÉTAPE 1 : Exécuter le Script SQL sur Render

Connectez-vous à votre base de données Render et exécutez le script suivant :

### Script SQL à exécuter :

```sql
-- =====================================================
-- AJOUT DU RÔLE COMPTABLE
-- =====================================================

DO $$
BEGIN
    -- Drop existing role check constraint if it exists
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints 
               WHERE constraint_name = 'users_role_check' AND table_name = 'users') THEN
        ALTER TABLE users DROP CONSTRAINT users_role_check;
        RAISE NOTICE 'Dropped existing users_role_check constraint';
    END IF;
    
    -- Add updated constraint with comptable role
    ALTER TABLE users ADD CONSTRAINT users_role_check 
    CHECK (role IN ('directeur', 'directeur_general', 'pca', 'admin', 'comptable'));
    
    RAISE NOTICE 'Added comptable role to users_role_check constraint';
END $$;

-- Verification
SELECT 'Comptable role added successfully!' as message;
SELECT column_name, data_type, character_maximum_length
FROM information_schema.columns 
WHERE table_name = 'users' AND column_name = 'role';
```

### 🔧 Comment exécuter sur Render :

1. **Via Render Dashboard** :
   - Allez sur https://dashboard.render.com
   - Sélectionnez votre base de données PostgreSQL
   - Cliquez sur "Connect" → "External Connection"
   - Utilisez un client PostgreSQL (psql, pgAdmin, DBeaver) avec les credentials fournis

2. **Via Render Shell** (si disponible) :
   - Dans votre service web Render
   - Ouvrez le Shell
   - Connectez-vous à PostgreSQL et exécutez le script

3. **Copier-coller le script SQL ci-dessus** dans votre client PostgreSQL

---

## 📊 ÉTAPE 2 : Vérifier le Déploiement Render

1. **Vérifier que Render a détecté le push** :
   - Allez sur https://dashboard.render.com
   - Vérifiez que votre service web affiche "Deploy in progress"
   - Attendez que le déploiement soit complet (statut "Live")

2. **Vérifier les logs de déploiement** :
   ```
   ==> Building...
   ==> Installing dependencies...
   ==> Starting server...
   ==> Application running on port...
   ```

3. **Tester l'application** :
   - Accédez à votre URL Render (ex: https://votre-app.onrender.com)
   - Vérifiez que l'application se charge correctement

---

## 🧪 ÉTAPE 3 : Tests Post-Déploiement

### Test 1 : Créer un utilisateur comptable

1. **Connexion Admin** :
   - Connectez-vous avec un compte admin
   - Allez dans "Gérer les Utilisateurs"

2. **Créer un comptable** :
   - Nom d'utilisateur : `test_comptable`
   - Nom complet : `Test Comptable`
   - Rôle : **Comptable** (devrait apparaître dans la liste)
   - Mot de passe temporaire : `test123`
   - Cliquez sur "Créer l'utilisateur"

3. **Vérifier la création** :
   - L'utilisateur devrait être créé sans erreur 400
   - Le rôle "Comptable" devrait être affiché dans le tableau

### Test 2 : Connexion en tant que comptable

1. **Déconnexion** de l'admin
2. **Connexion** avec `test_comptable` / `test123`
3. **Vérifier l'interface** :
   - ✅ Seul le menu "Mes Dépenses" devrait être visible
   - ❌ Tous les autres menus sont masqués (Tableau de bord, Suivi Partenaires, Gestion Stock, etc.)
   - ✅ L'utilisateur est redirigé automatiquement vers "Mes Dépenses"

### Test 3 : Vérifier les restrictions en lecture seule

1. **Dans "Mes Dépenses"** :
   - ✅ Les dépenses devraient être affichées
   - ❌ Les boutons "Modifier" et "Supprimer" ne devraient PAS être visibles
   - ❌ Impossible d'ajouter, modifier ou supprimer une dépense

---

## 📦 Modifications Incluses

### 1. **Rôle Comptable** ✨
   - Nouveau rôle avec accès en lecture seule
   - Interface simplifiée (uniquement "Mes Dépenses")
   - Protection serveur via middleware `requireWriteAccess`

### 2. **Factures Partenaires** 🧾
   - Génération de factures PDF pour les livraisons partenaires
   - Sélection période (mois en cours ou plage personnalisée)
   - Corrections encodage (caractères spéciaux français)
   - Corrections formatage nombres (espaces au lieu de "/")

### 3. **Améliorations Diverses** 🔧
   - Validation des rôles dans les endpoints admin
   - Masquage automatique des menus selon le rôle
   - Redirection automatique vers "Mes Dépenses" pour les comptables

---

## 🗂️ Fichiers Modifiés

| Fichier | Modifications |
|---------|---------------|
| `server.js` | • Ajout validation rôle 'comptable' dans endpoints admin<br>• Corrections encodage PDF factures partenaires<br>• Amélioration formatage nombres |
| `public/app.js` | • Détection rôle comptable<br>• Application mode comptable<br>• Redirection automatique |
| `public/index.html` | • Ajout classe `comptable-hide` aux menus<br>• Option "Comptable" dans dropdowns |
| `public/styles.css` | • Règle CSS pour masquer menus en mode comptable |
| `add_comptable_role.sql` | • Script SQL pour mise à jour contrainte base de données |
| `add_comptable_role.js` | • Script Node.js pour exécution locale du SQL |

---

## ✅ Checklist de Déploiement

- [x] Code pushé vers `origin/main`
- [x] Tests de régression passés (26/26)
- [ ] Script SQL exécuté sur base de données Render
- [ ] Déploiement Render terminé (statut "Live")
- [ ] Test création utilisateur comptable
- [ ] Test connexion et interface comptable
- [ ] Test restrictions lecture seule

---

## 🆘 Dépannage

### Problème : "Rôle invalide" lors de la création

**Solution** : Vérifiez que le script SQL a bien été exécuté sur Render :
```sql
SELECT constraint_name, check_clause 
FROM information_schema.check_constraints 
WHERE constraint_name = 'users_role_check';
```
Le résultat devrait inclure `'comptable'`

### Problème : Menus toujours visibles pour comptable

**Solution** : 
1. Videz le cache du navigateur (Ctrl + Shift + Del)
2. Déconnectez-vous et reconnectez-vous
3. Vérifiez que le rôle dans la base de données est bien `'comptable'` (minuscules)

### Problème : Déploiement Render en erreur

**Solution** : 
1. Vérifiez les logs Render
2. Assurez-vous que toutes les dépendances sont dans `package.json`
3. Vérifiez que le port est correctement configuré

---

## 📞 Support

En cas de problème, vérifiez :
1. ✅ Le script SQL a été exécuté sans erreur
2. ✅ Le déploiement Render est "Live"
3. ✅ L'application répond sur l'URL de production
4. ✅ Les logs ne montrent pas d'erreurs

---

**Date de création** : 2025-01-10  
**Version** : 1.0  
**Auteur** : Mata Depenses Management Team

