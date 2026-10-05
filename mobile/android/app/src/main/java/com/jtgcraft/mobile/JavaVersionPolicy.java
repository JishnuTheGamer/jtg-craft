package com.jtgcraft.mobile;
import java.util.regex.*;
final class JavaVersionPolicy {
    static int required(String minecraft) {
        Matcher match = Pattern.compile("(?:^|[^0-9])([0-9]+)\\.([0-9]+)(?:\\.([0-9]+))?").matcher(minecraft == null ? "" : minecraft);
        if (!match.find()) return 21;
        int major = Integer.parseInt(match.group(1)), minor = Integer.parseInt(match.group(2));
        int patch = match.group(3) == null ? 0 : Integer.parseInt(match.group(3));
        if (major >= 26) return 25;
        if (major == 1 && (minor >= 21 || (minor == 20 && patch >= 5))) return 21;
        return 17;
    }
    static int target(int selected, String minecraft) {
        int required = required(minecraft);
        if (selected != 17 && selected != 21 && selected != 25) throw new IllegalArgumentException("Select Auto, Java 17, 21 or 25.");
        if (selected < required) throw new IllegalArgumentException("Minecraft " + minecraft + " needs Java " + required + " or newer. Select Auto.");
        return selected;
    }
}
