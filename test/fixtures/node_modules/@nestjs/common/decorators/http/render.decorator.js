import { RENDER_METADATA } from '../../constants.js';
/**
 * Route handler method Decorator.  Defines a template to be rendered by the controller.
 *
 * For example: `@Render('index')`
 *
 * @param template name of the render engine template file
 *
 * @see [Model-View-Controller](https://docs.nestjs.com/techniques/mvc)
 *
 * @publicApi
 */
export function Render(template) {
    return (target, key, descriptor) => {
        Reflect.defineMetadata(RENDER_METADATA, template, descriptor.value);
        return descriptor;
    };
}
