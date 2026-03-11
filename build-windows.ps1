<#
.SYNOPSIS
  Build a Windows NSIS installer for Talus Tally with the same steps used in CI.
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptRoot

$npmBin = if ($env:NPM_BIN) { $env:NPM_BIN } else { 'npm' }

function Invoke-Step {
  param(
    [string]$Name,
    [scriptblock]$Action
  )

  Write-Host "[Windows build] $Name"
  & $Action
}

function Invoke-Native {
  param(
    [string]$Command,
    [string[]]$Arguments
  )

  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) {
    $argumentText = if ($Arguments -and $Arguments.Count -gt 0) { ' ' + ($Arguments -join ' ') } else { '' }
    throw "Command '$Command$argumentText' failed with exit code $LASTEXITCODE"
  }
}

Invoke-Step 'Installing frontend dependencies' {
  Push-Location 'frontend'
  Invoke-Native $npmBin @('ci')
  Pop-Location
}

Invoke-Step 'Bundling Tauri app' {
  Push-Location 'frontend'
  Invoke-Native 'npx' @('tauri', 'build', '--bundles', 'nsis')
  Pop-Location
}

Invoke-Step 'Collecting NSIS installer' {
  $bundleDir = Join-Path $ScriptRoot 'frontend/src-tauri/target/release/bundle/nsis'
  if (-not (Test-Path $bundleDir)) {
    throw "NSIS bundle directory not found: $bundleDir"
  }

  $installer = Get-ChildItem -Path $bundleDir -Filter '*.exe' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if (-not $installer) {
    throw "No NSIS installer found in $bundleDir"
  }

  $destDir = Join-Path $ScriptRoot 'build/windows'
  New-Item -ItemType Directory -Force -Path $destDir | Out-Null
  $destPath = Join-Path $destDir 'talus-tally-windows.exe'
  Copy-Item -Path $installer.FullName -Destination $destPath -Force
  Write-Host "[Windows build] ✅ Installer ready: $destPath"
}
