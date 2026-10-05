package com.jtgcraft.mobile;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.*;
import java.io.*;
import java.net.*;
import java.security.MessageDigest;
import java.util.*;

/** Web updates and APK updates are separate: an OTA web bundle cannot replace Java plugins. */
@CapacitorPlugin(name = "AppUpdater")
public class AppUpdaterPlugin extends Plugin {
    static final int BUNDLED_WEB_CODE = 1009;
    private static final String MANIFEST = "https://raw.githubusercontent.com/JishnuTheGamer/jtg-craft/main/mobile/mobile-update-check.json";
    private static final Set<String> WEB_FILES = new HashSet<>(Arrays.asList("index.html", "style.css", "mobile-patches.css", "mobile-bridge.js", "renderer.js"));
    private SharedPreferences prefs() { return getContext().getSharedPreferences("jtg_updates", Context.MODE_PRIVATE); }
    private static SharedPreferences prefs(Context context) { return context.getSharedPreferences("jtg_updates", Context.MODE_PRIVATE); }
    private static File root(Context context) { return new File(context.getFilesDir(), "web-updates"); }

    static File activeBundle(Context context) {
        String name = prefs(context).getString("active", "");
        if (!name.matches("web-[0-9]+-[0-9]+")) return null;
        File bundle = new File(root(context), name);
        try {
            JSONObject marker = new JSONObject(read(new File(bundle, "bundle.json")));
            if (marker.getInt("versionCode") <= BUNDLED_WEB_CODE) return null;
            int nativeCode = context.getPackageManager().getPackageInfo(context.getPackageName(), 0).versionCode;
            if (marker.optInt("requiredNativeCode", nativeCode) > nativeCode) return null;
            JSONObject hashes = marker.getJSONObject("sha256");
            for (String file : WEB_FILES) {
                if (!hash(new File(bundle, file)).equals(hashes.getString("mobile/www/" + file))) return null;
            }
            return bundle;
        } catch (Exception e) { return null; }
    }

    @PluginMethod public void getInstalledVersions(PluginCall call) {
        try {
            PackageInfo info = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            File active = activeBundle(getContext());
            JSONObject marker = active == null ? null : new JSONObject(read(new File(active, "bundle.json")));
            JSObject result = new JSObject();
            result.put("nativeCode", info.versionCode);
            result.put("nativeVersion", info.versionName);
            result.put("versionCode", marker == null ? BUNDLED_WEB_CODE : marker.getInt("versionCode"));
            result.put("version", marker == null ? info.versionName : marker.getString("version"));
            call.resolve(result);
        } catch (Exception e) { call.reject(e.getMessage()); }
    }

    @PluginMethod public void prepareWebUpdate(PluginCall call) {
        new Thread(() -> { synchronized (AppUpdaterPlugin.class) {
            File stage = null;
            try {
                JSONObject manifest = remoteManifest();
                int installed = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0).versionCode;
                if (manifest.optInt("requiredNativeCode", installed) > installed) throw new IOException("A full app upgrade is required for this update.");
                int code = manifest.getInt("versionCode");
                File active = activeBundle(getContext());
                int currentCode = active == null ? BUNDLED_WEB_CODE : new JSONObject(read(new File(active, "bundle.json"))).getInt("versionCode");
                if (code <= currentCode) throw new IOException("This app is already up to date.");
                String ref = manifest.getString("sourceRef");
                if (!ref.matches("[A-Za-z0-9._-]+")) throw new IOException("Invalid update source.");
                JSONArray files = manifest.getJSONArray("files");
                JSONObject hashes = manifest.getJSONObject("sha256");
                if (files.length() != WEB_FILES.size()) throw new IOException("Incomplete web update.");
                String pending = prefs().getString("pending", "");
                if (pending.matches("web-[0-9]+-[0-9]+")) {
                    File ready = new File(root(getContext()), pending);
                    boolean valid = true;
                    try {
                        JSONObject marker = new JSONObject(read(new File(ready, "bundle.json")));
                        valid = marker.getInt("versionCode") == code;
                        for (String file : WEB_FILES) valid &= hash(new File(ready, file)).equals(hashes.getString("mobile/www/" + file));
                    } catch (Exception ignored) { valid = false; }
                    if (valid) {
                        JSObject result = new JSObject(); result.put("success", true); result.put("version", manifest.getString("version")); result.put("versionCode", code); call.resolve(result); return;
                    }
                    JavaManagerPlugin.deleteRecursive(ready);
                    prefs().edit().remove("pending").commit();
                }
                stage = new File(root(getContext()), "web-" + code + "-" + System.currentTimeMillis());
                if (!stage.mkdirs()) throw new IOException("Cannot create update staging directory.");
                copyAssets("public", stage);
                Set<String> downloaded = new HashSet<>();
                for (int i = 0; i < files.length(); i++) {
                    String file = files.getString(i);
                    String name = file.startsWith("mobile/www/") ? file.substring(11) : "";
                    if (!WEB_FILES.contains(name) || !downloaded.add(name)) throw new IOException("Unsupported update file: " + file);
                    download("https://raw.githubusercontent.com/JishnuTheGamer/jtg-craft/" + ref + "/" + file, new File(stage, name), hashes.getString(file), 12 * 1024 * 1024);
                    progress(i + 1, files.length(), name);
                }
                write(new File(stage, "bundle.json"), manifest.toString());
                if (!prefs().edit().putString("pending", stage.getName()).commit()) throw new IOException("Could not save update state.");
                JSObject result = new JSObject();
                result.put("success", true); result.put("version", manifest.getString("version")); result.put("versionCode", code);
                call.resolve(result);
            } catch (Exception e) {
                if (stage != null) JavaManagerPlugin.deleteRecursive(stage);
                call.reject("Web update failed; current app was kept: " + e.getMessage());
            }
        }}).start();
    }

    @PluginMethod public void activateWebUpdate(PluginCall call) {
        String pending = prefs().getString("pending", "");
        if (!pending.matches("web-[0-9]+-[0-9]+")) { call.resolve(); getBridge().reload(); return; }
        File stage = new File(root(getContext()), pending);
        try {
            JSONObject marker = new JSONObject(read(new File(stage, "bundle.json")));
            for (String file : WEB_FILES) if (!hash(new File(stage, file)).equals(marker.getJSONObject("sha256").getString("mobile/www/" + file))) throw new IOException("Staged update is damaged.");
            String previous = prefs().getString("active", "");
            if (!prefs().edit().putString("previous", previous).putString("active", pending).remove("pending").commit()) throw new IOException("Cannot activate update.");
            File[] bundles = root(getContext()).listFiles();
            if (bundles != null) for (File old : bundles) {
                if (!old.getName().equals(pending) && !old.getName().equals(previous)) JavaManagerPlugin.deleteRecursive(old);
            }
            call.resolve();
            getActivity().runOnUiThread(() -> getBridge().setServerBasePath(stage.getAbsolutePath()));
        } catch (Exception e) { call.reject(e.getMessage()); }
    }

    @PluginMethod public void prepareNativeUpdate(PluginCall call) {
        new Thread(() -> { synchronized (AppUpdaterPlugin.class) {
            File target = new File(getContext().getCacheDir(), "jtg-app-update.apk");
            try {
                JSONObject update = remoteManifest().getJSONObject("nativeUpdate");
                int installed = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0).versionCode;
                if (update.getInt("versionCode") <= installed) throw new IOException("Native app is already up to date.");
                String url = update.getString("url");
                if (!url.startsWith("https://github.com/JishnuTheGamer/jtg-craft/releases/download/")) throw new IOException("Unsupported APK source.");
                if (!target.isFile() || !hash(target).equals(update.getString("sha256"))) download(url, target, update.getString("sha256"), 100 * 1024 * 1024);
                verifyApk(target, update.getInt("versionCode"));
                JSObject result = new JSObject(); result.put("success", true); result.put("nativeUpdate", true); result.put("version", update.getString("version")); result.put("versionCode", update.getInt("versionCode"));
                call.resolve(result);
            } catch (Exception e) { target.delete(); call.reject("App download failed: " + e.getMessage()); }
        }}).start();
    }

    private void verifyApk(File file, int expected) throws Exception {
        PackageManager manager = getContext().getPackageManager();
        int flags = Build.VERSION.SDK_INT >= 28 ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
        PackageInfo candidate = manager.getPackageArchiveInfo(file.getAbsolutePath(), flags);
        PackageInfo installed = manager.getPackageInfo(getContext().getPackageName(), flags);
        if (candidate == null || !installed.packageName.equals(candidate.packageName) || candidate.versionCode != expected || candidate.versionCode <= installed.versionCode) throw new IOException("APK package/version does not match this app.");
        Signature[] a = Build.VERSION.SDK_INT >= 28 ? installed.signingInfo.getApkContentsSigners() : installed.signatures;
        Signature[] b = Build.VERSION.SDK_INT >= 28 ? candidate.signingInfo.getApkContentsSigners() : candidate.signatures;
        if (a.length != b.length || a.length == 0) throw new IOException("APK signing certificate changed.");
        for (Signature signature : a) if (!Arrays.asList(b).contains(signature)) throw new IOException("APK signing certificate changed.");
    }

    @PluginMethod public void installNativeUpdate(PluginCall call) {
        new Thread(() -> { synchronized (AppUpdaterPlugin.class) {
        try {
            File apk = new File(getContext().getCacheDir(), "jtg-app-update.apk");
            JSONObject update = remoteManifest().getJSONObject("nativeUpdate");
            if (!hash(apk).equals(update.getString("sha256"))) throw new IOException("Downloaded APK is missing or damaged. Download again.");
            verifyApk(apk, update.getInt("versionCode"));
            if (Build.VERSION.SDK_INT >= 26 && !getContext().getPackageManager().canRequestPackageInstalls()) {
                getActivity().runOnUiThread(() -> getActivity().startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()))));
                JSObject result = new JSObject(); result.put("permissionRequired", true); call.resolve(result); return;
            }
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
            Intent intent = new Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().runOnUiThread(() -> getActivity().startActivity(intent));
            JSObject result = new JSObject(); result.put("installerOpened", true); call.resolve(result);
        } catch (Exception e) { call.reject(e.getMessage()); }
        }}).start();
    }

    private JSONObject remoteManifest() throws Exception {
        File temporary = File.createTempFile("manifest-", ".json", getContext().getCacheDir());
        try { download(MANIFEST + "?t=" + System.currentTimeMillis(), temporary, null, 512 * 1024); return new JSONObject(read(temporary)); }
        finally { temporary.delete(); }
    }
    private void progress(int current, int total, String file) {
        JSObject event = new JSObject(); event.put("current", current); event.put("total", total); event.put("file", file); event.put("pct", current * 100 / total);
        notifyListeners("update-progress", event);
    }
    private void download(String url, File target, String expected, long maximum) throws Exception {
        if (expected != null && !expected.matches("[a-f0-9]{64}")) throw new IOException("Missing update checksum.");
        HttpURLConnection connection = (HttpURLConnection)new URL(url).openConnection();
        connection.setConnectTimeout(25000); connection.setReadTimeout(90000); connection.setRequestProperty("User-Agent", "JtgCraft/1.0.9");
        try {
            if (connection.getResponseCode() != 200) throw new IOException("HTTP " + connection.getResponseCode());
            try (InputStream in = connection.getInputStream(); OutputStream out = new FileOutputStream(target)) {
                byte[] buffer = new byte[32768]; long size = 0; int count; int lastPercent = -1;
                long total = connection.getContentLengthLong();
                while ((count = in.read(buffer)) != -1) {
                    size += count; if (size > maximum) throw new IOException("Update exceeds size limit."); out.write(buffer, 0, count);
                    if (target.getName().endsWith(".apk") && total > 0) {
                        int percent = (int)(size * 100 / total);
                        if (percent != lastPercent) { progress(percent, 100, "App upgrade"); lastPercent = percent; }
                    }
                }
            }
            if (expected != null && !hash(target).equals(expected)) throw new IOException("Update checksum mismatch.");
        } finally { connection.disconnect(); }
    }
    private void copyAssets(String asset, File destination) throws IOException {
        String[] entries = getContext().getAssets().list(asset);
        if (entries != null && entries.length > 0) {
            destination.mkdirs(); for (String entry : entries) copyAssets(asset + "/" + entry, new File(destination, entry));
        } else {
            try (InputStream in = getContext().getAssets().open(asset); OutputStream out = new FileOutputStream(destination)) { byte[] b = new byte[32768]; int n; while ((n = in.read(b)) != -1) out.write(b, 0, n); }
        }
    }
    private static String read(File file) throws IOException {
        try (InputStream in = new FileInputStream(file); ByteArrayOutputStream out = new ByteArrayOutputStream()) { byte[] b = new byte[8192]; int n; while ((n = in.read(b)) != -1) out.write(b, 0, n); return out.toString("UTF-8"); }
    }
    private static void write(File file, String value) throws IOException { try (Writer out = new OutputStreamWriter(new FileOutputStream(file), "UTF-8")) { out.write(value); } }
    static String hash(File file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (InputStream in = new FileInputStream(file)) { byte[] b = new byte[32768]; int n; while ((n = in.read(b)) != -1) digest.update(b, 0, n); }
        StringBuilder result = new StringBuilder(); for (byte b : digest.digest()) result.append(String.format("%02x", b & 255)); return result.toString();
    }
}
