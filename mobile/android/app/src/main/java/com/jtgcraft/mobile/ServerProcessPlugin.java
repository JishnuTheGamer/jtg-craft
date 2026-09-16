package com.jtgcraft.mobile;

import android.content.Context;
import android.content.Intent;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Properties;

@CapacitorPlugin(name = "ServerProcess")
public class ServerProcessPlugin extends Plugin {

    private static Process serverProcess = null;
    private static BufferedWriter processInput = null;
    private static boolean isRunning = false;
    private static long startTime = 0;

    public static final String PREFS_NAME = "jtg_server_prefs";
    public static final String KEY_SERVER_DIR = "active_server_dir";

    public static File getActiveServerDir(Context ctx) {
        android.content.SharedPreferences prefs = ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String saved = prefs.getString(KEY_SERVER_DIR, null);
        if (saved != null && !saved.trim().isEmpty()) {
            File dir = new File(saved.trim());
            if (!dir.exists()) dir.mkdirs();
            return dir;
        }
        File serversRoot = new File(ctx.getFilesDir(), "servers");
        if (!serversRoot.exists()) serversRoot.mkdirs();
        File defaultServer = new File(serversRoot, "default");
        if (!defaultServer.exists()) defaultServer.mkdirs();
        return defaultServer;
    }

    public static void setActiveServerDir(Context ctx, String path) {
        if (path == null || path.trim().isEmpty()) return;
        File dir = new File(path.trim());
        if (!dir.exists()) dir.mkdirs();
        android.content.SharedPreferences prefs = ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit().putString(KEY_SERVER_DIR, dir.getAbsolutePath()).apply();
    }

    private File getServerDir() {
        return getActiveServerDir(getContext());
    }

    private File getJavaBinary() {
        File root = new File(getContext().getFilesDir(), "java");
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

    // Auto-healing for server metadata (.mcmeta.json)
    private void ensureMetadata() {
        File dir = getServerDir();
        File meta = new File(dir, ".mcmeta.json");
        if (!meta.exists()) {
            try (FileWriter fw = new FileWriter(meta)) {
                JSObject obj = new JSObject();
                obj.put("name", "Jtg Server");
                obj.put("version", "1.20.4");
                obj.put("created", System.currentTimeMillis());
                obj.put("platform", "android");
                fw.write(obj.toString());
            } catch (Exception ignored) {}
        }
    }

    @PluginMethod
    public void createServer(PluginCall call) {
        String version = call.getString("version", "1.20.4");
        String serverName = call.getString("name", "Jtg Server");
        String customDir = call.getString("dir", null);
        if (customDir != null && !customDir.trim().isEmpty()) {
            setActiveServerDir(getContext(), customDir);
        }
        int ramMb = call.getInt("ram", 1024);
        new Thread(() -> {
            try {
                File sdir = getServerDir();
                sdir.mkdirs();

                // 1. Create eula.txt
                File eula = new File(sdir, "eula.txt");
                try (FileWriter fw = new FileWriter(eula)) {
                    fw.write("eula=true\n");
                }

                // 2. Create server.properties
                File props = new File(sdir, "server.properties");
                if (!props.exists()) {
                    try (FileWriter fw = new FileWriter(props)) {
                        fw.write("server-port=25565\nmotd=A Minecraft Server Powered by Jtg-craft Mobile\nonline-mode=false\nmax-players=10\npvp=true\ndifficulty=easy\n");
                    }
                }

                // 3. Create metadata
                File meta = new File(sdir, ".mcmeta.json");
                try (FileWriter fw = new FileWriter(meta)) {
                    JSObject obj = new JSObject();
                    obj.put("name", serverName);
                    obj.put("version", version);
                    obj.put("ram", ramMb);
                    obj.put("created", System.currentTimeMillis());
                    obj.put("platform", "android");
                    fw.write(obj.toString());
                } catch (Exception ignored) {}

                // 4. Download Paper JAR using direct CDN URLs (no API calls)
                File jar = new File(sdir, "paper.jar");
                if (!jar.exists()) {
                    JSObject notify = new JSObject();
                    notify.put("step", "paper");
                    notify.put("status", "Downloading Paper " + version + "...");
                    notify.put("percent", 10);
                    notifyListeners("setup-progress", notify);

                    String downloadJarUrl = getPaperDirectUrl(version);

                    URL currentUrl = new URL(downloadJarUrl);
                    HttpURLConnection conn = null;
                    int redirects = 0;

                    // Follow redirects manually (handles cross-domain redirects)
                    while (redirects < 6) {
                        conn = (HttpURLConnection) currentUrl.openConnection();
                        conn.setRequestProperty("User-Agent", "Mozilla/5.0 JtgCraft/1.0 (Android)");
                        conn.setInstanceFollowRedirects(true);
                        conn.setConnectTimeout(15000);
                        conn.setReadTimeout(60000);
                        conn.connect();

                        int code = conn.getResponseCode();
                        if (code == 301 || code == 302 || code == 307 || code == 308) {
                            String loc = conn.getHeaderField("Location");
                            conn.disconnect();
                            if (loc == null) break;
                            currentUrl = new URL(loc);
                            redirects++;
                        } else {
                            break;
                        }
                    }

                    long totalBytes = conn.getContentLengthLong();
                    try (InputStream in = conn.getInputStream(); FileOutputStream out = new FileOutputStream(jar)) {
                        byte[] buf = new byte[16384];
                        int n;
                        long downloaded = 0;
                        long lastNotify = 0;
                        while ((n = in.read(buf)) != -1) {
                            out.write(buf, 0, n);
                            downloaded += n;
                            long now = System.currentTimeMillis();
                            if (now - lastNotify > 300) {
                                lastNotify = now;
                                int pct = totalBytes > 0 ? (int)(10 + (downloaded * 85L / totalBytes)) : 50;
                                JSObject dlNotify = new JSObject();
                                dlNotify.put("step", "paper");
                                dlNotify.put("status", "Downloading Paper " + version + " (" + pct + "%)...");
                                dlNotify.put("percent", Math.min(pct, 95));
                                notifyListeners("setup-progress", dlNotify);
                                notifyListeners("download-progress", dlNotify);
                            }
                        }
                    }
                    conn.disconnect();

                    // Verify download
                    if (jar.length() < 100000) {
                        jar.delete();
                        throw new IOException("Paper JAR download failed or file too small (" + jar.length() + " bytes)");
                    }
                }

                JSObject finish = new JSObject();
                finish.put("step", "done");
                finish.put("percent", 100);
                notifyListeners("setup-progress", finish);

                JSObject res = new JSObject();
                res.put("success", true);
                call.resolve(res);

            } catch (Exception e) {
                call.reject("Failed to create server: " + e.getMessage());
            }
        }).start();
    }

    /**
     * Direct CDN URL catalog for Paper versions.
     * These are pre-resolved fill-data.papermc.io URLs that bypass the API entirely.
     */
    private String getPaperDirectUrl(String version) {
        switch (version) {
            case "1.21.11":
                return "https://fill-data.papermc.io/v1/objects/e708e8c132dc143ffd73528cccb9532e2eb17628b1a0eee74469bf466c7003f8/paper-1.21.11-116.jar";
            case "1.21.10":
                return "https://fill-data.papermc.io/v1/objects/158703f75a26f842ea656b3dc6d75bf3d1ec176b97a2c36384d0b80b3871af53/paper-1.21.10-130.jar";
            case "1.21.9":
                return "https://fill-data.papermc.io/v1/objects/aec002e77c7566e49494fdf05430b96078ffd1d7430e652d4f338fef951e7a10/paper-1.21.9-59.jar";
            case "1.21.8":
                return "https://fill-data.papermc.io/v1/objects/8de7c52c3b02403503d16fac58003f1efef7dd7a0256786843927fa92ee57f1e/paper-1.21.8-60.jar";
            case "1.21.7":
                return "https://fill-data.papermc.io/v1/objects/83838188699cb2837e55b890fb1a1d39ad0710285ed633fbf9fc14e9f47ce078/paper-1.21.7-32.jar";
            case "1.21.6":
                return "https://fill-data.papermc.io/v1/objects/35e2dfa66b3491b9d2f0bb033679fa5aca1e1fdf097e7a06a80ce8afeda5c214/paper-1.21.6-48.jar";
            case "1.21.5":
                return "https://fill-data.papermc.io/v1/objects/2ae6ae22adf417699746e0f89fc2ef6cb6ee050a5f6608cee58f0535d60b509e/paper-1.21.5-114.jar";
            case "1.21.4":
                return "https://fill-data.papermc.io/v1/objects/5ee4f542f628a14c644410b08c94ea42e772ef4d29fe92973636b6813d4eaffc/paper-1.21.4-232.jar";
            case "1.21.3":
                return "https://fill-data.papermc.io/v1/objects/87e973e1d338e869e7fdbc4b8fadc1579d7bb0246a0e0cf6e5700ace6c8bc17e/paper-1.21.3-83.jar";
            case "1.21.1":
                return "https://fill-data.papermc.io/v1/objects/39bd8c00b9e18de91dcabd3cc3dcfa5328685a53b7187a2f63280c22e2d287b9/paper-1.21.1-133.jar";
            case "1.21":
                return "https://fill-data.papermc.io/v1/objects/ab9bb1afc3cea6978a0c03ce8448aa654fe8a9c4dddf341e7cbda1b0edaa73f5/paper-1.21-130.jar";
            case "1.20.6":
                return "https://fill-data.papermc.io/v1/objects/4b011f5adb5f6c72007686a223174fce82f31aeb4b34faf4652abc840b47e640/paper-1.20.6-151.jar";
            case "1.20.5":
                return "https://fill-data.papermc.io/v1/objects/3cd7da2f8df92e082a501a39c674aab3c0343edd179b86f5baccaebfc9974132/paper-1.20.5-22.jar";
            case "1.20.4":
                return "https://fill-data.papermc.io/v1/objects/cabed3ae77cf55deba7c7d8722bc9cfd5e991201c211665f9265616d9fe5c77b/paper-1.20.4-499.jar";
            case "1.20.2":
                return "https://fill-data.papermc.io/v1/objects/ba340a835ac40b8563aa7eda1cd6479a11a7623409c89a2c35cd9d7490ed17a7/paper-1.20.2-318.jar";
            case "1.20.1":
                return "https://fill-data.papermc.io/v1/objects/234a9b32098100c6fc116664d64e36ccdb58b5b649af0f80bcccb08b0255eaea/paper-1.20.1-196.jar";
            case "1.20":
                return "https://fill-data.papermc.io/v1/objects/1e4ccfc0599f491ee6fee4455d3722332ac5d78584fccd55cbb3b51e11504505/paper-1.20-17.jar";
            case "1.19.4":
                return "https://fill-data.papermc.io/v1/objects/e587d78cba3e99ef8c4bc24cf20cc3bdbbe89e33b0b572070446af4eb6be5ccf/paper-1.19.4-550.jar";
            case "1.19.3":
                return "https://fill-data.papermc.io/v1/objects/3007f2c638d5f04ed32b6adaa33053fe3634ccfa74345c83d3ea4982d38db5dc/paper-1.19.3-448.jar";
            case "1.19.2":
                return "https://fill-data.papermc.io/v1/objects/2eb5c7459ec94bcdc597ed711d549a3ab4b0fda13e412a0792a1a069b5903864/paper-1.19.2-307.jar";
            case "1.19.1":
                return "https://fill-data.papermc.io/v1/objects/5afe23a1fade92c547124fa874bc7d908fa676f49f09879fa876224b62e9d51b/paper-1.19.1-111.jar";
            case "1.19":
                return "https://fill-data.papermc.io/v1/objects/0d39cacc51a77b2b071e1ce862fcbf0b4a4bd668cc7e8b313598d84fa09fabac/paper-1.19-81.jar";
            case "1.18.2":
                return "https://fill-data.papermc.io/v1/objects/0578f18f4d632b494b468ec56b3b414b5b56fea087ee7d39cf6dcdf4c9d01f05/paper-1.18.2-388.jar";
            case "1.18.1":
                return "https://fill-data.papermc.io/v1/objects/a94917a4472c2cbc9907a15c666bbb784f95ecd7b53c77bc08fe71103e5487f5/paper-1.18.1-216.jar";
            case "1.18":
                return "https://fill-data.papermc.io/v1/objects/3c995f20dae4e4e21d5554fac957a0a8a5c85bd5bf34915fac4b4f16e0ef101b/paper-1.18-66.jar";
            case "1.17.1":
                return "https://fill-data.papermc.io/v1/objects/6cc1ee2f94253ce10b5374ed85fffc735a97d8f1b64db293683dfa24dd3cc05f/paper-1.17.1-411.jar";
            case "1.17":
                return "https://fill-data.papermc.io/v1/objects/760a93b94a58d619bd647d71af84688617d0444d22b716500bc6b343858dc871/paper-1.17-79.jar";
            case "1.16.5":
                return "https://fill-data.papermc.io/v1/objects/e67da4851d08cde378ab2b89be58849238c303351ed2482181a99c2c2b489276/paper-1.16.5-794.jar";
            case "1.16.4":
                return "https://fill-data.papermc.io/v1/objects/963268ed564ac7d2ec076463e921ffa09570235f587bbd1a4d91a23ca4264b66/paper-1.16.4-416.jar";
            case "1.16.3":
                return "https://fill-data.papermc.io/v1/objects/940303ee5f5bcc08377e388ea1c1daa109c1ac8c4d189dc67de1106853f2fc23/paper-1.16.3-253.jar";
            case "1.16.2":
                return "https://fill-data.papermc.io/v1/objects/e5e10517daaa9bd6d54a8a0d22d866e31da7c1b47cb9e425ffaac236fde75ec9/paper-1.16.2-189.jar";
            case "1.16.1":
                return "https://fill-data.papermc.io/v1/objects/929559ba1dfc6de2904e17289fb3d1ac95f0ab48c7540cf5b8c2f055fea9d59c/paper-1.16.1-138.jar";
            case "1.15.2":
                return "https://fill-data.papermc.io/v1/objects/bd2dd6f2cc489cf9e2bb800cb4fb6d63e9d293945d3ac10b09dd9c6098fa9f34/paper-1.15.2-393.jar";
            case "1.15.1":
                return "https://fill-data.papermc.io/v1/objects/22a7a19f378db8edf92cdba57d91ceea7e4fa6470b677e6bbe57e8f7e1d9a4dd/paper-1.15.1-62.jar";
            case "1.15":
                return "https://fill-data.papermc.io/v1/objects/8b726c0deb6c3a265d679a3d3a2c0f8e5243fbc6ddcfcaf42e24209cb1f829b4/paper-1.15-21.jar";
            case "1.14.4":
                return "https://fill-data.papermc.io/v1/objects/bd8ec5cdb22370d37816a6de26798df3d2b0d6f9c7c96c88ca45a1303fea50e8/paper-1.14.4-245.jar";
            case "1.14.3":
                return "https://fill-data.papermc.io/v1/objects/b6d2d8ac67d685141697a8cecd99c47baf604900007eb0e270fd6ea86cbbc540/paper-1.14.3-134.jar";
            case "1.14.2":
                return "https://fill-data.papermc.io/v1/objects/12034e578e014eb369e2929f3725bd409858bf94128e46d1f286d5be36c3cb0e/paper-1.14.2-107.jar";
            case "1.14.1":
                return "https://fill-data.papermc.io/v1/objects/2bcf8017485cc41b3e72daa7285a46f26a85d055b9d638bc9a07f77632168ad7/paper-1.14.1-50.jar";
            case "1.14":
                return "https://fill-data.papermc.io/v1/objects/338be77f5239c44cff3f80f5c107b5e61ac48fb39348bce7249303209201072a/paper-1.14-17.jar";
            case "1.13.2":
                return "https://fill-data.papermc.io/v1/objects/11e828d0565ab76a0a0e180c056364a95de44958cfd6a6af3f9b1dc70b03e9cd/paper-1.13.2-657.jar";
            case "1.13.1":
                return "https://fill-data.papermc.io/v1/objects/6637401d87d0f5db5aaee90d7103f52c5e1baaf6b6d4643a5793e7b02b5775cb/paper-1.13.1-386.jar";
            case "1.13":
                return "https://fill-data.papermc.io/v1/objects/00db82d214242c9345266d44ff8d11a8e857a1a02edf7cb5fcc2d1d973283129/paper-1.13-173.jar";
            case "1.12.2":
                return "https://fill-data.papermc.io/v1/objects/3a2041807f492dcdc34ebb324a287414946e3e05ec3df6fd03f5b5f7d9afc210/paper-1.12.2-1620.jar";
            case "1.12.1":
                return "https://fill-data.papermc.io/v1/objects/dba2219d674ad85e4ef2c41931d34b6fa4be75a887973ecaaf286727a03812da/paper-1.12.1-1204.jar";
            case "1.12":
                return "https://fill-data.papermc.io/v1/objects/1e7e88a2ed6f2b70fa3f6ec6611373458c5d72b2a8707e60921df601c791e60e/paper-1.12-1169.jar";
            case "1.11.2":
                return "https://fill-data.papermc.io/v1/objects/3d0f40ec1f9630dfdbafa626cc20c266d7fb90fc22583dc1b995e7fbfb76830d/paper-1.11.2-1106.jar";
            case "1.10.2":
                return "https://fill-data.papermc.io/v1/objects/83354d24a22b6265e76c089b3d17a568abb446c0ccd12c2452f5e148412b16c2/paper-1.10.2-918.jar";
            case "1.9.4":
                return "https://fill-data.papermc.io/v1/objects/15a5821ddeacc596432c3fbf24262a2d264f556060ecd6f1838fb01ab5629a81/paper-1.9.4-775.jar";
            case "1.8.8":
                return "https://fill-data.papermc.io/v1/objects/7ff6d2cec671ef0d95b3723b5c92890118fb882d73b7f8fa0a2cd31d97c55f86/paper-1.8.8-445.jar";
            case "1.7.10":
                return "https://fill-data.papermc.io/v1/objects/33772078d92e9dbb027602da016524ef29af5b4c12eaddac1fe2465b01108185/paper-1.7.10-2025.jar";
            default:
                // Fallback: try api.papermc.io as last resort
                return "https://api.papermc.io/v2/projects/paper/versions/" + version + "/builds/latest/downloads/paper-" + version + ".jar";
        }
    }

    @PluginMethod
    public void start(PluginCall call) {
        if (isRunning) {
            JSObject res = new JSObject();
            res.put("success", true);
            res.put("message", "Server already running");
            call.resolve(res);
            return;
        }

        File sdir = getServerDir();
        ensureMetadata();

        File javaBin = getJavaBinary();
        if (!javaBin.exists()) {
            call.reject("Java runtime not found! Please run setup first.");
            return;
        }

        File paperJar = new File(sdir, "paper.jar");
        if (!paperJar.exists()) {
            call.reject("paper.jar not found in server directory: " + sdir.getAbsolutePath());
            return;
        }

        // Make sure EULA is accepted
        File eula = new File(sdir, "eula.txt");
        try (FileWriter fw = new FileWriter(eula)) {
            fw.write("eula=true\n");
        } catch (Exception ignored) {}

        // Read RAM from metadata if available
        int allocatedRam = 1024;
        File meta = new File(sdir, ".mcmeta.json");
        if (meta.exists()) {
            try (BufferedReader br = new BufferedReader(new FileReader(meta))) {
                StringBuilder sb = new StringBuilder();
                String l;
                while ((l = br.readLine()) != null) sb.append(l);
                org.json.JSONObject obj = new org.json.JSONObject(sb.toString());
                if (obj.has("ram")) allocatedRam = obj.getInt("ram");
            } catch (Exception ignored) {}
        }
        final int ram = Math.max(512, allocatedRam);

        new Thread(() -> {
            try {
                // Setup Java runtime environment paths for mobile ARM64
                File javaHome = javaBin.getParentFile();
                if (javaHome != null && "bin".equals(javaHome.getName())) {
                    javaHome = javaHome.getParentFile();
                }
                if (javaHome == null) javaHome = new File(getContext().getFilesDir(), "java");

                // Ensure all binaries and .so libraries are executable
                setExecutableRecursive(javaHome);
                javaBin.setExecutable(true, false);
                javaBin.setReadable(true, false);

                // Setup writable tmpdir with exec permissions for Netty native libraries
                File tmpDir = new File(getContext().getCacheDir(), "tmp");
                if (!tmpDir.exists()) tmpDir.mkdirs();

                ProcessBuilder pb = new ProcessBuilder(
                        javaBin.getAbsolutePath(),
                        "-Xms256M",
                        "-Xmx" + ram + "M",
                        "-Djava.home=" + javaHome.getAbsolutePath(),
                        "-Duser.home=" + sdir.getAbsolutePath(),
                        "-Djava.io.tmpdir=" + tmpDir.getAbsolutePath(),
                        "-Dpaper.disable-watchdog=true",
                        "-DPaper.IgnoreJavaVersion=true",
                        "-Dpaper.ignoreJavaVersion=true",
                        "-Dio.netty.transport.noNative=true",
                        "-Dlog4j2.formatMsgNoLookups=true",
                        "-Dfile.encoding=UTF-8",
                        "-Dterminal.jline=false",
                        "-Dterminal.ansi=false",
                        "-jar",
                        paperJar.getAbsolutePath(),
                        "--nogui"
                );
                pb.directory(sdir);
                pb.redirectErrorStream(true);

                File jreLib = new File(javaHome, "lib");
                File jreServer = new File(jreLib, "server");
                File jreJli = new File(jreLib, "jli");

                java.util.Map<String, String> env = pb.environment();
                env.put("JAVA_HOME", javaHome.getAbsolutePath());
                String ldPath = jreLib.getAbsolutePath() + ":" + jreServer.getAbsolutePath() + ":" + jreJli.getAbsolutePath() + ":/system/lib64:/vendor/lib64";
                env.put("LD_LIBRARY_PATH", ldPath);
                env.put("PATH", javaBin.getParent() + ":/system/bin:/system/xbin");

                JSObject launchMsg = new JSObject();
                launchMsg.put("text", "[STARTING SERVER] Launching Paper with Java 17 (" + ram + "MB RAM)...\n");
                notifyListeners("console-data", launchMsg);

                serverProcess = pb.start();
                processInput = new BufferedWriter(new OutputStreamWriter(serverProcess.getOutputStream()));
                isRunning = true;
                startTime = System.currentTimeMillis();

                // Start Foreground Service to prevent Android from killing process
                Context ctx = getContext();
                Intent serviceIntent = new Intent(ctx, ServerForegroundService.class);
                if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                    ctx.startForegroundService(serviceIntent);
                } else {
                    ctx.startService(serviceIntent);
                }

                JSObject stateObj = new JSObject();
                stateObj.put("running", true);
                notifyListeners("server-state", stateObj);

                // Stream stdout/stderr line by line to UI
                BufferedReader reader = new BufferedReader(new InputStreamReader(serverProcess.getInputStream()));
                String line;
                while ((line = reader.readLine()) != null) {
                    JSObject consoleData = new JSObject();
                    consoleData.put("text", line + "\n");
                    notifyListeners("console-data", consoleData);
                }

                int exitCode = serverProcess.waitFor();
                JSObject exitMsg = new JSObject();
                exitMsg.put("text", "[SERVER STOPPED] Process finished with exit code " + exitCode + "\n");
                notifyListeners("console-data", exitMsg);
            } catch (Exception e) {
                JSObject consoleData = new JSObject();
                consoleData.put("text", "[ERROR] " + e.getMessage() + "\n");
                notifyListeners("console-data", consoleData);
            } finally {
                isRunning = false;
                serverProcess = null;
                processInput = null;

                // Stop foreground service
                try {
                    Intent serviceIntent = new Intent(getContext(), ServerForegroundService.class);
                    getContext().stopService(serviceIntent);
                } catch (Exception ignored) {}

                JSObject stateObj = new JSObject();
                stateObj.put("running", false);
                notifyListeners("server-state", stateObj);
            }
        }).start();

        JSObject res = new JSObject();
        res.put("success", true);
        call.resolve(res);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        if (!isRunning || processInput == null) {
            JSObject res = new JSObject();
            res.put("success", true);
            call.resolve(res);
            return;
        }
        try {
            processInput.write("stop\n");
            processInput.flush();
            JSObject res = new JSObject();
            res.put("success", true);
            call.resolve(res);
        } catch (Exception e) {
            call.reject("Failed to stop server: " + e.getMessage());
        }
    }

    public static void stopServerSafely() {
        if (isRunning && processInput != null) {
            try {
                processInput.write("stop\n");
                processInput.flush();
                if (serverProcess != null) {
                    new Thread(() -> {
                        try {
                            serverProcess.waitFor(5, java.util.concurrent.TimeUnit.SECONDS);
                        } catch (Exception ignored) {}
                    }).start();
                }
            } catch (Exception ignored) {}
        }
    }

    @PluginMethod
    public void kill(PluginCall call) {
        if (serverProcess != null) {
            try {
                serverProcess.destroy();
                isRunning = false;
            } catch (Exception ignored) {}
        }
        JSObject res = new JSObject();
        res.put("success", true);
        call.resolve(res);
    }

    @PluginMethod
    public void sendCommand(PluginCall call) {
        String cmd = call.getString("command", "");
        if (!isRunning || processInput == null) {
            call.reject("Server is not running");
            return;
        }
        try {
            processInput.write(cmd + "\n");
            processInput.flush();
            JSObject res = new JSObject();
            res.put("success", true);
            call.resolve(res);
        } catch (Exception e) {
            call.reject("Failed to send command: " + e.getMessage());
        }
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        JSObject res = new JSObject();
        res.put("running", isRunning);
        res.put("uptime", isRunning ? (System.currentTimeMillis() - startTime) / 1000 : 0);
        res.put("serverDir", getServerDir().getAbsolutePath());
        call.resolve(res);
    }

    // Properties
    @PluginMethod
    public void propsGet(PluginCall call) {
        File pf = new File(getServerDir(), "server.properties");
        JSObject ret = new JSObject();
        Properties p = new Properties();
        // Baseline defaults for mobile server
        p.setProperty("motd", "A Jtg-Craft Minecraft Server");
        p.setProperty("server-port", "25565");
        p.setProperty("gamemode", "survival");
        p.setProperty("difficulty", "easy");
        p.setProperty("max-players", "20");
        p.setProperty("online-mode", "false");
        p.setProperty("pvp", "true");
        p.setProperty("view-distance", "8");
        p.setProperty("simulation-distance", "6");
        p.setProperty("level-name", "world");
        p.setProperty("allow-flight", "false");
        p.setProperty("white-list", "false");
        p.setProperty("spawn-monsters", "true");
        p.setProperty("spawn-animals", "true");
        p.setProperty("spawn-npcs", "true");
        p.setProperty("hardcore", "false");
        p.setProperty("enable-command-block", "false");

        if (pf.exists()) {
            try (FileInputStream in = new FileInputStream(pf)) {
                p.load(in);
            } catch (Exception ignored) {}
        }
        for (String key : p.stringPropertyNames()) {
            ret.put(key, p.getProperty(key));
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void propsSave(PluginCall call) {
        JSObject propsObj = call.getObject("props");
        File pf = new File(getServerDir(), "server.properties");
        try {
            Properties p = new Properties();
            if (pf.exists()) {
                try (FileInputStream in = new FileInputStream(pf)) { p.load(in); }
            }
            if (propsObj != null) {
                java.util.Iterator<String> keys = propsObj.keys();
                while (keys.hasNext()) {
                    String k = keys.next();
                    p.setProperty(k, propsObj.getString(k));
                }
            }
            try (FileOutputStream out = new FileOutputStream(pf)) {
                p.store(out, "Jtg-craft Mobile Configuration");
            }
            JSObject res = new JSObject();
            res.put("success", true);
            call.resolve(res);
        } catch (Exception e) {
            call.reject("Failed to save properties: " + e.getMessage());
        }
    }

    // Players list
    @PluginMethod
    public void playersGet(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("ops", readJsonArrayFile(new File(getServerDir(), "ops.json")));
        ret.put("whitelist", readJsonArrayFile(new File(getServerDir(), "whitelist.json")));
        ret.put("bannedPlayers", readJsonArrayFile(new File(getServerDir(), "banned-players.json")));
        call.resolve(ret);
    }

    @PluginMethod
    public void playersGetCache(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("players", readJsonArrayFile(new File(getServerDir(), "usercache.json")));
        call.resolve(ret);
    }

    private JSArray readJsonArrayFile(File f) {
        JSArray arr = new JSArray();
        if (!f.exists()) return arr;
        try (BufferedReader br = new BufferedReader(new FileReader(f))) {
            StringBuilder sb = new StringBuilder();
            String l;
            while ((l = br.readLine()) != null) sb.append(l);
            org.json.JSONArray jarr = new org.json.JSONArray(sb.toString());
            for (int i = 0; i < jarr.length(); i++) {
                arr.put(jarr.get(i));
            }
        } catch (Exception ignored) {}
        return arr;
    }

    @PluginMethod
    public void changeVersion(PluginCall call) {
        String newVer = call.getString("version", "1.20.4");
        new Thread(() -> {
            try {
                if (isRunning && processInput != null) {
                    try {
                        processInput.write("stop\n");
                        processInput.flush();
                        if (serverProcess != null) serverProcess.waitFor(5, java.util.concurrent.TimeUnit.SECONDS);
                    } catch (Exception ignored) {}
                    isRunning = false;
                }
                File sdir = getServerDir();
                File jar = new File(sdir, "paper.jar");
                if (jar.exists()) jar.delete();

                JSObject notify = new JSObject();
                notify.put("step", "version");
                notify.put("status", "Downloading Paper " + newVer + "...");
                notify.put("percent", 20);
                notifyListeners("setup-progress", notify);

                String downloadJarUrl = getPaperDirectUrl(newVer);
                URL u = new URL(downloadJarUrl);
                HttpURLConnection conn = (HttpURLConnection) u.openConnection();
                conn.setRequestProperty("User-Agent", "Mozilla/5.0 JtgCraft/1.0 (Android)");
                conn.setInstanceFollowRedirects(true);
                conn.connect();

                long total = conn.getContentLengthLong();
                try (InputStream in = conn.getInputStream(); FileOutputStream out = new FileOutputStream(jar)) {
                    byte[] buf = new byte[32768];
                    int n;
                    long downloaded = 0;
                    long lastNotify = 0;
                    while ((n = in.read(buf)) != -1) {
                        out.write(buf, 0, n);
                        downloaded += n;
                        long now = System.currentTimeMillis();
                        if (now - lastNotify > 300) {
                            lastNotify = now;
                            int pct = total > 0 ? (int) ((downloaded * 100) / total) : 50;
                            JSObject prog = new JSObject();
                            prog.put("percent", pct);
                            prog.put("status", "Downloading Paper " + newVer + " (" + pct + "%)...");
                            notifyListeners("setup-progress", prog);
                        }
                    }
                }
                conn.disconnect();

                File meta = new File(sdir, ".mcmeta.json");
                org.json.JSONObject obj = new org.json.JSONObject();
                if (meta.exists()) {
                    try (BufferedReader br = new BufferedReader(new FileReader(meta))) {
                        StringBuilder sb = new StringBuilder();
                        String l;
                        while ((l = br.readLine()) != null) sb.append(l);
                        obj = new org.json.JSONObject(sb.toString());
                    } catch (Exception ignored) {}
                }
                obj.put("version", newVer);
                try (FileWriter fw = new FileWriter(meta)) {
                    fw.write(obj.toString());
                }

                JSObject res = new JSObject();
                res.put("success", true);
                res.put("version", newVer);
                call.resolve(res);
            } catch (Exception e) {
                call.reject("Failed to change version: " + e.getMessage());
            }
        }).start();
    }

    @PluginMethod
    public void reinstall(PluginCall call) {
        new Thread(() -> {
            try {
                if (isRunning && processInput != null) {
                    try {
                        processInput.write("stop\n");
                        processInput.flush();
                        if (serverProcess != null) serverProcess.waitFor(5, java.util.concurrent.TimeUnit.SECONDS);
                    } catch (Exception ignored) {}
                    isRunning = false;
                }
                File sdir = getServerDir();
                String ver = "1.20.4";
                File meta = new File(sdir, ".mcmeta.json");
                if (meta.exists()) {
                    try (BufferedReader br = new BufferedReader(new FileReader(meta))) {
                        StringBuilder sb = new StringBuilder();
                        String l;
                        while ((l = br.readLine()) != null) sb.append(l);
                        org.json.JSONObject obj = new org.json.JSONObject(sb.toString());
                        if (obj.has("version")) ver = obj.getString("version");
                    } catch (Exception ignored) {}
                }

                File jar = new File(sdir, "paper.jar");
                if (jar.exists()) jar.delete();

                String downloadJarUrl = getPaperDirectUrl(ver);
                URL u = new URL(downloadJarUrl);
                HttpURLConnection conn = (HttpURLConnection) u.openConnection();
                conn.setRequestProperty("User-Agent", "Mozilla/5.0 JtgCraft/1.0 (Android)");
                conn.setInstanceFollowRedirects(true);
                conn.connect();

                try (InputStream in = conn.getInputStream(); FileOutputStream out = new FileOutputStream(jar)) {
                    byte[] buf = new byte[32768];
                    int n;
                    while ((n = in.read(buf)) != -1) {
                        out.write(buf, 0, n);
                    }
                }
                conn.disconnect();

                JSObject res = new JSObject();
                res.put("success", true);
                call.resolve(res);
            } catch (Exception e) {
                call.reject("Reinstall failed: " + e.getMessage());
            }
        }).start();
    }

    @PluginMethod
    public void deleteServer(PluginCall call) {
        new Thread(() -> {
            try {
                if (isRunning && processInput != null) {
                    try {
                        processInput.write("stop\n");
                        processInput.flush();
                        if (serverProcess != null) serverProcess.waitFor(5, java.util.concurrent.TimeUnit.SECONDS);
                    } catch (Exception ignored) {}
                    isRunning = false;
                }
                File sdir = getServerDir();
                deleteRecursive(sdir);
                sdir.mkdirs();

                JSObject res = new JSObject();
                res.put("success", true);
                call.resolve(res);
            } catch (Exception e) {
                call.reject("Delete server failed: " + e.getMessage());
            }
        }).start();
    }

    private void deleteRecursive(File f) {
        if (f == null || !f.exists()) return;
        if (f.isDirectory()) {
            File[] children = f.listFiles();
            if (children != null) {
                for (File c : children) deleteRecursive(c);
            }
        }
        f.delete();
    }

    private void setExecutableRecursive(File file) {
        if (file == null || !file.exists()) return;
        if (file.isDirectory()) {
            file.setExecutable(true, false);
            file.setReadable(true, false);
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
                    android.system.Os.chmod(p, 0755);
                } catch (Throwable ignored) {}
            }
        }
    }
}
