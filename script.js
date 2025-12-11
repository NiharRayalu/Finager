/* =========================
   Finager – script.js v1.6
   Fixes:
   - Calendar day click now shows transactions
   - Sidebar & selects theme-aware (CSS handles)
   - Keeps previous stability & CSV parsing
   ========================= */

(() => {
  const showError = (msg) => {
    console.error(msg);
    let el = document.getElementById('jsError');
    if (!el) {
      el = document.createElement('div');
      el.id = 'jsError';
      el.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:9999;background:#ffefef;border:1px solid #d33;color:#600;padding:8px 10px;border-radius:8px;font:12px/1.3 system-ui;max-width:70vw';
      document.body.appendChild(el);
    }
    el.textContent = 'JS Error: ' + msg;
  };
  window.addEventListener('error', e => showError(e.message));
  window.addEventListener('unhandledrejection', e => showError(String(e.reason || e)));

  const INR = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });

  const CSV_URLS = ['extracted_data.csv', './extracted_data.csv', '/mnt/data/extracted_data.csv'];
  async function fetchCSVText() {
    for (const url of CSV_URLS) {
      try { const res = await fetch(url); if (res.ok) return await res.text(); } catch {}
    }
    throw new Error('Could not load extracted_data.csv from expected locations.');
  }

  function splitCSVLine(line) {
    const out = []; let cur = '', q = false;
    for (let i=0;i<line.length;i++){
      const ch=line[i];
      if (ch === '"'){ if (q && line[i+1] === '"'){ cur+='"'; i++; } else { q=!q; } }
      else if (ch===',' && !q){ out.push(cur); cur=''; }
      else { cur+=ch; }
    }
    out.push(cur);
    return out.map(s=>s.trim());
  }

  async function loadData() {
    const text = await fetchCSVText();
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (!lines.length) return empty();

    const header = splitCSVLine(lines[0]).map(x => x.toLowerCase());
    const hasHeader = header.includes('date') && header.includes('receiver name') && header.includes('amount');
    const start = hasHeader ? 1 : 0;

    const byMonth = {}, byDay = {}, transactions = [];
    let grandSum = 0, grandTxns = 0;

    for (let i = start; i < lines.length; i++) {
      const cols = splitCSVLine(lines[i]);
      if (cols.length < 3) continue;

      const dateRaw = (cols[0] || '').replace(/^"|"$/g, '').trim();
      const recv    = (cols[1] || '').replace(/^"|"$/g, '').trim();
      const amountRaw = (cols[2] || '').replace(/^"|"$/g, '').trim();

      const amt = parseFloat((amountRaw || '').replace(/[₹,\s]/g, ''));
      const d = new Date(dateRaw);
      if (!isFinite(amt) || isNaN(d.getTime())) continue;

      const monthKey = d.toLocaleString('en-US', { month: 'short', year: 'numeric' });
      byMonth[monthKey] ??= { sum: 0, txns: 0 };
      byMonth[monthKey].sum += amt;
      byMonth[monthKey].txns += 1;

      const y = d.getFullYear();
      const m = String(d.getMonth()+1).padStart(2,'0');
      const dd = String(d.getDate()).padStart(2,'0');
      const dayKey = `${y}-${m}-${dd}`;

      const tx = { date:d, receiver:recv, amount:amt, monthKey, dayKey };
      (byDay[dayKey] ||= []).push(tx);
      transactions.push(tx);

      grandSum += amt; grandTxns += 1;
    }

    transactions.sort((a,b)=>a.date - b.date);
    const monthsOrdered = Object.keys(byMonth).sort((a,b)=>Date.parse('01 '+a) - Date.parse('01 '+b));
    return { byMonth, byDay, transactions, monthsOrdered, grandSum, grandTxns };
  }

  function empty(){ return {byMonth:{}, byDay:{}, transactions:[], monthsOrdered:[], grandSum:0, grandTxns:0}; }

  function applyFilters(byMonth, monthFilter, yearFilter) {
    const labels=[], amounts=[]; let total=0, count=0;
    const ordered = Object.keys(byMonth).sort((a,b)=>Date.parse('01 '+a) - Date.parse('01 '+b));
    for (const label of ordered){
      const [m,y]=label.split(' ');
      const okM = monthFilter==='all' || m.toLowerCase()===monthFilter.toLowerCase();
      const okY = yearFilter==='all' || y===yearFilter;
      if (okM && okY){ labels.push(label); amounts.push(byMonth[label].sum); total+=byMonth[label].sum; count+=byMonth[label].txns; }
    }
    return { labels, amounts, total, count };
  }

  let chart;
  function renderChart(labels, data) {
    const canvas = document.getElementById('barChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const dataset = {
      label: 'Monthly Expenses',
      data,
      fill: false,
      borderColor: '#4e73df',
      borderWidth: 3,
      tension: 0.3,
      pointBackgroundColor: '#4e73df',
      pointRadius: 5,
      pointHoverRadius: 7
    };

    if (chart){
      chart.data.labels = labels;
      chart.data.datasets[0].data = data;
      chart.update();
      return;
    }

    chart = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets: [dataset] },
      options: {
        responsive: true,
        maintainAspectRatio: false,   // safe because parent has fixed height
        animation: { duration: 300 },
        scales: {
          x: { title: { display: true, text: 'Months' }, grid: { display: false } },
          y: { title: { display: true, text: 'Amount (₹)' }, beginAtZero: true }
        },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: c => INR.format(c.parsed.y) } }
        }
      }
    });
  }

  function setEmptyState(show){ const el=document.getElementById('emptyState'); if (el) el.hidden = !show; }
  function setTotals(total, txns){
    const tAmt=document.getElementById('totalAmount');
    const tCnt=document.getElementById('totalTxns');
    if (tAmt) tAmt.textContent = INR.format(total||0);
    if (tCnt) tCnt.textContent = txns||0;
  }

  function setKpis(total, txns, byDaySubset){
    try{
      const avgTxn = txns ? total/txns : 0;
      const sums = Object.values(byDaySubset).map(list => list.reduce((s,x)=>s+x.amount,0));
      const avgDay = sums.length ? sums.reduce((a,b)=>a+b,0)/sums.length : 0;
      const maxDay = sums.length ? Math.max(...sums) : 0;
      const set=(id,v)=>{ const el=document.getElementById(id); if(el) el.textContent=v; };
      set('kpiTotal', INR.format(total||0));
      set('kpiTxns', txns||0);
      set('kpiAvgTxn', INR.format(avgTxn));
      set('kpiAvgDay', INR.format(avgDay));
      set('kpiMaxDay', INR.format(maxDay));
    }catch{}
  }

  function fillRecent(transactions, term='', limit=10){
    try{
      const ul=document.getElementById('recentList'); if(!ul) return;
      ul.innerHTML='';
      const q=term.trim().toLowerCase();
      const src=q?transactions.filter(tx=>tx.receiver.toLowerCase().includes(q)):transactions;
      const last=src.slice(-limit).reverse();
      if(!last.length){ ul.innerHTML='<li class="muted">No matching transactions</li>'; return; }
      last.forEach(tx=>{
        const li=document.createElement('li');
        li.innerHTML=`<span>${tx.date.toLocaleDateString('en-IN')} — ${tx.receiver}</span><strong>${INR.format(tx.amount)}</strong>`;
        ul.appendChild(li);
      });
    }catch{}
  }

  function fillTopReceivers(transactions, term=''){
    try{
      const ul=document.getElementById('topReceivers'); if(!ul) return;
      ul.innerHTML='';
      const q=term.trim().toLowerCase();
      const src=q?transactions.filter(tx=>tx.receiver.toLowerCase().includes(q)):transactions;
      const byRecv={}; for(const tx of src){ byRecv[tx.receiver]=(byRecv[tx.receiver]||0)+tx.amount; }
      const top=Object.entries(byRecv).sort((a,b)=>b[1]-a[1]).slice(0,5);
      if(!top.length){ ul.innerHTML='<li class="muted">No data</li>'; return; }
      top.forEach(([name,sum])=>{
        const li=document.createElement('li');
        li.innerHTML=`<span>${name}</span><strong>${INR.format(sum)}</strong>`;
        ul.appendChild(li);
      });
    }catch{}
  }

  function fillMonthTable(byMonth){
    try{
      const tbody=document.querySelector('#monthTable tbody'); if(!tbody) return;
      tbody.innerHTML='';
      const ordered=Object.keys(byMonth).sort((a,b)=>Date.parse('01 '+a)-Date.parse('01 '+b));
      for(const label of ordered){
        const tr=document.createElement('tr');
        tr.innerHTML=`<td>${label}</td><td>${INR.format(byMonth[label].sum)}</td><td>${byMonth[label].txns}</td>`;
        tr.dataset.month=label;
        tbody.appendChild(tr);
      }
    }catch{}
  }

  // Calendar helpers
  let calYear, calMonth;
  const setCalMonth=(y,m)=>{ calYear=y; calMonth=m; };
  const monthTitle=(y,m)=>new Date(y,m,1).toLocaleString('en-US',{month:'long',year:'numeric'});
  const daysInMonth=(y,m)=>new Date(y,m+1,0).getDate();

  function populateCalSelectors(yearSel, monthSel){
    if(!yearSel||!monthSel) return;
    const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    monthSel.innerHTML=''; months.forEach((n,i)=>{ const o=document.createElement('option'); o.value=i; o.textContent=n; monthSel.appendChild(o); });
    const thisYear=new Date().getFullYear();
    yearSel.innerHTML=''; for(let y=thisYear+1;y>=2020;y--){ const o=document.createElement('option'); o.value=y; o.textContent=y; yearSel.appendChild(o); }
  }

  function renderCalendarGrid(byDay){
    try{
      const grid=document.getElementById('calendarGrid'); const title=document.getElementById('calTitle');
      if(!grid) return;
      grid.innerHTML=''; if(title) title.textContent=monthTitle(calYear,calMonth);

      const weekdays=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
      weekdays.forEach(d=>{ const h=document.createElement('div'); h.className='cal-weekday'; h.textContent=d; grid.appendChild(h); });

      const first=new Date(calYear,calMonth,1).getDay();
      const total=daysInMonth(calYear,calMonth);
      for(let i=0;i<first;i++){ const blank=document.createElement('div'); blank.className='cal-weekday'; grid.appendChild(blank); }

      for(let day=1; day<=total; day++){
        const y=calYear, m=String(calMonth+1).padStart(2,'0'), d=String(day).padStart(2,'0');
        const key=`${y}-${m}-${d}`;
        const list=byDay[key]||[];
        const sum=list.reduce((s,x)=>s+x.amount,0);

        const cell=document.createElement('div'); cell.className='cal-cell'; cell.dataset.daykey=key;
        const num=document.createElement('div'); num.className='daynum'; num.textContent=day; cell.appendChild(num);
        const cnt=document.createElement('div'); cnt.className='tiny muted'; cnt.textContent=list.length?`${list.length} txn`:'—'; cell.appendChild(cnt);
        if(list.length){ const sm=document.createElement('div'); sm.className='sum'; sm.textContent=INR.format(sum); cell.appendChild(sm); }
        grid.appendChild(cell);
      }
    }catch{}
  }

  function showDayDetails(byDay, dayKey){
    try{
      const title=document.getElementById('dayTitle'); const totalEl=document.getElementById('dayTotal'); const listEl=document.getElementById('dayTxList');
      if(!title||!totalEl||!listEl) return;
      const list=byDay[dayKey]||[]; const dt=new Date(dayKey);
      title.textContent=dt.toLocaleDateString('en-IN',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
      const total=list.reduce((s,x)=>s+x.amount,0);
      totalEl.textContent='Total: '+INR.format(total);
      listEl.innerHTML='';
      if(!list.length){ listEl.innerHTML='<li class="muted">No transactions</li>'; return; }
      for(const tx of list){ const li=document.createElement('li'); li.innerHTML=`<strong>${INR.format(tx.amount)}</strong> — ${tx.receiver}`; listEl.appendChild(li); }
    }catch{}
  }

  // Downloads
  function buildMonthOptions(selectEl, monthsOrdered){ if(!selectEl) return; monthsOrdered.forEach(m=>{ const o=document.createElement('option'); o.value=m; o.textContent=m; selectEl.appendChild(o); }); }
  function filterTransactions(transactions, monthVal, yearVal){
    return transactions.filter(tx=>{
      const [mon, yr]=tx.monthKey.split(' ');
      const okM=monthVal==='all'||monthVal===tx.monthKey||monthVal===mon;
      const okY=yearVal==='all'||yr===yearVal;
      return okM&&okY;
    });
  }
  function downloadCSV(filename, rows){
    const header=['Date','Receiver Name','Amount'];
    const esc=s=>`"${String(s).replace(/"/g,'""')}"`;
    const body=rows.map(r=>[esc(r.date.toISOString()), esc(r.receiver), r.amount].join(',')).join('\n');
    const csv=header.join(',')+'\n'+body;
    const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a'); a.href=url; a.download=filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }
  function downloadXLSX(filename, rows){
    if(typeof XLSX==='undefined'){ downloadCSV(filename.replace(/\.xlsx$/,'.csv'), rows); return; }
    const data=[['Date','Receiver Name','Amount'], ...rows.map(r=>[r.date.toISOString(), r.receiver, r.amount])];
    const ws=XLSX.utils.aoa_to_sheet(data);
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Transactions');
    XLSX.writeFile(wb, filename);
  }

  // View & nav
  function setActiveNav(viewId){
    document.querySelectorAll('.nav-link').forEach(b=>b.classList.remove('active'));
    const id = `nav-${viewId}`;
    const btn = document.getElementById(id);
    if (btn) btn.classList.add('active');
  }
  function switchView(viewId){
    document.querySelectorAll('.view').forEach(v=>v.classList.remove('current'));
    document.getElementById('view-'+viewId).classList.add('current');
    setActiveNav(viewId);
  }

  // Theme
  function applyTheme(theme){
    document.documentElement.setAttribute('data-theme', theme);
    const toggle=document.getElementById('themeToggle');
    if (toggle) toggle.checked = (theme==='dark');
  }
  function initTheme(){
    const saved=localStorage.getItem('finager-theme');
    const theme=saved || 'light';
    applyTheme(theme);
    const toggle=document.getElementById('themeToggle');
    if (toggle){
      toggle.addEventListener('change', ()=>{
        const t=toggle.checked?'dark':'light';
        applyTheme(t);
        localStorage.setItem('finager-theme', t);
      });
    }
  }

  // Init
  async function init(){
    initTheme();

    const data = await loadData();
    const { byMonth, byDay, transactions, monthsOrdered, grandSum, grandTxns } = data;

    const monthSelect=document.getElementById('monthSelect');
    const yearSelect=document.getElementById('yearSelect');
    const searchInput=document.getElementById('searchInput');

    const refreshDash=()=>{
      const { labels, amounts, total, count } = applyFilters(byMonth, monthSelect?.value || 'all', yearSelect?.value || 'all');

      renderChart(labels, amounts);
      setTotals(labels.length ? total : grandSum, labels.length ? count : grandTxns);
      setEmptyState(labels.length === 0);

      const byDaySubset={};
      for(const tx of transactions){
        const [mon, yr]=tx.monthKey.split(' ');
        const okM=!monthSelect || monthSelect.value==='all' || monthSelect.value.toLowerCase()===mon.toLowerCase();
        const okY=!yearSelect  || yearSelect.value==='all'  || yearSelect.value===yr;
        if (!(okM&&okY)) continue;
        (byDaySubset[tx.dayKey] ||= []).push(tx);
      }
      setKpis(labels.length?total:grandSum, labels.length?count:grandTxns, Object.keys(byDaySubset).length?byDaySubset:byDay);

      const term=searchInput?.value || '';
      fillRecent(transactions, term, 10);
      fillTopReceivers(transactions, term);

      fillMonthTable(byMonth);
    };

    renderChart([], []);
    setTotals(grandSum, grandTxns);
    setEmptyState(false);
    refreshDash();

    monthSelect && monthSelect.addEventListener('change', refreshDash);
    yearSelect  && yearSelect.addEventListener('change', refreshDash);
    searchInput && searchInput.addEventListener('input', ()=> {
      const term=searchInput.value || '';
      fillRecent(transactions, term, 10);
      fillTopReceivers(transactions, term);
    });

    // Month table row -> set filters and go dashboard
    document.getElementById('monthTable')?.addEventListener('click', (e)=>{
      const tr=e.target.closest('tr'); if(!tr?.dataset.month) return;
      const [mon, yr]=tr.dataset.month.split(' ');
      if (document.getElementById('monthSelect')) document.getElementById('monthSelect').value = mon;
      if (document.getElementById('yearSelect'))  document.getElementById('yearSelect').value  = yr;
      refreshDash();
      switchView('dashboard');
    });

    // Header refresh
    document.querySelector('.refresh-button')?.addEventListener('click', ()=>location.reload());

    // Sidebar open/close
    const sidebar=document.getElementById('sidebar');
    document.getElementById('openSidebar')?.addEventListener('click', ()=>sidebar?.classList.add('open'));
    document.getElementById('closeSidebar')?.addEventListener('click', ()=>sidebar?.classList.remove('open'));

    // Nav buttons
    document.querySelectorAll('.nav-link').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const viewId=btn.getAttribute('data-view');
        if (viewId) switchView(viewId);
        sidebar?.classList.remove('open');
      });
    });

    // Brand/Title -> home
    [document.getElementById('brandHome'), document.getElementById('titleHome')].forEach(el=>{
      el?.addEventListener('click', ()=>{
        switchView('dashboard');
        sidebar?.classList.remove('open');
      });
    });

    // Calendar
    const calMonthSel=document.getElementById('calMonthSelect');
    const calYearSel=document.getElementById('calYearSelect');
    const now=new Date(); setCalMonth(now.getFullYear(), now.getMonth());
    populateCalSelectors(calYearSel, calMonthSel);
    if (calYearSel)  calYearSel.value=String(calYear);
    if (calMonthSel) calMonthSel.value=String(calMonth);

    const syncCal=()=>{ renderCalendarGrid(byDay); };
    document.getElementById('calPrev')?.addEventListener('click', ()=>{
      if(calMonth===0) setCalMonth(calYear-1,11); else setCalMonth(calYear,calMonth-1);
      calYearSel.value=String(calYear); calMonthSel.value=String(calMonth);
      syncCal(); setActiveNav('calendar');
    });
    document.getElementById('calNext')?.addEventListener('click', ()=>{
      if(calMonth===11) setCalMonth(calYear+1,0); else setCalMonth(calYear,calMonth+1);
      calYearSel.value=String(calYear); calMonthSel.value=String(calMonth);
      syncCal(); setActiveNav('calendar');
    });
    calMonthSel && calMonthSel.addEventListener('change', ()=>{
      setCalMonth(parseInt(calYearSel.value,10), parseInt(calMonthSel.value,10)); syncCal(); setActiveNav('calendar');
    });
    calYearSel  && calYearSel.addEventListener('change', ()=>{
      setCalMonth(parseInt(calYearSel.value,10), parseInt(calMonthSel.value,10)); syncCal(); setActiveNav('calendar');
    });

    // ✅ FIX: clicking a day now shows its transactions
    document.getElementById('calendarGrid')?.addEventListener('click', (e)=>{
      const cell = e.target.closest('.cal-cell');
      if (cell?.dataset.daykey){
        showDayDetails(byDay, cell.dataset.daykey);
        setActiveNav('calendar');
      }
    });
    syncCal();

    // Downloads
    const dlMonth=document.getElementById('dlMonth');
    const dlYear=document.getElementById('dlYear');
    buildMonthOptions(dlMonth, monthsOrdered);

    const namePrev=document.getElementById('dlFilenamePreview');
    const makeName=(ext, mVal, yVal)=>{ const tag=(mVal==='all'&&yVal==='all')?'all':(mVal==='all'?yVal:(yVal==='all'?mVal:`${mVal}-${yVal}`)); return `transactions-${tag}.${ext}`; };
    const updatePrev=()=>{ if(namePrev) namePrev.textContent = makeName('xlsx', dlMonth?.value || 'all', dlYear?.value || 'all'); };
    dlMonth && dlMonth.addEventListener('change', ()=>{ updatePrev(); setActiveNav('downloads'); });
    dlYear  && dlYear.addEventListener('change', ()=>{ updatePrev(); setActiveNav('downloads'); });
    updatePrev();

    document.getElementById('btnCsv')?.addEventListener('click', ()=>{ const rows=filterTransactions(transactions, dlMonth?.value||'all', dlYear?.value||'all'); downloadCSV(makeName('csv', dlMonth?.value||'all', dlYear?.value||'all'), rows); setActiveNav('downloads'); });
    document.getElementById('btnXlsx')?.addEventListener('click', ()=>{ const rows=filterTransactions(transactions, dlMonth?.value||'all', dlYear?.value||'all'); downloadXLSX(makeName('xlsx', dlMonth?.value||'all', dlYear?.value||'all'), rows); setActiveNav('downloads'); });
    document.getElementById('btnExportCurrent')?.addEventListener('click', ()=>{ const mVal=document.getElementById('monthSelect')?.value||'all'; const yVal=document.getElementById('yearSelect')?.value||'all'; const rows=filterTransactions(transactions, mVal, yVal); downloadXLSX(makeName('xlsx', mVal, yVal), rows); setActiveNav('downloads'); });

    // Fill lists initially
    fillRecent(transactions, '', 10);
    fillTopReceivers(transactions, '');
  }

  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init) : init();
})();
