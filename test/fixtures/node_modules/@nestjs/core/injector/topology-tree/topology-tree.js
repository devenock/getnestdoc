import { TreeNode } from './tree-node.js';
export class TopologyTree {
    root;
    links = new Map();
    constructor(moduleRef) {
        this.root = new TreeNode({
            value: moduleRef,
            parent: null,
        });
        this.links.set(moduleRef, this.root);
        this.traverseAndMapToTree(this.root);
    }
    walk(callback) {
        function walkNode(node, depth = 1) {
            callback(node.value, depth);
            node.children.forEach(child => walkNode(child, depth + 1));
        }
        walkNode(this.root);
    }
    traverseAndMapToTree(node, depth = 1) {
        if (!node.value.imports) {
            return;
        }
        node.value.imports.forEach(child => {
            if (!child) {
                return;
            }
            if (this.links.has(child)) {
                const existingSubtree = this.links.get(child);
                if (node.hasCycleWith(child)) {
                    return;
                }
                const existingDepth = existingSubtree.getDepth();
                if (existingDepth < depth) {
                    existingSubtree.relink(node);
                }
                return;
            }
            const childNode = new TreeNode({
                value: child,
                parent: node,
            });
            node.addChild(childNode);
            this.links.set(child, childNode);
            this.traverseAndMapToTree(childNode, depth + 1);
        });
    }
}
