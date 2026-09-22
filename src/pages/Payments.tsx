import { useState, useEffect, useCallback, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Search, Loader2, CreditCard } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth-context';
import { useToast } from '../lib/toast-context';
import type { Payment, PaymentMethod, Student, Group } from '../types/database';
import Modal from '../components/ui/Modal';
import ExportExcelButton from '../components/ui/ExportExcelButton';
import { exportDate } from '../lib/export/excel';

const emptyForm = {
  student_id: '',
  group_id: '',
  amount: '',
  payment_date: new Date().toISOString().slice(0, 10),
  payment_method: 'cash' as PaymentMethod,
  note: '',
};

export default function Payments() {
  const { t } = useTranslation();
  const { center } = useAuth();
  const { toast } = useToast();

  const [payments, setPayments] = useState<(Payment & { student_name?: string; group_name?: string })[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    if (!center?.id) return;
    setLoading(true);
    try {
      const [payRes, stuRes, grpRes] = await Promise.all([
        supabase
          .from('payments')
          .select('*, students(full_name), groups(name)')
          .eq('center_id', center.id)
          .order('payment_date', { ascending: false })
          .limit(100),
        supabase
          .from('students')
          .select('*')
          .eq('center_id', center.id)
          .eq('status', 'active')
          .order('full_name'),
        supabase
          .from('groups')
          .select('*')
          .eq('center_id', center.id)
          .eq('status', 'active')
          .order('name'),
      ]);

      setPayments(
        (payRes.data || []).map((p: any) => ({
          ...p,
          student_name: p.students?.full_name,
          group_name: p.groups?.name,
        }))
      );
      setStudents(stuRes.data || []);
      setGroups(grpRes.data || []);
    } catch (err) {
      console.error(err);
      toast(t('common.error'), 'error');
    } finally {
      setLoading(false);
    }
  }, [center?.id, toast, t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filtered = payments.filter(
    (p) =>
      !search ||
      (p.student_name && p.student_name.toLowerCase().includes(search.toLowerCase())) ||
      (p.note && p.note.toLowerCase().includes(search.toLowerCase()))
  );

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.student_id || !form.amount || !center?.id) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('payments').insert({
        center_id: center.id,
        student_id: form.student_id,
        group_id: form.group_id || null,
        amount: Number(form.amount),
        payment_date: form.payment_date,
        payment_method: form.payment_method,
        note: form.note.trim() || null,
      });
      if (error) throw error;
      toast(t('common.success'));
      setModalOpen(false);
      setForm(emptyForm);
      fetchData();
    } catch (err) {
      console.error(err);
      toast(t('common.error'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const formatMoney = (n: number) =>
    new Intl.NumberFormat('uz-UZ').format(n) + " so'm";

  const methodLabel = (m: PaymentMethod) => {
    const map: Record<PaymentMethod, string> = {
      cash: t('payments.cash'),
      card: t('payments.card'),
      transfer: t('payments.transfer'),
      other: t('payments.other'),
    };
    return map[m] || m;
  };

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
        <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 700 }}>{t('payments.title')}</h1>
        <div className="page-actions">
          <ExportExcelButton
            data={filtered}
            filename={`velia-payments-${exportDate()}`}
            sheetName="Payments"
            columns={[
              { header: 'O‘quvchi', key: 'student_name' },
              { header: 'Guruh', key: 'group_name' },
              { header: 'Summa (so‘m)', key: 'amount', format: (value) => Number(value) || 0 },
              { header: 'To‘lov sanasi', key: 'payment_date' },
              { header: 'To‘lov usuli', value: (payment) => methodLabel(payment.payment_method) },
              { header: 'Izoh', key: 'note' },
            ]}
          />
          <button className="btn btn-primary" onClick={() => { setForm({ ...emptyForm, payment_date: new Date().toISOString().slice(0, 10) }); setModalOpen(true); }}>
            <Plus size={18} />
            {t('payments.add')}
          </button>
        </div>
      </div>

      <div style={{ marginBottom: 'var(--space-5)' }}>
        <div style={{ position: 'relative', maxWidth: 320 }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
          <input className="input" style={{ paddingLeft: 36 }} placeholder={t('common.search')} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton" style={{ height: 64, borderRadius: 12 }} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <CreditCard size={48} color="var(--color-text-muted)" />
          <h3>{t('payments.empty')}</h3>
          <button className="btn btn-primary" onClick={() => setModalOpen(true)}>
            <Plus size={18} />
            {t('payments.add')}
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map((p) => (
            <div key={p.id} className="card" style={{ padding: '14px 16px', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <div>
                <div style={{ fontWeight: 600 }}>{p.student_name || '—'}</div>
                <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', marginTop: 2 }}>
                  {p.payment_date} · {methodLabel(p.payment_method)}
                  {p.group_name && ` · ${p.group_name}`}
                </div>
                {p.note && (
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: 2 }}>{p.note}</div>
                )}
              </div>
              <div style={{ fontWeight: 700, fontSize: 'var(--text-lg)', color: 'var(--color-success)' }}>
                {formatMoney(Number(p.amount))}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={t('payments.add')}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setModalOpen(false)} disabled={saving}>{t('common.cancel')}</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? <><Loader2 size={16} className="animate-spin" />{t('common.loading')}</> : t('common.save')}
            </button>
          </>
        }
      >
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="input-group">
            <label className="input-label">{t('students.title')} *</label>
            <select className="input" value={form.student_id} onChange={(e) => setForm({ ...form, student_id: e.target.value })} required>
              <option value="">—</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>{s.full_name}</option>
              ))}
            </select>
          </div>
          <div className="input-group">
            <label className="input-label">{t('groups.title')}</label>
            <select className="input" value={form.group_id} onChange={(e) => setForm({ ...form, group_id: e.target.value })}>
              <option value="">—</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>
          <div className="input-group">
            <label className="input-label">{t('payments.amount')} *</label>
            <input className="input" type="number" min="1" step="1000" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
          </div>
          <div className="input-group">
            <label className="input-label">{t('payments.date')}</label>
            <input className="input" type="date" value={form.payment_date} onChange={(e) => setForm({ ...form, payment_date: e.target.value })} />
          </div>
          <div className="input-group">
            <label className="input-label">{t('payments.method')}</label>
            <select className="input" value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value as PaymentMethod })}>
              <option value="cash">{t('payments.cash')}</option>
              <option value="card">{t('payments.card')}</option>
              <option value="transfer">{t('payments.transfer')}</option>
              <option value="other">{t('payments.other')}</option>
            </select>
          </div>
          <div className="input-group">
            <label className="input-label">{t('payments.note')}</label>
            <input className="input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </div>
        </form>
      </Modal>
    </div>
  );
}
