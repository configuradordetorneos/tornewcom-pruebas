(function(){
  const VERSION='2026-09-04-v1';
  const PUBLIC_KEY='tornewcom_publico_legal_'+VERSION;

  function esPublica(){
    const p=(location.pathname||'').toLowerCase();
    return p.endsWith('/publico.html')||p.endsWith('/publico')||p.includes('publico.html');
  }

  function overlay(){
    if(document.getElementById('tornewcomLegalOverlay'))return document.getElementById('tornewcomLegalOverlay');
    const o=document.createElement('div');
    o.id='tornewcomLegalOverlay';
    o.style.cssText='position:fixed;inset:0;z-index:999999;background:rgba(5,25,43,.78);display:grid;place-items:center;padding:18px;font-family:Arial,Helvetica,sans-serif';
    o.innerHTML=`<div style="width:min(560px,100%);background:white;border-radius:18px;padding:24px 26px;box-shadow:0 22px 60px rgba(0,0,0,.34);color:#17324a">
      <h2 style="margin:0 0 10px;color:#174a73">Términos y Privacidad</h2>
      <p style="font-size:14px;line-height:1.5">Antes de continuar tenés que aceptar los Términos y Condiciones y la Política de Privacidad de TorNewcom.</p>
      <p style="font-size:13px;line-height:1.45;background:#eef5f9;padding:10px;border-radius:8px">Los usuarios que cargan datos de terceros son responsables de contar con autorización y de que la información sea correcta.</p>
      <p style="font-size:13px"><a href="terminos.html" target="_blank">Ver Términos y Condiciones</a> · <a href="terminos.html#privacidad" target="_blank">Ver Política de Privacidad</a></p>
      <label style="display:flex;gap:9px;align-items:flex-start;font-size:13px;line-height:1.4;margin:14px 0">
        <input id="legalCheck" type="checkbox" style="margin-top:3px">
        <span>He visto que existen estos documentos y acepto los Términos y la Política de Privacidad.</span>
      </label>
      <div id="legalMsg" style="font-size:12px;color:#9a2626;min-height:18px"></div>
      <button id="legalAceptar" style="width:100%;border:0;border-radius:9px;background:#2679d6;color:#fff;padding:11px;font-weight:800;cursor:pointer">Aceptar y continuar</button>
      <div style="text-align:center;margin-top:12px;font-size:12px;color:#637989">Contacto: WhatsApp 1122527681</div>
    </div>`;
    document.body.appendChild(o);
    return o;
  }

  async function aceptarPrivado(o){
    const check=document.getElementById('legalCheck');
    const msg=document.getElementById('legalMsg');
    if(!check?.checked){msg.textContent='Marcá la casilla para continuar.';return}
    const btn=document.getElementById('legalAceptar');
    btn.disabled=true;btn.textContent='Guardando aceptación…';
    try{
      const r=await window.NewcomSupabase.registrarAceptacionLegal(VERSION,navigator.userAgent||'');
      if(!r.ok)throw new Error(r.error||'No se pudo guardar la aceptación.');
      localStorage.setItem('tornewcom_legal_'+VERSION,'1');
      o.remove();
    }catch(e){
      msg.textContent='No se pudo registrar la aceptación: '+(e.message||e);
      btn.disabled=false;btn.textContent='Aceptar y continuar';
    }
  }

  function aceptarPublico(o){
    const check=document.getElementById('legalCheck');
    const msg=document.getElementById('legalMsg');
    if(!check?.checked){msg.textContent='Marcá la casilla para continuar.';return}
    localStorage.setItem(PUBLIC_KEY,'1');
    o.remove();
  }

  async function iniciar(){
    if(location.pathname.toLowerCase().includes('terminos.html'))return;

    // El Administrador General no necesita ver ni aceptar el aviso legal
    // en las pantallas privadas del sistema.
    try{
      const s=JSON.parse(localStorage.getItem('sesionNewcom')||'null');
      if(s&&(s.es_admin_general===true||s.rol==='ADMIN_GENERAL'))return;
    }catch(_){}

    if(esPublica()){
      if(localStorage.getItem(PUBLIC_KEY)==='1')return;
      const o=overlay();
      document.getElementById('legalAceptar').onclick=()=>aceptarPublico(o);
      return;
    }

    // Páginas privadas:
    // si ya aceptó esta versión en este navegador, NO dibujamos el cartel.
    // Esto evita el "flash" al navegar entre páginas.
    const localKey='tornewcom_legal_'+VERSION;
    if(localStorage.getItem(localKey)==='1'){
      // Verificación silenciosa en segundo plano. Si por algún motivo
      // la base no tuviera registrada la aceptación, se corrige en la
      // próxima navegación sin molestar visualmente al usuario.
      try{
        if(window.NewcomSupabase){
          const r=await window.NewcomSupabase.verificarAceptacionLegal(VERSION);
          if(r.ok&&!r.data)localStorage.removeItem(localKey);
        }
      }catch(_e){}
      return;
    }

    // Solo mostramos el cartel si todavía no existe una aceptación local.
    // Antes de mostrarlo, consultamos Supabase; si allí ya está aceptado,
    // guardamos la marca local y continuamos sin mostrar nada.
    try{
      if(window.NewcomSupabase){
        const r=await window.NewcomSupabase.verificarAceptacionLegal(VERSION);
        if(r.ok&&r.data){
          localStorage.setItem(localKey,'1');
          return;
        }
      }
    }catch(_e){}

    const o=overlay();
    const btn=document.getElementById('legalAceptar');
    btn.disabled=false;
    btn.textContent='Aceptar y continuar';
    btn.onclick=()=>aceptarPrivado(o);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',iniciar);
  else iniciar();
})();
