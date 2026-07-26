import { build } from "esbuild";

const result = await build({
  entryPoints: ["tests/all-tests.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node20",
  write: false,
  logLevel: "warning",
});

const outputs = result.outputFiles;
if (!outputs?.length) throw new Error("Test bundles were not produced.");
for (const output of outputs) {
  const encoded = Buffer.from(output.text).toString("base64");
  await import(`data:text/javascript;base64,${encoded}`);
}
