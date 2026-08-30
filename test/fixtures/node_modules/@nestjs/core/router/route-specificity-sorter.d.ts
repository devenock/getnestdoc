import { ResolvedRoute } from './interfaces/resolved-route.interface.js';
/**
 * Static utility class that orders resolved routes by specificity so the
 * underlying HTTP adapter registers more specific patterns first.
 * Stateless — every method takes everything it needs as parameters.
 */
export declare class RouteSpecificitySorter {
    /**
     * Lower rank means more specific. A literal segment beats a named
     * param, which beats a named wildcard. A position that is absent on
     * one side is the least specific of all (it means the path is shorter
     * at that point).
     */
    private static readonly SEGMENT_KIND_RANK;
    /**
     * Returns a new array of routes sorted from most-specific to
     * least-specific. Routes that tie on specificity keep their original
     * declaration order.
     */
    static sort(routes: ResolvedRoute[]): ResolvedRoute[];
    private static comparePathSpecificity;
    private static rankSegmentByKind;
}
