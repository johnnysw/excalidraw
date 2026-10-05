import { registerMindmapTextMetrics, invalidateMindmapTextMetrics, MINDMAP_FONT_FAMILY } from '@excalidraw/mindmap';

let consumers = 0;
let canvas: HTMLCanvasElement | null = null;
let fonts: FontFaceSet | null = null;
let unregister: (() => void) | undefined;
const callbacks = new Set<() => void>();
const fontLoaded = () => {
  invalidateMindmapTextMetrics();
  callbacks.forEach(callback => callback());
};
/** Inject browser font measurement; core geometry remains independent of DOM. */
export const installCoursewareMindmapTextMetrics = (onFontsLoaded: () => void) => {
  if (!consumers++) {
    canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (context) unregister = registerMindmapTextMetrics({ measure(text, style) {
      context.font = `${style.italic ? 'italic' : 'normal'} ${style.bold ? 'bold' : 'normal'} ${style.fontSize}px ${MINDMAP_FONT_FAMILY}`;
      return context.measureText(text).width;
    } });
    fonts = document.fonts;
    fonts?.addEventListener?.('loadingdone', fontLoaded);
  }
  callbacks.add(onFontsLoaded);
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true; callbacks.delete(onFontsLoaded);
    if (!--consumers) {
      fonts?.removeEventListener?.('loadingdone', fontLoaded);
      fonts = null; canvas = null;
      unregister?.(); unregister = undefined;
    }
  };
};
