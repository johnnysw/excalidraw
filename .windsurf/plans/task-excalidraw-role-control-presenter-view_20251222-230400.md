# 任务列表：Excalidraw 内核用 role 权限控制（强硬版）

## 当前任务

- [ ] **类型层**：`types.ts` 新增 `RoleType = 'teacher' | 'member'`，`ExcalidrawProps` 增加 `role: RoleType`（必填）
- [ ] **上下文层**：新建 `context/role.ts`（`RoleContext` + `useRole` hook）
- [ ] **LayerUI**：`LayerUIProps` 增加 `role`，注入 `RoleContext.Provider`
- [ ] **App / index.tsx**：将 `props.role` 传给 `LayerUI`
- [ ] **Footer（强硬版）**：移除 `allowedViews` 过滤逻辑，改为 `useRole()` 判断 `role === 'member'` 过滤掉 presenter
- [ ] **全仓调用点**：给所有 `<Excalidraw>` 补上 `role` prop（examples、excalidraw-app 等）
- [ ] **验证**：TypeScript 编译通过；学生端不显示「演讲者视图」，教师端显示

## 已完成任务

- [x] 制定并确认 plan 文件（选定强硬版：移除 allowedViews）

## 备注

- 强硬版：Footer 完全移除 `.allowedViews` 过滤，只用 role 判断是否显示 presenter。
- `ExcalidrawProps.role` 为必填，所有调用点必须显式传参。
