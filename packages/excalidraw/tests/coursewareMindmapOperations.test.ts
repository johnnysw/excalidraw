import { describe, expect, it } from 'vitest';
import { createMindmapTemplateObject, addMindmapNode, toggleMindmapNode } from '@excalidraw/mindmap';
import { patchMindmapNode, expandMindmapAncestors, searchMindmapNodes, changeMindmapLayout } from '../coursewareMindmap/operations';
import { MINDMAP_LAYOUT_OPTIONS } from '../coursewareMindmap/config';

describe('courseware mindmap node operations', () => {
  it('finds descriptions in a collapsed subtree and reveals only its ancestors immutably', () => {
    let model = createMindmapTemplateObject(0, 0, 'mindmap', 'right', 'curve');
    const branch = model.order[1];
    model = addMindmapNode(model, branch, 'child', '隐藏主题');
    const leaf = model.order.find(id => model.nodes[id].label === '隐藏主题')!;
    model = patchMindmapNode(model, leaf, { summary: '课程复习关键词' });
    model = toggleMindmapNode(model, branch);
    expect(searchMindmapNodes(model, '关键词')).toEqual([leaf]);
    const expanded = expandMindmapAncestors(model, leaf);
    expect(expanded.nodes[branch].collapsed).toBe(false);
    expect(model.nodes[branch].collapsed).toBe(true);
    expect(expanded.nodes[leaf].summary).toBe('课程复习关键词');
  });
  it('resizes labels and descriptions without changing unrelated style', () => {
    const model = createMindmapTemplateObject(0, 0, 'mindmap', 'right', 'curve');
    const next = patchMindmapNode(model, model.rootId, { label: '这是一个需要自动调整节点宽度的中文主题', opacity: .6 });
    expect(next.nodes[model.rootId].width).toBeGreaterThan(model.nodes[model.rootId].width!);
    expect(next.nodes[model.rootId].opacity).toBe(.6);
    expect(model.nodes[model.rootId].label).toBe('中心主题');
  });
  it('deleting an image clears only its node reference, keeping other folded images intact', () => {
    let model = createMindmapTemplateObject(0, 0, 'mindmap', 'right', 'curve');
    const [a,b] = model.order.slice(1);
    model = patchMindmapNode(model,a,{ imageAssetId:'a',imageWidth:96,imageHeight:56 });
    model = patchMindmapNode(model,b,{ imageAssetId:'b',collapsed:true });
    const next = patchMindmapNode(model,a,{ imageAssetId:undefined,imageWidth:undefined,imageHeight:undefined });
    expect(next.nodes[a].imageAssetId).toBeUndefined();
    expect(next.nodes[b].imageAssetId).toBe('b');
    expect(model.nodes[a].imageAssetId).toBe('a');
  });
  it.each(MINDMAP_LAYOUT_OPTIONS)('applies $label and all three branch styles without losing content', (option) => {
    const model = createMindmapTemplateObject(0, 0, 'mindmap', 'right', 'curve');
    for (const branchStyle of ['curve','round-angle','right-angle'] as const) {
      const next = changeMindmapLayout(model,{family:option.family,direction:option.direction,branchStyle});
      expect(next.order).toEqual(model.order);
      expect(next.branchStyle).toBe(branchStyle);
      expect(next.nodes[next.rootId].label).toBe('中心主题');
    }
  });
});
