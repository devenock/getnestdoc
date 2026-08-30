import { Logger } from '@nestjs/common';
import { isFunction, isNil } from '@nestjs/common/internal';
import { iterate } from 'iterare';
import { getInstancesGroupedByHierarchyLevel } from './utils/get-instances-grouped-by-hierarchy-level.js';
import { getSortedHierarchyLevels } from './utils/get-sorted-hierarchy-levels.js';
/**
 * Returns true or false if the given instance has a `onModuleDestroy` function
 *
 * @param instance The instance which should be checked
 */
function hasOnModuleDestroyHook(instance) {
    return isFunction(instance.onModuleDestroy);
}
/**
 * Calls the given instances onModuleDestroy hook
 */
function callOperator(instances) {
    return iterate(instances)
        .filter(instance => !isNil(instance))
        .filter(hasOnModuleDestroyHook)
        .map(async (instance) => instance.onModuleDestroy())
        .toArray();
}
/**
 * Calls the `onModuleDestroy` function on the module and its children
 * (providers / controllers).
 *
 * @param moduleRef The module which will be initialized
 */
export async function callModuleDestroyHook(moduleRef) {
    const providers = moduleRef.getNonAliasProviders();
    // Module (class) instance is the first element of the providers array
    // Lifecycle hook has to be called once all classes are properly destroyed
    const [_, moduleClassHost] = providers.shift();
    const groupedInstances = getInstancesGroupedByHierarchyLevel(moduleRef.controllers, moduleRef.injectables, moduleRef.middlewares, providers);
    const levels = getSortedHierarchyLevels(groupedInstances, 'DESC');
    for (const level of levels) {
        const results = await Promise.allSettled(callOperator(groupedInstances.get(level)));
        results
            .filter((result) => result.status === 'rejected')
            .forEach(result => Logger.error(result.reason, result.reason?.stack));
    }
    // Call the module instance itself
    const moduleClassInstance = moduleClassHost.instance;
    if (moduleClassInstance &&
        hasOnModuleDestroyHook(moduleClassInstance) &&
        moduleClassHost.isDependencyTreeStatic()) {
        try {
            await moduleClassInstance.onModuleDestroy();
        }
        catch (err) {
            Logger.error(err, err?.stack);
        }
    }
}
