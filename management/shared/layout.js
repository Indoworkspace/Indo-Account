import {Store} from '../../shared/store.js?v=20261113-2210';

const icons={
  home:'<path d="m3 10 9-7 9 7v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 21v-6h6v6"/>',
  'personal-info':'<circle cx="12" cy="8" r="3.2"/><path d="M5 21c.8-4 3.2-6 7-6s6.2 2 7 6"/>',
  security:'<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
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
  {title:'Account',items:[['home','Home'],['personal-info','Personal info'],['security','Security & sign-in'],['devices','Devices'],['privacy','Data & privacy'],['payments-gst','Payments & billing'],['notifications','Notifications']]},
  {title:'App center',items:[['sankalp','Sankalp'],['eyesearch','Eyesearch'],['eyebrowse','Eyebrowse']]},
  {title:'More',items:[['help-support','Help & support'],['account-actions','About & account']]}
];
const paths={home:'home','personal-info':'personal-info',security:'security',devices:'devices',privacy:'privacy','payments-gst':'payments-gst',notifications:'notifications',sankalp:'apps-data/sankalp',eyesearch:'apps-data/eyesearch',eyebrowse:'apps-data/eyebrowse','help-support':'help-support','account-actions':'account-actions'};
const $=s=>document.querySelector(s),esc=(v='')=>{const e=document.createElement('div');e.textContent=v;return e.innerHTML},initials=s=>s.split(' ').map(x=>x[0]).join('').slice(0,2).toUpperCase();

export {Store,esc,$};
const emptyUser=()=>({
  full_name:'',nickname:'',eyemail_id:'',secondary_email:'',phone:'',dob:'',language:'kn',gender:'',two_step:false,
  sessions:[],notifications:{security:false,signin:false,updates:false,billing:false,news:false},billing:{company:'',gstin:'',address:'',state:''},invoices:[],apps:{
    SANKALPA:{name:'Sankalp',status:'Paused',connected:false,data:{history:[],saved:[],memory:[],preferences:{}}},
    EYESEARCH:{name:'Eyesearch',status:'Paused',connected:false,data:{history:[],saved:[],memory:[],preferences:{}}},
    EYEBROWSE:{name:'Eyebrowse',status:'Paused',connected:false,data:{history:[],saved:[],memory:[],preferences:{}}}
  }
});
export const user=()=>Store.current()||emptyUser();

export function setup(active,content,prefix='../'){
  const signedIn=Store.current();
  if(!signedIn){location.replace(`${prefix}../Sign%20in/index.html`);return}
  const u=signedIn;
  const nav=groups.map(group=>`<div class="nav-group"><p class="nav-title">${group.title}</p><nav class="nav">${group.items.map(([key,label])=>`<a class="${key===active?'active':''}" href="${prefix}${paths[key]}/index.html"><span class="nav-icon icon-${key}"><img src="${prefix}../assets/icons/${key}.svg" alt="" aria-hidden="true"></span>${label}</a>`).join('')}</nav></div>`).join('');
  const profileMotion=`<div class="avatar-motion" aria-hidden="true"><span class="paint paint-blue"></span><span class="paint paint-green"></span><span class="paint paint-purple"></span><span class="paint paint-pink"></span><span class="paint paint-gold"></span><span class="paint paint-star">✦</span></div>`;
  document.body.innerHTML=`<style>
    .account-shell{min-height:100vh;background:#f2f6fc}.topbar{box-shadow:none}.brand{color:#172033}
    .layout{max-width:1440px;grid-template-columns:260px minmax(0,1fr);gap:34px;padding-top:24px}.sidebar{top:82px;align-self:start}
    .profile-strip{display:flex;align-items:center;justify-content:center;min-height:170px;padding:8px 18px 24px;text-align:center}.profile-main{position:relative}.profile-main .avatar{height:74px;width:74px;margin:0 auto 10px;background:linear-gradient(145deg,#8d62e4 8%,#7350cc 60%,#a578e8);color:#fff;font-size:25px;border:3px solid #eee5ff;box-shadow:-5px 4px 0 #d4b7ff,5px -3px 0 #c5e5ff;position:relative;z-index:2;animation:avatar-settle 1.35s cubic-bezier(.2,.85,.25,1) both}.profile-main h1{font-size:24px;margin:0}.profile-main p{margin:3px 0;color:#5e6b7e}.avatar-motion{position:absolute;left:50%;top:2px;width:1px;height:1px;z-index:1}.paint{position:absolute;display:grid;place-items:center;opacity:0;animation:paint-arrive 1.35s cubic-bezier(.2,.85,.25,1) both}.paint-blue{width:31px;height:25px;border-radius:56% 44% 51% 49%;background:#5aaaff;left:-82px;top:14px;transform:rotate(-19deg);animation-delay:.03s}.paint-green{width:23px;height:29px;border-radius:57% 43% 50% 50%;background:#36c993;left:-51px;top:46px;transform:rotate(20deg);animation-delay:.12s}.paint-purple{width:34px;height:22px;border-radius:45% 55% 44% 56%;background:#a77bea;left:42px;top:6px;transform:rotate(14deg);animation-delay:.08s}.paint-pink{width:27px;height:27px;border-radius:50% 40% 50% 45%;background:#ef5e85;left:72px;top:31px;animation-delay:.18s}.paint-gold{width:17px;height:17px;border-radius:4px 10px 4px 10px;background:#ffc34f;left:39px;top:56px;transform:rotate(25deg);animation-delay:.25s}.paint-star{color:#7245bc;font-size:22px;left:-14px;top:-29px;animation-delay:.31s}@keyframes paint-arrive{0%{opacity:0;transform:translate(var(--start-x,0),22px) scale(.25) rotate(-38deg)}28%{opacity:1}72%{opacity:1;transform:translate(0,0) scale(1) rotate(0)}100%{opacity:0;transform:translate(0,0) scale(.15) rotate(12deg)}}@keyframes avatar-settle{0%{transform:scale(.42);opacity:.15}60%{transform:scale(1.1);opacity:1}100%{transform:scale(1)}}
    .nav-group{margin:0 0 20px}.nav-title{margin:9px 12px;font-weight:700;text-transform:none;letter-spacing:0;font-size:12px}.nav a{display:flex;align-items:center;gap:11px;padding:9px 11px;margin:2px 0;border-radius:23px;color:#263348;font-weight:650}.nav a.active,.nav a:hover{background:#dceeff;color:#123d72}.nav-icon{width:36px;height:36px;display:grid;place-items:center}.nav-icon img{width:36px;height:36px;display:block;filter:drop-shadow(0 1px 1px #26334818)}
    .icon-personal-info{background:#d9f6db;color:#247447}.icon-security{background:#cdf0ff;color:#17688c}.icon-contacts{background:#ffe0ed;color:#a3356e}.icon-devices{background:#e6e7ff;color:#5154b0}.icon-privacy{background:#ffe4c7;color:#9c5a1f}.icon-payments-gst{background:#e5d8ff;color:#6d3bb5}.icon-notifications{background:#fff1bd;color:#9b7311}.icon-sankalp{background:#e4d8ff;color:#673ab7}.icon-eyesearch{background:#d7f4ef;color:#167569}.icon-eyebrowse{background:#dbeaff;color:#2457d6}
    .content{padding-bottom:48px}.content h1{font-size:30px}.panel{box-shadow:0 2px 8px #2337500b}.search-box{display:flex;align-items:center;gap:12px;max-width:650px;margin:0 auto 20px;padding:14px 18px;border-radius:28px;background:#fff;border:1px solid #dfe5ee;color:#607087}.quick-actions{display:flex;justify-content:center;gap:9px;flex-wrap:wrap;margin:0 auto 24px}.quick-actions a{padding:8px 14px;border:1px solid #bfc9d6;border-radius:9px;background:#fff;color:#263348;font-size:13px;font-weight:700}.home-section{background:#fff;border:1px solid #e1e7ef;border-radius:16px;padding:20px;margin-bottom:16px;box-shadow:0 2px 8px #2337500b}.overview-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.overview-card{display:grid;grid-template-columns:42px minmax(0,1fr) auto;gap:10px;align-items:center;padding:14px;border:1px solid #e1e7ef;border-radius:13px;color:#1f2937;background:#fbfdff;transition:.18s ease}.overview-card:hover{transform:translateY(-2px);border-color:#bdd2f7;box-shadow:0 7px 16px #23446a12}.overview-card img{width:40px;height:40px}.overview-copy b,.overview-copy small{display:block}.overview-copy b{font-size:14px}.overview-copy small{margin-top:3px;color:#637083;font-size:12px;line-height:1.35}.card-arrow{font-size:25px;color:#2457d6;font-weight:400}.app-placeholder{border-style:dashed;text-align:center;padding:46px 24px}.app-badge{width:64px;height:64px;margin:0 auto 14px;display:grid;place-items:center;border-radius:20px;background:#e5d9ff;color:#6332a7;font-size:27px;font-weight:800}.app-badge.eye{background:#d8f4ef;color:#167569}.app-badge.browse{background:#dceaff;color:#2457d6}.info-list{overflow:hidden;background:#fff;border:1px solid #e1e7ef;border-radius:18px}.info-row{width:100%;display:grid;grid-template-columns:42px minmax(0,1fr) auto;gap:14px;align-items:center;padding:15px 20px;background:#fff;border:0;border-bottom:1px solid #e7ebf1;text-align:left;color:#1f2937}.info-row:last-child{border-bottom:0}.info-row:not(.static):hover{background:#f8fbff;cursor:pointer}.info-row b,.info-row small{display:block}.info-row b{font-size:15px}.info-row small{margin-top:2px;color:#607087;font-size:14px;overflow-wrap:anywhere}.info-icon{width:30px;height:30px;display:grid;place-items:center;color:#44546a}.info-icon svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}.row-action{color:#2457d6;font-size:13px;font-weight:700}.locked{color:#78869a;font-size:12px}.edit-panel{margin-top:18px}
    .menu-toggle{display:none;border:0;background:#edf3ff;color:#2457d6;border-radius:9px;width:38px;height:38px;padding:8px}.menu-toggle svg{width:22px;height:22px;stroke:currentColor;stroke-width:2.4;stroke-linecap:round}.menu-scrim{display:none}
    @media(max-width:760px){.account-shell{font-size:14px}.topbar{height:60px;padding:0 12px}.topbar .brand{font-size:15px}.topbar .mark{width:30px;height:30px}.menu-toggle{display:grid;place-items:center;order:-1;width:35px;height:35px}.layout{display:block;padding:6px 12px}.sidebar{display:none}.sidebar.open{display:block;position:fixed;z-index:20;left:0;top:60px;bottom:0;height:calc(100dvh - 60px);max-height:none;width:min(282px,82vw);overflow:auto;background:#f8fbff;padding:8px 12px;box-shadow:12px 0 28px #1522382e}.menu-scrim.show{display:block;position:fixed;z-index:19;inset:60px 0 0;background:#17213255}.profile-strip{min-height:auto;padding:14px}.profile-main .avatar{width:66px;height:66px;font-size:22px}.nav-group{margin-bottom:7px}.nav-title{display:block;margin:5px 9px;font-size:11px}.nav{display:grid;overflow:visible;gap:1px}.nav a{white-space:normal;margin:1px 0;padding:5px 8px;font-size:13px}.nav-icon,.nav-icon img{width:28px;height:28px}.content{min-width:0;padding-bottom:28px}.content h1{font-size:23px;line-height:1.2}.lead{margin-bottom:16px;font-size:14px}.panel{padding:16px;margin-bottom:14px;border-radius:14px}.field{margin:12px 0}.field input,.field select,.field textarea{font-size:16px;padding:11px}.search-box{padding:11px 14px;margin-bottom:14px;font-size:14px}.quick-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin-bottom:16px}.quick-actions a{padding:8px 7px;text-align:center;font-size:12px}.home-section{padding:15px;margin-bottom:13px}.overview-grid{grid-template-columns:1fr;gap:8px}.overview-card{padding:11px;grid-template-columns:36px minmax(0,1fr) auto}.overview-card img{width:34px;height:34px}.section-title{gap:10px;align-items:flex-start}.section-title h2{font-size:17px}.grid,.grid.three{grid-template-columns:1fr;gap:12px}.app-card{padding:15px}.app-badge{width:54px;height:54px;font-size:22px}.switch-row{align-items:flex-start;gap:12px;padding:12px 0}.switch{flex:0 0 42px}.device{flex-direction:column;align-items:flex-start;padding:12px 0}.table-wrap{margin:0 -4px;-webkit-overflow-scrolling:touch}.info-list{border-radius:14px}.info-row{grid-template-columns:30px minmax(0,1fr) auto;gap:9px;padding:12px}.info-row b{font-size:14px}.info-row small{font-size:13px}.info-icon{width:28px;height:28px}.row-action,.locked{font-size:11px}.user-chip .signout{font-size:11px}.toast{left:12px;right:12px;bottom:12px;max-width:none}}
  </style><div class="account-shell"><header class="topbar"><button class="menu-toggle" id="menu-toggle" aria-label="Open menu" aria-expanded="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button><a class="brand" href="${prefix}home/index.html"><span class="mark">IN</span> Indo Account</a><div class="user-chip"><span>${esc(u.eyemail_id)}</span><span class="avatar">${initials(u.full_name)}</span><button class="signout" id="signout">Sign out</button></div></header><div class="menu-scrim" id="menu-scrim"></div><main class="layout"><aside class="sidebar" id="management-menu">${nav}</aside><section class="content"><div class="profile-strip"><div class="profile-main">${profileMotion}<span class="avatar">${initials(u.full_name)}</span><h1>${esc(u.full_name)}</h1><p>${esc(u.eyemail_id)}</p></div></div>${content}</section></main></div><div id="modal-root"></div>`;
  // Shared responsive spacing: keeps every management section balanced on both desktop and mobile.
  document.getElementById('indo-responsive-layout')?.remove();
  const responsiveStyle=document.createElement('style');
  responsiveStyle.id='indo-responsive-layout';
  responsiveStyle.textContent=`
    .content .panel,.content .home-section{min-width:0}
    .section-title{gap:14px}
    .section-title>*{min-width:0}
    .app-card{display:flex;flex-direction:column;align-items:flex-start;min-width:0;gap:0}
    .app-card .app-badge{margin:0 0 14px}
    .app-card h2,.app-card h3{overflow-wrap:anywhere}
    .app-card p{overflow-wrap:anywhere}
    .app-card .secondary{align-self:flex-end;margin-top:auto;white-space:nowrap}
    .app-list{display:grid;gap:12px}
    .app-list .app-card{display:grid;grid-template-columns:64px minmax(0,1fr) auto;column-gap:16px;align-items:center;min-height:96px;padding:16px 18px}
    .app-list .app-badge{grid-column:1;margin:0;width:60px;height:60px}
    .app-list .app-card-copy{grid-column:2;min-width:0}
    .app-list .app-card-copy h2,.app-list .app-card-copy h3{margin:0 0 3px}
    .app-list .app-card-copy p{margin:2px 0}
    .app-list .secondary{grid-column:3;align-self:center;justify-self:end;margin:0}
    .switch-row button{flex:0 0 auto}
    .device button{flex:0 0 auto}
    @media(max-width:760px){
      .content{padding-inline:0}
      .section-title{align-items:center;flex-wrap:wrap;margin-bottom:14px}
      .section-title h2{flex:1 1 auto}
      .panel,.home-section{overflow:hidden}
      .switch-row{flex-wrap:wrap}
      .switch-row>div{min-width:0}
      .switch-row button{margin-left:auto}
      .device{gap:10px}
      .device .secondary{align-self:flex-end}
      .app-card{padding:16px;min-height:118px}
      .app-card .secondary{min-height:40px;display:inline-grid;place-items:center}
      .app-list{gap:10px}
      .app-list .app-card{grid-template-columns:54px minmax(0,1fr) auto;column-gap:12px;min-height:82px;padding:14px}
      .app-list .app-badge{width:52px;height:52px}
      .app-list .app-card-copy h2,.app-list .app-card-copy h3{font-size:16px}
      .app-list .app-card-copy p{font-size:13px;line-height:1.35}
      .app-list .secondary{grid-column:3;grid-row:1;align-self:center;justify-self:end;margin:0;padding:9px 11px;font-size:12px}
      .home-section .app-card,.content>.panel .grid.three .app-card{display:grid;grid-template-columns:56px minmax(0,1fr) auto;column-gap:13px;align-items:center}
      .home-section .app-card .app-badge,.content>.panel .grid.three .app-card .app-badge{grid-row:span 2;margin:0;width:54px;height:54px}
      .home-section .app-card h2,.home-section .app-card h3,.content>.panel .grid.three .app-card h2,.content>.panel .grid.three .app-card h3{grid-column:2;margin:0}
      .home-section .app-card p,.content>.panel .grid.three .app-card p{grid-column:2;margin:3px 0 0}
      .home-section .app-card .secondary,.content>.panel .grid.three .app-card .secondary{grid-column:3;grid-row:1 / span 2;align-self:center;justify-self:end;margin:0}
    }
    @media(max-width:479px){
      .app-card{padding:14px}
      .home-section .app-card,.content>.panel .grid.three .app-card{grid-template-columns:52px minmax(0,1fr);column-gap:11px}
      .home-section .app-card .app-badge,.content>.panel .grid.three .app-card .app-badge{width:50px;height:50px}
      .home-section .app-card .secondary,.content>.panel .grid.three .app-card .secondary{grid-column:1/-1;grid-row:auto;justify-self:stretch;width:100%;margin-top:12px}
      .app-list .app-card{grid-template-columns:48px minmax(0,1fr) auto;column-gap:9px;padding:12px}
      .app-list .app-badge{width:46px;height:46px;font-size:19px}
      .app-list .app-card-copy h2,.app-list .app-card-copy h3{font-size:15px}
      .app-list .app-card-copy p{font-size:12px}
      .app-list .secondary{grid-column:3;grid-row:1;justify-self:end;align-self:center;width:auto;margin:0;padding:8px 9px;font-size:11px}
    }
  `;
  document.head.append(responsiveStyle);
  $('#signout').onclick=()=>{Store.signout();location.replace(`${prefix}../Sign%20in/index.html`)};
  const menu=$('#management-menu'),toggle=$('#menu-toggle'),scrim=$('#menu-scrim');
  const closeMenu=()=>{menu.classList.remove('open');scrim.classList.remove('show');toggle.setAttribute('aria-expanded','false')};
  toggle.onclick=()=>{const open=!menu.classList.contains('open');menu.classList.toggle('open',open);scrim.classList.toggle('show',open);toggle.setAttribute('aria-expanded',String(open))};
  scrim.onclick=closeMenu;
}
export function toast(message){const e=document.createElement('div');e.className='toast';e.textContent=message;document.body.append(e);setTimeout(()=>e.remove(),3000)}
export function modal(title,body,onConfirm,danger=false){$('#modal-root').innerHTML=`<div class="modal-backdrop"><section class="modal"><h2>${esc(title)}</h2>${body}<div class="modal-actions"><button class="secondary" id="cancel">Cancel</button><button class="${danger?'danger':'primary'}" id="confirm">Confirm</button></div></section></div>`;$('#cancel').onclick=()=>$('#modal-root').innerHTML='';$('#confirm').onclick=()=>{if(onConfirm()!==false)$('#modal-root').innerHTML=''}}
export function download(data,name){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=name;a.click();URL.revokeObjectURL(url);toast('Download started.')}
