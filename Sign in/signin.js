import {Store} from '../shared/session-store.js?v=20261114-0600';Store.init();
const $=s=>document.querySelector(s);$('#toggle-password').onclick=()=>{const p=$('#password'),button=$('#toggle-password'),hidden=p.type==='password';p.type=hidden?'text':'password';button.setAttribute('aria-label',hidden?'Hide password':'Show password');button.title=hidden?'Hide password':'Show password'};
$('#signin-form').onsubmit=e=>{e.preventDefault();try{Store.login($('#identifier').value,$('#password').value);location.href='../management/index.html'}catch(err){$('#message').textContent=err.message}};
