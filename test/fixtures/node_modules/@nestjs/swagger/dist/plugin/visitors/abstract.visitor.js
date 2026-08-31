import * as ts from 'typescript';
import { OPENAPI_NAMESPACE, OPENAPI_PACKAGE_NAME } from '../plugin-constants.js';
import { isEsmOutputFile } from '../utils/module-format.util.js';
import { getOutputExtension, normalizePackagePath } from '../utils/plugin-utils.js';
const [major, minor] = ts.versionMajorMinor.split('.').map((x) => +x);
export class AbstractFileVisitor {
    constructor() {
        this._fileOutputExtensions = {};
        this._hoistedTypeImports = new Map();
    }
    insertHoistedTypeImports(sourceFile, factory) {
        if (this._hoistedTypeImports.size === 0) {
            return sourceFile;
        }
        const importDeclarations = Array.from(this._hoistedTypeImports).map(([importPath, namespaceName]) => factory.createImportDeclaration(undefined, factory.createImportClause(false, undefined, factory.createNamespaceImport(factory.createIdentifier(namespaceName))), factory.createStringLiteral(importPath), undefined));
        this._hoistedTypeImports.clear();
        return factory.updateSourceFile(sourceFile, [
            ...importDeclarations,
            ...sourceFile.statements
        ]);
    }
    registerOutputExtension(filePath, sourceFile, options) {
        this._fileOutputExtensions[filePath] = options.esmCompatible
            ? getOutputExtension(sourceFile.fileName)
            : '';
    }
    buildMetadataImports(collectedMetadata) {
        return Object.entries(collectedMetadata).map(([filePath, metadata]) => {
            const fileExt = this._fileOutputExtensions[filePath];
            const path = normalizePackagePath(filePath.replace(/\.[jt]s$/, fileExt ?? ''));
            const importExpr = ts.factory.createCallExpression(ts.factory.createToken(ts.SyntaxKind.ImportKeyword), undefined, [ts.factory.createStringLiteral(path)]);
            return [importExpr, metadata];
        });
    }
    updateImports(sourceFile, factory, program, options) {
        if (major <= 4 && minor < 8) {
            throw new Error('Nest CLI plugin does not support TypeScript < v4.8');
        }
        const compilerOptions = program.getCompilerOptions();
        if (isEsmOutputFile(sourceFile, compilerOptions, options)) {
            const importAsDeclaration = factory.createImportDeclaration(undefined, factory.createImportClause(false, undefined, factory.createNamespaceImport(factory.createIdentifier(OPENAPI_NAMESPACE))), factory.createStringLiteral(OPENAPI_PACKAGE_NAME), undefined);
            return factory.updateSourceFile(sourceFile, [
                importAsDeclaration,
                ...sourceFile.statements
            ]);
        }
        else {
            const importEqualsDeclaration = factory.createImportEqualsDeclaration(undefined, false, factory.createIdentifier(OPENAPI_NAMESPACE), factory.createExternalModuleReference(factory.createStringLiteral(OPENAPI_PACKAGE_NAME)));
            return factory.updateSourceFile(sourceFile, [
                importEqualsDeclaration,
                ...sourceFile.statements
            ]);
        }
    }
}
