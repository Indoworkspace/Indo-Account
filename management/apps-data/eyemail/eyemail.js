import {appPage} from '../app-page.js?v=20261117-mail3';
import {Api} from '../../../shared/api-client.js?v=20261117-mail3';

const panel = `
  <article class="panel">
    <h2>Your mailbox</h2>
    <p class="form-note">Opening your mail takes you to your @eyemail.in inbox. You are already signed in — there is no second password.</p>
    <p id="mail-status" class="form-note" aria-live="polite"></p>
    <button class="primary" id="mail-open" type="button">Open mail</button>
  </article>`;

appPage('EYEMAIL', 'Eyemail', {
  extra: panel,
  onMount() {
    const button = document.getElementById('mail-open');
    const status = document.getElementById('mail-status');
    if (!button) return;

    button.onclick = async () => {
      button.disabled = true;
      button.textContent = 'Opening…';
      status.textContent = '';
      // The link is minted per click: the token inside it is short-lived and single use.
      const tab = window.open('', '_blank');
      try {
        const {url} = await Api.mailSession();
        if (tab) tab.location.replace(url);
        else window.location.href = url;
        status.textContent = '';
      } catch (error) {
        if (tab) tab.close();
        status.textContent = error.message;
      } finally {
        button.disabled = false;
        button.textContent = 'Open mail';
      }
    };

    // Arriving from the mail site's "Sign in with Indo Account" button: open the inbox at once,
    // so the person is not asked to press the same button twice.
    if (new URLSearchParams(location.search).get('open') === 'mail') {
      history.replaceState(null, '', location.pathname);
      button.click();
    }
  },
});
