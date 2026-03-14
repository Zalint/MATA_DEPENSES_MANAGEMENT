-- Migration: Ajout de la colonne point_de_vente dans la table expenses
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS point_de_vente TEXT;
