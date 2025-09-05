# 🔧 SCRIPT DE CONFIGURATION ET SAUVEGARDE
# Ce script configure automatiquement PostgreSQL et lance la copie

# Fonction pour trouver PostgreSQL
function Find-PostgreSQLPath {
    $possiblePaths = @(
        "C:\Program Files\PostgreSQL\17\bin",
        "C:\Program Files\PostgreSQL\16\bin", 
        "C:\Program Files\PostgreSQL\15\bin",
        "C:\Program Files\PostgreSQL\14\bin",
        "C:\Program Files (x86)\PostgreSQL\17\bin",
        "C:\Program Files (x86)\PostgreSQL\16\bin"
    )
    
    foreach ($path in $possiblePaths) {
        if (Test-Path "$path\psql.exe") {
            return $path
        }
    }
    
    return $null
}

# Configuration des couleurs
function Write-ColorOutput([string]$message, [string]$color = "White") {
    switch ($color) {
        "Green" { Write-Host $message -ForegroundColor Green }
        "Red" { Write-Host $message -ForegroundColor Red }
        "Yellow" { Write-Host $message -ForegroundColor Yellow }
        "Blue" { Write-Host $message -ForegroundColor Blue }
        "Cyan" { Write-Host $message -ForegroundColor Cyan }
        default { Write-Host $message }
    }
}

Write-ColorOutput "🔧 === CONFIGURATION POSTGRESQL ===" "Yellow"

# Trouver PostgreSQL
$pgPath = Find-PostgreSQLPath
if (-not $pgPath) {
    Write-ColorOutput "❌ PostgreSQL non trouvé dans les emplacements standards" "Red"
    Write-ColorOutput "Vérifiez l'installation de PostgreSQL" "Red"
    exit 1
}

Write-ColorOutput "✅ PostgreSQL trouvé: $pgPath" "Green"

# Ajouter au PATH pour cette session
$env:PATH += ";$pgPath"
Write-ColorOutput "✅ PostgreSQL ajouté au PATH" "Green"

# Vérifier que les outils fonctionnent
try {
    $version = & psql --version 2>&1
    Write-ColorOutput "✅ psql version: $version" "Green"
    
    $dumpVersion = & pg_dump --version 2>&1
    Write-ColorOutput "✅ pg_dump version: $dumpVersion" "Green"
}
catch {
    Write-ColorOutput "❌ Erreur lors de la vérification des outils PostgreSQL" "Red"
    exit 1
}

Write-ColorOutput "`n🚀 === LANCEMENT DE LA COPIE ===" "Yellow"

# Configuration de la copie
$PROD_HOST = "dpg-d18i9lemcj7s73ddi0bg-a.frankfurt-postgres.render.com"
$PROD_PORT = "5432"
$PROD_DB = "depenses_management"
$PROD_USER = "depenses_management_user"
$PROD_PASS = "zbigeeX2oCEi5ElEVFZrjN3lEERRnVMu"

$LOCAL_HOST = "localhost"
$LOCAL_PORT = "5432"
$LOCAL_DB = "depenses_management_preprod"
$LOCAL_USER = "zalint"
$LOCAL_PASS = "bonea2024"

# URLs de connexion
$prodUrl = "postgresql://${PROD_USER}:${PROD_PASS}@${PROD_HOST}:${PROD_PORT}/${PROD_DB}"
$localAdminUrl = "postgresql://${LOCAL_USER}:${LOCAL_PASS}@${LOCAL_HOST}:${LOCAL_PORT}/postgres"
$localUrl = "postgresql://${LOCAL_USER}:${LOCAL_PASS}@${LOCAL_HOST}:${LOCAL_PORT}/${LOCAL_DB}"

# Nom du fichier dump
$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$dumpFile = "prod_backup_$timestamp.backup"

try {
    Write-ColorOutput "`n📋 === ÉTAPE 1: CRÉATION DE LA BASE LOCALE ===" "Cyan"
    
    # Supprimer la base si elle existe
    Write-ColorOutput "🗑️ Suppression de la base existante..." "Blue"
    $env:PGPASSWORD = $LOCAL_PASS
    & psql $localAdminUrl -c "DROP DATABASE IF EXISTS $LOCAL_DB;" 2>&1 | Out-Host
    
    # Créer la nouvelle base
    Write-ColorOutput "🆕 Création de la nouvelle base..." "Blue"
    & psql $localAdminUrl -c "CREATE DATABASE $LOCAL_DB WITH ENCODING='UTF8';" 2>&1 | Out-Host
    Write-ColorOutput "✅ Base locale créée avec succès" "Green"
    
    Write-ColorOutput "`n📦 === ÉTAPE 2: DUMP DE LA PRODUCTION ===" "Cyan"
    Write-ColorOutput "🔄 Téléchargement des données de production..." "Blue"
    Write-ColorOutput "📁 Fichier: $dumpFile" "Blue"
    
    # Dump de la production
    $env:PGPASSWORD = $PROD_PASS
    & pg_dump $prodUrl --format=custom --verbose --file=$dumpFile 2>&1 | Out-Host
    
    # Vérifier que le fichier existe
    if (-not (Test-Path $dumpFile)) {
        throw "Le fichier de dump n'a pas été créé"
    }
    
    $fileSize = (Get-Item $dumpFile).Length
    $fileSizeMB = [math]::Round($fileSize / 1MB, 2)
    Write-ColorOutput "✅ Dump terminé ! Taille: $fileSizeMB MB" "Green"
    
    Write-ColorOutput "`n📥 === ÉTAPE 3: RESTAURATION ===" "Cyan"
    Write-ColorOutput "🔄 Restauration des données..." "Blue"
    
    # Restauration
    $env:PGPASSWORD = $LOCAL_PASS
    & pg_restore --dbname=$localUrl --verbose --clean --if-exists $dumpFile 2>&1 | Out-Host
    Write-ColorOutput "✅ Restauration terminée" "Green"
    
    Write-ColorOutput "`n🔍 === ÉTAPE 4: VÉRIFICATION ===" "Cyan"
    
    # Compter les tables
    $tableCount = & psql $localUrl -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>$null
    $tableCount = $tableCount.Trim()
    
    # Compter les utilisateurs
    $userCount = & psql $localUrl -t -c "SELECT COUNT(*) FROM users;" 2>$null
    $userCount = $userCount.Trim()
    
    # Compter les comptes
    $accountCount = & psql $localUrl -t -c "SELECT COUNT(*) FROM accounts;" 2>$null
    $accountCount = $accountCount.Trim()
    
    Write-ColorOutput "`n📊 === RÉSULTATS ===" "Yellow"
    Write-ColorOutput "📋 Tables: $tableCount" "White"
    Write-ColorOutput "👥 Utilisateurs: $userCount" "White" 
    Write-ColorOutput "💰 Comptes: $accountCount" "White"
    
    Write-ColorOutput "`n🎉 === COPIE RÉUSSIE ===" "Green"
    Write-ColorOutput "🗄️ Base locale: $LOCAL_DB" "White"
    Write-ColorOutput "📁 Fichier dump: $dumpFile" "White"
    Write-ColorOutput "`n💡 Votre copie locale est prête pour les tests !" "Cyan"
    
    # Proposer de supprimer le dump
    Write-ColorOutput "`n🗑️ Voulez-vous supprimer le fichier dump pour économiser l'espace ?" "Yellow"
    $response = Read-Host "Tapez 'oui' pour supprimer, 'non' pour garder"
    
    if ($response -eq "oui" -or $response -eq "o" -or $response -eq "y") {
        Remove-Item $dumpFile -Force
        Write-ColorOutput "✅ Fichier dump supprimé" "Green"
    } else {
        Write-ColorOutput "📁 Fichier dump conservé: $dumpFile" "Blue"
    }
    
}
catch {
    Write-ColorOutput "`n💥 === ERREUR ===" "Red"
    Write-ColorOutput $_.Exception.Message "Red"
    
    if (Test-Path $dumpFile) {
        Write-ColorOutput "`n🗑️ Nettoyage du fichier dump..." "Yellow"
        Remove-Item $dumpFile -Force
    }
    
    exit 1
}
finally {
    # Nettoyer les variables d'environnement
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}

Write-ColorOutput "`n✨ === TERMINÉ ===" "Green"
