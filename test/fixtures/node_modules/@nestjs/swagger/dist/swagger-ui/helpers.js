import { randomUUID } from 'crypto';
export function buildJSInitOptions(initOptions) {
    const fns = [];
    const placeholders = [];
    let json = JSON.stringify(initOptions, (key, value) => {
        if (typeof value === 'function') {
            const placeholder = randomUUID();
            fns.push(value);
            placeholders.push(placeholder);
            return placeholder;
        }
        return value;
    }, 2);
    placeholders.forEach((placeholder, i) => {
        json = json.replace(`"${placeholder}"`, () => fns[i].toString());
    });
    return `let options = ${json};`;
}
