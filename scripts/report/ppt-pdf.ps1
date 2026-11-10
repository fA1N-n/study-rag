# Экспорт .pptx в PDF через PowerPoint: powershell -File scripts\report\ppt-pdf.ps1 <pptx>
param([string]$Path)
$full = (Resolve-Path $Path).Path
$ppt = New-Object -ComObject PowerPoint.Application
try {
  $p = $ppt.Presentations.Open($full, $true, $false, $false)
  $p.SaveAs([System.IO.Path]::ChangeExtension($full, ".pdf"), 32)
  "slides: " + $p.Slides.Count
  $p.Close()
} finally { $ppt.Quit() }
