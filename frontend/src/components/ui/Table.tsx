interface TableColumn<T> {
  key: keyof T;
  header: string;
  render?: (value: T[keyof T], row: T) => React.ReactNode;
  width?: string;
}

interface TableProps<T> {
  data: T[];
  columns: TableColumn<T>[];
  rowKey?: keyof T;
  onRowClick?: (row: T) => void;
}

export function Table<T>({
  data,
  columns,
  rowKey,
  onRowClick,
}: TableProps<T>) {
  return (
    <div className="border border-border rounded-sm overflow-hidden">
      <table className="w-full">
        {/* Header */}
        <thead>
          <tr className="bg-bg-light border-b border-border">
            {columns.map((col) => (
              <th
                key={String(col.key)}
                className={`px-4 py-3 text-left text-sm font-semibold text-fg-primary ${col.width || ''}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>

        {/* Body */}
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-8 text-center text-fg-secondary text-sm"
              >
                No data available
              </td>
            </tr>
          ) : (
            data.map((row, idx) => (
              <tr
                key={String(rowKey ? row[rowKey] : idx)}
                onClick={() => onRowClick?.(row)}
                className={`border-b border-border hover:bg-bg-selection transition-colors ${onRowClick ? 'cursor-pointer' : ''}`}
              >
                {columns.map((col) => (
                  <td
                    key={String(col.key)}
                    className="px-4 py-3 text-sm text-fg-primary"
                  >
                    {col.render
                      ? col.render(row[col.key], row)
                      : String(row[col.key])}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
