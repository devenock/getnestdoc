import { Logger } from '@nestjs/common';
const MISSING_REQUIRED_DEPENDENCY = (defaultPlatform, transport) => `No driver (${transport}) has been selected. In order to use the default driver, please, install the "${defaultPlatform}" package ($ npm install ${defaultPlatform}).`;
const logger = new Logger('PackageLoader');
export async function loadAdapter(defaultPlatform, transport, loaderFn) {
    try {
        return loaderFn ? await loaderFn() : await import(defaultPlatform);
    }
    catch (e) {
        logger.error(MISSING_REQUIRED_DEPENDENCY(defaultPlatform, transport));
        process.exit(1);
    }
}
