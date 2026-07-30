import { useRef } from "react";
import { Paperclip, FileText, Image as ImageIcon, File as FileIcon, X, Upload } from "lucide-react";
import {
  ACCEPTED_EVIDENCE_TYPES,
  MAX_EVIDENCE_FILES,
  MAX_EVIDENCE_FILE_SIZE,
  formatFileSize,
  isAcceptedEvidenceType,
  isImageEvidence,
  isPdfEvidence,
} from "../../utils/evidence";

const ACCEPT_ATTR = Object.keys(ACCEPTED_EVIDENCE_TYPES).join(",");

function FileTypeIcon({ mimeType }) {
  if (isImageEvidence(mimeType)) return <ImageIcon size={16} className="shrink-0 text-brand-500" />;
  if (isPdfEvidence(mimeType)) return <FileText size={16} className="shrink-0 text-red-500" />;
  return <FileIcon size={16} className="shrink-0 text-slate-400" />;
}

/**
 * Lets a teacher (reporting) or discipline staff (recording) attach proof
 * of an incident — photos, scanned notes, PDFs, or Word write-ups —
 * before submitting. Purely client-side selection/validation here; the
 * actual upload happens as part of the surrounding form's submit
 * (createReport/createRecord send these files along with the rest of the
 * payload as multipart/form-data). Mirrors the backend's own limits (15MB
 * per file, 6 files) so a rejected file is caught before submit, not
 * after a round trip.
 */
export default function EvidenceUpload({ files, onChange, disabled = false }) {
  const inputRef = useRef(null);

  function addFiles(list) {
    const incoming = Array.from(list);
    const next = [...files];
    let error = null;

    for (const file of incoming) {
      if (next.length >= MAX_EVIDENCE_FILES) {
        error = `You can attach up to ${MAX_EVIDENCE_FILES} files.`;
        break;
      }
      if (!isAcceptedEvidenceType(file)) {
        error = `"${file.name}" isn't a supported file type.`;
        continue;
      }
      if (file.size > MAX_EVIDENCE_FILE_SIZE) {
        error = `"${file.name}" is over the 15MB limit.`;
        continue;
      }
      if (next.some((f) => f.name === file.name && f.size === file.size)) continue; // skip exact dupes
      next.push(file);
    }

    onChange(next, error);
  }

  function handleDrop(e) {
    e.preventDefault();
    if (disabled) return;
    addFiles(e.dataTransfer.files);
  }

  function removeFile(index) {
    onChange(files.filter((_, i) => i !== index));
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onClick={() => !disabled && inputRef.current?.click()}
        className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-5 text-center transition ${
          disabled
            ? "border-slate-100 bg-slate-50 text-slate-300 cursor-not-allowed"
            : "border-slate-200 text-slate-500 hover:border-brand-400 hover:bg-brand-50/40 cursor-pointer"
        }`}
      >
        <Upload size={18} />
        <p className="text-sm">
          <span className="font-medium text-slate-700">Click to upload</span> or drag files here
        </p>
        <p className="text-xs text-slate-400">Images, PDF, or Word — up to 15MB each, {MAX_EVIDENCE_FILES} files max</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT_ATTR}
          disabled={disabled}
          className="hidden"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = ""; // allow re-selecting the same file after removing it
          }}
        />
      </div>

      {files.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {files.map((file, i) => (
            <li
              key={`${file.name}-${file.size}-${i}`}
              className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
            >
              <FileTypeIcon mimeType={file.type} />
              <span className="min-w-0 flex-1 truncate text-slate-700">{file.name}</span>
              <span className="shrink-0 text-xs text-slate-400">{formatFileSize(file.size)}</span>
              <button
                type="button"
                onClick={() => removeFile(i)}
                disabled={disabled}
                className="shrink-0 text-slate-400 hover:text-red-500 disabled:opacity-40"
                aria-label={`Remove ${file.name}`}
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function EvidenceFieldLabel() {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Paperclip size={14} /> Evidence (optional)
    </span>
  );
}
