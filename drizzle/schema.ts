import {
  boolean,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  mediumtext,
  primaryKey,
  text,
  time,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

export const userRoleEnum = mysqlEnum("role", ["user", "sdr", "gestao", "admin", "master"]);
export const meetingStatusEnum = mysqlEnum("status", ["AGENDADA", "REALIZADA", "NO_SHOW", "CANCELADA"]);
export const clientStatusEnum = mysqlEnum("client_status", ["QUENTE", "MÉDIA", "FRIA"]);
export const sectorCodeEnum = mysqlEnum("code", ["PROJURIS_2", "CONCILIE", "TRAFEGO_PAGO"]);

export const sectors = mysqlTable("sectors", {
  id: int("id").autoincrement().primaryKey(),
  code: sectorCodeEnum.notNull().unique(),
  name: varchar("name", { length: 120 }).notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const users = mysqlTable(
  "users",
  {
    id: int("id").autoincrement().primaryKey(),
    openId: varchar("openId", { length: 64 }).notNull().unique(),
    name: text("name"),
    avatarUrl: mediumtext("avatarUrl"),
    email: varchar("email", { length: 320 }),
    loginMethod: varchar("loginMethod", { length: 64 }),
    role: userRoleEnum.notNull().default("user"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
    lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
  },
  table => ({
    roleIdx: index("users_role_idx").on(table.role),
    activeIdx: index("users_active_idx").on(table.active),
  }),
);

export const userSectors = mysqlTable("user_sectors", {
  userId: int("userId").notNull(),
  sectorId: int("sectorId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({
  pk: primaryKey({ columns: [table.userId, table.sectorId] }),
  userIdx: index("user_sectors_user_idx").on(table.userId),
  sectorIdx: index("user_sectors_sector_idx").on(table.sectorId),
}));

export const googleCalendarConnections = mysqlTable(
  "google_calendar_connections",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    googleAccountEmail: varchar("googleAccountEmail", { length: 320 }).notNull(),
    refreshTokenCiphertext: mediumtext("refreshTokenCiphertext").notNull(),
    accessTokenCiphertext: mediumtext("accessTokenCiphertext"),
    accessTokenExpiresAt: timestamp("accessTokenExpiresAt"),
    scope: varchar("scope", { length: 1000 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({ userIdx: uniqueIndex("google_calendar_connections_user_idx").on(table.userId) }),
);

export const gmailSenderStatusEnum = mysqlEnum("gmail_sender_status", ["CONNECTED", "ERROR"]);
export const gmailSenderConnections = mysqlTable("gmail_sender_connections", {
  id: int("id").autoincrement().primaryKey(),
  googleAccountEmail: varchar("googleAccountEmail", { length: 320 }).notNull(),
  refreshTokenCiphertext: mediumtext("refreshTokenCiphertext").notNull(),
  accessTokenCiphertext: mediumtext("accessTokenCiphertext"),
  accessTokenExpiresAt: timestamp("accessTokenExpiresAt"),
  scope: varchar("scope", { length: 1000 }).notNull(),
  status: gmailSenderStatusEnum.notNull().default("CONNECTED"),
  lastError: text("lastError"),
  connectedAt: timestamp("connectedAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const lawyerConnectionStatusEnum = mysqlEnum("lawyer_connection_status", ["NOT_CONNECTED", "PENDING", "CONNECTED", "ERROR"]);
export const lawyers = mysqlTable(
  "lawyers",
  {
    id: int("id").autoincrement().primaryKey(),
    name: varchar("name", { length: 160 }).notNull(),
    email: varchar("email", { length: 320 }).notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({ emailIdx: uniqueIndex("lawyers_email_idx").on(table.email), activeIdx: index("lawyers_active_idx").on(table.active) }),
);
export const lawyerGoogleCalendarConnections = mysqlTable(
  "lawyer_google_calendar_connections",
  {
    id: int("id").autoincrement().primaryKey(),
    lawyerId: int("lawyerId").notNull(),
    googleAccountEmail: varchar("googleAccountEmail", { length: 320 }).notNull(),
    refreshTokenCiphertext: mediumtext("refreshTokenCiphertext").notNull(),
    accessTokenCiphertext: mediumtext("accessTokenCiphertext"),
    accessTokenExpiresAt: timestamp("accessTokenExpiresAt"),
    scope: varchar("scope", { length: 1000 }).notNull(),
    status: lawyerConnectionStatusEnum.notNull().default("CONNECTED"),
    lastError: text("lastError"),
    lastConnectedAt: timestamp("lastConnectedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({ lawyerIdx: uniqueIndex("lawyer_google_calendar_connections_lawyer_idx").on(table.lawyerId) }),
);
export const lawyerGoogleInviteStatusEnum = mysqlEnum("lawyer_google_invite_status", ["PENDING", "USED", "EXPIRED", "ERROR"]);
export const lawyerGoogleInvites = mysqlTable(
  "lawyer_google_invites",
  {
    id: int("id").autoincrement().primaryKey(),
    lawyerId: int("lawyerId").notNull(),
    tokenHash: varchar("tokenHash", { length: 64 }).notNull(),
    status: lawyerGoogleInviteStatusEnum.notNull().default("PENDING"),
    expiresAt: timestamp("expiresAt").notNull(),
    sentAt: timestamp("sentAt").defaultNow().notNull(),
    usedAt: timestamp("usedAt"),
    lastError: text("lastError"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({ tokenIdx: uniqueIndex("lawyer_google_invites_token_idx").on(table.tokenHash), lawyerIdx: index("lawyer_google_invites_lawyer_idx").on(table.lawyerId), statusIdx: index("lawyer_google_invites_status_idx").on(table.status) }),
);

export const googleCalendarStatusEnum = mysqlEnum("google_calendar_status", ["NOT_CONNECTED", "PENDING", "SYNCED", "ERROR"]);

export const meetings = mysqlTable(
  "meetings",
  {
    id: int("id").autoincrement().primaryKey(),
    companyName: varchar("companyName", { length: 180 }).notNull(),
    cnpj: varchar("cnpj", { length: 24 }).notNull(),
    contactName: varchar("contactName", { length: 140 }).notNull(),
    phone: varchar("phone", { length: 40 }).notNull(),
    contactDate: varchar("contactDate", { length: 10 }),
    email: varchar("email", { length: 320 }),
    sdrId: int("sdrId").notNull(),
    responsibleId: int("responsibleId").notNull(),
    lawyerEmail: varchar("lawyer_email", { length: 320 }),
    lawyerId: int("lawyer_id"),
    calendarOwner: mysqlEnum("calendar_owner", ["SDR", "LAWYER"]).notNull().default("SDR"),
    sectorId: int("sectorId").notNull(),
    service: varchar("service", { length: 160 }).notNull(),
    closer: text("closer"),
    clientStatus: clientStatusEnum,
    date: varchar("date", { length: 10 }).notNull(),
    time: time("time").notNull(),
    status: meetingStatusEnum.notNull().default("AGENDADA"),
    notes: text("notes"),
    result: text("result"),
    nextStep: text("nextStep"),
    contractValue: varchar("contract_value", { length: 60 }),
    proposalValue: varchar("proposal_value", { length: 60 }),
    closedContract: boolean("closed_contract").notNull().default(false),
    closedContractValue: varchar("closed_contract_value", { length: 60 }),
    contractInstallments: int("contract_installments"),
    contractLawyer: varchar("contract_lawyer", { length: 160 }),
    nextContactDate: varchar("nextContactDate", { length: 10 }),
    noShowReason: text("noShowReason"),
    pgfnDebtOver2m: boolean("pgfnDebtOver2m").notNull().default(false),
    pgfnDebtAmount: varchar("pgfnDebtAmount", { length: 40 }),
    wasContacted: boolean("wasContacted"),
    wantsReschedule: boolean("wantsReschedule"),
    cancelReason: text("cancelReason"),
    rescheduledDate: varchar("rescheduledDate", { length: 10 }),
    rescheduledTime: time("rescheduledTime"),
    leadChannel: varchar("lead_channel", { length: 80 }),
    leadChannelOther: varchar("lead_channel_other", { length: 160 }),
    adPlatform: varchar("ad_platform", { length: 80 }),
    campaignName: varchar("campaign_name", { length: 180 }),
    campaignId: varchar("campaign_id", { length: 120 }),
    adSetName: varchar("ad_set_name", { length: 180 }),
    adSetId: varchar("ad_set_id", { length: 120 }),
    adName: varchar("ad_name", { length: 180 }),
    adId: varchar("ad_id", { length: 120 }),
    contactOrigin: varchar("contact_origin", { length: 100 }),
    contactOriginOther: varchar("contact_origin_other", { length: 160 }),
    utmSource: varchar("utm_source", { length: 180 }),
    utmMedium: varchar("utm_medium", { length: 180 }),
    utmCampaign: varchar("utm_campaign", { length: 180 }),
    utmContent: varchar("utm_content", { length: 180 }),
    utmTerm: varchar("utm_term", { length: 180 }),
    leadEntryDate: varchar("lead_entry_date", { length: 10 }),
    qualificationStatus: varchar("qualification_status", { length: 30 }).default("NAO_AVALIADO"),
    disqualificationReason: varchar("disqualification_reason", { length: 120 }),
    disqualificationOther: varchar("disqualification_other", { length: 180 }),
    googleCalendarEventId: varchar("google_calendar_event_id", { length: 512 }),
    googleMeetLink: varchar("google_meet_link", { length: 1000 }),
    googleCalendarStatus: googleCalendarStatusEnum.notNull().default("NOT_CONNECTED"),
    googleSyncError: text("google_sync_error"),
    googleInviteSent: boolean("google_invite_sent").notNull().default(false),
    googleInviteSentAt: timestamp("google_invite_sent_at"),
    googleCalendarSyncedAt: timestamp("google_calendar_synced_at"),
    googleMeetCreatedAt: timestamp("google_meet_created_at"),
    googleCalendarEventUrl: varchar("google_calendar_event_url", { length: 1000 }),
    googleCalendarEventHtmlLink: varchar("google_calendar_event_html_link", { length: 1000 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    dateIdx: index("meetings_date_idx").on(table.date),
    dateStatusIdx: index("meetings_date_status_idx").on(table.date, table.status),
    sdrIdx: index("meetings_sdr_idx").on(table.sdrId),
    responsibleIdx: index("meetings_responsible_idx").on(table.responsibleId),
    sectorIdx: index("meetings_sector_idx").on(table.sectorId),
    statusIdx: index("meetings_status_idx").on(table.status),
    companyIdx: index("meetings_company_idx").on(table.companyName),
  }),
);

export const meetingHistory = mysqlTable(
  "meeting_history",
  {
    id: int("id").autoincrement().primaryKey(),
    meetingId: int("meetingId").notNull(),
    userId: int("userId").notNull(),
    sectorId: int("sectorId").notNull(),
    action: varchar("action", { length: 120 }).notNull(),
    oldValue: text("oldValue"),
    newValue: text("newValue"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    meetingIdx: index("meeting_history_meeting_idx").on(table.meetingId),
    userIdx: index("meeting_history_user_idx").on(table.userId),
    sectorIdx: index("meeting_history_sector_idx").on(table.sectorId),
  }),
);

export const apiIntegrationSectorEnum = mysqlEnum("api_sector_code", ["CONCILIE"]);
export const apiIntegrations = mysqlTable("api_integrations", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  keyPrefix: varchar("keyPrefix", { length: 24 }).notNull().unique(),
  secretHash: varchar("secretHash", { length: 64 }).notNull().unique(),
  sectorCode: apiIntegrationSectorEnum.notNull().default("CONCILIE"),
  permissions: text("permissions").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  revokedAt: timestamp("revokedAt"),
  lastUsedAt: timestamp("lastUsedAt"),
}, table => ({ activeIdx: index("api_integrations_active_idx").on(table.active) }));

export const apiIntegrationLogs = mysqlTable("api_integration_logs", {
  id: int("id").autoincrement().primaryKey(),
  integrationId: int("integrationId").notNull(),
  method: varchar("method", { length: 10 }).notNull(),
  endpoint: varchar("endpoint", { length: 255 }).notNull(),
  statusCode: int("statusCode").notNull(),
  ip: varchar("ip", { length: 80 }),
  userAgent: varchar("userAgent", { length: 500 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({ integrationIdx: index("api_logs_integration_idx").on(table.integrationId), createdIdx: index("api_logs_created_idx").on(table.createdAt) }));

export const bonusCompetencyStatusEnum = mysqlEnum("bonus_competency_status", ["ABERTA", "FECHADA"]);
export const bonusCompetencies = mysqlTable("bonus_competencies", {
  id: int("id").autoincrement().primaryKey(),
  monthKey: varchar("monthKey", { length: 7 }).notNull().unique(),
  sectorId: int("sectorId").notNull(),
  status: bonusCompetencyStatusEnum.notNull().default("ABERTA"),
  closedAt: timestamp("closedAt"),
  snapshot: text("snapshot"),
  rankingSnapshot: text("rankingSnapshot"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({ statusIdx: index("bonus_competencies_status_idx").on(table.status) }));

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Meeting = typeof meetings.$inferSelect;
export type InsertMeeting = typeof meetings.$inferInsert;
export type MeetingHistory = typeof meetingHistory.$inferSelect;
export type InsertMeetingHistory = typeof meetingHistory.$inferInsert;
export type MeetingStatus = NonNullable<Meeting["status"]>;
export type UserRole = NonNullable<User["role"]>;
