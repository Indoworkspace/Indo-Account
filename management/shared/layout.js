import {Store} from '../../shared/store.js';

const icons={
  home:'<path d="m3 10 9-7 9 7v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 21v-6h6v6"/>',
  'personal-info':'<circle cx="12" cy="8" r="3.2"/><path d="M5 21c.8-4 3.2-6 7-6s6.2 2 7 6"/>',
  security:'<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  contacts:'<circle cx="9" cy="8" r="2.5"/><circle cx="16.5" cy="9" r="2"/><path d="M4.5 20c.6-3.4 2.2-5 4.8-5 2.7 0 4.3 1.6 4.9 5M14 16c3 0 4.8 1.2 5.3 4"/>',
  devices:'<rect x="4" y="4" width="16" height="12" rx="1.5"/><path d="M9 20h6M12 16v4"/>',
  privacy:'<path d="M12 3 20 6v5c0 5-3.4 8.4-8 10-4.6-1.6-8-5-8-10V6z"/><path d="M9 12l2 2 4-4"/>',
  'payments-gst':'<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h4"/>',
  notifications:'<path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
  sankalp:'<path d="M6 19c-4-5 0-14 7-14 5 0 8 4 6 9-1 4-5 6-9 4l-4 1z"/><path d="M9 11h6M9 14h4"/>',
  eyesearch:'<circle cx="11" cy="11" r="6"/><path d="m16 16 5 5"/>',
  eyebrowse:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
  'help-support':'<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.6 2.6 0 1 1 4.1 2.1c-1.3.9-1.6 1.3-1.6 2.9M12 17h.01"/>',
  'account-actions':'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>'
};
const groups=[
  {title:'Account',items:[['home','Home'],['personal-info','Personal info'],['security','Security & sign-in'],['contacts','Contacts'],['devices','Devices'],['privacy','Data & privacy'],['payments-gst','Payments & billing'],['notifications','Notifications']]},
  {title:'Your Indo apps',items:[['sankalp','Sankalp'],['eyesearch','Eyesearch'],['eyebrowse','Eyebrowse']]},
  {title:'More',items:[['help-support','Help & support'],['account-actions','About & account']]}
];
const paths={home:'home','personal-info':'personal-info',security:'security',contacts:'contacts',devices:'devices',privacy:'privacy','payments-gst':'payments-gst',notifications:'notifications',sankalp:'apps-data/sankalp',eyesearch:'apps-data/eyesearch',eyebrowse:'apps-data/eyebrowse','help-support':'help-support','account-actions':'account-actions'};
const $=s=>document.querySelector(s),esc=(v='')=>{const e=document.createElement('div');e.textContent=v;return e.innerHTML},initials=s=>s.split(' ').map(x=>x[0]).join('').slice(0,2).toUpperCase();

export {Store,esc,$};
export const user=()=>Store.current();

export function setup(active,content,prefix='../'){
  const u=user();
  if(!u){location.replace(`${prefix}../Sign%20in/index.html`);return}
  const nav=groups.map(group=>`<div class="nav-group"><p class="nav-title">${group.title}</p><nav class="nav">${group.items.map(([key,label])=>`<a class="${key===active?'active':''}" href="${prefix}${paths[key]}/index.html"><span class="nav-icon icon-${key}"><svg viewBox="0 0 24 24" aria-hidden="true">${icons[key]}</svg></span>${label}</a>`).join('')}</nav></div>`).join('');
  document.body.innerHTML=`<style>
    .account-shell{min-height:100vh;background:#f2f6fc}.topbar{box-shadow:none}.brand{color:#172033}
    .layout{max-width:1440px;grid-template-columns:260px minmax(0,1fr);gap:34px;padding-top:24px}.sidebar{top:82px;align-self:start}
    .profile-strip{display:flex;align-items:center;justify-content:center;min-height:170px;padding:8px 18px 24px;text-align:center}.profile-main .avatar{height:74px;width:74px;margin:0 auto 10px;background:#7759d9;color:#fff;font-size:25px}.profile-main h1{font-size:24px;margin:0}.profile-main p{margin:3px 0;color:#5e6b7e}
    .nav-group{margin:0 0 20px}.nav-title{margin:9px 12px;font-weight:700;text-transform:none;letter-spacing:0;font-size:12px}.nav a{display:flex;align-items:center;gap:11px;padding:9px 11px;margin:2px 0;border-radius:23px;color:#263348;font-weight:650}.nav a.active,.nav a:hover{background:#dceeff;color:#123d72}.nav-icon{width:32px;height:32px;display:grid;place-items:center;border-radius:50%;background:#dfe9ff;color:#2857a6}.nav-icon svg{width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
    .icon-personal-info{background:#d9f6db;color:#247447}.icon-security{background:#cdf0ff;color:#17688c}.icon-contacts{background:#ffe0ed;color:#a3356e}.icon-devices{background:#e6e7ff;color:#5154b0}.icon-privacy{background:#ffe4c7;color:#9c5a1f}.icon-payments-gst{background:#e5d8ff;color:#6d3bb5}.icon-notifications{background:#fff1bd;color:#9b7311}.icon-sankalp{background:#e4d8ff;color:#673ab7}.icon-eyesearch{background:#d7f4ef;color:#167569}.icon-eyebrowse{background:#dbeaff;color:#2457d6}
    .content{padding-bottom:48px}.content h1{font-size:30px}.panel{box-shadow:0 2px 8px #2337500b}.search-box{display:flex;align-items:center;gap:12px;max-width:650px;margin:0 auto 20px;padding:14px 18px;border-radius:28px;background:#fff;border:1px solid #dfe5ee;color:#607087}.quick-actions{display:flex;justify-content:center;gap:9px;flex-wrap:wrap;margin:0 auto 24px}.quick-actions a{padding:8px 14px;border:1px solid #bfc9d6;border-radius:9px;background:#fff;color:#263348;font-size:13px;font-weight:700}.app-placeholder{border-style:dashed;text-align:center;padding:46px 24px}.app-badge{width:64px;height:64px;margin:0 auto 14px;display:grid;place-items:center;border-radius:20px;background:#e5d9ff;color:#6332a7;font-size:27px;font-weight:800}.app-badge.eye{background:#d8f4ef;color:#167569}.app-badge.browse{background:#dceaff;color:#2457d6}.info-list{overflow:hidden;background:#fff;border:1px solid #e1e7ef;border-radius:18px}.info-row{width:100%;display:grid;grid-template-columns:42px minmax(0,1fr) auto;gap:14px;align-items:center;padding:15px 20px;background:#fff;border:0;border-bottom:1px solid #e7ebf1;text-align:left;color:#1f2937}.info-row:last-child{border-bottom:0}.info-row:not(.static):hover{background:#f8fbff;cursor:pointer}.info-row b,.info-row small{display:block}.info-row b{font-size:15px}.info-row small{margin-top:2px;color:#607087;font-size:14px;overflow-wrap:anywhere}.info-icon{width:30px;height:30px;display:grid;place-items:center;color:#44546a}.info-icon svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}.row-action{color:#2457d6;font-size:13px;font-weight:700}.locked{color:#78869a;font-size:12px}.edit-panel{margin-top:18px}
    @media(max-width:760px){.layout{display:block;padding-top:8px}.sidebar{position:static}.profile-strip{min-height:auto;padding:18px}.nav-group{margin-bottom:12px}.nav{display:flex;overflow:auto;gap:5px}.nav-title{display:none}.nav a{white-space:nowrap;margin:0}.nav-icon{width:27px;height:27px}.content h1{font-size:25px}}
  </style><div class="account-shell"><header class="topbar"><a class="brand" href="${prefix}home/index.html"><span class="mark">IN</span> Indo Account</a><div class="user-chip"><span>${esc(u.eyemail_id)}</span><span class="avatar">${initials(u.full_name)}</span><button class="signout" id="signout">Sign out</button></div></header><main class="layout"><aside class="sidebar">${nav}</aside><section class="content"><div class="profile-strip"><div class="profile-main"><span class="avatar">${initials(u.full_name)}</span><h1>${esc(u.full_name)}</h1><p>${esc(u.eyemail_id)}</p></div></div>${content}</section></main></div><div id="modal-root"></div>`;
  $('#signout').onclick=()=>{Store.signout();location.replace(`${prefix}../Sign%20in/index.html`)};
}
export function toast(message){const e=document.createElement('div');e.className='toast';e.textContent=message;document.body.append(e);setTimeout(()=>e.remove(),3000)}
export function modal(title,body,onConfirm,danger=false){$('#modal-root').innerHTML=`<div class="modal-backdrop"><section class="modal"><h2>${esc(title)}</h2>${body}<div class="modal-actions"><button class="secondary" id="cancel">Cancel</button><button class="${danger?'danger':'primary'}" id="confirm">Confirm</button></div></section></div>`;$('#cancel').onclick=()=>$('#modal-root').innerHTML='';$('#confirm').onclick=()=>{if(onConfirm()!==false)$('#modal-root').innerHTML=''}}
export function download(data,name){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=name;a.click();URL.revokeObjectURL(url);toast('Download started.')}
