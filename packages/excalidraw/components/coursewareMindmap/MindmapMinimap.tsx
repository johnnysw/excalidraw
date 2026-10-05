import React from "react";
import {
  coursewareMindmapLocalToScene,
  getCoursewareMindmapGeometry,
} from "@excalidraw/element/coursewareMindmap";
import type { CoursewareMindmapController } from "../../coursewareMindmap/controller";
export const MindmapMinimap = ({
  controller,
}: {
  controller: CoursewareMindmapController;
}) => {
  const element = controller.element;
  if (!element) return null;
  const geometry = getCoursewareMindmapGeometry(element);
  if (!geometry) return null;
  const { bounds } = geometry;
  const { width, height, zoom, scrollX, scrollY } = controller.app.state;
  const left = -scrollX,
    top = -scrollY,
    right = width / zoom.value - scrollX,
    bottom = height / zoom.value - scrollY;
  const corners = [
    { x: left, y: top },
    { x: right, y: top },
    { x: right, y: bottom },
    { x: left, y: bottom },
  ].map((point) => controller.host.worldToLocal(element.id, point));
  const navigate = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const local = {
      x: bounds.x + ((event.clientX - rect.left) / rect.width) * bounds.width,
      y: bounds.y + ((event.clientY - rect.top) / rect.height) * bounds.height,
    };
    const world = coursewareMindmapLocalToScene(element, local);
    controller.app.setState({
      scrollX:
        controller.app.state.width / 2 / controller.app.state.zoom.value -
        world.x,
      scrollY:
        controller.app.state.height / 2 / controller.app.state.zoom.value -
        world.y,
    });
  };
  return (
    <div
      className="Courseware-mindmap-minimap"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <header>
        <button
          onClick={() =>
            controller.app.scrollToContent(element, {
              fitToViewport: true,
              animate: true,
            })
          }
        >
          适应导图
        </button>
        <button
          aria-label="关闭脑图小地图"
          onClick={() => controller.notify({ minimapOpen: false })}
        >
          ×
        </button>
      </header>
      <svg
        role="img"
        aria-label="脑图小地图，拖动定位"
        viewBox={`${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`}
        preserveAspectRatio="none"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          navigate(event);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            navigate(event);
        }}
        onPointerUp={(event) =>
          event.currentTarget.releasePointerCapture(event.pointerId)
        }
      >
        {Object.values(geometry.nodes).map((box) => (
          <rect
            key={box.id}
            x={box.x}
            y={box.y}
            width={box.width}
            height={box.height}
            rx={3}
            fill={box.id === geometry.rootId ? "#5b7cfa" : "#cbd5e1"}
          />
        ))}
        <polygon
          points={corners.map((p) => `${p.x},${p.y}`).join(" ")}
          fill="rgba(56,94,250,.1)"
          stroke="#385efa"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
};
