import mysql, { type RowDataPacket } from "mysql2/promise";
import { config } from "./config.js";

const url = new URL(config.databaseUrl);
const dbName = url.pathname.replace(/^\//, "") || "pulse";

const AUDIT = `
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '记录创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '记录最近一次更新时间'`;

export const pool = mysql.createPool({
  host: url.hostname,
  port: Number(url.port || 3306),
  user: decodeURIComponent(url.username || "root"),
  password: decodeURIComponent(url.password),
  database: dbName,
  waitForConnections: true,
  connectionLimit: 8,
  namedPlaceholders: false,
});

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS events (
    event_id VARCHAR(128) NOT NULL,
    event_title VARCHAR(512) NOT NULL,
    last_yes_price DOUBLE NULL,
    last_volume DOUBLE NULL,
    last_fired_at VARCHAR(40) NULL,
    last_checked_at VARCHAR(40) NULL,
    ${AUDIT},
    PRIMARY KEY (event_id),
    KEY idx_events_update_time (update_time)
  )`,
  `CREATE TABLE IF NOT EXISTS subscriptions (
    id VARCHAR(64) NOT NULL,
    event_id VARCHAR(128) NOT NULL,
    wallet VARCHAR(64) NOT NULL,
    event_title VARCHAR(512) NOT NULL,
    chat_id VARCHAR(128) NOT NULL DEFAULT '',
    email VARCHAR(256) NOT NULL DEFAULT '',
    paid TINYINT NOT NULL DEFAULT 0,
    paid_usdc DOUBLE NOT NULL DEFAULT 0.01,
    payment_tx VARCHAR(128) NULL,
    active TINYINT NOT NULL DEFAULT 1,
    last_yes_price DOUBLE NULL,
    last_volume DOUBLE NULL,
    last_fired_at VARCHAR(40) NULL,
    ${AUDIT},
    PRIMARY KEY (id),
    UNIQUE KEY uk_wallet_event (wallet, event_id),
    KEY idx_sub_event_active (event_id, active),
    KEY idx_sub_wallet (wallet),
    KEY idx_sub_create_time (create_time)
  )`,
  `CREATE TABLE IF NOT EXISTS alerts (
    id VARCHAR(64) NOT NULL,
    subscription_id VARCHAR(64) NOT NULL,
    event_id VARCHAR(128) NOT NULL,
    event_title VARCHAR(512) NOT NULL,
    reason TEXT NOT NULL,
    snapshot_json JSON NOT NULL,
    telegram_ok TINYINT NOT NULL DEFAULT 0,
    email_ok TINYINT NOT NULL DEFAULT 0,
    payment_tx VARCHAR(128) NULL,
    ${AUDIT},
    PRIMARY KEY (id),
    KEY idx_alert_sub (subscription_id),
    KEY idx_alert_event_created (event_id, create_time),
    KEY idx_alert_create_time (create_time)
  )`,
  `CREATE TABLE IF NOT EXISTS scans (
    id VARCHAR(64) NOT NULL,
    event_id VARCHAR(128) NOT NULL,
    payload_json JSON NOT NULL,
    ${AUDIT},
    PRIMARY KEY (id),
    KEY idx_scan_event (event_id),
    KEY idx_scan_create_time (create_time)
  )`,
];

const TABLES = ["events", "subscriptions", "alerts", "scans"] as const;

let readyPromise: Promise<void> | null = null;

export function dbReady() {
  if (!readyPromise) readyPromise = init();
  return readyPromise;
}

async function init() {
  const admin = await mysql.createConnection({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username || "root"),
    password: decodeURIComponent(url.password),
  });
  await admin.query(
    `CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  );
  await admin.end();
  for (const sql of SCHEMA) {
    await pool.query(sql);
  }
  await ensureAuditColumns();
  await ensureLastCheckedColumn();
  await dropLegacyTimeColumns();
  console.log(`[db] mysql ${url.hostname}:${url.port || 3306}/${dbName}`);
}

async function ensureAuditColumns() {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT TABLE_NAME, COLUMN_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN (?) AND COLUMN_NAME IN ('create_time', 'update_time')
     LIMIT 20`,
    [dbName, [...TABLES]],
  );
  const have = new Set(rows.map((row) => `${row.TABLE_NAME}.${row.COLUMN_NAME}`));
  for (const table of TABLES) {
    if (!have.has(`${table}.create_time`)) {
      await pool.query(
        `ALTER TABLE \`${table}\`
         ADD COLUMN create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '记录创建时间'`,
      );
    }
    if (!have.has(`${table}.update_time`)) {
      await pool.query(
        `ALTER TABLE \`${table}\`
         ADD COLUMN update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '记录最近一次更新时间'`,
      );
    }
  }
}

async function ensureLastCheckedColumn() {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT COLUMN_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'events' AND COLUMN_NAME = 'last_checked_at'
     LIMIT 1`,
    [dbName],
  );
  if (rows.length > 0) return;
  await pool.query(
    `ALTER TABLE events
     ADD COLUMN last_checked_at VARCHAR(40) NULL COMMENT '该事件最近一次检测时间'`,
  );
}

async function dropLegacyTimeColumns() {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT TABLE_NAME, COLUMN_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN (?) AND COLUMN_NAME IN ('created_at', 'updated_at')
     LIMIT 20`,
    [dbName, [...TABLES]],
  );
  for (const row of rows) {
    await pool.query(`ALTER TABLE \`${row.TABLE_NAME}\` DROP COLUMN \`${row.COLUMN_NAME}\``);
  }
}
