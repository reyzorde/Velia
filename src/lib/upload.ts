/** Faylni data URL (base64) ga o‘girish — Supabase Storage shart emas */

const MAX_BYTES = 1_500_000; // ~1.5 MB

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Faqat rasm fayllari (JPG, PNG, WebP)'));
      return;
    }
    if (file.size > MAX_BYTES) {
      reject(new Error('Rasm 1.5 MB dan katta bo‘lmasin'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Fayl o‘qilmadi'));
    reader.readAsDataURL(file);
  });
}
