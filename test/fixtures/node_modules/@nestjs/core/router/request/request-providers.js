import { Scope } from '@nestjs/common';
import { REQUEST } from './request-constants.js';
const noop = () => { };
export const requestProvider = {
    provide: REQUEST,
    scope: Scope.REQUEST,
    useFactory: noop,
};
