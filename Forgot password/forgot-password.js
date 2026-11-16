import {PasswordReset} from '../shared/password-reset.js?v=20261116-footer2';

const $=selector=>document.querySelector(selector);
const steps=[null,$('#identify-step'),$('#verify-step'),$('#password-step')];
let identifier='',resetToken='',resendUntil=0,resendTimer=null;

function showStep(number){steps.slice(1).forEach((step,index)=>step.classList.toggle('hidden',index+1!==number));document.querySelectorAll('.reset-progress span').forEach((bar,index)=>bar.classList.toggle('active',index<number));$('#step-label').textContent=['','Find your account','Verify recovery email','Create a new password'][number]}
function message(text,success=false){const box=$('#message');box.className=success?'success':'error';box.textContent=text}
function startResendTimer(seconds){resendUntil=Date.now()+Number(seconds||60)*1000;if(resendTimer)clearInterval(resendTimer);const button=$('#resend'),tick=()=>{const left=Math.max(0,Math.ceil((resendUntil-Date.now())/1000));button.disabled=left>0;button.textContent=left?`Resend in ${left}s`:'Resend code';if(!left){clearInterval(resendTimer);resendTimer=null}};tick();resendTimer=setInterval(tick,1000)}
function resetChallenge(){resetToken='';resendUntil=0;if(resendTimer)clearInterval(resendTimer);resendTimer=null;$('#otp').value='';$('#resend').disabled=false;$('#resend').textContent='Resend code'}

async function sendCode(){const button=$('#identify-form button'),resend=$('#resend');button.disabled=true;resend.disabled=true;button.textContent='Sending…';resetToken='';try{const result=await PasswordReset.request(identifier);$('#destination').textContent=result.message||'If this account is registered, a 6-digit code was sent to its recovery email.';showStep(2);message('');startResendTimer(result.resend_after);return true}catch(error){message(error.message);resend.disabled=false;return false}finally{button.disabled=false;button.textContent='Continue'}}

$('#identify-form').onsubmit=async event=>{event.preventDefault();identifier=$('#identifier').value.trim();if(!identifier)return;await sendCode()};
$('#verify-form').onsubmit=async event=>{event.preventDefault();const button=$('#verify-form button'),code=$('#otp').value.trim();button.disabled=true;button.textContent='Verifying…';try{const result=await PasswordReset.verify(identifier,code);resetToken=result.reset_token;showStep(3);message('Recovery email verified.',true);$('#new-password').focus()}catch(error){resetToken='';message(error.message)}finally{button.disabled=false;button.textContent='Verify code'}};
$('#resend').onclick=async()=>{if(Date.now()<resendUntil)return;if(await sendCode())message('If the account is registered, a new verification code was sent.',true)};
$('#change-identifier').onclick=()=>{identifier='';resetChallenge();$('#identifier').value='';showStep(1);message('');$('#identifier').focus()};
$('#otp').oninput=()=>{$('#otp').value=$('#otp').value.replace(/\D/g,'').slice(0,6);resetToken=''};
document.querySelectorAll('.toggle-password').forEach(button=>button.onclick=()=>{const input=$(button.dataset.target),hidden=input.type==='password';input.type=hidden?'text':'password';button.textContent=hidden?'Hide':'Show'});
$('#password-form').onsubmit=async event=>{event.preventDefault();const password=$('#new-password').value,confirm=$('#confirm-password').value,button=$('#password-form button.primary');if(password!==confirm){message('Passwords do not match.');return}if(!resetToken){message('Verify a new code before changing your password.');showStep(2);return}button.disabled=true;button.textContent='Updating…';try{await PasswordReset.reset(resetToken,password);resetToken='';message('Password updated. Redirecting to sign in…',true);setTimeout(()=>location.replace('../Sign%20in/index.html?reset=success'),900)}catch(error){message(error.message);button.disabled=false;button.textContent='Update password'}};
