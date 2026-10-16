import type { Express, NextFunction, Request, Response } from "express";
import { getConcilieMeetings, getConcilieSdrs, findExternalIntegration, logExternalRequest, touchExternalIntegration } from "./db";

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 120;
const requests = new Map<string, { count: number; resetAt: number }>();
const disallowed = new Set(["sector", "sectorId", "setor", "setorId"]);

function jsonDate(value: unknown) { return value instanceof Date ? value.toISOString() : value ?? null; }
function parseDate(value: unknown) { return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined; }
function parsePage(value: unknown, fallback: number, max: number) { const n = Number(value ?? fallback); return Number.isInteger(n) ? Math.min(max, Math.max(1, n)) : fallback; }
function authToken(req: Request) { const header = req.header("authorization") || ""; return header.startsWith("Bearer ") ? header.slice(7).trim() : ""; }
function rejectSectorParams(req: Request) { return Object.keys(req.query).some(key => disallowed.has(key)); }
function rateLimit(req: Request, key: string) {
  const now = Date.now(); const current = requests.get(key);
  if (!current || current.resetAt <= now) { requests.set(key, { count: 1, resetAt: now + WINDOW_MS }); return true; }
  if (current.count >= MAX_REQUESTS) return false;
  current.count += 1; return true;
}
function meetingJson(row: any) {
  const m = row.meeting;
  return { id: m.id, company: m.companyName, cnpj: m.cnpj, contact: m.contactName, phone: m.phone, email: m.email, sdr: row.sdr?.name ?? null, sdrId: m.sdrId, sector: "CONCILIE", date: m.date, time: String(m.time).slice(0, 5), status: m.status, observation: m.notes, createdAt: jsonDate(m.createdAt), updatedAt: jsonDate(m.updatedAt), cancelReason: m.cancelReason };
}
function middleware(req: Request, res: Response, next: NextFunction) {
  void (async () => {
    const token = authToken(req);
    if (!token) return res.status(401).json({ error: "unauthorized", message: "Bearer token obrigatório." });
    if (rejectSectorParams(req)) return res.status(400).json({ error: "invalid_scope_parameter", message: "O setor da integração é fixo em CONCILIE." });
    const integration = await findExternalIntegration(token);
    if (!integration) return res.status(401).json({ error: "unauthorized", message: "API Key inválida ou revogada." });
    if (!rateLimit(req, `${integration.id}:${req.ip}`)) return res.status(429).json({ error: "rate_limit_exceeded", message: "Limite de requisições excedido.", retryAfterSeconds: 60 });
    await touchExternalIntegration(integration.id);
    (req as any).integration = integration;
    next();
  })().catch(() => res.status(500).json({ error: "internal_error", message: "Erro interno de integração." }));
}
function endpoint(handler: (req: Request, res: Response) => Promise<void>) {
  return async (req: Request, res: Response) => {
    try { await handler(req, res); } catch (error) { console.error("[External API]", error); res.status(500).json({ error: "internal_error", message: "Erro interno de integração." }); }
    finally { const integration = (req as any).integration; if (integration) void logExternalRequest({ integrationId: integration.id, method: req.method, endpoint: req.path, statusCode: res.statusCode, ip: req.ip, userAgent: req.get("user-agent") }); }
  };
}
function filters(req: Request) {
  return { from: parseDate(req.query.from), to: parseDate(req.query.to), sdrId: req.query.sdrId ? Number(req.query.sdrId) : undefined, status: typeof req.query.status === "string" && ["AGENDADA", "REALIZADA", "NO_SHOW", "CANCELADA"].includes(req.query.status) ? req.query.status as any : undefined };
}
export function registerExternalConcilieRoutes(app: Express) {
  const base = "/api/external/v1/concilie";
  app.get(`${base}/sdrs`, middleware, endpoint(async (_req, res) => { const rows = await getConcilieSdrs(); res.json({ sector: "CONCILIE", items: rows.map(row => ({ ...row, updatedAt: jsonDate(row.updatedAt) })) }); }));
  app.get(`${base}/meetings`, middleware, endpoint(async (req, res) => { const page = parsePage(req.query.page, 1, 100000); const pageSize = parsePage(req.query.pageSize, 100, 1000); const result = await getConcilieMeetings({ ...filters(req), page, pageSize }); res.json({ sector: "CONCILIE", page, pageSize, total: result.total, items: result.items.map(meetingJson) }); }));
  app.get(`${base}/calendar`, middleware, endpoint(async (req, res) => { const result = await getConcilieMeetings({ ...filters(req), page: 1, pageSize: 10000 }); res.json({ sector: "CONCILIE", from: parseDate(req.query.from) ?? null, to: parseDate(req.query.to) ?? null, total: result.total, items: result.items.map(meetingJson) }); }));
  app.get(`${base}/metrics`, middleware, endpoint(async (req, res) => { const result = await getConcilieMeetings({ ...filters(req), page: 1, pageSize: 10000 }); const counts = { AGENDADA: 0, REALIZADA: 0, NO_SHOW: 0, CANCELADA: 0 }; const bySdr = new Map<number, any>(); for (const row of result.items) { const status = row.meeting.status as keyof typeof counts; counts[status] += 1; const item = bySdr.get(row.meeting.sdrId) ?? { id: row.meeting.sdrId, name: row.sdr?.name ?? "Sem nome", total: 0, AGENDADA: 0, REALIZADA: 0, NO_SHOW: 0, CANCELADA: 0 }; item.total += 1; item[status] += 1; bySdr.set(row.meeting.sdrId, item); } const completed = counts.REALIZADA + counts.NO_SHOW; res.json({ sector: "CONCILIE", period: { from: parseDate(req.query.from) ?? null, to: parseDate(req.query.to) ?? null }, totals: { total: result.items.length, agendadas: counts.AGENDADA, realizadas: counts.REALIZADA, noShow: counts.NO_SHOW, canceladas: counts.CANCELADA, pendentes: counts.AGENDADA }, percentages: { realizacao: completed ? Math.round(counts.REALIZADA / completed * 10000) / 100 : 0, noShow: completed ? Math.round(counts.NO_SHOW / completed * 10000) / 100 : 0, cancelamento: result.items.length ? Math.round(counts.CANCELADA / result.items.length * 10000) / 100 : 0 }, bySdr: [...bySdr.values()] }); }));
  app.get(`${base}/companies`, middleware, endpoint(async (req, res) => { const result = await getConcilieMeetings({ ...filters(req), page: 1, pageSize: 10000 }); const unique = new Map<string, any>(); for (const row of result.items) { const key = row.meeting.cnpj || row.meeting.companyName.toLowerCase(); unique.set(key, { company: row.meeting.companyName, cnpj: row.meeting.cnpj, contact: row.meeting.contactName, meetings: (unique.get(key)?.meetings ?? 0) + 1 }); } res.json({ sector: "CONCILIE", total: unique.size, items: [...unique.values()] }); }));
  app.get(`${base}/dashboard`, middleware, endpoint(async (req, res) => { const result = await getConcilieMeetings({ ...filters(req), page: 1, pageSize: 10000 }); const today = new Date().toISOString().slice(0, 10); const counts = { total: result.items.length, realizadas: 0, noShow: 0, canceladas: 0, pendentes: 0 }; for (const row of result.items) { if (row.meeting.status === "REALIZADA") counts.realizadas++; if (row.meeting.status === "NO_SHOW") counts.noShow++; if (row.meeting.status === "CANCELADA") counts.canceladas++; if (row.meeting.status === "AGENDADA") counts.pendentes++; } res.json({ sector: "CONCILIE", totals: counts, today: result.items.filter(row => String(row.meeting.date).slice(0, 10) === today).map(meetingJson), upcoming: result.items.filter(row => row.meeting.status === "AGENDADA" && String(row.meeting.date).slice(0, 10) >= today).map(meetingJson), items: result.items.map(meetingJson) }); }));
}
