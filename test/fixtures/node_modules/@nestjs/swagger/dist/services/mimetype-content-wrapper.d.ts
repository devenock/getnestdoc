import { ContentObject } from '../interfaces/open-api-spec.interface.js';
export declare class MimetypeContentWrapper {
    wrap(mimetype: string[], obj: Record<string, any>): Record<'content', ContentObject>;
}
