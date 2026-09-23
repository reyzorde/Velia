import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { UserPlus, Loader2, Trash2, Copy, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth-context';
import { useToast } from '../lib/toast-context';

type MemberRow = {
  id: string;
  role: string;
  user_id: string;
  profiles?: { full_name: string | null; email: string | null } | null;
};

export default function Team() {
  const { t } = useTranslation();
  const { center, role, isOwner } = useAuth();
  const { toast } = useToast();
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [memberRole, setMemberRole] = useState<'teacher' | 'administrator'>('teacher');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!center?.id) return;
    setLoading(true);
    const { data } = await supabase
      .from('center_members')
      .select('id, role, user_id, profiles(full_name, email)')
      .eq('center_id', center.id)
      .order('created_at');
    setMembers((data as unknown as MemberRow[]) || []);
    setLoading(false);
  }, [center?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const canManage = isOwner || role === 'owner' || role === 'administrator';
  if (!canManage) {
    return (
      <div className="students-page">
        <div className="empty-state">
          <h3>Ruxsat yo‘q</h3>
          <p>O‘qituvchi va administratorni faqat markaz egasi qo‘shadi.</p>
        </div>
      </div>
    );
  }

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!center?.id) return;
    setBusy(true);
    setError('');
    try {
      const { data, error: err } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { full_name: fullName.trim() } },
      });
      if (err) throw err;
      const uid = data.user?.id;
      if (!uid) throw new Error('Foydalanuvchi yaratilmadi. Email tasdiqlash o‘chirilganligini tekshiring.');

      await supabase.from('profiles').upsert({
        id: uid,
        full_name: fullName.trim(),
        email: email.trim(),
      });

      const { error: mErr } = await supabase.from('center_members').insert({
        center_id: center.id,
        user_id: uid,
        role: memberRole,
      });
      if (mErr) throw mErr;

      setFullName('');
      setEmail('');
      setPassword('');
      toast(t('common.success'));
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Xato');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string, r: string) => {
    if (r === 'owner') return;
    const { error: err } = await supabase.from('center_members').delete().eq('id', id);
    if (err) {
      toast(err.message, 'error');
      return;
    }
    await load();
  };

  return (
    <div className="students-page">
      <div className="students-page__header">
        <div>
          <div className="students-page__eyebrow">Jamoa</div>
          <h1>O‘qituvchi va administrator</h1>
          <p className="students-page__count">
            Markaz egasi yangi hisob yaratadi. Ular shu email/parol bilan Velia ga kiradi.
          </p>
        </div>
      </div>

      {error && <p className="input-error-msg" role="alert">{error}</p>}

      <form className="card" onSubmit={add} style={{ display: 'grid', gap: 14, padding: 18 }}>
        <div className="input-group">
          <label className="input-label">To‘liq ism</label>
          <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        </div>
        <div className="input-group">
          <label className="input-label">Email</label>
          <input className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="input-group">
          <label className="input-label">Parol (min 6)</label>
          <input className="input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
        </div>
        <div className="input-group">
          <label className="input-label">Rol</label>
          <select className="input" value={memberRole} onChange={(e) => setMemberRole(e.target.value as 'teacher' | 'administrator')}>
            <option value="teacher">O‘qituvchi</option>
            <option value="administrator">Administrator</option>
          </select>
        </div>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? <Loader2 className="animate-spin" size={16} /> : <UserPlus size={16} />}
          Qo‘shish
        </button>
      </form>

      {loading ? (
        <Loader2 className="animate-spin" />
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Ism</th>
                <th>Email</th>
                <th>Rol</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id}>
                  <td>{m.profiles?.full_name || '—'}</td>
                  <td>{m.profiles?.email || '—'}</td>
                  <td>{m.role}</td>
                  <td>
                    {m.role !== 'owner' && (
                      <button type="button" className="btn btn-ghost" onClick={() => void remove(m.id, m.role)}>
                        <Trash2 size={16} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
