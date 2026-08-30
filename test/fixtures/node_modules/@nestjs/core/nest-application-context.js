import { Logger, ShutdownSignal, } from '@nestjs/common';
import { iterate } from 'iterare';
import { MESSAGES } from './constants.js';
import { UnknownModuleException } from './errors/exceptions/index.js';
import { createContextId } from './helpers/context-id-factory.js';
import { callAppShutdownHook, callBeforeAppShutdownHook, callModuleBootstrapHook, callModuleDestroyHook, callModuleInitHook, } from './hooks/index.js';
import { AbstractInstanceResolver } from './injector/abstract-instance-resolver.js';
import { Injector } from './injector/injector.js';
import { InstanceLinksHost } from './injector/instance-links-host.js';
import { isEmptyArray, } from '@nestjs/common/internal';
/**
 * @publicApi
 */
export class NestApplicationContext extends AbstractInstanceResolver {
    container;
    appOptions;
    contextModule;
    scope;
    isInitialized = false;
    injector;
    logger = new Logger(NestApplicationContext.name, {
        timestamp: true,
    });
    shouldFlushLogsOnOverride = false;
    activeShutdownSignals = new Array();
    moduleCompiler;
    shutdownCleanupRef;
    _instanceLinksHost;
    _moduleRefsForHooksByDistance;
    initializationPromise;
    get instanceLinksHost() {
        if (!this._instanceLinksHost) {
            this._instanceLinksHost = new InstanceLinksHost(this.container);
        }
        return this._instanceLinksHost;
    }
    constructor(container, appOptions = {}, contextModule = null, scope = new Array()) {
        super();
        this.container = container;
        this.appOptions = appOptions;
        this.contextModule = contextModule;
        this.scope = scope;
        this.injector = new Injector();
        this.moduleCompiler = container.getModuleCompiler();
        if (this.appOptions.preview) {
            this.printInPreviewModeWarning();
        }
    }
    selectContextModule() {
        const modules = this.container.getModules().values();
        this.contextModule = modules.next().value;
    }
    /**
     * Allows navigating through the modules tree, for example, to pull out a specific instance from the selected module.
     * @returns {INestApplicationContext}
     */
    select(moduleType, selectOptions) {
        const modulesContainer = this.container.getModules();
        const contextModuleCtor = this.contextModule.metatype;
        const scope = this.scope.concat(contextModuleCtor);
        const moduleTokenFactory = this.container.getModuleTokenFactory();
        const { type, dynamicMetadata } = this.moduleCompiler.extractMetadata(moduleType);
        const token = dynamicMetadata
            ? moduleTokenFactory.createForDynamic(type, dynamicMetadata, moduleType)
            : moduleTokenFactory.createForStatic(type, moduleType);
        const selectedModule = modulesContainer.get(token);
        if (!selectedModule) {
            throw new UnknownModuleException(type.name);
        }
        const options = typeof selectOptions?.abortOnError !== 'undefined'
            ? {
                ...this.appOptions,
                ...selectOptions,
            }
            : this.appOptions;
        return new NestApplicationContext(this.container, options, selectedModule, scope);
    }
    /**
     * Retrieves an instance (or a list of instances) of either injectable or controller, otherwise, throws exception.
     * @returns {TResult | Array<TResult>}
     */
    get(typeOrToken, options = { strict: false }) {
        return !(options && options.strict)
            ? this.find(typeOrToken, options)
            : this.find(typeOrToken, {
                moduleId: this.contextModule?.id,
                each: options.each,
            });
    }
    /**
     * Resolves transient or request-scoped instance (or a list of instances) of either injectable or controller, otherwise, throws exception.
     * @returns {Promise<TResult | Array<TResult>>}
     */
    resolve(typeOrToken, contextId = createContextId(), options = { strict: false }) {
        return this.resolvePerContext(typeOrToken, this.contextModule, contextId, options);
    }
    /**
     * Registers the request/context object for a given context ID (DI container sub-tree).
     * @returns {void}
     */
    registerRequestByContextId(request, contextId) {
        this.container.registerRequestProvider(request, contextId);
    }
    /**
     * Initializes the Nest application.
     * Calls the Nest lifecycle events.
     *
     * @returns {Promise<this>} The NestApplicationContext instance as Promise
     */
    async init() {
        if (this.isInitialized) {
            return this;
        }
        this.initializationPromise = this.callInitHook().then(() => this.callBootstrapHook());
        await this.initializationPromise;
        this.isInitialized = true;
        return this;
    }
    /**
     * Terminates the application
     * @returns {Promise<void>}
     */
    async close(signal) {
        await this.initializationPromise;
        await this.prepareClose();
        await this.callDestroyHook();
        await this.callBeforeShutdownHook(signal);
        await this.dispose();
        await this.callShutdownHook(signal);
        this.unsubscribeFromProcessSignals();
    }
    /**
     * Sets custom logger service.
     * Flushes buffered logs if auto flush is on.
     * @returns {void}
     */
    useLogger(logger) {
        Logger.overrideLogger(logger);
        if (this.shouldFlushLogsOnOverride) {
            this.flushLogs();
        }
    }
    /**
     * Prints buffered logs and detaches buffer.
     * @returns {void}
     */
    flushLogs() {
        Logger.flush();
    }
    /**
     * Define that it must flush logs right after defining a custom logger.
     */
    flushLogsOnOverride() {
        this.shouldFlushLogsOnOverride = true;
    }
    /**
     * Enables the usage of shutdown hooks. Will call the
     * `onApplicationShutdown` function of a provider if the
     * process receives a shutdown signal.
     *
     * @param {ShutdownSignal[]} [signals=[]] The system signals it should listen to
     * @param {ShutdownHooksOptions} [options={}] Options for configuring shutdown hooks behavior
     *
     * @returns {this} The Nest application context instance
     */
    enableShutdownHooks(signals = [], options = {}) {
        if (!signals || isEmptyArray(signals)) {
            signals = Object.values(ShutdownSignal);
        }
        else {
            // given signals array should be unique because
            // process shouldn't listen to the same signal more than once.
            signals = Array.from(new Set(signals));
        }
        signals = iterate(signals)
            .map((signal) => signal.toString().toUpperCase().trim())
            // filter out the signals which is already listening to
            .filter(signal => !this.activeShutdownSignals.includes(signal))
            .toArray();
        this.listenToShutdownSignals(signals, options);
        return this;
    }
    async prepareClose() {
        // Nest application context has no server
        // to signal, therefore just call a noop
        return Promise.resolve();
    }
    async dispose() {
        // Nest application context has no server
        // to dispose, therefore just call a noop
        return Promise.resolve();
    }
    /**
     * Listens to shutdown signals by listening to
     * process events
     *
     * @param {string[]} signals The system signals it should listen to
     * @param {ShutdownHooksOptions} options Options for configuring shutdown hooks behavior
     */
    listenToShutdownSignals(signals, options = {}) {
        let receivedSignal = false;
        const cleanup = async (signal) => {
            try {
                if (receivedSignal) {
                    // If we receive another signal while we're waiting
                    // for the server to stop, just ignore it.
                    return;
                }
                receivedSignal = true;
                await this.initializationPromise;
                await this.prepareClose();
                await this.callDestroyHook();
                await this.callBeforeShutdownHook(signal);
                await this.dispose();
                await this.callShutdownHook(signal);
                signals.forEach(sig => process.removeListener(sig, cleanup));
                if (options.useProcessExit) {
                    // Use process.exit() to ensure the 'exit' event is properly triggered.
                    // This is required for async loggers (like Pino with transports)
                    // to flush their buffers before the process terminates.
                    process.exit(0);
                }
                else {
                    process.kill(process.pid, signal);
                }
            }
            catch (err) {
                Logger.error(MESSAGES.ERROR_DURING_SHUTDOWN, err?.stack, NestApplicationContext.name);
                process.exit(1);
            }
        };
        this.shutdownCleanupRef = cleanup;
        signals.forEach((signal) => {
            this.activeShutdownSignals.push(signal);
            process.on(signal, cleanup);
        });
    }
    /**
     * Unsubscribes from shutdown signals (process events)
     */
    unsubscribeFromProcessSignals() {
        if (!this.shutdownCleanupRef) {
            return;
        }
        this.activeShutdownSignals.forEach(signal => {
            process.removeListener(signal, this.shutdownCleanupRef);
        });
    }
    /**
     * Calls the `onModuleInit` function on the registered
     * modules and its children.
     */
    async callInitHook() {
        const modulesSortedByDistance = this.getModulesToTriggerHooksOn();
        for (const module of modulesSortedByDistance) {
            await callModuleInitHook(module);
        }
    }
    /**
     * Calls the `onModuleDestroy` function on the registered
     * modules and its children.
     */
    async callDestroyHook() {
        const modulesSortedByDistance = [
            ...this.getModulesToTriggerHooksOn(),
        ].reverse();
        for (const module of modulesSortedByDistance) {
            await callModuleDestroyHook(module);
        }
    }
    /**
     * Calls the `onApplicationBootstrap` function on the registered
     * modules and its children.
     */
    async callBootstrapHook() {
        const modulesSortedByDistance = this.getModulesToTriggerHooksOn();
        for (const module of modulesSortedByDistance) {
            await callModuleBootstrapHook(module);
        }
    }
    /**
     * Calls the `onApplicationShutdown` function on the registered
     * modules and children.
     */
    async callShutdownHook(signal) {
        const modulesSortedByDistance = [
            ...this.getModulesToTriggerHooksOn(),
        ].reverse();
        for (const module of modulesSortedByDistance) {
            await callAppShutdownHook(module, signal);
        }
    }
    /**
     * Calls the `beforeApplicationShutdown` function on the registered
     * modules and children.
     */
    async callBeforeShutdownHook(signal) {
        const modulesSortedByDistance = [
            ...this.getModulesToTriggerHooksOn(),
        ].reverse();
        for (const module of modulesSortedByDistance) {
            await callBeforeAppShutdownHook(module, signal);
        }
    }
    assertNotInPreviewMode(methodName) {
        if (this.appOptions.preview) {
            const error = `Calling the "${methodName}" in the preview mode is not supported.`;
            this.logger.error(error);
            throw new Error(error);
        }
    }
    getModulesToTriggerHooksOn() {
        if (this._moduleRefsForHooksByDistance) {
            return this._moduleRefsForHooksByDistance;
        }
        const modulesContainer = this.container.getModules();
        const compareFn = (a, b) => b.distance - a.distance;
        const modulesSortedByDistance = Array.from(modulesContainer.values()).sort(compareFn);
        this._moduleRefsForHooksByDistance = this.appOptions?.preview
            ? modulesSortedByDistance.filter(moduleRef => moduleRef.initOnPreview)
            : modulesSortedByDistance;
        return this._moduleRefsForHooksByDistance;
    }
    printInPreviewModeWarning() {
        this.logger.warn('------------------------------------------------');
        this.logger.warn('Application is running in the PREVIEW mode!');
        this.logger.warn('Providers/controllers will not be instantiated.');
        this.logger.warn('------------------------------------------------');
    }
}
