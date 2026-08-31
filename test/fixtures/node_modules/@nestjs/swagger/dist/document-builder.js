import { Logger } from '@nestjs/common';
import { clone, isString, isUndefined, negate, omit, pickBy } from 'es-toolkit/compat';
import { buildDocumentBase } from './fixtures/document.base.js';
import { GlobalParametersStorage } from './storages/global-parameters.storage.js';
import { GlobalResponsesStorage } from './storages/global-responses.storage.js';
export class DocumentBuilder {
    constructor() {
        this.logger = new Logger(DocumentBuilder.name);
        this.document = buildDocumentBase();
    }
    setTitle(title) {
        this.document.info.title = title;
        return this;
    }
    setDescription(description) {
        this.document.info.description = description;
        return this;
    }
    setVersion(version) {
        this.document.info.version = version;
        return this;
    }
    setTermsOfService(termsOfService) {
        this.document.info.termsOfService = termsOfService;
        return this;
    }
    setContact(name, url, email) {
        this.document.info.contact = { name, url, email };
        return this;
    }
    setLicense(name, url) {
        this.document.info.license = { name, url };
        return this;
    }
    setOpenAPIVersion(version) {
        if (/^\d+\.\d+\.\d+$/.test(version)) {
            this.document.openapi = version;
        }
        else {
            this.logger.warn('The OpenApi version is invalid. Expecting format "x.x.x"');
        }
        return this;
    }
    addServer(url, description, variables, serverExtraProperties) {
        const serverObjDef = {
            url,
            description,
            variables
        };
        if (serverExtraProperties) {
            const alreadyDefinedKeysForServerEntry = Object.keys(serverObjDef);
            for (const key in serverExtraProperties) {
                if (alreadyDefinedKeysForServerEntry.includes(key))
                    continue;
                const extraFieldValue = serverExtraProperties[key];
                serverObjDef[key] = extraFieldValue;
            }
        }
        this.document.servers.push(serverObjDef);
        return this;
    }
    setExternalDoc(description, url) {
        this.document.externalDocs = { description, url };
        return this;
    }
    setBasePath(path) {
        this.logger.warn('The "setBasePath" method has been deprecated. Now, a global prefix is populated automatically. If you want to ignore it, take a look here: https://docs.nestjs.com/recipes/swagger#global-prefix. Alternatively, you can use "addServer" method to set up multiple different paths.');
        return this;
    }
    addTag(name, description = '', externalDocs, options) {
        this.document.tags = this.document.tags.concat(pickBy({
            name,
            summary: options?.summary,
            description,
            externalDocs,
            parent: options?.parent,
            kind: options?.kind
        }, negate(isUndefined)));
        return this;
    }
    addExtension(extensionKey, extensionProperties, location = 'root') {
        if (!extensionKey.startsWith('x-')) {
            throw new Error('Extension key is not prefixed. Please ensure you prefix it with `x-`.');
        }
        if (location === 'root') {
            this.document[extensionKey] = clone(extensionProperties);
        }
        else {
            this.document[location][extensionKey] = clone(extensionProperties);
        }
        return this;
    }
    addSecurity(name, options) {
        this.document.components.securitySchemes = {
            ...(this.document.components.securitySchemes || {}),
            [name]: options
        };
        return this;
    }
    addGlobalResponse(...respones) {
        const groupedByStatus = respones.reduce((acc, response) => {
            const { status = 'default' } = response;
            acc[status] = omit(response, 'status');
            return acc;
        }, {});
        GlobalResponsesStorage.add(groupedByStatus);
        return this;
    }
    addGlobalParameters(...parameters) {
        GlobalParametersStorage.add(...parameters);
        return this;
    }
    addSecurityRequirements(name, requirements = []) {
        let securityRequirement;
        if (isString(name)) {
            securityRequirement = { [name]: requirements };
        }
        else {
            securityRequirement = name;
        }
        this.document.security = (this.document.security || []).concat({
            ...securityRequirement
        });
        return this;
    }
    addBearerAuth(options = {
        type: 'http'
    }, name = 'bearer') {
        this.addSecurity(name, {
            scheme: 'bearer',
            bearerFormat: 'JWT',
            ...options
        });
        return this;
    }
    addOAuth2(options = {
        type: 'oauth2'
    }, name = 'oauth2') {
        this.addSecurity(name, {
            type: 'oauth2',
            flows: {},
            ...options
        });
        return this;
    }
    addApiKey(options = {
        type: 'apiKey'
    }, name = 'api_key') {
        this.addSecurity(name, {
            type: 'apiKey',
            in: 'header',
            name,
            ...options
        });
        return this;
    }
    addBasicAuth(options = {
        type: 'http'
    }, name = 'basic') {
        this.addSecurity(name, {
            type: 'http',
            scheme: 'basic',
            ...options
        });
        return this;
    }
    addCookieAuth(cookieName = 'connect.sid', options = {
        type: 'apiKey'
    }, securityName = 'cookie') {
        this.addSecurity(securityName, {
            type: 'apiKey',
            in: 'cookie',
            name: cookieName,
            ...options
        });
        return this;
    }
    build() {
        return this.document;
    }
}
