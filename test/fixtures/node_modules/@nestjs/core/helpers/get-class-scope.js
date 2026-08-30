import { SCOPE_OPTIONS_METADATA } from '@nestjs/common/internal';
export function getClassScope(provider) {
    const metadata = Reflect.getMetadata(SCOPE_OPTIONS_METADATA, provider);
    return metadata && metadata.scope;
}
