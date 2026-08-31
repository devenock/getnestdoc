// Every string here originates from a *third-party* .d.ts file's JSDoc —
// untrusted, attacker-controlled text, not something the CLI's own caller
// wrote. Verified as a real issue, not theoretical: a JSDoc comment
// containing a raw ESC byte followed by an OSC sequence reached the final
// rendered output completely unfiltered, byte for byte. That's not just
// cosmetic — some terminals interpret OSC 52 as "write to the clipboard"
// with no confirmation prompt, so an attacker-controlled doc string could
// silently replace what a user copies next (a credential, a command to
// paste later) just from running `nest-doc <malicious-package>`.
//
// Strips every C0 control byte except \t and \n, which the renderer's own
// wrapping already treats as ordinary whitespace and which carry no
// escape-sequence risk on their own. This runs before any of *our own*
// legitimate ANSI colour codes are added at render time, so it only ever
// touches source text, never the styling this tool applies itself.
// eslint-disable-next-line no-control-regex -- stripping control bytes is the point
const CONTROL_CHARS_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

export function sanitizeExtractedText(text: string): string {
  return text.replace(CONTROL_CHARS_RE, "");
}
