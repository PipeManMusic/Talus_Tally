export interface CsvPreview {
  headers: string[];
  rows: string[][];
}

interface ParseOptions {
  maxRows?: number;
}

class CsvParseError extends Error {}

export async function parseCsvPreview(file: File, options: ParseOptions = {}): Promise<CsvPreview> {
  const text = await file.text();
  const sanitized = text.replace(/^\uFEFF/, '');
  const rows = parseCsvString(sanitized, options.maxRows ? options.maxRows + 1 : undefined);

  if (rows.length === 0) {
    throw new CsvParseError('CSV file is empty');
  }

  const [headerRow, ...dataRows] = rows;
  const headers = headerRow.map((cell) => cell.trim()).filter((cell) => cell.length > 0);

  if (headers.length === 0) {
    throw new CsvParseError('CSV header row is empty');
  }

  const previewRows = dataRows
    .filter((row) => row.some((cell) => cell.trim().length > 0))
    .map((row) => normalizeRow(row, headerRow.length))
    .slice(0, options.maxRows ?? 5);

  return {
    headers: headerRow.map((cell) => cell.trim()),
    rows: previewRows,
  };
}

function parseCsvString(text: string, maxRows?: number): string[][] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = '';
  };

  const pushRow = () => {
    rows.push(row.map((cell) => cell.trim()));
    row = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        const nextChar = text[i + 1];
        if (nextChar === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === ',') {
      pushField();
      continue;
    }

    if (char === '\n') {
      pushField();
      pushRow();
      if (maxRows && rows.length >= maxRows) {
        break;
      }
      continue;
    }

    if (char === '\r') {
      continue;
    }

    field += char;
  }

  if (inQuotes) {
    throw new CsvParseError('CSV contains an unterminated quoted value');
  }

  if (field.length > 0 || row.length > 0) {
    pushField();
    pushRow();
  }

  if (maxRows && rows.length > maxRows) {
    return rows.slice(0, maxRows);
  }

  return rows;
}

function normalizeRow(row: string[], length: number): string[] {
  if (row.length === length) {
    return row;
  }
  if (row.length < length) {
    return [...row, ...Array.from({ length: length - row.length }, () => '')];
  }
  return row.slice(0, length);
}

export { CsvParseError };
