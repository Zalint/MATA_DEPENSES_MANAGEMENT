-- =================================================================
-- SCRIPT POUR AJOUTER LA COLONNE UNIT_PRICE
-- À utiliser sur la base de données locale et Render
-- =================================================================

-- Ajouter la colonne unit_price à la table partner_deliveries
ALTER TABLE partner_deliveries ADD COLUMN IF NOT EXISTS unit_price NUMERIC;

-- Commentaire pour documentation
COMMENT ON COLUMN partner_deliveries.unit_price IS 'Prix unitaire par article pour calcul automatique du montant total';

-- Ajouter un index si nécessaire pour optimiser les requêtes
CREATE INDEX IF NOT EXISTS idx_partner_deliveries_unit_price ON partner_deliveries(unit_price);

-- Notification
SELECT 'Colonne unit_price ajoutée avec succès à la table partner_deliveries' as status; 