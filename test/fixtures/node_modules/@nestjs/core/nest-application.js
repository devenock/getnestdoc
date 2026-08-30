import { VersioningType, } from '@nestjs/common';
import { iterate } from 'iterare';
import { platform } from 'os';
import { ApplicationConfig } from './application-config.js';
import { MESSAGES } from './constants.js';
import { optionalRequire } from './helpers/optional-require.js';
import { makeSafeInstanceDecorator } from './helpers/safe-instance-decorator.js';
import { Injector } from './injector/injector.js';
import { MiddlewareContainer } from './middleware/container.js';
import { MiddlewareModule } from './middleware/middleware-module.js';
import { mapToExcludeRoute } from './middleware/utils.js';
import { NestApplicationContext } from './nest-application-context.js';
import { RoutesResolver } from './router/routes-resolver.js';
import { Logger } from '@nestjs/common';
import { loadPackage, loadPackageCached, tryLoadPackage, addLeadingSlash, isFunction, isObject, isString, } from '@nestjs/common/internal';
import { RouteConflictDetector } from './router/route-conflict-detector.js';
import { RouteSpecificitySorter } from './router/route-specificity-sorter.js';
/**
 * @publicApi
 */
export class NestApplication extends NestApplicationContext {
    httpAdapter;
    config;
    graphInspector;
    logger = new Logger(NestApplication.name, {
        timestamp: true,
    });
    middlewareModule;
    middlewareContainer = new MiddlewareContainer(this.container);
    microservicesModule = null;
    socketModule = null;
    routesResolver;
    microservices = [];
    httpServer;
    isListening = false;
    isWsModuleRegistered = false;
    constructor(container, httpAdapter, config, graphInspector, appOptions = {}) {
        super(container, appOptions);
        this.httpAdapter = httpAdapter;
        this.config = config;
        this.graphInspector = graphInspector;
        this.config.setRouteConflictPolicy(appOptions.routeConflictPolicy);
        this.config.setRouteResolutionStrategy(appOptions.routeResolutionStrategy);
        this.selectContextModule();
        this.registerHttpServer();
        this.injector = new Injector({
            preview: this.appOptions.preview,
            instanceDecorator: appOptions.instrument?.instanceDecorator,
        });
        this.middlewareModule = new MiddlewareModule();
        this.routesResolver = new RoutesResolver(this.container, this.config, this.injector, this.graphInspector);
    }
    async prepareClose() {
        this.httpAdapter && (await this.httpAdapter.beforeClose?.());
    }
    async dispose() {
        await this.socketModule?.close();
        await this.microservicesModule?.close();
        await this.httpAdapter?.close();
        await Promise.all(iterate(this.microservices).map(async (microservice) => {
            microservice.setIsTerminated(true);
            await microservice.close();
        }));
    }
    getHttpAdapter() {
        return this.httpAdapter;
    }
    registerHttpServer() {
        this.httpServer = this.createServer();
    }
    getUnderlyingHttpServer() {
        return this.httpAdapter.getHttpServer();
    }
    applyOptions() {
        if (!this.appOptions || !this.appOptions.cors) {
            return undefined;
        }
        const passCustomOptions = isObject(this.appOptions.cors) || isFunction(this.appOptions.cors);
        if (!passCustomOptions) {
            return this.enableCors();
        }
        return this.enableCors(this.appOptions.cors);
    }
    createServer() {
        this.httpAdapter.initHttpServer(this.appOptions);
        return this.httpAdapter.getHttpServer();
    }
    async registerModules() {
        await this.registerWsModule();
        if (this.microservicesModule) {
            this.microservicesModule.register(this.container, this.graphInspector, this.config, this.appOptions);
            this.microservicesModule.setupClients(this.container);
        }
        await this.middlewareModule.register(this.middlewareContainer, this.container, this.config, this.injector, this.httpAdapter, this.graphInspector, this.appOptions);
    }
    async registerWsModule() {
        if (!this.socketModule) {
            return;
        }
        await this.socketModule.register(this.container, this.config, this.graphInspector, this.appOptions, this.httpServer);
        this.isWsModuleRegistered = true;
    }
    async init() {
        if (this.isInitialized) {
            return this;
        }
        // Lazy-load optional modules (ESM-compatible)
        await Promise.all([
            this.loadSocketModule(),
            this.loadMicroservicesModule(),
        ]);
        this.applyOptions();
        await this.httpAdapter?.init?.();
        const useBodyParser = this.appOptions && this.appOptions.bodyParser !== false;
        useBodyParser && this.registerParserMiddleware();
        await this.registerModules();
        await this.registerRouter();
        await this.callInitHook();
        await this.registerRouterHooks();
        await this.callBootstrapHook();
        this.isInitialized = true;
        this.logger.log(MESSAGES.APPLICATION_READY);
        return this;
    }
    registerParserMiddleware() {
        const prefix = this.config.getGlobalPrefix();
        const rawBody = !!this.appOptions?.rawBody;
        this.httpAdapter.registerParserMiddleware(prefix, rawBody);
    }
    async registerRouter() {
        await this.registerMiddleware(this.httpAdapter);
        const prefix = this.config.getGlobalPrefix();
        const basePath = addLeadingSlash(prefix);
        const conflictPolicy = this.config.getRouteConflictPolicy();
        const resolutionStrategy = this.config.getRouteResolutionStrategy();
        const adapterIsOrderSensitive = this.httpAdapter.isRouteOrderSensitive?.() ?? true;
        const shouldSortBySpecificity = resolutionStrategy === 'specificity' && adapterIsOrderSensitive;
        // Adapters that are not order-sensitive (e.g. Fastify) currently
        // also reject duplicate (method, URL) registrations synchronously
        // from the underlying router. Treat the two properties as one
        // signal until a separate capability flag is introduced.
        const adapterRejectsDuplicates = !adapterIsOrderSensitive;
        if (!conflictPolicy && !shouldSortBySpecificity) {
            this.routesResolver.resolve(this.httpAdapter, basePath);
            return;
        }
        // Defer registration whenever we collect routes for diagnostics or
        // re-ordering. In particular, when a conflict policy is set we
        // must run detection *before* the adapter sees any route, because
        // duplicate-rejecting adapters like Fastify throw synchronously
        // from `instance.route()` and would short-circuit both the resolve
        // loop and the aggregated `RouteConflictException`.
        const resolvedRoutes = [];
        this.routesResolver.resolve(this.httpAdapter, basePath, {
            onRouteResolved: route => resolvedRoutes.push(route),
            deferRegistration: true,
        });
        // Sort before conflict detection so that winner/shadowed pairs in every
        // conflict record reflect actual adapter registration order. Without this,
        // the reported winner could be the declaration-first (less-specific) route
        // even though the sorted-first (more-specific) route is what really wins.
        const orderedRoutes = shouldSortBySpecificity
            ? RouteSpecificitySorter.sort(resolvedRoutes)
            : resolvedRoutes;
        const routesToSkip = new Set();
        if (conflictPolicy) {
            const filteredPolicy = adapterIsOrderSensitive
                ? conflictPolicy
                : { duplicate: conflictPolicy.duplicate };
            const conflicts = RouteConflictDetector.detect(orderedRoutes, this.config.getVersioning());
            // On adapters that reject duplicate registrations the policy
            // cannot be honoured by simply logging — the adapter would
            // throw on the second `instance.route()` call. Drop the
            // shadowed route of every duplicate conflict so the detector
            // (not the adapter) decides which one wins. The detector
            // always picks the earlier-registered route as the winner.
            if (adapterRejectsDuplicates) {
                conflicts.forEach(conflict => {
                    if (conflict.kind === 'duplicate') {
                        routesToSkip.add(conflict.shadowed);
                    }
                });
            }
            // When specificity sorting is active, shadow conflicts where the sort
            // promoted the winner (declared later but more specific) are resolved
            // at runtime: the more-specific route is first-registered and handles
            // its requests, the less-specific route handles the rest. Filtering
            // these out prevents shadow: 'error' from aborting an app whose routes
            // work correctly after specificity ordering. Genuine shadows — where the
            // winner was already first in declaration order and the sort did not help
            // — are kept and still apply the configured policy.
            const effectiveConflicts = shouldSortBySpecificity
                ? RouteConflictDetector.filterSortResolvedShadows(conflicts, resolvedRoutes)
                : conflicts;
            RouteConflictDetector.handle(effectiveConflicts, filteredPolicy, this.logger);
        }
        orderedRoutes.forEach(route => {
            if (routesToSkip.has(route))
                return;
            this.routesResolver.registerResolvedRoute(this.httpAdapter, route);
        });
    }
    async registerRouterHooks() {
        this.routesResolver.registerNotFoundHandler();
        this.routesResolver.registerExceptionHandler();
    }
    connectMicroservice(microserviceOptions, hybridAppOptions = {}) {
        const { NestMicroservice } = loadPackageCached('@nestjs/microservices', 'NestFactory');
        const { inheritAppConfig } = hybridAppOptions;
        const applicationConfig = inheritAppConfig
            ? this.config
            : new ApplicationConfig();
        const instance = new NestMicroservice(this.container, microserviceOptions, this.graphInspector, applicationConfig);
        if (!hybridAppOptions.deferInitialization) {
            instance.registerListeners();
            instance.setIsInitialized(true);
            instance.setIsInitHookCalled(true);
        }
        this.microservices.push(instance);
        return instance;
    }
    getMicroservices() {
        return this.microservices;
    }
    getHttpServer() {
        return this.httpServer;
    }
    async startAllMicroservices() {
        this.assertNotInPreviewMode('startAllMicroservices');
        await Promise.all(this.microservices.map(msvc => msvc.listen()));
        return this;
    }
    use(...args) {
        this.httpAdapter.use(...this.applyFunctionDecoratorIfRegistered(args));
        return this;
    }
    useBodyParser(...args) {
        if (!('useBodyParser' in this.httpAdapter)) {
            this.logger.warn('Your HTTP Adapter does not support `.useBodyParser`.');
            return this;
        }
        const [parserType, ...otherArgs] = args;
        const rawBody = !!this.appOptions.rawBody;
        this.httpAdapter.useBodyParser?.(...[parserType, rawBody, ...otherArgs]);
        return this;
    }
    enableCors(options) {
        this.httpAdapter.enableCors(options);
    }
    enableVersioning(options = { type: VersioningType.URI }) {
        this.config.enableVersioning(options);
        return this;
    }
    async listen(port, ...args) {
        this.assertNotInPreviewMode('listen');
        if (!this.isInitialized) {
            await this.init();
        }
        const httpAdapterHost = this.container.getHttpAdapterHostRef();
        return new Promise((resolve, reject) => {
            const errorHandler = (e) => {
                this.logger.error(e?.toString?.());
                reject(e);
            };
            this.httpServer.once('error', errorHandler);
            const isCallbackInOriginalArgs = isFunction(args[args.length - 1]);
            const listenFnArgs = isCallbackInOriginalArgs
                ? args.slice(0, args.length - 1)
                : args;
            this.httpAdapter.listen(port, ...listenFnArgs, (...originalCallbackArgs) => {
                if (this.appOptions?.autoFlushLogs ?? true) {
                    this.flushLogs();
                }
                if (originalCallbackArgs[0] instanceof Error) {
                    return reject(originalCallbackArgs[0]);
                }
                const address = this.httpServer.address();
                if (address) {
                    this.httpServer.removeListener('error', errorHandler);
                    this.isListening = true;
                    httpAdapterHost.listening = true;
                    resolve(this.httpServer);
                }
                if (isCallbackInOriginalArgs) {
                    args[args.length - 1](...originalCallbackArgs);
                }
            });
        });
    }
    async getUrl() {
        return new Promise((resolve, reject) => {
            if (!this.isListening) {
                this.logger.error(MESSAGES.CALL_LISTEN_FIRST);
                reject(MESSAGES.CALL_LISTEN_FIRST);
                return;
            }
            const address = this.httpServer.address();
            resolve(this.formatAddress(address));
        });
    }
    formatAddress(address) {
        if (isString(address)) {
            if (platform() === 'win32') {
                return address;
            }
            const basePath = encodeURIComponent(address);
            return `${this.getProtocol()}+unix://${basePath}`;
        }
        let host = this.host();
        if (address && address.family === 'IPv6') {
            if (host === '::') {
                host = '[::1]';
            }
            else {
                host = `[${host}]`;
            }
        }
        else if (host === '0.0.0.0') {
            host = '127.0.0.1';
        }
        return `${this.getProtocol()}://${host}:${address.port}`;
    }
    setGlobalPrefix(prefix, options) {
        this.config.setGlobalPrefix(prefix);
        if (options) {
            const exclude = options?.exclude
                ? mapToExcludeRoute(options.exclude)
                : [];
            this.config.setGlobalPrefixOptions({
                ...options,
                exclude,
            });
        }
        return this;
    }
    useWebSocketAdapter(adapter) {
        if (this.isWsModuleRegistered) {
            this.logger.warn('useWebSocketAdapter() was called after WebSocket gateways were already initialized. The provided adapter will be stored but will NOT be applied to existing gateways — they remain bound to the previously installed adapter. To install a custom adapter, call app.useWebSocketAdapter(...) BEFORE app.init() (or app.listen()).');
        }
        this.config.setIoAdapter(adapter);
        return this;
    }
    useGlobalFilters(...filters) {
        filters = this.applyInstanceDecoratorIfRegistered(...filters);
        this.config.useGlobalFilters(...filters);
        filters.forEach(item => this.graphInspector.insertOrphanedEnhancer({
            subtype: 'filter',
            ref: item,
        }));
        return this;
    }
    useGlobalPipes(...pipes) {
        pipes = this.applyInstanceDecoratorIfRegistered(...pipes);
        this.config.useGlobalPipes(...pipes);
        pipes.forEach(item => this.graphInspector.insertOrphanedEnhancer({
            subtype: 'pipe',
            ref: item,
        }));
        return this;
    }
    useGlobalInterceptors(...interceptors) {
        interceptors = this.applyInstanceDecoratorIfRegistered(...interceptors);
        this.config.useGlobalInterceptors(...interceptors);
        interceptors.forEach(item => this.graphInspector.insertOrphanedEnhancer({
            subtype: 'interceptor',
            ref: item,
        }));
        return this;
    }
    useGlobalGuards(...guards) {
        guards = this.applyInstanceDecoratorIfRegistered(...guards);
        this.config.useGlobalGuards(...guards);
        guards.forEach(item => this.graphInspector.insertOrphanedEnhancer({
            subtype: 'guard',
            ref: item,
        }));
        return this;
    }
    useStaticAssets(pathOrOptions, options) {
        this.httpAdapter.useStaticAssets?.(pathOrOptions, options);
        return this;
    }
    setBaseViewsDir(path) {
        this.httpAdapter.setBaseViewsDir?.(path);
        return this;
    }
    setViewEngine(engineOrOptions) {
        this.httpAdapter.setViewEngine?.(engineOrOptions);
        return this;
    }
    /**
     * Pre-load optional packages so that createNestApplication,
     * createNestMicroservice and createHttpAdapter can stay synchronous.
     */
    async preloadLazyPackages() {
        // Best-effort: silently swallow if packages are not installed
        await tryLoadPackage('@nestjs/platform-express', () => import('@nestjs/platform-express'));
        await tryLoadPackage('@nestjs/microservices', () => import('@nestjs/microservices'));
    }
    host() {
        const address = this.httpServer.address();
        if (isString(address)) {
            return undefined;
        }
        return address && address.address;
    }
    getProtocol() {
        return this.appOptions && this.appOptions.httpsOptions ? 'https' : 'http';
    }
    async registerMiddleware(instance) {
        await this.middlewareModule.registerMiddleware(this.middlewareContainer, instance);
    }
    applyInstanceDecoratorIfRegistered(...instances) {
        if (this.appOptions.instrument?.instanceDecorator) {
            const decorate = makeSafeInstanceDecorator(this.appOptions.instrument.instanceDecorator);
            return instances.map(instance => decorate(instance));
        }
        return instances;
    }
    applyFunctionDecoratorIfRegistered(args) {
        if (!this.appOptions.instrument?.instanceDecorator) {
            return args;
        }
        const decorate = makeSafeInstanceDecorator(this.appOptions.instrument.instanceDecorator);
        // Decorators may return a non-function value for plain middleware
        // functions; fall back to the original argument so the HTTP adapter
        // always receives a valid handler.
        const decorateFunction = (arg) => {
            if (!isFunction(arg)) {
                return arg;
            }
            const decorated = decorate(arg);
            return isFunction(decorated) ? decorated : arg;
        };
        // Map over the original arguments to preserve arity: appending a trailing
        // `undefined` to a single-argument `use(fn)` call would make Express 5's
        // router throw "argument handler must be a function".
        return args.map(decorateFunction);
    }
    async loadSocketModule() {
        if (!this.socketModule) {
            const socketModule = await optionalRequire('@nestjs/websockets/socket-module', () => import('@nestjs/websockets/socket-module.js'));
            if (socketModule?.SocketModule) {
                this.socketModule = new socketModule.SocketModule();
            }
        }
    }
    async loadMicroservicesModule() {
        if (!this.microservicesModule) {
            const msModule = await optionalRequire('@nestjs/microservices/microservices-module', () => import('@nestjs/microservices/microservices-module.js'));
            if (msModule?.MicroservicesModule) {
                this.microservicesModule = new msModule.MicroservicesModule();
                // Pre-cache the main barrel so connectMicroservice() can stay synchronous
                await loadPackage('@nestjs/microservices', 'NestFactory', () => import('@nestjs/microservices'));
            }
        }
    }
}
