/* Quỹ Minh Bạch Tài Chính · Topic 4 dashboard front-end
 *
 * Plain ES2020, no build step. The fund's problem statement asks for
 * "Excel-compatible first" and a system they can actually run, so the whole
 * front end is three static files served by the Python process next to it.
 *
 * Two principles this file is held to:
 *
 *   1. Never present an inferred number as a confirmed one. Every per-NE
 *      amount is computed by splitting a transaction, not published by the
 *      fund, so it carries an "suy ra" tag and the drawer repeats the warning.
 *   2. Never imply completeness. If a result set is capped, say so; if a
 *      lookup found nothing in the registry, say that rather than showing an
 *      empty box that reads as "zero".
 */

const API = {
  summary: '/api/summary',
  transactions: '/api/transactions',
  allocation: '/api/allocation',
  ne: '/api/ne',
  exceptions: '/api/exceptions',
  approvals: '/api/approvals',
  audit: '/api/audit',
  metadata: '/api/metadata',
};

const $ = (id) => document.getElementById(id);

/* ------------------------------------------------------------------ utils */

const nf = new Intl.NumberFormat('vi-VN');

function dong(value) {
  if (value === null || value === undefined) return '—';
  return nf.format(value) + ' đ';
}

/** Compact form for KPI tiles, where space is tight on a 360 px screen. */
function dongShort(value) {
  if (value === null || value === undefined) return '—';
  const abs = Math.abs(value);
  if (abs >= 1e12) return (value / 1e12).toFixed(2) + ' nghìn tỷ';
  if (abs >= 1e9) return (value / 1e9).toFixed(1) + ' tỷ';
  if (abs >= 1e6) return (value / 1e6).toFixed(1) + ' triệu';
  return nf.format(value) + ' đ';
}

function count(value) {
  if (value === null || value === undefined) return '—';
  return nf.format(value);
}

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function getJSON(url) {
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = await response.json();
      detail = body.error || body.detail || detail;
    } catch { /* response was not JSON */ }
    throw new Error(`${response.status} ${detail}`);
  }
  return response.json();
}

function setPill(el, text, kind) {
  el.textContent = text;
  el.className = 'pill' + (kind ? ' ' + kind : '');
}

/* -------------------------------------------------------------- rendering */

function renderSummary(data) {
  const tx = data.transactions || {};
  const inbound = tx.inbound || {};
  const outbound = tx.outbound || {};

  $('kpi-inbound').textContent = dongShort(inbound.total);
  $('kpi-inbound-sub').textContent = `${count(inbound.count)} giao dịch`;
  $('kpi-outbound').textContent = dongShort(outbound.total);
  $('kpi-outbound-sub').textContent = `${count(outbound.count)} giao dịch`;

  $('kpi-codes').textContent = count(data.distinct_ne_codes);
  $('kpi-codes-sub').textContent = `${count(data.allocations)} dòng phân bổ`;

  $('kpi-review').textContent = count(data.needing_review);
  $('kpi-review-sub').textContent = `${count(data.open_exceptions)} ngoại lệ đang mở`;

  $('kpis').setAttribute('aria-busy', 'false');
  renderIntegrity(data.integrity);
  renderCoverage(data.coverage);
}

function renderIntegrity(integrity) {
  if (!integrity) return;
  const balanced = integrity.balanced;
  setPill(
    $('integrity-pill'),
    balanced ? 'CÂN KHỚP' : 'LỆCH',
    balanced ? 'pill-ok' : 'pill-bad'
  );
  $('integrity-note').textContent = balanced
    ? 'Tổng các dòng phân bổ bằng đúng tổng các giao dịch được liên kết. Đây là '
      + 'bất biến mà kiểm toán cần; nếu vế phải lệch, tiền đã bị gán sai chỗ.'
    : 'Có chênh lệch giữa các phần và tổng. Cần dừng và rà soát trước khi dùng '
      + 'số liệu này để báo cáo.';

  const rows = [
    ['Tổng các dòng phân bổ', integrity.allocations_sum],
    ['Tổng giao dịch được liên kết', integrity.linked_transactions_sum],
  ];
  $('integrity-body').innerHTML = rows
    .map(([label, value]) =>
      `<tr><td>${escapeHtml(label)}</td><td class="num">${dong(value)}</td></tr>`)
    .join('')
    + `<tr><td><strong>Chênh lệch</strong></td><td class="num"><strong>${
        dong(integrity.allocations_sum - integrity.linked_transactions_sum)
      }</strong></td></tr>`;
}

function renderCoverage(coverage) {
  if (!coverage) return;
  const percent = coverage.allocated_percent ?? 0;
  $('coverage-fill').style.width = Math.min(100, percent) + '%';
  setPill(
    $('coverage-pill'),
    percent.toFixed(2) + '%',
    percent >= 90 ? 'pill-ok' : 'pill-warn'
  );
  $('coverage-note').innerHTML =
    `${dong(coverage.inbound_allocated)} trong ${dong(coverage.inbound_total)} tiền vào `
    + 'gắn được ít nhất một mã NE. '
    + `<strong>${dong(coverage.inbound_unallocated)}</strong> chưa gắn được mã. `
    + 'Theo quy định của Quỹ, khoản không gắn được mã không hoàn lại và chuyển vào '
    + 'quỹ vô danh — nên phần này cần được hạch toán riêng, và đó là lý do nó hiện '
    + 'trên hàng đợi ngoại lệ thay vì bị ẩn đi.';
}

function statusTag(status) {
  const map = {
    matched: ['tag-ok', 'khớp mã'],
    parsed: ['tag', 'đã tách'],
    needs_review: ['tag-inferred', 'cần rà soát'],
    unclassified: ['tag-inferred', 'chưa phân loại'],
  };
  const [cls, label] = map[status] || ['tag', status || '—'];
  return `<span class="${cls}">${escapeHtml(label)}</span>`;
}

function renderTransactions(payload) {
  const items = payload.items || [];

  const notes = [];
  if (payload.query) notes.push(`từ khoá "${payload.query}"`);
  if (payload.truncated) {
    notes.push(
      `kết quả bị cắt ở ${payload.limit_applied} dòng, còn nữa — thu hẹp từ khoá để xem tiếp`
    );
  }
  if (!items.length) notes.push('không có giao dịch nào khớp');
  $('result-note').textContent = notes.join(' · ');

  $('results').innerHTML = items.map((item) => {
    const codes = item.distinct_ne_codes || 0;
    const tags = [
      statusTag(item.processing_status),
      `<span class="tag">${escapeHtml(item.direction === 'inbound' ? 'tiền vào' : 'tiền ra')}</span>`,
    ];
    if (codes > 0) tags.push(`<span class="tag-ne">${codes} mã NE</span>`);
    if (item.academic_year) tags.push(`<span class="tag">${escapeHtml(item.academic_year)}</span>`);

    return `<button class="row-item" type="button" data-tx="${escapeHtml(item.provider_tx_id)}">
      <div class="row-top">
        <span class="row-dir">${escapeHtml(item.tx_time || '—')}</span>
        <span class="row-amount">${dong(item.amount)}</span>
      </div>
      <div class="row-memo">${escapeHtml(item.description_masked || 'Nội dung giao dịch đã được ẩn.')}</div>
      <div class="row-tags">${tags.join('')}</div>
    </button>`;
  }).join('');
}

/* ----------------------------------------------------------------- drawer */

function openDrawer(html) {
  $('drawer-body').innerHTML = html;
  $('drawer').hidden = false;
  document.body.style.overflow = 'hidden';
  $('drawer-close').focus();
}

function closeDrawer() {
  $('drawer').hidden = true;
  $('drawer-body').innerHTML = '';
  document.body.style.overflow = '';
}

async function showTransaction(txId) {
  openDrawer('<p class="loading">Đang tải…</p>');
  try {
    const data = await getJSON(`${API.allocation}?tx=${encodeURIComponent(txId)}`);
    if (!data.transaction) {
      openDrawer(`<h3>Không tìm thấy</h3><p class="muted">${escapeHtml(txId)}</p>`);
      return;
    }
    const tx = data.transaction;
    const rows = (data.allocations || []).map((a) => {
      const where = a.school_name
        ? `${escapeHtml(a.school_code || '')} ${escapeHtml(a.school_name)}`
        : '<span class="muted">chưa nối được trường</span>';
      return `<tr>
        <td><strong>${escapeHtml(a.ne_code)}</strong>${a.meal_suffix
          ? ` <span class="tag">${escapeHtml(a.meal_suffix)}</span>` : ''}</td>
        <td>${where}</td>
        <td class="num">${dong(a.allocated_amount_computed)}</td>
      </tr>`;
    }).join('');

    openDrawer(`
      <h3>${escapeHtml(tx.provider_tx_id)}</h3>
      <p class="muted small">${escapeHtml(tx.tx_time || '—')} ·
        ${tx.direction === 'inbound' ? 'tiền vào' : 'tiền ra'} ·
        ${escapeHtml(tx.processing_status || '')}
        ${tx.academic_year ? ' · ' + escapeHtml(tx.academic_year) : ''}</p>

      <p><strong>${dong(tx.amount)}</strong></p>
      <p class="muted small" style="word-break:break-word">${escapeHtml(tx.description_masked || 'Nội dung giao dịch đã được ẩn.')}</p>

      <h4>Phân bổ theo mã NE (${(data.allocations || []).length})</h4>
      ${rows ? `<div class="table-wrap"><table class="alloc-table">
        <thead><tr><th>Mã NE</th><th>Trường</th><th class="num">Số tiền</th></tr></thead>
        <tbody>${rows}</tbody></table></div>` : '<p class="muted small">Giao dịch này không gắn mã NE nào.</p>'}

      <h4>Đối soát</h4>
      <table class="tight"><tbody>
        <tr><td>Tổng phân bổ</td><td class="num">${dong(data.allocation_sum)}</td></tr>
        <tr><td>Số tiền giao dịch</td><td class="num">${dong(tx.amount)}</td></tr>
        <tr><td><strong>Khớp</strong></td><td class="num"><strong>${
          data.balanced ? 'Có' : 'KHÔNG'
        }</strong></td></tr>
      </tbody></table>

      <p class="muted small" style="margin-top:12px">
        <span class="tag-inferred tag">suy ra</span>
        Số theo từng mã là số hệ thống chia ra từ giao dịch, không phải số Quỹ
        đã xác nhận. Quỹ chỉ công bố tổng theo kỳ.
      </p>
    `);
  } catch (error) {
    openDrawer(`<h3>Lỗi</h3><p class="muted">${escapeHtml(error.message)}</p>`);
  }
}

async function showNeLookup(code) {
  openDrawer('<p class="loading">Đang tải…</p>');
  try {
    const data = await getJSON(`${API.ne}?ne=${encodeURIComponent(code)}`);
    if (data.error) {
      openDrawer(`<h3>Thiếu mã</h3><p class="muted">${escapeHtml(data.error)}</p>`);
      return;
    }

    const rows = (data.allocations || []).map((a) => `<tr>
      <td>${escapeHtml(a.tx_time || '—')}</td>
      <td class="muted" style="word-break:break-word">${escapeHtml((a.tx_time ? '' : '') + (a.provider_tx_id || ''))}</td>
      <td class="num">${dong(a.amount)}</td>
      <td class="num">${dong(a.allocated_amount_computed)}</td>
    </tr>`).join('');

    const registry = (data.registry || []).map((r) => `<tr>
      <td>${escapeHtml(r.student_code || '—')}</td>
      <td>${escapeHtml(r.class_name || '—')}</td>
      <td>${escapeHtml(r.school_name || '—')}</td>
      <td>${escapeHtml(r.status || '—')}</td>
    </tr>`).join('');

    openDrawer(`
      <h3>${escapeHtml(data.ne_code)}</h3>
      <p class="muted small">${count(data.allocation_count)} giao dịch ·
        tổng phân bổ ${dong(data.total_allocated)}</p>

      <h4>Giao dịch có mã này</h4>
      ${rows ? `<div class="table-wrap"><table class="alloc-table">
        <thead><tr><th>Thời gian</th><th>Giao dịch</th><th class="num">Số tiền</th><th class="num">Phần của mã</th></tr></thead>
        <tbody>${rows}</tbody></table></div>` : '<p class="muted small">Chưa có giao dịch nào gắn mã này.</p>'}

      <h4>Danh mục học sinh</h4>
      ${registry
        ? `<div class="table-wrap"><table class="alloc-table">
             <thead><tr><th>Mã HS</th><th>Lớp</th><th>Trường</th><th>Trạng thái</th></tr></thead>
             <tbody>${registry}</tbody></table></div>`
        : `<p class="muted small">Chưa nối được mã này với học sinh hoặc trường.
             Hệ thống chưa có danh mục học sinh đầy đủ, nên đây là
             <strong>chưa biết</strong>, không phải <strong>không có</strong>.</p>`}

      <p class="muted small" style="margin-top:12px">
        <span class="tag-inferred tag">suy ra</span>
        Phần của mã được chia đều từ giao dịch. Nếu một giao dịch viện dẫn nhiều
        mã, số của mỗi mã là trung bình cộng.
      </p>
    `);
  } catch (error) {
    openDrawer(`<h3>Lỗi</h3><p class="muted">${escapeHtml(error.message)}</p>`);
  }
}

/* ------------------------------------------------------------- secondary */

const EXCEPTION_TITLE = {
  INBOUND_WITHOUT_CODE: 'Tiền vào không gắn được mã',
  UNCLASSIFIED_INBOUND: 'Tiền vào chưa phân loại',
  NE_CODE_NOT_IN_REGISTRY: 'Mã NE chưa có trong danh mục',
  ALLOCATION_SUM_MISMATCH: 'Tổng phân bổ lệch với giao dịch',
  DUPLICATE_NE_ON_TRANSACTION: 'Một mã NE lặp lại trong cùng giao dịch',
};

async function loadExceptions() {
  try {
    const data = await getJSON(API.exceptions);
    const items = data.items || [];
    setPill($('exc-pill'), `${items.length} nhóm`, items.length ? 'pill-warn' : 'pill-ok');
    $('exceptions').innerHTML = items.length
      ? items.map((e) => `<div class="exc sev-${escapeHtml(e.severity)}">
          <div class="exc-code">${escapeHtml(EXCEPTION_TITLE[e.exception_code] || e.exception_code)}</div>
          <div class="exc-detail">${escapeHtml(e.detail)}</div>
        </div>`).join('')
      : '<p class="muted small">Không có ngoại lệ đang mở.</p>';
  } catch (error) {
    $('exceptions').innerHTML = `<p class="muted small">Không tải được: ${escapeHtml(error.message)}</p>`;
  }
}

async function loadAudit() {
  try {
    const data = await getJSON(API.audit + '?limit=20');
    setPill(
      $('audit-pill'),
      data.chain_intact ? 'CHUỖI NGUYÊN VẸN' : 'CHUỖI ĐỨT',
      data.chain_intact ? 'pill-ok' : 'pill-bad'
    );
    const items = data.items || [];
    $('audit').innerHTML = items.length
      ? `<div class="table-wrap"><table>
          <thead><tr><th>#</th><th>Sự kiện</th><th>Người</th><th>Thời gian</th></tr></thead>
          <tbody>${items.map((e) => `<tr>
            <td>${e.id}</td>
            <td>${escapeHtml(e.event_type)}<br><span class="muted small">${escapeHtml((e.detail || '').slice(0, 110))}</span></td>
            <td>${escapeHtml(e.actor)}<br><span class="muted small">${escapeHtml(e.actor_role || '')}</span></td>
            <td>${escapeHtml(e.occurred_at || '—')}</td>
          </tr>`).join('')}</tbody></table></div>`
      : '<p class="muted small">Chưa có sự kiện.</p>';
  } catch (error) {
    $('audit').innerHTML = `<p class="muted small">Không tải được: ${escapeHtml(error.message)}</p>`;
  }
}

async function loadMetadata() {
  try {
    const data = await getJSON(API.metadata);
    const src = data.source || {};
    $('foot-source').textContent = src.source_name
      ? `Nguồn: ${src.source_name} · ${count(src.raw_transaction_rows)} dòng · `
        + `${count(src.allocation_rows)} dòng phân bổ · nhập lúc ${src.imported_at || '—'} · `
        + `schema ${src.schema_version || '—'} · sha256 ${src.source_sha256 || '—'}`
      : 'Chưa có thông tin nguồn.';
    $('foot-privacy').textContent = data.privacy || '';
    $('foot-missing').innerHTML = (data.missing || [])
      .map((m) => `<li>${escapeHtml(m)}</li>`).join('');
  } catch { /* footer detail is non-critical */ }
}

/* ------------------------------------------------------------------ boot */

function readFilters() {
  const params = new URLSearchParams();
  const q = $('q').value.trim();
  if (q) params.set('q', q);
  const direction = $('f-direction').value;
  if (direction) params.set('direction', direction);
  const status = $('f-status').value;
  if (status) params.set('status', status);
  params.set('limit', $('f-limit').value);
  return params;
}

async function runSearch(event) {
  if (event) event.preventDefault();
  $('results').innerHTML = '<p class="loading">Đang tìm…</p>';
  try {
    const payload = await getJSON(`${API.transactions}?${readFilters()}`);
    renderTransactions(payload);
  } catch (error) {
    $('results').innerHTML = `<p class="muted small">Lỗi: ${escapeHtml(error.message)}</p>`;
  }
}

/** A code typed into search should open the lineage view, not a list. */
function looksLikeCode(text) {
  return /^(NE|ACN)\s*\d+/i.test(text.trim());
}

function normaliseCode(text) {
  const compact = text.trim().toUpperCase().replace(/\s+/g, '');
  const match = compact.match(/^(NE|ACN)(\d+)([ST])?$/);
  if (!match) return compact;
  const [, prefix, digits, suffix] = match;
  if (prefix === 'NE') {
    return prefix + digits.padStart(5, '0') + (suffix || '');
  }
  return prefix + digits.padStart(5, '0');
}

function init() {
  $('search-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const value = $('q').value.trim();
    if (looksLikeCode(value)) {
      showNeLookup(normaliseCode(value));
      return;
    }
    runSearch(event);
  });

  ['f-direction', 'f-status', 'f-limit'].forEach((id) => {
    $(id).addEventListener('change', () => runSearch());
  });

  // Event delegation: results are re-rendered wholesale on every search, so
  // per-row listeners would be re-attached on every keystroke.
  $('results').addEventListener('click', (event) => {
    const button = event.target.closest('.row-item');
    if (button && button.dataset.tx) showTransaction(button.dataset.tx);
  });

  $('drawer-close').addEventListener('click', closeDrawer);
  $('drawer').addEventListener('click', (event) => {
    if (event.target === $('drawer')) closeDrawer();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !$('drawer').hidden) closeDrawer();
  });

  getJSON('/health')
    .then((data) => setPill(
      $('health'),
      data.database ? 'CSDL sẵn sàng' : 'Thiếu CSDL',
      data.database ? 'pill-live' : 'pill-bad'
    ))
    .catch(() => setPill($('health'), 'Mất kết nối', 'pill-bad'));

  getJSON(API.summary)
    .then(renderSummary)
    .catch((error) => {
      $('kpis').innerHTML = `<p class="muted small">Không tải được tổng quan: ${escapeHtml(error.message)}</p>`;
    });

  runSearch();
  loadExceptions();
  loadAudit();
  loadMetadata();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
