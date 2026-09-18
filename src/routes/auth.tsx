import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — POPPiK Sales Force Suite" },
      { name: "description", content: "Login for field sales, distributors, CSA super stockists and company admin." },
      { property: "og:title", content: "Sign in — POPPiK Sales Force Suite" },
      { property: "og:description", content: "One login for field sales, distributor, CSA and admin dashboards." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const signIn = async () => {
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    navigate({ to: "/home" });
  };

  const google = async () => {
    setBusy(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    setBusy(false);
    if (result.error) {
      const msg =
        result.error.message ||
        "Google sign-in failed. Make sure your account was created by the admin.";
      toast.error(msg);
      return;
    }
    if (!result.redirected) {
      navigate({ to: "/home" });
    }
  };

  const forgot = async () => {
    if (!email) {
      toast.error("Enter your email first");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Password reset link sent to your email");
  };



  return (
    <div className="flex min-h-screen items-center justify-center bg-plum px-4 py-10">
      <div className="w-full max-w-md rounded-3xl bg-card p-6 shadow-[var(--shadow-lift)]">
        <p className="text-[11px] uppercase tracking-[0.3em] text-primary">POPPiK</p>
        <h1 className="mt-1 text-2xl font-semibold">Sales Force Suite</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Sales • Distributor • CSA • Admin — ek hi ecosystem.
        </p>

        <div className="mt-6 space-y-3">
          <Field label="Email" value={email} onChange={setEmail} type="email" />
          <PasswordField label="Password" value={password} onChange={setPassword} />
          <Button className="w-full" disabled={busy} onClick={signIn}>
            Sign in
          </Button>

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-[11px] text-muted-foreground">or</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <Button
            variant="outline"
            className="w-full"
            disabled={busy}
            onClick={google}
          >
            Continue with Google
          </Button>

          <button
            type="button"
            onClick={forgot}
            className="w-full text-center text-xs font-medium text-primary underline-offset-4 hover:underline"
          >
            Forgot password?
          </button>
          <p className="text-[11px] text-muted-foreground">
            Accounts are created by the company admin only. Contact your admin for login access.
          </p>

        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function PasswordField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="relative">
        <Input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="pr-10"
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          aria-label={show ? "Hide password" : "Show password"}
        >
          {show ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
    </div>
  );
}
