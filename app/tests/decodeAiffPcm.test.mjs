import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeAiffPcm, isAiffFile } from "../src/core/decodeAiffPcm.ts";

function makeAiff({ channels = 1, bits = 16, compression, samples = [0, 16384, -16384] } = {}) {
    const sampleBytes = bits / 8;
    const aifc = compression !== undefined;
    const commSize = aifc ? 22 : 18;
    const soundSize = 8 + samples.length * sampleBytes;
    const bytes = new ArrayBuffer(12 + 8 + commSize + 8 + soundSize);
    const view = new DataView(bytes);
    const writeFourCC = (offset, value) => [...value].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
    writeFourCC(0, "FORM");
    view.setUint32(4, bytes.byteLength - 8);
    writeFourCC(8, aifc ? "AIFC" : "AIFF");
    writeFourCC(12, "COMM");
    view.setUint32(16, commSize);
    view.setUint16(20, channels);
    view.setUint32(22, samples.length / channels);
    view.setUint16(26, bits);
    // 44,100 Hz as an IEEE 80-bit extended float.
    view.setUint16(28, 0x400e);
    view.setUint32(30, 0xac440000);
    view.setUint32(34, 0);
    if (aifc) writeFourCC(38, compression);
    const soundChunk = 20 + commSize;
    writeFourCC(soundChunk, "SSND");
    view.setUint32(soundChunk + 4, soundSize);
    const offset = soundChunk + 16;
    samples.forEach((sample, index) => {
        if (bits === 16) view.setInt16(offset + index * 2, sample, compression === "sowt");
        else if (bits === 8) view.setInt8(offset + index, sample);
        else if (bits === 24) {
            view.setUint8(offset + index * 3, (sample >> 16) & 255);
            view.setUint8(offset + index * 3 + 1, (sample >> 8) & 255);
            view.setUint8(offset + index * 3 + 2, sample & 255);
        }
    });
    return bytes;
}

test("decodes AIFF PCM samples and sample rate", () => {
    const data = makeAiff();
    assert.equal(isAiffFile(data), true);
    const decoded = decodeAiffPcm(data);
    assert.equal(decoded.sampleRate, 44100);
    assert.deepEqual([...decoded.channelData[0]], [0, 0.5, -0.5]);
});

test("separates interleaved channels and supports 24-bit sign extension", () => {
    const decoded = decodeAiffPcm(makeAiff({ channels: 2, bits: 24, samples: [0, 4194304, -4194304, 0] }));
    assert.deepEqual([...decoded.channelData[0]], [0, -0.5]);
    assert.deepEqual([...decoded.channelData[1]], [0.5, 0]);
});

test("decodes AIFC sowt and rejects unsupported compression", () => {
    const decoded = decodeAiffPcm(makeAiff({ compression: "sowt" }));
    assert.deepEqual([...decoded.channelData[0]], [0, 0.5, -0.5]);
    assert.throws(() => decodeAiffPcm(makeAiff({ compression: "fl32" })), /Unsupported AIFF compression/);
});

test("rejects truncated sample data", () => {
    const data = makeAiff();
    const view = new DataView(data);
    view.setUint32(22, 100);
    assert.throws(() => decodeAiffPcm(data), /Truncated AIFF audio samples/);
});
