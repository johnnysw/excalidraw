import { describe, it, expect, vi, afterEach } from "vitest";
import {
  createMindmapTemplateObject,
  childrenOf,
  addMindmapNode,
  applyMindmapCommand,
  buildMindmapTreeIndex,
  normalizeMindmapSelectionRoots,
  normalizeMindmapObject,
  moveMindmapBranchesBetween,
  splitMindmapBranches,
  pasteMindmapExchangeBranches,
  resolveMindmapRenderData,
  resolveMindmapNodeContentGeometry,
  resolveMindmapObjectGeometry,
  configureMindmapTextMetrics,
  registerMindmapTextMetrics,
  MindmapEditSession,
  MindmapExchangeCodec,
  duplicateMindmapObject,
  collectMindmapResourceIds,
  resolveMindmapNodeVisualStyle,
  scaleMindmapForTransform,
  MINDMAP_THEMES,
  normalizeMindmapLabelStyleRanges,
  replaceMindmapText,
  parseMindmapHtmlText,
  resolveMindmapDropIntent,
  resolveMindmapKeyboardDecision,
  isMindmapComposing,
  resolveMindmapSplitCandidate,
  searchMindmap,
  expandMindmapForSearch,
  replaceMindmapSearchMatches,
  reconcileMindmapTextChange,
  resolveMindmapProfessionalEdit,
  type MindmapObject,
  type MindmapRelation,
} from "../src";
const branches = (object: MindmapObject) =>
  childrenOf(object, object.rootId).map((node) => node.id);
afterEach(() => configureMindmapTextMetrics());
describe("normalized node order identity", () => {
  it("retains valid order while repairing duplicates and missing ids immutably", () => {
    const object = createMindmapTemplateObject();
    expect(normalizeMindmapObject(object).order).toBe(object.order);
    const invalidOrder = [object.order[1], object.order[1], "missing"];
    const invalid = { ...object, order: invalidOrder };
    const normalized = normalizeMindmapObject(invalid);
    expect(normalized.order).not.toBe(invalidOrder);
    expect(new Set(normalized.order).size).toBe(object.order.length);
    expect(normalized.order).toContain(object.rootId);
    expect(invalidOrder).toEqual([object.order[1], object.order[1], "missing"]);
  });
});

describe("geometry cache effective shape signatures", () => {
  it("recomputes when an inherited theme or branch shape changes", () => {
    configureMindmapTextMetrics({
      measure: (text, style) => text.length * style.fontSize * 0.6,
    });
    const map = createMindmapTemplateObject();
    const branch = map.order[1];
    const textTheme = {
      ...MINDMAP_THEMES[0],
      branch: { ...MINDMAP_THEMES[0].branch, shape: "text" as const },
    };
    const rectangleTheme = {
      ...textTheme,
      branch: { ...textTheme.branch, shape: "rectangle" as const },
    };
    const textGeometry = resolveMindmapObjectGeometry({ ...map, theme: textTheme });
    const rectangleGeometry = resolveMindmapObjectGeometry({ ...map, theme: rectangleTheme });
    expect(rectangleGeometry.nodes).not.toBe(textGeometry.nodes);

    const inheritedText = {
      ...map,
      theme: textTheme,
      nodes: {
        ...map.nodes,
        [map.rootId]: {
          ...map.nodes[map.rootId],
          branchStyleOverrides: { shape: "text" as const },
        },
      },
    };
    const inheritedRectangle = {
      ...inheritedText,
      nodes: {
        ...inheritedText.nodes,
        [map.rootId]: {
          ...inheritedText.nodes[map.rootId],
          branchStyleOverrides: { shape: "rectangle" as const },
        },
      },
    };
    const inheritedTextGeometry = resolveMindmapObjectGeometry(inheritedText);
    const inheritedRectangleGeometry = resolveMindmapObjectGeometry(inheritedRectangle);
    expect(inheritedRectangleGeometry.nodes).not.toBe(inheritedTextGeometry.nodes);
  });
});
describe("professional object draft commits", () => {
  const baseline: MindmapRelation = {
    id: "relation",
    sourceId: "a",
    targetId: "b",
    label: "原标注",
    color: "#64748b",
    style: "curve",
    endArrow: true,
  };
  it("keeps latest remote fields and reference for an untouched draft", () => {
    const latest = { ...baseline, label: "远端标注", color: "#f00" };
    const result = resolveMindmapProfessionalEdit(latest, baseline, baseline);
    expect(result.status).toBe("noop");
    expect(result.value).toBe(latest);
  });
  it("merges local fields while preserving concurrent independent changes", () => {
    const latest = { ...baseline, color: "#f00", targetId: "c" };
    const draft = { ...baseline, label: "本地标注" };
    const result = resolveMindmapProfessionalEdit(latest, baseline, draft);
    expect(result.status).toBe("changed");
    expect(result.changedKeys).toEqual(["label"]);
    expect(result.value).toEqual({ ...latest, label: "本地标注" });
    expect(latest.label).toBe("原标注");
  });
  it("rejects same-field conflicts without partially merging the draft", () => {
    const result = resolveMindmapProfessionalEdit(
      { ...baseline, label: "远端标注" },
      baseline,
      { ...baseline, label: "本地标注", color: "#0f0" }
    );
    expect(result.status).toBe("conflict");
    expect(result.value).toBeUndefined();
  });
  it("does not revive deleted objects or change editing identity", () => {
    expect(
      resolveMindmapProfessionalEdit(undefined, baseline, {
        ...baseline,
        label: "本地",
      }).status
    ).toBe("missing");
    expect(
      resolveMindmapProfessionalEdit(
        { ...baseline, id: "another" },
        baseline,
        baseline
      ).status
    ).toBe("missing");
    expect(
      resolveMindmapProfessionalEdit(baseline, baseline, {
        ...baseline,
        id: "another",
      }).status
    ).toBe("conflict");
  });
  it("recognizes converged edits and supports deleting optional local fields", () => {
    const latest = { ...baseline, label: "新标注" };
    expect(
      resolveMindmapProfessionalEdit(latest, baseline, latest).status
    ).toBe("noop");
    const draft = { ...baseline };
    delete draft.color;
    const result = resolveMindmapProfessionalEdit(baseline, baseline, draft);
    expect(result.status).toBe("changed");
    expect(result.value).not.toHaveProperty("color");
  });
});
describe("professional object invalidation", () => {
  const withProfessionalObjects = () => {
    let map = createMindmapTemplateObject();
    const [a, b] = branches(map);
    for (const command of [
      {
        type: "summary" as const,
        value: {
          id: "summary",
          nodeIds: [a, b],
          label: "概要",
          bracketStyle: "curve" as const,
        },
      },
      {
        type: "boundary" as const,
        value: {
          id: "boundary",
          nodeIds: [a],
          title: "外框",
          shape: "rounded-rectangle" as const,
        },
      },
      {
        type: "relation" as const,
        value: {
          id: "relation",
          sourceId: a,
          targetId: b,
          label: "关联",
          style: "curve" as const,
        },
      },
    ])
      map = applyMindmapCommand(map, command).object;
    return map;
  };
  it("paint changes keep node references, positions and cached geometry without new measurements", () => {
    const measure = vi.fn(
      (text: string, style: { fontSize: number }) =>
        text.length * style.fontSize * 0.6
    );
    configureMindmapTextMetrics({ measure });
    let map = withProfessionalObjects();
    const descriptor = resolveMindmapRenderData(map);
    const before = map;
    const count = measure.mock.calls.length;
    for (const command of [
      {
        type: "summary" as const,
        value: {
          ...map.summaries![0],
          color: "#f00",
          lineStyle: "dash" as const,
        },
      },
      {
        type: "boundary" as const,
        value: {
          ...map.boundaries![0],
          stroke: "#0f0",
          fill: "#fff",
          lineStyle: "dot" as const,
        },
      },
      {
        type: "relation" as const,
        value: {
          ...map.relations![0],
          color: "#00f",
          lineStyle: "dash" as const,
        },
      },
    ]) {
      const result = applyMindmapCommand(map, command);
      expect(result.invalidation).toBe("paint");
      expect(result.object.nodes).toBe(before.nodes);
      expect(result.object.order).toBe(before.order);
      for (const id of before.order)
        expect(result.object.nodes[id]).toBe(before.nodes[id]);
      const nextDescriptor = resolveMindmapRenderData(result.object);
      expect(nextDescriptor.geometry.nodes).toBe(descriptor.geometry.nodes);
      expect(measure).toHaveBeenCalledTimes(count);
      map = result.object;
    }
    expect(resolveMindmapRenderData(map).summaries[0].color).toBe("#f00");
    expect(resolveMindmapRenderData(map).boundaries[0].color).toBe("#0f0");
    expect(resolveMindmapRenderData(map).relations[0].color).toBe("#00f");
  });
  it("label changes only measure the new professional label and retain tree layout", () => {
    const measure = vi.fn(
      (text: string, style: { fontSize: number }) =>
        text.length * style.fontSize * 0.6
    );
    configureMindmapTextMetrics({ measure });
    const map = withProfessionalObjects();
    resolveMindmapRenderData(map);
    const count = measure.mock.calls.length;
    const result = applyMindmapCommand(map, {
      type: "summary",
      value: { ...map.summaries![0], label: "很长的新概要标注文字" },
    });
    expect(result.invalidation).toBe("geometry");
    expect(result.object.nodes).toBe(map.nodes);
    expect(result.object.width).toBeGreaterThan(map.width);
    const next = resolveMindmapRenderData(result.object);
    expect(next.summaries[0].label).toBe("很长的新概要标注文字");
    expect(measure.mock.calls.slice(count).map((call) => call[0])).toEqual([
      "很长的新概要标注文字",
    ]);
  });
  it("professional path changes and deletion reframe bounds without resizing saved nodes", () => {
    const map = withProfessionalObjects();
    const positions = map.order.map((id) => [
      map.nodes[id].x,
      map.nodes[id].y,
      map.nodes[id].width,
      map.nodes[id].height,
    ]);
    const path = applyMindmapCommand(map, {
      type: "relation",
      value: { ...map.relations![0], style: "right-angle" },
    });
    expect(path.invalidation).toBe("geometry");
    expect(
      path.object.order.map((id) => [
        path.object.nodes[id].x,
        path.object.nodes[id].y,
        path.object.nodes[id].width,
        path.object.nodes[id].height,
      ])
    ).toEqual(positions);
    expect(resolveMindmapRenderData(path.object).relations[0].path).not.toBe(
      resolveMindmapRenderData(map).relations[0].path
    );
    const removed = applyMindmapCommand(path.object, {
      type: "remove-professional",
      id: "summary",
    });
    expect(removed.invalidation).toBe("geometry");
    expect(removed.object.summaries).toEqual([]);
    expect(
      removed.object.order.map((id) => [
        removed.object.nodes[id].width,
        removed.object.nodes[id].height,
      ])
    ).toEqual(
      map.order.map((id) => [map.nodes[id].width, map.nodes[id].height])
    );
    expect(
      applyMindmapCommand(removed.object, {
        type: "remove-professional",
        id: "missing",
      }).object
    ).toBe(removed.object);
  });
});
describe("shared editing and layout contracts", () => {
  it("inserts a sibling immediately after the anchor subtree", () => {
    let map = createMindmapTemplateObject();
    const [a, b, c] = branches(map);
    map = addMindmapNode(map, a);
    const descendant = childrenOf(map, a)[0].id;
    const result = applyMindmapCommand(map, {
      type: "add",
      anchorId: a,
      relation: "sibling",
      nodeId: "new",
    });
    expect(branches(result.object)).toEqual([a, "new", b, c]);
    expect(result.object.order.indexOf("new")).toBeGreaterThan(
      result.object.order.indexOf(descendant)
    );
    expect(result.selectionIds).toEqual(["new"]);
  });
  it("cancels pending creation without altering source and submits creation+label together", () => {
    const map = createMindmapTemplateObject();
    const session = new MindmapEditSession(map, "draft", "label", {
      type: "add",
      anchorId: map.rootId,
      nodeId: "draft",
    });
    session.update("新主题");
    expect(session.preview().nodes.draft.label).toBe("新主题");
    expect(map.nodes.draft).toBeUndefined();
    expect(session.cancel()).toBe(map);
    const committed = new MindmapEditSession(map, "draft", "label", {
      type: "add",
      anchorId: map.rootId,
      nodeId: "draft",
    });
    committed.update("最终主题");
    const result = committed.commit()!;
    expect(result.changed).toBe(true);
    expect(result.object.nodes.draft.label).toBe("最终主题");
    expect(committed.commit()).toBeUndefined();
  });
  it("rebases text onto latest unrelated properties and refuses deleted targets", () => {
    const map = createMindmapTemplateObject(),
      id = branches(map)[0],
      session = new MindmapEditSession(map, id);
    session.update("编辑完成");
    const latest = applyMindmapCommand(map, {
      type: "patch",
      nodeIds: [id],
      patch: { color: "#f00" },
    }).object;
    expect(session.commit(latest)!.object.nodes[id].color).toBe("#f00");
    const deleted = new MindmapEditSession(map, id);
    expect(
      deleted.commit(
        applyMindmapCommand(map, { type: "remove", nodeIds: [id] }).object
      )
    ).toBeUndefined();
  });
  it("no local editing change keeps the latest text and creates no document operation", () => {
    const map = createMindmapTemplateObject(),
      id = branches(map)[0];
    const session = new MindmapEditSession(map, id);
    const latest = applyMindmapCommand(map, {
      type: "patch",
      nodeIds: [id],
      patch: {
        label: "远端文字",
        labelStyleRanges: [{ start: 0, end: 2, bold: true }],
      },
    }).object;
    expect(session.preview()).toBe(map);
    const committed = session.commit(latest)!;
    expect(committed.object).toBe(latest);
    expect(committed.changed).toBe(false);
    expect(committed.invalidation).toBe("none");
  });
  it("cancels local text edits when the same text or local formatting changed remotely", () => {
    const map = createMindmapTemplateObject(),
      id = branches(map)[0];
    for (const patch of [
      { label: "远端文字" },
      { labelStyleRanges: [{ start: 0, end: 2, bold: true }] },
    ]) {
      const session = new MindmapEditSession(map, id);
      session.update("本地文字");
      const latest = applyMindmapCommand(map, {
        type: "patch",
        nodeIds: [id],
        patch,
      }).object;
      expect(session.commit(latest)).toBeUndefined();
      expect(session.active).toBe(false);
    }
  });
  it("keeps pending creation identity even if the caller omits command.nodeId", () => {
    const map = createMindmapTemplateObject();
    const session = new MindmapEditSession(map, "stable-draft", "label", {
      type: "add",
      anchorId: map.rootId,
    });
    expect(session.preview().nodes["stable-draft"]).toBeDefined();
    session.update("稳定主题");
    expect(session.commit(map)?.object.nodes["stable-draft"].label).toBe(
      "稳定主题"
    );
  });
  it("indexes descendants once and removes nested selection roots", () => {
    let map = createMindmapTemplateObject();
    const a = branches(map)[0];
    map = addMindmapNode(map, a);
    const child = childrenOf(map, a)[0].id;
    expect(buildMindmapTreeIndex(map)).toBe(buildMindmapTreeIndex(map));
    expect(normalizeMindmapSelectionRoots(map, [child, a, a])).toEqual([a]);
  });
  it("wraps new content but leaves legacy saved dimensions and labels unchanged", () => {
    const map = createMindmapTemplateObject(),
      id = branches(map)[0];
    const legacy = {
      ...map,
      nodes: {
        ...map.nodes,
        [id]: {
          ...map.nodes[id],
          widthMode: undefined,
          textMaxWidth: undefined,
          label: "旧文字".repeat(150),
          width: 144,
          height: 44,
        },
      },
    };
    const read = normalizeMindmapObject(legacy);
    expect(read.nodes[id].width).toBe(144);
    expect(read.nodes[id].height).toBe(44);
    expect(read.nodes[id].label).toBe(legacy.nodes[id].label);
    const content = resolveMindmapNodeContentGeometry({
      label: "中文长文字".repeat(30),
      widthMode: "auto",
      textMaxWidth: 80,
    });
    expect(content.labelLines.length).toBeGreaterThan(3);
    expect(content.label.width).toBeLessThanOrEqual(84);
  });
  it("fixed width reflows without splitting an emoji grapheme", () => {
    const content = resolveMindmapNodeContentGeometry({
      label: "👨‍👩‍👧‍👦中文 hello world",
      widthMode: "fixed",
      textMaxWidth: 100,
      fontSize: 14,
    });
    expect(content.labelLines.join("")).toBe("👨‍👩‍👧‍👦中文 hello world");
    expect(content.labelLines[0]).toContain("👨‍👩‍👧‍👦");
    expect(content.width).toBe(124);
  });
  it("resolves measured and painted depth styles consistently", () => {
    let map = createMindmapTemplateObject();
    let id = branches(map)[0];
    for (let depth = 2; depth <= 4; depth++) {
      map = addMindmapNode(map, id);
      id = childrenOf(map, id)[0].id;
    }
    const data = resolveMindmapRenderData(map);
    for (const entry of data.nodes) {
      expect(entry.content.labelLineHeight).toBe(entry.style.fontSize * 1.4);
    }
  });
  it("does not measure again for color changes or viewport-independent renders", () => {
    const measure = vi.fn(
      (text: string, style: { fontSize: number }) =>
        text.length * style.fontSize * 0.6
    );
    configureMindmapTextMetrics({ measure });
    const map = createMindmapTemplateObject();
    resolveMindmapRenderData(map);
    const count = measure.mock.calls.length;
    const result = applyMindmapCommand(map, {
      type: "patch",
      nodeIds: [branches(map)[0]],
      patch: { color: "#00ff00", fill: "#fff" },
    });
    expect(result.invalidation).toBe("paint");
    resolveMindmapRenderData(result.object);
    expect(measure).toHaveBeenCalledTimes(count);
    resolveMindmapRenderData({
      ...result.object,
      x: map.x + 10,
      y: map.y + 20,
    });
    expect(measure).toHaveBeenCalledTimes(count);
  });
  it("preserves explicit style over branch inheritance over theme", () => {
    let map = createMindmapTemplateObject();
    const a = branches(map)[0];
    map = addMindmapNode(map, a);
    const child = childrenOf(map, a)[0].id;
    map = {
      ...map,
      theme: MINDMAP_THEMES[3],
      nodes: {
        ...map.nodes,
        [a]: { ...map.nodes[a], branchStyleOverrides: { color: "#00ff00" } },
        [child]: { ...map.nodes[child], fill: "#fa0" },
      },
    };
    const style = resolveMindmapNodeVisualStyle(map.nodes[child], 2, map);
    expect(style.color).toBe("#00ff00");
    expect(style.fill).toBe("#fa0");
    const themed = applyMindmapCommand(createMindmapTemplateObject(), {
      type: "theme",
      theme: MINDMAP_THEMES[3],
    }).object;
    expect(
      resolveMindmapRenderData(themed).nodes.find(
        (n) => n.node.id === themed.rootId
      )!.style.fill
    ).toBe("#334155");
  });
  it("scales inherited branch style preferences for future nodes and honors inherited outline style", () => {
    const map = createMindmapTemplateObject();
    const styled = applyMindmapCommand(map, {
      type: "patch",
      nodeIds: [map.rootId],
      scope: "branch",
      patch: { fontSize: 20, strokeWidth: 4, lineStyle: "dash" },
    }).object;
    const scaled = scaleMindmapForTransform(styled, {
      x: styled.x,
      y: styled.y,
      width: styled.width * 2,
      height: styled.height * 2,
      rotation: 0,
    });
    const next = applyMindmapCommand(scaled, {
      type: "add",
      anchorId: scaled.rootId,
    }).object;
    const nodeId = next.order.find((id) => !scaled.nodes[id])!;
    const visual = resolveMindmapNodeVisualStyle(next.nodes[nodeId], 1, next);
    expect(visual.fontSize).toBe(40);
    expect(visual.strokeWidth).toBe(8);
    expect(visual.lineStyle).toBe("dash");
    expect(
      resolveMindmapNodeVisualStyle(
        { ...next.nodes[nodeId], lineStyle: "solid" },
        1,
        next
      ).lineStyle
    ).toBe("solid");
    expect(styled.nodes[styled.rootId].branchStyleOverrides?.fontSize).toBe(20);
  });
  it("supplies each colorful theme branch and its descendants with a stable drawing color", () => {
    let map = createMindmapTemplateObject(),
      first = branches(map)[0];
    map = addMindmapNode(map, first);
    const themed = applyMindmapCommand(map, {
      type: "theme",
      theme: MINDMAP_THEMES[2],
    }).object;
    const data = resolveMindmapRenderData(themed);
    const child = childrenOf(themed, first)[0].id;
    expect(
      data.branches.find((branch) => branch.id === `${themed.rootId}->${first}`)
        ?.color
    ).toBe(MINDMAP_THEMES[2].branchColors[0]);
    expect(
      data.branches.find((branch) => branch.id === `${first}->${child}`)?.color
    ).toBe(MINDMAP_THEMES[2].branchColors[0]);
    const second = branches(map)[1];
    expect(
      data.branches.find(
        (branch) => branch.id === `${themed.rootId}->${second}`
      )?.color
    ).toBe(MINDMAP_THEMES[2].branchColors[1]);
  });
  it("manual movement shifts the entire selected branch without changing parentage", () => {
    let map = createMindmapTemplateObject();
    const a = branches(map)[0];
    map = addMindmapNode(map, a);
    const child = childrenOf(map, a)[0].id;
    const before = {
      x: map.x + map.nodes[child].x!,
      y: map.y + map.nodes[child].y!,
    };
    const next = applyMindmapCommand(map, {
      type: "manual-position",
      nodeIds: [a, child],
      dx: 90,
      dy: 50,
    }).object;
    expect(next.x + next.nodes[child].x! - before.x).toBeCloseTo(90);
    expect(next.y + next.nodes[child].y! - before.y).toBeCloseTo(50);
    expect(next.nodes[child].parentId).toBe(a);
    expect(next.nodes[map.rootId]).toBe(map.nodes[map.rootId]);
    expect(next.nodes[a].width).toBe(map.nodes[a].width);
    expect(next.nodes[a].height).toBe(map.nodes[a].height);
    expect(
      applyMindmapCommand(map, {
        type: "manual-position",
        nodeIds: [a],
        dx: 0,
        dy: 0,
      }).object
    ).toBe(map);
  });
  it("no-op and locked commands produce no modification", () => {
    const map = createMindmapTemplateObject(),
      id = branches(map)[0];
    expect(
      applyMindmapCommand(map, {
        type: "patch",
        nodeIds: [id],
        patch: { label: map.nodes[id].label },
      }).object
    ).toBe(map);
    expect(
      applyMindmapCommand(
        { ...map, locked: true },
        { type: "remove", nodeIds: [id] }
      ).changed
    ).toBe(false);
  });
  it("keeps Enter submit and IME keys separate from structure insertion", () => {
    expect(
      resolveMindmapKeyboardDecision({ key: "Enter", editing: "label" })
    ).toBe("commit");
    expect(
      resolveMindmapKeyboardDecision({ key: "Enter", isRoot: false })
    ).toBe("add-sibling");
    expect(
      resolveMindmapKeyboardDecision({ key: "Tab", editing: "label" })
    ).toBe("commit-add-child");
    expect(
      resolveMindmapKeyboardDecision({ key: "Enter", composing: true })
    ).toBe("none");
    expect(isMindmapComposing({ keyCode: 229 })).toBe(true);
  });
});
describe("professional objects, transfer and exchange", () => {
  it("maintains valid ranges and prunes invalid summaries when topology changes", () => {
    let map = createMindmapTemplateObject();
    const [a, b, c] = branches(map);
    map = applyMindmapCommand(map, {
      type: "summary",
      value: { id: "summary", nodeIds: [a, b], label: "概要" },
    }).object;
    expect(map.summaries).toHaveLength(1);
    const changed = applyMindmapCommand(map, {
      type: "move",
      nodeIds: [b],
      target: { parentId: a },
    });
    expect(changed.removedSummaryIds).toEqual(["summary"]);
    expect(changed.object.summaries).toHaveLength(0);
    expect(
      applyMindmapCommand(map, {
        type: "summary",
        value: { id: "bad", nodeIds: [a, c], label: "不连续" },
      }).object.summaries
    ).toHaveLength(1);
  });
  it("includes professional labels and shapes in render/export bounds", () => {
    let map = createMindmapTemplateObject();
    const [a, b] = branches(map);
    map = applyMindmapCommand(map, {
      type: "boundary",
      value: { id: "boundary", nodeIds: [a, b], title: "知识分组" },
    }).object;
    map = applyMindmapCommand(map, {
      type: "summary",
      value: { id: "summary", nodeIds: [a, b], label: "共同结论" },
    }).object;
    map = applyMindmapCommand(map, {
      type: "relation",
      value: { id: "rel", sourceId: a, targetId: b, label: "比较" },
    }).object;
    const data = resolveMindmapRenderData(map);
    expect(data.boundaries).toHaveLength(1);
    expect(data.summaries).toHaveLength(1);
    expect(data.relations).toHaveLength(1);
    for (const shape of [
      ...data.boundaries,
      ...data.summaries,
      ...data.relations,
    ]) {
      expect(shape.path).not.toContain("NaN");
      expect(shape.bounds.x + shape.bounds.width).toBeLessThanOrEqual(
        data.geometry.bounds.x + data.geometry.bounds.width + 0.001
      );
    }
  });
  it("retains hidden node relation binding and restores it on expansion", () => {
    let map = createMindmapTemplateObject();
    const [a, b] = branches(map);
    map = addMindmapNode(map, a);
    const child = childrenOf(map, a)[0].id;
    map = { ...map, relations: [{ id: "rel", sourceId: child, targetId: b }] };
    map = applyMindmapCommand(map, {
      type: "collapse",
      nodeIds: [a],
      collapsed: true,
    }).object;
    expect(map.relations![0].sourceId).toBe(child);
    expect(resolveMindmapRenderData(map).relations).toHaveLength(1);
    expect(resolveMindmapRenderData(map).geometry.nodes[child]).toBeUndefined();
  });
  it("moves IDs and resources intact, scales explicit values, exports split relations", () => {
    let source = createMindmapTemplateObject();
    const [a, b] = branches(source);
    source = addMindmapNode(source, a);
    const child = childrenOf(source, a)[0].id;
    source = {
      ...source,
      nodes: {
        ...source.nodes,
        [a]: {
          ...source.nodes[a],
          fontSize: 16,
          imageAssetId: "image",
          textMaxWidth: 80,
        },
      },
      relations: [
        { id: "inside", sourceId: a, targetId: child },
        { id: "cross", sourceId: a, targetId: b },
      ],
    };
    const target = { ...createMindmapTemplateObject(), layoutScale: 2 };
    const moved = moveMindmapBranchesBetween(source, target, [a, child], {
      parentId: target.rootId,
    })!;
    expect(moved.source.nodes[a]).toBeUndefined();
    expect(moved.target.nodes[a].imageAssetId).toBe("image");
    expect(moved.target.nodes[a].fontSize).toBe(32);
    expect(moved.target.nodes[a].textMaxWidth).toBe(160);
    expect(moved.ownerChanges).toHaveLength(2);
    expect(moved.target.relations![0].sourceId).toBe(a);
    expect(moved.externalRelations[0].targetMapId).toBe(source.id);
  });
  it("only remaps colliding IDs while moving and rewrites internal refs", () => {
    let source = createMindmapTemplateObject();
    const a = branches(source)[0];
    source = addMindmapNode(source, a);
    const child = childrenOf(source, a)[0].id;
    source = {
      ...source,
      relations: [{ id: "rel", sourceId: a, targetId: child }],
    };
    const target = createMindmapTemplateObject();
    target.nodes[a] = { ...source.nodes[a], parentId: target.rootId };
    target.order.push(a);
    const result = moveMindmapBranchesBetween(source, target, [a], {
      parentId: target.rootId,
    })!;
    expect(result.nodeIdMap[a]).not.toBe(a);
    expect(result.nodeIdMap[child]).toBe(child);
    expect(result.target.nodes[child].parentId).toBe(result.nodeIdMap[a]);
    expect(result.target.relations![0].sourceId).toBe(result.nodeIdMap[a]);
  });
  it("splits single roots directly and multiple roots under a center", () => {
    const source = {
      ...createMindmapTemplateObject(),
      rotation: 40,
      flipX: true,
    };
    const [a, b] = branches(source);
    const single = splitMindmapBranches(source, [a])!;
    expect(single.target.rootId).toBe(a);
    expect(single.target.nodes[a].parentId).toBeNull();
    expect(single.target.rotation).toBe(40);
    expect(single.target.flipX).toBe(true);
    const multi = splitMindmapBranches(source, [a, b])!;
    expect(
      childrenOf(multi.target, multi.target.rootId).map((n) => n.id)
    ).toEqual([a, b]);
  });
  it("JSON round-trips collapsed resources and duplicates every reference", () => {
    const map = createMindmapTemplateObject(),
      [a, b] = branches(map);
    const source = {
      ...map,
      nodes: {
        ...map.nodes,
        [a]: { ...map.nodes[a], imageAssetId: "image", collapsed: true },
      },
      relations: [{ id: "relation", sourceId: a, targetId: b }],
      summaries: [{ id: "summary", nodeIds: [a, b], label: "概要" }],
    };
    const resources = {
      image: {
        id: "image",
        mimeType: "image/png",
        dataURL: "data:image/png;base64,YQ==",
      },
    };
    const payload = MindmapExchangeCodec.parse(
      MindmapExchangeCodec.serialize(source, resources)
    );
    expect(collectMindmapResourceIds(payload.object)).toEqual(["image"]);
    expect(payload.resources).toEqual(resources);
    const duplicate = duplicateMindmapObject(source);
    expect(duplicate.object.relations![0].sourceId).toBe(
      duplicate.nodeIdMap[a]
    );
    expect(duplicate.object.summaries![0].id).not.toBe("summary");
  });
  it("strictly round-trips and remaps a complete professional rich-text image fixture", () => {
    let map = createMindmapTemplateObject();
    const [a, b, c] = branches(map);
    map = addMindmapNode(map, a, "child", "折叠图片文字");
    const hidden = childrenOf(map, a)[0].id;
    const fixture = normalizeMindmapObject({
      ...map,
      rotation: 35,
      flipX: true,
      layoutScale: 1.6,
      theme: structuredClone(MINDMAP_THEMES[2]),
      nodes: {
        ...map.nodes,
        [map.rootId]: {
          ...map.nodes[map.rootId],
          label: "知识中心主题",
          widthMode: "fixed",
          textMaxWidth: 190,
          labelStyleRanges: [
            { start: 1, end: 4, color: "#16a34a", bold: false, italic: true,
              underline: true, strikethrough: true },
          ],
          branchStyleOverrides: { fontSize: 22, strokeWidth: 3, color: "#334155" },
        },
        [a]: { ...map.nodes[a], collapsed: true, summary: "节点描述" },
        [b]: {
          ...map.nodes[b], widthMode: "auto", textMaxWidth: 512,
          link: "https://example.com/topic", tags: ["重点", "知识点"],
          shape: "ellipse", fill: "#cffafe", color: "#0f172a",
          stroke: "#0369a1", strokeWidth: 4, opacity: 0.7,
          fontSize: 24, fontStyle: "italic", align: "right",
          labelStyleRanges: [{ start: 0, end: 2, bold: true }],
        },
        [hidden]: {
          ...map.nodes[hidden], imageAssetId: "folded-image", imageWidth: 160,
          imageHeight: 120, imagePlacement: "left", icon: "mdi:book-open",
          sticker: "star", link: "https://example.com/image", tags: ["隐藏"],
        },
      },
      summaries: [{ id: "complete-summary", nodeIds: [a, b], label: "连续分支概要",
        color: "#16a34a", lineStyle: "dash", bracketStyle: "curve" }],
      boundaries: [{ id: "complete-boundary", nodeIds: [a, hidden], title: "折叠分组",
        shape: "rounded-rectangle", fill: "#ecfdf5", stroke: "#059669", lineStyle: "dot" }],
      relations: [{ id: "complete-relation", sourceId: hidden, targetId: c,
        label: "隐藏节点关联", color: "#f97316", style: "round-angle",
        lineStyle: "dash", startArrow: true, endArrow: true }],
    });
    const resources = {
      "folded-image": { id: "folded-image", mimeType: "image/png", dataURL: "data:image/png;base64,YQ==" },
    };
    const serialized = MindmapExchangeCodec.serialize(fixture, resources);
    const parsed = MindmapExchangeCodec.parse(serialized);
    expect(parsed.object).toStrictEqual(fixture);
    expect(parsed.resources).toStrictEqual(resources);
    expect(parsed.rootNodeIds).toEqual([fixture.rootId]);
    expect(parsed.warnings).toEqual([]);
    const originalRender = resolveMindmapRenderData(fixture);
    const restoredRender = resolveMindmapRenderData(parsed.object);
    expect(restoredRender).toStrictEqual(originalRender);
    expect(restoredRender.geometry.nodes[hidden]).toBeUndefined();
    expect(collectMindmapResourceIds(parsed.object)).toEqual(["folded-image"]);

    const { object: copied, nodeIdMap } = duplicateMindmapObject(parsed.object, {
      mapId: "copied-complete-map", resourceIdMap: { "folded-image": "imported-image" },
    });
    expect(copied.rootId).toBe(nodeIdMap[fixture.rootId]);
    expect(copied.order).toEqual(fixture.order.map((id) => nodeIdMap[id]));
    expect(copied.theme).toStrictEqual(fixture.theme);
    expect(copied.theme).not.toBe(fixture.theme);
    for (const [id, node] of Object.entries(fixture.nodes)) {
      expect(nodeIdMap[id]).not.toBe(id);
      expect(copied.nodes[nodeIdMap[id]]).toStrictEqual({
        ...node, id: nodeIdMap[id], parentId: node.parentId ? nodeIdMap[node.parentId] : null,
        ...(node.imageAssetId ? { imageAssetId: "imported-image" } : {}),
      });
    }
    for (const key of ["summaries", "boundaries"] as const) {
      expect(copied[key]).toHaveLength(1);
      expect(copied[key]![0].id).not.toBe(fixture[key]![0].id);
      expect(copied[key]![0]).toStrictEqual({
        ...fixture[key]![0], id: copied[key]![0].id,
        nodeIds: fixture[key]![0].nodeIds.map((id) => nodeIdMap[id]),
      });
    }
    expect(copied.relations![0].id).not.toBe(fixture.relations![0].id);
    expect(copied.relations![0]).toStrictEqual({
      ...fixture.relations![0], id: copied.relations![0].id,
      sourceId: nodeIdMap[hidden], targetId: nodeIdMap[c],
    });
    expect(collectMindmapResourceIds(copied)).toEqual(["imported-image"]);
    const copiedRender = resolveMindmapRenderData(copied);
    for (const key of ["summaries", "boundaries", "relations"] as const)
      expect(copiedRender[key].map(({ path, bounds }) => ({ path, bounds }))).toStrictEqual(
        originalRender[key].map(({ path, bounds }) => ({ path, bounds }))
      );
    const copiedResources = { "imported-image": { ...resources["folded-image"], id: "imported-image" } };
    const reopened = MindmapExchangeCodec.parse(MindmapExchangeCodec.serialize(copied, copiedResources));
    expect(reopened.object).toStrictEqual(copied);
    expect(reopened.resources).toStrictEqual(copiedResources);
    expect(JSON.stringify(fixture)).toBe(JSON.stringify(MindmapExchangeCodec.parse(serialized).object));
  });
  it("pastes forests without an extra synthetic parent", () => {
    const source = createMindmapTemplateObject(),
      [a, b] = branches(source),
      target = createMindmapTemplateObject();
    const payload = MindmapExchangeCodec.parse(
      MindmapExchangeCodec.serialize(source, {}, [a, b])
    );
    const paste = pasteMindmapExchangeBranches(
      target,
      target.rootId,
      payload.object,
      payload.rootNodeIds
    )!;
    expect(childrenOf(paste.target, target.rootId)).toHaveLength(5);
    expect(paste.movedRootIds).toHaveLength(2);
    expect(
      paste.movedRootIds.every(
        (id) => paste.target.nodes[id].parentId === target.rootId
      )
    ).toBe(true);
  });
  it("serializes multi-map selection into a shared portable forest", () => {
    const a = createMindmapTemplateObject(),
      b = createMindmapTemplateObject();
    const payload = MindmapExchangeCodec.parse(
      MindmapExchangeCodec.serializeSelection([a, b], {
        [a.id]: [branches(a)[0]],
        [b.id]: [branches(b)[1]],
      })
    );
    expect(payload.rootNodeIds).toHaveLength(2);
    expect(payload.kind).toBe("branches");
    expect(childrenOf(payload.object, payload.object.rootId)).toHaveLength(2);
  });
  it("normalizes scaled explicit values once when exchanging a multi-map forest", () => {
    const a = createMindmapTemplateObject(),
      b = createMindmapTemplateObject();
    const first = branches(a)[0],
      second = branches(b)[0];
    a.layoutScale = 2;
    b.layoutScale = 0.5;
    a.nodes[first] = {
      ...a.nodes[first],
      fontSize: 36,
      textMaxWidth: 640,
      branchStyleOverrides: { fontSize: 32 },
    };
    b.nodes[second] = {
      ...b.nodes[second],
      fontSize: 9,
      textMaxWidth: 160,
      branchStyleOverrides: { fontSize: 8 },
    };
    const payload = MindmapExchangeCodec.parse(
      MindmapExchangeCodec.serializeSelection([a, b], {
        [a.id]: [first],
        [b.id]: [second],
      })
    );
    expect(
      payload.rootNodeIds.map((id) => payload.object.nodes[id].fontSize)
    ).toEqual([18, 18]);
    expect(
      payload.rootNodeIds.map((id) => payload.object.nodes[id].textMaxWidth)
    ).toEqual([320, 320]);
    const target = { ...createMindmapTemplateObject(), layoutScale: 3 };
    const pasted = pasteMindmapExchangeBranches(
      target,
      target.rootId,
      payload.object,
      payload.rootNodeIds
    )!;
    expect(
      pasted.movedRootIds.map((id) => pasted.target.nodes[id].fontSize)
    ).toEqual([54, 54]);
    expect(
      pasted.movedRootIds.map(
        (id) => pasted.target.nodes[id].branchStyleOverrides?.fontSize
      )
    ).toEqual([48, 48]);
    expect(a.nodes[first].fontSize).toBe(36);
  });
  it("pastes beside the requested sibling in forest order", () => {
    const source = createMindmapTemplateObject(),
      target = createMindmapTemplateObject();
    const copied = branches(source).slice(0, 2),
      [first, second, third] = branches(target);
    const payload = MindmapExchangeCodec.parse(
      MindmapExchangeCodec.serialize(source, {}, copied)
    );
    const pasted = pasteMindmapExchangeBranches(
      target,
      target.rootId,
      payload.object,
      payload.rootNodeIds,
      { siblingId: first, position: "after" }
    )!;
    expect(branches(pasted.target)).toEqual([
      first,
      ...pasted.movedRootIds,
      second,
      third,
    ]);
  });
  it("imports Markdown and indentation into editable structure with links and format", () => {
    const { object } = MindmapExchangeCodec.parseMarkdown(
      "# 中心\n- **主题一**\n  - [资料](https://example.com)\n- 主题二"
    );
    expect(object.nodes[object.rootId].label).toBe("中心");
    const [a, b] = branches(object);
    expect(object.nodes[a].labelStyleRanges![0].bold).toBe(true);
    expect(childrenOf(object, a)[0].link).toBe("https://example.com");
    expect(MindmapExchangeCodec.toMarkdown(object)).toContain(
      "https://example.com"
    );
    expect(object.nodes[b].label).toBe("主题二");
  });
  it("imports a real single center topic without treating its title as a synthetic root", () => {
    const parsed = MindmapExchangeCodec.parseMarkdown("# 中心主题");
    expect(parsed.rootNodeIds).toEqual([parsed.object.rootId]);
    const target = createMindmapTemplateObject();
    const pasted = pasteMindmapExchangeBranches(
      target,
      target.rootId,
      parsed.object,
      parsed.rootNodeIds
    )!;
    expect(pasted.movedRootIds).toHaveLength(1);
    expect(pasted.target.nodes[pasted.movedRootIds[0]].label).toBe("中心主题");
  });
  it("preserves the nested subtree beneath a real center topic", () => {
    const parsed = MindmapExchangeCodec.parseMarkdown(
      "# **中心主题**\n- 子主题\n  - 后代"
    );
    expect(parsed.rootNodeIds).toEqual([parsed.object.rootId]);
    expect(parsed.object.nodes[parsed.object.rootId].labelStyleRanges).toContainEqual(
      { start: 0, end: 4, bold: true }
    );
    const target = createMindmapTemplateObject();
    const pasted = pasteMindmapExchangeBranches(
      target,
      target.rootId,
      parsed.object,
      parsed.rootNodeIds
    )!;
    const root = pasted.target.nodes[pasted.movedRootIds[0]];
    const child = childrenOf(pasted.target, root.id)[0];
    expect(root.label).toBe("中心主题");
    expect(child.label).toBe("子主题");
    expect(childrenOf(pasted.target, child.id)[0].label).toBe("后代");
  });
  it("imports multiple top-level topics without pasting their synthetic center", () => {
    const parsed = MindmapExchangeCodec.parseMarkdown(
      "# 主题甲\n- 子主题\n# 主题乙"
    );
    expect(parsed.object.nodes[parsed.object.rootId].label).toBe("中心主题");
    expect(parsed.rootNodeIds).toEqual(branches(parsed.object));
    const target = createMindmapTemplateObject();
    const pasted = pasteMindmapExchangeBranches(
      target,
      target.rootId,
      parsed.object,
      parsed.rootNodeIds
    )!;
    expect(pasted.movedRootIds.map((id) => pasted.target.nodes[id].label)).toEqual(
      ["主题甲", "主题乙"]
    );
    expect(childrenOf(pasted.target, pasted.movedRootIds[0])[0].label).toBe("子主题");
  });
  it("rejects invalid JSON models before host resource or commit work", () => {
    expect(() =>
      MindmapExchangeCodec.parse('{"format":"mindmap","object":{}}')
    ).toThrow("缺少");
    expect(() => MindmapExchangeCodec.parse("broken")).toThrow("格式");
  });
  it("rejects malformed geometry, cyclic references and incomplete theme snapshots on import", () => {
    const map = createMindmapTemplateObject(),
      [a, b] = branches(map);
    const invalid = [
      { ...map, x: "foo" },
      { ...map, nodes: {}, order: [] },
      { ...map, theme: { id: "broken", root: null } },
      {
        ...map,
        nodes: {
          ...map.nodes,
          [a]: { ...map.nodes[a], parentId: b },
          [b]: { ...map.nodes[b], parentId: a },
        },
      },
      {
        ...map,
        relations: [{ id: "relation", sourceId: a, targetId: "missing" }],
      },
    ];
    for (const object of invalid)
      expect(() =>
        MindmapExchangeCodec.parse(
          JSON.stringify({
            format: "mindmap",
            kind: "map",
            object,
            resources: {},
          })
        )
      ).toThrow();
    const old = structuredClone(map);
    for (const node of Object.values(old.nodes)) {
      delete node.widthMode;
      delete node.textMaxWidth;
    }
    const read = MindmapExchangeCodec.parse(
      MindmapExchangeCodec.serialize(old)
    );
    expect(read.object.nodes[a].x).toBe(old.nodes[a].x);
    expect(read.object.nodes[a].width).toBe(old.nodes[a].width);
  });
  it("round-trips Markdown literal punctuation alongside supported inline formats and links", () => {
    const map = createMindmapTemplateObject(),
      id = branches(map)[0];
    const label = "2 * 3 * 4 [x](y) <u> \\ _ ~";
    map.nodes[id] = {
      ...map.nodes[id],
      label,
      fontStyle: "italic",
      labelStyleRanges: [{ start: 0, end: 5, bold: true }],
      link: "https://example.com/a(b)",
    };
    const imported = MindmapExchangeCodec.parseMarkdown(
      MindmapExchangeCodec.toMarkdown(map)
    ).object;
    const node = childrenOf(imported, imported.rootId)[0];
    expect(node.label).toBe(label);
    expect(node.link).toBe("https://example.com/a(b)");
    expect(
      node.labelStyleRanges?.some((range) => range.bold && range.italic)
    ).toBe(true);
  });
  it("converts unsupported fenced code into literal text instead of interpreting format markers", () => {
    const { object, warnings } = MindmapExchangeCodec.parseMarkdown(
      "```js\n2 * 3 * 4 [x](y)\n```"
    );
    expect(object.nodes[object.rootId].label).toBe("2 * 3 * 4 [x](y)");
    expect(warnings).not.toHaveLength(0);
    expect(object.nodes[object.rootId].labelStyleRanges).toEqual([]);
  });
  it("renders finite internal relation geometry when manually placed node centers coincide", () => {
    const map = createMindmapTemplateObject(),
      [a, b] = branches(map);
    const overlap = {
      ...map,
      nodes: {
        ...map.nodes,
        [b]: {
          ...map.nodes[b],
          x: map.nodes[a].x,
          y: map.nodes[a].y,
          width: map.nodes[a].width,
          height: map.nodes[a].height,
        },
      },
      relations: [{ id: "relation", sourceId: a, targetId: b }],
    };
    const data = resolveMindmapRenderData(overlap);
    expect(data.relations[0].path).not.toMatch(/NaN|Infinity/);
    expect(Object.values(data.relations[0].bounds).every(Number.isFinite)).toBe(
      true
    );
    expect(Object.values(data.geometry.bounds).every(Number.isFinite)).toBe(
      true
    );
  });
});
describe("rich text and pointer semantics", () => {
  it("normalizes overlapping ranges and snaps to a grapheme", () => {
    const label = "A👨‍👩‍👧‍👦B";
    const normalized = normalizeMindmapLabelStyleRanges(label, [
      { start: 2, end: 4, bold: true },
      { start: 1, end: 12, color: "#0f0" },
    ]);
    expect(normalized[0].start).toBe(1);
    expect(normalized.every((range) => range.end <= label.length)).toBe(true);
  });
  it("transforms ranges when inserting and deleting", () => {
    const edit = replaceMindmapText(
      "abcdef",
      [{ start: 0, end: 6, bold: true }],
      2,
      4,
      "X",
      { italic: true }
    );
    expect(edit.label).toBe("abXef");
    expect(edit.labelStyleRanges).toEqual([
      { start: 0, end: 2, bold: true },
      { start: 2, end: 3, italic: true },
      { start: 3, end: 5, bold: true },
    ]);
  });
  it("keeps underline and strike together and strips unsafe HTML", () => {
    const parsed = parseMindmapHtmlText(
      "<p><b>Hello</b> <u><s>world</s></u><script>alert(1)</script></p>"
    );
    expect(parsed.label).toBe("Hello world");
    const style = parsed.labelStyleRanges.find((range) => range.start === 6)!;
    expect(style.underline).toBe(true);
    expect(style.strikethrough).toBe(true);
  });
  it.each(["normal", "400"])(
    "preserves an explicit %s weight that overrides inherited bold",
    (weight) => {
      const parsed = parseMindmapHtmlText(
        `<b>甲<span style="font-weight:${weight}">乙</span>丙</b>`
      );
      expect(parsed.label).toBe("甲乙丙");
      expect(parsed.labelStyleRanges).toEqual([
        { start: 0, end: 1, bold: true },
        { start: 1, end: 2, bold: false },
        { start: 2, end: 3, bold: true },
      ]);
      expect(
        parseMindmapHtmlText(`<span style="font-weight:${weight}">乙</span>`)
          .labelStyleRanges
      ).toEqual([{ start: 0, end: 1, bold: false }]);
    }
  );
  it("preserves normal font style over an inherited italic tag", () => {
    const parsed = parseMindmapHtmlText(
      '<i>甲<span style="font-style:normal">乙</span>丙</i>'
    );
    expect(parsed.labelStyleRanges).toEqual([
      { start: 0, end: 1, italic: true },
      { start: 1, end: 2, italic: false },
      { start: 2, end: 3, italic: true },
    ]);
  });
  it("preserves both decoration flags across explicit none and partial overrides", () => {
    const parsed = parseMindmapHtmlText(
      '<u><s>甲<span style="text-decoration:none">乙</span>' +
        '<span style="text-decoration-line:underline">丙</span>丁</s></u>'
    );
    expect(parsed.label).toBe("甲乙丙丁");
    expect(parsed.labelStyleRanges).toEqual([
      { start: 0, end: 1, underline: true, strikethrough: true },
      { start: 1, end: 2, underline: false, strikethrough: false },
      { start: 2, end: 3, underline: true, strikethrough: false },
      { start: 3, end: 4, underline: true, strikethrough: true },
    ]);
  });
  it("distinguishes center and edge drop zones and excludes root reorder", () => {
    const map = createMindmapTemplateObject(),
      geometry = resolveMindmapObjectGeometry(map),
      id = branches(map)[0],
      node = geometry.nodes[id],
      bounds = { x: 0, y: 0, width: 100, height: 80 };
    expect(
      resolveMindmapDropIntent({
        point: { x: 50, y: 5 },
        node,
        bounds,
        rootId: map.rootId,
      })!.kind
    ).toBe("before");
    expect(
      resolveMindmapDropIntent({
        point: { x: 50, y: 40 },
        node,
        bounds,
        rootId: map.rootId,
      })!.kind
    ).toBe("inside");
    expect(
      resolveMindmapDropIntent({
        point: { x: 50, y: 75 },
        node,
        bounds,
        rootId: map.rootId,
      })!.kind
    ).toBe("after");
    expect(
      resolveMindmapDropIntent({
        point: { x: 50, y: 5 },
        node: geometry.nodes[map.rootId],
        bounds,
        rootId: map.rootId,
      })!.kind
    ).toBe("inside");
  });
  it("only enables split outside every padded map and sufficiently far from start", () => {
    expect(
      resolveMindmapSplitCandidate({ x: 200, y: 200 }, { x: 0, y: 0 }, [
        { x: 0, y: 0, width: 100, height: 100 },
      ])
    ).toBe(true);
    expect(
      resolveMindmapSplitCandidate({ x: 120, y: 100 }, { x: 0, y: 0 }, [
        { x: 0, y: 0, width: 100, height: 100 },
      ])
    ).toBe(false);
  });
});

describe("search and style inheritance", () => {
  it("searches hidden descriptions and tags while keeping expansion transient", () => {
    let map = createMindmapTemplateObject();
    const a = branches(map)[0];
    map = addMindmapNode(map, a);
    const child = childrenOf(map, a)[0].id;
    map = applyMindmapCommand(map, {
      type: "patch",
      nodeIds: [child],
      patch: { label: "知识点", summary: "搜索描述", tags: ["搜索标签"] },
    }).object;
    map = applyMindmapCommand(map, {
      type: "collapse",
      nodeIds: [a],
      collapsed: true,
    }).object;
    expect(searchMindmap(map, "搜索")).toHaveLength(2);
    const preview = expandMindmapForSearch(map, child);
    expect(preview.nodes[a].collapsed).toBe(false);
    expect(map.nodes[a].collapsed).toBe(true);
    const replacement = replaceMindmapSearchMatches(map, "搜索", "新");
    expect(replacement.count).toBe(2);
    expect(replacement.object.nodes[child].summary).toBe("新描述");
    expect(replacement.object.nodes[child].tags).toEqual(["新标签"]);
  });
  it("new descendants inherit branch settings and explicit local values win", () => {
    let map = createMindmapTemplateObject();
    const a = branches(map)[0];
    map = applyMindmapCommand(map, {
      type: "patch",
      nodeIds: [a],
      scope: "branch",
      patch: { color: "#0f0", fontSize: 20 },
    }).object;
    map = addMindmapNode(map, a);
    const child = childrenOf(map, a)[0].id;
    const visual = resolveMindmapNodeVisualStyle(map.nodes[child], 2, map);
    expect(visual.color).toBe("#0f0");
    expect(visual.fontSize).toBe(20);
  });
  it("reconciles inserted input ranges without corrupting existing spans", () => {
    const result = reconcileMindmapTextChange(
      "abCD",
      "abXCD",
      [{ start: 2, end: 4, bold: true }],
      { italic: true }
    );
    expect(result.label).toBe("abXCD");
    expect(result.labelStyleRanges).toEqual([
      { start: 2, end: 3, italic: true },
      { start: 3, end: 5, bold: true },
    ]);
  });
  it("a read with real font metrics keeps old saved positions and node boxes", () => {
    const map = createMindmapTemplateObject();
    const nodes = Object.fromEntries(
      Object.entries(map.nodes).map(([id, node]) => [
        id,
        { ...node, widthMode: undefined, textMaxWidth: undefined },
      ])
    );
    const legacy = { ...map, nodes };
    const measure = vi.fn(() => 100000);
    configureMindmapTextMetrics({ measure });
    const geometry = resolveMindmapObjectGeometry(legacy);
    for (const id of legacy.order) {
      expect(geometry.nodes[id].x).toBe(legacy.nodes[id].x);
      expect(geometry.nodes[id].y).toBe(legacy.nodes[id].y);
      expect(geometry.nodes[id].width).toBe(legacy.nodes[id].width);
      expect(geometry.nodes[id].height).toBe(legacy.nodes[id].height);
    }
  });
  it("text alignment and arrow geometry are supplied by the shared descriptor", () => {
    let map = createMindmapTemplateObject();
    const [a, b] = branches(map);
    map = applyMindmapCommand(map, {
      type: "patch",
      nodeIds: [a],
      patch: {
        label: "short",
        widthMode: "fixed",
        textMaxWidth: 200,
        align: "right",
      },
    }).object;
    map = applyMindmapCommand(map, {
      type: "relation",
      value: {
        id: "relation",
        sourceId: a,
        targetId: b,
        startArrow: true,
        endArrow: true,
      },
    }).object;
    const descriptor = resolveMindmapRenderData(map);
    expect(
      descriptor.nodes.find((node) => node.node.id === a)!.textRuns[0].x
    ).toBeGreaterThan(100);
    expect(descriptor.relations[0].startArrowPath).toMatch(/^M /);
    expect(descriptor.relations[0].endArrowPath).toMatch(/^M /);
  });
});

it("preserves combined Markdown formats and nested emphasis", () => {
  const { object } = MindmapExchangeCodec.parseMarkdown(
    "# Center\n- ***both***\n- **bold *italic***\n- <u>~~decorated~~</u>"
  );
  const [a, b, c] = childrenOf(object, object.rootId);
  expect(a.label).toBe("both");
  expect(a.labelStyleRanges![0]).toMatchObject({ bold: true, italic: true });
  expect(b.label).toBe("bold italic");
  expect(b.labelStyleRanges!.at(-1)).toMatchObject({
    bold: true,
    italic: true,
  });
  expect(c.label).toBe("decorated");
  expect(c.labelStyleRanges![0]).toMatchObject({
    underline: true,
    strikethrough: true,
  });
});

it("renders inherited and theme text backgrounds but leaves default text clear", () => {
  let map = createMindmapTemplateObject();
  const a = childrenOf(map, map.rootId)[0].id;
  expect(
    resolveMindmapRenderData(map).nodes.find((entry) => entry.node.id === a)!
      .textBackground
  ).toBeNull();
  map = applyMindmapCommand(map, {
    type: "patch",
    nodeIds: [map.rootId],
    scope: "branch",
    patch: { fill: "#fff000" },
  }).object;
  expect(
    resolveMindmapRenderData(map).nodes.find((entry) => entry.node.id === a)!
      .textBackground!.fill
  ).toBe("#fff000");
  const theme = {
    ...MINDMAP_THEMES[0],
    branch: { ...MINDMAP_THEMES[0].branch, fill: "#0ff" },
  };
  const themed = applyMindmapCommand(createMindmapTemplateObject(), {
    type: "theme",
    theme,
  }).object;
  expect(
    resolveMindmapRenderData(themed).nodes.find(
      (entry) => entry.bounds.depth === 1
    )!.textBackground!.fill
  ).toBe("#0ff");
});
it("retains the remaining editor metrics when another editor unregisters", () => {
  const first = { measure: () => 10 },
    second = { measure: () => 20 };
  const leaveFirst = registerMindmapTextMetrics(first),
    leaveSecond = registerMindmapTextMetrics(second);
  leaveSecond();
  const content = resolveMindmapNodeContentGeometry({ label: "abc" });
  expect(content.label.width).toBe(32);
  leaveFirst();
});

it("keeps saved auto-node dimensions on read after the host loads fonts", () => {
  const map = createMindmapTemplateObject();
  const snapshots = structuredClone(map.nodes);
  configureMindmapTextMetrics({ measure: () => 100000 });
  const normalized = normalizeMindmapObject(map),
    geometry = resolveMindmapObjectGeometry(normalized);
  for (const id of map.order) {
    expect(normalized.nodes[id].width).toBe(snapshots[id].width);
    expect(normalized.nodes[id].height).toBe(snapshots[id].height);
    expect(geometry.nodes[id].x).toBe(snapshots[id].x);
    expect(geometry.nodes[id].y).toBe(snapshots[id].y);
    expect(geometry.nodes[id].width).toBe(snapshots[id].width);
  }
});
it("whole-node styles clear only conflicting local text style overrides", () => {
  let map = createMindmapTemplateObject();
  const id = childrenOf(map, map.rootId)[0].id;
  map = applyMindmapCommand(map, {
    type: "patch",
    nodeIds: [id],
    patch: {
      label: "abc",
      labelStyleRanges: [
        {
          start: 0,
          end: 3,
          color: "#f00",
          bold: true,
          italic: true,
          underline: true,
        },
      ],
    },
  }).object;
  const painted = applyMindmapCommand(map, {
    type: "patch",
    nodeIds: [id],
    patch: { color: "#0f0" },
  }).object;
  expect(painted.nodes[id].labelStyleRanges![0]).toMatchObject({
    bold: true,
    italic: true,
    underline: true,
  });
  expect(painted.nodes[id].labelStyleRanges![0].color).toBeUndefined();
  const explicit = applyMindmapCommand(map, {
    type: "patch",
    nodeIds: [id],
    patch: {
      color: "#0f0",
      labelStyleRanges: [{ start: 0, end: 3, color: "#f00" }],
    },
  }).object;
  expect(explicit.nodes[id].labelStyleRanges![0].color).toBe("#f00");
  const repeated = applyMindmapCommand(explicit, {
    type: "patch",
    nodeIds: [id],
    patch: { color: "#0f0" },
  });
  expect(repeated.changed).toBe(true);
  expect(repeated.object.nodes[id].labelStyleRanges).toEqual([]);
  const renamed = applyMindmapCommand(map, {
    type: "patch",
    nodeIds: [id],
    patch: { label: "xabc" },
  }).object;
  expect(renamed.nodes[id].labelStyleRanges![0]).toMatchObject({
    start: 1,
    end: 4,
    color: "#f00",
  });
});
