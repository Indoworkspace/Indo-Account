import {setup,user,Store,esc,$,toast,modal} from '../shared/layout.js?v=20261116-icons2';
import {icon as iconSvg} from '../../shared/icons.js?v=20261116-icons2';
import {Api} from '../../shared/api-client.js?v=20261116-icons2';

const signInPage='../../Sign%20in/index.html';
const appNames={SANKALPA:'Sankalp',EYESEARCH:'Eyesearch',EYEBROWSE:'Eyebrowse'};

function render(){
  const u=user();
  const formatTime=value=>{if(!value)return'Activity time unavailable';try{return `Last active ${new Date(value).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'})}`}catch{return'Last active recently'}};
  const browsers=[...(u.sessions||[])].sort((a,b)=>Number(b.current)-Number(a.current));
  const thisBrowser=browsers.filter(session=>session.current);
  const otherBrowsers=browsers.filter(session=>!session.current);
  const apps=Object.entries(u.apps||{})
    .map(([key,box])=>({key,label:box?.name||appNames[key]||key,sessions:box?.sessions||[]}))
    .filter(app=>app.sessions.length);
  const total=browsers.length+apps.reduce((sum,app)=>sum+app.sessions.length,0);

  const browserRow=session=>`<div class="device session-row"><span class="session-device-icon">${iconSvg('devices',20)}</span><div class="session-copy"><div class="session-heading"><b>${esc(session.device)}</b>${session.current?'<span class="badge current-badge">This device</span>':''}</div><p>${esc(session.app||'Indo Account')}</p><small>${esc(formatTime(session.last_active||session.created_at))}</small></div><button class="${session.current?'danger':'secondary'} session-signout" data-id="${esc(session.session_id||session.id)}" data-current="${session.current?'1':'0'}" type="button">${session.current?'Sign out this device':'Sign out this browser'}</button></div>`;

  const appRow=(app,session)=>`<div class="device session-row app-row"><span class="session-device-icon app">${iconSvg('plug',20)}</span><div class="session-copy"><div class="session-heading"><b>${esc(session.device||'Unknown device')}</b></div><p>${esc(app.label)} · signed in through the app</p><small>${esc(formatTime(session.last_used_at||session.created_at))}</small></div><button class="secondary app-signout" data-app="${esc(app.key)}" data-session="${esc(session.session_id||session.id)}" type="button">Sign out ${esc(app.label)}</button></div>`;

  const section=(title,note,rows,empty)=>`<article class="panel session-group"><div class="section-title group-title"><div><h2>${title}</h2><p class="session-count">${esc(note)}</p></div></div>${rows||`<p class="form-note">${empty}</p>`}</article>`;

  const browserRows=[...thisBrowser,...otherBrowsers].map(browserRow).join('');
  const appRows=apps.map(app=>`<div class="app-group-head"><b>${esc(app.label)}</b><button class="secondary app-all" data-app="${esc(app.key)}" type="button">Sign out ${esc(app.label)} everywhere</button></div>${app.sessions.map(session=>appRow(app,session)).join('')}`).join('');

  setup('devices',`<h1>Devices &amp; sessions</h1><p class="lead">Everything you are signed in on, in one place. Each button says exactly what it ends.</p>
    <article class="panel sessions-panel"><div class="section-title sessions-title"><div><h2>Summary</h2><p class="session-count">${total} ${total===1?'session':'sessions'} · ${browsers.length} in browsers · ${apps.reduce((sum,app)=>sum+app.sessions.length,0)} in apps</p></div><button class="danger" id="signout-all" type="button" ${browsers.length?'':'disabled'}>Sign out all devices</button></div></article>
    ${section('This browser','The session you are using now',thisBrowser.map(browserRow).join(''),'You are not signed in on this browser.')}
    ${section('Other browsers','Signed in elsewhere on a browser',otherBrowsers.map(browserRow).join(''),'No other browser sessions.')}
    ${section('Apps','Signed in through an Indo app',appRows,'No app sessions.')}`);

  document.getElementById('device-layout-style')?.remove();
  const style=document.createElement('style');style.id='device-layout-style';
  style.textContent=`
    .sessions-title{align-items:center}.sessions-title h2{margin:0}.session-count{margin:3px 0 0;color:#607087;font-size:12px}.sessions-title .danger{margin-left:auto}.sessions-title .danger:disabled{opacity:.5;cursor:not-allowed}
    .session-group{margin-top:14px}.group-title h2{margin:0;font-size:16px}
    .session-row{display:grid;grid-template-columns:42px minmax(0,1fr) auto;align-items:center;gap:14px;padding:14px 0;overflow:hidden}
    .session-row+.session-row,.app-group-head+.session-row{border-top:1px solid #eef1f6}
    .session-device-icon{width:40px;height:40px;display:grid;place-items:center;border-radius:12px;background:#f2f5f9;color:#41546b;flex:none}.session-device-icon.app{background:#f2f5f9;color:#41546b}
    .session-copy{min-width:0;overflow:hidden}.session-heading{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0}.session-copy b,.session-copy p,.session-copy small{overflow-wrap:anywhere;word-break:break-word}.session-copy b{display:block;line-height:1.3}.session-copy p{margin:3px 0;color:#607087}.session-copy small{display:block;color:#78869a;font-size:12px}
    .current-badge{padding:3px 7px}
    .session-signout,.app-signout{justify-self:end;white-space:nowrap;max-width:100%}
    .app-group-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:14px 0 6px}.app-group-head:not(:first-child){border-top:1px solid #eef1f6}.app-group-head b{margin-right:auto;font-size:15px;overflow-wrap:anywhere}
    @media(max-width:760px){.sessions-title{display:grid;grid-template-columns:1fr}.sessions-title .danger{width:100%;margin:8px 0 0}.session-row{grid-template-columns:36px minmax(0,1fr) auto;gap:10px}.session-device-icon{width:34px;height:34px}.session-device-icon img{width:22px;height:22px}.session-signout,.app-signout{align-self:center;padding:9px 11px;white-space:normal;text-align:center;max-width:130px}}
    @media(max-width:430px){.session-row{grid-template-columns:36px minmax(0,1fr)}.session-device-icon{grid-row:1}.session-signout,.app-signout{grid-column:1/-1;justify-self:stretch;width:100%;max-width:none}.app-group-head{display:grid;grid-template-columns:1fr;gap:8px}.app-group-head button{width:100%}}
  `;
  document.head.append(style);

  document.querySelectorAll('.session-signout').forEach(button=>button.onclick=()=>{
    const session=browsers.find(item=>(item.session_id||item.id)===button.dataset.id);
    const isCurrent=button.dataset.current==='1';
    const label=isCurrent?'this device':session?.device||'this browser';
    modal(`Sign out ${label}`,`<p>${isCurrent?'You will be returned to the sign-in page.':'That browser will immediately lose access to your Indo Account. Nothing else is signed out.'}</p>`,async()=>{
      button.disabled=true;button.textContent='Signing out…';
      try{
        await Api.signoutSession(button.dataset.id);
        // Only the session this browser is using sends you to sign-in. Anything else
        // just leaves the list, so a stray tap cannot log you out of your own session.
        if(isCurrent){location.replace(signInPage);return}
        await Store.refresh();
        render();
        toast('Signed out.');
      }catch(error){
        button.disabled=false;button.textContent=isCurrent?'Sign out this device':'Sign out this browser';
        toast(error.message);
      }
    },true);
  });

  document.querySelectorAll('.app-signout').forEach(button=>button.onclick=()=>{
    const app=apps.find(item=>item.key===button.dataset.app);
    modal(`Sign out ${app?.label||'app'}`,`<p>This ends only the ${esc(app?.label||'app')} session on that device. Your account and the other apps stay signed in.</p>`,()=>{
      button.disabled=true;button.textContent='Signing out…';
      Api.revokeAppSession(button.dataset.app,button.dataset.session).then(()=>{render();toast(`${app?.label||'App'} signed out.`)}).catch(error=>{button.disabled=false;button.textContent=`Sign out ${app?.label||'app'}`;toast(error.message)});
    },true);
  });

  document.querySelectorAll('.app-all').forEach(button=>button.onclick=()=>{
    const app=apps.find(item=>item.key===button.dataset.app);
    modal(`Sign out ${app?.label||'app'} everywhere`,`<p>Every ${esc(app?.label||'app')} session ends. Your browsers and the other apps stay signed in.</p>`,()=>{
      button.disabled=true;button.textContent='Signing out…';
      Api.revokeAppSessions(button.dataset.app).then(()=>{render();toast(`${app?.label||'App'} signed out everywhere.`)}).catch(error=>{button.disabled=false;button.textContent=`Sign out ${app?.label||'app'} everywhere`;toast(error.message)});
    },true);
  });

  $('#signout-all').onclick=()=>modal('Sign out all devices','<p>This ends every browser session and every app session, including this device. You will need to sign in again.</p>',()=>{
    const action=$('#signout-all');action.disabled=true;action.textContent='Signing out…';
    Store.signoutAllDevices().then(()=>location.replace(signInPage)).catch(error=>{action.disabled=false;action.textContent='Sign out all devices';toast(error.message)});
  },true);
}

async function start(){
  try{await Store.refresh();window.__indoSessionValidated=true}
  catch(error){render();toast(error.message);return}
  render();
}

start();
