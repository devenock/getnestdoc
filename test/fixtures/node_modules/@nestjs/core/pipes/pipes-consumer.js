import { ParamsTokenFactory } from './params-token-factory.js';
export class PipesConsumer {
    paramsTokenFactory = new ParamsTokenFactory();
    async apply(value, metadata, pipes) {
        const token = this.paramsTokenFactory.exchangeEnumForString(metadata.type);
        return this.applyPipes(value, {
            metatype: metadata.metatype,
            type: token,
            data: metadata.data,
            schema: metadata.schema,
        }, pipes);
    }
    async applyPipes(value, { metatype, type, data, schema }, transforms) {
        let result = value;
        for (const pipe of transforms) {
            result = await pipe.transform(result, { metatype, type, data, schema });
        }
        return result;
    }
}
