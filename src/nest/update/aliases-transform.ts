import type TS from "typescript";
import { readFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";

// `ts` is a parameter rather than a static import, since this module ships in the runtime `nest-doc update` bundle.

// `slug` is undefined for a route with no component of its own (redirect or loadChildren container); `loadChildrenSpec` is left for the caller to resolve.
type ParsedRoute = {
  path: string;
  slug?: string;
  redirectTo?: string;
  children?: ParsedRoute[];
  loadChildrenSpec?: string;
};

function findObjectProp(ts: typeof TS, obj: TS.ObjectLiteralExpression, name: string): TS.PropertyAssignment | undefined {
  return obj.properties.find(
    (p): p is TS.PropertyAssignment => ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === name,
  );
}

function findLoadChildrenImportSpec(ts: typeof TS, initializer: TS.Expression): string | undefined {
  let spec: string | undefined;
  function visit(node: TS.Node): void {
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const arg = node.arguments[0];
      if (arg && ts.isStringLiteral(arg)) spec = arg.text;
    }
    ts.forEachChild(node, visit);
  }
  visit(initializer);
  return spec;
}

// Derives a component's slug from its own import path via pure path arithmetic, no filesystem access.
function resolveComponentSlug(fileDir: string, importSpec: string, pagesRoot: string): string {
  const componentDir = dirname(resolve(fileDir, importSpec));
  return relative(pagesRoot, componentDir).split(sep).join("/");
}

function parseRouteArray(
  ts: typeof TS,
  array: TS.ArrayLiteralExpression,
  imports: Map<string, string>,
  fileDir: string,
  pagesRoot: string,
): ParsedRoute[] {
  const routes: ParsedRoute[] = [];

  for (const element of array.elements) {
    if (!ts.isObjectLiteralExpression(element)) continue;

    const pathProp = findObjectProp(ts, element, "path");
    const path = pathProp && ts.isStringLiteral(pathProp.initializer) ? pathProp.initializer.text : "";

    const route: ParsedRoute = { path };

    const childrenProp = findObjectProp(ts, element, "children");
    if (childrenProp && ts.isArrayLiteralExpression(childrenProp.initializer)) {
      route.children = parseRouteArray(ts, childrenProp.initializer, imports, fileDir, pagesRoot);
    }

    // A route with both `component` and `children` is a structural layout wrapper (verified: exactly one in the real tree), contributing no slug of its own.
    const componentProp = findObjectProp(ts, element, "component");
    if (componentProp && ts.isIdentifier(componentProp.initializer) && !route.children) {
      const spec = imports.get(componentProp.initializer.text);
      if (spec) route.slug = resolveComponentSlug(fileDir, spec, pagesRoot);
    }

    const redirectToProp = findObjectProp(ts, element, "redirectTo");
    if (redirectToProp && ts.isStringLiteral(redirectToProp.initializer)) {
      route.redirectTo = redirectToProp.initializer.text;
    }

    const loadChildrenProp = findObjectProp(ts, element, "loadChildren");
    if (loadChildrenProp) {
      const spec = findLoadChildrenImportSpec(ts, loadChildrenProp.initializer);
      if (spec) route.loadChildrenSpec = spec;
    }

    routes.push(route);
  }

  return routes;
}

// Parses one *.routes.ts file into its top-level route array; `pagesRoot` is the `homepage/pages` directory every component's slug is computed relative to.
function parseRoutesFile(ts: typeof TS, sourceText: string, fileName: string, fileDir: string, pagesRoot: string): ParsedRoute[] {
  const sourceFile = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true);

  const imports = new Map<string, string>();
  ts.forEachChild(sourceFile, (node) => {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      node.importClause?.namedBindings &&
      ts.isNamedImports(node.importClause.namedBindings)
    ) {
      const spec = node.moduleSpecifier.text;
      for (const element of node.importClause.namedBindings.elements) {
        imports.set(element.name.text, spec);
      }
    }
  });

  let routesArray: TS.ArrayLiteralExpression | undefined;
  ts.forEachChild(sourceFile, (node) => {
    if (!ts.isVariableStatement(node)) return;
    for (const decl of node.declarationList.declarations) {
      if (decl.initializer && ts.isArrayLiteralExpression(decl.initializer)) {
        routesArray = decl.initializer;
      }
    }
  });

  if (!routesArray) {
    throw new Error(`${fileName}: no exported route array found`);
  }

  return parseRouteArray(ts, routesArray, imports, fileDir, pagesRoot);
}

// Walks the full route graph from app.routes.ts, reading loadChildren files as encountered — the one graph-walk both build-aliases.ts and its tests need.
export function buildUrlToSlug(ts: typeof TS, appRoutesPath: string, pagesRoot: string, guideSlugs: Set<string>): Map<string, string> {
  const table = new Map<string, string>();

  function walk(routes: ParsedRoute[], urlPrefix: string[], fileDir: string): void {
    for (const route of routes) {
      const urlParts = route.path ? [...urlPrefix, route.path] : urlPrefix;
      const urlPath = urlParts.join("/");

      if (route.slug !== undefined) {
        if (!guideSlugs.has(route.slug)) {
          throw new Error(
            `route "/${urlPath}" resolves to guide slug "${route.slug}", which is not in guides.json. ` +
              "Do not skip unresolvable entries — either the resolution logic is wrong or guides.json is stale.",
          );
        }
        // First occurrence wins, matching Angular's own route-matching order (verified: 'enterprise' is defined twice in the real tree).
        if (!table.has(urlPath)) table.set(urlPath, route.slug);
      }

      if (route.children) {
        walk(route.children, urlParts, fileDir);
      }

      if (route.loadChildrenSpec) {
        const childAbsPath = `${resolve(fileDir, route.loadChildrenSpec)}.ts`;
        const childDir = dirname(childAbsPath);
        const childText = readFileSync(childAbsPath, "utf8");
        const childRoutes = parseRoutesFile(ts, childText, childAbsPath, childDir, pagesRoot);
        walk(childRoutes, urlParts, childDir);
      }
    }
  }

  const appDir = dirname(appRoutesPath);
  const rootRoutes = parseRoutesFile(ts, readFileSync(appRoutesPath, "utf8"), appRoutesPath, appDir, pagesRoot);
  walk(rootRoutes, [], appDir);

  return table;
}
