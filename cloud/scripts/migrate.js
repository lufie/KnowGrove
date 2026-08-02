import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Pool } from "@neondatabase/serverless";

const migrationUrl = new URL("../schema/001_initial.sql", import.meta.url);
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required");
}

const sql = await readFile(fileURLToPath(migrationUrl), "utf8");
const pool = new Pool({ connectionString, max: 1 });

try {
  await pool.query(sql);
  console.log("KnowGrove cloud schema is up to date.");
} finally {
  await pool.end();
}
