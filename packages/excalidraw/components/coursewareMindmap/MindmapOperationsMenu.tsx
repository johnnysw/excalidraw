import React, { useState } from "react";
import {
  actionCopyAsPng,
  actionDuplicateSelection,
  actionFlipHorizontal,
  actionFlipVertical,
  actionToggleElementLock,
} from "../../actions";
import type { CoursewareMindmapController } from "../../coursewareMindmap/controller";
import {
  MindmapMenuItem,
  MindmapMenuList,
  MindmapMenuSeparator,
  MindmapMenuSubmenu,
} from "./MindmapMenuItems";
import type { MindmapMenuItemProps } from "./MindmapMenuItems";
import { MindmapNodeSettings } from "./MindmapNodeSettings";
import { MindmapLayerMenu } from "./MindmapLayerMenu";

export const MindmapOperationsMenu = ({
  controller,
  close,
}: {
  controller: CoursewareMindmapController;
  close: () => void;
}) => {
  const [submenu, setSubmenu] = useState<string | null>(null);
  const { node, model } = controller;
  if (!node || !model || !controller.element || !controller.editable)
    return null;
  const root = node.id === model.rootId;
  const whole = (action: Parameters<typeof controller.wholeAction>[0]) => {
    void controller.wholeAction(action);
  };
  const item = (props: MindmapMenuItemProps) => (
    <MindmapMenuItem
      key={props.label}
      {...props}
      run={() => {
        close();
        props.run();
      }}
    />
  );
  return (
    <MindmapMenuList label="脑图操作菜单">
      {item({
        label: "编辑主题",
        icon: "lucide:pencil",
        shortcut: "F2",
        run: () => controller.startEditing(),
      })}
      {!root &&
        item({
          label: "新增同级主题",
          icon: "lucide:list-plus",
          shortcut: "Enter",
          run: () => controller.add("sibling"),
        })}
      {item({
        label: "新增子主题",
        icon: "lucide:corner-down-right",
        shortcut: "Tab",
        run: () => controller.add("child"),
      })}
      {!root &&
        item({
          label: "新增父主题",
          icon: "lucide:corner-up-left",
          shortcut: "Shift+Tab",
          run: () => controller.add("parent"),
        })}
      {Object.values(model.nodes).some((entry) => entry.parentId === node.id) &&
        item({
          label: node.collapsed ? "展开分支" : "折叠分支",
          icon: node.collapsed ? "lucide:expand" : "lucide:shrink",
          shortcut: "CtrlOrCmd+.",
          run: () => controller.toggleCollapse(),
        })}
      <MindmapMenuSeparator />
      {item({
        label: root ? "复制导图" : "复制分支",
        icon: "lucide:copy",
        shortcut: "CtrlOrCmd+C",
        run: () => {
          controller.clipboard.copy();
        },
      })}
      {item({
        label: root ? "剪切导图" : "剪切分支",
        icon: "lucide:scissors",
        shortcut: "CtrlOrCmd+X",
        run: () => {
          controller.clipboard.copy(undefined, true);
        },
      })}
      {item({
        label: root ? "复制整图为图片" : "复制分支为图片",
        icon: "lucide:image",
        shortcut: "CtrlOrCmd+Shift+C",
        run: () => {
          if (root) whole(actionCopyAsPng);
          else void controller.clipboard.copyAsImage();
        },
      })}
      {item({
        label: "粘贴",
        icon: "lucide:clipboard-paste",
        shortcut: "CtrlOrCmd+V",
        run: () => {
          void controller.clipboard.pasteFromMenu();
        },
      })}
      {!root &&
        item({
          label: "粘为同级",
          icon: "lucide:clipboard-paste",
          run: () => {
            void controller.clipboard.pasteFromMenu("sibling");
          },
        })}
      {item({
        label: root ? "创建整图副本" : "创建分支副本",
        icon: "lucide:copy-plus",
        shortcut: "CtrlOrCmd+D",
        run: () => {
          if (root) whole(actionDuplicateSelection);
          else controller.clipboard.duplicateBranch();
        },
      })}
      <MindmapMenuSeparator />
      <MindmapMenuSubmenu
        label="层级"
        icon="lucide:layers-3"
        open={submenu === "layers"}
        onOpenChange={(open) =>
          setSubmenu((current) =>
            open ? "layers" : current === "layers" ? null : current,
          )
        }
      >
        <MindmapLayerMenu controller={controller} close={close} />
      </MindmapMenuSubmenu>
      <MindmapMenuSeparator />
      {item({
        label: "复制节点样式",
        icon: "lucide:paintbrush",
        shortcut: "CtrlOrCmd+Alt+C",
        run: () => controller.clipboard.copyStyle(),
      })}
      {item({
        label: "粘贴节点样式",
        icon: "lucide:paint-bucket",
        shortcut: "CtrlOrCmd+Alt+V",
        disabled: !controller.clipboard.canPasteStyle,
        run: () => controller.clipboard.pasteStyle(),
      })}
      <MindmapMenuSubmenu
        label="节点设置"
        icon="lucide:settings-2"
        open={submenu === "settings"}
        onOpenChange={(open) =>
          setSubmenu((current) =>
            open ? "settings" : current === "settings" ? null : current,
          )
        }
      >
        <MindmapNodeSettings controller={controller} close={close} />
      </MindmapMenuSubmenu>
      <MindmapMenuSeparator />
      {item({
        label: "导图搜索",
        icon: "lucide:search",
        shortcut: "CtrlOrCmd+F",
        run: () => controller.notify({ searchOpen: true }),
      })}
      {item({
        label: "大纲编辑",
        icon: "lucide:list-tree",
        run: () => controller.notify({ workspacePanel: "outline" }),
      })}
      {item({
        label: "概要、外框和关联线",
        icon: "lucide:braces",
        run: () => controller.notify({ workspacePanel: "objects" }),
      })}
      {item({
        label: "导图主题",
        icon: "lucide:palette",
        run: () => controller.notify({ workspacePanel: "theme" }),
      })}
      {!root &&
        item({
          label: "手动调整分支位置",
          icon: "lucide:move",
          run: () => controller.notify({ workspacePanel: "content" }),
        })}
      {item({
        label: "主题内容与位置",
        icon: "lucide:settings-2",
        run: () => controller.notify({ workspacePanel: "content" }),
      })}
      {item({
        label: "导入与导出",
        icon: "lucide:file-input",
        run: () => controller.notify({ workspacePanel: "exchange" }),
      })}
      {item({
        label: controller.getSnapshot().multiSelectMode
          ? "结束节点多选"
          : "多选节点",
        icon: "lucide:mouse-pointer-2",
        run: () =>
          controller.notify({
            multiSelectMode: !controller.getSnapshot().multiSelectMode,
          }),
      })}
      {item({
        label: "聚焦当前分支",
        icon: "lucide:focus",
        run: () => controller.focusBranch(),
      })}
      {item({
        label: "选择当前分支",
        icon: "lucide:git-branch",
        run: () => controller.selectBranch(),
      })}
      {item({
        label: "选择全部节点",
        icon: "lucide:square-dashed",
        run: () => controller.selectBranch(true),
      })}
      {item({
        label: "小地图",
        icon: "lucide:map",
        run: () =>
          controller.notify({
            minimapOpen: !controller.getSnapshot().minimapOpen,
          }),
      })}
      {item({
        label: "选择整图",
        icon: "lucide:scan",
        run: () => controller.selectWhole(),
      })}
      {!root &&
        item({
          label: "复制整图为图片",
          icon: "lucide:image",
          run: () => whole(actionCopyAsPng),
        })}
      {!root &&
        item({
          label: "创建整图副本",
          icon: "lucide:copy-plus",
          run: () => whole(actionDuplicateSelection),
        })}
      {item({
        label: "水平翻转整图",
        icon: "lucide:flip-horizontal",
        run: () => whole(actionFlipHorizontal),
      })}
      {item({
        label: "垂直翻转整图",
        icon: "lucide:flip-vertical",
        run: () => whole(actionFlipVertical),
      })}
      {item({
        label: "锁定整图",
        icon: "lucide:lock",
        shortcut: "CtrlOrCmd+Alt+L",
        run: () => whole(actionToggleElementLock),
      })}
      <MindmapMenuSeparator />
      {item({
        label: root ? "删除整图" : "删除分支",
        icon: "lucide:trash-2",
        shortcut: "Delete",
        danger: true,
        run: () => controller.remove(),
      })}
    </MindmapMenuList>
  );
};
