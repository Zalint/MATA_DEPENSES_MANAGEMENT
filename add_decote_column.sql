-- Ajouter la colonne decote avec une valeur par défaut de 0.20 (20%)
ALTER TABLE stock_vivant 
ADD COLUMN decote numeric(4,2) NOT NULL DEFAULT 0.20;

-- Mettre à jour le total pour tous les enregistrements existants
UPDATE stock_vivant 
SET total = ROUND(quantite * prix_unitaire * (1 - decote));

-- Ajouter un commentaire sur la colonne
COMMENT ON COLUMN stock_vivant.decote IS 'Décote appliquée sur le prix (ex: 0.20 pour 20%)'; 