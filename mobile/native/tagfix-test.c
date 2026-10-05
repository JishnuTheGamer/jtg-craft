#include <assert.h>
#include <string.h>

static int mode, modern_calls, legacy_calls, lookup_calls;
static char output[256];
int mallopt(int option, int value) {
    assert(option == -204 && value == 0);
    modern_calls++;
    return mode == 1;
}
static _Bool legacy_mallopt(int option, void *arg, unsigned long size) {
    assert(option == 8 && size == sizeof(int) && *(int *)arg == 0);
    legacy_calls++;
    return mode == 2;
}
void *dlsym(void *handle, const char *name) {
    assert(handle == 0 && strcmp(name, "android_mallopt") == 0);
    lookup_calls++;
    return mode == 0 ? 0 : (void *)legacy_mallopt;
}
long write(int fd, const void *buffer, unsigned long size) {
    assert(fd == 2 && size < sizeof(output));
    memcpy(output, buffer, size);
    output[size] = 0;
    return size;
}
#include "tagfix.c"

int main(void) {
    for (mode = 0; mode <= 3; mode++) {
        modern_calls = legacy_calls = lookup_calls = 0;
        output[0] = 0;
        disable_heap_tagging();
        assert(modern_calls == 1);
        assert(lookup_calls == (mode != 1));
        assert(legacy_calls == (mode == 2 || mode == 3));
        assert((strstr(output, "WARNING") != 0) == (mode == 0 || mode == 3));
        assert((strstr(output, "tagging disabled") != 0) == (mode == 1 || mode == 2));
    }
    return 0;
}
