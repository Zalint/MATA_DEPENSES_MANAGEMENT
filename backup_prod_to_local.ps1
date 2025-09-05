# 🔄 SCRIPT DE SAUVEGARDE PRODUCTION → LOCAL (PowerShell)
# 
# Ce script effectue une copie sécurisée de la base de données de production
# vers un environnement local de préprod sans risquer de corrompre la production.
# 
# PRÉREQUIS:
# 1. PostgreSQL installé avec pg_dump et psql dans le PATH
# 2. Connexion internet pour accéder à la production
# 
# UTILISATION:
# .\backup_prod_to_local.ps1

param(
    [switch]$SkipVerify,
    [switch]$KeepDump,
    [string]$DumpFile = ""
)

# Configuration des bases de données
$PROD_CONFIG = @{
    Host = "dpg-d18i9lemcj7s73ddi0bg-a.frankfurt-postgres.render.com"
    Port = 5432
    Database = "depenses_management"
    User = "depenses_management_user"
    Password = "zbigeeX2oCEi5ElEVFZrjN3lEERRnVMu"
}

$LOCAL_CONFIG = @{
    Host = "localhost"
    Port = 5432
    Database = "depenses_management_preprod"
    User = "zalint"
    Password = "bonea2024"
}

# Couleurs pour l'affichage
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

# Fonction pour exécuter des commandes avec gestion d'erreur
function Invoke-SafeCommand {
    param(
        [string]$Command,
        [string]$Description = "",
        [switch]$ContinueOnError
    )
    
    if ($Description) {
        Write-ColorOutput "📝 $Description" "Cyan"
    }
    
    Write-ColorOutput "🔄 Exécution: $Command" "Blue"
    
    try {
        $result = Invoke-Expression $Command
        if ($LASTEXITCODE -ne 0 -and -not $ContinueOnError) {
            throw "Command failed with exit code $LASTEXITCODE"
        }
        Write-ColorOutput "✅ Succès" "Green"
        return $result
    }
    catch {
        Write-ColorOutput "❌ Erreur: $($_.Exception.Message)" "Red"
        if (-not $ContinueOnError) {
            throw
        }
        return $null
    }
}

# Fonction pour vérifier les prérequis
function Test-Prerequisites {
    Write-ColorOutput "`n🔍 === VÉRIFICATION DES PRÉREQUIS ===" "Yellow"
    
    # Vérifier pg_dump
    try {
        $null = Get-Command pg_dump -ErrorAction Stop
        Write-ColorOutput "✅ pg_dump trouvé" "Green"
    }
    catch {
        Write-ColorOutput "❌ pg_dump non trouvé. Installez PostgreSQL client tools." "Red"
        throw "PostgreSQL client tools required"
    }
    
    # Vérifier psql
    try {
        $null = Get-Command psql -ErrorAction Stop
        Write-ColorOutput "✅ psql trouvé" "Green"
    }
    catch {
        Write-ColorOutput "❌ psql non trouvé. Installez PostgreSQL client tools." "Red"
        throw "PostgreSQL client tools required"
    }
    
    # Test de connexion locale
    Write-ColorOutput "🔌 Test de connexion à la base locale..." "Cyan"
    $env:PGPASSWORD = $LOCAL_CONFIG.Password
    $testCommand = "psql -h $($LOCAL_CONFIG.Host) -p $($LOCAL_CONFIG.Port) -U $($LOCAL_CONFIG.User) -d postgres -c '\q'"
    
    try {
        Invoke-Expression $testCommand | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-ColorOutput "✅ Connexion locale OK" "Green"
        } else {
            throw "Connection failed"
        }
    }
    catch {
        Write-ColorOutput "❌ Impossible de se connecter à PostgreSQL local" "Red"
        Write-ColorOutput "   Vérifiez que PostgreSQL est démarré et accessible" "Yellow"
        throw "Local PostgreSQL connection failed"
    }
    finally {
        Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    }
}

# Fonction pour créer la base de données locale
function New-LocalDatabase {
    Write-ColorOutput "`n🗄️ === CRÉATION DE LA BASE LOCALE ===" "Yellow"
    
    $env:PGPASSWORD = $LOCAL_CONFIG.Password
    $adminUrl = "postgresql://$($LOCAL_CONFIG.User):$($LOCAL_CONFIG.Password)@$($LOCAL_CONFIG.Host):$($LOCAL_CONFIG.Port)/postgres"
    
    try {
        # Supprimer la base si elle existe
        $dropCommand = "psql `"$adminUrl`" -c `"DROP DATABASE IF EXISTS $($LOCAL_CONFIG.Database);`""
        Invoke-SafeCommand $dropCommand "Suppression de la base existante"
        
        # Créer la nouvelle base
        $createCommand = "psql `"$adminUrl`" -c `"CREATE DATABASE $($LOCAL_CONFIG.Database) WITH ENCODING='UTF8';`""
        Invoke-SafeCommand $createCommand "Création de la nouvelle base"
        
        Write-ColorOutput "✅ Base de données locale '$($LOCAL_CONFIG.Database)' créée avec succès !" "Green"
    }
    finally {
        Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    }
}

# Fonction pour faire le dump de la production
function Export-ProductionDatabase {
    Write-ColorOutput "`n📦 === DUMP DE LA BASE DE PRODUCTION ===" "Yellow"
    
    $timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
    if ($DumpFile) {
        $dumpFileName = $DumpFile
    } else {
        $dumpFileName = "prod_backup_$timestamp.sql"
    }
    
    $prodUrl = "postgresql://$($PROD_CONFIG.User):$($PROD_CONFIG.Password)@$($PROD_CONFIG.Host):$($PROD_CONFIG.Port)/$($PROD_CONFIG.Database)"
    
    Write-ColorOutput "🔄 Téléchargement des données de production..." "Cyan"
    Write-ColorOutput "📁 Fichier de sauvegarde: $dumpFileName" "Blue"
    
    # Commande pg_dump sécurisée (lecture seule)
    $dumpCommand = "pg_dump `"$prodUrl`" --no-password --verbose --clean --if-exists --create --format=custom --file=`"$dumpFileName`""
    
    try {
        Invoke-SafeCommand $dumpCommand "Dump de la production"
        
        # Vérifier que le fichier a été créé
        if (-not (Test-Path $dumpFileName)) {
            throw "Le fichier de sauvegarde n'a pas été créé"
        }
        
        $fileSize = (Get-Item $dumpFileName).Length
        $fileSizeMB = [math]::Round($fileSize / 1MB, 2)
        Write-ColorOutput "✅ Dump terminé ! Taille: $fileSizeMB MB" "Green"
        
        return $dumpFileName
    }
    catch {
        Write-ColorOutput "❌ Erreur lors du dump de production: $($_.Exception.Message)" "Red"
        throw
    }
}

# Fonction pour restaurer dans la base locale
function Import-ToLocalDatabase {
    param([string]$DumpFileName)
    
    Write-ColorOutput "`n📥 === RESTAURATION DANS LA BASE LOCALE ===" "Yellow"
    
    $env:PGPASSWORD = $LOCAL_CONFIG.Password
    $localUrl = "postgresql://$($LOCAL_CONFIG.User):$($LOCAL_CONFIG.Password)@$($LOCAL_CONFIG.Host):$($LOCAL_CONFIG.Port)/$($LOCAL_CONFIG.Database)"
    
    try {
        Write-ColorOutput "🔄 Restauration des données..." "Cyan"
        
        # Commande pg_restore
        $restoreCommand = "pg_restore --no-password --verbose --clean --if-exists --dbname=`"$localUrl`" `"$DumpFileName`""
        
        Invoke-SafeCommand $restoreCommand "Restauration des données"
        
        Write-ColorOutput "✅ Restauration terminée avec succès !" "Green"
    }
    finally {
        Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    }
}

# Fonction pour vérifier la copie
function Test-LocalDatabase {
    if ($SkipVerify) {
        Write-ColorOutput "`n⏭️ Vérification ignorée (paramètre -SkipVerify)" "Yellow"
        return
    }
    
    Write-ColorOutput "`n🔍 === VÉRIFICATION DE LA COPIE ===" "Yellow"
    
    $env:PGPASSWORD = $LOCAL_CONFIG.Password
    $localUrl = "postgresql://$($LOCAL_CONFIG.User):$($LOCAL_CONFIG.Password)@$($LOCAL_CONFIG.Host):$($LOCAL_CONFIG.Port)/$($LOCAL_CONFIG.Database)"
    
    try {
        # Compter les tables
        $tablesCommand = "psql `"$localUrl`" -t -c `"SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';`""
        $tableCountResult = Invoke-SafeCommand $tablesCommand -ContinueOnError
        $tableCount = if ($tableCountResult) { $tableCountResult.Trim() } else { "?" }
        
        # Compter les utilisateurs
        $usersCommand = "psql `"$localUrl`" -t -c `"SELECT COUNT(*) FROM users;`""
        $userCountResult = Invoke-SafeCommand $usersCommand -ContinueOnError
        $userCount = if ($userCountResult) { $userCountResult.Trim() } else { "?" }
        
        # Compter les comptes
        $accountsCommand = "psql `"$localUrl`" -t -c `"SELECT COUNT(*) FROM accounts;`""
        $accountCountResult = Invoke-SafeCommand $accountsCommand -ContinueOnError
        $accountCount = if ($accountCountResult) { $accountCountResult.Trim() } else { "?" }
        
        Write-ColorOutput "`n📊 === STATISTIQUES DE LA BASE LOCALE ===" "Cyan"
        Write-ColorOutput "📋 Tables: $tableCount" "White"
        Write-ColorOutput "👥 Utilisateurs: $userCount" "White"
        Write-ColorOutput "💰 Comptes: $accountCount" "White"
        
        if ($tableCount -gt 0 -and $userCount -gt 0) {
            Write-ColorOutput "✅ La copie semble avoir réussi !" "Green"
        } else {
            Write-ColorOutput "⚠️ La copie pourrait être incomplète" "Yellow"
        }
    }
    catch {
        Write-ColorOutput "❌ Erreur lors de la vérification: $($_.Exception.Message)" "Red"
    }
    finally {
        Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    }
}

# Fonction principale
function Start-DatabaseCopy {
    Write-ColorOutput "🚀 === DÉBUT DE LA COPIE PRODUCTION → LOCAL ===`n" "Green"
    
    $startTime = Get-Date
    $dumpFileName = $null
    
    try {
        # Étape 0: Vérifier les prérequis
        Test-Prerequisites
        
        # Étape 1: Créer la base locale
        New-LocalDatabase
        
        # Étape 2: Dump de la production
        $dumpFileName = Export-ProductionDatabase
        
        # Étape 3: Restaurer dans la base locale
        Import-ToLocalDatabase $dumpFileName
        
        # Étape 4: Vérifier la copie
        Test-LocalDatabase
        
        $duration = [math]::Round((Get-Date).Subtract($startTime).TotalSeconds, 2)
        
        Write-ColorOutput "`n🎉 === COPIE TERMINÉE AVEC SUCCÈS ===" "Green"
        Write-ColorOutput "⏱️ Durée: $duration secondes" "White"
        Write-ColorOutput "📁 Fichier de sauvegarde: $dumpFileName" "White"
        Write-ColorOutput "🗄️ Base locale: $($LOCAL_CONFIG.Database)" "White"
        Write-ColorOutput "`n💡 Vous pouvez maintenant utiliser votre copie locale pour les tests !" "Cyan"
        
        # Gestion du fichier dump
        if (-not $KeepDump -and $dumpFileName -and (Test-Path $dumpFileName)) {
            Write-ColorOutput "`n🗑️ Suppression du fichier dump pour économiser l'espace..." "Yellow"
            Remove-Item $dumpFileName -Force
            Write-ColorOutput "✅ Fichier dump supprimé" "Green"
        } elseif ($dumpFileName) {
            Write-ColorOutput "`n📁 Fichier dump conservé: $dumpFileName" "Blue"
            Write-ColorOutput "   Pour le supprimer plus tard: Remove-Item '$dumpFileName'" "Blue"
        }
        
    }
    catch {
        Write-ColorOutput "`n💥 === ERREUR FATALE ===" "Red"
        Write-ColorOutput $_.Exception.Message "Red"
        Write-ColorOutput "`n🔧 Vérifiez que:" "Yellow"
        Write-ColorOutput "   1. PostgreSQL est installé et accessible" "White"
        Write-ColorOutput "   2. Les credentials de connection sont corrects" "White"
        Write-ColorOutput "   3. Vous avez une connexion internet pour la production" "White"
        Write-ColorOutput "   4. L'utilisateur local a les droits pour créer des bases" "White"
        
        exit 1
    }
    finally {
        # Nettoyer les variables d'environnement sensibles
        Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    }
}

# Affichage de l'aide
function Show-Help {
    Write-ColorOutput "🔄 SCRIPT DE SAUVEGARDE PRODUCTION → LOCAL" "Green"
    Write-ColorOutput ""
    Write-ColorOutput "UTILISATION:" "Yellow"
    Write-ColorOutput "  .\backup_prod_to_local.ps1 [OPTIONS]" "White"
    Write-ColorOutput ""
    Write-ColorOutput "OPTIONS:" "Yellow"
    Write-ColorOutput "  -SkipVerify    Ignorer la vérification de la copie" "White"
    Write-ColorOutput "  -KeepDump      Conserver le fichier dump après la copie" "White"
    Write-ColorOutput "  -DumpFile      Nom personnalisé pour le fichier dump" "White"
    Write-ColorOutput "  -Help          Afficher cette aide" "White"
    Write-ColorOutput ""
    Write-ColorOutput "EXEMPLES:" "Yellow"
    Write-ColorOutput "  .\backup_prod_to_local.ps1" "Cyan"
    Write-ColorOutput "  .\backup_prod_to_local.ps1 -KeepDump" "Cyan"
    Write-ColorOutput "  .\backup_prod_to_local.ps1 -DumpFile 'ma_sauvegarde.sql'" "Cyan"
}

# Point d'entrée du script
if ($args -contains "-Help" -or $args -contains "--help" -or $args -contains "/?") {
    Show-Help
    exit 0
}

# Exécution principale
Start-DatabaseCopy
