export const NOTE_LIFECYCLE_STATUSES = ["待处理", "进行中", "已完成", "已归档"] as const;

export type NoteLifecycleStatus = typeof NOTE_LIFECYCLE_STATUSES[number];

const LEGACY_NOTE_LIFECYCLE_STATUS = new Map<string, NoteLifecycleStatus>([
  ["待处理", "待处理"],
  ["待整理", "待处理"],
  ["待归类", "待处理"],
  ["待沉淀", "待处理"],
  ["种子", "待处理"],
  ["构思中", "待处理"],
  ["待办", "待处理"],
  ["选题", "待处理"],
  ["处理失败", "待处理"],
  ["pending", "待处理"],
  ["queued", "待处理"],
  ["processing", "待处理"],

  ["进行中", "进行中"],
  ["生长中", "进行中"],
  ["等待中", "进行中"],
  ["已暂停", "进行中"],
  ["待复核", "进行中"],
  ["提纲", "进行中"],
  ["草稿", "进行中"],
  ["待发布", "进行中"],

  ["已完成", "已完成"],
  ["已沉淀", "已完成"],
  ["常青", "已完成"],
  ["已发布", "已完成"],
  ["已复盘", "已完成"],

  ["已归档", "已归档"],
  ["跳过", "已归档"],
  ["已取消", "已归档"],
  ["archived", "已归档"],
  ["cancelled", "已归档"],
  ["canceled", "已归档"],
]);

export function normalizeNoteLifecycleStatus(value: unknown): NoteLifecycleStatus | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return LEGACY_NOTE_LIFECYCLE_STATUS.get(trimmed)
    ?? LEGACY_NOTE_LIFECYCLE_STATUS.get(trimmed.toLocaleLowerCase());
}

export function isNoteLifecycleStatus(value: unknown): value is NoteLifecycleStatus {
  return typeof value === "string" && NOTE_LIFECYCLE_STATUSES.includes(value as NoteLifecycleStatus);
}
