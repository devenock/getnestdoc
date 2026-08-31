export function assignTwoLevelsDeep(_dest, ...args) {
    const dest = _dest;
    for (const arg of args) {
        for (const [key, value] of Object.entries(arg ?? {})) {
            dest[key] = { ...dest[key], ...value };
        }
    }
    return dest;
}
