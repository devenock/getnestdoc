import { getClassScope } from '../helpers/get-class-scope.js';
import { isDurable } from '../helpers/is-durable.js';
import { InstanceWrapper } from '../injector/instance-wrapper.js';
export class MiddlewareContainer {
    container;
    middleware = new Map();
    configurationSets = new Map();
    constructor(container) {
        this.container = container;
    }
    getMiddlewareCollection(moduleKey) {
        if (!this.middleware.has(moduleKey)) {
            const moduleRef = this.container.getModuleByKey(moduleKey);
            this.middleware.set(moduleKey, moduleRef.middlewares);
        }
        return this.middleware.get(moduleKey);
    }
    getConfigurations() {
        return this.configurationSets;
    }
    insertConfig(configList, moduleKey) {
        const middleware = this.getMiddlewareCollection(moduleKey);
        const targetConfig = this.getTargetConfig(moduleKey);
        const configurations = configList || [];
        const insertMiddleware = (metatype) => {
            const token = metatype;
            middleware.set(token, new InstanceWrapper({
                scope: getClassScope(metatype),
                durable: isDurable(metatype),
                name: token?.name ?? token,
                metatype,
                token,
            }));
        };
        configurations.forEach(config => {
            [].concat(config.middleware).map(insertMiddleware);
            targetConfig.add(config);
        });
    }
    getTargetConfig(moduleName) {
        if (!this.configurationSets.has(moduleName)) {
            this.configurationSets.set(moduleName, new Set());
        }
        return this.configurationSets.get(moduleName);
    }
}
