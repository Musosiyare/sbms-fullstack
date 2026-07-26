import { useEffect, useState } from "react";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import { Table, Thead, Th, Td, EmptyRow } from "../components/ui/Table";
import api from "../api/client";
import { ExternalLink } from "lucide-react";

const ROLE_LABEL = { dean_of_discipline: "Dean of Discipline", disciplinary_officer: "Disciplinary Officer" };
const ROLE_TONE = { dean_of_discipline: "dod", disciplinary_officer: "officer" };

/**
 * Read-only by design. Who holds a discipline role is assigned from the
 * main school system's Teachers page (a manager sets it there), not from
 * inside SBMS — this page just shows the current result.
 */
export default function StaffRoles() {
  const [staff, setStaff] = useState(null);

  useEffect(() => {
    api.get("/reference/discipline-staff").then((r) => setStaff(r.data));
  }, []);

  return (
    <Card
      title="Staff roles"
      subtitle="Assigned from the main school system's Teachers page — this is a read-only view."
    >
      <div className="mb-4 flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-600">
        <ExternalLink size={15} className="shrink-0 mt-0.5 text-slate-400" />
        <span>
          To assign or change someone's Dean of Discipline / Disciplinary Officer role, go to{" "}
          <span className="font-medium text-slate-800">Teachers</span> in the main school system.
        </span>
      </div>

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
            staff.map((u) => (
              <tr key={u.id}>
                <Td>{u.name}</Td>
                <Td>{u.email}</Td>
                <Td>
                  <Badge tone={ROLE_TONE[u.disciplineRole]}>{ROLE_LABEL[u.disciplineRole]}</Badge>
                </Td>
              </tr>
            ))
          )}
        </tbody>
      </Table>
    </Card>
  );
}
