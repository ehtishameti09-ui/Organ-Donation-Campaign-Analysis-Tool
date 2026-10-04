<#
.SYNOPSIS
    Backs up the ODCAT database and uploaded files, then VERIFIES the dump by
    restoring it into a scratch database and comparing against the live one.

.DESCRIPTION
    An untested backup is not a backup. This script does not just write a .sql
    file and claim success - it restores what it wrote into a throwaway database
    and checks that every table's row count matches the source. If that fails,
    the dump is renamed .FAILED and the script exits non-zero, so a silently
    corrupt backup cannot sit on disk looking healthy.

    Backups are written OUTSIDE the git repository on purpose: the dump contains
    real user data and password hashes and must never be committed.

    Kept deliberately ASCII-only. Windows PowerShell 5.1 reads .ps1 files as the
    system ANSI codepage unless they carry a UTF-8 BOM, so a stray em-dash in a
    comment is enough to produce parse errors.

.EXAMPLE
    .\scripts\backup.ps1
    .\scripts\backup.ps1 -KeepDays 14
#>
param(
    [string] $Database  = 'odcat_backend',
    [string] $BackupDir = 'D:\Sham\fyp\odcat-backups',
    [string] $MysqlBin  = 'C:\xampp\mysql\bin',
    [int]    $Port      = 3307,
    [string] $User      = 'root',
    # Older backups are pruned after this many days. 0 keeps everything.
    [int]    $KeepDays  = 30,
    # Off-machine copy. Defaults to OneDrive, which $env:OneDrive resolves to the
    # account Windows has signed in. A backup sitting on the same disk as the
    # database does not survive the failure it exists to protect against.
    # Pass '' to skip mirroring.
    [string] $MirrorTo  = $(if ($env:OneDrive) { Join-Path $env:OneDrive 'odcat-backups' } else { '' })
)

$ErrorActionPreference = 'Stop'

$mysqldump = Join-Path $MysqlBin 'mysqldump.exe'
$mysql     = Join-Path $MysqlBin 'mysql.exe'
foreach ($exe in @($mysqldump, $mysql)) {
    if (-not (Test-Path $exe)) { Write-Error "Not found: $exe (is -MysqlBin correct?)"; exit 1 }
}
if (-not (Test-Path $BackupDir)) { New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null }

$stamp   = Get-Date -Format 'yyyy-MM-dd_HHmm'
$sqlFile = Join-Path $BackupDir ($Database + '_' + $stamp + '.sql')
$tarFile = Join-Path $BackupDir ('odcat_files_' + $stamp + '.tar.gz')
$tmpDir  = [System.IO.Path]::GetTempPath()
$countQ  = Join-Path $tmpDir ('odcat_counts_' + $stamp + '.sql')

$storage = $null
$maybe = Join-Path $PSScriptRoot '..\storage\app'
if (Test-Path $maybe) { $storage = (Resolve-Path $maybe).Path }

Write-Host "ODCAT backup -> $BackupDir" -ForegroundColor Cyan

# ---------------------------------------------------------------- 1. dump
# --single-transaction takes a consistent InnoDB snapshot without locking the
# tables, so the application keeps serving while this runs.
Write-Host '  dumping database ...' -NoNewline
# The try/catch is load-bearing. With $ErrorActionPreference = 'Stop', anything
# mysqldump writes to stderr is raised as a NativeCommandError and unwinds the
# script immediately - so a bare post-hoc exit-code check never runs, and the
# half-written .sql is left on disk. A zero-byte file sitting in the backup
# folder is worse than no file: it is named like a backup and will be trusted
# like one months later, when nobody remembers this run failed.
try {
    & $mysqldump -u $User -P $Port -h 127.0.0.1 `
        --single-transaction --routines --triggers --events `
        --default-character-set=utf8mb4 --add-drop-table `
        $Database 2>$null | Set-Content -Path $sqlFile -Encoding UTF8
    if ($LASTEXITCODE -ne 0) { throw "mysqldump exited with code $LASTEXITCODE" }
}
catch {
    Remove-Item $sqlFile -Force -ErrorAction SilentlyContinue
    Write-Host ' FAILED' -ForegroundColor Red
    Write-Host ('      ' + $_.Exception.Message) -ForegroundColor Red
    Write-Host '      partial dump removed' -ForegroundColor Red
    exit 1
}

$sizeMb = [Math]::Round((Get-Item $sqlFile).Length / 1MB, 2)
$tables = @(Select-String -Path $sqlFile -Pattern '^CREATE TABLE').Count
Write-Host (' ok  (' + $sizeMb + ' MB, ' + $tables + ' tables)') -ForegroundColor Green
if ($tables -eq 0) {
    Remove-Item $sqlFile -Force -ErrorAction SilentlyContinue
    Write-Error 'Dump contains no tables - aborting, empty dump removed.'
    exit 1
}

# ----------------------------------------------------------- 2. uploads
if ($storage) {
    Write-Host '  archiving uploaded files ...' -NoNewline
    & tar -czf $tarFile -C $storage private
    if ($LASTEXITCODE -eq 0) {
        $n = @(& tar -tzf $tarFile | Where-Object { $_ -notmatch '/$' }).Count
        Write-Host (' ok  (' + $n + ' files)') -ForegroundColor Green
    } else {
        Write-Host ' SKIPPED (tar failed)' -ForegroundColor Yellow
    }
}

# ------------------------------------------------- 3. verify by restoring
$scratch = $Database + '_verify_' + ([guid]::NewGuid().ToString('N').Substring(0,8))
Write-Host "  verifying restore into $scratch ..." -NoNewline

& $mysql -u $User -P $Port -h 127.0.0.1 -e "DROP DATABASE IF EXISTS $scratch; CREATE DATABASE $scratch CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" | Out-Null
Get-Content $sqlFile -Raw | & $mysql -u $User -P $Port -h 127.0.0.1 $scratch
$restoreOk = ($LASTEXITCODE -eq 0)

# The counting query is generated by MySQL itself and written to a file, so no
# backticks or nested quotes ever pass through the PowerShell parser. CHAR(96)
# is the backtick that quotes each table name.
$gen = @'
SELECT CONCAT('SELECT ''', table_name, ''' AS t, COUNT(*) AS n FROM ',
              CHAR(96), table_name, CHAR(96), ' UNION ALL ')
FROM information_schema.tables
WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'
ORDER BY table_name;
'@

function Get-Counts([string] $db) {
    $lines = $gen | & $mysql -u $User -P $Port -h 127.0.0.1 -N $db
    if (-not $lines) { return @{} }
    $sql = ($lines -join "`n")
    $sql = $sql -replace '(?s)UNION ALL\s*$', ''
    Set-Content -Path $countQ -Value $sql -Encoding ASCII
    $rows = Get-Content $countQ -Raw | & $mysql -u $User -P $Port -h 127.0.0.1 -N $db
    $map = @{}
    foreach ($r in $rows) {
        $p = $r -split "`t"
        if ($p.Count -ge 2) { $map[$p[0]] = $p[1] }
    }
    return $map
}

$live     = Get-Counts $Database
$restored = Get-Counts $scratch

$mismatch = @()
foreach ($t in $live.Keys) {
    if ($restored[$t] -ne $live[$t]) {
        $mismatch += ($t + ' (live=' + $live[$t] + ' restored=' + $restored[$t] + ')')
    }
}

& $mysql -u $User -P $Port -h 127.0.0.1 -e "DROP DATABASE IF EXISTS $scratch;" | Out-Null
Remove-Item $countQ -ErrorAction SilentlyContinue

if ((-not $restoreOk) -or ($mismatch.Count -gt 0) -or ($live.Count -eq 0)) {
    Write-Host ' FAILED' -ForegroundColor Red
    foreach ($m in $mismatch) { Write-Host ('      ' + $m) -ForegroundColor Red }
    Rename-Item $sqlFile ($sqlFile + '.FAILED')
    Write-Error 'Backup did NOT verify. Renamed to .FAILED - do not rely on it.'
    exit 1
}
Write-Host (' ok  (' + $live.Count + ' tables matched)') -ForegroundColor Green

# --------------------------------------------------------------- 4. prune
if ($KeepDays -gt 0) {
    $cutoff = (Get-Date).AddDays(-$KeepDays)
    $old = @(Get-ChildItem $BackupDir -File |
             Where-Object { $_.LastWriteTime -lt $cutoff -and ($_.Name -like '*.sql' -or $_.Name -like '*.tar.gz') })
    if ($old.Count -gt 0) {
        $old | Remove-Item -Force
        Write-Host ('  pruned ' + $old.Count + ' backup(s) older than ' + $KeepDays + ' days') -ForegroundColor DarkGray
    }
}

# ------------------------------------------------------- 5. off-machine copy
# Deliberately AFTER verification and pruning: only a backup that restored
# cleanly is worth syncing, and mirroring first would push .FAILED files too.
if ($MirrorTo) {
    Write-Host '  mirroring off-machine ...' -NoNewline
    try {
        if (-not (Test-Path $MirrorTo)) { New-Item -ItemType Directory -Path $MirrorTo -Force | Out-Null }

        # /MIR keeps the copy in step rather than accumulating duplicates, so the
        # pruning above applies to both. .FAILED files are excluded so a bad dump
        # can never masquerade as a good one in the cloud copy.
        & robocopy $BackupDir $MirrorTo /MIR /NFL /NDL /NJH /NJS /NP /R:1 /W:1 /XF '*.FAILED' | Out-Null

        # robocopy exit codes below 8 are success; 8+ are real failures.
        if ($LASTEXITCODE -lt 8) {
            $n = @(Get-ChildItem $MirrorTo -File -ErrorAction SilentlyContinue).Count
            Write-Host (' ok  (' + $n + ' file(s) -> ' + $MirrorTo + ')') -ForegroundColor Green
        } else {
            Write-Host (' FAILED (robocopy ' + $LASTEXITCODE + ')') -ForegroundColor Yellow
            Write-Host '      The local backup is still good; only the off-machine copy was skipped.' -ForegroundColor Yellow
        }
    } catch {
        # A paused or signed-out OneDrive must never turn a good backup into a
        # failed run - the thing that matters already succeeded.
        Write-Host ' SKIPPED' -ForegroundColor Yellow
        Write-Host ('      ' + $_.Exception.Message) -ForegroundColor Yellow
    }
    # robocopy's exit code would otherwise leak out as this script's.
    $global:LASTEXITCODE = 0
}

Write-Host ''
Write-Host 'Backup verified:' -ForegroundColor Green
Write-Host ('  ' + $sqlFile)
if (Test-Path $tarFile) { Write-Host ('  ' + $tarFile) }
if ($MirrorTo -and (Test-Path $MirrorTo)) { Write-Host ('  mirrored to ' + $MirrorTo) }
Write-Host ''
Write-Host 'To restore:' -ForegroundColor Cyan
Write-Host ('  & "' + $mysql + '" -u ' + $User + ' -P ' + $Port + ' ' + $Database + ' < "' + $sqlFile + '"')
