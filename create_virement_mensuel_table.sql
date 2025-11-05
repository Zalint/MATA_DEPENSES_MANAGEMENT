-- =====================================================
-- TABLE VIREMENT MENSUEL
-- =====================================================
-- Suivi des virements quotidiens par client avec somme mensuelle
-- Similaire à cash_bictorys mais avec dimension client

CREATE TABLE IF NOT EXISTS virement_mensuel (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL,
    valeur INTEGER NOT NULL DEFAULT 0,
    client VARCHAR(255) NOT NULL,
    month_year VARCHAR(7) NOT NULL, -- Format YYYY-MM
    created_by INTEGER REFERENCES users(id),
    updated_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Contrainte : une seule entrée par date ET par client
    UNIQUE(date, client)
);

-- Index pour optimiser les requêtes
CREATE INDEX IF NOT EXISTS idx_virement_month_year ON virement_mensuel(month_year);
CREATE INDEX IF NOT EXISTS idx_virement_date ON virement_mensuel(date);
CREATE INDEX IF NOT EXISTS idx_virement_client ON virement_mensuel(client);

-- =====================================================
-- MODIFICATION DASHBOARD SNAPSHOTS
-- =====================================================
-- Ajouter la colonne pour stocker les virements du mois dans les snapshots

ALTER TABLE dashboard_snapshots 
ADD COLUMN IF NOT EXISTS virements_mois INTEGER DEFAULT 0;

-- Commentaire pour documentation
COMMENT ON TABLE virement_mensuel IS 'Suivi des virements quotidiens par client. La somme mensuelle impacte le calcul du PL.';
COMMENT ON COLUMN virement_mensuel.valeur IS 'Montant du virement en FCFA';
COMMENT ON COLUMN virement_mensuel.client IS 'Nom du client bénéficiaire du virement';
COMMENT ON COLUMN virement_mensuel.month_year IS 'Mois au format YYYY-MM pour faciliter les requêtes';
COMMENT ON COLUMN dashboard_snapshots.virements_mois IS 'Total des virements du mois capturé dans le snapshot';

-- Afficher les informations de création
SELECT 
    'Table virement_mensuel créée avec succès' as message,
    COUNT(*) as nombre_enregistrements
FROM virement_mensuel;

SELECT 
    'Colonne virements_mois ajoutée à dashboard_snapshots' as message,
    COUNT(*) as nombre_snapshots
FROM dashboard_snapshots;
