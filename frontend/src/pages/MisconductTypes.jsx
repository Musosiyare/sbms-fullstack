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
import PillSelect from "../components/ui/PillSelect";
import { getMisconductTypes, createMisconductType, updateMisconductType, deleteMisconductType } from "../api/sbms";
import { capitalizeFirst } from "../utils/text";
import { Plus, Pencil, Trash2, Search } from "lucide-react";

const SEVERITY_TONE = { minor: "neutral", moderate: "warning", severe: "danger" };
const DEDUCTION_TONE = {
  minor: "bg-slate-50 text-slate-700 ring-1 ring-slate-200",
  moderate: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  severe: "bg-red-50 text-red-700 ring-1 ring-red-200",
};

export default function MisconductTypes() {
  const confirm = useConfirm();
  const [types, setTypes] = useState(null);
  const [editing, setEditing] = useState(null); // type being edited, or {} for new
  const [search, setSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState(""); // "" = all

  function refresh() {
    getMisconductTypes().then(setTypes);
  }

  useEffect(refresh, []);

  const filteredTypes = (types || []).filter((t) => {
    if (severityFilter && t.severity !== severityFilter) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return t.title.toLowerCase().includes(q) || (t.description || "").toLowerCase().includes(q);
  });

  async function handleDelete(type) {
    const ok = await confirm({
      title: "Disable this misconduct type?",
      message: `"${type.title}" will no longer appear when picking a type — existing records that reference it are unaffected.`,
      confirmText: "Disable",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await deleteMisconductType(type.id);
      toast.success("Misconduct type disabled");
      refresh();
    } catch (err) {
      toast.error("Couldn't disable type", { description: err.message });
    }
  }

  return (
    <Card
      title="Misconduct types"
      actions={
        <Button onClick={() => setEditing({})}>
          <Plus size={15} /> Add type
        </Button>
      }
    >
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <div className="relative max-w-sm w-full">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search misconduct types..."
            className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 outline-none transition focus:border-brand-400 focus:bg-white focus:ring-4 focus:ring-brand-100"
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
      </div>

      <Table>
        <Thead>
          <tr>
            <Th>Title</Th>
            <Th>Severity</Th>
            <Th>Default deduction</Th>
            <Th>Scope</Th>
            <Th></Th>
          </tr>
        </Thead>
        <tbody>
          {types === null ? (
            <EmptyRow colSpan={5}>Loading...</EmptyRow>
          ) : filteredTypes.length === 0 ? (
            <EmptyRow colSpan={5}>{search || severityFilter ? "No matches for your filters." : ""}</EmptyRow>
          ) : (
            filteredTypes.map((t) => (
              <tr key={t.id}>
                <Td>
                  <p className="font-medium text-slate-800">{capitalizeFirst(t.title)}</p>
                  {t.description && <p className="text-xs text-slate-400">{t.description}</p>}
                  {t.requiresSendHome && (
                    <p className="mt-1 text-xs text-amber-600 font-medium">
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
                  <div className="flex gap-2">
                    <button onClick={() => setEditing(t)} className="text-brand-500 hover:text-brand-700" aria-label="Edit">
                      <Pencil size={15} />
                    </button>
                    <button onClick={() => handleDelete(t)} className="text-red-500 hover:text-red-700" aria-label="Disable">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </Td>
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
