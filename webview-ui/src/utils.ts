
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
