import { type CanActivate, type ExceptionFilter, type HttpServer, type INestApplication, type INestMicroservice, type NestHybridApplicationOptions, type NestInterceptor, type PipeTransform, type VersioningOptions, type WebSocketAdapter } from '@nestjs/common';
import { AbstractHttpAdapter } from './adapters/index.js';
import { ApplicationConfig } from './application-config.js';
import { NestContainer } from './injector/container.js';
import { GraphInspector } from './inspector/graph-inspector.js';
import { NestApplicationContext } from './nest-application-context.js';
import { type NestApplicationOptions, Logger } from '@nestjs/common';
import { type GlobalPrefixOptions } from '@nestjs/common/internal';
/**
 * @publicApi
 */
export declare class NestApplication extends NestApplicationContext<NestApplicationOptions> implements INestApplication {
    private readonly httpAdapter;
    private readonly config;
    private readonly graphInspector;
    protected readonly logger: Logger;
    private readonly middlewareModule;
    private readonly middlewareContainer;
    private microservicesModule;
    private socketModule;
    private readonly routesResolver;
    private readonly microservices;
    private httpServer;
    private isListening;
    private isWsModuleRegistered;
    constructor(container: NestContainer, httpAdapter: HttpServer, config: ApplicationConfig, graphInspector: GraphInspector, appOptions?: NestApplicationOptions);
    protected prepareClose(): Promise<void>;
    protected dispose(): Promise<void>;
    getHttpAdapter(): AbstractHttpAdapter;
    registerHttpServer(): void;
    getUnderlyingHttpServer<T>(): T;
    applyOptions(): void;
    createServer<T = any>(): T;
    registerModules(): Promise<void>;
    registerWsModule(): Promise<void>;
    init(): Promise<this>;
    registerParserMiddleware(): void;
    registerRouter(): Promise<void>;
    registerRouterHooks(): Promise<void>;
    connectMicroservice<T extends object>(microserviceOptions: T, hybridAppOptions?: NestHybridApplicationOptions): INestMicroservice;
    getMicroservices(): INestMicroservice[];
    getHttpServer(): any;
    startAllMicroservices(): Promise<this>;
    use(...args: [any, any?]): this;
    useBodyParser(...args: [any, any?]): this;
    enableCors(options?: any): void;
    enableVersioning(options?: VersioningOptions): this;
    listen(port: number | string): Promise<any>;
    listen(port: number | string, hostname: string): Promise<any>;
    getUrl(): Promise<string>;
    private formatAddress;
    setGlobalPrefix(prefix: string, options?: GlobalPrefixOptions): this;
    useWebSocketAdapter(adapter: WebSocketAdapter): this;
    useGlobalFilters(...filters: ExceptionFilter[]): this;
    useGlobalPipes(...pipes: PipeTransform<any>[]): this;
    useGlobalInterceptors(...interceptors: NestInterceptor[]): this;
    useGlobalGuards(...guards: CanActivate[]): this;
    useStaticAssets(options: any): this;
    useStaticAssets(path: string, options?: any): this;
    setBaseViewsDir(path: string | string[]): this;
    setViewEngine(engineOrOptions: any): this;
    /**
     * Pre-load optional packages so that createNestApplication,
     * createNestMicroservice and createHttpAdapter can stay synchronous.
     */
    preloadLazyPackages(): Promise<void>;
    private host;
    private getProtocol;
    private registerMiddleware;
    private applyInstanceDecoratorIfRegistered;
    private applyFunctionDecoratorIfRegistered;
    private loadSocketModule;
    private loadMicroservicesModule;
}
