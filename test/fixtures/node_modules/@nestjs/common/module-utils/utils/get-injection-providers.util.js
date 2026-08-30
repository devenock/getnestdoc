import { isUndefined } from '../../utils/shared.utils.js';
/**
 * @param value
 * @returns `true` if value is `OptionalFactoryDependency`
 */
function isOptionalFactoryDependency(value) {
    return (!isUndefined(value.token) &&
        !isUndefined(value.optional) &&
        !value.prototype);
}
const mapInjectToTokens = (t) => isOptionalFactoryDependency(t) ? t.token : t;
/**
 *
 * @param providers List of a module's providers
 * @param tokens Injection tokens needed for a useFactory function (usually the module's options' token)
 * @returns All the providers needed for the tokens' injection (searched recursively)
 */
export function getInjectionProviders(providers, tokens) {
    const result = [];
    let search = tokens.map(mapInjectToTokens);
    while (search.length > 0) {
        const match = (providers ?? []).filter(p => !result.includes(p) && // this prevents circular loops and duplication
            (search.includes(p) || search.includes(p?.provide)));
        result.push(...match);
        // get injection tokens of the matched providers, if any
        search = match
            .filter(p => p?.inject)
            .flatMap(p => p.inject)
            .map(mapInjectToTokens);
    }
    return result;
}
