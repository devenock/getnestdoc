export declare function loadPackage(packageName: string, context: string, loaderFn?: Function): Promise<any>;
/**
 * Synchronously loads a package using `createRequire` and caches it.
 * This is meant for optional dependencies that must be loaded in
 * synchronous contexts (e.g. constructors).
 *
 * @param loaderFn Optional synchronous loader (e.g.
 *   `() => createRequire(import.meta.url)('pkg')`).
 *   When provided, bundlers can statically analyse the string literal.
 *   Falls back to a `createRequire` call resolved from this file.
 */
export declare function loadPackageSync(packageName: string, context: string, loaderFn?: () => any): any;
/**
 * Synchronously returns a package that was previously loaded and cached
 * via {@link loadPackage}. Throws if the package has not been loaded yet.
 *
 * Use this in methods that must remain synchronous (e.g. `connectMicroservice`).
 * Ensure that `loadPackage()` has been `await`ed for the same package name
 * before calling this function (typically during `init()` or `compile()`).
 */
export declare function loadPackageCached(packageName: string, context?: string): any;
/**
 * Attempts to load and cache a package. Returns the loaded module on success
 * or `null` if the package is not installed.
 *
 * Unlike {@link loadPackage}, this function does **not** terminate the process
 * when the package is missing, making it suitable for optional dependencies.
 */
export declare function tryLoadPackage(packageName: string, loaderFn?: Function): Promise<any>;
