Add-Type -AssemblyName System.Drawing

$coverDir = Join-Path $PSScriptRoot 'assets\covers'
New-Item -ItemType Directory -Path $coverDir -Force | Out-Null

function Get-Color([string]$Hex) {
  return [System.Drawing.ColorTranslator]::FromHtml($Hex)
}

function Add-Circle($Graphics, [string]$Color, [float]$X, [float]$Y, [float]$Width, [float]$Height, [switch]$Outline, [float]$Stroke = 2) {
  $colorValue = Get-Color $Color
  if ($Outline) {
    $pen = New-Object System.Drawing.Pen($colorValue, $Stroke)
    $Graphics.DrawEllipse($pen, $X, $Y, $Width, $Height)
    $pen.Dispose()
  } else {
    $brush = New-Object System.Drawing.SolidBrush($colorValue)
    $Graphics.FillEllipse($brush, $X, $Y, $Width, $Height)
    $brush.Dispose()
  }
}

function Add-Line($Graphics, [string]$Color, [float]$X1, [float]$Y1, [float]$X2, [float]$Y2, [float]$Stroke = 2) {
  $pen = New-Object System.Drawing.Pen((Get-Color $Color), $Stroke)
  $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $Graphics.DrawLine($pen, $X1, $Y1, $X2, $Y2)
  $pen.Dispose()
}

function Add-Polygon($Graphics, [string]$Color, [int[]]$Coordinates) {
  $points = [System.Drawing.Point[]]::new($Coordinates.Length / 2)
  for ($index = 0; $index -lt $Coordinates.Length; $index += 2) {
    $points[$index / 2] = [System.Drawing.Point]::new($Coordinates[$index], $Coordinates[$index + 1])
  }
  $brush = New-Object System.Drawing.SolidBrush((Get-Color $Color))
  $Graphics.FillPolygon($brush, $points)
  $brush.Dispose()
}

function Add-Title($Graphics, [string[]]$Lines) {
  $font = New-Object System.Drawing.Font('Arial', 30, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $smallFont = New-Object System.Drawing.Font('Arial', 11, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $white = New-Object System.Drawing.SolidBrush((Get-Color '#fff9ed'))
  $accent = New-Object System.Drawing.SolidBrush((Get-Color '#f2c66d'))
  $graphics.FillRectangle((New-Object System.Drawing.SolidBrush((Get-Color '#10151e'))), 0, 385, 420, 215)
  $graphics.FillRectangle((New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(150, 11, 17, 27))), 0, 355, 420, 90)
  $graphics.DrawString('ORIGINAL COVER STUDY', $smallFont, $accent, 30, 398)
  for ($line = 0; $line -lt $Lines.Length; $line++) {
    $text = $Lines[$line]
    $size = 30
    do {
      $font.Dispose()
      $font = New-Object System.Drawing.Font('Arial', $size, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
      $measured = $graphics.MeasureString($text, $font)
      $size -= 1
    } while ($measured.Width -gt 360 -and $size -gt 17)
    $graphics.DrawString($text, $font, $white, 28, (420 + ($line * 39)))
  }
  Add-Line $graphics '#596575' 30 535 390 535 1
  $graphics.DrawString('ORIGINAL ARTWORK', $smallFont, $accent, 30, 548)
  $font.Dispose(); $smallFont.Dispose(); $white.Dispose(); $accent.Dispose()
}

function New-Cover([string]$Slug, [string]$Top, [string]$Bottom, [string[]]$TitleLines, [scriptblock]$Art) {
  $bitmap = New-Object System.Drawing.Bitmap(420, 600)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $rect = New-Object System.Drawing.Rectangle(0, 0, 420, 600)
  $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, (Get-Color $Top), (Get-Color $Bottom), 45)
  $graphics.FillRectangle($brush, $rect)
  $brush.Dispose()
  $rand = New-Object System.Random(([Math]::Abs($Slug.GetHashCode()) % 30000) + 1)
  for ($dot = 0; $dot -lt 55; $dot++) {
    $x = $rand.Next(12, 408); $y = $rand.Next(12, 365)
    Add-Circle $graphics '#fff5d5' $x $y 2 2
  }
  & $Art $graphics
  Add-Title $graphics $TitleLines
  $bitmap.Save((Join-Path $coverDir "$Slug.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  $graphics.Dispose(); $bitmap.Dispose()
  Write-Output "Created $Slug.png"
}

New-Cover 'solo-leveling' '#101c35' '#254b68' @('SOLO', 'LEVELING') {
  param($g)
  Add-Circle $g '#d9e8e6' 245 68 112 112
  Add-Circle $g '#101c35' 268 58 112 112
  Add-Circle $g '#66c2dc' 203 28 190 190 -Outline -Stroke 2
  Add-Line $g '#6bd0e6' 72 300 330 84 3
  Add-Polygon $g '#152338' @(0, 330, 80, 260, 126, 330, 190, 210, 265, 330, 335, 245, 420, 330, 420, 390, 0, 390)
  Add-Line $g '#f2c66d' 84 110 84 300 2
  Add-Line $g '#f2c66d' 84 140 110 140 2
}

New-Cover 'demon-slayer' '#102d3b' '#315b66' @('DEMON', 'SLAYER') {
  param($g)
  Add-Circle $g '#e87368' 225 64 138 138
  for ($i = 0; $i -lt 6; $i++) { Add-Line $g '#f8d5a5' 232 (115 + ($i * 22)) 388 (94 + ($i * 22)) 2 }
  Add-Line $g '#f7e6c8' 55 340 335 82 7
  Add-Line $g '#dc625c' 52 345 332 87 2
  Add-Circle $g '#f7e6c8' 36 314 26 26
  Add-Polygon $g '#183949' @(0, 292, 78, 324, 156, 300, 234, 333, 310, 305, 420, 341, 420, 385, 0, 385)
  Add-Polygon $g '#d3a87d' @(0, 338, 98, 359, 210, 336, 320, 365, 420, 337, 420, 386, 0, 386)
}

New-Cover 'fullmetal-alchemist' '#243c55' '#be874c' @('FULLMETAL', 'ALCHEMIST') {
  param($g)
  Add-Circle $g '#f1ce87' 93 72 230 230 -Outline -Stroke 3
  Add-Circle $g '#f1ce87' 120 99 176 176 -Outline -Stroke 1
  Add-Line $g '#f1ce87' 104 118 311 256 2
  Add-Line $g '#f1ce87' 311 118 104 256 2
  Add-Line $g '#e9d8b4' 208 78 208 296 2
  Add-Line $g '#e9d8b4' 72 181 344 181 2
  Add-Polygon $g '#dbad5d' @(208, 112, 253, 247, 137, 164, 279, 164, 163, 247)
  Add-Circle $g '#d88253' 178 148 60 60
  Add-Circle $g '#f4dfb2' 194 164 28 28
}

New-Cover 'jujutsu-kaisen' '#211a35' '#5e294c' @('JUJUTSU', 'KAISEN') {
  param($g)
  Add-Circle $g '#cf597c' 114 55 196 196 -Outline -Stroke 5
  Add-Circle $g '#29213b' 143 84 138 138
  Add-Circle $g '#e0a0b0' 173 114 78 78 -Outline -Stroke 2
  for ($i = 0; $i -lt 12; $i++) {
    $angle = $i * [Math]::PI / 6
    $x1 = 210 + [Math]::Cos($angle) * 104
    $y1 = 153 + [Math]::Sin($angle) * 104
    $x2 = 210 + [Math]::Cos($angle) * 190
    $y2 = 153 + [Math]::Sin($angle) * 190
    Add-Line $g '#dd7997' $x1 $y1 $x2 $y2 2
  }
  Add-Polygon $g '#151322' @(0, 290, 100, 235, 180, 300, 260, 232, 420, 310, 420, 390, 0, 390)
  Add-Line $g '#f2c66d' 55 276 355 222 2
}

New-Cover 'vinland-saga' '#183449' '#8ea99c' @('VINLAND', 'SAGA') {
  param($g)
  Add-Circle $g '#f2d8a2' 276 62 80 80
  Add-Polygon $g '#304e5c' @(0, 239, 110, 214, 215, 236, 320, 207, 420, 231, 420, 330, 0, 330)
  Add-Polygon $g '#557a80' @(0, 270, 112, 246, 231, 270, 326, 244, 420, 262, 420, 390, 0, 390)
  Add-Polygon $g '#d8d4bd' @(101, 250, 194, 119, 190, 253)
  Add-Polygon $g '#e5dfc8' @(207, 244, 268, 156, 271, 246)
  Add-Line $g '#f1e6ca' 57 266 313 268 3
  Add-Line $g '#263f4a' 67 280 310 280 4
  Add-Polygon $g '#253843' @(74, 280, 97, 292, 278, 292, 309, 280, 277, 304, 101, 304)
}

New-Cover 'frieren' '#b1c8bb' '#486e69' @('FRIEREN') {
  param($g)
  Add-Circle $g '#f4efd8' 251 57 104 104
  Add-Circle $g '#b1c8bb' 272 42 103 103
  for ($i = 0; $i -lt 9; $i++) {
    $x = 44 + ($i * 38)
    Add-Line $g '#e6d9ae' $x 345 ($x + 35) (218 - (($i % 3) * 24)) 2
    Add-Circle $g '#f4efd8' ($x + 24) (210 - (($i % 3) * 24)) 7 7
  }
  Add-Line $g '#304f4c' 215 344 206 226 4
  Add-Line $g '#304f4c' 207 273 161 238 3
  Add-Line $g '#304f4c' 209 298 250 260 3
  Add-Polygon $g '#49645b' @(0, 328, 93, 298, 170, 327, 254, 300, 340, 328, 420, 298, 420, 390, 0, 390)
  Add-Circle $g '#f0d18d' 97 91 6 6
  Add-Circle $g '#f0d18d' 122 143 5 5
}

New-Cover 'spy-x-family' '#507c82' '#e8a879' @('SPY x FAMILY') {
  param($g)
  Add-Circle $g '#e9c46a' 51 74 150 150
  Add-Circle $g '#ef886d' 148 110 140 140
  Add-Circle $g '#8ec6b3' 231 70 132 132
  Add-Polygon $g '#243e49' @(0, 262, 77, 203, 142, 261, 213, 184, 292, 260, 361, 210, 420, 258, 420, 390, 0, 390)
  Add-Line $g '#fff0d1' 35 320 385 320 2
  Add-Circle $g '#fff0d1' 192 240 37 37 -Outline -Stroke 2
  Add-Line $g '#fff0d1' 210 276 210 345 2
}

New-Cover 'blue-lock' '#071d3a' '#006e9e' @('BLUE LOCK') {
  param($g)
  Add-Circle $g '#36d6ee' 96 54 228 228 -Outline -Stroke 5
  Add-Circle $g '#092849' 117 75 186 186
  Add-Polygon $g '#d7f8f2' @(210, 104, 252, 132, 236, 181, 184, 181, 168, 132)
  Add-Polygon $g '#d7f8f2' @(136, 152, 168, 132, 184, 181, 155, 219, 113, 201)
  Add-Polygon $g '#d7f8f2' @(236, 181, 252, 132, 286, 151, 309, 200, 267, 219)
  Add-Line $g '#38d5ec' 14 249 126 199 4
  Add-Line $g '#38d5ec' 296 102 412 53 4
  Add-Line $g '#f2c66d' 28 291 157 231 2
  Add-Line $g '#f2c66d' 270 230 397 175 2
}

New-Cover 'one-piece' '#153b58' '#cf7251' @('ONE PIECE') {
  param($g)
  Add-Circle $g '#e9ae62' 255 66 118 118
  Add-Circle $g '#fff0c8' 291 102 46 46
  Add-Line $g '#f4dfb3' 315 55 315 220 2
  Add-Line $g '#f4dfb3' 232 138 396 138 2
  Add-Line $g '#f4dfb3' 257 80 373 196 2
  Add-Line $g '#f4dfb3' 373 80 257 196 2
  Add-Polygon $g '#1e7891' @(0, 273, 99, 250, 211, 277, 314, 247, 420, 273, 420, 390, 0, 390)
  Add-Polygon $g '#f2e3c4' @(97, 259, 126, 165, 158, 255)
  Add-Polygon $g '#f2e3c4' @(161, 256, 212, 129, 220, 267)
  Add-Polygon $g '#172f42' @(69, 264, 91, 278, 258, 278, 288, 264, 262, 291, 94, 291)
  Add-Line $g '#f4dfb3' 139 142 139 257 2
  Add-Line $g '#f4dfb3' 212 116 212 258 2
}

New-Cover 'chainsaw-man' '#751f2c' '#d64b3e' @('CHAINSAW', 'MAN') {
  param($g)
  Add-Circle $g '#f0b375' 257 57 105 105
  Add-Polygon $g '#181d25' @(74, 291, 143, 154, 222, 282, 296, 152, 361, 300, 420, 270, 420, 390, 0, 390)
  Add-Polygon $g '#d5c7ac' @(131, 260, 194, 93, 259, 260)
  Add-Polygon $g '#741f2c' @(176, 238, 194, 180, 215, 239)
  Add-Line $g '#f3d6b0' 75 199 344 199 3
  for ($i = 0; $i -lt 8; $i++) { Add-Line $g '#f3d6b0' (91 + ($i * 34)) 199 (106 + ($i * 34)) 218 2 }
  Add-Line $g '#f0b375' 54 300 370 98 2
}

New-Cover 'my-hero-academia' '#174f45' '#a2bb55' @('MY HERO', 'ACADEMIA') {
  param($g)
  Add-Circle $g '#f0d45f' 265 60 100 100
  Add-Polygon $g '#173e3b' @(0, 229, 48, 229, 48, 194, 91, 194, 91, 245, 139, 245, 139, 177, 178, 177, 178, 229, 228, 229, 228, 194, 271, 194, 271, 240, 318, 240, 318, 165, 360, 165, 360, 225, 420, 225, 420, 390, 0, 390)
  Add-Polygon $g '#efc947' @(116, 49, 152, 49, 133, 120, 178, 120, 90, 238, 110, 150, 78, 150)
  Add-Polygon $g '#a9d6b0' @(275, 245, 328, 245, 311, 287, 355, 287, 269, 365, 289, 305, 251, 305)
  Add-Line $g '#dbe9bd' 24 310 395 251 2
  Add-Line $g '#dbe9bd' 54 344 371 295 2
}

New-Cover 'attack-on-titan' '#5d5551' '#9c5549' @('ATTACK ON', 'TITAN') {
  param($g)
  Add-Circle $g '#c76c59' 254 58 120 120
  Add-Polygon $g '#d9c4a0' @(0, 198, 36, 198, 36, 169, 70, 169, 70, 198, 111, 198, 111, 160, 147, 160, 147, 198, 188, 198, 188, 170, 225, 170, 225, 198, 269, 198, 269, 161, 306, 161, 306, 198, 348, 198, 348, 172, 383, 172, 383, 198, 420, 198, 420, 390, 0, 390)
  Add-Polygon $g '#796d60' @(0, 250, 45, 223, 91, 250, 140, 227, 189, 258, 248, 227, 301, 255, 359, 225, 420, 250, 420, 390, 0, 390)
  Add-Line $g '#ecdcb8' 20 205 400 205 2
  Add-Line $g '#402f32' 0 294 420 278 3
  Add-Polygon $g '#342f32' @(0, 324, 79, 314, 115, 328, 178, 320, 219, 337, 292, 320, 347, 329, 420, 314, 420, 390, 0, 390)
}

New-Cover 'apothecary-diaries-season-3' '#244d49' '#813e46' @('APOTHECARY', 'DIARIES') {
  param($g)
  Add-Circle $g '#e7c47e' 254 62 112 112
  Add-Circle $g '#244d49' 274 50 112 112
  Add-Circle $g '#d7b86e' 78 76 142 142 -Outline -Stroke 3
  Add-Circle $g '#d7b86e' 107 105 84 84 -Outline -Stroke 2
  Add-Line $g '#d7b86e' 149 90 149 245 2
  Add-Line $g '#d7b86e' 92 147 206 147 2
  Add-Polygon $g '#203b37' @(0, 291, 78, 267, 138, 294, 215, 260, 282, 289, 355, 258, 420, 285, 420, 390, 0, 390)
  Add-Line $g '#c6d29a' 49 321 108 231 4
  Add-Line $g '#c6d29a' 79 280 43 264 3
  Add-Line $g '#c6d29a' 91 263 127 249 3
  Add-Line $g '#d9a777' 314 330 352 230 6
  Add-Circle $g '#d9a777' 335 212 35 35 -Outline -Stroke 3
  Add-Line $g '#f0d9ad' 272 178 360 264 2
}
