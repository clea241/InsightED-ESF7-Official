import React from 'react';

// Renders a <thead> with a clickable, sortable header row followed by a
// per-column filter-input row. Used by every Organized Classes section
// table so filter/sort UI + behavior isn't duplicated per table.
export default function SortableTableHead({ columns, sortConfig, requestSort, filters, setFilter, headerBg = '#F8FAFC', headerColor = '#475569' }) {
  return (
    <thead>
      <tr style={{ background: headerBg }}>
        {columns.map(col => {
          const isSorted = sortConfig.key === col.key;
          return (
            <th
              key={col.key}
              onClick={col.sortable === false ? undefined : () => requestSort(col.key)}
              style={{
                padding: '10px 12px',
                textAlign: col.align || 'left',
                fontWeight: '800',
                color: headerColor,
                fontSize: '11px',
                textTransform: 'uppercase',
                width: col.width,
                cursor: col.sortable === false ? 'default' : 'pointer',
                userSelect: 'none',
                whiteSpace: 'nowrap'
              }}
              title={col.sortable === false ? undefined : `Sort by ${col.label}`}
            >
              {col.label}
              {col.sortable !== false && (
                <span style={{ marginLeft: '4px', opacity: isSorted ? 1 : 0.3 }}>
                  {isSorted ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '↕'}
                </span>
              )}
            </th>
          );
        })}
      </tr>
      <tr style={{ background: headerBg }}>
        {columns.map(col => (
          <td key={col.key} style={{ padding: '4px 8px' }}>
            {col.filterable === false ? null : (
              <input
                type="text"
                value={filters[col.key] || ''}
                onChange={e => setFilter(col.key, e.target.value)}
                placeholder="Filter..."
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '4px 6px',
                  fontSize: '11px',
                  borderRadius: '5px',
                  border: '1px solid #E2E8F0',
                  fontWeight: '600'
                }}
              />
            )}
          </td>
        ))}
      </tr>
    </thead>
  );
}
