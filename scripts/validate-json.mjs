#!/usr/bin/env node

import { readFile, readdir } from "node:fs/promises";
import { resolve, relative } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ignoredDirectories = new Set([".git", "node_modules"]);

export async function validateJson(rootDirectory) {
  const root = resolve(rootDirectory);
  const files = await findJsonFiles(root);
  const failures = [];

  for (const file of files) {
    const source = await readFile(file, "utf8");
    try {
      JSON.parse(source);
    } catch (error) {
      const position = Number(error.message.match(/position (\d+)/)?.[1]);
      const location = Number.isInteger(position)
        ? lineAndColumn(source, position)
        : { line: 1, column: 1 };
      failures.push(
        `${relative(root, file)}:${location.line}:${location.column}: ${error.message}`,
      );
    }
  }
  return { files, failures };
}

export function formatJsonValidation({ files, failures }) {
  if (failures.length > 0) {
    return [
      `JSON validation failed (${failures.length} file${failures.length === 1 ? "" : "s"}):`,
      ...failures.map((failure) => `- ${failure}`),
    ].join("\n");
  }
  return `JSON validation passed (${files.length} files)`;
}

async function findJsonFiles(directory) {
  const found = [];
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of entries) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) found.push(...(await findJsonFiles(path)));
    else if (entry.isFile() && entry.name.endsWith(".json")) found.push(path);
  }
  return found;
}

function lineAndColumn(source, position) {
  const prefix = source.slice(0, position);
  const lines = prefix.split("\n");
  return { line: lines.length, column: lines.at(-1).length + 1 };
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  const result = await validateJson(process.argv[2] ?? process.cwd());
  const output = formatJsonValidation(result);
  if (result.failures.length > 0) {
    console.error(output);
    process.exitCode = 1;
  } else {
    console.log(output);
  }
}
