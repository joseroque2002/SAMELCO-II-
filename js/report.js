document.addEventListener('DOMContentLoaded', function () {
  var cfg = window.SAMELCO_SUPABASE || {};
  var form = document.getElementById('report-form');
  var gpsBtn = document.getElementById('capture-gps-btn');
  var gpsStatus = document.getElementById('gps-status');
  var latEl = document.getElementById('report-lat');
  var lngEl = document.getElementById('report-lng');
  var municipalityEl = document.getElementById('report-municipality');
  var barangayEl = document.getElementById('report-barangay');
  var streetEl = document.getElementById('report-location');
  var municipalityData = [];

  function fillSelectOptions(selectEl, values, placeholder) {
    if (!selectEl) return;
    selectEl.innerHTML = '';
    var emptyOpt = document.createElement('option');
    emptyOpt.value = '';
    emptyOpt.textContent = placeholder;
    emptyOpt.selected = true;
    emptyOpt.disabled = true;
    emptyOpt.hidden = true;
    selectEl.appendChild(emptyOpt);

    values.forEach(function (value) {
      var opt = document.createElement('option');
      opt.value = value;
      opt.textContent = value;
      selectEl.appendChild(opt);
    });
  }

  function onMunicipalityChange() {
    if (!municipalityEl || !barangayEl) return;
    var selected = municipalityEl.value;
    var muni = municipalityData.find(function (m) { return m.name === selected; });
    var barangays = muni && Array.isArray(muni.barangays) ? muni.barangays : [];
    var barangayNames = barangays.map(function(b) {
      return (b && typeof b === 'object' && b.name) ? b.name : b;
    });
    fillSelectOptions(barangayEl, barangayNames, 'Select barangay');
    barangayEl.disabled = !barangayNames.length;
    if (!barangayNames.length) barangayEl.value = '';
  }

  function toRadians(value) {
    return value * (Math.PI / 180);
  }

  function distanceKm(lat1, lng1, lat2, lng2) {
    var earthRadiusKm = 6371;
    var dLat = toRadians(lat2 - lat1);
    var dLng = toRadians(lng2 - lng1);
    var a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return earthRadiusKm * c;
  }

  function findNearestMunicipality(latitude, longitude) {
    if (!Array.isArray(municipalityData) || !municipalityData.length) return null;
    var nearest = null;
    var nearestDistance = Infinity;

    municipalityData.forEach(function (m) {
      var mLat = Number(m.lat);
      var mLng = Number(m.lng);
      if (!Number.isFinite(mLat) || !Number.isFinite(mLng)) return;
      var d = distanceKm(latitude, longitude, mLat, mLng);
      if (d < nearestDistance) {
        nearestDistance = d;
        nearest = m;
      }
    });

    return nearest;
  }

  function normalizeMunicipalityKey(name) {
    if (!name) return '';
    var x = String(name).toLowerCase();
    try { x = x.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (e) {}
    x = x.replace(/\(wright\)/g, '');
    x = x.replace(/\bcity\b/g, '');
    x = x.replace(/\s+/g, ' ').trim();
    return x;
  }

  function findBestMunicipalityMatch(candidates) {
    if (!Array.isArray(candidates) || !candidates.length) return null;
    if (!Array.isArray(municipalityData) || !municipalityData.length) return null;
    for (var i = 0; i < candidates.length; i++) {
      var candKey = normalizeMunicipalityKey(candidates[i]);
      if (!candKey) continue;
      var exact = municipalityData.find(function(m){
        return normalizeMunicipalityKey(m && m.name) === candKey;
      });
      if (exact) return exact;
      var near = municipalityData.find(function(m){
        var mk = normalizeMunicipalityKey(m && m.name);
        if (!mk) return false;
        return candKey.indexOf(mk) !== -1 || mk.indexOf(candKey) !== -1;
      });
      if (near) return near;
    }
    return null;
  }

  function findCoverageLocationFromGps(latitude, longitude) {
    var lookup = window.SAMELCO_COVERAGE_LOOKUP;
    if (!lookup || typeof lookup.findLocationByPoint !== 'function') return null;
    if (!window.SAMELCO_COVERAGE_GEOJSON) return null;

    var rawMatch = lookup.findLocationByPoint(window.SAMELCO_COVERAGE_GEOJSON, latitude, longitude);
    if (!rawMatch || !rawMatch.municipality) return null;

    var municipalityMatch = findBestMunicipalityMatch([rawMatch.municipality]);
    if (!municipalityMatch) return null;

    var matchedBarangay = findBestBarangayMatch(
      [rawMatch.barangay],
      Array.isArray(municipalityMatch.barangays) ? municipalityMatch.barangays : []
    );

    return {
      municipality: municipalityMatch.name,
      barangay: matchedBarangay || ''
    };
  }

  async function autoSelectMunicipalityFromGps(latitude, longitude, coverageMatch) {
    if (!municipalityEl) return null;
    if (coverageMatch && coverageMatch.municipality) {
      municipalityEl.value = coverageMatch.municipality;
      onMunicipalityChange();
      return coverageMatch.municipality;
    }

    var detected = null;
    var nearest = findNearestMunicipality(latitude, longitude);
    try {
      var payload = await reverseGeocode(latitude, longitude);
      var candidates = extractReverseGeocodeCandidates(payload);
      detected = findBestMunicipalityMatch(candidates);
    } catch (e) {}
    var chosen = detected || nearest;
    if (detected && nearest && detected.name !== nearest.name) {
      var dDetected = distanceKm(latitude, longitude, Number(detected.lat), Number(detected.lng));
      var dNearest = distanceKm(latitude, longitude, Number(nearest.lat), Number(nearest.lng));
      if (Number.isFinite(dDetected) && Number.isFinite(dNearest) && (dDetected - dNearest) > 2) {
        chosen = nearest;
      }
    }
    if (!chosen) return null;
    municipalityEl.value = chosen.name;
    onMunicipalityChange();
    return chosen.name;
  }

  function normalizeBarangayName(name) {
    if (!name) return '';
    var x = String(name).toLowerCase();
    try { x = x.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (e) {}
    x = x.replace(/brgy\.?\s*/g, 'barangay ');
    x = x.replace(/^barangay\s+(\d+)$/g, 'poblacion $1');
    x = x.replace(/barangay\s+no\.?\s*/g, 'poblacion ');
    x = x.replace(/barangay\s+/g, '');
    x = x.replace(/\bpob\.?\b/g, 'poblacion');
    x = x.replace(/[()]/g, ' ');
    x = x.replace(/\./g, ' ');
    x = x.replace(/\s+/g, ' ').trim();
    return x;
  }

  function extractReverseGeocodeCandidates(payload) {
    var out = [];
    if (!payload || typeof payload !== 'object') return out;
    var addr = payload.address || {};
    var keys = ['municipality', 'locality', 'district', 'suburb', 'village', 'hamlet', 'neighbourhood', 'quarter', 'city_district', 'town', 'city', 'province', 'state', 'region', 'county', 'state_district'];
    keys.forEach(function(k){
      if (addr[k]) out.push(String(addr[k]));
    });
    if (payload.name) out.push(String(payload.name));
    if (payload.display_name) {
      String(payload.display_name).split(',').forEach(function(part){
        var p = part.trim();
        if (p) out.push(p);
      });
    }
    // Add normalized numeric barangay hints when reverse geocoder returns "Barangay 1" style values.
    out.slice().forEach(function(c){
      var m = String(c).match(/\bbarangay\s*(?:no\.?\s*)?(\d+)\b/i);
      if (m && m[1]) out.push('Poblacion ' + m[1]);
    });
    var seen = {};
    var uniq = [];
    out.forEach(function(v){
      var key = String(v || '').trim().toLowerCase();
      if (!key) return;
      if (seen[key]) return;
      seen[key] = true;
      uniq.push(String(v).trim());
    });
    return uniq;
  }

  function findBestBarangayMatch(candidates, barangays) {
    if (!Array.isArray(candidates) || !Array.isArray(barangays) || !barangays.length) return '';
    var normalized = barangays.map(function(b){
      var name = (b && typeof b === 'object' && b.name) ? b.name : b;
      return { raw: name, norm: normalizeBarangayName(name) };
    });
    for (var i = 0; i < candidates.length; i++) {
      var candNorm = normalizeBarangayName(candidates[i]);
      if (!candNorm) continue;
      var exact = normalized.find(function(b){ return b.norm === candNorm; });
      if (exact) return exact.raw;
      var near = normalized.find(function(b){
        return candNorm.indexOf(b.norm) !== -1 || b.norm.indexOf(candNorm) !== -1;
      });
      if (near) return near.raw;
    }
    return '';
  }

  async function reverseGeocode(latitude, longitude) {
    var url = 'https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=' +
      encodeURIComponent(String(latitude)) + '&lon=' + encodeURIComponent(String(longitude)) +
      '&addressdetails=1&zoom=18';
    var res = await fetch(url, {
      headers: { 'Accept': 'application/json' }
    });
    if (!res.ok) throw new Error('Reverse geocode failed: HTTP ' + res.status);
    return res.json();
  }

  async function autoSelectBarangayFromGps(latitude, longitude, municipalityName, coverageMatch) {
    if (!barangayEl || !municipalityName) return '';
    var muni = municipalityData.find(function (m) { return m.name === municipalityName; });
    var barangays = muni && Array.isArray(muni.barangays) ? muni.barangays : [];
    var barangayNames = barangays.map(function(b) {
      return (b && typeof b === 'object' && b.name) ? b.name : b;
    });
    if (!barangayNames.length) return '';

    if (coverageMatch && coverageMatch.municipality === municipalityName && coverageMatch.barangay) {
      var coverageBarangay = findBestBarangayMatch([coverageMatch.barangay], barangays);
      if (coverageBarangay) {
        barangayEl.value = coverageBarangay;
        barangayEl.setAttribute('title', 'Auto-matched from SAMELCO coverage map');
        return coverageBarangay;
      }
    }

    try {
      var payload = await reverseGeocode(latitude, longitude);
      var candidates = extractReverseGeocodeCandidates(payload);
      var matched = findBestBarangayMatch(candidates, barangays);
      if (matched) {
        barangayEl.value = matched;
        barangayEl.setAttribute('title', 'Auto-captured from GPS location');
        return matched;
      }
    } catch (e) {
      console.warn('Barangay auto-detect unavailable:', e && e.message ? e.message : e);
    }
    return '';
  }

  async function initLocationDropdowns() {
    if (!municipalityEl || !barangayEl) return;
    municipalityData = Array.isArray(window.SAMELCO_MUNICIPALITIES) ? window.SAMELCO_MUNICIPALITIES : [];
    if (!municipalityData.length) {
      console.warn('Municipality dataset not found. Ensure municipalities-data.js is loaded before report.js.');
    }

    var excludedSet = (function(){
      var arr = ['calbayog city','tarangnan','almagro','santo niño','tagapul-an','santa margarita','gandara','pagsanghan','matuguinao','san jorge'];
      var o = {};
      arr.forEach(function(s){ o[s] = true; });
      return o;
    })();
    municipalityData = municipalityData.filter(function(m){
      var n = (m && m.name ? String(m.name).toLowerCase() : '');
      return !excludedSet[n];
    });

    var municipalityNames = municipalityData.map(function (m) { return m.name; });
    fillSelectOptions(municipalityEl, municipalityNames, 'Select municipality');
    fillSelectOptions(barangayEl, [], 'Select barangay');
    barangayEl.disabled = true;
    // Municipality is GPS-driven and cannot be changed manually.
    municipalityEl.disabled = true;
    municipalityEl.title = 'Automatically set from your current GPS location';
  }

  function setGpsStatus(text, ok) {
    if (!gpsStatus) return;
    gpsStatus.textContent = text;
    gpsStatus.style.color = '#111111';
  }

  initLocationDropdowns();

  function captureGpsCoordinates() {
    return new Promise(function (resolve, reject) {
      if (!navigator.geolocation) {
        setGpsStatus('Geolocation not supported in this browser.', false);
        reject(new Error('Geolocation not supported'));
        return;
      }

      setGpsStatus('Capturing GPS...', true);
      navigator.geolocation.getCurrentPosition(async function (pos) {
        latEl.value = pos.coords.latitude.toFixed(7);
        lngEl.value = pos.coords.longitude.toFixed(7);
        var lat = Number(latEl.value);
        var lng = Number(lngEl.value);
        
        try {
          var payload = await reverseGeocode(lat, lng);
          if (payload && payload.display_name && streetEl && !streetEl.value) {
            // Provide the exact address where the user is
            streetEl.value = payload.display_name;
            streetEl.classList.add('dirty');
            streetEl.dispatchEvent(new Event('input', { bubbles: true }));
            streetEl.dispatchEvent(new Event('change', { bubbles: true }));
          }
        } catch (e) {
          console.warn('Unable to reverse geocode exact location:', e);
        }

        var coverageMatch = findCoverageLocationFromGps(lat, lng);
        var detectedMunicipality = await autoSelectMunicipalityFromGps(lat, lng, coverageMatch);
        var detectedBarangay = '';
        if (detectedMunicipality) {
          detectedBarangay = await autoSelectBarangayFromGps(lat, lng, detectedMunicipality, coverageMatch);
        }
        var gpsText = 'GPS captured: ' + latEl.value + ', ' + lngEl.value;
        if (detectedMunicipality) {
          var selectedNow = (municipalityEl && municipalityEl.value) ? municipalityEl.value : '';
          if (selectedNow && selectedNow !== detectedMunicipality) {
            gpsText += ' | Nearby: ' + detectedMunicipality;
          } else {
            gpsText += ' | Municipality: ' + detectedMunicipality;
          }
        }
        if (detectedBarangay) gpsText += ' | Barangay: ' + detectedBarangay;
        if (coverageMatch && detectedMunicipality) gpsText += ' | Matched by coverage map';
        setGpsStatus(gpsText, true);
        resolve({ latitude: lat, longitude: lng, municipality: detectedMunicipality, barangay: detectedBarangay });
      }, function () {
        setGpsStatus('Unable to capture GPS. Please enable location permission and try again.', false);
        reject(new Error('Unable to capture GPS'));
      }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 });
    });
  }

  if (gpsBtn) {
    gpsBtn.addEventListener('click', async function () {
      try {
        await captureGpsCoordinates();
      } catch (_) {
        // Status is already updated in captureGpsCoordinates.
      }
    });
  }

  function autoCaptureGpsOnLoad() {
    if (!latEl || !lngEl) return;
    if (latEl.value && lngEl.value) return;
    captureGpsCoordinates().catch(function () {
      setGpsStatus('Auto GPS capture unavailable. Tap "Capture GPS".', false);
    });
  }

  autoCaptureGpsOnLoad();

  async function insertReport(row) {
    var headers = {
      'Content-Type': 'application/json',
      apikey: cfg.anonKey,
      Authorization: 'Bearer ' + cfg.anonKey,
      Prefer: 'return=representation'
    };
    var res = await fetch(cfg.url + '/rest/v1/' + cfg.reportsTable, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(row)
    });
    if (res.ok) return res.json();

    var errText = await res.text();
    var missingCol = /column .* does not exist|could not find the .* column/i.test(errText || '');
    if (missingCol) {
      var fallback = Object.assign({}, row);
      delete fallback.municipality;
      delete fallback.barangay;
      delete fallback.is_urgent;
      var retry = await fetch(cfg.url + '/rest/v1/' + cfg.reportsTable, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(fallback)
      });
      if (retry.ok) return retry.json();
      var retryErr = await retry.text();
      throw new Error(retryErr || ('HTTP ' + retry.status));
    }
    throw new Error(errText || ('HTTP ' + res.status));
  }

  function buildSubmitErrorMessage(err) {
    var msg = (err && err.message) ? String(err.message) : '';
    if (!msg) return 'Failed to submit report.';
    if (/assigned_team_snapshots/i.test(msg) && /does not exist|42P01/i.test(msg)) {
      return 'Failed to submit: Supabase schema is missing public.assigned_team_snapshots. Run sql/migrations/20260311_add_assigned_team_snapshots.sql in Supabase.';
    }
    if (/42P10|no unique or exclusion constraint matching the ON CONFLICT specification/i.test(msg)) {
      return 'Failed to submit: Supabase snapshot upsert is missing its unique constraint. Re-run sql/migrations/20260311_add_assigned_team_snapshots.sql in Supabase.';
    }
    if (/duplicate key value|reports_queue_number_unique_idx|queue_number/i.test(msg)) {
      return 'Failed to submit: queue sequence is out of sync. Ask admin to run sequence sync SQL in Supabase.';
    }
    if (/row-level security|permission denied|42501|401|403/i.test(msg)) {
      return 'Failed to submit: insert is blocked by Supabase RLS policy. Allow anon INSERT on public.reports.';
    }
    if (/column .* does not exist|could not find the .* column/i.test(msg)) {
      return 'Failed to submit: reports table schema is missing required columns.';
    }
    return 'Failed to submit: ' + msg;
  }

  if (form) {
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var lastTs = Number(localStorage.getItem('lastReportSubmitTs') || '0');
      if (Date.now() - lastTs < 30000) {
        alert('Please wait a few seconds before submitting again.');
        return;
      }
      var consent = document.getElementById('report-consent');
      if (consent && !consent.checked) {
        alert('Please read and check the consent box to proceed.');
        return;
      }
      if (!cfg.url || !cfg.anonKey || !cfg.reportsTable) {
        alert('Supabase config is missing.');
        return;
      }

      if (!latEl.value || !lngEl.value) {
        try {
          await captureGpsCoordinates();
        } catch (_) {
          alert('Exact location is required. Please allow GPS/location permission, then submit again.');
          return;
        }
      }

      var latitude = Number(latEl.value);
      var longitude = Number(lngEl.value);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        alert('Invalid GPS coordinates captured. Please tap "Capture GPS" and submit again.');
        return;
      }

      var coverageMatch = findCoverageLocationFromGps(latitude, longitude);
      if (coverageMatch && coverageMatch.municipality) {
        municipalityEl.value = coverageMatch.municipality;
        onMunicipalityChange();
        if (coverageMatch.barangay && barangayEl) {
          barangayEl.value = coverageMatch.barangay;
        }
      }

      var selectedMunicipality = municipalityEl ? municipalityEl.value : '';
      var selectedBarangay = barangayEl ? barangayEl.value : '';
      var streetValue = streetEl ? streetEl.value.trim() : '';
      if (!selectedMunicipality || !selectedBarangay || !streetValue) {
        alert('Please capture GPS, then select barangay and type the street.');
        return;
      }

      var descEl = document.getElementById('report-description');
      var description = descEl ? String(descEl.value || '').trim() : '';
      var urgentEl = document.getElementById('report-urgent');
      var row = {
        full_name: document.getElementById('report-name').value.trim(),
        contact: document.getElementById('report-contact').value.trim(),
        municipality: selectedMunicipality,
        barangay: selectedBarangay,
        is_urgent: !!(urgentEl && urgentEl.checked),
        location_text: streetValue + ', ' + selectedBarangay + ', ' + selectedMunicipality,
        issue_type: document.getElementById('report-issue').value.trim(),
        description: description,
        latitude: latitude,
        longitude: longitude,
        source: 'messenger_form'
      };

      try {
        // Let database sequence assign queue_number to avoid client-side race conditions.
        var inserted = await insertReport(row);
        var insertedRow = Array.isArray(inserted) && inserted.length ? inserted[0] : null;
        var finalQueue = insertedRow ? Number(insertedRow.queue_number) : NaN;
        var latestSummary = {
          reportId: insertedRow && insertedRow.id ? Number(insertedRow.id) : '',
          queueNumber: Number.isFinite(finalQueue) ? finalQueue : '',
          issueType: row.issue_type,
          locationText: row.location_text,
          municipality: selectedMunicipality,
          barangay: selectedBarangay,
          status: insertedRow && insertedRow.status ? insertedRow.status : 'pending',
          assignedTeam: insertedRow && insertedRow.assigned_team ? insertedRow.assigned_team : '',
          createdAt: insertedRow && insertedRow.created_at ? insertedRow.created_at : new Date().toISOString(),
          fullName: row.full_name,
          isUrgent: row.is_urgent
        };
        localStorage.setItem('latestUserReport', JSON.stringify(latestSummary));
        try {
          window.dispatchEvent(new CustomEvent('samelco:report-submitted', { detail: latestSummary }));
        } catch (e) {}

        // Send EmailJS auto-reply
        try {
          var userEmail = '';
          var userName = row.full_name || '';
          var sessionStr = localStorage.getItem('customerSession');
          if (sessionStr) {
            var sessionObj = JSON.parse(sessionStr);
            if (sessionObj.email) userEmail = sessionObj.email;
          }
          
          if (userEmail && typeof emailjs !== 'undefined') {
            emailjs.send(
              'service_asz4dsz', 
              'template_68dcpph', 
              {
                to_email: userEmail,
                to_name: userName,
                email: userEmail,
                name: userName,
                issue_type: row.issue_type,
                location: row.location_text,
                queue_number: Number.isFinite(finalQueue) ? finalQueue : 'N/A'
              }
            ).then(function() {
              console.log('Auto-reply email sent successfully.');
            }).catch(function(error) {
              console.error('Failed to send auto-reply email:', error);
            });
          }
        } catch (e) {
          console.error('Error triggering EmailJS:', e);
        }

        if (Number.isFinite(finalQueue)) {
          alert('Report submitted successfully. Your queue number is #' + finalQueue + '.');
        } else {
          alert('Report submitted successfully.');
        }
        localStorage.setItem('lastReportSubmitTs', String(Date.now()));
        form.reset();
        latEl.value = '';
        lngEl.value = '';
        if (barangayEl) {
          fillSelectOptions(barangayEl, [], 'Select barangay');
          barangayEl.disabled = true;
        }
        var storedName = localStorage.getItem('userName') || localStorage.getItem('signupName') || '';
        var nameEl = document.getElementById('report-name');
        if (nameEl && storedName) {
          nameEl.value = storedName;
        }
        setGpsStatus('GPS not captured yet', false);
      } catch (err) {
        console.error(err);
        alert(buildSubmitErrorMessage(err));
      }
    });
  }
});
