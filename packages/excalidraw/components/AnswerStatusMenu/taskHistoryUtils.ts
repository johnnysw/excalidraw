const TIME_PERIOD_LABEL: Record<string, string> = {
  morning: "上午",
  afternoon: "下午",
  evening: "晚上",
};

export function formatTaskDate(value: string | null | undefined): string {
  if (!value) return "";
  const parts = value.split("-");
  const month = parts[1];
  const day = parts[2];
  if (!month || !day) return value;
  return `${parseInt(month, 10)}月${parseInt(day, 10)}日`;
}

export function formatDueAt(
  dueAt: string | null | undefined,
  taskDate: string | null | undefined,
): string {
  if (!dueAt) return "";
  const parsed = new Date(dueAt.replace(" ", "T"));
  if (Number.isNaN(parsed.getTime())) return "";
  const day = `${parsed.getMonth() + 1}月${parsed.getDate()}日`;
  const time = `${String(parsed.getHours()).padStart(2, "0")}:${String(
    parsed.getMinutes(),
  ).padStart(2, "0")}`;
  const dueDay = `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(
    parsed.getDate(),
  ).padStart(2, "0")}`;
  if (taskDate && dueDay === taskDate) return `截止 ${time}`;
  return `截止 ${day} ${time}`;
}

export function timePeriodLabel(period: string | null | undefined): string {
  return (period && TIME_PERIOD_LABEL[period]) || "";
}
