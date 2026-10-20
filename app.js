/* 시드업자산 — 가계부 + 주식 매매 코치 (소원저장소와 별도 앱)
 * 자료: 비공개 저장소 <dir>/data.enc.json (맥북 정리 스크립트가 PIN 으로 AES-GCM 암호화해 올림) → 이 휴대폰에서만 복호화.
 * 매매일지: <dir>/매매일지/YYYY-MM.jsonl 에 한 줄씩 덧붙임 (GitHub Contents API).
 * 열쇠(토큰)·PIN 은 이 기기의 localStorage 에만 둔다. 외부 요청은 api.github.com 하나뿐(CSP). 증권사·카드사 로그인은 없다. */
(() => {
  'use strict';

  const VERSION = '1.0.0';
  const DEFAULT_CFG = { owner: 'sein9507-max', repo: 'newlywed_tech', branch: 'main', dir: '시드업자산', token: '', pin: '', rememberPin: true, theme: 'A', income: 0, emergency: null, targets: {} };
  const API = 'https://api.github.com';
  const THEMES = { A: { name: '민트 크롬', color: '#CDF4E4' }, B: { name: '라벤더 홀로', color: '#E1D6FF' }, C: { name: '블랙 크롬', color: '#0F1218' } };
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
  let queue = store.get('sa.queue', []);         // 아직 못 올린 매매일지
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

  // ── 시간·숫자 ───────────────────────────────────────────
  function isoLocal(d) {
    const off = -d.getTimezoneOffset(), s = off >= 0 ? '+' : '-', a = Math.abs(off);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${s}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
  }
  const todayISO = () => isoLocal(new Date()).slice(0, 10);
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
    const t = new Date(); t.setHours(12, 0, 0, 0);
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
    if (cfg.token) { loadJournal().then(() => { renderJournal(); renderReview(); }).catch(() => {}); flush(); }
  }

  // ── 렌더 ────────────────────────────────────────────────
  function renderAll() { renderToday(); renderSpend(); renderInvest(); renderCheck(); renderJournal(); renderReview(); }

  function monthTxs(ym) { return (data.spending.recent || []).filter((t) => t.date.startsWith(ym)); }

  function renderToday() {
    const a = data.assets, t = a.totals, s = data.spending;
    $('#totalNum').innerHTML = `${esc(koMoney(t.totalKRW))}`;
    $('#totalSub').innerHTML = `${esc(won(t.totalKRW))} · 평가손익 <span class="${sgn(t.pnlKRW)}">${esc(won(t.pnlKRW))}</span>${t.unknown?.length ? ` · <span class="chip warn">${esc(t.unknown.join(', '))} 미확인</span>` : ''}`;
    $('#tInvest').textContent = koMoney(t.investKRW); $('#tCash').textContent = t.cashKRW ? koMoney(t.cashKRW) : (t.unknown?.length ? '캡처 필요' : '0원'); $('#tSafe').textContent = koMoney(t.safeKRW);
    const today = todayISO();
    const todayTx = (s.recent || []).filter((x) => x.date === today);
    const todaySum = todayTx.reduce((p, x) => p + x.amt, 0);
    $('#todaySpend').textContent = todayTx.length ? won(todaySum) : '0원';
    $('#todaySpendSub').textContent = todayTx.length ? `${todayTx.length}건` : (s.bySrc?.['문자'] ? '아직 승인 없음' : '승인 문자 단축어를 켜면 실시간');
    const thisM = s.months[s.thisMonth] || { total: 0, count: 0 };
    $('#monthSpend').textContent = koMoney(thisM.total);
    const diff = s.toDate.this - s.toDate.last;
    $('#monthSpendSub').textContent = `지난달 같은 날까지보다 ${diff >= 0 ? '+' : '-'}${koMoney(Math.abs(diff))}`;
    if (cfg.income > 0) {
      const rate = (1 - thisM.total / cfg.income) * 100;
      $('#saveRate').textContent = `${rate.toFixed(0)}%`;
      $('#saveRateSub').textContent = `수입 ${koMoney(cfg.income)} − 지출 ${koMoney(thisM.total)}`;
      $('#saveRate').parentElement.classList.toggle('warn', rate < 20);
    } else { $('#saveRate').textContent = '—'; $('#saveRateSub').textContent = '설정 ③에 월 수입을 넣으면 나와요'; }
    const emer = cfg.emergency != null && cfg.emergency !== '' ? Number(cfg.emergency) : (t.cashKRW + (a.allocation.find((x) => x.kind === '상품권')?.krw || 0));
    const avg = s.avgMonthly6 || thisM.total || 0;
    const months = avg ? emer / avg : null;
    $('#emergency').textContent = months == null ? '—' : `${months.toFixed(1)}개월`;
    $('#emergencySub').textContent = `${koMoney(emer)} ÷ 월평균 ${koMoney(avg)}`;
    $('#emergency').parentElement.classList.toggle('warn', months != null && months < 3);
    $('#todayCount').textContent = todayTx.length ? `${todayTx.length}건` : '';
    $('#todayList').innerHTML = todayTx.length ? todayTx.map(txRow).join('') : `<li class="empty"><b>오늘 승인 없음</b>${s.bySrc?.['문자'] ? '' : '삼성카드 승인 문자 → 단축어를 켜면 바로 보여요'}</li>`;
    $('#genAt').textContent = data.generatedAt ? `맥북 정리 ${data.generatedAt.slice(5, 16).replace('T', ' ')}` : '';
  }
  function txRow(t) {
    return `<li class="row"><div class="t">${esc(t.merchant)}</div><div class="s">${esc(t.date.slice(5).replace('-', '/'))}${t.time ? ' ' + esc(t.time) : ''} <span class="chip">${esc(t.cat)}</span>${t.src !== '명세서' ? `<span class="chip src">${esc(t.src)}</span>` : ''}${t.sale === '취소' ? '<span class="chip warn">취소</span>' : ''}</div><div class="a ${t.amt < 0 ? 'loss' : ''}">${esc(won(t.amt))}</div></li>`;
  }

  function renderSpend() {
    const s = data.spending, keys = Object.keys(s.months).sort();
    if (!keys.includes(spendMonth)) spendMonth = keys[keys.length - 1] || s.thisMonth;
    const i = keys.indexOf(spendMonth);
    $('#mPrev').disabled = i <= 0; $('#mNext').disabled = i >= keys.length - 1;
    $('#mLabel').textContent = monthKo(spendMonth);
    const m = s.months[spendMonth] || { total: 0, count: 0, byCat: {}, partial: false };
    $('#mTotal').textContent = koMoney(m.total);
    const prevKey = keys[i - 1], prev = prevKey ? s.months[prevKey] : null;
    $('#mSub').innerHTML = `${esc(won(m.total))} · ${m.count}건${prev ? ` · 전달 대비 <span class="${sgn(m.total - prev.total)}">${esc(pct((m.total / (prev.total || 1) - 1) * 100, 0))}</span>` : ''}${m.partial ? ' · <span class="chip warn">일부만(뷰어 OCR)</span>' : ''}${spendMonth === s.thisMonth && s.avgMonthly6 ? ` · 6개월 평균 ${esc(koMoney(s.avgMonthly6))}` : ''}`;
    const cats = Object.entries(m.byCat || {}).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    const max = cats[0]?.[1] || 1;
    $('#catBars').innerHTML = cats.length ? cats.map(([k, v]) => `<div class="bar"><span class="lab">${esc(k)}</span><span class="trk"><span class="fil${k === '기타' ? ' gold' : ''}" data-w="${(v / max * 100).toFixed(1)}"></span></span><span class="val">${esc(koMoney(v))} <span class="mute">${(v / (m.total || 1) * 100).toFixed(0)}%</span></span></div>`).join('') : '<div class="empty">이 달 거래가 없어요</div>';
    paint($('#catBars'));
    const txs = monthTxs(spendMonth);
    const top = {};
    txs.filter((t) => t.amt > 0).forEach((t) => { const k = t.merchant.slice(0, 10); top[k] = top[k] || { merchant: t.merchant, amt: 0, count: 0, cat: t.cat }; top[k].amt += t.amt; top[k].count++; });
    const top5 = Object.values(top).sort((a, b) => b.amt - a.amt).slice(0, 5);
    $('#topNote').textContent = txs.length < m.count ? `상세 ${txs.length}/${m.count}건` : '';
    $('#topList').innerHTML = top5.length ? top5.map((t, n) => `<li class="row"><div class="t">${n + 1}. ${esc(t.merchant)}</div><div class="s">${t.count}번 <span class="chip">${esc(t.cat)}</span></div><div class="a">${esc(won(t.amt))}</div></li>`).join('')
      : (s.topMerchants3m?.length ? `<li class="empty">이 달 상세가 없어 최근 3개월 기준</li>` + s.topMerchants3m.slice(0, 5).map((t, n) => `<li class="row"><div class="t">${n + 1}. ${esc(t.merchant)}</div><div class="s">${t.count}번 <span class="chip">${esc(t.cat)}</span></div><div class="a">${esc(won(t.amt))}</div></li>`).join('') : '<li class="empty">없음</li>');
    // 반복 결제 + 중복 경고
    const rec = s.recurring || [];
    const warns = [];
    const groups = {};
    rec.forEach((r) => { for (const [g, re] of Object.entries(SUB_GROUPS)) if (re.test(r.merchant)) (groups[g] = groups[g] || []).push(r); });
    for (const [g, lst] of Object.entries(groups)) if (lst.length >= 2) warns.push(`${g} ${lst.length}개 겹침: ${lst.map((r) => r.merchant.slice(0, 10)).join(', ')} — 하나로 줄일 수 있나?`);
    const dbl = {};
    txs.filter((t) => t.amt > 0).forEach((t) => { const k = `${t.merchant.slice(0, 8)}|${t.amt}`; dbl[k] = (dbl[k] || 0) + 1; });
    Object.entries(dbl).forEach(([k, n]) => { if (n >= 2 && rec.some((r) => k.startsWith(r.merchant.slice(0, 8)))) warns.push(`${k.split('|')[0]} 같은 금액이 이 달 ${n}번 — 이중 결제?`); });
    $('#dupWarn').innerHTML = warns.map((w) => `<div class="banner is-err inline">${esc(w)}</div>`).join('');
    const recSum = rec.reduce((p, r) => p + r.amt, 0);
    $('#recurList').innerHTML = rec.length ? rec.slice(0, 15).map((r) => `<li class="row"><div class="t">${esc(r.merchant)}</div><div class="s">${r.months}개월째 · 마지막 ${esc(r.last.slice(5).replace('-', '/'))} <span class="chip">${esc(r.cat)}</span></div><div class="a">${esc(won(r.amt))}</div></li>`).join('') + `<li class="row"><div class="t"><b>합계 (월)</b></div><div class="s">${rec.length}건</div><div class="a">${esc(won(recSum))}</div></li>` : '<li class="empty">3개월 이상 반복된 결제가 아직 없어요</li>';
    // 거래 목록
    const chips = ['전체', ...new Set(txs.map((t) => t.cat))];
    $('#catChips').innerHTML = chips.map((c) => `<button type="button" data-cat="${esc(c === '전체' ? '' : c)}" class="${(c === '전체' ? '' : c) === txCat ? 'is-on' : ''}">${esc(c)}</button>`).join('');
    const q = txFilter.trim();
    const list = txs.filter((t) => (!txCat || t.cat === txCat) && (!q || t.merchant.includes(q) || t.cat.includes(q)));
    $('#txNote').textContent = `${list.length}건`;
    $('#txList').innerHTML = list.length ? list.slice(0, txShown).map(txRow).join('') : '<li class="empty">맞는 거래가 없어요</li>';
    $('#txMore').hidden = list.length <= txShown;
  }

  function renderInvest() {
    const a = data.assets, t = a.totals;
    $('#invNum').textContent = koMoney(t.investKRW);
    $('#invSub').innerHTML = `${esc(won(t.investKRW))} · 기준 ${esc(a.asOf || '')}`;
    $('#invBuy').textContent = koMoney(t.buyKRW);
    $('#invPnl').innerHTML = `<span class="${sgn(t.pnlKRW)}">${esc(koMoney(t.pnlKRW))} (${esc(pct(t.buyKRW ? (t.investKRW / t.buyKRW - 1) * 100 : null))})</span>`;
    $('#invFx').textContent = a.fx ? `${num(a.fx.rate, 1)}원` : '—';
    // 비중·리밸런싱
    const alloc = a.allocation || [];
    $('#allocBars').innerHTML = alloc.map((x) => { const tg = cfg.targets[x.kind]; return `<div class="bar"><button type="button" class="lab text-btn lab-btn" data-kind="${esc(x.kind)}">${esc(x.kind)}</button><span class="trk"><span class="fil${tg != null && Math.abs(x.pct - tg) >= 5 ? ' coral' : ''}" data-w="${Math.min(100, x.pct).toFixed(1)}"></span>${tg != null ? `<span class="tgt" data-left="${Math.min(100, tg)}"></span>` : ''}</span><span class="val">${x.pct}%${tg != null ? ` <span class="mute">/ ${tg}</span>` : ''}</span></div>`; }).join('');
    paint($('#allocBars'));
    const alerts = alloc.filter((x) => cfg.targets[x.kind] != null && Math.abs(x.pct - cfg.targets[x.kind]) >= 5)
      .map((x) => { const d = x.pct - cfg.targets[x.kind]; return `<div class="banner is-err inline">${esc(x.kind)} ${x.pct}% → 목표 ${cfg.targets[x.kind]}% · ${d > 0 ? '줄이기' : '늘리기'} ${Math.abs(d).toFixed(1)}%p ≈ ${esc(koMoney(Math.abs(d) / 100 * t.totalKRW))}</div>`; });
    const hasTg = Object.keys(cfg.targets).length > 0;
    $('#rebalance').innerHTML = alerts.length ? alerts.join('') : (hasTg ? '<p class="msg ok">목표 범위(±5%p) 안이에요</p>' : '');
    // 계좌
    const html = [];
    for (const acc of a.accounts) {
      if (acc.holdings) {
        html.push(`<div class="card"><h3>${esc(acc.name)} <span class="right ${sgn(acc.pnlKRW)}">${esc(koMoney(acc.evalKRW))} · ${esc(pct(acc.pnlPct))}</span></h3><ul class="list">` +
          acc.holdings.map((h) => `<li class="row"><div class="t">${esc(h.name)} <span class="mute">${esc(h.code)}</span></div><div class="s">${esc(num(h.qty))}주 × ${esc(price(h.cur, acc.currency))} <span class="${sgn(h.chgPct)}">${esc(pct(h.chgPct))}</span> · 평단 ${esc(price(h.avg, acc.currency))}${h.status && h.status !== 'CLOSE' ? ` <span class="chip">${esc(h.status)}</span>` : ''}</div><div class="a">${esc(koMoney(h.evalKRW))}<small class="${sgn(h.pnlPct)}">${esc(pct(h.pnlPct))} ${esc(koMoney(h.pnlKRW))}</small></div></li>`).join('') +
          `</ul><p class="hint small">시세 ${esc((acc.holdings[0]?.curAsOf || '').slice(0, 16).replace('T', ' '))} · 매입 ${esc(koMoney(acc.buyKRW))}</p></div>`);
      } else {
        const v = acc.balance ?? acc.refund;
        html.push(`<div class="card"><h3>${esc(acc.name)} <span class="right">${esc(acc.kind)}</span></h3><div class="kv">` +
          `<span>${acc.refund != null ? '해지환급금' : '잔액'}</span><b>${v == null ? '<span class="chip warn">캡처 필요</span>' : esc(won(v))}</b>` +
          (acc.paid != null ? `<span>납입 누계</span><b>${esc(won(acc.paid))}</b>` : '') +
          (acc.monthly ? `<span>매달</span><b>${esc(won(acc.monthly))}</b>` : '') +
          (acc.rate != null ? `<span>금리</span><b>${esc(acc.rate)}%</b>` : '') +
          (acc.asOf ? `<span>기준</span><b>${esc(acc.asOf)}</b>` : '') +
          `</div>${acc.note ? `<p class="hint small">${esc(acc.note)}</p>` : ''}</div>`);
      }
    }
    $('#accounts').innerHTML = html.join('');
    $('#holdingNames').innerHTML = a.accounts.flatMap((x) => x.holdings || []).map((h) => `<option value="${esc(h.code)}">${esc(h.name)}</option>`).join('');
  }

  // ── 매매일지 ────────────────────────────────────────────
  const journalPath = (ym) => `${cfg.dir}/매매일지/${ym}.jsonl`;
  function parseJsonl(text) { return text.split('\n').filter((l) => l.trim()).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); }
  async function loadJournal() {
    const now = new Date(), months = [monthOf(now), monthOf(new Date(now.getFullYear(), now.getMonth() - 1, 1))];
    for (const ym of months) {
      const f = await getFile(journalPath(ym));
      journal[ym] = f ? { entries: parseJsonl(f.text), sha: f.sha } : { entries: [], sha: null };
    }
    store.set('sa.journal', journal);
  }
  function allEntries() {
    const seen = new Set(); const out = [];
    for (const ym of Object.keys(journal)) for (const e of journal[ym].entries) if (!seen.has(e.id)) { seen.add(e.id); out.push(e); }
    for (const q of queue) if (!seen.has(q.entry.id)) { seen.add(q.entry.id); out.push({ ...q.entry, _pending: true }); }
    return out.sort((x, y) => (x.at < y.at ? 1 : -1));
  }
  function entryLine(e) {
    const meta = [e.type, e.qty ? `${num(e.qty)}주` : '', e.price ? price(e.price, e.ccy) : '', e.planned === true ? '계획대로' : e.planned === false ? '계획 밖' : '', e.rule != null ? `규칙 ${e.rule}/10` : ''].filter(Boolean).join(' · ');
    const tags = (e.mistakes || []).map((m) => `<span class="chip warn">${esc(m)}</span>`).join('');
    return `<li class="row"><div class="t">${esc(e.name || '')} <span class="mute">${esc((e.at || '').slice(5, 10).replace('-', '/'))}</span>${e._pending ? '<span class="chip gold">올리는 중</span>' : ''}</div><div class="s">${esc(meta)} ${tags}${e.fix ? `<br>교정: ${esc(e.fix)}` : ''}</div><div class="a">${e.type === '매수' ? '<span class="gain">▲</span>' : e.type === '매도' ? '<span class="loss">▼</span>' : '◇'}</div></li>`;
  }
  function renderJournal() {
    const es = allEntries();
    $('#journalNote').textContent = queue.length ? `대기 ${queue.length}` : (es.length ? `${es.length}건` : '');
    $('#journalList').innerHTML = es.length ? es.slice(0, 8).map(entryLine).join('') : '<li class="empty"><b>아직 기록이 없어요</b>매수·매도·계획을 남기면 복기 탭에 주간 점수가 생겨요</li>';
  }
  function enqueue(entry) {
    queue.push({ month: entry.at.slice(0, 7), entry }); store.set('sa.queue', queue);
    renderJournal(); renderReview(); flush();
  }
  async function flush() {
    if (flushing || !queue.length || !cfg.token) return;
    flushing = true;
    try {
      while (queue.length) {
        const op = queue[0];
        const cur = journal[op.month] || { entries: [], sha: null };
        let text = '', sha = cur.sha;
        try {
          const f = await getFile(journalPath(op.month));
          if (f) { text = f.text; sha = f.sha; cur.entries = parseJsonl(f.text); } else { text = ''; sha = null; }
        } catch (e) { if (e.status !== 404) throw e; }
        if (!cur.entries.some((x) => x.id === op.entry.id)) {
          const body = (text && !text.endsWith('\n') ? text + '\n' : text) + JSON.stringify(op.entry) + '\n';
          try { sha = await putFile(journalPath(op.month), body, sha, `매매일지 ${op.entry.type} ${op.entry.name || ''} ${op.entry.at.slice(0, 10)}`); }
          catch (e) { if (e.status === 409 || e.status === 422) continue; throw e; }   // 다시 읽어서 재시도
          cur.entries.push(op.entry);
        }
        cur.sha = sha; journal[op.month] = cur;
        queue.shift(); store.set('sa.queue', queue); store.set('sa.journal', journal);
        setPill('기록 올림', 'is-ok');
      }
      lastError = '';
    } catch (e) {
      lastError = e.message; setPill(`대기 ${queue.length}`, 'is-err');
      showBanner(`매매일지를 아직 못 올렸어요(${esc(e.message)}). 휴대폰에 담아뒀다가 다시 올릴게요. <button id="retryBtn" type="button">다시 시도</button>`, 'is-err');
      $('#retryBtn').onclick = () => { hideBanner(); flush(); };
    } finally { flushing = false; renderJournal(); renderReview(); }
  }

  // ── 매매 전 체크 ────────────────────────────────────────
  const CK = ['ckName', 'ckStyle', 'ckHold', 'ckSide', 'ckTrigger', 'ckInvalid', 'ckEntry', 'ckStop', 'ckAccount', 'ckRisk', 'ckSlip', 'ckCap', 'ckCcy'];
  function fillSelect(id, list) { const s = $(id); list.forEach((v) => { const o = document.createElement('option'); o.value = v; o.textContent = v; s.appendChild(o); }); }
  function renderCheck() {
    const b = data.brief;
    $('#briefDate').textContent = b?.date ? dateKo(b.date, false) : '';
    $('#brief').textContent = b?.text || '시황 발행본이 아직 없어요. 맥북 정리 스크립트가 주식시황정리/발행본의 최신 글을 넣어줘요.';
    $('#briefMore').hidden = !(b?.text && b.text.length > 400);
    $('#phaseChips').innerHTML = Object.keys(PHASES).map((p) => `<button type="button" data-phase="${p}" class="${p === phase ? 'is-on' : ''}">${p}</button>`).join('');
    $('#phaseInfo').innerHTML = phase ? `<span>관찰</span><div>${esc(PHASES[phase].obs)}</div><span>대응</span><div><b>${esc(PHASES[phase].act)}</b></div>` : '<span class="mute">국면을 고르면 기본 대응이 나와요</span>';
    $('#stopChips').innerHTML = STOP_SIGNALS.map((s, i) => `<button type="button" class="warn ${stops.has(i) ? 'is-on' : ''}" data-stop="${i}">${esc(s)}</button>`).join('');
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
  function computeCheck() {
    const v = checkValues();
    const need = { ckName: '종목', ckStyle: '스타일', ckHold: '보유기간', ckTrigger: '트리거', ckInvalid: '무효화', ckEntry: '진입가', ckStop: '손절가', ckAccount: '계좌자산', ckRisk: '거래당 위험률' };
    const missing = Object.entries(need).filter(([k]) => !v[k]).map(([, n]) => n);
    const box = $('#verdict'); const saveBtn = $('#savePlan');
    if (stops.size) { box.className = 'verdict no'; box.innerHTML = '<h4>거래 금지</h4>위에 즉시 중단 신호가 켜져 있어요. 오늘은 계획만 적고 주문은 하지 않아요.'; saveBtn.disabled = true; return null; }
    if (missing.length) { box.className = 'verdict no'; box.innerHTML = `<h4>거래 금지</h4>빠진 칸: <b>${esc(missing.join(', '))}</b><ul><li>"좋아 보인다"는 트리거가 아니에요.</li><li>"본전 오면 판다"는 무효화가 아니에요.</li></ul>`; saveBtn.disabled = true; return null; }
    const entry = +v.ckEntry, stop = +v.ckStop, account = +v.ckAccount, risk = +v.ckRisk, slip = +v.ckSlip || 0, cap = +v.ckCap || 100;
    const fx = v.ckCcy === 'USD' ? (data.assets.fx?.rate || 1330) : 1;
    if (!(entry > 0) || !(stop > 0) || !(account > 0) || !(risk > 0)) { box.className = 'verdict no'; box.innerHTML = '<h4>거래 금지</h4>진입가·손절가·계좌자산·위험률은 0보다 커야 해요.'; saveBtn.disabled = true; return null; }
    if (entry === stop) { box.className = 'verdict no'; box.innerHTML = '<h4>거래 금지</h4>진입가와 손절가가 같아요. 무효화 가격을 정해요.'; saveBtn.disabled = true; return null; }
    if ((v.ckSide === '매수' && stop > entry) || (v.ckSide === '매도' && stop < entry)) { box.className = 'verdict no'; box.innerHTML = `<h4>거래 금지</h4>${v.ckSide}인데 손절가가 ${v.ckSide === '매수' ? '진입가보다 위' : '진입가보다 아래'}예요.`; saveBtn.disabled = true; return null; }
    const allowed = account * risk / 100;
    const perShare = (Math.abs(entry - stop) + entry * slip / 100) * fx;
    const baseQty = Math.floor(allowed / perShare);
    const capQty = Math.floor(account * cap / 100 / (entry * fx));
    const qty = Math.max(0, Math.min(baseQty, capQty));
    const position = qty * entry * fx;
    const r = { qty, baseQty, capQty, allowed, perShare, position, pctOfAccount: position / account * 100, lossAtStop: qty * Math.abs(entry - stop) * fx, fx };
    if (qty <= 0) { box.className = 'verdict no'; box.innerHTML = `<h4>거래 금지</h4>허용손실 ${esc(won(allowed))}으로는 1주도 못 사요(주당 위험 ${esc(won(perShare))}). 손절폭을 좁히거나 이번엔 쉬어요.`; saveBtn.disabled = true; return null; }
    box.className = 'verdict ok';
    box.innerHTML = `<h4>거래 가능 · 최종 수량</h4><div class="big">${num(qty)}주</div><div class="kv">` +
      `<span>허용손실</span><b>${esc(won(allowed))} (${risk}%)</b><span>주당 위험</span><b>${esc(won(perShare))}</b><span>기본 수량</span><b>${num(baseQty)}주</b><span>단일종목 한도</span><b>${num(capQty)}주 (${cap}%)</b>` +
      `<span>포지션</span><b>${esc(koMoney(position))} · ${r.pctOfAccount.toFixed(1)}%</b><span>손절 시 손실</span><b class="loss">-${esc(koMoney(r.lossAtStop))}</b>${v.ckCcy === 'USD' ? `<span>환율</span><b>${num(fx, 1)}원</b>` : ''}</div>` +
      `<p class="hint small">확인: 생활비·비상금 안 섞였나 · 불리하게 체결돼도 감당되나 · 같은 방향 포지션 합산했나 · 야간·실적 갭 · 손실 나도 다음 규칙 지킬 크기인가</p>`;
    saveBtn.disabled = false;
    return r;
  }
  function savePlan() {
    const r = computeCheck(); if (!r) return;
    const v = checkValues(); const d = new Date();
    enqueue({ id: makeId(d), at: isoLocal(d), type: '계획', side: v.ckSide, name: v.ckName, style: v.ckStyle, hold: v.ckHold, trigger: v.ckTrigger, invalid: v.ckInvalid,
      entry: +v.ckEntry, stop: +v.ckStop, ccy: v.ckCcy, account: +v.ckAccount, riskPct: +v.ckRisk, qty: r.qty, price: +v.ckEntry, phase: phase || null, planned: null });
    $('#verdict').insertAdjacentHTML('beforeend', '<p class="msg ok">매매일지에 계획으로 쌓았어요. 체결하면 투자 탭에서 매수/매도 기록을 남겨요.</p>');
  }

  // ── 복기 ────────────────────────────────────────────────
  function renderReview() {
    const [from, to] = weekRange(reviewWeek);
    const es = allEntries().filter((e) => { const d = (e.at || '').slice(0, 10); return d >= from && d <= to; });
    const trades = es.filter((e) => e.type === '매수' || e.type === '매도');
    const body = $('#reviewBody');
    $('#principle').textContent = PRINCIPLES[Math.floor(Date.now() / 864e5) % PRINCIPLES.length];
    const title = `<p class="hint top">${esc(dateKo(from))} ~ ${esc(dateKo(to))}</p>`;
    if (!es.length) { body.innerHTML = title + `<div class="card"><div class="empty"><b>이 주엔 기록이 없어요</b>투자 탭 "+ 기록 남기기"로 매수·매도·계획·관망을 남기면 규칙 준수 점수와 반복 실수가 여기 쌓여요.</div></div>`; return; }
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
    const fixes = es.filter((e) => e.fix).map((e) => e.fix).slice(0, 3);
    body.innerHTML = title +
      `<div class="bezel"><div class="inner"><div class="win-bar"><span class="dots"><i></i><i></i><i></i></span>WEEKLY<span class="stripes"></span></div><div class="score">` +
      `<div><div class="ring" data-p="${score ?? 0}"><b>${score ?? '—'}</b></div><div class="hint center">규칙 준수 점수</div></div>` +
      `<div class="kv mid"><span>거래</span><b>${trades.length}건</b><span>계획·관망</span><b>${es.length - trades.length}건</b><span>계획대로</span><b>${plannedPct == null ? '—' : plannedPct.toFixed(0) + '%'}</b><span>트리거+무효화</span><b>${withSetup == null ? '—' : withSetup.toFixed(0) + '%'}</b><span>규칙 자평</span><b>${ruleAvg == null ? '—' : ruleAvg.toFixed(1) + '/10'}</b><span>과정 자평</span><b>${procAvg == null ? '—' : procAvg.toFixed(1) + '/10'}</b></div>` +
      `</div></div></div>` +
      `<div class="card"><h3>반복 실수</h3>${topM.length ? '<ul class="list">' + topM.map(([m, n]) => `<li class="row"><div class="t">${esc(m)}</div><div class="s">${n >= 2 ? '<span class="chip warn">반복</span>' : ''}</div><div class="a">${n}번</div></li>`).join('') + '</ul>' : '<p class="msg ok">기록된 실수 없음</p>'}</div>` +
      `<div class="card"><h3>교정 행동</h3>${fixes.length ? '<ul class="steps">' + fixes.map((f) => `<li>${esc(f)}</li>`).join('') + '</ul>' : '<p class="hint m0">거래마다 "교정 행동 하나"를 적어요. 한 번에 하나만 고쳐요.</p>'}</div>` +
      `<div class="card"><h3>이 주 기록</h3><ul class="list">${es.map(entryLine).join('')}</ul></div>`;
    paint(body);
  }

  // ── 설정·테마 ───────────────────────────────────────────
  function saveCfg() { const { ...c } = cfg; store.set('sa.cfg', c); }
  function applyTheme(t) {
    if (!THEMES[t]) t = 'A';
    document.documentElement.dataset.theme = t;
    $('#manifestLink').href = `manifest-${t}.webmanifest`;
    $('#touchIcon').href = `icons/${t}/apple-touch-icon.png`; $('#favIcon').href = `icons/${t}/icon-192.png`; $('#brandIcon').src = `icons/${t}/icon-192.png`;
    $('meta[name=theme-color]').content = THEMES[t].color;
    $('#logoGrid').innerHTML = Object.entries(THEMES).map(([k, v]) => `<button type="button" data-theme="${k}" class="${k === t ? 'is-on' : ''}"><img src="icons/${k}/icon-192.png" alt="" width="52" height="52">${v.name}</button>`).join('');
  }
  function openSettings() {
    $('#repoLabel').textContent = `${cfg.owner}/${cfg.repo}`;
    $('#token').value = cfg.token;
    $('#income').value = cfg.income || ''; $('#emergencyIn').value = cfg.emergency ?? '';
    const q = new URLSearchParams({ name: '시드업자산', description: '시드업자산 앱 — newlywed_tech 저장소 Contents 읽기·쓰기', target_name: cfg.owner, contents: 'write' });
    $('#tokenLink').href = `https://github.com/settings/personal-access-tokens/new?${q}`;
    $('#connectMsg').textContent = ''; $('#mineMsg').textContent = '';
    $('#verLine').textContent = `SEEDUP ASSET v${VERSION} · 저장 공간 ${store.ok ? '정상' : '막힘(사생활 보호 모드?)'}`;
    $('#settings').showModal();
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
    const d = new Date(); const dateV = $('#jDate').value || todayISO();
    const at = dateV === todayISO() ? isoLocal(d) : `${dateV}T12:00:00${isoLocal(d).slice(19)}`;
    const numOr = (id) => { const v = $('#' + id).value.trim(); return v === '' ? null : +v; };
    enqueue({ id: makeId(d), at, type: $('#jType').value, name, ccy: $('#jCcy').value, qty: numOr('jQty'), price: numOr('jPrice'), style: $('#jStyle').value || null, hold: $('#jHold').value || null,
      trigger: $('#jTrigger').value.trim(), invalid: $('#jInvalid').value.trim(), planned: jSel.planned === 'yes' ? true : jSel.planned === 'no' ? false : null,
      emotion: jSel.emotion || null, mistakes: [...jSel.mistakes], rule: numOr('jRule'), process: numOr('jProcess'), fix: $('#jFix').value.trim(), note: $('#jNote').value.trim() });
    $('#journal').close();
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
    $$('.tab').forEach((t) => t.classList.toggle('is-active', t.id === `tab-${name}`));
    $$('.nav-btn').forEach((b) => b.classList.toggle('is-active', b.dataset.tab === name));
    store.set('sa.tab', name); window.scrollTo({ top: 0 });
  }
  function bind() {
    $$('.nav-btn').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
    $('#openSettings').addEventListener('click', openSettings);
    $$('[data-close]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));
    $('#connectBtn').addEventListener('click', connect);
    $('#syncPill').addEventListener('click', () => load());
    $('#refreshBtn').addEventListener('click', () => load());
    $('#unlockBtn').addEventListener('click', () => {
      const v = $('#pin').value.trim();
      if (!/^\d{4,8}$/.test(v)) { const m = $('#lockMsg'); m.textContent = 'PIN은 숫자 4~8자리예요'; m.className = 'msg err'; return; }
      sessionPin = v; cfg.rememberPin = $('#rememberPin').checked; if (cfg.rememberPin) cfg.pin = v; saveCfg(); $('#pin').value = ''; load();
    });
    $('#pin').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#unlockBtn').click(); });
    $('#pinForget').addEventListener('click', () => { cfg.pin = ''; sessionPin = ''; data = null; saveCfg(); $('#settings').close(); load(); });
    $('#forgetBtn').addEventListener('click', () => {
      if (!confirm('이 휴대폰의 열쇠·PIN·담아둔 자료·대기 중인 기록을 모두 지울까요? (저장소의 자료는 그대로예요)')) return;
      ['sa.cfg', 'sa.enc', 'sa.journal', 'sa.queue', 'sa.check', 'sa.tab'].forEach((k) => store.del(k));
      cfg = { ...DEFAULT_CFG, theme: cfg.theme }; sessionPin = ''; data = null; journal = {}; queue = []; saveCfg(); $('#settings').close(); load();
    });
    $('#saveMine').addEventListener('click', () => {
      cfg.income = +$('#income').value || 0; const e = $('#emergencyIn').value.trim(); cfg.emergency = e === '' ? null : +e; saveCfg();
      $('#mineMsg').textContent = '저장했어요'; $('#mineMsg').className = 'msg ok'; if (data) renderToday();
    });
    $('#logoGrid').addEventListener('click', (e) => { const b = e.target.closest('button[data-theme]'); if (!b) return; cfg.theme = b.dataset.theme; saveCfg(); applyTheme(cfg.theme); });
    $('#openGuide').addEventListener('click', () => $('#guide').showModal());
    $('#openGuide2').addEventListener('click', () => $('#guide').showModal());
    // 지출
    $('#mPrev').addEventListener('click', () => { const k = Object.keys(data.spending.months).sort(); spendMonth = k[k.indexOf(spendMonth) - 1] || spendMonth; txShown = 40; renderSpend(); });
    $('#mNext').addEventListener('click', () => { const k = Object.keys(data.spending.months).sort(); spendMonth = k[k.indexOf(spendMonth) + 1] || spendMonth; txShown = 40; renderSpend(); });
    $('#txSearch').addEventListener('input', (e) => { txFilter = e.target.value; txShown = 40; renderSpend(); });
    $('#catChips').addEventListener('click', (e) => { const b = e.target.closest('button[data-cat]'); if (!b) return; txCat = b.dataset.cat; txShown = 40; renderSpend(); });
    $('#txMore').addEventListener('click', () => { txShown += 40; renderSpend(); });
    // 투자
    $('#allocBars').addEventListener('click', (e) => { const b = e.target.closest('button[data-kind]'); if (b) openTargets(b.dataset.kind); });
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
    $('#checkForm').addEventListener('input', () => { const d = {}; CK.forEach((id) => { d[id] = $('#' + id).value; }); store.set('sa.check', d); if (data) computeCheck(); });
    $('#checkForm').addEventListener('submit', (e) => e.preventDefault());
    $('#savePlan').addEventListener('click', savePlan);
    $('#resetCheck').addEventListener('click', () => { CK.forEach((id) => { const el = $('#' + id); el.value = id === 'ckSlip' ? '0.3' : id === 'ckCap' ? '20' : id === 'ckSide' ? '매수' : id === 'ckCcy' ? 'KRW' : ''; }); store.del('sa.check'); if (data) computeCheck(); });
    $('#phaseChips').addEventListener('click', (e) => { const b = e.target.closest('button[data-phase]'); if (!b) return; phase = phase === b.dataset.phase ? '' : b.dataset.phase; store.set('sa.phase', phase); renderCheck(); });
    $('#stopChips').addEventListener('click', (e) => { const b = e.target.closest('button[data-stop]'); if (!b) return; const i = +b.dataset.stop; stops.has(i) ? stops.delete(i) : stops.add(i); store.set('sa.stops', [...stops]); renderCheck(); });
    $('#briefMore').addEventListener('click', () => { const b = $('#brief'); b.classList.toggle('is-open'); $('#briefMore').textContent = b.classList.contains('is-open') ? '접기' : '더 보기'; });
    // 복기
    $('#wkThis').addEventListener('click', () => { reviewWeek = 0; $('#wkThis').classList.add('is-on'); $('#wkLast').classList.remove('is-on'); renderReview(); });
    $('#wkLast').addEventListener('click', () => { reviewWeek = -1; $('#wkLast').classList.add('is-on'); $('#wkThis').classList.remove('is-on'); renderReview(); });
    window.addEventListener('online', () => { if (data) flush(); });
  }

  // ── 시작 ────────────────────────────────────────────────
  applyTheme(cfg.theme);
  bind();
  $('#rememberPin').checked = cfg.rememberPin !== false;
  showTab(store.get('sa.tab', 'today'));
  load();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
