# 任务列表：Excalidraw 文本局部字体/字号编辑

## 当前任务
- [ ] 在模型层明确 TextStyleRange 用于字体/字号（约定使用 textStyleRanges 作为局部样式唯一来源，兼容 richTextRanges 仅用于颜色，必要时在代码中增加注释说明）
- [ ] 在 actionProperties.tsx 中实现 `applyFontSizeToRange` / `applyFontFamilyToRange` 帮助函数（范围拆分/合并逻辑，参考 applyColorToRichTextRange）
- [ ] 改造字号相关 action：有选区时更新 textStyleRanges.fontSize，无选区时保持整体修改行为
- [ ] 改造字体相关 action：有选区时更新 textStyleRanges.fontFamily，无选区时保持整体修改行为
- [ ] 在属性面板“字体大小”区域添加自定义字号输入框，并与现有 S/M/L/XL 按钮统一走同一套 action 流程
- [ ] 确保在属性面板中通过自定义字号输入框修改字号时，WYSIWYG 中的选区不会丢失（复用 textEditorSelection + restoreSelectionFromAppState 机制）
- [ ] 扩展 renderElement.ts，根据 TextStyleRange 的 fontSize/fontFamily 分段设置 context.font 并正确测量文本宽度
- [ ] 手动测试典型场景（单行、多行、绑定文本、多色 + 多字体/字号混排），验证：
      - 局部字体/字号应用正确
      - 自定义字号输入后选区保持
      - 退出编辑后画布渲染与预期一致

## 已完成任务
- [x] 撰写整体设计与计划文档（plan-excalidraw-text-font-style_20251208-210400.md）

## 备注
- 特别注意：
  - 自定义字号输入框的交互需要与当前颜色修改一致，即在样式更新后选区保持不变，便于用户连续调整多个属性。
  - 初期可不在 WYSIWYG 视图中完全还原不同字号/字体的视觉效果，但数据与画布渲染必须准确。
