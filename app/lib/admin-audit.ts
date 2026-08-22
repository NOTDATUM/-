import { getGameDb } from "../../db/game";

export function adminAuditStatement(action: string, summary: string, details: unknown = null) {
  return getGameDb()
    .prepare("INSERT INTO admin_audit_logs (actor, action, summary, details) VALUES ('staff', ?, ?, ?)")
    .bind(action, summary, details === null ? null : JSON.stringify(details));
}
