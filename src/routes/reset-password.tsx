import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Reset password — POPPiK Sales Force Suite" },
      { name: "description", content: "Set a new password for your POPPiK Sales Force Suite account." },
      { property: "og:title", content: "Reset password — POPPiK Sales Force Suite" },
      { property: "og:description", content: "Set a new password for your sales, distributor or admin login." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setReady(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setReady(!!s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const save = async () => {
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords do not match");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Password updated. Please sign in.");
    navigate({ to: "/auth" });
  };


  return (
    <div className="flex min-h-screen items-center justify-center bg-plum px-4 py-10">
      <div className="w-full max-w-md rounded-3xl bg-card p-6 shadow-[var(--shadow-lift)]">
        <p className="text-[11px] uppercase tracking-[0.3em] text-primary">POPPiK</p>
        <h1 className="mt-1 text-2xl font-semibold">Set a new password</h1>
        {!ready && (
          <p className="mt-2 text-sm text-muted-foreground">
            Open this page from the reset link sent to your email.
          </p>
        )}
        <div className="mt-6 space-y-3">
          <div className="space-y-1.5">
            <Label>New password</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Confirm password</Label>
            <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
          <Button className="w-full" disabled={busy || !ready} onClick={save}>
            Update password
          </Button>
        </div>
      </div>
    </div>
  );
}
