import { HttpStatus } from '@nestjs/common';
import { omit } from 'es-toolkit/compat';
import { DECORATORS } from '../constants.js';
import { getTypeIsArrayTuple } from './helpers.js';
export function ApiResponse(options, { overrideExisting } = { overrideExisting: true }) {
    const apiResponseMetadata = options;
    const [type, isArray] = getTypeIsArrayTuple(apiResponseMetadata.type, apiResponseMetadata.isArray);
    apiResponseMetadata.type = type;
    apiResponseMetadata.isArray = isArray;
    options.description = options.description ? options.description : '';
    const statusKey = options.status || 'default';
    const incomingEntry = omit(options, 'status');
    return (target, key, descriptor) => {
        if (descriptor) {
            const responses = Reflect.getMetadata(DECORATORS.API_RESPONSE, descriptor.value);
            if (responses && !overrideExisting) {
                return descriptor;
            }
            Reflect.defineMetadata(DECORATORS.API_RESPONSE, {
                ...responses,
                [statusKey]: mergeResponseEntry(responses?.[statusKey], incomingEntry)
            }, descriptor.value);
            return descriptor;
        }
        const responses = Reflect.getMetadata(DECORATORS.API_RESPONSE, target);
        if (responses && !overrideExisting) {
            return descriptor;
        }
        Reflect.defineMetadata(DECORATORS.API_RESPONSE, {
            ...responses,
            [statusKey]: mergeResponseEntry(responses?.[statusKey], incomingEntry)
        }, target);
        return target;
    };
}
function mergeResponseEntry(existing, incoming) {
    if (!existing) {
        return incoming;
    }
    const existingDesc = existing.description || '';
    const incomingDesc = incoming.description || '';
    const mergedDescription = existingDesc && incomingDesc
        ? `${existingDesc}\n\n${incomingDesc}`
        : existingDesc || incomingDesc;
    const mergedExamples = existing.examples && incoming.examples
        ? { ...existing.examples, ...incoming.examples }
        : (incoming.examples ?? existing.examples);
    return {
        ...existing,
        ...incoming,
        description: mergedDescription,
        ...(mergedExamples !== undefined ? { examples: mergedExamples } : {})
    };
}
const decorators = {};
const statusList = Object.keys(HttpStatus)
    .filter((key) => !isNaN(Number(HttpStatus[key])))
    .map((key) => {
    const functionName = key
        .split('_')
        .map((strToken) => `${strToken[0].toUpperCase()}${strToken.slice(1).toLowerCase()}`)
        .join('');
    return {
        code: Number(HttpStatus[key]),
        functionName: `Api${functionName}Response`
    };
});
statusList.forEach(({ code, functionName }) => {
    decorators[functionName] = function (options = {}) {
        return ApiResponse({
            ...options,
            status: code
        });
    };
});
export const { ApiContinueResponse, ApiSwitchingProtocolsResponse, ApiProcessingResponse, ApiEarlyhintsResponse, ApiOkResponse, ApiCreatedResponse, ApiAcceptedResponse, ApiNonAuthoritativeInformationResponse, ApiNoContentResponse, ApiResetContentResponse, ApiPartialContentResponse, ApiAmbiguousResponse, ApiMovedPermanentlyResponse, ApiFoundResponse, ApiSeeOtherResponse, ApiNotModifiedResponse, ApiTemporaryRedirectResponse, ApiPermanentRedirectResponse, ApiBadRequestResponse, ApiUnauthorizedResponse, ApiPaymentRequiredResponse, ApiForbiddenResponse, ApiNotFoundResponse, ApiMethodNotAllowedResponse, ApiNotAcceptableResponse, ApiProxyAuthenticationRequiredResponse, ApiRequestTimeoutResponse, ApiConflictResponse, ApiGoneResponse, ApiLengthRequiredResponse, ApiPreconditionFailedResponse, ApiPayloadTooLargeResponse, ApiUriTooLongResponse, ApiUnsupportedMediaTypeResponse, ApiRequestedRangeNotSatisfiableResponse, ApiExpectationFailedResponse, ApiIAmATeapotResponse, ApiMisdirectedResponse, ApiUnprocessableEntityResponse, ApiFailedDependencyResponse, ApiPreconditionRequiredResponse, ApiTooManyRequestsResponse, ApiInternalServerErrorResponse, ApiNotImplementedResponse, ApiBadGatewayResponse, ApiServiceUnavailableResponse, ApiGatewayTimeoutResponse, ApiHttpVersionNotSupportedResponse } = decorators;
export const ApiDefaultResponse = (options = {}) => ApiResponse({
    ...options,
    status: 'default'
});
