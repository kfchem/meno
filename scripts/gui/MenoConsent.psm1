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
    # (a chain given as nothing is an empty one: nothing has the keys)
    return [pscustomobject]@{ Chain = @($r.Chain | Where-Object { $null -ne $_ }); Unread = $null }
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

Export-ModuleMember -Function Read-Part, Test-NetworkYes, Test-PageReached, Assert-NotNetworkYes
