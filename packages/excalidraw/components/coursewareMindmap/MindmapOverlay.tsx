import { getCoursewareMindmapRenderData } from "@excalidraw/element/coursewareMindmapRenderData";
import { isTransparent } from "@excalidraw/common";
import { MindmapImageControls } from "./MindmapImageControls";
import { MindmapWorkspacePanel } from "./MindmapWorkspacePanel";
import { MindmapInputCapture } from "./MindmapInputCapture";
import {
  MindmapOtherSelections,
  MindmapDropIndicator,
} from "./MindmapOtherSelections";
import { MindmapMinimap } from "./MindmapMinimap";
import React, { useEffect, useRef, useSyncExternalStore } from "react";
import {
  coursewareMindmapLocalToScene,
  drawCoursewareMindmap,
  getCoursewareMindmapGeometry,
} from "@excalidraw/element/coursewareMindmap";
import { resolveMindmapNodeVisualStyle } from "@excalidraw/mindmap";
import { MindmapNodeToolbar } from "./MindmapNodeToolbar";
import { MindmapNodeSelection } from "./MindmapNodeSelection";
import { MindmapTextEditor } from "./MindmapTextEditor";
import { MindmapSearch } from "./MindmapSearch";
import { Tooltip } from "../Tooltip";
import type App from "../App";
import "./mindmap.scss";

export const CoursewareMindmapOverlay = ({ app }: { app: App }) => {
  const controller = app.mindmap;
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
  );
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const element = controller.element;
  const node = controller.node;
  const model = controller.model;
  const preview = state.preview;
  const { zoom, scrollX, scrollY, width, height } = app.state;
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const scale = window.devicePixelRatio || 1;
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx || !preview) {
      return;
    }
    if (state.selection) {
      app.renderMindmapPreview(
        canvas,
        state.previews.length ? state.previews : preview,
      );
      return;
    }
    ctx.scale(scale * zoom.value, scale * zoom.value);
    ctx.translate(
      scrollX + preview.x + preview.width / 2,
      scrollY + preview.y + preview.height / 2,
    );
    ctx.rotate(preview.angle);
    ctx.translate(-preview.width / 2, -preview.height / 2);
    ctx.globalAlpha = 0.7;
    drawCoursewareMindmap(preview, ctx, {
      files: app.files,
      imageCache: app.imageCache,
    });
  }, [
    preview,
    zoom,
    scrollX,
    scrollY,
    width,
    height,
    app,
    state.selection,
    state.previews,
  ]);
  useEffect(() => {
    if (
      state.selection &&
      (!element ||
        app.state.activeTool.type !== "selection" ||
        app.state.presentationMode)
    ) {
      controller.clear();
    }
  }, [
    element,
    app.state.activeTool.type,
    app.state.presentationMode,
    controller,
    state.selection,
  ]);
  if (!controller.enabled) {
    return null;
  }
  const currentElement =
    state.preview && state.selection ? state.preview : element;
  const geometry =
    currentElement && getCoursewareMindmapGeometry(currentElement);
  const nodeGeometry = node && geometry?.nodes[node.id];
  const nodeStyle = (box: {
    x: number;
    y: number;
    width: number;
    height: number;
  }): React.CSSProperties => {
    if (!currentElement || !geometry) return {};
    const point = coursewareMindmapLocalToScene(currentElement, box);
    const flipX = model?.flipX ? -1 : 1;
    const flipY = model?.flipY ? -1 : 1;
    return {
      left: (point.x + scrollX) * zoom.value,
      top: (point.y + scrollY) * zoom.value,
      width:
        ((box.width * currentElement.width) / geometry.bounds.width) *
        zoom.value,
      height:
        ((box.height * currentElement.height) / geometry.bounds.height) *
        zoom.value,
      transform: `rotate(${currentElement.angle}rad) scale(${flipX},${flipY})`,
      transformOrigin: "0 0",
    };
  };
  let style: React.CSSProperties = {};
  if (nodeGeometry && currentElement && geometry) {
    style = nodeStyle(nodeGeometry);
  }
  // The toolbar stays upright and centered on the transformed node bounds.
  const angle = currentElement?.angle ?? 0;
  const w = (Number(style.width) || 0) * (model?.flipX ? -1 : 1);
  const h = (Number(style.height) || 0) * (model?.flipY ? -1 : 1);
  const corners = [
    [0, 0],
    [w, 0],
    [0, h],
    [w, h],
  ].map(([x, y]) => ({
    x: (Number(style.left) || 0) + x * Math.cos(angle) - y * Math.sin(angle),
    y: (Number(style.top) || 0) + x * Math.sin(angle) + y * Math.cos(angle),
  }));
  const minX = Math.min(...corners.map((p) => p.x));
  const minY = Math.min(...corners.map((p) => p.y));
  const toolbarAnchor = {
    left: minX,
    top: minY,
    width: Math.max(...corners.map((p) => p.x)) - minX,
    height: Math.max(...corners.map((p) => p.y)) - minY,
  };
  const visual =
    node && model && nodeGeometry
      ? resolveMindmapNodeVisualStyle(node, nodeGeometry.depth, model)
      : null;
  const renderData =
    currentElement && getCoursewareMindmapRenderData(currentElement);
  const renderNode = renderData?.nodes.find(
    (item) => item.node.id === node?.id,
  );
  const editorFill =
    visual?.shape === "text"
      ? (renderNode?.textBackground?.fill ?? "transparent")
      : visual?.fill;
  const textBox =
    renderNode &&
    nodeGeometry &&
    (state.editing === "summary"
      ? (renderNode.content.summary ?? {
          x: 0,
          y: nodeGeometry.height + 8,
          width: Math.max(180, nodeGeometry.width),
          height: 90,
        })
      : renderNode.content.label);
  const editingStyle =
    textBox && nodeGeometry
      ? nodeStyle({
          x: nodeGeometry.x + textBox.x - 4,
          y: nodeGeometry.y + textBox.y - 4,
          width: textBox.width + 8,
          height: textBox.height + 8,
        })
      : style;
  return (
    <>
      {node && !state.editing && (
        <MindmapInputCapture controller={controller} />
      )}
      {preview && (
        <canvas
          ref={canvasRef}
          className="Courseware-mindmap-preview"
          style={{ width, height }}
          aria-hidden="true"
        />
      )}
      {state.marquee && (
        <div className="Courseware-mindmap-marquee" style={state.marquee} />
      )}
      {renderData &&
        state.selectedNodeIds
          .filter((id) => id !== node?.id)
          .map((id) => {
            const selectedNode = renderData.nodes.find(
              (item) => item.node.id === id,
            );
            return (
              selectedNode && (
                <MindmapNodeSelection
                  key={id}
                  node={selectedNode}
                  layoutScale={renderData.scale}
                  style={nodeStyle(selectedNode.bounds)}
                />
              )
            );
          })}
      <MindmapOtherSelections controller={controller} />
      <MindmapDropIndicator controller={controller} />
      {renderNode && node && model && renderData && (
        <MindmapNodeSelection
          node={renderNode}
          layoutScale={renderData.scale}
          style={style}
        >
          {!state.editing && controller.editable && (
            <div className="Courseware-mindmap-node-actions">
              <Tooltip label="新增子主题 — Tab" position="top">
                <button
                  type="button"
                  aria-label="新增子主题"
                  onClick={() => controller.add("child")}
                >
                  +
                </button>
              </Tooltip>
              {Object.values(model.nodes).some(
                (item) => item.parentId === node.id,
              ) && (
                <Tooltip
                  label={node.collapsed ? "展开分支" : "折叠分支"}
                  position="top"
                >
                  <button
                    type="button"
                    aria-label={node.collapsed ? "展开分支" : "折叠分支"}
                    onClick={() => controller.toggleCollapse()}
                  >
                    {node.collapsed ? "+" : "−"}
                  </button>
                </Tooltip>
              )}
            </div>
          )}
        </MindmapNodeSelection>
      )}
      {node && nodeGeometry && !state.editing && (
        <MindmapImageControls controller={controller} style={style} />
      )}
      {state.editing &&
        state.workspacePanel !== "outline" &&
        node &&
        nodeGeometry &&
        visual && (
          <MindmapTextEditor
            key={`${element?.id}:${node.id}:${state.editing}`}
            controller={controller}
            style={{
              ...editingStyle,
              minHeight: state.editing === "summary" ? 90 : undefined,
              padding: 2,
              fontFamily: "Arial, sans-serif",
              fontSize:
                visual.fontSize *
                (currentElement
                  ? currentElement.width / Math.max(1, geometry!.bounds.width)
                  : 1) *
                zoom.value,
              color: visual.color,
              // Composite translucent node fills onto an opaque surface so the
              // canvas label cannot show through the text being edited.
              background: `linear-gradient(${editorFill}, ${editorFill}), ${
                isTransparent(app.state.viewBackgroundColor)
                  ? "var(--island-bg-color)"
                  : app.state.viewBackgroundColor
              }`,
              fontWeight: visual.fontWeight,
              fontStyle: visual.fontStyle,
              textDecoration: visual.textDecoration,
              textAlign: visual.align ?? "center",
            }}
          />
        )}
      {node && !state.editing && (
        <MindmapNodeToolbar
          key={`${element?.id}:${node.id}`}
          controller={controller}
          anchor={toolbarAnchor}
        />
      )}
      {node && !controller.editable && !state.searchOpen && (
        <button
          type="button"
          className="Courseware-mindmap-readonly-search"
          aria-label="在导图中搜索"
          onClick={() => controller.notify({ searchOpen: true })}
        >
          搜索导图
        </button>
      )}
      {state.searchOpen && <MindmapSearch controller={controller} />}
      {state.workspacePanel && (
        <MindmapWorkspacePanel controller={controller} />
      )}
      {state.minimapOpen && <MindmapMinimap controller={controller} />}
      {state.multiSelectMode && (
        <div className="Courseware-mindmap-multi-selection-mode" role="status">
          已选 {state.selections.length} 个节点
          <button
            type="button"
            onClick={() => controller.notify({ multiSelectMode: false })}
          >
            完成多选
          </button>
        </div>
      )}
      {state.dropWarning && (
        <div className="Courseware-mindmap-drop-message" role="status">
          {state.dropWarning}
        </div>
      )}
      {state.splitCandidate && (
        <div className="Courseware-mindmap-drop-message" role="status">
          松开以拆为独立导图
        </div>
      )}
    </>
  );
};
