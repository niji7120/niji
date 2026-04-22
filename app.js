// ===== STATE =====
let state = {
  profile: { name: '', age: '', career: '', hand: '', style: '', photo: '' },
  matches: [],
  players: [],  // { id, name, memo, club }
  clubs: [],    // ['클럽A', '클럽B', ...]
  tournaments: [],
  currentResult: null,
  nextMatchId: 1,
  nextPlayerId: 1,
  sportType: 'badminton',
  rankingClubFilter: [],
  playerClubFilter: '전체',
  playerSort: 'name',
  lastStringDate: '',
  rackets: [],  // [{ id, name, string, tension, stringDate }] - 라켓 최대 4개
  stringInterval: 3,
  stringingHistory: [], // { id, name, date }
  tnTournaments: [],  // 토너먼트 데이터
};

let confirmCallback = null;

// ===== STORAGE =====
// Firebase 저장 경로: users/{userId}/nijiData
function _getDbRef() {
  if (!window._firebaseDB) return null;
  var uid = window._userId;
  if (!uid) return null;
  return window._firebaseDB.ref('users/' + uid + '/nijiData');
}

function save() {
  try {
    var saveState = JSON.parse(JSON.stringify(state));
    var photo = saveState.profile ? saveState.profile.photo : '';
    if (saveState.profile) saveState.profile.photo = '';
    delete saveState.currentResult;
    delete saveState._matchPage;
    delete saveState.editingMatchId;

    var dbRef = _getDbRef();
    if (dbRef) {
      dbRef.set(saveState)
        .catch(function(e) {
          console.warn('Firebase 저장 실패:', e);
          try { localStorage.setItem('nijiData_' + window._userId, JSON.stringify(saveState)); } catch(ex) {}
          showToast('⚠️ 저장 실패. 인터넷 연결을 확인하세요.');
        });
    } else {
      try { localStorage.setItem('nijiData_offline', JSON.stringify(saveState)); } catch(e) {}
    }

    // 사진은 localStorage에 저장 (500KB 이하만 - 저장공간 절약)
    if (photo && photo.length > 10) {
      try {
        if (photo.length < 500000) {
          localStorage.setItem('nijiPhoto_' + (window._userId || 'local'), photo);
        }
      } catch(e) {
        console.warn('사진 저장 실패(용량 초과):', e);
      }
    }
  } catch(e) {
    console.warn('save 오류:', e);
  }
}

function toggleTheme() {
  const isLight = document.body.classList.toggle('light-theme');
  document.getElementById('themeBtn').textContent = isLight ? '☀️' : '🌙';
  localStorage.setItem('nijiTheme', isLight ? 'light' : 'dark');
}

function applyTheme() {
  const theme = localStorage.getItem('nijiTheme');
  if (theme === 'light') {
    document.body.classList.add('light-theme');
    const btn = document.getElementById('themeBtn');
    if (btn) btn.textContent = '☀️';
  }
}
function _loadFromLocalStorage() {
  try {
    var uid = window._userId || 'offline';
    var d = localStorage.getItem('nijiData_' + uid) || localStorage.getItem('nijiData_offline') || localStorage.getItem('nijiData');
    if (d) _applyFirebaseData(JSON.parse(d));
    var photo = localStorage.getItem('nijiPhoto_' + uid) || localStorage.getItem('nijiPhoto');
    if (photo && photo.length > 10 && state.profile) state.profile.photo = photo;
  } catch(e) { console.warn('localStorage 로드 실패:', e); }
}

function load() {
  applyTheme();

  if (!window._firebaseAuth || !window._firebaseDB) {
    // Firebase 없으면 바로 오프라인 모드
    var msgEl = document.getElementById('loadingMsg');
    if (msgEl) msgEl.textContent = '오프라인 모드...';
    _loadFromLocalStorage();
    _initApp();
    return;
  }

  // 타임아웃 안전장치: 5초 안에 응답 없으면 로그인 화면 강제 표시
  var authTimeout = setTimeout(function() {
    console.warn('Firebase Auth 응답 없음 → 로그인 화면 표시');
    _showLoginScreen();
  }, 5000);

  // Firebase 인증 상태 감지 → 이미 로그인된 경우 자동 진입
  window._firebaseAuth.onAuthStateChanged(function(user) {
    clearTimeout(authTimeout); // 타임아웃 취소
    if (user) {
      // ✅ 이미 로그인됨 → 바로 데이터 로드
      window._userId = user.uid;
      window._userDisplayName = user.displayName || '';
      window._userEmail = user.email || '';
      window._userPhoto = user.photoURL || '';

      var msgEl = document.getElementById('loadingMsg');
      if (msgEl) msgEl.textContent = '데이터 불러오는 중...';

      _migrateOfflineData();
      _loadFromFirebase();
    } else {
      // ❌ 로그인 안 됨 → 로그인 화면 표시
      _showLoginScreen();
    }
  });
}

// 구글 로그인 화면 표시
function _showLoginScreen() {
  var loadingScreen = document.getElementById('loadingScreen');
  if (loadingScreen) {
    loadingScreen.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;gap:24px;padding:40px 20px;">
        <div style="font-family:'Orbitron',sans-serif;font-size:24px;font-weight:900;
          background:linear-gradient(135deg,#7c6af7,#f76ac8);
          -webkit-background-clip:text;-webkit-text-fill-color:transparent;letter-spacing:2px;">
          NIJI STRING
        </div>
        <div style="font-size:14px;color:#7a7a95;text-align:center;line-height:1.6;">
          테니스·배드민턴<br>경기 기록 & 스트링 관리
        </div>
        <button id="googleLoginBtn" onclick="signInWithGoogle()"
          style="display:flex;align-items:center;gap:12px;padding:14px 28px;
            background:#fff;color:#3c3c3c;border:none;border-radius:14px;
            font-size:15px;font-weight:700;cursor:pointer;box-shadow:0 4px 20px rgba(0,0,0,.25);
            min-width:240px;justify-content:center;">
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" 
            style="width:22px;height:22px;" alt="Google">
          Google로 로그인
        </button>
        <div id="loginMsg" style="font-size:12px;color:#7a7a95;min-height:20px;"></div>
      </div>
    `;
  }
}

// 구글 로그인 실행
function signInWithGoogle() {
  var btn = document.getElementById('googleLoginBtn');
  var msgEl = document.getElementById('loginMsg');
  if (btn) { btn.disabled = true; btn.textContent = '로그인 중...'; }
  if (msgEl) msgEl.textContent = '';

  var provider = new firebase.auth.GoogleAuthProvider();
  window._firebaseAuth.signInWithPopup(provider)
    .catch(function(e) {
      console.warn('팝업 실패, 리다이렉트 시도:', e.code);
      // 팝업이 막힌 경우(앱 내 브라우저 등) → 리다이렉트 방식으로 전환
      if (e.code === 'auth/popup-blocked' || e.code === 'auth/popup-closed-by-user') {
        window._firebaseAuth.signInWithRedirect(provider);
      } else {
        if (btn) { btn.disabled = false; btn.innerHTML = '<img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" style="width:22px;height:22px;" alt="Google"> Google로 로그인'; }
        if (msgEl) msgEl.textContent = '로그인 실패. 다시 시도해 주세요.';
      }
    });
}

// 로그아웃
function signOut() {
  showConfirm('로그아웃', '로그아웃 하시겠습니까?', '로그아웃', '취소', function() {
    window._firebaseAuth.signOut().then(function() {
      location.reload();
    });
  }, '🚪', false);
}

function _migrateOfflineData() {
  // 기존 구버전 데이터(nijiData) or 오프라인 데이터를 Firebase로 이전
  try {
    var oldData = localStorage.getItem('nijiData') || localStorage.getItem('nijiData_offline');
    if (!oldData || !window._userId) return;
    var parsed = JSON.parse(oldData);
    // Firebase에 아직 데이터 없을 때만 마이그레이션
    window._firebaseDB.ref('users/' + window._userId + '/nijiData').once('value')
      .then(function(snap) {
        if (!snap.exists()) {
          if (parsed.matches && parsed.matches.length > 0) {
            // 기존 데이터가 있으면 마이그레이션
            window._firebaseDB.ref('users/' + window._userId + '/nijiData').set(parsed)
              .then(function() {
                localStorage.removeItem('nijiData');
                localStorage.removeItem('nijiData_offline');
                console.log('기존 데이터 마이그레이션 완료');
              });
          }
        }
      }).catch(function(){});
  } catch(e) {}
}

function _loadFromFirebase() {
  return new Promise(function(resolve) {
    // 5초 타임아웃
    var timeout = setTimeout(function() {
      console.warn('Firebase 타임아웃 → localStorage 사용');
      _loadFromLocalStorage();
      _initApp();
      resolve();
    }, 5000);

    try {
      var dbRef = _getDbRef();
      if (!dbRef) {
        clearTimeout(timeout);
        _loadFromLocalStorage();
        _initApp();
        resolve();
        return;
      }
      dbRef.once('value')
        .then(function(snapshot) {
          clearTimeout(timeout);
          if (snapshot.exists()) _applyFirebaseData(snapshot.val());
          else _loadFromLocalStorage(); // Firebase에 데이터 없으면 localStorage 확인
          // 사진 불러오기
          try {
            var uid = window._userId || 'local';
            var photo = localStorage.getItem('nijiPhoto_' + uid) || localStorage.getItem('nijiPhoto');
            if (photo && photo.length > 10) {
              if (!state.profile) state.profile = {};
              state.profile.photo = photo;
            }
          } catch(e) {}
          _initApp();
          resolve();
        })
        .catch(function(e) {
          clearTimeout(timeout);
          console.warn('Firebase 로드 실패, localStorage 사용:', e);
          _loadFromLocalStorage();
          _initApp();
          resolve();
        });
    } catch(e) {
      clearTimeout(timeout);
      console.warn('Firebase 연결 오류:', e);
      _loadFromLocalStorage();
      _initApp();
      resolve();
    }
  });
}

// Firebase는 배열을 객체로 저장할 수 있음 → 안전하게 배열로 변환
function _toArray(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  // 객체인 경우 (Firebase가 배열을 {0:..., 1:...} 형태로 저장)
  if (typeof val === 'object') return Object.values(val);
  return [];
}

function _applyFirebaseData(parsed) {
  try {
    if (!parsed || typeof parsed !== 'object') return;

    // 기본 값 병합
    state.sportType     = parsed.sportType     || state.sportType;
    state.nextMatchId   = parsed.nextMatchId   || state.nextMatchId;
    state.nextPlayerId  = parsed.nextPlayerId  || state.nextPlayerId;
    state.playerClubFilter = parsed.playerClubFilter || '전체';
    state.playerSort    = parsed.playerSort    || 'name';
    state.lastStringDate = parsed.lastStringDate || '';
    state.stringInterval = parsed.stringInterval || 3;

    // 배열 데이터 (Firebase 객체→배열 변환 포함)
    state.matches          = _toArray(parsed.matches);
    state.players          = _toArray(parsed.players);
    state.clubs            = _toArray(parsed.clubs);
    // tournaments: rounds/games 내부 배열도 변환
    state.tournaments = _toArray(parsed.tournaments).map(function(t) {
      if (!t) return null;
      t.players = _toArray(t.players);
      t.rounds = _toArray(t.rounds).map(function(r) {
        if (!r) return null;
        r.games = _toArray(r.games).map(function(g) {
          if (!g) return null;
          if (!Array.isArray(g.teamA)) g.teamA = _toArray(g.teamA);
          if (!Array.isArray(g.teamB)) g.teamB = _toArray(g.teamB);
          return g;
        }).filter(Boolean);
        if (!Array.isArray(r.bye)) r.bye = _toArray(r.bye);
        return r;
      }).filter(Boolean);
      return t;
    }).filter(Boolean);
    state.stringingHistory = _toArray(parsed.stringingHistory);
    // 라켓 배열 로드 (다중 라켓 지원)
    state.rackets = _toArray(parsed.rackets);
    // tnTournaments: bracket 내부 games 배열도 변환 필요
    state.tnTournaments = _toArray(parsed.tnTournaments).map(function(t) {
      if (!t) return null;
      t.bracket = _toArray(t.bracket).map(function(r) {
        if (!r) return null;
        r.games = _toArray(r.games);
        return r;
      }).filter(Boolean);
      t.players = _toArray(t.players);
      return t;
    }).filter(Boolean);
    state.rankingClubFilter = _toArray(parsed.rankingClubFilter);

    // 프로필 (photo는 Firebase에 저장 안 함 → 덮어쓰지 않음)
    if (parsed.profile && typeof parsed.profile === 'object') {
      var savedPhoto = state.profile ? state.profile.photo : '';
      state.profile = { ...state.profile, ...parsed.profile };
      // Firebase의 photo는 항상 '' → 기존 사진 유지
      if (savedPhoto) state.profile.photo = savedPhoto;
    }

    // 구버전 선수 형식 마이그레이션 (문자열 → 객체)
    if (state.players.length && typeof state.players[0] === 'string') {
      state.players = state.players.map(function(n, i) {
        return { id: i + 1, name: n, memo: '', clubs: [] };
      });
      state.nextPlayerId = state.players.length + 1;
    }

    // 선수 필드 정규화
    state.players = state.players.map(function(p) {
      if (!('gender' in p)) p.gender = '';
      if (!('grade'  in p)) p.grade  = '';
      if (!p || typeof p !== 'object') return null;
      return {
        memo: '', clubs: [], age: '', career: '', hand: '', style: '',
        ...p,
        clubs: _toArray(p.clubs).length ? _toArray(p.clubs) : (p.club ? [p.club] : []),
      };
    }).filter(Boolean);

    // id 보정 - 0이거나 비정상이면 최대값 기준으로 재설정
    const maxMatchId = state.matches.reduce((max, m) => Math.max(max, m.id || 0), 0);
    const maxPlayerId = state.players.reduce((max, p) => Math.max(max, p.id || 0), 0);
    if (!state.nextMatchId || state.nextMatchId <= maxMatchId) state.nextMatchId = maxMatchId + 1;
    if (!state.nextPlayerId || state.nextPlayerId <= maxPlayerId) state.nextPlayerId = maxPlayerId + 1;

    state._matchPage = 0;
    state.editingMatchId = null;

  } catch(e) {
    console.warn('데이터 적용 오류:', e);
  }
}

function _initApp() {
  // 로딩 화면 숨기기
  var ls = document.getElementById('loadingScreen');
  if (ls) ls.style.display = 'none';

  if (document.getElementById('sportType')) {
    document.getElementById('sportType').value = state.sportType || 'badminton';
  }
  renderProfile();
  renderMatchList();
  setTodayDate();

  // 내 고유 ID 표시 (공유 탭)
  var uidEl = document.getElementById('myUidDisplay');
  if (uidEl) {
    var uid = window._userId || '(오프라인)';
    uidEl.textContent = uid;
  }

  // 구글 계정 정보 표시 (공유 탭)
  var nameEl = document.getElementById('googleDisplayName');
  var emailEl = document.getElementById('googleEmailDisplay');
  var imgEl = document.getElementById('googleProfileImg');
  var emojiEl = document.getElementById('googleProfileEmoji');
  if (nameEl) nameEl.textContent = window._userDisplayName || '구글 계정';
  if (emailEl) emailEl.textContent = window._userEmail || '';
  if (imgEl && window._userPhoto) {
    imgEl.src = window._userPhoto;
    imgEl.style.display = 'block';
    if (emojiEl) emojiEl.style.display = 'none';
  }
}

// ===== 저장공간 정리 =====
function clearLocalStorageCache() {
  showConfirm('저장공간 정리', '기기의 캐시를 삭제합니다. 데이터는 Firebase에 안전하게 보관됩니다.', '🧹', function() {
    try {
      // 현재 사용자 사진만 남기고 나머지 오래된 데이터 삭제
      var uid = window._userId || 'local';
      var photo = localStorage.getItem('nijiPhoto_' + uid);
      // 모든 niji 관련 키 삭제
      var keysToDelete = [];
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.startsWith('niji')) keysToDelete.push(k);
      }
      keysToDelete.forEach(function(k) { localStorage.removeItem(k); });
      // 현재 사용자 사진 복원 (사진은 보존)
      if (photo) localStorage.setItem('nijiPhoto_' + uid, photo);
      localStorage.setItem('nijiTheme', document.body.classList.contains('light-theme') ? 'light' : 'dark');
      showToast('🧹 저장공간 정리 완료!');
    } catch(e) {
      showToast('❌ 정리 실패: ' + e.message);
    }
  });
}

// ===== NAVIGATION =====
function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const pageEl = document.getElementById('page-' + name);
  if (pageEl) pageEl.classList.add('active');
  const navEl = document.getElementById('nav-' + name);
  if (navEl) navEl.classList.add('active');
  else if (name === 'player-detail') document.getElementById('nav-players').classList.add('active');
  // 스크롤 맨 위로 초기화
  const content = document.querySelector('.content');
  if (content) content.scrollTop = 0;
  if (name === 'stats') renderStats();
  if (name === 'players') renderPlayers();
  if (name === 'match') { renderMatchList(); if (!state.editingMatchId) setTodayDate(); }
  if (name === 'stringing') renderStringing();
  if (name === 'tournament') {
    // 탭 진입 시 현재 선택된 탭 기준으로 렌더링
    renderTournamentSection();
    // 스크롤 초기화 (대회 탭은 content 안에 있으므로)
    if (content) content.scrollTop = 0;
  }
}

// ===== 한울방식 =====
let tvSelected = [];
let tvCurrentId = null;
let tvCurrentTab = 'bracket';

function renderTournamentList() {
  const el = document.getElementById('tv-root');
  if (!el) return;
  const list = state.tournaments || [];
  let html = `
    <div class="page-header">🏆 한울방식</div>
    <div class="page-sub">파트너·상대방 순환 복식 대회</div>
    <button onclick="showTVCreate()" style="width:100%;padding:14px;background:var(--accent);color:#fff;border:none;border-radius:12px;font-size:15px;font-weight:700;cursor:pointer;margin-bottom:16px;">+ 새 대회 만들기</button>
  `;
  if (list.length === 0) {
    html += '<div style="text-align:center;color:var(--text-muted);padding:40px 0;">대회가 없어요.<br>새 대회를 만들어보세요!</div>';
  } else {
    html += list.slice().reverse().map(t => {
      const total = t.rounds.reduce((s,r) => s + r.games.length, 0);
      const done = t.rounds.reduce((s,r) => s + r.games.filter(g=>g.scoreA!==null).length, 0);
      return `<div style="background:var(--surface);border-radius:12px;padding:16px;margin-bottom:12px;">
        <div onclick="tvOpen(${t.id})" style="cursor:pointer;margin-bottom:10px;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div>
              <div id="tv-name-${t.id}" style="font-size:16px;font-weight:700;">${escHtml(t.name)}</div>
              <div style="font-size:13px;color:var(--text-muted);margin-top:4px;">${t.date} · ${t.players.length}명 · ${t.numGames}게임</div>
            </div>
            <div style="font-size:12px;padding:4px 10px;border-radius:20px;background:${done===total?'rgba(74,222,128,.15)':'rgba(124,106,247,.15)'};color:${done===total?'#4ade80':'var(--accent)'};">
              ${done===total?'완료':'진행중'}
            </div>
          </div>
        </div>
        <div style="display:flex;gap:8px;">
          <button onclick="tvEdit(${t.id})" style="flex:1;padding:8px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:13px;cursor:pointer;">✏️ 수정</button>
          <button onclick="tvDelete(${t.id})" style="flex:1;padding:8px;background:rgba(248,113,113,.1);border:1px solid rgba(248,113,113,.3);border-radius:8px;color:#f87171;font-size:13px;cursor:pointer;">🗑️ 삭제</button>
        </div>
      </div>`;
    }).join('');
  }
  el.innerHTML = html;
}

function showTVCreate() {
  tvSelected = [];
  document.getElementById('tv-tname').value = '';
  document.getElementById('tv-tdate').value = getTodayStr();
  document.getElementById('tv-tgames').value = '4';

  // 클럽별 그룹으로 선수 렌더
  const players = state.players || [];
  const clubs = state.clubs || [];

  let html = '';

  if (players.length === 0) {
    html = '<div style="color:var(--text-muted);font-size:13px;">선수 탭에서 먼저 선수를 등록하세요.</div>';
  } else {
    // 전체 선택 버튼
    html += `<div style="margin-bottom:8px;">
      <button onclick="tvSelectAll()" style="padding:6px 12px;background:var(--surface2);border:1px solid var(--border);border-radius:20px;color:var(--text-muted);font-size:12px;cursor:pointer;margin-right:6px;">전체 선택</button>
      <button onclick="tvClearAll()" style="padding:6px 12px;background:var(--surface2);border:1px solid var(--border);border-radius:20px;color:var(--text-muted);font-size:12px;cursor:pointer;">전체 해제</button>
    </div>`;

    // 클럽별 그룹
    const grouped = {};
    const noClub = [];
    players.forEach(p => {
      const playerClubs = p.clubs && p.clubs.length > 0 ? p.clubs : [];
      if (playerClubs.length === 0) {
        noClub.push(p);
      } else {
        playerClubs.forEach(c => {
          if (!grouped[c]) grouped[c] = [];
          grouped[c].push(p);
        });
      }
    });

    // 클럽별 섹션
    Object.entries(grouped).forEach(([club, clubPlayers]) => {
      html += `<div style="margin-bottom:10px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
          <span style="font-size:12px;font-weight:700;color:var(--accent);">🏠 ${escHtml(club)}</span>
          <button onclick="tvSelectClub(this.dataset.club)" data-club="${escHtml(club)}" style="padding:3px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:20px;color:var(--text-muted);font-size:11px;cursor:pointer;">전체선택</button>
        </div>
        <div>
          ${clubPlayers.map(p => `<span id="tvbtn-${p.id}" data-pname="${escHtml(p.name)}" onclick="tvToggle(this.dataset.pname,this)" style="display:inline-block;margin:3px;padding:7px 13px;border-radius:20px;cursor:pointer;font-size:14px;background:var(--surface2);color:var(--text-muted);">${escHtml(p.name)}</span>`).join('')}
        </div>
      </div>`;
    });

    // 클럽 없는 선수
    if (noClub.length > 0) {
      html += `<div style="margin-bottom:10px;">
        <div style="font-size:12px;font-weight:700;color:var(--text-muted);margin-bottom:6px;">기타</div>
        <div>
          ${noClub.map(p => `<span id="tvbtn-${p.id}" data-pname="${escHtml(p.name)}" onclick="tvToggle(this.dataset.pname,this)" style="display:inline-block;margin:3px;padding:7px 13px;border-radius:20px;cursor:pointer;font-size:14px;background:var(--surface2);color:var(--text-muted);">${escHtml(p.name)}</span>`).join('')}
        </div>
      </div>`;
    }
  }

  document.getElementById('tv-player-btns').innerHTML = html;
  document.getElementById('tv-selected').innerHTML =
    '<div style="color:var(--text-muted);font-size:13px;">선수를 선택하세요 (최소 4명)</div>';
  document.getElementById('tvCreateModal').classList.add('open');
}

function tvSelectClub(club) {
  const players = state.players || [];
  players.filter(p => p.clubs && p.clubs.includes(club)).forEach(p => {
    if (!tvSelected.includes(p.name)) {
      tvSelected.push(p.name);
      const el = document.getElementById('tvbtn-' + p.id);
      if (el) { el.style.background = 'var(--accent)'; el.style.color = '#fff'; }
    }
  });
  tvRenderSelected();
}

function tvSelectAll() {
  const players = state.players || [];
  players.forEach(p => {
    if (!tvSelected.includes(p.name)) {
      tvSelected.push(p.name);
      const el = document.getElementById('tvbtn-' + p.id);
      if (el) { el.style.background = 'var(--accent)'; el.style.color = '#fff'; }
    }
  });
  tvRenderSelected();
}

function tvClearAll() {
  tvSelected = [];
  const players = state.players || [];
  players.forEach(p => {
    const el = document.getElementById('tvbtn-' + p.id);
    if (el) { el.style.background = 'var(--surface2)'; el.style.color = 'var(--text-muted)'; }
  });
  tvRenderSelected();
}

function tvToggle(name, el) {
  const idx = tvSelected.indexOf(name);
  if (idx >= 0) {
    tvSelected.splice(idx, 1);
    el.style.background = 'var(--surface2)';
    el.style.color = 'var(--text-muted)';
  } else {
    tvSelected.push(name);
    el.style.background = 'var(--accent)';
    el.style.color = '#fff';
  }
  tvRenderSelected();
}

function tvAddPlayer() {
  const input = document.getElementById('tv-new-name');
  const name = input.value.trim();
  if (!name) return;
  if (!tvSelected.includes(name)) {
    tvSelected.push(name);
    tvRenderSelected();
  }
  input.value = '';
}

function tvRenderSelected() {
  const el = document.getElementById('tv-selected');
  if (!el) return;
  if (tvSelected.length === 0) {
    el.innerHTML = '<div style="color:var(--text-muted);font-size:13px;">선수를 선택하세요 (최소 4명)</div>';
    return;
  }
  el.innerHTML = `<div style="background:var(--surface);border-radius:10px;padding:12px;">
    <div style="font-size:13px;color:var(--text-muted);margin-bottom:4px;">선택된 선수 ${tvSelected.length}명</div>
    <div style="font-size:11px;color:var(--text-muted);margin-bottom:8px;">↕️ 순서 조정으로 시드 배정 (위가 강한 선수)</div>
    ${tvSelected.map((n,i) => `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border);">
      <span style="font-size:13px;color:var(--accent);font-weight:700;width:24px;">${i+1}.</span>
      <span style="flex:1;font-size:14px;">${escHtml(n)}</span>
      <div style="display:flex;gap:4px;align-items:center;">
        <button onclick="tvMoveUp(${i})" ${i===0?'disabled':''} style="background:var(--surface2);border:1px solid var(--border);border-radius:6px;color:${i===0?'var(--text-muted)':'var(--text)'};cursor:${i===0?'default':'pointer'};padding:2px 8px;font-size:14px;">↑</button>
        <button onclick="tvMoveDown(${i})" ${i===tvSelected.length-1?'disabled':''} style="background:var(--surface2);border:1px solid var(--border);border-radius:6px;color:${i===tvSelected.length-1?'var(--text-muted)':'var(--text)'};cursor:${i===tvSelected.length-1?'default':'pointer'};padding:2px 8px;font-size:14px;">↓</button>
        <button onclick="tvRemove(${i})" style="background:none;border:none;color:#f87171;cursor:pointer;font-size:18px;padding:0 4px;">×</button>
      </div>
    </div>`).join('')}
  </div>`;
}

function tvMoveUp(idx) {
  if (idx === 0) return;
  [tvSelected[idx-1], tvSelected[idx]] = [tvSelected[idx], tvSelected[idx-1]];
  tvRenderSelected();
}

function tvMoveDown(idx) {
  if (idx === tvSelected.length-1) return;
  [tvSelected[idx+1], tvSelected[idx]] = [tvSelected[idx], tvSelected[idx+1]];
  tvRenderSelected();
}

function tvRemove(idx) {
  tvSelected.splice(idx, 1);
  tvRenderSelected();
}

function tvDelete(id) {
  showConfirm('대회 삭제', '삭제하면 복구할 수 없습니다.', '🗑️', () => {
    state.tournaments = state.tournaments.filter(t => t.id !== id);
    save();
    showToast('대회가 삭제됐어요!');
    renderTournamentList();
  });
}

function tvEdit(id) {
  const t = state.tournaments.find(x => x.id === id);
  if (!t) return;
  // 인라인 편집: 카드 이름 클릭 시 input으로 교체
  const nameEl = document.getElementById('tv-name-' + id);
  if (!nameEl) return;
  const input = document.createElement('input');
  input.value = t.name;
  input.style.cssText = 'font-size:16px;font-weight:700;width:100%;background:var(--surface2);border:1px solid var(--accent);border-radius:8px;padding:4px 8px;color:var(--text);font-family:inherit;';
  input.onblur = () => {
    const val = input.value.trim();
    if (val && val !== t.name) {
      t.name = val;
      save();
      showToast('수정됐어요!');
    }
    renderTournamentList();
  };
  input.onkeydown = (e) => { if (e.key === 'Enter') input.blur(); if (e.key === 'Escape') renderTournamentList(); };
  nameEl.replaceWith(input);
  input.focus();
  input.select();
}

function tvCreate() {
  const name = document.getElementById('tv-tname').value.trim();
  const date = document.getElementById('tv-tdate').value;
  const numGames = parseInt(document.getElementById('tv-tgames').value);
  if (!name) { showToast('대회 이름을 입력하세요'); return; }
  if (tvSelected.length < 4) { showToast('최소 4명 이상 선택하세요'); return; }
  const t = {
    id: Date.now(), name, date, numGames,
    players: [...tvSelected],
    rounds: genHanul([...tvSelected], numGames)
  };
  if (!state.tournaments) state.tournaments = [];
  state.tournaments.push(t);
  save();
  closeModal('tvCreateModal');
  showToast('대회가 생성됐어요!');
  renderTournamentList();
  setTimeout(() => tvOpen(t.id), 300);
}

function tvOpen(id) {
  tvCurrentId = id;
  tvCurrentTab = 'bracket';
  const t = state.tournaments.find(x => x.id === id);
  if (!t) return;
  document.getElementById('tv-modal-name').textContent = t.name;
  tvRefreshModal();
  document.getElementById('tvDetailModal').classList.add('open');
}

function tvTabSwitch(tab) {
  tvCurrentTab = tab;
  document.getElementById('tv-tab-b').style.background = tab==='bracket'?'var(--accent)':'var(--surface2)';
  document.getElementById('tv-tab-b').style.color = tab==='bracket'?'#fff':'var(--text-muted)';
  document.getElementById('tv-tab-r').style.background = tab==='ranking'?'var(--accent)':'var(--surface2)';
  document.getElementById('tv-tab-r').style.color = tab==='ranking'?'#fff':'var(--text-muted)';
  tvRefreshModal();
}

function tvRefreshModal() {
  const t = state.tournaments.find(x => x.id === tvCurrentId);
  if (!t) return;
  const el = document.getElementById('tv-modal-content');
  el.innerHTML = tvCurrentTab === 'bracket' ? tvBracketHTML(t) : tvRankingHTML(t);
}

function tvBracketHTML(t) {
  let html = '';
  t.rounds.forEach((round, ri) => {
    html += `<div style="margin-bottom:20px;">
      <div style="font-size:15px;font-weight:700;color:var(--accent);margin-bottom:10px;">${round.gameNum}게임</div>`;
    round.games.forEach((game, gi) => {
      const sA = game.scoreA !== null ? game.scoreA : '';
      const sB = game.scoreB !== null ? game.scoreB : '';
      const aW = game.scoreA !== null && game.scoreA > game.scoreB;
      const bW = game.scoreB !== null && game.scoreB > game.scoreA;
      html += `<div style="background:var(--surface2);border-radius:12px;padding:14px;margin-bottom:8px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="flex:1;text-align:center;">
            <div style="font-size:14px;font-weight:${aW?700:400};color:${aW?'#4ade80':'var(--text)'};margin-bottom:4px;">${escHtml(game.teamA[0])}</div>
            <div style="font-size:14px;font-weight:${aW?700:400};color:${aW?'#4ade80':'var(--text)'};">${escHtml(game.teamA[1])}</div>
          </div>
          <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
            <input type="number" min="0" value="${sA}" oninput="tvScore(${t.id},${ri},${gi},'A',this.value)"
              inputmode="numeric" pattern="[0-9]*"
              style="width:46px;padding:8px 4px;text-align:center;background:var(--surface2);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:16px;font-weight:700;">
            <span style="color:var(--text-muted);font-size:16px;">:</span>
            <input type="number" min="0" value="${sB}" oninput="tvScore(${t.id},${ri},${gi},'B',this.value)"
              inputmode="numeric" pattern="[0-9]*"
              style="width:46px;padding:8px 4px;text-align:center;background:var(--surface2);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:16px;font-weight:700;">
          </div>
          <div style="flex:1;text-align:center;">
            <div style="font-size:14px;font-weight:${bW?700:400};color:${bW?'#4ade80':'var(--text)'};margin-bottom:4px;">${escHtml(game.teamB[0])}</div>
            <div style="font-size:14px;font-weight:${bW?700:400};color:${bW?'#4ade80':'var(--text)'};">${escHtml(game.teamB[1])}</div>
          </div>
        </div>
      </div>`;
    });
    if (round.bye && round.bye.length > 0) {
      html += `<div style="font-size:12px;color:var(--text-muted);padding:8px 12px;background:var(--surface);border-radius:8px;margin-bottom:8px;">⏸ 쉬는 선수: ${round.bye.map(b=>escHtml(b)).join(', ')}</div>`;
    }
    html += '</div>';
  });
  return html;
}

function tvScore(tid, ri, gi, team, val) {
  const t = state.tournaments.find(x => x.id === tid);
  if (!t) return;
  const trimmed = String(val).trim();
  if (trimmed === '') {
    // 빈 값 입력 중 → null로 초기화
    if (team==='A') t.rounds[ri].games[gi].scoreA = null;
    else t.rounds[ri].games[gi].scoreB = null;
    save();
    return;
  }
  const v = parseInt(trimmed);
  if (isNaN(v) || v < 0) return;
  if (team==='A') t.rounds[ri].games[gi].scoreA = v;
  else t.rounds[ri].games[gi].scoreB = v;

  // 양쪽 스코어 다 입력됐으면 경기기록에 자동 반영
  const game = t.rounds[ri].games[gi];
  if (game.scoreA !== null && game.scoreB !== null) {
    tvSyncToMatch(t, ri, gi);
  }
  save();
}

function tvSyncToMatch(t, ri, gi) {
  const game = t.rounds[ri].games[gi];
  const myName = state.profile.name || '선수';

  // 내가 이 게임에 참여했는지 확인
  const inA = game.teamA.includes(myName);
  const inB = game.teamB.includes(myName);
  if (!inA && !inB) return;

  const myTeam = inA ? game.teamA : game.teamB;
  const oppTeam = inA ? game.teamB : game.teamA;
  const myScore = inA ? game.scoreA : game.scoreB;
  const oppScore = inA ? game.scoreB : game.scoreA;

  // 파트너 (나 제외)
  const partner = myTeam.find(p => p !== myName) || '';
  // 상대 (두 명 모두)
  const opponent = oppTeam[0] || '';
  const opponent2 = oppTeam[1] || '';

  const result = myScore > oppScore ? 'win' : myScore < oppScore ? 'lose' : 'win';

  // 기존 대회 기록 찾기 (같은 대회+라운드+게임)
  const matchMemo = `[${t.name}] ${t.rounds[ri].gameNum}게임`;
  const existIdx = state.matches.findIndex(m => m.memo && m.memo === matchMemo && m.partner === partner);

  const matchData = {
    id: existIdx >= 0 ? state.matches[existIdx].id : state.nextMatchId++,
    date: t.date,
    format: 'doubles',
    partner,
    opponent,
    opponent2,
    result,
    myScore,
    oppScore,
    myTiebreak: '',
    oppTiebreak: '',
    memo: matchMemo,
  };

  if (existIdx >= 0) {
    state.matches[existIdx] = matchData;
  } else {
    state.matches.push(matchData);
  }
}

function tvRankingHTML(t) {
  const stats = {};
  t.players.forEach(p => stats[p] = {w:0,l:0,d:0,gf:0,ga:0});
  t.rounds.forEach(r => r.games.forEach(g => {
    if (g.scoreA===null||g.scoreB===null) return;
    const add = (players,gf,ga,win,lose) => players.forEach(p => {
      if (!stats[p]) stats[p]={w:0,l:0,d:0,gf:0,ga:0};
      stats[p].gf+=gf; stats[p].ga+=ga;
      if(win) stats[p].w++; else if(lose) stats[p].l++; else stats[p].d++;
    });
    add(g.teamA,g.scoreA,g.scoreB,g.scoreA>g.scoreB,g.scoreA<g.scoreB);
    add(g.teamB,g.scoreB,g.scoreA,g.scoreB>g.scoreA,g.scoreB<g.scoreA);
  }));
  const ranked = Object.entries(stats)
    .map(([name,s])=>({name,...s,pt:s.w*2+s.d,diff:s.gf-s.ga}))
    .sort((a,b)=>b.pt-a.pt||b.diff-a.diff||b.gf-a.gf);
  const medals=['🥇','🥈','🥉'];
  let html = `<div style="background:var(--surface);border-radius:12px;overflow:hidden;">
    <div style="display:grid;grid-template-columns:36px 1fr 36px 36px 36px 44px;padding:10px 12px;background:var(--surface2);font-size:12px;color:var(--text-muted);font-weight:700;gap:4px;">
      <span>#</span><span>이름</span><span style="text-align:center;">승</span><span style="text-align:center;">패</span><span style="text-align:center;">득점</span><span style="text-align:center;">승점</span>
    </div>`;
  ranked.forEach((p,i) => {
    html+=`<div style="display:grid;grid-template-columns:36px 1fr 36px 36px 36px 44px;padding:12px;border-top:1px solid var(--border);align-items:center;gap:4px;">
      <span style="font-size:${i<3?16:14}px;">${medals[i]||i+1}</span>
      <span style="font-size:14px;font-weight:${i<3?700:400};">${escHtml(p.name)}</span>
      <span style="text-align:center;color:#4ade80;font-size:14px;">${p.w}</span>
      <span style="text-align:center;color:#f87171;font-size:14px;">${p.l}</span>
      <span style="text-align:center;font-size:14px;">${p.gf}</span>
      <span style="text-align:center;font-weight:700;color:var(--accent);font-size:14px;">${p.pt}</span>
    </div>`;
  });
  html+='</div>';
  return html;
}

// 한울 방식 대진표 생성
function genHanul(players, numGames) {
  const n = players.length;
  const rounds = [];
  const pCnt = {}, oCnt = {};
  const k = (a,b) => a < b ? a+'|'+b : b+'|'+a;
  for (let g = 0; g < numGames; g++) {
    const used = new Set();
    const games = [];
    const bye = [];
    const courts = Math.floor(n / 4);
    const extra = n % 4;
    if (extra > 0) {
      const byeCount = {};
      players.forEach(p => { byeCount[p] = 0; });
      rounds.forEach(r => r.bye.forEach(p => { byeCount[p] = (byeCount[p]||0) + 1; }));
      // 수정: 덜 쉰 선수(오름차순)가 이번에 bye가 되도록
      const sorted = [...players].sort((a,b) => byeCount[a] - byeCount[b]);
      sorted.slice(0, extra).forEach(p => { bye.push(p); used.add(p); });
    }
    const avail = players.filter(p => !used.has(p));
    for (let c = 0; c < courts; c++) {
      const pool = avail.filter(p => !used.has(p));
      if (pool.length < 4) break;
      let best = null, bestScore = Infinity;
      for (let i=0;i<pool.length;i++)
      for (let j=i+1;j<pool.length;j++)
      for (let l=j+1;l<pool.length;l++)
      for (let m=l+1;m<pool.length;m++) {
        const g4=[pool[i],pool[j],pool[l],pool[m]];
        [[g4[0],g4[1],g4[2],g4[3]],[g4[0],g4[2],g4[1],g4[3]],[g4[0],g4[3],g4[1],g4[2]]].forEach(([a1,a2,b1,b2])=>{
          const s=(pCnt[k(a1,a2)]||0)*3+(pCnt[k(b1,b2)]||0)*3+(oCnt[k(a1,b1)]||0)+(oCnt[k(a1,b2)]||0)+(oCnt[k(a2,b1)]||0)+(oCnt[k(a2,b2)]||0);
          if(s<bestScore){bestScore=s;best={a:[a1,a2],b:[b1,b2]};}
        });
      }
      if(!best) break;
      pCnt[k(best.a[0],best.a[1])]=(pCnt[k(best.a[0],best.a[1])]||0)+1;
      pCnt[k(best.b[0],best.b[1])]=(pCnt[k(best.b[0],best.b[1])]||0)+1;
      [best.b[0],best.b[1]].forEach(o=>[best.a[0],best.a[1]].forEach(a=>{oCnt[k(a,o)]=(oCnt[k(a,o)]||0)+1;}));
      best.a.concat(best.b).forEach(p=>used.add(p));
      games.push({teamA:best.a,teamB:best.b,scoreA:null,scoreB:null});
    }
    rounds.push({gameNum:g+1,games,bye});
  }
  return rounds;
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2000);
}

// ===== MODAL =====
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

// 모달 오버레이 바깥 터치시 닫기
document.addEventListener('DOMContentLoaded', function() {
  document.querySelectorAll('.modal-overlay').forEach(function(overlay) {
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) {
        overlay.classList.remove('open');
      }
    });
  });
});
function showManual() { document.getElementById('manualModal').classList.add('open'); }

// ===== CONFIRM =====
function showConfirm(title, desc, icon, cb, okLabel = '삭제') {
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmDesc').textContent = desc;
  document.getElementById('confirmIcon').textContent = icon;
  document.getElementById('confirmOkBtn').textContent = okLabel;
  confirmCallback = cb;
  document.getElementById('confirmDialog').classList.add('open');
}
function closeConfirm() {
  document.getElementById('confirmDialog').classList.remove('open');
  confirmCallback = null;
}
function doConfirm() {
  if (confirmCallback) confirmCallback();
  closeConfirm();
}

// ===== PROFILE =====
// ===== PROFILE 필드 정의 (기본 정보만 — 장비는 rackets 배열로 관리) =====
const PROFILE_FIELDS = [
  { key:'name',   lbl:'NAME',  icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" width="18" height="18"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>', type:'text', ph:'이름 / 닉네임', full:false, section:'기본 정보' },
  { key:'club',   lbl:'CLUB',  icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" width="18" height="18"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>', type:'text', ph:'소속 클럽', full:false },
  { key:'age',    lbl:'AGE',   icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" width="18" height="18"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 15"/></svg>', type:'select', opts:['10대','20대','30대','40대','50대','60대 이상'], full:false },
  { key:'hand',   lbl:'HAND',  icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" width="18" height="18"><path d="M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8.5A6 6 0 0 0 18 14v-3a2 2 0 0 0-4 0"/></svg>', type:'select', opts:['오른손','왼손'], full:false },
  { key:'career', lbl:'EXP',   icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" width="18" height="18"><circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/></svg>', type:'select', opts:['6개월 미만','6개월~1년','1~2년','2~5년','5~10년','10년 이상'], full:false },
  { key:'style',  lbl:'STYLE', icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" width="18" height="18"><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>', type:'select', opts:['공격형','수비형','올라운드','네트플레이','베이스라인'], full:false },
];

// ===== 라켓 슬롯 기본 구조 =====
function _defaultRacket(idx) {
  return { id: Date.now() + idx, name: '', string: '', tension: '', stringDate: '' };
}

// rackets 배열 초기화 (기존 단일 필드 → 배열 마이그레이션)
function _initRackets() {
  if (!state.rackets || !Array.isArray(state.rackets) || state.rackets.length === 0) {
    const p = state.profile || {};
    // 기존 단일 필드가 있으면 첫 번째 슬롯으로 마이그레이션
    state.rackets = [{
      id: Date.now(),
      name: p.racket || '',
      string: p.string || '',
      tension: p.tension || '',
      stringDate: p.stringDate || state.lastStringDate || ''
    }];
  }
}

// ===== renderProfile =====
function renderProfile() {
  if (!state.profile) state.profile = {};
  _initRackets();
  const p = state.profile;
  const name = p.name || '선수';
  const initial = name.charAt(0).toUpperCase();

  const avatarBtn = document.getElementById('avatarBtn');
  if (avatarBtn) avatarBtn.textContent = initial;

  const nameRow = document.getElementById('profileNameBig');
  if (nameRow) {
    nameRow.innerHTML = `
      <span class="pf-club-tag">${p.club ? escHtml(p.club.toUpperCase()) : ''}</span>
      <span class="pf-name-text">${escHtml(name)}</span>`;
  }

  const avatarInitial = document.getElementById('avatarInitial');
  const avatarImage   = document.getElementById('avatarImage');
  if (avatarInitial && avatarImage) {
    if (p.photo) {
      avatarInitial.style.display = 'none';
      avatarImage.src = p.photo;
      avatarImage.style.display = 'block';
    } else {
      avatarInitial.textContent = initial;
      avatarInitial.style.display = 'flex';
      avatarImage.style.display = 'none';
    }
  }

  const grid = document.getElementById('profileInfoGrid');
  if (!grid) return;

  const fieldMap = {};
  PROFILE_FIELDS.forEach(f => fieldMap[f.key] = f);

  // ── 기본 정보 그룹 렌더링 ──
  const groups = [
    ['name','club'],
    ['age','hand'],
    ['career','style'],
  ];

  let html = '';
  groups.forEach(keys => {
    html += '<div class="pf-row-2">';
    keys.forEach(key => {
      const f = fieldMap[key];
      if (!f) return;
      const val = p[f.key] || '';
      const inputEl = f.type === 'select'
        ? `<select class="pf-item-select${val?'':' unset'}" onchange="this.classList.toggle('unset',!this.value);saveProfileField('${f.key}',this.value)">
             <option value="">미설정</option>
             ${f.opts.map(o=>`<option${val===o?' selected':''}>${o}</option>`).join('')}
           </select>`
        : `<input class="pf-item-input" value="${escHtml(val)}" placeholder="${f.ph||''}"
             oninput="pfDebounceSave('${f.key}',this.value)"
             onkeydown="if(event.key==='Enter')this.blur()">`;
      html += `<div class="pf-item">
        <div class="pf-item-icon">${f.icon}</div>
        <div class="pf-item-body">
          <div class="pf-item-lbl">[${f.lbl}]</div>
          ${inputEl}
        </div>
      </div>`;
    });
    html += '</div>';
  });

  // ── 라켓 슬롯 렌더링 ──
  const racketIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" width="18" height="18"><ellipse cx="11" cy="9" rx="6" ry="8" transform="rotate(-45 11 9)"/><line x1="16" y1="16" x2="21" y2="21"/><line x1="8" y1="11" x2="11" y2="8"/></svg>';
  const labels = ['🎾 라켓 1', '🎾 라켓 2', '🎾 라켓 3', '🎾 라켓 4'];

  html += '<div class="racket-slot-wrap">';
  state.rackets.forEach((r, i) => {
    html += `
    <div class="racket-slot" id="racket-slot-${i}">
      <div class="racket-slot-header">
        <span class="racket-slot-title">${racketIcon}&nbsp;${labels[i] || ('라켓 ' + (i+1))}</span>
        ${i > 0 ? `<button class="racket-del-btn" onclick="deleteRacketSlot(${i})">✕ 삭제</button>` : ''}
      </div>
      <div class="racket-slot-body">
        <div class="pf-item" style="border:none;padding:0;">
          <div class="pf-item-body" style="width:100%;">
            <div class="racket-slot-lbl">RACQUET</div>
            <input class="pf-item-input" value="${escHtml(r.name)}" placeholder="예) 윌슨 블레이드 98"
              oninput="updateRacketField(${i},'name',this.value)"
              onkeydown="if(event.key==='Enter')this.blur()">
          </div>
        </div>
        <div class="racket-slot-row">
          <div class="racket-slot-field">
            <div class="racket-slot-lbl">STRING</div>
            <input class="pf-item-input" value="${escHtml(r.string)}" placeholder="예) 럭실론 4G"
              oninput="updateRacketField(${i},'string',this.value)"
              onkeydown="if(event.key==='Enter')this.blur()">
          </div>
          <div class="racket-slot-field">
            <div class="racket-slot-lbl">TENSION</div>
            <input class="pf-item-input" value="${escHtml(r.tension)}" placeholder="예) 50파운드"
              oninput="updateRacketField(${i},'tension',this.value)"
              onkeydown="if(event.key==='Enter')this.blur()">
          </div>
        </div>
        <div class="pf-item" style="border:none;padding:0;">
          <div class="pf-item-body" style="width:100%;">
            <div class="racket-slot-lbl">스트링 교체일</div>
            <input type="date" class="pf-item-input" value="${escHtml(r.stringDate)}"
              style="cursor:pointer;"
              onclick="try{this.showPicker()}catch(e){}"
              onchange="updateRacketField(${i},'stringDate',this.value)">
          </div>
        </div>
      </div>
    </div>`;
  });

  if (state.rackets.length < 4) {
    html += `<button class="racket-add-btn" onclick="addRacketSlot()">
      + 라켓 추가 (최대 4개)
    </button>`;
  }
  html += '</div>';

  grid.innerHTML = html;
  renderStringBanner();
}

// ===== 라켓 슬롯 관리 함수 =====
let _racketDebounceTimers = {};

function updateRacketField(idx, field, value) {
  clearTimeout(_racketDebounceTimers[idx + '_' + field]);
  _racketDebounceTimers[idx + '_' + field] = setTimeout(() => {
    if (!state.rackets[idx]) return;
    state.rackets[idx][field] = value.trim();
    // 첫 번째 라켓의 교체일은 lastStringDate와 동기화
    if (field === 'stringDate' && idx === 0) {
      state.lastStringDate = value;
      state.profile.stringDate = value;
    }
    save();
    if (field === 'stringDate') renderStringBanner();
  }, 500);
}

function addRacketSlot() {
  if (state.rackets.length >= 4) { showToast('⚠️ 라켓은 최대 4개까지 추가할 수 있어요'); return; }
  state.rackets.push(_defaultRacket(state.rackets.length));
  save();
  renderProfile();
  showToast('🎾 라켓 슬롯이 추가됐어요!');
}

function deleteRacketSlot(idx) {
  if (idx === 0) return;
  showConfirm('라켓 삭제', `라켓 ${idx+1} 정보를 삭제하시겠습니까?`, '🗑️', () => {
    state.rackets.splice(idx, 1);
    save();
    renderProfile();
    showToast('🗑️ 삭제 완료');
  }, '삭제');
}

// ===== 스트링 상태 배너 (라켓별 슬라이드) =====
function renderStringBanner() {
  const banner = document.getElementById('stringStatusBanner');
  if (!banner) return;
  _initRackets();

  const rackets = state.rackets.filter(r => r.name || r.stringDate);
  if (rackets.length === 0) {
    // 아무 라켓도 입력 안 된 경우
    banner.innerHTML = `
      <div class="string-banner none" style="margin-bottom:10px;">
        <div class="string-banner-icon">🎾</div>
        <div class="string-banner-body">
          <div class="string-banner-title">String Status</div>
          <div class="string-banner-main">
            <div class="string-banner-day" style="font-size:13px;font-family:inherit;font-weight:700;">라켓 정보를 입력해주세요</div>
          </div>
        </div>
      </div>`;
    return;
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  function _oneBannerHTML(r, i) {
    const label = r.name ? escHtml(r.name) : `라켓 ${i+1}`;
    const dateStr = r.stringDate || '';

    if (!dateStr) {
      return `
        <div class="banner-slide">
          <div class="string-banner none">
            <div class="string-banner-icon">🎾</div>
            <div class="string-banner-body">
              <div class="string-banner-title">${label}</div>
              <div class="string-banner-main">
                <div class="string-banner-day" style="font-size:13px;font-family:inherit;font-weight:700;">교체일 미입력</div>
              </div>
            </div>
          </div>
        </div>`;
    }

    const [ry, rm, rd] = dateStr.split('-').map(Number);
    const replaced = new Date(ry, rm - 1, rd);
    const diffDays = Math.floor((today - replaced) / 86400000);
    const gamesAfter = (state.matches || []).filter(m => m.date >= dateStr).length;
    const colorClass = diffDays <= 30 ? 'green' : diffDays <= 90 ? 'yellow' : 'red';
    const icon = diffDays <= 30 ? '🟢' : diffDays <= 90 ? '🟡' : '🔴';
    const stringInfo = r.string ? `<span style="font-size:11px;color:var(--text-muted);margin-left:4px;">${escHtml(r.string)}${r.tension ? ' · ' + escHtml(r.tension) : ''}</span>` : '';

    return `
      <div class="banner-slide">
        <div class="string-banner ${colorClass}">
          <div class="string-banner-icon">${icon}</div>
          <div class="string-banner-body">
            <div class="string-banner-title">${label}${stringInfo}</div>
            <div class="string-banner-main">
              <div class="string-banner-day">D+${diffDays}</div>
              <div class="string-banner-games"><span>${gamesAfter}</span> Games</div>
            </div>
          </div>
        </div>
      </div>`;
  }

  const slidesHTML = rackets.map((r, i) => _oneBannerHTML(r, i)).join('');

  // 라켓이 1개면 슬라이드/도트 불필요
  if (rackets.length === 1) {
    banner.innerHTML = `<div style="margin-bottom:10px;">${_oneBannerHTML(rackets[0], 0).replace('<div class="banner-slide">','').replace('</div>\n        </div>','</div>')}</div>`;
    return;
  }

  const dotsHTML = rackets.map((_, i) =>
    `<div class="banner-dot${i === 0 ? ' active' : ''}" id="bdot-${i}"></div>`
  ).join('');

  banner.innerHTML = `
    <div class="banner-slides-wrap">
      <div class="banner-slides" id="bannerSlides" onscroll="onBannerScroll(this)">
        ${slidesHTML}
      </div>
      <div class="banner-dots">${dotsHTML}</div>
    </div>`;
}

function onBannerScroll(el) {
  const idx = Math.round(el.scrollLeft / el.offsetWidth);
  document.querySelectorAll('.banner-dot').forEach((d, i) => {
    d.classList.toggle('active', i === idx);
  });
}

// 프로필 입력 디바운스 (모바일에서 oninput 과도한 저장 방지)
let _pfDebounceTimer = null;
function pfDebounceSave(key, value) {
  clearTimeout(_pfDebounceTimer);
  _pfDebounceTimer = setTimeout(() => saveProfileField(key, value), 600);
}

function saveProfileField(key, value) {
  state.profile[key] = typeof value === 'string' ? value.trim() : value;
  if (!state.profile.name) state.profile.name = '선수';
  state.profile.photo = state.profile.photo || '';
  save();
  const p = state.profile; const name = p.name || '선수';
  const nameRow = document.getElementById('profileNameBig');
  if (nameRow) nameRow.innerHTML = `
    <span class="pf-club-tag">${p.club ? escHtml(p.club.toUpperCase()) : ''}</span>
    <span class="pf-name-text">${escHtml(name)}</span>`;
  const avatarBtnEl = document.getElementById('avatarBtn');
  if (avatarBtnEl) avatarBtnEl.textContent = name.charAt(0).toUpperCase();
  const avatarInitialEl = document.getElementById('avatarInitial');
  if (!p.photo && avatarInitialEl) avatarInitialEl.textContent = name.charAt(0).toUpperCase();
}


function uploadPhoto(input) {
  const file = input.files[0]; if (!file) return;
  if (file.size > 15*1024*1024) { showToast('⚠️ 사진 크기는 15MB 이하여야 합니다'); return; }
  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      // Canvas로 최대 400px 리사이즈 + 강한 압축 (저장공간 절약)
      const MAX = 400;
      let w = img.width, h = img.height;
      if (w > MAX || h > MAX) {
        const r = Math.min(MAX/w, MAX/h);
        w = Math.round(w*r); h = Math.round(h*r);
      }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      const compressed = canvas.toDataURL('image/jpeg', 0.6);
      // 압축 후 크기 확인 (500KB 초과시 더 압축)
      if (compressed.length > 500000) {
        const canvas2 = document.createElement('canvas');
        canvas2.width = Math.round(w*0.7); canvas2.height = Math.round(h*0.7);
        canvas2.getContext('2d').drawImage(img, 0, 0, canvas2.width, canvas2.height);
        const compressed2 = canvas2.toDataURL('image/jpeg', 0.5);
        state.profile.photo = compressed2;
      } else {
        state.profile.photo = compressed;
      }
      save(); renderProfile();
      showToast('📷 사진 업로드 완료!');
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

// ===== MATCH =====
function selectFormat(fmt) {
  document.getElementById('matchFormat').value = fmt;
  document.getElementById('btnSingles').classList.toggle('selected', fmt === 'singles');
  document.getElementById('btnDoubles').classList.toggle('selected', fmt === 'doubles');
  togglePartner();
}
function togglePartner() {
  const fmt = document.getElementById('matchFormat').value;
  document.getElementById('partnerGroup').style.display = fmt === 'doubles' ? 'block' : 'none';
  document.getElementById('opponent2Group').style.display = fmt === 'doubles' ? 'block' : 'none';
}
function setResult(r) {
  state.currentResult = r;
  document.getElementById('winBtn').className = 'winner-btn' + (r === 'win' ? ' selected-win' : '');
  document.getElementById('loseBtn').className = 'winner-btn' + (r === 'lose' ? ' selected-lose' : '');
}
function saveMatch() {
  const date = document.getElementById('matchDate').value;
  const format = document.getElementById('matchFormat').value;
  const opponent = document.getElementById('matchOpponent').value.trim();
  if (!date) { showToast('⚠️ 날짜를 입력하세요'); return; }
  if (!format) { showToast('⚠️ 형식을 선택하세요'); return; }
  if (!opponent) { showToast('⚠️ 상대를 입력하세요'); return; }
  if (!state.currentResult) { showToast('⚠️ 결과를 선택하세요'); return; }

  const matchData = {
    date,
    format,
    partner: format === 'doubles' ? document.getElementById('matchPartner').value.trim() : '',
    opponent,
    opponent2: format === 'doubles' ? document.getElementById('matchOpponent2').value.trim() : '',
    result: state.currentResult,
    myScore: document.getElementById('myScore').value,
    oppScore: document.getElementById('oppScore').value,
    myTiebreak: document.getElementById('myTiebreak').value,
    oppTiebreak: document.getElementById('oppTiebreak').value,
    memo: document.getElementById('matchMemo').value.trim(),
  };

  if (state.editingMatchId) {
    // 수정 모드
    const idx = state.matches.findIndex(m => m.id === state.editingMatchId);
    if (idx !== -1) {
      state.matches[idx] = { ...state.matches[idx], ...matchData };
    }
    state.editingMatchId = null;
    document.getElementById('matchEditBanner').classList.remove('active');
    document.getElementById('matchFormTitle').textContent = '새 경기';
    document.getElementById('matchSaveBtn').textContent = '경기 저장';
    showToast('✅ 경기 수정 완료!');
  } else {
    // 신규 저장
    const match = { id: state.nextMatchId++, ...matchData };
    state.matches.unshift(match);
    // 선수 자동 등록
    [opponent, matchData.opponent2, matchData.partner].filter(Boolean).forEach(n => {
      if (!state.players.find(p => p.name === n)) {
        state.players.push({ id: state.nextPlayerId++, name: n, memo: '', clubs: [], age: '', career: '', hand: '', style: '' });
      }
    });
    showToast('🏸 경기 저장 완료!');
  }

  save();
  state._matchPage = 0; // 저장 후 목록 첫 페이지로
  // 폼 초기화
  state.currentResult = null;
  document.getElementById('winBtn').className = 'winner-btn';
  document.getElementById('loseBtn').className = 'winner-btn';
  document.getElementById('matchDate').value = getTodayStr();
  document.getElementById('matchFormat').value = '';
  document.getElementById('btnSingles').classList.remove('selected');
  document.getElementById('btnDoubles').classList.remove('selected');
  document.getElementById('matchOpponent').value = '';
  document.getElementById('matchOpponent2').value = '';
  document.getElementById('matchPartner').value = '';
  document.getElementById('myScore').value = '';
  document.getElementById('oppScore').value = '';
  document.getElementById('myTiebreak').value = '';
  document.getElementById('oppTiebreak').value = '';
  document.getElementById('matchMemo').value = '';
  togglePartner();
  renderMatchList();
  setTodayDate();
  renderStringBanner();
}
// 경기 카드 HTML 생성 (공통)
function _matchCardHTML(m) {
  const win = m.result === 'win';
  const scoreStr = (m.myScore !== '' && m.oppScore !== '') ? `${m.myScore} : ${m.oppScore}` : '';
  const tiebreakStr = (m.myTiebreak && m.myTiebreak !== '' && m.oppTiebreak && m.oppTiebreak !== '') ? ` (${m.myTiebreak}-${m.oppTiebreak})` : '';
  const opps = [m.opponent, m.opponent2].filter(Boolean).join(', ');
  const fmtLabel = m.format === 'doubles' ? '복식' : '단식';
  return `<div class="match-item">
    <div class="match-item-top">
      <span class="match-badge ${win ? 'badge-win' : 'badge-lose'}">${win ? '승리' : '패배'}</span>
      <div class="match-date">
        <span>${m.date}</span>
        <span class="format-badge">${fmtLabel}</span>
      </div>
      <div class="match-item-actions">
        <button class="match-edit-btn" onclick="editMatch(${m.id})" title="수정">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="match-delete-btn" onclick="deleteMatch(${m.id})" title="삭제">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
        </button>
      </div>
    </div>
    <div class="match-item-main">
      <div class="match-team" style="font-size:12px;">${state.profile.name || '나'}${m.partner ? '<br><span style="color:var(--text-muted);font-size:11px;">+'+m.partner+'</span>' : ''}</div>
      <div>
        ${scoreStr ? `<div class="match-score-big ${win ? 'match-score-win' : 'match-score-lose'}">${scoreStr}${tiebreakStr}</div>` : `<div style="color:var(--text-muted);font-size:12px;">VS</div>`}
      </div>
      <div class="match-team" style="font-size:12px;">${opps}</div>
    </div>
    ${m.memo ? `<div style="margin-top:8px;font-size:11px;border-top:1px solid var(--border);padding-top:8px;">
      ${m.memo.startsWith('[') ? `<span style="background:rgba(124,106,247,.15);color:var(--accent);padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700;">🏆 ${m.memo}</span>` : `<span style="color:var(--text-muted);">📝 ${escHtml(m.memo)}</span>`}
    </div>` : ''}
  </div>`;
}

function renderMatchList() {
  const today = getTodayStr();
  const todayEl = document.getElementById('matchListToday');
  const pastEl  = document.getElementById('matchListPast');
  const countEl = document.getElementById('matchHistoryCount');
  if (!todayEl || !pastEl) return;

  if (!state.matches || !state.matches.length) {
    todayEl.innerHTML = '<div class="empty-state"><div class="empty-icon">🏸</div><div class="empty-text">아직 경기 기록이 없어요</div></div>';
    pastEl.innerHTML = '';
    if (countEl) countEl.textContent = '';
    return;
  }

  const todayMatches = state.matches.filter(m => m.date === today);
  const pastMatches  = state.matches.filter(m => m.date !== today);

  // 오늘 경기
  if (todayMatches.length) {
    todayEl.innerHTML = todayMatches.map(_matchCardHTML).join('');
  } else {
    todayEl.innerHTML = '<div style="color:var(--text-muted);font-size:13px;padding:10px 0 4px;">오늘 경기 기록이 없어요</div>';
  }

  // 이전 경기 (드롭다운 내부)
  if (countEl) countEl.textContent = pastMatches.length ? `${pastMatches.length}개` : '';
  const matchPage = state._matchPage || 0;
  const pageSize = 20;
  const paginated = pastMatches.slice(0, (matchPage + 1) * pageSize);
  const hasMore = pastMatches.length > paginated.length;
  pastEl.innerHTML = paginated.map(_matchCardHTML).join('');
  if (hasMore) {
    pastEl.innerHTML += `<button class="load-more-btn" onclick="loadMoreMatches()">
      ⬇️ 더보기 (${pastMatches.length - paginated.length}개 남음)
    </button>`;
  }
}
function loadMoreMatches() {
  state._matchPage = (state._matchPage || 0) + 1;
  renderMatchList();
}
function toggleMatchHistory() {
  const body  = document.getElementById('matchHistoryBody');
  const arrow = document.getElementById('matchHistory-arrow');
  if (!body) return;
  const isOpen = body.classList.contains('open');
  body.classList.toggle('open', !isOpen);
  if (arrow) arrow.classList.toggle('open', !isOpen);
}
function editMatch(id) {
  const m = state.matches.find(x => x.id === id);
  if (!m) return;
  state.editingMatchId = id;

  // 폼에 값 채우기
  document.getElementById('matchDate').value = m.date;
  selectFormat(m.format);
  document.getElementById('matchPartner').value = m.partner || '';
  document.getElementById('matchOpponent').value = m.opponent || '';
  document.getElementById('matchOpponent2').value = m.opponent2 || '';
  setResult(m.result);
  document.getElementById('myScore').value = m.myScore || '';
  document.getElementById('oppScore').value = m.oppScore || '';
  document.getElementById('myTiebreak').value = m.myTiebreak || '';
  document.getElementById('oppTiebreak').value = m.oppTiebreak || '';
  document.getElementById('matchMemo').value = m.memo || '';

  // UI 수정 모드
  document.getElementById('matchEditBanner').classList.add('active');
  document.getElementById('matchFormTitle').textContent = '경기 수정';
  document.getElementById('matchSaveBtn').textContent = '수정 저장';

  // 폼 상단으로 스크롤
  const contentEl = document.querySelector('.content');
  if (contentEl) contentEl.scrollTo({ top: 0, behavior: 'smooth' });
  showPage('match');
}

function cancelEditMatch() {
  state.editingMatchId = null;
  document.getElementById('matchEditBanner').classList.remove('active');
  document.getElementById('matchFormTitle').textContent = '새 경기';
  document.getElementById('matchSaveBtn').textContent = '경기 저장';
  // 폼 초기화
  state.currentResult = null;
  document.getElementById('winBtn').className = 'winner-btn';
  document.getElementById('loseBtn').className = 'winner-btn';
  document.getElementById('matchDate').value = getTodayStr();
  document.getElementById('matchFormat').value = '';
  document.getElementById('btnSingles').classList.remove('selected');
  document.getElementById('btnDoubles').classList.remove('selected');
  document.getElementById('matchOpponent').value = '';
  document.getElementById('matchOpponent2').value = '';
  document.getElementById('matchPartner').value = '';
  document.getElementById('myScore').value = '';
  document.getElementById('oppScore').value = '';
  document.getElementById('myTiebreak').value = '';
  document.getElementById('oppTiebreak').value = '';
  document.getElementById('matchMemo').value = '';
  togglePartner();
  setTodayDate();
}

function deleteMatch(id) {
  showConfirm('경기 삭제', '이 경기 기록을 삭제하시겠습니까?', '🗑️', () => {
    state.matches = state.matches.filter(m => m.id !== id);
    save();
    renderMatchList();
    renderStringBanner();
    showToast('🗑️ 경기 삭제 완료');
  });
}

// ===== STATS =====
function updateSportType() {
  state.sportType = document.getElementById('sportType').value;
  save();
  renderStats();
  showToast(`📊 ${state.sportType === 'badminton' ? '배드민턴' : '테니스'} 통계로 변경`);
}

function renderStats() {
  const ms = state.matches;
  const total = ms.length;
  const wins = ms.filter(m => m.result === 'win').length;
  const loses = total - wins;
  const rate = total ? Math.round(wins / total * 100) : 0;
  document.getElementById('st-total').textContent = total;
  document.getElementById('st-win').textContent = wins;
  document.getElementById('st-lose').textContent = loses;
  document.getElementById('st-rate').textContent = rate + '%';

  renderStreak();
  // 열려있는 아코디언만 다시 렌더링
  if (document.getElementById('accSummary').classList.contains('open')) renderSummaryCard();
  if (document.getElementById('accMonthly').classList.contains('open')) renderMonthlyGraph();
  if (document.getElementById('accOpponent').classList.contains('open')) renderOpponentStats();
  if (document.getElementById('accPartner').classList.contains('open')) renderPartnerStats();
  if (document.getElementById('accEnemy').classList.contains('open')) renderEnemyTeamStats();
}

function renderSummaryCard() {
  const el = document.getElementById('summaryCard');
  if (!el) return;
  const ms = state.matches;
  if (!ms.length) { el.innerHTML = '<div style="color:var(--text-muted);font-size:13px;padding:8px 0;text-align:center;">경기를 입력하면 요약이 표시됩니다</div>'; return; }

  // 이번달
  const now = new Date();
  const thisYM = now.toISOString().slice(0, 7);
  const thisMonth = ms.filter(m => m.date.slice(0, 7) === thisYM);
  const tmW = thisMonth.filter(m => m.result === 'win').length;
  const tmRate = thisMonth.length ? Math.round(tmW / thisMonth.length * 100) : 0;

  // 단식/복식
  const singles = ms.filter(m => m.format === 'singles');
  const doubles = ms.filter(m => m.format === 'doubles');
  const sw = singles.filter(m => m.result === 'win').length;
  const dw = doubles.filter(m => m.result === 'win').length;
  const sRate = singles.length ? Math.round(sw / singles.length * 100) : null;
  const dRate = doubles.length ? Math.round(dw / doubles.length * 100) : null;

  // 가장 많이 이긴 상대
  const oppMap = {};
  ms.forEach(m => [m.opponent, m.opponent2].filter(Boolean).forEach(n => {
    if (!oppMap[n]) oppMap[n] = { w: 0, l: 0 };
    if (m.result === 'win') oppMap[n].w++; else oppMap[n].l++;
  }));
  const oppEntries = Object.entries(oppMap);
  const bestVs = oppEntries.filter(([,d]) => d.w > 0).sort((a,b) => b[1].w - a[1].w)[0];
  const hardestVs = oppEntries.filter(([,d]) => d.l > 0).sort((a,b) => b[1].l - a[1].l)[0];

  const row = (label, val, cls='') =>
    `<div class="summary-row"><span class="summary-label">${label}</span><span class="summary-val ${cls}">${val}</span></div>`;

  el.innerHTML = [
    row('이번 달', thisMonth.length ? `${thisMonth.length}전 ${tmW}승 (${tmRate}%)` : '경기 없음', tmRate >= 50 ? 'good' : thisMonth.length ? 'bad' : ''),
    row('단식 전적', singles.length ? `${sw}승 ${singles.length-sw}패${sRate !== null ? ` · ${sRate}%` : ''}` : '없음', sRate !== null ? (sRate >= 50 ? 'good' : 'bad') : ''),
    row('복식 전적', doubles.length ? `${dw}승 ${doubles.length-dw}패${dRate !== null ? ` · ${dRate}%` : ''}` : '없음', dRate !== null ? (dRate >= 50 ? 'good' : 'bad') : ''),
    bestVs ? row('가장 많이 이긴 상대', `${bestVs[0]} (${bestVs[1].w}승)`, 'good') : '',
    hardestVs ? row('가장 어려운 상대', `${hardestVs[0]} (${hardestVs[1].l}패)`, 'bad') : '',
  ].join('');
}

function renderOpponentStats() {
  const om = {};
  state.matches.forEach(m => {
    [m.opponent, m.opponent2].filter(Boolean).forEach(name => {
      if (!om[name]) om[name] = { w: 0, l: 0 };
      if (m.result === 'win') om[name].w++; else om[name].l++;
    });
  });
  if (!Object.keys(om).length) {
    document.getElementById('opponentCard').innerHTML = '<div class="empty-state"><div class="empty-icon">⚔️</div><div class="empty-text">경기를 입력하면<br>상대 데이터가 표시됩니다</div></div>';
    return;
  }
  const sortEl = document.getElementById('oppSort');
  const sortBy = sortEl ? sortEl.value : 'games';
  const sorted = Object.entries(om).sort((a,b) => {
    if (sortBy === 'winrate') {
      const ra = Math.round(a[1].w/(a[1].w+a[1].l)*100);
      const rb = Math.round(b[1].w/(b[1].w+b[1].l)*100);
      return rb - ra;
    } else if (sortBy === 'name') {
      return a[0].localeCompare(b[0], 'ko');
    }
    return (b[1].w+b[1].l) - (a[1].w+a[1].l);
  });
  document.getElementById('opponentCard').innerHTML = sorted.map(([name, d]) => {
    const total = d.w + d.l;
    const rate = Math.round(d.w / total * 100);
    const fillCls = rate >= 60 ? 'good' : rate < 40 ? 'bad' : '';
    const badge = rate >= 60 ? '<span class="enemy-badge weak">우세</span>' : rate < 40 ? '<span class="enemy-badge strong">열세</span>' : '';
    return `<div class="matchup-row">
      <div class="matchup-avatar">${name.charAt(0)}</div>
      <div class="matchup-info">
        <div class="matchup-name">${escHtml(name)}${badge}</div>
        <div class="matchup-bar-wrap"><div class="matchup-bar-fill ${fillCls}" style="width:${rate}%"></div></div>
        <div class="matchup-sub">${total}전 · 내 승률 ${rate}%</div>
      </div>
      <div class="matchup-score">
        <div class="matchup-wl" style="color:${d.w >= d.l ? 'var(--success)' : 'var(--danger)'}">${d.w}승 ${d.l}패</div>
      </div>
    </div>`;
  }).join('');
}

function renderPartnerStats() {
  const doubles = state.matches.filter(m => m.format === 'doubles' && m.partner);
  const pm = {};
  doubles.forEach(m => {
    if (!pm[m.partner]) pm[m.partner] = { w: 0, l: 0 };
    if (m.result === 'win') pm[m.partner].w++; else pm[m.partner].l++;
  });
  if (!Object.keys(pm).length) {
    document.getElementById('partnerCard').innerHTML = '<div class="empty-state"><div class="empty-icon">🤝</div><div class="empty-text">복식 경기를 입력하면<br>파트너 데이터가 표시됩니다</div></div>';
    return;
  }
  const partnerSortEl = document.getElementById('partnerSort');
  const partnerSortBy = partnerSortEl ? partnerSortEl.value : 'games';
  const sorted = Object.entries(pm).sort((a,b) => {
    if (partnerSortBy === 'winrate') {
      const ra = Math.round(a[1].w/(a[1].w+a[1].l)*100);
      const rb = Math.round(b[1].w/(b[1].w+b[1].l)*100);
      return rb - ra;
    } else if (partnerSortBy === 'name') {
      return a[0].localeCompare(b[0], 'ko');
    }
    return (b[1].w+b[1].l) - (a[1].w+a[1].l);
  });
  document.getElementById('partnerCard').innerHTML = sorted.map(([name, d]) => {
    const total = d.w + d.l;
    const rate = Math.round(d.w / total * 100);
    const fillCls = rate >= 60 ? 'good' : rate < 40 ? 'bad' : '';
    const emoji = rate >= 70 ? '🔥' : rate >= 50 ? '👍' : '😅';
    return `<div class="matchup-row">
      <div class="matchup-avatar">${name.charAt(0)}</div>
      <div class="matchup-info">
        <div class="matchup-name">${escHtml(name)} ${emoji}</div>
        <div class="matchup-bar-wrap"><div class="matchup-bar-fill ${fillCls}" style="width:${rate}%"></div></div>
        <div class="matchup-sub">${total}경기 함께 · 궁합 ${rate}%</div>
      </div>
      <div class="matchup-score">
        <div class="matchup-wl" style="color:${d.w >= d.l ? 'var(--success)' : 'var(--danger)'}">${d.w}승 ${d.l}패</div>
      </div>
    </div>`;
  }).join('');
}

function renderEnemyTeamStats() {
  // 복식 경기에서 상대팀 조합별 전적
  const doubles = state.matches.filter(m => m.format === 'doubles' && m.opponent);
  const tm = {};
  doubles.forEach(m => {
    const key = [m.opponent, m.opponent2].filter(Boolean).sort().join(' & ');
    if (!tm[key]) tm[key] = { w: 0, l: 0 };
    if (m.result === 'win') tm[key].w++; else tm[key].l++;
  });
  if (!Object.keys(tm).length) {
    document.getElementById('enemyTeamCard').innerHTML = '<div class="empty-state"><div class="empty-icon">🆚</div><div class="empty-text">복식 경기를 입력하면<br>상대팀 데이터가 표시됩니다</div></div>';
    return;
  }
  const enemySortEl = document.getElementById('enemySort');
  const enemySortBy = enemySortEl ? enemySortEl.value : 'games';
  const sorted = Object.entries(tm).sort((a,b) => {
    if (enemySortBy === 'winrate') {
      const ra = Math.round(a[1].w/(a[1].w+a[1].l)*100);
      const rb = Math.round(b[1].w/(b[1].w+b[1].l)*100);
      return rb - ra;
    } else if (enemySortBy === 'name') {
      return a[0].localeCompare(b[0], 'ko');
    }
    return (b[1].w+b[1].l) - (a[1].w+a[1].l);
  });
  document.getElementById('enemyTeamCard').innerHTML = sorted.map(([team, d]) => {
    const total = d.w + d.l;
    const rate = Math.round(d.w / total * 100);
    const fillCls = rate >= 60 ? 'good' : rate < 40 ? 'bad' : '';
    const badge = rate >= 60 ? '<span class="enemy-badge weak">우세</span>' : rate < 40 ? '<span class="enemy-badge strong">약점</span>' : '';
    const names = team.split(' & ');
    return `<div class="enemy-team-row">
      <div style="display:flex;gap:4px;flex-shrink:0;">
        <div class="matchup-avatar" style="width:28px;height:28px;font-size:12px;">${names[0].charAt(0)}</div>
        ${names[1] ? `<div class="matchup-avatar" style="width:28px;height:28px;font-size:12px;">${names[1].charAt(0)}</div>` : ''}
      </div>
      <div class="enemy-team-names" style="flex:1;min-width:0;margin:0 8px;">
        <div class="enemy-team-main">${escHtml(team)}${badge}</div>
        <div class="matchup-bar-wrap" style="margin-top:4px;"><div class="matchup-bar-fill ${fillCls}" style="width:${rate}%"></div></div>
        <div class="enemy-team-sub">${total}전 · 내 승률 ${rate}%</div>
      </div>
      <div class="matchup-score">
        <div class="matchup-wl" style="color:${d.w >= d.l ? 'var(--success)' : 'var(--danger)'}">${d.w}승 ${d.l}패</div>
      </div>
    </div>`;
  }).join('');
}

function toggleRankingClubFilter(club) {
  const idx = state.rankingClubFilter.indexOf(club);
  if (idx === -1) state.rankingClubFilter.push(club);
  else state.rankingClubFilter.splice(idx, 1);
  save();
}
function renderRankingClubFilter() {}
function renderRanking() {}

// ===== CLUBS =====
function addClub() {
  const name = document.getElementById('newClubName').value.trim();
  if (!name) { showToast('⚠️ 클럽 이름을 입력하세요'); return; }
  if (state.clubs.includes(name)) { showToast('⚠️ 이미 등록된 클럽입니다'); return; }
  state.clubs.push(name);
  save();
  document.getElementById('newClubName').value = '';
  renderClubTags();
  renderPlayers();
  showToast(`✅ ${name} 클럽 추가 완료!`);
}

function deleteClub(name) {
  showConfirm(`"${name}" 클럽 삭제`, '클럽을 삭제해도 선수 기록은 유지됩니다. 소속 선수는 클럽 없음으로 변경됩니다.', '🏠', () => {
    state.clubs = state.clubs.filter(c => c !== name);
    state.players.forEach(p => {
      if (p.clubs) p.clubs = p.clubs.filter(c => c !== name);
      else p.clubs = [];
    });
    if (Array.isArray(state.rankingClubFilter))
      state.rankingClubFilter = state.rankingClubFilter.filter(c => c !== name);
    if (state.playerClubFilter === name) state.playerClubFilter = '전체';
    save();
    renderClubTags();
    renderPlayers();
    showToast('🗑️ 클럽 삭제 완료');
  });
}

function renderClubTags() {
  const el = document.getElementById('clubTagList');
  if (!state.clubs.length) {
    el.innerHTML = '<span style="font-size:12px;color:var(--text-muted);">등록된 클럽이 없습니다</span>';
    return;
  }
  el.innerHTML = state.clubs.map(c =>
    `<div class="club-tag">
      <span>${escHtml(c)}</span>
      <button class="club-tag-del" onclick="deleteClub(this.dataset.club)" data-club="${escHtml(c)}" title="클럽 삭제">✕</button>
    </div>`
  ).join('');
}

function setPlayerClubFilter(club) {
  state.playerClubFilter = club;
  renderPlayers();
}
function setPlayerSort(val) {
  state.playerSort = val;
  renderPlayers();
}

function renderPlayerClubFilter() {
  const el = document.getElementById('playerClubFilter');
  if (!state.clubs.length) { el.innerHTML = ''; return; }
  const all = ['전체', ...state.clubs, '클럽 없음'];
  el.innerHTML = `<div class="club-filter">${all.map(c =>
    `<button class="club-filter-btn${state.playerClubFilter===c?' active':''}" onclick="setPlayerClubFilter(this.dataset.club)" data-club="${escHtml(c)}">${escHtml(c)}</button>`
  ).join('')}</div>`;
}

function toggleClubAssign(id) {
  const area = document.getElementById('clubArea-' + id);
  document.querySelectorAll('.player-edit-area.open, .player-memo-area.open, .player-club-area.open').forEach(a => a.classList.remove('open'));
  if (area && !area.classList.contains('open')) area.classList.add('open');
}

function togglePlayerClub(playerId, club) {
  const player = state.players.find(p => p.id === playerId);
  if (!player) return;
  if (!player.clubs) player.clubs = [];
  const idx = player.clubs.indexOf(club);
  if (idx === -1) player.clubs.push(club);
  else player.clubs.splice(idx, 1);
  save();
  // 배정 버튼만 갱신
  const area = document.getElementById('clubArea-' + playerId);
  if (area) {
    area.querySelectorAll('.club-assign-btn').forEach(btn => {
      const c = btn.dataset.club;
      if (c === '') btn.classList.toggle('selected', player.clubs.length === 0);
      else btn.classList.toggle('selected', player.clubs.includes(c));
    });
  }
  // 이름 옆 뱃지 갱신
  const nameEl = document.querySelector(`#playerItem-${playerId} .player-name`);
  if (nameEl) {
    const badges = player.clubs.length
      ? player.clubs.map(c => `<span class="club-badge">${escHtml(c)}</span>`).join('')
      : (state.clubs.length ? `<span style="font-size:10px;color:var(--text-muted);"> · 클럽 없음</span>` : '');
    nameEl.innerHTML = escHtml(player.name) + badges;
  }
  showToast(club ? `🏠 ${club} ${player.clubs.includes(club) ? '추가' : '해제'}` : '클럽 전체 해제');
}

function renderStreak() {
  const el = document.getElementById('streakBanner');
  if (!el) return;
  const ms = [...state.matches].sort((a,b) => b.date.localeCompare(a.date));
  if (!ms.length) { el.innerHTML = ''; return; }

  let streak = 1, type = ms[0].result;
  for (let i = 1; i < ms.length; i++) {
    if (ms[i].result === type) streak++;
    else break;
  }

  // 1경기는 배너 표시 안 함
  if (streak < 2) { el.innerHTML = ''; return; }

  const isWin = type === 'win';
  const emoji = isWin ? (streak >= 5 ? '🔥' : '⚡') : (streak >= 5 ? '💧' : '😤');
  const label = isWin ? `${streak}연승 중!` : `${streak}연패 중`;
  const cls = isWin ? 'win-streak' : 'lose-streak';
  const msg = isWin
    ? `최근 ${streak}경기 연속 승리! 🎉`
    : `최근 ${streak}경기 연속 패배. 파이팅! 💪`;

  el.innerHTML = `<div class="streak-banner">
    <div class="streak-icon">${emoji}</div>
    <div class="streak-text-wrap">
      <div class="streak-main ${cls}">${label}</div>
      <div class="streak-sub">${msg}</div>
    </div>
    <div class="streak-count ${cls}">${streak}</div>
  </div>`;
}

function renderMonthlyGraph() {
  const el = document.getElementById('monthlyGraph');
  if (!el) return;
  if (!state.matches.length) {
    el.innerHTML = '<div style="color:var(--text-muted);font-size:13px;text-align:center;padding:20px 0;">경기를 입력하면 그래프가 표시됩니다</div>';
    return;
  }

  // 최근 6개월 데이터
  const monthMap = {};
  state.matches.forEach(m => {
    const ym = m.date.slice(0, 7); // "2025-03"
    if (!monthMap[ym]) monthMap[ym] = { w: 0, l: 0 };
    if (m.result === 'win') monthMap[ym].w++; else monthMap[ym].l++;
  });

  const sorted = Object.keys(monthMap).sort().slice(-6);
  if (!sorted.length) return;

  const maxTotal = Math.max(...sorted.map(ym => monthMap[ym].w + monthMap[ym].l));

  el.innerHTML = `<div class="monthly-graph-inner">
    ${sorted.map(ym => {
      const d = monthMap[ym];
      const total = d.w + d.l;
      const rate = Math.round(d.w / total * 100);
      const heightPct = Math.round((total / maxTotal) * 100);
      const fillCls = rate >= 60 ? 'full' : rate < 40 ? 'low' : '';
      const mon = ym.slice(5) + '월';
      return `<div class="monthly-bar-col">
        <div class="monthly-bar-rate">${rate}%</div>
        <div class="monthly-bar-bg">
          <div class="monthly-bar-fill ${fillCls}" style="height:${heightPct}%"></div>
        </div>
        <div class="monthly-bar-lbl">${mon}</div>
        <div class="monthly-bar-lbl">${d.w}승${d.l}패</div>
      </div>`;
    }).join('')}
  </div>`;
}

// ===== 통계 아코디언 =====
function toggleAcc(id) {
  const body = document.getElementById(id);
  const arrow = document.getElementById(id + '-arrow');
  if (!body) return;
  const isOpen = body.classList.contains('open');
  body.classList.toggle('open', !isOpen);
  if (arrow) arrow.classList.toggle('open', !isOpen);

  // 열릴 때 해당 섹션 렌더링 (처음 열 때만 데이터 로드)
  if (!isOpen) {
    if (id === 'accSummary') renderSummaryCard();
    if (id === 'accMonthly') renderMonthlyGraph();
    if (id === 'accOpponent') renderOpponentStats();
    if (id === 'accPartner') renderPartnerStats();
    if (id === 'accEnemy') renderEnemyTeamStats();
  }
}



// ===== 스트링 관리 (라켓별) =====
function renderStringing() {
  _initRackets();
  const selectedIdx = state._stringingRacketIdx || 0;
  const racket = state.rackets[selectedIdx] || state.rackets[0];

  // 라켓 선택 탭 렌더링
  const alertEl = document.getElementById('stringingAlert');
  if (!alertEl) return;

  // 라켓 탭 버튼
  const tabHTML = state.rackets.map((r, i) => {
    const label = r.name ? r.name : `라켓 ${i+1}`;
    const active = i === selectedIdx;
    return `<button onclick="stringingSelectRacket(${i})"
      style="flex:1;padding:8px 4px;border:none;border-radius:10px;font-size:12px;font-weight:700;
      cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
      background:${active?'var(--accent)':'var(--surface2)'};
      color:${active?'#fff':'var(--text-muted)'};">${escHtml(label)}</button>`;
  }).join('');

  // 교체일/인터벌
  const dateStr = racket.stringDate || '';
  let alertHTML = '';
  if (dateStr) {
    const last = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now - last) / (1000 * 60 * 60 * 24));
    const intervalDays = (state.stringInterval || 3) * 30;
    const remaining = intervalDays - diffDays;
    let alertClass = 'ok', alertIcon = '✅', alertTitle = '', alertSub = '';
    if (remaining <= 0) {
      alertClass = 'danger'; alertIcon = '🔴';
      alertTitle = `교체 기한 ${Math.abs(remaining)}일 초과!`;
      alertSub = '스트링이 오래됐어요. 빠른 교체를 권장합니다.';
    } else if (remaining <= 14) {
      alertClass = ''; alertIcon = '⚠️';
      alertTitle = `교체까지 ${remaining}일 남았어요`;
      alertSub = '슬슬 교체를 준비해보세요.';
    } else {
      alertTitle = `교체까지 ${remaining}일 남았어요`;
      alertSub = `마지막 교체: ${dateStr} · ${diffDays}일 경과`;
    }
    alertHTML = `<div class="stringing-alert ${alertClass}" style="margin-bottom:12px;">
      <div class="stringing-alert-icon">${alertIcon}</div>
      <div class="stringing-alert-text">
        <div class="stringing-alert-title">${alertTitle}</div>
        <div class="stringing-alert-sub">${alertSub}</div>
      </div>
    </div>`;
  } else {
    alertHTML = `<div class="stringing-alert" style="margin-bottom:12px;">
      <div class="stringing-alert-icon">ℹ️</div>
      <div class="stringing-alert-text">
        <div class="stringing-alert-title">마지막 교체일을 입력해주세요</div>
        <div class="stringing-alert-sub">교체 주기 알림을 받을 수 있어요</div>
      </div>
    </div>`;
  }

  alertEl.innerHTML = `
    <div style="display:flex;gap:6px;margin-bottom:12px;">${tabHTML}</div>
    ${alertHTML}`;

  // 날짜/인터벌 폼
  const lastStringDateEl = document.getElementById('lastStringDate');
  if (lastStringDateEl) lastStringDateEl.value = racket.stringDate || '';
  const stringIntervalEl = document.getElementById('stringInterval');
  if (stringIntervalEl) stringIntervalEl.value = state.stringInterval || 3;

  // 새 교체 날짜 기본값
  const newDateEl = document.getElementById('newStringDate');
  if (newDateEl && !newDateEl.value) newDateEl.value = getTodayStr();

  // 히스토리 (선택된 라켓 기준)
  const listEl = document.getElementById('stringingHistoryList');
  if (!listEl) return;
  const hist = [...(state.stringingHistory || [])]
    .filter(h => (h.racketIdx === undefined ? true : h.racketIdx === selectedIdx))
    .sort((a, b) => b.date.localeCompare(a.date));

  if (!hist.length) {
    listEl.innerHTML = '<div style="color:var(--text-muted);font-size:13px;padding:12px 0 8px;">교체 이력이 없습니다</div>';
  } else {
    listEl.innerHTML = hist.map(h => `
      <div class="stringing-history-row">
        <div class="stringing-dot"></div>
        <div class="stringing-history-info">
          <div class="stringing-history-name">${escHtml(h.name)}</div>
          <div class="stringing-history-meta">${h.date}</div>
        </div>
        <button class="stringing-history-del" onclick="deleteStringingHistory(${h.id})">🗑️</button>
      </div>`).join('');
  }
}

function stringingSelectRacket(idx) {
  state._stringingRacketIdx = idx;
  renderStringing();
}

function saveLastStringDate(val) {
  _initRackets();
  const idx = state._stringingRacketIdx || 0;
  if (state.rackets[idx]) state.rackets[idx].stringDate = val;
  // 첫 번째 라켓이면 레거시 필드도 동기화
  if (idx === 0) {
    state.lastStringDate = val;
    state.profile.stringDate = val;
  }
  save();
  renderStringing();
  renderStringBanner();
  showToast('📅 교체일 저장 완료!');
}

function saveStringInterval(val) {
  state.stringInterval = parseInt(val);
  save();
  renderStringing();
}

function addStringingHistory() {
  const name = document.getElementById('newStringName').value.trim();
  const date = document.getElementById('newStringDate').value;
  if (!name) { showToast('⚠️ 스트링명을 입력하세요'); return; }
  if (!date) { showToast('⚠️ 날짜를 선택하세요'); return; }
  if (!state.stringingHistory) state.stringingHistory = [];
  _initRackets();
  const idx = state._stringingRacketIdx || 0;
  const id = Date.now();
  state.stringingHistory.push({ id, name, date, racketIdx: idx });
  // 선택된 라켓의 교체일 자동 갱신
  const latestForRacket = [...state.stringingHistory]
    .filter(h => h.racketIdx === idx || (idx === 0 && h.racketIdx === undefined))
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  if (latestForRacket && state.rackets[idx]) {
    state.rackets[idx].stringDate = latestForRacket.date;
    if (idx === 0) {
      state.lastStringDate = latestForRacket.date;
      state.profile.stringDate = latestForRacket.date;
    }
  }
  save();
  document.getElementById('newStringName').value = '';
  renderStringing();
  renderStringBanner();
  showToast('✅ 장비 이력 추가 완료!');
}

function deleteStringingHistory(id) {
  _initRackets();
  const idx = state._stringingRacketIdx || 0;
  state.stringingHistory = state.stringingHistory.filter(h => h.id !== id);
  // 최근 교체일 재계산
  const remaining = state.stringingHistory.filter(h => h.racketIdx === idx || (idx === 0 && h.racketIdx === undefined));
  if (remaining.length) {
    const latest = [...remaining].sort((a, b) => b.date.localeCompare(a.date))[0];
    if (state.rackets[idx]) state.rackets[idx].stringDate = latest.date;
    if (idx === 0) {
      state.lastStringDate = latest.date;
      state.profile.stringDate = latest.date;
    }
  } else {
    if (state.rackets[idx]) state.rackets[idx].stringDate = '';
    if (idx === 0) {
      state.lastStringDate = '';
      state.profile.stringDate = '';
    }
  }
  save();
  renderStringing();
  renderStringBanner();
  showToast('🗑️ 삭제 완료');
}

function addPlayer() {
  const name = document.getElementById('newPlayerName').value.trim();
  if (!name) { showToast('⚠️ 이름을 입력하세요'); return; }
  if (state.players.find(p => p.name === name)) { showToast('⚠️ 이미 등록된 선수입니다'); return; }
  const age    = document.getElementById('newPlayerAge').value;
  const career = document.getElementById('newPlayerCareer').value;
  const hand   = document.getElementById('newPlayerHand').value;
  const style  = document.getElementById('newPlayerStyle').value;
  const gender = document.getElementById('newPlayerGender') ? document.getElementById('newPlayerGender').value : '';
  const grade  = document.getElementById('newPlayerGrade') ? document.getElementById('newPlayerGrade').value.trim() : '';
  const club   = document.getElementById('newPlayerClub') ? document.getElementById('newPlayerClub').value : '';
  const clubs  = club ? [club] : [];
  state.players.push({ id: state.nextPlayerId++, name, memo: '', clubs,
    age, career, hand, style, gender, grade });
  save();
  document.getElementById('newPlayerName').value = '';
  document.getElementById('newPlayerAge').value = '';
  document.getElementById('newPlayerCareer').value = '';
  document.getElementById('newPlayerHand').value = '';
  document.getElementById('newPlayerStyle').value = '';
  if (document.getElementById('newPlayerGender')) document.getElementById('newPlayerGender').value = '';
  if (document.getElementById('newPlayerGrade'))  document.getElementById('newPlayerGrade').value  = '';
  if (document.getElementById('newPlayerClub'))   document.getElementById('newPlayerClub').value   = '';
  renderPlayers();
  showToast(`✅ ${name} 추가 완료!`);
}

function savePlayerProfile(playerId, key, value) {
  const player = state.players.find(p => p.id === playerId);
  if (!player) return;
  player[key] = value;
  save();
}

function savePlayerClub(playerId, club) {
  const player = state.players.find(p => p.id === playerId);
  if (!player) return;
  player.clubs = club ? [club] : [];
  save();
  showToast('클럽이 저장됐어요!');
}

function renderPlayers() {
  renderClubTags();
  renderPlayerClubFilter();
  // 선수 등록 폼 클럽 드롭다운 업데이트
  const clubSelect = document.getElementById('newPlayerClub');
  if (clubSelect) {
    const currentVal = clubSelect.value;
    clubSelect.innerHTML = '<option value="">클럽 선택 (선택사항)</option>' +
      (state.clubs || []).map(c => `<option value="${escHtml(c)}"${currentVal===c?' selected':''}>${escHtml(c)}</option>`).join('');
  }
  // 정렬 셀렉트 동기화
  const sortEl = document.getElementById('playerSortSelect');
  if (sortEl) sortEl.value = state.playerSort || 'name';
  const el = document.getElementById('playerList');

  // 필터 적용
  let filtered = state.players;
  if (state.playerClubFilter !== '전체') {
    if (state.playerClubFilter === '클럽 없음') {
      filtered = state.players.filter(p => !p.clubs || p.clubs.length === 0);
    } else {
      filtered = state.players.filter(p => p.clubs && p.clubs.includes(state.playerClubFilter));
    }
  }

  // 정렬
  const sort = state.playerSort || 'name';
  if (sort === 'name') {
    filtered = [...filtered].sort((a,b) => a.name.localeCompare(b.name, 'ko'));
  } else if (sort === 'recent') {
    filtered = [...filtered].sort((a,b) => {
      const la = state.matches.filter(m => m.opponent===a.name||m.opponent2===a.name||m.partner===a.name).map(m=>m.date).sort().pop() || '';
      const lb = state.matches.filter(m => m.opponent===b.name||m.opponent2===b.name||m.partner===b.name).map(m=>m.date).sort().pop() || '';
      return lb.localeCompare(la);
    });
  } else if (sort === 'matches') {
    filtered = [...filtered].sort((a,b) => {
      const ca = state.matches.filter(m => m.opponent===a.name||m.opponent2===a.name||m.partner===a.name).length;
      const cb = state.matches.filter(m => m.opponent===b.name||m.opponent2===b.name||m.partner===b.name).length;
      return cb - ca;
    });
  } else if (sort === 'winrate') {
    filtered = [...filtered].sort((a,b) => {
      const ma = state.matches.filter(m => m.opponent===a.name||m.opponent2===a.name);
      const mb = state.matches.filter(m => m.opponent===b.name||m.opponent2===b.name);
      const ra = ma.length ? ma.filter(m=>m.result==='win').length/ma.length : -1;
      const rb = mb.length ? mb.filter(m=>m.result==='win').length/mb.length : -1;
      return rb - ra;
    });
  }

  if (!filtered.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">👥</div><div class="empty-text">${state.playerClubFilter === '전체' ? '선수를 추가해보세요!' : '해당 클럽에 선수가 없습니다'}</div></div>`;
    return;
  }
  el.innerHTML = filtered.map(p => {
    const initial = p.name.charAt(0);
    const memoPreview = p.memo ? `<div class="player-memo-preview">📝 메모: ${p.memo}</div>` : '';
    const playerClubs = p.clubs || [];
    const clubDisplay = playerClubs.length
      ? playerClubs.map(c => `<span class="club-badge">${escHtml(c)}</span>`).join('')
      : (state.clubs.length ? `<span style="font-size:10px;color:var(--text-muted);"> · 클럽 없음</span>` : '');

    return `<li class="player-item" id="playerItem-${p.id}">
      <div class="player-item-main">
        <div class="player-avatar-sm" onclick="showPlayerDetail(${p.id})" style="cursor:pointer;">${initial}</div>
        <div class="player-info" onclick="showPlayerDetail(${p.id})" style="cursor:pointer;">
          <div class="player-name">${escHtml(p.name)}${clubDisplay}</div>
          <div class="player-meta" style="margin-bottom:2px;">
            ${p.gender||p.grade ? `<span style="color:var(--text-muted);font-size:11px;">${[p.gender, p.grade ? '등급 '+p.grade : ''].filter(Boolean).join(' · ')}</span>` : ''}
          </div>
          <div class="player-meta" style="color:var(--accent);font-size:11px;">전적 보기 →</div>
          ${memoPreview}
        </div>
        <div class="player-actions">
          <button class="player-action-btn edit-btn" onclick="toggleEdit(${p.id})" title="이름 수정">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          ${state.clubs.length ? `<button class="player-action-btn" onclick="toggleClubAssign(${p.id})" title="클럽 배정" style="color:var(--accent2);">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          </button>` : ''}
          <button class="player-action-btn" onclick="toggleMemo(${p.id})" title="메모 추가/수정" style="color:var(--accent);">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
          </button>
          <button class="player-action-btn delete-btn" onclick="deletePlayer(${p.id})" title="삭제">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
          </button>
        </div>
      </div>
      <!-- CLUB ASSIGN AREA (복수 선택) -->
      ${state.clubs.length ? `<div class="player-club-area" id="clubArea-${p.id}">
        <div class="memo-label">🏠 클럽 배정 (복수 선택 가능)</div>
        <div class="club-assign-btns">
          <button class="club-assign-btn none-btn${playerClubs.length===0?' selected':''}" data-club="" onclick="clearPlayerClubs(${p.id})">없음</button>
          ${state.clubs.map(c => `<button class="club-assign-btn${playerClubs.includes(c)?' selected':''}" data-club="${escHtml(c)}" onclick="togglePlayerClub(${p.id},this.dataset.club)">${escHtml(c)}</button>`).join('')}
        </div>
      </div>` : ''}
      <!-- EDIT AREA -->
      <div class="player-edit-area" id="editArea-${p.id}">
        <div class="memo-label">✏️ 이름 수정</div>
        <div class="edit-row">
          <input class="form-input" id="editInput-${p.id}" value="${escHtml(p.name)}" placeholder="새 이름">
          <button class="edit-confirm-btn" onclick="confirmEdit(${p.id})">저장</button>
          <button class="edit-cancel-btn" onclick="cancelEdit(${p.id})">취소</button>
        </div>
      </div>
      <!-- MEMO AREA -->
      <div class="player-memo-area" id="memoArea-${p.id}">
        <div class="memo-label">📝 선수 메모 (특징, 스타일 등)</div>
        <textarea class="player-memo-input" id="memoInput-${p.id}" placeholder="예) 수비 스타일로 발리 잘 안 들어옴&#10;예) 드라이브 강함, 풋워크 빠름">${escHtml(p.memo || '')}</textarea>
        <button class="memo-save-btn" onclick="saveMemo(${p.id})">💾 메모 저장</button>
      </div>
    </li>`;
  }).join('');
}

function clearPlayerClubs(playerId) {
  const player = state.players.find(p => p.id === playerId);
  if (!player) return;
  player.clubs = [];
  save();
  const area = document.getElementById('clubArea-' + playerId);
  if (area) {
    area.querySelectorAll('.club-assign-btn').forEach(btn => {
      btn.classList.toggle('selected', btn.dataset.club === '');
    });
  }
  const nameEl = document.querySelector(`#playerItem-${playerId} .player-name`);
  if (nameEl) nameEl.innerHTML = escHtml(player.name) + (state.clubs.length ? `<span style="font-size:10px;color:var(--text-muted);"> · 클럽 없음</span>` : '');
  showToast('클럽 전체 해제');
}

function showPlayerDetail(playerId) {
  const player = state.players.find(p => p.id === playerId);
  if (!player) return;

  const myName = state.profile.name || '나';

  // 이 선수가 포함된 모든 경기 계산 (상대 or 파트너 상대)
  const allMatches = state.matches.filter(m =>
    m.opponent === player.name || m.opponent2 === player.name || m.partner === player.name
  );

  // 이 선수의 전체 전적 (내가 아닌 선수의 결과 기준)
  // 선수가 내 상대로 나온 경기만 기준으로 총 전적 계산
  const vsMatches = state.matches.filter(m =>
    m.opponent === player.name || m.opponent2 === player.name
  );

  // 선수 전체 승/패 (내 기록의 반대)
  const myWinsVs = vsMatches.filter(m => m.result === 'win').length;
  const myLossVs = vsMatches.filter(m => m.result === 'lose').length;
  const playerWins = myLossVs; // 내가 지면 상대방이 이긴 것
  const playerLoses = myWinsVs;
  const totalVs = vsMatches.length;
  const playerRate = totalVs > 0 ? Math.round((playerWins / totalVs) * 100) : 0;

  // 나와의 전적
  const myWin = myWinsVs;
  const myLoss = myLossVs;
  const myRate = totalVs > 0 ? Math.round((myWin / totalVs) * 100) : 0;

  // 최근 경기 이력 (최대 10개, 최신순)
  const recentMatches = [...vsMatches].sort((a,b) => b.date.localeCompare(a.date)).slice(0, 10);

  const playerClubs = player.clubs || [];
  const clubTag = playerClubs.length
    ? playerClubs.map(c => `<span class="club-badge">${escHtml(c)}</span>`).join('')
    : '<span style="color:var(--text-muted);font-size:12px;">클럽 없음</span>';

  const rateBarWidth = myRate + '%';

  const matchRows = recentMatches.length
    ? recentMatches.map(m => {
        const isWin = m.result === 'win';
        const score = m.myScore != null ? `${m.myScore} : ${m.oppScore}` : '';
        const fmt = m.format === 'doubles' ? '복식' : '단식';
        return `<div class="player-match-row">
          <div class="player-match-badge ${isWin ? 'W' : 'L'}">${isWin ? 'W' : 'L'}</div>
          <div class="player-match-info">
            <div class="player-match-date">${m.date} · ${fmt}</div>
            <div class="player-match-score">${score ? score + ' ' : ''}vs ${escHtml(player.name)}</div>
          </div>
        </div>`;
      }).join('')
    : `<div style="color:var(--text-muted);font-size:13px;text-align:center;padding:20px 0;">경기 기록이 없습니다</div>`;

  // 선수 프로필 항목
  const pAge    = player.age    || '';
  const pHand   = player.hand   || '';
  const pCareer = player.career || '';
  const pStyle  = player.style  || '';
  const pGender = player.gender || '';
  const pGrade  = player.grade  || '';
  const pClubs  = player.clubs  || [];
  const profileItems = [
    { lbl:'성별',   val:pGender, key:'gender', type:'select', opts:['남자','여자'] },
    { lbl:'등급',   val:pGrade,  key:'grade',  type:'input',  placeholder:'예) 14' },
    { lbl:'나이대', val:pAge,    key:'age',    type:'select', opts:['10대','20대','30대','40대','50대','60대 이상'] },
    { lbl:'손잡이', val:pHand,   key:'hand',   type:'select', opts:['오른손','왼손'] },
    { lbl:'구력',   val:pCareer, key:'career', type:'select', opts:['6개월 미만','6개월~1년','1~2년','2~5년','5~10년','10년 이상'] },
    { lbl:'스타일', val:pStyle,  key:'style',  type:'select', opts:['공격형','수비형','올라운드','네트플레이','베이스라인'] },
  ];
  const profileGrid = profileItems.map(item => {
    if (item.type === 'input') {
      return `<div class="pd-profile-item">
        <div class="pd-profile-lbl">${item.lbl}</div>
        <input class="pd-profile-select" type="text" inputmode="numeric"
          placeholder="${item.placeholder||''}"
          value="${escHtml(item.val)}"
          data-pid="${player.id}" data-key="${item.key}"
          onchange="savePlayerProfile(parseInt(this.dataset.pid),this.dataset.key,this.value.trim());showToast('저장됐어요 ✅')"
          style="text-align:right;width:100%;background:transparent;border:none;outline:none;font-size:13px;font-weight:700;color:var(--text);font-family:inherit;">
      </div>`;
    }
    return `<div class="pd-profile-item">
      <div class="pd-profile-lbl">${item.lbl}</div>
      <select class="pd-profile-select${item.val?'':' unset'}"
        data-pid="${player.id}" data-key="${item.key}"
        onchange="savePlayerProfile(parseInt(this.dataset.pid),this.dataset.key,this.value);this.classList.toggle('unset',!this.value)">
        <option value="">미설정</option>
        ${item.opts.map(o=>`<option${item.val===o?' selected':''}>${o}</option>`).join('')}
      </select>
    </div>`;
  }).join('');

  // 클럽 수정 UI
  const clubOptions = (state.clubs || []).map(c =>
    `<option value="${escHtml(c)}"${pClubs.includes(c)?' selected':''}>${escHtml(c)}</option>`
  ).join('');
  const clubEditHtml = state.clubs && state.clubs.length > 0 ? `
    <div class="card" style="margin-bottom:12px;">
      <div class="pd-section-title">🏠 클럽</div>
      <select class="form-select" onchange="savePlayerClub(${player.id}, this.value)">
        <option value="">클럽 없음</option>
        ${clubOptions}
      </select>
    </div>` : '';

  document.getElementById('playerDetailContent').innerHTML = `
    <!-- 히어로 헤더 -->
    <div class="pd-hero">
      <div class="pd-avatar">${player.name.charAt(0)}</div>
      <div class="pd-hero-info">
        <div class="pd-name">${escHtml(player.name)}</div>
        ${(player.gender||player.grade) ? `<div style="display:flex;gap:6px;margin-bottom:4px;flex-wrap:wrap;">
          ${player.gender ? `<span style="background:rgba(124,106,247,.18);color:var(--accent);font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px;">${escHtml(player.gender)}</span>` : ''}
          ${player.grade  ? `<span style="background:rgba(251,191,36,.18);color:#fbbf24;font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px;">Lv.${escHtml(player.grade)}</span>` : ''}
        </div>` : ''}
        <div class="pd-clubs">${clubTag}</div>
      </div>
    </div>

    ${player.memo ? `<div class="card" style="margin-bottom:12px;background:rgba(124,106,247,.07);border-color:rgba(124,106,247,.25);">
      <div style="font-size:11px;color:var(--accent);font-weight:700;margin-bottom:4px;">📝 메모</div>
      <div style="font-size:13px;color:var(--text);line-height:1.6;">${escHtml(player.memo)}</div>
    </div>` : ''}

    <!-- 선수 프로필 -->
    <div class="card" style="margin-bottom:12px;">
      <div class="pd-section-title">👤 선수 프로필</div>
      <div class="pd-profile-grid">${profileGrid}</div>
    </div>

    ${clubEditHtml}

    <!-- 전적 요약 -->
    <div class="pd-stat-row">
      <div class="pd-stat-box">
        <div class="pd-stat-num">${totalVs}</div>
        <div class="pd-stat-lbl">총 경기</div>
      </div>
      <div class="pd-stat-box win">
        <div class="pd-stat-num win">${myWin}</div>
        <div class="pd-stat-lbl">내 승</div>
      </div>
      <div class="pd-stat-box lose">
        <div class="pd-stat-num lose">${myLoss}</div>
        <div class="pd-stat-lbl">내 패</div>
      </div>
    </div>

    <!-- 나와의 전적 카드 -->
    <div class="card" style="margin-bottom:12px;">
      <div class="pd-section-title">🆚 나와의 전적</div>
      <div class="pd-vs-row">
        <div class="pd-vs-block">
          <div class="pd-vs-num win">${myWin}</div>
          <div class="pd-vs-sub">승</div>
        </div>
        <div class="pd-vs-sep">VS</div>
        <div class="pd-vs-block">
          <div class="pd-vs-num lose">${myLoss}</div>
          <div class="pd-vs-sub">패</div>
        </div>
        <div class="pd-vs-rate" style="color:${myRate>=50?'var(--success)':'var(--danger)'};">
          ${myRate}%<span>내 승률</span>
        </div>
      </div>
      <div class="pd-rate-bar-bg">
        <div class="pd-rate-bar-fill" style="width:${myRate}%;background:${myRate>=50?'var(--success)':'var(--danger)'}"></div>
      </div>
    </div>

    <!-- 최근 대전 기록 -->
    <div class="card" style="margin-bottom:20px;">
      <div class="pd-section-title">📋 최근 대전 기록</div>
      ${matchRows}
    </div>
  `;

  // player-detail 페이지로 이동
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('page-player-detail').classList.add('active');
  document.getElementById('nav-players').classList.add('active');
}
function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function toggleEdit(id) {
  const area = document.getElementById('editArea-' + id);
  const isOpen = area.classList.contains('open');
  document.querySelectorAll('.player-edit-area.open, .player-memo-area.open, .player-club-area.open').forEach(a => a.classList.remove('open'));
  if (!isOpen) {
    area.classList.add('open');
    // 모바일에서 강제 focus 제거 (키보드 튀어나옴 방지)
  }
}

function cancelEdit(id) {
  document.getElementById('editArea-' + id).classList.remove('open');
}

function confirmEdit(id) {
  const input = document.getElementById('editInput-' + id);
  const newName = input.value.trim();
  if (!newName) { showToast('⚠️ 이름을 입력하세요'); return; }
  const player = state.players.find(p => p.id === id);
  if (!player) return;
  const oldName = player.name;
  if (newName === oldName) { cancelEdit(id); return; }
  if (state.players.find(p => p.name === newName && p.id !== id)) {
    showToast('⚠️ 이미 등록된 이름입니다'); return;
  }
  player.name = newName;
  // also update matches
  state.matches.forEach(m => {
    if (m.opponent === oldName) m.opponent = newName;
    if (m.opponent2 === oldName) m.opponent2 = newName;
    if (m.partner === oldName) m.partner = newName;
  });
  save();
  renderPlayers();
  showToast(`✅ ${newName}으로 수정 완료!`);
}

function toggleMemo(id) {
  const area = document.getElementById('memoArea-' + id);
  const isOpen = area.classList.contains('open');
  document.querySelectorAll('.player-edit-area.open, .player-memo-area.open, .player-club-area.open').forEach(a => a.classList.remove('open'));
  if (!isOpen) {
    area.classList.add('open');
    // 모바일에서 강제 focus 제거 (키보드 튀어나옴 방지)
  }
}

function saveMemo(id) {
  const memo = document.getElementById('memoInput-' + id).value.trim();
  const player = state.players.find(p => p.id === id);
  if (!player) return;
  player.memo = memo;
  save();
  document.getElementById('memoArea-' + id).classList.remove('open');
  renderPlayers();
  showToast(memo ? '📝 메모 저장 완료!' : '🗑️ 메모 삭제 완료');
}

function deletePlayer(id) {
  const player = state.players.find(p => p.id === id);
  if (!player) return;
  showConfirm(`"${player.name}" 삭제`, '선수를 삭제하면 복구할 수 없습니다. 경기 기록은 유지됩니다.', '🗑️', () => {
    state.players = state.players.filter(p => p.id !== id);
    save();
    renderPlayers();
    showToast('🗑️ 선수 삭제 완료');
  });
}

// ===== BACKUP =====
function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `niji-backup-${getTodayStr()}.json`;
  a.click();
  showToast('💾 내보내기 완료!');
}
function importData(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const d = JSON.parse(e.target.result);
      _applyFirebaseData(d);
      // 사진도 복원
      if (d.profile && d.profile.photo) {
        state.profile.photo = d.profile.photo;
        try {
          const uid = window._userId || 'local';
          localStorage.setItem('nijiPhoto_' + uid, d.profile.photo);
        } catch(ex) {}
      }
      save();
      renderProfile();
      renderMatchList();
      showToast('✅ 가져오기 완료!');
    } catch(ex) { showToast('❌ 파일 형식 오류'); }
  };
  reader.readAsText(file);
  input.value = '';
}


// ===== 대회 탭 전환 =====
let _contestTab = 'hanul'; // 'hanul' | 'tour'
let _contestTabInitialized = false;

function switchContestTab(tab) {
  _contestTab = tab;
  const hanulBtn = document.getElementById('ctab-hanul');
  const tourBtn  = document.getElementById('ctab-tour');
  const hanulEl  = document.getElementById('tv-root');
  const tourEl   = document.getElementById('tn-root');
  if (!hanulBtn || !tourBtn || !hanulEl || !tourEl) return;

  if (tab === 'hanul') {
    hanulBtn.style.background = 'var(--accent)'; hanulBtn.style.color = '#fff';
    tourBtn.style.background  = 'var(--surface2)'; tourBtn.style.color = 'var(--text-muted)';
    hanulEl.style.display = 'block';
    tourEl.style.display  = 'none';
    renderTournamentList();
  } else {
    tourBtn.style.background  = 'var(--accent)'; tourBtn.style.color = '#fff';
    hanulBtn.style.background = 'var(--surface2)'; hanulBtn.style.color = 'var(--text-muted)';
    hanulEl.style.display = 'none';
    tourEl.style.display  = 'block';
    renderTnList();
  }
}

function renderTournamentSection() {
  // 탭 진입 시 현재 선택된 탭 기준으로 한 번만 렌더링 (이중 실행 방지)
  switchContestTab(_contestTab);
}

// ===== 토너먼트 기능 =====
// state.tnTournaments = [{ id, name, date, format('singles'|'doubles'), players:[], bracket:[] }]

function renderTnList() {
  const el = document.getElementById('tn-root');
  if (!el) return;
  if (!state.tnTournaments) state.tnTournaments = [];
  const list = state.tnTournaments;

  let html = `
    <div class="page-header">🏆 토너먼트</div>
    <div class="page-sub">단·복식 대진표를 자동으로 생성해요</div>
    <button onclick="showTnCreate()" style="width:100%;padding:14px;background:var(--accent);color:#fff;border:none;border-radius:12px;font-size:15px;font-weight:700;cursor:pointer;margin-bottom:16px;">+ 새 토너먼트 만들기</button>
  `;

  if (!list.length) {
    html += '<div style="text-align:center;color:var(--text-muted);padding:40px 0;">토너먼트가 없어요.<br>새 토너먼트를 만들어보세요!</div>';
  } else {
    html += list.slice().reverse().map(t => {
      const fmtLabel = t.format === 'doubles' ? '복식' : '단식';
      const fmtColor = t.format === 'doubles' ? 'rgba(124,106,247,.15)' : 'rgba(247,106,200,.15)';
      const fmtTextColor = t.format === 'doubles' ? 'var(--accent)' : 'var(--accent2)';
      const done = (t.bracket || []).every(r => r.games.every(g => g.winner));
      return `<div style="background:var(--surface);border-radius:12px;padding:16px;margin-bottom:12px;">
        <div onclick="tnOpen(${t.id})" style="cursor:pointer;margin-bottom:10px;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div>
              <div style="font-size:16px;font-weight:700;">${escHtml(t.name)}</div>
              <div style="font-size:13px;color:var(--text-muted);margin-top:4px;">${t.date} · ${t.players.length}명
                <span style="margin-left:6px;padding:2px 8px;border-radius:20px;background:${fmtColor};color:${fmtTextColor};font-size:11px;font-weight:700;">${fmtLabel}</span>
              </div>
            </div>
            <div style="font-size:12px;padding:4px 10px;border-radius:20px;background:${done?'rgba(74,222,128,.15)':'rgba(124,106,247,.15)'};color:${done?'#4ade80':'var(--accent)'};">
              ${done?'완료':'진행중'}
            </div>
          </div>
        </div>
        <div style="display:flex;gap:8px;">
          <button onclick="tnOpen(${t.id})" style="flex:1;padding:8px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:13px;cursor:pointer;">📋 대진표 보기</button>
          <button onclick="tnDelete(${t.id})" style="padding:8px 14px;background:rgba(248,113,113,.1);border:1px solid rgba(248,113,113,.3);border-radius:8px;color:#f87171;font-size:13px;cursor:pointer;">🗑️</button>
        </div>
      </div>`;
    }).join('');
  }
  el.innerHTML = html;
}

let _tnFormat = 'singles';
let _tnSelected = [];

function showTnCreate() {
  _tnSelected = [];
  _tnFormat = 'singles';
  document.getElementById('tn-tname').value = '';
  document.getElementById('tn-tdate').value = getTodayStr();
  tnSetFormat('singles');
  tnRenderPlayerBtns();
  document.getElementById('tnCreateModal').classList.add('open');
}

function tnSetFormat(fmt) {
  _tnFormat = fmt;
  const sBtn = document.getElementById('tn-fmt-singles');
  const dBtn = document.getElementById('tn-fmt-doubles');
  sBtn.style.background = fmt === 'singles' ? 'var(--accent)' : 'var(--surface2)';
  sBtn.style.color      = fmt === 'singles' ? '#fff' : 'var(--text-muted)';
  dBtn.style.background = fmt === 'doubles' ? 'var(--accent)' : 'var(--surface2)';
  dBtn.style.color      = fmt === 'doubles' ? '#fff' : 'var(--text-muted)';
  // 복식은 짝수 명 안내 표시
  const note = document.getElementById('tn-fmt-note');
  if (note) note.textContent = fmt === 'doubles' ? '※ 복식은 짝수 명이어야 해요 (4·8·16명)' : '※ 단식은 2·4·8·16명 권장';
}

function tnRenderPlayerBtns() {
  const players = state.players || [];
  const container = document.getElementById('tn-player-btns');
  if (!container) return;
  if (!players.length) {
    container.innerHTML = '<div style="color:var(--text-muted);font-size:13px;">선수 탭에서 먼저 선수를 등록하세요.</div>';
    return;
  }

  // 클럽별 그룹 분류
  const grouped = {};
  const noClub = [];
  players.forEach(p => {
    const pClubs = p.clubs && p.clubs.length > 0 ? p.clubs : [];
    if (pClubs.length === 0) {
      noClub.push(p);
    } else {
      pClubs.forEach(c => {
        if (!grouped[c]) grouped[c] = [];
        grouped[c].push(p);
      });
    }
  });

  let html = `<div style="margin-bottom:8px;">
    <button onclick="tnSelectAll()" style="padding:6px 12px;background:var(--surface2);border:1px solid var(--border);border-radius:20px;color:var(--text-muted);font-size:12px;cursor:pointer;margin-right:6px;">전체 선택</button>
    <button onclick="tnClearAll()" style="padding:6px 12px;background:var(--surface2);border:1px solid var(--border);border-radius:20px;color:var(--text-muted);font-size:12px;cursor:pointer;">전체 해제</button>
  </div>`;

  // 클럽별 섹션
  Object.entries(grouped).forEach(([club, clubPlayers]) => {
    const safeClub = club.replace(/"/g,'&quot;');
    html += `<div style="margin-bottom:10px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
        <span style="font-size:12px;font-weight:700;color:var(--accent);">🏠 ${escHtml(club)}</span>
        <button data-club="${safeClub}" onclick="tnSelectClub(this.dataset.club)" style="padding:3px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:20px;color:var(--text-muted);font-size:11px;cursor:pointer;">전체선택</button>
      </div>
      <div>${clubPlayers.map(p => {
        const safeName = p.name.replace(/"/g,'&quot;');
        return `<span id="tnbtn-${p.id}" data-pname="${safeName}" onclick="tnToggle(this)"
          style="display:inline-block;margin:3px;padding:7px 13px;border-radius:20px;cursor:pointer;font-size:14px;background:var(--surface2);color:var(--text-muted);">${escHtml(p.name)}</span>`;
      }).join('')}</div>
    </div>`;
  });

  // 클럽 없는 선수
  if (noClub.length > 0) {
    html += `<div style="margin-bottom:10px;">
      <div style="font-size:12px;font-weight:700;color:var(--text-muted);margin-bottom:6px;">기타</div>
      <div>${noClub.map(p => {
        const safeName = p.name.replace(/"/g,'&quot;');
        return `<span id="tnbtn-${p.id}" data-pname="${safeName}" onclick="tnToggle(this)"
          style="display:inline-block;margin:3px;padding:7px 13px;border-radius:20px;cursor:pointer;font-size:14px;background:var(--surface2);color:var(--text-muted);">${escHtml(p.name)}</span>`;
      }).join('')}</div>
    </div>`;
  }

  container.innerHTML = html;
  tnRenderSelected();
}

function tnToggle(el) {
  const name = el.dataset.pname;
  if (!name) return;
  const idx = _tnSelected.indexOf(name);
  if (idx >= 0) {
    _tnSelected.splice(idx, 1);
    el.style.background = 'var(--surface2)';
    el.style.color = 'var(--text-muted)';
  } else {
    _tnSelected.push(name);
    el.style.background = 'var(--accent)';
    el.style.color = '#fff';
  }
  tnRenderSelected();
}

function tnSelectClub(club) {
  (state.players || []).filter(p => p.clubs && p.clubs.includes(club)).forEach(p => {
    if (!_tnSelected.includes(p.name)) {
      _tnSelected.push(p.name);
      const el = document.getElementById('tnbtn-' + p.id);
      if (el) { el.style.background = 'var(--accent)'; el.style.color = '#fff'; }
    }
  });
  tnRenderSelected();
}

function tnSelectAll() {
  _tnSelected = [];
  (state.players || []).forEach(p => {
    _tnSelected.push(p.name);
    const el = document.getElementById('tnbtn-' + p.id);
    if (el) { el.style.background = 'var(--accent)'; el.style.color = '#fff'; }
  });
  tnRenderSelected();
}

function tnClearAll() {
  _tnSelected = [];
  (state.players || []).forEach(p => {
    const el = document.getElementById('tnbtn-' + p.id);
    if (el) { el.style.background = 'var(--surface2)'; el.style.color = 'var(--text-muted)'; }
  });
  tnRenderSelected();
}

function tnAddManual() {
  const input = document.getElementById('tn-new-name');
  const name = input.value.trim();
  if (!name) return;
  if (!_tnSelected.includes(name)) {
    _tnSelected.push(name);
    tnRenderSelected();
  }
  input.value = '';
}

function tnRenderSelected() {
  const el = document.getElementById('tn-selected');
  if (!el) return;
  if (!_tnSelected.length) {
    el.innerHTML = '<div style="color:var(--text-muted);font-size:13px;">선수를 선택하세요 (최소 2명)</div>';
    return;
  }
  el.innerHTML = `<div style="background:var(--surface);border-radius:10px;padding:12px;">
    <div style="font-size:13px;color:var(--text-muted);margin-bottom:8px;">선택된 선수 ${_tnSelected.length}명 (위쪽이 시드 높음)</div>
    ${_tnSelected.map((n, i) => `<div style="display:flex;align-items:center;padding:5px 0;border-bottom:1px solid var(--border);gap:8px;">
      <span style="font-size:12px;color:var(--accent);font-weight:700;width:22px;">${i+1}.</span>
      <span style="flex:1;font-size:14px;">${escHtml(n)}</span>
      <button onclick="tnMoveUp(${i})" ${i===0?'disabled':''} style="background:var(--surface2);border:1px solid var(--border);border-radius:6px;color:var(--text);cursor:pointer;padding:2px 8px;font-size:13px;">↑</button>
      <button onclick="tnMoveDown(${i})" ${i===_tnSelected.length-1?'disabled':''} style="background:var(--surface2);border:1px solid var(--border);border-radius:6px;color:var(--text);cursor:pointer;padding:2px 8px;font-size:13px;">↓</button>
      <button onclick="tnRemove(${i})" style="background:rgba(248,113,113,.1);border:1px solid rgba(248,113,113,.3);border-radius:6px;color:#f87171;cursor:pointer;padding:2px 8px;font-size:13px;">✕</button>
    </div>`).join('')}
  </div>`;
}

function tnMoveUp(i) { if (i===0) return; [_tnSelected[i-1],_tnSelected[i]]=[_tnSelected[i],_tnSelected[i-1]]; tnRenderSelected(); }
function tnMoveDown(i) { if (i>=_tnSelected.length-1) return; [_tnSelected[i+1],_tnSelected[i]]=[_tnSelected[i],_tnSelected[i+1]]; tnRenderSelected(); }
function tnRemove(i) {
  const name = _tnSelected[i];
  _tnSelected.splice(i, 1);
  // 버튼 상태도 해제
  (state.players || []).forEach(p => {
    if (p.name === name) {
      const el = document.getElementById('tnbtn-' + p.id);
      if (el) { el.style.background = 'var(--surface2)'; el.style.color = 'var(--text-muted)'; }
    }
  });
  tnRenderSelected();
}

// 토너먼트 대진표 생성 (시드 방식)
function tnCreate() {
  const name = document.getElementById('tn-tname').value.trim();
  const date = document.getElementById('tn-tdate').value;
  if (!name) { showToast('⚠️ 대회 이름을 입력하세요'); return; }
  if (!date) { showToast('⚠️ 날짜를 선택하세요'); return; }
  if (_tnSelected.length < 2) { showToast('⚠️ 최소 2명 이상 선택하세요'); return; }
  if (_tnFormat === 'doubles' && _tnSelected.length % 2 !== 0) {
    showToast('⚠️ 복식은 짝수 명이어야 해요'); return;
  }

  const bracket = tnBuildBracket(_tnSelected, _tnFormat);
  if (!state.tnTournaments) state.tnTournaments = [];
  const id = Date.now();
  state.tnTournaments.push({ id, name, date, format: _tnFormat, players: [..._tnSelected], bracket });
  save();
  closeModal('tnCreateModal');
  showToast('🏆 토너먼트가 생성됐어요!');
  renderTnList();
  setTimeout(() => tnOpen(id), 300);
}

// 시드 배정 대진표 생성
function tnBuildBracket(players, format) {
  let entries;
  if (format === 'doubles') {
    entries = [];
    const n = players.length;
    for (let i = 0; i < n / 2; i++) {
      entries.push(players[i] + '/' + players[n - 1 - i]);
    }
  } else {
    entries = [...players];
  }

  const size = Math.pow(2, Math.ceil(Math.log2(Math.max(entries.length, 2))));

  // 표준 시드 배치
  function buildSeedOrder(n) {
    if (n === 1) return [0];
    const half = n / 2;
    const top = buildSeedOrder(half);
    const bottom = buildSeedOrder(half).map(x => x + half);
    const result = [];
    for (let i = 0; i < half; i++) {
      result.push(top[i]);
      result.push(bottom[half - 1 - i]);
    }
    return result;
  }
  const seedOrder = buildSeedOrder(size);
  const slotPlayer = new Array(size).fill(null);
  entries.forEach((e, i) => { slotPlayer[seedOrder[i]] = e; });

  const getRoundName = (total, roundIdx) => {
    const m = total / Math.pow(2, roundIdx + 1);
    if (m === 1) return '결승';
    if (m === 2) return '준결승';
    if (m === 4) return '8강';
    if (m === 8) return '16강';
    if (m === 16) return '32강';
    return m + '강';
  };

  const r1games = [];
  for (let i = 0; i < size; i += 2) {
    r1games.push({ a: slotPlayer[i], b: slotPlayer[i+1], winner: null, scoreA: '', scoreB: '' });
  }
  const totalMatches = size;
  const rounds = [];
  rounds.push({ name: getRoundName(totalMatches, 0), games: r1games });

  let prev = size / 2;
  let ri = 1;
  while (prev > 1) {
    const games = [];
    for (let i = 0; i < prev / 2; i++) {
      games.push({ a: null, b: null, winner: null, scoreA: '', scoreB: '' });
    }
    rounds.push({ name: getRoundName(totalMatches, ri), games });
    prev = prev / 2;
    ri++;
  }
  // 3·4위전은 준결승 있을 때만
  if (size >= 4) {
    rounds.push({ name: '3·4위전', games: [{ a: null, b: null, winner: null, scoreA: '', scoreB: '', is3rd: true }] });
  }

  // 부전승 자동 처리 (1라운드에서만)
  r1games.forEach((game, gi) => {
    const byeWinner = (game.a && !game.b) ? 'a' : (!game.a && game.b) ? 'b' : null;
    if (byeWinner) {
      game.winner = byeWinner;
      const winName = byeWinner === 'a' ? game.a : game.b;
      // 다음 라운드가 존재하고 3·4위전이 아닌 경우에만
      if (rounds[1] && rounds[1].name !== '3·4위전') {
        const nextGi = Math.floor(gi / 2);
        const nextSlot = gi % 2 === 0 ? 'a' : 'b';
        if (rounds[1].games[nextGi]) rounds[1].games[nextGi][nextSlot] = winName;
      }
    }
  });

  return rounds;
}

function tnDelete(id) {
  showConfirm('토너먼트 삭제', '삭제하면 복구할 수 없습니다.', '🗑️', () => {
    state.tnTournaments = (state.tnTournaments || []).filter(t => t.id !== id);
    save();
    renderTnList();
    showToast('🗑️ 삭제 완료');
  });
}

let _tnCurrentId = null;

function tnOpen(id) {
  _tnCurrentId = id;
  tnRefreshModal();
  document.getElementById('tnDetailModal').classList.add('open');
}

function tnRefreshModal() {
  const t = (state.tnTournaments || []).find(x => x.id === _tnCurrentId);
  if (!t) return;
  document.getElementById('tn-modal-name').textContent = t.name;
  document.getElementById('tn-modal-fmt').textContent = t.format === 'doubles' ? '복식' : '단식';
  document.getElementById('tn-modal-content').innerHTML = tnBracketHTML(t);
}

// ── 점수/승자 입력 팝업 ──
function tnOpenScoreModal(tid, ri, gi) {
  const t = (state.tnTournaments || []).find(x => x.id === tid);
  if (!t) return;
  const game = t.bracket[ri].games[gi];
  if (!game) return;
  if (game.winner !== null && game.winner !== undefined) {
    // 이미 결과 있으면 초기화 확인
    showConfirm('결과 초기화', '이 경기 결과를 초기화하시겠습니까?', '↩️', () => {
      tnResetWinner(tid, ri, gi);
    });
    return;
  }
  const aName = game.a || '미정';
  const bName = game.b || '미정';

  const overlay = document.createElement('div');
  overlay.id = 'tn-score-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';
  overlay.innerHTML = `
    <div style="background:var(--surface);border-radius:20px;padding:24px;width:100%;max-width:340px;border:1px solid var(--border);">
      <div style="text-align:center;font-size:13px;font-weight:700;color:var(--text-muted);margin-bottom:18px;letter-spacing:1px;">⚔️ 경기 결과 입력</div>

      <!-- 선수 이름 -->
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:20px;">
        <div style="flex:1;text-align:center;font-size:15px;font-weight:700;color:var(--text);padding:10px 6px;background:var(--surface2);border-radius:10px;word-break:break-all;">${escHtml(aName)}</div>
        <div style="font-size:18px;font-weight:900;color:var(--text-muted);">VS</div>
        <div style="flex:1;text-align:center;font-size:15px;font-weight:700;color:var(--text);padding:10px 6px;background:var(--surface2);border-radius:10px;word-break:break-all;">${escHtml(bName)}</div>
      </div>

      <!-- 점수 입력 -->
      <div style="margin-bottom:16px;">
        <div style="font-size:11px;color:var(--text-muted);text-align:center;margin-bottom:8px;font-weight:600;">점수 입력 (선택사항)</div>
        <div style="display:flex;align-items:center;gap:10px;justify-content:center;">
          <div style="text-align:center;">
            <div style="font-size:11px;color:var(--accent);margin-bottom:4px;">${escHtml(aName.length>6?aName.slice(0,6)+'…':aName)}</div>
            <div style="display:flex;align-items:center;gap:6px;">
              <button onclick="tnScoreAdj('sa',-1)" style="width:36px;height:36px;border-radius:8px;border:1px solid var(--border);background:var(--surface2);color:var(--text);font-size:20px;cursor:pointer;display:flex;align-items:center;justify-content:center;">−</button>
              <div id="tn-sa-val" style="width:44px;height:44px;line-height:44px;text-align:center;background:var(--surface2);border-radius:10px;font-size:22px;font-weight:900;color:var(--text);border:1.5px solid var(--border);">0</div>
              <button onclick="tnScoreAdj('sa',1)" style="width:36px;height:36px;border-radius:8px;border:1px solid var(--border);background:var(--surface2);color:var(--text);font-size:20px;cursor:pointer;display:flex;align-items:center;justify-content:center;">+</button>
            </div>
          </div>
          <div style="font-size:22px;font-weight:900;color:var(--text-muted);padding-top:18px;">:</div>
          <div style="text-align:center;">
            <div style="font-size:11px;color:var(--accent);margin-bottom:4px;">${escHtml(bName.length>6?bName.slice(0,6)+'…':bName)}</div>
            <div style="display:flex;align-items:center;gap:6px;">
              <button onclick="tnScoreAdj('sb',-1)" style="width:36px;height:36px;border-radius:8px;border:1px solid var(--border);background:var(--surface2);color:var(--text);font-size:20px;cursor:pointer;display:flex;align-items:center;justify-content:center;">−</button>
              <div id="tn-sb-val" style="width:44px;height:44px;line-height:44px;text-align:center;background:var(--surface2);border-radius:10px;font-size:22px;font-weight:900;color:var(--text);border:1.5px solid var(--border);">0</div>
              <button onclick="tnScoreAdj('sb',1)" style="width:36px;height:36px;border-radius:8px;border:1px solid var(--border);background:var(--surface2);color:var(--text);font-size:20px;cursor:pointer;display:flex;align-items:center;justify-content:center;">+</button>
            </div>
          </div>
        </div>
      </div>

      <!-- 승자 선택 버튼 -->
      <div style="font-size:11px;color:var(--text-muted);text-align:center;margin-bottom:8px;font-weight:600;">승자 선택</div>
      <div style="display:flex;gap:8px;margin-bottom:12px;">
        <button onclick="tnConfirmWinner(${tid},${ri},${gi},'a')" style="flex:1;padding:13px 6px;border-radius:12px;border:2px solid rgba(74,222,128,.5);background:rgba(74,222,128,.1);color:#4ade80;font-size:14px;font-weight:800;cursor:pointer;word-break:break-all;">🏆 ${escHtml(aName)}</button>
        <button onclick="tnConfirmWinner(${tid},${ri},${gi},'b')" style="flex:1;padding:13px 6px;border-radius:12px;border:2px solid rgba(74,222,128,.5);background:rgba(74,222,128,.1);color:#4ade80;font-size:14px;font-weight:800;cursor:pointer;word-break:break-all;">🏆 ${escHtml(bName)}</button>
      </div>

      <button onclick="tnCloseScoreModal()" style="width:100%;padding:11px;border-radius:10px;border:1px solid var(--border);background:var(--surface2);color:var(--text-muted);font-size:14px;cursor:pointer;">취소</button>
    </div>
  `;
  overlay.addEventListener('click', e => { if (e.target === overlay) tnCloseScoreModal(); });
  document.body.appendChild(overlay);
  window._tnScoreSA = 0;
  window._tnScoreSB = 0;
}

function tnScoreAdj(which, delta) {
  if (which === 'sa') {
    window._tnScoreSA = Math.max(0, (window._tnScoreSA || 0) + delta);
    const el = document.getElementById('tn-sa-val');
    if (el) el.textContent = window._tnScoreSA;
  } else {
    window._tnScoreSB = Math.max(0, (window._tnScoreSB || 0) + delta);
    const el = document.getElementById('tn-sb-val');
    if (el) el.textContent = window._tnScoreSB;
  }
}

function tnConfirmWinner(tid, ri, gi, side) {
  const t = (state.tnTournaments || []).find(x => x.id === tid);
  if (!t) return;
  const game = t.bracket[ri].games[gi];
  const sa = window._tnScoreSA || 0;
  const sb = window._tnScoreSB || 0;
  // 점수가 입력됐으면 저장
  if (sa > 0 || sb > 0) {
    game.scoreA = sa;
    game.scoreB = sb;
  }
  tnCloseScoreModal();
  tnSetWinner(tid, ri, gi, side);
}

function tnCloseScoreModal() {
  const el = document.getElementById('tn-score-overlay');
  if (el) el.remove();
}

function tnBracketHTML(t) {
  const mainRounds = t.bracket.filter(r => r.name !== '3·4위전');
  const thirdRound = t.bracket.find(r => r.name === '3·4위전');
  const finalRound = t.bracket.find(r => r.name === '결승');

  // 시상대
  let podiumHtml = '';
  const champion = finalRound && finalRound.games[0] && finalRound.games[0].winner
    ? (finalRound.games[0].winner === 'a' ? finalRound.games[0].a : finalRound.games[0].b) : null;
  const runnerUp = finalRound && finalRound.games[0] && finalRound.games[0].winner
    ? (finalRound.games[0].winner === 'a' ? finalRound.games[0].b : finalRound.games[0].a) : null;
  const third = thirdRound && thirdRound.games[0] && thirdRound.games[0].winner
    ? (thirdRound.games[0].winner === 'a' ? thirdRound.games[0].a : thirdRound.games[0].b) : null;

  if (champion) {
    podiumHtml = `<div style="background:linear-gradient(135deg,rgba(251,191,36,.13),rgba(124,106,247,.13));border:2px solid rgba(251,191,36,.4);border-radius:16px;padding:14px 16px;margin-bottom:16px;">
      <div style="text-align:center;font-size:10px;font-weight:700;color:var(--text-muted);letter-spacing:1.5px;margin-bottom:12px;">🏆 대회 결과</div>
      <div style="display:flex;align-items:flex-end;justify-content:center;gap:8px;">
        ${runnerUp?`<div style="text-align:center;flex:1;"><div style="font-size:20px;">🥈</div><div style="font-size:12px;font-weight:700;color:#94a3b8;margin-top:3px;word-break:break-all;">${escHtml(runnerUp)}</div><div style="font-size:10px;color:var(--text-muted);">준우승</div></div>`:''}
        <div style="text-align:center;flex:1.3;"><div style="font-size:34px;">🥇</div><div style="font-size:14px;font-weight:900;color:#fbbf24;margin-top:3px;word-break:break-all;">${escHtml(champion)}</div><div style="font-size:10px;color:#fbbf24;">우승</div></div>
        ${third?`<div style="text-align:center;flex:1;"><div style="font-size:20px;">🥉</div><div style="font-size:12px;font-weight:700;color:#cd7f32;margin-top:3px;word-break:break-all;">${escHtml(third)}</div><div style="font-size:10px;color:var(--text-muted);">3위</div></div>`:''}
      </div>
    </div>`;
  }

  // 탭
  const tabHtml = `<div style="display:flex;gap:6px;margin-bottom:14px;">
    <button id="tn-tab-ladder" onclick="tnSwitchTab('ladder')" style="flex:1;padding:9px 4px;border-radius:10px;border:1.5px solid var(--accent);background:rgba(124,106,247,.18);color:var(--accent);font-size:13px;font-weight:700;cursor:pointer;">🪜 대진표</button>
    <button id="tn-tab-list" onclick="tnSwitchTab('list')" style="flex:1;padding:9px 4px;border-radius:10px;border:1.5px solid var(--border);background:var(--surface2);color:var(--text-muted);font-size:13px;font-weight:700;cursor:pointer;">📋 경기 목록</button>
  </div>`;

  // ── 사다리 뷰 ──
  function ladderGameCard(game, tid, ri, gi) {
    const aWin = game.winner === 'a', bWin = game.winner === 'b';
    const isBye = game.winner && ((game.a && !game.b) || (!game.a && game.b));

    if (isBye) {
      const w = game.a || game.b;
      return `<div style="background:rgba(74,222,128,.08);border:1.5px solid rgba(74,222,128,.35);border-radius:10px;padding:8px 10px;min-width:108px;max-width:140px;box-sizing:border-box;">
        <div style="font-size:11px;font-weight:700;color:#4ade80;word-break:break-all;">${escHtml(w)}</div>
        <div style="font-size:9px;color:var(--text-muted);margin-top:2px;">부전승</div>
      </div>`;
    }

    const aN = game.a || '미정', bN = game.b || '미정';
    const pending = !game.a || !game.b;
    const clickable = !pending && !game.winner;
    const doneClick = game.winner ? `onclick="tnOpenScoreModal(${tid},${ri},${gi})"` : '';
    const todoClick = clickable ? `onclick="tnOpenScoreModal(${tid},${ri},${gi})"` : '';

    return `<div ${todoClick||doneClick} style="background:${game.winner?'rgba(74,222,128,.05)':pending?'var(--surface)':'var(--surface2)'};border:1.5px solid ${game.winner?'rgba(74,222,128,.4)':pending?'var(--border)':'var(--border)'};border-radius:10px;min-width:108px;max-width:140px;overflow:hidden;cursor:${(clickable||game.winner)?'pointer':'default'};">
      <div style="padding:7px 9px;border-bottom:1px solid var(--border);background:${aWin?'rgba(74,222,128,.13)':''};display:flex;align-items:center;gap:3px;">
        ${aWin?'<span style="font-size:9px;flex-shrink:0;">🏆</span>':''}
        <span style="font-size:11px;font-weight:${aWin?700:400};color:${aWin?'#4ade80':bWin?'var(--text-muted)':'var(--text)'};word-break:break-all;flex:1;line-height:1.3;">${escHtml(aN)}</span>
        ${game.scoreA!==''&&game.scoreA!==undefined?`<span style="font-size:12px;font-weight:800;color:${aWin?'#4ade80':'var(--text-muted)'};flex-shrink:0;margin-left:2px;">${game.scoreA}</span>`:''}
      </div>
      <div style="padding:7px 9px;background:${bWin?'rgba(74,222,128,.13)':''};display:flex;align-items:center;gap:3px;">
        ${bWin?'<span style="font-size:9px;flex-shrink:0;">🏆</span>':''}
        <span style="font-size:11px;font-weight:${bWin?700:400};color:${bWin?'#4ade80':aWin?'var(--text-muted)':'var(--text)'};word-break:break-all;flex:1;line-height:1.3;">${escHtml(bN)}</span>
        ${game.scoreB!==''&&game.scoreB!==undefined?`<span style="font-size:12px;font-weight:800;color:${bWin?'#4ade80':'var(--text-muted)'};flex-shrink:0;margin-left:2px;">${game.scoreB}</span>`:''}
      </div>
      ${pending?`<div style="padding:4px 9px;font-size:9px;color:var(--text-muted);border-top:1px solid var(--border);">⏳ 대기중</div>`:''}
      ${clickable?`<div style="padding:4px 9px;font-size:9px;color:var(--accent);border-top:1px solid var(--border);">탭하여 결과 입력</div>`:''}
      ${game.winner&&!isBye?`<div style="padding:3px 9px;font-size:9px;color:var(--text-muted);border-top:1px solid var(--border);">↩️ 탭하여 초기화</div>`:''}
    </div>`;
  }

  function buildLadder(rounds, tid) {
    if (!rounds || !rounds.length) return '';
    // 가장 많은 경기 수 = 첫 라운드
    const maxGames = rounds[0].games.length;
    const CARD_H = 90; // 카드 높이 추정
    const GAP = 8;

    let html = `<div style="display:flex;flex-direction:row;align-items:flex-start;gap:0;overflow-x:auto;padding-bottom:10px;-webkit-overflow-scrolling:touch;">`;
    rounds.forEach((round, ri) => {
      const gCount = round.games.length;
      const slotH = Math.max(CARD_H + GAP, (maxGames * (CARD_H + GAP)) / gCount);
      html += `<div style="display:flex;flex-direction:column;min-width:128px;flex-shrink:0;">`;
      html += `<div style="text-align:center;font-size:10px;font-weight:800;color:var(--accent);padding:5px 4px 8px;white-space:nowrap;">`;
      const rIcon = round.name==='결승'?'🏆':round.name==='준결승'?'⚔️':round.name==='3·4위전'?'🥉':'🎾';
      html += `${rIcon} ${escHtml(round.name)}</div>`;
      round.games.forEach((game, gi) => {
        html += `<div style="display:flex;align-items:center;height:${slotH}px;padding:${GAP/2}px 4px;">`;
        html += ladderGameCard(game, tid, ri, gi);
        // 오른쪽 화살표 연결 (마지막 라운드 아닐 때)
        if (ri < rounds.length - 1) {
          html += `<div style="flex-shrink:0;width:8px;display:flex;align-items:center;margin-left:2px;"><div style="width:8px;height:2px;background:var(--border);"></div></div>`;
        }
        html += `</div>`;
      });
      html += `</div>`;
    });
    html += `</div>`;
    return html;
  }

  const ladderHtml = `<div id="tn-view-ladder">
    ${buildLadder(mainRounds, t.id)}
    ${thirdRound ? `<div style="margin-top:10px;padding-top:10px;border-top:1px dashed var(--border);">
      <div style="font-size:10px;color:var(--text-muted);font-weight:700;margin-bottom:4px;">🥉 3·4위전</div>
      ${buildLadder([thirdRound], t.id)}
    </div>` : ''}
  </div>`;

  // ── 목록 뷰 ──
  let listHtml = `<div id="tn-view-list" style="display:none;">`;
  t.bracket.forEach((round, ri) => {
    const rIcon = round.name==='결승'?'🏆':round.name==='준결승'?'⚔️':round.name==='3·4위전'?'🥉':'🎾';
    listHtml += `<div style="margin-bottom:20px;">
      <div style="font-size:13px;font-weight:800;color:var(--accent);margin-bottom:10px;padding:7px 14px;background:rgba(124,106,247,.12);border-radius:10px;">${rIcon} ${escHtml(round.name)}</div>`;

    round.games.forEach((game, gi) => {
      const aName = game.a || '미정', bName = game.b || '미정';
      const isBye = (game.a && !game.b) || (!game.a && game.b);
      const aWin = game.winner === 'a', bWin = game.winner === 'b';
      const pending = !game.a || !game.b;

      if (isBye) {
        listHtml += `<div style="background:rgba(74,222,128,.07);border-radius:12px;padding:12px 16px;margin-bottom:10px;border:1px solid rgba(74,222,128,.3);display:flex;align-items:center;gap:12px;">
          <span style="font-size:18px;">🎾</span>
          <div><div style="font-size:14px;font-weight:700;color:#4ade80;">${escHtml(game.a||game.b)}</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:1px;">부전승 — 자동 진출</div></div>
        </div>`;
        return;
      }

      const cardBg = game.winner ? 'rgba(74,222,128,.04)' : 'var(--surface2)';
      const cardBorder = game.winner ? 'rgba(74,222,128,.35)' : 'var(--border)';
      listHtml += `<div style="background:${cardBg};border-radius:12px;padding:14px;margin-bottom:10px;border:1px solid ${cardBorder};">`;

      if (pending) {
        listHtml += `<div style="display:flex;align-items:center;gap:0;">
          <div style="flex:1;text-align:center;padding:10px 6px;border-radius:8px;background:var(--surface);border:1px solid var(--border);"><div style="font-size:13px;color:var(--text-muted);">미정</div></div>
          <div style="padding:0 12px;font-size:18px;font-weight:900;color:var(--text-muted);">VS</div>
          <div style="flex:1;text-align:center;padding:10px 6px;border-radius:8px;background:var(--surface);border:1px solid var(--border);"><div style="font-size:13px;color:var(--text-muted);">미정</div></div>
        </div>
        <div style="text-align:center;margin-top:8px;font-size:11px;color:var(--text-muted);">⏳ 이전 경기 대기중</div>`;
      } else {
        // 선수 카드
        listHtml += `<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
          <div style="flex:1;padding:12px 8px;border-radius:10px;background:${aWin?'rgba(74,222,128,.15)':'var(--surface)'};border:1.5px solid ${aWin?'rgba(74,222,128,.5)':'var(--border)'};text-align:center;">
            ${aWin?'<div style="font-size:14px;margin-bottom:2px;">🏆</div>':''}
            <div style="font-size:14px;font-weight:${aWin?800:500};color:${aWin?'#4ade80':bWin?'var(--text-muted)':'var(--text)'};word-break:break-all;">${escHtml(aName)}</div>
            ${game.scoreA!==''&&game.scoreA!==undefined?`<div style="font-size:20px;font-weight:900;color:${aWin?'#4ade80':'var(--text-muted)'};margin-top:4px;">${game.scoreA}</div>`:''}
            ${aWin?'<div style="font-size:10px;color:#4ade80;margin-top:2px;">승</div>':bWin?'<div style="font-size:10px;color:var(--text-muted);margin-top:2px;">패</div>':''}
          </div>
          <div style="font-size:16px;font-weight:900;color:var(--text-muted);flex-shrink:0;">VS</div>
          <div style="flex:1;padding:12px 8px;border-radius:10px;background:${bWin?'rgba(74,222,128,.15)':'var(--surface)'};border:1.5px solid ${bWin?'rgba(74,222,128,.5)':'var(--border)'};text-align:center;">
            ${bWin?'<div style="font-size:14px;margin-bottom:2px;">🏆</div>':''}
            <div style="font-size:14px;font-weight:${bWin?800:500};color:${bWin?'#4ade80':aWin?'var(--text-muted)':'var(--text)'};word-break:break-all;">${escHtml(bName)}</div>
            ${game.scoreB!==''&&game.scoreB!==undefined?`<div style="font-size:20px;font-weight:900;color:${bWin?'#4ade80':'var(--text-muted)'};margin-top:4px;">${game.scoreB}</div>`:''}
            ${bWin?'<div style="font-size:10px;color:#4ade80;margin-top:2px;">승</div>':aWin?'<div style="font-size:10px;color:var(--text-muted);margin-top:2px;">패</div>':''}
          </div>
        </div>`;

        if (!game.winner) {
          listHtml += `<button onclick="tnOpenScoreModal(${t.id},${ri},${gi})" style="width:100%;padding:13px;border-radius:10px;border:2px solid rgba(124,106,247,.4);background:rgba(124,106,247,.1);color:var(--accent);font-size:14px;font-weight:700;cursor:pointer;min-height:48px;">⚔️ 결과 입력</button>`;
        } else {
          listHtml += `<button onclick="tnOpenScoreModal(${t.id},${ri},${gi})" style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--border);background:var(--surface);color:var(--text-muted);font-size:12px;cursor:pointer;min-height:40px;">↩️ 결과 초기화</button>`;
        }
      }
      listHtml += '</div>';
    });
    listHtml += '</div>';
  });
  listHtml += '</div>';

  return podiumHtml + tabHtml + ladderHtml + listHtml;
}

function tnSwitchTab(tab) {
  const ladder = document.getElementById('tn-view-ladder');
  const list = document.getElementById('tn-view-list');
  const btnL = document.getElementById('tn-tab-ladder');
  const btnLi = document.getElementById('tn-tab-list');
  if (!ladder || !list) return;
  if (tab === 'ladder') {
    ladder.style.display = '';
    list.style.display = 'none';
    if (btnL) { btnL.style.background='rgba(124,106,247,.18)'; btnL.style.color='var(--accent)'; btnL.style.borderColor='var(--accent)'; }
    if (btnLi) { btnLi.style.background='var(--surface2)'; btnLi.style.color='var(--text-muted)'; btnLi.style.borderColor='var(--border)'; }
  } else {
    ladder.style.display = 'none';
    list.style.display = '';
    if (btnLi) { btnLi.style.background='rgba(124,106,247,.18)'; btnLi.style.color='var(--accent)'; btnLi.style.borderColor='var(--accent)'; }
    if (btnL) { btnL.style.background='var(--surface2)'; btnL.style.color='var(--text-muted)'; btnL.style.borderColor='var(--border)'; }
  }
}

function tnSetWinner(tid, ri, gi, side) {
  const t = (state.tnTournaments || []).find(x => x.id === tid);
  if (!t) return;
  const game = t.bracket[ri].games[gi];
  game.winner = side;
  const winnerName = side === 'a' ? game.a : game.b;
  const loserName  = side === 'a' ? game.b : game.a;

  if (!game.is3rd) {
    const finalRoundIdx = t.bracket.findIndex(r => r.name === '결승');
    const thirdRound = t.bracket.find(r => r.name === '3·4위전');
    const isFinal = (ri === finalRoundIdx);

    if (!isFinal) {
      // 다음 주 브라켓 라운드에 승자 진출 (3위전 방향은 절대 안 넣음)
      let nextRi = ri + 1;
      // 3위전 인덱스 건너뛰기
      while (nextRi < t.bracket.length && t.bracket[nextRi].name === '3·4위전') nextRi++;
      if (nextRi < t.bracket.length && t.bracket[nextRi].games) {
        const nextGi = Math.floor(gi / 2);
        const nextSlot = gi % 2 === 0 ? 'a' : 'b';
        if (t.bracket[nextRi].games[nextGi]) {
          t.bracket[nextRi].games[nextGi][nextSlot] = winnerName;
        }
      }
    }

    // 준결승 패자만 3위전에 배치
    if (thirdRound && finalRoundIdx > 0 && ri === finalRoundIdx - 1) {
      const thirdSlot = gi === 0 ? 'a' : 'b';
      thirdRound.games[0][thirdSlot] = loserName;
    }
  }

  save();
  tnRefreshModal();
  tnSyncToMatch(t, ri, gi);
}

function tnResetWinner(tid, ri, gi) {
  const t = (state.tnTournaments || []).find(x => x.id === tid);
  if (!t) return;
  const game = t.bracket[ri].games[gi];
  if (!game.winner) return;
  const oldWinner = game.winner === 'a' ? game.a : game.b;
  const oldLoser  = game.winner === 'a' ? game.b : game.a;
  game.winner = null;
  game.scoreA = '';
  game.scoreB = '';

  if (!game.is3rd) {
    const finalRoundIdx = t.bracket.findIndex(r => r.name === '결승');
    const thirdRound = t.bracket.find(r => r.name === '3·4위전');

    // 다음 메인 라운드에서 승자 제거 (3위전 방향 건너뜀)
    let nextRi = ri + 1;
    while (nextRi < t.bracket.length && t.bracket[nextRi].name === '3·4위전') nextRi++;
    if (nextRi < t.bracket.length && t.bracket[nextRi] && t.bracket[nextRi].games) {
      const nextGi = Math.floor(gi / 2);
      const nextSlot = gi % 2 === 0 ? 'a' : 'b';
      if (t.bracket[nextRi].games[nextGi] && t.bracket[nextRi].games[nextGi][nextSlot] === oldWinner) {
        t.bracket[nextRi].games[nextGi][nextSlot] = null;
        tnCascadeReset(t, nextRi, nextGi);
      }
    }

    // 준결승이었다면 3위전에서 패자도 제거
    if (thirdRound && finalRoundIdx > 0 && ri === finalRoundIdx - 1) {
      const thirdSlot = gi === 0 ? 'a' : 'b';
      if (thirdRound.games[0][thirdSlot] === oldLoser) {
        thirdRound.games[0][thirdSlot] = null;
        thirdRound.games[0].winner = null;
        thirdRound.games[0].scoreA = '';
        thirdRound.games[0].scoreB = '';
      }
    }
  }
  save();
  tnRefreshModal();
}

function tnCascadeReset(t, ri, gi) {
  const game = t.bracket[ri] && t.bracket[ri].games[gi];
  if (!game || !game.winner) return;
  const oldWinner = game.winner === 'a' ? game.a : game.b;
  game.winner = null;
  game.scoreA = '';
  game.scoreB = '';

  // 3위전 방향은 cascade 안 함
  let nextRi = ri + 1;
  while (nextRi < t.bracket.length && t.bracket[nextRi].name === '3·4위전') nextRi++;
  if (nextRi < t.bracket.length && t.bracket[nextRi] && t.bracket[nextRi].games) {
    const nextGi = Math.floor(gi / 2);
    const nextSlot = gi % 2 === 0 ? 'a' : 'b';
    if (t.bracket[nextRi].games[nextGi] && t.bracket[nextRi].games[nextGi][nextSlot] === oldWinner) {
      t.bracket[nextRi].games[nextGi][nextSlot] = null;
      tnCascadeReset(t, nextRi, nextGi);
    }
  }
}

function tnSyncToMatch(t, ri, gi) {
  const game = t.bracket[ri].games[gi];
  if (!game.winner) return;
  const myName = state.profile.name || '선수';
  const aName = game.a || '';
  const bName = game.b || '';
  const inA = t.format === 'singles' ? aName === myName : aName.includes(myName);
  const inB = t.format === 'singles' ? bName === myName : bName.includes(myName);
  if (!inA && !inB) return;
  const result = (inA && game.winner === 'a') || (inB && game.winner === 'b') ? 'win' : 'lose';
  const opponent = inA ? bName : aName;
  const memo = `[${t.name}] ${t.bracket[ri].name} #${gi+1}`;
  const matchData = {
    id: state.nextMatchId++,
    date: t.date,
    format: t.format,
    partner: '',
    opponent,
    opponent2: '',
    result,
    myScore: inA ? (game.scoreA !== '' ? String(game.scoreA) : '') : (game.scoreB !== '' ? String(game.scoreB) : ''),
    oppScore: inA ? (game.scoreB !== '' ? String(game.scoreB) : '') : (game.scoreA !== '' ? String(game.scoreA) : ''),
    myTiebreak: '',
    oppTiebreak: '',
    memo,
  };
  const existIdx = state.matches.findIndex(m => m.memo === memo);
  if (existIdx >= 0) state.matches[existIdx] = matchData;
  else state.matches.unshift(matchData);
  save();
}

// ===== SET TODAY DATE =====
function getTodayStr() {
  // 한국 시간(KST) 기준으로 오늘 날짜 반환
  const now = new Date();
  const kst = new Date(now.getTime() + (9 * 60 * 60 * 1000));
  return kst.toISOString().split('T')[0];
}
function setTodayDate() {
  const el = document.getElementById('matchDate');
  if (el) el.value = getTodayStr();
}

// ===== INIT =====
load(); // Firebase에서 데이터 로드 후 _initApp 자동 호출

// ===== SERVICE WORKER 등록 =====
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(() => console.log('SW registered'))
      .catch(e => console.log('SW error:', e));
  });
}

// ===== 안드로이드 뒤로가기 버튼 처리 =====
window.addEventListener('popstate', function() {
  // 열린 모달이 있으면 닫기
  const openModal = document.querySelector('.modal-overlay.open');
  if (openModal) {
    openModal.classList.remove('open');
    history.pushState(null, '', location.href);
    return;
  }
  // 열린 confirm이 있으면 닫기
  const openConfirm = document.querySelector('.confirm-overlay.open');
  if (openConfirm) {
    openConfirm.classList.remove('open');
    confirmCallback = null;
    history.pushState(null, '', location.href);
    return;
  }
  // player-detail 페이지면 선수 목록으로
  if (document.getElementById('page-player-detail') &&
      document.getElementById('page-player-detail').classList.contains('active')) {
    showPage('players');
    history.pushState(null, '', location.href);
  }
});
// 히스토리 초기 상태 push
history.pushState(null, '', location.href);
