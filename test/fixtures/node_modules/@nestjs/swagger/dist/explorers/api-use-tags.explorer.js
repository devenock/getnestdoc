import { DECORATORS } from '../constants.js';
export const exploreGlobalApiTagsMetadata = (autoTagControllers) => (metatype) => {
    const decoratorTags = Reflect.getMetadata(DECORATORS.API_TAGS, metatype);
    const isEmpty = !decoratorTags || decoratorTags.length === 0;
    if (isEmpty && autoTagControllers) {
        const defaultTag = metatype.name.replace(/Controller$/, '');
        return {
            tags: [defaultTag]
        };
    }
    return isEmpty ? undefined : { tags: decoratorTags };
};
export const exploreApiTagsMetadata = (instance, prototype, method) => Reflect.getMetadata(DECORATORS.API_TAGS, method);
