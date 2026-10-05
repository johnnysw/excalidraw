import type {
  MindmapLabelStyle,
  MindmapLabelStyleRange,
  MindmapObject,
} from "./types";
import {
  applyMindmapCommand,
  type MindmapCommand,
  type MindmapCommandResult,
  type MindmapNodeOwnerChange,
} from "./commands";
import {
  normalizeMindmapLabelStyleRanges,
  replaceMindmapText,
  applyMindmapLabelStyle,
  reconcileMindmapTextChange,
} from "./text";
export interface MindmapHostAdapter {
  readLatest(): Readonly<Record<string, MindmapObject>>;
  localToWorld(
    mapId: string,
    point: { x: number; y: number }
  ): { x: number; y: number };
  worldToLocal(
    mapId: string,
    point: { x: number; y: number }
  ): { x: number; y: number };
  getRootWorldCenter(mapId: string): { x: number; y: number };
  showPreview(preview: Readonly<Record<string, MindmapObject>> | null): void;
  prepareResources(
    resources: Record<string, MindmapResource>
  ): Promise<Record<string, string>>;
  commit(operation: {
    objects: Record<string, MindmapObject>;
    removedMapIds?: string[];
    ownerChanges?: MindmapNodeOwnerChange[];
    selection?: { mapId: string; nodeIds: string[] };
  }): Promise<boolean>;
}
export interface MindmapResource {
  id: string;
  dataURL: string;
  mimeType: string;
}
/** A local draft with no reference to host persistence, collaboration or history. */
export class MindmapEditSession {
  readonly mapId: string;
  readonly nodeId: string;
  readonly field: "label" | "summary";
  private initial: MindmapObject;
  private creation?: Extract<MindmapCommand, { type: "add" }>;
  private draft: string;
  private ranges: MindmapLabelStyleRange[];
  private initialValue: string;
  private initialRanges: MindmapLabelStyleRange[];
  private finished = false;
  selection: { start: number; end: number };
  typingStyle: MindmapLabelStyle = {};
  constructor(
    object: MindmapObject,
    nodeId: string,
    field: "label" | "summary" = "label",
    creation?: Extract<MindmapCommand, { type: "add" }>
  ) {
    this.initial = object;
    this.mapId = object.id;
    this.nodeId = nodeId;
    this.field = field;
    this.creation = creation ? { ...creation, nodeId } : undefined;
    const source = this.creation
      ? applyMindmapCommand(object, this.creation).object
      : object;
    this.draft = source.nodes[nodeId]?.[field] || "";
    this.ranges = source.nodes[nodeId]?.labelStyleRanges || [];
    this.initialValue = this.draft;
    this.initialRanges = normalizeMindmapLabelStyleRanges(
      this.draft,
      this.ranges
    );
    this.selection = { start: 0, end: this.draft.length };
  }
  get value() {
    return this.draft;
  }
  get labelStyleRanges() {
    return this.ranges;
  }
  get active() {
    return !this.finished;
  }
  update(value: string, ranges?: MindmapLabelStyleRange[]) {
    if (this.finished) return;
    if (ranges) this.ranges = normalizeMindmapLabelStyleRanges(value, ranges);
    else
      this.ranges = reconcileMindmapTextChange(
        this.draft,
        value,
        this.ranges,
        this.typingStyle
      ).labelStyleRanges;
    this.draft = value;
  }
  replace(start: number, end: number, text: string) {
    if (this.finished) return;
    const next = replaceMindmapText(
      this.draft,
      this.ranges,
      start,
      end,
      text,
      this.typingStyle
    );
    this.draft = next.label;
    this.ranges = next.labelStyleRanges;
    this.selection = { start: start + text.length, end: start + text.length };
  }
  format(style: MindmapLabelStyle) {
    if (this.finished || this.field === "summary") return;
    this.typingStyle = { ...this.typingStyle, ...style };
    if (this.selection.end > this.selection.start)
      this.ranges = applyMindmapLabelStyle(
        this.draft,
        this.ranges,
        this.selection.start,
        this.selection.end,
        style
      );
  }
  preview(): MindmapObject {
    if (!this.creation && !this.hasChanges()) return this.initial;
    let source = this.creation
      ? applyMindmapCommand(this.initial, this.creation).object
      : this.initial;
    return applyMindmapCommand(source, {
      type: "patch",
      nodeIds: [this.nodeId],
      patch: {
        [this.field]: this.draft,
        ...(this.field === "label" ? { labelStyleRanges: this.ranges } : {}),
      },
    }).object;
  }
  /** Replays onto latest fields; a removed target never revives itself. */
  commit(
    latest: MindmapObject = this.initial
  ): MindmapCommandResult | undefined {
    if (this.finished || latest.locked || latest.id !== this.mapId)
      return undefined;
    if (!this.creation && latest.nodes[this.nodeId] && !this.hasChanges()) {
      this.finished = true;
      return {
        object: latest,
        changed: false,
        selectionIds: [this.nodeId],
        removedNodeIds: [],
        removedSummaryIds: [],
        invalidation: "none",
      };
    }
    if (
      !this.creation &&
      (latest.nodes[this.nodeId]?.[this.field] !== this.initialValue ||
        (this.field === "label" &&
          JSON.stringify(
            normalizeMindmapLabelStyleRanges(
              latest.nodes[this.nodeId]?.label || "",
              latest.nodes[this.nodeId]?.labelStyleRanges
            )
          ) !== JSON.stringify(this.initialRanges)))
    ) {
      this.finished = true;
      return undefined;
    }
    let source = latest;
    if (this.creation) {
      if (!latest.nodes[this.creation.anchorId] || latest.nodes[this.nodeId])
        return undefined;
      source = applyMindmapCommand(latest, this.creation).object;
    }
    if (!source.nodes[this.nodeId]) return undefined;
    const result = applyMindmapCommand(source, {
      type: "patch",
      nodeIds: [this.nodeId],
      patch: {
        [this.field]: this.draft,
        ...(this.field === "label" ? { labelStyleRanges: this.ranges } : {}),
      },
    });
    this.finished = true;
    return {
      ...result,
      changed: Boolean(this.creation) || result.changed,
      selectionIds: [this.nodeId],
    };
  }
  cancel() {
    this.finished = true;
    return this.initial;
  }
  private hasChanges() {
    return (
      this.draft !== this.initialValue ||
      (this.field === "label" &&
        JSON.stringify(
          normalizeMindmapLabelStyleRanges(this.draft, this.ranges)
        ) !== JSON.stringify(this.initialRanges))
    );
  }
}
