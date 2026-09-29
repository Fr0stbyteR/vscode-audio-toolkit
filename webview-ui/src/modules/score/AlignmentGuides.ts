export interface AlignmentGuide {
    kind: "measure" | "note";
    time: number;
    audioX: number;
}

/** Keep one readable guide per audio-screen position; DTW can map many score events to one point. */
export function selectAlignmentGuides<T extends AlignmentGuide>(events: T[], minimumSpacing = 10): T[] {
    const sorted = [...events].sort((a, b) => a.audioX - b.audioX || a.time - b.time);
    const selected: T[] = [];
    for (let start = 0; start < sorted.length;) {
        let end = start + 1;
        while (end < sorted.length && sorted[end].audioX - sorted[start].audioX < minimumSpacing) end++;
        const group = sorted.slice(start, end);
        const measure = group.find(event => event.kind === "measure");
        selected.push(measure ?? group[Math.floor(group.length / 2)]);
        start = end;
    }
    return selected.sort((a, b) => a.time - b.time || a.audioX - b.audioX);
}
