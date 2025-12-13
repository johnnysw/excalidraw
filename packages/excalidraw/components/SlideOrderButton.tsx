import React, { useState, useRef, useEffect, useCallback } from "react";
import clsx from "clsx";
import { ListOrderedIcon } from "./icons";

import "./SlideOrderButton.scss";

interface SlideOrderButtonProps {
  frameId: string;
  currentOrder: number | null; // null 表示不在 slideOrder 中
  totalSlides: number;
  onOrderChange: (frameId: string, newOrder: number) => void;
}

export const SlideOrderButton: React.FC<SlideOrderButtonProps> = ({
  frameId,
  currentOrder,
  totalSlides,
  onOrderChange,
}) => {
  const [isInputVisible, setIsInputVisible] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isInputVisible && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isInputVisible]);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      // 只允许输入数字
      if (/^\d*$/.test(value)) {
        setInputValue(value);
      }
    },
    [],
  );

  const handleSubmit = useCallback(() => {
    const newOrder = parseInt(inputValue, 10);
    if (!isNaN(newOrder) && newOrder >= 1) {
      onOrderChange(frameId, newOrder);
    }
    setIsInputVisible(false);
    setInputValue("");
  }, [inputValue, frameId, onOrderChange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleSubmit();
      } else if (e.key === "Escape") {
        setIsInputVisible(false);
        setInputValue("");
      }
    },
    [handleSubmit],
  );

  const containerRef = useRef<HTMLDivElement>(null);

  const handleBlur = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
    // 检查焦点是否移动到容器内的其他元素
    const relatedTarget = e.relatedTarget as Node | null;
    if (containerRef.current?.contains(relatedTarget)) {
      return;
    }
    // 延迟关闭，避免点击时输入框消失
    setTimeout(() => {
      setIsInputVisible(false);
      setInputValue("");
    }, 100);
  }, []);

  const handleButtonClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsInputVisible(true);
    setInputValue(currentOrder !== null ? String(currentOrder) : "");
  }, [currentOrder]);

  return (
    <div className="SlideOrderButton" ref={containerRef}>
      <label
        className={clsx("ToolIcon ToolIcon__MagicButton", "ToolIcon_size_small")}
        title="设置播放顺序"
        onClick={handleButtonClick}
      >
        <input
          className="ToolIcon_type_checkbox"
          type="checkbox"
          name="slide-order"
          checked={false}
          readOnly
          aria-label="设置播放顺序"
          tabIndex={-1}
        />
        <div className="ToolIcon__icon">{ListOrderedIcon}</div>
      </label>
      {isInputVisible && (
        <div className="SlideOrderButton__input-container">
          <input
            ref={inputRef}
            type="text"
            className="SlideOrderButton__input"
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            placeholder={`1-${totalSlides || 1}`}
            autoComplete="off"
          />
        </div>
      )}
    </div>
  );
};

export default SlideOrderButton;
