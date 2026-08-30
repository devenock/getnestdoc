import type TS from "typescript";
import { readFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";

// `ts` is threaded through every function here as a parameter rather than
// imported statically — this module is reached from the runtime `nest-doc
// update` path (src/nest/update.ts), not just build-time scripts, and a
// static `import ts from "typescript"` gets hoisted into the bundle and
// eagerly evaluated on every CLI invocation regardless of dynamic-import
// wrapping elsewhere (verified — see core/extract/typescript-loader.ts,
// which this mirrors exactly).

// One entry from an Angular route array. `slug` is the resolved content guide
// slug for a `component:` route (see resolveComponentSlug below) — undefined
// if this route has no component of its own (a pure redirect or a
// loadChildren container). `children` is present for inline nested arrays;
// `loadChildrenSpec` is the raw import specifier for a lazy-loaded routes
// file, left for the caller to resolve and recurse into (this module does no
// filesystem I/O — see build-aliases.ts for the graph walk).
export type ParsedRoute = {
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

// A component's own import path is the reliable slug source — see
// ARCHITECTURE.md §6.2. Resolve the specifier to a real file path, drop the
// filename, and take the directory relative to `homepage/pages/`. Pure path
// arithmetic, no filesystem access.
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

    // A route with both `component` and `children` is a structural layout
    // wrapper, not a content page — verified true for exactly one route in
    // the whole real tree (the root HomepageComponent). Its children still
    // get walked above; it just contributes no slug of its own.
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

// Parses one *.routes.ts file into its top-level route array. `fileDir` is
// the directory the file lives in (for resolving relative component/
// loadChildren imports); `pagesRoot` is the `homepage/pages` directory every
// component's guide slug is computed relative to.
export function parseRoutesFile(ts: typeof TS, sourceText: string, fileName: string, fileDir: string, pagesRoot: string): ParsedRoute[] {
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

// Walks the full route graph starting from app.routes.ts, following inline
// `children` and reading each `loadChildren`-referenced file from disk as it's
// encountered, accumulating URL path segments as it goes. Not a pure function
// (it reads files), but it's the one graph-walk both build-aliases.ts and
// test/aliases.test.ts need, so it lives here rather than being duplicated.
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
        // First occurrence wins, matching Angular's own route-matching order —
        // verified against the real tree: app.routes.ts defines 'enterprise'
        // twice (a redirect, then a component); the first registration is
        // what the router actually serves.
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
