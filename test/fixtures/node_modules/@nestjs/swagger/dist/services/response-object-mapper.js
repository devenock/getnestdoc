import { omit, pick } from 'es-toolkit/compat';
import { getSchemaPath } from '../utils/index.js';
import { MimetypeContentWrapper } from './mimetype-content-wrapper.js';
export class ResponseObjectMapper {
    constructor() {
        this.mimetypeContentWrapper = new MimetypeContentWrapper();
    }
    toArrayRefObject(response, name, produces) {
        const exampleKeys = ['example', 'examples'];
        const arraySchema = {
            type: 'array',
            items: { $ref: getSchemaPath(name) }
        };
        const schema = response.nullable
            ? { ...arraySchema, nullable: true }
            : arraySchema;
        return {
            ...omit(response, [...exampleKeys, 'nullable']),
            ...this.mimetypeContentWrapper.wrap(produces, {
                schema,
                ...pick(response, exampleKeys)
            })
        };
    }
    toRefObject(response, name, produces) {
        const exampleKeys = ['example', 'examples'];
        const schema = response.nullable
            ? {
                nullable: true,
                type: 'object',
                allOf: [{ $ref: getSchemaPath(name) }]
            }
            : { $ref: getSchemaPath(name) };
        return {
            ...omit(response, [...exampleKeys, 'nullable']),
            ...this.mimetypeContentWrapper.wrap(produces, {
                schema,
                ...pick(response, exampleKeys)
            })
        };
    }
    wrapSchemaWithContent(response, produces) {
        if (!response.schema &&
            !('example' in response) &&
            !('examples' in response)) {
            return response;
        }
        const exampleKeys = ['example', 'examples'];
        const content = this.mimetypeContentWrapper.wrap(produces, {
            schema: response.schema,
            ...pick(response, exampleKeys)
        });
        const keysToOmit = [...exampleKeys, 'schema'];
        return {
            ...omit(response, keysToOmit),
            ...content
        };
    }
}
