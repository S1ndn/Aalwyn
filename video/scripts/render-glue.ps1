param([string]$OutputDirectory = 'video/output')
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$taskOutput = [IO.Path]::GetFullPath($OutputDirectory)
[IO.Directory]::CreateDirectory($taskOutput) | Out-Null
$bitmap = New-Object Drawing.Bitmap 1920,1080
$graphics = [Drawing.Graphics]::FromImage($bitmap)
$graphics.Clear([Drawing.ColorTranslator]::FromHtml('#141619'))
$graphics.TextRenderingHint = [Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$white = New-Object Drawing.SolidBrush ([Drawing.ColorTranslator]::FromHtml('#f0f0f0'))
$red = New-Object Drawing.SolidBrush ([Drawing.ColorTranslator]::FromHtml('#ff6b78'))
$font = New-Object Drawing.Font 'Segoe UI',68,([Drawing.FontStyle]::Regular),([Drawing.GraphicsUnit]::Pixel)
$format = [Drawing.StringFormat]::GenericTypographic.Clone()
$format.FormatFlags = $format.FormatFlags -bor [Drawing.StringFormatFlags]::MeasureTrailingSpaces
$line1 = "That's neat, but let's see"
$firstWidth = $graphics.MeasureString($line1,$font,1920,$format).Width
$graphics.DrawString($line1,$font,$white,[single]((1920-$firstWidth)/2),[single]420,$format)
$parts = @('some ','crazier',' things')
$widths = @($parts | ForEach-Object { $graphics.MeasureString($_,$font,1920,$format).Width })
$cursorX = (1920-($widths | Measure-Object -Sum).Sum)/2
for($i=0;$i -lt $parts.Count;$i++) {
    $brush = if($i -eq 1) { $red } else { $white }
    $graphics.DrawString($parts[$i],$font,$brush,[single]$cursorX,[single]530,$format)
    $cursorX += $widths[$i]
}
$still = Join-Path $taskOutput 'crazier-transition.png'
$bitmap.Save($still,[Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose(); $bitmap.Dispose(); $font.Dispose(); $white.Dispose(); $red.Dispose(); $format.Dispose()
$ffmpeg = Join-Path $PSScriptRoot '../node_modules/@ffmpeg-installer/win32-x64/ffmpeg.exe'
& $ffmpeg -v error -y -loop 1 -framerate 60 -i $still -t 6 -vf 'fade=t=in:st=0.5:d=0.6:color=0x141619,fade=t=out:st=4.8:d=0.7:color=0x141619,format=yuv420p' -c:v libx264 -crf 18 -preset medium -movflags +faststart -an (Join-Path $taskOutput 'crazier-transition.mp4')
if($LASTEXITCODE -ne 0) { throw 'Video export failed.' }
