export function getGlobalPrefix(app) {
    const internalConfigRef = app.config;
    return (internalConfigRef && internalConfigRef.getGlobalPrefix()) || '';
}
