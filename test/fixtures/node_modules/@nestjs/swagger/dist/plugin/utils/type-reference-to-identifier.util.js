import { posix } from 'path';
import * as ts from 'typescript';
import { pluginDebugLogger } from '../plugin-debug-logger.js';
import { convertPath, extractTypeArgumentIfArray, getOutputExtension, replaceImportPath } from './plugin-utils.js';
export function typeReferenceToIdentifier(typeReferenceDescriptor, hostFilename, options, factory, type, typeImports, hoistedTypeImports) {
    if (options.readonly) {
        assertReferenceableType(type, typeReferenceDescriptor.typeName, hostFilename, options);
    }
    const { typeReference, importPath, typeName } = replaceImportPath(typeReferenceDescriptor.typeName, hostFilename, options);
    let identifier;
    if (options.readonly && typeReference?.includes('import')) {
        if (!typeImports[importPath]) {
            typeImports[importPath] = typeReference;
        }
        let ref = `t["${importPath}"].${typeName}`;
        if (typeReferenceDescriptor.isArray) {
            ref = wrapTypeInArray(ref, typeReferenceDescriptor.arrayDepth);
        }
        identifier = factory.createIdentifier(ref);
    }
    else if (options.readonly &&
        !typeReference?.includes('import') &&
        isSameFileUserType(type, hostFilename)) {
        const sameFileImportPath = buildSameFileImportPath(hostFilename, options);
        const syntheticImportRef = `await import("${sameFileImportPath}")`;
        if (!typeImports[sameFileImportPath]) {
            typeImports[sameFileImportPath] = syntheticImportRef;
        }
        let ref = `t["${sameFileImportPath}"].${typeReferenceDescriptor.typeName}`;
        if (typeReferenceDescriptor.isArray) {
            ref = wrapTypeInArray(ref, typeReferenceDescriptor.arrayDepth);
        }
        identifier = factory.createIdentifier(ref);
    }
    else if (!options.readonly &&
        options.esmCompatible &&
        typeName &&
        importPath &&
        hoistedTypeImports) {
        let elementType = type;
        for (let depth = typeReferenceDescriptor.arrayDepth ?? 0; depth > 0; depth--) {
            const arrayTuple = extractTypeArgumentIfArray(elementType);
            if (!arrayTuple) {
                break;
            }
            elementType = arrayTuple.type;
        }
        let ref = isSameFileUserType(elementType, hostFilename)
            ? typeName
            : `${hoistTypeImport(importPath, hoistedTypeImports)}.${typeName}`;
        if (typeReferenceDescriptor.isArray) {
            ref = wrapTypeInArray(ref, typeReferenceDescriptor.arrayDepth);
        }
        identifier = factory.createIdentifier(ref);
    }
    else {
        let ref = typeReference;
        if (typeReferenceDescriptor.isArray) {
            ref = wrapTypeInArray(ref, typeReferenceDescriptor.arrayDepth);
        }
        identifier = factory.createIdentifier(ref);
    }
    return identifier;
}
function hoistTypeImport(importPath, hoistedTypeImports) {
    let namespaceName = hoistedTypeImports.get(importPath);
    if (!namespaceName) {
        namespaceName = `openapi_import_${hoistedTypeImports.size + 1}`;
        hoistedTypeImports.set(importPath, namespaceName);
    }
    return namespaceName;
}
function isSameFileUserType(type, hostFilename) {
    if (!type.symbol || !type.symbol.declarations) {
        return false;
    }
    const normalizedHost = convertPath(hostFilename);
    return type.symbol.declarations.some((decl) => {
        const declFile = convertPath(decl.getSourceFile().fileName);
        return (declFile === normalizedHost && !decl.getSourceFile().isDeclarationFile);
    });
}
function buildSameFileImportPath(hostFilename, options) {
    const from = convertPath(options.pathToSource);
    const to = convertPath(hostFilename).replace(/\.[jt]s$/, '');
    let relativePath = posix.relative(from, to);
    if (relativePath[0] !== '.') {
        relativePath = './' + relativePath;
    }
    if (options.esmCompatible) {
        relativePath += getOutputExtension(hostFilename);
    }
    return relativePath;
}
function wrapTypeInArray(typeRef, arrayDepth) {
    for (let i = 0; i < arrayDepth; i++) {
        typeRef = `[${typeRef}]`;
    }
    return typeRef;
}
function assertReferenceableType(type, parsedTypeName, hostFilename, options) {
    if (!type.symbol) {
        return true;
    }
    if (parsedTypeName.includes('import')) {
        return true;
    }
    if (!isSameFileUserType(type, hostFilename)) {
        return true;
    }
    const declarations = type.symbol.declarations ??
        (type.symbol.valueDeclaration
            ? [type.symbol.valueDeclaration]
            : []);
    const isExported = declarations.some((decl) => {
        if (!decl)
            return false;
        return (ts.canHaveModifiers(decl) &&
            ts.getModifiers(decl)?.some((mod) => mod.kind === ts.SyntaxKind.ExportKeyword));
    });
    if (isExported) {
        return true;
    }
    const errorMessage = `Type "${parsedTypeName}" is not referenceable ("${hostFilename}"). To fix this, make sure to export this type.`;
    if (options.debug) {
        pluginDebugLogger.debug(errorMessage);
    }
    throw new Error(errorMessage);
}
