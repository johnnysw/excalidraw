import { API } from '../../excalidraw/tests/helpers/api';
import { arrayToMap } from '@excalidraw/common';
import { pointFrom } from '@excalidraw/math';
import { addMindmapNode, createMindmapTemplateObject, toggleMindmapNode, withMindmapLayout, layoutMindmap } from '@excalidraw/mindmap';
import { createCoursewareMindmapElement, coursewareMindmapLocalToScene, getCoursewareMindmapGeometry, updateCoursewareMindmapElement } from '../src/coursewareMindmap';
import { createMindmapNodeBinding, resolveMindmapNodeBinding } from '../src/coursewareMindmapBinding';
import { getGlobalFixedPoints } from '../src/binding';
import { duplicateElements } from '../src/duplicate';
import { restoreElements } from '../../excalidraw/data/restore';
import { serializeAsJSON } from '../../excalidraw/data/json';
import { getDefaultAppState } from '../../excalidraw/appState';
import type { FixedPointBinding, ExcalidrawArrowElement } from '../src/types';

const fixture = () => {
  let model = createMindmapTemplateObject(0, 0);
  const branch = model.order[1];
  model = addMindmapNode(model, branch, 'child', '带图子节点');
  const child = model.order[model.order.length - 1];
  const element = createCoursewareMindmapElement({ mindmap: model, x: 100, y: 200 });
  const node = getCoursewareMindmapGeometry(element)!.nodes[child];
  const anchor = coursewareMindmapLocalToScene(element, { x: node.x, y: node.y + node.height / 2 });
  const binding: FixedPointBinding = {
    elementId: element.id, fixedPoint: [0.5, 0.5], mode: 'inside',
    ...createMindmapNodeBinding(element, pointFrom(anchor.x, anchor.y)),
  };
  return { model, branch, child, element, binding, anchor };
};

it('binds to a specific visible node and follows layout changes', () => {
  const { element, model, binding, child } = fixture();
  expect(binding.mindmapNodeId).toBe(child);
  const before = resolveMindmapNodeBinding(element, binding)!;
  const changed = updateCoursewareMindmapElement(element, layoutMindmap(withMindmapLayout(model, 'mindmap', 'left')));
  const after = resolveMindmapNodeBinding(changed, binding)!;
  const box = getCoursewareMindmapGeometry(changed)!.nodes[child];
  const expected = coursewareMindmapLocalToScene(changed, { x: box.x, y: box.y + box.height / 2 });
  expect(after[0]).toBeCloseTo(expected.x);
  expect(after[1]).toBeCloseTo(expected.y);
  expect(after[0]).not.toBeCloseTo(before[0]);
});

it('retains the last endpoint while the target branch is collapsed', () => {
  const { model, branch, element, binding, anchor } = fixture();
  const hidden = updateCoursewareMindmapElement(element, toggleMindmapNode(model, branch));
  expect(resolveMindmapNodeBinding(hidden, binding)).toBeNull();
  const arrow = API.createElement({ type: 'arrow', x: anchor.x, y: anchor.y, width: 80, height: 50,
    points: [pointFrom(0, 0), pointFrom(80, 50)], startBinding: binding });
  const points = getGlobalFixedPoints(arrow as ExcalidrawArrowElement, arrayToMap([hidden, arrow]));
  expect(points[0][0]).toBeCloseTo(anchor.x);
  expect(points[0][1]).toBeCloseTo(anchor.y);
});

it('round-trips node bindings and nested image files through JSON restoration', () => {
  const { element, binding, child } = fixture();
  element.customData.mindmap.nodes[child].imageAssetId = 'node-image';
  const arrow = API.createElement({ type: 'arrow', x: 0, y: 0, startBinding: binding });
  const files = { 'node-image': { id: 'node-image', dataURL: 'data:image/png;base64,aA==', mimeType: 'image/png', created: 1 } };
  const saved = JSON.parse(serializeAsJSON([element, arrow], getDefaultAppState(), files as any, 'local'));
  const restored = restoreElements(saved.elements, null, { repairBindings: true });
  expect((restored[1] as typeof arrow).startBinding?.mindmapNodeId).toBe(child);
  expect((restored[1] as typeof arrow).startBinding?.mindmapNodePoint).toEqual(binding.mindmapNodePoint);
  expect(saved.files['node-image']).toEqual(files['node-image']);
});

it('duplicates an arrow and tree with matching new internal node identities', () => {
  const { element, binding, child } = fixture();
  const arrow = API.createElement({ type: 'arrow', x: 0, y: 0, startBinding: binding });
  const result = duplicateElements({ elements: [element, arrow], type: 'everything' }).duplicatedElements;
  const copiedTree = result[0];
  const copiedArrow = result[1] as typeof arrow;
  const nodeId = copiedArrow.startBinding?.mindmapNodeId;
  expect(nodeId).toBeTruthy();
  expect(nodeId).not.toBe(child);
  expect(copiedArrow.startBinding?.elementId).toBe(copiedTree.id);
  expect(copiedTree.customData?.mindmap.nodes[nodeId!]).toBeTruthy();
});
