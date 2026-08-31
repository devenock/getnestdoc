import { cloneDeep } from 'es-toolkit/compat';
import { removeUndefinedKeys } from '../utils/remove-undefined-keys.js';
export class MimetypeContentWrapper {
    wrap(mimetype, obj) {
        const content = mimetype.reduce((acc, item) => ({ ...acc, [item]: removeUndefinedKeys(cloneDeep(obj)) }), {});
        return { content };
    }
}
