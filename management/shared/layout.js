import {Store} from '../../shared/store.js';

const groups=[
  {title:'Account',items:[['home','Home','⌂'],['personal-info','Personal info','●'],['security','Security & sign-in','⌑'],['contacts','Contacts','♙'],['devices','Devices','▣'],['privacy','Data & privacy','◉'],['payments-gst','Payments & billing','▰'],['notifications','Notifications','◌']]},
  {title:'Your Indo apps',items:[['sankalp','Sankalp','S'],['eyesearch','Eyesearch','E'],['eyebrowse','Eyebrowse','B']]},
  {title:'More',items:[['help-support','Help & support','?'],['account-actions','About & account','i']]}
];
const paths={home:'home','personal-info':'personal-info',security:'security',contacts:'contacts',devices:'devices',privacy:'privacy','payments-gst':'payments-gst',notifications:'notifications',sankalp:'apps-data/sankalp',eyesearch:'apps-data/eyesearch',eyebrowse:'apps-data/eyebrowse','help-support':'help-support','account-actions':'account-actions'};
const $=s=>document.querySelector(s),esc=(v='')=>{const e=document.createElement('div');e.textContent=v;return e.innerHTML},initials=s=>s.split(' ').map(x=>x[0]).join('').slice(0,2).toUpperCase();

export {Store,esc,$};
export const user=()=>Store.current();

export function setup(active,content,prefix='../'){
  const u=user();
  if(!u){location.replace(`${prefix}../Sign%20in/index.html`);return}
  const nav=groups.map(group=>`<div class="nav-group"><p class="nav-title">${group.title}</p><nav class="nav">${group.items.map(([key,label,icon])=>`<a class="${key===active?'active':''}" href="${prefix}${paths[key]}/index.html"><span class="nav-icon icon-${key}">${icon}</span>${label}</a>`).join('')}</nav></div>`).join('');
  document.body.innerHTML=`<style>
    .account-shell{min-height:100vh;background:#f2f6fc}.topbar{box-shadow:none}.brand{color:#172033}
    .layout{max-width:1440px;grid-template-columns:260px minmax(0,1fr);gap:34px;padding-top:24px}.sidebar{top:82px;align-self:start}
    .profile-strip{display:flex;align-items:center;justify-content:center;min-height:170px;padding:8px 18px 24px;text-align:center}.profile-main .avatar{height:74px;width:74px;margin:0 auto 10px;background:#7759d9;color:#fff;font-size:25px}.profile-main h1{font-size:24px;margin:0}.profile-main p{margin:3px 0;color:#5e6b7e}
    .nav-group{margin:0 0 20px}.nav-title{margin:9px 12px;font-weight:700;text-transform:none;letter-spacing:0;font-size:12px}.nav a{display:flex;align-items:center;gap:11px;padding:9px 11px;margin:2px 0;border-radius:23px;color:#263348;font-weight:650}.nav a.active,.nav a:hover{background:#dceeff;color:#123d72}.nav-icon{width:32px;height:32px;display:grid;place-items:center;border-radius:50%;background:#dfe9ff;color:#2857a6;font-weight:800}
    .icon-personal-info{background:#d9f6db;color:#247447}.icon-security{background:#cdf0ff;color:#17688c}.icon-contacts{background:#ffe0ed;color:#a3356e}.icon-devices{background:#e6e7ff;color:#5154b0}.icon-privacy{background:#ffe4c7;color:#9c5a1f}.icon-payments-gst{background:#e5d8ff;color:#6d3bb5}.icon-notifications{background:#fff1bd;color:#9b7311}.icon-sankalp{background:#e4d8ff;color:#673ab7}.icon-eyesearch{background:#d7f4ef;color:#167569}.icon-eyebrowse{background:#dbeaff;color:#2457d6}
    .content{padding-bottom:48px}.content h1{font-size:30px}.panel{box-shadow:0 2px 8px #2337500b}.search-box{display:flex;align-items:center;gap:12px;max-width:650px;margin:0 auto 20px;padding:14px 18px;border-radius:28px;background:#fff;border:1px solid #dfe5ee;color:#607087}.quick-actions{display:flex;justify-content:center;gap:9px;flex-wrap:wrap;margin:0 auto 24px}.quick-actions a{padding:8px 14px;border:1px solid #bfc9d6;border-radius:9px;background:#fff;color:#263348;font-size:13px;font-weight:700}.app-placeholder{border-style:dashed;text-align:center;padding:46px 24px}.app-badge{width:64px;height:64px;margin:0 auto 14px;display:grid;place-items:center;border-radius:20px;background:#e5d9ff;color:#6332a7;font-size:27px;font-weight:800}.app-badge.eye{background:#d8f4ef;color:#167569}.app-badge.browse{background:#dceaff;color:#2457d6}
    @media(max-width:760px){.layout{display:block;padding-top:8px}.sidebar{position:static}.profile-strip{min-height:auto;padding:18px}.nav-group{margin-bottom:12px}.nav{display:flex;overflow:auto;gap:5px}.nav-title{display:none}.nav a{white-space:nowrap;margin:0}.nav-icon{width:27px;height:27px}.content h1{font-size:25px}}
  </style><div class="account-shell"><header class="topbar"><a class="brand" href="${prefix}home/index.html"><span class="mark">IN</span> Indo Account</a><div class="user-chip"><span>${esc(u.eyemail_id)}</span><span class="avatar">${initials(u.full_name)}</span><button class="signout" id="signout">Sign out</button></div></header><main class="layout"><aside class="sidebar">${nav}</aside><section class="content"><div class="profile-strip"><div class="profile-main"><span class="avatar">${initials(u.full_name)}</span><h1>${esc(u.full_name)}</h1><p>${esc(u.eyemail_id)}</p></div></div>${content}</section></main></div><div id="modal-root"></div>`;
  $('#signout').onclick=()=>{Store.signout();location.replace(`${prefix}../Sign%20in/index.html`)};
}
export function toast(message){const e=document.createElement('div');e.className='toast';e.textContent=message;document.body.append(e);setTimeout(()=>e.remove(),3000)}
export function modal(title,body,onConfirm,danger=false){$('#modal-root').innerHTML=`<div class="modal-backdrop"><section class="modal"><h2>${esc(title)}</h2>${body}<div class="modal-actions"><button class="secondary" id="cancel">Cancel</button><button class="${danger?'danger':'primary'}" id="confirm">Confirm</button></div></section></div>`;$('#cancel').onclick=()=>$('#modal-root').innerHTML='';$('#confirm').onclick=()=>{if(onConfirm()!==false)$('#modal-root').innerHTML=''}}
export function download(data,name){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=name;a.click();URL.revokeObjectURL(url);toast('Download started.')}
