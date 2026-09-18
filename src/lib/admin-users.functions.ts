import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const roles = [
  "salesman",
  "ba",
  "distributor",
  "csa",
  "depot",
  "ase",
  "asm",
  "business_manager",
  "manager",
  "hr",
  "office",
  "office_manager",
  "super_admin",
] as const;

const createSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  fullName: z.string().min(1),
  phone: z.string().optional().nullable(),
  role: z.enum(roles),
  shopName: z.string().optional().nullable(),
  orgName: z.string().optional().nullable(),
  distributorId: z.string().uuid().optional().nullable(),
  csaId: z.string().uuid().optional().nullable(),
  depotId: z.string().uuid().optional().nullable(),
  reportsTo: z.string().uuid().optional().nullable(),
});

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "super_admin" });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Only company admin can manage user accounts");
}

export const listAppUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: authUsers, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (error) throw new Error(error.message);

    const ids = authUsers.users.map((u) => u.id);
    const { data: profiles } = await supabaseAdmin.from("profiles").select("*").in("id", ids);
    const { data: userRoles } = await supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", ids);

    return authUsers.users
      .map((u) => {
        const profile = (profiles ?? []).find((p) => p.id === u.id);
        return {
          id: u.id,
          email: u.email ?? "",
          createdAt: u.created_at,
          lastSignInAt: u.last_sign_in_at ?? null,
          fullName: profile?.full_name ?? "",
          phone: profile?.phone ?? "",
          role: (userRoles ?? []).find((r) => r.user_id === u.id)?.role ?? "—",
          roles: (userRoles ?? []).filter((r) => r.user_id === u.id).map((r) => r.role),
          distributorId: profile?.distributor_id ?? null,
          csaId: profile?.csa_id ?? null,
          depotId: profile?.depot_id ?? null,
          reportsTo: ((profile ?? {}) as { reports_to?: string | null }).reports_to ?? null,
        };
      })
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  });

export const createAppUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: {
        full_name: data.fullName,
        role: data.role,
        ...(data.phone ? { phone: data.phone } : {}),
        ...(data.shopName ? { shop_name: data.shopName } : {}),
      },
    });
    if (error) throw new Error(error.message);
    const newId = created.user!.id;

    // Create the distributor / CSA org on the fly when admin typed a new name
    let distributorId = data.distributorId ?? null;
    let csaId = data.csaId ?? null;
    const orgName = (data.orgName ?? "").trim();
    if (orgName && data.role === "distributor" && !distributorId) {
      const { data: row, error: e } = await supabaseAdmin
        .from("distributors")
        .insert({ name: orgName, email: data.email, phone: data.phone ?? null } as never)
        .select("id")
        .single();
      if (e) throw new Error(e.message);
      distributorId = (row as { id: string }).id;
    }
    if (orgName && data.role === "csa" && !csaId) {
      const { data: row, error: e } = await supabaseAdmin
        .from("csas")
        .insert({ name: orgName, email: data.email, phone: data.phone ?? null } as never)
        .select("id")
        .single();
      if (e) throw new Error(e.message);
      csaId = (row as { id: string }).id;
    }

    const patch: {
      distributor_id?: string;
      csa_id?: string;
      depot_id?: string;
      phone?: string;
      reports_to?: string;
    } = {};
    if (distributorId) patch.distributor_id = distributorId;
    if (csaId) patch.csa_id = csaId;
    if (data.depotId) patch.depot_id = data.depotId;
    if (data.phone) patch.phone = data.phone;
    if (data.reportsTo) patch.reports_to = data.reportsTo;
    if (Object.keys(patch).length) {
      await supabaseAdmin.from("profiles").update(patch as never).eq("id", newId);
    }

    return { id: newId, email: data.email };
  });

export const deleteAppUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    if (data.id === context.userId) throw new Error("You cannot delete your own admin account");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// HR / admin can remove an employee account (but not their own or an admin's).
export const removeEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const [adminRes, hrRes] = await Promise.all([
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "super_admin" }),
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "hr" }),
    ]);
    if (!adminRes.data && !hrRes.data) throw new Error("Only admin or HR can remove employees");
    if (data.id === context.userId) throw new Error("You cannot remove your own account");
    const { data: targetAdmin } = await context.supabase.rpc("has_role", {
      _user_id: data.id,
      _role: "super_admin",
    });
    if (targetAdmin) throw new Error("Admin accounts cannot be removed from here");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const resetAppUserPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), password: z.string().min(6) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.id, { password: data.password });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setUserManager = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), reportsTo: z.string().uuid().nullable() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    if (data.id === data.reportsTo) throw new Error("A user cannot report to themselves");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ reports_to: data.reportsTo } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setUserRoles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), roles: z.array(z.enum(roles)).min(1) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: delErr } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", data.id)
      .not("role", "in", `(${data.roles.join(",")})`);
    if (delErr) throw new Error(delErr.message);
    const { error } = await supabaseAdmin
      .from("user_roles")
      .upsert(
        data.roles.map((role) => ({ user_id: data.id, role })) as never,
        { onConflict: "user_id,role", ignoreDuplicates: true },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateAppUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        email: z.string().email(),
        fullName: z.string().min(1),
        phone: z.string().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(data.id, {
      email: data.email,
      user_metadata: { full_name: data.fullName, ...(data.phone ? { phone: data.phone } : {}) },
    });
    if (authErr) throw new Error(authErr.message);
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ full_name: data.fullName, phone: data.phone } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setUserMapping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        distributorId: z.string().uuid().nullable(),
        csaId: z.string().uuid().nullable(),
        depotId: z.string().uuid().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({
        distributor_id: data.distributorId,
        csa_id: data.csaId,
        depot_id: data.depotId,
      } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
