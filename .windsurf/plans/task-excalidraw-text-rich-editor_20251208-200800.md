# 任务列表：Excalidraw 文本富文本编辑器

## 当前任务
- [ ] 搭建 TextStyleRange 模型并与现有 richTextRanges 保持兼容（仅定义类型与字段，不立刻大规模迁移）
- [ ] 将 textWysiwyg 从 textarea 改造为 contenteditable，保持原有定位 / 缩放 / 绑定逻辑
- [ ] 基于 originalText + richTextRanges 在 contenteditable 内渲染多色文本（按段拆分为 span 并设置颜色）
- [ ] 实现编辑视图选区 ↔ 文本字符索引的双向映射，并写入 AppState.textEditorSelection
- [ ] 确保 onChange / onSubmit 流程与原有行为兼容，文本内容与画布渲染稳定同步
- [ ] 覆盖普通文本、绑定文本、自动换行等典型场景的手动测试，并修复明显回归问题

## 已完成任务
- [x] 撰写整体设计与计划文档（plan-excalidraw-text-rich-editor_20251208-200500.md）

## 备注
- 本轮聚焦于“编辑视图多色 + 选中文字不变黑”，局部字体/字号仅预留数据与选区能力，后续单独迭代。
- 不改动对外 JSON/schema 的兼容性，所有改动限定在 exalidraw 内部实现层。
