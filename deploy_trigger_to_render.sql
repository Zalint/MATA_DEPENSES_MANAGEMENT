-- =========================================================
-- DÉPLOIEMENT TRIGGER SYNCHRONISATION BALANCE → SOLDE BICTORYS AFFICHE
-- Pour exécution sur Render (Production)
-- Date: 05/10/2025
-- =========================================================

-- ÉTAPE 1 : Nettoyer les doublons existants dans special_credit_history
-- =========================================================
DO $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Supprimer les doublons en gardant seulement le plus récent par (account_id, credit_date)
    WITH duplicates AS (
        SELECT id
        FROM (
            SELECT id,
                   ROW_NUMBER() OVER (
                       PARTITION BY account_id, credit_date 
                       ORDER BY created_at DESC, id DESC
                   ) as rn
            FROM special_credit_history
        ) t
        WHERE rn > 1
    )
    DELETE FROM special_credit_history
    WHERE id IN (SELECT id FROM duplicates);
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE '✓ Doublons supprimés: % lignes', deleted_count;
END $$;

-- ÉTAPE 2 : Ajouter la contrainte UNIQUE
-- =========================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_constraint 
        WHERE conname = 'special_credit_history_account_date_unique'
    ) THEN
        ALTER TABLE special_credit_history
        ADD CONSTRAINT special_credit_history_account_date_unique
        UNIQUE (account_id, credit_date);
        
        RAISE NOTICE '✓ Contrainte UNIQUE ajoutée sur (account_id, credit_date)';
    ELSE
        RAISE NOTICE 'ℹ️  Contrainte UNIQUE existe déjà';
    END IF;
END $$;

-- ÉTAPE 3 : Créer la fonction du trigger
-- =========================================================
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
    -- Cela permet d'avoir une trace dans l'historique et d'être pris en compte dans les calculs
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
    ON CONFLICT ON CONSTRAINT special_credit_history_account_date_unique
    DO UPDATE SET
        amount = EXCLUDED.amount,
        comment = EXCLUDED.comment,
        created_at = CURRENT_TIMESTAMP;
    
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

-- ÉTAPE 4 : Supprimer l'ancien trigger s'il existe
-- =========================================================
DROP TRIGGER IF EXISTS trigger_sync_balance_to_solde_courant ON cash_bictorys;
DROP TRIGGER IF EXISTS trigger_sync_balance_to_solde_bictorys ON cash_bictorys;

-- ÉTAPE 5 : Créer le nouveau trigger
-- =========================================================
CREATE TRIGGER trigger_sync_balance_to_solde_bictorys
    AFTER INSERT OR UPDATE ON cash_bictorys
    FOR EACH ROW
    EXECUTE FUNCTION sync_balance_to_solde_bictorys_affiche();

-- ÉTAPE 6 : Synchronisation initiale (mettre à jour avec la dernière valeur)
-- =========================================================
DO $$
DECLARE
    latest_balance DECIMAL(15,2);
    solde_bictorys_affiche_id INTEGER;
    latest_date DATE;
BEGIN
    -- Trouver l'ID du compte
    SELECT id INTO solde_bictorys_affiche_id
    FROM accounts
    WHERE account_name = 'SOLDE BICTORYS AFFICHE'
    AND account_type = 'statut'
    AND is_active = true
    LIMIT 1;
    
    IF solde_bictorys_affiche_id IS NULL THEN
        RAISE NOTICE '❌ Compte SOLDE BICTORYS AFFICHE introuvable';
        RETURN;
    END IF;
    
    -- Récupérer la dernière balance (où amount OU balance > 0)
    SELECT balance, date INTO latest_balance, latest_date
    FROM cash_bictorys
    WHERE date <= CURRENT_DATE
    AND (amount > 0 OR balance > 0)  -- Ignorer seulement si BOTH amount ET balance sont nuls
    ORDER BY date DESC, updated_at DESC
    LIMIT 1;
    
    IF latest_balance IS NULL THEN
        RAISE NOTICE '❌ Aucune balance trouvée dans cash_bictorys';
        RETURN;
    END IF;
    
    -- Créer/mettre à jour l'entrée dans special_credit_history
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
        1,
        latest_balance,
        'Synchronisation automatique depuis cash_bictorys',
        CURRENT_DATE,
        true,
        CURRENT_TIMESTAMP
    )
    ON CONFLICT ON CONSTRAINT special_credit_history_account_date_unique
    DO UPDATE SET
        amount = EXCLUDED.amount,
        comment = EXCLUDED.comment,
        created_at = CURRENT_TIMESTAMP;
    
    -- Mettre à jour current_balance
    UPDATE accounts
    SET 
        current_balance = latest_balance,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = solde_bictorys_affiche_id;
    
    RAISE NOTICE '✅ Synchronisation initiale réussie:';
    RAISE NOTICE '   Date: %', latest_date;
    RAISE NOTICE '   Balance: % FCFA', latest_balance;
    RAISE NOTICE '   Compte ID: %', solde_bictorys_affiche_id;
    RAISE NOTICE '   Transaction créée dans special_credit_history';
END $$;

-- ÉTAPE 7 : Vérification
-- =========================================================
-- Afficher le résultat
SELECT 
    'Trigger installé' as statut,
    trigger_name,
    event_manipulation,
    action_timing
FROM information_schema.triggers
WHERE event_object_table = 'cash_bictorys'
AND trigger_name = 'trigger_sync_balance_to_solde_bictorys';

-- Afficher l'état du compte
SELECT 
    'État du compte SOLDE BICTORYS AFFICHE' as info,
    account_name,
    current_balance,
    updated_at
FROM accounts
WHERE account_name = 'SOLDE BICTORYS AFFICHE';

-- Afficher la dernière transaction créée
SELECT 
    'Dernière transaction créée' as info,
    credit_date,
    amount,
    comment,
    created_at
FROM special_credit_history
WHERE account_id = (SELECT id FROM accounts WHERE account_name = 'SOLDE BICTORYS AFFICHE')
ORDER BY credit_date DESC
LIMIT 1;

-- =========================================================
-- FIN DU DÉPLOIEMENT
-- =========================================================
-- Ce script a installé:
-- ✓ Contrainte UNIQUE sur special_credit_history (account_id, credit_date)
-- ✓ Fonction sync_balance_to_solde_bictorys_affiche()
-- ✓ Trigger trigger_sync_balance_to_solde_bictorys
-- ✓ Synchronisation initiale effectuée
-- 
-- Le trigger se déclenchera automatiquement à chaque INSERT/UPDATE sur cash_bictorys
-- et créera une transaction visible dans l'audit et le Cash disponible.

