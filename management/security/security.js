import {setup,user,Store,$,toast,esc,modal} from '../shared/layout.js?v=20261114-0600';

const u=user();
const icon={
  shield:'<path d="M12 3 20 6v5c0 5-3.4 8.4-8 10-4.6-1.6-8-5-8-10V6z"/><path d="M9 12l2 2 4-4"/>',
  password:'<path d="M4 7h16M6 12h2m3 0h2m3 0h2M5 17h14"/>',
  phone:'<path d="M7 3 4.5 5.5c-1 1 1.3 6.2 4.6 9.4 3.2 3.3 8.4 5.6 9.4 4.6L21 17l-3.5-2.5-2 2c-1.8-.8-4.2-3.2-5-5l2-2z"/>',
  email:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  device:'<rect x="4" y="4" width="16" height="12" rx="1.5"/><path d="M9 20h6M12 16v4"/>',
  apps:'<circle cx="12" cy="12" r="8"/><path d="M8 12h8M12 8v8"/>'
};
const svg=name=>`<svg viewBox="0 0 24 24" aria-hidden="true">${icon[name]}</svg>`;
const method=(name,title,detail,action,extra='')=>`<button class="security-item" type="button" data-action="${action}"><span class="security-icon">${svg(name)}</span><span><b>${title}</b><small>${detail}</small></span>${extra}<span class="security-arrow">›</span></button>`;
const eventTime=value=>{try{return new Date(value).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'})}catch{return 'Recently'}};
const events=(u.security_events||[]).slice(0,4);
const activity=events.length?events.map(event=>`<div class="security-activity"><span class="security-icon">${svg('shield')}</span><span><b>${esc(event.title)}</b><small>${esc(event.detail)} · ${esc(eventTime(event.created_at))}</small></span><span class="badge">Account</span></div>`).join(''):`<div class="security-activity"><span class="security-icon">${svg('shield')}</span><span><b>No recent security alerts</b><small>No unusual activity has been recorded in the last 28 days.</small></span><span class="badge">Protected</span></div>`;
const passwordEvent=events.find(event=>event.type==='password');

setup('security',`<h1>Security &amp; sign-in</h1><p class="lead">Review sign-in methods, devices, and access to your Indo Account.</p>
<section class="security-section"><h2>Recent security activity</h2><p class="section-note">Security events and important account alerts.</p><article class="security-activity-list">${activity}</article></section>
<section class="security-section"><h2>How you sign in to Indo Account</h2><p class="section-note">Keep recovery information current so you never lose access.</p><div class="security-list">
  <div class="security-item static"><span class="security-icon">${svg('shield')}</span><span><b>Secondary email OTP two-step protection</b><small id="two-step-detail">${u.two_step?'On — OTP is required for sensitive actions.':'Off — turn it on for stronger protection.'}</small></span><input id="two-step" class="switch" type="checkbox" ${u.two_step?'checked':''} aria-label="Toggle two-step protection"></div>
  ${method('password','Password',passwordEvent?`Last changed ${esc(eventTime(passwordEvent.created_at))}.`:'Use a strong, unique password.','password')}
  ${method('phone','Recovery phone',u.phone?`+91 ${esc(u.phone)}`:'Add a recovery phone number.','personal')}
  ${method('email','Recovery email',esc(u.secondary_email)||'Add a recovery email address.','personal')}
</div></section>`);

const style=document.createElement('style');
style.textContent=`
  .security-section{margin:0 0 24px}.security-section h2{font-size:18px;margin:0 0 3px}.section-note{margin:0 0 11px;color:#607087;font-size:14px}
  .security-activity-list,.security-list{overflow:hidden;background:#fff;border:1px solid #e1e7ef;border-radius:16px}.security-activity,.security-item{display:grid;grid-template-columns:38px minmax(0,1fr) auto;gap:14px;align-items:center;padding:15px 18px}.security-activity{border-bottom:1px solid #e7ebf1}.security-activity:last-child{border-bottom:0}.security-activity b,.security-activity small,.security-item b,.security-item small{display:block}.security-activity small,.security-item small{margin-top:3px;color:#607087;font-size:13px;overflow-wrap:anywhere}.security-item{width:100%;border:0;border-bottom:1px solid #e7ebf1;background:#fff;text-align:left;color:#1f2937}.security-item:last-child{border-bottom:0}.security-item:not(.static):hover{background:#f8fbff;cursor:pointer}.security-icon{width:32px;height:32px;display:grid;place-items:center;color:#38516f}.security-icon svg{width:21px;height:21px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}.security-arrow{font-size:25px;color:#2457d6}.security-item .switch{justify-self:end}.password-panel{margin-top:-7px}.security-chips{display:flex;flex-wrap:wrap;gap:8px}.security-chips button{border:1px solid #bdc8d7;border-radius:9px;background:#fff;padding:8px 12px;color:#263348;font-weight:700;font-size:13px}.text-action{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border:1px solid #e1e7ef;border-top:0;border-radius:0 0 16px 16px;background:#fff;color:#1f2937;font-weight:700}.text-action span{font-size:25px;color:#2457d6}
  @media(max-width:760px){.security-section{margin-bottom:20px}.security-section h2{font-size:17px}.section-note{font-size:13px}.security-activity,.security-item{grid-template-columns:30px minmax(0,1fr) auto;gap:10px;padding:13px 12px}.security-icon{width:28px;height:28px}.security-icon svg{width:19px;height:19px}.security-activity small,.security-item small{font-size:12px}.security-chips{display:grid;grid-template-columns:1fr 1fr}.security-chips button:last-child{grid-column:1/-1}.text-action{padding:10px 12px;font-size:14px}.password-panel{margin-top:-4px}.password-panel .section-title{margin-bottom:2px}}
`;
document.head.append(style);

const inlineStyle=document.createElement('style');
inlineStyle.textContent=`
  .inline-password{display:grid;gap:13px;padding:18px;background:#f8fbff;border-bottom:1px solid #e1e7ef}.inline-password-head{font-size:15px}.inline-password .field{margin:0}.inline-password-actions{display:flex;justify-content:flex-end;gap:10px}.inline-password-actions .primary{width:auto;min-width:145px;margin:0}.password-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:13px}.password-fields .current-field{grid-column:1/-1}.password-rules{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px 16px;margin:0;padding:12px 14px;list-style:none;border-radius:10px;background:#fff;border:1px solid #e1e7ef;color:#68768a;font-size:12px}.password-rules li::before{content:"○";margin-right:6px}.password-rules li.met{color:#087443;font-weight:700}.password-rules li.met::before{content:"✓"}.password-error{min-height:18px;margin:0;color:#bc1d1d;font-size:12px}
  @media(max-width:760px){.inline-password{padding:14px 12px}.inline-password-actions{display:grid;grid-template-columns:1fr 1fr}.inline-password-actions .primary{width:100%;min-width:0}.password-fields,.password-rules{grid-template-columns:1fr}.password-fields .current-field{grid-column:auto}}
`;
document.head.append(inlineStyle);

const twoStep=$('#two-step'),twoStepDetail=$('#two-step-detail');
function applyTwoStep(enabled){Store.setTwoStep(enabled);u.two_step=enabled;twoStep.checked=enabled;twoStepDetail.textContent=enabled?'On — OTP is required for sensitive actions.':'Off — turn it on for stronger protection.';toast(`Two-step protection turned ${enabled?'on':'off'}.`)}
twoStep.onchange=e=>{if(e.target.checked)return applyTwoStep(true);e.target.checked=true;modal('Turn off two-step protection','<p>Sensitive account changes will no longer require a secondary email OTP.</p>',()=>applyTwoStep(false),true)};
function openPassword(button){
  document.querySelector('.inline-password')?.remove();
  const form=document.createElement('form');form.className='inline-password';
  form.innerHTML=`<b class="inline-password-head">Change password</b><div class="password-fields"><div class="field current-field"><label for="current-password">Current password</label><div class="password-wrap"><input id="current-password" name="current" type="password" autocomplete="current-password" required><button class="toggle" type="button" data-toggle="current-password">Show</button></div></div><div class="field"><label for="new-password">New password</label><div class="password-wrap"><input id="new-password" name="new" type="password" minlength="8" maxlength="64" autocomplete="new-password" required><button class="toggle" type="button" data-toggle="new-password">Show</button></div></div><div class="field"><label for="confirm-password">Confirm password</label><div class="password-wrap"><input id="confirm-password" name="confirm" type="password" minlength="8" maxlength="64" autocomplete="new-password" required><button class="toggle" type="button" data-toggle="confirm-password">Show</button></div></div></div><ul class="password-rules"><li data-rule="length">8–64 characters</li><li data-rule="upper">Uppercase letter</li><li data-rule="lower">Lowercase letter</li><li data-rule="number">Number</li><li data-rule="symbol">Symbol</li><li data-rule="match">Passwords match</li></ul><p class="password-error" aria-live="polite"></p><div class="inline-password-actions"><button type="button" class="secondary" data-cancel>Cancel</button><button class="primary">Update password</button></div>`;
  button.insertAdjacentElement('afterend',form);
  form.querySelector('[data-cancel]').onclick=()=>form.remove();
  form.querySelectorAll('[data-toggle]').forEach(toggle=>toggle.onclick=()=>{const input=form.querySelector(`#${toggle.dataset.toggle}`),show=input.type==='password';input.type=show?'text':'password';toggle.textContent=show?'Hide':'Show'});
  const current=form.querySelector('[name="current"]'),next=form.querySelector('[name="new"]'),confirm=form.querySelector('[name="confirm"]'),error=form.querySelector('.password-error');
  const rules={length:value=>value.length>=8&&value.length<=64,upper:value=>/[A-Z]/.test(value),lower:value=>/[a-z]/.test(value),number:value=>/\d/.test(value),symbol:value=>/[^A-Za-z0-9]/.test(value),match:value=>!!value&&value===confirm.value};
  const updateRules=()=>{Object.entries(rules).forEach(([name,test])=>form.querySelector(`[data-rule="${name}"]`).classList.toggle('met',test(next.value)));error.textContent=''};
  next.oninput=updateRules;confirm.oninput=updateRules;
  form.onsubmit=e=>{e.preventDefault();updateRules();if(!Object.values(rules).every(test=>test(next.value))){error.textContent='Complete all password requirements.';return}try{Store.changePassword(current.value,next.value);button.querySelector('small').textContent='Last changed just now.';form.remove();toast('Password updated securely.')}catch(reason){error.textContent=reason.message}};
  current.focus();
}
document.querySelectorAll('[data-action]').forEach(button=>button.onclick=()=>{const action=button.dataset.action;if(action==='password'){openPassword(button);return}location.href=action==='personal'?'../personal-info/index.html':action==='devices'?'../devices/index.html':'../apps-data/index.html'});
document.querySelectorAll('[data-coming]').forEach(button=>button.onclick=()=>toast('This security method will be enabled with the production backend.'));
