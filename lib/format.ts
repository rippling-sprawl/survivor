/**
 * Dates are shown in US Eastern regardless of where someone opens the page: the episode airs at a
 * single wall-clock time and a deadline that shifts by timezone would be a support headache.
 */
const ET = 'America/New_York';

export function formatDeadline(iso: string | null): string | null {
  if (!iso) return null;
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: ET,
    timeZoneName: 'short',
  }).format(new Date(iso));
}

export function formatAirDate(date: string | null): string | null {
  if (!date) return null;
  // Date-only values must not be shifted by the viewer's offset, so parse as UTC noon.
  const parsed = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(parsed);
}

/**
 * The instant a given air date's picks close, as UTC.
 *
 * Naively appending a fixed "-04:00" would be right in summer and an hour wrong from the first
 * Sunday in November — mid-season for a fall Survivor — so the zone's real offset for that
 * particular date is measured rather than assumed.
 */
export function easternEveningUtc(airDate: string, hour = 20): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(airDate)) return null;

  const naive = new Date(`${airDate}T${String(hour).padStart(2, '0')}:00:00Z`);
  if (Number.isNaN(naive.getTime())) return null;

  // How far America/New_York was from UTC at that moment, in milliseconds.
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: ET,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(naive)
      .map((part) => [part.type, part.value]),
  ) as Record<string, string>;

  const asIfUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  );

  return new Date(naive.getTime() + (naive.getTime() - asIfUtc)).toISOString();
}
