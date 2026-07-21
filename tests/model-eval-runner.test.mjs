import assert from "node:assert/strict";
import test from "node:test";
import {
  loadModelEvalManifest,
  runModelEvals,
} from "../scripts/run-model-evals.mjs";

const responses = {
  route_ticket_context: { decision: "route:jira-context", response: "Use jira-context for this read-only request." },
  route_ticket_progress: { decision: "route:jira-progress", response: "Use jira-progress for this stage update." },
  route_ticket_work: { decision: "route:jira-work", response: "Use jira-work for this ticket-driven repository task." },
  route_inline_decomposition: { decision: "route:jira-decompose", response: "Use jira-decompose in the current context." },
  route_workflow_setup: { decision: "route:jira-workflow", response: "Use jira-workflow for status mapping." },
  route_ad_hoc_acli: { decision: "route:acli", response: "Use acli for this ad-hoc JQL search." },
  route_ad_hoc_delete: { decision: "route:acli", response: "Use acli and load mutations.md." },
  route_ad_hoc_planning: { decision: "route:acli", response: "Use acli and load planning-resources.md." },
  route_ad_hoc_custom_fields: { decision: "route:acli", response: "Use acli with mutations.md and custom-fields.md." },
  concise_context_output: { decision: "respond:concise", response: "PROJ-123 | Fix token refresh | In Progress | Mei" },
  confirm_bulk_transition: { decision: "pause:confirm", response: "Targets: PROJ-123, PROJ-124. Transition to Done and add the stated comment. Proceed?" },
  stop_after_retry: { decision: "stop:error", response: "Stop after the retry. acli edit failed: permission denied." },
  report_partial_batch: { decision: "report:partial", response: "PROJ-123 succeeded. PROJ-124 failed and is unchanged. No comment ran." },
};

test("offline model-eval manifest covers the required behavior categories", () => {
  assert.equal(loadModelEvalManifest().length, 13);
});

test("model-eval runner scores structured Claude responses", () => {
  const report = runModelEvals(
    loadModelEvalManifest(),
    (evaluation) => responses[evaluation.id],
  );
  assert.deepEqual(report.failures, []);
});

test("model-eval runner returns actionable assertion failures", () => {
  const report = runModelEvals(loadModelEvalManifest(), (evaluation) =>
    evaluation.id === "report_partial_batch"
      ? { ...responses[evaluation.id], response: "wrong" }
      : responses[evaluation.id],
  );
  assert.ok(
    report.failures.includes('report_partial_batch: response missing "No comment"'),
  );
});
