import {setup,Store,$,modal,download,toast} from '../shared/layout.js?v=20261113-2315';

const icon={
  export:'<path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/>',
  apps:'<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>',
  delete:'<path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6"/>'
};
const svg=name=>`<svg viewBox="0 0 24 24" aria-hidden="true">${icon[name]}</svg>`;

setup('privacy',`<h1>Privacy center</h1><p class="lead">Control, download, and manage your Indo Account data.</p>
<section class="privacy-section"><h2>Your data</h2><p class="privacy-note">Manage shared account information and app-specific activity separately.</p><div class="privacy-list">
  <article class="privacy-row"><span class="privacy-icon">${svg('export')}</span><div class="privacy-copy"><h3>Download my data</h3><p>Export your profile, connected apps, sessions, and billing information as a JSON file.</p></div><button class="secondary privacy-action" id="export" type="button">Export data</button></article>
  <article class="privacy-row"><span class="privacy-icon">${svg('apps')}</span><div class="privacy-copy"><h3>App-specific data</h3><p>Manage Sankalp, Eyesearch, and Eyebrowse data independently.</p></div><a class="secondary privacy-action" href="../apps-data/index.html">Manage app data</a></article>
</div></section>
<section class="privacy-section danger-section"><h2>Account deletion</h2><p class="privacy-note">This action permanently removes your entire Indo Account.</p><article class="privacy-row danger-row"><span class="privacy-icon danger-icon">${svg('delete')}</span><div class="privacy-copy"><h3>Delete full Indo Account</h3><p>Remove your profile, app partitions, sessions, billing information, and lookup records.</p></div><button class="danger privacy-action" id="delete" type="button">Delete account</button></article></section>`);

const style=document.createElement('style');
style.textContent=`
  .privacy-section{margin:0 0 24px}.privacy-section>h2{font-size:19px;margin:0 0 3px}.privacy-note{margin:0 0 12px;color:#607087;font-size:14px}.privacy-list{overflow:hidden;border:1px solid #e1e7ef;border-radius:16px;background:#fff}.privacy-row{display:grid;grid-template-columns:42px minmax(0,1fr) auto;gap:15px;align-items:center;padding:18px 20px;background:#fff;border-bottom:1px solid #e7ebf1}.privacy-row:last-child{border-bottom:0}.privacy-icon{width:38px;height:38px;display:grid;place-items:center;border-radius:12px;background:#edf3ff;color:#2457d6}.privacy-icon svg{width:21px;height:21px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}.privacy-copy{min-width:0}.privacy-copy h3{margin:0 0 4px;font-size:16px}.privacy-copy p{margin:0;color:#607087;font-size:13px;line-height:1.45;overflow-wrap:anywhere}.privacy-action{justify-self:end;white-space:nowrap}.danger-section{margin-top:30px}.danger-row{border:1px solid #f0c7c7;border-radius:16px;background:#fffafa}.danger-icon{background:#fff0f0;color:#bf1b1b}
  @media(max-width:760px){.privacy-section{margin-bottom:20px}.privacy-section>h2{font-size:17px}.privacy-note{font-size:13px}.privacy-row{grid-template-columns:36px minmax(0,1fr) auto;gap:11px;padding:15px 13px}.privacy-icon{width:34px;height:34px}.privacy-copy h3{font-size:15px}.privacy-copy p{font-size:12px}.privacy-action{padding:9px 11px;font-size:12px}}
  @media(max-width:480px){.privacy-row{grid-template-columns:34px minmax(0,1fr)}.privacy-icon{grid-column:1;grid-row:1}.privacy-copy{grid-column:2;grid-row:1}.privacy-action{grid-column:1/-1;grid-row:2;justify-self:stretch;width:100%;text-align:center;margin-top:3px}.danger-section{margin-top:24px}}
`;
document.head.append(style);

$('#export').onclick=()=>download(Store.exportData(),'indo-account-data.json');
$('#delete').onclick=()=>modal('Delete full Indo Account','<p>This permanently removes your profile, apps, sessions, billing information, and lookup records.</p><div class="field"><label>Type DELETE to confirm</label><input id="delete-word" autocomplete="off"></div>',()=>{if($('#delete-word').value!=='DELETE'){toast('Type DELETE to confirm.');return false}Store.deleteCurrent();location.replace('../../Sign%20in/index.html')},true);
