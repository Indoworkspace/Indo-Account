import {setup} from '../shared/layout.js?v=20261114-0800';

const topics=[
  ['How do I change my password?','Open Security & sign-in, select Password, enter your current password, and create a new strong password.'],
  ['How do I update my recovery email or phone?','Open Personal info and select the recovery email or mobile row. The new contact is saved only after OTP verification.'],
  ['How do I sign out another device?','Open Devices, find the session, and select Sign out. Other sessions remain active.'],
  ['How do I download my Indo Account data?','Open Data & privacy and select Download JSON. Your password is never included in the export.'],
  ['How do I delete my account?','Open Data & privacy, choose Delete account, and type DELETE. This permanently removes the profile and all account data.'],
  ['Why are some app spaces empty?','Sankalp, Eyesearch, and Eyebrowse data spaces are reserved. Their controls will appear after each app is connected to the production backend.']
];

setup('help-support',`<h1>Help &amp; support</h1><p class="lead">Find answers and go directly to the account setting you need.</p>
<div class="help-search"><span aria-hidden="true">⌕</span><input id="help-search" type="search" placeholder="Search account help" aria-label="Search account help"></div>
<section class="help-section"><h2>Quick help</h2><div class="help-links"><a href="../personal-info/index.html"><b>Personal information</b><small>Profile, recovery contacts, language, and addresses</small><span>›</span></a><a href="../security/index.html"><b>Security &amp; sign-in</b><small>Password, two-step protection, and recovery</small><span>›</span></a><a href="../devices/index.html"><b>Devices &amp; sessions</b><small>Review and sign out connected devices</small><span>›</span></a><a href="../privacy/index.html"><b>Data &amp; privacy</b><small>Export data and manage account deletion</small><span>›</span></a></div></section>
<section class="help-section"><h2>Frequently asked questions</h2><div class="faq-list">${topics.map(([question,answer])=>`<details class="faq-item"><summary>${question}<span>+</span></summary><p>${answer}</p></details>`).join('')}<p class="no-results" hidden>No help topics match your search.</p></div></section>
<aside class="support-note"><b>Production support</b><p>Direct support requests will be enabled when the backend and support channel are connected. No request is sent from this frontend test environment.</p></aside>`);

const style=document.createElement('style');
style.textContent=`
  .help-search{display:flex;align-items:center;gap:10px;max-width:680px;margin:0 0 24px;padding:12px 16px;border:1px solid #d7deea;border-radius:24px;background:#fff;color:#607087}.help-search input{width:100%;border:0;outline:0;background:transparent;font:inherit}.help-section{margin-bottom:25px}.help-section>h2{margin:0 0 11px;font-size:19px}.help-links{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11px}.help-links a{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2px 12px;padding:16px 18px;border:1px solid #e1e7ef;border-radius:14px;background:#fff;color:#1f2937}.help-links a:hover{border-color:#bcd0f4;box-shadow:0 7px 16px #23446a10}.help-links b,.help-links small{display:block}.help-links small{grid-column:1;color:#607087;line-height:1.4}.help-links span{grid-column:2;grid-row:1/3;align-self:center;color:#2457d6;font-size:25px}.faq-list{overflow:hidden;border:1px solid #e1e7ef;border-radius:16px;background:#fff}.faq-item{border-bottom:1px solid #e7ebf1}.faq-item:last-of-type{border-bottom:0}.faq-item summary{display:flex;justify-content:space-between;gap:14px;padding:16px 18px;cursor:pointer;font-weight:700;list-style:none}.faq-item summary::-webkit-details-marker{display:none}.faq-item summary span{color:#2457d6;font-size:20px}.faq-item[open] summary span{transform:rotate(45deg)}.faq-item p{margin:0;padding:0 18px 17px;color:#607087;line-height:1.55}.no-results{margin:0;padding:18px;color:#607087}.support-note{padding:16px 18px;border-radius:14px;background:#fff8e7;border:1px solid #f2dfaa}.support-note p{margin:4px 0 0;color:#6b5a2c;font-size:13px}
  @media(max-width:760px){.help-search{max-width:none;margin-bottom:19px}.help-section{margin-bottom:21px}.help-section>h2{font-size:17px}.help-links{grid-template-columns:1fr}.help-links a{padding:14px}.help-links small,.faq-item p,.support-note p{font-size:12px}.faq-item summary{padding:14px 13px}.faq-item p{padding:0 13px 14px}}
`;
document.head.append(style);

const search=document.querySelector('#help-search'),items=[...document.querySelectorAll('.faq-item')],empty=document.querySelector('.no-results');
search.oninput=()=>{const query=search.value.trim().toLowerCase();let visible=0;items.forEach(item=>{const match=!query||item.textContent.toLowerCase().includes(query);item.hidden=!match;if(match)visible+=1});empty.hidden=visible!==0};
