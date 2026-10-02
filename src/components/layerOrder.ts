/** Convert a displayed insertion boundary to the underlying module splice index. */
export function layerInsertionIndex(indices: number[], from: number, slot: number, overlay: boolean): number {
    const rank = indices.indexOf(from);
    const insertionRank = Math.max(0, Math.min(indices.length - 1, slot - (slot > rank ? 1 : 0)));
    return overlay ? indices.length - insertionRank : insertionRank + 1;
}
