// Deterministic per-name color for initials avatars (e.g. student roster
// circles) — same name always maps to the same color, and different names
// spread across a varied palette so a list of avatars doesn't read as a
// wall of identical circles. Palette follows the app's existing soft-badge
// style (bg-*-50, text-*-600) — see components/ui/Badge.jsx.
const PALETTE = [
  "bg-blue-50 text-blue-600",
  "bg-emerald-50 text-emerald-600",
  "bg-amber-50 text-amber-600",
  "bg-violet-50 text-violet-600",
  "bg-rose-50 text-rose-600",
  "bg-teal-50 text-teal-600",
  "bg-indigo-50 text-indigo-600",
  "bg-orange-50 text-orange-600",
  "bg-cyan-50 text-cyan-600",
  "bg-fuchsia-50 text-fuchsia-600",
  "bg-lime-50 text-lime-700",
  "bg-sky-50 text-sky-600",
];

/**
 * Returns a Tailwind class pair ("bg-x-50 text-x-600") for a given name,
 * stable across renders/reloads since it's derived from the string itself.
 */
export function getAvatarColor(name) {
  const str = (name || "").trim();
  if (!str) return "bg-slate-100 text-slate-500";
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0;
  }
  const index = Math.abs(hash) % PALETTE.length;
  return PALETTE[index];
}
