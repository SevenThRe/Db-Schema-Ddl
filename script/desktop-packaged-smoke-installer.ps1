[CmdletBinding()]
param(
  [string]$InstallerArtifactPath,
  [string]$InstallDirectory = (Join-Path ${env:ProgramFiles} "DBSchemaExcel2DDL"),
  [string]$OutputDirectory,
  [string]$InstallerScreenshotPath,
  [string]$FirstLaunchScreenshotPath,
  [string]$PackagedLogPath,
  [ValidateSet("pass", "fail", "pending")]
  [string]$InstallStatus = "pending",
  [ValidateSet("pass", "fail", "pending")]
  [string]$FirstLaunchStatus = "pending",
  [ValidateSet("pass", "fail", "pending")]
  [string]$DbEntryStatus = "pending",
  [ValidateSet("pass", "fail", "pending")]
  [string]$CloseStatus = "pending",
  [string]$InstallNote,
  [string]$FirstLaunchNote,
  [string]$DbEntryNote,
  [string]$CloseNote,
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

function Resolve-OptionalArtifactPath {
  param([string]$CandidatePath)

  if (-not $CandidatePath) {
    return $null
  }

  if (Test-Path $CandidatePath) {
    return (Resolve-Path $CandidatePath).Path
  }

  return $CandidatePath
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

function Add-ProofFinding {
  param(
    [System.Collections.Generic.List[object]]$Findings,
    [string]$Code,
    [string]$Message,
    [ValidateSet("critical", "warning")]
    [string]$Severity,
    [bool]$IsBlocker
  )

  $Findings.Add((New-BlockerFinding -Code $Code -Message $Message -Severity $Severity -IsBlocker $IsBlocker)) | Out-Null
}

function Add-StepResultFinding {
  param(
    [System.Collections.Generic.List[object]]$Findings,
    [string]$StepName,
    [string]$StepStatus,
    [string]$StepNote
  )

  switch ($StepStatus) {
    "fail" {
      $code = switch ($StepName) {
        "install" { "INSTALL_STEP_FAILED" }
        "first-launch" { "STARTUP_FAILURE" }
        "db-entry" { "DB_ENTRY_FAILURE" }
        "close" { "RAW_CLOSE_ERROR" }
      }
      $message = "Installer step '$StepName' failed."
      if ($StepNote) {
        $message = "$message Detail: $StepNote"
      }
      Add-ProofFinding -Findings $Findings -Code $code -Message $message -Severity "critical" -IsBlocker $true
    }
    "pending" {
      $message = "Installer step '$StepName' is still awaiting operator confirmation."
      if ($StepNote) {
        $message = "$message Detail: $StepNote"
      }
      Add-ProofFinding -Findings $Findings -Code "STEP_RESULT_PENDING" -Message $message -Severity "warning" -IsBlocker $false
    }
  }
}

function Get-ProofStatus {
  param([System.Collections.Generic.List[object]]$Findings)

  if (@($Findings | Where-Object { $_.blocker }).Count -gt 0) {
    return "failed"
  }

  if ($Findings.Count -gt 0) {
    return "incomplete"
  }

  return "complete"
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
  $lines.Add("- Proof status: $($Artifact.proofStatus)")
  $lines.Add("- Started at: $($Artifact.timestamps.startedAt)")
  $lines.Add("- Finished at: $($Artifact.timestamps.finishedAt)")
  $lines.Add("- artifactJsonPath: $($Artifact.artifactJsonPath)")
  $lines.Add("- artifactMarkdownPath: $($Artifact.artifactMarkdownPath)")
  $lines.Add("")
  $lines.Add("## Step Results")
  $lines.Add("")

  foreach ($stepName in $Artifact.stepResults.Keys) {
    $step = $Artifact.stepResults[$stepName]
    $requiredEvidence = ($step.requiredEvidenceKinds -join ", ")
    $lines.Add("- ${stepName}: $($step.status) :: $($step.note) :: required evidence = $requiredEvidence")
  }
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
$resolvedInstallerScreenshotPath = Resolve-OptionalArtifactPath -CandidatePath $InstallerScreenshotPath
$resolvedFirstLaunchScreenshotPath = Resolve-OptionalArtifactPath -CandidatePath $FirstLaunchScreenshotPath
$resolvedPackagedLogPath = Resolve-OptionalArtifactPath -CandidatePath $PackagedLogPath
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

if ($resolvedInstallerScreenshotPath) {
  Add-EvidenceRef -EvidenceRefs $evidenceRefs -Kind "installer-ui-screenshot" -Path $resolvedInstallerScreenshotPath -Note "Installer UI screenshot from the reviewed NSIS run."
} else {
  Add-ProofFinding -Findings $blockerFindings -Code "INSTALLER_UI_SCREENSHOT_MISSING" -Message "Installer UI screenshot evidence is missing for the NSIS run." -Severity "warning" -IsBlocker $false
}

if ($resolvedFirstLaunchScreenshotPath) {
  Add-EvidenceRef -EvidenceRefs $evidenceRefs -Kind "first-launch-screenshot" -Path $resolvedFirstLaunchScreenshotPath -Note "First-launch screenshot after the packaged main window became interactive."
} else {
  Add-ProofFinding -Findings $blockerFindings -Code "FIRST_LAUNCH_SCREENSHOT_MISSING" -Message "First-launch screenshot evidence is missing for the NSIS run." -Severity "warning" -IsBlocker $false
}

if ($resolvedPackagedLogPath) {
  Add-EvidenceRef -EvidenceRefs $evidenceRefs -Kind "packaged-log" -Path $resolvedPackagedLogPath -Note "Packaged log excerpt or path captured from the same installer run."
} else {
  Add-ProofFinding -Findings $blockerFindings -Code "PACKAGED_LOG_MISSING" -Message "Packaged log excerpt evidence is missing for the NSIS run." -Severity "warning" -IsBlocker $false
}

if ($SemiManual.IsPresent) {
  Add-EvidenceRef -EvidenceRefs $evidenceRefs -Kind "manual-step" -Path $artifactMarkdownPath -Note "Semi-manual run: attach screenshots, log excerpts, and operator notes without changing the artifact/report structure."
  if ($manualEvidenceList.Count -eq 0) {
    $manualEvidenceList.Add("Attach installer UI screenshot, first-launch screenshot, packaged log excerpt, and explicit install -> first launch -> DB 管理 -> close outcomes before review.") | Out-Null
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

$stepResults = [ordered]@{
  install = [ordered]@{
    status = $InstallStatus
    note = if ($InstallNote) { $InstallNote } else { "Installer UI reached the expected completion state." }
    requiredEvidenceKinds = @("installer", "installer-ui-screenshot")
  }
  "first-launch" = [ordered]@{
    status = $FirstLaunchStatus
    note = if ($FirstLaunchNote) { $FirstLaunchNote } else { "Installed executable launched and the main window became interactive." }
    requiredEvidenceKinds = @("installed-executable", "first-launch-screenshot")
  }
  "db-entry" = [ordered]@{
    status = $DbEntryStatus
    note = if ($DbEntryNote) { $DbEntryNote } else { "The installed app entered `DB 管理` during the reviewed run." }
    requiredEvidenceKinds = @("first-launch-screenshot", "packaged-log")
  }
  close = [ordered]@{
    status = $CloseStatus
    note = if ($CloseNote) { $CloseNote } else { "The installed app closed cleanly without raw JS error spam." }
    requiredEvidenceKinds = @("packaged-log")
  }
}

foreach ($stepName in $stepResults.Keys) {
  Add-StepResultFinding -Findings $blockerFindings -StepName $stepName -StepStatus $stepResults[$stepName].status -StepNote $stepResults[$stepName].note
}

$proofStatus = Get-ProofStatus -Findings $blockerFindings
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
  proofStatus = $proofStatus
  timestamps = [ordered]@{
    startedAt = $startedAt
    finishedAt = $finishedAt
  }
  stepResults = $stepResults
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
