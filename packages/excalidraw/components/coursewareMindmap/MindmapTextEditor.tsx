import React, { useEffect, useRef, useState } from "react";
import { reconcileMindmapTextChange } from "@excalidraw/mindmap";
import type { MindmapLabelStyle } from "@excalidraw/mindmap";
import type { CoursewareMindmapController } from "../../coursewareMindmap/controller";
import {
  resolveMindmapEditorStyle,
  updateMindmapEditorSelection,
} from "./mindmapEditorStyle";
import { handleMindmapEditorKeyDown } from "./mindmapEditorKeyboard";
import { applyMindmapEditorHtmlPaste } from "./mindmapEditorHtmlPaste";
import { MindmapTextEditorDecoration } from "./MindmapTextEditorDecoration";

export const MindmapTextEditor = ({
  controller,
  style,
}: {
  controller: CoursewareMindmapController;
  style: React.CSSProperties;
}) => {
  const field = controller.getSnapshot().editing!;
  const node = controller.node!;
  const [value, setValue] = useState(
    controller.getSnapshot().editingValue ?? node[field] ?? "",
  );
  const [, redraw] = useState(0);
  const composing = useRef(false),
    finished = useRef(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const history = useRef([
    {
      value,
      ranges: controller.editSession?.labelStyleRanges ?? [],
      typingStyle: controller.editSession?.typingStyle ?? {},
    },
  ]);
  const cursor = useRef(0);
  const session = controller.editSession;
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const finish = (save: boolean) => {
    if (finished.current) return;
    finished.current = true;
    controller.finishEditing(save, session?.value ?? value);
  };
  const remember = () => {
    if (!session) return;
    history.current = history.current.slice(0, cursor.current + 1);
    history.current.push({
      value: session.value,
      ranges: [...session.labelStyleRanges],
      typingStyle: { ...session.typingStyle },
    });
    cursor.current = history.current.length - 1;
  };
  const refresh = () => {
    if (!session) return;
    setValue(session.value);
    controller.previewText(session.value);
    redraw((version) => version + 1);
  };
  const change = (next: string) => {
    if (!session) {
      setValue(next);
      controller.previewText(next);
      return;
    }
    const changed = reconcileMindmapTextChange(
      session.value,
      next,
      session.labelStyleRanges,
      session.typingStyle,
    );
    session.update(next, changed.labelStyleRanges);
    remember();
    refresh();
  };
  const format = (patch: MindmapLabelStyle) => {
    if (!session) return;
    session.selection = {
      start: ref.current?.selectionStart ?? 0,
      end: ref.current?.selectionEnd ?? 0,
    };
    session.format(patch);
    remember();
    refresh();
    ref.current?.focus();
  };
  const ranges = session?.labelStyleRanges ?? [];
  const rich = field === "label" && ranges.length > 0;
  const color = String(style.color ?? "#172033");
  return (
    <>
      <MindmapTextEditorDecoration
        {...{
          field,
          node,
          value,
          ranges,
          style,
          onFormat: format,
          typingStyle: resolveMindmapEditorStyle(session, style),
        }}
      />
      <textarea
        ref={ref}
        className="Courseware-mindmap-text-editor"
        style={{
          ...style,
          lineHeight: "1.4",
          ...(rich
            ? {
                color: "transparent",
                caretColor: color,
                background: "transparent",
              }
            : {}),
        }}
        aria-label={field === "label" ? "编辑脑图主题" : "编辑脑图描述"}
        value={value}
        onChange={(event) => change(event.target.value)}
        onPointerDown={(event) => event.stopPropagation()}
        onSelect={(event) => {
          updateMindmapEditorSelection(
            session,
            event.currentTarget.selectionStart,
            event.currentTarget.selectionEnd,
          );
          redraw((version) => version + 1);
        }}
        onCompositionStart={() => {
          composing.current = true;
        }}
        onCompositionEnd={() => {
          composing.current = false;
        }}
        onBlur={(event) => {
          if (
            !(
              event.relatedTarget instanceof HTMLElement &&
              event.relatedTarget.closest(".Courseware-mindmap-editor-format")
            )
          )
            finish(true);
        }}
        onPaste={(event) =>
          applyMindmapEditorHtmlPaste(event, field, session, remember, refresh)
        }
        onKeyDown={(event) =>
          handleMindmapEditorKeyDown({
            event,
            controller,
            field,
            style,
            composing: composing.current,
            finish,
            format,
            navigateHistory: (forward) => {
              if (!session) return;
              cursor.current = Math.max(
                0,
                Math.min(
                  history.current.length - 1,
                  cursor.current + (forward ? 1 : -1),
                ),
              );
              const previous = history.current[cursor.current];
              session.update(previous.value, previous.ranges);
              session.typingStyle = { ...previous.typingStyle };
              refresh();
            },
          })
        }
      />
    </>
  );
};
