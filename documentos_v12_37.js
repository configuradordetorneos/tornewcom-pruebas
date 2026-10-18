window.TorNewcomDocumentos=(function(){
  const BUCKET='tournament-docs';

  function config(){return window.NEWCOM_SUPABASE||{}}
  function respaldo(){
    try{return JSON.parse(localStorage.getItem('tornewcomSupabaseSession')||'null')}catch(_){return null}
  }
  function cliente(){
    const c=config(),r=respaldo();
    if(!(window.supabase&&c.url&&c.anonKey&&r?.access_token))return null;
    return window.supabase.createClient(c.url,c.anonKey,{
      auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
      global:{headers:{Authorization:'Bearer '+r.access_token}}
    });
  }
  function errorMsg(e){return e?.message||String(e||'Error desconocido')}
  function limpiarNombreArchivo(nombre){
    const s=String(nombre||'archivo')
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .replace(/[^a-zA-Z0-9._-]+/g,'-')
      .replace(/-+/g,'-')
      .replace(/^-|-$/g,'');
    return s||'archivo';
  }
  async function preparar(){
    if(!window.NewcomSupabase)return{ok:false,error:'No está disponible la conexión con Supabase.'};
    const r=await NewcomSupabase.restaurarSesionAuth();
    if(!r.ok)return r;
    return cliente()?{ok:true}:{ok:false,error:'No se pudo preparar la sesión para documentos.'};
  }
  async function listar(torneoId){
    const pr=await preparar();if(!pr.ok)return pr;
    const db=cliente();
    const {data,error}=await db.from('documentos_torneo')
      .select('id,torneo_id,nombre_visible,archivo_nombre,storage_path,mime_type,tamano_bytes,creado_por,creado_en,actualizado_en')
      .eq('torneo_id',torneoId)
      .order('creado_en',{ascending:false});
    return error?{ok:false,error:error.message}:{ok:true,data:data||[]};
  }
  async function subir(torneoId,nombreVisible,archivo,userId){
    const pr=await preparar();if(!pr.ok)return pr;
    if(!torneoId)return{ok:false,error:'Falta identificar el torneo.'};
    if(!String(nombreVisible||'').trim())return{ok:false,error:'Escribí el nombre del documento.'};
    if(!archivo)return{ok:false,error:'Elegí un archivo.'};
    if(archivo.size>20*1024*1024)return{ok:false,error:'El archivo supera el máximo de 20 MB.'};
    const permitidos=new Set([
      'application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ]);
    if(archivo.type&&!permitidos.has(archivo.type))return{ok:false,error:'Usá un archivo PDF, Word o Excel.'};

    const db=cliente();
    const id=(crypto&&crypto.randomUUID)?crypto.randomUUID():String(Date.now())+'-'+Math.random().toString(16).slice(2);
    const path=`${torneoId}/${id}-${limpiarNombreArchivo(archivo.name)}`;
    const up=await db.storage.from(BUCKET).upload(path,archivo,{contentType:archivo.type||undefined,upsert:false});
    if(up.error)return{ok:false,error:up.error.message};

    const ins=await db.from('documentos_torneo').insert({
      torneo_id:torneoId,
      tipo:'DOCUMENTO',
      nombre_visible:String(nombreVisible).trim(),
      archivo_nombre:archivo.name,
      storage_path:path,
      mime_type:archivo.type||null,
      tamano_bytes:archivo.size||null,
      creado_por:userId||null
    }).select('id').single();
    if(ins.error){
      try{await db.storage.from(BUCKET).remove([path])}catch(_){}
      return{ok:false,error:ins.error.message};
    }
    return{ok:true,data:ins.data};
  }
  async function urlDescarga(doc){
    const pr=await preparar();if(!pr.ok)return pr;
    const db=cliente();
    const {data,error}=await db.storage.from(BUCKET).createSignedUrl(doc.storage_path,120,{download:doc.archivo_nombre||true});
    return error?{ok:false,error:error.message}:{ok:true,url:data?.signedUrl||''};
  }
  async function eliminar(doc){
    const pr=await preparar();if(!pr.ok)return pr;
    const db=cliente();
    const del=await db.from('documentos_torneo').delete().eq('id',doc.id);
    if(del.error)return{ok:false,error:del.error.message};
    const st=await db.storage.from(BUCKET).remove([doc.storage_path]);
    return st.error?{ok:true,warn:'El registro se eliminó, pero quedó un archivo pendiente de limpieza en Storage.'}:{ok:true};
  }
  return{listar,subir,urlDescarga,eliminar};
})();
