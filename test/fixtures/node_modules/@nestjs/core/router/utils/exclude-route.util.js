import { RequestMethod } from '@nestjs/common';
import { addLeadingSlash } from '@nestjs/common/internal';
export const isRequestMethodAll = (method) => {
    return RequestMethod.ALL === method || method === -1;
};
export function isRouteExcluded(excludedRoutes, path, requestMethod) {
    return excludedRoutes.some(route => {
        if (isRequestMethodAll(route.requestMethod) ||
            route.requestMethod === requestMethod) {
            return route.pathRegex.exec(addLeadingSlash(path));
        }
        return false;
    });
}
