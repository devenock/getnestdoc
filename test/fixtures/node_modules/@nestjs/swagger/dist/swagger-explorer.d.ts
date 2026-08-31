import { Controller } from '@nestjs/common/interfaces/index.js';
import { ApplicationConfig } from '@nestjs/core';
import { InstanceWrapper } from '@nestjs/core/injector/instance-wrapper.js';
import { DenormalizedDoc } from './interfaces/denormalized-doc.interface.js';
import { OperationIdFactory } from './interfaces/index.js';
import { SchemaObject } from './interfaces/open-api-spec.interface.js';
import { StandardSchemaConverter } from './interfaces/swagger-document-options.interface.js';
import { SchemaObjectFactory } from './services/schema-object-factory.js';
export declare class SwaggerExplorer {
    private readonly schemaObjectFactory;
    private readonly options;
    private readonly mimetypeContentWrapper;
    private readonly metadataScanner;
    private readonly schemas;
    private readonly responseObjectFactory;
    private operationIdFactory;
    private routePathFactory?;
    private linkNameFactory;
    constructor(schemaObjectFactory: SchemaObjectFactory, options?: {
        httpAdapterType?: string;
        standardSchemaConverter?: StandardSchemaConverter;
    });
    exploreController(wrapper: InstanceWrapper<Controller>, applicationConfig: ApplicationConfig, options: {
        modulePath?: string;
        globalPrefix?: string;
        operationIdFactory?: OperationIdFactory;
        linkNameFactory?: (controllerKey: string, methodKey: string, fieldKey: string) => string;
        autoTagControllers?: boolean;
        onlyIncludeDecoratedEndpoints?: boolean;
    }): DenormalizedDoc[];
    getSchemas(): Record<string, SchemaObject>;
    private generateDenormalizedDocument;
    private exploreGlobalMetadata;
    private exploreRoutePathAndMethod;
    private getOperationId;
    private getRoutePathVersions;
    private reflectControllerPath;
    private validateRoutePath;
    private mergeMetadata;
    private deepMergeMetadata;
    private mergeValues;
    private migrateOperationSchema;
    private registerExtraModels;
    private getVersionMetadata;
    private getNonPathVersion;
}
