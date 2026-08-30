import { NestContainer } from '../injector/container.js';
import { InstanceWrapper } from '../injector/instance-wrapper.js';
import { Module } from '../injector/module.js';
import { EnhancerMetadataCacheEntry } from './interfaces/enhancer-metadata-cache-entry.interface.js';
import { Entrypoint } from './interfaces/entrypoint.interface.js';
import { OrphanedEnhancerDefinition } from './interfaces/extras.interface.js';
import { Node } from './interfaces/node.interface.js';
export declare class GraphInspector {
    private readonly container;
    private readonly graph;
    private readonly enhancersMetadataCache;
    constructor(container: NestContainer);
    inspectModules(modules?: Map<string, Module>): void;
    registerPartial(error: unknown): void;
    inspectInstanceWrapper<T = any>(source: InstanceWrapper<T>, moduleRef: Module): void;
    insertEnhancerMetadataCache(entry: EnhancerMetadataCacheEntry): void;
    insertOrphanedEnhancer(entry: OrphanedEnhancerDefinition): void;
    insertAttachedEnhancer(wrapper: InstanceWrapper): void;
    insertEntrypointDefinition<T>(definition: Entrypoint<T>, parentId: string): void;
    insertClassNode(moduleRef: Module, wrapper: InstanceWrapper, type: Exclude<Node['metadata']['type'], 'module'>): void;
    private insertModuleNode;
    private insertModuleToModuleEdges;
    private insertEnhancerEdge;
    private insertClassToClassEdge;
    private insertClassNodes;
}
