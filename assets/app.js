(function(){
  const root = document.getElementById('app-root');
  root.querySelectorAll('table').forEach(table=>{
    if(table.parentElement?.classList.contains('table-scroll'))return;
    const wrapper=document.createElement('div');wrapper.className='table-scroll';
    table.parentNode.insertBefore(wrapper,table);wrapper.appendChild(table);
  });
  const SUPABASE_URL = "https://fgbmvagormiwgdkkiqda.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_DPHmmsLWAwopwAtv_aoPuA_72GLjuHT";
  const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const ADMIN_EMAIL = "hl3dsolutions@gmail.com";
  const fmtMoney = v => 'R$ ' + (Number.isFinite(Number(v))?Number(v):0).toFixed(2).replace('.', ',');
  const localISODate = date => {
    const d=date instanceof Date?date:new Date(date||Date.now());
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  };
  const todayISO = () => localISODate(new Date());
  const readFailures = new Set();
  const dataVersions = new Map();
  let structuredBackend = null;
  function isPackageFUnavailable(error){
    const detail=`${error?.code||''} ${error?.message||''}`.toLowerCase();
    return detail.includes('pgrst202')||detail.includes('42883')||detail.includes('could not find the function')||detail.includes('does not exist');
  }
  function escapeHtml(str){
    if(str == null) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  async function getJSON(key, fallback){
    let result;
    try{
      if(structuredBackend!==false){
        const rpc=await supabaseClient.rpc('hl_get_data',{p_key:key});
        if(!rpc.error){
          structuredBackend=true;
          const payload=typeof rpc.data==='string'?JSON.parse(rpc.data):rpc.data;
          dataVersions.set(key,Number(payload?.version)||0);readFailures.delete(key);
          return payload?.value ?? fallback;
        }
        if(!isPackageFUnavailable(rpc.error))throw rpc.error;
        structuredBackend=false;
      }
      result=await supabaseClient.from('kv_store').select('value').eq('key', key).maybeSingle();
    }
    catch(e){ readFailures.add(key); throw new Error(`Não foi possível carregar ${key}. Verifique a conexão antes de continuar.`); }
    const {data,error}=result;
    if(error){ readFailures.add(key); console.error('Erro ao carregar',key,error); throw new Error(`Não foi possível carregar ${key}. Nenhum dado será sobrescrito.`); }
    readFailures.delete(key);
    if(!data) return fallback;
    return data.value ?? fallback;
  }
  async function setJSON(key, value){
    if(readFailures.has(key)) throw new Error(`A gravação de ${key} foi bloqueada porque os dados não foram carregados com segurança.`);
    activeSaveCount++;if(activeSaveCount===1){saveBatchFailed=false;setSaveState('saving','Salvando…');}
    try{
      const write=async()=>{
        if(structuredBackend!==false){
          const {data,error}=await supabaseClient.rpc('hl_set_data',{p_key:key,p_value:value,p_expected_version:dataVersions.has(key)?dataVersions.get(key):null});
          if(!error){
            structuredBackend=true;const payload=typeof data==='string'?JSON.parse(data):data;dataVersions.set(key,Number(payload?.version)||0);return;
          }
          if(!isPackageFUnavailable(error)){
            if(String(error.message||'').includes('HL_VERSION_CONFLICT'))throw new Error(`Os dados de ${key} foram alterados em outro aparelho ou aba. Recarregue antes de salvar novamente.`);
            throw error;
          }
          structuredBackend=false;
        }
        const {error}=await supabaseClient.from('kv_store').upsert({key,value,updated_at:new Date().toISOString()});if(error)throw error;
      };
      if(navigator.locks?.request)await navigator.locks.request(`hl-kv-${key}`,write);else await write();
      return true;
    }catch(e){saveBatchFailed=true;console.error('Erro ao salvar',key,e);if(String(e.message||'').includes('outro aparelho ou aba'))throw e;throw new Error(`Não foi possível salvar ${key}. Seus dados continuam na tela.`);}
    finally{activeSaveCount=Math.max(0,activeSaveCount-1);if(activeSaveCount===0)setSaveState(saveBatchFailed?'error':'saved',saveBatchFailed?'Falha ao salvar':'Salvo');}
  }
  window.addEventListener('unhandledrejection',event=>{
    if(event.reason instanceof Error){event.preventDefault();alert(event.reason.message+' Os dados preenchidos foram mantidos; atualize a página antes de tentar novamente.');}
  });
  function showToast(message,type='ok'){
    const region=document.getElementById('toast-region');if(!region)return;
    const item=document.createElement('div');item.className=`toast ${type==='error'?'error':''}`;item.setAttribute('role',type==='error'?'alert':'status');
    const copy=document.createElement('span');copy.className='toast-message';copy.textContent=String(message);
    const close=document.createElement('button');close.type='button';close.className='toast-close';close.setAttribute('aria-label','Fechar aviso');close.textContent='×';close.addEventListener('click',()=>item.remove());
    item.append(copy,close);region.appendChild(item);
    setTimeout(()=>item.remove(),5200);
  }
  window.alert=message=>showToast(message,/erro|não foi possível|incorret|inválid|falh/i.test(String(message))?'error':'ok');
  let saveStateTimer=null,activeSaveCount=0,saveBatchFailed=false;
  function setSaveState(state,text){
    const el=document.getElementById('global-save-state');if(!el)return;
    clearTimeout(saveStateTimer);el.className=`save-state ${state||''}`;el.textContent=text||'Pronto';
    if(state==='saved')saveStateTimer=setTimeout(()=>{el.className='save-state';el.textContent='Pronto';},2400);
  }

  // ---------- estado ----------
  let CFG = { labor:[], fixed:[], equip:[], materials:[], shipping:[], extras:[], globals:{energyKwh:1.34, paybackMonths:12, depreciationPct:10, fixedHoursBase:160} };
  let EMPRESA = { pix:'', prazo:'', validade:'', pagamento:'', portfolioUrl:'' };
  const LOGO_B64 = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAEqAVMDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD8qqKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAoooo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";
  let SOLICITACOES = [];
  let editingRequestId=null, editingRequestVersion=null, sourceRequestId=null;
  let requestBusy=false, quoteSaveBusy=false, acceptingQuoteBusy=false;
  let ORCAMENTOS = [];
  let PEDIDOS = [];
  let PRODUCTS = [];
  let RECEBIMENTOS = [];
  let CLIENTES = [];
  let CALCULOS = [];
  let editingCalcId = null;
  let savedCalcRates = null;
  let calcHistoryBusy = false;
  let calcExtrasCart = [];
  let orcItemsCart = [];

  async function loadAllData(){
    CFG.labor = await getJSON('custos_labor', []);
    CFG.fixed = await getJSON('custos_fixed', []);
    CFG.equip = await getJSON('custos_equip', []);
    CFG.materials = await getJSON('custos_materials', []);
    CFG.shipping = await getJSON('custos_shipping', []);
    CFG.extras = await getJSON('custos_extras', []);
    CFG.globals = await getJSON('custos_globals', CFG.globals);
    ORCAMENTOS = await getJSON('orcamentos', []);
    PEDIDOS = await getJSON('producao_pedidos', []);
    PRODUCTS = await getJSON('products', []);
    RECEBIMENTOS = await getJSON('empresa_recebimentos', []);
    CLIENTES = await getJSON('empresa_clientes', []);
    EMPRESA = await getJSON('empresa_config', EMPRESA);
  }

  function nextSeqId(list, prefix){
    let maxNum = 0;
    const re = new RegExp('^'+prefix+'-(\\d+)$');
    list.forEach(item=>{ const m = re.exec(item.id); if(m){ const n=parseInt(m[1],10); if(n>maxNum) maxNum=n; } });
    return prefix + '-' + String(maxNum+1).padStart(3,'0');
  }

  // ---------- LOGIN ----------
  document.getElementById('gate-btn').addEventListener('click', async ()=>{
    const pass = document.getElementById('gate-pass').value;
    const msg = document.getElementById('gate-msg');
    if(!pass){ msg.innerHTML = '<div class="msg err">Digite a senha.</div>'; return; }
    const { error } = await supabaseClient.auth.signInWithPassword({ email: ADMIN_EMAIL, password: pass });
    if(error){ msg.innerHTML = '<div class="msg err">Senha incorreta.</div>'; return; }
    await enterApp();
  });
  document.getElementById('gate-pass').addEventListener('keydown', e=>{ if(e.key==='Enter') document.getElementById('gate-btn').click(); });
  document.getElementById('logout-btn').addEventListener('click', async ()=>{
    await supabaseClient.auth.signOut();
    document.getElementById('app-shell').style.display = 'none';
    document.getElementById('gate-box').style.display = 'block';
  });

  async function enterApp(){
    document.getElementById('gate-box').style.display = 'none';
    document.getElementById('app-shell').style.display = 'block';
    document.getElementById('quote-logo-preview').src = LOGO_B64;
    try{ await loadAllData(); }
    catch(e){
      document.getElementById('app-shell').style.display='none';
      document.getElementById('gate-box').style.display='block';
      document.getElementById('gate-msg').innerHTML=`<div class="msg err">${escapeHtml(e.message)} Atualize a página e tente novamente.</div>`;
      return;
    }
    // os valores iniciais só são carregados uma vez; apagar configurações depois disso é respeitado
    const tudoVazio = CFG.labor.length===0 && CFG.fixed.length===0 && CFG.equip.length===0 && CFG.materials.length===0 && CFG.shipping.length===0 && CFG.extras.length===0;
    try{
      const configInitialized = await getJSON('custos_config_initialized', false);
      if(tudoVazio && !configInitialized)await seedFromSpreadsheet('replace');
      else if(!tudoVazio && !configInitialized)await setJSON('custos_config_initialized',true);
    }catch(e){
      document.getElementById('app-shell').style.display='none';document.getElementById('gate-box').style.display='block';
      document.getElementById('gate-msg').innerHTML=`<div class="msg err">${escapeHtml(e.message)} Nenhuma configuração foi alterada.</div>`;return;
    }
    renderConfigTables();
    populateCalcSelects();
    populateCatalogProducts();
    renderOrcamentos();
    renderPedidos();
    renderRecebimentos();
    updateCalcSummary();
    await refreshCalcHistory();
    resetRequestForm();
    await refreshRequests();
    document.getElementById('cfg-empresa-pix').value = EMPRESA.pix || '';
    document.getElementById('cfg-empresa-prazo').value = EMPRESA.prazo || '';
    document.getElementById('cfg-empresa-validade').value = EMPRESA.validade || '';
    document.getElementById('cfg-empresa-pagamento').value = EMPRESA.pagamento || '';
    document.getElementById('cfg-empresa-portfolio-url').value = EMPRESA.portfolioUrl || '';
    applyProductsPortalLink();
    restoreDrafts();
    enhanceAccessibility();
    renderDashboard();
  }

  // valores extraídos diretamente da sua planilha CALCULAR_VALOR_PRODUTOS.xlsx (aba "Base")
  async function seedFromSpreadsheet(mode='replace'){
    if(mode==='replace' && (CFG.fixed.length||CFG.equip.length||CFG.materials.length||CFG.shipping.length||CFG.extras.length)){
      await setJSON(`custos_backup_${Date.now()}`,{createdAt:new Date().toISOString(),labor:CFG.labor,fixed:CFG.fixed,equip:CFG.equip,materials:CFG.materials,shipping:CFG.shipping,extras:CFG.extras,globals:CFG.globals});
    }
    CFG.labor = [
      { name:'Estagiário', salaryMonth:1500, hoursMonth:120 },
      { name:'Assistente', salaryMonth:3000, hoursMonth:160 },
      { name:'Analista', salaryMonth:8000, hoursMonth:160 },
      { name:'Coordenador', salaryMonth:16000, hoursMonth:160 },
    ];
    CFG.fixed = [
      { name:'Luz', value:500 },
      { name:'Água', value:100 },
      { name:'Site e plataformas', value:100 },
      { name:'Mei', value:60 },
      { name:'Fusion 360', value:200 },
    ];
    // só trouxe Ender 3 / Bambolab A1 / Cortadora a laser, que eram os únicos realmente
    // usados no seu orçamento — "Fresadora" e "Máquina 1/2/3" pareciam linhas de exemplo
    // do modelo original, nunca preenchidas de verdade (nomes genéricos, sem uso real na planilha)
    CFG.equip = [
      { name:'Ender 3', purchaseValue:3000, watts:270, maintenanceYear:200 },
      { name:'Bambolab A1', purchaseValue:5200, watts:301, maintenanceYear:300 },
      { name:'Cortadora a laser', purchaseValue:5000, watts:302, maintenanceYear:100 },
    ];
    CFG.materials = [
      { name:'PLA', cost:125, qty:1000 },
      { name:'TPU', cost:125, qty:1000 },
      { name:'PETG', cost:125, qty:1000 },
      { name:'ABS', cost:80, qty:1000 },
      { name:'NYLON', cost:140, qty:1000 },
      { name:'CFPET', cost:260, qty:1000 },
      { name:'Polipropileno', cost:200, qty:1000 },
    ];
    CFG.shipping = [
      { name:'Gratuito', value:0 },
      { name:'Sedex Sul/Sudeste', value:100 },
      { name:'Pac Sul/Sudeste', value:30 },
      { name:'Sedex Centro/Norte/Nordeste', value:100 },
      { name:'Pac Centro/Norte/Nordeste', value:60 },
    ];
    CFG.extras = [
      { name:'Adesivos', value:2.3 },
      { name:'Embalagens', value:1.7 },
      { name:'LEDS', value:1 },
      { name:'Fonte 12v 3a', value:7 },
      { name:'Botões on/off', value:1.32 },
      { name:'Lâmpada Bambu Lab branca', value:27 },
      { name:'Lâmpada Bambu Lab preta', value:30 },
      { name:'Mosquetão chaveiro', value:0.5 },
      { name:'Clicker teclado', value:1 },
      { name:'Tag NFC', value:0.4 },
      { name:'Vasilha inox', value:6 },
    ];
    CFG.globals = { energyKwh:1.34, paybackMonths:12, depreciationPct:10, fixedHoursBase:160 };
    await Promise.all([
      setJSON('custos_labor', CFG.labor),setJSON('custos_fixed', CFG.fixed),setJSON('custos_equip', CFG.equip),
      setJSON('custos_materials', CFG.materials),setJSON('custos_shipping', CFG.shipping),setJSON('custos_extras', CFG.extras),
      setJSON('custos_globals', CFG.globals)
    ]);
    await setJSON('custos_config_initialized',true);
  }
  document.getElementById('cfg-empresa-save-btn').addEventListener('click', async ()=>{
    const nextEmpresa = {
      pix: document.getElementById('cfg-empresa-pix').value.trim(),
      prazo: document.getElementById('cfg-empresa-prazo').value.trim(),
      validade: document.getElementById('cfg-empresa-validade').value.trim(),
      pagamento: document.getElementById('cfg-empresa-pagamento').value.trim(),
      portfolioUrl: document.getElementById('cfg-empresa-portfolio-url').value.trim(),
    };
    try{
      await setJSON('empresa_config', nextEmpresa);
      EMPRESA = nextEmpresa;
      applyProductsPortalLink();
      document.getElementById('cfg-empresa-msg').innerHTML = '<div class="msg ok">Dados salvos! Já valem pros próximos orçamentos.</div>';
    }catch(e){ document.getElementById('cfg-empresa-msg').innerHTML=`<div class="msg err">${escapeHtml(e.message)}</div>`; }
  });
  function applyProductsPortalLink(){
    const btn=document.getElementById('products-portal-btn'),url=(EMPRESA.portfolioUrl||'').trim();
    if(/^https?:\/\//i.test(url)){btn.href=url;btn.style.display='inline-flex';}else{btn.removeAttribute('href');btn.style.display='none';}
  }

  document.getElementById('cfg-import-btn').addEventListener('click', async ()=>{
    if(!confirm('Restaurar os valores iniciais? Isso SUBSTITUIRÁ as configurações atuais. Um backup automático será criado antes da troca.')) return;
    try{
      await seedFromSpreadsheet('replace');
      renderConfigTables();populateCalcSelects();updateCalcSummary();
      alert('Valores iniciais restaurados. O backup das configurações anteriores foi preservado.');
    }catch(e){ alert(e.message); }
  });

  const CATALOG_PORTAL_URL='https://heitorlabs.github.io/heitorlabs/?internal=admin';
  let catalogAdminStarted=false;
  function loadCatalogAdmin(){
    const frame=document.getElementById('catalog-admin-frame'),status=document.getElementById('catalog-admin-status');if(!frame)return;
    setCatalogFocus(true);
    if(catalogAdminStarted)return;catalogAdminStarted=true;status.textContent='Conectando ao painel administrativo…';
    frame.addEventListener('load',()=>{
      try{
        const doc=frame.contentDocument;if(!doc)throw new Error('indisponível');
        const prepare=()=>{
          try{
            doc.querySelector('.topbar')?.style.setProperty('display','none');doc.querySelector('footer')?.style.setProperty('display','none');
            doc.querySelector('#admin-logout-btn')?.style.setProperty('display','none');
            doc.body.style.margin='0';doc.documentElement.style.scrollBehavior='smooth';
            status.textContent=doc.querySelector('#admin-dashboard')?.style.display!=='none'?'Painel conectado. As alterações são refletidas imediatamente na vitrine e na área dos parceiros.':'A sessão ainda está sendo confirmada…';
          }catch(e){status.textContent='Painel carregado. Use sua conta administrativa se uma confirmação de acesso aparecer.';}
        };
        setTimeout(prepare,350);setTimeout(prepare,1300);
      }catch(e){status.textContent='Painel carregado. Quando esta página estiver publicada no GitHub, a sessão administrativa será compartilhada automaticamente.';}
    },{once:true});
    frame.src=CATALOG_PORTAL_URL;
  }
  function setCatalogFocus(active){
    const shell=document.querySelector('.catalog-admin-shell'),button=document.getElementById('catalog-focus-btn');
    if(!shell||!button)return;
    shell.classList.toggle('focus-mode',active);document.body.classList.toggle('catalog-focus-open',active);
    button.setAttribute('aria-pressed',String(active));button.textContent=active?'Sair do modo ampliado':'Ampliar área de trabalho';
  }
  document.getElementById('catalog-focus-btn').addEventListener('click',()=>setCatalogFocus(!document.querySelector('.catalog-admin-shell').classList.contains('focus-mode')));
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&document.querySelector('.catalog-admin-shell')?.classList.contains('focus-mode'))setCatalogFocus(false);});
  const ACTIVITY_SECTION_LABELS={resumo:'Resumo da conta','produtos-em-posse':'Produtos em posse',pedidos:'Pedidos',historico:'Histórico',documentos:'Documentos',catalogo:'Catálogo'};
  function formatActivityTime(seconds){
    const total=Math.max(0,Number(seconds)||0),hours=Math.floor(total/3600),minutes=Math.floor((total%3600)/60);
    if(hours)return `${hours}h ${minutes}min`;if(minutes)return `${minutes} min`;return total?`${Math.round(total)} s`:'—';
  }
  function formatActivityDate(value){if(!value)return '—';const date=new Date(value);return Number.isNaN(date.getTime())?'—':date.toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'});}
  async function loadPartnerActivity(){
    const message=document.getElementById('activity-message'),days=Number(document.getElementById('activity-period').value)||30,button=document.getElementById('activity-refresh-btn');
    button.disabled=true;button.textContent='Atualizando…';message.innerHTML='';
    try{
      const {data,error}=await supabaseClient.rpc('admin_get_partner_activity',{p_days:days});if(error)throw error;
      const report=typeof data==='string'?JSON.parse(data):data||{},clients=Array.isArray(report.clients)?report.clients:[],sections=Array.isArray(report.sections)?report.sections:[],recent=Array.isArray(report.recentSessions)?report.recentSessions:[];
      const clientSections=new Map();sections.forEach(item=>{const current=clientSections.get(item.clientCode);if(!current||Number(item.activeSeconds)>Number(current.activeSeconds))clientSections.set(item.clientCode,item);});
      const totalSessions=clients.reduce((sum,item)=>sum+Number(item.sessions||0),0),totalSeconds=clients.reduce((sum,item)=>sum+Number(item.activeSeconds||0),0);
      const sectionTotals=new Map();sections.forEach(item=>sectionTotals.set(item.section,(sectionTotals.get(item.section)||0)+Number(item.activeSeconds||0)));
      const topSection=[...sectionTotals.entries()].sort((a,b)=>b[1]-a[1])[0];
      document.getElementById('activity-kpi-partners').textContent=clients.length;
      document.getElementById('activity-kpi-sessions').textContent=totalSessions;
      document.getElementById('activity-kpi-time').textContent=formatActivityTime(totalSeconds);
      document.getElementById('activity-kpi-section').textContent=topSection?(ACTIVITY_SECTION_LABELS[topSection[0]]||topSection[0]):'—';
      document.getElementById('activity-partner-rows').innerHTML=clients.length?clients.map(item=>{const top=clientSections.get(item.clientCode);return `<tr><td><strong>${escapeHtml(item.name||item.clientCode)}</strong><small style="display:block;color:var(--muted);">${escapeHtml(item.clientCode)}</small></td><td>${formatActivityDate(item.lastAccess)}</td><td>${Number(item.sessions)||0}</td><td>${formatActivityTime(item.activeSeconds)}</td><td>${escapeHtml(item.deviceType||'—')}</td><td>${top?escapeHtml(ACTIVITY_SECTION_LABELS[top.section]||top.section):'—'}</td></tr>`;}).join(''):'<tr><td colspan="6" style="text-align:center;color:var(--muted);">Nenhum acesso registrado neste período.</td></tr>';
      const combinedSections=[...sectionTotals.entries()].sort((a,b)=>b[1]-a[1]);
      document.getElementById('activity-section-rows').innerHTML=combinedSections.length?combinedSections.map(([section,seconds],index)=>`<div class="summary-row"><span>${index+1}. ${escapeHtml(ACTIVITY_SECTION_LABELS[section]||section)}</span><strong>${formatActivityTime(seconds)}</strong></div>`).join(''):'<div class="empty">Ainda não há tempo de utilização registrado.</div>';
      const clientMap=new Map(clients.map(item=>[item.clientCode,item.name||item.clientCode]));
      document.getElementById('activity-recent-rows').innerHTML=recent.length?recent.slice(0,12).map(item=>`<div class="list-row"><span><strong>${escapeHtml(clientMap.get(item.clientCode)||item.clientCode)}</strong><small style="display:block;color:var(--muted);">${formatActivityDate(item.startedAt)} · ${escapeHtml(item.deviceType||'dispositivo não identificado')}</small></span><strong>${formatActivityTime(item.activeSeconds)}</strong></div>`).join(''):'<div class="empty">Nenhuma sessão recente.</div>';
    }catch(error){
      console.error(error);message.innerHTML='<div class="msg err">O relatório ainda não está disponível. Execute o arquivo SQL atualizado no Supabase e tente novamente.</div>';
      ['activity-kpi-partners','activity-kpi-sessions','activity-kpi-time','activity-kpi-section'].forEach(id=>document.getElementById(id).textContent='—');
    }finally{button.disabled=false;button.textContent='Atualizar';}
  }
  document.getElementById('activity-refresh-btn').addEventListener('click',loadPartnerActivity);
  document.getElementById('activity-period').addEventListener('change',loadPartnerActivity);
  const VIEW_CONTEXT={
    calculadora:{group:'Operação',title:'Calculadora',description:'Calcule custos, defina preços e consulte os cálculos já salvos.'},
    solicitacoes:{group:'Comercial',title:'Solicitações',description:'Registre o que cada cliente pediu antes de localizar produtos e valores.'},
    orcamentos:{group:'Comercial',title:'Orçamentos',description:'Monte propostas, revise condições comerciais e gere o PDF para o cliente.'},
    pedidos:{group:'Operação',title:'Produção',description:'Acompanhe cada pedido desde a fila até a conclusão e o pagamento.'},
    recebimentos:{group:'Gestão',title:'Financeiro',description:'Controle entradas, saídas, lucro apurado e desempenho dos clientes.'},
    'partner-activity':{group:'Gestão',title:'Acessos dos parceiros',description:'Consulte sessões, tempo ativo e áreas mais utilizadas no portal.'},
    'catalogo-admin':{group:'Gestão',title:'Produtos e parceiros',description:'Gerencie o catálogo e os dados usados pelo portal de parceiros.'},
    config:{group:'Administração',title:'Configurações',description:'Atualize custos, materiais, máquinas e dados comerciais do portal.'}
  };
  function updateViewContext(view){
    const bar=document.getElementById('view-context'),meta=VIEW_CONTEXT[view];
    if(!bar)return;
    if(!meta){bar.style.display='none';return;}
    document.getElementById('view-context-kicker').textContent=meta.group;
    document.getElementById('view-context-title').textContent=meta.title;
    document.getElementById('view-context-description').textContent=meta.description;
    const icon=root.querySelector(`nav button[data-view="${view}"] .nav-icon`);
    document.getElementById('view-context-icon').innerHTML=icon?.innerHTML||'';
    const mode=document.getElementById('view-mode-chip');
    if(mode)mode.textContent=view==='inicio'?'Resumo':['calculadora'].includes(view)?'Cálculo':['partner-activity','catalogo-admin'].includes(view)?'Consulta':'Cadastro';
    bar.style.display='flex';
  }
  const mobileMorePanel=document.getElementById('mobile-more-panel'),mobileMoreBackdrop=document.getElementById('mobile-more-backdrop'),mobileMoreButton=root.querySelector('[data-mobile-more]');
  function setMobileMore(open){
    root.querySelector('nav')?.classList.toggle('mobile-more-open',open);
    mobileMorePanel?.classList.toggle('open',open);mobileMoreBackdrop?.classList.toggle('open',open);
    mobileMorePanel?.setAttribute('aria-hidden',String(!open));mobileMoreBackdrop?.setAttribute('aria-hidden',String(!open));
    if(mobileMoreButton){mobileMoreButton.setAttribute('aria-expanded',String(open));mobileMoreButton.querySelector('.nav-label').textContent=open?'Fechar':'Mais';}
    if(open)document.getElementById('mobile-more-close')?.focus();
  }
  function switchView(view){
    const target=root.querySelector(`.view[data-view="${view}"]`);if(!target)return;
    root.dataset.currentView=view;
    root.querySelectorAll('nav button[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
    root.querySelectorAll('.view').forEach(v=>v.style.display='none');target.style.display='block';
    updateViewContext(view);if(view==='recebimentos')renderRecebimentos();if(view==='solicitacoes')renderRequests();if(view==='inicio')renderDashboard();if(view==='catalogo-admin')loadCatalogAdmin();if(view==='partner-activity')loadPartnerActivity();
    setMobileMore(false);window.scrollTo({top:0,behavior:'smooth'});setTimeout(()=>{updateMobilePrimaryAction();enhanceLongPanels();},80);
  }
  const SIDEBAR_STATE_KEY='hl_sidebar_collapsed';
  const sidebarToggle=document.getElementById('sidebar-toggle-btn');
  function applySidebarState(collapsed){
    root.classList.toggle('sidebar-collapsed',collapsed);
    if(!sidebarToggle)return;
    sidebarToggle.textContent=collapsed?'›':'‹';
    sidebarToggle.setAttribute('aria-expanded',String(!collapsed));
    sidebarToggle.setAttribute('aria-label',collapsed?'Expandir menu lateral':'Recolher menu lateral');
    sidebarToggle.title=collapsed?'Expandir menu lateral':'Recolher menu lateral';
  }
  try{applySidebarState(localStorage.getItem(SIDEBAR_STATE_KEY)==='1');}catch(e){applySidebarState(false);}
  sidebarToggle?.addEventListener('click',()=>{const collapsed=!root.classList.contains('sidebar-collapsed');applySidebarState(collapsed);try{localStorage.setItem(SIDEBAR_STATE_KEY,collapsed?'1':'0');}catch(e){}});
  root.querySelectorAll('nav button[data-view]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      switchView(btn.dataset.view);
    });
  });
  root.querySelector('[data-mobile-more]').addEventListener('click',()=>setMobileMore(!mobileMorePanel.classList.contains('open')));
  root.querySelectorAll('[data-mobile-view]').forEach(btn=>{const source=root.querySelector(`nav button[data-view="${btn.dataset.mobileView}"] .nav-icon`);btn.querySelector('.nav-icon').innerHTML=source?.innerHTML||'';btn.addEventListener('click',()=>switchView(btn.dataset.mobileView));});
  document.getElementById('mobile-more-close').addEventListener('click',()=>setMobileMore(false));
  mobileMoreBackdrop.addEventListener('click',()=>setMobileMore(false));
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&mobileMorePanel.classList.contains('open'))setMobileMore(false);});
  root.querySelectorAll('[data-go-view]').forEach(btn=>btn.addEventListener('click',()=>switchView(btn.dataset.goView)));

  const SHORTCUT_KEY='hl_dashboard_shortcuts';
  const shortcutDefinitions=[
    ['solicitacoes','Nova solicitação'],['calculadora','Novo cálculo'],['orcamentos','Novo orçamento'],
    ['pedidos','Produção'],['recebimentos','Novo lançamento'],['catalogo-admin','Produtos e parceiros']
  ];
  function readShortcutPreference(){
    try{const saved=JSON.parse(localStorage.getItem(SHORTCUT_KEY)||'null');if(Array.isArray(saved)&&saved.length)return saved.filter(v=>shortcutDefinitions.some(([id])=>id===v)).slice(0,5);}catch(e){}
    return ['solicitacoes','calculadora','orcamentos','pedidos','recebimentos'];
  }
  function applyDashboardShortcuts(){
    const selected=readShortcutPreference(),box=document.getElementById('dashboard-shortcuts');if(!box)return;
    box.querySelectorAll('[data-go-view]').forEach(btn=>btn.style.display=selected.includes(btn.dataset.goView)?'inline-flex':'none');
    document.querySelectorAll('#shortcut-options input').forEach(input=>input.checked=selected.includes(input.value));
  }
  function buildShortcutEditor(){
    const options=document.getElementById('shortcut-options'),editor=document.getElementById('shortcut-editor'),toggle=document.getElementById('customize-shortcuts-btn');if(!options||!editor||!toggle)return;
    options.innerHTML=shortcutDefinitions.map(([id,label])=>`<label><input type="checkbox" value="${id}"> ${label}</label>`).join('');
    applyDashboardShortcuts();
    options.addEventListener('change',event=>{const chosen=[...options.querySelectorAll('input:checked')].map(i=>i.value);if(chosen.length>5){event.target.checked=false;showToast('Escolha no máximo cinco atalhos.','error');return;}if(!chosen.length){event.target.checked=true;showToast('Mantenha pelo menos um atalho.','error');return;}try{localStorage.setItem(SHORTCUT_KEY,JSON.stringify(chosen));}catch(e){}applyDashboardShortcuts();showToast('Atalhos atualizados.');});
    toggle.addEventListener('click',()=>{const open=editor.classList.toggle('open');toggle.setAttribute('aria-expanded',String(open));toggle.textContent=open?'Concluir':'⚙ Personalizar';});
  }
  buildShortcutEditor();

  function updateMobilePrimaryAction(){
    const dock=document.getElementById('mobile-primary-action'),view=root.dataset.currentView;if(!dock)return;
    const preferred={calculadora:['calc-save-btn','Salvar cálculo'],solicitacoes:['sol-save','Salvar solicitação'],orcamentos:['orc-save-btn','Salvar orçamento'],pedidos:['ped-add-btn','Adicionar à fila'],recebimentos:['rec-add-btn','Registrar lançamento']}[view];
    const source=preferred&&document.getElementById(preferred[0]);
    const show=window.matchMedia('(max-width:700px)').matches&&source&&source.offsetParent!==null;
    dock.classList.toggle('show',Boolean(show));dock.textContent=preferred?.[1]||'';dock.onclick=show?()=>source.click():null;
  }
  window.addEventListener('resize',updateMobilePrimaryAction,{passive:true});
  document.addEventListener('click',event=>{
    const edit=event.target.closest('[data-edit-rec],[data-edit-calc],[data-edit-sol],[data-edit-ped],[data-edit-orc],button');
    if(edit&&(/editar/i.test(edit.textContent||'')||[...edit.attributes].some(a=>a.name.startsWith('data-edit-')))){const chip=document.getElementById('view-mode-chip');if(chip)chip.textContent='Edição';setTimeout(updateMobilePrimaryAction,60);}
  },true);

  const COLLAPSED_PANEL_KEY='hl_collapsed_panels';
  function collapsedPanelKeys(){try{return new Set(JSON.parse(localStorage.getItem(COLLAPSED_PANEL_KEY)||'[]'));}catch(e){return new Set();}}
  function enhanceLongPanels(){
    const view=root.querySelector('.view[style*="display: block"]')||root.querySelector(`.view[data-view="${root.dataset.currentView}"]`);if(!view)return;
    [...view.querySelectorAll(':scope > .panel, :scope > .content-grid > .panel')].forEach((panel,index)=>{
      if(panel.dataset.uiEnhanced||panel.scrollHeight<650||panel.classList.contains('production-entry')||panel.id==='dashboard-shortcuts')return;
      panel.dataset.uiEnhanced='1';panel.classList.add('long-panel');const key=`${view.dataset.view||'view'}-${index}`;panel.dataset.uiPanelKey=key;
      const button=document.createElement('button');button.type='button';button.className='long-panel-toggle';button.setAttribute('aria-expanded','true');button.textContent='Reduzir seção';panel.prepend(button);
      const saved=collapsedPanelKeys();if(saved.has(key)){panel.classList.add('ui-collapsed');button.textContent='Expandir seção';button.setAttribute('aria-expanded','false');}
      button.addEventListener('click',()=>{panel.classList.toggle('ui-collapsed');const collapsed=panel.classList.contains('ui-collapsed'),keys=collapsedPanelKeys();collapsed?keys.add(key):keys.delete(key);try{localStorage.setItem(COLLAPSED_PANEL_KEY,JSON.stringify([...keys]));}catch(e){}button.textContent=collapsed?'Expandir seção':'Reduzir seção';button.setAttribute('aria-expanded',String(!collapsed));});
    });
  }

  function renderDashboard(){
    const today=todayISO(),openRequests=SOLICITACOES.filter(s=>!['Cancelado','Aceito / produção'].includes(requestStatus(s))&&!ORCAMENTOS.some(o=>o.sourceRequestId===s.id)),overdue=PEDIDOS.filter(isPedidoAtrasado),inProduction=PEDIDOS.filter(p=>p.status==='Em produção'&&!p.archivedAt),pendingMoney=RECEBIMENTOS.filter(r=>r.status==='Pendente'),month=monthKey(today),monthNet=RECEBIMENTOS.filter(r=>monthKey(r.date)===month&&transactionType(r)==='Entrada'&&r.status==='Recebido').reduce((s,r)=>s+receiptNet(r),0);
    const hour=new Date().getHours(),greeting=hour<12?'Bom dia':hour<18?'Boa tarde':'Boa noite';document.getElementById('dashboard-greeting').textContent=`${greeting}. O que precisa de atenção hoje?`;
    document.getElementById('dashboard-kpis').innerHTML=`<button class="today-card" data-dash-view="solicitacoes" style="--card-color:var(--coral);text-align:left;color:inherit;cursor:pointer"><span>Solicitações sem orçamento</span><strong>${openRequests.length}</strong></button><button class="today-card" data-dash-view="pedidos" style="--card-color:var(--violet);text-align:left;color:inherit;cursor:pointer"><span>Em produção</span><strong>${inProduction.length}</strong></button><button class="today-card" data-dash-view="pedidos" style="--card-color:var(--red);text-align:left;color:inherit;cursor:pointer"><span>Pedidos atrasados</span><strong>${overdue.length}</strong></button><button class="today-card" data-dash-view="recebimentos" style="--card-color:var(--green);text-align:left;color:inherit;cursor:pointer"><span>Entrou líquido no mês</span><strong>${fmtMoney(monthNet)}</strong></button>`;
    const attention=[...overdue.map(p=>({view:'pedidos',title:`Pedido atrasado · ${p.id}`,meta:`${p.client||p.desc} · entrega ${fmtDate(p.deliveryDate)}`})),...openRequests.slice(0,4).map(s=>({view:'solicitacoes',title:`Solicitação · ${s.id}`,meta:`${s.client||'Cliente não informado'} · ${s.description||s.request||'ver detalhes'}`})),...pendingMoney.slice(0,4).map(r=>({view:'recebimentos',title:`Financeiro pendente · ${r.id}`,meta:`${r.client||r.description||'Lançamento'} · ${fmtMoney(r.value)}`}))].slice(0,8);
    document.getElementById('dashboard-attention').innerHTML=attention.length?attention.map(x=>`<button class="today-item" data-dash-view="${x.view}" style="width:100%;color:inherit;text-align:left;cursor:pointer"><span><strong>${escapeHtml(x.title)}</strong><small>${escapeHtml(x.meta)}</small></span><span aria-hidden="true">→</span></button>`).join(''):'<div class="empty">Nenhuma pendência importante agora.</div>';
    const recent=[...PEDIDOS.map(p=>({date:p.date||'',view:'pedidos',title:p.desc,meta:`${p.id} · ${p.status}`})),...ORCAMENTOS.map(o=>({date:o.date||'',view:'orcamentos',title:o.clientName||o.client||'Orçamento',meta:`${o.id} · ${fmtMoney(o.total||0)}`})),...CALCULOS.map(c=>({date:(c.updatedAt||c.createdAt||'').slice(0,10),view:'calculadora',title:c.inputs?.['calc-product-name']||'Cálculo',meta:`${c.id} · ${fmtMoney(c.result?.valorFinal||c.valorFinal||0)}`}))].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,6);
    document.getElementById('dashboard-recent').innerHTML=recent.length?recent.map(x=>`<button class="today-item" data-dash-view="${x.view}" style="width:100%;color:inherit;text-align:left;cursor:pointer"><span><strong>${escapeHtml(x.title)}</strong><small>${escapeHtml(x.meta)}${x.date?' · '+fmtDate(x.date):''}</small></span><span aria-hidden="true">→</span></button>`).join(''):'<div class="empty">Os registros recentes aparecerão aqui.</div>';
    root.querySelectorAll('[data-dash-view]').forEach(b=>b.addEventListener('click',()=>switchView(b.dataset.dashView)));
  }

  const globalSearch=document.getElementById('global-search'),globalResults=document.getElementById('global-search-results');
  function globalSearchRows(query){const q=query.trim().toLocaleLowerCase('pt-BR');if(q.length<2)return[];const has=(...v)=>v.filter(Boolean).join(' ').toLocaleLowerCase('pt-BR').includes(q);return [
    ...SOLICITACOES.filter(x=>has(x.id,x.client,x.description,x.request,x.notes)).map(x=>({view:'solicitacoes',type:'Solicitação',title:x.client||x.id,meta:x.description||x.request||x.id})),
    ...ORCAMENTOS.filter(x=>has(x.id,x.clientName,x.client,x.items?.map(i=>i.desc||i.description).join(' '))).map(x=>({view:'orcamentos',type:'Orçamento',title:x.clientName||x.client||x.id,meta:x.id})),
    ...PEDIDOS.filter(x=>has(x.id,x.client,x.desc,x.status)).map(x=>({view:'pedidos',type:'Produção',title:x.client||x.desc,meta:`${x.id} · ${x.status}`})),
    ...RECEBIMENTOS.filter(x=>has(x.id,x.client,x.description,x.orderId)).map(x=>({view:'recebimentos',type:'Financeiro',title:x.client||x.description||x.id,meta:`${x.id} · ${fmtMoney(x.value)}`})),
    ...CALCULOS.filter(x=>has(x.id,x.inputs?.['calc-product-name'],x.inputs?.['calc-client'],x.inputs?.['calc-product-details'])).map(x=>({view:'calculadora',type:'Cálculo',title:x.inputs?.['calc-product-name']||x.id,meta:x.inputs?.['calc-client']||x.id})),
    ...PRODUCTS.filter(x=>has(x.code,x.name,x.categories?.join?.(' '),x.category)).map(x=>({view:'catalogo-admin',type:'Produto',title:x.name||x.code,meta:x.code||'Produto da vitrine'}))].slice(0,18)}
  globalSearch.addEventListener('input',()=>{const rows=globalSearchRows(globalSearch.value);globalResults.style.display=globalSearch.value.trim().length>=2?'block':'none';globalResults.innerHTML=rows.length?rows.map(x=>`<button class="search-result" data-search-view="${x.view}" style="width:100%;color:inherit;text-align:left;background:transparent;border-left:0;border-right:0;border-top:0"><span class="tag producao">${x.type}</span><span><strong>${escapeHtml(x.title)}</strong><small>${escapeHtml(x.meta)}</small></span><span aria-hidden="true">→</span></button>`).join(''):'<div class="empty">Nenhum resultado encontrado.</div>';globalResults.querySelectorAll('[data-search-view]').forEach(b=>b.addEventListener('click',()=>{switchView(b.dataset.searchView);globalSearch.value='';globalResults.style.display='none'}));});
  document.addEventListener('click',e=>{if(!e.target.closest('.global-search'))globalResults.style.display='none';});
  globalSearch.addEventListener('keydown',e=>{if(e.key==='Escape'){globalSearch.value='';globalResults.style.display='none';globalSearch.blur();}});

  const DRAFT_KEY='hl_portal_drafts_v16',draftPrefixes=['calc-','sol-','orc-','rec-'];
  function draftFields(){return [...root.querySelectorAll('input[id],textarea[id],select[id]')].filter(el=>draftPrefixes.some(p=>el.id.startsWith(p))&&!/search|filter|sort|list|date-from/.test(el.id));}
  function saveDrafts(){const data={};draftFields().forEach(el=>{if(el.type!=='file')data[el.id]=el.value});try{localStorage.setItem(DRAFT_KEY,JSON.stringify(data));}catch(e){}}
  function restoreDrafts(){try{const data=JSON.parse(localStorage.getItem(DRAFT_KEY)||'{}');draftFields().forEach(el=>{if(Object.prototype.hasOwnProperty.call(data,el.id)&&data[el.id]!==''&&(!el.value||el.value==='0'))el.value=data[el.id]});updateCalcSummary();}catch(e){}}
  root.addEventListener('input',e=>{if(e.target.id&&draftPrefixes.some(p=>e.target.id.startsWith(p)))saveDrafts()});window.addEventListener('beforeunload',saveDrafts);
  function enhanceAccessibility(){
    root.querySelectorAll('.field').forEach(field=>{const control=field.querySelector('input[id],select[id],textarea[id]'),label=field.querySelector('label');if(control&&label&&!label.htmlFor)label.htmlFor=control.id;});
    root.querySelectorAll('.panel>table').forEach(table=>{if(table.parentElement.classList.contains('table-scroll'))return;const wrap=document.createElement('div');wrap.className='table-scroll';table.parentNode.insertBefore(wrap,table);wrap.appendChild(table);});
    root.querySelectorAll('button').forEach(btn=>{if(!btn.getAttribute('aria-label')&&!btn.textContent.trim())btn.setAttribute('aria-label',btn.title||'Ação');});
  }

  // ============================================================
  // CONFIGURAÇÕES
  // ============================================================
  function laborHourlyRate(l){ return Number(l.hoursMonth) > 0 ? Number(l.salaryMonth)/Number(l.hoursMonth) : 0; }
  function equipHourlyRate(e){
    const g = CFG.globals;
    const energiaHora = (Number(e.watts)/1000) * Number(g.energyKwh);
    const horasMes=Math.max(1,Number(g.fixedHoursBase)||160);
    const mesesRetorno=Math.max(1,Number(g.paybackMonths)||12);
    const retornoInvestimentoHora=Number(e.purchaseValue||0)/(mesesRetorno*horasMes);
    const manutencaoHora=Number(e.maintenanceYear||0)/(horasMes*12);
    return energiaHora+retornoInvestimentoHora+manutencaoHora;
  }
  function materialUnitCost(m){ return Number(m.qty) > 0 ? Number(m.cost)/Number(m.qty) : 0; }
  function fixedHourlyRate(){
    const total = CFG.fixed.reduce((s,f)=>s+Number(f.value),0);
    const base = Number(document.getElementById('cfg-fixed-hours-base').value) || CFG.globals.fixedHoursBase || 160;
    return base > 0 ? total/base : 0;
  }

  function renderConfigTables(){
    document.getElementById('cfg-energy-kwh').value = CFG.globals.energyKwh;
    document.getElementById('cfg-payback-months').value = CFG.globals.paybackMonths;
    document.getElementById('cfg-depreciation-pct').value = CFG.globals.depreciationPct;
    document.getElementById('cfg-fixed-hours-base').value = CFG.globals.fixedHoursBase || 160;

    document.querySelector('#cfg-labor-table tbody').innerHTML = CFG.labor.map((l,i)=>`
      <tr><td>${escapeHtml(l.name)}</td><td>${fmtMoney(l.salaryMonth)}</td><td>${l.hoursMonth}</td><td>${fmtMoney(laborHourlyRate(l))}</td>
      <td><button class="actions" data-del-labor="${i}" style="background:none;border:none;color:var(--red);cursor:pointer;">✕</button></td></tr>
    `).join('') || '<tr><td colspan="5" style="color:var(--muted);">Nenhum cadastrado ainda.</td></tr>';

    document.querySelector('#cfg-fixed-table tbody').innerHTML = CFG.fixed.map((f,i)=>`
      <tr><td>${escapeHtml(f.name)}</td><td>${fmtMoney(f.value)}</td>
      <td><button data-del-fixed="${i}" style="background:none;border:none;color:var(--red);cursor:pointer;">✕</button></td></tr>
    `).join('') || '<tr><td colspan="3" style="color:var(--muted);">Nenhum cadastrado ainda.</td></tr>';
    document.getElementById('cfg-fixed-total').textContent = fmtMoney(CFG.fixed.reduce((s,f)=>s+Number(f.value),0));
    document.getElementById('cfg-fixed-hourly').textContent = fmtMoney(fixedHourlyRate());

    document.querySelector('#cfg-equip-table tbody').innerHTML = CFG.equip.map((e,i)=>`
      <tr><td>${escapeHtml(e.name)}</td><td>${fmtMoney(e.purchaseValue)}</td><td>${e.watts}W</td><td>${fmtMoney(e.maintenanceYear)}</td><td>${fmtMoney(equipHourlyRate(e))}</td>
      <td><button data-del-equip="${i}" style="background:none;border:none;color:var(--red);cursor:pointer;">✕</button></td></tr>
    `).join('') || '<tr><td colspan="6" style="color:var(--muted);">Nenhum cadastrado ainda.</td></tr>';

    document.querySelector('#cfg-material-table tbody').innerHTML = CFG.materials.map((m,i)=>`
      <tr><td>${escapeHtml(m.name)}</td><td>${fmtMoney(m.cost)}</td><td>${m.qty}g</td><td>${fmtMoney(materialUnitCost(m))}</td>
      <td><button data-del-material="${i}" style="background:none;border:none;color:var(--red);cursor:pointer;">✕</button></td></tr>
    `).join('') || '<tr><td colspan="5" style="color:var(--muted);">Nenhum cadastrado ainda.</td></tr>';

    document.querySelector('#cfg-shipping-table tbody').innerHTML = CFG.shipping.map((s,i)=>`
      <tr><td>${escapeHtml(s.name)}</td><td>${fmtMoney(s.value)}</td>
      <td><button data-del-shipping="${i}" style="background:none;border:none;color:var(--red);cursor:pointer;">✕</button></td></tr>
    `).join('') || '<tr><td colspan="3" style="color:var(--muted);">Nenhuma cadastrada ainda.</td></tr>';

    document.querySelector('#cfg-extras-table tbody').innerHTML = CFG.extras.map((x,i)=>`
      <tr><td>${escapeHtml(x.name)}</td><td>${fmtMoney(x.value)}</td>
      <td><button data-del-extra="${i}" style="background:none;border:none;color:var(--red);cursor:pointer;">✕</button></td></tr>
    `).join('') || '<tr><td colspan="3" style="color:var(--muted);">Nenhum cadastrado ainda.</td></tr>';

    const safeDelete=async(prop,key,index,refreshSelects=false)=>{const next=CFG[prop].filter((_,i)=>i!==index);await setJSON(key,next);CFG[prop]=next;renderConfigTables();if(refreshSelects)populateCalcSelects();};
    root.querySelectorAll('[data-del-labor]').forEach(b=>b.addEventListener('click',()=>safeDelete('labor','custos_labor',+b.dataset.delLabor,true)));
    root.querySelectorAll('[data-del-fixed]').forEach(b=>b.addEventListener('click',()=>safeDelete('fixed','custos_fixed',+b.dataset.delFixed)));
    root.querySelectorAll('[data-del-equip]').forEach(b=>b.addEventListener('click',()=>safeDelete('equip','custos_equip',+b.dataset.delEquip,true)));
    root.querySelectorAll('[data-del-material]').forEach(b=>b.addEventListener('click',()=>safeDelete('materials','custos_materials',+b.dataset.delMaterial,true)));
    root.querySelectorAll('[data-del-shipping]').forEach(b=>b.addEventListener('click',()=>safeDelete('shipping','custos_shipping',+b.dataset.delShipping,true)));
    root.querySelectorAll('[data-del-extra]').forEach(b=>b.addEventListener('click',()=>safeDelete('extras','custos_extras',+b.dataset.delExtra,true)));
  }

  document.getElementById('cfg-labor-add-btn').addEventListener('click', async ()=>{
    const name = document.getElementById('cfg-labor-name').value.trim();
    const salaryMonth = parseFloat(document.getElementById('cfg-labor-salary').value);
    const hoursMonth = parseFloat(document.getElementById('cfg-labor-hours').value);
    const msg = document.getElementById('cfg-labor-add-btn-msg');
    if(!name){ msg.innerHTML = '<div class="msg err">Preencha o nome.</div>'; return; }
    if(!Number.isFinite(salaryMonth)||salaryMonth<0){ msg.innerHTML = '<div class="msg err">Preencha um salário mensal válido.</div>'; return; }
    if(!Number.isFinite(hoursMonth)||hoursMonth<=0){ msg.innerHTML = '<div class="msg err">As horas mensais devem ser maiores que zero.</div>'; return; }
    msg.innerHTML = '';
    const next=[...CFG.labor,{name,salaryMonth,hoursMonth}];await setJSON('custos_labor',next);CFG.labor=next;
    document.getElementById('cfg-labor-name').value=''; document.getElementById('cfg-labor-salary').value='';
    renderConfigTables(); populateCalcSelects();
  });
  document.getElementById('cfg-fixed-add-btn').addEventListener('click', async ()=>{
    const name = document.getElementById('cfg-fixed-name').value.trim();
    const value = parseFloat(document.getElementById('cfg-fixed-value').value);
    const msg = document.getElementById('cfg-fixed-add-btn-msg');
    if(!name){ msg.innerHTML = '<div class="msg err">Preencha o nome do item.</div>'; return; }
    if(!Number.isFinite(value)||value<0){ msg.innerHTML = '<div class="msg err">Preencha um valor mensal válido.</div>'; return; }
    msg.innerHTML = '';
    const next=[...CFG.fixed,{name,value}];await setJSON('custos_fixed',next);CFG.fixed=next;
    document.getElementById('cfg-fixed-name').value=''; document.getElementById('cfg-fixed-value').value='';
    renderConfigTables();
  });
  document.getElementById('cfg-equip-add-btn').addEventListener('click', async ()=>{
    const name = document.getElementById('cfg-equip-name').value.trim();
    const purchaseValue = parseFloat(document.getElementById('cfg-equip-value').value);
    const wattsRaw = document.getElementById('cfg-equip-watts').value;
    const watts = wattsRaw.trim() === '' ? 0 : parseFloat(wattsRaw); // opcional — itens sem motor/consumo (ex.: acessório) podem deixar em branco
    const maintenanceYear = parseFloat(document.getElementById('cfg-equip-maint').value) || 0;
    const msg = document.getElementById('cfg-equip-add-btn-msg');
    if(!name){ msg.innerHTML = '<div class="msg err">Preencha o nome do equipamento.</div>'; return; }
    if(!Number.isFinite(purchaseValue)||purchaseValue<0||!Number.isFinite(watts)||watts<0||!Number.isFinite(maintenanceYear)||maintenanceYear<0){ msg.innerHTML = '<div class="msg err">Compra, potência e manutenção não podem ser negativas.</div>'; return; }
    msg.innerHTML = '';
    const next=[...CFG.equip,{name,purchaseValue,watts,maintenanceYear}];await setJSON('custos_equip',next);CFG.equip=next;
    document.getElementById('cfg-equip-name').value=''; document.getElementById('cfg-equip-value').value=''; document.getElementById('cfg-equip-watts').value=''; document.getElementById('cfg-equip-maint').value='0';
    renderConfigTables(); populateCalcSelects();
  });
  document.getElementById('cfg-material-add-btn').addEventListener('click', async ()=>{
    const name = document.getElementById('cfg-material-name').value.trim();
    const cost = parseFloat(document.getElementById('cfg-material-cost').value);
    const qty = parseFloat(document.getElementById('cfg-material-qty').value);
    const msg = document.getElementById('cfg-material-add-btn-msg');
    if(!name){ msg.innerHTML = '<div class="msg err">Preencha o nome do material.</div>'; return; }
    if(!Number.isFinite(cost)||cost<0){ msg.innerHTML = '<div class="msg err">Preencha um custo de pacote válido.</div>'; return; }
    if(!Number.isFinite(qty)||qty<=0){ msg.innerHTML = '<div class="msg err">A quantidade do pacote deve ser maior que zero.</div>'; return; }
    msg.innerHTML = '';
    const next=[...CFG.materials,{name,cost,qty}];await setJSON('custos_materials',next);CFG.materials=next;
    document.getElementById('cfg-material-name').value=''; document.getElementById('cfg-material-cost').value='';
    renderConfigTables(); populateCalcSelects();
  });
  document.getElementById('cfg-shipping-add-btn').addEventListener('click', async ()=>{
    const name = document.getElementById('cfg-shipping-name').value.trim();
    const value = parseFloat(document.getElementById('cfg-shipping-value').value);
    const msg = document.getElementById('cfg-shipping-add-btn-msg');
    if(!name){ msg.innerHTML = '<div class="msg err">Preencha o nome da opção de envio.</div>'; return; }
    if(!Number.isFinite(value)||value<0){ msg.innerHTML = '<div class="msg err">Preencha um valor de frete válido.</div>'; return; }
    msg.innerHTML = '';
    const next=[...CFG.shipping,{name,value}];await setJSON('custos_shipping',next);CFG.shipping=next;
    document.getElementById('cfg-shipping-name').value=''; document.getElementById('cfg-shipping-value').value='';
    renderConfigTables(); populateCalcSelects();
  });
  document.getElementById('cfg-extra-add-btn').addEventListener('click', async ()=>{
    const name = document.getElementById('cfg-extra-name').value.trim();
    const value = parseFloat(document.getElementById('cfg-extra-value').value);
    const msg = document.getElementById('cfg-extra-add-btn-msg');
    if(!name){ msg.innerHTML = '<div class="msg err">Preencha o nome do item.</div>'; return; }
    if(!Number.isFinite(value)||value<0){ msg.innerHTML = '<div class="msg err">Preencha um valor unitário válido.</div>'; return; }
    msg.innerHTML = '';
    const next=[...CFG.extras,{name,value}];await setJSON('custos_extras',next);CFG.extras=next;
    document.getElementById('cfg-extra-name').value=''; document.getElementById('cfg-extra-value').value='';
    renderConfigTables(); populateCalcSelects();
  });
  ['cfg-energy-kwh','cfg-payback-months','cfg-depreciation-pct','cfg-fixed-hours-base'].forEach(id=>{
    document.getElementById(id).addEventListener('change', async ()=>{
      const next={
        energyKwh:parseFloat(document.getElementById('cfg-energy-kwh').value),
        paybackMonths:parseFloat(document.getElementById('cfg-payback-months').value),
        depreciationPct:parseFloat(document.getElementById('cfg-depreciation-pct').value),
        fixedHoursBase:parseFloat(document.getElementById('cfg-fixed-hours-base').value)
      };
      if(!Number.isFinite(next.energyKwh)||next.energyKwh<0||!Number.isFinite(next.paybackMonths)||next.paybackMonths<=0||!Number.isFinite(next.depreciationPct)||next.depreciationPct<0||!Number.isFinite(next.fixedHoursBase)||next.fixedHoursBase<=0){alert('Revise os valores: energia e depreciação não podem ser negativas; meses e horas devem ser maiores que zero.');renderConfigTables();return;}
      await setJSON('custos_globals',next);CFG.globals=next;
      renderConfigTables(); updateCalcSummary();
    });
  });

  // ============================================================
  // CALCULADORA
  // ============================================================
  function populateCalcSelects(){
    const equipSel = document.getElementById('calc-equip');
    equipSel.innerHTML = '<option value="">— nenhum —</option>' + CFG.equip.map((e,i)=>`<option value="${i}">${escapeHtml(e.name)} (${fmtMoney(equipHourlyRate(e))}/h)</option>`).join('');
    const materialSel = document.getElementById('calc-material');
    materialSel.innerHTML = '<option value="">— nenhum —</option>' + CFG.materials.map((m,i)=>`<option value="${i}">${escapeHtml(m.name)} (${fmtMoney(materialUnitCost(m))}/g)</option>`).join('');
    const bambuIdx = CFG.equip.findIndex(e=>/bambu/i.test(e.name||''));
    if(bambuIdx>=0) equipSel.value=String(bambuIdx);
    const plaIdx = CFG.materials.findIndex(m=>/^pla\b/i.test((m.name||'').trim()));
    if(plaIdx>=0) materialSel.value=String(plaIdx);
    const shippingSel = document.getElementById('calc-shipping');
    shippingSel.innerHTML = '<option value="">— combinar com o cliente —</option>' + CFG.shipping.map((s,i)=>`<option value="${i}">${escapeHtml(s.name)} (${fmtMoney(s.value)})</option>`).join('');
    const extraSel = document.getElementById('calc-extra');
    if(savedCalcRates) installCalcSavedOptions();
    extraSel.innerHTML = CFG.extras.map((x,i)=>`<option value="${i}">${escapeHtml(x.name)} (${fmtMoney(x.value)})</option>`).join('') || '<option value="">Cadastre extras em Configurações</option>';
  }

  document.getElementById('calc-add-extra-btn').addEventListener('click', ()=>{
    const idx = document.getElementById('calc-extra').value;
    const qty = parseFloat(document.getElementById('calc-extra-qty').value);
    if(idx === '' || !Number.isFinite(qty) || qty<=0){
      document.getElementById('calc-history-message').innerHTML='<div class="msg err">Informe uma quantidade de extra maior que zero.</div>';
      return;
    }
    const item = CFG.extras[idx];
    calcExtrasCart.push({ name:item.name, qty, unitValue:item.value });
    renderCalcExtras();
    document.getElementById('calc-extra-qty').value = '';
  });
  function renderCalcExtras(){
    document.getElementById('calc-extras-list').innerHTML = calcExtrasCart.map((x,i)=>`
      <div class="list-row"><span>${x.qty}x ${escapeHtml(x.name)} — ${fmtMoney(x.qty*x.unitValue)}</span>
      <span class="actions"><button data-del-calc-extra="${i}">Remover</button></span></div>
    `).join('');
    document.querySelectorAll('[data-del-calc-extra]').forEach(b=>b.addEventListener('click', ()=>{
      calcExtrasCart.splice(+b.dataset.delCalcExtra,1); renderCalcExtras(); updateCalcSummary();
    }));
    updateCalcSummary();
  }

  function computeCalc(){
    const equipIdx = document.getElementById('calc-equip').value;
    const equipHours = Math.max(0,parseFloat(document.getElementById('calc-equip-hours').value)||0);
    const equipCost = calcSelectedRate('equip').rate * equipHours;

    const materialIdx = document.getElementById('calc-material').value;
    const materialQty = Math.max(0,parseFloat(document.getElementById('calc-material-qty').value)||0);
    const materialCost = calcSelectedRate('material').rate * materialQty;

    const shippingIdx = document.getElementById('calc-shipping').value;
    const shippingCost = calcSelectedRate('shipping').rate;

    const extrasCost = calcExtrasCart.reduce((s,x)=>s+x.qty*x.unitValue, 0);

    // sem mão de obra na calculadora, os custos fixos são alocados pelo tempo de produção da máquina
    const fixedCost = (savedCalcRates ? savedCalcRates.fixed : fixedHourlyRate()) * equipHours;

    const custosTotal = equipCost + materialCost + shippingCost + extrasCost + fixedCost;

    const qtyPieces = Math.max(1, Math.floor(parseFloat(document.getElementById('calc-qty-pieces').value)||1));
    const margin = Math.max(0,parseFloat(document.getElementById('calc-margin').value)||0);
    const taxPct = Math.min(99,Math.max(0,parseFloat(document.getElementById('calc-tax').value)||0));
    const safetyPct = Math.max(0,parseFloat(document.getElementById('calc-safety').value)||0);

    // O acréscimo e a segurança incidem apenas na produção; o frete é repassado sem lucro.
    const custoProducao=equipCost+materialCost+extrasCost+fixedCost;
    const subtotalAntesTributo=(custoProducao*(1+margin)*(1+safetyPct/100))+shippingCost;
    // Gross-up: garante que o tributo seja coberto pelo preço final.
    const valorFinal = subtotalAntesTributo/(1-taxPct/100);
    const tributoValor = valorFinal * (taxPct/100);
    const lucro = valorFinal - tributoValor - custosTotal;
    const margemReal = valorFinal>0?(lucro/valorFinal)*100:0;
    const custoPorPeca = custosTotal / qtyPieces;
    const precoPorPeca = valorFinal / qtyPieces;

    return { equipCost, materialCost, shippingCost, extrasCost, fixedCost, custosTotal, custoPorPeca, valorFinal, tributoValor, lucro, margemReal, precoPorPeca, qtyPieces };
  }

  function updateCalcSummary(){
    const r = computeCalc();
    document.getElementById('calc-summary').innerHTML = `
      <div class="summary-row"><span>Equipamento</span><span>${fmtMoney(r.equipCost)}</span></div>
      <div class="summary-row"><span>Material</span><span>${fmtMoney(r.materialCost)}</span></div>
      <div class="summary-row"><span>Custo fixo alocado</span><span>${fmtMoney(r.fixedCost)}</span></div>
      <div class="summary-row"><span>Frete (repassado sem acréscimo)</span><span>${fmtMoney(r.shippingCost)}</span></div>
      <div class="summary-row"><span>Extras</span><span>${fmtMoney(r.extrasCost)}</span></div>
      <div class="summary-row" style="border-top:1px solid var(--line);margin-top:6px;padding-top:8px;"><span>Custos totais</span><span>${fmtMoney(r.custosTotal)}</span></div>
      <div class="summary-row" style="color:var(--teal);"><span>Custo por peça (${r.qtyPieces}x)</span><span><strong>${fmtMoney(r.custoPorPeca)}</strong></span></div>
      <div class="summary-row"><span>Tributo</span><span>${fmtMoney(r.tributoValor)}</span></div>
      <div class="summary-row profit"><span>Lucro estimado</span><span>${fmtMoney(r.lucro)}</span></div>
      <div class="summary-row"><span>Margem real sobre a venda</span><span>${r.margemReal.toFixed(1).replace('.',',')}%</span></div>
      <div class="summary-row big"><span>Valor final (${r.qtyPieces}x)</span><span>${fmtMoney(r.valorFinal)}</span></div>
      <div class="summary-row big" style="color:var(--violet);"><span>Preço por peça</span><span>${fmtMoney(r.precoPorPeca)}</span></div>
    `;
  }
  ['calc-equip','calc-equip-hours','calc-material','calc-material-qty','calc-shipping','calc-qty-pieces','calc-margin','calc-tax','calc-safety'].forEach(id=>{
    document.getElementById(id).addEventListener('input', updateCalcSummary);
    document.getElementById(id).addEventListener('change', updateCalcSummary);
  });

  document.getElementById('calc-to-orcamento-btn').addEventListener('click', ()=>{
    const r = computeCalc();
    const materialIdx = document.getElementById('calc-material').value;
    const materialName = calcSelectedRate('material').name || 'Peça';
    const productName = document.getElementById('calc-product-name').value.trim();
    const productDetails = document.getElementById('calc-product-details').value.trim();
    if(!productName){ alert('Informe o nome do produto antes de enviá-lo ao orçamento.'); document.getElementById('calc-product-name').focus(); return; }
    const calcClient = document.getElementById('calc-client').value.trim();
    const quoteClient = document.getElementById('orc-client-name');
    if(calcClient && quoteClient.value.trim() && quoteClient.value.trim() !== calcClient){
      if(!confirm('O orçamento aberto está em nome de outra pessoa. Adicionar o item e manter o cliente atual?')) return;
    }else if(calcClient){ quoteClient.value = calcClient; }
    orcItemsCart.push({ desc: productName, details: productDetails || `Produção em 3D · Material: ${materialName}`, unit:'un.', qty: r.qtyPieces, unitValue: r.precoPorPeca, source:'calculadora' });
    switchView('orcamentos');
    renderOrcItems();
  });

  const CALC_HISTORY_KEY = 'custos_calculos_salvos';
  const calcInputIds = ['calc-product-name','calc-client','calc-product-details','calc-equip-hours','calc-material-qty','calc-qty-pieces','calc-margin','calc-tax','calc-safety'];
  function calcSelectedRate(kind){
    const value = document.getElementById('calc-'+kind).value;
    if(value === 'saved' && savedCalcRates) return savedCalcRates[kind];
    const list = kind==='equip'?CFG.equip:kind==='material'?CFG.materials:CFG.shipping;
    const item = value!=='' ? list[value] : null;
    return item ? {name:item.name, rate:kind==='equip'?equipHourlyRate(item):kind==='material'?materialUnitCost(item):Number(item.value)} : {name:'',rate:0};
  }
  function installCalcSavedOptions(){
    ['equip','material','shipping'].forEach(kind=>{
      const select=document.getElementById('calc-'+kind), rate=savedCalcRates[kind];
      select.querySelectorAll('option[value="saved"]').forEach(o=>o.remove());
      const option=document.createElement('option'); option.value='saved';
      option.textContent=(rate.name||'Nenhum')+' · valor salvo: '+fmtMoney(rate.rate)+(kind==='equip'?'/h':kind==='material'?'/g':'');
      select.appendChild(option); select.value='saved';
    });
  }
  function calcHistoryMessage(text, error=false){
    const box=document.getElementById('calc-history-message');
    box.className='msg '+(error?'err':'ok'); box.textContent=text;
  }
  async function readCalcHistory(){
    const value=await getJSON(CALC_HISTORY_KEY,[]);
    if(!Array.isArray(value))throw new Error('O histórico está em formato inesperado. Nenhum dado foi alterado.');
    return value;
  }
  async function refreshCalcHistory(){
    try{ CALCULOS=await readCalcHistory(); renderCalcHistory(); }
    catch(e){ calcHistoryMessage(e.message,true); }
  }
  function calcHistoryRows(){
    const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
    const query=norm(document.getElementById('calc-history-search').value), sort=document.getElementById('calc-history-sort').value;
    return CALCULOS.filter(r=>norm([r.inputs['calc-product-name'],r.inputs['calc-client'],r.inputs['calc-product-details']].join(' ')).includes(query)).sort((a,b)=>{
      const compare=(x,y)=>String(x||'').localeCompare(String(y||''),'pt-BR',{sensitivity:'base',numeric:true});
      if(sort==='name'||sort==='name-desc') return compare(a.inputs['calc-product-name'],b.inputs['calc-product-name'])*(sort==='name-desc'?-1:1);
      if(sort==='client') return compare(a.inputs['calc-client'],b.inputs['calc-client']);
      if(sort.startsWith('price')) return (a.result.precoPorPeca-b.result.precoPorPeca)*(sort.endsWith('desc')?-1:1);
      if(sort.startsWith('total')) return (a.result.valorFinal-b.result.valorFinal)*(sort.endsWith('desc')?-1:1);
      return compare(b.updatedAt,a.updatedAt);
    });
  }
  function renderCalcHistory(){
    const rows=calcHistoryRows();
    document.getElementById('calc-history-count').textContent=rows.length+' de '+CALCULOS.length+' cálculo(s)';
    document.getElementById('calc-client-options').innerHTML=[...new Set(CALCULOS.map(r=>r.inputs['calc-client']).filter(Boolean))].map(n=>'<option value="'+escapeHtml(n)+'"></option>').join('');
    document.getElementById('calc-history-body').innerHTML=rows.map(r=>`<tr>
      <td title="Última atualização">${escapeHtml(new Date(r.updatedAt).toLocaleDateString('pt-BR'))}</td>
      <td><strong>${escapeHtml(r.inputs['calc-product-name'])}</strong><div class="hint">${escapeHtml(r.inputs['calc-product-details'])}</div></td>
      <td>${escapeHtml(r.inputs['calc-client']||'Não informado')}</td><td>${r.result.qtyPieces}</td>
      <td>${fmtMoney(r.result.custosTotal)}</td><td>${fmtMoney(r.result.custoPorPeca!=null?r.result.custoPorPeca:r.result.custosTotal/Math.max(1,r.result.qtyPieces||1))}</td><td>${fmtMoney(r.result.precoPorPeca)}</td><td><strong>${fmtMoney(r.result.valorFinal)}</strong></td>
      <td><button type="button" class="btn secondary small" data-edit-calc="${escapeHtml(r.id)}">Consultar / editar</button></td></tr>`).join('')||'<tr><td colspan="9">'+(CALCULOS.length?'Nenhum cálculo corresponde à busca.':'Nenhum cálculo salvo. Preencha a calculadora e clique em Salvar cálculo.')+'</td></tr>';
    document.querySelectorAll('[data-edit-calc]').forEach(btn=>btn.addEventListener('click',()=>openSavedCalc(btn.dataset.editCalc)));
  }
  function openSavedCalc(id){
    if(calcHistoryBusy) return;
    if(editingCalcId && !confirm('Abrir outro cálculo? Alterações ainda não salvas no formulário serão descartadas.')) return;
    const r=CALCULOS.find(x=>x.id===id); if(!r) return;
    editingCalcId=id; savedCalcRates=JSON.parse(JSON.stringify(r.rates));
    calcInputIds.forEach(key=>document.getElementById(key).value=r.inputs[key]??'');
    installCalcSavedOptions(); calcExtrasCart=JSON.parse(JSON.stringify(r.extras)); renderCalcExtras();
    document.getElementById('calc-save-btn').textContent='Salvar alterações';
    document.getElementById('calc-current-rates-btn').style.display='';
    const notice=document.getElementById('calc-edit-notice');notice.style.display='';
    notice.textContent='Editando cálculo salvo. Valores originais de máquina, material, frete, extras e custo fixo foram preservados. Use “Usar custos atuais” para atualizar a base. A lista só muda após salvar.';
    calcHistoryMessage('Cálculo carregado para consulta ou edição.');
    document.getElementById('calc-product-name').scrollIntoView({behavior:'smooth',block:'center'});
  }
  document.getElementById('calc-save-btn').addEventListener('click',async()=>{
    if(calcHistoryBusy) return;
    const inputs=Object.fromEntries(calcInputIds.map(id=>[id,document.getElementById(id).value.trim()]));
    if(!inputs['calc-product-name']){calcHistoryMessage('Informe o nome do produto para salvar.',true);document.getElementById('calc-product-name').focus();return;}
    for(const id of calcInputIds.slice(3)){
      const el=document.getElementById(id);
      if(!el.value || !Number.isFinite(Number(el.value)) || Number(el.value)<Number(el.min||0)){
        calcHistoryMessage('Preencha os valores numéricos com números válidos, sem valores negativos.',true);el.focus();return;
      }
    }
    const result=computeCalc();
    if(Object.values(result).some(v=>!Number.isFinite(v))){calcHistoryMessage('Revise os custos cadastrados antes de salvar.',true);return;}
    const rates={equip:calcSelectedRate('equip'),material:calcSelectedRate('material'),shipping:calcSelectedRate('shipping'),fixed:savedCalcRates?savedCalcRates.fixed:fixedHourlyRate()};
    const extras=JSON.parse(JSON.stringify(calcExtrasCart));
    calcHistoryBusy=true;const btn=document.getElementById('calc-save-btn');btn.disabled=true;
    try{
      const latest=await readCalcHistory(), existing=latest.find(r=>r.id===editingCalcId);
      if(editingCalcId && !existing) throw new Error('Este cálculo não está mais no histórico. Atualize a lista antes de continuar.');
      const loaded=CALCULOS.find(r=>r.id===editingCalcId);
      if(existing && loaded && loaded.updatedAt!==existing.updatedAt) throw new Error('Este cálculo foi alterado em outra sessão. Atualize a lista e abra novamente antes de editar.');
      const now=new Date().toISOString();
      const record={id:existing?existing.id:crypto.randomUUID(),createdAt:existing?existing.createdAt:now,updatedAt:now,inputs,rates,extras,result};
      const next=existing?latest.map(r=>r.id===existing.id?record:r):[record,...latest];
      if(!await setJSON(CALC_HISTORY_KEY,next)) throw new Error('Não foi possível salvar. Os dados continuam no formulário; tente novamente.');
      CALCULOS=next;editingCalcId=record.id;savedCalcRates=JSON.parse(JSON.stringify(record.rates));installCalcSavedOptions();renderCalcHistory();btn.textContent='Salvar alterações';
      document.getElementById('calc-current-rates-btn').style.display='';
      calcHistoryMessage('Cálculo salvo com sucesso. Você pode consultá-lo na lista abaixo. Para outro produto, clique em Novo cálculo.');
    }catch(e){calcHistoryMessage(e.message||'Falha ao salvar o cálculo.',true);}
    finally{calcHistoryBusy=false;btn.disabled=false;}
  });
  document.getElementById('calc-new-btn').addEventListener('click',()=>{
    if(calcHistoryBusy)return;
    if(!confirm('Limpar o formulário? Alterações não salvas serão descartadas. Os cálculos já salvos serão mantidos.'))return;
    editingCalcId=null;savedCalcRates=null;
    calcInputIds.forEach(id=>{const el=document.getElementById(id);el.value=el.defaultValue;});
    calcExtrasCart=[];populateCalcSelects();renderCalcExtras();
    document.getElementById('calc-save-btn').textContent='Salvar cálculo';
    document.getElementById('calc-edit-notice').style.display='none';
    document.getElementById('calc-current-rates-btn').style.display='none';
    calcHistoryMessage('Novo cálculo. Preencha os dados e salve quando estiver pronto.');
  });
  document.getElementById('calc-current-rates-btn').addEventListener('click',()=>{
    if(calcHistoryBusy)return;
    if(!confirm('Recalcular com os custos atuais? O valor salvo só será substituído quando você salvar as alterações.'))return;
    const names=Object.fromEntries(['equip','material','shipping'].map(k=>[k,calcSelectedRate(k).name]));
    savedCalcRates=null;populateCalcSelects();const missing=[];
    ['equip','material','shipping'].forEach(kind=>{
      const list=kind==='equip'?CFG.equip:kind==='material'?CFG.materials:CFG.shipping;
      const index=list.findIndex(r=>r.name===names[kind]);
      document.getElementById('calc-'+kind).value=index>=0?String(index):'';
      if(names[kind] && index<0)missing.push(names[kind]);
    });
    calcExtrasCart=calcExtrasCart.map(x=>{const current=CFG.extras.find(e=>e.name===x.name);if(!current)missing.push(x.name+' (extra mantido pelo valor salvo)');return current?{...x,unitValue:Number(current.value)}:x;});
    renderCalcExtras();document.getElementById('calc-edit-notice').textContent='Base atual aplicada. Confira os dados antes de salvar.';
    calcHistoryMessage(missing.length?'Confira os itens não encontrados no cadastro atual: '+missing.join(', '):'Custos atuais aplicados. Confira o resultado antes de salvar.',missing.length>0);
  });
  document.getElementById('calc-history-search').addEventListener('input',renderCalcHistory);
  document.getElementById('calc-history-sort').addEventListener('change',renderCalcHistory);
  document.getElementById('calc-history-refresh').addEventListener('click',refreshCalcHistory);

  // ---------- Pedidos de orçamento (pré-proposta, sem valores) ----------
  const SOL_KEY='pedidos_orcamento';
  const solFields=['date','client','contact','channel','title','qty','description','reference','status','priority','followup','needed','notes'];
  const solStages=['Em busca','Localizado','Aguardando retorno','Cancelado'];
  function localRequestDate(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
  function requestMessage(text,error=false){const el=document.getElementById('sol-msg');el.className='msg '+(error?'err':'ok');el.textContent=text;}
  async function requestRead(key){
    const value=await getJSON(key,[]);
    if(!Array.isArray(value))throw new Error('Dados em formato inesperado. Nenhum registro foi alterado.');
    return value;
  }
  async function refreshRequests(){
    try{const [s,o,p]=await Promise.all([requestRead(SOL_KEY),requestRead('orcamentos'),requestRead('producao_pedidos')]);SOLICITACOES=s;ORCAMENTOS=o;PEDIDOS=p;renderRequests();renderOrcamentos();}
    catch(e){requestMessage(e.message,true);}
  }
  function linkedRequestQuotes(r){return ORCAMENTOS.filter(o=>o.sourceRequestId===r.id);}
  function requestStatus(r){
    const quotes=linkedRequestQuotes(r);
    if(PEDIDOS.some(p=>p.sourceRequestId===r.id||quotes.some(o=>p.orcamentoId===o.id))||quotes.some(o=>o.convertedToPedido))return 'Aceito / produção';
    if(r.status==='Cancelado')return 'Cancelado';
    if(quotes.length)return 'Orçamento preparado';
    return r.status||'Em busca';
  }
  function requestQuoteNotice(){
    const el=document.getElementById('orc-request-notice'),r=SOLICITACOES.find(x=>x.id===sourceRequestId);
    el.textContent=r?`Origem: ${r.code} · ${r.title}. Confira descrição, quantidade e preço antes de adicionar o item. As anotações internas não serão incluídas no PDF.`:'';
    el.style.display=r?'':'none';
  }
  function resetRequestForm(){
    editingRequestId=null;editingRequestVersion=null;
    solFields.forEach(k=>{const el=document.getElementById('sol-'+k);el.value=k==='date'?localRequestDate():k==='qty'?'1':k==='status'?'Em busca':k==='priority'?'Normal':k==='channel'?'WhatsApp':'';});
    document.getElementById('sol-save').textContent='Salvar solicitação';document.getElementById('sol-edit-notice').textContent='';
  }
  function editRequest(id){
    if(requestBusy)return;
    if(editingRequestId&&!confirm('Abrir esta solicitação? Alterações não salvas serão descartadas.'))return;
    const r=SOLICITACOES.find(x=>x.id===id);if(!r)return;
    editingRequestId=id;editingRequestVersion=r.updatedAt;
    solFields.forEach(k=>document.getElementById('sol-'+k).value=r[k]??'');
    document.getElementById('sol-save').textContent='Salvar alterações';
    document.getElementById('sol-edit-notice').textContent=`Editando ${r.code}. Situação: ${requestStatus(r)}. Alterações aqui não modificam propostas já salvas.`;
    document.getElementById('sol-client').scrollIntoView({behavior:'smooth',block:'center'});
  }
  function safeRequestURL(value){try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)?u.href:'';}catch(e){return '';}}
  function requestRows(){
    const normalize=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
    const query=normalize(document.getElementById('sol-search').value),filter=document.getElementById('sol-filter').value,sort=document.getElementById('sol-sort').value;
    return SOLICITACOES.filter(r=>(!filter||requestStatus(r)===filter)&&normalize([r.code,r.client,r.title,r.description,r.notes,r.contact].join(' ')).includes(query)).sort((a,b)=>{
      if(sort==='client')return a.client.localeCompare(b.client,'pt-BR',{sensitivity:'base'});
      if(sort==='priority'){const rank={Alta:0,Normal:1,Baixa:2};return rank[a.priority]-rank[b.priority]||b.date.localeCompare(a.date);}
      if(sort==='followup')return (a.followup||'9999').localeCompare(b.followup||'9999');
      return b.date.localeCompare(a.date)||b.createdAt.localeCompare(a.createdAt);
    });
  }
  function renderRequests(){
    const rows=requestRows(),today=localRequestDate();
    const pending=SOLICITACOES.filter(r=>r.followup&&r.followup<=today&&!['Cancelado','Aceito / produção'].includes(requestStatus(r))).length;
    document.getElementById('sol-count').textContent=`${rows.length} de ${SOLICITACOES.length} solicitação(ões) · ${pending} retorno(s) para hoje ou em atraso. As datas são lembretes visuais no portal.`;
    document.getElementById('sol-list').innerHTML=rows.map(r=>{
      const status=requestStatus(r),quotes=linkedRequestQuotes(r),url=safeRequestURL(r.reference),due=r.followup&&r.followup<=today&&!['Cancelado','Aceito / produção'].includes(status);
      const tag=status==='Aceito / produção'?'pago':status==='Localizado'||status==='Orçamento preparado'?'concluido':status==='Aguardando retorno'?'producao':'pendente';
      return `<div class="quote-saved"><div class="quote-saved-head"><div><strong>${escapeHtml(r.code)} · ${escapeHtml(r.title)}</strong><div class="quote-saved-meta">${escapeHtml(r.client)} · ${fmtDate(r.date)} · ${Number(r.qty)} un. · ${escapeHtml(r.channel)}</div></div><span class="tag ${tag}">${escapeHtml(status)}</span></div>
      <p class="hint">Prioridade: ${escapeHtml(r.priority)}${r.followup?` · Retorno: ${fmtDate(r.followup)}${due?' — acompanhar':''}`:''}${r.needed?` · Data desejada: ${fmtDate(r.needed)}`:''}</p>
      <details><summary style="cursor:pointer;">Ver solicitação e anotações</summary><p style="white-space:pre-wrap;overflow-wrap:anywhere;">${escapeHtml(r.description)}</p><p>Contato: ${escapeHtml(r.contact||'Não informado')}</p>${url?`<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Abrir referência</a>`:''}${r.notes?`<p class="hint" style="white-space:pre-wrap;overflow-wrap:anywhere;">Anotações internas: ${escapeHtml(r.notes)}</p>`:''}</details>
      <div class="actions" style="margin-top:12px;display:flex;gap:10px;flex-wrap:wrap;"><button type="button" data-edit-request="${r.id}">Editar</button>${quotes.map(o=>`<button type="button" data-open-request-quote="${escapeHtml(o.id)}">Ver ${escapeHtml(o.id)}</button>`).join('')}${!quotes.length&&status!=='Cancelado'&&status!=='Aceito / produção'?`<button type="button" data-quote-request="${r.id}">Preparar orçamento →</button>`:''}</div></div>`;
    }).join('')||'<div class="empty">'+(SOLICITACOES.length?'Nenhuma solicitação corresponde aos filtros.':'Nenhuma solicitação cadastrada. Registre acima o primeiro pedido, sem precisar informar preço.')+'</div>';
    document.querySelectorAll('[data-edit-request]').forEach(b=>b.addEventListener('click',()=>editRequest(b.dataset.editRequest)));
    document.querySelectorAll('[data-quote-request]').forEach(b=>b.addEventListener('click',()=>prepareRequestQuote(b.dataset.quoteRequest)));
    document.querySelectorAll('[data-open-request-quote]').forEach(b=>b.addEventListener('click',()=>openRequestQuote(b.dataset.openRequestQuote)));
  }
  function openRequestQuote(id){
    root.querySelector('nav button[data-view="orcamentos"]').click();renderOrcamentos();
    document.getElementById('quote-'+id)?.scrollIntoView({behavior:'smooth',block:'center'});
  }
  async function prepareRequestQuote(id){
    if(requestBusy||quoteSaveBusy)return;
    requestBusy=true;
    try{
      const [requests,quotes,orders]=await Promise.all([requestRead(SOL_KEY),requestRead('orcamentos'),requestRead('producao_pedidos')]);
      SOLICITACOES=requests;ORCAMENTOS=quotes;PEDIDOS=orders;
      const r=requests.find(x=>x.id===id);if(!r)throw new Error('Solicitação não encontrada. Atualize a lista.');
      const linked=linkedRequestQuotes(r);if(linked.length){openRequestQuote(linked[linked.length-1].id);return;}
      if(['Cancelado','Aceito / produção'].includes(requestStatus(r)))throw new Error('Esta solicitação está encerrada. Revise seu histórico antes de preparar outra proposta.');
      if((orcItemsCart.length||document.getElementById('orc-client-name').value.trim()||document.getElementById('orc-item-desc').value.trim())&&!confirm('Substituir o rascunho de orçamento aberto? Os orçamentos já salvos serão mantidos.'))return;
      clearOrcamentoForm();sourceRequestId=id;
      document.getElementById('orc-client-name').value=r.client;document.getElementById('orc-client-contact').value=r.contact||'';
      document.getElementById('orc-item-desc').value=r.title;document.getElementById('orc-item-details').value=r.description;
      document.getElementById('orc-item-qty').value=r.qty;document.getElementById('orc-item-value').value='';
      requestQuoteNotice();root.querySelector('nav button[data-view="orcamentos"]').click();document.getElementById('orc-item-value').focus();
    }catch(e){requestMessage(e.message,true);}finally{requestBusy=false;}
  }
  document.getElementById('sol-save').addEventListener('click',async()=>{
    if(requestBusy)return;
    const fields=Object.fromEntries(solFields.map(k=>[k,document.getElementById('sol-'+k).value.trim()]));
    if(!fields.client||!fields.title||!fields.description||!fields.date){requestMessage('Preencha data, cliente, produto e descrição da solicitação.',true);return;}
    if(!/^\d{4}-\d{2}-\d{2}$/.test(fields.date)||!Number.isInteger(Number(fields.qty))||Number(fields.qty)<1||!solStages.includes(fields.status)){requestMessage('Confira a data, a quantidade e a etapa informada.',true);return;}
    if(fields.reference&&!safeRequestURL(fields.reference)){requestMessage('Informe uma referência começando por https:// ou http://.',true);return;}
    fields.qty=Number(fields.qty);requestBusy=true;document.getElementById('sol-save').disabled=true;
    try{
      const latest=await requestRead(SOL_KEY),existing=latest.find(r=>r.id===editingRequestId);
      if(editingRequestId&&(!existing||existing.updatedAt!==editingRequestVersion))throw new Error('Esta solicitação foi alterada ou removida em outra sessão. Atualize a lista e abra novamente.');
      const now=new Date().toISOString();const code=existing?.code||'SOL-'+String(latest.reduce((max,r)=>Math.max(max,Number((r.code||'').split('-')[1])||0),0)+1).padStart(3,'0');
      const record={...fields,id:existing?.id||crypto.randomUUID(),code,createdAt:existing?.createdAt||now,updatedAt:now};
      const next=existing?latest.map(r=>r.id===existing.id?record:r):[...latest,record];
      if(!await setJSON(SOL_KEY,next))throw new Error('Não foi possível salvar. Seus dados continuam no formulário; tente novamente.');
      SOLICITACOES=next;resetRequestForm();renderRequests();requestMessage(`${code} salva com sucesso. Nenhum orçamento ou lançamento financeiro foi criado.`);
    }catch(e){requestMessage(e.message,true);}finally{requestBusy=false;document.getElementById('sol-save').disabled=false;}
  });
  document.getElementById('sol-new').addEventListener('click',()=>{if(requestBusy)return;if(!confirm('Limpar o formulário? Alterações não salvas serão descartadas.'))return;resetRequestForm();requestMessage('Pronto para uma nova solicitação.');});
  document.getElementById('sol-refresh').addEventListener('click',refreshRequests);
  document.getElementById('sol-search').addEventListener('input',renderRequests);
  ['sol-filter','sol-sort'].forEach(id=>document.getElementById(id).addEventListener('change',renderRequests));

  async function acceptRequestQuote(id){
    if(acceptingQuoteBusy)return;
    if(!confirm('O cliente aprovou este orçamento? Confirmar o aceite e enviar à produção?'))return;
    acceptingQuoteBusy=true;
    try{
      const [quotes,orders]=await Promise.all([requestRead('orcamentos'),requestRead('producao_pedidos')]);
      const orc=quotes.find(o=>o.id===id);if(!orc)throw new Error('Orçamento não encontrado. Atualize a lista.');
      let order=orders.find(p=>p.orcamentoId===id);
      if(!order && orc.convertedToPedido)throw new Error('Este orçamento já foi convertido. Verifique a fila antes de criar outro pedido.');
      if(!order){
        const now=new Date().toISOString();
        const orderId=nextSeqId(orders,'PRD');
        order={id:orderId,client:orc.clientName,channel:'',externalOrder:'',priority:'Normal',printer:'',printHours:0,desc:orc.items.map(it=>`${it.qty}x ${it.desc}`).join(', '),items:orc.items.map((it,index)=>({id:`${orderId}-${index+1}`,productName:it.desc,quantity:Number(it.qty)||1,color:it.color||'',details:it.details||'',catalogProductCode:it.productCode||'',done:false})),value:orc.total,status:'Pendente',date:todayISO(),deliveryDate:null,orcamentoId:orc.id,sourceRequestId:orc.sourceRequestId||null,statusHistory:[{type:'status',status:'Pendente',at:now,label:'Pedido incluído'}]};
        if(!await setJSON('producao_pedidos',[...orders,order]))throw new Error('Não foi possível criar o pedido. Nenhum aceite foi registrado.');
        PEDIDOS=[...orders,order];
      }else{PEDIDOS=orders;}
      const next=quotes.map(o=>o.id===id?{...o,convertedToPedido:true}:o);
      const marked=await setJSON('orcamentos',next);ORCAMENTOS=marked?next:quotes;
      renderOrcamentos();renderRequests();renderPedidos();renderRecebimentos();
      alert(marked?`Aceite registrado. Pedido ${order.id} disponível na fila de produção.`:`Pedido ${order.id} criado, mas a marcação do orçamento não foi salva. Tente novamente para sincronizar; o pedido não será duplicado.`);
    }catch(e){alert(e.message);}finally{acceptingQuoteBusy=false;}
  }

  // ============================================================
  // ORÇAMENTOS
  // ============================================================
  function catalogPublicPrice(p, colorName){
    const base = p.publicPrice != null ? Number(p.publicPrice) : Number(p.price)||0;
    const color = colorName ? (p.colors||[]).find(c=>c.name===colorName) : null;
    const promo = color && Number(color.promoPrice)>0 ? Number(color.promoPrice) : Number(p.promoPrice)>0 ? Number(p.promoPrice) : null;
    return promo != null && promo < base ? promo : base;
  }
  function selectedCatalogProduct(){ return PRODUCTS.find(p=>p.code===document.getElementById('orc-catalog-product').value); }
  function populateCatalogProducts(){
    const sel=document.getElementById('orc-catalog-product'); if(!sel) return;
    const active=PRODUCTS.filter(p=>p.active!==false).sort((a,b)=>(a.name||'').localeCompare(b.name||'','pt-BR'));
    sel.innerHTML='<option value="">Selecione um produto...</option>'+active.map(p=>`<option value="${escapeHtml(p.code)}">${escapeHtml(p.name)} · ${escapeHtml(p.code)}</option>`).join('');
    renderCatalogPreview();
  }
  function renderCatalogPreview(){
    const p=selectedCatalogProduct(); const preview=document.getElementById('orc-catalog-preview'); const colorSel=document.getElementById('orc-catalog-color');
    if(!p){ preview.innerHTML=''; colorSel.innerHTML='<option value="">Sem variação</option>'; return; }
    const current=colorSel.value;
    colorSel.innerHTML='<option value="">Sem variação</option>'+(p.colors||[]).map(c=>`<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`).join('');
    if([...colorSel.options].some(o=>o.value===current)) colorSel.value=current;
    const color=(p.colors||[]).find(c=>c.name===colorSel.value); const img=(color&&color.image)||p.image||'';
    const publicValue=catalogPublicPrice(p,colorSel.value); const consignado=Number(p.price)||0;
    const cats=(p.categories||[p.category]).filter(Boolean).join(' · ');
    preview.innerHTML=`<div class="catalog-preview">${img?`<img class="catalog-thumb" src="${escapeHtml(img)}" alt="Imagem de ${escapeHtml(p.name)}">`:'<div class="catalog-thumb" style="display:grid;place-items:center;color:var(--muted);font-size:12px;">sem foto</div>'}<div style="min-width:0;flex:1;"><strong>${escapeHtml(p.name)}</strong><div style="font-size:13px;color:var(--muted);margin-top:2px;">${escapeHtml(cats||p.code)}</div><div class="catalog-price-grid"><span>Portfólio<strong>${fmtMoney(publicValue)}</strong></span><span>Consignante<strong>${fmtMoney(consignado)}</strong></span><span>Variação<strong>${escapeHtml(colorSel.value||'Padrão')}</strong></span></div></div></div>`;
  }
  document.getElementById('orc-catalog-product').addEventListener('change', renderCatalogPreview);
  document.getElementById('orc-catalog-color').addEventListener('change', renderCatalogPreview);
  document.getElementById('orc-catalog-price-type').addEventListener('change', e=>{ document.getElementById('orc-catalog-custom-wrap').style.display=e.target.value==='custom'?'flex':'none'; });
  document.getElementById('orc-add-catalog-btn').addEventListener('click', ()=>{
    const p=selectedCatalogProduct(); if(!p){ document.getElementById('orc-msg').innerHTML='<div class="msg err">Selecione um produto do portfólio.</div>'; return; }
    const color=document.getElementById('orc-catalog-color').value; const priceType=document.getElementById('orc-catalog-price-type').value;
    let unitValue=priceType==='consignado' ? Number(p.price)||0 : catalogPublicPrice(p,color);
    if(priceType==='custom') unitValue=parseFloat(document.getElementById('orc-catalog-custom-price').value);
    if(isNaN(unitValue)){ document.getElementById('orc-msg').innerHTML='<div class="msg err">Informe um valor personalizado válido.</div>'; return; }
    const qty=Math.max(1,parseFloat(document.getElementById('orc-catalog-qty').value)||1); const typedDetails=document.getElementById('orc-catalog-details').value.trim();
    const priceLabel=priceType==='public'?'Preço do portfólio':priceType==='consignado'?'Preço para consignante':'Valor personalizado';
    const details=[color?`Variação: ${color}`:'',typedDetails].filter(Boolean).join(' · ');
    const colorObj=(p.colors||[]).find(c=>c.name===color);
    orcItemsCart.push({desc:p.name,details,unit:'un.',qty,unitValue,productCode:p.code,priceType,priceLabel,image:(colorObj&&colorObj.image)||p.image||'',source:'portfolio'});
    document.getElementById('orc-catalog-details').value=''; document.getElementById('orc-catalog-qty').value='1'; document.getElementById('orc-msg').innerHTML=''; renderOrcItems();
  });

  document.getElementById('orc-add-item-btn').addEventListener('click', ()=>{
    const desc = document.getElementById('orc-item-desc').value.trim();
    const details = document.getElementById('orc-item-details').value.trim();
    const unit = document.getElementById('orc-item-unit').value;
    const qty = parseFloat(document.getElementById('orc-item-qty').value)||1;
    const unitValue = parseFloat(document.getElementById('orc-item-value').value);
    if(!desc || isNaN(unitValue)){ document.getElementById('orc-msg').innerHTML='<div class="msg err">Informe a descrição e o valor do item.</div>'; return; }
    orcItemsCart.push({desc, details, unit, qty, unitValue});
    document.getElementById('orc-item-desc').value=''; document.getElementById('orc-item-details').value=''; document.getElementById('orc-item-value').value='';
    document.getElementById('orc-item-qty').value='1'; document.getElementById('orc-msg').innerHTML='';
    renderOrcItems();
  });
  function renderOrcItems(){
    const list = document.getElementById('orc-items-list');
    const summary = document.getElementById('orc-summary');
    const subtotal = orcItemsCart.reduce((s,it)=>s+Number(it.qty)*Number(it.unitValue),0);
    if(orcItemsCart.length === 0) list.innerHTML='<div class="empty" style="padding:18px;">Nenhum item adicionado.</div>';
    else list.innerHTML = orcItemsCart.map((it,i)=>`
      <div class="quote-item"><div><strong>${escapeHtml(it.desc)}</strong>${it.details ? `<div class="muted">${escapeHtml(it.details)}</div>` : ''}${it.priceLabel ? `<div class="muted" style="color:var(--violet);">${escapeHtml(it.priceLabel)}</div>` : ''}</div><span>${it.qty} ${escapeHtml(it.unit||'un.')}</span><span>${fmtMoney(it.unitValue)}</span><strong>${fmtMoney(it.qty*it.unitValue)}</strong><button class="btn secondary small" data-del-orc-item="${i}" aria-label="Remover item">Remover</button></div>
    `).join('');
    document.querySelectorAll('[data-del-orc-item]').forEach(b=>b.addEventListener('click', ()=>{
      orcItemsCart.splice(+b.dataset.delOrcItem,1); renderOrcItems();
    }));
    summary.innerHTML = `<div class="summary-row"><span>${orcItemsCart.length} ${orcItemsCart.length===1?'item':'itens'}</span><span>${fmtMoney(subtotal)}</span></div><div class="summary-row big"><span>Total</span><span>${fmtMoney(subtotal)}</span></div><p style="font-size:10.5px;color:#aaa3ad;margin:12px 0 0;line-height:1.45;">Valores, condições e prazo serão consolidados no PDF profissional da proposta.</p>`;
  }
  function clearOrcamentoForm(){
    sourceRequestId=null;requestQuoteNotice();
    ['orc-item-desc','orc-item-details','orc-item-value'].forEach(id=>document.getElementById(id).value='');
    document.getElementById('orc-item-qty').value='1';document.getElementById('orc-item-unit').value='un.';
    orcItemsCart = [];
    ['orc-client-name','orc-client-doc','orc-client-contact','orc-client-email','orc-client-address','orc-validity','orc-delivery','orc-payment','orc-shipping-method','orc-notes'].forEach(id=>document.getElementById(id).value='');
    document.getElementById('orc-catalog-product').value=''; document.getElementById('orc-catalog-color').innerHTML='<option value="">Sem variação</option>'; document.getElementById('orc-catalog-price-type').value='public'; document.getElementById('orc-catalog-custom-wrap').style.display='none'; document.getElementById('orc-catalog-preview').innerHTML='';
    renderOrcItems(); document.getElementById('orc-msg').innerHTML='';
  }
  document.getElementById('orc-clear-btn').addEventListener('click', ()=>{
    if(quoteSaveBusy)return;
    if((sourceRequestId||orcItemsCart.length||document.getElementById('orc-client-name').value.trim()) && !confirm('Limpar o orçamento em edição?')) return;
    clearOrcamentoForm();
  });

  async function saveOrcamento(generatePdf){
    if(quoteSaveBusy)return null;
    quoteSaveBusy=true;
    ['orc-save-btn','orc-save-only-btn','orc-clear-btn'].forEach(id=>document.getElementById(id).disabled=true);
    try{ return await persistOrcamento(generatePdf); }
    catch(e){document.getElementById('orc-msg').innerHTML='<div class="msg err">'+escapeHtml(e.message||'Não foi possível salvar o orçamento. Tente novamente.')+'</div>';return null;}
    finally{quoteSaveBusy=false;['orc-save-btn','orc-save-only-btn','orc-clear-btn'].forEach(id=>document.getElementById(id).disabled=false);}
  }
  async function persistOrcamento(generatePdf){
    const clientName = document.getElementById('orc-client-name').value.trim();
    const clientContact = document.getElementById('orc-client-contact').value.trim();
    const clientDoc = document.getElementById('orc-client-doc').value.trim();
    const clientEmail = document.getElementById('orc-client-email').value.trim();
    const clientAddress = document.getElementById('orc-client-address').value.trim();
    const validity = document.getElementById('orc-validity').value.trim();
    const delivery = document.getElementById('orc-delivery').value.trim();
    const payment = document.getElementById('orc-payment').value.trim();
    const shippingMethod = document.getElementById('orc-shipping-method').value.trim();
    const notes = document.getElementById('orc-notes').value.trim();
    const msg = document.getElementById('orc-msg');
    if(!clientName){ msg.innerHTML = '<div class="msg err">Preencha o nome do cliente.</div>'; return null; }
    if(orcItemsCart.length === 0){ msg.innerHTML = '<div class="msg err">Adicione pelo menos um item.</div>'; return null; }
    ORCAMENTOS = await requestRead('orcamentos');
    if(sourceRequestId){
      const requests=await requestRead(SOL_KEY),r=requests.find(x=>x.id===sourceRequestId);
      if(!r||r.status==='Cancelado')throw new Error('A solicitação foi removida ou cancelada. Revise antes de salvar.');
      if(ORCAMENTOS.some(o=>o.sourceRequestId===sourceRequestId))throw new Error('Esta solicitação já tem orçamento salvo. Abra a proposta pela aba Pedidos de orçamento.');
    }
    const id = nextSeqId(ORCAMENTOS, 'ORC');
    const total = orcItemsCart.reduce((s,it)=>s+it.qty*it.unitValue,0);
    const orc = { id, sourceRequestId:sourceRequestId||null, date: todayISO(), clientName, clientContact, clientDoc, clientEmail, clientAddress, validity, delivery, payment, shippingMethod, notes, items: orcItemsCart.slice(), subtotal:total, total };
    const nextQuotes=[...ORCAMENTOS,orc];
    if(!await setJSON('orcamentos', nextQuotes))throw new Error('Não foi possível salvar. O rascunho foi mantido; tente novamente.');
    ORCAMENTOS=nextQuotes;
    clearOrcamentoForm();
    msg.innerHTML = `<div class="msg ok">${generatePdf?'Orçamento salvo e PDF gerado.':'Orçamento salvo com sucesso.'}</div>`;
    renderOrcamentos();renderRequests();
    if(generatePdf){try{gerarPdfOrcamento(orc);}catch(e){msg.innerHTML='<div class="msg err">Orçamento salvo, mas não foi possível gerar o PDF. Use Baixar PDF na lista; não é necessário salvar novamente.</div>';}}
    return orc;
  }
  document.getElementById('orc-save-btn').addEventListener('click', ()=>saveOrcamento(true));
  document.getElementById('orc-save-only-btn').addEventListener('click', ()=>saveOrcamento(false));

  function renderOrcamentos(){
    document.getElementById('orc-list').innerHTML = ORCAMENTOS.length ? ORCAMENTOS.slice().reverse().map(o=>`
      <div class="quote-saved" id="quote-${escapeHtml(o.id)}"><div class="quote-saved-head"><div><strong>${o.id} · ${escapeHtml(o.clientName)}</strong><div class="quote-saved-meta">Emitido em ${fmtDate(o.date)}${o.sourceRequestId?' · Solicitação: '+escapeHtml(SOLICITACOES.find(r=>r.id===o.sourceRequestId)?.code||'vinculada'):''} · ${(o.items||[]).length} ${(o.items||[]).length===1?'item':'itens'} ${o.convertedToPedido ? ' · <span class="tag concluido">pedido criado</span>' : ''}</div></div><div class="quote-saved-total">${fmtMoney(o.total)}</div></div>
        <div class="actions"><button data-pdf-orc="${o.id}">📄 Baixar PDF</button><button data-duplicate-orc="${o.id}">⧉ Duplicar</button>${!o.convertedToPedido ? `<button data-convert-orc="${o.id}">✓ Aceito → Produção</button>` : ''}<button data-del-orc="${o.id}">Remover</button></div>
      </div>
    `).join('') : '<div class="empty">Nenhum orçamento salvo ainda.</div>';

    document.querySelectorAll('[data-pdf-orc]').forEach(b=>b.addEventListener('click', ()=>{
      const orc = ORCAMENTOS.find(o=>o.id===b.dataset.pdfOrc);
      if(orc) gerarPdfOrcamento(orc);
    }));
    document.querySelectorAll('[data-duplicate-orc]').forEach(b=>b.addEventListener('click', ()=>{
      if(quoteSaveBusy)return;
      const o = ORCAMENTOS.find(x=>x.id===b.dataset.duplicateOrc); if(!o) return;
      if((sourceRequestId||orcItemsCart.length)&&!confirm('Substituir o rascunho aberto pela cópia deste orçamento?'))return;
      clearOrcamentoForm();
      document.getElementById('orc-client-name').value=o.clientName||''; document.getElementById('orc-client-doc').value=o.clientDoc||''; document.getElementById('orc-client-contact').value=o.clientContact||''; document.getElementById('orc-client-email').value=o.clientEmail||''; document.getElementById('orc-client-address').value=o.clientAddress||''; document.getElementById('orc-validity').value=o.validity||''; document.getElementById('orc-delivery').value=o.delivery||''; document.getElementById('orc-payment').value=o.payment||''; document.getElementById('orc-shipping-method').value=o.shippingMethod||''; document.getElementById('orc-notes').value=o.notes||'';
      orcItemsCart=(o.items||[]).map(it=>({...it})); renderOrcItems(); window.scrollTo({top:0,behavior:'smooth'});
    }));
    document.querySelectorAll('[data-convert-orc]').forEach(b=>b.addEventListener('click',()=>acceptRequestQuote(b.dataset.convertOrc)));
    document.querySelectorAll('[data-del-orc]').forEach(b=>b.addEventListener('click', async ()=>{
      if(!confirm('Remover este orçamento?'))return;
      try{
        const latest=await requestRead('orcamentos');
        const next=latest.filter(o=>o.id!==b.dataset.delOrc);
        if(!await setJSON('orcamentos',next))throw new Error('Não foi possível remover. Tente novamente.');
        ORCAMENTOS=next;renderOrcamentos();renderRequests();
      }catch(e){alert(e.message);}
    }));
  }

  function fmtDate(iso){ if(!iso) return '—'; const [y,m,d]=iso.split('-'); return `${d}/${m}/${y}`; }

  function gerarPdfOrcamento(orc){
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const pageW = doc.internal.pageSize.getWidth();
    const footer = ()=>{ const h=doc.internal.pageSize.getHeight(); doc.setDrawColor(226,220,207); doc.line(14,h-16,pageW-14,h-16); doc.setFontSize(8); doc.setTextColor(115,110,120); doc.text('HL 3D Solutions  |  (34) 99941-6973  |  hl3dsolutions@gmail.com  |  Uberaba/MG',14,h-10); doc.text(`Proposta ${orc.id}`,pageW-14,h-10,{align:'right'}); };
    doc.setFillColor(10,10,13); doc.rect(0,0,pageW,48,'F');
    [[14,138,150],[105,71,199],[182,46,130],[200,90,40]].forEach((c,i)=>{doc.setFillColor(...c);doc.rect(i*pageW/4,46,pageW/4,2,'F');});
    try{ doc.addImage(LOGO_B64,'JPEG',14,7,34,34); }catch(e){}
    doc.setTextColor(255,255,255); doc.setFont('helvetica','bold'); doc.setFontSize(17); doc.text('PROPOSTA COMERCIAL',56,20);
    doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(205,200,210); doc.text('Soluções personalizadas e impressão 3D',56,27); doc.text('@hl3dsolutions  ·  Uberaba/MG',56,33);
    doc.setFillColor(105,71,199); doc.roundedRect(pageW-54,12,40,22,3,3,'F'); doc.setTextColor(255,255,255); doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.text(orc.id,pageW-34,21,{align:'center'}); doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.text(fmtDate(orc.date),pageW-34,28,{align:'center'});
    let y=59;
    doc.setFillColor(247,244,239); doc.roundedRect(14,y,pageW-28,34,3,3,'F'); doc.setTextColor(105,71,199); doc.setFont('helvetica','bold'); doc.setFontSize(8); doc.text('PREPARADO PARA',20,y+8);
    doc.setTextColor(30,30,30); doc.setFontSize(13); doc.text(orc.clientName||'Cliente',20,y+17);
    doc.setFont('helvetica','normal'); doc.setFontSize(8.5); doc.setTextColor(95,90,100);
    const contact=[orc.clientDoc,orc.clientContact,orc.clientEmail].filter(Boolean).join('  ·  '); if(contact) doc.text(contact,20,y+24);
    if(orc.clientAddress) doc.text(doc.splitTextToSize(orc.clientAddress,pageW-45),20,y+30);
    y+=43;
    const validity=orc.validity||EMPRESA.validade||'A combinar'; const delivery=orc.delivery||EMPRESA.prazo||'A combinar';
    doc.setFontSize(8); doc.setFont('helvetica','bold'); doc.setTextColor(105,71,199); doc.text('VALIDADE',14,y); doc.text('PRAZO DE ENTREGA',78,y); doc.text('FORMA DE ENTREGA',145,y);
    doc.setFont('helvetica','normal'); doc.setTextColor(35,35,35); doc.setFontSize(9); doc.text(validity,14,y+6); doc.text(delivery,78,y+6); doc.text(doc.splitTextToSize(orc.shippingMethod||'A combinar',50),145,y+6); y+=18;
    const rows=(orc.items||[]).map(it=>[`${it.desc}${it.details?'\n'+it.details:''}`,`${it.qty} ${it.unit||'un.'}`,fmtMoney(it.unitValue),fmtMoney(it.qty*it.unitValue)]);
    doc.autoTable({
      startY: y,
      head: [['Produto / serviço','Qtd.','Valor unitário','Subtotal']],
      body: rows,
      theme:'plain',
      headStyles:{fillColor:[22,18,25],textColor:255,fontStyle:'bold',fontSize:9,cellPadding:4},
      styles:{fontSize:9,cellPadding:4,textColor:[30,30,30],lineColor:[226,220,207],lineWidth:{bottom:.2}},
      alternateRowStyles: { fillColor: [247,244,239] },
      columnStyles:{1:{halign:'center',cellWidth:23},2:{halign:'right',cellWidth:34},3:{halign:'right',cellWidth:34}},
      margin:{left:14,right:14,bottom:24}, didDrawPage:footer
    });
    let fy=doc.lastAutoTable.finalY+6; if(fy>238){doc.addPage();fy=22;}
    doc.setFillColor(22,18,25); doc.roundedRect(pageW-86,fy,72,18,3,3,'F'); doc.setTextColor(190,185,195); doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.text('VALOR TOTAL',pageW-80,fy+7); doc.setTextColor(255,255,255); doc.setFont('helvetica','bold'); doc.setFontSize(15); doc.text(fmtMoney(orc.total),pageW-20,fy+12,{align:'right'}); fy+=27;
    const payment=orc.payment||EMPRESA.pagamento; if(payment||EMPRESA.pix){doc.setTextColor(105,71,199);doc.setFont('helvetica','bold');doc.setFontSize(9);doc.text('CONDIÇÕES DE PAGAMENTO',14,fy);doc.setTextColor(40,40,40);doc.setFont('helvetica','normal');doc.setFontSize(9);const lines=doc.splitTextToSize([payment,EMPRESA.pix?`PIX: ${EMPRESA.pix}`:''].filter(Boolean).join('  ·  '),pageW-28);doc.text(lines,14,fy+6);fy+=lines.length*5+11;}
    if(orc.notes){doc.setTextColor(105,71,199);doc.setFont('helvetica','bold');doc.setFontSize(9);doc.text('OBSERVAÇÕES',14,fy);doc.setTextColor(40,40,40);doc.setFont('helvetica','normal');const lines=doc.splitTextToSize(orc.notes,pageW-28);doc.text(lines,14,fy+6);fy+=lines.length*5+12;}
    if(fy<252){doc.setDrawColor(190,185,195);doc.line(14,fy+14,86,fy+14);doc.line(124,fy+14,pageW-14,fy+14);doc.setFontSize(8);doc.setTextColor(100,95,105);doc.text('HL 3D Solutions',50,fy+19,{align:'center'});doc.text('Aceite do cliente',160,fy+19,{align:'center'});}
    for(let p=1;p<=doc.getNumberOfPages();p++){doc.setPage(p);footer();}
    doc.save(`Orcamento_${orc.id}_${(orc.clientName||'cliente').replace(/\s+/g,'_')}.pdf`);
  }

  // ============================================================
  // FILA DE PEDIDOS
  // ============================================================
  const STATUSES = ['Pendente','Em produção','Concluído','Pago'];
  const STAGE_META={
    'Pendente':{slug:'pendente',icon:'●'},
    'Em produção':{slug:'producao',icon:'◆'},
    'Concluído':{slug:'concluido',icon:'✓'},
    'Pago':{slug:'pago',icon:'$'}
  };
  const KANBAN_COLLAPSE_KEY='hl_kanban_collapsed';
  let COLLAPSED_STAGES=new Set();
  const PRODUCTION_FILTERS={search:'',channel:'',priority:'',printer:'',deadline:''};
  try{COLLAPSED_STAGES=new Set(JSON.parse(localStorage.getItem(KANBAN_COLLAPSE_KEY)||'[]'));}catch(e){}
  function saveCollapsedStages(){try{localStorage.setItem(KANBAN_COLLAPSE_KEY,JSON.stringify([...COLLAPSED_STAGES]));}catch(e){}}
  function addDaysISO(base,days){const [y,m,d]=String(base).split('-').map(Number),date=new Date(y,m-1,d);date.setDate(date.getDate()+days);return localISODate(date);}
  function orderPriority(p){return ['Urgente','Normal','Baixa'].includes(p.priority)?p.priority:'Normal';}
  function productionMatchesFilters(p){
    const query=PRODUCTION_FILTERS.search.toLocaleLowerCase('pt-BR').trim(),haystack=[p.client,p.channel,p.externalOrder,p.productName,p.desc,p.color,p.personalization].filter(Boolean).join(' ').toLocaleLowerCase('pt-BR');
    if(query&&!haystack.includes(query))return false;if(PRODUCTION_FILTERS.channel&&p.channel!==PRODUCTION_FILTERS.channel)return false;if(PRODUCTION_FILTERS.priority&&orderPriority(p)!==PRODUCTION_FILTERS.priority)return false;if(PRODUCTION_FILTERS.printer&&(p.printer||'')!==PRODUCTION_FILTERS.printer)return false;
    const deadline=PRODUCTION_FILTERS.deadline,today=todayISO(),tomorrow=addDaysISO(today,1),week=addDaysISO(today,7),date=p.deliveryDate||'';
    if(deadline==='late'&&!isPedidoAtrasado(p))return false;if(deadline==='today'&&date!==today)return false;if(deadline==='tomorrow'&&date!==tomorrow)return false;if(deadline==='week'&&(!date||date<today||date>week))return false;if(deadline==='nodate'&&date)return false;return true;
  }
  function orderPurpose(p){return p.purpose||'Venda';}
  function orderItems(p){
    if(Array.isArray(p.items)&&p.items.length)return p.items;
    return [{id:`${p.id||'item'}-1`,productName:p.productName||p.desc||'Item',quantity:Number(p.quantity)||1,color:p.color||'',details:[p.finish,p.personalization,p.personalizationNotes].filter(Boolean).join(' · '),done:['Concluído','Pago'].includes(p.status)}];
  }
  function orderItemsHtml(p){
    const items=orderItems(p);if(items.length<2)return '';
    return `<div class="order-item-checklist">${items.map((item,index)=>`<button type="button" data-toggle-order-item="${p.id}|${index}" class="order-item-check ${item.done?'done':''}" title="Marcar este item como ${item.done?'pendente':'concluído'}"><span>${item.done?'✓':'○'}</span><span>${escapeHtml(`${item.quantity||1}x ${item.productName||item.desc||'Item'}${item.color?' · '+item.color:''}`)}</span></button>`).join('')}</div>`;
  }
  function orderHistory(p){
    const history=Array.isArray(p.statusHistory)?p.statusHistory.slice():[];
    if(!history.length&&p.date) history.push({type:'status',status:'Pendente',dateOnly:p.date,label:'Pedido incluído — horário não registrado'});
    return history.sort((a,b)=>String(a.at||a.dateOnly||'').localeCompare(String(b.at||b.dateOnly||'')));
  }
  function orderEventDate(event){
    if(event.at){const d=new Date(event.at);if(!Number.isNaN(d.getTime()))return d.toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'});}
    return event.dateOnly?fmtDate(event.dateOnly):'Data não registrada';
  }
  function addOrderEvent(p,event){
    if(!Array.isArray(p.statusHistory))p.statusHistory=[];
    if(!p.statusHistory.length&&p.date)p.statusHistory.push({type:'status',status:'Pendente',dateOnly:p.date,label:'Pedido incluído — horário não registrado'});
    p.statusHistory.push({at:new Date().toISOString(),...event});
  }
  async function changeOrderStatus(id,newStatus){
    const latest=await getJSON('producao_pedidos',PEDIDOS),p=latest.find(x=>x.id===id);
    if(!p)throw new Error('Pedido não encontrado. Atualize a fila.');
    if(p.status===newStatus)return p;
    const previous=p.status||'Pendente';p.status=newStatus;p.archivedAt=null;const now=new Date().toISOString();if(newStatus==='Em produção'&&!p.productionStartedAt)p.productionStartedAt=now;if(newStatus==='Concluído')p.completedAt=now;if(newStatus==='Pago')p.paidAt=now;
    addOrderEvent(p,{type:'status',status:newStatus,label:`Etapa alterada: ${previous} → ${newStatus}`});
    if(!await setJSON('producao_pedidos',latest))throw new Error('Não foi possível alterar a etapa. Tente novamente.');
    PEDIDOS=latest;renderPedidos();return p;
  }
  async function archiveFinishedOrder(id){
    const latest=await getJSON('producao_pedidos',PEDIDOS),p=latest.find(x=>x.id===id);
    if(!p)throw new Error('Pedido não encontrado. Atualize a fila.');
    const canArchive=orderPurpose(p)==='Venda'?p.status==='Pago':p.status==='Concluído';
    if(!canArchive)throw new Error(orderPurpose(p)==='Venda'?'Somente vendas pagas podem ser arquivadas.':'Brindes e itens de uso próprio podem ser arquivados após a conclusão.');
    if(p.archivedAt)return;
    p.archivedAt=new Date().toISOString();addOrderEvent(p,{type:'archive',status:p.status,label:'Finalizado, retirado da fila e mantido no histórico'});
    if(!await setJSON('producao_pedidos',latest))throw new Error('Não foi possível arquivar. Tente novamente.');
    PEDIDOS=latest;renderPedidos();
  }
  async function restoreArchivedOrder(id){
    const latest=await getJSON('producao_pedidos',PEDIDOS),p=latest.find(x=>x.id===id);
    if(!p)throw new Error('Pedido não encontrado. Atualize o histórico.');
    if(!p.archivedAt)return;
    p.archivedAt=null;addOrderEvent(p,{type:'restore',status:p.status||'Pago',label:'Reexibido na fila'});
    if(!await setJSON('producao_pedidos',latest))throw new Error('Não foi possível reexibir. Tente novamente.');
    PEDIDOS=latest;renderPedidos();
  }
  let selectedPedColor='',editingProductionOrderId=null;
  function switchPedFormTab(tab){
    root.querySelectorAll('[data-ped-tab]').forEach(button=>{const active=button.dataset.pedTab===tab;button.classList.toggle('active',active);button.setAttribute('aria-selected',String(active));});
    root.querySelectorAll('[data-ped-panel]').forEach(panel=>panel.classList.toggle('active',panel.dataset.pedPanel===tab));
  }
  root.querySelectorAll('[data-ped-tab]').forEach(button=>button.addEventListener('click',()=>switchPedFormTab(button.dataset.pedTab)));
  function populateProductionCatalog(){
    const select=document.getElementById('ped-catalog-product');if(!select)return;
    const current=select.value,active=(Array.isArray(PRODUCTS)?PRODUCTS:[]).filter(p=>p.active!==false).sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'pt-BR'));
    select.innerHTML='<option value="">Produto manual</option>'+active.map(p=>`<option value="${escapeHtml(p.code)}">${escapeHtml(p.name)} · ${escapeHtml(p.code)}</option>`).join('');
    if(active.some(p=>p.code===current))select.value=current;
    const printer=document.getElementById('ped-printer'),printerFilter=document.getElementById('ped-filter-printer'),names=(CFG.equip||[]).map(item=>item.name).filter(Boolean),currentPrinter=printer.value,currentFilter=printerFilter.value;
    printer.innerHTML='<option value="">Definir depois</option>'+names.map(name=>`<option>${escapeHtml(name)}</option>`).join('');printerFilter.innerHTML='<option value="">Todas as impressoras</option>'+names.map(name=>`<option>${escapeHtml(name)}</option>`).join('');if(names.includes(currentPrinter))printer.value=currentPrinter;if(names.includes(currentFilter))printerFilter.value=currentFilter;
    const channelFilter=document.getElementById('ped-filter-channel'),channels=[...new Set(PEDIDOS.map(p=>p.channel).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR')),currentChannel=channelFilter.value;channelFilter.innerHTML='<option value="">Todos os canais</option>'+channels.map(name=>`<option>${escapeHtml(name)}</option>`).join('');if(channels.includes(currentChannel))channelFilter.value=currentChannel;
  }
  document.getElementById('ped-catalog-product').addEventListener('change',event=>{
    const product=(PRODUCTS||[]).find(p=>p.code===event.target.value);if(!product)return;
    document.getElementById('ped-product').value=product.name||'';
    const price=Number(product.publicPrice||product.price||0);if(price>0)document.getElementById('ped-value').value=price.toFixed(2);
    const first=(product.colors||[]).find(c=>Number(c.stock)>0)||(product.colors||[])[0];
    if(first){selectedPedColor=first.name||'';document.getElementById('ped-color-custom').value=selectedPedColor;root.querySelectorAll('[data-ped-color]').forEach(item=>item.classList.toggle('selected',item.dataset.pedColor===selectedPedColor));}
    updatePedFormSummary();
  });
  root.querySelectorAll('[data-ped-color]').forEach(button=>button.addEventListener('click',()=>{
    selectedPedColor=button.dataset.pedColor;document.getElementById('ped-color-custom').value='';
    root.querySelectorAll('[data-ped-color]').forEach(item=>item.classList.toggle('selected',item===button));updatePedFormSummary();
  }));
  document.getElementById('ped-color-custom').addEventListener('input',event=>{if(event.target.value.trim()){selectedPedColor='';root.querySelectorAll('[data-ped-color]').forEach(item=>item.classList.remove('selected'));}updatePedFormSummary();});
  function productionColor(){return document.getElementById('ped-color-custom').value.trim()||selectedPedColor;}
  function productionDescription(data){
    const main=`${data.qty>1?data.qty+'x ':''}${data.productName}`;
    return [main,data.color?`cor ${data.color}`:'',data.finish?`acabamento ${data.finish}`:'',data.personalization?`personalização: ${data.personalization}`:'',data.letterStyle||'',data.personalizationNotes||'',data.notes||''].filter(Boolean).join(' · ');
  }
  function updatePedFormSummary(){
    const product=document.getElementById('ped-product').value.trim(),qty=Math.max(1,parseInt(document.getElementById('ped-qty').value)||1),color=productionColor(),personalization=document.getElementById('ped-personalization').value.trim();
    document.getElementById('ped-form-summary').textContent=product?[`${qty}x ${product}`,color&&`cor ${color}`,personalization&&`personalizado: ${personalization}`].filter(Boolean).join(' · '):'Preencha ao menos o nome do produto.';
  }
  ['ped-product','ped-qty','ped-personalization'].forEach(id=>document.getElementById(id).addEventListener('input',updatePedFormSummary));
  function resetPedForm(){
    ['ped-client','ped-external-order','ped-product','ped-value','ped-cost','ped-delivery','ped-desc','ped-color-custom','ped-finish','ped-personalization','ped-personalization-notes','ped-print-hours'].forEach(id=>document.getElementById(id).value='');
    document.getElementById('ped-channel').value='';document.getElementById('ped-catalog-product').value='';document.getElementById('ped-priority').value='Normal';document.getElementById('ped-printer').value='';document.getElementById('ped-qty').value='1';document.getElementById('ped-purpose').value='Venda';document.getElementById('ped-letter-style').value='';selectedPedColor='';editingProductionOrderId=null;root.querySelectorAll('[data-ped-color]').forEach(item=>item.classList.remove('selected'));document.getElementById('ped-add-btn').textContent='+ Adicionar à fila';document.getElementById('ped-cancel-edit-btn').style.display='none';updatePedPurpose();switchPedFormTab('produto');updatePedFormSummary();
  }
  document.getElementById('ped-cancel-edit-btn').addEventListener('click',resetPedForm);
  function updatePedPurpose(){const purpose=document.getElementById('ped-purpose').value,isSale=purpose==='Venda',value=document.getElementById('ped-value');value.disabled=!isSale;if(!isSale)value.value='0';document.getElementById('ped-client').placeholder=isSale?'Ex.: Mercado Livre, Instagram ou nome do cliente':purpose==='Brinde'?'Destinatário do brinde (opcional)':'Uso interno / responsável (opcional)';}
  document.getElementById('ped-purpose').addEventListener('change',updatePedPurpose);updatePedPurpose();
  let orderSaveBusy=false;
  document.getElementById('ped-add-btn').addEventListener('click', async ()=>{
    if(orderSaveBusy)return;
    const addButton=document.getElementById('ped-add-btn');
    const client = document.getElementById('ped-client').value.trim();
    const channel=document.getElementById('ped-channel').value,externalOrder=document.getElementById('ped-external-order').value.trim(),catalogProductCode=document.getElementById('ped-catalog-product').value;
    const priority=document.getElementById('ped-priority').value,printer=document.getElementById('ped-printer').value,printHours=Math.max(0,Number(document.getElementById('ped-print-hours').value)||0);
    const productName=document.getElementById('ped-product').value.trim(),quantity=Math.max(1,parseInt(document.getElementById('ped-qty').value)||1),color=productionColor(),finish=document.getElementById('ped-finish').value.trim(),personalization=document.getElementById('ped-personalization').value.trim(),letterStyle=document.getElementById('ped-letter-style').value,personalizationNotes=document.getElementById('ped-personalization-notes').value.trim(),notes=document.getElementById('ped-desc').value.trim();
    const desc=productionDescription({productName,qty:quantity,color,finish,personalization,letterStyle,personalizationNotes,notes});
    const purpose=document.getElementById('ped-purpose').value,value=purpose==='Venda'?(parseFloat(document.getElementById('ped-value').value)||0):0,cost=parseFloat(document.getElementById('ped-cost').value)||0;
    const deliveryDate = document.getElementById('ped-delivery').value || null;
    if(!productName){alert('Informe qual produto será produzido.');switchPedFormTab('produto');document.getElementById('ped-product').focus();return;}
    if(purpose==='Venda'&&value<=0){alert('Informe o valor da venda.');return;}
    if(purpose!=='Venda'&&cost<=0){alert('Para brinde ou uso próprio, informe o custo de produção.');return;}
    orderSaveBusy=true;addButton.disabled=true;addButton.textContent='Salvando…';
    try{
      const current=await getJSON('producao_pedidos',PEDIDOS),existing=current.find(p=>p.id===editingProductionOrderId),id=existing?.id||nextSeqId(current,'PRD');
      const data={id,client,channel,externalOrder,catalogProductCode,desc,productName,quantity,color,finish,personalization,letterStyle,personalizationNotes,notes,purpose,value,cost,deliveryDate,priority,printer,printHours};
      let next;
      if(existing){Object.assign(existing,data);addOrderEvent(existing,{type:'edit',status:existing.status,label:'Dados do pedido editados'});next=current;}
      else{next=[...current,{...data,status:'Pendente',date:todayISO(),items:[{id:`${id}-1`,productName,quantity,color,details:[finish,personalization,personalizationNotes].filter(Boolean).join(' · '),done:false}],statusHistory:[{type:'status',status:'Pendente',at:new Date().toISOString(),label:'Pedido incluído'}]}];}
      await setJSON('producao_pedidos',next);PEDIDOS=next;
      resetPedForm();
      renderPedidos();
    }catch(e){alert(e.message||'Não foi possível adicionar o pedido. Tente novamente.');}
    finally{orderSaveBusy=false;addButton.disabled=false;if(!editingProductionOrderId)addButton.textContent='+ Adicionar à fila';}
  });

  function isPedidoAtrasado(p){
    if(p.archivedAt) return false;
    if(!p.deliveryDate) return false;
    if(p.status === 'Concluído' || p.status === 'Pago') return false;
    return p.deliveryDate < todayISO();
  }

  function renderPedidosSummary(){
    const ativos = PEDIDOS.filter(p=>!p.archivedAt&&(orderPurpose(p)==='Venda'?p.status!=='Pago':!['Concluído','Pago'].includes(p.status)));
    const valorEmFila = ativos.filter(p=>orderPurpose(p)==='Venda').reduce((s,p)=>s+Number(p.value||0),0),custosInternos=ativos.filter(p=>orderPurpose(p)!=='Venda').reduce((s,p)=>s+Number(p.cost||0),0);
    const today=todayISO(),tomorrow=addDaysISO(today,1),atrasados = PEDIDOS.filter(isPedidoAtrasado).length,hoje=ativos.filter(p=>p.deliveryDate===today).length,amanha=ativos.filter(p=>p.deliveryDate===tomorrow).length,perdas=PEDIDOS.reduce((sum,p)=>sum+Number(p.lostCost||0),0);
    const concluidos=PEDIDOS.filter(p=>p.status==='Concluído').length;
    document.getElementById('ped-summary').innerHTML = `
      <div class="finance-kpi" style="--kpi-color:#d78b14;"><span class="label">Itens ativos</span><strong>${ativos.length}</strong><small>aguardando andamento</small></div>
      <div class="finance-kpi" style="--kpi-color:#6947c7;"><span class="label">Vendas em fila</span><strong>${fmtMoney(valorEmFila)}</strong><small>valor previsto</small></div>
      <div class="finance-kpi" style="--kpi-color:#0e8a96;"><span class="label">Entrega hoje</span><strong>${hoje}</strong><small>${concluidos} itens concluídos</small></div>
      <div class="finance-kpi" style="--kpi-color:#2376b9;"><span class="label">Entrega amanhã</span><strong>${amanha}</strong><small>planejamento imediato</small></div>
      <div class="finance-kpi" style="--kpi-color:${atrasados>0?'#c23349':'#21845a'};"><span class="label">Atrasados</span><strong style="color:${atrasados>0?'var(--red)':'var(--green)'};">${atrasados}</strong><small>custos internos: ${fmtMoney(custosInternos)}</small></div>
      <div class="finance-kpi" style="--kpi-color:#c23349;"><span class="label">Perdas registradas</span><strong>${fmtMoney(perdas)}</strong><small>falhas e reimpressões</small></div>
    `;
  }

  function openFinancialView(){
    switchView('recebimentos');
  }
  async function sendOrderToFinance(orderId){
    PEDIDOS=await getJSON('producao_pedidos',PEDIDOS);RECEBIMENTOS=await getJSON('empresa_recebimentos',RECEBIMENTOS);const p=PEDIDOS.find(x=>x.id===orderId);if(!p)return;
    const existing=RECEBIMENTOS.find(r=>(r.orderId===orderId||r.sourceOrderId===orderId)&&r.status!=='Estornado'&&r.status!=='Cancelado');
    openFinancialView();renderRecebimentos();
    if(existing){editReceipt(existing.id);document.getElementById('rec-msg').innerHTML='<div class="msg ok">Este pedido já possui um lançamento financeiro. Você pode revisar e editar as informações abaixo.</div>';return;}
    const purpose=orderPurpose(p),isSale=purpose==='Venda';resetReceiptForm();PENDING_SOURCE_ORDER_ID=p.id;document.getElementById('rec-type').value=isSale?'Entrada':'Saída';updateTransactionForm();document.getElementById('rec-category').value=isSale?'Venda':purpose==='Brinde'?'Brindes / divulgação':'Uso próprio';if(isSale)document.getElementById('rec-order').value=p.id;document.getElementById('rec-status').value='Pendente';document.getElementById('rec-client').value=p.client||'';document.getElementById('rec-description').value=p.desc||p.productName||'';if(isSale)document.getElementById('rec-delivery').value=p.deliveryDate||'';if(p.channel&&[...document.getElementById('rec-channel').options].some(option=>option.value===p.channel))document.getElementById('rec-channel').value=p.channel;document.getElementById('rec-value').value=Number(isSale?p.value:p.cost||0).toFixed(2);document.getElementById('rec-cost').value=isSale&&Number(p.cost||0)>0?Number(p.cost).toFixed(2):'';document.getElementById('rec-product-qty').value=String(Math.max(1,Number(p.quantity)||1));document.getElementById('rec-notes').value=`${purpose} importado da fila de produção · ${p.id}${p.externalOrder?' · Pedido externo '+p.externalOrder:''}`;document.getElementById('rec-msg').innerHTML=`<div class="msg ok">${isSale?'Venda':'Custo de '+purpose.toLocaleLowerCase('pt-BR')} carregado. Revise as informações antes de registrar.</div>`;document.getElementById('rec-type').scrollIntoView({behavior:'smooth',block:'center'});
  }

  function orderSpecsHtml(p){
    const specs=[Number(p.quantity)>1?`${p.quantity} unidades`:'',p.color?`Cor: ${p.color}`:'',p.finish?`Acabamento: ${p.finish}`:'',p.personalization?`Personalização: ${p.personalization}`:'',p.letterStyle||''].filter(Boolean);
    return specs.length?`<div class="order-specs">${specs.map(spec=>`<span class="order-spec">${escapeHtml(spec)}</span>`).join('')}</div>`:'';
  }
  function editProductionOrder(id){
    const p=PEDIDOS.find(item=>item.id===id);if(!p)return;
    editingProductionOrderId=id;document.getElementById('ped-channel').value=p.channel||'';document.getElementById('ped-client').value=p.client||'';document.getElementById('ped-external-order').value=p.externalOrder||'';document.getElementById('ped-catalog-product').value=p.catalogProductCode||'';document.getElementById('ped-product').value=p.productName||p.desc||'';document.getElementById('ped-qty').value=Number(p.quantity)||1;document.getElementById('ped-purpose').value=orderPurpose(p);document.getElementById('ped-value').value=Number(p.value||0);document.getElementById('ped-cost').value=Number(p.cost||0)||'';document.getElementById('ped-delivery').value=p.deliveryDate||'';document.getElementById('ped-priority').value=orderPriority(p);document.getElementById('ped-printer').value=p.printer||'';document.getElementById('ped-print-hours').value=Number(p.printHours)||'';document.getElementById('ped-desc').value=p.notes||'';document.getElementById('ped-color-custom').value=p.color||'';selectedPedColor=p.color||'';document.getElementById('ped-finish').value=p.finish||'';document.getElementById('ped-personalization').value=p.personalization||'';document.getElementById('ped-letter-style').value=p.letterStyle||'';document.getElementById('ped-personalization-notes').value=p.personalizationNotes||'';updatePedPurpose();updatePedFormSummary();document.getElementById('ped-add-btn').textContent='Salvar alterações';document.getElementById('ped-cancel-edit-btn').style.display='inline-flex';switchPedFormTab('produto');document.querySelector('.production-entry').scrollIntoView({behavior:'smooth',block:'start'});
  }
  async function toggleProductionItem(orderId,index){
    const latest=await getJSON('producao_pedidos',PEDIDOS),p=latest.find(item=>item.id===orderId);if(!p)return;
    if(!Array.isArray(p.items)||!p.items[index])p.items=orderItems(p);const item=p.items[index];item.done=!item.done;addOrderEvent(p,{type:'item',status:p.status,label:`Item ${item.done?'concluído':'reaberto'}: ${item.productName||item.desc||'Item'}`});await setJSON('producao_pedidos',latest);PEDIDOS=latest;renderPedidos();
  }
  async function duplicateProductionOrder(id){
    const latest=await getJSON('producao_pedidos',PEDIDOS),source=latest.find(item=>item.id===id);if(!source)return;const copy=JSON.parse(JSON.stringify(source)),newId=nextSeqId(latest,'PRD');copy.id=newId;copy.status='Pendente';copy.date=todayISO();copy.archivedAt=null;copy.externalOrder='';copy.failures=[];copy.statusHistory=[{type:'duplicate',status:'Pendente',at:new Date().toISOString(),label:`Pedido duplicado a partir de ${source.id}`}];copy.items=orderItems(copy).map((item,index)=>({...item,id:`${newId}-${index+1}`,done:false}));latest.push(copy);await setJSON('producao_pedidos',latest);PEDIDOS=latest;renderPedidos();
  }
  async function registerProductionFailure(id){
    const order=PEDIDOS.find(item=>item.id===id);if(!order)return;const qtyRaw=prompt('Quantas peças falharam ou precisarão ser reimpressas?','1');if(qtyRaw===null)return;const qty=Math.max(1,parseInt(qtyRaw,10)||1),costRaw=prompt('Informe o custo total perdido nesta falha (R$):','0');if(costRaw===null)return;const cost=Number(String(costRaw).replace(',','.'));if(!Number.isFinite(cost)||cost<0){alert('Informe um custo válido.');return;}const reason=prompt('Descreva brevemente o motivo da falha:','Falha de impressão')||'Falha de impressão';
    const latest=await getJSON('producao_pedidos',PEDIDOS),target=latest.find(item=>item.id===id);if(!target)return;if(!Array.isArray(target.failures))target.failures=[];target.failures.push({id:`FAL-${Date.now()}`,at:new Date().toISOString(),qty,cost,reason});target.lostCost=target.failures.reduce((sum,item)=>sum+Number(item.cost||0),0);target.reprintQty=target.failures.reduce((sum,item)=>sum+Number(item.qty||0),0);target.needsReprint=true;addOrderEvent(target,{type:'failure',status:target.status,label:`Falha registrada: ${qty} peça(s) · ${fmtMoney(cost)} · ${reason}`});await setJSON('producao_pedidos',latest);PEDIDOS=latest;renderPedidos();
  }
  async function resolveProductionReprint(id){const latest=await getJSON('producao_pedidos',PEDIDOS),target=latest.find(item=>item.id===id);if(!target)return;target.needsReprint=false;target.reprintCompletedAt=new Date().toISOString();addOrderEvent(target,{type:'reprint',status:target.status,label:`Reimpressão concluída: ${Number(target.reprintQty)||0} peça(s)`});await setJSON('producao_pedidos',latest);PEDIDOS=latest;renderPedidos();}
  function printProductionSheet(id){
    const p=PEDIDOS.find(item=>item.id===id);if(!p)return;const items=orderItems(p),popup=window.open('','_blank','width=900,height=760');if(!popup){alert('O navegador bloqueou a ficha. Permita janelas pop-up para este portal.');return;}const specs=[p.color&&`Cor: ${p.color}`,p.finish&&`Acabamento: ${p.finish}`,p.personalization&&`Personalização: ${p.personalization}`,p.letterStyle,p.personalizationNotes,p.notes].filter(Boolean);
    popup.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Ficha ${escapeHtml(p.id)}</title><style>body{font:14px Arial;color:#17131a;margin:32px}header{border-bottom:4px solid #6947c7;padding-bottom:14px;margin-bottom:20px}h1{margin:0;font-size:25px}.meta{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:18px 0}.box{border:1px solid #ccc;border-radius:8px;padding:10px}.box small{display:block;color:#666;margin-bottom:4px}table{width:100%;border-collapse:collapse;margin:18px 0}th,td{border:1px solid #ccc;padding:9px;text-align:left}th{background:#f1edf7}.check{font-size:21px}.notes{white-space:pre-wrap;border:1px solid #ccc;border-radius:8px;min-height:70px;padding:12px}.sign{display:grid;grid-template-columns:1fr 1fr;gap:50px;margin-top:55px}.line{border-top:1px solid #333;text-align:center;padding-top:7px}@media print{button{display:none}body{margin:18mm}}</style></head><body><button onclick="window.print()" style="float:right;padding:10px 16px">Imprimir</button><header><small>HL 3D SOLUTIONS · FICHA DE PRODUÇÃO</small><h1>${escapeHtml(p.id)} — ${escapeHtml(p.productName||p.desc)}</h1></header><div class="meta"><div class="box"><small>Cliente</small><strong>${escapeHtml(p.client||'Não informado')}</strong></div><div class="box"><small>Canal / pedido</small><strong>${escapeHtml([p.channel,p.externalOrder].filter(Boolean).join(' · ')||'Não informado')}</strong></div><div class="box"><small>Entrega</small><strong>${p.deliveryDate?fmtDate(p.deliveryDate):'Sem data'}</strong></div><div class="box"><small>Prioridade</small><strong>${escapeHtml(orderPriority(p))}</strong></div><div class="box"><small>Impressora</small><strong>${escapeHtml(p.printer||'A definir')}</strong></div><div class="box"><small>Tempo previsto</small><strong>${Number(p.printHours)||0} hora(s)</strong></div></div><table><thead><tr><th>Conferência</th><th>Produto</th><th>Qtd.</th><th>Cor / detalhes</th></tr></thead><tbody>${items.map(item=>`<tr><td class="check">☐</td><td>${escapeHtml(item.productName||item.desc||'Item')}</td><td>${item.quantity||1}</td><td>${escapeHtml([item.color,item.details].filter(Boolean).join(' · '))}</td></tr>`).join('')}</tbody></table><h3>Especificações</h3><div class="notes">${escapeHtml(specs.join('\n')||'Sem observações adicionais.')}</div><div class="sign"><div class="line">Responsável pela produção</div><div class="line">Conferência final</div></div></body></html>`);popup.document.close();popup.focus();
  }
  function renderProductionAgenda(){
    const today=todayISO(),tomorrow=addDaysISO(today,1),active=PEDIDOS.filter(p=>!p.archivedAt&&!['Pago'].includes(p.status)&&productionMatchesFilters(p)),groups=[{title:'Atrasados',items:active.filter(isPedidoAtrasado)},{title:'Hoje',items:active.filter(p=>p.deliveryDate===today)},{title:'Amanhã',items:active.filter(p=>p.deliveryDate===tomorrow)},{title:'Próximos',items:active.filter(p=>p.deliveryDate&&p.deliveryDate>tomorrow).sort((a,b)=>a.deliveryDate.localeCompare(b.deliveryDate)).slice(0,8)}];
    document.getElementById('ped-agenda').innerHTML=groups.map(group=>`<div class="agenda-day"><h4>${group.title} · ${group.items.length}</h4>${group.items.length?group.items.map(p=>`<div class="agenda-order ${orderPriority(p).toLowerCase()}"><strong>${escapeHtml(p.productName||p.desc)}</strong><br><span>${p.deliveryDate?fmtDate(p.deliveryDate)+' · ':''}${escapeHtml(p.client||p.channel||'Sem cliente')} · ${Number(p.printHours)||0}h${p.printer?' · '+escapeHtml(p.printer):''}</span></div>`).join(''):'<small style="color:var(--muted);">Nenhum pedido</small>'}</div>`).join('');
    const hours=active.reduce((sum,p)=>sum+(Number(p.printHours)||0),0);document.getElementById('ped-agenda-hours').textContent=`${hours.toLocaleString('pt-BR')} horas previstas`;
  }

  function renderPedidosKanban(){
    const kanban = document.getElementById('ped-kanban');
    kanban.innerHTML = STATUSES.map(status=>{
      const priorityOrder={Urgente:0,Normal:1,Baixa:2},items = PEDIDOS.filter(p=>p.status===status&&!p.archivedAt&&productionMatchesFilters(p)).sort((a,b)=>(priorityOrder[orderPriority(a)]-priorityOrder[orderPriority(b)])||String(a.deliveryDate||'9999').localeCompare(String(b.deliveryDate||'9999')));
      const meta=STAGE_META[status],collapsed=COLLAPSED_STAGES.has(status),salesTotal=items.filter(p=>orderPurpose(p)==='Venda').reduce((s,p)=>s+Number(p.value||0),0),costTotal=items.filter(p=>orderPurpose(p)!=='Venda').reduce((s,p)=>s+Number(p.cost||0),0);
      return `
      <div class="kanban-col ${collapsed?'collapsed':''}" data-stage="${meta.slug}">
        <div class="kanban-head"><div><div class="kanban-title"><span class="kanban-dot"></span>${meta.icon} ${status}<span class="kanban-count">${items.length}</span></div><small class="kanban-total">${salesTotal?fmtMoney(salesTotal)+' em vendas':''}${salesTotal&&costTotal?' · ':''}${costTotal?fmtMoney(costTotal)+' em custos':''}${!salesTotal&&!costTotal?'sem valores':''}</small></div><button class="kanban-toggle" type="button" data-toggle-stage="${status}" title="${collapsed?'Expandir':'Minimizar'} ${status}">${collapsed?'＋':'−'}</button></div>
        <div class="kanban-body">${items.map(p=>{
          const statusIdx = STATUSES.indexOf(p.status);
          const prevStatus = statusIdx > 0 ? STATUSES[statusIdx-1] : null;
          const nextStatus = orderPurpose(p)!=='Venda'&&p.status==='Concluído'?null:(statusIdx < STATUSES.length-1 ? STATUSES[statusIdx+1] : null);
          const atrasado = isPedidoAtrasado(p);
          const canArchive=orderPurpose(p)==='Venda'?p.status==='Pago':p.status==='Concluído';
          return `
          <div class="kanban-card ${p.personalization?'production-card-personalized':''}" style="${atrasado ? 'border-color:var(--red);' : ''}">
            <div class="kc-name">${p.client ? escapeHtml(p.client)+' — ' : ''}${escapeHtml(p.productName||p.desc)}</div><div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:5px;"><span class="priority-badge ${orderPriority(p).toLowerCase()}">${escapeHtml(orderPriority(p))}</span>${p.personalization?'<span class="tag producao">Personalizado</span>':''}</div>
            ${orderSpecsHtml(p)}
            ${orderItemsHtml(p)}
            ${(p.printer||Number(p.printHours)>0)?`<div class="kc-value">🖨️ ${escapeHtml(p.printer||'Impressora a definir')} · ${Number(p.printHours)||0}h previstas</div>`:''}
            ${Number(p.lostCost)>0||Number(p.reprintQty)>0?`<div class="failure-summary">⚠ ${Number(p.reprintQty)||0} peça(s) registradas · perda ${fmtMoney(p.lostCost||0)} · ${p.needsReprint?'reimpressão pendente':'reimpressão concluída'}</div>`:''}
            ${p.productName&&(p.personalizationNotes||p.notes)?`<div class="kc-value">${escapeHtml([p.personalizationNotes,p.notes].filter(Boolean).join(' · '))}</div>`:''}
            <div class="kc-value"><span class="tag ${orderPurpose(p)==='Venda'?'pago':'producao'}">${escapeHtml(orderPurpose(p))}</span> ${orderPurpose(p)==='Venda'?'venda '+fmtMoney(p.value):'custo '+fmtMoney(p.cost||0)} · incluído ${fmtDate(p.date)}</div>
            ${p.deliveryDate ? `<div class="kc-value" style="${atrasado ? 'color:var(--red);font-weight:700;' : ''}">${atrasado ? '⚠️ atrasado — ' : '📦 entrega '}${fmtDate(p.deliveryDate)}</div>` : ''}
            <div class="kc-actions">
              <button data-edit-ped="${p.id}">✏️ Editar</button>
              <button data-duplicate-ped="${p.id}">⧉ Duplicar</button>
              <button data-print-ped="${p.id}">▤ Ficha</button>
              <button data-failure-ped="${p.id}">⚠ Falha</button>
              ${p.needsReprint?`<button data-resolve-reprint="${p.id}">✓ Reimpressão pronta</button>`:''}
              ${prevStatus ? `<button data-move-ped="${p.id}|${prevStatus}">← ${prevStatus}</button>` : ''}
              ${nextStatus ? `<button data-move-ped="${p.id}|${nextStatus}">${nextStatus} →</button>` : ''}
              ${p.status==='Concluído'||p.status==='Pago'?`<button data-finance-ped="${p.id}">${RECEBIMENTOS.some(r=>(r.orderId===p.id||r.sourceOrderId===p.id)&&r.status!=='Estornado'&&r.status!=='Cancelado')?'✏️ Editar financeiro':'💰 Enviar ao financeiro'}</button>`:''}
              ${canArchive?`<button data-archive-ped="${p.id}" title="Finalizar, ocultar da fila e manter no histórico">✓ Finalizar e arquivar</button>`:`<button data-del-ped="${p.id}" style="color:var(--red);" title="Cancelar e manter no histórico">Cancelar</button>`}
            </div>
          </div>`;
        }).join('') || '<div class="empty" style="padding:18px 8px;">Nenhum item nesta etapa</div>'}</div>
      </div>`;
    }).join('');

    root.querySelectorAll('[data-toggle-stage]').forEach(b=>b.addEventListener('click',()=>{const status=b.dataset.toggleStage;if(COLLAPSED_STAGES.has(status))COLLAPSED_STAGES.delete(status);else COLLAPSED_STAGES.add(status);saveCollapsedStages();renderPedidosKanban();}));
    root.querySelectorAll('#ped-kanban [data-edit-ped]').forEach(b=>b.addEventListener('click',()=>editProductionOrder(b.dataset.editPed)));
    root.querySelectorAll('#ped-kanban [data-duplicate-ped]').forEach(b=>b.addEventListener('click',async()=>{if(!confirm('Duplicar este pedido como um novo item pendente?'))return;try{await duplicateProductionOrder(b.dataset.duplicatePed);}catch(e){alert(e.message);}}));
    root.querySelectorAll('#ped-kanban [data-print-ped]').forEach(b=>b.addEventListener('click',()=>printProductionSheet(b.dataset.printPed)));
    root.querySelectorAll('#ped-kanban [data-failure-ped]').forEach(b=>b.addEventListener('click',async()=>{try{await registerProductionFailure(b.dataset.failurePed);}catch(e){alert(e.message);}}));
    root.querySelectorAll('#ped-kanban [data-resolve-reprint]').forEach(b=>b.addEventListener('click',async()=>{try{await resolveProductionReprint(b.dataset.resolveReprint);}catch(e){alert(e.message);}}));
    root.querySelectorAll('#ped-kanban [data-toggle-order-item]').forEach(b=>b.addEventListener('click',async()=>{const [id,index]=b.dataset.toggleOrderItem.split('|');try{await toggleProductionItem(id,Number(index));}catch(e){alert(e.message);}}));

    root.querySelectorAll('[data-move-ped]').forEach(b=>b.addEventListener('click', async ()=>{
      const [id, newStatus] = b.dataset.movePed.split('|');
      PEDIDOS = await getJSON('producao_pedidos', PEDIDOS);
      const p = PEDIDOS.find(p=>p.id===id);
      if(p){try{await changeOrderStatus(id,newStatus);}catch(e){alert(e.message);}}
    }));
    root.querySelectorAll('[data-archive-ped]').forEach(b=>b.addEventListener('click',async()=>{
      if(!confirm('Finalizar este item e retirá-lo da fila? Ele continuará disponível no histórico abaixo.'))return;
      try{await archiveFinishedOrder(b.dataset.archivePed);}catch(e){alert(e.message);}
    }));
    root.querySelectorAll('[data-del-ped]').forEach(b=>b.addEventListener('click', async ()=>{
      if(!confirm('Cancelar e retirar este pedido da fila? Ele continuará no histórico e poderá ser reexibido.')) return;
      const current=await getJSON('producao_pedidos',PEDIDOS),item=current.find(p=>p.id===b.dataset.delPed);if(!item)return;item.archivedAt=new Date().toISOString();addOrderEvent(item,{type:'cancel',status:item.status,label:'Pedido cancelado e retirado da fila'});
      await setJSON('producao_pedidos',current);PEDIDOS=current;
      renderPedidos();
    }));
    root.querySelectorAll('[data-finance-ped]').forEach(b=>b.addEventListener('click',()=>sendOrderToFinance(b.dataset.financePed)));
  }
  document.getElementById('ped-collapse-all').addEventListener('click',()=>{COLLAPSED_STAGES=new Set(STATUSES);saveCollapsedStages();renderPedidosKanban();});
  document.getElementById('ped-expand-all').addEventListener('click',()=>{COLLAPSED_STAGES.clear();saveCollapsedStages();renderPedidosKanban();});

  const statusTagClass = { 'Pendente':'pendente', 'Em produção':'producao', 'Concluído':'concluido', 'Pago':'pago' };
  function renderPedidosList(){
    const sortBy = document.getElementById('ped-sort').value;
    const sorted = PEDIDOS.slice().sort((a,b)=>{
      if(sortBy === 'delivery'){
        // sem data de entrega vai pro final da lista
        if(!a.deliveryDate && !b.deliveryDate) return (a.date||'').localeCompare(b.date||'');
        if(!a.deliveryDate) return 1;
        if(!b.deliveryDate) return -1;
        return a.deliveryDate.localeCompare(b.deliveryDate);
      }
      return (b.date||'').localeCompare(a.date||''); // inclusão: mais recente primeiro
    });
    document.getElementById('ped-list-tbody').innerHTML = sorted.length ? sorted.map(p=>{
      const atrasado = isPedidoAtrasado(p);
      const timeline = orderHistory(p);
      return `
      <tr style="${atrasado ? 'background:rgba(194,51,73,.06);' : ''}">
        <td>${escapeHtml(p.client)||'—'}${p.channel?`<small style="display:block;color:var(--muted);">${escapeHtml(p.channel)}</small>`:''}${p.externalOrder?`<small style="display:block;color:var(--muted);">Pedido: ${escapeHtml(p.externalOrder)}</small>`:''}</td>
        <td><strong>${escapeHtml(p.productName||p.desc)}</strong><div style="margin-top:4px;"><span class="priority-badge ${orderPriority(p).toLowerCase()}">${escapeHtml(orderPriority(p))}</span></div>${orderSpecsHtml(p)}${orderItemsHtml(p)}${p.printer||Number(p.printHours)>0?`<small style="display:block;">${escapeHtml(p.printer||'Impressora a definir')} · ${Number(p.printHours)||0}h</small>`:''}${Number(p.lostCost)>0?`<small style="display:block;color:var(--red);">Perdas: ${fmtMoney(p.lostCost)} · reimpressão ${Number(p.reprintQty)||0}</small>`:''}${p.productName&&(p.personalizationNotes||p.notes)?`<small>${escapeHtml([p.personalizationNotes,p.notes].filter(Boolean).join(' · '))}</small>`:''}</td>
        <td><span class="tag ${orderPurpose(p)==='Venda'?'pago':'producao'}">${escapeHtml(orderPurpose(p))}</span></td><td>${orderPurpose(p)==='Venda'?fmtMoney(p.value):'Custo '+fmtMoney(p.cost||0)}</td>
        <td>${fmtDate(p.date)}</td>
        <td style="${atrasado ? 'color:var(--red);font-weight:700;' : ''}">${p.deliveryDate ? fmtDate(p.deliveryDate) : '—'}${atrasado ? ' ⚠️' : ''}</td>
        <td><span class="tag ${statusTagClass[p.status]}">${p.status}</span>${p.archivedAt?'<br><span class="tag concluido" style="margin-top:5px;">Arquivado</span>':''}</td>
        <td><details><summary style="cursor:pointer;font-weight:700;">Ver datas e horários (${timeline.length})</summary><div style="min-width:235px;margin-top:8px;">${timeline.map(event=>`<div style="padding:6px 0;border-bottom:1px solid var(--line);"><strong>${escapeHtml(event.label||event.status||'Alteração')}</strong><br><small>${escapeHtml(orderEventDate(event))}</small></div>`).join('')}</div></details><div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;"><button class="btn secondary small" data-edit-ped="${p.id}">Editar</button><button class="btn secondary small" data-duplicate-ped="${p.id}">Duplicar</button><button class="btn secondary small" data-print-ped="${p.id}">Ficha</button><button class="btn secondary small" data-failure-ped="${p.id}">Falha</button>${p.status==='Concluído'||p.status==='Pago'?`<button class="btn secondary small" data-finance-ped="${p.id}">${RECEBIMENTOS.some(r=>(r.orderId===p.id||r.sourceOrderId===p.id)&&r.status!=='Estornado'&&r.status!=='Cancelado')?'Editar financeiro':'Enviar ao financeiro'}</button>`:''}${p.archivedAt?`<button class="btn secondary small" data-restore-ped="${p.id}">Reexibir na fila</button>`:''}</div></td>
      </tr>`;
    }).join('') : '<tr><td colspan="8"><div class="empty">Nenhum pedido na fila ainda.</div></td></tr>';
    root.querySelectorAll('#ped-list-table [data-finance-ped]').forEach(b=>b.addEventListener('click',()=>sendOrderToFinance(b.dataset.financePed)));
    root.querySelectorAll('#ped-list-table [data-edit-ped]').forEach(b=>b.addEventListener('click',()=>editProductionOrder(b.dataset.editPed)));
    root.querySelectorAll('#ped-list-table [data-duplicate-ped]').forEach(b=>b.addEventListener('click',async()=>{if(!confirm('Duplicar este pedido como um novo item pendente?'))return;try{await duplicateProductionOrder(b.dataset.duplicatePed);}catch(e){alert(e.message);}}));
    root.querySelectorAll('#ped-list-table [data-print-ped]').forEach(b=>b.addEventListener('click',()=>printProductionSheet(b.dataset.printPed)));
    root.querySelectorAll('#ped-list-table [data-failure-ped]').forEach(b=>b.addEventListener('click',async()=>{try{await registerProductionFailure(b.dataset.failurePed);}catch(e){alert(e.message);}}));
    root.querySelectorAll('#ped-list-table [data-toggle-order-item]').forEach(b=>b.addEventListener('click',async()=>{const [id,index]=b.dataset.toggleOrderItem.split('|');try{await toggleProductionItem(id,Number(index));}catch(e){alert(e.message);}}));
    root.querySelectorAll('#ped-list-table [data-restore-ped]').forEach(b=>b.addEventListener('click',async()=>{
      const order=PEDIDOS.find(item=>item.id===b.dataset.restorePed);
      if(!confirm(`Reexibir este item na coluna ${order?.status||'correspondente'}?`))return;
      try{await restoreArchivedOrder(b.dataset.restorePed);}catch(e){alert(e.message);}
    }));
  }
  document.getElementById('ped-sort').addEventListener('change', renderPedidosList);
  [['ped-filter-search','search','input'],['ped-filter-channel','channel','change'],['ped-filter-priority','priority','change'],['ped-filter-printer','printer','change'],['ped-filter-deadline','deadline','change']].forEach(([id,key,eventName])=>document.getElementById(id).addEventListener(eventName,event=>{PRODUCTION_FILTERS[key]=event.target.value;renderPedidosKanban();renderProductionAgenda();}));
  document.getElementById('ped-clear-filters').addEventListener('click',()=>{Object.keys(PRODUCTION_FILTERS).forEach(key=>PRODUCTION_FILTERS[key]='');['ped-filter-search','ped-filter-channel','ped-filter-priority','ped-filter-printer','ped-filter-deadline'].forEach(id=>document.getElementById(id).value='');renderPedidosKanban();renderProductionAgenda();});

  function renderPedidos(){
    populateProductionCatalog();
    renderPedidosSummary();
    renderProductionAgenda();
    renderPedidosKanban();
    renderPedidosList();
  }

  // ============================================================
  // RECEBIMENTOS
  // ============================================================
  const RECEIPT_CHANNELS=['Mercado Livre','Instagram','WhatsApp','Venda presencial','Shopee','Consignação','Fornecedor','Receita Federal / impostos','Banco','Plataforma / serviço','Outro'];
  const ENTRY_CATEGORIES=['Venda','Aporte','Reembolso','Outros'];
  const EXIT_CATEGORIES=['Impostos','Filamentos','Insumos','Embalagens','Fretes','Equipamentos / manutenção','Marketing / plataformas','Serviços','Brindes / divulgação','Uso próprio','Retirada pessoal','Outros'];
  let EDITING_RECEIPT_ID=null;
  let PENDING_SOURCE_ORDER_ID=null;
  const transactionType=r=>r.type==='Saída'?'Saída':'Entrada';
  const isConfirmed=r=>transactionType(r)==='Entrada'?r.status==='Recebido':r.status==='Pago';
  function receiptNet(r){ return transactionType(r)==='Entrada'?Math.max(0,Number(r.value||0)-Number(r.fee||0)):Number(r.value||0); }
  function clientKey(name){ return (name||'').trim().toLocaleLowerCase('pt-BR').replace(/\s+/g,' '); }
  function productKey(name){ return (name||'Produto não informado').trim().toLocaleLowerCase('pt-BR').replace(/\s+/g,' '); }
  async function saveClientName(name){
    name=(name||'').trim(); if(!name)return;
    const current=await getJSON('empresa_clientes',CLIENTES),next=current.map(c=>({...c})),key=clientKey(name),found=next.find(c=>clientKey(c.name)===key);
    if(found){found.name=name;found.updatedAt=new Date().toISOString();}else next.push({id:nextSeqId(next,'CLI'),name,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
    await setJSON('empresa_clientes',next);CLIENTES=next;populateClientList();
  }
  function populateClientList(){
    const names=new Map(); CLIENTES.forEach(c=>{if(c.name)names.set(clientKey(c.name),c.name)}); RECEBIMENTOS.filter(r=>transactionType(r)==='Entrada'&&r.client).forEach(r=>names.set(clientKey(r.client),r.client));
    document.getElementById('rec-client-list').innerHTML=[...names.values()].sort((a,b)=>a.localeCompare(b,'pt-BR')).map(n=>`<option value="${escapeHtml(n)}"></option>`).join('');
  }
  function monthKey(date){ return (date||todayISO()).slice(0,7); }
  function monthLabel(key){ const [y,m]=key.split('-'); return new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric'}).format(new Date(Number(y),Number(m)-1,1)); }
  function receivedForOrder(orderId){ return RECEBIMENTOS.filter(r=>transactionType(r)==='Entrada'&&r.orderId===orderId&&r.status==='Recebido').reduce((s,r)=>s+Number(r.value||0),0); }
  async function updateOrderPaidStatus(orderId){
    if(!orderId)return;
    PEDIDOS=await getJSON('producao_pedidos',PEDIDOS);
    const p=PEDIDOS.find(x=>x.id===orderId);if(!p)return;
    const totalRecebido=receivedForOrder(orderId),valorPedido=Math.max(0,Number(p.value||0));
    const quitado=valorPedido>0&&totalRecebido>=valorPedido;
    let changed=false;
    if(quitado&&p.status!=='Pago'){
      const previous=p.status||'Pendente';p.statusBeforePaid=previous;p.status='Pago';p.archivedAt=null;changed=true;
      addOrderEvent(p,{type:'status',status:'Pago',label:`Etapa alterada automaticamente: ${previous} → Pago`});
    }else if(!quitado&&p.status==='Pago'){
      const restored=['Pendente','Em produção','Concluído'].includes(p.statusBeforePaid)?p.statusBeforePaid:'Concluído';
      p.status=restored;p.archivedAt=null;changed=true;
      addOrderEvent(p,{type:'status',status:restored,label:`Pagamento deixou de estar quitado: Pago → ${restored}`});
    }
    if(changed){await setJSON('producao_pedidos',PEDIDOS);renderPedidos();}
  }
  function populateReceiptOrders(){
    const sel=document.getElementById('rec-order'); if(!sel) return;
    sel.innerHTML='<option value="">Entrada avulsa</option>'+PEDIDOS.slice().sort((a,b)=>(b.date||'').localeCompare(a.date||'')).map(p=>{
      const paid=receivedForOrder(p.id), remaining=Math.max(0,Number(p.value||0)-paid);
      return `<option value="${escapeHtml(p.id)}">${escapeHtml(p.id)} · ${escapeHtml(p.client||p.desc)} · ${remaining>0?'restam '+fmtMoney(remaining):'quitado'}</option>`;
    }).join('');
  }
  document.getElementById('rec-order').addEventListener('change',e=>{
    const p=PEDIDOS.find(x=>x.id===e.target.value); if(!p) return;
    document.getElementById('rec-client').value=p.client||''; document.getElementById('rec-description').value=p.desc||''; document.getElementById('rec-delivery').value=p.deliveryDate||'';
    const remaining=Math.max(0,Number(p.value||0)-receivedForOrder(p.id)); document.getElementById('rec-value').value=(remaining||Number(p.value)||0).toFixed(2);
  });
  function updateTransactionForm(){
    const type=document.getElementById('rec-type').value,exit=type==='Saída',categories=exit?EXIT_CATEGORIES:ENTRY_CATEGORIES;
    document.getElementById('rec-category').innerHTML=categories.map(c=>`<option>${c}</option>`).join('');
    document.getElementById('rec-status').innerHTML=(exit?['Pago','Pendente','Cancelado']:['Recebido','Pendente','Estornado']).map(s=>`<option>${s}</option>`).join('');
    document.getElementById('rec-order-wrap').style.display=exit?'none':''; document.getElementById('rec-delivery-wrap').style.display=exit?'none':''; document.getElementById('rec-product-qty-wrap').style.display=exit?'none':''; document.getElementById('rec-fee-wrap').style.display=exit?'none':''; document.getElementById('rec-cost-wrap').style.display=exit?'none':'';
    document.getElementById('rec-party-label').textContent=exit?'Fornecedor / favorecido':'Cliente'; document.getElementById('rec-client').placeholder=exit?'Nome do fornecedor ou favorecido':'Nome do cliente';
    if(exit){document.getElementById('rec-order').value='';document.getElementById('rec-product-qty').value='1';document.getElementById('rec-fee').value='0';document.getElementById('rec-cost').value='';document.getElementById('rec-delivery').value='';}
  }
  document.getElementById('rec-type').addEventListener('change',updateTransactionForm);
  function resetReceiptForm(){
    EDITING_RECEIPT_ID=null;PENDING_SOURCE_ORDER_ID=null;['rec-client','rec-description','rec-delivery','rec-value','rec-cost','rec-notes'].forEach(id=>document.getElementById(id).value='');document.getElementById('rec-order').value='';document.getElementById('rec-product-qty').value='1';document.getElementById('rec-fee').value='0';document.getElementById('rec-date').value=todayISO();document.getElementById('rec-type').value='Entrada';updateTransactionForm();document.getElementById('rec-add-btn').textContent='+ Registrar lançamento';document.getElementById('rec-cancel-edit-btn').style.display='none';
  }
  document.getElementById('rec-cancel-edit-btn').addEventListener('click',()=>{resetReceiptForm();document.getElementById('rec-msg').innerHTML='';});
  function editReceipt(id){
    const r=RECEBIMENTOS.find(x=>x.id===id);if(!r)return;EDITING_RECEIPT_ID=id;PENDING_SOURCE_ORDER_ID=r.sourceOrderId||r.orderId||null;document.getElementById('rec-type').value=transactionType(r);updateTransactionForm();document.getElementById('rec-category').value=r.category||(transactionType(r)==='Entrada'?'Venda':'Outros');document.getElementById('rec-status').value=r.status;document.getElementById('rec-order').value=r.orderId||'';document.getElementById('rec-date').value=r.date||todayISO();document.getElementById('rec-client').value=r.client||'';document.getElementById('rec-description').value=r.description||'';document.getElementById('rec-product-qty').value=r.productQty||1;document.getElementById('rec-delivery').value=r.deliveryDate||'';document.getElementById('rec-value').value=Number(r.value||0).toFixed(2);document.getElementById('rec-fee').value=Number(r.fee||0).toFixed(2);document.getElementById('rec-cost').value=r.cost===null||r.cost===undefined?'':Number(r.cost||0).toFixed(2);document.getElementById('rec-payment').value=r.payment||'PIX';document.getElementById('rec-channel').value=r.channel||'Outro';document.getElementById('rec-notes').value=r.notes||'';document.getElementById('rec-add-btn').textContent='Salvar alterações';document.getElementById('rec-cancel-edit-btn').style.display='inline-flex';document.getElementById('rec-msg').innerHTML='<div class="msg ok">Editando '+escapeHtml(r.id)+'. Altere os campos e salve.</div>';document.getElementById('rec-type').scrollIntoView({behavior:'smooth',block:'center'});
  }
  document.getElementById('rec-add-btn').addEventListener('click',async()=>{
    const type=document.getElementById('rec-type').value,value=parseFloat(document.getElementById('rec-value').value), fee=type==='Entrada'?(parseFloat(document.getElementById('rec-fee').value)||0):0,costRaw=document.getElementById('rec-cost').value,cost=type==='Entrada'&&costRaw!==''?Math.max(0,parseFloat(costRaw)||0):null,msg=document.getElementById('rec-msg');
    if(isNaN(value)||value<=0){msg.innerHTML='<div class="msg err">Informe um valor válido.</div>';return;}
    if(!Number.isFinite(fee)||fee<0||fee>value){msg.innerHTML='<div class="msg err">A taxa deve ficar entre zero e o valor bruto.</div>';return;}
    const orderId=type==='Entrada'?(document.getElementById('rec-order').value||null):null;
    RECEBIMENTOS=await getJSON('empresa_recebimentos',RECEBIMENTOS);const existing=EDITING_RECEIPT_ID?RECEBIMENTOS.find(r=>r.id===EDITING_RECEIPT_ID):null,id=existing?existing.id:nextSeqId(RECEBIMENTOS,'REC');
    const rec={id,type,category:document.getElementById('rec-category').value,date:document.getElementById('rec-date').value||todayISO(),createdAt:existing?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString(),value,fee,cost,productQty:type==='Entrada'?Math.max(1,parseInt(document.getElementById('rec-product-qty').value,10)||1):null,status:document.getElementById('rec-status').value,payment:document.getElementById('rec-payment').value,channel:document.getElementById('rec-channel').value,client:document.getElementById('rec-client').value.trim(),description:document.getElementById('rec-description').value.trim(),deliveryDate:type==='Entrada'?(document.getElementById('rec-delivery').value||null):null,notes:document.getElementById('rec-notes').value.trim(),orderId,sourceOrderId:existing?.sourceOrderId||PENDING_SOURCE_ORDER_ID||null};
    const previousOrderId=existing?.orderId||null;
    const next=RECEBIMENTOS.slice();if(existing)next[next.findIndex(r=>r.id===existing.id)]=rec;else next.push(rec);
    try{
      await setJSON('empresa_recebimentos',next);RECEBIMENTOS=next;
      let warning='';
      if(type==='Entrada'&&rec.client){try{await saveClientName(rec.client);}catch(e){warning=' O lançamento foi salvo, mas o cadastro auxiliar do cliente não pôde ser atualizado.';}}
      for(const linkedId of [...new Set([previousOrderId,orderId].filter(Boolean))]){try{await updateOrderPaidStatus(linkedId);}catch(e){warning+=' O financeiro foi salvo, mas revise o status do pedido vinculado.';}}
      const wasEditing=Boolean(existing);resetReceiptForm();msg.innerHTML=`<div class="msg ${warning?'err':'ok'}">Lançamento ${wasEditing?'atualizado':'registrado'} com sucesso.${escapeHtml(warning)}</div>`;renderRecebimentos();
    }catch(e){msg.innerHTML=`<div class="msg err">${escapeHtml(e.message)}</div>`;}
  });
  function filteredReceipts(){
    const type=document.getElementById('rec-filter-type').value,category=document.getElementById('rec-filter-category').value,channel=document.getElementById('rec-filter-channel').value,status=document.getElementById('rec-filter-status').value,q=document.getElementById('rec-search').value.trim().toLowerCase();
    return RECEBIMENTOS.filter(r=>(!type||transactionType(r)===type)&&(!category||(r.category||(transactionType(r)==='Entrada'?'Venda':'Outros'))===category)&&(!channel||r.channel===channel)&&(!status||r.status===status)&&(!q||[r.client,r.description,r.category,transactionType(r),r.orderId,r.id,r.notes].filter(Boolean).join(' ').toLowerCase().includes(q)));
  }
  function renderReceiptKpis(){
    const current=monthKey(todayISO()),rows=RECEBIMENTOS.filter(r=>monthKey(r.date)===current),entries=rows.filter(r=>transactionType(r)==='Entrada'&&isConfirmed(r)),exits=rows.filter(r=>transactionType(r)==='Saída'&&isConfirmed(r)),pending=rows.filter(r=>r.status==='Pendente');
    const sales=entries.filter(r=>(r.category||'Venda')==='Venda'),gross=sales.reduce((s,r)=>s+Number(r.value||0),0),income=entries.reduce((s,r)=>s+receiptNet(r),0),known=sales.filter(r=>r.cost!==null&&r.cost!==undefined&&r.cost!==''),profit=known.reduce((s,r)=>s+receiptNet(r)-Number(r.cost||0),0),expenses=exits.reduce((s,r)=>s+Number(r.value||0),0),pendingTotal=pending.reduce((s,r)=>s+Number(r.value||0),0);
    document.getElementById('rec-kpis').innerHTML=`<div class="finance-kpi"><span class="label">Vendas brutas no mês</span><strong>${fmtMoney(gross)}</strong><small>antes de taxas e descontos</small></div><div class="finance-kpi green"><span class="label">Entrou líquido</span><strong>${fmtMoney(income)}</strong><small>todas as entradas após taxas</small></div><div class="finance-kpi green"><span class="label">Lucro apurado</span><strong>${known.length?fmtMoney(profit):'—'}</strong><small>${known.length} de ${sales.length} venda${sales.length===1?'':'s'} com custo informado</small></div><div class="finance-kpi coral"><span class="label">Saídas no mês</span><strong>${fmtMoney(expenses)}</strong><small>${exits.length} paga${exits.length===1?'':'s'}</small></div><div class="finance-kpi"><span class="label">Saldo de caixa</span><strong style="color:${income-expenses<0?'var(--red)':'var(--green)'};">${fmtMoney(income-expenses)}</strong><small>líquido recebido menos saídas</small></div><div class="finance-kpi"><span class="label">Pendentes</span><strong>${fmtMoney(pendingTotal)}</strong><small>${pending.length} lançamento${pending.length===1?'':'s'}</small></div>`;
  }
  function renderReceiptMonths(){
    const rows=filteredReceipts().slice().sort((a,b)=>(b.date||'').localeCompare(a.date||'')||(b.createdAt||'').localeCompare(a.createdAt||''));
    const current=monthKey(todayISO()), groups=new Map([[current,[]]]); rows.forEach(r=>{const k=monthKey(r.date);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(r);});
    const keys=[current,...[...groups.keys()].filter(k=>k!==current).sort((a,b)=>b.localeCompare(a))];
    document.getElementById('rec-months').innerHTML=keys.map(key=>{const items=groups.get(key),entries=items.filter(r=>transactionType(r)==='Entrada'&&isConfirmed(r)),exits=items.filter(r=>transactionType(r)==='Saída'&&isConfirmed(r)),sales=entries.filter(r=>(r.category||'Venda')==='Venda'),gross=sales.reduce((s,r)=>s+Number(r.value||0),0),income=entries.reduce((s,r)=>s+receiptNet(r),0),known=sales.filter(r=>r.cost!==null&&r.cost!==undefined&&r.cost!==''),profit=known.reduce((s,r)=>s+receiptNet(r)-Number(r.cost||0),0),expenses=exits.reduce((s,r)=>s+Number(r.value||0),0),pending=items.filter(r=>r.status==='Pendente').reduce((s,r)=>s+Number(r.value||0),0);return `<div class="month-group"><div class="month-head"><h3>${monthLabel(key)}${key===current?' · mês atual':''}</h3><div class="month-totals"><span>Bruto: <strong>${fmtMoney(gross)}</strong></span><span>Entrou líquido: <strong style="color:var(--green);">${fmtMoney(income)}</strong></span><span>Lucro apurado: <strong>${known.length?fmtMoney(profit):'—'}</strong></span><span>Saídas: <strong style="color:var(--red);">${fmtMoney(expenses)}</strong></span><span>Saldo: <strong>${fmtMoney(income-expenses)}</strong></span>${pending?`<span>Pendente: <strong style="color:var(--coral);">${fmtMoney(pending)}</strong></span>`:''}</div></div>${items.length?items.map(r=>{const type=transactionType(r),exit=type==='Saída',category=r.category||(exit?'Outros':'Venda');return `<div class="receipt-row"><span>${fmtDate(r.date)}</span><div class="receipt-main"><strong><span class="tag ${exit?'cancelado':'pago'}">${type}</span> ${escapeHtml(r.client||(exit?'Despesa avulsa':'Venda avulsa'))}</strong><small>${escapeHtml(category)} · ${escapeHtml(r.description||r.orderId||r.id)}${r.deliveryDate?' · entrega '+fmtDate(r.deliveryDate):''}</small></div><span class="mobile-hide">${escapeHtml(r.channel||'—')}<br><small style="color:var(--muted);">${escapeHtml(r.payment||'—')}</small></span><span class="tag ${isConfirmed(r)?'pago':r.status==='Pendente'?'pendente':'producao'} mobile-hide">${escapeHtml(r.status)}</span><div><div class="receipt-value" style="color:${exit?'var(--red)':'var(--green)'};">${exit?'−':'+'} ${fmtMoney(exit?r.value:receiptNet(r))}</div>${!exit?`<div class="receipt-net">bruto ${fmtMoney(r.value)}${Number(r.fee)>0?' · taxa '+fmtMoney(r.fee):''}${r.cost!==null&&r.cost!==undefined?' · lucro '+fmtMoney(receiptNet(r)-Number(r.cost||0)):''}</div>`:''}</div><div class="actions">${r.status==='Pendente'?`<button data-confirm-rec="${r.id}">Confirmar</button>`:''}<button data-edit-rec="${r.id}">Editar</button><button data-del-rec="${r.id}">Remover</button></div></div>`;}).join(''):'<div class="empty">Nenhum lançamento neste mês.</div>'}</div>`;}).join('');
    document.querySelectorAll('[data-confirm-rec]').forEach(b=>b.addEventListener('click',async()=>{try{const current=await getJSON('empresa_recebimentos',RECEBIMENTOS),next=current.map(r=>r.id===b.dataset.confirmRec?{...r,status:transactionType(r)==='Saída'?'Pago':'Recebido',updatedAt:new Date().toISOString()}:r),changed=next.find(r=>r.id===b.dataset.confirmRec);await setJSON('empresa_recebimentos',next);RECEBIMENTOS=next;if(changed&&transactionType(changed)==='Entrada')await updateOrderPaidStatus(changed.orderId);renderRecebimentos();}catch(e){alert(e.message);}}));
    document.querySelectorAll('[data-edit-rec]').forEach(b=>b.addEventListener('click',()=>editReceipt(b.dataset.editRec)));
    document.querySelectorAll('[data-del-rec]').forEach(b=>b.addEventListener('click',async()=>{if(!confirm('Remover este lançamento financeiro?'))return;try{const current=await getJSON('empresa_recebimentos',RECEBIMENTOS),removed=current.find(r=>r.id===b.dataset.delRec),next=current.filter(r=>r.id!==b.dataset.delRec);await setJSON('empresa_recebimentos',next);RECEBIMENTOS=next;if(EDITING_RECEIPT_ID===b.dataset.delRec)resetReceiptForm();if(removed?.orderId)await updateOrderPaidStatus(removed.orderId);renderRecebimentos();}catch(e){alert(e.message);}}));
  }
  function clientPeriodStart(){
    const p=document.getElementById('client-period').value;if(p==='all')return null;if(p==='current')return monthKey(todayISO())+'-01';
    const d=new Date();d.setMonth(d.getMonth()-Number(p));return localISODate(d);
  }
  function renderClientAnalytics(){
    const start=clientPeriodStart(),q=document.getElementById('client-search').value.trim().toLocaleLowerCase('pt-BR');
    const rows=RECEBIMENTOS.filter(r=>transactionType(r)==='Entrada'&&r.status==='Recebido'&&(r.category||'Venda')==='Venda'&&r.client&&(!start||(r.date||'')>=start));
    const groups=new Map();
    rows.forEach(r=>{const key=clientKey(r.client);if(!groups.has(key))groups.set(key,{name:r.client,purchases:0,revenue:0,profit:0,profitKnown:0,products:new Map(),lastDate:''});const g=groups.get(key),qty=Math.max(1,Number(r.productQty||1));g.purchases++;g.revenue+=receiptNet(r);if(r.cost!==null&&r.cost!==undefined&&r.cost!==''){g.profit+=receiptNet(r)-Number(r.cost||0);g.profitKnown++;}const pk=productKey(r.description),prod=g.products.get(pk)||{name:r.description||'Produto não informado',qty:0};prod.qty+=qty;g.products.set(pk,prod);if((r.date||'')>g.lastDate)g.lastDate=r.date||'';});
    let clients=[...groups.values()].filter(g=>!q||g.name.toLocaleLowerCase('pt-BR').includes(q)).sort((a,b)=>b.revenue-a.revenue);
    const total=clients.reduce((s,g)=>s+g.revenue,0),knownProfit=clients.reduce((s,g)=>s+g.profit,0),knownSales=clients.reduce((s,g)=>s+g.profitKnown,0),top=clients[0];
    const allProducts=new Map();clients.forEach(g=>g.products.forEach((p,k)=>{const item=allProducts.get(k)||{name:p.name,qty:0};item.qty+=p.qty;allProducts.set(k,item)}));const topProduct=[...allProducts.values()].sort((a,b)=>b.qty-a.qty)[0];
    document.getElementById('client-summary').innerHTML=`<div class="summary-row"><span>Clientes no período</span><strong>${clients.length}</strong></div><div class="summary-row"><span>Faturamento líquido</span><strong>${fmtMoney(total)}</strong></div><div class="summary-row"><span>Melhor cliente</span><strong>${top?escapeHtml(top.name)+' · '+fmtMoney(top.revenue):'—'}</strong></div><div class="summary-row"><span>Produto mais comprado</span><strong>${topProduct?escapeHtml(topProduct.name)+' · '+topProduct.qty+' venda'+(topProduct.qty===1?'':'s'):'—'}</strong></div><div class="summary-row"><span>Lucro apurado</span><strong>${knownSales?fmtMoney(knownProfit):'Informe o custo das vendas'}</strong></div>`;
    document.getElementById('client-ranking').innerHTML=clients.length?`<div class="client-rank head"><span>#</span><span>Cliente</span><span class="mobile-hide">Compras</span><span class="mobile-hide">Faturamento</span><span class="mobile-hide">Lucro apurado</span><span>Produto favorito</span></div>`+clients.map((g,i)=>{const favorite=[...g.products.values()].sort((a,b)=>b.qty-a.qty)[0];return `<div class="client-rank"><span class="rank-number">${i+1}</span><div><strong>${escapeHtml(g.name)}</strong><small style="display:block;color:var(--muted);">Última compra: ${g.lastDate?fmtDate(g.lastDate):'—'}</small></div><span class="mobile-hide">${g.purchases}</span><strong class="mobile-hide">${fmtMoney(g.revenue)}</strong><span class="mobile-hide">${g.profitKnown?fmtMoney(g.profit):'<small>não apurado</small>'}</span><span>${favorite?escapeHtml(favorite.name)+' · '+favorite.qty+'x':'—'}</span></div>`}).join(''):'<div class="empty">Nenhuma compra confirmada para os filtros selecionados.</div>';
  }
  function renderRecebimentos(){
    const date=document.getElementById('rec-date');if(date&&!date.value)date.value=todayISO();populateReceiptOrders();if(!EDITING_RECEIPT_ID)updateTransactionForm();
    const channel=document.getElementById('rec-channel');if(channel&&channel.options.length===0)channel.innerHTML=RECEIPT_CHANNELS.map(c=>`<option>${c}</option>`).join('');
    const channelFilter=document.getElementById('rec-filter-channel');if(channelFilter&&channelFilter.options.length===1)channelFilter.innerHTML='<option value="">Todos</option>'+RECEIPT_CHANNELS.map(c=>`<option>${c}</option>`).join('');
    const categoryFilter=document.getElementById('rec-filter-category');if(categoryFilter&&categoryFilter.options.length===1)categoryFilter.innerHTML='<option value="">Todas</option>'+[...new Set([...ENTRY_CATEGORIES,...EXIT_CATEGORIES])].map(c=>`<option>${c}</option>`).join('');
    populateClientList();renderReceiptKpis();renderReceiptMonths();renderClientAnalytics();
  }
  ['rec-filter-type','rec-filter-category','rec-filter-channel','rec-filter-status'].forEach(id=>document.getElementById(id).addEventListener('change',renderReceiptMonths));document.getElementById('rec-search').addEventListener('input',renderReceiptMonths);
  document.getElementById('client-period').addEventListener('change',renderClientAnalytics);document.getElementById('client-search').addEventListener('input',renderClientAnalytics);

  // ---------- tema claro/escuro compartilhado com o portal de produtos ----------
  const DENSITY_KEY='hl_density';
  const densityButton=document.getElementById('density-toggle-btn');
  function applyDensity(mode){
    const compact=mode==='compact';root.classList.toggle('density-compact',compact);
    densityButton.setAttribute('aria-pressed',String(compact));densityButton.textContent=compact?'Espaçar':'Compactar';densityButton.title=compact?'Usar visual mais espaçado':'Exibir mais informações na tela';
  }
  try{applyDensity(localStorage.getItem(DENSITY_KEY)||'comfortable');}catch(e){applyDensity('comfortable');}
  densityButton.addEventListener('click',()=>{const next=root.classList.contains('density-compact')?'comfortable':'compact';applyDensity(next);try{localStorage.setItem(DENSITY_KEY,next);}catch(e){}showToast(next==='compact'?'Modo compacto ativado.':'Modo confortável ativado.');});

  const THEME_KEY = 'hl_theme';
  function applyTheme(theme){
    const dark=theme==='dark'; root.classList.toggle('theme-dark',dark); document.body.style.background=dark?'#0A0A0D':'#F7F4EF';
    const btn=document.getElementById('theme-toggle-btn'); if(btn) btn.textContent=dark?'☀️':'🌙';
    try{const child=document.getElementById('catalog-admin-frame')?.contentDocument?.getElementById('portal-root');if(child){child.classList.toggle('theme-dark',dark);child.classList.toggle('theme-light',!dark);}}catch(e){}
  }
  document.getElementById('theme-toggle-btn').addEventListener('click',()=>{ const next=root.classList.contains('theme-dark')?'light':'dark'; applyTheme(next); try{localStorage.setItem(THEME_KEY,next);}catch(e){} });
  try{ applyTheme(localStorage.getItem(THEME_KEY)||'light'); }catch(e){ applyTheme('light'); }

  // ---------- inicialização ----------
  (async function init(){
    const { data: { session } } = await supabaseClient.auth.getSession();
    if(session) await enterApp();
  })();
})();
