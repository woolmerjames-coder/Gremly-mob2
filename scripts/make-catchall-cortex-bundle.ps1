Param()

$OutRoot   = "artifacts"
$BundleDir = Join-Path $OutRoot "catchall-cortex-bundle"
$FilesDir  = Join-Path $BundleDir "files"
$Manifest  = Join-Path $BundleDir "manifest.txt"
$ZipPath   = Join-Path $OutRoot "catchall-cortex-bundle.zip"

if (Test-Path $BundleDir) { Remove-Item $BundleDir -Recurse -Force }
if (Test-Path $ZipPath)   { Remove-Item $ZipPath -Force }
New-Item -ItemType Directory -Path $FilesDir | Out-Null

$IgnoreDirs = @(".git","node_modules","dist","build",".next","out",".expo","ios","android","coverage",".yarn",".turbo",".cache")
$IncludeDirs = @("lib/cortex","cortex","gremly-chat-system-review")
$CuratedFiles = @(
  "app/spaces/ChatThreadScreen.tsx",
  "app/spaces/chat/prefillUtils.ts",
  "src/hooks/useActionToast.tsx",
  "lib/chat/quickResponses.ts",
  "lib/cortex/CortexClient.ts",
  "CATCHALL_CORTEX_REFACTOR.md",
  "CATCHALL_PIPELINE_WIRING_COMPLETE.md",
  "docs/phase3-data-cortex-complete.md",
  "__tests__/intent-classification.test.ts",
  "__tests__/cortex/pipelines.wiring.test.ts",
  "__tests__/cortex/intent.explicit-actions.test.ts"
)
$KeywordRe = '(cortex|intent|classification|catch.?all|catch-?all|mind.?drop|CortexClient|cortexDecide|router|pipelines|ActionToast|prefillUtils|ChatThreadScreen|CatchAllNotepad|CATCHALL)'

function ShouldIgnore($path) {
  foreach ($d in $IgnoreDirs) {
    if ($path -like ("*{0}*" -f [IO.Path]::DirectorySeparatorChar + $d + [IO.Path]::DirectorySeparatorChar)) { return $true }
  }
  return $false
}

$found = New-Object System.Collections.Generic.HashSet[string]
foreach ($d in $IncludeDirs) {
  if (Test-Path $d) {
    Get-ChildItem -Recurse -File $d | ForEach-Object {
      if (-not (ShouldIgnore $_.FullName)) { $null = $found.Add($_.FullName) }
    }
  }
}
foreach ($f in $CuratedFiles) { if (Test-Path $f) { $null = $found.Add((Resolve-Path $f).Path) } }

Get-ChildItem -Recurse -File . |
  Where-Object { $_.Extension -in @(".ts",".tsx",".js",".jsx",".md",".json") } |
  ForEach-Object {
    $full = $_.FullName; if (ShouldIgnore $full) { return }
    $rel = Resolve-Path -Relative $full
    if ($rel -match $KeywordRe) { $null = $found.Add($full) }
    elseif ($_.Length -lt 2000000) {
      try { if (Select-String -Path $full -Pattern $KeywordRe -Quiet -ErrorAction SilentlyContinue) { $null = $found.Add($full) } } catch {}
    }
  }

$included = 0; $missing = 0
"# Catchall/Cortex bundle manifest" | Set-Content -Path $Manifest
"$(('# Generated: {0:yyyy-MM-ddTHH:mm:ssZ}' -f (Get-Date).ToUniversalTime()))" | Add-Content -Path $Manifest
"" | Add-Content -Path $Manifest
"included:" | Add-Content -Path $Manifest

foreach ($full in $found) {
  try { $rel = Resolve-Path -Relative $full } catch { $missing++; continue }
  $dest = Join-Path $FilesDir $rel
  New-Item -ItemType Directory -Path (Split-Path $dest) -Force | Out-Null
  Copy-Item -Path $full -Destination $dest -Force
  "  - $rel" | Add-Content -Path $Manifest
  $included++
}

"" | Add-Content -Path $Manifest
"summary:" | Add-Content -Path $Manifest
"  included: $included" | Add-Content -Path $Manifest
"  missing: $missing" | Add-Content -Path $Manifest

Compress-Archive -Path $BundleDir -DestinationPath $ZipPath -Force

Write-Host "Bundle folder: $BundleDir"
Write-Host "Zip created:   $ZipPath"
Write-Host "Manifest:      $Manifest"
Write-Host "Included: $included, Missing (skipped): $missing"
