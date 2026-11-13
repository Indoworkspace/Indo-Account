import {setup,user,Store,esc,$,toast} from '../shared/layout.js?v=20261114-0015';

const u=user();
const icons={
  name:'<circle cx="12" cy="8" r="3"/><path d="M5 21c1-4 3.3-6 7-6s6 2 7 6"/>',
  nickname:'<path d="M4 6h11l5 5-9 9-7-7Z"/><circle cx="9" cy="10" r="1.2"/>',
  gender:'<circle cx="12" cy="12" r="5"/><path d="M15.5 8.5 20 4M16 4h4v4M8.5 15.5 4 20M4 16v4h4"/>',
  email:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  phone:'<path d="M7 3 4.5 5.5c-1 1 1.3 6.2 4.6 9.4 3.2 3.3 8.4 5.6 9.4 4.6L21 17l-3.5-2.5-2 2c-1.8-.8-4.2-3.2-5-5l2-2z"/>',
  birthday:'<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/>',
  language:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
  home:'<path d="m4 10 8-7 8 7v10H4z"/><path d="M9 20v-6h6v6"/>',
  work:'<rect x="5" y="7" width="14" height="14" rx="1"/><path d="M9 7V4h6v3M5 12h14M10 16h4"/>',
  other:'<path d="M12 21s7-6 7-12a7 7 0 1 0-14 0c0 6 7 12 7 12Z"/><circle cx="12" cy="9" r="2"/>'
};
const readable={kn:'Kannada (kn)',en:'English (en)',hi:'Hindi (hi)'};
const rows=[
  ['name','Full name','full_name',u.full_name,'text'],['nickname','Nickname','nickname',u.nickname,'text'],['gender','Gender','gender',u.gender||'Not set','select'],
  ['email','Recovery email','secondary_email',u.secondary_email,'email'],['phone','Mobile number','phone',u.phone||'Add a mobile number','tel'],
  ['birthday','Birthday','dob',u.dob||'Not set','date'],['language','Language','language',readable[u.language]||'Kannada (kn)','select'],
  ['home','Home address','home_address',u.home_address||'Add home address','text'],['work','Work address','work_address',u.work_address||'Add work address','text'],['other','Other address','other_address',u.other_address||'Add other address','text']
];
const icon=name=>`<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name]}</svg>`;
const row=([kind,label,key,value])=>`<button class="info-row" data-key="${key}" type="button"><span class="info-icon">${icon(kind)}</span><span><b>${label}</b><small>${esc(value)}</small></span><span class="row-action">Edit</span></button>`;

setup('personal-info',`<h1>Personal info</h1><p class="lead">Manage the information shared across your Indo apps.</p><section class="info-list"><div class="info-row static"><span class="info-icon">${icon('name')}</span><span><b>Primary Indo ID</b><small>${esc(u.eyemail_id)}</small></span><span class="locked">Locked</span></div>${rows.map(row).join('')}</section>`);

const style=document.createElement('style');
style.textContent=`
  .inline-editor{display:grid;gap:12px;padding:18px 20px;background:#f8fbff;border-bottom:1px solid #e1e7ef}
  .inline-editor-head b{font-size:15px}
  .inline-editor .field{margin:0}.inline-editor-actions{display:flex;justify-content:flex-end;gap:10px}.inline-editor-actions .primary{width:auto;margin:0;min-width:110px}
  @media(max-width:760px){.inline-editor{padding:14px 12px}.inline-editor-actions{display:grid;grid-template-columns:1fr 1fr}.inline-editor-actions .primary{width:100%;min-width:0}.inline-editor .field input,.inline-editor .field select{font-size:16px}}
`;
document.head.append(style);

function renderEditor(key,button){
  const item=rows.find(row=>row[2]===key);if(!item)return;
  const[,label,,value,type]=item;
  const current=u[key]||'';
  let control=`<input id="edit-value" type="${type==='select'?'text':type}" value="${esc(current)}">`;
  if(key==='language')control=`<select id="edit-value"><option value="kn">Kannada (kn)</option><option value="en">English (en)</option><option value="hi">Hindi (hi)</option></select>`;
  if(key==='gender')control=`<select id="edit-value"><option value="">Select gender</option><option>Male</option><option>Female</option><option>Non-binary</option><option>Prefer not to say</option></select>`;
  document.querySelector('.inline-editor')?.remove();
  const editor=document.createElement('div');editor.className='inline-editor';
  editor.innerHTML=`<div class="inline-editor-head"><b>Edit ${esc(label)}</b></div><div class="field"><label>${esc(label)}</label>${control}</div><div class="inline-editor-actions"><button class="secondary" type="button" data-close>Cancel</button><button class="primary" type="button" id="save-editor">Save</button></div>`;
  button.insertAdjacentElement('afterend',editor);
  const field=editor.querySelector('#edit-value');if(key==='language')field.value=u.language||'kn';if(key==='gender')field.value=u.gender||'';
  editor.querySelectorAll('[data-close]').forEach(close=>close.onclick=()=>editor.remove());
  editor.querySelector('#save-editor').onclick=()=>{const next=field.value.trim();if(!next&&key!=='gender')return toast(`Enter your ${label.toLowerCase()}.`);if(key==='phone'&&!/^\d{10}$/.test(next))return toast('Enter a 10-digit mobile number.');Store.update({[key]:next});const displayed=key==='language'?(readable[next]||next):(next||'Not set');button.querySelector('small').textContent=displayed;editor.remove();toast(`${label} saved.`)};
}
document.querySelectorAll('.info-row[data-key]').forEach(button=>button.onclick=()=>renderEditor(button.dataset.key,button));
