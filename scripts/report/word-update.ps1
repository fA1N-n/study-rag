# Обновить оглавление и поля в .docx через Word и сохранить PDF рядом.
# powershell -NoProfile -ExecutionPolicy Bypass -File scripts\report\word-update.ps1 <путь к docx>
param([string]$Path)
$full = (Resolve-Path $Path).Path
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
try {
  $doc = $word.Documents.Open($full)
  foreach ($toc in $doc.TablesOfContents) { $toc.Update() }
  $doc.Fields.Update() | Out-Null
  foreach ($toc in $doc.TablesOfContents) { $toc.UpdatePageNumbers() }
  $doc.Save()
  $pdf = [System.IO.Path]::ChangeExtension($full, ".pdf")
  $doc.ExportAsFixedFormat($pdf, 17)
  "pages: " + $doc.ComputeStatistics(2)
  $doc.Close()
} finally { $word.Quit() }
