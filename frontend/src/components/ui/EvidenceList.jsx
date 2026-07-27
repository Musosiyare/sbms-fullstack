import { useState } from "react";
import { toast } from "sonner";
import { Paperclip, Download, Trash2, FileText, Image as ImageIcon, File as FileIcon } from "lucide-react";
import { deleteEvidence } from "../../api/sbms";
import { viewEvidence, downloadEvidenceFile, formatFileSize, isImageEvidence, isPdfEvidence } from "../../utils/evidence";

/**
 * Shows the proof files attached to one record — click to view (opens in
 * a new tab), a separate download icon to save it, and (only once the
 * report has NOT yet been approved, and only for whoever uploaded that
 * specific file — mirrors the backend restriction) a remove button. A
 * pending or rejected report still allows removal; once discipline
 * approves it, the evidence becomes part of the historical record and
 * can no longer be deleted. Discipline staff reviewing the queue can
 * look at evidence but can't delete a teacher's file just because
 * they're reviewing the report.
 */
export default function EvidenceList({ record, currentUser, onChange, readOnly = false }) {
  const [busyId, setBusyId] = useState(null);

  const canDelete = (item) =>
    !readOnly && currentUser && record.status !== "finalized" && item.uploadedByUserId === currentUser.id;

  async function handleView(item) {
    try {
      await viewEvidence(record.id, item);
    } catch (err) {
      toast.error("Couldn't open file", { description: err.message });
    }
  }

  async function handleDownload(item) {
    try {
      await downloadEvidenceFile(record.id, item);
    } catch (err) {
      toast.error("Couldn't download file", { description: err.message });
    }
  }

  async function handleDelete(item) {
    setBusyId(item.id);
    try {
      await deleteEvidence(record.id, item.id);
      onChange?.();
    } catch (err) {
      toast.error("Couldn't remove file", { description: err.message });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <p className="flex items-center gap-1 text-xs font-medium text-slate-500">
        <Paperclip size={12} /> Evidence ({record.evidence.length})
      </p>
      <ul className="flex flex-col gap-1">
        {record.evidence.map((item) => (
          <li
            key={item.id}
            className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-1.5 text-xs"
          >
            {isImageEvidence(item.mimeType) ? (
              <ImageIcon size={13} className="shrink-0 text-brand-500" />
            ) : isPdfEvidence(item.mimeType) ? (
              <FileText size={13} className="shrink-0 text-red-500" />
            ) : (
              <FileIcon size={13} className="shrink-0 text-slate-400" />
            )}
            <button
              type="button"
              onClick={() => handleView(item)}
              className="min-w-0 flex-1 truncate text-left text-slate-700 hover:text-brand-600 hover:underline"
              title={item.fileName}
            >
              {item.fileName}
            </button>
            <span className="shrink-0 text-slate-400">{formatFileSize(item.fileSize)}</span>
            <button
              type="button"
              onClick={() => handleDownload(item)}
              className="shrink-0 text-slate-400 hover:text-slate-600"
              aria-label={`Download ${item.fileName}`}
            >
              <Download size={13} />
            </button>
            {canDelete(item) && (
              <button
                type="button"
                onClick={() => handleDelete(item)}
                disabled={busyId === item.id}
                className="shrink-0 text-slate-400 hover:text-red-500 disabled:opacity-40"
                aria-label={`Remove ${item.fileName}`}
              >
                <Trash2 size={13} />
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
