import { NotFoundException } from '@nestjs/common';
import { loadPackageSync } from '@nestjs/common/utils/load-package.util.js';
import * as jsyaml from 'js-yaml';
import { createRequire } from 'node:module';
import { MetadataLoader } from './plugin/metadata-loader.js';
import { SwaggerScanner } from './swagger-scanner.js';
import { buildSwaggerHTML, buildSwaggerInitJS, getSwaggerAssetsAbsoluteFSPath } from './swagger-ui/index.js';
import { assignTwoLevelsDeep } from './utils/assign-two-levels-deep.js';
import { getGlobalPrefix } from './utils/get-global-prefix.js';
import { isOas31OrLater } from './utils/is-oas31-or-later.util.js';
import { normalizeRelPath } from './utils/normalize-rel-path.js';
import { convertNullableToOas31 } from './utils/nullable-to-oas31.util.js';
import { resolvePath } from './utils/resolve-path.util.js';
import { validateGlobalPrefix } from './utils/validate-global-prefix.util.js';
import { validatePath } from './utils/validate-path.util.js';
const require = createRequire(import.meta.url);
export class SwaggerModule {
    static mergeWebhooks(configWebhooks, scannedWebhooks) {
        if (!configWebhooks && !scannedWebhooks) {
            return undefined;
        }
        return assignTwoLevelsDeep({}, configWebhooks || {}, scannedWebhooks || {});
    }
    static createDocument(app, config, options = {}) {
        const swaggerScanner = new SwaggerScanner();
        const document = swaggerScanner.scanApplication(app, options);
        const { webhooks: configWebhooks, ...configWithoutWebhooks } = config;
        document.components = assignTwoLevelsDeep({}, config.components, document.components);
        const { webhooks: scannedWebhooks, webhookPaths, ...documentWithoutWebhooks } = document;
        const mergedWebhooks = SwaggerModule.mergeWebhooks(configWebhooks, scannedWebhooks);
        const isOas31 = isOas31OrLater(config.openapi ?? '3.0.0');
        const baseDocument = {
            openapi: '3.0.0',
            paths: {},
            ...configWithoutWebhooks,
            ...documentWithoutWebhooks
        };
        const finalDocument = isOas31
            ? {
                ...baseDocument,
                ...(mergedWebhooks ? { webhooks: mergedWebhooks } : {})
            }
            : {
                ...baseDocument,
                paths: webhookPaths
                    ? assignTwoLevelsDeep({}, baseDocument.paths || {}, webhookPaths)
                    : baseDocument.paths
            };
        if (isOas31) {
            convertNullableToOas31(finalDocument);
        }
        return finalDocument;
    }
    static async loadPluginMetadata(metadataFn) {
        const metadata = await metadataFn();
        return this.metadataLoader.load(metadata);
    }
    static serveStatic(finalPath, app, customStaticPath) {
        const httpAdapter = app.getHttpAdapter();
        const swaggerAssetsPath = customStaticPath
            ? resolvePath(customStaticPath)
            : getSwaggerAssetsAbsoluteFSPath();
        if (httpAdapter && httpAdapter.getType() === 'fastify') {
            const fastifyStaticModule = loadPackageSync('@fastify/static', 'SwaggerModule', () => require('@fastify/static'));
            const fastifyStatic = fastifyStaticModule.default ?? fastifyStaticModule;
            httpAdapter.getInstance().register(fastifyStatic, {
                root: swaggerAssetsPath,
                prefix: finalPath,
                decorateReply: false
            });
        }
        else {
            app.useStaticAssets(swaggerAssetsPath, {
                prefix: finalPath
            });
        }
    }
    static serveDocuments(finalPath, urlLastSubdirectory, httpAdapter, documentOrFactory, options) {
        let document;
        const getBuiltDocument = () => {
            if (!document) {
                document =
                    typeof documentOrFactory === 'function'
                        ? documentOrFactory()
                        : documentOrFactory;
            }
            return document;
        };
        if (options.ui) {
            this.serveSwaggerUi(finalPath, urlLastSubdirectory, httpAdapter, getBuiltDocument, options.swaggerOptions);
        }
        if (options.raw === true ||
            (Array.isArray(options.raw) && options.raw.length > 0)) {
            const serveJson = options.raw === true || options.raw.includes('json');
            const serveYaml = options.raw === true || options.raw.includes('yaml');
            this.serveDefinitions(httpAdapter, getBuiltDocument, options, {
                serveJson,
                serveYaml
            });
        }
    }
    static serveSwaggerUi(finalPath, urlLastSubdirectory, httpAdapter, getBuiltDocument, swaggerOptions) {
        const baseUrlForSwaggerUI = normalizeRelPath(`./${urlLastSubdirectory}/`);
        let swaggerUiHtml;
        let swaggerUiHtmlForTrailingSlash;
        let swaggerUiInitJS;
        httpAdapter.get(normalizeRelPath(`${finalPath}/swagger-ui-init.js`), async (req, res) => {
            res.type('application/javascript');
            const document = getBuiltDocument();
            if (swaggerOptions.patchDocumentOnRequest) {
                const documentToSerialize = await Promise.resolve(swaggerOptions.patchDocumentOnRequest(req, res, document));
                const swaggerInitJsPerRequest = buildSwaggerInitJS(documentToSerialize, swaggerOptions);
                return res.send(swaggerInitJsPerRequest);
            }
            if (!swaggerUiInitJS) {
                swaggerUiInitJS = buildSwaggerInitJS(document, swaggerOptions);
            }
            return res.send(swaggerUiInitJS);
        });
        try {
            httpAdapter.get(normalizeRelPath(`${finalPath}/${urlLastSubdirectory}/swagger-ui-init.js`), async (req, res) => {
                res.type('application/javascript');
                const document = getBuiltDocument();
                if (swaggerOptions.patchDocumentOnRequest) {
                    const documentToSerialize = await Promise.resolve(swaggerOptions.patchDocumentOnRequest(req, res, document));
                    const swaggerInitJsPerRequest = buildSwaggerInitJS(documentToSerialize, swaggerOptions);
                    return res.send(swaggerInitJsPerRequest);
                }
                if (!swaggerUiInitJS) {
                    swaggerUiInitJS = buildSwaggerInitJS(document, swaggerOptions);
                }
                return res.send(swaggerUiInitJS);
            });
        }
        catch {
        }
        const getSwaggerHtml = () => {
            if (!swaggerUiHtml) {
                swaggerUiHtml = buildSwaggerHTML(baseUrlForSwaggerUI, swaggerOptions);
            }
            return swaggerUiHtml;
        };
        const getTrailingSlashSwaggerHtml = () => {
            if (!swaggerUiHtmlForTrailingSlash) {
                swaggerUiHtmlForTrailingSlash = buildSwaggerHTML('./', swaggerOptions);
            }
            return swaggerUiHtmlForTrailingSlash;
        };
        function serveSwaggerHtml(req, res) {
            res.type('text/html');
            const url = httpAdapter.getRequestUrl(req);
            const hasTrailingSlash = url.endsWith('/');
            const swaggerUiHtml = hasTrailingSlash
                ? getTrailingSlashSwaggerHtml()
                : getSwaggerHtml();
            res.send(swaggerUiHtml);
        }
        httpAdapter.get(finalPath, serveSwaggerHtml);
        httpAdapter.get(`${finalPath}/index.html`, serveSwaggerHtml);
        httpAdapter.get(`${finalPath}/LICENSE`, () => {
            throw new NotFoundException();
        });
        try {
            httpAdapter.get(normalizeRelPath(`${finalPath}/`), serveSwaggerHtml);
        }
        catch {
        }
    }
    static serveDefinitions(httpAdapter, getBuiltDocument, options, serveOptions) {
        if (serveOptions.serveJson) {
            httpAdapter.get(normalizeRelPath(options.jsonDocumentUrl), async (req, res) => {
                res.type('application/json');
                const document = getBuiltDocument();
                const documentToSerialize = options.swaggerOptions
                    .patchDocumentOnRequest
                    ? await Promise.resolve(options.swaggerOptions.patchDocumentOnRequest(req, res, document))
                    : document;
                return res.send(JSON.stringify(documentToSerialize));
            });
        }
        if (serveOptions.serveYaml) {
            httpAdapter.get(normalizeRelPath(options.yamlDocumentUrl), async (req, res) => {
                res.type('text/yaml');
                const document = getBuiltDocument();
                const documentToSerialize = options.swaggerOptions
                    .patchDocumentOnRequest
                    ? await Promise.resolve(options.swaggerOptions.patchDocumentOnRequest(req, res, document))
                    : document;
                const yamlDocument = jsyaml.dump(documentToSerialize, {
                    skipInvalid: true,
                    noRefs: true
                });
                return res.send(yamlDocument);
            });
        }
    }
    static setup(path, app, documentOrFactory, options) {
        const globalPrefix = getGlobalPrefix(app);
        const finalPath = validatePath(options?.useGlobalPrefix && validateGlobalPrefix(globalPrefix)
            ? `${globalPrefix}${validatePath(path)}`
            : path);
        const urlLastSubdirectory = finalPath.split('/').slice(-1).pop() || '';
        const validatedGlobalPrefix = options?.useGlobalPrefix && validateGlobalPrefix(globalPrefix)
            ? validatePath(globalPrefix)
            : '';
        const finalJSONDocumentPath = options?.jsonDocumentUrl
            ? `${validatedGlobalPrefix}${validatePath(options.jsonDocumentUrl)}`
            : `${finalPath}-json`;
        const finalYAMLDocumentPath = options?.yamlDocumentUrl
            ? `${validatedGlobalPrefix}${validatePath(options.yamlDocumentUrl)}`
            : `${finalPath}-yaml`;
        const ui = options?.ui ?? options?.swaggerUiEnabled ?? true;
        const raw = options?.raw ?? true;
        const httpAdapter = app.getHttpAdapter();
        SwaggerModule.serveDocuments(finalPath, urlLastSubdirectory, httpAdapter, documentOrFactory, {
            ui,
            raw,
            jsonDocumentUrl: finalJSONDocumentPath,
            yamlDocumentUrl: finalYAMLDocumentPath,
            swaggerOptions: options || {}
        });
        if (ui) {
            SwaggerModule.serveStatic(finalPath, app, options?.customSwaggerUiPath);
            if (finalPath === `/${urlLastSubdirectory}`) {
                return;
            }
            const serveStaticSlashEndingPath = `${finalPath}/${urlLastSubdirectory}`;
            SwaggerModule.serveStatic(serveStaticSlashEndingPath, app);
        }
    }
}
SwaggerModule.metadataLoader = new MetadataLoader();
