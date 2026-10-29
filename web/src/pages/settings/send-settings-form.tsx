import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { SendSettings, SettingsResponse } from "../../archive-api-types";
import { api, errorText } from "../../dashboard-api-client";
import { IconSend } from "../../shared/action-and-media-icons";
import { SelectMenu } from "../../shared/select-menu";
import { BTN_PRIMARY, BTN_SECONDARY, SectionCard } from "../../shared/ui-bits";
import {
  BATCH_FIELDS,
  changedFields,
  SINGLE_FIELDS,
  toDraft,
  validateDraft,
  type SettingField,
  type SettingsDraft,
} from "./send-settings-fields";

const hourOptions = (min: number, max: number) =>
  Array.from({ length: max - min + 1 }, (_, i) => {
    const h = min + i;
    return { value: String(h), label: `${String(h).padStart(2, "0")}:00` };
  });

function FieldRow({
  field,
  value,
  error,
  onChange,
}: {
  field: SettingField;
  value: string;
  error: string | undefined;
  onChange: (v: string) => void;
}) {
  const id = `setting-${field.key}`;
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="block text-[13px] font-medium text-ink">
        {field.label}
      </label>
      <div className="mt-1.5 flex items-center gap-2">
        {field.hour ? (
          <div className="w-32">
            <SelectMenu id={id} value={value} options={hourOptions(field.min, field.max)} onChange={onChange} size="md" />
          </div>
        ) : (
          <input
            id={id}
            type="number"
            inputMode="numeric"
            min={field.min}
            max={field.max}
            step={1}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            aria-invalid={error ? true : undefined}
            className={`gc-input w-32 ${error ? "border-red-400" : ""}`}
          />
        )}
        {field.unit && <span className="text-[13px] text-ink-soft">{field.unit}</span>}
      </div>
      {error ? (
        <p className="mt-1 text-[12px] text-red-600 dark:text-red-400">{error}</p>
      ) : (
        <p className="mt-1 text-[12px] leading-relaxed text-ink-soft">{field.help}</p>
      )}
    </div>
  );
}

export function SendSettingsForm({ saved, onSaved }: { saved: SendSettings; onSaved: (r: SettingsResponse) => void }) {
  const [draft, setDraft] = useState<SettingsDraft>(() => toDraft(saved));
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Server trả bản mới (lưu xong, tải lại) thì form theo bản đó
  useEffect(() => setDraft(toDraft(saved)), [saved]);

  const { errors, values } = useMemo(() => validateDraft(draft), [draft]);
  const patch = values ? changedFields(saved, values) : {};
  const dirty = isDraftDirty(draft, saved);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!values || Object.keys(patch).length === 0) return;
    setBusy(true);
    setServerError(null);
    setNotice(null);
    try {
      onSaved(await api.updateSettings(patch));
      setNotice("Đã lưu. Daemon áp dụng ngay ở lượt gửi kế tiếp.");
    } catch (err) {
      setServerError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const set = (key: SettingField["key"]) => (v: string) => {
    setNotice(null);
    setDraft((d) => ({ ...d, [key]: v }));
  };

  return (
    <form onSubmit={submit}>
      <SectionCard icon={IconSend} title="Cài đặt gửi" subtitle="Nhịp gửi và giới hạn - áp dụng cho mọi đường gửi (dashboard, Claude, dòng lệnh)">
        <h3 className="mb-3 text-[12px] font-semibold uppercase tracking-wider text-ink-soft/70">Tin lẻ</h3>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {SINGLE_FIELDS.map((f) => (
            <FieldRow key={f.key} field={f} value={draft[f.key]} error={errors[f.key]} onChange={set(f.key)} />
          ))}
        </div>

        <h3 className="mb-3 mt-6 text-[12px] font-semibold uppercase tracking-wider text-ink-soft/70">
          Gửi nhiều người (lô) - chỉ tới bạn bè, từng tin một
        </h3>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {BATCH_FIELDS.map((f) => (
            <FieldRow key={f.key} field={f} value={draft[f.key]} error={errors[f.key]} onChange={set(f.key)} />
          ))}
        </div>

        {serverError && <p className="mt-4 break-words text-[13px] text-red-600 dark:text-red-400">{serverError}</p>}
        {notice && <p className="mt-4 text-[13px] text-emerald-600 dark:text-emerald-400">{notice}</p>}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" className={BTN_SECONDARY} disabled={!dirty || busy} onClick={() => setDraft(toDraft(saved))}>
            Hoàn tác
          </button>
          <button type="submit" className={BTN_PRIMARY} disabled={!values || Object.keys(patch).length === 0 || busy}>
            {busy ? "Đang lưu..." : "Lưu cài đặt"}
          </button>
        </div>
      </SectionCard>
    </form>
  );
}

/** Form có khác bản đã lưu không - so trên chuỗi để cả ô đang gõ dở (chưa hợp lệ) cũng tính */
function isDraftDirty(draft: SettingsDraft, saved: SendSettings): boolean {
  const base = toDraft(saved);
  return (Object.keys(base) as (keyof SettingsDraft)[]).some((k) => base[k] !== draft[k].trim());
}
