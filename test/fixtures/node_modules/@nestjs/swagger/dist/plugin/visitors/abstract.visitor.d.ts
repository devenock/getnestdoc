import * as ts from 'typescript';
import { PluginOptions } from '../merge-options.js';
export declare class AbstractFileVisitor {
    protected readonly _fileOutputExtensions: Record<string, string>;
    protected readonly _hoistedTypeImports: Map<string, string>;
    protected insertHoistedTypeImports(sourceFile: ts.SourceFile, factory: ts.NodeFactory): ts.SourceFile;
    protected registerOutputExtension(filePath: string, sourceFile: ts.SourceFile, options: PluginOptions): void;
    protected buildMetadataImports<T>(collectedMetadata: Record<string, T>): Array<[ts.CallExpression, T]>;
    updateImports(sourceFile: ts.SourceFile, factory: ts.NodeFactory | undefined, program: ts.Program, options?: PluginOptions): ts.SourceFile;
}
