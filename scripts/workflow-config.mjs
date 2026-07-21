#!/usr/bin/env node

import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { randomBytes } from "node:crypto";
import { basename, resolve } from "node:path";

export function openWorkflowConfig(dataDirectory) {
  if (!isNonEmptyString(dataDirectory)) {
    throw codedError(
      "CONFIG_INVALID",
      "CLAUDE_PLUGIN_DATA is not set. Run workflow configuration through an " +
        "installed Jira plugin so persistent storage is available.",
    );
  }

  const statePath = resolve(dataDirectory, "workflows.json");

  return {
    get(siteValue, projectValue) {
      const site = normalizeSite(siteValue);
      return withStateLock(dataDirectory, statePath, () => {
        const state = readOrInitializeState(dataDirectory, statePath);
        const siteConfiguration = state.sites[site];

        if (projectValue === undefined) {
          return cloneJson(siteConfiguration ?? null);
        }

        const project = normalizeProjectKey(projectValue);
        return cloneJson(siteConfiguration?.projects[project] ?? null);
      });
    },

    set(siteValue, projectValue, projectConfiguration, options = {}) {
      const site = normalizeSite(siteValue);
      const project = normalizeProjectKey(projectValue);
      try {
        validateProjectConfiguration(
          projectConfiguration,
          `input for ${site}/${project}`,
        );
      } catch (error) {
        throw codedError("CONFIG_INVALID", error.message);
      }

      return withStateLock(dataDirectory, statePath, () => {
        const state = readOrInitializeState(dataDirectory, statePath);
        const siteConfiguration = ensureSite(state, site);
        siteConfiguration.projects[project] = cloneJson(projectConfiguration);
        if (options.default === true) siteConfiguration.default_project = project;
        validateState(state);
        writeStateAtomically(dataDirectory, statePath, state);
        return cloneJson(projectConfiguration);
      });
    },
  };
}

function readOrInitializeState(dataDirectory, statePath) {
  mkdirSync(dataDirectory, { recursive: true, mode: 0o700 });

  if (!existsSync(statePath)) {
    const initialState = { sites: {} };
    writeStateAtomically(dataDirectory, statePath, initialState);
    return initialState;
  }

  let parsedState;
  try {
    parsedState = JSON.parse(readFileSync(statePath, "utf8"));
  } catch (error) {
    malformedState(statePath, error.message);
  }

  try {
    validateState(parsedState);
  } catch (error) {
    malformedState(statePath, error.message);
  }

  return parsedState;
}

function writeStateAtomically(dataDirectory, statePath, nextState) {
  validateState(nextState);
  mkdirSync(dataDirectory, { recursive: true, mode: 0o700 });

  const temporaryPath = resolve(
    dataDirectory,
    `.${basename(statePath)}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`,
  );
  let descriptor;

  try {
    descriptor = openSync(temporaryPath, "wx", 0o600);
    writeFileSync(descriptor, `${JSON.stringify(nextState, null, 2)}\n`, "utf8");
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    renameSync(temporaryPath, statePath);
  } catch (error) {
    if (descriptor !== undefined) {
      closeSync(descriptor);
    }
    rmSync(temporaryPath, { force: true });
    throw codedError(
      "CONFIG_WRITE_FAILED",
      `Could not write workflow state at ${statePath}: ${error.message}`,
    );
  }
}

function withStateLock(dataDirectory, statePath, operation) {
  try {
    mkdirSync(dataDirectory, { recursive: true, mode: 0o700 });
  } catch (error) {
    throw codedError(
      "CONFIG_WRITE_FAILED",
      `Could not prepare workflow state directory: ${error.message}`,
    );
  }

  const lockPath = resolve(dataDirectory, `.${basename(statePath)}.lock`);
  const requestedTimeout = Number(
    process.env.JIRA_PLUGIN_CONFIG_LOCK_TIMEOUT_MS ?? "5000",
  );
  const timeout =
    Number.isFinite(requestedTimeout) && requestedTimeout > 0
      ? requestedTimeout
      : 5000;
  const deadline = Date.now() + timeout;
  let descriptor;

  while (descriptor === undefined) {
    try {
      descriptor = openSync(lockPath, "wx", 0o600);
    } catch (error) {
      if (error.code !== "EEXIST") {
        throw codedError(
          "CONFIG_WRITE_FAILED",
          `Could not lock workflow state: ${error.message}`,
        );
      }
      try {
        if (Date.now() - statSync(lockPath).mtimeMs > 30_000) {
          rmSync(lockPath, { force: true });
        }
      } catch (statError) {
        if (statError.code !== "ENOENT") {
          throw codedError(
            "CONFIG_WRITE_FAILED",
            `Could not inspect workflow lock: ${statError.message}`,
          );
        }
      }
      if (Date.now() >= deadline) {
        throw codedError(
          "CONFIG_LOCK_TIMEOUT",
          "Timed out waiting for another workflow configuration write to finish.",
        );
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
    }
  }

  try {
    return operation();
  } finally {
    try {
      closeSync(descriptor);
    } finally {
      rmSync(lockPath, { force: true });
    }
  }
}

function validateState(candidate) {
  assertObject(candidate, "state");
  assertExactKeys(candidate, ["sites"], "state");
  assertObject(candidate.sites, "state.sites");

  for (const [siteKey, siteConfiguration] of Object.entries(candidate.sites)) {
    if (normalizeSite(siteKey) !== siteKey) {
      throw new Error(`state.sites contains non-normalized site key ${siteKey}`);
    }

    validateSiteConfiguration(siteConfiguration, `state.sites.${siteKey}`);
  }
}

function validateSiteConfiguration(candidate, location) {
  assertObject(candidate, location);
  assertExactKeys(candidate, ["default_project", "projects"], location);

  if (candidate.default_project !== null) {
    const defaultProject = normalizeProjectKey(candidate.default_project);
    if (defaultProject !== candidate.default_project) {
      throw new Error(`${location}.default_project must be an uppercase project key`);
    }
  }

  assertObject(candidate.projects, `${location}.projects`);
  for (const [projectKey, projectConfiguration] of Object.entries(
    candidate.projects,
  )) {
    if (normalizeProjectKey(projectKey) !== projectKey) {
      throw new Error(`${location}.projects contains invalid project key ${projectKey}`);
    }
    validateProjectConfiguration(
      projectConfiguration,
      `${location}.projects.${projectKey}`,
    );
  }

  if (
    candidate.default_project !== null &&
    !Object.hasOwn(candidate.projects, candidate.default_project)
  ) {
    throw new Error(
      `${location}.default_project must reference a configured project`,
    );
  }
}

function validateProjectConfiguration(candidate, location) {
  assertObject(candidate, location);
  assertAllowedKeys(
    candidate,
    ["workflow_name", "statuses", "transitions", "required_fields"],
    location,
  );
  assertObject(candidate.statuses, `${location}.statuses`);

  for (const requiredStage of ["start", "done"]) {
    if (!isNonEmptyString(candidate.statuses[requiredStage])) {
      throw new Error(`${location}.statuses.${requiredStage} must be a non-empty string`);
    }
  }

  validateStringMap(candidate.statuses, `${location}.statuses`);

  if (
    candidate.workflow_name !== undefined &&
    !isNonEmptyString(candidate.workflow_name)
  ) {
    throw new Error(`${location}.workflow_name must be a non-empty string`);
  }

  if (candidate.transitions !== undefined) {
    validateStringArrayMap(candidate.transitions, `${location}.transitions`);
  }

  if (candidate.required_fields !== undefined) {
    validateStringArrayMap(candidate.required_fields, `${location}.required_fields`);
  }
}

function validateStringMap(candidate, location) {
  for (const [key, value] of Object.entries(candidate)) {
    if (!isNonEmptyString(key) || !isNonEmptyString(value)) {
      throw new Error(`${location} keys and values must be non-empty strings`);
    }
  }
}

function validateStringArrayMap(candidate, location) {
  assertObject(candidate, location);
  for (const [key, values] of Object.entries(candidate)) {
    if (!isNonEmptyString(key) || !Array.isArray(values)) {
      throw new Error(`${location} must map non-empty strings to arrays`);
    }
    if (!values.every(isNonEmptyString)) {
      throw new Error(`${location}.${key} must contain only non-empty strings`);
    }
  }
}

function ensureSite(candidate, siteKey) {
  if (!candidate.sites[siteKey]) {
    candidate.sites[siteKey] = { default_project: null, projects: {} };
  }
  return candidate.sites[siteKey];
}

function normalizeSite(value) {
  if (!isNonEmptyString(value)) {
    throw codedError(
      "CONFIG_INVALID",
      "Site must be a non-empty Jira hostname or URL",
    );
  }

  let parsed;
  try {
    parsed = new URL(value.includes("://") ? value : `https://${value}`);
  } catch {
    throw codedError(
      "CONFIG_INVALID",
      `Invalid Jira site ${JSON.stringify(value)}`,
    );
  }

  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.port ||
    (parsed.pathname !== "/" && parsed.pathname !== "") ||
    parsed.search ||
    parsed.hash
  ) {
    throw codedError(
      "CONFIG_INVALID",
      `Invalid Jira site ${JSON.stringify(value)}`,
    );
  }

  return parsed.hostname.toLowerCase();
}

function normalizeProjectKey(value) {
  if (!isNonEmptyString(value) || !/^[A-Za-z][A-Za-z0-9_]*$/.test(value)) {
    throw codedError(
      "CONFIG_INVALID",
      `Invalid Jira project key ${JSON.stringify(value)}`,
    );
  }
  return value.toUpperCase();
}

function assertObject(candidate, location) {
  if (
    candidate === null ||
    typeof candidate !== "object" ||
    Array.isArray(candidate)
  ) {
    throw new Error(`${location} must be a JSON object`);
  }
}

function assertExactKeys(candidate, allowedKeys, location) {
  assertAllowedKeys(candidate, allowedKeys, location);
  for (const key of allowedKeys) {
    if (!Object.hasOwn(candidate, key)) {
      throw new Error(`${location} is missing ${key}`);
    }
  }
}

function assertAllowedKeys(candidate, allowedKeys, location) {
  const unexpectedKeys = Object.keys(candidate).filter(
    (key) => !allowedKeys.includes(key),
  );
  if (unexpectedKeys.length > 0) {
    throw new Error(`${location} has unexpected keys: ${unexpectedKeys.join(", ")}`);
  }
}

function isNonEmptyString(candidate) {
  return typeof candidate === "string" && candidate.trim().length > 0;
}

function cloneJson(value) {
  return value === null ? null : JSON.parse(JSON.stringify(value));
}

function malformedState(statePath, reason) {
  throw codedError(
    "CONFIG_MALFORMED",
    `Malformed workflow state at ${statePath}: ${reason}. ` +
      "The file was not changed; repair or move it, then retry.",
  );
}

function codedError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
