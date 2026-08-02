import { neonConfig, Pool } from "@neondatabase/serverless";
import ws from "ws";
import { requireEnvironment } from "./config.js";

let pool;

export function getPool() {
  if (!pool) {
    neonConfig.webSocketConstructor = ws;
    pool = new Pool({
      connectionString: requireEnvironment("DATABASE_URL"),
      max: 4,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 5_000,
    });
  }
  return pool;
}

export async function withTransaction(work) {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const result = await work(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
