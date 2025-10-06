-- =========================================================
-- Ajouter contrainte UNIQUE sur special_credit_history
-- =========================================================
-- Cela permet d'éviter les doublons pour un même compte et une même date
-- et facilite l'upsert dans le trigger

-- 1. Vérifier et supprimer les doublons existants (garder le plus récent)
DO $$
BEGIN
    -- Supprimer les doublons en gardant seulement le plus récent par (account_id, credit_date)
    DELETE FROM special_credit_history
    WHERE id IN (
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
    );
    
    RAISE NOTICE 'Doublons supprimés de special_credit_history';
END $$;

-- 2. Ajouter la contrainte UNIQUE si elle n'existe pas
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
        
        RAISE NOTICE '✅ Contrainte UNIQUE ajoutée sur special_credit_history';
    ELSE
        RAISE NOTICE 'ℹ️  Contrainte UNIQUE existe déjà';
    END IF;
END $$;

-- 3. Maintenant exécuter le script du trigger mis à jour
\i create_sync_balance_trigger.sql

