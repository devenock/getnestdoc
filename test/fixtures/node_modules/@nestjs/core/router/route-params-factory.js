import { RouteParamtypes } from '@nestjs/common/internal';
export class RouteParamsFactory {
    exchangeKeyForValue(key, data, { req, res, next }) {
        switch (key) {
            case RouteParamtypes.NEXT:
                return next;
            case RouteParamtypes.REQUEST:
                return req;
            case RouteParamtypes.RESPONSE:
                return res;
            case RouteParamtypes.BODY:
                return data && req.body ? req.body[data] : req.body;
            case RouteParamtypes.RAW_BODY:
                return req.rawBody;
            case RouteParamtypes.PARAM:
                return data ? req.params[data] : req.params;
            case RouteParamtypes.HOST:
                /* eslint-disable-next-line no-case-declarations */
                const hosts = req.hosts || {};
                return data ? hosts[data] : hosts;
            case RouteParamtypes.QUERY:
                return data ? req.query[data] : req.query;
            case RouteParamtypes.HEADERS:
                return data ? req.headers[data.toLowerCase()] : req.headers;
            case RouteParamtypes.SESSION:
                return req.session;
            case RouteParamtypes.FILE:
                return req[data || 'file'];
            case RouteParamtypes.FILES:
                return req.files;
            case RouteParamtypes.IP:
                return req.ip;
            default:
                return null;
        }
    }
}
