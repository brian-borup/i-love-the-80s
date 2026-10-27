# Draws the app icons: a striped synthwave sun setting over a neon grid, with
# "80's" in chrome lettering across the horizon. Everything is drawn on a
# 512-unit canvas and scaled to each size the app needs.
# Run from anywhere on Windows:  pwsh i-love-the-80s/tools/make-icons.ps1
Add-Type -AssemblyName System.Drawing

$out = Join-Path $PSScriptRoot '..\icons'
function Color($hex) { [System.Drawing.ColorTranslator]::FromHtml($hex) }

function Art($g) {
  # Night sky
  $sky = New-Object System.Drawing.Drawing2D.LinearGradientBrush (New-Object System.Drawing.Point 0, 0), (New-Object System.Drawing.Point 0, 512), (Color '#0d0221'), (Color '#3a0a5c')
  $g.FillRectangle($sky, 0, 0, 512, 512)

  # Sun, cut by widening stripes towards the horizon
  $horizon = 330
  $sun = New-Object System.Drawing.Drawing2D.LinearGradientBrush (New-Object System.Drawing.Point 0, 90), (New-Object System.Drawing.Point 0, $horizon), (Color '#ffd319'), (Color '#ff2e97')
  $clip = New-Object System.Drawing.Region (New-Object System.Drawing.Rectangle 0, 0, 512, $horizon)
  foreach ($stripe in @(@(232, 6), @(260, 9), @(286, 12), @(310, 15))) {
    $clip.Exclude((New-Object System.Drawing.Rectangle 0, $stripe[0], 512, $stripe[1]))
  }
  $g.Clip = $clip
  $g.FillEllipse($sun, 106, 90, 300, 300)
  $g.ResetClip()

  # Ground with a perspective grid
  $ground = New-Object System.Drawing.Drawing2D.LinearGradientBrush (New-Object System.Drawing.Point 0, $horizon), (New-Object System.Drawing.Point 0, 512), (Color '#1a0533'), (Color '#0d0221')
  $g.FillRectangle($ground, 0, $horizon, 512, 512 - $horizon)
  $pen = New-Object System.Drawing.Pen (Color '#ff2e97'), 3
  $g.DrawLine($pen, 0, $horizon, 512, $horizon)
  for ($i = -8; $i -le 8; $i++) {
    $g.DrawLine($pen, 256 + $i * 14, $horizon, 256 + $i * 90, 512)
  }
  $y = 6
  while ($horizon + $y -lt 512) {
    $g.DrawLine($pen, 0, $horizon + $y, 512, $horizon + $y)
    $y = [math]::Round($y * 1.55 + 4)
  }

  # "80's" in chrome: dark outline, then a sky-to-sunset gradient fill
  $text = New-Object System.Drawing.Drawing2D.GraphicsPath
  $format = New-Object System.Drawing.StringFormat
  $format.Alignment = 'Center'
  $font = New-Object System.Drawing.FontFamily 'Arial Black'
  $text.AddString("80's", $font, [int][System.Drawing.FontStyle]::Italic, 170, (New-Object System.Drawing.RectangleF 0, 236, 512, 220), $format)
  $outline = New-Object System.Drawing.Pen (Color '#0d0221'), 18
  $outline.LineJoin = 'Round'
  $g.DrawPath($outline, $text)
  $chrome = New-Object System.Drawing.Drawing2D.LinearGradientBrush (New-Object System.Drawing.Point 0, 270), (New-Object System.Drawing.Point 0, 430), (Color '#ffffff'), (Color '#ff2e97')
  $blend = New-Object System.Drawing.Drawing2D.ColorBlend 5
  $blend.Colors = @((Color '#ffffff'), (Color '#8fd8ff'), (Color '#1b2a6b'), (Color '#b36bff'), (Color '#ffc6f0'))
  $blend.Positions = @(0, 0.45, 0.5, 0.75, 1)
  $chrome.InterpolationColors = $blend
  $g.FillPath($chrome, $text)
  $edge = New-Object System.Drawing.Pen (Color '#00e5ff'), 3
  $g.DrawPath($edge, $text)
}

# Draws the art $scale times the icon size, centered on the night sky colour.
# Maskable icons get a smaller picture so circle crops keep the lettering.
function Icon($px, $name, $scale) {
  $bmp = New-Object System.Drawing.Bitmap $px, $px
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.PixelOffsetMode = 'HighQuality'
  $g.Clear((Color '#0d0221'))
  $k = $px * $scale / 512
  $g.TranslateTransform($px * (1 - $scale) / 2, $px * (1 - $scale) / 2)
  $g.ScaleTransform($k, $k)
  Art $g
  $bmp.Save((Join-Path $out $name), [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
}

Icon 512 'icon-512.png' 1
Icon 192 'icon-192.png' 1
Icon 180 'apple-touch-icon.png' 1
Icon 512 'icon-maskable-512.png' 0.8
