# 计划：移植 smart-presentation 的智能对齐线与吸附功能到 Excalidraw

## 任务背景
- 目标是在当前 Excalidraw 仓库中，完整移植 `excalidraw-smart-presentation` fork 内的“智能对齐/吸附（smart snapping + guide lines）”能力。
- smart-presentation 侧的实现核心集中在三层：
  - 计算：`packages/excalidraw/snapping.ts`
  - 应用：`packages/element/src/dragElements.ts`
  - 渲染：`packages/excalidraw/renderer/renderSnaps.ts`

## 目标与非目标

### 目标
- 在本仓库实现与 smart-presentation **一致的**：
  - 对齐吸附（对象点吸附）：边/角/中心等对齐提示与吸附偏移
  - 间距/等距（gap）吸附提示与吸附
  - 指针（pointer）对齐线
  - 新建元素时吸附（drag new element）
  - Resize 时吸附（transform handle resize snapping）
- 实现与 smart-presentation **一致的交互开关**：
  - `objectsSnapModeEnabled` 总开关
  - `Ctrl/Cmd` 临时反转吸附逻辑（与 grid mode 组合规则保持一致）
- 增加适当的触觉/震动反馈（haptics）：
  - 吸附命中/切换吸附目标/解除吸附时，提供轻微反馈（支持降级）
  - 具备开关与节流/去抖，避免在 pointermove 中高频触发
- 代码结构尽量与上游 Excalidraw 风格一致，减少侵入性与后续合并冲突。

### 非目标
- 不引入新的“额外对齐类型/规则”（例如 Figma 式父容器层级推断、磁性对齐权重系统等），仅做 smart-presentation 的完整复制。
- 不新增独立的演示页/测试页。

## 需求与场景
- 拖动一个或多个元素时：
  - 靠近其他元素边/中心时显示对齐线并吸附
  - 识别可见元素间的 gap，显示等距提示线并吸附
- 新建元素（按工具拖拽创建矩形/椭圆/菱形/文本/图片/Frame 等）时：
  - 在放置点附近对齐参考点并吸附
- Resize 元素时：
  - 拖拽 resize handle 时对齐参考点并吸附
- Pointer 对齐：
  - 光标接近参考点时显示对齐提示线
- 触觉/震动反馈（haptics）：
  - 拖拽/resize/new element 过程中发生“吸附命中”时触发一次轻反馈
  - 吸附目标发生变化（例如从某条对齐线切换到另一条）时触发一次轻反馈
  - 从吸附状态回到非吸附状态时触发一次轻反馈
  - 需要保证不会在连续移动时高频触发（节流/状态机）

## 技术方案草案

### 设计原则
- 以 smart-presentation 的实现为“唯一真相来源”（行为一致优先于重新设计）。
- 以最小 diff 方式接入：新增/迁移文件 + 在现有拖拽/resize/new-element 链路插入调用。

### 数据结构与状态
- 在 `AppState`/`InteractiveCanvasAppState` 中确保存在（或新增）字段：
  - `snapLines: SnapLine[]`（渲染层读取）
  - `objectsSnapModeEnabled: boolean`（开关）
- snap 类型按 smart-presentation：
  - `PointSnap` / `GapSnap`；`SnapLine`：`points` / `gap` / `pointer`

### 计算层（snapping）
- 迁移/对齐以下能力与接口形态：
  - `getSnapDistance(zoom)`：阈值随缩放调整
  - `isSnappingEnabled(...)`：开关 + Ctrl/Cmd 临时反转 + 与 grid mode 组合
  - `getElementsCorners(...)`：单元素/多元素的对齐点集合（角/中点/中心）
  - `getVisibleGaps(...)`：可见元素间 gap 计算（带上限保护）
  - `snapDraggedElements(...)`：拖拽选区吸附 -> 返回 `{ snapOffset, snapLines }`
  - `snapResizingElements(...)`：resize 吸附 -> 返回 `{ snapOffset, snapLines }`
  - `snapNewElement(...)`：新建元素拖拽吸附 -> 返回 `{ snapOffset, snapLines }`
  - `getSnapLinesAtPointer(...)`：pointer 对齐线
  - `SnapCache`：缓存 reference snap points / visible gaps，降低 pointermove 计算成本

### 应用层（drag / resize / new element 链路）
- 在拖拽已选元素时：
  - 在 pointermove 中计算 `snapOffset`，并将其传入 element 层的 `dragSelectedElements(...)`
  - 保持 smart-presentation 的组合规则：
    - 对象吸附优先
    - 未吸附的轴再走 grid snapping
- 在 resize/new element 时：
  - 将 `snapOffset` 应用于元素变换的最终坐标（与上游现有逻辑兼容）

### 渲染层（对齐线/提示线）
- 迁移/对齐 `renderSnaps(context, appState)`：
  - 读取 `appState.snapLines`
  - 按 theme/zenMode/zoom 调整颜色与线宽
  - `points` 画线 + 十字，`gap` 画间距标识，`pointer` 画指针对齐线
- 生命周期：
  - 拖拽/resize 进行中更新 `snapLines`
  - 结束/取消操作时清空 `snapLines`

### 触觉/震动反馈（haptics）
- 触发时机（与 smart-presentation 吸附状态强绑定）：
  - 进入吸附：`snapOffset` 从 `{0,0}` 变为非零
  - 切换吸附：吸附“签名”变化（例如从 X 轴吸附切到 Y 轴吸附，或吸附线集合变化）
  - 退出吸附：`snapOffset` 从非零回到 `{0,0}`
- 触发策略：
  - 采用状态机（记录上一帧 snap 状态）+ 节流（例如 80~150ms 最小间隔）
  - 禁止在每次 pointermove 都触发；只在状态变化时触发
- 技术实现（按可用能力自动降级）：
  - 优先使用 Web 可用的震动能力（如 `navigator.vibrate`）进行轻反馈
  - 不支持时静默降级（不报错，不影响拖拽性能）
- 开关：
  - 增加独立开关（默认开启或与 `objectsSnapModeEnabled` 联动，待实现阶段定稿）

### UI/交互
- 确保 UI 能切换 `objectsSnapModeEnabled`（可复用现有菜单项/快捷键/设置项）。
- Ctrl/Cmd 临时反转吸附逻辑与 smart-presentation 对齐。

### 性能与稳定性
- 采用缓存与限制：
  - `SnapCache` 与 `VISIBLE_GAPS_LIMIT_PER_AXIS`
  - 仅在需要时更新 reference snap points / gaps
- 关注多选、frame 相关场景：
  - 避免 frame 与其子元素同时参与参考导致抖动

## 验收标准
- 与 smart-presentation 行为一致（至少包含以下可观察点）：
  - 拖拽时出现对齐线（points）并吸附
  - 可见 gap 的等距提示线（gap）出现并吸附
  - pointer 对齐线出现
  - resize/new element 的吸附有效
  - 主题/缩放/zen mode 下显示正常（线宽与颜色可见、不会异常闪烁）
  - `objectsSnapModeEnabled` 开关与 `Ctrl/Cmd` 临时反转逻辑一致
  - 吸附命中/切换/解除时触发一次轻反馈，不会在连续移动中高频触发
  - 不支持震动能力的环境下可正常使用（无报错、无明显性能回退）

## 风险与未知问题
- 本仓库当前 Excalidraw 版本与 smart-presentation 分叉点不同，可能存在：
  - state 字段命名/类型差异
  - 拖拽/resize 事件链路差异
  - renderer overlay 渲染顺序差异
- 大场景性能风险：gap 计算需要谨慎缓存与限制。
- 与 binding/arrow 的交互需要保持一致（smart-presentation 对 arrow 做了特殊禁用）。
- 触觉/震动反馈能力在不同平台差异较大：
  - 桌面触摸板未必支持“震动”，多数情况下只能做弱提示或直接降级
  - 需要确保实现为“可选增强”，不可影响核心拖拽体验
