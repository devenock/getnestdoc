export class ModuleCompiler {
    _moduleOpaqueKeyFactory;
    constructor(_moduleOpaqueKeyFactory) {
        this._moduleOpaqueKeyFactory = _moduleOpaqueKeyFactory;
    }
    get moduleOpaqueKeyFactory() {
        return this._moduleOpaqueKeyFactory;
    }
    async compile(moduleClsOrDynamic) {
        moduleClsOrDynamic = await moduleClsOrDynamic;
        const { type, dynamicMetadata } = this.extractMetadata(moduleClsOrDynamic);
        const token = dynamicMetadata
            ? this._moduleOpaqueKeyFactory.createForDynamic(type, dynamicMetadata, moduleClsOrDynamic)
            : this._moduleOpaqueKeyFactory.createForStatic(type, moduleClsOrDynamic);
        return { type, dynamicMetadata, token };
    }
    extractMetadata(moduleClsOrDynamic) {
        if (!this.isDynamicModule(moduleClsOrDynamic)) {
            return {
                type: moduleClsOrDynamic?.forwardRef
                    ? moduleClsOrDynamic.forwardRef()
                    : moduleClsOrDynamic,
                dynamicMetadata: undefined,
            };
        }
        const { module: type, ...dynamicMetadata } = moduleClsOrDynamic;
        return { type, dynamicMetadata };
    }
    isDynamicModule(moduleClsOrDynamic) {
        return !!moduleClsOrDynamic.module;
    }
}
