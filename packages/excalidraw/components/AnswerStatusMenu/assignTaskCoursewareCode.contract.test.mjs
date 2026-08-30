import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const menuSource = readFileSync(resolve(import.meta.dirname, "index.tsx"), "utf8");
const contextSource = readFileSync(
  resolve(import.meta.dirname, "../../context/answer-status.ts"),
  "utf8",
);

assert.match(
  contextSource,
  /interface TeachingContext \{[\s\S]*?coursewareId\?: number;[\s\S]*?coursewareCode\?: string;/,
  "AnswerStatusConfig should preserve the public courseware code identity",
);

assert.match(
  menuSource,
  /const teachingCoursewareCode = teachingContext\?\.coursewareCode \?\? null;[\s\S]*?new CustomEvent\("excalidraw:assignTask"[\s\S]*?coursewareCode: teachingCoursewareCode \?\? undefined/,
  "The assign-task event should expose coursewareCode when numeric coursewareId is unavailable",
);

process.stdout.write("assignTaskCoursewareCode contract passed\n");
