/**
 * Các bước nâng schema, chạy theo thứ tự, mỗi bước một lần (theo `PRAGMA user_version`).
 * Đã phát hành bước nào thì KHÔNG sửa nữa, chỉ thêm bước mới.
 *
 * Quy ước: mọi cột thời gian là chuỗi ISO UTC có hậu tố Z (`toISOString()`).
 */
export const ARCHIVE_MIGRATIONS: readonly string[] = [
  // 1: lược đồ đầu tiên
  `
  CREATE TABLE meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE threads (
    thread_id       TEXT NOT NULL,
    thread_type     TEXT NOT NULL CHECK (thread_type IN ('user', 'group')),
    name            TEXT,
    is_friend       INTEGER NOT NULL DEFAULT 0,
    last_message_at TEXT,
    updated_at      TEXT NOT NULL,
    PRIMARY KEY (thread_id, thread_type)
  );
  CREATE INDEX threads_last_message ON threads (last_message_at DESC);

  -- msg_id là id toàn cục của Zalo (globalMsgId): khóa khử trùng giữa tin live,
  -- tin xin lại sau khi rớt mạng, và tin dội về sau khi kho tự gửi.
  CREATE TABLE messages (
    id           INTEGER PRIMARY KEY,
    msg_id       TEXT NOT NULL UNIQUE,
    cli_msg_id   TEXT,
    thread_id    TEXT NOT NULL,
    thread_type  TEXT NOT NULL CHECK (thread_type IN ('user', 'group')),
    sender_id    TEXT NOT NULL,
    sender_name  TEXT,
    is_self      INTEGER NOT NULL,
    msg_type     TEXT NOT NULL,
    text         TEXT NOT NULL DEFAULT '',
    quote_msg_id TEXT,
    sent_at      TEXT NOT NULL,
    received_at  TEXT NOT NULL,
    source       TEXT NOT NULL CHECK (source IN ('live', 'old_messages', 'mobile_sync', 'journal_replay')),
    recalled_at  TEXT,
    raw_json     TEXT NOT NULL
  );
  CREATE INDEX messages_thread_time ON messages (thread_id, thread_type, sent_at, id);
  CREATE INDEX messages_sent_at ON messages (sent_at);

  -- Lệnh thu hồi có thể tới TRƯỚC tin gốc (vd tin gốc tới qua lần xin lại sau),
  -- nên giữ riêng rồi áp vào messages ở cả hai chiều.
  CREATE TABLE message_recalls (
    msg_id      TEXT PRIMARY KEY,
    thread_id   TEXT NOT NULL,
    recalled_by TEXT NOT NULL,
    recalled_at TEXT NOT NULL,
    raw_json    TEXT NOT NULL
  );

  -- Chữ đã bỏ dấu + chữ thường, rowid = messages.id
  CREATE VIRTUAL TABLE messages_fts USING fts5 (body, tokenize = 'unicode61 remove_diacritics 2');

  CREATE TABLE attachments (
    id              INTEGER PRIMARY KEY,
    msg_id          TEXT NOT NULL REFERENCES messages (msg_id),
    kind            TEXT NOT NULL CHECK (kind IN ('photo', 'video', 'file', 'voice', 'gif')),
    remote_url      TEXT NOT NULL,
    file_name       TEXT,
    declared_size   INTEGER,
    status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'downloading', 'done', 'failed', 'too_large', 'blocked_host')),
    local_path      TEXT,
    sha256          TEXT,
    size_bytes      INTEGER,
    mime            TEXT,
    attempts        INTEGER NOT NULL DEFAULT 0,
    last_error      TEXT,
    next_attempt_at TEXT,
    created_at      TEXT NOT NULL,
    fetched_at      TEXT,
    UNIQUE (msg_id, remote_url)
  );
  CREATE INDEX attachments_queue ON attachments (status, next_attempt_at);

  CREATE TABLE connection_events (
    id     INTEGER PRIMARY KEY,
    at     TEXT NOT NULL,
    kind   TEXT NOT NULL CHECK (kind IN ('login', 'connected', 'closed', 'error', 'gave_up', 'stopped')),
    code   INTEGER,
    detail TEXT
  );
  CREATE INDEX connection_events_at ON connection_events (at);

  CREATE TABLE outbox (
    id                 INTEGER PRIMARY KEY,
    thread_id          TEXT NOT NULL,
    thread_type        TEXT NOT NULL CHECK (thread_type IN ('user', 'group')),
    text               TEXT NOT NULL,
    batch_id           TEXT,
    not_before         TEXT,
    status             TEXT NOT NULL CHECK (status IN
                       ('draft', 'approved', 'sending', 'sent', 'failed', 'cancelled', 'rejected')),
    created_by         TEXT NOT NULL CHECK (created_by IN ('mcp', 'cli')),
    note               TEXT,
    created_at         TEXT NOT NULL,
    approved_at        TEXT,
    sending_started_at TEXT,
    finished_at        TEXT,
    sent_msg_id        TEXT,
    error              TEXT,
    attempts           INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX outbox_status ON outbox (status, not_before);
  CREATE INDEX outbox_finished ON outbox (status, finished_at);

  -- Người nhận được phép. Thêm/bớt chỉ qua CLI của người dùng, model không chạm được.
  CREATE TABLE send_allowlist (
    thread_id   TEXT NOT NULL,
    thread_type TEXT NOT NULL CHECK (thread_type IN ('user', 'group')),
    added_at    TEXT NOT NULL,
    PRIMARY KEY (thread_id, thread_type)
  );

  -- Kill switch bền: bật là dừng mọi lần gửi tới khi người dùng tắt bằng tay
  CREATE TABLE send_control (
    id          INTEGER PRIMARY KEY CHECK (id = 1),
    killed      INTEGER NOT NULL DEFAULT 0,
    kill_reason TEXT,
    changed_at  TEXT NOT NULL
  );
  `,
  // 2: mốc lần cuối hỏi tên nhóm, để nhóm không hỏi được tên (đã rời, giải tán) không bị hỏi lại mãi
  `
  ALTER TABLE threads ADD COLUMN name_lookup_at TEXT;
  `,
  // 3: người dùng chốt cho Claude gửi trực tiếp + có dashboard (2026-10-28):
  // outbox thêm `mode` (tin lẻ / lô có nhịp), `created_by` thêm 'dashboard'; bỏ allowlist.
  // SQLite không sửa được CHECK nên dựng lại bảng.
  `
  CREATE TABLE outbox_v3 (
    id                 INTEGER PRIMARY KEY,
    thread_id          TEXT NOT NULL,
    thread_type        TEXT NOT NULL CHECK (thread_type IN ('user', 'group')),
    text               TEXT NOT NULL,
    mode               TEXT NOT NULL DEFAULT 'single' CHECK (mode IN ('single', 'batch')),
    batch_id           TEXT,
    not_before         TEXT,
    status             TEXT NOT NULL CHECK (status IN
                       ('draft', 'approved', 'sending', 'sent', 'failed', 'cancelled', 'rejected')),
    created_by         TEXT NOT NULL CHECK (created_by IN ('mcp', 'cli', 'dashboard')),
    note               TEXT,
    created_at         TEXT NOT NULL,
    approved_at        TEXT,
    sending_started_at TEXT,
    finished_at        TEXT,
    sent_msg_id        TEXT,
    error              TEXT,
    attempts           INTEGER NOT NULL DEFAULT 0
  );
  INSERT INTO outbox_v3 (id, thread_id, thread_type, text, mode, batch_id, not_before, status, created_by,
    note, created_at, approved_at, sending_started_at, finished_at, sent_msg_id, error, attempts)
  SELECT id, thread_id, thread_type, text, CASE WHEN batch_id IS NULL THEN 'single' ELSE 'batch' END,
    batch_id, not_before, status, created_by, note, created_at, approved_at, sending_started_at,
    finished_at, sent_msg_id, error, attempts
  FROM outbox;
  DROP TABLE outbox;
  ALTER TABLE outbox_v3 RENAME TO outbox;
  CREATE INDEX outbox_status ON outbox (status, not_before);
  CREATE INDEX outbox_finished ON outbox (status, finished_at);
  CREATE INDEX outbox_attempts ON outbox (mode, sending_started_at);
  DROP TABLE send_allowlist;
  `,
  // 4: dời tin lô (khung giờ, trần ngày) ghi vào cột RIÊNG, không sửa not_before -
  // giờ dự kiến gốc phải giữ nguyên để tính hạn bỏ tin quá muộn
  `
  ALTER TABLE outbox ADD COLUMN deferred_until TEXT;
  `,
  // 5: avatar + danh bạ người (tên, avatar của bạn bè và người lạ đã nhắn), sticker thành
  // đính kèm tải về kho. attachments dựng lại để thêm loại 'sticker' vào CHECK.
  `
  ALTER TABLE threads ADD COLUMN avatar_url TEXT;

  CREATE TABLE contacts (
    user_id      TEXT PRIMARY KEY,
    display_name TEXT,
    avatar_url   TEXT,
    updated_at   TEXT NOT NULL,
    lookup_at    TEXT
  );

  -- Ảnh của từng sticker hỏi từ Zalo một lần rồi dùng lại
  CREATE TABLE sticker_catalog (
    sticker_id INTEGER PRIMARY KEY,
    image_url  TEXT,
    status     TEXT NOT NULL CHECK (status IN ('ok', 'failed')),
    fetched_at TEXT NOT NULL
  );

  CREATE TABLE attachments_v5 (
    id              INTEGER PRIMARY KEY,
    msg_id          TEXT NOT NULL REFERENCES messages (msg_id),
    kind            TEXT NOT NULL CHECK (kind IN ('photo', 'video', 'file', 'voice', 'gif', 'sticker')),
    remote_url      TEXT NOT NULL,
    file_name       TEXT,
    declared_size   INTEGER,
    status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'downloading', 'done', 'failed', 'too_large', 'blocked_host')),
    local_path      TEXT,
    sha256          TEXT,
    size_bytes      INTEGER,
    mime            TEXT,
    attempts        INTEGER NOT NULL DEFAULT 0,
    last_error      TEXT,
    next_attempt_at TEXT,
    created_at      TEXT NOT NULL,
    fetched_at      TEXT,
    UNIQUE (msg_id, remote_url)
  );
  INSERT INTO attachments_v5 SELECT id, msg_id, kind, remote_url, file_name, declared_size, status, local_path,
    sha256, size_bytes, mime, attempts, last_error, next_attempt_at, created_at, fetched_at FROM attachments;
  DROP TABLE attachments;
  ALTER TABLE attachments_v5 RENAME TO attachments;
  CREATE INDEX attachments_queue ON attachments (status, next_attempt_at);
  CREATE INDEX messages_msg_type ON messages (msg_type);
  `,
  // 6: bù cho kho có tin TRƯỚC bước 5: người gửi cũ vào danh bạ để được hỏi avatar,
  // và nhóm đã hỏi tên (trước khi có cột avatar) được hỏi lại ngay thay vì chờ 24 giờ
  `
  INSERT OR IGNORE INTO contacts (user_id, display_name, updated_at)
    SELECT sender_id, MAX(CASE WHEN is_self = 0 THEN sender_name END), MAX(received_at)
    FROM messages GROUP BY sender_id;
  INSERT OR IGNORE INTO contacts (user_id, display_name, updated_at)
    SELECT thread_id, name, updated_at FROM threads WHERE thread_type = 'user' AND last_message_at IS NOT NULL;
  UPDATE threads SET name_lookup_at = NULL WHERE thread_type = 'group' AND avatar_url IS NULL;
  `,
  // 7: thành viên THẬT của nhóm (từ Zalo), để ghép avatar nhóm đúng như Zalo - kể cả
  // người chưa từng nhắn. Nhóm cũ được hỏi lại ngay để lấy danh sách thành viên.
  `
  CREATE TABLE group_members (
    group_id TEXT NOT NULL,
    user_id  TEXT NOT NULL,
    position INTEGER NOT NULL,
    PRIMARY KEY (group_id, user_id)
  );
  ALTER TABLE threads ADD COLUMN member_count INTEGER;
  UPDATE threads SET name_lookup_at = NULL WHERE thread_type = 'group';
  `,
];
