import { KEYS } from "@excalidraw/common";

import {
  SelectionIcon,
  RectangleIcon,
  DiamondIcon,
  EllipseIcon,
  ArrowIcon,
  LineIcon,
  FreedrawIcon,
  TextIcon,
  RichTextIcon,
  ImageIcon,
  EraserIcon,
} from "./icons";

import type { AppClassProperties, ToolType, UIOptions } from "../types";

export const SHAPES = [
  {
    icon: SelectionIcon,
    value: "selection",
    key: KEYS.V,
    numericKey: KEYS["1"],
    fillable: true,
  },
  {
    icon: RectangleIcon,
    value: "rectangle",
    key: KEYS.R,
    numericKey: KEYS["6"],
    fillable: true,
  },
  {
    icon: DiamondIcon,
    value: "diamond",
    key: KEYS.D,
    numericKey: KEYS["7"],
    fillable: true,
  },
  {
    icon: EllipseIcon,
    value: "ellipse",
    key: KEYS.O,
    numericKey: KEYS["8"],
    fillable: true,
  },
  {
    icon: ArrowIcon,
    value: "arrow",
    key: KEYS.A,
    numericKey: KEYS["9"],
    fillable: true,
  },
  {
    icon: LineIcon,
    value: "line",
    key: KEYS.L,
    numericKey: KEYS["0"],
    fillable: true,
  },
  {
    icon: FreedrawIcon,
    value: "freedraw",
    key: [KEYS.P, KEYS.X],
    numericKey: KEYS["3"],
    fillable: false,
  },
  {
    icon: TextIcon,
    value: "text",
    key: KEYS.T,
    numericKey: KEYS["5"],
    fillable: false,
  },
  {
    icon: ImageIcon,
    value: "image",
    key: null,
    numericKey: null,
    fillable: false,
  },
  {
    icon: EraserIcon,
    value: "eraser",
    key: KEYS.E,
    numericKey: KEYS["4"],
    fillable: false,
  },
  {
    icon: RichTextIcon,
    value: "richText",
    key: null,
    numericKey: null,
    fillable: false,
  },
] as const;

export const getToolNumericKey = (
  tool: ToolType,
  toolbarLayout?: UIOptions["toolbarLayout"],
): string | null => {
  if (toolbarLayout === "left") {
    if (tool === "selection" || tool === "lasso") {
      return KEYS["1"];
    }
    if (tool === "freedraw") {
      return KEYS["2"];
    }
    if (tool === "eraser") {
      return KEYS["3"];
    }
    return null;
  }

  if (tool === "hand") {
    return KEYS["2"];
  }
  if (tool === "lasso") {
    return KEYS["1"];
  }
  return SHAPES.find((shape) => shape.value === tool)?.numericKey ?? null;
};

export const getToolbarTools = (app: AppClassProperties) => {
  const tools = app.state.preferredSelectionTool.type === "lasso"
    ? ([
        {
          value: "lasso",
          icon: SelectionIcon,
          key: KEYS.V,
          numericKey: KEYS["1"],
          fillable: true,
        },
        ...SHAPES.slice(1),
      ] as const)
    : SHAPES;

  return tools.map((tool) => ({
    ...tool,
    numericKey: getToolNumericKey(tool.value, app.props.UIOptions.toolbarLayout),
  }));
};

export const findShapeByKey = (key: string, app: AppClassProperties) => {
  const shape = getToolbarTools(app).find((shape) => {
    return (
      (shape.numericKey != null && key === shape.numericKey.toString()) ||
      (shape.key &&
        (typeof shape.key === "string"
          ? shape.key === key
          : (shape.key as readonly string[]).includes(key)))
    );
  });
  return shape?.value || null;
};
