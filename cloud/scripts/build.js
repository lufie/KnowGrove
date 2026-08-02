import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const output = new URL("../dist/", import.meta.url);
const sourcePackage = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

await build({
  entryPoints: [fileURLToPath(new URL("../site/app.js", import.meta.url))],
  bundle: true,
  format: "esm",
  minify: true,
  outfile: fileURLToPath(new URL("../dist/app.js", import.meta.url)),
  sourcemap: false,
  target: ["es2022"],
});

await Promise.all([
  cp(new URL("../site/index.html", import.meta.url), new URL("index.html", output)),
  cp(new URL("../site/styles.css", import.meta.url), new URL("styles.css", output)),
  cp(new URL("../cloud-functions", import.meta.url), new URL("cloud-functions", output), {
    recursive: true,
  }),
  cp(new URL("../lib", import.meta.url), new URL("lib", output), {
    recursive: true,
  }),
  cp(new URL("../edgeone.json", import.meta.url), new URL("edgeone.json", output)),
]);

await writeFile(
  new URL("package.json", output),
  `${JSON.stringify(
    {
      name: "@knowgrove/cloud-runtime",
      version: sourcePackage.version,
      private: true,
      type: "module",
      dependencies: {
        "@neondatabase/serverless":
          sourcePackage.dependencies["@neondatabase/serverless"],
        jose: sourcePackage.dependencies.jose,
        ws: sourcePackage.dependencies.ws,
      },
    },
    null,
    2,
  )}\n`,
);

console.log(`Built ${fileURLToPath(new URL(".", output))}`);
