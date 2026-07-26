import { useState } from "react";
import { toast } from "sonner";
import api from "../api/client";
import { useAuth } from "../context/AuthContext";
import Card from "./ui/Card";
import Button from "./ui/Button";
import { Field, Input } from "./ui/FormField";
import { ErrorText } from "./ui/Alerts";
import { KeyRound } from "lucide-react";

// Self-service password change, used from Profile.jsx — as opposed to
// pages/ChangePassword.jsx, which is the forced full-screen flow shown on
// first login. Both call the same POST /auth/change-password endpoint.
export default function ChangePasswordCard({ className = "" }) {
  const { updateUser } = useAuth();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/auth/change-password", { newPassword });
      updateUser({ mustChangePassword: false });
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Password updated successfully.");
    } catch (err) {
      setError(err.message || "Failed to update password");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card
      title="Change password"
      subtitle="Choose a new password for your account. This is the same login you use for the main school system."
      actions={<KeyRound size={18} className="text-slate-400" />}
      className={className}
    >
      <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4 max-w-sm">
        <Field label="New password (min 8 characters)">
          <Input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            minLength={8}
            required
          />
        </Field>
        <Field label="Confirm new password">
          <Input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />
        </Field>
        <ErrorText>{error}</ErrorText>
        <Button type="submit" disabled={submitting} className="self-start">
          {submitting ? "Saving..." : "Update password"}
        </Button>
      </form>
    </Card>
  );
}
