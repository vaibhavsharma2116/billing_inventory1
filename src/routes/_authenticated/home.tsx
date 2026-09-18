import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMe, roleHome } from "@/hooks/useAuth";

export const Route = createFileRoute("/_authenticated/home")({
  component: HomeRedirect,
});

function HomeRedirect() {
  const { data, isLoading } = useMe();
  const navigate = useNavigate();

  useEffect(() => {
    if (data?.role) navigate({ to: roleHome[data.role], replace: true });
  }, [data?.role, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
      {isLoading ? "Loading your workspace…" : "Redirecting…"}
    </div>
  );
}
