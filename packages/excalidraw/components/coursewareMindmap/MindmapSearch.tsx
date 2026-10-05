import React, { useState } from "react";
import { searchMindmapNodes } from "../../coursewareMindmap/operations";
import type { CoursewareMindmapController } from "../../coursewareMindmap/controller";
export const MindmapSearch = ({
  controller,
}: {
  controller: CoursewareMindmapController;
}) => {
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [current, setCurrent] = useState(0);
  const model = controller.model;
  const matches = model ? searchMindmapNodes(model, query) : [];
  const index = Math.min(current, Math.max(0, matches.length - 1));
  const close = () => {
    controller.notify({ searchOpen: false, preview: null });
    controller.app.focusContainer();
  };
  const highlight = (text: string) => {
    if (!query.trim()) return text;
    const parts: React.ReactNode[] = [];
    const lower = text.toLocaleLowerCase(),
      match = query.toLocaleLowerCase();
    let start = 0,
      index = lower.indexOf(match);
    while (index >= 0) {
      parts.push(
        text.slice(start, index),
        <mark key={index}>{text.slice(index, index + query.length)}</mark>,
      );
      start = index + query.length;
      index = lower.indexOf(match, start);
    }
    parts.push(text.slice(start));
    return parts;
  };
  const locate = (next: number) => {
    if (!matches.length) return;
    const value = (next + matches.length) % matches.length;
    setCurrent(value);
    controller.revealNode(matches[value]);
  };
  return (
    <div
      className="Courseware-mindmap-search"
      role="search"
      aria-label="搜索思维导图"
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Escape") close();
        if (
          event.key === "Enter" &&
          event.target instanceof HTMLInputElement &&
          event.target.type === "search"
        ) {
          event.preventDefault();
          locate(index + (event.shiftKey ? -1 : 1));
        }
      }}
    >
      <input
        autoFocus
        type="search"
        aria-label="搜索主题、描述和标签"
        placeholder="搜索主题、描述和标签"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setCurrent(0);
        }}
      />
      <button type="button" aria-label="关闭脑图搜索" onClick={close}>
        ×
      </button>
      <output>
        {matches.length ? `${index + 1} / ${matches.length}` : "0 个结果"}
      </output>
      <button
        aria-label="上一个搜索结果"
        disabled={!matches.length}
        onClick={() => locate(index - 1)}
      >
        ↑
      </button>
      <button
        aria-label="下一个搜索结果"
        disabled={!matches.length}
        onClick={() => locate(index + 1)}
      >
        ↓
      </button>
      {controller.editable && (
        <>
          <input
            aria-label="替换内容"
            placeholder="替换为"
            value={replacement}
            onChange={(event) => setReplacement(event.target.value)}
          />
          <button
            disabled={!matches.length}
            onClick={() =>
              controller.replaceMatches(query, replacement, [matches[index]])
            }
          >
            替换
          </button>
          <button
            disabled={!matches.length}
            onClick={() =>
              controller.replaceMatches(query, replacement, matches)
            }
          >
            全部替换
          </button>
        </>
      )}
      <div>
        {matches.map((id) => (
          <button
            type="button"
            key={id}
            aria-label={model!.nodes[id].label}
            onClick={() => {
              setCurrent(matches.indexOf(id));
              controller.revealNode(id);
            }}
          >
            {highlight(model!.nodes[id].label)}
            {model!.nodes[id].summary && (
              <small>{highlight(model!.nodes[id].summary!)}</small>
            )}
            {!!model!.nodes[id].tags?.length && (
              <small>{highlight(model!.nodes[id].tags!.join(" · "))}</small>
            )}
          </button>
        ))}
      </div>
    </div>
  );
};
