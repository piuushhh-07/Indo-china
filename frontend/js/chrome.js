// Loads the shared header/footer partials, wires the mobile nav toggle, marks the
// current page's nav link, and reflects login state. Runs on every page via a
// single <script src="/js/chrome.js" defer></script> include.
async function loadChrome() {
  const headerMount = document.getElementById('site-header');
  const footerMount = document.getElementById('site-footer');

  if (headerMount) {
    const html = await fetch('/partials/header.html').then((r) => r.text());
    headerMount.outerHTML = html;
    const toggle = document.getElementById('navToggle');
    const links = document.getElementById('navLinks');
    if (toggle && links) {
      toggle.addEventListener('click', () => {
        const open = links.classList.toggle('open');
        toggle.setAttribute('aria-expanded', String(open));
      });
    }
    const page = document.body.dataset.page;
    if (page) {
      const current = document.querySelector(`[data-nav="${page}"]`);
      if (current) current.setAttribute('aria-current', 'page');
    }
    updateCartBadge();

    try {
      const { user } = await api.get('/auth/me');
      const accountLink = document.getElementById('navAccountLink');
      if (user && accountLink) {
        accountLink.style.display = 'inline-flex';
        accountLink.textContent = user.name.split(' ')[0];
      }
    } catch { /* not logged in — fine, guest browsing is supported */ }
  }

  if (footerMount) {
    const html = await fetch('/partials/footer.html').then((r) => r.text());
    footerMount.outerHTML = html;
    const yearEl = document.getElementById('footerYear');
    if (yearEl) yearEl.textContent = new Date().getFullYear();
    try {
      const { settings } = await api.get('/settings');
      const visitList = document.getElementById('footerVisit');
      if (visitList && settings) {
        visitList.innerHTML = `
          <li class="text-muted">${settings.address_line || 'Address not yet configured'}</li>
          ${settings.phone ? `<li><a href="tel:${settings.phone}">${settings.phone}</a></li>` : '<li class="text-muted">Phone number coming soon</li>'}
          ${settings.google_maps_url ? `<li><a href="${settings.google_maps_url}" target="_blank" rel="noopener">Get Directions</a></li>` : ''}
        `;
      }
    } catch { /* settings endpoint unreachable — footer still shows the static address */ }
  }
}

document.addEventListener('DOMContentLoaded', loadChrome);
