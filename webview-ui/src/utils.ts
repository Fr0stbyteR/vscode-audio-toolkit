import { AudioUnit } from "./core/AudioEditor";

/**
 * Mod support wrapping with negative numbers
 */
export const mod = (x: number, y: number) => (x % y + y) % y;

/**
 * Linear amplitude ([0, 1]) to dB ([-Inf, 0])
 *
 * @param a linear amplitude value
 * @returns dB value
 */
export const atodb = (a: number) => 20 * Math.log10(a);
/**
 * dB ([-Inf, 0]) to Linear mplitude ([0, 1])
 *
 * @param db dB value
 * @returns linear amplitude value
 */
export const dbtoa = (db: number) => 10 ** (db / 20);

/**
 * De-scale a exponently scaled value
 *
 * @param x normalized value to scale between ([0, 1])
 * @param e exponent factor used to scale, 0 means linear, 1 does ** 1.5 curve
 * @returns de-scaled value
 */
export const iNormExp = (x: number, e: number) => Math.max(0, x) ** (1.5 ** -e);
/**
 * Scale exponently a normalized value
 *
 * @param x normalized value to scale between ([0, 1])
 * @param e exponent factor, 0 means linear, 1 does ** 1.5 curve
 * @returns scaled value
 */
export const normExp = (x: number, e: number) => Math.max(0, x) ** (1.5 ** e);

export const absMax = (signal: TypedArray | number[], from = 0, length = signal.length) => {
    const slice = signal.slice(from, from + length).map(v => Math.abs(v)) as any;
    return Math.max.apply(Math, slice);
};

type TypedArray = Int8Array | Uint8Array | Int16Array | Uint16Array | Int32Array | Uint32Array | Uint8ClampedArray | Float32Array | Float64Array;

/**
 * Copy buffer to another, support negative offset index
 */
export const setTypedArray = <T extends TypedArray = TypedArray>(to: T, from: T, offsetTo = 0, offsetFrom = 0) => {
    const toLength = to.length;
    const fromLength = from.length;
    const spillLength = Math.min(toLength, fromLength);
    let spilled = 0;
    let $to = mod(offsetTo, toLength) || 0;
    let $from = mod(offsetFrom, fromLength) || 0;
    while (spilled < spillLength) {
        const $spillLength = Math.min(spillLength - spilled, toLength - $to, fromLength - $from);
        const $fromEnd = $from + $spillLength;
        if ($from === 0 && $fromEnd === fromLength) to.set(from, $to);
        else to.set(from.subarray($from, $fromEnd), $to);
        $to = ($to + $spillLength) % toLength;
        $from = $fromEnd % fromLength;
        spilled += $spillLength;
    }
    return $to;
};

export const MEASURE_UNIT_REGEX = /^((\d+):)?(\d+)\.?(\d+)?$/;
export const TIME_UNIT_REGEX = /^((\d+):)??((\d+):)?(\d+)\.?(\d+)?$/;
export const convertSampleToUnit = (sample: number, unit: AudioUnit, { sampleRate = 48000, beatsPerMinute = 60, beatsPerMeasure = 4, division = 16 }) => {
    if (unit === "sample") return { unit, str: sample.toString(), value: sample, values: [sample] };
    const milliseconds = sample * 1000 / sampleRate;
    const roundedMs = Math.round(milliseconds);
    if (unit === "measure") {
        const dpms = beatsPerMinute * division / 60000;
        const totalDivisions = dpms * milliseconds;
        const roundedTotalDivisions = dpms * milliseconds;
        const divisions = ~~(roundedTotalDivisions % division);
        const beats = ~~(roundedTotalDivisions / division) % beatsPerMeasure + 1;
        const measure = ~~(roundedTotalDivisions / beatsPerMeasure / division) + 1;
        const str = `${measure}:${beats}.${divisions.toString().padStart(2, "0")}`;
        return { unit, str, value: totalDivisions / division, values: [measure, beats, divisions] };
    }
    // if (unit === "time")
    const ms = roundedMs % 1000;
    const s = ~~(roundedMs / 1000) % 60;
    const min = ~~(roundedMs / 60000) % 60;
    const h = ~~(roundedMs / 3600000);
    const str = !min ? `${s}.${ms.toString().padStart(3, "0")}`
        : !h ? `${min}:${s.toString().padStart(2, "0")}.${ms.toString().padStart(3, "0")}`
            : `${h}:${min.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}.${ms.toString().padStart(3, "0")}`;
    return { unit, str, value: milliseconds / 1000, values: [h, min, s, ms] };
};
export const convertUnitToSample = (str: string, unit: AudioUnit, { sampleRate = 48000, beatsPerMinute = 60, beatsPerMeasure = 4, division = 16 }) => {
    if (unit === "sample") return +str || 0;
    if (unit === "measure") {
        const matched = str.match(MEASURE_UNIT_REGEX);
        if (!matched) throw new Error(`String ${str} cannot be parsed to ${unit}`);
        const [, , measureIn, beatsIn, divisionsIn] = matched;
        const bps = beatsPerMinute / 60;
        const samplesPerBeat = sampleRate / bps;
        let measures = +measureIn || 0;
        let beats = +beatsIn || 0;
        let divisions = +divisionsIn || 0;
        beats += ~~(divisions / division);
        divisions %= division;
        measures += ~~(beats / beatsPerMeasure);
        beats %= beatsPerMeasure;
        return (measures * beatsPerMeasure + beats + divisions / division) * samplesPerBeat;
    }
    const matched = str.match(TIME_UNIT_REGEX);
    if (!matched) throw new Error(`String ${str} cannot be parsed to ${unit}`);
    const [, , hIn, , minIn, sIn, msIn] = matched;
    let h = +hIn || 0;
    let min = +minIn || 0;
    let s = +sIn || 0;
    let ms = +msIn || 0;
    s += ~~(ms / 1000);
    ms %= 1000;
    min += ~~(s / 60);
    s %= 60;
    h += ~~(min / 60);
    min %= 60;
    return (h * 3600 + min * 60 + s + ms / 1000) * sampleRate;
};

/**
 * Converts an HSL color value to RGB. Conversion formula
 * adapted from https://en.wikipedia.org/wiki/HSL_color_space.
 * Assumes h, s, and l are contained in the set [0, 1] and
 * returns r, g, and b in the set [0, 255].
 */
export const hslToRgb = ([h, s, l, a]: [number, number, number, number]) => {
    let r, g, b;

    if (s === 0) {
        r = g = b = l; // achromatic
    } else {
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hueToRgb(p, q, h + 1 / 3);
        g = hueToRgb(p, q, h);
        b = hueToRgb(p, q, h - 1 / 3);
    }
    return [r, g, b, a];
};

export const hueToRgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
};
