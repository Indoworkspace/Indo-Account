import {setup,user,Store,$,toast,esc} from '../shared/layout.js?v=20261113-2230';

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

setup('security',`<h1>Security &amp; sign-in</h1><p class="lead">Review sign-in methods, devices, and access to your Indo Account.</p>
<section class="security-section"><h2>Recent security activity</h2><p class="section-note">Security events and important account alerts.</p><article class="security-activity"><span class="security-icon">${svg('shield')}</span><span><b>No recent security alerts</b><small>No unusual activity has been recorded in the last 28 days.</small></span><span class="badge">Protected</span></article></section>
<section class="security-section"><h2>How you sign in to Indo Account</h2><p class="section-note">Keep recovery information current so you never lose access.</p><div class="security-list">
  <div class="security-item static"><span class="security-icon">${svg('shield')}</span><span><b>Secondary email OTP two-step protection</b><small>${u.two_step?'On — OTP is required for sensitive actions.':'Off — turn it on for stronger protection.'}</small></span><input id="two-step" class="switch" type="checkbox" ${u.two_step?'checked':''} aria-label="Toggle two-step protection"></div>
  ${method('password','Password','Change your password any time.','password')}
  ${method('phone','Recovery phone',u.phone?`+91 ${esc(u.phone)}`:'Add a recovery phone number.','personal')}
  ${method('email','Recovery email',esc(u.secondary_email)||'Add a recovery email address.','personal')}
</div></section>`);

const style=document.createElement('style');
style.textContent=`
  .security-section{margin:0 0 24px}.security-section h2{font-size:18px;margin:0 0 3px}.section-note{margin:0 0 11px;color:#607087;font-size:14px}
  .security-activity,.security-list{overflow:hidden;background:#fff;border:1px solid #e1e7ef;border-radius:16px}.security-activity,.security-item{display:grid;grid-template-columns:38px minmax(0,1fr) auto;gap:14px;align-items:center;padding:15px 18px}.security-activity b,.security-activity small,.security-item b,.security-item small{display:block}.security-activity small,.security-item small{margin-top:3px;color:#607087;font-size:13px;overflow-wrap:anywhere}.security-item{width:100%;border:0;border-bottom:1px solid #e7ebf1;background:#fff;text-align:left;color:#1f2937}.security-item:last-child{border-bottom:0}.security-item:not(.static):hover{background:#f8fbff;cursor:pointer}.security-icon{width:32px;height:32px;display:grid;place-items:center;color:#38516f}.security-icon svg{width:21px;height:21px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}.security-arrow{font-size:25px;color:#2457d6}.security-item .switch{justify-self:end}.password-panel{margin-top:-7px}.security-chips{display:flex;flex-wrap:wrap;gap:8px}.security-chips button{border:1px solid #bdc8d7;border-radius:9px;background:#fff;padding:8px 12px;color:#263348;font-weight:700;font-size:13px}.text-action{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border:1px solid #e1e7ef;border-top:0;border-radius:0 0 16px 16px;background:#fff;color:#1f2937;font-weight:700}.text-action span{font-size:25px;color:#2457d6}
  @media(max-width:760px){.security-section{margin-bottom:20px}.security-section h2{font-size:17px}.section-note{font-size:13px}.security-activity,.security-item{grid-template-columns:30px minmax(0,1fr) auto;gap:10px;padding:13px 12px}.security-icon{width:28px;height:28px}.security-icon svg{width:19px;height:19px}.security-activity small,.security-item small{font-size:12px}.security-chips{display:grid;grid-template-columns:1fr 1fr}.security-chips button:last-child{grid-column:1/-1}.text-action{padding:10px 12px;font-size:14px}.password-panel{margin-top:-4px}.password-panel .section-title{margin-bottom:2px}}
`;
document.head.append(style);

const inlineStyle=document.createElement('style');
inlineStyle.textContent=`
  .inline-password{display:grid;gap:13px;padding:18px;background:#f8fbff;border-bottom:1px solid #e1e7ef}.inline-password-head{font-size:15px}.inline-password .field{margin:0}.inline-password-actions{display:flex;justify-content:flex-end;gap:10px}.inline-password-actions .primary{width:auto;min-width:145px;margin:0}
  @media(max-width:760px){.inline-password{padding:14px 12px}.inline-password-actions{display:grid;grid-template-columns:1fr 1fr}.inline-password-actions .primary{width:100%;min-width:0}}
`;
document.head.append(inlineStyle);

$('#two-step').onchange=e=>{Store.update({two_step:e.target.checked});toast(`Two-step protection turned ${e.target.checked?'on':'off'}.`)};
function openPassword(button){
  document.querySelector('.inline-password')?.remove();
  const form=document.createElement('form');form.className='inline-password';
  form.innerHTML=`<b class="inline-password-head">Change password</b><div class="grid"><div class="field"><label>New password</label><input name="new" type="password" minlength="8" required></div><div class="field"><label>Confirm password</label><input name="confirm" type="password" minlength="8" required></div></div><div class="inline-password-actions"><button type="button" class="secondary" data-cancel>Cancel</button><button class="primary">Update password</button></div>`;
  button.insertAdjacentElement('afterend',form);
  form.querySelector('[data-cancel]').onclick=()=>form.remove();
  form.onsubmit=e=>{e.preventDefault();const f=new FormData(form);if(f.get('new')!==f.get('confirm'))return toast('Passwords do not match.');Store.changePassword(f.get('new'));form.remove();toast('Password updated.')};
}
document.querySelectorAll('[data-action]').forEach(button=>button.onclick=()=>{const action=button.dataset.action;if(action==='password'){openPassword(button);return}location.href=action==='personal'?'../personal-info/index.html':action==='devices'?'../devices/index.html':'../apps-data/index.html'});
document.querySelectorAll('[data-coming]').forEach(button=>button.onclick=()=>toast('This security method will be enabled with the production backend.'));
