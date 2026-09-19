import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import ModerationPage from "./ModerationPage";
import SupportPage from "./SupportPage";

type Role="owner"|"admin"|"moderator";
type Section="dashboard"|"games"|"cosmetics"|"objectives"|"moderation"|"support"|"staff"|"audit";
type Access={allowed:boolean;role:Role|null};
type Game={id:number;slug:string;name:string;is_active:boolean|null;description:string|null;logo_url:string|null;cover_url:string|null;banner_url:string|null;crossplay_enabled:boolean;genre:string|null;sort_order:number};
type Platform={id:number;name:string};
type Cosmetic={id:string;slug:string;name:string;cosmetic_type:string;rarity:string;unlock_method:string;unlock_label:string|null;price_eur_cents:number|null;style:Record<string,unknown>;is_active:boolean};
type Objective={id:string;key:string;title:string;description:string;target_value:number;reward_cosmetic_id:string|null;sort_order:number;is_active:boolean};
type Staff={user_id:string;role:Role;is_active:boolean;created_at:string};
type Audit={id:number;actor_id:string;action:string;entity_type:string;entity_id:string|null;created_at:string};

const NAV:[Section,string,string][]=[
 ["dashboard","Tableau de bord","Vue d’ensemble"],["games","Jeux","Catalogue"],
 ["cosmetics","Cosmétiques","Profil & boutique"],["objectives","Objectifs","Récompenses"],
 ["moderation","Modération","Équipe & salons"],["support","Support","Tickets & signalements"],["staff","Équipe admin","Admins & modos"],["audit","Journal","Historique"]
];

export default function App(){
 const [session,setSession]=useState<Session|null>(null);
 const [access,setAccess]=useState<Access|null>(null);
 const [section,setSection]=useState<Section>("dashboard");
 const [checking,setChecking]=useState(true);

 useEffect(()=>{
  void supabase.auth.getSession().then(({data})=>setSession(data.session));
  const {data}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s));
  return()=>data.subscription.unsubscribe();
 },[]);

 useEffect(()=>{
  if(!session){setAccess(null);setChecking(false);return}
  setChecking(true);
  void supabase.rpc("get_my_admin_access").then(({data,error})=>{
   setAccess(error?{allowed:false,role:null}:data as Access);setChecking(false);
  });
 },[session]);

 useEffect(()=>{
  if(!session||!access?.allowed)return;
  let stopped=false;

  const heartbeat=async()=>{
   if(stopped)return;
   await supabase.rpc("set_my_admin_presence",{p_status:"online"});
  };

  void heartbeat();
  const timer=window.setInterval(()=>void heartbeat(),30000);

  const onVisibility=()=>{
   if(document.visibilityState==="visible") void heartbeat();
  };
  document.addEventListener("visibilitychange",onVisibility);

  return()=>{
   stopped=true;
   window.clearInterval(timer);
   document.removeEventListener("visibilitychange",onVisibility);
   void supabase.rpc("set_my_admin_presence",{p_status:"offline"});
  };
 },[session?.user.id,access?.allowed]);

 if(!session)return <Login/>;
 if(checking)return <Center title="Vérification des droits..." text="Connexion au panneau GameMate."/>;
 if(!access?.allowed||!access.role)return <Center title="Accès refusé" text="Ce compte n’a aucun rôle administrateur actif." action={<button className="danger" onClick={()=>void supabase.auth.signOut()}>Se déconnecter</button>}/>;

 return <div className="shell">
  <aside className="side">
   <div className="brand"><b>GM</b><div><strong>GameMate</strong><span>Administration</span></div></div>
   <nav>{NAV.map(([id,label,sub])=>{
    if(id==="staff"&&access.role!=="owner")return null;
    return <button key={id} className={section===id?"active":""} onClick={()=>setSection(id)}><strong>{label}</strong><small>{sub}</small></button>
   })}</nav>
   <div className="account"><span>{access.role}</span><strong>{session.user.email}</strong><button onClick={()=>void supabase.auth.signOut()}>Déconnexion</button></div>
  </aside>
  <main className="content">
   {section==="dashboard"&&<Dashboard role={access.role}/>}
   {section==="games"&&<Games canEdit={access.role!=="moderator"}/>}
   {section==="cosmetics"&&<Cosmetics canEdit={access.role!=="moderator"}/>}
   {section==="objectives"&&<Objectives canEdit={access.role!=="moderator"}/>}
   {section==="moderation"&&<ModerationPage session={session} role={access.role}/>} 
   {section==="support"&&<SupportPage session={session} role={access.role}/>}
   {section==="staff"&&access.role==="owner"&&<StaffPage/>}
   {section==="audit"&&<AuditPage/>}
  </main>
 </div>
}

function Login(){
 const [email,setEmail]=useState("");const [password,setPassword]=useState("");const [error,setError]=useState("");const [busy,setBusy]=useState(false);
 async function go(){setBusy(true);setError("");const {error}=await supabase.auth.signInWithPassword({email,password});if(error)setError(error.message);setBusy(false)}
 return <div className="auth"><div className="authCard"><span className="eyebrow">GAMEMATE SECURE</span><h1>Administration</h1><p>Connexion réservée aux comptes autorisés.</p>
  <label>Email<input value={email} onChange={e=>setEmail(e.target.value)}/></label>
  <label>Mot de passe<input type="password" value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")void go()}}/></label>
  {error&&<div className="error">{error}</div>}<button className="primary" disabled={busy||!email||!password} onClick={()=>void go()}>{busy?"Connexion...":"Se connecter"}</button>
  <small>Même avec le bon mot de passe, Supabase refuse l’accès si ce compte n’est pas dans admin_users.</small>
 </div></div>
}

function Dashboard({role}:{role:Role}){
 const [counts,setCounts]=useState({games:0,cosmetics:0,objectives:0});
 useEffect(()=>{void Promise.all([
  supabase.from("games").select("*",{count:"exact",head:true}),
  supabase.from("profile_cosmetics").select("*",{count:"exact",head:true}),
  supabase.from("profile_objectives").select("*",{count:"exact",head:true})
 ]).then(([g,c,o])=>setCounts({games:g.count??0,cosmetics:c.count??0,objectives:o.count??0}))},[]);
 return <Page title="Tableau de bord" subtitle="Administration centrale de GameMate.">
  <div className="stats"><Stat label="Jeux" value={counts.games}/><Stat label="Cosmétiques" value={counts.cosmetics}/><Stat label="Objectifs" value={counts.objectives}/><Stat label="Rôle" value={role.toUpperCase()}/></div>
  <section className="panel"><span className="eyebrow">SÉCURITÉ</span><h2>Permissions serveur</h2><p>Les écritures sensibles passent par des RPC sécurisées. Aucun simple bouton caché ne donne des privilèges.</p></section>
  <section className="panel"><span className="eyebrow">PRÉVU POUR GAMEMATE</span><div className="cards"><Info t="Jeux" x="Covers, logos, bannières, plateformes, rangs, rôles et crossplay."/><Info t="Cosmétiques" x="Cadres, bannières, rareté, prix et activation."/><Info t="Objectifs" x="Récompenses liées aux cosmétiques."/><Info t="Modération" x="Le rôle modérateur existe déjà. Les outils de sanction viendront ensuite."/><Info t="Communautés" x="Préparées comme système plus gros que les Teams, avec premium plus tard."/><Info t="Boutique" x="Catalogue prêt, mais aucun faux paiement n’est activé."/></div></section>
 </Page>
}

function Games({canEdit}:{canEdit:boolean}){
 const [games,setGames]=useState<Game[]>([]),[platforms,setPlatforms]=useState<Platform[]>([]),[selected,setSelected]=useState<number|"new"|null>(null),[tick,setTick]=useState(0);
 useEffect(()=>{void Promise.all([
  supabase.from("games").select("id,slug,name,is_active,description,logo_url,cover_url,banner_url,crossplay_enabled,genre,sort_order").order("sort_order").order("name"),
  supabase.from("platforms").select("id,name").order("name")
 ]).then(([g,p])=>{setGames((g.data??[]) as Game[]);setPlatforms((p.data??[]) as Platform[])})},[tick]);
 const game=selected==="new"?null:games.find(g=>g.id===selected)??null;
 return <Page title="Jeux" subtitle="Le catalogue utilisé par le Companion."><div className="split">
  <section className="panel list"><div className="panelHead"><div><span className="eyebrow">CATALOGUE</span><h2>{games.length} jeux</h2></div>{canEdit&&<button className="primary small" onClick={()=>setSelected("new")}>+ Ajouter</button>}</div>
   {games.map(g=><button key={g.id} className={selected===g.id?"active":""} onClick={()=>setSelected(g.id)}><Thumb url={g.logo_url||g.cover_url} text={g.name}/><div><strong>{g.name}</strong><small>{g.genre||"Genre non défini"} · {g.is_active?"Publié":"Masqué"}</small></div></button>)}
  </section>
  <section className="panel">{selected===null?<Empty title="Sélectionne un jeu" text="Tu pourras modifier toutes ses informations ici."/>:<GameEditor key={String(selected)} game={game} platforms={platforms} canEdit={canEdit} done={id=>{setSelected(id);setTick(v=>v+1)}}/>}</section>
 </div></Page>
}

function GameEditor({game,platforms,canEdit,done}:{game:Game|null;platforms:Platform[];canEdit:boolean;done:(id:number)=>void}){
 const [f,setF]=useState({name:game?.name??"",slug:game?.slug??"",description:game?.description??"",logo_url:game?.logo_url??"",cover_url:game?.cover_url??"",banner_url:game?.banner_url??"",crossplay_enabled:game?.crossplay_enabled??false,genre:game?.genre??"",sort_order:game?.sort_order??0,is_active:game?.is_active??true});
 const [plats,setPlats]=useState<number[]>([]),[ranks,setRanks]=useState(""),[roles,setRoles]=useState(""),[msg,setMsg]=useState(""),[busy,setBusy]=useState(false);
 useEffect(()=>{if(!game)return;void Promise.all([
  supabase.from("game_platforms").select("platform_id").eq("game_id",game.id),
  supabase.from("game_ranks").select("name").eq("game_id",game.id).order("sort_order"),
  supabase.from("game_roles").select("name").eq("game_id",game.id).order("sort_order")
 ]).then(([p,r,ro])=>{setPlats((p.data??[]).map((x:any)=>Number(x.platform_id)));setRanks((r.data??[]).map((x:any)=>x.name).join("\n"));setRoles((ro.data??[]).map((x:any)=>x.name).join("\n"))})},[game?.id]);
 async function upload(kind:"logo"|"cover"|"banner",file:File){setBusy(true);const ext=file.name.split(".").pop()||"webp";const path=`games/${game?.id??"new"}/${kind}-${Date.now()}.${ext}`;const {error}=await supabase.storage.from("admin-media").upload(path,file,{upsert:true,contentType:file.type});if(error)setMsg(error.message);else{const {data}=supabase.storage.from("admin-media").getPublicUrl(path);setF(v=>({...v,[`${kind}_url`]:data.publicUrl}));setMsg("Image envoyée. Enregistre le jeu.")}setBusy(false)}
 async function save(){setBusy(true);setMsg("");const {data,error}=await supabase.rpc("admin_upsert_game",{p_id:game?.id??null,p_name:f.name,p_slug:f.slug,p_description:f.description,p_logo_url:f.logo_url,p_cover_url:f.cover_url,p_banner_url:f.banner_url,p_crossplay_enabled:f.crossplay_enabled,p_genre:f.genre,p_sort_order:Number(f.sort_order),p_is_active:f.is_active});if(error){setMsg(error.message);setBusy(false);return}const id=Number(data);const ops=await Promise.all([
  supabase.rpc("admin_set_game_platforms",{p_game_id:id,p_platform_ids:plats}),
  supabase.rpc("admin_replace_game_ranks",{p_game_id:id,p_names:ranks.split("\n").map(x=>x.trim()).filter(Boolean)}),
  supabase.rpc("admin_replace_game_roles",{p_game_id:id,p_names:roles.split("\n").map(x=>x.trim()).filter(Boolean)})
 ]);const fail=ops.find(x=>x.error);if(fail?.error)setMsg(fail.error.message);else{setMsg("Jeu enregistré.");done(id)}setBusy(false)}
 return <div className="editor"><div className="panelHead"><div><span className="eyebrow">{game?"MODIFIER":"NOUVEAU JEU"}</span><h2>{game?.name??"Ajouter un jeu"}</h2></div>{!canEdit&&<span className="readonly">Lecture seule</span>}</div>
  <div className="media"><Upload title="Logo" url={f.logo_url} disabled={!canEdit||busy} file={x=>void upload("logo",x)}/><Upload title="Cover" url={f.cover_url} disabled={!canEdit||busy} file={x=>void upload("cover",x)}/><Upload title="Bannière" url={f.banner_url} disabled={!canEdit||busy} file={x=>void upload("banner",x)}/></div>
  <div className="grid2"><Field l="Nom"><input disabled={!canEdit} value={f.name} onChange={e=>setF({...f,name:e.target.value})}/></Field><Field l="Slug"><input disabled={!canEdit} value={f.slug} onChange={e=>setF({...f,slug:e.target.value})}/></Field><Field l="Genre"><input disabled={!canEdit} value={f.genre} onChange={e=>setF({...f,genre:e.target.value})}/></Field><Field l="Ordre"><input disabled={!canEdit} type="number" value={f.sort_order} onChange={e=>setF({...f,sort_order:Number(e.target.value)})}/></Field></div>
  <Field l="Description"><textarea disabled={!canEdit} rows={4} value={f.description} onChange={e=>setF({...f,description:e.target.value})}/></Field>
  <div className="switches"><Switch label="Publié" v={f.is_active} disabled={!canEdit} set={v=>setF({...f,is_active:v})}/><Switch label="Crossplay" v={f.crossplay_enabled} disabled={!canEdit} set={v=>setF({...f,crossplay_enabled:v})}/></div>
  <Field l="Plateformes"><div className="chips">{platforms.map(p=><button disabled={!canEdit} className={plats.includes(p.id)?"active":""} key={p.id} onClick={()=>setPlats(v=>v.includes(p.id)?v.filter(x=>x!==p.id):[...v,p.id])}>{p.name}</button>)}</div></Field>
  <div className="grid2"><Field l="Rangs — un par ligne"><textarea disabled={!canEdit} rows={8} value={ranks} onChange={e=>setRanks(e.target.value)}/></Field><Field l="Rôles — un par ligne"><textarea disabled={!canEdit} rows={8} value={roles} onChange={e=>setRoles(e.target.value)}/></Field></div>
  {msg&&<div className="message">{msg}</div>}{canEdit&&<button className="primary" disabled={busy||!f.name.trim()||!f.slug.trim()} onClick={()=>void save()}>{busy?"Enregistrement...":"Enregistrer le jeu"}</button>}
 </div>
}

function Cosmetics({canEdit}:{canEdit:boolean}){
 const [items,setItems]=useState<Cosmetic[]>([]),[selected,setSelected]=useState<string|"new"|null>(null),[tick,setTick]=useState(0);
 useEffect(()=>{void supabase.from("profile_cosmetics").select("*").order("created_at",{ascending:false}).then(({data})=>setItems((data??[]) as Cosmetic[]))},[tick]);
 const item=selected==="new"?null:items.find(x=>x.id===selected)??null;
 return <Page title="Cosmétiques" subtitle="Cadres, bannières et récompenses de profil."><div className="split"><section className="panel list"><div className="panelHead"><div><span className="eyebrow">CATALOGUE</span><h2>{items.length} éléments</h2></div>{canEdit&&<button className="primary small" onClick={()=>setSelected("new")}>+ Ajouter</button>}</div>{items.map(x=><button key={x.id} className={selected===x.id?"active":""} onClick={()=>setSelected(x.id)}><div className={`dot ${x.rarity}`}/><div><strong>{x.name}</strong><small>{x.cosmetic_type} · {x.rarity} · {x.is_active?"Actif":"Masqué"}</small></div></button>)}</section><section className="panel">{selected===null?<Empty title="Sélectionne un cosmétique" text="Tu pourras modifier ses propriétés ici."/>:<CosmeticEditor key={String(selected)} item={item} canEdit={canEdit} done={id=>{setSelected(id);setTick(v=>v+1)}}/>}</section></div></Page>
}

function CosmeticEditor({item,canEdit,done}:{item:Cosmetic|null;canEdit:boolean;done:(id:string)=>void}){
 const [f,setF]=useState({slug:item?.slug??"",name:item?.name??"",type:item?.cosmetic_type??"frame",rarity:item?.rarity??"common",method:item?.unlock_method??"objective",label:item?.unlock_label??"",price:item?.price_eur_cents!=null?String(item.price_eur_cents/100):"",style:JSON.stringify(item?.style??{},null,2),active:item?.is_active??true}),[msg,setMsg]=useState("");
 async function save(){let style;try{style=JSON.parse(f.style||"{}")}catch{setMsg("JSON de style invalide.");return}const {data,error}=await supabase.rpc("admin_upsert_cosmetic",{p_id:item?.id??null,p_slug:f.slug,p_name:f.name,p_cosmetic_type:f.type,p_rarity:f.rarity,p_unlock_method:f.method,p_unlock_label:f.label,p_price_eur_cents:f.price?Math.round(Number(f.price.replace(",","."))*100):null,p_style:style,p_is_active:f.active});if(error)setMsg(error.message);else{setMsg("Cosmétique enregistré.");done(String(data))}}
 return <div className="editor"><div className="grid2"><Field l="Nom"><input disabled={!canEdit} value={f.name} onChange={e=>setF({...f,name:e.target.value})}/></Field><Field l="Slug"><input disabled={!canEdit} value={f.slug} onChange={e=>setF({...f,slug:e.target.value})}/></Field><Field l="Type"><select disabled={!canEdit} value={f.type} onChange={e=>setF({...f,type:e.target.value})}><option value="frame">Cadre</option><option value="banner">Bannière</option><option value="badge">Badge</option><option value="title">Titre</option><option value="effect">Effet</option></select></Field><Field l="Rareté"><select disabled={!canEdit} value={f.rarity} onChange={e=>setF({...f,rarity:e.target.value})}><option value="common">Common</option><option value="rare">Rare</option><option value="epic">Epic</option><option value="legendary">Legendary</option></select></Field><Field l="Obtention"><select disabled={!canEdit} value={f.method} onChange={e=>setF({...f,method:e.target.value})}><option value="objective">Objectif</option><option value="purchase">Achat</option><option value="event">Événement</option><option value="admin">Admin</option></select></Field><Field l="Prix futur (€)"><input disabled={!canEdit} value={f.price} onChange={e=>setF({...f,price:e.target.value})}/></Field></div>
  <Field l="Libellé"><input disabled={!canEdit} value={f.label} onChange={e=>setF({...f,label:e.target.value})}/></Field><Field l="Style JSON"><textarea disabled={!canEdit} rows={10} value={f.style} onChange={e=>setF({...f,style:e.target.value})}/></Field><Switch label="Actif" v={f.active} disabled={!canEdit} set={v=>setF({...f,active:v})}/><p className="muted">Le prix est administrable, mais aucun paiement n’est simulé dans cette V1.</p>{msg&&<div className="message">{msg}</div>}{canEdit&&<button className="primary" onClick={()=>void save()}>Enregistrer</button>}
 </div>
}

function Objectives({canEdit}:{canEdit:boolean}){
 const [items,setItems]=useState<Objective[]>([]),[cos,setCos]=useState<Cosmetic[]>([]),[selected,setSelected]=useState<string|"new"|null>(null),[tick,setTick]=useState(0);
 useEffect(()=>{void Promise.all([supabase.from("profile_objectives").select("*").order("sort_order"),supabase.from("profile_cosmetics").select("*").order("name")]).then(([o,c])=>{setItems((o.data??[]) as Objective[]);setCos((c.data??[]) as Cosmetic[])})},[tick]);
 const item=selected==="new"?null:items.find(x=>x.id===selected)??null;
 return <Page title="Objectifs" subtitle="Configure les récompenses et leurs conditions."><div className="split"><section className="panel list"><div className="panelHead"><div><span className="eyebrow">OBJECTIFS</span><h2>{items.length} règles</h2></div>{canEdit&&<button className="primary small" onClick={()=>setSelected("new")}>+ Ajouter</button>}</div>{items.map(x=><button key={x.id} className={selected===x.id?"active":""} onClick={()=>setSelected(x.id)}><div className="objective">{x.target_value}</div><div><strong>{x.title}</strong><small>{x.key} · {x.is_active?"Actif":"Masqué"}</small></div></button>)}</section><section className="panel">{selected===null?<Empty title="Sélectionne un objectif" text="Tu pourras modifier sa récompense et sa cible."/>:<ObjectiveEditor key={String(selected)} item={item} cosmetics={cos} canEdit={canEdit} done={id=>{setSelected(id);setTick(v=>v+1)}}/>}</section></div></Page>
}

function ObjectiveEditor({item,cosmetics,canEdit,done}:{item:Objective|null;cosmetics:Cosmetic[];canEdit:boolean;done:(id:string)=>void}){
 const [f,setF]=useState({key:item?.key??"",title:item?.title??"",description:item?.description??"",target:item?.target_value??1,reward:item?.reward_cosmetic_id??"",order:item?.sort_order??0,active:item?.is_active??true}),[msg,setMsg]=useState("");
 async function save(){const {data,error}=await supabase.rpc("admin_upsert_objective",{p_id:item?.id??null,p_key:f.key,p_title:f.title,p_description:f.description,p_target_value:Number(f.target),p_reward_cosmetic_id:f.reward||null,p_sort_order:Number(f.order),p_is_active:f.active});if(error)setMsg(error.message);else{setMsg("Objectif enregistré.");done(String(data))}}
 return <div className="editor"><div className="grid2"><Field l="Clé"><input disabled={!canEdit} value={f.key} onChange={e=>setF({...f,key:e.target.value})}/></Field><Field l="Titre"><input disabled={!canEdit} value={f.title} onChange={e=>setF({...f,title:e.target.value})}/></Field><Field l="Valeur cible"><input disabled={!canEdit} type="number" min={1} value={f.target} onChange={e=>setF({...f,target:Number(e.target.value)})}/></Field><Field l="Ordre"><input disabled={!canEdit} type="number" value={f.order} onChange={e=>setF({...f,order:Number(e.target.value)})}/></Field></div><Field l="Description"><textarea disabled={!canEdit} rows={5} value={f.description} onChange={e=>setF({...f,description:e.target.value})}/></Field><Field l="Récompense cosmétique"><select disabled={!canEdit} value={f.reward} onChange={e=>setF({...f,reward:e.target.value})}><option value="">Aucune</option>{cosmetics.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></Field><Switch label="Actif" v={f.active} disabled={!canEdit} set={v=>setF({...f,active:v})}/>{msg&&<div className="message">{msg}</div>}{canEdit&&<button className="primary" onClick={()=>void save()}>Enregistrer</button>}</div>
}

function StaffPage(){
 const [rows,setRows]=useState<Staff[]>([]),[uid,setUid]=useState(""),[role,setRole]=useState<Role>("moderator"),[msg,setMsg]=useState("");
 async function load(){const {data}=await supabase.from("admin_users").select("user_id,role,is_active,created_at").order("created_at");setRows((data??[]) as Staff[])}
 useEffect(()=>{void load()},[]);
 async function setStaff(user_id:string,r:Role,active:boolean){const {error}=await supabase.rpc("owner_set_staff_role",{p_user_id:user_id,p_role:r,p_active:active});if(error)setMsg(error.message);else{setMsg("Rôle enregistré.");await load()}}
 return <Page title="Équipe admin" subtitle="Gestion réservée au propriétaire."><section className="panel"><span className="eyebrow">AJOUTER UN MEMBRE</span><h2>Attribuer un rôle</h2><p className="muted">Utilise l’UUID Auth de l’utilisateur.</p><div className="staffAdd"><input placeholder="UUID utilisateur" value={uid} onChange={e=>setUid(e.target.value)}/><select value={role} onChange={e=>setRole(e.target.value as Role)}><option value="moderator">Modérateur</option><option value="admin">Administrateur</option><option value="owner">Propriétaire</option></select><button className="primary" disabled={!uid.trim()} onClick={()=>void setStaff(uid.trim(),role,true)}>Enregistrer</button></div>{msg&&<div className="message">{msg}</div>}</section><section className="panel table">{rows.map(x=><div className="row" key={x.user_id}><span>{x.user_id}</span><strong>{x.role}</strong><em>{x.is_active?"Actif":"Désactivé"}</em><button onClick={()=>void setStaff(x.user_id,x.role,!x.is_active)}>{x.is_active?"Désactiver":"Activer"}</button></div>)}</section></Page>
}

function AuditPage(){
 const [rows,setRows]=useState<Audit[]>([]);
 useEffect(()=>{void supabase.from("admin_audit_log").select("id,actor_id,action,entity_type,entity_id,created_at").order("created_at",{ascending:false}).limit(200).then(({data})=>setRows((data??[]) as Audit[]))},[]);
 return <Page title="Journal" subtitle="Historique des actions administratives."><section className="panel table">{rows.map(x=><div className="row audit" key={x.id}><span>{new Date(x.created_at).toLocaleString("fr-FR")}</span><strong>{x.action}</strong><em>{x.entity_type}{x.entity_id?` · ${x.entity_id}`:""}</em><small>{x.actor_id}</small></div>)}</section></Page>
}

function Page({title,subtitle,children}:{title:string;subtitle:string;children:React.ReactNode}){return <div className="page"><header className="pageHead"><span className="eyebrow">GAMEMATE ADMIN</span><h1>{title}</h1><p>{subtitle}</p></header>{children}</div>}
function Stat({label,value}:{label:string;value:string|number}){return <div className="stat"><span>{label}</span><strong>{value}</strong></div>}
function Info({t,x}:{t:string;x:string}){return <div className="info"><strong>{t}</strong><p>{x}</p></div>}
function Field({l,children}:{l:string;children:React.ReactNode}){return <label className="field"><span>{l}</span>{children}</label>}
function Switch({label,v,set,disabled=false}:{label:string;v:boolean;set:(v:boolean)=>void;disabled?:boolean}){return <button type="button" className={`switch ${v?"active":""}`} disabled={disabled} onClick={()=>set(!v)}><span>{label}</span><i><b/></i></button>}
function Thumb({url,text}:{url:string|null;text:string}){return <div className="thumb">{url?<img src={url}/>:text.slice(0,2).toUpperCase()}</div>}
function Upload({title,url,disabled,file}:{title:string;url:string;disabled:boolean;file:(f:File)=>void}){return <label className="upload"><span>{title}</span><div>{url?<img src={url}/>:<b>Image</b>}</div><input disabled={disabled} type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>{const f=e.target.files?.[0];if(f)file(f)}}/></label>}
function Empty({title,text}:{title:string;text:string}){return <div className="empty"><strong>{title}</strong><p>{text}</p></div>}
function Center({title,text,action}:{title:string;text:string;action?:React.ReactNode}){return <div className="center"><div><h1>{title}</h1><p>{text}</p>{action}</div></div>}
