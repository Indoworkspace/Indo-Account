import {setup,user,Store,esc,$,toast,modal} from '../shared/layout.js?v=20261113-2305';

const signInPage='../../Sign%20in/index.html';

function render(){
  const u=user();
  const sessions=u.sessions.map(session=>`<div class="device session-row"><div class="session-copy"><b>${esc(session.device)} ${session.current?'· This device':''}</b><p>${esc(session.app)} · ${esc(session.location)}</p></div><button class="secondary session-signout" data-id="${esc(session.id)}" type="button">Sign out</button></div>`).join('');
  setup('devices',`<h1>Devices &amp; sessions</h1><p class="lead">Review and sign out every device linked to your Indo Account.</p><article class="panel sessions-panel"><div class="section-title sessions-title"><h2>Active sessions</h2><button class="danger" id="signout-all" type="button" ${u.sessions.length?'':'disabled'}>Sign out all devices</button></div>${sessions||'<p class="form-note">No active sessions.</p>'}</article>`);

  document.getElementById('device-layout-style')?.remove();
  const style=document.createElement('style');style.id='device-layout-style';
  style.textContent=`
    .sessions-title{align-items:center}.sessions-title .danger{margin-left:auto}.sessions-title .danger:disabled{opacity:.5;cursor:not-allowed}
    .session-row{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:18px}.session-copy{min-width:0}.session-copy b,.session-copy p{overflow-wrap:anywhere}.session-signout{justify-self:end;white-space:nowrap}
    @media(max-width:760px){.sessions-title{display:grid;grid-template-columns:1fr}.sessions-title .danger{width:100%;margin:4px 0 0}.session-row{grid-template-columns:minmax(0,1fr) auto;gap:10px}.session-signout{align-self:center;padding:9px 12px}}
    @media(max-width:390px){.session-row{grid-template-columns:1fr}.session-signout{justify-self:stretch;width:100%}}
  `;
  document.head.append(style);

  document.querySelectorAll('.session-signout').forEach(button=>button.onclick=()=>{
    const session=u.sessions.find(item=>item.id===button.dataset.id);
    const signedOutHere=Store.signoutSession(button.dataset.id);
    if(signedOutHere){location.replace(signInPage);return}
    render();toast(`${session?.device||'Device'} signed out.`);
  });

  $('#signout-all').onclick=()=>modal('Sign out all devices','<p>This will end every active session, including this device. You will need to sign in again.</p>',()=>{Store.signoutAllDevices();location.replace(signInPage)},true);
}

render();
