import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { CATS, CAT_MAP, TRAINING_METHODS, composeProgram } from './composeProgram';

const T = {
  bg: '#0A0A0C', surface: '#111114', panel: '#17171B', border: '#222228',
  text: '#EBEBEF', dim: '#60606A', dimMid: '#404048', accent: '#7C3AED',
};

function fmtSec(s) {
  const m = Math.floor(s / 60), ss = s % 60;
  return m > 0 ? `${m}:${String(ss).padStart(2,'0')}` : `${ss}s`;
}

const GOALS = ['체형교정', '근력강화', '다이어트', '재활', '균형트레이닝', '체력증진'];
const LEVELS = ['초급 (6개월 미만)', '중급 (6개월~2년)', '고급 (2년 이상)'];
const FREQS = ['주 1~2회', '주 3회', '주 4~5회', '매일'];
const EQUIPMENT = ['덤벨', '바벨', '케틀벨', '폼롤러', '밴드', '매트', '벤치', 'TRX', '짐볼', '바디웨이트'];
const BODY_PARTS = ['전신', '상체', '하체', '코어', '어깨', '등', '가슴', '팔', '엉덩이', '고관절', '목/척추'];
const JOINTS = ['어깨', '팔꿈치', '손목', '고관절', '무릎', '발목', '척추'];
const PATTERNS = ['힌지', '스쿼트', '런지', '푸시', '풀', '캐리', '로테이션', '아이소메트릭', '롤링'];
const DURATIONS = [20, 30, 45, 60];
const INTENSITIES = ['저강도', '중강도', '고강도'];
const INTENSITY_RPE = { '저강도': 'RPE 11', '중강도': 'RPE 13-15', '고강도': 'RPE 15-17' };
const FOCUS_OPTIONS = ['전신', '상체', '하체', '코어', '어깨', '등', '가슴'];
const CONDITIONS = ['컨디션 좋음', '보통', '피로 / 회복 필요'];

const css = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
body,#root{font-family:Inter,-apple-system,sans-serif;background:${T.bg};color:${T.text};width:100vw;height:100vh;overflow:hidden}
::-webkit-scrollbar{width:4px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:${T.dimMid};border-radius:2px}
input,textarea,select{font-family:inherit;background:${T.panel};color:${T.text};border:1px solid ${T.border};border-radius:6px;padding:8px 12px;font-size:13px;outline:none}
input:focus,select:focus{border-color:${T.accent}}
button{font-family:inherit;cursor:pointer;border:none;outline:none}
`;

function uid() { return Math.random().toString(36).slice(2, 10); }

// 로컬 영상 파일 경로를 file:// URL 로 변환.
// 저장된 프로그램에 남아있는 옛 http://localhost:3737 URL 도 filePath 로 다시 만든다.
function clipSrc(clip) {
  if (!clip) return '';
  const p = clip.filePath || clip.id;
  if (!p) return clip.url || '';
  const normalized = String(p).replace(/\\/g, '/');
  // 윈도우 드라이브 문자(C:)는 인코딩하면 안 된다
  const encoded = normalized.split('/')
    .map((seg, i) => (i === 0 && /^[A-Za-z]:$/.test(seg) ? seg : encodeURIComponent(seg)))
    .join('/');
  return normalized.startsWith('/') ? `file://${encoded}` : `file:///${encoded}`;
}

function loadLS(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}
function saveLS(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} }
function saveData(key, val) {
  saveLS(key, val);
  window.electronAPI?.saveData?.(key, val)?.catch?.(() => {});
}

function Chip({ label, active, color, onClick, small }) {
  return (
    <button onClick={onClick} style={{
      padding: small ? '3px 8px' : '5px 12px',
      borderRadius: 6, fontSize: small ? 11 : 12, fontWeight: 600,
      background: active ? (color || T.accent) + '22' : T.panel,
      color: active ? (color || T.accent) : T.dim,
      border: `1px solid ${active ? (color || T.accent) + '44' : T.border}`,
      transition: 'all .15s',
    }}>{label}</button>
  );
}

function ChipGroup({ items, selected, onToggle, multi, colorMap, small }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {items.map(item => {
        const val = typeof item === 'string' ? item : item.code || item.value;
        const label = typeof item === 'string' ? item : item.label || item.code;
        const color = colorMap?.[val] || (typeof item === 'object' ? item.color : undefined);
        const active = multi ? selected?.includes(val) : selected === val;
        return <Chip key={val} label={label} active={active} color={color} small={small}
          onClick={() => onToggle(val)} />;
      })}
    </div>
  );
}

function TitleBar() {
  const api = window.electronAPI;
  return (
    <div style={{
      height: 38, background: T.surface, display: 'flex', alignItems: 'center',
      borderBottom: `1px solid ${T.border}`, WebkitAppRegion: 'drag', padding: '0 12px',
      position: 'relative', zIndex: 100,
    }}>
      <span style={{ fontWeight: 700, fontSize: 13, color: T.accent }}>FitTrainer Pro</span>
      <div style={{ marginLeft: 'auto', display: 'flex', gap: 2, WebkitAppRegion: 'no-drag' }}>
        {api && <>
          <button onClick={() => api.minimize()} style={{ width: 36, height: 28, background: 'transparent', color: T.dim, fontSize: 16, borderRadius: 4 }}>-</button>
          <button onClick={() => api.maximize()} style={{ width: 36, height: 28, background: 'transparent', color: T.dim, fontSize: 14, borderRadius: 4 }}>[ ]</button>
          <button onClick={() => api.close()} style={{ width: 36, height: 28, background: 'transparent', color: '#E84040', fontSize: 16, borderRadius: 4 }}>x</button>
        </>}
      </div>
    </div>
  );
}

function TabBar({ tab, setTab }) {
  const tabs = [
    { id: 'library', label: '라이브러리' },
    { id: 'customers', label: '고객' },
    { id: 'session', label: '세션 설정' },
    { id: 'builder', label: '프로그램 빌더' },
    { id: 'player', label: '재생' },
  ];
  return (
    <div style={{
      display: 'flex', background: T.surface, borderBottom: `1px solid ${T.border}`,
      padding: '0 8px',
    }}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => setTab(t.id)} style={{
          padding: '10px 18px', fontSize: 13, fontWeight: tab === t.id ? 600 : 400,
          color: tab === t.id ? T.accent : T.dim,
          background: 'transparent',
          borderBottom: tab === t.id ? `2px solid ${T.accent}` : '2px solid transparent',
          transition: 'all .15s',
        }}>{t.label}</button>
      ))}
    </div>
  );
}

function LibraryTab({ clips, setClips, onAddBlock, analysisDone, setAnalysisDone, clipAttrs, setClipAttrs }) {
  const [filter, setFilter] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [search, setSearch] = useState('');
  const [selectedClip, setSelectedClip] = useState(null);
  const [editing, setEditing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState('');

  const filtered = useMemo(() => {
    let list = clips;
    if (catFilter) list = list.filter(c => c.code === catFilter);
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(c => c.fileName.toLowerCase().includes(s) || c.name.toLowerCase().includes(s));
    }
    return list;
  }, [clips, catFilter, search]);

  async function handleSelectFolder() {
    if (!window.electronAPI) { alert('Electron 환경에서만 사용 가능합니다.'); return; }
    const result = await window.electronAPI.selectFolder();
    if (result) {
      setClips(result.clips);
      saveData('ft_clips', result.clips);
      saveData('ft_folder', result.folder);
    }
  }

  async function handleRescan() {
    if (!window.electronAPI) return;
    const result = await window.electronAPI.rescanFolder();
    if (result) {
      setClips(result.clips);
      saveData('ft_clips', result.clips);
    }
  }

  function getClipWithAttrs(clip) {
    const attrs = clipAttrs[clip.filePath] || clipAttrs[clip.id];
    return attrs ? { ...clip, ...attrs } : clip;
  }

  function updateAttr(clipId, field, value) {
    setClipAttrs(prev => {
      const next = { ...prev, [clipId]: { ...(prev[clipId] || {}), [field]: value } };
      saveData('ft_clip_attrs', next);
      return next;
    });
  }

  function toggleArrayAttr(clipId, field, value) {
    setClipAttrs(prev => {
      const cur = prev[clipId]?.[field] || [];
      const next = cur.includes(value) ? cur.filter(v => v !== value) : [...cur, value];
      const updated = { ...prev, [clipId]: { ...(prev[clipId] || {}), [field]: next } };
      saveData('ft_clip_attrs', updated);
      return updated;
    });
  }

  const sel = selectedClip ? getClipWithAttrs(selectedClip) : null;

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: `1px solid ${T.border}` }}>
        <div style={{ padding: 12, display: 'flex', gap: 8, borderBottom: `1px solid ${T.border}` }}>
          <button onClick={handleSelectFolder} style={{
            padding: '8px 16px', background: T.accent, color: '#fff', borderRadius: 6,
            fontSize: 13, fontWeight: 600,
          }}>폴더 선택</button>
          <button onClick={handleRescan} style={{
            padding: '8px 16px', background: T.panel, color: T.text, borderRadius: 6,
            fontSize: 13, border: `1px solid ${T.border}`,
          }}>재스캔</button>
          <div style={{ marginLeft: 'auto', fontSize: 12, color: T.dim, alignSelf: 'center' }}>
            {clips.length}개 영상
          </div>
        </div>
        <div style={{ padding: '8px 12px', borderBottom: `1px solid ${T.border}` }}>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="검색..." style={{ width: '100%', marginBottom: 8 }} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            <Chip label="전체" active={!catFilter} onClick={() => setCatFilter('')} small />
            {CATS.map(c => (
              <Chip key={c.code} label={c.code} active={catFilter === c.code}
                color={c.color} onClick={() => setCatFilter(catFilter === c.code ? '' : c.code)} small />
            ))}
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
          {filtered.map(clip => {
            const cat = CAT_MAP[clip.code];
            const enriched = getClipWithAttrs(clip);
            return (
              <div key={clip.id} onClick={() => setSelectedClip(clip)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                  borderRadius: 6, cursor: 'pointer', marginBottom: 2,
                  background: selectedClip?.id === clip.id ? T.panel : 'transparent',
                  transition: 'background .1s',
                }}>
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                  background: (cat?.color || T.dimMid) + '22',
                  color: cat?.color || T.dim,
                }}>{clip.code || '?'}</span>
                <span style={{ fontSize: 13, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {clip.name || clip.fileName}
                </span>
                {enriched.level && <span style={{ fontSize: 10, color: T.dim }}>{enriched.level}</span>}
                {clip.part && <span style={{ fontSize: 11, color: T.dim }}>{clip.part}</span>}
                {onAddBlock && (
                  <button onClick={(e) => { e.stopPropagation(); onAddBlock(clip); }} style={{
                    padding: '3px 8px', background: T.accent + '22', color: T.accent,
                    borderRadius: 4, fontSize: 11, fontWeight: 600,
                  }}>+</button>
                )}
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', color: T.dim, fontSize: 13 }}>
              {clips.length === 0 ? '폴더를 선택하여 영상을 불러오세요' : '검색 결과 없음'}
            </div>
          )}
        </div>
      </div>

      {sel && (
        <div style={{ width: 340, overflowY: 'auto', padding: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{sel.name || sel.fileName}</div>
          <div style={{ fontSize: 12, color: T.dim, marginBottom: 16 }}>{sel.fileName}</div>

          {!editing ? (
            <>
              <AttrRow label="카테고리" value={CAT_MAP[sel.code]?.label || sel.code} />
              <AttrRow label="부위" value={sel.part} />
              <AttrRow label="반복 수" value={sel.reps > 0 ? `${sel.reps}회` : '-'} />
              <AttrRow label="난이도" value={sel.level || '-'} />
              <AttrRow label="신체 부위" value={(sel.bodyParts || []).join(', ') || '-'} />
              <AttrRow label="관절" value={(sel.joints || []).join(', ') || '-'} />
              <AttrRow label="부상 위험" value={(sel.injuryRisk || []).join(', ') || '-'} />
              <AttrRow label="패턴" value={sel.pattern || '-'} />
              <AttrRow label="연속 가능" value={sel.chainable ? '예' : '-'} />
              <AttrRow label="참고" value={sel.notes || '-'} />
              <button onClick={() => setEditing(true)} style={{
                marginTop: 12, padding: '8px 16px', background: T.panel, color: T.text,
                borderRadius: 6, fontSize: 13, border: `1px solid ${T.border}`, width: '100%',
              }}>수정</button>
            </>
          ) : (
            <>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11, color: T.dim, display: 'block', marginBottom: 4 }}>난이도</label>
                <ChipGroup items={['초급', '중급', '고급']} selected={sel.level}
                  onToggle={v => updateAttr(sel.id, 'level', v === sel.level ? '' : v)} small />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11, color: T.dim, display: 'block', marginBottom: 4 }}>신체 부위</label>
                <ChipGroup items={BODY_PARTS} selected={sel.bodyParts || []} multi
                  onToggle={v => toggleArrayAttr(sel.id, 'bodyParts', v)} small />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11, color: T.dim, display: 'block', marginBottom: 4 }}>관절</label>
                <ChipGroup items={JOINTS} selected={sel.joints || []} multi
                  onToggle={v => toggleArrayAttr(sel.id, 'joints', v)} small />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11, color: T.dim, display: 'block', marginBottom: 4 }}>부상 위험 부위</label>
                <ChipGroup items={BODY_PARTS} selected={sel.injuryRisk || []} multi
                  onToggle={v => toggleArrayAttr(sel.id, 'injuryRisk', v)} small />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11, color: T.dim, display: 'block', marginBottom: 4 }}>패턴</label>
                <ChipGroup items={PATTERNS} selected={sel.pattern}
                  onToggle={v => updateAttr(sel.id, 'pattern', v === sel.pattern ? '' : v)} small />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11, color: T.dim, display: 'block', marginBottom: 4 }}>연속 가능</label>
                <ChipGroup items={[{value:'true',label:'예'},{value:'false',label:'아니오'}]}
                  selected={String(!!sel.chainable)}
                  onToggle={v => updateAttr(sel.id, 'chainable', v === 'true')} small />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11, color: T.dim, display: 'block', marginBottom: 4 }}>참고사항</label>
                <textarea value={sel.notes || ''} onChange={e => updateAttr(sel.id, 'notes', e.target.value)}
                  rows={3} style={{ width: '100%', resize: 'vertical', background: T.panel, color: T.text, border: `1px solid ${T.border}`, borderRadius: 6, padding: 8, fontSize: 13 }} />
              </div>
              <button onClick={() => setEditing(false)} style={{
                padding: '8px 16px', background: T.accent, color: '#fff',
                borderRadius: 6, fontSize: 13, fontWeight: 600, width: '100%',
              }}>완료</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function AttrRow({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${T.border}` }}>
      <span style={{ fontSize: 12, color: T.dim }}>{label}</span>
      <span style={{ fontSize: 12, textAlign: 'right', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</span>
    </div>
  );
}

const GOAL_SESSION = {
  '재활':         { intensity: '저강도', method: 'block' },
  '체형교정':     { intensity: '저강도', method: 'block' },
  '균형트레이닝': { intensity: '중강도', method: 'block' },
  '다이어트':     { intensity: '중강도', method: 'circuit' },
  '체력증진':     { intensity: '중강도', method: 'circuit' },
  '근력강화':     { intensity: '고강도', method: 'superset' },
};

function CustomersTab({ customers, setCustomers, setTab, setActiveCustomer, setSessionCfg }) {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ name: '', age: '', gender: '', goal: '', injuries: [], experience: '', weeklyFreq: '', equipment: [] });
  const [nameSearch, setNameSearch] = useState('');
  const [goalFilter, setGoalFilter] = useState('');
  const [levelFilter, setLevelFilter] = useState('');

  const filteredCustomers = useMemo(() => {
    let list = customers;
    if (nameSearch) list = list.filter(c => c.name.includes(nameSearch));
    if (goalFilter) list = list.filter(c => c.goal === goalFilter);
    if (levelFilter) list = list.filter(c => c.experience === levelFilter);
    return list;
  }, [customers, nameSearch, goalFilter, levelFilter]);

  function save() {
    if (!form.name.trim()) return;
    const entry = { ...form, id: editId || uid(), age: parseInt(form.age) || 0 };
    setCustomers(prev => {
      const next = editId ? prev.map(c => c.id === editId ? entry : c) : [...prev, entry];
      saveData('ft_customers', next);
      return next;
    });
    setShowForm(false); setEditId(null);
    setForm({ name: '', age: '', gender: '', goal: '', injuries: [], experience: '', weeklyFreq: '', equipment: [] });
  }

  function edit(c) {
    setForm(c); setEditId(c.id); setShowForm(true);
  }

  function remove(id) {
    setCustomers(prev => { const next = prev.filter(c => c.id !== id); saveData('ft_customers', next); return next; });
  }

  function startSession(c) {
    setActiveCustomer(c);
    const preset = GOAL_SESSION[c.goal] || {};
    setSessionCfg(prev => ({
      ...prev,
      intensity: preset.intensity || prev.intensity,
      method: preset.method || prev.method,
    }));
    setTab('session');
  }

  return (
    <div style={{ padding: 16, maxWidth: 800, margin: '0 auto', overflowY: 'auto', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: 18, fontWeight: 700 }}>고객 관리</span>
        <button onClick={() => { setShowForm(true); setEditId(null); setForm({ name:'',age:'',gender:'',goal:'',injuries:[],experience:'',weeklyFreq:'',equipment:[] }); }}
          style={{ padding: '8px 16px', background: T.accent, color: '#fff', borderRadius: 6, fontSize: 13, fontWeight: 600 }}>
          + 고객 등록
        </button>
      </div>

      {/* 필터 */}
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: 12, marginBottom: 14 }}>
        <input value={nameSearch} onChange={e => setNameSearch(e.target.value)}
          placeholder="이름 검색..." style={{ width: '100%', marginBottom: 10 }} />
        <div style={{ marginBottom: 8 }}>
          <span style={{ fontSize: 11, color: T.dim, marginRight: 8 }}>목표</span>
          <Chip label="전체" active={!goalFilter} onClick={() => setGoalFilter('')} small />
          {GOALS.map(g => <Chip key={g} label={g} active={goalFilter === g} onClick={() => setGoalFilter(goalFilter === g ? '' : g)} small />)}
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: T.dim, alignSelf: 'center', marginRight: 4 }}>경력</span>
          <Chip label="전체" active={!levelFilter} onClick={() => setLevelFilter('')} small />
          {LEVELS.map(l => <Chip key={l} label={l.split(' ')[0]} active={levelFilter === l} onClick={() => setLevelFilter(levelFilter === l ? '' : l)} small />)}
        </div>
        {(nameSearch || goalFilter || levelFilter) && (
          <div style={{ fontSize: 11, color: T.dim, marginTop: 8 }}>{filteredCustomers.length}명 표시</div>
        )}
      </div>

      {showForm && (
        <div style={{ background: T.surface, padding: 20, borderRadius: 8, marginBottom: 16, border: `1px solid ${T.border}` }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div><label style={{fontSize:11,color:T.dim,display:'block',marginBottom:4}}>이름</label>
              <input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} style={{width:'100%'}} /></div>
            <div><label style={{fontSize:11,color:T.dim,display:'block',marginBottom:4}}>나이</label>
              <input type="number" value={form.age} onChange={e=>setForm({...form,age:e.target.value})} style={{width:'100%'}} /></div>
            <div><label style={{fontSize:11,color:T.dim,display:'block',marginBottom:4}}>성별</label>
              <ChipGroup items={['남','여']} selected={form.gender} onToggle={v=>setForm({...form,gender:v===form.gender?'':v})} small /></div>
          </div>
          <div style={{marginBottom:12}}>
            <label style={{fontSize:11,color:T.dim,display:'block',marginBottom:4}}>목표</label>
            <ChipGroup items={GOALS} selected={form.goal} onToggle={v=>setForm({...form,goal:v===form.goal?'':v})} small />
          </div>
          <div style={{marginBottom:12}}>
            <label style={{fontSize:11,color:T.dim,display:'block',marginBottom:4}}>부상/통증 부위</label>
            <ChipGroup items={BODY_PARTS} selected={form.injuries} multi
              onToggle={v=>setForm({...form,injuries:form.injuries.includes(v)?form.injuries.filter(x=>x!==v):[...form.injuries,v]})} small />
          </div>
          <div style={{marginBottom:12}}>
            <label style={{fontSize:11,color:T.dim,display:'block',marginBottom:4}}>경험 수준</label>
            <ChipGroup items={LEVELS} selected={form.experience} onToggle={v=>setForm({...form,experience:v===form.experience?'':v})} small />
          </div>
          <div style={{marginBottom:12}}>
            <label style={{fontSize:11,color:T.dim,display:'block',marginBottom:4}}>주간 빈도</label>
            <ChipGroup items={FREQS} selected={form.weeklyFreq} onToggle={v=>setForm({...form,weeklyFreq:v===form.weeklyFreq?'':v})} small />
          </div>
          <div style={{marginBottom:16}}>
            <label style={{fontSize:11,color:T.dim,display:'block',marginBottom:4}}>보유 장비</label>
            <ChipGroup items={EQUIPMENT} selected={form.equipment} multi
              onToggle={v=>setForm({...form,equipment:form.equipment.includes(v)?form.equipment.filter(x=>x!==v):[...form.equipment,v]})} small />
          </div>
          <div style={{display:'flex',gap:8}}>
            <button onClick={save} style={{padding:'8px 20px',background:T.accent,color:'#fff',borderRadius:6,fontSize:13,fontWeight:600}}>
              {editId ? '수정 완료' : '등록'}
            </button>
            <button onClick={()=>{setShowForm(false);setEditId(null)}} style={{padding:'8px 20px',background:T.panel,color:T.text,borderRadius:6,fontSize:13,border:`1px solid ${T.border}`}}>
              취소
            </button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filteredCustomers.map(c => (
          <div key={c.id} style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
            background: T.surface, borderRadius: 8, border: `1px solid ${T.border}`,
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{c.name}</div>
              <div style={{ fontSize: 12, color: T.dim, marginTop: 2 }}>
                {[c.age && `${c.age}세`, c.gender, c.goal, c.experience].filter(Boolean).join(' | ')}
              </div>
              {c.injuries?.length > 0 && (
                <div style={{ fontSize: 11, color: '#E84040', marginTop: 4 }}>
                  부상: {c.injuries.join(', ')}
                </div>
              )}
            </div>
            <button onClick={()=>startSession(c)} style={{padding:'6px 14px',background:T.accent,color:'#fff',borderRadius:6,fontSize:12,fontWeight:600}}>세션 시작</button>
            <button onClick={()=>edit(c)} style={{padding:'6px 14px',background:T.panel,color:T.text,borderRadius:6,fontSize:12,border:`1px solid ${T.border}`}}>수정</button>
            <button onClick={()=>remove(c.id)} style={{padding:'6px 14px',background:'transparent',color:'#E84040',borderRadius:6,fontSize:12,border:`1px solid #E8404044`}}>삭제</button>
          </div>
        ))}
        {filteredCustomers.length === 0 && (
          <div style={{ textAlign: 'center', padding: 60, color: T.dim, fontSize: 13 }}>
            {customers.length === 0 ? '등록된 고객이 없습니다' : '필터 조건에 맞는 고객이 없습니다'}
          </div>
        )}
      </div>
    </div>
  );
}

function SessionTab({ customer, sessionCfg, setSessionCfg, clips, clipAttrs, blocks, setBlocks, setTab }) {
  const [generating, setGenerating] = useState(false);
  const [aiError, setAiError] = useState('');
  const [lastMethod, setLastMethod] = useState('');
  const [lastRationale, setLastRationale] = useState('');

  function toggle(field, val) {
    setSessionCfg(prev => ({ ...prev, [field]: prev[field] === val ? '' : val }));
  }
  function toggleArr(field, val) {
    setSessionCfg(prev => {
      const cur = prev[field] || [];
      return { ...prev, [field]: cur.includes(val) ? cur.filter(v => v !== val) : [...cur, val] };
    });
  }

  function getEnrichedClips() {
    return clips.map(c => {
      const attrs = clipAttrs[c.filePath] || clipAttrs[c.id] || {};
      return { ...c, ...attrs };
    });
  }

  function generateRuleBased() {
    const enriched = getEnrichedClips();
    const { warmupClips, mainClips, coolClips, mainSets, restBetweenSets, restAfter, method, rationale } =
      composeProgram({ enrichedClips: enriched, customer, sessionCfg });

    if (warmupClips.length + mainClips.length + coolClips.length === 0) {
      alert('조합할 클립이 없습니다. 라이브러리에서 클립을 먼저 불러오세요.');
      return;
    }

    const makeBlocks = (clipList, phase) => clipList.map(clip => ({
      uid: uid(), clip, phase,
      sets: phase === 'main' ? mainSets : 1,
      restBetweenSets: phase === 'main' ? restBetweenSets : 10,
      restAfter: phase === 'warmup' ? 10 : phase === 'cooldown' ? 15 : restAfter,
    }));

    const newBlocks = [
      ...makeBlocks(warmupClips, 'warmup'),
      ...makeBlocks(mainClips, 'main'),
      ...makeBlocks(coolClips, 'cooldown'),
    ];

    setBlocks(newBlocks);
    saveData('ft_blocks', newBlocks);
    setLastMethod(method);
    setLastRationale(rationale);
    setTab('builder');
  }

  async function generateAI() {
    setGenerating(true); setAiError('');
    try {
      const enriched = getEnrichedClips();
      const available = enriched.filter(c => {
        if (sessionCfg.includeCats?.length > 0 && !sessionCfg.includeCats.includes(c.code)) return false;
        if (customer?.injuries?.length > 0 && c.injuryRisk?.length > 0) {
          if (c.injuryRisk.some(r => customer.injuries.includes(r))) return false;
        }
        return true;
      });

      const levelMap = { '초급 (6개월 미만)': '초급', '중급 (6개월~2년)': '중급', '고급 (2년 이상)': '고급' };
      const custLevel = levelMap[customer?.experience] || '';
      if (custLevel) {
        available.sort((a, b) => (a.level === custLevel ? -1 : 1) - (b.level === custLevel ? -1 : 1));
      }

      const libSummary = {};
      available.forEach(c => {
        if (!libSummary[c.code]) libSummary[c.code] = [];
        libSummary[c.code].push(`${c.fileName}(${c.name},부위:${c.part||'-'},난이도:${c.level||'-'},패턴:${c.pattern||'-'})`);
      });

      const systemPrompt = `당신은 FMS 기반 체형교정, 기능분석, 균형트레이닝 전문가입니다.
동작 배치 순서는 하나의 정답이 아니라 아래 훈련 기법 중 회원 레벨·강도·목표에 맞는 것을 선택하거나 섞어서 설계하세요:
- 블록형: 폼롤링→모빌리티→안정화→움직임패턴→강화→쿨다운 순차 (초급/부상 이력 있는 회원에게 안전)
- 서킷형: 근력·코어·유산소를 라운드 단위로 반복 (다이어트/체력증진 목표)
- 복합교차형: 유산소·폼롤링·스트레칭 같은 회복 계열을 준비/정리운동에만 두지 않고 근력·코어 사이사이 전 구간에 섞어 배치 (예: 유산소→폼롤링→근력→유산소→스트레칭→코어→...). 경력자·고강도를 원하는 회원에게 단조로움을 없애고 전환 자체를 자극으로 만듭니다.
- 슈퍼세트: 서로 다른 부위 근력 동작을 페어로 묶어 휴식 없이 연속 배치, 페어 사이에만 휴식 (중급 이상, 세션 밀도를 높이고 싶을 때)
단순함과 복합성 자체보다 회원 상황에 맞는 판단이 중요합니다 — 무조건 복잡하게 짤 필요는 없습니다.
부상 부위 동작 제외, 난이도 매칭, 신체 부위 균형을 고려하세요.
연속 2회 이상 같은 bodyParts가 나오지 않게 배치하세요.
JSON만 응답하세요:
{"name":"프로그램명","method":"선택한 기법(블록형/서킷형/복합교차형/슈퍼세트 등)","rationale":"이 회원에게 이 기법을 고른 이유(레벨·강도·목표와 연결지어 설명)","blocks":[{"fileName":"원본파일명.mp4","sets":2,"restBetweenSets":20,"restAfter":60}]}`;

      const userPrompt = `고객: ${JSON.stringify({
        name: customer?.name, age: customer?.age, goal: customer?.goal,
        injuries: customer?.injuries, experience: customer?.experience,
      })}
세션 조건: ${JSON.stringify(sessionCfg)}
라이브러리:
${Object.entries(libSummary).map(([k,v]) => `[${k}] ${v.join(', ')}`).join('\n')}`;

      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': localStorage.getItem('ft_api_key') || '',
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 4096,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        }),
      });

      if (!resp.ok) {
        const err = await resp.text();
        throw new Error(`API 오류 (${resp.status}): ${err}`);
      }

      const data = await resp.json();
      const text = data.content?.[0]?.text || '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('AI 응답에서 JSON을 찾을 수 없습니다');
      const program = JSON.parse(jsonMatch[0]);

      const newBlocks = (program.blocks || []).map(b => {
        const clip = enriched.find(c => c.fileName === b.fileName);
        if (!clip) return null;
        return {
          uid: uid(),
          clip,
          sets: b.sets || 1,
          restBetweenSets: b.restBetweenSets || 20,
          restAfter: b.restAfter || 60,
        };
      }).filter(Boolean);

      setBlocks(newBlocks);
      saveData('ft_blocks', newBlocks);
      setLastMethod('AI');
      setLastRationale(program.rationale || '');
      setTab('builder');
    } catch (e) {
      setAiError(e.message);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 700, margin: '0 auto', overflowY: 'auto', height: '100%' }}>
      <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>세션 설정</div>
      {customer && (
        <div style={{ fontSize: 13, color: T.dim, marginBottom: 12, background: T.surface, padding: '8px 12px', borderRadius: 6, border: `1px solid ${T.border}` }}>
          <span style={{ color: T.text, fontWeight: 600 }}>{customer.name}</span>
          {' · '}{customer.goal || '-'} · {customer.experience?.split(' ')[0] || '-'}
          {customer.injuries?.length > 0 && <span style={{ color: '#E84040', marginLeft: 8 }}>부상: {customer.injuries.join(', ')}</span>}
          {GOAL_SESSION[customer.goal] && (
            <span style={{ marginLeft: 10, fontSize: 11, color: T.accent }}>
              → 강도: {GOAL_SESSION[customer.goal].intensity} · 기법: {TRAINING_METHODS.find(m => m.code === GOAL_SESSION[customer.goal].method)?.label?.split(' ')[0]} 자동 설정됨
            </span>
          )}
        </div>
      )}

      <Section label="운동 시간 (분)">
        <ChipGroup items={DURATIONS.map(d=>({value:String(d),label:`${d}분`}))} selected={String(sessionCfg.duration)}
          onToggle={v=>toggle('duration',Number(v))} />
      </Section>
      <Section label="강도">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {INTENSITIES.map(v => (
            <div key={v} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <Chip label={v} active={sessionCfg.intensity === v} onClick={() => toggle('intensity', v)} />
              <span style={{ fontSize: 10, color: T.dim }}>{INTENSITY_RPE[v]}</span>
            </div>
          ))}
        </div>
      </Section>
      <Section label="집중 부위">
        <ChipGroup items={FOCUS_OPTIONS} selected={sessionCfg.focus} onToggle={v=>toggle('focus',v)} />
      </Section>
      <Section label="컨디션">
        <ChipGroup items={CONDITIONS} selected={sessionCfg.condition} onToggle={v=>toggle('condition',v)} />
      </Section>
      <Section label="사용 카테고리">
        <ChipGroup items={CATS} selected={sessionCfg.includeCats} multi
          colorMap={Object.fromEntries(CATS.map(c=>[c.code,c.color]))}
          onToggle={v=>toggleArr('includeCats',v)} />
      </Section>
      <Section label="구성 기법">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {TRAINING_METHODS.map(m => (
            <Chip key={m.code} label={m.label}
              active={(sessionCfg.method || 'auto') === m.code}
              onClick={() => setSessionCfg(prev => ({ ...prev, method: m.code }))} />
          ))}
        </div>
      </Section>

      {lastRationale && (
        <div style={{ fontSize: 12, color: T.text, background: T.panel, border: `1px solid ${T.border}`,
          borderRadius: 8, padding: 10, marginBottom: 12, lineHeight: 1.5 }}>
          <span style={{ color: T.dim }}>마지막 생성 — </span>{lastRationale}
        </div>
      )}

      <div style={{ marginTop: 8, marginBottom: 12 }}>
        <label style={{ fontSize: 11, color: T.dim, display: 'block', marginBottom: 4 }}>API Key</label>
        <input type="password" placeholder="sk-ant-..." defaultValue={localStorage.getItem('ft_api_key') || ''}
          onChange={e => localStorage.setItem('ft_api_key', e.target.value)}
          style={{ width: '100%' }} />
      </div>

      {aiError && <div style={{ color: '#E84040', fontSize: 12, marginBottom: 8, padding: 8, background: '#E8404011', borderRadius: 6 }}>{aiError}</div>}

      <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
        <button onClick={generateAI} disabled={generating} style={{
          flex: 1, minWidth: 160, padding: '12px 20px', background: T.accent, color: '#fff',
          borderRadius: 8, fontSize: 14, fontWeight: 600, opacity: generating ? 0.6 : 1,
        }}>{generating ? 'AI 프로그램 생성 중...' : 'AI 프로그램 생성'}</button>
        <button onClick={generateRuleBased} style={{
          flex: 1, minWidth: 160, padding: '12px 20px', background: '#1D4ED8', color: '#fff',
          borderRadius: 8, fontSize: 14, fontWeight: 600,
        }}>자동 조합 (API 불필요)</button>
        <button onClick={() => setTab('builder')} style={{
          flex: 1, minWidth: 120, padding: '12px 20px', background: T.panel, color: T.text,
          borderRadius: 8, fontSize: 14, border: `1px solid ${T.border}`,
        }}>직접 조립하기</button>
      </div>
    </div>
  );
}

function Section({ label, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ fontSize: 12, color: T.dim, display: 'block', marginBottom: 6, fontWeight: 500 }}>{label}</label>
      {children}
    </div>
  );
}

function BuilderTab({ clips, clipAttrs, blocks, setBlocks, setTab }) {
  const [catFilter, setCatFilter] = useState('');
  const [search, setSearch] = useState('');
  const [dragIdx, setDragIdx] = useState(null);

  const enriched = useMemo(() => clips.map(c => ({ ...c, ...(clipAttrs[c.filePath] || clipAttrs[c.id] || {}) })), [clips, clipAttrs]);

  const filtered = useMemo(() => {
    let list = enriched;
    if (catFilter) list = list.filter(c => c.code === catFilter);
    if (search) { const s = search.toLowerCase(); list = list.filter(c => c.fileName.toLowerCase().includes(s) || c.name.toLowerCase().includes(s)); }
    return list;
  }, [enriched, catFilter, search]);

  function addBlock(clip) {
    const block = { uid: uid(), clip, sets: 1, restBetweenSets: 20, restAfter: 60 };
    setBlocks(prev => { const next = [...prev, block]; saveData('ft_blocks', next); return next; });
  }

  function removeBlock(uid) {
    setBlocks(prev => { const next = prev.filter(b => b.uid !== uid); saveData('ft_blocks', next); return next; });
  }

  function updateBlock(uid, field, value) {
    setBlocks(prev => {
      const next = prev.map(b => b.uid === uid ? { ...b, [field]: value } : b);
      saveData('ft_blocks', next);
      return next;
    });
  }

  function moveBlock(from, to) {
    setBlocks(prev => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      saveData('ft_blocks', next);
      return next;
    });
  }

  const totalSets = blocks.reduce((s, b) => s + b.sets, 0);
  const catCounts = {};
  blocks.forEach(b => { catCounts[b.clip?.code] = (catCounts[b.clip?.code] || 0) + 1; });
  const blockSec = b => (b.clip?.duration || 60) * b.sets + (b.sets - 1) * b.restBetweenSets + b.restAfter;
  const totalSec = blocks.reduce((s, b) => s + blockSec(b), 0);
  const estMinutes = totalSec / 60;
  const phaseSec = phase => blocks.filter(b => b.phase === phase).reduce((s, b) => s + blockSec(b), 0);

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <div style={{ width: 280, borderRight: `1px solid ${T.border}`, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: 8, borderBottom: `1px solid ${T.border}` }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="검색..." style={{ width: '100%', marginBottom: 6 }} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
            <Chip label="전체" active={!catFilter} onClick={() => setCatFilter('')} small />
            {CATS.map(c => <Chip key={c.code} label={c.code} active={catFilter === c.code} color={c.color}
              onClick={() => setCatFilter(catFilter === c.code ? '' : c.code)} small />)}
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 6 }}>
          {filtered.map(clip => {
            const cat = CAT_MAP[clip.code];
            return (
              <div key={clip.id} onClick={() => addBlock(clip)} style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px',
                borderRadius: 5, cursor: 'pointer', marginBottom: 1, fontSize: 12,
              }}>
                <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3,
                  background: (cat?.color || T.dimMid) + '22', color: cat?.color || T.dim }}>{clip.code}</span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{clip.name}</span>
                {clip.duration && <span style={{ color: T.dim, fontSize: 10, whiteSpace: 'nowrap' }}>{fmtSec(clip.duration)}</span>}
                <span style={{ color: T.accent, fontWeight: 700, fontSize: 14 }}>+</span>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '10px 16px', display: 'flex', gap: 8, borderBottom: `1px solid ${T.border}`, alignItems: 'center' }}>
          <span style={{ fontSize: 15, fontWeight: 700, flex: 1 }}>프로그램 빌더</span>
          <button onClick={() => { if (blocks.length > 0) setTab('player'); }} style={{
            padding: '7px 16px', background: blocks.length > 0 ? T.accent : T.dimMid,
            color: '#fff', borderRadius: 6, fontSize: 13, fontWeight: 600,
          }}>재생</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
          {blocks.length === 0 && (
            <div style={{ textAlign: 'center', padding: 60, color: T.dim, fontSize: 13 }}>
              왼쪽 라이브러리에서 클릭하여 동작을 추가하세요
            </div>
          )}
          {(() => {
            const PHASE_LABEL = {
              warmup:   { label: '준비운동', sub: `${Math.round(phaseSec('warmup')/60)}분 · RPE 11 · 폼롤링 + 스트레칭`, color: '#F59E0B' },
              main:     { label: '본운동',   sub: `${Math.round(phaseSec('main')/60)}분 · RPE 13-15 · 근력 + 유산소`,  color: '#E84040' },
              cooldown: { label: '정리운동', sub: `${Math.round(phaseSec('cooldown')/60)}분 · RPE 11 · 스트레칭 + 이완`, color: '#22C55E' },
            };
            let lastPhase = null;
            const items = [];
            blocks.forEach((block, idx) => {
              const phase = block.phase;
              if (phase && phase !== lastPhase) {
                const pl = PHASE_LABEL[phase];
                if (pl) items.push(
                  <div key={`ph-${phase}`} style={{
                    display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, marginTop: idx > 0 ? 14 : 0,
                  }}>
                    <div style={{ width: 3, height: 20, background: pl.color, borderRadius: 2 }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: pl.color }}>{pl.label}</span>
                    <span style={{ fontSize: 11, color: T.dim }}>{pl.sub}</span>
                  </div>
                );
                lastPhase = phase;
              }
              const cat = CAT_MAP[block.clip?.code];
              items.push(
                <div key={block.uid} draggable
                  onDragStart={() => setDragIdx(idx)}
                  onDragOver={e => e.preventDefault()}
                  onDrop={() => { if (dragIdx !== null && dragIdx !== idx) moveBlock(dragIdx, idx); setDragIdx(null); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                    background: T.surface, borderRadius: 8, marginBottom: 4,
                    border: `1px solid ${block.phase === 'main' ? T.border : T.dimMid + '55'}`, cursor: 'grab',
                  }}>
                  <span style={{ color: T.dimMid, fontSize: 12, width: 20 }}>{idx + 1}</span>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                    background: (cat?.color || T.dimMid) + '22', color: cat?.color || T.dim,
                  }}>{block.clip?.code}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{block.clip?.name || block.clip?.fileName}</div>
                    <div style={{ fontSize: 11, color: T.dim }}>{block.clip?.part}</div>
                  </div>
                  <span style={{ fontSize: 11, color: T.dim, minWidth: 38, textAlign: 'right' }}>{fmtSec(blockSec(block))}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                    <span style={{ color: T.dim }}>세트</span>
                    <select value={block.sets} onChange={e => updateBlock(block.uid, 'sets', Number(e.target.value))}
                      style={{ width: 50, padding: '3px 6px', fontSize: 12 }}>
                      {[1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                    <span style={{ color: T.dim }}>세트휴식</span>
                    <select value={block.restBetweenSets} onChange={e => updateBlock(block.uid, 'restBetweenSets', Number(e.target.value))}
                      style={{ width: 55, padding: '3px 6px', fontSize: 12 }}>
                      {[10,15,20,30].map(n => <option key={n} value={n}>{n}s</option>)}
                    </select>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                    <span style={{ color: T.dim }}>전환</span>
                    <select value={block.restAfter} onChange={e => updateBlock(block.uid, 'restAfter', Number(e.target.value))}
                      style={{ width: 55, padding: '3px 6px', fontSize: 12 }}>
                      {[0,15,20,30,60,90].map(n => <option key={n} value={n}>{n}s</option>)}
                    </select>
                  </div>
                  <button onClick={() => removeBlock(block.uid)} style={{
                    width: 28, height: 28, background: 'transparent', color: '#E84040', fontSize: 16, borderRadius: 4,
                  }}>x</button>
                </div>
              );
            });
            return items;
          })()}
        </div>
      </div>

      <div style={{ width: 200, borderLeft: `1px solid ${T.border}`, padding: 16, overflowY: 'auto' }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>구성 요약</div>
        <SummaryRow label="총 동작" value={`${blocks.length}개`} />
        <SummaryRow label="총 세트" value={`${totalSets}세트`} />
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 12, borderBottom: `1px solid ${T.border}` }}>
          <span style={{ color: T.dim }}>총 시간</span>
          <span style={{ fontWeight: 700, color: totalSec > 50*60 ? '#E84040' : totalSec >= 46*60 ? '#22C55E' : T.text }}>
            {Math.floor(totalSec/60)}분 {totalSec%60 > 0 ? `${totalSec%60}초` : ''}
          </span>
        </div>

        {/* 단계별 시간 */}
        {['warmup','main','cooldown'].some(p => blocks.some(b => b.phase === p)) && (
          <>
            <div style={{ marginTop: 14, fontSize: 12, fontWeight: 600, color: T.dim, marginBottom: 6 }}>운동 구조</div>
            {[
              { key: 'warmup', label: '준비운동', color: '#F59E0B' },
              { key: 'main',   label: '본운동',   color: '#E84040' },
              { key: 'cooldown', label: '정리운동', color: '#22C55E' },
            ].map(({ key, label, color }) => {
              const cnt = blocks.filter(b => b.phase === key).length;
              if (!cnt) return null;
              const sec = phaseSec(key);
              return (
                <div key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 11, borderBottom: `1px solid ${T.border}` }}>
                  <span style={{ color }}>{label} <span style={{ color: T.dim }}>({cnt}개)</span></span>
                  <span style={{ color: T.dim }}>{Math.round(sec/60)}분</span>
                </div>
              );
            })}
          </>
        )}

        <div style={{ marginTop: 14, fontSize: 12, fontWeight: 600, color: T.dim, marginBottom: 8 }}>카테고리 비율</div>
        {Object.entries(catCounts).map(([code, cnt]) => {
          const cat = CAT_MAP[code];
          const pct = Math.round(cnt / blocks.length * 100);
          return (
            <div key={code} style={{ marginBottom: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2 }}>
                <span style={{ color: cat?.color }}>{cat?.label || code}</span>
                <span style={{ color: T.dim }}>{pct}%</span>
              </div>
              <div style={{ height: 4, background: T.panel, borderRadius: 2 }}>
                <div style={{ width: `${pct}%`, height: '100%', background: cat?.color || T.dimMid, borderRadius: 2 }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SummaryRow({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 12, borderBottom: `1px solid ${T.border}` }}>
      <span style={{ color: T.dim }}>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function expandToQueue(blocks) {
  const q = [];
  blocks.forEach(block => {
    for (let s = 1; s <= block.sets; s++) {
      q.push({ type: 'clip', clip: block.clip, setNum: s, totalSets: block.sets });
      if (s < block.sets)
        q.push({ type: 'rest', restKind: 'set', duration: block.restBetweenSets });
    }
    if (block.restAfter > 0)
      q.push({ type: 'rest', restKind: 'move', duration: block.restAfter });
  });
  return q;
}

function PlayerTab({ blocks }) {
  const [queue, setQueue] = useState([]);
  const [ci, setCi] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [restCountdown, setRestCountdown] = useState(0);
  const [speed, setSpeed] = useState(1);
  const videoRef = useRef(null);
  const hideTimer = useRef(null);
  const restTimer = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    const q = expandToQueue(blocks);
    setQueue(q);
    setCi(0);
    setPlaying(false);
    setRestCountdown(0);
  }, [blocks]);

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.sendPlayerState({ playing, queue, currentIndex: ci });
    }
  }, [playing, ci, queue]);

  useEffect(() => {
    if (!window.electronAPI) return;
    return window.electronAPI.onRemote((cmd) => {
      switch (cmd.type) {
        case 'toggle': togglePlay(); break;
        case 'play': setPlaying(true); break;
        case 'pause': setPlaying(false); break;
        case 'next': goNext(); break;
        case 'prev': goPrev(); break;
        case 'skip-rest': skipRest(); break;
        case 'speed': if (cmd.v) setSpeed(cmd.v); break;
      }
    });
  }, [ci, queue]);

  const cur = queue[ci];

  useEffect(() => {
    if (cur?.type === 'rest') {
      setRestCountdown(cur.duration);
      restTimer.current = setInterval(() => {
        setRestCountdown(prev => {
          if (prev <= 1) { clearInterval(restTimer.current); goNext(); return 0; }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(restTimer.current);
    }
  }, [ci, cur?.type]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = speed;
  }, [speed, ci]);

  function togglePlay() {
    if (!videoRef.current) return;
    if (playing) videoRef.current.pause();
    else videoRef.current.play();
    setPlaying(!playing);
  }

  function goNext() {
    clearInterval(restTimer.current);
    setCi(prev => Math.min(prev + 1, queue.length - 1));
    setPlaying(true);
  }

  function goPrev() {
    clearInterval(restTimer.current);
    setCi(prev => Math.max(prev - 1, 0));
    setPlaying(true);
  }

  function skipRest() {
    if (cur?.type === 'rest') {
      clearInterval(restTimer.current);
      goNext();
    }
  }

  function goFullscreen() {
    if (containerRef.current?.requestFullscreen) {
      containerRef.current.requestFullscreen();
      setIsFullscreen(true);
    }
  }

  useEffect(() => {
    function onFsChange() { setIsFullscreen(!!document.fullscreenElement); }
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  function onMouseMove() {
    setShowControls(true);
    clearTimeout(hideTimer.current);
    if (isFullscreen) {
      hideTimer.current = setTimeout(() => setShowControls(false), 3000);
    }
  }

  function handleVideoEnded() {
    goNext();
  }

  useEffect(() => {
    if (cur?.type === 'clip' && videoRef.current && playing) {
      videoRef.current.play().catch(() => {});
    }
  }, [ci, cur?.type]);

  if (queue.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: T.dim, fontSize: 14 }}>
        프로그램 빌더에서 동작을 추가한 후 재생하세요
      </div>
    );
  }

  return (
    <div ref={containerRef} onMouseMove={onMouseMove}
      style={{ display: 'flex', height: '100%', background: '#000', position: 'relative' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
        {cur?.type === 'clip' ? (
          <video ref={videoRef} key={cur.clip?.filePath || cur.clip?.url || ci}
            src={clipSrc(cur.clip)} onEnded={handleVideoEnded}
            onError={() => {
              const fallback = cur.clip?.url;
              const el = videoRef.current;
              if (el && fallback && el.src !== fallback) el.src = fallback;
            }}
            onClick={togglePlay}
            style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }} />
        ) : cur?.type === 'rest' ? (
          <div style={{
            width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            background: cur.restKind === 'set' ? 'rgba(245,158,11,.08)' : 'rgba(124,58,237,.08)',
          }}>
            <div style={{
              fontSize: 14, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 16,
              color: cur.restKind === 'set' ? '#F59E0B' : '#7C3AED',
            }}>{cur.restKind === 'set' ? '세트 휴식' : '동작 전환 휴식'}</div>
            <div style={{
              fontSize: 96, fontWeight: 800,
              color: cur.restKind === 'set' ? '#F59E0B' : '#7C3AED',
            }}>{restCountdown}</div>
            <button onClick={skipRest} style={{
              marginTop: 24, padding: '10px 24px', borderRadius: 8,
              background: cur.restKind === 'set' ? '#F59E0B22' : '#7C3AED22',
              color: cur.restKind === 'set' ? '#F59E0B' : '#7C3AED',
              fontSize: 14, fontWeight: 600,
            }}>건너뛰기</button>
          </div>
        ) : null}

        {showControls && cur?.type === 'clip' && (
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, padding: '16px 20px',
            background: 'linear-gradient(transparent, rgba(0,0,0,.85))',
            display: 'flex', alignItems: 'center', gap: 12, transition: 'opacity .3s',
          }}>
            <button onClick={goPrev} style={{ background: 'transparent', color: '#fff', fontSize: 18, padding: '4px 10px' }}>{'<<'}</button>
            <button onClick={togglePlay} style={{
              width: 44, height: 44, borderRadius: 22, background: T.accent, color: '#fff',
              fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>{playing ? '||' : '>'}</button>
            <button onClick={goNext} style={{ background: 'transparent', color: '#fff', fontSize: 18, padding: '4px 10px' }}>{'>>'}</button>
            <div style={{ flex: 1 }} />
            <div style={{ fontSize: 13, color: '#fff' }}>
              {cur?.clip?.name || ''} {cur?.totalSets > 1 ? `(${cur.setNum}/${cur.totalSets})` : ''}
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {[0.5, 1, 1.5].map(s => (
                <button key={s} onClick={() => setSpeed(s)} style={{
                  padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                  background: speed === s ? T.accent : 'rgba(255,255,255,.15)',
                  color: '#fff',
                }}>{s}x</button>
              ))}
            </div>
            {!isFullscreen && (
              <button onClick={goFullscreen} style={{
                padding: '6px 12px', background: 'rgba(255,255,255,.15)', color: '#fff',
                borderRadius: 6, fontSize: 12,
              }}>전체화면</button>
            )}
          </div>
        )}
      </div>

      {!isFullscreen && (
        <div style={{ width: 260, background: T.surface, borderLeft: `1px solid ${T.border}`, overflowY: 'auto', padding: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: T.dim, padding: '8px 8px 4px', textTransform: 'uppercase', letterSpacing: 1 }}>큐</div>
          {queue.map((item, i) => {
            const isCurrent = i === ci;
            const isDone = i < ci;
            if (item.type === 'rest') {
              return (
                <div key={i} style={{
                  padding: '4px 8px', fontSize: 11, borderRadius: 4, marginBottom: 1,
                  background: isCurrent ? T.panel : 'transparent',
                  color: isDone ? T.dimMid : (item.restKind === 'set' ? '#F59E0B' : '#7C3AED'),
                  textDecoration: isDone ? 'line-through' : 'none',
                }}>
                  {item.restKind === 'set' ? '세트 휴식' : '전환 휴식'} {item.duration}s
                </div>
              );
            }
            const cat = CAT_MAP[item.clip?.code];
            return (
              <div key={i} onClick={() => { clearInterval(restTimer.current); setCi(i); setPlaying(true); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px',
                  borderRadius: 5, cursor: 'pointer', marginBottom: 1,
                  background: isCurrent ? T.panel : 'transparent',
                  color: isDone ? T.dimMid : T.text,
                  textDecoration: isDone ? 'line-through' : 'none',
                }}>
                {isDone && <span style={{ color: '#22C55E', fontSize: 12, width: 16 }}>{'V'}</span>}
                <span style={{
                  fontSize: 9, fontWeight: 700, padding: '1px 4px', borderRadius: 3,
                  background: (cat?.color || T.dimMid) + '22', color: cat?.color || T.dim,
                }}>{item.clip?.code}</span>
                <span style={{ flex: 1, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.clip?.name}
                </span>
                {item.totalSets > 1 && <span style={{ fontSize: 10, color: T.dim }}>S{item.setNum}/{item.totalSets}</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState(() => loadLS('ft_tab', 'library'));
  const [clips, setClips] = useState(() => loadLS('ft_clips', []));
  const [customers, setCustomers] = useState(() => loadLS('ft_customers', []));
  const [blocks, setBlocks] = useState(() => loadLS('ft_blocks', []));
  const [clipAttrs, setClipAttrs] = useState(() => loadLS('ft_clip_attrs', {}));
  const [activeCustomer, setActiveCustomer] = useState(null);
  const [analysisDone, setAnalysisDone] = useState(() => loadLS('ft_analysis_done', false));
  const [sessionCfg, setSessionCfg] = useState({
    duration: 30, intensity: '중강도', focus: '전신',
    condition: '보통', includeCats: [], method: 'auto',
  });

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;

    // 데이터 파일에서 고객/프로그램 복원
    if (api.loadData) {
      Promise.all([
        api.loadData('ft_customers'),
        api.loadData('ft_blocks'),
        api.loadData('ft_clip_attrs'),
      ]).then(([cust, blks, attrs]) => {
        if (cust)  { setCustomers(cust);  saveLS('ft_customers',  cust); }
        if (blks)  { setBlocks(blks);     saveLS('ft_blocks',     blks); }
        if (attrs) { setClipAttrs(attrs); saveLS('ft_clip_attrs', attrs); }
      }).catch(() => {});
    }

    // 저장된 운동 폴더 자동 재스캔 (바탕화면 등 어디든)
    if (api.autoScanSavedFolder) {
      api.autoScanSavedFolder().then(result => {
        if (result?.clips?.length > 0) {
          setClips(result.clips);
          saveLS('ft_clips', result.clips);
        }
      }).catch(() => {});
    }
  }, []);

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', background: T.bg }}>
      <style>{css}</style>
      <TitleBar />
      <TabBar tab={tab} setTab={setTab} />
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {tab === 'library' && (
          <LibraryTab clips={clips} setClips={setClips}
            onAddBlock={(clip) => {
              const block = { uid: uid(), clip, sets: 1, restBetweenSets: 20, restAfter: 60 };
              setBlocks(prev => { const next = [...prev, block]; saveData('ft_blocks', next); return next; });
            }}
            analysisDone={analysisDone} setAnalysisDone={setAnalysisDone}
            clipAttrs={clipAttrs} setClipAttrs={setClipAttrs} />
        )}
        {tab === 'customers' && (
          <CustomersTab customers={customers} setCustomers={setCustomers}
            setTab={setTab} setActiveCustomer={setActiveCustomer} setSessionCfg={setSessionCfg} />
        )}
        {tab === 'session' && (
          <SessionTab customer={activeCustomer} sessionCfg={sessionCfg} setSessionCfg={setSessionCfg}
            clips={clips} clipAttrs={clipAttrs} blocks={blocks} setBlocks={setBlocks} setTab={setTab} />
        )}
        {tab === 'builder' && (
          <BuilderTab clips={clips} clipAttrs={clipAttrs} blocks={blocks} setBlocks={setBlocks} setTab={setTab} />
        )}
        {tab === 'player' && <PlayerTab blocks={blocks} />}
      </div>
    </div>
  );
}
