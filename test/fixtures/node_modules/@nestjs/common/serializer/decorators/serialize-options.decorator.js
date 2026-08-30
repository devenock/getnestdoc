import { SetMetadata } from '../../decorators/index.js';
import { CLASS_SERIALIZER_OPTIONS } from '../class-serializer.constants.js';
/**
 * @publicApi
 */
export const SerializeOptions = (options) => SetMetadata(CLASS_SERIALIZER_OPTIONS, options);
