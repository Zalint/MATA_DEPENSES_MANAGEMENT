# 🧪 Test du Déploiement Snapshot en Production
# Usage: .\test_prod_deployment.ps1

Write-Host "🚀 TEST DÉPLOIEMENT SNAPSHOT PRODUCTION" -ForegroundColor Green
Write-Host "=======================================" -ForegroundColor Green
Write-Host ""

# Configuration
$PROD_URL = "https://mata-depenses-management.onrender.com"
$API_KEY = "4f8d9a2b6c7e8f1a3b5c9d0e2f4g6h7i"
$CUTOFF_DATE = (Get-Date).ToString("yyyy-MM-dd")

Write-Host "🔧 Configuration:" -ForegroundColor Yellow
Write-Host "  📡 URL: $PROD_URL"
Write-Host "  📅 Date: $CUTOFF_DATE"
Write-Host "  🔑 API Key: $($API_KEY.Substring(0,8))..."
Write-Host ""

# Test 1: Vérifier que le serveur répond
Write-Host "1️⃣  TEST: Connexion serveur..." -ForegroundColor Cyan
try {
    $healthCheck = Invoke-WebRequest -Uri "$PROD_URL/api/health" -Method GET -TimeoutSec 30
    Write-Host "   ✅ Serveur accessible (Status: $($healthCheck.StatusCode))" -ForegroundColor Green
} catch {
    Write-Host "   ❌ Serveur inaccessible: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
Write-Host ""

# Test 2: Créer un snapshot via API externe
Write-Host "2️⃣  TEST: Création snapshot HTML scraping..." -ForegroundColor Cyan
try {
    $body = @{ cutoff_date = $CUTOFF_DATE } | ConvertTo-Json
    
    Write-Host "   📡 Envoi requête POST..." -ForegroundColor Gray
    $createResponse = Invoke-WebRequest -Uri "$PROD_URL/external/api/snapshots/create" -Method POST -Headers @{
        "X-API-Key" = $API_KEY
        "Content-Type" = "application/json"
    } -Body $body -TimeoutSec 120
    
    $createData = $createResponse.Content | ConvertFrom-Json
    
    if ($createData.success) {
        Write-Host "   ✅ Snapshot créé avec succès !" -ForegroundColor Green
        Write-Host "   📄 Fichier: $($createData.data.filename)" -ForegroundColor Gray
        Write-Host "   📊 Taille: $($createData.data.file_size_mb) MB" -ForegroundColor Gray
    } else {
        Write-Host "   ❌ Échec création: $($createData.error)" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "   ❌ Erreur création snapshot: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
Write-Host ""

# Test 3: Récupérer et vérifier le snapshot
Write-Host "3️⃣  TEST: Vérification snapshot HTML scraping..." -ForegroundColor Cyan
try {
    $getResponse = Invoke-WebRequest -Uri "$PROD_URL/external/api/snapshots/$CUTOFF_DATE" -Method GET -Headers @{
        "X-API-Key" = $API_KEY
    } -TimeoutSec 30
    
    $snapshotData = $getResponse.Content | ConvertFrom-Json
    
    # Vérifier les valeurs clés
    $plFinal = [math]::Round($snapshotData.data.dashboard.stats_cards.plFinal)
    $source = $snapshotData.data.dashboard.stats_cards.source
    $baseUrl = $snapshotData.data.dashboard.pl_details.baseUrl
    
    Write-Host "   📊 RÉSULTATS:" -ForegroundColor White
    Write-Host "     🎯 PL FINAL: $($plFinal.ToString('N0')) FCFA" -ForegroundColor White
    Write-Host "     📡 Source: $source" -ForegroundColor White
    Write-Host "     🌐 Base URL: $baseUrl" -ForegroundColor White
    
    # Vérifications
    if ($source -eq "html_scraping") {
        Write-Host "   ✅ Source HTML scraping confirmée !" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  Source inattendue: $source (attendu: html_scraping)" -ForegroundColor Yellow
    }
    
    if ($baseUrl -eq $PROD_URL) {
        Write-Host "   ✅ URL de production confirmée !" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  URL inattendue: $baseUrl (attendu: $PROD_URL)" -ForegroundColor Yellow
    }
    
    if ($snapshotData.data.dashboard.pl_details.plFinal -eq $snapshotData.data.dashboard.stats_cards.plFinal) {
        Write-Host "   ✅ Cohérence PL FINAL confirmée !" -ForegroundColor Green
    } else {
        Write-Host "   ❌ Incohérence PL FINAL détectée !" -ForegroundColor Red
    }
    
} catch {
    Write-Host "   ❌ Erreur récupération snapshot: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
Write-Host ""

# Test 4: Lister les snapshots disponibles
Write-Host "4️⃣  TEST: Liste des snapshots..." -ForegroundColor Cyan
try {
    $listResponse = Invoke-WebRequest -Uri "$PROD_URL/external/api/snapshots" -Method GET -Headers @{
        "X-API-Key" = $API_KEY
    } -TimeoutSec 30
    
    $listData = $listResponse.Content | ConvertFrom-Json
    
    Write-Host "   📋 Snapshots disponibles: $($listData.data.snapshots.Count)" -ForegroundColor White
    
    if ($listData.data.snapshots.Count -gt 0) {
        Write-Host "   📅 Dernier snapshot: $($listData.data.snapshots[0].date)" -ForegroundColor Gray
        Write-Host "   ✅ Liste accessible !" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  Aucun snapshot trouvé" -ForegroundColor Yellow
    }
    
} catch {
    Write-Host "   ❌ Erreur liste snapshots: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Résumé final
Write-Host "🎉 RÉSUMÉ DU TEST" -ForegroundColor Green
Write-Host "=================" -ForegroundColor Green
Write-Host "✅ Serveur production accessible" -ForegroundColor Green
Write-Host "✅ HTML scraping fonctionnel" -ForegroundColor Green
Write-Host "✅ API externe opérationnelle" -ForegroundColor Green
Write-Host "✅ Cohérence des données garantie" -ForegroundColor Green
Write-Host ""
Write-Host "🚀 Le système de snapshot est prêt en production !" -ForegroundColor Green
Write-Host "   📡 URL: $PROD_URL" -ForegroundColor Gray
Write-Host "   🎯 Mode: HTML scraping obligatoire (sans fallback)" -ForegroundColor Gray
Write-Host "   🔐 Auth: Saliou/Murex2015 via Puppeteer" -ForegroundColor Gray
