# Run only inside Windows Sandbox or an explicit GitHub-hosted disposable Windows runner.
# This harness never changes APPDATA, uses smoke flags, downloads files, or changes security policy.
[CmdletBinding()]
param(
    [ValidateSet('Sandbox', 'GitHubActions')]
    [string]$Environment = 'Sandbox',
    [string]$InputRoot,
    [string]$OutputRoot
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$requestedInputRoot = $InputRoot
$requestedOutputRoot = $OutputRoot
$inputRoot = if ($Environment -eq 'Sandbox') { 'C:\ReleaseTestInput' } else { $requestedInputRoot }
$outputRoot = if ($Environment -eq 'Sandbox') { 'C:\ReleaseTestOutput' } else { $requestedOutputRoot }
$workRoot = 'C:\ReleaseTest'
$guestRoot = 'C:\Users\WDAGUtilityAccount'
$roamingRoot = Join-Path $guestRoot 'AppData\Roaming'
$localRoot = Join-Path $guestRoot 'AppData\Local'
$runRoot = $null
$runnerTempRoot = $null
$githubIdentity = $null
$profileRoot = Join-Path $guestRoot 'AppData\Roaming\algo-electron'
$installRoot = Join-Path $guestRoot 'AppData\Local\Programs\AlgoLearningPlatform'
$appPath = Join-Path $installRoot 'AlgoLearningPlatform.exe'
$asarPath = Join-Path $installRoot 'resources\app.asar'
$dbPath = Join-Path $profileRoot 'data\algo-learning.sqlite'
$checkpointPath = "$dbPath.migration-attempt.json"
$appLog = Join-Path $profileRoot 'logs\main.log'
$baselineName = 'AlgoLearningPlatform-Windows-2.0.0-x64-Setup.exe'
$candidateName = 'AlgoLearningPlatform-Windows-2.0.1-x64-Setup.exe'
$baselineSha256 = '5576cab81b879f192b01e5867a81c192297353f3767310efe7f904079d7c6ccc'
$baselineSize = 121203039
$script:report = $null
$script:mayWriteEvidence = $false
$script:hasOwnedApp = $false
$script:stepNumber = 0
$utf8 = New-Object System.Text.UTF8Encoding($false)

function Assert-True([bool]$Condition, [string]$Message) {
    if (-not $Condition) { throw $Message }
}

function Assert-SamePath([string]$Actual, [string]$Expected) {
    Assert-True ([IO.Path]::GetFullPath($Actual).TrimEnd('\') -ieq [IO.Path]::GetFullPath($Expected).TrimEnd('\')) "Unexpected path: $Actual"
}

function Assert-ChildPath([string]$File, [string]$Root) {
    $full = [IO.Path]::GetFullPath($File)
    $boundary = [IO.Path]::GetFullPath($Root).TrimEnd('\') + '\'
    Assert-True ($full.StartsWith($boundary, [StringComparison]::OrdinalIgnoreCase)) "Path escaped owned root: $full"
}

function Assert-NoLinks([string]$File, [string]$StopAt) {
    $current = [IO.Path]::GetFullPath($File)
    $boundary = [IO.Path]::GetFullPath($StopAt).TrimEnd('\')
    Assert-True (($current.TrimEnd('\') -ieq $boundary) -or $current.StartsWith($boundary + '\', [StringComparison]::OrdinalIgnoreCase)) 'Invalid path boundary'
    while ($true) {
        if (Test-Path -LiteralPath $current) {
            $item = Get-Item -LiteralPath $current -Force
            Assert-True (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -eq 0) "Linked path refused: $current"
        }
        if ($current.TrimEnd('\') -ieq $boundary) { break }
        $current = [IO.Path]::GetDirectoryName($current)
    }
}

function Resolve-LocalAbsolutePath([string]$Value) {
    Assert-True (-not [string]::IsNullOrWhiteSpace($Value) -and $Value -match '^[A-Za-z]:[\\/]') 'An absolute local drive path is required'
    $full = [IO.Path]::GetFullPath($Value).TrimEnd('\')
    $drive = [IO.Path]::GetPathRoot($full)
    Assert-True ($full.Length -gt $drive.Length) 'A drive root cannot be an owned test directory'
    Assert-NoLinks $full $drive
    return $full
}

function Get-Sha256([string]$File) {
    return (Get-FileHash -LiteralPath $File -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Save-Report {
    if ($script:mayWriteEvidence -and $null -ne $script:report) {
        $script:report.updatedAt = [DateTime]::UtcNow.ToString('o')
        [IO.File]::WriteAllText((Join-Path $outputRoot 'report.json'), ($script:report | ConvertTo-Json -Depth 40), $utf8)
    }
}

function Invoke-Step([string]$Name, [scriptblock]$Action) {
    $script:stepNumber += 1
    $step = [ordered]@{ number = $script:stepNumber; name = $Name; startedAt = [DateTime]::UtcNow.ToString('o'); status = 'running'; result = $null; error = $null }
    $script:report.steps.Add($step)
    Save-Report
    try {
        $step.result = & $Action
        $step.status = 'passed'
    } catch {
        $step.status = 'failed'
        $step.error = $_.Exception.Message
        throw
    } finally {
        $step['finishedAt'] = [DateTime]::UtcNow.ToString('o')
        Save-Report
    }
    return $step.result
}

function Wait-Condition([scriptblock]$Condition, [int]$Seconds, [string]$Failure) {
    $deadline = [DateTime]::UtcNow.AddSeconds($Seconds)
    do {
        if (& $Condition) { return }
        Start-Sleep -Milliseconds 200
    } while ([DateTime]::UtcNow -lt $deadline)
    throw $Failure
}

function Start-GuestProcess([string]$File, [string[]]$Arguments, [string]$Directory, [bool]$CaptureOutput = $false) {
    # Windows PowerShell 5 Start-Process -PassThru can return a detached Process
    # whose ExitCode stays null after WaitForExit. Process.Start owns the native
    # launch handle immediately, including children that exit before the first wait.
    $quoted = foreach ($argument in $Arguments) {
        # All arguments are fixed harness tokens, paths or a validated UUID.
        Assert-True ($argument -notmatch '["\r\n]' -and -not $argument.EndsWith('\')) 'Unsupported harness process argument'
        '"' + $argument + '"'
    }
    $start = New-Object System.Diagnostics.ProcessStartInfo
    $start.FileName = $File
    $start.Arguments = $quoted -join ' '
    $start.WorkingDirectory = $Directory
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.WindowStyle = [Diagnostics.ProcessWindowStyle]::Hidden
    $start.RedirectStandardOutput = $CaptureOutput
    $start.RedirectStandardError = $CaptureOutput
    # Keep runner/upload credentials in the parent only, including ambient Actions tokens.
    # The real default-profile folders and non-authentication environment remain unchanged.
    foreach ($name in @('GH_TOKEN', 'GITHUB_TOKEN', 'GH_ENTERPRISE_TOKEN', 'GITHUB_ENTERPRISE_TOKEN', 'ACTIONS_RUNTIME_TOKEN', 'ACTIONS_ID_TOKEN_REQUEST_TOKEN')) {
        $start.EnvironmentVariables.Remove($name)
    }
    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $start
    Assert-True ($process.Start()) 'Unable to start owned guest process'
    Assert-True ($process.Handle -ne [IntPtr]::Zero) 'Started process has no owned handle'
    return $process
}

function Get-VerifiedExitCode([Diagnostics.Process]$Process) {
    Assert-True $Process.HasExited 'Cannot read an exit code before process completion'
    $code = $Process.ExitCode
    Assert-True ($null -ne $code -and $code -is [int]) 'Completed process did not expose a verified exit code'
    return $code
}

function Get-AppProcesses {
    $processes = @(Get-Process -Name 'AlgoLearningPlatform' -ErrorAction SilentlyContinue)
    $owned = New-Object 'System.Collections.Generic.List[System.Diagnostics.Process]'
    foreach ($process in $processes) {
        $process.Refresh()
        if ($process.HasExited) { continue }
        try {
            $actualPath = $process.Path
        } catch {
            $pathError = $_
            $process.Refresh()
            if ($process.HasExited) { continue }
            throw $pathError
        }
        if ([string]::IsNullOrEmpty($actualPath)) {
            $process.Refresh()
            if ($process.HasExited) { continue }
            throw 'Cannot verify ownership of a running application process'
        }
        Assert-SamePath $actualPath $appPath
        $owned.Add($process)
    }
    return $owned.ToArray()
}

function Assert-AppClosed {
    Assert-True (@(Get-AppProcesses).Count -eq 0) 'Application still owns the profile; refusing file/SQL operations'
    Assert-NoLinks $dbPath $guestRoot
    if (Test-Path -LiteralPath $dbPath) {
        $stream = [IO.File]::Open($dbPath, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::None)
        $stream.Dispose()
    }
}

function Invoke-Data([string]$Action) {
    Assert-AppClosed
    $prefix = '{0:D2}-{1}' -f $script:stepNumber, $Action
    $stdout = Join-Path $outputRoot "$prefix.stdout.json"
    $stderr = Join-Path $outputRoot "$prefix.stderr.txt"
    $arguments = @((Join-Path $workRoot 'sandbox-upgrade-data.mjs'), $Action)
    if ($Environment -eq 'GitHubActions') { $arguments += '--environment=GitHubActions' }
    $process = Start-GuestProcess (Join-Path $workRoot 'node.exe') $arguments $workRoot $true
    $stdoutTask = $process.StandardOutput.ReadToEndAsync()
    $stderrTask = $process.StandardError.ReadToEndAsync()
    $timedOut = -not $process.WaitForExit(60000)
    if ($timedOut) {
        Assert-SamePath $process.Path (Join-Path $workRoot 'node.exe')
        $process.Kill()
        Assert-True ($process.WaitForExit(10000)) 'Timed-out fixture helper could not be stopped'
    }
    $process.WaitForExit()
    Assert-True ($stdoutTask.Wait(10000) -and $stderrTask.Wait(10000)) 'Fixture helper output did not finish after process exit'
    [IO.File]::WriteAllText($stdout, $stdoutTask.GetAwaiter().GetResult(), $utf8)
    [IO.File]::WriteAllText($stderr, $stderrTask.GetAwaiter().GetResult(), $utf8)
    $exitCode = Get-VerifiedExitCode $process
    if ($timedOut) { throw "Fixture helper timed out: $Action; preserve guest evidence" }
    Assert-True ($exitCode -eq 0) "Fixture helper failed: $Action with exit $exitCode (see $prefix.stderr.txt)"
    $result = Get-Content -LiteralPath $stdout -Raw | ConvertFrom-Json
    Assert-True ($result.status -eq 'passed' -and $result.action -eq $Action) 'Helper response missing successful assertions'
    return $result
}

function Get-InstallRegistrations {
    $roots = @(
        'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall',
        'HKCU:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall'
    )
    foreach ($root in $roots) {
        if (-not (Test-Path -LiteralPath $root)) { continue }
        foreach ($key in Get-ChildItem -LiteralPath $root) {
            $value = Get-ItemProperty -LiteralPath $key.PSPath
            if ($null -eq $value) { continue }
            $displayName = $value.PSObject.Properties['DisplayName']
            if ($null -ne $displayName -and $displayName.Value -eq 'AlgoLearningPlatform') {
                $value
            }
        }
    }
}

function Get-ProductShortcuts {
    $menu = Join-Path $roamingRoot 'Microsoft\Windows\Start Menu\Programs'
    Assert-NoLinks $menu $guestRoot
    if (Test-Path -LiteralPath $menu) {
        return @(Get-ChildItem -LiteralPath $menu -Filter 'AlgoLearningPlatform.lnk' -Recurse -File)
    }
    return @()
}

function Get-InstalledEvidence([string]$Version) {
    Assert-NoLinks $appPath $guestRoot
    Assert-True (Test-Path -LiteralPath $appPath -PathType Leaf) 'Installed executable missing'
    Assert-NoLinks $asarPath $guestRoot
    Assert-True (Test-Path -LiteralPath $asarPath -PathType Leaf) 'Installed ASAR missing'
    $pe = [Diagnostics.FileVersionInfo]::GetVersionInfo($appPath)
    Assert-True ($pe.ProductVersion -match ('^' + [regex]::Escape($Version) + '(?:\.0)?$')) 'Installed ProductVersion mismatch'
    Assert-True ($pe.FileVersion -match ('^' + [regex]::Escape($Version) + '(?:\.0)?$')) 'Installed FileVersion mismatch'
    $registrations = @(Get-InstallRegistrations)
    Assert-True ($registrations.Count -eq 1) 'Expected exactly one current-user uninstall registration'
    $registration = $registrations[0]
    foreach ($name in @('PSChildName', 'PSPath', 'DisplayVersion', 'UninstallString')) {
        Assert-True ($null -ne $registration.PSObject.Properties[$name]) "Installed registry property missing: $name"
    }
    $installKey = Join-Path 'HKCU:\Software' $registration.PSChildName
    if ($registration.PSPath -match 'WOW6432Node') {
        $installKey = Join-Path 'HKCU:\Software\WOW6432Node' $registration.PSChildName
    }
    $installRecord = Get-ItemProperty -LiteralPath $installKey
    Assert-True ($null -ne $installRecord -and $null -ne $installRecord.PSObject.Properties['InstallLocation']) 'Installed registry location missing'
    Assert-SamePath $installRecord.InstallLocation $installRoot
    Assert-True ($registration.DisplayVersion -eq $Version) 'Registry DisplayVersion mismatch'
    Assert-True ($registration.UninstallString -match '^"([^"\r\n]+)"\s+/currentuser\s*$') 'Unexpected current-user uninstall command'
    $uninstaller = $Matches[1]
    Assert-ChildPath $uninstaller $installRoot
    Assert-NoLinks $uninstaller $guestRoot
    Assert-True (Test-Path -LiteralPath $uninstaller -PathType Leaf) 'Uninstaller missing'
    $shortcuts = @(Get-ProductShortcuts)
    Assert-True ($shortcuts.Count -eq 1) 'Expected one Start Menu shortcut'
    $shell = New-Object -ComObject WScript.Shell
    try {
        $shortcut = $shell.CreateShortcut($shortcuts[0].FullName)
        Assert-True ($null -ne $shortcut) 'Start Menu shortcut could not be read'
        Assert-SamePath $shortcut.TargetPath $appPath
        Assert-True ([string]::IsNullOrEmpty($shortcut.Arguments)) 'Unexpected shortcut arguments'
    } finally {
        [void][Runtime.InteropServices.Marshal]::ReleaseComObject($shell)
    }
    return [ordered]@{ executable = $appPath; productVersion = $pe.ProductVersion; fileVersion = $pe.FileVersion; sha256 = Get-Sha256 $appPath; asarSha256 = Get-Sha256 $asarPath; registry = $registration.PSPath; installRegistry = $installKey; displayVersion = $registration.DisplayVersion; startMenu = $shortcuts[0].FullName; uninstaller = $uninstaller }
}

function Invoke-Installer([string]$File, [string]$Version) {
    Assert-AppClosed
    $process = Start-GuestProcess $File @('/S', '/currentuser') $workRoot
    Assert-True ($process.WaitForExit(180000)) 'NSIS install timed out; no automatic retry'
    $process.WaitForExit()
    $exitCode = Get-VerifiedExitCode $process
    Assert-True ($exitCode -eq 0) "NSIS install failed with exit $exitCode"
    $evidence = Get-InstalledEvidence $Version
    if ($Version -eq '2.0.1') {
        Assert-True ($evidence.asarSha256 -ceq $manifest.candidateAsarSha256) 'Installed candidate ASAR differs from the verified host build'
    }
    $evidence['installerExitCode'] = $exitCode
    $evidence['installerSha256'] = Get-Sha256 $File
    $evidence['arguments'] = @('/S', '/currentuser')
    return $evidence
}

function Get-LogLength {
    if (-not (Test-Path -LiteralPath $appLog)) { return 0 }
    return (Get-Item -LiteralPath $appLog).Length
}

function Read-NewLog([long]$Offset) {
    if (-not (Test-Path -LiteralPath $appLog)) { return '' }
    $bytes = [IO.File]::ReadAllBytes($appLog)
    Assert-True ($bytes.Length -ge $Offset) 'App log rotated unexpectedly; cannot reuse readiness evidence'
    return [Text.Encoding]::UTF8.GetString($bytes, [int]$Offset, $bytes.Length - [int]$Offset)
}

function Start-App([string[]]$Arguments = @()) {
    Assert-AppClosed
    Assert-NoLinks $appPath $guestRoot
    $script:hasOwnedApp = $true
    return Start-GuestProcess $appPath $Arguments $installRoot
}

function Stop-App([Diagnostics.Process]$Process, [bool]$AllowDialogStop = $false, [int]$ExpectedExit = 0) {
    if ($AllowDialogStop) {
        Wait-Condition {
            $Process.Refresh()
            return ($Process.HasExited -or $Process.MainWindowHandle -ne 0)
        } 10 'Expected recovery dialog was not observable'
    }
    $Process.Refresh()
    $closeRequested = $false
    if (-not $Process.HasExited) { $closeRequested = $Process.CloseMainWindow() }
    $forced = $false
    if (-not $Process.WaitForExit(15000)) {
        Assert-True $AllowDialogStop 'Normal application did not close gracefully; preserve the failure'
        Assert-SamePath $Process.Path $appPath
        $Process.Kill()
        Assert-True ($Process.WaitForExit(10000)) 'Dialog test stop did not exit'
        $forced = $true
        $script:report.limitations.Add('A verified recovery dialog required a test-only process stop; natural dialog completion and its exit code were not asserted.')
    }
    $Process.WaitForExit()
    $exitCode = Get-VerifiedExitCode $Process
    Wait-Condition { @(Get-AppProcesses).Count -eq 0 } 15 'Application descendants remain; refusing SQL access'
    if (-not $forced) { Assert-True ($exitCode -eq $ExpectedExit) "Unexpected application exit code: $exitCode" }
    Assert-AppClosed
    return [ordered]@{ pid = $Process.Id; closeMainWindowRequested = $closeRequested; forcedDialogStop = $forced; exitCode = $exitCode; expectedNaturalExitCode = $ExpectedExit; allApplicationProcessesClosed = $true }
}

function Invoke-NormalStartup([string]$Version) {
    $installed = Get-InstalledEvidence $Version
    $offset = Get-LogLength
    $process = Start-App
    Wait-Condition {
        $process.Refresh()
        Assert-True (-not $process.HasExited) 'Application exited before startup readiness'
        $text = Read-NewLog $offset
        Assert-True ($text -notmatch 'main-process\.fatal|\[FATAL\]') 'Fatal startup error in main.log'
        return ($process.MainWindowHandle -ne 0 -and $text -match 'app\.ready' -and (Test-Path -LiteralPath $dbPath -PathType Leaf))
    } 90 'No real app window/log/database readiness within 90 seconds'
    $text = Read-NewLog $offset
    # Published 2.0.0 predates app.launch and its version field. Its installed PE and
    # registry are verified above; only the candidate promises this additional event.
    if ($Version -eq '2.0.1') {
        Assert-True ($text -match ('app\.launch[^\r\n]+"version":"' + [regex]::Escape($Version) + '"')) 'Candidate launch log lacks expected installed version'
    }
    $window = [ordered]@{ pid = $process.Id; handle = $process.MainWindowHandle.ToInt64(); title = $process.MainWindowTitle; responding = $process.Responding }
    Assert-True $process.Responding 'Application window is not responding'
    $close = Stop-App $process
    Assert-True (-not (Test-Path -LiteralPath (Join-Path $profileRoot 'session-running.marker'))) 'Normal shutdown left the session-running marker'
    $newLog = Read-NewLog $offset
    Assert-True ($newLog -notmatch 'main-process\.fatal|\[FATAL\]') 'Fatal error during normal startup/shutdown'
    $logName = '{0:D2}-application.log' -f $script:stepNumber
    [IO.File]::WriteAllText((Join-Path $outputRoot $logName), $newLog, $utf8)
    return [ordered]@{ version = $Version; installed = $installed; window = $window; close = $close; log = $logName; logSha256 = Get-Sha256 (Join-Path $outputRoot $logName) }
}

function Invoke-BlockedStartup {
    Assert-AppClosed
    $databaseBefore = Get-Sha256 $dbPath
    $checkpointBefore = Get-Sha256 $checkpointPath
    $offset = Get-LogLength
    $process = Start-App
    Wait-Condition {
        $text = Read-NewLog $offset
        return ($text -match 'main-process\.fatal' -and $text -match 'requires verified recovery before startup')
    } 60 'Expected unresolved-checkpoint startup refusal was not observed'
    $process.Refresh()
    $window = [ordered]@{ pid = $process.Id; handle = $process.MainWindowHandle.ToInt64(); title = $process.MainWindowTitle }
    $close = Stop-App $process $true 1
    Assert-True ((Get-Sha256 $dbPath) -eq $databaseBefore) 'Blocked startup changed database bytes'
    Assert-True ((Get-Sha256 $checkpointPath) -eq $checkpointBefore) 'Blocked startup changed the prepared checkpoint'
    $text = Read-NewLog $offset
    Assert-True ($text -notmatch 'db\.migration-started') 'Blocked startup ran a migration'
    [IO.File]::WriteAllText((Join-Path $outputRoot 'blocked-startup.log'), $text, $utf8)
    return [ordered]@{ window = $window; close = $close; databaseSha256 = $databaseBefore; preparedCheckpointSha256 = $checkpointBefore; fatalRefusalObserved = $true }
}

function Invoke-KeepCurrent([string]$AttemptId) {
    Assert-True ($AttemptId -match '^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$') 'Invalid attempt identity'
    $arguments = @("--resolve-upgrade=$AttemptId", '--resolution=keep-current')
    $process = Start-App $arguments
    Wait-Condition {
        $record = Get-Content -LiteralPath $checkpointPath -Raw | ConvertFrom-Json
        if ($record.state -eq 'resolved-keep-current') { return $true }
        $process.Refresh()
        Assert-True (-not $process.HasExited) 'Maintenance exited before persisting resolution'
        return $false
    } 90 'Installed maintenance did not persist a verified keep-current resolution'
    $process.Refresh()
    $window = [ordered]@{ pid = $process.Id; handle = $process.MainWindowHandle.ToInt64(); title = $process.MainWindowTitle }
    $close = Stop-App $process $true 0
    return [ordered]@{ arguments = $arguments; defaultProfile = $profileRoot; observedState = 'resolved-keep-current'; window = $window; close = $close }
}

function Invoke-Uninstall([string]$Uninstaller) {
    Assert-AppClosed
    Assert-ChildPath $Uninstaller $installRoot
    Assert-NoLinks $Uninstaller $guestRoot
    $process = Start-GuestProcess $Uninstaller @('/S', '/currentuser') $workRoot
    Assert-True ($process.WaitForExit(180000)) 'NSIS uninstall timed out; no automatic retry'
    $process.WaitForExit()
    $exitCode = Get-VerifiedExitCode $process
    Assert-True ($exitCode -eq 0) "NSIS uninstall failed with exit $exitCode"
    # NSIS may relaunch its temporary uninstaller before the initial process exits.
    Wait-Condition { -not (Test-Path -LiteralPath $appPath) -and @(Get-InstallRegistrations).Count -eq 0 -and @(Get-ProductShortcuts).Count -eq 0 } 60 'Uninstall did not remove executable, registry and Start Menu shortcut'
    Assert-True (Test-Path -LiteralPath $dbPath -PathType Leaf) 'Uninstaller removed retained profile database'
    return [ordered]@{ arguments = @('/S', '/currentuser'); exitCode = $exitCode; executableAbsent = $true; uninstallRegistryAbsent = $true; startMenuShortcutAbsent = $true; profileRetained = $true }
}

function Copy-Evidence {
    if (-not $script:mayWriteEvidence) { return }
    Assert-AppClosed
    $destination = Join-Path $outputRoot 'synthetic-profile-evidence'
    New-Item -ItemType Directory -Path $destination -ErrorAction Stop | Out-Null
    foreach ($name in @('config.json', 'data', 'backups', 'config-normalization-backups', 'notes', 'userscripts', 'logs')) {
        $source = Join-Path $profileRoot $name
        if (-not (Test-Path -LiteralPath $source)) { continue }
        Assert-ChildPath $source $profileRoot
        Assert-NoLinks $source $guestRoot
        if (Test-Path -LiteralPath $source -PathType Container) {
            foreach ($item in Get-ChildItem -LiteralPath $source -Recurse -Force) { Assert-NoLinks $item.FullName $guestRoot }
        }
        Copy-Item -LiteralPath $source -Destination $destination -Recurse
    }
    foreach ($name in @('seed.json', 'legacy-config.json', 'normalized-config.json', 'completed-checkpoint.json', 'owner.json')) {
        $source = Join-Path $workRoot $name
        if (Test-Path -LiteralPath $source -PathType Leaf) { Copy-Item -LiteralPath $source -Destination $outputRoot }
    }
    $script:report['evidence'] = @(Get-ChildItem -LiteralPath $outputRoot -Recurse -File | Where-Object { $_.Name -ne 'report.json' } | ForEach-Object {
        [ordered]@{ relativePath = $_.FullName.Substring($outputRoot.Length + 1); size = $_.Length; sha256 = Get-Sha256 $_.FullName }
    })
}

try {
    Assert-True ([Environment]::OSVersion.Platform -eq [PlatformID]::Win32NT -and [Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString() -ceq 'X64') 'A Windows x64 guest is required'
    if ($Environment -eq 'Sandbox') {
        Assert-True (-not $PSBoundParameters.ContainsKey('InputRoot') -and -not $PSBoundParameters.ContainsKey('OutputRoot')) 'Path overrides are forbidden in Sandbox mode'
        Assert-True ([Environment]::UserName -ceq 'WDAGUtilityAccount') 'Refusing to run outside the Windows Sandbox guest account'
        Assert-SamePath $env:USERPROFILE $guestRoot
        Assert-SamePath $env:APPDATA $roamingRoot
        Assert-SamePath $env:LOCALAPPDATA $localRoot
        Assert-ChildPath $env:TEMP $guestRoot
    } else {
        Assert-True ($env:GITHUB_ACTIONS -ceq 'true' -and $env:RUNNER_ENVIRONMENT -ceq 'github-hosted' -and $env:RUNNER_OS -ceq 'Windows') 'Only a GitHub-hosted Windows Actions runner is allowed'
        Assert-True ($PSBoundParameters.ContainsKey('InputRoot') -and $PSBoundParameters.ContainsKey('OutputRoot')) 'GitHubActions requires explicit input and output directories'
        Assert-True ($env:GITHUB_RUN_ID -cmatch '^[1-9][0-9]*$' -and $env:GITHUB_RUN_ATTEMPT -cmatch '^[1-9][0-9]*$' -and $env:GITHUB_REPOSITORY -cmatch '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$' -and $env:GITHUB_SHA -cmatch '^[0-9a-f]{40}$') 'Incomplete GitHub run identity'
        $guestRoot = Resolve-LocalAbsolutePath $env:USERPROFILE
        Assert-SamePath $guestRoot ([Environment]::GetFolderPath([Environment+SpecialFolder]::UserProfile))
        $roamingRoot = Resolve-LocalAbsolutePath $env:APPDATA
        $localRoot = Resolve-LocalAbsolutePath $env:LOCALAPPDATA
        Assert-ChildPath $roamingRoot $guestRoot
        Assert-ChildPath $localRoot $guestRoot
        Assert-SamePath $roamingRoot ([Environment]::GetFolderPath([Environment+SpecialFolder]::ApplicationData))
        Assert-SamePath $localRoot ([Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData))
        Assert-SamePath $roamingRoot (Join-Path $guestRoot 'AppData\Roaming')
        Assert-SamePath $localRoot (Join-Path $guestRoot 'AppData\Local')
        $runnerTempRoot = Resolve-LocalAbsolutePath $env:RUNNER_TEMP
        Assert-True (Test-Path -LiteralPath $runnerTempRoot -PathType Container) 'Runner temporary root missing'
        $inputRoot = Resolve-LocalAbsolutePath $requestedInputRoot
        $outputRoot = Resolve-LocalAbsolutePath $requestedOutputRoot
        Assert-ChildPath $inputRoot $runnerTempRoot
        Assert-ChildPath $outputRoot $runnerTempRoot
        $runRoot = [IO.Path]::GetDirectoryName($inputRoot)
        Assert-ChildPath $runRoot $runnerTempRoot
        Assert-SamePath ([IO.Path]::GetDirectoryName($runRoot)) $runnerTempRoot
        Assert-SamePath $inputRoot (Join-Path $runRoot 'input')
        Assert-SamePath $outputRoot (Join-Path $runRoot 'output')
        Assert-True ([IO.Path]::GetFileName($runRoot) -cmatch '^algo-installer-[A-Za-z0-9_-]+$') 'Expected an exclusive installer job directory'
        $workRoot = Join-Path $runRoot 'work'
        Assert-NoLinks $workRoot $runnerTempRoot
        Assert-True (Test-Path -LiteralPath $inputRoot -PathType Container) 'Prepared job input directory missing'
        $profileRoot = Join-Path $roamingRoot 'algo-electron'
        $installRoot = Join-Path $localRoot 'Programs\AlgoLearningPlatform'
        $appPath = Join-Path $installRoot 'AlgoLearningPlatform.exe'
        $asarPath = Join-Path $installRoot 'resources\app.asar'
        $dbPath = Join-Path $profileRoot 'data\algo-learning.sqlite'
        $checkpointPath = "$dbPath.migration-attempt.json"
        $appLog = Join-Path $profileRoot 'logs\main.log'
        $githubIdentity = [ordered]@{ runId = $env:GITHUB_RUN_ID; runAttempt = $env:GITHUB_RUN_ATTEMPT; repository = $env:GITHUB_REPOSITORY; sha = $env:GITHUB_SHA }
    }
    Assert-SamePath $PSScriptRoot $inputRoot
    Assert-NoLinks $profileRoot $guestRoot
    Assert-NoLinks $installRoot $guestRoot
    Assert-True (-not (Test-Path -LiteralPath $workRoot)) 'Fresh work root required; do not blindly retry'
    Assert-True (-not (Test-Path -LiteralPath $profileRoot)) 'Guest app profile already exists'
    Assert-True (-not (Test-Path -LiteralPath $installRoot)) 'Guest installation already exists'
    Assert-True (@(Get-AppProcesses).Count -eq 0) 'Guest application process already exists'
    Assert-True (@(Get-InstallRegistrations).Count -eq 0) 'Guest installation registry already exists'
    Assert-True (@(Get-ProductShortcuts).Count -eq 0) 'Guest Start Menu shortcut already exists'
    foreach ($entry in Get-ChildItem Env:) {
        Assert-True (-not $entry.Name.StartsWith('ALGO_ELECTRON_SMOKE_')) 'Smoke profile environment is forbidden'
        Assert-True ($entry.Name -notin @('ELECTRON_RUN_AS_NODE', 'NODE_OPTIONS', 'VITE_DEV_SERVER_URL')) 'Runtime override environment is forbidden'
    }
    if ($Environment -eq 'GitHubActions' -and -not (Test-Path -LiteralPath $outputRoot)) {
        New-Item -ItemType Directory -Path $outputRoot | Out-Null
    }
    Assert-True (Test-Path -LiteralPath $outputRoot -PathType Container) 'Dedicated writable output directory is required'
    Assert-True (@(Get-ChildItem -LiteralPath $outputRoot -Force).Count -eq 0) 'Output must be empty; previous evidence is never overwritten'
    $script:mayWriteEvidence = $true
    $script:report = [ordered]@{
        formatVersion = 1; status = 'running'; startedAt = [DateTime]::UtcNow.ToString('o'); updatedAt = ''
        environment = $Environment; github = $githubIdentity; workRoot = $workRoot
        sourceSha = $null; sourceTreeSha256 = $null; sourceDirty = $null
        username = [Environment]::UserName; machine = [Environment]::MachineName; windowsVersion = [Environment]::OSVersion.VersionString
        profile = $profileRoot; installation = $installRoot
        scope = 'Actual NSIS and installed-app runs with synthetic guest rows/files only. No source migrations, real logins, decryption claim, or seven-site/UI navigation claim.'
        sourceIdentity = 'Engineering acceptance. sourceSha identifies the base HEAD; sourceTreeSha256 identifies the host-supplied frozen source tree, including uncommitted changes when sourceDirty is true. The guest cannot independently certify source-to-installer provenance.'
        recoveryScenario = 'A real completed schema29-to30 checkpoint is changed only to prepared; this is detection/keep-current coverage, not a genuine crash injection.'
        limitations = New-Object 'System.Collections.Generic.List[string]'; steps = New-Object 'System.Collections.Generic.List[object]'; errors = New-Object 'System.Collections.Generic.List[string]'
    }
    Save-Report
    $expectedInputs = @($baselineName, $candidateName, 'node.exe', 'sandbox-upgrade-guest.ps1', 'sandbox-upgrade-data.mjs', 'input-manifest.json') | Sort-Object
    $actualInputs = @(Get-ChildItem -LiteralPath $inputRoot -Force)
    Assert-True (@($actualInputs | Where-Object { $_.PSIsContainer }).Count -eq 0) 'Input mapping must contain only the six dedicated files'
    Assert-True ((($actualInputs.Name | Sort-Object) -join '|') -ceq ($expectedInputs -join '|')) 'Unexpected/missing input file; do not map the repository or a host profile'
    foreach ($item in $actualInputs) {
        Assert-True (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -eq 0) 'Linked input file refused'
    }
    $manifest = Get-Content -LiteralPath (Join-Path $inputRoot 'input-manifest.json') -Raw | ConvertFrom-Json
    $manifestFields = @('formatVersion', 'sourceSha', 'sourceTreeSha256', 'sourceDirty', 'candidateSize', 'candidateSha256', 'candidateAsarSha256', 'nodeSha256', 'guestScriptSha256', 'fixtureHelperSha256') | Sort-Object
    Assert-True ((($manifest.PSObject.Properties.Name | Sort-Object) -join '|') -ceq ($manifestFields -join '|')) 'Unexpected or missing input manifest field'
    Assert-True ($manifest.formatVersion -eq 1 -and $manifest.sourceSha -cmatch '^[0-9a-f]{40}$' -and $manifest.sourceTreeSha256 -cmatch '^[0-9a-f]{64}$' -and $manifest.sourceDirty -is [bool]) 'Invalid input source identity'
    if ($Environment -eq 'GitHubActions') {
        Assert-True ($manifest.sourceSha -ceq $githubIdentity.sha -and -not $manifest.sourceDirty) 'GitHub installer acceptance requires the clean checked-out run SHA'
    }
    foreach ($field in @('candidateSha256', 'candidateAsarSha256', 'nodeSha256', 'guestScriptSha256', 'fixtureHelperSha256')) {
        Assert-True ($manifest.$field -is [string] -and $manifest.$field -cmatch '^[0-9a-f]{64}$') "Invalid input hash: $field"
    }
    $baseline = Join-Path $inputRoot $baselineName
    $candidate = Join-Path $inputRoot $candidateName
    Assert-True ((Get-Item -LiteralPath $baseline).Length -eq $baselineSize -and (Get-Sha256 $baseline) -ceq $baselineSha256) 'Published baseline installer hash/size mismatch'
    Assert-True ($manifest.candidateSize -gt 0 -and (Get-Item -LiteralPath $candidate).Length -eq $manifest.candidateSize -and (Get-Sha256 $candidate) -ceq $manifest.candidateSha256) 'Candidate installer hash/size mismatch'
    Assert-True ((Get-Sha256 (Join-Path $inputRoot 'node.exe')) -ceq $manifest.nodeSha256) 'Node executable hash mismatch'
    Assert-True ((Get-Sha256 $PSCommandPath) -ceq $manifest.guestScriptSha256) 'Guest script hash mismatch'
    Assert-True ((Get-Sha256 (Join-Path $inputRoot 'sandbox-upgrade-data.mjs')) -ceq $manifest.fixtureHelperSha256) 'Fixture helper hash mismatch'
    $script:report.sourceSha = $manifest.sourceSha
    $script:report.sourceTreeSha256 = $manifest.sourceTreeSha256
    $script:report.sourceDirty = $manifest.sourceDirty
    $script:report['inputManifestSha256'] = Get-Sha256 (Join-Path $inputRoot 'input-manifest.json')
    $script:report['baselineSha256'] = $baselineSha256
    $script:report['candidateSha256'] = $manifest.candidateSha256
    $script:report['candidateAsarSha256'] = $manifest.candidateAsarSha256
    $script:report['nodeSha256'] = $manifest.nodeSha256
    $script:report['scriptSha256'] = Get-Sha256 $PSCommandPath
    $script:report['helperSha256'] = Get-Sha256 (Join-Path $inputRoot 'sandbox-upgrade-data.mjs')
    Save-Report
    New-Item -ItemType Directory -Path $workRoot | Out-Null
    $owner = @{ kind = 'algo-nsis-synthetic-guest-v1'; runId = [Guid]::NewGuid().ToString(); environment = $Environment; username = [Environment]::UserName; profile = $profileRoot; workRoot = $workRoot; github = $githubIdentity }
    [IO.File]::WriteAllText((Join-Path $workRoot 'owner.json'), ($owner | ConvertTo-Json), $utf8)
    Copy-Item -LiteralPath (Join-Path $inputRoot 'node.exe') -Destination $workRoot
    Copy-Item -LiteralPath (Join-Path $inputRoot 'sandbox-upgrade-data.mjs') -Destination $workRoot
    $nodeProbe = Start-GuestProcess (Join-Path $workRoot 'node.exe') @('--version') $workRoot $true
    Assert-True ($nodeProbe.WaitForExit(10000)) 'Node version probe timed out'
    $nodeVersion = $nodeProbe.StandardOutput.ReadToEnd().Trim()
    $nodeProbe.WaitForExit()
    Assert-True ((Get-VerifiedExitCode $nodeProbe) -eq 0 -and $nodeVersion -match '^v22\.(\d+)\.\d+$' -and [int]$Matches[1] -ge 18) 'Use real Node 22.18+ with node:sqlite'
    $script:report['nodeVersion'] = $nodeVersion
    [void](Invoke-Step 'Create isolated default-profile config' { Invoke-Data 'bootstrap' })
    [void](Invoke-Step 'Install published 2.0.0 using default current-user location' { Invoke-Installer $baseline '2.0.0' })
    [void](Invoke-Step 'Launch and close the installed 2.0.0 app' { Invoke-NormalStartup '2.0.0' })
    [void](Invoke-Step 'Verify installed baseline created schema29' { Invoke-Data 'assert-schema29' })
    [void](Invoke-Step 'Seed synthetic closed-profile rows and files' { Invoke-Data 'seed' })
    [void](Invoke-Step 'Restart installed 2.0.0 with the synthetic profile' { Invoke-NormalStartup '2.0.0' })
    [void](Invoke-Step 'Assert baseline rows, envelopes, binary data and files' { Invoke-Data 'verify-baseline' })
    [void](Invoke-Step 'Stage exact legacy config bytes after closing baseline' { Invoke-Data 'stage-legacy' })
    $installed = Invoke-Step 'Upgrade with candidate 2.0.1 NSIS' { Invoke-Installer $candidate '2.0.1' }
    [void](Invoke-Step 'Launch and close the installed upgraded app' { Invoke-NormalStartup '2.0.1' })
    [void](Invoke-Step 'Assert schema30 conversion, source backup and raw config protection' { Invoke-Data 'verify-upgraded' })
    [void](Invoke-Step 'Add a synthetic record after upgrade' { Invoke-Data 'add-new-row' })
    [void](Invoke-Step 'Normal restart after new data' { Invoke-NormalStartup '2.0.1' })
    [void](Invoke-Step 'Assert new data remains after restart' { Invoke-Data 'verify-new-row' })
    $simulated = Invoke-Step 'Simulate unfinished marker on the real completed checkpoint' { Invoke-Data 'simulate-unfinished' }
    [void](Invoke-Step 'Assert normal startup refuses the unresolved checkpoint' { Invoke-BlockedStartup })
    [void](Invoke-Step 'Assert refused startup preserved current rows and recovery material' { Invoke-Data 'verify-blocked' })
    [void](Invoke-Step 'Run installed keep-current maintenance for default guest profile' { Invoke-KeepCurrent $simulated.attemptId })
    [void](Invoke-Step 'Assert verified audit and current-state backup retain post-upgrade row' { Invoke-Data 'verify-resolved' })
    [void](Invoke-Step 'Normal restart after explicit resolution' { Invoke-NormalStartup '2.0.1' })
    [void](Invoke-Step 'Assert normal startup retains resolved current data' { Invoke-Data 'verify-resolved' })
    [void](Invoke-Step 'Uninstall current-user installation while retaining profile' { Invoke-Uninstall $installed.uninstaller })
    [void](Invoke-Step 'Assert profile survives actual NSIS uninstall' { Invoke-Data 'verify-resolved' })
    [void](Invoke-Step 'Reinstall candidate into default current-user location' { Invoke-Installer $candidate '2.0.1' })
    [void](Invoke-Step 'Launch and close reinstalled app' { Invoke-NormalStartup '2.0.1' })
    [void](Invoke-Step 'Assert reinstall retains new row, config backup and files' { Invoke-Data 'verify-resolved' })
    $script:report.status = if ($script:report.limitations.Count -eq 0) { 'passed' } else { 'passed-with-limitations' }
} catch {
    if ($null -ne $script:report) {
        $script:report.status = 'failed'
        $script:report.errors.Add($_.Exception.Message)
        $script:report['failureLocation'] = $_.ScriptStackTrace
    }
    Write-Error -Message $_.Exception.Message -ErrorAction Continue
} finally {
    if ($script:hasOwnedApp) {
        try {
            foreach ($process in @(Get-AppProcesses)) {
                [void]$process.CloseMainWindow()
                if (-not $process.WaitForExit(5000)) {
                    Stop-Process -Id $process.Id -Force
                    [void]$process.WaitForExit(10000)
                    $script:report.limitations.Add('Failure cleanup stopped an owned installed-app process; this is not a passed graceful-close assertion.')
                }
            }
        } catch {
            $script:report.errors.Add("Owned-process cleanup failed: $($_.Exception.Message)")
            $script:report.status = 'failed'
        }
    }
    if ($script:mayWriteEvidence) {
        try { Copy-Evidence } catch {
            $script:report.errors.Add("Evidence capture failed: $($_.Exception.Message)")
            $script:report.status = 'failed'
        }
        $script:report['finishedAt'] = [DateTime]::UtcNow.ToString('o')
        Save-Report
    }
}
if ($null -eq $script:report -or $script:report.status -eq 'failed') { exit 1 }
if ($script:report.status -eq 'passed-with-limitations') { exit 2 }
exit 0
