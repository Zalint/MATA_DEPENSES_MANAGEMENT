# Lance le serveur en mode pré-prod.
# Les credentials NE doivent PAS être embarqués en clair dans ce script.
# Configurez DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD via votre
# secret manager ou votre shell avant d'invoquer ce script.
$required = @('DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD')
$missing = @()
foreach ($name in $required) {
    $val = [Environment]::GetEnvironmentVariable($name)
    if ([string]::IsNullOrEmpty($val)) {
        $missing += $name
    }
}
if ($missing.Count -gt 0) {
    Write-Error "Variables d'environnement manquantes : $($missing -join ', '). Configurez-les via votre secret manager ou votre shell avant d'executer ce script."
    exit 1
}
node server.js
