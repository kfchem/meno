# The Windows installer's logo (src-tauri/windows/installer.nsi): the wordmark
# (site/assets/wordmark-light.svg) drawn on white as 8-bit bitmaps, one for
# each display scale the installer picks from - the installer's window is
# 220 px wide (at 100 %), and a Windows static control shows bitmaps, not PNGs.
# Each pixel is the ink's share at that point, so the palette runs from white
# to the wordmark's colour and nothing is dithered.
#
# Windows only (WPF draws the paths). Run from the repository's root:
#   pwsh scripts/icons/installer-logo.ps1
param(
    [string] $Svg = "site/assets/wordmark-light.svg",
    [string] $OutDir = "src-tauri/windows/installer",
    [int] $Width = 220,
    [int[]] $Scales = @(100, 125, 150, 175, 200, 225, 250, 300)
)
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName PresentationCore, PresentationFramework, WindowsBase

[xml] $doc = Get-Content $Svg -Raw
$box = $doc.svg.viewBox -split '\s+' | ForEach-Object { [double] $_ }
$paths = @($doc.svg.path)
$inkColour = [System.Windows.Media.ColorConverter]::ConvertFromString($paths[0].fill)
foreach ($p in $paths) { if ($p.fill -ne $paths[0].fill) { throw "the wordmark has more than one colour" } }
New-Item -ItemType Directory -Force $OutDir | Out-Null

foreach ($scale in $Scales) {
    $w = [int][Math]::Round($Width * $scale / 100)
    $k = $w / $box[2]
    $h = [int][Math]::Ceiling($box[3] * $k)
    $visual = New-Object System.Windows.Media.DrawingVisual
    $dc = $visual.RenderOpen()
    $dc.DrawRectangle([System.Windows.Media.Brushes]::White, $null, (New-Object System.Windows.Rect 0, 0, $w, $h))
    $dc.PushTransform((New-Object System.Windows.Media.ScaleTransform $k, $k))
    foreach ($p in $paths) {
        $dc.DrawGeometry((New-Object System.Windows.Media.SolidColorBrush $inkColour), $null, [System.Windows.Media.Geometry]::Parse($p.d))
    }
    $dc.Pop(); $dc.Close()
    $bmp = New-Object System.Windows.Media.Imaging.RenderTargetBitmap $w, $h, 96, 96, ([System.Windows.Media.PixelFormats]::Pbgra32)
    $bmp.Render($visual)
    $stride = $w * 4
    $px = New-Object byte[] ($stride * $h)
    $bmp.CopyPixels($px, $stride, 0)

    # 8-bit, bottom-up rows padded to 4 bytes; index i is white blended i/255 toward the ink
    $row = ($w + 3) -band -4
    $ms = New-Object System.IO.MemoryStream
    $out = New-Object System.IO.BinaryWriter $ms
    $offset = 14 + 40 + 256 * 4
    $out.Write([byte[]] @(0x42, 0x4D)); $out.Write([int]($offset + $row * $h)); $out.Write([int] 0); $out.Write([int] $offset)
    $out.Write([int] 40); $out.Write([int] $w); $out.Write([int] $h); $out.Write([int16] 1); $out.Write([int16] 8)
    $out.Write([int] 0); $out.Write([int]($row * $h)); $out.Write([int] 3780); $out.Write([int] 3780); $out.Write([int] 256); $out.Write([int] 0)
    for ($i = 0; $i -lt 256; $i++) {
        $t = $i / 255
        $out.Write([byte][Math]::Round(255 + ($inkColour.B - 255) * $t))
        $out.Write([byte][Math]::Round(255 + ($inkColour.G - 255) * $t))
        $out.Write([byte][Math]::Round(255 + ($inkColour.R - 255) * $t))
        $out.Write([byte] 0)
    }
    $line = New-Object byte[] $row
    for ($y = $h - 1; $y -ge 0; $y--) {
        for ($x = 0; $x -lt $w; $x++) {
            # the red channel over white: 255 where there is no ink, the ink's red where it is solid
            $r = $px[$y * $stride + $x * 4 + 2]
            $line[$x] = [byte][Math]::Max(0, [Math]::Min(255, [Math]::Round((255 - $r) * 255 / (255 - $inkColour.R))))
        }
        $out.Write($line)
    }
    $out.Flush()
    $file = Join-Path $OutDir "logo-$scale.bmp"
    [IO.File]::WriteAllBytes($file, $ms.ToArray())
    "$file ${w}x$h"
}
