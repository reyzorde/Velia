import { useEffect, useState } from 'react';
import { Megaphone, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth-context';

type Ann = { id: string; title: string | null; body: string; created_at: string };

export default function AnnouncementModal() {
  const { user, center } = useAuth();
  const [items, setItems] = useState<Ann[]>([]);
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (!user?.id) return;
    void (async () => {
      const { data } = await supabase
        .from('platform_announcements')
        .select('id, title, body, created_at, target_center_id')
        .eq('active', true)
        .order('created_at', { ascending: false })
        .limit(20);
      const list = ((data || []) as any[]).filter(
        (a) => !a.target_center_id || a.target_center_id === center?.id
      ) as Ann[];
      if (!list.length) return;
      const { data: reads } = await supabase
        .from('announcement_reads')
        .select('announcement_id')
        .eq('user_id', user.id)
        .in(
          'announcement_id',
          list.map((x) => x.id)
        );
      const readSet = new Set((reads || []).map((r: any) => r.announcement_id));
      const unread = list.filter((x) => !readSet.has(x.id));
      if (unread.length) {
        setItems(unread);
        setIdx(0);
        setOpen(true);
      }
    })();
  }, [user?.id, center?.id]);

  const dismiss = async () => {
    const cur = items[idx];
    if (cur && user?.id) {
      await supabase.from('announcement_reads').upsert({
        announcement_id: cur.id,
        user_id: user.id,
        read_at: new Date().toISOString(),
      });
    }
    if (idx + 1 < items.length) setIdx(idx + 1);
    else setOpen(false);
  };

  if (!open || !items[idx]) return null;
  const a = items[idx];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(15,23,42,0.55)',
        display: 'grid',
        placeItems: 'center',
        padding: 16,
      }}
    >
      <div
        className="card"
        style={{
          width: 'min(440px, 100%)',
          padding: 20,
          position: 'relative',
          boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
        }}
      >
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => void dismiss()}
          style={{ position: 'absolute', top: 8, right: 8 }}
          aria-label="Yopish"
        >
          <X size={18} />
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <Megaphone size={22} />
          <strong>Sizga yangi xabar bor</strong>
        </div>
        {a.title && <h3 style={{ margin: '0 0 8px' }}>{a.title}</h3>}
        <p style={{ margin: 0, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{a.body}</p>
        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="muted" style={{ fontSize: 12 }}>
            {new Date(a.created_at).toLocaleString()} · {idx + 1}/{items.length}
          </span>
          <button type="button" className="btn btn-primary" onClick={() => void dismiss()}>
            Tushundim
          </button>
        </div>
      </div>
    </div>
  );
}
