(function(){
  'use strict';

  const exact = {
    'administrar': ['⚙️','Administrar este torneo.'],
    'administrar torneos': ['⚙️','Abrir la administración de torneos.'],
    'administrar / eliminar': ['⚙️','Abrir la administración del torneo y sus opciones.'],
    'abrir administración completa': ['⚙️','Abrir el panel completo de administración.'],
    'alertas': ['⚠️','Consultar las alertas pendientes.'],
    'equipos': ['👥','Administrar o consultar equipos.'],
    'mis equipos': ['👥','Consultar tus equipos.'],
    'mis jugadores': ['👥','Abrir tu Bolsa de jugadores.'],
    'bolsa de jugadores': ['👥','Abrir la Bolsa permanente de jugadores.'],
    'lista de participación': ['📋','Consultar la lista de participación.'],
    'solicitudes': ['📨','Revisar solicitudes de cambios.'],
    'solicitudes de cambios': ['📨','Revisar solicitudes de cambios.'],
    'categorías y edades': ['🏷️','Configurar categorías y edades.'],
    'cierre de listas': ['🔒','Administrar el cierre de listas de participación.'],
    'tabla': ['📊','Consultar la tabla de posiciones.'],
    'tabla de posiciones': ['📊','Consultar la tabla de posiciones.'],
    'partidos': ['🏐','Consultar los partidos.'],
    'partidos finalizados': ['✅','Consultar los partidos finalizados.'],
    'mis partidos jugados': ['✅','Consultar tus partidos ya jugados.'],
    'jornadas': ['📅','Administrar jornadas y partidos.'],
    'mis jornadas': ['📅','Consultar tus jornadas y partidos.'],
    'partidos jugados': ['✅','Consultar los partidos ya jugados.'],
    'ir a partidos': ['🏐','Ir a la pantalla de partidos.'],
    'vista pública': ['👁️','Abrir la vista pública.'],
    'ver público': ['👁️','Abrir este torneo como lo ve un visitante.'],
    'ver resultados': ['🏆','Consultar resultados.'],
    'ver tabla': ['📊','Consultar la tabla de posiciones.'],
    'guardar borrador': ['💾','Guardar el resultado como borrador.'],
    'suspender partido': ['⏸️','Marcar el partido como suspendido.'],
    'finalizar partido': ['✅','Guardar y finalizar el partido.'],
    'habilitar corrección': ['✏️','Habilitar la corrección del resultado.'],
    'crear nueva oportunidad': ['➕','Crear una nueva oportunidad de carga o corrección.'],
    'aplicar fecha a todas': ['📅','Aplicar la misma fecha a todas las categorías.'],
    'cerrar todas ahora': ['🔒','Cerrar ahora todas las listas del torneo.'],
    'cerrar ahora': ['🔒','Cerrar ahora la lista indicada.'],
    'reabrir todas': ['🔓','Reabrir todas las listas del torneo.'],
    'guardar sistema de puntuación': ['💾','Guardar el sistema de puntuación.'],
    'guardar categoría': ['💾','Guardar la categoría.'],
    'cancelar edición': ['✖️','Cancelar la edición actual.'],
    'guardar institución': ['💾','Guardar la institución.'],
    'guardar jugador': ['💾','Guardar el jugador.'],
    'guardar en la bolsa': ['💾','Guardar el jugador en la Bolsa permanente.'],
    'guardar en mis jugadores': ['💾','Guardar el jugador en tu Bolsa permanente.'],
    'guardar asignación': ['💾','Guardar la asignación del jugador.'],
    'agregar seleccionados a la lista': ['➕','Agregar los jugadores seleccionados a la lista de participación.'],
    'agregar seleccionados al torneo': ['➕','Agregar los jugadores seleccionados al torneo.'],
    'continuar con alta': ['➡️','Continuar con el alta de los jugadores seleccionados.'],
    'continuar con solicitud': ['➡️','Continuar con la solicitud de los jugadores seleccionados.'],
    'continuar': ['➡️','Continuar con el siguiente paso.'],
    'solicitar alta': ['➕','Solicitar el alta de un jugador.'],
    'solicitar baja': ['➖','Solicitar la baja de este jugador.'],
    'baja / reasignación': ['🔄','Solicitar una baja o una reasignación.'],
    'reasignar': ['🔄','Reasignar el jugador a otro equipo.'],
    'resolver: aprobar': ['✅','Aprobar esta solicitud.'],
    'rechazar': ['❌','Rechazar esta solicitud.'],
    'enviar solicitud': ['📤','Enviar la solicitud.'],
    'enviar': ['📤','Enviar.'],
    'actualizar': ['🔃','Actualizar la información mostrada.'],
    'imprimir / guardar pdf': ['🖨️','Imprimir o guardar esta vista como PDF.'],
    'descargar reglamento': ['⬇️','Descargar el reglamento.'],
    'planillas tipo': ['📄','Abrir las planillas modelo.'],
    'cargar documento': ['📄','Cargar un documento.'],
    'subir documento del equipo': ['📄','Subir un documento del equipo.'],
    'cerrar sesión': ['🚪','Cerrar la sesión actual.'],
    'autorizar a crear torneos': ['✅','Autorizar a este usuario a crear y administrar torneos.'],
    'suspender creación/administración': ['⏸️','Suspender la autorización para crear y administrar torneos.'],
    'asignar': ['👤','Asignar un Organizador.'],
    'cambiar': ['✏️','Cambiar la asignación actual.'],
    'entrar': ['➡️','Entrar a esta sección.'],
    'publicar / eliminar': ['⚙️','Abrir opciones de publicación o eliminación.'],
    'editar configuración': ['✏️','Editar la configuración del torneo.'],
    'publicar torneo': ['🌐','Publicar el torneo.'],
    'ocultar torneo': ['🚫','Ocultar el torneo de la vista pública.'],
    'publicar programación': ['🌐','Publicar la programación.'],
    'ocultar programación': ['🚫','Ocultar la programación.'],
    'quitar': ['➖','Quitar este elemento.'],
    'quitar de la lista': ['➖','Quitar este jugador de la lista de participación.'],
    'cancelar': ['✖️','Cancelar esta acción.']
  };

  const rules = [
    [/^guardar\b/i,'💾','Guardar los cambios.'],
    [/^editar\b/i,'✏️','Editar este elemento.'],
    [/^eliminar\b/i,'🗑️','Eliminar este elemento.'],
    [/^crear\b/i,'➕','Crear un nuevo elemento.'],
    [/^\+\s*crear\b/i,'➕','Crear un nuevo elemento.'],
    [/^\+\s*cargar\b/i,'➕','Agregar un nuevo elemento.'],
    [/^\+\s*agregar\b/i,'➕','Agregar un nuevo elemento.'],
    [/^cargar\b/i,'➕','Cargar información.'],
    [/^agregar\b/i,'➕','Agregar información.'],
    [/^quitar\b/i,'➖','Quitar este elemento.'],
    [/^ver\b/i,'👁️','Ver esta información.'],
    [/^abrir\b/i,'👁️','Abrir esta sección.'],
    [/^volver\b/i,'↩️','Volver a la pantalla anterior.'],
    [/^←\s*/i,'↩️','Volver a la pantalla anterior.'],
    [/^ir a\b/i,'➡️','Ir a la sección indicada.'],
    [/^publicar\b/i,'🌐','Publicar esta información.'],
    [/^ocultar\b/i,'🚫','Ocultar esta información.'],
    [/^descargar\b/i,'⬇️','Descargar este archivo.'],
    [/^imprimir\b/i,'🖨️','Imprimir o guardar como PDF.'],
    [/^actualizar\b/i,'🔃','Actualizar la información.'],
    [/^enviar\b/i,'📤','Enviar esta información.'],
    [/^cerrar\b/i,'🔒','Cerrar la opción indicada.'],
    [/^reabrir\b/i,'🔓','Reabrir la opción indicada.']
  ];

  const statuses = {
    'PENDIENTE': ['⏳','Pendiente de resolución.'],
    'APROBADA': ['✅','Solicitud aprobada.'],
    'APLICADA': ['✅','Solicitud aprobada y aplicada.'],
    'RECHAZADA': ['❌','Solicitud rechazada.'],
    'LISTA ABIERTA': ['🔓','Lista de participación abierta.'],
    'LISTA CERRADA': ['🔒','Lista de participación cerrada.'],
    'ACTIVO': ['▶️','Torneo activo.'],
    'FINALIZADO': ['✅','Torneo finalizado.'],
    'ARCHIVADO': ['📦','Torneo archivado.'],
    'PAPELERA': ['🗑️','Torneo en papelera.'],
    'BORRADOR': ['📝','Torneo en borrador.']
  };

  function norm(s){
    return String(s||'').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim().toLowerCase();
  }

  function visibleText(el){
    return String(el.innerText||el.textContent||'').replace(/\s+/g,' ').trim();
  }

  function alreadyHasGraphicPrefix(t){
    return /^(?:←|→|↩|\+|➕|➖|🔄|✅|❌|⏳|🔒|🔓|✏️|🗑️|👁️?|👤|👥|🏆|💾|📤|🔃|🖨️|📊|📅|📄|⚠️|🚪|🌐|🚫|⏸️|🏐|⚙️|➡️|⬇️)/u.test(t);
  }

  function definitionFor(t){
    const k=norm(t);
    if(exact[k]) return exact[k];
    for(const [rx,icon,help] of rules){ if(rx.test(t)) return [icon,help]; }
    return null;
  }

  function decorateAction(el){
    if(!el || !el.matches || el.matches('input')) return;
    const t=visibleText(el);
    if(!t) return;
    const def=definitionFor(t);
    if(!def) return;
    const [icon,help]=def;
    if(!alreadyHasGraphicPrefix(t)) el.setAttribute('data-tn-icon',icon);
    else el.removeAttribute('data-tn-icon');
    if(!el.getAttribute('data-help')) el.setAttribute('data-help',help);
    el.setAttribute('data-tn-help',el.getAttribute('data-help')||help);
    if(!el.getAttribute('aria-label')) el.setAttribute('aria-label',t.replace(/^←\s*/,'Volver '));
  }

  function decorateStatuses(root){
    const els=(root||document).querySelectorAll ? (root||document).querySelectorAll('.pill,.badge,.tag,.estado,.status') : [];
    els.forEach(el=>{
      if(el.children.length) return;
      const t=visibleText(el).toUpperCase();
      const def=statuses[t];
      if(!def) return;
      el.setAttribute('data-tn-icon',def[0]);
      if(!el.getAttribute('data-help')) el.setAttribute('data-help',def[1]);
      el.setAttribute('data-tn-help',el.getAttribute('data-help')||def[1]);
      if(!el.getAttribute('aria-label')) el.setAttribute('aria-label',t);
      if(!el.hasAttribute('tabindex')) el.setAttribute('tabindex','0');
    });
  }

  function prepare(root){
    const scope=root && root.querySelectorAll ? root : document;
    if(root && root.nodeType===1 && root.matches('button,a.btn,a.miniBtn,a.action,[role="button"]')) decorateAction(root);
    scope.querySelectorAll('button,a.btn,a.miniBtn,a.action,[role="button"]').forEach(decorateAction);
    decorateStatuses(root && root.nodeType===1 ? root : document);
  }

  function installStyle(){
    if(document.getElementById('tn-icon-style')) return;
    const st=document.createElement('style');
    st.id='tn-icon-style';
    st.textContent=`
      [data-tn-icon]::before{content:attr(data-tn-icon);display:inline-block;margin-right:.38em;line-height:1;vertical-align:-.05em}
      .tn-icon-only{display:inline-flex;align-items:center;justify-content:center;min-width:32px;min-height:28px;padding:4px 7px;border-radius:8px;background:#eef4f7;color:#244a64;font-size:18px;line-height:1;cursor:help;white-space:nowrap}
      .tn-icon-only[data-role="ORGANIZADOR"]{background:#fff4dd;color:#715b20}
      .tn-icon-only[data-role="RESPONSABLE"]{background:#eaf4fb;color:#2f5d7e}
      .tn-icon-only:focus{outline:2px solid #4A90C2;outline-offset:2px}
      .tn-compact-cell{text-align:center!important;vertical-align:middle!important}
    `;
    document.head.appendChild(st);
  }

  function init(){
    installStyle();
    prepare(document);
    const obs=new MutationObserver(muts=>{
      muts.forEach(m=>{
        if(m.type==='childList'){
          if(m.target && m.target.nodeType===1) prepare(m.target);
          m.addedNodes.forEach(n=>{if(n.nodeType===1) prepare(n)});
        }
      });
    });
    obs.observe(document.documentElement,{childList:true,subtree:true});
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true}); else init();
})();
