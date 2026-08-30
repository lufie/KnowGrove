import test from "node:test";
import assert from "node:assert/strict";
import {
  applyMatrixSuggestion,
  buildPropertyMatrix,
  buildPropertyMatrixAudit,
  parsePropertyDraft,
  propertyValueToDraft,
} from "../src/property-matrix";
import { auditPropertySnapshots } from "../src/property-system";
import { createDefaultSettings } from "../src/types";

test("property matrix shows only fields needing review", () => {
  const settings = createDefaultSettings().propertySystem;
  const snapshots = [
    {
      path: "Home/输入/文章甲.md",
      basename: "文章甲",
      frontmatter: {
        类型: "输入资料",
        状态: "待处理",
        创建时间: "2026-07-24",
        领域: ["未知领域"],
        主题: ["知识管理"],
      },
    },
    {
      path: "Home/输入/文章乙.md",
      basename: "文章乙",
      frontmatter: {
        类型: "知识笔记",
        状态: "已完成",
        创建时间: "2026-07-24",
        领域: ["AI产品"],
        主题: ["知识管理"],
      },
    },
  ];
  const audit = auditPropertySnapshots(snapshots, settings);
  const frontmatter = new Map(snapshots.map((snapshot) => [snapshot.path, snapshot.frontmatter]));
  const model = buildPropertyMatrix(audit, settings.dimensions, frontmatter);

  assert.deepEqual(model.columns, ["领域"]);
  assert.deepEqual(model.rows.map((row) => row.title), ["文章甲"]);
  assert.equal(model.rows[0]?.cells[0]?.needsFix, true);
  assert.equal(model.rows[0]?.cells[0]?.draftText, "未知领域");
});

test("edited matrix suggestions become one confirmed audit operation per changed cell", () => {
  const settings = createDefaultSettings().propertySystem;
  const snapshots = [{
    path: "Home/输入/文章甲.md",
    basename: "文章甲",
    frontmatter: {
      类型: "输入资料",
      状态: "待处理",
      创建时间: "2026-07-24",
      领域: ["未知领域"],
      主题: ["知识管理"],
    },
  }];
  const audit = auditPropertySnapshots(snapshots, settings);
  const model = buildPropertyMatrix(
    audit,
    settings.dimensions,
    new Map([[snapshots[0]!.path, snapshots[0]!.frontmatter]]),
  );
  assert.equal(applyMatrixSuggestion(model, snapshots[0]!.path, "领域", ["AI产品"], true), true);
  const pending = buildPropertyMatrixAudit(audit, model);

  assert.equal(pending.automaticFiles, 1);
  assert.equal(pending.automaticOperations, 1);
  assert.deepEqual(pending.changes[0]?.operations.map((operation) => ({
    property: operation.property,
    after: operation.after,
    reason: operation.reason,
  })), [
    { property: "领域", after: ["AI产品"], reason: "应用已确认的 AI 属性建议" },
  ]);
});

test("property matrix draft conversion keeps multi values editable and deterministic", () => {
  assert.equal(propertyValueToDraft(["AI产品", "知识管理"]), "AI产品，知识管理");
  assert.deepEqual(parsePropertyDraft("multi", "AI产品，知识管理, AI产品"), ["AI产品", "知识管理"]);
  assert.equal(parsePropertyDraft("checkbox", "true"), true);
  assert.equal(parsePropertyDraft("text", "  新建议  "), "新建议");
  assert.equal(parsePropertyDraft("single", ""), undefined);
});
