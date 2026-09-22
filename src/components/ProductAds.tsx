/** Ichki reklama — tashqi link yo‘q, faqat ma’lumot */

export default function ProductAds() {
  return (
    <div className="product-ads" style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
      <div className="card" style={{ padding: 16, border: '1px solid var(--color-border)' }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-primary)', marginBottom: 6 }}>
          Velia Mock
        </div>
        <strong style={{ display: 'block', marginBottom: 6 }}>Mock test platformasi</strong>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
          Markazingiz o‘quvchilari uchun to‘liq ekranli, nazoratli mock testlar. Natijalar Velia hisobiga bog‘lanadi.
        </p>
      </div>
      <div className="card" style={{ padding: 16, border: '1px solid var(--color-border)' }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-primary)', marginBottom: 6 }}>
          Velia Parents
        </div>
        <strong style={{ display: 'block', marginBottom: 6 }}>Ota-onalar ilovasi</strong>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
          Ota-onalar farzandining davomat, to‘lov va test natijalarini kuzatadi. Xabarlar faqat ilova ichida.
        </p>
      </div>
    </div>
  );
}
