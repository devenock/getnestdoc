export class InitializeOnPreviewAllowlist {
    static allowlist = new WeakMap();
    static add(type) {
        this.allowlist.set(type, true);
    }
    static has(type) {
        return this.allowlist.has(type);
    }
}
