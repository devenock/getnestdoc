import { favIconHtml, htmlTemplateString, jsTemplateString } from './constants.js';
import { buildJSInitOptions } from './helpers.js';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
export function buildSwaggerInitJS(swaggerDoc, customOptions = {}) {
    const { swaggerOptions = {}, swaggerUrl } = customOptions;
    const swaggerInitOptions = {
        swaggerDoc,
        swaggerUrl,
        customOptions: swaggerOptions
    };
    const jsInitOptions = buildJSInitOptions(swaggerInitOptions);
    return jsTemplateString.replace('<% swaggerOptions %>', jsInitOptions);
}
let swaggerAssetsAbsoluteFSPath;
export function getSwaggerAssetsAbsoluteFSPath() {
    if (!swaggerAssetsAbsoluteFSPath) {
        swaggerAssetsAbsoluteFSPath = require('swagger-ui-dist/absolute-path.js')();
    }
    return swaggerAssetsAbsoluteFSPath;
}
function toExternalScriptTag(url) {
    return `<script src='${url}'></script>`;
}
function toInlineScriptTag(jsCode) {
    return `<script>${jsCode}</script>`;
}
function toExternalStylesheetTag(url) {
    return `<link href='${url}' rel='stylesheet'>`;
}
function toTags(customCode, toScript) {
    if (!customCode) {
        return '';
    }
    if (typeof customCode === 'string') {
        return toScript(customCode);
    }
    else {
        return customCode.map(toScript).join('\n');
    }
}
export function buildSwaggerHTML(baseUrl, customOptions = {}) {
    const { customCss = '', customJs = '', customJsStr = '', customfavIcon = false, customSiteTitle = 'Swagger UI', customCssUrl = '', explorer = false } = customOptions;
    const favIconString = customfavIcon
        ? `<link rel='icon' href='${customfavIcon}' />`
        : favIconHtml;
    const explorerCss = explorer
        ? ''
        : '.swagger-ui .topbar .download-url-wrapper { display: none }';
    return htmlTemplateString
        .replace('<% customCss %>', () => customCss)
        .replace('<% explorerCss %>', () => explorerCss)
        .replace('<% favIconString %>', () => favIconString)
        .replace(/<% baseUrl %>/g, () => baseUrl)
        .replace('<% customJs %>', () => toTags(customJs, toExternalScriptTag))
        .replace('<% customJsStr %>', () => toTags(customJsStr, toInlineScriptTag))
        .replace('<% customCssUrl %>', () => toTags(customCssUrl, toExternalStylesheetTag))
        .replace('<% title %>', () => customSiteTitle);
}
