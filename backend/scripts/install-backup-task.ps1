<#
.SYNOPSIS
    Registers (or removes) a daily Windows Scheduled Task that runs backup.ps1.

.DESCRIPTION
    The backup script is verified and reliable, but it only protects anything if
    somebody remembers to run it - and the one time this project lost its data,
    nobody had. This puts it on a schedule so protection does not depend on
    memory.

    Runs as the current user, non-elevated, and is skipped if the machine is on
    battery-saver or the task is already running. If a scheduled run is missed
    because the machine was off, it runs at the next opportunity rather than
    silently skipping a day.

    ASCII-only on purpose: Windows PowerShell 5.1 reads .ps1 as the ANSI
    codepage without a BOM, so a stray dash can break parsing.

.EXAMPLE
    .\scripts\install-backup-task.ps1
    .\scripts\install-backup-task.ps1 -At 02:30
    .\scripts\install-backup-task.ps1 -Remove
#>
param(
    [string] $TaskName = 'ODCAT Database Backup',
    [string] $At       = '03:00',
    [switch] $Remove
)

$ErrorActionPreference = 'Stop'

$wrapper = Join-Path $PSScriptRoot 'backup-task.cmd'

if ($Remove) {
    try {
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
        Write-Host "Removed scheduled task '$TaskName'." -ForegroundColor Green
    } catch {
        Write-Host "No scheduled task named '$TaskName' was registered." -ForegroundColor Yellow
    }
    exit 0
}

if (-not (Test-Path $wrapper)) { Write-Error "Not found: $wrapper"; exit 1 }

$action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c `"$wrapper`""
$trigger = New-ScheduledTaskTrigger -Daily -At $At

$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -DontStopIfGoingOnBatteries `
    -AllowStartIfOnBatteries `
    -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 30)

# Remove any previous registration so re-running this is idempotent.
try { Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue } catch {}

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Description 'Dumps and verifies the ODCAT database and uploaded files daily.' | Out-Null

Write-Host "Registered '$TaskName' - runs daily at $At." -ForegroundColor Green
Write-Host ""
Write-Host "  Run it now to confirm :  Start-ScheduledTask -TaskName '$TaskName'"
Write-Host "  Check it              :  Get-ScheduledTaskInfo -TaskName '$TaskName'"
Write-Host "  Log                   :  D:\Sham\fyp\odcat-backups\backup-task.log"
Write-Host "  Remove                :  .\scripts\install-backup-task.ps1 -Remove"
