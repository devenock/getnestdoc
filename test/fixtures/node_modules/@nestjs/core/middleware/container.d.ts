import type { InjectionToken } from '@nestjs/common';
import { NestContainer } from '../injector/container.js';
import { InstanceWrapper } from '../injector/instance-wrapper.js';
import type { MiddlewareConfiguration } from '@nestjs/common/internal';
export declare class MiddlewareContainer {
    private readonly container;
    private readonly middleware;
    private readonly configurationSets;
    constructor(container: NestContainer);
    getMiddlewareCollection(moduleKey: string): Map<InjectionToken, InstanceWrapper>;
    getConfigurations(): Map<string, Set<MiddlewareConfiguration>>;
    insertConfig(configList: MiddlewareConfiguration[], moduleKey: string): void;
    private getTargetConfig;
}
