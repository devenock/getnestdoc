import { Scope } from '@nestjs/common';
import { INQUIRER } from './inquirer-constants.js';
const noop = () => { };
export const inquirerProvider = {
    provide: INQUIRER,
    scope: Scope.TRANSIENT,
    useFactory: noop,
};
