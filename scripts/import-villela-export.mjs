#!/usr/bin/env node
import fs from "node:fs";
import mysql from "mysql2/promise";

const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== "--apply") {
  console.error("Uso: node scripts/import-villela-export.mjs --apply <payload.json>");
  process.exit(2);
}
const payloadPath = args[1];
const payload = JSON.parse(fs.readFileSync(payloadPath, "utf8"));
const databaseUrl = process.env.DATABASE_URL || process.env.DRIZZLE_DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is unavailable in this environment");

const expected = {
  users: 44, sectors: 3, userSectors: 49, meetings: 547, meetingHistory: 1755,
  lawyers: 1, bonusCompetencies: 3, apiIntegrations: 1, apiIntegrationLogs: 2324,
};
for (const [key, count] of Object.entries(expected)) {
  const actual = key === "sectors" ? payload.sectors?.length : payload[key]?.length;
  if (actual !== count) throw new Error(`Payload count mismatch for ${key}`);
}
if (!Array.isArray(payload.archivedMetadata) || payload.archivedMetadata.length < 45) {
  throw new Error("Payload is missing archived metadata records");
}

const conn = await mysql.createConnection(databaseUrl);
let transactionOpen = false;

async function countRows(table) {
  const allowed = new Set([
    "users", "user_sectors", "meetings", "meeting_history", "lawyers",
    "bonus_competencies", "api_integrations", "api_integration_logs", "legacy_import_metadata",
  ]);
  if (!allowed.has(table)) throw new Error("Unexpected table name");
  const [[row]] = await conn.query(`SELECT COUNT(*) AS n FROM \`${table}\``);
  return Number(row.n);
}

async function insertBatch(table, columns, rows, batchSize = 80) {
  if (!rows.length) return;
  const allowedTables = new Set([
    "users", "user_sectors", "lawyers", "api_integrations", "meetings",
    "meeting_history", "bonus_competencies", "api_integration_logs", "legacy_import_metadata",
  ]);
  if (!allowedTables.has(table)) throw new Error("Unexpected insert table");
  for (let offset = 0; offset < rows.length; offset += batchSize) {
    const chunk = rows.slice(offset, offset + batchSize);
    const names = columns.map(column => `\`${column}\``).join(",");
    const one = `(${columns.map(() => "?").join(",")})`;
    const values = chunk.map(() => one).join(",");
    const parameters = chunk.flatMap(row => columns.map(column => {
      const value = row[column];
      if (value === undefined) return null;
      if (value && typeof value === "object" && !(value instanceof Date) && !Buffer.isBuffer(value)) return JSON.stringify(value);
      return value;
    }));
    await conn.query(`INSERT INTO \`${table}\` (${names}) VALUES ${values}`, parameters);
  }
}

try {
  await conn.beginTransaction();
  transactionOpen = true;

  const [[marker]] = await conn.query(
    "SELECT COUNT(*) AS n FROM legacy_import_metadata WHERE sourceType = ? AND sourceId = ?",
    ["export_manifest", 1],
  );
  if (Number(marker.n) !== 0) throw new Error("This export has already been imported; refusing a duplicate import");

  for (const table of [
    "users", "user_sectors", "meetings", "meeting_history", "lawyers",
    "bonus_competencies", "api_integrations", "api_integration_logs", "legacy_import_metadata",
  ]) {
    const count = await countRows(table);
    if (count !== 0) throw new Error(`Target table ${table} is not empty; refusing to overwrite existing data`);
  }

  const [existingSectors] = await conn.query("SELECT id, code FROM sectors ORDER BY code");
  const sourceSectorCodes = payload.sectors.map(sector => sector.code).sort();
  const targetSectorCodes = existingSectors.map(sector => sector.code).sort();
  if (JSON.stringify(sourceSectorCodes) !== JSON.stringify(targetSectorCodes)) {
    throw new Error("Database sector codes do not match the export; refusing to remap unexpectedly");
  }
  const sectorIdByCode = new Map(existingSectors.map(sector => [sector.code, Number(sector.id)]));

  for (const sector of payload.sectors) {
    await conn.execute(
      "UPDATE sectors SET name = ?, active = ?, createdAt = ? WHERE code = ?",
      [sector.name, sector.active, sector.createdAt, sector.code],
    );
  }

  await insertBatch("users", ["id", "openId", "name", "email", "loginMethod", "role", "active", "createdAt", "updatedAt", "lastSignedIn"], payload.users);
  const userSectors = payload.userSectors.map(link => ({
    userId: link.userId,
    sectorId: sectorIdByCode.get(link.sectorCode),
    createdAt: link.createdAt,
  }));
  if (userSectors.some(link => !link.sectorId)) throw new Error("A user-sector link has an unmapped sector");
  await insertBatch("user_sectors", ["userId", "sectorId", "createdAt"], userSectors);

  await insertBatch("lawyers", ["id", "name", "email", "active", "createdAt", "updatedAt"], payload.lawyers);
  const integrationRows = payload.apiIntegrations.map(({ sectorCode, ...entry }) => ({ ...entry, api_sector_code: sectorCode }));
  await insertBatch("api_integrations", ["id", "name", "keyPrefix", "secretHash", "api_sector_code", "permissions", "active", "createdAt", "revokedAt", "lastUsedAt"], integrationRows);

  const meetingRows = payload.meetings.map(({ sectorCode, ...meeting }) => ({ ...meeting, sectorId: sectorIdByCode.get(sectorCode) }));
  if (meetingRows.some(meeting => !meeting.sectorId)) throw new Error("A meeting has an unmapped sector");
  const meetingColumns = [
    "id", "companyName", "cnpj", "contactName", "phone", "contactDate", "email", "sdrId", "responsibleId",
    "lawyer_email", "lawyer_id", "calendar_owner", "sectorId", "service", "closer", "client_status", "date", "time",
    "status", "notes", "result", "nextStep", "contract_value", "proposal_value", "closed_contract",
    "closed_contract_value", "contract_installments", "contract_lawyer", "nextContactDate", "noShowReason",
    "pgfnDebtOver2m", "pgfnDebtAmount", "wasContacted", "wantsReschedule", "cancelReason", "rescheduledDate",
    "rescheduledTime", "lead_channel", "lead_channel_other", "ad_platform", "campaign_name", "campaign_id",
    "ad_set_name", "ad_set_id", "ad_name", "ad_id", "contact_origin", "contact_origin_other", "utm_source",
    "utm_medium", "utm_campaign", "utm_content", "utm_term", "lead_entry_date", "qualification_status",
    "disqualification_reason", "disqualification_other", "google_calendar_event_id", "google_meet_link",
    "google_calendar_status", "google_sync_error", "google_invite_sent", "google_invite_sent_at",
    "google_calendar_synced_at", "google_meet_created_at", "google_calendar_event_url",
    "google_calendar_event_html_link", "createdAt", "updatedAt",
  ];
  await insertBatch("meetings", meetingColumns, meetingRows, 50);

  const historyRows = payload.meetingHistory.map(({ sectorCode, ...entry }) => ({
    ...entry,
    sectorId: sectorIdByCode.get(sectorCode),
  }));
  if (historyRows.some(entry => !entry.sectorId)) throw new Error("A history entry has an unmapped sector");
  await insertBatch("meeting_history", ["id", "meetingId", "userId", "sectorId", "action", "oldValue", "newValue", "createdAt"], historyRows);

  const bonusRows = payload.bonusCompetencies.map(({ sectorCode, ...entry }) => ({
    ...entry,
    sectorId: sectorIdByCode.get(sectorCode),
    bonus_competency_status: entry.status,
  }));
  if (bonusRows.some(entry => !entry.sectorId)) throw new Error("A bonus competency has an unmapped sector");
  await insertBatch("bonus_competencies", ["id", "monthKey", "sectorId", "bonus_competency_status", "closedAt", "snapshot", "rankingSnapshot", "createdAt", "updatedAt"], bonusRows);
  await insertBatch("api_integration_logs", ["id", "integrationId", "method", "endpoint", "statusCode", "ip", "userAgent", "createdAt"], payload.apiIntegrationLogs, 200);

  const archivedRows = payload.archivedMetadata.map(record => ({
    sourceType: record.sourceType,
    sourceId: record.sourceId,
    payload: JSON.stringify(record.payload),
  }));
  await insertBatch("legacy_import_metadata", ["sourceType", "sourceId", "payload"], archivedRows);

  const expectedTables = {
    users: expected.users,
    user_sectors: expected.userSectors,
    meetings: expected.meetings,
    meeting_history: expected.meetingHistory,
    lawyers: expected.lawyers,
    bonus_competencies: expected.bonusCompetencies,
    api_integrations: expected.apiIntegrations,
    api_integration_logs: expected.apiIntegrationLogs,
    legacy_import_metadata: archivedRows.length,
  };
  for (const [table, wanted] of Object.entries(expectedTables)) {
    const actual = await countRows(table);
    if (actual !== wanted) throw new Error(`Post-import count mismatch in ${table}`);
  }
  const [[brokenMeetings]] = await conn.query(
    "SELECT COUNT(*) AS n FROM meetings m LEFT JOIN users s ON s.id = m.sdrId LEFT JOIN users r ON r.id = m.responsibleId LEFT JOIN sectors sec ON sec.id = m.sectorId WHERE s.id IS NULL OR r.id IS NULL OR sec.id IS NULL",
  );
  const [[brokenHistory]] = await conn.query(
    "SELECT COUNT(*) AS n FROM meeting_history h LEFT JOIN meetings m ON m.id = h.meetingId LEFT JOIN users u ON u.id = h.userId LEFT JOIN sectors s ON s.id = h.sectorId WHERE m.id IS NULL OR u.id IS NULL OR s.id IS NULL",
  );
  const [[brokenLogs]] = await conn.query(
    "SELECT COUNT(*) AS n FROM api_integration_logs l LEFT JOIN api_integrations i ON i.id = l.integrationId WHERE i.id IS NULL",
  );
  if (Number(brokenMeetings.n) || Number(brokenHistory.n) || Number(brokenLogs.n)) {
    throw new Error("Post-import relationship validation failed");
  }

  await conn.commit();
  transactionOpen = false;
  console.log(JSON.stringify({
    imported: expected,
    archivedMetadata: archivedRows.length,
    historicalApiIntegrationEnabled: false,
    googleTokensRestored: false,
    relationshipErrors: 0,
  }));
} catch (error) {
  if (transactionOpen) {
    try { await conn.rollback(); } catch {}
    transactionOpen = false;
  }
  console.error("Import rolled back:", error instanceof Error ? error.message : "unknown error");
  process.exitCode = 1;
} finally {
  await conn.end();
}
