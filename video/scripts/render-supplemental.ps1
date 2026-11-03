param([string]$OutputDirectory = 'video/output')
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$taskOutput = [IO.Path]::GetFullPath($OutputDirectory)
[IO.Directory]::CreateDirectory($taskOutput) | Out-Null
$ffmpeg = Join-Path $PSScriptRoot '../node_modules/@ffmpeg-installer/win32-x64/ffmpeg.exe'
function Save-Card($Name, $Rows) {
    $bitmap = New-Object Drawing.Bitmap 1920,1080
    $graphics = [Drawing.Graphics]::FromImage($bitmap)
    $graphics.Clear([Drawing.ColorTranslator]::FromHtml('#141619'))
    $graphics.TextRenderingHint = [Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $format = [Drawing.StringFormat]::GenericTypographic.Clone()
    $format.FormatFlags = $format.FormatFlags -bor [Drawing.StringFormatFlags]::MeasureTrailingSpaces
    foreach($row in $Rows) {
        $font = New-Object Drawing.Font 'Segoe UI',($row.Size),([Drawing.FontStyle]::Regular),([Drawing.GraphicsUnit]::Pixel)
        $widths = @($row.Parts | ForEach-Object { $graphics.MeasureString($_.Text,$font,1920,$format).Width })
        $cursorX = (1920-($widths | Measure-Object -Sum).Sum)/2
        for($i=0;$i -lt $row.Parts.Count;$i++) {
            $color = if($row.Parts[$i].Blue) { '#4fc1ff' } else { '#f0f0f0' }
            $brush = New-Object Drawing.SolidBrush ([Drawing.ColorTranslator]::FromHtml($color))
            $graphics.DrawString($row.Parts[$i].Text,$font,$brush,[single]$cursorX,[single]$row.Y,$format)
            $cursorX += $widths[$i]
            $brush.Dispose()
        }
        $font.Dispose()
    }
    $path = Join-Path $taskOutput ($Name+'.png')
    $bitmap.Save($path,[Drawing.Imaging.ImageFormat]::Png)
    $graphics.Dispose(); $bitmap.Dispose(); $format.Dispose()
    return $path
}
function Export-Sequence($Name, $Cards) {
    $segments = @()
    foreach($card in $Cards) {
        $png = Save-Card $card.Name $card.Rows
        $segment = Join-Path $taskOutput ($card.Name+'.mp4')
        $filter = 'fade=t=in:st=0.4:d=0.6:color=0x141619,fade=t=out:st='+($card.Duration-0.9).ToString([Globalization.CultureInfo]::InvariantCulture)+':d=0.6:color=0x141619,format=yuv420p'
        & $ffmpeg -v error -y -loop 1 -framerate 60 -i $png -t $card.Duration -vf $filter -c:v libx264 -crf 18 -preset medium -an $segment
        if($LASTEXITCODE -ne 0) { throw 'Card export failed.' }
        $segments += "file '$($segment.Replace('\','/'))'"
    }
    $list = Join-Path $taskOutput ($Name+'-segments.txt')
    $segments | Set-Content -Encoding Ascii $list
    & $ffmpeg -v error -y -f concat -safe 0 -i $list -c copy -movflags +faststart (Join-Path $taskOutput ($Name+'.mp4'))
    if($LASTEXITCODE -ne 0) { throw 'Sequence export failed.' }
}
Export-Sequence 'slow-down-filler' @(
    @{Name='slow-down-card';Duration=4.2;Rows=@(
        @{Y=480;Size=68;Parts=@(@{Text="But let's ";Blue=$false},@{Text='slow down';Blue=$true})}
    )},
    @{Name='how-to-use-card';Duration=3.8;Rows=@(
        @{Y=480;Size=68;Parts=@(@{Text='How do I use this?';Blue=$false})}
    )}
)
Export-Sequence 'aalwyn-outro' @(
    @{Name='programming-math-card';Duration=4;Rows=@(
        @{Y=420;Size=68;Parts=@(@{Text="That's programming,";Blue=$false})},
        @{Y=530;Size=68;Parts=@(@{Text='with math.';Blue=$false})}
    )},
    @{Name='what-create-card';Duration=3.6;Rows=@(
        @{Y=480;Size=68;Parts=@(@{Text='What will you create?';Blue=$false})}
    )},
    @{Name='try-aalwyn-card';Duration=6;Rows=@(
        @{Y=420;Size=68;Parts=@(@{Text='Go try out ';Blue=$false},@{Text='Aalwyn';Blue=$true},@{Text=' at';Blue=$false})},
        @{Y=530;Size=66;Parts=@(@{Text='s1ndn.github.io/Aalwyn/';Blue=$true})}
    )}
)
