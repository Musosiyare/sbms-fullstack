import { useEffect, useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  ShieldCheck,
  FlagTriangleRight,
  ClipboardList,
  BarChart3,
  GraduationCap,
  UserCog,
  ListChecks,
  CheckCircle2,
  ArrowRight,
  Bell,
  Lock,
  PenLine,
  Gavel,
  Archive,
  Printer,
  Link2,
  Menu,
  X,
  QrCode,
} from "lucide-react";

/* ---------------------------------------------------------------- */
/* Scroll-reveal: reuses the .animate-rise-in keyframe already
   defined in index.css, just triggers it in-view instead of on
   mount so the page feels alive as you scroll through it.        */
/* ---------------------------------------------------------------- */
function useReveal() {
  const ref = useRef(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          io.unobserve(el);
        }
      },
      { threshold: 0.15 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return [ref, shown];
}

function Reveal({ children, className = "", delay = 0 }) {
  const [ref, shown] = useReveal();
  return (
    <div
      ref={ref}
      className={`${shown ? "animate-rise-in" : "opacity-0"} ${className}`}
      style={shown ? { animationDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}

/* ---------------------------------------------------------------- */

const ROLES = [
  {
    key: "manager",
    label: "Manager",
    color: "manager",
    ring: "role-ring-manager",
    icon: UserCog,
    tagline: "Sees everything, owns nothing they don't need to.",
    points: [
      "Full visibility across every report, review and record",
      "Can report incidents directly, same as a teacher",
      "Assigns Dean of Discipline & Officer access",
    ],
  },
  {
    key: "dean_of_discipline",
    label: "Dean of Discipline",
    color: "dod",
    ring: "role-ring-dod",
    icon: Gavel,
    tagline: "The final word on every case.",
    points: [
      "Reviews and finalizes every submitted report",
      "Deliberates: punished, or not punished — with reasons on record",
      "Owns the misconduct-type catalog and its deductions",
    ],
  },
  {
    key: "disciplinary_officer",
    label: "Disciplinary Officer",
    color: "officer",
    ring: "role-ring-officer",
    icon: ShieldCheck,
    tagline: "Patron or matron, on patrol.",
    points: [
      "Files reports from the floor as incidents happen",
      "Reviews and finalizes cases alongside the Dean",
      "Pulls class and yearly conduct reports on demand",
    ],
  },
  {
    key: "reporter",
    label: "Teacher",
    color: "reporter",
    ring: "role-ring-reporter",
    icon: PenLine,
    tagline: "Flags it, then lets the process work.",
    points: [
      "Reports a mistake in under a minute, from any device",
      "Tracks a report's status — pending, punished, not punished",
      "Never touches marks or deductions directly",
    ],
  },
];

const WORKFLOW = [
  {
    step: "01",
    title: "Report",
    who: "Teacher / Officer",
    icon: FlagTriangleRight,
    color: "reporter",
    desc: "An incident is logged against the student in under a minute — what happened, when, and which misconduct type it falls under.",
  },
  {
    step: "02",
    title: "Review",
    who: "Dean of Discipline / Officer",
    icon: ClipboardList,
    color: "officer",
    desc: "The report lands in a shared queue. Nothing is final until someone with authority has actually looked at it.",
  },
  {
    step: "03",
    title: "Deliberate",
    who: "Dean of Discipline",
    icon: Gavel,
    color: "dod",
    desc: "Punished, or not punished — the decision is recorded with the deduction it carries, never silently applied.",
  },
  {
    step: "04",
    title: "Record",
    who: "Automatic",
    icon: Archive,
    color: "manager",
    desc: "The outcome joins the student's permanent conduct history — ready for class reports, yearly reports, or a printed record.",
  },
];

const FEATURES = [
  {
    icon: ListChecks,
    title: "A real misconduct catalog",
    desc: "Offenses aren't typed in freehand each time. Every misconduct type carries its own default deduction, set once by the Dean of Discipline.",
  },
  {
    icon: BarChart3,
    title: "Class & yearly reports",
    desc: "Per-term conduct scores by class, and a full-year view that decides promotion or dismissal on the record — not from memory.",
  },
  {
    icon: Bell,
    title: "Nobody misses a case",
    desc: "Reports raise a notification the moment they land, so a pending case never quietly ages out of view.",
  },
  {
    icon: Printer,
    title: "Printable conduct reports",
    desc: "Individual, class, and yearly conduct reports render as clean, signable paper records — ready to file or hand to a parent.",
  },
  {
    icon: Link2,
    title: "One student, one identity",
    desc: "SBMS shares its database with your school system. The same student, the same admission number — no re-entry, no drift.",
  },
  {
    icon: Lock,
    title: "Same login, less to remember",
    desc: "Staff sign in with the exact credentials they already use for the main school system. One account, two systems.",
  },
];

function RoleTabs() {
  const [active, setActive] = useState(ROLES[1].key);
  const role = ROLES.find((r) => r.key === active);
  const Icon = role.icon;

  const TEXT = {
    manager: "text-manager",
    dod: "text-dod",
    officer: "text-officer",
    reporter: "text-reporter",
  };
  const BG = {
    manager: "bg-manager",
    dod: "bg-dod",
    officer: "bg-officer",
    reporter: "bg-reporter",
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {ROLES.map((r) => {
          const RIcon = r.icon;
          const isActive = r.key === active;
          return (
            <button
              key={r.key}
              onClick={() => setActive(r.key)}
              className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-all ${
                isActive
                  ? `${role.ring} border-transparent bg-white ${TEXT[r.color]} shadow-sm`
                  : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700"
              }`}
            >
              <RIcon size={15} strokeWidth={2.25} />
              {r.label}
            </button>
          );
        })}
      </div>

      <div
        key={role.key}
        className="animate-rise-in mt-6 flex flex-col gap-6 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm sm:flex-row sm:items-start sm:p-8"
      >
        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${BG[role.color]} text-white`}
        >
          <Icon size={22} strokeWidth={2.25} />
        </div>
        <div>
          <h3 className="font-display text-xl font-semibold text-slate-800">{role.label}</h3>
          <p className={`mt-0.5 text-sm font-medium ${TEXT[role.color]}`}>{role.tagline}</p>
          <ul className="mt-4 flex flex-col gap-2.5">
            {role.points.map((p) => (
              <li key={p} className="flex items-start gap-2.5 text-sm leading-relaxed text-slate-600">
                <CheckCircle2 size={16} strokeWidth={2.25} className={`mt-0.5 shrink-0 ${TEXT[role.color]}`} />
                {p}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function MockLedgerCard() {
  return (
    <div className="relative mx-auto w-full max-w-sm rotate-2 rounded-2xl bg-white p-5 shadow-xl ring-1 ring-black/5 transition-transform duration-500 hover:rotate-0 sm:p-6">
      <div className="flex items-center justify-between border-b border-dashed border-slate-200 pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-500 text-white">
            <ShieldCheck size={13} strokeWidth={2.5} />
          </div>
          <span className="font-display text-sm font-semibold text-slate-700">Conduct Record</span>
        </div>
        <QrCode size={20} className="text-slate-300" strokeWidth={1.5} />
      </div>

      <div className="mt-4 flex flex-col gap-2.5 text-sm">
        <div className="flex justify-between">
          <span className="text-slate-400">Student</span>
          <span className="font-medium text-slate-700">U. Niyonzima</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">Class</span>
          <span className="font-medium text-slate-700">L4 NIT A</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">Misconduct</span>
          <span className="font-medium text-slate-700">Late arrival</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">Deduction</span>
          <span className="font-medium text-slate-700">-2 pts</span>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-dashed border-slate-200 pt-3">
        <span className="text-[11px] uppercase tracking-[0.14em] text-slate-400">Status</span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-600">
          <CheckCircle2 size={13} strokeWidth={2.5} />
          Finalized
        </span>
      </div>

      {/* the stamp, reused from the login page's language */}
      <div className="animate-stamp-in absolute -right-3 -top-3 flex flex-col items-center rounded-sm border-2 border-brand-400/60 bg-white px-3 py-1.5 shadow-md">
        <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-brand-500">Recorded</span>
      </div>
    </div>
  );
}

export default function Landing() {
  const { user } = useAuth();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Someone with an active session hitting "/" almost certainly wants
  // their dashboard, not the pitch — send them straight there.
  if (user) return <Navigate to="/dashboard" replace />;

  return (
    <div className="min-h-screen bg-[#f7f5f6] text-slate-800">
      {/* ---------------- Nav ---------------- */}
      <header className="sticky top-0 z-30 border-b border-slate-100 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-500 text-white">
              <ShieldCheck size={17} strokeWidth={2.25} />
            </div>
            <div className="leading-tight">
              <p className="font-header text-base font-extrabold tracking-tight text-slate-800">SBMS</p>
              <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400">Behavior Management</p>
            </div>
          </div>

          <nav className="hidden items-center gap-8 text-sm font-medium text-slate-500 md:flex">
            <a href="#roles" className="transition-colors hover:text-brand-500">Roles</a>
            <a href="#workflow" className="transition-colors hover:text-brand-500">Workflow</a>
            <a href="#features" className="transition-colors hover:text-brand-500">Features</a>
          </nav>

          <div className="hidden items-center gap-3 md:flex">
            <Link
              to="/login"
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-600"
            >
              Log in <ArrowRight size={14} strokeWidth={2.25} />
            </Link>
          </div>

          <button
            className="text-slate-500 md:hidden"
            onClick={() => setMobileNavOpen((v) => !v)}
            aria-label="Toggle menu"
          >
            {mobileNavOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>

        {mobileNavOpen && (
          <div className="flex flex-col gap-1 border-t border-slate-100 bg-white px-6 py-3 md:hidden">
            {[
              ["Roles", "#roles"],
              ["Workflow", "#workflow"],
              ["Features", "#features"],
            ].map(([label, href]) => (
              <a
                key={href}
                href={href}
                onClick={() => setMobileNavOpen(false)}
                className="rounded-md px-2 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                {label}
              </a>
            ))}
            <Link
              to="/login"
              className="mt-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white"
            >
              Log in <ArrowRight size={14} strokeWidth={2.25} />
            </Link>
          </div>
        )}
      </header>

      {/* ---------------- Hero ---------------- */}
      <section className="relative overflow-hidden bg-gradient-to-b from-brand-700 via-brand-500 to-brand-600 text-brand-50">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.12]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(to bottom, transparent 0, transparent 39px, rgba(255,255,255,0.9) 39px, rgba(255,255,255,0.9) 40px)",
          }}
        />
        <div aria-hidden className="pointer-events-none absolute inset-y-0 left-10 hidden w-px bg-brand-200/25 sm:block" />

        <div className="relative mx-auto grid max-w-6xl gap-12 px-6 py-20 md:grid-cols-2 md:items-center md:py-28">
          <Reveal>
            <p className="inline-flex items-center gap-2 rounded-full border border-brand-200/30 bg-brand-700/30 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-100/80">
              A companion to your school system
            </p>
            <h1 className="mt-5 font-display text-4xl font-semibold leading-[1.1] text-white sm:text-5xl">
              Discipline,
              <br />
              properly recorded.
            </h1>
            <p className="mt-5 max-w-md text-[15px] leading-relaxed text-brand-100/85">
              Every report, review, and deduction — logged against the same
              student record your whole school already trusts. No spreadsheets,
              no re-typing names, no case that quietly disappears.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                to="/login"
                className="inline-flex items-center gap-2 rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-brand-600 transition-colors hover:bg-brand-50"
              >
                Log in to your dashboard <ArrowRight size={15} strokeWidth={2.5} />
              </Link>
              <a
                href="#workflow"
                className="inline-flex items-center gap-2 rounded-lg border border-brand-100/30 px-5 py-2.5 text-sm font-medium text-brand-50 transition-colors hover:bg-brand-700/30"
              >
                See how it works
              </a>
            </div>
            <p className="mt-6 text-xs text-brand-100/60">
              Same email and password as your main school system — SBMS just tracks discipline.
            </p>
          </Reveal>

          <Reveal delay={150}>
            <MockLedgerCard />
          </Reveal>
        </div>
      </section>

      {/* ---------------- Stat strip ---------------- */}
      <section className="border-b border-slate-100 bg-white">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-6 py-8 sm:grid-cols-4">
          {[
            ["4", "roles, one process"],
            ["1", "shared student record"],
            ["3", "report levels — class, yearly, individual"],
            ["0", "spreadsheets required"],
          ].map(([stat, label]) => (
            <Reveal key={label} className="text-center sm:text-left">
              <p className="font-display text-3xl font-semibold text-brand-500">{stat}</p>
              <p className="mt-1 text-xs leading-snug text-slate-500">{label}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---------------- Roles ---------------- */}
      <section id="roles" className="mx-auto max-w-6xl px-6 py-20">
        <Reveal className="max-w-xl">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-500">Built for every role</p>
          <h2 className="mt-2 font-display text-3xl font-semibold text-slate-800">
            One system, four very different jobs.
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-slate-500">
            Nobody sees more than their role needs, and nobody can quietly
            skip a step. Tap a role to see what it can actually do.
          </p>
        </Reveal>
        <Reveal delay={100} className="mt-8">
          <RoleTabs />
        </Reveal>
      </section>

      {/* ---------------- Workflow ---------------- */}
      <section id="workflow" className="bg-white py-20">
        <div className="mx-auto max-w-6xl px-6">
          <Reveal className="max-w-xl">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-500">The workflow</p>
            <h2 className="mt-2 font-display text-3xl font-semibold text-slate-800">
              From incident to permanent record.
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-slate-500">
              Four steps, four accountable people. Nothing gets recorded
              without someone reviewing it first.
            </p>
          </Reveal>

          <div className="relative mt-14 grid gap-8 md:grid-cols-4">
            <div
              aria-hidden
              className="absolute left-0 right-0 top-6 hidden h-px bg-slate-200 md:block"
            />
            {WORKFLOW.map((w, i) => {
              const Icon = w.icon;
              const BG = { reporter: "bg-reporter", officer: "bg-officer", dod: "bg-dod", manager: "bg-manager" };
              return (
                <Reveal key={w.step} delay={i * 120} className="relative">
                  <div className={`relative z-10 flex h-12 w-12 items-center justify-center rounded-full ${BG[w.color]} text-white shadow-sm`}>
                    <Icon size={20} strokeWidth={2.25} />
                  </div>
                  <p className="mt-4 font-display text-lg font-semibold text-slate-800">
                    <span className="mr-1.5 tabular-nums text-slate-300">{w.step}</span>
                    {w.title}
                  </p>
                  <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-slate-400">{w.who}</p>
                  <p className="mt-2.5 text-sm leading-relaxed text-slate-500">{w.desc}</p>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* ---------------- Features ---------------- */}
      <section id="features" className="mx-auto max-w-6xl px-6 py-20">
        <Reveal className="max-w-xl">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-500">What you get</p>
          <h2 className="mt-2 font-display text-3xl font-semibold text-slate-800">
            Everything discipline tracking actually needs.
          </h2>
        </Reveal>

        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => {
            const Icon = f.icon;
            return (
              <Reveal
                key={f.title}
                delay={(i % 3) * 100}
                className="group rounded-2xl border border-slate-100 bg-white p-6 transition-all duration-200 hover:-translate-y-1 hover:shadow-md"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-500 transition-colors group-hover:bg-brand-500 group-hover:text-white">
                  <Icon size={19} strokeWidth={2.25} />
                </div>
                <h3 className="mt-4 font-display text-base font-semibold text-slate-800">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">{f.desc}</p>
              </Reveal>
            );
          })}
        </div>
      </section>

      {/* ---------------- One record section ---------------- */}
      <section className="bg-white py-20">
        <div className="mx-auto grid max-w-6xl gap-12 px-6 md:grid-cols-2 md:items-center">
          <Reveal>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-500">Under the hood</p>
            <h2 className="mt-2 font-display text-3xl font-semibold text-slate-800">
              Same student. Same login. One record.
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-slate-500">
              SBMS isn't a separate island. It reads the same student and
              staff records as your main school system, so a name never
              needs re-typing and a class list never drifts out of sync.
              Staff log in with the exact credentials they already have —
              SBMS just adds the discipline layer on top.
            </p>
            <ul className="mt-6 flex flex-col gap-3">
              {[
                "One shared database — no duplicate student entry",
                "One login — the same account, a different dashboard",
                "One conduct history — visible wherever it's needed",
              ].map((t) => (
                <li key={t} className="flex items-start gap-2.5 text-sm text-slate-600">
                  <CheckCircle2 size={16} strokeWidth={2.25} className="mt-0.5 shrink-0 text-brand-500" />
                  {t}
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal delay={150}>
            <div className="rounded-2xl border border-slate-100 bg-[#f7f5f6] p-8">
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1 rounded-xl bg-white p-4 text-center shadow-sm ring-1 ring-slate-100">
                  <GraduationCap size={20} className="mx-auto text-manager" strokeWidth={2} />
                  <p className="mt-2 font-display text-sm font-semibold text-slate-700">School System</p>
                  <p className="text-[11px] text-slate-400">Academics · Admissions</p>
                </div>
                <div className="flex flex-col items-center gap-1 text-brand-400">
                  <Link2 size={16} strokeWidth={2.25} />
                  <span className="text-[10px] font-semibold uppercase tracking-wide">shared DB</span>
                </div>
                <div className="flex-1 rounded-xl bg-white p-4 text-center shadow-sm ring-1 ring-brand-100">
                  <ShieldCheck size={20} className="mx-auto text-brand-500" strokeWidth={2} />
                  <p className="mt-2 font-display text-sm font-semibold text-slate-700">SBMS</p>
                  <p className="text-[11px] text-slate-400">Conduct · Discipline</p>
                </div>
              </div>
              <p className="mt-6 text-center text-xs leading-relaxed text-slate-400">
                Two dashboards, one MySQL database, zero synchronization jobs.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ---------------- CTA ---------------- */}
      <section className="relative overflow-hidden bg-gradient-to-br from-brand-600 via-brand-500 to-brand-700 py-20 text-center text-white">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.1]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(to bottom, transparent 0, transparent 39px, rgba(255,255,255,0.9) 39px, rgba(255,255,255,0.9) 40px)",
          }}
        />
        <div className="relative mx-auto max-w-xl px-6">
          <Reveal>
            <h2 className="font-display text-3xl font-semibold sm:text-4xl">
              Bring order to your discipline records.
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-brand-100/85">
              If your school already runs the main system, SBMS is one login away.
            </p>
            <Link
              to="/login"
              className="mt-8 inline-flex items-center gap-2 rounded-lg bg-white px-6 py-3 text-sm font-semibold text-brand-600 transition-colors hover:bg-brand-50"
            >
              Log in to SBMS <ArrowRight size={15} strokeWidth={2.5} />
            </Link>
          </Reveal>
        </div>
      </section>

      {/* ---------------- Footer ---------------- */}
      <footer className="bg-brand-700 py-8 text-center text-brand-100/60">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-6 sm:flex-row sm:justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck size={14} strokeWidth={2.25} />
            <span className="text-xs font-medium">
              <span className="font-header font-extrabold tracking-tight">SBMS</span> — Student Behavior Management
              System
            </span>
          </div>
          <p className="text-[11px]">A companion to your school's management system.</p>
        </div>
      </footer>
    </div>
  );
}
