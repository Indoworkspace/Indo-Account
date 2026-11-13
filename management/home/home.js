import {setup,user,esc} from '../shared/layout.js?v=20261113-2230';

const u=user();
const apps=[
  ['Sankalp','AI Assistant','../apps-data/sankalp/index.html',''],
  ['Eyesearch','Search Engine','../apps-data/eyesearch/index.html','eye'],
  ['Eyebrowse','Browser','../apps-data/eyebrowse/index.html','browse']
];
const asset=name=>`../../assets/icons/${name}.svg`;

setup('home',`<div class="search-box">⌕ <span>Search Indo Account</span></div>
<div class="quick-actions"><a href="../security/index.html">My password</a><a href="../devices/index.html">Devices</a><a href="../apps-data/index.html">My apps</a><a href="../privacy/index.html">Data &amp; privacy</a><a href="../payments-gst/index.html">Billing</a></div>
<section class="home-section"><div class="section-title"><h2>Account overview</h2><span class="badge">Active</span></div><div class="overview-grid">
  <a class="overview-card" href="../security/index.html"><img src="${asset('security')}" alt=""><span class="overview-copy"><b>Security &amp; sign-in</b><small>${u.two_step?'Two-step protection is on.':'Review your protection settings.'}</small></span><span class="card-arrow">›</span></a>
  <a class="overview-card" href="../personal-info/index.html"><img src="${asset('personal-info')}" alt=""><span class="overview-copy"><b>Personal info</b><small>Profile, language, contact details and addresses.</small></span><span class="card-arrow">›</span></a>
  <a class="overview-card" href="../apps-data/index.html"><img src="${asset('sankalp')}" alt=""><span class="overview-copy"><b>App center</b><small>Manage Sankalp, Eyesearch and Eyebrowse.</small></span><span class="card-arrow">›</span></a>
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
