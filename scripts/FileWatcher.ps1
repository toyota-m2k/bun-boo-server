# パラメータの取得
param(
    [Parameter(Mandatory=$true)]
    [string]$Path,
    
    [Parameter(Mandatory=$false)]
    [string]$Filter = "*.*",
    
    [Parameter(Mandatory=$false)]
    [switch]$Recursive,

    [Parameter(Mandatory=$false)]
    [switch]$EnableDebug
)

# デバッグ出力の設定
if ($EnableDebug) {
    $DebugPreference = 'Continue'
    $PSDefaultParameterValues['*:DebugAction'] = 'Write-Error'
}

# デバッグ情報の出力関数
function Write-LogDebug {
    param([string]$Message)
    if ($EnableDebug) {
        Write-Debug $Message
    }
}

# デバッグ情報の出力
Write-LogDebug "Script started: Path=$Path, Filter=$Filter, Recursive=$Recursive"
Write-LogDebug "Process ID: $PID"

# ディレクトリの存在確認
if (-not (Test-Path $Path)) {
    Write-Error "Directory does not exist: $Path"
    exit 1
}
Write-LogDebug "Directory exists: $Path"

# FileSystemWatcherの作成
$watcher = New-Object System.IO.FileSystemWatcher
Write-LogDebug "FileSystemWatcher created successfully"

# イベントハンドラの配列
$handlers = @()

# イベントハンドラ
$onCreated = {
    param($sender, $e)
    try {
        Write-LogDebug "Created event: $($e.FullPath)"
        $output = @{
            changeType = "Created"
            name = $e.Name
            fullPath = $e.FullPath
        } | ConvertTo-Json -Compress
        Write-Host $output
    } catch {
        Write-Error "Error in Created event handler: $_"
    }
}

$onChanged = {
    param($sender, $e)
    try {
        Write-LogDebug "Changed event: $($e.FullPath)"
        $output = @{
            changeType = "Changed"
            name = $e.Name
            fullPath = $e.FullPath
        } | ConvertTo-Json -Compress
        Write-Host $output
    } catch {
        Write-Error "Error in Changed event handler: $_"
    }
}

$onDeleted = {
    param($sender, $e)
    try {
        Write-LogDebug "Deleted event: $($e.FullPath)"
        $output = @{
            changeType = "Deleted"
            name = $e.Name
            fullPath = $e.FullPath
        } | ConvertTo-Json -Compress
        Write-Host $output
    } catch {
        Write-Error "Error in Deleted event handler: $_"
    }
}

$onRenamed = {
    param($sender, $e)
    try {
        Write-LogDebug "Renamed event: $($e.FullPath)"
        $output = @{
            changeType = "Renamed"
            name = $e.Name
            fullPath = $e.FullPath
            oldName = $e.OldName
            oldFullPath = $e.OldFullPath
        } | ConvertTo-Json -Compress
        Write-Host $output
    } catch {
        Write-Error "Error in Renamed event handler: $_"
    }
}

try {
    # FileSystemWatcherの設定
    $watcher.Path = $Path
    $watcher.Filter = $Filter
    $watcher.IncludeSubdirectories = $Recursive
    $watcher.EnableRaisingEvents = $true
    Write-LogDebug "Watcher configured: Path=$Path, Filter=$Filter, IncludeSubdirectories=$Recursive"

    # イベントの登録とハンドラの保存
    Write-LogDebug "Registering event handlers..."
    
    $handler = Register-ObjectEvent -InputObject $watcher -EventName Created -Action $onCreated
    Write-LogDebug "Created handler state: $($handler.State)"
    $handlers += $handler

    $handler = Register-ObjectEvent -InputObject $watcher -EventName Changed -Action $onChanged
    Write-LogDebug "Changed handler state: $($handler.State)"
    $handlers += $handler

    $handler = Register-ObjectEvent -InputObject $watcher -EventName Deleted -Action $onDeleted
    Write-LogDebug "Deleted handler state: $($handler.State)"
    $handlers += $handler

    $handler = Register-ObjectEvent -InputObject $watcher -EventName Renamed -Action $onRenamed
    Write-LogDebug "Renamed handler state: $($handler.State)"
    $handlers += $handler

    Write-LogDebug "All event handlers registered"
    Write-LogDebug "Watching started"

    # プロセスが終了するまで待機
    $count = 0
    while ($true) { 
        Start-Sleep -Seconds 1
        $count++
        if ($count % 10 -eq 0) {
            # イベントハンドラの状態を確認（デバッグモード時のみ表示）
            foreach ($handler in $handlers) {
                Write-LogDebug "Handler state: $($handler.State)"
            }
        }
    }
} catch {
    Write-Error "Error in main script: $_"
} finally {
    # イベントハンドラの解除
    foreach ($handler in $handlers) {
        if ($handler) {
            Unregister-Event -SourceIdentifier $handler.Name
            Remove-Job -Name $handler.Name
        }
    }
    # FileSystemWatcherの解放
    if ($watcher) {
        $watcher.EnableRaisingEvents = $false
        $watcher.Dispose()
    }
} 