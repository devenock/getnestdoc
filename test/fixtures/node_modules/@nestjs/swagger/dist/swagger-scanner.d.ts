import { INestApplication, InjectionToken } from '@nestjs/common';
import { ApplicationConfig } from '@nestjs/core';
import { InstanceWrapper } from '@nestjs/core/injector/instance-wrapper.js';
import { Module } from '@nestjs/core/injector/module.js';
import { OpenAPIObject, OperationIdFactory, SwaggerDocumentOptions } from './interfaces/index.js';
import { ModuleRoute } from './interfaces/module-route.interface.js';
import { SchemaObject } from './interfaces/open-api-spec.interface.js';
export declare class SwaggerScanner {
    private readonly transformer;
    private readonly modelPropertiesAccessor;
    private readonly swaggerTypesMapper;
    private schemaObjectFactory;
    private explorer;
    scanApplication(app: INestApplication, options: SwaggerDocumentOptions): Omit<OpenAPIObject, 'openapi' | 'info'>;
    scanModuleControllers(controller: Map<InjectionToken, InstanceWrapper>, applicationConfig: ApplicationConfig, options: {
        modulePath: string | undefined;
        globalPrefix: string | undefined;
        operationIdFactory?: OperationIdFactory;
        linkNameFactory?: (controllerKey: string, methodKey: string, fieldKey: string) => string;
        autoTagControllers?: boolean;
        onlyIncludeDecoratedEndpoints?: boolean;
    }): ModuleRoute[];
    getModules(modulesContainer: Map<string, Module>, include: Function[]): Module[];
    addExtraModels(schemas: Record<string, SchemaObject>, extraModels: Function[]): void;
    private getModulePathMetadata;
    private initializeSwaggerExplorer;
}
