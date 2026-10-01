import { FunctionComponent, useCallback, useEffect, useState } from "react";
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react";
import ModuleUsingMarker from "../../components/ModuleUsingMarker";
import ModuleConfigurationContent from "../../components/ModuleConfigurationContent";
import { VisualizationOptions } from "../../core/AudioToolkitModule";
import VectorImageProcessor from "../../core/VectorImageProcessor";
import { setCanvasToFullSize } from "../../utils";
import LibrosaMarkerModule from "./LibrosaMarkerModule";
import { formatCacheInfo } from "./LibrosaCacheInfo";
import ConfigurationSections from "../../components/ConfigurationSections";
import { useLocale } from "../../i18n/LocaleContext";

const LibrosaMarkerComponent: FunctionComponent<VisualizationOptions<LibrosaMarkerModule>> = props => {
    const { locale, t } = useLocale();
    const { module, moduleState, viewRange, gridColor, configuration } = props;
    const [draft, setDraft] = useState(module.getAnalysisState(moduleState));
    const [calculating, setCalculating] = useState<boolean | [number, string]>(module.isCalculating);
    const [cacheInfo, setCacheInfo] = useState(module.cacheInfo);
    useEffect(() => setDraft(module.getAnalysisState(moduleState)), [module, moduleState]);
    useEffect(() => {
        module.onCalculating = setCalculating;
        module.onCacheInfo = setCacheInfo;
        return () => { module.onCalculating = undefined; module.onCacheInfo = undefined; };
    }, [module]);
    const paintVerticalRuler = useCallback((canvasRef: React.RefObject<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx) return;
        const [width, height] = setCanvasToFullSize(canvas);
        VectorImageProcessor.paintVerticalRuler(ctx, module.audioEditor.sampleRate, { width, height, labelsHeight: 0 }, { viewRange, configuration }, { gridColor });
    }, [configuration, gridColor, module, viewRange]);
    const analysisKeys = Object.keys(draft);
    const displayKeys = Object.keys(moduleState).filter(key => !["data", "name", ...analysisKeys].includes(key));
    const configurationContent = <div className="default-layout"><ConfigurationSections mode={props.configurationMode} analysis={<>
        <ModuleConfigurationContent moduleId={module.moduleId} moduleState={draft} setModuleState={setDraft} optionsMetadata={module.getOptionsMetadata()} wrap={false} />
        <div className="analysis-actions">
            <VSCodeButton appearance="primary" title={t("Reanalyze")} onClick={() => {
                const changed = analysisKeys.some(key => draft[key] !== module.getAnalysisState(moduleState)[key]);
                module.setState({ ...moduleState, ...draft }, !changed);
            }}>{t("Reanalyze")}</VSCodeButton>
            <span>{moduleState.data?.length ?? 0} {t("markers")}</span>
        </div>
        <div className="analysis-cache-status">{moduleState.data && !cacheInfo ? t("Saved with project") : formatCacheInfo(cacheInfo, locale)}</div>
    </>} appearance={<>
        <ModuleConfigurationContent moduleId={module.moduleId} moduleState={moduleState} keys={displayKeys} setModuleState={state => module.setState(state)} optionsMetadata={module.getOptionsMetadata()} wrap={false} />
    </>} /></div>;
    return <ModuleUsingMarker {...props} calculating={calculating} markerClassName={moduleState.name} markerData={moduleState.data ?? []} paintVerticalRuler={paintVerticalRuler} configurationContent={configurationContent} />;
};

export default LibrosaMarkerComponent;
