import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "POPPiK Sales Force Suite — SFA, Distributor, CSA & HRMS" },
      {
        name: "description",
        content:
          "One connected ecosystem for field sales, distributor billing, CSA stock, retailer CRM and employee HRMS.",
      },
      { property: "og:title", content: "POPPiK Sales Force Suite" },
      {
        property: "og:description",
        content: "Company to CSA to distributor to salesman to retailer — one supply chain, one system.",
      },
    ],
  }),
  component: Landing,
});

const pillars = [
  { title: "Sales Force App", body: "GPS attendance, beat plan, outlet visits, order booking, collections, targets." },
  { title: "Distributor Panel", body: "Order acceptance, GST invoicing, auto stock deduction, CSA replenishment." },
  { title: "CSA Panel", body: "Primary orders, approvals, dispatch and stock flowing down to distributors." },
  { title: "Admin Control Tower", body: "Primary & secondary sales, network, inventory, field force and HRMS." },
];

function Landing() {
  return (
    <div className="min-h-screen bg-plum text-plum-foreground">
      <div className="mx-auto max-w-5xl px-6 py-16">
        <p className="text-[11px] uppercase tracking-[0.35em] text-primary-glow">POPPiK</p>
        <h1 className="mt-3 max-w-2xl text-4xl font-semibold leading-tight md:text-5xl">
          Sales Force Automation, Distribution & HRMS in one ecosystem
        </h1>
        <p className="mt-4 max-w-xl text-sm text-plum-foreground/70">
          Company → CSA → Distributor → Salesman → Retailer. One centralized backend, a dedicated dashboard for every role.
        </p>
        <div className="mt-8 flex gap-3">
          <Button asChild size="lg">
            <Link to="/auth">Sign in</Link>
          </Button>
          <Button asChild size="lg" variant="secondary">
            <Link to="/auth">Create account</Link>
          </Button>
        </div>

        <div className="mt-14 grid gap-4 md:grid-cols-2">
          {pillars.map((p) => (
            <div key={p.title} className="rounded-2xl border border-plum-foreground/10 bg-plum-foreground/5 p-5">
              <h2 className="text-base font-semibold">{p.title}</h2>
              <p className="mt-1 text-sm text-plum-foreground/70">{p.body}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
