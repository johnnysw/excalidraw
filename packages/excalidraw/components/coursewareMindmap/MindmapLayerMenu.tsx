import React from "react";
import { isDarwin } from "@excalidraw/common";
import {
  actionBringToFront,
  actionBringForward,
  actionSendBackward,
  actionSendToBack,
} from "../../actions";
import type { CoursewareMindmapController } from "../../coursewareMindmap/controller";
import { MindmapMenuList, MindmapMenuItem } from "./MindmapMenuItems";

export const MindmapLayerMenu = ({
  controller,
  close,
}: {
  controller: CoursewareMindmapController;
  close: () => void;
}) => {
  const edgeShortcut = (key: string) =>
    `CtrlOrCmd+${isDarwin ? "Alt" : "Shift"}+${key}`;
  const items = [
    {
      label: "置于顶层",
      icon: "lucide:bring-to-front",
      shortcut: edgeShortcut("]"),
      action: actionBringToFront,
    },
    {
      label: "上移一层",
      icon: "lucide:arrow-up-to-line",
      shortcut: "CtrlOrCmd+]",
      action: actionBringForward,
    },
    {
      label: "下移一层",
      icon: "lucide:arrow-down-to-line",
      shortcut: "CtrlOrCmd+[",
      action: actionSendBackward,
    },
    {
      label: "置于底层",
      icon: "lucide:send-to-back",
      shortcut: edgeShortcut("["),
      action: actionSendToBack,
    },
  ];
  return (
    <MindmapMenuList label="整图层级">
      {items.map(({ action, ...item }) => (
        <MindmapMenuItem
          key={item.label}
          {...item}
          run={() => {
            close();
            void controller.wholeAction(action);
          }}
        />
      ))}
    </MindmapMenuList>
  );
};
