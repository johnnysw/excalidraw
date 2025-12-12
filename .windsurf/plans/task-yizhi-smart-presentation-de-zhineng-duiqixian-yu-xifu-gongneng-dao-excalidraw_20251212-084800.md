# 任务列表：移植 smart-presentation 的智能对齐线与吸附功能到 Excalidraw

## 当前任务
- [ ] 1. 对比 smart-presentation 与当前仓库：确认需要移植/修改的文件清单、差异点与接入点（drag/resize/new/pointer/render/state/actions）
- [ ] 2. 移植 snapping 计算层：引入/对齐 `snapping.ts`（含 SnapCache、getVisibleGaps、point/gap/resize/new/pointer），修复类型并确保编译通过
- [ ] 3. 移植渲染层：引入/对齐 `renderSnaps.ts`，在渲染管线接入；确保 `snapLines` 可显示且在操作结束时清理
- [ ] 4. 接入拖拽选区吸附：pointermove 计算 `snapOffset/snapLines` → 传入 `dragSelectedElements` 应用（与 grid snapping 规则一致）
- [ ] 5. 接入 resize 吸附：在 resize 链路计算/应用 `snapOffset` 并渲染 `snapLines`
- [ ] 6. 接入新建元素吸附：在 drag new element 链路计算/应用 `snapOffset` 并渲染 `snapLines`
- [ ] 7. 接入 pointer 对齐线：非拖拽时计算并展示 pointer snap lines（按开关/快捷键逻辑）
- [ ] 8. UI/交互补齐：`objectsSnapModeEnabled` 开关入口、`Ctrl/Cmd` 临时反转逻辑、必要 i18n/hint 文案
- [ ] 9. 触觉/震动反馈（haptics）：实现状态机+节流，能力检测与降级（如 `navigator.vibrate`），提供开关并与吸附状态变化绑定
- [ ] 10. 测试与回归：手动用例清单；必要时用 Playwright 做最小交互验证（不启动新端口/不创建测试页）

## 已完成任务
- [x] 规划：创建并确认 plan 文件（包含 haptics 补充）

## 备注
- 以 smart-presentation 的实现为唯一真相来源，行为一致优先。
- 触觉/震动反馈在桌面触摸板上可能无法真实震动，要求实现为可选增强并优雅降级。
