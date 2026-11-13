import {setup,user,Store,esc,$,toast} from '../shared/layout.js?v=20261114-0200';

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
const initials=name=>name.trim().split(/\s+/).filter(Boolean).map(part=>part[0]).join('').slice(0,2).toUpperCase();
const photoContent=()=>u.profile_photo?`<img src="${esc(u.profile_photo)}" alt="${esc(u.full_name)} profile photo">`:`<span>${esc(initials(u.full_name))}</span>`;

setup('personal-info',`<h1>Personal info</h1><p class="lead">Manage the information shared across your Indo apps.</p><section class="info-list"><button class="info-row profile-photo-row" data-key="profile_photo" type="button"><span class="row-photo">${photoContent()}</span><span><b>Profile picture</b><small>${u.profile_photo?'Photo added':'Add a profile picture'}</small></span><span class="row-action">${u.profile_photo?'Change':'Add'}</span></button><div class="info-row static"><span class="info-icon icon-id">${icon('id')}</span><span><b>Primary Indo ID</b><small>${esc(u.eyemail_id)}</small></span><span class="locked">Locked</span></div>${rows.map(row).join('')}</section>`);

const style=document.createElement('style');
style.textContent=`
  .info-icon{--row-paint:#dceaff;position:relative;isolation:isolate;width:34px;height:34px;display:grid;place-items:center;color:inherit}
  .info-icon::before{content:"";position:absolute;z-index:-1;inset:1px;border-radius:62% 38% 55% 45%/42% 58% 42% 58%;background:var(--row-paint);transform:rotate(-7deg)}
  .info-icon::after{content:"";position:absolute;z-index:-1;width:4px;height:4px;right:-1px;top:2px;border-radius:50%;background:var(--row-paint)}
  .info-icon img{width:21px;height:21px;display:block;filter:drop-shadow(0 1px 1px #26334816)}
  .info-row[data-key="full_name"] .info-icon{--row-paint:#d9f6db}.info-row[data-key="nickname"] .info-icon{--row-paint:#eadcff}.info-row[data-key="gender"] .info-icon{--row-paint:#ffe0ec}
  .info-row[data-key="secondary_email"] .info-icon{--row-paint:#dceaff}.info-row[data-key="phone"] .info-icon{--row-paint:#d7f4ef}.info-row[data-key="dob"] .info-icon{--row-paint:#fff0cf}
  .info-row[data-key="language"] .info-icon{--row-paint:#cdf0ff}.info-row[data-key="home_address"] .info-icon{--row-paint:#d9f6db}.info-row[data-key="work_address"] .info-icon{--row-paint:#e6e7ff}.info-row[data-key="other_address"] .info-icon{--row-paint:#ffe3df}
  .row-photo{width:48px;height:48px;display:grid;place-items:center;border-radius:50%;overflow:hidden;background:linear-gradient(145deg,#8d62e4,#7350cc);color:#fff;font-size:16px;font-weight:800;box-shadow:0 0 0 3px #eee5ff}
  .row-photo img,.photo-preview img{width:100%;height:100%;display:block;object-fit:cover}
  .inline-editor{display:grid;gap:12px;padding:18px 20px;background:#f8fbff;border-bottom:1px solid #e1e7ef}
  .inline-editor-head b{font-size:15px}
  .inline-editor .field{margin:0}.inline-editor-actions{display:flex;justify-content:flex-end;gap:10px}.inline-editor-actions .primary{width:auto;margin:0;min-width:110px}
  .photo-editor-body{display:grid;grid-template-columns:88px minmax(0,1fr);gap:18px;align-items:center}.photo-preview{width:84px;height:84px;display:grid;place-items:center;border-radius:50%;overflow:hidden;background:linear-gradient(145deg,#8d62e4,#7350cc);color:#fff;font-size:24px;font-weight:800;box-shadow:0 0 0 4px #e9deff}.photo-tools{display:flex;align-items:center;gap:9px;flex-wrap:wrap}.photo-tools label{display:inline-block;cursor:pointer}.photo-tools input{position:absolute;inline-size:1px;block-size:1px;opacity:0;pointer-events:none}.photo-note{margin:9px 0 0;color:#607087;font-size:12px}.photo-remove[hidden]{display:none}
  @media(max-width:760px){.info-icon{width:29px;height:29px}.info-icon img{width:18px;height:18px}.row-photo{width:40px;height:40px}.profile-photo-row{grid-template-columns:44px minmax(0,1fr) auto}.inline-editor{padding:14px 12px}.inline-editor-actions{display:grid;grid-template-columns:1fr 1fr}.inline-editor-actions .primary{width:100%;min-width:0}.inline-editor .field input,.inline-editor .field select{font-size:16px}.photo-editor-body{grid-template-columns:68px minmax(0,1fr);gap:13px}.photo-preview{width:64px;height:64px;font-size:19px}.photo-tools{align-items:stretch}.photo-tools label,.photo-tools button{font-size:12px;padding:10px 11px}}
`;
document.head.append(style);

function syncAvatar(){
  const content=u.profile_photo?`<img src="${esc(u.profile_photo)}" alt="${esc(u.full_name)} profile photo">`:esc(initials(u.full_name));
  document.querySelectorAll('.user-chip .avatar,.profile-main .avatar').forEach(avatar=>avatar.innerHTML=content);
  const rowPhoto=document.querySelector('.row-photo');if(rowPhoto)rowPhoto.innerHTML=photoContent();
}

function preparePhoto(file){
  return new Promise((resolve,reject)=>{
    if(!['image/jpeg','image/png','image/webp'].includes(file.type))return reject(new Error('Choose a JPG, PNG, or WebP image.'));
    if(file.size>5*1024*1024)return reject(new Error('Choose an image smaller than 5 MB.'));
    const reader=new FileReader();
    reader.onerror=()=>reject(new Error('This image could not be opened.'));
    reader.onload=()=>{
      const image=new Image();
      image.onerror=()=>reject(new Error('This image could not be opened.'));
      image.onload=()=>{
        const size=Math.min(image.naturalWidth,image.naturalHeight),left=(image.naturalWidth-size)/2,top=(image.naturalHeight-size)/2;
        const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;
        canvas.getContext('2d').drawImage(image,left,top,size,size,0,0,512,512);
        resolve(canvas.toDataURL('image/webp',.86));
      };
      image.src=reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function renderPhotoEditor(button){
  document.querySelector('.inline-editor')?.remove();
  let draft=u.profile_photo||'';
  const editor=document.createElement('div');editor.className='inline-editor';
  const preview=()=>draft?`<img src="${esc(draft)}" alt="Profile photo preview">`:`<span>${esc(initials(u.full_name))}</span>`;
  editor.innerHTML=`<div class="inline-editor-head"><b>Edit profile picture</b></div><div class="photo-editor-body"><div class="photo-preview">${preview()}</div><div><div class="photo-tools"><label class="secondary" for="profile-photo-file">Choose photo</label><input id="profile-photo-file" type="file" accept="image/jpeg,image/png,image/webp"><button class="danger photo-remove" type="button" ${draft?'':'hidden'}>Remove</button></div><p class="photo-note">JPG, PNG, or WebP up to 5 MB. The photo is cropped to a square.</p></div></div><div class="inline-editor-actions"><button class="secondary" type="button" data-close>Cancel</button><button class="primary" type="button" id="save-editor">Save</button></div>`;
  button.insertAdjacentElement('afterend',editor);
  const photoPreview=editor.querySelector('.photo-preview'),remove=editor.querySelector('.photo-remove'),fileInput=editor.querySelector('#profile-photo-file');
  fileInput.onchange=async()=>{const[file]=fileInput.files;if(!file)return;try{draft=await preparePhoto(file);photoPreview.innerHTML=preview();remove.hidden=false}catch(error){fileInput.value='';toast(error.message)}};
  remove.onclick=()=>{draft='';photoPreview.innerHTML=preview();remove.hidden=true;fileInput.value=''};
  editor.querySelector('[data-close]').onclick=()=>editor.remove();
  editor.querySelector('#save-editor').onclick=()=>{Store.update({profile_photo:draft});u.profile_photo=draft;button.querySelector('small').textContent=draft?'Photo added':'Add a profile picture';button.querySelector('.row-action').textContent=draft?'Change':'Add';syncAvatar();editor.remove();toast(draft?'Profile picture saved.':'Profile picture removed.')};
}

function renderEditor(key,button){
  if(key==='profile_photo')return renderPhotoEditor(button);
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
  editor.querySelector('#save-editor').onclick=()=>{const next=field.value.trim();if(!next&&key!=='gender')return toast(`Enter your ${label.toLowerCase()}.`);if(key==='full_name'&&(next.length<2||next.length>80||!/^\p{L}[\p{L}\p{M} .'’-]*$/u.test(next)))return toast('Enter a valid full name (2–80 characters).');if(key==='nickname'&&(next.length<2||next.length>30||!/^\p{L}[\p{L}\p{M} .'’-]*$/u.test(next)))return toast('Enter a valid nickname (2–30 characters).');if(key==='phone'&&!/^\d{10}$/.test(next))return toast('Enter a 10-digit mobile number.');Store.update({[key]:next});u[key]=next;const displayed=key==='language'?(readable[next]||next):(next||'Not set');button.querySelector('small').textContent=displayed;if(key==='full_name'){document.querySelector('.profile-main h1').textContent=next;syncAvatar()}editor.remove();toast(`${label} saved.`)};
}
document.querySelectorAll('.info-row[data-key]').forEach(button=>button.onclick=()=>renderEditor(button.dataset.key,button));
