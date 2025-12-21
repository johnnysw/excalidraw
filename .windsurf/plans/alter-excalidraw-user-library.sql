-- 素材库表字段注释修改脚本
-- 表已有 owner_type 和 owner_id 字段，仅更新注释

-- 1. 修改 owner_type 字段注释
ALTER TABLE excalidraw_user_library
MODIFY COLUMN owner_type VARCHAR(20) NOT NULL DEFAULT 'teacher' COMMENT '所有者类型：teacher-教师, member-学员';

-- 2. 修改 owner_id 字段注释
ALTER TABLE excalidraw_user_library
MODIFY COLUMN owner_id BIGINT UNSIGNED NOT NULL COMMENT '所有者ID：教师对应users表ID, 学员对应members表ID';

-- 3. 修改 library_data 字段注释
ALTER TABLE excalidraw_user_library
MODIFY COLUMN library_data JSON NOT NULL COMMENT '素材库数据(JSON格式)';
