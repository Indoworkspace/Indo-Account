import {PasswordReset} from '../shared/password-reset.js?v=20261114-1000';

const $=selector=>document.querySelector(selector);
const steps=[null,$('#identify-step'),$('#verify-step'),$('#password-step')];
let identifier='';

function showStep(number){steps.slice(1).forEach((step,index)=>step.classList.toggle('hidden',index+1!==number));document.querySelectorAll('.reset-progress span').forEach((bar,index)=>bar.classList.toggle('active',index<number));$('#step-label').textContent=['','Find your account','Verify recovery email','Create a new password'][number]}
function message(text,success=false){const box=$('#message');box.className=success?'success':'error';box.textContent=text}
function toast(text){const item=document.createElement('div');item.className='toast';item.textContent=text;document.body.append(item);setTimeout(()=>item.remove(),8000)}
function sendCode(){const result=PasswordReset.request(identifier);$('#destination').textContent=result.found?`We sent a 6-digit code to ${result.destination}.`:'If this account is registered, a 6-digit code was sent to its recovery email.';showStep(2);message('');if(result.found)toast(`Frontend test OTP: ${result.test_otp}`)}

$('#identify-form').onsubmit=event=>{event.preventDefault();identifier=$('#identifier').value.trim();sendCode()};
$('#verify-form').onsubmit=event=>{event.preventDefault();try{PasswordReset.verify($('#otp').value.trim());showStep(3);message('Recovery email verified.',true)}catch(error){message(error.message)}};
$('#resend').onclick=()=>{sendCode();message('A new verification code was generated.',true)};
$('#change-identifier').onclick=()=>{identifier='';$('#otp').value='';showStep(1);message('')};
document.querySelectorAll('.toggle-password').forEach(button=>button.onclick=()=>{const input=$(button.dataset.target),hidden=input.type==='password';input.type=hidden?'text':'password';button.textContent=hidden?'Hide':'Show'});
$('#password-form').onsubmit=event=>{event.preventDefault();const password=$('#new-password').value,confirm=$('#confirm-password').value;if(password!==confirm){message('Passwords do not match.');return}try{PasswordReset.reset(password);message('Password updated. Redirecting to sign in…',true);setTimeout(()=>location.replace('../Sign%20in/index.html?reset=success'),900)}catch(error){message(error.message)}};
