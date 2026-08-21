import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { LOGIN_NOTICE_KEY } from "../api/client";
import Button from "../components/ui/Button";
import { Field, Input } from "../components/ui/FormField";
import { ErrorText } from "../components/ui/Alerts";
import { ShieldAlert, Eye, EyeOff } from "lucide-react";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Login() {
  const { login, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  // If the API interceptor just force-logged us out here (account
  // suspended, or the school deactivated in the main system mid-session),
  // it stashed the reason since a hard redirect can't carry React state.
  // Surface it once, then clear it so it doesn't reappear on a later,
  // unrelated visit to this page.
  useEffect(() => {
    const notice = sessionStorage.getItem(LOGIN_NOTICE_KEY);
    if (notice) {
      setError(notice);
      sessionStorage.removeItem(LOGIN_NOTICE_KEY);
    }
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    const trimmedEmail = email.trim();

    if (!trimmedEmail && !password) {
      setError("Email and password are required.");
      return;
    }
    if (!trimmedEmail) {
      setError("Invalid email — please enter your email address.");
      return;
    }
    if (!password) {
      setError("Invalid password — please enter your password.");
      return;
    }

    // Malformed email is caught here, before the request even goes out —
    // it's a real, checkable state on its own, distinct from "no account
    // matches" or "wrong password" (both of which only the server can know).
    if (!EMAIL_PATTERN.test(trimmedEmail)) {
      setError("Invalid email — please enter a valid email address.");
      return;
    }

    try {
      await login(email, password);
      navigate("/dashboard");
    } catch (err) {
      setError(err.message || "Could not log in");
    }
  }

  return (
    <div className="min-h-screen flex bg-white">
      {/* Identity panel — same teal-950 the app sidebar uses, so the login
          screen reads as unmistakably "SBMS" before you're even in. */}
      <div className="relative hidden md:flex md:w-[42%] lg:w-[38%] flex-col justify-between overflow-hidden bg-teal-950 px-12 py-12 text-white">
        <Link to="/" className="relative flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-600 text-white shadow-sm ring-1 ring-white/10">
            <ShieldAlert size={19} />
          </div>
          <div className="leading-tight">
            <p className="font-header text-2xl font-extrabold leading-none tracking-tight text-white">SBMS</p>
            <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Behavior Management
            </p>
          </div>
        </Link>

        <div className="relative max-w-sm">
          <h1 className="font-header text-4xl font-extrabold leading-[1.15] text-white lg:text-[2.75rem]">
            Discipline,
            <br />
            properly recorded.
          </h1>
          <p className="mt-5 text-[15px] leading-relaxed text-slate-300">
            Every report, review, and deduction — logged against the same
            record your whole school already trusts.
          </p>
        </div>

        <p className="relative text-xs text-slate-500">
          &copy; {new Date().getFullYear()} SBMS · Student Behavior Management System
        </p>
      </div>

      {/* Form side */}
      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          {/* mobile-only identity, since the teal panel is hidden below md */}
          <div className="mb-8 flex items-center gap-3 md:hidden">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-950 text-white">
              <ShieldAlert size={20} />
            </div>
            <div className="leading-tight">
              <p className="font-header text-lg font-extrabold text-slate-800">SBMS</p>
              <p className="text-xs text-slate-500">Student Behavior Management System</p>
            </div>
          </div>

          <h2 className="font-header text-3xl font-extrabold text-slate-900">Sign in</h2>
          <p className="mt-2 text-sm text-slate-500">Enter your credentials to open your dashboard.</p>

          <form onSubmit={handleSubmit} noValidate className="mt-8 flex flex-col gap-5">
            <Field label="Email">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@school.rw"
                autoFocus
              />
            </Field>

            <Field
              label={
                <span className="flex items-center justify-between">
                  <span>Password</span>
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-teal-700"
                  >
                    {showPassword ? <EyeOff size={13} /> : <Eye size={13} />}
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </span>
              }
            >
              <Input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </Field>

            <ErrorText>{error}</ErrorText>

            <Button type="submit" disabled={loading} className="mt-1 w-full" size="lg" variant="teal">
              {loading ? "Signing in..." : "Sign in"}
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
