# 任务列表：素材库按用户身份区分

## 当前任务

- [x] 数据库修改：excalidraw_user_library 表添加 owner_type 字段和注释
- [x] 后端修改：shanganla-admin-backend 素材库 API 支持 owner_type
- [x] 后端修改：shanganla-client-backend 素材库 API 支持 owner_type
- [x] 前端修改：创建 LibraryAPIAdapter 替换 IndexedDB 存储
- [x] 前端修改：App.tsx 集成 LibraryAPIAdapter

## 已完成任务

- [x] 数据库修改：excalidraw_user_library 表添加 owner_type 字段和注释（2025-12-21）
- [x] 后端修改：shanganla-admin-backend Model/Service/Controller（2025-12-21）
- [x] 后端修改：shanganla-client-backend Model/Service/Controller/Router（2025-12-21）
- [x] 前端修改：创建 LibraryAPIAdapter（2025-12-21）
- [x] 前端修改：App.tsx 使用 LibraryAPIAdapter，IndexedDB 作为迁移源（2025-12-21）

## 备注

- owner_type 取值：`teacher`（教师）、`member`（学员）
- 教师 owner_id 对应 users 表 ID
- 学员 owner_id 对应 members 表 ID
- admin-backend 固定 ownerType='teacher'
- client-backend 固定 ownerType='member'
- 前端通过不同后端服务自动区分身份，无需传递 ownerType 参数
