import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import {
  formatJsonValidation,
  validateJson,
} from "../scripts/validate-json.mjs";

test("JSON validator accepts nested valid files", async (context) => {
  const root = await fixtureRoot(context);
  await mkdir(resolve(root, "nested"));
  await writeFile(resolve(root, "one.json"), '{"ok":true}\n');
  await writeFile(resolve(root, "nested/two.json"), '[1,2,3]\n');

  const result = await validateJson(root);
  assert.deepEqual(result.failures, []);
  assert.match(formatJsonValidation(result), /passed \(2 files\)/);
});

test("JSON validator reports an actionable file location", async (context) => {
  const root = await fixtureRoot(context);
  await writeFile(resolve(root, "broken.json"), '{\n  "ok": true,\n  nope\n}\n');

  const result = await validateJson(root);
  assert.equal(result.failures.length, 1);
  const output = formatJsonValidation(result);
  assert.match(output, /broken\.json:\d+:\d+:/);
  assert.match(output, /JSON validation failed/);
});

async function fixtureRoot(context) {
  const root = await mkdtemp(resolve(tmpdir(), "jira-json-test-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  return root;
}
