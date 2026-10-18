window.NewcomAutosave=(function(){
  const PREFIX='newcom_autosave_v12_26';
  const timers=new Map();
  function sesion(){try{return JSON.parse(localStorage.getItem('sesionNewcom')||'null')}catch(_){return null}}
  function slug(v){return String(v??'').replace(/[^a-zA-Z0-9_.@-]+/g,'_').slice(0,160)}
  function key(area,ctx={}){
    const s=sesion()||{};
    const quien=s.email||s.nombre||s.rol||'local';
    const extra=Object.keys(ctx).sort().map(k=>k+'='+slug(ctx[k])).join('|');
    return [PREFIX,slug(quien),slug(area),extra].filter(Boolean).join('::');
  }
  function save(k,data){
    try{localStorage.setItem(k,JSON.stringify({savedAt:Date.now(),data}));return true}catch(_){return false}
  }
  function load(k){try{return JSON.parse(localStorage.getItem(k)||'null')}catch(_){return null}}
  function clear(k){try{localStorage.removeItem(k)}catch(_){}}
  function schedule(k,getData,delay=500){
    clearTimeout(timers.get(k));
    timers.set(k,setTimeout(()=>{try{const d=getData();if(d&&d.__empty!==true)save(k,d)}catch(_){}},delay));
  }
  function fecha(ts){try{return new Intl.DateTimeFormat('es-AR',{dateStyle:'short',timeStyle:'short'}).format(new Date(ts))}catch(_){return''}}
  function offer(k,label='esta carga'){
    const r=load(k); if(!r||!r.data)return null;
    const ok=confirm(`Hay ${label} sin finalizar guardada localmente${r.savedAt?' ('+fecha(r.savedAt)+')':''}. ¿Querés recuperarla?`);
    return ok?r.data:null;
  }
  return{key,save,load,clear,schedule,offer};
})();
