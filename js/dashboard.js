document.addEventListener('DOMContentLoaded', function () {
  // Check if user is logged in
  var userName = localStorage.getItem('userName');
  var userRole = localStorage.getItem('userRole') || '';
  if (!userName) {
    window.location.href = 'index.html';
    return;
  }
  if (userRole !== 'admin') {
    window.location.href = userRole === 'team'
      ? 'team-dashboard.html'
      : (userRole === 'personnel'
        ? 'personnel-dashboard.html'
        : (userRole === 'user' ? 'user-dashboard.html' : 'index.html'));
    return;
  }

  // Display user name
  document.getElementById('user-name').textContent = userName;

  // Logout functionality
  function logout() {
    localStorage.removeItem('userName');
    localStorage.removeItem('userRole');
    localStorage.removeItem('teamSession');
    localStorage.removeItem('customerSession');
    localStorage.removeItem('personnelSession');
    window.location.href = 'index.html';
  }

  var logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', function() {
      logout();
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

  function getUserRole() {
    try { return localStorage.getItem('userRole') || 'viewer'; } catch(e){ return 'viewer'; }
  }
  function canManage() {
    return getUserRole() === 'admin';
  }
  var supabaseCfg = window.SAMELCO_SUPABASE || {};
  var defaultTeams = ['Line Crew A', 'Line Crew B', 'Maintenance', 'Inspection'];
  var availableTeams = defaultTeams.slice();

  async function loadTeamsFromSupabase() {
    if (!supabaseCfg.url || !supabaseCfg.anonKey) return;
    try {
      var res = await fetch(supabaseCfg.url + '/rest/v1/teams?select=name&is_active=eq.true&order=name.asc', {
        headers: {
          apikey: supabaseCfg.anonKey,
          Authorization: 'Bearer ' + supabaseCfg.anonKey
        }
      });
      if (!res.ok) return;
      var data = await res.json();
      if (data && data.length > 0) {
        availableTeams = data.map(function(t) { return t.name; });
      }
    } catch (err) {
      console.error('Error loading teams for dashboard:', err);
    }
  }
  loadTeamsFromSupabase();

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function buildTeamSelectLabelHtml(isLocked, currentTeamsString) {
    var selectAttrs = isLocked ? ' disabled aria-disabled="true"' : '';
    var busyTeams = getBusyTeams();
    
    // Split the comma-separated string of assigned teams
    var currentTeams = (currentTeamsString || '').split(',').map(function(s){ return s.trim(); }).filter(Boolean);
    
    var options = '<option value="">+ Add team</option>' + availableTeams.map(function(t) {
      var normalizedT = String(t || '').trim();
      
      // A team is already assigned if it's in our list
      var alreadyAssigned = currentTeams.indexOf(normalizedT) !== -1;
      
      // Busy check: only consider busy if not already assigned to THIS report
      var isBusy = busyTeams.has(normalizedT) && !alreadyAssigned;
      
      if (isBusy) {
        return '<option value="' + escapeHtml(t) + '" disabled>' + escapeHtml(t) + ' (Not Available)</option>';
      }
      
      var disabled = alreadyAssigned ? ' disabled' : '';
      var label = alreadyAssigned ? escapeHtml(t) + ' (Assigned)' : escapeHtml(t);
      
      return '<option value="' + escapeHtml(t) + '"' + disabled + '>' + label + '</option>';
    }).join('');
    
    return '<label class="map-popup-label">Dispatch Teams: <select class="team-select map-popup-select"' + selectAttrs + '>' + options + '</select></label>';
  }

  function getBusyTeams() {
    var busy = new Set();
    var rows = window._dashboardLocations || [];
    rows.forEach(function(r) {
        if (isResolvedRow(r)) return;
        var teamStr = getAssignedTeamForRow(r);
        if (teamStr) {
          String(teamStr).split(',').forEach(function(t) {
            var trimmed = t.trim();
            if (trimmed) busy.add(trimmed);
          });
        }
      });
    return busy;
  }

  function getFirstAvailableTeam() {
    var busy = getBusyTeams();
    for (var i = 0; i < availableTeams.length; i++) {
      if (!busy.has(availableTeams[i])) return availableTeams[i];
    }
    return null;
  }

  function isPendingAssignmentLocked(row) {
    // We never lock anymore because we want to allow adding multiple teams
    return false;
  }

  function buildPendingAssignButtonHtml(row, isRestored) {
    if (!canManage() || isRestored) return '';
    var hasAssigned = !!getAssignedTeamForRow(row);
    var label = hasAssigned ? 'Add Extra Team' : 'Set Pending';
    return '<button type="button" class="pending-assign map-popup-btn map-popup-btn-warning">' + label + '</button>';
  }

  function lockPendingAssignControls(container, finalTeams) {
    if (!container) return;
    var btn = container.querySelector('.pending-assign');
    var sel = container.querySelector('.team-select');
    if (btn) {
      btn.textContent = 'Add Extra Team';
      btn.classList.remove('map-popup-btn-warning');
      btn.classList.add('map-popup-btn-primary');
    }
    if (sel) {
      sel.value = "";
    }
    var meta = container.querySelector('.map-popup-meta-assigned');
    if (!meta) {
      var assignedDiv = document.createElement('div');
      assignedDiv.className = 'map-popup-meta map-popup-meta-assigned';
      assignedDiv.textContent = 'Assigned: ' + finalTeams;
      var statusEl = container.querySelector('.map-popup-status');
      if (statusEl) {
        statusEl.insertAdjacentElement('afterend', assignedDiv);
      }
    } else {
      meta.textContent = 'Assigned: ' + finalTeams;
    }
    var statusEl = container.querySelector('.map-popup-status');
    if (statusEl) {
      statusEl.textContent = 'Status: On the Way';
      statusEl.style.color = '#3b82f6'; // blue
      statusEl.classList.remove('map-popup-status-pending');
      statusEl.classList.add('map-popup-status-ontheway');
    }
  }

  async function loadTeamsFromSupabase() {
    if (!supabaseCfg.url || !supabaseCfg.anonKey) return;
    try {
      var res = await fetch(supabaseCfg.url + '/rest/v1/teams?select=name&is_active=eq.true&order=name.asc', {
        headers: {
          apikey: supabaseCfg.anonKey,
          Authorization: 'Bearer ' + supabaseCfg.anonKey
        }
      });
      if (!res.ok) return;
      var rows = await res.json();
      var names = (Array.isArray(rows) ? rows : [])
        .map(function(r){ return String((r && r.name) || '').trim(); })
        .filter(Boolean);
      if (names.length) availableTeams = names;
    } catch (_) {}
  }

  function getTeamForStatusUpdate(row, teamSelectEl) {
    var selectedTeam = teamSelectEl ? String(teamSelectEl.value || '').trim() : '';
    if (selectedTeam) return selectedTeam;
    return getAssignedTeamForRow(row);
  }

  async function setReportStatusById(reportId, nextStatus, teamName) {
    if (!supabaseCfg.url || !supabaseCfg.anonKey || !supabaseCfg.reportsTable) {
      throw new Error('Missing Supabase config');
    }
    var normalized = String(nextStatus || '').toLowerCase();
    if (normalized !== 'resolved' && normalized !== 'pending' && normalized !== 'ontheway') {
      normalized = 'pending';
    }
    var patchBody = (normalized === 'resolved')
      ? { status: 'resolved', resolved_at: new Date().toISOString() }
      : { status: normalized, resolved_at: null };
    var normalizedTeam = String(teamName || '').trim();
    if (normalizedTeam) {
      patchBody.assigned_team = normalizedTeam;
    }
    var rpcMissing = false;
    try {
      var rpcRes = await fetch(supabaseCfg.url + '/rest/v1/rpc/set_report_status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: supabaseCfg.anonKey,
          Authorization: 'Bearer ' + supabaseCfg.anonKey
        },
        body: JSON.stringify({
          p_report_id: Number(reportId),
          p_status: normalized,
          p_team_name: normalizedTeam || null
        })
      });
      if (rpcRes.ok) return;
      var rpcText = '';
      try { rpcText = (await rpcRes.text()) || ''; } catch (_) {}
      
      // If RPC fails with 400, it might be due to the new multiple-teams logic 
      // violating old DB constraints. We'll try PATCH as a fallback or throw.
      if (rpcRes.status !== 404 && rpcRes.status !== 400) {
        throw new Error('Failed to update report status (RPC HTTP ' + rpcRes.status + ')' + (rpcText ? ': ' + rpcText : ''));
      }
      rpcMissing = true;
    } catch (err) {
      if (!rpcMissing) throw err;
    }
    var res = await fetch(supabaseCfg.url + '/rest/v1/' + supabaseCfg.reportsTable + '?id=eq.' + encodeURIComponent(reportId), {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseCfg.anonKey,
        Authorization: 'Bearer ' + supabaseCfg.anonKey,
        Prefer: 'return=representation'
      },
      body: JSON.stringify(patchBody)
    });
    if (!res.ok) {
      var responseText = '';
      try { responseText = (await res.text()) || ''; } catch (_) {}
      if (rpcMissing && (res.status === 401 || res.status === 403)) {
        throw new Error('Missing set_report_status RPC in Supabase. Run sql/migrations/20260311_set_report_status_function.sql.');
      }
      throw new Error('Failed to update report status (HTTP ' + res.status + ')' + (responseText ? ': ' + responseText : ''));
    }
  }

  async function setReportAssignedTeamById(reportId, teamName) {
    if (!supabaseCfg.url || !supabaseCfg.anonKey || !supabaseCfg.reportsTable) {
      throw new Error('Missing Supabase config');
    }
    var normalizedTeam = String(teamName || '').trim();
    if (!normalizedTeam) {
      throw new Error('Team name is required');
    }
    var rpcOk = false;
    try {
      var rpcRes = await fetch(supabaseCfg.url + '/rest/v1/rpc/assign_report_team', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: supabaseCfg.anonKey,
          Authorization: 'Bearer ' + supabaseCfg.anonKey
        },
        body: JSON.stringify({ p_report_id: Number(reportId), p_team_name: normalizedTeam })
      });
      if (rpcRes.ok) rpcOk = true;
      else {
        var rpcText = '';
        try { rpcText = (await rpcRes.text()) || ''; } catch (_) {}
        if (rpcRes.status !== 404) {
          throw new Error('Failed to assign team (RPC HTTP ' + rpcRes.status + ')' + (rpcText ? ': ' + rpcText : ''));
        }
      }
    } catch (_) {}
    if (rpcOk) return;
    var patchBody = { assigned_team: normalizedTeam, status: 'ontheway', resolved_at: null };
    var res = await fetch(supabaseCfg.url + '/rest/v1/' + supabaseCfg.reportsTable + '?id=eq.' + encodeURIComponent(reportId), {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseCfg.anonKey,
        Authorization: 'Bearer ' + supabaseCfg.anonKey,
        Prefer: 'return=representation'
      },
      body: JSON.stringify(patchBody)
    });
    if (!res.ok) {
      var responseText = '';
      try { responseText = (await res.text()) || ''; } catch (_) {}
      throw new Error('Failed to assign team (HTTP ' + res.status + ')' + (responseText ? ': ' + responseText : ''));
    }
  }

  function buildStatusUpdateErrorMessage(err) {
    var msg = (err && err.message) ? String(err.message) : '';
    if (!msg) return 'Failed to update status for this report entry.';
    if (/Missing Supabase config/i.test(msg)) {
      return 'Cannot update status because Supabase config is missing on this page.';
    }
    if (/set_report_status/i.test(msg) && /missing|404|run sql\/migrations\/20260311_set_report_status_function\.sql/i.test(msg)) {
      return 'Status update RPC is missing in Supabase. Run sql/migrations/20260311_set_report_status_function.sql.';
    }
    if (/HTTP 401|HTTP 403/i.test(msg)) {
      return 'Status update was denied (401/403). Check Supabase RLS policy and API key permissions.';
    }
    if (/HTTP 404/i.test(msg)) {
      return 'Status update failed because the report record was not found (404).';
    }
    if (/does not exist in teams table|violates foreign key constraint/i.test(msg)) {
      return 'Database error: One or more teams do not exist or the system needs an update. Please run the updated SQL in sql/setup_full_schema.sql to support multiple teams.';
    }
    return 'Failed to update status: ' + msg;
  }

  function readAuditLogs() {
    try { return JSON.parse(localStorage.getItem('auditLogs') || '[]'); } catch(e){ return []; }
  }
  function renderAuditLogs() {
    var list = document.getElementById('audit-logs-list');
    var empty = document.getElementById('audit-logs-empty');
    if (!list || !empty) return;
    var logs = readAuditLogs().slice().reverse().slice(0, 100);
    list.innerHTML = '';
    if (!logs.length) {
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';
    logs.forEach(function(l){
      var li = document.createElement('li');
      var when = l.ts ? new Date(l.ts).toLocaleString() : '';
      var who = l.who || 'User';
      var desc = l.summary || (l.type || '') + ' ' + JSON.stringify(l.data || {});
      li.textContent = when + ' | ' + who + ' | ' + desc;
      list.appendChild(li);
    });
  }
  var toggleAuditBtn = document.getElementById('toggle-audit-btn');
  if (toggleAuditBtn) {
    toggleAuditBtn.addEventListener('click', function(){
      var box = document.getElementById('audit-logs');
      if (!box) return;
      var show = box.style.display === 'none' || box.style.display === '';
      box.style.display = show ? 'block' : 'none';
      if (show) renderAuditLogs();
    });
  }

  // Branches button (top of nav) â€“ show dropdown with choices
  var branchesBtn = document.getElementById('branches-btn');
  var branchDropdown = document.getElementById('branch-dropdown');
  if (branchesBtn && branchDropdown) {
    branchesBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      var open = branchDropdown.classList.toggle('is-open');
    });
    document.addEventListener('click', function() {
      branchDropdown.classList.remove('is-open');
    });
    branchDropdown.addEventListener('click', function(e) { e.stopPropagation(); });

    // branch selection
    branchDropdown.querySelectorAll('.branch-option').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var branch = this.getAttribute('data-branch');
        localStorage.setItem('selectedBranch', branch);
        window.location.href = 'records.html';
      });
    });
  }

  // Three-dots menu toggle
  var navDotsBtn = document.getElementById('nav-dots-btn');
  var navDotsDropdown = document.getElementById('nav-dots-dropdown');
  if (navDotsBtn && navDotsDropdown) {
    navDotsBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      var isOpen = navDotsDropdown.classList.toggle('is-open');
      navDotsBtn.setAttribute('aria-expanded', isOpen);
    });
    document.addEventListener('click', function() {
      navDotsDropdown.classList.remove('is-open');
      navDotsBtn.setAttribute('aria-expanded', 'false');
    });
    navDotsDropdown.addEventListener('click', function(e) {
      e.stopPropagation();
    });
    navDotsDropdown.querySelectorAll('.nav-dots-item').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var action = this.getAttribute('data-action');
        navDotsDropdown.classList.remove('is-open');
        if (action === 'home') {
          window.location.href = 'dashboard.html';
        } else if (action === 'records') {
          window.location.href = 'records.html';
        } else if (action === 'analytics') {
          window.location.href = 'analytics.html';
        } else if (action === 'branches') {
          window.location.href = 'branches.html';
        } else if (action === 'teams') {
          window.location.href = 'teams.html';
        } else if (action === 'etc') {
          window.location.href = 'about.html';
        } else if (action === 'contact') {
          window.location.href = 'contact.html';
        }
        else if (action === 'logout') {
          logout();
        }
      });
    });
  }

  // Municipalities data - All municipalities and cities in Samar province (26 total)
  var municipalities = [
    { name: 'Almagro', lat: 11.9167, lng: 124.2833, barangays: ['Bacjao', 'Biasong I', 'Biasong II', 'Costa Rica', 'Costa Rica II', 'Guin-ansan', 'Imelda', 'Kerikite', 'Lunang I', 'Lunang II', 'Mabuhay', 'Magsaysay', 'Malobago', 'Marasbaras', 'Panjobjoban I', 'Panjobjoban II', 'Poblacion', 'RoÃ±o', 'San Isidro', 'San Jose', 'Talahid', 'Tonga-tonga', 'Veloso'] },
    { name: 'Basey', lat: 11.2833, lng: 125.0667, barangays: ['Amandayehan', 'Anglit', 'Bacubac', 'Balante', 'Baloog', 'Basiao', 'Baybay', 'Binongtu-an', 'Buenavista', 'Bulao', 'Burgos', 'Buscada', 'Cambayan', 'Can-abay', 'Cancaiyas', 'Canmanila', 'Catadman', 'Cogon', 'Del Pilar', 'Dolongan', 'Guintigui-an', 'Guirang', 'Iba', 'Inuntan', 'Lawa-an', 'Loog', 'Loyo', 'Mabini', 'Magallanes', 'Manlilinab', 'May-it', 'Mercado', 'Mongabong', 'New San Agustin', 'Nouvelas Occidental', 'Old San Agustin', 'Palaypay', 'Panugmonon', 'Pelit', 'Roxas', 'Salvacion', 'San Antonio', 'San Fernando', 'Sawa', 'Serum', 'Sugca', 'Sugponon', 'Sulod', 'Tinaogan', 'Tingib', 'Villa Aurora'] },
    { name: 'Calbayog City', lat: 12.0672, lng: 124.5972, barangays: ['Acedillo', 'Aguit-itan', 'Alibaba', 'Amampacang', 'Anislag', 'Awang East', 'Awang West', 'Ba-ay', 'Bagacay', 'Bagong Lipunan', 'Baja', 'Balud', 'Bante', 'Bantian', 'Basud', 'Bayo', 'Begaho', 'Binaliw', 'Bontay', 'Buenavista', 'Bugtong', 'Cabacungan', 'Cabatuan', 'Cabicahan', 'Cabugawan', 'Cacaransan', 'Cag-anahaw', 'Cag-anibong', 'Cag-olango', 'Cagbanayacao', 'Cagbayang', 'Cagbilwang', 'Cagboborac', 'Caglanipao Sur', 'Cagmanipes Norte', 'Cagmanipes Sur', 'Cagnipa', 'Cagsalaosao', 'Cahumpan', 'Calocnayan', 'Cangomaod', 'Canhumadac', 'Capacuhan', 'Capoocan', 'Carayman', 'Carmen', 'Catabunan', 'Caybago', 'Central', 'Cogon', 'Dagum', 'Danao I', 'Danao II', 'Dawo', 'De Victoria', 'Dinabongan', 'Dinagan', 'Dinawacan', 'Esperanza', 'Gamay', 'Gadgaran', 'Gasdo', 'Geraga-an', 'Guimbaoyan Norte', 'Guimbaoyan Sur', 'Guin-on', 'Hamorawon', 'Helino', 'Hibabngan', 'Hibatang', 'Higasaan', 'Himalandrog', 'Hugon Rosales', 'Jacinto', 'Jimautan', 'Jose A. RoÃ±o', 'Kalilihan', 'Kilikili', 'La Paz', 'Langoyon', 'Lapaan', 'Libertad', 'Limarayon', 'Longsob', 'Lonoy', 'Looc', 'Mabini I', 'Mabini II', 'Macatingog', 'Mag-ubay', 'Maguino-o', 'Malaga', 'Malajog', 'Malayog', 'Malopalo', 'Mancol', 'Mantaong', 'Manuel Barral, Sr.', 'Marcatubig', 'Matobato', 'Mawacat', 'Maybog', 'Maysalong', 'Migara', 'Nabang', 'Naga', 'Naguma', 'Navarro', 'Nijaga', 'Oboob', 'Obrero', 'Olera', 'Oquendo', 'OsmeÃ±a', 'Pagbalican', 'Palanas', 'Palanogan', 'Panlayahan', 'Panonongan', 'Panoypoy', 'Patong', 'Payahan', 'PeÃ±a', 'Pilar', 'Pinamorotan', 'Quezon', 'Rawis', 'Rizal I', 'Rizal II', 'Roxas I', 'Roxas II', 'Saljag', 'Salvacion', 'San Antonio', 'San Isidro', 'San Joaquin', 'San Jose', 'San Policarpio', 'San Rufino', 'Saputan', 'Sigo', 'Sinantan', 'Sinidman Occidental', 'Sinidman Oriental', 'Tabawan', 'Talahiban', 'Tanval', 'Tapa-e', 'Tarabucan', 'Tigbe', 'Tinambacan Norte', 'Tinambacan Sur', 'Tinaplacan', 'Tomaliguez', 'Trinidad', 'Victory', 'Villahermosa'] },
    { name: 'Calbiga', lat: 11.6167, lng: 125.0167, barangays: ['Antol', 'Bacyaran', 'Barangay 1', 'Barangay 2', 'Barangay 3', 'Barangay 4', 'Barangay 5', 'Barangay 6', 'Barangay 7', 'Barobaybay', 'Beri', 'Binanggaran', 'Borong', 'Bulao', 'Buluan', 'Caamlongan', 'Calayaan', 'Calingonan', 'Canbagtic', 'Canticum', 'Daligan', 'Guinbanga', 'Hindang', 'Hubasan', 'Literon', 'Lubang', 'Macaalan', 'Mahangcao', 'Malabal', 'Minata', 'Otoc', 'Panayuran', 'Pasigay', 'Patong', 'Polangi', 'Rawis', 'San Ignacio', 'San Mauricio', 'Sinalangtan', 'Timbangan', 'Tinago'] },
    { name: 'Catbalogan City', lat: 11.7792, lng: 124.8842, barangays: ['Albalate', 'Bagongon', 'Bangon', 'Basiao', 'Buluan', 'Bunuanan', 'Cabugawan', 'Cagudalo', 'Cagusipan', 'Cagutian', 'Cagutsan', 'Canhawan Gote', 'Canlapwas', 'Cawayan', 'Cinco', 'Darahuway Daco', 'Darahuway Gote', 'Estaka', 'Guindaponan', 'Guinsorongan', 'Ibol', 'Iguid', 'Lagundi', 'Libas', 'Lobo', 'Manguehay', 'Maulong', 'Mercedes', 'Mombon', 'MuÃ±oz', 'New Mahayag', 'Old Mahayag', 'Palanyogon', 'Pangdan', 'Payao', 'Poblacion 1', 'Poblacion 2', 'Poblacion 3', 'Poblacion 4', 'Poblacion 5', 'Poblacion 6', 'Poblacion 7', 'Poblacion 8', 'Poblacion 9', 'Poblacion 10', 'Poblacion 11', 'Poblacion 12', 'Poblacion 13', 'Pupua', 'Rama', 'San Andres', 'San Pablo', 'San Roque', 'San Vicente', 'Silanga', 'Socorro', 'Totoringon'] },
    { name: 'Daram', lat: 11.6333, lng: 124.7833, barangays: ['Arawane', 'Astorga', 'Bachao', 'Baclayan', 'Bagacay', 'Bayog', 'Betaug', 'Birawan', 'Bono-anon', 'Buenavista', 'Burgos', 'Cabac', 'Cabil-isan', 'Cabiton-an', 'Cabugao', 'Cagboboto', 'Calawan-an', 'Cambuhay', 'Campelipa', 'Candugue', 'Canloloy', 'Cansaganay', 'Casab-ahan', 'Guindapunan', 'Guintampilan', 'Iquiran', 'Jacopon', 'Losa', 'Lucob-lucob', 'Mabini', 'Macalpe', 'Mandoyucan', 'Marupangdan', 'Mayabay', 'Mongolbongol', 'Nipa', 'Parasan', 'Poblacion 1', 'Poblacion 2', 'Poblacion 3', 'Pondang', 'Poso', 'Real', 'Rizal', 'San Antonio', 'San Jose', 'San Miguel', 'San Roque', 'San Vicente', 'Saugan', 'So-ong', 'Sua', 'Sugod', 'Talisay', 'Tugas', 'Ubo', 'Valles-Bello', 'Yangta'] },
    { name: 'Gandara', lat: 12.0167, lng: 124.8167, barangays: ['Adela Heights', 'Arong', 'Balocawe', 'Bangahon', 'Beslig', 'Buao', 'Bunyagan', 'Burabod I', 'Burabod II', 'Calirocan', 'Canhumawid', 'Caparangasan', 'Caranas', 'Carmona', 'Casab-ahan', 'Casandig', 'Catorse de Agosto', 'Caugbusan', 'Concepcion', 'Diaz', 'Dumalo-ong', 'Elcano', 'Gerali', 'Gereganan', 'Giaboc', 'Hampton', 'Hetebac', 'Himamaloto', 'Hinayagan', 'Hinugacan', 'Hiparayan', 'Jasminez', 'Lungib', 'Mabuhay', 'Macugo', 'Malayog', 'Marcos', 'Minda', 'Nacube', 'Nalihugan', 'Napalisan', 'Natimonan', 'Ngoso', 'Palambrag', 'Palanas', 'Pizarro', 'PiÃ±aplata', 'Pologon', 'Purog', 'Rawis', 'Rizal', 'Samoyao', 'San Agustin', 'San Antonio', 'San Enrique', 'San Francisco', 'San Isidro', 'San Jose', 'San Miguel', 'San Pelayo', 'San Ramon', 'Santa Elena', 'Santo Niño', 'Senibaran', 'Sidmon', 'Tagnao', 'Tambongan', 'Tawiran', 'Tigbawon'] },
    { name: 'Hinabangan', lat: 11.6833, lng: 125.0833, barangays: ['Bagacay', 'Binobucalan', 'Bucalan', 'Cabalagnan', 'Cabang', 'Canano', 'Concord', 'Consolabao', 'Dalosdoson', 'Fatima', 'Lim-ao', 'Malihao', 'Mugdo', 'OsmeÃ±a', 'Poblacion 1', 'Poblacion 2', 'Rawis', 'San Jose', 'San Rafael', 'Tabay', 'Yabon'] },
    { name: 'Jiabong', lat: 11.7667, lng: 124.9500, barangays: ['Barangay No. 1', 'Barangay No. 2', 'Barangay No. 3', 'Barangay No. 4', 'Barangay No. 5', 'Barangay No. 6', 'Barangay No. 7', 'Barangay No. 8', 'Bawang', 'Bugho', 'Camarobo-an', 'Candayao', 'Cantongtong', 'Casapa', 'Catalina', 'Cristina', 'Dogongan', 'Garcia', 'Hinaga', 'Jia-an', 'Jidanao', 'Lulugayan', 'Macabetas', 'Malino', 'Malobago', 'Mercedes', 'Nagbac', 'Parina', 'Salvacion', 'San Andres', 'San Fernando', 'San Miguel', 'Tagbayaon', 'Victory'] },
    { name: 'Marabut', lat: 11.1167, lng: 125.2167, barangays: ['Amambucale', 'Amantillo', 'Binukyahan', 'Caluwayan', 'Canyoyo', 'Catato Poblacion', 'Ferreras', 'Legaspi', 'Lipata', 'Logero', 'Mabuhay', 'Malobago', 'Odoc', 'OsmeÃ±a', 'Panan-awan', 'Pinalanga', 'Pinamitinan', 'RoÃ±o', 'San Roque', 'Santa Rita', 'Santo Niño Poblacion', 'Tagalag', 'Tinabanan', 'Veloso'] },
    { name: 'Matuguinao', lat: 12.1333, lng: 124.8833, barangays: ['Angyap', 'Bag-otan', 'Barruz', 'Camonoan', 'Carolina', 'Deit', 'Del Rosario', 'Inubod', 'Libertad', 'Ligaya', 'Mabuligon Poblacion', 'Maduroto Poblacion', 'Mahanud', 'Mahayag', 'Nagpapacao', 'Rizal', 'Salvacion', 'San Isidro', 'San Roque', 'Santa Cruz'] },
    { name: 'Motiong', lat: 11.7782, lng: 124.9986, barangays: ['Angyap', 'Barayong', 'Bayog', 'Beri', 'Bonga', 'Calantawan', 'Calapi', 'Caluyahan', 'Canatuan', 'Candomacol', 'Canvais', 'Capaysagan', 'Caranas', 'Caulayanan', 'Hinica-an', 'Inalad', 'Linonoban', 'Malobago', 'Malonoy', 'Mararangsi', 'Maypange', 'New Minarog', 'Oyandic', 'Pamamasan', 'Poblacion I', 'Poblacion I-A', 'Pusongan', 'San Andres', 'Santo Niño', 'Sarao'] },
    { name: 'Paranas (Wright)', lat: 11.7715, lng: 125.0225, barangays: ['Anagasi', 'Apolonia', 'Bagsa', 'Balbagan', 'Bato', 'Buray', 'Cantaguic', 'Cantao-an', 'Cantato', 'Casandig I', 'Casandig II', 'Cawayan', 'Concepcion', 'Jose Roño', 'Lawaan I', 'Lawaan II', { name: 'Lipata', lat: 11.788, lng: 125.016 }, 'Lokilokon', 'Mangcal', 'Maylobe', 'Minarog', 'Nawi', 'Pabanog', 'Paco', 'Pagsa-ogan', 'Pagsanjan', 'Patag', 'Pequit', 'Poblacion 1', 'Poblacion 2', 'Poblacion 3', 'Poblacion 4', 'Poblacion 5', 'Poblacion 6', 'Salay', 'San Isidro', 'Santo Niño', 'Sulopan', 'Tabucan', 'Tapul', 'Tenani', 'Tigbawon', 'Tula', 'Tutubigan'] },
    { name: 'Pinabacdao', lat: 11.6167, lng: 124.9833, barangays: ['Bangon', 'Barangay I', 'Barangay II', 'Botoc', 'Bugho', 'Calampong', 'Canlobo', 'Catigawan', 'Dolores', 'Lale', 'Lawaan', 'Laygayon', 'Layo', 'Loctob', 'Madalunot', 'Magdawat', 'Mambog', 'Manaing', 'Nabong', 'Obayan', 'Pahug', 'Parasanon', 'Pelaon', 'San Isidro'] },
    { name: 'San Jorge', lat: 11.3000, lng: 125.0833, barangays: ['Anquiana', 'Aurora', 'Bay-ang', 'Blanca Aurora', 'Buenavista I', 'Buenavista II', 'Bulao', 'Bungliw', 'Cabugao', 'Cag-olo-olo', 'Calundan', 'Cantaguic', 'Canyaki', 'Cogtoto-og', 'Erenas', 'Gayondato', 'Guadalupe', 'Guindapunan', 'Hernandez', 'Himay', 'Janipon', 'La Paz', 'Libertad', 'Lincoro', 'Mabuhay', 'Mancol', 'Matalud', 'Mobo-ob', 'Mombon', 'Puhagan', 'Quezon', 'Ranera', 'Rawis', 'Rosalim', 'San Isidro', 'San Jorge I', 'San Jorge II', 'San Juan', 'Sapinit', 'Sinit-an', 'Tomogbong'] },
    { name: 'San Jose de Buan', lat: 12.0500, lng: 125.0333, barangays: ['Aguingayan', 'Babaclayon', 'Barangay 1', 'Barangay 2', 'Barangay 3', 'Barangay 4', 'Can-aponte', 'Cataydongan', 'Gusa', 'Hagbay', 'Hibaca-an', 'Hiduroma', 'Hilumot', 'San Nicolas'] },
    { name: 'San Sebastian', lat: 11.7000, lng: 125.0167, barangays: ['Balogo', 'Bontod', 'Cabaywa', 'Camanhagay', 'Campiyak', 'Canduyucan', 'Dolores', 'Hita-asan I', 'Hita-asan II', 'Inobongan', 'Poblacion Barangay 1', 'Poblacion Barangay 2', 'Poblacion Barangay 3', 'Poblacion Barangay 4'] },
    { name: 'Santa Margarita', lat: 12.0378, lng: 124.6584, barangays: ['Agrupacion', 'Arapison', 'Avelino', 'Bahay', 'Balud', 'Bana-ao', 'Burabod', 'Cagsumje', 'Cautod (Poblacion)', 'Camperito', 'Campeig', 'Can-ipulan', 'Canmoros', 'Cinco', 'Curry', 'Gajo', 'Hindang', 'Ilo', 'Imelda', 'Inoraguiao', 'Jolacao', 'Lambao', 'Mabuhay', 'Mahayag', 'Matayonas', 'Monbon (Poblacion)', 'Nabulo', 'Napuro I', 'Napuro II', 'Palale', 'Panabatan', 'Panaruan', 'Roxas', 'Salvacion', 'Solsogon', 'Sundara'] },
    { name: 'Santa Rita', lat: 11.4500, lng: 124.9333, barangays: ['Alegria', 'Anibongan', 'Aslum', 'Bagolibas', 'Binanalan', 'Bokinggan Poblacion', 'Bougainvilla Poblacion', 'Cabacungan', 'Cabunga-an', 'Camayse', 'Cansadong', 'Caticugan', 'Dampigan', 'Guinbalot-an', 'Gumamela Poblacion', 'Hinangudtan', 'Igang-igang', 'La Paz', 'Lupig', 'Magsaysay', 'Maligaya', 'New Manunca', 'Old Manunca', 'Pagsulhogon', 'Rosal Poblacion', 'Salvacion', 'San Eduardo', 'San Isidro', 'San Juan', 'San Pascual', 'San Pedro', 'San Roque', 'Santa Elena', 'Santan Poblacion', 'Tagacay', 'Tominamos', 'Tulay', 'Union'] },
    { name: 'Santo Niño', lat: 11.9833, lng: 124.4667, barangays: ['Balatguti', 'Baras', 'Basud', 'Buenavista', 'Cabunga-an', 'Corocawayan', 'Ilijan', 'Ilo', 'Lobelobe', 'Pinanangnan', 'Sevilla', 'Takut', 'Villahermosa'] },
    { name: 'Tagapul-an', lat: 11.9500, lng: 124.8333, barangays: ['Baguiw', 'Balocawe', 'Guinbarucan', 'Labangbaybay', 'Luna', 'Mataluto', 'Nipa', 'Pantalan', 'Pulangbato', 'San Jose', 'San Vicente', 'Suarez', 'Sugod', 'Trinidad'] },
    { name: 'Talalora', lat: 11.5333, lng: 124.8333, barangays: ['Bo. Independencia', 'Malaguining', 'Mallorga', 'Navatas Daku', 'Navatas Guti', 'Placer', 'Poblacion Barangay 1', 'Poblacion Barangay 2', 'San Juan', 'Tatabunan', 'Victory'] },
    { name: 'Tarangnan', lat: 11.9000, lng: 124.7500, barangays: ['Alcazar', 'Awang', 'Bahay', 'Balonga-as', 'Balugo', 'Bangon Gote', 'Baras', 'Binalayan', 'Bisitahan', 'Bonga', 'Cabunga-an', 'Cagtutulo', 'Cambatutay Nuevo', 'Cambatutay Viejo', 'Canunghan', 'Catan-agan', 'Dapdap', 'Gallego', 'Imelda Poblacion', 'Lahong', 'Libucan Dacu', 'Libucan Gote', 'Lucerdoni', 'Majacob', 'Mancares', 'Marabut', 'Oeste-A', 'Oeste-B', 'Pajo', 'Palencia', 'Poblacion A', 'Poblacion B', 'Poblacion C', 'Poblacion D', 'Poblacion E', 'San Vicente', 'Santa Cruz', 'Sugod', 'Talinga', 'Tigdaranao', 'Tizon'] },
    { name: 'Villareal', lat: 11.5667, lng: 124.9333, barangays: ['Banquil', 'Bino-ongan', 'Burabod', 'Cambaguio', 'Canmucat', 'Central', 'Conant', 'Guintarcan', 'Himyangan', 'Igot', 'Inarumbacan', 'Inasudlan', 'Lam-awan', 'Lamingao', 'Lawa-an', 'Macopa', 'Mahayag', 'Malonoy', 'Mercado', 'Miramar', 'Nagcaduha', 'Pacao', 'Pacoyoy', 'Pangpang', 'Patag', 'Plaridel', 'Polangi', 'San Andres', 'San Fernando', 'San Rafael', 'San Roque', 'Santa Rosa', 'Santo Niño', 'Soledad', 'Tayud', 'Tomabe', 'Ulayan', 'Villarosa Poblacion'] },
    { name: 'Zumarraga', lat: 11.6333, lng: 124.8500, barangays: ['Alegria', 'Arteche', 'Bioso', 'Boblaran', 'Botaera', 'Buntay', 'Camayse', 'Canwarak', 'Ibarra', 'Lumalantang', 'Macalunod', 'Maga-an', 'Maputi', 'Marapilit', 'Monbon', 'Mualbual', 'Pangdan', 'Poblacion 1', 'Poblacion 2', 'Poro', 'San Isidro', 'Sugod', 'Talib', 'Tinaugan', 'Tubigan'] }
  ];
  // Prefer shared data if available (single source of truth across pages)
  if (Array.isArray(window.SAMELCO_MUNICIPALITIES) && window.SAMELCO_MUNICIPALITIES.length) {
    municipalities = window.SAMELCO_MUNICIPALITIES;
  }
  var _excludedMunicipalitySet = (function(){
    var arr = ['calbayog city','tarangnan','almagro','santo niño','tagapul-an','santa margarita','gandara','pagsanghan','matuguinao','san jorge'];
    var o = {};
    arr.forEach(function(s){ o[s] = true; });
    return o;
  })();
  function isExcludedMunicipality(n) {
    if (!n) return false;
    var x = String(n).toLowerCase();
    return !!_excludedMunicipalitySet[x];
  }
  municipalities = municipalities.filter(function(m) {
    if (Number(m.lat) === 11.9833 && Number(m.lng) === 124.4667) return false;
    return !isExcludedMunicipality(m.name);
  });

  var municipalitiesPanel = document.getElementById('municipalities-panel');
  if (municipalitiesPanel) municipalitiesPanel.hidden = false;

  function syncMunicipalitySidebarSelection(name, options) {
    var list = document.getElementById('municipalities-sidebar-list');
    if (!list || !name) return null;
    var opts = options || {};
    var targetKey = getMunicipalityIndexKey(name || '');
    var items = list.querySelectorAll('.sidebar-municipality-item');
    var matched = null;
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var isMatch = getMunicipalityIndexKey(item.getAttribute('data-name') || '') === targetKey;
      item.classList.toggle('is-active', isMatch);
      var barangayList = item.querySelector('.sidebar-barangays');
      if (barangayList) {
        if (isMatch && opts.openBarangays === true) {
          barangayList.style.display = 'block';
        } else if (!isMatch && opts.collapseOthers === true) {
          barangayList.style.display = 'none';
        }
      }
      if (isMatch) matched = item;
    }
    if (matched && opts.scroll !== false) {
      matched.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    return matched;
  }

  function revealMunicipalitiesPanel(name, options) {
    var wasHidden = !!(municipalitiesPanel && municipalitiesPanel.hidden);
    if (municipalitiesPanel) municipalitiesPanel.hidden = false;
    var matched = name ? syncMunicipalitySidebarSelection(name, options) : null;
    if (wasHidden && window.map && typeof window.map.invalidateSize === 'function') {
      requestAnimationFrame(function() {
        window.map.invalidateSize();
      });
    }
    return matched;
  }

  function hideMunicipalitiesPanel() {
    return;
  }

  function cancelHideMunicipalitiesPanel() {
    return;
  }

  function scheduleHideMunicipalitiesPanel() {
    return;
  }

  // Add all municipalities above to the right side panel
  var sidebarList = document.getElementById('municipalities-sidebar-list');
  if (sidebarList) {
    municipalities.forEach(function(m) {
      var item = document.createElement('div');
      item.className = 'sidebar-municipality-item';
      item.setAttribute('data-name', m.name || '');
      var barangayCount = Array.isArray(m.barangays) ? m.barangays.length : m.barangays;
      var header = document.createElement('div');
      header.innerHTML = '<h4>' + m.name + ' <span class="issue-badge new" style="display:none;"></span> <span class="issue-badge pending" style="display:none;"></span></h4><p>' + barangayCount + ' Barangays</p>';
      item.appendChild(header);
      var bList = document.createElement('div');
      bList.className = 'sidebar-barangays';
      bList.style.display = 'none';
      if (Array.isArray(m.barangays)) {
        m.barangays.forEach(function(b) {
          var bItem = document.createElement('div');
          bItem.className = 'barangay-item-sidebar';
          var bName = typeof b === 'object' && b.name ? b.name : b;
          bItem.textContent = bName;
          
          // Add click listener for individual barangays to zoom to their GeoJSON center
          bItem.addEventListener('click', function(ev) {
            ev.stopPropagation(); // prevent municipality collapse
            var mName = m.name;
            var fallback = getFallbackLatLngForBarangay(mName, bName, 'sidebar-zoom');
            if (fallback && window.map) {
              window.map.setView(fallback, 13);
              
              // Find the marker for this barangay if it exists
              var idxKey = getMunicipalityIndexKey(mName) + '|' + normalizeBarangayName(bName);
              var mk = reportMarkersIndex[idxKey];
              if (mk) {
                mk.openPopup();
              } else {
                // Otherwise show a temporary popup at the center
                L.popup()
                  .setLatLng(fallback)
                  .setContent('<strong>' + mName + '</strong><br>' + bName)
                  .openOn(window.map);
              }
            }
          });
          
          bList.appendChild(bItem);
        });
      }
      item.appendChild(bList);
      item.addEventListener('click', function() {
        var willOpen = bList.style.display === 'none';
        syncMunicipalitySidebarSelection(m.name, {
          openBarangays: willOpen,
          collapseOthers: willOpen,
          scroll: false
        });
        if (!willOpen) {
          item.classList.remove('is-active');
          return;
        }
        if (window.map) window.map.setView([m.lat, m.lng], 11);
        var mk = municipalityMarkersIndex[getMunicipalityIndexKey(m.name || '')];
        if (mk) mk.openPopup();
      });
      item.setAttribute('data-name', m.name);
      sidebarList.appendChild(item);
    });
  }

  // Initialize Map - Focused on Samar
  var map = L.map('map', {
    center: [11.7, 124.9],
    zoom: 10,
    minZoom: 8,
    maxZoom: 13,
    attributionControl: false,
    zoomControl: true,
    scrollWheelZoom: true,
    maxBounds: [[10.5, 124.0], [12.5, 125.5]],
    maxBoundsViscosity: 1.0
  });

  /* L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors © CARTO',
    subdomains: 'abcd',
    maxZoom: 18,
    noWrap: true
  }).addTo(map); */

  function createMarkerIcon(pinClasses) {
    var classes = 'marker-pin' + (pinClasses ? (' ' + pinClasses) : '');
    return L.divIcon({
      className: 'custom-marker',
      html: '<div class="' + classes + '"></div>',
      iconSize: [30, 42],
      iconAnchor: [15, 42]
    });
  }

  var SAMAR_MASK_WORLD_RING = [
    [89.9, -179.9],
    [89.9, 179.9],
    [-89.9, 179.9],
    [-89.9, -179.9]
  ];

  function toLeafletRing(ring) {
    if (!Array.isArray(ring) || ring.length < 3) return null;
    return ring.map(function(coord) {
      return [coord[1], coord[0]];
    });
  }

  function collectSamarMaskHoles(geojson) {
    var holes = [];
    if (!geojson || !Array.isArray(geojson.features)) return holes;
    geojson.features.forEach(function(feature) {
      var geometry = feature && feature.geometry;
      if (!geometry || !geometry.coordinates) return;

      if (geometry.type === 'Polygon') {
        var polygonRing = toLeafletRing(geometry.coordinates[0]);
        if (polygonRing) holes.push(polygonRing);
        return;
      }

      if (geometry.type === 'MultiPolygon') {
        geometry.coordinates.forEach(function(polygonCoords) {
          var multiPolygonRing = toLeafletRing(polygonCoords && polygonCoords[0]);
          if (multiPolygonRing) holes.push(multiPolygonRing);
        });
      }
    });
    return holes;
  }

  function addSamarMask(map, geojson) {
    var holes = collectSamarMaskHoles(geojson);
    if (!holes.length) return null;

    if (!map.getPane('samarMaskPane')) {
      map.createPane('samarMaskPane');
      map.getPane('samarMaskPane').style.zIndex = '350';
      map.getPane('samarMaskPane').style.pointerEvents = 'none';
    }

    return L.polygon([SAMAR_MASK_WORLD_RING].concat(holes), {
      pane: 'samarMaskPane',
      stroke: false,
      fillColor: '#ffffff',
      fillOpacity: 1,
      fillRule: 'evenodd',
      interactive: false
    }).addTo(map);
  }

  var MUNICIPALITY_COLOR_PALETTE = [
    '#ef476f', '#ffd166', '#06d6a0', '#118ab2', '#8338ec', '#ff9f1c',
    '#2ec4b6', '#e76f51', '#8ecae6', '#90be6d', '#f4a261', '#577590',
    '#ff6b6b', '#4d908e', '#f72585', '#43aa8b', '#b56576', '#fb8500',
    '#6d597a', '#00b4d8', '#a7c957', '#bc6c25', '#e9c46a', '#4361ee',
    '#d62828', '#3a86ff'
  ];

  function buildMunicipalityColorMap(geojson) {
    var seen = {};
    var municipalityNames = [];
    var colorMap = {};

    if (!geojson || !Array.isArray(geojson.features)) return colorMap;

    geojson.features.forEach(function(feature) {
      var municipalityName = feature && feature.properties && feature.properties.NAME_2;
      if (!municipalityName || seen[municipalityName]) return;
      seen[municipalityName] = true;
      municipalityNames.push(municipalityName);
    });

    municipalityNames.sort();
    municipalityNames.forEach(function(name, index) {
      colorMap[name] = MUNICIPALITY_COLOR_PALETTE[index % MUNICIPALITY_COLOR_PALETTE.length];
    });

    return colorMap;
  }

  function shadeHexColor(hex, amount) {
    if (!hex || hex.charAt(0) !== '#') return hex || '#8b2a2a';
    var normalized = hex.length === 4
      ? '#' + hex.charAt(1) + hex.charAt(1) + hex.charAt(2) + hex.charAt(2) + hex.charAt(3) + hex.charAt(3)
      : hex;
    var r = Math.max(0, Math.min(255, parseInt(normalized.slice(1, 3), 16) + amount));
    var g = Math.max(0, Math.min(255, parseInt(normalized.slice(3, 5), 16) + amount));
    var b = Math.max(0, Math.min(255, parseInt(normalized.slice(5, 7), 16) + amount));
    return '#' + [r, g, b].map(function(channel) {
      var value = channel.toString(16);
      return value.length === 1 ? '0' + value : value;
    }).join('');
  }

  var municipalityColorMap = buildMunicipalityColorMap(window.SAMELCO_COVERAGE_GEOJSON);

  function getMunicipalityFillColor(name) {
    return municipalityColorMap[name] || '#d4a373';
  }

  function getCoverageFeatureStyle(feature) {
    var municipalityName = feature && feature.properties ? feature.properties.NAME_2 : '';
    var fillColor = getMunicipalityFillColor(municipalityName);
    return {
      color: shadeHexColor(fillColor, -140),
      weight: 1.35,
      opacity: 0.9,
      fillColor: fillColor,
      fillOpacity: 0.42
    };
  }

  function getCoverageFeatureHoverStyle(feature) {
    var municipalityName = feature && feature.properties ? feature.properties.NAME_2 : '';
    var fillColor = getMunicipalityFillColor(municipalityName);
    return {
      color: shadeHexColor(fillColor, -180),
      weight: 2.1,
      opacity: 1,
      fillColor: fillColor,
      fillOpacity: 0.6
    };
  }

  function fitMapToServiceArea() {
    var points = municipalities
      .filter(function(m) {
        return Number.isFinite(Number(m.lat)) && Number.isFinite(Number(m.lng));
      })
      .map(function(m) {
        return [Number(m.lat), Number(m.lng)];
      });
    if (!points.length) return;
    var bounds = L.latLngBounds(points);
    if (bounds.isValid()) {
      map.fitBounds(bounds.pad(0.12), { padding: [24, 24] });
    }
  }

  function focusMapOnSamar(bounds) {
    if (!bounds || !bounds.isValid()) {
      fitMapToServiceArea();
      return;
    }
    var lockedBounds = bounds.pad(0.03);
    map.setMaxBounds(lockedBounds);
    map.fitBounds(lockedBounds, { padding: [12, 12] });
  }

  var customIcon = createMarkerIcon('');
  var newIcon = createMarkerIcon('marker-pin-new');
  var pendingIcon = createMarkerIcon('marker-pin-pending');
  var restoredIcon = createMarkerIcon('marker-pin-restored');

  // --- Map Labels ---
  var municipalityLabelLayer = L.layerGroup();
  var barangayLabelLayer = L.layerGroup();

  function updateMapLabels() {
    var zoom = map.getZoom();
    
    // Toggle Municipality Labels (Visible at zoom 10 and above)
    if (zoom >= 10) {
      if (!map.hasLayer(municipalityLabelLayer)) municipalityLabelLayer.addTo(map);
    } else {
      if (map.hasLayer(municipalityLabelLayer)) map.removeLayer(municipalityLabelLayer);
    }

    // Toggle Barangay Labels (Visible at zoom 12 and above)
    if (zoom >= 12) {
      if (!map.hasLayer(barangayLabelLayer)) barangayLabelLayer.addTo(map);
    } else {
      if (map.hasLayer(barangayLabelLayer)) map.removeLayer(barangayLabelLayer);
    }
  }

  function initMunicipalityLabels() {
    if (!window.SAMELCO_MUNICIPALITIES) return;
    window.SAMELCO_MUNICIPALITIES.forEach(function(m) {
      if (!m.lat || !m.lng) return;
      L.marker([m.lat, m.lng], {
        icon: L.divIcon({
          className: 'map-label municipality-label',
          html: '<span>' + m.name + '</span>',
          iconSize: [160, 24],
          iconAnchor: [80, 12]
        }),
        interactive: false,
        pane: 'markerPane'
      }).addTo(municipalityLabelLayer);
    });
  }

  map.on('zoomend', updateMapLabels);
  initMunicipalityLabels();

  // Render Coverage GeoJSON if available
  var coverageLayer = null;
  if (window.SAMELCO_COVERAGE_GEOJSON) {
    coverageLayer = L.geoJSON(window.SAMELCO_COVERAGE_GEOJSON, {
      style: getCoverageFeatureStyle,
      onEachFeature: function(feature, layer) {
        if (feature.properties) {
          var props = feature.properties;
          var popupContent = '<div class="map-popup-content">' +
            '<h4 style="margin:0 0 8px; color:#8b2a2a; border-bottom:1px solid #eee; padding-bottom:4px;">' + (props.NAME_3 || 'Unknown Barangay') + '</h4>' +
            '<p style="margin:4px 0;"><strong>Municipality:</strong> ' + (props.NAME_2 || 'N/A') + '</p>' +
            '<p style="margin:4px 0;"><strong>Area Ops:</strong> ' + (props['AREA OPS'] || 'N/A') + '</p>' +
            '<p style="margin:4px 0;"><strong>Feeder:</strong> ' + (props['FDR NUMBER'] || 'N/A') + '</p>' +
            '</div>';
          layer.bindPopup(popupContent);
          
          layer.on({
            mouseover: function(e) {
              var l = e.target;
              l.setStyle(getCoverageFeatureHoverStyle(feature));
            },
            mouseout: function(e) {
              var l = e.target;
              l.setStyle(getCoverageFeatureStyle(feature));
            }
          });

          // Add barangay label to the barangayLabelLayer
          if (props.NAME_3) {
            var bounds = layer.getBounds();
            if (bounds.isValid()) {
              var center = bounds.getCenter();
              L.marker(center, {
                icon: L.divIcon({
                  className: 'map-label barangay-label',
                  html: '<span>' + props.NAME_3 + '</span>',
                  iconSize: [120, 18],
                  iconAnchor: [60, 9]
                }),
                interactive: false,
                pane: 'markerPane'
              }).addTo(barangayLabelLayer);
            }
          }
        }
      }
    });

    addSamarMask(map, window.SAMELCO_COVERAGE_GEOJSON);
    coverageLayer.addTo(map);
    focusMapOnSamar(coverageLayer.getBounds());
  } else {
    fitMapToServiceArea();
  }

  // Initial update of labels
  updateMapLabels();

  var municipalityMarkersLayer = L.layerGroup().addTo(map);
  var reportMarkersLayer = L.layerGroup().addTo(map);
  var routeLayer = L.layerGroup().addTo(map);
  var municipalityMarkersIndex = {};
  var reportMarkersIndex = {};
  var reportMarkersById = {};
  var adminLocation = null;
  var adminMarker = null;
  var activeRouteLine = null;
  var activeRouteOwnerKey = '';
  var _forceAlarmFromUrl = false;

  function scheduleMapResizeInvalidate() {
    if (!window.map || typeof window.map.invalidateSize !== 'function') return;
    requestAnimationFrame(function() {
      window.map.invalidateSize();
    });
  }

  window.addEventListener('resize', function() {
    scheduleMapResizeInvalidate();
  });

  setTimeout(function() {
    scheduleMapResizeInvalidate();
  }, 50);

  function setAdminLocation(lat, lng) {
    if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return;
    adminLocation = { lat: Number(lat), lng: Number(lng) };
    if (adminMarker) {
      adminMarker.setLatLng([adminLocation.lat, adminLocation.lng]);
      return;
    }
    adminMarker = L.circleMarker([adminLocation.lat, adminLocation.lng], {
      radius: 7,
      color: '#0f172a',
      fillColor: '#2563eb',
      fillOpacity: 0.95,
      weight: 2
    }).addTo(routeLayer);
    adminMarker.bindPopup('<strong>Your Location</strong>');
  }

  function captureAdminLocationOnce() {
    return new Promise(function(resolve, reject) {
      if (adminLocation) {
        resolve(adminLocation);
        return;
      }
      if (!navigator.geolocation) {
        reject(new Error('Geolocation unavailable'));
        return;
      }
      navigator.geolocation.getCurrentPosition(function(pos) {
        setAdminLocation(pos.coords.latitude, pos.coords.longitude);
        resolve(adminLocation);
      }, function(err) {
        reject(err || new Error('Unable to get current location'));
      }, { enableHighAccuracy: true, timeout: 12000 });
    });
  }

  function clearRouteLine() {
    if (activeRouteLine && map) {
      map.removeLayer(activeRouteLine);
      activeRouteLine = null;
    }
    activeRouteOwnerKey = '';
  }

  function setActiveRouteOwner(nextKey) {
    activeRouteOwnerKey = nextKey ? String(nextKey) : '';
  }

  function clearRouteLineIfDifferentOwner(nextKey) {
    if (!activeRouteLine) return;
    var nk = nextKey ? String(nextKey) : '';
    if (nk && activeRouteOwnerKey && nk === activeRouteOwnerKey) return;
    clearRouteLine();
  }

  function bindPopupAction(container, selector, handler) {
    if (!container) return;
    var els = container.querySelectorAll(selector);
    if (!els || !els.length) return;
    els.forEach(function(el) {
      if (!el || el._popupActionBound) return;
      el._popupActionBound = true;
      var fired = false;
      function stopOnly(ev) {
        if (!ev) return;
        if (typeof ev.stopPropagation === 'function') ev.stopPropagation();
      }
      function runHandler(ev) {
        if (!ev) return;
        if (typeof ev.preventDefault === 'function') ev.preventDefault();
        if (typeof ev.stopPropagation === 'function') ev.stopPropagation();
        if (fired) return;
        fired = true;
        try { handler(ev); } finally { setTimeout(function(){ fired = false; }, 100); }
      }
      // Capture phase makes this reliable even when Leaflet/map handlers are active.
      el.addEventListener('click', runHandler, true);
      el.addEventListener('pointerup', runHandler, true);
      el.addEventListener('touchend', runHandler, true);
      el.addEventListener('mousedown', stopOnly, true);
      el.addEventListener('mouseup', stopOnly, true);
      el.addEventListener('touchstart', stopOnly, true);
      el.addEventListener('pointerdown', stopOnly, true);
    });
  }

  async function drawRouteFromAdminTo(destLat, destLng) {
    var dLat = Number(destLat);
    var dLng = Number(destLng);
    if (!Number.isFinite(dLat) || !Number.isFinite(dLng)) {
      alert('Destination coordinates are not available for this report.');
      return;
    }
    if (!adminLocation) {
      try {
        await captureAdminLocationOnce();
      } catch (_) {
        // Fallback: use current map center if geolocation is blocked.
        if (map && typeof map.getCenter === 'function') {
          var c = map.getCenter();
          if (c && Number.isFinite(Number(c.lat)) && Number.isFinite(Number(c.lng))) {
            setAdminLocation(Number(c.lat), Number(c.lng));
          }
        }
        if (!adminLocation) {
          alert('Unable to get your current location. Please allow location access.');
          return;
        }
      }
    }
    if (!adminLocation) return;

    clearRouteLine();
    var fallbackPoints = [[adminLocation.lat, adminLocation.lng], [dLat, dLng]];
    try {
      var osrmUrl = 'https://router.project-osrm.org/route/v1/driving/' +
        encodeURIComponent(String(adminLocation.lng) + ',' + String(adminLocation.lat) + ';' + String(dLng) + ',' + String(dLat)) +
        '?overview=full&geometries=geojson';
      var res = await fetch(osrmUrl, { headers: { 'Accept': 'application/json' } });
      if (!res.ok) throw new Error('OSRM HTTP ' + res.status);
      var payload = await res.json();
      var coords = payload && payload.routes && payload.routes[0] && payload.routes[0].geometry && payload.routes[0].geometry.coordinates;
      if (!Array.isArray(coords) || !coords.length) throw new Error('Route geometry unavailable');
      var routePoints = coords.map(function(c) { return [Number(c[1]), Number(c[0])]; });
      activeRouteLine = L.polyline(routePoints, { color: '#2563eb', weight: 5, opacity: 0.9 }).addTo(map);
      map.fitBounds(activeRouteLine.getBounds(), { padding: [30, 30] });
      return;
    } catch (_) {
      activeRouteLine = L.polyline(fallbackPoints, { color: '#2563eb', weight: 4, opacity: 0.8, dashArray: '8,6' }).addTo(map);
      map.fitBounds(activeRouteLine.getBounds(), { padding: [30, 30] });
    }
  }

  // Deep-link target opening support
  var _pendingOpenTarget = null;
  function setPendingTargetFromUrl() {
    try {
      var sp = new URLSearchParams(window.location.search);
      _forceAlarmFromUrl = sp.get('alarm') === '1';
      var reportId = sp.get('report_id') || sp.get('reportId') || sp.get('id') || '';
      var rawLoc = sp.get('location') || '';
      var mName = sp.get('mun') || sp.get('municipality') || sp.get('m') || '';
      var bName = sp.get('brgy') || sp.get('barangay') || sp.get('b') || '';
      if (reportId) {
        _pendingOpenTarget = { reportId: String(reportId) };
        return;
      }
      if (!mName && rawLoc) {
        var found = findMunicipalityByLocationText(rawLoc);
        if (found) mName = found.name;
        // try to extract barangay token
        var pb = parseBarangayFromLocationText(rawLoc);
        if (pb) bName = pb;
      }
      if (!mName) return;
      var cm = getMunicipalityByName(mName);
      if (cm && cm.name) mName = cm.name;
      var key = getMunicipalityIndexKey(mName || '') + '|' + normalizeBarangayName(bName || '');
      _pendingOpenTarget = { key: key, mName: mName, bName: bName };
    } catch (e) {}
  }
  setPendingTargetFromUrl();
  captureAdminLocationOnce().catch(function(){});

  // Alerts setup
  var alertsEnabled = localStorage.getItem('alertsEnabled') === '1';
  var alarmEl = document.getElementById('alarm-audio');
  var alarmPerm = document.getElementById('alarm-permission');
  var enableAlertsBtn = document.getElementById('enable-alerts-btn');
  var alertsToggle = document.getElementById('sound-alerts-toggle');
  var alarmPrimed = false;
  function resetAlarmElement() {
    if (!alarmEl) return;
    try {
      alarmEl.pause();
      alarmEl.currentTime = 0;
      alarmEl.muted = false;
      alarmEl.volume = 1;
    } catch (e) {}
  }
  function stopAlarmClip() {
    resetAlarmElement();
  }
  function primeAlarmAudio() {
    if (!alarmEl || typeof alarmEl.play !== 'function') return;
    try {
      alarmEl.currentTime = 0;
      alarmEl.muted = true;
      alarmEl.volume = 1;
    } catch (e) {}
    var playPromise = null;
    try {
      playPromise = alarmEl.play();
    } catch (e) {
      resetAlarmElement();
      return;
    }
    if (playPromise && typeof playPromise.then === 'function') {
      playPromise.then(function() {
        alarmPrimed = true;
        resetAlarmElement();
      }).catch(function() {
        resetAlarmElement();
      });
      return;
    }
    alarmPrimed = true;
    resetAlarmElement();
  }
  function setAlertsEnabled(next) {
    alertsEnabled = !!next;
    localStorage.setItem('alertsEnabled', alertsEnabled ? '1' : '0');
    if (alertsToggle) alertsToggle.checked = alertsEnabled;
    if (alertsEnabled) {
      if (alarmPerm) alarmPerm.style.display = 'none';
      primeAlarmAudio();
    } else {
      stopAlarmClip();
      if (alarmPerm) alarmPerm.style.display = 'none';
    }
  }
  function initAlarmSource() {
    if (!alarmEl) return;
    var candidates = ['../assest/audio/alarm.mp3', '../assets/audio/alarm.mp3'];
    var i = 0;
    function tryNext() {
      if (i >= candidates.length) return;
      var src = candidates[i++];
      var onError = function() {
        alarmEl.removeEventListener('error', onError);
        tryNext();
      };
      alarmEl.addEventListener('error', onError, { once: true });
      alarmEl.src = src;
      try { alarmEl.load(); } catch (e) {}
    }
    tryNext();
  }
  initAlarmSource();
  if (alertsToggle) {
    alertsToggle.checked = alertsEnabled;
    alertsToggle.addEventListener('change', function() {
      setAlertsEnabled(!!alertsToggle.checked);
    });
  }
  if (enableAlertsBtn) {
    enableAlertsBtn.addEventListener('click', function() {
      setAlertsEnabled(true);
    });
  }
  function showEnableBanner() {
    if (alarmPerm) alarmPerm.style.display = 'flex';
  }
  function armAlarmOnGesture() {
    if (!alertsEnabled || alarmPrimed) return;
    primeAlarmAudio();
  }
  window.addEventListener('pointerdown', armAlarmOnGesture, { passive: true });
  window.addEventListener('keydown', armAlarmOnGesture, { passive: true });
  function simpleBeep(times) {
    try {
      var ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx && typeof ctx.resume === 'function') ctx.resume();
      var duration = 0.15;
      var t = ctx.currentTime;
      for (var i=0;i<(times||1);i++) {
        var o = ctx.createOscillator();
        var g = ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(880, t + i*0.25);
        g.gain.setValueAtTime(0.001, t + i*0.25);
        g.gain.exponentialRampToValueAtTime(0.3, t + i*0.25 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, t + i*0.25 + duration);
        o.connect(g).connect(ctx.destination);
        o.start(t + i*0.25);
        o.stop(t + i*0.25 + duration);
      }
    } catch(e){}
  }
  function playAlarmClip() {
    if (!alarmEl || typeof alarmEl.play !== 'function') {
      simpleBeep(3);
      showEnableBanner();
      return;
    }
    try {
      alarmEl.muted = false;
      alarmEl.volume = 1;
      alarmEl.currentTime = 0;
    } catch (e) {}
    var playPromise = null;
    try {
      playPromise = alarmEl.play();
    } catch (e) {
      simpleBeep(3);
      showEnableBanner();
      return;
    }
    if (playPromise && typeof playPromise.then === 'function') {
      playPromise.then(function() {
        alarmPrimed = true;
      }).catch(function() {
        simpleBeep(3);
        showEnableBanner();
      });
      return;
    }
    alarmPrimed = true;
  }
  var lastNewCount = -1;
  var lastLatestReportMs = -1;
  var lastLatestReportId = '';
  var alarmInitialized = false;
  function triggerAlarmIfActive(rows) {
    if (!Array.isArray(rows)) return;
    var counts = { new: 0, pending: 0 };
    var latestMs = -1;
    var latestId = '';
    rows.forEach(function(r){
      var n = r.name || 'Unknown';
      if (isResolvedRow(r)) return;
      var b = resolveBarangayForReport(r) || r.barangay || '';
      if (!isDbPendingRow(r) && isBarangayRestored(n, b)) return;
      var assignedTeam = getAssignedTeamForRow(r);
      if (assignedTeam) counts.pending += 1;
      else if (isNewComplianceRow(r)) counts.new += 1;
      else counts.pending += 1;
      var ms = Date.parse(r.createdAt || '');
      if (isFinite(ms)) {
        var rid = String(r.id || '');
        if (ms > latestMs || (ms === latestMs && rid > latestId)) {
          latestMs = ms;
          latestId = rid;
        }
      }
    });
    var newCount = counts.new;
    if (!alarmInitialized) {
      alarmInitialized = true;
      lastNewCount = newCount;
      lastLatestReportMs = latestMs;
      lastLatestReportId = latestId;
      return;
    }
    var shouldAlarm = false;
    if (newCount > lastNewCount) shouldAlarm = true;
    if (latestMs > lastLatestReportMs) shouldAlarm = true;
    if (latestMs === lastLatestReportMs && latestMs >= 0 && latestId && latestId > lastLatestReportId) shouldAlarm = true;

    if (newCount < lastNewCount) lastNewCount = newCount;
    if (latestMs < lastLatestReportMs) {
      lastLatestReportMs = latestMs;
      lastLatestReportId = latestId;
    }
    if (!shouldAlarm) {
      lastNewCount = newCount;
      lastLatestReportMs = latestMs;
      lastLatestReportId = latestId;
      return;
    }
    lastNewCount = newCount;
    lastLatestReportMs = latestMs;
    lastLatestReportId = latestId;
    if (!alertsEnabled) { showEnableBanner(); return; }
    playAlarmClip();
  }
  function playAlarmNowFromLink() {
    playAlarmClip();
  }
  var urgentModalEl = document.getElementById('urgent-report-modal');
  var urgentModalListEl = document.getElementById('urgent-report-info-list');
  var urgentModalTitleEl = document.getElementById('urgent-report-title');
  var urgentModalSubtitleEl = document.getElementById('urgent-report-subtitle');
  var urgentModalCloseEl = document.getElementById('close-urgent-report-modal');
  var urgentModalDismissBtn = document.getElementById('urgent-report-dismiss-btn');
  var urgentModalViewBtn = document.getElementById('urgent-report-view-btn');
  var activeUrgentReport = null;
  var urgentReportsInitialized = false;

  function readSeenUrgentReportIds() {
    try {
      var raw = JSON.parse(localStorage.getItem('seenUrgentReportIds') || '[]');
      return Array.isArray(raw) ? raw.map(function(v){ return String(v); }) : [];
    } catch (e) {
      return [];
    }
  }

  function writeSeenUrgentReportIds(ids) {
    try {
      var unique = Array.from(new Set((ids || []).map(function(v){ return String(v); }))).slice(-500);
      localStorage.setItem('seenUrgentReportIds', JSON.stringify(unique));
    } catch (e) {}
  }

  function markUrgentReportSeen(reportId) {
    if (!reportId) return;
    var ids = readSeenUrgentReportIds();
    var key = String(reportId);
    if (ids.indexOf(key) === -1) {
      ids.push(key);
      writeSeenUrgentReportIds(ids);
    }
  }

  function openUrgentReportOnMap(report) {
    if (!report) return;
    var mk = reportMarkersById[String(report.id)] || null;
    if (!mk) {
      var key = getMunicipalityIndexKey(report.name || '') + '|' + normalizeBarangayName(report.barangay || '');
      mk = reportMarkersIndex[key] || null;
    }
    if (!mk || !window.map) return;
    var ll = mk.getLatLng();
    window.map.setView(ll, 13);
    mk.openPopup();
  }

  function closeUrgentReportModal() {
    activeUrgentReport = null;
    stopAlarmClip();
    if (urgentModalEl) urgentModalEl.style.display = 'none';
  }

  function renderUrgentReportModal(report) {
    if (!urgentModalEl || !urgentModalListEl || !report) return;
    activeUrgentReport = report;
    var qVal = Number.isFinite(Number(report.queueNumber)) && Number(report.queueNumber) > 0
      ? Number(report.queueNumber)
      : ((window._queueOrderById && window._queueOrderById[report.id]) ? window._queueOrderById[report.id] : null);
    if (urgentModalTitleEl) {
      urgentModalTitleEl.textContent = (report.issue || 'Urgent report') + ' in ' + (report.name || 'Unknown location');
    }
    if (urgentModalSubtitleEl) {
      urgentModalSubtitleEl.textContent = 'Urgent issue reported by ' + (report.fullName || 'Unknown reporter') + '. Dispatch a team immediately.';
    }
    urgentModalListEl.innerHTML = '';
    [
      { label: 'Queue Number', value: qVal ? ('#' + qVal) : 'Processing' },
      { label: 'Municipality', value: report.name || 'Unknown' },
      { label: 'Barangay', value: report.barangay || 'Not specified' },
      { label: 'Location', value: getReportLocationText(report) || 'No location provided' },
      { label: 'Reporter', value: report.fullName || 'Unknown reporter' },
      { label: 'Contact', value: report.contact || 'No contact provided' },
      { label: 'Status', value: isResolvedRow(report) ? 'Resolved' : (isOnTheWayRow(report) ? 'On The Way' : 'Pending') },
      { label: 'Assigned Team', value: getAssignedTeamForRow(report) || 'Not assigned yet' },
      { label: 'Submitted', value: report.createdAt ? new Date(report.createdAt).toLocaleString() : 'Just now' }
    ].forEach(function(item) {
      var li = document.createElement('li');
      li.innerHTML = '<strong>' + escapeHtml(item.label) + ':</strong> <span>' + escapeHtml(item.value) + '</span>';
      urgentModalListEl.appendChild(li);
    });
    urgentModalEl.style.display = 'block';
    playAlarmNowFromLink();
  }

  function maybeShowUrgentReportModal(rows) {
    if (!Array.isArray(rows)) return;
    if (activeUrgentReport) return;
    var eligible = rows.filter(function(r) {
      if (!r || isResolvedRow(r) || !isUrgentRow(r)) return false;
      var b = resolveBarangayForReport(r) || r.barangay || '';
      if (isPinHidden(r.name || '', b, r.id)) return false;
      return true;
    }).sort(function(a, b) {
      var ta = Date.parse(a.createdAt || '') || 0;
      var tb = Date.parse(b.createdAt || '') || 0;
      return tb - ta;
    });
    var seenIds = readSeenUrgentReportIds();
    var nextUrgent = eligible.find(function(r) {
      return seenIds.indexOf(String(r.id || '')) === -1;
    });
    if (!urgentReportsInitialized) {
      urgentReportsInitialized = true;
      if (!nextUrgent) return;
      if (!seenIds.length) {
        eligible.forEach(function(r) {
          var rid = String(r.id || '');
          if (rid && seenIds.indexOf(rid) === -1) seenIds.push(rid);
        });
        writeSeenUrgentReportIds(seenIds);
        renderUrgentReportModal(nextUrgent);
        return;
      }
    }
    if (!nextUrgent) return;
    markUrgentReportSeen(nextUrgent.id);
    renderUrgentReportModal(nextUrgent);
  }

  if (urgentModalCloseEl) {
    urgentModalCloseEl.addEventListener('click', function() {
      closeUrgentReportModal();
    });
  }
  if (urgentModalDismissBtn) {
    urgentModalDismissBtn.addEventListener('click', function() {
      closeUrgentReportModal();
    });
  }
  if (urgentModalViewBtn) {
    urgentModalViewBtn.addEventListener('click', function() {
      if (activeUrgentReport) openUrgentReportOnMap(activeUrgentReport);
      closeUrgentReportModal();
    });
  }
  if (urgentModalEl) {
    urgentModalEl.addEventListener('click', function(e) {
      if (e.target === urgentModalEl) closeUrgentReportModal();
    });
  }

  // Deprecated municipality-wide restore state. Kept only for backward compatibility.
  var restoredLocations = [];
  var pendingAssignments = {};
  try {
    var storedPA = localStorage.getItem('pendingAssignments');
    if (storedPA) pendingAssignments = JSON.parse(storedPA) || {};
  } catch (e) {}
  function getAssignedTeam(name) {
    return pendingAssignments[(name || '').toLowerCase()] || '';
  }
  function normalizeAssignedTeam(team) {
    return String(team || '').trim();
  }
  function getAssignedTeamForRow(row) {
    return normalizeAssignedTeam(row && (row.assignedTeam || row.assigned_team));
  }
  function setAssignedTeam(name, team) {
    if (!name) return;
    var normalizedTeam = normalizeAssignedTeam(team);
    var key = (name || '').toLowerCase();
    if (normalizedTeam) pendingAssignments[key] = normalizedTeam; else delete pendingAssignments[key];
    localStorage.setItem('pendingAssignments', JSON.stringify(pendingAssignments));
    try {
      var who = localStorage.getItem('userName') || 'User';
      var arr = JSON.parse(localStorage.getItem('auditLogs') || '[]');
      arr.push({ ts: new Date().toISOString(), who: who, type: 'assign', data: { municipality: name, team: normalizedTeam }, summary: 'Assigned ' + (normalizedTeam||'') + ' to ' + (name||'') });
      if (arr.length > 500) arr = arr.slice(arr.length - 500);
      localStorage.setItem('auditLogs', JSON.stringify(arr));
    } catch(e){}
  }
  var restoredBarangays = {};
  try {
    var storedRB = localStorage.getItem('restoredBarangays');
    if (storedRB) {
      restoredBarangays = JSON.parse(storedRB) || {};
    }
  } catch (e) {}
  function isBarangayRestored(mName, bName) {
    if (!mName || !bName) return false;
    var bucket = restoredBarangays[mName] || {};
    return !!bucket[normalizeBarangayName(bName)];
  }
  function markBarangayRestored(mName, bName) {
    if (!mName || !bName) return;
    var norm = normalizeBarangayName(bName);
    if (!restoredBarangays[mName]) restoredBarangays[mName] = {};
    restoredBarangays[mName][norm] = true;
    localStorage.setItem('restoredBarangays', JSON.stringify(restoredBarangays));
    try {
      var who = localStorage.getItem('userName') || 'User';
      var arr = JSON.parse(localStorage.getItem('auditLogs') || '[]');
      arr.push({ ts: new Date().toISOString(), who: who, type: 'restore_barangay', data: { municipality: mName, barangay: bName }, summary: 'Marked ' + mName + ' – ' + bName + ' as Restored' });
      if (arr.length > 500) arr = arr.slice(arr.length - 500);
      localStorage.setItem('auditLogs', JSON.stringify(arr));
    } catch(e){}
  }
  var hiddenPins = {};
  try {
    var hp = localStorage.getItem('hiddenPins');
    if (hp) hiddenPins = JSON.parse(hp) || {};
  } catch(e){}
  function getPinKey(mName, bName) {
    return (String(mName||'').toLowerCase() + '|' + normalizeBarangayName(bName||''));
  }
  function getReportPinKey(reportId) {
    return 'id:' + String(reportId || '');
  }
  function isPinHidden(mName, bName, reportId) {
    if (reportId != null && String(reportId || '') !== '') {
      return !!hiddenPins[getReportPinKey(reportId)];
    }
    return !!hiddenPins[getPinKey(mName, bName)];
  }
  function hidePin(mName, bName, reportId) {
    var key = (reportId != null && String(reportId || '') !== '')
      ? getReportPinKey(reportId)
      : getPinKey(mName, bName);
    hiddenPins[key] = true;
    localStorage.setItem('hiddenPins', JSON.stringify(hiddenPins));
    try {
      var who = localStorage.getItem('userName') || 'User';
      var arr = JSON.parse(localStorage.getItem('auditLogs') || '[]');
      arr.push({ ts: new Date().toISOString(), who: who, type: 'hide_pin', data: { municipality: mName, barangay: bName }, summary: 'Hid pin ' + mName + ' – ' + bName });
      if (arr.length > 500) arr = arr.slice(arr.length - 500);
      localStorage.setItem('auditLogs', JSON.stringify(arr));
    } catch(e){}
  }

  function isNew(createdAt) {
    if (!createdAt) return false;
    var t = Date.parse(createdAt);
    if (isNaN(t)) return false;
    var THRESHOLD_HOURS = 24;
    return (Date.now() - t) <= THRESHOLD_HOURS * 3600 * 1000;
  }
  var newestUnresolvedId = '';
  function refreshNewestUnresolvedFlag(rows) {
    newestUnresolvedId = '';
    if (!Array.isArray(rows)) return;
    var newestTs = -Infinity;
    rows.forEach(function(r) {
      if (!r || isResolvedRow(r)) return;
      var mName = r.name || '';
      var b = resolveBarangayForReport(r) || r.barangay || '';
      if (isPinHidden(mName, b, r.id)) return;
      if (!isDbPendingRow(r) && isBarangayRestored(mName, b)) return;
      var t = Date.parse(r.createdAt || '');
      if (!isFinite(t)) t = -Infinity;
      var rid = String(r.id || '');
      var curId = String(newestUnresolvedId || '');
      if (t > newestTs || (t === newestTs && rid > curId)) {
        newestTs = t;
        newestUnresolvedId = rid;
      }
    });
    rows.forEach(function(r) {
      r._isNewestUnresolved = String(r.id || '') === String(newestUnresolvedId || '');
    });
  }
  function isNewComplianceRow(r) {
    if (!r || isResolvedRow(r) || isOnTheWayRow(r)) return false;
    return !getAssignedTeamForRow(r);
  }
  function isUrgentRow(r) {
    if (!r) return false;
    if (r.isUrgent === true || r.is_urgent === true) return true;
    var raw = r.isUrgent;
    if (raw == null) raw = r.is_urgent;
    if (raw != null) {
      var v = String(raw).toLowerCase();
      if (v === 'true' || v === '1' || v === 'yes') return true;
    }
    return String((r && r.status) || '').toLowerCase() === 'urgent';
  }
  function isResolvedRow(r) {
    return getStatusKey(r) === 'resolved';
  }
  function isOnTheWayRow(r) {
    return getStatusKey(r) === 'ontheway';
  }
  function isDbPendingRow(r) {
    return getStatusKey(r) === 'pending';
  }
  function getStatusKey(r) {
    var s = String((r && r.status) || 'pending').toLowerCase();
    if (s === 'resolved') return 'resolved';
    if (s === 'ontheway' || s === 'on the way' || s === 'on_the_way') return 'ontheway';
    return 'pending';
  }
  function isOverdueRow(r) {
    if (!r || !r.createdAt) return false;
    if (isResolvedRow(r)) return false;
    var t = Date.parse(r.createdAt);
    if (isNaN(t)) return false;
    var older = (Date.now() - t) > 24 * 3600 * 1000;
    if (!older) return false;
    var b = resolveBarangayForReport(r) || r.barangay || '';
    if (!isDbPendingRow(r) && isBarangayRestored(r.name || '', b)) return false;
    var assignedTeam = getAssignedTeamForRow(r);
    return !assignedTeam;
  }

  function buildIdSet(ids) {
    var out = {};
    if (!Array.isArray(ids)) return out;
    ids.forEach(function(id) {
      var key = String(id || '');
      if (key) out[key] = true;
    });
    return out;
  }

  function getMarkerPinEl(marker) {
    if (!marker || typeof marker.getElement !== 'function') return null;
    var el = marker.getElement();
    if (!el) return null;
    return el.querySelector('.marker-pin') || null;
  }

  function setMarkerBlink(marker, shouldBlink) {
    var pin = getMarkerPinEl(marker);
    if (!pin) return;
    pin.classList.toggle('marker-pin-blink', !!shouldBlink);
  }

  function isUnreadNewReportRow(r, readSet) {
    if (!r || isResolvedRow(r)) return false;
    if (!isNewComplianceRow(r)) return false;
    var id = String(r.id || '');
    if (!id) return false;
    return !(readSet && readSet[id]);
  }

  function isSidebarIssueRow(r) {
    if (!r || isResolvedRow(r)) return false;
    if (isNewComplianceRow(r)) return true;
    if (isOnTheWayRow(r)) return true;
    return !!getAssignedTeamForRow(r);
  }

  /** When true, sidebar lists only municipalities/barangays with New compliance or On the way (incl. assigned team). */
  function isActiveReportsSidebarFilter() {
    var el = document.getElementById('issues-only-toggle');
    if (!el) return true;
    return !!el.checked;
  }

  function renderMunicipalityMarkers(locations) {
    refreshNewestUnresolvedFlag(locations);
    municipalityMarkersLayer.clearLayers();
    municipalityMarkersIndex = {};
    // Municipality issues are already represented by report pins.
    // Keep this layer empty to avoid duplicate visible markers.
  }

  function normalizeMunicipalityKey(name) {
    if (!name) return '';
    var x = String(name).toLowerCase();
    x = x.replace(/\(wright\)/g, '');
    x = x.replace(/\bcity\b/g, '');
    x = x.replace(/\s+/g, ' ').trim();
    return x;
  }
  function getMunicipalityIndexKey(name) {
    return normalizeMunicipalityKey(name || '');
  }
  function hash32(str) {
    var s = String(str || '');
    var h = 0;
    for (var i = 0; i < s.length; i++) {
      h = (h * 31 + s.charCodeAt(i)) >>> 0;
    }
    return h >>> 0;
  }
  function getMunicipalityByName(name) {
    if (!name) return null;
    var key = normalizeMunicipalityKey(name);
    if (!key) return null;
    return municipalities.find(function(m){
      return normalizeMunicipalityKey(m.name) === key;
    }) || null;
  }
  function getMunicipalityByKey(key) {
    var k = normalizeMunicipalityKey(key || '');
    if (!k) return null;
    return municipalities.find(function(m){
      return normalizeMunicipalityKey(m.name) === k;
    }) || null;
  }
  function findCoverageLocationByPoint(latitude, longitude) {
    var lookup = window.SAMELCO_COVERAGE_LOOKUP;
    if (!lookup || typeof lookup.findLocationByPoint !== 'function') return null;
    if (!window.SAMELCO_COVERAGE_GEOJSON) return null;
    return lookup.findLocationByPoint(window.SAMELCO_COVERAGE_GEOJSON, latitude, longitude);
  }
  function getCentroidOfFeature(feature) {
    if (!feature || !feature.geometry) return null;
    var coords = feature.geometry.coordinates;
    var type = feature.geometry.type;
    var flat = [];
    if (type === 'Polygon') {
      flat = coords[0];
    } else if (type === 'MultiPolygon') {
      coords.forEach(function(poly) {
        flat = flat.concat(poly[0]);
      });
    }
    if (!flat.length) return null;
    var sumLat = 0, sumLng = 0;
    flat.forEach(function(p) {
      sumLng += p[0];
      sumLat += p[1];
    });
    return [sumLat / flat.length, sumLng / flat.length];
  }

  function getFallbackLatLngForBarangay(municipalityName, barangayName, seed) {
    var mName = (municipalityName || '').toLowerCase().trim();
    var bName = (barangayName || '').toLowerCase().replace(/^brgy\.?\s*/i, '').trim();

    // 1. Try to find explicit coordinates in municipalities data first (highest priority for manual tuning)
    var muni = getMunicipalityByName(municipalityName) || getMunicipalityByKey(municipalityName);
    if (muni && Array.isArray(muni.barangays)) {
      var foundB = muni.barangays.find(function(b) {
        if (typeof b === 'object' && b.name) {
          var normB = b.name.toLowerCase().replace(/^brgy\.?\s*/i, '').trim();
          return normB === bName;
        }
        return false;
      });
      if (foundB && Number.isFinite(Number(foundB.lat)) && Number.isFinite(Number(foundB.lng))) {
        var lat = Number(foundB.lat);
        var lng = Number(foundB.lng);
        // Add deterministic small jitter if multiple reports in same barangay
        if (seed != null && String(seed) !== '') {
          var h2 = hash32(seed);
          var ang2 = (h2 % 360) * (Math.PI / 180);
          var rad2 = 0.0004 * ((h2 % 3) + 1);
          lat += rad2 * Math.cos(ang2);
          lng += (rad2 * Math.sin(ang2)) / Math.cos(lat * Math.PI / 180);
        }
        return [lat, lng];
      }
    }

    // 2. Try to find in GeoJSON for actual centroid
    if (window.SAMELCO_COVERAGE_GEOJSON && window.SAMELCO_COVERAGE_GEOJSON.features) {
      var feature = window.SAMELCO_COVERAGE_GEOJSON.features.find(function(f) {
        var fBrgy = (f.properties.NAME_3 || '').toLowerCase().trim();
        var fMuni = (f.properties.NAME_2 || '').toLowerCase().trim();
        return (fBrgy === bName || fBrgy.indexOf(bName) !== -1 || bName.indexOf(fBrgy) !== -1) &&
               (fMuni === mName || fMuni.indexOf(mName) !== -1 || mName.indexOf(fMuni) !== -1);
      });
      if (feature) {
        var centroid = getCentroidOfFeature(feature);
        if (centroid) {
          // Add deterministic small jitter if multiple reports in same barangay
          if (seed != null && String(seed) !== '') {
            var h2 = hash32(seed);
            var ang2 = (h2 % 360) * (Math.PI / 180);
            var rad2 = 0.0004 * ((h2 % 3) + 1);
            centroid[0] += rad2 * Math.cos(ang2);
            centroid[1] += (rad2 * Math.sin(ang2)) / Math.cos(centroid[0] * Math.PI / 180);
          }
          return centroid;
        }
      }
    }

    // 2. Original fallback: generic offset around municipality center
    var muni = getMunicipalityByName(municipalityName) || getMunicipalityByKey(municipalityName);
    if (!muni) return null;
    var baseLat = Number(muni.lat), baseLng = Number(muni.lng);
    if (!Number.isFinite(baseLat) || !Number.isFinite(baseLng)) return null;
    var bKey = normalizeBarangayName(barangayName || '');
    var anchorKey = getMunicipalityIndexKey(muni.name) + '|' + bKey;
    var h = hash32(anchorKey);
    var ang = (h % 360) * (Math.PI / 180);
    var ring = (h % 4) + 2;
    var rad = 0.003 * ring;
    var lat = baseLat + rad * Math.cos(ang);
    var lng = baseLng + (rad * Math.sin(ang)) / Math.cos(baseLat * Math.PI / 180);
    if (seed != null && String(seed) !== '') {
      var h2 = hash32(seed);
      var ang2 = (h2 % 360) * (Math.PI / 180);
      var rad2 = 0.0007 * ((h2 % 3) + 1);
      lat = lat + rad2 * Math.cos(ang2);
      lng = lng + (rad2 * Math.sin(ang2)) / Math.cos(lat * Math.PI / 180);
    }
    return [lat, lng];
  }
  function findMunicipalityByLocationText(locationText) {
    if (!locationText) return null;
    var text = String(locationText);
    var parts = text.split(',').map(function(p){ return p.trim(); }).filter(Boolean);
    // Prefer the trailing address parts, where municipality usually appears.
    for (var i = parts.length - 1; i >= 0; i--) {
      var token = parts[i];
      var tokenKey = normalizeMunicipalityKey(token);
      if (!tokenKey) continue;
      var exact = municipalities.find(function(m){
        return normalizeMunicipalityKey(m.name) === tokenKey;
      });
      if (exact) return exact;
      var near = municipalities.find(function(m){
        var mKey = normalizeMunicipalityKey(m.name);
        return tokenKey.indexOf(mKey) !== -1 || mKey.indexOf(tokenKey) !== -1;
      });
      if (near) return near;
    }
    var lower = text.toLowerCase();
    var ranked = municipalities.slice().sort(function(a, b){
      return String(b.name || '').length - String(a.name || '').length;
    });
    var found = ranked.find(function(m) {
      var full = String(m.name || '').toLowerCase();
      var core = normalizeMunicipalityKey(m.name);
      return lower.indexOf(full) !== -1 || (core && lower.indexOf(core) !== -1);
    });
    return found || null;
  }
  function distanceKm(aLat, aLng, bLat, bLng) {
    function toRad(x){ return x * Math.PI / 180; }
    var R = 6371;
    var dLat = toRad(bLat - aLat);
    var dLon = toRad(bLng - aLng);
    var lat1 = toRad(aLat);
    var lat2 = toRad(bLat);
    var a = Math.sin(dLat/2)*Math.sin(dLat/2) + Math.sin(dLon/2)*Math.sin(dLon/2)*Math.cos(lat1)*Math.cos(lat2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  function parseBarangayFromLocationText(txt) {
    if (!txt) return '';
    var s = String(txt);
    var direct = s.match(/(?:Brgy\.?|Barangay)\s*[^,]+/i);
    if (direct && direct[0]) return direct[0].trim();
    var parts = s.split(',').map(function(p){ return p.trim(); });
    var hit = parts.find(function(p){ return /^(?:Brgy\.?|Barangay)\b/i.test(p); });
    if (hit) return hit;
    // fallback: look for token ending with 'Poblacion' or similar
    hit = parts.find(function(p){ return /\bPoblacion\b/i.test(p); });
    return hit || '';
  }

  function getReportLocationText(r) {
    if (!r) return '';
    var txt = String(r.location_text || r.location || r.address || '').trim();
    if (txt) return txt;
    var parts = [];
    if (r.barangay) parts.push(r.barangay);
    if (r.name) parts.push(r.name);
    return parts.join(', ');
  }

  function buildRouteHref(rLike) {
    if (!rLike) return '';
    var lat = Number(rLike.latitude);
    var lng = Number(rLike.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(String(lat) + ',' + String(lng)) + '&travelmode=driving';
    }
    var q = getReportLocationText(rLike);
    if (!q) return '';
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q);
  }

  function normalizeReportRow(row) {
    var locationText = row.location_text || row.location || row.address || '';
    var latitude = Number(row.latitude || row.lat || NaN);
    var longitude = Number(row.longitude || row.lng || row.long || NaN);
    var coverageLocation = (Number.isFinite(latitude) && Number.isFinite(longitude))
      ? findCoverageLocationByPoint(latitude, longitude)
      : null;
    var namedMunicipality = getMunicipalityByName(row.municipality || '');
    var matchedMunicipality = (coverageLocation && coverageLocation.municipality) ||
      (namedMunicipality && namedMunicipality.name) ||
      (findMunicipalityByLocationText(locationText) || {}).name ||
      row.municipality ||
      'Unknown';
    var barangayField = (coverageLocation && coverageLocation.barangay) ||
      row.barangay ||
      parseBarangayFromLocationText(locationText) ||
      '';
    var idVal = row.id || row.report_id || row._id || '';
    var uid = String(idVal || (String(row.created_at || row.createdAt || '') + '|' + matchedMunicipality + '|' + (barangayField || '') + '|' + (row.issue_type || row.issue || '')));
    return {
      id: uid,
      name: matchedMunicipality,
      issue: row.issue_type || row.issue || row.problem_type || 'Reported issue',
      barangay: barangayField || 'Not specified',
      location_text: locationText,
      fullName: row.full_name || row.name || 'Unknown reporter',
      contact: row.contact || row.phone || '',
      description: row.description || '',
      latitude: latitude,
      longitude: longitude,
      queueNumber: Number(row.queue_number || row.queueNumber || NaN),
      createdAt: row.created_at || row.createdAt || row.created || '',
      status: row.status || 'pending',
      isUrgent: isUrgentRow(row),
      assignedTeam: row.assigned_team || row.assignedTeam || ''
    };
  }

  // Notifications
  var notifBtn = document.getElementById('notif-btn');
  var notifDropdown = document.getElementById('notif-dropdown');
  var notifBadge = document.getElementById('notif-badge');
  var notifList = document.getElementById('notif-list');
  var notifEmpty = document.getElementById('notif-empty');
  var clearAllBtn = document.getElementById('notif-clear-all');
  function getReadNotifIds() {
    try {
      var raw = localStorage.getItem('readNotifIds');
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }
  function setReadNotifIds(ids) {
    try { localStorage.setItem('readNotifIds', JSON.stringify(Array.from(new Set(ids)).slice(-4000))); } catch(e){}
  }

  function markReportAsRead(reportId) {
    var id = String(reportId || '');
    if (!id) return;
    var read = getReadNotifIds();
    if (read.indexOf(id) === -1) {
      read.push(id);
      setReadNotifIds(read);
    }
    var active = getActiveNotifIds();
    var next = active.filter(function(x){ return String(x) !== id; });
    if (next.length !== active.length) setActiveNotifIds(next);
    rebuildActiveNotifications(window._dashboardLocations || []);
  }

  function markMunicipalityAsRead(mName, rows) {
    var muniName = String(mName || '');
    var muniKey = getMunicipalityIndexKey(mName || '');
    if (!muniKey) return;
    var list = Array.isArray(rows) ? rows : (window._dashboardLocations || []);
    var read = getReadNotifIds();
    var readSet = buildIdSet(read);
    var newlyReadIds = [];
    list.forEach(function(r) {
      if (!r) return;
      if (getMunicipalityIndexKey(r.name || '') !== muniKey) return;
      if (!isUnreadNewReportRow(r, readSet)) return;
      var id = String(r.id || '');
      if (id) newlyReadIds.push(id);
    });
    if (!newlyReadIds.length) {
      updateMunicipalityBlinkState(muniName);
      return;
    }
    newlyReadIds.forEach(function(id) {
      if (read.indexOf(id) === -1) read.push(id);
    });
    setReadNotifIds(read);
    var active = getActiveNotifIds();
    var next = active.filter(function(id) { return newlyReadIds.indexOf(String(id)) === -1; });
    if (next.length !== active.length) setActiveNotifIds(next);
    rebuildActiveNotifications(window._dashboardLocations || []);
    var newReadSet = buildIdSet(getReadNotifIds());
    list.forEach(function(r) {
      if (!r) return;
      if (getMunicipalityIndexKey(r.name || '') !== muniKey) return;
      var mk = reportMarkersById[String(r.id || '')];
      if (!mk) return;
      setMarkerBlink(mk, isUnreadNewReportRow(r, newReadSet));
    });
    updateMunicipalityBlinkState(muniName);
  }

  function markBarangayAsRead(mName, bName, rows) {
    var muniName = String(mName || '');
    var muniKey = getMunicipalityIndexKey(mName || '');
    if (!muniKey) return;
    var brgyKey = normalizeBarangayName(bName || '');
    if (!brgyKey) return;
    var list = Array.isArray(rows) ? rows : (window._dashboardLocations || []);
    var read = getReadNotifIds();
    var readSet = buildIdSet(read);
    var newlyReadIds = [];
    list.forEach(function(r) {
      if (!r) return;
      if (getMunicipalityIndexKey(r.name || '') !== muniKey) return;
      var brgy = resolveBarangayForReport(r) || r.barangay || '';
      if (normalizeBarangayName(brgy) !== brgyKey) return;
      if (!isUnreadNewReportRow(r, readSet)) return;
      var id = String(r.id || '');
      if (id) newlyReadIds.push(id);
    });
    if (!newlyReadIds.length) return;
    newlyReadIds.forEach(function(id) {
      if (read.indexOf(id) === -1) read.push(id);
    });
    setReadNotifIds(read);
    var active = getActiveNotifIds();
    var next = active.filter(function(id) { return newlyReadIds.indexOf(String(id)) === -1; });
    if (next.length !== active.length) setActiveNotifIds(next);
    rebuildActiveNotifications(window._dashboardLocations || []);
    var newReadSet = buildIdSet(getReadNotifIds());
    list.forEach(function(r) {
      if (!r) return;
      if (getMunicipalityIndexKey(r.name || '') !== muniKey) return;
      var brgy = resolveBarangayForReport(r) || r.barangay || '';
      if (normalizeBarangayName(brgy) !== brgyKey) return;
      var mk = reportMarkersById[String(r.id || '')];
      if (!mk) return;
      setMarkerBlink(mk, isUnreadNewReportRow(r, newReadSet));
    });
  }

  function updateMunicipalityBlinkState(mName) {
    var key = getMunicipalityIndexKey(mName || '');
    if (!key) return;
    var mk = municipalityMarkersIndex[key];
    if (!mk) return;
    var rows = window._dashboardLocations || [];
    var readSet = buildIdSet(getReadNotifIds());
    var hasUnread = rows.some(function(r) {
      if (!r) return false;
      if (getMunicipalityIndexKey(r.name || '') !== key) return false;
      if (isResolvedRow(r)) return false;
      var b = resolveBarangayForReport(r) || r.barangay || '';
      if (isPinHidden(r.name || '', b, r.id)) return false;
      if (!isDbPendingRow(r) && isBarangayRestored(r.name || '', b)) return false;
      return isUnreadNewReportRow(r, readSet);
    });
    setMarkerBlink(mk, hasUnread);
  }
  function toggleNotif(open) {
    if (!notifDropdown || !notifBtn) return;
    var isOpen = typeof open === 'boolean' ? open : !notifDropdown.classList.contains('is-open');
    notifDropdown.classList.toggle('is-open', isOpen);
    notifBtn.setAttribute('aria-expanded', String(isOpen));
  }
  if (notifBtn) {
    notifBtn.addEventListener('click', function(e){ e.stopPropagation(); toggleNotif(); });
    document.addEventListener('click', function(){ toggleNotif(false); });
  }
  if (clearAllBtn) {
    clearAllBtn.addEventListener('click', function(e){
      e.preventDefault();
      var read = getReadNotifIds();
      (window._lastNewRows || []).forEach(function(r){
        var id = String(r.id);
        if (read.indexOf(id) === -1) read.push(id);
      });
      setReadNotifIds(read);
      setActiveNotifIds([]);
      rebuildActiveNotifications(window._dashboardLocations || []);
    });
  }
  function getActiveNotifIds() {
    try {
      var raw = localStorage.getItem('activeNotifIds');
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }
  function setActiveNotifIds(ids) {
    try { localStorage.setItem('activeNotifIds', JSON.stringify(Array.from(new Set(ids)).slice(-2000))); } catch(e){}
  }
  function rebuildActiveNotifications(rows) {
    if (!Array.isArray(rows)) rows = [];
    var eligible = rows.filter(function(r){
      var n = r.name || 'Unknown';
      if (isResolvedRow(r)) return false;
      var b = resolveBarangayForReport(r) || r.barangay || '';
      if (!isDbPendingRow(r) && isBarangayRestored(n, b)) return false;
      if (isPinHidden(n, b, r.id)) return false;
      return isNewComplianceRow(r);
    });
    var readIds = getReadNotifIds();
    eligible = eligible.filter(function(r){ return readIds.indexOf(String(r.id)) === -1; });
    var idToRow = {};
    eligible.forEach(function(r){ idToRow[String(r.id)] = r; });
    var ids = getActiveNotifIds();
    var next = [];
    // keep existing ids that are still eligible
    ids.forEach(function(id){ if (idToRow[String(id)]) next.push(String(id)); });
    // add any new eligible ids
    eligible.forEach(function(r){ var id = String(r.id); if (next.indexOf(id) === -1) next.push(id); });
    setActiveNotifIds(next);
    var activeRows = next.map(function(id){ return idToRow[id]; }).filter(Boolean);
    updateNotifications(activeRows);
  }
  function formatTimeAgo(ts) {
    var t = new Date(ts).getTime();
    if (!isFinite(t)) return '';
    var d = Math.max(0, Date.now() - t);
    var mins = Math.floor(d/60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + 'm ago';
    var hrs = Math.floor(mins/60);
    if (hrs < 24) return hrs + 'h ago';
    var days = Math.floor(hrs/24);
    return days + 'd ago';
  }
  function updateNotifications(newRows) {
    if (!notifList || !notifBadge || !notifEmpty) return;
    window._lastNewRows = Array.isArray(newRows) ? newRows.slice() : [];
    var items = window._lastNewRows.slice().reverse();
    notifList.innerHTML = '';
    if (!items.length) {
      notifEmpty.innerHTML = '<div class="empty-title">No new reports</div>';
      notifEmpty.style.display = 'block';
      if (notifBadge) notifBadge.style.display = 'none';
      return;
    }
    notifEmpty.style.display = 'none';
    var sumEl = document.getElementById('notif-summary');
    if (sumEl) {
      var total = window._lastNewRows.length;
      var txt = (items.length === total) ? (items.length + ' new') : (items.length + ' of ' + total + ' new');
      sumEl.textContent = txt;
    }
    items.slice(0, 30).forEach(function(r){
      var brgy = resolveBarangayForReport(r) || r.barangay || '';
      var time = formatTimeAgo(r.createdAt);
      var div = document.createElement('div');
      div.className = 'notif-item';
      var leftCol = document.createElement('div');
      leftCol.className = 'notif-left';
      var title = document.createElement('div');
      title.className = 'notif-item-title';
      var titleText = document.createTextNode(r.name + ' · ' + brgy);
      title.appendChild(titleText);
      var issuePill = document.createElement('span');
      issuePill.className = 'notif-issue-pill';
      issuePill.textContent = r.issue;
      var sub = document.createElement('div');
      sub.className = 'notif-item-sub';
      sub.textContent = 'Reporter: ' + r.fullName;
      leftCol.appendChild(title);
      leftCol.appendChild(issuePill);
      leftCol.appendChild(sub);
      var rightCol = document.createElement('div');
      rightCol.className = 'notif-right';
      var timeEl = document.createElement('div');
      timeEl.className = 'notif-item-time';
      timeEl.textContent = time;
      var qBadge = document.createElement('span');
      qBadge.className = 'notif-queue-badge';
      var qVal = Number.isFinite(Number(r.queueNumber)) && Number(r.queueNumber) > 0
        ? Number(r.queueNumber)
        : ((window._queueOrderById && window._queueOrderById[r.id]) ? window._queueOrderById[r.id] : null);
      if (qVal) qBadge.textContent = String(qVal);
      var viewBtn = document.createElement('button');
      viewBtn.type = 'button';
      viewBtn.className = 'notif-view-btn';
      viewBtn.textContent = 'View';
      viewBtn.addEventListener('click', function(ev){
        ev.preventDefault();
        var mk = reportMarkersById[String(r.id)];
        if (!mk) {
          var key = getMunicipalityIndexKey(r.name || '') + '|' + normalizeBarangayName(brgy);
          mk = reportMarkersIndex[key];
        }
        if (window.map) {
          if (mk) {
            var ll = mk.getLatLng();
            window.map.setView(ll, 13);
            mk.openPopup();
            // keep notifications persistent and keep panel open
          } else {
            var muni = municipalities.find(function(mm){ return (mm.name||'').toLowerCase() === (r.name||'').toLowerCase(); });
            if (muni && Number.isFinite(Number(muni.lat)) && Number.isFinite(Number(muni.lng))) {
              var baseLat = Number(muni.lat), baseLng = Number(muni.lng);
              window.map.setView([baseLat, baseLng], 12);
              // keep notifications persistent and keep panel open
            }
          }
        }
      });
      rightCol.appendChild(qBadge);
      if (isOverdueRow(r)) {
        var sla = document.createElement('span');
        sla.className = 'notif-sla-badge';
        sla.textContent = '>24h';
        rightCol.appendChild(sla);
      }
      rightCol.appendChild(timeEl);
      rightCol.appendChild(viewBtn);
      var dismissBtn = document.createElement('button');
      dismissBtn.type = 'button';
      dismissBtn.className = 'notif-dismiss-btn';
      dismissBtn.textContent = 'Dismiss';
      dismissBtn.addEventListener('click', function(ev){
        ev.preventDefault();
        ev.stopPropagation();
        var read = getReadNotifIds();
        var id = String(r.id);
        if (read.indexOf(id) === -1) read.push(id);
        setReadNotifIds(read);
        var active = getActiveNotifIds().filter(function(x){ return String(x) !== id; });
        setActiveNotifIds(active);
        rebuildActiveNotifications(window._dashboardLocations || []);
      });
      rightCol.appendChild(dismissBtn);
      div.appendChild(leftCol);
      div.appendChild(rightCol);
      div.addEventListener('click', function(ev){
        ev.preventDefault();
        var mk = reportMarkersById[String(r.id)];
        if (!mk) {
          var key = getMunicipalityIndexKey(r.name || '') + '|' + normalizeBarangayName(brgy);
          mk = reportMarkersIndex[key];
        }
        if (window.map) {
          if (mk) {
            var ll = mk.getLatLng();
            window.map.setView(ll, 13);
            mk.openPopup();
          } else {
            var muni = municipalities.find(function(mm){ return (mm.name||'').toLowerCase() === (r.name||'').toLowerCase(); });
            if (muni && Number.isFinite(Number(muni.lat)) && Number.isFinite(Number(muni.lng))) {
              var baseLat = Number(muni.lat), baseLng = Number(muni.lng);
              window.map.setView([baseLat, baseLng], 12);
            }
          }
        }
      });
      notifList.appendChild(div);
    });
    var totalForBadge = window._lastNewRows ? window._lastNewRows.length : items.length;
    notifBadge.textContent = String(totalForBadge);
    notifBadge.style.display = totalForBadge > 0 ? 'inline-flex' : 'none';
  }

  function renderReportMarkers(rows) {
    refreshNewestUnresolvedFlag(rows);
    var readSet = buildIdSet(getReadNotifIds());
    reportMarkersLayer.clearLayers();
    reportMarkersIndex = {};
    reportMarkersById = {};
    rows.forEach(function(r) {
      var rb = resolveBarangayForReport(r) || r.barangay || '';
      if (isPinHidden(r.name || '', rb, r.id)) return;
      if (isResolvedRow(r)) return;
      var lat = Number(r.latitude);
      var lng = Number(r.longitude);
      var normalizedMunicipality = getMunicipalityByName(r.name || '') || getMunicipalityByKey(r.name || '');
      var coverageLocation = findCoverageLocationByPoint(lat, lng);
      var displayMunicipality = (normalizedMunicipality && normalizedMunicipality.name) ||
        (coverageLocation && coverageLocation.municipality) ||
        (r.name || '');
      var rb = rb;
      if (!isDbPendingRow(r) && !isResolvedRow(r) && isBarangayRestored(r.name || '', rb)) return;
      // Fallback: if no precise GPS, place near municipality center with deterministic offset per barangay
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        var brgyForPos = rb || r.barangay || '';
        if (!brgyForPos) {
          var locText = getReportLocationText(r);
          var pb = parseBarangayFromLocationText(locText);
          if (pb) brgyForPos = pb;
        }
        var ll2 = getFallbackLatLngForBarangay(displayMunicipality || r.name || '', brgyForPos, String(r.id || '') + '|' + String(r.createdAt || ''));
        if (!ll2) return;
        lat = ll2[0];
        lng = ll2[1];
      }
      var isRestored = false;
      var statusKey = getStatusKey(r);
      var assignedTeam = getAssignedTeamForRow(r);
      var isNewReport = isNewComplianceRow(r);
      var iconForRow = statusKey === 'ontheway' ? pendingIcon : (isNewReport ? newIcon : pendingIcon);
      var marker = L.marker([lat, lng], { icon: iconForRow }).addTo(reportMarkersLayer);
      setMarkerBlink(marker, isUnreadNewReportRow(r, readSet));
      var municipalityKey = getMunicipalityIndexKey(displayMunicipality || r.name || '');
      if (municipalityKey && !municipalityMarkersIndex[municipalityKey]) {
        municipalityMarkersIndex[municipalityKey] = marker;
      }
      var idxKey = municipalityKey + '|' + normalizeBarangayName(rb);
      reportMarkersIndex[idxKey] = marker;
      reportMarkersById[String(r.id)] = marker;
      // determine restored status for this municipality name
      var statusText = statusKey === 'ontheway' ? 'On The Way' : 'Pending';
      var statusColor = statusKey === 'ontheway' ? '#f97316' : (isNewReport ? '#dc2626' : '#f97316');
      var slaBadge2 = '';
      try {
        if (isOverdueRow(r)) {
          slaBadge2 = ' <span style="display:inline-block; margin-left:6px; background:#b91c1c; color:#fff; padding:2px 6px; border-radius:10px;">>24h Overdue</span>';
        }
      } catch(e){}
      var statusLine = '<br><span style="color:' + statusColor + ';">Status: ' + statusText + '</span>' + slaBadge2;
      var queueBadgeLine = '';
      if (statusKey === 'pending' && isNewComplianceRow(r)) {
        try {
          var qVal = (Number.isFinite(Number(r.queueNumber)) && Number(r.queueNumber) > 0)
            ? Number(r.queueNumber)
            : ((window._queueOrderById && window._queueOrderById[r.id]) || null);
          if (qVal) {
            queueBadgeLine = ' <span style="display:inline-block; margin-left:6px; color:#1a1512; background:#fde68a; border:1px solid #fcd34d; padding:2px 6px; border-radius:10px; font-weight:700;">#' + qVal + '</span>';
          }
        } catch(e){}
      }
      var pendingLockedRow = isPendingAssignmentLocked(r);
      var teamSelRow = (isRestored || !canManage()) ? '' : (buildTeamSelectLabelHtml(pendingLockedRow, assignedTeam) + buildPendingAssignButtonHtml(r, isRestored));
      var resolveToggleClass = isRestored ? 'map-popup-btn-warning' : 'map-popup-btn-success';
      var resolveToggleRow = canManage() ? ('<button type="button" class="resolve-toggle-row map-popup-btn ' + resolveToggleClass + '">' + (isRestored ? 'Mark as Pending' : 'Mark as Resolved') + '</button>') : '';
      var assignedRow = assignedTeam;
      var locationLine = getReportLocationText(r);
      var coordsLine = (Number.isFinite(lat) && Number.isFinite(lng)) ? ('<br><small>Coordinates: ' + lat.toFixed(6) + ', ' + lng.toFixed(6) + '</small>') : '';
      var routeHref2 = buildRouteHref({ latitude: lat, longitude: lng, location_text: locationLine, name: r.name, barangay: rb });
      var routeLink2 = (statusKey === 'ontheway' && !isRestored)
        ? ('<button type="button" class="show-route-map map-popup-btn map-popup-btn-primary">Show Route on Map</button>' +
          (routeHref2 ? '<a href="' + routeHref2 + '" target="_blank" rel="noopener noreferrer" class="open-route map-popup-btn map-popup-btn-ghost">Open in Google Maps</a>' : ''))
        : '';
      marker.bindPopup(
        '<div class="map-popup">' +
          '<div class="map-popup-title">' + displayMunicipality + '</div>' +
          '<div class="map-popup-sub">' + (rb || r.barangay || '') + '</div>' +
          '<div class="map-popup-issue">' + r.issue + queueBadgeLine + '</div>' +
          '<div class="map-popup-status" style="color:' + statusColor + ';">Status: ' + statusText + '</div>' +
          (slaBadge2 ? ('<div class="map-popup-note">' + slaBadge2 + '</div>') : '') +
          (locationLine ? '<div class="map-popup-meta">Location: ' + locationLine + '</div>' : '') +
          (coordsLine ? ('<div class="map-popup-meta">' + coordsLine.replace('<br><small>', '').replace('</small>', '') + '</div>') : '') +
          (assignedRow ? '<div class="map-popup-meta">Assigned: ' + assignedRow + '</div>' : '') +
          teamSelRow + resolveToggleRow +
          '<div class="map-popup-actions">' + routeLink2 + '<button type="button" class="view-records map-popup-btn map-popup-btn-primary">View in Records</button>' + (canManage() ? '<button type="button" class="hide-pin map-popup-btn map-popup-btn-danger">Hide this pin</button>' : '') + '</div>' +
          '<div class="map-popup-meta">Reporter: ' + r.fullName + (r.contact ? ' (' + r.contact + ')' : '') + '</div>' +
        '</div>'
      );
      // clicking the red (hazard) marker should take user to the report page
      marker.on('click', function() {
        clearRouteLineIfDifferentOwner('report:' + String(r.id || ''));
        if (isUnreadNewReportRow(r, buildIdSet(getReadNotifIds()))) {
          markReportAsRead(r.id);
        }
        setMarkerBlink(marker, false);
        updateMunicipalityBlinkState(displayMunicipality || '');
        if (window.map) window.map.setView([lat, lng], 13);
        marker.openPopup();
      });
      marker.on('popupopen', function(e) {
        clearRouteLineIfDifferentOwner('report:' + String(r.id || ''));
        if (isUnreadNewReportRow(r, buildIdSet(getReadNotifIds()))) {
          markReportAsRead(r.id);
        }
        setMarkerBlink(marker, false);
        updateMunicipalityBlinkState(displayMunicipality || '');
        var container = e.popup.getElement();
        if (container && typeof L !== 'undefined' && L.DomEvent) {
          L.DomEvent.disableClickPropagation(container);
          L.DomEvent.disableScrollPropagation(container);
        }
        revealMunicipalitiesPanel(displayMunicipality, { openBarangays: true, collapseOthers: true });
        var teamSelectEl = container.querySelector('.team-select');
        if (teamSelectEl) {
          // No longer auto-setting a single value since it's an "Add team" dropdown
          teamSelectEl.value = "";
        }
        // Always unlock for admins so they can add more teams
        if (canManage()) {
          // ensure controls are not locked for adding more
        } else if (isPendingAssignmentLocked(r)) {
          lockPendingAssignControls(container, getAssignedTeamForRow(r));
        }
        if (container && container.getAttribute('data-popup-actions-bound') !== '1') {
          container.setAttribute('data-popup-actions-bound', '1');
          var lastFireTs = 0;
          var onAction = async function(ev) {
            var tgt = ev && ev.target && ev.target.closest ? ev.target.closest('button, a') : null;
            if (!tgt || !container.contains(tgt)) return;
            if (tgt.disabled || tgt.getAttribute('aria-disabled') === 'true') return;
            if (!tgt.classList.contains('pending-assign') &&
                !tgt.classList.contains('show-route-map') &&
                !tgt.classList.contains('resolve-toggle-row') &&
                !tgt.classList.contains('hide-pin') &&
                !tgt.classList.contains('view-records')) {
              return;
            }
            var nowTs = Date.now();
            if (nowTs - lastFireTs < 120) return;
            lastFireTs = nowTs;
            ev.preventDefault();
            ev.stopPropagation();

            if (tgt.classList.contains('pending-assign')) {
              if (!canManage() || !teamSelectEl) return;
              var currentT = String(getAssignedTeamForRow(r) || '').trim();
              var newT = teamSelectEl.value || '';
              
              if (!newT) {
                newT = getFirstAvailableTeam();
                if (newT) teamSelectEl.value = newT;
              }
              
              if (!newT) {
                alert('No teams are currently available. All teams are busy with other reports.');
                return;
              }

              // Combine existing teams with the newly selected one
              var finalTeams = currentT;
              if (currentT) {
                // Check if already assigned
                var existingTeamsArr = currentT.split(',').map(function(s){ return s.trim(); });
                if (existingTeamsArr.indexOf(newT) === -1) {
                  finalTeams = currentT + ', ' + newT;
                }
              } else {
                finalTeams = newT;
              }

              try { await setReportStatusById(r.id, 'ontheway', finalTeams); } catch (err) {
                console.error(err);
                alert(buildStatusUpdateErrorMessage(err));
                return;
              }
              lockPendingAssignControls(container, finalTeams);
              setActiveRouteOwner('report:' + String(r.id || ''));
              drawRouteFromAdminTo(lat, lng);
              loadReportsFromSupabase();
              return;
            }
            if (tgt.classList.contains('hide-pin')) {
              if (!canManage()) return;
              hidePin(r.name || '', rb || '', r.id || '');
              try {
                var arr = JSON.parse(localStorage.getItem('auditLogs') || '[]');
                var who = localStorage.getItem('userName') || 'User';
                arr.push({ ts: new Date().toISOString(), who: who, type: 'hide_pin', data: { municipality: r.name, barangay: rb }, summary: 'Hid pin ' + (r.name||'') + ' – ' + (rb||'') });
                if (arr.length > 500) arr = arr.slice(arr.length - 500);
                localStorage.setItem('auditLogs', JSON.stringify(arr));
              } catch(e){}
              if (window._dashboardLocations) {
                renderMunicipalityMarkers(window._dashboardLocations);
                renderReportMarkers(window._dashboardLocations);
                updateSidebarBadges(window._dashboardLocations);
                updateBarangayHighlights(window._dashboardLocations);
                applyIssuesFilter();
                rebuildActiveNotifications(window._dashboardLocations);
              }
              return;
            }
            if (tgt.classList.contains('show-route-map')) {
              setActiveRouteOwner('report:' + String(r.id || ''));
              drawRouteFromAdminTo(lat, lng);
              return;
            }
            if (tgt.classList.contains('view-records')) {
              var params = new URLSearchParams();
              if (r.name) params.set('location', r.name + (r.barangay ? ' ' + r.barangay : ''));
              if (r.issue) params.set('issue', r.issue);
              window.location.href = 'records.html?' + params.toString();
              return;
            }
            if (tgt.classList.contains('resolve-toggle-row')) {
              if (!canManage()) return;
              try {
                var nextStatus = isResolvedRow(r) ? 'pending' : 'resolved';
                var teamForSave = getTeamForStatusUpdate(r, teamSelectEl);
                await setReportStatusById(r.id, nextStatus, teamForSave);
                if (String(nextStatus).toLowerCase() === 'resolved') clearRouteLine();
                loadReportsFromSupabase();
              } catch (err) {
                console.error(err);
                alert(buildStatusUpdateErrorMessage(err));
              }
            }
          };
          container.addEventListener('click', onAction, true);
        }
      });
    });
    // If a deep-link target exists, try to open it now
    if (_pendingOpenTarget && (_pendingOpenTarget.reportId || _pendingOpenTarget.key)) {
      var mk = null;
      if (_pendingOpenTarget.reportId) {
        mk = reportMarkersById[String(_pendingOpenTarget.reportId)] || null;
      }
      if (!mk && _pendingOpenTarget.key) {
        mk = reportMarkersIndex[_pendingOpenTarget.key];
      }
      if (window.map) {
        if (mk) {
          var ll = mk.getLatLng();
          window.map.setView(ll, 13);
          mk.openPopup();
        } else if (_pendingOpenTarget.key) {
          // fallback: use municipality center with small offset
          var parts = _pendingOpenTarget.key.split('|');
          var mName = _pendingOpenTarget.mName || parts[0] || '';
          var bName = _pendingOpenTarget.bName || parts[1] || '';
          var ll2 = getFallbackLatLngForBarangay(mName, bName, 'deeplink');
          if (ll2 && window.map) {
            window.map.setView(ll2, 13);
            var muni = getMunicipalityByName(mName) || getMunicipalityByKey(mName) || {};
            L.popup()
              .setLatLng(ll2)
              .setContent('<strong>' + ((muni && muni.name) ? muni.name : mName) + '</strong><br>' + (bName || ''))
              .openOn(window.map);
          }
        }
      }
      _pendingOpenTarget = null;
    }
  }

  async function fetchAllReports(cfg) {
    var pageSize = 1000;
    var offset = 0;
    var out = [];
    while (true) {
      var url = cfg.url + '/rest/v1/' + cfg.reportsTable + '?select=*&order=created_at.desc&limit=' + pageSize + '&offset=' + offset;
      var res = await fetch(url, {
        headers: {
          apikey: cfg.anonKey,
          Authorization: 'Bearer ' + cfg.anonKey
        }
      });
      if (!res.ok) throw new Error('Supabase fetch failed: ' + res.status);
      var rows = await res.json();
      if (!Array.isArray(rows) || !rows.length) break;
      out = out.concat(rows);
      if (rows.length < pageSize) break;
      offset += pageSize;
    }
    return out;
  }

  async function loadReportsFromSupabase() {
    var cfg = window.SAMELCO_SUPABASE || {};
    if (!cfg.url || !cfg.anonKey || !cfg.reportsTable) return;
    try {
      var rows = await fetchAllReports(cfg);

      // Update the count of total reports (red pins)
      var totalReports = Array.isArray(rows) ? rows.length : 0;
      var countEl = document.getElementById('total-reports-count');
      if (countEl) {
        countEl.textContent = totalReports;
      }

      if (!Array.isArray(rows) || !rows.length) {
        return [];
      }

      var normalized = rows.map(normalizeReportRow);
      // rebuild persistent notifications based on current unassigned issues
      localStorage.setItem('problemLocations', JSON.stringify(normalized.filter(function(n){
        return !isResolvedRow(n);
      }).map(function(n) {
        return { name: n.name, issue: n.issue, barangay: n.barangay };
      })));

      // cache for use when user toggles restored status
      window._dashboardLocations = normalized;
      renderMunicipalityMarkers(normalized);
      // compute queue numbers and update sidebar first
      updateBarangayHighlights(normalized);
      // then render markers so popups can show numbers
      renderReportMarkers(normalized);
      updateSidebarBadges(normalized);
      applyIssuesFilter();
      rebuildActiveNotifications(normalized);
      triggerAlarmIfActive(normalized);
      maybeShowUrgentReportModal(normalized);
      if (_forceAlarmFromUrl) {
        _forceAlarmFromUrl = false;
        playAlarmNowFromLink();
      }
      return normalized;
    } catch (err) {
      console.warn('Unable to load reports from Supabase:', err.message || err);
      return [];
    }
  }

  localStorage.setItem('problemLocations', JSON.stringify([]));
  renderMunicipalityMarkers([]);
  window.map = map;
  if (map && typeof map.on === 'function') {
    map.on('popupopen', function() {});
    map.on('popupclose', function() {});
    map.on('click', function() {});
  }
  loadTeamsFromSupabase().finally(function() {
    loadReportsFromSupabase();
    setInterval(function(){ loadReportsFromSupabase(); }, 30000);
  });

  function updateSidebarBadges(rows) {
    var list = document.getElementById('municipalities-sidebar-list');
    if (!list) return;
    var byNameNew = {};
    var byNameOnTheWay = {};
    rows.forEach(function(r) {
      var n = getMunicipalityIndexKey(r.name || 'Unknown');
      if (isResolvedRow(r)) return;
      var bCand = resolveBarangayForReport(r) || r.barangay || '';
      if (!isDbPendingRow(r) && isBarangayRestored(r.name || '', bCand)) return;
      if (!byNameNew[n]) byNameNew[n] = 0;
      if (!byNameOnTheWay[n]) byNameOnTheWay[n] = 0;
      if (isOnTheWayRow(r) || getAssignedTeamForRow(r)) byNameOnTheWay[n] += 1;
      else if (isNewComplianceRow(r)) byNameNew[n] += 1;
    });
    var totalNew = 0, totalOnTheWay = 0;
    list.querySelectorAll('.sidebar-municipality-item').forEach(function(it) {
      var name = getMunicipalityIndexKey(it.getAttribute('data-name') || '');
      var newBadge = it.querySelector('.issue-badge.new');
      var pendingBadge = it.querySelector('.issue-badge.pending');
      var nCount = byNameNew[name] || 0;
      var pCount = byNameOnTheWay[name] || 0;
      it.classList.toggle('has-issue', (nCount + pCount) > 0);
      if (newBadge) {
        if (nCount > 0) {
          newBadge.style.display = 'inline-block';
          newBadge.textContent = 'New Compliance ' + nCount;
          totalNew += nCount;
        } else {
          newBadge.style.display = 'none';
          newBadge.textContent = '';
        }
      }
      if (pendingBadge) {
        if (pCount > 0) {
          pendingBadge.style.display = 'inline-block';
          pendingBadge.textContent = 'On The Way ' + pCount;
          totalOnTheWay += pCount;
        } else {
          pendingBadge.style.display = 'none';
          pendingBadge.textContent = '';
        }
      }
    });
    var sumEl = document.getElementById('issues-summary');
    if (sumEl) {
      var parts = [];
      if (totalNew) parts.push('New Compliance ' + totalNew);
      if (totalOnTheWay) parts.push('On The Way ' + totalOnTheWay);
      sumEl.textContent = parts.join(' · ');
    }
  }

  function normalizeBarangayName(s) {
    if (!s) return '';
    var x = String(s).toLowerCase();
    x = x.replace(/brgy\.?\s*/g, 'barangay ');
    x = x.replace(/barangay\s+/g, '');
    x = x.replace(/\./g, '');
    // Map numeric barangay labels like "no 1" to "poblacion 1"
    x = x.replace(/^no\s*(\d+)$/i, 'poblacion $1');
    x = x.replace(/\s+/g, ' ').trim();
    return x;
  }

  function resolveBarangayForReport(r) {
    var mName = r.name || '';
    var coverageLocation = findCoverageLocationByPoint(Number(r.latitude), Number(r.longitude));
    if (coverageLocation && coverageLocation.barangay) {
      if (!mName || normalizeMunicipalityKey(coverageLocation.municipality) === normalizeMunicipalityKey(mName)) {
        return coverageLocation.barangay;
      }
    }
    var m = getMunicipalityByName(mName) || getMunicipalityByKey(mName);
    if (!m || !Array.isArray(m.barangays)) return '';
    // Build normalized set for municipality barangays
    var normSet = {};
    m.barangays.forEach(function(b){ normSet[normalizeBarangayName(b)] = b; });
    // Collect candidates from report
    var candidates = [];
    if (r.barangay) candidates.push(r.barangay);
    if (r.location_text) candidates.push(r.location_text);
    if (r.address) candidates.push(r.address);
    // Add direct parse from location text
    if (r.location_text) {
      var parsed = parseBarangayFromLocationText(r.location_text);
      if (parsed) candidates.unshift(parsed);
      // also try comma-separated tokens
      r.location_text.split(',').forEach(function(tok){ candidates.push(tok.trim()); });
    }
    // Try to match any candidate to municipality barangays
    for (var i=0;i<candidates.length;i++){
      var norm = normalizeBarangayName(candidates[i]);
      if (norm && normSet[norm]) return normSet[norm];
    }
    return '';
  }

  function updateBarangayHighlights(rows) {
    var list = document.getElementById('municipalities-sidebar-list');
    if (!list) return;
    var onlyIssues = isActiveReportsSidebarFilter();
    var readSet = buildIdSet(getReadNotifIds());
    // Build queue numbers for "New" items: global and per-municipality (earliest first)
    var orderById = {};
    var orderByMunicipality = {};
    var orderByBrgy = {};
    try {
      var newRows = [];
      rows.forEach(function(r){
        var m = r.name || 'Unknown';
        if (isResolvedRow(r)) return;
        var b = resolveBarangayForReport(r) || r.barangay || '';
        if (!isDbPendingRow(r) && isBarangayRestored(m, b)) return;
        if (isNewComplianceRow(r)) newRows.push(r);
      });
      var sortedAll = newRows.slice().sort(function(a,b){
        var ta = new Date(a.createdAt).getTime(); if (!isFinite(ta)) ta = Number.MAX_SAFE_INTEGER;
        var tb = new Date(b.createdAt).getTime(); if (!isFinite(tb)) tb = Number.MAX_SAFE_INTEGER;
        if (ta !== tb) return ta - tb;
        var ia = String(a.id||''); var ib = String(b.id||''); return ia.localeCompare(ib);
      });
      for (var i=0;i<sortedAll.length;i++){ orderById[sortedAll[i].id] = i+1; }
      var muniGroups = {};
      newRows.forEach(function(r){
        var key = getMunicipalityIndexKey(r.name || 'Unknown');
        if (!muniGroups[key]) muniGroups[key] = [];
        muniGroups[key].push(r);
      });
      Object.keys(muniGroups).forEach(function(k){
        var arr = muniGroups[k].slice().sort(function(a,b){
          var ta = new Date(a.createdAt).getTime(); if (!isFinite(ta)) ta = Number.MAX_SAFE_INTEGER;
          var tb = new Date(b.createdAt).getTime(); if (!isFinite(tb)) tb = Number.MAX_SAFE_INTEGER;
          if (ta !== tb) return ta - tb;
          var ia = String(a.id||''); var ib = String(b.id||''); return ia.localeCompare(ib);
        });
        orderByMunicipality[k] = {};
        for (var i=0;i<arr.length;i++){ orderByMunicipality[k][arr[i].id] = i+1; }
      });
      newRows.forEach(function(r){
        var b = resolveBarangayForReport(r) || r.barangay || '';
        var key = getMunicipalityIndexKey(r.name || '') + '|' + normalizeBarangayName(b);
        var q = orderById[r.id]; // use global queue for unique numbering across all municipalities
        if (q) {
          if (!orderByBrgy[key] || q < orderByBrgy[key]) orderByBrgy[key] = q;
        }
      });
    } catch(e){}
    window._queueOrderByBrgy = orderByBrgy;
    window._queueOrderById = orderById;
    window._queueOrderByMunicipality = orderByMunicipality;
    var newByMunicipality = {};
    var onTheWayByMunicipality = {};
    var assignedByBrgyKey = {};
    rows.forEach(function(r) {
      var m = getMunicipalityIndexKey(r.name || 'Unknown');
      if (isResolvedRow(r)) return;
      var b = resolveBarangayForReport(r) || r.barangay || '';
      if (!isDbPendingRow(r) && isBarangayRestored(r.name || '', b)) return;
      var statusKey = getStatusKey(r);
      var statusIsOnTheWay = isOnTheWayRow(r) || !!getAssignedTeamForRow(r);
      var statusIsNew = !statusIsOnTheWay && isNewComplianceRow(r);
      if (!statusIsNew && !statusIsOnTheWay) return;
      var assignedTeam = getAssignedTeamForRow(r);
      var brgyKey = (m || '').toLowerCase() + '|' + normalizeBarangayName(b);
      if (assignedTeam) {
        if (assignedByBrgyKey[brgyKey] && assignedByBrgyKey[brgyKey] !== assignedTeam) assignedByBrgyKey[brgyKey] = 'Multiple';
        else assignedByBrgyKey[brgyKey] = assignedTeam;
      }
      if (statusIsNew) {
        if (!newByMunicipality[m]) newByMunicipality[m] = new Set();
        newByMunicipality[m].add(normalizeBarangayName(b));
      } else if (statusIsOnTheWay) {
        if (!onTheWayByMunicipality[m]) onTheWayByMunicipality[m] = new Set();
        onTheWayByMunicipality[m].add(normalizeBarangayName(b));
      }
    });
    list.querySelectorAll('.sidebar-municipality-item').forEach(function(it) {
      var mName = it.getAttribute('data-name');
      var mKey = getMunicipalityIndexKey(mName || '');
      var setNew = newByMunicipality[mKey] || new Set();
      var setPending = onTheWayByMunicipality[mKey] || new Set();
      var anyMarked = false;
      var firstMarked = null;
      it.querySelectorAll('.barangay-item-sidebar').forEach(function(bItem) {
        var currentText = bItem.childNodes.length ? bItem.childNodes[0].textContent : bItem.textContent || '';
        var rawName = currentText;
        var label = normalizeBarangayName(currentText);
        var isNewMark = setNew.has(label);
        var isPendingMark = !isNewMark && setPending.has(label);
        bItem.classList.toggle('barangay-new', isNewMark);
        bItem.classList.toggle('barangay-pending', isPendingMark);
        bItem.style.display = (!onlyIssues || isNewMark || isPendingMark) ? '' : 'none';
        var statusBadge = bItem.querySelector('.status-badge');
        if (statusBadge) statusBadge.remove();
        var assignChip = bItem.querySelector('.assignment-chip');
        if (assignChip) assignChip.remove();
        var existingBtn = bItem.querySelector('.restore-one-btn');
        if (isNewMark) {
          var badge = document.createElement('span');
          badge.className = 'issue-badge new status-badge';
          var qKey = mKey + '|' + label;
          var qVal = orderByBrgy[qKey];
          badge.textContent = qVal ? ('New #' + qVal) : 'New';
          bItem.appendChild(badge);
        } else if (isPendingMark) {
          var badgeP = document.createElement('span');
          badgeP.className = 'issue-badge pending status-badge';
          badgeP.textContent = 'On The Way';
          bItem.appendChild(badgeP);
          // Show assignment team beside Pending
          var teamNow = assignedByBrgyKey[mKey + '|' + label] || '';
          var chip = document.createElement('span');
          chip.className = 'assignment-chip';
          chip.textContent = 'Assigned: ' + (teamNow || 'Unassigned');
          chip.style.cssText = 'margin-left:8px; font-size:0.72rem; color:#1f2937; background:#e5e7eb; border:1px solid #d1d5db; padding:1px 6px; border-radius:10px;';
          bItem.appendChild(chip);
        } else {
          if (existingBtn) existingBtn.remove();
        }
        if ((isNewMark || isPendingMark) && !bItem.getAttribute('data-click-bound')) {
          bItem.setAttribute('data-click-bound', '1');
          bItem.style.cursor = 'pointer';
          bItem.addEventListener('click', function(ev) {
            ev.stopPropagation();
            markBarangayAsRead(mName, rawName, rows);
            var key = getMunicipalityIndexKey(mName || '') + '|' + label;
            var mk = reportMarkersIndex[key];
              if (window.map) {
                if (mk) {
                  var ll = mk.getLatLng();
                  window.map.setView(ll, 13);
                  mk.openPopup();
                } else {
                  // Fallback: position near municipality center using deterministic offset from barangay label
                  var ll2 = getFallbackLatLngForBarangay(mName, rawName, 'sidebar');
                  if (ll2) {
                    window.map.setView(ll2, 13);
                    revealMunicipalitiesPanel(mName, { openBarangays: true, collapseOthers: true });
                    var muni = getMunicipalityByName(mName) || getMunicipalityByKey(mName) || {};
                    L.popup()
                      .setLatLng(ll2)
                      .setContent('<strong>' + ((muni && muni.name) ? muni.name : mName) + '</strong><br>' + rawName + '<br><small>No precise marker found</small>')
                      .openOn(window.map);
                  }
                }
              }
              try {
                var sp = new URLSearchParams(window.location.search);
                sp.set('municipality', mName);
                sp.set('barangay', rawName);
                history.replaceState(null, '', window.location.pathname + '?' + sp.toString());
              } catch (e) {}
          });
        }
        if (!firstMarked && (isNewMark || isPendingMark)) firstMarked = bItem;
        if (isNewMark || isPendingMark) anyMarked = true;
      });
      // Keep barangay lists collapsed by default; do not auto-open even if marked
    });

    if (onlyIssues) {
      var latest = null;
      var latestTs = -Infinity;
      rows.forEach(function(r) {
        if (!r || isResolvedRow(r)) return;
        var m = r.name || 'Unknown';
        var b = resolveBarangayForReport(r) || r.barangay || '';
        if (!isDbPendingRow(r) && isBarangayRestored(m, b)) return;
        if (isPinHidden(m, b, r.id)) return;
        if (!isUnreadNewReportRow(r, readSet)) return;
        var t = Date.parse(r.createdAt || '');
        if (!isFinite(t)) t = -Infinity;
        if (t > latestTs) {
          latestTs = t;
          latest = r;
        }
      });
      var latestId = latest ? String(latest.id || '') : '';
      if (latestId && latestId !== String(window._lastSidebarAutoFocusId || '')) {
        window._lastSidebarAutoFocusId = latestId;
        var mName = latest.name || 'Unknown';
        var bName = resolveBarangayForReport(latest) || latest.barangay || '';
        var matched = revealMunicipalitiesPanel(mName, { openBarangays: true, collapseOthers: true });
        if (matched) {
          var targetNorm = normalizeBarangayName(bName);
          var bItems = matched.querySelectorAll('.barangay-item-sidebar');
          for (var i = 0; i < bItems.length; i++) {
            var el = bItems[i];
            var txt = el.childNodes.length ? el.childNodes[0].textContent : el.textContent || '';
            if (normalizeBarangayName(txt) === targetNorm) {
              el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
              break;
            }
          }
        }
      }
    }
  }

  function applyIssuesFilter() {
    var list = document.getElementById('municipalities-sidebar-list');
    if (!list) return;
    var onlyIssues = isActiveReportsSidebarFilter();
    var rows = window._dashboardLocations || [];
    var byNameCounts = {};
    rows.forEach(function(r) {
      var n = getMunicipalityIndexKey(r.name || 'Unknown');
      if (isResolvedRow(r)) return;
      var bCand = resolveBarangayForReport(r) || r.barangay || '';
      if (!isDbPendingRow(r) && isBarangayRestored(r.name || '', bCand)) return;
      if (!isSidebarIssueRow(r)) return;
      if (!byNameCounts[n]) byNameCounts[n] = 0;
      byNameCounts[n] += 1;
    });
    list.querySelectorAll('.sidebar-municipality-item').forEach(function(it) {
      var name = getMunicipalityIndexKey(it.getAttribute('data-name') || '');
      var count = byNameCounts[name] || 0;
      var show = !onlyIssues || count > 0;
      it.style.display = show ? '' : 'none';
    });
  }

  var issuesToggle = document.getElementById('issues-only-toggle');
  if (issuesToggle) {
    issuesToggle.addEventListener('change', function() {
      applyIssuesFilter();
    });
  }

  // Populate municipalities grid
  var municipalitiesList = document.getElementById('municipalities-list');
  if (municipalitiesList) {
    municipalities.forEach(function(m) {
      var card = document.createElement('div');
      card.className = 'municipality-card';
      var barangayCount = Array.isArray(m.barangays) ? m.barangays.length : m.barangays;
      card.innerHTML = '<h3>' + m.name + '</h3><p>' + barangayCount + ' Barangays</p><div class="barangay-list" style="display:none;"></div>';
      
      card.addEventListener('click', function() {
        var barangayList = this.querySelector('.barangay-list');
        var isOpen = barangayList.style.display === 'block';
        
        // Close all other cards
        document.querySelectorAll('.barangay-list').forEach(function(list) {
          list.style.display = 'none';
        });
        
        if (!isOpen && Array.isArray(m.barangays)) {
          barangayList.innerHTML = '<ul>' + m.barangays.map(function(b) { return '<li>' + b + '</li>'; }).join('') + '</ul>';
          barangayList.style.display = 'block';
        }
      });
      
      municipalitiesList.appendChild(card);
    });
  }
});
