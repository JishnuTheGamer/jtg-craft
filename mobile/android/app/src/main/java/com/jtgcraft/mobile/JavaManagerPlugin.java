package com.jtgcraft.mobile;

import android.content.Context;
import android.content.SharedPreferences;
import android.system.Os;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.zip.GZIPInputStream;

@CapacitorPlugin(name = "JavaManager")
public class JavaManagerPlugin extends Plugin {

    private static final String PREFS_NAME = "jtg_java_prefs";
    private static final String KEY_JAVA_SETTING = "java_version_setting";

    public File getJavaRootDir() {
        return new File(getContext().getFilesDir(), "java");
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
        return direct;
    }

    @PluginMethod
    public void checkJava(PluginCall call) {
        try {
            File javaBin = getJavaBinary();
            if (javaBin.exists() && (javaBin.canExecute() || javaBin.setExecutable(true, false))) {
                String ver = "21";
                try {
                    Process process = new ProcessBuilder(javaBin.getAbsolutePath(), "-version").redirectErrorStream(true).start();
                    BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()));
                    String line = reader.readLine();
                    process.waitFor();
                    if (line != null) {
                        if (line.contains("21.")) ver = "21";
                        else if (line.contains("17.")) ver = "17";
                        else if (line.contains("25.")) ver = "25";
                    }
                } catch (Exception ignored) {
                    // On some Android SELinux policies, test-executing may fail during probe, but binary exists
                }

                JSObject ret = new JSObject();
                ret.put("installed", true);
                ret.put("version", ver);
                ret.put("path", javaBin.getAbsolutePath());
                call.resolve(ret);
            } else {
                JSObject ret = new JSObject();
                ret.put("installed", false);
                call.resolve(ret);
            }
        } catch (Exception e) {
            JSObject ret = new JSObject();
            ret.put("installed", false);
            ret.put("error", e.getMessage());
            call.resolve(ret);
        }
    }

    @PluginMethod
    public void installJava(PluginCall call) {
        String version = call.getString("version", "21");
        new Thread(() -> {
            HttpURLConnection conn = null;
            InputStream in = null;
            FileOutputStream out = null;
            try {
                // Primary download URLs for ARM64 Linux JRE
                String urlStr = "https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.2%2B13/OpenJDK21U-jre_aarch64_linux_hotspot_21.0.2_13.tar.gz";
                if ("17".equals(version)) {
                    urlStr = "https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.10%2B7/OpenJDK17U-jre_aarch64_linux_hotspot_17.0.10_7.tar.gz";
                }

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

                File targetTarGz = new File(getContext().getCacheDir(), "jre-" + version + ".tar.gz");
                out = new FileOutputStream(targetTarGz);

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
                        progress.put("status", "Downloading Java " + version + " (" + intPct + "%)...");
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

                if (targetTarGz.length() < 5000000) {
                    throw new IOException("Downloaded archive is incomplete (" + targetTarGz.length() + " bytes)");
                }

                // Notify extracting
                JSObject extractNotify = new JSObject();
                extractNotify.put("step", "java");
                extractNotify.put("status", "Extracting Java " + version + " runtime...");
                extractNotify.put("percent", 85);
                notifyListeners("setup-progress", extractNotify);
                notifyListeners("java-download-progress", extractNotify);

                // Extract tar.gz into app files/java directory
                File javaDir = getJavaRootDir();
                if (javaDir.exists()) {
                    deleteRecursive(javaDir);
                }
                javaDir.mkdirs();

                extractTarGz(targetTarGz, javaDir);

                // Set executable permissions recursively
                setExecutableRecursive(javaDir);

                targetTarGz.delete();

                // Notify finished
                JSObject doneNotify = new JSObject();
                doneNotify.put("step", "java");
                doneNotify.put("status", "Installed successfully");
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

    private void extractTarGz(File tarGzFile, File destDir) throws Exception {
        // Try native tar first if present
        try {
            Process p = new ProcessBuilder("tar", "-xzf", tarGzFile.getAbsolutePath(), "-C", destDir.getAbsolutePath()).start();
            if (p.waitFor() == 0) {
                return;
            }
        } catch (Exception ignored) {}

        // Standalone robust pure-Java tar extractor
        try (TarArchiveReader reader = new TarArchiveReader(new GZIPInputStream(new FileInputStream(tarGzFile)))) {
            TarEntry entry;
            byte[] buffer = new byte[32768];
            while ((entry = reader.getNextEntry()) != null) {
                String name = entry.getName();
                // Skip header entries
                if (name.startsWith("PaxHeaders.") || name.contains("@LongLink")) {
                    continue;
                }

                File destPath = new File(destDir, name);
                if (entry.isDirectory()) {
                    destPath.mkdirs();
                } else if (entry.isSymbolicLink()) {
                    File parent = destPath.getParentFile();
                    if (parent != null) parent.mkdirs();
                    try {
                        destPath.delete();
                        Os.symlink(entry.getLinkTarget(), destPath.getAbsolutePath());
                    } catch (Exception ignored) {}
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
                    if (name.contains("bin/") || name.endsWith(".so")) {
                        destPath.setExecutable(true, false);
                        destPath.setReadable(true, false);
                    }
                }
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
            // Discard any unread bytes of current entry + pad to 512 boundary
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

                // Check for EOF (two 512-byte zero blocks)
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

                // GNU LongLink: entry content contains full path
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
                    // Skip tar 512 padding for long link
                    long pad = (512 - (size % 512)) % 512;
                    skipFully(pad);
                    pendingLongName = baos.toString("UTF-8").trim().replace("\0", "");
                    continue;
                }

                // Align tar stream so that reader reads strictly `size` bytes, and then discards padding
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

