import React from "react";
import { Excalidraw } from '../../excalidraw';
import { createCoursewareMindmapTransferElements, finalizeCoursewareMindmapElements } from "../src/coursewareMindmapTransfer";
import { createMindmapTemplateObject, addMindmapNode, moveMindmapBranchesBetween, applyMindmapCommand } from '@excalidraw/mindmap';
import { API } from '../../excalidraw/tests/helpers/api';
import { pointFrom } from '@excalidraw/math';
import { createCoursewareMindmapElement, coursewareMindmapLocalToScene, getCoursewareMindmapGeometry, getCoursewareMindmap, updateCoursewareMindmapElement } from '../src/coursewareMindmap';
import { resolveMindmapNodeBinding } from '../src/coursewareMindmapBinding';
import { cloneCoursewareMindmapForDuplication } from '../src/coursewareMindmapType';
import { Keyboard } from '../../excalidraw/tests/helpers/ui';
import { act, render, unmountComponent } from '../../excalidraw/tests/test-utils';
import { CaptureUpdateAction } from '../src/store';
import type { ExcalidrawArrowElement, FixedPointBinding } from '../src/types';
import type { MindmapBranchStyle } from '@excalidraw/mindmap';

const setup = () => {
  let sourceModel = createMindmapTemplateObject(0, 0);
  sourceModel = addMindmapNode(sourceModel, sourceModel.order[1], 'child', '带图节点');
  const nodeId = sourceModel.order.at(-1)!;
  sourceModel.nodes[nodeId] = { ...sourceModel.nodes[nodeId], imageAssetId: 'preserved-image', color: '#28a745' };
  let source = createCoursewareMindmapElement({ mindmap: sourceModel, x: 100, y: 100, id: 'source' });
  const target = createCoursewareMindmapElement({ mindmap: createMindmapTemplateObject(0, 0), x: 700, y: 300, id: 'target' });
  const binding: FixedPointBinding = { elementId: source.id, mindmapNodeId: nodeId, mindmapNodePoint: [1, .5], fixedPoint: [1, .5], mode: 'inside' };
  const start = resolveMindmapNodeBinding(source, binding)!;
  const arrow = API.createElement({ type: 'arrow', x: start[0], y: start[1], width: 100, height: 0, points: [pointFrom(0, 0), pointFrom(100, 0)], startBinding: binding });
  source = { ...source, boundElements: [{ id: arrow.id, type: 'arrow' }, { id: arrow.id, type: 'arrow' }] };
  const transfer = moveMindmapBranchesBetween(source.customData.mindmap, target.customData.mindmap, [nodeId], { parentId: target.customData.mindmap.rootId })!;
  return { source, target, nodeId, arrow, transfer };
};

it('atomically changes ownership and both reverse references without mutating input', () => {
  const { source, target, nodeId, arrow, transfer } = setup();
  const input = [source, target, arrow];
  const before = JSON.stringify(input);
  const output = createCoursewareMindmapTransferElements(input, [transfer]);
  expect(JSON.stringify(input)).toBe(before);
  const from = output.find(e => e.id === source.id)!, to = output.find(e => e.id === target.id)!;
  const moved = output.find(e => e.id === arrow.id) as ExcalidrawArrowElement;
  expect(moved.startBinding?.elementId).toBe(target.id);
  expect(moved.startBinding?.mindmapNodeId).toBe(nodeId);
  expect(moved.startBinding?.mindmapNodePoint).toEqual([1, .5]);
  expect(from.boundElements).not.toContainEqual({ id: arrow.id, type: 'arrow' });
  expect(to.boundElements).toEqual([{ id: arrow.id, type: 'arrow' }]);
  expect(to.customData?.mindmap.nodes[nodeId].imageAssetId).toBe('preserved-image');
  const anchor = resolveMindmapNodeBinding(to, moved.startBinding)!;
  expect(moved.x + moved.points[0][0]).toBeCloseTo(anchor[0], 3);
  expect(moved.y + moved.points[0][1]).toBeCloseTo(anchor[1], 3);
});

it('keeps rotated, flipped and scaled diagram root centres stable', () => {
  const fixture = setup();
  const { transfer } = fixture;
  const source = { ...fixture.source, angle: Math.PI / 3 as typeof fixture.source.angle, width: fixture.source.width * 1.6, height: fixture.source.height * 1.6 };
  const target = { ...fixture.target, angle: -Math.PI / 4 as typeof fixture.target.angle }; target.customData.mindmap.flipX = true;
  const center = (element: typeof source) => {
    const root = getCoursewareMindmapGeometry(element)!.nodes[element.customData.mindmap.rootId];
    return coursewareMindmapLocalToScene(element, { x: root.x + root.width / 2, y: root.y + root.height / 2 });
  };
  const anchors = [center(source), center(target)];
  const output = createCoursewareMindmapTransferElements([source, target], [transfer]);
  [source, target].forEach((element, i) => {
    const after = center(output.find(e => e.id === element.id) as typeof source);
    expect(after.x).toBeCloseTo(anchors[i].x, 6); expect(after.y).toBeCloseTo(anchors[i].y, 6);
  });
});

it('converts a spanning internal relation into a native arrow with a bound label', () => {
  const { source, target, nodeId } = setup();
  source.customData.mindmap.relations = [{ id: 'relation', sourceId: source.customData.mindmap.rootId, targetId: nodeId, color: '#16a34a', lineStyle: 'dash', label: '依赖', endArrow: true }];
  const transfer = moveMindmapBranchesBetween(source.customData.mindmap, target.customData.mindmap, [nodeId], { parentId: target.customData.mindmap.rootId })!;
  const output = createCoursewareMindmapTransferElements([source, target], [transfer]);
  const arrow = output.find(e => e.type === 'arrow') as ExcalidrawArrowElement;
  expect(arrow.startBinding?.elementId).toBe(source.id); expect(arrow.endBinding?.elementId).toBe(target.id);
  expect(arrow.strokeColor).toBe('#16a34a'); expect(arrow.strokeStyle).toBe('dashed');
  expect(output.find(e => e.type === 'text')?.customData).toBeUndefined();
  expect(output.some(e => e.type === 'text' && e.text === '依赖' && e.containerId === arrow.id)).toBe(true);
});

it('native whole-map copies remap all professional object references', () => {
  const { source } = setup(); const model = source.customData.mindmap;
  model.boundaries = [{ id: 'boundary', nodeIds: [model.order[1]], title: '范围' }];
  model.relations = [{ id: 'link', sourceId: model.rootId, targetId: model.order[1] }];
  model.nodes[model.rootId].labelStyleRanges = [{ start: 0, end: 1, color: '#ff0000', underline: true, strikethrough: true }];
  const copied = cloneCoursewareMindmapForDuplication(source, 'duplicate')!.mindmap;
  expect(copied.boundaries[0].id).not.toBe('boundary');
  expect(copied.nodes[copied.boundaries[0].nodeIds[0]]).toBeTruthy();
  expect(copied.relations[0].sourceId).toBe(copied.rootId);
  expect(copied.nodes[copied.rootId].labelStyleRanges).toEqual(model.nodes[model.rootId].labelStyleRanges);
  expect(copied.nodes[copied.rootId].labelStyleRanges).not.toBe(model.nodes[model.rootId].labelStyleRanges);
});

it.each(["curve", "round-angle", "right-angle"] as MindmapBranchStyle[])(
  'keeps converted %s relation endpoints following after native undo and redo',
  async (style) => {
    const fixture = setup();
    const { nodeId } = fixture;
    const source: typeof fixture.source = {
      ...fixture.source,
      boundElements: [],
      angle: Math.PI / 6 as typeof fixture.source.angle,
      customData: {
        ...fixture.source.customData,
        mindmap: {
          ...fixture.source.customData.mindmap,
          relations: [{
            id: 'history-relation', sourceId: fixture.source.customData.mindmap.rootId,
            targetId: nodeId, style, color: '#16a34a', lineStyle: 'dot',
            label: '跨图依赖', startArrow: true, endArrow: true,
          }],
        },
      },
    };
    const target: typeof fixture.target = {
      ...fixture.target,
      angle: -Math.PI / 4 as typeof fixture.target.angle,
      width: fixture.target.width * 1.3,
      height: fixture.target.height * 1.3,
      customData: {
        ...fixture.target.customData,
        mindmap: { ...fixture.target.customData.mindmap, flipX: true },
      },
    };
    unmountComponent();
    vi.stubGlobal('ResizeObserver', class {
      observe() {} unobserve() {} disconnect() {}
    });
    try {
      await render(React.createElement(Excalidraw, {
        role: 'teacher', handleKeyboardGlobally: true,
        UIOptions: { toolbarLayout: 'left' },
        initialData: { elements: [source, target] },
      }));
      const { h } = window;
      const live = (id: string) => h.app.scene.getNonDeletedElementsMap().get(id)!;
      const currentModel = (id: string) => getCoursewareMindmap(live(id))!;
      const transfer = moveMindmapBranchesBetween(
        currentModel(source.id), currentModel(target.id), [nodeId],
        { parentId: currentModel(target.id).rootId },
      )!;
      act(() => h.app.updateScene({
        elements: createCoursewareMindmapTransferElements(
          h.app.scene.getElementsIncludingDeleted(), [transfer],
        ),
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      }));
      const arrow = h.app.scene.getNonDeletedElements().find(
        (element) => element.type === 'arrow' && element.customData?.mindmapRelationId === 'history-relation',
      ) as ExcalidrawArrowElement;
      const label = h.app.scene.getNonDeletedElements().find(
        (element) => element.type === 'text' && element.containerId === arrow.id,
      )!;
      expect(API.getUndoStack()).toHaveLength(1);
      expect(arrow.strokeColor).toBe('#16a34a');
      expect(arrow.strokeStyle).toBe('dotted');
      expect(arrow.startArrowhead).toBe('arrow');
      expect(arrow.endArrowhead).toBe('arrow');
      expect(arrow.roundness).toEqual(style === 'right-angle' ? null : { type: 2 });
      Keyboard.undo();
      expect(currentModel(source.id).nodes[nodeId]).toBeTruthy();
      expect(currentModel(source.id).relations?.[0].id).toBe('history-relation');
      expect(currentModel(target.id).nodes[nodeId]).toBeUndefined();
      expect(h.app.scene.getNonDeletedElementsMap().has(arrow.id)).toBe(false);
      expect(h.app.scene.getNonDeletedElementsMap().has(label.id)).toBe(false);
      Keyboard.redo();
      const restored = live(arrow.id) as ExcalidrawArrowElement;
      expect(restored.startBinding?.elementId).toBe(source.id);
      expect(restored.endBinding).toMatchObject({ elementId: target.id, mindmapNodeId: nodeId });
      expect(live(source.id).boundElements).toContainEqual({ id: arrow.id, type: 'arrow' });
      expect(live(target.id).boundElements).toContainEqual({ id: arrow.id, type: 'arrow' });
      const endpoint = (value: ExcalidrawArrowElement) => [
        value.x + value.points.at(-1)![0], value.y + value.points.at(-1)![1],
      ];
      const before = endpoint(restored);
      const originals = h.app.scene.getElementsIncludingDeleted();
      const movedModel = applyMindmapCommand(currentModel(target.id), {
        type: 'manual-position', nodeIds: [nodeId], dx: 137, dy: -51,
      }).object;
      const moved = originals.map((element) => element.id === target.id && element.type === 'rectangle'
        ? updateCoursewareMindmapElement(element, movedModel) : element);
      act(() => h.app.updateScene({
        elements: finalizeCoursewareMindmapElements(
          moved, new Set([target.id]), new Map(originals.map((element) => [element.id, element])),
        ),
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      }));
      const following = live(arrow.id) as ExcalidrawArrowElement;
      const expected = resolveMindmapNodeBinding(live(target.id), following.endBinding!)!;
      expect(endpoint(following)[0]).toBeCloseTo(expected[0], 6);
      expect(endpoint(following)[1]).toBeCloseTo(expected[1], 6);
      expect(endpoint(following)).not.toEqual(before);
      expect(live(label.id)).toMatchObject({ text: '跨图依赖', containerId: arrow.id });
      expect(API.getUndoStack()).toHaveLength(2);
      Keyboard.undo();
      expect(endpoint(live(arrow.id) as ExcalidrawArrowElement)[0]).toBeCloseTo(before[0], 6);
      expect(endpoint(live(arrow.id) as ExcalidrawArrowElement)[1]).toBeCloseTo(before[1], 6);
      Keyboard.redo();
      const final = live(arrow.id) as ExcalidrawArrowElement;
      expect(endpoint(final)[0]).toBeCloseTo(expected[0], 6);
      expect(endpoint(final)[1]).toBeCloseTo(expected[1], 6);
      expect(final.strokeColor).toBe('#16a34a');
      expect(final.strokeStyle).toBe('dotted');
    } finally {
      unmountComponent();
      vi.unstubAllGlobals();
    }
  },
);
