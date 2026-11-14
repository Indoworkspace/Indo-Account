import {setup,user,Store,esc,$,toast} from '../shared/layout.js?v=20261114-0600';

const u=user();
const iconFiles={
  id:'identification-badge-duotone.svg',name:'user-duotone.svg',nickname:'tag-duotone.svg',gender:'gender-intersex-duotone.svg',
  email:'envelope-simple-duotone.svg',phone:'phone-duotone.svg',birthday:'cake-duotone.svg',language:'translate-duotone.svg',
  home:'house-duotone.svg',work:'briefcase-duotone.svg',other:'map-pin-duotone.svg'
};
const readable={kn:'Kannada (kn)',en:'English (en)',hi:'Hindi (hi)'};
const addressSummary=(address,fallback)=>{if(typeof address==='string')return address||fallback;const parts=[address?.line1,address?.city,address?.state,address?.postal_code,address?.country].filter(Boolean);return parts.length?parts.join(', '):fallback};
const rows=[
  ['name','Full name','full_name',u.full_name,'text'],['nickname','Nickname','nickname',u.nickname,'text'],['gender','Gender','gender',u.gender||'Not set','select'],
  ['email','Recovery email','secondary_email',u.secondary_email,'email'],['phone','Mobile number','phone',u.phone?`+91 ${u.phone}`:'Add a mobile number','tel'],
  ['birthday','Birthday','dob',u.dob||'Not set','date'],['language','Language','language',readable[u.language]||'Kannada (kn)','select'],
  ['home','Home address','home_address',addressSummary(u.home_address,'Add home address'),'address'],['work','Work address','work_address',addressSummary(u.work_address,'Add work address'),'address'],['other','Other address','other_address',addressSummary(u.other_address,'Add other address'),'address']
];
const icon=name=>`<img src="../../assets/icons/phosphor/${iconFiles[name]}" alt="" aria-hidden="true">`;
const row=([kind,label,key,value])=>{const verified=key==='secondary_email'?u.secondary_email_verified:key==='phone'?u.phone_verified:null;return `<button class="info-row" data-key="${key}" type="button"><span class="info-icon">${icon(kind)}</span><span><b>${label}</b><small>${esc(value)}</small>${verified!==null?`<em class="verification-state ${verified?'verified':'unverified'}">${verified?'Verified':'Not verified'}</em>`:''}</span><span class="row-action">Edit</span></button>`};
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
  .verification-state{display:inline-flex;align-items:center;gap:5px;margin-top:5px;padding:2px 7px;border-radius:12px;font-size:11px;font-style:normal;font-weight:750}.verification-state::before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor}.verification-state.verified{background:#e9f8ef;color:#087443}.verification-state.unverified{background:#fff4dc;color:#966400}
  .inline-editor{display:grid;gap:12px;padding:18px 20px;background:#f8fbff;border-bottom:1px solid #e1e7ef}
  .inline-editor-head b{font-size:15px}
  .inline-editor .field{margin:0}.inline-editor-actions{display:flex;justify-content:flex-end;gap:10px}.inline-editor-actions .primary{width:auto;margin:0;min-width:110px}
  .photo-editor-body{display:grid;grid-template-columns:88px minmax(0,1fr);gap:18px;align-items:center}.photo-preview{width:84px;height:84px;display:grid;place-items:center;border-radius:50%;overflow:hidden;background:linear-gradient(145deg,#8d62e4,#7350cc);color:#fff;font-size:24px;font-weight:800;box-shadow:0 0 0 4px #e9deff}.photo-tools{display:flex;align-items:center;gap:9px;flex-wrap:wrap}.photo-tools label{display:inline-block;cursor:pointer}.photo-tools input{position:absolute;inline-size:1px;block-size:1px;opacity:0;pointer-events:none}.photo-note{margin:9px 0 0;color:#607087;font-size:12px}.photo-remove[hidden]{display:none}
  .contact-entry{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:9px;align-items:end}.contact-input-wrap{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:stretch}.contact-prefix{display:grid;place-items:center;padding:0 12px;border:1px solid #cbd3df;border-right:0;border-radius:10px 0 0 10px;background:#f1f4f8;color:#526177;font-weight:700}.contact-input-wrap input{border-radius:0 10px 10px 0!important}.send-otp{height:44px;white-space:nowrap}.send-otp:disabled,.otp-stage button:disabled{cursor:not-allowed;opacity:.5}.contact-hint{min-height:18px;margin:3px 0 0;color:#607087;font-size:12px}.contact-hint.error,.otp-message.error{color:#bc1d1d}.otp-stage{display:grid;gap:10px;padding:14px;border:1px solid #d9e3f3;border-radius:12px;background:#fff}.otp-stage[hidden]{display:none}.test-otp{margin:0;padding:9px 11px;border-radius:9px;background:#fff6dc;color:#735400;font-size:12px}.otp-entry{display:grid;grid-template-columns:minmax(0,220px) auto;gap:9px;align-items:end}.otp-entry input{letter-spacing:.25em;font-size:18px;font-weight:750}.otp-message{min-height:18px;margin:0;color:#607087;font-size:12px}.resend-otp{white-space:nowrap}
  .address-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 14px}.address-grid .field{margin:0 0 12px}.address-grid .wide{grid-column:1/-1}.editor-note{margin:0;color:#607087;font-size:12px}
  @media(max-width:760px){.info-icon{width:29px;height:29px}.info-icon img{width:18px;height:18px}.row-photo{width:40px;height:40px}.profile-photo-row{grid-template-columns:44px minmax(0,1fr) auto}.inline-editor{padding:14px 12px}.inline-editor-actions{display:grid;grid-template-columns:1fr 1fr}.inline-editor-actions .primary{width:100%;min-width:0}.inline-editor .field input,.inline-editor .field select{font-size:16px}.photo-editor-body{grid-template-columns:68px minmax(0,1fr);gap:13px}.photo-preview{width:64px;height:64px;font-size:19px}.photo-tools{align-items:stretch}.photo-tools label,.photo-tools button{font-size:12px;padding:10px 11px}.contact-entry{grid-template-columns:1fr}.send-otp{width:100%}.otp-entry{grid-template-columns:minmax(0,1fr) auto}.resend-otp{padding-inline:10px;font-size:12px}.address-grid{grid-template-columns:1fr}.address-grid .wide{grid-column:auto}}
`;
document.head.append(style);

let activeEditorCleanup=()=>{};
function clearEditor(){activeEditorCleanup();activeEditorCleanup=()=>{};document.querySelector('.inline-editor')?.remove()}

function renderContactEditor(key,button){
  clearEditor();
  const isEmail=key==='secondary_email',type=isEmail?'email':'phone',label=isEmail?'Recovery email':'Mobile number',verifiedKey=isEmail?'secondary_email_verified':'phone_verified';
  const normalize=value=>isEmail?value.trim().toLowerCase():value.replace(/\D/g,'').slice(-10);
  const valid=value=>isEmail?/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value):/^[6-9]\d{9}$/.test(value);
  const editor=document.createElement('div');editor.className='inline-editor contact-editor';
  const inputControl=isEmail?`<input id="contact-value" type="email" autocomplete="email" value="${esc(u.secondary_email||'')}" placeholder="name@example.com">`:`<div class="contact-input-wrap"><span class="contact-prefix">+91</span><input id="contact-value" type="tel" inputmode="numeric" maxlength="10" autocomplete="tel" value="${esc(u.phone||'')}" placeholder="10-digit mobile number"></div>`;
  editor.innerHTML=`<div class="inline-editor-head"><b>Verify new ${label.toLowerCase()}</b></div><div class="contact-entry"><div class="field"><label for="contact-value">${label}</label>${inputControl}<p class="contact-hint" aria-live="polite"></p></div><button class="secondary send-otp" type="button" disabled>Send OTP</button></div><div class="otp-stage" hidden><p class="test-otp" aria-live="polite"></p><div class="otp-entry"><div class="field"><label for="contact-otp">6-digit OTP</label><input id="contact-otp" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000"></div><button class="secondary resend-otp" type="button" disabled>Resend OTP</button></div><p class="otp-message" aria-live="polite">Enter the OTP shown above for frontend testing.</p></div><div class="inline-editor-actions"><button class="secondary" type="button" data-close>Cancel</button><button class="primary verify-contact" type="button" disabled>Verify</button></div>`;
  button.insertAdjacentElement('afterend',editor);
  const input=editor.querySelector('#contact-value'),hint=editor.querySelector('.contact-hint'),send=editor.querySelector('.send-otp'),stage=editor.querySelector('.otp-stage'),testOtp=editor.querySelector('.test-otp'),otpInput=editor.querySelector('#contact-otp'),otpMessage=editor.querySelector('.otp-message'),resend=editor.querySelector('.resend-otp'),verify=editor.querySelector('.verify-contact');
  let code='',sentValue='',timer=null,seconds=0;
  const stopTimer=()=>{if(timer)clearInterval(timer);timer=null};
  activeEditorCleanup=stopTimer;
  const updateTimer=()=>{resend.disabled=seconds>0;resend.textContent=seconds>0?`Resend in ${seconds}s`:'Resend OTP'};
  const startTimer=()=>{stopTimer();seconds=30;updateTimer();timer=setInterval(()=>{seconds-=1;updateTimer();if(seconds<=0)stopTimer()},1000)};
  const updateInputState=()=>{
    if(!isEmail){const digits=input.value.replace(/\D/g,'').slice(0,10);if(input.value!==digits)input.value=digits}
    const value=normalize(input.value),isValid=valid(value),sameVerified=value===normalize(u[key]||'')&&!!u[verifiedKey];
    if(sentValue&&value!==sentValue){sentValue='';code='';stage.hidden=true;stopTimer();otpInput.value='';verify.disabled=true}
    send.disabled=!isValid||sameVerified||value===sentValue;
    send.textContent=value===sentValue&&sentValue?'OTP sent':'Send OTP';
    hint.classList.remove('error');
    hint.textContent=!value?`Enter your ${label.toLowerCase()}.`:!isValid?(isEmail?'Enter a valid email address.':'Enter a valid 10-digit Indian mobile number.'):sameVerified?`This ${label.toLowerCase()} is already verified.`:'Ready to send OTP.';
  };
  const sendOtp=()=>{
    const value=normalize(input.value);if(!valid(value))return updateInputState();
    if(!Store.contactAvailable(type,value)){hint.textContent=`This ${label.toLowerCase()} is already registered.`;hint.classList.add('error');return}
    const random=crypto.getRandomValues(new Uint32Array(1))[0];code=String(100000+(random%900000));sentValue=value;
    stage.hidden=false;testOtp.textContent=`Frontend test mode — OTP: ${code}`;otpInput.value='';otpMessage.textContent=`OTP prepared for ${isEmail?value:`+91 ${value}`}.`;otpMessage.classList.remove('error');verify.disabled=true;send.disabled=true;send.textContent='OTP sent';startTimer();otpInput.focus();
  };
  input.addEventListener('input',updateInputState);
  send.onclick=sendOtp;resend.onclick=sendOtp;
  otpInput.oninput=()=>{otpInput.value=otpInput.value.replace(/\D/g,'').slice(0,6);verify.disabled=otpInput.value.length!==6;otpMessage.textContent='Enter the OTP shown above for frontend testing.';otpMessage.classList.remove('error')};
  verify.onclick=()=>{
    if(!code||otpInput.value!==code){otpMessage.textContent='Incorrect OTP. Check the 6-digit code and try again.';otpMessage.classList.add('error');return}
    try{const saved=Store.updateVerifiedContact(type,sentValue);u[key]=saved;u[verifiedKey]=true;button.querySelector('small').textContent=isEmail?saved:`+91 ${saved}`;const state=button.querySelector('.verification-state');state.textContent='Verified';state.className='verification-state verified';clearEditor();toast(`${label} verified and saved.`)}catch(error){otpMessage.textContent=error.message;otpMessage.classList.add('error')}
  };
  editor.querySelector('[data-close]').onclick=clearEditor;
  updateInputState();input.focus();
}

function renderAddressEditor(key,button){
  clearEditor();
  const label=key==='home_address'?'Home address':key==='work_address'?'Work address':'Other address';
  const current=typeof u[key]==='object'&&u[key]?u[key]:{line1:typeof u[key]==='string'?u[key]:'',line2:'',city:'',state:'',postal_code:'',country:'India'};
  const editor=document.createElement('div');editor.className='inline-editor address-editor';
  editor.innerHTML=`<div class="inline-editor-head"><b>Edit ${label}</b></div><div class="address-grid"><div class="field wide"><label for="address-line1">Address line</label><input id="address-line1" maxlength="120" value="${esc(current.line1||'')}" placeholder="House number and street"></div><div class="field wide"><label for="address-line2">Apartment, area, or landmark <span class="form-note">(optional)</span></label><input id="address-line2" maxlength="120" value="${esc(current.line2||'')}" placeholder="Apartment, area, or landmark"></div><div class="field"><label for="address-city">City</label><input id="address-city" maxlength="60" value="${esc(current.city||'')}" placeholder="City"></div><div class="field"><label for="address-state">State</label><input id="address-state" maxlength="60" value="${esc(current.state||'')}" placeholder="State"></div><div class="field"><label for="address-postal">PIN / postal code</label><input id="address-postal" maxlength="12" value="${esc(current.postal_code||'')}" placeholder="6-digit PIN code"></div><div class="field"><label for="address-country">Country</label><input id="address-country" maxlength="60" list="country-options" value="${esc(current.country||'India')}" placeholder="Country"><datalist id="country-options"><option value="India"><option value="Australia"><option value="Canada"><option value="United Kingdom"><option value="United States"></datalist></div></div><p class="editor-note" aria-live="polite">Required: address line, city, state, PIN/postal code, and country.</p><div class="inline-editor-actions"><button class="secondary" type="button" data-close>Cancel</button><button class="primary" type="button" id="save-address">Save</button></div>`;
  button.insertAdjacentElement('afterend',editor);
  const value=id=>editor.querySelector(id).value.trim(),note=editor.querySelector('.editor-note');
  editor.querySelector('[data-close]').onclick=clearEditor;
  editor.querySelector('#save-address').onclick=()=>{const address={line1:value('#address-line1'),line2:value('#address-line2'),city:value('#address-city'),state:value('#address-state'),postal_code:value('#address-postal').toUpperCase(),country:value('#address-country')};try{const saved=Store.updateAddress(key,address);u[key]=saved;button.querySelector('small').textContent=addressSummary(saved,`Add ${label}`);clearEditor();toast(`${label} saved.`)}catch(error){note.textContent=error.message;note.style.color='#bc1d1d'}};
  editor.querySelector('#address-line1').focus();
}

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
  clearEditor();
  let draft=u.profile_photo||'';
  const editor=document.createElement('div');editor.className='inline-editor';
  const preview=()=>draft?`<img src="${esc(draft)}" alt="Profile photo preview">`:`<span>${esc(initials(u.full_name))}</span>`;
  editor.innerHTML=`<div class="inline-editor-head"><b>Edit profile picture</b></div><div class="photo-editor-body"><div class="photo-preview">${preview()}</div><div><div class="photo-tools"><label class="secondary" for="profile-photo-file">Choose photo</label><input id="profile-photo-file" type="file" accept="image/jpeg,image/png,image/webp"><button class="danger photo-remove" type="button" ${draft?'':'hidden'}>Remove</button></div><p class="photo-note">JPG, PNG, or WebP up to 5 MB. The photo is cropped to a square.</p></div></div><div class="inline-editor-actions"><button class="secondary" type="button" data-close>Cancel</button><button class="primary" type="button" id="save-editor">Save</button></div>`;
  button.insertAdjacentElement('afterend',editor);
  const photoPreview=editor.querySelector('.photo-preview'),remove=editor.querySelector('.photo-remove'),fileInput=editor.querySelector('#profile-photo-file');
  fileInput.onchange=async()=>{const[file]=fileInput.files;if(!file)return;try{draft=await preparePhoto(file);photoPreview.innerHTML=preview();remove.hidden=false}catch(error){fileInput.value='';toast(error.message)}};
  remove.onclick=()=>{draft='';photoPreview.innerHTML=preview();remove.hidden=true;fileInput.value=''};
  editor.querySelector('[data-close]').onclick=clearEditor;
  editor.querySelector('#save-editor').onclick=()=>{Store.update({profile_photo:draft});u.profile_photo=draft;button.querySelector('small').textContent=draft?'Photo added':'Add a profile picture';button.querySelector('.row-action').textContent=draft?'Change':'Add';syncAvatar();clearEditor();toast(draft?'Profile picture saved.':'Profile picture removed.')};
}

function renderEditor(key,button){
  if(key==='profile_photo')return renderPhotoEditor(button);
  if(key==='secondary_email'||key==='phone')return renderContactEditor(key,button);
  if(['home_address','work_address','other_address'].includes(key))return renderAddressEditor(key,button);
  const item=rows.find(row=>row[2]===key);if(!item)return;
  const[,label,,value,type]=item;
  const current=u[key]||'';
  let control=`<input id="edit-value" type="${type==='select'?'text':type}" value="${esc(current)}">`;
  if(key==='language')control=`<select id="edit-value"><option value="kn">Kannada (kn)</option><option value="en">English (en)</option><option value="hi">Hindi (hi)</option></select>`;
  if(key==='gender')control=`<select id="edit-value"><option value="">Select gender</option><option>Male</option><option>Female</option><option>Non-binary</option><option>Prefer not to say</option></select>`;
  if(key==='dob'){const cutoff=new Date();cutoff.setFullYear(cutoff.getFullYear()-13);const maxDate=`${cutoff.getFullYear()}-${String(cutoff.getMonth()+1).padStart(2,'0')}-${String(cutoff.getDate()).padStart(2,'0')}`;control=`<input id="edit-value" type="date" min="1900-01-01" max="${maxDate}" value="${esc(current)}"><p class="editor-note">You must be at least 13 years old.</p>`}
  clearEditor();
  const editor=document.createElement('div');editor.className='inline-editor';
  editor.innerHTML=`<div class="inline-editor-head"><b>Edit ${esc(label)}</b></div><div class="field"><label>${esc(label)}</label>${control}</div><div class="inline-editor-actions"><button class="secondary" type="button" data-close>Cancel</button><button class="primary" type="button" id="save-editor">Save</button></div>`;
  button.insertAdjacentElement('afterend',editor);
  const field=editor.querySelector('#edit-value');if(key==='language')field.value=u.language||'kn';if(key==='gender')field.value=u.gender||'';
  editor.querySelectorAll('[data-close]').forEach(close=>close.onclick=clearEditor);
  editor.querySelector('#save-editor').onclick=()=>{const next=field.value.trim();if(!next&&key!=='gender')return toast(`Enter your ${label.toLowerCase()}.`);if(key==='full_name'&&(next.length<2||next.length>80||!/^\p{L}[\p{L}\p{M} .'’-]*$/u.test(next)))return toast('Enter a valid full name (2–80 characters).');if(key==='nickname'&&(next.length<2||next.length>30||!/^\p{L}[\p{L}\p{M} .'’-]*$/u.test(next)))return toast('Enter a valid nickname (2–30 characters).');if(key==='dob'){const cutoff=new Date();cutoff.setFullYear(cutoff.getFullYear()-13);const maxDate=`${cutoff.getFullYear()}-${String(cutoff.getMonth()+1).padStart(2,'0')}-${String(cutoff.getDate()).padStart(2,'0')}`;if(next<'1900-01-01'||next>maxDate)return toast('Enter a valid birthday. You must be at least 13 years old.')}Store.update({[key]:next});u[key]=next;const displayed=key==='language'?(readable[next]||next):(next||'Not set');button.querySelector('small').textContent=displayed;if(key==='full_name'){document.querySelector('.profile-main h1').textContent=next;syncAvatar()}clearEditor();toast(`${label} saved.`)};
}
document.querySelectorAll('.info-row[data-key]').forEach(button=>button.onclick=()=>renderEditor(button.dataset.key,button));
