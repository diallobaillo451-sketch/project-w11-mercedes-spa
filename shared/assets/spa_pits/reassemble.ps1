$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

Write-Host "Reassembling garage_player.glb (base64 parts → binary) ..."
$parts = Get-ChildItem -Path "." -Filter "garage_player.glb.part*" | Sort-Object Name
$out = "garage_player.glb"
if (Test-Path $out) { Remove-Item $out }
$dst = [System.IO.File]::Open($out, [System.IO.FileMode]::Create)
try {
  foreach ($p in $parts) {
    $b64 = [System.IO.File]::ReadAllText($p.FullName)
    $bytes = [Convert]::FromBase64String(($b64 -replace "\s",""))
    $dst.Write($bytes, 0, $bytes.Length)
  }
} finally { $dst.Close() }
$hash = (Get-FileHash -Algorithm SHA256 -Path $out).Hash.ToLower()
if ($hash -ne "426dca21e567b2de58c692c3ec0d2282321b56b942f3834406f77871f1df0914") { throw "SHA256 mismatch for garage_player.glb: $hash" }

Write-Host "OK — all split files reassembled, base64-decoded, and verified."
