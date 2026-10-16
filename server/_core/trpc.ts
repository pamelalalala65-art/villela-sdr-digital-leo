import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

type AppRole = "user" | "sdr" | "gestao" | "admin" | "master";
const managementRoles: AppRole[] = ["gestao", "admin"];

const t = initTRPC.context<TrpcContext>().create({ transformer: superjson });

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  if (ctx.user.active === false) throw new TRPCError({ code: "FORBIDDEN", message: "Usuário inativo." });
  if (!ctx.sectorId) throw new TRPCError({ code: "FORBIDDEN", message: "Usuário sem setor autorizado." });
  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const protectedProcedure = t.procedure.use(requireUser);

const requireManagement = t.middleware(async opts => {
  const { ctx, next } = opts;
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  if (!managementRoles.includes(ctx.user.role as AppRole)) {
    throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
  }
  if (!ctx.sectorId) throw new TRPCError({ code: "FORBIDDEN", message: "Usuário sem setor autorizado." });
  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const managementProcedure = t.procedure.use(requireManagement);
export const adminProcedure = managementProcedure;
export const isManagementRole = (role: string | null | undefined) => managementRoles.includes(role as AppRole);

const requireMaster = t.middleware(async opts => {
  const { ctx, next } = opts;
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  if (ctx.user.role !== "master") throw new TRPCError({ code: "FORBIDDEN", message: "Apenas o MASTER pode administrar cargos, nomes e setores." });
  if (!ctx.sectorId) throw new TRPCError({ code: "FORBIDDEN", message: "Setor ativo não selecionado." });
  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const masterProcedure = t.procedure.use(requireMaster);
