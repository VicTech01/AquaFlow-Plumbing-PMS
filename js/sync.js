/* AquaFlow PMS — sync core (merge engine).
   Works in the browser (window.SyncCore) and in Node/Electron (module.exports).
   Offline-first: every record carries updatedAt; merge = union of records,
   last-write-wins per record, tombstones for deletions, counters take the max. */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.SyncCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SYNC_COLLECTIONS = ['customers', 'technicians', 'jobs', 'quotes', 'invoices', 'inventory', 'maintenance', 'outbox', 'leads', 'expenses'];
  var TOMBSTONE_DAYS = 90;

  function isValidDb(d) {
    return !!d && d.v === 1 && Array.isArray(d.customers) && Array.isArray(d.jobs) && !!d.counters;
  }

  function recAt(r) { return r && r.updatedAt ? r.updatedAt : ''; }

  /* Merge remote INTO local. Returns a new db object.
     opts.direction: 'pull' (remote wins on ties), 'push' (local wins on ties), default balanced. */
  function mergeDbs(local, remote, opts) {
    opts = opts || {};
    if (!isValidDb(local) || !isValidDb(remote)) throw new Error('invalid db for merge');
    var out = JSON.parse(JSON.stringify(local));
    var lt = out.tombstones || (out.tombstones = []);
    var rt = remote.tombstones || [];

    function newestTomb(coll, id) {
      var best = null;
      lt.concat(rt).forEach(function (t) {
        if (t.coll === coll && t.id === id) {
          if (!best || t.at > best.at) best = t;
        }
      });
      return best;
    }

    SYNC_COLLECTIONS.forEach(function (coll) {
      var l = out[coll] || [];
      var r = remote[coll] || [];
      var map = {};
      var order = [];
      l.forEach(function (x) { map[x.id] = x; order.push(x.id); });
      r.forEach(function (x) {
        var o = map[x.id];
        if (!o) { map[x.id] = x; order.push(x.id); }
        else {
          var lu = recAt(o), ru = recAt(x);
          if (ru > lu) map[x.id] = x;
          else if (ru === lu) {
            // exact tie: prefer whichever side the merge direction favours
            var same = JSON.stringify(o) === JSON.stringify(x);
            if (!same && (opts.direction === 'push' || (opts.direction !== 'pull' && JSON.stringify(x).length > JSON.stringify(o).length))) map[x.id] = x;
          }
        }
      });
      order.forEach(function (id) {
        var t = newestTomb(coll, id);
        if (t && t.at >= recAt(map[id])) delete map[id];
      });
      out[coll] = order.filter(function (id) { return map[id]; }).map(function (id) { return map[id]; });
    });

    // counters: max per key (refs must never go backwards)
    var ck = {};
    (Object.keys(out.counters || {}).concat(Object.keys(remote.counters || {}))).forEach(function (k) {
      ck[k] = Math.max(out.counters[k] || 0, remote.counters[k] || 0);
    });
    out.counters = ck;

    // business settings: newer wins
    var bu = Math.max(out.businessUpdatedAt || '', remote.businessUpdatedAt || '');
    if (remote.businessUpdatedAt && remote.businessUpdatedAt >= (out.businessUpdatedAt || '')) out.business = JSON.parse(JSON.stringify(remote.business));
    out.businessUpdatedAt = bu;

    // meta (lastSync info): keep latest
    var meta = Object.assign({}, out.meta || {}, remote.meta || {});
    meta.mergedAt = new Date().toISOString();
    out.meta = meta;

    // tombstones: union, keep only ones within retention
    var cutoff = new Date(Date.now() - TOMBSTONE_DAYS * 86400000).toISOString();
    var seen = {};
    var t2 = [];
    lt.concat(rt).forEach(function (t) {
      var key = t.coll + '\u0000' + t.id;
      if (seen[key]) return;
      seen[key] = 1;
      if ((t.at || '') >= cutoff) t2.push(t);
    });
    out.tombstones = t2;

    out.lastMergedAt = new Date().toISOString();
    return out;
  }

  /* Stamp changed records with updatedAt and record deletions as tombstones.
     prevJson = JSON of the db before the mutation (null on first save). */
  function stampChanges(db, prevJson) {
    var prev = prevJson ? JSON.parse(prevJson) : null;
    var now = new Date().toISOString();
    if (!prev) return now;
    db.tombstones = db.tombstones || [];
    var oldMaps = {};
    SYNC_COLLECTIONS.forEach(function (coll) {
      var m = {};
      (prev[coll] || []).forEach(function (o) { m[o.id] = o; });
      oldMaps[coll] = m;
      (db[coll] || []).forEach(function (r) {
        var o = m[r.id];
        if (!o || JSON.stringify(o) !== JSON.stringify(r)) r.updatedAt = now;
      });
      (prev[coll] || []).forEach(function (o) {
        if (!(db[coll] || []).some(function (c) { return c.id === o.id; })) db.tombstones.push({ coll: coll, id: o.id, at: now });
      });
    });
    if (JSON.stringify(prev.counters || {}) !== JSON.stringify(db.counters)) db.countersUpdatedAt = now;
    if (JSON.stringify(prev.business || {}) !== JSON.stringify(db.business)) db.businessUpdatedAt = now;
    var cutoff = new Date(Date.now() - TOMBSTONE_DAYS * 86400000).toISOString();
    db.tombstones = db.tombstones.filter(function (t) { return (t.at || '') >= cutoff; });
    return now;
  }

  function recordCounts(db) {
    var c = {};
    SYNC_COLLECTIONS.forEach(function (coll) { c[coll] = (db[coll] || []).length; });
    return c;
  }

  return {
    SYNC_COLLECTIONS: SYNC_COLLECTIONS,
    isValidDb: isValidDb,
    mergeDbs: mergeDbs,
    stampChanges: stampChanges,
    recordCounts: recordCounts
  };
});
