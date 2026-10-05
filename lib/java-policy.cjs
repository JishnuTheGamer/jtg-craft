function requiredJava(version) {
    const match = String(version || '').match(/(?:^|[^\d])(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
    if (!match) return 21;
    const [, major, minor, patch = '0'] = match.map(String);
    if (+major >= 26) return 25;
    if (+major === 1 && (+minor >= 21 || (+minor === 20 && +patch >= 5))) return 21;
    return 17;
}
function targetJava(setting, version) {
    const minimum = requiredJava(version);
    const target = !setting || setting === 'auto' ? minimum : Number(setting);
    if (![17, 21, 25].includes(target)) throw new Error('Choose Auto, Java 17, 21 or 25.');
    // Manual runtimes are explicit overrides; Minecraft/plugins decide compatibility.
    return target;
}
function resourceLimits(totalRamMB, cores) {
    const total = Math.max(512, Math.floor(Number(totalRamMB) || 2048));
    const reserve = Math.min(2048, Math.max(512, Math.floor(total / 4)));
    const maxRamMB = Math.max(512, Math.floor((total - reserve) / 256) * 256);
    const maxCpuCores = Math.max(1, Math.floor(Number(cores) || 1));
    return { totalRamMB: total, reservedRamMB: reserve, maxRamMB, maxCpuCores, recommendedRamMB: Math.min(2048, maxRamMB), recommendedCpuCores: Math.max(1, Math.floor(maxCpuCores / 2)) };
}
module.exports = { requiredJava, targetJava, resourceLimits };
