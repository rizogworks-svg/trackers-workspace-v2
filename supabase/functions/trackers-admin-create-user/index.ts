import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
};
const allowedRoles=new Set(["superadmin","admin","project_manager","regional_pic","viewer"]);

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
  try{
    const authHeader=req.headers.get("Authorization")||"";
    if(!authHeader.startsWith("Bearer ")) throw new Error("Unauthorized");
    const token=authHeader.slice(7);
    const url=Deno.env.get("SUPABASE_URL")!;
    const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data:userData,error:userErr}=await admin.auth.getUser(token);
    if(userErr||!userData.user) throw new Error("Unauthorized");
    const {data:caller}=await admin.from("profiles").select("role,access_enabled").eq("user_id",userData.user.id).maybeSingle();
    if(!caller||caller.access_enabled===false||!["superadmin","owner"].includes(caller.role)) throw new Error("Forbidden");
    const body=await req.json();
    const email=String(body.email||"").trim().toLowerCase();
    const full_name=String(body.full_name||"").trim();
    const role=String(body.role||"viewer");
    const access_enabled=body.access_enabled!==false;
    if(!email||!email.includes("@")) throw new Error("Email tidak valid");
    if(!allowedRoles.has(role)) throw new Error("Role tidak valid");
    const redirectBase=req.headers.get("origin")||undefined;
    const {data:invite,error:inviteErr}=await admin.auth.admin.inviteUserByEmail(email,{
      data:{full_name},
      redirectTo:redirectBase ? `${redirectBase}/` : undefined
    });
    if(inviteErr) throw inviteErr;
    const uid=invite.user?.id;
    if(!uid) throw new Error("User ID tidak tersedia");
    const {error:profileErr}=await admin.from("profiles").upsert({user_id:uid,email,full_name,role,access_enabled,updated_at:new Date().toISOString()},{onConflict:"user_id"});
    if(profileErr) throw profileErr;
    return new Response(JSON.stringify({ok:true,user_id:uid,email}),{status:200,headers:{...cors,"Content-Type":"application/json"}});
  }catch(err){
    const message=err instanceof Error?err.message:String(err);
    const status=message==="Unauthorized"?401:message==="Forbidden"?403:400;
    return new Response(JSON.stringify({error:message}),{status,headers:{...cors,"Content-Type":"application/json"}});
  }
});
