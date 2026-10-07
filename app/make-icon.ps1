# Icon of Coulisses (formerly Brambleshire Studio): a rounded square with the lime -> mint gradient and a dark « C ».
# Writes app\coulisses.ico (256, 64, 48, 32, 16 px, PNG entries) and favicon.png (256 px) next to the studio.
# usage: pwsh -File app\make-icon.ps1
Add-Type -AssemblyName System.Drawing
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $here
function Make-Png([int]$s) {
  $bmp = New-Object System.Drawing.Bitmap $s, $s
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'; $g.TextRenderingHint = 'AntiAliasGridFit'; $g.InterpolationMode = 'HighQualityBicubic'
  $g.Clear([System.Drawing.Color]::Transparent)
  $m = [Math]::Max(1, [int]($s * 0.04)); $w = $s - 2 * $m; $r = [int]($w * 0.30)
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $path.AddArc($m, $m, 2 * $r, 2 * $r, 180, 90); $path.AddArc($m + $w - 2 * $r, $m, 2 * $r, 2 * $r, 270, 90)
  $path.AddArc($m + $w - 2 * $r, $m + $w - 2 * $r, 2 * $r, 2 * $r, 0, 90); $path.AddArc($m, $m + $w - 2 * $r, 2 * $r, 2 * $r, 90, 90); $path.CloseFigure()
  $rect = New-Object System.Drawing.RectangleF $m, $m, $w, $w
  $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, ([System.Drawing.Color]::FromArgb(255, 220, 247, 122)), ([System.Drawing.Color]::FromArgb(255, 111, 226, 201)), 45.0
  $blend = New-Object System.Drawing.Drawing2D.ColorBlend 3
  $blend.Colors = @([System.Drawing.Color]::FromArgb(255, 220, 247, 122), [System.Drawing.Color]::FromArgb(255, 157, 238, 154), [System.Drawing.Color]::FromArgb(255, 111, 226, 201))
  $blend.Positions = @(0.0, 0.48, 1.0); $brush.InterpolationColors = $blend
  $g.FillPath($brush, $path)
  # soft highlight on the top half
  $hl = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, ([System.Drawing.Color]::FromArgb(70, 255, 255, 255)), ([System.Drawing.Color]::FromArgb(0, 255, 255, 255)), 90.0
  $g.FillPath($hl, $path)
  $fontName = 'Segoe UI'; foreach ($f in @('Outfit', 'Segoe UI Variable Display', 'Segoe UI')) { if ((New-Object System.Drawing.Text.InstalledFontCollection).Families.Name -contains $f) { $fontName = $f; break } }
  $font = New-Object System.Drawing.Font $fontName, ([single]($s * 0.56)), ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
  $fmt = New-Object System.Drawing.StringFormat; $fmt.Alignment = 'Center'; $fmt.LineAlignment = 'Center'
  $txt = New-Object System.Drawing.RectangleF $m, ($m + $s * 0.01), $w, $w
  $g.DrawString('C', $font, (New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 16, 20, 10))), $txt, $fmt)
  $g.Dispose()
  $ms = New-Object System.IO.MemoryStream; $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose()
  return ,$ms.ToArray()
}
$sizes = @(256, 64, 48, 32, 16)
$pngs = @{}; foreach ($s in $sizes) { $pngs[$s] = Make-Png $s }
[System.IO.File]::WriteAllBytes((Join-Path $root 'favicon.png'), $pngs[256])
# ICO container with PNG-compressed entries (Windows Vista and later)
$out = New-Object System.IO.MemoryStream; $bw = New-Object System.IO.BinaryWriter $out
$bw.Write([UInt16]0); $bw.Write([UInt16]1); $bw.Write([UInt16]$sizes.Count)
$offset = 6 + 16 * $sizes.Count
foreach ($s in $sizes) { $d = $pngs[$s]; $bw.Write([byte]($(if ($s -ge 256) { 0 } else { $s }))); $bw.Write([byte]($(if ($s -ge 256) { 0 } else { $s }))); $bw.Write([byte]0); $bw.Write([byte]0); $bw.Write([UInt16]1); $bw.Write([UInt16]32); $bw.Write([UInt32]$d.Length); $bw.Write([UInt32]$offset); $offset += $d.Length }
foreach ($s in $sizes) { $bw.Write($pngs[$s]) }
$bw.Flush(); [System.IO.File]::WriteAllBytes((Join-Path $here 'coulisses.ico'), $out.ToArray())
"icône : $(Join-Path $here 'coulisses.ico') · favicon : $(Join-Path $root 'favicon.png')"
