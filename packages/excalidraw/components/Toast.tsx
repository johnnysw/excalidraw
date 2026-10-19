import { useCallback, useEffect, useRef } from "react";

import { CloseIcon } from "./icons";
import { ToolButton } from "./ToolButton";

import "./Toast.scss";

import type { CSSProperties, ReactNode } from "react";

const DEFAULT_TOAST_TIMEOUT = 5000;

export const Toast = ({
  message,
  onClose,
  closable = false,
  // To prevent autoclose, pass duration as Infinity
  duration = DEFAULT_TOAST_TIMEOUT,
  style,
  role = "status",
}: {
  message: ReactNode;
  onClose: () => void;
  closable?: boolean;
  duration?: number;
  style?: CSSProperties;
  role?: "status" | "alert";
}) => {
  const timerRef = useRef<number>(0);
  const shouldAutoClose = duration !== Infinity;
  const scheduleTimeout = useCallback(() => {
    if (!shouldAutoClose) {
      return;
    }
    timerRef.current = window.setTimeout(() => onClose(), duration);
  }, [onClose, duration, shouldAutoClose]);

  useEffect(() => {
    if (!shouldAutoClose) {
      return;
    }
    scheduleTimeout();
    return () => clearTimeout(timerRef.current);
  }, [scheduleTimeout, message, duration, shouldAutoClose]);

  const onMouseEnter = shouldAutoClose
    ? () => clearTimeout(timerRef?.current)
    : undefined;
  const onMouseLeave = shouldAutoClose ? scheduleTimeout : undefined;
  return (
    <div
      className="Toast"
      role={role}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={style}
    >
      <div className="Toast__message">{message}</div>
      {closable && (
        <ToolButton
          icon={CloseIcon}
          aria-label="close"
          type="icon"
          onClick={onClose}
          className="close"
        />
      )}
    </div>
  );
};
