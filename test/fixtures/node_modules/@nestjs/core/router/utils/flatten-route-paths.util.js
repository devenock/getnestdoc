import { isString, normalizePath } from '@nestjs/common/internal';
export function flattenRoutePaths(routes) {
    const result = [];
    routes.forEach(item => {
        if (item.module && item.path) {
            result.push({ module: item.module, path: item.path });
        }
        if (item.children) {
            const childrenRef = item.children;
            childrenRef.forEach(child => {
                if (!isString(child) && isString(child.path)) {
                    child.path = normalizePath(normalizePath(item.path) + normalizePath(child.path));
                }
                else {
                    result.push({ path: item.path, module: child });
                }
            });
            result.push(...flattenRoutePaths(childrenRef));
        }
    });
    return result;
}
