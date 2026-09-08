import { useMemo, useState } from 'react';

// Shared sort+filter behavior for the Organized Classes section tables (and any
// future table on the page). `columns` is an array of
// { key, getValue(row) => string|number, getSortValue(row) => comparable (optional) }.
// getSortValue defaults to getValue when omitted (e.g. text/number columns);
// pass it explicitly for columns whose display text isn't the right sort order
// (e.g. a status badge that should sort Below < Within < Above, not alphabetically).
export default function useSortableFilterableTable(rows, columns) {
  const [filters, setFilters] = useState({});
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

  const setFilter = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const requestSort = (key) => {
    setSortConfig(prev => {
      if (prev.key !== key) return { key, direction: 'asc' };
      if (prev.direction === 'asc') return { key, direction: 'desc' };
      return { key: null, direction: 'asc' };
    });
  };

  const processedRows = useMemo(() => {
    const columnsByKey = Object.fromEntries(columns.map(c => [c.key, c]));

    let result = (rows || []).filter(row => {
      return Object.entries(filters).every(([key, query]) => {
        if (!query) return true;
        const col = columnsByKey[key];
        if (!col) return true;
        const value = String(col.getValue(row) ?? '').toLowerCase();
        return value.includes(String(query).toLowerCase());
      });
    });

    if (sortConfig.key) {
      const col = columnsByKey[sortConfig.key];
      if (col) {
        const getSortValue = col.getSortValue || col.getValue;
        result = [...result].sort((a, b) => {
          const va = getSortValue(a);
          const vb = getSortValue(b);
          if (va === vb) return 0;
          const cmp = (typeof va === 'number' && typeof vb === 'number')
            ? va - vb
            : String(va ?? '').localeCompare(String(vb ?? ''));
          return sortConfig.direction === 'asc' ? cmp : -cmp;
        });
      }
    }

    return result;
  }, [rows, columns, filters, sortConfig]);

  return { filters, setFilter, sortConfig, requestSort, processedRows };
}
