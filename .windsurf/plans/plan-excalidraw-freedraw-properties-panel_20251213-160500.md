# 计划：excalidraw 画笔属性面板增强

## 任务背景

在 excalidraw 项目中，用户自定义的右侧属性面板（`DefaultSidebar.tsx` 的第 1 个标签 `PropertiesMenu`）存在以下问题：

1. **绘画时不显示属性**：当选中画笔（freedraw）工具在画布上绘画时，右侧属性面板显示"未选中元素"的空状态，无法实时修改画笔属性
2. **缺少精确控制**：描边宽度只有预设的三个按钮（细、粗、特粗），没有输入框可以精确设置数值

而 excalidraw 原生的左侧属性面板在画笔工具激活时能正常显示相关属性。

## 目标与非目标

### 目标
1. 当 freedraw 工具激活时，即使没有选中元素，右侧属性面板也显示画笔相关属性（笔触色、填充色、描边宽度、笔触形状）
2. 在"描边宽度"区域的三个按钮右侧添加一个数值输入框，可精确设置画笔粗细
3. 输入框样式参考"文字描边"中的 `NumberInput` 组件

### 非目标
- 不修改原生左侧属性面板的逻辑
- 不改变其他工具的属性面板行为

## 需求与场景

### 用户场景
1. 用户选择画笔工具后，在画布上绘画
2. 此时右侧属性面板应显示画笔的相关设置（笔触色、填充色、描边宽度、笔触形状）
3. 用户可以随时通过属性面板修改画笔属性，修改后继续绘画将使用新属性
4. 用户可以通过输入框精确设置描边宽度（如 2.5、5、10 等任意数值）

## 技术方案草案

### 涉及文件
- `packages/excalidraw/components/PropertiesMenu.tsx` - 主要修改文件

### 关键修改点

#### 1. 修改空状态判断逻辑（第 177-188 行）

**现有逻辑**：
```tsx
if (targetElements.length === 0) {
  return <空状态组件>;
}
```

**修改方案**：
```tsx
const isFreedrawToolActive = app.state.activeTool.type === "freedraw";

if (targetElements.length === 0 && !isFreedrawToolActive) {
  return <空状态组件>;
}
```

#### 2. 调整属性显示条件

需要修改以下变量的判断逻辑，使其在 freedraw 工具激活时也返回 true：
- `canEditStrokeColor` - 已支持（第 127-129 行）
- `canEditBackgroundColor` - 已支持（第 130-132 行）
- `canEditStrokeWidth` - 需要修改（第 133-135 行）

```tsx
const canEditStrokeWidth =
  app.state.activeTool.type === "freedraw" ||
  targetElements.some((el) => hasStrokeWidth(el.type));
```

#### 3. 添加描边宽度输入框

在"描边宽度"部分，参考"文字描边"的实现：
- 导入 `NumberInput` 组件
- 使用 `appState.currentItemStrokeWidth` 获取/设置值
- 调用 `actionManager.executeAction` 来更新值

```tsx
<div className="PropertiesMenu__inline-row">
  {actionManager.renderAction("changeStrokeWidth")}
  <NumberInput
    value={appState.currentItemStrokeWidth}
    min={1}
    max={100}
    step={1}
    onChange={(value) => {
      actionManager.executeAction(actionChangeStrokeWidth, "value", value);
    }}
  />
</div>
```

#### 4. 隐藏 freedraw 工具激活时不需要的属性

当只有 freedraw 工具激活（无选中元素）时，不显示以下内容：
- 图层操作
- 对齐操作
- 删除/复制等操作

## 验收标准

1. ✅ 选择画笔工具后，右侧属性面板显示画笔相关属性
2. ✅ 可以修改笔触色、填充色、描边宽度、笔触形状
3. ✅ 描边宽度右侧有输入框可精确设置数值
4. ✅ 输入框样式与"文字描边"中的输入框一致
5. ✅ 选中笔迹元素时，属性面板正常显示元素属性
6. ✅ 其他工具的行为不受影响

## 风险与未知问题

1. **样式适配**：需要确保 NumberInput 与现有按钮布局协调
2. **状态同步**：确保输入框值与按钮选中状态保持一致
3. **边界值**：需要确定描边宽度的合理范围（min/max）
