import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
const allowedOrigin="https://tornewcom.netlify.app";
const cors={"Access-Control-Allow-Origin":allowedOrigin,"Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin"};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json; charset=utf-8"}});
const esc=(v:unknown)=>String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return reply({ok:false,error:"Método no permitido"},405);
 try{
  const auth=req.headers.get("Authorization")||""; if(!auth.startsWith("Bearer "))return reply({ok:false,error:"Falta autenticación"},401);
  const url=Deno.env.get("SUPABASE_URL")!, anon=Deno.env.get("SUPABASE_ANON_KEY")||Deno.env.get("SUPABASE_PUBLISHABLE_KEY")||"", service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, brevo=Deno.env.get("BREVO_MENSAJES_API_KEY")!;
  if(!anon||!service||!brevo)return reply({ok:false,error:"Configuración incompleta"},500);
  const userClient=createClient(url,anon,{global:{headers:{Authorization:auth}},auth:{persistSession:false}}); const {data:ud}=await userClient.auth.getUser(); const user=ud?.user; if(!user)return reply({ok:false,error:"Sesión inválida"},401);
  const body=await req.json().catch(()=>({})); const nid=String(body?.notification_id||"").trim(); if(!nid)return reply({ok:false,error:"Falta notification_id"},400);
  const admin=createClient(url,service,{auth:{persistSession:false}});
  const {data:n,error:ne}=await admin.from("notificaciones_sistema").select("id,torneo_id,destinatario_id,tipo,titulo,detalle,cambios,creado_por,torneos(nombre)").eq("id",nid).maybeSingle(); if(ne||!n)return reply({ok:false,error:"Notificación inexistente"},404);
  const {data:perfil}=await admin.from("perfiles").select("es_admin_general").eq("id",user.id).maybeSingle();
  const {data:memb}=await admin.from("usuarios_torneos").select("id").eq("usuario_id",user.id).eq("torneo_id",n.torneo_id).eq("rol","ORGANIZADOR").eq("activo",true).limit(1);
  if(n.creado_por!==user.id && !perfil?.es_admin_general && !(memb||[]).length)return reply({ok:false,error:"Sin permiso"},403);
  const {data:dest}=await admin.from("perfiles").select("nombre,email").eq("id",n.destinatario_id).maybeSingle(); if(!dest?.email)return reply({ok:false,error:"Responsable sin email"},422);
  const torneo=(n as any).torneos?.nombre||"TorNewcom"; const html=`<div style="font-family:Arial,Helvetica,sans-serif;max-width:620px;margin:auto;color:#17324a;line-height:1.55"><div style="background:#2F5D7E;color:#fff;padding:18px 22px;border-radius:12px 12px 0 0"><strong style="font-size:22px">TorNewcom</strong><br><span>Notificación automática</span></div><div style="border:1px solid #dbe7ef;border-top:0;padding:24px;border-radius:0 0 12px 12px"><p>Hola ${esc(dest.nombre||"Responsable")},</p><p><strong>${esc(n.titulo)}</strong></p><p>${esc(n.detalle)}</p><p>Torneo: <strong>${esc(torneo)}</strong>.</p><p style="margin:24px 0"><a href="https://tornewcom.netlify.app/acceso_real.html" style="display:inline-block;background:#2679d6;color:#fff;text-decoration:none;padding:11px 17px;border-radius:8px;font-weight:bold">Ingresar a TorNewcom</a></p><p style="font-size:13px;color:#607887">Este es un aviso automático de TorNewcom. No respondas este correo.</p></div></div>`;
  const br=await fetch("https://api.brevo.com/v3/smtp/email",{method:"POST",headers:{"api-key":brevo,"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify({sender:{name:"TorNewcom",email:"gabrielprozzillo@gmail.com"},to:[{email:dest.email,name:dest.nombre||"Responsable"}],subject:`TorNewcom: ${n.titulo}`,htmlContent:html})}); const bd=await br.json().catch(()=>({})); if(!br.ok)return reply({ok:false,error:"Brevo rechazó la notificación",status:br.status},502); return reply({ok:true,email_enviado:true,brevo_message_id:bd?.messageId??null});
 }catch(e){return reply({ok:false,error:e instanceof Error?e.message:String(e)},500)}
});
