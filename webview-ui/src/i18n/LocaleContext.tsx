import { createContext, FunctionComponent, ReactNode, useContext, useEffect, useMemo, useState } from "react";

export type Locale = "zh" | "en";
const STORAGE_KEY = "audioToolkit.locale";

const zh: Record<string, string> = {
    "Browser workspace": "浏览器工作区", "NOW INSPECTING": "当前音频", "Choose an audio file from the library": "从音频库选择文件",
    "Librosa ready": "Librosa 已就绪", "Checking service": "正在检查服务", "Service offline": "服务离线",
    "CLAP loaded": "CLAP 已加载", "Load CLAP": "加载 CLAP", "Checking CLAP": "正在检查 CLAP", "CLAP offline": "CLAP 离线",
    "Music analysis service · librosa + CLAP": "音乐分析服务 · librosa + CLAP", "API base URL": "API 地址", "Bearer token": "Bearer 令牌",
    "(saved in this browser)": "（保存在此浏览器）", "Cancel": "取消", "Connect": "连接", "Could not open audio": "无法打开音频",
    "Reading local audio": "正在读取本地音频", "STANDALONE ANALYSIS WORKSPACE": "独立音频分析工作区",
    "Open a folder.": "打开文件夹。", "Listen closer.": "细听每一处。",
    "Files remain in the browser. Only audio you choose to analyze is sent to the configured backend.": "目录留在浏览器。只有你选择分析的音频会发送到已配置的后端。",
    "Local folder": "本地文件夹", "Selected file": "选中的文件", "Analysis API": "分析 API",
    "LOCAL LIBRARY": "本地音频库", "No folder open": "未打开文件夹", "Open a local folder": "打开本地文件夹",
    "Selected files": "已选文件", "Drop into your sound library": "从音频库开始", "Restoring the previous folder…": "正在恢复上次的文件夹…",
    "Open local folder": "打开本地文件夹", "Choose another folder": "选择其他文件夹", "Reconnect": "重新连接",
    "Files remain local until you request an analysis.": "只有请求分析时才会发送音频。",
    "This browser uses a directory-upload fallback. Chrome and Edge support on-demand access.": "当前浏览器使用目录上传兼容模式。Chrome / Edge 可提供按需读取。",
    "Could not restore the previous folder:": "无法恢复上次的文件夹：", "Folder permission was not granted.": "未获得文件夹读取权限。",
    "Review queue": "审核队列", "opened files": "个已打开文件", "suggested items": "条待审", "confirmed items": "条已确认",
    "Only audio opened in this browser is listed; the whole folder is not scanned.": "仅列出此浏览器已打开的音频；不扫描整个文件夹。",
    "unsupported local records were skipped.": "条不受支持的本地记录已跳过。", "to review": "条待审", "marks": "条标注",
    "Export review bundle": "导出审核包", "Includes annotations and sample fingerprints, not audio or tokens; this is not yet a training-ready snapshot.": "包含标注与采样指纹，不含音频或令牌；还不是可直接训练的数据快照。",
    "INSPECTOR": "检查器", "Select a layer": "选择一个图层", "Data": "数据", "Analysis": "分析", "Appearance": "外观",
    "Stop": "停止", "Play": "播放", "Pause": "暂停", "Loop": "循环", "Add a Module": "添加模组",
    "View All": "显示全部", "Analysis settings": "分析设置", "Analysis settings (requires recalculation)": "分析设置（需重新计算）",
    "Appearance settings": "外观设置", "Appearance settings (instant)": "外观设置（即时生效）",
    "Toggle Data Monitoring": "切换数据监测", "Overlay modules": "叠加模组", "Layers": "图层", "Collapse layers": "折叠图层",
    "Expand layers": "展开图层", "Layer layout": "图层布局", "Columns": "分列", "Overlay": "叠加",
    "Hide layer": "隐藏图层", "Show layer": "显示图层", "Drag to reorder layer": "拖动调整图层顺序", "Delete layer": "删除图层",
    "Opacity": "不透明度", "opacity": "不透明度", "Drag the grip to reorder · top layers draw in front": "拖动手柄调整顺序 · 顶层显示在前",
    "Collapse": "折叠", "Expand": "展开", "Move": "移动", "Delete": "删除", "Start": "起点", "End": "终点", "Duration": "时长",
    "Selection": "选区", "View": "视图", "Annotations": "标注", "New annotation": "新建标注",
    "Cursor": "光标", "new marks span 0.25 s": "新标注长度为 0.25 秒",
    "Export annotation JSON": "导出标注 JSON", "Import matching annotation JSON": "导入匹配的标注 JSON", "Import annotation JSON": "导入标注 JSON",
    "A selection becomes the annotation interval. Without one, a short interval is centered on the cursor.": "选区会成为标注区间；没有选区时，会以光标为中心建立短区间。",
    "Loading saved annotations…": "正在加载已保存的标注…", "Family": "类别", "Label": "标签", "Note": "备注",
    "Add confirmed annotation": "添加已确认标注", "Human": "人工", "Model suggestion": "模型建议", "Imported": "已导入",
    "Start (s)": "起点（秒）", "End (s)": "终点（秒）", "similarity": "相似度", "not a probability": "不是概率",
    "Save edits": "保存修改", "Confirm": "确认", "Reject": "拒绝", "Unsure": "不确定", "Delete annotation": "删除标注",
    "Show": "显示", "All states": "全部状态", "Suggestions": "待审建议", "Confirmed": "已确认", "Rejected": "已拒绝",
    "Enter a label before adding an annotation.": "请先输入标签。", "Check the label and time interval before saving.": "保存前请检查标签和时间区间。",
    "Annotation saved locally.": "标注已保存在本地。", "Confirmed as human-reviewed.": "已标记为人工确认。",
    "Rejected; retained for feedback export.": "已拒绝；记录将保留用于反馈导出。", "Marked for review.": "已标记为待审。",
    "Delete this annotation? This cannot be undone unless you exported it.": "删除这条标注？除非已导出，否则无法恢复。",
    "No annotations in this view. Select a range and add one, or save a CLAP suggestion.": "此视图没有标注。选择区间并添加，或保存一条 CLAP 建议。",
    "Cursor context": "光标上下文", "Results": "结果数量", "Provider": "模型", "Auto": "自动", "Mock (test)": "模拟（测试）",
    "Follow cursor and selection": "跟随光标与选区", "Analyze now": "立即分析", "Descriptions": "描述数",
    "Could not get a CLAP description": "无法取得 CLAP 描述", "Matching candidate descriptions…": "正在匹配候选文字…",
    "Raw prompt matches": "原始提示词匹配", "Updating…": "更新中…", "Click to plot": "点击绘制曲线",
    "Save as suggestion": "保存为待审建议", "Save for human review": "保存以供人工审核", "Save this prompt match for human review": "保存此提示词匹配以供人工审核",
    "Annotation timeline": "标注时间轴", "Annotations: upper row reviewed, lower row suggestions": "标注：上排为已审核，下排为待审建议",
    "Select annotation": "选择标注", "Curve color": "曲线颜色", "Keyword": "关键词", "Prompts": "提示词",
    "One prompt per line; multiple prompts are aggregated.": "每行一个提示词；多个提示词会聚合。",
    "Window (s)": "窗口（秒）", "Hop (s)": "步长（秒）", "Prompt aggregation": "提示词聚合方式",
    "Mean": "平均值", "Maximum": "最大值", "Analyze curve": "分析曲线", "Samples": "采样点数",
    "Cache": "缓存", "Hit": "命中", "Miss": "未命中", "Similarity": "相似度",
    "Name": "名称", "Color": "颜色", "Color map": "配色方案", "Color range minimum (0–1)": "颜色范围下限（0–1）",
    "Color range maximum (0–1)": "颜色范围上限（0–1）", "Layer opacity": "图层不透明度",
    "FFT size": "FFT 大小", "Hop length": "跳步长度", "Frame length": "帧长度", "Mel bands": "Mel 频带数",
    "Coefficients": "系数数量", "Tuning offset (semitones)": "调音偏移（半音）",
    "Minimum frequency (Hz)": "最低频率（Hz）", "Maximum frequency (Hz)": "最高频率（Hz）",
    "Bandwidth order": "带宽阶数", "Energy percentile": "能量百分位",
    "Track name": "轨道名称", "Marker color": "标记颜色", "Markers": "标记",
    "Hop length (samples)": "跳步长度（采样点）", "Frame length (samples)": "帧长度（采样点）",
    "Starting tempo (BPM)": "初始速度（BPM）", "Move markers to preceding energy minimum": "将标记移至前一个能量谷值",
    "Silence threshold below peak (dB)": "低于峰值的静音阈值（dB）",
    "Drawing range maximum (dB)": "绘制范围上限（dB）", "Drawing range minimum (dB)": "绘制范围下限（dB）",
    "FFT window overlaps": "FFT 窗口重叠次数", "FFT window size": "FFT 窗口大小",
    "inferno": "熔岩色", "spectrum": "光谱色", "grayscale": "灰度",
    "Reference layer": "参考图层", "Reference opacity": "参考图层不透明度", "None": "无",
    "Run librosa again and replace the cached result": "重新运行 librosa 并替换缓存结果", "Reanalyze": "重新分析",
    "Saved with project": "已随项目保存", "markers": "个标记",
    "Add range marker": "添加区间标记", "Add range marker from selection": "从选区添加区间标记",
    "Add Marker": "添加标记", "Add marker at playhead": "在播放指针处添加标记",
    "Completed:": "已完成：", "Starting…": "正在开始…", "selected": "个已选",
    "No marker selected": "未选择标记", "Ctrl/Cmd-click for multi-select": "按 Ctrl/Cmd 点击以多选",
    "Marker track": "标记轨道", "Marker Class": "标记类别", "Selected marker color": "所选标记颜色",
    "New marker color": "新标记颜色", "Selected marker label": "所选标记标签", "New marker label": "新标记标签",
    "Marker Name": "标记名称", "Delete Marker": "删除标记",
    "Press L to unlock the cursor": "按 L 解锁光标", "Press L to lock the cursor": "按 L 锁定光标",
    "Enable / Disable Channel": "启用／禁用声道", "Sample index:": "采样索引：", "Channel:": "声道：",
    "Value:": "数值：", "to": "至", "Recalculate spectrogram": "重新计算频谱图", "Recalculate": "重新计算",
    "FFT size:": "FFT 大小：", "FFT overlaps:": "FFT 重叠次数：", "FFT window:": "FFT 窗函数：",
    "FFT bin:": "FFT 频点：", "Frequency:": "频率：",
    "Analysis not cached yet": "尚未缓存分析结果", "Loaded from analysis cache": "已从分析缓存加载",
    "Analyzed now · saved to cache": "刚完成分析 · 已保存至缓存", "Reanalyzed · cache updated": "已重新分析 · 缓存已更新",
    "Analysis cache disabled": "分析缓存已关闭", "Analyzed now · cache unavailable": "刚完成分析 · 缓存不可用",
    "samples": "个采样点", "Bin": "频点", "Waiting for data": "等待数据",
    "upload": "上传", "draw": "绘制", "WebGL unavailable or failed · Canvas 2D fallback": "WebGL 不可用或失败 · 回退至 Canvas 2D",
    "Render failed:": "渲染失败：",
    "No text-matching model is loaded. Load LAION-CLAP or MuQ-MuLan in music-embedding-analysis.": "尚未加载可进行文字匹配的模型。请在 music-embedding-analysis 中加载 LAION-CLAP 或 MuQ-MuLan。",
    "Music embedding service rejected the request. Set the Bearer token shown when the service starts.": "音乐分析服务拒绝了请求。请设置服务启动时显示的 Bearer 令牌。",
    "could not be displayed.": "无法显示。", "Unknown rendering error": "未知渲染错误", "Remove module": "移除模组",
    "instrument": "乐器", "voice": "人声", "technique": "演奏法", "texture": "织体", "affect": "情绪", "production": "制作",
    "rhythm": "节奏", "genre": "风格", "pitch": "音高", "dynamics": "力度", "timbre": "音色", "harmony": "和声",
    "form": "曲式", "acoustics": "声学", "other": "其他", "rejected": "已拒绝", "ambiguous": "不确定",
    "suggested": "待审建议", "confirmed": "已确认", "human": "人工", "model": "模型", "import": "导入",
    "Waveform": "波形", "Marker": "标记", "Spectrogram": "频谱图", "CLAP description": "CLAP 描述",
    "CLAP keyword relevance": "CLAP 关键词相关性", "Chroma (librosa)": "色度特征 (librosa)",
    "Mel spectrogram (librosa)": "Mel 频谱 (librosa)", "MFCC (librosa)": "MFCC (librosa)",
    "Pitch YIN (librosa)": "音高 YIN (librosa)", "Onset strength (librosa)": "起音强度 (librosa)",
    "Spectral centroid (librosa)": "频谱质心 (librosa)", "Spectral bandwidth (librosa)": "频谱带宽 (librosa)",
    "Zero-crossing rate (librosa)": "过零率 (librosa)", "Spectral flatness (librosa)": "频谱平坦度 (librosa)",
    "Spectral rolloff (librosa)": "频谱滚降 (librosa)", "RMS (librosa)": "均方根能量 (librosa)",
    "Onsets (librosa)": "起音标记 (librosa)", "Beats (librosa)": "节拍标记 (librosa)",
    "Non-silent regions (librosa)": "非静音区间 (librosa)", "Librosa Analysis": "Librosa 分析"
};

const en: Record<string, string> = {
    instrument: "Instrument", voice: "Voice", technique: "Technique", texture: "Texture", affect: "Affect",
    production: "Production", rhythm: "Rhythm", genre: "Genre", pitch: "Pitch", dynamics: "Dynamics",
    timbre: "Timbre", harmony: "Harmony", form: "Form", acoustics: "Acoustics", other: "Other",
    suggested: "Suggested", confirmed: "Confirmed", rejected: "Rejected", ambiguous: "Unsure"
};

export function translate(locale: Locale, key: string): string {
    return locale === "zh" ? zh[key] ?? key : en[key] ?? key;
}

function initialLocale(): Locale {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved === "zh" || saved === "en") return saved;
    } catch { /* Storage may be unavailable in a restricted webview. */ }
    return typeof navigator !== "undefined" && navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en";
}

interface LocaleContextValue {
    locale: Locale;
    setLocale(locale: Locale): void;
    t(key: string): string;
}

const LocaleContext = createContext<LocaleContextValue>({ locale: "en", setLocale: () => undefined, t: key => key });

export const LocaleProvider: FunctionComponent<{ children: ReactNode }> = ({ children }) => {
    const [locale, setLocale] = useState<Locale>(initialLocale);
    useEffect(() => {
        document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
        try { localStorage.setItem(STORAGE_KEY, locale); } catch { /* Keep the in-memory choice. */ }
    }, [locale]);
    const value = useMemo(() => ({ locale, setLocale, t: (key: string) => translate(locale, key) }), [locale]);
    return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
};

export const useLocale = () => useContext(LocaleContext);
