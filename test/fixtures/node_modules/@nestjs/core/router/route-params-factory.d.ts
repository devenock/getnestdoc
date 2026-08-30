import { IRouteParamsFactory } from './interfaces/route-params-factory.interface.js';
import { RouteParamtypes } from '@nestjs/common/internal';
export declare class RouteParamsFactory implements IRouteParamsFactory {
    exchangeKeyForValue<TRequest extends Record<string, any> = any, TResponse = any, TResult = any>(key: RouteParamtypes | string, data: string, { req, res, next }: {
        req: TRequest;
        res: TResponse;
        next: Function;
    }): TResult | null;
}
