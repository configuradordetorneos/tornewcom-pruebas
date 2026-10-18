(function(){
  'use strict';

  const PAGE=(location.pathname.split('/').pop()||'index.html').toLowerCase();
  const qs=new URLSearchParams(location.search);
  const modo=(qs.get('modo')||'').toLowerCase();

  function sesion(){
    try{return JSON.parse(localStorage.getItem('sesionNewcom')||'null')}catch(e){return null}
  }
  function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  function idTorneoDesdeUrl(){return qs.get('torneo')||''}

  const labels=['Torneo','Institución','Equipos','Categorías','Jornadas','Resultados','Publicación'];
  const helps=['Crear/administrar torneo','Cargar institución','Cargar equipos','Configurar reglas','Armar jornadas y partidos','Cargar/consultar resultados','Publicar torneo'];

  function currentIndex(estados){
    if(PAGE==='crear_torneo.html'||PAGE==='torneos.html') return 0;
    if(PAGE==='equipos.html'){
      if(estados && !estados[1]) return 1;
      return 2;
    }
    if(PAGE==='categorias.html') return 3;
    if(PAGE==='jornadas.html') return 4;
    if(PAGE==='partidos.html'||PAGE==='cargar_resultado.html'||PAGE==='historial_partidos.html') return 5;
    return -1;
  }

  function links(tid){
    const t=tid?`?torneo=${encodeURIComponent(tid)}`:'';
    return [
      'torneos.html',
      `equipos.html${t}`,
      `equipos.html${t}`,
      `categorias.html${t}`,
      `jornadas.html${t}`,
      `partidos.html${t}`,
      'torneos.html'
    ];
  }

  function css(){
    if(document.getElementById('tnGuiaGlobalCss'))return;
    const st=document.createElement('style');
    st.id='tnGuiaGlobalCss';
    st.textContent=`
      #tnGuiaGlobal{background:#fff;border-radius:14px;padding:13px 14px;margin:0 0 18px;box-shadow:0 5px 16px rgba(32,72,98,.09);border:1px solid #e2ebf1;color:#1f3342}
      #tnGuiaGlobal *{box-sizing:border-box}
      .tng-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:10px}
      .tng-title{font-size:14px;font-weight:900;color:#2F5D7E}.tng-title small{font-size:11px;font-weight:600;color:#728794;margin-left:7px}
      .tng-select{display:flex;align-items:center;gap:7px;font-size:11px;color:#607887;font-weight:700}
      .tng-select select{width:auto;max-width:260px;padding:6px 8px;border:1px solid #cbd9e2;border-radius:8px;background:#fff;color:#26465a;font-size:12px}
      .tng-line{display:flex;align-items:stretch;overflow-x:auto;padding:2px 1px 5px;scrollbar-width:thin}
      .tng-step{position:relative;min-width:115px;flex:1;text-decoration:none;color:#536d7d;padding:0 8px 4px 0;border-radius:8px}
      .tng-step:after{content:"";position:absolute;top:13px;left:29px;right:0;height:2px;background:#dbe5eb}.tng-step:last-child:after{display:none}
      .tng-dot{position:relative;z-index:2;width:27px;height:27px;border-radius:50%;display:grid;place-items:center;background:#cbd8e0;color:#fff;font-size:12px;font-weight:900;box-shadow:0 0 0 3px #fff}
      .tng-step strong{display:block;font-size:11px;line-height:1.15;margin-top:6px;color:#486273}.tng-step small{display:block;font-size:9.5px;line-height:1.2;margin-top:2px;color:#83949f}
      .tng-step.done .tng-dot{background:#2e7d4f}.tng-step.done:after{background:#8bc6a4}.tng-step.next .tng-dot{background:#4A90C2;box-shadow:0 0 0 3px #dceefa}.tng-step.next strong{color:#2F5D7E}
      .tng-step.here{background:#f0f7fb;outline:1px solid #a9cce2;padding-left:5px}.tng-step:hover{background:#f3f8fb}.tng-step.here:hover{background:#eaf5fb}
      .tng-status{font-size:10px;color:#607887;margin-top:7px}.tng-status b{color:#2F5D7E}
      @media(max-width:700px){#tnGuiaGlobal{padding:11px 10px}.tng-title small{display:none}.tng-step{min-width:105px}.tng-select{width:100%}.tng-select select{flex:1;max-width:none}}
    `;
    document.head.appendChild(st);
  }

  function mount(){
    let host=document.querySelector('main.wrap')||document.querySelector('.wrap');
    if(!host||document.getElementById('tnGuiaGlobal'))return null;
    const d=document.createElement('section');
    d.id='tnGuiaGlobal';
    host.insertBefore(d,host.firstChild);
    return d;
  }

  function renderSinTorneo(box){
    const l=links('');
    box.innerHTML=`<div class="tng-head"><div class="tng-title">Tu recorrido en TorNewcom <small>Guía rápida</small></div></div>
      <div class="tng-line">${labels.map((x,i)=>`<a class="tng-step ${i===0?'next here':''}" href="${l[i]}"><span class="tng-dot">${i+1}</span><strong>${esc(x)}</strong><small>${esc(helps[i])}</small></a>`).join('')}</div>
      <div class="tng-status"><b>Próximo paso:</b> crear tu primer torneo.</div>`;
  }

  async function estadoTorneo(tid){
    const [rt,ri,re,rc,rp]=await Promise.all([
      NewcomSupabase.listarTorneos(),
      NewcomSupabase.listarInstituciones(tid),
      NewcomSupabase.listarEquiposCompetitivos(tid),
      NewcomSupabase.listarCategoriasTorneo(tid,false),
      NewcomSupabase.listarPartidos(tid)
    ]);
    const fallo=[rt,ri,re,rc,rp].find(x=>!x?.ok);
    if(fallo) throw new Error(fallo.error||'No se pudo calcular el progreso');
    const torneo=(rt.data||[]).find(t=>t.id===tid);
    const partidos=rp.data||[];
    return {
      torneos:rt.data||[],
      estados:[true,(ri.data||[]).length>0,(re.data||[]).length>0,(rc.data||[]).length>0,partidos.length>0,partidos.some(p=>p.estado==='FINALIZADO'),!!torneo?.publicado]
    };
  }

  async function render(box,tid,torneos){
    box.innerHTML='<div class="tng-status">Calculando guía…</div>';
    try{
      const x=await estadoTorneo(tid);
      torneos=torneos||x.torneos;
      const estados=x.estados;
      const next=estados.findIndex(v=>!v);
      const here=currentIndex(estados);
      const l=links(tid);
      const complete=estados.filter(Boolean).length;
      box.innerHTML=`<div class="tng-head"><div class="tng-title">Tu recorrido en TorNewcom <small>${complete}/7 etapas completas</small></div>
        <label class="tng-select">Torneo <select id="tnGuiaTorneo">${(torneos||[]).map(t=>`<option value="${esc(t.id)}" ${t.id===tid?'selected':''}>${esc(t.nombre)}</option>`).join('')}</select></label></div>
        <div class="tng-line">${labels.map((lab,i)=>{const cls=[estados[i]?'done':(i===next?'next':''),i===here?'here':''].filter(Boolean).join(' ');const dot=estados[i]?'✓':String(i+1);return `<a class="tng-step ${cls}" href="${l[i]}"><span class="tng-dot">${dot}</span><strong>${esc(lab)}</strong><small>${esc(helps[i])}</small></a>`}).join('')}</div>
        <div class="tng-status">${next<0?'<b>Recorrido principal completo.</b>':`<b>Próximo paso:</b> ${esc(labels[next])}.`} Tocá cualquier etapa para ir directamente.</div>`;
      const sel=document.getElementById('tnGuiaTorneo');
      if(sel) sel.addEventListener('change',()=>{localStorage.setItem('tornewcomGuiaTorneo',sel.value);render(box,sel.value,torneos)});
    }catch(e){
      box.innerHTML=`<div class="tng-status">Guía disponible, pero no se pudo calcular el progreso en este momento.</div>`;
    }
  }

  async function init(){
    const s=sesion();
    if(!s||s.es_admin_general||modo==='responsable')return;
    const esOrg=!!(s.puede_crear_torneos||s.tiene_asignaciones_organizador);
    if(!esOrg||!window.NewcomSupabase)return;
    css();
    const box=mount();
    if(!box)return;
    try{
      const rt=await NewcomSupabase.listarTorneos();
      if(!rt.ok) throw new Error(rt.error||'Error');
      const torneos=rt.data||[];
      if(!torneos.length){renderSinTorneo(box);return}
      const url=idTorneoDesdeUrl();
      const saved=localStorage.getItem('tornewcomGuiaTorneo')||'';
      const tid=torneos.some(t=>t.id===url)?url:(torneos.some(t=>t.id===saved)?saved:torneos[0].id);
      localStorage.setItem('tornewcomGuiaTorneo',tid);
      await render(box,tid,torneos);
    }catch(e){
      renderSinTorneo(box);
    }
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(init,0));
  else setTimeout(init,0);
})();
