import {Store} from '../shared/store.js';Store.init();
const $=s=>document.querySelector(s);document.querySelector('.toggle').onclick=()=>{const p=$('#password');p.type=p.type==='password'?'text':'password';document.querySelector('.toggle').textContent=p.type==='password'?'Show':'Hide'};
$('#signin-form').onsubmit=e=>{e.preventDefault();try{Store.login($('#identifier').value,$('#password').value);location.href='../management/index.html'}catch(err){$('#message').textContent=err.message}};
$('#forgot').onclick=e=>{e.preventDefault();$('#message').className='success';$('#message').textContent='Demo OTP dispatched to your verified recovery email.'};
