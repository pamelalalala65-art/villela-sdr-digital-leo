import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { CLIENT_STATUSES, MEETING_STATUSES } from "@shared/types";
import {
  addMeetingHistory,
  createMeeting,
  deleteMeeting,
  getMeetingById,
  getMeetingCounts,
  getMeetingHistory,
  getMeetings,
  getSdrIndicators,
  getUsers,
  getUserSectors,
  usersBelongToSector,
  ensureSectors,
  roleCanManageAll,
  isMasterEmail,
  roleIsSdr,
  registerPendingUser,
  setUserSectors,
  updateUserProfile,
  updateMeeting,
  updateUserRoleAndActive,
  createExternalIntegration,
  getExternalIntegration,
  revokeExternalIntegration,
  EXTERNAL_CONCILIE_PERMISSIONS,
  calculateBonuses,
  closeBonusCompetency,
  getBonusCompetency,
  getProjurisRanking,
  getConcilieRanking,
  updateUserAvatar,
  createLawyerGoogleInvite,
  getGoogleCalendarConnection,
  getGmailSenderConnection,
  getLawyerById,
  getLawyerGoogleConnectionSecret,
  getLawyers,
  createLawyer,
  updateLawyer,
  markLawyerGoogleInviteError,
} from "./db";
import { createLawyerInviteToken, hashInviteToken, lawyerInviteExpiresAt } from "./google-calendar";
import { syncMeetingToGoogle } from "./google-calendar-sync";
import { sendLawyerGoogleInviteEmail } from "./gmail";
import { getSessionCookieOptions } from "./_core/cookies";
import { COOKIE_NAME } from "@shared/const";
import { masterProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";

const statusSchema = z.enum(MEETING_STATUSES);
const clientStatusSchema = z.enum(CLIENT_STATUSES);
function normalizeDateValue(value: unknown) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  const brazilian = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);
  if (brazilian) return `${brazilian[3]}-${brazilian[2]}-${brazilian[1]}`;
  return trimmed.slice(0, 10);
}
const requiredDateSchema = z.preprocess(normalizeDateValue, z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use uma data válida."));
function scopeBonusResult(result: any, user: { id: number; role: string }) {
  if (user.role === "gestao" || user.role === "master") return result;
  const bySdr = (result.bySdr || []).filter((item: any) => item.id === user.id);
  return {
    ...result,
    bySdr,
    totals: {
      total: bySdr.reduce((sum: number, item: any) => sum + item.totalValue, 0),
      normalMeetings: bySdr.reduce((sum: number, item: any) => sum + item.normalMeetings, 0),
      specialMeetings: bySdr.reduce((sum: number, item: any) => sum + item.specialMeetings, 0),
      specialValue: bySdr.reduce((sum: number, item: any) => sum + item.specialValue, 0),
    },
  };
}
const optionalDateSchema = z.preprocess(value => value === null || value === undefined || (typeof value === "string" && value.trim() === "") ? null : normalizeDateValue(value), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use uma data válida.").optional().nullable());
const optionalTimeSchema = z.preprocess(value => value === null || value === undefined || (typeof value === "string" && value.trim() === "") ? null : String(value).trim().slice(0, 8), z.string().min(4).max(8).optional().nullable());
function saoPauloNowKey() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const get = (type: string) => parts.find(part => part.type === type)?.value || "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

const leadChannelSchema = z.enum(["Instagram", "Facebook", "Google", "TikTok", "LinkedIn", "YouTube", "WhatsApp", "Site / busca orgânica", "Indicação", "Outro", "Não identificado"]);
const adPlatformSchema = z.enum(["Meta Ads", "Google Ads", "TikTok Ads", "LinkedIn Ads", "YouTube Ads", "Outra plataforma", "Não identificado", "Não se aplica"]);
const contactOriginSchema = z.enum(["Formulário de anúncio", "WhatsApp", "Landing page", "Site", "Ligação", "Formulário do site", "Mensagem direta na rede social", "Outro", "Não identificado"]);
const qualificationStatusSchema = z.enum(["NAO_AVALIADO", "QUALIFICADO", "NAO_QUALIFICADO", "EM_ANALISE"]);
const disqualificationReasonSchema = z.enum(["Fora do perfil de cliente", "Sem necessidade do serviço", "Contato inválido", "Empresa não localizada", "Sem interesse", "Dados insuficientes", "Outro"]);
const optionalDisqualificationReasonSchema = z.preprocess(
  value => disqualificationReasonSchema.safeParse(value).success ? value : null,
  disqualificationReasonSchema.nullable().optional(),
);
const optionalContractInstallmentsSchema = z.preprocess(
  value => value === "" || value === undefined || value === null ? null : typeof value === "string" ? Number(value) : value,
  z.number().int().positive().max(120).nullable().optional(),
);
const TRAFFIC_FIELDS = ["leadChannel", "leadChannelOther", "adPlatform", "campaignName", "campaignId", "adSetName", "adSetId", "adName", "adId", "contactOrigin", "contactOriginOther", "utmSource", "utmMedium", "utmCampaign", "utmContent", "utmTerm", "leadEntryDate", "qualificationStatus", "disqualificationReason", "disqualificationOther"] as const;

const filtersSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  exportByContactDate: z.boolean().optional(),
  contactDate: optionalDateSchema.optional(),
  search: z.string().optional(),
  sdrId: z.number().int().positive().optional(),
  responsibleId: z.number().int().positive().optional(),
  status: statusSchema.optional(),
  leadChannel: leadChannelSchema.optional(),
  campaignName: z.string().trim().max(180).optional(),
});

const meetingFields = {
  companyName: z.string().trim().min(2).max(180),
  cnpj: z.string().trim().min(8).max(24),
  contactName: z.string().trim().min(2).max(140),
  phone: z.string().trim().min(8).max(40),
  contactDate: requiredDateSchema,
  email: z.string().trim().max(320).optional().or(z.literal("")),
  sdrId: z.number().int().positive(),
  responsibleId: z.number().int().positive(),
  lawyerEmail: z.string().trim().email().max(320).optional().or(z.literal("")),
  lawyerId: z.number().int().positive().optional().nullable(),
  calendarOwner: z.enum(["SDR", "LAWYER"]).optional(),
  service: z.string().trim().max(160).optional().or(z.literal("")),
  closer: z.string().trim().max(5000).optional().nullable(),
  clientStatus: clientStatusSchema.optional().nullable(),
  date: requiredDateSchema,
  time: z.string().min(4).max(8),
  status: statusSchema,
  notes: z.string().max(5000).optional().nullable(),
  result: z.string().max(5000).optional().nullable(),
  nextStep: z.string().max(2000).optional().nullable(),
  contractValue: z.string().trim().max(60).optional().nullable().or(z.literal("")),
  proposalValue: z.string().trim().max(60).optional().nullable().or(z.literal("")),
  closedContract: z.boolean().optional(),
  closedContractValue: z.string().trim().max(60).optional().nullable().or(z.literal("")),
  contractInstallments: optionalContractInstallmentsSchema,
  contractLawyer: z.string().trim().max(160).optional().nullable().or(z.literal("")),
  nextContactDate: optionalDateSchema,
  noShowReason: z.string().max(2000).optional().nullable(),
  wasContacted: z.boolean().optional().nullable(),
  wantsReschedule: z.boolean().optional().nullable(),
  cancelReason: z.string().max(2000).optional().nullable(),
  pgfnDebtOver2m: z.boolean().optional(),
  pgfnDebtAmount: z.string().max(40).optional().nullable(),
  quickMeeting: z.boolean().optional(),
  leadChannel: leadChannelSchema.optional().nullable(),
  leadChannelOther: z.string().trim().max(160).optional().or(z.literal("")),
  adPlatform: adPlatformSchema.optional().nullable(),
  campaignName: z.string().trim().max(180).optional().or(z.literal("")),
  campaignId: z.string().trim().max(120).optional().or(z.literal("")),
  adSetName: z.string().trim().max(180).optional().or(z.literal("")),
  adSetId: z.string().trim().max(120).optional().or(z.literal("")),
  adName: z.string().trim().max(180).optional().or(z.literal("")),
  adId: z.string().trim().max(120).optional().or(z.literal("")),
  contactOrigin: contactOriginSchema.optional().nullable(),
  contactOriginOther: z.string().trim().max(160).optional().or(z.literal("")),
  utmSource: z.string().max(180).optional().or(z.literal("")),
  utmMedium: z.string().max(180).optional().or(z.literal("")),
  utmCampaign: z.string().max(180).optional().or(z.literal("")),
  utmContent: z.string().max(180).optional().or(z.literal("")),
  utmTerm: z.string().max(180).optional().or(z.literal("")),
  leadEntryDate: optionalDateSchema,
  qualificationStatus: qualificationStatusSchema.optional().nullable(),
  disqualificationReason: optionalDisqualificationReasonSchema,
  disqualificationOther: z.string().trim().max(180).optional().or(z.literal("")),
};

const meetingInputSchema = z.object({ ...meetingFields, closer: z.string().trim().min(2, "Informe o closer da reunião.").max(5000) }).superRefine((value, ctx) => {
  if (value.status === "REALIZADA" && !value.result?.trim()) ctx.addIssue({ code: "custom", path: ["result"], message: "Informe o resultado." });
  if (value.closedContract && !value.closedContractValue?.trim()) ctx.addIssue({ code: "custom", path: ["closedContractValue"], message: "Informe o valor do contrato." });
  if (value.closedContract && !value.contractInstallments) ctx.addIssue({ code: "custom", path: ["contractInstallments"], message: "Informe a quantidade de parcelas." });
  if (value.closedContract && !value.contractLawyer?.trim()) ctx.addIssue({ code: "custom", path: ["contractLawyer"], message: "Informe o advogado responsável." });
  if (value.status === "NO_SHOW" && !value.noShowReason?.trim()) ctx.addIssue({ code: "custom", path: ["noShowReason"], message: "Informe o motivo do no-show." });
  if (value.status === "CANCELADA" && !value.cancelReason?.trim()) ctx.addIssue({ code: "custom", path: ["cancelReason"], message: "Informe o motivo do cancelamento." });
});

const meetingPatchSchema = z.object({
  id: z.number().int().positive(),
  data: z.object(meetingFields).partial().extend({ status: statusSchema.optional() }),
  justification: z.string().trim().min(5, "Informe uma justificativa com pelo menos 5 caracteres.").max(1000).optional(),
}).superRefine(({ data }, ctx) => {
  if (data.status === "REALIZADA" && !data.result?.trim()) ctx.addIssue({ code: "custom", path: ["data", "result"], message: "Informe o resultado." });
  if (data.status === "NO_SHOW" && !data.noShowReason?.trim()) ctx.addIssue({ code: "custom", path: ["data", "noShowReason"], message: "Informe o motivo do no-show." });
  if (data.status === "CANCELADA" && !data.cancelReason?.trim()) ctx.addIssue({ code: "custom", path: ["data", "cancelReason"], message: "Informe o motivo do cancelamento." });
});

function scopeForUser(user: { id: number; role: string }, sectorId: number | null) {
  if (!sectorId) throw new TRPCError({ code: "FORBIDDEN", message: "Setor ativo não selecionado." });
  return { userId: user.id, ownOnly: !roleCanManageAll(user.role), sectorId };
}

function ensureMeetingAccess(meeting: Awaited<ReturnType<typeof getMeetingById>>, user: { id: number; role: string }) {
  if (!meeting) throw new TRPCError({ code: "NOT_FOUND", message: "Reunião não encontrada." });
  if (!roleCanManageAll(user.role) && meeting.meeting.sdrId !== user.id) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Você não tem acesso a esta reunião." });
  }
  return meeting;
}

function validateContactIdentifier(value: string | null | undefined, sectorCode: string | undefined) {
  if (!value || sectorCode === "CONCILIE") return;
  if (!z.string().email().safeParse(value).success) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Informe um e-mail válido para o setor PROJURIS 2.0." });
  }
}

function validateTrafficLeadFields(value: Record<string, any>, sectorCode: string | undefined) {
  if (sectorCode !== "TRAFEGO_PAGO") return;
  if (!value.campaignName?.trim()) throw new TRPCError({ code: "BAD_REQUEST", message: "Informe o nome da campanha no setor TRÁFEGO PAGO." });
  if (value.leadChannel === "Outro" && !value.leadChannelOther?.trim()) throw new TRPCError({ code: "BAD_REQUEST", message: "Informe qual foi o outro canal de origem." });
  if (value.contactOrigin === "Outro" && !value.contactOriginOther?.trim()) throw new TRPCError({ code: "BAD_REQUEST", message: "Informe qual foi a outra origem do contato." });
  if (value.qualificationStatus === "NAO_QUALIFICADO" && !value.disqualificationReason) throw new TRPCError({ code: "BAD_REQUEST", message: "Informe o motivo da desqualificação." });
  if (value.disqualificationReason === "Outro" && !value.disqualificationOther?.trim()) throw new TRPCError({ code: "BAD_REQUEST", message: "Descreva o outro motivo da desqualificação." });
}

function normalizeTrafficLeadFields(value: Record<string, any>, sectorCode: string | undefined) {
  if (sectorCode !== "TRAFEGO_PAGO") return;
  if ("leadChannel" in value && value.leadChannel !== "Outro") value.leadChannelOther = null;
  if ("contactOrigin" in value && value.contactOrigin !== "Outro") value.contactOriginOther = null;
  if ("qualificationStatus" in value && value.qualificationStatus !== "NAO_QUALIFICADO") {
    value.disqualificationReason = null;
    value.disqualificationOther = null;
  }
  if ("disqualificationReason" in value && value.disqualificationReason !== "Outro") value.disqualificationOther = null;
}

function safeValue(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  return typeof value === "string" ? value : JSON.stringify(value);
}
function comparableMeetingValue(key: string, value: unknown) {
  if (key === "date") return normalizeDateValue(value);
  if (key === "time") return typeof value === "string" ? value.trim().slice(0, 5) : value;
  return value;
}

export const appRouter = router({
  system: router({ health: publicProcedure.query(() => ({ ok: true })) }),
  sectors: router({ list: protectedProcedure.query(async ({ ctx }) => ctx.user.role === "master" ? ensureSectors() : ctx.sectors) }),
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user ? ({ ...opts.ctx.user, sectors: opts.ctx.sectors, activeSectorId: opts.ctx.sectorId }) : null),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  dashboard: router({
    summary: protectedProcedure.input(filtersSchema.default({})).query(async ({ input, ctx }) => {
      return getMeetingCounts(input, scopeForUser(ctx.user, ctx.sectorId));
    }),
  }),
  meetings: router({
    list: protectedProcedure.input(filtersSchema.extend({ page: z.number().int().positive().default(1), pageSize: z.number().int().min(5).max(10000).default(20) })).query(({ input, ctx }) => {
      return getMeetings(input, scopeForUser(ctx.user, ctx.sectorId));
    }),
    get: protectedProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ input, ctx }) => {
      const meeting = await getMeetingById(input.id, scopeForUser(ctx.user, ctx.sectorId));
      return ensureMeetingAccess(meeting, ctx.user);
    }),
    history: protectedProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ input, ctx }) => {
      ensureMeetingAccess(await getMeetingById(input.id, scopeForUser(ctx.user, ctx.sectorId)), ctx.user);
      return getMeetingHistory(input.id, ctx.sectorId!);
    }),
    create: protectedProcedure.input(meetingInputSchema).mutation(async ({ input, ctx }) => {
      const canManage = roleCanManageAll(ctx.user.role);
      const sectorCode = ctx.sectors.find(sector => sector.id === ctx.sectorId)?.code;
      const canManageClosedContract = sectorCode === "CONCILIE" && (ctx.user.role === "gestao" || isMasterEmail(ctx.user.email));
      if (input.closedContract && !canManageClosedContract) throw new TRPCError({ code: "FORBIDDEN", message: "Somente o gestor do CONCILIE ou o MASTER pode fechar contratos." });
      validateContactIdentifier(input.email, sectorCode);
      validateTrafficLeadFields(input, sectorCode);
      if (!await usersBelongToSector([canManage ? input.sdrId : ctx.user.id, canManage ? input.responsibleId : ctx.user.id], ctx.sectorId!)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "O SDR e o responsável precisam pertencer ao setor ativo." });
      }
      if (!canManage && input.status !== "AGENDADA") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Somente usuários de gestão podem cadastrar reuniões já realizadas, canceladas ou com outro status histórico." });
      }
      const selectedLawyer = input.lawyerId ? await getLawyerById(input.lawyerId) : null;
      if (input.calendarOwner === "LAWYER") {
        if (!selectedLawyer) throw new TRPCError({ code: "BAD_REQUEST", message: "Selecione um advogado para criar a reunião na agenda dele." });
        const connection = await getLawyerGoogleConnectionSecret(selectedLawyer.id);
        if (!connection || connection.status !== "CONNECTED") throw new TRPCError({ code: "BAD_REQUEST", message: "Este advogado ainda não conectou o Google Calendar. Solicite que ele autorize a conexão ou escolha 'Cadastrar na minha agenda (convite para o advogado)'." });
      }
      const values = {
        ...input,
        service: input.service || "",
        email: input.email || null,
        sdrId: canManage ? input.sdrId : ctx.user.id,
        responsibleId: canManage ? input.responsibleId : ctx.user.id,
        lawyerEmail: selectedLawyer?.email || input.lawyerEmail?.trim().toLowerCase() || null,
        lawyerId: input.lawyerId ?? null,
        closer: input.closer || selectedLawyer?.name || null,
        calendarOwner: (input.calendarOwner === "LAWYER" ? "LAWYER" : "SDR") as "SDR" | "LAWYER",
        sectorId: ctx.sectorId!,
        pgfnDebtOver2m: sectorCode === "PROJURIS_2" ? Boolean(input.pgfnDebtOver2m) : false,
        pgfnDebtAmount: sectorCode === "PROJURIS_2" && input.pgfnDebtOver2m ? input.pgfnDebtAmount || null : null,
        quickMeeting: sectorCode === "PROJURIS_2" && Boolean(input.quickMeeting),
      };
      if (sectorCode !== "TRAFEGO_PAGO") TRAFFIC_FIELDS.forEach(key => delete (values as Record<string, unknown>)[key]);
      if (sectorCode !== "CONCILIE") ["closedContract", "closedContractValue", "contractInstallments", "contractLawyer"].forEach(key => delete (values as Record<string, unknown>)[key]);
      else {
        values.qualificationStatus = input.qualificationStatus || "NAO_AVALIADO";
        normalizeTrafficLeadFields(values as Record<string, any>, sectorCode);
      }
      const id = await createMeeting(values);
      await addMeetingHistory({ meetingId: id, userId: ctx.user.id, action: "REUNIÃO_CRIADA", newValue: JSON.stringify(values) });
      await syncMeetingToGoogle(id, values.sdrId);
      return { id };
    }),
    update: protectedProcedure.input(meetingPatchSchema).mutation(async ({ input, ctx }) => {
      const current = ensureMeetingAccess(await getMeetingById(input.id, scopeForUser(ctx.user, ctx.sectorId)), ctx.user);
      const canManage = roleCanManageAll(ctx.user.role);
      const sectorCode = ctx.sectors.find(sector => sector.id === ctx.sectorId)?.code;
      const canManageClosedContract = sectorCode === "CONCILIE" && (ctx.user.role === "gestao" || isMasterEmail(ctx.user.email));
      validateContactIdentifier(input.data.email, sectorCode);
      if (!canManage && current.meeting.status !== "AGENDADA") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Esta reunião está fechada após a confirmação e só pode ser editada pela gestão." });
      }
      if (!canManage && input.data.status && input.data.status !== current.meeting.status && input.data.status !== "AGENDADA") {
        if (current.meeting.status !== "AGENDADA") throw new TRPCError({ code: "FORBIDDEN", message: "Esta reunião já foi confirmada e não pode ser alterada pelo SDR." });
        const meetingKey = `${String(current.meeting.date).slice(0, 10)}T${String(current.meeting.time).slice(0, 5)}`;
        if (meetingKey > saoPauloNowKey()) throw new TRPCError({ code: "FORBIDDEN", message: "A confirmação só pode ser feita após o horário da reunião." });
      }
      const patch = { ...input.data } as Record<string, unknown>;
      const effectiveTraffic = { ...current.meeting, ...patch } as Record<string, any>;
      const contractKeys = ["closedContract", "closedContractValue", "contractInstallments", "contractLawyer"];
      const hasContractPayload = input.data.closedContract === true
        || ["closedContractValue", "contractInstallments", "contractLawyer"].some(key => {
          const value = input.data[key as keyof typeof input.data];
          return value !== undefined && value !== null && value !== "";
        })
        || (input.data.closedContract === false && current.meeting.closedContract === true);
      if (hasContractPayload) {
        if (!canManageClosedContract) throw new TRPCError({ code: "FORBIDDEN", message: "Somente o gestor do CONCILIE ou o MASTER pode fechar contratos." });
        const effectiveContract = { ...current.meeting, ...patch } as Record<string, any>;
        if (effectiveContract.closedContract && effectiveContract.status !== "REALIZADA") throw new TRPCError({ code: "BAD_REQUEST", message: "O contrato só pode ser fechado após a reunião ser confirmada como REALIZADA." });
        if (effectiveContract.closedContract && (!String(effectiveContract.closedContractValue || "").trim() || !Number(effectiveContract.contractInstallments) || !String(effectiveContract.contractLawyer || "").trim())) throw new TRPCError({ code: "BAD_REQUEST", message: "Preencha valor do contrato, quantidade de parcelas e advogado responsável." });
      }
      const hasTrafficData = TRAFFIC_FIELDS.some(key => effectiveTraffic[key] !== undefined && effectiveTraffic[key] !== null && effectiveTraffic[key] !== "");
      const touchesTraffic = TRAFFIC_FIELDS.some(key => key in patch);
      if (hasTrafficData || touchesTraffic) validateTrafficLeadFields(effectiveTraffic, sectorCode);
      if (!await usersBelongToSector([Number(input.data.sdrId ?? current.meeting.sdrId), Number(input.data.responsibleId ?? current.meeting.responsibleId)], ctx.sectorId!)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "O SDR e o responsável precisam pertencer ao setor ativo." });
      }
      if (sectorCode !== "TRAFEGO_PAGO") TRAFFIC_FIELDS.forEach(key => delete patch[key]);
      else normalizeTrafficLeadFields(patch, sectorCode);
      const targetOwner = input.data.calendarOwner ?? current.meeting.calendarOwner;
      const targetLawyerId = input.data.lawyerId === undefined ? current.meeting.lawyerId : input.data.lawyerId;
      const selectedLawyer = targetLawyerId ? await getLawyerById(targetLawyerId) : null;
      if (targetOwner === "LAWYER") {
        if (!selectedLawyer) throw new TRPCError({ code: "BAD_REQUEST", message: "Selecione um advogado para criar a reunião na agenda dele." });
        const connection = await getLawyerGoogleConnectionSecret(selectedLawyer.id);
        if (!connection || connection.status !== "CONNECTED") throw new TRPCError({ code: "BAD_REQUEST", message: "Este advogado ainda não conectou o Google Calendar. Solicite que ele autorize a conexão ou escolha 'Cadastrar na minha agenda (convite para o advogado)'." });
        patch.lawyerId = selectedLawyer.id;
        patch.lawyerEmail = selectedLawyer.email;
      }
      if (sectorCode !== "PROJURIS_2") { delete patch.pgfnDebtOver2m; delete patch.pgfnDebtAmount; delete patch.quickMeeting; }
      if (sectorCode !== "CONCILIE") contractKeys.forEach(key => delete patch[key]);
      if (!canManage) {
        delete patch.sdrId;
        delete patch.responsibleId;
      }
      const changedEntries = Object.entries(patch).filter(([key, value]) => value !== undefined && comparableMeetingValue(key, value) !== comparableMeetingValue(key, current.meeting[key as keyof typeof current.meeting]));
      const scheduleChanged = ["date", "time"].some(key => changedEntries.some(([changedKey]) => changedKey === key));
      if (scheduleChanged && !canManage && !input.justification) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Informe a justificativa para alterar a data ou o horário." });
      }
      await updateMeeting(input.id, { ...patch, email: patch.email || null } as never);
      if (Object.keys(patch).some(key => ["companyName", "cnpj", "contactName", "phone", "date", "time", "notes", "lawyerEmail", "lawyerId", "calendarOwner", "status"].includes(key))) await syncMeetingToGoogle(input.id, current.meeting.sdrId);
      if (scheduleChanged) {
        await addMeetingHistory({ meetingId: input.id, userId: ctx.user.id, action: "AGENDAMENTO_ALTERADO", oldValue: JSON.stringify({ date: current.meeting.date, time: current.meeting.time }), newValue: JSON.stringify({ date: patch.date ?? current.meeting.date, time: patch.time ?? current.meeting.time, justificativa: input.justification || "Alteração realizada pela gestão" }) });
      }
      for (const [key, value] of changedEntries) {
        await addMeetingHistory({ meetingId: input.id, userId: ctx.user.id, action: `CAMPO_ALTERADO:${key}`, oldValue: safeValue(current.meeting[key as keyof typeof current.meeting]), newValue: safeValue(value) });
      }
      return { success: true } as const;
    }),
    remove: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input, ctx }) => {
      const current = ensureMeetingAccess(await getMeetingById(input.id, scopeForUser(ctx.user, ctx.sectorId)), ctx.user);
      if (!roleCanManageAll(ctx.user.role) && current.meeting.status !== "AGENDADA") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Reuniões já confirmadas não podem ser excluídas pelo SDR." });
      }
      await deleteMeeting(input.id);
      return { success: true } as const;
    }),
  }),
  users: router({
    list: protectedProcedure.input(z.object({ includeInactive: z.boolean().default(false) })).query(async ({ input, ctx }) => {
      const includeInactive = ctx.user.role === "master" && input.includeInactive;
      const rows = await getUsers(includeInactive);
      const visible = ctx.user.role === "master" ? rows : rows.filter(row => row.id === ctx.user.id || roleIsSdr(row.role) || roleCanManageAll(ctx.user.role));
      const withSectors = await Promise.all(visible.map(async row => ({ ...row, sectors: await getUserSectors(row.id), googleCalendar: await getGoogleCalendarConnection(row.id) })));
      if (ctx.user.role === "master") return withSectors;
      const scoped = withSectors.filter(row => row.sectors.some(sector => sector.id === ctx.sectorId));
      if (roleCanManageAll(ctx.user.role)) return scoped;
      return scoped
        .filter(row => row.sectors.some(sector => sector.id === ctx.sectorId))
        .map(row => ({ id: row.id, name: row.name, email: row.email, role: row.role, active: row.active, sectors: row.sectors.filter(sector => sector.id === ctx.sectorId) }));
    }),
    update: masterProcedure.input(z.object({ id: z.number().int().positive(), role: z.enum(["user", "sdr", "gestao", "admin", "master"]), active: z.boolean(), name: z.string().trim().min(2, "Informe um nome válido.").max(160).optional(), sectorIds: z.array(z.number().int().positive()).min(1, "Selecione ao menos um setor.").optional() })).mutation(async ({ input }) => {
      const target = (await getUsers(true)).find(row => row.id === input.id);
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "Usuário não encontrado." });
      if (input.role === "master" && !isMasterEmail(target.email)) throw new TRPCError({ code: "FORBIDDEN", message: "O papel MASTER é exclusivo dos e-mails autorizados." });
      if (isMasterEmail(target.email) && input.role !== "master") throw new TRPCError({ code: "FORBIDDEN", message: "Os e-mails MASTER não podem receber outro papel." });
      // Cargo, nome e status não devem exigir nem apagar os setores já vinculados.
      // sectorIds só é processado quando o MASTER realmente altera a seleção de setores.
      await updateUserRoleAndActive(input.id, input.role, input.active);
      if (input.name !== undefined) await updateUserProfile(input.id, input.name);
      if (input.sectorIds !== undefined) await setUserSectors(input.id, input.sectorIds);
      return { success: true } as const;
    }),
    updateAvatar: masterProcedure.input(z.object({ id: z.number().int().positive(), avatarUrl: z.string().max(3000000).nullable() })).mutation(async ({ input }) => { await updateUserAvatar(input.id, input.avatarUrl); return { success: true } as const; }),
    remove: masterProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input }) => {
      const target = (await getUsers(true)).find(row => row.id === input.id);
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "Usuário não encontrado." });
      if (isMasterEmail(target.email)) throw new TRPCError({ code: "FORBIDDEN", message: "Os logins MASTER não podem ser excluídos." });
      // Exclusão reversível: preserva histórico e permite reaprovação futura pelo pré-cadastro.
      await updateUserRoleAndActive(input.id, target.role, false);
      return { success: true } as const;
    }),
    invite: masterProcedure.input(z.object({ email: z.string().email().max(320), role: z.enum(["sdr", "gestao"]), sectorIds: z.array(z.number().int().positive()).min(1) })).mutation(async ({ input }) => { const id = await registerPendingUser(input.email, input.role); await setUserSectors(id, input.sectorIds); return { id, success: true } as const; }),
  }),
  gmail: router({
    status: masterProcedure.query(() => getGmailSenderConnection()),
  }),
  lawyers: router({
    list: protectedProcedure.input(z.object({ includeInactive: z.boolean().default(false) })).query(({ input, ctx }) => getLawyers(ctx.user.role === "master" && input.includeInactive)),
    create: masterProcedure.input(z.object({ name: z.string().trim().min(2).max(160), email: z.string().email().max(320) })).mutation(({ input }) => createLawyer(input.name, input.email)),
    update: masterProcedure.input(z.object({ id: z.number().int().positive(), name: z.string().trim().min(2).max(160).optional(), email: z.string().email().max(320).optional(), active: z.boolean().optional() })).mutation(async ({ input }) => { const { id, ...patch } = input; await updateLawyer(id, patch); return { success: true } as const; }),
    sendInvite: masterProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input, ctx }) => {
      const lawyer = await getLawyerById(input.id);
      if (!lawyer || !lawyer.active) throw new TRPCError({ code: "NOT_FOUND", message: "Advogado não encontrado ou inativo." });
      const currentConnection = await getLawyerGoogleConnectionSecret(input.id);
      if (currentConnection?.status === "CONNECTED") throw new TRPCError({ code: "CONFLICT", message: "Este advogado já está conectado ao Google Calendar." });
      const rawToken = createLawyerInviteToken();
      const expiresAt = lawyerInviteExpiresAt();
      const inviteId = await createLawyerGoogleInvite({ lawyerId: input.id, tokenHash: hashInviteToken(rawToken), expiresAt });
      const protocol = String(ctx.req.headers["x-forwarded-proto"] || ctx.req.protocol).split(",")[0];
      const host = String(ctx.req.headers["x-forwarded-host"] || ctx.req.get("host"));
      const inviteUrl = `${protocol}://${host}/api/google-calendar/lawyer-invite/${encodeURIComponent(rawToken)}`;
      try {
        await sendLawyerGoogleInviteEmail({ to: lawyer.email, lawyerName: lawyer.name, inviteUrl, expiresAt });
        return { success: true, inviteId, expiresAt } as const;
      } catch (error) {
        await markLawyerGoogleInviteError(inviteId, error instanceof Error ? error.message : "Falha ao enviar o convite.");
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Não foi possível enviar o convite pelo Gmail." });
      }
    }),
  }),
  google: router({
    syncMeeting: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input, ctx }) => { const meeting = ensureMeetingAccess(await getMeetingById(input.id, scopeForUser(ctx.user, ctx.sectorId)), ctx.user); return syncMeetingToGoogle(input.id, meeting.meeting.sdrId); }),
  }),
  profile: router({
    get: protectedProcedure.query(async ({ ctx }) => ({ avatarUrl: ctx.user.avatarUrl ?? null, googleCalendar: await getGoogleCalendarConnection(ctx.user.id) })),
    updateAvatar: protectedProcedure.input(z.object({ avatarUrl: z.string().max(3000000).nullable() })).mutation(async ({ input, ctx }) => { await updateUserAvatar(ctx.user.id, input.avatarUrl); return { success: true } as const; }),
  }),
  integrations: router({
    get: masterProcedure.query(async () => {
      const integration = await getExternalIntegration();
      if (!integration) return null;
      return { id: integration.id, name: integration.name, keyPrefix: integration.keyPrefix, sectorCode: integration.sectorCode, active: integration.active, permissions: EXTERNAL_CONCILIE_PERMISSIONS, createdAt: integration.createdAt, revokedAt: integration.revokedAt, lastUsedAt: integration.lastUsedAt };
    }),
    create: masterProcedure.mutation(async () => {
      const current = await getExternalIntegration();
      if (current?.active) throw new TRPCError({ code: "CONFLICT", message: "Já existe uma API Key ativa para esta integração. Revogue-a antes de criar outra." });
      return createExternalIntegration();
    }),
    revoke: masterProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input }) => { await revokeExternalIntegration(input.id); return { success: true } as const; }),
  }),
  bonuses: router({
    summary: protectedProcedure.input(z.object({ monthKey: z.string().regex(/^\d{4}-\d{2}$/) })).query(async ({ input, ctx }) => {
      const sector = ctx.sectors.find(item => item.id === ctx.sectorId);
      if (sector?.code !== "PROJURIS_2") throw new TRPCError({ code: "FORBIDDEN", message: "Bonificações disponíveis somente para o setor PROJURIS." });
      return scopeBonusResult(await calculateBonuses(input.monthKey), ctx.user);
    }),
    competency: protectedProcedure.input(z.object({ monthKey: z.string().regex(/^\d{4}-\d{2}$/) })).query(async ({ input, ctx }) => {
      const sector = ctx.sectors.find(item => item.id === ctx.sectorId);
      if (sector?.code !== "PROJURIS_2") throw new TRPCError({ code: "FORBIDDEN", message: "Bonificações disponíveis somente para o setor PROJURIS." });
      return getBonusCompetency(input.monthKey);
    }),
    close: masterProcedure.input(z.object({ monthKey: z.string().regex(/^\d{4}-\d{2}$/) })).mutation(async ({ input, ctx }) => {
      const sector = ctx.sectors.find(item => item.id === ctx.sectorId);
      if (sector?.code !== "PROJURIS_2") throw new TRPCError({ code: "FORBIDDEN", message: "Bonificações disponíveis somente para o setor PROJURIS." });
      return closeBonusCompetency(input.monthKey);
    }),
  }),
  ranking: router({
    summary: protectedProcedure.input(z.object({ monthKey: z.string().regex(/^\d{4}-\d{2}$/) })).query(async ({ input, ctx }) => {
      const sector = ctx.sectors.find(item => item.id === ctx.sectorId);
      if (sector?.code === "PROJURIS_2") return getProjurisRanking(input.monthKey);
      if (sector?.code === "CONCILIE") return getConcilieRanking(input.monthKey);
      throw new TRPCError({ code: "FORBIDDEN", message: "O Ranking não está disponível para este setor." });
    }),
  }),
  reports: router({
    indicators: protectedProcedure.input(filtersSchema.default({})).query(({ input, ctx }) => getSdrIndicators(input, scopeForUser(ctx.user, ctx.sectorId))),
    sdrDetail: protectedProcedure.input(z.object({ sdrId: z.number().int().positive(), contactDate: optionalDateSchema })).query(({ input, ctx }) => getMeetings({ sdrId: input.sdrId, contactDate: input.contactDate ?? undefined, page: 1, pageSize: 100 }, scopeForUser(ctx.user, ctx.sectorId))),
    exportRows: protectedProcedure.input(filtersSchema.default({})).query(async ({ input, ctx }) => {
      const rows = await getMeetings({ ...input, reportByContactDate: input.exportByContactDate !== false, page: 1, pageSize: 10000 }, scopeForUser(ctx.user, ctx.sectorId));
      const sectorCode = ctx.sectors.find(sector => sector.id === ctx.sectorId)?.code;
      return rows.items.map(row => ({
        id: row.meeting.id,
        data: row.meeting.date,
        dataContato: row.meeting.contactDate ?? "",
        horario: row.meeting.time,
        empresa: row.meeting.companyName,
        cnpj: row.meeting.cnpj,
        contato: row.meeting.contactName,
        telefone: row.meeting.phone,
        emailOuProcesso: row.meeting.email,
        sdr: row.sdr?.name ?? "",
        sdrEmail: row.sdr?.email ?? "",
        responsavel: row.responsible?.name ?? "",
        responsavelEmail: row.responsible?.email ?? "",
        servico: row.meeting.service,
        canalOrigemLead: row.meeting.leadChannel ?? "",
        outroCanalOrigemLead: row.meeting.leadChannelOther ?? "",
        plataformaAnuncios: row.meeting.adPlatform ?? "",
        nomeCampanha: row.meeting.campaignName ?? "",
        idCampanha: row.meeting.campaignId ?? "",
        nomeConjuntoAnuncios: row.meeting.adSetName ?? "",
        idConjuntoAnuncios: row.meeting.adSetId ?? "",
        nomeAnuncio: row.meeting.adName ?? "",
        idAnuncio: row.meeting.adId ?? "",
        origemEspecificaContato: row.meeting.contactOrigin ?? "",
        outraOrigemContato: row.meeting.contactOriginOther ?? "",
        dataEntradaLead: row.meeting.leadEntryDate ?? "",
        utmSource: row.meeting.utmSource ?? "",
        utmMedium: row.meeting.utmMedium ?? "",
        utmCampaign: row.meeting.utmCampaign ?? "",
        utmContent: row.meeting.utmContent ?? "",
        utmTerm: row.meeting.utmTerm ?? "",
        statusQualificacao: row.meeting.qualificationStatus ?? "",
        motivoDesqualificacao: row.meeting.disqualificationReason ?? "",
        outroMotivoDesqualificacao: row.meeting.disqualificationOther ?? "",
        closer: row.meeting.closer ?? "",
        valorContrato: row.meeting.contractValue ?? "",
        valorProposta: row.meeting.proposalValue ?? "",
        contratoFechado: row.meeting.closedContract ? "SIM" : "NÃO",
        valorContratoFechado: row.meeting.closedContractValue ?? "",
        quantidadeParcelas: row.meeting.contractInstallments ?? "",
        advogadoResponsavelContrato: row.meeting.contractLawyer ?? "",
        statusCliente: row.meeting.clientStatus ?? "",
        status: row.meeting.status,
        resultado: row.meeting.result ?? "",
        proximoPasso: row.meeting.nextStep ?? "",
        proximoContato: row.meeting.nextContactDate ?? "",
        motivoNoShow: row.meeting.noShowReason ?? "",
        clienteContatado: row.meeting.wasContacted ? "Sim" : "Não",
        desejaRemarcar: row.meeting.wantsReschedule ? "Sim" : "Não",
        motivoCancelamento: row.meeting.cancelReason ?? "",
        pgfnAcimaDeDoisMilhoes: sectorCode === "PROJURIS_2" && row.meeting.pgfnDebtOver2m ? "Sim" : "Não",
        ...(sectorCode === "PROJURIS_2" ? { reuniaoRelampago: row.meeting.quickMeeting ? "Sim" : "Não" } : {}),
        valorDividaPgfn: row.meeting.pgfnDebtAmount ?? "",
        emailAdvogado: row.meeting.lawyerEmail ?? "",
        googleCalendarStatus: row.meeting.googleCalendarStatus ?? "",
        linkGoogleMeet: row.meeting.googleMeetLink ?? "",
        conviteGoogleEnviado: row.meeting.googleInviteSent ? "Sim" : "Não",
        observacoes: row.meeting.notes ?? "",
      }));
    }),
  }),
});

export type AppRouter = typeof appRouter;
