
(function(){
  const K_PARTIDOS='newcom_partidos';
  const K_JORNADAS='newcom_jornadas';

  function leer(k, def=[]){
    try{
      const v=JSON.parse(localStorage.getItem(k)||'null');
      return v==null?def:v;
    }catch(e){ return def; }
  }
  function guardar(k,v){ localStorage.setItem(k,JSON.stringify(v)); }

  function partidos(){ return leer(K_PARTIDOS,[]); }
  function guardarPartidos(v){ guardar(K_PARTIDOS,v); }
  function jornadas(){ return leer(K_JORNADAS,[]); }

  function obtenerPartido(id){
    return partidos().find(p=>p.id===id)||null;
  }
  function actualizarPartido(id, cambios){
    const ps=partidos();
    const i=ps.findIndex(p=>p.id===id);
    if(i<0) return null;
    ps[i]={...ps[i],...cambios,actualizadoEn:new Date().toISOString()};
    guardarPartidos(ps);
    return ps[i];
  }
  function finalizados(){ return partidos().filter(p=>p.finalizado===true || p.estado==='FINALIZADO'); }

  function cfgPuntos(){
    return {
      g20:4,p20:1,g21:3,p21:2,npPresente:4,npAusente:0
    };
  }

  function tabla(){
    const rows={};
    function row(e){ if(!rows[e]) rows[e]={equipo:e,pj:0,pg20:0,pg21:0,pp12:0,pp02:0,np:0,pts:0,sg:0,sp:0,pf:0,pc:0}; return rows[e]; }
    for(const p of finalizados()){
      const a=row(p.equipoA), b=row(p.equipoB);
      a.pj++; b.pj++;
      const sa=Number(p.setsA ?? p.sets_a ?? 0), sb=Number(p.setsB ?? p.sets_b ?? 0);
      const ta=Number(p.tantosA ?? p.tantos_a ?? 0), tb=Number(p.tantosB ?? p.tantos_b ?? 0);
      const pa=Number(p.puntosA ?? p.puntos_a ?? 0), pb=Number(p.puntosB ?? p.puntos_b ?? 0);
      a.sg+=sa; a.sp+=sb; b.sg+=sb; b.sp+=sa;
      a.pf+=ta; a.pc+=tb; b.pf+=tb; b.pc+=ta;
      a.pts+=pa; b.pts+=pb;
      const np=(p.noPresentado||p.np||'NINGUNO');
      if(np==='EQUIPO A') a.np++;
      if(np==='EQUIPO B') b.np++;
      if(np==='NINGUNO' || !np){
        if(sa===2 && sb===0){a.pg20++;b.pp02++;}
        else if(sa===2 && sb===1){a.pg21++;b.pp12++;}
        else if(sb===2 && sa===0){b.pg20++;a.pp02++;}
        else if(sb===2 && sa===1){b.pg21++;a.pp12++;}
      }
    }
    return Object.values(rows).map(r=>({...r,ds:r.sg-r.sp,dt:r.pf-r.pc}))
      .sort((x,y)=> y.pts-x.pts || y.ds-x.ds || y.dt-x.dt || y.pf-x.pf || x.equipo.localeCompare(y.equipo,'es'));
  }

  window.NewcomData={partidos,jornadas,obtenerPartido,actualizarPartido,finalizados,tabla,cfgPuntos};
})();
