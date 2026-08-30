import { SCOPE_OPTIONS_METADATA } from '@nestjs/common/internal';
export function isDurable(provider) {
    const metadata = Reflect.getMetadata(SCOPE_OPTIONS_METADATA, provider);
    return metadata && metadata.durable;
}
