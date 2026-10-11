# JTG Craft â€” PC 1.0.7 / Android 1.0.11

Both editions use the shared black/crimson interface with eight saved themes,
searchable and bounded logs, and grouped server properties. Desktop keeps its
fixed navigation. Mobile uses a hamburger drawer without bottom tabs.

## Updating existing installations

Desktop 1.0.x installations can receive this release through the existing
GitHub hot updater. Stop your server before this first upgrade because the old
relaunch handler does not wait for a safe server shutdown. The manifest downloads the new helper modules before the
main process that uses them. New desktop builds download and verify every file
before writing, restore old files if a write fails, and write the installed
version last. App relaunch waits for the server to stop safely. Future Electron
runtime upgrades can use `minimumBinaryVersion` and `nativeUpdate` to download a
verified installer in the app. Activation opens the normal Windows installer.
This supports the project's existing unsigned Windows distribution without
depending on its incorrectly configured Authenticode publisher expectation.

Android installations from the original `jtgcraft_v1` release need **one APK
upgrade**. Their loader applied CSS only: saving HTML/JavaScript in localStorage
did not execute it, and a web patch cannot replace native Java plugins or the
pointer-tagging library. Stop the server, then install the new APK over the old app; do not uninstall
it. The package name and signing certificate match the published original APK,
and the native versionCode increases to 11.

After this upgrade, Android checks automatically at startup and every 30 minutes.
Automatic downloads are enabled and can be disabled in Settings. Web updates
stage a complete verified bundle including HTML, JavaScript and CSS. Activation
waits for a safe server shutdown. Native updates download in the app, verify
SHA-256, package name, increasing versionCode and the installed certificate,
then open the Android installer. Android's install permission and confirmation
are required; a normal app cannot silently replace its APK.

## Java runtimes

Auto selects Java 17 for Minecraft 1.17â€“1.20.4, Java 21 for 1.20.5â€“1.21.x, and
Java 25 for 26.x. Paper's current recommended version table is available at
https://docs.papermc.io/paper/getting-started/. Manual Java 17/21/25 selections are preserved; server and plugin compatibility
is the userâ€™s choice. Auto selects the runtime required for the Minecraft version.

Windows obtains exact Temurin runtimes from Adoptium and verifies archive hashes.
Runtime ZIP extraction uses Node streams and validates entry paths, sizes and CRC,
so setup does not depend on the Windows PowerShell Archive module.
Android Java 21/25 use pinned Bionic ARM64 binary and universal components from
ZalithLauncher2, with checksums, staged extraction and version validation. Runtime
source: https://github.com/ZalithLauncher/ZalithLauncher2/tree/06bf273371a61ff5398efa9ed10c0adfc4cd075c/ZalithLauncher/src/main/assets/runtimes.
The obsolete `-noverify` option is excluded for Java 25.

## Validation and publishing

Run `node tools/check-updates.cjs`, `node tools/check-mobile-bridge.cjs` and the
Playwright UI checks in `tools/check-ui.cjs`. The Java policy check in
`tools/JavaPolicyCheck.java` runs against the native policy without a device.
Browser checks simulate backend operations; real ARM64 server hosting and the
Android installation dialog still require a phone test.

Run `node tools/sync-ui.cjs` and `node tools/prepare-release.cjs` before building.
After both builds, copy the APK to `mobile/apk/jtg-craft-mobile-v1.apk` and run
`node tools/prepare-release.cjs --artifacts` to finalize its hash and normalize
the PC installer filename to the original `Jtg-craft.Setup.1.0.0.exe` download name.

Source at immutable tag `v1.0.7` supplies the verified web files for both
independent platform versions. Replace only the APK and EXE assets in the
existing `jtgcraft_v1` release, preserving the exact public filenames
`jtg-craft-mobile-v1.apk` and `Jtg-craft.Setup.1.0.0.exe`. Their contents are
Android 1.0.11 and PC 1.0.7 respectively; the old filename does not describe the
installed version. Keep the original V1 tag and shared download URLs unchanged.
Verify replaced assets before advancing `main`; new manifests refer to these
stable V1 URLs. No separate binary release is required.

Settings operations now show a progress popup. RAM/CPU limits use actual device
hardware and Android passes ActiveProcessorCount to HotSpot. Phone Storage stays
the server default with a writable-folder permission check and proper legacy
permission callbacks. Android 16 compatibility uses the system Bionic allocator,
an allocation probe, MEMTAG_OPTIONS=off, and disabled compressed object/class
pointers. The reported 134 crash still needs a server retest on the phone.

## Java 25 mobile startup and desktop recreation fixes

The ARM64 Java 25 launcher and HotSpot library require libc++_shared.so; Java 21
does not have that dependency. Bundle the checksum-verified C++ runtime from
ZalithLauncher 2.7 and copy it into Java 25's lib directory. Existing complete
Java 25 installs receive the missing library without downloading the Java
archives again. Missing/corrupt dependencies or missing JVM/modules files no
longer count as an installed runtime. Android requires the 1.0.10 APK upgrade
to receive the bundled native dependency and repair logic. Phone execution
still requires a device retest.

Desktop server deletion now prepares the creation version selector even when
the app started with an existing server and skipped first-time setup. Creation
can proceed without restarting JTG Craft; a failed catalog fetch offers Retry.

Validation: Java 25 ARM64 ELF dependencies and imported C++ symbols are checked
against the bundled library; native host tests verify missing/corrupt library
repair and incomplete runtime rejection. Browser regression deletes an existing
PC server and creates a replacement in the same session.

## Plugins for the selected Minecraft server version

Both catalogs use exact Minecraft version and Paper/Spigot/Bukkit version
metadata. Browse/category views contain only projects with a verified matching
JAR. Search also explains projects with no matching build, or with verification
failures, without offering Install. Client-only and Folia-only builds are excluded.
Curated/direct latest URLs and unfiltered version fallbacks no longer bypass
compatibility checks. The shared policy is embedded in existing runtime files
so desktop hot updates do not need a new allowed module.

Install re-resolves the matching build and checks for server/version changes.
PC and native Android downloaders verify SHA-512 and size before replacing
plugin files. Failed downloads keep existing plugins. Android native checks
require the 1.0.11 APK update. Compatibility is based on author-published
metadata; installed dependencies, Java and plugin configuration can still
affect runtime behavior. Manually uploaded JARs remain explicit user choices.

Modrinth API: https://docs.modrinth.com/api/operations/getprojectversions/
Validation: node tools/check-plugins.cjs, mobile bridge checks, browser tests
for compatible Install and unavailable search cards, and both platform builds.
