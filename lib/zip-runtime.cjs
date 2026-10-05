// Streaming ZIP extraction for Windows JRE archives, without a PowerShell module.
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const zlib = require('node:zlib');
const { Transform, PassThrough } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const table = Array.from({length:256}, (_, value) => {
    for (let i = 0; i < 8; i++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    return value >>> 0;
});
async function extractRuntimeZip(archive, destination) {
    const handle = await fsp.open(archive, 'r');
    try {
        const size = (await handle.stat()).size;
        const tail = Buffer.alloc(Math.min(size, 65557));
        await handle.read(tail, 0, tail.length, size - tail.length);
        let end = -1;
        for (let i = tail.length - 22; i >= 0; i--) {
            if (tail.readUInt32LE(i) === 0x06054b50 && i + 22 + tail.readUInt16LE(i + 20) === tail.length) { end = i; break; }
        }
        if (end < 0) throw new Error('Incomplete Java ZIP archive.');
        const count = tail.readUInt16LE(end + 10), length = tail.readUInt32LE(end + 12), offset = tail.readUInt32LE(end + 16);
        if (count === 65535 || offset + length > size || length > 8 * 1024 * 1024 || tail.readUInt16LE(end + 4) !== 0 || tail.readUInt16LE(end + 6) !== 0) throw new Error('Unsupported Java ZIP format.');
        const directory = Buffer.alloc(length);
        await handle.read(directory, 0, length, offset);
        const base = path.resolve(destination);
        await fsp.mkdir(base, { recursive:true });
        let position = 0, totalBytes = 0;
        for (let i = 0; i < count; i++) {
            if (position + 46 > length || directory.readUInt32LE(position) !== 0x02014b50) throw new Error('Invalid ZIP directory.');
            const flags = directory.readUInt16LE(position + 8), method = directory.readUInt16LE(position + 10);
            const crc = directory.readUInt32LE(position + 16), compressed = directory.readUInt32LE(position + 20), uncompressed = directory.readUInt32LE(position + 24);
            const nameLength = directory.readUInt16LE(position + 28), extra = directory.readUInt16LE(position + 30), comment = directory.readUInt16LE(position + 32);
            const attributes = directory.readUInt32LE(position + 38), localOffset = directory.readUInt32LE(position + 42);
            const name = directory.subarray(position + 46, position + 46 + nameLength).toString('utf8').replace(/\\/g, '/');
            position += 46 + nameLength + extra + comment;
            if (position > length || flags & 1 || ![0,8].includes(method) || !name || name.includes('\0') || name.includes(':') || name.startsWith('/') || name.split('/').includes('..') || ((attributes >>> 16) & 0xf000) === 0xa000) throw new Error('Unsafe or unsupported Java ZIP entry.');
            const target = path.resolve(base, name);
            if (!target.startsWith(base + path.sep)) throw new Error('Java ZIP path escapes its directory.');
            totalBytes += uncompressed;
            if (uncompressed > 512 * 1024 * 1024 || totalBytes > 2 * 1024 * 1024 * 1024) throw new Error('Java ZIP exceeds extraction limits.');
            if (name.endsWith('/')) { await fsp.mkdir(target, {recursive:true}); continue; }
            const local = Buffer.alloc(30);
            await handle.read(local, 0, 30, localOffset);
            if (local.readUInt32LE(0) !== 0x04034b50) throw new Error('Invalid ZIP local header.');
            const start = localOffset + 30 + local.readUInt16LE(26) + local.readUInt16LE(28);
            if (start + compressed > offset) throw new Error('Invalid ZIP file extent.');
            await fsp.mkdir(path.dirname(target), {recursive:true});
            if (compressed === 0) {
                if (uncompressed !== 0 || crc !== 0) throw new Error('Invalid empty ZIP entry.');
                await fsp.writeFile(target, Buffer.alloc(0)); continue;
            }
            let actualSize = 0, actualCrc = 0xffffffff;
            const verify = new Transform({ transform(chunk, encoding, callback) {
                actualSize += chunk.length;
                if (actualSize > uncompressed) return callback(new Error('Java ZIP entry exceeds its declared size.'));
                for (const byte of chunk) actualCrc = table[(actualCrc ^ byte) & 255] ^ (actualCrc >>> 8);
                callback(null, chunk);
            }});
            await pipeline(fs.createReadStream(archive, {start, end:start + compressed - 1}), method === 8 ? zlib.createInflateRaw() : new PassThrough(), verify, fs.createWriteStream(target));
            if (actualSize !== uncompressed || ((actualCrc ^ 0xffffffff) >>> 0) !== crc) throw new Error('Java ZIP entry checksum mismatch.');
        }
    } finally { await handle.close(); }
}
module.exports = { extractRuntimeZip };
