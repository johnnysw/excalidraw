import clsx from "clsx";

import { KEYS } from "@excalidraw/common";

import { t } from "../i18n";

import { ToolButton } from "./ToolButton";
import { useAppProps } from "./App";
import { getToolNumericKey } from "./shapes";
import { handIcon } from "./icons";

import "./ToolIcon.scss";

type LockIconProps = {
  title?: string;
  name?: string;
  checked: boolean;
  onChange?(): void;
  isMobile?: boolean;
  showNativeTooltip?: boolean;
};

export const HandButton = (props: LockIconProps) => {
  const { UIOptions } = useAppProps();
  const numericKey = getToolNumericKey("hand", UIOptions.toolbarLayout);
  const shortcut = numericKey
    ? `${KEYS.H} ${t("helpDialog.or")} ${numericKey}`
    : KEYS.H;
  return (
    <ToolButton
      className={clsx("Shape", { fillable: false, active: props.checked })}
      type="radio"
      icon={handIcon}
      name="editor-current-shape"
      checked={props.checked}
      title={
        props.showNativeTooltip === false
          ? undefined
          : `${props.title} — ${shortcut}`
      }
      keyBindingLabel={!props.isMobile ? numericKey || KEYS.H : undefined}
      aria-label={`${props.title} — ${numericKey || KEYS.H}`}
      aria-keyshortcuts={numericKey || KEYS.H}
      data-testid={`toolbar-hand`}
      onChange={() => props.onChange?.()}
    />
  );
};
