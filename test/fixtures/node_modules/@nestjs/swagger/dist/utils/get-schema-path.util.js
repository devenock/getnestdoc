import { isString } from '@nestjs/common/utils/shared.utils.js';
import { DECORATORS } from '../constants.js';
export function getSchemaPath(model) {
    const modelName = isString(model) ? model : getSchemaNameByClass(model);
    return `#/components/schemas/${modelName}`;
}
function getSchemaNameByClass(target) {
    if (!target || typeof target !== 'function') {
        return '';
    }
    const customSchema = Reflect.getOwnMetadata(DECORATORS.API_SCHEMA, target);
    if (!customSchema || customSchema.length === 0) {
        return target.name;
    }
    return customSchema[customSchema.length - 1].name ?? target.name;
}
export function refs(...models) {
    return models.map((item) => ({
        $ref: getSchemaPath(item.name)
    }));
}
