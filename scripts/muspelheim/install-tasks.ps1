<#
Приводит задачи планировщика стенда показа на MUSPELHEIM в нужное состояние (issue #92).
Идемпотентен: можно прогонять повторно, в том числе после перестановки площадки.

Что чинит:
  1. У продукта не было триггера на загрузку машины — стоял одноразовый TimeTrigger
     от 09.09.2026, то есть после ребута стенд не поднимался вообще.
  2. Обе задачи стояли с запретом работы от батареи, а площадка — ноутбук:
     любое моргание питания останавливало стенд молча.
  3. Не было сторожа живости: 15.09.2026 процессы умерли, и это заметил владелец
     через двое суток, а не автоматика.
#>
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$WATCHDOG_SCRIPT = 'C:\projects\meridius-watchdog\watchdog.ps1'
$WATCHDOG_INTERVAL_MINUTES = 5
$PRODUCT_BOOT_DELAY = 'PT2M'  # даёт подняться базе в Docker до старта продукта

# Площадка — ноутбук с обезвреженной крышкой, поэтому работа от батареи разрешается
# явно: настройки по умолчанию гасят задачу при переходе на батарею.
#
# Наборов два, и разница между ними — не украшение. Сторож отрабатывает секунды,
# и лимит в 10 минут для него предохранитель от зависшего прогона. Продукт и
# звено-прокси, наоборот, ОБЯЗАНЫ жить бесконечно: с лимитом планировщик убивает
# их ровно через 10 минут (issue #140 — стенд умирал каждые 10 минут, сторож
# поднимал его каждые 15, и снаружи это выглядело как случайный 502).
# [TimeSpan]::Zero в ExecutionTimeLimit означает «без ограничения».
$watchdogSettings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -DontStopOnIdleEnd `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 10)

$serviceSettings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -DontStopOnIdleEnd `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit ([TimeSpan]::Zero)

$watchdogTrigger = New-ScheduledTaskTrigger -AtStartup
$repetitionSource = New-ScheduledTaskTrigger -Once -At (Get-Date) `
  -RepetitionInterval (New-TimeSpan -Minutes $WATCHDOG_INTERVAL_MINUTES)
$watchdogTrigger.Repetition = $repetitionSource.Repetition
# Пустая длительность = повторять бесконечно. Явная [TimeSpan]::MaxValue сюда не
# годится: она разворачивается в P99999999DT23H59M59S, и планировщик отвергает XML.
$watchdogTrigger.Repetition.Duration = $null

# Второй триггер обязателен: у триггера на загрузку повтор начинает отсчёт только
# после самой загрузки, поэтому до ближайшего ребута сторож не работал бы вовсе —
# ровно тот случай, когда настройка выглядит сделанной и молчит.
$immediateTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) `
  -RepetitionInterval (New-TimeSpan -Minutes $WATCHDOG_INTERVAL_MINUTES)
$immediateTrigger.Repetition.Duration = $null

$watchdogAction = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument ('-NoProfile -ExecutionPolicy Bypass -File ' + $WATCHDOG_SCRIPT)

Register-ScheduledTask -TaskName 'meridius-watchdog' -Action $watchdogAction `
  -Trigger @($watchdogTrigger, $immediateTrigger) -Settings $watchdogSettings -User 'SYSTEM' -RunLevel Highest -Force | Out-Null
Write-Output 'meridius-watchdog: зарегистрирован'

$productTrigger = New-ScheduledTaskTrigger -AtStartup
$productTrigger.Delay = $PRODUCT_BOOT_DELAY
Set-ScheduledTask -TaskName 'meridius-start' -Trigger $productTrigger -Settings $serviceSettings | Out-Null
Write-Output 'meridius-start: триггер на загрузку, работа от батареи, без лимита времени'

Set-ScheduledTask -TaskName 'meridius-qr-proxy' `
  -Trigger (New-ScheduledTaskTrigger -AtStartup) -Settings $serviceSettings | Out-Null
Write-Output 'meridius-qr-proxy: работа от батареи, без лимита времени'
