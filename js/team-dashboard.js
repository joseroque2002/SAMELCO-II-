document.addEventListener('DOMContentLoaded', function () {
  var cfg = window.SAMELCO_SUPABASE || {};
  var session = null;
  var dashboardPollTimer = null;
  var loadingDashboard = false;
  var allPersonnel = [];
  var hasLoadedAssignments = false;
  var assignmentToastTimer = null;

  try {
    session = JSON.parse(localStorage.getItem('teamSession') || 'null');
  } catch (e) {
    session = null;
  }

  if (!session || localStorage.getItem('userRole') !== 'team') {
    if (localStorage.getItem('userRole') === 'personnel') {
      window.location.href = 'personnel-dashboard.html';
    } else {
      window.location.href = 'index.html';
    }
    return;
  }

  var teamName = String(session.team_name || '').trim();
  var teamEmail = String(session.dashboard_email || '').trim();
  var teamId = Number(session.team_id || 0);
  var normalizedTeamName = normalizeLookup(teamName);

  var logoutBtn = document.getElementById('team-dashboard-logout');
  var refreshBtn = document.getElementById('team-dashboard-refresh');
  var addPersonnelBtn = document.getElementById('team-dashboard-add-personnel');
  var emptyEl = document.getElementById('team-missions-empty');
  var listEl = document.getElementById('team-missions-list');
  var latestEmptyEl = document.getElementById('team-latest-empty');
  var latestCardEl = document.getElementById('team-latest-card');
  var alertEmptyEl = document.getElementById('personnel-alert-empty');
  var alertListEl = document.getElementById('personnel-alert-list');
  var personnelModal = document.getElementById('team-personnel-modal');
  var personnelModalTeamLabel = document.getElementById('team-personnel-modal-team');
  var personnelNameInput = document.getElementById('team-personnel-name');
  var personnelEmailInput = document.getElementById('team-personnel-email');
  var personnelPasswordInput = document.getElementById('team-personnel-password');
  var personnelConfirmPasswordInput = document.getElementById('team-personnel-confirm-password');
  var personnelCancelBtn = document.getElementById('team-personnel-cancel');
  var personnelSaveBtn = document.getElementById('team-personnel-save');
  var assignmentToastEl = document.getElementById('personnel-task-toast');
  var assignmentToastMessageEl = document.getElementById('personnel-task-toast-message');
  var assignmentToastCloseBtn = document.getElementById('personnel-task-toast-close');

  setText('team-dashboard-name', teamName || 'Team');
  setText('team-dashboard-name-inline', teamName || 'this team');
  setText('team-dashboard-summary-name', teamName || 'Team');
  setText('team-dashboard-email', teamEmail || 'No dashboard email');
  setText('team-dashboard-last-login', formatTimestamp(session.last_login_at));
  if (personnelModalTeamLabel) {
    personnelModalTeamLabel.textContent = 'Create a personnel account for ' + (teamName || 'this team') + '.';
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', function () {
      localStorage.removeItem('userName');
      localStorage.removeItem('userRole');
      localStorage.removeItem('teamSession');
      localStorage.removeItem('personnelSession');
      window.location.href = 'index.html';
    });
  }

  // Mobile Menu Logic
  var navBurger = document.getElementById('nav-burger');
  var navLinks = document.querySelector('.nav-links');
  if (navBurger && navLinks) {
    navBurger.addEventListener('click', function() {
      navLinks.classList.toggle('is-active');
      navBurger.classList.toggle('is-active');
    });
  }

  if (refreshBtn) {
    refreshBtn.addEventListener('click', function () {
      loadDashboardData(true, true);
    });
  }

  if (addPersonnelBtn) {
    addPersonnelBtn.addEventListener('click', openPersonnelModal);
  }

  if (personnelCancelBtn) {
    personnelCancelBtn.addEventListener('click', closePersonnelModal);
  }

  if (personnelSaveBtn) {
    personnelSaveBtn.addEventListener('click', savePersonnelAccount);
  }

  if (assignmentToastCloseBtn) {
    assignmentToastCloseBtn.addEventListener('click', hideAssignmentToast);
  }

  window.addEventListener('click', function (event) {
    if (event.target === personnelModal) {
      closePersonnelModal();
    }
  });

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

  function normalizeLookup(value) {
    return String(value || '').trim().toLowerCase();
  }

  function splitAssignedTeams(value) {
    return String(value || '')
      .split(',')
      .map(function (part) { return String(part || '').trim(); })
      .filter(Boolean);
  }

  function reportBelongsToTeam(row) {
    return splitAssignedTeams(row && row.assigned_team).some(function (assigned) {
      return normalizeLookup(assigned) === normalizedTeamName;
    });
  }

  function normalizeStatus(raw) {
    var status = String(raw || 'pending').toLowerCase();
    if (status !== 'ontheway' && status !== 'resolved') return 'pending';
    return status;
  }

  function formatStatus(status) {
    if (status === 'ontheway') return 'On the Way';
    if (status === 'resolved') return 'Resolved';
    return 'Pending';
  }

  function formatAssignmentStatus(status) {
    return String(status || '').toLowerCase() === 'done' ? 'Done' : 'Assigned';
  }

  function formatTimestamp(value) {
    if (!value) return 'Just now';
    var parsed = new Date(value);
    if (isNaN(parsed.getTime())) return 'Just now';
    return parsed.toLocaleString();
  }

  function resetPersonnelForm() {
    if (personnelNameInput) personnelNameInput.value = '';
    if (personnelEmailInput) personnelEmailInput.value = '';
    if (personnelPasswordInput) personnelPasswordInput.value = '';
    if (personnelConfirmPasswordInput) personnelConfirmPasswordInput.value = '';
  }

  function openPersonnelModal() {
    resetPersonnelForm();
    if (personnelModal) personnelModal.style.display = 'block';
  }

  function closePersonnelModal() {
    resetPersonnelForm();
    if (personnelModal) personnelModal.style.display = 'none';
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

  function buildPersonnelErrorMessage(err, fallback) {
    var msg = err && err.message ? String(err.message) : '';
    if (!msg) return fallback;
    if (/Supabase config is missing/i.test(msg)) return 'Supabase is not configured on this page.';
    if (/create_personnel_account|assign_report_personnel|mark_personnel_assignment_done|not find the function|404/i.test(msg)) {
      return 'Personnel SQL is missing. Run sql/migrations/20260324_add_personnel_accounts.sql in Supabase first.';
    }
    if (/already in use|already exists|selected personnel|inactive|password must be at least 8|required|assign a team to the report before assigning personnel|does not belong to an assigned team|not linked to a team|Personnel IDs must be an array/i.test(msg)) {
      return msg;
    }
    return fallback + ': ' + msg;
  }

  function getPersonnelNameById(personnelId) {
    var matched = allPersonnel.find(function (person) {
      return Number(person && person.id) === Number(personnelId);
    });
    return matched && matched.full_name ? matched.full_name : 'Personnel #' + personnelId;
  }

  async function loadPersonnel() {
    if (!cfg.url || !cfg.anonKey || !teamId) {
      allPersonnel = [];
      return;
    }
    try {
      var res = await fetch(
        cfg.url + '/rest/v1/personnel?select=id,full_name,email,team_id,is_active,created_at&team_id=eq.' + encodeURIComponent(teamId) + '&order=full_name.asc',
        {
          headers: {
            apikey: cfg.anonKey,
            Authorization: 'Bearer ' + cfg.anonKey
          }
        }
      );
      if (!res.ok) throw new Error('Failed to load personnel (HTTP ' + res.status + ')');
      var rows = await res.json();
      allPersonnel = (Array.isArray(rows) ? rows : []).filter(function (person) {
        return person && person.is_active !== false;
      });
    } catch (err) {
      allPersonnel = [];
    }
  }

  async function loadAssignmentRows(reportIds) {
    if (!cfg.url || !cfg.anonKey || !reportIds.length) {
      return {};
    }

    try {
      var res = await fetch(
        cfg.url + '/rest/v1/report_personnel_assignments?select=report_id,personnel_id,assignment_status,assigned_at,done_at,updated_at,personnel:personnel_id(id,full_name,email,team_id,is_active)&report_id=in.(' + reportIds.join(',') + ')&order=updated_at.desc',
        {
          headers: {
            apikey: cfg.anonKey,
            Authorization: 'Bearer ' + cfg.anonKey
          }
        }
      );
      if (!res.ok) {
        throw new Error('Failed to load report personnel assignments (HTTP ' + res.status + ')');
      }

      var rows = await res.json();
      var assignmentsByReport = {};
      (Array.isArray(rows) ? rows : []).forEach(function (row) {
        var personnelRow = row && row.personnel && !Array.isArray(row.personnel) ? row.personnel : null;
        if (personnelRow && Number(personnelRow.team_id || 0) !== teamId) return;

        var reportKey = String(row && row.report_id || '');
        if (!reportKey) return;
        if (!assignmentsByReport[reportKey]) assignmentsByReport[reportKey] = [];

        assignmentsByReport[reportKey].push({
          report_id: Number(row.report_id),
          personnel_id: Number(row.personnel_id),
          assignment_status: String(row.assignment_status || 'assigned').toLowerCase() === 'done' ? 'done' : 'assigned',
          assigned_at: row.assigned_at || '',
          done_at: row.done_at || '',
          updated_at: row.updated_at || '',
          full_name: personnelRow && personnelRow.full_name ? personnelRow.full_name : getPersonnelNameById(row.personnel_id)
        });
      });

      Object.keys(assignmentsByReport).forEach(function (reportKey) {
        assignmentsByReport[reportKey].sort(function (a, b) {
          return String(a.full_name || '').localeCompare(String(b.full_name || ''));
        });
      });

      return assignmentsByReport;
    } catch (err) {
      return {};
    }
  }

  function buildPersonnelChecklist(assignments) {
    var assignedLookup = {};
    (assignments || []).forEach(function (assignment) {
      assignedLookup[String(assignment.personnel_id)] = assignment;
    });

    var wrap = document.createElement('div');
    wrap.className = 'team-personnel-checklist';

    if (!allPersonnel.length) {
      var emptyState = document.createElement('div');
      emptyState.className = 'team-personnel-checklist-empty';
      emptyState.textContent = 'No personnel added yet for this team.';
      wrap.appendChild(emptyState);
      return wrap;
    }

    allPersonnel.forEach(function (person) {
      var assignment = assignedLookup[String(person.id)] || null;
      var option = document.createElement('label');
      option.className = 'team-personnel-option' + (assignment && assignment.assignment_status === 'done' ? ' is-done' : '');

      var checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'team-personnel-checkbox';
      checkbox.value = String(person.id);
      checkbox.checked = !!assignment;

      var name = document.createElement('span');
      name.className = 'team-personnel-option-label';
      name.textContent = person.full_name || 'Unnamed personnel';

      option.appendChild(checkbox);
      option.appendChild(name);

      if (assignment) {
        var badge = document.createElement('span');
        badge.className = 'team-personnel-option-state is-' + assignment.assignment_status;
        badge.textContent = formatAssignmentStatus(assignment.assignment_status);
        option.appendChild(badge);
      }

      wrap.appendChild(option);
    });

    return wrap;
  }

  function buildAssignmentSummaryHtml(assignments, fallbackSummary) {
    if (Array.isArray(assignments) && assignments.length) {
      return '<div class="team-personnel-summary">' + assignments.map(function (assignment) {
        return '<span class="team-personnel-chip is-' + escapeHtml(assignment.assignment_status) + '">' +
          escapeHtml(assignment.full_name || ('Personnel #' + assignment.personnel_id)) +
          ' - ' + escapeHtml(formatAssignmentStatus(assignment.assignment_status)) +
          '</span>';
      }).join('') + '</div>';
    }
    return '<span class="team-personnel-empty">' + escapeHtml(String(fallbackSummary || 'Not assigned yet')) + '</span>';
  }

  function updateStats(rows) {
    var counts = {
      total: rows.length,
      pending: 0,
      ontheway: 0,
      resolved: 0
    };

    rows.forEach(function (row) {
      counts[normalizeStatus(row && row.status)] += 1;
    });

    setText('team-stat-total', String(counts.total));
    setText('team-stat-pending', String(counts.pending));
    setText('team-stat-ontheway', String(counts.ontheway));
    setText('team-stat-resolved', String(counts.resolved));
  }

  function renderLatestReport(rows) {
    var latest = Array.isArray(rows) && rows.length ? rows[0] : null;
    if (!latest) {
      if (latestEmptyEl) latestEmptyEl.hidden = false;
      if (latestCardEl) latestCardEl.hidden = true;
      return;
    }

    if (latestEmptyEl) latestEmptyEl.hidden = true;
    if (latestCardEl) latestCardEl.hidden = false;

    setText('team-latest-queue', latest.queue_number ? ('#' + latest.queue_number) : 'Pending');
    setText('team-latest-issue', latest.issue_type || 'Not specified');
    setText('team-latest-location', latest.location_text || [latest.barangay, latest.municipality].filter(Boolean).join(', ') || 'No location saved');
    setText('team-latest-status', formatStatus(normalizeStatus(latest.status)));
    setText('team-latest-time', formatTimestamp(latest.updated_at || latest.created_at));
  }

  function flattenAssignments(rows) {
    var items = [];
    (rows || []).forEach(function (row) {
      (row.assignment_rows || []).forEach(function (assignment) {
        items.push({
          row: row,
          assignment: assignment
        });
      });
    });
    return items.sort(function (a, b) {
      var aTime = new Date(a.assignment.updated_at || a.row.updated_at || a.row.created_at || 0).getTime();
      var bTime = new Date(b.assignment.updated_at || b.row.updated_at || b.row.created_at || 0).getTime();
      return bTime - aTime;
    });
  }

  function renderNotifications(rows) {
    if (!alertListEl || !alertEmptyEl) return;
    alertListEl.innerHTML = '';

    var items = flattenAssignments(rows).slice(0, 5);
    if (!items.length) {
      alertEmptyEl.hidden = false;
      alertEmptyEl.textContent = 'No personnel assignment alerts yet.';
      return;
    }

    alertEmptyEl.hidden = true;
    items.forEach(function (itemData) {
      var row = itemData.row;
      var assignment = itemData.assignment;
      var item = document.createElement('div');
      item.className = 'team-notification-item';
      item.innerHTML =
        '<strong>' + escapeHtml(assignment.full_name || 'Personnel') + ' ' + escapeHtml(assignment.assignment_status === 'done' ? 'marked done on' : 'is assigned to') + ' queue #' + escapeHtml(row.queue_number || row.id) + '</strong>' +
        '<span>' + escapeHtml(row.issue_type || 'Unspecified issue') + '</span>' +
        '<span>' + escapeHtml(formatTimestamp(assignment.updated_at || row.updated_at || row.created_at)) + '</span>';
      alertListEl.appendChild(item);
    });
  }

  function hideAssignmentToast() {
    if (assignmentToastEl) assignmentToastEl.hidden = true;
    if (assignmentToastTimer) {
      window.clearTimeout(assignmentToastTimer);
      assignmentToastTimer = null;
    }
  }

  function showAssignmentToast(message) {
    if (!assignmentToastEl || !assignmentToastMessageEl) return;
    assignmentToastMessageEl.textContent = message;
    assignmentToastEl.hidden = false;
    if (assignmentToastTimer) window.clearTimeout(assignmentToastTimer);
    assignmentToastTimer = window.setTimeout(function () {
      assignmentToastEl.hidden = true;
    }, 9000);
  }

  function getAssignmentStateKeys(rows) {
    return flattenAssignments(rows).map(function (itemData) {
      var row = itemData.row;
      var assignment = itemData.assignment;
      return [
        row.id,
        assignment.personnel_id,
        assignment.assignment_status,
        assignment.updated_at || row.updated_at || row.created_at || ''
      ].join('|');
    });
  }

  function maybeNotifyAssignmentChange(rows) {
    var storageKey = 'teamAssignmentKeys:' + String(teamId || teamName || 'team');
    var nextKeys = getAssignmentStateKeys(rows);
    var previousKeys = [];
    try {
      previousKeys = JSON.parse(localStorage.getItem(storageKey) || '[]');
    } catch (e) {
      previousKeys = [];
    }

    if (!hasLoadedAssignments) {
      hasLoadedAssignments = true;
      localStorage.setItem(storageKey, JSON.stringify(nextKeys));
      return;
    }

    var previousSet = {};
    previousKeys.forEach(function (key) { previousSet[key] = true; });
    var newKey = nextKeys.find(function (key) { return !previousSet[key]; }) || '';

    if (newKey) {
      var changed = flattenAssignments(rows).find(function (itemData) {
        var row = itemData.row;
        var assignment = itemData.assignment;
        return newKey === [
          row.id,
          assignment.personnel_id,
          assignment.assignment_status,
          assignment.updated_at || row.updated_at || row.created_at || ''
        ].join('|');
      });

      if (changed) {
        var changedMessage = changed.assignment.full_name + ' ' +
          (changed.assignment.assignment_status === 'done' ? 'marked queue #' : 'was assigned to queue #') +
          (changed.row.queue_number || changed.row.id) +
          (changed.assignment.assignment_status === 'done' ? ' as done.' : '.');
        showAssignmentToast(changedMessage);
      }
    }

    localStorage.setItem(storageKey, JSON.stringify(nextKeys));
  }

  async function assignReportPersonnel(reportId, personnelIds) {
    await callSupabaseRpc('assign_report_personnel', {
      p_report_id: Number(reportId),
      p_personnel_ids: Array.isArray(personnelIds) ? personnelIds : []
    });
  }

  async function setReportStatusById(reportId, nextStatus, assignedTeam) {
    var normalizedStatus = normalizeStatus(nextStatus);
    var teamString = String(assignedTeam || '').trim();
    try {
      await callSupabaseRpc('set_report_status', {
        p_report_id: Number(reportId),
        p_status: normalizedStatus,
        p_team_name: teamString || null
      });
      return;
    } catch (err) {
      if (!/404|set_report_status|not find the function/i.test(err && err.message ? err.message : '')) {
        throw err;
      }
    }

    var patchBody = {
      status: normalizedStatus,
      resolved_at: normalizedStatus === 'resolved' ? new Date().toISOString() : null,
      assigned_team: teamString || null
    };
    var res = await fetch(cfg.url + '/rest/v1/' + cfg.reportsTable + '?id=eq.' + encodeURIComponent(reportId), {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        apikey: cfg.anonKey,
        Authorization: 'Bearer ' + cfg.anonKey,
        Prefer: 'return=representation'
      },
      body: JSON.stringify(patchBody)
    });
    if (!res.ok) {
      var responseText = '';
      try { responseText = (await res.text()) || ''; } catch (e) {}
      throw new Error(responseText || ('Failed to update report status (HTTP ' + res.status + ')'));
    }
  }

  function createStatusButton(label, nextStatus, row) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = nextStatus === 'resolved' ? 'team-btn team-btn-delete' : 'nav-btn nav-btn-cta';
    button.textContent = label;
    button.addEventListener('click', async function () {
      button.disabled = true;
      var originalLabel = button.textContent;
      button.textContent = 'Saving...';
      try {
        await setReportStatusById(row.id, nextStatus, row.assigned_team);
        await loadDashboardData(false, false);
      } catch (err) {
        alert('Failed to update report: ' + (err && err.message ? err.message : 'Unknown error'));
      } finally {
        button.disabled = false;
        button.textContent = originalLabel;
      }
    });
    return button;
  }

  function renderMissionList(rows) {
    if (!listEl) return;
    listEl.innerHTML = '';

    if (!Array.isArray(rows) || !rows.length) {
      if (emptyEl) {
        emptyEl.hidden = false;
        emptyEl.textContent = 'No reports are assigned to this team yet.';
      }
      return;
    }

    if (emptyEl) emptyEl.hidden = true;

    rows.forEach(function (row) {
      var status = normalizeStatus(row.status);
      var card = document.createElement('article');
      card.className = 'team-mission-card' + (row.is_urgent ? ' is-urgent' : '');

      var locationValue = row.location_text || [row.barangay, row.municipality].filter(Boolean).join(', ') || 'No location provided';
      var actions = [];

      if (status !== 'pending') actions.push(createStatusButton('Set Pending', 'pending', row));
      if (status !== 'ontheway') actions.push(createStatusButton('Mark On the Way', 'ontheway', row));
      if (status !== 'resolved') actions.push(createStatusButton('Mark Resolved', 'resolved', row));

      card.innerHTML =
        '<div class="team-mission-header">' +
          '<div>' +
            '<div class="team-mission-kicker">' +
              (row.is_urgent ? 'Urgent' : 'Assigned') +
              (row.queue_number ? ' - Queue #' + escapeHtml(row.queue_number) : '') +
            '</div>' +
            '<h3 class="team-mission-title">' + escapeHtml(row.issue_type || 'Unspecified issue') + '</h3>' +
          '</div>' +
          '<span class="team-mission-status is-' + escapeHtml(status) + '">' + escapeHtml(formatStatus(status)) + '</span>' +
        '</div>' +
        '<div class="team-mission-grid">' +
          '<div class="team-mission-meta">' +
            '<span>Location</span>' +
            '<strong>' + escapeHtml(locationValue) + '</strong>' +
          '</div>' +
          '<div class="team-mission-meta">' +
            '<span>Assigned Teams</span>' +
            '<strong>' + escapeHtml(row.assigned_team || teamName || 'Not set') + '</strong>' +
          '</div>' +
          '<div class="team-mission-meta team-mission-meta-wide">' +
            '<span>Assigned Personnel</span>' +
            '<div class="team-mission-personnel-display">' + buildAssignmentSummaryHtml(row.assignment_rows || [], row.assigned_personnel) + '</div>' +
          '</div>' +
          '<div class="team-mission-meta">' +
            '<span>Updated</span>' +
            '<strong>' + escapeHtml(formatTimestamp(row.updated_at || row.created_at)) + '</strong>' +
          '</div>' +
        '</div>' +
        '<p class="team-mission-description">' + escapeHtml(row.description || 'No extra details were submitted for this report.') + '</p>';

      var assignWrap = document.createElement('div');
      assignWrap.className = 'team-mission-assignment';
      var checklist = buildPersonnelChecklist(row.assignment_rows || []);
      var saveAssignBtn = document.createElement('button');
      saveAssignBtn.type = 'button';
      saveAssignBtn.className = 'nav-btn nav-btn-cta';
      saveAssignBtn.textContent = 'Save Personnel';
      saveAssignBtn.style.margin = '0';
      var addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'team-btn team-btn-toggle';
      addBtn.textContent = '+ Add Personnel';
      addBtn.style.margin = '0';

      saveAssignBtn.addEventListener('click', async function () {
        saveAssignBtn.disabled = true;
        var originalLabel = saveAssignBtn.textContent;
        saveAssignBtn.textContent = 'Saving...';
        try {
          var selectedIds = Array.from(checklist.querySelectorAll('.team-personnel-checkbox:checked'))
            .map(function (input) { return Number(input.value); })
            .filter(function (value) { return !!value; });
          await assignReportPersonnel(row.id, selectedIds);
          await loadDashboardData(false, false);
        } catch (err) {
          alert(buildPersonnelErrorMessage(err, 'Failed to save personnel assignment'));
        } finally {
          saveAssignBtn.disabled = false;
          saveAssignBtn.textContent = originalLabel;
        }
      });

      addBtn.addEventListener('click', openPersonnelModal);

      assignWrap.appendChild(checklist);
      assignWrap.appendChild(saveAssignBtn);
      assignWrap.appendChild(addBtn);
      card.appendChild(assignWrap);

      if (actions.length) {
        var actionsWrap = document.createElement('div');
        actionsWrap.className = 'team-mission-actions';
        actions.forEach(function (button) {
          actionsWrap.appendChild(button);
        });
        card.appendChild(actionsWrap);
      }

      listEl.appendChild(card);
    });
  }

  function sortReports(rows) {
    return rows.slice().sort(function (a, b) {
      if (!!a.is_urgent !== !!b.is_urgent) {
        return a.is_urgent ? -1 : 1;
      }
      var aTime = new Date(a.updated_at || a.created_at || 0).getTime();
      var bTime = new Date(b.updated_at || b.created_at || 0).getTime();
      return bTime - aTime;
    });
  }

  function setLoadingState(text) {
    if (emptyEl) {
      emptyEl.hidden = false;
      emptyEl.textContent = text;
    }
    if (listEl) listEl.innerHTML = '';
  }

  async function savePersonnelAccount() {
    var fullName = personnelNameInput ? personnelNameInput.value.trim() : '';
    var email = personnelEmailInput ? personnelEmailInput.value.trim().toLowerCase() : '';
    var password = personnelPasswordInput ? personnelPasswordInput.value : '';
    var confirmPassword = personnelConfirmPasswordInput ? personnelConfirmPasswordInput.value : '';

    if (!fullName || !email || !password || !confirmPassword) {
      alert('Please complete all personnel fields.');
      return;
    }
    if (password.length < 8) {
      alert('Personnel password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      alert('Personnel passwords do not match.');
      return;
    }

    var originalText = personnelSaveBtn ? personnelSaveBtn.textContent : 'Save Personnel';
    try {
      if (personnelSaveBtn) {
        personnelSaveBtn.disabled = true;
        personnelSaveBtn.textContent = 'Saving...';
      }
      await callSupabaseRpc('create_personnel_account', {
        p_full_name: fullName,
        p_email: email,
        p_password: password,
        p_team_id: Number(teamId)
      });
      await loadPersonnel();
      closePersonnelModal();
      await loadDashboardData(false, false);
      showAssignmentToast('New personnel account created for ' + fullName + '.');
    } catch (err) {
      alert(buildPersonnelErrorMessage(err, 'Failed to create personnel account'));
    } finally {
      if (personnelSaveBtn) {
        personnelSaveBtn.disabled = false;
        personnelSaveBtn.textContent = originalText;
      }
    }
  }

  async function loadTeamReports(showLoading) {
    if (!cfg.url || !cfg.anonKey || !cfg.reportsTable) {
      setLoadingState('Supabase configuration is missing for this dashboard.');
      return [];
    }

    if (showLoading) setLoadingState('Loading assigned reports...');

    var selectCols = [
      'id',
      'queue_number',
      'issue_type',
      'location_text',
      'municipality',
      'barangay',
      'status',
      'assigned_team',
      'assigned_personnel',
      'assigned_personnel_id',
      'created_at',
      'updated_at',
      'description',
      'is_urgent'
    ].join(',');

    var res = await fetch(
      cfg.url + '/rest/v1/' + cfg.reportsTable +
      '?select=' + encodeURIComponent(selectCols) +
      '&assigned_team=ilike.*' + encodeURIComponent(teamName) + '*' +
      '&order=updated_at.desc',
      {
        headers: {
          apikey: cfg.anonKey,
          Authorization: 'Bearer ' + cfg.anonKey
        }
      }
    );

    if (!res.ok) {
      throw new Error('Failed to load assigned reports (HTTP ' + res.status + ')');
    }

    var rows = await res.json();
    return sortReports((Array.isArray(rows) ? rows : []).filter(reportBelongsToTeam));
  }

  async function loadDashboardData(showLoading, refreshPersonnelToo) {
    if (loadingDashboard) return;
    loadingDashboard = true;
    if (refreshBtn) refreshBtn.disabled = true;
    if (addPersonnelBtn) addPersonnelBtn.disabled = true;

    try {
      if (refreshPersonnelToo || !allPersonnel.length) {
        await loadPersonnel();
      }
      var rows = await loadTeamReports(showLoading);
      var reportIds = rows.map(function (row) { return Number(row.id); }).filter(Boolean);
      var assignmentsByReport = await loadAssignmentRows(reportIds);

      rows.forEach(function (row) {
        row.assignment_rows = assignmentsByReport[String(row.id)] || [];
      });

      updateStats(rows);
      renderLatestReport(rows);
      renderNotifications(rows);
      renderMissionList(rows);
      maybeNotifyAssignmentChange(rows);
    } catch (err) {
      setLoadingState('Unable to load team reports right now.');
    } finally {
      loadingDashboard = false;
      if (refreshBtn) refreshBtn.disabled = false;
      if (addPersonnelBtn) addPersonnelBtn.disabled = false;
    }
  }

  function startPolling() {
    if (dashboardPollTimer) window.clearInterval(dashboardPollTimer);
    dashboardPollTimer = window.setInterval(function () {
      loadDashboardData(false, false);
    }, 15000);
  }

  loadDashboardData(true, true);
  startPolling();
});
