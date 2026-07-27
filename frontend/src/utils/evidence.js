import { fetchEvidenceBlob } from "../api/sbms";

export const MAX_EVIDENCE_FILE_SIZE = 15 * 1024 * 1024; // 15MB, mirrors backend/src/middleware/upload.js
export const MAX_EVIDENCE_FILES = 6; // mirrors backend/src/middleware/upload.js

export const ACCEPTED_EVIDENCE_TYPES = {
  "image/jpeg": ".jpg/.jpeg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/heic": ".heic",
  "image/heif": ".heif",
  "application/pdf": ".pdf",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
};

export function isAcceptedEvidenceType(file) {
  return Object.prototype.hasOwnProperty.call(ACCEPTED_EVIDENCE_TYPES, file.type);
}

export function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function isImageEvidence(mimeType) {
  return mimeType?.startsWith("image/");
}

export function isPdfEvidence(mimeType) {
  return mimeType === "application/pdf";
}

/**
 * Fetches an evidence file as a blob (so the request carries the same
 * Authorization header as every other API call — a plain <a href> can't
 * do that) and opens it in a new tab. Object URLs are revoked shortly
 * after so they don't pile up across a long session.
 */
export async function viewEvidence(recordId, evidence) {
  const blob = await fetchEvidenceBlob(recordId, evidence.id);
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Same fetch, but forces a save-as-file instead of opening a tab. */
export async function downloadEvidenceFile(recordId, evidence) {
  const blob = await fetchEvidenceBlob(recordId, evidence.id);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = evidence.fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
