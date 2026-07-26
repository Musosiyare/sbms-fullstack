import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useConfirm } from "./ui/ConfirmProvider";
import NotificationBell from "./NotificationBell";
import {
  ShieldAlert,
  LayoutDashboard,
  FlagTriangleRight,
  ClipboardList,
  BarChart3,
  GraduationCap,
  ListChecks,
  UserCog,
  UserRound,
  LogOut,
  Menu,
  X,
  MessageCircle,
} from "lucide-react";

const CAN_SEE_QUEUE = ["dean_of_discipline", "disciplinary_officer", "manager"];

const ROLE_META = {
  manager: { label: "Manager", accent: "bg-manager", text: "text-manager", tint: "bg-blue-50 border-blue-100" },
  dean_of_discipline: { label: "Dean of Discipline", accent: "bg-dod", text: "text-dod", tint: "bg-brand-50 border-brand-100" },
  disciplinary_officer: { label: "Disciplinary Officer", accent: "bg-officer", text: "text-officer", tint: "bg-amber-50 border-amber-100" },
  reporter: { label: "Teacher", accent: "bg-reporter", text: "text-reporter", tint: "bg-teal-50 border-teal-100" },
};

const NAV = {
  manager: [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { to: "/report", label: "Report a Mistake", icon: FlagTriangleRight },
    { to: "/records", label: "Records", icon: ClipboardList },
    { to: "/discussions", label: "Discussions", icon: MessageCircle },
    { to: "/class-report", label: "Class Report", icon: BarChart3 },
    { to: "/yearly-report", label: "Yearly Report", icon: GraduationCap },
    { to: "/staff-roles", label: "Staff Roles", icon: UserCog },
  ],
  dean_of_discipline: [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { to: "/records", label: "Records", icon: ClipboardList },
    { to: "/discussions", label: "Discussions", icon: MessageCircle },
    { to: "/class-report", label: "Class Report", icon: BarChart3 },
    { to: "/yearly-report", label: "Yearly Report", icon: GraduationCap },
    { to: "/misconduct-types", label: "Misconduct Types", icon: ListChecks },
    { to: "/staff-roles", label: "Staff Roles", icon: UserCog },
  ],
  disciplinary_officer: [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { to: "/report", label: "Report a Mistake", icon: FlagTriangleRight },
    { to: "/records", label: "Records", icon: ClipboardList },
    { to: "/discussions", label: "Discussions", icon: MessageCircle },
    { to: "/class-report", label: "Class Report", icon: BarChart3 },
    { to: "/yearly-report", label: "Yearly Report", icon: GraduationCap },
    { to: "/staff-roles", label: "Staff Roles", icon: UserCog },
  ],
  reporter: [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { to: "/report", label: "Report a Mistake", icon: FlagTriangleRight },
    { to: "/discussions", label: "Discussions", icon: MessageCircle },
  ],
};

const PAGE_META = {
  "/dashboard": { title: "Dashboard", subtitle: "Here's what needs attention." },
  "/report": { title: "Report a Mistake", subtitle: "Flag an incident for the discipline office to review." },
  "/records": { title: "Records", subtitle: "Pending reports and finalized misconduct records." },
  "/discussions": { title: "Discussions", subtitle: "Case-conference threads on students' mistakes." },
  "/class-report": { title: "Class Report", subtitle: "Termly conduct scores, per student." },
  "/yearly-report": { title: "Yearly Report", subtitle: "All three terms combined — promotion or dismissal, per student." },
  "/misconduct-types": { title: "Misconduct Types", subtitle: "The catalog of offenses and their default deductions." },
  "/staff-roles": { title: "Staff Roles", subtitle: "Assign Dean of Discipline and Disciplinary Officer access." },
  "/profile": { title: "Profile", subtitle: "Your account and password." },
};

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const confirm = useConfirm();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (!user || location.pathname === "/") return children;

  const meta = ROLE_META[user.sbmsRole] || ROLE_META.reporter;
  const nav = NAV[user.sbmsRole] || NAV.reporter;
  const page = PAGE_META[location.pathname] || { title: "SBMS", subtitle: "" };

  async function handleLogout() {
    setMobileOpen(false);
    const ok = await confirm({
      title: "Log out?",
      message: "You'll need to log in again to access your dashboard.",
      confirmText: "Log out",
      cancelText: "Stay logged in",
      tone: "danger",
    });
    if (!ok) return;
    logout();
    navigate("/login");
  }

  const NavLinks = () => (
    <nav className="flex flex-col gap-1 px-3">
      {nav.map(({ to, label, icon: Icon }) => {
        const active = location.pathname === to;
        return (
          <Link
            key={to}
            to={to}
            onClick={() => setMobileOpen(false)}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              active ? `${meta.tint} ${meta.text} border` : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <Icon size={17} />
            {label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen flex">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:w-64 shrink-0 flex-col border-r border-slate-200 bg-white sticky top-0 h-screen">
        <div className="flex items-center gap-2.5 px-5 py-5 border-b border-slate-100">
          <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${meta.accent} text-white`}>
            <ShieldAlert size={18} />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800 font-display">SBMS</p>
            <p className="text-[11px] text-slate-400 -mt-0.5">Behavior Management</p>
          </div>
        </div>
        <div className="flex-1 py-4 overflow-y-auto">
          <NavLinks />
        </div>
        <div className="border-t border-slate-100 p-4">
          <Link
            to="/profile"
            onClick={() => setMobileOpen(false)}
            className="flex items-center gap-2.5 mb-3 rounded-lg -mx-1 px-1 py-1 hover:bg-slate-50"
          >
            <div className={`h-8 w-8 rounded-full ${meta.accent} text-white text-xs font-semibold flex items-center justify-center shrink-0`}>
              {user.name?.[0]?.toUpperCase() || "U"}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-800 truncate">{user.name}</p>
              <p className={`text-[11px] ${meta.text}`}>{meta.label}</p>
            </div>
          </Link>
          <Link
            to="/profile"
            onClick={() => setMobileOpen(false)}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
          >
            <UserRound size={15} /> Profile
          </Link>
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
          >
            <LogOut size={15} /> Log out
          </button>
        </div>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-72 bg-white flex flex-col">
            <div className="flex items-center justify-between px-5 py-5 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${meta.accent} text-white`}>
                  <ShieldAlert size={18} />
                </div>
                <p className="text-sm font-semibold text-slate-800 font-display">SBMS</p>
              </div>
              <button onClick={() => setMobileOpen(false)} className="text-slate-400 p-1">
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 py-4 overflow-y-auto">
              <NavLinks />
            </div>
            <div className="border-t border-slate-100 p-4">
              <Link
                to="/profile"
                onClick={() => setMobileOpen(false)}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
              >
                <UserRound size={15} /> Profile
              </Link>
              <button
                onClick={handleLogout}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
              >
                <LogOut size={15} /> Log out
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main column */}
      <div className="flex-1 min-w-0">
        <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-slate-200 px-4 sm:px-6 py-4 flex items-center gap-3">
          <button onClick={() => setMobileOpen(true)} className="md:hidden text-slate-500 p-1">
            <Menu size={22} />
          </button>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-slate-800 font-display truncate">{page.title}</h1>
            {page.subtitle && <p className="text-sm text-slate-500 truncate">{page.subtitle}</p>}
          </div>
          {CAN_SEE_QUEUE.includes(user.sbmsRole) && <NotificationBell />}
        </header>
        <main className="p-4 sm:p-6 max-w-6xl mx-auto">{children}</main>
      </div>
    </div>
  );
}
