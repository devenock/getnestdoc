export function normalizeRelPath(input) {
    const output = input.replace(/\/\/+/g, '/');
    return output;
}
