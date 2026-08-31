import * as ts from 'typescript';
import { PluginOptions } from '../merge-options.js';
export declare function typeReferenceToIdentifier(typeReferenceDescriptor: {
    typeName: string;
    isArray?: boolean;
    arrayDepth?: number;
}, hostFilename: string, options: PluginOptions, factory: ts.NodeFactory, type: ts.Type, typeImports: Record<string, string>, hoistedTypeImports?: Map<string, string>): ts.Identifier;
