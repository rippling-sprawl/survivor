'use client';

import { useState, type CSSProperties } from 'react';
import type { WinnerPickGrid } from '@/lib/winner-picks';

type SortKey = { column: string | null; descending: boolean };

/**
 * Season-winner picks as a grid: one row per participant, one column per castaway they've backed,
 * each cell the points those picks would pay if that castaway wins. Any header sorts by it — names
 * start A→Z, castaways start with the biggest backers on top.
 */
export function WinnerPicksTable({ grid }: { grid: WinnerPickGrid }) {
  // `column: null` is the name column.
  const [sort, setSort] = useState<SortKey>({ column: null, descending: false });

  if (grid.rows.length === 0) {
    return (
      <p className="muted" style={{ margin: 0 }}>
        No season-winner picks have been scored yet.
      </p>
    );
  }

  function sortBy(column: string | null) {
    setSort((current) =>
      current.column === column
        ? { column, descending: !current.descending }
        : { column, descending: column !== null },
    );
  }

  const rows = [...grid.rows].sort((a, b) => {
    const byName = a.displayName.localeCompare(b.displayName);
    if (sort.column === null) return sort.descending ? -byName : byName;
    const diff = (a.points[sort.column] ?? 0) - (b.points[sort.column] ?? 0);
    return (sort.descending ? -diff : diff) || byName;
  });

  // One scale for the whole grid, so a dark cell means the same thing in every column.
  const max = Math.max(...grid.rows.flatMap((row) => Object.values(row.points)));

  const ariaSort = (column: string | null) =>
    sort.column === column ? (sort.descending ? 'descending' : 'ascending') : 'none';
  const arrow = (column: string | null) =>
    sort.column === column ? (sort.descending ? ' ▼' : ' ▲') : '';

  return (
    <div className="table-scroll">
      <table className="table">
        <thead>
          <tr>
            <th className="col-name" aria-sort={ariaSort(null)}>
              <button type="button" className="sort-button" onClick={() => sortBy(null)}>
                Name{arrow(null)}
              </button>
            </th>
            {grid.columns.map((column, i) => (
              <th
                key={column.shortName}
                className={`${i === 0 ? 'divider ' : ''}${column.eliminated ? 'eliminated' : ''}`}
                aria-sort={ariaSort(column.shortName)}
                title={column.eliminated ? `${column.shortName} is out of the game` : undefined}
              >
                <button
                  type="button"
                  className="sort-button"
                  onClick={() => sortBy(column.shortName)}
                >
                  {column.shortName}
                  {arrow(column.shortName)}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.userId}>
              <td className="col-name">{row.displayName}</td>
              {grid.columns.map((column, i) => {
                const points = row.points[column.shortName] ?? 0;
                const heat = max > 0 ? points / max : 0;
                return (
                  <td
                    key={column.shortName}
                    className={`heat ${i === 0 ? 'divider ' : ''}${points === 0 ? 'zero' : ''}${heat > 0.5 ? 'heat--dark' : ''}`}
                    style={{ '--heat': heat } as CSSProperties}
                  >
                    {points}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
