export function encodeTerminalText(value: string): string {
  return value.replace(
    /[\x00-\x1f\x7f-\x9f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,
    (control) => `\\u${control.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );
}
