/* Preloaded into the Android OpenJDK child process before JVM startup.
 * Android 12+ exposes mallopt(-204, 0). Android 11 needs android_mallopt(8).
 * References: AOSP libc/include/malloc.h and libc/platform/bionic/malloc.h.
 */
extern void *dlsym(void *handle, const char *name);
extern void *dlopen(const char *name, int flags);
extern char *getenv(const char *name);
extern long write(int fd, const void *buffer, unsigned long size);

__attribute__((constructor))
static void disable_heap_tagging(void) {
    int sdk = 0;
    const char *sdk_text = getenv("JTG_ANDROID_API_LEVEL");
    if (sdk_text) while (*sdk_text >= '0' && *sdk_text <= '9') sdk = sdk * 10 + (*sdk_text++ - '0');
    if (sdk > 0 && sdk < 30) return;
    // Avoid a JRE shim whose mallopt can return success without changing Bionic.
    void *libc = dlopen("/apex/com.android.runtime/lib64/bionic/libc.so", 2 /* RTLD_NOW */);
    if (!libc) libc = dlopen("libc.so", 2);
    typedef int (*mallopt_fn)(int, int);
    mallopt_fn modern = (mallopt_fn)dlsym(libc, "mallopt");
    int disabled = 0;
    if ((sdk == 0 || sdk >= 31) && modern) disabled = modern(-204, 0);
    if (!disabled || sdk == 30) {
        typedef _Bool (*android_mallopt_fn)(int, void *, unsigned long);
        android_mallopt_fn legacy = (android_mallopt_fn)dlsym(libc, "android_mallopt");
        int level = 0;
        if (legacy) disabled = legacy(8, &level, sizeof(level));
    }
    typedef void *(*malloc_fn)(unsigned long);
    typedef void (*free_fn)(void *);
    malloc_fn allocate = (malloc_fn)dlsym(libc, "malloc");
    free_fn release = (free_fn)dlsym(libc, "free");
    if (disabled && allocate && release) {
        void *probe = allocate(16);
        if (probe) {
            if (((unsigned long long)probe >> 56) != 0) disabled = 0;
            release(probe);
        }
    }
    if (disabled) {
        static const char message[] = "[Jtg-craft] Java heap pointer tagging disabled.\n";
        write(2, message, sizeof(message) - 1);
    } else {
        static const char message[] = "[Jtg-craft] WARNING: Could not disable Java heap pointer tagging on this Android version.\n";
        write(2, message, sizeof(message) - 1);
    }
}
