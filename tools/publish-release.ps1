$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)

# Replace existing V1 downloads before activating their stable URLs in main.
gh auth status
if ($LASTEXITCODE -ne 0) { throw 'GitHub login is required.' }
node tools/check-release.cjs
if ($LASTEXITCODE -ne 0) { throw 'Release verification failed.' }
git fetch origin main
if ($LASTEXITCODE -ne 0) { throw 'Could not fetch main.' }
git merge-base --is-ancestor origin/main HEAD
if ($LASTEXITCODE -ne 0) { throw 'Remote changes need review before publishing.' }
git add -- .gitattributes .gitignore README.md RELEASE-NOTES.md lib tools ui main.js preload.js package.json package-lock.json src update-check.json mobile/android/app/build.gradle mobile/android/app/src/main mobile/build-apk.ps1 mobile/capacitor.config.ts mobile/mobile-update-check.json mobile/package.json mobile/package-lock.json mobile/src mobile/www mobile/native
if ($LASTEXITCODE -ne 0) { throw 'Could not stage release sources.' }
git diff --cached --quiet
if ($LASTEXITCODE -eq 1) {
    git commit -m 'fix: Java selection, Android hosting, resources and settings progress'
    if ($LASTEXITCODE -ne 0) { throw 'Could not commit sources.' }
}
$sourceTag = (Get-Content -LiteralPath update-check.json -Raw | ConvertFrom-Json).sourceRef
git push origin "HEAD:refs/heads/codex/release-$sourceTag"
if ($LASTEXITCODE -ne 0) { throw 'Source branch push failed.' }
git rev-parse --quiet --verify "refs/tags/$sourceTag" | Out-Null
if ($LASTEXITCODE -ne 0) { git tag $sourceTag; if ($LASTEXITCODE -ne 0) { throw 'Source tag creation failed.' } }
git push origin "refs/tags/$sourceTag"
if ($LASTEXITCODE -ne 0) { throw 'Could not publish release source branch.' }

$releaseTag = 'jtgcraft_v1'
$releaseApi = 'repos/JishnuTheGamer/jtg-craft/releases'
$remoteRelease = gh api "$releaseApi/tags/$releaseTag" | ConvertFrom-Json
if ($LASTEXITCODE -ne 0 -or $remoteRelease.draft) { throw 'Existing public V1 release not found.' }
$releaseId = $remoteRelease.id
$expectedAssets = @('Jtg-craft.Setup.1.0.0.exe', 'jtg-craft-mobile-v1.apk')
$stageDirectory = Join-Path $PWD 'ui-preview/release-stage'
New-Item -ItemType Directory -Path $stageDirectory -Force | Out-Null
$pendingFiles = @()
foreach ($name in $expectedAssets) {
    $localAsset = if ($name.EndsWith('.apk')) { Join-Path 'mobile/apk' $name } else { Join-Path 'dist' $name }
    $pendingPath = Join-Path $stageDirectory ($name + '.pending')
    Copy-Item -LiteralPath $localAsset -Destination $pendingPath -Force
    $pendingFiles += $pendingPath
}
# Verify both staged uploads while original download links still work.
gh release upload $releaseTag @pendingFiles --clobber
if ($LASTEXITCODE -ne 0) { throw 'Staged upload failed; original assets were kept.' }
$remoteRelease = gh api "$releaseApi/$releaseId" | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw 'Staged upload lookup failed; originals were kept.' }
foreach ($name in $expectedAssets) {
    $pending = @($remoteRelease.assets | Where-Object { $_.name -eq ($name + '.pending') })
    $localAsset = Join-Path $stageDirectory ($name + '.pending')
    $expectedDigest = 'sha256:' + (Get-FileHash -LiteralPath $localAsset -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($pending.Count -ne 1 -or $pending[0].size -ne (Get-Item -LiteralPath $localAsset).Length -or $pending[0].digest -ne $expectedDigest) { throw "Staged verification failed: $name" }
}
foreach ($name in $expectedAssets) {
    $oldAsset = $remoteRelease.assets | Where-Object { $_.name -eq $name }
    $pending = $remoteRelease.assets | Where-Object { $_.name -eq ($name + '.pending') }
    if ($oldAsset) {
        gh api --method DELETE "$releaseApi/assets/$($oldAsset.id)" --silent
        if ($LASTEXITCODE -ne 0) { throw "Could not replace original asset: $name" }
    }
    gh api --method PATCH "$releaseApi/assets/$($pending.id)" -f name=$name --silent
    if ($LASTEXITCODE -ne 0) { throw "Replacement rename failed: $name. Verified pending bytes remain available." }
}
$remoteRelease = gh api "$releaseApi/$releaseId" | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw 'Final V1 asset lookup failed.' }
foreach ($name in $expectedAssets) {
    $asset = @($remoteRelease.assets | Where-Object { $_.name -eq $name })
    $localAsset = Join-Path $stageDirectory ($name + '.pending')
    $expectedDigest = 'sha256:' + (Get-FileHash -LiteralPath $localAsset -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($asset.Count -ne 1 -or $asset[0].digest -ne $expectedDigest -or $asset[0].size -ne (Get-Item -LiteralPath $localAsset).Length) { throw "Final verification failed: $name" }
}
gh release edit $releaseTag --notes-file RELEASE-NOTES.md
if ($LASTEXITCODE -ne 0) { throw 'Could not update V1 release notes.' }
gh api --method PATCH "$releaseApi/$releaseId" -f make_latest=true --silent
if ($LASTEXITCODE -ne 0) { throw 'Could not mark V1 as latest.' }
git push origin 'HEAD:refs/heads/main'
if ($LASTEXITCODE -ne 0) { throw 'V1 assets are updated but main could not be advanced.' }
Write-Output 'Updated original V1 release: https://github.com/JishnuTheGamer/jtg-craft/releases/tag/jtgcraft_v1'
