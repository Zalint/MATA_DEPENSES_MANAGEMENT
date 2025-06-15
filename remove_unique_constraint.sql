-- Script pour permettre à un directeur d'avoir plusieurs comptes
-- Supprime la contrainte UNIQUE sur user_id

-- 1. Trouver le nom de la contrainte UNIQUE
SELECT conname 
FROM pg_constraint 
WHERE conrelid = 'accounts'::regclass 
AND contype = 'u' 
AND array_to_string(conkey, ',') = (
    SELECT attnum::text 
    FROM pg_attribute 
    WHERE attrelid = 'accounts'::regclass 
    AND attname = 'user_id'
);

-- 2. Supprimer la contrainte UNIQUE (remplacez 'constraint_name' par le nom trouvé ci-dessus)
-- Si le nom de la contrainte est 'accounts_user_id_key', utilisez cette commande :
ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_user_id_key;

-- 3. Vérifier que la contrainte a été supprimée
SELECT conname, contype 
FROM pg_constraint 
WHERE conrelid = 'accounts'::regclass;

SELECT 'Contrainte UNIQUE supprimée - Un directeur peut maintenant avoir plusieurs comptes!' as message; 