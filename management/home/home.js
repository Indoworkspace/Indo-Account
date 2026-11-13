import {setup,user,esc} from '../shared/layout.js';

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
<section class="home-section"><div class="section-title"><h2>Your Indo apps</h2><a href="../apps-data/index.html">View all</a></div><div class="grid three">${apps.map(([name,description,href,kind])=>`<div class="app-card"><div class="app-badge ${kind}">${name[0]}</div><h3>${esc(name)}</h3><p>${description}</p><a class="secondary" href="${href}">Open app space</a></div>`).join('')}</div></section>`);
