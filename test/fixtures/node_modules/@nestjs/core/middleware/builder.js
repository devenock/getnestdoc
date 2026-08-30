import { iterate } from 'iterare';
import { filterMiddleware } from './utils.js';
import { stripEndSlash, } from '@nestjs/common/internal';
export class MiddlewareBuilder {
    routesMapper;
    httpAdapter;
    routeInfoPathExtractor;
    middlewareCollection = new Set();
    constructor(routesMapper, httpAdapter, routeInfoPathExtractor) {
        this.routesMapper = routesMapper;
        this.httpAdapter = httpAdapter;
        this.routeInfoPathExtractor = routeInfoPathExtractor;
    }
    apply(...middleware) {
        return new MiddlewareBuilder.ConfigProxy(this, middleware.flat(), this.routeInfoPathExtractor);
    }
    build() {
        return [...this.middlewareCollection];
    }
    getHttpAdapter() {
        return this.httpAdapter;
    }
    static ConfigProxy = class {
        builder;
        middleware;
        routeInfoPathExtractor;
        excludedRoutes = [];
        constructor(builder, middleware, routeInfoPathExtractor) {
            this.builder = builder;
            this.middleware = middleware;
            this.routeInfoPathExtractor = routeInfoPathExtractor;
        }
        getExcludedRoutes() {
            return this.excludedRoutes;
        }
        exclude(...routes) {
            this.excludedRoutes = [
                ...this.excludedRoutes,
                ...this.getRoutesFlatList(routes).reduce((excludedRoutes, route) => {
                    for (const routePath of this.routeInfoPathExtractor.extractPathFrom(route)) {
                        excludedRoutes.push({
                            ...route,
                            path: routePath,
                        });
                    }
                    return excludedRoutes;
                }, []),
            ];
            return this;
        }
        forRoutes(...routes) {
            const { middlewareCollection } = this.builder;
            const flattedRoutes = this.getRoutesFlatList(routes);
            const forRoutes = this.removeOverlappedRoutes(flattedRoutes);
            const configuration = {
                middleware: filterMiddleware(this.middleware, this.excludedRoutes, this.builder.getHttpAdapter()),
                forRoutes,
            };
            middlewareCollection.add(configuration);
            return this.builder;
        }
        getRoutesFlatList(routes) {
            const { routesMapper } = this.builder;
            return iterate(routes)
                .map(route => routesMapper.mapRouteToRouteInfo(route))
                .flatten()
                .toArray();
        }
        removeOverlappedRoutes(routes) {
            const regexMatchParams = /(:[^/]*)/g;
            const wildcard = '([^/]*)';
            const routesWithRegex = routes
                .filter(route => route.path.includes(':'))
                .map(route => ({
                method: route.method,
                path: route.path,
                // No `g` flag: each regex is reused across every route below, and a
                // global regex advances `lastIndex` on a match, so the next `test()`
                // would resume mid-string and fail the `^` anchor. The pattern is
                // anchored and only used with `test()`, so `g` buys nothing anyway.
                regex: new RegExp('^(' + route.path.replace(regexMatchParams, wildcard) + ')$'),
            }));
            return routes.filter(route => {
                const isOverlapped = (item) => {
                    if (route.method !== item.method) {
                        return false;
                    }
                    const normalizedRoutePath = stripEndSlash(route.path);
                    return (normalizedRoutePath !== item.path &&
                        item.regex.test(normalizedRoutePath));
                };
                const routeMatch = routesWithRegex.find(isOverlapped);
                return routeMatch === undefined;
            });
        }
    };
}
