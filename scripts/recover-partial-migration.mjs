#!/usr/bin/env node
import fs from "node:fs";
import { createHash } from "node:crypto";
import mysql from "mysql2/promise";

if (process.argv[2] !== "--apply" || process.argv.length !== 3) {
  console.error("Uso: node scripts/recover-partial-migration.mjs --apply");
  process.exit(2);
}
const databaseUrl = process.env.DATABASE_URL || process.env.DRIZZLE_DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is unavailable in this environment");
const journal = JSON.parse(fs.readFileSync("drizzle/meta/_journal.json", "utf8"));
const entry = journal.entries.find(item => item.tag === "0019_busy_morg");
if (!entry) throw new Error("Expected migration is missing from Drizzle journal");
const priorEntries = journal.entries.filter(item => item.when < entry.when).sort((a, b) => b.when - a.when);
if (!priorEntries.length) throw new Error("Previous migration entry is missing");
const previous = priorEntries[0];
const migrationSql = fs.readFileSync(`drizzle/${entry.tag}.sql`);
const migrationHash = createHash("sha256").update(migrationSql).digest("hex");
const conn = await mysql.createConnection(databaseUrl);

try {
  const [already] = await conn.execute("SELECT hash FROM __drizzle_migrations WHERE created_at = ?", [entry.when]);
  if (already.length) {
    if (already[0].hash !== migrationHash) throw new Error("Migration timestamp already exists with an unexpected hash");
    console.log(JSON.stringify({ recovered: false, alreadyRecorded: true }));
    process.exit(0);
  }

  const [[latest]] = await conn.query("SELECT MAX(created_at) AS value FROM __drizzle_migrations");
  if (Number(latest.value) !== Number(previous.when)) {
    throw new Error("Database migration history is not at the expected predecessor");
  }
  for (const table of ["users", "meetings", "meeting_history", "user_sectors", "lawyers", "bonus_competencies", "api_integrations", "api_integration_logs"]) {
    const [[row]] = await conn.query(`SELECT COUNT(*) AS n FROM \`${table}\``);
    if (Number(row.n) !== 0) throw new Error(`Table ${table} is not empty; refusing recovery`);
  }

  const expectedColumns = [
    "lead_channel", "lead_channel_other", "ad_platform", "campaign_name", "campaign_id",
    "ad_set_name", "ad_set_id", "ad_name", "ad_id", "contact_origin", "contact_origin_other",
    "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "lead_entry_date",
    "qualification_status", "disqualification_reason", "disqualification_other",
  ];
  const [columns] = await conn.query(
    "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'meetings'",
  );
  const existing = new Set(columns.map(column => column.COLUMN_NAME));
  const missing = expectedColumns.filter(column => !existing.has(column));
  if (missing.some(column => column !== "disqualification_other")) {
    throw new Error(`Unexpected partial schema; missing: ${missing.join(",")}`);
  }
  if (missing.includes("disqualification_other")) {
    await conn.query("ALTER TABLE meetings ADD disqualification_other varchar(180)");
  }

  const [sectorColumns] = await conn.query(
    "SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sectors' AND COLUMN_NAME = 'code'",
  );
  if (!sectorColumns.length || !sectorColumns[0].COLUMN_TYPE.includes("TRAFEGO_PAGO")) {
    throw new Error("Traffic sector enum was not applied by the partial migration");
  }
  const [trafficRows] = await conn.execute("SELECT id FROM sectors WHERE code = ?", ["TRAFEGO_PAGO"]);
  if (trafficRows.length > 1) throw new Error("Duplicate traffic sector rows detected");
  if (trafficRows.length === 0) {
    await conn.execute("INSERT INTO sectors (code, name, active) VALUES (?, ?, ?)", ["TRAFEGO_PAGO", "TRÁFEGO PAGO", 1]);
  }

  await conn.execute(
    "INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)",
    [migrationHash, entry.when],
  );
  const [[finalRow]] = await conn.execute("SELECT COUNT(*) AS n FROM __drizzle_migrations WHERE created_at = ? AND hash = ?", [entry.when, migrationHash]);
  if (Number(finalRow.n) !== 1) throw new Error("Failed to record recovered migration");
  const [[sectorCount]] = await conn.execute("SELECT COUNT(*) AS n FROM sectors WHERE code = ?", ["TRAFEGO_PAGO"]);
  if (Number(sectorCount.n) !== 1) throw new Error("Traffic sector recovery validation failed");
  console.log(JSON.stringify({ recovered: true, migration: entry.tag, addedColumns: missing, sectorSeeded: trafficRows.length === 0 }));
} finally {
  await conn.end();
}
