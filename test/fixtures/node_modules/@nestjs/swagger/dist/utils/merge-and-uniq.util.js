import { merge, uniq } from 'es-toolkit/compat';
export function mergeAndUniq(a = [], b = []) {
    return uniq(merge(a, b));
}
