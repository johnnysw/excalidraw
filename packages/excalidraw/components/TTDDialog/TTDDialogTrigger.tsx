import { trackEvent } from "../../analytics";
import { useTunnels } from "../../context/tunnels";
import { useI18n } from "../../i18n";
import {
  useAppProps,
  useEditorInterface,
  useExcalidrawSetAppState,
} from "../App";
import DropdownMenu from "../dropdownMenu/DropdownMenu";
import { brainIcon } from "../icons";

import type { JSX, ReactNode } from "react";

export const TTDDialogTrigger = ({
  children,
  icon,
}: {
  children?: ReactNode;
  icon?: JSX.Element;
}) => {
  const { t } = useI18n();
  const { TTDDialogTriggerTunnel } = useTunnels();
  const setAppState = useExcalidrawSetAppState();
  const { UIOptions } = useAppProps();
  const editorInterface = useEditorInterface();
  const isLeftToolbar =
    UIOptions.toolbarLayout === "left" &&
    editorInterface.formFactor !== "phone";
  const tooltipLabel = typeof children === "string"
    ? children
    : t("labels.textToDiagram");

  return (
    <TTDDialogTriggerTunnel.In>
      <DropdownMenu.Item
        onSelect={() => {
          trackEvent("ai", "dialog open", "ttd");
          setAppState({ openDialog: { name: "ttd", tab: "text-to-diagram" } });
        }}
        icon={icon ?? brainIcon}
        tooltipLabel={isLeftToolbar ? tooltipLabel : undefined}
      >
        {children ?? t("labels.textToDiagram")}
        <DropdownMenu.Item.Badge>AI</DropdownMenu.Item.Badge>
      </DropdownMenu.Item>
    </TTDDialogTriggerTunnel.In>
  );
};
TTDDialogTrigger.displayName = "TTDDialogTrigger";
