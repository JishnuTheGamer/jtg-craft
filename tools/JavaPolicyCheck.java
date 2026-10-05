package com.jtgcraft.mobile;
public class JavaPolicyCheck {
    public static void main(String[] arguments) {
        String[] versions = {"1.17.1", "1.20.4", "1.20.5", "1.21", "1.21.11", "26.1 (Tiny Takeover)", "paper-26.2-121.jar"};
        int[] expected = {17, 17, 21, 21, 21, 25, 25};
        for (int i = 0; i < versions.length; i++) if (JavaVersionPolicy.required(versions[i]) != expected[i]) throw new AssertionError(versions[i]);
        if (JavaVersionPolicy.required("26") != 25 || JavaVersionPolicy.target(21,"26.2") != 21) throw new AssertionError("Manual/Auto policy");
        for (int total : new int[]{2048,3072,4096,8192}) { ResourceLimits limits=new ResourceLimits(total,8); if (limits.maxRamMB >= total || limits.cpu(99)!=8 || limits.ram(99999)!=limits.maxRamMB) throw new AssertionError("Hardware limits"); }
        System.out.println("Android Auto Java, manual choices and hardware resource limits passed.");
    }
}
