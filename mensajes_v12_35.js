window.TorNewcomMensajes=(function(){
  function cfg(){ return window.NEWCOM_SUPABASE||{}; }

  async function clientePrivado(){
    if(!window.NewcomSupabase || !window.supabase) throw new Error('Supabase no disponible.');
    const r=await NewcomSupabase.restaurarSesionAuth();
    if(!r.ok || !r.session?.access_token) throw new Error(r.error||'No hay sesión autenticada.');
    const c=cfg();
    if(!c.url||!c.anonKey) throw new Error('Supabase no configurado.');
    return window.supabase.createClient(c.url,c.anonKey,{
      auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
      global:{headers:{Authorization:'Bearer '+r.session.access_token}}
    });
  }

  function clientePublico(){
    const c=cfg();
    if(!window.supabase||!c.url||!c.anonKey) throw new Error('Supabase no configurado.');
    return window.supabase.createClient(c.url,c.anonKey,{
      auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}
    });
  }

  async function rpcPrivado(nombre,args={}){
    try{
      const db=await clientePrivado();
      const {data,error}=await db.rpc(nombre,args);
      return error?{ok:false,error:error.message,data:null}:{ok:true,data};
    }catch(e){ return {ok:false,error:e?.message||String(e),data:null}; }
  }

  async function contarNoLeidos(){ return rpcPrivado('contar_mensajes_no_leidos'); }
  async function listar(limite=20){ return rpcPrivado('mis_mensajes_internos',{p_limite:limite}); }
  async function destinatarios(){ return rpcPrivado('mis_destinatarios_mensajeria'); }
  async function marcarLeido(id){ return rpcPrivado('marcar_mensaje_leido',{p_mensaje:id}); }
  async function eliminar(id){ return rpcPrivado('eliminar_mensaje_interno',{p_mensaje:id}); }
  async function enviar(destinatarioId,torneoId,asunto,mensaje){
    return rpcPrivado('enviar_mensaje_interno',{
      p_destinatario:destinatarioId,
      p_torneo:torneoId||null,
      p_asunto:asunto||null,
      p_mensaje:mensaje||''
    });
  }

  async function enviarMultiple(destinatarios,torneoId,asunto,mensaje){
    return rpcPrivado('enviar_mensaje_interno_multiple',{
      p_destinatarios:destinatarios,
      p_torneo:torneoId||null,
      p_asunto:asunto||null,
      p_mensaje:mensaje||''
    });
  }

  async function novedades(limite=3){
    try{
      const db=clientePublico();
      const {data,error}=await db.rpc('consulta_novedades',{p_limite:limite});
      return error?{ok:false,error:error.message,data:[]}:{ok:true,data:data||[]};
    }catch(e){ return {ok:false,error:e?.message||String(e),data:[]}; }
  }

  return {contarNoLeidos,listar,destinatarios,marcarLeido,eliminar,enviar,enviarMultiple,novedades};
})();
