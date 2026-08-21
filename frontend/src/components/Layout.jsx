import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useConfirm } from "./ui/ConfirmProvider";
import NotificationBell from "./NotificationBell";
import StudentSearch from "./StudentSearch";
import HeaderClock from "./HeaderClock";
import YearlyConductReportModal from "./YearlyConductReportModal";
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
  UserX,
  LogOut,
  Menu,
  X,
  MessageCircle,
  PanelLeftClose,
  PanelLeftOpen,
  Gavel,
  FileBarChart,
  Settings2,
  ChevronDown,
  History,
} from "lucide-react";

const SIDEBAR_COLLAPSED_KEY = "sbms:sidebarCollapsed";

const CAN_SEE_QUEUE = ["dean_of_discipline", "disciplinary_officer", "manager"];

const ROLE_META = {
  manager: { label: "Manager", accent: "bg-manager", text: "text-manager", textOnDark: "text-blue-300", tint: "bg-blue-50 border-blue-100" },
  dean_of_discipline: { label: "Dean of Discipline", accent: "bg-dod", text: "text-dod", textOnDark: "text-rose-300", tint: "bg-brand-50 border-brand-100" },
  disciplinary_officer: { label: "Disciplinary Officer", accent: "bg-officer", text: "text-officer", textOnDark: "text-amber-300", tint: "bg-amber-50 border-amber-100" },
  reporter: { label: "Teacher", accent: "bg-reporter", text: "text-reporter", textOnDark: "text-teal-300", tint: "bg-teal-50 border-teal-100" },
};

// Every role gets the Dashboard pinned above the fold, then its remaining
// links bucketed into up to 3 collapsible groups (Discipline / Reports /
// Administration) so the sidebar reads as a handful of topics instead of
// a long flat list. Groups a role has no links for are simply omitted.
const PINNED = { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard };

const NAV_GROUPS = {
  manager: [
    {
      id: "discipline",
      label: "Discipline",
      icon: Gavel,
      items: [
        { to: "/report", label: "Report a Mistake", icon: FlagTriangleRight },
        { to: "/records", label: "Records", icon: ClipboardList },
        { to: "/discussions", label: "Discussions", icon: MessageCircle },
        { to: "/activity-log", label: "Activity Log", icon: History },
      ],
    },
    {
      id: "reports",
      label: "Reports",
      icon: FileBarChart,
      items: [
        { to: "/class-report", label: "Termly Report", icon: BarChart3 },
        { to: "/yearly-report", label: "Yearly Report", icon: GraduationCap },
        { to: "/dismissed-students", label: "Dismissed Students", icon: UserX },
      ],
    },
    {
      id: "admin",
      label: "Administration",
      icon: Settings2,
      items: [{ to: "/staff-roles", label: "Staff Roles", icon: UserCog }],
    },
  ],
  dean_of_discipline: [
    {
      id: "discipline",
      label: "Discipline",
      icon: Gavel,
      items: [
        { to: "/records", label: "Records", icon: ClipboardList },
        { to: "/discussions", label: "Discussions", icon: MessageCircle },
        { to: "/activity-log", label: "Activity Log", icon: History },
      ],
    },
    {
      id: "reports",
      label: "Reports",
      icon: FileBarChart,
      items: [
        { to: "/class-report", label: "Termly Report", icon: BarChart3 },
        { to: "/yearly-report", label: "Yearly Report", icon: GraduationCap },
        { to: "/dismissed-students", label: "Dismissed Students", icon: UserX },
      ],
    },
    {
      id: "admin",
      label: "Administration",
      icon: Settings2,
      items: [
        { to: "/misconduct-types", label: "Misconduct Types", icon: ListChecks },
        { to: "/staff-roles", label: "Staff Roles", icon: UserCog },
      ],
    },
  ],
  disciplinary_officer: [
    {
      id: "discipline",
      label: "Discipline",
      icon: Gavel,
      items: [
        { to: "/report", label: "Report a Mistake", icon: FlagTriangleRight },
        { to: "/records", label: "Records", icon: ClipboardList },
        { to: "/discussions", label: "Discussions", icon: MessageCircle },
        { to: "/activity-log", label: "Activity Log", icon: History },
      ],
    },
    {
      id: "reports",
      label: "Reports",
      icon: FileBarChart,
      items: [
        { to: "/class-report", label: "Termly Report", icon: BarChart3 },
        { to: "/yearly-report", label: "Yearly Report", icon: GraduationCap },
        { to: "/dismissed-students", label: "Dismissed Students", icon: UserX },
      ],
    },
    {
      id: "admin",
      label: "Administration",
      icon: Settings2,
      items: [
        { to: "/misconduct-types", label: "Misconduct Types", icon: ListChecks },
        { to: "/staff-roles", label: "Staff Roles", icon: UserCog },
      ],
    },
  ],
  reporter: [
    {
      id: "discipline",
      label: "Discipline",
      icon: Gavel,
      items: [
        { to: "/report", label: "Report a Mistake", icon: FlagTriangleRight },
        { to: "/discussions", label: "Discussions", icon: MessageCircle },
        { to: "/activity-log", label: "Activity Log", icon: History },
      ],
    },
  ],
};

// Each nav group gets its own color so the sidebar reads as distinct
// topics at a glance, and so an open/active group is unmistakably
// different from the others — independent of the person's role color
// used elsewhere (avatar, profile tag). Tuned for the dark sidebar
// backdrop: translucent chips/tints instead of flat light-mode ones.
const GROUP_STYLES = {
  discipline: { text: "text-indigo-300", soft: "text-indigo-400", chip: "bg-indigo-500/20 text-indigo-300", tint: "bg-indigo-500/15 border-indigo-400/30 text-indigo-200", bar: "bg-indigo-400" },
  reports: { text: "text-sky-300", soft: "text-sky-400", chip: "bg-sky-500/20 text-sky-300", tint: "bg-sky-500/15 border-sky-400/30 text-sky-200", bar: "bg-sky-400" },
  admin: { text: "text-amber-300", soft: "text-amber-400", chip: "bg-amber-500/20 text-amber-300", tint: "bg-amber-500/15 border-amber-400/30 text-amber-200", bar: "bg-amber-400" },
};
const DEFAULT_GROUP_STYLE = { text: "text-slate-300", soft: "text-slate-500", chip: "bg-white/10 text-slate-300", tint: "bg-white/10 border-white/20 text-slate-100", bar: "bg-slate-400" };

// Flat fallback (pinned + every item, in order) — used for the icon-only
// collapsed desktop rail, where accordion headers wouldn't have room to
// show a label anyway. Each item keeps its groupId so the collapsed rail
// can still color active items per-group.
function flattenNav(groups) {
  return [
    { ...PINNED, groupId: null },
    ...groups.flatMap((g) => g.items.map((item) => ({ ...item, groupId: g.id }))),
  ];
}

const PAGE_META = {
  "/dashboard": { title: "Dashboard", subtitle: "Here's what needs attention.", icon: LayoutDashboard },
  "/report": { title: "Report a Mistake", subtitle: "Flag an incident for the discipline office to review.", icon: FlagTriangleRight },
  "/records": { title: "Records", subtitle: "Pending reports and finalized misconduct records.", icon: ClipboardList },
  "/discussions": { title: "Discussions", subtitle: "Case-conference threads on students' mistakes.", icon: MessageCircle },
  "/activity-log": { title: "Activity Log", subtitle: "What's happened in SBMS, scoped to what your role can see.", icon: History },
  "/class-report": { title: "Termly Report", subtitle: "Termly conduct scores, per student.", icon: BarChart3 },
  "/yearly-report": { title: "Yearly Report", subtitle: "All three terms combined — promotion or dismissal, per student.", icon: GraduationCap },
  "/dismissed-students": { title: "Dismissed Students", subtitle: "Every dismissed student — permanently, or for a term.", icon: UserX },
  "/misconduct-types": { title: "Misconduct Types", subtitle: "The catalog of offenses and their default deductions.", icon: ListChecks },
  "/staff-roles": { title: "Staff Roles", subtitle: "Assign Dean of Discipline and Disciplinary Officer access.", icon: UserCog },
  "/profile": { title: "Profile", subtitle: "Your account and password.", icon: UserRound },
};

// School logo for the sidebar brand mark, falling back to the generic
// shield icon (first load before the fetch resolves, no logo uploaded
// yet, or the image URL failing to load).
function BrandMark({ school, accentClass, size = 40, iconSize = 19 }) {
  const [broken, setBroken] = useState(false);
  const px = `${size}px`;
  if (school?.logoUrl && !broken) {
    return (
      <img
        src={school.logoUrl}
        alt={school.name ? `${school.name} logo` : "School logo"}
        onError={() => setBroken(true)}
        className="shrink-0 rounded-xl object-cover shadow-sm ring-1 ring-white/10"
        style={{ width: px, height: px }}
      />
    );
  }
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-xl ${accentClass} text-white shadow-sm ring-1 ring-white/10 transition-transform group-hover:scale-105`}
      style={{ width: px, height: px }}
    >
      <ShieldAlert size={iconSize} />
    </div>
  );
}

// Header brand mark for the current page — same colored square as
// BrandMark, but always shows that page's own nav icon (matching the
// sidebar) rather than the school logo or a fixed shield.
function PageIcon({ icon: Icon, accentClass, size = 30, iconSize = 14 }) {
  const px = `${size}px`;
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-xl ${accentClass} text-white shadow-sm ring-1 ring-white/10`}
      style={{ width: px, height: px }}
    >
      <Icon size={iconSize} />
    </div>
  );
}

export default function Layout({ children }) {
  const { user, school, logout } = useAuth();
  const confirm = useConfirm();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [searchPick, setSearchPick] = useState(null); // { studentId, academicYearId }
  const groups = NAV_GROUPS[user?.sbmsRole] || NAV_GROUPS.reporter;
  // Only one group open — and therefore colored/highlighted — at a time,
  // so switching topics doesn't leave a previous group's color lingering
  // on screen alongside the newly opened one.
  const [openGroupId, setOpenGroupId] = useState(() => {
    // Start with whichever group contains the current page open, so
    // landing on e.g. Class Report doesn't hide the very link you're on.
    const activeGroup = groups.find((g) => g.items.some((i) => i.to === location.pathname));
    return (activeGroup || groups[0])?.id ?? null;
  });

  function toggleGroup(id) {
    setOpenGroupId((prev) => (prev === id ? null : id));
  }

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? "1" : "0");
    } catch {
      /* localStorage unavailable — collapse state just won't persist across reloads */
    }
  }, [collapsed]);

  const page = PAGE_META[location.pathname] || { title: "SBMS", subtitle: "", icon: ShieldAlert };

  // Browser tab title mirrors the in-app breadcrumb — "SBMS - Records" —
  // so it's clear which page a tab is on when several are open at once.
  // This effect (and everything above it) must run on every render,
  // logged in or not — hooks can't sit after the early `return children`
  // below, or React ends up calling a different number of hooks between
  // a logged-out and logged-in render, which corrupts component state
  // right after login/logout until a full page refresh clears it.
  useEffect(() => {
    document.title = `Behavior - ${page.title}`;
    return () => {
      document.title = "SBMS — Student Behavior Management System";
    };
  }, [page.title]);

  if (!user || location.pathname === "/") return children;

  const meta = ROLE_META[user.sbmsRole] || ROLE_META.reporter;
  const nav = flattenNav(groups);

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

  const NavItemLink = ({ to, label, icon: Icon, iconOnly, indent, groupId }) => {
    const active = location.pathname === to;
    // Dashboard (groupId null) gets a neutral bright pill rather than the
    // role's raw color — several role colors are too dark to read on the
    // dark sidebar, so a translucent white pill (tinted faintly by the
    // role's light-safe color) is used there instead.
    const style = groupId ? GROUP_STYLES[groupId] || DEFAULT_GROUP_STYLE : null;
    const activeClasses = style ? `${style.tint} border` : `bg-white/10 border-white/20 border ${meta.textOnDark}`;
    return (
      <Link
        key={to}
        to={to}
        title={iconOnly ? label : undefined}
        onClick={() => setMobileOpen(false)}
        className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
          iconOnly ? "justify-center" : ""
        } ${indent && !iconOnly ? "ml-2" : ""} ${
          active ? activeClasses : "text-slate-300 hover:bg-white/10 hover:text-white"
        }`}
      >
        <Icon size={17} className="shrink-0" />
        {!iconOnly && label}
      </Link>
    );
  };

  // Icon-only collapsed rail: a flat list (pinned + everything), since
  // there's no room for a group header/label to click on anyway.
  const NavLinksCollapsed = () => (
    <nav className="flex flex-col gap-1 px-3">
      {nav.map((item) => (
        <NavItemLink key={item.to} {...item} iconOnly />
      ))}
    </nav>
  );

  // Expanded sidebar / mobile drawer: Dashboard pinned up top, then each
  // remaining group as a collapsible accordion section — click the group
  // header to reveal/hide the links inside it.
  const NavLinksGrouped = () => (
    <nav className="flex flex-col gap-1 px-3">
      <NavItemLink {...PINNED} />
      <div className="my-2 border-t border-white/10" />
      {groups.map((group) => {
        const isOpen = openGroupId === group.id;
        const GroupIcon = group.icon;
        const style = GROUP_STYLES[group.id] || DEFAULT_GROUP_STYLE;
        // Only the single open group is colored/highlighted — even if
        // another group happens to contain the current page, it stays
        // neutral once you've switched to a different group, so exactly
        // one group ever shows color at a time.
        const highlighted = isOpen;
        return (
          <div key={group.id} className="relative">
            {highlighted && (
              <span className={`absolute left-0 top-1 bottom-1 w-0.5 rounded-full ${style.bar}`} aria-hidden="true" />
            )}
            <button
              type="button"
              onClick={() => toggleGroup(group.id)}
              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors ${
                highlighted ? style.text : "text-slate-400"
              } hover:bg-white/10`}
            >
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors ${
                  highlighted ? style.chip : "bg-white/10 text-slate-400"
                }`}
              >
                <GroupIcon size={14} />
              </span>
              <span className="flex-1 text-left">{group.label}</span>
              <ChevronDown
                size={15}
                className={`shrink-0 transition-transform ${highlighted ? style.soft : "text-slate-500"} ${
                  isOpen ? "rotate-180" : ""
                }`}
              />
            </button>
            {isOpen && (
              <div className="mt-1 flex flex-col gap-1">
                {group.items.map((item) => (
                  <NavItemLink key={item.to} {...item} groupId={group.id} indent />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );

  const NavLinks = ({ iconOnly = false }) => (iconOnly ? <NavLinksCollapsed /> : <NavLinksGrouped />);

  return (
    <div className="min-h-screen flex">
      {/* Desktop sidebar */}
      <aside
        className={`hidden md:flex shrink-0 flex-col border-r border-teal-900 bg-teal-950 sticky top-0 h-screen transition-all duration-200 ${
          collapsed ? "md:w-[72px]" : "md:w-64"
        }`}
      >
        <Link
          to="/dashboard"
          onClick={() => setMobileOpen(false)}
          className={`group flex items-center border-b border-white/10 py-5 transition-colors hover:bg-white/5 ${
            collapsed ? "justify-center px-3" : "gap-3 px-5"
          }`}
        >
          <BrandMark school={school} accentClass={meta.accent} size={40} iconSize={19} />
          {!collapsed && (
            <div className="min-w-0">
              <p className="font-header text-2xl font-extrabold leading-none tracking-tight text-white">SBMS</p>
              <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Behavior Management
              </p>
            </div>
          )}
        </Link>

        <div className="flex-1 py-4 overflow-y-auto overflow-x-hidden">
          <NavLinks iconOnly={collapsed} />
        </div>

        <button
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? "Expand menu" : "Collapse menu"}
          className={`flex items-center gap-2 border-t border-white/10 px-3 py-3 text-xs font-medium text-slate-400 hover:bg-white/5 hover:text-white ${
            collapsed ? "justify-center" : ""
          }`}
        >
          {collapsed ? <PanelLeftOpen size={16} /> : (
            <>
              <PanelLeftClose size={16} /> Collapse
            </>
          )}
        </button>

        <div className={`border-t border-white/10 p-4 ${collapsed ? "px-2" : ""}`}>
          <Link
            to="/profile"
            title={collapsed ? user.name : undefined}
            onClick={() => setMobileOpen(false)}
            className={`flex items-center mb-3 rounded-lg hover:bg-white/5 ${
              collapsed ? "justify-center py-1" : "gap-2.5 -mx-1 px-1 py-1"
            }`}
          >
            <div className={`h-8 w-8 rounded-full ${meta.accent} text-white text-xs font-semibold flex items-center justify-center shrink-0`}>
              {user.name?.[0]?.toUpperCase() || "U"}
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <p className="text-sm font-medium text-white truncate">{user.name}</p>
                <p className={`text-[11px] ${meta.textOnDark}`}>{meta.label}</p>
              </div>
            )}
          </Link>
          <Link
            to="/profile"
            title={collapsed ? "Profile" : undefined}
            onClick={() => setMobileOpen(false)}
            className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-white/10 hover:text-white ${
              collapsed ? "justify-center px-0" : ""
            }`}
          >
            <UserRound size={15} className="shrink-0" /> {!collapsed && "Profile"}
          </Link>
          <button
            onClick={handleLogout}
            title={collapsed ? "Log out" : undefined}
            className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-white/10 hover:text-white ${
              collapsed ? "justify-center px-0" : ""
            }`}
          >
            <LogOut size={15} className="shrink-0" /> {!collapsed && "Log out"}
          </button>
        </div>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-72 bg-teal-950 flex flex-col">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-5">
              <Link
                to="/dashboard"
                onClick={() => setMobileOpen(false)}
                className="group flex items-center gap-3"
              >
                <BrandMark school={school} accentClass={meta.accent} size={40} iconSize={19} />
                <div className="min-w-0">
                  <p className="font-header text-2xl font-extrabold leading-none tracking-tight text-white">SBMS</p>
                  <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    Behavior Management
                  </p>
                </div>
              </Link>
              <button onClick={() => setMobileOpen(false)} className="text-slate-300 hover:text-white p-1">
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 py-4 overflow-y-auto">
              <NavLinks />
            </div>
            <div className="border-t border-white/10 p-4">
              <Link
                to="/profile"
                onClick={() => setMobileOpen(false)}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-white/10 hover:text-white"
              >
                <UserRound size={15} /> Profile
              </Link>
              <button
                onClick={handleLogout}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-white/10 hover:text-white"
              >
                <LogOut size={15} /> Log out
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main column */}
      <div className="flex-1 min-w-0">
        <header className="sticky top-0 z-30 bg-teal-950 px-4 sm:px-6 py-4 flex items-center gap-3 flex-wrap lg:flex-nowrap">
          <button onClick={() => setMobileOpen(true)} className="md:hidden text-teal-200 hover:text-white p-1">
            <Menu size={22} />
          </button>
          <button
            onClick={() => setCollapsed((c) => !c)}
            title={collapsed ? "Expand menu" : "Collapse menu"}
            className="hidden md:flex text-teal-200 hover:text-white p-1"
          >
            {collapsed ? <PanelLeftOpen size={19} /> : <PanelLeftClose size={19} />}
          </button>
          <div className="flex items-center gap-2.5 min-w-0 shrink-0">
            <PageIcon icon={page.icon} accentClass={meta.accent} size={30} iconSize={14} />
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-teal-300/80 truncate">
                SBMS <span className="text-teal-300/50">-</span> {page.title}
              </p>
              <h1 className="text-lg font-extrabold text-white font-header tracking-tight truncate">{page.title}</h1>
              {page.subtitle && <p className="text-sm text-teal-200 truncate hidden sm:block">{page.subtitle}</p>}
            </div>
          </div>

          {user.sbmsRole !== "reporter" && (
            <div className="order-3 w-full lg:order-none lg:ml-6 lg:w-auto lg:flex-1 lg:max-w-md">
              <StudentSearch onSelect={(studentId, academicYearId) => setSearchPick({ studentId, academicYearId })} />
            </div>
          )}

          <div className="ml-auto flex items-center gap-3 shrink-0">
            <HeaderClock />
            {(CAN_SEE_QUEUE.includes(user.sbmsRole) || user.sbmsRole === "reporter") && <NotificationBell />}
          </div>
        </header>
        <main className="p-4 sm:p-6 max-w-6xl mx-auto">{children}</main>
      </div>

      {searchPick && (
        <YearlyConductReportModal
          studentId={searchPick.studentId}
          academicYearId={searchPick.academicYearId}
          onClose={() => setSearchPick(null)}
        />
      )}
    </div>
  );
}
