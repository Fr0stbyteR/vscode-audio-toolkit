import { createContext, FunctionComponent, ReactNode, useContext, useEffect, useMemo, useState } from "react";

export type Locale = "zh" | "en";
const STORAGE_KEY = "audioToolkit.locale";

const zh: Record<string, string> = {
    "Playback follow": "播放头跟随", "Page follow": "翻页跟随", "Scroll follow": "滚动跟随",
    "Turn the page before the playhead leaves the view": "播放头接近视图右边缘时翻页，保留当前缩放",
    "Scroll with the playhead while keeping the current zoom": "视图随播放头滚动，保留当前缩放",
    "Analysis backend connected": "分析后端已连接", "Connecting to analysis backend": "正在连接分析后端", "Analysis backend disconnected": "分析后端未连接", "Analysis backend settings": "分析后端设置",
    "Add all cached modules": "一键添加已缓存模组",
    "Local analysis available": "已有本地分析结果", "No local analysis available": "尚无本地分析结果", "Analysis data loaded": "分析数据已加载",
    "Reset this audio…": "重置此音频…", "Clear local results and reset this audio": "清空此音频的本地结果并重置界面",
    "Reset this audio?": "重置此音频？", "Clear and reset": "清空并重置", "Could not reset audio": "无法重置音频",
    "This clears all modules, markers, score links, metadata and local analysis results for this audio. This cannot be undone.": "将清除此音频的所有模组、标记、乐谱关联、元数据及本地分析结果。此操作不可撤销。",
    "The original audio, other audio files, backend caches and connection settings are kept.": "保留原音频、其他音频的数据、后端缓存及连接设置。",
    "Instrument distribution": "乐器分布", "Instrument relevance": "乐器相关性", "Instrument regions · candidates": "乐器区域 · 候选",
    "Mood and theme": "情绪与主题", "Mood and theme relevance": "情绪与主题相关性", "Genre distribution": "风格分布",
    "Timbre brightness": "音色明暗", "Voice presence": "人声存在度", "Acoustic character": "原声特征", "Electronic character": "电子音色特征",
    "Tonal character": "有调性特征", "Danceability": "可舞性", "Happy mood": "快乐情绪", "Sad mood": "悲伤情绪",
    "Relaxed mood": "放松情绪", "Aggressive mood": "激烈情绪", "Party character": "派对特征",
    "Music auto-tags": "音乐自动标签", "Music tag relevance": "音乐标签相关性", "Tempo · audio estimate": "速度 · 音频估计", "Tempo candidates": "速度候选分布",
    "Prediction interval (s)": "预测间隔（秒）", "Target label": "目标标签", "Candidate score threshold": "候选得分阈值", "Score": "模型得分",
    "Import MusicXML": "导入 MusicXML", "Import MusicXML / MIDI": "导入 MusicXML / MIDI", "Image / PDF → MusicXML": "图片 / PDF → MusicXML", "Recognizing score": "识别乐谱", "Preparing score recognition": "准备乐谱识别", "Preparing isolated HOMR environment": "准备独立 HOMR 环境", "Score pages prepared": "乐谱页面已准备", "HOMR models prepared": "HOMR 模型已准备",
    "OMR result — review the score before alignment": "OMR 识别结果：对齐前请检查乐谱", "Restart the updated backend to enable OMR": "请重启更新后的后端以启用 OMR", "Score recognition failed": "乐谱识别失败", "Score upload exceeds 50 MiB": "乐谱文件不能超过 50 MiB",
    "OMR is an estimate: review pitches, rhythm, voices, key signatures and page joins before DTW alignment.": "OMR 是推断结果：DTW 对齐前请检查音高、节奏、声部、调号和跨页衔接。",
    "Choose a keyword to analyze its relevance over time": "输入关键词，分析它随时间变化的相关性", "Relevance request prepared": "相关性请求已准备", "Curve prepared": "曲线已生成", "Partial preview": "部分结果",
    "Analyze audio or add mood points": "分析音频，或手动添加情绪点", "Import a score to get tempo data": "导入乐谱以获取速度数据", "Open score module": "打开乐谱模组", "Select a range to add a region": "选择一段时间以添加区域标记", "Add selection region": "添加选区标记", "Region": "区域",
    "Add instrument": "添加乐器", "Remove instrument": "删除乐器", "Could not infer score sections": "无法从当前乐谱推断段落",
    "Sample point": "采样点",
    "Restart the updated backend to enable mood analysis": "请重启更新后的后端以启用情绪分析", "Mood model is not available": "情绪模型当前不可用", "No mood analysis backend is available": "未连接情绪分析后端",
    "Essentia Python/TensorFlow is not supported on native Windows. Run this backend in WSL/Linux or macOS and connect its API.": "Essentia Python/TensorFlow 不支持原生 Windows。请在 WSL/Linux 或 macOS 运行后端并连接其 API。",
    "Install the optional essentia-tensorflow package in the backend environment.": "请在后端环境中安装可选的 essentia-tensorflow 包。",
    "Missing Essentia weights: msd-musicnn-1.pb and deam-msd-musicnn-2.pb in MAB_MODEL_ROOT/essentia.": "缺少 Essentia 权重：请将 msd-musicnn-1.pb 和 deam-msd-musicnn-2.pb 放入 MAB_MODEL_ROOT/essentia。",
    "Score tempo": "乐谱标记速度", "Performed tempo · DTW": "实际演奏速度 · DTW", "Mood · VA curve": "情绪 · VA 曲线", "Form · regions": "曲式 · 区域标记", "Mode / key · regions": "调式 / 调性 · 区域标记", "Meter · regions": "节拍 · 区域标记",
    "Open module": "打开模组", "Analyze mood": "分析情绪", "Add point at playhead": "在播放光标处添加点", "Curve point": "曲线控制点", "Delete point": "删除控制点", "Manual": "手动", "DTW estimate": "DTW 推断值", "Manual alignment estimate": "手动对齐推断值",
    "Import a score and run DTW alignment first": "请先导入乐谱并执行 DTW 对齐", "Minimum section (measures)": "最短段落（小节）", "Infer score sections": "推断乐谱段落", "Section candidates": "候选段落", "Use section candidates": "使用候选段落", "Replace existing form regions with candidates?": "用推断的候选段落替换现有曲式标记？", "Discard": "丢弃",
    "Piece metadata": "整曲元数据", "Title": "曲名", "Composer": "作曲者", "Global structure": "全局曲式", "Tempo (BPM)": "速度（BPM）", "Mode / key": "调式 / 调性", "Instruments": "乐器列表", "Meter": "节拍",
    "Context / music function": "活动语境 / 音乐功能", "Theme type": "主题类型", "Other theme": "其他主题", "Mood · VA": "情绪 · VA", "Valence": "效价 V", "Arousal": "唤醒度 A",
    "High arousal": "高唤醒", "Low arousal": "低唤醒", "Negative": "负向", "Positive": "正向", "Add region": "添加区域", "Select region": "选中区域", "Delete region": "删除区域", "Label": "标签", "Start (s)": "起点（秒）", "End (s)": "终点（秒）", "Time (s)": "时间（秒）",
    "Add tempo point": "添加速度点", "Delete tempo point": "删除速度点", "Add tempo at playhead": "在播放光标处添加速度点", "Tempo curve": "速度曲线", "Use the selection, or the whole piece if no range is selected": "使用当前选区；没有选区时使用整曲",
    "MusicXML values": "MusicXML 推断值", "Your edits are kept. Select fields to replace with score values.": "已保留你的填写。勾选字段可用乐谱值替换。", "Apply selected score values": "应用勾选的乐谱值", "Score values filled. Your edits will be preserved on import.": "已填入乐谱信息；后续导入会保留你的修改。",
    "Narrative": "叙事", "Lyrical": "抒情", "Labor": "劳动", "Ritual": "仪式", "Festival": "节庆", "Love": "爱情", "History": "历史", "Knowledge narration": "知识讲述", "Daily life": "日常生活", "Other": "其他",
    "Pentatonic": "五声调式", "Heptatonic": "七声调式", "Major": "大调", "Minor": "小调", "Dorian": "多利亚", "Phrygian": "弗里几亚", "Lydian": "利底亚", "Mixolydian": "混合利底亚",
    "Browser workspace": "浏览器工作区", "NOW INSPECTING": "当前音频", "Choose an audio file from the library": "从音频库选择文件",
    "Librosa ready": "Librosa 已就绪", "Checking service": "正在检查服务", "Service offline": "服务离线",
    "CLAP loaded": "CLAP 已加载", "Load CLAP": "加载 CLAP", "Checking CLAP": "正在检查 CLAP", "CLAP offline": "CLAP 离线",
    "Music analysis service · librosa + CLAP": "音乐分析服务 · librosa + CLAP", "API base URL": "API 地址", "Bearer token": "Bearer 令牌",
    "(saved in this browser)": "（保存在此浏览器）", "Cancel": "取消", "Connect": "连接", "Could not open audio": "无法打开音频",
    "Save analyses in folder": "保存分析到文件夹", "Folder saving on": "文件夹自动保存已开启", "Retry folder save": "重试文件夹保存",
    "Saving existing analyses…": "正在保存已有分析…",
    "Enable saving in .audio_toolkit": "允许写入 .audio_toolkit", "Folder auto-save is on": "文件夹自动保存已开启", "Folder save failed": "文件夹保存失败",
    "Reading local audio": "正在读取本地音频", "STANDALONE ANALYSIS WORKSPACE": "独立音频分析工作区",
    "Open folder": "打开文件夹", "Open a folder.": "打开文件夹。", "Listen closer.": "细听每一处。",
    "Files remain in the browser. Only audio you choose to analyze is sent to the configured backend.": "目录留在浏览器。只有你选择分析的音频会发送到已配置的后端。",
    "Local folder": "本地文件夹", "Selected file": "选中的文件", "Analysis API": "分析 API",
    "LOCAL LIBRARY": "本地音频库", "No folder open": "未打开文件夹", "Open a local folder": "打开本地文件夹",
    "Selected files": "已选文件", "Drop into your sound library": "从音频库开始", "Restoring the previous folder…": "正在恢复上次的文件夹…",
    "Open local folder": "打开本地文件夹", "Choose another folder": "选择其他文件夹", "Reconnect": "重新连接",
    "Files remain local until you request an analysis.": "只有请求分析时才会发送音频。",
    "This browser uses a directory-upload fallback. Chrome and Edge support on-demand access.": "当前浏览器使用目录上传兼容模式。Chrome / Edge 可提供按需读取。",
    "Could not restore the previous folder:": "无法恢复上次的文件夹：", "Folder permission was not granted.": "未获得文件夹读取权限。",
    "INSPECTOR": "检查器", "Select a layer": "选择一个图层", "Data": "数据", "Analysis": "分析", "Appearance": "外观",
    "Stop": "停止", "Play": "播放", "Pause": "暂停", "Loop": "循环", "Add a Module": "添加模组",
    "View All": "显示全部", "Analysis settings": "分析设置", "Analysis settings (requires recalculation)": "分析设置（需重新计算）",
    "Appearance settings": "外观设置", "Appearance settings (instant)": "外观设置（即时生效）",
    "Toggle Data Monitoring": "切换数据监测", "Overlay modules": "叠加模组", "Layers": "图层", "Collapse layers": "折叠图层",
    "Expand layers": "展开图层", "Layer layout": "图层布局", "Columns": "分列", "Overlay": "叠加",
    "Hide layer": "隐藏图层", "Show layer": "显示图层", "Drag to reorder layer": "拖动调整图层顺序", "Delete layer": "删除图层",
    "Opacity": "不透明度", "opacity": "不透明度", "Drag the grip to reorder · top layers draw in front": "拖动手柄调整顺序 · 顶层显示在前",
    "Drag to reorder · top layers draw in front": "拖动调整顺序 · 上层显示在前", "Drag to reorder · list follows canvas order": "拖动调整顺序 · 与画布上下顺序一致",
    "Collapse": "折叠", "Expand": "展开", "Move": "移动", "Delete": "删除", "Start": "起点", "End": "终点", "Duration": "时长",
    "Selection": "选区", "View": "视图", "similarity": "相似度",
    "Cursor context": "光标上下文", "Results": "结果数量", "Provider": "模型", "Auto": "自动", "Mock (test)": "模拟（测试）",
    "Follow cursor and selection": "跟随光标与选区", "Analyze now": "立即分析", "Descriptions": "描述数",
    "Could not get a CLAP description": "无法取得 CLAP 描述", "Matching candidate descriptions…": "正在匹配候选文字…",
    "Raw prompt matches": "原始提示词匹配", "Updating…": "更新中…", "Click to plot": "点击绘制曲线",
    "Curve color": "曲线颜色", "Keyword": "关键词", "Prompts": "提示词",
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
    "form": "曲式", "acoustics": "声学", "other": "其他",
    "Waveform": "波形", "Marker": "标记", "Spectrogram": "频谱图", "CLAP description": "CLAP 描述",
    "CLAP keyword relevance": "CLAP 关键词相关性", "Chroma (librosa)": "色度特征 (librosa)",
    "Mel spectrogram (librosa)": "Mel 频谱 (librosa)", "MFCC (librosa)": "MFCC (librosa)",
    "Pitch YIN (librosa)": "音高 YIN (librosa)", "Onset strength (librosa)": "起音强度 (librosa)",
    "Spectral centroid (librosa)": "频谱质心 (librosa)", "Spectral bandwidth (librosa)": "频谱带宽 (librosa)",
    "Zero-crossing rate (librosa)": "过零率 (librosa)", "Spectral flatness (librosa)": "频谱平坦度 (librosa)",
    "Spectral rolloff (librosa)": "频谱滚降 (librosa)", "RMS (librosa)": "均方根能量 (librosa)",
    "Onsets (librosa)": "起音标记 (librosa)", "Beats (librosa)": "节拍标记 (librosa)",
    "Non-silent regions (librosa)": "非静音区间 (librosa)", "Librosa Analysis": "Librosa 分析",
    "MusicXML score": "MusicXML 乐谱", "Piano roll": "钢琴卷帘", "Import score": "导入乐谱",
    "Open one audio file": "打开单个音频",
    "Auto-align to audio (DTW)": "自动对齐音频（DTW）", "Add synchronized piano roll": "添加同步钢琴卷帘",
    "Alt-click a note to select it without moving the playhead": "按住 Alt 点击音符可只选中音符，不移动播放指针",
    "Add synchronized score": "添加同步乐谱", "Anchor selected note to playhead": "将所选音符锚定到播放指针",
    "Automatic alignment active": "已启用自动对齐", "Linear timing until aligned": "对齐前使用线性时间映射",
    "manual anchors": "个人工锚点", "Clear manual anchors": "清除人工锚点",
    "Loading score": "正在加载乐谱", "Importing score": "正在导入乐谱", "Preparing audio chroma": "正在准备音频色度特征",
    "Extracting chroma features": "正在提取色度特征", "Aligning score and audio": "正在对齐乐谱与音频",
    "Import MusicXML to display a score": "导入 MusicXML 以显示乐谱", "Import MusicXML or MIDI to display notes": "导入 MusicXML 或 MIDI 以显示音符",
    "Score alignment map": "乐谱对齐图", "Measure": "小节", "Score note": "音符", "Pitch": "音高", "Instrument": "乐器",
    "Score time": "乐谱时间", "Audio time": "音频时间", "Anchors must follow the same order in score and audio.": "人工锚点在乐谱与音频中的顺序必须一致。",
    "The score file is no longer in local storage. Import it again.": "本地存储中已找不到此乐谱，请重新导入。",
    "Choose a MusicXML (.musicxml, .xml, .mxl) or MIDI (.mid, .midi) file.": "请选择 MusicXML（.musicxml、.xml、.mxl）或 MIDI（.mid、.midi）文件。",
    "Verovio could not read this MusicXML file.": "Verovio 无法读取此 MusicXML 文件。",
    "Both audio and score need note data for alignment.": "对齐需要音频和乐谱音符数据。", "The alignment path could not be found.": "无法找到对齐路径。"
};

const en: Record<string, string> = {
    instrument: "Instrument", voice: "Voice", technique: "Technique", texture: "Texture", affect: "Affect",
    production: "Production", rhythm: "Rhythm", genre: "Genre", pitch: "Pitch", dynamics: "Dynamics",
    timbre: "Timbre", harmony: "Harmony", form: "Form", acoustics: "Acoustics", other: "Other",
    suggested: "Suggested", confirmed: "Confirmed", rejected: "Rejected", ambiguous: "Unsure"
};

Object.assign(zh, {
    "Energy": "能量", "Loudness · Stevens": "响度 · Stevens", "Zero-crossing rate": "过零率",
    "Spectral centroid": "频谱质心", "Spectral rolloff": "频谱滚降", "Spectral flatness": "频谱平坦度",
    "Spectral crest": "频谱峰值因子", "Spectral flux": "频谱通量", "Spectral entropy": "频谱熵",
    "Spectral complexity": "频谱复杂度", "High-frequency content": "高频含量", "Spectral spread": "频谱展宽",
    "Spectral skewness": "频谱偏度", "Spectral kurtosis": "频谱峰度", "Sensory dissonance": "感知不协和度",
    "Pitch · YIN FFT": "音高 · YIN FFT", "Pitch confidence": "音高置信度", "Onset strength": "起音强度",
    "Mel bands": "Mel 频带", "Bark bands": "Bark 频带", "ERB bands": "ERB 频带",
    "Harmonic pitch-class profile": "谐波音级分布（HPCP）", "Onsets": "起音", "Silence regions": "静音区域",
    "Stable pitch regions · estimated": "稳定音高区域 · 估计", "Key regions · estimated": "调性区域 · 估计",
    "Analysis sample rate": "分析采样率", "Minimum region duration (s)": "最短区域时长（秒）",
    "Key context window (s)": "调性分析窗口（秒）", "Reference pitch A4 (Hz)": "参考音高 A4（Hz）",
    "Silence threshold (dBFS)": "静音阈值（dBFS）", "Minimum confidence": "最低置信度",
    "Analysis request prepared": "分析请求已准备", "Cached analysis loaded": "已读取分析缓存",
    "Native analysis completed": "原生分析已完成", "Display data prepared": "显示数据已准备",
    "Checking analysis cache": "分析请求已准备", "Updating markers": "标记数据已取得",
    "Restart the updated backend to enable Essentia analysis": "请重启更新后的后端以启用 Essentia 分析",
    "Native Essentia is not available": "原生 Essentia 尚未就绪",
    "Rebuild the Essentia native worker to enable this algorithm": "请重新构建 Essentia 原生 worker 以启用此算法"
});

export function translate(locale: Locale, key: string): string {
    if (locale === "zh" && key.endsWith(" (Essentia TF)")) return `${zh[key.slice(0, -" (Essentia TF)".length)] ?? key.slice(0, -" (Essentia TF)".length)} (Essentia TF)`;
    if (locale === "zh" && /^Recognized page \d+\/\d+$/.test(key)) return key.replace(/^Recognized page (\d+)\/(\d+)$/, "已识别 $1 / $2 页");
    if (locale === "zh" && key.endsWith(" (Essentia)")) return `${zh[key.slice(0, -" (Essentia)".length)] ?? key.slice(0, -" (Essentia)".length)} (Essentia)`;
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
