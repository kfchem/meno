# What the Meno under test was told in its Settings, read from its
# settings.json (src/lib/settings/appSettings.ts) where a run has to know:
# which way a turn of the wheel zooms (General, The wheel turned upwards).
# A file not there, or not read, is Meno's defaults, as Meno takes it.

function Read-MenoWheelUp {
    <#
      .SYNOPSIS
      What a turn of the wheel upwards does to the page, as a settings.json
      says it: "in" - Meno's default - or "out".
    #>
    param([Parameter(Mandatory)] [string] $Path)
    if (-not (Test-Path -LiteralPath $Path)) { return "in" }
    try { $s = Get-Content -Raw -LiteralPath $Path | ConvertFrom-Json } catch { return "in" }
    if ($s -and $s.PSObject.Properties["pointer"] -and $s.pointer -and $s.pointer.PSObject.Properties["wheelUp"] -and $s.pointer.wheelUp -eq "out") { return "out" }
    return "in"
}

Export-ModuleMember -Function Read-MenoWheelUp
