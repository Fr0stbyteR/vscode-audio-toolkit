# Audio Toolkit Web

[English](README.md) · [详细设置](STANDALONE.md) · [发布清单](docs/RELEASING.md)

模块化、交互式的音频分析与标注工作区。在同一时间轴查看音频、乐谱、钢琴卷帘
和分析结果；独立 Web 应用，不需要 VS Code 或扩展宿主。

![K545 波形与频谱总览](docs/screenshots/k545-overview.jpg)

截图以莫扎特 C 大调第 16 号钢琴奏鸣曲 K.545 第一乐章的本地录音为例。

## 功能

- 同步波形、频谱、播放指针、选区、缩放和数据检查。
- 模组分列／叠加、拖动排序、显示隐藏、透明度；统一右侧检查器。
- 单点／区域 Marker；自动起音、节拍和候选区域可人工编辑并保存。
- Vector、Matrix、Markers 共用渲染器；矩阵 Canvas2D／WebGL、可调色图与
  颜色范围。重新计算参数和即时外观调整分开。
- Librosa 指标、29 个原生 Essentia DSP 模组和 21 个 TensorFlow 视图：
  乐器、情绪／主题、风格、音色、标签、速度等。
- 信号统计：峰值／峰均比、时域偏度／峰度、频谱倾斜／斜率／不规则度、
  估计谐噪比、LPC 共振峰曲线、LPCC 热图、六种频谱／调制粗糙度指数。
  时域调制模型为估计，不是校准过的 Asper 测量值。
- Data 自动统计：有选区时统计选区，否则统计整曲，不用手动切换。
  Vector／Matrix 原始值提供均值、极值、标准差、均方根，可筛选矩阵行；
  Marker 提供数量／覆盖时长，乐谱和钢琴卷帘提供对齐后的音高／音符时长统计。
  使用已有结果，不重新请求分析。
- CLAP／MuLan 上下文描述、原始匹配和关键词相关性曲线；长计算渐进显示。
- MusicXML 单 system 横向乐谱、DTW 对齐与人工锚点；MIDI／MusicXML
  同步钢琴卷帘，支持轨道开关、黑白键背景和音名。
- 乐谱辅助 metadata、区域标记、VA 双曲线、乐谱标记速度与独立的 DTW
  实际演奏速度；自动建议不直接覆盖手工信息。后端 OMR 支持图片／PDF 导入。
- 文件夹浏览、浏览器句柄记忆、`.audio_toolkit/` 结果持久化、工作区文档
  导出／导入，以及中英文切换。

![K545 乐谱与对齐](docs/screenshots/k545-score.jpg)

![K545 同步钢琴卷帘](docs/screenshots/k545-pianoroll.jpg)

## 运行

建议使用 Chrome／Edge 的本地文件夹 API，CI 使用 Node 22。

仅前端，不需要 Python：

```sh
git clone https://github.com/fr0stbyter/vscode-audio-toolkit.git
cd vscode-audio-toolkit
npm ci
npm run dev
```

打开输出地址，通常为 `http://127.0.0.1:5173/`，选择打开文件夹或单个音频。
播放、波形、浏览器频谱、手工 Marker、MusicXML 和钢琴卷帘可直接运行。

要使用分析后端，把 [music-embedding-analysis](https://github.com/Fr0stbyteR/music-embedding-analysis)
克隆到此项目旁边，一键启动：

```powershell
# Windows
.\start-standalone.ps1
```

```sh
# macOS
bash start-standalone.command
```

首次需联网、磁盘空间，会准备依赖和原生 Essentia／模型并自检，后续复用。
Windows 已验证真实推理；macOS 适配与模型 CI 已配置，不等于都在本机 Mac
上验证。Windows 可用 `-MusicBackendPath <path>` 指定后端位置。

后端选项在后端 `.env`；前端默认连接见 `.env.example`，右上角设置可连接
本地／远程后端。**公开构建不要嵌入私人 token**，所有 `VITE_*` 值都能从
JavaScript 读取。详见 [安全说明](SECURITY.md)。

## 重现 K545

1. 打开你有权使用的录音和对应 MusicXML。
2. 乐谱模组点击“自动对齐音频（DTW）”及“添加同步钢琴卷帘”。
3. 缩放到乐句、移动指针检查对应关系，有偏差时补人工锚点。
4. 添加实际演奏速度、分析和区域模组，在本地文件夹保存工作区。

截图使用本地 `k545-1.mp3` 和 `k545-1.xml`，不分发这些文件。本地 XML 的
rights 字段标注 `www.antescofo.com`；作品、录音和具体谱面不是同一版权对象。
请使用自己的合法素材，见 [媒体说明](THIRD_PARTY_NOTICES.md)。

## 开发／发布

```sh
npm run check
npm run preview
npm run release:prepare
```

静态输出在 `dist/`，附带许可文件和 `source/` 源码。首次准备发布时下载并校验
FFTW／Verovio 源码归档，见 [构建说明](docs/CORRESPONDING_SOURCE.md)。
用 HTTP／HTTPS 服务，不用 `file://`。前端 CI 进行
Linux／Windows／macOS 检查并生成 artifact，不自动发布 Release 或部署。

## 许可证与限制

模型得分、候选区域、段落推断、DTW 和 OMR 都需人工检查；窗口级模型不是
逐音符精确判定。前端使用 [GPL-3.0-or-later](LICENSE)，发布构建需同时提供
对应源码和构建说明。FFTW、Verovio、图标、字体、后端模型保留独立许可。发布或商用前
阅读 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
