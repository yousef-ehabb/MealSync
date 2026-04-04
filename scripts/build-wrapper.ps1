#!/usr/bin/env pwsh
$baseDir = "$env:LOCALAPPDATA\electron-builder\Cache\winCodeSign"
$archivePath = "$baseDir\winCodeSign-2.6.0.7z"
$7za = "node_modules/7zip-bin/win/x64/7za.exe"
$extracted = @{}

function Extract-WinCodeSign($targetDir) {
    $hash = Split-Path $targetDir -Leaf
    if ($extracted.ContainsKey($hash)) { return }
    Write-Host "[Monitor] Pre-extracting winCodeSign to $hash..."
    New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
    $result = & $7za x $archivePath "-o$targetDir" "-x!darwin" "-x!linux" "-x!mac" "-x!freebsd" -bd -y 2>&1 | Select-Object -Last 1
    Write-Host "[Monitor] Extracted: $result"
    $extracted[$hash] = $true
}

# Pre-extract to all existing folders
Write-Host "[Monitor] Pre-extracting to existing folders..."
Get-ChildItem $baseDir -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -match "^\d+$" } | ForEach-Object {
    Extract-WinCodeSign $_.FullName
}

# Watch for new folders
Write-Host "[Monitor] Watching for new winCodeSign folders..."
$watcher = New-Object System.IO.FileSystemWatcher $baseDir
$watcher.EnableRaisingEvents = $true
$watcher.IncludeSubdirectories = $false
$watcher.Created += {
    if ($Event.SourceEventArgs.FullPath -match "\\\d+$") {
        Start-Sleep -Milliseconds 200
        Extract-WinCodeSign $Event.SourceEventArgs.FullPath
    }
}
$watcher.Deleted += {
    $hash = Split-Path $Event.SourceEventArgs.FullPath -Leaf
    if ($hash -match "^\d+$") {
        $extracted.Remove($hash)
    }
}

# Keep running for the build duration
try {
    $buildJob = Start-Job -ScriptBlock {
        Set-Location $using:PWD
        npm run build:win 2>&1
    }
    
    while (-not $buildJob.HasMoreData -and $buildJob.State -eq 'Running') {
        Start-Sleep -Seconds 2
    }
    
    $buildOutput = Receive-Job $buildJob -Keep
    Write-Host $buildOutput
    
    $buildJob | Remove-Job -Force
    
} finally {
    $watcher.EnableRaisingEvents = $false
    $watcher.Dispose()
    Write-Host "[Monitor] Stopped."
}
