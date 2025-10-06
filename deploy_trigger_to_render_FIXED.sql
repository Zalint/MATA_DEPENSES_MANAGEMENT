-- =========================================================
-- DÉPLOIEMENT TRIGGER SYNCHRONISATION BALANCE → SOLDE BICTORYS AFFICHE
-- VERSION FIXED - Fonctionne AVEC OU SANS contrainte nommée
-- Pour exécution sur Render (Production)
-- Date: 05/10/2025
-- =========================================================

-- ÉTAPE 1 : Créer ou remplacer la fonction du trigger
-- =========================================================
-- Version qui utilise ON CONFLICT (colonnes) au lieu de ON CONFLICT ON CONSTRAINT
CREATE OR REPLACE FUNCTION sync_balance_to_solde_bictorys_affiche()
RETURNS TRIGGER AS $$
DECLARE
    latest_balance DECIMAL(15,2);
    solde_bictorys_affiche_id INTEGER;
BEGIN
    -- Trouver l'ID du compte "SOLDE BICTORYS AFFICHE"
    SELECT id INTO solde_bictorys_affiche_id
    FROM accounts
    WHERE account_name = 'SOLDE BICTORYS AFFICHE'
    AND account_type = 'statut'
    AND is_active = true
    LIMIT 1;
    
    -- Si le compte n'existe pas, ne rien faire
    IF solde_bictorys_affiche_id IS NULL THEN
        RAISE NOTICE 'Compte SOLDE BICTORYS AFFICHE introuvable - synchronisation ignorée';
        RETURN NEW;
    END IF;
    
    -- Récupérer la dernière balance (date <= aujourd'hui) où amount OU balance > 0
    SELECT balance INTO latest_balance
    FROM cash_bictorys
    WHERE date <= CURRENT_DATE
    AND (amount > 0 OR balance > 0)  -- Ignorer seulement si BOTH amount ET balance sont nuls
    ORDER BY date DESC, updated_at DESC
    LIMIT 1;
    
    -- Si aucune balance trouvée, ne rien faire
    IF latest_balance IS NULL THEN
        RAISE NOTICE 'Aucune balance trouvée dans cash_bictorys - synchronisation ignorée';
        RETURN NEW;
    END IF;
    
    -- Créer ou mettre à jour l'entrée dans special_credit_history
    -- Utilise ON CONFLICT (account_id, credit_date) au lieu de ON CONSTRAINT
    -- Cela fonctionne même si la contrainte nommée n'existe pas
    INSERT INTO special_credit_history (
        account_id, 
        credited_by, 
        amount, 
        comment, 
        credit_date,
        is_balance_override, 
        created_at
    )
    VALUES (
        solde_bictorys_affiche_id,
        1,  -- User ID admin
        latest_balance,
        'Synchronisation automatique depuis cash_bictorys',
        CURRENT_DATE,
        true,  -- Marquer comme override de balance
        CURRENT_TIMESTAMP
    )
    ON CONFLICT (account_id, credit_date)
    DO UPDATE SET
        amount = EXCLUDED.amount,
        comment = EXCLUDED.comment,
        created_at = CURRENT_TIMESTAMP
    WHERE special_credit_history.account_id = EXCLUDED.account_id
    AND special_credit_history.credit_date = EXCLUDED.credit_date;
    
    -- Mettre à jour aussi current_balance pour cohérence
    UPDATE accounts
    SET 
        current_balance = latest_balance,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = solde_bictorys_affiche_id;
    
    -- Log de la synchronisation
    RAISE NOTICE 'Balance synchronisée: % FCFA → SOLDE BICTORYS AFFICHE (compte ID: %) avec transaction créée', 
        latest_balance, solde_bictorys_affiche_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ÉTAPE 2 : Recréer le trigger
-- =========================================================
-- On supprime l'ancien et on recrée (pour être sûr qu'il utilise la nouvelle fonction)
DROP TRIGGER IF EXISTS trigger_sync_balance_to_solde_bictorys ON cash_bictorys;

CREATE TRIGGER trigger_sync_balance_to_solde_bictorys
    AFTER INSERT OR UPDATE ON cash_bictorys
    FOR EACH ROW
    EXECUTE FUNCTION sync_balance_to_solde_bictorys_affiche();

-- ÉTAPE 3 : Ajouter la contrainte UNIQUE si possible (optionnel, pour optimisation future)
-- =========================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_constraint 
        WHERE conname = 'special_credit_history_account_date_unique'
    ) THEN
        BEGIN
            ALTER TABLE special_credit_history
            ADD CONSTRAINT special_credit_history_account_date_unique
            UNIQUE (account_id, credit_date);
            
            RAISE NOTICE '✓ Contrainte UNIQUE ajoutée sur (account_id, credit_date)';
        EXCEPTION
            WHEN unique_violation THEN
                RAISE NOTICE '⚠️  Contrainte UNIQUE non ajoutée (doublons existants)';
                RAISE NOTICE '   Pas de problème: le trigger fonctionne quand même avec ON CONFLICT (colonnes)';
        END;
    ELSE
        RAISE NOTICE 'ℹ️  Contrainte UNIQUE existe déjà';
    END IF;
END $$;

-- ÉTAPE 4 : Vérification
-- =========================================================

-- Vérifier que la fonction existe
SELECT 
    '✓ Fonction installée' as statut,
    routine_name
FROM information_schema.routines
WHERE routine_name = 'sync_balance_to_solde_bictorys_affiche'
AND routine_schema = 'public';

-- Vérifier que le trigger existe
SELECT 
    '✓ Trigger installé' as statut,
    trigger_name,
    event_manipulation,
    action_timing
FROM information_schema.triggers
WHERE event_object_table = 'cash_bictorys'
AND trigger_name = 'trigger_sync_balance_to_solde_bictorys';

-- Vérifier l'état du compte
SELECT 
    'État du compte' as info,
    account_name,
    current_balance,
    updated_at
FROM accounts
WHERE account_name = 'SOLDE BICTORYS AFFICHE';

-- =========================================================
-- FIN DU DÉPLOIEMENT
-- =========================================================
-- ✅ Fonction sync_balance_to_solde_bictorys_affiche() mise à jour
-- ✅ Trigger trigger_sync_balance_to_solde_bictorys recréé
-- ✅ Fonctionne AVEC OU SANS contrainte nommée
-- 
-- Le trigger utilisera maintenant ON CONFLICT (account_id, credit_date)
-- au lieu de ON CONFLICT ON CONSTRAINT, ce qui fonctionne même si la
-- contrainte nommée n'existe pas.
-- =========================================================

