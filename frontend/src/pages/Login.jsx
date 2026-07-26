import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Button from "../components/ui/Button";
import { Field, Input } from "../components/ui/FormField";
import { ErrorText } from "../components/ui/Alerts";
import { ShieldCheck } from "lucide-react";

const STAMP_DATE = new Date()
  .toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
  .toUpperCase()
  .replace(/ /g, " · ");

export default function Login() {
  const { login, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    try {
      await login(email, password);
      navigate("/dashboard");
    } catch (err) {
      setError(err.message || "Could not log in");
    }
  }

  return (
    <div className="min-h-screen flex bg-[#f7f5f6]">
      {/* Ledger panel — hidden below md, this is where the identity lives */}
      <div className="relative hidden md:flex md:w-[44%] lg:w-[40%] flex-col justify-between overflow-hidden bg-gradient-to-b from-brand-700 via-brand-500 to-brand-600 px-12 py-12 text-brand-50">
        {/* faint ledger rule lines, every 40px, like ruled record paper */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.16]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(to bottom, transparent 0, transparent 39px, rgba(255,255,255,0.9) 39px, rgba(255,255,255,0.9) 40px)",
          }}
        />
        {/* the red margin rule every accounting ledger has, offset from the left edge */}
        <div aria-hidden className="pointer-events-none absolute inset-y-0 left-16 w-px bg-brand-200/30" />

        <Link to="/" className="relative flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-brand-200/40 bg-brand-700/40">
            <ShieldCheck size={18} strokeWidth={2.25} />
          </div>
          <div className="leading-tight">
            <p className="font-display text-lg font-semibold tracking-wide text-white">SBMS</p>
            <p className="text-[11px] uppercase tracking-[0.18em] text-brand-100/70">Behavior Management</p>
          </div>
        </Link>

        <div className="relative max-w-sm">
          <h1 className="font-display text-4xl font-semibold leading-[1.15] text-white lg:text-[2.75rem]">
            Discipline,
            <br />
            properly recorded.
          </h1>
          <p className="mt-5 text-[15px] leading-relaxed text-brand-100/80">
            Every report, review, and deduction — logged against the same
            record your whole school already trusts.
          </p>
        </div>

        {/* signature element: a rotated ledger-entry stamp, like a date stamp on a case file */}
        <div className="relative">
          <div className="animate-stamp-in inline-flex flex-col items-start gap-1 rounded-sm border-2 border-brand-100/50 px-4 py-2.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-brand-100/70">
              Ledger entry
            </span>
            <span className="tabular-nums font-display text-base font-semibold tracking-wide text-white">
              {STAMP_DATE}
            </span>
          </div>
        </div>
      </div>

      {/* Form side */}
      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm animate-rise-in rounded-2xl bg-white p-8 shadow-sm border border-slate-100 sm:p-10">
          {/* mobile-only identity, since the ledger panel is hidden below md */}
          <div className="mb-8 flex items-center gap-3 md:hidden">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-500 text-white">
              <ShieldCheck size={20} strokeWidth={2.25} />
            </div>
            <div className="leading-tight">
              <p className="font-display text-lg font-semibold text-slate-800">SBMS</p>
              <p className="text-xs text-slate-500">Student Behavior Management System</p>
            </div>
          </div>

          <div className="mb-7 hidden md:block">
            <h2 className="font-display text-2xl font-semibold text-slate-800">Log in</h2>
            <p className="mt-1.5 text-sm text-slate-500">Enter your credentials to open your dashboard.</p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Field label="Email">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@school.rw"
                required
                autoFocus
              />
            </Field>
            <Field label="Password">
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </Field>
            <ErrorText>{error}</ErrorText>
            <Button type="submit" disabled={loading} className="mt-1 w-full" size="lg">
              {loading ? "Logging in..." : "Log in"}
            </Button>
          </form>

          <p className="mt-6 text-center text-xs leading-relaxed text-slate-400">
            Same email and password as the main school system — SBMS just tracks discipline.
          </p>
        </div>
      </div>
    </div>
  );
}
