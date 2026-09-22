import { FormEvent, useCallback, useEffect, useState } from 'react';
import { BookOpen, Loader2, Plus, Trash2, Image as ImageIcon, Pencil } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth-context';
import { loadUsage, canCreateMock, TELEGRAM_PAYMENT_URL } from '../lib/subscription';
import { readFileAsDataUrl } from '../lib/upload';

type Q = {
  prompt: string;
  points: number;
  mode: 'choice' | 'image';
  image_data: string;
  optA: string;
  optB: string;
  optC: string;
  optD: string;
  correct: 'A' | 'B' | 'C' | 'D';
};

const emptyQ = (): Q => ({
  prompt: '',
  points: 1,
  mode: 'choice',
  image_data: '',
  optA: '',
  optB: '',
  optC: '',
  optD: '',
  correct: 'A',
});

function errText(err: unknown): string {
  if (!err) return 'Xato';
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;
  const e = err as { message?: string; details?: string; hint?: string; code?: string };
  return [e.message, e.details, e.hint, e.code].filter(Boolean).join(' — ') || JSON.stringify(err);
}

export default function MockTests() {
  const { center, user, subscription, role } = useAuth();
  const [title, setTitle] = useState('');
  const [subjectId, setSubjectId] = useState('physics');
  const [duration, setDuration] = useState(60);
  const [questions, setQuestions] = useState<Q[]>([emptyQ()]);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [list, setList] = useState<Array<{ id: string; title: string; public_code: string; created_at: string }>>([]);
  const [editId, setEditId] = useState<string | null>(null);

  const canCreate =
    role === 'owner' || role === 'admin' || role === 'administrator' || role === 'teacher';

  const loadList = useCallback(async () => {
    if (!center?.id) return;
    const { data } = await supabase
      .from('mock_tests')
      .select('id, title, public_code, created_at')
      .eq('center_id', center.id)
      .order('created_at', { ascending: false })
      .limit(50);
    setList(data || []);
  }, [center?.id]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const deleteMock = async (id: string) => {
    if (!confirm("Mock o'chirilsinmi? Oy limitti qaytarmaydi.")) return;
    const { error: e } = await supabase.from('mock_tests').delete().eq('id', id);
    if (e) setError(e.message);
    else await loadList();
  };

  const startEdit = (id: string) => {
    setEditId(id);
    const row = list.find((x) => x.id === id);
    if (row) setTitle(row.title);
  };

  const saveEditTitle = async () => {
    if (!editId || !title.trim()) return;
    setBusy(true);
    const { error: e } = await supabase.from('mock_tests').update({ title: title.trim() }).eq('id', editId);
    setBusy(false);
    if (e) setError(e.message);
    else {
      setEditId(null);
      setTitle('');
      await loadList();
    }
  };

  if (!canCreate) {
    return (
      <div className="students-page">
        <div className="empty-state">
          <h3>Ruxsat yoq</h3>
          <p>Mock testni faqat oqituvchi yoki markaz egasi yaratadi.</p>
        </div>
      </div>
    );
  }

  const updateQ = (i: number, patch: Partial<Q>) => {
    setQuestions((arr) => arr.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  };

  const onImage = async (i: number, file: File | null) => {
    if (!file) return;
    try {
      if (file.size > 800_000) {
        setError('Rasm 800KB dan kichik bolsin');
        return;
      }
      const data = await readFileAsDataUrl(file);
      updateQ(i, { image_data: data });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Rasm yuklanmadi');
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!center?.id || !user?.id) return;
    setBusy(true);
    setError('');
    setCode('');
    try {
      const usageSnap = await loadUsage(center.id, subscription);
      const mockCheck = canCreateMock(usageSnap);
      if (!mockCheck.ok) throw new Error(mockCheck.reason || 'Mock limit');

      for (const q of questions) {
        if (q.mode === 'choice' && !q.prompt.trim()) throw new Error('Har bir savolda matn bolsin');
        if (q.mode === 'image' && !q.image_data) throw new Error('Rasmli savol uchun rasm yuklang');
        if (!q.optA.trim() || !q.optB.trim()) throw new Error('Kamida A va B variantlarini toldiring');
      }

      const maxScore = questions.reduce((s, q) => s + Number(q.points || 0), 0);

      const { data: test, error: tErr } = await supabase
        .from('mock_tests')
        .insert({
          center_id: center.id,
          subject_id: subjectId,
          title: title.trim(),
          duration_minutes: duration,
          max_score: maxScore,
          is_published: true,
          created_by: user.id,
        })
        .select('id, public_code')
        .single();
      if (tErr || !test) throw tErr || new Error('Test yaratilmadi');

      let sectionId: string | null = null;
      const { data: sec, error: secErr } = await supabase
        .from('mock_test_sections')
        .insert({ test_id: test.id, code: 'general', title: 'Umumiy', sort_order: 1 })
        .select('id')
        .single();
      if (!secErr && sec?.id) sectionId = sec.id;

      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        const prompt = q.prompt.trim() || (q.mode === 'image' ? 'Rasmli savol' : 'Savol ' + (i + 1));
        const insertPayload: Record<string, unknown> = {
          test_id: test.id,
          question_type: q.mode === 'image' ? 'image_question' : 'single_choice',
          prompt,
          image_path: q.image_data || null,
          points: Number(q.points) || 1,
          sort_order: i + 1,
        };
        if (sectionId) insertPayload.section_id = sectionId;

        const { data: row, error: qErr } = await supabase
          .from('mock_questions')
          .insert(insertPayload)
          .select('id')
          .single();
        if (qErr || !row) throw qErr || new Error('Savol saqlanmadi');

        const opts = [
          { label: q.optA, key: 'A' },
          { label: q.optB, key: 'B' },
          { label: q.optC, key: 'C' },
          { label: q.optD, key: 'D' },
        ].filter((o) => o.label.trim());

        for (let j = 0; j < opts.length; j++) {
          const o = opts[j];
          const { error: oErr } = await supabase.from('mock_question_options').insert({
            question_id: row.id,
            label: o.label.trim(),
            is_correct: q.correct === o.key,
            sort_order: j + 1,
          });
          if (oErr) throw oErr;
        }
      }

      setCode(test.public_code || test.id);
      setTitle('');
      setQuestions([emptyQ()]);
      await loadList();
    } catch (err) {
      setError(errText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="students-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Mock test</h1>
          <p className="page-subtitle">Yaratish, tahrirlash, ochirish. Ochirish oy limitini qaytarmaydi.</p>
        </div>
      </div>

      {list.length > 0 && (
        <div className="card" style={{ marginBottom: 16, padding: 14 }}>
          <strong style={{ display: 'block', marginBottom: 10 }}>Mavjud mock testlar</strong>
          <div style={{ display: 'grid', gap: 8 }}>
            {list.map((row) => (
              <div key={row.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <div>
                  <div>{row.title}</div>
                  <code style={{ fontSize: 12 }}>{row.public_code}</code>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button type="button" className="btn btn-secondary" onClick={() => startEdit(row.id)}>
                    <Pencil size={14} /> Tahrirlash
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => void deleteMock(row.id)}>
                    <Trash2 size={14} /> Ochirish
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {editId && (
        <div className="card" style={{ marginBottom: 12, padding: 12 }}>
          <strong>Nomni tahrirlash</strong>
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} style={{ flex: 1 }} />
            <button type="button" className="btn btn-primary" onClick={() => void saveEditTitle()} disabled={busy}>
              Saqlash
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => { setEditId(null); setTitle(''); }}>
              Bekor
            </button>
          </div>
        </div>
      )}

      {code && (
        <div className="card" style={{ marginBottom: 16 }}>
          <strong>Test kodi: {code}</strong>
          <p style={{ margin: '8px 0 0' }}>
            Oquvchilarga shu kodni bering. Limit:{' '}
            <a href={TELEGRAM_PAYMENT_URL} target="_blank" rel="noreferrer">
              tolov
            </a>
          </p>
        </div>
      )}

      {!editId && (
        <form className="card" onSubmit={submit} style={{ display: 'grid', gap: 16, padding: 20 }}>
          {error && (
            <div className="error" style={{ whiteSpace: 'pre-wrap' }}>
              {error}
            </div>
          )}

          <div className="input-group">
            <label className="input-label">1. Test nomi</label>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Masalan: Fizika mock" required />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="input-group">
              <label className="input-label">2. Fan</label>
              <select className="input" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
                <option value="physics">Fizika</option>
                <option value="math">Matematika</option>
                <option value="ielts">IELTS</option>
                <option value="biology">Biologiya</option>
                <option value="chemistry">Kimyo</option>
                <option value="history">Tarix</option>
                <option value="native_lang">Ona tili</option>
              </select>
            </div>
            <div className="input-group">
              <label className="input-label">3. Vaqt (daqiqa)</label>
              <input className="input" type="number" min={5} max={300} value={duration} onChange={(e) => setDuration(Number(e.target.value) || 60)} />
            </div>
          </div>

          <div>
            <strong style={{ display: 'block', marginBottom: 10 }}>4. Savollar</strong>
            {questions.map((q, i) => (
              <div key={i} className="card" style={{ padding: 14, display: 'grid', gap: 10, marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong>Savol {i + 1}</strong>
                  {questions.length > 1 && (
                    <button type="button" className="btn btn-ghost" onClick={() => setQuestions((arr) => arr.filter((_, j) => j !== i))}>
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>

                <div className="input-group">
                  <label className="input-label">Tur</label>
                  <select className="input" value={q.mode} onChange={(e) => updateQ(i, { mode: e.target.value as 'choice' | 'image' })}>
                    <option value="choice">Matn + 4 variant</option>
                    <option value="image">Rasm + 4 variant</option>
                  </select>
                </div>

                {q.mode === 'choice' ? (
                  <div className="input-group">
                    <label className="input-label">Savol matni</label>
                    <textarea className="input" rows={2} value={q.prompt} onChange={(e) => updateQ(i, { prompt: e.target.value })} required />
                  </div>
                ) : (
                  <div className="input-group">
                    <label className="input-label">
                      <ImageIcon size={14} /> Rasm yuklash
                    </label>
                    <input className="input" type="file" accept="image/*" onChange={(e) => void onImage(i, e.target.files?.[0] || null)} />
                    {q.image_data && <img src={q.image_data} alt="Savol" style={{ maxWidth: 220, marginTop: 8, borderRadius: 8 }} />}
                    <input className="input" style={{ marginTop: 8 }} value={q.prompt} onChange={(e) => updateQ(i, { prompt: e.target.value })} placeholder="Savol matni (ixtiyoriy)" />
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {(['A', 'B', 'C', 'D'] as const).map((key) => (
                    <div className="input-group" key={key}>
                      <label className="input-label">Variant {key}</label>
                      <input
                        className="input"
                        value={key === 'A' ? q.optA : key === 'B' ? q.optB : key === 'C' ? q.optC : q.optD}
                        onChange={(e) =>
                          updateQ(
                            i,
                            key === 'A'
                              ? { optA: e.target.value }
                              : key === 'B'
                                ? { optB: e.target.value }
                                : key === 'C'
                                  ? { optC: e.target.value }
                                  : { optD: e.target.value }
                          )
                        }
                        placeholder={key === 'A' || key === 'B' ? 'Majburiy' : 'Ixtiyoriy'}
                        required={key === 'A' || key === 'B'}
                      />
                    </div>
                  ))}
                </div>

                <div className="input-group">
                  <label className="input-label">Togri javob</label>
                  <select className="input" value={q.correct} onChange={(e) => updateQ(i, { correct: e.target.value as Q['correct'] })}>
                    <option value="A">A</option>
                    <option value="B">B</option>
                    <option value="C">C</option>
                    <option value="D">D</option>
                  </select>
                </div>

                <div className="input-group">
                  <label className="input-label">Ball</label>
                  <input className="input" type="number" min={1} value={q.points} onChange={(e) => updateQ(i, { points: Number(e.target.value) || 1 })} />
                </div>
              </div>
            ))}

            <button type="button" className="btn btn-secondary" onClick={() => setQuestions((q) => [...q, emptyQ()])}>
              <Plus size={16} /> Yana savol
            </button>
          </div>

          <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>
            {busy ? <Loader2 className="animate-spin" size={18} /> : <BookOpen size={18} />}
            Testni saqlash
          </button>
        </form>
      )}
    </div>
  );
}
