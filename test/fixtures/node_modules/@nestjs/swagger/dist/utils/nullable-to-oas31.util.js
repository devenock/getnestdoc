const COMBINATOR_KEYS = ['allOf', 'oneOf', 'anyOf'];
const DATA_KEYS = new Set(['example', 'examples', 'default', 'const', 'enum']);
const NAME_KEYED_MAPS = new Set([
    'properties',
    'patternProperties',
    '$defs',
    'schemas',
    'headers'
]);
export function convertNullableToOas31(document) {
    walk(document);
}
function walk(node) {
    if (Array.isArray(node)) {
        node.forEach(walk);
        return;
    }
    if (!isObject(node)) {
        return;
    }
    for (const [key, value] of Object.entries(node)) {
        if (DATA_KEYS.has(key) || key.startsWith('x-')) {
            continue;
        }
        if (NAME_KEYED_MAPS.has(key) && isObject(value)) {
            Object.values(value).forEach(walk);
        }
        else {
            walk(value);
        }
    }
    convertSchema(node);
}
function convertSchema(schema) {
    if (typeof schema.nullable !== 'boolean') {
        return;
    }
    const isNullable = schema.nullable;
    delete schema.nullable;
    if (!isNullable) {
        return;
    }
    const combinator = COMBINATOR_KEYS.find((key) => Array.isArray(schema[key]));
    if ('$ref' in schema || combinator) {
        schema.anyOf = [extractInnerSchema(schema, combinator), { type: 'null' }];
        return;
    }
    if (schema.type !== undefined) {
        const types = Array.isArray(schema.type)
            ? schema.type
            : [schema.type];
        schema.type = types.includes('null') ? types : [...types, 'null'];
    }
    if (Array.isArray(schema.enum) && !schema.enum.includes(null)) {
        schema.enum = [...schema.enum, null];
    }
}
function extractInnerSchema(schema, combinator) {
    const inner = {};
    if ('$ref' in schema) {
        inner.$ref = schema.$ref;
        delete schema.$ref;
    }
    if (combinator) {
        const members = schema[combinator];
        delete schema[combinator];
        if (schema.type === 'object' && !('properties' in schema)) {
            delete schema.type;
        }
        if (!('$ref' in inner) && combinator === 'allOf' && members.length === 1) {
            Object.assign(inner, members[0]);
        }
        else {
            inner[combinator] = members;
        }
    }
    return inner;
}
function isObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
