import { HttpStatus } from '@nestjs/common';
import { compact, head } from 'es-toolkit/compat';
import { posix } from 'path';
import * as ts from 'typescript';
import { ApiOperation, ApiParam, ApiQuery, ApiResponse } from '../../decorators/index.js';
import { OPENAPI_NAMESPACE } from '../plugin-constants.js';
import { collectExistingApiParamNames, createLiteralFromAnyValue, getDecoratorArguments, getDecoratorName, getJSDocParamDescriptionsOfNode, getMainCommentOfNode, getNamedParamDecoratorArg, getTsDocErrorsOfNode, getTsDocTagsOfNode } from '../utils/ast-utils.js';
import { convertPath, getDecoratorOrUndefinedByNames, getStringLiteralUnionValues, getTypeReferenceAsString, hasPropertyKey } from '../utils/plugin-utils.js';
import { resolvePluginOptionsForFile } from '../utils/module-format.util.js';
import { typeReferenceToIdentifier } from '../utils/type-reference-to-identifier.util.js';
import { AbstractFileVisitor } from './abstract.visitor.js';
export class ControllerClassVisitor extends AbstractFileVisitor {
    constructor() {
        super(...arguments);
        this._collectedMetadata = {};
        this._typeImports = {};
    }
    get typeImports() {
        return this._typeImports;
    }
    collectedMetadata() {
        return this.buildMetadataImports(this._collectedMetadata);
    }
    visit(sourceFile, ctx, program, options) {
        options = resolvePluginOptionsForFile(options, sourceFile, program.getCompilerOptions());
        const typeChecker = program.getTypeChecker();
        this._hoistedTypeImports.clear();
        if (!options.readonly) {
            sourceFile = this.updateImports(sourceFile, ctx.factory, program, options);
        }
        const visitNode = (node) => {
            if (ts.isMethodDeclaration(node)) {
                try {
                    const metadata = {};
                    const updatedNode = this.addDecoratorToNode(ctx.factory, node, typeChecker, options, sourceFile, metadata);
                    if (!options.readonly) {
                        return updatedNode;
                    }
                    else {
                        const filePath = this.normalizeImportPath(options.pathToSource, sourceFile.fileName);
                        this.registerOutputExtension(filePath, sourceFile, options);
                        if (!this._collectedMetadata[filePath]) {
                            this._collectedMetadata[filePath] = {};
                        }
                        const parent = node.parent;
                        const clsName = parent.name?.getText();
                        if (clsName) {
                            if (!this._collectedMetadata[filePath][clsName]) {
                                this._collectedMetadata[filePath][clsName] = {};
                            }
                            Object.assign(this._collectedMetadata[filePath][clsName], metadata);
                        }
                    }
                }
                catch {
                    if (!options.readonly) {
                        return node;
                    }
                }
            }
            if (options.readonly) {
                ts.forEachChild(node, visitNode);
            }
            else {
                return ts.visitEachChild(node, visitNode, ctx);
            }
        };
        const visitedSourceFile = ts.visitNode(sourceFile, visitNode);
        if (options.readonly) {
            return visitedSourceFile;
        }
        return this.insertHoistedTypeImports(visitedSourceFile, ctx.factory);
    }
    addDecoratorToNode(factory, compilerNode, typeChecker, options, sourceFile, metadata) {
        const hostFilename = sourceFile.fileName;
        const decorators = ts.canHaveDecorators(compilerNode) && ts.getDecorators(compilerNode);
        if (!decorators) {
            return compilerNode;
        }
        const apiOperationDecoratorsArray = this.createApiOperationDecorator(factory, compilerNode, decorators, options, sourceFile, typeChecker, metadata);
        const apiResponseDecoratorsArray = this.createApiResponseDecorator(factory, compilerNode, options, metadata);
        const apiQueryDecoratorsArray = this.createApiQueryDecorators(factory, compilerNode, decorators, options);
        const apiParamDecoratorsArray = this.createApiParamDecorators(factory, compilerNode, decorators, options, typeChecker);
        const removeExistingApiOperationDecorator = apiOperationDecoratorsArray.length > 0;
        const existingDecorators = removeExistingApiOperationDecorator
            ? decorators.filter((item) => getDecoratorName(item) !== ApiOperation.name)
            : decorators;
        const hasExplicitApiResponseDecorator = decorators.some((item) => {
            try {
                const decoratorName = getDecoratorName(item);
                if (decoratorName === ApiResponse.name) {
                    return this.isSuccessOrRedirectApiResponseArg(item, typeChecker);
                }
                const statusNameMatch = decoratorName.match(/^Api(.+)Response$/);
                if (!statusNameMatch)
                    return false;
                const statusKey = statusNameMatch[1]
                    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
                    .toUpperCase();
                const status = Number(HttpStatus[statusKey]);
                return isNaN(status) || status < 400;
            }
            catch {
                return false;
            }
        });
        const modifiers = ts.getModifiers(compilerNode) ?? [];
        const objectLiteralExpr = this.createDecoratorObjectLiteralExpr(factory, compilerNode, typeChecker, factory.createNodeArray(), hostFilename, metadata, options);
        const autoGeneratedApiResponseDecorators = hasExplicitApiResponseDecorator
            ? []
            : [
                factory.createDecorator(factory.createCallExpression(factory.createIdentifier(`${OPENAPI_NAMESPACE}.${ApiResponse.name}`), undefined, [
                    factory.createObjectLiteralExpression(objectLiteralExpr.properties)
                ]))
            ];
        const updatedDecorators = [
            ...apiOperationDecoratorsArray,
            ...apiResponseDecoratorsArray,
            ...apiQueryDecoratorsArray,
            ...apiParamDecoratorsArray,
            ...existingDecorators,
            ...autoGeneratedApiResponseDecorators
        ];
        if (!options.readonly) {
            return factory.updateMethodDeclaration(compilerNode, [...updatedDecorators, ...modifiers], compilerNode.asteriskToken, compilerNode.name, compilerNode.questionToken, compilerNode.typeParameters, compilerNode.parameters, compilerNode.type, compilerNode.body);
        }
        else {
            return compilerNode;
        }
    }
    createApiOperationDecorator(factory, node, decorators, options, sourceFile, typeChecker, metadata) {
        if (!options.introspectComments) {
            return [];
        }
        const apiOperationDecorator = getDecoratorOrUndefinedByNames([ApiOperation.name], decorators, factory);
        let apiOperationExistingProps = undefined;
        if (apiOperationDecorator && !options.readonly) {
            const apiOperationExpr = head(getDecoratorArguments(apiOperationDecorator));
            if (apiOperationExpr) {
                apiOperationExistingProps =
                    apiOperationExpr.properties;
            }
        }
        const extractedComments = getMainCommentOfNode(node);
        if (!extractedComments) {
            return [];
        }
        const properties = [
            ...(apiOperationExistingProps ?? factory.createNodeArray())
        ];
        const tags = getTsDocTagsOfNode(node, typeChecker);
        const existingPropsArray = factory.createNodeArray(apiOperationExistingProps);
        const hasRemarksKey = hasPropertyKey('description', existingPropsArray);
        const unshiftIfNotExisting = (key, value) => {
            if (hasPropertyKey(key, existingPropsArray)) {
                return;
            }
            properties.unshift(factory.createPropertyAssignment(key, factory.createStringLiteral(value)));
        };
        if (!hasRemarksKey && tags.remarks) {
            const remarksPropertyAssignment = factory.createPropertyAssignment('description', createLiteralFromAnyValue(factory, tags.remarks));
            properties.push(remarksPropertyAssignment);
            if (options.controllerKeyOfComment === 'description') {
                unshiftIfNotExisting('summary', extractedComments);
            }
            else {
                unshiftIfNotExisting(options.controllerKeyOfComment, extractedComments);
            }
        }
        else {
            unshiftIfNotExisting(options.controllerKeyOfComment, extractedComments);
        }
        const hasDeprecatedKey = hasPropertyKey('deprecated', factory.createNodeArray(apiOperationExistingProps));
        if (!hasDeprecatedKey && tags.deprecated) {
            const deprecatedPropertyAssignment = factory.createPropertyAssignment('deprecated', createLiteralFromAnyValue(factory, tags.deprecated));
            properties.push(deprecatedPropertyAssignment);
        }
        const objectLiteralExpr = factory.createObjectLiteralExpression(compact(properties));
        const apiOperationDecoratorArguments = factory.createNodeArray([objectLiteralExpr]);
        const methodKey = node.name.getText();
        if (metadata[methodKey]) {
            const existingObjectLiteralExpr = metadata[methodKey];
            const existingProperties = existingObjectLiteralExpr.properties;
            const updatedProperties = factory.createNodeArray([
                ...existingProperties,
                ...compact(properties)
            ]);
            const updatedObjectLiteralExpr = factory.createObjectLiteralExpression(updatedProperties);
            metadata[methodKey] = updatedObjectLiteralExpr;
        }
        else {
            metadata[methodKey] = objectLiteralExpr;
        }
        if (apiOperationDecorator) {
            const expr = apiOperationDecorator.expression;
            const updatedCallExpr = factory.updateCallExpression(expr, expr.expression, undefined, apiOperationDecoratorArguments);
            return [factory.updateDecorator(apiOperationDecorator, updatedCallExpr)];
        }
        else {
            return [
                factory.createDecorator(factory.createCallExpression(factory.createIdentifier(`${OPENAPI_NAMESPACE}.${ApiOperation.name}`), undefined, apiOperationDecoratorArguments))
            ];
        }
    }
    createApiResponseDecorator(factory, node, options, metadata) {
        if (!options.introspectComments) {
            return [];
        }
        const tags = getTsDocErrorsOfNode(node);
        if (!tags.length) {
            return [];
        }
        return tags.map((tag) => {
            const properties = [];
            properties.push(factory.createPropertyAssignment('status', factory.createNumericLiteral(tag.status)));
            properties.push(factory.createPropertyAssignment('description', factory.createStringLiteral(tag.description)));
            const objectLiteralExpr = factory.createObjectLiteralExpression(compact(properties));
            const methodKey = node.name.getText();
            metadata[methodKey] = objectLiteralExpr;
            const apiResponseDecoratorArguments = factory.createNodeArray([objectLiteralExpr]);
            return factory.createDecorator(factory.createCallExpression(factory.createIdentifier(`${OPENAPI_NAMESPACE}.${ApiResponse.name}`), undefined, apiResponseDecoratorArguments));
        });
    }
    createApiQueryDecorators(factory, node, methodDecorators, options) {
        const parameters = node.parameters;
        if (!parameters || parameters.length === 0) {
            return [];
        }
        const paramDescriptions = options.introspectComments
            ? getJSDocParamDescriptionsOfNode(node)
            : {};
        const existingApiQueryNames = collectExistingApiParamNames(methodDecorators, ApiQuery.name);
        if (existingApiQueryNames === null) {
            return [];
        }
        const generated = [];
        for (const parameter of parameters) {
            const queryName = getNamedParamDecoratorArg(parameter, 'Query');
            if (queryName === undefined) {
                continue;
            }
            if (existingApiQueryNames.has(queryName)) {
                continue;
            }
            const isOptional = this.isParameterOptional(parameter);
            const description = this.getJSDocDescriptionOfParameter(parameter, paramDescriptions);
            if (!isOptional && !description) {
                continue;
            }
            const properties = [
                factory.createPropertyAssignment('name', factory.createStringLiteral(queryName))
            ];
            if (isOptional) {
                properties.push(factory.createPropertyAssignment('required', factory.createFalse()));
            }
            if (description) {
                properties.push(factory.createPropertyAssignment('description', factory.createStringLiteral(description)));
            }
            const objectLiteral = factory.createObjectLiteralExpression(properties, false);
            generated.push(factory.createDecorator(factory.createCallExpression(factory.createIdentifier(`${OPENAPI_NAMESPACE}.${ApiQuery.name}`), undefined, [objectLiteral])));
            existingApiQueryNames.add(queryName);
        }
        return generated;
    }
    createApiParamDecorators(factory, node, methodDecorators, options, typeChecker) {
        const parameters = node.parameters;
        if (!parameters || parameters.length === 0) {
            return [];
        }
        const paramDescriptions = options.introspectComments
            ? getJSDocParamDescriptionsOfNode(node)
            : {};
        const existingApiParamNames = collectExistingApiParamNames(methodDecorators, ApiParam.name);
        if (existingApiParamNames === null) {
            return [];
        }
        const generated = [];
        for (const parameter of parameters) {
            const paramName = getNamedParamDecoratorArg(parameter, 'Param');
            if (paramName === undefined) {
                continue;
            }
            if (existingApiParamNames.has(paramName)) {
                continue;
            }
            const description = this.getJSDocDescriptionOfParameter(parameter, paramDescriptions);
            let type;
            try {
                type = typeChecker.getTypeAtLocation(parameter);
            }
            catch {
                type = undefined;
            }
            const literalUnion = type ? getStringLiteralUnionValues(type) : undefined;
            const enumValues = literalUnion && literalUnion.values.length > 0
                ? literalUnion.values
                : undefined;
            if (!description && !enumValues) {
                continue;
            }
            const properties = [
                factory.createPropertyAssignment('name', factory.createStringLiteral(paramName))
            ];
            if (description) {
                properties.push(factory.createPropertyAssignment('description', factory.createStringLiteral(description)));
            }
            if (enumValues) {
                properties.push(factory.createPropertyAssignment('enum', factory.createArrayLiteralExpression(enumValues.map((value) => typeof value === 'number'
                    ? factory.createNumericLiteral(value)
                    : factory.createStringLiteral(value)), false)));
            }
            const objectLiteral = factory.createObjectLiteralExpression(properties, false);
            generated.push(factory.createDecorator(factory.createCallExpression(factory.createIdentifier(`${OPENAPI_NAMESPACE}.${ApiParam.name}`), undefined, [objectLiteral])));
            existingApiParamNames.add(paramName);
        }
        return generated;
    }
    getJSDocDescriptionOfParameter(parameter, paramDescriptions) {
        if (!ts.isIdentifier(parameter.name)) {
            return undefined;
        }
        return paramDescriptions[parameter.name.text];
    }
    isParameterOptional(parameter) {
        if (parameter.questionToken) {
            return true;
        }
        if (parameter.initializer) {
            return true;
        }
        if (parameter.type && ts.isUnionTypeNode(parameter.type)) {
            return parameter.type.types.some((t) => t.kind === ts.SyntaxKind.UndefinedKeyword);
        }
        return false;
    }
    createDecoratorObjectLiteralExpr(factory, node, typeChecker, existingProperties = factory.createNodeArray(), hostFilename, metadata, options) {
        let properties = [];
        if (!options.readonly && !options.skipAutoHttpCode) {
            properties = properties.concat(existingProperties, this.createStatusPropertyAssignment(factory, node, existingProperties));
        }
        properties = properties.concat([
            this.createTypePropertyAssignment(factory, node, typeChecker, existingProperties, hostFilename, options)
        ]);
        const objectLiteralExpr = factory.createObjectLiteralExpression(compact(properties));
        const methodKey = node.name.getText();
        const existingExprOrUndefined = metadata[methodKey];
        if (existingExprOrUndefined) {
            const existingProperties = existingExprOrUndefined.properties;
            const updatedProperties = factory.createNodeArray([
                ...existingProperties,
                ...compact(properties)
            ]);
            const updatedObjectLiteralExpr = factory.createObjectLiteralExpression(updatedProperties);
            metadata[methodKey] = updatedObjectLiteralExpr;
        }
        else {
            metadata[methodKey] = objectLiteralExpr;
        }
        return objectLiteralExpr;
    }
    createTypePropertyAssignment(factory, node, typeChecker, existingProperties, hostFilename, options) {
        if (hasPropertyKey('type', existingProperties)) {
            return undefined;
        }
        const signature = typeChecker.getSignatureFromDeclaration(node);
        const type = typeChecker.getReturnTypeOfSignature(signature);
        if (!type) {
            return undefined;
        }
        const typeReferenceDescriptor = getTypeReferenceAsString(type, typeChecker);
        if (!typeReferenceDescriptor.typeName) {
            return undefined;
        }
        if (typeReferenceDescriptor.typeName.includes('node_modules')) {
            return undefined;
        }
        const identifier = typeReferenceToIdentifier(typeReferenceDescriptor, hostFilename, options, factory, type, this._typeImports, this._hoistedTypeImports);
        return factory.createPropertyAssignment('type', identifier);
    }
    createStatusPropertyAssignment(factory, node, existingProperties) {
        if (hasPropertyKey('status', existingProperties)) {
            return undefined;
        }
        const statusNode = this.getStatusCodeIdentifier(factory, node);
        return factory.createPropertyAssignment('status', statusNode);
    }
    getStatusCodeIdentifier(factory, node) {
        const decorators = ts.canHaveDecorators(node) && ts.getDecorators(node);
        const httpCodeDecorator = getDecoratorOrUndefinedByNames(['HttpCode'], decorators, factory);
        if (httpCodeDecorator) {
            const argument = head(getDecoratorArguments(httpCodeDecorator));
            if (argument) {
                return argument;
            }
        }
        const postDecorator = getDecoratorOrUndefinedByNames(['Post'], decorators, factory);
        if (postDecorator) {
            return factory.createIdentifier('201');
        }
        return factory.createIdentifier('200');
    }
    normalizeImportPath(pathToSource, path) {
        let relativePath = posix.relative(convertPath(pathToSource), convertPath(path));
        relativePath = relativePath[0] !== '.' ? './' + relativePath : relativePath;
        return relativePath;
    }
    isSuccessOrRedirectApiResponseArg(decorator, typeChecker) {
        const [firstArg] = getDecoratorArguments(decorator);
        if (!firstArg || !ts.isObjectLiteralExpression(firstArg))
            return true;
        const statusProp = firstArg.properties.find((p) => ts.isPropertyAssignment(p) &&
            ts.isIdentifier(p.name) &&
            p.name.text === 'status');
        if (!statusProp)
            return true;
        const init = statusProp.initializer;
        if (ts.isNumericLiteral(init))
            return Number(init.text) < 400;
        if (ts.isStringLiteral(init)) {
            return (init.text === '1XX' ||
                init.text === '2XX' ||
                init.text === '3XX' ||
                init.text === 'default');
        }
        if (ts.isPropertyAccessExpression(init) ||
            ts.isElementAccessExpression(init)) {
            const constantValue = typeChecker.getConstantValue(init);
            if (typeof constantValue === 'number') {
                return constantValue < 400;
            }
            if (ts.isPropertyAccessExpression(init) &&
                ts.isIdentifier(init.expression) &&
                init.expression.text === 'HttpStatus') {
                const status = HttpStatus[init.name.text];
                if (typeof status === 'number') {
                    return status < 400;
                }
            }
        }
        return true;
    }
}
