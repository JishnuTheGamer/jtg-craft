/* Preloaded into the Android OpenJDK child process before JVM startup.
 * Android 12+ exposes mallopt(-204, 0). Android 11 needs android_mallopt(8).
 * References: AOSP libc/include/malloc.h and libc/platform/bionic/malloc.h.
 */
extern int mallopt(int option, int value);
extern void *dlsym(void *handle, const char *name);
extern long write(int fd, const void *buffer, unsigned long size);

__attribute__((constructor))
static void disable_heap_tagging(void) {
    int disabled = mallopt(-204, 0);
    if (!disabled) {
        typedef _Bool (*android_mallopt_fn)(int, void *, unsigned long);
        android_mallopt_fn legacy = (android_mallopt_fn)dlsym((void *)0, "android_mallopt");
        int level = 0;
        if (legacy) disabled = legacy(8, &level, sizeof(level));
    }
    if (disabled) {
        static const char message[] = "[Jtg-craft] Java heap pointer tagging disabled.\n";
        write(2, message, sizeof(message) - 1);
    } else {
        static const char message[] = "[Jtg-craft] WARNING: Could not disable Java heap pointer tagging on this Android version.\n";
        write(2, message, sizeof(message) - 1);
    }
}
