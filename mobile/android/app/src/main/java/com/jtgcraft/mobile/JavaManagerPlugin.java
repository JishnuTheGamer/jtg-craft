package com.jtgcraft.mobile;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Environment;
import android.system.Os;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.tukaani.xz.XZInputStream;
import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.zip.GZIPInputStream;

@CapacitorPlugin(name = "JavaManager")
public class JavaManagerPlugin extends Plugin {

    private static final String PREFS_NAME = "jtg_java_prefs";
    private static final String KEY_JAVA_SETTING = "java_version_setting";

    // Primary Android-native OpenJDK (ARM64 Bionic libc from PojavLauncher)
    private static final String POJAV_JRE17_ARM64_URL = 
        "https://github.com/PojavLauncherTeam/android-openjdk-build-multiarch/releases/download/jre17-ec28559/jre17-arm64-20210825-release.tar.xz";

    public File getJavaRootDir() {
        File d = new File(getContext().getFilesDir(), "java");
        if (!d.exists()) d.mkdirs();
        return d;
    }

    public static File getPersistentArchive() {
        File[] candidates = new File[] {
            new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "JtgCraft/jre17-android.tar.xz"),
            new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "jre17-android.tar.xz"),
            new File("/storage/emulated/0/Download/JtgCraft/jre17-android.tar.xz"),
            new File("/storage/emulated/0/Download/jre17-android.tar.xz"),
            new File("/storage/emulated/0/JtgCraft/jre17-android.tar.xz"),
            new File("/sdcard/Download/JtgCraft/jre17-android.tar.xz"),
            new File("/sdcard/Download/jre17-android.tar.xz"),
            new File("/sdcard/JtgCraft/jre17-android.tar.xz")
        };
        for (File f : candidates) {
            try {
                if (f != null && f.exists() && f.length() > 5000000) {
                    return f;
                }
            } catch (Exception ignored) {}
        }
        return candidates[0];
    }

    public File getJavaBinary() {
        File root = getJavaRootDir();
        File direct = new File(root, "bin/java");
        if (direct.exists()) return direct;

        File[] subdirs = root.listFiles(File::isDirectory);
        if (subdirs != null) {
            for (File dir : subdirs) {
                File nested = new File(dir, "bin/java");
                if (nested.exists()) return nested;
            }
        }

        // Check external PojavLauncher runtimes or persistent shared storage
        try {
            File[] externalPaths = new File[] {
                new File("/storage/emulated/0/PojavLauncher/runtimes"),
                new File("/sdcard/PojavLauncher/runtimes"),
                new File(getContext().getExternalFilesDir(null), "java")
            };
            for (File ext : externalPaths) {
                if (ext != null && ext.exists()) {
                    File found = findJavaRecursively(ext, 3);
                    if (found != null && found.exists()) return found;
                }
            }
        } catch (Exception ignored) {}

        return direct;
    }

    private File findJavaRecursively(File dir, int depth) {
        if (depth <= 0 || dir == null || !dir.exists()) return null;
        File javaBin = new File(dir, "bin/java");
        if (javaBin.exists()) return javaBin;
        File[] children = dir.listFiles(File::isDirectory);
        if (children != null) {
            for (File c : children) {
                File res = findJavaRecursively(c, depth - 1);
                if (res != null) return res;
            }
        }
        return null;
    }

    @PluginMethod
    public void checkJava(PluginCall call) {
        try {
            File javaBin = getJavaBinary();
            if (javaBin.exists() && (javaBin.canExecute() || javaBin.setExecutable(true, false))) {
                JSObject ret = new JSObject();
                ret.put("installed", true);
                ret.put("version", "17");
                ret.put("path", javaBin.getAbsolutePath());
                call.resolve(ret);
                return;
            }

            // Check if persistent archive is cached on phone storage (e.g. after app reinstall)
            File archive = getPersistentArchive();
            if (archive != null && archive.exists() && archive.length() > 10000000) {
                File javaDir = getJavaRootDir();
                if (javaDir.exists()) deleteRecursive(javaDir);
                javaDir.mkdirs();
                extractArchive(archive, javaDir);
                setExecutableRecursive(javaDir);

                File recoveredBin = getJavaBinary();
                if (recoveredBin.exists()) {
                    recoveredBin.setExecutable(true, false);
                    JSObject ret = new JSObject();
                    ret.put("installed", true);
                    ret.put("version", "17");
                    ret.put("path", recoveredBin.getAbsolutePath());
                    call.resolve(ret);
                    return;
                }
            }

            JSObject ret = new JSObject();
            ret.put("installed", false);
            call.resolve(ret);
        } catch (Exception e) {
            JSObject ret = new JSObject();
            ret.put("installed", false);
            ret.put("error", e.getMessage());
            call.resolve(ret);
        }
    }

    @PluginMethod
    public void installJava(PluginCall call) {
        String version = call.getString("version", "17");
        new Thread(() -> {
            HttpURLConnection conn = null;
            InputStream in = null;
            FileOutputStream out = null;
            try {
                // First check if persistent archive already exists on phone storage!
                File persistentArchive = getPersistentArchive();
                File targetArchive;

                if (persistentArchive != null && persistentArchive.exists() && persistentArchive.length() > 10000000) {
                    // Reuse local cached archive
                    targetArchive = persistentArchive;
                    JSObject notify = new JSObject();
                    notify.put("step", "java");
                    notify.put("status", "Found local cached Java archive! Extracting...");
                    notify.put("percent", 70);
                    notifyListeners("setup-progress", notify);
                } else {
                    // Download PojavLauncher Android OpenJDK ARM64
                    String urlStr = POJAV_JRE17_ARM64_URL;

                    URL currentUrl = new URL(urlStr);
                    int redirects = 0;
                    while (redirects < 6) {
                        conn = (HttpURLConnection) currentUrl.openConnection();
                        conn.setRequestProperty("User-Agent", "Mozilla/5.0 JtgCraft/1.0 (Android)");
                        conn.setInstanceFollowRedirects(true);
                        conn.setConnectTimeout(20000);
                        conn.setReadTimeout(60000);
                        conn.connect();

                        int responseCode = conn.getResponseCode();
                        if (responseCode == HttpURLConnection.HTTP_MOVED_PERM || 
                            responseCode == HttpURLConnection.HTTP_MOVED_TEMP || 
                            responseCode == 307 || responseCode == 308) {
                            String newLocation = conn.getHeaderField("Location");
                            conn.disconnect();
                            if (newLocation == null) break;
                            currentUrl = new URL(newLocation);
                            redirects++;
                        } else {
                            break;
                        }
                    }

                    int code = conn.getResponseCode();
                    if (code != 200) {
                        throw new IOException("HTTP " + code + " while downloading Java runtime");
                    }

                    long totalBytes = conn.getContentLengthLong();
                    in = conn.getInputStream();

                    targetArchive = new File(getContext().getCacheDir(), "jre-android.tar.xz");
                    out = new FileOutputStream(targetArchive);

                    byte[] buf = new byte[32768];
                    int n;
                    long downloaded = 0;
                    long lastNotify = 0;

                    while ((n = in.read(buf)) != -1) {
                        out.write(buf, 0, n);
                        downloaded += n;
                        long now = System.currentTimeMillis();
                        if (now - lastNotify > 250) {
                            lastNotify = now;
                            int intPct = totalBytes > 0 ? (int) Math.min(80, (downloaded * 80L / totalBytes)) : 40;

                            JSObject progress = new JSObject();
                            progress.put("step", "java");
                            progress.put("status", "Downloading Java ARM64 (" + intPct + "%)...");
                            progress.put("percent", intPct);
                            progress.put("downloaded", downloaded);
                            progress.put("total", totalBytes);

                            notifyListeners("setup-progress", progress);
                            notifyListeners("java-download-progress", progress);
                        }
                    }
                    out.flush();
                    out.close();
                    out = null;
                    in.close();
                    in = null;

                    if (targetArchive.length() < 5000000) {
                        throw new IOException("Downloaded archive is incomplete (" + targetArchive.length() + " bytes)");
                    }

                    // Save persistent copy to phone storage for reinstalls
                    try {
                        File[] saveLocations = new File[] {
                            new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "JtgCraft/jre17-android.tar.xz"),
                            new File("/storage/emulated/0/Download/JtgCraft/jre17-android.tar.xz"),
                            new File("/sdcard/Download/JtgCraft/jre17-android.tar.xz")
                        };
                        for (File p : saveLocations) {
                            try {
                                File parent = p.getParentFile();
                                if (parent != null && !parent.exists()) parent.mkdirs();
                                copyFile(targetArchive, p);
                            } catch (Exception ignored) {}
                        }
                    } catch (Exception ignored) {}
                }

                // Notify extracting
                JSObject extractNotify = new JSObject();
                extractNotify.put("step", "java");
                extractNotify.put("status", "Extracting Android Java runtime...");
                extractNotify.put("percent", 85);
                notifyListeners("setup-progress", extractNotify);
                notifyListeners("java-download-progress", extractNotify);

                File javaDir = getJavaRootDir();
                if (javaDir.exists()) {
                    deleteRecursive(javaDir);
                }
                javaDir.mkdirs();

                extractArchive(targetArchive, javaDir);
                setExecutableRecursive(javaDir);

                // Notify finished
                JSObject doneNotify = new JSObject();
                doneNotify.put("step", "java");
                doneNotify.put("status", "Java 17 ARM64 Installed");
                doneNotify.put("percent", 100);
                notifyListeners("setup-progress", doneNotify);
                notifyListeners("java-download-progress", doneNotify);

                File javaBin = getJavaBinary();
                JSObject res = new JSObject();
                res.put("success", true);
                res.put("path", javaBin.getAbsolutePath());
                call.resolve(res);

            } catch (Exception e) {
                JSObject errNotify = new JSObject();
                errNotify.put("step", "java");
                errNotify.put("status", "Java install failed: " + e.getMessage());
                errNotify.put("percent", 0);
                notifyListeners("setup-progress", errNotify);
                call.reject("Failed to download or install Java: " + e.getMessage());
            } finally {
                if (conn != null) conn.disconnect();
                try { if (in != null) in.close(); } catch (Exception ignored) {}
                try { if (out != null) out.close(); } catch (Exception ignored) {}
            }
        }).start();
    }

    @PluginMethod
    public void getJavaSettings(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String setting = prefs.getString(KEY_JAVA_SETTING, "auto");
        JSObject ret = new JSObject();
        ret.put("setting", setting);
        ret.put("installedPath", getJavaBinary().getAbsolutePath());
        call.resolve(ret);
    }

    @PluginMethod
    public void setJavaVersion(PluginCall call) {
        String setting = call.getString("setting", "auto");
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit().putString(KEY_JAVA_SETTING, setting).apply();
        JSObject ret = new JSObject();
        ret.put("success", true);
        ret.put("setting", setting);
        call.resolve(ret);
    }

    private void extractArchive(File archiveFile, File destDir) throws Exception {
        InputStream raw = new FileInputStream(archiveFile);
        InputStream decompressed;
        if (archiveFile.getName().endsWith(".xz")) {
            decompressed = new XZInputStream(raw);
        } else {
            decompressed = new GZIPInputStream(raw);
        }

        try (TarArchiveReader reader = new TarArchiveReader(decompressed)) {
            TarEntry entry;
            byte[] buffer = new byte[32768];
            while ((entry = reader.getNextEntry()) != null) {
                String name = entry.getName();
                if (name.startsWith("PaxHeaders.") || name.contains("@LongLink")) {
                    continue;
                }
                if (name.startsWith("./")) {
                    name = name.substring(2);
                }
                if (name.isEmpty()) continue;

                File destPath = new File(destDir, name);
                if (entry.isDirectory()) {
                    destPath.mkdirs();
                } else if (entry.isSymbolicLink()) {
                    File parent = destPath.getParentFile();
                    if (parent != null) parent.mkdirs();
                    try {
                        destPath.delete();
                        Os.symlink(entry.getLinkTarget(), destPath.getAbsolutePath());
                    } catch (Exception e) {
                        try {
                            File target = new File(entry.getLinkTarget());
                            if (!target.isAbsolute() && parent != null) {
                                target = new File(parent, entry.getLinkTarget());
                            }
                            if (target.exists()) copyFile(target, destPath);
                        } catch (Exception ignored) {}
                    }
                } else {
                    File parent = destPath.getParentFile();
                    if (parent != null) parent.mkdirs();
                    try (FileOutputStream fos = new FileOutputStream(destPath)) {
                        long remaining = entry.getSize();
                        int readChunk;
                        while (remaining > 0 && (readChunk = reader.read(buffer, 0, (int) Math.min(buffer.length, remaining))) != -1) {
                            fos.write(buffer, 0, readChunk);
                            remaining -= readChunk;
                        }
                    }
                    if (name.contains("bin/") || name.endsWith(".so") || name.equals("java")) {
                        destPath.setExecutable(true, false);
                        destPath.setReadable(true, false);
                    }
                }
            }
        }
    }

    private void copyFile(File src, File dst) throws IOException {
        try (InputStream in = new FileInputStream(src); OutputStream out = new FileOutputStream(dst)) {
            byte[] buf = new byte[32768];
            int len;
            while ((len = in.read(buf)) > 0) {
                out.write(buf, 0, len);
            }
        }
    }

    private void setExecutableRecursive(File file) {
        if (file.isDirectory()) {
            File[] children = file.listFiles();
            if (children != null) {
                for (File child : children) setExecutableRecursive(child);
            }
        } else {
            String p = file.getAbsolutePath();
            if (p.contains("/bin/") || p.contains("\\bin\\") || p.endsWith(".so") || file.getName().equals("java")) {
                file.setExecutable(true, false);
                file.setReadable(true, false);
                try {
                    Os.chmod(p, 0755);
                } catch (Throwable ignored) {}
            }
        }
    }

    private void deleteRecursive(File f) {
        if (f.isDirectory()) {
            File[] children = f.listFiles();
            if (children != null) {
                for (File c : children) deleteRecursive(c);
            }
        }
        f.delete();
    }

    // ── Robust TAR format reader handling GNU LongLink, PAX headers & exact sizes ──
    private static class TarArchiveReader implements Closeable {
        private final InputStream in;
        private long bytesRemainingInEntry = 0;
        private String pendingLongName = null;

        public TarArchiveReader(InputStream in) {
            this.in = in;
        }

        public TarEntry getNextEntry() throws IOException {
            if (bytesRemainingInEntry > 0) {
                skipFully(bytesRemainingInEntry);
                bytesRemainingInEntry = 0;
            }

            while (true) {
                byte[] header = new byte[512];
                int read = 0;
                while (read < 512) {
                    int n = in.read(header, read, 512 - read);
                    if (n == -1) return null;
                    read += n;
                }

                boolean allZero = true;
                for (byte b : header) {
                    if (b != 0) { allZero = false; break; }
                }
                if (allZero) return null;

                String name = pendingLongName != null ? pendingLongName : parseNullTerminatedString(header, 0, 100);
                pendingLongName = null;

                long size = parseOctal(header, 124, 12);
                byte typeFlag = header[156];
                String linkTarget = parseNullTerminatedString(header, 157, 100);

                if (typeFlag == 'L') {
                    ByteArrayOutputStream baos = new ByteArrayOutputStream();
                    byte[] tmp = new byte[512];
                    long remaining = size;
                    while (remaining > 0) {
                        int r = in.read(tmp, 0, (int) Math.min(tmp.length, remaining));
                        if (r == -1) break;
                        baos.write(tmp, 0, r);
                        remaining -= r;
                    }
                    long pad = (512 - (size % 512)) % 512;
                    skipFully(pad);
                    pendingLongName = baos.toString("UTF-8").trim().replace("\0", "");
                    continue;
                }

                long padding = (512 - (size % 512)) % 512;
                bytesRemainingInEntry = size + padding;

                boolean isDir = typeFlag == '5' || name.endsWith("/");
                boolean isSymlink = typeFlag == '2';

                return new TarEntry(name, size, isDir, isSymlink, linkTarget);
            }
        }

        public int read(byte[] b, int off, int len) throws IOException {
            if (bytesRemainingInEntry <= 0) return -1;
            int toRead = (int) Math.min(len, bytesRemainingInEntry);
            int n = in.read(b, off, toRead);
            if (n != -1) bytesRemainingInEntry -= n;
            return n;
        }

        private void skipFully(long n) throws IOException {
            long remaining = n;
            byte[] skipBuf = new byte[4096];
            while (remaining > 0) {
                int r = in.read(skipBuf, 0, (int) Math.min(skipBuf.length, remaining));
                if (r == -1) break;
                remaining -= r;
            }
        }

        private static String parseNullTerminatedString(byte[] b, int off, int len) {
            int end = off;
            while (end < off + len && b[end] != 0) end++;
            try {
                return new String(b, off, end - off, "UTF-8").trim();
            } catch (Exception ignored) {
                return new String(b, off, end - off).trim();
            }
        }

        private static long parseOctal(byte[] b, int off, int len) {
            long val = 0;
            int i = off;
            while (i < off + len && (b[i] == ' ' || b[i] == 0)) i++;
            for (; i < off + len; i++) {
                if (b[i] >= '0' && b[i] <= '7') {
                    val = (val << 3) + (b[i] - '0');
                } else {
                    break;
                }
            }
            return val;
        }

        @Override
        public void close() throws IOException {
            in.close();
        }
    }

    private static class TarEntry {
        private final String name;
        private final long size;
        private final boolean isDir;
        private final boolean isSymlink;
        private final String linkTarget;

        public TarEntry(String name, long size, boolean isDir, boolean isSymlink, String linkTarget) {
            this.name = name;
            this.size = size;
            this.isDir = isDir;
            this.isSymlink = isSymlink;
            this.linkTarget = linkTarget;
        }

        public String getName() { return name; }
        public long getSize() { return size; }
        public boolean isDirectory() { return isDir; }
        public boolean isSymbolicLink() { return isSymlink; }
        public String getLinkTarget() { return linkTarget; }
    }
}
