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

export const isCloseToMultipleOf = (x: number, y: number) => 0.5 - Math.abs(-Math.abs((x / y) % 1) + 0.5) < 1e-10;

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

export const setCanvasToFullSize = (canvas: HTMLCanvasElement) => {
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = ~~(rect.width * ratio);
    const height = ~~(rect.height * ratio);
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx?.reset();
    ctx?.scale(ratio, ratio);
    return [~~rect.width, ~~rect.height];
};
export const getFactors = (n: number) => {
    const factors = [1];
    let i = 2;
    while (i < Math.sqrt(n)) {
        if (n % i === 0) factors.push(i, n / i);
        i++;
    }
    return factors.sort((a, b) => a - b);
};
export const getRuler = (range: [number, number], unit: AudioUnit, { sampleRate = 48000, beatsPerMinute = 60, beatsPerMeasure = 4, division = 16 }) => {
    const ruler: Record<number, string> = {};
    const length = range[1] - range[0];
    let coarse: number | undefined;
    let refined: number | undefined;
    if (unit === "sample") {
        const steps = [1, 2, 5];
        let mag = 1;
        let step = 0;
        do {
            const grid = steps[step] * mag;
            if (step + 1 < steps.length) {
                step++;
            } else {
                step = 0;
                mag *= 10;
            }
            if (!coarse && length / grid <= 10) coarse = grid;
            if (!refined && length / grid <= 50) refined = grid;
        } while (!coarse || !refined);
    } else if (unit === "measure") {
        const bps = beatsPerMinute / 60;
        const samplesPerBeat = sampleRate / bps;
        const divisionFactors = getFactors(division);
        const beatsFactors = getFactors(beatsPerMeasure);
        const measureFactors = [1, 2, 5];
        let actualUnit: "division" | "beat" | "measure" = "division";
        let mag = 1;
        let step = 0;
        do {
            const grid = actualUnit === "division"
                ? samplesPerBeat * divisionFactors[step] / division
                : actualUnit === "beat"
                    ? samplesPerBeat * beatsFactors[step]
                    : samplesPerBeat * measureFactors[step] * mag * beatsPerMeasure;
            if (actualUnit === "division") {
                if (step + 1 < divisionFactors.length) {
                    step++;
                } else {
                    actualUnit = "beat";
                    step = 0;
                }
            } else if (actualUnit === "beat") {
                if (step + 1 < beatsFactors.length) {
                    step++;
                } else {
                    actualUnit = "measure";
                    step = 0;
                }
            } else {
                if (step + 1 < measureFactors.length) {
                    step++;
                } else {
                    step = 0;
                    mag *= 10;
                }
            }
            if (!coarse && length / grid <= 10) coarse = grid;
            if (!refined && length / grid <= 50) refined = grid;
        } while (!coarse || !refined);
    } else {
        const msFactors = [1, 2, 5, 10, 20, 50, 100, 200, 500];
        const sFactors = getFactors(60);
        const minFactors = sFactors;
        const hFactors = [1, 2, 5];
        let actualUnit: "ms" | "s" | "min" | "h" = "ms";
        let mag = 1;
        let step = 0;
        do {
            const grid = actualUnit === "ms"
                ? sampleRate * msFactors[step] / 1000
                : actualUnit === "s"
                    ? sampleRate * sFactors[step]
                    : actualUnit === "min"
                        ? sampleRate * minFactors[step] * 60
                        : sampleRate * hFactors[step] * mag * 60;
            if (actualUnit === "ms") {
                if (step + 1 < msFactors.length) {
                    step++;
                } else {
                    actualUnit = "s";
                    step = 0;
                }
            } else if (actualUnit === "s") {
                if (step + 1 < sFactors.length) {
                    step++;
                } else {
                    actualUnit = "min";
                    step = 0;
                }
            } else if (actualUnit === "min") {
                if (step + 1 < minFactors.length) {
                    step++;
                } else {
                    actualUnit = "h";
                    step = 0;
                }
            } else {
                if (step + 1 < hFactors.length) {
                    step++;
                } else {
                    step = 0;
                    mag *= 10;
                }
            }
            if (!coarse && length / grid <= 10) coarse = grid;
            if (!refined && length / grid <= 50) refined = grid;
        } while (!coarse || !refined);
    }
    let m = ~~(range[0] / refined);
    if (m * refined < range[0]) m++;
    while (m * refined < range[1]) {
        const t = m * refined;
        if (t && t % coarse < 0.001 || coarse - t % coarse < 0.001) {
            ruler[t] = unit === "sample" ? t.toString() : convertSampleToUnit(t, unit, { sampleRate, beatsPerMinute, beatsPerMeasure, division }).str.replace(/\.[0.]+$/, "");
        } else {
            ruler[t] = "";
        }
        m++;
    }
    return { ruler, coarse, refined };
};

export const generateRuler = (steps: number[], multiplier: number, initialMultiplier: number, calcPixels: (input: number) => number, coarseMinPixels = 25, refinedMinPixels = 3) => {
    let coarse: number | undefined;
    let refined: number | undefined;
    let step = 0;
    let grid: number;
    do {
        grid = steps[step] * initialMultiplier;
        if (step + 1 < steps.length) {
            step++;
        } else {
            step = 0;
            initialMultiplier *= multiplier;
        }
        if (!coarse && calcPixels(grid) >= coarseMinPixels) coarse = grid;
        if (!refined && calcPixels(grid) >= refinedMinPixels) refined = grid;
    } while (!coarse || !refined);
    return [coarse, refined];
};

export const getCssFromPosition = (viewRange: [number, number], pos1: number, pos2?: number) => {
    const [viewStart, viewEnd] = viewRange;
    const viewLength = viewEnd - viewStart;
    if (typeof pos2 === "number") {
        return `${(pos2 - pos1) / viewLength * 100}%`;
    }
    return `min(${(pos1 - viewStart) / viewLength * 100}%, calc(100% - 1px))`;
};
