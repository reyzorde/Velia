import { FormEvent, useState } from 'react';
import { BookOpen, Loader2, Plus, Trash2, Image as ImageIcon } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth-context';
import { getPlan } from '../lib/pricing';
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

export default function MockTests() {
  const { center, user, subscription, role } = useAuth();
  const plan = getPlan(subscription?.plan);
  const [title, setTitle] = useState('');
  const [subjectId, setSubjectId] = useState('physics');
  const [duration, setDuration] = useState(60);
  const [questions, setQuestions] = useState<Q[]>([emptyQ()]);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const canCreate = role === 'owner' || role === 'admin' || role === 'teacher';

  if (!canCreate) {
    return (
      <div className="students-page">
        <div className="empty-state">
          <h3>Ruxsat yo‘q</h3>
          <p>Mock testni faqat o‘qituvchi yoki markaz egasi yaratadi.</p>
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
        if (q.mode === 'choice' && !q.prompt.trim()) throw new Error('Har bir savolda matn bo‘lsin');
        if (q.mode === 'choice' && (!q.optA.trim() || !q.optB.trim())) {
          throw new Error('Kamida A va B variantlarini to‘ldiring');
        }
        if (q.mode === 'image' && !q.image_data) throw new Error('Rasmli savol uchun rasm yuklang');
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

      const { data: sec } = await supabase
        .from('mock_test_sections')
        .insert({ test_id: test.id, code: 'general', title: 'Umumiy', sort_order: 1 })
        .select('id')
        .single();

      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        const { data: row, error: qErr } = await supabase
          .from('mock_questions')
          .insert({
            test_id: test.id,
            section_id: sec?.id,
            question_type: q.mode === 'image' ? 'image_question' : 'single_choice',
            prompt: q.prompt.trim() || (q.mode === 'image' ? 'Rasmli savol' : ''),
            image_url: q.image_data || null,
            points: q.points,
            sort_order: i + 1,
          })
          .select('id')
          .single();
        if (qErr || !row) throw qErr || new Error('Savol saqlanmadi');

        if (q.mode === 'choice') {
          const opts = [
            { label: q.optA, key: 'A' },
            { label: q.optB, key: 'B' },
            { label: q.optC, key: 'C' },
            { label: q.optD, key: 'D' },
          ].filter((o) => o.label.trim());
          for (let j = 0; j < opts.length; j++) {
            await supabase.from('mock_question_options').insert({
              question_id: row.id,
              label: opts[j].label.trim(),
              is_correct: opts[j].key === q.correct,
              sort_order: j + 1,
            });
          }
        }
      }
      setCode(test.public_code || test.id);
      setTitle('');
      setQuestions([emptyQ()]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Xato');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="students-page">
      <div className="students-page__header">
        <div>
          <div className="students-page__eyebrow">Mock test</div>
          <h1>Yangi test yaratish</h1>
          <p className="students-page__count">
            Oyiga lim: {plan.maxMockTestsMonth}. Savol yozing → 4 ta variant (A–D) → to‘g‘ri javobni tanlang.
          </p>
        </div>
      </div>

      {error && <p className="input-error-msg" role="alert">{error}</p>}
      {code && (
        <div className="card" style={{ padding: 14, marginBottom: 12 }}>
          Test yaratildi. Kod: <strong>{code}</strong>
          <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
            O‘quvchilar Velia Mock dasturida shu kod bilan testni topadi.
          </div>
        </div>
      )}

      <form className="card" onSubmit={submit} style={{ display: 'grid', gap: 16, padding: 18 }}>
        <div className="input-group">
          <label className="input-label">1. Test nomi</label>
          <input
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Masalan: Fizika 1-chorak mock"
            required
          />
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
            <input
              className="input"
              type="number"
              min={5}
              max={300}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value) || 60)}
            />
          </div>
        </div>

        <div>
          <strong style={{ display: 'block', marginBottom: 10 }}>4. Savollar</strong>
          {questions.map((q, i) => (
            <div
              key={i}
              className="card"
              style={{ padding: 14, display: 'grid', gap: 10, marginBottom: 12, background: 'var(--color-surface-2, transparent)' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong>Savol {i + 1}</strong>
                {questions.length > 1 && (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setQuestions((arr) => arr.filter((_, j) => j !== i))}
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>

              <div className="input-group">
                <label className="input-label">Tur</label>
                <select
                  className="input"
                  value={q.mode}
                  onChange={(e) => updateQ(i, { mode: e.target.value as 'choice' | 'image' })}
                >
                  <option value="choice">Matn + 4 variant (A B C D)</option>
                  <option value="image">Rasmli savol (kompyuterdan)</option>
                </select>
              </div>

              {q.mode === 'choice' ? (
                <>
                  <div className="input-group">
                    <label className="input-label">Savol matni</label>
                    <textarea
                      className="input"
                      rows={2}
                      value={q.prompt}
                      onChange={(e) => updateQ(i, { prompt: e.target.value })}
                      placeholder="Savolni yozing..."
                      required
                    />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {(['A', 'B', 'C', 'D'] as const).map((key) => (
                      <div className="input-group" key={key}>
                        <label className="input-label">Variant {key}</label>
                        <input
                          className="input"
                          value={q[`opt${key}` as 'optA' | 'optB' | 'optC' | 'optD']}
                          onChange={(e) => updateQ(i, { [`opt${key}`]: e.target.value } as Partial<Q>)}
                          placeholder={key === 'A' || key === 'B' ? 'Majburiy' : 'Ixtiyoriy'}
                          required={key === 'A' || key === 'B'}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="input-group">
                    <label className="input-label">To‘g‘ri javob</label>
                    <select
                      className="input"
                      value={q.correct}
                      onChange={(e) => updateQ(i, { correct: e.target.value as Q['correct'] })}
                    >
                      <option value="A">A</option>
                      <option value="B">B</option>
                      <option value="C">C</option>
                      <option value="D">D</option>
                    </select>
                  </div>
                </>
              ) : (
                <div className="input-group">
                  <label className="input-label">
                    <ImageIcon size={14} /> Rasm yuklash
                  </label>
                  <input
                    className="input"
                    type="file"
                    accept="image/*"
                    onChange={(e) => void onImage(i, e.target.files?.[0] || null)}
                  />
                  {q.image_data && (
                    <img
                      src={q.image_data}
                      alt="Savol"
                      style={{ maxWidth: 220, marginTop: 8, borderRadius: 8 }}
                    />
                  )}
                </div>
              )}

              <div className="input-group">
                <label className="input-label">Ball</label>
                <input
                  className="input"
                  type="number"
                  min={1}
                  value={q.points}
                  onChange={(e) => updateQ(i, { points: Number(e.target.value) || 1 })}
                />
              </div>
            </div>
          ))}

          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setQuestions((q) => [...q, emptyQ()])}
          >
            <Plus size={16} /> Yana savol
          </button>
        </div>

        <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>
          {busy ? <Loader2 className="animate-spin" size={18} /> : <BookOpen size={18} />}
          Testni saqlash
        </button>
      </form>
    </div>
  );
}
