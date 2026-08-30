import assert from "node:assert/strict";
import test from "node:test";
import {
  buildKnowledgeWorkspaceBase,
  buildKnowledgeWorkspaceNote,
  buildKnowledgeWorkspaces,
  buildWorkspacePlanningPrompt,
  isManagedKnowledgeWorkspaceBase,
  knowledgeWorkspacePaths,
  rankWorkspaceSourceCandidates,
} from "../src/knowledge-workspace";
import type { KnowledgeThemeDocument, KnowledgeWorkspaceSummary, PropertyNoteSnapshot } from "../src/types";

function document(path: string, type: string, domains: string[], topics: string[], modifiedAt = 1): KnowledgeThemeDocument {
  return {
    path,
    basename: path.split("/").pop()?.replace(/\.md$/i, "") ?? path,
    type,
    status: "进行中",
    domains,
    topics,
    stage: type === "内容输出" ? "A" : "D",
    modifiedAt,
  };
}

test("generic workspaces aggregate explicit and wikilink relations without depending on folders", () => {
  const documents = [
    document("Home/项目资料.md", "输入资料", ["AI产品"], ["WorkBuddy"], 3),
    document("任意目录/项目行动.md", "行动", ["AI产品"], ["WorkBuddy"], 2),
    document("Home/生活记录.md", "随手笔记", ["生活"], ["健康管理"], 1),
  ];
  const snapshots: PropertyNoteSnapshot[] = [
    ...documents.map((item) => ({
      path: item.path,
      basename: item.basename,
      frontmatter: item.path.includes("行动")
        ? { 所属项目: ["[[_KnowGrove/工作空间/项目/项目A]]"] }
        : item.path.includes("生活") ? { 所属空间: "每周跑步三次" } : {},
    })),
    {
      path: "_KnowGrove/工作空间/项目/项目A.md",
      basename: "项目A",
      frontmatter: {
        knowgrove_workspace: true,
        空间名称: "项目A",
        空间类型: "项目",
        目标: "完成可交付知识库",
        状态: "进行中",
        领域: ["AI产品"],
        主题: ["WorkBuddy"],
        资料范围: ["[[Home/项目资料]]"],
      },
    },
    {
      path: "_KnowGrove/工作空间/生活/每周跑步三次.md",
      basename: "每周跑步三次",
      frontmatter: {
        knowgrove_workspace: true,
        空间名称: "每周跑步三次",
        空间类型: "例行事项",
        目标: "保持有氧训练",
        重复规则: "每周一、三、五",
        领域: ["生活"],
        主题: ["健康管理"],
      },
    },
  ];
  const workspaces = buildKnowledgeWorkspaces(snapshots, documents);
  const project = workspaces.find((workspace) => workspace.name === "项目A");
  const routine = workspaces.find((workspace) => workspace.name === "每周跑步三次");
  assert.deepEqual(project?.documents.map((item) => item.path), ["Home/项目资料.md", "任意目录/项目行动.md"]);
  assert.equal(project?.objective, "完成可交付知识库");
  assert.deepEqual(routine?.documents.map((item) => item.path), ["Home/生活记录.md"]);
  assert.equal(routine?.repeatRule, "每周一、三、五");
});

test("project and life workspace notes expose workflow-specific sections and native Wikilinks", () => {
  const projectPaths = knowledgeWorkspacePaths("项目", "WorkBuddy/知识库");
  assert.equal(projectPaths.notePath, "_KnowGrove/工作空间/项目/WorkBuddy／知识库.md");
  const project: KnowledgeWorkspaceSummary = {
    name: "项目B",
    type: "项目",
    objective: "完成公众号选题与交付",
    status: "待处理",
    domains: ["AI产品"],
    themes: ["WorkBuddy"],
    parentName: "项目A",
    parentPath: "_KnowGrove/工作空间/项目/项目A.md",
    total: 0,
    workspaceExists: false,
    workspacePath: "_KnowGrove/工作空间/项目/项目B.md",
    basePath: "_KnowGrove/工作空间/项目/项目B.base",
    explicitSourcePaths: [],
    documents: [],
  };
  const projectNote = buildKnowledgeWorkspaceNote(project, new Date(2026, 6, 21));
  assert.match(projectNote, /空间类型: 项目/);
  assert.match(projectNote, /上级空间: "\[\[_KnowGrove\/工作空间\/项目\/项目A\]\]"/);
  assert.doesNotMatch(projectNote, /资料范围:|子空间:/);
  assert.match(projectNote, /## 里程碑/);
  assert.match(projectNote, /#交付物\]\]/);

  const routine = { ...project, type: "例行事项" as const, name: "每周复盘", repeatRule: "每周日", parentPath: undefined, parentName: undefined };
  const routineNote = buildKnowledgeWorkspaceNote(routine);
  assert.match(routineNote, /空间类型: 例行事项/);
  assert.match(routineNote, /重复规则: "每周日"/);
  assert.match(routineNote, /## 执行规则/);
  assert.match(routineNote, /#日常记录\]\]/);
});

test("workspace Bases split project and life roles and remain managed after comments disappear", () => {
  const workspace: KnowledgeWorkspaceSummary = {
    name: "项目A",
    type: "项目",
    objective: "交付",
    status: "进行中",
    domains: ["AI产品"],
    themes: ["WorkBuddy"],
    total: 3,
    workspaceExists: true,
    workspacePath: "_KnowGrove/工作空间/项目/项目A.md",
    basePath: "_KnowGrove/工作空间/项目/项目A.base",
    explicitSourcePaths: [],
    documents: [
      document("Home/资料.md", "输入资料", ["AI产品"], ["WorkBuddy"]),
      document("Home/行动.md", "行动", ["AI产品"], ["WorkBuddy"]),
      document("Home/交付.md", "内容输出", ["AI产品"], ["WorkBuddy"]),
    ],
  };
  const base = buildKnowledgeWorkspaceBase(workspace);
  assert.match(base, /name: "项目资料"/);
  assert.match(base, /name: "行动"/);
  assert.match(base, /name: "交付物"/);
  assert.match(base, /direction: DESC/);
  assert.equal(isManagedKnowledgeWorkspaceBase(base.split("\n").slice(1).join("\n")), true);
});

test("workspace AI routing ranks established domain and theme relevance and keeps a bounded prompt", () => {
  const workspace = {
    name: "WorkBuddy 使用技巧",
    objective: "整理可复用的多智能体协作技巧",
    domains: ["AI产品"],
    themes: ["WorkBuddy"],
  };
  const candidates = [
    document("Home/WorkBuddy技巧.md", "输入资料", ["AI产品"], ["WorkBuddy"], 1),
    document("Home/旅行.md", "输入资料", ["生活"], ["旅行"], 9),
  ];
  const ranked = rankWorkspaceSourceCandidates(workspace, candidates);
  assert.equal(ranked[0]?.path, "Home/WorkBuddy技巧.md");
  const prompt = buildWorkspacePlanningPrompt({ ...workspace, type: "项目" }, ranked);
  assert.match(prompt, /不搜索网络/);
  assert.match(prompt, /项目优先选择能支持目标、行动或交付的资料/);
  assert.match(prompt, /最多 15 篇/);
});
