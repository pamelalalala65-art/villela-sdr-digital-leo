import { and, asc, count, desc, eq, gte, inArray, like, lte, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { alias } from "drizzle-orm/mysql-core";
import { createHash, randomBytes } from "node:crypto";
import { InsertMeeting, InsertUser, MeetingStatus, apiIntegrationLogs, apiIntegrations, bonusCompetencies, gmailSenderConnections, googleCalendarConnections, lawyerGoogleCalendarConnections, lawyerGoogleInvites, lawyers, meetingHistory, meetings, sectors, userSectors, UserRole, users } from "../drizzle/schema";
import { ENV } from "./_core/env";
import { compareProjurisRankingRows, isCompletedQuickMeeting } from "./meetingMetrics";

let _db: ReturnType<typeof drizzle> | null = null;
export const PRIMARY_MANAGER_EMAIL = "leonardo.cunha@grupovillela.com";
export const MASTER_EMAILS = [PRIMARY_MANAGER_EMAIL, "leonardo.cunha0905@gmail.com"] as const;
export const DEFAULT_SECTOR_CODE = "PROJURIS_2" as const;
export const SECTOR_OPTIONS = [
  { code: "PROJURIS_2" as const, name: "PROJURIS 2.0" },
  { code: "CONCILIE" as const, name: "CONCILIE" },
  { code: "TRAFEGO_PAGO" as const, name: "TRÁFEGO PAGO" },
];

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  for (const field of textFields) {
    const value = user[field];
    if (value !== undefined) {
      values[field] = value ?? null;
      updateSet[field] = value ?? null;
    }
  }
  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (isMasterEmail(user.email)) {
    values.role = "master";
    updateSet.role = "master";
  } else if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  if (user.active !== undefined) {
    values.active = user.active;
    updateSet.active = user.active;
  }
  values.lastSignedIn ??= new Date();
  updateSet.lastSignedIn ??= new Date();
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  const current = await db.select({ id: users.id, email: users.email }).from(users).where(eq(users.openId, user.openId)).limit(1);
  if (current[0] && isMasterEmail(current[0].email)) {
    const allSectors = await db.select({ id: sectors.id }).from(sectors).where(eq(sectors.active, true));
    for (const sector of allSectors) await db.insert(userSectors).values({ userId: current[0].id, sectorId: sector.id }).onDuplicateKeyUpdate({ set: { sectorId: sector.id } });
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.email, email.trim().toLowerCase())).limit(1);
  return result[0];
}

export async function claimImportedUserByEmail(input: { openId: string; email: string; name?: string | null; loginMethod?: string | null }) {
  const db = await getDb();
  if (!db || !input.openId || !input.email.trim()) return false;
  const email = input.email.trim().toLowerCase();
  const matches = await db.select({ id: users.id, openId: users.openId, name: users.name })
    .from(users)
    .where(and(eq(users.email, email), eq(users.active, true)));
  const candidates = matches.filter(user => user.openId.startsWith("villela_import_"));
  if (candidates.length !== 1) return false;
  const candidate = candidates[0];
  const result = await db.update(users)
    .set({
      openId: input.openId,
      name: candidate.name?.trim() ? candidate.name : input.name || null,
      loginMethod: input.loginMethod || null,
      lastSignedIn: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(users.id, candidate.id), eq(users.openId, candidate.openId), eq(users.active, true)));
  const affectedRows = Number((result as unknown as [{ affectedRows?: number }])[0]?.affectedRows ?? 0);
  return affectedRows > 0;
}

export async function registerPendingUser(email: string, role: UserRole) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const normalized = email.trim().toLowerCase();
  const existing = await getUserByEmail(normalized);
  if (existing) {
    await db.update(users).set({ role, active: true, updatedAt: new Date() }).where(eq(users.id, existing.id));
    return existing.id;
  }
  const openId = `pending_${createHash("sha256").update(normalized).digest("hex").slice(0, 48)}`;
  const result = await db.insert(users).values({ openId, email: normalized, role, active: true, loginMethod: "pending" });
  return Number(result[0].insertId);
}

export async function claimPendingUser(id: number, openId: string, name: string | null, loginMethod: string | null) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const existing = await db.select({ name: users.name }).from(users).where(eq(users.id, id)).limit(1);
  // O nome ajustado pelo MASTER é a fonte oficial; o OAuth só preenche nomes ainda vazios.
  await db.update(users).set({ openId, name: existing[0]?.name?.trim() ? existing[0].name : name, loginMethod, lastSignedIn: new Date(), updatedAt: new Date() }).where(eq(users.id, id));
}

export async function getUsers(includeInactive = false) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(users).where(includeInactive ? undefined : eq(users.active, true)).orderBy(asc(users.name));
}

export async function ensureSectors() {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  for (const sector of SECTOR_OPTIONS) {
    await db.insert(sectors).values(sector).onDuplicateKeyUpdate({ set: { name: sector.name, active: true } });
  }
  return db.select().from(sectors).where(eq(sectors.active, true));
}

export async function getUserSectors(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({ id: sectors.id, code: sectors.code, name: sectors.name })
    .from(userSectors)
    .innerJoin(sectors, eq(userSectors.sectorId, sectors.id))
    .where(and(eq(userSectors.userId, userId), eq(sectors.active, true)))
    .orderBy(asc(sectors.id));
}

export async function usersBelongToSector(userIds: number[], sectorId: number) {
  const db = await getDb();
  if (!db) return false;
  const ids = [...new Set(userIds)];
  if (!ids.length) return false;
  const rows = await db.select({ userId: userSectors.userId })
    .from(userSectors)
    .innerJoin(sectors, eq(userSectors.sectorId, sectors.id))
    .where(and(inArray(userSectors.userId, ids), eq(userSectors.sectorId, sectorId), eq(sectors.active, true)));
  return rows.length === ids.length;
}

export async function getActiveSectors() {
  const db = await getDb();
  if (!db) return [];
  return db.select({ id: sectors.id, code: sectors.code, name: sectors.name })
    .from(sectors)
    .where(eq(sectors.active, true))
    .orderBy(asc(sectors.id));
}

export async function setUserSectors(userId: number, sectorIds: number[]) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const uniqueIds = [...new Set(sectorIds)];
  const valid = await db.select({ id: sectors.id }).from(sectors).where(and(inArray(sectors.id, uniqueIds), eq(sectors.active, true)));
  if (valid.length !== uniqueIds.length || uniqueIds.length === 0) throw new Error("Selecione apenas setores ativos e válidos.");
  await db.delete(userSectors).where(eq(userSectors.userId, userId));
  await db.insert(userSectors).values(uniqueIds.map(sectorId => ({ userId, sectorId })));
}

export async function getSectorById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(sectors).where(and(eq(sectors.id, id), eq(sectors.active, true))).limit(1);
  return rows[0];
}

export async function countUsers() {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.select({ value: count() }).from(users).where(eq(users.active, true));
  return Number(result[0]?.value ?? 0);
}

type MeetingFilters = {
  from?: string;
  to?: string;
  updatedSince?: string;
  contactDate?: string | null;
  reportByContactDate?: boolean;
  search?: string;
  sdrId?: number;
  responsibleId?: number;
  status?: MeetingStatus;
  leadChannel?: string;
  campaignName?: string;
};

export type Scope = { userId: number; ownOnly: boolean; sectorId?: number; sectorIds?: number[] };

function buildWhere(filters: MeetingFilters, scope?: Scope) {
  const predicates = [];
  const periodColumn = filters.reportByContactDate ? meetings.contactDate : meetings.date;
  if (filters.from) predicates.push(gte(periodColumn, filters.from));
  if (filters.to) predicates.push(lte(periodColumn, filters.to));
  if (filters.updatedSince) predicates.push(gte(meetings.updatedAt, new Date(filters.updatedSince)));
  if (filters.contactDate) predicates.push(eq(meetings.contactDate, filters.contactDate));
  if (filters.sdrId) predicates.push(eq(meetings.sdrId, filters.sdrId));
  if (filters.responsibleId) predicates.push(eq(meetings.responsibleId, filters.responsibleId));
  if (filters.status) predicates.push(eq(meetings.status, filters.status));
  if (filters.leadChannel) predicates.push(eq(meetings.leadChannel, filters.leadChannel));
  if (filters.campaignName?.trim()) predicates.push(like(meetings.campaignName, `%${filters.campaignName.trim()}%`));
  if (scope?.ownOnly) predicates.push(eq(meetings.sdrId, scope.userId));
  if (scope?.sectorId) predicates.push(eq(meetings.sectorId, scope.sectorId));
  if (scope?.sectorIds?.length) predicates.push(inArray(meetings.sectorId, scope.sectorIds));
  if (filters.search?.trim()) {
    const term = `%${filters.search.trim()}%`;
    predicates.push(or(
      like(meetings.companyName, term),
      like(meetings.cnpj, term),
      like(meetings.contactName, term),
      like(meetings.phone, term),
    ));
  }
  return predicates.length ? and(...predicates) : undefined;
}

const sdr = alias(users, "meeting_sdr");
const responsible = alias(users, "meeting_responsible");

export async function getMeetings(
  filters: MeetingFilters & { page?: number; pageSize?: number } = {},
  scope?: Scope,
) {
  const db = await getDb();
  if (!db) return { items: [], total: 0, page: filters.page ?? 1, pageSize: filters.pageSize ?? 20 };
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(10000, Math.max(1, filters.pageSize ?? 20));
  const where = buildWhere(filters, scope);
  const [items, totalRows] = await Promise.all([
    db.select({
      meeting: meetings,
      sdr: { id: sdr.id, name: sdr.name, email: sdr.email },
      responsible: { id: responsible.id, name: responsible.name, email: responsible.email },
    })
      .from(meetings)
      .leftJoin(sdr, eq(meetings.sdrId, sdr.id))
      .leftJoin(responsible, eq(meetings.responsibleId, responsible.id))
      .where(where)
      .orderBy(desc(meetings.date), desc(meetings.time), desc(meetings.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ value: count() }).from(meetings).where(where),
  ]);
  return { items, total: Number(totalRows[0]?.value ?? 0), page, pageSize };
}

export const CRM_COMMERCIAL_SECTOR_CODES = ["PROJURIS_2", "TRAFEGO_PAGO"] as const;

export async function getCrmCommercialSectors() {
  const db = await getDb();
  if (!db) return [];
  return db.select({ id: sectors.id, code: sectors.code, name: sectors.name })
    .from(sectors)
    .where(and(inArray(sectors.code, CRM_COMMERCIAL_SECTOR_CODES), eq(sectors.active, true)))
    .orderBy(asc(sectors.id));
}

export async function getCrmCommercialMeetings(filters: MeetingFilters & { page?: number; pageSize?: number } = {}) {
  const allowedSectors = await getCrmCommercialSectors();
  const result = await getMeetings(filters, { userId: 0, ownOnly: false, sectorIds: allowedSectors.map(sector => sector.id) });
  const sectorById = new Map(allowedSectors.map(sector => [sector.id, sector]));
  return {
    ...result,
    sectors: allowedSectors,
    items: result.items.filter(row => sectorById.has(row.meeting.sectorId)).map(row => ({ ...row, sector: sectorById.get(row.meeting.sectorId)! })),
  };
}

export async function getAllMeetingsForSummary(filters: MeetingFilters, scope?: Scope) {
  const db = await getDb();
  if (!db) return [];
  const where = buildWhere(filters, scope);
  return db.select({ meeting: meetings, sdrName: sdr.name })
    .from(meetings)
    .leftJoin(sdr, eq(meetings.sdrId, sdr.id))
    .where(where)
    .orderBy(asc(meetings.date), asc(meetings.time));
}

export async function getMeetingById(id: number, scope?: Scope) {
  const db = await getDb();
  if (!db) return undefined;
  const where = buildWhere({}, scope);
  const rows = await db.select({
    meeting: meetings,
    sdr: { id: sdr.id, name: sdr.name, email: sdr.email },
    responsible: { id: responsible.id, name: responsible.name, email: responsible.email },
  })
    .from(meetings)
    .leftJoin(sdr, eq(meetings.sdrId, sdr.id))
    .leftJoin(responsible, eq(meetings.responsibleId, responsible.id))
    .where(and(eq(meetings.id, id), where))
    .limit(1);
  return rows[0];
}

export async function createMeeting(input: InsertMeeting) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const result = await db.insert(meetings).values(input);
  return Number(result[0].insertId);
}

export async function updateMeeting(id: number, input: Partial<InsertMeeting>) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(meetings).set({ ...input, updatedAt: new Date() }).where(eq(meetings.id, id));
}
export async function deleteMeeting(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.delete(meetingHistory).where(eq(meetingHistory.meetingId, id));
  await db.delete(meetings).where(eq(meetings.id, id));
}
export async function updateMeetingGoogle(id: number, patch: Record<string, unknown>) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(meetings).set({ ...patch, updatedAt: new Date() } as never).where(eq(meetings.id, id));
}
export async function addMeetingHistory(input: {
  meetingId: number;
  userId: number;
  sectorId?: number;
  action: string;
  oldValue?: string | null;
  newValue?: string | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const meeting = input.sectorId ? undefined : await db.select({ sectorId: meetings.sectorId }).from(meetings).where(eq(meetings.id, input.meetingId)).limit(1);
  const sectorId = input.sectorId ?? meeting?.[0]?.sectorId;
  if (!sectorId) throw new Error("Meeting sector is required");
  await db.insert(meetingHistory).values({
    meetingId: input.meetingId,
    userId: input.userId,
    sectorId,
    action: input.action,
    oldValue: input.oldValue ?? null,
    newValue: input.newValue ?? null,
  });
}

export async function getMeetingHistory(meetingId: number, sectorId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({ history: meetingHistory, userName: users.name })
    .from(meetingHistory)
    .leftJoin(users, eq(meetingHistory.userId, users.id))
    .where(and(eq(meetingHistory.meetingId, meetingId), eq(meetingHistory.sectorId, sectorId)))
    .orderBy(desc(meetingHistory.createdAt));
}

export async function updateUserRoleAndActive(id: number, role: UserRole, active: boolean) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(users).set({ role, active, updatedAt: new Date() }).where(eq(users.id, id));
}
export async function updateUserProfile(id: number, name: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(users).set({ name: name.trim(), updatedAt: new Date() }).where(eq(users.id, id));
}
export async function updateUserAvatar(id: number, avatarUrl: string | null) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(users).set({ avatarUrl, updatedAt: new Date() }).where(eq(users.id, id));
}

export async function getGoogleCalendarConnection(userId: number) {
  const db = await getDb();
  if (!db) return null;
  return (await db.select({ email: googleCalendarConnections.googleAccountEmail, connectedAt: googleCalendarConnections.createdAt, updatedAt: googleCalendarConnections.updatedAt })
    .from(googleCalendarConnections)
    .where(eq(googleCalendarConnections.userId, userId))
    .limit(1))[0] ?? null;
}
export async function getGoogleCalendarConnectionSecret(userId: number) {
  const db = await getDb();
  if (!db) return null;
  return (await db.select().from(googleCalendarConnections).where(eq(googleCalendarConnections.userId, userId)).limit(1))[0] ?? null;
}
export async function saveGoogleCalendarConnection(input: {
  userId: number;
  googleAccountEmail: string;
  refreshTokenCiphertext: string;
  accessTokenCiphertext: string | null;
  accessTokenExpiresAt: Date | null;
  scope: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.insert(googleCalendarConnections).values(input).onDuplicateKeyUpdate({
    set: {
      googleAccountEmail: input.googleAccountEmail,
      refreshTokenCiphertext: input.refreshTokenCiphertext,
      accessTokenCiphertext: input.accessTokenCiphertext,
      accessTokenExpiresAt: input.accessTokenExpiresAt,
      scope: input.scope,
      updatedAt: new Date(),
    },
  });
}
export async function deleteGoogleCalendarConnection(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.delete(googleCalendarConnections).where(eq(googleCalendarConnections.userId, userId));
}

export async function getGmailSenderConnectionSecret() {
  const db = await getDb();
  if (!db) return null;
  return (await db.select().from(gmailSenderConnections).limit(1))[0] ?? null;
}
export async function getGmailSenderConnection() {
  const connection = await getGmailSenderConnectionSecret();
  if (!connection) return null;
  return { ...connection, refreshTokenCiphertext: undefined, accessTokenCiphertext: undefined };
}
export async function saveGmailSenderConnection(input: { googleAccountEmail: string; refreshTokenCiphertext: string; accessTokenCiphertext: string | null; accessTokenExpiresAt: Date | null; scope: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.delete(gmailSenderConnections);
  await db.insert(gmailSenderConnections).values({ ...input, status: "CONNECTED", lastError: null, connectedAt: new Date() });
}
export async function updateGmailSenderConnection(patch: Record<string, unknown>) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(gmailSenderConnections).set({ ...patch, updatedAt: new Date() } as never);
}
export async function deleteGmailSenderConnection() {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.delete(gmailSenderConnections);
}

export async function getLawyers(includeInactive = false) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select({ lawyer: lawyers, connection: lawyerGoogleCalendarConnections })
    .from(lawyers)
    .leftJoin(lawyerGoogleCalendarConnections, eq(lawyers.id, lawyerGoogleCalendarConnections.lawyerId))
    .where(includeInactive ? undefined : eq(lawyers.active, true))
    .orderBy(asc(lawyers.name));
  const invites = await db.select().from(lawyerGoogleInvites).orderBy(desc(lawyerGoogleInvites.createdAt));
  const latestInviteByLawyer = new Map<number, typeof invites[number]>();
  for (const invite of invites) if (!latestInviteByLawyer.has(invite.lawyerId)) latestInviteByLawyer.set(invite.lawyerId, invite);
  const now = Date.now();
  return rows.map(row => {
    const invite = latestInviteByLawyer.get(row.lawyer.id);
    const inviteStatus = invite && invite.status === "PENDING" && new Date(invite.expiresAt).getTime() <= now ? "EXPIRED" : invite?.status;
    return {
      ...row.lawyer,
      connection: row.connection ? { ...row.connection, refreshTokenCiphertext: undefined, accessTokenCiphertext: undefined } : null,
      invite: invite ? { id: invite.id, status: inviteStatus, sentAt: invite.sentAt, expiresAt: invite.expiresAt, usedAt: invite.usedAt, lastError: invite.lastError } : null,
    };
  });
}
export async function getLawyerById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  return (await db.select().from(lawyers).where(eq(lawyers.id, id)).limit(1))[0];
}
export async function createLawyer(name: string, email: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const result = await db.insert(lawyers).values({ name: name.trim(), email: email.trim().toLowerCase() });
  return Number(result[0].insertId);
}
export async function updateLawyer(id: number, patch: { name?: string; email?: string; active?: boolean }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(lawyers).set({ ...patch, ...(patch.email ? { email: patch.email.trim().toLowerCase() } : {}), updatedAt: new Date() }).where(eq(lawyers.id, id));
}
export async function getLawyerGoogleConnectionSecret(lawyerId: number) {
  const db = await getDb();
  if (!db) return null;
  return (await db.select().from(lawyerGoogleCalendarConnections).where(eq(lawyerGoogleCalendarConnections.lawyerId, lawyerId)).limit(1))[0] ?? null;
}
export async function saveLawyerGoogleConnection(input: { lawyerId: number; googleAccountEmail: string; refreshTokenCiphertext: string; accessTokenCiphertext: string | null; accessTokenExpiresAt: Date | null; scope: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.insert(lawyerGoogleCalendarConnections).values({ ...input, status: "CONNECTED", lastConnectedAt: new Date(), lastError: null }).onDuplicateKeyUpdate({ set: { googleAccountEmail: input.googleAccountEmail, refreshTokenCiphertext: input.refreshTokenCiphertext, accessTokenCiphertext: input.accessTokenCiphertext, accessTokenExpiresAt: input.accessTokenExpiresAt, scope: input.scope, status: "CONNECTED", lastError: null, lastConnectedAt: new Date(), updatedAt: new Date() } });
}
export async function updateLawyerGoogleConnection(lawyerId: number, patch: Record<string, unknown>) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(lawyerGoogleCalendarConnections).set({ ...patch, updatedAt: new Date() } as never).where(eq(lawyerGoogleCalendarConnections.lawyerId, lawyerId));
}
export async function deleteLawyerGoogleConnection(lawyerId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.delete(lawyerGoogleCalendarConnections).where(eq(lawyerGoogleCalendarConnections.lawyerId, lawyerId));
}
export async function createLawyerGoogleInvite(input: { lawyerId: number; tokenHash: string; expiresAt: Date }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(lawyerGoogleInvites).set({ status: "EXPIRED" }).where(and(eq(lawyerGoogleInvites.lawyerId, input.lawyerId), eq(lawyerGoogleInvites.status, "PENDING")));
  const result = await db.insert(lawyerGoogleInvites).values({ ...input, status: "PENDING", sentAt: new Date() });
  return Number(result[0].insertId);
}
export async function getLawyerGoogleInviteByTokenHash(tokenHash: string) {
  const db = await getDb();
  if (!db) return null;
  const row = (await db.select({ invite: lawyerGoogleInvites, lawyer: lawyers }).from(lawyerGoogleInvites).innerJoin(lawyers, eq(lawyers.id, lawyerGoogleInvites.lawyerId)).where(eq(lawyerGoogleInvites.tokenHash, tokenHash)).limit(1))[0];
  if (!row) return null;
  if (row.invite.status === "PENDING" && new Date(row.invite.expiresAt).getTime() <= Date.now()) {
    await db.update(lawyerGoogleInvites).set({ status: "EXPIRED" }).where(eq(lawyerGoogleInvites.id, row.invite.id));
    return { ...row, invite: { ...row.invite, status: "EXPIRED" as const } };
  }
  return row;
}
export async function markLawyerGoogleInviteUsed(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const result = await db.update(lawyerGoogleInvites).set({ status: "USED", usedAt: new Date(), lastError: null }).where(and(eq(lawyerGoogleInvites.id, id), eq(lawyerGoogleInvites.status, "PENDING")));
  return Number(result[0]?.affectedRows || 0) === 1;
}
export async function markLawyerGoogleInviteError(id: number, message: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(lawyerGoogleInvites).set({ status: "ERROR", lastError: message.slice(0, 2000) }).where(eq(lawyerGoogleInvites.id, id));
}

export async function getMeetingCounts(filters: MeetingFilters, scope?: Scope) {
  const rows = await getAllMeetingsForSummary(filters, scope);
  const counts = { AGENDADA: 0, REALIZADA: 0, NO_SHOW: 0, CANCELADA: 0 };
  const bySdr = new Map<number, { id: number; name: string; total: number; realized: number; quickMeetings: number; noShow: number; closedContracts: number }>();
  for (const row of rows) {
    const status = row.meeting.status as keyof typeof counts;
    const isQuick = isCompletedQuickMeeting(row.meeting);
    if (status in counts && !(status === "REALIZADA" && isQuick)) counts[status] += 1;
    const sdrId = row.meeting.sdrId == null ? -1 : Number(row.meeting.sdrId);
    const name = row.sdrName || "Sem SDR";
    const current = bySdr.get(sdrId) ?? { id: sdrId, name, total: 0, realized: 0, quickMeetings: 0, noShow: 0, closedContracts: 0 };
    current.total += 1;
    if (status === "REALIZADA") {
      if (isQuick) current.quickMeetings += 1;
      else current.realized += 1;
    }
    if (status === "NO_SHOW") current.noShow += 1;
    if (row.meeting.closedContract) current.closedContracts += 1;
    bySdr.set(sdrId, current);
  }
  const completed = counts.REALIZADA + counts.NO_SHOW;
  const today = new Date().toISOString().slice(0, 10);
  return {
    ...counts,
    reunioesRelampago: rows.filter(row => isCompletedQuickMeeting(row.meeting)).length,
    total: rows.length,
    attendanceRate: completed ? Math.round((counts.REALIZADA / completed) * 100) : null,
    bySdr: Array.from(bySdr.values()).sort((a, b) => b.total - a.total),
    today: rows.filter(row => String(row.meeting.date) === new Date().toISOString().slice(0, 10)).slice(0, 8),
    upcoming: rows.filter(row => row.meeting.status === "AGENDADA" && String(row.meeting.date).slice(0, 10) >= today).slice(0, 8),
    closedContracts: rows.filter(row => row.meeting.closedContract).length,
  };
}

export async function getSdrIndicators(filters: MeetingFilters, scope?: Scope) {
  // O total e os status são gerais do período pela DATA DO AGENDAMENTO.
  // A data de contato continua sendo usada apenas para dias com contato e ticket médio.
  const rows = await getAllMeetingsForSummary({ ...filters, reportByContactDate: false }, scope);
  const contactRows = await getAllMeetingsForSummary({ ...filters, reportByContactDate: true }, scope);
  const names = new Map<number, { id: number; name: string; totalAgendamentos: number; pendentes: number; realizadas: number; reunioesRelampago: number; noShow: number; canceladas: number; contactDates: Set<string> }>();
  for (const row of rows) {
    const current = names.get(row.meeting.sdrId) ?? { id: row.meeting.sdrId, name: row.sdrName || "Sem nome", totalAgendamentos: 0, pendentes: 0, realizadas: 0, reunioesRelampago: 0, noShow: 0, canceladas: 0, contactDates: new Set<string>() };
    current.totalAgendamentos += 1;
    const key = row.meeting.status;
    if (key === "AGENDADA") current.pendentes += 1;
    if (key === "REALIZADA") {
      if (isCompletedQuickMeeting(row.meeting)) current.reunioesRelampago += 1;
      else current.realizadas += 1;
    }
    if (key === "NO_SHOW") current.noShow += 1;
    if (key === "CANCELADA") current.canceladas += 1;
    names.set(row.meeting.sdrId, current);
  }
  for (const row of contactRows) {
    if (!row.meeting.contactDate) continue;
    const current = names.get(row.meeting.sdrId);
    if (current) current.contactDates.add(String(row.meeting.contactDate).slice(0, 10));
  }
  return Array.from(names.values()).map(item => ({
    ...item,
    diasComContato: item.contactDates.size,
    ticketMedioAgendamentosDia: item.contactDates.size ? Math.round((item.totalAgendamentos / item.contactDates.size) * 100) / 100 : null,
    agendadas: item.pendentes,
    taxaComparecimento: item.realizadas + item.noShow ? Math.round((item.realizadas / (item.realizadas + item.noShow)) * 100) : null,
    contactDates: undefined,
  }));
}

export function roleCanManageAll(role: string | null | undefined) {
  return role === "gestao" || role === "admin" || role === "master";
}

export function isMasterEmail(email: string | null | undefined) {
  return Boolean(email && MASTER_EMAILS.includes(email.trim().toLowerCase() as typeof MASTER_EMAILS[number]));
}

export function roleIsSdr(role: string | null | undefined) {
  return role === "user" || role === "sdr";
}

export type { MeetingFilters };

export async function getProjurisSectorId() {
  const db = await getDb(); if (!db) return null;
  const row = await db.select({ id: sectors.id }).from(sectors).where(and(eq(sectors.code, "PROJURIS_2"), eq(sectors.active, true))).limit(1);
  return row[0]?.id ?? null;
}
async function calculateRankingLive(monthKey: string, sectorId: number, includeBonus: boolean) {
  const db = await getDb();
  if (!db) return { monthKey, status: "ABERTA", rows: [], totals: {}, evolution: [], leaders: [] };
  const [year, month] = monthKey.split("-").map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  const usersInSector = await db.select({ id: users.id, name: users.name, email: users.email, avatarUrl: users.avatarUrl })
    .from(users).innerJoin(userSectors, eq(users.id, userSectors.userId))
    .where(and(eq(userSectors.sectorId, sectorId), eq(users.active, true), inArray(users.role, ["user", "sdr"])));
  const rows = await getAllMeetingsForSummary({ from: `${monthKey}-01`, to: `${monthKey}-${String(lastDay).padStart(2, "0")}` }, { userId: 0, ownOnly: false, sectorId });
  const sector = (await db.select({ code: sectors.code }).from(sectors).where(eq(sectors.id, sectorId)).limit(1))[0];
  const isConcilie = sector?.code === "CONCILIE";
  const byId = new Map<number, any>(usersInSector.map(user => [user.id, { ...user, scheduled: 0, realized: 0, quickMeetings: 0, noShow: 0, cancelled: 0, specialMeetings: 0, closedContracts: 0 }]));
  const daily = new Map<string, Map<number, number>>();
  for (const row of rows) {
    const item = byId.get(row.meeting.sdrId);
    if (!item) continue;
    item.scheduled += 1;
    if (row.meeting.status === "REALIZADA") {
      const isQuick = isCompletedQuickMeeting(row.meeting);
      if (isQuick) item.quickMeetings += 1;
      else item.realized += 1;
      if (isConcilie && row.meeting.closedContract) item.closedContracts += 1;
      if (row.meeting.pgfnDebtOver2m) item.specialMeetings += 1;
      if (!isQuick) {
        const day = String(row.meeting.date).slice(0, 10);
        if (!daily.has(day)) daily.set(day, new Map());
        const dayMap = daily.get(day)!; dayMap.set(item.id, (dayMap.get(item.id) ?? 0) + 1);
      }
    }
    if (row.meeting.status === "NO_SHOW") item.noShow += 1;
    if (row.meeting.status === "CANCELADA") item.cancelled += 1;
  }
  const bonus = includeBonus ? await calculateBonuses(monthKey) : null;
  const bonusById = new Map<number, any>((bonus?.bySdr || []).map((item: any) => [item.id, item] as [number, any]));
  // Ordem oficial: CONCILIE = realizadas > contratos fechados > agendadas > menor no-show.
  // PROJURIS = realizadas normais > relâmpago > PGFN acima de R$ 2M > agendadas > menor no-show.
  // O nome é apenas o último critério técnico para garantir posições sempre únicas quando todos os indicadores forem idênticos.
  const sorted = [...byId.values()].sort(isConcilie
    ? (a, b) => b.realized - a.realized || b.closedContracts - a.closedContracts || b.scheduled - a.scheduled || a.noShow - b.noShow || String(a.name || a.email || "").localeCompare(String(b.name || b.email || ""), "pt-BR")
    : includeBonus
      ? compareProjurisRankingRows
      : (a, b) => b.realized - a.realized || b.scheduled - a.scheduled || a.noShow - b.noShow || String(a.name || a.email || "").localeCompare(String(b.name || b.email || ""), "pt-BR"));
  const leaderCount = sorted[0]?.realized ?? 0;
  const ranked: any[] = [];
  sorted.forEach((item, index) => {
    const position = index + 1;
    const itemBonus = bonusById.get(item.id);
    const denominator = item.realized + item.noShow;
    ranked.push({ ...item, position, rate: denominator ? Math.round((item.realized / denominator) * 100) : null, totalBonus: itemBonus?.totalValue ?? 0, specialBonus: itemBonus?.specialValue ?? 0, distanceToLeader: Math.max(0, leaderCount - item.realized) });
  });
  const evolution = [...daily.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, values]) => ({ date, values: Object.fromEntries(values) }));
  return { monthKey, status: "ABERTA", rows: ranked, totals: { scheduled: rows.length, realized: rows.filter(row => row.meeting.status === "REALIZADA" && !isCompletedQuickMeeting(row.meeting)).length, quickMeetings: rows.filter(row => isCompletedQuickMeeting(row.meeting)).length, noShow: rows.filter(row => row.meeting.status === "NO_SHOW").length, specialMeetings: ranked.reduce((sum, item) => sum + item.specialMeetings, 0), closedContracts: ranked.reduce((sum, item) => sum + item.closedContracts, 0), bonus: ranked.reduce((sum, item) => sum + item.totalBonus, 0) }, evolution, leaders: ranked.slice(0, 3).map(item => item.id) };
}
export async function getSectorRanking(monthKey: string, sectorId: number, includeBonus: boolean) {
  const competency = includeBonus ? await getBonusCompetency(monthKey) : null;
  if (includeBonus && competency?.status === "FECHADA" && competency.rankingSnapshot) return JSON.parse(competency.rankingSnapshot);
  const result = await calculateRankingLive(monthKey, sectorId, includeBonus);
  return { ...result, status: competency?.status ?? "ABERTA" };
}
export async function getProjurisRanking(monthKey: string) {
  const sectorId = await getProjurisSectorId();
  if (!sectorId) return { monthKey, status: "ABERTA", rows: [], totals: {}, evolution: [], leaders: [] };
  return getSectorRanking(monthKey, sectorId, true);
}
export async function getConcilieRanking(monthKey: string) {
  const sectorId = await getConcilieSectorId();
  if (!sectorId) return { monthKey, status: "ABERTA", rows: [], totals: {}, evolution: [], leaders: [] };
  return getSectorRanking(monthKey, sectorId, false);
}
const BONUS_BANDS = [{ min: 1, max: 10, rate: 15 }, { min: 11, max: 20, rate: 20 }, { min: 21, max: 30, rate: 25 }, { min: 31, max: 40, rate: 30 }, { min: 41, max: 50, rate: 35 }, { min: 51, max: Infinity, rate: 40 }];
function bonusBand(count: number) { return BONUS_BANDS.find(band => count >= band.min && count <= band.max) ?? { min: 0, max: 0, rate: 0 }; }
function nextBand(count: number) { return BONUS_BANDS.find(band => band.min > count); }
export async function getBonusCompetency(monthKey: string) {
  const db = await getDb(); const sectorId = await getProjurisSectorId();
  if (!db || !sectorId) return null;
  let row = (await db.select().from(bonusCompetencies).where(eq(bonusCompetencies.monthKey, monthKey)).limit(1))[0];
  if (!row) { await db.insert(bonusCompetencies).values({ monthKey, sectorId, status: "ABERTA" }); row = (await db.select().from(bonusCompetencies).where(eq(bonusCompetencies.monthKey, monthKey)).limit(1))[0]; }
  return row;
}
export async function calculateBonuses(monthKey: string) {
  const sectorId = await getProjurisSectorId(); if (!sectorId) return { monthKey, status: "ABERTA", totals: { total: 0, normalMeetings: 0, specialMeetings: 0, specialValue: 0 }, bySdr: [] };
  const competency = await getBonusCompetency(monthKey);
  if (competency?.status === "FECHADA" && competency.snapshot) return JSON.parse(competency.snapshot);
  const [year, month] = monthKey.split("-").map(Number); const lastDay = new Date(year, month, 0).getDate();
  const rows = await getAllMeetingsForSummary({ from: `${monthKey}-01`, to: `${monthKey}-${String(lastDay).padStart(2, "0")}`, status: "REALIZADA" }, { userId: 0, ownOnly: false, sectorId });
  const bySdr = new Map<number, any>();
  for (const row of rows) { const m = row.meeting; if (m.quickMeeting) continue; const item = bySdr.get(m.sdrId) ?? { id: m.sdrId, name: row.sdrName || "Sem nome", normalMeetings: 0, specialMeetings: 0, specialItems: [] as any[] }; if (m.pgfnDebtOver2m) { item.specialMeetings += 1; item.specialItems.push({ id: m.id, company: m.companyName, cnpj: m.cnpj, sdr: row.sdrName, date: m.date, status: m.status, debtAmount: m.pgfnDebtAmount, value: 50 }); } else item.normalMeetings += 1; bySdr.set(m.sdrId, item); }
  const calculated = [...bySdr.values()].map(item => { const band = bonusBand(item.normalMeetings); const next = nextBand(item.normalMeetings); return { ...item, band: band.min ? `${band.min}–${band.max === Infinity ? "+" : band.max}` : "Sem faixa", rate: band.rate, normalValue: item.normalMeetings * band.rate, specialValue: item.specialMeetings * 50, totalValue: item.normalMeetings * band.rate + item.specialMeetings * 50, nextRate: next?.rate ?? null, missingForNext: next ? Math.max(0, next.min - item.normalMeetings) : 0 }; });
  const totals = { total: calculated.reduce((sum, item) => sum + item.totalValue, 0), normalMeetings: calculated.reduce((sum, item) => sum + item.normalMeetings, 0), specialMeetings: calculated.reduce((sum, item) => sum + item.specialMeetings, 0), specialValue: calculated.reduce((sum, item) => sum + item.specialValue, 0) };
  return { monthKey, status: competency?.status ?? "ABERTA", closedAt: competency?.closedAt ?? null, totals, bySdr: calculated };
}
export async function closeBonusCompetency(monthKey: string) {
  const db = await getDb(); const sectorId = await getProjurisSectorId(); if (!db || !sectorId) throw new Error("Setor PROJURIS não encontrado.");
  const now = new Date(); const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(now); const get = (type: string) => parts.find(p => p.type === type)?.value || "00"; const lastDay = new Date(Number(get("year")), Number(get("month")), 0).getDate();
  if (`${get("year")}-${get("month")}` === monthKey && (Number(get("day")) < lastDay || (Number(get("day")) === lastDay && Number(get("hour")) < 18))) throw new Error("A competência só pode ser fechada após 18:00 do último dia do mês.");
  const result = await calculateBonuses(monthKey); const ranking = await calculateRankingLive(monthKey, sectorId, true); const competency = await getBonusCompetency(monthKey); if (competency) await db.update(bonusCompetencies).set({ status: "FECHADA", closedAt: now, snapshot: JSON.stringify(result), rankingSnapshot: JSON.stringify({ ...ranking, status: "FECHADA" }) }).where(eq(bonusCompetencies.id, competency.id)); return { ...result, status: "FECHADA", closedAt: now };
}

export const EXTERNAL_CONCILIE_PERMISSIONS = ["sdrs", "meetings", "metrics", "calendar", "companies", "dashboard"] as const;
export async function getConcilieSectorId() {
  const db = await getDb();
  if (!db) return null;
  const row = await db.select({ id: sectors.id }).from(sectors).where(and(eq(sectors.code, "CONCILIE"), eq(sectors.active, true))).limit(1);
  return row[0]?.id ?? null;
}
export async function createExternalIntegration() {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const secret = `vlc_${randomBytes(32).toString("base64url")}`;
  const prefix = secret.slice(0, 12);
  const result = await db.insert(apiIntegrations).values({ name: "FINANCEIRO_VILLELA_CONCILIE", keyPrefix: prefix, secretHash: createHash("sha256").update(secret).digest("hex"), sectorCode: "CONCILIE", permissions: JSON.stringify(EXTERNAL_CONCILIE_PERMISSIONS), active: true });
  return { id: Number(result[0].insertId), secret, prefix };
}
export async function getExternalIntegration() {
  const db = await getDb();
  if (!db) return undefined;
  return (await db.select().from(apiIntegrations).where(eq(apiIntegrations.name, "FINANCEIRO_VILLELA_CONCILIE")).orderBy(desc(apiIntegrations.createdAt)).limit(1))[0];
}
export async function revokeExternalIntegration(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(apiIntegrations).set({ active: false, revokedAt: new Date() }).where(eq(apiIntegrations.id, id));
}
export async function findExternalIntegration(secret: string) {
  const db = await getDb();
  if (!db) return undefined;
  const hash = createHash("sha256").update(secret).digest("hex");
  return (await db.select().from(apiIntegrations).where(and(eq(apiIntegrations.secretHash, hash), eq(apiIntegrations.active, true), eq(apiIntegrations.sectorCode, "CONCILIE"))).limit(1))[0];
}
export async function touchExternalIntegration(id: number) {
  const db = await getDb();
  if (db) await db.update(apiIntegrations).set({ lastUsedAt: new Date() }).where(eq(apiIntegrations.id, id));
}
export async function logExternalRequest(input: { integrationId: number; method: string; endpoint: string; statusCode: number; ip?: string; userAgent?: string }) {
  const db = await getDb();
  if (db) await db.insert(apiIntegrationLogs).values(input);
}
export async function getConcilieSdrs() {
  const db = await getDb(); const sectorId = await getConcilieSectorId();
  if (!db || !sectorId) return [];
  return db.select({ id: users.id, name: users.name, email: users.email, role: users.role, active: users.active, updatedAt: users.updatedAt })
    .from(users).innerJoin(userSectors, eq(userSectors.userId, users.id))
    .where(and(eq(userSectors.sectorId, sectorId), inArray(users.role, ["user", "sdr"]))).orderBy(asc(users.name));
}
export async function getConcilieMeetings(filters: MeetingFilters & { page?: number; pageSize?: number } = {}) {
  const sectorId = await getConcilieSectorId();
  if (!sectorId) return { items: [], total: 0, page: filters.page ?? 1, pageSize: filters.pageSize ?? 100 };
  const sdrs = await getConcilieSdrs(); const allowed = new Set(sdrs.map(item => item.id));
  const result = await getMeetings(filters, { userId: 0, ownOnly: false, sectorId });
  return { ...result, items: result.items.filter(row => allowed.has(row.meeting.sdrId)) };
}
