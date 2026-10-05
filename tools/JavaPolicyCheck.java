package com.jtgcraft.mobile;
public class JavaPolicyCheck {
    public static void main(String[] arguments) {
        String[] versions = {"1.17.1", "1.20.4", "1.20.5", "1.21", "1.21.11", "26.1 (Tiny Takeover)", "paper-26.2-121.jar"};
        int[] expected = {17, 17, 21, 21, 21, 25, 25};
        for (int i = 0; i < versions.length; i++) if (JavaVersionPolicy.required(versions[i]) != expected[i]) throw new AssertionError(versions[i]);
        for (String version : new String[]{"1.21", "26.2"}) {
            try { JavaVersionPolicy.target(17, version); throw new AssertionError("Incompatible Java accepted"); }
            catch (IllegalArgumentException expectedFailure) {}
        }
        System.out.println("Android native Java policy boundaries and incompatible runtime rejection passed.");
    }
}
