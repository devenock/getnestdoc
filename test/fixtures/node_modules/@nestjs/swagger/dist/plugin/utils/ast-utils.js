import { DocExcerpt, TSDocParser } from '@microsoft/tsdoc';
import * as ts from 'typescript';
import { ObjectFlags, SyntaxKind, TypeFlags, TypeFormatFlags } from 'typescript';
import { isDynamicallyAdded } from './plugin-utils.js';
export function renderDocNode(docNode) {
    let result = '';
    if (docNode) {
        if (docNode instanceof DocExcerpt) {
            result += docNode.content.toString();
        }
        for (const childNode of docNode.getChildNodes()) {
            result += renderDocNode(childNode);
        }
    }
    return result;
}
export function isArray(type) {
    const symbol = type.getSymbol();
    if (!symbol) {
        return false;
    }
    return symbol.getName() === 'Array' && getTypeArguments(type).length === 1;
}
export function getTypeArguments(type) {
    return type.typeArguments || [];
}
export function isBoolean(type) {
    return (hasFlag(type, TypeFlags.Boolean) || hasFlag(type, TypeFlags.BooleanLiteral));
}
export function isBooleanLiteral(type) {
    return hasFlag(type, TypeFlags.BooleanLiteral) && !type.isUnion();
}
export function isString(type) {
    return hasFlag(type, TypeFlags.String);
}
export function isStringLiteral(type) {
    return hasFlag(type, TypeFlags.StringLiteral) && !type.isUnion();
}
export function isStringMapping(type) {
    return hasFlag(type, TypeFlags.StringMapping);
}
export function isNumber(type) {
    return hasFlag(type, TypeFlags.Number);
}
export function isBigInt(type) {
    return hasFlag(type, TypeFlags.BigInt);
}
export function isInterface(type) {
    return hasObjectFlag(type, ObjectFlags.Interface);
}
export function isEnum(type) {
    const hasEnumFlag = hasFlag(type, TypeFlags.Enum);
    if (hasEnumFlag) {
        return true;
    }
    if (isEnumLiteral(type)) {
        return false;
    }
    const symbol = type.getSymbol();
    if (!symbol) {
        return false;
    }
    const valueDeclaration = symbol.valueDeclaration;
    if (!valueDeclaration) {
        return false;
    }
    return valueDeclaration.kind === SyntaxKind.EnumDeclaration;
}
export function isEnumLiteral(type) {
    return hasFlag(type, TypeFlags.EnumLiteral) && !type.isUnion();
}
export function hasFlag(type, flag) {
    return (type.flags & flag) === flag;
}
export function hasObjectFlag(type, flag) {
    return (type.objectFlags & flag) === flag;
}
export function getText(type, typeChecker, enclosingNode, typeFormatFlags) {
    if (!typeFormatFlags) {
        typeFormatFlags = getDefaultTypeFormatFlags(enclosingNode);
    }
    const compilerNode = !enclosingNode ? undefined : enclosingNode;
    return typeChecker.typeToString(type, compilerNode, typeFormatFlags);
}
export function getDefaultTypeFormatFlags(enclosingNode) {
    let formatFlags = TypeFormatFlags.UseTypeOfFunction |
        TypeFormatFlags.NoTruncation |
        TypeFormatFlags.UseFullyQualifiedType |
        TypeFormatFlags.WriteTypeArgumentsOfSignature;
    if (enclosingNode && enclosingNode.kind === SyntaxKind.TypeAliasDeclaration)
        formatFlags |= TypeFormatFlags.InTypeAlias;
    return formatFlags;
}
export function getDocComment(node) {
    const tsdocParser = new TSDocParser();
    const parserContext = tsdocParser.parseString(node.getFullText());
    return parserContext.docComment;
}
export function getMainCommentOfNode(node) {
    const docComment = getDocComment(node);
    return renderDocNode(docComment.summarySection).trim();
}
export function getJSDocParamDescriptionsOfNode(node) {
    const docComment = getDocComment(node);
    const descriptions = {};
    for (const paramBlock of docComment.params.blocks) {
        const description = renderDocNode(paramBlock.content)
            .replace(/\s+/g, ' ')
            .trim();
        if (paramBlock.parameterName && description) {
            descriptions[paramBlock.parameterName] = description;
        }
    }
    return descriptions;
}
export function parseCommentDocValue(docValue, type) {
    let value = docValue.replace(/'/g, '"').trim();
    if (!type || !isString(type)) {
        try {
            value = JSON.parse(value);
        }
        catch {
        }
    }
    else if (isString(type)) {
        if (value.split(' ').length !== 1 && !value.startsWith('"')) {
            value = null;
        }
        else {
            value = value.replace(/"/g, '');
        }
    }
    return value;
}
export function getTsDocTagsOfNode(node, typeChecker) {
    const docComment = getDocComment(node);
    const tagDefinitions = {
        example: {
            hasProperties: true,
            repeatable: true
        }
    };
    const tagResults = {};
    const introspectTsDocTags = (docComment) => {
        for (const tag in tagDefinitions) {
            const { hasProperties, repeatable } = tagDefinitions[tag];
            const blocks = docComment.customBlocks.filter((block) => block.blockTag.tagName === `@${tag}`);
            if (blocks.length === 0) {
                continue;
            }
            if (repeatable && !tagResults[tag]) {
                tagResults[tag] = [];
            }
            const type = typeChecker.getTypeAtLocation(node);
            if (hasProperties) {
                blocks.forEach((block) => {
                    const docValue = renderDocNode(block.content).split('\n')[0];
                    const value = parseCommentDocValue(docValue, type);
                    if (value !== null) {
                        if (repeatable) {
                            tagResults[tag].push(value);
                        }
                        else {
                            tagResults[tag] = value;
                        }
                    }
                });
            }
            else {
                tagResults[tag] = true;
            }
        }
        if (docComment.remarksBlock) {
            tagResults['remarks'] = renderDocNode(docComment.remarksBlock.content).trim();
        }
        if (docComment.deprecatedBlock) {
            tagResults['deprecated'] = true;
        }
    };
    introspectTsDocTags(docComment);
    return tagResults;
}
export function getTsDocErrorsOfNode(node) {
    const tsdocParser = new TSDocParser();
    const parserContext = tsdocParser.parseString(node.getFullText());
    const docComment = parserContext.docComment;
    const tagResults = [];
    const errorParsingRegex = /{(\d+)} (.*)/;
    const introspectTsDocTags = (docComment) => {
        const blocks = docComment.customBlocks.filter((block) => block.blockTag.tagName === '@throws');
        blocks.forEach((block) => {
            try {
                const docValue = renderDocNode(block.content).split('\n')[0].trim();
                const match = docValue.match(errorParsingRegex);
                tagResults.push({
                    status: Number(match[1]),
                    description: match[2]
                });
            }
            catch {
            }
        });
    };
    introspectTsDocTags(docComment);
    return tagResults;
}
export function getDecoratorArguments(decorator) {
    const callExpression = decorator.expression;
    return (callExpression && callExpression.arguments) || [];
}
export function getDecoratorName(decorator) {
    const isDecoratorFactory = decorator.expression.kind === SyntaxKind.CallExpression;
    if (isDecoratorFactory) {
        const callExpression = decorator.expression;
        const identifier = callExpression
            .expression;
        if (isDynamicallyAdded(identifier)) {
            return undefined;
        }
        return getIdentifierFromName(callExpression.expression).getText();
    }
    return getIdentifierFromName(decorator.expression).getText();
}
export function collectExistingApiParamNames(methodDecorators, apiDecoratorName) {
    const names = new Set();
    for (const decorator of methodDecorators) {
        let decoratorName;
        try {
            decoratorName = getDecoratorName(decorator);
        }
        catch {
            continue;
        }
        if (decoratorName !== apiDecoratorName) {
            continue;
        }
        const optionsExpr = getDecoratorArguments(decorator)[0];
        if (!optionsExpr || !ts.isObjectLiteralExpression(optionsExpr)) {
            return null;
        }
        const nameProp = optionsExpr.properties.find((p) => ts.isPropertyAssignment(p) &&
            p.name !== undefined &&
            ((ts.isIdentifier(p.name) && p.name.text === 'name') ||
                (ts.isStringLiteral(p.name) && p.name.text === 'name')));
        if (nameProp && ts.isStringLiteral(nameProp.initializer)) {
            names.add(nameProp.initializer.text);
        }
        else {
            return null;
        }
    }
    return names;
}
export function getNamedParamDecoratorArg(parameter, decoratorName) {
    const paramDecorators = (ts.canHaveDecorators(parameter) && ts.getDecorators(parameter)) || [];
    const decorator = paramDecorators.find((d) => {
        try {
            return getDecoratorName(d) === decoratorName;
        }
        catch {
            return false;
        }
    });
    if (!decorator) {
        return undefined;
    }
    const firstArg = getDecoratorArguments(decorator)[0];
    if (!firstArg || !ts.isStringLiteral(firstArg)) {
        return undefined;
    }
    return firstArg.text;
}
function getIdentifierFromName(expression) {
    const identifier = getNameFromExpression(expression);
    if (identifier && identifier.kind !== SyntaxKind.Identifier) {
        throw new Error();
    }
    return identifier;
}
function getNameFromExpression(expression) {
    if (expression && expression.kind === SyntaxKind.PropertyAccessExpression) {
        return expression.name;
    }
    return expression;
}
export function findNullableTypeFromUnion(typeNode, typeChecker) {
    return typeNode.types.find((tNode) => hasFlag(typeChecker.getTypeAtLocation(tNode), TypeFlags.Null));
}
export function createBooleanLiteral(factory, flag) {
    return flag ? factory.createTrue() : factory.createFalse();
}
export function createPrimitiveLiteral(factory, item, typeOfItem = typeof item) {
    switch (typeOfItem) {
        case 'boolean':
            return createBooleanLiteral(factory, item);
        case 'number': {
            if (item < 0) {
                return factory.createPrefixUnaryExpression(SyntaxKind.MinusToken, factory.createNumericLiteral(Math.abs(item)));
            }
            return factory.createNumericLiteral(item);
        }
        case 'string':
            return factory.createStringLiteral(item);
    }
}
export function createLiteralFromAnyValue(factory, item) {
    if (Array.isArray(item)) {
        return factory.createArrayLiteralExpression(item.map((item) => createLiteralFromAnyValue(factory, item)));
    }
    if (item === null) {
        return factory.createNull();
    }
    if (typeof item === 'object') {
        return factory.createObjectLiteralExpression(Object.entries(item).map(([key, value]) => factory.createPropertyAssignment(factory.createStringLiteral(key), createLiteralFromAnyValue(factory, value))));
    }
    return createPrimitiveLiteral(factory, item);
}
