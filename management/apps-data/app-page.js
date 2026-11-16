import {setup,esc,$,toast,modal,download} from '../shared/layout.js?v=20261116-paneltoken1';
import {Api} from '../../shared/api-client.js?v=20261116-paneltoken1';

const when=value=>{if(!value)return 'Never';const date=new Date(value);return Number.isNaN(date.getTime())?'Unknown':date.toLocaleString('en-IN',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})};
const rows=(items,empty,row)=>items?.length?`<ul class="data-list">${items.map(row).join('')}</ul>`:`<p class="form-note">${empty}</p>`;

// The app hands its own token in the URL fragment when it opens this panel, so the
// page is already signed in for that one app. The fragment never leaves the browser.
const fragmentToken=()=>{
  const match=/[#&]app_token=([^&]+)/.exec(location.hash||'');
  return match?decodeURIComponent(match[1]):'';
};
const handed=fragmentToken();
if(handed){
  Api.setSession(handed);
  history.replaceState({},'',location.pathname+location.search);
  addEventListener('pagehide',()=>Api.clearSession());
}

export function appPage(key,label){
  let box=null;

  const paint=()=>{
    const connected=!!box.connected;
    const status=connected?'Connected':box.status==='Paused'?'Paused':'Not connected';
    const sessions=box.sessions||[];
    const counts=box.counts||{history:0,saved:0};
    const preferences=Object.entries(box.preferences||{}).map(([name,value])=>`${name.replaceAll('_',' ')}: ${value}`).join(' · ');

    setup('apps-data',`
      <a class="secondary" href="../index.html">← All apps</a>
      <h1>${esc(label)} <span class="badge">${esc(status)}</span></h1>
      <p class="lead">Access and the data this app keeps in your Indo Account.</p>

      <article class="panel">
        <div class="switch-row"><div><b>App access</b><p class="form-note">Pausing stops new data from syncing. Other apps keep working.</p></div>
          <input class="switch" id="app-status" type="checkbox" ${box.status==='Active'?'checked':''} aria-label="App access"></div>
        <div class="switch-row"><div><b>Connection</b><p class="form-note">${connected?`Linked ${esc(when(box.connected_at))} · last used ${esc(when(box.last_used_at))}`:'This app is not linked to your Indo Account.'}</p></div>
          ${connected?'<button class="secondary" id="app-disconnect">Disconnect</button>':'<span class="form-note">Sign in from the app to link it.</span>'}</div>
      </article>

      <article class="panel"><h2>Sessions</h2>
        ${rows(sessions,'No active session. Sign in from the app to create one.',session=>`<li>${esc(session.device||'Unknown device')} · ${esc(when(session.last_used_at))} <button class="secondary" data-session="${esc(session.session_id)}">Sign out</button></li>`)}
        ${sessions.length?'<button class="danger" id="app-signout-all">Sign out this app everywhere</button>':''}
      </article>

      <div class="grid">
        <article class="panel"><h2>History</h2>
          ${rows(box.data?.history,'No history stored.',item=>`<li>${esc(item.title||item.origin)} <small>${esc(when(item.visited_at))}</small></li>`)}
          ${counts.history?'<button class="danger" id="app-clear-history">Clear history</button>':''}
        </article>
        <article class="panel"><h2>Saved items</h2>
          ${rows(box.data?.saved,'No saved items.',item=>`<li><a href="${esc(item.url)}" target="_blank" rel="noopener">${esc(item.title||item.url)}</a></li>`)}
          <p class="form-note">Saved items are added and removed by ${esc(label)} itself.</p>
        </article>
      </div>

      <article class="panel"><h2>Preferences</h2>
        <p class="form-note">${esc(preferences||'Nothing stored yet.')}</p>
        <button class="secondary" id="app-export">Export app data</button>
      </article>

      <article class="panel"><h2>Delete app data</h2>
        <p class="form-note">Removes this app's history, saved items and preferences. Your account and the other apps stay untouched.</p>
        <button class="danger" id="app-clear-all">Clear all app data</button>
      </article>`, '../../');

    const busy=value=>document.querySelectorAll('.panel button,.switch-row button').forEach(control=>control.disabled=value);

    $('#app-status').onchange=async event=>{
      busy(true);
      try{box=await Api.setAppStatus(key,event.target.checked?'Active':'Paused');toast(event.target.checked?'App access resumed.':'App paused.');paint()}
      catch(error){event.target.checked=!event.target.checked;toast(error.message);busy(false)}
    };

    const disconnect=$('#app-disconnect');
    if(disconnect)disconnect.onclick=()=>modal(`Disconnect ${label}`,`<p>Every ${esc(label)} session will be removed. The app keeps its place in your account, and other apps stay connected.</p>`,async()=>{
      try{await Api.revokeAppSessions(key);toast('App disconnected.');await load()}catch(error){toast(error.message)}
    },true);

    document.querySelectorAll('[data-session]').forEach(button=>button.onclick=async()=>{
      busy(true);
      try{await Api.revokeAppSession(key,button.dataset.session);toast('Session signed out.');await load()}catch(error){toast(error.message);busy(false)}
    });

    const signoutAll=$('#app-signout-all');
    if(signoutAll)signoutAll.onclick=()=>modal('Sign out this app',`<p>All ${esc(label)} sessions will be signed out. Your other apps and this browser stay signed in.</p>`,async()=>{
      try{await Api.revokeAppSessions(key);toast('Signed out of '+label+'.');await load()}catch(error){toast(error.message)}
    },true);

    const clearHistory=$('#app-clear-history');
    if(clearHistory)clearHistory.onclick=()=>modal('Clear history',`<p>Delete only ${esc(label)} history? Saved items and preferences stay.</p>`,async()=>{
      try{await Api.clearAppHistory(key);toast('History cleared.');await load()}catch(error){toast(error.message)}
    },true);

    $('#app-export').onclick=async()=>{
      try{download(await Api.exportApp(key),`${key.toLowerCase()}-data.json`)}catch(error){toast(error.message)}
    };

    $('#app-clear-all').onclick=()=>modal('Clear all app data',`<p>Delete all ${esc(label)} history, saved items and preferences? This cannot be undone.</p>`,async()=>{
      try{await Api.clearAppData(key);toast('App data cleared.');await load()}catch(error){toast(error.message)}
    },true);
  };

  async function load(){
    setup('apps-data',`<h1>${esc(label)}</h1><p class="lead">Loading app data…</p>`,'../../');
    try{box=await Api.getApp(key);paint()}
    catch(error){setup('apps-data',`<a class="secondary" href="../index.html">← All apps</a><h1>${esc(label)}</h1><p class="form-note">${esc(error.message)}</p>`,'../../')}
  }

  load();
}
