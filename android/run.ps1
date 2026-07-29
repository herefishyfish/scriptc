[CmdletBinding()]
param(
  [string]$Serial,
  [string]$ApplicationId = "dev.scriptc.counter",
  [string]$AppName = "JS Counter",
  [string]$Entry,
  [string]$OutputDir,
  [string]$Gradle,
  [switch]$SkipToolBuild,
  [switch]$NoLaunch
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path $PSScriptRoot -Parent
if (-not $Entry) {
  $Entry = Join-Path $PSScriptRoot "app.ts"
}
if (-not $OutputDir) {
  $OutputDir = Join-Path $PSScriptRoot "build/counter"
}

function Invoke-Checked {
  param(
    [string]$Description,
    [scriptblock]$Command
  )

  Write-Host "==> $Description"
  & $Command
  if ($LASTEXITCODE -ne 0) {
    throw "$Description failed with exit code $LASTEXITCODE"
  }
}

function Resolve-CommandPath {
  param([string[]]$Names)

  foreach ($name in $Names) {
    $command = Get-Command $name -ErrorAction SilentlyContinue
    if ($command) {
      return $command.Source
    }
  }
  return $null
}

function Resolve-Gradle {
  if ($Gradle) {
    $resolved = Resolve-Path $Gradle -ErrorAction SilentlyContinue
    if (-not $resolved) {
      throw "Gradle executable not found: $Gradle"
    }
    return $resolved.Path
  }

  $fromPath = Resolve-CommandPath @("gradle.bat", "gradle")
  if ($fromPath) {
    return $fromPath
  }

  if ($env:GRADLE_HOME) {
    $fromHome = Join-Path $env:GRADLE_HOME "bin/gradle.bat"
    if (Test-Path $fromHome) {
      return $fromHome
    }
  }

  $wrapperRoot = Join-Path $env:USERPROFILE ".gradle/wrapper/dists"
  if (Test-Path $wrapperRoot) {
    $cached = Get-ChildItem $wrapperRoot -Filter "gradle.bat" -File -Recurse |
      Where-Object { $_.FullName -match '\\gradle-[^\\]+\\bin\\gradle\.bat$' } |
      Sort-Object FullName -Descending |
      Select-Object -First 1
    if ($cached) {
      return $cached.FullName
    }
  }

  throw "Gradle was not found. Add gradle to PATH, set GRADLE_HOME, or pass -Gradle <path-to-gradle.bat>."
}

function Resolve-Adb {
  $fromPath = Resolve-CommandPath @("adb.exe", "adb")
  if ($fromPath) {
    return $fromPath
  }

  $sdkRoots = @(
    $env:ANDROID_SDK_ROOT,
    $env:ANDROID_HOME,
    $(if ($env:LOCALAPPDATA) { Join-Path $env:LOCALAPPDATA "Android/Sdk" })
  ) | Where-Object { $_ }

  foreach ($sdkRoot in $sdkRoots) {
    $candidate = Join-Path $sdkRoot "platform-tools/adb.exe"
    if (Test-Path $candidate) {
      return $candidate
    }
  }

  throw "adb was not found. Add platform-tools to PATH or set ANDROID_SDK_ROOT/ANDROID_HOME."
}

function Select-AndroidTarget {
  param(
    [string]$Adb,
    [string]$RequestedSerial
  )

  $lines = & $Adb devices
  if ($LASTEXITCODE -ne 0) {
    throw "adb devices failed with exit code $LASTEXITCODE"
  }

  $devices = @(
    $lines |
      Select-Object -Skip 1 |
      ForEach-Object {
        if ($_ -match '^(\S+)\s+device$') { $Matches[1] }
      }
  )

  if ($RequestedSerial) {
    if ($devices -notcontains $RequestedSerial) {
      throw "Android target '$RequestedSerial' is not connected and ready. Ready targets: $($devices -join ', ')"
    }
    return $RequestedSerial
  }

  if ($devices.Count -eq 0) {
    throw "No ready Android device or emulator found. Start one, or connect a device with USB debugging enabled."
  }
  if ($devices.Count -gt 1) {
    throw "More than one Android target is ready: $($devices -join ', '). Re-run with -Serial <serial>."
  }
  return $devices[0]
}

$npm = Resolve-CommandPath @("npm.cmd", "npm")
if (-not $npm) {
  throw "npm was not found on PATH."
}

$entryPath = [System.IO.Path]::GetFullPath($Entry)
$projectDir = [System.IO.Path]::GetFullPath($OutputDir)
if (-not (Test-Path $entryPath)) {
  throw "Entry file not found: $entryPath"
}

Push-Location $repoRoot
try {
  if (-not $SkipToolBuild) {
    Invoke-Checked "Build scriptc compiler" {
      & $npm --prefix packages/compiler run build
    }
    Invoke-Checked "Build scriptc CLI" {
      & $npm --prefix packages/cli run build
    }
  }

  Invoke-Checked "Generate Android project" {
    # The -- is required: without it npm consumes --target and -o itself.
    & $npm run scriptc -- build $entryPath --target android `
      --android-package $ApplicationId --android-name $AppName -o $projectDir
  }
}
finally {
  Pop-Location
}

$gradlePath = Resolve-Gradle
$adbPath = Resolve-Adb
$detectedSdk = Split-Path (Split-Path $adbPath -Parent) -Parent
if (-not $env:ANDROID_SDK_ROOT) {
  $env:ANDROID_SDK_ROOT = $detectedSdk
}
if (-not $env:ANDROID_HOME) {
  $env:ANDROID_HOME = $detectedSdk
}
$target = Select-AndroidTarget -Adb $adbPath -RequestedSerial $Serial

Push-Location $projectDir
try {
  Invoke-Checked "Build debug APK" {
    & $gradlePath :app:assembleDebug
  }
}
finally {
  Pop-Location
}

$apk = Join-Path $projectDir "app/build/outputs/apk/debug/app-debug.apk"
if (-not (Test-Path $apk)) {
  throw "Gradle completed but the debug APK was not found: $apk"
}

Invoke-Checked "Install APK on $target" {
  & $adbPath -s $target install -r $apk
}

if (-not $NoLaunch) {
  Invoke-Checked "Launch $ApplicationId on $target" {
    & $adbPath -s $target shell am force-stop $ApplicationId
    if ($LASTEXITCODE -eq 0) {
      & $adbPath -s $target shell am start -n "$ApplicationId/.MainActivity"
    }
  }
}

Write-Host ""
Write-Host "Installed: $apk"
Write-Host "Target:    $target"
