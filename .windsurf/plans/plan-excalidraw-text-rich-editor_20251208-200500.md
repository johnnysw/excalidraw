# 计划：Excalidraw 文本富文本编辑器

## 任务背景
- 仓库：`excalidraw`
- 模块：`packages/excalidraw`（前端应用） + `packages/element`（元素模型和渲染）
- 现状：
  - 文本元素 `ExcalidrawTextElement` 目前整体使用一个 `strokeColor` / `fontSize` / `fontFamily`。
  - 我们已经初步引入了 `richTextRanges`（仅颜色）和画布端的分段渲染逻辑，使得在 canvas 上可以对同一 text 元素内的部分文字设置不同颜色。
  - 文本编辑使用的是 `textWysiwyg.tsx` 中的 `<textarea>` 实现：
    - 优点：实现简单，易于处理输入、撤销等；
    - 缺点：只能单色显示，进入编辑后所有文字都会使用同一个颜色，无法做到多色所见即所得。
- 本轮任务：在不影响既有 Excalidraw 功能和 API 使用方式的前提下，引入一个“富文本编辑器”视图，用于在编辑时也正确显示局部颜色（后续扩展到局部字体 / 字号）。

## 目标与非目标

### 目标
- **G1**：把现有 `textWysiwyg` 从 `<textarea>` 改造为 `contenteditable` 富文本视图：
  - 编辑状态下，文本颜色保持与 canvas 上一致，不再统一变成黑色或单一颜色。
  - 选中部分文字（蓝色背景高亮）时，仍然看到每个字符的原始颜色。
- **G2**：保持现有业务行为不变：
  - 文本内容的真源仍为 `originalText`；
  - 仍通过 `onChange(nextOriginalText)` / `onSubmit({ nextOriginalText })` 与 `App.handleTextWysiwyg` 交互；
  - 不修改对外 Excalidraw API 的数据格式（本轮只在内部实现富文本编辑视图）。
- **G3**：为后续的局部样式（颜色 / 字号 / 字体）扩展预留模型和选区能力：
  - 确认统一的样式范围数据结构（`textStyleRanges`）。
  - 确保编辑视图能够正确维护“编辑选区 ↔ 纯文本字符索引”的对应关系。

### 非目标（本轮不做或延后）
- 不在本轮直接完成“局部字体 / 字号编辑”的全部功能，只为之预留模型和管线。
- 不改动 Excalidraw 外部公开的 JSON/schema 规范，只在内部结构上演进；如后续需要对外暴露，将单独设计版本兼容策略。
- 不处理复杂富文本特性（粗体、斜体、下划线、链接、列表等），当前范围仅关注：
  - 局部颜色；
  - 未来扩展到局部 `fontSize` / `fontFamily`。

## 需求与场景

### 核心场景 S1：多色文本编辑
1. 用户在画布上选中一个包含多种颜色的 text 元素（单个 ExcalidrawTextElement）。
2. 双击进入编辑模式：
   - 画布上的文本保持原样；
   - 叠加出现富文本编辑视图（contenteditable），位置、旋转、缩放与原文本对齐；
   - 视图中的文本显示与 canvas 上一致的多色效果。
3. 用户拖蓝选中部分文字：
   - 选区背景高亮（浏览器自带的蓝色）之上，字符仍按原色显示。
4. 用户修改文本内容（输入、删除等）：
   - 文本变更实时通过 `onChange` 回写到 `originalText`；
   - 样式范围（颜色等）保持与原有 richTextRanges / 未来 textStyleRanges 一致，不因为纯文本变动而丢失或错位（此点允许有合理简化策略，如对大幅结构变化时清空局部样式）。
5. 用户完成编辑（回车、点击画布空白、快捷键等）：
   - 调用 `onSubmit`；
   - 富文本视图销毁，canvas 继续按样式范围渲染文本。

### 场景 S2：与属性面板联动（本轮仅保证兼容）
- 当用户在编辑模式下使用“文本颜色”按钮修改颜色时：
  - 现在已经有按选区写入 richTextRanges 的逻辑；
  - 富文本视图需要在元素更新后正确重新渲染颜色。

### 场景 S3：与绑定文本/自动换行的兼容
- 绑定到矩形 / 箭头等容器的文本，以及 `autoResize = false` 的多行文本，在编辑模式使用同一套富文本编辑器：
  - 保持原有的 bound text 布局、自动高度调整行为；
  - 富文本视图尺寸需配合 `wrapText`/`getBoundTextMaxWidth` 等逻辑。

## 技术方案草案

### 1. 样式范围模型：TextStyleRange

- 在 `packages/element/src/types.ts` 中引入统一的样式范围结构：

  ```ts
  export type TextStyleRange = {
    start: number;              // 文本中的起始字符索引（含）
    end: number;                // 结束字符索引（不含）
    color?: string;             // 文本颜色（覆盖 strokeColor）
    fontSize?: number;          // 字号（覆盖元素 fontSize）
    fontFamily?: FontFamilyValues; // 字体（覆盖元素 fontFamily）
  };

  export type ExcalidrawTextElement = _ExcalidrawElementBase & {
    // ...已有字段...
    textStyleRanges?: readonly TextStyleRange[];
  };
  ```

- 当前已有的 `richTextRanges`（仅 color）可以逐步迁移或在实现层做兼容：
  - 短期内允许 `richTextRanges` 与 `textStyleRanges` 并存；
  - 画布渲染优先读取 `textStyleRanges.color`，无则退回 richTextRanges 或整体 `strokeColor`。

### 2. 画布渲染适配（renderElement.ts）

- 已有实现：根据 color 范围在 canvas 上按段 `fillText`：
  - 使用全局字符索引 `globalCharIndex` 遍历每一行；
  - 根据范围决定当前字符颜色，遇到颜色变化时结束上一段、开始新段。
- 未来扩展策略：
  - 将 `getColorForIndex()` 扩展为 `getStyleForIndex()`，统一返回 color / fontSize / fontFamily；
  - 只要任意字段变化，就切分段，并调整 `context.font` 及 `measureText`。
- 本轮任务重点是 WYSIWYG 视图，画布侧保持现有多色渲染逻辑不再大改，仅为 textStyleRanges 预留接口。

### 3. 富文本 WYSIWYG：textarea → contenteditable

文件：`packages/excalidraw/wysiwyg/textWysiwyg.tsx`

- 核心改造：
  - 将

    ```ts
    const editable = document.createElement("textarea");
    ```

    替换为

    ```ts
    const editable = document.createElement("div");
    editable.contentEditable = "true";
    ```

  - 保持定位和 transform 逻辑不变：依然使用 `getTransform(...)` 与文本元素对齐。

- 文本与样式的 DOM 映射：
  - 从 `element.originalText` +（现阶段）`richTextRanges` /（未来）`textStyleRanges` 生成 DOM：
    - 遍历 `originalText`，按样式范围切成若干 segment；
    - 每个 segment 包裹在 `span` 中，并设置 `style.color`；
    - 不同字号/字体的支持预留，但本轮可先只用颜色。

- 文本同步：
  - 从 DOM 回写时使用 `editable.innerText` 获取纯文本：
    - 归一化换行符后调用 `normalizeText`；
    - 经 `onChange(nextOriginalText)` 写回元素 `originalText`；
    - 继续沿用 `wrapText` / `getTextWidth` / `redrawTextBoundingBox` 等逻辑调整元素尺寸。

### 4. 选区与字符索引映射

- 已在 `AppState` 中引入：

  ```ts
  textEditorSelection: { start: number; end: number } | null;
  ```

- 在 `textWysiwyg.tsx` 中：
  - 通过 `window.getSelection()` 获取当前光标 / 选区；
  - 遍历 editable 内的 `Text` 节点，累计长度，将 DOM 选区映射为 `[start, end)` 的字符索引；
  - 将结果写入 `app.setState({ textEditorSelection: ... })`；
  - 在 DOM 重新渲染后，根据 `textEditorSelection` 反向设置 selection（用于属性面板操作保持选区）。

- 该映射为后续“选中文本局部改样式”提供基础，但本轮只需保证：
  - 多色文本在编辑状态下显示正确；
  - 当前已有的颜色局部修改逻辑不会因 WYSIWYG 改造而失效。

### 5. 兼容性与行为保持

- 浏览器支持：
  - 使用标准 `contenteditable` + 原生 selection API，主流桌面浏览器均支持；
  - 对移动端 Safari / Android WebView 没有特殊要求，但需要避免明显的交互退化（如无法输入或选区错乱）。
- 行为保持：
  - 所有与缩放、旋转、绑定文本相关的逻辑，继续沿用现有 `updateWysiwygStyle` / `LinearElementEditor` / `computeBoundTextPosition`。
  - `handleTextWysiwyg` 的调用与当前完全一致。

## 验收标准

1. **多色显示**：
   - 在 canvas 上创建一个多色文本（通过现有 richTextRanges / 颜色操作实现）。
   - 双击进入编辑后，编辑视图中各字符颜色与 canvas 完全一致。
2. **选中不变色**：
   - 在编辑视图中拖蓝选中任意部分文字：
     - 选区背景变蓝（浏览器默认行为）；
     - 各字符仍按原来的多色显示，不会统一变成黑色或其他单一颜色。
3. **文本同步**：
   - 编辑视图中输入、删除文字，退出编辑后：
     - 画布上的文本内容与编辑视图一致；
     - 之前已有的颜色范围仍能正常作用在文本上（在合理的变动范围内）。
4. **无回归**：
   - 绑定到矩形 / 箭头等容器的文本在编辑时不会错位或尺寸异常；
   - 撤销/重做、缩放、平移画布等功能与原来行为一致；
   - 不影响非文本元素和其他属性面板功能。

## 风险与未知问题

- **DOM 与文本索引的同步复杂度**：
  - 重建 DOM 时需要小心恢复 selection，避免用户体验突然跳动或选区错乱。
- **样式范围与文本变动的关系**：
  - 当用户在中间插入 / 删除大段文本时，如何合理调整现有样式范围（例如：只在简单场景下保留局部样式，遇到极端变动时回退为整体样式）。
- **contenteditable 的跨浏览器细节**：
  - 如空行处理、末尾换行、粘贴带格式文本等，需要制定统一的归一化策略（本轮可以先用粗粒度清洗：只保留纯文本，样式以内部范围为准）。
- **与未来局部字体/字号编辑的兼容**：
  - 在设计 TextStyleRange 时需要考虑后续扩展字段，避免将来需要再次大规模迁移。
