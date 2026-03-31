document.addEventListener('DOMContentLoaded', function () {
  var cfg = window.SAMELCO_SUPABASE || {};
  var session = null;
  var pollTimer = null;
  var loadingTasks = false;
  var toastTimer = null;
  var hasLoadedOnce = false;

  try {
    session = JSON.parse(localStorage.getItem('personnelSession') || 'null');
  } catch (e) {
    session = null;
  }

  if (!session || localStorage.getItem('userRole') !== 'personnel') {
    if (localStorage.getItem('userRole') === 'team') {
      window.location.href = 'team-dashboard.html';
    } else {
      window.location.href = 'index.html';
    }
    return;
  }

  var personnelId = Number(session.id || 0);
  var logoutBtn = document.getElementById('personnel-dashboard-logout');
  var refreshBtn = document.getElementById('personnel-dashboard-refresh');
  var emptyEl = document.getElementById('personnel-tasks-empty');
  var listEl = document.getElementById('personnel-tasks-list');
  var latestEmptyEl = document.getElementById('personnel-latest-empty');
  var latestCardEl = document.getElementById('personnel-latest-card');
  var alertsEmptyEl = document.getElementById('personnel-alerts-empty');
  var alertsListEl = document.getElementById('personnel-alerts-list');
  var toastEl = document.getElementById('personnel-assignment-toast');
  var toastMessageEl = document.getElementById('personnel-assignment-toast-message');
  var toastCloseBtn = document.getElementById('personnel-assignment-toast-close');

  setText('personnel-dashboard-name', session.full_name || 'Personnel');
  setText('personnel-summary-name', session.full_name || '-');
  setText('personnel-summary-email', session.email || '-');
  setText('personnel-summary-team', session.team_name || '-');
  setText('personnel-summary-last-login', formatTimestamp(session.last_login_at));

  if (logoutBtn) {
    logoutBtn.addEventListener('click', function () {
      localStorage.removeItem('userName');
      localStorage.removeItem('userRole');
      localStorage.removeItem('personnelSession');
      localStorage.removeItem('teamSession');
      localStorage.removeItem('customerSession');
      window.location.href = 'index.html';
    });
  }

  if (refreshBtn) {
    refreshBtn.addEventListener('click', function () {
      loadTasks(true);
    });
  }

  if (toastCloseBtn) {
    toastCloseBtn.addEventListener('click', hideToast);
  }

  function setText(id, value) {
    var el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeStatus(raw) {
    var status = String(raw || 'pending').toLowerCase();
    if (status !== 'ontheway' && status !== 'resolved') return 'pending';
    return status;
  }

  function normalizeAssignmentStatus(raw) {
    return String(raw || '').toLowerCase() === 'done' ? 'done' : 'assigned';
  }

  function formatStatus(status) {
    if (status === 'done') return 'Done';
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

  function getEffectiveTaskStatus(row) {
    if (normalizeAssignmentStatus(row && row.assignment_status) === 'done') return 'done';
    return normalizeStatus(row && row.status);
  }

  function hideToast() {
    if (toastEl) toastEl.hidden = true;
    if (toastTimer) {
      window.clearTimeout(toastTimer);
      toastTimer = null;
    }
  }

  function showToast(message) {
    if (!toastEl || !toastMessageEl) return;
    toastMessageEl.textContent = message;
    toastEl.hidden = false;
    if (toastTimer) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      toastEl.hidden = true;
    }, 9000);
  }

  function setLoadingState(text) {
    if (emptyEl) {
      emptyEl.hidden = false;
      emptyEl.textContent = text;
    }
    if (listEl) listEl.innerHTML = '';
  }

  function extractRpcErrorMessage(payload, status) {
    if (payload && typeof payload === 'object') {
      if (payload.message) return String(payload.message);
      if (payload.error) return String(payload.error);
      if (payload.hint) return String(payload.hint);
    }
    if (typeof payload === 'string' && payload.trim()) return payload.trim();
    return 'HTTP ' + status;
  }

  async function callSupabaseRpc(functionName, payload) {
    if (!cfg.url || !cfg.anonKey) {
      throw new Error('Supabase config is missing.');
    }
    var response = await fetch(cfg.url + '/rest/v1/rpc/' + functionName, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: cfg.anonKey,
        Authorization: 'Bearer ' + cfg.anonKey
      },
      body: JSON.stringify(payload)
    });
    var rawText = '';
    try { rawText = await response.text(); } catch (e) {}
    var parsed = null;
    if (rawText) {
      try { parsed = JSON.parse(rawText); } catch (e) { parsed = rawText; }
    }
    if (!response.ok) {
      throw new Error(extractRpcErrorMessage(parsed, response.status));
    }
    return parsed;
  }

  function buildPersonnelDashboardErrorMessage(err, fallback) {
    var msg = err && err.message ? String(err.message) : '';
    if (!msg) return fallback;
    if (/Supabase config is missing/i.test(msg)) {
      return 'Supabase is not configured on this page.';
    }
    if (/mark_personnel_assignment_done|report_personnel_assignments|assign_report_personnel|not find the function|404/i.test(msg)) {
      return 'Personnel SQL is missing. Run sql/migrations/20260324_add_personnel_accounts.sql in Supabase first.';
    }
    if (/Personnel assignment was not found|Report ID is required|Personnel ID is required/i.test(msg)) {
      return msg;
    }
    return fallback + ': ' + msg;
  }

  function sortRows(rows) {
    return rows.slice().sort(function (a, b) {
      if (!!a.is_urgent !== !!b.is_urgent) return a.is_urgent ? -1 : 1;
      var aTime = new Date(a.assignment_updated_at || a.updated_at || a.created_at || 0).getTime();
      var bTime = new Date(b.assignment_updated_at || b.updated_at || b.created_at || 0).getTime();
      return bTime - aTime;
    });
  }

  function updateStats(rows) {
    var counts = {
      total: rows.length,
      pending: 0,
      ontheway: 0,
      resolved: 0,
      done: 0
    };
    rows.forEach(function (row) {
      counts[getEffectiveTaskStatus(row)] += 1;
    });
    setText('personnel-stat-total', String(counts.total));
    setText('personnel-stat-pending', String(counts.pending));
    setText('personnel-stat-ontheway', String(counts.ontheway));
    setText('personnel-stat-resolved', String(counts.resolved + counts.done));
  }

  function renderLatestTask(rows) {
    var latest = Array.isArray(rows) && rows.length ? rows[0] : null;
    if (!latest) {
      if (latestEmptyEl) latestEmptyEl.hidden = false;
      if (latestCardEl) latestCardEl.hidden = true;
      return;
    }
    if (latestEmptyEl) latestEmptyEl.hidden = true;
    if (latestCardEl) latestCardEl.hidden = false;

    setText('personnel-latest-queue', latest.queue_number ? ('#' + latest.queue_number) : 'Pending');
    setText('personnel-latest-issue', latest.issue_type || 'Not specified');
    setText('personnel-latest-location', latest.location_text || [latest.barangay, latest.municipality].filter(Boolean).join(', ') || 'No location saved');
    setText('personnel-latest-status', formatStatus(getEffectiveTaskStatus(latest)));
    setText('personnel-latest-time', formatTimestamp(latest.assignment_updated_at || latest.updated_at || latest.created_at));
  }

  function renderAlerts(rows) {
    if (!alertsEmptyEl || !alertsListEl) return;
    alertsListEl.innerHTML = '';

    var activeRows = rows.filter(function (row) {
      return getEffectiveTaskStatus(row) !== 'done' && getEffectiveTaskStatus(row) !== 'resolved';
    }).slice(0, 5);

    if (!activeRows.length) {
      alertsEmptyEl.hidden = false;
      alertsEmptyEl.textContent = 'No active assignment alerts right now.';
      return;
    }

    alertsEmptyEl.hidden = true;
    activeRows.forEach(function (row) {
      var item = document.createElement('div');
      item.className = 'personnel-notification-item';
      item.innerHTML =
        '<strong>Queue #' + escapeHtml(row.queue_number || row.id) + ' - ' + escapeHtml(row.issue_type || 'Unspecified issue') + '</strong>' +
        '<span>Team: ' + escapeHtml(row.assigned_team || session.team_name || 'Not set') + '</span>' +
        '<span>My Task Status: ' + escapeHtml(formatStatus(getEffectiveTaskStatus(row))) + '</span>' +
        '<span>Updated: ' + escapeHtml(formatTimestamp(row.assignment_updated_at || row.updated_at || row.created_at)) + '</span>';
      alertsListEl.appendChild(item);
    });
  }

  async function markTaskDone(reportId, triggerButton) {
    var originalLabel = triggerButton ? triggerButton.textContent : 'Mark as Done';
    try {
      if (triggerButton) {
        triggerButton.disabled = true;
        triggerButton.textContent = 'Saving...';
      }
      await callSupabaseRpc('mark_personnel_assignment_done', {
        p_report_id: Number(reportId),
        p_personnel_id: Number(personnelId)
      });
      showToast('Task marked as done.');
      await loadTasks(false);
    } catch (err) {
      alert(buildPersonnelDashboardErrorMessage(err, 'Failed to mark task as done'));
    } finally {
      if (triggerButton) {
        triggerButton.disabled = false;
        triggerButton.textContent = originalLabel;
      }
    }
  }

  function renderTasks(rows) {
    if (!listEl) return;
    listEl.innerHTML = '';

    if (!Array.isArray(rows) || !rows.length) {
      if (emptyEl) {
        emptyEl.hidden = false;
        emptyEl.textContent = 'No tasks are assigned to you right now.';
      }
      return;
    }

    if (emptyEl) emptyEl.hidden = true;

    rows.forEach(function (row) {
      var status = getEffectiveTaskStatus(row);
      var card = document.createElement('article');
      card.className = 'personnel-task-card' + (row.is_urgent ? ' is-urgent' : '');
      card.innerHTML =
        '<div class="personnel-task-header">' +
          '<div>' +
            '<div class="personnel-task-kicker">' +
              (row.is_urgent ? 'Urgent' : 'Assigned') +
              (row.queue_number ? ' - Queue #' + escapeHtml(row.queue_number) : '') +
            '</div>' +
            '<h3 class="personnel-task-title">' + escapeHtml(row.issue_type || 'Unspecified issue') + '</h3>' +
          '</div>' +
          '<span class="personnel-task-status is-' + escapeHtml(status) + '">' + escapeHtml(formatStatus(status)) + '</span>' +
        '</div>' +
        '<div class="personnel-task-grid">' +
          '<div class="personnel-task-meta">' +
            '<span>Location</span>' +
            '<strong>' + escapeHtml(row.location_text || [row.barangay, row.municipality].filter(Boolean).join(', ') || 'No location saved') + '</strong>' +
          '</div>' +
          '<div class="personnel-task-meta">' +
            '<span>Team</span>' +
            '<strong>' + escapeHtml(row.assigned_team || session.team_name || 'Not set') + '</strong>' +
          '</div>' +
          '<div class="personnel-task-meta">' +
            '<span>My Task Status</span>' +
            '<strong>' + escapeHtml(formatStatus(status)) + '</strong>' +
          '</div>' +
          '<div class="personnel-task-meta">' +
            '<span>Updated</span>' +
            '<strong>' + escapeHtml(formatTimestamp(row.assignment_updated_at || row.updated_at || row.created_at)) + '</strong>' +
          '</div>' +
        '</div>' +
        '<p class="personnel-task-description">' + escapeHtml(row.description || 'No extra details were submitted for this task.') + '</p>';

      if (status !== 'done' && status !== 'resolved') {
        var actions = document.createElement('div');
        actions.className = 'personnel-task-actions';
        var doneBtn = document.createElement('button');
        doneBtn.type = 'button';
        doneBtn.className = 'personnel-done-btn';
        doneBtn.textContent = 'Mark as Done';
        doneBtn.addEventListener('click', function () {
          markTaskDone(row.id, doneBtn);
        });
        actions.appendChild(doneBtn);
        card.appendChild(actions);
      }

      listEl.appendChild(card);
    });
  }

  function maybeNotify(rows) {
    var storageKey = 'personnelAssignmentKeys:' + String(personnelId || session.email || 'personnel');
    var nextKeys = rows
      .filter(function (row) {
        return getEffectiveTaskStatus(row) !== 'done' && getEffectiveTaskStatus(row) !== 'resolved';
      })
      .map(function (row) {
        return [row.id, normalizeAssignmentStatus(row.assignment_status), row.assignment_updated_at || row.updated_at || row.created_at || ''].join('|');
      });

    var previousKeys = [];
    try {
      previousKeys = JSON.parse(localStorage.getItem(storageKey) || '[]');
    } catch (e) {
      previousKeys = [];
    }

    if (!hasLoadedOnce) {
      hasLoadedOnce = true;
      localStorage.setItem(storageKey, JSON.stringify(nextKeys));
      return;
    }

    var previousSet = {};
    previousKeys.forEach(function (key) { previousSet[key] = true; });
    var newKey = nextKeys.find(function (key) { return !previousSet[key]; }) || '';

    if (newKey) {
      var changed = rows.find(function (row) {
        return newKey === [row.id, normalizeAssignmentStatus(row.assignment_status), row.assignment_updated_at || row.updated_at || row.created_at || ''].join('|');
      });
      if (changed) {
        showToast('New task assigned: queue #' + (changed.queue_number || changed.id) + ' - ' + (changed.issue_type || 'Unspecified issue') + '.');
      }
    }

    localStorage.setItem(storageKey, JSON.stringify(nextKeys));
  }

  function mapAssignmentRow(assignmentRow) {
    var report = assignmentRow && assignmentRow.report && !Array.isArray(assignmentRow.report) ? assignmentRow.report : null;
    if (!report || !report.id) return null;

    return {
      id: report.id,
      queue_number: report.queue_number,
      issue_type: report.issue_type,
      location_text: report.location_text,
      municipality: report.municipality,
      barangay: report.barangay,
      status: report.status,
      assigned_team: report.assigned_team,
      assigned_personnel: report.assigned_personnel,
      created_at: report.created_at,
      updated_at: report.updated_at,
      description: report.description,
      is_urgent: report.is_urgent,
      assignment_status: assignmentRow.assignment_status,
      assignment_done_at: assignmentRow.done_at || '',
      assignment_updated_at: assignmentRow.updated_at || report.updated_at || report.created_at || ''
    };
  }

  async function loadTasks(showLoading) {
    if (loadingTasks) return;
    if (!cfg.url || !cfg.anonKey || !personnelId) {
      setLoadingState('Supabase configuration is missing for this dashboard.');
      return;
    }

    loadingTasks = true;
    if (refreshBtn) refreshBtn.disabled = true;
    if (showLoading) setLoadingState('Loading your assigned tasks...');

    try {
      var selectCols = [
        'report_id',
        'personnel_id',
        'assignment_status',
        'assigned_at',
        'done_at',
        'updated_at',
        'report:report_id(id,queue_number,issue_type,location_text,municipality,barangay,status,assigned_team,assigned_personnel,created_at,updated_at,description,is_urgent)'
      ].join(',');

      var res = await fetch(
        cfg.url + '/rest/v1/report_personnel_assignments' +
        '?select=' + encodeURIComponent(selectCols) +
        '&personnel_id=eq.' + encodeURIComponent(personnelId) +
        '&order=updated_at.desc',
        {
          headers: {
            apikey: cfg.anonKey,
            Authorization: 'Bearer ' + cfg.anonKey
          }
        }
      );

      if (!res.ok) {
        throw new Error('Failed to load assigned tasks (HTTP ' + res.status + ')');
      }

      var assignmentRows = await res.json();
      var rows = sortRows((Array.isArray(assignmentRows) ? assignmentRows : []).map(mapAssignmentRow).filter(Boolean));
      updateStats(rows);
      renderLatestTask(rows);
      renderAlerts(rows);
      renderTasks(rows);
      maybeNotify(rows);
    } catch (err) {
      setLoadingState('Unable to load your assigned tasks right now.');
    } finally {
      loadingTasks = false;
      if (refreshBtn) refreshBtn.disabled = false;
    }
  }

  function startPolling() {
    if (pollTimer) window.clearInterval(pollTimer);
    pollTimer = window.setInterval(function () {
      loadTasks(false);
    }, 15000);
  }

  loadTasks(true);
  startPolling();
});
