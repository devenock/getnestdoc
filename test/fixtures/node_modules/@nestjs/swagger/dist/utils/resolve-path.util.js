import * as pathLib from 'path';
export function resolvePath(path) {
    return path ? pathLib.resolve(path) : path;
}
