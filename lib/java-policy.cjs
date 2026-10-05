function requiredJava(version) {
    const match = String(version || '').match(/(?:^|[^\d])(\d+)\.(\d+)(?:\.(\d+))?/);
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
    if (target < minimum) throw new Error(`Minecraft ${version} requires Java ${minimum} or newer. Select Auto or Java ${minimum}.`);
    return target;
}
module.exports = { requiredJava, targetJava };
