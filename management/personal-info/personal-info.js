import {setup,user,Store,esc,$,toast} from '../shared/layout.js?v=20261114-0015';

const u=user();
const iconFiles={
  id:'identification-badge-duotone.svg',name:'user-duotone.svg',nickname:'tag-duotone.svg',gender:'gender-intersex-duotone.svg',
  email:'envelope-simple-duotone.svg',phone:'phone-duotone.svg',birthday:'cake-duotone.svg',language:'translate-duotone.svg',
  home:'house-duotone.svg',work:'briefcase-duotone.svg',other:'map-pin-duotone.svg'
};
const readable={kn:'Kannada (kn)',en:'English (en)',hi:'Hindi (hi)'};
const rows=[
  ['name','Full name','full_name',u.full_name,'text'],['nickname','Nickname','nickname',u.nickname,'text'],['gender','Gender','gender',u.gender||'Not set','select'],
  ['email','Recovery email','secondary_email',u.secondary_email,'email'],['phone','Mobile number','phone',u.phone||'Add a mobile number','tel'],
  ['birthday','Birthday','dob',u.dob||'Not set','date'],['language','Language','language',readable[u.language]||'Kannada (kn)','select'],
  ['home','Home address','home_address',u.home_address||'Add home address','text'],['work','Work address','work_address',u.work_address||'Add work address','text'],['other','Other address','other_address',u.other_address||'Add other address','text']
];
const icon=name=>`<img src="../../assets/icons/phosphor/${iconFiles[name]}" alt="" aria-hidden="true">`;
const row=([kind,label,key,value])=>`<button class="info-row" data-key="${key}" type="button"><span class="info-icon">${icon(kind)}</span><span><b>${label}</b><small>${esc(value)}</small></span><span class="row-action">Edit</span></button>`;

setup('personal-info',`<h1>Personal info</h1><p class="lead">Manage the information shared across your Indo apps.</p><section class="info-list"><div class="info-row static"><span class="info-icon icon-id">${icon('id')}</span><span><b>Primary Indo ID</b><small>${esc(u.eyemail_id)}</small></span><span class="locked">Locked</span></div>${rows.map(row).join('')}</section>`);

const style=document.createElement('style');
style.textContent=`
  .info-icon{--row-paint:#dceaff;position:relative;isolation:isolate;width:34px;height:34px;display:grid;place-items:center;color:inherit}
  .info-icon::before{content:"";position:absolute;z-index:-1;inset:1px;border-radius:62% 38% 55% 45%/42% 58% 42% 58%;background:var(--row-paint);transform:rotate(-7deg)}
  .info-icon::after{content:"";position:absolute;z-index:-1;width:4px;height:4px;right:-1px;top:2px;border-radius:50%;background:var(--row-paint)}
  .info-icon img{width:21px;height:21px;display:block;filter:drop-shadow(0 1px 1px #26334816)}
  .info-row:nth-child(2) .info-icon{--row-paint:#d9f6db}.info-row:nth-child(3) .info-icon{--row-paint:#eadcff}.info-row:nth-child(4) .info-icon{--row-paint:#ffe0ec}
  .info-row:nth-child(5) .info-icon{--row-paint:#dceaff}.info-row:nth-child(6) .info-icon{--row-paint:#d7f4ef}.info-row:nth-child(7) .info-icon{--row-paint:#fff0cf}
  .info-row:nth-child(8) .info-icon{--row-paint:#cdf0ff}.info-row:nth-child(9) .info-icon{--row-paint:#d9f6db}.info-row:nth-child(10) .info-icon{--row-paint:#e6e7ff}.info-row:nth-child(11) .info-icon{--row-paint:#ffe3df}
  .inline-editor{display:grid;gap:12px;padding:18px 20px;background:#f8fbff;border-bottom:1px solid #e1e7ef}
  .inline-editor-head b{font-size:15px}
  .inline-editor .field{margin:0}.inline-editor-actions{display:flex;justify-content:flex-end;gap:10px}.inline-editor-actions .primary{width:auto;margin:0;min-width:110px}
  @media(max-width:760px){.info-icon{width:29px;height:29px}.info-icon img{width:18px;height:18px}.inline-editor{padding:14px 12px}.inline-editor-actions{display:grid;grid-template-columns:1fr 1fr}.inline-editor-actions .primary{width:100%;min-width:0}.inline-editor .field input,.inline-editor .field select{font-size:16px}}
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
