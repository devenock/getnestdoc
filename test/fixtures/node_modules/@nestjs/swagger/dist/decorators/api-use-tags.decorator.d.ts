import { ApiTagOptions } from '../interfaces/open-api-spec.interface.js';
export declare function ApiTags(...tags: (string | ApiTagOptions)[]): MethodDecorator & ClassDecorator;
