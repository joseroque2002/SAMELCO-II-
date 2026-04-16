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

  document.getElementById('user-name').textContent = userName;
  var cfg = window.SAMELCO_SUPABASE || {};

  // Get problem locations from localStorage (set by dashboard or previous visits)
  var problemLocations = [];
  try {
    var stored = localStorage.getItem('problemLocations');
    if (stored) {
      problemLocations = JSON.parse(stored);
    }
  } catch (e) {
    console.error('Error parsing problem locations:', e);
  }

  var pendingAssignments = {};
  function loadPendingAssignments() {
    try {
      var storedPA = localStorage.getItem('pendingAssignments');
      if (storedPA) {
        pendingAssignments = JSON.parse(storedPA) || {};
      } else {
        pendingAssignments = {};
      }
    } catch (e) {
      pendingAssignments = {};
    }
  }
  loadPendingAssignments();

  var hiddenPins = {};
  try { hiddenPins = JSON.parse(localStorage.getItem('hiddenPins') || '{}') || {}; } catch(e){ hiddenPins = {}; }
  var restoredBarangays = {};
  try { restoredBarangays = JSON.parse(localStorage.getItem('restoredBarangays') || '{}') || {}; } catch(e){ restoredBarangays = {}; }
  function normalizeBarangayName(s) {
    if (!s) return '';
    var x = String(s).toLowerCase();
    x = x.replace(/brgy\.?\s*/g, 'barangay ');
    x = x.replace(/barangay\s+/g, '');
    x = x.replace(/\./g, '');
    x = x.replace(/^no\s*(\d+)$/i, 'poblacion $1');
    x = x.replace(/\s+/g, ' ').trim();
    return x;
  }
  function getPinKey(mName, bName) {
    return (String(mName||'').toLowerCase() + '|' + normalizeBarangayName(bName||''));
  }
  function isPinHidden(mName, bName) {
    return !!hiddenPins[getPinKey(mName, bName)];
  }
  function isBarangayRestored(mName, bName) {
    var bucket = restoredBarangays[mName] || {};
    return !!bucket[normalizeBarangayName(bName)];
  }
  var muniDataset = Array.isArray(window.SAMELCO_MUNICIPALITIES) ? window.SAMELCO_MUNICIPALITIES : [];
  var excludedSet = (function(){
    var arr = ['calbayog city','tarangnan','almagro','santo niño','tagapul-an','santa margarita','gandara','pagsanghan','matuguinao','san jorge'];
    var o = {}; arr.forEach(function(s){ o[s] = true; }); return o;
  })();
  function isExcludedMunicipality(n) {
    if (!n) return false;
    return !!excludedSet[String(n).toLowerCase()];
  }
  function normalizeMunicipalityKey(name) {
    if (!name) return '';
    var x = String(name).toLowerCase();
    x = x.replace(/\(wright\)/g, '');
    x = x.replace(/\bcity\b/g, '');
    x = x.replace(/\s+/g, ' ').trim();
    return x;
  }
  function resolveMunicipalityName(name) {
    if (!name) return '';
    var key = normalizeMunicipalityKey(name);
    if (!key) return '';
    var hit = muniDataset.find(function(m){
      return normalizeMunicipalityKey(m.name) === key;
    });
    return hit ? hit.name : String(name);
  }
  function findMunicipalityNameFromText(txt) {
    if (!txt) return '';
    var s = String(txt);
    var parts = s.split(',').map(function(p){ return p.trim(); }).filter(Boolean);
    for (var i = parts.length - 1; i >= 0; i--) {
      var tokenKey = normalizeMunicipalityKey(parts[i]);
      if (!tokenKey) continue;
      var exact = muniDataset.find(function(m){
        return normalizeMunicipalityKey(m.name) === tokenKey;
      });
      if (exact) return exact.name;
      var near = muniDataset.find(function(m){
        var mKey = normalizeMunicipalityKey(m.name);
        return tokenKey.indexOf(mKey) !== -1 || mKey.indexOf(tokenKey) !== -1;
      });
      if (near) return near.name;
    }
    var lower = s.toLowerCase();
    var ranked = muniDataset.slice().sort(function(a, b){
      return String(b.name || '').length - String(a.name || '').length;
    });
    var hit = ranked.find(function(m){
      var n = String(m.name||'').toLowerCase();
      var core = normalizeMunicipalityKey(m.name);
      return lower.indexOf(n) !== -1 || (core && lower.indexOf(core) !== -1);
    });
    return hit ? hit.name : '';
  }
  function parseBarangayFromLocationText(txt) {
    if (!txt) return '';
    var s = String(txt);
    var direct = s.match(/(?:Brgy\.?|Barangay)\s*[^,]+/i);
    if (direct && direct[0]) return direct[0].trim();
    var pob = s.match(/\bPoblacion\s*\d+\b/i);
    if (pob && pob[0]) return pob[0].trim();
    var parts = s.split(',').map(function(p){ return p.trim(); });
    var hit = parts.find(function(p){ return /^(?:Brgy\.?|Barangay)\b/i.test(p); });
    if (hit) return hit;
    hit = parts.find(function(p){ return /\bPoblacion\b/i.test(p); });
    return hit || '';
  }

  async function setReportStatusById(reportId, nextStatus) {
    if (!cfg.url || !cfg.anonKey || !cfg.reportsTable) {
      throw new Error('Missing Supabase config');
    }
    var isResolved = String(nextStatus).toLowerCase() === 'resolved';
    var normalized = isResolved ? 'resolved' : 'pending';

    // Fetch the report's author info before updating
    var userEmail = '';
    var userName = '';
    var locationText = '';
    var issueType = '';
    var queueNum = '';
    try {
      var emailRes = await fetch(cfg.url + '/rest/v1/' + cfg.reportsTable + '?id=eq.' + encodeURIComponent(reportId) + '&select=full_name,location_text,issue_type,queue_number', {
        headers: { apikey: cfg.anonKey, Authorization: 'Bearer ' + cfg.anonKey }
      });
      if (emailRes.ok) {
        var data = await emailRes.json();
        if (data && data.length) {
          userName = data[0].full_name || '';
          locationText = data[0].location_text || '';
          issueType = data[0].issue_type || '';
          queueNum = data[0].queue_number || '';
          
          // Try to find customer user if we have a name
          if (userName) {
            var userRes = await fetch(cfg.url + '/rest/v1/customer_users?full_name=eq.' + encodeURIComponent(userName) + '&select=email', {
              headers: { apikey: cfg.anonKey, Authorization: 'Bearer ' + cfg.anonKey }
            });
            if (userRes.ok) {
              var userData = await userRes.json();
              if (userData && userData.length) {
                userEmail = userData[0].email;
              }
            }
          }
        }
      }
    } catch(e) { console.error('Failed to fetch report details for email', e); }

    var patchBody = isResolved
      ? { status: 'resolved', resolved_at: new Date().toISOString() }
      : { status: 'pending', resolved_at: null };
    var rpcMissing = false;
    try {
      var rpcRes = await fetch(cfg.url + '/rest/v1/rpc/set_report_status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: cfg.anonKey,
          Authorization: 'Bearer ' + cfg.anonKey
        },
        body: JSON.stringify({
          p_report_id: Number(reportId),
          p_status: normalized,
          p_team_name: null
        })
      });
      if (rpcRes.ok) {
        // Trigger RESTORED email if status changed to resolved
        if (normalized === 'resolved' && typeof emailjs !== 'undefined') {
          try {
            emailjs.send(
              'service_asz4dsz', 
              'template_7s9y3pb', 
              {
                to_email: userEmail || 'support@samelcodos.ph',
                to_name: userName || 'Valued Customer',
                email: userEmail || 'support@samelcodos.ph',
                name: userName || 'Valued Customer',
                issue_type: issueType || 'Reported Issue',
                location: locationText || 'Your Location',
                queue_number: queueNum || 'N/A'
              }
            ).then(function() {
              console.log('Restored email sent successfully.');
            }).catch(function(error) {
              console.error('Failed to send restored email:', error);
            });
          } catch (e) {
            console.error('Error triggering EmailJS:', e);
          }
        }
        return;
      }
      var rpcText = '';
      try { rpcText = (await rpcRes.text()) || ''; } catch (_) {}
      if (rpcRes.status !== 404 && rpcRes.status !== 400) {
        throw new Error('Failed to update status (RPC HTTP ' + rpcRes.status + ')' + (rpcText ? ': ' + rpcText : ''));
      }
      rpcMissing = true;
    } catch (err) {
      if (!rpcMissing) throw err;
    }
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
      if (rpcMissing && (res.status === 401 || res.status === 403)) {
        throw new Error('Missing set_report_status RPC in Supabase. Run sql/migrations/20260311_set_report_status_function.sql.');
      }
      throw new Error('Failed to update status: HTTP ' + res.status);
    }

    // Trigger RESTORED email if status changed to resolved
    if (normalized === 'resolved' && typeof emailjs !== 'undefined') {
      try {
        emailjs.send(
          'service_asz4dsz', 
          'template_7s9y3pb', 
          {
            to_email: userEmail || 'support@samelcodos.ph',
            to_name: userName || 'Valued Customer',
            email: userEmail || 'support@samelcodos.ph',
            name: userName || 'Valued Customer',
            issue_type: issueType || 'Reported Issue',
            location: locationText || 'Your Location',
            queue_number: queueNum || 'N/A'
          }
        ).then(function() {
          console.log('Restored email sent successfully.');
        }).catch(function(error) {
          console.error('Failed to send restored email:', error);
        });
      } catch (e) {
        console.error('Error triggering EmailJS:', e);
      }
    }
  }

  function toQueueNumber(value) {
    var n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  function isDbPendingRow(r) {
    return String((r && r.status) || 'pending').toLowerCase() === 'pending';
  }

  // Listen for storage changes from other tabs/pages (like dashboard)
  window.addEventListener('storage', function (e) {
    if (e.key === 'pendingAssignments') {
      loadPendingAssignments();
      updateAssignedInTable();
    }
  });

  // Update records table with restored-service status
  function updateRecordsWithProblems() {
    const tableRows = document.querySelectorAll('.records-table-row');
    tableRows.forEach(function (row) {
      const restoredCell = row.querySelector('.col-restored');
      const isNewFlag = row.getAttribute('data-is-new') === 'true';
      const dbStatus = (row.getAttribute('data-status-db') || 'pending').toLowerCase();
      const assignedTeam = (row.getAttribute('data-assigned-team') || '').trim();

      if (restoredCell) {
        if (dbStatus === 'resolved') {
          restoredCell.textContent = 'Resolved';
          restoredCell.className = 'col-restored status-restored';
          row.setAttribute('data-restored', 'true');
          return;
        }

        // New rule: unresolved + unassigned => New Compliance (red).
        // Once assigned, it becomes Pending.
        var isNew = !assignedTeam && isNewFlag;
        restoredCell.textContent = isNew ? 'New Compliance' : 'Pending';
        restoredCell.className = isNew ? 'col-restored status-new' : 'col-restored status-pending';
        row.setAttribute('data-restored', 'false');
      }
    });
    if (typeof updateCounts === 'function') updateCounts();
  }
  function updateAssignedInTable() {
    const tableRows = document.querySelectorAll('.records-table-row');
    tableRows.forEach(function(row){
      var cell = row.querySelector('.col-assigned');
      var team = (row.getAttribute('data-assigned-team') || '').trim();
      var personnel = (row.getAttribute('data-assigned-personnel') || '').trim();
      
      var display = '';
      if (team) display = team;
      if (personnel) {
        display = display ? (display + ' (' + personnel + ')') : personnel;
      }
      
      if (cell) cell.textContent = display || '';
    });
  }

  // Load consumer records from Supabase and populate table
  async function fetchAllReports() {
    var pageSize = 1000;
    var offset = 0;
    var out = [];
    var selectCols = [
      'id',
      'full_name',
      'contact',
      'location_text',
      'issue_type',
      'description',
      'latitude',
      'longitude',
      'source',
      'created_at',
      'municipality',
      'barangay',
      'status',
      'resolved_at',
      'is_urgent',
      'queue_number',
      'assigned_team',
      'assigned_personnel'
    ].join(',');
    while (true) {
      var queueUrl = cfg.url + '/rest/v1/' + cfg.reportsTable + '?select=' + encodeURIComponent(selectCols) + '&order=queue_number.asc.nullslast&order=created_at.asc&limit=' + pageSize + '&offset=' + offset;
      var fallbackUrl = cfg.url + '/rest/v1/' + cfg.reportsTable + '?select=' + encodeURIComponent(selectCols) + '&order=created_at.asc&limit=' + pageSize + '&offset=' + offset;
      var headers = {
        apikey: cfg.anonKey,
        Authorization: 'Bearer ' + cfg.anonKey,
        Prefer: 'count=exact'
      };
      var res = await fetch(queueUrl, { headers: headers });
      if (!res.ok) res = await fetch(fallbackUrl, { headers: headers });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var rows = await res.json();
      if (!Array.isArray(rows) || !rows.length) break;
      out = out.concat(rows);
      if (rows.length < pageSize) break;
      offset += pageSize;
    }
    return out;
  }

  async function loadConsumerRecords() {
    if (!cfg.url || !cfg.anonKey || !cfg.reportsTable) return;
    try {
      var loadingEl = document.getElementById('records-loading');
      if (loadingEl) loadingEl.style.display = 'block';
      var rows = await fetchAllReports();
      var totalEl = document.getElementById('total-reports-count');
      if (totalEl) totalEl.textContent = String(Array.isArray(rows) ? rows.length : 0);
      if (Array.isArray(rows)) {
        // Keep raw DB results intact; only enrich with derived municipality/barangay fields.
        rows = rows.map(function(r){
          var m = r.municipality || findMunicipalityNameFromText(r.location_text || r.location || r.address || '');
          var b = r.barangay || parseBarangayFromLocationText(r.location_text || r.location || r.address || '');
          return Object.assign({}, r, { municipality: m, barangay: b });
        });
      }
      // sync problem locations based on the same rows fetched
      if (Array.isArray(rows)) {
        var problems = rows.filter(function(r){
          return String(r.status || 'pending').toLowerCase() !== 'resolved';
        }).map(function(r) {
          // use location_text if available
          var address = r.location_text || '';
          if (!address) {
            var parts = [];
            if (r.municipality) parts.push(r.municipality);
            if (r.barangay) parts.push(r.barangay);
            if (r.location || r.street) parts.push(r.location || r.street);
            address = parts.join(', ');
          }
          return {
            name: address || r.municipality || r.location || '',
            issue: r.issue || r.issue_type || '' ,
            barangay: r.barangay || '',
            rawAddress: address
          };
        });
        localStorage.setItem('problemLocations', JSON.stringify(problems));
        problemLocations = problems; // update current variable so later logic sees it
      }
      populateTable(rows);
    } catch (err) {
      console.warn('Failed to load consumer records:', err);
    }
    finally {
      var loadingEl2 = document.getElementById('records-loading');
      if (loadingEl2) loadingEl2.style.display = 'none';
    }
  }

  function populateTable(rows) {
    const table = document.getElementById('consumer-records-table');
    if (!table) return;
    // remove any existing data rows
    table.querySelectorAll('.records-table-row').forEach(r => r.remove());
    if (!rows || !rows.length) {
      var empty = document.createElement('div');
      empty.className = 'records-table-row';
      empty.innerHTML = '<span colspan="6" style="text-align:center;">No records found</span>';
      table.appendChild(empty);
      return;
    }
    var newCount = 0;
    var pendingCount = 0;
    var muniSet = new Set();
    rows.forEach(function(r, idx) {
      var id = r.id || (idx + 1);
      var date = r.created_at ? r.created_at.split('T')[0] : '';
      var queueNumber = toQueueNumber(r.queue_number);
      var contact = r.contact || r.phone || '';
      var name = r.full_name || r.name || '';
      var address = r.location_text || r.location || '';
      var municipality = resolveMunicipalityName(r.municipality || '');
      
      // if municipality is missing, try to extract it from address
      if (!municipality && address) {
        // comprehensive check for Samar municipalities - Must match dashboard names exactly
        const samarMuns = [
          'Almagro', 'Basey', 'Calbayog City', 'Calbiga', 'Catbalogan City', 'Daram', 'Gandara', 
          'Hinabangan', 'Jiabong', 'Marabut', 'Matuguinao', 'Motiong', 
          'Paranas (Wright)', 'Pinabacdao', 'San Jorge', 'San Jose de Buan', 
          'San Sebastian', 'Santa Margarita', 'Santa Rita', 'Santo Niño', 
          'Tagapul-an', 'Talalora', 'Tarangnan', 'Villareal', 'Zumarraga'
        ];
        municipality = findMunicipalityNameFromText(address) || municipality;
      }

      if (!address) {
        var parts = [];
        if (r.municipality) parts.push(r.municipality);
        if (r.barangay) parts.push(r.barangay);
        if (r.street) parts.push(r.street);
        address = parts.join(', ');
      }
      var assignedTeam = String(r.assigned_team || '').trim();
      var assignedPersonnel = String(r.assigned_personnel || '').trim();
      var dbStatus = String(r.status || 'pending').toLowerCase();
      var isNew = !assignedTeam && dbStatus !== 'resolved';
      muniSet.add(municipality || '');
      var statusText = r.issue_type || r.issue || '';
      var row = document.createElement('div');
      row.className = 'records-table-row';
      row.setAttribute('data-status', statusText);
      row.setAttribute('data-date', date);
      row.setAttribute('data-id', String(id));
      row.setAttribute('data-queue', queueNumber ? String(queueNumber) : '');
      row.setAttribute('data-municipality', municipality);
      row.setAttribute('data-is-new', isNew ? 'true' : 'false');
      row.setAttribute('data-status-db', dbStatus);
      row.setAttribute('data-assigned-team', assignedTeam || '');
      row.setAttribute('data-assigned-personnel', assignedPersonnel || '');
      
      var assignedDisplay = assignedTeam;
      if (assignedPersonnel) {
        assignedDisplay = assignedDisplay ? (assignedDisplay + ' (' + assignedPersonnel + ')') : assignedPersonnel;
      }
      
      row.innerHTML = '<span class="col-queue">' + (queueNumber ? ('#' + queueNumber) : '-') + '</span>' +
                      '<span class="col-date">' + date + '</span>' +
                      '<span class="col-contact">' + contact + '</span>' +
                      '<span class="col-name">' + name + '</span>' +
                      '<span class="col-address">' + address + '</span>' +
                      '<span class="col-status">' + statusText + '</span>' +
                      '<span class="col-assigned">' + (assignedDisplay || '') + '</span>' +
                      '<span class="col-restored status-pending">Pending</span>';
      
      // Add click listener for restoration toggle
      const restoredCell = row.querySelector('.col-restored');
      restoredCell.addEventListener('click', async function(e) {
        e.stopPropagation();
        var reportId = row.getAttribute('data-id');
        if (!reportId) return;
        var currentDbStatus = (row.getAttribute('data-status-db') || 'pending').toLowerCase();
        var nextDbStatus = currentDbStatus === 'resolved' ? 'pending' : 'resolved';
        try {
          await setReportStatusById(reportId, nextDbStatus);
          row.setAttribute('data-status-db', nextDbStatus);
          updateRecordsWithProblems();
          applyFilters();
          updateCounts();
        } catch (err) {
          console.error(err);
          var msg = String((err && err.message) || '');
          if (/set_report_status/i.test(msg)) {
            alert('Status update RPC is missing in Supabase. Run sql/migrations/20260311_set_report_status_function.sql.');
          } else {
            alert('Failed to update status. Check Supabase UPDATE policy for reports table.');
          }
        }
      });

      row.addEventListener('click', function() {
        var barangay = r.barangay || parseBarangayFromLocationText(address);
        openRecordModal({
          id: id,
          queueNumber: queueNumber,
          date: date,
          contact: contact,
          name: name,
          address: address,
          issue: statusText,
          municipality: municipality,
          barangay: barangay,
          assignedTeam: assignedTeam,
          assignedPersonnel: assignedPersonnel,
          isNew: isNew
        });
      });

      table.appendChild(row);
      var isRestoredNow = String(r.status || 'pending').toLowerCase() === 'resolved';
      if (!isRestoredNow) {
        if (isNew) newCount += 1; else pendingCount += 1;
      }
    });
    // if filters are already defined, apply them to the newly added rows
    if (typeof applyFilters === 'function') {
      applyFilters();
    }
    // refresh statuses based on problems/restored locations
    updateRecordsWithProblems();
    updateAssignedInTable();
    updateCounts(newCount, pendingCount);
    populateMunicipalityFilter(Array.from(muniSet).filter(Boolean));
  }

  // unified filter function
  function applyFilters() {
    const filterInput = document.getElementById('records-filter');
    const statusFilter = document.getElementById('status-filter');
    const dateFilter = document.getElementById('records-date');
    const monthFilter = document.getElementById('records-month');
    const recordsTable = document.getElementById('consumer-records-table');
    const munFilter = document.getElementById('mun-filter');
    const assignedFilter = document.getElementById('assigned-filter');
    
    if (!recordsTable) return;

    const tableRows = recordsTable.querySelectorAll('.records-table-row');
    const textValue = filterInput ? filterInput.value.toLowerCase().trim() : '';
    const statusValue = statusFilter ? statusFilter.value : 'all';
    const dateValue = dateFilter ? dateFilter.value : '';
    const monthValue = monthFilter ? monthFilter.value : '';
    const munValue = munFilter ? munFilter.value : 'all';
    const assignedValue = assignedFilter ? assignedFilter.value : 'all';

    let visibleCount = 0;
    tableRows.forEach(row => {
      let show = true;
      
      // text match
      if (textValue) {
        const rowText = row.textContent.toLowerCase();
        if (!rowText.includes(textValue)) show = false;
      }

      // date match
      if (show && dateValue) {
        const rowDate = row.getAttribute('data-date');
        if (rowDate !== dateValue) show = false;
      }
      // month match (YYYY-MM)
      if (show && monthValue) {
        const rowDate = row.getAttribute('data-date') || '';
        if (!rowDate.startsWith(monthValue)) show = false;
      }

      // status match
      if (show && statusValue !== 'all') {
        const isRestored = row.getAttribute('data-restored') === 'true';
        if (statusValue === 'restored') {
          if (!isRestored) show = false;
        } else if (statusValue === 'problems') {
          if (isRestored) show = false;
        }
      }

      if (show && munValue && munValue !== 'all') {
        const rowMun = row.getAttribute('data-municipality') || '';
        if (rowMun !== munValue) show = false;
      }

      if (show && quickFilter !== 'all') {
        const isRestored = row.getAttribute('data-restored') === 'true';
        const isNew = row.getAttribute('data-is-new') === 'true';
        const rowDate = row.getAttribute('data-date');
        const assignedTeam = (row.getAttribute('data-assigned-team') || '').trim();
        const today = new Date().toISOString().split('T')[0];

        if (quickFilter === 'new') {
          if (isRestored || !isNew) show = false;
        } else if (quickFilter === 'pending') {
          if (isRestored || isNew) show = false;
        } else if (quickFilter === 'daily') {
          if (rowDate !== today) show = false;
        } else if (quickFilter === 'assigned') {
          if (!assignedTeam) show = false;
        }
      }

      // assignment filter
      if (show && assignedValue !== 'all') {
        const assignedTeam = row.getAttribute('data-assigned-team') || '';
        if (assignedValue === 'assigned' && !assignedTeam) show = false;
        if (assignedValue === 'unassigned' && assignedTeam) show = false;
      }

      row.style.display = show ? 'grid' : 'none';
      if (show) visibleCount++;
    });
    var countEl = document.getElementById('records-visible-count');
    if (countEl) countEl.textContent = String(visibleCount);
    var emptyEl = document.getElementById('records-empty');
    if (emptyEl) emptyEl.style.display = visibleCount === 0 ? 'block' : 'none';
  }

  // Run the update and load records after DOM is ready
  updateRecordsWithProblems();
  // then fetch the latest reports to replace the table
  loadConsumerRecords();

  var fEl = document.getElementById('records-filter'); if (fEl) fEl.addEventListener('input', applyFilters);
  var dEl = document.getElementById('records-date'); if (dEl) dEl.addEventListener('change', applyFilters);
  var mEl = document.getElementById('records-month'); if (mEl) mEl.addEventListener('change', applyFilters);
  var sEl = document.getElementById('status-filter'); if (sEl) sEl.addEventListener('change', applyFilters);
  var aEl = document.getElementById('assigned-filter'); if (aEl) aEl.addEventListener('change', applyFilters);
  var clearBtn = document.getElementById('clear-filters-btn');
  if (clearBtn) {
    clearBtn.addEventListener('click', function(){
      var f1 = document.getElementById('records-filter'); if (f1) f1.value = '';
      var f2 = document.getElementById('records-date'); if (f2) f2.value = '';
      var f3 = document.getElementById('records-month'); if (f3) f3.value = '';
      var f4 = document.getElementById('status-filter'); if (f4) f4.value = 'all';
      var f5 = document.getElementById('mun-filter'); if (f5) f5.value = 'all';
      var f6 = document.getElementById('assigned-filter'); if (f6) f6.value = 'all';
      quickFilter = 'all';
      if (typeof updateBadgeActiveState === 'function') updateBadgeActiveState();
      applyFilters();
    });
  }

  // periodically refresh records so new submissions show up automatically
  setInterval(function() {
    loadConsumerRecords();
  }, 30000); // refresh every 30 seconds (adjust as needed)

  // Instant sync when actions happen in Dashboard (other tab/window)
  window.addEventListener('storage', function(ev){
    if (!ev) return;
    if (ev.key === 'pendingAssignments' || ev.key === 'hiddenPins') {
      try {
        if (ev.key === 'pendingAssignments') {
          loadPendingAssignments();
        }
      } catch(_) {}
      updateRecordsWithProblems();
      updateAssignedInTable();
      if (typeof applyFilters === 'function') applyFilters();
      if (typeof updateCounts === 'function') updateCounts();
    }
  });
  document.getElementById('logout-btn').addEventListener('click', function() {
    localStorage.removeItem('userName');
    localStorage.removeItem('userRole');
    localStorage.removeItem('teamSession');
    localStorage.removeItem('customerSession');
    localStorage.removeItem('personnelSession');
    window.location.href = 'index.html';
  });

  // branches button dropdown (same behavior across pages)
  var branchesBtn = document.getElementById('branches-btn');
  var branchDropdown = document.getElementById('branch-dropdown');
  if (branchesBtn && branchDropdown) {
    branchesBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      branchDropdown.classList.toggle('is-open');
    });
    document.addEventListener('click', function() {
      branchDropdown.classList.remove('is-open');
    });
    branchDropdown.addEventListener('click', function(e) { e.stopPropagation(); });

    branchDropdown.querySelectorAll('.branch-option').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var branch = this.getAttribute('data-branch');
        localStorage.setItem('selectedBranch', branch);
        window.location.href = 'records.html';
      });
    });
  }

  // Three-dots menu
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
    navDotsDropdown.addEventListener('click', function(e) { e.stopPropagation(); });
    navDotsDropdown.querySelectorAll('.nav-dots-item').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var action = this.getAttribute('data-action');
        navDotsDropdown.classList.remove('is-open');
        if (action === 'home') window.location.href = 'dashboard.html';
        else if (action === 'records') { /* already here */ }
        else if (action === 'analytics') window.location.href = 'analytics.html';
        else if (action === 'branches') window.location.href = 'branches.html';
        else if (action === 'teams') window.location.href = 'teams.html';
        else if (action === 'about') window.location.href = 'about.html';
        else if (action === 'contact') window.location.href = 'contact.html';
        else if (action === 'etc') window.location.href = 'about.html';
      });
    });
  }

  // Filter and Export functionality
  const filterInput = document.getElementById('records-filter');
  const statusFilter = document.getElementById('status-filter');
  const exportBtn = document.getElementById('export-excel-btn');
  const recordsTable = document.getElementById('consumer-records-table');
  const resetRestoredBtn = document.getElementById('reset-restored-btn');

  // if user selected a branch previously, pre-populate filter and clear storage
  var selectedBranch = localStorage.getItem('selectedBranch');
  if (selectedBranch && filterInput) {
    filterInput.value = selectedBranch;
    localStorage.removeItem('selectedBranch');
  }

  // check url query params for location/issue filter (from dashboard marker clicks)
  var searchParams = new URLSearchParams(window.location.search);
  function decodeParam(val) {
    if (!val) return '';
    return String(val).replace(/\+/g, ' ');
  }
  var locParam = decodeParam(searchParams.get('location'));
  var issueParam = decodeParam(searchParams.get('issue'));
  if (locParam && filterInput) {
    filterInput.value = locParam + (issueParam ? ' ' + issueParam : '');
  }
  if (issueParam && statusFilter) {
    // if an issue was specified, show problems only and include text in filter
    statusFilter.value = 'problems';
  }

  if (filterInput && recordsTable && typeof applyFilters === 'function') {
    applyFilters();
  }

  // export button logic separated from filtering
  if (exportBtn && recordsTable) {
    exportBtn.addEventListener('click', function() {
      var visibleRows = Array.from(recordsTable.querySelectorAll('.records-table-row')).filter(function(r){ return r.style.display !== 'none'; });
      var headers = Array.from(recordsTable.querySelectorAll('.records-table-header span')).map(function(s){ return s.innerText || ''; });
      
      var dataRows = visibleRows.map(function(r){
        return Array.from(r.querySelectorAll('span')).map(function(s){ return s.innerText || ''; });
      });

      var assignedCount = 0;
      var issueCounts = {};
      var teamCounts = {};
      var personnelCounts = {};
      
      visibleRows.forEach(function(row) {
        var team = (row.getAttribute('data-assigned-team') || '').trim();
        var personnel = (row.getAttribute('data-assigned-personnel') || '').trim();
        var issue = (row.getAttribute('data-status') || '').trim();
        
        if (team) {
          assignedCount++;
          teamCounts[team] = (teamCounts[team] || 0) + 1;
        }
        if (personnel) {
          // split personnel string if it contains multiple names separated by commas
          personnel.split(',').forEach(function(p) {
            var name = p.trim();
            if (name) {
              personnelCounts[name] = (personnelCounts[name] || 0) + 1;
            }
          });
        }
        if (issue) {
          issueCounts[issue] = (issueCounts[issue] || 0) + 1;
        }
      });

      var mv = (document.getElementById('mun-filter')||{}).value || 'all';
      var sv = (document.getElementById('status-filter')||{}).value || 'all';
      var av = (document.getElementById('assigned-filter')||{}).value || 'all';
      var now = new Date();
      
      var meta = [
        'Generated: ' + now.toLocaleString(),
        'Municipality: ' + (mv || 'all'),
        'Status: ' + (sv || 'all'),
        'Assignment: ' + (av || 'all')
      ];

      // Convert counts to HTML lists with creative styling
      var totalIssues = Object.values(issueCounts).reduce(function(a, b) { return a + b; }, 0);
      var issueListHtml = Object.keys(issueCounts).sort(function(a,b){ return issueCounts[b] - issueCounts[a]; }).map(function(k){
        var percent = Math.round((issueCounts[k] / visibleRows.length) * 100);
        return '<div class="stat-item">' +
                 '<div class="stat-item-label">' + k + '</div>' +
                 '<div class="stat-item-value-row">' +
                   '<div class="stat-bar-bg"><div class="stat-bar-fill" style="width:' + percent + '%;"></div></div>' +
                   '<span class="stat-count">' + issueCounts[k] + '</span>' +
                 '</div>' +
               '</div>';
      }).join('');
      
      var teamListHtml = Object.keys(teamCounts).sort(function(a,b){ return teamCounts[b] - teamCounts[a]; }).map(function(k){
        return '<div class="stat-item team-item">' +
                 '<span class="team-dot"></span>' +
                 '<span class="stat-item-label">' + k + '</span>' +
                 '<span class="stat-count-badge">' + teamCounts[k] + '</span>' +
               '</div>';
      }).join('');
      
      var personnelListHtml = Object.keys(personnelCounts).sort(function(a,b){ return personnelCounts[b] - personnelCounts[a]; }).map(function(k){
        return '<div class="stat-item team-item">' +
                 '<span class="team-dot" style="background:#2b6cb0;"></span>' +
                 '<span class="stat-item-label">' + k + '</span>' +
                 '<span class="stat-count-badge" style="background:#2b6cb0;">' + personnelCounts[k] + '</span>' +
               '</div>';
      }).join('');

      var statsHtml = '<div class="creative-stats-container">' +
        '<div class="stats-card">' +
          '<div class="card-header">Issue Type Distribution</div>' +
          '<div class="card-body">' + (issueListHtml || '<p>No issues found</p>') + '</div>' +
        '</div>' +
        '<div class="stats-card">' +
          '<div class="card-header">Team Assignments</div>' +
          '<div class="card-body">' + (teamListHtml || '<p>No teams assigned</p>') + '</div>' +
        '</div>' +
        '<div class="stats-card">' +
          '<div class="card-header">Personnel Assigned</div>' +
          '<div class="card-body">' + (personnelListHtml || '<p>No personnel assigned</p>') + '</div>' +
        '</div>' +
        '<div class="stats-card summary-card">' +
          '<div class="card-header">Report Summary</div>' +
          '<div class="card-body summary-body">' +
            '<div class="summary-stat-box">' +
              '<div class="summary-val">' + visibleRows.length + '</div>' +
              '<div class="summary-label">Total Records</div>' +
            '</div>' +
            '<div class="summary-stat-box assigned-box">' +
              '<div class="summary-val">' + totalIssues + '</div>' +
              '<div class="summary-label">Total Issues</div>' +
            '</div>' +
            '<div class="summary-stat-box assigned-box" style="border-top:none;">' +
              '<div class="summary-val">' + assignedCount + '</div>' +
              '<div class="summary-label">Assigned Reports</div>' +
            '</div>' +
            '<div class="summary-footer-info">' +
              '<span>Generation Date: ' + now.toLocaleDateString() + '</span>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
      
      var baseHref = window.location.href;
      var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Consumer Records</title><base href="' + baseHref + '">' +
        '<style>' +
        'html,body{font-family: "Segoe UI", Tahoma, sans-serif; color:#333; margin:0; padding:0;} ' +
        'body{padding:8mm;} ' +
        'h1{margin:0 0 0.3rem; font-size:18px; color:#1a1512; border-bottom: 2px solid #8b2a2a; padding-bottom:3px; text-align:center;} ' +
        '.meta{font-size:10px; color:#666; margin-bottom:12px; font-style: italic; text-align:center;} ' +
        'table{width:100%; border-collapse:collapse; margin-bottom:15px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);} ' +
        'th{background:#8b2a2a; color:#fff; font-weight:600; text-align:left; text-transform:uppercase; font-size:9px; letter-spacing:0.4px; padding:6px 6px;} ' +
        'td{border-bottom:1px solid #eee; padding:5px 6px; font-size:8.5px; color:#444;} ' +
        'tr:nth-child(even){background:#fcfcfc;} ' +
        '.footer{margin-top:10px; font-size:9px; color:#999; text-align:center; border-top:1px solid #eee; padding-top:6px;} ' +
        '@page{size: A4 landscape; margin:0;} ' +
        '.report-header{display:flex; justify-content:center; align-items:center; margin-bottom:12px; padding-bottom:10px; border-bottom:1px solid #eee;} ' +
        '.header-left{display:flex; align-items:center; gap:10px;} ' +
        '.coop-logo{height:40px;} ' +
        '.header-text{text-align:left;} ' +
        '.coop-name{font-size:14px; font-weight:800; color:#8b2a2a; margin:0;} ' +
        '.coop-branch{font-size:10px; color:#666; margin:0;} ' +
        
        /* Creative Stats Styles */
        '.creative-stats-container{display:grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap:10px; margin-top:10px; page-break-inside: avoid;} ' +
        '.stats-card{background:#fff; border:1px solid #e0e0e0; border-radius:5px; overflow:hidden; display:flex; flex-direction:column; min-height:100px;} ' +
        '.card-header{background:#f8f9fa; padding:5px 10px; font-size:10px; font-weight:700; color:#8b2a2a; border-bottom:1px solid #eee; text-align:center;} ' +
        '.card-body{padding:6px 12px; flex:1; display:flex; flex-direction:column; justify-content:center;} ' +
        '.stat-item{margin-bottom:4px;} ' +
        '.stat-item-label{font-size:9px; color:#555; margin-bottom:2px; font-weight:500;} ' +
        '.stat-item-value-row{display:flex; align-items:center; gap:6px;} ' +
        '.stat-bar-bg{flex:1; height:4px; background:#f0f0f0; border-radius:2px; overflow:hidden;} ' +
        '.stat-bar-fill{height:100%; background:linear-gradient(90deg, #8b2a2a, #c53030); border-radius:2px;} ' +
        '.stat-count{font-size:9px; font-weight:700; color:#1a1512; min-width:16px; text-align:right;} ' +
        '.stat-total-row{margin-top:5px; padding-top:5px; border-top:1px solid #eee; display:flex; justify-content:space-between; align-items:center;} ' +
        '.stat-total-label{font-size:8.5px; font-weight:700; color:#666; letter-spacing:0.4px;} ' +
        '.stat-total-val{font-size:10px; font-weight:800; color:#8b2a2a;} ' +
        '.team-item{display:flex; align-items:center; gap:6px; margin-bottom:3px; padding-bottom:3px; border-bottom:1px dashed #eee;} ' +
        '.team-dot{width:5px; height:5px; background:#8b2a2a; border-radius:50%;} ' +
        '.stat-count-badge{margin-left:auto; background:#8b2a2a; color:#fff; padding:1px 5px; border-radius:6px; font-size:8.5px; font-weight:600;} ' +
        '.summary-card{background:linear-gradient(135deg, #8b2a2a 0%, #4a1414 100%); border:none;} ' +
        '.summary-card .card-header{background:rgba(255,255,255,0.1); color:#fff; border-bottom:1px solid rgba(255,255,255,0.1);} ' +
        '.summary-body{display:flex; flex-direction:column; justify-content:center; align-items:center; color:#fff; gap:6px; padding:10px;} ' +
        '.summary-stat-box{text-align:center; width:100%; padding:2px 0;} ' +
        '.summary-val{font-size:20px; font-weight:800; line-height:1;} ' +
        '.summary-label{font-size:8.5px; opacity:0.8; text-transform:uppercase; letter-spacing:0.8px; margin-top:1px;} ' +
        '.assigned-box{border-top:1px solid rgba(255,255,255,0.1); border-bottom:1px solid rgba(255,255,255,0.1);} ' +
        '.summary-footer-info{font-size:7.5px; opacity:0.6; margin-top:2px;} ' +
        '</style></head><body>' +
        '<div class="report-header">' +
          '<div class="header-left">' +
            '<img class="coop-logo" src="../assets/images/logo.png" alt="SAMELCO II logo">' +
            '<div class="header-text">' +
              '<div class="coop-name">SAMAR II ELECTRIC COOPERATIVE, INC.</div>' +
              '<div class="coop-branch">Paranas, Samar - Consumer Service Department</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<h1>Consumer Records Report</h1>' +
        '<div class="meta">Filtered Results • ' + meta.join(' • ') + '</div>' +
        '<table><thead><tr>' +
        headers.map(function(h){ return '<th>' + h + '</th>'; }).join('') +
        '</tr></thead><tbody>' +
        dataRows.map(function(row){ return '<tr>' + row.map(function(c){ return '<td>' + c + '</td>'; }).join('') + '</tr>'; }).join('') +
        '</tbody></table>' +
        statsHtml +
        '<div class="footer">SAMELCO II System • Secure Consumer Records Management • ' + now.getFullYear() + '</div>' +
        '</body></html>';
      var win = window.open('', '_blank');
      if (!win) return;
      win.document.open();
      win.document.write(html);
      win.document.close();
      win.focus();
      setTimeout(function(){ try { win.print(); } catch(_){} try { win.close(); } catch(_){} }, 200);
    });
  }

  var quickFilter = 'all';
  function updateCounts(prefNew, prefPending) {
    var newEl = document.getElementById('badge-new-count');
    var pendEl = document.getElementById('badge-pending-count');
    var dailyEl = document.getElementById('badge-daily-count');
    var assignedEl = document.getElementById('badge-assigned-count');
    
    if (!newEl || !pendEl || !dailyEl || !assignedEl) return;
    
    var rows = document.querySelectorAll('.records-table-row');
    var n = 0, p = 0, d = 0, a = 0;
    
    var today = new Date().toISOString().split('T')[0];
    
    rows.forEach(function(row){
      var isRestored = row.getAttribute('data-restored') === 'true';
      var isNew = row.getAttribute('data-is-new') === 'true';
      var rowDate = row.getAttribute('data-date');
      var assignedTeam = (row.getAttribute('data-assigned-team') || '').trim();
      
      // Daily Issues (issues created today)
      if (rowDate === today) d++;
      
      // Assigned (those that have a team assigned)
      if (assignedTeam) a++;
      
      // New & Pending (only for un-restored ones)
      if (!isRestored) {
        if (isNew) n++; else p++;
      }
    });
    
    newEl.textContent = String(n);
    pendEl.textContent = String(p);
    dailyEl.textContent = String(d);
    assignedEl.textContent = String(a);
  }

  function populateMunicipalityFilter(list) {
    var sel = document.getElementById('mun-filter');
    if (!sel) return;
    var existing = Array.from(sel.options).map(function(o){ return o.value; });
    list.forEach(function(m){
      if (!m || existing.includes(m)) return;
      if (isExcludedMunicipality(m)) return;
      var opt = document.createElement('option');
      opt.value = m;
      opt.textContent = m;
      sel.appendChild(opt);
    });
  }

  var munSel = document.getElementById('mun-filter');
  if (munSel) munSel.addEventListener('change', applyFilters);
  var badgeNew = document.getElementById('badge-new');
  var badgePending = document.getElementById('badge-pending');
  var badgeDaily = document.getElementById('badge-daily');
  var badgeAssigned = document.getElementById('badge-assigned');
  
  if (badgeNew) badgeNew.addEventListener('click', function(){
    quickFilter = (quickFilter === 'new') ? 'all' : 'new';
    updateBadgeActiveState();
    applyFilters();
  });
  if (badgePending) badgePending.addEventListener('click', function(){
    quickFilter = (quickFilter === 'pending') ? 'all' : 'pending';
    updateBadgeActiveState();
    applyFilters();
  });
  if (badgeDaily) badgeDaily.addEventListener('click', function(){
    quickFilter = (quickFilter === 'daily') ? 'all' : 'daily';
    updateBadgeActiveState();
    applyFilters();
  });
  if (badgeAssigned) badgeAssigned.addEventListener('click', function(){
    quickFilter = (quickFilter === 'assigned') ? 'all' : 'assigned';
    updateBadgeActiveState();
    applyFilters();
  });

  function updateBadgeActiveState() {
    [badgeNew, badgePending, badgeDaily, badgeAssigned].forEach(function(b){
      if (!b) return;
      b.classList.remove('is-active');
    });
    if (quickFilter === 'new' && badgeNew) badgeNew.classList.add('is-active');
    if (quickFilter === 'pending' && badgePending) badgePending.classList.add('is-active');
    if (quickFilter === 'daily' && badgeDaily) badgeDaily.classList.add('is-active');
    if (quickFilter === 'assigned' && badgeAssigned) badgeAssigned.classList.add('is-active');
  }

  var recModal = document.getElementById('record-modal');
  var closeRec = document.getElementById('close-record-modal');
  var recList = document.getElementById('modal-info-list');
  var copyBtn = document.getElementById('copy-address-btn');
  var viewMapBtn = document.getElementById('view-in-map-btn');
  var lastAddress = '';
  var lastMapTarget = null;
  function openRecordModal(info) {
    if (!recModal || !recList) return;
    recList.innerHTML = '';
    var data = [
      ['Queue No.', info.queueNumber ? ('#' + info.queueNumber) : 'Not assigned'],
      ['Date', info.date || ''],
      ['Account No.', info.contact || ''],
      ['Name', info.name || ''],
      ['Municipality', info.municipality || ''],
      ['Address', info.address || ''],
      ['Issue', info.issue || ''],
      ['Assigned Team', info.assignedTeam || 'None'],
      ['Assigned Personnel', info.assignedPersonnel || 'None'],
      ['New', info.isNew ? 'Yes' : 'No']
    ];
    data.forEach(function(kv){
      var li = document.createElement('li');
      li.textContent = kv[0] + ': ' + kv[1];
      recList.appendChild(li);
    });
    lastAddress = info.address || '';
    lastMapTarget = {
      reportId: info.id || '',
      municipality: info.municipality || '',
      barangay: info.barangay || '',
      address: info.address || '',
      issue: info.issue || ''
    };
    recModal.style.display = 'block';
  }
  if (closeRec) closeRec.addEventListener('click', function(){ recModal.style.display = 'none'; });
  if (recModal) recModal.addEventListener('click', function(e){ if (e.target === recModal) recModal.style.display = 'none'; });
  if (copyBtn) copyBtn.addEventListener('click', function(){ if (lastAddress && navigator.clipboard) navigator.clipboard.writeText(lastAddress); });
  if (viewMapBtn) {
    viewMapBtn.addEventListener('click', function(){
      var t = lastMapTarget || {};
      var sp = new URLSearchParams();
      if (t.reportId) sp.set('report_id', String(t.reportId));
      if (t.municipality) sp.set('municipality', t.municipality);
      if (t.barangay) sp.set('barangay', t.barangay);
      if (!t.municipality && t.address) sp.set('location', t.address);
      if (t.issue) sp.set('issue', t.issue);
      sp.set('alarm', '1');
      window.location.href = 'dashboard.html?' + sp.toString();
    });
  }

  if (resetRestoredBtn) {
    resetRestoredBtn.addEventListener('click', function() {
      localStorage.setItem('restoredLocations', JSON.stringify([]));
      localStorage.setItem('restoredBarangays', JSON.stringify({}));
      updateRecordsWithProblems();
      loadConsumerRecords();
      updateCounts();
    });
  }
});
