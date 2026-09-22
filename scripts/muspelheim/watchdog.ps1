<#
Сторож стенда показа на MUSPELHEIM (issue #92).

Задачи планировщика поднимают продукт и звено-прокси, но за их жизнью не следят:
15.09.2026 оба процесса умерли с ERROR_PROCESS_ABORTED, планировщик оставил задачи
в состоянии Ready, и стенд простоял мёртвым двое суток — заметил владелец.

Сторож проверяет цепочку изнутри площадки и поднимает упавшее звено. Адреса взяты
не по памяти, а с живой цепочки: продукт собран с BASE_PATH=/qr и на корне отдаёт
404, поэтому проверяется 3100/qr; звено-прокси возвращает префикс, срезанный
Tailscale Funnel, поэтому у него проверяется корень.

Порядок звеньев в списке значим: продукт идёт первым, потому что при мёртвом
продукте живой прокси тоже отвечает не-200, и проверять его раньше значило бы
перезапускать исправное звено.
#>
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$ROOT = 'C:\projects\meridius-watchdog'
$LOG_FILE = Join-Path $ROOT 'watchdog.log'
$LAST_OK_FILE = Join-Path $ROOT 'last-ok.txt'
$MAX_LOG_BYTES = 1MB
$RETRY_PAUSE_SECONDS = 5
$STARTUP_GRACE_SECONDS = 40

$CHAIN = @(
  @{ Name = 'продукт'; Task = 'meridius-start'; Url = 'http://127.0.0.1:3100/qr' },
  @{ Name = 'звено-прокси'; Task = 'meridius-qr-proxy'; Url = 'http://127.0.0.1:3099/' }
)

function Write-Log([string] $message) {
  if ((Test-Path $LOG_FILE) -and ((Get-Item $LOG_FILE).Length -gt $MAX_LOG_BYTES)) {
    Move-Item -Path $LOG_FILE -Destination ($LOG_FILE + '.1') -Force
  }
  Add-Content -Path $LOG_FILE -Value ((Get-Date).ToString('yyyy-MM-dd HH:mm:ss') + ' ' + $message) -Encoding UTF8
}

function Test-Endpoint([string] $url) {
  # Две попытки: одиночный отказ случается и у живого продукта, а лишний
  # перезапуск рвёт открытые у людей экраны.
  foreach ($attempt in 1..2) {
    try {
      $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 20
      if ([int] $response.StatusCode -eq 200) { return $true }
    } catch {
      # Молчим намеренно: отказ здесь и есть ожидаемый исход проверки,
      # решение принимается по итогу обеих попыток.
    }
    if ($attempt -eq 1) { Start-Sleep -Seconds $RETRY_PAUSE_SECONDS }
  }
  return $false
}

New-Item -ItemType Directory -Path $ROOT -Force | Out-Null

$isChainAlive = $true
foreach ($link in $CHAIN) {
  if (Test-Endpoint $link.Url) { continue }

  $isChainAlive = $false
  Write-Log ($link.Name + ' (' + $link.Task + ') не отвечает на ' + $link.Url + ' — перезапускаю')

  try {
    Stop-ScheduledTask -TaskName $link.Task -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 3
    Start-ScheduledTask -TaskName $link.Task
  } catch {
    Write-Log ($link.Name + ' — перезапуск не удался: ' + $_.Exception.Message)
    continue
  }

  Start-Sleep -Seconds $STARTUP_GRACE_SECONDS
  if (Test-Endpoint $link.Url) {
    Write-Log ($link.Name + ' поднят, отвечает 200')
  } else {
    Write-Log ($link.Name + ' после перезапуска молчит — нужен человек')
  }
}

if ($isChainAlive) {
  # Отметка живости: по ней видно, что сторож работает, а не только молчит.
  Set-Content -Path $LAST_OK_FILE -Value ((Get-Date).ToString('yyyy-MM-dd HH:mm:ss')) -Encoding UTF8
}
