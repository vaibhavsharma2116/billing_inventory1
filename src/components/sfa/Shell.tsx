import type { ReactNode, ComponentType } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import type { LucideProps } from "lucide-react";
import { Home, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useMe, roleHome, roleLabel, type AppRole } from "@/hooks/useAuth";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type NavItem = { to: string; label: string; icon?: ComponentType<LucideProps> };

function RoleSwitcher() {
  const { data: me, roles, switchRole } = useMe();
  const navigate = useNavigate();
  if (roles.length < 2 || !me?.role) return null;
  return (
    <Select
      value={me.role}
      onValueChange={(v) => {
        switchRole(v as AppRole);
        navigate({ to: roleHome[v as AppRole] });
      }}
    >
      <SelectTrigger className="h-8 w-[150px] border-plum-foreground/25 bg-plum-foreground/10 text-xs text-plum-foreground">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {roles.map((r) => (
          <SelectItem key={r} value={r}>
            {roleLabel[r] ?? r}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}


export function Shell({
  title,
  subtitle,
  nav = [],
  children,
  mobile = false,
}: {
  title: string;
  subtitle?: string;
  nav?: NavItem[];
  children: ReactNode;
  /** Mobile-app mode: phone-width container + bottom tab bar (field/salesman screens). */
  mobile?: boolean;
}) {
  const navigate = useNavigate();
  const widthClass = mobile ? "max-w-md" : "max-w-6xl";

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border/60 bg-plum text-plum-foreground">
        <div className={cn("mx-auto flex items-center justify-between gap-4 px-4 py-3", widthClass)}>
          <div>
            <p className="text-[11px] uppercase tracking-[0.25em] text-plum-foreground/60">POPPiK SFA</p>
            <h1 className="text-lg font-semibold leading-tight">{title}</h1>
            {subtitle ? <p className="text-xs text-plum-foreground/70">{subtitle}</p> : null}
          </div>
          <div className="flex items-center gap-1">
            <RoleSwitcher />
            <Button
              variant="ghost"
              size="sm"
              className="text-plum-foreground hover:bg-plum-foreground/10"
              asChild
            >
              <Link to="/home" activeProps={{ className: "bg-plum-foreground/10" }}>
                <Home className="size-4" />
                <span className="hidden sm:inline">Home</span>
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-plum-foreground hover:bg-plum-foreground/10"
              onClick={async () => {
                await supabase.auth.signOut();
                navigate({ to: "/auth" });
              }}
            >
              <LogOut className="size-4" /> Logout
            </Button>
          </div>
        </div>
        {nav.length > 0 && !mobile ? (
          <nav className={cn("mx-auto flex gap-1 overflow-x-auto px-2 pb-2", widthClass)}>
            {nav.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                activeProps={{ className: "bg-primary text-primary-foreground" }}
                className={cn(
                  "whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium text-plum-foreground/75 transition-colors hover:bg-plum-foreground/10",
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        ) : null}
      </header>
      <main className={cn("mx-auto px-4 py-5", widthClass, mobile ? "pb-24" : "pb-16")}>{children}</main>
      {mobile ? (
        <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border/60 bg-card/95 backdrop-blur">
          <div className="mx-auto flex max-w-md">
            <Link
              to="/home"
              activeProps={{ className: "text-primary" }}
              className="flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs font-medium text-muted-foreground transition-colors"
            >
              <Home className="size-5" />
              Home
            </Link>
            {nav.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  activeProps={{ className: "text-primary" }}
                  className="flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs font-medium text-muted-foreground transition-colors"
                >
                  {Icon ? <Icon className="size-5" /> : <span className="h-5 w-5 rounded-full bg-muted" />}
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>
      ) : null}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = "default",
  onClick,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "primary" | "success" | "warning" | "danger";
  onClick?: () => void;
}) {
  const toneClass = {
    default: "text-foreground",
    primary: "text-primary",
    success: "text-success",
    warning: "text-warning",
    danger: "text-destructive",
  }[tone];

  return (
    <div
      onClick={onClick}
      role={onClick ? "button" : undefined}
      className={cn(
        "min-w-0 overflow-hidden rounded-2xl border border-border/70 bg-card p-3 shadow-[var(--shadow-card)] sm:p-4",
        onClick && "cursor-pointer transition-colors hover:border-primary/50 hover:bg-accent/40",
      )}
    >
      <p className="truncate text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 truncate font-semibold tabular-nums leading-none tracking-tight text-[clamp(0.65rem,2.4vw,0.95rem)]",
          toneClass,
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-6">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
        {action}
      </div>
      <div className="rounded-2xl border border-border/70 bg-card shadow-[var(--shadow-card)]">{children}</div>
    </section>
  );
}
