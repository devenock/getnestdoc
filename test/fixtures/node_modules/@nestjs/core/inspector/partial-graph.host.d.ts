import { SerializedGraph } from './serialized-graph.js';
export declare class PartialGraphHost {
    private static partialGraph;
    static toJSON(): import("./interfaces/serialized-graph-json.interface.js").SerializedGraphJson;
    static toString(): string;
    static register(partialGraph: SerializedGraph): void;
}
