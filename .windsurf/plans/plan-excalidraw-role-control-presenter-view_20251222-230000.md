# 计划：Excalidraw 内核用 role 权限控制，学生端隐藏「演讲者视图」

## 任务背景

当前 `packages/excalidraw/components/footer/Footer.tsx` 在“演示模式”菜单中同时提供：

- `普通视图`（viewer）
- `演讲者视图`（presenter）

现有实现通过 `shareModePermissions.footer.presentation.allowedViews` 做过滤。

本次需求：**必须修改 Excalidraw 内核**，引入统一的 `role` 权限控制方式（类似你们在其它模块使用的 `role: 'teacher' | 'member'`），并在学生端隐藏「演讲者视图」。用户要求：**不要做兼容**（即不保留旧的控制入口作为主要方案），追求更干净、更统一的代码。

## 目标与非目标

### 目标

- 在 Excalidraw 内核引入 `role` 概念，用于 UI 权限控制。
- `role === 'member'`（学生端）：Footer 演示菜单只显示「普通视图」，不显示「演讲者视图」。
- `role === 'teacher'`（教师端）：Footer 演示菜单保留「演讲者视图」。
- 编译期强约束：调用 `<Excalidraw />` 的地方必须显式传入 `role`，避免隐式默认值导致逻辑分叉（符合“不做兼容”）。

### 非目标

- 不在本次扩展更多权限点（如 sidebar tabs、MainMenu 等），除非为实现 role 传递必须做最小配套。
- 不改动演示/分享模式其它逻辑（例如 `onPresent` 的实现）。
- 不新增测试页面。

## 需求与场景

- 学生端：点击演示按钮弹层，只出现「普通视图」。
- 教师端：弹层出现「普通视图」「演讲者视图」。

## 技术方案草案

### 1）类型层：引入 Role 类型，并让 ExcalidrawProps 强制要求 role

- 修改：`packages/excalidraw/types.ts`
  - 新增：`export type RoleType = 'teacher' | 'member'`
  - 在 `ExcalidrawProps` 中新增：`role: RoleType`（必填）

> 说明：这里选择必填，是为了满足“不要兼容”的诉求，迫使所有调用方显式传参。

### 2）上下文层：提供 RoleContext，避免层层透传

- 新增：`packages/excalidraw/context/role.ts`
  - `RoleContext = React.createContext<RoleType>('teacher')`（这里的默认值仅用于 context 初始化；实际运行通过 Provider 传入，调用侧必须传 role）。
  - `useRole()` hook。

- 修改：`packages/excalidraw/components/LayerUI.tsx`
  - 在现有 `ShareModeContext.Provider` 外层或内层增加 `RoleContext.Provider value={role}`
  - `LayerUIProps` 增加 `role: RoleType`

- 修改：`packages/excalidraw/components/App.tsx`（或 Excalidraw 入口）
  - 将 `this.props.role` 传给 `LayerUI`。

- 修改：`packages/excalidraw/index.tsx`（如果此处解构 ExcalidrawProps）
  - 确保 role 被传入 App。

### 3）Footer：用 role 过滤「演讲者视图」菜单项

- 修改：`packages/excalidraw/components/footer/Footer.tsx`
  - `const role = useRole();`
  - 构建菜单 items 时：
    - 若 `role === 'member'`，过滤掉 `viewType === 'presenter'`
  - 不再依赖 `allowedViews` 来做此处过滤（按“不要兼容/更统一”的要求），或将其降级为非关键配置（需要你确认：是否要彻底移除 allowedViews 逻辑）。

#### 关于“不要兼容”的两种落地强度（需要你在确认计划时拍板）

- **强硬版（更统一）**：Footer 完全移除 `.allowedViews` 过滤，只看 role。
- **温和版（仍统一，但保留能力）**：Footer 先按 role 限制，再叠加 allowedViews（role 为硬上限，allowedViews 为额外配置）。

你已明确“不要做兼容”，我倾向采用**强硬版**，但这会改变 share-mode 的行为预期，需要你确认。

### 4）全仓调用点更新（必做）

由于 `ExcalidrawProps.role` 变为必填：

- 需要全仓搜索 `<Excalidraw` 的使用点（包括 examples、app、packages），逐一补齐 `role`。
  - 应用/编辑端：教师端传 `role="teacher"`，学生端传 `role="member"`。
  - 其它非业务场景（如示例、测试）：统一传 `role="teacher"` 或按场景设定。

## 验收标准

- 学生端：Footer 演示弹层不展示「演讲者视图」。
- 教师端：仍展示「演讲者视图」。
- TypeScript 编译通过，且所有 `<Excalidraw />` 调用点都显式传入 `role`。

## 风险与未知问题

- **破坏性变更**：`ExcalidrawProps` 新增必填字段会影响所有使用者，必须一次性改完所有调用点。
- **share-mode 行为变更**：如果强硬版移除 `allowedViews`，分享模式下的配置能力会下降，需要确认不会影响现有功能。
- **上游同步成本**：该改动属于 fork 特性，未来合并上游变更时需处理冲突。
