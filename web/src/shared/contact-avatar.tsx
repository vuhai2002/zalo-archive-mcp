import { useState } from "react";
import { AVATAR_SIZE_CLASS, InitialAvatar, type AvatarSize } from "./ui-bits";

/**
 * Chỉ nhận link http(s) - avatar do Zalo cấp, nhưng giá trị lạ (vd `javascript:`) không
 * được lọt vào `src`. Link ảnh MẶC ĐỊNH của Zalo (`.../default`, người chưa đặt ảnh)
 * coi như không có ảnh: Zalo hiện chữ viết tắt cho người đó, dashboard cũng vậy.
 */
function safeImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (/\/default\/?$/.test(u.pathname)) return null;
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Avatar tròn: ảnh avatar Zalo nếu có, hỏng hoặc chưa có thì chữ cái đầu.
 * Ảnh tải thẳng từ CDN Zalo, không gửi Referer (không lộ địa chỉ dashboard).
 */
export function ContactAvatar({
  name,
  seed,
  url,
  size = "md",
}: {
  name: string;
  seed: string;
  url: string | null | undefined;
  size?: AvatarSize;
}) {
  // Nhớ link NÀO hỏng (không phải cờ chung) để đổi hội thoại sang avatar khác vẫn thử tải
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const safe = safeImageUrl(url);
  const src = safe === failedUrl ? null : safe;
  if (!src) return <InitialAvatar name={name} seed={seed} size={size} />;
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailedUrl(src)}
      className={`${AVATAR_SIZE_CLASS[size]} shrink-0 rounded-full border border-line bg-tile object-cover`}
    />
  );
}
