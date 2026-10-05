$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)

# Publish assets before main's manifests can notify existing installations.
gh auth status
if ($LASTEXITCODE -ne 0) { throw 'GitHub login is required. Run gh auth login first.' }
node tools/check-release.cjs
if ($LASTEXITCODE -ne 0) { throw 'Release verification failed; nothing was published.' }
git fetch origin main
if ($LASTEXITCODE -ne 0) { throw 'Could not fetch the remote main branch.' }
git merge-base --is-ancestor origin/main HEAD
if ($LASTEXITCODE -ne 0) { throw 'Remote main has changes that need to be reviewed before publishing.' }
git add -- .gitattributes .gitignore README.md RELEASE-NOTES.md lib tools ui main.js preload.js package.json package-lock.json src update-check.json mobile/android/app/build.gradle mobile/android/app/src/main mobile/build-apk.ps1 mobile/capacitor.config.ts mobile/mobile-update-check.json mobile/package.json mobile/package-lock.json mobile/src mobile/www mobile/native
if ($LASTEXITCODE -ne 0) { throw 'Could not stage release sources.' }
git diff --cached --quiet
if ($LASTEXITCODE -eq 1) {
    git commit -m 'feat: premium UI, verified app updates and Android Java 25 support'
    if ($LASTEXITCODE -ne 0) { throw 'Could not commit release sources.' }
}
$releaseCommit = (git rev-parse HEAD).Trim()
git push origin 'HEAD:refs/heads/codex/release-v1.0.4'
if ($LASTEXITCODE -ne 0) { throw 'Could not publish the release source branch.' }
gh release create v1.0.4 --target $releaseCommit --draft --title 'JTG Craft — PC 1.0.4 / Android 1.0.8' --notes-file RELEASE-NOTES.md
if ($LASTEXITCODE -ne 0) { throw 'Could not create the draft release. Existing releases were kept.' }
gh release upload v1.0.4 'dist/Jtg-craft-Setup-1.0.4.exe' 'dist/Jtg-craft-Setup-1.0.4.exe.blockmap' 'dist/latest.yml' 'mobile/apk/jtg-craft-mobile-v1.apk'
if ($LASTEXITCODE -ne 0) { throw 'Asset upload failed. Release remains a draft and main is unchanged.' }
$releaseList = gh api repos/JishnuTheGamer/jtg-craft/releases | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw 'Could not verify uploaded assets.' }
$matchingReleases = @($releaseList | Where-Object { $_.tag_name -eq 'v1.0.4' -and $_.draft })
if ($matchingReleases.Count -ne 1) { throw 'Expected exactly one uploaded draft release.' }
$remoteRelease = $matchingReleases[0]
$expectedAssets = @('Jtg-craft-Setup-1.0.4.exe', 'Jtg-craft-Setup-1.0.4.exe.blockmap', 'latest.yml', 'jtg-craft-mobile-v1.apk')
if ($remoteRelease.assets.Count -ne $expectedAssets.Count) { throw 'Release asset count mismatch; release remains a draft.' }
foreach ($expectedAsset in $expectedAssets) {
    if (-not ($remoteRelease.assets | Where-Object { $_.name -eq $expectedAsset })) { throw "Missing release asset: $expectedAsset" }
}
foreach ($asset in $remoteRelease.assets) {
    $localAsset = if ($asset.name.EndsWith('.apk')) { Join-Path 'mobile/apk' $asset.name } else { Join-Path 'dist' $asset.name }
    if (-not (Test-Path -LiteralPath $localAsset)) { throw "Unexpected release asset: $($asset.name)" }
    if ($asset.size -ne (Get-Item -LiteralPath $localAsset).Length) { throw "Asset size mismatch: $($asset.name)" }
    $expectedDigest = 'sha256:' + (Get-FileHash -LiteralPath $localAsset -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($asset.digest -and $asset.digest -ne $expectedDigest) { throw "GitHub asset digest mismatch: $($asset.name)" }
}
gh api --method PATCH "repos/JishnuTheGamer/jtg-craft/releases/$($remoteRelease.id)" -F draft=false --silent
if ($LASTEXITCODE -ne 0) { throw 'Release could not be made available; main is unchanged.' }
git push origin 'HEAD:refs/heads/main'
if ($LASTEXITCODE -ne 0) { throw 'Release assets are available but main was not advanced. Resolve the main-branch changes before enabling update notifications.' }
Write-Output 'Published PC 1.0.4 / Android 1.0.8: https://github.com/JishnuTheGamer/jtg-craft/releases/tag/v1.0.4'
