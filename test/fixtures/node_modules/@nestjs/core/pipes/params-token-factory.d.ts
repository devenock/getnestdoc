import type { Paramtype } from '@nestjs/common';
import { RouteParamtypes } from '@nestjs/common/internal';
export declare class ParamsTokenFactory {
    exchangeEnumForString(type: RouteParamtypes): Paramtype;
}
