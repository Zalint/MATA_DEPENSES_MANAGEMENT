-- Script simple pour supprimer la contrainte UNIQUE sur user_id
-- Cela permettra à un directeur d'avoir plusieurs comptes

-- Supprimer la contrainte UNIQUE sur user_id (nom le plus courant)
ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_user_id_key;

-- Autres noms possibles de contrainte
ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_user_id_unique;
ALTER TABLE accounts DROP CONSTRAINT IF EXISTS unique_user_id;

-- Vérifier qu'il n'y a plus de contrainte UNIQUE sur user_id
SELECT 
    conname as constraint_name,
    contype as constraint_type
FROM pg_constraint 
WHERE conrelid = 'accounts'::regclass
AND contype = 'u';

SELECT 'Contraintes UNIQUE supprimées avec succès!' as message; 