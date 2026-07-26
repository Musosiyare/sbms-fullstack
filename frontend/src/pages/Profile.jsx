import { useAuth } from "../context/AuthContext";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import ChangePasswordCard from "../components/ChangePasswordCard";

const ROLE_LABEL = {
  manager: "Manager",
  dean_of_discipline: "Dean of Discipline",
  disciplinary_officer: "Disciplinary Officer",
  reporter: "Teacher (report-only)",
};

const ROLE_TONE = {
  manager: "manager",
  dean_of_discipline: "dod",
  disciplinary_officer: "officer",
  reporter: "reporter",
};

export default function Profile() {
  const { user } = useAuth();

  return (
    <div>
      <Card title="Your account">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-500 text-white text-xl font-semibold shrink-0">
            {user.name?.[0]?.toUpperCase() || "U"}
          </div>
          <div>
            <p className="text-base font-semibold text-slate-800">{user.name}</p>
            <p className="text-sm text-slate-500">{user.email}</p>
            <Badge tone={ROLE_TONE[user.sbmsRole]} className="mt-1.5">
              {ROLE_LABEL[user.sbmsRole] || user.sbmsRole}
            </Badge>
          </div>
        </div>
        <p className="text-xs text-slate-400 mt-4">
          Your name and email are managed in the main school system — SBMS just uses the same login.
        </p>
      </Card>

      <ChangePasswordCard />
    </div>
  );
}
