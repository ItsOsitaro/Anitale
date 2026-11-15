param(
    [string]$Message = "chore: update app"
)

$ErrorActionPreference = "Stop"

Write-Host "1/4 Building locally to verify..." -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { throw "Local build failed!" }

Write-Host "2/4 Committing and pushing to GitHub..." -ForegroundColor Cyan
if (git status --porcelain) {
    git add -A
    git commit -m "$Message"
}
git push origin main

Write-Host "3/4 Deploying to Ubuntu VPS..." -ForegroundColor Cyan
ssh -o BatchMode=yes root@188.121.110.74 "cd /var/www/anitale && git pull && npm run build && sudo systemctl restart anitale && sudo systemctl is-active anitale"

Write-Host "4/4 Done! Remember to purge ArvanCloud cache if frontend changed." -ForegroundColor Green
