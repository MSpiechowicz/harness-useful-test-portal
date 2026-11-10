# Harness Test Portal installer for Windows.
#
#   powershell -ExecutionPolicy Bypass -c "irm https://raw.githubusercontent.com/MSpiechowicz/harness-useful-test-portal/main/install.ps1 | iex"
#
# Runs the release's NSIS installer silently: a per-user install in %LOCALAPPDATA%\Harness Test Portal with a Start menu
# shortcut and an entry under Settings > Apps, the same install the in-app updater updates.
#
# Environment overrides:
#   HARNESS_TEST_PORTAL_VERSION  release tag to install (default: latest), e.g. v1.0.0
$ErrorActionPreference = "Stop"

$Repo = "MSpiechowicz/harness-useful-test-portal"
$Bin = "harness-test-portal"
$AppName = "Harness Test Portal"
$Version = if ($env:HARNESS_TEST_PORTAL_VERSION) { $env:HARNESS_TEST_PORTAL_VERSION } else { "latest" }

if (-not [Environment]::Is64BitOperatingSystem) { throw "$AppName requires 64-bit Windows." }
$Base = if ($Version -eq "latest") { "https://github.com/$Repo/releases/latest/download" } else { "https://github.com/$Repo/releases/download/$Version" }

$Tmp = Join-Path ([IO.Path]::GetTempPath()) ([Guid]::NewGuid().ToString())
New-Item -ItemType Directory -Path $Tmp | Out-Null
try {
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

  # The release's updater manifest carries each bundle's download URL.
  try {
    $Manifest = Invoke-RestMethod -UseBasicParsing -Uri "$Base/latest.json"
  } catch {
    throw "No app release found at $Base."
  }
  $Url = $Manifest.platforms.'windows-x86_64-nsis'.url
  if (-not $Url) { throw "This release has no Windows installer." }
  # Dot segments (also percent-encoded) would walk out of the releases prefix.
  if ($Url -match '\.\.|%2e' -or -not $Url.StartsWith("https://github.com/$Repo/releases/download/", [StringComparison]::Ordinal)) {
    throw "Unexpected download URL in latest.json: $Url"
  }
  $Asset = [IO.Path]::GetFileName(([Uri]$Url).AbsolutePath)
  $Setup = Join-Path $Tmp $Asset

  Write-Host "==> Downloading $Asset ($($Manifest.version))" -ForegroundColor Cyan
  Invoke-WebRequest -UseBasicParsing -Uri $Url -OutFile $Setup

  # Nothing is installed without a checksum to compare against.
  try {
    Invoke-WebRequest -UseBasicParsing -Uri "$Base/checksums.txt" -OutFile (Join-Path $Tmp "checksums.txt")
  } catch {
    throw "This release has no checksums.txt, so $Asset can't be verified. Nothing was installed."
  }
  $line = Get-Content (Join-Path $Tmp "checksums.txt") | Where-Object { $_ -match "\s$([regex]::Escape($Asset))$" } | Select-Object -First 1
  if (-not $line) { throw "checksums.txt has no entry for $Asset" }
  $expected = ($line -split "\s+")[0].ToLower()
  $actual = (Get-FileHash -Algorithm SHA256 $Setup).Hash.ToLower()
  if ($expected -ne $actual) { throw "Checksum mismatch for $Asset" }
  Write-Host "==> Checksum verified" -ForegroundColor Cyan

  # Stop a running copy of the app, so the installer can replace its files.
  Get-Process -Name $Bin -ErrorAction SilentlyContinue | Where-Object { $_.SessionId -eq (Get-Process -Id $PID).SessionId } |
    ForEach-Object { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue }

  Write-Host "==> Installing" -ForegroundColor Cyan
  $Process = Start-Process -FilePath $Setup -ArgumentList "/S" -Wait -PassThru
  if ($Process.ExitCode -ne 0) { throw "The installer exited with code $($Process.ExitCode)." }

  Write-Host ""
  Write-Host "Installed $AppName $($Manifest.version). Open it from the Start menu. The app updates itself."
} finally {
  Remove-Item -Recurse -Force $Tmp -ErrorAction SilentlyContinue
}
