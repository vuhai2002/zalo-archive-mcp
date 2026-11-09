import type { ThreadListItem } from "../archive-api-types";
import { ContactAvatar } from "./contact-avatar";
import { MemberAvatarStack } from "./member-avatar-stack";
import { threadDisplayName } from "./thread-kind-badge";

/** Avatar của một hội thoại như Zalo: nhóm không có ảnh riêng thì ghép avatar thành viên, còn lại ảnh của nhóm / người */
export function ThreadAvatar({ t }: { t: Pick<ThreadListItem, "threadId" | "threadType" | "name" | "avatarUrl" | "memberAvatars" | "memberCount"> }) {
  return t.threadType === "group" && !t.avatarUrl && t.memberAvatars.length > 0 ? (
    <MemberAvatarStack members={t.memberAvatars} memberCount={t.memberCount} seed={t.threadId} />
  ) : (
    <ContactAvatar name={threadDisplayName(t.name)} seed={t.threadId} url={t.avatarUrl} size="lg" />
  );
}
