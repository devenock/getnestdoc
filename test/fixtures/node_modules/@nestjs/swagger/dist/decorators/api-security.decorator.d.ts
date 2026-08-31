import { SecurityRequirementObject } from '../interfaces/open-api-spec.interface.js';
export declare function ApiSecurity(name: string | SecurityRequirementObject, requirements?: string[]): ClassDecorator & MethodDecorator;
