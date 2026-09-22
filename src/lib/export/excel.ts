export type ExportColumn<T> = {
  header: string;
  key?: keyof T | string;
  value?: (row: T) => unknown;
  format?: (value: unknown, row: T) => string | number;
  numberFormat?: string;
};

export type ExcelExportOptions<T> = {
  data: readonly T[];
  columns: readonly ExportColumn<T>[];
  filename: string;
  sheetName?: string;
};

const getValue = <T,>(row: T, column: ExportColumn<T>): unknown => {
  if (column.value) return column.value(row);
  if (column.key === undefined) return '';
  return (row as Record<string, unknown>)[String(column.key)];
};

const cleanValue = (value: unknown): string | number | boolean => {
  if (value === null || value === undefined || value === '') return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  return String(value);
};

const withXlsxExtension = (filename: string) =>
  filename.toLowerCase().endsWith('.xlsx') ? filename : `${filename}.xlsx`;

const safeSheetName = (sheetName: string) =>
  sheetName.replace(/[\\/?*:[\]]/g, '').slice(0, 31) || 'Export';

export async function exportToExcel<T>({ data, columns, filename, sheetName = 'Data' }: ExcelExportOptions<T>): Promise<void> {
  if (!data.length) throw new Error('NO_DATA');
  if (!columns.length) throw new Error('NO_COLUMNS');

  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Velia';
  workbook.created = new Date();
  const worksheet = workbook.addWorksheet(safeSheetName(sheetName), {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  worksheet.columns = columns.map((column) => ({
    header: column.header,
    key: String(column.key || column.header),
    width: Math.min(Math.max(column.header.length + 2, 14), 42),
  }));

  data.forEach((row) => {
    const values: Record<string, string | number | boolean> = {};
    columns.forEach((column) => {
      const rawValue = getValue(row, column);
      values[String(column.key || column.header)] = cleanValue(column.format ? column.format(rawValue, row) : rawValue);
    });
    worksheet.addRow(values);
  });

  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: Math.max(data.length + 1, 1), column: columns.length },
  };

  const header = worksheet.getRow(1);
  header.height = 24;
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  });

  columns.forEach((column, index) => {
    const values = data.map((row) => String(cleanValue(column.format ? column.format(getValue(row, column), row) : getValue(row, column))));
    const maxLength = Math.max(column.header.length, ...values.map((value) => value.length));
    worksheet.getColumn(index + 1).width = Math.min(Math.max(maxLength + 2, 12), 42);
    if (column.numberFormat) worksheet.getColumn(index + 1).numFmt = column.numberFormat;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = withXlsxExtension(filename);
  anchor.click();
  URL.revokeObjectURL(url);
}

export function exportDate(): string {
  return new Date().toISOString().slice(0, 10);
}
