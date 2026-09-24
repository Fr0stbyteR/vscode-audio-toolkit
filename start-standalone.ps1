<#
.SYNOPSIS
Starts the standalone web app, librosa API, and music embedding API together.
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
$webRoot = Join-Path $repoRoot "webview-ui"
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
$analysisEnvPath = Get-ConfigPath (Join-Path $repoRoot "standalone-server")
$musicEnvPath = Get-ConfigPath $musicRoot
$webEnv = Read-DotEnv $webEnvPath
$analysisEnv = Read-DotEnv $analysisEnvPath
$musicEnv = Read-DotEnv $musicEnvPath

$musicPort = 49321
if ($musicEnv.ContainsKey("MAB_PORT") -and -not [int]::TryParse($musicEnv["MAB_PORT"], [ref]$musicPort)) {
    throw "MAB_PORT must be an integer in $musicEnvPath"
}
if ($musicPort -lt 1 -or $musicPort -gt 65535) { throw "MAB_PORT must be between 1 and 65535." }

$frontUrl = "http://127.0.0.1:5173/standalone.html"
$analysisUrl = "http://127.0.0.1:8000/api/v1/health"
$musicUrl = "http://127.0.0.1:$musicPort/v1/health"
$node = Get-Command node -ErrorAction SilentlyContinue
$viteScript = Join-Path $webRoot "node_modules\vite\bin\vite.js"
if (-not $node -or -not (Test-Path -LiteralPath $viteScript)) {
    throw "Frontend dependencies are missing. Install Node.js, then run: npm ci --prefix webview-ui"
}

$analysisPython = @(
    (Join-Path $repoRoot ".venv-standalone\Scripts\python.exe"),
    (Join-Path $repoRoot ".venv-librosa\Scripts\python.exe")
) | Where-Object { Test-Path -LiteralPath $_ } | Where-Object { Test-PythonModules $_ @("fastapi", "uvicorn", "multipart", "librosa") } | Select-Object -First 1
if (-not $analysisPython) {
    throw "Librosa API environment is missing. See STANDALONE.md: create .venv-standalone and install standalone-server\requirements.txt."
}

$musicPython = Join-Path $musicRoot ".venv\Scripts\python.exe"
if (-not (Test-Path -LiteralPath $musicPython) -or -not (Test-PythonModules $musicPython @("music_annotation_backend", "uvicorn"))) {
    throw "CLAP backend environment is missing at $musicRoot\.venv. See its README.md for the initial installation."
}

if ($webEnv.ContainsKey("VITE_MUSIC_ANALYSIS_API") -and $webEnv["VITE_MUSIC_ANALYSIS_API"].TrimEnd('/') -ne "http://127.0.0.1:$musicPort") {
    Write-Warning "The CLAP URL in webview-ui/.env differs from this backend's MAB_PORT. Update the frontend setting if needed."
}
if ($musicEnv.ContainsKey("MAB_SESSION_TOKEN") -and $webEnv.ContainsKey("VITE_MUSIC_ANALYSIS_TOKEN") -and $musicEnv["MAB_SESSION_TOKEN"] -ne $webEnv["VITE_MUSIC_ANALYSIS_TOKEN"]) {
    Write-Warning "The CLAP tokens in the two .env files differ. Update the frontend setting if needed."
}
if ($analysisEnv.ContainsKey("AUDIO_TOOLKIT_API_TOKEN") -and $analysisEnv["AUDIO_TOOLKIT_API_TOKEN"] -and $analysisEnv["AUDIO_TOOLKIT_API_TOKEN"] -ne $webEnv["VITE_AUDIO_TOOLKIT_TOKEN"]) {
    Write-Warning "The librosa API token differs from webview-ui/.env. Update the frontend setting if needed."
}

foreach ($port in @(5173, 8000, $musicPort)) {
    if (Test-LocalPort $port) { throw "Port $port is already in use. Stop the existing service or change its configuration." }
}
if ($Check) { Write-Host "Ready to start all three services."; return }

# The librosa API reads environment variables at import time, so load its .env
# before launching children. The music service reads its own .env from musicRoot.
foreach ($name in $analysisEnv.Keys) {
    [System.Environment]::SetEnvironmentVariable($name, $analysisEnv[$name], "Process")
}

$logRoot = Join-Path $repoRoot ".standalone-logs"
New-Item -ItemType Directory -Path $logRoot -Force | Out-Null
$runId = Get-Date -Format "yyyyMMdd-HHmmss-fff"
$services = @()
try {
    $definitions = @(
        @{ Name = "Librosa API"; File = $analysisPython; Arguments = @("-m", "uvicorn", "app:app", "--app-dir", "standalone-server", "--host", "127.0.0.1", "--port", "8000"); Directory = $repoRoot },
        @{ Name = "CLAP API"; File = $musicPython; Arguments = @("-m", "music_annotation_backend.main"); Directory = $musicRoot },
        @{ Name = "Web frontend"; File = $node.Source; Arguments = @("node_modules/vite/bin/vite.js", "--config", "vite.standalone.config.ts", "--host", "127.0.0.1", "--strictPort"); Directory = $webRoot }
    )
    foreach ($definition in $definitions) {
        $label = $definition.Name -replace '\W+', '-'
        $output = Join-Path $logRoot "$runId-$label.out.log"
        $errors = Join-Path $logRoot "$runId-$label.err.log"
        $process = Start-Process -FilePath $definition.File -ArgumentList $definition.Arguments -WorkingDirectory $definition.Directory -WindowStyle Hidden -PassThru -RedirectStandardOutput $output -RedirectStandardError $errors
        $services += @{ Name = $definition.Name; Process = $process; Output = $output; Errors = $errors }
        Write-Host "Starting $($definition.Name) (PID $($process.Id))"
    }
    if (-not (Wait-ForHttp "Librosa API" $analysisUrl $services[0].Process 45)) { throw "Librosa API did not become ready. See the log files below." }
    if (-not (Wait-ForHttp "Web frontend" $frontUrl $services[2].Process 45)) { throw "Web frontend did not become ready. See the log files below." }
    if (-not $NoBrowser) { Start-Process $frontUrl | Out-Null }
    Write-Host "Browser app: $frontUrl"
    Write-Host "CLAP model may take a while to load. Waiting for $musicUrl ..."
    $musicReady = Wait-ForHttp "CLAP API" $musicUrl $services[1].Process 180
    if (-not $musicReady) { Write-Warning "CLAP is still loading. Watch its log; this window will continue monitoring it." }
    Write-Host "Press Q to stop all three services (or Ctrl+C)."
    while ($true) {
        foreach ($service in $services) {
            if ($service.Process.HasExited) { throw "$($service.Name) exited (code $($service.Process.ExitCode)). See the log files below." }
        }
        if (-not $musicReady -and (Test-Http $musicUrl)) { $musicReady = $true; Write-Host "CLAP API ready: $musicUrl" }
        if (Test-StopKey) { break }
        Start-Sleep -Seconds 1
    }
} finally {
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
