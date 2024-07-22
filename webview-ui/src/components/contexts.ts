import React from "react";
import AudioEditor from "../core/AudioEditor";
import AudioEditorWebview from "../AudioEditorWebview";

export const AudioEditorContext = React.createContext<AudioEditor | null>(null);

export const AudioEditorWebviewContext = React.createContext<AudioEditorWebview | null>(null);

