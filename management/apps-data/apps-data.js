import {setup,esc,$,toast} from '../shared/layout.js?v=20261116-signouticon1';
import {Api} from '../../shared/api-client.js?v=20261116-signouticon1';

const apps=[
  ['SANKALPA','Sankalp','AI Assistant','sankalp/index.html','','Chat history, saved items and AI memory.'],
  ['EYESEARCH','Eyesearch','Search Engine','eyesearch/index.html','eye','Search history, saved results and search settings.'],
  ['EYEBROWSE','Eyebrowse','Browser','eyebrowse/index.html','browse','Browsing history, bookmarks and browser preferences.']
];

const state=box=>box.connected?'Connected':box.status==='Paused'?'Paused':'Not connected';

function paint(boxes){
  const find=key=>boxes.find(box=>box.key===key)||{};
  setup('',`<div class="search-box">⌕ <span>Search your Indo apps</span></div>
  <article class="panel"><h1>Your Indo apps</h1><p class="lead">Each app keeps its own data space inside your Indo Account.</p>
  <div class="app-list">${apps.map(([key,name,description,href,kind,detail])=>{
    const box=find(key),counts=box.counts||{};
    const summary=box.connected?`${counts.history||0} history · ${counts.saved||0} saved`:'No app data connected yet.';
    return `<article class="app-card"><div class="app-badge logo"><img src="../../assets/branding/${name.toLowerCase()}-mark-256.png" alt=""></div><div class="app-card-copy"><h2>${esc(name)}</h2><p>${esc(description)}</p><p class="muted">${esc(summary)}</p></div><a class="secondary" href="${href}">${box.connected?'Manage':'Open app space'}</a></article>`;
  }).join('')}</div></article>
  <article class="panel"><h2>How this works</h2><p>Profile, language and devices stay in one shared Indo Account. Each app keeps only its own activity and settings, and no app can read another's data.</p></article>`);
}

async function start(){
  setup('','<h1>Your Indo apps</h1><p class="lead">Loading…</p>');
  try{const result=await Api.listApps();paint(Object.values(result.apps||{}))}
  catch(error){setup('',`<h1>Your Indo apps</h1><p class="form-note">${esc(error.message)}</p>`);toast(error.message)}
}

start();
