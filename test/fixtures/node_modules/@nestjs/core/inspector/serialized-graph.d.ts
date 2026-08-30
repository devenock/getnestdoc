import type { InjectionToken } from '@nestjs/common';
import { Edge } from './interfaces/edge.interface.js';
import { Entrypoint } from './interfaces/entrypoint.interface.js';
import { OrphanedEnhancerDefinition } from './interfaces/extras.interface.js';
import { Node } from './interfaces/node.interface.js';
import { SerializedGraphJson } from './interfaces/serialized-graph-json.interface.js';
import { SerializedGraphMetadata } from './interfaces/serialized-graph-metadata.interface.js';
export type SerializedGraphStatus = 'partial' | 'complete';
type WithOptionalId<T extends Record<'id', string>> = Omit<T, 'id'> & Partial<Pick<T, 'id'>>;
export declare class SerializedGraph {
    private readonly nodes;
    private readonly edges;
    private readonly entrypoints;
    private readonly extras;
    private _status;
    private _metadata?;
    private static readonly INTERNAL_PROVIDERS;
    set status(status: SerializedGraphStatus);
    set metadata(metadata: SerializedGraphMetadata);
    insertNode(nodeDefinition: Node): Node | undefined;
    insertEdge(edgeDefinition: WithOptionalId<Edge>): {
        id: string;
        source: string;
        target: string;
        metadata: ({
            type: "module-to-module";
        } & {
            sourceModuleName: string;
            targetModuleName: string;
        }) | ({
            type: "class-to-class";
            sourceClassName: string;
            targetClassName: string;
            sourceClassToken: InjectionToken;
            targetClassToken: InjectionToken;
            injectionType: "constructor" | "property" | "decorator";
            keyOrIndex?: string | number | symbol;
            internal?: boolean;
        } & {
            sourceModuleName: string;
            targetModuleName: string;
        });
    };
    insertEntrypoint<T>(definition: Entrypoint<T>, parentId: string): void;
    insertOrphanedEnhancer(entry: OrphanedEnhancerDefinition): void;
    insertAttachedEnhancer(nodeId: string): void;
    getNodeById(id: string): Node | undefined;
    toJSON(): SerializedGraphJson;
    toString(): string;
    private generateUuidByEdgeDefinition;
}
export {};
