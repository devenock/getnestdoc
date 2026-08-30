import { RequestMethod } from '@nestjs/common';
import { iterate } from 'iterare';
import { pathToRegexp } from 'path-to-regexp';
import { uid } from 'uid';
import { LegacyRouteConverter } from '../router/legacy-route-converter.js';
import { isRouteExcluded } from '../router/utils/index.js';
import { addLeadingSlash, isFunction, isString, } from '@nestjs/common/internal';
export const mapToExcludeRoute = (routes) => {
    return routes.map(route => {
        const originalPath = isString(route) ? route : route.path;
        const path = LegacyRouteConverter.tryConvert(originalPath);
        try {
            if (isString(route)) {
                return {
                    path,
                    requestMethod: RequestMethod.ALL,
                    pathRegex: pathToRegexp(addLeadingSlash(path)).regexp,
                };
            }
            return {
                path,
                requestMethod: route.method,
                pathRegex: pathToRegexp(addLeadingSlash(path)).regexp,
            };
        }
        catch (e) {
            if (e instanceof TypeError) {
                LegacyRouteConverter.printError(originalPath);
            }
            throw e;
        }
    });
};
export const filterMiddleware = (middleware, routes, httpAdapter) => {
    const excludedRoutes = mapToExcludeRoute(routes);
    return iterate([])
        .concat(middleware)
        .filter(isFunction)
        .map((item) => mapToClass(item, excludedRoutes, httpAdapter))
        .toArray();
};
export const mapToClass = (middleware, excludedRoutes, httpAdapter) => {
    if (isMiddlewareClass(middleware)) {
        if (excludedRoutes.length <= 0) {
            return middleware;
        }
        const MiddlewareHost = class extends middleware {
            use(...params) {
                const [req, _, next] = params;
                const isExcluded = isMiddlewareRouteExcluded(req, excludedRoutes, httpAdapter);
                if (isExcluded) {
                    return next();
                }
                return super.use(...params);
            }
        };
        return assignToken(MiddlewareHost, middleware.name);
    }
    return assignToken(class {
        use = (...params) => {
            const [req, _, next] = params;
            const isExcluded = isMiddlewareRouteExcluded(req, excludedRoutes, httpAdapter);
            if (isExcluded) {
                return next();
            }
            return middleware(...params);
        };
    });
};
export function isMiddlewareClass(middleware) {
    const middlewareStr = middleware.toString();
    if (middlewareStr.substring(0, 5) === 'class') {
        return true;
    }
    const middlewareArr = middlewareStr.split(' ');
    return (middlewareArr[0] === 'function' &&
        /[A-Z]/.test(middlewareArr[1]?.[0]) &&
        isFunction(middleware.prototype?.use));
}
export function assignToken(metatype, token = uid(21)) {
    Object.defineProperty(metatype, 'name', { value: token });
    return metatype;
}
export function isMiddlewareRouteExcluded(req, excludedRoutes, httpAdapter) {
    if (excludedRoutes.length <= 0) {
        return false;
    }
    const reqMethod = httpAdapter.getRequestMethod(req);
    const originalUrl = httpAdapter.getRequestUrl(req);
    const queryParamsIndex = originalUrl ? originalUrl.indexOf('?') : -1;
    const pathname = queryParamsIndex >= 0
        ? originalUrl.slice(0, queryParamsIndex)
        : originalUrl;
    return isRouteExcluded(excludedRoutes, pathname, RequestMethod[reqMethod]);
}
