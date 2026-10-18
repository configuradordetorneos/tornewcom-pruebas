window.NewcomRoles=(function(){
  function sesion(){
    try{return JSON.parse(localStorage.getItem('sesionNewcom')||'null')}catch(_){return null}
  }
  function sesionReal(){
    const s=sesion();
    return (s&&s.auth_real)?s:null;
  }
  function esAdmin(s=null){
    s=s||sesionReal();
    return !!(s&&(s.es_admin_general||s.rol==='ADMIN_GENERAL'));
  }
  function organizadorHabilitado(s=null){
    s=s||sesionReal();
    return !!(s&&(esAdmin(s)||s.puede_crear_torneos===true||s.organizador_habilitado===true));
  }
  function tieneResponsabilidades(s=null){
    s=s||sesionReal();
    return !!(s&&(s.tiene_responsabilidades===true||(s.permisos||[]).some(p=>p.rol==='RESPONSABLE'&&p.activo!==false)));
  }
  function tieneAsignacionesOrganizador(s=null){
    s=s||sesionReal();
    return !!(s&&(s.tiene_asignaciones_organizador===true||(s.permisos||[]).some(p=>p.rol==='ORGANIZADOR'&&p.activo!==false)));
  }
  function tieneRol(rol,s=null){
    s=s||sesionReal();
    if(!s)return false;
    if(rol==='ADMIN_GENERAL')return esAdmin(s);
    if(rol==='ORGANIZADOR')return esAdmin(s)||organizadorHabilitado(s);
    if(rol==='RESPONSABLE')return tieneResponsabilidades(s);
    if(rol==='USUARIO')return true;
    return false;
  }
  function es(...roles){
    const s=sesionReal();
    return !!s&&roles.some(r=>tieneRol(r,s));
  }
  function permisoEnTorneo(torneoId,rol){
    const s=sesionReal();
    if(!s)return false;
    if(esAdmin(s))return true;
    if(rol==='ORGANIZADOR'){
      if(!organizadorHabilitado(s))return false;
      return (s.permisos||[]).some(p=>p.activo!==false&&String(p.torneo_id)===String(torneoId)&&p.rol==='ORGANIZADOR');
    }
    if(rol==='RESPONSABLE'){
      return (s.permisos||[]).some(p=>p.activo!==false&&String(p.torneo_id)===String(torneoId)&&p.rol==='RESPONSABLE');
    }
    return false;
  }
  function institucionPermitida(torneoId,institucionId){
    const s=sesionReal();
    if(!s)return false;
    if(esAdmin(s))return true;
    if(permisoEnTorneo(torneoId,'ORGANIZADOR'))return true;
    return (s.permisos||[]).some(p=>
      p.activo!==false&&String(p.torneo_id)===String(torneoId)&&
      p.rol==='RESPONSABLE'&&String(p.institucion_id)===String(institucionId)
    );
  }
  function exigir(roles,opciones={}){
    const s=sesionReal();
    if(!s){location.replace('acceso_real.html');return null}
    if(!roles.some(r=>tieneRol(r,s))){
      alert(opciones.mensaje||'No tenés permiso para ingresar a esta sección.');
      location.replace(opciones.destino||'index.html');
      return null;
    }
    return s;
  }
  async function salir(){
    try{if(window.NewcomSupabase)await NewcomSupabase.cerrarSesionAuth()}catch(_){}
    localStorage.removeItem('sesionNewcom');
    location.href='acceso_real.html';
  }
  return{
    sesion:sesionReal,es,exigir,tieneRol,esAdmin,organizadorHabilitado,
    tieneResponsabilidades,tieneAsignacionesOrganizador,permisoEnTorneo,
    institucionPermitida,salir
  };
})();