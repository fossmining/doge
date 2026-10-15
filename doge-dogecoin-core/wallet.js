/* Dogecoin watch-only wallet UI with Trezor signing.
   No framework, no third-party code except Trezor Connect, which is only
   loaded from connect.trezor.io after the user explicitly clicks. */
(function () {
  'use strict';

  var CONNECT_SRC = 'https://connect.trezor.io/9/trezor-connect.js';
  var MANIFEST = { email: 'satsondefi@users.noreply.github.com', appUrl: 'https://github.com/satsondefi/dogecoin-core' };

  var state = null;      // last /api/wallet/status
  var pending = null;    // last built transaction
  var connectReady = null;

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s === undefined || s === null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function show(el, on) { el.classList.toggle('hide', !on); }
  function msg(id, text, cls) { var el = $(id); el.textContent = text || ''; el.className = 'msg' + (cls ? ' ' + cls : ''); }
  function fmt(d) { return d === undefined || d === null ? '-' : String(d); }
  function when(t) { return t ? new Date(t * 1000).toLocaleString() : '-'; }

  function api(path, body) {
    var opts = { headers: { 'X-Doge-Wallet': '1' } };
    if (body !== undefined) { opts.method = 'POST'; opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    return fetch(path, opts).then(function (r) {
      return r.json().catch(function () { return { error: 'HTTP ' + r.status }; }).then(function (j) {
        if (!r.ok || j.error) { throw new Error(j.error || ('HTTP ' + r.status)); }
        return j;
      });
    });
  }

  /* ---------- tabs ---------- */
  var navButtons = document.querySelectorAll('nav button');
  function tab(name) {
    navButtons.forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-tab') === name); });
    document.querySelectorAll('section').forEach(function (s) { s.classList.toggle('on', s.id === 'tab-' + name); });
    if (name === 'receive') { renderReceive(); }
  }
  navButtons.forEach(function (b) { b.addEventListener('click', function () { tab(b.getAttribute('data-tab')); }); });

  /* ---------- status ---------- */
  function refresh() {
    return api('api/wallet/status').then(function (s) {
      state = s;
      show($('errbar'), false);
      render();
    }).catch(function (e) {
      $('errbar').textContent = 'Wallet backend: ' + e.message;
      show($('errbar'), true);
    });
  }
  function nodeState() {
    fetch('api/status').then(function (r) { return r.json(); }).then(function (s) {
      var el = $('nodestate');
      el.textContent = 'node: ' + s.state + (s.progress !== undefined && s.state !== 'synced' ? ' ' + (Math.floor(s.progress * 1000) / 10) + '%' : '');
      el.className = 'badge ' + (s.state === 'synced' ? 'ok' : s.state === 'syncing' ? 'warn' : '');
    }).catch(function () {});
  }

  function render() {
    var s = state;
    var hot = parseFloat(s.hot_balance || '0');
    show($('hotwarn'), hot > 0);
    $('hotbal').textContent = s.hot_balance || '';
    show($('rescanwarn'), !!(s.rescan && s.rescan.running));
    if (s.rescan && s.rescan.running) { $('rescanstart').textContent = when(s.rescan.started); }
    if (s.rescan && s.rescan.error) { $('errbar').textContent = 'Rescan failed: ' + s.rescan.error; show($('errbar'), true); }
    if (s.error) { $('errbar').textContent = s.error; show($('errbar'), true); }

    show($('noacct'), !s.imported);
    show($('acct'), s.imported);
    show($('setupform'), !s.imported);
    show($('setupdone'), s.imported);
    if (!s.imported) { return; }

    var a = s.account;
    $('bal').innerHTML = s.balance ? esc(s.balance.confirmed) + ' <small>DOGE</small>' : '…';
    $('unbal').innerHTML = s.balance ? esc(s.balance.unconfirmed) + ' <small>DOGE</small>' : '…';
    $('acctinfo').innerHTML = "m/44'/3'/" + a.index + "' · <code>" + esc(a.fingerprint) + '</code>';
    $('addrcount').textContent = a.receive_count + ' + ' + a.change_count + ' change';
    $('st-fp').textContent = a.fingerprint;
    $('st-acct').textContent = a.index;
    $('st-xpub').textContent = a.xpub;
    $('st-count').textContent = a.receive_count + ' receive, ' + a.change_count + ' change (gap limit ' + s.gap_limit + ')';
    if (!$('feerate').value) { $('feerate').value = s.fee.default_per_kb; }

    var tt = $('txtable');
    if (s.transactions && s.transactions.length) {
      tt.innerHTML = '<tr><th>Date</th><th>Txid</th><th>Conf.</th><th style="text-align:right">Amount</th></tr>' + s.transactions.map(function (t) {
        var neg = t.net.charAt(0) === '-';
        return '<tr><td>' + esc(when(t.time)) + '</td><td><code>' + esc(t.txid) + '</code></td><td>' + esc(t.confirmations) + '</td><td class="num" style="color:' + (neg ? 'var(--bad)' : 'var(--ok)') + '">' + (neg ? '' : '+') + esc(t.net) + '</td></tr>';
      }).join('');
    } else { tt.innerHTML = '<tr><td class="msg">No transactions yet</td></tr>'; }
    var ut = $('utxotable');
    if (s.utxos && s.utxos.length) {
      ut.innerHTML = '<tr><th>Address</th><th>Outpoint</th><th>Conf.</th><th style="text-align:right">DOGE</th></tr>' + s.utxos.map(function (u) {
        return '<tr><td><code>' + esc(u.address) + '</code><br><span class="msg">' + (u.change ? 'change' : 'receive') + ' #' + u.index + '</span></td><td><code>' + esc(u.txid) + ':' + u.vout + '</code></td><td>' + esc(u.confirmations) + '</td><td class="num">' + esc(u.amount) + '</td></tr>';
      }).join('');
    } else { ut.innerHTML = '<tr><td class="msg">None</td></tr>'; }
    renderReceive();
  }

  function renderReceive() {
    if (!state || !state.imported || !state.receive) { $('rcvaddr').textContent = state && state.imported ? '…' : 'Link an account in Setup first'; $('rcvpath').textContent = '-'; return; }
    $('rcvaddr').textContent = state.receive.address;
    $('rcvpath').textContent = state.receive.path;
  }

  $('copyaddr').addEventListener('click', function () {
    if (state && state.receive && navigator.clipboard) { navigator.clipboard.writeText(state.receive.address); this.textContent = 'copied'; var b = this; setTimeout(function () { b.textContent = 'copy'; }, 1200); }
  });

  /* ---------- Trezor Connect (loaded on demand) ---------- */
  function loadConnect() {
    if (connectReady) { return connectReady; }
    connectReady = new Promise(function (resolve, reject) {
      if (window.TrezorConnect) { return resolve(window.TrezorConnect); }
      if (!window.confirm('Load Trezor Connect from connect.trezor.io now?\n\nThis is the only third-party code this page ever loads. Make sure Trezor Suite is open (or use Chrome/Chromium for WebUSB).')) {
        connectReady = null; return reject(new Error('cancelled'));
      }
      var sc = document.createElement('script');
      sc.src = CONNECT_SRC;
      sc.onload = function () {
        try {
          window.TrezorConnect.init({ lazyLoad: true, manifest: MANIFEST }).then(function () { resolve(window.TrezorConnect); }, reject);
        } catch (e) { reject(e); }
      };
      sc.onerror = function () { connectReady = null; reject(new Error('Could not load Trezor Connect (blocked or offline)')); };
      document.head.appendChild(sc);
    });
    return connectReady;
  }

  function accountPath() { return "m/44'/3'/" + state.account.index + "'"; }

  /* Make sure the connected device actually owns the linked account before
     asking it to sign or show anything. */
  function verifyDevice(TC) {
    return TC.getPublicKey({ path: accountPath(), coin: 'doge', showOnTrezor: false }).then(function (r) {
      if (!r.success) { throw new Error(r.payload.error); }
      var forms = state.account.xpub_forms || [state.account.xpub];
      if (forms.indexOf(r.payload.xpub) === -1) {
        throw new Error('The connected Trezor (or its passphrase) does not match the linked account. Check the device / passphrase.');
      }
      return TC;
    });
  }

  $('verifyaddr').addEventListener('click', function () {
    if (!state || !state.receive) { return; }
    msg('rcvmsg', 'Connecting…');
    loadConnect().then(verifyDevice).then(function (TC) {
      return TC.getAddress({ path: state.receive.path, coin: 'doge', showOnTrezor: true });
    }).then(function (r) {
      if (!r.success) { throw new Error(r.payload.error); }
      if (r.payload.address !== state.receive.address) {
        msg('rcvmsg', 'MISMATCH: device shows ' + r.payload.address + ' but this page derived ' + state.receive.address + '. Do not use this address.', 'bad');
      } else {
        msg('rcvmsg', 'Device confirms this address. Compare the characters on the Trezor screen with the ones above.', 'ok');
      }
    }).catch(function (e) { msg('rcvmsg', e.message, 'bad'); });
  });

  /* ---------- send ---------- */
  $('sendmax').addEventListener('change', function () { $('amount').disabled = this.checked; $('subfee').disabled = this.checked; });

  $('build').addEventListener('click', function () {
    msg('buildmsg', 'Building…');
    show($('review'), false); show($('signed'), false); pending = null;
    api('api/wallet/build', {
      to: $('to').value, amount: $('amount').value, fee_per_kb: $('feerate').value,
      subtract_fee: $('subfee').checked, send_max: $('sendmax').checked
    }).then(function (tx) {
      pending = tx;
      msg('buildmsg', '');
      $('rv-to').textContent = tx.to;
      $('rv-amt').textContent = tx.amount + ' DOGE';
      $('rv-fee').textContent = tx.fee + ' DOGE (' + tx.fee_per_kb + ' DOGE/kB, ~' + tx.size_estimate + ' bytes)';
      $('rv-change').textContent = tx.change ? tx.change.amount + ' DOGE → ' + tx.change.address + ' (change #' + tx.change.index + ')' : 'none';
      $('rv-in').innerHTML = tx.inputs.map(function (i) { return esc(i.prev_hash) + ':' + i.prev_index + ' (' + (Number(i.amount) / 1e8) + ' DOGE)'; }).join('<br>');
      msg('signmsg', '');
      show($('review'), true);
      $('review').scrollIntoView({ behavior: 'smooth' });
    }).catch(function (e) { msg('buildmsg', e.message, 'bad'); });
  });

  $('signtrezor').addEventListener('click', function () {
    if (!pending) { return; }
    var tx = pending;
    msg('signmsg', 'Connecting to Trezor… confirm each screen on the device.');
    loadConnect().then(verifyDevice).then(function (TC) {
      var inputs = tx.inputs.map(function (i) { return { address_n: i.address_n, prev_hash: i.prev_hash, prev_index: i.prev_index, amount: i.amount, script_type: i.script_type }; });
      return TC.signTransaction({ coin: 'doge', inputs: inputs, outputs: tx.outputs, refTxs: tx.refTxs, push: false });
    }).then(function (r) {
      if (!r.success) { throw new Error(r.payload.error); }
      $('signedhex').value = r.payload.serializedTx;
      show($('signed'), true);
      msg('signmsg', 'Signed on device. Review once more, then broadcast through your node.', 'ok');
      return api('api/wallet/decode', { hex: r.payload.serializedTx }).then(function (d) {
        var bad = d.outputs.filter(function (o) { return o.address !== tx.to && !o.mine; });
        if (bad.length) { msg('bcastmsg', 'WARNING: signed transaction pays an address that is neither the recipient nor your change. Do not broadcast.', 'bad'); $('bcast').disabled = true; }
        else { $('bcast').disabled = false; msg('bcastmsg', 'txid ' + d.txid); }
      });
    }).catch(function (e) { msg('signmsg', e.message, 'bad'); });
  });

  $('dlunsigned').addEventListener('click', function () {
    if (!pending) { return; }
    var blob = new Blob([JSON.stringify({ unsigned_hex: pending.unsigned_hex, inputs: pending.inputs, outputs: pending.outputs, fee: pending.fee, refTxs: pending.refTxs }, null, 1)], { type: 'application/json' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'doge-unsigned-' + Date.now() + '.json'; a.click();
  });
  $('copyunsigned').addEventListener('click', function () { if (pending && navigator.clipboard) { navigator.clipboard.writeText(pending.unsigned_hex); this.textContent = 'copied'; } });

  $('bcast').addEventListener('click', function () {
    var hex = $('signedhex').value;
    if (!hex || !window.confirm('Broadcast this transaction to the Dogecoin network through your node? This cannot be undone.')) { return; }
    $('bcast').disabled = true;
    api('api/wallet/broadcast', { hex: hex }).then(function (r) {
      msg('bcastmsg', 'Broadcast. txid ' + r.txid, 'ok');
      pending = null;
      setTimeout(refresh, 1500);
    }).catch(function (e) { msg('bcastmsg', e.message, 'bad'); $('bcast').disabled = false; });
  });
  $('cancelsigned').addEventListener('click', function () { $('signedhex').value = ''; show($('signed'), false); show($('review'), false); pending = null; });

  /* ---------- broadcast tab ---------- */
  $('decode').addEventListener('click', function () {
    $('bcast2').disabled = true; show($('dectable'), false);
    api('api/wallet/decode', { hex: $('rawhex').value }).then(function (d) {
      $('dectable').innerHTML = '<tr><th>Txid</th><td><code>' + esc(d.txid) + '</code></td></tr><tr><th>Signed</th><td>' + (d.signed ? 'yes' : '<span style="color:var(--bad)">no</span>') + '</td></tr>' +
        d.outputs.map(function (o) { return '<tr><th>Output ' + o.n + (o.mine ? ' (yours)' : '') + '</th><td><code>' + esc(o.address || 'non-standard') + '</code> · ' + esc(o.value) + ' DOGE</td></tr>'; }).join('');
      show($('dectable'), true);
      $('bcast2').disabled = !d.signed;
      msg('decmsg', d.signed ? 'Check every output above before broadcasting.' : 'Not signed; cannot broadcast.', d.signed ? '' : 'bad');
    }).catch(function (e) { msg('decmsg', e.message, 'bad'); });
  });
  $('bcast2').addEventListener('click', function () {
    if (!window.confirm('Broadcast this transaction through your node? This cannot be undone.')) { return; }
    $('bcast2').disabled = true;
    api('api/wallet/broadcast', { hex: $('rawhex').value }).then(function (r) { msg('decmsg', 'Broadcast. txid ' + r.txid, 'ok'); setTimeout(refresh, 1500); })
      .catch(function (e) { msg('decmsg', e.message, 'bad'); $('bcast2').disabled = false; });
  });

  /* ---------- setup ---------- */
  $('doimport').addEventListener('click', function () {
    var key = $('xpub').value.trim();
    if (/^(xprv|dgpv)/i.test(key)) { msg('setupmsg', 'That is a PRIVATE key. Never paste it anywhere. Clear it and export the public key instead.', 'bad'); $('xpub').value = ''; return; }
    var since = $('since').value ? Math.floor(new Date($('since').value + 'T00:00:00Z').getTime() / 1000) - 86400 : null;
    msg('setupmsg', 'Importing…');
    api('api/wallet/import', { xpub: key, account: Number($('acctidx').value || 0), since: since }).then(function (r) {
      $('xpub').value = '';
      msg('setupmsg', r.rescan ? 'Linked. Rescanning history in the background.' : 'Linked.', 'ok');
      return refresh().then(function () { tab('overview'); });
    }).catch(function (e) { msg('setupmsg', e.message, 'bad'); });
  });
  $('forget').addEventListener('click', function () {
    if (!window.confirm('Forget the linked Trezor account on this node? (No coins are affected; your keys are on the Trezor.)')) { return; }
    api('api/wallet/forget', {}).then(refresh).catch(function (e) { $('errbar').textContent = e.message; show($('errbar'), true); });
  });

  refresh(); nodeState();
  setInterval(function () { refresh(); nodeState(); }, 15000);
})();
