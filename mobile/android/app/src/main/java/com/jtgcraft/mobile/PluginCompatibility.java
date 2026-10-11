package com.jtgcraft.mobile;

import java.io.*;
import java.net.*;
import java.util.*;
import org.json.*;

/** Revalidates catalog installs in the native downloader, independently of the WebView. */
final class PluginCompatibility {
    final File server;
    final String serverVersion, url, fileName, sha512;
    final long size;
    private PluginCompatibility(File server, String version, JSONObject file) throws Exception {
        this.server = server; this.serverVersion = version;
        url = file.getString("url"); fileName = file.getString("filename");
        sha512 = file.getJSONObject("hashes").getString("sha512"); size = file.optLong("size", 0);
        if (!url.startsWith("https://") || !fileName.matches("(?i)[^/\\\\]+\\.jar") || !sha512.matches("[a-fA-F0-9]{128}")
            || java.util.regex.Pattern.compile("[-_.](?:sources|dev|javadoc|fabric|forge|neoforge|quilt)(?:[-_.]|$)", java.util.regex.Pattern.CASE_INSENSITIVE).matcher(fileName).find()) throw new IOException("Invalid Paper plugin file.");
    }
    private static String version(File server) throws Exception {
        File meta = new File(server, ".mcmeta.json");
        String text;
        try (InputStream input = new FileInputStream(meta); ByteArrayOutputStream bytes = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[4096]; int count;
            while ((count = input.read(buffer)) != -1) bytes.write(buffer, 0, count);
            text = bytes.toString("UTF-8");
        }
        java.util.regex.Matcher match = java.util.regex.Pattern.compile("(?:^|[^\\d])(\\d+(?:\\.\\d+){0,2}(?:-(?:pre|rc)\\d+)?)(?=$|[^\\d.])").matcher(new JSONObject(text).optString("version", ""));
        if (!match.find()) throw new IOException("Cannot determine the Minecraft server version.");
        return match.group(1);
    }
    void assertServer(File selected) throws Exception {
        if (!server.getCanonicalPath().equals(selected.getCanonicalPath()) || !serverVersion.equals(version(selected))) throw new IOException("Server or Minecraft version changed. Search again before installing.");
    }
    private static boolean includes(JSONArray values, String value) {
        if (values == null) return false;
        for (int i = 0; i < values.length(); i++) if (value.equals(values.optString(i))) return true;
        return false;
    }
    static PluginCompatibility verify(File server, String project, String expectedVersion, String buildId, String fileName) throws Exception {
        if (project == null || !project.matches("[a-zA-Z0-9_-]+") || buildId == null || fileName == null) throw new IOException("Choose a verified plugin from the catalog.");
        String mcVersion = version(server);
        if (!mcVersion.equals(expectedVersion)) throw new IOException("Minecraft version changed. Search again.");
        String query = "?loaders=" + URLEncoder.encode("[\"paper\",\"spigot\",\"bukkit\"]", "UTF-8")
            + "&game_versions=" + URLEncoder.encode(new JSONArray().put(mcVersion).toString(), "UTF-8");
        HttpURLConnection connection = (HttpURLConnection)new URL("https://api.modrinth.com/v2/project/" + project + "/version" + query).openConnection();
        connection.setConnectTimeout(12000); connection.setReadTimeout(12000);
        connection.setRequestProperty("User-Agent", "JtgCraft (https://github.com/JishnuTheGamer/jtg-craft)");
        JSONArray builds;
        try {
            if (connection.getResponseCode() != 200) throw new IOException("Cannot verify plugin compatibility (HTTP " + connection.getResponseCode() + ").");
            try (InputStream input = connection.getInputStream(); ByteArrayOutputStream bytes = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[8192]; int count;
                while ((count = input.read(buffer)) != -1) {
                    if (bytes.size() + count > 8 * 1024 * 1024) throw new IOException("Plugin metadata is too large.");
                    bytes.write(buffer, 0, count);
                }
                builds = new JSONArray(bytes.toString("UTF-8"));
            }
        } finally { connection.disconnect(); }
        for (int i = 0; i < builds.length(); i++) {
            JSONObject build = builds.getJSONObject(i); JSONArray loaders = build.optJSONArray("loaders");
            if (!buildId.equals(build.optString("id")) || !includes(build.optJSONArray("game_versions"), mcVersion)
                || !(includes(loaders, "paper") || includes(loaders, "spigot") || includes(loaders, "bukkit"))) continue;
            JSONArray files = build.optJSONArray("files"); if (files == null) continue;
            for (int j = 0; j < files.length(); j++) {
                JSONObject file = files.getJSONObject(j);
                if (fileName.equals(file.optString("filename"))) return new PluginCompatibility(server, mcVersion, file);
            }
        }
        throw new IOException("No compatible Paper plugin build is listed for Minecraft " + mcVersion + ".");
    }
}
