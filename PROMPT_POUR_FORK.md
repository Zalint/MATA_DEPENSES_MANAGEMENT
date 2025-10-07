# Correction Urgente - Bug Calcul Soldes Comptes Statut

## 🚨 Problème Critique Identifié

Le calcul des soldes pour les comptes **statut** et **depot** ignore les **transferts**, causant des montants incorrects dans le dashboard.

## 🐛 Symptômes

Si vous avez un compte statut qui reçoit ou émet un transfert, le solde affiché ne tient pas compte de ce transfert.

**Exemple :**
```
Compte STATUT "Solde Courant Banque"
- 03/10 : Snapshot = 100 000 FCFA
- 06/10 : Transfert entrant = 500 000 FCFA

❌ Solde affiché actuellement : 100 000 FCFA (incorrect)
✅ Solde attendu : 500 000 FCFA (correct)
```

## ✅ Solution - Logique Métier à Implémenter

**Règle :** Pour les comptes STATUT, chaque crédit ou transfert entrant **REMPLACE** le solde précédent (ne s'additionne pas).

**Formule :**
```
Solde = Dernier Événement Entrant - Transferts Sortants Postérieurs - Dépenses Postérieures
```

**Événements entrants :** crédits (`credit_history`) + snapshots (`special_credit_history`) + transferts entrants (`transfer_history`)

## 🔧 Action Requise

### Option 1 : Synchroniser le Fork (Recommandé)

```bash
git remote add upstream https://github.com/Zalint/MATA_DEPENSES_MANAGEMENT.git
git fetch upstream
git merge upstream/main  # Ou cherry-pick abcd871
git push origin main
```

### Option 2 : Appliquer Manuellement

Modifier `server.js` dans la fonction `/api/dashboard/stats`, section CASE WHEN 'statut'.

Le code SQL complet est fourni dans le guide détaillé `GUIDE_SYNC_FORK_CORRECTION_STATUT.md`.

## 🧪 Validation Rapide

**Script SQL de diagnostic :**

```sql
-- Vérifier quels comptes sont affectés
SELECT 
    a.id,
    a.account_name,
    a.current_balance as solde_actuel_db,
    (
        SELECT COUNT(*)
        FROM transfer_history th
        WHERE (th.source_id = a.id OR th.destination_id = a.id)
            AND th.created_at > (
                SELECT MAX(created_at)
                FROM special_credit_history 
                WHERE account_id = a.id AND is_balance_override = true
            )
    ) as nb_transferts_ignores
FROM accounts a
WHERE a.account_type IN ('statut', 'depot') 
    AND a.is_active = true
    AND EXISTS (
        SELECT 1 
        FROM transfer_history th 
        WHERE th.source_id = a.id OR th.destination_id = a.id
    )
ORDER BY nb_transferts_ignores DESC;
```

Si `nb_transferts_ignores > 0`, ces comptes sont affectés par le bug.

## 📚 Documentation Complète

Un guide détaillé avec :
- ✅ Explication complète de la logique métier
- ✅ Code SQL à appliquer
- ✅ Scripts de test et validation
- ✅ Exemples concrets
- ✅ Troubleshooting

Est disponible dans : **`GUIDE_SYNC_FORK_CORRECTION_STATUT.md`**

## ⏰ Urgence

- ⚠️ **Impact :** Soldes incorrects dans le dashboard
- 🎯 **Comptes affectés :** Tous les comptes statut/depot avec transferts
- ✅ **Correction testée :** 26/26 tests passés en production
- 🚀 **Temps d'application :** 15-30 minutes

## ✅ Checklist Après Application

- [ ] Code modifié et déployé
- [ ] Serveur redémarré
- [ ] Script de diagnostic exécuté
- [ ] Dashboard vérifié visuellement
- [ ] Utilisateurs informés si soldes changent significativement

---

**Contact :** En cas de question, consulter le guide complet ou contacter l'équipe du repo principal.

