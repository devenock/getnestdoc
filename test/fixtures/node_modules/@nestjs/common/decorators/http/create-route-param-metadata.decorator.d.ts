import { PipeTransform } from '../../index.js';
import { CustomParamFactory } from '../../interfaces/features/custom-route-param-factory.interface.js';
import { Type } from '../../interfaces/index.js';
import { ParameterDecoratorOptions } from './route-params.decorator.js';
export type ParamDecoratorEnhancer = ParameterDecorator;
/**
 * Defines route param decorator
 *
 * @param factory
 * @param enhancers
 *
 * @publicApi
 */
export declare function createParamDecorator<FactoryData = any, FactoryOutput = any>(factory: CustomParamFactory<FactoryData, FactoryOutput>, enhancers?: ParamDecoratorEnhancer[]): (...dataOrPipes: (Type<PipeTransform> | PipeTransform | FactoryData | ParameterDecoratorOptions)[]) => ParameterDecorator;
