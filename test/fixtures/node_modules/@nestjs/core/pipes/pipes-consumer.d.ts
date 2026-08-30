import type { ArgumentMetadata, PipeTransform } from '@nestjs/common';
export declare class PipesConsumer {
    private readonly paramsTokenFactory;
    apply<TInput = unknown>(value: TInput, metadata: ArgumentMetadata, pipes: PipeTransform[]): Promise<unknown>;
    applyPipes<TInput = unknown>(value: TInput, { metatype, type, data, schema }: ArgumentMetadata, transforms: PipeTransform[]): Promise<unknown>;
}
