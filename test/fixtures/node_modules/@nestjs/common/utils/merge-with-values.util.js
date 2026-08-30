/* eslint-disable @typescript-eslint/no-empty-object-type */
export const MergeWithValues = (data) => {
    return (Metatype) => {
        const Type = class extends Metatype {
            constructor(...args) {
                super(...args);
            }
        };
        const token = Metatype.name + JSON.stringify(data);
        Object.defineProperty(Type, 'name', { value: token });
        Object.assign(Type.prototype, data);
        return Type;
    };
};
