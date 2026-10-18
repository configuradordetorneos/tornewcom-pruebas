(function(){
  'use strict';

  const exact = {
    'cierre de listas':'Definir, modificar o reabrir el cierre de las listas de participación.',
    'solicitudes':'Revisar solicitudes de cambios realizadas sobre listas cerradas.',
    'solicitudes de cambios':'Revisar solicitudes de cambios realizadas sobre listas cerradas.',
    'administrar':'Abrir la administración principal de este torneo.',
    'editar configuración':'Modificar categorías, edades, reglas y configuración del torneo.',
    'equipos':'Administrar instituciones y equipos de este torneo.',
    'jornadas':'Crear y organizar jornadas y partidos del torneo.',
    'partidos':'Consultar, cargar o corregir partidos y resultados.',
    'tabla':'Consultar la tabla de posiciones del torneo.',
    'partidos finalizados':'Consultar los partidos que ya tienen resultado cargado.',
    'vista pública':'Abrir la consulta pública del sistema.',
    'ver público':'Abrir este torneo como lo ve un visitante.',
    'publicar torneo':'Hacer visible este torneo en la consulta pública.',
    'ocultar torneo':'Quitar este torneo de la consulta pública sin eliminarlo.',
    'publicar programación':'Mostrar públicamente los partidos pendientes de este torneo.',
    'ocultar programación':'Ocultar públicamente los partidos pendientes del torneo.',
    '+ crear torneo':'Crear un torneo nuevo.',
    'crear torneo →':'Crear un torneo nuevo.',
    'guardar institución':'Guardar los datos de la institución y habilitar la carga de equipos.',
    '+ cargar equipo':'Agregar un equipo dentro de esta institución.',
    'editar institución':'Modificar los datos de esta institución.',
    'ver lista de participación':'Consultar qué jugadores integran la lista de participación y en qué equipo.',
    'lista de participación':'Consultar qué jugadores integran la lista de participación y en qué equipo.',
    'solicitar alta':'Pedir incorporar un jugador de Mis jugadores a una lista cerrada.',
    'baja / reasignación':'Pedir una baja o cambiar un jugador de equipo con la lista cerrada.',
    'solicitar baja':'Pedir quitar este jugador de la lista cerrada.',
    'reasignar':'Pedir mover este jugador a otro equipo de la misma institución y torneo.',
    'editar':'Modificar los datos de este elemento.',
    'eliminar':'Eliminar este elemento. Puede requerir confirmación.',
    'eliminar torneo':'Eliminar definitivamente este torneo. Acción reservada al Administrador General.',
    'guardar jugador':'Guardar los datos del jugador.',
    'guardar en mis jugadores':'Guardar al jugador en tu base personal para reutilizarlo en otros torneos.',
    'agregar seleccionados al torneo':'Asignar al torneo los jugadores seleccionados de tu base personal.',
    'guardar asignación':'Guardar la asignación del jugador al equipo seleccionado.',
    'enviar solicitud':'Enviar la solicitud de cambio de la lista de participación.',
    'enviar':'Enviar el mensaje al destinatario seleccionado.',
    'actualizar':'Volver a cargar la información mostrada en esta pantalla.',
    'ver mensaje':'Abrir el contenido completo de este mensaje.',
    'ocultar':'Ocultar nuevamente el contenido del mensaje.',
    'cerrar todas ahora':'Cerrar inmediatamente las listas de todas las categorías del torneo.',
    'reabrir todas':'Reabrir las listas de todas las categorías del torneo.',
    'aplicar fecha a todas':'Aplicar la misma fecha de cierre a todas las categorías del torneo.',
    'guardar categoría':'Guardar la configuración de esta categoría.',
    'cancelar edición':'Descartar la edición actual y volver al estado anterior.',
    '+ crear jornada / partidos':'Crear una nueva jornada y cargar sus partidos.',
    '+ agregar partido':'Agregar otro partido a esta jornada.',
    'guardar jornada':'Guardar la jornada y sus partidos.',
    'imprimir / guardar pdf':'Abrir la impresión del navegador para imprimir o guardar esta vista como PDF.',
    'actualizar tabla':'Recalcular y volver a mostrar la tabla de posiciones.',
    'cargar documento':'Adjuntar un documento al torneo.',
    'subir documento del equipo':'Adjuntar un documento correspondiente a este equipo.',
    'descargar reglamento':'Descargar el reglamento disponible.',
    'planillas tipo':'Abrir las planillas modelo disponibles.',
    'guardar borrador':'Guardar el resultado sin finalizar todavía el partido.',
    'suspender partido':'Marcar el partido como suspendido sin cargar un resultado final.',
    'finalizar partido':'Guardar el resultado y marcar el partido como finalizado.',
    'habilitar corrección':'Permitir modificar un resultado que ya fue finalizado.',
    'crear nueva oportunidad':'Crear una nueva instancia para completar o corregir la carga.',
    'cerrar sesión':'Salir de la cuenta actual.',
    'abrir administración completa':'Abrir el panel completo de administración.',
    'alertas':'Consultar alertas pendientes relacionadas con el torneo o los planteles.',
    'mis jugadores':'Abrir tu base personal de jugadores.',
    'mis equipos':'Consultar los equipos vinculados a tu institución.',
    'mis partidos jugados':'Consultar los partidos ya disputados de tus equipos.',
    'tabla de posiciones':'Consultar la posición de tus equipos en el torneo.',
    'ingresar':'Ingresar con el usuario y contraseña cargados.',
    'crear mi cuenta':'Registrar una nueva cuenta de acceso.',
    '👤 crear cuenta':'Registrar una nueva cuenta de acceso.',
    '🏆 ver resultados':'Consultar resultados públicos sin administrar el torneo.',
    'ver resultados sin registrarme':'Consultar la información pública sin crear una cuenta.',
    'enviar enlace de recuperación':'Enviar al correo un enlace para restablecer la contraseña.',
    'guardar nueva contraseña':'Guardar la nueva contraseña elegida.',
    'solicitar un nuevo enlace':'Solicitar otro enlace de recuperación de contraseña.',
    'ir a ingresar':'Volver a la pantalla de acceso.',
    'cancelar':'Cancelar la acción actual sin guardar cambios.'
  };

  const rules = [
    [/^ver \/ corregir resultado$/i,'Abrir el resultado de este partido para consultarlo o corregirlo.'],
    [/^cargar resultado$/i,'Cargar el resultado de este partido.'],
    [/^cerrar/i,'Cerrar la lista o sección indicada.'],
    [/^reabrir/i,'Volver a habilitar modificaciones en la lista indicada.'],
    [/^guardar/i,'Guardar los cambios realizados en esta pantalla.'],
    [/^volver|^←/i,'Volver a la pantalla anterior.'],
    [/^ir a /i,'Abrir la sección indicada.'],
    [/^crear /i,'Crear el elemento indicado.'],
    [/^publicar /i,'Hacer visible públicamente la información indicada.'],
    [/^ocultar /i,'Dejar de mostrar públicamente la información indicada.']
  ];

  function normalizar(s){
    return String(s||'').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim().toLowerCase();
  }

  function textoElemento(el){
    if(!el) return '';
    if(el.tagName==='INPUT') return el.value||el.getAttribute('aria-label')||'';
    return (el.innerText||el.textContent||'').replace(/\s+/g,' ').trim();
  }

  function ayudaPara(el){
    const propia=el.getAttribute('data-help');
    if(propia) return propia;
    const txt=textoElemento(el);
    const key=normalizar(txt);
    if(!key) return '';
    if(exact[key]) return exact[key];
    for(const [rx,msg] of rules){ if(rx.test(txt)) return msg; }
    return '';
  }

  function esAccion(el){
    if(!el || !el.matches) return false;
    return el.matches('button, input[type="button"], input[type="submit"], a.btn, a.miniBtn, a.action, [role="button"], [data-tn-help], [data-help]');
  }

  function preparar(root){
    const scope=root && root.querySelectorAll ? root : document;
    const elems=[];
    if(root && root.nodeType===1 && esAccion(root)) elems.push(root);
    scope.querySelectorAll && scope.querySelectorAll('button, input[type="button"], input[type="submit"], a.btn, a.miniBtn, a.action, [role="button"], [data-tn-help], [data-help]').forEach(e=>elems.push(e));
    elems.forEach(el=>{
      const help=ayudaPara(el);
      if(!help) return;
      el.setAttribute('data-tn-help',help);
      // Evitar el tooltip nativo del navegador: usamos uno solo, el de TorNewcom.
      if(el.hasAttribute('title')) el.removeAttribute('title');
      if(!el.getAttribute('aria-label')){
        const txt=textoElemento(el);
        if(txt) el.setAttribute('aria-label',txt);
      }
    });
  }

  function instalarEstilo(){
    if(document.getElementById('tn-tooltip-style')) return;
    const style=document.createElement('style');
    style.id='tn-tooltip-style';
    style.textContent=`
      #tn-global-tooltip{position:fixed;z-index:2147483647;max-width:290px;padding:8px 10px;border-radius:8px;background:#17324a;color:#fff;font:12px/1.35 Arial,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.22);pointer-events:none;opacity:0;visibility:hidden;transition:opacity .12s ease;}
      #tn-global-tooltip.visible{opacity:1;visibility:visible;}
    `;
    document.head.appendChild(style);
  }

  function tooltip(){
    let tip=document.getElementById('tn-global-tooltip');
    if(!tip){ tip=document.createElement('div'); tip.id='tn-global-tooltip'; tip.setAttribute('role','tooltip'); document.body.appendChild(tip); }
    return tip;
  }

  function mostrar(el){
    const help=el && (el.getAttribute('data-tn-help')||ayudaPara(el));
    if(!help) return;
    const tip=tooltip();
    tip.textContent=help;
    tip.classList.add('visible');
    tip.style.left='8px'; tip.style.top='8px';
    requestAnimationFrame(()=>{
      const r=el.getBoundingClientRect(), tr=tip.getBoundingClientRect();
      let left=r.left+(r.width-tr.width)/2;
      left=Math.max(8,Math.min(left,window.innerWidth-tr.width-8));
      let top=r.bottom+8;
      if(top+tr.height>window.innerHeight-8) top=Math.max(8,r.top-tr.height-8);
      tip.style.left=Math.round(left)+'px'; tip.style.top=Math.round(top)+'px';
    });
  }

  function ocultar(){ const tip=document.getElementById('tn-global-tooltip'); if(tip) tip.classList.remove('visible'); }

  function iniciar(){
    instalarEstilo(); preparar(document);
    const obs=new MutationObserver(muts=>muts.forEach(m=>m.addedNodes.forEach(n=>{if(n.nodeType===1) preparar(n);}))); 
    obs.observe(document.documentElement,{childList:true,subtree:true});

    document.addEventListener('pointerover',e=>{
      if(e.pointerType && e.pointerType!=='mouse' && e.pointerType!=='pen') return;
      const el=e.target.closest && e.target.closest('button, input[type="button"], input[type="submit"], a.btn, a.miniBtn, a.action, [role="button"], [data-tn-help], [data-help]');
      if(el) mostrar(el);
    });
    document.addEventListener('pointerout',e=>{
      const from=e.target.closest && e.target.closest('button, input[type="button"], input[type="submit"], a.btn, a.miniBtn, a.action, [role="button"], [data-tn-help], [data-help]');
      if(from) ocultar();
    });
    document.addEventListener('focusin',e=>{ const el=e.target; if(esAccion(el)) mostrar(el); });
    document.addEventListener('focusout',ocultar);
    window.addEventListener('scroll',ocultar,true);
    window.addEventListener('resize',ocultar);
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',iniciar,{once:true}); else iniciar();
})();
