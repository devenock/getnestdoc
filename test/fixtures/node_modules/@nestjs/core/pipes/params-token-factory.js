import { RouteParamtypes } from '@nestjs/common/internal';
export class ParamsTokenFactory {
    exchangeEnumForString(type) {
        switch (type) {
            case RouteParamtypes.BODY:
                return 'body';
            case RouteParamtypes.PARAM:
                return 'param';
            case RouteParamtypes.QUERY:
                return 'query';
            default:
                return 'custom';
        }
    }
}
