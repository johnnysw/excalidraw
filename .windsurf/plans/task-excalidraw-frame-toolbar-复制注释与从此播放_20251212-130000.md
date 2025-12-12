# 任务列表：excalidraw-frame-toolbar-复制注释与从此播放

## 当前任务
- [ ] 在 excalidraw 画布中实现 Frame 选中态浮动 toolbar（位置/交互/样式对齐）
- [ ] 接入 toolbar 的“注释/从此播放”能力并做回归验证（Playwright，不启动服务）

## 已完成任务
- [x] 创建并确认 plan 文件（excalidraw frame toolbar：复制注释与从此播放）
- [x] 创建 task 文件并与 todo_list 同步
- [x] 调研 DefaultSidebar 幻灯片卡片上“注释/从此播放”的实现入口并抽取可复用逻辑
- [x] 复制“注释”按钮的有无注释指示器到画布 toolbar

## 备注
- 本文件与 Cascade 的 todo_list 保持同步：任务新增/完成时，两边同时更新。
- 不启动/停止任何本地服务或端口；前端回归使用 Playwright 直接在已启动的页面上验证。
