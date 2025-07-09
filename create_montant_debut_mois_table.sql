-- Création de la table montant_debut_mois pour gérer les montants de début de mois
-- À exécuter en PRODUCTION

CREATE TABLE IF NOT EXISTS montant_debut_mois (
    id SERIAL PRIMARY KEY,
    account_id INTEGER NOT NULL,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    montant INTEGER NOT NULL DEFAULT 0,
    created_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Contrainte unique pour éviter les doublons
    CONSTRAINT unique_account_month UNIQUE (account_id, year, month),
    
    -- Contrainte de clé étrangère vers la table accounts
    CONSTRAINT fk_montant_debut_account 
        FOREIGN KEY (account_id) 
        REFERENCES accounts(id) 
        ON DELETE CASCADE,
    
    -- Contraintes de validation
    CONSTRAINT valid_month CHECK (month >= 1 AND month <= 12),
    CONSTRAINT valid_year CHECK (year >= 2020 AND year <= 2050)
);

-- Index pour améliorer les performances
CREATE INDEX IF NOT EXISTS idx_montant_debut_account_date 
    ON montant_debut_mois (account_id, year, month);

CREATE INDEX IF NOT EXISTS idx_montant_debut_year_month 
    ON montant_debut_mois (year, month);

-- Commentaires pour documentation
COMMENT ON TABLE montant_debut_mois IS 'Table pour stocker les montants de début de mois par compte';
COMMENT ON COLUMN montant_debut_mois.account_id IS 'ID du compte (référence vers accounts.id)';
COMMENT ON COLUMN montant_debut_mois.year IS 'Année (format YYYY)';
COMMENT ON COLUMN montant_debut_mois.month IS 'Mois (1-12)';
COMMENT ON COLUMN montant_debut_mois.montant IS 'Montant de début de mois en FCFA (centimes)';
COMMENT ON COLUMN montant_debut_mois.created_by IS 'Utilisateur qui a créé l''entrée'; 