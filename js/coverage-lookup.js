(function () {
  function isFiniteNumber(value) {
    return Number.isFinite(Number(value));
  }

  function forEachCoordinate(coords, visit) {
    if (!Array.isArray(coords)) return;
    if (coords.length >= 2 && typeof coords[0] === 'number' && typeof coords[1] === 'number') {
      visit(coords);
      return;
    }
    coords.forEach(function (child) {
      forEachCoordinate(child, visit);
    });
  }

  function getFeatureBounds(feature) {
    if (!feature || !feature.geometry) return null;
    if (feature.__samelcoBounds) return feature.__samelcoBounds;

    var minLng = Infinity;
    var minLat = Infinity;
    var maxLng = -Infinity;
    var maxLat = -Infinity;

    forEachCoordinate(feature.geometry.coordinates, function (coord) {
      var lng = Number(coord[0]);
      var lat = Number(coord[1]);
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
      if (lng < minLng) minLng = lng;
      if (lat < minLat) minLat = lat;
      if (lng > maxLng) maxLng = lng;
      if (lat > maxLat) maxLat = lat;
    });

    if (!Number.isFinite(minLng) || !Number.isFinite(minLat) || !Number.isFinite(maxLng) || !Number.isFinite(maxLat)) {
      return null;
    }

    feature.__samelcoBounds = {
      minLng: minLng,
      minLat: minLat,
      maxLng: maxLng,
      maxLat: maxLat
    };
    return feature.__samelcoBounds;
  }

  function boundsContainPoint(bounds, lng, lat) {
    if (!bounds) return false;
    return lng >= bounds.minLng &&
      lng <= bounds.maxLng &&
      lat >= bounds.minLat &&
      lat <= bounds.maxLat;
  }

  function pointInRing(lng, lat, ring) {
    if (!Array.isArray(ring) || ring.length < 3) return false;
    var inside = false;
    for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      var xi = Number(ring[i][0]);
      var yi = Number(ring[i][1]);
      var xj = Number(ring[j][0]);
      var yj = Number(ring[j][1]);
      var intersects = ((yi > lat) !== (yj > lat)) &&
        (lng < ((xj - xi) * (lat - yi)) / ((yj - yi) || 1e-12) + xi);
      if (intersects) inside = !inside;
    }
    return inside;
  }

  function pointInPolygon(lng, lat, polygonCoords) {
    if (!Array.isArray(polygonCoords) || !polygonCoords.length) return false;
    if (!pointInRing(lng, lat, polygonCoords[0])) return false;
    for (var i = 1; i < polygonCoords.length; i++) {
      if (pointInRing(lng, lat, polygonCoords[i])) return false;
    }
    return true;
  }

  function featureContainsPoint(feature, latitude, longitude) {
    if (!feature || !feature.geometry || !isFiniteNumber(latitude) || !isFiniteNumber(longitude)) return false;
    var lat = Number(latitude);
    var lng = Number(longitude);
    var bounds = getFeatureBounds(feature);
    if (!boundsContainPoint(bounds, lng, lat)) return false;

    var geometry = feature.geometry;
    if (geometry.type === 'Polygon') {
      return pointInPolygon(lng, lat, geometry.coordinates);
    }
    if (geometry.type === 'MultiPolygon') {
      return geometry.coordinates.some(function (polygonCoords) {
        return pointInPolygon(lng, lat, polygonCoords);
      });
    }
    return false;
  }

  function findFeatureByPoint(geojson, latitude, longitude) {
    if (!geojson || !Array.isArray(geojson.features) || !isFiniteNumber(latitude) || !isFiniteNumber(longitude)) {
      return null;
    }
    for (var i = 0; i < geojson.features.length; i++) {
      var feature = geojson.features[i];
      if (featureContainsPoint(feature, latitude, longitude)) {
        return feature;
      }
    }
    return null;
  }

  function findLocationByPoint(geojson, latitude, longitude) {
    var feature = findFeatureByPoint(geojson, latitude, longitude);
    if (!feature || !feature.properties) return null;
    return {
      feature: feature,
      municipality: feature.properties.NAME_2 || '',
      barangay: feature.properties.NAME_3 || ''
    };
  }

  window.SAMELCO_COVERAGE_LOOKUP = {
    featureContainsPoint: featureContainsPoint,
    findFeatureByPoint: findFeatureByPoint,
    findLocationByPoint: findLocationByPoint,
    getFeatureBounds: getFeatureBounds
  };
})();
