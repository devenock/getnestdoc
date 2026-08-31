import { DECORATORS } from '../constants.js';
import { getSchemaPath } from '../utils/index.js';
export const exploreApiCallbacksMetadata = (instance, prototype, method) => {
    const callbacksData = Reflect.getMetadata(DECORATORS.API_CALLBACKS, method);
    if (!callbacksData)
        return callbacksData;
    return callbacksData.reduce((acc, callbackData) => {
        const { name: eventName, callbackUrl, method: callbackMethod, requestBody, expectedResponse } = callbackData;
        return {
            ...acc,
            [eventName]: {
                [callbackUrl]: {
                    [callbackMethod]: {
                        requestBody: {
                            required: true,
                            content: {
                                'application/json': {
                                    schema: {
                                        $ref: getSchemaPath(requestBody.type)
                                    }
                                }
                            }
                        },
                        responses: {
                            [expectedResponse.status]: {
                                description: expectedResponse.description ||
                                    'Your server returns this code if it accepts the callback'
                            }
                        }
                    }
                }
            }
        };
    }, {});
};
