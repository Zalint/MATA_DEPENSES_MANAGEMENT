-- =================================================================
-- SCRIPT DE CORRECTION POUR LA CONTRAINTE VALIDATION_STATUS
-- Problème: Le code utilise 'fully_validated' mais la contrainte n'autorise que 'pending', 'validated', 'rejected'
-- =================================================================

-- Option 1: Modifier la contrainte pour accepter 'fully_validated'
-- =================================================================
DO $$ 
BEGIN
    -- Supprimer l'ancienne contrainte si elle existe
    IF EXISTS (SELECT 1 FROM information_schema.check_constraints 
              WHERE constraint_name = 'chk_expenses_validation_status') THEN
        ALTER TABLE expenses DROP CONSTRAINT chk_expenses_validation_status;
        RAISE NOTICE 'Ancienne contrainte chk_expenses_validation_status supprimée';
    END IF;
    
    -- Ajouter la nouvelle contrainte avec 'fully_validated'
    ALTER TABLE expenses ADD CONSTRAINT chk_expenses_validation_status 
    CHECK (validation_status IN ('pending', 'validated', 'rejected', 'fully_validated'));
    RAISE NOTICE 'Nouvelle contrainte chk_expenses_validation_status ajoutée avec fully_validated';
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Erreur lors de la modification de la contrainte: %', SQLERRM;
END $$;

-- Option 2: Mettre à jour les valeurs existantes 'fully_validated' vers 'validated'
-- =================================================================
-- UPDATE expenses 
-- SET validation_status = 'validated' 
-- WHERE validation_status = 'fully_validated';

-- Vérification
-- =================================================================
SELECT 'Contrainte validation_status corrigée avec succès' as status;

-- Afficher les valeurs distinctes actuelles
SELECT DISTINCT validation_status, COUNT(*) as count
FROM expenses 
GROUP BY validation_status
ORDER BY validation_status; 