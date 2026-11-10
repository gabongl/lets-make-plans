import { AggregatedDateResult, Meeting, ParticipantResponse } from '@/types';

// Format Date to YYYY-MM-DD
export function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Add minutes to a HH:mm string (e.g. "19:00" + 30 -> "19:30")
export function addMinutesToTime(timeStr: string, minutesToAdd: number): string {
  try {
    const [h, m] = (timeStr || '19:00').split(':').map(Number);
    const validH = isNaN(h) ? 19 : h;
    const validM = isNaN(m) ? 0 : m;
    const totalMinutes = validH * 60 + validM + minutesToAdd;
    const newH = Math.floor((totalMinutes % (24 * 60)) / 60);
    const newM = totalMinutes % 60;
    const hh = String(newH).padStart(2, '0');
    const mm = String(newM).padStart(2, '0');
    return `${hh}:${mm}`;
  } catch {
    return '19:30';
  }
}

// Parse YYYY-MM-DD to Date at local midnight
export function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// Get all YYYY-MM-DD dates in range
export function getAllDatesInRange(startDateStr: string, endDateStr: string): string[] {
  if (!startDateStr || !endDateStr || startDateStr > endDateStr) return [];
  const start = parseDate(startDateStr);
  const end = parseDate(endDateStr);
  const dates: string[] = [];
  const curr = new Date(start);
  while (curr <= end) {
    dates.push(formatDate(curr));
    curr.setDate(curr.getDate() + 1);
  }
  return dates;
}

export interface CalendarDay {
  dateStr: string;
  dayNumber: number;
  isCurrentMonth: boolean;
  isInRange: boolean;
  isCandidate?: boolean; // 주관자가 지정한 유효 투표 후보일 여부
  dayOfWeek: number; // 0 = Sun, 6 = Sat
}

export interface MonthCalendar {
  year: number;
  month: number; // 1-12
  monthLabel: string; // e.g. "2026년 11월"
  days: CalendarDay[];
}

export function generateMonthsInRange(
  startDateStr: string,
  endDateStr: string,
  candidateDates?: string[]
): MonthCalendar[] {
  const start = parseDate(startDateStr);
  const end = parseDate(endDateStr);
  const candidateSet = candidateDates && candidateDates.length > 0 ? new Set(candidateDates) : null;

  const months: MonthCalendar[] = [];
  const current = new Date(start.getFullYear(), start.getMonth(), 1);
  const endLimit = new Date(end.getFullYear(), end.getMonth(), 1);

  while (current <= endLimit) {
    const year = current.getFullYear();
    const month = current.getMonth() + 1;

    // First day of this month
    const firstDay = new Date(year, month - 1, 1);
    const startDayOfWeek = firstDay.getDay(); // 0 is Sunday

    // Total days in this month
    const lastDay = new Date(year, month, 0);
    const totalDays = lastDay.getDate();

    const days: CalendarDay[] = [];

    // Leading empty / prev month days
    const prevMonthLastDay = new Date(year, month - 1, 0).getDate();
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const d = prevMonthLastDay - i;
      const prevDate = new Date(year, month - 2, d);
      const dateStr = formatDate(prevDate);
      const inRange = dateStr >= startDateStr && dateStr <= endDateStr;
      days.push({
        dateStr,
        dayNumber: d,
        isCurrentMonth: false,
        isInRange: inRange,
        isCandidate: inRange && (!candidateSet || candidateSet.has(dateStr)),
        dayOfWeek: prevDate.getDay(),
      });
    }

    // Days of current month
    for (let d = 1; d <= totalDays; d++) {
      const thisDate = new Date(year, month - 1, d);
      const dateStr = formatDate(thisDate);
      const inRange = dateStr >= startDateStr && dateStr <= endDateStr;
      days.push({
        dateStr,
        dayNumber: d,
        isCurrentMonth: true,
        isInRange: inRange,
        isCandidate: inRange && (!candidateSet || candidateSet.has(dateStr)),
        dayOfWeek: thisDate.getDay(),
      });
    }

    // Trailing days to fill the grid (multiple of 7)
    const remaining = (7 - (days.length % 7)) % 7;
    for (let d = 1; d <= remaining; d++) {
      const nextDate = new Date(year, month, d);
      const dateStr = formatDate(nextDate);
      const inRange = dateStr >= startDateStr && dateStr <= endDateStr;
      days.push({
        dateStr,
        dayNumber: d,
        isCurrentMonth: false,
        isInRange: inRange,
        isCandidate: inRange && (!candidateSet || candidateSet.has(dateStr)),
        dayOfWeek: nextDate.getDay(),
      });
    }

    months.push({
      year,
      month,
      monthLabel: `${year}년 ${month}월`,
      days,
    });

    current.setMonth(current.getMonth() + 1);
  }

  return months;
}

export function aggregateMeetingResponses(
  meeting: Meeting,
  responses: ParticipantResponse[]
): Record<string, AggregatedDateResult> {
  const result: Record<string, AggregatedDateResult> = {};

  const start = parseDate(meeting.startDate);
  const end = parseDate(meeting.endDate);
  const curr = new Date(start);
  const candidateSet =
    meeting.candidateDates && meeting.candidateDates.length > 0
      ? new Set(meeting.candidateDates)
      : null;

  while (curr <= end) {
    const dateStr = formatDate(curr);
    if (!candidateSet || candidateSet.has(dateStr)) {
      result[dateStr] = {
        date: dateStr,
        allDayCount: 0,
        conditionalCount: 0,
        totalAvailableCount: 0,
        isFullMatch: false,
        participants: [],
      };
    }
    curr.setDate(curr.getDate() + 1);
  }

  // Iterate over each response and tabulate
  for (const resp of responses) {
    for (const [dateStr, sel] of Object.entries(resp.selections)) {
      if (result[dateStr]) {
        if (sel.type === 'ALL_DAY') {
          result[dateStr].allDayCount += 1;
          result[dateStr].totalAvailableCount += 1;
          result[dateStr].participants.push({
            name: resp.participantName,
            type: 'ALL_DAY',
          });
        } else if (sel.type === 'CONDITIONAL') {
          result[dateStr].conditionalCount += 1;
          result[dateStr].totalAvailableCount += 1;
          result[dateStr].participants.push({
            name: resp.participantName,
            type: 'CONDITIONAL',
            note: sel.note,
          });
        }
      }
    }
  }

  // Determine full match:
  // Either all respondents so far can attend (if responses >= 2) OR matches targetCount
  const totalResponded = responses.length;
  for (const [dateStr, item] of Object.entries(result)) {
    if (totalResponded > 0 && item.totalAvailableCount === totalResponded) {
      item.isFullMatch = true;
    }
  }

  return result;
}

export function getBestMatchDates(
  aggregated: Record<string, AggregatedDateResult>,
  totalResponded: number
): AggregatedDateResult[] {
  if (totalResponded === 0) return [];

  const list = Object.values(aggregated).filter((item) => item.totalAvailableCount > 0);

  // Sort: highest total available first, then highest allDayCount, then earliest date
  list.sort((a, b) => {
    if (b.totalAvailableCount !== a.totalAvailableCount) {
      return b.totalAvailableCount - a.totalAvailableCount;
    }
    if (b.allDayCount !== a.allDayCount) {
      return b.allDayCount - a.allDayCount;
    }
    return a.date.localeCompare(b.date);
  });

  return list;
}

