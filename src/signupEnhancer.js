const API_BASE_URL = 'https://carbonai-backend.onrender.com';

function addStyles() {
  if (document.getElementById('carbonai-signup-enhancer-styles')) return;

  const style = document.createElement('style');
  style.id = 'carbonai-signup-enhancer-styles';
  style.textContent = `
    .carbonai-signup-enhancer-overlay {
      position: fixed; inset: 0; z-index: 99999;
      display: grid; place-items: center; padding: 24px;
      background: rgba(4, 16, 10, .58); backdrop-filter: blur(10px);
    }
    .carbonai-signup-enhancer-modal {
      position: relative; width: min(460px, 100%); padding: 38px;
      border-radius: 24px; background: #fff; color: #17251e;
      box-shadow: 0 30px 90px rgba(0,0,0,.35);
    }
    .carbonai-signup-enhancer-close {
      position: absolute; top: 14px; right: 16px; border: 0;
      background: transparent; font-size: 28px; color: #68766e; cursor: pointer;
    }
    .carbonai-signup-enhancer-badge {
      color: #3d9a5a; font-size: 11px; letter-spacing: 2px; font-weight: 700;
    }
    .carbonai-signup-enhancer-modal h2 {
      margin: 12px 0; font: 400 38px/1 Georgia, serif;
    }
    .carbonai-signup-enhancer-modal h2 span { color: #54a871; font-style: italic; }
    .carbonai-signup-enhancer-description { color: #68766e; line-height: 1.6; }
    .carbonai-signup-enhancer-form { display: grid; gap: 10px; margin-top: 24px; }
    .carbonai-signup-enhancer-form label { font-weight: 700; font-size: 13px; margin-top: 6px; }
    .carbonai-signup-enhancer-form input {
      width: 100%; padding: 14px 15px; border: 1px solid #d6ded8;
      border-radius: 10px; outline: none; box-sizing: border-box;
    }
    .carbonai-signup-enhancer-form input:focus { border-color: #69b980; }
    .carbonai-signup-enhancer-submit {
      margin-top: 10px; border: 0; border-radius: 999px; padding: 14px;
      background: #a8ebc0; color: #07170f; font-weight: 800; cursor: pointer;
    }
    .carbonai-signup-enhancer-submit:disabled { opacity: .65; cursor: wait; }
    .carbonai-signup-enhancer-error {
      padding: 10px 12px; border-radius: 9px; background: #fff0f0;
      color: #a33a3a; font-size: 13px; line-height: 1.4;
    }
    .carbonai-signup-enhancer-success {
      padding: 12px; border-radius: 9px; background: #edf9f0;
      color: #2d7440; font-size: 13px; line-height: 1.5;
    }
  `;
  document.head.appendChild(style);
}

function openSignup() {
  if (document.querySelector('.carbonai-signup-enhancer-overlay')) return;
  addStyles();

  const overlay = document.createElement('div');
  overlay.className = 'carbonai-signup-enhancer-overlay';
  overlay.innerHTML = `
    <div class="carbonai-signup-enhancer-modal" role="dialog" aria-modal="true" aria-labelledby="carbonai-signup-title">
      <button type="button" class="carbonai-signup-enhancer-close" aria-label="Close">×</button>
      <div class="carbonai-signup-enhancer-badge">✦ JOIN CARBONAI</div>
      <h2 id="carbonai-signup-title">Create your<br><span>carbon account.</span></h2>
      <p class="carbonai-signup-enhancer-description">Create an account to start measuring and tracking your carbon footprint.</p>
      <form class="carbonai-signup-enhancer-form">
        <label for="carbonai-signup-email">Email address</label>
        <input id="carbonai-signup-email" type="email" autocomplete="email" placeholder="you@company.com" required>
        <label for="carbonai-signup-password">Password</label>
        <input id="carbonai-signup-password" type="password" autocomplete="new-password" placeholder="At least 6 characters" minlength="6" required>
        <div class="carbonai-signup-enhancer-message" aria-live="polite"></div>
        <button class="carbonai-signup-enhancer-submit" type="submit">Create account →</button>
      </form>
    </div>
  `;

  document.body.appendChild(overlay);
  const modal = overlay.querySelector('.carbonai-signup-enhancer-modal');
  const close = () => overlay.remove();
  overlay.querySelector('.carbonai-signup-enhancer-close').addEventListener('click', close);
  overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });

  overlay.querySelector('form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = overlay.querySelector('#carbonai-signup-email').value.trim();
    const password = overlay.querySelector('#carbonai-signup-password').value;
    const button = overlay.querySelector('.carbonai-signup-enhancer-submit');
    const message = overlay.querySelector('.carbonai-signup-enhancer-message');

    if (password.length < 6) {
      message.className = 'carbonai-signup-enhancer-message carbonai-signup-enhancer-error';
      message.textContent = 'Password must be at least 6 characters.';
      return;
    }

    button.disabled = true;
    button.textContent = 'Creating account...';
    message.className = 'carbonai-signup-enhancer-message';
    message.textContent = '';

    try {
      const response = await fetch(`${API_BASE_URL}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.detail || data?.message || 'Unable to create account. Please try again.');
      }

      if (data?.session?.access_token) {
        localStorage.setItem('access_token', data.session.access_token);
        if (data?.user) localStorage.setItem('user', JSON.stringify(data.user));
        message.className = 'carbonai-signup-enhancer-message carbonai-signup-enhancer-success';
        message.textContent = 'Account created! Loading your CarbonAI dashboard...';
        setTimeout(() => window.location.reload(), 700);
      } else {
        message.className = 'carbonai-signup-enhancer-message carbonai-signup-enhancer-success';
        message.textContent = 'Account created. Please check your email to verify your account, then sign in.';
        button.disabled = false;
        button.textContent = 'Account created';
      }
    } catch (error) {
      message.className = 'carbonai-signup-enhancer-message carbonai-signup-enhancer-error';
      message.textContent = error?.message || 'Unable to create account. Please try again.';
      button.disabled = false;
      button.textContent = 'Create account →';
    }
  });
}

function attachSignupHandler() {
  const candidates = document.querySelectorAll('.signup-text span');
  candidates.forEach((element) => {
    if (element.dataset.signupEnhancerAttached === 'true') return;
    if (element.textContent.trim().toLowerCase() !== 'create one') return;
    element.dataset.signupEnhancerAttached = 'true';
    element.style.cursor = 'pointer';
    element.style.textDecoration = 'underline';
    element.addEventListener('click', openSignup);
  });
}

const observer = new MutationObserver(attachSignupHandler);
observer.observe(document.documentElement, { childList: true, subtree: true });
attachSignupHandler();
