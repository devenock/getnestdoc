function isDynamicDefault(value) {
    if (value === null ||
        value === undefined ||
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean') {
        return false;
    }
    if (typeof value === 'function') {
        return true;
    }
    if (Array.isArray(value)) {
        return false;
    }
    if (typeof value === 'object' && value.constructor === Object) {
        return false;
    }
    return true;
}
export function stripDynamicDefaults(schemas) {
    for (const schema of Object.values(schemas)) {
        stripFromSchema(schema);
    }
}
function stripFromSchema(schema) {
    if (!schema || typeof schema !== 'object') {
        return;
    }
    if ('default' in schema && isDynamicDefault(schema.default)) {
        delete schema.default;
    }
    if (schema.properties) {
        for (const prop of Object.values(schema.properties)) {
            stripFromSchema(prop);
        }
    }
    if (schema.items) {
        stripFromSchema(schema.items);
    }
    for (const key of ['allOf', 'oneOf', 'anyOf']) {
        if (schema[key]) {
            for (const sub of schema[key]) {
                stripFromSchema(sub);
            }
        }
    }
}
