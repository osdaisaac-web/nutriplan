self.addEventListener("install",()=>self.skipWaiting());
self.addEventListener("activate",event=>event.waitUntil(self.clients.claim()));
self.addEventListener("push",event=>{
 let message={};
 try{message=event.data?event.data.json():{};}catch{message={title:"NutriPlan CEMDE",body:event.data?.text()||"Tienes un recordatorio pendiente."};}
 event.waitUntil(self.registration.showNotification(message.title||"NutriPlan CEMDE",{
  body:message.body||"Abre NutriPlan para consultar tu plan.",
  icon:"/icon.svg",badge:"/icon.svg",tag:message.tag||"nutriplan-notification",
  renotify:false,data:{url:message.url||"/",kind:message.kind||"general"}
 }));
});
self.addEventListener("notificationclick",event=>{
 event.notification.close();const target=new URL(event.notification.data?.url||"/",self.location.origin).href;
 event.waitUntil((async()=>{
  const clients=await self.clients.matchAll({type:"window",includeUncontrolled:true});
  for(const client of clients){if(client.url.startsWith(self.location.origin)&&"focus" in client){await client.navigate(target);return client.focus();}}
  return self.clients.openWindow(target);
 })());
});
