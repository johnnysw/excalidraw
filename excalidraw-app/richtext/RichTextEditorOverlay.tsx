/**
 * RichTextEditorOverlay 组件
 * 富文本编辑器的弹窗包装
 */

import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { RichTextEditor } from "./RichTextEditor";
import "./RichTextEditorOverlay.scss";

export interface RichTextEditorOverlayProps {
  /** 是否显示 */
  isOpen: boolean;
  /** 初始 HTML 内容（编辑模式） */
  initialHtml?: string;
  /** 节点 ID（编辑模式） */
  nodeId?: string;
  /** 提交回调 */
  onSubmit: (html: string, nodeId?: string) => void;
  /** 取消回调 */
  onCancel: () => void;
}

export const RichTextEditorOverlay: React.FC<RichTextEditorOverlayProps> = ({
  isOpen,
  initialHtml = "",
  nodeId,
  onSubmit,
  onCancel,
}) => {
  const overlayRef = useRef<HTMLDivElement>(null);

  // ESC 键关闭
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onCancel]);

  // 阻止滚动
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const handleSubmit = (html: string) => {
    onSubmit(html, nodeId);
  };

  const handleBackgroundClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) {
      onCancel();
    }
  };

  const title = nodeId ? "编辑富文本" : "新建富文本";

  return createPortal(
    <div
      ref={overlayRef}
      className="richtext-editor-overlay"
      onClick={handleBackgroundClick}
    >
      <div className="richtext-editor-overlay__dialog">
        <div className="richtext-editor-overlay__header">
          <h2 className="richtext-editor-overlay__title">{title}</h2>
          <button
            type="button"
            className="richtext-editor-overlay__close"
            onClick={onCancel}
            title="关闭"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="richtext-editor-overlay__content">
          <RichTextEditor
            initialHtml={initialHtml}
            placeholder="输入富文本内容..."
            onSubmit={handleSubmit}
            onCancel={onCancel}
          />
        </div>
      </div>
    </div>,
    document.body
  );
};

export default RichTextEditorOverlay;
