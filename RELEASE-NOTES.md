# JTG Craft — PC 1.0.5 / Android 1.0.9

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
and the native versionCode increases to 9.

After this upgrade, Android checks automatically at startup and every 30 minutes.
Automatic downloads are enabled and can be disabled in Settings. Web updates
stage a complete verified bundle including HTML, JavaScript and CSS. Activation
waits for a safe server shutdown. Native updates download in the app, verify
SHA-256, package name, increasing versionCode and the installed certificate,
then open the Android installer. Android's install permission and confirmation
are required; a normal app cannot silently replace its APK.

## Java runtimes

Auto selects Java 17 for Minecraft 1.17–1.20.4, Java 21 for 1.20.5–1.21.x, and
Java 25 for 26.x. Paper's current recommended version table is available at
https://docs.papermc.io/paper/getting-started/. Manual Java 17/21/25 selections are preserved; server and plugin compatibility
is the user’s choice. Auto selects the runtime required for the Minecraft version.

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

Source at immutable tag `v1.0.5` supplies the verified web files for both
independent platform versions. Replace only the APK and EXE assets in the
existing `jtgcraft_v1` release, preserving the exact public filenames
`jtg-craft-mobile-v1.apk` and `Jtg-craft.Setup.1.0.0.exe`. Their contents are
Android 1.0.9 and PC 1.0.5 respectively; the old filename does not describe the
installed version. Keep the original V1 tag and shared download URLs unchanged.
Verify replaced assets before advancing `main`; new manifests refer to these
stable V1 URLs. No separate binary release is required.

Settings operations now show a progress popup. RAM/CPU limits use actual device
hardware and Android passes ActiveProcessorCount to HotSpot. Phone Storage stays
the server default with a writable-folder permission check and proper legacy
permission callbacks. Android 16 compatibility uses the system Bionic allocator,
an allocation probe, MEMTAG_OPTIONS=off, and disabled compressed object/class
pointers. The reported 134 crash still needs a server retest on the phone.
