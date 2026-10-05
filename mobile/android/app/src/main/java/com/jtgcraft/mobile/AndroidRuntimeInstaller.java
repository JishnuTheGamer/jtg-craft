package com.jtgcraft.mobile;
import android.content.Context;
import java.io.*;
import java.net.*;

/** Pinned Android/Bionic ARM64 runtimes; desktop Linux distributions cannot run here. */
final class AndroidRuntimeInstaller {
    private static final String SOURCE = "https://raw.githubusercontent.com/ZalithLauncher/ZalithLauncher2/06bf273371a61ff5398efa9ed10c0adfc4cd075c/ZalithLauncher/src/main/assets/runtimes/jre-";
    static synchronized boolean install(Context context, int version, JavaManagerPlugin.JavaProgressListener listener) throws Exception {
        if (version != 21 && version != 25) throw new IOException("Unsupported Java runtime: " + version);
        File installed = new File(context.getFilesDir(), "java" + version);
        File binary = JavaManagerPlugin.findJavaBinaryInDir(installed);
        if (new File(installed, ".jtg-complete").isFile() && binary.exists() && binary.canExecute()) return true;
        String[] files = { "bin-arm64.tar.xz", "universal.tar.xz" };
        String[] hashes = version == 21 ? new String[] { "9889de6d0526e0c9708ea18c6e7e41a7c3d5ae366a02524ae3a392274d3462b5", "57bd118b3696d572257c5f4be1762379eb6a81361a17da1c4b0b9f7131dd6d7c" }
            : new String[] { "16f09d1d163c008ae556be68c624057c4791c21ae6d31302334e61d75439567b", "23141bf4e0ed46ff0b751c6cc32b3863d39e6a37b720f3d86a4fe9318aeb8e9f" };
        File stage = new File(context.getFilesDir(), "java" + version + "-stage");
        File backup = new File(context.getFilesDir(), "java" + version + "-previous");
        if (stage.exists()) JavaManagerPlugin.deleteRecursive(stage);
        if (!stage.mkdirs()) throw new IOException("Cannot stage Java runtime.");
        try {
            for (int i = 0; i < files.length; i++) {
                File archive = new File(context.getFilesDir(), "jre" + version + "-" + i + ".tar.xz");
                if (listener != null) listener.onProgress(5 + i * 40, "Downloading Java " + version + " ARM64 component " + (i + 1) + "/2");
                try {
                    if (!archive.isFile() || !AppUpdaterPlugin.hash(archive).equals(hashes[i])) {
                        HttpURLConnection connection = (HttpURLConnection)new URL(SOURCE + version + "/" + files[i]).openConnection();
                        connection.setConnectTimeout(25000); connection.setReadTimeout(120000);
                        try {
                            if (connection.getResponseCode() != 200) throw new IOException("Java download HTTP " + connection.getResponseCode());
                            try (InputStream input = connection.getInputStream(); OutputStream output = new FileOutputStream(archive)) {
                                byte[] bytes = new byte[32768]; int count; long size = 0, last = 0;
                                long total = connection.getContentLengthLong();
                                while ((count = input.read(bytes)) != -1) {
                                    size += count; if (size > 80 * 1024 * 1024) throw new IOException("Java archive too large."); output.write(bytes, 0, count);
                                    if (listener != null && System.currentTimeMillis()-last > 250) {
                                        last = System.currentTimeMillis();
                                        int percent = total > 0 ? 5 + i * 40 + (int)Math.min(30, size * 30 / total) : 5 + i * 40;
                                        listener.onProgress(percent, "Downloading Java " + version + " component " + (i+1) + "/2 (" + size/1024 + " KB)");
                                    }
                                }
                            }
                        } finally { connection.disconnect(); }
                    }
                    if (!AppUpdaterPlugin.hash(archive).equals(hashes[i])) throw new IOException("Java archive checksum mismatch.");
                    if (listener != null) listener.onProgress(35+i*40, "Extracting Java " + version + " component " + (i+1) + "/2");
                    JavaManagerPlugin.extractArchive(archive, stage);
                } catch (Exception error) { archive.delete(); throw error; }
            }
            JavaManagerPlugin.setExecutableRecursive(stage);
            File stagedJava = JavaManagerPlugin.findJavaBinaryInDir(stage);
            File release = new File(stagedJava.getParentFile().getParentFile(), "release");
            String text;
            try (InputStream input = new FileInputStream(release); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                byte[] bytes = new byte[4096]; int count; while ((count = input.read(bytes)) != -1) output.write(bytes, 0, count); text = output.toString("UTF-8");
            }
            if (!text.contains("JAVA_VERSION=\"" + version + ".") || !stagedJava.isFile() || !stagedJava.canExecute()) throw new IOException("Extracted Java has the wrong version.");
            try (FileWriter writer = new FileWriter(new File(stage, ".jtg-complete"))) { writer.write(String.valueOf(version)); }
            if (backup.exists()) JavaManagerPlugin.deleteRecursive(backup);
            if (installed.exists() && !installed.renameTo(backup)) throw new IOException("Cannot preserve installed Java.");
            if (!stage.renameTo(installed)) { if (backup.exists()) backup.renameTo(installed); throw new IOException("Cannot activate Java."); }
            if (backup.exists()) JavaManagerPlugin.deleteRecursive(backup);
            if (listener != null) listener.onProgress(100, "Java " + version + " ARM64 installed");
            return true;
        } finally { if (stage.exists()) JavaManagerPlugin.deleteRecursive(stage); }
    }
}
