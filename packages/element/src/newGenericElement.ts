import {
  DEFAULT_ELEMENT_PROPS,
  randomId,
  randomInteger,
  getUpdatedTimestamp,
} from "@excalidraw/common";
import type { MarkOptional, Merge } from "@excalidraw/common/utility-types";
import type { Radians } from "@excalidraw/math";
import type {
  ExcalidrawElement,
  ExcalidrawGenericElement,
  NonDeleted,
} from "./types";

export type ElementConstructorOpts = MarkOptional<
  Omit<ExcalidrawGenericElement, "id" | "type" | "isDeleted" | "updated">,
  | "width"
  | "height"
  | "angle"
  | "groupIds"
  | "frameId"
  | "index"
  | "boundElements"
  | "seed"
  | "version"
  | "versionNonce"
  | "link"
  | "strokeStyle"
  | "fillStyle"
  | "strokeColor"
  | "backgroundColor"
  | "roughness"
  | "strokeWidth"
  | "roundness"
  | "locked"
  | "opacity"
  | "customData"
>;

export const newElementBase = <T extends ExcalidrawElement>(
  type: T["type"],
  {
    x,
    y,
    strokeColor = DEFAULT_ELEMENT_PROPS.strokeColor,
    backgroundColor = DEFAULT_ELEMENT_PROPS.backgroundColor,
    fillStyle = DEFAULT_ELEMENT_PROPS.fillStyle,
    strokeWidth = DEFAULT_ELEMENT_PROPS.strokeWidth,
    strokeStyle = DEFAULT_ELEMENT_PROPS.strokeStyle,
    roughness = DEFAULT_ELEMENT_PROPS.roughness,
    opacity = DEFAULT_ELEMENT_PROPS.opacity,
    width = 0,
    height = 0,
    angle = 0 as Radians,
    groupIds = [],
    frameId = null,
    index = null,
    roundness = null,
    boundElements = null,
    link = null,
    locked = DEFAULT_ELEMENT_PROPS.locked,
    ...rest
  }: ElementConstructorOpts & Omit<Partial<ExcalidrawGenericElement>, "type">,
) => {
  // NOTE (mtolmacs): This is a temporary check to detect extremely large
  // element position or sizing
  if (
    x < -1e6 ||
    x > 1e6 ||
    y < -1e6 ||
    y > 1e6 ||
    width < -1e6 ||
    width > 1e6 ||
    height < -1e6 ||
    height > 1e6
  ) {
    console.error("New element size or position is too large", {
      x,
      y,
      width,
      height,
      // @ts-ignore
      points: rest.points,
    });
  }

  // assign type to guard against excess properties
  const element: Merge<ExcalidrawGenericElement, { type: T["type"] }> = {
    id: rest.id || randomId(),
    type,
    x,
    y,
    width,
    height,
    angle,
    strokeColor,
    backgroundColor,
    fillStyle,
    strokeWidth,
    strokeStyle,
    roughness,
    opacity,
    groupIds,
    frameId,
    index,
    roundness,
    seed: rest.seed ?? randomInteger(),
    version: rest.version || 1,
    versionNonce: rest.versionNonce ?? 0,
    isDeleted: false as false,
    boundElements,
    updated: getUpdatedTimestamp(),
    link,
    locked,
    customData: rest.customData,
  };
  return element;
};

export const newElement = (
  opts: {
    type: ExcalidrawGenericElement["type"];
  } & ElementConstructorOpts,
): NonDeleted<ExcalidrawGenericElement> =>
  newElementBase<ExcalidrawGenericElement>(opts.type, opts);
