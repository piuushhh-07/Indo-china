function formatInr(paise) {
  return `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const STATUS_LABELS = { placed: 'Placed', confirmed: 'Confirmed', preparing: 'Preparing', ready: 'Ready', out_for_delivery: 'Out for delivery', delivered: 'Delivered', completed: 'Completed', cancelled: 'Cancelled' };
const NEXT_STATUS = { placed: ['confirmed', 'cancelled'], confirmed: ['preparing', 'cancelled'], preparing: ['ready', 'out_for_delivery', 'cancelled'], ready: ['completed', 'cancelled'], out_for_delivery: ['delivered', 'cancelled'], delivered: ['completed'], completed: [], cancelled: [] };
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

// ---------- Auth gate ----------
async function checkSession() {
  try {
    const { user } = await api.get('/auth/me');
    if (user && (user.role === 'admin' || user.role === 'staff')) {
      document.getElementById('loginGate').style.display = 'none';
      document.getElementById('adminShell').style.display = 'grid';
      initDashboard(user.role === 'admin');
      return;
    }
  } catch { /* fall through to login gate */ }
  document.getElementById('loginGate').style.display = 'block';
  document.getElementById('adminShell').style.display = 'none';
}

document.getElementById('gateLoginBtn').addEventListener('click', async () => {
  const errorEl = document.getElementById('gateError');
  errorEl.style.display = 'none';
  try {
    const { user } = await api.post('/auth/login', {
      mobile: document.getElementById('gateMobile').value.trim(),
      password: document.getElementById('gatePassword').value
    });
    if (user.role !== 'admin' && user.role !== 'staff') {
      throw new Error('This account does not have admin or staff access.');
    }
    checkSession();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.style.display = 'block';
  }
});

document.getElementById('adminLogout').addEventListener('click', async () => {
  await api.post('/auth/logout');
  location.reload();
});

// ---------- Tabs ----------
function initTabs() {
  document.querySelectorAll('.admin-nav button').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.admin-nav button').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    });
  });
}

// ---------- Overview ----------
async function loadOverview() {
  const d = await api.get('/admin/overview');
  document.getElementById('statCards').innerHTML = `
    <div class="panel stat-card"><div class="value">${d.todayOrders}</div><div class="text-muted">Orders today</div></div>
    <div class="panel stat-card"><div class="value">${d.pendingOrders}</div><div class="text-muted">Pending orders</div></div>
    <div class="panel stat-card"><div class="value">${formatInr(d.revenueTodayPaise)}</div><div class="text-muted">Revenue today (paid)</div></div>
    <div class="panel stat-card"><div class="value">${d.pendingReservations}</div><div class="text-muted">Pending reservations</div></div>
  `;
  document.getElementById('popularBody').innerHTML = d.popularDishes.map((p) => `<tr><td>${p.name}</td><td>${p.popularity_score}</td></tr>`).join('') || '<tr><td colspan="2" class="text-muted">No data yet — popularity_score updates as orders come in.</td></tr>';
}

// ---------- Menu ----------
let menuCache = [];
async function loadMenuTab() {
  const { categories } = await api.get('/menu/categories');
  const catSelect = document.getElementById('menuCategoryFilter');
  catSelect.innerHTML = '<option value="">All categories</option>' + categories.map((c) => `<option value="${c.slug}">${c.name}</option>`).join('');

  const { items } = await api.get('/admin/menu/items');
  menuCache = items;
  renderMenuTable();
}

function renderMenuTable() {
  const search = document.getElementById('menuSearch').value.toLowerCase();
  const catFilter = document.getElementById('menuCategoryFilter').value;
  const flaggedOnly = document.getElementById('menuFlaggedOnly').checked;

  let rows = menuCache;
  if (search) rows = rows.filter((i) => i.name.toLowerCase().includes(search));
  if (catFilter) rows = rows.filter((i) => i.category_slug === catFilter);
  if (flaggedOnly) rows = rows.filter((i) => i.needs_review);

  document.getElementById('menuBody').innerHTML = rows.map((item) => `
    <tr>
      <td>${item.name}${item.needs_review ? `<div style="font-size:0.75rem;color:var(--gold-400);">⚠ ${item.needs_review}</div>` : ''}</td>
      <td>${item.category_name}</td>
      <td>${item.variants.map((v) => `${escapeHtml(v.name)}: ${formatInr(v.price_paise)}`).join(', ') || '<span class="text-muted">none</span>'}</td>
      <td>${item.variants.map((v) => `<div style="display:flex;gap:4px;align-items:center;margin-bottom:4px;">
        <label style="font-size:0.75rem;">${escapeHtml(v.name)} <input type="number" min="0" step="1" placeholder="Unlimited" value="${v.stock_quantity === null ? '' : v.stock_quantity}" data-stock-input="${v.id}" style="width:78px;padding:4px;"></label>
        <button class="btn btn-ghost btn-sm" data-save-stock="${v.id}">Save</button></div>`).join('') || '<span class="text-muted">—</span>'}</td>
      <td>${item.is_available ? '<span class="badge badge-veg">Available</span>' : '<span class="badge badge-nonveg">Unavailable</span>'}</td>
      <td><button class="btn btn-ghost btn-sm" data-toggle-item="${item.id}" data-current="${item.is_available}">${item.is_available ? 'Mark Unavailable' : 'Mark Available'}</button></td>
    </tr>
  `).join('') || '<tr><td colspan="6" class="text-muted">No dishes match.</td></tr>';

  document.querySelectorAll('[data-toggle-item]').forEach((btn) => btn.addEventListener('click', async () => {
    const id = btn.dataset.toggleItem;
    const current = btn.dataset.current === 'true';
    await api.patch(`/admin/menu/items/${id}`, { isAvailable: !current });
    await loadMenuTab();
  }));
  document.querySelectorAll('[data-save-stock]').forEach((btn) => btn.addEventListener('click', async () => {
    const input = document.querySelector(`[data-stock-input="${btn.dataset.saveStock}"]`);
    await api.patch(`/admin/menu/variants/${btn.dataset.saveStock}/inventory`, {
      stockQuantity: input.value === '' ? null : Number(input.value)
    });
    await loadMenuTab();
  }));
}

// ---------- Reviews ----------
async function loadReviewsTab() {
  const { reviews } = await api.get('/admin/reviews');
  document.getElementById('reviewsBody').innerHTML = reviews.map((review) => `
    <tr>
      <td>${escapeHtml(review.item_name)}<div class="text-muted" style="font-size:0.78rem;">${escapeHtml(review.order_number)}</div></td>
      <td>${escapeHtml(review.customer_name)}</td>
      <td>${review.rating} / 5</td>
      <td style="white-space:pre-wrap;">${escapeHtml(review.review_text)}</td>
      <td>${new Date(review.created_at).toLocaleDateString('en-IN')}</td>
      <td><button class="btn btn-ghost btn-sm" data-review-status="${review.id}" data-status="approved">Approve</button>
          <button class="btn btn-ghost btn-sm" data-review-status="${review.id}" data-status="rejected">Reject</button></td>
    </tr>
  `).join('') || '<tr><td colspan="6" class="text-muted">No reviews awaiting approval.</td></tr>';
  document.querySelectorAll('[data-review-status]').forEach((btn) => btn.addEventListener('click', async () => {
    await api.patch(`/admin/reviews/${btn.dataset.reviewStatus}/status`, { status: btn.dataset.status });
    await loadReviewsTab();
  }));
}

// ---------- Orders ----------
async function loadOrdersTab() {
  const status = document.getElementById('orderStatusFilter').value;
  const search = document.getElementById('orderSearch').value.trim();
  const qs = new URLSearchParams();
  if (status) qs.set('status', status);
  if (search) qs.set('search', search);
  const { orders } = await api.get(`/admin/orders?${qs.toString()}`);

  document.getElementById('ordersBody').innerHTML = orders.map((o) => `
    <tr>
      <td>${o.order_number}</td>
      <td>${o.guest_name || 'Account holder'}<div class="text-muted" style="font-size:0.78rem;">${o.guest_mobile || ''}</div></td>
      <td><span class="status-pill status-${o.status}">${STATUS_LABELS[o.status] || o.status}</span></td>
      <td>${formatInr(o.total_paise)}</td>
      <td>${o.payment_method.toUpperCase()} · ${o.payment_status}</td>
      <td>${new Date(o.created_at).toLocaleString('en-IN')}</td>
      <td>
        ${(NEXT_STATUS[o.status] || []).map((s) => `<button class="btn btn-ghost btn-sm" data-order-status="${o.id}" data-status="${s}">${STATUS_LABELS[s]}</button>`).join(' ')}
      </td>
    </tr>
  `).join('') || '<tr><td colspan="7" class="text-muted">No orders match.</td></tr>';

  document.querySelectorAll('[data-order-status]').forEach((btn) => btn.addEventListener('click', async () => {
    await api.patch(`/admin/orders/${btn.dataset.orderStatus}/status`, { status: btn.dataset.status });
    await loadOrdersTab();
    await loadOverview();
  }));
}

// ---------- Reservations ----------
async function loadReservationsTab() {
  const date = document.getElementById('resDateFilter').value;
  const status = document.getElementById('resStatusFilter').value;
  const qs = new URLSearchParams();
  if (date) qs.set('date', date);
  if (status) qs.set('status', status);
  const { reservations } = await api.get(`/admin/reservations?${qs.toString()}`);

  document.getElementById('reservationsBody').innerHTML = reservations.map((r) => `
    <tr>
      <td>${r.reservation_code}</td>
      <td>${r.name}<div class="text-muted" style="font-size:0.78rem;">${r.mobile}</div></td>
      <td>${r.booking_date} ${r.booking_time}</td>
      <td>${r.guest_count}</td>
      <td><span class="status-pill status-${r.status === 'confirmed' ? 'delivered' : r.status === 'rejected' || r.status === 'cancelled' ? 'cancelled' : 'placed'}">${r.status}</span></td>
      <td>
        ${r.status === 'pending' ? `<button class="btn btn-ghost btn-sm" data-res-status="${r.id}" data-status="confirmed">Confirm</button><button class="btn btn-ghost btn-sm" data-res-status="${r.id}" data-status="rejected">Reject</button>` : ''}
        ${r.status === 'confirmed' ? `<button class="btn btn-ghost btn-sm" data-res-status="${r.id}" data-status="completed">Mark Completed</button>` : ''}
      </td>
    </tr>
  `).join('') || '<tr><td colspan="6" class="text-muted">No reservations match.</td></tr>';

  document.querySelectorAll('[data-res-status]').forEach((btn) => btn.addEventListener('click', async () => {
    await api.patch(`/admin/reservations/${btn.dataset.resStatus}/status`, { status: btn.dataset.status });
    await loadReservationsTab();
    await loadOverview();
  }));
}

// ---------- Settings ----------
async function loadSettingsTab() {
  const { settings } = await api.get('/admin/settings');
  document.getElementById('setPhone').value = settings.phone || '';
  document.getElementById('setAddress').value = settings.address_line || '';
  document.getElementById('setMapsUrl').value = settings.google_maps_url || '';
  document.getElementById('setTax').value = settings.tax_percent;
  document.getElementById('setDeliveryFee').value = (settings.default_delivery_fee_paise / 100).toFixed(0);
  document.getElementById('setMinOrder').value = (settings.default_min_order_paise / 100).toFixed(0);
  document.getElementById('setCapacity').value = settings.reservation_seating_capacity;
  document.getElementById('setCod').checked = settings.cod_enabled;
  document.getElementById('setRazorpay').checked = settings.razorpay_enabled;
  document.getElementById('setMaintenance').checked = settings.maintenance_mode;
}

document.getElementById('settingsForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  await api.patch('/admin/settings', {
    phone: document.getElementById('setPhone').value.trim() || null,
    address_line: document.getElementById('setAddress').value.trim(),
    google_maps_url: document.getElementById('setMapsUrl').value.trim(),
    tax_percent: parseFloat(document.getElementById('setTax').value),
    default_delivery_fee_paise: Math.round(parseFloat(document.getElementById('setDeliveryFee').value || 0) * 100),
    default_min_order_paise: Math.round(parseFloat(document.getElementById('setMinOrder').value || 0) * 100),
    reservation_seating_capacity: parseInt(document.getElementById('setCapacity').value, 10),
    cod_enabled: document.getElementById('setCod').checked,
    razorpay_enabled: document.getElementById('setRazorpay').checked,
    maintenance_mode: document.getElementById('setMaintenance').checked
  });
  const savedEl = document.getElementById('settingsSaved');
  savedEl.style.display = 'block';
  setTimeout(() => { savedEl.style.display = 'none'; }, 2000);
});

// ---------- Init ----------
function initDashboard(isAdmin) {
  initTabs();
  document.querySelector('[data-tab="reviews"]').closest('li').hidden = !isAdmin;
  loadOverview();
  loadMenuTab();
  if (isAdmin) loadReviewsTab();
  loadOrdersTab();
  loadReservationsTab();
  loadSettingsTab();

  document.getElementById('menuSearch').addEventListener('input', renderMenuTable);
  document.getElementById('menuCategoryFilter').addEventListener('change', renderMenuTable);
  document.getElementById('menuFlaggedOnly').addEventListener('change', renderMenuTable);
  document.getElementById('orderStatusFilter').addEventListener('change', loadOrdersTab);
  document.getElementById('orderSearch').addEventListener('change', loadOrdersTab);
  document.getElementById('resDateFilter').addEventListener('change', loadReservationsTab);
  document.getElementById('resStatusFilter').addEventListener('change', loadReservationsTab);
}

document.addEventListener('DOMContentLoaded', checkSession);
