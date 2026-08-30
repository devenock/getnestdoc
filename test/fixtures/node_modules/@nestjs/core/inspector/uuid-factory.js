import { DeterministicUuidRegistry } from './deterministic-uuid-registry.js';
import { randomStringGenerator } from '@nestjs/common/internal';
export var UuidFactoryMode;
(function (UuidFactoryMode) {
    UuidFactoryMode["Random"] = "random";
    UuidFactoryMode["Deterministic"] = "deterministic";
})(UuidFactoryMode || (UuidFactoryMode = {}));
export class UuidFactory {
    static _mode = UuidFactoryMode.Random;
    static set mode(value) {
        this._mode = value;
    }
    static get(key = '') {
        return this._mode === UuidFactoryMode.Deterministic
            ? DeterministicUuidRegistry.get(key)
            : randomStringGenerator();
    }
}
