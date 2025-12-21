# 计划：素材库按用户身份区分

## 任务背景

当前 Excalidraw 素材库（`excalidraw_user_library` 表）仅使用 `user_id` 字段标识用户，无法区分老师和学生身份。而 `coursewares` 表已采用 `owner_type` + `owner_id` 的设计模式来区分不同身份的所有者。

**现有表结构对比：**

| 字段 | coursewares | excalidraw_user_library |
|------|-------------|-------------------------|
| 身份类型 | `owner_type` varchar(20) 默认 'teacher' | ❌ 无 |
| 用户 ID | `owner_id` bigint | `user_id` bigint unsigned |

## 目标与非目标

### 目标
1. 修改 `excalidraw_user_library` 表结构，增加 `owner_type` 字段
2. 后端 API 支持根据用户身份（老师/学生）加载对应的素材库
3. 前端素材库组件适配新的身份区分逻辑

### 非目标（本次不做）
- 素材库跨身份共享功能
- 管理员统一管理所有素材库的后台功能
- 素材库权限细粒度控制

## 需求与场景

### 用户场景
1. **老师登录**：加载老师身份的素材库，添加的素材归属于老师
2. **学生登录**：加载学生身份的素材库，添加的素材归属于学生
3. **同一用户切换身份**：切换后加载对应身份的素材库（如系统支持身份切换）

### 关键接口
- `GET /api/excalidraw/library` - 获取素材库（需传递 owner_type）
- `POST /api/excalidraw/library` - 保存素材库（需传递 owner_type）

## 技术方案草案

### 1. 数据库修改

```sql
-- 添加 owner_type 字段
ALTER TABLE excalidraw_user_library
ADD COLUMN owner_type VARCHAR(20) NOT NULL DEFAULT 'teacher' AFTER user_id;

-- 重命名 user_id 为 owner_id（可选，保持与 coursewares 一致）
ALTER TABLE excalidraw_user_library
CHANGE COLUMN user_id owner_id BIGINT UNSIGNED NOT NULL;

-- 修改唯一索引
ALTER TABLE excalidraw_user_library
DROP INDEX user_id,
ADD UNIQUE INDEX uk_owner (owner_type, owner_id);
```

### 2. 后端修改（shanganla-client-backend / shanganla-admin-backend）

- 修改 `excalidraw_user_library` 的 Model 定义
- 修改素材库 Controller/Service，支持 `owner_type` 参数
- 从登录态自动识别用户身份类型

### 3. 前端修改（excalidraw）

- 修改 `LibraryMenu` 组件，传递用户身份信息
- 修改素材库 API 调用，携带 `owner_type` 参数
- 相关文件：
  - `packages/excalidraw/components/LibraryMenu.tsx`
  - `packages/excalidraw/data/library.ts`
  - API 调用相关文件

## 验收标准

1. **数据库**：`excalidraw_user_library` 表包含 `owner_type` 字段，唯一索引为 (owner_type, owner_id)
2. **后端 API**：素材库接口正确识别并处理 owner_type
3. **前端功能**：
   - 老师登录后，素材库只显示老师的素材
   - 学生登录后，素材库只显示学生的素材
   - 添加素材时正确归属到对应身份

## 风险与未知问题

1. **数据迁移**：现有 `excalidraw_user_library` 数据需要确定默认 `owner_type` 值
2. **身份识别**：需确认后端如何判断当前用户是老师还是学生（从 token/session 中获取？）
3. **跨仓库协调**：涉及 excalidraw 前端 + 后端两个仓库，需协调修改

---

## 迭代总结（2025-12-21）

### 已完成修改

#### 1. 数据库
- 执行 SQL 脚本添加 `owner_type` 字段注释

#### 2. 后端 - shanganla-admin-backend（教师端）
- `app/model/excalidraw_user_library.js` - 更新 Model，添加 ownerType/ownerId 字段
- `app/service/excalidraw_library.js` - 更新 Service，支持按 ownerType+ownerId 查询
- `app/controller/excalidraw_library.js` - 更新 Controller，固定 ownerType='teacher'

#### 3. 后端 - shanganla-client-backend（学员端）
- `app/model/excalidraw_user_library.js` - 新建 Model
- `app/service/excalidraw_library.js` - 新建 Service
- `app/controller/excalidraw_library.js` - 新建 Controller，固定 ownerType='member'
- `app/router/excalidraw_library.js` - 新建 Router
- `app/router.js` - 注册路由

#### 4. 前端 - excalidraw
- `excalidraw-app/data/LibraryAPIAdapter.ts` - 新建 API adapter
- `excalidraw-app/data/LocalData.ts` - 为 IndexedDB adapter 添加 clear 方法
- `excalidraw-app/App.tsx` - 使用 LibraryAPIAdapter，IndexedDB 作为迁移源

### 设计决策
- 前端通过不同后端服务（admin-backend/client-backend）自动区分身份
- 无需前端传递 ownerType 参数，由后端根据服务类型自动确定
- 旧的 IndexedDB 数据会自动迁移到后端存储
