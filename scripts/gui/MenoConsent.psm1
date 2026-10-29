# A question Meno asks before it uses the network (src/ui/network/ConsentDialog.tsx)
# is answered by the person at the computer, never by a GUI run. Every such
# question has one yes, "Allow and download"; a click or a drag that would
# press it, or a key that would - one sent while it has the focus, Escape
# (a no) aside - stops the run before anything is sent, on either desktop.
#
# The platform modules read what is there: the part of the window at a
# point, or the one with the focus, as Accessibility (UI Automation on
# Windows) names it, and what it sits in - a chain of "role<TAB>name",
# itself first. This module decides. What could not be read is never taken
# for "not the yes": an error, or nothing read at all, stops the input too.
#
# On Windows a press is told by the buttons themselves, not by the point:
# Tauri lays a window for its resize borders over the whole page, which
# lets the mouse through but stops UI Automation, so the part at any point
# is that pane. Every button of Meno's windows is read, with where it is,
# and a press inside one named as the yes is stopped; a reading that fails,
# or holds no button at all, stops it too.
#
# MENO_GUI_ANSWER_NETWORK_YES=1, set by hand for one run, lets such input
# through, saying so. Nothing in the repository sets it.

$script:YesName = "Allow*"
$script:ButtonRoles = @("AXButton", "Button")
# (what a Mac's hit test lands on before the web view has built its page's parts: the page itself, or what holds it)
$script:PageHolders = @("AXWebArea", "AXScrollArea", "AXWindow", "AXApplication", "")

function Read-Part {
    <#
      .SYNOPSIS
      A platform's reading of a part, as the guard takes it: -Read gives an
      object with its Chain (empty where nothing has the keys); a throw, or
      nothing given, is a reading that failed, and says why (Unread).
    #>
    param([Parameter(Mandatory)] [scriptblock] $Read)
    try { $r = & $Read } catch { return [pscustomobject]@{ Chain = @(); Unread = "$($_.Exception.Message)" } }
    if ($null -eq $r -or -not $r.PSObject.Properties["Chain"]) { return [pscustomobject]@{ Chain = @(); Unread = "nothing was read" } }
    # (Tauri's pane for its resize borders, over the whole page on Windows: what is under it was not read)
    $first = @($r.Chain | Where-Object { $null -ne $_ })[0]
    if ("$first" -like "Pane`tTAURI_DRAG_RESIZE*") { return [pscustomobject]@{ Chain = @(); Unread = "UI Automation sees Tauri's resize borders there, not the page under them" } }
    # (a chain given as nothing is an empty one: nothing has the keys)
    return [pscustomobject]@{ Chain = @($r.Chain | Where-Object { $null -ne $_ }); Unread = $null }
}

function Read-Buttons {
    <#
      .SYNOPSIS
      A platform's reading of the buttons on screen, as the guard takes it:
      -Read gives an object with its Buttons (Name, X, Y, Width, Height, in
      the units of the press they are held against); a throw, or nothing
      given, is a reading that failed, and says why (Unread).
    #>
    param([Parameter(Mandatory)] [scriptblock] $Read)
    try { $r = & $Read } catch { return [pscustomobject]@{ Buttons = @(); Unread = "$($_.Exception.Message)" } }
    if ($null -eq $r -or -not $r.PSObject.Properties["Buttons"]) { return [pscustomobject]@{ Buttons = @(); Unread = "nothing was read" } }
    $buttons = @($r.Buttons | Where-Object { $null -ne $_ })
    # (a yes read with no bounds: where it is, unknown)
    $blind = @($buttons | Where-Object { "$($_.Name)" -like $script:YesName -and -not ($_.Width -gt 0 -and $_.Height -gt 0) })
    if ($blind.Count) { return [pscustomobject]@{ Buttons = @(); Unread = "'$($blind[0].Name)' was read with no bounds" } }
    # (Page: whether the reader saw the page itself, with something in it - a talk hides the top bar, and may show no button at all)
    $page = [bool]($r.PSObject.Properties["Page"] -and $r.Page)
    return [pscustomobject]@{ Buttons = $buttons; Page = $page; Unread = $null }
}

function Test-PageButtonsRead {
    # Whether a reading of Meno's window holds its page's parts: the page itself seen, with something in it. Buttons never say so - the window frame's are named in the system's language - they only tell the yes.
    param([Parameter(Mandatory)] $Look)
    return [bool]($Look.PSObject.Properties["Page"] -and $Look.Page)
}

function Read-PageButtons {
    <#
      .SYNOPSIS
      Meno's buttons read (Read-Buttons) until the reading holds the page's
      parts - a web view builds what it shows UI Automation only once asked,
      and a first reading may hold the window's frame alone, or nothing - for
      up to -TimeoutMs; one that never does is unread.
    #>
    param([Parameter(Mandatory)] [scriptblock] $Read, [int] $TimeoutMs = 5000, [int] $StepMs = 300)
    $until = [DateTime]::UtcNow.AddMilliseconds($TimeoutMs)
    while ($true) {
        $look = Read-Buttons -Read $Read
        if ($look.Unread -or (Test-PageButtonsRead -Look $look)) { return $look }
        if ([DateTime]::UtcNow -ge $until) { return [pscustomobject]@{ Buttons = @(); Unread = "no button of Meno's page was read in $([int]($TimeoutMs / 1000)) s" } }
        Start-Sleep -Milliseconds $StepMs
    }
}

function Assert-OnMeno {
    <#
      .SYNOPSIS
      Stop before a press at a point that is not on Meno's window - another
      copy of Meno's, another app's - or whose window could not be told:
      -Read gives the pid of the process whose window is at the point, and
      -Family the processes that are Meno's own (its web view's among them).
    #>
    param([Parameter(Mandatory)] [scriptblock] $Read, [Parameter(Mandatory)] [int] $MenoPid, [Parameter(Mandatory)] [string] $What, [int[]] $Family = @())
    $at = try { & $Read } catch { "could not be told ($($_.Exception.Message))" }
    if ($at -is [int] -and ($at -eq $MenoPid -or $Family -contains $at)) { return }
    if ($env:MENO_GUI_ANSWER_NETWORK_YES -eq "1" -and -not ($at -is [int])) { return }
    $whose = if ($at -is [int]) { "pid $at's" } elseif ($null -eq $at) { "nothing's" } else { "a window that $at" }
    throw "$What is not on Meno's window (pid $MenoPid) but on $whose, so input sent there would not go to Meno. Stopping; nothing was sent."
}

function Find-YesUnder {
    # The yes of a question about the network that a press at -At (X, Y) lands on, among -Buttons as Read-Buttons gives them - a pixel or two round each taken in - or nothing.
    param([AllowEmptyCollection()] [object[]] $Buttons = @(), [Parameter(Mandatory)] $At)
    foreach ($b in @($Buttons)) {
        if ("$($b.Name)" -notlike $script:YesName) { continue }
        if ($At.X -ge $b.X - 2 -and $At.X -le $b.X + $b.Width + 2 -and $At.Y -ge $b.Y - 2 -and $At.Y -le $b.Y + $b.Height + 2) { return $b }
    }
    return $null
}

function Assert-NotPressingYes {
    <#
      .SYNOPSIS
      Stop before a press at -At that lands on the yes of a question about
      the network, or whose buttons could not be read: -Look as Read-Buttons
      gives it, -What saying what the press is, for the message.
    #>
    param([Parameter(Mandatory)] $Look, [Parameter(Mandatory)] $At, [Parameter(Mandatory)] [string] $What)
    $override = $env:MENO_GUI_ANSWER_NETWORK_YES -eq "1"
    if ($Look.Unread) {
        if ($override) { Write-Warning "$What could not be told from a question's yes ($($Look.Unread)): MENO_GUI_ANSWER_NETWORK_YES=1 lets it through."; return }
        throw ("$What could not be told from the yes of a question about the network: Meno's buttons could not be read ($($Look.Unread)). " +
            "Stopping; nothing was sent.")
    }
    $yes = Find-YesUnder -Buttons $Look.Buttons -At $At
    if (-not $yes) { return }
    if ($override) { Write-Warning "$What answers a question about the network yes ('$($yes.Name)'): MENO_GUI_ANSWER_NETWORK_YES=1 lets it through."; return }
    throw ("$What would answer a question about the network yes ('$($yes.Name)'). That answer is for the person at the computer, " +
        "never a run's: answer it no (Escape) or leave it. Stopping; nothing was sent.")
}

function Test-NetworkYes {
    <#
      .SYNOPSIS
      Whether a part of the window - its chain of "role<TAB>name", itself
      first, then what it sits in - is the yes of a question about the
      network, or in it: a button named Allow... .
    #>
    param([AllowEmptyCollection()] [string[]] $Chain = @())
    foreach ($link in $Chain) {
        $role, $name = "$link" -split "`t", 2
        if ($role -in $script:ButtonRoles -and "$name" -like $script:YesName) { return $true }
    }
    return $false
}

function Test-PageReached {
    # Whether a Mac's hit test reached a part of the page - not the page itself, nor what holds it: then the web view has built its parts.
    param([AllowEmptyCollection()] [string[]] $Chain = @())
    if (-not $Chain.Count) { return $false }
    $role = ("$($Chain[0])" -split "`t", 2)[0]
    return $role -notin $script:PageHolders
}

function Assert-NotNetworkYes {
    <#
      .SYNOPSIS
      Stop before input that would answer a question about the network yes,
      or whose part could not be read: -Look as Read-Part gives it, -What
      saying what the input is, for the message.
    #>
    param([Parameter(Mandatory)] $Look, [Parameter(Mandatory)] [string] $What)
    $override = $env:MENO_GUI_ANSWER_NETWORK_YES -eq "1"
    if ($Look.Unread) {
        if ($override) { Write-Warning "$What could not be told from a question's yes ($($Look.Unread)): MENO_GUI_ANSWER_NETWORK_YES=1 lets it through."; return }
        throw ("$What could not be told from the yes of a question about the network: what is there could not be read ($($Look.Unread)). " +
            "Stopping; nothing was sent.")
    }
    if (-not (Test-NetworkYes -Chain $Look.Chain)) { return }
    $yes = @($Look.Chain | Where-Object { $role, $name = "$_" -split "`t", 2; $role -in $script:ButtonRoles -and "$name" -like $script:YesName })[0]
    $name = ("$yes" -split "`t", 2)[1]
    if ($override) {
        Write-Warning "$What answers a question about the network yes ('$name'): MENO_GUI_ANSWER_NETWORK_YES=1 lets it through."
        return
    }
    throw ("$What would answer a question about the network yes ('$name'). That answer is for the person at the computer, " +
        "never a run's: answer it no (Escape) or leave it. Stopping; nothing was sent.")
}

Export-ModuleMember -Function Read-Part, Read-Buttons, Test-PageButtonsRead, Read-PageButtons, Assert-OnMeno, Find-YesUnder, Test-NetworkYes, Test-PageReached, Assert-NotNetworkYes, Assert-NotPressingYes
