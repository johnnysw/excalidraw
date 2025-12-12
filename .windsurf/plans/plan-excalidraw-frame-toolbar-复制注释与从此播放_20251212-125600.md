# 计划：excalidraw-frame-toolbar-复制注释与从此播放

## 任务背景
- 在 excalidraw 的演示/幻灯片（frames）能力中，侧边栏（DefaultSidebar）提供了每个 slide 卡片的“注释”和“从此播放”入口。
- 目前画布上选中 frame 元素时缺少就地（in-canvas）的快捷入口，导致操作路径较长。
- 目标是参照 teaching-system 的 CanvasEditor 里 `QuestionNodeToolbar.tsx` 的交互方式：选中节点后在画布上就地浮出 toolbar。

## 目标与非目标
### 目标
- 选中某个 frame 元素时，在画布上就地浮出一个 toolbar。
- toolbar 提供 2 个按钮：
  - 注释：打开/聚焦该 frame 对应 slide 的 notes/备注编辑（语义与 DefaultSidebar 幻灯片卡片上的“注释”一致）。
  - 从此播放：以该 frame 对应 slide 作为起点进入演示/播放模式（语义与 DefaultSidebar 幻灯片卡片上的“从此播放”一致）。
- 复用/复制 DefaultSidebar 现有实现逻辑，避免引入新的业务分叉。

### 非目标
- 不在本次改动中重做/重设计幻灯片系统的数据结构或播放逻辑。
- 不新增独立的测试页面，不启动/停止任何本地端口服务。
- 不做跨仓库（teaching-system）功能集成，仅作为交互参考。

## 需求与场景
- 用户在画布上点击选中某个 frame（单选）。
- 在 frame 附近出现 toolbar（类似节点贴边浮动工具条）。
- 点击“注释”后：侧边栏/相关面板切换到该 slide 的备注编辑，并聚焦输入（若存在）。
- 点击“从此播放”后：进入演示/播放，从当前 frame/slide 开始。

## 技术方案草案
- 代码位置（预期）：
  - 参考实现：`teaching-system/web/src/components/editors/CanvasEditor/QuestionNodeToolbar.tsx`
  - 现有入口：`excalidraw/packages/excalidraw/components/DefaultSidebar.tsx`（幻灯片标签页、slide 卡片按钮）
  - 新增/接入位置（待调研）：excalidraw 画布选中 frame 元素时的 UI 层（可能在 canvas / selection / overlay 相关组件内）。

- 方案要点：
  - 通过选中元素判断是否为 frame 元素（`type === "frame"`）。
  - 计算 toolbar 位置：基于 frame 的 bounds（scene coords）转换到 viewport coords，再加偏移。
  - 复制 DefaultSidebar 中“注释/从此播放”的 action/handler（包括需要的上下文：appState、setAppState、openSidebar/面板控制、presentation 启动等）。
  - 尽量抽成可复用的函数/调用同一个 action，而不是复制大段 UI。

## 验收标准
- 选中 frame 时 toolbar 可见；取消选中/选中非 frame 时不显示。
- “注释”行为与 DefaultSidebar 上的同按钮一致（打开相同的 notes 编辑入口，且能定位到当前 frame）。
- “从此播放”行为与 DefaultSidebar 上的同按钮一致（从当前 frame 开始播放）。
- 不影响原有 DefaultSidebar 的功能。
- 基本交互回归：能正常编辑、切换 frame、进入/退出播放。

## 风险与未知问题
- DefaultSidebar 的按钮可能依赖其内部组件状态/上下文，复制时需要找到最小依赖集。
- 画布内 overlay/toolbar 的渲染层级与事件穿透可能需要处理（避免遮挡或误触）。
- “打开/聚焦 notes 编辑”可能涉及 sidebar 的打开状态与 focus 时机，需要确认现有 API。
