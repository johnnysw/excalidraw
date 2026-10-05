import React from "react";
import type { WhiteboardMindmapObject } from "@excalidraw/mindmap";
interface MindmapProfessionalControlsProps {
  model: WhiteboardMindmapObject;
  nodeId: string;
  kind: "summary" | "boundary" | "relation";
  label: string;
  setLabel: (value: string) => void;
  color: string;
  setColor: (value: string) => void;
  lineStyle: "solid" | "dash" | "dot";
  setLineStyle: (value: "solid" | "dash" | "dot") => void;
  bracket: "square" | "curve";
  setBracket: (value: "square" | "curve") => void;
  validSummary: boolean;
  shape: "rectangle" | "rounded-rectangle";
  setShape: (value: "rectangle" | "rounded-rectangle") => void;
  target: string;
  setTargetId: (value: string) => void;
  relationStyle: "curve" | "round-angle" | "right-angle";
  setRelationStyle: (value: "curve" | "round-angle" | "right-angle") => void;
  startArrow: boolean;
  setStartArrow: (value: boolean) => void;
  endArrow: boolean;
  setEndArrow: (value: boolean) => void;
}
export const MindmapProfessionalControls = ({
  model,
  nodeId,
  kind,
  label,
  setLabel,
  color,
  setColor,
  lineStyle,
  setLineStyle,
  bracket,
  setBracket,
  validSummary,
  shape,
  setShape,
  target,
  setTargetId,
  relationStyle,
  setRelationStyle,
  startArrow,
  setStartArrow,
  endArrow,
  setEndArrow,
}: MindmapProfessionalControlsProps) => (
  <>
    <label>
      文字
      <input
        aria-label="结构标注文字"
        value={label}
        onChange={(event) => setLabel(event.target.value)}
      />
    </label>
    <label>
      颜色
      <input
        aria-label="结构颜色"
        type="color"
        value={color}
        onChange={(event) => setColor(event.target.value)}
      />
    </label>
    <label>
      线型
      <select
        aria-label="结构线型"
        value={lineStyle}
        onChange={(event) =>
          setLineStyle(event.target.value as typeof lineStyle)
        }
      >
        <option value="solid">实线</option>
        <option value="dash">虚线</option>
        <option value="dot">点线</option>
      </select>
    </label>
    {kind === "summary" && (
      <>
        <label>
          括线
          <select
            aria-label="概要括线"
            value={bracket}
            onChange={(event) =>
              setBracket(event.target.value as typeof bracket)
            }
          >
            <option value="square">直角括线</option>
            <option value="curve">曲线括线</option>
          </select>
        </label>
        {!validSummary && (
          <p role="status">选择同一父主题下连续的至少两个分支。</p>
        )}
      </>
    )}
    {kind === "boundary" && (
      <label>
        形状
        <select
          aria-label="外框形状"
          value={shape}
          onChange={(event) => setShape(event.target.value as typeof shape)}
        >
          <option value="rectangle">矩形</option>
          <option value="rounded-rectangle">圆角矩形</option>
        </select>
      </label>
    )}
    {kind === "relation" && (
      <>
        <label>
          目标主题
          <select
            aria-label="关联线目标主题"
            value={target}
            onChange={(event) => setTargetId(event.target.value)}
          >
            {model.order
              .filter((id) => id !== nodeId)
              .map((id) => (
                <option key={id} value={id}>
                  {model.nodes[id].label}
                </option>
              ))}
          </select>
        </label>
        <label>
          路径
          <select
            aria-label="关联线路径"
            value={relationStyle}
            onChange={(event) =>
              setRelationStyle(event.target.value as typeof relationStyle)
            }
          >
            <option value="curve">曲线</option>
            <option value="round-angle">圆角折线</option>
            <option value="right-angle">直角折线</option>
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={startArrow}
            onChange={(event) => setStartArrow(event.target.checked)}
          />
          起点箭头
        </label>
        <label>
          <input
            type="checkbox"
            checked={endArrow}
            onChange={(event) => setEndArrow(event.target.checked)}
          />
          终点箭头
        </label>
      </>
    )}
  </>
);
