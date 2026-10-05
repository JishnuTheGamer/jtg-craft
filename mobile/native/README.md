# Android OpenJDK pointer-tagging compatibility

`tagfix.c` is preloaded into the Java server child process. The app manifest's
`allowNativeHeapPointerTagging` setting does not configure a newly executed JVM.
The old library only called `mallopt(-204, 0)` (Android 12+). This version falls
back to Android 11's `android_mallopt(8, &level, sizeof(level))` through `dlsym`.
It reports whether disabling tagging succeeded in the server console.

AOSP references:

- https://android.googlesource.com/platform/bionic/+/android16-release/libc/include/malloc.h
- https://android.googlesource.com/platform/bionic/+/f8f384c69722e6a50fcba8aa8e20787571f35011/libc/platform/bionic/malloc.h

Rebuild from the repository root with Zig 0.13.0 (PowerShell):

```powershell
$zig = './mobile/.build-env/zig-windows-x86_64-0.13.0/zig.exe'
$env:ZIG_GLOBAL_CACHE_DIR = "$PWD/mobile/.build-env/zig-cache"
$env:ZIG_LOCAL_CACHE_DIR = "$PWD/mobile/.build-env/zig-local-cache"
& $zig cc -target aarch64-linux-android -shared -nostdlib -fPIC -fno-stack-protector -O2 '-Wl,-soname,libtagfix.so' '-Wl,-z,max-page-size=16384' mobile/native/tagfix.c -o mobile/.build-env/libtagfix.so
if ($LASTEXITCODE -ne 0) { throw 'Native library compilation failed' }
Copy-Item mobile/.build-env/libtagfix.so mobile/android/app/src/main/assets/libtagfix.so -Force
Copy-Item mobile/.build-env/libtagfix.so mobile/android/app/src/main/jniLibs/arm64-v8a/libtagfix.so -Force
```

Both packaged copies must match. The asset fallback is refreshed at every server
launch so existing installations pick up the fix after updating the APK.
Android ARM64 supplies the library's `mallopt`, `dlsym`, and `write` symbols.

Run the host compatibility tests with the same compiler:

```powershell
& $zig cc mobile/native/tagfix-test.c -o mobile/.build-env/tagfix-test.exe
if ($LASTEXITCODE -ne 0) { throw 'Test compilation failed' }
& ./mobile/.build-env/tagfix-test.exe
if ($LASTEXITCODE -ne 0) { throw 'Compatibility tests failed' }
```

Tests cover the modern API, Android 11 fallback, absent legacy symbol, and failure
of both APIs. They mock Android libc; on-device verification is still required.
Install the updated APK over the existing app, start Paper 1.20.4, check for the
tagging-disabled diagnostic, and wait for Paper's `Done (...)` ready message.
The app must only print its Server Online banner after that message.
