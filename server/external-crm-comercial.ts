import type { Express, NextFunction, Request, Response } from "express";
import { createHash, timingSafeEqual } from "node:crypto";
import { getCrmCommercialMeetings, getCrmCommercialSectors, CRM_COMMERCIAL_SECTOR_CODES } from "./db";

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 120;
const requests = new Map<string, { count: number; resetAt: number }>();

function jsonDate(value: unknown) { return value instanceof Date ? value.toISOString() : value ?? null; }
function parseDate(value: unknown) { return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined; }
function parseIso(value: unknown) { return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : undefined; }
function parsePage(value: unknown, fallback: number, max: number) { const n = Number(value ?? fallback); return Number.isInteger(n) ? Math.min(max, Math.max(1, n)) : fallback; }
function authToken(req: Request) { const header = req.header("authorization") || ""; return header.startsWith("Bearer ") ? header.slice(7).trim() : ""; }
function validToken(received: string) {
  const expected = process.env.CRM_COMERCIAL_API_KEY?.trim();
  if (!expected || !received) return false;
  const receivedHash = createHash("sha256").update(received).digest();
  const expectedHash = createHash("sha256").update(expected).digest();
  return timingSafeEqual(receivedHash, expectedHash);
}
function rateLimit(req: Request) {
  const key = `${req.ip}:${process.env.CRM_COMERCIAL_API_KEY ? "configured" : "missing"}`;
  const now = Date.now(); const current = requests.get(key);
  if (!current || current.resetAt <= now) { requests.set(key, { count: 1, resetAt: now + WINDOW_MS }); return true; }
  if (current.count >= MAX_REQUESTS) return false;
  current.count += 1; return true;
}
function middleware(req: Request, res: Response, next: NextFunction) {
  if (!process.env.CRM_COMERCIAL_API_KEY) return res.status(503).json({ error: "integration_not_configured", message: "A integração CRM Comercial ainda não foi configurada no servidor." });
  if (!validToken(authToken(req))) return res.status(401).json({ error: "unauthorized", message: "Bearer token obrigatório ou inválido." });
  if (!rateLimit(req)) return res.status(429).json({ error: "rate_limit_exceeded", message: "Limite de requisições excedido.", retryAfterSeconds: 60 });
  next();
}
function filters(req: Request) {
  return {
    from: parseDate(req.query.from),
    to: parseDate(req.query.to),
    updatedSince: parseIso(req.query.updatedSince),
    sdrId: req.query.sdrId ? Number(req.query.sdrId) : undefined,
    status: typeof req.query.status === "string" && ["AGENDADA", "REALIZADA", "NO_SHOW", "CANCELADA"].includes(req.query.status) ? req.query.status as any : undefined,
  };
}
function meetingJson(row: any) {
  const m = row.meeting;
  return {
    ...Object.fromEntries(Object.entries(m).map(([key, value]) => [key, jsonDate(value)])),
    sectorId: m.sectorId,
    sectorCode: row.sector.code,
    sectorName: row.sector.name,
    sdr: row.sdr,
    responsible: row.responsible,
  };
}
function endpoint(handler: (req: Request, res: Response) => Promise<void>) {
  return async (req: Request, res: Response) => {
    try { await handler(req, res); }
    catch (error) { console.error("[CRM Comercial API]", error); res.status(500).json({ error: "internal_error", message: "Erro interno de integração." }); }
  };
}

export function registerExternalCrmComercialRoutes(app: Express) {
  const base = "/api/external/v1/crm-comercial";
  app.get(`${base}/sectors`, middleware, endpoint(async (_req, res) => {
    const sectors = await getCrmCommercialSectors();
    res.json({ allowedSectorCodes: CRM_COMMERCIAL_SECTOR_CODES, items: sectors });
  }));
  app.get(`${base}/meetings`, middleware, endpoint(async (req, res) => {
    const page = parsePage(req.query.page, 1, 100000);
    const pageSize = parsePage(req.query.pageSize, 100, 1000);
    const result = await getCrmCommercialMeetings({ ...filters(req), page, pageSize });
    res.json({
      allowedSectorCodes: CRM_COMMERCIAL_SECTOR_CODES,
      sectors: result.sectors,
      page, pageSize, total: result.total,
      nextPage: page * pageSize < result.total ? page + 1 : null,
      items: result.items.map(meetingJson),
    });
  }));
}
