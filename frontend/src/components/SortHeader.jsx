import { useMemo, useState } from 'react';
import { ArrowUp, ArrowDown, ChevronsUpDown } from 'lucide-react';

// Sorts rows by a column. Blank values always sort last. `getters` maps a
// column key to a function returning a number (dates as timestamps) or text.
export function useSort(rows, defaultKey = null, defaultDir = 'desc', getters = {}) {
  const [sort, setSort] = useState({ key: defaultKey, dir: defaultDir });

  const sorted = useMemo(() => {
    if (!sort.key) return rows;
    const get = getters[sort.key] || ((r) => r[sort.key]);
    const factor = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const x = get(a);
      const y = get(b);
      const xBlank = x === null || x === undefined || x === '';
      const yBlank = y === null || y === undefined || y === '';
      if (xBlank && yBlank) return 0;
      if (xBlank) return 1;
      if (yBlank) return -1;
      if (typeof x === 'number' && typeof y === 'number') return (x - y) * factor;
      return String(x).localeCompare(String(y), undefined, { numeric: true, sensitivity: 'base' }) * factor;
    });
  }, [rows, sort]);

  const toggle = (key, firstDir = 'asc') => {
    setSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: firstDir }
    );
  };

  return { sorted, sort, toggle };
}

export function SortTh({ label, k, sort, onSort, firstDir = 'asc', className = '' }) {
  const active = sort.key === k;
  const Icon = !active ? ChevronsUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th className={`${className} cursor-pointer select-none`} onClick={() => onSort(k, firstDir)}>
      <span className="inline-flex items-center gap-1">
        {label}
        <Icon size={12} className={active ? 'text-brand-600' : 'text-slate-300'} />
      </span>
    </th>
  );
}