var showPass=false,last=null;
function n(x){return (x===null||x===undefined)?'-':Number(x).toLocaleString()}
function esc(s){return String(s===undefined||s===null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
function dur(s){if(!s)return '-';var d=Math.floor(s/86400),h=Math.floor(s%86400/3600),m=Math.floor(s%3600/60);return (d?d+'d ':'')+h+'h '+m+'m'}
function row(k,v,copy){return '<tr><th>'+esc(k)+'</th><td><code>'+esc(v)+'</code>'+(copy?'<button data-c="'+esc(v)+'">copy</button>':'')+'</td></tr>'}
function renderConn(c){
 var pass=showPass?c.rpc_pass:'••••••••••••';
 var h=row('RPC host (from Umbrel apps)',c.node_host,true)+row('RPC port',c.rpc_port,true)+row('RPC user',c.rpc_user,true)+
 '<tr><th>RPC password</th><td><code>'+esc(pass)+'</code><button id="tog">'+(showPass?'hide':'show')+'</button><button data-c="'+esc(c.rpc_pass)+'">copy</button></td></tr>'+
 row('ZMQ hashblock','tcp://'+c.node_host+':'+c.zmq.hashblock,true)+row('ZMQ rawblock','tcp://'+c.node_host+':'+c.zmq.rawblock,true)+
 row('ZMQ rawtx','tcp://'+c.node_host+':'+c.zmq.rawtx,true)+row('P2P (inbound peers)',c.device+':'+c.p2p_port,true);
 document.getElementById('conn').innerHTML=h;
 document.getElementById('tog').onclick=function(){showPass=!showPass;renderConn(c)};
}
document.addEventListener('click',function(e){var v=e.target.getAttribute&&e.target.getAttribute('data-c');if(v!==null&&v!==undefined&&navigator.clipboard){navigator.clipboard.writeText(v);e.target.textContent='copied';setTimeout(function(){e.target.textContent='copy'},1200)}});
function render(s){
 var st=document.getElementById('state');st.textContent=s.state;st.className='badge '+s.state;
 var p=s.progress||0;document.getElementById('pct').textContent=(s.state==='starting')?'Starting…':(Math.floor(p*1000)/10)+'%';
 document.getElementById('barfill').style.width=(p*100)+'%';
 document.getElementById('msg').textContent=s.message?s.message:(s.headers?('Block '+n(s.blocks)+' of '+n(s.headers)+' headers'):'');
 document.getElementById('blocks').textContent=n(s.blocks);
 document.getElementById('peers').textContent=s.connections===undefined?'-':s.connections+' ('+s.inbound+' in / '+s.outbound+' out)';
 document.getElementById('mempool').textContent=s.mempool_txs===undefined?'-':n(s.mempool_txs)+' txs';
 document.getElementById('size').textContent=s.size_on_disk?(s.size_on_disk/1e9).toFixed(1)+' GB':'-';
 document.getElementById('ver').textContent=(s.subversion||('v'+s.connection.version));
 if(s.uptime){document.getElementById('upwrap').hidden=false;document.getElementById('uptime').textContent=dur(s.uptime)}
 if(!last){renderConn(s.connection)}
 var pt=document.getElementById('peertable');
 if(s.peers&&s.peers.length){pt.innerHTML='<tr><th>Address</th><td><b>Client · direction</b></td></tr>'+s.peers.map(function(p){return '<tr><th><code>'+esc(p.addr)+'</code></th><td>'+esc(p.subver)+' · '+(p.inbound?'inbound':'outbound')+'</td></tr>'}).join('')}
 last=s;
}
function tick(){fetch('api/status').then(function(r){return r.json()}).then(render).catch(function(){}).then(function(){setTimeout(tick,5000)})}
tick();
