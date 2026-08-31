import { OperationObject } from '../interfaces/open-api-spec.interface.js';
export type ApiOperationOptions = Partial<OperationObject>;
export declare function ApiOperation(options: ApiOperationOptions, { overrideExisting }?: {
    overrideExisting: boolean;
}): MethodDecorator;
