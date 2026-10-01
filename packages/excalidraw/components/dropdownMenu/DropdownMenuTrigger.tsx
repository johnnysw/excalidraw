import clsx from "clsx";

import { useEditorInterface } from "../App";
import { hideTooltip, showTooltip } from "../Tooltip";

const MenuTrigger = ({
  className = "",
  children,
  onToggle,
  title,
  ...rest
}: {
  className?: string;
  children: React.ReactNode;
  onToggle: () => void;
  title?: string;
  tooltipPosition?: "bottom" | "top" | "right";
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onSelect">) => {
  const { tooltipPosition, ...buttonProps } = rest;
  const editorInterface = useEditorInterface();
  const classNames = clsx(
    `dropdown-menu-button ${className}`,
    "zen-mode-transition",
    {
      "dropdown-menu-button--mobile": editorInterface.formFactor === "phone",
    },
  ).trim();
  return (
    <button
      className={classNames}
      onClick={onToggle}
      type="button"
      data-testid="dropdown-menu-button"
      title={title}
      {...buttonProps}
      onPointerEnter={(event) => {
        buttonProps.onPointerEnter?.(event);
        if (tooltipPosition && title) {
          showTooltip(event.currentTarget, title, false, tooltipPosition);
        }
      }}
      onPointerLeave={(event) => {
        buttonProps.onPointerLeave?.(event);
        if (tooltipPosition) {
          hideTooltip();
        }
      }}
    >
      {children}
    </button>
  );
};

export default MenuTrigger;
MenuTrigger.displayName = "DropdownMenuTrigger";
