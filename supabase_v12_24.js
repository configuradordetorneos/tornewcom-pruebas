window.NewcomSupabase=(function(){
let client=null;
let authClient=null;
let recoverySession=null;
let restauracionPromesa=null;
const RESPALDO_AUTH='tornewcomSupabaseSession';

function config(){return window.NEWCOM_SUPABASE||{}}
function mensajeErrorHumano(err,contexto=''){
  const raw=String(err?.message||err||'').trim();
  const s=raw.toLowerCase();
  if(!raw)return 'No se pudo completar la operación. Volvé a intentarlo.';
  if(/^dni bloqueado:/i.test(raw))return raw.replace(/^DNI BLOQUEADO:\s*/i,'');
  if(/jugadores_maestros_responsable_dni_unico/.test(s))return 'Este DNI ya está cargado en tu Bolsa de jugadores.';
  if(/duplicate key|violates unique|unique constraint|23505/.test(s)){
    if(contexto==='jugador_bolsa'||/jugadores_maestros|\bdni\b/.test(s))return 'Este DNI ya está cargado en tu Bolsa de jugadores.';
    if(contexto==='equipo'||/equipo/.test(s))return 'Ya existe un equipo con esos datos en esta institución y torneo.';
    if(contexto==='institucion'||/instituci/.test(s))return 'Ya existe una institución con esos datos en este torneo.';
    return 'Ya existe un registro con esos datos. Revisá la información antes de guardar.';
  }
  if(/row-level security|permission denied|not authorized|unauthorized|42501/.test(s))return 'No tenés permiso para realizar esta acción.';
  if(/foreign key|violates foreign key|23503/.test(s))return 'No se puede completar la operación porque este dato está relacionado con otros registros.';
  if(/check constraint|23514/.test(s))return 'Alguno de los datos ingresados no cumple las reglas permitidas.';
  if(/jwt|token.*expired|session.*expired|refresh_token/.test(s))return 'Tu sesión venció. Volvé a ingresar.';
  if(/failed to fetch|network|load failed|fetch failed/.test(s))return 'No se pudo conectar con el sistema. Verificá tu conexión y volvé a intentar.';
  if(/postgres|postgrest|pgrst|constraint|violates|syntax error|relation .* does not exist|column .* does not exist/.test(s))return 'No se pudo completar la operación. Actualizá la pantalla y volvé a intentar.';
  return raw;
}
function leerRespaldo(){
  try{
    const x=JSON.parse(localStorage.getItem(RESPALDO_AUTH)||'null');
    return (x&&x.access_token&&x.refresh_token)?x:null;
  }catch(_){return null}
}
function guardarRespaldo(session){
  try{
    if(session?.access_token&&session?.refresh_token){
      localStorage.setItem(RESPALDO_AUTH,JSON.stringify({
        access_token:session.access_token,
        refresh_token:session.refresh_token,
        expires_at:session.expires_at||null,
        user_id:session.user?.id||null
      }));
    }
  }catch(_){}
}
function borrarRespaldo(){try{localStorage.removeItem(RESPALDO_AUTH)}catch(_){}}
function crearClienteDatos(token=null){
  const c=config();
  const opt={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
  if(token)opt.global={headers:{Authorization:'Bearer '+token}};
  return window.supabase.createClient(c.url,c.anonKey,opt);
}
function recrearClienteDatos(token=null){
  if(!(window.supabase&&config().url&&config().anonKey))return;
  client=crearClienteDatos(token);
}
function iniciar(){
  if(authClient&&client)return true;
  const c=config();
  if(!(c.url&&c.anonKey&&window.supabase))return false;

  authClient=window.supabase.createClient(c.url,c.anonKey,{
    auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
  });

  const respaldo=leerRespaldo();
  recrearClienteDatos(respaldo?.access_token||null);

  try{
    authClient.auth.onAuthStateChange((evento,session)=>{
      // IMPORTANTE: este listener nunca debe decidir qué cuenta queda activa.
      // Al cambiar de Admin -> Organizador -> Responsable pueden llegar eventos
      // atrasados de la cuenta anterior. Solo aceptamos un evento si su user_id
      // coincide con la sesión de TorNewcom ya confirmada. Login, recuperación y
      // cierre guardan/limpian el respaldo de forma explícita.
      if(session?.access_token){
        const esperado=usuarioEsperadoLocal();
        const recibido=session?.user?.id?String(session.user.id):'';
        if(esperado&&recibido===esperado){
          guardarRespaldo(session);
          recrearClienteDatos(session.access_token);
        }
      }
      // SIGNED_OUT no toca respaldo ni cliente aquí. cerrarSesionAuth() lo hace
      // explícitamente. Así un SIGNED_OUT viejo no puede desmontar un login nuevo.
    });
  }catch(_){}
  return true;
}

function usuarioEsperadoLocal(){
  try{
    const app=JSON.parse(localStorage.getItem('sesionNewcom')||'null');
    return (app?.auth_real&&app?.user_id)?String(app.user_id):'';
  }catch(_){return ''}
}

async function restaurarSesionAuthInterna(){
  if(!iniciar())return{ok:false,error:'Supabase no configurado'};
  try{
    const esperado=usuarioEsperadoLocal();
    const r=leerRespaldo();

    // Si TorNewcom ya sabe qué usuario acaba de ingresar, su respaldo recién
    // guardado es la fuente primaria. Esto evita que getSession() reactive por
    // unas décimas la cuenta anterior almacenada por el SDK.
    if(r?.access_token&&r?.refresh_token&&(!esperado||String(r.user_id||'')===esperado)){
      const fijada=await authClient.auth.setSession({
        access_token:r.access_token,
        refresh_token:r.refresh_token
      });
      if(!fijada.error&&fijada.data?.session?.access_token){
        const ses=fijada.data.session;
        const id=ses?.user?.id?String(ses.user.id):'';
        if(!esperado||id===esperado){
          guardarRespaldo(ses);
          recrearClienteDatos(ses.access_token);
          return{ok:true,session:ses};
        }
      }
    }

    // Fallback: usar la sesión persistida por el SDK solo si pertenece al
    // mismo usuario que TorNewcom tiene activo. Nunca adoptamos otra identidad.
    const {data,error}=await authClient.auth.getSession();
    if(error)return{ok:false,error:error.message};
    const ses=data?.session||null;
    if(!ses?.access_token){
      recrearClienteDatos(null);
      return{ok:false,error:'No hay una sesión autenticada en Supabase.'};
    }
    const id=ses?.user?.id?String(ses.user.id):'';
    if(esperado&&id!==esperado){
      return{ok:false,error:'Supabase conserva otra identidad. Volvé a iniciar sesión.'};
    }
    guardarRespaldo(ses);
    recrearClienteDatos(ses.access_token);
    return{ok:true,session:ses};
  }catch(e){
    return{ok:false,error:e?.message||String(e)};
  }
}

async function restaurarSesionAuth(){
  // Varias partes de una misma página pueden pedir restauración al mismo tiempo.
  // Serializamos el proceso para no reutilizar el mismo refresh token en paralelo.
  if(restauracionPromesa)return restauracionPromesa;
  restauracionPromesa=restaurarSesionAuthInterna();
  try{return await restauracionPromesa}
  finally{restauracionPromesa=null}
}
async function exigirSesionDatos(){
  const r=await restaurarSesionAuth();
  return r.ok?{ok:true}:{ok:false,error:r.error||'La sesión privada no está disponible.'};
}

async function usuarioAuth(forzar=false){
  if(!iniciar())return null;
  if(!forzar){
    try{
      const local=JSON.parse(localStorage.getItem('sesionNewcom')||'null');
      if(!local?.auth_real)return null;
    }catch(_){return null}
  }
  const rr=await restaurarSesionAuth();
  if(!rr.ok)return null;
  // La sesión restaurada ya contiene el usuario autenticado.
  // Evita una segunda consulta getUser() que puede fallar de forma intermitente
  // aunque la sesión y el token sigan siendo válidos.
  if(rr.session?.user)return rr.session.user;
  try{
    const{data,error}=await authClient.auth.getUser(rr.session?.access_token);
    if(error)return null;
    return data?.user||null;
  }catch(_){return null}
}

async function obtenerContextoUsuario(userForzado=null,clienteConsulta=null){
  if(!iniciar())return{ok:false,error:'Supabase no configurado'};
  if(!clienteConsulta){
    const rr=await restaurarSesionAuth();
    if(!rr.ok)return rr;
  }
  const db=clienteConsulta||client;
  const user=userForzado||await usuarioAuth(true);
  if(!user)return{ok:false,error:'No hay una sesión autenticada en Supabase.'};

  const rp=await db.from('perfiles')
    .select('id,nombre,email,puede_crear_torneos,es_admin_general')
    .eq('id',user.id).maybeSingle();
  if(rp.error)return{ok:false,error:rp.error.message};

  const rm=await db.from('usuarios_torneos')
    .select('torneo_id,rol,institucion_id,activo,torneos(id,nombre,estado),instituciones(id,nombre)')
    .eq('usuario_id',user.id).eq('activo',true);
  if(rm.error)return{ok:false,error:rm.error.message};

  const perfil=rp.data||{
    id:user.id,
    nombre:user.user_metadata?.nombre||user.email,
    email:user.email,
    puede_crear_torneos:false,
    es_admin_general:false
  };
  const permisos=rm.data||[];
  const asignacionesOrg=permisos.filter(x=>x.rol==='ORGANIZADOR'&&x.activo!==false);
  const asignacionesResp=permisos.filter(x=>x.rol==='RESPONSABLE'&&x.activo!==false);
  const tieneOrg=asignacionesOrg.length>0;
  const tieneResp=asignacionesResp.length>0;

  // Una cuenta puede tener varios roles por torneo.
  // "rol" queda solo como compatibilidad para pantallas antiguas.
  let rol='USUARIO';
  if(perfil.es_admin_general)rol='ADMIN_GENERAL';
  else if(perfil.puede_crear_torneos)rol='ORGANIZADOR';
  else if(tieneResp)rol='RESPONSABLE';

  let nombreSesion=perfil.nombre||user.email;
  if(rol==='RESPONSABLE'){
    let ri=await db.from('instituciones')
      .select('responsable_nombre')
      .eq('responsable_usuario_id',user.id)
      .not('responsable_nombre','is',null)
      .limit(1);
    if((ri.error||!(ri.data||[]).length)&&(perfil.email||user.email)){
      ri=await db.from('instituciones')
        .select('responsable_nombre')
        .eq('responsable_email',String(perfil.email||user.email).trim().toLowerCase())
        .not('responsable_nombre','is',null)
        .limit(1);
    }
    const n=ri.data?.[0]?.responsable_nombre;
    if(n)nombreSesion=n;
  }

  return{ok:true,data:{
    user_id:user.id,
    nombre:nombreSesion,
    email:perfil.email||user.email,
    rol,
    auth_real:true,
    es_admin_general:!!perfil.es_admin_general,
    puede_crear_torneos:!!perfil.puede_crear_torneos,
    organizador_habilitado:!!perfil.es_admin_general||!!perfil.puede_crear_torneos,
    tiene_asignaciones_organizador:tieneOrg,
    tiene_responsabilidades:tieneResp,
    cantidad_torneos_organizador:asignacionesOrg.length,
    cantidad_responsabilidades:asignacionesResp.length,
    roles_disponibles:[
      ...(perfil.es_admin_general?['ADMIN_GENERAL']:[]),
      ...((perfil.puede_crear_torneos||tieneOrg)?['ORGANIZADOR']:[]),
      ...(tieneResp?['RESPONSABLE']:[]),
      ...((!perfil.es_admin_general&&!perfil.puede_crear_torneos&&!tieneOrg&&!tieneResp)?['USUARIO']:[])
    ],
    permisos
  }};
}

async function registrarCuentaAuth(nombre,email,password,aceptaLegal=false){
  if(!iniciar())return{ok:false,error:'Supabase no configurado'};
  nombre=String(nombre||'').trim();
  email=String(email||'').trim().toLowerCase();
  password=String(password||'');
  if(nombre.length<2)return{ok:false,error:'Ingresá tu nombre y apellido.'};
  if(!email||!email.includes('@'))return{ok:false,error:'Ingresá un email válido.'};
  if(password.length<8)return{ok:false,error:'La contraseña debe tener al menos 8 caracteres.'};
  if(!aceptaLegal)return{ok:false,error:'Tenés que aceptar los Términos y la Política de Privacidad.'};

  const redirectTo=(location.origin||'').replace(/\/$/,'')+'/acceso_real.html';
  const{data,error}=await authClient.auth.signUp({
    email,
    password,
    options:{data:{nombre,terminos_version:'2026-09-04-v1',terminos_aceptados_en:new Date().toISOString()},emailRedirectTo:redirectTo}
  });
  if(error)return{ok:false,error:error.message};

  // Si Supabase entrega sesión inmediata, la cerramos:
  // registrarse no significa "entrar como Organizador".
  if(data?.session){
    try{await authClient.auth.signOut()}catch(_){}
    borrarRespaldo();
    recrearClienteDatos(null);
  }

  return{
    ok:true,
    data:{
      usuario:data?.user||null,
      requiere_confirmacion:!data?.session
    }
  };
}

async function solicitarRecuperacionPassword(email){
  if(!iniciar())return{ok:false,error:'Supabase no configurado'};
  email=String(email||'').trim().toLowerCase();
  if(!email||!email.includes('@'))return{ok:false,error:'Ingresá un email válido.'};
  const redirectTo=(location.origin||'').replace(/\/$/,'')+'/nueva_password.html';
  const{error}=await authClient.auth.resetPasswordForEmail(email,{redirectTo});
  if(error)return{ok:false,error:error.message};
  return{ok:true};
}

async function esperarRecuperacionPassword(timeoutMs=8000){
  // IMPORTANTE: leer la URL ANTES de crear/inicializar el cliente Auth,
  // porque Supabase puede limpiar los parámetros del enlace al procesarlos.
  let recoveryHint=false;
  let urlError='';
  try{
    const q=new URLSearchParams(location.search||'');
    const h=new URLSearchParams(String(location.hash||'').replace(/^#/,''));
    const tipo=q.get('type')||h.get('type')||'';
    recoveryHint=(tipo==='recovery'||q.has('code')||h.has('access_token')||h.has('refresh_token'));
    urlError=q.get('error_description')||h.get('error_description')||q.get('error')||h.get('error')||'';
  }catch(_){}

  if(urlError){
    try{urlError=decodeURIComponent(urlError.replace(/\+/g,' '))}catch(_){}
    return{ok:false,error:urlError};
  }
  if(!iniciar())return{ok:false,error:'Supabase no configurado'};

  return await new Promise((resolve)=>{
    let terminado=false;
    let subscription=null;
    let timer=null;

    const cerrar=(resultado)=>{
      if(terminado)return;
      terminado=true;
      if(timer)clearTimeout(timer);
      try{subscription?.unsubscribe()}catch(_){}
      resolve(resultado);
    };

    try{
      const r=authClient.auth.onAuthStateChange((evento,session)=>{
        // Supabase emite PASSWORD_RECOVERY al procesar correctamente
        // el enlace de restablecimiento.
        if(evento==='PASSWORD_RECOVERY'&&session?.access_token){
          recoverySession=session;
          guardarRespaldo(session);
          recrearClienteDatos(session.access_token);
          cerrar({ok:true,session,evento});
          return;
        }
        // Respaldo para enlaces que ya fueron procesados cuando se suscribe
        // el listener. Solo se acepta una sesión normal si la URL original
        // contenía señales claras de un flujo de recuperación.
        if(recoveryHint&&session?.access_token&&
           (evento==='SIGNED_IN'||evento==='INITIAL_SESSION')){
          recoverySession=session;
          guardarRespaldo(session);
          recrearClienteDatos(session.access_token);
          cerrar({ok:true,session,evento});
        }
      });
      subscription=r?.data?.subscription||null;
    }catch(_){}

    // Por si el evento ocurrió entre la inicialización del cliente y la
    // suscripción, consultar también la sesión persistida.
    setTimeout(async()=>{
      if(terminado)return;
      try{
        const{data,error}=await authClient.auth.getSession();
        if(!error&&recoveryHint&&data?.session?.access_token){
          recoverySession=data.session;
          guardarRespaldo(data.session);
          recrearClienteDatos(data.session.access_token);
          cerrar({ok:true,session:data.session,evento:'SESSION_RECOVERED'});
        }
      }catch(_){}
    },250);

    timer=setTimeout(()=>{
      cerrar({ok:false,error:'No se pudo confirmar una sesión válida de recuperación.'});
    },Math.max(3000,Number(timeoutMs)||8000));
  });
}

async function actualizarPasswordRecuperacion(password){
  if(!iniciar())return{ok:false,error:'Supabase no configurado'};
  password=String(password||'');
  if(password.length<8)return{ok:false,error:'La contraseña debe tener al menos 8 caracteres.'};

  // La sesión de recuperación se captura en el momento exacto en que
  // Supabase emite PASSWORD_RECOVERY. No volver a exigir/restaurar una
  // sesión genérica antes de cambiar la clave: ese segundo control podía
  // descartar una recuperación válida antes de enviar updateUser().
  if(!recoverySession?.access_token){
    return{ok:false,error:'La sesión de recuperación ya no está disponible. Solicitá un enlace nuevo.'};
  }

  // Primer intento: usar el cliente Auth que acaba de validar el enlace.
  try{
    const{data,error}=await authClient.auth.updateUser({password});
    if(!error){
      recoverySession=null;
      return{ok:true,data:data?.user||null};
    }

    // Si el SDK perdió su sesión interna pero conservamos el access token
    // validado por PASSWORD_RECOVERY, actualizar por el endpoint Auth
    // oficial usando exactamente ese token.
    const c=config();
    const resp=await fetch(c.url.replace(/\/$/,'')+'/auth/v1/user',{
      method:'PUT',
      headers:{
        'apikey':c.anonKey,
        'Authorization':'Bearer '+recoverySession.access_token,
        'Content-Type':'application/json'
      },
      body:JSON.stringify({password})
    });
    const body=await resp.json().catch(()=>({}));
    if(!resp.ok){
      return{ok:false,error:body?.msg||body?.message||body?.error_description||body?.error||error?.message||('HTTP '+resp.status)};
    }
    recoverySession=null;
    return{ok:true,data:body||null};
  }catch(e){
    return{ok:false,error:e?.message||String(e)};
  }
}

async function iniciarSesionAuth(email,password){
  if(!iniciar())return{ok:false,error:'Supabase no configurado'};

  // Evita mezclar una sesión anterior de Supabase con una sesión local nueva.
  // Antes de autenticar otra cuenta limpiamos todos los rastros de identidad previos.
  try{await authClient.auth.signOut({scope:'local'})}catch(_){}
  borrarRespaldo();
  recrearClienteDatos(null);
  try{localStorage.removeItem('sesionNewcom')}catch(_){}

  const{data,error}=await authClient.auth.signInWithPassword({
    email:String(email||'').trim().toLowerCase(),
    password
  });
  if(error)return{ok:false,error:error.message};
  if(!data?.user||!data?.session?.access_token){
    return{ok:false,error:'Supabase aceptó el acceso pero no devolvió una sesión completa.'};
  }

  // signInWithPassword ya deja fijada la nueva sesión en el cliente de Auth.
  // No volvemos a llamar setSession/getSession inmediatamente porque puede
  // competir con el evento de persistencia del SDK y producir un falso
  // 'usuario distinto' aunque las credenciales sean correctas.
  guardarRespaldo(data.session);
  recrearClienteDatos(data.session.access_token);

  const ctx=await obtenerContextoUsuario(data.user,client);
  if(!ctx.ok){
    borrarRespaldo();
    recrearClienteDatos(null);
    await authClient.auth.signOut();
    return ctx;
  }
  return{ok:true,data:ctx.data,auth:data};
}

async function verificarAceptacionLegal(version='2026-09-04-v1'){
  const rr=await restaurarSesionAuth();
  if(!rr.ok)return rr;
  const{data,error}=await client.rpc('acepto_terminos_actual',{p_version:version});
  if(error)return{ok:false,error:error.message};
  return{ok:true,data:!!data};
}

async function registrarAceptacionLegal(version='2026-09-04-v1',userAgent=''){
  const rr=await restaurarSesionAuth();
  if(!rr.ok)return rr;
  const{data,error}=await client.rpc('registrar_aceptacion_legal',{
    p_version:version,
    p_user_agent:String(userAgent||'').slice(0,500)
  });
  if(error)return{ok:false,error:error.message};
  return{ok:true,data:!!data};
}

async function cerrarSesionAuth(){
  if(!iniciar())return{ok:true};
  const{error}=await authClient.auth.signOut();
  borrarRespaldo();
  recrearClienteDatos(null);
  return error?{ok:false,error:error.message}:{ok:true};
}

async function listarTorneos(){
  const __sesion=await exigirSesionDatos();if(!__sesion.ok)return __sesion;
  if(!iniciar())return{ok:false,error:'Supabase no configurado',data:[]};
  const user=await usuarioAuth();
  if(user){
    const rp=await client.from('perfiles').select('es_admin_general').eq('id',user.id).maybeSingle();
    if(rp.error)return{ok:false,error:rp.error.message,data:[]};
    if(!rp.data?.es_admin_general){
      const rm=await client.from('usuarios_torneos')
        .select('torneo_id,torneos(id,nombre,estado,creado_en,creado_por,publicado,publicar_programacion,puntuacion_tipo,pts_gana_20,pts_pierde_20,pts_gana_21,pts_pierde_21,pts_np_presente,pts_np_ausente)')
        .eq('usuario_id',user.id).eq('rol','ORGANIZADOR').eq('activo',true);
      if(rm.error)return{ok:false,error:rm.error.message,data:[]};
      const data=(rm.data||[]).map(x=>x.torneos).filter(Boolean).sort((a,b)=>String(b.creado_en||'').localeCompare(String(a.creado_en||'')));
      return{ok:true,data};
    }
  }
  const{data,error}=await client.from('torneos').select('id,nombre,estado,creado_en,creado_por,publicado,publicar_programacion,puntuacion_tipo,pts_gana_20,pts_pierde_20,pts_gana_21,pts_pierde_21,pts_np_presente,pts_np_ausente').order('creado_en',{ascending:false});
  return error?{ok:false,error:error.message,data:[]}:{ok:true,data:data||[]};
}
async function crearTorneo(nombre,puntuacion={}){
  const __sesion=await exigirSesionDatos();if(!__sesion.ok)return __sesion;
  if(!iniciar())return{ok:false,error:'Supabase no configurado'};
  nombre=(nombre||'').trim();
  if(nombre.length<3)return{ok:false,error:'El nombre debe tener al menos 3 caracteres.'};
  const user=await usuarioAuth();
  if(user){
    const rp=await client.from('perfiles').select('puede_crear_torneos,es_admin_general').eq('id',user.id).maybeSingle();
    if(rp.error)return{ok:false,error:rp.error.message};
    if(!(rp.data?.puede_crear_torneos||rp.data?.es_admin_general))return{ok:false,error:'Tu cuenta no está habilitada para crear torneos.'};
  }
  const tipo=['SISTEMA_1','SISTEMA_2','PERSONALIZADO'].includes(puntuacion.tipo)?puntuacion.tipo:'SISTEMA_1';
  let cfg;
  if(tipo==='SISTEMA_1') cfg={pts_gana_20:4,pts_pierde_20:1,pts_gana_21:3,pts_pierde_21:2,pts_np_presente:4,pts_np_ausente:0};
  else if(tipo==='SISTEMA_2') cfg={pts_gana_20:4,pts_pierde_20:0,pts_gana_21:2,pts_pierde_21:1,pts_np_presente:4,pts_np_ausente:0};
  else cfg={
    pts_gana_20:Number(puntuacion.g20),pts_pierde_20:Number(puntuacion.p20),
    pts_gana_21:Number(puntuacion.g21),pts_pierde_21:Number(puntuacion.p21),
    pts_np_presente:Number(puntuacion.npPresente),pts_np_ausente:Number(puntuacion.npAusente)
  };
  if(Object.values(cfg).some(v=>!Number.isInteger(v)||v<0))return{ok:false,error:'Revisá los valores del sistema de puntuación.'};
  const fila={nombre,estado:'ACTIVO',puntuacion_tipo:tipo,...cfg};
  if(user)fila.creado_por=user.id;
  const{data,error}=await client.from('torneos').insert(fila).select().single();
  return error?{ok:false,error:error.message}:{ok:true,data};
}
async function obtenerTorneo(id){
  const __sesion=await exigirSesionDatos();if(!__sesion.ok)return __sesion;
  if(!iniciar())return{ok:false,error:'Supabase no configurado'};
  if(!id)return{ok:false,error:'Falta identificar el torneo.'};
  const{data,error}=await client.from('torneos')
    .select('id,nombre,estado,puntuacion_tipo,pts_gana_20,pts_pierde_20,pts_gana_21,pts_pierde_21,pts_np_presente,pts_np_ausente')
    .eq('id',id).single();
  return error?{ok:false,error:error.message}:{ok:true,data};
}
async function actualizarPuntuacionTorneo(id,puntuacion={}){
  const __sesion=await exigirSesionDatos();if(!__sesion.ok)return __sesion;
  if(!iniciar())return{ok:false,error:'Supabase no configurado'};
  if(!id)return{ok:false,error:'Falta identificar el torneo.'};
  const tipo=['SISTEMA_1','SISTEMA_2','PERSONALIZADO'].includes(puntuacion.tipo)?puntuacion.tipo:'SISTEMA_1';
  const args={p_torneo:id,p_tipo:tipo,p_g20:Number(puntuacion.g20??0),p_p20:Number(puntuacion.p20??0),p_g21:Number(puntuacion.g21??0),p_p21:Number(puntuacion.p21??0),p_np_presente:Number(puntuacion.npPresente??0),p_np_ausente:Number(puntuacion.npAusente??0)};
  const{data,error}=await client.rpc('actualizar_puntuacion_torneo',args);
  return error?{ok:false,error:error.message}:{ok:true,data};
}

async function eliminarTorneoAdmin(id,nombreConfirmacion){
  const __sesion=await exigirSesionDatos();if(!__sesion.ok)return __sesion;
  if(!iniciar())return{ok:false,error:'Supabase no configurado'};
  const{data,error}=await client.rpc('eliminar_torneo_admin',{p_torneo:id,p_nombre_confirmacion:String(nombreConfirmacion||'')});
  return error?{ok:false,error:error.message}:{ok:true,data};
}

async function listarSedesTorneo(torneoId){
  const __sesion=await exigirSesionDatos();if(!__sesion.ok)return __sesion;
  if(!iniciar())return{ok:false,error:'Supabase no configurado',data:[]};
  if(!torneoId)return{ok:true,data:[]};
  const{data,error}=await client.from('sedes_torneo').select('id,torneo_id,nombre,domicilio,creado_en').eq('torneo_id',torneoId).order('nombre',{ascending:true});
  return error?{ok:false,error:error.message,data:[]}:{ok:true,data:data||[]};
}
async function crearSedeTorneo(torneoId,nombre,domicilio=''){
  const __sesion=await exigirSesionDatos();if(!__sesion.ok)return __sesion;if(!iniciar())return{ok:false,error:'Supabase no configurado'};
  nombre=String(nombre||'').trim();domicilio=String(domicilio||'').trim();if(!torneoId||!nombre)return{ok:false,error:'Revisá los datos de la sede.'};
  const{data,error}=await client.from('sedes_torneo').insert({torneo_id:torneoId,nombre,domicilio:domicilio||null}).select().single();return error?{ok:false,error:error.message}:{ok:true,data};
}
async function actualizarSedeTorneo(id,nombre,domicilio=''){
  const __sesion=await exigirSesionDatos();if(!__sesion.ok)return __sesion;if(!iniciar())return{ok:false,error:'Supabase no configurado'};
  nombre=String(nombre||'').trim();domicilio=String(domicilio||'').trim();if(!id||!nombre)return{ok:false,error:'Revisá los datos de la sede.'};
  const{data,error}=await client.from('sedes_torneo').update({nombre,domicilio:domicilio||null}).eq('id',id).select().single();return error?{ok:false,error:error.message}:{ok:true,data};
}
async function eliminarSedeTorneo(id){
  const __sesion=await exigirSesionDatos();if(!__sesion.ok)return __sesion;if(!iniciar())return{ok:false,error:'Supabase no configurado'};if(!id)return{ok:false,error:'Falta identificar la sede.'};
  const{error}=await client.from('sedes_torneo').delete().eq('id',id);return error?{ok:false,error:error.message}:{ok:true};
}
async function crearJornadaConPartidos(torneoId,nombre,fecha,partidos,sedeId=null){
  const __sesion=await exigirSesionDatos();if(!__sesion.ok)return __sesion;
  if(!iniciar())return{ok:false,error:'Supabase no configurado'};
  if(!torneoId)return{ok:false,error:'Falta seleccionar el torneo.'};
  if(!partidos.length)return{ok:false,error:'Agregá al menos un partido.'};
  const{data:j,error:ej}=await client.from('jornadas')
    .insert({torneo_id:torneoId,nombre:(nombre||'Jornada').trim(),fecha:fecha||null})
    .select().single();
  if(ej)return{ok:false,error:ej.message};
  const rows=partidos.map(p=>({
    torneo_id:torneoId,jornada_id:j.id,categoria:p.categoria,modalidad:p.modalidad,
    equipo_a:p.equipoA,equipo_b:p.equipoB,equipo_a_id:p.equipoAId||null,equipo_b_id:p.equipoBId||null,hora:p.hora||null,sede_id:p.sedeId||null,cancha:p.cancha||null,estado:'PENDIENTE'
  }));
  const{data:ps,error:ep}=await client.from('partidos').insert(rows).select();
  if(ep){
    await client.from('jornadas').delete().eq('id',j.id);
    return{ok:false,error:ep.message}
  }
  return{ok:true,jornada:j,partidos:ps||[]}
}
async function listarPartidos(torneoId){
  const __sesion=await exigirSesionDatos();if(!__sesion.ok)return __sesion;
  if(!iniciar())return{ok:false,error:'Supabase no configurado',data:[]};
  let q=client.from('partidos')
    .select('id,torneo_id,jornada_id,categoria,modalidad,equipo_a,equipo_b,equipo_a_id,equipo_b_id,hora,cancha,estado,no_presentado,a_set1,b_set1,a_set2,b_set2,a_set3,b_set3,sets_a,sets_b,tantos_a,tantos_b,ganador,puntos_a,puntos_b,sede_id,sedes_torneo(nombre,domicilio),jornadas(nombre,fecha)')
    .order('creado_en',{ascending:true});
  if(torneoId)q=q.eq('torneo_id',torneoId);
  const{data,error}=await q;
  return error?{ok:false,error:error.message,data:[]}:{ok:true,data:data||[]}
}
async function obtenerPartido(id){
  const __sesion=await exigirSesionDatos();if(!__sesion.ok)return __sesion;
  if(!iniciar())return{ok:false,error:'Supabase no configurado'};
  const{data,error}=await client.from('partidos')
    .select('id,torneo_id,jornada_id,categoria,modalidad,equipo_a,equipo_b,equipo_a_id,equipo_b_id,hora,cancha,estado,no_presentado,a_set1,b_set1,a_set2,b_set2,a_set3,b_set3,sets_a,sets_b,tantos_a,tantos_b,ganador,puntos_a,puntos_b,finalizado_en,sede_id,sedes_torneo(nombre,domicilio),jornadas(nombre,fecha)')
    .eq('id',id).single();
  return error?{ok:false,error:error.message}:{ok:true,data};
}

async function listarJornadasTorneo(torneoId){
  const __sesion=await exigirSesionDatos();if(!__sesion.ok)return __sesion;if(!iniciar())return{ok:false,error:'Supabase no configurado',data:[]};
  const{data,error}=await client.from('jornadas').select('id,torneo_id,nombre,fecha').eq('torneo_id',torneoId).order('fecha',{ascending:true}).order('creado_en',{ascending:true});
  return error?{ok:false,error:error.message,data:[]}:{ok:true,data:data||[]};
}
async function enviarNotificacionesPartidoEmail(notificationIds){
  if(!iniciar())return{ok:false,error:'Supabase no configurado'};
  const ids=[...new Set((Array.isArray(notificationIds)?notificationIds:[notificationIds]).filter(Boolean))];
  if(!ids.length)return{ok:true,enviados:0,omitido:true};
  try{
    // Obtener una sesión vigente justo antes del envío. Esto permite mantener la
    // sesión abierta durante horas/días sin reutilizar un access_token vencido.
    const rr=await restaurarSesionAuth();
    if(!rr.ok||!rr.session?.access_token)return{ok:false,error:rr.error||'Tu sesión venció. Volvé a ingresar.'};
    const token=rr.session.access_token;
    const r=await fetch(config().url+'/functions/v1/notificar-partido-email',{
      method:'POST',
      headers:{'Authorization':'Bearer '+token,'Content-Type':'application/json'},
      body:JSON.stringify({notification_ids:ids})
    });
    let data=null;
    try{data=await r.json()}catch(_){data=null}
    if(!r.ok)return{ok:false,error:data?.error||('No se pudo enviar el aviso por email (HTTP '+r.status+').')};
    if(data?.ok===false)return{ok:false,error:data.error||'No se pudo enviar el aviso por email.'};
    return{ok:true,data,enviados:Number(data?.enviados??ids.length)};
  }catch(e){return{ok:false,error:mensajeErrorHumano(e)}}
}
async function hayAlertasNoLeidasActual(){
  const __sesion=await exigirSesionDatos();if(!__sesion.ok)return __sesion;
  if(!iniciar())return{ok:false,error:'Supabase no configurado',data:false};
  const{data,error}=await client.rpc('hay_alertas_no_leidas_actual');
  return error?{ok:false,error:error.message,data:false}:{ok:true,data:!!data};
}
async function actualizarProgramacionPartido(id,d,motivo='Edición de programación'){
  const __sesion=await exigirSesionDatos();if(!__sesion.ok)return __sesion;if(!iniciar())return{ok:false,error:'Supabase no configurado'};
  const{data,error}=await client.rpc('editar_partido_con_notificaciones',{p_partido:id,p_jornada:d.jornada_id,p_hora:d.hora||null,p_sede:d.sede_id||null,p_cancha:d.cancha||null,p_equipo_a:d.equipo_a_id,p_equipo_b:d.equipo_b_id,p_motivo:motivo||'Edición de programación'});
  if(error)return{ok:false,error:error.message};
  const ids=Array.isArray(data?.notification_ids)?data.notification_ids:[];
  const mail=await enviarNotificacionesPartidoEmail(ids);
  return{ok:true,data,notification_ids:ids,warning:mail.ok?null:'Partido actualizado, pero no se pudo enviar el aviso por email: '+mail.error,email:mail};
}
async function eliminarPartidoPendiente(id){
  const __sesion=await exigirSesionDatos();if(!__sesion.ok)return __sesion;if(!iniciar())return{ok:false,error:'Supabase no configurado'};
  const previo=await obtenerPartido(id);if(!previo.ok)return previo;if(previo.data.estado!=='PENDIENTE')return{ok:false,error:'Sólo se pueden eliminar partidos PENDIENTES.'};
  const ids=[previo.data.equipo_a_id,previo.data.equipo_b_id].filter(Boolean);
  const nr=await client.rpc('crear_notificaciones_cambio_partido',{p_partido:id,p_tipo:'PARTIDO_ELIMINADO',p_titulo:'Partido eliminado',p_detalle:`La Organización eliminó el partido ${previo.data.equipo_a} vs ${previo.data.equipo_b}.`,p_cambios:{antes:previo.data},p_equipo_ids:ids});
  const{error}=await client.from('partidos').delete().eq('id',id).eq('estado','PENDIENTE');
  if(error)return{ok:false,error:error.message};
  const notifIds=nr.error?[]:(nr.data||[]);
  const mail=nr.error?{ok:false,error:'No se generaron las notificaciones.'}:await enviarNotificacionesPartidoEmail(notifIds);
  const warning=nr.error
    ? 'Partido eliminado, pero falló la notificación: '+nr.error.message
    : (!mail.ok?'Partido eliminado y alerta generada, pero no se pudo enviar el aviso por email: '+mail.error:null);
  return{ok:true,notification_ids:notifIds,warning,email:mail};
}
async function listarNotificacionesSistema(){
  const __sesion=await exigirSesionDatos();if(!__sesion.ok)return __sesion;if(!iniciar())return{ok:false,error:'Supabase no configurado',data:[]};
  const{data,error}=await client.from('notificaciones_sistema').select('id,torneo_id,destinatario_usuario_id,partido_id,tipo,titulo,detalle,cambios,leida,creado_en,torneos(nombre)').order('creado_en',{ascending:false}).limit(100);
  return error?{ok:false,error:error.message,data:[]}:{ok:true,data:data||[]};
}
async function marcarNotificacionLeida(id){
 const __sesion=await exigirSesionDatos();if(!__sesion.ok)return __sesion;if(!iniciar())return{ok:false,error:'Supabase no configurado'};const{error}=await client.from('notificaciones_sistema').update({leida:true,leida_en:new Date().toISOString()}).eq('id',id);return error?{ok:false,error:error.message}:{ok:true};
}
async function guardarBorradorPartido(id,d,estadoActual){
  const __sesion=await exigirSesionDatos();if(!__sesion.ok)return __sesion;
  if(!iniciar())return{ok:false,error:'Supabase no configurado'};
  const cambios={
    no_presentado:d.no_presentado||'NINGUNO',
    a_set1:d.a_set1,b_set1:d.b_set1,a_set2:d.a_set2,b_set2:d.b_set2,
    a_set3:d.a_set3,b_set3:d.b_set3,
    estado:estadoActual==='SUSPENDIDO'?'SUSPENDIDO':'PENDIENTE',
    actualizado_en:new Date().toISOString()
  };
  const{data,error}=await client.from('partidos').update(cambios).eq('id',id).select().single();
  return error?{ok:false,error:error.message}:{ok:true,data};
}
async function suspenderPartido(id,d){
  const __sesion=await exigirSesionDatos();if(!__sesion.ok)return __sesion;
  if(!iniciar())return{ok:false,error:'Supabase no configurado'};
  const cambios={
    no_presentado:'NINGUNO',
    a_set1:d.a_set1,b_set1:d.b_set1,a_set2:d.a_set2,b_set2:d.b_set2,
    a_set3:d.a_set3,b_set3:d.b_set3,
    sets_a:null,sets_b:null,tantos_a:null,tantos_b:null,ganador:null,puntos_a:null,puntos_b:null,
    estado:'SUSPENDIDO',finalizado_en:null,actualizado_en:new Date().toISOString()
  };
  const{data,error}=await client.from('partidos').update(cambios).eq('id',id).select().single();
  return error?{ok:false,error:error.message}:{ok:true,data};
}
async function finalizarPartido(id,d){
  const __sesion=await exigirSesionDatos();if(!__sesion.ok)return __sesion;
  if(!iniciar())return{ok:false,error:'Supabase no configurado'};
  const cambios={
    no_presentado:d.no_presentado||'NINGUNO',
    a_set1:d.a_set1,b_set1:d.b_set1,a_set2:d.a_set2,b_set2:d.b_set2,
    a_set3:d.a_set3,b_set3:d.b_set3,
    sets_a:d.sets_a,sets_b:d.sets_b,tantos_a:d.tantos_a,tantos_b:d.tantos_b,
    ganador:d.ganador,puntos_a:d.puntos_a,puntos_b:d.puntos_b,
    estado:'FINALIZADO',finalizado_en:new Date().toISOString(),actualizado_en:new Date().toISOString()
  };
  const{data,error}=await client.from('partidos').update(cambios).eq('id',id).select().single();
  return error?{ok:false,error:error.message}:{ok:true,data};
}

function snapshotResultado(p){
  return {
    equipo_a_id:p.equipo_a_id,equipo_a:p.equipo_a,equipo_b_id:p.equipo_b_id,equipo_b:p.equipo_b,
    estado:p.estado,
    no_presentado:p.no_presentado,
    a_set1:p.a_set1,b_set1:p.b_set1,
    a_set2:p.a_set2,b_set2:p.b_set2,
    a_set3:p.a_set3,b_set3:p.b_set3,
    sets_a:p.sets_a,sets_b:p.sets_b,
    tantos_a:p.tantos_a,tantos_b:p.tantos_b,
    ganador:p.ganador,
    puntos_a:p.puntos_a,puntos_b:p.puntos_b,
    finalizado_en:p.finalizado_en
  };
}
function mismoSnapshotResultado(a,b){
  return JSON.stringify(a)===JSON.stringify(b);
}
async function reabrirPartidoFinalizado(id,motivo){
  const __sesion=await exigirSesionDatos();if(!__sesion.ok)return __sesion;
  if(!iniciar())return{ok:false,error:'Supabase no configurado'};
  motivo=(motivo||'').trim();
  if(motivo.length<3)return{ok:false,error:'Indicá el motivo de la reapertura.'};
  const{data,error}=await client.rpc('reabrir_partido_finalizado',{p_partido:id,p_motivo:motivo});
  if(error)return{ok:false,error:error.message};
  const ids=Array.isArray(data?.notification_ids)?data.notification_ids:[];
  const mail=await enviarNotificacionesPartidoEmail(ids);
  return{ok:true,data,notification_ids:ids,warning:mail.ok?null:'Partido reabierto, pero no se pudo enviar el aviso por email: '+mail.error,email:mail};
}
async function corregirPartido(id,d,motivo){
  const __sesion=await exigirSesionDatos();if(!__sesion.ok)return __sesion;
  if(!iniciar())return{ok:false,error:'Supabase no configurado'};
  motivo=(motivo||'').trim();
  if(motivo.length<3)return{ok:false,error:'Indicá el motivo de la corrección.'};

  const previo=await obtenerPartido(id);
  if(!previo.ok)return previo;
  if(previo.data.estado!=='FINALIZADO')return{ok:false,error:'Sólo se corrigen partidos FINALIZADOS.'};

  const antes=snapshotResultado(previo.data);
  const cambios={
    equipo_a_id:d.equipo_a_id||previo.data.equipo_a_id,equipo_a:d.equipo_a||previo.data.equipo_a,
    equipo_b_id:d.equipo_b_id||previo.data.equipo_b_id,equipo_b:d.equipo_b||previo.data.equipo_b,
    no_presentado:d.no_presentado||'NINGUNO',
    a_set1:d.a_set1,b_set1:d.b_set1,
    a_set2:d.a_set2,b_set2:d.b_set2,
    a_set3:d.a_set3,b_set3:d.b_set3,
    sets_a:d.sets_a,sets_b:d.sets_b,
    tantos_a:d.tantos_a,tantos_b:d.tantos_b,
    ganador:d.ganador,
    puntos_a:d.puntos_a,puntos_b:d.puntos_b,
    estado:'FINALIZADO',
    actualizado_en:new Date().toISOString()
  };

  const propuesto=snapshotResultado({...previo.data,...cambios});
  if(mismoSnapshotResultado(antes,propuesto)){
    return{ok:true,data:previo.data,sin_cambios:true,notification_ids:[],warning:null,email:{ok:true,enviados:0,omitido:true}};
  }

  const{data,error}=await client.from('partidos').update(cambios).eq('id',id).select().single();
  if(error)return{ok:false,error:error.message};

  const despues=snapshotResultado(data);
  const audit=await client.from('auditoria_partidos').insert({
    torneo_id:data.torneo_id,
    partido_id:data.id,
    accion:(antes.equipo_a_id!==despues.equipo_a_id||antes.equipo_b_id!==despues.equipo_b_id)?'CORRECCION_PARTIDO':'CORRECCION_RESULTADO',
    motivo,
    antes,
    despues
  });
  if(audit.error){
    return{ok:true,data,warning:'La corrección se guardó, pero falló el registro de auditoría: '+audit.error.message};
  }
  const ids=[previo.data.equipo_a_id,previo.data.equipo_b_id,data.equipo_a_id,data.equipo_b_id].filter(Boolean);
  const nr=await client.rpc('crear_notificaciones_cambio_partido',{p_partido:id,p_tipo:'PARTIDO_CORREGIDO',p_titulo:'Corrección de partido finalizado',p_detalle:'La Organización corrigió un partido ya finalizado.',p_cambios:{antes,despues},p_equipo_ids:ids});
  const notifIds=nr.error?[]:(nr.data||[]);
  const mail=nr.error?{ok:false,error:'No se generaron las notificaciones.'}:await enviarNotificacionesPartidoEmail(notifIds);
  const warning=nr.error
    ? 'La corrección quedó auditada, pero falló la notificación: '+nr.error.message
    : (!mail.ok?'La corrección quedó auditada y la alerta fue generada, pero no se pudo enviar el aviso por email: '+mail.error:null);
  return{ok:true,data,notification_ids:notifIds,warning,email:mail};
}
async function listarAuditoriaPartidos(torneoId){
  const __sesion=await exigirSesionDatos();if(!__sesion.ok)return __sesion;
  if(!iniciar())return{ok:false,error:'Supabase no configurado',data:[]};
  let q=client.from('auditoria_partidos')
    .select('id,torneo_id,partido_id,accion,motivo,antes,despues,creado_en,partidos(equipo_a,equipo_b,categoria,modalidad)')
    .order('creado_en',{ascending:false});
  if(torneoId)q=q.eq('torneo_id',torneoId);
  else{
    const user=await usuarioAuth();
    if(user){
      const rp=await client.from('perfiles').select('es_admin_general').eq('id',user.id).maybeSingle();
      if(rp.error)return{ok:false,error:rp.error.message,data:[]};
      if(!rp.data?.es_admin_general){
        const rm=await client.from('usuarios_torneos').select('torneo_id').eq('usuario_id',user.id).eq('rol','ORGANIZADOR').eq('activo',true);
        if(rm.error)return{ok:false,error:rm.error.message,data:[]};
        const ids=(rm.data||[]).map(x=>x.torneo_id);
        if(!ids.length)return{ok:true,data:[]};
        q=q.in('torneo_id',ids);
      }
    }
  }
  const{data,error}=await q;
  return error?{ok:false,error:error.message,data:[]}:{ok:true,data:data||[]};
}


async function listarPartidosFinalizados(torneoId){
  const __sesion=await exigirSesionDatos();if(!__sesion.ok)return __sesion;
  if(!iniciar())return{ok:false,error:'Supabase no configurado',data:[]};
  if(!torneoId)return{ok:false,error:'Falta identificar el torneo.',data:[]};
  const{data,error}=await client.from('partidos')
    .select('*')
    .eq('torneo_id',torneoId)
    .eq('estado','FINALIZADO')
    .order('creado_en',{ascending:true});
  return error?{ok:false,error:error.message,data:[]}:{ok:true,data:data||[]};
}


async function listarCategoriasTorneo(torneoId,soloActivas=true){
  const __sesion=await exigirSesionDatos();if(!__sesion.ok)return __sesion;
  if(!iniciar())return{ok:false,error:'Supabase no configurado',data:[]};
  if(!torneoId)return{ok:true,data:[]};
  let q=client.from('categorias_torneo')
    .select('id,torneo_id,categoria,modalidad,edad_minima,excepcion_edad_habilitada,menores_permitidos,edad_minima_excepcion,fecha_referencia,cierre_plantel_en,activo,creado_en,actualizado_en')
    .eq('torneo_id',torneoId)
    .order('categoria',{ascending:true})
    .order('modalidad',{ascending:true});
  if(soloActivas)q=q.eq('activo',true);
  const{data,error}=await q;
  return error?{ok:false,error:error.message,data:[]}:{ok:true,data:data||[]};
}
async function crearCategoriaTorneo(d){
  const __sesion=await exigirSesionDatos();if(!__sesion.ok)return __sesion;
  if(!iniciar())return{ok:false,error:'Supabase no configurado'};
  const fila={
    torneo_id:d.torneo_id,
    categoria:String(d.categoria||'').trim(),
    modalidad:String(d.modalidad||'').trim(),
    edad_minima:Number(d.edad_minima),
    excepcion_edad_habilitada:!!d.excepcion_edad_habilitada,
    menores_permitidos:d.excepcion_edad_habilitada?Number(d.menores_permitidos||0):0,
    edad_minima_excepcion:d.excepcion_edad_habilitada?Number(d.edad_minima_excepcion):null,
    fecha_referencia:d.fecha_referencia,
    activo:true
  };
  const{data,error}=await client.from('categorias_torneo').insert(fila).select().single();
  return error?{ok:false,error:error.message}:{ok:true,data};
}
async function actualizarCategoriaTorneo(id,d){
  const __sesion=await exigirSesionDatos();if(!__sesion.ok)return __sesion;
  if(!iniciar())return{ok:false,error:'Supabase no configurado'};
  const cambios={
    categoria:String(d.categoria||'').trim(),
    modalidad:String(d.modalidad||'').trim(),
    edad_minima:Number(d.edad_minima),
    excepcion_edad_habilitada:!!d.excepcion_edad_habilitada,
    menores_permitidos:d.excepcion_edad_habilitada?Number(d.menores_permitidos||0):0,
    edad_minima_excepcion:d.excepcion_edad_habilitada?Number(d.edad_minima_excepcion):null,
    fecha_referencia:d.fecha_referencia,
    actualizado_en:new Date().toISOString()
  };
  const{data,error}=await client.from('categorias_torneo').update(cambios).eq('id',id).select().single();
  if(error)return{ok:false,error:error.message};
  // Mantiene sincronizados los textos de equipos ya vinculados a esta categoría.
  const sync=await client.from('equipos_competitivos').update({categoria:cambios.categoria,modalidad:cambios.modalidad,actualizado_en:new Date().toISOString()}).eq('categoria_torneo_id',id);
  return sync.error?{ok:true,data,warning:'La regla se actualizó, pero no se pudieron sincronizar todos los equipos: '+sync.error.message}:{ok:true,data};
}
async function eliminarCategoriaTorneo(id){
  const __sesion=await exigirSesionDatos();if(!__sesion.ok)return __sesion;
  if(!iniciar())return{ok:false,error:'Supabase no configurado'};
  const uso=await client.from('equipos_competitivos').select('id',{count:'exact',head:true}).eq('categoria_torneo_id',id);
  if(uso.error)return{ok:false,error:uso.error.message};
  if((uso.count||0)>0)return{ok:false,error:'Esta categoría ya tiene equipos inscriptos. Editala en lugar de eliminarla.'};
  const{error}=await client.from('categorias_torneo').delete().eq('id',id);
  return error?{ok:false,error:error.message}:{ok:true};
}
async function programarCierrePlantel(id,fecha){
  const __sesion=await exigirSesionDatos();if(!__sesion.ok)return __sesion;
  if(!iniciar())return{ok:false,error:'Supabase no configurado'};
  const {data,error}=await client.rpc('programar_cierre_plantel',{p_categoria_torneo:id,p_fecha:fecha});
  return error?{ok:false,error:error.message}:{ok:true,data};
}
async function cerrarPlantelAhora(id){
  const __sesion=await exigirSesionDatos();if(!__sesion.ok)return __sesion;
  if(!iniciar())return{ok:false,error:'Supabase no configurado'};
  const {data,error}=await client.rpc('cerrar_plantel_ahora',{p_categoria_torneo:id});
  return error?{ok:false,error:error.message}:{ok:true,data};
}
async function actualizarCierreCategoriaTorneo(id,cierrePlantelEn){
  const __sesion=await exigirSesionDatos();if(!__sesion.ok)return __sesion;
  if(!iniciar())return{ok:false,error:'Supabase no configurado'};
  const cambios={
    cierre_plantel_en:cierrePlantelEn||null,
    actualizado_en:new Date().toISOString()
  };
  const{data,error}=await client.from('categorias_torneo')
    .update(cambios)
    .eq('id',id)
    .select('id,torneo_id,categoria,modalidad,cierre_plantel_en')
    .single();
  return error?{ok:false,error:error.message}:{ok:true,data};
}
async function actualizarCierreTodasCategoriasTorneo(torneoId,cierrePlantelEn){
  const __sesion=await exigirSesionDatos();if(!__sesion.ok)return __sesion;
  if(!iniciar())return{ok:false,error:'Supabase no configurado'};
  if(!torneoId)return{ok:false,error:'Falta identificar el torneo'};
  const cambios={
    cierre_plantel_en:cierrePlantelEn||null,
    actualizado_en:new Date().toISOString()
  };
  const{data,error}=await client.from('categorias_torneo')
    .update(cambios)
    .eq('torneo_id',torneoId)
    .eq('activo',true)
    .select('id,categoria,modalidad,cierre_plantel_en');
  return error?{ok:false,error:error.message}:{ok:true,data:data||[]};
}
async function listarInstituciones(torneoId){
  const __sesion=await exigirSesionDatos();if(!__sesion.ok)return __sesion;
  if(!iniciar())return{ok:false,error:'Supabase no configurado',data:[]};
  const{data,error}=await client.from('instituciones')
    .select('*,equipos_competitivos(*)')
    .eq('torneo_id',torneoId)
    .order('nombre',{ascending:true});
  return error?{ok:false,error:error.message,data:[]}:{ok:true,data:data||[]};
}
async function listarEquiposCompetitivos(torneoId,institucionId){
  const __sesion=await exigirSesionDatos();if(!__sesion.ok)return __sesion;
  if(!iniciar())return{ok:false,error:'Supabase no configurado',data:[]};
  if(!torneoId)return{ok:true,data:[]};
  let q=client.from('equipos_competitivos')
    .select('id,torneo_id,institucion_id,nombre,categoria,modalidad,categoria_torneo_id,logo_path,instituciones(nombre)')
    .eq('torneo_id',torneoId)
    .order('nombre',{ascending:true});
  if(institucionId)q=q.eq('institucion_id',institucionId);
  const{data,error}=await q;
  return error?{ok:false,error:error.message,data:[]}:{ok:true,data:data||[]};
}
async function crearInstitucion(d){
  const __sesion=await exigirSesionDatos();if(!__sesion.ok)return __sesion;
  if(!iniciar())return{ok:false,error:'Supabase no configurado'};
  const fila={
    torneo_id:d.torneo_id,
    nombre:(d.nombre||'').trim(),
    responsable_nombre:(d.responsable_nombre||'').trim()||null,
    responsable_email:(d.responsable_email||'').trim().toLowerCase()||null,
    responsable_whatsapp:(d.responsable_whatsapp||'').trim()||null
  };
  const{data,error}=await client.from('instituciones').insert(fila).select().single();
  return error?{ok:false,error:mensajeErrorHumano(error,'institucion')}:{ok:true,data};
}
async function actualizarInstitucion(id,d){
  const __sesion=await exigirSesionDatos();if(!__sesion.ok)return __sesion;
  if(!iniciar())return{ok:false,error:'Supabase no configurado'};
  const cambios={
    nombre:(d.nombre||'').trim(),
    responsable_nombre:(d.responsable_nombre||'').trim()||null,
    responsable_email:(d.responsable_email||'').trim().toLowerCase()||null,
    responsable_whatsapp:(d.responsable_whatsapp||'').trim()||null,
    actualizado_en:new Date().toISOString()
  };
  const{data,error}=await client.from('instituciones').update(cambios).eq('id',id).select().single();
  return error?{ok:false,error:error.message}:{ok:true,data};
}
async function crearEquipoCompetitivo(d){
  const __sesion=await exigirSesionDatos();if(!__sesion.ok)return __sesion;
  if(!iniciar())return{ok:false,error:'Supabase no configurado'};
  const inst=await client.from('instituciones')
    .select('id,estado')
    .eq('id',d.institucion_id).single();
  if(inst.error)return{ok:false,error:inst.error.message};
  if(inst.data.estado==='CONFIRMADO')return{ok:false,error:'La institución está CONFIRMADA y no admite cambios libres.'};

let categoria=(d.categoria||'').trim(),modalidad=(d.modalidad||'').trim(),reglaId=d.categoria_torneo_id||null;
  if(reglaId){
    const rg=await client.from('categorias_torneo').select('id,torneo_id,categoria,modalidad,activo').eq('id',reglaId).single();
    if(rg.error)return{ok:false,error:rg.error.message};
    if(rg.data.torneo_id!==d.torneo_id||!rg.data.activo)return{ok:false,error:'La categoría seleccionada no está habilitada para este torneo.'};
    categoria=rg.data.categoria;modalidad=rg.data.modalidad;
  }
  const fila={
    torneo_id:d.torneo_id,
    institucion_id:d.institucion_id,
    nombre:(d.nombre||'').trim(),
    categoria,modalidad,categoria_torneo_id:reglaId
  };
  const{data,error}=await client.from('equipos_competitivos').insert(fila).select().single();
  return error?{ok:false,error:mensajeErrorHumano(error,'equipo')}:{ok:true,data};
}
async function actualizarEquipoCompetitivo(id,d){
  const __sesion=await exigirSesionDatos();if(!__sesion.ok)return __sesion;
  if(!iniciar())return{ok:false,error:'Supabase no configurado'};
  const{data:errorCheck,error:errCheck}=await client.from('equipos_competitivos')
    .select('institucion_id,instituciones(estado)').eq('id',id).single();
  if(errCheck)return{ok:false,error:errCheck.message};
  if(errorCheck.instituciones?.estado==='CONFIRMADO')return{ok:false,error:'La institución está CONFIRMADA y no admite cambios libres.'};
  let categoria=(d.categoria||'').trim(),modalidad=(d.modalidad||'').trim(),reglaId=d.categoria_torneo_id||null;
  if(reglaId){
    const rg=await client.from('categorias_torneo').select('id,categoria,modalidad,activo').eq('id',reglaId).single();
    if(rg.error)return{ok:false,error:rg.error.message};
    if(!rg.data.activo)return{ok:false,error:'La categoría seleccionada no está habilitada.'};
    categoria=rg.data.categoria;modalidad=rg.data.modalidad;
  }
  const cambios={
    nombre:(d.nombre||'').trim(),categoria,modalidad,categoria_torneo_id:reglaId,
    actualizado_en:new Date().toISOString()
  };
  const{data,error}=await client.from('equipos_competitivos').update(cambios).eq('id',id).select().single();
  return error?{ok:false,error:error.message}:{ok:true,data};
}
async function eliminarEquipoCompetitivo(id){
  const __sesion=await exigirSesionDatos();if(!__sesion.ok)return __sesion;
  if(!iniciar())return{ok:false,error:'Supabase no configurado'};
  const ck=await client.from('equipos_competitivos')
    .select('institucion_id,instituciones(estado)').eq('id',id).single();
  if(ck.error)return{ok:false,error:ck.error.message};
  if(ck.data.instituciones?.estado==='CONFIRMADO')return{ok:false,error:'La institución está CONFIRMADA y no admite cambios libres.'};
  const{error}=await client.from('equipos_competitivos').delete().eq('id',id);
  return error?{ok:false,error:error.message}:{ok:true};
}

function urlPublicaLogoEquipo(path){
  if(!path||!iniciar())return '';
  const{data}=client.storage.from('logos-equipos').getPublicUrl(path);
  return data?.publicUrl||'';
}

async function guardarLogoEquipo(d){
  const __sesion=await exigirSesionDatos();if(!__sesion.ok)return __sesion;
  if(!iniciar())return{ok:false,error:'Supabase no configurado'};
  const equipoId=String(d?.equipo_id||''),torneoId=String(d?.torneo_id||''),institucionId=String(d?.institucion_id||'');
  const archivo=d?.archivo||null;
  if(!equipoId||!torneoId||!institucionId||!archivo)return{ok:false,error:'Faltan datos para guardar el escudo.'};
  if(archivo.size>512000)return{ok:false,error:'El escudo procesado supera los 500 KB.'};

  const eq=await client.from('equipos_competitivos')
    .select('id,torneo_id,institucion_id,logo_path')
    .eq('id',equipoId).single();
  if(eq.error)return{ok:false,error:eq.error.message};
  if(String(eq.data.torneo_id)!==torneoId||String(eq.data.institucion_id)!==institucionId){
    return{ok:false,error:'El equipo no coincide con el torneo o la institución seleccionados.'};
  }

  const nuevoPath=`${torneoId}/${institucionId}/${equipoId}-${Date.now()}.webp`;
  const up=await client.storage.from('logos-equipos')
    .upload(nuevoPath,archivo,{contentType:'image/webp',cacheControl:'3600',upsert:false});
  if(up.error)return{ok:false,error:up.error.message};

  const rpc=await client.rpc('actualizar_logo_equipo',{p_equipo:equipoId,p_logo_path:nuevoPath});
  if(rpc.error){
    try{await client.storage.from('logos-equipos').remove([nuevoPath])}catch(_){}
    return{ok:false,error:rpc.error.message};
  }

  const anterior=eq.data.logo_path;
  if(anterior&&anterior!==nuevoPath){
    try{await client.storage.from('logos-equipos').remove([anterior])}catch(_){}
  }
  return{ok:true,data:{logo_path:nuevoPath,url:urlPublicaLogoEquipo(nuevoPath)}};
}

async function eliminarLogoEquipo(equipoId){
  const __sesion=await exigirSesionDatos();if(!__sesion.ok)return __sesion;
  if(!iniciar())return{ok:false,error:'Supabase no configurado'};

  const eq=await client.from('equipos_competitivos')
    .select('id,logo_path').eq('id',equipoId).single();
  if(eq.error)return{ok:false,error:eq.error.message};
  if(!eq.data.logo_path)return{ok:true};

  const path=eq.data.logo_path;
  const rpc=await client.rpc('actualizar_logo_equipo',{p_equipo:equipoId,p_logo_path:null});
  if(rpc.error)return{ok:false,error:rpc.error.message};

  const rm=await client.storage.from('logos-equipos').remove([path]);
  return rm.error
    ?{ok:true,warning:'El escudo dejó de mostrarse, pero no se pudo borrar el archivo anterior de Storage.'}
    :{ok:true};
}


async function listarJugadoresInstitucion(torneoId,institucionId){
  const __sesion=await exigirSesionDatos();if(!__sesion.ok)return __sesion;
  if(!iniciar())return{ok:false,error:'Supabase no configurado',data:[]};
  const{data,error}=await client.from('jugadores')
    .select('*,jugador_equipos(equipo_competitivo_id,equipos_competitivos(nombre,categoria,modalidad,categoria_torneo_id))')
    .eq('torneo_id',torneoId).eq('institucion_id',institucionId)
    .order('nombre_apellido',{ascending:true});
  return error?{ok:false,error:error.message,data:[]}:{ok:true,data:data||[]};
}

async function listarJugadoresParticipantesInstitucion(torneoId,institucionId){
  const __sesion=await exigirSesionDatos();if(!__sesion.ok)return __sesion;
  if(!iniciar())return{ok:false,error:'Supabase no configurado',data:[]};
  const{data,error}=await client.from('jugadores')
    .select('id,dni,jugador_maestro_id,jugador_equipos!inner(equipo_competitivo_id)')
    .eq('torneo_id',torneoId).eq('institucion_id',institucionId)
    .order('nombre_apellido',{ascending:true});
  return error?{ok:false,error:error.message,data:[]}:{ok:true,data:data||[]};
}
async function guardarJugador(d){
  const __sesion=await exigirSesionDatos();if(!__sesion.ok)return __sesion;
  if(!iniciar())return{ok:false,error:'Supabase no configurado'};
  const dni=String(d.dni||'').replace(/\D/g,'');
  if(!dni)return{ok:false,error:'Ingresá el DNI.'};
  const existe=await client.from('jugadores')
    .select('id,institucion_id,nombre_apellido,instituciones(nombre)')
    .eq('torneo_id',d.torneo_id).eq('dni',dni).maybeSingle();
  if(existe.error)return{ok:false,error:existe.error.message};
  if(existe.data && existe.data.institucion_id!==d.institucion_id){
    return{ok:false,error:'DNI BLOQUEADO: ya está registrado en otra institución de este torneo ('+(existe.data.instituciones?.nombre||'otra institución')+').'};
  }
  if(existe.data){
    return{ok:false,error:'Ese DNI ya existe en esta institución. Editá el jugador existente o asignalo a otro equipo competitivo.'};
  }
  const fila={torneo_id:d.torneo_id,institucion_id:d.institucion_id,nombre_apellido:(d.nombre_apellido||'').trim(),dni,
    fecha_nacimiento:d.fecha_nacimiento,posicion:d.posicion,foto_url:null};
  const ins=await client.from('jugadores').insert(fila).select().single();
  if(ins.error){
    if(ins.error.code==='23505' || /duplicate key|unique/i.test(ins.error.message||'')){
      return{ok:false,error:'DNI BLOQUEADO: ese jugador ya está registrado en otra institución o ya existe en este torneo.'};
    }
    return{ok:false,error:ins.error.message};
  }
  if(d.equipos?.length){
    const rows=d.equipos.map(e=>({jugador_id:ins.data.id,equipo_competitivo_id:e}));
    const asg=await client.from('jugador_equipos').insert(rows);
    if(asg.error){await client.from('jugadores').delete().eq('id',ins.data.id);return{ok:false,error:asg.error.message};}
  }
  return{ok:true,data:ins.data};
}
async function actualizarAsignacionesJugador(jugadorId,equipos){
  const __sesion=await exigirSesionDatos();if(!__sesion.ok)return __sesion;
  if(!iniciar())return{ok:false,error:'Supabase no configurado'};
  const prev=await client.from('jugador_equipos').select('equipo_competitivo_id').eq('jugador_id',jugadorId);
  if(prev.error)return{ok:false,error:prev.error.message};
  const anteriores=(prev.data||[]).map(x=>x.equipo_competitivo_id),nuevos=[...new Set(equipos||[])];
  const agregar=nuevos.filter(x=>!anteriores.includes(x)),quitar=anteriores.filter(x=>!nuevos.includes(x));
  if(agregar.length){
    const ins=await client.from('jugador_equipos').insert(agregar.map(e=>({jugador_id:jugadorId,equipo_competitivo_id:e})));
    if(ins.error)return{ok:false,error:ins.error.message};
  }
  if(quitar.length){
    const del=await client.from('jugador_equipos').delete().eq('jugador_id',jugadorId).in('equipo_competitivo_id',quitar);
    if(del.error)return{ok:false,error:del.error.message};
  }
  return{ok:true};
}
async function eliminarJugador(id){
  const __sesion=await exigirSesionDatos();if(!__sesion.ok)return __sesion;
  if(!iniciar())return{ok:false,error:'Supabase no configurado'};
  const{error}=await client.from('jugadores').delete().eq('id',id);
  return error?{ok:false,error:error.message}:{ok:true};
}


async function listarAlertasPlantelPendientes(torneoId){
  const __sesion=await exigirSesionDatos();if(!__sesion.ok)return __sesion;
  if(!iniciar())return{ok:false,error:'Supabase no configurado',data:[]};
  let q=client.from('alertas_plantel')
    .select('id,torneo_id,institucion_id,jugador_id,equipo_competitivo_id,tipo,detalle,edad_calculada,regla_resumen,estado,creado_en,torneos(nombre),instituciones(nombre),jugadores(nombre_apellido,dni,fecha_nacimiento),equipos_competitivos(nombre,categoria,modalidad)')
    .eq('estado','PENDIENTE')
    .order('creado_en',{ascending:false});
  if(torneoId)q=q.eq('torneo_id',torneoId);
  else{
    const user=await usuarioAuth();
    if(user){
      const rp=await client.from('perfiles').select('es_admin_general').eq('id',user.id).maybeSingle();
      if(rp.error)return{ok:false,error:rp.error.message,data:[]};
      if(!rp.data?.es_admin_general){
        const rm=await client.from('usuarios_torneos').select('torneo_id').eq('usuario_id',user.id).eq('rol','ORGANIZADOR').eq('activo',true);
        if(rm.error)return{ok:false,error:rm.error.message,data:[]};
        const ids=(rm.data||[]).map(x=>x.torneo_id);
        if(!ids.length)return{ok:true,data:[]};
        q=q.in('torneo_id',ids);
      }
    }
  }
  const{data,error}=await q;
  return error?{ok:false,error:error.message,data:[]}:{ok:true,data:data||[]};
}
async function listarAlertasPlantel(torneoId){
  const __sesion=await exigirSesionDatos();if(!__sesion.ok)return __sesion;
  if(!iniciar())return{ok:false,error:'Supabase no configurado',data:[]};
  let q=client.from('alertas_plantel')
    .select('id,torneo_id,institucion_id,jugador_id,equipo_competitivo_id,tipo,detalle,edad_calculada,regla_resumen,estado,creado_en,resuelto_en,actualizado_en,torneos(nombre),instituciones(nombre),jugadores(nombre_apellido,dni,fecha_nacimiento),equipos_competitivos(nombre,categoria,modalidad)')
    .order('creado_en',{ascending:false});
  if(torneoId)q=q.eq('torneo_id',torneoId);
  else{
    const user=await usuarioAuth();
    if(user){
      const rp=await client.from('perfiles').select('es_admin_general').eq('id',user.id).maybeSingle();
      if(rp.error)return{ok:false,error:rp.error.message,data:[]};
      if(!rp.data?.es_admin_general){
        const rm=await client.from('usuarios_torneos').select('torneo_id').eq('usuario_id',user.id).eq('rol','ORGANIZADOR').eq('activo',true);
        if(rm.error)return{ok:false,error:rm.error.message,data:[]};
        const ids=(rm.data||[]).map(x=>x.torneo_id);
        if(!ids.length)return{ok:true,data:[]};
        q=q.in('torneo_id',ids);
      }
    }
  }
  const{data,error}=await q;
  return error?{ok:false,error:error.message,data:[]}:{ok:true,data:data||[]};
}

async function resolverAlertaPlantel(id,decision){
  const __sesion=await exigirSesionDatos();if(!__sesion.ok)return __sesion;
  if(!iniciar())return{ok:false,error:'Supabase no configurado'};
  decision=String(decision||'').toUpperCase();
  if(!['ACEPTADA','RECHAZADA'].includes(decision))return{ok:false,error:'Decisión inválida.'};
  const al=await client.from('alertas_plantel')
    .select('id,jugador_id,equipo_competitivo_id,estado')
    .eq('id',id).single();
  if(al.error)return{ok:false,error:al.error.message};
  if(al.data.estado!=='PENDIENTE')return{ok:false,error:'La alerta ya fue resuelta.'};
  if(decision==='RECHAZADA'){
    const del=await client.from('jugador_equipos').delete()
      .eq('jugador_id',al.data.jugador_id)
      .eq('equipo_competitivo_id',al.data.equipo_competitivo_id);
    if(del.error)return{ok:false,error:del.error.message};
  }
  const{data,error}=await client.from('alertas_plantel').update({
    estado:decision,resuelto_en:new Date().toISOString(),actualizado_en:new Date().toISOString()
  }).eq('id',id).select().single();
  return error?{ok:false,error:error.message}:{ok:true,data};
}

async function listarAsignacionesResponsable(email){
  const __sesion=await exigirSesionDatos();if(!__sesion.ok)return __sesion;
  if(!iniciar())return{ok:false,error:'Supabase no configurado',data:[]};
  email=String(email||'').trim().toLowerCase();
  const user=await usuarioAuth();
  let q=client.from('instituciones')
    .select('id,torneo_id,nombre,responsable_nombre,responsable_email,responsable_whatsapp,responsable_usuario_id,estado,creado_en,equipos_competitivos(id,torneo_id,institucion_id,nombre,categoria,modalidad,categoria_torneo_id,logo_path,creado_en)')
    .order('creado_en',{ascending:false});
  if(user)q=q.eq('responsable_usuario_id',user.id);
  else{
    if(!email)return{ok:false,error:'La sesión no tiene email de responsable.',data:[]};
    q=q.eq('responsable_email',email);
  }
  let{data,error}=await q;
  if(error)return{ok:false,error:error.message,data:[]};
  if(user&&!(data||[]).length&&email){
    const fb=await client.from('instituciones')
      .select('id,torneo_id,nombre,responsable_nombre,responsable_email,responsable_whatsapp,responsable_usuario_id,estado,creado_en,equipos_competitivos(id,torneo_id,institucion_id,nombre,categoria,modalidad,categoria_torneo_id,logo_path,creado_en)')
      .eq('responsable_email',email).order('creado_en',{ascending:false});
    if(fb.error)return{ok:false,error:fb.error.message,data:[]};
    data=fb.data||[];
  }
  const ids=[...new Set((data||[]).map(i=>i.torneo_id))];
  let mapa=new Map();
  if(ids.length){
    const tr=await client.from('torneos').select('id,nombre,estado,creado_en').in('id',ids);
    if(tr.error)return{ok:false,error:tr.error.message,data:[]};
    mapa=new Map((tr.data||[]).map(t=>[t.id,t]));
  }
  return{ok:true,data:(data||[]).map(i=>({...i,torneo:mapa.get(i.torneo_id)||null}))};
}
async function obtenerInstitucion(id){
  const __sesion=await exigirSesionDatos();if(!__sesion.ok)return __sesion;
  if(!iniciar())return{ok:false,error:'Supabase no configurado'};
  const{data,error}=await client.from('instituciones')
    .select('id,torneo_id,nombre,responsable_nombre,responsable_email,responsable_whatsapp,responsable_usuario_id,estado,equipos_competitivos(id,torneo_id,institucion_id,nombre,categoria,modalidad,categoria_torneo_id,logo_path)')
    .eq('id',id).single();
  return error?{ok:false,error:error.message}:{ok:true,data};
}


async function listarJugadoresMaestros(responsableUsuarioId=null,soloActivos=true){
  const __sesion=await exigirSesionDatos();if(!__sesion.ok)return __sesion;
  if(!iniciar())return{ok:false,error:'Supabase no configurado',data:[]};
  let q=client.from('jugadores_maestros')
    .select('id,responsable_usuario_id,nombre_apellido,dni,fecha_nacimiento,posicion,foto_url,activo,creado_en,actualizado_en')
    .order('nombre_apellido',{ascending:true});
  if(responsableUsuarioId)q=q.eq('responsable_usuario_id',responsableUsuarioId);
  if(soloActivos)q=q.eq('activo',true);
  const{data,error}=await q;
  return error?{ok:false,error:error.message,data:[]}:{ok:true,data:data||[]};
}

async function crearJugadorMaestro(d){
  const __sesion=await exigirSesionDatos();if(!__sesion.ok)return __sesion;
  if(!iniciar())return{ok:false,error:'Supabase no configurado'};
  const user=await usuarioAuth();
  if(!user)return{ok:false,error:'No hay una sesión autenticada.'};
  const dni=String(d.dni||'').replace(/\D/g,'');
  if(!dni)return{ok:false,error:'Ingresá el DNI.'};
  const fila={
    responsable_usuario_id:user.id,
    nombre_apellido:String(d.nombre_apellido||'').trim(),
    dni,
    fecha_nacimiento:d.fecha_nacimiento,
    posicion:d.posicion,
    foto_url:null,
    activo:true
  };
  const existente=await client.from('jugadores_maestros').select('id').eq('responsable_usuario_id',user.id).eq('dni',dni).maybeSingle();
  if(existente.error)return{ok:false,error:mensajeErrorHumano(existente.error,'jugador_bolsa')};
  if(existente.data)return{ok:false,error:'Este DNI ya está cargado en tu Bolsa de jugadores.'};
  const{data,error}=await client.from('jugadores_maestros').insert(fila).select().single();
  return error?{ok:false,error:mensajeErrorHumano(error,'jugador_bolsa')}:{ok:true,data};
}

async function actualizarJugadorMaestro(id,d){
  const __sesion=await exigirSesionDatos();if(!__sesion.ok)return __sesion;
  if(!iniciar())return{ok:false,error:'Supabase no configurado'};
  const cambios={
    nombre_apellido:String(d.nombre_apellido||'').trim(),
    dni:String(d.dni||'').replace(/\D/g,''),
    fecha_nacimiento:d.fecha_nacimiento,
    posicion:d.posicion,
    actualizado_en:new Date().toISOString()
  };
  const{data,error}=await client.from('jugadores_maestros').update(cambios).eq('id',id).select().single();
  return error?{ok:false,error:mensajeErrorHumano(error,'jugador_bolsa')}:{ok:true,data};
}

async function desactivarJugadorMaestro(id){
  const __sesion=await exigirSesionDatos();if(!__sesion.ok)return __sesion;
  if(!iniciar())return{ok:false,error:'Supabase no configurado'};
  const{data,error}=await client.from('jugadores_maestros').update({activo:false,actualizado_en:new Date().toISOString()}).eq('id',id).select().single();
  return error?{ok:false,error:error.message}:{ok:true,data};
}

async function plantelCategoriaAbierto(categoriaTorneoId){
  const __sesion=await exigirSesionDatos();if(!__sesion.ok)return __sesion;
  if(!iniciar())return{ok:false,error:'Supabase no configurado'};
  const{data,error}=await client.rpc('plantel_categoria_abierto',{p_categoria_torneo_id:categoriaTorneoId});
  return error?{ok:false,error:error.message}:{ok:true,data:!!data};
}

async function agregarJugadorMaestroEquipoAbierto(jugadorMaestroId,equipoId){
  const __sesion=await exigirSesionDatos();if(!__sesion.ok)return __sesion;
  if(!iniciar())return{ok:false,error:'Supabase no configurado'};
  const eq=await client.from('equipos_competitivos').select('id,torneo_id,institucion_id,categoria_torneo_id,nombre,categoria,modalidad').eq('id',equipoId).single();
  if(eq.error)return{ok:false,error:eq.error.message};
  const abierto=await plantelCategoriaAbierto(eq.data.categoria_torneo_id);
  if(!abierto.ok)return abierto;
  if(!abierto.data)return{ok:false,error:'La lista del torneo para esta categoría está cerrada. Debés solicitar un cambio.'};
  const jm=await client.from('jugadores_maestros').select('id,nombre_apellido,dni,fecha_nacimiento,posicion').eq('id',jugadorMaestroId).single();
  if(jm.error)return{ok:false,error:jm.error.message};
  const dni=String(jm.data.dni||'').replace(/\D/g,'');
  const existentes=await client.from('jugadores').select('id,institucion_id,jugador_maestro_id,instituciones(nombre)').eq('torneo_id',eq.data.torneo_id).eq('dni',dni).limit(2);
  if(existentes.error)return{ok:false,error:mensajeErrorHumano(existentes.error)};
  const otro=(existentes.data||[]).find(j=>j.institucion_id!==eq.data.institucion_id);
  if(otro){
    const inst=otro.instituciones?.nombre||'otra institución';
    return{ok:false,error:`Este jugador ya participa en este torneo con ${inst}. Comunicate con el Organizador mediante Mensajería.`};
  }
  let jugador=(existentes.data||[]).find(j=>j.institucion_id===eq.data.institucion_id)||null;
  if(!jugador){
    const ins=await client.from('jugadores').insert({
      torneo_id:eq.data.torneo_id,institucion_id:eq.data.institucion_id,
      nombre_apellido:jm.data.nombre_apellido,dni,
      fecha_nacimiento:jm.data.fecha_nacimiento,posicion:jm.data.posicion,
      foto_url:null,jugador_maestro_id:jm.data.id
    }).select().single();
    if(ins.error)return{ok:false,error:ins.error.message};
    jugador=ins.data;
  }else if(!jugador.jugador_maestro_id){
    await client.from('jugadores').update({jugador_maestro_id:jm.data.id}).eq('id',jugador.id);
  }
  const ya=await client.from('jugador_equipos').select('jugador_id').eq('jugador_id',jugador.id).eq('equipo_competitivo_id',equipoId).maybeSingle();
  if(ya.error)return{ok:false,error:ya.error.message};
  if(!ya.data){
    const rel=await client.from('jugador_equipos').insert({jugador_id:jugador.id,equipo_competitivo_id:equipoId});
    if(rel.error)return{ok:false,error:mensajeErrorHumano(rel.error,'jugador_bolsa')};
  }
  return{ok:true,data:{jugador_id:jugador.id,equipo_id:equipoId}};
}

async function solicitarCambioPlantel(d){
  const __sesion=await exigirSesionDatos();if(!__sesion.ok)return __sesion;
  if(!iniciar())return{ok:false,error:'Supabase no configurado'};
  const{data,error}=await client.rpc('solicitar_cambio_plantel',{
    p_equipo_competitivo_id:d.equipo_competitivo_id,
    p_jugador_maestro_id:d.jugador_maestro_id||null,
    p_jugador_id:d.jugador_id||null,
    p_accion:String(d.accion||'').toUpperCase(),
    p_motivo:String(d.motivo||'').trim()
  });
  return error?{ok:false,error:error.message}:{ok:true,data};
}

async function resolverCambioPlantel(solicitudId,decision){
  const __sesion=await exigirSesionDatos();if(!__sesion.ok)return __sesion;
  if(!iniciar())return{ok:false,error:'Supabase no configurado'};
  const{data,error}=await client.rpc('resolver_cambio_plantel',{p_solicitud:solicitudId,p_decision:decision});
  return error?{ok:false,error:error.message}:{ok:true,data};
}

async function aplicarAltaExcepcionalPlantel(solicitudId){
  const __sesion=await exigirSesionDatos();if(!__sesion.ok)return __sesion;
  if(!iniciar())return{ok:false,error:'Supabase no configurado'};
  const{data,error}=await client.rpc('aplicar_alta_excepcional_plantel',{p_solicitud:solicitudId});
  return error?{ok:false,error:error.message}:{ok:true,data};
}

async function listarSolicitudesCambioPlantel(torneoId=null){
  const __sesion=await exigirSesionDatos();if(!__sesion.ok)return __sesion;
  if(!iniciar())return{ok:false,error:'Supabase no configurado',data:[]};
  let q=client.from('solicitudes_cambio_plantel')
    .select('id,torneo_id,categoria_torneo_id,equipo_competitivo_id,jugador_maestro_id,jugador_id,accion,motivo,solicitado_por,solicitado_en,estado,autorizado_por,autorizado_en,aplicado_en,jugadores_maestros(nombre_apellido,dni,fecha_nacimiento,posicion),jugadores(nombre_apellido,dni,fecha_nacimiento,posicion),equipos_competitivos(nombre,categoria,modalidad,institucion_id,instituciones(nombre)),categorias_torneo(categoria,modalidad,cierre_plantel_en)')
    .order('solicitado_en',{ascending:false});
  if(torneoId)q=q.eq('torneo_id',torneoId);
  const{data,error}=await q;
  return error?{ok:false,error:error.message,data:[]}:{ok:true,data:data||[]};
}


async function crearSolicitudListaCerrada(d){
  const __sesion=await exigirSesionDatos();if(!__sesion.ok)return __sesion;
  if(!iniciar())return{ok:false,error:'Supabase no configurado'};
  const{data,error}=await client.rpc('crear_solicitud_lista_cerrada',{
    p_equipo_origen_id:d.equipo_origen_id,
    p_jugador_id:d.jugador_id||null,
    p_accion:String(d.accion||'').toUpperCase(),
    p_motivo:String(d.motivo||'').trim(),
    p_equipo_destino_id:d.equipo_destino_id||null,
    p_solicitante_rol:String(d.solicitante_rol||'').toUpperCase(),
    p_jugador_maestro_id:d.jugador_maestro_id||null
  });
  return error?{ok:false,error:error.message}:{ok:true,data};
}

async function resolverSolicitudListaCerrada(id,decision){
  const __sesion=await exigirSesionDatos();if(!__sesion.ok)return __sesion;
  if(!iniciar())return{ok:false,error:'Supabase no configurado'};
  const{data,error}=await client.rpc('resolver_solicitud_lista_cerrada',{p_solicitud:id,p_decision:decision});
  return error?{ok:false,error:error.message}:{ok:true,data};
}

async function listarSolicitudesListaCerrada(){
  const __sesion=await exigirSesionDatos();if(!__sesion.ok)return __sesion;
  if(!iniciar())return{ok:false,error:'Supabase no configurado',data:[]};
  const{data,error}=await client.rpc('listar_solicitudes_lista_cerrada');
  return error?{ok:false,error:error.message,data:[]}:{ok:true,data:data||[]};
}

async function resumenSolicitudesListaCerrada(){
  const __sesion=await exigirSesionDatos();if(!__sesion.ok)return __sesion;
  if(!iniciar())return{ok:false,error:'Supabase no configurado',data:{como_organizador:0,como_responsable:0}};
  const{data,error}=await client.rpc('resumen_solicitudes_lista_cerrada');
  return error?{ok:false,error:error.message}:{ok:true,data:data||{como_organizador:0,como_responsable:0}};
}


async function listarEstadoOrganizadoresPorTorneo(){
  const __sesion=await exigirSesionDatos();if(!__sesion.ok)return __sesion;
  if(!iniciar())return{ok:false,error:'Supabase no configurado',data:[]};
  const{data,error}=await client.rpc('estado_organizador_torneos_responsable');
  return error?{ok:false,error:error.message,data:[]}:{ok:true,data:data||[]};
}

async function adminListarPerfiles(){
  const __sesion=await exigirSesionDatos();if(!__sesion.ok)return __sesion;
  if(!iniciar())return{ok:false,error:'Supabase no configurado',data:[]};
  const{data,error}=await client.from('perfiles')
    .select('id,nombre,email,puede_crear_torneos,es_admin_general,creado_en,actualizado_en')
    .order('nombre',{ascending:true});
  return error?{ok:false,error:error.message,data:[]}:{ok:true,data:data||[]};
}
async function adminListarMembresias(){
  const __sesion=await exigirSesionDatos();if(!__sesion.ok)return __sesion;
  if(!iniciar())return{ok:false,error:'Supabase no configurado',data:[]};
  const{data,error}=await client.from('usuarios_torneos')
    .select('id,torneo_id,usuario_id,rol,institucion_id,activo,creado_en,torneos(id,nombre,estado),instituciones(id,nombre)');
  return error?{ok:false,error:error.message,data:[]}:{ok:true,data:data||[]};
}
async function adminResumen(){
  const __sesion=await exigirSesionDatos();if(!__sesion.ok)return __sesion;
  if(!iniciar())return{ok:false,error:'Supabase no configurado'};
  const tablas=['torneos','instituciones','equipos_competitivos','jugadores','partidos'];
  const consultas=tablas.map(t=>client.from(t).select('id',{count:'exact',head:true}));
  consultas.push(client.from('alertas_plantel').select('id',{count:'exact',head:true}).eq('estado','PENDIENTE'));
  const rs=await Promise.all(consultas);
  const err=rs.find(r=>r.error);if(err)return{ok:false,error:err.error.message};
  return{ok:true,data:{torneos:rs[0].count||0,instituciones:rs[1].count||0,equipos:rs[2].count||0,jugadores:rs[3].count||0,partidos:rs[4].count||0,alertas:rs[5].count||0}};
}
async function adminConfigurarOrganizador(usuarioId,habilitado){
  const __sesion=await exigirSesionDatos();if(!__sesion.ok)return __sesion;
  if(!iniciar())return{ok:false,error:'Supabase no configurado'};
  const{data,error}=await client.rpc('admin_configurar_organizador',{p_usuario:usuarioId,p_habilitado:!!habilitado});
  return error?{ok:false,error:error.message}:{ok:true,data};
}

async function adminAsignarOrganizadorTorneo(torneoId,usuarioId){
  const __sesion=await exigirSesionDatos();if(!__sesion.ok)return __sesion;
  if(!iniciar())return{ok:false,error:'Supabase no configurado'};
  if(!torneoId)return{ok:false,error:'Falta identificar el torneo.'};
  if(!usuarioId)return{ok:false,error:'Seleccioná un Organizador.'};
  const{data,error}=await client.rpc('admin_asignar_organizador_torneo',{
    p_torneo:torneoId,
    p_usuario:usuarioId
  });
  return error?{ok:false,error:error.message}:{ok:true,data};
}

async function actualizarPublicacionTorneo(id,publicado,publicarProgramacion){
  const __sesion=await exigirSesionDatos();if(!__sesion.ok)return __sesion;
  if(!iniciar())return{ok:false,error:'Supabase no configurado'};
  if(!id)return{ok:false,error:'Falta identificar el torneo.'};
  const cambios={
    publicado:!!publicado,
    publicar_programacion:!!publicado && !!publicarProgramacion
  };
  const{data,error}=await client.from('torneos').update(cambios).eq('id',id).select('id,nombre,estado,publicado,publicar_programacion').single();
  return error?{ok:false,error:error.message}:{ok:true,data};
}

async function listarTorneosPublicos(){
  if(!iniciar())return{ok:false,error:'Supabase no configurado',data:[]};
  const{data,error}=await client.rpc('consulta_publica_torneos');
  return error?{ok:false,error:error.message,data:[]}:{ok:true,data:data||[]};
}
async function listarEquiposPublicos(torneoId){
  if(!iniciar())return{ok:false,error:'Supabase no configurado',data:[]};
  if(!torneoId)return{ok:true,data:[]};
  const{data,error}=await client.rpc('consulta_publica_equipos',{p_torneo:torneoId});
  return error?{ok:false,error:error.message,data:[]}:{ok:true,data:data||[]};
}
async function listarPartidosPublicosFinalizados(torneoId){
  if(!iniciar())return{ok:false,error:'Supabase no configurado',data:[]};
  if(!torneoId)return{ok:true,data:[]};
  const{data,error}=await client.rpc('consulta_publica_partidos_finalizados',{p_torneo:torneoId});
  return error?{ok:false,error:error.message,data:[]}:{ok:true,data:data||[]};
}
async function listarProgramacionPublica(torneoId){
  if(!iniciar())return{ok:false,error:'Supabase no configurado',data:[]};
  if(!torneoId)return{ok:true,data:[]};
  const{data,error}=await client.rpc('consulta_publica_programacion',{p_torneo:torneoId});
  return error?{ok:false,error:error.message,data:[]}:{ok:true,data:data||[]};
}

return{iniciar,mensajeErrorHumano,restaurarSesionAuth,usuarioAuth,obtenerContextoUsuario,registrarCuentaAuth,solicitarRecuperacionPassword,esperarRecuperacionPassword,actualizarPasswordRecuperacion,iniciarSesionAuth,verificarAceptacionLegal,registrarAceptacionLegal,cerrarSesionAuth,listarTorneos,crearTorneo,obtenerTorneo,actualizarPuntuacionTorneo,eliminarTorneoAdmin,cerrarPlantelAhora,programarCierrePlantel,eliminarSedeTorneo,actualizarSedeTorneo,crearSedeTorneo,listarSedesTorneo,crearJornadaConPartidos,listarPartidos,obtenerPartido,listarJornadasTorneo,actualizarProgramacionPartido,eliminarPartidoPendiente,reabrirPartidoFinalizado,enviarNotificacionesPartidoEmail,hayAlertasNoLeidasActual,listarNotificacionesSistema,marcarNotificacionLeida,guardarBorradorPartido,suspenderPartido,finalizarPartido,corregirPartido,listarAuditoriaPartidos,listarPartidosFinalizados,listarCategoriasTorneo,crearCategoriaTorneo,actualizarCategoriaTorneo,eliminarCategoriaTorneo,actualizarCierreCategoriaTorneo,actualizarCierreTodasCategoriasTorneo,listarInstituciones,listarEquiposCompetitivos,crearInstitucion,actualizarInstitucion,crearEquipoCompetitivo,actualizarEquipoCompetitivo,eliminarEquipoCompetitivo,urlPublicaLogoEquipo,guardarLogoEquipo,eliminarLogoEquipo,listarJugadoresInstitucion,listarJugadoresParticipantesInstitucion,guardarJugador,actualizarAsignacionesJugador,eliminarJugador,listarAlertasPlantelPendientes,listarAlertasPlantel,resolverAlertaPlantel,listarAsignacionesResponsable,obtenerInstitucion,listarEstadoOrganizadoresPorTorneo,listarJugadoresMaestros,crearJugadorMaestro,actualizarJugadorMaestro,desactivarJugadorMaestro,plantelCategoriaAbierto,agregarJugadorMaestroEquipoAbierto,solicitarCambioPlantel,resolverCambioPlantel,aplicarAltaExcepcionalPlantel,listarSolicitudesCambioPlantel,crearSolicitudListaCerrada,resolverSolicitudListaCerrada,listarSolicitudesListaCerrada,resumenSolicitudesListaCerrada,adminListarPerfiles,adminListarMembresias,adminResumen,adminConfigurarOrganizador,adminAsignarOrganizadorTorneo,actualizarPublicacionTorneo,listarTorneosPublicos,listarEquiposPublicos,listarPartidosPublicosFinalizados,listarProgramacionPublica};
})();