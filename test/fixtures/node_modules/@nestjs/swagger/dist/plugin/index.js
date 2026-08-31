import { before } from './compiler-plugin.js';
export * from './compiler-plugin.js';
export * from './visitors/readonly.visitor.js';
export default (program, options) => before(options, program);
