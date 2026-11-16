import {setup,user,esc} from '../shared/layout.js?v=20261116-bughunt1';

const u=user();
const apps=[
  ['Sankalp','AI Assistant','../apps-data/sankalp/index.html',''],
  ['Eyesearch','Search Engine','../apps-data/eyesearch/index.html','eye'],
  ['Eyebrowse','Browser','../apps-data/eyebrowse/index.html','browse']
];
const homeIcons={security:'shield-check-duotone.svg','personal-info':'identification-card-duotone.svg',sankalp:'chat-teardrop-dots-duotone.svg','indo-connect':'plugs-connected-duotone.svg'};
const asset=name=>`../../assets/icons/phosphor/${homeIcons[name]}`;
const searchItems=[
  {title:'Personal info',description:'Profile, recovery contacts, language and addresses',href:'../personal-info/index.html',keywords:'name photo email mobile birthday gender address'},
  {title:'Security & sign-in',description:'Password, two-step protection and recovery',href:'../security/index.html',keywords:'password otp signin recovery protection'},
  {title:'Devices & sessions',description:'Review and sign out connected devices',href:'../devices/index.html',keywords:'device session chrome android sign out'},
  {title:'Data & privacy',description:'Download data and manage account deletion',href:'../privacy/index.html',keywords:'export download delete privacy data'},
  {title:'Notifications',description:'Choose account alerts and updates',href:'../notifications/index.html',keywords:'alerts email updates news security'},
  {title:'Indo Connect',description:'Apps and websites using Continue with Indo',href:'../indo-connect/index.html',keywords:'connected third party login oauth access'},
  {title:'Help & support',description:'Account help and frequently asked questions',href:'../help-support/index.html',keywords:'help support faq problem'},
  {title:'About & account',description:'Account details and shared-data structure',href:'../account-actions/index.html',keywords:'about account user id created'}
];

setup('home',`<div class="account-search"><label class="search-box" for="account-search"><img src="../../assets/icons/phosphor/magnifying-glass-duotone.svg" alt=""><input id="account-search" type="search" placeholder="Search Indo Account" autocomplete="off" aria-controls="account-search-results" aria-expanded="false"></label><div class="search-results hidden" id="account-search-results" role="listbox"></div></div>
<div class="quick-actions"><a href="../security/index.html">My password</a><a href="../devices/index.html">Devices</a><a href="../apps-data/index.html">My apps</a><a href="../indo-connect/index.html">Indo Connect</a><a href="../privacy/index.html">Data &amp; privacy</a></div>
<section class="home-section"><div class="section-title"><h2>Account overview</h2><span class="badge">Active</span></div><div class="overview-grid">
  <a class="overview-card" href="../security/index.html"><img src="${asset('security')}" alt=""><span class="overview-copy"><b>Security &amp; sign-in</b><small>${u.two_step?'Two-step protection is on.':'Review your protection settings.'}</small></span><span class="card-arrow">›</span></a>
  <a class="overview-card" href="../personal-info/index.html"><img src="${asset('personal-info')}" alt=""><span class="overview-copy"><b>Personal info</b><small>Profile, language, contact details and addresses.</small></span><span class="card-arrow">›</span></a>
  <a class="overview-card" href="../apps-data/index.html"><img src="${asset('sankalp')}" alt=""><span class="overview-copy"><b>App center</b><small>Manage Sankalp, Eyesearch and Eyebrowse.</small></span><span class="card-arrow">›</span></a>
  <a class="overview-card" href="../indo-connect/index.html"><img src="${asset('indo-connect')}" alt=""><span class="overview-copy"><b>Indo Connect</b><small>Review apps and websites using your Indo sign-in.</small></span><span class="card-arrow">›</span></a>
</div></section>
<section class="home-section"><div class="section-title"><h2>Your Indo apps</h2><a href="../apps-data/index.html">View all</a></div><div class="app-list">${apps.map(([name,description,href,kind])=>`<div class="app-card"><div class="app-badge ${kind}">${name[0]}</div><div class="app-card-copy"><h3>${esc(name)}</h3><p>${description}</p></div><a class="secondary" href="${href}">Open app space</a></div>`).join('')}</div></section>`);

// Mobile receives the same visual hierarchy as desktop, with generous tap targets.
const mobileStyle=document.createElement('style');
mobileStyle.textContent=`@media(max-width:760px){
  .content{padding-inline:0}
  .quick-actions{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
  .quick-actions a{min-height:40px;display:grid;place-items:center;padding:8px 6px}
  .quick-actions a:last-child:nth-child(odd){grid-column:1/-1}
  .home-section{padding:16px;border-radius:16px}
  .overview-card{min-height:72px;padding:12px;gap:11px}
  .overview-copy b{font-size:14px;line-height:1.25}
  .overview-copy small{font-size:12px;line-height:1.38}
}
@media(max-width:390px){
  .quick-actions a{font-size:11px}
  .home-section{padding:13px}
  .overview-card{grid-template-columns:33px minmax(0,1fr) auto;padding:10px}
  .overview-card img{width:32px;height:32px}
}`;
document.head.append(mobileStyle);

const searchInput=document.querySelector('#account-search'),searchResults=document.querySelector('#account-search-results');
function closeSearch(){searchResults.classList.add('hidden');searchResults.replaceChildren();searchInput.setAttribute('aria-expanded','false')}
function renderSearch(){const query=searchInput.value.trim().toLowerCase();if(!query){closeSearch();return}const matches=searchItems.filter(item=>`${item.title} ${item.description} ${item.keywords}`.toLowerCase().includes(query));searchResults.innerHTML=matches.length?matches.map((item,index)=>`<a href="${item.href}" role="option" data-result="${index}"><span><b>${esc(item.title)}</b><small>${esc(item.description)}</small></span><i aria-hidden="true">›</i></a>`).join(''):'<p>No account settings match your search.</p>';searchResults.classList.remove('hidden');searchInput.setAttribute('aria-expanded','true')}
searchInput.addEventListener('input',renderSearch);
searchInput.addEventListener('keydown',event=>{if(event.key==='Escape'){closeSearch();searchInput.blur()}if(event.key==='Enter'){const first=searchResults.querySelector('a');if(first){event.preventDefault();location.href=first.href}}});
document.addEventListener('click',event=>{if(!event.target.closest('.account-search'))closeSearch()});

const searchStyle=document.createElement('style');
searchStyle.textContent=`
  .account-search{position:relative;z-index:3;max-width:650px;margin:0 auto 20px}.account-search .search-box{max-width:none;margin:0}.search-box img{width:22px;height:22px;flex:0 0 22px}.search-box input{width:100%;min-width:0;border:0;outline:0;background:transparent;color:#1f2937;font:inherit}.search-box:focus-within{border-color:#8eb2ee;box-shadow:0 0 0 3px #2457d616}.search-results{position:absolute;left:0;right:0;top:calc(100% + 8px);overflow:hidden;border:1px solid #dce3ed;border-radius:16px;background:#fff;box-shadow:0 16px 34px #17253a24}.search-results a{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px 16px;border-bottom:1px solid #e7ebf1;color:#1f2937}.search-results a:last-child{border-bottom:0}.search-results a:hover,.search-results a:focus{background:#f2f7ff;outline:0}.search-results b,.search-results small{display:block}.search-results small{margin-top:2px;color:#607087;font-size:12px}.search-results i{color:#2457d6;font-size:24px;font-style:normal}.search-results p{margin:0;padding:18px;color:#607087;text-align:center;font-size:13px}
  @media(max-width:760px){.account-search{margin-bottom:14px}.search-results{position:fixed;z-index:30;left:12px;right:12px;top:112px;max-height:calc(100dvh - 126px);overflow:auto}.search-results a{padding:12px 13px}}
`;
document.head.append(searchStyle);
