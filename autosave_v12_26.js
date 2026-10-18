(function(global){
  'use strict';

  const PREFIX='tornewcom.autosave.v1';
  const TTL_MS=14*24*60*60*1000;
  const pending=new Map();

  function storageOk(){
    try{
      const k=PREFIX+'.__test__';
      localStorage.setItem(k,'1');
      localStorage.removeItem(k);
      return true;
    }catch(_){return false}
  }
  const enabled=storageOk();

  function safePart(v){
    return encodeURIComponent(String(v??'').trim());
  }

  function key(tipo, contexto){
    const parts=[PREFIX,safePart(tipo||'borrador')];
    if(contexto && typeof contexto==='object'){
      Object.keys(contexto).sort().forEach(k=>{
        const v=contexto[k];
        if(v!==undefined && v!==null && String(v)!=='') parts.push(safePart(k)+'='+safePart(v));
      });
    }
    return parts.join(':');
  }

  function write(k, producer){
    if(!enabled || !k || typeof producer!=='function') return;
    let data;
    try{ data=producer(); }catch(_){ return; }
    if(!data || data.__empty){
      try{ localStorage.removeItem(k); }catch(_){}
      return;
    }
    try{
      localStorage.setItem(k,JSON.stringify({saved_at:Date.now(),data:data}));
    }catch(_){}
  }

  function schedule(k, producer, delay){
    if(!enabled || !k || typeof producer!=='function') return;
    const prev=pending.get(k);
    if(prev && prev.timer) clearTimeout(prev.timer);
    const task={producer:producer,timer:null};
    task.timer=setTimeout(()=>{
      pending.delete(k);
      write(k,producer);
    },Number.isFinite(Number(delay))?Math.max(0,Number(delay)):250);
    pending.set(k,task);
  }

  function flush(){
    if(!enabled) return;
    for(const [k,task] of pending.entries()){
      if(task.timer) clearTimeout(task.timer);
      write(k,task.producer);
    }
    pending.clear();
  }

  function offer(k){
    if(!enabled || !k) return null;
    let raw;
    try{ raw=localStorage.getItem(k); }catch(_){ return null; }
    if(!raw) return null;
    try{
      const parsed=JSON.parse(raw);
      const savedAt=Number(parsed?.saved_at||0);
      if(savedAt && Date.now()-savedAt>TTL_MS){
        localStorage.removeItem(k);
        return null;
      }
      // Compatibilidad por si alguna versión anterior guardó directamente el objeto.
      return (parsed && Object.prototype.hasOwnProperty.call(parsed,'data')) ? parsed.data : parsed;
    }catch(_){
      try{ localStorage.removeItem(k); }catch(__){}
      return null;
    }
  }

  function clear(k){
    if(!k) return;
    const task=pending.get(k);
    if(task && task.timer) clearTimeout(task.timer);
    pending.delete(k);
    if(!enabled) return;
    try{ localStorage.removeItem(k); }catch(_){}
  }

  // En celular, apagar la pantalla o pasar a otra app puede suspender timers.
  // Por eso forzamos el guardado justo cuando la página queda oculta o se abandona.
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='hidden') flush();
  });
  window.addEventListener('pagehide',flush);

  global.NewcomAutosave={key,schedule,offer,clear,flush,enabled};
})(window);
