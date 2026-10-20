/* 시드업자산 — 클로드의 매매 조언 + 가계부 (소원저장소와 별도 앱)
 * 1.2.0: 첫 화면 '조언' — 컨디션 원터치(<dir>/컨디션/YYYY-MM.json) · 장전 브리핑 2장(맥북 07:00 코스피·22:00 나스닥) ·
 *        종목별 조언 + 일봉 차트(<dir>/차트/<코드>.png, 금액 정보 없음) · 직접 계획(옛 체크 탭)은 접어서 아래로.
 * 자료: 비공개 저장소 <dir>/data.enc.json (맥북 정리 스크립트가 PIN 으로 AES-GCM 암호화해 올림) → 이 휴대폰에서만 복호화.
 * 매매일지: <dir>/매매일지/YYYY-MM.jsonl 에 한 줄씩 덧붙임 (GitHub Contents API).
 * 열쇠(토큰)·PIN 은 이 기기의 localStorage 에만 둔다. 외부 요청은 api.github.com 하나뿐(CSP). 증권사·카드사 로그인은 없다. */
(() => {
  'use strict';

  const VERSION = '1.2.0';
  const DEFAULT_CFG = { owner: 'sein9507-max', repo: 'newlywed_tech', branch: 'main', dir: '시드업자산', token: '', pin: '', rememberPin: true, theme: 'C', income: 0, budget: 0, emergency: null, targets: {} };
  const API = 'https://api.github.com';
  const THEMES = { A: { name: '민트 크롬', color: '#CDF4E4' }, B: { name: '라벤더 홀로', color: '#E1D6FF' }, C: { name: '블랙 크롬 라임', color: '#0F1218' } };
  const UNDO_MS = 4000;                          // 저장 뒤 되돌리기 가능한 시간(그동안은 올리지 않고 기다림)
  const nowD = () => (window.__SA_NOW ? new Date(window.__SA_NOW) : new Date());   // 검증용 시각 바꿔치기
  const STYLES = ['단타(당일)', '스윙(며칠~몇 주)', '포지션(몇 달)', '장기(1년+)'];
  const HOLDS = ['당일', '1주 안', '2~4주', '1~3개월', '3개월+'];
  const EMOTIONS = ['차분', '조급', '불안', '흥분', '분노', '무기력'];
  const MISTAKES = ['손절 취소·확대', '계획 없는 물타기', '손실 복구용 수량 확대', '전략·보유기간 즉석 변경', '추격 매수', '트리거 없이 진입', '계획 밖 행동'];
  const STOP_SIGNALS = ['손절을 취소·확대하고 싶다', '계획 없는 물타기 충동', '손실 복구용으로 수량을 키우고 싶다', '전략·보유기간을 즉석에서 바꿨다', '집중력 저하·분노·공포·과흥분', '데이터·주문 시스템 이상', '일일·주간 최대손실 도달'];
  const PHASES = {
    '추세': { obs: '지수·주도주 방향 일치, 거래대금 유지', act: '검증된 추세 셋업만' },
    '과열': { obs: '모두 낙관, 급격한 확장, 저항 무시', act: '신규 추격 축소, 일부 실현' },
    '고변동': { obs: '방향 급변, 갭·사이드카·이벤트 민감', act: '크기 축소, 기준 강화' },
    '공포': { obs: '동시 급락, 레버리지 청산·유동성 경색', act: '원인 분류 전 성급한 매수 금지' },
    '안정화': { obs: '변동성 둔화, 지지 회복, 주도주 재형성', act: '소액 탐색 후 확인되면 확대' },
  };
  const CONDS = [{ v: 1, e: '😫', t: '최악' }, { v: 2, e: '😕', t: '별로' }, { v: 3, e: '😐', t: '보통' }, { v: 4, e: '🙂', t: '좋음' }, { v: 5, e: '😆', t: '최고' }];
  const ACT_CLASS = { '관망': 'wait', '분할매수 검토': 'buy', '비중 축소 검토': 'trim', '손절선 점검': 'stop' };
  const PRINCIPLES = [
    '맞히는 사람이 아니라, 틀렸을 때 작게 인정하고 다시 하는 사람이 남는다.',
    '"좋아 보인다"는 트리거가 아니고, "본전 오면 판다"는 규칙이 아니다.',
    '한 거래로 규칙을 바꾸지 않는다. 표본이 쌓인 뒤에 고친다.',
    '복귀는 손익이 아니라, 연속된 과정 준수 표본으로 결정한다.',
    '손절 취소·계획 없는 물타기·손실 복구용 수량 확대 → 그 자리에서 멈춘다.',
    '생활비·비상금이 섞이지 않았는지 먼저. 수량은 허용손실이 정한다.',
    '트리거는 관찰 가능한 것(가격·거래대금·공시·이벤트)만. 사후 변경 금지.',
  ];
  const SUB_GROUPS = {
    'OTT': /넷플릭스|NETFLIX|디즈니|DISNEY|티빙|TVING|웨이브|WAVVE|왓챠|WATCHA|쿠팡플레이|유튜브 ?프리미엄|YOUTUBE ?PREMIUM/i,
    '음악': /멜론|MELON|지니|GENIE|스포티파이|SPOTIFY|유튜브 ?뮤직|YOUTUBE ?MUSIC|애플 ?뮤직|APPLE ?MUSIC/i,
    'AI': /챗GPT|CHATGPT|OPENAI|ANTHROPIC|CLAUDE|클로드|GEMINI|제미나이|PERPLEXITY|퍼플렉시티/i,
    '클라우드': /ICLOUD|아이클라우드|GOOGLE ONE|구글 ?원|DROPBOX|드롭박스/i,
    '통신': /\bKT\b|SKT|SK텔레콤|LG ?U\+|LGU|유플러스|알뜰폰/i,
  };

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const pad = (n) => String(n).padStart(2, '0');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function paint(root) {   // CSP(style-src 'self') 가 style 속성은 막지만 JS 의 el.style 은 허용 → data-* 로 받아 그린다
    $$('[data-w]', root).forEach((el) => { el.style.width = el.dataset.w + '%'; });
    $$('[data-left]', root).forEach((el) => { el.style.left = el.dataset.left + '%'; });
    $$('[data-p]', root).forEach((el) => { el.style.setProperty('--p', el.dataset.p); });
  }

  const store = {
    ok: true,
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { this.ok = false; return false; } },
    del(k) { try { localStorage.removeItem(k); } catch { /* 무시 */ } },
  };

  // ── 상태 ────────────────────────────────────────────────
  let cfg = { ...DEFAULT_CFG, ...store.get('sa.cfg', {}) };
  let sessionPin = '';
  let data = null;                               // 복호화된 자료
  let dataFrom = '';                             // 'github' | 'local'
  let journal = store.get('sa.journal', {});     // { 'YYYY-MM': { entries, sha } }
  let memos = store.get('sa.memos', {});         // 지출 메모 { 'YYYY-MM': { entries, sha } }
  let conds = store.get('sa.conds', {});         // 컨디션 { 'YYYY-MM': { days: { 'YYYY-MM-DD': { v, at } }, sha } }
  let queue = store.get('sa.queue', []);         // 아직 못 올린 기록 { kind: 'journal'|'memo'|'cond', month, entry, holdUntil }
  let condMonth = '';
  let curTab = 'advice';
  let flushTimer = 0;
  let toastTimer = 0;
  let lastSaved = null;
  let flushing = false;
  let lastError = '';
  let spendMonth = '';
  let txShown = 40;
  let txFilter = '';
  let txCat = '';
  let phase = store.get('sa.phase', '');
  let stops = new Set(store.get('sa.stops', []));
  let reviewWeek = 0;
  const jSel = { planned: '', emotion: '', mistakes: new Set() };
  let memoCat = '';

  // ── 시간·숫자 ───────────────────────────────────────────
  function isoLocal(d) {
    const off = -d.getTimezoneOffset(), s = off >= 0 ? '+' : '-', a = Math.abs(off);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${s}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
  }
  const todayISO = () => isoLocal(nowD()).slice(0, 10);
  const monthOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  function makeId(d) { return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}-${Math.random().toString(36).slice(2, 5).padEnd(3, '0')}`; }
  const DOW = ['일', '월', '화', '수', '목', '금', '토'];
  function dateKo(iso, withYear) {
    if (!iso) return '';
    const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return `${withYear ? y + '년 ' : ''}${m}월 ${d}일 (${DOW[dt.getDay()]})`;
  }
  const monthKo = (ym) => { const [y, m] = ym.split('-').map(Number); return `${y}년 ${m}월`; };
  const num = (n, digits = 0) => (n == null || isNaN(n)) ? '—' : Number(n).toLocaleString('ko-KR', { maximumFractionDigits: digits, minimumFractionDigits: 0 });
  const won = (n) => (n == null || isNaN(n)) ? '—' : `${num(Math.round(n))}원`;
  function koMoney(n) {
    if (n == null || isNaN(n)) return '—';
    const sign = n < 0 ? '-' : ''; n = Math.abs(Math.round(n));
    const eok = Math.floor(n / 1e8), man = Math.floor((n % 1e8) / 1e4);
    if (eok) return `${sign}${eok}억 ${num(man)}만원`;
    if (man) return `${sign}${num(man)}만원`;
    return `${sign}${num(n)}원`;
  }
  const pct = (n, d = 1) => (n == null || isNaN(n)) ? '—' : `${n > 0 ? '+' : ''}${Number(n).toFixed(d)}%`;
  const sgn = (n) => n > 0 ? 'gain' : n < 0 ? 'loss' : '';
  const price = (p, ccy) => p == null ? '—' : ccy === 'USD' ? `$${num(p, 2)}` : `${num(p)}원`;
  function weekRange(offset) {       // 월요일 시작. offset 0 = 이번 주, -1 = 지난 주
    const t = nowD(); t.setHours(12, 0, 0, 0);
    const dow = (t.getDay() + 6) % 7;
    const start = new Date(t); start.setDate(t.getDate() - dow + offset * 7);
    const end = new Date(start); end.setDate(start.getDate() + 6);
    return [isoLocal(start).slice(0, 10), isoLocal(end).slice(0, 10)];
  }

  // ── base64 ─────────────────────────────────────────────
  function b64bytes(b64) { const bin = atob(String(b64).replace(/\s/g, '')); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }
  const b64decode = (b64) => new TextDecoder().decode(b64bytes(b64));
  function b64encode(str) { const bytes = new TextEncoder().encode(str); let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(bin); }

  // ── 복호화 (정리 스크립트와 같은 PBKDF2-SHA256 → AES-GCM) ──
  async function decryptEnc(enc, pin) {
    if (!enc || enc.v !== 1 || !enc.ct) throw new Error('자료 형식이 낯설어요. 맥북 정리 스크립트 버전을 확인해 주세요');
    if (!crypto.subtle) throw new Error('이 브라우저에서는 복호화를 못 해요(https 필요)');
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: b64bytes(enc.salt), iterations: enc.iter || 200000 }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    let pt;
    try { pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64bytes(enc.iv), tagLength: 128 }, key, b64bytes(enc.ct)); }
    catch { const e = new Error('PIN이 맞지 않아요'); e.badPin = true; throw e; }
    return JSON.parse(new TextDecoder().decode(pt));
  }

  // ── GitHub ──────────────────────────────────────────────
  class ApiError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
  async function gh(path, opts = {}) {
    let res;
    try {
      res = await fetch(API + path, {
        method: opts.method || 'GET', cache: 'no-store', referrerPolicy: 'no-referrer',
        headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${cfg.token}`, 'X-GitHub-Api-Version': '2022-11-28', ...(opts.body ? { 'Content-Type': 'application/json' } : {}) },
        body: opts.body ? JSON.stringify(opts.body) : undefined,
      });
    } catch { throw new ApiError(0, '인터넷 연결을 확인해 주세요'); }
    if (res.ok) return res.status === 204 ? null : res.json();
    let detail = ''; try { detail = (await res.json()).message || ''; } catch { /* 무시 */ }
    throw new ApiError(res.status, explain(res.status, detail));
  }
  function explain(status, detail) {
    if (status === 401) return '열쇠가 틀렸거나 만료됐어요. 설정에서 새 열쇠를 넣어주세요';
    if (status === 403 && /rate limit/i.test(detail)) return '요청이 잠시 몰렸어요. 조금 뒤에 다시 해볼게요';
    if (status === 403) return '이 열쇠에 권한이 없어요. 열쇠의 Contents 권한(Read and write)을 확인해 주세요';
    if (status === 404) return '이 열쇠로는 파일이 안 보여요. 열쇠를 만들 때 newlywed_tech 저장소를 골랐는지 확인해 주세요';
    if (status === 409 || status === 422) return '다른 곳에서 먼저 바뀌었어요. 다시 맞춰서 올릴게요';
    return `GitHub 오류 ${status}${detail ? ' · ' + detail : ''}`;
  }
  const repoPath = () => `/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}`;
  const contentsPath = (rel) => `${repoPath()}/contents/${rel.split('/').filter(Boolean).map(encodeURIComponent).join('/')}`;
  async function getFile(rel) {
    let meta;
    try { meta = await gh(`${contentsPath(rel)}?ref=${encodeURIComponent(cfg.branch)}&t=${Date.now()}`); }
    catch (e) { if (e.status === 404) return null; throw e; }
    let raw = meta.content;
    if (!raw && meta.size > 0) raw = (await gh(`${repoPath()}/git/blobs/${meta.sha}`)).content;
    return { text: b64decode(raw || ''), sha: meta.sha };
  }
  async function putFile(rel, text, sha, message) {
    const res = await gh(contentsPath(rel), { method: 'PUT', body: { message, branch: cfg.branch, content: b64encode(text), ...(sha ? { sha } : {}) } });
    return res.content.sha;
  }

  // ── 자료 불러오기 ───────────────────────────────────────
  const pin = () => cfg.pin || sessionPin;
  function setPill(text, cls) { const p = $('#syncPill'); p.textContent = text; p.className = 'pill' + (cls ? ' ' + cls : ''); }
  function showBanner(html, cls) { const b = $('#banner'); b.innerHTML = html; b.className = 'banner' + (cls ? ' ' + cls : ''); b.hidden = false; }
  function hideBanner() { $('#banner').hidden = true; }
  function showLock(title, hint, msg, cls) {
    $('#lock').hidden = false; $('#main').hidden = true;
    $('#lockTitle').textContent = title; $('#lockHint').textContent = hint;
    const m = $('#lockMsg'); m.textContent = msg || ''; m.className = 'msg' + (cls ? ' ' + cls : '');
    const canUnlock = !!(cfg.token || store.get('sa.enc'));
    $('#pin').disabled = !canUnlock; $('#unlockBtn').disabled = !canUnlock;
  }

  async function load(opts = {}) {
    hideBanner();
    if (!cfg.token && !store.get('sa.enc')) {
      setPill('열쇠 필요', 'is-err');
      showLock('열쇠가 필요해요', '설정 ⚙에서 GitHub 열쇠를 넣으면 저장소의 암호화 자료를 받아와요.');
      showBanner('먼저 <button id="goSettings" type="button">설정에서 열쇠 넣기</button> — 열쇠는 이 휴대폰에만 저장돼요.');
      $('#goSettings').onclick = openSettings;
      return;
    }
    if (!pin()) {
      setPill('PIN 필요', 'is-wait');
      showLock('금고가 잠겨 있어요', 'PIN 6자리를 넣으면 저장소의 암호화 자료를 이 휴대폰에서만 풀어요.');
      return;
    }
    setPill('불러오는 중', 'is-wait');
    let enc = null;
    if (cfg.token) {
      try {
        const f = await getFile(`${cfg.dir}/data.enc.json`);
        if (f) { enc = JSON.parse(f.text); store.set('sa.enc', enc); dataFrom = 'github'; lastError = ''; }
        else lastError = '저장소에 아직 자료 파일이 없어요. 맥북 정리 스크립트가 한 번 돌면 생겨요';
      } catch (e) { lastError = e.message; }
    }
    if (!enc) { enc = store.get('sa.enc', null); dataFrom = 'local'; }
    if (!enc) {
      setPill('자료 없음', 'is-err');
      showLock('자료가 아직 없어요', lastError || '맥북이 정리 스크립트를 돌리면 저장소에 암호화 자료가 생겨요.');
      return;
    }
    try { data = await decryptEnc(enc, pin()); }
    catch (e) {
      if (e.badPin) { cfg.pin = ''; sessionPin = ''; saveCfg(); setPill('PIN 필요', 'is-err'); showLock('금고가 잠겨 있어요', 'PIN 6자리를 넣으면 저장소의 암호화 자료를 이 휴대폰에서만 풀어요.', 'PIN이 맞지 않아요. 맥북에서 python3 도구/시드업자산_정리.py --핀 으로 확인해요', 'err'); }
      else { setPill('오류', 'is-err'); showLock('자료를 못 풀었어요', e.message, '', 'err'); }
      return;
    }
    $('#lock').hidden = true; $('#main').hidden = false;
    const at = (enc.updatedAt || data.generatedAt || '').slice(11, 16);
    if (dataFrom === 'github') setPill(`최신 ${at}`, 'is-ok');
    else setPill(`저장본 ${at}`, 'is-wait');
    if (dataFrom === 'local' && lastError) showBanner(`저장소에서 새 자료를 못 받아 휴대폰에 담아둔 자료를 보여줘요 — ${esc(lastError)}`, 'is-err');
    if (!spendMonth) spendMonth = data.spending.thisMonth;
    renderAll();
    if (curTab === 'advice') markBriefSeen();
    if (cfg.token) { loadJournal().then(() => { renderAll(); }).catch(() => {}); flush(); }
  }

  // ── 렌더 ────────────────────────────────────────────────
  function renderAll() { renderAdvice(); renderToday(); renderSpend(); renderInvest(); renderCheck(); renderJournal(); renderReview(); renderBadges(); }

  // 지출 메모: 카드 거래(같은 날짜·같은 금액)와 겹치면 빼고, 나머지만 거래처럼 보여준다
  function memoEntries() {
    const seen = new Set(); const out = [];
    for (const ym of Object.keys(memos)) for (const e of memos[ym].entries) if (!seen.has(e.id)) { seen.add(e.id); out.push(e); }
    for (const q of queue) if (q.kind === 'memo' && !seen.has(q.entry.id)) { seen.add(q.entry.id); out.push({ ...q.entry, _pending: true }); }
    return out;
  }
  function memoTxs() {
    const card = data.spending.recent || [];
    return memoEntries().filter((m) => !card.some((t) => t.date === m.date && t.amt === m.amt))
      .map((m) => ({ id: m.id, date: m.date, time: (m.at || '').slice(11, 16), merchant: m.merchant || '지출 메모', amt: m.amt, cat: m.cat || '기타', src: '메모', sale: '', _pending: m._pending }));
  }
  function allTx() { return [...memoTxs(), ...(data.spending.recent || [])].sort((a, b) => ((b.date + (b.time || '')) > (a.date + (a.time || '')) ? 1 : -1)); }
  function monthTxs(ym) { return allTx().filter((t) => t.date.startsWith(ym)); }
  function memoSum(ym) { return memoTxs().filter((t) => t.date.startsWith(ym)).reduce((p, t) => p + t.amt, 0); }

  function dayChange() {         // 보유 종목 등락률로 어제 종가 대비 평가금액 변동(시세 기준)
    let chg = 0, base = 0, n = 0;
    for (const acc of data.assets.accounts || []) for (const h of acc.holdings || []) {
      if (h.chgPct == null || h.evalKRW == null) continue;
      const prev = h.evalKRW / (1 + h.chgPct / 100); chg += h.evalKRW - prev; base += prev; n++;
    }
    return n ? { krw: chg, pct: base ? chg / base * 100 : 0 } : null;
  }
  const arrow = (n) => n > 0 ? '▲' : n < 0 ? '▼' : '−';

  // ── 조언 (첫 화면) ───────────────────────────────────────
  function latestBriefAt() { const bs = Object.values(data?.advice?.briefs || {}); return bs.map((b) => b.at || '').sort().pop() || ''; }
  function markBriefSeen() { const a = latestBriefAt(); if (a && a > store.get('sa.seenBrief', '')) store.set('sa.seenBrief', a); }
  function shiftMonth(ym, d) { const [y, m] = ym.split('-').map(Number); return monthOf(new Date(y, m - 1 + d, 1)); }
  function condDays(ym) {
    const days = { ...(conds[ym]?.days || {}) };
    for (const q of queue) if (q.kind === 'cond' && q.month === ym) days[q.entry.date] = { v: q.entry.v, at: q.entry.at, _pending: true };
    return days;
  }
  const condToday = () => condDays(todayISO().slice(0, 7))[todayISO()]?.v || 0;
  function setCondition(v) {
    const d = nowD(), date = todayISO(), month = date.slice(0, 7);
    const i = queue.findIndex((q) => q.kind === 'cond' && q.entry.date === date && !(flushing && q === queue[0]));
    const entry = { id: makeId(d), date, v, at: isoLocal(d) };
    if (i >= 0) queue[i] = { ...queue[i], entry, holdUntil: Date.now() + 1200 };
    else queue.push({ kind: 'cond', month, entry, holdUntil: Date.now() + 1200 });
    store.set('sa.queue', queue);
    renderAdvice();
    const c = CONDS.find((x) => x.v === v);
    showToast(`오늘 컨디션 ${c.e} ${c.t} — 달력에 적었어요`);
    clearTimeout(flushTimer); flushTimer = setTimeout(flush, 1250);
  }
  function renderCalendar() {
    const thisM = todayISO().slice(0, 7);
    if (!condMonth) condMonth = thisM;
    const [y, m] = condMonth.split('-').map(Number), first = new Date(y, m - 1, 1).getDay(), last = new Date(y, m, 0).getDate();
    const days = condDays(condMonth), today = todayISO();
    $('#cLabel').textContent = monthKo(condMonth);
    $('#cNext').disabled = condMonth >= thisM;
    let html = DOW.map((w, i) => `<span class="cal-h${i === 0 ? ' sun' : ''}">${w}</span>`).join('');
    for (let i = 0; i < first; i++) html += '<span class="cal-d is-blank"></span>';
    for (let dd = 1; dd <= last; dd++) {
      const iso = `${condMonth}-${pad(dd)}`, c = CONDS.find((x) => x.v === days[iso]?.v);
      html += `<span class="cal-d${iso === today ? ' is-today' : ''}${c ? ' has c' + c.v : ''}" data-date="${iso}" title="${c ? esc(c.t) : ''}"><i>${dd}</i><b>${c ? c.e : ''}</b></span>`;
    }
    $('#condCal').innerHTML = html;
    const n = Object.keys(days).filter((k) => k.startsWith(condMonth)).length;
    const bad = Object.entries(days).filter(([k, x]) => k.startsWith(condMonth) && x.v <= 2).length;
    $('#condSummary').textContent = `한 달 달력 · ${condMonth === thisM ? '이번 달' : monthKo(condMonth)} ${n}일 기록${bad ? ` · 나쁜 날 ${bad}일` : ''}`;
  }
  function condWarnHtml() {
    const v = condToday(); if (!v || v > 2) return '';
    const c = CONDS.find((x) => x.v === v);
    return `<div class="cond-warn"><span class="wi">!</span><span>오늘 컨디션 ${c.e} — <b>오늘은 관망·소액만.</b> 컨디션도 매매 입력값이에요.</span></div>`;
  }
  function holdingOf(code) { for (const a of data.assets.accounts || []) for (const h of a.holdings || []) if (h.code === code) return { ...h, ccy: a.currency }; return null; }
  function stampKo(at) { return at ? `${Number(at.slice(5, 7))}/${Number(at.slice(8, 10))} ${at.slice(11, 16)}` : ''; }
  function renderAdvice() {
    if (!data) return;
    const v = condToday(), adv = data.advice;
    $('#condRow').innerHTML = CONDS.map((c) => `<button type="button" class="cond-btn${c.v === v ? ' is-on' : ''}" data-v="${c.v}" aria-pressed="${c.v === v}" aria-label="${c.t}"><span class="ce">${c.e}</span><em>${c.t}</em></button>`).join('');
    const pend = queue.some((q) => q.kind === 'cond');
    $('#condNote').textContent = v ? (pend ? '올리는 중' : '오늘 기록됨') : '한 번 누르면 기록';
    renderCalendar();
    // 장전 브리핑 2장 — 생성 시각 최신이 위
    const bs = Object.values(adv?.briefs || {}).filter((b) => b && b.lines).sort((a, b) => ((b.at || '') > (a.at || '') ? 1 : -1));
    const warn = condWarnHtml(), nowMs = nowD().getTime();
    $('#briefs').innerHTML = bs.length ? bs.map((b) => {
      const old = b.at && nowMs - new Date(b.at).getTime() > 26 * 36e5;
      return `<div class="card brief-card" data-slot="${esc(b.slot)}"><h3><span class="flag" aria-hidden="true">${b.slot === 'kr' ? '🇰🇷' : '🇺🇸'}</span>${esc(b.title || '')}<span class="right">${old ? '<span class="chip warn">지난 것</span> ' : ''}${esc(stampKo(b.at))} 생성</span></h3>` +
        `<ol class="brief-lines">${b.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ol>` +
        `${b.stance || b.phase ? `<div class="brief-meta">${b.stance ? `오늘 태도 <b>${esc(b.stance)}</b>` : ''}${b.phase ? ` · 국면 <b>${esc(b.phase)}</b>` : ''}</div>` : ''}${warn}</div>`;
    }).join('') : '<div class="card brief-card"><div class="empty"><b>아직 장전 브리핑이 없어요</b>맥북이 평일 07:00(코스피)·22:00(나스닥)에 1~3줄로 써요</div></div>';
    // 종목 조언
    const items = adv?.items || [];
    $('#advAt').textContent = adv?.itemsAt ? `${stampKo(adv.itemsAt)} · ${adv.itemsSlot === 'kr' ? '코스피' : '나스닥'} 장전 때` : '';
    $('#advWarn').innerHTML = warn;
    $('#advList').innerHTML = items.length ? items.map((it, i) => {
      const h = holdingOf(it.code), ccy = it.ccy || h?.ccy || 'USD';
      const cur = h?.cur ?? it.last?.close, chg = h?.chgPct ?? it.last?.chgPct;
      const lv = it.levels || {};
      return `<div class="adv-item" data-code="${esc(it.code)}">` +
        `<div class="ai-top"><span class="ai-name">${esc(it.code)} <small>${esc(it.name || '')}</small></span><span class="act act-${ACT_CLASS[it.action] || 'wait'}">${esc(it.action || '관망')}</span></div>` +
        `<div class="ai-sub"><span class="chip ${it.held ? '' : 'src'}">${it.held ? '보유' : '관심'}</span>${it.lev ? `<span class="chip warn">레버리지 ${esc(it.lev)}</span>` : ''}${it.phase ? `국면 <b>${esc(it.phase)}</b> · ` : ''}${esc(price(cur, ccy))} <span class="${sgn(chg)}">${esc(pct(chg, 2))}</span></div>` +
        `<ul class="ai-why">${(it.reasons || []).map((r) => `<li>${esc(r)}</li>`).join('')}</ul>` +
        (it.invalid ? `<p class="ai-inv"><span>무효화</span>${esc(it.invalid)}</p>` : '') +
        (it.risk ? `<p class="ai-risk"><span>레버리지</span>${esc(it.risk)}</p>` : '') +
        (it.chart?.path ? `<details class="chart-fold"${i === 0 ? ' open' : ''} data-i="${i}"><summary>차트 그림 <span class="mute">${lv.invalid ? `무효 ${esc(price(lv.invalid, ccy))}` : ''}${lv.support?.length ? ` · 지지 ${esc(price(lv.support[0], ccy))}` : ''}${lv.resistance?.length ? ` · 저항 ${esc(price(lv.resistance[0], ccy))}` : ''}</span></summary><div class="chart-box"><img class="chart-img" alt="${esc(it.code)} 일봉 120일 차트 — 5·20·60일선, 거래량, 지지·저항·무효화 선" width="1080" height="760" hidden><p class="chart-msg hint small m0">차트 불러오는 중…</p></div>` +
          (/^https:\/\//.test(it.tv || '') ? `<a class="tv-link" href="${esc(it.tv)}" target="_blank" rel="noopener noreferrer">트레이딩뷰로 열기 ↗</a>` : '') + '</details>' : '') +
        '</div>';
    }).join('') : '<div class="empty"><b>종목 조언이 아직 없어요</b>장전 브리핑 때 보유·관심 종목마다 함께 써요</div>';
    $('#advNote').textContent = `${adv?.disclaimer || '참고용이에요. 최종 판단은 본인이 해요.'} 차트는 네이버 일봉으로 맥북이 그려요.`;
    $$('#advList details.chart-fold[open]').forEach(showChart);
  }
  async function showChart(det) {
    const it = (data?.advice?.items || [])[+det.dataset.i]; if (!it?.chart) return;
    const img = $('.chart-img', det), msg = $('.chart-msg', det);
    if (img.dataset.h === it.chart.h) return;
    const key = 'sa.chart.' + it.code, cached = store.get(key, null);
    const put = (b64) => { img.src = 'data:image/png;base64,' + b64; img.hidden = false; img.dataset.h = it.chart.h; msg.hidden = true; };
    if (cached && cached.h === it.chart.h) { put(cached.b64); return; }
    if (!cfg.token) { if (cached) put(cached.b64); else msg.textContent = '열쇠를 넣으면 차트를 받아와요'; return; }
    try {
      const meta = await gh(`${contentsPath(it.chart.path)}?ref=${encodeURIComponent(cfg.branch)}&t=${Date.now()}`);
      let raw = meta.content; if (!raw && meta.size > 0) raw = (await gh(`${repoPath()}/git/blobs/${meta.sha}`)).content;
      const b64 = String(raw || '').replace(/\s/g, ''); if (!b64) throw new Error('빈 파일');
      put(b64); store.set(key, { h: it.chart.h, b64 });
    } catch (e) { if (cached) put(cached.b64); else msg.textContent = `차트를 못 받았어요 (${e.message})`; }
  }

  function renderToday() {
    const a = data.assets, t = a.totals, s = data.spending;
    $('#totalNum').textContent = koMoney(t.totalKRW);
    $('#totalNum').title = won(t.totalKRW);
    const dc = dayChange();
    $('#dayChg').innerHTML = dc ? `어제 대비 <b class="${sgn(dc.krw)}">${arrow(dc.krw)} ${esc(koMoney(Math.abs(dc.krw)))} (${esc(pct(dc.pct))})</b> <span class="mute">· 시세 기준</span>` : '<span class="mute">어제 대비 — (보유 시세 없음)</span>';
    $('#tInvest').textContent = koMoney(t.investKRW);
    $('#tCash').textContent = t.cashKRW ? koMoney(t.cashKRW) : (t.unknown?.length ? '미확인' : '0원');
    $('#tSafe').textContent = koMoney(t.safeKRW);
    const uw = $('#unknownWarn');
    if (t.unknown?.length) { uw.hidden = false; const nm = t.unknown.map((x) => x.replace(/\s*\(.*?\)/g, '')).join(', '); uw.innerHTML = `<b>!</b> ${esc(nm)} 미확인 · 실제 총자산은 더 많아요 ›`; uw.title = t.unknown.join(', '); }
    else uw.hidden = true;
    const gen = data.generatedAt ? data.generatedAt.slice(5, 16).replace('T', ' ').replace('-', '/') : '';
    $('#genAt').textContent = gen ? `맥북 정리 ${gen}` : '';
    // 타일
    const today = todayISO();
    const todayTx = allTx().filter((x) => x.date === today);
    const todaySum = todayTx.reduce((p, x) => p + x.amt, 0);
    $('#todaySpend').textContent = todayTx.length ? won(todaySum) : '0원';
    $('#todaySpendSub').textContent = todayTx.length ? `${todayTx.length}건` : (s.bySrc?.['문자'] ? '아직 승인 없음' : '승인 문자 켜면 실시간');
    const thisM = s.months[s.thisMonth] || { total: 0, count: 0 };
    const mTotal = thisM.total + memoSum(s.thisMonth);
    $('#monthSpend').textContent = koMoney(mTotal);
    const diff = s.toDate.this - s.toDate.last;
    $('#monthSpendSub').innerHTML = `지난달 같은 날보다 <span class="${sgn(diff)}">${diff >= 0 ? '+' : '-'}${esc(koMoney(Math.abs(diff)))}</span>`;
    if (cfg.income > 0) {
      const rate = (1 - mTotal / cfg.income) * 100;
      $('#saveRate').textContent = `${rate.toFixed(0)}%`;
      $('#saveRateSub').textContent = `수입 ${koMoney(cfg.income)} 기준`;
      $('#saveRate').parentElement.classList.toggle('warn', rate < 20);
    } else { $('#saveRate').textContent = '—'; $('#saveRateSub').textContent = '월 수입을 넣으면 나와요'; $('#saveRate').parentElement.classList.remove('warn'); }
    const emer = cfg.emergency != null && cfg.emergency !== '' ? Number(cfg.emergency) : (t.cashKRW + (a.allocation.find((x) => x.kind === '상품권')?.krw || 0));
    const avg = s.avgMonthly6 || thisM.total || 0;
    const months = avg ? emer / avg : null;
    $('#emergency').textContent = months == null ? '—' : `${months.toFixed(1)}개월`;
    $('#emergencySub').textContent = `${koMoney(emer)} · 3개월이 목표`;
    $('#emergency').parentElement.classList.toggle('warn', months != null && months < 3);
    // 최근 지출 3건
    const rec = allTx().slice(0, 3);
    $('#recentList').innerHTML = rec.length ? rec.map(miniRow).join('') : '<li class="empty"><b>아직 거래가 없어요</b>카드 명세서나 승인 문자가 들어오면 보여요</li>';
    renderTodo();
  }
  function miniRow(t) {     // 오늘 탭용 한 줄: 가맹점 · 시각·분류(작게) | 금액
    const when = t.date === todayISO() ? (t.time || '오늘') : t.date.slice(5).replace('-', '/');
    return `<li class="mini-row"><span class="t">${esc(t.merchant)} <small>${esc(when)} · ${esc(t.cat)}${t.src === '메모' ? ` · <span class="m">메모${t._pending ? ' 올리는 중' : ''}</span>` : ''}${t.sale === '취소' ? ' · 취소' : ''}</small></span><span class="a ${t.amt < 0 ? 'loss' : ''}">${esc(won(t.amt))}</span></li>`;
  }
  function txRow(t) {
    return `<li class="row"><div class="t">${esc(t.merchant)}</div><div class="s">${esc(t.date.slice(5).replace('-', '/'))}${t.time ? ' ' + esc(t.time) : ''} <span class="chip">${esc(t.cat)}</span>${t.src === '메모' ? `<span class="chip gold">메모${t._pending ? ' · 올리는 중' : ''}</span>` : t.src !== '명세서' ? `<span class="chip src">${esc(t.src)}</span>` : ''}${t.sale === '취소' ? '<span class="chip warn">취소</span>' : ''}</div><div class="a ${t.amt < 0 ? 'loss' : ''}">${esc(won(t.amt))}</div></li>`;
  }

  // ── 오늘 할 일 3개 (시간대·요일·자료 상태로 순서를 정한다) ──
  function todayEntries() { const d = todayISO(); return allEntries().filter((e) => (e.at || '').slice(0, 10) === d); }
  function todoItems() {
    const n = nowD(), h = n.getHours(), dow = n.getDay(), wk = dow >= 1 && dow <= 5;
    const es = todayEntries();
    const planned = es.some((e) => e.type === '계획'), logged = es.some((e) => e.type !== '계획');
    const t = data.assets.totals, items = [];
    if (dow === 0) items.push({ id: 'review', pri: 120, title: '주간 복기 하기', sub: '일요일 · 점수·반복 실수 확인', tab: 'review' });
    const bAt = latestBriefAt(), seen = bAt && bAt <= store.get('sa.seenBrief', '');
    items.push({ id: 'check', pri: wk && h < 9 ? 110 : (wk && h >= 22) ? 100 : wk && h < 16 ? 70 : 25, title: '장전 조언 보기', sub: !bAt ? '맥북이 07:00·22:00에 써요' : seen ? (planned ? '확인함 · 계획 저장됨' : '확인함') : '새 브리핑 · 주문 전에', done: !!seen, tab: 'advice' });
    items.push({ id: 'log', pri: h >= 15 ? 90 : 55, title: '기록 남기기', sub: logged ? `오늘 ${es.length}건 남김` : '매매·관망 한 줄이면 돼요', done: logged, act: openJournal });
    if (t.unknown?.length) items.push({ id: 'capture', pri: h >= 15 ? 95 : 80, warn: true, title: '예수금 캡처 반영 필요', sub: '잔고 캡처 → "캡처 반영해줘"', act: () => openGuide('capture') });
    const gen = data.generatedAt ? new Date(data.generatedAt) : null;
    if (gen && (n - gen) > 36 * 36e5) items.push({ id: 'stale', pri: 85, warn: true, title: '맥북 정리가 멈췄어요', sub: `마지막 ${data.generatedAt.slice(5, 10).replace('-', '/')}`, act: () => load() });
    if (!(cfg.income > 0)) items.push({ id: 'income', pri: 30, title: '월 수입 넣기', sub: '저축률 계산', act: openSettings });
    return items.sort((x, y) => (!!x.done - !!y.done) || (y.pri - x.pri)).slice(0, 3);
  }
  let todoActs = {};
  function renderTodo() {
    const items = todoItems(); todoActs = {};
    $('#todo').innerHTML = items.map((it, i) => { todoActs[it.id] = it; return `<button type="button" class="todo-btn${it.done ? ' is-done' : ''}${it.warn ? ' is-warn' : ''}" data-todo="${it.id}"><span class="n">${it.done ? '✓' : it.warn ? '!' : i + 1}</span><span class="tt">${esc(it.title)}</span><span class="ts">${esc(it.sub)}</span><span class="ar" aria-hidden="true">›</span></button>`; }).join('');
  }
  function renderBadges() {
    if (!data) return;
    const n = nowD(), h = n.getHours(), dow = n.getDay();
    const bAt = latestBriefAt(), unseen = !!bAt && curTab !== 'advice' && bAt > store.get('sa.seenBrief', '');
    const b1 = $('.nav-btn[data-tab="advice"] .badge'), b2 = $('.nav-btn[data-tab="review"] .badge');
    b1.hidden = !unseen; b1.closest('.nav-btn').setAttribute('aria-label', unseen ? '조언 (새 장전 브리핑)' : '조언');
    b2.hidden = dow !== 0; b2.closest('.nav-btn').setAttribute('aria-label', dow === 0 ? '복기 (일요일 — 주간 복기)' : '복기');
  }

  function renderSpend() {
    const s = data.spending, keys = Object.keys(s.months).sort();
    if (!keys.includes(spendMonth)) spendMonth = keys[keys.length - 1] || s.thisMonth;
    const i = keys.indexOf(spendMonth);
    $('#mPrev').disabled = i <= 0; $('#mNext').disabled = i >= keys.length - 1;
    $('#mLabel').textContent = monthKo(spendMonth);
    const m0 = s.months[spendMonth] || { total: 0, count: 0, byCat: {}, partial: false };
    const txs = monthTxs(spendMonth), memoTx = txs.filter((t) => t.src === '메모');
    const byCat = { ...(m0.byCat || {}) }; memoTx.forEach((t) => { byCat[t.cat] = (byCat[t.cat] || 0) + t.amt; });
    const total = m0.total + memoTx.reduce((p, t) => p + t.amt, 0);
    $('#mTotal').textContent = koMoney(total);
    const prevKey = keys[i - 1], prev = prevKey ? s.months[prevKey] : null;
    const isThis = spendMonth === s.thisMonth;
    let cmp = '';
    if (isThis) { const d = s.toDate.this - s.toDate.last; cmp = `지난달 같은 날(${s.toDate.day}일)까지보다 <span class="${sgn(d)}">${d >= 0 ? '+' : '-'}${esc(koMoney(Math.abs(d)))}</span>`; }
    else if (prev) cmp = `전달 대비 <span class="${sgn(m0.total - prev.total)}">${esc(pct((m0.total / (prev.total || 1) - 1) * 100, 0))}</span>`;
    $('#mSub').innerHTML = [`${m0.count + memoTx.length}건`, cmp, m0.partial ? '<span class="chip warn">일부만(뷰어 OCR)</span>' : ''].filter(Boolean).join(' · ');
    // 남은 예산
    const bb = $('#budgetBox');
    if (isThis) {
      const n = nowD(), last = new Date(n.getFullYear(), n.getMonth() + 1, 0).getDate(), left = last - n.getDate() + 1;
      const base = cfg.budget > 0 ? cfg.budget : s.avgMonthly6 || 0, isB = cfg.budget > 0;
      if (base) {
        const remain = base - total, used = Math.min(100, total / base * 100);
        const lab = remain >= 0 ? (isB ? '남은 예산' : '6개월 평균까지 남은 돈') : (isB ? '예산 초과' : '6개월 평균보다 더 씀');
        bb.innerHTML = `<div class="meter"><i class="${remain < 0 ? 'over' : ''}" data-w="${used.toFixed(1)}"></i></div><div class="budget-line"><span>${lab}</span><b class="${remain < 0 ? 'gain' : ''}">${esc(koMoney(Math.abs(remain)))}</b><span class="mute">${remain > 0 ? `${left}일 · 하루 ${esc(koMoney(remain / left))}` : ''}</span></div>${isB ? '' : '<button id="setBudget" class="text-btn small-link" type="button">예산 정하기</button>'}`;
      } else bb.innerHTML = '<button id="setBudget" class="text-btn small-link" type="button">예산을 정하면 남은 돈이 보여요</button>';
      paint(bb);
    } else bb.innerHTML = s.avgMonthly6 ? `<p class="hint m0">6개월 평균 ${esc(koMoney(s.avgMonthly6))}</p>` : '';
    // 카테고리 막대 (누르면 목록이 그 분류만)
    const cats = Object.entries(byCat).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    const max = cats[0]?.[1] || 1;
    $('#catBars').innerHTML = cats.length ? cats.map(([k, v]) => `<button type="button" class="bar${k === txCat ? ' is-on' : ''}" data-cat="${esc(k)}"><span class="lab">${esc(k)}</span><span class="trk"><span class="fil${k === '기타' ? ' gold' : ''}" data-w="${(v / max * 100).toFixed(1)}"></span></span><span class="val">${esc(koMoney(v))} <span class="mute">${(v / (total || 1) * 100).toFixed(0)}%</span></span></button>`).join('') : '<div class="empty">이 달 거래가 없어요</div>';
    paint($('#catBars'));
    // TOP5 (접힘)
    const top = {};
    txs.filter((t) => t.amt > 0).forEach((t) => { const k = t.merchant.slice(0, 10); top[k] = top[k] || { merchant: t.merchant, amt: 0, count: 0, cat: t.cat }; top[k].amt += t.amt; top[k].count++; });
    const top5 = Object.values(top).sort((a, b) => b.amt - a.amt).slice(0, 5);
    $('#topNote').textContent = txs.length < m0.count ? `상세 ${txs.length}/${m0.count}건` : (top5[0] ? `1위 ${top5[0].merchant.slice(0, 8)}` : '');
    const topRow = (t, n) => `<li class="row"><div class="t">${n + 1}. ${esc(t.merchant)}</div><div class="s">${t.count}번 <span class="chip">${esc(t.cat)}</span></div><div class="a">${esc(won(t.amt))}</div></li>`;
    $('#topList').innerHTML = top5.length ? top5.map(topRow).join('')
      : (s.topMerchants3m?.length ? '<li class="empty">이 달 상세가 없어 최근 3개월 기준</li>' + s.topMerchants3m.slice(0, 5).map(topRow).join('') : '<li class="empty">없음</li>');
    // 반복 결제 + 겹침·이중 결제 경고 (경고는 접힌 상자 위에 한 줄로)
    const rec = s.recurring || [];
    const warns = [], groups = {};
    rec.forEach((r) => { for (const [g, re] of Object.entries(SUB_GROUPS)) if (re.test(r.merchant)) (groups[g] = groups[g] || []).push(r); });
    for (const [g, lst] of Object.entries(groups)) if (lst.length >= 2) warns.push(`${g} ${lst.length}개 겹침: ${lst.map((r) => r.merchant.slice(0, 10)).join(', ')} — 하나로 줄일 수 있나?`);
    const dbl = {};
    txs.filter((t) => t.amt > 0).forEach((t) => { const k = `${t.merchant.slice(0, 8)}|${t.amt}`; dbl[k] = (dbl[k] || 0) + 1; });
    Object.entries(dbl).forEach(([k, n]) => { if (n >= 2 && rec.some((r) => k.startsWith(r.merchant.slice(0, 8)))) warns.push(`${k.split('|')[0]} 같은 금액이 이 달 ${n}번 — 이중 결제?`); });
    $('#dupWarn').innerHTML = warns.map((w) => `<div class="banner is-err inline">${esc(w)}</div>`).join('');
    $('#spendAlerts').innerHTML = warns.length ? `<button id="alertLine" type="button" class="warn-line solo"><span class="wi">!</span><span><b>확인할 결제 ${warns.length}건</b> — ${esc(warns[0].split(' — ')[0])}${warns.length > 1 ? ' 외' : ''}</span><span class="ar">›</span></button>` : '';
    const recSum = rec.reduce((p, r) => p + r.amt, 0);
    $('#recurNote').textContent = rec.length ? `${rec.length}건 · 월 ${koMoney(recSum)}` : '';
    $('#recurList').innerHTML = rec.length ? rec.slice(0, 15).map((r) => `<li class="row"><div class="t">${esc(r.merchant)}</div><div class="s">${r.months}개월째 · 마지막 ${esc(r.last.slice(5).replace('-', '/'))} <span class="chip">${esc(r.cat)}</span></div><div class="a">${esc(won(r.amt))}</div></li>`).join('') + `<li class="row"><div class="t"><b>합계 (월)</b></div><div class="s">${rec.length}건</div><div class="a">${esc(won(recSum))}</div></li>` : '<li class="empty">3개월 이상 반복된 결제가 아직 없어요</li>';
    // 거래 목록 (날짜 묶음)
    const chips = ['전체', ...new Set(txs.map((t) => t.cat))];
    $('#catChips').innerHTML = chips.map((c) => `<button type="button" data-cat="${esc(c === '전체' ? '' : c)}" class="${(c === '전체' ? '' : c) === txCat ? 'is-on' : ''}">${esc(c)}</button>`).join('');
    const q = txFilter.trim();
    const list = txs.filter((t) => (!txCat || t.cat === txCat) && (!q || t.merchant.includes(q) || t.cat.includes(q)));
    $('#txNote').textContent = `${txCat ? txCat + ' · ' : ''}${list.length}건`;
    const shown = list.slice(0, txShown), daySum = {};
    list.forEach((t) => { daySum[t.date] = (daySum[t.date] || 0) + t.amt; });
    let html = '', cur = '';
    for (const t of shown) { if (t.date !== cur) { cur = t.date; html += `<li class="day-head"><span>${esc(dateKo(t.date))}</span><span>${esc(won(daySum[t.date]))}</span></li>`; } html += txRow(t); }
    $('#txList').innerHTML = list.length ? html : '<li class="empty">맞는 거래가 없어요</li>';
    $('#txMore').hidden = list.length <= txShown;
  }

  function renderInvest() {
    const a = data.assets, t = a.totals;
    $('#invNum').textContent = koMoney(t.investKRW);
    const pr = t.buyKRW ? (t.investKRW / t.buyKRW - 1) * 100 : null, dc = dayChange();
    $('#invPnl').innerHTML = `<span class="${sgn(t.pnlKRW)}">${arrow(t.pnlKRW)} ${esc(koMoney(Math.abs(t.pnlKRW)))} <small>(${esc(pct(pr))})</small></span>${dc ? `<em>오늘 <span class="${sgn(dc.krw)}">${dc.krw >= 0 ? '+' : '-'}${esc(koMoney(Math.abs(dc.krw)))}</span></em>` : ''}`;
    $('#invBuy').textContent = koMoney(t.buyKRW);
    $('#invFx').textContent = a.fx ? `${num(a.fx.rate, 1)}원` : '—';
    $('#invAsOf').textContent = a.asOf ? `기준 ${a.asOf.slice(5).replace('-', '/')}` : '';
    // 비중·리밸런싱 한 줄
    const alloc = a.allocation || [];
    $('#allocBars').innerHTML = alloc.map((x) => { const tg = cfg.targets[x.kind]; return `<div class="bar"><button type="button" class="lab text-btn lab-btn" data-kind="${esc(x.kind)}">${esc(x.kind)}</button><span class="trk"><span class="fil${tg != null && Math.abs(x.pct - tg) >= 5 ? ' coral' : ''}" data-w="${Math.min(100, x.pct).toFixed(1)}"></span>${tg != null ? `<span class="tgt" data-left="${Math.min(100, tg)}"></span>` : ''}</span><span class="val">${x.pct}%${tg != null ? ` <span class="mute">/ ${tg}</span>` : ''}</span></div>`; }).join('');
    paint($('#allocBars'));
    const off = alloc.filter((x) => cfg.targets[x.kind] != null && Math.abs(x.pct - cfg.targets[x.kind]) >= 5).sort((x, y) => Math.abs(y.pct - cfg.targets[y.kind]) - Math.abs(x.pct - cfg.targets[x.kind]));
    const hasTg = Object.keys(cfg.targets).length > 0;
    if (off.length) {
      const x = off[0], d = x.pct - cfg.targets[x.kind];
      $('#rebalance').innerHTML = `<div class="rebal-line"><span class="wi">!</span><span><b>${esc(x.kind)} ${x.pct}% → 목표 ${cfg.targets[x.kind]}%</b> · ${d > 0 ? '줄이기' : '늘리기'} ${Math.abs(d).toFixed(1)}%p ≈ ${esc(koMoney(Math.abs(d) / 100 * t.totalKRW))}${off.length > 1 ? ` <span class="mute">외 ${off.length - 1}개</span>` : ''}</span></div>`;
    } else $('#rebalance').innerHTML = hasTg ? '<p class="msg ok">목표 범위(±5%p) 안이에요</p>' : '<p class="hint small m0">목표 비중을 정하면 5%p 벌어질 때 알려줘요</p>';
    // 계좌 (접고 펼치기)
    const html = [], safe = [];
    for (const acc of a.accounts) {
      if (acc.holdings) {
        html.push(`<details class="card fold acc"><summary><span class="acc-name">${esc(acc.name)} <span class="mute">${acc.holdings.length}종목</span></span><span class="acc-v">${esc(koMoney(acc.evalKRW))} <small class="${sgn(acc.pnlPct)}">${esc(pct(acc.pnlPct))}</small></span></summary><ul class="list">` +
          acc.holdings.map((h) => `<li class="row"><div class="t">${esc(h.name)} <span class="mute">${esc(h.code)}</span></div><div class="s">${esc(num(h.qty))}주 × ${esc(price(h.cur, acc.currency))} <span class="${sgn(h.chgPct)}">${esc(pct(h.chgPct))}</span> · 평단 ${esc(price(h.avg, acc.currency))}${h.status && h.status !== 'CLOSE' ? ` <span class="chip">${esc(h.status)}</span>` : ''}</div><div class="a">${esc(koMoney(h.evalKRW))}<small class="${sgn(h.pnlPct)}">${esc(pct(h.pnlPct))} ${esc(koMoney(h.pnlKRW))}</small></div></li>`).join('') +
          `</ul><p class="hint small">시세 ${esc((acc.holdings[0]?.curAsOf || '').slice(0, 16).replace('T', ' '))} · 매입 ${esc(koMoney(acc.buyKRW))}</p></details>`);
      } else safe.push(acc);
    }
    if (safe.length) {
      const miss = safe.filter((x) => (x.balance ?? x.refund) == null).length;
      const sum = safe.reduce((p, x) => p + (x.balance ?? x.refund ?? 0), 0);
      html.push(`<details class="card fold acc"><summary><span class="acc-name">현금·안전자산 <span class="mute">${safe.length}개</span></span><span class="acc-v">${esc(koMoney(sum))}${miss ? ' <span class="chip warn">캡처 필요</span>' : ''}</span></summary><ul class="list">` +
        safe.map((acc) => { const v = acc.balance ?? acc.refund; return `<li class="row"><div class="t">${esc(acc.name)}</div><div class="s">${esc(acc.kind)}${acc.monthly ? ` · 매달 ${esc(koMoney(acc.monthly))}` : ''}${acc.rate != null ? ` · ${esc(acc.rate)}%` : ''}${acc.paid != null ? ` · 납입 ${esc(koMoney(acc.paid))}` : ''}${acc.asOf ? ` · ${esc(acc.asOf.slice(5).replace('-', '/'))}` : ''}</div><div class="a">${v == null ? '<span class="chip warn">캡처 필요</span>' : esc(won(v))}${acc.refund != null ? '<small>해지환급금</small>' : ''}</div></li>`; }).join('') + '</ul></details>');
    }
    $('#accounts').innerHTML = html.join('');
    $('#holdingNames').innerHTML = a.accounts.flatMap((x) => x.holdings || []).map((h) => `<option value="${esc(h.code)}">${esc(h.name)}</option>`).join('');
  }

  // ── 매매일지·지출 메모 (같은 대기열로 저장소에 한 줄씩) ──
  const journalPath = (ym) => `${cfg.dir}/매매일지/${ym}.jsonl`;
  const memoPath = (ym) => `${cfg.dir}/지출메모/${ym}.jsonl`;
  const condPath = (ym) => `${cfg.dir}/컨디션/${ym}.json`;
  const pathOf = (kind, ym) => kind === 'memo' ? memoPath(ym) : journalPath(ym);
  const boxOf = (kind) => kind === 'memo' ? memos : journal;
  function parseJsonl(text) { return text.split('\n').filter((l) => l.trim()).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); }
  async function loadJournal() {
    const now = nowD(), months = [monthOf(now), monthOf(new Date(now.getFullYear(), now.getMonth() - 1, 1))];
    for (const ym of months) {
      const f = await getFile(journalPath(ym));
      journal[ym] = f ? { entries: parseJsonl(f.text), sha: f.sha } : { entries: [], sha: null };
      const g = await getFile(memoPath(ym));
      memos[ym] = g ? { entries: parseJsonl(g.text), sha: g.sha } : { entries: [], sha: null };
      const c = await getFile(condPath(ym));
      let days = {}; if (c) { try { days = JSON.parse(c.text).days || {}; } catch { /* 깨진 파일은 빈 달로 */ } }
      conds[ym] = { days, sha: c ? c.sha : null };
    }
    store.set('sa.journal', journal); store.set('sa.memos', memos); store.set('sa.conds', conds);
  }
  function allEntries() {
    const seen = new Set(); const out = [];
    for (const ym of Object.keys(journal)) for (const e of journal[ym].entries) if (!seen.has(e.id)) { seen.add(e.id); out.push(e); }
    for (const q of queue) if ((q.kind || 'journal') === 'journal' && !seen.has(q.entry.id)) { seen.add(q.entry.id); out.push({ ...q.entry, _pending: true }); }
    return out.sort((x, y) => (x.at < y.at ? 1 : -1));
  }
  function entryLine(e) {
    const meta = [e.type, e.qty ? `${num(e.qty)}주` : '', e.price ? price(e.price, e.ccy) : '', e.planned === true ? '계획대로' : e.planned === false ? '계획 밖' : '', e.rule != null ? `규칙 ${e.rule}/10` : ''].filter(Boolean).join(' · ');
    const tags = (e.mistakes || []).map((m) => `<span class="chip warn">${esc(m)}</span>`).join('');
    return `<li class="row"><div class="t">${esc(e.name || '')} <span class="mute">${esc((e.at || '').slice(5, 10).replace('-', '/'))}</span>${e._pending ? '<span class="chip gold">올리는 중</span>' : ''}</div><div class="s">${esc(meta)} ${tags}${e.fix ? `<br>교정: ${esc(e.fix)}` : ''}</div><div class="a">${e.type === '매수' ? '<span class="gain">▲</span>' : e.type === '매도' ? '<span class="loss">▼</span>' : '◇'}</div></li>`;
  }
  function renderJournal() {
    const es = allEntries();
    const nq = queue.length;
    $('#journalNote').textContent = nq ? `대기 ${nq}` : (es.length ? `최근 3 / ${es.length}건` : '');
    $('#journalList').innerHTML = es.length ? es.slice(0, 3).map(entryLine).join('') : '<li class="empty"><b>아직 기록이 없어요</b>오른쪽 아래 + 로 언제든 한 줄 남겨요</li>';
  }
  function enqueue(kind, entry, label) {
    queue.push({ kind, month: (entry.date || entry.at).slice(0, 7), entry, holdUntil: Date.now() + UNDO_MS }); store.set('sa.queue', queue);
    lastSaved = entry.id;
    if (data) { renderToday(); renderSpend(); renderJournal(); renderReview(); renderBadges(); }
    showToast(`${label} 저장했어요`, true);
    clearTimeout(flushTimer); flushTimer = setTimeout(flush, UNDO_MS + 50);
  }
  function undoLast() {
    const i = queue.findIndex((q) => q.entry.id === lastSaved);
    if (i < 0 || (i === 0 && flushing)) { showToast('이미 저장소에 올라가서 되돌릴 수 없어요'); return; }
    queue.splice(i, 1); store.set('sa.queue', queue); lastSaved = null;
    if (data) renderAll();
    showToast('되돌렸어요');
  }
  function showToast(msg, undo) {
    const t = $('#toast'); $('#toastMsg').textContent = msg; $('#toastUndo').hidden = !undo; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, undo ? UNDO_MS : 2200);
  }
  async function flush() {
    if (flushing || !queue.length || !cfg.token) return;
    flushing = true;
    try {
      while (queue.length) {
        const op = queue[0], kind = op.kind || 'journal';
        const wait = (op.holdUntil || 0) - Date.now();
        if (wait > 0) { clearTimeout(flushTimer); flushTimer = setTimeout(flush, wait + 50); break; }
        if (kind === 'cond') {          // 컨디션: 달 파일(JSON)의 그날 값만 바꾼다(다시 누르면 덮어씀)
          const path = condPath(op.month);
          let obj = { version: 1, days: {} }, sha = null;
          const f = await getFile(path);
          if (f) { sha = f.sha; try { obj = JSON.parse(f.text); } catch { /* 새로 */ } }
          obj.days = obj.days || {};
          const cur = obj.days[op.entry.date];
          if (!cur || (cur.at || '') <= op.entry.at) obj.days[op.entry.date] = { v: op.entry.v, at: op.entry.at };
          try { sha = await putFile(path, JSON.stringify(obj, null, 1) + '\n', sha, `컨디션 ${op.entry.date} ${op.entry.v}`); }
          catch (e) { if (e.status === 409 || e.status === 422) continue; throw e; }
          conds[op.month] = { days: obj.days, sha };
          queue.shift(); store.set('sa.queue', queue); store.set('sa.conds', conds);
          setPill('기록 올림', 'is-ok');
          continue;
        }
        const box = boxOf(kind), path = pathOf(kind, op.month);
        const cur = box[op.month] || { entries: [], sha: null };
        let text = '', sha = cur.sha;
        try {
          const f = await getFile(path);
          if (f) { text = f.text; sha = f.sha; cur.entries = parseJsonl(f.text); } else { text = ''; sha = null; }
        } catch (e) { if (e.status !== 404) throw e; }
        if (!cur.entries.some((x) => x.id === op.entry.id)) {
          const body = (text && !text.endsWith('\n') ? text + '\n' : text) + JSON.stringify(op.entry) + '\n';
          const msg = kind === 'memo' ? `지출메모 ${op.entry.amt}원 ${op.entry.date}` : `매매일지 ${op.entry.type} ${op.entry.name || ''} ${op.entry.at.slice(0, 10)}`;
          try { sha = await putFile(path, body, sha, msg); }
          catch (e) { if (e.status === 409 || e.status === 422) continue; throw e; }   // 다시 읽어서 재시도
          cur.entries.push(op.entry);
        }
        cur.sha = sha; box[op.month] = cur;
        queue.shift(); store.set('sa.queue', queue); store.set('sa.journal', journal); store.set('sa.memos', memos);
        setPill('기록 올림', 'is-ok');
      }
      lastError = '';
    } catch (e) {
      lastError = e.message; setPill(`대기 ${queue.length}`, 'is-err');
      showBanner(`기록을 아직 못 올렸어요(${esc(e.message)}). 휴대폰에 담아뒀다가 다시 올릴게요. <button id="retryBtn" type="button">다시 시도</button>`, 'is-err');
      $('#retryBtn').onclick = () => { hideBanner(); flush(); };
    } finally { flushing = false; if (data) { renderAdvice(); renderToday(); renderJournal(); renderReview(); renderBadges(); } }
  }

  // ── 매매 전 체크 (코덱스 플레이북 순서: 스타일·보유기간 → 트리거 → 무효화 → 허용손실·계좌 → 수량) ──
  const CK = ['ckName', 'ckStyle', 'ckHold', 'ckSide', 'ckTrigger', 'ckInvalid', 'ckEntry', 'ckStop', 'ckAccount', 'ckRisk', 'ckSlip', 'ckCap', 'ckCcy'];
  const STEPS = [[['ckName', '종목']], [['ckStyle', '스타일'], ['ckHold', '보유기간']], [['ckTrigger', '트리거']], [['ckInvalid', '무효화'], ['ckEntry', '진입가'], ['ckStop', '손절가']], [['ckAccount', '계좌자산'], ['ckRisk', '거래당 위험률']]];
  function fillSelect(id, list) { const s = $(id); list.forEach((v) => { const o = document.createElement('option'); o.value = v; o.textContent = v; s.appendChild(o); }); }
  function briefLines(text) {
    return String(text || '').split('\n').map((l) => l.trim()).filter((l) => l && !/신혼테크|^📅|안녕하세요|브리핑 해드리고|^#/.test(l));
  }
  function renderCheck() {
    const b = data.brief;
    $('#briefDate').textContent = b?.date ? dateKo(b.date, false) : '';
    const lines = briefLines(b?.text);
    $('#briefHead').textContent = lines.length ? lines.slice(0, 6).join('\n') : '시황 발행본이 아직 없어요. 맥북 정리 스크립트가 최신 글을 넣어줘요.';   // CSS 로 첫 3줄만
    $('#brief').textContent = b?.text || '';
    $('#briefMore').hidden = !lines.length;
    $('#phaseChips').innerHTML = Object.keys(PHASES).map((p) => `<button type="button" data-phase="${p}" class="${p === phase ? 'is-on' : ''}">${p}</button>`).join('');
    $('#phaseInfo').innerHTML = phase ? `<span>관찰</span><div>${esc(PHASES[phase].obs)}</div><span>대응</span><div><b>${esc(PHASES[phase].act)}</b></div>` : '<span class="mute">국면을 고르면 기본 대응이 나와요</span>';
    $('#stopChips').innerHTML = STOP_SIGNALS.map((s, i) => `<button type="button" class="warn ${stops.has(i) ? 'is-on' : ''}" data-stop="${i}">${esc(s)}</button>`).join('');
    $('#stopSummary').textContent = stops.size ? `즉시 중단 신호 ${stops.size}개 켜짐` : '즉시 중단 신호 점검 (7가지)';
    $('#stopVerdict').innerHTML = stops.size ? '<div class="verdict no"><h4>오늘은 신규 거래 중단</h4>위험 먼저 줄이고, 다음 세션은 모의·최소 단위로. 복귀는 손익이 아니라 과정 준수 표본으로.</div>' : '<p class="msg ok">중단 신호 없음</p>';
    const acct = data.assets.totals.investKRW + data.assets.totals.cashKRW;
    if (!$('#ckAccount').value && acct) $('#ckAccount').placeholder = `자동 ${num(acct)}`;
    computeCheck();
  }
  function checkValues() {
    const v = {}; CK.forEach((id) => { v[id] = $('#' + id).value.trim(); });
    if (!v.ckAccount) v.ckAccount = String(data.assets.totals.investKRW + data.assets.totals.cashKRW || '');
    return v;
  }
  function markSteps(v) {
    const missing = [];
    STEPS.forEach((fields, i) => {
      const miss = fields.filter(([k]) => !v[k]).map(([, n]) => n);
      const el = $(`.step[data-step="${i}"]`);
      el.classList.toggle('is-done', !miss.length); el.classList.toggle('is-missing', !!miss.length);
      $('.st', el).textContent = miss.length ? `빠짐: ${miss[0]}${miss.length > 1 ? ` 외 ${miss.length - 1}` : ''}` : '✓';
      missing.push(...miss);
    });
    return missing;
  }
  function computeCheck() {
    const v = checkValues();
    const missing = markSteps(v);
    const box = $('#verdict'); const saveBtn = $('#savePlan');
    const no = (html) => { box.className = 'verdict no'; box.innerHTML = '<h4>거래 금지</h4>' + html; saveBtn.disabled = true; return null; };
    if (stops.size) return no('즉시 중단 신호가 켜져 있어요. 오늘은 계획만 적고 주문은 하지 않아요.');
    if (missing.length) return no(`빠진 칸: <b>${esc(missing.join(', '))}</b><ul><li>"좋아 보인다"는 트리거가 아니에요.</li><li>"본전 오면 판다"는 무효화가 아니에요.</li></ul>`);
    const entry = +v.ckEntry, stop = +v.ckStop, account = +v.ckAccount, risk = +v.ckRisk, slip = +v.ckSlip || 0, cap = +v.ckCap || 100;
    const fx = v.ckCcy === 'USD' ? (data.assets.fx?.rate || 1330) : 1;
    if (!(entry > 0) || !(stop > 0) || !(account > 0) || !(risk > 0)) return no('진입가·손절가·계좌자산·위험률은 0보다 커야 해요.');
    if (entry === stop) return no('진입가와 손절가가 같아요. 무효화 가격을 정해요.');
    if ((v.ckSide === '매수' && stop > entry) || (v.ckSide === '매도' && stop < entry)) return no(`${v.ckSide}인데 손절가가 ${v.ckSide === '매수' ? '진입가보다 위' : '진입가보다 아래'}예요.`);
    const allowed = account * risk / 100;
    const perShare = (Math.abs(entry - stop) + entry * slip / 100) * fx;
    const baseQty = Math.floor(allowed / perShare);
    const capQty = Math.floor(account * cap / 100 / (entry * fx));
    const qty = Math.max(0, Math.min(baseQty, capQty));
    const position = qty * entry * fx;
    const r = { qty, baseQty, capQty, allowed, perShare, position, pctOfAccount: position / account * 100, lossAtStop: qty * Math.abs(entry - stop) * fx, fx };
    if (qty <= 0) return no(`허용손실 ${esc(won(allowed))}으로는 1주도 못 사요(주당 위험 ${esc(won(perShare))}). 손절폭을 좁히거나 이번엔 쉬어요.`);
    box.className = 'verdict ok';
    box.innerHTML = `<h4>거래 가능 · 최종 수량</h4><div class="big">수량 ${num(qty)}주</div><div class="kv">` +
      `<span>허용손실</span><b>${esc(won(allowed))} (${risk}%)</b><span>주당 위험</span><b>${esc(won(perShare))}</b><span>기본 수량</span><b>${num(baseQty)}주</b><span>단일종목 한도</span><b>${num(capQty)}주 (${cap}%)</b>` +
      `<span>포지션</span><b>${esc(koMoney(position))} · ${r.pctOfAccount.toFixed(1)}%</b><span>손절 시 손실</span><b>-${esc(koMoney(r.lossAtStop))}</b>${v.ckCcy === 'USD' ? `<span>환율</span><b>${num(fx, 1)}원</b>` : ''}</div>` +
      `<p class="small">주문 전: 생활비·비상금 안 섞였나 · 불리하게 체결돼도 감당되나 · 같은 방향 포지션 합산했나 · 야간·실적 갭</p>`;
    saveBtn.disabled = false;
    return r;
  }
  function savePlan() {
    const r = computeCheck(); if (!r) return;
    const v = checkValues(); const d = nowD();
    enqueue('journal', { id: makeId(d), at: isoLocal(d), type: '계획', side: v.ckSide, name: v.ckName, style: v.ckStyle, hold: v.ckHold, trigger: v.ckTrigger, invalid: v.ckInvalid,
      entry: +v.ckEntry, stop: +v.ckStop, ccy: v.ckCcy, account: +v.ckAccount, riskPct: +v.ckRisk, qty: r.qty, price: +v.ckEntry, phase: phase || null, planned: null }, '계획');
    $('#verdict').insertAdjacentHTML('beforeend', '<p class="small">매매일지에 계획으로 쌓았어요. 체결하면 + 버튼으로 매수/매도를 남겨요.</p>');
  }

  // ── 복기: 이번 주 점수 → 반복 실수 → 교정 행동 한 줄 → 지난 주 비교 ──
  const FIX_HINTS = {
    '손절 취소·확대': '손절가는 주문과 동시에 걸고, 장중엔 넓히지 않기',
    '계획 없는 물타기': '추가 매수는 체크 탭 계획에 적힌 가격에서만',
    '손실 복구용 수량 확대': '손실 난 다음 거래는 수량을 절반으로',
    '전략·보유기간 즉석 변경': '보유기간을 바꾸고 싶으면 그날은 청산만',
    '추격 매수': '트리거 가격이 확인되기 전엔 주문 버튼 누르지 않기',
    '트리거 없이 진입': '트리거 문장을 먼저 적고 나서 주문하기',
    '계획 밖 행동': '체크 탭에서 "수량 N주"가 나온 것만 주문하기',
  };
  function weekStats(off) {
    const [from, to] = weekRange(off);
    const es = allEntries().filter((e) => { const d = (e.at || '').slice(0, 10); return d >= from && d <= to; });
    const trades = es.filter((e) => e.type === '매수' || e.type === '매도');
    const avg = (arr) => arr.length ? arr.reduce((p, x) => p + x, 0) / arr.length : null;
    const ruleAvg = avg(trades.map((e) => e.rule).filter((x) => x != null));
    const procAvg = avg(trades.map((e) => e.process).filter((x) => x != null));
    const plannedArr = trades.filter((e) => e.planned === true || e.planned === false);
    const plannedPct = plannedArr.length ? plannedArr.filter((e) => e.planned).length / plannedArr.length * 100 : null;
    const withSetup = trades.length ? trades.filter((e) => e.trigger && e.invalid).length / trades.length * 100 : null;
    const parts = [ruleAvg != null ? ruleAvg * 10 : null, plannedPct, withSetup].filter((x) => x != null);
    const score = parts.length ? Math.round(avg(parts)) : null;
    const mistakes = {};
    es.forEach((e) => (e.mistakes || []).forEach((m) => { mistakes[m] = (mistakes[m] || 0) + 1; }));
    const topM = Object.entries(mistakes).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const fixCount = {};
    es.filter((e) => e.fix).forEach((e) => { fixCount[e.fix] = (fixCount[e.fix] || 0) + 1; });
    const fix = Object.entries(fixCount).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
    return { from, to, es, trades, score, ruleAvg, procAvg, plannedPct, withSetup, topM, fix, nMistakes: Object.values(mistakes).reduce((p, x) => p + x, 0) };
  }
  function renderReview() {
    const w = weekStats(reviewWeek), p = weekStats(reviewWeek - 1);
    const body = $('#reviewBody');
    $('#principle').textContent = PRINCIPLES[Math.floor(Date.now() / 864e5) % PRINCIPLES.length];
    const title = `<p class="hint top">${esc(dateKo(w.from))} ~ ${esc(dateKo(w.to))}</p>`;
    if (!w.es.length) { body.innerHTML = title + `<div class="card"><div class="empty"><b>이 주엔 기록이 없어요</b>오른쪽 아래 + 로 매수·매도·계획·관망을 남기면 규칙 준수 점수와 반복 실수가 여기 쌓여요.</div></div>`; return; }
    const pf = (x) => x == null ? '—' : x.toFixed(0) + '%';
    const delta = w.score != null && p.score != null ? w.score - p.score : null;
    const fixText = w.fix || (w.topM[0] ? FIX_HINTS[w.topM[0][0]] || '' : '');
    const cmpRow = (lab, a, b, better) => { const d = (a != null && b != null) ? a - b : null; return `<span>${lab}</span><b>${a == null ? '—' : a}</b><b class="mute">${b == null ? '—' : b}</b><b class="${d == null || d === 0 ? 'mute' : (better === 'up' ? d > 0 : d < 0) ? 'good' : 'bad'}">${d == null ? '' : (d > 0 ? '+' : '') + d}</b>`; };
    body.innerHTML = title +
      `<div class="bezel"><div class="inner"><div class="total-label">${reviewWeek === 0 ? '이번 주' : '지난 주'} 규칙 준수 점수</div>` +
      `<div class="score-line"><span class="score-num">${w.score ?? '—'}</span><span class="score-of">/100</span>${delta != null ? `<span class="score-delta ${delta >= 0 ? 'good' : 'bad'}">${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta)} <small>전주 대비</small></span>` : ''}</div>` +
      `<div class="meter"><i data-w="${w.score ?? 0}"></i></div>` +
      `<div class="split-line"><span>거래 <b>${w.trades.length}</b></span><span>계획대로 <b>${pf(w.plannedPct)}</b></span><span>트리거+무효화 <b>${pf(w.withSetup)}</b></span><span>규칙 자평 <b>${w.ruleAvg == null ? '—' : w.ruleAvg.toFixed(1)}</b></span></div></div></div>` +
      `<div class="card"><h3>반복 실수</h3>${w.topM.length ? '<ul class="list">' + w.topM.map(([m, n]) => `<li class="row"><div class="t">${esc(m)}</div><div class="s">${n >= 2 ? '<span class="chip warn">반복</span>' : ''}</div><div class="a">${n}번</div></li>`).join('') + '</ul>' : '<p class="msg ok">기록된 실수 없음</p>'}</div>` +
      `<div class="card fix-card"><h3>다음 주 교정 행동 하나</h3><p class="fix-line">${fixText ? esc(fixText) : '<span class="mute">거래마다 "교정 행동 하나"를 적어요. 한 번에 하나만 고쳐요.</span>'}</p></div>` +
      `<div class="card"><h3>지난 주와 비교</h3><div class="cmp"><span></span><b class="mute">이번</b><b class="mute">지난</b><b class="mute">변화</b>` +
      cmpRow('점수', w.score, p.score, 'up') + cmpRow('거래', w.trades.length, p.trades.length, 'none') + cmpRow('실수', w.nMistakes, p.nMistakes, 'down') +
      cmpRow('계획대로 %', w.plannedPct == null ? null : Math.round(w.plannedPct), p.plannedPct == null ? null : Math.round(p.plannedPct), 'up') + `</div></div>` +
      `<details class="card fold"><summary>이 주 기록 ${w.es.length}건</summary><ul class="list">${w.es.map(entryLine).join('')}</ul></details>`;
    paint(body);
  }

  // ── 설정·테마 ───────────────────────────────────────────
  function saveCfg() { const { ...c } = cfg; store.set('sa.cfg', c); }
  function applyTheme(t) {
    if (!THEMES[t]) t = 'C';
    document.documentElement.dataset.theme = t;
    $('#manifestLink').href = `manifest-${t}.webmanifest`;
    $('#touchIcon').href = `icons/${t}/apple-touch-icon.png`; $('#favIcon').href = `icons/${t}/icon-192.png`; $('#brandIcon').src = `icons/${t}/icon-192.png`;
    $('meta[name=theme-color]').content = THEMES[t].color;
    $('#logoGrid').innerHTML = Object.entries(THEMES).map(([k, v]) => `<button type="button" data-theme="${k}" class="${k === t ? 'is-on' : ''}"><img src="icons/${k}/icon-192.png" alt="" width="52" height="52">${v.name}</button>`).join('');
  }
  function openSettings() {
    $('#repoLabel').textContent = `${cfg.owner}/${cfg.repo}`;
    $('#token').value = cfg.token;
    $('#income').value = cfg.income || ''; $('#budget').value = cfg.budget || ''; $('#emergencyIn').value = cfg.emergency ?? '';
    const q = new URLSearchParams({ name: '시드업자산', description: '시드업자산 앱 — newlywed_tech 저장소 Contents 읽기·쓰기', target_name: cfg.owner, contents: 'write' });
    $('#tokenLink').href = `https://github.com/settings/personal-access-tokens/new?${q}`;
    $('#connectMsg').textContent = ''; $('#mineMsg').textContent = '';
    $('#verLine').textContent = `SEEDUP ASSET v${VERSION} · 저장 공간 ${store.ok ? '정상' : '막힘(사생활 보호 모드?)'}`;
    $('#settings').showModal();
  }
  function openGuide(section) {
    $('#guide').showModal();
    if (section === 'capture') { const c = $$('#guide .card')[1]; c && c.scrollIntoView({ block: 'start' }); }
  }
  async function connect() {
    const tok = $('#token').value.trim(); const msg = $('#connectMsg');
    if (!tok) { msg.textContent = '열쇠를 붙여넣어 주세요'; msg.className = 'msg err'; return; }
    cfg.token = tok; saveCfg(); msg.textContent = '확인 중…'; msg.className = 'msg';
    try {
      const r = await gh(repoPath());
      msg.textContent = `연결됐어요 · ${r.full_name}${r.permissions?.push ? '' : ' (쓰기 권한 없음 — 매매일지는 못 올려요)'}`; msg.className = 'msg ok';
      load();
    } catch (e) { msg.textContent = e.message; msg.className = 'msg err'; }
  }

  // ── 매매일지 시트 ───────────────────────────────────────
  function openJournal() {
    $('#jDate').value = todayISO();
    ['jName', 'jQty', 'jPrice', 'jTrigger', 'jInvalid', 'jRule', 'jProcess', 'jFix', 'jNote'].forEach((id) => { $('#' + id).value = ''; });
    $('#jStyle').value = ''; $('#jHold').value = ''; $('#jType').value = '매수';
    jSel.planned = ''; jSel.emotion = ''; jSel.mistakes.clear();
    renderJournalChips(); $('#jMsg').textContent = ''; $('#journal').showModal();
  }
  function renderJournalChips() {
    $$('#jPlanned button').forEach((b) => b.classList.toggle('is-on', b.dataset.v === jSel.planned));
    $('#jEmotion').innerHTML = EMOTIONS.map((e) => `<button type="button" data-e="${e}" class="${e === jSel.emotion ? 'is-on' : ''}">${e}</button>`).join('');
    $('#jMistakes').innerHTML = ['없음', ...MISTAKES].map((m) => `<button type="button" data-m="${esc(m)}" class="${m === '없음' ? (jSel.mistakes.size ? '' : 'is-on') : 'warn ' + (jSel.mistakes.has(m) ? 'is-on' : '')}">${esc(m)}</button>`).join('');
  }
  function saveJournal() {
    const name = $('#jName').value.trim(); const msg = $('#jMsg');
    if (!name) { msg.textContent = '종목을 적어주세요'; msg.className = 'msg err'; $('#jName').focus(); return; }
    const d = nowD(); const dateV = $('#jDate').value || todayISO();
    const at = dateV === todayISO() ? isoLocal(d) : `${dateV}T12:00:00${isoLocal(d).slice(19)}`;
    const numOr = (id) => { const v = $('#' + id).value.trim(); return v === '' ? null : +v; };
    const type = $('#jType').value;
    $('#journal').close();
    enqueue('journal', { id: makeId(d), at, type, name, ccy: $('#jCcy').value, qty: numOr('jQty'), price: numOr('jPrice'), style: $('#jStyle').value || null, hold: $('#jHold').value || null,
      trigger: $('#jTrigger').value.trim(), invalid: $('#jInvalid').value.trim(), planned: jSel.planned === 'yes' ? true : jSel.planned === 'no' ? false : null,
      emotion: jSel.emotion || null, mistakes: [...jSel.mistakes], rule: numOr('jRule'), process: numOr('jProcess'), fix: $('#jFix').value.trim(), note: $('#jNote').value.trim() }, `매매일지(${type} ${name})`);
  }

  // ── 지출 메모 시트 ──────────────────────────────────────
  function openMemo() {
    ['mAmt', 'mWhere', 'mNote'].forEach((id) => { $('#' + id).value = ''; });
    $('#mDate').value = todayISO(); memoCat = ''; renderMemoCats(); $('#mMsg').textContent = '';
    $('#memo').showModal();
  }
  function renderMemoCats() {
    const s = data?.spending; const used = {};
    (s?.recent || []).forEach((t) => { used[t.cat] = (used[t.cat] || 0) + 1; });
    const cats = Object.keys(used).sort((a, b) => used[b] - used[a]).slice(0, 7);
    if (!cats.includes('기타')) cats.push('기타');
    $('#mCats').innerHTML = cats.map((c) => `<button type="button" data-c="${esc(c)}" class="${c === memoCat ? 'is-on' : ''}">${esc(c)}</button>`).join('');
  }
  function saveMemo() {
    const amt = Math.round(+$('#mAmt').value); const msg = $('#mMsg');
    if (!(amt > 0)) { msg.textContent = '금액을 적어주세요'; msg.className = 'msg err'; $('#mAmt').focus(); return; }
    const d = nowD(); const date = $('#mDate').value || todayISO();
    $('#memo').close();
    enqueue('memo', { id: makeId(d), at: isoLocal(d), date, amt, merchant: $('#mWhere').value.trim() || '지출 메모', cat: memoCat || '기타', note: $('#mNote').value.trim() }, `지출 메모 ${won(amt)}`);
  }

  // ── 목표 비중 ───────────────────────────────────────────
  function openTargets(focusKind) {
    const alloc = data.assets.allocation || [];
    $('#targetForm').innerHTML = alloc.map((x) => `<label class="lbl" for="tg-${esc(x.kind)}">${esc(x.kind)} (지금 ${x.pct}%)</label><input id="tg-${esc(x.kind)}" class="field" type="number" inputmode="decimal" min="0" max="100" step="1" data-kind="${esc(x.kind)}" value="${cfg.targets[x.kind] ?? ''}" placeholder="목표 %">`).join('');
    $('#targetSheet').showModal();
    if (focusKind) { const i = $(`#targetForm input[data-kind="${CSS.escape(focusKind)}"]`); i && i.focus(); }
  }

  // ── 화면 전환·이벤트 ────────────────────────────────────
  function showTab(name) {
    if (name === 'check') { name = 'advice'; $('#planFold').open = true; }     // 옛 '체크' 탭 → 조언 탭 안 '직접 계획'
    if (!$(`#tab-${name}`)) name = 'advice';
    curTab = name;
    $$('.tab').forEach((t) => t.classList.toggle('is-active', t.id === `tab-${name}`));
    $$('.nav-btn').forEach((b) => b.classList.toggle('is-active', b.dataset.tab === name));
    store.set('sa.tab', name); window.scrollTo({ top: 0 });
    if (name === 'advice') markBriefSeen();
    if (data) renderBadges();
  }
  function bind() {
    $$('.nav-btn').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
    $('#openSettings').addEventListener('click', openSettings);
    $$('[data-close]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));
    $$('dialog.sheet').forEach((d) => d.addEventListener('click', (e) => { if (e.target === d) d.close(); }));   // 바깥 누르면 닫기
    $('#connectBtn').addEventListener('click', connect);
    $('#syncPill').addEventListener('click', () => load());
    $('#refreshBtn').addEventListener('click', () => { $('#settings').close(); load(); });
    $('#unlockBtn').addEventListener('click', () => {
      const v = $('#pin').value.trim();
      if (!/^\d{4,8}$/.test(v)) { const m = $('#lockMsg'); m.textContent = 'PIN은 숫자 4~8자리예요'; m.className = 'msg err'; return; }
      sessionPin = v; cfg.rememberPin = $('#rememberPin').checked; if (cfg.rememberPin) cfg.pin = v; saveCfg(); $('#pin').value = ''; load();
    });
    $('#pin').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#unlockBtn').click(); });
    $('#pinForget').addEventListener('click', () => { cfg.pin = ''; sessionPin = ''; data = null; saveCfg(); $('#settings').close(); load(); });
    $('#forgetBtn').addEventListener('click', () => {
      if (!confirm('이 휴대폰의 열쇠·PIN·담아둔 자료·대기 중인 기록을 모두 지울까요? (저장소의 자료는 그대로예요)')) return;
      ['sa.cfg', 'sa.enc', 'sa.journal', 'sa.memos', 'sa.conds', 'sa.queue', 'sa.check', 'sa.tab', 'sa.seenBrief'].forEach((k) => store.del(k));
      try { Object.keys(localStorage).filter((k) => k.startsWith('sa.chart.')).forEach((k) => store.del(k)); } catch { /* 무시 */ }
      cfg = { ...DEFAULT_CFG, theme: cfg.theme }; sessionPin = ''; data = null; journal = {}; memos = {}; conds = {}; queue = []; saveCfg(); $('#settings').close(); load();
    });
    $('#saveMine').addEventListener('click', () => {
      cfg.income = +$('#income').value || 0; cfg.budget = +$('#budget').value || 0; const e = $('#emergencyIn').value.trim(); cfg.emergency = e === '' ? null : +e; saveCfg();
      $('#mineMsg').textContent = '저장했어요'; $('#mineMsg').className = 'msg ok'; if (data) { renderToday(); renderSpend(); }
    });
    $('#logoGrid').addEventListener('click', (e) => { const b = e.target.closest('button[data-theme]'); if (!b) return; cfg.theme = b.dataset.theme; saveCfg(); applyTheme(cfg.theme); });
    $('#openGuide').addEventListener('click', () => openGuide());
    // 조언
    $('#condRow').addEventListener('click', (e) => { const b = e.target.closest('button[data-v]'); if (b) setCondition(+b.dataset.v); });
    $('#cPrev').addEventListener('click', () => { condMonth = shiftMonth(condMonth, -1); renderCalendar(); });
    $('#cNext').addEventListener('click', () => { condMonth = shiftMonth(condMonth, 1); renderCalendar(); });
    $('#advList').addEventListener('toggle', (e) => { const d = e.target; if (d.matches && d.matches('details.chart-fold') && d.open) showChart(d); }, true);
    // 오늘
    $('#todo').addEventListener('click', (e) => { const b = e.target.closest('button[data-todo]'); if (!b) return; const it = todoActs[b.dataset.todo]; if (!it) return; if (it.tab) showTab(it.tab); else it.act(); });
    $('#unknownWarn').addEventListener('click', () => openGuide('capture'));
    $('#seeAllSpend').addEventListener('click', () => showTab('spend'));
    // + 버튼
    $('#fab').addEventListener('click', () => $('#quick').showModal());
    $('#qJournal').addEventListener('click', () => { $('#quick').close(); openJournal(); });
    $('#qMemo').addEventListener('click', () => { $('#quick').close(); openMemo(); });
    $('#mCats').addEventListener('click', (e) => { const b = e.target.closest('button[data-c]'); if (!b) return; memoCat = memoCat === b.dataset.c ? '' : b.dataset.c; renderMemoCats(); });
    $('#mSave').addEventListener('click', saveMemo);
    $('#memoForm').addEventListener('submit', (e) => { e.preventDefault(); saveMemo(); });
    $('#toastUndo').addEventListener('click', undoLast);
    // 지출
    $('#mPrev').addEventListener('click', () => { const k = Object.keys(data.spending.months).sort(); spendMonth = k[k.indexOf(spendMonth) - 1] || spendMonth; txShown = 40; txCat = ''; renderSpend(); });
    $('#mNext').addEventListener('click', () => { const k = Object.keys(data.spending.months).sort(); spendMonth = k[k.indexOf(spendMonth) + 1] || spendMonth; txShown = 40; txCat = ''; renderSpend(); });
    $('#txSearch').addEventListener('input', (e) => { txFilter = e.target.value; txShown = 40; renderSpend(); });
    $('#catChips').addEventListener('click', (e) => { const b = e.target.closest('button[data-cat]'); if (!b) return; txCat = b.dataset.cat; txShown = 40; renderSpend(); });
    $('#catBars').addEventListener('click', (e) => { const b = e.target.closest('button[data-cat]'); if (!b) return; txCat = txCat === b.dataset.cat ? '' : b.dataset.cat; txShown = 40; renderSpend(); if (txCat) $('#txCard').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    $('#txMore').addEventListener('click', () => { txShown += 40; renderSpend(); });
    $('#budgetBox').addEventListener('click', (e) => { if (e.target.closest('#setBudget')) { openSettings(); $('#budget').focus(); } });
    $('#spendAlerts').addEventListener('click', (e) => { if (e.target.closest('#alertLine')) { $('#recurFold').open = true; $('#recurFold').scrollIntoView({ behavior: 'smooth', block: 'start' }); } });
    // 투자
    $('#allocBars').addEventListener('click', (e) => { const b = e.target.closest('button[data-kind]'); if (b) openTargets(b.dataset.kind); });
    $('#openTargets').addEventListener('click', () => openTargets());
    $('#tgSave').addEventListener('click', () => {
      const t = {}; $$('#targetForm input').forEach((i) => { if (i.value.trim() !== '') t[i.dataset.kind] = +i.value; });
      cfg.targets = t; saveCfg(); $('#targetSheet').close(); renderInvest();
    });
    $('#openJournal').addEventListener('click', openJournal);
    $('#jPlanned').addEventListener('click', (e) => { const b = e.target.closest('button[data-v]'); if (!b) return; jSel.planned = jSel.planned === b.dataset.v ? '' : b.dataset.v; renderJournalChips(); });
    $('#jEmotion').addEventListener('click', (e) => { const b = e.target.closest('button[data-e]'); if (!b) return; jSel.emotion = jSel.emotion === b.dataset.e ? '' : b.dataset.e; renderJournalChips(); });
    $('#jMistakes').addEventListener('click', (e) => { const b = e.target.closest('button[data-m]'); if (!b) return; const m = b.dataset.m; if (m === '없음') jSel.mistakes.clear(); else if (jSel.mistakes.has(m)) jSel.mistakes.delete(m); else jSel.mistakes.add(m); renderJournalChips(); });
    $('#jSave').addEventListener('click', saveJournal);
    // 체크
    fillSelect('#ckStyle', STYLES); fillSelect('#ckHold', HOLDS); fillSelect('#jStyle', STYLES); fillSelect('#jHold', HOLDS);
    const draft = store.get('sa.check', {});
    CK.forEach((id) => { if (draft[id] != null) $('#' + id).value = draft[id]; });
    const onCk = () => { const d = {}; CK.forEach((id) => { d[id] = $('#' + id).value; }); store.set('sa.check', d); if (data) computeCheck(); };
    $('#checkForm').addEventListener('input', onCk); $('#checkForm').addEventListener('change', onCk);
    $('#checkForm').addEventListener('submit', (e) => e.preventDefault());
    $('#savePlan').addEventListener('click', savePlan);
    $('#resetCheck').addEventListener('click', () => { CK.forEach((id) => { const el = $('#' + id); el.value = id === 'ckSlip' ? '0.3' : id === 'ckCap' ? '20' : id === 'ckSide' ? '매수' : id === 'ckCcy' ? 'KRW' : ''; }); store.del('sa.check'); if (data) computeCheck(); });
    $('#phaseChips').addEventListener('click', (e) => { const b = e.target.closest('button[data-phase]'); if (!b) return; phase = phase === b.dataset.phase ? '' : b.dataset.phase; store.set('sa.phase', phase); renderCheck(); });
    $('#stopChips').addEventListener('click', (e) => { const b = e.target.closest('button[data-stop]'); if (!b) return; const i = +b.dataset.stop; stops.has(i) ? stops.delete(i) : stops.add(i); store.set('sa.stops', [...stops]); renderCheck(); });
    $('#briefMore').addEventListener('click', () => { const b = $('#brief'), open = b.hidden; b.hidden = !open; $('#briefHead').hidden = open; $('#briefMore').textContent = open ? '접기' : '전체 보기'; });
    // 복기
    $('#wkThis').addEventListener('click', () => { reviewWeek = 0; $('#wkThis').classList.add('is-on'); $('#wkLast').classList.remove('is-on'); renderReview(); });
    $('#wkLast').addEventListener('click', () => { reviewWeek = -1; $('#wkLast').classList.add('is-on'); $('#wkThis').classList.remove('is-on'); renderReview(); });
    window.addEventListener('online', () => { if (data) flush(); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden && data) { renderTodo(); renderBadges(); } });
    setInterval(() => { if (data) { renderTodo(); renderBadges(); } }, 60000);
  }

  // ── 시작 ────────────────────────────────────────────────
  applyTheme(cfg.theme);
  bind();
  $('#rememberPin').checked = cfg.rememberPin !== false;
  showTab('advice');                             // 앱을 열면 언제나 조언부터
  load();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
