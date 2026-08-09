import { useEffect, useMemo, useState } from "react";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import { Table, Thead, Th, Td, EmptyRow } from "../components/ui/Table";
import api from "../api/client";
import { ExternalLink, Mail, ShieldCheck, Eye, Users } from "lucide-react";

const ROLE_LABEL = { dean_of_discipline: "Dean of Discipline", disciplinary_officer: "Disciplinary Officer" };
const ROLE_TONE = { dean_of_discipline: "dod", disciplinary_officer: "officer" };
const ROLE_ICON = { dean_of_discipline: ShieldCheck, disciplinary_officer: Eye };

// Avatar background/text colors per role, echoing the same tones as the
// role badge so the two read as one visual system rather than two
// unrelated color choices on the same row.
const ROLE_AVATAR = {
  dean_of_discipline: "bg-brand-50 text-brand-600 ring-1 ring-brand-200",
  disciplinary_officer: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
};

function initials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || name[0].toUpperCase();
}

/**
 * Read-only by design. Who holds a discipline role is assigned from the
 * main school system's Discipline Staff page (a manager sets it there), not
 * from inside SBMS — this page just shows the current result.
 */
export default function StaffRoles() {
  const [staff, setStaff] = useState(null);

  useEffect(() => {
    api.get("/reference/discipline-staff").then((r) => setStaff(r.data));
  }, []);

  const counts = useMemo(() => {
    const c = { dean_of_discipline: 0, disciplinary_officer: 0 };
    (staff || []).forEach((u) => {
      if (c[u.disciplineRole] !== undefined) c[u.disciplineRole] += 1;
    });
    return c;
  }, [staff]);

  return (
    <Card
      title="Staff roles"
      subtitle="Assigned from the main school system's Discipline Staff page — this is a read-only view."
    >
      <div className="mb-4 flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-600">
        <ExternalLink size={15} className="shrink-0 mt-0.5 text-slate-400" />
        <span>
          To assign or change someone's Dean of Discipline / Disciplinary Officer role, go to{" "}
          <span className="font-medium text-slate-800">Discipline Staff</span> in the main school system.
        </span>
      </div>

      {staff && staff.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg bg-slate-50 border border-slate-200 px-3.5 py-2.5 text-sm">
          <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700">
            <Users size={15} className="text-slate-400" />
            {staff.length} Staff Member{staff.length === 1 ? "" : "s"}
          </span>
          <span className="inline-flex items-center gap-1.5 text-slate-600">
            <ShieldCheck size={14} className="text-brand-500" />
            {counts.dean_of_discipline} Dean of Discipline
          </span>
          <span className="inline-flex items-center gap-1.5 text-slate-600">
            <Eye size={14} className="text-amber-500" />
            {counts.disciplinary_officer} Disciplinary Officer{counts.disciplinary_officer === 1 ? "" : "s"}
          </span>
        </div>
      )}

      <Table>
        <Thead>
          <tr>
            <Th>Name</Th>
            <Th>Email</Th>
            <Th>SBMS role</Th>
          </tr>
        </Thead>
        <tbody>
          {staff === null ? (
            <EmptyRow colSpan={3}>Loading...</EmptyRow>
          ) : staff.length === 0 ? (
            <EmptyRow colSpan={3}>No one has been assigned a role yet.</EmptyRow>
          ) : (
            staff.map((u) => {
              const RoleIcon = ROLE_ICON[u.disciplineRole];
              return (
                <tr key={u.id} className="transition hover:bg-slate-50/80">
                  <Td>
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                          ROLE_AVATAR[u.disciplineRole] || "bg-slate-100 text-slate-500 ring-1 ring-slate-200"
                        }`}
                      >
                        {initials(u.name)}
                      </span>
                      <span className="font-medium text-slate-800">{u.name}</span>
                    </div>
                  </Td>
                  <Td>
                    <span className="inline-flex items-center gap-1.5 text-slate-500">
                      <Mail size={13} className="text-blue-500 shrink-0" />
                      {u.email}
                    </span>
                  </Td>
                  <Td>
                    <Badge tone={ROLE_TONE[u.disciplineRole]}>
                      {RoleIcon && <RoleIcon size={12} />}
                      {ROLE_LABEL[u.disciplineRole]}
                    </Badge>
                  </Td>
                </tr>
              );
            })
          )}
        </tbody>
      </Table>
    </Card>
  );
}
