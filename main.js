const firebaseConfig = {
  apiKey:"AIzaSyAqwhaz_726NPUVhtmDI8W6Xuo4GCQNUWM",
  authDomain:"hw-helper-b47ca.firebaseapp.com",
  projectId:"hw-helper-b47ca",
  storageBucket:"hw-helper-b47ca.appspot.com",
  messagingSenderId:"939392073070",
  appId:"1:939392073070:web:7d0a4508459ea9e586557f"
};
    if(!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    const auth = firebase.auth();
    const db = firebase.firestore();
    const storage = firebase.storage();
    const CLOUDINARY_CLOUD_NAME = 'dlsyrhubw';
    const CLOUDINARY_UPLOAD_PRESET = 'hw_proofs';

    /* ===== Helpers & state ===== */
    const el = id => document.getElementById(id);
    let currentUser = null;
    let currentIsAdmin = false;
    let hwUnsubscribe = null;
    let lastSnapshot = [];
    let completedMap = {};
    let pendingProofTarget = null;
    const subjects = ["Ағылшын тілі","Биология","География","Дүниежүзі тарихы","Информатика","Қазақ тілі мен әдебиеті","Қазақстан тарихы","Құқық негіздері","Математика","Орыс тілі мен әдебиеті","Физика","Химия"];
    const POINTS_MULTIPLIER = 10;
    function pointsToDisplay(pts){ return Math.floor((pts || 0)) }
    function pointsToStore(displayPts){ return Math.round(displayPts * POINTS_MULTIPLIER) }
    function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])) }
    function formatDate(v){
      if(!v) return '';
      try{
        if(typeof v.toDate === 'function') v = v.toDate();
        const d = new Date(v);
        if(isNaN(d.getTime())) return '';
        return d.toLocaleDateString('ru-RU');
      } catch(e){ return '' }
    }
    function uidShort(u){ return u ? (u.length>8 ? u.slice(0,6)+'...' : u) : 'unknown' }
    /* ===== BOOSTER HELPERS ===== */
function applyBoosters({ boosters = [], now = Date.now(), basePoints = 1, baseCoins = 0, hw = null }) {
  let multiplier = 1;
  const toConsumeOriginalIds = [];

  for (const b of boosters) {
    const activatedAt = b.activatedAt || 0;
    const activeByTime = !b.duration || (activatedAt + b.duration > now);
    const hasUses = (typeof b.uses === 'number') ? b.uses > 0 : true;
    if (!activeByTime || !hasUses) continue;

    if (b.multiplier) {
      const m = Number(b.multiplier) || 1;
      multiplier = Math.max(multiplier, m);
    }

    if (b.originalId === 'instant_complete' && hw && hw.requiresProof) {
      toConsumeOriginalIds.push(b.originalId);
    }

    if (b.originalId === 'mystery_multiplier') {
      const rand = Math.round((1.5 + Math.random() * 3.5) * 10) / 10; // 1.5–5.0
      multiplier = Math.max(multiplier, rand);
    }

    if (b.originalId === 'subject_bonus' && hw && b.subject && String(b.subject).toLowerCase() === String(hw.subject || '').toLowerCase()) {
      multiplier = Math.max(multiplier, Number(b.multiplier) || 1.5);
      toConsumeOriginalIds.push(b.originalId);
    }
  }

  const finalPoints = Math.round(basePoints * multiplier * 100) / 100;
  const finalCoins = Math.round(baseCoins * multiplier);
  return { finalPoints, finalCoins, toConsumeOriginalIds, multiplier };
}

async function consumeBoostersInTx(tx, statRef, boosters, toConsumeOriginalIds = []) {
  if (!toConsumeOriginalIds.length) return boosters;
  const res = boosters.map(b => {
    if (toConsumeOriginalIds.includes(b.originalId)) {
      if (typeof b.uses === 'number' && b.uses > 0) {
        return { ...b, uses: b.uses - 1 };
      }
    }
    return b;
  }).filter(b => !(typeof b.uses === 'number' && b.uses <= 0));
  return res;
}
/* ===== END BOOSTER HELPERS ===== */

    /* ===== Subject list render ===== */
    function renderSubjectList(){
      const node = el('subject-list');
      node.innerHTML = '';
      const all = document.createElement('div');
      all.className='subject-item active';
      all.innerHTML = '<span>📌</span><span>Барлығы</span>';
      all.onclick = ()=>{
        document.querySelectorAll('.subject-item').forEach(x=>x.classList.remove('active'));
        all.classList.add('active');
        el('search').value='';
        renderFilters();
      };
      node.appendChild(all);
      
      const icons = ['🌍','🧬','🗺️','📜','💻','📖','🏛️','⚖️','📝','➗','⚡','🧪'];
      subjects.forEach((s,i)=>{
        const d=document.createElement('div');
        d.className='subject-item';
        d.innerHTML = `<span>${icons[i]||'📚'}</span><span>${escapeHtml(s)}</span>`;
        d.onclick = ()=>{
          document.querySelectorAll('.subject-item').forEach(x=>x.classList.remove('active'));
          d.classList.add('active');
          el('search').value='';
          renderFilters();
        };
        node.appendChild(d);
      });
    }
    renderSubjectList();

    /* ===== Auth state handling ===== */
    auth.onAuthStateChanged(async user=>{
      try{
        currentUser = user;
        if(user){
          el('auth').classList.add('hidden');
          el('app').classList.remove('hidden');
          el('user-email').innerHTML = `👤 ${escapeHtml(user.email || user.uid)}`;
          el('btn-show-auth').classList.add('hidden');
          el('btn-logout').classList.remove('hidden');

          currentIsAdmin = await checkAdmin(user.uid);
          if(currentIsAdmin) el('open-add').classList.remove('hidden');
          else el('open-add').classList.add('hidden');

          await loadUserCompleted(user.uid);
          await ensureUserStats(user.uid);
          await renderUserPoints(user.uid);
          subscribeHomeworks();
        } else {
          el('auth').classList.remove('hidden');
          el('app').classList.add('hidden');
          el('user-email').innerText='';
          el('user-points').innerText='';
          el('user-coins').innerText='';
          el('btn-show-auth').classList.remove('hidden');
          el('btn-logout').classList.add('hidden');
          completedMap = {};
          subscribeHomeworks();
        }
        applyAutoWinter();
      } catch(e){ console.error('onAuthStateChanged',e) }
    });

    async function checkAdmin(uid){
      try{
        const doc = await db.collection('admins').doc(uid).get();
        return doc.exists && doc.data().isAdmin === true
      }catch(e){ return false }
    }

    /* ===== Subscribe homeworks ===== */
    function subscribeHomeworks(){
  if (hwUnsubscribe){
    try { hwUnsubscribe(); } catch(e){ console.warn('Unsubscribe error', e); }
    hwUnsubscribe = null;
  }
  try{
    hwUnsubscribe = db.collection('homework').orderBy('createdAt','desc')
      .onSnapshot(snap => {
        lastSnapshot = snap.docs.map(d => ({ id: d.id, ...d.data() })); // <-- СПРЕД
        renderFilters();
        renderLeaderboard();
      }, err => { console.error('homework onSnapshot error', err); });
  } catch(e){
    console.error('subscribeHomeworks error', e);
  }
}


    /* ===== User completed list ===== */
    async function loadUserCompleted(uid){
      completedMap = {};
      if(!uid) return;
      try{
        const snap = await db.collection('userStats').doc(uid).collection('completed').get();
        snap.forEach(d=>{ completedMap[d.id] = d.data() });
      }catch(e){ console.error('loadUserCompleted', e) }
    }

    async function ensureUserStats(uid){
      if(!uid) return;
      const ref = db.collection('userStats').doc(uid);
      try{
        const doc = await ref.get();
        if(!doc.exists){
          await ref.set({
            points:0,
            coins:0,
            email:currentUser.email||'',
            displayName:(currentUser.email||'').split('@')[0],
            badges:[],
            updated:firebase.firestore.FieldValue.serverTimestamp()
          });
        }
      }catch(e){ console.error('ensureUserStats', e) }
    }

    async function renderUserPoints(uid){
      if(!uid) return;
      try{
        const doc = await db.collection('userStats').doc(uid).get();
        const data = doc.exists ? doc.data() : {};
        const pts = pointsToDisplay(data.points || 0);
        const coins = data.coins || 0;
        el('user-points').innerHTML = `⭐ ${pts} ұпай`;
        el('user-coins').innerHTML = `${coins} монет`;
      }catch(e){ console.error('renderUserPoints', e) }
    }

    /* ===== Leaderboard (small + full) ===== */
    async function renderLeaderboard(){
      try{
        const lb = await db.collection('userStats').orderBy('points','desc').limit(5).get();
        const node = el('leaderboard-list');
        node.innerHTML = '';
        let rank = 1;
        lb.forEach(doc => {
          const data = doc.data() || {};
          const email = (data.email && String(data.email).trim()) || '';
          const display = email || uidShort(doc.id);
          const pts = pointsToDisplay(data.points || 0);
          const div = document.createElement('div');
          div.className = 'item';
          const rankClass = rank <= 3 ? `rank-${rank}` : '';
          const badges = (data.badges||[]).slice(0,1).map(b=>`<span class="badge gold" style="font-size:10px">${escapeHtml(b)}</span>`).join('');
          div.innerHTML = `
            <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0;cursor:pointer" onclick="viewUserStats('${doc.id}')">
              <div class="rank ${rankClass}">${rank}</div>
              <div style="min-width:0;flex:1">
                <div style="font-weight:600;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(display)}</div>
                ${badges}
              </div>
            </div>
            <div style="font-weight:700;color:var(--primary)">${pts}</div>
          `;
          node.appendChild(div);
          rank++;
        });
      }catch(e){ console.error('renderLeaderboard error', e) }
    }

    async function openLeaderboardFull(){
  const m = document.createElement('div');
  m.className='modal-backdrop';
  m.innerHTML = `
    <div class="modal">
      <h4>🏆 Толық рейтинг</h4>
      <div id="leaderboard-full" style="max-height:60vh;overflow:auto"></div>
      <div class="modal-footer"><button class="btn ghost" onclick="document.body.removeChild(this.closest('.modal-backdrop'))">Жабу</button></div>
    </div>
  `;
  document.body.appendChild(m);
  const container = m.querySelector('#leaderboard-full');
  container.innerHTML = '<div class="small">Жүктелуде...</div>';
  try{
    const snap = await db.collection('userStats').orderBy('points','desc').limit(50).get();
    container.innerHTML = '';
    let r=1;
    snap.forEach(doc=>{
      const d = doc.data()||{};
      const row = document.createElement('div');
      row.style.cssText = 'padding:12px;display:flex;justify-content:space-between;align-items:center;cursor:pointer;border-radius:8px;transition:all 0.2s;margin-bottom:4px';
      row.onmouseenter = () => row.style.background = 'rgba(59,130,246,0.05)';
      row.onmouseleave = () => row.style.background = 'transparent';
      
      const badges = (d.badges||[]).slice(0,2).map(b=>`<span class="badge" style="font-size:10px;margin-left:4px">${escapeHtml(b.split(' ')[0])}</span>`).join('');
      
      row.innerHTML = `
        <div style="display:flex;gap:12px;align-items:center;flex:1;min-width:0">
          <div class="rank ${r<=3?`rank-${r}`:''}" style="flex-shrink:0">${r}</div>
          <div style="min-width:0;flex:1">
            <div style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(d.email||uidShort(doc.id))}</div>
            ${badges}
          </div>
        </div>
        <div style="font-weight:700;color:var(--primary)">${pointsToDisplay(d.points||0)}</div>
      `;
      
      row.onclick = () => {
        m.remove();
        viewUserStats(doc.id);
      };
      
      container.appendChild(row);
      r++;
    });
  }catch(e){ container.innerHTML = '<div class="error-msg">Қате</div>'; console.error(e) }
}

    async function viewUserStats(userId){
  const m = document.createElement('div');
  m.className='modal-backdrop';
  m.innerHTML = `
    <div class="modal">
      <h4>📊 Статистика пользователя</h4>
      <div id="user-stats-body" style="max-height:60vh;overflow:auto"></div>
      <div class="modal-footer"><button class="btn ghost" onclick="document.body.removeChild(this.closest('.modal-backdrop'))">Жабу</button></div>
    </div>
  `;
  document.body.appendChild(m);
  const container = m.querySelector('#user-stats-body');
  container.innerHTML = '<div class="small">Жүктелуде...</div>';
  try{
    const userDoc = await db.collection('userStats').doc(userId).get();
    const userData = userDoc.exists ? userDoc.data() : {};
    const completedSnap = await db.collection('userStats').doc(userId).collection('completed').get();
    const badges = (userData.badges || []).map(b => `<span class="badge gold">${escapeHtml(b)}</span>`).join(' ');
    container.innerHTML = `
      <div style="text-align:center;margin-bottom:20px">
        <div style="width:80px;height:80px;margin:0 auto 12px;border-radius:50%;background:var(--gradient-1);display:flex;align-items:center;justify-content:center;font-size:32px">${userData.currentAvatar || '👤'}</div>
        <div style="font-size:18px;font-weight:700;margin-bottom:4px">${escapeHtml(userData.email || userId)}</div>
        <div>${badges || '<span class="small muted-italic">Нет значков</span>'}</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="card" style="text-align:center">
          <div style="font-size:24px;font-weight:700;color:var(--primary)">${pointsToDisplay(userData.points || 0)}</div>
          <div class="small">Ұпай</div>
        </div>
        <div class="card" style="text-align:center">
          <div style="font-size:24px;font-weight:700;color:var(--warning)">${userData.coins || 0}</div>
          <div class="small">Монет</div>
        </div>
        <div class="card" style="text-align:center">
          <div style="font-size:24px;font-weight:700;color:var(--success)">${completedSnap.size}</div>
          <div class="small">Выполнено</div>
        </div>
        <div class="card" style="text-align:center">
          <div style="font-size:24px;font-weight:700;color:var(--info)">${(userData.badges || []).length}</div>
          <div class="small">Значков</div>
        </div>
      </div>
    `;
  }catch(e){
    container.innerHTML = '<div class="error-msg">Ошибка загрузки</div>';
    console.error(e);
  }
}

    /* ===== Filters & list render ===== */
    function parseSearchDate(raw){
      const dateMatch = raw.match(/^\s*(\d{1,2})[.\-\/]?(\d{1,2})[.\-\/]?(\d{2,4})\s*$/);
      if(!dateMatch) return null;
      let day = Number(dateMatch[1]);
      let month = Number(dateMatch[2]);
      let year = Number(dateMatch[3]);
      if(year < 100) year += 2000;
      return new Date(year, month-1, day, 23,59,59,999);
    }

    function renderFilters(){
      const raw = el('search').value.trim();
      const q = raw.toLowerCase();
      const activeSub = document.querySelector('.subject-item.active')?.innerText?.replace(/[^\p{L}\s]/gu,'').trim() || 'Барлығы';
      const sort = el('sort').value;
      let items = lastSnapshot.slice();
      
      if(activeSub && activeSub !== 'Барлығы'){
        items = items.filter(x => String(x.subject || '').toLowerCase() === activeSub.toLowerCase());
      }
      if(sort === 'archive'){ items = items.filter(x => x.archived === true) }
      
      const parsedDate = parseSearchDate(raw);
      if(parsedDate){
        items = items.filter(x => {
          if(!x.deadline) return false;
          try{
            const d = (x.deadline && typeof x.deadline.toDate === 'function') ? x.deadline.toDate() : new Date(x.deadline);
            if(isNaN(d)) return false;
            return d <= parsedDate;
          }catch(e){ return false }
        });
      } else if(q){
        items = items.filter(x => (((x.title||'') + ' ' + (x.description||'') + ' ' + (x.authorEmail||'')).toLowerCase().includes(q)));
      }

      if(sort === 'deadline'){
        items.sort((a,b)=>{
          const da = (a.deadline && typeof a.deadline.toDate === 'function') ? a.deadline.toDate() : (a.deadline?new Date(a.deadline):new Date(8640000000000000));
          const db = (b.deadline && typeof b.deadline.toDate === 'function') ? b.deadline.toDate() : (b.deadline?new Date(b.deadline):new Date(8640000000000000));
          return da - db;
        });
      } else {
        items.sort((a,b)=>{
          const da = (a.createdAt && typeof a.createdAt.toDate === 'function') ? a.createdAt.toDate() : (a.createdAt?new Date(a.createdAt):new Date(0));
          const db = (b.createdAt && typeof b.createdAt.toDate === 'function') ? b.createdAt.toDate() : (b.createdAt?new Date(b.createdAt):new Date(0));
          return db - da;
        });
        if(sort === 'old') items.reverse();
      }
      
      el('count').innerText = items.length;
      renderList(items);
    }

    function renderList(items){
      const list = el('homework-list');
      list.innerHTML = '';
      if(items.length===0){
        list.innerHTML = '<div style="text-align:center;padding:60px 20px"><div style="font-size:48px;margin-bottom:16px">📭</div><div class="muted-italic">Тапсырма табылмады</div></div>';
        return;
      }
      items.forEach(d=>{
        const card=document.createElement('div');
        card.className='hw';
        
        const archiveBadge = d.archived ? '<span class="badge warning">Архив</span>' : '';
        const proofBadge = (d.requiresProof && !d.archived) ? '<span class="badge" style="background:rgba(245,158,11,0.1);color:var(--warning)">Доказ керек</span>' : '';
        
        card.innerHTML = `
          <div class="hw-header">
            <div style="flex:1;min-width:0">
              <div class="title">${escapeHtml(d.title||'Атауы жоқ')}</div>
              <div class="meta-info">
                <span class="badge">${escapeHtml(d.subject||'')}</span>
                ${archiveBadge}
                ${proofBadge}
              </div>
            </div>
            <div style="text-align:right">
              <div class="small" style="font-weight:600">📅 ${escapeHtml(formatDate(d.deadline||d.createdAt||''))}</div>
              <div class="small">от ${escapeHtml(d.authorEmail||'admin')}</div>
            </div>
          </div>
          ${d.description ? `<div class="desc">${escapeHtml(d.description)}</div>` : ''}
          <div class="actions" id="actions-${d.id}">
            <div class="small muted-italic" id="events-${d.id}"></div>
          </div>
        `;
        
        const actionsDiv = card.querySelector(`#actions-${d.id}`);
        const btns = document.createElement('div');
        btns.style.display = 'flex';
        btns.style.gap = '8px';
        btns.style.flexWrap = 'wrap';
        
        const completeBtn = makeCompleteButton(d.id,d);
        btns.appendChild(completeBtn);
        
        
        if(currentIsAdmin){
          const edit = document.createElement('button');
          edit.className='btn ghost';
          edit.innerText='✏️ Өңдеу';
          edit.onclick = ()=>{ editHomework(d) };
          const del = document.createElement('button');
          del.className='btn danger';
          del.innerText='🗑️ Жою';
          del.onclick = ()=>{ if(confirm('Жоюға сенімдісіз бе?')) db.collection('homework').doc(d.id).delete() };
          btns.appendChild(edit);
          btns.appendChild(del);
        }
        
        actionsDiv.appendChild(btns);
        list.appendChild(card);
        injectEventIndicator(d.id, d.deadline);
      });
    }
    async function submitProof(){
  const input = document.querySelector('#proof-file');
  const msgEl = document.querySelector('#proof-msg');
  const files = input?.files ? Array.from(input.files) : [];
  msgEl.innerHTML = '';

  if(!pendingProofTarget || !pendingProofTarget.hwId){
    msgEl.innerHTML = '<span class="error-msg">Цель не определена</span>';
    return;
  }
  if(!currentUser){
    msgEl.innerHTML = '<span class="error-msg">Нужно войти</span>';
    return;
  }
  if(!files.length){
    msgEl.innerHTML = '<span class="error-msg">Выберите файл(ы)</span>';
    return;
  }

  const hwId = pendingProofTarget.hwId;

  // basic checks
  if(files.length > 8){ msgEl.innerHTML = '<span class="error-msg">Макс 8 файлов</span>'; return; }
  const MAX_SIZE = 8 * 1024 * 1024;
  const allowed = ['image/jpeg','image/png','image/webp','application/pdf','image/jpg','image/heic','image/heif'];
  for(const f of files){
    if(!allowed.includes(f.type)) { msgEl.innerHTML = '<span class="error-msg">Недопустимый формат (JPG/PNG/WEBP/PDF)</span>'; return; }
    if(f.size > MAX_SIZE){ msgEl.innerHTML = `<span class="error-msg">Файл ${f.name} слишком большой (макс ${MAX_SIZE/1024/1024}MB)</span>`; return; }
  }

  msgEl.innerHTML = '<span class="small">Загрузка файлов...</span>';

  // --- upload helper with timeout ---
  const uploadWithTimeout = (file, timeout = 30000) => {
    const controller = new AbortController();
    const timerId = setTimeout(()=> controller.abort(), timeout);
    const url = `https://api.cloudinary.com/v1_1/${encodeURIComponent(CLOUDINARY_CLOUD_NAME)}/upload`;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
    fd.append('context', `hwId=${hwId}&user=${currentUser.uid}`);
    return fetch(url, { method: 'POST', body: fd, signal: controller.signal })
      .then(async res => {
        clearTimeout(timerId);
        if(!res.ok){
          const t = await res.text().catch(()=>null);
          throw new Error('Cloudinary error: '+(t||res.status));
        }
        const j = await res.json();
        return { url: j.secure_url || j.url, id: j.public_id || `${Date.now()}_${file.name}` };
      });
  };

  // Perform uploads (robust)
  const uploadResults = await Promise.allSettled(files.map(f => uploadWithTimeout(f, 30000)));
  const successes = uploadResults.filter(r => r.status === 'fulfilled').map(r => r.value);
  const failures = uploadResults.filter(r => r.status === 'rejected').map(r => (r.reason && r.reason.message) ? r.reason.message : String(r.reason));

  if(successes.length === 0){
    msgEl.innerHTML = `<span class="error-msg">Ошибка загрузки файлов: ${failures.join('; ')}</span>`;
    return;
  }
  if(failures.length > 0){
    msgEl.innerHTML = `<span class="error-msg">Некоторые файлы не загрузились: ${failures.join('; ')}. Сохранено ${successes.length}/${files.length}.</span>`;
  } else {
    msgEl.innerHTML = '<span class="small">Загрузка завершена...</span>';
  }

  const urls = successes.map(u => u.url);
  const ids  = successes.map(u => u.id);

  // --- atomic transaction: create completion and award points/coins (or attach proofs) ---
  const uid = currentUser.uid;
  const statRef = db.collection('userStats').doc(uid);
  const compRef = statRef.collection('completed').doc(hwId);

  // load homework doc to check archived status
  const hwDoc = await db.collection('homework').doc(hwId).get();
  const hw = hwDoc.exists ? hwDoc.data() : {};
  const archived = !!hw.archived;

  // base awards
  const awardPointsBase = archived ? 0.5 : 1;
  const awardCoinsBase  = archived ? 0 : 5;

  // объявляем наружу, чтобы использовать после транзакции
  let finalPoints = 0;
  let finalCoins = 0;
  let awarded = false;

  try{
    await db.runTransaction(async tx => {
      const compSnap = await tx.get(compRef);
      if(compSnap.exists){
        // already completed: just append / overwrite proof urls/ids safely
        tx.set(compRef, {
          proofUrls: urls,
          proofIds: ids,
          updatedProofAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        awarded = false;
        return;
      }

      // Not completed: compute final awards (consider boosters if helpers exist)
      const userDoc = await tx.get(statRef);
      const userData = userDoc.exists ? userDoc.data() : {};
      let boosters = Array.isArray(userData.boosters) ? userData.boosters.slice() : [];

      // assign base values into outer vars
      finalPoints = awardPointsBase;
      finalCoins  = awardCoinsBase;
      let toConsumeOriginalIds = [];

      if (typeof applyBoosters === 'function') {
        const res = applyBoosters({ boosters, now: Date.now(), basePoints: awardPointsBase, baseCoins: awardCoinsBase, hw });
        finalPoints = res.finalPoints;
        finalCoins  = res.finalCoins;
        toConsumeOriginalIds = res.toConsumeOriginalIds || [];
      }

      // consume boosters in tx if helper exists
      if (toConsumeOriginalIds.length && typeof consumeBoostersInTx === 'function') {
        boosters = await consumeBoostersInTx(tx, statRef, boosters, toConsumeOriginalIds);
      }

      // round to 2 decimals for points (if fractional)
      finalPoints = Math.round(finalPoints * 100) / 100;
      finalCoins  = Math.round(finalCoins);

      // create completion with points and coins fields
      tx.set(compRef, {
        hwId,
        title: hw.title || '',
        subject: hw.subject || '',
        deadline: hw.deadline || '',
        completedAt: firebase.firestore.FieldValue.serverTimestamp(),
        points: finalPoints,
        coins: finalCoins,
        proofUrls: urls,
        proofIds: ids
      }, { merge: true });

      // update aggregates
      tx.set(statRef, {
        points: firebase.firestore.FieldValue.increment(finalPoints),
        coins: firebase.firestore.FieldValue.increment(finalCoins),
        boosters: boosters,
        email: currentUser.email || '',
        displayName: currentUser.displayName || (currentUser.email||'').split('@')[0],
        updated: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      awarded = true;
    });

    // attempt to add submission document for moderator/view (best-effort)
    try {
      await db.collection('proofs').doc(hwId).collection('submissions').add({
        uid,
        displayName: currentUser.displayName || (currentUser.email||'').split('@')[0],
        imageUrls: urls,
        imageIds: ids,
        message: document.querySelector('#proof-text')?.value || '',
        status: 'pending',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    } catch(subErr){
      // don't fail the whole flow if this write is forbidden; inform admin in console
      console.warn('submitProof: could not add submission doc (permissions?).', subErr);
    }

    // UI refresh
    try { await loadUserCompleted(uid); } catch(e){ console.warn('loadUserCompleted failed', e); }
    try { await renderUserPoints(uid); } catch(e){ console.warn('renderUserPoints failed', e); }
    try { renderLeaderboard(); } catch(e){ /* non-critical */ }

    msgEl.innerHTML = `<span class="success-msg">✓ Загружено${awarded ? `, +${finalPoints} балл(ов)${finalCoins ? ' и +' + finalCoins + ' монет' : ''}` : ''}</span>`;
    // keep message a bit and close modal
    setTimeout(()=> closeProofModal(), 1200);
  } catch(err){
    console.error('submitProof transaction error', err);
    // Try to surface friendly error to user
    if (String(err.message || '').includes('NOT_AUTH')) {
      msgEl.innerHTML = `<span class="error-msg">Ошибка: нужно войти</span>`;
    } else if (String(err.message || '').includes('NOT_ENOUGH_COINS')) {
      msgEl.innerHTML = `<span class="error-msg">Недостаточно монет</span>`;
    } else {
      msgEl.innerHTML = `<span class="error-msg">Ошибка при сохранении доказательства: ${err.message || err}</span>`;
    }
  }
}

function makeCompleteButton(hwId, hwData) {
  const btn = document.createElement('button');
  btn.className = 'complete-btn';
  if (!hwData) hwData = {};
  const done = completedMap && completedMap[hwId];

  const hw = hwData;
  const archived = !!hw.archived;
  const requiresProof = !!hw.requiresProof || archived; // архивные задают proof (как ты требовал)

  if (done) {
    btn.classList.add('done');
    btn.innerText = `✓ Орындадым (${done.points || 0} ұпай)`;
    btn.onclick = async () => {
      if (!currentUser) { alert('Войдите'); return; }
      // удаление completion в транзакции: мы уменьшаем points и coins на те же значения, что лежат в completion doc
      try {
        const uid = currentUser.uid;
        await db.runTransaction(async (tx) => {
          const statRef = db.collection('userStats').doc(uid);
          const compRef = statRef.collection('completed').doc(hwId);
          const compSnap = await tx.get(compRef);
          if (!compSnap.exists) return;
          const prev = compSnap.data();
          const prevPoints = Number(prev.points || 0);
          const prevCoins = Number(prev.coins || 0);
          tx.delete(compRef);
          tx.set(statRef, {
            points: firebase.firestore.FieldValue.increment(-prevPoints),
            coins: firebase.firestore.FieldValue.increment(-prevCoins),
            updated: firebase.firestore.FieldValue.serverTimestamp()
          }, { merge: true });
        });
        // update local state / UI
        loadUserCompleted(currentUser.uid);
        renderUserPoints(currentUser.uid);
      } catch (e) {
        console.error('remove completion error', e);
        alert('Ошибка при удалении выполнения');
      }
    };
    return btn;
  }

  btn.innerText = '✓ Орындадым';
  btn.onclick = async () => {
    if (!currentUser) { alert('Войдите'); return; }
    try {
      // If proof required, open proof modal
      if (requiresProof) {
        openProofModal(hwId, hw); // предполагается, что у тебя есть функция открытия модалки для upload
        return;
      }

      // otherwise create completion transactionally, using boosters
      const uid = currentUser.uid;
      const txResult = await db.runTransaction(async (tx) => {
        const statRef = db.collection('userStats').doc(uid);
        const compRef = statRef.collection('completed').doc(hwId);

        const compSnap = await tx.get(compRef);
        if (compSnap.exists) return { skipped: true };

        const userDoc = await tx.get(statRef);
        const userData = userDoc.exists ? userDoc.data() : {};
        let boosters = Array.isArray(userData.boosters) ? userData.boosters.slice() : [];

        const now = Date.now();
        const basePoints = archived ? 0.5 : 1;
        const baseCoins = archived ? 0 : 5;

        const { finalPoints, finalCoins, toConsumeOriginalIds } = applyBoosters({ boosters, now, basePoints, baseCoins, hw });

        boosters = await consumeBoostersInTx(tx, statRef, boosters, toConsumeOriginalIds);

        tx.set(compRef, {
          hwId: hwId,
          title: hw.title || '',
          subject: hw.subject || '',
          deadline: hw.deadline || '',
          completedAt: firebase.firestore.FieldValue.serverTimestamp(),
          points: finalPoints,
          coins: finalCoins
        }, { merge: true });

        tx.set(statRef, {
          points: firebase.firestore.FieldValue.increment(finalPoints),
          coins: firebase.firestore.FieldValue.increment(finalCoins),
          boosters: boosters,
          updated: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        return { added: true, points: finalPoints };
      });

      if (txResult && txResult.added) {
        loadUserCompleted(currentUser.uid);
        renderUserPoints(currentUser.uid);
      }
    } catch (e) {
      console.error('complete error', e);
      alert('Ошибка при отметке выполнения');
    }
  };

  return btn;
}


function openProofModal(hwId){
  if(!currentUser){ alert('Требуется вход в систему'); return; }
  pendingProofTarget = { hwId };

  // если модаль уже есть — обновим hwId и покажем снова
  const existing = document.getElementById('modal-proof-backdrop');
  if(existing){
    existing.querySelector('#proof-hw-id').innerText = hwId;
    existing.classList.remove('hidden');
    return;
  }

  const m = document.createElement('div');
  m.id = 'modal-proof-backdrop';
  m.className = 'modal-backdrop';
  m.innerHTML = `
    <div class="modal">
      <h4>📎 Отправить доказательство</h4>
      <div style="margin-bottom:12px" class="small">Задание: <strong id="proof-hw-id">${hwId}</strong></div>
      <div style="display:flex;flex-direction:column;gap:8px">
        <input id="proof-file" type="file" accept="image/*,application/pdf" multiple />
        <textarea id="proof-text" placeholder="Комментарий (необязательно)" style="min-height:80px;padding:8px;border-radius:8px"></textarea>
        <div id="proof-msg" style="margin-top:8px"></div>
      </div>
      <div class="modal-footer">
        <button class="btn ghost" id="proof-cancel">Отмена</button>
        <button class="btn" id="proof-send">Отправить</button>
      </div>
    </div>
  `;
  document.body.appendChild(m);

  m.querySelector('#proof-cancel').onclick = ()=>{ closeProofModal(); };
  m.querySelector('#proof-send').onclick = async ()=>{
    // простая защита от двойных кликов
    const btn = m.querySelector('#proof-send');
    btn.disabled = true;
    try{ await submitProof(); }catch(e){ console.error(e); }
    btn.disabled = false;
  };
}

function closeProofModal(){
  pendingProofTarget = null;
  const el = document.getElementById('modal-proof-backdrop');
  if(el) el.remove();
}

    /* ===== Edit / Add homework ===== */
    function editHomework(hw){
      if(!currentIsAdmin){ alert('Тек админ өңдей алады'); return }
      const m = document.createElement('div');
      m.className='modal-backdrop';
      const deadlineValue = hw.deadline ? (typeof hw.deadline.toDate==='function'? new Date(hw.deadline.toDate()).toISOString().slice(0,10): new Date(hw.deadline).toISOString().slice(0,10)) : '';
      m.innerHTML = `
        <div class="modal">
          <h4>✏️ Өңдеу</h4>
          <div style="display:flex;flex-direction:column;gap:12px;margin:16px 0">
            <input id="e-title" value="${escapeHtml(hw.title||'')}" placeholder="Тақырып" />
            <select id="e-subject">
              ${subjects.map(s=>`<option ${s===hw.subject?'selected':''}>${escapeHtml(s)}</option>`).join('')}
            </select>
            <input id="e-dead" type="date" value="${deadlineValue}" />
            <label style="display:flex;align-items:center;gap:8px">
              <input id="e-requires-proof" type="checkbox" ${hw.requiresProof ? 'checked' : ''} style="width:auto" />
              <span>Құжат талап етіледі</span>
            </label>
            <label style="display:flex;align-items:center;gap:8px">
              <input id="e-archived" type="checkbox" ${hw.archived ? 'checked' : ''} style="width:auto" />
              <span>Архив</span>
            </label>
            <textarea id="e-desc" placeholder="Сипаттама">${escapeHtml(hw.description||'')}</textarea>
          </div>
          <div class="modal-footer">
            <button class="btn ghost" onclick="this.closest('.modal-backdrop').remove()">Болдырмау</button>
            <button class="btn" onclick="saveEdit('${hw.id}')">💾 Сақтау</button>
          </div>
        </div>
      `;
      document.body.appendChild(m);
    }

    async function saveEdit(hwId){
      const vtitle = document.querySelector('#e-title').value.trim();
      const vsub = document.querySelector('#e-subject').value;
      const vdead = document.querySelector('#e-dead').value || '';
      const vreq = document.querySelector('#e-requires-proof').checked;
      const varch = document.querySelector('#e-archived').checked;
      const vdesc = document.querySelector('#e-desc').value;
      try{
        await db.collection('homework').doc(hwId).set({
          title:vtitle,
          subject:vsub,
          deadline:vdead,
          requiresProof:vreq,
          archived:varch,
          description:vdesc,
          updated:firebase.firestore.FieldValue.serverTimestamp()
        },{merge:true});
        document.querySelector('.modal-backdrop')?.remove();
      }catch(e){ alert('Қате: '+e.message) }
    }

    async function addHomework(){
      if(!currentUser){ alert('Кіру қажет'); return }
      if(!currentIsAdmin){ alert('Тек әкімші қоса алады'); return }
      const title = el('hw-title').value.trim();
      const desc = el('hw-desc').value.trim();
      const deadline = el('hw-deadline').value||'';
      const subject = el('hw-subject').value||'';
      const requiresProof = !!el('hw-requires-proof').checked;
      const archived = !!el('hw-archived').checked;
      if(!title || !subject || !deadline){
        el('add-msg').innerHTML='<span class="error-msg">Барлық қажетті өрістерді толтырыңыз</span>';
        return;
      }
      el('add-msg').innerHTML='<span class="small">Сақталып жатыр...</span>';
      try{
        await db.collection('homework').add({
          title,
          description:desc,
          deadline,
          subject,
          authorUid:currentUser.uid,
          authorEmail:currentUser.email||'',
          requiresProof,
          archived,
          createdAt:firebase.firestore.FieldValue.serverTimestamp()
        });
        el('add-msg').innerHTML='<span class="success-msg">✓ Қосылды!</span>';
        el('hw-title').value='';
        el('hw-desc').value='';
        el('hw-deadline').value='';
        el('hw-subject').value='';
        el('hw-requires-proof').checked=false;
        el('hw-archived').checked=false;
        setTimeout(()=>el('add-msg').innerText='',2000);
      }catch(e){
        console.error('addHomework error', e);
        el('add-msg').innerHTML='<span class="error-msg">Қате: '+e.message+'</span>';
      }
    }

    async function injectEventIndicator(hwId, deadline){
      try{
        const container = document.querySelector(`#events-${hwId}`);
        if(!container) return;
        let dstr = '';
        if(!deadline) return;
        if(typeof deadline.toDate === 'function') dstr = new Date(deadline.toDate()).toISOString().slice(0,10);
        else dstr = new Date(deadline).toISOString().slice(0,10);
        const snap = await db.collection('events').where('date','==',dstr).get();
        if(snap.empty) return;
        const types = {};
        snap.forEach(s=>{ const ev = s.data(); types[ev.type] = (types[ev.type]||0)+1 });
        const parts = Object.keys(types).map(t=>`${t}: ${types[t]}`).join(', ');
        container.innerHTML = `⚠️ Бүгінгі/жақын: ${parts}`;
        container.style.color = 'var(--warning)';
        container.style.fontWeight = '600';
      }catch(e){ console.error('injectEventIndicator',e) }
    }

    /* ===== Events modal ===== */
    function openEvents(){
      const m = document.createElement('div');
      m.className='modal-backdrop';
      m.innerHTML = `
        <div class="modal">
          <h4>📝 СОР / СОЧ оқиғалар</h4>
          <div id="events-list" style="max-height:40vh;overflow:auto;margin:16px 0"></div>
          ${currentIsAdmin ? `
            <div class="divider"></div>
            <div style="display:flex;flex-direction:column;gap:10px">
              <input id="ev-title" placeholder="Атауы (мыс. СОР математика)" />
              <input id="ev-date" type="date" />
              <select id="ev-type">
                <option>СОР</option>
                <option>СОЧ</option>
              </select>
              <button class="btn" id="ev-add">➕ Қосу</button>
            </div>
          ` : ''}
          <div class="modal-footer">
            <button class="btn ghost" onclick="this.closest('.modal-backdrop').remove()">Жабу</button>
          </div>
        </div>
      `;
      document.body.appendChild(m);
      if(currentIsAdmin){
        m.querySelector('#ev-add').onclick = async ()=>{
          const t = m.querySelector('#ev-title').value.trim();
          const d = m.querySelector('#ev-date').value;
          const tp = m.querySelector('#ev-type').value;
          if(!t||!d){ alert('Толтырыңыз'); return }
          await db.collection('events').add({
            title:t,
            date:d,
            type:tp,
            createdAt:firebase.firestore.FieldValue.serverTimestamp()
          });
          m.querySelector('#ev-title').value='';
          m.querySelector('#ev-date').value='';
          loadEventsList(m.querySelector('#events-list'));
        };
      }
      loadEventsList(m.querySelector('#events-list'));
    }

    /* ===== Archive modal ===== */
function openArchive(){
  const m = document.createElement('div');
  m.className='modal-backdrop';
  m.innerHTML = `
    <div class="modal" style="max-width:1000px">
      <h4>📦 Архив заданий</h4>
      <div class="small muted-italic" style="margin-bottom:16px">Прошедшие задания и архивные (0.5 балла, требуют доказательство)</div>
      <div id="archive-list" style="max-height:60vh;overflow:auto"></div>
      <div class="modal-footer">
        <button class="btn ghost" onclick="this.closest('.modal-backdrop').remove()">Жабу</button>
      </div>
    </div>
  `;
  document.body.appendChild(m);
  loadArchiveList(m.querySelector('#archive-list'));
}

async function loadArchiveList(container){
  container.innerHTML = '<div class="small">Жүктелуде...</div>';
  try{
    const now = new Date();
    const allHw = lastSnapshot.slice();
    
    // Фильтруем архивные и просроченные
    const archived = allHw.filter(hw => {
      if(hw.archived) return true;
      if(!hw.deadline) return false;
      const deadline = typeof hw.deadline.toDate === 'function' ? hw.deadline.toDate() : new Date(hw.deadline);
      return deadline < now;
    });
    
    if(archived.length === 0){
      container.innerHTML = '<div class="small muted-italic" style="text-align:center;padding:40px">Архивных заданий нет</div>';
      return;
    }
    
    container.innerHTML = '';
    archived.forEach(d => {
      const card = document.createElement('div');
      card.className = 'hw';
      card.style.marginBottom = '12px';
      
      const archiveBadge = d.archived ? '<span class="badge warning">Архив (0.5 балла)</span>' : '<span class="badge danger">Просрочено (0.5 балла)</span>';
      
      card.innerHTML = `
        <div class="hw-header">
          <div style="flex:1;min-width:0">
            <div class="title">${escapeHtml(d.title||'Атауы жоқ')}</div>
            <div class="meta-info">
              <span class="badge">${escapeHtml(d.subject||'')}</span>
              ${archiveBadge}
              <span class="badge" style="background:rgba(245,158,11,0.1);color:var(--warning)">Доказ керек</span>
            </div>
          </div>
          <div style="text-align:right">
            <div class="small" style="font-weight:600">📅 ${escapeHtml(formatDate(d.deadline||d.createdAt||''))}</div>
            <div class="small">от ${escapeHtml(d.authorEmail||'admin')}</div>
          </div>
        </div>
        ${d.description ? `<div class="desc">${escapeHtml(d.description)}</div>` : ''}
        <div class="actions" style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border)">
          <div id="archive-btn-${d.id}"></div>
        </div>
      `;
      
      container.appendChild(card);
      
      // Добавляем кнопку выполнения
      const btnContainer = card.querySelector(`#archive-btn-${d.id}`);
      const completeBtn = makeCompleteButton(d.id, d);
      btnContainer.appendChild(completeBtn);
    });
  }catch(e){
    container.innerHTML = '<div class="error-msg">Қате</div>';
    console.error(e);
  }
}

    async function loadEventsList(container){
      container.innerHTML = '<div class="small">Жүктелуде...</div>';
      try{
        const snap = await db.collection('events').orderBy('date','asc').get();
        if(snap.empty){
          container.innerHTML = '<div class="small muted-italic">Оқиға жоқ</div>';
          return;
        }
        container.innerHTML = '';
        snap.forEach(doc=>{
          const d = doc.data();
          const row = document.createElement('div');
          row.style.padding='12px';
          row.style.borderBottom='1px solid var(--border)';
          row.style.display='flex';
          row.style.justifyContent='space-between';
          row.style.alignItems='center';
          const typeClass = d.type==='СОР' ? 'warning' : 'info';
          row.innerHTML = `
            <div>
              <div style="font-weight:600">${escapeHtml(d.title||'')}</div>
              <div class="small">📅 ${escapeHtml(d.date||'')}</div>
            </div>
            <span class="badge ${typeClass}">${escapeHtml(d.type||'')}</span>
          `;
          container.appendChild(row);
        });
      }catch(e){
        container.innerHTML = '<div class="error-msg">Қате</div>';
        console.error(e);
      }
    }

    /* ===== Seasonal snow ===== */
    function applyAutoWinter(){
      const now = new Date();
      const month = now.getMonth()+1;
      if([12,1,2].includes(month)) enableWinter(true);
      else enableWinter(false);
    }

    function enableWinter(on){
  const layer = el('snow-layer');
  // Отключаем снег на мобильных устройствах
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || window.innerWidth < 768;
  if(on && !isMobile){
    layer.classList.remove('hidden');
  } else {
    layer.classList.add('hidden');
    layer.innerHTML='';
  }
}
    document.documentElement.classList.add('dark');
    /* ===== Store (cases) ===== */
    async function openStore(){
  const m = document.createElement('div');
  m.className='modal-backdrop';
  m.innerHTML = `
    <div class="modal" style="max-width:900px">
      <h4>🎁 Магазин кейсов</h4>
      <div class="small muted-italic" style="margin-bottom:16px">Открывай кейсы и получай уникальные призы!</div>
      <div id="store-list" style="max-height:60vh;overflow:auto"></div>
      <div class="modal-footer">
        <button class="btn ghost" onclick="this.closest('.modal-backdrop').remove()">Жабу</button>
      </div>
    </div>
  `;
  document.body.appendChild(m);
  loadStore(m.querySelector('#store-list'), m);
}

    async function loadStore(container, modalRoot){
  container.innerHTML = '<div class="small">Жүктелуде...</div>';
  
  const cases = [
    {
      id: 'starter_case',
      title: '🎁 Стартовый кейс',
      price: 5,
      rarity: 'common',
      items: [
        {type: 'badge', id: '🌟 Новичок', label: 'Новичок', rarity: 'common'},
        {type: 'badge', id: '📚 Ученик', label: 'Ученик', rarity: 'common'},
        {type: 'badge', id: '✏️ Начинающий', label: 'Начинающий', rarity: 'common'},
        {type: 'badge', id: '🎒 Школьник', label: 'Школьник', rarity: 'common'},
        {type: 'badge', id: '📖 Читатель', label: 'Читатель', rarity: 'common'},
        {type: 'booster', id: 'points_x1.2', label: '+20% ұпай (1 день)', duration: 86400000, multiplier: 1.2, rarity: 'common'},
        {type: 'booster', id: 'points_x1.3', label: '+30% ұпай (12 часов)', duration: 43200000, multiplier: 1.3, rarity: 'rare'},
        {type: 'avatar', id: '🎓', label: 'Аватар: Выпускник', rarity: 'common'},
        {type: 'avatar', id: '📝', label: 'Аватар: Блокнот', rarity: 'common'},
        {type: 'avatar', id: '🎯', label: 'Аватар: Цель', rarity: 'common'},
      ]
    },
    {
      id: 'silver_case',
      title: '🥈 Серебряный кейс',
      price: 35,
      rarity: 'rare',
      items: [
        {type: 'badge', id: '⚡ Активный', label: 'Активный', rarity: 'rare'},
        {type: 'badge', id: '🔥 Целеустремлённый', label: 'Целеустремлённый', rarity: 'rare'},
        {type: 'badge', id: '💪 Упорный', label: 'Упорный', rarity: 'rare'},
        {type: 'badge', id: '🎯 Точный', label: 'Точный', rarity: 'rare'},
        {type: 'badge', id: '🌟 Звезда', label: 'Звезда', rarity: 'rare'},
        {type: 'badge', id: '📈 Прогрессирующий', label: 'Прогрессирующий', rarity: 'rare'},
        {type: 'theme', id: 'theme-purple', label: 'Тема: Фиолетовая', rarity: 'rare'},
        {type: 'theme', id: 'theme-green', label: 'Тема: Зелёная', rarity: 'rare'},
        {type: 'booster', id: 'points_x1.5', label: '+50% ұпай (1 день)', duration: 86400000, multiplier: 1.5, rarity: 'rare'},
        {type: 'booster', id: 'auto_complete', label: 'Авто-сдача (3 задания)', uses: 3, rarity: 'epic'},
        {type: 'avatar', id: '🏆', label: 'Аватар: Трофей', rarity: 'rare'},
        {type: 'avatar', id: '⭐', label: 'Аватар: Звезда', rarity: 'rare'},
        {type: 'avatar', id: '💎', label: 'Аватар: Алмаз', rarity: 'rare'},
      ]
    },
    {
      id: 'gold_case',
      title: '🥇 Золотой кейс',
      price: 75,
      rarity: 'epic',
      items: [
        {type: 'badge', id: '👑 VIP', label: 'VIP', rarity: 'epic'},
        {type: 'badge', id: '💎 Элита', label: 'Элита', rarity: 'epic'},
        {type: 'badge', id: '🔮 Мудрец', label: 'Мудрец', rarity: 'epic'},
        {type: 'badge', id: '🎖️ Отличник', label: 'Отличник', rarity: 'epic'},
        {type: 'badge', id: '🏅 Чемпион', label: 'Чемпион', rarity: 'epic'},
        {type: 'badge', id: '🌈 Радужный', label: 'Радужный', rarity: 'epic'},
        {type: 'theme', id: 'theme-black', label: 'Тема: Чёрная', rarity: 'epic'},
        {type: 'theme', id: 'theme-red', label: 'Тема: Красная', rarity: 'epic'},
        {type: 'theme', id: 'theme-orange', label: 'Тема: Оранжевая', rarity: 'epic'},
        {type: 'booster', id: 'points_x2', label: '2x ұпай (2 дня)', duration: 172800000, multiplier: 2, rarity: 'epic'},
        {type: 'booster', id: 'deadline_extend', label: '+3 дня к дедлайнам', uses: 5, rarity: 'epic'},
        {type: 'avatar', id: '🔥', label: 'Аватар: Огонь', rarity: 'epic'},
        {type: 'avatar', id: '⚡', label: 'Аватар: Молния', rarity: 'epic'},
        {type: 'avatar', id: '👑', label: 'Аватар: Корона', rarity: 'epic'},
      ]
    },
    {
      id: 'diamond_case',
      title: '💎 Алмазный кейс',
      price: 150,
      rarity: 'legendary',
      items: [
        {type: 'badge', id: '🌌 Легенда', label: 'Легенда', rarity: 'legendary'},
        {type: 'badge', id: '🦄 Мифический', label: 'Мифический', rarity: 'legendary'},
        {type: 'badge', id: '🎆 Божественный', label: 'Божественный', rarity: 'legendary'},
        {type: 'badge', id: '💫 Космический', label: 'Космический', rarity: 'legendary'},
        {type: 'badge', id: '🌠 Звёздный', label: 'Звёздный', rarity: 'legendary'},
        {type: 'theme', id: 'theme-pink', label: 'Тема: Розовая', rarity: 'legendary'},
        {type: 'theme', id: 'theme-cyan', label: 'Тема: Циан', rarity: 'legendary'},
        {type: 'theme', id: 'theme-gold', label: 'Тема: Золотая', rarity: 'legendary'},
        {type: 'booster', id: 'points_x3', label: '3x ұпай (7 дней)', duration: 604800000, multiplier: 3, rarity: 'legendary'},
        {type: 'booster', id: 'auto_archive', label: 'Авто-архив (10 заданий)', uses: 10, rarity: 'legendary'},
        {type: 'avatar', id: '🌟', label: 'Аватар: Сияние', rarity: 'legendary'},
        {type: 'avatar', id: '🎭', label: 'Аватар: Маска', rarity: 'legendary'},
        {type: 'avatar', id: '🦋', label: 'Аватар: Бабочка', rarity: 'legendary'},
      ]
    },
    {
      id: 'study_case',
      title: '📚 Учебный кейс',
      price: 25,
      rarity: 'common',
      items: [
        {type: 'badge', id: '📐 Математик', label: 'Математик', rarity: 'rare'},
        {type: 'badge', id: '🔬 Химик', label: 'Химик', rarity: 'rare'},
        {type: 'badge', id: '⚛️ Физик', label: 'Физик', rarity: 'rare'},
        {type: 'badge', id: '🌍 Географ', label: 'Географ', rarity: 'rare'},
        {type: 'badge', id: '💻 Программист', label: 'Программист', rarity: 'rare'},
        {type: 'badge', id: '📜 Историк', label: 'Историк', rarity: 'rare'},
        {type: 'booster', id: 'subject_bonus', label: '+50% по одному предмету', uses: 3, rarity: 'rare'},
        {type: 'avatar', id: '🧪', label: 'Аватар: Пробирка', rarity: 'common'},
        {type: 'avatar', id: '🔭', label: 'Аватар: Телескоп', rarity: 'rare'},
        {type: 'avatar', id: '🧬', label: 'Аватар: ДНК', rarity: 'rare'},
      ]
    },
    {
      id: 'creative_case',
      title: '🎨 Творческий кейс',
      price: 40,
      rarity: 'rare',
      items: [
        {type: 'badge', id: '🎨 Художник', label: 'Художник', rarity: 'rare'},
        {type: 'badge', id: '🎵 Музыкант', label: 'Музыкант', rarity: 'rare'},
        {type: 'badge', id: '✍️ Писатель', label: 'Писатель', rarity: 'rare'},
        {type: 'badge', id: '🎭 Актёр', label: 'Актёр', rarity: 'rare'},
        {type: 'badge', id: '📸 Фотограф', label: 'Фотограф', rarity: 'rare'},
        {type: 'theme', id: 'theme-rainbow', label: 'Тема: Радуга', rarity: 'epic'},
        {type: 'avatar', id: '🎨', label: 'Аватар: Палитра', rarity: 'rare'},
        {type: 'avatar', id: '🎬', label: 'Аватар: Кино', rarity: 'rare'},
        {type: 'avatar', id: '🎪', label: 'Аватар: Цирк', rarity: 'epic'},
        {type: 'booster', id: 'creative_boost', label: '+100% за творческие предметы', duration: 86400000, rarity: 'rare'},
      ]
    },
    {
      id: 'speed_case',
      title: '⚡ Скоростной кейс',
      price: 50,
      rarity: 'rare',
      items: [
        {type: 'badge', id: '⚡ Молниеносный', label: 'Молниеносный', rarity: 'epic'},
        {type: 'badge', id: '🚀 Ракета', label: 'Ракета', rarity: 'epic'},
        {type: 'badge', id: '💨 Ветер', label: 'Ветер', rarity: 'rare'},
        {type: 'badge', id: '⏱️ Спринтер', label: 'Спринтер', rarity: 'rare'},
        {type: 'booster', id: 'instant_complete', label: 'Мгновенная сдача (1 задание)', uses: 1, rarity: 'legendary'},
        {type: 'booster', id: 'time_freeze', label: 'Заморозка дедлайна (24ч)', uses: 2, rarity: 'epic'},
        {type: 'avatar', id: '⚡', label: 'Аватар: Молния', rarity: 'rare'},
        {type: 'avatar', id: '🚀', label: 'Аватар: Ракета', rarity: 'epic'},
        {type: 'avatar', id: '💫', label: 'Аватар: Комета', rarity: 'epic'},
      ]
    },
    {
      id: 'mystery_case',
      title: '❓ Мистический кейс',
      price: 100,
      rarity: 'epic',
      items: [
        {type: 'badge', id: '🔮 Прорицатель', label: 'Прорицатель', rarity: 'epic'},
        {type: 'badge', id: '🌙 Лунный', label: 'Лунный', rarity: 'epic'},
        {type: 'badge', id: '✨ Волшебник', label: 'Волшебник', rarity: 'epic'},
        {type: 'badge', id: '🎇 Иллюзионист', label: 'Иллюзионист', rarity: 'legendary'},
        {type: 'theme', id: 'theme-mystery', label: 'Тема: Мистическая', rarity: 'legendary'},
        {type: 'booster', id: 'mystery_multiplier', label: 'Случайный множитель (1.5x-5x)', duration: 43200000, rarity: 'legendary'},
        {type: 'avatar', id: '🔮', label: 'Аватар: Шар', rarity: 'epic'},
        {type: 'avatar', id: '🌙', label: 'Аватар: Луна', rarity: 'epic'},
        {type: 'avatar', id: '✨', label: 'Аватар: Искры', rarity: 'legendary'},
      ]
    },
    {
      id: 'premium_case',
      title: '👑 Премиум кейс',
      price: 200,
      rarity: 'legendary',
      items: [
        {type: 'badge', id: '👑 Король знаний', label: 'Король знаний', rarity: 'legendary'},
        {type: 'badge', id: '💠 Император', label: 'Император', rarity: 'legendary'},
        {type: 'badge', id: '🎖️ Генерал', label: 'Генерал', rarity: 'legendary'},
        {type: 'badge', id: '🏵️ Магистр', label: 'Магистр', rarity: 'legendary'},
        {type: 'theme', id: 'theme-premium', label: 'Тема: Премиум', rarity: 'legendary'},
        {type: 'booster', id: 'mega_multiplier', label: '5x ұпай (3 дня)', duration: 259200000, multiplier: 5, rarity: 'legendary'},
        {type: 'booster', id: 'premium_pass', label: 'Премиум пропуск (30 дней)', duration: 2592000000, rarity: 'legendary'},
        {type: 'avatar', id: '👑', label: 'Аватар: Золотая корона', rarity: 'legendary'},
        {type: 'avatar', id: '💎', label: 'Аватар: Большой алмаз', rarity: 'legendary'},
        {type: 'avatar', id: '🦄', label: 'Аватар: Единорог', rarity: 'legendary'},
      ]
    },
    {
      id: 'seasonal_case',
      title: '🎄 Сезонный кейс',
      price: 60,
      rarity: 'epic',
      items: [
        {type: 'badge', id: '❄️ Зимний', label: 'Зимний', rarity: 'epic'},
        {type: 'badge', id: '🌸 Весенний', label: 'Весенний', rarity: 'epic'},
        {type: 'badge', id: '☀️ Летний', label: 'Летний', rarity: 'epic'},
        {type: 'badge', id: '🍂 Осенний', label: 'Осенний', rarity: 'epic'},
        {type: 'badge', id: '🎄 Новогодний', label: 'Новогодний', rarity: 'legendary'},
        {type: 'theme', id: 'theme-winter', label: 'Тема: Зима', rarity: 'epic'},
        {type: 'theme', id: 'theme-autumn', label: 'Тема: Осень', rarity: 'epic'},
        {type: 'avatar', id: '❄️', label: 'Аватар: Снежинка', rarity: 'epic'},
        {type: 'avatar', id: '🎄', label: 'Аватар: Ёлка', rarity: 'legendary'},
        {type: 'avatar', id: '🌸', label: 'Аватар: Сакура', rarity: 'epic'},
      ]
    }
  ];

  try {
    container.innerHTML = '';
    const grid = document.createElement('div');
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(250px, 1fr))';
    grid.style.gap = '16px';
    
    cases.forEach(c => {
      const card = document.createElement('div');
      card.className = `card rarity-${c.rarity}`;
      card.style.padding = '20px';
      card.style.transition = 'all 0.3s';
      card.style.cursor = 'pointer';
      
      const rarityColors = {
        legendary: '#ffd700',
        epic: '#a855f7',
        rare: '#3b82f6',
        common: '#64748b'
      };
      
      card.innerHTML = `
        <div style="text-align:center;margin-bottom:12px">
          <div style="font-size:48px;margin-bottom:8px">${c.title.split(' ')[0]}</div>
          <div style="font-weight:700;font-size:18px;margin-bottom:4px">${c.title.split(' ').slice(1).join(' ')}</div>
          <div class="badge" style="background:${rarityColors[c.rarity]}20;color:${rarityColors[c.rarity]}">${c.rarity.toUpperCase()}</div>
        </div>
        <div class="small" style="text-align:center;margin-bottom:12px">${c.items.length} призов</div>
        <div style="text-align:center;margin-bottom:16px">
          <div style="font-size:24px;font-weight:700;color:var(--primary)">🪙 ${c.price}</div>
        </div>
        <button class="btn" style="width:100%">Открыть кейс</button>
      `;
      
      card.querySelector('button').onclick = async (e) => {
        e.stopPropagation();
        e.target.disabled = true;
        try {
          if (!currentUser) { alert('Кіру қажет'); return; }
          const uid = currentUser.uid;
          const statRef = db.collection('userStats').doc(uid);
          const snap = await statRef.get();
          const user = snap.exists ? snap.data() : { coins: 0 };
          
          if ((user.coins || 0) < c.price) {
            alert('Монеттер жеткіліксіз');
            return;
          }
          
          await db.runTransaction(async tx => {
            const s = await tx.get(statRef);
            if (!s.exists || (s.data().coins || 0) < c.price) throw new Error('Not enough coins');
            tx.set(statRef, { coins: firebase.firestore.FieldValue.increment(-c.price) }, { merge: true });
          });
          
          await openCaseAnimation(c, uid);
          await renderUserPoints(uid);
          
        } catch (err) {
          console.error('open case error', err);
          alert('Қате: ' + (err.message || err));
        } finally {
          e.target.disabled = false;
        }
      };
      
      grid.appendChild(card);
    });
    
    container.appendChild(grid);
  } catch (e) {
    container.innerHTML = '<div class="error-msg">Қате</div>';
    console.error(e);
  }
}

async function openCaseAnimation(caseData, userId) {
  const overlay = document.createElement('div');
  overlay.className = 'case-opening';
  overlay.innerHTML = `
    <div style="text-align:center">
      <div class="case-box">🎁</div>
      <div style="color:#fff;font-size:24px;font-weight:700;margin-top:24px">${caseData.title}</div>
    </div>
  `;
  document.body.appendChild(overlay);
  
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  const items = caseData.items || [];
  const weights = items.map(item => {
    const rarityWeights = { common: 50, rare: 30, epic: 15, legendary: 5 };
    return rarityWeights[item.rarity] || 25;
  });
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let random = Math.random() * totalWeight;
  let selectedItem = items[0];
  
  for (let i = 0; i < items.length; i++) {
    random -= weights[i];
    if (random <= 0) {
      selectedItem = items[i];
      break;
    }
  }
  
  overlay.querySelector('.case-box').style.animation = 'none';
  overlay.querySelector('.case-box').innerHTML = '✨';
  
  await new Promise(resolve => setTimeout(resolve, 500));
  
  const rarityBg = {
  legendary: 'linear-gradient(135deg, #ffd700 0%, #ffed4e 100%)',
  epic: 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)',
  rare: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
  common: 'linear-gradient(135deg, #64748b 0%, #475569 100%)'
};

overlay.innerHTML = `
  <div class="prize-reveal" style="text-align:center;background:var(--card);padding:40px;border-radius:20px;max-width:500px;box-shadow:0 0 100px ${rarityBg[selectedItem.rarity]}">
    <div style="font-size:100px;margin-bottom:20px;animation:prizeFloat 2s ease-in-out infinite">${getItemIcon(selectedItem)}</div>
    <div style="font-size:28px;font-weight:700;margin-bottom:12px">${selectedItem.label}</div>
    <div class="badge-large" style="background:${rarityBg[selectedItem.rarity]};color:#fff;font-size:18px;padding:12px 24px;margin-bottom:20px;box-shadow:0 4px 20px rgba(0,0,0,0.3)">${selectedItem.rarity.toUpperCase()}</div>
    <div class="small muted-italic" style="margin-bottom:24px">Автозакрытие через 10 секунд</div>
    <button class="btn" style="font-size:18px;padding:14px 32px" onclick="window.closePrizeModal()">🎉 Забрать приз</button>
  </div>
`;

// Добавляем анимацию
const style = document.createElement('style');
style.textContent = `@keyframes prizeFloat { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-20px); } }`;
document.head.appendChild(style);

// Авто-закрытие через 10 секунд
setTimeout(() => {
  if(document.querySelector('.case-opening')) {
    window.closePrizeModal();
  }
}, 10000);
const lockKey = `case_opening_${userId}`;
if (window[lockKey]) {
  alert('Подождите завершения предыдущего открытия');
  overlay.remove();
  return;
}
window[lockKey] = true;

try {
  // даём приз ОДИН раз
  await grantPrize(userId, selectedItem);

  // Обновляем UI баланса сразу после выдачи приза
  try { await renderUserPoints(userId); } catch(e){ console.warn('renderUserPoints failed', e); }

} catch (e) {
  console.error('grantPrize error', e);

  // Попытка вернуть монеты пользователю (refund) — на случай, если grantPrize упал после списания
  try {
    await db.runTransaction(async (tx) => {
      const statRef = db.collection('userStats').doc(userId);
      const s = await tx.get(statRef);
      if (s.exists) {
        tx.update(statRef, { coins: firebase.firestore.FieldValue.increment(caseData.price) });
      } else {
        tx.set(statRef, { coins: caseData.price }, { merge: true });
      }
    });
    alert('Произошла ошибка при выдаче приза — монеты возвращены.');
  } catch (refundErr) {
    console.error('Refund failed', refundErr);
    alert('Ошибка: не удалось вернуть монеты автоматически. Напишите админу.');
  }

  throw e;
} finally {
  delete window[lockKey];
  // убираем оверлей (анимация)
  overlay.remove();
}
}

// Выдача приза
// grantPrize(uid, item) — выдает приз и записывает историю; атомарно при записи в userStats
async function grantPrize(uid, item) {
  if (!uid || !item) throw new Error('grantPrize: missing args');
  const statRef = db.collection('userStats').doc(uid);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(statRef);
    const data = snap.exists ? snap.data() : {};
    const boosters = Array.isArray(data.boosters) ? [...data.boosters] : [];
    const badges = Array.isArray(data.badges) ? [...data.badges] : [];
    const themes = Array.isArray(data.themes) ? [...data.themes] : [];
    const avatars = Array.isArray(data.avatars) ? [...data.avatars] : [];

    const prizeRecord = {
  id: item.id || item.originalId || item.label || 'unknown',
  type: item.type || 'unknown',
  label: item.label || item.id || '',
  rarity: item.rarity || 'common',
  // serverTimestamp нельзя вкладывать в arrayUnion — используем клиентское время
  ts: Date.now()
};


    let resp = { awarded: null, compensation: 0 };

    if (item.type === 'badge') {
      if (badges.includes(item.id)) {
        resp.compensation = 5;
        tx.set(statRef, { coins: firebase.firestore.FieldValue.increment(resp.compensation) }, { merge: true });
      } else {
        badges.push(item.id);
        tx.set(statRef, { badges, updated: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
        resp.awarded = { type: 'badge', id: item.id, label: item.label };
      }
    } else if (item.type === 'theme') {
      if (themes.includes(item.id)) {
        resp.compensation = 8;
        tx.set(statRef, { coins: firebase.firestore.FieldValue.increment(resp.compensation) }, { merge: true });
      } else {
        themes.push(item.id);
        tx.set(statRef, { themes, updated: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
        resp.awarded = { type: 'theme', id: item.id, label: item.label };
      }
    } else if (item.type === 'avatar') {
      if (avatars.includes(item.id)) {
        resp.compensation = 10;
        tx.set(statRef, { coins: firebase.firestore.FieldValue.increment(resp.compensation) }, { merge: true });
      } else {
        avatars.push(item.id);
        tx.set(statRef, { avatars, updated: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
        resp.awarded = { type: 'avatar', id: item.id, label: item.label };
      }
    } else if (item.type === 'booster') {
      const booster = {
        id: `${item.id}_${Date.now()}`,
        originalId: item.id,
        label: item.label,
        duration: item.duration || null,
        uses: (typeof item.uses === 'number') ? item.uses : undefined,
        multiplier: item.multiplier || null,
        activatedAt: Date.now()
      };
      if (item.id === 'mystery_multiplier' && !booster.multiplier) {
        booster.multiplier = Math.round((1.5 + Math.random() * 3.5) * 10) / 10;
      }
      boosters.push(booster);
      tx.set(statRef, { boosters, updated: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
      resp.awarded = { type: 'booster', originalId: item.id, assignedId: booster.id, label: booster.label };
    } else {
      // unknown type — small compensation
      resp.compensation = 5;
      tx.set(statRef, { coins: firebase.firestore.FieldValue.increment(resp.compensation) }, { merge: true });
    }

    // add prize history
    tx.set(statRef, { prizes: firebase.firestore.FieldValue.arrayUnion(prizeRecord) }, { merge: true });

    return resp;
  });
}


// Иконки для предметов
function getItemIcon(item) {
  if (item.type === 'badge') return item.id.split(' ')[0] || '🏅';
  if (item.type === 'theme') return '🎨';
  if (item.type === 'avatar') return item.id;
  if (item.type === 'booster') return '⚡';
  return '🎁';
}
    /* ===== Donate (add coins) ===== */
    function openDonate(){
  if(!currentUser){ alert('Кіру қажет'); return }
  const m = document.createElement('div');
  m.className='modal-backdrop';
  m.innerHTML = `
    <div class="modal">
      <h4>💰 Донат</h4>
      <div class="small" style="margin-bottom:16px">Переведите на карту и монеты зачислятся автоматически после проверки</div>
      
      <div style="text-align:center;margin-bottom:20px">
        <div style="font-size:18px;font-weight:700;letter-spacing:2px">4400 4302 4200 4312</div>
        <div style="font-size:18px;font-weight:700;letter-spacing:2px">+7 776 153 9768</div>
        <div class="small muted-italic">Kaspi Gold</div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px">
        <div class="card" style="text-align:center;padding:12px">
          <div style="font-size:20px;margin-bottom:4px">50₸</div>
          <div class="small">= 10 монет</div>
        </div>
        <div class="card" style="text-align:center;padding:12px">
          <div style="font-size:20px;margin-bottom:4px">239₸</div>
          <div class="small">= 50 монет</div>
        </div>
        <div class="card" style="text-align:center;padding:12px">
          <div style="font-size:20px;margin-bottom:4px">499₸</div>
          <div class="small">= 150 монет</div>
        </div>
        <div class="card" style="text-align:center;padding:12px">
          <div style="font-size:20px;margin-bottom:4px">699₸</div>
          <div class="small">= 350 монет</div>
        </div>
        <div class="card" style="text-align:center;padding:12px">
          <div style="font-size:20px;margin-bottom:4px">799₸</div>
          <div class="small">= 500 монет</div>
        </div>
        <div class="card" style="text-align:center;padding:12px">
          <div style="font-size:20px;margin-bottom:4px">999₸</div>
          <div class="small">= 1000 монет</div>
        </div>
      </div>

      <div class="small muted-italic" style="text-align:center;margin-bottom:12px">После перевода монеты будут зачислены в течение 5 минут</div>
      <div id="donate-status"></div>
      <div class="modal-footer"><button class="btn ghost" onclick="this.closest('.modal-backdrop').remove()">Жабу</button></div>
    </div>
  `;
  document.body.appendChild(m);
  checkDonationStatus(m.querySelector('#donate-status'));
}

async function checkDonationStatus(statusEl){
  if(!currentUser) return;
  try{
    const snap = await db.collection('donations')
      .where('userId','==',currentUser.uid)
      .where('status','==','confirmed')
      .get();
    if(!snap.empty){
      statusEl.innerHTML = '<div class="success-msg">✓ У вас есть подтверждённые донаты!</div>';
    }
  }catch(e){console.error(e)}
}

    /* ===== Store done ===== */

    /* ===== Simple UI helpers ===== */
    function clearFilters(){ el('search').value=''; el('sort').value='new'; document.querySelectorAll('.subject-item').forEach(x=>x.classList.remove('active')); document.querySelector('.subject-item')?.classList.add('active'); renderFilters(); }
    function reloadOnce(){ subscribeHomeworks(); renderFilters(); renderLeaderboard(); }
    function toggleAdd(){ el('add-card').classList.toggle('hidden'); }
    function showAuth(){ window.scrollTo({top:0,behavior:'smooth'}); el('auth').classList.remove('hidden'); el('app').classList.add('hidden'); }
    function openProfile(){
      if(!currentUser){ alert('Кіру қажет'); return }
      const m = document.createElement('div'); m.className='modal-backdrop';
      m.innerHTML = `
        <div class="modal">
          <h4>👤 Профиль</h4>
          <div id="profile-body" style="max-height:60vh;overflow:auto"></div>
          <div class="modal-footer"><button class="btn ghost" onclick="document.body.removeChild(this.closest('.modal-backdrop'))">Жабу</button></div>
        </div>
      `;
      document.body.appendChild(m);
      loadProfile(m.querySelector('#profile-body'));
    }
    async function loadProfile(container) {
  container.innerHTML = '<div class="small">Жүктелуде...</div>';
  try {
    const doc = await db.collection('userStats').doc(currentUser.uid).get();
    const d = doc.exists ? doc.data() : {};
    const completedSnap = await db.collection('userStats').doc(currentUser.uid).collection('completed').get();
    
    const currentAvatar = d.currentAvatar || '👤';
    const currentTheme = d.currentTheme || '';
    const ownedAvatars = d.avatars || [];
    const ownedThemes = d.themes || [];
    const badges = d.badges || [];
    const boosters = d.boosters || [];
    
    // Бесплатные аватарки
    const freeAvatars = ['👤', '😊', '🎓', '📚', '✏️', '🎯', '🌟', '💡'];
    
    container.innerHTML = `
      <div style="text-align:center;margin-bottom:24px">
        <div style="position:relative;display:inline-block">
          <div id="current-avatar" style="width:100px;height:100px;margin:0 auto 12px;border-radius:50%;background:var(--gradient-1);display:flex;align-items:center;justify-content:center;font-size:48px;box-shadow:0 8px 24px rgba(0,0,0,0.2);cursor:pointer" onclick="openAvatarPicker()">
            ${currentAvatar}
          </div>
          <button class="btn" style="position:absolute;bottom:0;right:-10px;padding:8px;border-radius:50%;width:40px;height:40px" onclick="openAvatarPicker()">✏️</button>
        </div>
        <div style="font-size:20px;font-weight:700;margin-bottom:4px">${escapeHtml(currentUser.email || '')}</div>
        <div class="small">ID: ${currentUser.uid.slice(0, 8)}</div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:24px">
        <div class="card" style="text-align:center;padding:16px">
          <div style="font-size:28px;font-weight:700;color:var(--primary)">${pointsToDisplay(d.points || 0)}</div>
          <div class="small">Ұпай</div>
        </div>
        <div class="card" style="text-align:center;padding:16px">
          <div style="font-size:28px;font-weight:700;color:var(--warning)">${d.coins || 0}</div>
          <div class="small">Монет</div>
        </div>
        <div class="card" style="text-align:center;padding:16px">
          <div style="font-size:28px;font-weight:700;color:var(--success)">${completedSnap.size}</div>
          <div class="small">Выполнено</div>
        </div>
      </div>

      <div class="divider"></div>

      <div style="margin-bottom:20px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <div class="section-title">🏅 Значки (${badges.length})</div>
        </div>
        <div class="badge-showcase" id="badges-container">
          ${badges.length > 0 ? badges.map(b => `<span class="badge-large badge-${getBadgeRarity(b)}">${escapeHtml(b)}</span>`).join('') : '<span class="small muted-italic">Нет значков</span>'}
        </div>
      </div>

      <div class="divider"></div>

      <div style="margin-bottom:20px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <div class="section-title">⚡ Активные бустеры (${boosters.length})</div>
        </div>
        <div id="boosters-container">
          ${boosters.length > 0 ? boosters.map(b => `
            <div class="card" style="padding:12px;margin-bottom:8px">
              <div style="font-weight:600">${escapeHtml(b.label || b.id)}</div>
              <div class="small">${b.uses ? `Осталось: ${b.uses} использований` : 'Активен'}</div>
            </div>
          `).join('') : '<span class="small muted-italic">Нет активных бустеров</span>'}
        </div>
      </div>

      <div class="divider"></div>

      <div style="margin-bottom:20px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <div class="section-title">🎨 Темы (${ownedThemes.length})</div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${ownedThemes.map(t => `
            <button class="btn ${currentTheme === t ? 'success' : 'ghost'}" onclick="applyTheme('${t}')">${t.replace('theme-', '')}</button>
          `).join('')}
          ${ownedThemes.length === 0 ? '<span class="small muted-italic">Нет тем. Открывайте кейсы!</span>' : ''}
        </div>
      </div>

      <div class="divider"></div>

      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn ghost" id="profile-refresh">🔄 Обновить</button>
        <button class="btn danger" id="profile-logout">Шығу</button>
      </div>
    `;
    
    container.querySelector('#profile-refresh').onclick = async () => {
      await renderUserPoints(currentUser.uid);
      loadProfile(container);
    };
    container.querySelector('#profile-logout').onclick = () => {
      logout();
      document.body.removeChild(document.querySelector('.modal-backdrop'));
    };
    
  } catch (e) {
    container.innerHTML = '<div class="error-msg">Қате</div>';
    console.error(e);
  }
}

function getBadgeRarity(badge) {
  const badgeText = String(badge).trim();
  const legendaryBadges = ['Легенда', 'Мифический', 'Король знаний', 'Император', 'Божественный', 'Космический', 'Звёздный', 'Новогодний'];
  const epicBadges = ['VIP', 'Элита', 'Мудрец', 'Молниеносный', 'Отличник', 'Чемпион', 'Радужный', 'Зимний', 'Весенний', 'Летний', 'Осенний', 'Прорицатель', 'Лунный', 'Волшебник', 'Иллюзионист'];
  const rareBadges = ['Активный', 'Целеустремлённый', 'Математик', 'Химик', 'Физик', 'География', 'Программист', 'Историк', 'Художник', 'Музыкант', 'Писатель', 'Актёр', 'Фотограф', 'Ветер', 'Спринтер'];
  if (legendaryBadges.some(b => badgeText.includes(b))) return 'legendary';
  if (epicBadges.some(b => badgeText.includes(b))) return 'epic';
  if (rareBadges.some(b => badgeText.includes(b))) return 'rare';
  return 'common';
}

    /* ===== Auth API ===== */
    async function login(){
      const email = el('email').value.trim();
      const password = el('password').value;
      el('auth-msg').innerText='';
      if(!email || password.length < 6){ el('auth-msg').innerText='Қате: дұрыс деректер енгізіңіз'; return }
      try{
        await auth.signInWithEmailAndPassword(email, password);
        el('auth-msg').innerText='';
      }catch(e){
        console.error('login', e);
        el('auth-msg').innerText = 'Кіру сәтсіз: '+(e.message||e.code);
      }
    }

    async function register(){
      const email = el('email').value.trim();
      const password = el('password').value;
      el('auth-msg').innerText='';
      if(!email || password.length < 6){ el('auth-msg').innerText='Қате: дұрыс деректер енгізіңіз'; return }
      
      try{
        const cred = await auth.createUserWithEmailAndPassword(email, password);
        // create initial userStats
        await db.collection('userStats').doc(cred.user.uid).set({
          points:0,
          coins:0,
          email:cred.user.email||'',
          displayName:(cred.user.email||'').split('@')[0],
          badges:[],
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        }, {merge:true});
        el('auth-msg').innerText='Тіркелді, жүйеге кіріңіз';
      }catch(e){
        console.error('register', e);
        el('auth-msg').innerText = 'Тіркеу сәтсіз: '+(e.message||e.code);
      }
    }

    async function logout(){
      try{
        await auth.signOut();
      }catch(e){ console.error('logout', e) }
    }
    async function openAvatarPicker() {
  const m = document.createElement('div');
  m.className = 'modal-backdrop';
  m.innerHTML = `
    <div class="modal">
      <h4>🎭 Выбор аватарки</h4>
      <div class="small muted-italic" style="margin-bottom:16px">Платные аватарки стоят 50 монет</div>
      
      <div style="margin-bottom:20px">
        <div class="section-title">Бесплатные</div>
        <div class="avatar-picker" id="free-avatars"></div>
      </div>

      <div class="divider"></div>

      <div>
        <div class="section-title">Из кейсов</div>
        <div class="avatar-picker" id="owned-avatars"></div>
      </div>

      <div class="divider"></div>

      <div>
        <div class="section-title">Премиум (50 🪙)</div>
        <div class="avatar-picker" id="premium-avatars"></div>
      </div>

      <div class="modal-footer">
        <button class="btn ghost" onclick="this.closest('.modal-backdrop').remove()">Отмена</button>
      </div>
    </div>
  `;
  document.body.appendChild(m);
  
  const freeAvatars = ['👤', '😊', '🎓', '📚', '✏️', '🎯', '🌟', '💡', '🎒', '📖'];
  const premiumAvatars = ['🦸', '🧙', '🤖', '👽', '🐉', '🦁', '🐺', '🦅', '🐼', '🦊'];
  
  const doc = await db.collection('userStats').doc(currentUser.uid).get();
  const userData = doc.exists ? doc.data() : {};
  const ownedAvatars = userData.avatars || [];
  const currentAvatar = userData.currentAvatar || '👤';
  const premiumUnlocked = userData.premiumAvatars || [];
  
  renderAvatarGrid('free-avatars', freeAvatars, currentAvatar, false, false);
  renderAvatarGrid('owned-avatars', ownedAvatars, currentAvatar, false, true);
  renderAvatarGrid('premium-avatars', premiumAvatars, currentAvatar, true, premiumUnlocked);
}

// Рендер сетки аватарок
function renderAvatarGrid(containerId, avatars, currentAvatar, isPremium, unlockedList) {
  const container = document.querySelector(`#${containerId}`);
  if (!container) return;
  
  if (avatars.length === 0) {
    container.innerHTML = '<div class="small muted-italic" style="grid-column:1/-1">Нет аватарок</div>';
    return;
  }
  
  avatars.forEach(avatar => {
    const isLocked = isPremium && !unlockedList.includes(avatar);
    const div = document.createElement('div');
    div.className = `avatar-option ${currentAvatar === avatar ? 'selected' : ''} ${isLocked ? 'locked' : ''}`;
    div.textContent = avatar;
    
    div.onclick = async () => {
      if (isLocked) {
        if (confirm(`Купить эту аватарку за 50 монет?`)) {
          try {
            const statRef = db.collection('userStats').doc(currentUser.uid);
            await db.runTransaction(async tx => {
              const snap = await tx.get(statRef);
              const data = snap.data() || {};
              if ((data.coins || 0) < 50) throw new Error('Недостаточно монет');
              
              tx.update(statRef, {
                coins: firebase.firestore.FieldValue.increment(-50),
                premiumAvatars: firebase.firestore.FieldValue.arrayUnion(avatar),
                currentAvatar: avatar
              });
            });
            
            await renderUserPoints(currentUser.uid);
            document.querySelector('.modal-backdrop').remove();
            openAvatarPicker();
          } catch (e) {
            alert('Ошибка: ' + (e.message || e));
          }
        }
      } else {
        await db.collection('userStats').doc(currentUser.uid).update({
          currentAvatar: avatar
        });
        document.querySelector('#current-avatar').textContent = avatar;
        document.querySelector('.modal-backdrop').remove();
      }
    };
    
    container.appendChild(div);
  });
}

// Применить тему
async function applyTheme(themeId) {
  try {
    await db.collection('userStats').doc(currentUser.uid).update({
      currentTheme: themeId
    });
    
    document.body.className = themeId;
    alert('Тема применена!');
  } catch (e) {
    console.error('applyTheme error', e);
  }
}


    /* ===== Init: load theme, subscribe etc ===== */
    (function init(){
      // initial display
      el('app').classList.add('hidden');
      // render leaderboard + subjects
      renderSubjectList();
      renderLeaderboard();
      subscribeHomeworks();
      // try apply saved theme above
    })();

    // expose for console debugging
    window._hw_reload = reloadOnce;
    window._hw_subscribe = subscribeHomeworks;
    window._hw_renderFilters = renderFilters;
 