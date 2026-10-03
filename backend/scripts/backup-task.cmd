@echo off
REM Wrapper for the Windows Task Scheduler entry created by scripts/install-backup-task.ps1.
REM Keeps the scheduled action to a single short command and sends all output to
REM a log, so a failure leaves evidence rather than a vanished console window.
set LOG=D:\Sham\fyp\odcat-backups\backup-task.log
echo. >> "%LOG%"
echo ===== %DATE% %TIME% ===== >> "%LOG%"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0backup.ps1" >> "%LOG%" 2>&1
echo exit code: %ERRORLEVEL% >> "%LOG%"
