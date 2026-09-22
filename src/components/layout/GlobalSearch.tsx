import { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth-context';

export default function GlobalSearch() {
  const { center } = useAuth(); const navigate = useNavigate(); const [open, setOpen] = useState(false); const [query, setQuery] = useState(''); const [results, setResults] = useState<{id:string; full_name:string; phone:string | null}[]>([]);
  useEffect(() => { const onKey = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setOpen(true); } if (event.key === 'Escape') setOpen(false); }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, []);
  useEffect(() => { if (!center?.id || query.trim().length < 2) { setResults([]); return; } const timer = window.setTimeout(() => { supabase.from('students').select('id, full_name, phone').eq('center_id', center.id).ilike('full_name', `%${query.trim()}%`).limit(8).then(({data}) => setResults(data || [])); }, 180); return () => clearTimeout(timer); }, [center?.id, query]);
  if (!open) return <button className="global-search-trigger" onClick={() => setOpen(true)} aria-label="Qidirish"><Search size={16} /><span>Qidirish</span><kbd>Ctrl K</kbd></button>;
  return <div className="command-overlay" onMouseDown={() => setOpen(false)}><div className="command-dialog" onMouseDown={(event) => event.stopPropagation()}><div className="command-input"><Search size={18}/><input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Velia ichidan qidiring..." /><button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}><X size={16}/></button></div><div className="command-results">{query.trim().length < 2 ? <p>O‘quvchi ismini yozing</p> : results.length ? results.map(student => <button key={student.id} onClick={() => { setOpen(false); navigate(`/students/${student.id}`); }}><strong>{student.full_name}</strong><small>{student.phone || 'Telefon kiritilmagan'}</small></button>) : <p>Natija topilmadi</p>}</div></div></div>;
}
