document.addEventListener('DOMContentLoaded', function () {
  var cfg = window.SAMELCO_SUPABASE || {};
  var reportPollTimer = null;
  var onWayToastTimer = null;

  function getStoredName() {
    var session = null;
    try {
      session = JSON.parse(localStorage.getItem('customerSession') || 'null');
    } catch (e) {
      session = null;
    }
    return localStorage.getItem('userName') || (session && session.full_name) || localStorage.getItem('signupName') || '';
  }

  function normalizeStatus(raw) {
    var status = String(raw || 'pending').toLowerCase();
    if (status !== 'resolved' && status !== 'ontheway') return 'pending';
    return status;
  }

  function formatStatus(status) {
    if (status === 'ontheway') return 'On the Way';
    if (status === 'resolved') return 'Resolved';
    return 'Pending';
  }

  function formatTimestamp(value) {
    if (!value) return 'Just now';
    var parsed = new Date(value);
    if (isNaN(parsed.getTime())) return 'Just now';
    return parsed.toLocaleString();
  }

  function setText(id, value) {
    var el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function readLatestUserReport() {
    try {
      return JSON.parse(localStorage.getItem('latestUserReport') || 'null');
    } catch (e) {
      return null;
    }
  }

  function writeLatestUserReport(data) {
    try {
      localStorage.setItem('latestUserReport', JSON.stringify(data));
    } catch (e) {}
  }

  function showOnTheWayToast(message) {
    var toastEl = document.getElementById('user-onway-toast');
    var messageEl = document.getElementById('user-onway-toast-message');
    if (!toastEl || !messageEl) return;
    messageEl.textContent = message;
    toastEl.hidden = false;
    if (onWayToastTimer) window.clearTimeout(onWayToastTimer);
    onWayToastTimer = window.setTimeout(function () {
      toastEl.hidden = true;
    }, 9000);
  }

  function hideOnTheWayToast() {
    var toastEl = document.getElementById('user-onway-toast');
    if (!toastEl) return;
    toastEl.hidden = true;
    if (onWayToastTimer) {
      window.clearTimeout(onWayToastTimer);
      onWayToastTimer = null;
    }
  }

  function buildAlertKey(data) {
    if (!data) return '';
    var idPart = data.reportId || data.queueNumber || data.createdAt || 'latest';
    return [String(idPart), normalizeStatus(data.status), String(data.assignedTeam || '').trim()].join('|');
  }

  function maybeShowOnTheWayPopup(data, previousData) {
    var normalizedStatus = normalizeStatus(data && data.status);
    var assignedTeam = String(data && data.assignedTeam || '').trim();
    if (normalizedStatus !== 'ontheway' || !assignedTeam) return;

    var currentKey = buildAlertKey(data);
    var previousKey = buildAlertKey(previousData);
    if (currentKey && currentKey === previousKey) return;

    var shownKey = localStorage.getItem('latestUserOnTheWayAlertKey') || '';
    if (shownKey === currentKey) return;

    localStorage.setItem('latestUserOnTheWayAlertKey', currentKey);
    showOnTheWayToast(assignedTeam + ' is on the way to your location.');
  }

  function showExistingOnTheWayPopupIfNeeded() {
    var currentData = readLatestUserReport();
    if (!currentData) return;
    maybeShowOnTheWayPopup(currentData, null);
  }

  function buildTrackedReportUrl(data) {
    if (!cfg.url || !cfg.anonKey || !cfg.reportsTable || !data) return '';
    var selectCols = [
      'id',
      'queue_number',
      'issue_type',
      'location_text',
      'municipality',
      'barangay',
      'status',
      'assigned_team',
      'created_at',
      'is_urgent'
    ].join(',');
    if (data.reportId) {
      return cfg.url + '/rest/v1/' + cfg.reportsTable +
        '?select=' + encodeURIComponent(selectCols) +
        '&id=eq.' + encodeURIComponent(data.reportId) +
        '&limit=1';
    }
    if (data.queueNumber) {
      return cfg.url + '/rest/v1/' + cfg.reportsTable +
        '?select=' + encodeURIComponent(selectCols) +
        '&queue_number=eq.' + encodeURIComponent(data.queueNumber) +
        '&limit=1';
    }
    return '';
  }

  function mergeLatestReportSummary(previousData, row) {
    if (!row) return previousData;
    var merged = Object.assign({}, previousData || {});
    merged.reportId = row.id || merged.reportId || '';
    merged.queueNumber = row.queue_number || merged.queueNumber || '';
    merged.issueType = row.issue_type || merged.issueType || '';
    merged.locationText = row.location_text || merged.locationText || '';
    merged.municipality = row.municipality || merged.municipality || '';
    merged.barangay = row.barangay || merged.barangay || '';
    merged.status = row.status || merged.status || 'pending';
    merged.assignedTeam = row.assigned_team || merged.assignedTeam || '';
    merged.createdAt = row.created_at || merged.createdAt || '';
    if (typeof row.is_urgent !== 'undefined') merged.isUrgent = !!row.is_urgent;
    return merged;
  }

  function isSameLatestReport(a, b) {
    return JSON.stringify(a || null) === JSON.stringify(b || null);
  }

  async function refreshTrackedReportStatus() {
    var currentData = readLatestUserReport();
    if (!currentData) return;
    var url = buildTrackedReportUrl(currentData);
    if (!url) return;
    try {
      var res = await fetch(url, {
        headers: {
          apikey: cfg.anonKey,
          Authorization: 'Bearer ' + cfg.anonKey
        }
      });
      if (!res.ok) return;
      var rows = await res.json();
      var row = Array.isArray(rows) && rows.length ? rows[0] : null;
      if (!row) return;
      var nextData = mergeLatestReportSummary(currentData, row);
      if (isSameLatestReport(currentData, nextData)) return;
      writeLatestUserReport(nextData);
      renderLatestReport(nextData);
      maybeShowOnTheWayPopup(nextData, currentData);
    } catch (e) {}
  }

  function ensureTrackedReportPolling() {
    if (!cfg.url || !cfg.anonKey || !cfg.reportsTable) return;
    if (reportPollTimer) window.clearInterval(reportPollTimer);
    reportPollTimer = window.setInterval(refreshTrackedReportStatus, 15000);
  }

  function renderLatestReport(explicitData) {
    var data = explicitData;
    if (!data) {
      data = readLatestUserReport();
    }

    var emptyEl = document.getElementById('latest-report-empty');
    var cardEl = document.getElementById('latest-report-card');
    var statusEl = document.getElementById('latest-report-status');

    if (!data) {
      if (emptyEl) emptyEl.hidden = false;
      if (cardEl) cardEl.hidden = true;
      if (statusEl) {
        statusEl.textContent = 'Pending';
        statusEl.className = 'user-status-pill is-pending';
      }
      return;
    }

    var normalizedStatus = normalizeStatus(data.status);
    if (emptyEl) emptyEl.hidden = true;
    if (cardEl) cardEl.hidden = false;
    if (statusEl) {
      statusEl.textContent = formatStatus(normalizedStatus);
      statusEl.className = 'user-status-pill is-' + normalizedStatus;
    }

    setText('latest-report-queue', data.queueNumber ? ('#' + data.queueNumber) : 'Processing');
    setText('latest-report-issue', data.issueType || 'Not specified');
    setText('latest-report-location', data.locationText || [data.barangay, data.municipality].filter(Boolean).join(', ') || 'No location saved');
    setText('latest-report-time', formatTimestamp(data.createdAt));
    setText('latest-report-team', String(data.assignedTeam || '').trim() || 'Not assigned yet');
  }

  var displayName = getStoredName() || 'Guest';
  setText('user-dashboard-name', displayName);

  var reportNameEl = document.getElementById('report-name');
  if (reportNameEl && !reportNameEl.value && displayName !== 'Guest') {
    reportNameEl.value = displayName;
  }

  var logoutBtn = document.getElementById('user-dashboard-logout');
  var onWayToastCloseBtn = document.getElementById('user-onway-toast-close');
  if (logoutBtn) {
    logoutBtn.hidden = !localStorage.getItem('userName');
    logoutBtn.addEventListener('click', function () {
      localStorage.removeItem('userName');
      localStorage.removeItem('userRole');
      localStorage.removeItem('customerSession');
      localStorage.removeItem('teamSession');
      localStorage.removeItem('personnelSession');
      window.location.href = 'index.html';
    });
  }
  if (onWayToastCloseBtn) {
    onWayToastCloseBtn.addEventListener('click', function () {
      hideOnTheWayToast();
    });
  }

  window.addEventListener('storage', function (event) {
    if (event.key === 'latestUserReport') {
      var previousData = null;
      var nextData = null;
      try { previousData = event.oldValue ? JSON.parse(event.oldValue) : null; } catch (e) { previousData = null; }
      try { nextData = event.newValue ? JSON.parse(event.newValue) : null; } catch (e) { nextData = null; }
      renderLatestReport(nextData);
      maybeShowOnTheWayPopup(nextData, previousData);
    }
  });

  window.addEventListener('samelco:report-submitted', function (event) {
    var previousData = readLatestUserReport();
    renderLatestReport(event.detail || null);
    maybeShowOnTheWayPopup(event.detail || null, previousData);
    refreshTrackedReportStatus();
    if (reportNameEl && !reportNameEl.value && displayName !== 'Guest') {
      reportNameEl.value = displayName;
    }
  });

  // Mobile Menu Logic
  var navBurger = document.getElementById('nav-burger');
  var navLinks = document.querySelector('.nav-links');
  if (navBurger && navLinks) {
    navBurger.addEventListener('click', function() {
      navLinks.classList.toggle('is-active');
      navBurger.classList.toggle('is-active');
    });
  }

  renderLatestReport();
  showExistingOnTheWayPopupIfNeeded();
  refreshTrackedReportStatus();
  ensureTrackedReportPolling();
});
