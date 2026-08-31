import { HttpStatus, RequestMethod } from '@nestjs/common';
import { HTTP_CODE_METADATA, METHOD_METADATA } from '@nestjs/common/constants.js';
import { isEmpty } from '@nestjs/common/utils/shared.utils.js';
import { mapValues, omit } from 'es-toolkit/compat';
import { DECORATORS } from '../constants.js';
import { ApiResponse } from '../decorators/index.js';
import { METADATA_FACTORY_NAME } from '../plugin/plugin-constants.js';
import { GlobalResponsesStorage } from '../storages/global-responses.storage.js';
import { mergeAndUniq } from '../utils/merge-and-uniq.util.js';
export const exploreGlobalApiResponseMetadata = (schemas, responseObjectFactory, metatype, factories) => {
    const responses = Reflect.getMetadata(DECORATORS.API_RESPONSE, metatype);
    const globalResponses = GlobalResponsesStorage.getAll();
    const mappedGlobalResponsesOrUndefined = globalResponses
        ? mapResponsesToSwaggerResponses(globalResponses, schemas, responseObjectFactory, undefined, factories)
        : undefined;
    const produces = Reflect.getMetadata(DECORATORS.API_PRODUCES, metatype);
    return responses
        ? {
            responses: {
                ...mappedGlobalResponsesOrUndefined,
                ...mapResponsesToSwaggerResponses(responses, schemas, responseObjectFactory, produces, factories)
            }
        }
        : mappedGlobalResponsesOrUndefined
            ? {
                responses: mappedGlobalResponsesOrUndefined
            }
            : undefined;
};
export const exploreApiResponseMetadata = (schemas, responseObjectFactory, factories, instance, prototype, method, metatype) => {
    applyMetadataFactory(prototype, instance);
    const responses = Reflect.getMetadata(DECORATORS.API_RESPONSE, method);
    if (responses) {
        const classProduces = Reflect.getMetadata(DECORATORS.API_PRODUCES, metatype ?? prototype?.constructor);
        const methodProduces = Reflect.getMetadata(DECORATORS.API_PRODUCES, method);
        const produces = mergeAndUniq(classProduces, methodProduces);
        return mapResponsesToSwaggerResponses(responses, schemas, responseObjectFactory, produces, factories);
    }
    const status = getStatusCode(method);
    if (status) {
        return { [status]: { description: '' } };
    }
    return undefined;
};
const getStatusCode = (method) => {
    const status = Reflect.getMetadata(HTTP_CODE_METADATA, method);
    if (status) {
        return status;
    }
    const requestMethod = Reflect.getMetadata(METHOD_METADATA, method);
    switch (requestMethod) {
        case RequestMethod.POST:
            return HttpStatus.CREATED;
        default:
            return HttpStatus.OK;
    }
};
const omitParamType = (param) => omit(param, 'type');
const mapResponsesToSwaggerResponses = (responses, schemas, responseObjectFactory, produces = ['application/json'], factories) => {
    produces = isEmpty(produces) ? ['application/json'] : produces;
    const openApiResponses = mapValues(responses, (response) => responseObjectFactory.create(response, produces, schemas, factories));
    return mapValues(openApiResponses, omitParamType);
};
function applyMetadataFactory(prototype, instance) {
    const classPrototype = prototype;
    do {
        if (!prototype.constructor) {
            return;
        }
        if (!prototype.constructor[METADATA_FACTORY_NAME]) {
            continue;
        }
        const metadata = prototype.constructor[METADATA_FACTORY_NAME]();
        const methodKeys = Object.keys(metadata).filter((key) => typeof instance[key] === 'function');
        methodKeys.forEach((key) => {
            const { summary, deprecated, tags, ...meta } = metadata[key];
            if (Object.keys(meta).length === 0) {
                return;
            }
            if (meta.status === undefined) {
                meta.status = getStatusCode(instance[key]);
            }
            ApiResponse(meta, { overrideExisting: false })(classPrototype, key, Object.getOwnPropertyDescriptor(classPrototype, key));
        });
    } while ((prototype = Reflect.getPrototypeOf(prototype)) &&
        prototype !== Object.prototype &&
        prototype);
}
