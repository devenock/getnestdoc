import { Logger, type LoggerService } from '@nestjs/common';
import { GraphInspector } from '../inspector/graph-inspector.js';
import { NestContainer } from './container.js';
import { Injector } from './injector.js';
import { Module } from './module.js';
export declare class InstanceLoader<TInjector extends Injector = Injector> {
    protected readonly container: NestContainer;
    protected readonly injector: TInjector;
    protected readonly graphInspector: GraphInspector;
    private logger;
    constructor(container: NestContainer, injector: TInjector, graphInspector: GraphInspector, logger?: LoggerService);
    setLogger(logger: Logger): void;
    createInstancesOfDependencies(modules?: Map<string, Module>): Promise<void>;
    private createPrototypes;
    private createInstances;
    private createPrototypesOfProviders;
    private createInstancesOfProviders;
    private createPrototypesOfControllers;
    private createInstancesOfControllers;
    private createPrototypesOfInjectables;
    private createInstancesOfInjectables;
    private isModuleWhitelisted;
}
