import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tmpRoot = path.join(os.tmpdir(), "better-react-confetti-react-compat");

const matrix = [
  {
    name: "react-18.3",
    react: "18.3.1",
    reactDom: "18.3.1",
    typesReact: "18.3.24",
    typesReactDom: "18.3.7"
  },
  {
    name: "react-19.0",
    react: "19.0.7",
    reactDom: "19.0.7",
    typesReact: "19.0.12",
    typesReactDom: "19.0.6"
  },
  {
    name: "react-19.1",
    react: "19.1.8",
    reactDom: "19.1.8",
    typesReact: "19.1.17",
    typesReactDom: "19.1.11"
  },
  {
    name: "react-19.2",
    react: "19.2.7",
    reactDom: "19.2.7",
    typesReact: "19.2.17",
    typesReactDom: "19.2.3"
  }
];

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: options.cwd ?? root,
    encoding: "utf8",
    stdio: options.stdio ?? "pipe",
    env: {
      ...process.env,
      CI: "true"
    }
  });
}

function writeFixture(dir, entry, tarballPath) {
  writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify(
      {
        private: true,
        type: "module",
        scripts: {
          typecheck: "tsc --noEmit",
          runtime: "node runtime.mjs"
        },
        dependencies: {
          "better-react-confetti": `file:${tarballPath}`,
          react: entry.react,
          "react-dom": entry.reactDom
        },
        devDependencies: {
          "@types/react": entry.typesReact,
          "@types/react-dom": entry.typesReactDom,
          typescript: "^5.9.3"
        }
      },
      null,
      2
    )
  );

  writeFileSync(
    path.join(dir, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2020",
          lib: ["DOM", "DOM.Iterable", "ES2020"],
          module: "NodeNext",
          moduleResolution: "NodeNext",
          jsx: "react-jsx",
          strict: true,
          skipLibCheck: false,
          esModuleInterop: true
        },
        include: ["consumer.tsx"]
      },
      null,
      2
    )
  );

  writeFileSync(
    path.join(dir, "consumer.tsx"),
    `import React from "react";
import { createRoot } from "react-dom/client";
import Confetti, { Circle, Rectangle, Triangle } from "better-react-confetti";

const host = document.createElement("div");
const root = createRoot(host);

root.render(
  <Confetti
    total={12}
    Component={[
      <Rectangle color="#ef476f" key="rect" />,
      <Circle color="#06d6a0" key="circle" />,
      <Triangle color="#118ab2" key="triangle" />
    ]}
    aria-label="celebration"
  />
);
`
  );

  writeFileSync(
    path.join(dir, "runtime.mjs"),
    `import React from "react";
import { renderToString } from "react-dom/server";
import Confetti, { Circle } from "better-react-confetti";

const markup = renderToString(
  React.createElement(
    "div",
    { style: { position: "relative", height: 240 } },
    React.createElement(Confetti, {
      total: 4,
      Component: React.createElement(Circle, { color: "#06d6a0" })
    })
  )
);

if (!markup.includes("canvas")) {
  throw new Error("Expected Confetti to render a canvas during SSR.");
}
`
  );
}

rmSync(tmpRoot, { recursive: true, force: true });
mkdirSync(tmpRoot, { recursive: true });

console.log("Building package...");
run("pnpm", ["build"], { stdio: "inherit" });

const packOutput = run("pnpm", ["pack", "--pack-destination", tmpRoot]);
const tarballName = packOutput
  .trim()
  .split("\n")
  .find((line) => line.endsWith(".tgz"));

if (!tarballName) {
  throw new Error(`Could not find tarball name in pnpm pack output:\n${packOutput}`);
}

const tarballPath = path.isAbsolute(tarballName) ? tarballName : path.join(tmpRoot, tarballName);
const results = [];

for (const entry of matrix) {
  const dir = path.join(tmpRoot, entry.name);
  mkdirSync(dir, { recursive: true });
  writeFixture(dir, entry, tarballPath);

  console.log(`\nChecking ${entry.name}...`);
  run("pnpm", ["install"], { cwd: dir, stdio: "inherit" });
  run("pnpm", ["run", "typecheck"], { cwd: dir, stdio: "inherit" });
  run("pnpm", ["run", "runtime"], { cwd: dir, stdio: "inherit" });
  results.push(`${entry.name}: react ${entry.react}, react-dom ${entry.reactDom}`);
}

console.log("\nReact compatibility matrix passed:");
for (const result of results) {
  console.log(`- ${result}`);
}
