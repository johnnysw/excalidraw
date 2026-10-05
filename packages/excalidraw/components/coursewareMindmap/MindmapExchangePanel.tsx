import React, { useRef, useState } from "react";
import { MindmapExchangeCodec } from "@excalidraw/mindmap";
import type { CoursewareMindmapController } from "../../coursewareMindmap/controller";
import { prepareMindmapExchangeResources } from "../../coursewareMindmap/exchangeResources";
export const MindmapExchangePanel = ({
  controller,
}: {
  controller: CoursewareMindmapController;
}) => {
  const [text, setText] = useState("");
  const [format, setFormat] = useState<"json" | "markdown">("json");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const { model } = controller;
  if (!model) return null;
  const exportFile = async () => {
    const exported = controller.exchangeModel;
    if (!exported) return;
    setBusy(true);
    setError("");
    try {
      const content =
        format === "json"
          ? MindmapExchangeCodec.serialize(
              exported,
              await prepareMindmapExchangeResources([exported], controller.app.files),
            )
          : MindmapExchangeCodec.toMarkdown(exported);
      const url = URL.createObjectURL(
        new Blob([content], {
          type:
            format === "json"
              ? "application/json"
              : "text/markdown;charset=utf-8",
        }),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${exported.nodes[exported.rootId].label.replace(/[\\/:*?"<>|]/g, "_") || "思维导图"}.${format === "json" ? "json" : "md"}`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "脑图导出失败");
    } finally {
      setBusy(false);
    }
  };
  const load = async (text: string) => {
    setBusy(true);
    setError("");
    try {
      await controller.importExchange(text, format, "child", "map");
      setText("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "导入失败");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section
      className="Courseware-mindmap-workspace-section"
      aria-label="脑图文件交换"
    >
      <label>
        格式
        <select
          aria-label="脑图文件格式"
          disabled={busy}
          value={format}
          onChange={(event) => setFormat(event.target.value as typeof format)}
        >
          <option value="json">完整脑图 JSON（含图片与样式）</option>
          <option value="markdown">Markdown（主题层级与文字格式）</option>
        </select>
      </label>
      <button disabled={busy} onClick={() => void exportFile()}>导出整张脑图</button>
      <p>
        {format === "json"
          ? "完整保留图片、概要、外框、关联线和样式，可离线重建。"
          : "保留文字层级、链接和文字格式。完整样式及图片请使用 JSON。"}
      </p>
      <input
        hidden
        ref={file}
        type="file"
        accept={
          format === "json"
            ? ".json,application/json"
            : ".md,.markdown,.txt,text/plain,text/markdown"
        }
        onChange={(event) => {
          const chosen = event.target.files?.[0];
          event.target.value = "";
          if (chosen)
            void chosen
              .text()
              .then(load)
              .catch((reason) => setError(String(reason)));
        }}
      />
      <button
        disabled={busy || !controller.editable}
        onClick={() => file.current?.click()}
      >
        选择文件导入为新导图
      </button>
      <textarea
        aria-label="导入脑图内容"
        rows={8}
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={
          format === "json" ? "粘贴完整脑图 JSON" : "粘贴 Markdown 或缩进文本"
        }
      />
      <button
        disabled={busy || !controller.editable || !text.trim()}
        onClick={() => void load(text)}
      >
        {busy ? "正在导入…" : "导入为新导图"}
      </button>
      {error && <p role="alert">{error}</p>}
    </section>
  );
};
