import { ApplicationConfig } from '../application-config.js';
import { ExternalContextCreator } from '../helpers/external-context-creator.js';
import { HttpAdapterHost } from '../helpers/http-adapter-host.js';
import { INQUIRER } from '../injector/inquirer/inquirer-constants.js';
import { LazyModuleLoader } from '../injector/lazy-module-loader/lazy-module-loader.js';
import { ModuleRef } from '../injector/module-ref.js';
import { ModulesContainer } from '../injector/modules-container.js';
import { REQUEST } from '../router/request/request-constants.js';
import { Reflector } from '../services/reflector.service.js';
import { DeterministicUuidRegistry } from './deterministic-uuid-registry.js';
export class SerializedGraph {
    nodes = new Map();
    edges = new Map();
    entrypoints = new Map();
    extras = {
        orphanedEnhancers: [],
        attachedEnhancers: [],
    };
    _status = 'complete';
    _metadata;
    static INTERNAL_PROVIDERS = [
        ApplicationConfig,
        ModuleRef,
        HttpAdapterHost,
        LazyModuleLoader,
        ExternalContextCreator,
        ModulesContainer,
        Reflector,
        SerializedGraph,
        HttpAdapterHost.name,
        Reflector.name,
        REQUEST,
        INQUIRER,
    ];
    set status(status) {
        this._status = status;
    }
    set metadata(metadata) {
        this._metadata = metadata;
    }
    insertNode(nodeDefinition) {
        if (nodeDefinition.metadata.type === 'provider' &&
            SerializedGraph.INTERNAL_PROVIDERS.includes(nodeDefinition.metadata.token)) {
            nodeDefinition.metadata = {
                ...nodeDefinition.metadata,
                internal: true,
            };
        }
        if (this.nodes.has(nodeDefinition.id)) {
            return this.nodes.get(nodeDefinition.id);
        }
        this.nodes.set(nodeDefinition.id, nodeDefinition);
        return nodeDefinition;
    }
    insertEdge(edgeDefinition) {
        if (edgeDefinition.metadata.type === 'class-to-class' &&
            (SerializedGraph.INTERNAL_PROVIDERS.includes(edgeDefinition.metadata.sourceClassToken) ||
                SerializedGraph.INTERNAL_PROVIDERS.includes(edgeDefinition.metadata.targetClassToken))) {
            edgeDefinition.metadata = {
                ...edgeDefinition.metadata,
                internal: true,
            };
        }
        const id = edgeDefinition.id ?? this.generateUuidByEdgeDefinition(edgeDefinition);
        const edge = {
            ...edgeDefinition,
            id,
        };
        this.edges.set(id, edge);
        return edge;
    }
    insertEntrypoint(definition, parentId) {
        if (this.entrypoints.has(parentId)) {
            const existingCollection = this.entrypoints.get(parentId);
            existingCollection.push(definition);
        }
        else {
            this.entrypoints.set(parentId, [definition]);
        }
    }
    insertOrphanedEnhancer(entry) {
        this.extras.orphanedEnhancers.push(entry);
    }
    insertAttachedEnhancer(nodeId) {
        this.extras.attachedEnhancers.push({
            nodeId,
        });
    }
    getNodeById(id) {
        return this.nodes.get(id);
    }
    toJSON() {
        const json = {
            nodes: Object.fromEntries(this.nodes),
            edges: Object.fromEntries(this.edges),
            entrypoints: Object.fromEntries(this.entrypoints),
            extras: this.extras,
        };
        if (this._status) {
            json['status'] = this._status;
        }
        if (this._metadata) {
            json['metadata'] = this._metadata;
        }
        return json;
    }
    toString() {
        const replacer = (key, value) => {
            if (typeof value === 'symbol') {
                return value.toString();
            }
            return typeof value === 'function' ? (value.name ?? 'Function') : value;
        };
        return JSON.stringify(this.toJSON(), replacer, 2);
    }
    generateUuidByEdgeDefinition(edgeDefinition) {
        return DeterministicUuidRegistry.get(JSON.stringify(edgeDefinition));
    }
}
