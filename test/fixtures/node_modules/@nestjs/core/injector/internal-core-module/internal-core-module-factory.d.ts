import { HttpAdapterHost } from '../../helpers/http-adapter-host.js';
import { GraphInspector } from '../../inspector/graph-inspector.js';
import { ModuleOverride } from '../../interfaces/module-override.interface.js';
import { DependenciesScanner } from '../../scanner.js';
import { ModuleCompiler } from '../compiler.js';
import { NestContainer } from '../container.js';
export declare class InternalCoreModuleFactory {
    static create(container: NestContainer, scanner: DependenciesScanner, moduleCompiler: ModuleCompiler, httpAdapterHost: HttpAdapterHost, graphInspector: GraphInspector, moduleOverrides?: ModuleOverride[]): import("@nestjs/common").DynamicModule;
}
