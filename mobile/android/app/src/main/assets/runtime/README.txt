Java 25 ARM64 C++ dependency

libc++_shared.so is extracted from the official ZalithLauncher 2.7 ARM64 release:
https://github.com/ZalithLauncher/ZalithLauncher2/releases/download/2.7/ZalithLauncher-2.7-arm64-v8a.apk
Source APK SHA-256: 102f5caa938de900da6d12820ebc1db1045358d4852d9dcc5cea0a49c29eb67e
Library SHA-256: 28e7a3a306d7fc222c62abe08741cfcba38c3f336216c4563726bf985ae3cfd6

The verified library is copied into Java 25's lib directory during installation,
including repair of previously installed runtimes. It is not a system library.
https://developer.android.com/ndk/guides/cpp-support
License: Apache 2.0 with LLVM exceptions; see LICENSE-libcxx.txt.
