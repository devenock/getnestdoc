import { Type } from '@nestjs/common';
import { ModelPropertiesAccessor } from './model-properties-accessor.js';
import { ParamWithTypeMetadata, ParamsWithType } from './parameter-metadata-accessor.js';
export declare class ParametersMetadataMapper {
    private readonly modelPropertiesAccessor;
    constructor(modelPropertiesAccessor: ModelPropertiesAccessor);
    transformModelToProperties(parameters: ParamsWithType): ParamWithTypeMetadata[];
    mergeImplicitWithExplicit(key: string, prototype: Type<unknown>, param: ParamWithTypeMetadata): ParamWithTypeMetadata;
}
