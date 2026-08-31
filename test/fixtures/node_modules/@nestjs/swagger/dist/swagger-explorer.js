import { RequestMethod, VersioningType } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA, VERSION_METADATA } from '@nestjs/common/constants.js';
import { VERSION_NEUTRAL } from '@nestjs/common/interfaces/index.js';
import { addLeadingSlash, isUndefined } from '@nestjs/common/utils/shared.utils.js';
import { MetadataScanner } from '@nestjs/core';
import { LegacyRouteConverter } from '@nestjs/core/router/legacy-route-converter.js';
import { RoutePathFactory } from '@nestjs/core/router/route-path-factory.js';
import { cloneDeep, flatten, get, head, isArray, isEmpty, mapValues, omit, omitBy, pick } from 'es-toolkit/compat';
import { parse } from 'path-to-regexp';
import { DECORATORS } from './constants.js';
import { exploreApiCallbacksMetadata } from './explorers/api-callbacks.explorer.js';
import { exploreApiExcludeControllerMetadata } from './explorers/api-exclude-controller.explorer.js';
import { exploreApiExcludeEndpointMetadata } from './explorers/api-exclude-endpoint.explorer.js';
import { exploreApiExtraModelsMetadata, exploreGlobalApiExtraModelsMetadata } from './explorers/api-extra-models.explorer.js';
import { exploreGlobalApiHeaderMetadata } from './explorers/api-headers.explorer.js';
import { exploreApiIncludeEndpointMetadata } from './explorers/api-include-endpoint.explorer.js';
import { exploreApiOperationMetadata } from './explorers/api-operation.explorer.js';
import { exploreApiParametersMetadata } from './explorers/api-parameters.explorer.js';
import { exploreApiResponseMetadata, exploreGlobalApiResponseMetadata } from './explorers/api-response.explorer.js';
import { exploreApiSecurityMetadata, exploreGlobalApiSecurityMetadata } from './explorers/api-security.explorer.js';
import { exploreApiTagsMetadata, exploreGlobalApiTagsMetadata } from './explorers/api-use-tags.explorer.js';
import { MimetypeContentWrapper } from './services/mimetype-content-wrapper.js';
import { ResponseObjectFactory } from './services/response-object-factory.js';
import { isBodyParameter } from './utils/is-body-parameter.util.js';
import { mergeAndUniq } from './utils/merge-and-uniq.util.js';
export class SwaggerExplorer {
    constructor(schemaObjectFactory, options = {}) {
        this.schemaObjectFactory = schemaObjectFactory;
        this.options = options;
        this.mimetypeContentWrapper = new MimetypeContentWrapper();
        this.metadataScanner = new MetadataScanner();
        this.schemas = {};
        this.operationIdFactory = (controllerKey, methodKey, version) => version
            ? controllerKey
                ? `${controllerKey}_${methodKey}_${version}`
                : `${methodKey}_${version}`
            : controllerKey
                ? `${controllerKey}_${methodKey}`
                : methodKey;
        this.linkNameFactory = (controllerKey, methodKey, fieldKey) => controllerKey
            ? `${controllerKey}_${methodKey}_from_${fieldKey}`
            : `${methodKey}_from_${fieldKey}`;
        this.responseObjectFactory = new ResponseObjectFactory(this.options.standardSchemaConverter);
    }
    exploreController(wrapper, applicationConfig, options) {
        const { operationIdFactory, linkNameFactory } = options;
        this.routePathFactory = new RoutePathFactory(applicationConfig);
        if (operationIdFactory) {
            this.operationIdFactory = operationIdFactory;
        }
        if (linkNameFactory) {
            this.linkNameFactory = linkNameFactory;
        }
        const { instance, metatype } = wrapper;
        const prototype = Object.getPrototypeOf(instance);
        const documentResolvers = {
            root: [
                this.exploreRoutePathAndMethod,
                exploreApiOperationMetadata,
                exploreApiParametersMetadata.bind(null, this.schemas, this.schemaObjectFactory)
            ],
            security: [exploreApiSecurityMetadata],
            tags: [exploreApiTagsMetadata],
            callbacks: [exploreApiCallbacksMetadata],
            responses: [
                exploreApiResponseMetadata.bind(null, this.schemas, this.responseObjectFactory, {
                    operationId: this.operationIdFactory,
                    linkName: this.linkNameFactory
                })
            ]
        };
        return this.generateDenormalizedDocument(metatype, prototype, instance, documentResolvers, applicationConfig, options);
    }
    getSchemas() {
        return this.schemas;
    }
    generateDenormalizedDocument(metatype, prototype, instance, documentResolvers, applicationConfig, options) {
        const self = this;
        const excludeController = exploreApiExcludeControllerMetadata(metatype);
        if (excludeController) {
            return [];
        }
        const globalMetadata = this.exploreGlobalMetadata(metatype, {
            autoTagControllers: options.autoTagControllers
        });
        const ctrlExtraModels = exploreGlobalApiExtraModelsMetadata(metatype);
        this.registerExtraModels(ctrlExtraModels);
        const denormalizedPaths = this.metadataScanner.scanFromPrototype(instance, prototype, (name) => {
            const targetCallback = prototype[name];
            const includeEndpoint = exploreApiIncludeEndpointMetadata(instance, prototype, targetCallback);
            if (options.onlyIncludeDecoratedEndpoints && !includeEndpoint) {
                return;
            }
            const excludeEndpoint = exploreApiExcludeEndpointMetadata(instance, prototype, targetCallback);
            if (excludeEndpoint && excludeEndpoint.disable) {
                return;
            }
            const ctrlExtraModels = exploreApiExtraModelsMetadata(instance, prototype, targetCallback);
            this.registerExtraModels(ctrlExtraModels);
            const methodMetadata = mapValues(documentResolvers, (explorers) => explorers.reduce((metadata, fn) => {
                const exploredMetadata = fn.call(self, instance, prototype, targetCallback, metatype, options.globalPrefix, options.modulePath, applicationConfig, options.autoTagControllers);
                if (!exploredMetadata) {
                    return metadata;
                }
                if (!isArray(exploredMetadata)) {
                    if (Array.isArray(metadata)) {
                        return metadata.map((item) => ({
                            ...item,
                            ...exploredMetadata
                        }));
                    }
                    return { ...metadata, ...exploredMetadata };
                }
                return isArray(metadata)
                    ? [...metadata, ...exploredMetadata]
                    : exploredMetadata;
            }, {}));
            if (Array.isArray(methodMetadata.root)) {
                return methodMetadata.root.map((endpointMetadata) => {
                    endpointMetadata = cloneDeep({
                        ...methodMetadata,
                        root: endpointMetadata
                    });
                    const mergedMethodMetadata = this.mergeMetadata(globalMetadata, omitBy(endpointMetadata, isEmpty));
                    return this.migrateOperationSchema({
                        responses: {},
                        ...omit(globalMetadata, 'chunks'),
                        ...mergedMethodMetadata
                    }, prototype, targetCallback, metatype);
                });
            }
            const mergedMethodMetadata = this.mergeMetadata(globalMetadata, omitBy(methodMetadata, isEmpty));
            return [
                this.migrateOperationSchema({
                    responses: {},
                    ...omit(globalMetadata, 'chunks'),
                    ...mergedMethodMetadata
                }, prototype, targetCallback, metatype)
            ];
        });
        return flatten(denormalizedPaths).filter((path) => path.root?.path);
    }
    exploreGlobalMetadata(metatype, options) {
        const globalExplorers = [
            exploreGlobalApiTagsMetadata(options.autoTagControllers),
            exploreGlobalApiSecurityMetadata,
            exploreGlobalApiResponseMetadata.bind(null, this.schemas, this.responseObjectFactory),
            exploreGlobalApiHeaderMetadata
        ];
        const globalMetadata = globalExplorers
            .map((explorer) => explorer.call(explorer, metatype))
            .filter((val) => !isUndefined(val))
            .reduce((curr, next) => {
            if (next.depth) {
                return {
                    ...curr,
                    chunks: (curr.chunks || []).concat(next)
                };
            }
            return { ...curr, ...next };
        }, {});
        return globalMetadata;
    }
    exploreRoutePathAndMethod(instance, prototype, method, metatype, globalPrefix, modulePath, applicationConfig) {
        const methodPath = Reflect.getMetadata(PATH_METADATA, method);
        if (isUndefined(methodPath)) {
            return undefined;
        }
        const requestMethod = Reflect.getMetadata(METHOD_METADATA, method);
        const webhookMetadata = Reflect.getMetadata(DECORATORS.API_WEBHOOK, method);
        const isWebhook = Boolean(webhookMetadata);
        const methodVersion = Reflect.getMetadata(VERSION_METADATA, method);
        const versioningOptions = applicationConfig.getVersioning();
        const controllerVersion = this.getVersionMetadata(metatype, versioningOptions);
        const versionOrVersions = methodVersion ?? controllerVersion;
        const versions = this.getRoutePathVersions(versionOrVersions, versioningOptions);
        const allRoutePaths = this.routePathFactory.create({
            methodPath,
            methodVersion,
            modulePath,
            globalPrefix,
            controllerVersion,
            ctrlPath: this.reflectControllerPath(metatype),
            versioningOptions: applicationConfig.getVersioning()
        }, requestMethod);
        return flatten(allRoutePaths.map((routePath, index) => {
            const fullPath = this.validateRoutePath(routePath);
            const apiExtension = Reflect.getMetadata(DECORATORS.API_EXTENSION, method);
            if (requestMethod === RequestMethod.ALL) {
                const validMethods = [
                    'get',
                    'post',
                    'put',
                    'delete',
                    'patch',
                    'options',
                    'head',
                    'search'
                ];
                return validMethods.map((requestMethod) => ({
                    method: requestMethod,
                    path: fullPath === '' ? '/' : fullPath,
                    ...(isWebhook
                        ? {
                            isWebhook: true,
                            webhookName: typeof webhookMetadata === 'string'
                                ? webhookMetadata
                                : method.name
                        }
                        : {}),
                    operationId: `${this.getOperationId(instance, method.name)}_${requestMethod.toLowerCase()}`,
                    ...apiExtension
                }));
            }
            const pathVersion = versions.find((v) => fullPath.includes(`/${v}/`) || fullPath.endsWith(`/${v}`));
            const isAlias = allRoutePaths.length > 1 && allRoutePaths.length !== versions.length;
            const methodKey = isAlias ? `${method.name}[${index}]` : method.name;
            const nonPathVersion = this.getNonPathVersion(methodVersion, metatype, versioningOptions);
            const operationVersion = pathVersion ?? nonPathVersion;
            return {
                method: RequestMethod[requestMethod].toLowerCase(),
                path: fullPath === '' ? '/' : fullPath,
                ...(isWebhook
                    ? {
                        isWebhook: true,
                        webhookName: typeof webhookMetadata === 'string'
                            ? webhookMetadata
                            : method.name
                    }
                    : {}),
                operationId: this.getOperationId(instance, methodKey, operationVersion),
                ...apiExtension
            };
        }));
    }
    getOperationId(instance, methodKey, version) {
        return this.operationIdFactory(instance.constructor?.name || '', methodKey, version);
    }
    getRoutePathVersions(versionValue, versioningOptions) {
        let versions = [];
        if (!versionValue || versioningOptions?.type !== VersioningType.URI) {
            return versions;
        }
        if (Array.isArray(versionValue)) {
            versions = versionValue.filter((v) => v !== VERSION_NEUTRAL);
        }
        else if (versionValue !== VERSION_NEUTRAL) {
            versions = [versionValue];
        }
        const prefix = this.routePathFactory.getVersionPrefix(versioningOptions);
        versions = versions.map((v) => `${prefix}${v}`);
        return versions;
    }
    reflectControllerPath(metatype) {
        return Reflect.getMetadata(PATH_METADATA, metatype);
    }
    validateRoutePath(path) {
        if (isUndefined(path)) {
            return '';
        }
        if (Array.isArray(path)) {
            path = head(path);
        }
        let pathWithParams = '';
        try {
            let normalizedPath = LegacyRouteConverter.tryConvert(path, {
                logs: this.options.httpAdapterType !== 'fastify'
            });
            normalizedPath = normalizedPath.replace(/::/g, '\\:');
            normalizedPath = normalizedPath.replace(/\[:\]/g, '\\:');
            normalizedPath = normalizedPath.replace(/\(\^([^)]+)\)/g, '');
            const { tokens } = parse(normalizedPath);
            for (const item of tokens) {
                if (item.type === 'text') {
                    pathWithParams += item.value;
                }
                else if (item.type === 'param') {
                    pathWithParams += `{${item.name}}`;
                }
                else if (item.type === 'wildcard') {
                    pathWithParams += `{${item.name}}`;
                }
                else if (item.type === 'group') {
                    pathWithParams += item.tokens.reduce((acc, item) => acc +
                        (item.type === 'text'
                            ? item.value
                            : `{${item.name}}`), '');
                }
            }
        }
        catch (err) {
            if (err instanceof TypeError) {
                LegacyRouteConverter.printError(path);
            }
            throw err;
        }
        return pathWithParams === '/' ? '' : addLeadingSlash(pathWithParams);
    }
    mergeMetadata(globalMetadata, methodMetadata) {
        if (methodMetadata.root && !methodMetadata.root.parameters) {
            methodMetadata.root.parameters = [];
        }
        const deepMerge = (metadata) => (value, key) => {
            if (!metadata[key]) {
                return value;
            }
            const globalValue = metadata[key];
            if (metadata.depth) {
                return this.deepMergeMetadata(globalValue, value, metadata.depth);
            }
            return this.mergeValues(globalValue, value);
        };
        if (globalMetadata.chunks) {
            const { chunks } = globalMetadata;
            chunks.forEach((chunk) => {
                methodMetadata = mapValues(methodMetadata, deepMerge(chunk));
            });
        }
        return mapValues(methodMetadata, deepMerge(globalMetadata));
    }
    deepMergeMetadata(globalValue, methodValue, maxDepth, currentDepthLevel = 0) {
        if (currentDepthLevel === maxDepth) {
            return this.mergeValues(globalValue, methodValue);
        }
        return mapValues(methodValue, (value, key) => {
            if (key in globalValue) {
                return this.deepMergeMetadata(globalValue[key], methodValue[key], maxDepth, currentDepthLevel + 1);
            }
            return value;
        });
    }
    mergeValues(globalValue, methodValue) {
        if (!isArray(globalValue)) {
            return { ...globalValue, ...methodValue };
        }
        return [...globalValue, ...methodValue];
    }
    migrateOperationSchema(document, prototype, method, metatype) {
        const parametersObject = get(document, 'root.parameters');
        const requestBodyIndex = (parametersObject || []).findIndex(isBodyParameter);
        if (requestBodyIndex < 0) {
            return document;
        }
        const requestBody = parametersObject[requestBodyIndex];
        parametersObject.splice(requestBodyIndex, 1);
        const classConsumes = Reflect.getMetadata(DECORATORS.API_CONSUMES, metatype ?? prototype?.constructor);
        const methodConsumes = Reflect.getMetadata(DECORATORS.API_CONSUMES, method);
        let consumes = mergeAndUniq(classConsumes, methodConsumes);
        consumes = isEmpty(consumes) ? ['application/json'] : consumes;
        const keysToRemove = ['schema', 'in', 'name', 'examples', 'encoding'];
        document.root.requestBody = {
            ...omit(requestBody, keysToRemove),
            ...this.mimetypeContentWrapper.wrap(consumes, pick(requestBody, ['schema', 'examples', 'encoding']))
        };
        return document;
    }
    registerExtraModels(extraModels) {
        extraModels.forEach((item) => this.schemaObjectFactory.exploreModelSchema(item, this.schemas));
    }
    getVersionMetadata(metatype, versioningOptions) {
        if (versioningOptions?.type === VersioningType.URI) {
            return (Reflect.getMetadata(VERSION_METADATA, metatype) ??
                versioningOptions.defaultVersion);
        }
    }
    getNonPathVersion(methodVersion, metatype, versioningOptions) {
        if (!versioningOptions || versioningOptions.type === VersioningType.URI) {
            return undefined;
        }
        const version = methodVersion ??
            Reflect.getMetadata(VERSION_METADATA, metatype) ??
            versioningOptions.defaultVersion;
        if (!version || version === VERSION_NEUTRAL) {
            return undefined;
        }
        if (Array.isArray(version)) {
            const filtered = version.filter((v) => v !== VERSION_NEUTRAL);
            return filtered.length > 0 ? filtered[0] : undefined;
        }
        return version;
    }
}
