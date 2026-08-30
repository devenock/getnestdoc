import { isUndefined } from '@nestjs/common/internal';
export function isClassProvider(provider) {
    return Boolean(provider?.useClass);
}
export function isValueProvider(provider) {
    const providerValue = provider?.useValue;
    return !isUndefined(providerValue);
}
export function isFactoryProvider(provider) {
    return Boolean(provider.useFactory);
}
