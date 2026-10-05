import { createMindmapTemplateObject, configureMindmapTextMetrics, invalidateMindmapTextMetrics } from '@excalidraw/mindmap';
import { createCoursewareMindmapElement } from '../src/coursewareMindmap';
import { getCoursewareMindmapRenderData } from '../src/coursewareMindmapRenderData';
import { createCoursewareMindmapSvgNode } from '../src/coursewareMindmapSvg';
import { drawCoursewareMindmap } from '../src/coursewareMindmapCanvas';

beforeAll(() => {
  const Base = Path2D;
  vi.stubGlobal('Path2D', class extends Base {
    roundRect(x: number, y: number, width: number, height: number) { this.rect(x, y, width, height); }
  });
});
afterAll(() => vi.unstubAllGlobals());

it('wraps rich text once and preserves overlapping underline and strikethrough in both renderers', () => {
  const model = createMindmapTemplateObject(0, 0), rootId = model.rootId;
  model.nodes[rootId] = { ...model.nodes[rootId], label: '中文测试Emoji🙂支持换行', widthMode: 'fixed', textMaxWidth: 80,
    labelStyleRanges: [{ start: 0, end: 4, color: '#ff0000', bold: true, underline: true, strikethrough: true }] };
  const element = createCoursewareMindmapElement({ mindmap: model });
  const data = getCoursewareMindmapRenderData(element)!;
  const root = data.nodes.find(item => item.node.id === rootId)!;
  expect(root.labelLines.length).toBeGreaterThan(1);
  const svg = createCoursewareMindmapSvgNode(element, document.createElementNS('http://www.w3.org/2000/svg', 'svg'));
  const rich = svg.querySelector('[data-mindmap-node] text[fill="#ff0000"]');
  expect(rich?.getAttribute('text-decoration')).toBe('underline line-through');
  expect([...svg.querySelectorAll(`[data-mindmap-node="${rootId}"] text`)].map(node => node.textContent).join('')).toBe(model.nodes[rootId].label);
  const ctx = document.createElement('canvas').getContext('2d')!;
  const texts: {text:string;color:string; font:string}[]=[];
  const original = ctx.fillText.bind(ctx);
  ctx.fillText = (text,x,y) => { texts.push({text,color:ctx.fillStyle as string,font:ctx.font}); original(text,x,y); };
  drawCoursewareMindmap(element,ctx);
  expect(texts.some(item => item.text.startsWith('中文') && item.color === '#ff0000' && item.font.includes('bold'))).toBe(true);
});

it('includes professional paths and labels in scene bounds and SVG without persisting geometry', () => {
  const model = createMindmapTemplateObject(0, 0);
  model.summaries = [{id:'summary',nodeIds:model.order.slice(1,3),label:'两项概要'}];
  model.boundaries = [{id:'boundary',nodeIds:[model.rootId],title:'标题',shape:'rounded-rectangle'}];
  model.relations = [{id:'relation',sourceId:model.order[1],targetId:model.order[2],label:'关系',startArrow:true,endArrow:true}];
  const before = JSON.stringify(model), element = createCoursewareMindmapElement({mindmap:model});
  const data = getCoursewareMindmapRenderData(element)!;
  const svg = createCoursewareMindmapSvgNode(element,document.createElementNS('http://www.w3.org/2000/svg','svg'));
  expect(data.summaries).toHaveLength(1); expect(data.relations).toHaveLength(1); expect(data.boundaries).toHaveLength(1);
  expect(svg.querySelectorAll('[data-mindmap-object]')).toHaveLength(3);
  expect(svg.textContent).toContain('两项概要'); expect(svg.textContent).toContain('关系');
  expect(JSON.stringify(model)).toBe(before);
  for (const professional of [...data.summaries,...data.boundaries,...data.relations]) {
    expect(data.geometry.bounds.x).toBeLessThanOrEqual(professional.bounds.x);
    expect(data.geometry.bounds.x+data.geometry.bounds.width).toBeGreaterThanOrEqual(professional.bounds.x+professional.bounds.width);
  }
});

it('invalidates drawing and measure caches when host fonts finish loading', () => {
  const model = createMindmapTemplateObject(0,0);
  let factor=6;
  configureMindmapTextMetrics({measure: text => text.length*factor});
  try {
    const element = createCoursewareMindmapElement({mindmap:model});
    const first = getCoursewareMindmapRenderData(element)!;
    factor=12; invalidateMindmapTextMetrics();
    const second = getCoursewareMindmapRenderData(element)!;
    expect(second).not.toBe(first);
    expect(second.nodes[0].textRuns[0].width).toBeGreaterThan(first.nodes[0].textRuns[0].width);
  } finally { configureMindmapTextMetrics(); }
});
