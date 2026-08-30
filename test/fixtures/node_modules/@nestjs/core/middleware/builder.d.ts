import { RouteInfoPathExtractor } from './route-info-path-extractor.js';
import { RoutesMapper } from './routes-mapper.js';
import type { HttpServer, MiddlewareConsumer, Type } from '@nestjs/common';
import { type MiddlewareConfigProxy, type MiddlewareConfiguration } from '@nestjs/common/internal';
export declare class MiddlewareBuilder implements MiddlewareConsumer {
    private readonly routesMapper;
    private readonly httpAdapter;
    private readonly routeInfoPathExtractor;
    private readonly middlewareCollection;
    constructor(routesMapper: RoutesMapper, httpAdapter: HttpServer, routeInfoPathExtractor: RouteInfoPathExtractor);
    apply(...middleware: Array<Type<any> | Function | Array<Type<any> | Function>>): MiddlewareConfigProxy;
    build(): MiddlewareConfiguration[];
    getHttpAdapter(): HttpServer;
    private static readonly ConfigProxy;
}
