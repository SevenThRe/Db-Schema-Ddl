param(
  [string]$ExecutablePath = (Join-Path $PSScriptRoot "..\dist-electron\win-unpacked\DBSchemaExcel2DDL.exe")
)

$resolvedExecutable = Resolve-Path -LiteralPath $ExecutablePath -ErrorAction Stop
$workingDirectory = Split-Path -Parent $resolvedExecutable

$env:DBSCHEMA_LOCAL_DB_MANAGEMENT_TEST = "1"
Start-Process -FilePath $resolvedExecutable -WorkingDirectory $workingDirectory -ArgumentList "--db-management-test"

Write-Host "Started DB management test mode:"
Write-Host "  Executable: $resolvedExecutable"
Write-Host "  DBSCHEMA_LOCAL_DB_MANAGEMENT_TEST=1"
Write-Host "  Argument: --db-management-test"
