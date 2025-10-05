# =====================================================
# SCRIPT POWERSHELL DE PERSONNALISATION SQL
# =====================================================
# Ce script personnalise create_complete_database_schema.sql
# pour vos paramètres de base de données
# =====================================================

param(
    [string]$NomBase = "ma_compta_db",
    [string]$Utilisateur = "compta_user", 
    [string]$MotDePasse = "MonMotDePasse123",
    [string]$FichierSortie = "schema_personnalise.sql"
)

Write-Host "🔧 PERSONNALISATION DU SCRIPT SQL MATA DÉPENSES" -ForegroundColor Green
Write-Host "🔧 =============================================" -ForegroundColor Green
Write-Host ""

# Vérifier que le fichier source existe
$FichierSource = "create_complete_database_schema.sql"
if (-not (Test-Path $FichierSource)) {
    Write-Host "❌ Fichier source non trouvé : $FichierSource" -ForegroundColor Red
    Write-Host "💡 Assurez-vous que create_complete_database_schema.sql est dans ce répertoire." -ForegroundColor Yellow
    exit 1
}

Write-Host "📖 Lecture du fichier source : $FichierSource" -ForegroundColor Cyan

# Lire le contenu du fichier
$contenu = Get-Content $FichierSource -Raw

Write-Host "🔄 Application des personnalisations..." -ForegroundColor Yellow
Write-Host ""

# Appliquer les remplacements
$remplacements = @{
    'zalint' = $Utilisateur
    'bonea2024' = $MotDePasse  
    'matavolaille_db' = $NomBase
}

foreach ($remplacement in $remplacements.GetEnumerator()) {
    $ancien = $remplacement.Key
    $nouveau = $remplacement.Value
    
    # Compter les occurrences
    $occurrences = ([regex]::Matches($contenu, [regex]::Escape($ancien))).Count
    
    # Effectuer le remplacement
    $contenu = $contenu -replace [regex]::Escape($ancien), $nouveau
    
    Write-Host "   ✓ $ancien → $nouveau ($occurrences remplacements)" -ForegroundColor Green
}

# Créer l'en-tête personnalisé
$dateActuelle = Get-Date -Format "dd/MM/yyyy HH:mm:ss"
$entete = @"
-- =====================================================
-- SCRIPT SQL PERSONNALISÉ - MATA DÉPENSES MANAGEMENT  
-- =====================================================
-- Généré automatiquement le : $dateActuelle
-- Configuration :
--   - Base de données : $NomBase
--   - Utilisateur DB  : $Utilisateur
--   - Mot de passe    : $MotDePasse
-- 
-- IMPORTANT : Ce script créera automatiquement :
--   - L'utilisateur de base de données avec les permissions
--   - Toutes les tables (24 tables)
--   - L'utilisateur admin (login: admin/admin123)
--   - Les paramètres système
-- =====================================================

"@

$contenuFinal = $entete + $contenu

Write-Host ""
Write-Host "💾 Écriture du fichier personnalisé : $FichierSortie" -ForegroundColor Cyan

# Sauvegarder le fichier personnalisé
$contenuFinal | Out-File -FilePath $FichierSortie -Encoding UTF8

$tailleFichier = [math]::Round((Get-Item $FichierSortie).Length / 1KB, 1)

Write-Host ""
Write-Host "🎉 ====================================================" -ForegroundColor Green
Write-Host "🎉 PERSONNALISATION TERMINÉE AVEC SUCCÈS !" -ForegroundColor Green  
Write-Host "🎉 ====================================================" -ForegroundColor Green
Write-Host "📄 Fichier généré : $FichierSortie" -ForegroundColor White
Write-Host "📊 Taille du fichier : $tailleFichier KB" -ForegroundColor White
Write-Host ""
Write-Host "🚀 PROCHAINES ÉTAPES :" -ForegroundColor Yellow
Write-Host "   1. Ouvrez votre interface PostgreSQL (pgAdmin, DBeaver, etc.)" -ForegroundColor White
Write-Host "   2. Créez une nouvelle base de données nommée : $NomBase" -ForegroundColor White
Write-Host "   3. Ouvrez le Query Editor/SQL Editor" -ForegroundColor White  
Write-Host "   4. Chargez et exécutez le fichier : $FichierSortie" -ForegroundColor White
Write-Host "   5. Connectez-vous avec : admin/admin123" -ForegroundColor White
Write-Host ""
Write-Host "💡 Le script créera automatiquement l'utilisateur '$Utilisateur'" -ForegroundColor Cyan
Write-Host "   avec le mot de passe '$MotDePasse'" -ForegroundColor Cyan
Write-Host ""

# Créer aussi un fichier de connexion pour référence
$ficheConnexion = @"
# =====================================================
# INFORMATIONS DE CONNEXION GÉNÉRÉES
# =====================================================
# Date de génération : $dateActuelle

## Paramètres de Base de Données
- **Nom de la base :** $NomBase
- **Utilisateur DB :** $Utilisateur  
- **Mot de passe DB :** $MotDePasse

## Utilisateur Admin de l'Application
- **Login :** admin
- **Mot de passe :** admin123

## Fichier SQL à Exécuter
- **Fichier :** $FichierSortie

## Instructions d'Exécution
1. Créer la base '$NomBase' dans PostgreSQL
2. Exécuter le fichier '$FichierSortie' dans cette base
3. Se connecter à l'application avec admin/admin123

# =====================================================
"@

$ficheConnexion | Out-File -FilePath "connexion_$NomBase.md" -Encoding UTF8

Write-Host "📝 Fiche de connexion créée : connexion_$NomBase.md" -ForegroundColor Green
Write-Host ""
