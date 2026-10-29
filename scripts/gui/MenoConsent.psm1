# A question Meno asks before it uses the network (src/ui/network/ConsentDialog.tsx)
# is answered by the person at the computer, never by a GUI run. Every such
# question has one yes, "Allow and download"; a click or a drag that would
# press it, or a key that would - one sent while it has the focus, Escape
# (a no) aside - stops the run before anything is sent, on either desktop.
#
# The platform modules say what is there: the part of the window at a point,
# or the one with the focus, as Accessibility (UI Automation on Windows)
# names it, and what it sits in - a chain of "role<TAB>name", itself first.
# This module decides.
#
# MENO_GUI_ANSWER_NETWORK_YES=1, set by hand for one run, lets such input
# through, saying so. Nothing in the repository sets it.

$script:YesName = "Allow*"
$script:ButtonRoles = @("AXButton", "Button")

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

function Assert-NotNetworkYes {
    <#
      .SYNOPSIS
      Stop before input that would answer a question about the network yes:
      -What says what the input is, for the message.
    #>
    param([AllowEmptyCollection()] [string[]] $Chain = @(), [Parameter(Mandatory)] [string] $What)
    if (-not (Test-NetworkYes -Chain $Chain)) { return }
    $yes = @($Chain | Where-Object { $role, $name = "$_" -split "`t", 2; $role -in $script:ButtonRoles -and "$name" -like $script:YesName })[0]
    $name = ("$yes" -split "`t", 2)[1]
    if ($env:MENO_GUI_ANSWER_NETWORK_YES -eq "1") {
        Write-Warning "$What answers a question about the network yes ('$name'): MENO_GUI_ANSWER_NETWORK_YES=1 lets it through."
        return
    }
    throw ("$What would answer a question about the network yes ('$name'). That answer is for the person at the computer, " +
        "never a run's: answer it no (Escape) or leave it. Stopping; nothing was sent.")
}

Export-ModuleMember -Function Test-NetworkYes, Assert-NotNetworkYes
