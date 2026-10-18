(function(){
  function sesionLocal(){
    try{return JSON.parse(localStorage.getItem('sesionNewcom')||'null')}catch(_){return null}
  }
  async function cerrar(){
    const b=document.getElementById('tnGlobalLogout');
    if(b){b.disabled=true;b.textContent='Cerrando…'}
    try{
      if(window.NewcomSupabase&&typeof NewcomSupabase.cerrarSesionAuth==='function')await NewcomSupabase.cerrarSesionAuth();
    }catch(_){}
    try{localStorage.removeItem('sesionNewcom')}catch(_){}
    location.replace('acceso_real.html');
  }
  function candidatos(){
    return [...document.querySelectorAll('button,a')].filter(el=>/^\s*cerrar sesi[oó]n\s*$/i.test(el.textContent||''));
  }
  function deduplicar(){
    const propios=[...document.querySelectorAll('#tnGlobalLogout')];
    if(propios.length>1)propios.slice(1).forEach(x=>x.remove());
    const principal=document.getElementById('tnGlobalLogout');
    candidatos().forEach(el=>{if(el!==principal)el.remove()});
  }
  async function sesionCoherente(){
    const app=sesionLocal();
    if(!app?.auth_real||!app?.user_id)return true;
    if(!(window.NewcomSupabase&&typeof NewcomSupabase.restaurarSesionAuth==='function'))return true;

    // Al cambiar de cuenta, Supabase puede tardar unas décimas en hidratar
    // la nueva sesión en una página recién cargada. No cerrar por el primer
    // resultado transitorio: reintentar y comparar la identidad restaurada.
    let ultimoId='';
    for(let intento=0;intento<4;intento++){
      try{
        const r=await NewcomSupabase.restaurarSesionAuth();
        const user=r?.session?.user||null;
        if(user?.id){
          ultimoId=String(user.id);
          if(ultimoId===String(app.user_id))return true;
        }
      }catch(_){}
      await new Promise(resolve=>setTimeout(resolve,250));
    }

    // Solo cerrar cuando, después de varios intentos, existe una identidad
    // autenticada distinta. Si Supabase todavía no devolvió usuario, dejamos
    // que la validación propia de la página decida sin provocar un rebote falso.
    if(ultimoId&&ultimoId!==String(app.user_id)){
      await cerrar();
      return false;
    }
    return true;
  }
  async function instalar(){
    if(!sesionLocal())return;
    // Esta capa sólo instala el botón global. La validación de Auth queda en
    // NewcomSupabase / cada pantalla para evitar dos restauraciones simultáneas.
    let b=document.getElementById('tnGlobalLogout');
    if(!b){
      b=document.createElement('button');
      b.id='tnGlobalLogout';
      b.type='button';
      b.textContent='Cerrar sesión';
      b.setAttribute('aria-label','Cerrar sesión de TorNewcom');
      b.style.cssText='position:fixed;right:18px;top:12px;z-index:9998;border:0;border-radius:9px;padding:9px 12px;background:#6c7f8d;color:#fff;font-weight:700;cursor:pointer;box-shadow:0 3px 10px rgba(0,0,0,.18)';
      b.addEventListener('click',cerrar);
      document.body.appendChild(b);
    }
    deduplicar();
    const obs=new MutationObserver(()=>deduplicar());
    obs.observe(document.body,{childList:true,subtree:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',instalar);else instalar();
})();
