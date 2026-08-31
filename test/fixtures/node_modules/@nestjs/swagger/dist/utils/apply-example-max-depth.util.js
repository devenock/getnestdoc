export function applyExampleMaxDepth(schemas, globalMaxDepth) {
    for (const schema of Object.values(schemas)) {
        walkSchema(schema, globalMaxDepth);
    }
}
function walkSchema(schema, globalMaxDepth) {
    if (!schema || typeof schema !== 'object') {
        return;
    }
    const perPropOverride = typeof schema.exampleMaxDepth === 'number'
        ? schema.exampleMaxDepth
        : undefined;
    const effectiveMax = perPropOverride !== undefined ? perPropOverride : globalMaxDepth;
    if (effectiveMax !== undefined) {
        if ('example' in schema) {
            schema.example = trimExampleValue(schema.example, effectiveMax);
        }
        if ('examples' in schema && Array.isArray(schema.examples)) {
            schema.examples = schema.examples.map((entry) => trimExampleValue(entry, effectiveMax));
        }
    }
    if ('exampleMaxDepth' in schema) {
        delete schema.exampleMaxDepth;
    }
    if (schema.properties && typeof schema.properties === 'object') {
        for (const prop of Object.values(schema.properties)) {
            walkSchema(prop, globalMaxDepth);
        }
    }
    if (schema.items) {
        walkSchema(schema.items, globalMaxDepth);
    }
    for (const key of ['allOf', 'oneOf', 'anyOf']) {
        const combinator = schema[key];
        if (Array.isArray(combinator)) {
            for (const sub of combinator) {
                walkSchema(sub, globalMaxDepth);
            }
        }
    }
    if (schema.additionalProperties &&
        typeof schema.additionalProperties === 'object') {
        walkSchema(schema.additionalProperties, globalMaxDepth);
    }
}
function trimExampleValue(value, remainingDepth, path = new WeakSet()) {
    if (value === null || typeof value !== 'object') {
        return value;
    }
    const isArray = Array.isArray(value);
    if (!isArray && value.constructor !== Object) {
        return value;
    }
    if (remainingDepth <= 0) {
        return isArray ? [] : {};
    }
    if (path.has(value)) {
        return isArray ? [] : {};
    }
    path.add(value);
    try {
        if (isArray) {
            return value.map((entry) => trimExampleValue(entry, remainingDepth - 1, path));
        }
        const trimmed = {};
        for (const [key, child] of Object.entries(value)) {
            trimmed[key] = trimExampleValue(child, remainingDepth - 1, path);
        }
        return trimmed;
    }
    finally {
        path.delete(value);
    }
}
