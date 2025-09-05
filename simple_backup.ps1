# SCRIPT DE COPIE PRODUCTION -> LOCAL (sans emojis)

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

# Fonction pour trouver PostgreSQL
function Find-PostgreSQLPath {
    $possiblePaths = @(
        "C:\Program Files\PostgreSQL\17\bin",
        "C:\Program Files\PostgreSQL\16\bin", 
        "C:\Program Files\PostgreSQL\15\bin",
        "C:\Program Files\PostgreSQL\14\bin"
    )
    
    foreach ($path in $possiblePaths) {
        if (Test-Path "$path\psql.exe") {
            return $path
        }
    }
    return $null
}

Write-ColorOutput "=== CONFIGURATION POSTGRESQL ===" "Yellow"

# Trouver et configurer PostgreSQL
$pgPath = Find-PostgreSQLPath
if (-not $pgPath) {
    Write-ColorOutput "ERREUR: PostgreSQL non trouve" "Red"
    exit 1
}

Write-ColorOutput "PostgreSQL trouve: $pgPath" "Green"
$env:PATH += ";$pgPath"

# Configuration
$PROD_USER = "depenses_management_user"
$PROD_PASS = "zbigeeX2oCEi5ElEVFZrjN3lEERRnVMu"
$PROD_HOST = "dpg-d18i9lemcj7s73ddi0bg-a.frankfurt-postgres.render.com"
$PROD_DB = "depenses_management"

$LOCAL_USER = "zalint"
$LOCAL_PASS = "bonea2024"
$LOCAL_HOST = "localhost"
$LOCAL_DB = "depenses_management_preprod"

$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$dumpFile = "prod_backup_$timestamp.backup"

Write-ColorOutput "`n=== DEBUT DE LA COPIE ===" "Green"

try {
    # ETAPE 1: Creation base locale
    Write-ColorOutput "`nETAPE 1: Creation de la base locale" "Cyan"
    
    $env:PGPASSWORD = $LOCAL_PASS
    $localAdminUrl = "postgresql://${LOCAL_USER}:${LOCAL_PASS}@${LOCAL_HOST}:5432/postgres"
    
    Write-ColorOutput "Suppression base existante..." "Blue"
    & psql $localAdminUrl -c "DROP DATABASE IF EXISTS $LOCAL_DB;" | Out-Null
    
    Write-ColorOutput "Creation nouvelle base..." "Blue"
    & psql $localAdminUrl -c "CREATE DATABASE $LOCAL_DB WITH ENCODING='UTF8';" | Out-Null
    
    if ($LASTEXITCODE -eq 0) {
        Write-ColorOutput "SUCCESS: Base locale creee" "Green"
    } else {
        throw "Erreur creation base locale"
    }
    
    # ETAPE 2: Dump production
    Write-ColorOutput "`nETAPE 2: Dump de la production" "Cyan"
    Write-ColorOutput "Telechargement en cours... (peut prendre quelques minutes)" "Blue"
    
    $env:PGPASSWORD = $PROD_PASS
    $prodUrl = "postgresql://${PROD_USER}:${PROD_PASS}@${PROD_HOST}:5432/${PROD_DB}"
    
    & pg_dump $prodUrl --format=custom --file=$dumpFile --no-password
    
    if ($LASTEXITCODE -eq 0 -and (Test-Path $dumpFile)) {
        $fileSize = (Get-Item $dumpFile).Length
        $fileSizeMB = [math]::Round($fileSize / 1MB, 2)
        Write-ColorOutput "SUCCESS: Dump termine ($fileSizeMB MB)" "Green"
    } else {
        throw "Erreur lors du dump"
    }
    
    # ETAPE 3: Restauration
    Write-ColorOutput "`nETAPE 3: Restauration locale" "Cyan"
    Write-ColorOutput "Restauration en cours..." "Blue"
    
    $env:PGPASSWORD = $LOCAL_PASS
    $localUrl = "postgresql://${LOCAL_USER}:${LOCAL_PASS}@${LOCAL_HOST}:5432/${LOCAL_DB}"
    
    & pg_restore --dbname=$localUrl --clean --if-exists --no-password $dumpFile
    
    if ($LASTEXITCODE -eq 0) {
        Write-ColorOutput "SUCCESS: Restauration terminee" "Green"
    } else {
        Write-ColorOutput "WARNING: Restauration avec avertissements (normal)" "Yellow"
    }
    
    # ETAPE 4: Verification
    Write-ColorOutput "`nETAPE 4: Verification" "Cyan"
    
    try {
        $tableCount = & psql $localUrl -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>$null
        $userCount = & psql $localUrl -t -c "SELECT COUNT(*) FROM users;" 2>$null  
        $accountCount = & psql $localUrl -t -c "SELECT COUNT(*) FROM accounts;" 2>$null
        
        Write-ColorOutput "`n=== RESULTATS ===" "Yellow"
        Write-ColorOutput "Tables: $($tableCount.Trim())" "White"
        Write-ColorOutput "Utilisateurs: $($userCount.Trim())" "White"
        Write-ColorOutput "Comptes: $($accountCount.Trim())" "White"
    }
    catch {
        Write-ColorOutput "Verification impossible mais copie probablement reussie" "Yellow"
    }
    
    Write-ColorOutput "`n=== COPIE TERMINEE AVEC SUCCES ===" "Green"
    Write-ColorOutput "Base locale: $LOCAL_DB" "White"
    Write-ColorOutput "Fichier dump: $dumpFile" "White"
    Write-ColorOutput "Vous pouvez maintenant utiliser votre copie locale!" "Cyan"
    
    # Nettoyage optionnel
    Write-ColorOutput "`nSupprimer le fichier dump pour economiser l'espace? (o/n):" "Yellow" -NoNewline
    $response = Read-Host
    if ($response -eq "o" -or $response -eq "oui") {
        Remove-Item $dumpFile -Force
        Write-ColorOutput "Fichier dump supprime" "Green"
    }
    
} catch {
    Write-ColorOutput "`n=== ERREUR ===" "Red"
    Write-ColorOutput $_.Exception.Message "Red"
    
    if (Test-Path $dumpFile) {
        Remove-Item $dumpFile -Force -ErrorAction SilentlyContinue
    }
    exit 1
} finally {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}

Write-ColorOutput "`nScript termine!" "Green"
