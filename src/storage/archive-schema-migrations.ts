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
  // 8: cảm xúc (reaction) trên tin: ghi TỪNG lần bấm như Zalo đếm (bấm tim 3 lần = ❤️ 3).
  // Mỗi lần bấm là một sự kiện có id riêng (khóa khử trùng); icon '' = người đó gỡ hết cảm
  // xúc của mình trên tin, các lần bấm trước mốc đó không tính nữa. Sự kiện nhóm (thêm / rời /
  // đổi tên...) không cần bảng riêng: vào bảng messages với msg_type 'group_event'.
  `
  CREATE TABLE message_reaction_taps (
    msg_id      TEXT NOT NULL,
    action_id   TEXT NOT NULL,
    reactor_id  TEXT NOT NULL,
    icon        TEXT NOT NULL,
    reacted_at  TEXT NOT NULL,
    thread_id   TEXT NOT NULL,
    thread_type TEXT NOT NULL CHECK (thread_type IN ('user', 'group')),
    PRIMARY KEY (msg_id, action_id)
  );
  CREATE INDEX message_reaction_taps_reactor ON message_reaction_taps (msg_id, reactor_id, reacted_at);
  `,
  // 9: đồng bộ lịch sử từ điện thoại - bản sao lưu dùng id "plain" (dạng ngắn của điện thoại),
  // kho dùng id "noise" (id web 19 số). Cặp đã đổi qua API znoise được giữ lại cho lần đồng bộ sau.
  `
  CREATE TABLE mobile_id_map (
    kind     TEXT NOT NULL CHECK (kind IN ('user', 'group')),
    plain_id TEXT NOT NULL,
    noise_id TEXT NOT NULL,
    PRIMARY KEY (kind, plain_id)
  );
  `,
  // 10: tin mình gửi từ điện thoại không có id toàn cục trong bản sao lưu (id tạm `mb_<cliMsgId>`);
  // ghép với bản id thật của cùng tin theo hội thoại + cliMsgId để không nhập trùng
  `
  CREATE INDEX messages_thread_cli ON messages (thread_id, cli_msg_id);
  `,
  // 11: link media hết hạn thì xin Zalo cấp lại (renewlink) rồi tải lại - mỗi file một lần.
  // needs_renew = chờ tới lượt xin; original_url = link gốc trước khi được cấp lại.
  `
  ALTER TABLE attachments ADD COLUMN needs_renew INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE attachments ADD COLUMN renewed_at TEXT;
  ALTER TABLE attachments ADD COLUMN original_url TEXT;
  `,
  // 12: chỉ hỏi hồ sơ người đã nhắn tin / vài thành viên đầu nhóm (không hỏi cả nhóm đông) -
  // cần tra nhanh "người này đã gửi tin chưa" và "người này ở nhóm nào"
  `
  CREATE INDEX messages_sender ON messages (sender_id);
  CREATE INDEX group_members_user ON group_members (user_id, position);
  `,
  // 13: ghim hội thoại lên đầu danh sách trên dashboard (chỉ lưu trong kho, không gọi Zalo)
  `
  ALTER TABLE threads ADD COLUMN pinned_at TEXT;
  `,
  // 14: dashboard tự cập nhật (SSE) dò "file nào vừa tải xong" mỗi giây theo mốc fetched_at
  `
  CREATE INDEX attachments_fetched ON attachments (fetched_at);
  `,
  // 15: tên gợi nhớ mình đặt cho người khác trên Zalo - Zalo PC hiện tên này ở mọi chỗ. Kèm dọn mã số
  // người từng bị lưu làm TÊN (tin hệ thống của nhóm không mang tên người làm): để lượt hỏi hồ sơ điền lại
  `
  ALTER TABLE contacts ADD COLUMN alias TEXT;
  UPDATE contacts SET display_name = NULL WHERE display_name = user_id;
  UPDATE messages SET sender_name = NULL WHERE msg_type = 'group_event' AND sender_name = sender_id;
  `,
  // 16: file "đã tải" mà rỗng (CDN Zalo trả 200 không nội dung khi tải ngay lúc ảnh vừa gửi) - tải lại
  `
  UPDATE attachments SET status = 'pending', attempts = 0, next_attempt_at = NULL, last_error = NULL,
    local_path = NULL, sha256 = NULL, size_bytes = NULL, mime = NULL, fetched_at = NULL
  WHERE status = 'done' AND (size_bytes = 0 OR sha256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  `,
  // 17: "X vừa yêu cầu tham gia nhóm." / "X xác nhận: tham gia <lịch hẹn>." - Zalo gửi như tin webchat của
  // người đó (content.action = msginfo.actionlist) nhưng là thông báo giữa khung chat: chuyển sang loại
  // thông báo nhóm, câu + tên in đậm dựng lúc đọc
  `
  UPDATE messages SET msg_type = 'group_event'
  WHERE msg_type = 'webchat' AND json_valid(raw_json) AND json_extract(raw_json, '$.content.action') = 'msginfo.actionlist';
  `,
  // 18: xin lại link cho file từng chỉ gửi link + tên, Zalo trả "Tham số không hợp lệ" - không phải file đã bị
  // xóa. Nay gửi đủ như Zalo Web (tên, đuôi, checksum, cỡ): bỏ dấu "đã xin" để lúc khởi động xếp xin lại một lần
  `
  UPDATE attachments SET renewed_at = NULL
  WHERE kind = 'file' AND status = 'failed' AND renewed_at IS NOT NULL AND last_error LIKE '%Tham số không hợp lệ%';
  `,
  // 19: file lấy lại từ bản Zalo PC đã tải về máy (Zalo đã xóa khỏi máy chủ): ghi nguồn để biết file nào không
  // phải tải từ máy chủ Zalo. NULL = tải bình thường
  `
  ALTER TABLE attachments ADD COLUMN recovered_from TEXT;
  `,
  // 20: hỏi "7 ngày qua còn xin lại được file cùng loại không" (quy tắc file Zalo đã xóa) phải quét cả bảng
  // đính kèm: đồng bộ toàn bộ lịch sử ra rất nhiều file thì mỗi lần hỏi chậm hẳn. Chỉ mục riêng
  // cho file đã được Zalo cấp link mới (rất ít)
  `
  CREATE INDEX attachments_renew_ok ON attachments (kind, renewed_at) WHERE original_url IS NOT NULL;
  `,
];
