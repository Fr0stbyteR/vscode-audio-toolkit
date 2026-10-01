<#
.SYNOPSIS
Starts the standalone web app and the unified music analysis API together.
.EXAMPLE
.\start-standalone.ps1
.EXAMPLE
.\start-standalone.ps1 -MusicBackendPath D:\p\music-embedding-analysis -NoBrowser
#>
param(
    [string]$MusicBackendPath = "",
    [switch]$NoBrowser,
    [switch]$Check
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$repoRoot = $PSScriptRoot
$webRoot = Join-Path $repoRoot "app"
$musicRoot = if ($MusicBackendPath) {
    [System.IO.Path]::GetFullPath($MusicBackendPath)
} else {
    [System.IO.Path]::GetFullPath((Join-Path $repoRoot "..\music-embedding-analysis"))
}

function Read-DotEnv([string]$path) {
    $values = @{}
    if (-not (Test-Path -LiteralPath $path)) { return $values }
    foreach ($line in [System.IO.File]::ReadAllLines($path)) {
        if ($line -notmatch '^\s*(?:export\s+)?([A-Za-z_][A-Za-z_0-9]*)\s*=\s*(.*)$') { continue }
        $name = $Matches[1]
        $value = $Matches[2].Trim()
        if ($value.Length -ge 2 -and (($value[0] -eq '"' -and $value[-1] -eq '"') -or ($value[0] -eq "'" -and $value[-1] -eq "'"))) {
            $value = $value.Substring(1, $value.Length - 2)
        } else {
            $value = ($value -replace '\s+#.*$', '').Trim()
        }
        $values[$name] = $value
    }
    return $values
}

function Get-ConfigPath([string]$directory) {
    $envPath = Join-Path $directory ".env"
    if (Test-Path -LiteralPath $envPath) { return $envPath }
    $example = Join-Path $directory ".env.example"
    if (-not (Test-Path -LiteralPath $example)) { throw "Missing configuration template: $example" }
    if ($Check) {
        Write-Host "Would create $envPath from .env.example"
        return $example
    }
    Copy-Item -LiteralPath $example -Destination $envPath
    Write-Host "Created $envPath"
    return $envPath
}

function Test-LocalPort([int]$port) {
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $task = $client.ConnectAsync("127.0.0.1", $port)
        return $task.Wait(250) -and $client.Connected
    } catch {
        return $false
    } finally {
        $client.Dispose()
    }
}

function Test-PythonModules([string]$python, [string[]]$modules) {
    & $python -c "import importlib.util, sys; sys.exit(0 if all(importlib.util.find_spec(name) for name in sys.argv[1:]) else 1)" @modules *> $null
    return $LASTEXITCODE -eq 0
}

function Test-Http([string]$url) {
    try {
        $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2
        return [int]$response.StatusCode -ge 200 -and [int]$response.StatusCode -lt 300
    } catch {
        return $false
    }
}

function Test-StopKey {
    try {
        return [Console]::KeyAvailable -and [Console]::ReadKey($true).Key -eq "Q"
    } catch [System.InvalidOperationException] {
        # A redirected terminal cannot read keys; Ctrl+C still stops the launcher.
        return $false
    }
}

function Wait-ForHttp([string]$name, [string]$url, [System.Diagnostics.Process]$process, [int]$seconds) {
    for ($i = 0; $i -lt $seconds; $i++) {
        if (Test-StopKey) { throw "Startup stopped by user." }
        if ($process.HasExited) { throw "$name exited during startup (code $($process.ExitCode)). See the log files below." }
        if (Test-Http $url) { Write-Host "$name ready: $url"; return $true }
        if ($i -gt 0 -and $i % 15 -eq 0) { Write-Host "Still waiting for $name ($i seconds)..." }
        Start-Sleep -Seconds 1
    }
    return $false
}

if (-not (Test-Path -LiteralPath $musicRoot -PathType Container)) {
    throw "Music backend not found at $musicRoot. Pass -MusicBackendPath with its location."
}
$webEnvPath = Get-ConfigPath $webRoot
$musicEnvPath = Get-ConfigPath $musicRoot
$webEnv = Read-DotEnv $webEnvPath
$musicEnv = Read-DotEnv $musicEnvPath

$musicPort = 49321
$configuredMusicPort = if ($env:MAB_PORT) { $env:MAB_PORT } elseif ($musicEnv.ContainsKey("MAB_PORT")) { $musicEnv["MAB_PORT"] } else { "49321" }
if (-not [int]::TryParse($configuredMusicPort, [ref]$musicPort)) {
    throw "MAB_PORT must be an integer in $musicEnvPath"
}
if ($musicPort -lt 1 -or $musicPort -gt 65535) { throw "MAB_PORT must be between 1 and 65535." }

$frontUrl = "http://127.0.0.1:5173/"
$musicUrl = "http://127.0.0.1:$musicPort/v1/health"
$node = Get-Command node -ErrorAction SilentlyContinue
$viteScript = Join-Path $webRoot "node_modules\vite\bin\vite.js"
if (-not $node) {
    throw "Node.js is required for the web frontend. Install Node.js and run this script again."
}
if (-not (Test-Path -LiteralPath $viteScript)) {
    if ($Check) { Write-Host "First launch will run npm ci --prefix app." }
    else {
        $npmCommand = Get-Command npm.cmd -CommandType Application -ErrorAction Stop
        & $npmCommand.Source ci --prefix $webRoot
        if ($LASTEXITCODE -ne 0) { throw "Frontend dependency installation failed." }
    }
}

$musicPython = Join-Path $musicRoot ".venv\Scripts\python.exe"
$backendStartScript = Join-Path $musicRoot "start.ps1"
if (-not (Test-Path -LiteralPath $backendStartScript)) { throw "Backend start.ps1 is missing at $musicRoot" }

if ($webEnv.ContainsKey("VITE_MUSIC_ANALYSIS_API") -and $webEnv["VITE_MUSIC_ANALYSIS_API"].TrimEnd('/') -ne "http://127.0.0.1:$musicPort") {
    Write-Warning "The music service URL in app/.env differs from this backend's MAB_PORT. Update the frontend setting if needed."
}
if ($musicEnv.ContainsKey("MAB_SESSION_TOKEN") -and $webEnv.ContainsKey("VITE_MUSIC_ANALYSIS_TOKEN") -and $musicEnv["MAB_SESSION_TOKEN"] -ne $webEnv["VITE_MUSIC_ANALYSIS_TOKEN"]) {
    Write-Warning "The CLAP tokens in the two .env files differ. Update the frontend setting if needed."
}
foreach ($port in @(5173, $musicPort)) {
    if (Test-LocalPort $port) { throw "Port $port is already in use. Stop the existing service or change its configuration." }
}
if ($Check) { Write-Host "Ready to start the frontend and unified backend."; return }

# Always use the backend's first-run workflow; directly invoking its API used
# to skip Essentia installation and could report a misleading healthy service.
$originalMusicToken = $env:MAB_SESSION_TOKEN
$temporaryMusicToken = -not $env:MAB_SESSION_TOKEN -and [string]::IsNullOrEmpty($musicEnv["MAB_SESSION_TOKEN"]) -and $webEnv.ContainsKey("VITE_MUSIC_ANALYSIS_TOKEN")
if ($temporaryMusicToken) {
    $env:MAB_SESSION_TOKEN = $webEnv["VITE_MUSIC_ANALYSIS_TOKEN"]
}
try {
    Write-Host "Preparing unified backend and verifying Essentia modules..."
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $backendStartScript -PrepareOnly
    if ($LASTEXITCODE -ne 0) { throw "Backend / Essentia preparation failed; services were not started." }
    if (-not (Test-PythonModules $musicPython @("music_annotation_backend", "uvicorn", "librosa"))) { throw "Backend preparation did not create a usable environment." }
} catch {
    if ($temporaryMusicToken) { $env:MAB_SESSION_TOKEN = $originalMusicToken }
    throw
}

$logRoot = Join-Path $repoRoot ".standalone-logs"
$runId = Get-Date -Format "yyyyMMdd-HHmmss-fff"
$services = @()
try {
    New-Item -ItemType Directory -Path $logRoot -Force | Out-Null
    $definitions = @(
        @{ Name = "Music analysis API"; File = $musicPython; Arguments = @("-m", "music_annotation_backend.main"); Directory = $musicRoot },
        @{ Name = "Web frontend"; File = $node.Source; Arguments = @("node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--strictPort"); Directory = $webRoot }
    )
    foreach ($definition in $definitions) {
        $label = $definition.Name -replace '\W+', '-'
        $output = Join-Path $logRoot "$runId-$label.out.log"
        $errors = Join-Path $logRoot "$runId-$label.err.log"
        $process = Start-Process -FilePath $definition.File -ArgumentList $definition.Arguments -WorkingDirectory $definition.Directory -WindowStyle Hidden -PassThru -RedirectStandardOutput $output -RedirectStandardError $errors
        $services += @{ Name = $definition.Name; Process = $process; Output = $output; Errors = $errors }
        Write-Host "Starting $($definition.Name) (PID $($process.Id))"
    }
    if (-not (Wait-ForHttp "Web frontend" $frontUrl $services[1].Process 45)) { throw "Web frontend did not become ready. See the log files below." }
    if (-not $NoBrowser) { Start-Process $frontUrl | Out-Null }
    Write-Host "Browser app: $frontUrl"
    Write-Host "The CLAP model may take a while to load. Waiting for $musicUrl ..."
    $musicReady = Wait-ForHttp "Music analysis API" $musicUrl $services[0].Process 180
    if (-not $musicReady) { Write-Warning "The music backend is still loading. Watch its log; this window will continue monitoring it." }
    Write-Host "Press Q to stop both services (or Ctrl+C)."
    while ($true) {
        foreach ($service in $services) {
            if ($service.Process.HasExited) { throw "$($service.Name) exited (code $($service.Process.ExitCode)). See the log files below." }
        }
        if (-not $musicReady -and (Test-Http $musicUrl)) { $musicReady = $true; Write-Host "Music analysis API ready: $musicUrl" }
        if (Test-StopKey) { break }
        Start-Sleep -Seconds 1
    }
} finally {
    if ($temporaryMusicToken) { $env:MAB_SESSION_TOKEN = $originalMusicToken }
    foreach ($service in $services) {
        if (-not $service.Process.HasExited) {
            # Windows venv launchers can create a child Python process. Stop the
            # whole tree, including Vite's helper processes, when this script ends.
            try { & taskkill.exe /PID $service.Process.Id /T /F *> $null } catch { }
            if (-not $service.Process.HasExited) { Stop-Process -Id $service.Process.Id -ErrorAction SilentlyContinue }
        }
        $service.Process.Dispose()
    }
    Write-Host "Services stopped. Logs: $logRoot ($runId)"
}
