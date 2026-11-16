import {Store} from '../../shared/session-store.js?v=20261116-poster1';
import {icon,iconStyle} from '../../shared/icons.js?v=20261116-poster1';
import {Api} from '../../shared/api-client.js?v=20261116-poster1';

// The app trades its own token for a short-lived account session and opens this panel
// with it in the fragment. Adopt it before any page decides to redirect, so every
// panel page opens already signed in and nothing has to wait.
const handedPanel=/[#&]panel_token=([^&]+)/.exec(location.hash||'');
if(handedPanel){
  Api.setSession(decodeURIComponent(handedPanel[1]));
  sessionStorage.setItem('indo_app_panel','1');
  history.replaceState({},'',location.pathname+location.search);
}
// The pass lives in sessionStorage, which belongs to this tab and dies with it. It must
// NOT be cleared on pagehide: moving between panel pages is the same tab, and clearing it
// there is what made every second page ask for a password again.
if(sessionStorage.getItem('indo_app_panel')==='1'&&!Store.current()){
  try{Store.adoptIdentity(await Api.me())}catch(error){/* the page shows its own error */}
}

const groups=[
  {title:'Account',items:[['home','Home'],['personal-info','Personal info'],['security','Security & sign-in'],['devices','Devices'],['privacy','Data & privacy'],['notifications','Notifications']]},
  {title:'Connections',items:[['indo-connect','Indo Connect']]},
  {title:'App center',items:[['sankalp','Sankalp'],['eyesearch','Eyesearch'],['eyebrowse','Eyebrowse']]},
  {title:'More',items:[['help-support','Help & support'],['account-actions','About & account']]}
];
const paths={home:'home','personal-info':'personal-info',security:'security',devices:'devices',privacy:'privacy',notifications:'notifications','indo-connect':'indo-connect',sankalp:'apps-data/sankalp',eyesearch:'apps-data/eyesearch',eyebrowse:'apps-data/eyebrowse','help-support':'help-support','account-actions':'account-actions'};
const navIcon={home:'home','personal-info':'id',security:'shield',devices:'devices',privacy:'database',notifications:'bell','indo-connect':'plug',sankalp:'chat',eyesearch:'search',eyebrowse:'browser','help-support':'lifebuoy','account-actions':'info'};
const $=s=>document.querySelector(s),esc=(v='')=>{const e=document.createElement('div');e.textContent=v;return e.innerHTML},initials=s=>s.split(' ').map(x=>x[0]).join('').slice(0,2).toUpperCase();
const avatarContent=u=>u.profile_photo?`<img src="${esc(u.profile_photo)}" alt="${esc(u.full_name)} profile photo">`:initials(u.full_name);

export {Store,esc,$};
const emptyUser=()=>({
  full_name:'',nickname:'',profile_photo:'',eyemail_id:'',secondary_email:'',phone:'',dob:'',language:'kn',gender:'',two_step:false,
  sessions:[],notifications:{security:false,signin:false,updates:false,billing:false,news:false},billing:{company:'',gstin:'',address:'',state:''},invoices:[],apps:{
    SANKALPA:{name:'Sankalp',status:'Paused',connected:false,data:{history:[],saved:[],memory:[],preferences:{}}},
    EYESEARCH:{name:'Eyesearch',status:'Paused',connected:false,data:{history:[],saved:[],memory:[],preferences:{}}},
    EYEBROWSE:{name:'Eyebrowse',status:'Paused',connected:false,data:{history:[],saved:[],memory:[],preferences:{}}}
  }
});
export const user=()=>Store.current()||emptyUser();

// The footer only appears once the page is scrolled to its end, so it never covers content
// and never repeats the top bar while you read. Two triggers are used on purpose: an
// observer where it exists, and a plain scroll check everywhere else, because some WebViews
// deliver one and not the other.
function watchFooter(){
  const footer=document.getElementById('panel-footer'),sentinel=document.getElementById('footer-sentinel');
  if(!footer)return;
  const update=()=>{
    const doc=document.documentElement;
    const atEnd=window.innerHeight+window.scrollY>=doc.scrollHeight-36;
    footer.classList.toggle('visible',atEnd);
  };
  if(!window.__indoFooterWatch){
    window.__indoFooterWatch=true;
    let settle=0;
    const onScroll=()=>{update();clearTimeout(settle);settle=setTimeout(update,90)};
    addEventListener('scroll',onScroll,{passive:true});
    addEventListener('resize',onScroll,{passive:true});
    if(typeof IntersectionObserver==='function'&&sentinel){
      new IntersectionObserver(entries=>{
        entries.forEach(entry=>footer.classList.toggle('visible',entry.isIntersecting));
      },{threshold:0}).observe(sentinel);
    }
    window.__indoFooterUpdate=update;
  }
  (window.__indoFooterUpdate||update)();
}

export function setup(active,content,prefix='../'){
  const signedIn=Store.current();
  // An app can open this panel with its own token in the fragment. That token is a
  // valid session for one app box even though no browser-local profile exists yet,
  // so never bounce to sign-in when the page was opened that way.
  const appScoped=sessionStorage.getItem('indo_app_panel')==='1';
  if(!signedIn&&!appScoped){location.replace(`${prefix}../Sign%20in/index.html`);return}
  const signInPage=`${prefix}../Sign%20in/index.html`;
  // An app-scoped panel must never run the browser validation: it would call
  // /api/v1/me with an app token, get 401 by design, and bounce to sign-in.
  if(!appScoped){
    if(!window.__indoValidateSession){
      let pending=null;
      window.__indoValidateSession=()=>{
        if(pending)return pending;
        pending=Store.refresh().catch(()=>{if(!Store.current())location.replace(signInPage)}).finally(()=>{pending=null});
        return pending;
      };
      addEventListener('focus',()=>window.__indoValidateSession());
      addEventListener('pageshow',event=>{if(event.persisted)window.__indoValidateSession()});
    }
    if(!window.__indoSessionValidated)window.__indoValidateSession();
  }
  const u=signedIn;
  const nav=groups.map(group=>`<div class="nav-group"><p class="nav-title">${group.title}</p><nav class="nav">${group.items.map(([key,label])=>`<a class="${key===active?'active':''}" href="${prefix}${paths[key]}/index.html"><span class="nav-icon icon-${key}">${icon(navIcon[key]||'info',20)}</span>${label}</a>`).join('')}</nav></div>`).join('');
  const profileMotion=`<div class="avatar-motion" aria-hidden="true"><span class="paint paint-blue"></span><span class="paint paint-green"></span><span class="paint paint-purple"></span><span class="paint paint-pink"></span><span class="paint paint-gold"></span><span class="paint paint-star">✦</span></div>`;
  document.body.innerHTML=`<style>
    .account-shell{min-height:100vh;background:#f2f6fc}.topbar{box-shadow:none}.brand{color:#172033}
    .layout{max-width:1440px;grid-template-columns:260px minmax(0,1fr);gap:34px;padding-top:24px}.sidebar{top:82px;align-self:start}
    .profile-strip{display:flex;align-items:center;justify-content:center;min-height:170px;padding:8px 18px 24px;text-align:center}.profile-main{position:relative}.profile-main .avatar{height:74px;width:74px;margin:0 auto 10px;background:linear-gradient(145deg,#8d62e4 8%,#7350cc 60%,#a578e8);color:#fff;font-size:25px;border:3px solid #eee5ff;box-shadow:-5px 4px 0 #d4b7ff,5px -3px 0 #c5e5ff;position:relative;z-index:2;animation:avatar-settle 1.35s cubic-bezier(.2,.85,.25,1) both;overflow:hidden}.avatar img{width:100%;height:100%;display:block;object-fit:cover;border-radius:inherit}.profile-main h1{font-size:24px;margin:0}.profile-main p{margin:3px 0;color:#5e6b7e}.avatar-motion{position:absolute;left:50%;top:2px;width:1px;height:1px;z-index:1}.paint{position:absolute;display:grid;place-items:center;opacity:0;animation:paint-arrive 1.35s cubic-bezier(.2,.85,.25,1) both}.paint-blue{width:31px;height:25px;border-radius:56% 44% 51% 49%;background:#5aaaff;left:-82px;top:14px;transform:rotate(-19deg);animation-delay:.03s}.paint-green{width:23px;height:29px;border-radius:57% 43% 50% 50%;background:#36c993;left:-51px;top:46px;transform:rotate(20deg);animation-delay:.12s}.paint-purple{width:34px;height:22px;border-radius:45% 55% 44% 56%;background:#a77bea;left:42px;top:6px;transform:rotate(14deg);animation-delay:.08s}.paint-pink{width:27px;height:27px;border-radius:50% 40% 50% 45%;background:#ef5e85;left:72px;top:31px;animation-delay:.18s}.paint-gold{width:17px;height:17px;border-radius:4px 10px 4px 10px;background:#ffc34f;left:39px;top:56px;transform:rotate(25deg);animation-delay:.25s}.paint-star{color:#7245bc;font-size:22px;left:-14px;top:-29px;animation-delay:.31s}@keyframes paint-arrive{0%{opacity:0;transform:translate(var(--start-x,0),22px) scale(.25) rotate(-38deg)}28%{opacity:1}72%{opacity:1;transform:translate(0,0) scale(1) rotate(0)}100%{opacity:0;transform:translate(0,0) scale(.15) rotate(12deg)}}@keyframes avatar-settle{0%{transform:scale(.42);opacity:.15}60%{transform:scale(1.1);opacity:1}100%{transform:scale(1)}}
    .nav-group{margin:0 0 20px}.nav-title{margin:9px 12px;font-weight:700;text-transform:none;letter-spacing:0;font-size:12px}.nav a{display:flex;align-items:center;gap:11px;padding:9px 11px;margin:2px 0;border-radius:23px;color:#263348;font-weight:650}.nav a.active,.nav a:hover{background:#dceeff;color:#123d72}.nav-icon{width:36px;height:36px;display:grid;place-items:center;flex:0 0 36px;color:#3f4f66}.nav a.active .nav-icon{color:var(--brand)}.nav-icon img{width:23px;height:23px;display:block;filter:drop-shadow(0 1px 1px #26334818)}
    .icon-home{--paint:#cfe9ff}.icon-personal-info{--paint:#d9f6db}.icon-security{--paint:#cdf0ff}.icon-devices{--paint:#e6e7ff}.icon-privacy{--paint:#ffe4c7}.icon-notifications{--paint:#fff1bd}.icon-indo-connect{--paint:#dce8ff}.icon-sankalp{--paint:#e4d8ff}.icon-eyesearch{--paint:#d7f4ef}.icon-eyebrowse{--paint:#dbeaff}.icon-help-support{--paint:#dceaff}.icon-account-actions{--paint:#eadcff}
    .content{padding-bottom:64px}.panel-footer.visible{transform:none;opacity:1}
    .panel-footer{position:fixed;left:0;right:0;bottom:0;z-index:30;display:flex;align-items:center;justify-content:center;padding:16px 18px;font-size:16px;font-weight:600;letter-spacing:.01em;color:#465468;background:rgba(255,255,255,.96);border-top:1px solid var(--line);box-shadow:0 -6px 18px rgba(15,23,42,.06);backdrop-filter:blur(8px);transform:translateY(110%);opacity:0;transition:transform .24s ease,opacity .24s ease}.panel-footer .powered{color:#e8890c}.panel-footer .workspace{color:var(--brand-strong);font-weight:700}.content h1{font-size:30px;font-weight:800;letter-spacing:-.02em;line-height:1.15}.content h1 .accent{color:var(--accent)}.poster{font-weight:800;letter-spacing:-.02em;line-height:1.12;font-size:22px;color:#0f7a3d;margin:14px 0 4px}.poster .accent{color:var(--accent)}.panel{box-shadow:0 2px 8px #2337500b}.search-box{display:flex;align-items:center;gap:12px;max-width:650px;margin:0 auto 20px;padding:14px 18px;border-radius:28px;background:#fff;border:1px solid #dfe5ee;color:#465468}.quick-actions{display:flex;justify-content:center;gap:9px;flex-wrap:wrap;margin:0 auto 24px}.quick-actions a{padding:8px 14px;border:1px solid #bfc9d6;border-radius:9px;background:#fff;color:#263348;font-size:13px;font-weight:700}.home-section{background:#fff;border:1px solid #cfd8e5;border-radius:16px;padding:20px;margin-bottom:16px;box-shadow:0 2px 8px #2337500b}.overview-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}.overview-card{display:grid;grid-template-columns:42px minmax(0,1fr) auto;gap:10px;align-items:center;padding:14px;border:1px solid #cfd8e5;border-radius:13px;color:#1f2937;background:#fbfdff;transition:.18s ease}.overview-card:hover{transform:translateY(-2px);border-color:#bdd2f7;box-shadow:0 7px 16px #23446a12}.overview-card img{width:40px;height:40px}.overview-copy b,.overview-copy small{display:block}.overview-copy b{font-size:14px}.overview-copy small{margin-top:3px;color:#637083;font-size:12px;line-height:1.35}.card-arrow{font-size:25px;color:#2457d6;font-weight:400}.app-placeholder{border-style:dashed;text-align:center;padding:46px 24px}.app-badge{width:64px;height:64px;margin:0 auto 14px;display:grid;place-items:center;border-radius:18px;background:#e4eaf3;color:#2c3a4e;font-size:26px;font-weight:700;border:1px solid #e3e9f1}.app-badge.logo{background:transparent;border:0;padding:0}.app-badge.logo img{width:100%;height:100%;object-fit:contain;display:block}.info-list{overflow:hidden;background:#fff;border:1px solid #cfd8e5;border-radius:18px}.info-row{width:100%;display:grid;grid-template-columns:42px minmax(0,1fr) auto;gap:14px;align-items:center;padding:15px 20px;background:#fff;border:0;border-bottom:1px solid #d8e0ea;text-align:left;color:#1f2937}.info-row:last-child{border-bottom:0}.info-row:not(.static):hover{background:#eef3fb;cursor:pointer}.info-row b,.info-row small{display:block}.info-row b{font-size:15px}.info-row small{margin-top:2px;color:#465468;font-size:14px;overflow-wrap:anywhere}.info-icon{width:30px;height:30px;display:grid;place-items:center;color:#44546a}.info-icon svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}.row-action{color:#2457d6;font-size:13px;font-weight:700}.locked{color:#5a6a80;font-size:12px}.edit-panel{margin-top:18px}
    .menu-toggle{display:none;border:0;background:#edf3ff;color:#2457d6;border-radius:9px;width:38px;height:38px;padding:8px}.menu-toggle svg{width:22px;height:22px;stroke:currentColor;stroke-width:2.4;stroke-linecap:round}.menu-scrim{display:none}
    @media(max-width:760px){.account-shell{font-size:14px}.topbar{height:60px;padding:0 12px}.topbar .brand{font-size:15px}.topbar .mark{width:30px;height:30px}.menu-toggle{display:grid;place-items:center;order:-1;width:35px;height:35px}.layout{display:block;padding:6px 12px}.sidebar{display:none}.sidebar.open{display:block;position:fixed;z-index:20;left:0;top:60px;bottom:0;height:calc(100dvh - 60px);max-height:none;width:min(282px,82vw);overflow:auto;background:#eef3fb;padding:8px 12px;box-shadow:12px 0 28px #1522382e}.menu-scrim.show{display:block;position:fixed;z-index:19;inset:60px 0 0;background:#17213255}.profile-strip{min-height:auto;padding:14px}.profile-main .avatar{width:66px;height:66px;font-size:22px}.nav-group{margin-bottom:7px}.nav-title{display:block;margin:5px 9px;font-size:11px}.nav{display:grid;overflow:visible;gap:1px}.nav a{white-space:normal;margin:1px 0;padding:5px 8px;font-size:13px}.nav-icon{width:30px;height:30px;flex-basis:30px}.nav-icon img{width:20px;height:20px}.content{min-width:0;padding-bottom:28px}.content h1{font-size:23px;line-height:1.2}.lead{margin-bottom:16px;font-size:14px}.panel{padding:16px;margin-bottom:14px;border-radius:14px}.field{margin:12px 0}.field input,.field select,.field textarea{font-size:16px;padding:11px}.search-box{padding:11px 14px;margin-bottom:14px;font-size:14px}.quick-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin-bottom:16px}.quick-actions a{padding:8px 7px;text-align:center;font-size:12px}.home-section{padding:15px;margin-bottom:13px}.overview-grid{grid-template-columns:1fr;gap:8px}.overview-card{padding:11px;grid-template-columns:36px minmax(0,1fr) auto}.overview-card img{width:34px;height:34px}.section-title{gap:10px;align-items:flex-start}.section-title h2{font-size:17px}.grid,.grid.three{grid-template-columns:1fr;gap:12px}.app-card{padding:15px}.app-badge{width:54px;height:54px;font-size:22px}.switch-row{align-items:flex-start;gap:12px;padding:12px 0}.switch{flex:0 0 42px}.device{flex-direction:column;align-items:flex-start;padding:12px 0}.table-wrap{margin:0 -4px;-webkit-overflow-scrolling:touch}.info-list{border-radius:14px}.info-row{grid-template-columns:30px minmax(0,1fr) auto;gap:9px;padding:12px}.info-row b{font-size:14px}.info-row small{font-size:13px}.info-icon{width:28px;height:28px}.row-action,.locked{font-size:11px}.user-chip .signout{font-size:11px}.toast{left:12px;right:12px;bottom:12px;max-width:none}}
  </style><div class="account-shell"><header class="topbar"><button class="menu-toggle" id="menu-toggle" aria-label="Open menu" aria-expanded="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button><a class="brand" href="${prefix}home/index.html"><img class="mark" src="${prefix}../assets/branding/indo-mark.png" alt="" width="34" height="34"> Indo Account</a><div class="user-chip"><span>${esc(u.eyemail_id)}</span><span class="avatar">${avatarContent(u)}</span><button class="signout" id="signout">Sign out</button></div></header><div class="menu-scrim" id="menu-scrim"></div><main class="layout"><aside class="sidebar" id="management-menu">${nav}</aside><section class="content"><div class="profile-strip"><div class="profile-main">${profileMotion}<span class="avatar">${avatarContent(u)}</span><h1>${esc(u.full_name)}</h1><p>${esc(u.eyemail_id)}</p></div></div>${content}</section></main><div id="footer-sentinel" aria-hidden="true"></div><footer class="panel-footer" id="panel-footer"><span><span class="powered">Powered by</span> <span class="workspace">Indo Workspace</span></span></footer></div><div id="modal-root"></div>`;
  watchFooter();
  // Shared responsive spacing: keeps every management section balanced on both desktop and mobile.
  document.getElementById('indo-responsive-layout')?.remove();
  const responsiveStyle=document.createElement('style');
  responsiveStyle.id='indo-responsive-layout';
  responsiveStyle.textContent=`
    .modal-backdrop{position:fixed;z-index:50;inset:0;display:grid;place-items:center;padding:20px;background:#17213266;backdrop-filter:blur(2px)}
    .modal{width:min(100%,480px);max-height:min(82vh,680px);overflow:auto;padding:24px;border:1px solid #dce3ed;border-radius:18px;background:#fff;box-shadow:0 24px 70px #101b2d4a}
    .modal h2{margin:0 0 10px;font-size:21px}.modal>p{margin:0 0 16px;color:#465468;line-height:1.55}.modal-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:20px}.modal-actions .primary{width:auto;margin:0}.modal-actions button{min-width:96px}
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
      body.menu-open{overflow:hidden}
      .modal-backdrop{align-items:end;padding:12px}.modal{width:100%;max-height:86dvh;padding:20px;border-radius:18px}.modal-actions{display:grid;grid-template-columns:1fr 1fr}.modal-actions button{width:100%;min-height:44px}
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
      .home-section .app-card,.content>.panel .grid.three .app-card{grid-template-columns:48px minmax(0,1fr) auto;column-gap:9px}
      .home-section .app-card .app-badge,.content>.panel .grid.three .app-card .app-badge{width:46px;height:46px}
      .home-section .app-card .secondary,.content>.panel .grid.three .app-card .secondary{grid-column:3;grid-row:1 / span 2;justify-self:end;width:auto;margin:0;padding:8px 9px;font-size:11px;white-space:nowrap}
      .app-list .app-card{grid-template-columns:48px minmax(0,1fr) auto;column-gap:9px;padding:12px}
      .app-list .app-badge{width:46px;height:46px;font-size:19px}
      .app-list .app-card-copy h2,.app-list .app-card-copy h3{font-size:15px}
      .app-list .app-card-copy p{font-size:12px}
      .app-list .secondary{grid-column:3;grid-row:1;justify-self:end;align-self:center;width:auto;margin:0;padding:8px 9px;font-size:11px}
    }
    @media(max-width:360px){
      .topbar{padding-inline:8px}.topbar .brand{gap:7px;font-size:14px}.topbar .mark{width:28px;height:28px}.menu-toggle{width:32px;height:32px;padding:6px}.user-chip{gap:3px}.user-chip .avatar{width:30px;height:30px}.user-chip .signout{font-size:10px;padding-inline:4px}
      .layout{padding-inline:8px}.panel,.home-section{padding:13px}
      .home-section .app-card,.content>.panel .grid.three .app-card,.app-list .app-card{grid-template-columns:42px minmax(0,1fr) auto;column-gap:7px;padding:10px}
      .home-section .app-card .app-badge,.content>.panel .grid.three .app-card .app-badge,.app-list .app-badge{width:40px;height:40px;font-size:17px}
      .home-section .app-card .secondary,.content>.panel .grid.three .app-card .secondary,.app-list .secondary{padding:7px 7px;font-size:10px}
    }
  `;
  document.head.append(responsiveStyle);
  $('#signout').onclick=async()=>{const button=$('#signout');button.disabled=true;try{await Store.signout()}finally{location.replace(`${prefix}../Sign%20in/index.html`)}};
  const menu=$('#management-menu'),toggle=$('#menu-toggle'),scrim=$('#menu-scrim');
  const closeMenu=(returnFocus=false)=>{menu.classList.remove('open');scrim.classList.remove('show');document.body.classList.remove('menu-open');toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-label','Open menu');if(returnFocus)toggle.focus()};
  toggle.onclick=()=>{const open=!menu.classList.contains('open');menu.classList.toggle('open',open);scrim.classList.toggle('show',open);document.body.classList.toggle('menu-open',open);toggle.setAttribute('aria-expanded',String(open));toggle.setAttribute('aria-label',open?'Close menu':'Open menu')};
  scrim.onclick=()=>closeMenu();
  menu.querySelectorAll('a').forEach(link=>link.addEventListener('click',()=>closeMenu()));
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&menu.classList.contains('open'))closeMenu(true)});
  addEventListener('resize',()=>{if(innerWidth>760&&menu.classList.contains('open'))closeMenu()});
}
export function toast(message){const e=document.createElement('div');e.className='toast';e.textContent=message;document.body.append(e);setTimeout(()=>e.remove(),3000)}
let modalCleanup=()=>{};
export function modal(title,body,onConfirm,danger=false){
  modalCleanup();
  const root=$('#modal-root'),previous=document.activeElement,controller=new AbortController();
  root.innerHTML=`<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><h2 id="modal-title">${esc(title)}</h2>${body}<div class="modal-actions"><button class="secondary" id="cancel" type="button">Cancel</button><button class="${danger?'danger':'primary'}" id="confirm" type="button">Confirm</button></div></section></div>`;
  const backdrop=root.querySelector('.modal-backdrop'),dialog=root.querySelector('.modal'),cancel=$('#cancel'),confirm=$('#confirm');
  const close=()=>{controller.abort();root.innerHTML='';modalCleanup=()=>{};if(previous instanceof HTMLElement)previous.focus()};
  modalCleanup=close;
  cancel.onclick=close;
  confirm.onclick=()=>{if(onConfirm()!==false)close()};
  backdrop.addEventListener('click',event=>{if(event.target===backdrop)close()},{signal:controller.signal});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();close();return}if(event.key==='Tab'){const focusable=[...dialog.querySelectorAll('button,input,select,textarea,a[href]')].filter(element=>!element.disabled&&!element.hidden);if(!focusable.length)return;const first=focusable[0],last=focusable.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}}},{signal:controller.signal});
  requestAnimationFrame(()=>{(dialog.querySelector('input:not([type="hidden"]),select,textarea')||cancel).focus()});
}
export function download(data,name){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=name;a.click();URL.revokeObjectURL(url);toast('Download started.')}
