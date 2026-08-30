/**
 * Internal module - not part of the public API.
 * These exports are used by sibling @nestjs packages.
 * Do not depend on these in your application code.
 * @internal
 * @module
 */
export * from './errors/exceptions/index.js';
export { InvalidExceptionFilterException } from './errors/exceptions/invalid-exception-filter.exception.js';
export { RuntimeException } from './errors/exceptions/runtime.exception.js';
export { MESSAGES } from './constants.js';
export { DependenciesScanner } from './scanner.js';
export { STATIC_CONTEXT } from './injector/constants.js';
export { Injector, InjectorDependencyContext } from './injector/injector.js';
export { InstanceLoader } from './injector/instance-loader.js';
export { InstanceWrapper } from './injector/instance-wrapper.js';
export { InternalCoreModule } from './injector/internal-core-module/index.js';
export { Module } from './injector/module.js';
export * from './inspector/index.js';
export { ContextUtils, ParamProperties } from './helpers/context-utils.js';
export { ExecutionContextHost } from './helpers/execution-context-host.js';
export { HandlerMetadataStorage } from './helpers/handler-metadata-storage.js';
export { loadAdapter } from './helpers/load-adapter.js';
export { optionalRequire } from './helpers/optional-require.js';
export { RouterMethodFactory } from './helpers/router-method-factory.js';
export { makeSafeInstanceDecorator } from './helpers/safe-instance-decorator.js';
export { ParamsMetadata } from './helpers/interfaces/index.js';
export { FORBIDDEN_MESSAGE } from './guards/constants.js';
export { GuardsConsumer } from './guards/guards-consumer.js';
export { GuardsContextCreator } from './guards/guards-context-creator.js';
export { ParamsTokenFactory } from './pipes/params-token-factory.js';
export { PipesConsumer } from './pipes/pipes-consumer.js';
export { PipesContextCreator } from './pipes/pipes-context-creator.js';
export { InterceptorsConsumer } from './interceptors/interceptors-consumer.js';
export { InterceptorsContextCreator } from './interceptors/interceptors-context-creator.js';
export { BaseExceptionFilterContext } from './exceptions/base-exception-filter-context.js';
export { LegacyRouteConverter } from './router/legacy-route-converter.js';
export { REQUEST_CONTEXT_ID } from './router/request/request-constants.js';
export { NoopGraphInspector } from './inspector/noop-graph-inspector.js';
export { UuidFactory, UuidFactoryMode } from './inspector/uuid-factory.js';
export { ModuleDefinition } from './interfaces/module-definition.interface.js';
export { ModuleOverride } from './interfaces/module-override.interface.js';
