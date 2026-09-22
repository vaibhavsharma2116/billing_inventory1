# ============================================================
# Lovable.dev Backup → Clean Data-Only SQL Extractor
# ============================================================

$backupFile = "$env:USERPROFILE\Downloads\eco-sales-flow_260922.backup"
$outputFile = "$env:USERPROFILE\Desktop\data_only_clean.sql"

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host " Backup Extractor — Lovable.dev to Naya Supabase" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

# ---- Step 1: pg_restore check ----
$pgRestore = $null
$possiblePaths = @(
    "pg_restore",
    "C:\Program Files\PostgreSQL\16\bin\pg_restore.exe",
    "C:\Program Files\PostgreSQL\15\bin\pg_restore.exe",
    "C:\Program Files\PostgreSQL\14\bin\pg_restore.exe"
)
foreach ($p in $possiblePaths) {
    if (Get-Command $p -ErrorAction SilentlyContinue) { $pgRestore = $p; break }
}

if (-not $pgRestore) {
    Write-Host "[ERROR] pg_restore nahi mila! PostgreSQL install karo:" -ForegroundColor Red
    Write-Host "  winget install PostgreSQL.PostgreSQL" -ForegroundColor Yellow
    Read-Host "Press Enter to exit"; exit 1
}
Write-Host "[OK] pg_restore: $pgRestore" -ForegroundColor Green

# ---- Step 2: Extract DATA ONLY ----
Write-Host "[...] Data extract ho raha hai..." -ForegroundColor Yellow
& $pgRestore `
    --data-only `
    --no-owner `
    --no-privileges `
    --no-acl `
    --inserts `
    --exclude-schema=auth `
    --exclude-schema=storage `
    --exclude-schema=realtime `
    "--file=$outputFile" `
    $backupFile 2>&1

Write-Host "[OK] Extract done!" -ForegroundColor Green

# ---- Step 3: Wrap in transaction ----
$content = Get-Content $outputFile -Raw -Encoding UTF8
$wrapped = "-- Data from eco-sales-flow backup`n-- auth.users excluded (safe)`nBEGIN;`n`n$content`n`nCOMMIT;"
$wrapped | Set-Content $outputFile -Encoding UTF8

$lines = (Get-Content $outputFile).Count
$mb = [math]::Round((Get-Item $outputFile).Length/1MB, 2)
Write-Host "[OK] File ready: $lines lines, $mb MB" -ForegroundColor Green
Write-Host "[>>] Saved to: $outputFile" -ForegroundColor Cyan

explorer.exe /select,$outputFile
Read-Host "Press Enter to exit"
