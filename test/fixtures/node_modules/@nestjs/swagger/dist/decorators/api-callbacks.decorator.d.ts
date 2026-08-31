import { CallBackObject } from '../interfaces/callback-object.interface.js';
export declare function ApiCallbacks(...callbackObject: Array<CallBackObject<any>>): MethodDecorator & ClassDecorator;
