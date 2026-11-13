import {Store} from '../shared/store.js';Store.init();
const $=s=>document.querySelector(s);$('#toggle-password').onclick=e=>{e.preventDefault();const p=$('#password');p.type=p.type==='password'?'text':'password';$('#toggle-password').textContent=p.type==='password'?'Show password':'Hide password'};
$('#signin-form').onsubmit=e=>{e.preventDefault();try{Store.login($('#identifier').value,$('#password').value);location.href='../management/index.html'}catch(err){$('#message').textContent=err.message}};
