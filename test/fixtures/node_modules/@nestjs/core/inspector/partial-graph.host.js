export class PartialGraphHost {
    static partialGraph;
    static toJSON() {
        return this.partialGraph?.toJSON();
    }
    static toString() {
        return this.partialGraph?.toString();
    }
    static register(partialGraph) {
        this.partialGraph = partialGraph;
    }
}
