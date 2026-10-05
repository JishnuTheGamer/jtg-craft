package com.jtgcraft.mobile;
final class ResourceLimits {
    final int maxRamMB, maxCpuCores, reservedRamMB;
    ResourceLimits(long totalRamMB, int cores) {
        long total = Math.max(512, totalRamMB);
        reservedRamMB = (int)Math.min(2048, Math.max(512, total / 4));
        maxRamMB = (int)Math.max(512, ((total - reservedRamMB) / 256) * 256);
        maxCpuCores = Math.max(1, cores);
    }
    int ram(int value) { return Math.max(512, Math.min(maxRamMB, value)); }
    int cpu(int value) { return Math.max(1, Math.min(maxCpuCores, value)); }
}
