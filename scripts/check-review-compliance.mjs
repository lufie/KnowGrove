import { readFile } from "node:fs/promises";

const sourceFiles = [
  "src/comment-sidebar.ts",
  "src/image-layout-enhancer.ts",
  "src/table-resizer.ts",
  "src/word-like-editing.ts",
];

const failures = [];
for (const path of sourceFiles) {
  const source = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
  if (/\.createElement\s*\(/u.test(source)) {
    failures.push(`${path}: use Obsidian createEl/createDiv/createSpan helpers`);
  }
  if (/\binstanceof\s+(?:Element|HTMLElement|HTML\w*Element)\b/u.test(source)) {
    failures.push(`${path}: use Obsidian Node.instanceOf for pop-out window safety`);
  }
}

const styles = await readFile(new URL("../styles.css", import.meta.url), "utf8");
if (/!important\b/u.test(styles)) {
  failures.push("styles.css: avoid !important in community-plugin styles");
}

if (failures.length > 0) {
  throw new Error(`Obsidian review compliance failed:\n- ${failures.join("\n- ")}`);
}

console.log("Obsidian review compliance passed.");
