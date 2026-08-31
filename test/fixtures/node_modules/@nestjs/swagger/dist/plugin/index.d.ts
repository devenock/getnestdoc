import type * as ts from 'typescript';
export * from './compiler-plugin.js';
export * from './visitors/readonly.visitor.js';
declare const _default: (program: ts.Program, options?: Record<string, any>) => (ctx: ts.TransformationContext) => ts.Transformer<any>;
export default _default;
