/**
 * Runtime polyfills loaded before anything else (imported first in App.tsx).
 *
 * Hermes (React Native's JS engine) does not implement `TextEncoder`, which
 * `react-native-qrcode-svg` relies on to turn the QR payload into bytes.
 * Without this, rendering any QR code throws
 * `ReferenceError: Property 'TextEncoder' doesn't exist` and crashes the
 * screen. We install a minimal UTF-8 encoder (enough for QR generation).
 */
const g = globalThis as any;

if (typeof g.TextEncoder === 'undefined') {
  g.TextEncoder = class TextEncoder {
    readonly encoding = 'utf-8';

    encode(input = ''): Uint8Array {
      const str = String(input);
      const bytes: number[] = [];
      for (let i = 0; i < str.length; i += 1) {
        let code = str.charCodeAt(i);
        if (code < 0x80) {
          bytes.push(code);
        } else if (code < 0x800) {
          bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
        } else if (code >= 0xd800 && code <= 0xdbff) {
          // High surrogate — combine with the following low surrogate.
          const low = str.charCodeAt(i + 1);
          i += 1;
          code = 0x10000 + ((code - 0xd800) << 10) + (low - 0xdc00);
          bytes.push(
            0xf0 | (code >> 18),
            0x80 | ((code >> 12) & 0x3f),
            0x80 | ((code >> 6) & 0x3f),
            0x80 | (code & 0x3f),
          );
        } else {
          bytes.push(
            0xe0 | (code >> 12),
            0x80 | ((code >> 6) & 0x3f),
            0x80 | (code & 0x3f),
          );
        }
      }
      return new Uint8Array(bytes);
    }
  };
}
