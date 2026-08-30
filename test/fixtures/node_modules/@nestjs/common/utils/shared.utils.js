export const isUndefined = (obj) => typeof obj === 'undefined';
export const isObject = (fn) => !isNil(fn) && typeof fn === 'object';
export const isPlainObject = (fn) => {
    if (!isObject(fn)) {
        return false;
    }
    const proto = Object.getPrototypeOf(fn);
    if (proto === null) {
        return true;
    }
    const ctor = Object.prototype.hasOwnProperty.call(proto, 'constructor') &&
        proto.constructor;
    return (typeof ctor === 'function' &&
        ctor instanceof ctor &&
        Function.prototype.toString.call(ctor) ===
            Function.prototype.toString.call(Object));
};
export const addLeadingSlash = (path) => path && typeof path === 'string'
    ? path.charAt(0) !== '/' && path.substring(0, 2) !== '{/'
        ? '/' + path
        : path
    : '';
export const normalizePath = (path) => path
    ? path.startsWith('/')
        ? ('/' + path.replace(/\/+$/, '')).replace(/\/+/g, '/')
        : '/' + path.replace(/\/+$/, '')
    : '/';
export const stripEndSlash = (path) => path.endsWith('/') ? path.slice(0, -1) : path;
export const isFunction = (val) => typeof val === 'function';
export const isString = (val) => typeof val === 'string';
export const isNumber = (val) => typeof val === 'number';
export const isConstructor = (val) => val === 'constructor';
export const isNil = (val) => isUndefined(val) || val === null;
export const isEmpty = (value) => {
    if (isNil(value)) {
        return true;
    }
    if (Array.isArray(value)) {
        return value.length === 0;
    }
    return false;
};
export const isEmptyArray = (array) => {
    if (!Array.isArray(array)) {
        return false;
    }
    return array.length === 0;
};
export const isSymbol = (val) => typeof val === 'symbol';
