import {appPage} from '../app-page.js?v=20261117-split1';

const panel = `
  <article class="panel">
    <h2>Your mailbox</h2>
    <p class="form-note">Eyemail is its own product with its own sign-in. Your Indo Account and your
      mailbox are separate accounts, so nothing here opens or changes the mailbox.</p>
    <p class="form-note">To read or send mail, sign in at the mail site with your Eyemail password.</p>
  </article>`;

appPage('EYEMAIL', 'Eyemail', {extra: panel});
