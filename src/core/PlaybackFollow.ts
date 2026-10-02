export type PlaybackFollowMode = "page" | "scroll";

export const PLAYBACK_FOLLOW_STORAGE_KEY = "audioToolkit.playbackFollow";

export function playbackFollowMode(value: unknown): PlaybackFollowMode {
    return value === "scroll" ? "scroll" : "page";
}

/** Keep the existing zoom, including when playback seeks or loops backwards. */
export function playbackFollowRange(range: [number, number], playhead: number, length: number, mode: PlaybackFollowMode): [number, number] | undefined {
    const [start, end] = range;
    if (![start, end, playhead, length].every(Number.isFinite) || length <= 0 || start < 0 || end > length || end <= start) return;
    const span = end - start;
    if (span >= length) return;
    const cursor = Math.max(0, Math.min(length, playhead));
    // Flip before the cursor is clipped, retaining context at the left edge.
    if (mode === "page" && cursor >= start && cursor < end - Math.max(1, span * 0.02)) return;
    const anchor = mode === "scroll" ? 0.35 : 0.08;
    const nextStart = Math.max(0, Math.min(length - span, Math.round(cursor - span * anchor)));
    if (nextStart === start) return;
    return [nextStart, nextStart + span];
}
