export interface DecodedAiffPcm {
    sampleRate: number;
    channelData: Float32Array[];
}

function fourCC(view: DataView, offset: number): string {
    return String.fromCharCode(...new Uint8Array(view.buffer, view.byteOffset + offset, 4));
}

export function isAiffFile(data: ArrayBuffer): boolean {
    if (data.byteLength < 12) return false;
    const view = new DataView(data);
    return fourCC(view, 0) === "FORM" && ["AIFF", "AIFC"].includes(fourCC(view, 8));
}

function extendedRate(view: DataView, offset: number): number {
    const exponentWord = view.getUint16(offset, false);
    const exponent = exponentWord & 0x7fff;
    const mantissa = (BigInt(view.getUint32(offset + 2, false)) << 32n) | BigInt(view.getUint32(offset + 6, false));
    if ((exponentWord & 0x8000) || exponent === 0x7fff || mantissa === 0n) throw new Error("Invalid AIFF sample rate");
    return Number(mantissa) * 2 ** (exponent - 16383 - 63);
}

export function decodeAiffPcm(data: ArrayBuffer): DecodedAiffPcm {
    if (!isAiffFile(data)) throw new Error("Not an AIFF audio file");
    const view = new DataView(data);
    const formEnd = 8 + view.getUint32(4, false);
    if (formEnd > data.byteLength || formEnd < 12) throw new Error("Truncated AIFF FORM chunk");
    const compressedForm = fourCC(view, 8) === "AIFC";
    let channels = 0;
    let frames = 0;
    let bits = 0;
    let sampleRate = 0;
    let littleEndian = false;
    let soundOffset = -1;
    let soundEnd = -1;
    for (let offset = 12; offset + 8 <= formEnd;) {
        const chunkSize = view.getUint32(offset + 4, false);
        const start = offset + 8;
        const end = start + chunkSize;
        if (end > formEnd) throw new Error("Truncated AIFF chunk");
        const kind = fourCC(view, offset);
        if (kind === "COMM") {
            if (chunkSize < (compressedForm ? 22 : 18)) throw new Error("Invalid AIFF COMM chunk");
            channels = view.getUint16(start, false);
            frames = view.getUint32(start + 2, false);
            bits = view.getUint16(start + 6, false);
            sampleRate = extendedRate(view, start + 8);
            if (compressedForm) {
                const compression = fourCC(view, start + 18);
                if (compression !== "NONE" && compression !== "sowt") {
                    throw new Error(`Unsupported AIFF compression: ${compression}`);
                }
                littleEndian = compression === "sowt";
            }
        } else if (kind === "SSND") {
            if (chunkSize < 8) throw new Error("Invalid AIFF SSND chunk");
            const dataOffset = view.getUint32(start, false);
            soundOffset = start + 8 + dataOffset;
            soundEnd = end;
            if (soundOffset > soundEnd) throw new Error("Invalid AIFF sound offset");
        }
        offset = end + (chunkSize & 1);
    }
    if (!channels || !frames || !sampleRate || soundOffset < 0) throw new Error("AIFF file is missing audio data");
    if (channels > 32 || !Number.isFinite(sampleRate) || sampleRate < 1000 || sampleRate > 384000) {
        throw new Error("Unsupported AIFF channel count or sample rate");
    }
    if (![8, 16, 24, 32].includes(bits)) throw new Error(`Unsupported AIFF PCM depth: ${bits} bits`);
    const bytesPerSample = bits / 8;
    const requiredBytes = frames * channels * bytesPerSample;
    if (!Number.isSafeInteger(requiredBytes) || soundOffset + requiredBytes > soundEnd) {
        throw new Error("Truncated AIFF audio samples");
    }
    const channelData = Array.from({ length: channels }, () => new Float32Array(frames));
    let sampleOffset = soundOffset;
    for (let frame = 0; frame < frames; frame++) {
        for (let channel = 0; channel < channels; channel++) {
            let signed: number;
            if (bits === 8) signed = view.getInt8(sampleOffset);
            else if (bits === 16) signed = view.getInt16(sampleOffset, littleEndian);
            else if (bits === 32) signed = view.getInt32(sampleOffset, littleEndian);
            else {
                const first = view.getUint8(sampleOffset + (littleEndian ? 2 : 0));
                const middle = view.getUint8(sampleOffset + 1);
                const last = view.getUint8(sampleOffset + (littleEndian ? 0 : 2));
                signed = (first >= 128 ? first - 256 : first) * 65536 + (middle << 8) + last;
            }
            channelData[channel][frame] = signed / 2 ** (bits - 1);
            sampleOffset += bytesPerSample;
        }
    }
    return { sampleRate, channelData };
}
