import React, { useState, useEffect, useCallback } from "react";
import { RgbaColorPicker, RgbaColor } from "react-colorful";
import { Icon } from "@iconify/react";

import "./AdvancedColorPicker.scss";

interface AdvancedColorPickerProps {
  color: string | null;
  onChange: (color: string) => void;
  onEyeDropperToggle?: (force?: boolean) => void;
  onClose?: () => void;
}

// 将 hex 颜色转换为 rgba 对象
const hexToRgba = (hex: string | null): RgbaColor => {
  if (!hex || hex === "transparent") {
    return { r: 0, g: 0, b: 0, a: 0 };
  }

  // 移除 # 前缀
  const cleanHex = hex.replace("#", "");

  // 处理 3 位 hex
  const fullHex =
    cleanHex.length === 3
      ? cleanHex
          .split("")
          .map((c) => c + c)
          .join("")
      : cleanHex;

  // 处理 8 位 hex (带透明度)
  const r = parseInt(fullHex.slice(0, 2), 16);
  const g = parseInt(fullHex.slice(2, 4), 16);
  const b = parseInt(fullHex.slice(4, 6), 16);
  const a =
    fullHex.length === 8 ? parseInt(fullHex.slice(6, 8), 16) / 255 : 1;

  return { r, g, b, a };
};

// 将 rgba 对象转换为 hex 颜色
const rgbaToHex = (rgba: RgbaColor): string => {
  const toHex = (n: number) => {
    const hex = Math.round(n).toString(16);
    return hex.length === 1 ? "0" + hex : hex;
  };

  const hex = `#${toHex(rgba.r)}${toHex(rgba.g)}${toHex(rgba.b)}`;

  // 如果透明度不是 100%，添加透明度
  if (rgba.a < 1) {
    return `${hex}${toHex(rgba.a * 255)}`;
  }

  return hex;
};

export const AdvancedColorPicker: React.FC<AdvancedColorPickerProps> = ({
  color,
  onChange,
  onEyeDropperToggle,
  onClose,
}) => {
  // 使用 ref 跟踪是否是内部触发的颜色变化
  const isInternalChange = React.useRef(false);

  const [rgbaColor, setRgbaColor] = useState<RgbaColor>(() =>
    hexToRgba(color),
  );
  const [hexInput, setHexInput] = useState(() =>
    color ? color.replace("#", "").toUpperCase() : "000000",
  );

  // 当外部颜色改变时，更新内部状态（但跳过内部触发的变化）
  useEffect(() => {
    if (isInternalChange.current) {
      isInternalChange.current = false;
      return;
    }
    const newRgba = hexToRgba(color);
    setRgbaColor(newRgba);
    setHexInput(color ? color.replace("#", "").toUpperCase() : "000000");
  }, [color]);

  const handleColorChange = useCallback(
    (newColor: RgbaColor) => {
      setRgbaColor(newColor);
      const hex = rgbaToHex(newColor);
      setHexInput(hex.replace("#", "").toUpperCase());
      isInternalChange.current = true;
      onChange(hex);
    },
    [onChange],
  );

  const handleHexInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value.replace("#", "").toUpperCase();
      setHexInput(value);

      // 验证并应用颜色
      if (/^[0-9A-F]{6}([0-9A-F]{2})?$/i.test(value)) {
        const newRgba = hexToRgba(`#${value}`);
        setRgbaColor(newRgba);
        isInternalChange.current = true;
        onChange(`#${value}`);
      }
    },
    [onChange],
  );

  const handleOpacityChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const opacity = Math.min(100, Math.max(0, parseInt(e.target.value) || 0));
      const newColor = { ...rgbaColor, a: opacity / 100 };
      handleColorChange(newColor);
    },
    [rgbaColor, handleColorChange],
  );

  const opacityPercent = Math.round(rgbaColor.a * 100);

  return (
    <div className="advanced-color-picker">
      <div className="advanced-color-picker__header">
        <span className="advanced-color-picker__title">颜色</span>
        {onClose && (
          <button
            className="advanced-color-picker__close"
            onClick={onClose}
            type="button"
            aria-label="Close"
          >
            <Icon icon="mdi:close" width={18} height={18} />
          </button>
        )}
      </div>

      <div className="advanced-color-picker__picker-wrapper">
        <RgbaColorPicker color={rgbaColor} onChange={handleColorChange} />
      </div>

      <div className="advanced-color-picker__controls">
        {onEyeDropperToggle && (
          <button
            className="advanced-color-picker__eyedropper"
            onClick={() => onEyeDropperToggle()}
            type="button"
            title="吸管工具"
          >
            <Icon icon="mdi:eyedropper" width={20} height={20} />
          </button>
        )}

        <div className="advanced-color-picker__hex-input">
          <span className="advanced-color-picker__hex-prefix">#</span>
          <input
            type="text"
            value={hexInput.slice(0, 6)}
            onChange={handleHexInputChange}
            maxLength={8}
            placeholder="000000"
          />
        </div>

        <div className="advanced-color-picker__opacity-input">
          <input
            type="number"
            value={opacityPercent}
            onChange={handleOpacityChange}
            min={0}
            max={100}
          />
          <span className="advanced-color-picker__opacity-suffix">%</span>
        </div>
      </div>
    </div>
  );
};
