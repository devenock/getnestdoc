import { GraphInspector } from './graph-inspector.js';
const noop = () => { };
export const NoopGraphInspector = new Proxy(GraphInspector.prototype, {
    get: () => noop,
});
