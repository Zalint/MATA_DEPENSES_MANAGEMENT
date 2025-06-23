-- =================================================================
-- SCRIPT DE CORRECTION POUR RENDER
-- Supprime la fonction PostgreSQL problématique
-- =================================================================

-- Supprimer la fonction handle_special_credit qui cause l'erreur
DROP FUNCTION IF EXISTS handle_special_credit(integer, integer, integer, text, date);

-- Message de confirmation
SELECT 'Fonction handle_special_credit supprimée - système de crédit corrigé' as status; 