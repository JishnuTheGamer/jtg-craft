"""Check the actual ELF dependency that caused mobile Java 25 to fail at startup."""
import hashlib
import struct
from pathlib import Path


def elf(path):
    data = path.read_bytes()
    assert data[:6] == b'\x7fELF\x02\x01', f'Not little-endian ELF64: {path}'
    assert struct.unpack_from('<H', data, 18)[0] == 183, f'Not ARM64: {path}'
    offset = struct.unpack_from('<Q', data, 40)[0]
    size, count = struct.unpack_from('<HH', data, 58)
    sections = [struct.unpack_from('<IIQQQQIIQQ', data, offset + i * size) for i in range(count)]
    needed, imports, exports = set(), set(), set()
    for section in sections:
        if section[1] not in (6, 11):
            continue
        strings = sections[section[6]][4]

        def string(index):
            start = strings + index
            return data[start:data.index(b'\0', start)].decode()

        if section[1] == 6:
            for at in range(section[4], section[4] + section[5], 16):
                tag, value = struct.unpack_from('<QQ', data, at)
                if tag == 1:
                    needed.add(string(value))
        else:
            for at in range(section[4], section[4] + section[5], section[9]):
                name, info, _, defined, _, _ = struct.unpack_from('<IBBHQQ', data, at)
                if name and defined and info >> 4 in (1, 2):
                    exports.add(string(name))
                elif name and not defined and info >> 4 == 1:
                    imports.add(string(name))
    return needed, imports, exports


cpp = Path('mobile/android/app/src/main/assets/runtime/arm64-v8a/libc++_shared.so')
assert hashlib.sha256(cpp.read_bytes()).hexdigest() == '28e7a3a306d7fc222c62abe08741cfcba38c3f336216c4563726bf985ae3cfd6'
_, _, provided = elf(cpp)
home = Path('ui-preview/runtime-extraction/java25')
count = 0
for name in ['bin/java', 'lib/libjli.so', 'lib/server/libjvm.so', 'lib/libjava.so']:
    needed, imports, _ = elf(home / name)
    assert 'libc++_shared.so' in needed, f'Expected Java 25 C++ dependency in {name}'
    cpp_imports = {symbol for symbol in imports if symbol.startswith(('_ZNSt', '_ZNKSt', '_ZSt', '__cxa_', '__gxx_', '_ZTI', '_ZTV', '_Zn', '_Zd'))}
    # Process destructors are exported by Bionic libc, rather than libc++.
    missing = cpp_imports - provided - {'__cxa_atexit', '__cxa_finalize', '__cxa_thread_atexit_impl'}
    assert not missing, f'Bundled C++ runtime cannot resolve {name}: {sorted(missing)}'
    count += len(cpp_imports)
print(f'Java 25 ARM64: bundled C++ SHA256 and {count} imported C++ symbols resolved. Device execution still requires a phone.')
