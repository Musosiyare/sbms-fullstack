import { capitalizeFirst } from "./text";

const SEVERITY_GROUP_LABEL = { severe: "Severe", moderate: "Moderate", minor: "Minor" };
const SEVERITY_ORDER = { severe: 0, moderate: 1, minor: 2 };

/**
 * Turns the raw misconduct-type list (as returned by getMisconductTypes)
 * into options for SearchableSelect: grouped by severity (most serious
 * first, since those are the ones staff need to find fastest), each
 * showing its default deduction inline, and searchable by title or
 * description so someone typing "phone" still finds "Unauthorized use of
 * mobile phone in class" even if they don't recall the exact wording.
 */
export function buildMisconductOptions(types) {
  return [...(types || [])]
    .sort(
      (a, b) =>
        (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9) ||
        a.title.localeCompare(b.title)
    )
    .map((t) => ({
      id: t.id,
      label: `${capitalizeFirst(t.title)} (-${t.defaultDeduction})`,
      searchText: `${t.title} ${t.description || ""}`,
      group: SEVERITY_GROUP_LABEL[t.severity] || "Other",
      sendHome: t.requiresSendHome,
    }));
}
