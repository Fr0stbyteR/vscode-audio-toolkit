import AudioEditor from "../../core/AudioEditor";
import { AudioToolkitModule, AudioToolkitModuleState } from "../../core/AudioToolkitModule";
import { alignmentPoints } from "../score/Alignment";
import { loadScore } from "../score/ScoreLibrary";
import type { ScoreState } from "../score/ScoreModule";
import { CurvePoint, performedTempo } from "./PerformedTempo";
import MusicCurveComponent from "./MusicCurveComponent";

export type CurveKind = "tempo" | "performed" | "va";
export interface MusicCurveState extends AudioToolkitModuleState {
    name: string; kind: CurveKind; points: CurvePoint[]; colors: string[];
    windowSeconds: number; hopSeconds: number; scoreKey: string;
    source: string; error: string;
    alignmentSignature?: string;
}
const defaults: MusicCurveState = { name: "", kind: "tempo", points: [], colors: ["#4e94ce", "#c586c0"], windowSeconds: 3, hopSeconds: .5, scoreKey: "", source: "", error: "" };

export class MusicCurve implements AudioToolkitModule<MusicCurveState> {
    static MODULE_ID = "music.tempo";
    static MODULE_NAME = "Score tempo";
    static DEFAULT_STATE = defaults;
    static getCacheableState(state: Record<string, unknown>) {
        const channels = this.DEFAULT_STATE.kind === "va" ? 2 : 1;
        if (state.kind !== this.DEFAULT_STATE.kind || !Array.isArray(state.points) || !state.points.length || state.points.length > 50000) return undefined;
        if (!state.points.every(point => point && Number.isFinite(point.time) && point.time >= 0 && Array.isArray(point.values) && point.values.length === channels
            && point.values.every((value: unknown) => value === null || typeof value === "number" && Number.isFinite(value)))) return undefined;
        if (!state.points.some(point => point.values.some((value: unknown) => typeof value === "number"))) return undefined;
        return { ...state, error: "" };
    }
    static async fromAudioData(editor: AudioEditor, initial: Partial<MusicCurveState> = {}) { return new MusicCurve(editor, { ...defaults, ...initial, kind: "tempo" }); }
    readonly Component = MusicCurveComponent;
    readonly sharableData = Promise.resolve(null);
    onStateChange: ((state: MusicCurveState) => unknown) | undefined;
    onBusyChange: ((busy: boolean) => void) | undefined;
    busy = false;
    private revision = 0;
    private signature = "";
    dispose() { ++this.revision; this.onStateChange = undefined; this.onBusyChange = undefined; }
    protected constructor(public readonly audioEditor: AudioEditor, private state: MusicCurveState) {
        const channels = state.kind === "va" ? 2 : 1;
        state.points = (Array.isArray(state.points) ? state.points : []).slice(0, 50000).filter(point => point && Number.isFinite(point.time) && point.time >= 0 && point.time <= audioEditor.duration && Array.isArray(point.values)).map(point => ({ time: point.time, values: Array.from({ length: channels }, (_, index) => typeof point.values[index] === "number" && Number.isFinite(point.values[index]) ? state.kind === "va" ? Math.max(-1, Math.min(1, point.values[index]!)) : point.values[index]! : null) })).sort((a, b) => a.time - b.time);
        state.colors = defaults.colors.map((fallback, index) => typeof state.colors?.[index] === "string" && /^#[0-9a-f]{6}$/i.test(state.colors[index]) ? state.colors[index] : fallback);
        state.windowSeconds = Number.isFinite(state.windowSeconds) && state.windowSeconds >= (state.kind === "va" ? 3 : .5) && state.windowSeconds <= 60 ? state.windowSeconds : state.kind === "va" ? 6 : 3;
        state.hopSeconds = Number.isFinite(state.hopSeconds) && state.hopSeconds >= .1 && state.hopSeconds <= 30 ? state.hopSeconds : state.kind === "va" ? 1 : .5;
    }
    get moduleId() { return this.state.kind === "va" ? "music.va" : this.state.kind === "performed" ? "music.performed-tempo" : "music.tempo"; }
    getState() { return this.state; }
    setState(state: MusicCurveState) { this.state = state; this.onStateChange?.(state); }
    editPoints(points: CurvePoint[]) {
        this.setState({ ...this.state, points: [...points].sort((a, b) => a.time - b.time), source: "Manual", error: "" });
        if (this.state.kind === "tempo") {
            const metadata = this.audioEditor.metadata;
            this.audioEditor.setMetadata({ ...metadata, values: { ...metadata.values, tempo: this.state.points.filter(point => point.values[0] !== null).map((point, index) => ({ id: `tempo-${index}`, time: point.time, bpm: point.values[0]! })) }, sources: { ...metadata.sources, tempo: "user" } });
        }
        if (this.state.kind === "va") this.updateMoodSummary();
    }
    syncMetadata() {
        if (this.state.kind !== "tempo") return;
        const metadata = this.audioEditor.metadata;
        if (!metadata.sources.tempo && !metadata.values.tempo.length && this.state.points.length) {
            const tempo = this.state.points.filter(point => point.values[0] !== null).map((point, index) => ({ id: `tempo-${index}`, time: point.time, bpm: point.values[0]! }));
            this.audioEditor.setMetadata({ ...metadata, values: { ...metadata.values, tempo }, sources: { ...metadata.sources, tempo: this.state.source === "MusicXML" ? "musicxml" : "user" } });
            return;
        }
        const points = metadata.values.tempo.map(point => ({ time: point.time, values: [point.bpm] }));
        if (JSON.stringify(points) !== JSON.stringify(this.state.points)) this.setState({ ...this.state, points, source: this.audioEditor.metadata.sources.tempo === "musicxml" ? "MusicXML" : "Manual" });
    }
    updateMoodSummary() {
        const average = (channel: number) => {
            const values = this.state.points.map(point => point.values[channel]).filter((value): value is number => value !== null && Number.isFinite(value));
            return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
        };
        const metadata = this.audioEditor.metadata;
        const valence = average(0), arousal = average(1);
        if (metadata.values.valence === valence && metadata.values.arousal === arousal) return;
        this.audioEditor.setMetadata({ ...metadata, values: { ...metadata.values, valence, arousal }, sources: { ...metadata.sources, valence: "user", arousal: "user" } });
    }
    async calculate(force = true) {
        if (this.state.kind === "tempo") { this.syncMetadata(); return; }
        if (this.busy && this.state.kind === "va") return;
        if (this.state.kind === "performed") {
            const audioKey = this.audioEditor.uri || `${this.audioEditor.sampleRate}:${this.audioEditor.length}`;
            const sources = this.audioEditor.modulesInstance.filter(module => module.moduleId === "score.musicxml" || module.moduleId === "score.pianoroll").map(module => module.getState() as ScoreState);
            const source = sources.find(score => score.scoreKey && (!this.state.scoreKey || score.scoreKey === this.state.scoreKey) && score.alignmentAudioKey === audioKey && (score.autoAlignment.length > 2 || score.manualAnchors.length >= 2));
            const signature = JSON.stringify([source?.scoreKey, source?.alignmentAudioKey, source?.autoAlignment, source?.manualAnchors, this.state.windowSeconds, this.state.hopSeconds]);
            if (!force && signature === this.signature) return;
            this.signature = signature;
            if (!force && this.state.points.length && (!source || this.state.alignmentSignature === signature)) return;
            if (!source) {
                ++this.revision;
                this.busy = false; this.onBusyChange?.(false);
                this.setState({ ...this.state, error: "Import a score and run DTW alignment first" });
                return;
            }
            const id = ++this.revision;
            this.busy = true; this.onBusyChange?.(true);
            try {
                const score = await loadScore(source.scoreKey);
                if (id !== this.revision) return;
                const alignment = source.autoAlignment.length > 2 ? alignmentPoints(source.autoAlignment, source.manualAnchors, score.duration, this.audioEditor.duration) : source.manualAnchors;
                const points = performedTempo(alignment, score.beatClock, this.state.windowSeconds, this.state.hopSeconds);
                this.setState({ ...this.state, scoreKey: source.scoreKey, points, source: source.autoAlignment.length > 2 ? "DTW estimate" : "Manual alignment estimate", alignmentSignature: signature, error: "" });
            } catch (error) { if (id === this.revision) this.setState({ ...this.state, points: [], error: error instanceof Error ? error.message : String(error) }); }
            finally { if (id === this.revision) { this.busy = false; this.onBusyChange?.(false); } }
            return;
        }
        const id = ++this.revision;
        this.busy = true; this.onBusyChange?.(true);
        this.setState({ ...this.state, error: "" });
        try {
            const result = await this.audioEditor.analyzeMood({ windowSeconds: this.state.windowSeconds, hopSeconds: this.state.hopSeconds, timelineDurationSeconds: this.audioEditor.duration, cachePolicy: force ? "refresh" : "use" });
            if (id !== this.revision) return;
            this.setState({ ...this.state, points: result.points.map(point => ({ time: point.timeSeconds, values: [point.valence, point.arousal] })), source: result.model, error: "" });
            this.updateMoodSummary();
        } catch (error) { if (id === this.revision) this.setState({ ...this.state, error: error instanceof Error ? error.message : String(error) }); }
        finally { if (id === this.revision) { this.busy = false; this.onBusyChange?.(false); } }
    }
}
export class PerformedTempo extends MusicCurve {
    static MODULE_ID = "music.performed-tempo";
    static MODULE_NAME = "Performed tempo · DTW";
    static DEFAULT_STATE = { ...defaults, kind: "performed" as const };
    static async fromAudioData(editor: AudioEditor, initial: Partial<MusicCurveState> = {}) { return new PerformedTempo(editor, { ...this.DEFAULT_STATE, ...initial, kind: "performed" }); }
}
export class MoodVA extends MusicCurve {
    static MODULE_ID = "music.va";
    static MODULE_NAME = "Mood · VA curve";
    static DEFAULT_STATE = { ...defaults, kind: "va" as const, windowSeconds: 6, hopSeconds: 1 };
    static async fromAudioData(editor: AudioEditor, initial: Partial<MusicCurveState> = {}) { return new MoodVA(editor, { ...this.DEFAULT_STATE, ...initial, kind: "va" }); }
}
