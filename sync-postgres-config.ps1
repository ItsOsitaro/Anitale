# مسیر فایل پیکربندی پروژه
$envPath = "D:\Projects\WebSites\Anitale\.env.local"

if (-not (Test-Path $envPath)) {
    Write-Error "فایل پیکربندی در مسیر $envPath یافت نشد."
    exit 1
}

# خواندن و پارس کردن متغیرها از فایل .env.local
$envVars = @{}
Get-Content $envPath | ForEach-Object {
    $line = $_.Trim()
    if ($line -and -not ($line.StartsWith('#')) -and ($line -match '^([^=]+)=(.*)$')) {
        $key = $matches[1].Trim()
        $val = $matches[2].Trim().Trim('"').Trim("'")
        $envVars[$key] = $val
    }
}

# استخراج فیلدها با اولویت‌بندی متغیرهای اختصاصی یا تجزیه DATABASE_URL
$dbHost = $envVars['POSTGRES_HOST']
$dbPort = $envVars['POSTGRES_PORT']
$dbName = $envVars['POSTGRES_DATABASE']
$dbUser = $envVars['POSTGRES_USER']
$dbPass = $envVars['POSTGRES_PASSWORD']

# در صورت عدم تعریف مجزای کلیدها، تجزیه از Connection String
if (-not $dbHost -and $envVars['DATABASE_URL']) {
    if ($envVars['DATABASE_URL'] -match '^postgres(ql)?://([^:]+):([^@]+)@([^:/]+)(:(\d+))?/(.+)$') {
        $dbUser = $matches[2]
        $dbPass = $matches[3]
        $dbHost = $matches[4]
        $dbPort = if ($matches[6]) { $matches[6] } else { "5432" }
        $dbName = ($matches[7] -split '\?')[0]
    }
}

if (-not $dbPort) { $dbPort = "5432" }

Write-Host "اطلاعات پایگاه داده استخراج شد:" -ForegroundColor Green
Write-Host "  Host: $dbHost"
Write-Host "  Port: $dbPort"
Write-Host "  Database: $dbName"
Write-Host "  User: $dbUser"
Write-Host "  Password: [پنهان شده]"

# مسیر فایل کانفیگ افزونه‌های Gemini CLI در ویندوز
$configDir = Join-Path $HOME ".gemini\extensions\postgres"
$configFile = Join-Path $configDir "config.json"

if (-not (Test-Path $configDir)) {
    New-Item -ItemType Directory -Path $configDir -Force | Out-Null
}

# ساخت ساختار پیکربندی و ذخیره در فایل کانفیگ افزونه
$configData = @{
    host     = $dbHost
    port     = [int]$dbPort
    database = $dbName
    user     = $dbUser
    password = $dbPass
}

$configData | ConvertTo-Json -Depth 3 | Set-Content -Path $configFile -Encoding UTF8

Write-Host "`nتنظیمات افزونه postgres با موفقیت در مسیر زیر ثبت شد:" -ForegroundColor Cyan
Write-Host $configFile

# پاس دادن مقادیر به صورت تعاملی به دستور داخلی CLI جهت اطمینان از همگام‌سازی
try {
    $inputData = "$dbHost`n$dbPort`n$dbName`n$dbUser`n$dbPass`n"
    $inputData | gemini extensions config postgres 2>$null
    Write-Host "همگام‌سازی مستقیم با gemini extensions config postgres انجام شد." -ForegroundColor Green
} catch {
    Write-Host "تنظیم فایل کانفیگ اعمال شد؛ در صورت نیاز دستور gemini را مستقیماً اجرا کنید." -ForegroundColor Yellow
}