import AudioEditor from "../../core/AudioEditor";
import { AudioToolkitModule, AudioToolkitModuleState } from "../../core/AudioToolkitModule";
import { AlignmentPoint } from "./Alignment";
import { ScoreFormat } from "./ScoreLibrary";
import MusicScoreComponent from "./MusicScoreComponent";
import PianoRollComponent from "./PianoRollComponent";

export interface ScoreState extends AudioToolkitModuleState {
    name: string;
    scoreKey: string;
    fileName: string;
    format: ScoreFormat | "";
    alignmentAudioKey: string;
    autoAlignment: AlignmentPoint[];
    manualAnchors: AlignmentPoint[];
    hiddenTracks: string[];
    omrWarnings?: string[];
}

export const DEFAULT_SCORE_STATE: ScoreState = {
    name: "", scoreKey: "", fileName: "", format: "", alignmentAudioKey: "", autoAlignment: [], manualAnchors: [], hiddenTracks: []
};

abstract class ScoreModuleBase implements AudioToolkitModule<ScoreState> {
    abstract readonly moduleId: string;
    abstract readonly Component: typeof MusicScoreComponent | typeof PianoRollComponent;
    readonly sharableData = Promise.resolve(null);
    onStateChange: ((state: ScoreState) => unknown) | undefined;
    protected constructor(public readonly audioEditor: AudioEditor, private state: ScoreState) {}
    getState() { return this.state; }
    setState(state: ScoreState) { this.state = state; this.onStateChange?.(state); }
}

export class MusicScore extends ScoreModuleBase {
    static MODULE_ID = "score.musicxml";
    static MODULE_NAME = "MusicXML score";
    static DEFAULT_STATE = DEFAULT_SCORE_STATE;
    readonly moduleId = MusicScore.MODULE_ID;
    readonly Component = MusicScoreComponent;
    static async fromAudioData(editor: AudioEditor, initialState: Partial<ScoreState> = {}) {
        return new MusicScore(editor, { ...DEFAULT_SCORE_STATE, ...initialState });
    }
}

export class PianoRoll extends ScoreModuleBase {
    static MODULE_ID = "score.pianoroll";
    static MODULE_NAME = "Piano roll";
    static DEFAULT_STATE = DEFAULT_SCORE_STATE;
    readonly moduleId = PianoRoll.MODULE_ID;
    readonly Component = PianoRollComponent;
    static async fromAudioData(editor: AudioEditor, initialState: Partial<ScoreState> = {}) {
        return new PianoRoll(editor, { ...DEFAULT_SCORE_STATE, ...initialState });
    }
}

export function updateSharedScoreState(editor: AudioEditor, scoreKey: string, update: Partial<ScoreState>) {
    for (const module of editor.modulesInstance) {
        if ((module.moduleId === MusicScore.MODULE_ID || module.moduleId === PianoRoll.MODULE_ID) && (module as ScoreModuleBase).getState().scoreKey === scoreKey) {
            const scoreModule = module as ScoreModuleBase;
            scoreModule.setState({ ...scoreModule.getState(), ...update });
        }
    }
}
