import { AudioMarker } from "../../components/ModuleUsingMarker";
import { AudioToolkitModuleState } from "../../core/AudioToolkitModule";
import EssentiaModule from "./EssentiaModule";

export interface EssentiaModuleUsingMarkerState extends AudioToolkitModuleState {
    color: string;
    data: AudioMarker[] | undefined;
}

abstract class EssentiaModuleUsingMarker<State extends EssentiaModuleUsingMarkerState = any, EssentiaState extends Record<string, any> = any, Data extends any[] = any> extends EssentiaModule<State, EssentiaState, Data> {
    setMarkerPosition(markerIndex: number, position: number | [number, number]) {
        if (!this.state.data) return;
        if (typeof position !== "number") {
            let [start, end] = position;
            end = Math.min(this.audioEditor.length, end);
            start = Math.max(0, start);
            if (start > end) position = [end, start];
            else position = [start, end];
        } else {
            position = Math.max(0, Math.min(this.audioEditor.length, position));
        }
        const data = this.state.data.slice();
        data[markerIndex] = { ...data[markerIndex], position };
        this.setState({ ...this.state, data });
    }
    getMarkersFromRange(range: [number, number]) {
        if (!this.state.data) return [];
        const [from, to] = range;
        const indexes: number[] = [];
        this.state.data.forEach((m, i) => {
            if (typeof m.position === "number") {
                if (from <= m.position && m.position <= to) indexes.push(i);
                return;
            }
            const [f, t] = m.position;
            if (t <= to && f >= from) indexes.push(i);
        });
        return indexes.sort((a, b) => a - b);
    }
    addMarker(position: number | [number, number], name = "", color = this.state.color) {
        if (!this.state.data) return;
        const data = this.state.data.slice();
        data.push({ position, name, color });
        this.setState({ ...this.state, data });
    }
    deleteMarker(...markerIndexes: number[]) {
        if (!this.state.data) return;
        if (!markerIndexes.length) return;
        const data = this.state.data.slice();
        markerIndexes.sort((a, b) => b - a).forEach(index => data.splice(index, 1));
        this.setState({ ...this.state, data });
    }
    setMarkerName(name: string, ...markerIndexes: number[]) {
        if (!this.state.data) return;
        if (!markerIndexes.length) return;
        const data = this.state.data.slice();
        markerIndexes.forEach(index => data[index] = { ...data[index], name });
        this.setState({ ...this.state, data });
    }
    setMarkerClassName(name: string) {
        this.setState({ ...this.state, name });
    }
    setMarkerColor(color: string, ...markerIndexes: number[]) {
        if (!this.state.data) return;
        if (!markerIndexes.length) return;
        const data = this.state.data.slice();
        markerIndexes.forEach(index => data[index] = { ...data[index], color });
        this.setState({ ...this.state, data });
    }
}

export default EssentiaModuleUsingMarker;