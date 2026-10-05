package com.jtgcraft.mobile;
import java.io.*;
public class RuntimeArchiveCheck {
    public static void main(String[] arguments) throws Exception {
        for (int version : new int[]{21, 25}) {
            File root = new File("ui-preview/runtime-extraction/java" + version);
            root.mkdirs();
            JavaManagerPlugin.extractArchive(new File("mobile/.build-env/runtime-check/java" + version + "-bin-arm64.tar.xz"), root);
            JavaManagerPlugin.extractArchive(new File("mobile/.build-env/runtime-check/java" + version + "-universal.tar.xz"), root);
            for (String file : new String[]{"release", "bin/java", "lib/server/libjvm.so", "lib/modules"}) {
                if (!new File(root, file).isFile()) throw new AssertionError("Missing Java " + version + " file: " + file);
            }
            try (RandomAccessFile java = new RandomAccessFile(new File(root,"bin/java"),"r")) {
                if (java.readInt() != 0x7f454c46 || java.read() != 2) throw new AssertionError("Java must be ELF64.");
                java.seek(18); if (java.readUnsignedByte() != 183 || java.readUnsignedByte() != 0) throw new AssertionError("Java must be ARM64.");
            }
        }
        try {
            JavaManagerPlugin.extractArchive(new File("ui-preview/runtime-extraction/unsafe.tar.gz"), new File("ui-preview/runtime-extraction/safe"));
            throw new AssertionError("Archive traversal accepted");
        } catch (IOException expected) {
            if (!expected.getMessage().contains("Unsafe")) throw expected;
        }
        System.out.println("Native archive extractor: Java 21/25 binary and universal components, required files, ARM64 ELF64 and traversal rejection passed. Android execution still needs a device.");
    }
}
