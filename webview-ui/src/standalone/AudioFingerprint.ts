// A stable local audio identity for persisted module state and score alignment.
export async function fingerprintAudio(data: ArrayBuffer): Promise<string> {
    const sampleSize = Math.min(data.byteLength, 256 * 1024);
    const sample = new Uint8Array(8 + sampleSize * 2);
    new DataView(sample.buffer).setFloat64(0, data.byteLength, true);
    sample.set(new Uint8Array(data, 0, sampleSize), 8);
    sample.set(new Uint8Array(data, data.byteLength - sampleSize, sampleSize), 8 + sampleSize);
    const digest = await crypto.subtle.digest("SHA-256", sample);
    return `audio-sample-v1:${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("")}`;
}
