import { ApiSecurity } from './api-security.decorator.js';
export function ApiOAuth2(scopes, name = 'oauth2') {
    return ApiSecurity(name, scopes);
}
