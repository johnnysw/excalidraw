import React from "react";
import type { CoursewareMindmapController } from "../../coursewareMindmap/controller";
import { MindmapOutlinePanel } from "./MindmapOutlinePanel";
import { MindmapProfessionalPanel } from "./MindmapProfessionalPanel";
import { MindmapThemePanel } from "./MindmapThemePanel";
import { MindmapExchangePanel } from "./MindmapExchangePanel";
import { MindmapNodeContentSettings } from "./MindmapNodeContentSettings";
const tabs = [
  { key: "outline", label: "大纲" },
  { key: "objects", label: "结构" },
  { key: "theme", label: "主题" },
  { key: "content", label: "内容" },
  { key: "exchange", label: "文件" },
] as const;
export const MindmapWorkspacePanel = ({
  controller,
}: {
  controller: CoursewareMindmapController;
}) => {
  const active = controller.getSnapshot().workspacePanel;
  if (!active || !controller.model) return null;
  return (
    <aside
      className="Courseware-mindmap-workspace"
      aria-label="思维导图编辑面板"
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Escape") {
          controller.notify({ workspacePanel: null, preview: null });
          controller.app.focusContainer();
        }
      }}
    >
      <header>
        <strong>思维导图</strong>
        <button
          aria-label="关闭脑图编辑面板"
          onClick={() => {
            controller.notify({ workspacePanel: null });
            controller.app.focusContainer();
          }}
        >
          ×
        </button>
      </header>
      <nav
        className="Courseware-mindmap-workspace-tabs"
        role="tablist"
        aria-label="脑图编辑页面"
      >
        {tabs.map((tab) => (
          <button
            key={tab.key}
            role="tab"
            aria-selected={active === tab.key}
            onClick={() => controller.notify({ workspacePanel: tab.key })}
          >
            {tab.label}
          </button>
        ))}
      </nav>
      <div className="Courseware-mindmap-workspace-body">
        {active === "outline" && (
          <MindmapOutlinePanel controller={controller} />
        )}
        {active === "objects" && (
          <MindmapProfessionalPanel controller={controller} />
        )}
        {active === "theme" && <MindmapThemePanel controller={controller} />}
        {active === "content" && (
          <MindmapNodeContentSettings
            key={controller.node?.id}
            controller={controller}
          />
        )}
        {active === "exchange" && (
          <MindmapExchangePanel controller={controller} />
        )}
      </div>
    </aside>
  );
};
