import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import api from "../api/client";
import { useAuth } from "../context/AuthContext";
import { Field, Input } from "../components/ui/FormField";
import { ErrorText } from "../components/ui/Alerts";
import Button from "../components/ui/Button";
import { KeyRound } from "lucide-react";

export default function ChangePassword() {
  const { updateUser } = useAuth();
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/auth/change-password", { newPassword });
      updateUser({ mustChangePassword: false });
      toast.success("Password updated successfully.");
      navigate("/dashboard");
    } catch (err) {
      setError(err.message || "Failed to update password");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          <div className="h-12 w-12 rounded-xl bg-brand-500 flex items-center justify-center mb-3">
            <KeyRound size={22} className="text-white" />
          </div>
          <h1 className="text-lg font-semibold text-slate-800 font-display text-center">Set a new password</h1>
          <p className="text-sm text-slate-500 mt-1 text-center">
            This is your first login to SBMS. Choose a new password to continue.
          </p>
        </div>

        <form
          noValidate
          onSubmit={handleSubmit}
          className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 flex flex-col gap-4"
        >
          <Field label="New password (min 8 characters)">
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={8}
              required
              autoFocus
            />
          </Field>
          <Field label="Confirm password">
            <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          </Field>
          <ErrorText>{error}</ErrorText>
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? "Saving..." : "Save password"}
          </Button>
        </form>
      </div>
    </div>
  );
}
