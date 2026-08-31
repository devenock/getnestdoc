import { MODULE_PATH } from '@nestjs/common/constants.js';
import { flatten, isEmpty } from 'es-toolkit/compat';
import { ModelPropertiesAccessor } from './services/model-properties-accessor.js';
import { SchemaObjectFactory } from './services/schema-object-factory.js';
import { SwaggerTypesMapper } from './services/swagger-types-mapper.js';
import { SwaggerExplorer } from './swagger-explorer.js';
import { SwaggerTransformer } from './swagger-transformer.js';
import { applyExampleMaxDepth } from './utils/apply-example-max-depth.util.js';
import { getGlobalPrefix } from './utils/get-global-prefix.js';
import { stripDynamicDefaults } from './utils/strip-dynamic-defaults.util.js';
import { stripLastSlash } from './utils/strip-last-slash.util.js';
export class SwaggerScanner {
    constructor() {
        this.transformer = new SwaggerTransformer();
        this.modelPropertiesAccessor = new ModelPropertiesAccessor();
        this.swaggerTypesMapper = new SwaggerTypesMapper();
        this.schemaObjectFactory = new SchemaObjectFactory(this.modelPropertiesAccessor, this.swaggerTypesMapper);
    }
    scanApplication(app, options) {
        const { deepScanRoutes, include: includedModules = [], extraModels = [], ignoreGlobalPrefix = false, operationIdFactory, linkNameFactory, autoTagControllers = true, onlyIncludeDecoratedEndpoints = false, excludeDynamicDefaults = false, exampleMaxDepth, standardSchemaConverter } = options;
        this.schemaObjectFactory = new SchemaObjectFactory(this.modelPropertiesAccessor, this.swaggerTypesMapper, standardSchemaConverter);
        const untypedApp = app;
        const container = untypedApp.container;
        const internalConfigRef = untypedApp.config;
        const httpAdapterType = app.getHttpAdapter().getType();
        this.initializeSwaggerExplorer(httpAdapterType, standardSchemaConverter);
        const modules = this.getModules(container.getModules(), includedModules);
        const globalPrefix = !ignoreGlobalPrefix
            ? stripLastSlash(getGlobalPrefix(app))
            : '';
        const denormalizedPaths = modules.map(({ controllers, metatype, imports }) => {
            let result = [];
            if (deepScanRoutes) {
                const isGlobal = (module) => !container.isGlobalModule(module);
                Array.from(imports.values())
                    .filter(isGlobal)
                    .forEach(({ metatype, controllers }) => {
                    const modulePath = this.getModulePathMetadata(container, metatype);
                    result = result.concat(this.scanModuleControllers(controllers, internalConfigRef, {
                        modulePath,
                        globalPrefix,
                        operationIdFactory,
                        linkNameFactory,
                        autoTagControllers,
                        onlyIncludeDecoratedEndpoints
                    }));
                });
            }
            const modulePath = this.getModulePathMetadata(container, metatype);
            return result.concat(this.scanModuleControllers(controllers, internalConfigRef, {
                modulePath,
                globalPrefix,
                operationIdFactory,
                linkNameFactory,
                autoTagControllers,
                onlyIncludeDecoratedEndpoints
            }));
        });
        const schemas = this.explorer.getSchemas();
        this.addExtraModels(schemas, extraModels);
        if (excludeDynamicDefaults) {
            stripDynamicDefaults(schemas);
        }
        applyExampleMaxDepth(schemas, exampleMaxDepth);
        return {
            ...this.transformer.normalizePaths(flatten(denormalizedPaths)),
            components: {
                schemas: schemas
            }
        };
    }
    scanModuleControllers(controller, applicationConfig, options) {
        const denormalizedArray = [...controller.values()].map((ctrl) => this.explorer.exploreController(ctrl, applicationConfig, options));
        return flatten(denormalizedArray);
    }
    getModules(modulesContainer, include) {
        if (!include || isEmpty(include)) {
            return [...modulesContainer.values()];
        }
        return [...modulesContainer.values()].filter(({ metatype }) => include.some((item) => item === metatype));
    }
    addExtraModels(schemas, extraModels) {
        extraModels.forEach((item) => {
            this.schemaObjectFactory.exploreModelSchema(item, schemas);
        });
    }
    getModulePathMetadata(container, metatype) {
        const modulesContainer = container.getModules();
        const modulePath = Reflect.getMetadata(MODULE_PATH + modulesContainer.applicationId, metatype);
        return modulePath ?? Reflect.getMetadata(MODULE_PATH, metatype);
    }
    initializeSwaggerExplorer(httpAdapterType, standardSchemaConverter) {
        this.explorer = new SwaggerExplorer(this.schemaObjectFactory, {
            httpAdapterType,
            standardSchemaConverter
        });
    }
}
