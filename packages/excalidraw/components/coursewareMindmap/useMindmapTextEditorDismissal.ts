import { useCallback, useEffect, useRef } from "react";

import type { RefObject } from "react";
import type { CoursewareMindmapController } from "../../coursewareMindmap/controller";

export const useMindmapTextEditorDismissal = (
  controller: CoursewareMindmapController,
  editorRef: RefObject<HTMLTextAreaElement | null>,
) => {
  const session = controller.editSession;
  const composing = useRef(false);
  const finished = useRef(false);
  const pendingBlur = useRef(false);
  const finish = useCallback(
    (save: boolean) => {
      if (finished.current) return;
      finished.current = true;
      controller.finishEditing(
        save,
        session?.value ?? editorRef.current?.value ?? "",
      );
    },
    [controller, editorRef, session],
  );
  const commitOnDismiss = useCallback(() => {
    if (composing.current) {
      pendingBlur.current = true;
      return;
    }
    finish(true);
  }, [finish]);
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      const target = event.target;
      if (
        !(target instanceof Node) ||
        editorRef.current?.contains(target) ||
        (target instanceof Element &&
          target.closest(".Courseware-mindmap-editor-format"))
      )
        return;
      controller.rememberPointerNode(event);
      commitOnDismiss();
    };
    document.addEventListener("pointerdown", dismiss, true);
    return () => {
      document.removeEventListener("pointerdown", dismiss, true);
      controller.setTextComposing(false);
    };
  }, [controller, editorRef, commitOnDismiss]);
  return {
    composing,
    finish,
    commitOnDismiss,
    beginComposition: () => {
      composing.current = true;
      controller.setTextComposing(true);
    },
    endComposition: () => {
      composing.current = false;
      controller.setTextComposing(false);
      if (pendingBlur.current) {
        pendingBlur.current = false;
        queueMicrotask(() => finish(true));
      }
    },
  };
};
