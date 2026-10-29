import type { DatabaseSync } from "node:sqlite";

/**
 * Kill switch bền trong DB: bật là dừng MỌI lần gửi tới khi người dùng mở lại
 * (dashboard, CLI). Daemon tự bật khi gặp lỗi gửi đầu tiên. MCP không chạm vào.
 */
export type KillSwitchState = { killed: boolean; reason: string | null; changedAt: string };

export function getKillSwitch(db: DatabaseSync): KillSwitchState {
  const row = db.prepare("SELECT killed, kill_reason, changed_at FROM send_control WHERE id = 1").get() as
    | { killed: number; kill_reason: string | null; changed_at: string }
    | undefined;
  // Không có dòng điều khiển là trạng thái bất thường - coi như đang khóa
  if (!row) return { killed: true, reason: "Thiếu dòng send_control", changedAt: new Date().toISOString() };
  return { killed: row.killed === 1, reason: row.kill_reason, changedAt: row.changed_at };
}

export function setKillSwitch(db: DatabaseSync, killed: boolean, reason: string | null): void {
  db.prepare("UPDATE send_control SET killed = ?, kill_reason = ?, changed_at = ? WHERE id = 1").run(
    killed ? 1 : 0,
    killed ? (reason ?? "không ghi lý do") : null,
    new Date().toISOString(),
  );
}
