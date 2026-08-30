import { Logger, type RouteConflictPolicy, type VersioningOptions } from '@nestjs/common';
import { ResolvedRoute } from './interfaces/resolved-route.interface.js';
import { RouteConflict } from './interfaces/route-conflict.interface.js';
type SegmentKind = 'literal' | 'param' | 'wildcard';
interface PathSegment {
    kind: SegmentKind;
    value: string;
}
/**
 * Static utility class that detects overlapping HTTP routes and reports
 * them according to a per-kind policy. Stateless — every method takes
 * everything it needs as parameters.
 */
export declare class RouteConflictDetector {
    /**
     * Strips the leading `:` / `*` marker (if present) and tags each
     * segment as a literal, named param, or named wildcard. Supports both
     * bare named wildcards (`*path`) and adapter-normalized path-to-regexp
     * wildcard groups (`{*path}`).
     */
    static tokenizePath(rawPath: string): PathSegment[];
    /**
     * Decides whether two paths can match the same incoming request, given
     * only their declared patterns (no host/method/version considered).
     */
    static pathsCanOverlap(leftPath: string, rightPath: string): boolean;
    /**
     * Walks every unique pair of resolved routes and produces a conflict
     * record for each pair whose (method, host, version, path) tuples can
     * collide at runtime.
     */
    static detect(routes: ResolvedRoute[], versioningOptions: VersioningOptions | undefined): RouteConflict[];
    /**
     * Applies the per-kind policy to a set of conflicts: silences `'off'`,
     * logs `'warn'` once per conflict, and aggregates every `'error'`-level
     * conflict into a single `RouteConflictException`.
     */
    static handle(conflicts: RouteConflict[], policy: RouteConflictPolicy | undefined, logger: Logger): void;
    /**
     * Removes shadow conflicts that specificity sorting has already resolved.
     *
     * When `routeResolutionStrategy: 'specificity'` is active, the sort
     * promotes more-specific routes ahead of less-specific ones. A shadow
     * where the sort promoted the winner (it was declared *later* but sorted
     * *first*) is handled correctly at runtime — the more-specific route is
     * registered first and handles its requests while the less-specific route
     * handles the rest. Retaining such a conflict would cause `shadow: 'error'`
     * to abort an application whose routes actually work as intended.
     *
     * Shadows where the winner was already first in declaration order (the
     * sort did not swap them) are genuine and are kept unchanged. Duplicate
     * conflicts are always kept.
     *
     * @param conflicts     Conflicts detected on the sorted route list.
     * @param declarationOrder  Routes in their original declaration order
     *                          (i.e. before specificity sorting was applied).
     */
    static filterSortResolvedShadows(conflicts: RouteConflict[], declarationOrder: ResolvedRoute[]): RouteConflict[];
    private static segmentsCanOverlap;
    private static methodsCanOverlap;
    private static versionsCanOverlap;
    private static hostsCanOverlap;
    private static hostValuesCanMatchSameRequest;
    private static routesAreIdentical;
    private static hostsAreIdentical;
    private static hostValuesAreIdentical;
    private static versionsAreIdentical;
    private static forEachUniquePair;
    private static describeConflict;
}
export {};
