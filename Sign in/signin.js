import {Store} from '../shared/session-store.js?v=20261116-palette1';import {Api} from '../shared/api-client.js?v=20261116-palette1';Store.init();
const $=s=>document.querySelector(s),form=$('#signin-form'),submit=$('#signin-button');$('#toggle-password').onclick=()=>{const p=$('#password'),button=$('#toggle-password'),hidden=p.type==='password';p.type=hidden?'text':'password';button.setAttribute('aria-label',hidden?'Hide password':'Show password');button.title=hidden?'Hide password':'Show password'};
if(new URLSearchParams(location.search).get('reset')==='success'){const message=$('#message');message.className='success';message.textContent='Password updated. Sign in with your new password.';history.replaceState({},'',location.pathname)}

const appName=key=>key==='EYEBROWSE'?'Eyebrowse':key==='EYESEARCH'?'Eyesearch':'Sankalp';
// A Custom Tab blocks an automatic jump to a custom scheme because there is no tap
// behind it. Try once, and only if the page is still here a moment later offer a tap,
// so the in-app WebView path never shows a button it does not need.
function returnToApp(url,key){
  const name=appName(key),message=$('#message');
  message.className='success';
  message.textContent=`Signed in. Returning to ${name}…`;
  form.removeAttribute('aria-busy');
  location.href=url;
  setTimeout(()=>{
    if(document.visibilityState==='hidden')return;
    submit.textContent=`Open ${name}`;
    submit.disabled=false;
    const go=event=>{if(event)event.preventDefault();location.href=url};
    submit.onclick=go;
    form.onsubmit=go;
    if(!document.querySelector('#return-to-app')){
      const link=document.createElement('a');
      link.id='return-to-app';
      link.className='secondary';
      link.href=url;
      link.textContent=`Return to ${name}`;
      link.style.cssText='display:block;text-align:center;margin-top:12px';
      submit.insertAdjacentElement('afterend',link);
    }
  },1200);
}

form.addEventListener('input',()=>{const message=$('#message');if(message.classList.contains('error'))message.textContent=''});
const handoff=()=>{const params=new URLSearchParams(location.search),app=(params.get('app')||'').toUpperCase(),redirect=params.get('redirect')||'',challenge=params.get('code_challenge')||'';if(!['SANKALPA','EYESEARCH','EYEBROWSE'].includes(app)||!redirect||!challenge)return null;return{app,redirect,code_challenge:challenge,state:params.get('state')||''}};
const pending=handoff();
if(pending){const note=$('#message');note.className='success';note.textContent=`Sign in to continue to ${pending.app==='EYEBROWSE'?'Eyebrowse':pending.app==='EYESEARCH'?'Eyesearch':'Sankalp'}.`}
form.onsubmit=async event=>{event.preventDefault();const message=$('#message');submit.disabled=true;submit.textContent='Signing in…';form.setAttribute('aria-busy','true');try{await Store.login($('#identifier').value,$('#password').value);if(pending){submit.textContent='Returning to the app…';const result=await Api.authorizeApp(pending.app,pending);returnToApp(result.redirect_url,pending.app);return}submit.textContent='Opening account…';location.replace('../management/index.html')}catch(error){message.className='error';message.textContent=error.message;submit.disabled=false;submit.textContent='Sign in';form.removeAttribute('aria-busy')}};
