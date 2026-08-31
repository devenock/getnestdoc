import { Type } from '@nestjs/common';
export declare function DeepPartialType<T>(classRef: Type<T>, options?: {
    skipNullProperties?: boolean;
}): Type<DeepPartial<T>>;
export type DeepPartial<T> = T extends object ? {
    [P in keyof T]?: DeepPartial<T[P]>;
} : T;
