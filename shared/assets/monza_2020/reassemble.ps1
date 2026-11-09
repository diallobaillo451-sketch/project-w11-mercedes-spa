$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

Write-Host "Reassembling preview/preview_top.png (base64 parts → binary) ..."
$parts = Get-ChildItem -Path "preview" -Filter "preview_top.png.part*" | Sort-Object Name
$out = "preview\preview_top.png"
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
if ($hash -ne "721ddb9161a3b4010c3c40f1b5de5b3bd862b450dc3e37891dc230051986a31d") { throw "SHA256 mismatch for preview/preview_top.png: $hash" }

Write-Host "Reassembling scene/t01.bin (base64 parts → binary) ..."
$parts = Get-ChildItem -Path "scene" -Filter "t01.bin.part*" | Sort-Object Name
$out = "scene\t01.bin"
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
if ($hash -ne "15e0eb5fa33534d05dc734934772b896bf2aca8b1688204b0904bb063f998b09") { throw "SHA256 mismatch for scene/t01.bin: $hash" }

Write-Host "Reassembling scene/t01_lod.bin (base64 parts → binary) ..."
$parts = Get-ChildItem -Path "scene" -Filter "t01_lod.bin.part*" | Sort-Object Name
$out = "scene\t01_lod.bin"
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
if ($hash -ne "85a501c58f43395ad6cb1e37ab05de618d9fe2c2603f1e02bad5409606b954bf") { throw "SHA256 mismatch for scene/t01_lod.bin: $hash" }

Write-Host "Reassembling scene/t03.bin (base64 parts → binary) ..."
$parts = Get-ChildItem -Path "scene" -Filter "t03.bin.part*" | Sort-Object Name
$out = "scene\t03.bin"
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
if ($hash -ne "023bef56552cb6e3ea5d0254931dc25bf424705e517db813ea757cd77ec0a86a") { throw "SHA256 mismatch for scene/t03.bin: $hash" }

Write-Host "Reassembling scene/t05.bin (base64 parts → binary) ..."
$parts = Get-ChildItem -Path "scene" -Filter "t05.bin.part*" | Sort-Object Name
$out = "scene\t05.bin"
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
if ($hash -ne "df36dda798e91f93cf300b8566b8103330955744c04b4aec6be660de8a8d73d4") { throw "SHA256 mismatch for scene/t05.bin: $hash" }

Write-Host "Reassembling scene/t10.bin (base64 parts → binary) ..."
$parts = Get-ChildItem -Path "scene" -Filter "t10.bin.part*" | Sort-Object Name
$out = "scene\t10.bin"
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
if ($hash -ne "7f102bb733d0287cb6ccfa05227b3b4cd8501714a4b75e1db4cd2747d4156e1c") { throw "SHA256 mismatch for scene/t10.bin: $hash" }

Write-Host "Reassembling scene/t10_lod.bin (base64 parts → binary) ..."
$parts = Get-ChildItem -Path "scene" -Filter "t10_lod.bin.part*" | Sort-Object Name
$out = "scene\t10_lod.bin"
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
if ($hash -ne "f2ff94d0e40575a3587d1f1011bfbb04994c24de2da652c6d8e4ed4ff2b6dca1") { throw "SHA256 mismatch for scene/t10_lod.bin: $hash" }

Write-Host "Reassembling scene/t13.bin (base64 parts → binary) ..."
$parts = Get-ChildItem -Path "scene" -Filter "t13.bin.part*" | Sort-Object Name
$out = "scene\t13.bin"
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
if ($hash -ne "71b2f5f846e813804baf14b0dbb2eadeb584a52b60ad70549561c44f1ad30c89") { throw "SHA256 mismatch for scene/t13.bin: $hash" }

Write-Host "Reassembling scene/t13_lod.bin (base64 parts → binary) ..."
$parts = Get-ChildItem -Path "scene" -Filter "t13_lod.bin.part*" | Sort-Object Name
$out = "scene\t13_lod.bin"
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
if ($hash -ne "e0b95f3164a885a381b0d3cf2f3f8879525972cf7d27bec59b8bcce7a0b5d752") { throw "SHA256 mismatch for scene/t13_lod.bin: $hash" }

Write-Host "Reassembling scene/tex/081304809cc6053e.ktx2 (base64 parts → binary) ..."
$parts = Get-ChildItem -Path "scene\tex" -Filter "081304809cc6053e.ktx2.part*" | Sort-Object Name
$out = "scene\tex\081304809cc6053e.ktx2"
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
if ($hash -ne "bc0b80dc577c0898e130a3d05c407c424ce144f7b5cf84cdae49cbf390b59b54") { throw "SHA256 mismatch for scene/tex/081304809cc6053e.ktx2: $hash" }

Write-Host "Reassembling scene/tex/15bcdf093e36afe1.ktx2 (base64 parts → binary) ..."
$parts = Get-ChildItem -Path "scene\tex" -Filter "15bcdf093e36afe1.ktx2.part*" | Sort-Object Name
$out = "scene\tex\15bcdf093e36afe1.ktx2"
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
if ($hash -ne "4bb24ea76fab4688f8e9bc985fc2251e93bfeae9827c399b269b1b4585d6c628") { throw "SHA256 mismatch for scene/tex/15bcdf093e36afe1.ktx2: $hash" }

Write-Host "Reassembling scene/tex/33bf5cb059e8e28b.ktx2 (base64 parts → binary) ..."
$parts = Get-ChildItem -Path "scene\tex" -Filter "33bf5cb059e8e28b.ktx2.part*" | Sort-Object Name
$out = "scene\tex\33bf5cb059e8e28b.ktx2"
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
if ($hash -ne "60b00db43631d6a8a6060d5909941d993992a9dd4d594aa0f4ff353fa0ff4c01") { throw "SHA256 mismatch for scene/tex/33bf5cb059e8e28b.ktx2: $hash" }

Write-Host "Reassembling scene/tex/7ec9cff9e7766363.ktx2 (base64 parts → binary) ..."
$parts = Get-ChildItem -Path "scene\tex" -Filter "7ec9cff9e7766363.ktx2.part*" | Sort-Object Name
$out = "scene\tex\7ec9cff9e7766363.ktx2"
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
if ($hash -ne "291f46042d72e11b24c51369d1d0457f621d230550249d7d640cffddf9acda1d") { throw "SHA256 mismatch for scene/tex/7ec9cff9e7766363.ktx2: $hash" }

Write-Host "Reassembling scene/tex/c789a073aabb8ae3.ktx2 (base64 parts → binary) ..."
$parts = Get-ChildItem -Path "scene\tex" -Filter "c789a073aabb8ae3.ktx2.part*" | Sort-Object Name
$out = "scene\tex\c789a073aabb8ae3.ktx2"
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
if ($hash -ne "15629d9269016e1a0e2f57d670977113d6033514334dd5dbeec3b7b53b475154") { throw "SHA256 mismatch for scene/tex/c789a073aabb8ae3.ktx2: $hash" }

Write-Host "Reassembling scene/tex/daf96da53b01d510.ktx2 (base64 parts → binary) ..."
$parts = Get-ChildItem -Path "scene\tex" -Filter "daf96da53b01d510.ktx2.part*" | Sort-Object Name
$out = "scene\tex\daf96da53b01d510.ktx2"
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
if ($hash -ne "54144d353038968c0e704c4b9e89da93c46f8b65dcee3c62fe5953bb9f282dd5") { throw "SHA256 mismatch for scene/tex/daf96da53b01d510.ktx2: $hash" }

Write-Host "Reassembling scene/tex/f8a51fc5824d79e7.ktx2 (base64 parts → binary) ..."
$parts = Get-ChildItem -Path "scene\tex" -Filter "f8a51fc5824d79e7.ktx2.part*" | Sort-Object Name
$out = "scene\tex\f8a51fc5824d79e7.ktx2"
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
if ($hash -ne "5ba90cdfc5a09e37192894012e434c18ea781f87b6cc261dd76d500e6f1acbc6") { throw "SHA256 mismatch for scene/tex/f8a51fc5824d79e7.ktx2: $hash" }

Write-Host "Reassembling track/surface.bin (base64 parts → binary) ..."
$parts = Get-ChildItem -Path "track" -Filter "surface.bin.part*" | Sort-Object Name
$out = "track\surface.bin"
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
if ($hash -ne "98c2141bef78f663940982cc17200d5fb234269bfc0b95bd6ab74f9159c17079") { throw "SHA256 mismatch for track/surface.bin: $hash" }

Write-Host "OK — all split files reassembled, base64-decoded, and verified."
