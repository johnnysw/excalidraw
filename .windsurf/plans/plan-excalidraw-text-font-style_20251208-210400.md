# 计划：Excalidraw 文本局部字体/字号编辑

## 任务背景
- 仓库：`excalidraw`
- 模块：`packages/excalidraw`（App + 属性面板 + WYSIWYG）、`packages/element`（元素模型与渲染）。
- 已有实现：
  - 文本元素支持 `TextStyleRange` / `RichTextRange`，画布端已实现按范围多色渲染。
  - WYSIWYG 已从 `<textarea>` 改为 `contenteditable`，支持：
    - 多色编辑视图；
    - 进入编辑自动全选；
    - 在属性面板修改颜色后，选区保持不变。
  - AppState 中有 `textEditorSelection`，WYSIWYG 能在 DOM 与字符 index 之间双向映射选区。
- 本轮任务：在此基础上继续支持 **选区级别的字体 / 字号样式编辑**，并在属性面板中为字号增加一个自定义输入框。

## 目标与非目标

### 目标
- **G1：局部字体/字号样式**
  - 在同一 `ExcalidrawTextElement` 内，对选中文本单独设置：
    - `fontFamily`（字体）；
    - `fontSize`（字号）。
  - 未选中时（仅有光标）：继续保持当前行为——修改作用于整个文本元素 / 当前默认样式。
- **G2：属性面板交互**
  - 在现有“字体大小”区域，保留 S / M / L / XL 等预设按钮的同时，新增一个自定义字号输入框：
    - 输入具体数值（例如 18、24）；
    - 当存在选区时，数值作用于选中文本；
    - 当不存在选区时，数值作用于整个文本元素和 `currentItemFontSize`。
  - 字体选择器同理：支持对当前选区单独设置字体。
- **G3：画布渲染一致性**
  - 画布端正确按照 `TextStyleRange.fontSize` / `fontFamily` 渲染：
    - 同一行内不同字号/字体的文本排版正确；
    - 多行文本和容器内文本的布局尽量合理（允许在极端场景下有轻微差异）。

### 非目标
- 本轮 **不覆盖**：
  - 粗体、斜体、下划线、行高等其它富文本属性；
  - 对外 JSON schema 的正式版本升级（内部结构可以演进，对外导出格式暂保持兼容或隐藏）；
  - 复杂富文本编辑功能（列表、链接、段落级样式等）。

## 需求与场景

### 场景 S1：局部字号调整
1. 用户在画布上选中一个文本元素，双击进入编辑，自动全选全部文本。
2. 用户拖蓝选中其中一小段文字（例如“哈哈哈 hahaha”中的 “hahaha”）。
3. 在属性面板的“字体大小”区域：
   - 点击某个预设按钮（如 L）或在自定义输入框中输入 `28`；
   - 仅选中的那部分文字字号发生变化，其他部分保持原字号。
4. 用户再次点击文字颜色、字体等其它属性时，仍然基于当前选区进行修改。
5. 退出编辑后，canvas 端渲染出的文本段在视觉上体现出不同字号。

### 场景 S2：局部字体调整
1. 在编辑模式下选中一段文字。
2. 在字体下拉中选择另一种字体（例如从默认字体切换到手写体）。
3. 仅选中部分的字体发生变化。
4. 多种字体混排时，文本基线和对齐在视觉上仍然合理（允许存在微小差异）。

### 场景 S3：无选区时的整体行为
1. 在编辑模式下，如果没有选区（仅有光标）：
   - 修改字体 / 字号：
     - 作用于整个 `ExcalidrawTextElement`；
     - 同时更新 `appState.currentItemFontFamily` / `currentItemFontSize`；
     - 清空对应的 `TextStyleRange` 字段（或将它们与整体样式保持一致）。

### 场景 S4：绑定文本与多行
- 文本被绑定到矩形 / 箭头等容器，且为多行时：
  - 局部字体/字号调整不会打乱整体布局；
  - 自动换行逻辑仍然基于字符宽度计算；
  - 在合理范围内接受「不同字号导致换行点略有变化」的情况。

## 技术方案草案

### 1. 数据结构与模型层
- 使用已有的 `TextStyleRange`：

  ```ts
  export type TextStyleRange = {
    start: number;
    end: number;
    color?: string;
    fontSize?: number;
    fontFamily?: FontFamilyValues;
  };
  ```

- 约定：
  - `textElement.textStyleRanges` 为局部样式的唯一来源；
  - 颜色相关逻辑可以继续兼容现有 `richTextRanges`，但逐步向 `textStyleRanges` 迁移；
  - 字号 / 字体的局部修改仅通过 `textStyleRanges` 实现。

### 2. 属性应用逻辑（actions）

- 在 `packages/excalidraw/actions/actionProperties.tsx` 中：
  - 新增辅助函数：

    ```ts
    function applyFontSizeToRange(
      existing: readonly TextStyleRange[] | undefined,
      start: number,
      end: number,
      fontSize: number,
      defaultFontSize: number,
    ): TextStyleRange[] { ... }

    function applyFontFamilyToRange(
      existing: readonly TextStyleRange[] | undefined,
      start: number,
      end: number,
      fontFamily: FontFamilyValues,
      defaultFontFamily: FontFamilyValues,
    ): TextStyleRange[] { ... }
    ```

  - 逻辑类似当前的 `applyColorToRichTextRange`：
    - 对已有范围进行裁剪 / 拆分 / 合并；
    - 若新值等于默认值，则相当于「去掉局部样式」，不新建范围；
    - 保证结果范围按 `start` 有序，且相邻且样式相同的范围会被合并。

  - 在字号 / 字体相关的 action 中：
    - 如果 `appState.editingTextElement` 存在且 `textEditorSelection` 有效（`start !== end`）：
      - 在对应 `ExcalidrawTextElement` 上更新 `textStyleRanges`；
      - 不直接改 `fontSize` 或 `fontFamily` 字段（整体保持不变）。
    - 否则（无选区）：保持现有整体修改逻辑。

### 3. 属性面板 UI 改造

- 文件：`actionProperties.tsx` 中与字体 / 字号有关的 `PanelComponent`。

- 字体大小区域：
  - 保持 S / M / L / XL 等原有按钮；
  - 在其后添加一个 `<input type="number">`：
    - 显示当前字号（若多选或多值，则显示空或占位符）；
    - `onChange` 时触发字体大小 action，内部根据是否有选区决定整体 vs 局部。

- 字体选择器：
  - 使用现有 `FontPicker` 组件；
  - 调整 perform 逻辑，使其在有选区时更新 `textStyleRanges.fontFamily`。

### 4. 画布渲染扩展

- 文件：`packages/element/src/renderElement.ts`。

- 在现有多色渲染逻辑基础上：
  - 引入 `getStyleForIndex(index)`：

    ```ts
    const style = getStyleForIndex(index);
    // style.color / style.fontSize / style.fontFamily
    ```

  - 在逐字符扫描一行时，只要 color / fontSize / fontFamily 任一发生变化，就结束上一段 segment：
    - 在绘制 segment 前设置：

      ```ts
      context.font = getFontString({
        fontSize: segmentFontSize,
        fontFamily: segmentFontFamily,
      });
      context.fillStyle = segmentColor;
      ```

    - 使用当前 `context.font` 重新计算 `measureText(segment)` 来累积 `x` 坐标。

- 注意：
  - 需要确保 `getFontString` 在不同字号 / 字体下行为一致；
  - 大段文本情况下性能需评估，但可以先采用简单实现，后续再考虑缓存。

### 5. WYSIWYG 视图与样式显示

- 富文本编辑器当前只按颜色分段渲染：

  ```ts
  span.style.color = currentColor;
  ```

- 本轮为减少复杂度：
  - WYSIWYG 视图可以先 **不完全还原字号/字体差异**，依然以单一字号/字体显示；
  - 或仅在简单场景下尝试通过 `span.style.fontSize` / `fontFamily` 体现部分样式；
  - 真正严格的所见即所得可以在后续迭代中增强。

## 验收标准

1. **局部字体/字号修改**
   - 在编辑模式下选中一段文字，修改字体或字号：
     - 仅选中部分的样式变化；
     - 退出编辑后 canvas 渲染结果与预期一致。
2. **整体行为保持**
   - 在无选区时修改字体/字号：
     - 整个文本元素更新；
     - `currentItemFontFamily` / `currentItemFontSize` 同步更新；
     - 不产生意料之外的局部范围。
3. **属性面板交互**
   - 字号预设按钮与自定义输入框之间行为一致：
     - 自定义输入框输入的大小与点击对应预设产生相同的效果；
     - 重复修改时不会出现范围错乱或混乱合并。
4. **无明显回归**
   - 对已有多色文本、绑定文本、多行文本场景：
     - 颜色行为保持与之前实现一致；
     - 未开启局部字体/字号时，渲染与编辑体验无差异。

## 风险与未知问题

- **TextStyleRange 的组合复杂度**：
  - 同时存在 color / fontSize / fontFamily 多种字段时，范围拆分与合并逻辑需谨慎，避免出现相同样式被误拆成多个小段。
- **渲染性能**：
  - 在每帧渲染中基于 TextStyleRange 做精细分段与 measureText 可能带来一定性能开销，尤其是长文本场景。
- **WYSIWYG 所见即所得的一致性**：
  - 若编辑视图暂时不能完美还原字号/字体差异，可能会与 canvas 渲染略有视觉差异，需要在 UI 上设置合理预期。
- **边缘交互场景**：
  - 在频繁插入 / 删除文字时，如何优雅地维护 TextStyleRange，避免样式“粘连”或意外扩散，需要在实现时定义清晰规则（如：当结构变化过大时，自动回退部分局部样式）。
