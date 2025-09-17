# Test du fix PL en production
$API_KEY = "4f8d9a2b6c7e8f1a3b5c9d0e2f4g6h7i"
$BASE_URL = "https://mata-depenses-management.onrender.com"

Write-Host "🧪 TEST: Snapshot avec calcul PL corrigé en PRODUCTION" -ForegroundColor Cyan

try {
    Write-Host "📸 Création d'un nouveau snapshot..." -ForegroundColor Yellow
    
    $body = @{ cutoff_date = "2025-09-17" } | ConvertTo-Json
    $response = Invoke-WebRequest -Uri "$BASE_URL/external/api/snapshots/create" `
        -Method POST `
        -Headers @{"X-API-Key"=$API_KEY; "Content-Type"="application/json"} `
        -Body $body
    
    $data = $response.Content | ConvertFrom-Json
    
    Write-Host "✅ Status: $($response.StatusCode)" -ForegroundColor Green
    Write-Host "📊 Snapshot créé: $($data.data.snapshot_date_fr)" -ForegroundColor Cyan
    Write-Host "💾 Taille: $($data.data.file_size_mb) MB" -ForegroundColor Gray
    Write-Host "🎯 Créé via: $($data.data.created_via)" -ForegroundColor Gray
    
    # Récupérer le snapshot pour vérifier le PL
    Write-Host "`n📊 Récupération des données du snapshot..." -ForegroundColor Yellow
    
    $snapshotResponse = Invoke-WebRequest -Uri "$BASE_URL/external/api/snapshots/2025-09-17" `
        -Method GET `
        -Headers @{"X-API-Key"=$API_KEY}
    
    $snapshotData = $snapshotResponse.Content | ConvertFrom-Json
    
    if ($snapshotData.data.dashboard.pl_details) {
        $plFinal = $snapshotData.data.dashboard.pl_details.plFinal
        Write-Host "💰 PL FINAL (Snapshot): $($plFinal.toLocaleString()) FCFA" -ForegroundColor Green
        Write-Host "💰 PL FINAL (Dashboard): 7 038 045 FCFA" -ForegroundColor Blue
        
        $ecart = 7038045 - $plFinal
        Write-Host "📈 Écart: $($ecart.toLocaleString()) FCFA" -ForegroundColor $(if ($ecart -lt 500000) { 'Green' } else { 'Red' })
        
        if ([Math]::Abs($ecart) -lt 500000) {
            Write-Host "✅ SUCCÈS: Écart acceptable (< 500k)" -ForegroundColor Green
        } else {
            Write-Host "⚠️  ATTENTION: Écart important (> 500k)" -ForegroundColor Yellow
        }
    } else {
        Write-Host "❌ Pas de données PL trouvées dans le snapshot" -ForegroundColor Red
    }
    
} catch {
    Write-Host "❌ Erreur: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n🎯 Test terminé" -ForegroundColor Cyan
