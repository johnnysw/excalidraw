/**
 * RichTextEditor 组件
 * 基于 contentEditable 的简易富文本编辑器
 */

import React, { useRef, useState, useCallback, useEffect } from "react";
import "./RichTextEditor.scss";

// 预设颜色
const TEXT_COLORS = [
  "#1e1e1e", // 黑色
  "#dc2626", // 红色
  "#ea580c", // 橙色
  "#ca8a04", // 黄色
  "#16a34a", // 绿色
  "#0891b2", // 青色
  "#2563eb", // 蓝色
  "#7c3aed", // 紫色
  "#db2777", // 粉色
  "#64748b", // 灰色
];

const HIGHLIGHT_COLORS = [
  "transparent", // 无高亮
  "#fef08a", // 黄色
  "#bbf7d0", // 绿色
  "#bfdbfe", // 蓝色
  "#fecaca", // 红色
  "#e9d5ff", // 紫色
  "#fed7aa", // 橙色
  "#fce7f3", // 粉色
  "#e2e8f0", // 灰色
  "#a5f3fc", // 青色
];

export interface RichTextEditorProps {
  initialHtml?: string;
  placeholder?: string;
  onSubmit: (html: string) => void;
  onCancel: () => void;
}

export const RichTextEditor: React.FC<RichTextEditorProps> = ({
  initialHtml = "",
  placeholder = "输入富文本内容...",
  onSubmit,
  onCancel,
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const [showTextColorPicker, setShowTextColorPicker] = useState(false);
  const [showHighlightPicker, setShowHighlightPicker] = useState(false);
  const [currentTextColor, setCurrentTextColor] = useState("#1e1e1e");
  const [currentHighlight, setCurrentHighlight] = useState("transparent");

  // 初始化内容
  useEffect(() => {
    if (editorRef.current && initialHtml) {
      editorRef.current.innerHTML = initialHtml;
    }
  }, [initialHtml]);

  // 执行格式化命令
  const execCommand = useCallback(
    (command: string, value: string | undefined = undefined) => {
      document.execCommand(command, false, value);
      editorRef.current?.focus();
    },
    []
  );

  // 工具栏按钮点击
  const handleBold = () => execCommand("bold");
  const handleItalic = () => execCommand("italic");
  const handleUnderline = () => execCommand("underline");
  const handleStrikethrough = () => execCommand("strikeThrough");
  const handleUnorderedList = () => execCommand("insertUnorderedList");
  const handleOrderedList = () => execCommand("insertOrderedList");

  // 文字颜色
  const handleTextColor = (color: string) => {
    execCommand("foreColor", color);
    setCurrentTextColor(color);
    setShowTextColorPicker(false);
  };

  // 高亮颜色
  const handleHighlight = (color: string) => {
    if (color === "transparent") {
      execCommand("removeFormat");
    } else {
      execCommand("hiliteColor", color);
    }
    setCurrentHighlight(color);
    setShowHighlightPicker(false);
  };

  // 图片上传
  const handleImageUpload = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        execCommand("insertImage", dataUrl);
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  // 提交
  const handleSubmit = () => {
    const html = editorRef.current?.innerHTML || "";
    onSubmit(html);
  };

  // 点击外部关闭颜色选择器
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(".rich-text-editor__color-picker")) {
        setShowTextColorPicker(false);
        setShowHighlightPicker(false);
      }
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  return (
    <div className="rich-text-editor">
      {/* 工具栏 */}
      <div className="rich-text-editor__toolbar">
        {/* 基础格式 */}
        <div className="rich-text-editor__toolbar-group">
          <button
            type="button"
            className="rich-text-editor__toolbar-btn"
            onClick={handleBold}
            title="加粗 (Ctrl+B)"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z" />
              <path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z" />
            </svg>
          </button>
          <button
            type="button"
            className="rich-text-editor__toolbar-btn"
            onClick={handleItalic}
            title="斜体 (Ctrl+I)"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="19" y1="4" x2="10" y2="4" />
              <line x1="14" y1="20" x2="5" y2="20" />
              <line x1="15" y1="4" x2="9" y2="20" />
            </svg>
          </button>
          <button
            type="button"
            className="rich-text-editor__toolbar-btn"
            onClick={handleUnderline}
            title="下划线 (Ctrl+U)"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 3v7a6 6 0 0 0 6 6 6 6 0 0 0 6-6V3" />
              <line x1="4" y1="21" x2="20" y2="21" />
            </svg>
          </button>
          <button
            type="button"
            className="rich-text-editor__toolbar-btn"
            onClick={handleStrikethrough}
            title="删除线"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="4" y1="12" x2="20" y2="12" />
              <path d="M17.5 7.5c-.5-1.5-2-3-5.5-3-4 0-5.5 2-5.5 4 0 1.5.5 2.5 2 3.5" />
              <path d="M8.5 16.5c.5 1.5 2 3 5.5 3 4 0 5.5-2 5.5-4 0-1-.5-2-1.5-2.5" />
            </svg>
          </button>
        </div>

        {/* 列表 */}
        <div className="rich-text-editor__toolbar-group">
          <button
            type="button"
            className="rich-text-editor__toolbar-btn"
            onClick={handleUnorderedList}
            title="无序列表"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="9" y1="6" x2="20" y2="6" />
              <line x1="9" y1="12" x2="20" y2="12" />
              <line x1="9" y1="18" x2="20" y2="18" />
              <circle cx="5" cy="6" r="1" fill="currentColor" />
              <circle cx="5" cy="12" r="1" fill="currentColor" />
              <circle cx="5" cy="18" r="1" fill="currentColor" />
            </svg>
          </button>
          <button
            type="button"
            className="rich-text-editor__toolbar-btn"
            onClick={handleOrderedList}
            title="有序列表"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="10" y1="6" x2="20" y2="6" />
              <line x1="10" y1="12" x2="20" y2="12" />
              <line x1="10" y1="18" x2="20" y2="18" />
              <text x="4" y="8" fontSize="6" fill="currentColor" fontFamily="sans-serif">1</text>
              <text x="4" y="14" fontSize="6" fill="currentColor" fontFamily="sans-serif">2</text>
              <text x="4" y="20" fontSize="6" fill="currentColor" fontFamily="sans-serif">3</text>
            </svg>
          </button>
        </div>

        {/* 颜色 */}
        <div className="rich-text-editor__toolbar-group">
          <div style={{ position: "relative" }}>
            <button
              type="button"
              className="rich-text-editor__toolbar-btn rich-text-editor__color-btn"
              style={{ "--color-indicator": currentTextColor } as React.CSSProperties}
              onClick={(e) => {
                e.stopPropagation();
                setShowTextColorPicker(!showTextColorPicker);
                setShowHighlightPicker(false);
              }}
              title="文字颜色"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 20h16" />
                <path d="M12 4l5 12H7l5-12z" />
              </svg>
            </button>
            {showTextColorPicker && (
              <div className="rich-text-editor__color-picker">
                {TEXT_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`rich-text-editor__color-option ${
                      currentTextColor === color ? "selected" : ""
                    }`}
                    style={{ backgroundColor: color }}
                    onClick={() => handleTextColor(color)}
                  />
                ))}
              </div>
            )}
          </div>
          <div style={{ position: "relative" }}>
            <button
              type="button"
              className="rich-text-editor__toolbar-btn rich-text-editor__color-btn"
              style={{
                "--color-indicator":
                  currentHighlight === "transparent" ? "#e5e7eb" : currentHighlight,
              } as React.CSSProperties}
              onClick={(e) => {
                e.stopPropagation();
                setShowHighlightPicker(!showHighlightPicker);
                setShowTextColorPicker(false);
              }}
              title="高亮颜色"
            >
              <svg viewBox="0 0 24 24" fill="currentColor">
                <rect x="3" y="14" width="18" height="6" rx="1" opacity="0.3" />
                <path
                  d="M12 4l5 10H7l5-10z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                />
              </svg>
            </button>
            {showHighlightPicker && (
              <div className="rich-text-editor__color-picker">
                {HIGHLIGHT_COLORS.map((color, index) => (
                  <button
                    key={color + index}
                    type="button"
                    className={`rich-text-editor__color-option ${
                      currentHighlight === color ? "selected" : ""
                    }`}
                    style={{
                      backgroundColor: color === "transparent" ? "#fff" : color,
                      border: color === "transparent" ? "2px dashed #ccc" : undefined,
                    }}
                    onClick={() => handleHighlight(color)}
                    title={color === "transparent" ? "无高亮" : undefined}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 图片 */}
        <div className="rich-text-editor__toolbar-group">
          <button
            type="button"
            className="rich-text-editor__toolbar-btn"
            onClick={handleImageUpload}
            title="插入图片"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
          </button>
        </div>
      </div>

      {/* 编辑区域 */}
      <div
        ref={editorRef}
        className="rich-text-editor__content"
        contentEditable
        data-placeholder={placeholder}
        onKeyDown={(e) => {
          // Ctrl+Enter 提交
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            handleSubmit();
          }
          // Escape 取消
          if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
      />

      {/* 操作按钮 */}
      <div className="rich-text-editor__actions">
        <button
          type="button"
          className="rich-text-editor__btn rich-text-editor__btn--cancel"
          onClick={onCancel}
        >
          取消
        </button>
        <button
          type="button"
          className="rich-text-editor__btn rich-text-editor__btn--submit"
          onClick={handleSubmit}
        >
          确定 (Ctrl+Enter)
        </button>
      </div>
    </div>
  );
};

export default RichTextEditor;
