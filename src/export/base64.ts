/**
 * Encodes binary data for the Power BI download service, which accepts file
 * payloads only as base64 text.
 *
 * String.fromCharCode is applied in chunks because spreading a multi-megabyte
 * array into a single call overflows the argument stack in every browser.
 */
const CHUNK_SIZE = 0x8000;

export function bytesToBase64(bytes: Uint8Array): string {
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
        const chunk = bytes.subarray(offset, Math.min(offset + CHUNK_SIZE, bytes.length));
        binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
    }
    return btoa(binary);
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
    return bytesToBase64(new Uint8Array(buffer));
}
