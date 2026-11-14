import {Store} from '../shared/session-store.js?v=20261114-0600';Store.init();
const form=document.querySelector('#reset-form'),message=document.querySelector('#message');
form.onsubmit=e=>{e.preventDefault();message.className='success';message.textContent='If this account is registered, a verification code will be sent to its recovery email.'};
