import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const roots = ["src", "index.html", "README.md", "DECISIONS.md"];
const forbidden = /\u2014|\u2013/;

async function walk(target, out) {
  let info;
  try {
    info = await stat(target);
  } catch {
    console.error(`Missing path: ${target}`);
    process.exitCode = 1;
    return;
  }
  if (info.isDirectory()) {
    const names = await readdir(target);
    for (const name of names) {
      if (name === "node_modules" || name === "dist") continue;
      await walk(path.join(target, name), out);
    }
    return;
  }
  out.push(target);
}

const files = [];
for (const root of roots) {
  await walk(root, files);
}

const hits = [];
for (const file of files) {
  const text = await readFile(file, "utf8");
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    if (forbidden.test(line)) {
      hits.push(`${file}:${index + 1}`);
    }
  });
}

if (hits.length) {
  console.error("Em dash or en dash found:");
  for (const hit of hits) console.error(hit);
  process.exit(1);
}

console.log(`check:dashes passed (${files.length} files)`);
