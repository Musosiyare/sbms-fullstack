import { useEffect, useState } from "react";
import { toast } from "sonner";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import Badge from "../components/ui/Badge";
import Modal from "../components/ui/Modal";
import { Field, Input, Select, Textarea } from "../components/ui/FormField";
import { ErrorText } from "../components/ui/Alerts";
import { Table, Thead, Th, Td, EmptyRow } from "../components/ui/Table";
import { useConfirm } from "../components/ui/ConfirmProvider";
import { useAuth } from "../context/AuthContext";
import PillSelect from "../components/ui/PillSelect";
import { getMisconductTypes, createMisconductType, updateMisconductType, deleteMisconductType } from "../api/sbms";
import { capitalizeFirst } from "../utils/text";
import { Plus, Pencil, Trash2, Search, Power } from "lucide-react";

const SEVERITY_TONE = { minor: "neutral", moderate: "warning", severe: "danger" };
const DEDUCTION_TONE = {
  minor: "bg-slate-50 text-slate-700 ring-1 ring-slate-200",
  moderate: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  severe: "bg-red-50 text-red-700 ring-1 ring-red-200",
};

export default function MisconductTypes() {
  const { user } = useAuth();
  const canManage = user?.sbmsRole === "dean_of_discipline";
  const confirm = useConfirm();
  const [types, setTypes] = useState(null);
  const [editing, setEditing] = useState(null); // type being edited, or {} for new
  const [search, setSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState(""); // "" = all
  const [statusFilter, setStatusFilter] = useState(""); // "" = all, "active", "inactive"

  function refresh() {
    getMisconductTypes().then(setTypes);
  }

  useEffect(refresh, []);

  const filteredTypes = (types || []).filter((t) => {
    if (severityFilter && t.severity !== severityFilter) return false;
    if (statusFilter === "active" && !t.isActive) return false;
    if (statusFilter === "inactive" && t.isActive) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return t.title.toLowerCase().includes(q) || (t.description || "").toLowerCase().includes(q);
  });

  async function handleDelete(type) {
    if (type.recordsCount > 0) {
      await confirm({
        title: "Can't delete — it's in use",
        message: (
          <>
            <strong className="font-semibold text-slate-800">"{type.title}"</strong> is attached to{" "}
            <strong className="font-semibold text-slate-800">
              {type.recordsCount} existing record{type.recordsCount === 1 ? "" : "s"}
            </strong>
            . Deleting it would break those records' history, so it's blocked.
            <br />
            <br />
            Deactivate it instead — it will disappear from the picker for new incidents, while every record that
            already references it keeps working exactly as before.
          </>
        ),
        confirmText: "Got it",
        cancelText: "Close",
        tone: "danger",
      });
      return;
    }
    const ok = await confirm({
      title: "Delete this misconduct type?",
      message: (
        <>
          <strong className="font-semibold text-slate-800">"{type.title}"</strong> will be permanently deleted —
          this can't be undone.
        </>
      ),
      confirmText: "Delete",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await deleteMisconductType(type.id);
      toast.success("Misconduct type deleted");
      refresh();
    } catch (err) {
      toast.error("Couldn't delete type", { description: err.message });
    }
  }

  async function handleToggleActive(type) {
    const nextActive = !type.isActive;
    try {
      await updateMisconductType(type.id, { isActive: nextActive });
      toast.success(nextActive ? "Misconduct type activated" : "Misconduct type deactivated");
      refresh();
    } catch (err) {
      toast.error("Couldn't update status", { description: err.message });
    }
  }

  return (
    <Card
      title="Misconduct types"
      actions={
        canManage && (
          <Button onClick={() => setEditing({})}>
            <Plus size={15} /> Add type
          </Button>
        )
      }
    >
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <div className="relative max-w-sm w-full">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search misconduct types..."
            className="form-field w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 shadow-sm outline-none transition-all hover:border-slate-300 focus:border-brand-400 focus:bg-white"
          />
        </div>
        <PillSelect
          options={[
            { id: "", label: `All (${(types || []).length})` },
            { id: "severe", label: `Severe (${(types || []).filter((t) => t.severity === "severe").length})` },
            { id: "moderate", label: `Moderate (${(types || []).filter((t) => t.severity === "moderate").length})` },
            { id: "minor", label: `Minor (${(types || []).filter((t) => t.severity === "minor").length})` },
          ]}
          value={severityFilter}
          onChange={setSeverityFilter}
        />
        <PillSelect
          options={[
            { id: "", label: `Any status` },
            { id: "active", label: `Active (${(types || []).filter((t) => t.isActive).length})` },
            { id: "inactive", label: `Inactive (${(types || []).filter((t) => !t.isActive).length})` },
          ]}
          value={statusFilter}
          onChange={setStatusFilter}
        />
      </div>

      <Table>
        <Thead>
          <tr>
            <Th>Title</Th>
            <Th>Severity</Th>
            <Th>Default deduction</Th>
            <Th>Scope</Th>
            <Th>Status</Th>
            {canManage && <Th></Th>}
          </tr>
        </Thead>
        <tbody>
          {types === null ? (
            <EmptyRow colSpan={canManage ? 6 : 5}>Loading...</EmptyRow>
          ) : filteredTypes.length === 0 ? (
            <EmptyRow colSpan={canManage ? 6 : 5}>
              {search || severityFilter || statusFilter ? "No matches for your filters." : ""}
            </EmptyRow>
          ) : (
            filteredTypes.map((t) => (
              <tr key={t.id} className={!t.isActive ? "bg-slate-50/60" : ""}>
                <Td>
                  <p className={t.isActive ? "font-medium text-slate-800" : "font-normal italic text-slate-400"}>
                    {capitalizeFirst(t.title)}
                  </p>
                  {t.description && (
                    <p className={`text-xs ${t.isActive ? "text-slate-400" : "italic text-slate-300"}`}>
                      {t.description}
                    </p>
                  )}
                  {t.requiresSendHome && (
                    <p className={`mt-1 text-xs font-medium ${t.isActive ? "text-amber-600" : "italic text-slate-300"}`}>
                      Sent home {t.sendHomeDays} day{t.sendHomeDays === 1 ? "" : "s"}
                    </p>
                  )}
                </Td>
                <Td>
                  <Badge tone={SEVERITY_TONE[t.severity] || "neutral"}>{t.severity}</Badge>
                </Td>
                <Td>
                  <span
                    className={`inline-flex items-center justify-center rounded-lg px-2.5 py-1 text-sm font-semibold tabular-nums ${
                      DEDUCTION_TONE[t.severity] || DEDUCTION_TONE.minor
                    }`}
                  >
                    -{t.defaultDeduction}
                  </span>
                </Td>
                <Td>{t.schoolId ? t.School?.name || "This school" : "Global template"}</Td>
                <Td>
                  {canManage && t.schoolId ? (
                    <button
                      onClick={() => handleToggleActive(t)}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                        t.isActive
                          ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100"
                          : "bg-slate-100 text-slate-500 ring-1 ring-slate-200 hover:bg-slate-200"
                      }`}
                      title={t.isActive ? "Deactivate" : "Activate"}
                    >
                      <Power size={12} />
                      {t.isActive ? "Active" : "Inactive"}
                    </button>
                  ) : (
                    <Badge tone={t.isActive ? "ok" : "neutral"}>{t.isActive ? "Active" : "Inactive"}</Badge>
                  )}
                </Td>
                {canManage && (
                  <Td>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => t.isActive && setEditing(t)}
                        disabled={!t.isActive}
                        className={
                          t.isActive
                            ? "rounded-lg p-1.5 text-brand-500 hover:bg-brand-50 hover:text-brand-700 transition-colors"
                            : "rounded-lg p-1.5 text-slate-300 cursor-not-allowed"
                        }
                        aria-label="Edit"
                        title={t.isActive ? "Edit" : "Reactivate first to edit"}
                      >
                        <Pencil size={15} />
                      </button>
                      {t.schoolId && (
                        <button
                          onClick={() => handleDelete(t)}
                          className={
                            t.recordsCount > 0
                              ? "rounded-lg p-1.5 text-slate-300 cursor-not-allowed"
                              : "rounded-lg p-1.5 text-red-600 hover:bg-red-50 hover:text-red-700 transition-colors"
                          }
                          aria-label="Delete"
                          title={t.recordsCount > 0 ? `Used by ${t.recordsCount} record${t.recordsCount === 1 ? "" : "s"} — can't be deleted` : "Delete"}
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  </Td>
                )}
              </tr>
            ))
          )}
        </tbody>
      </Table>

      {editing && (
        <TypeModal
          initial={editing}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}
    </Card>
  );
}

// Mirrors MARKS_PER_TERM in the backend's conductScoreService — a single
// incident type can't be configured to outweigh an entire term's conduct
// marks, since that would let one incident alone decide a termly outcome.
const MAX_TERM_MARKS = 40;

function TypeModal({ initial, onClose, onDone }) {
  const isNew = !initial.id;
  const [title, setTitle] = useState(initial.title || "");
  const [description, setDescription] = useState(initial.description || "");
  const [defaultDeduction, setDefaultDeduction] = useState(initial.defaultDeduction ?? 5);
  const [severity, setSeverity] = useState(initial.severity || "minor");
  const [requiresSendHome, setRequiresSendHome] = useState(initial.requiresSendHome ?? false);
  const [sendHomeDays, setSendHomeDays] = useState(initial.sendHomeDays ?? 2);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    if (requiresSendHome && (!sendHomeDays || Number(sendHomeDays) <= 0)) {
      setError("Enter how many days the student is sent home for.");
      return;
    }
    if (!defaultDeduction || Number(defaultDeduction) <= 0) {
      setError("Default deduction must be a positive number.");
      return;
    }
    // Whether this exceeds the term's total conduct marks is checked and
    // enforced by the backend (not here, and not via the input's HTML
    // attributes) — its error message is shown below if it rejects it.
    setSubmitting(true);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim(),
        defaultDeduction: Number(defaultDeduction),
        severity,
        requiresSendHome,
        sendHomeDays: requiresSendHome ? Number(sendHomeDays) : null,
      };
      if (isNew) await createMisconductType(payload);
      else await updateMisconductType(initial.id, payload);
      toast.success(isNew ? "Misconduct type added" : "Misconduct type updated");
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={isNew ? "Add misconduct type" : "Edit misconduct type"} size="md">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Title">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Absent without permission" />
        </Field>
        <Field label="Description (optional)">
          <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label={`Default deduction (max ${MAX_TERM_MARKS})`}>
            <Input
              type="number"
              value={defaultDeduction}
              onChange={(e) => setDefaultDeduction(e.target.value)}
            />
          </Field>
          <Field label="Severity">
            <Select value={severity} onChange={(e) => setSeverity(e.target.value)}>
              <option value="minor">Minor</option>
              <option value="moderate">Moderate</option>
              <option value="severe">Severe</option>
            </Select>
          </Field>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={requiresSendHome}
              onChange={(e) => setRequiresSendHome(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-400"
            />
            Requires sending the student home (weekend)
          </label>
          {requiresSendHome && (
            <div className="mt-3 max-w-[160px]">
              <Field label="Number of days">
                <Input
                  type="number"
                  min="1"
                  value={sendHomeDays}
                  onChange={(e) => setSendHomeDays(e.target.value)}
                />
              </Field>
              <p className="mt-1.5 text-xs text-slate-400">
                Recording this incident will automatically fill in the sent-home date range.
              </p>
            </div>
          )}
        </div>

        <ErrorText>{error}</ErrorText>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Saving..." : "Save"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
