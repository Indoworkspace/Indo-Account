import {setup,user,Store,toast} from '../shared/layout.js?v=20261116-cleanabout1';

const optional=[
  ['security','Security alerts','Password, recovery and account protection notices.'],
  ['signin','Sign-in alerts','Get notified when a browser or device signs in.'],
  ['account','Account changes','Updates when recovery details or account settings change.'],
  ['updates','Indo service updates','Important feature and service announcements.'],
  ['news','Tips and product news','Occasional tips about getting more from Indo services.']
];

function render(){
  const u=user();
  const row=([key,label,detail])=>`<div class="notification-row"><div><b>${label}</b><p>${detail}</p></div><input class="switch notice" data-key="${key}" type="checkbox" ${u.notifications[key]?'checked':''} aria-label="${label}"></div>`;

  setup('notifications',`<h1>Notifications</h1><p class="lead">Control account alerts and optional updates in one place.</p>
  
  <section class="notification-section"><div class="section-heading"><div><h2>Your notification choices</h2><p>Changes are saved immediately across your Indo Account.</p></div><div class="bulk-actions"><button class="secondary" id="enable-optional" type="button">Turn on all</button><button class="secondary" id="disable-optional" type="button">Turn off optional</button></div></div><article class="notification-card">${optional.map(row).join('')}</article></section>
  <section class="notification-section"><div class="section-heading"><div><h2>Delivery destination</h2><p>Account notifications currently use your verified recovery email.</p></div></div><article class="delivery-card"><span class="delivery-icon">@</span><div><b>${u.secondary_email||'No recovery email added'}</b><p>${u.secondary_email_verified?'Verified and ready for delivery.':'Verify your recovery email in Personal info.'}</p></div><a class="secondary" href="../personal-info/index.html">Manage</a></article></section>`);

  const style=document.createElement('style');
  style.textContent=`
    .notification-section{margin:0 0 25px}.section-heading{display:flex;align-items:flex-end;justify-content:space-between;gap:14px;margin-bottom:11px}.section-heading h2{margin:0 0 3px;font-size:19px}.section-heading p{margin:0;color:#465468;font-size:13px}.notification-card,.delivery-card{overflow:hidden;border:1px solid #cfd8e5;border-radius:16px;background:#fff}.notification-row{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:20px;padding:17px 20px;border-bottom:1px solid #d8e0ea}.notification-row:last-child{border-bottom:0}.notification-row b,.delivery-card b{display:block}.notification-row p,.delivery-card p{margin:3px 0 0;color:#465468;font-size:13px;line-height:1.4}.locked-row{background:#fbfdff}.locked-row .switch{opacity:.7;cursor:not-allowed}.bulk-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}.bulk-actions button{padding:9px 12px;font-size:12px}.delivery-card{display:grid;grid-template-columns:42px minmax(0,1fr) auto;align-items:center;gap:14px;padding:18px 20px}.delivery-icon{width:40px;height:40px;display:grid;place-items:center;border-radius:13px;background:#dceaff;color:#2457d6;font-size:20px;font-weight:800}.delivery-card .secondary{white-space:nowrap}.notice:disabled,.bulk-actions button:disabled{cursor:wait;opacity:.55}
    @media(max-width:760px){.notification-section{margin-bottom:21px}.section-heading{align-items:flex-start;flex-direction:column}.section-heading h2{font-size:17px}.bulk-actions{width:100%;display:grid;grid-template-columns:1fr 1fr}.notification-row{padding:14px 13px;gap:12px}.notification-row p,.delivery-card p{font-size:12px}.delivery-card{grid-template-columns:36px minmax(0,1fr) auto;padding:15px 13px;gap:10px}.delivery-icon{width:34px;height:34px}.delivery-card .secondary{padding:9px 10px;font-size:12px}}
    @media(max-width:430px){.delivery-card{grid-template-columns:34px minmax(0,1fr)}.delivery-card .secondary{grid-column:1/-1;width:100%;text-align:center}}
  `;
  document.head.append(style);

  const notices=[...document.querySelectorAll('.notice')];
  const bulk=[document.querySelector('#enable-optional'),document.querySelector('#disable-optional')];
  const busy=value=>[...notices,...bulk].forEach(control=>control.disabled=value);
  const syncInputs=settings=>notices.forEach(input=>input.checked=!!settings[input.dataset.key]);

  async function save(changes,message){
    busy(true);
    try{const updated=await Store.updateNotifications(changes);Object.assign(u.notifications,updated);syncInputs(updated);toast(message)}
    catch(error){syncInputs(u.notifications);toast(error.message)}
    finally{busy(false)}
  }

  notices.forEach(input=>input.onchange=()=>save({[input.dataset.key]:input.checked},'Notification preference saved.'));
  document.querySelector('#enable-optional').onclick=()=>save(Object.fromEntries(optional.map(([key])=>[key,true])),'All optional notifications turned on.');
  document.querySelector('#disable-optional').onclick=()=>save(Object.fromEntries(optional.map(([key])=>[key,false])),'Optional notifications turned off.');
}

async function start(){
  try{await Store.refresh();window.__indoSessionValidated=true}
  catch(error){if(!Store.current())return;toast(error.message)}
  render();
}

start();
