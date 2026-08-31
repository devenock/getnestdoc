import * as ts from 'typescript';
import { PluginOptions } from '../merge-options.js';
import { AbstractFileVisitor } from './abstract.visitor.js';
type ClassMetadata = Record<string, ts.ObjectLiteralExpression>;
export declare class ControllerClassVisitor extends AbstractFileVisitor {
    private readonly _collectedMetadata;
    private readonly _typeImports;
    get typeImports(): Record<string, string>;
    collectedMetadata(): Array<[
        ts.CallExpression,
        Record<string, ClassMetadata>
    ]>;
    visit(sourceFile: ts.SourceFile, ctx: ts.TransformationContext, program: ts.Program, options: PluginOptions): ts.Node;
    addDecoratorToNode(factory: ts.NodeFactory, compilerNode: ts.MethodDeclaration, typeChecker: ts.TypeChecker, options: PluginOptions, sourceFile: ts.SourceFile, metadata: ClassMetadata): ts.MethodDeclaration;
    createApiOperationDecorator(factory: ts.NodeFactory, node: ts.MethodDeclaration, decorators: readonly ts.Decorator[], options: PluginOptions, sourceFile: ts.SourceFile, typeChecker: ts.TypeChecker, metadata: ClassMetadata): ts.Decorator[];
    createApiResponseDecorator(factory: ts.NodeFactory, node: ts.MethodDeclaration, options: PluginOptions, metadata: ClassMetadata): ts.Decorator[];
    createApiQueryDecorators(factory: ts.NodeFactory, node: ts.MethodDeclaration, methodDecorators: readonly ts.Decorator[], options: PluginOptions): ts.Decorator[];
    createApiParamDecorators(factory: ts.NodeFactory, node: ts.MethodDeclaration, methodDecorators: readonly ts.Decorator[], options: PluginOptions, typeChecker: ts.TypeChecker): ts.Decorator[];
    private getJSDocDescriptionOfParameter;
    private isParameterOptional;
    createDecoratorObjectLiteralExpr(factory: ts.NodeFactory, node: ts.MethodDeclaration, typeChecker: ts.TypeChecker, existingProperties: ts.NodeArray<ts.PropertyAssignment>, hostFilename: string, metadata: ClassMetadata, options: PluginOptions): ts.ObjectLiteralExpression;
    createTypePropertyAssignment(factory: ts.NodeFactory, node: ts.MethodDeclaration, typeChecker: ts.TypeChecker, existingProperties: ts.NodeArray<ts.PropertyAssignment>, hostFilename: string, options: PluginOptions): ts.PropertyAssignment;
    createStatusPropertyAssignment(factory: ts.NodeFactory, node: ts.MethodDeclaration, existingProperties: ts.NodeArray<ts.PropertyAssignment>): ts.PropertyAssignment;
    getStatusCodeIdentifier(factory: ts.NodeFactory, node: ts.MethodDeclaration): any;
    private normalizeImportPath;
    private isSuccessOrRedirectApiResponseArg;
}
export {};
