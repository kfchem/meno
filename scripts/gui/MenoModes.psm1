# Which running copies of Meno's executable are the app, on either desktop.
#
# The same executable also runs in modes that are not the app, each started
# by a flag as its first argument (src-tauri/src/lib.rs, `run`): a workflow
# job's runner (`--job`, jobs.rs `JOB_FLAG`), which outlives the app; the PDF
# reader the app starts for itself (`--pdf`, pdf.rs `PDF_FLAG`); and, on
# Windows, the installer's Office registration (`--register-ole`,
# `--unregister-ole`, lib.rs `registration_asked`). None of them has the
# window a run drives, and any of them may belong to another copy of Meno -
# another session's - so the harness never counts or closes them.
# tests/modes.tests.ps1 checks this list against the flags the Rust side
# defines.

$script:MenoWorkerFlags = @("--job", "--pdf", "--register-ole", "--unregister-ole")

function Get-MenoWorkerFlags {
    # The flags that start Meno's executable as something other than the app.
    $script:MenoWorkerFlags
}

function Test-MenoWorkerLine {
    <#
      .SYNOPSIS
      Whether a command line is Meno's executable started in one of those
      modes: the executable (`Meno`, `Meno.exe`, quoted or not, its folder
      however named) and then one of the flags as its first argument.
    #>
    param([AllowEmptyString()] [AllowNull()] [string] $Line)
    if (-not $Line) { return $false }
    $flags = ($script:MenoWorkerFlags | ForEach-Object { [regex]::Escape($_) }) -join "|"
    return $Line -match "(^|[\\/])Meno(\.exe)?""?\s+($flags)(\s|$)"
}

function Test-MenoWorker {
    <#
      .SYNOPSIS
      Whether a running process named Meno is one of those: its command line
      read from the system (`ps` on a Mac, the process's own on Windows).
    #>
    param([Parameter(Mandatory)] $Process)
    $line = if ($IsWindows) { $Process.CommandLine } else { (& /bin/ps -o command= -p $Process.Id) -join " " }
    return Test-MenoWorkerLine $line
}

Export-ModuleMember -Function Get-MenoWorkerFlags, Test-MenoWorkerLine, Test-MenoWorker
