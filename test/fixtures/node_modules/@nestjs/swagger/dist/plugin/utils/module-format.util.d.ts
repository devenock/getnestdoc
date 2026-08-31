import * as ts from 'typescript';
import { PluginOptions } from '../merge-options.js';
export declare function resolvePluginOptionsForFile(options: PluginOptions, sourceFile: ts.SourceFile, compilerOptions: ts.CompilerOptions): PluginOptions;
export declare function isEsmOutputFile(sourceFile: ts.SourceFile, compilerOptions: ts.CompilerOptions, options?: PluginOptions): boolean;
