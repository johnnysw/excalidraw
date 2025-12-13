# 任务列表：excalidraw 画笔属性面板增强

## 当前任务

- [ ] 测试验证功能

## 已完成任务

- [x] 修改 PropertiesMenu.tsx 空状态判断逻辑，freedraw 工具激活时显示属性面板
- [x] 调整 canEditStrokeWidth 判断条件
- [x] 在描边宽度区域添加 NumberInput 输入框
- [x] 调整样式使输入框与按钮协调显示
- [x] 修复透明度和图层在 freedraw 工具激活时不显示的问题
- [x] 在描边宽度中添加 0.5 和 3 两个按钮选项

## 备注

- 参考文件：`actionProperties.tsx` 中 `changeTextOutlineWidth` 的实现
- NumberInput 组件位置：`components/NumberInput.tsx`
- 需要导入：`NumberInput`、`actionChangeStrokeWidth`
