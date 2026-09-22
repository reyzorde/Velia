import { useState } from 'react';
import { Check, Download, FileSpreadsheet, Loader2 } from 'lucide-react';
import { useToast } from '../../lib/toast-context';
import { exportToExcel, type ExportColumn } from '../../lib/export/excel';

type ExportStatus = 'idle' | 'loading' | 'success';

type ExportExcelButtonProps<T> = {
  data: readonly T[];
  columns: readonly ExportColumn<T>[];
  filename: string;
  sheetName?: string;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md';
  className?: string;
};

export default function ExportExcelButton<T>({
  data,
  columns,
  filename,
  sheetName,
  disabled = false,
  variant = 'secondary',
  size = 'sm',
  className = '',
}: ExportExcelButtonProps<T>) {
  const { toast } = useToast();
  const [status, setStatus] = useState<ExportStatus>('idle');

  const handleExport = async () => {
    if (disabled || status === 'loading') return;
    if (!data.length) {
      toast('Eksport qilish uchun ma’lumot yo‘q', 'error');
      return;
    }

    setStatus('loading');
    try {
      await new Promise<void>((resolve, reject) => {
        window.setTimeout(() => {
          void exportToExcel({ data, columns, filename, sheetName }).then(resolve).catch(reject);
        }, 0);
      });
      setStatus('success');
      toast('Excel fayl yuklab olindi');
      window.setTimeout(() => setStatus('idle'), 1800);
    } catch (error) {
      console.error('Excel export failed', error);
      setStatus('idle');
      toast('Excel eksportida xatolik yuz berdi', 'error');
    }
  };

  const label = status === 'loading' ? 'Tayyorlanmoqda...' : status === 'success' ? 'Yuklandi' : 'Excel eksport';
  const Icon = status === 'loading' ? Loader2 : status === 'success' ? Check : FileSpreadsheet;

  return (
    <button
      type="button"
      className={`btn btn-${variant} btn-${size} export-excel-button ${className}`}
      onClick={handleExport}
      disabled={disabled || status === 'loading'}
      aria-label={label}
    >
      <Icon size={size === 'sm' ? 16 : 18} className={status === 'loading' ? 'animate-spin' : ''} />
      <span>{label}</span>
      {status === 'idle' && <Download size={13} className="export-excel-button__download" />}
    </button>
  );
}