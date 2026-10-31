import { buildPushPayload } from "@block65/webcrypto-web-push";
const VAPID_PUBLIC_KEY="BFk-5xjMAOzukZZ7JiRbJH1cURsOBECMuNoLkXnzKXxaa1Ove15v9PAGzVjHUk6lkWJtPwBxPSmwRtd2ODKPfSA";
const VAPID_SUBJECT="https://nutriplan.osdaisaac.workers.dev";
const MEALS=[
 {key:"desayuno",title:"Desayuno",hour:7,minute:15},
 {key:"mediamanana",title:"Media mañana",hour:9,minute:45},
 {key:"almuerzo",title:"Almuerzo",hour:12,minute:15},
 {key:"algo",title:"Algo de la tarde",hour:15,minute:45},
 {key:"cena",title:"Cena",hour:18,minute:45}
];
const MEAL_KEYS=MEALS.map(m=>m.key);
const MOTIVATION=[
 "Eres una mujer valiosa y mereces dedicarte tiempo. Hoy también cuenta cada pequeño paso. 🌷",
 "Cuida de ti con la misma ternura con la que cuidas a quienes amas. Que Dios bendiga tu día y a tu familia. ❤️",
 "No necesitas hacerlo todo perfecto. Un paso consciente a la vez también es avanzar. 🌿",
 "Tu bienestar importa. Regálate paciencia, amor y un momento para respirar. Que Dios te acompañe hoy. 🙏",
 "Eres fuerte, capaz y merecedora de cosas buenas. Sigue cuidando de ti, sin compararte con nadie. ✨",
 "Que hoy no te falten motivos para sonreír, fuerzas para continuar y bendiciones para tu hogar. ❤️",
 "Tu cuerpo merece respeto, alimento y descanso. Gracias por seguir haciendo espacio para cuidarte. 🌱",
 "Cada comida es una oportunidad para elegirte. No se trata de perfección, sino de constancia. 💚",
 "Dios bendiga tus pasos, tus esfuerzos y a las personas que amas. Sigue adelante con esperanza. 🙏",
 "Hoy háblate bonito. Estás aprendiendo, creciendo y construyendo hábitos que te hacen bien. 🌸",
 "Tu valor no depende de una cifra ni de un día perfecto. Eres valiosa tal como eres. 💗",
 "Regálate paciencia: los cambios duraderos se construyen con cariño y pequeños hábitos. 🌿",
 "Que tengas un día lleno de paz. No olvides que también mereces recibir el cuidado que das. ❤️",
 "Respira, agradece y vuelve a empezar las veces que haga falta. Dios bendiga tu hogar. 🙏",
 "Celebra lo que sí has logrado. Cada decisión de autocuidado cuenta y merece reconocimiento. 🌼"
];
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});}
function allowed(request){const origin=request.headers.get("Origin");return !origin||origin===new URL(request.url).origin;}
function configured(env){return Boolean(env.DB&&env.VAPID_PRIVATE_KEY);}
function bogota(timestamp){
 const p=new Intl.DateTimeFormat("en-US",{timeZone:"America/Bogota",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date(timestamp));
 const v=Object.fromEntries(p.map(x=>[x.type,x.value]));
 return {date:`${v.year}-${v.month}-${v.day}`,hour:Number(v.hour),minute:Number(v.minute)};
}
function dailyMessage(date){
 const n=Math.floor(Date.parse(date+"T12:00:00Z")/86400000);
 return MOTIVATION[((n%MOTIVATION.length)+MOTIVATION.length)%MOTIVATION.length];
}
async function bodyJson(request){
 const raw=await request.text();if(raw.length>20000)throw new Error("REQUEST_TOO_LARGE");
 return raw?JSON.parse(raw):{};
}
function validSub(s){return Boolean(s&&typeof s.endpoint==="string"&&s.endpoint.startsWith("https://")&&s.endpoint.length<=4000&&s.keys&&typeof s.keys.p256dh==="string"&&typeof s.keys.auth==="string");}
async function sendPush(env,sub,message){
 if(!env.VAPID_PRIVATE_KEY)throw new Error("VAPID_SECRET_NOT_CONFIGURED");
 const payload=await buildPushPayload({data:JSON.stringify(message),options:{ttl:3600,urgency:"normal"}},sub,{subject:VAPID_SUBJECT,publicKey:VAPID_PUBLIC_KEY,privateKey:env.VAPID_PRIVATE_KEY});
 const response=await fetch(sub.endpoint,payload);
 if(response.status===404||response.status===410) {
  await env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint=?").bind(sub.endpoint).run();
  return {sent:false,status:response.status};
 }
 return {sent:response.ok,status:response.status};
}
async function sendOnce(env,row,key,message){
 const old=await env.DB.prepare("SELECT 1 FROM push_deliveries WHERE endpoint=? AND delivery_key=?").bind(row.endpoint,key).first();
 if(old)return false;
 const sent=await sendPush(env,JSON.parse(row.subscription_json),message);
 if(sent.sent) await env.DB.prepare("INSERT OR IGNORE INTO push_deliveries (endpoint,delivery_key,delivered_at) VALUES (?,?,?)").bind(row.endpoint,key,new Date().toISOString()).run();
 return sent.sent;
}
async function api(request,env){
 const url=new URL(request.url);
 if(!allowed(request))return json({error:"ORIGIN_NOT_ALLOWED"},403);
 if(request.method==="GET"&&url.pathname==="/api/push/config")return json({
  publicKey:VAPID_PUBLIC_KEY,ready:configured(env),hasDatabase:Boolean(env.DB),hasVapidSecret:Boolean(env.VAPID_PRIVATE_KEY)
 });
 if(request.method==="POST"&&url.pathname==="/api/push/subscribe"){
  if(!env.DB)return json({error:"D1_DATABASE_NOT_CONFIGURED"},503);
  const b=await bodyJson(request);
  if(!validSub(b.subscription))return json({error:"INVALID_PUSH_SUBSCRIPTION"},400);
  const p=b.preferences||{},match=String(p.motivationTime||"08:30").match(/^(\d{2}):(\d{2})$/);
  if(!match||Number(match[1])>23||Number(match[2])>59)return json({error:"INVALID_MOTIVATION_TIME"},400);
  const now=new Date().toISOString(),endpoint=b.subscription.endpoint;
  await env.DB.prepare(`
   INSERT INTO push_subscriptions (endpoint,subscription_json,meals_enabled,photos_enabled,motivation_enabled,motivation_hour,motivation_minute,timezone,created_at,updated_at)
   VALUES (?,?,?,?,?,?,?,'America/Bogota',?,?)
   ON CONFLICT(endpoint) DO UPDATE SET subscription_json=excluded.subscription_json,meals_enabled=excluded.meals_enabled,
   photos_enabled=excluded.photos_enabled,motivation_enabled=excluded.motivation_enabled,motivation_hour=excluded.motivation_hour,
   motivation_minute=excluded.motivation_minute,updated_at=excluded.updated_at
  `).bind(endpoint,JSON.stringify(b.subscription),p.mealsEnabled===false?0:1,p.photosEnabled===false?0:1,p.motivationEnabled===false?0:1,Number(match[1]),Number(match[2]),now,now).run();
  let testSent=false;
  if(env.VAPID_PRIVATE_KEY){try{testSent=(await sendPush(env,b.subscription,{title:"¡NutriPlan está activado! 🌿",body:"Recibirás aquí tus recordatorios personales de comidas y bienestar.",url:"/",tag:"nutriplan-activation",kind:"activation"})).sent;}catch(e){console.error("Activation push failed",e);}}
  return json({ok:true,ready:Boolean(env.VAPID_PRIVATE_KEY),testSent});
 }
 if(request.method==="POST"&&url.pathname==="/api/push/unsubscribe"){
  if(!env.DB)return json({error:"D1_DATABASE_NOT_CONFIGURED"},503);
  const b=await bodyJson(request);
  if(typeof b.endpoint!=="string"||!b.endpoint.startsWith("https://"))return json({error:"INVALID_ENDPOINT"},400);
  await env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint=?").bind(b.endpoint).run();return json({ok:true});
 }
 if(request.method==="POST"&&url.pathname==="/api/push/test"){
  if(!configured(env))return json({error:"PUSH_SERVER_NOT_CONFIGURED"},503);
  const b=await bodyJson(request),row=await env.DB.prepare("SELECT endpoint,subscription_json FROM push_subscriptions WHERE endpoint=?").bind(b.endpoint||"").first();
  if(!row)return json({error:"SUBSCRIPTION_NOT_FOUND"},404);
  const r=await sendPush(env,JSON.parse(row.subscription_json),{title:"Prueba de notificaciones 🌱",body:"¡Todo listo! NutriPlan puede enviarte avisos a este dispositivo.",url:"/",tag:"nutriplan-test",kind:"test"});
  return json({sent:r.sent,status:r.status||null});
 }
 if(request.method==="POST"&&url.pathname==="/api/meal/preapproved"){
  if(!env.DB)return json({error:"D1_DATABASE_NOT_CONFIGURED"},503);
  const b=await bodyJson(request);
  if(typeof b.endpoint!=="string"||!MEAL_KEYS.includes(b.mealKey)||!/^\d{4}-\d{2}-\d{2}$/.test(b.date||""))return json({error:"INVALID_MEAL_PLAN"},400);
  const owner=await env.DB.prepare("SELECT 1 FROM push_subscriptions WHERE endpoint=?").bind(b.endpoint).first();
  if(!owner)return json({error:"PUSH_SUBSCRIPTION_NOT_FOUND"},404);
  await env.DB.prepare(`INSERT INTO meal_plans(endpoint,local_date,meal_key,title,protein,carbohydrate,updated_at) VALUES(?,?,?,?,?,?,?)
   ON CONFLICT(endpoint,local_date,meal_key) DO UPDATE SET title=excluded.title,protein=excluded.protein,carbohydrate=excluded.carbohydrate,updated_at=excluded.updated_at`)
   .bind(b.endpoint,b.date,b.mealKey,String(b.title||"").slice(0,120),String(b.protein||"").slice(0,250),String(b.carbohydrate||"").slice(0,120),b.updatedAt||new Date().toISOString()).run();
  return json({ok:true});
 }
 if(request.method==="POST"&&url.pathname==="/api/meal/photo-completed"){
  if(!env.DB)return json({error:"D1_DATABASE_NOT_CONFIGURED"},503);
  const b=await bodyJson(request);
  if(typeof b.endpoint!=="string"||!MEAL_KEYS.includes(b.mealKey)||!/^\d{4}-\d{2}-\d{2}$/.test(b.date||""))return json({error:"INVALID_MEAL_PHOTO_STATUS"},400);
  const owner=await env.DB.prepare("SELECT 1 FROM push_subscriptions WHERE endpoint=?").bind(b.endpoint).first();
  if(!owner)return json({error:"PUSH_SUBSCRIPTION_NOT_FOUND"},404);
  await env.DB.prepare(`INSERT INTO meal_photo_logs(endpoint,local_date,meal_key,title,protein,carbohydrate,completed_at) VALUES(?,?,?,?,?,?,?)
   ON CONFLICT(endpoint,local_date,meal_key) DO UPDATE SET title=excluded.title,protein=excluded.protein,carbohydrate=excluded.carbohydrate,completed_at=excluded.completed_at`)
   .bind(b.endpoint,b.date,b.mealKey,String(b.title||"").slice(0,120),String(b.protein||"").slice(0,250),String(b.carbohydrate||"").slice(0,120),b.completedAt||new Date().toISOString()).run();
  return json({ok:true});
 }
 return json({error:"NOT_FOUND"},404);
}
async function runCron(env,time){
 if(!configured(env)){console.log("Push cron skipped: D1 or VAPID secret missing.");return;}
 const now=bogota(time),rows=await env.DB.prepare("SELECT * FROM push_subscriptions").all();
 for(const row of rows.results||[]){
  try{
   if(row.meals_enabled){
    const meal=MEALS.find(m=>m.hour===now.hour&&m.minute===now.minute);
    if(meal)await sendOnce(env,row,`${now.date}:meal:${meal.key}`,{
     title:`Hora de tu ${meal.title.toLowerCase()} 🌿`,
     body:"Tu plan CEMDE te espera. Consulta tus porciones, prepara tu plato y recuerda registrar la foto.",
     url:"/",tag:`meal-${meal.key}`,kind:"meal",mealKey:meal.key
    });
   }
   if(row.motivation_enabled&&row.motivation_hour===now.hour&&row.motivation_minute===now.minute){
    await sendOnce(env,row,`${now.date}:motivation`,{title:"Un mensaje para ti ❤️",body:dailyMessage(now.date),url:"/",tag:"daily-motivation",kind:"motivation"});
   }
   if(row.photos_enabled&&now.hour===20&&now.minute===30){
    const plans=await env.DB.prepare("SELECT meal_key,title FROM meal_plans WHERE endpoint=? AND local_date=?").bind(row.endpoint,now.date).all();
    const photos=await env.DB.prepare("SELECT meal_key FROM meal_photo_logs WHERE endpoint=? AND local_date=?").bind(row.endpoint,now.date).all();
    const done=new Set((photos.results||[]).map(x=>x.meal_key));
    const pending=(plans.results||[]).filter(x=>!done.has(x.meal_key));
    if(pending.length){
     const titles=pending.map(x=>x.title||x.meal_key).join(", ");
     await sendOnce(env,row,`${now.date}:photo-digest`,{
      title:"Te queda un registro pendiente 📸",
      body:`Cuando tengas un momento, sube la foto de: ${titles}. Tu registro te ayuda a llevar seguimiento.`,
      url:"/",tag:"photo-reminder-daily",kind:"photo-reminder"
     });
    }
   }
  }catch(error){console.error("Push cron failed:",error);}
 }
}
export default {
 async fetch(request,env){
  if(new URL(request.url).pathname.startsWith("/api/")){
   try{return await api(request,env);}catch(error){
    console.error("Push API error:",error);const big=error?.message==="REQUEST_TOO_LARGE";
    return json({error:big?"REQUEST_TOO_LARGE":"INTERNAL_SERVER_ERROR"},big?413:500);
   }
  }
  return env.ASSETS.fetch(request);
 },
 async scheduled(controller,env){await runCron(env,controller.scheduledTime);}
};
