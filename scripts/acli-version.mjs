export const ACLI_MINIMUM_VERSION = "1.3.15";
export const ACLI_MAXIMUM_EXCLUSIVE_VERSION = "2.0.0";
export const ACLI_SUPPORTED_RANGE = ">=1.3.15,<2.0.0";

export function parseAcliVersion(output) {
  if (typeof output !== "string") return null;
  const match = output.match(
    /(?:^|\s)acli\s+version\s+(\d+)\.(\d+)\.(\d+)(?:-([A-Za-z0-9.-]+))?(?:\s|$)/,
  );
  if (!match) return null;
  const [, major, minor, patch, channel = null] = match;
  return {
    raw: `${major}.${minor}.${patch}${channel ? `-${channel}` : ""}`,
    version: `${Number(major)}.${Number(minor)}.${Number(patch)}`,
    major: Number(major),
    minor: Number(minor),
    patch: Number(patch),
    channel,
  };
}

export function classifyAcliVersion(output) {
  const parsed = parseAcliVersion(output);
  if (!parsed) {
    return { supported: false, reason: "unparseable", version: null };
  }

  const belowMinimum = compare(parsed, { major: 1, minor: 3, patch: 15 }) < 0;
  const atOrAboveMaximum = compare(parsed, { major: 2, minor: 0, patch: 0 }) >= 0;
  return {
    supported: !belowMinimum && !atOrAboveMaximum,
    reason: belowMinimum ? "below-minimum" : atOrAboveMaximum ? "above-maximum" : "supported",
    version: parsed,
  };
}

function compare(left, right) {
  for (const key of ["major", "minor", "patch"]) {
    if (left[key] !== right[key]) return left[key] < right[key] ? -1 : 1;
  }
  return 0;
}
