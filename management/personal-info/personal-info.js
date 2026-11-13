import {setup,user,Store,esc,$,toast} from '../shared/layout.js';

const u=user();
const icons={
  name:'<circle cx="12" cy="8" r="3"/><path d="M5 21c1-4 3.3-6 7-6s6 2 7 6"/>',
  gender:'<circle cx="12" cy="8" r="3"/><path d="M5 21c1-4 3.3-6 7-6s6 2 7 6"/>',
  email:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  phone:'<path d="M7 3 4.5 5.5c-1 1 1.3 6.2 4.6 9.4 3.2 3.3 8.4 5.6 9.4 4.6L21 17l-3.5-2.5-2 2c-1.8-.8-4.2-3.2-5-5l2-2z"/>',
  birthday:'<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/>',
  language:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
  address:'<path d="m4 10 8-7 8 7v10H4z"/><path d="M9 20v-6h6v6"/>'
};
const readable={kn:'Kannada (kn)',en:'English (en)',hi:'Hindi (hi)'};
const rows=[
  ['name','Full name','full_name',u.full_name,'text'],['name','Nickname','nickname',u.nickname,'text'],['gender','Gender','gender',u.gender||'Not set','select'],
  ['email','Recovery email','secondary_email',u.secondary_email,'email'],['phone','Mobile number','phone',u.phone||'Add a mobile number','tel'],
  ['birthday','Birthday','dob',u.dob||'Not set','date'],['language','Language','language',readable[u.language]||'Kannada (kn)','select'],
  ['address','Home address','home_address',u.home_address||'Add home address','text'],['address','Work address','work_address',u.work_address||'Add work address','text'],['address','Other address','other_address',u.other_address||'Add other address','text']
];
const icon=name=>`<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name]}</svg>`;
const row=([kind,label,key,value])=>`<button class="info-row" data-key="${key}" type="button"><span class="info-icon">${icon(kind)}</span><span><b>${label}</b><small>${esc(value)}</small></span><span class="row-action">Edit</span></button>`;

setup('personal-info',`<h1>Personal info</h1><p class="lead">Manage the information shared across your Indo apps.</p><section class="info-list"><div class="info-row static"><span class="info-icon">${icon('name')}</span><span><b>Primary Indo ID</b><small>${esc(u.eyemail_id)}</small></span><span class="locked">Locked</span></div>${rows.map(row).join('')}</section><section class="edit-panel hidden" id="editor"></section>`);

const editor=$('#editor');
function renderEditor(key){
  const item=rows.find(row=>row[2]===key);if(!item)return;
  const[,label,,value,type]=item;
  const current=u[key]||'';
  let control=`<input id="edit-value" type="${type==='select'?'text':type}" value="${esc(current)}">`;
  if(key==='language')control=`<select id="edit-value"><option value="kn">Kannada (kn)</option><option value="en">English (en)</option><option value="hi">Hindi (hi)</option></select>`;
  if(key==='gender')control=`<select id="edit-value"><option value="">Select gender</option><option>Male</option><option>Female</option><option>Non-binary</option><option>Prefer not to say</option></select>`;
  editor.innerHTML=`<article class="panel"><div class="section-title"><h2>Edit ${label}</h2><button class="secondary" id="close-editor">Close</button></div><div class="field"><label>${label}</label>${control}</div><button class="primary" id="save-editor">Save</button></article>`;
  editor.classList.remove('hidden');
  const field=$('#edit-value');if(key==='language')field.value=u.language||'kn';if(key==='gender')field.value=u.gender||'';
  $('#close-editor').onclick=()=>editor.classList.add('hidden');
  $('#save-editor').onclick=()=>{const value=field.value.trim();if(!value&&key!=='gender')return toast(`Enter your ${label.toLowerCase()}.`);if(key==='phone'&&!/^\d{10}$/.test(value))return toast('Enter a 10-digit mobile number.');Store.update({[key]:value});toast(`${label} saved.`);location.reload()};
}
document.querySelectorAll('.info-row[data-key]').forEach(button=>button.onclick=()=>renderEditor(button.dataset.key));
