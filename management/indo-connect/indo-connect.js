import {setup,Store,esc,$,modal,toast} from '../shared/layout.js?v=20261113-2350';

const scopeLabels={
  openid:'Confirm your Indo sign-in',
  profile:'Name and profile details',
  email:'Indo email address',
  phone:'Mobile number',
  offline_access:'Stay signed in'
};
const allConnections=Store.listOauthConnections();
const activeConnections=allConnections.filter(connection=>connection.status!=='Revoked');

const formatDate=value=>{
  if(!value)return 'Not used yet';
  const date=new Date(value);
  return Number.isNaN(date.getTime())?esc(value):date.toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'});
};
const initials=value=>(value||'App').split(/\s+/).map(part=>part[0]).join('').slice(0,2).toUpperCase();
const permissionList=scopes=>(scopes?.length?scopes:['openid','profile']).map(scope=>`<li>${esc(scopeLabels[scope]||scope)}</li>`).join('');
const connectionRows=activeConnections.map(connection=>`<article class="connect-row" data-search="${esc(`${connection.app_name||''} ${connection.domain||''}`.toLowerCase())}">
  <span class="service-avatar" aria-hidden="true">${esc(initials(connection.app_name))}</span>
  <div class="service-copy"><h3>${esc(connection.app_name||'Connected service')}</h3><p>${esc(connection.domain||'Verified service')}</p><small>Last used ${formatDate(connection.last_used_at)}</small></div>
  <details class="service-details"><summary>Review</summary><div class="permission-card"><h4>Access granted</h4><ul>${permissionList(connection.scopes)}</ul><p>Your Indo Account password is never shared.</p><button class="danger revoke-access" data-id="${esc(connection.connection_id)}" data-name="${esc(connection.app_name||'this service')}" type="button">Remove access</button></div></details>
</article>`).join('');

setup('indo-connect',`<section class="connect-heading"><div><h1>Indo Connect</h1><p class="lead">Manage apps and websites where you use <strong>Continue with Indo</strong>.</p></div><span class="connect-count"><b>${activeConnections.length}</b> connected</span></section>
<section class="connect-hero"><img src="../../assets/icons/indo-connect.svg" alt=""><div><h2>Your sign-in connections, under your control</h2><p>Third-party services appear here only after you approve an Indo sign-in request. Sankalp, Eyesearch, and Eyebrowse stay separately in App center.</p></div></section>
<section class="connect-section"><div class="section-title"><div><h2>Apps and websites</h2><p>Review access or disconnect a service at any time.</p></div></div>
  ${activeConnections.length?`<label class="connection-search"><span aria-hidden="true">⌕</span><input id="connection-search" type="search" placeholder="Search connected services" aria-label="Search connected services"></label><div class="connection-list" id="connection-list">${connectionRows}</div><p class="no-results hidden" id="no-results">No connected service matches your search.</p>`:`<article class="connect-empty"><span class="empty-art"><img src="../../assets/icons/indo-connect.svg" alt=""></span><h3>No services connected yet</h3><p>When you choose <strong>Continue with Indo</strong> on another app or website and approve access, it will appear here.</p></article>`}
</section>
<section class="connect-section"><div class="section-title"><div><h2>Built for private sign-in</h2><p>Indo Connect shares only what you approve.</p></div></div><div class="protection-grid">
  <article><span class="protection-icon">●</span><h3>Password stays private</h3><p>Other services never receive or store your Indo Account password.</p></article>
  <article><span class="protection-icon">✓</span><h3>You approve access</h3><p>Every service must show the information it wants before you continue.</p></article>
  <article><span class="protection-icon">↗</span><h3>Remove access anytime</h3><p>Disconnecting a service revokes its Indo sign-in access without affecting your own Indo apps.</p></article>
</div></section>`);

const style=document.createElement('style');
style.textContent=`
  .connect-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;margin-bottom:20px}.connect-heading h1{margin-top:0}.connect-heading .lead{margin-bottom:0}.connect-count{display:flex;align-items:center;gap:7px;white-space:nowrap;background:#eaf4ff;color:#174f96;border-radius:999px;padding:8px 12px;font-size:13px}.connect-count b{font-size:15px}.connect-hero{display:grid;grid-template-columns:92px minmax(0,1fr);gap:22px;align-items:center;padding:24px;margin-bottom:24px;border:1px solid #d9e5f7;border-radius:20px;background:linear-gradient(120deg,#edf5ff 0%,#fff 68%);box-shadow:0 2px 8px #2337500b}.connect-hero img{width:88px;height:88px}.connect-hero h2{margin:0 0 7px;font-size:21px}.connect-hero p{margin:0;color:#5f6e82;line-height:1.55}.connect-section{margin-bottom:28px}.connect-section .section-title{margin-bottom:12px}.connect-section .section-title h2{font-size:20px}.connect-section .section-title p{margin:3px 0 0;color:#607087;font-size:14px}.connection-search{max-width:520px;display:flex;align-items:center;gap:10px;margin:0 0 12px;padding:11px 14px;border:1px solid #d7deea;border-radius:14px;background:#fff;color:#607087}.connection-search:focus-within{border-color:#2457d6;box-shadow:0 0 0 3px #2457d617}.connection-search input{width:100%;border:0;outline:0;background:transparent;color:#1f2937}.connection-list{overflow:hidden;border:1px solid #dfe5ee;border-radius:18px;background:#fff}.connect-row{display:grid;grid-template-columns:48px minmax(0,1fr) auto;gap:15px;align-items:center;padding:16px 18px;border-bottom:1px solid #e7ebf1}.connect-row:last-child{border-bottom:0}.service-avatar{width:46px;height:46px;display:grid;place-items:center;border-radius:14px;background:linear-gradient(145deg,#dce8ff,#eef4ff);color:#2457d6;font-size:15px;font-weight:800}.service-copy{min-width:0}.service-copy h3{margin:0;font-size:16px}.service-copy p,.service-copy small{display:block;margin:2px 0;color:#607087;overflow-wrap:anywhere}.service-copy p{font-size:13px}.service-copy small{font-size:12px}.service-details{position:relative}.service-details summary{list-style:none;cursor:pointer;border-radius:9px;background:#edf3ff;color:#2457d6;padding:10px 13px;font-weight:700;font-size:13px}.service-details summary::-webkit-details-marker{display:none}.permission-card{position:absolute;z-index:4;right:0;top:46px;width:min(330px,80vw);padding:17px;border:1px solid #d9e1ec;border-radius:14px;background:#fff;box-shadow:0 16px 38px #18263d2b}.permission-card h4{margin:0 0 8px}.permission-card ul{margin:0 0 12px;padding-left:19px;color:#526176;font-size:13px}.permission-card p{font-size:12px;color:#607087}.permission-card .danger{width:100%}.connect-empty{text-align:center;padding:42px 24px;border:1px dashed #cbd6e5;border-radius:20px;background:#fbfdff}.empty-art{display:grid;place-items:center;width:88px;height:88px;margin:0 auto 14px;border-radius:28px;background:#edf4ff}.empty-art img{width:76px;height:76px}.connect-empty h3{margin:0 0 7px;font-size:18px}.connect-empty p{max-width:560px;margin:0 auto;color:#607087;line-height:1.55}.protection-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.protection-grid article{padding:18px;border:1px solid #dfe5ee;border-radius:16px;background:#fff}.protection-grid h3{margin:11px 0 5px;font-size:15px}.protection-grid p{margin:0;color:#607087;font-size:13px;line-height:1.45}.protection-icon{width:36px;height:36px;display:grid;place-items:center;border-radius:12px;background:#e9f3ff;color:#2457d6;font-weight:800}.no-results{text-align:center;color:#607087;padding:22px}
  @media(max-width:760px){.connect-heading{align-items:center;margin-bottom:16px}.connect-heading .lead{font-size:13px}.connect-count{padding:7px 10px;font-size:11px}.connect-hero{grid-template-columns:64px minmax(0,1fr);gap:14px;padding:17px;border-radius:16px}.connect-hero img{width:62px;height:62px}.connect-hero h2{font-size:17px}.connect-hero p{font-size:13px}.connect-section{margin-bottom:22px}.protection-grid{grid-template-columns:1fr;gap:9px}.protection-grid article{display:grid;grid-template-columns:38px minmax(0,1fr);column-gap:11px;padding:14px}.protection-grid .protection-icon{grid-row:1/span 2}.protection-grid h3{margin:0 0 3px}.connect-row{grid-template-columns:44px minmax(0,1fr) auto;gap:10px;padding:13px}.service-avatar{width:42px;height:42px}.service-details summary{padding:9px 10px;font-size:12px}.permission-card{position:fixed;left:14px;right:14px;top:auto;bottom:14px;width:auto;max-height:70vh;overflow:auto}.connect-empty{padding:32px 18px}}
  @media(max-width:430px){.connect-heading{align-items:flex-start}.connect-heading .connect-count{margin-top:3px}.connect-hero{grid-template-columns:1fr;text-align:center}.connect-hero img{margin:auto}.connect-row{grid-template-columns:40px minmax(0,1fr)}.service-avatar{width:38px;height:38px}.service-details{grid-column:1/-1}.service-details summary{text-align:center}.connect-empty{padding:28px 14px}.empty-art{width:76px;height:76px}.empty-art img{width:66px;height:66px}}
`;
document.head.append(style);

$('#connection-search')?.addEventListener('input',event=>{
  const query=event.target.value.trim().toLowerCase();
  let visible=0;
  document.querySelectorAll('.connect-row').forEach(row=>{
    const show=row.dataset.search.includes(query);
    row.classList.toggle('hidden',!show);
    if(show)visible+=1;
  });
  $('#no-results').classList.toggle('hidden',visible>0);
});

document.querySelectorAll('.revoke-access').forEach(button=>button.addEventListener('click',()=>{
  const name=button.dataset.name;
  modal(`Remove ${name}?`,`<p>${esc(name)} will no longer be able to use your Indo sign-in. Your Sankalp, Eyesearch, and Eyebrowse access will not change.</p>`,()=>{
    Store.revokeOauthConnection(button.dataset.id);
    toast('Access removed.');
    setTimeout(()=>location.reload(),350);
  },true);
}));
