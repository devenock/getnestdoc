import { __decorate } from "tslib";
import { Module } from '@nestjs/common';
import { MetadataScanner } from '../metadata-scanner.js';
import { DiscoveryService } from './discovery-service.js';
/**
 * @publicApi
 */
let DiscoveryModule = class DiscoveryModule {
};
DiscoveryModule = __decorate([
    Module({
        providers: [MetadataScanner, DiscoveryService],
        exports: [MetadataScanner, DiscoveryService],
    })
], DiscoveryModule);
export { DiscoveryModule };
