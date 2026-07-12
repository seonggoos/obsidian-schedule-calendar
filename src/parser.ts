export interface ScheduleEvent {
  id: string;
  title: string;
  tag?: string;
  startHour: number;
  startMin: number;
  endHour: number;
  endMin: number;
  startMinutes: number;
  endMinutes: number;
  raw: string;
  /** 원문에서의 0-based 줄 번호. 동일한 일정 줄을 정확히 한 건만 편집하는 데 사용. */
  sourceLine?: number;
}

const SCHEDULE_REGEX = /^- (\d{2}):(\d{2})\s*[-–]\s*(\d{2}):(\d{2})\s+(.+)$/;

const TAG_PALETTE = ['#4A90E2', '#27AE60', '#F39C12', '#8E44AD', '#E74C3C', '#16A085', '#D35400', '#2980B9'];

export function colorForTag(tag: string): string {
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) >>> 0;
  return TAG_PALETTE[h % TAG_PALETTE.length];
}

export function parseSchedules(content: string, sectionName = 'Schedule'): ScheduleEvent[] {
  const events: ScheduleEvent[] = [];
  const lines = content.split(/\r?\n/);
  let inSection = false;

  for (let sourceLine = 0; sourceLine < lines.length; sourceLine++) {
    const line = lines[sourceLine];
    if (line.trim() === `### ${sectionName}`) { inSection = true; continue; }
    if (inSection && line.startsWith('###')) inSection = false;
    if (!inSection) continue;

    const match = line.match(SCHEDULE_REGEX);
    if (!match) continue;

    const [, sh, sm, eh, em, title] = match;
    const start = parseClockTime(`${sh}:${sm}`), end = parseClockTime(`${eh}:${em}`);
    if (!start || !end) continue;
    const [startH, startM] = start, [endH, endM] = end;
    if (endH * 60 + endM <= startH * 60 + startM) continue;
    const trimTitle = title.trim();
    const tagMatch = trimTitle.match(/#([A-Za-z]\w*)/);

    events.push({
      id: `${sh}${sm}${eh}${em}${trimTitle}`,
      title: trimTitle,
      tag: tagMatch ? tagMatch[1].toLowerCase() : undefined,
      startHour: startH, startMin: startM,
      endHour: endH, endMin: endM,
      startMinutes: startH * 60 + startM,
      endMinutes: endH * 60 + endM,
      raw: line,
      sourceLine,
    });
  }

  return events;
}

export function updateEventInContent(content: string, oldRaw: string, event: ScheduleEvent): string {
  const newLine = formatEventLine(event);
  const eol = content.includes('\r\n') ? '\r\n' : '\n';
  const lines = content.split(/\r?\n/);
  const index = resolveSourceLine(lines, oldRaw, event.sourceLine);
  if (index === -1) return content;
  lines[index] = newLine;
  return lines.join(eol);
}

export function deleteEventFromContent(content: string, raw: string, sourceLine?: number): string {
  const eol = content.includes('\r\n') ? '\r\n' : '\n';
  const lines = content.split(/\r?\n/);
  const index = resolveSourceLine(lines, raw, sourceLine);
  if (index === -1) return content;
  lines.splice(index, 1);
  return lines.join(eol);
}

function resolveSourceLine(lines: string[], raw: string, sourceLine?: number): number {
  if (sourceLine !== undefined && lines[sourceLine]?.trimEnd() === raw.trimEnd()) {
    return sourceLine;
  }
  const matches = lines
    .map((line, index) => line.trimEnd() === raw.trimEnd() ? index : -1)
    .filter((index) => index >= 0);
  // 위치 정보가 오래됐더라도 후보가 하나뿐일 때만 안전하게 복구한다.
  return matches.length === 1 ? matches[0] : -1;
}

export function insertEventIntoContent(
  content: string,
  event: ScheduleEvent,
  sectionName = 'Schedule',
): string {
  const newLine = formatEventLine(event);
  const eol = content.includes('\r\n') ? '\r\n' : '\n';
  const lines = content.split(/\r?\n/);
  const sectionIdx = lines.findIndex(l => l.trim() === `### ${sectionName}`);

  if (sectionIdx === -1) {
    const separator = content.length === 0 || content.endsWith(eol) ? '' : eol;
    return content + `${separator}### ${sectionName}${eol}${newLine}${eol}`;
  }

  const scheduleLines: { idx: number; startMinutes: number }[] = [];
  for (let i = sectionIdx + 1; i < lines.length; i++) {
    if (lines[i].startsWith('###')) break;
    const m = lines[i].match(SCHEDULE_REGEX);
    if (m) {
      const startM = parseInt(m[1]) * 60 + parseInt(m[2]);
      scheduleLines.push({ idx: i, startMinutes: startM });
    }
  }

  let insertIdx = sectionIdx + 1;
  for (const sl of scheduleLines) {
    if (sl.startMinutes <= event.startMinutes) {
      insertIdx = sl.idx + 1;
    } else {
      break;
    }
  }

  lines.splice(insertIdx, 0, newLine);
  return lines.join(eol);
}

export function formatEventLine(event: ScheduleEvent): string {
  return `- ${pad(event.startHour)}:${pad(event.startMin)} - ${pad(event.endHour)}:${pad(event.endMin)} ${event.title}`;
}

export function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function parseClockTime(value: string): [number, number] | null {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]), minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return [hour, minute];
}
