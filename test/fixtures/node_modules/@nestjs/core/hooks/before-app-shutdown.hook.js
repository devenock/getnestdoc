import { Logger } from '@nestjs/common';
import { isFunction, isNil } from '@nestjs/common/internal';
import { iterate } from 'iterare';
import { getInstancesGroupedByHierarchyLevel } from './utils/get-instances-grouped-by-hierarchy-level.js';
import { getSortedHierarchyLevels } from './utils/get-sorted-hierarchy-levels.js';
/**
 * Checks if the given instance has the `beforeApplicationShutdown` function
 *
 * @param instance The instance which should be checked
 */
function hasBeforeApplicationShutdownHook(instance) {
    return isFunction(instance.beforeApplicationShutdown);
}
/**
 * Calls the given instances
 */
function callOperator(instances, signal) {
    return iterate(instances)
        .filter(instance => !isNil(instance))
        .filter(hasBeforeApplicationShutdownHook)
        .map(async (instance) => instance.beforeApplicationShutdown(signal))
        .toArray();
}
/**
 * Calls the `beforeApplicationShutdown` function on the module and its children
 * (providers / controllers).
 *
 * @param moduleRef The module which will be initialized
 * @param signal The signal which caused the shutdown
 */
export async function callBeforeAppShutdownHook(moduleRef, signal) {
    const providers = moduleRef.getNonAliasProviders();
    const [_, moduleClassHost] = providers.shift();
    const groupedInstances = getInstancesGroupedByHierarchyLevel(moduleRef.controllers, moduleRef.injectables, moduleRef.middlewares, providers);
    const levels = getSortedHierarchyLevels(groupedInstances, 'DESC');
    for (const level of levels) {
        const results = await Promise.allSettled(callOperator(groupedInstances.get(level), signal));
        results
            .filter((result) => result.status === 'rejected')
            .forEach(result => Logger.error(result.reason, result.reason?.stack));
    }
    const moduleClassInstance = moduleClassHost.instance;
    if (moduleClassInstance &&
        hasBeforeApplicationShutdownHook(moduleClassInstance) &&
        moduleClassHost.isDependencyTreeStatic()) {
        try {
            await moduleClassInstance.beforeApplicationShutdown(signal);
        }
        catch (err) {
            Logger.error(err, err?.stack);
        }
    }
}
