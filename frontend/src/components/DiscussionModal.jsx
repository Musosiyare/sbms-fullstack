import { useEffect, useRef, useState } from "react";
import Modal from "./ui/Modal";
import DiscussionThread from "./DiscussionThread";
import { getDiscussionForRecord } from "../api/sbms";
import { capitalizeFirst } from "../utils/text";

const POLL_MS = 6000;

/**
 * `record` needs at minimum { id, Student, MisconductType, customTitle }.
 * If `initialDiscussion` is passed (e.g. coming from the Discussions
 * overview page, which already has the full thread), it's used instead
 * of an extra fetch on open.
 */
export default function DiscussionModal({ record, currentUser, initialDiscussion, onClose, isCurrentYear = true }) {
  const [discussion, setDiscussion] = useState(initialDiscussion !== undefined ? initialDiscussion : undefined);
  const pollRef = useRef(null);

  async function refetch(recordId) {
    try {
      const data = await getDiscussionForRecord(recordId);
      setDiscussion(data);
    } catch {
      // Silent — polling failures shouldn't interrupt an open conversation.
    }
  }

  // Re-fetch by record whenever the target record changes (not by
  // whatever discussion.id happened to be in state) — otherwise a stale
  // discussion from a previously-viewed record/year can keep polling
  // itself back into view under a new record.
  useEffect(() => {
    if (initialDiscussion !== undefined) {
      setDiscussion(initialDiscussion);
    } else {
      setDiscussion(undefined);
      refetch(record.id);
    }
    pollRef.current = setInterval(() => refetch(record.id), POLL_MS);
    return () => clearInterval(pollRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record.id]);

  function handleChange(next) {
    if (next?.__refresh) {
      refetch(record.id);
    } else {
      setDiscussion(next);
    }
  }

  const studentName = record.Student ? `${record.Student.firstName} ${record.Student.lastName}` : "";
  const incident = capitalizeFirst(record.MisconductType?.title) || record.customTitle || "Incident";

  return (
    <Modal open onClose={onClose} title="Discussion" size="lg">
      <div className="mb-4 flex items-center gap-2 rounded-lg border border-slate-100 bg-[#f7f5f6] px-3.5 py-2.5">
        <div>
          <p className="text-sm font-medium text-slate-800">{studentName}</p>
          <p className="text-xs text-slate-500">{incident}</p>
        </div>
      </div>
      <DiscussionThread
        record={record}
        discussion={discussion}
        currentUser={currentUser}
        onChange={handleChange}
        isCurrentYear={isCurrentYear}
      />
    </Modal>
  );
}
