[CmdletBinding()]
param(
  [string]$InstallerArtifactPath,
  [string]$InstallDirectory = (Join-Path ${env:ProgramFiles} "DBSchemaExcel2DDL"),
  [string]$OutputDirectory,
  [string[]]$ManualEvidence = @(),
  [switch]$SemiManual
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$script:RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$script:DesktopSmokeOutputRoot = if ($OutputDirectory) {
  $OutputDirectory
} else {
  Join-Path $script:RepoRoot "artifacts\desktop-smoke"
}

function Resolve-InstallerArtifactPath {
  param([string]$ExplicitPath)

  if ($ExplicitPath) {
    return (Resolve-Path $ExplicitPath).Path
  }

  $distElectron = Join-Path $script:RepoRoot "dist-electron"
  if (-not (Test-Path $distElectron)) {
    return $null
  }

  $candidate = Get-ChildItem -Path $distElectron -Filter "*Setup-*.exe" -File -Recurse |
    Sort-Object LastWriteTimeUtc -Descending |
    Select-Object -First 1

  if ($null -eq $candidate) {
    return $null
  }

  return $candidate.FullName
}

function New-RunId {
  $stamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH-mm-ss-fffZ")
  return "desktop-smoke-packaged-nsis-$stamp"
}

function New-ReviewPolicy {
  return [ordered]@{
    blockers = @(
      [ordered]@{ code = "STARTUP_FAILURE"; reason = "Packaged startup failure or first window never becomes interactive." }
      [ordered]@{ code = "NATIVE_MODULE_LOAD_FAILURE"; reason = "better-sqlite3 or another native module fails to load." }
      [ordered]@{ code = "MIGRATION_FAILURE"; reason = "SQLite init or migration fails during first launch." }
      [ordered]@{ code = "RAW_CLOSE_ERROR"; reason = "Close flow shows raw JavaScript error spam or exits uncleanly." }
      [ordered]@{ code = "CATALOG_FAILURE"; reason = "Extension catalog flow exposes raw transport or IPC errors to the user." }
      [ordered]@{ code = "DB_ENTRY_FAILURE"; reason = "DB 管理 main entry does not open." }
    )
    warnings = @(
      [ordered]@{ code = "MYSQL_CHECK_SKIPPED"; reason = "A given packaged smoke run skipped the optional real MySQL read path." }
      [ordered]@{ code = "MANUAL_EVIDENCE_PENDING"; reason = "Semi-manual proof still needs screenshots or notes attached before review." }
    )
  }
}

function New-BlockerFinding {
  param(
    [string]$Code,
    [string]$Message,
    [ValidateSet("critical", "warning")]
    [string]$Severity = "critical",
    [bool]$IsBlocker = $true
  )

  return [ordered]@{
    code = $Code
    blocker = $IsBlocker
    severity = $Severity
    message = $Message
  }
}

function Add-EvidenceRef {
  param(
    [System.Collections.Generic.List[object]]$EvidenceRefs,
    [string]$Kind,
    [string]$Path,
    [string]$Note
  )

  $EvidenceRefs.Add([ordered]@{
    kind = $Kind
    path = $Path
    note = $Note
  }) | Out-Null
}

function ConvertTo-Markdown {
  param([hashtable]$Artifact)

  $lines = New-Object System.Collections.Generic.List[string]
  $lines.Add("# Desktop Packaged Smoke Run $($Artifact.runId)")
  $lines.Add("")
  $lines.Add("- Run mode: $($Artifact.runMode)")
  $lines.Add("- Installer artifact: $($Artifact.installerArtifactPath)")
  $lines.Add("- Install directory: $($Artifact.installDirectory)")
  $lines.Add("- Semi-manual: $($Artifact.semiManual)")
  $lines.Add("- Started at: $($Artifact.timestamps.startedAt)")
  $lines.Add("- Finished at: $($Artifact.timestamps.finishedAt)")
  $lines.Add("- artifactJsonPath: $($Artifact.artifactJsonPath)")
  $lines.Add("- artifactMarkdownPath: $($Artifact.artifactMarkdownPath)")
  $lines.Add("")
  $lines.Add("## Evidence References")
  $lines.Add("")

  foreach ($ref in $Artifact.evidenceRefs) {
    $lines.Add("- [$($ref.kind)] $($ref.path) :: $($ref.note)")
  }

  $lines.Add("")
  $lines.Add("## Release Blocker Policy")
  $lines.Add("")
  foreach ($item in $Artifact.reviewPolicy.blockers) {
    $lines.Add("- release blocker: $($item.code) - $($item.reason)")
  }

  $lines.Add("")
  $lines.Add("## Warning Policy")
  $lines.Add("")
  foreach ($item in $Artifact.reviewPolicy.warnings) {
    $lines.Add("- warning: $($item.code) - $($item.reason)")
  }

  if ($Artifact.blockerFindings.Count -gt 0) {
    $lines.Add("")
    $lines.Add("## Findings")
    $lines.Add("")
    foreach ($finding in $Artifact.blockerFindings) {
      $lines.Add("- $($finding.code) | blocker=$($finding.blocker) | $($finding.message)")
    }
  }

  if ($Artifact.manualEvidence.Count -gt 0) {
    $lines.Add("")
    $lines.Add("## Manual Evidence")
    $lines.Add("")
    foreach ($item in $Artifact.manualEvidence) {
      $lines.Add("- $item")
    }
  }

  return ($lines -join [Environment]::NewLine)
}

$runId = New-RunId
$artifactJsonPath = Join-Path $script:DesktopSmokeOutputRoot "$runId.json"
$artifactMarkdownPath = Join-Path $script:DesktopSmokeOutputRoot "$runId.md"
$startedAt = (Get-Date).ToUniversalTime().ToString("o")
$resolvedInstallerArtifactPath = Resolve-InstallerArtifactPath -ExplicitPath $InstallerArtifactPath
$reviewPolicy = New-ReviewPolicy
$evidenceRefs = [System.Collections.Generic.List[object]]::new()
$blockerFindings = [System.Collections.Generic.List[object]]::new()
$manualEvidenceList = [System.Collections.Generic.List[string]]::new()

New-Item -ItemType Directory -Force -Path $script:DesktopSmokeOutputRoot | Out-Null

if ($ManualEvidence.Count -gt 0) {
  foreach ($item in $ManualEvidence) {
    $manualEvidenceList.Add($item) | Out-Null
  }
}

if ($resolvedInstallerArtifactPath) {
  Add-EvidenceRef -EvidenceRefs $evidenceRefs -Kind "installer" -Path $resolvedInstallerArtifactPath -Note "Resolved NSIS installer artifact."
} else {
  $blockerFindings.Add((New-BlockerFinding -Code "INSTALLER_ARTIFACT_MISSING" -Message "No NSIS installer artifact was found under dist-electron. Run npm run build:electron before this smoke seam.")) | Out-Null
}

$installedExecutablePath = Join-Path $InstallDirectory "DBSchemaExcel2DDL.exe"
Add-EvidenceRef -EvidenceRefs $evidenceRefs -Kind "install-directory" -Path $InstallDirectory -Note "Expected install directory. Existing NSIS config may reuse a sticky prior path."
Add-EvidenceRef -EvidenceRefs $evidenceRefs -Kind "installed-executable" -Path $installedExecutablePath -Note "Expected installed app path for first-launch evidence."

if ($SemiManual.IsPresent) {
  Add-EvidenceRef -EvidenceRefs $evidenceRefs -Kind "manual-step" -Path $artifactMarkdownPath -Note "Semi-manual run: attach screenshots, log excerpts, and operator notes without changing the artifact/report structure."
  if ($manualEvidenceList.Count -eq 0) {
    $manualEvidenceList.Add("Attach installer UI screenshot, first-launch screenshot, and packaged log excerpt before review.") | Out-Null
  }
} elseif ($resolvedInstallerArtifactPath) {
  try {
    $process = Start-Process -FilePath $resolvedInstallerArtifactPath -PassThru
    Add-EvidenceRef -EvidenceRefs $evidenceRefs -Kind "process" -Path $resolvedInstallerArtifactPath -Note "NSIS installer launched as process id $($process.Id). Complete the install UI and capture first-launch evidence."
  } catch {
    $blockerFindings.Add((New-BlockerFinding -Code "INSTALLER_LAUNCH_FAILED" -Message "Failed to launch the NSIS installer: $($_.Exception.Message)")) | Out-Null
  }
}

if (-not $SemiManual.IsPresent -and -not (Test-Path $installedExecutablePath)) {
  $blockerFindings.Add((New-BlockerFinding -Code "INSTALLED_APP_NOT_FOUND" -Message "Installed executable was not found at $installedExecutablePath after the installer hand-off.")) | Out-Null
}

$finishedAt = (Get-Date).ToUniversalTime().ToString("o")

$artifact = [ordered]@{
  artifactVersion = "v1"
  runId = $runId
  generatedAt = $startedAt
  environment = "packaged-electron"
  runMode = "packaged-nsis"
  installerArtifactPath = $resolvedInstallerArtifactPath
  installDirectory = $InstallDirectory
  executablePath = $installedExecutablePath
  semiManual = $SemiManual.IsPresent
  timestamps = [ordered]@{
    startedAt = $startedAt
    finishedAt = $finishedAt
  }
  evidenceRefs = @($evidenceRefs)
  manualEvidence = @($manualEvidenceList)
  blockerFindings = @($blockerFindings)
  reviewPolicy = $reviewPolicy
  artifactJsonPath = $artifactJsonPath
  artifactMarkdownPath = $artifactMarkdownPath
}

$artifact | ConvertTo-Json -Depth 10 | Set-Content -Path $artifactJsonPath -Encoding UTF8
ConvertTo-Markdown -Artifact $artifact | Set-Content -Path $artifactMarkdownPath -Encoding UTF8

Write-Output "desktop packaged NSIS smoke artifact written:"
Write-Output "- $artifactJsonPath"
Write-Output "- $artifactMarkdownPath"
Write-Output "- semi-manual: $($SemiManual.IsPresent)"
