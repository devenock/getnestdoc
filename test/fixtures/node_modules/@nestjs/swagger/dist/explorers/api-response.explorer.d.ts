import { Type } from '@nestjs/common';
import { SchemaObject } from '../interfaces/open-api-spec.interface.js';
import { FactoriesNeededByResponseFactory, ResponseObjectFactory } from '../services/response-object-factory.js';
export declare const exploreGlobalApiResponseMetadata: (schemas: Record<string, SchemaObject>, responseObjectFactory: ResponseObjectFactory, metatype: Type<unknown>, factories: FactoriesNeededByResponseFactory) => {
    responses: {
        [x: string]: boolean;
    };
};
export declare const exploreApiResponseMetadata: (schemas: Record<string, SchemaObject>, responseObjectFactory: ResponseObjectFactory, factories: FactoriesNeededByResponseFactory, instance: object, prototype: Type<unknown>, method: Function, metatype?: Type<unknown>) => Record<string, boolean> | {
    [x: number]: {
        description: string;
    };
};
