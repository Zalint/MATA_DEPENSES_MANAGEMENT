# 🔍 Script de Diagnostic Authentification Snapshot

Write-Host "🔍 DIAGNOSTIC AUTHENTIFICATION SNAPSHOT PRODUCTION" -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Green
Write-Host ""

$API_KEY = "4f8d9a2b6c7e8f1a3b5c9d0e2f4g6h7i"
$PROD_URL = "https://mata-depenses-management.onrender.com"

# Test 1: Vérifier que le serveur répond
Write-Host "1️⃣  TEST: Serveur accessible..." -ForegroundColor Cyan
try {
    $healthCheck = Invoke-WebRequest -Uri "$PROD_URL" -Method GET -TimeoutSec 10
    Write-Host "   ✅ Serveur PROD accessible (Status: $($healthCheck.StatusCode))" -ForegroundColor Green
} catch {
    Write-Host "   ❌ Serveur PROD inaccessible: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Test 2: Tenter création snapshot pour diagnostiquer l'erreur
Write-Host "2️⃣  TEST: Création snapshot (diagnostic)..." -ForegroundColor Cyan
try {
    $body = @{ cutoff_date = (Get-Date).ToString("yyyy-MM-dd") } | ConvertTo-Json
    
    $response = Invoke-WebRequest -Uri "$PROD_URL/external/api/snapshots/create" -Method POST -Headers @{
        "X-API-Key" = $API_KEY
        "Content-Type" = "application/json"
    } -Body $body -TimeoutSec 60
    
    $data = $response.Content | ConvertFrom-Json
    
    if ($data.success) {
        Write-Host "   ✅ SNAPSHOT CRÉÉ AVEC SUCCÈS !" -ForegroundColor Green
        Write-Host "   🎉 L'authentification fonctionne parfaitement !" -ForegroundColor Green
    } else {
        Write-Host "   ❌ Échec snapshot: $($data.error)" -ForegroundColor Red
    }
    
} catch {
    $errorMsg = $_.Exception.Message
    Write-Host "   ❌ ERREUR: $errorMsg" -ForegroundColor Red
    
    # Analyser les erreurs courantes
    if ($errorMsg -like "*Could not find Chrome*") {
        Write-Host "   🔧 DIAGNOSTIC: Chrome non installé - Le postinstall a échoué" -ForegroundColor Yellow
        Write-Host "   💡 SOLUTION: Redéployer le service sur Render" -ForegroundColor Cyan
    }
    elseif ($errorMsg -like "*Accès refusé*" -or $errorMsg -like "*Privilèges insuffisants*") {
        Write-Host "   🔧 DIAGNOSTIC: Problème d'authentification HTML" -ForegroundColor Yellow
        Write-Host "   💡 SOLUTION: Vérifier SNAPSHOT_USERNAME et SNAPSHOT_PASSWORD sur Render" -ForegroundColor Cyan
        Write-Host "   📋 Variables requises:" -ForegroundColor White
        Write-Host "      SNAPSHOT_USERNAME=Saliou" -ForegroundColor White
        Write-Host "      SNAPSHOT_PASSWORD=Murex2015" -ForegroundColor White
    }
    elseif ($errorMsg -like "*timeout*") {
        Write-Host "   🔧 DIAGNOSTIC: Timeout réseau ou serveur surchargé" -ForegroundColor Yellow
        Write-Host "   💡 SOLUTION: Réessayer dans quelques minutes" -ForegroundColor Cyan
    }
    else {
        Write-Host "   🔧 DIAGNOSTIC: Erreur inconnue" -ForegroundColor Yellow
        Write-Host "   💡 SOLUTION: Vérifier les logs Render" -ForegroundColor Cyan
    }
}

Write-Host ""
Write-Host "📋 RÉSUMÉ DES ACTIONS:" -ForegroundColor Yellow
Write-Host "1. Configurez les variables sur Render Dashboard" -ForegroundColor White
Write-Host "2. Attendez le redémarrage (2-3 min)" -ForegroundColor White  
Write-Host "3. Relancez ce script pour vérifier" -ForegroundColor White
Write-Host ""
Write-Host "🔗 Render Dashboard: https://dashboard.render.com" -ForegroundColor Cyan
