import { useState } from "react";
import { toast } from "sonner";
import Button from "./ui/Button";
import Badge from "./ui/Badge";
import { Textarea } from "./ui/FormField";
import {
  MessageCircle,
  Send,
  Lock,
  LockOpen,
  Gavel,
  UserCog,
  ShieldCheck,
  PenLine,
} from "lucide-react";
import {
  openDiscussion,
  closeDiscussion,
  reopenDiscussion,
  postDiscussionMessage,
} from "../api/sbms";

const ROLE_META = {
  manager: { label: "Manager", tone: "manager", icon: UserCog },
  dean_of_discipline: { label: "Dean of Discipline", tone: "dod", icon: Gavel },
  disciplinary_officer: { label: "Disciplinary Officer", tone: "officer", icon: ShieldCheck },
  reporter: { label: "Teacher", tone: "reporter", icon: PenLine },
};

function fmtWhen(d) {
  if (!d) return "";
  return new Date(d).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function Avatar({ role }) {
  const meta = ROLE_META[role] || ROLE_META.reporter;
  const Icon = meta.icon;
  const BG = { manager: "bg-manager", dod: "bg-dod", officer: "bg-officer", reporter: "bg-reporter" };
  return (
    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${BG[meta.tone]} text-white`}>
      <Icon size={14} strokeWidth={2.25} />
    </div>
  );
}

function MessageBubble({ msg, isSelf }) {
  const meta = ROLE_META[msg.authorRole] || ROLE_META.reporter;
  return (
    <div className={`flex gap-2.5 ${isSelf ? "flex-row-reverse text-right" : ""}`}>
      <Avatar role={msg.authorRole} />
      <div className={`flex max-w-[80%] flex-col gap-1 ${isSelf ? "items-end" : "items-start"}`}>
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <span className="font-medium text-slate-600">{msg.author?.name || "Unknown"}</span>
          <span>&middot;</span>
          <span>{meta.label}</span>
        </div>
        <div
          className={`rounded-2xl px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
            isSelf ? "rounded-tr-sm bg-brand-500 text-white" : "rounded-tl-sm bg-slate-100 text-slate-700"
          }`}
        >
          {msg.message}
        </div>
        <span className="text-[11px] text-slate-400">{fmtWhen(msg.createdAt)}</span>
      </div>
    </div>
  );
}

/**
 * The thread itself: header (status + who opened/closed it), the message
 * list, a composer, and the management controls. The Dean of Discipline
 * and the school Manager have identical rights here — starting, closing,
 * and reopening a thread. `discussion` is `null` when nothing has been
 * started yet, `undefined` while loading.
 */
export default function DiscussionThread({ record, discussion, currentUser, onChange, isCurrentYear = true }) {
  const [draft, setDraft] = useState("");
  const [closingNote, setClosingNote] = useState("");
  const [showCloseForm, setShowCloseForm] = useState(false);
  const [busy, setBusy] = useState(false);

  const isDod = currentUser.sbmsRole === "dean_of_discipline";
  const isManager = currentUser.sbmsRole === "manager";
  const canManage = isDod || isManager; // Dean of Discipline and Manager: start, close, reopen
  // A discussion is a live conversation, so starting, posting to, or
  // reopening one only makes sense for the current academic year — old
  // years' threads stay fully readable (and closable), same as the
  // backend's assertCurrentAcademicYear.
  const canPost = discussion && discussion.status === "open" && isCurrentYear;

  async function handleStart() {
    setBusy(true);
    try {
      const created = await openDiscussion({ misconductRecordId: record.id, message: draft.trim() || undefined });
      setDraft("");
      onChange(created);
      toast.success("Discussion opened");
    } catch (err) {
      toast.error(err.message || "Could not open discussion");
    } finally {
      setBusy(false);
    }
  }

  async function handleSend() {
    if (!draft.trim()) return;
    setBusy(true);
    try {
      await postDiscussionMessage(discussion.id, draft.trim());
      setDraft("");
      onChange({ ...discussion, __refresh: Date.now() }); // signal parent to refetch the thread
    } catch (err) {
      toast.error(err.message || "Could not send message");
    } finally {
      setBusy(false);
    }
  }

  async function handleClose() {
    setBusy(true);
    try {
      const updated = await closeDiscussion(discussion.id, closingNote.trim() || undefined);
      setShowCloseForm(false);
      setClosingNote("");
      onChange(updated);
      toast.success("Discussion closed");
    } catch (err) {
      toast.error(err.message || "Could not close discussion");
    } finally {
      setBusy(false);
    }
  }

  async function handleReopen() {
    setBusy(true);
    try {
      const updated = await reopenDiscussion(discussion.id);
      onChange(updated);
      toast.success("Discussion reopened");
    } catch (err) {
      toast.error(err.message || "Could not reopen discussion");
    } finally {
      setBusy(false);
    }
  }

  // Nothing started yet.
  if (discussion === null) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-200 px-6 py-10 text-center">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-50 text-brand-500">
          <MessageCircle size={20} strokeWidth={2.25} />
        </div>
        {!isCurrentYear ? (
          <p className="text-sm text-slate-500">
            No discussion was opened on this record, and it's from a past academic year — discussions can only be
            started for the current year.
          </p>
        ) : canManage ? (
          <>
            <p className="text-sm text-slate-600">
              No discussion yet. Start one to loop in the teacher, discipline staff, and manager before deciding.
            </p>
            <Textarea
              rows={3}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={'Optional — kick off with a question or context (e.g. "Is this a first offense?")'}
              className="w-full"
            />
            <Button onClick={handleStart} disabled={busy}>
              <MessageCircle size={14} /> Open discussion
            </Button>
          </>
        ) : (
          <p className="text-sm text-slate-500">
            No discussion has been opened on this record yet. The Dean of Discipline or the school Manager can start
            one.
          </p>
        )}
      </div>
    );
  }

  if (discussion === undefined) {
    return <p className="py-8 text-center text-sm text-slate-400">Loading discussion...</p>;
  }

  const messages = discussion.messages || [];

  return (
    <div className="flex flex-col gap-4">
      {/* Header / status strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3.5 py-2.5 text-xs text-slate-500">
        <div className="flex items-center gap-2">
          <Badge tone={discussion.status === "open" ? "ok" : "neutral"}>
            {discussion.status === "open" ? <LockOpen size={11} /> : <Lock size={11} />}
            {discussion.status === "open" ? "Open" : "Closed"}
          </Badge>
          <span>
            Opened by <span className="font-medium text-slate-700">{discussion.openedBy?.name}</span> &middot;{" "}
            {fmtWhen(discussion.openedAt)}
          </span>
        </div>
        {discussion.status === "closed" && discussion.closedBy && (
          <span>
            Closed by <span className="font-medium text-slate-700">{discussion.closedBy.name}</span> &middot;{" "}
            {fmtWhen(discussion.closedAt)}
          </span>
        )}
      </div>
      {discussion.status === "closed" && discussion.closingNote && (
        <div className="rounded-lg border border-slate-100 bg-white px-3.5 py-2.5 text-sm text-slate-600">
          <span className="font-medium text-slate-700">Closing note: </span>
          {discussion.closingNote}
        </div>
      )}

      {/* Messages */}
      <div className="flex max-h-80 flex-col gap-4 overflow-y-auto pr-1">
        {messages.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">No messages yet — say something below.</p>
        ) : (
          messages.map((m) => <MessageBubble key={m.id} msg={m} isSelf={m.authorUserId === currentUser.id} />)
        )}
      </div>

      {/* Composer */}
      {canPost ? (
        <div className="flex items-end gap-2 border-t border-slate-100 pt-3">
          <Textarea
            rows={2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Write a message..."
            className="flex-1"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          <Button onClick={handleSend} disabled={busy || !draft.trim()}>
            <Send size={14} />
          </Button>
        </div>
      ) : (
        <p className="border-t border-slate-100 pt-3 text-center text-xs text-slate-400">
          {!isCurrentYear
            ? "This record is from a past academic year — this discussion is read-only."
            : "This discussion is closed — nobody can post until it's reopened."}
        </p>
      )}

      {/* Dean of Discipline / Manager controls */}
      {canManage && (
        <div className="border-t border-slate-100 pt-3">
          {discussion.status === "open" ? (
            showCloseForm ? (
              <div className="flex flex-col gap-2">
                <Textarea
                  rows={2}
                  value={closingNote}
                  onChange={(e) => setClosingNote(e.target.value)}
                  placeholder="Optional closing note — e.g. the decision that was reached"
                />
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setShowCloseForm(false)}>
                    Cancel
                  </Button>
                  <Button variant="danger" size="sm" onClick={handleClose} disabled={busy}>
                    <Lock size={13} /> End discussion
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="secondary" size="sm" onClick={() => setShowCloseForm(true)}>
                <Lock size={13} /> End discussion
              </Button>
            )
          ) : isCurrentYear ? (
            <Button variant="secondary" size="sm" onClick={handleReopen} disabled={busy}>
              <LockOpen size={13} /> Reopen discussion
            </Button>
          ) : (
            <p className="text-center text-xs text-slate-400">
              This discussion is closed and can't be reopened — its record is from a past academic year.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
