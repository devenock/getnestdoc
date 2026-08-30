export async function optionalRequire(packageName, loaderFn) {
    try {
        return loaderFn ? await loaderFn() : await import(packageName);
    }
    catch (e) {
        return {};
    }
}
