import {setup,user,Store,esc,$,toast,modal} from '../shared/layout.js?v=20261114-0600';

const signInPage='../../Sign%20in/index.html';

function render(){
  const u=user();
  const formatTime=value=>{if(!value)return'Activity time unavailable';try{return `Last active ${new Date(value).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'})}`}catch{return'Last active recently'}};
  const ordered=[...(u.sessions||[])].sort((a,b)=>Number(b.current)-Number(a.current));
  const sessions=ordered.map(session=>`<div class="device session-row"><span class="session-device-icon"><img src="../../assets/icons/phosphor/devices-duotone.svg" alt="" aria-hidden="true"></span><div class="session-copy"><div class="session-heading"><b>${esc(session.device)}</b>${session.current?'<span class="badge current-badge">This device</span>':''}</div><p>${esc(session.app)} · ${esc(session.location||'Location unavailable')}</p><small>${esc(formatTime(session.last_active||session.created_at))}</small></div><button class="${session.current?'danger':'secondary'} session-signout" data-id="${esc(session.id)}" type="button">Sign out</button></div>`).join('');
  setup('devices',`<h1>Devices &amp; sessions</h1><p class="lead">Review and sign out every device linked to your Indo Account.</p><article class="panel sessions-panel"><div class="section-title sessions-title"><div><h2>Active sessions</h2><p class="session-count">${ordered.length} ${ordered.length===1?'session':'sessions'} connected</p></div><button class="danger" id="signout-all" type="button" ${ordered.length?'':'disabled'}>Sign out all devices</button></div>${sessions||'<p class="form-note">No active sessions.</p>'}</article>`);

  document.getElementById('device-layout-style')?.remove();
  const style=document.createElement('style');style.id='device-layout-style';
  style.textContent=`
    .sessions-title{align-items:center}.sessions-title h2{margin:0}.session-count{margin:3px 0 0;color:#607087;font-size:12px}.sessions-title .danger{margin-left:auto}.sessions-title .danger:disabled{opacity:.5;cursor:not-allowed}
    .session-row{display:grid;grid-template-columns:42px minmax(0,1fr) auto;align-items:center;gap:14px;padding:16px 0}.session-device-icon{width:40px;height:40px;display:grid;place-items:center;border-radius:13px;background:#e7e8ff}.session-device-icon img{width:26px;height:26px}.session-copy{min-width:0}.session-heading{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.session-copy b,.session-copy p,.session-copy small{overflow-wrap:anywhere}.session-copy p{margin:3px 0;color:#607087}.session-copy small{display:block;color:#78869a;font-size:12px}.current-badge{padding:3px 7px}.session-signout{justify-self:end;white-space:nowrap}
    @media(max-width:760px){.sessions-title{display:grid;grid-template-columns:1fr}.sessions-title .danger{width:100%;margin:8px 0 0}.session-row{grid-template-columns:36px minmax(0,1fr) auto;gap:10px}.session-device-icon{width:34px;height:34px}.session-device-icon img{width:22px;height:22px}.session-signout{align-self:center;padding:9px 11px}}
    @media(max-width:430px){.session-row{grid-template-columns:36px minmax(0,1fr)}.session-device-icon{grid-row:1}.session-signout{grid-column:1/-1;justify-self:stretch;width:100%}}
  `;
  document.head.append(style);

  document.querySelectorAll('.session-signout').forEach(button=>button.onclick=()=>{
    const session=u.sessions.find(item=>item.id===button.dataset.id);
    modal(`Sign out ${session?.current?'this device':session?.device||'device'}`,`<p>${session?.current?'You will be returned to the sign-in page.':'This session will immediately lose access to your Indo Account.'}</p>`,()=>{const signedOutHere=Store.signoutSession(button.dataset.id);if(signedOutHere){location.replace(signInPage);return}render();toast(`${session?.device||'Device'} signed out.`)},true);
  });

  $('#signout-all').onclick=()=>modal('Sign out all devices','<p>This will end every active session, including this device. You will need to sign in again.</p>',()=>{Store.signoutAllDevices();location.replace(signInPage)},true);
}

render();
