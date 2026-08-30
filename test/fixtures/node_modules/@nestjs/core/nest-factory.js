import { ApplicationConfig } from './application-config.js';
import { MESSAGES } from './constants.js';
import { ExceptionsZone } from './errors/exceptions-zone.js';
import { loadAdapter } from './helpers/load-adapter.js';
import { rethrow } from './helpers/rethrow.js';
import { NestContainer } from './injector/container.js';
import { Injector } from './injector/injector.js';
import { InstanceLoader } from './injector/instance-loader.js';
import { GraphInspector } from './inspector/graph-inspector.js';
import { NoopGraphInspector } from './inspector/noop-graph-inspector.js';
import { UuidFactory, UuidFactoryMode } from './inspector/uuid-factory.js';
import { MetadataScanner } from './metadata-scanner.js';
import { NestApplicationContext } from './nest-application-context.js';
import { NestApplication } from './nest-application.js';
import { DependenciesScanner } from './scanner.js';
import { loadPackage, isFunction, isNil, } from '@nestjs/common/internal';
import { ConsoleLogger, Logger, } from '@nestjs/common';
/**
 * @publicApi
 */
export class NestFactoryStatic {
    logger = new Logger('NestFactory', {
        timestamp: true,
    });
    abortOnError = true;
    autoFlushLogs = false;
    async create(moduleCls, serverOrOptions, options) {
        const [httpServer, appOptions] = this.isHttpServer(serverOrOptions)
            ? [serverOrOptions, options]
            : [await this.createHttpAdapter(), serverOrOptions];
        const applicationConfig = new ApplicationConfig();
        const container = new NestContainer(applicationConfig, appOptions);
        const graphInspector = this.createGraphInspector(appOptions, container);
        this.setAbortOnError(serverOrOptions, options);
        this.registerLoggerConfiguration(appOptions);
        await this.initialize(moduleCls, container, graphInspector, applicationConfig, appOptions, httpServer);
        const instance = new NestApplication(container, httpServer, applicationConfig, graphInspector, appOptions);
        await instance.preloadLazyPackages();
        const target = this.createNestInstance(instance);
        return this.createAdapterProxy(target, httpServer);
    }
    /**
     * Creates an instance of NestMicroservice.
     *
     * @param moduleCls Entry (root) application module class
     * @param options Optional microservice configuration
     *
     * @returns A promise that, when resolved,
     * contains a reference to the NestMicroservice instance.
     */
    async createMicroservice(moduleCls, options) {
        const { NestMicroservice } = await loadPackage('@nestjs/microservices', 'NestFactory', () => import('@nestjs/microservices'));
        const applicationConfig = new ApplicationConfig();
        const container = new NestContainer(applicationConfig, options);
        const graphInspector = this.createGraphInspector(options, container);
        this.setAbortOnError(options);
        this.registerLoggerConfiguration(options);
        await this.initialize(moduleCls, container, graphInspector, applicationConfig, options);
        return this.createNestInstance(new NestMicroservice(container, options, graphInspector, applicationConfig));
    }
    /**
     * Creates an instance of NestApplicationContext.
     *
     * @param moduleCls Entry (root) application module class
     * @param options Optional Nest application configuration
     *
     * @returns A promise that, when resolved,
     * contains a reference to the NestApplicationContext instance.
     */
    async createApplicationContext(moduleCls, options) {
        const applicationConfig = new ApplicationConfig();
        const container = new NestContainer(applicationConfig, options);
        const graphInspector = this.createGraphInspector(options, container);
        this.setAbortOnError(options);
        this.registerLoggerConfiguration(options);
        await this.initialize(moduleCls, container, graphInspector, applicationConfig, options);
        const modules = container.getModules().values();
        const root = modules.next().value;
        const context = this.createNestInstance(new NestApplicationContext(container, options, root));
        if (this.autoFlushLogs) {
            context.flushLogsOnOverride();
        }
        return context.init();
    }
    createNestInstance(instance) {
        return this.createProxy(instance);
    }
    async initialize(module, container, graphInspector, config = new ApplicationConfig(), options = {}, httpServer = null) {
        UuidFactory.mode = options.snapshot
            ? UuidFactoryMode.Deterministic
            : UuidFactoryMode.Random;
        const injector = new Injector({
            preview: options.preview,
            snapshot: options.snapshot,
            instanceDecorator: options.instrument?.instanceDecorator,
        });
        const instanceLoader = new InstanceLoader(container, injector, graphInspector);
        const metadataScanner = new MetadataScanner();
        const dependenciesScanner = new DependenciesScanner(container, metadataScanner, graphInspector, config);
        container.setHttpAdapter(httpServer);
        const teardown = this.abortOnError === false ? rethrow : undefined;
        await httpServer?.init?.();
        try {
            this.logger.log(MESSAGES.APPLICATION_START);
            await ExceptionsZone.asyncRun(async () => {
                await dependenciesScanner.scan(module);
                await instanceLoader.createInstancesOfDependencies();
                dependenciesScanner.applyApplicationProviders();
            }, teardown, this.autoFlushLogs);
        }
        catch (e) {
            this.handleInitializationError(e);
        }
    }
    handleInitializationError(err) {
        if (this.abortOnError) {
            process.abort();
        }
        rethrow(err);
    }
    createProxy(target) {
        const proxy = this.createExceptionProxy();
        return new Proxy(target, {
            get: proxy,
            set: proxy,
        });
    }
    createExceptionProxy() {
        return (receiver, prop) => {
            if (!(prop in receiver)) {
                return;
            }
            if (isFunction(receiver[prop])) {
                return this.createExceptionZone(receiver, prop);
            }
            return receiver[prop];
        };
    }
    createExceptionZone(receiver, prop) {
        const teardown = this.abortOnError === false ? rethrow : undefined;
        return (...args) => {
            let result;
            ExceptionsZone.run(() => {
                result = receiver[prop](...args);
            }, teardown, this.autoFlushLogs);
            return result;
        };
    }
    registerLoggerConfiguration(options) {
        if (!options) {
            return;
        }
        const { logger, bufferLogs, autoFlushLogs, forceConsole } = options;
        if (logger !== true && !isNil(logger)) {
            Logger.overrideLogger(logger);
        }
        else if (forceConsole) {
            // If no custom logger is provided but forceConsole is true,
            // create a ConsoleLogger with forceConsole option
            const consoleLogger = new ConsoleLogger({ forceConsole: true });
            Logger.overrideLogger(consoleLogger);
        }
        if (bufferLogs) {
            Logger.attachBuffer();
        }
        this.autoFlushLogs = autoFlushLogs ?? true;
    }
    async createHttpAdapter(httpServer) {
        const { ExpressAdapter } = await loadAdapter('@nestjs/platform-express', 'HTTP', () => import('@nestjs/platform-express'));
        return new ExpressAdapter(httpServer);
    }
    isHttpServer(serverOrOptions) {
        return !!(serverOrOptions && serverOrOptions.patch);
    }
    setAbortOnError(serverOrOptions, options) {
        this.abortOnError = this.isHttpServer(serverOrOptions)
            ? !(options && options.abortOnError === false)
            : !(serverOrOptions && serverOrOptions.abortOnError === false);
    }
    createAdapterProxy(app, adapter) {
        const proxy = new Proxy(app, {
            get: (receiver, prop) => {
                const mapToProxy = (result) => {
                    return result instanceof Promise
                        ? result.then(mapToProxy)
                        : result instanceof NestApplication
                            ? proxy
                            : result;
                };
                if (!(prop in receiver) && prop in adapter) {
                    return (...args) => {
                        const result = this.createExceptionZone(adapter, prop)(...args);
                        return mapToProxy(result);
                    };
                }
                if (isFunction(receiver[prop])) {
                    return (...args) => {
                        const result = receiver[prop](...args);
                        return mapToProxy(result);
                    };
                }
                return receiver[prop];
            },
        });
        return proxy;
    }
    createGraphInspector(appOptions, container) {
        return appOptions?.snapshot
            ? new GraphInspector(container)
            : NoopGraphInspector;
    }
}
/**
 * Use NestFactory to create an application instance.
 *
 * ### Specifying an entry module
 *
 * Pass the required *root module* for the application via the module parameter.
 * By convention, it is usually called `ApplicationModule`.  Starting with this
 * module, Nest assembles the dependency graph and begins the process of
 * Dependency Injection and instantiates the classes needed to launch your
 * application.
 *
 * @publicApi
 */
export const NestFactory = new NestFactoryStatic();
