const categories={barbearia:'service.beauty.hairdresser',cabeleireiro:'service.beauty.hairdresser',cafe:'catering.cafe',restaurant:'catering.restaurant',pizzaria:'catering.fast_food.pizza',bakery:'commercial.food_and_drink.bakery',supermarket:'commercial.supermarket',pharmacy:'healthcare.pharmacy',car_wash:'service.vehicle.car_wash',dentist:'healthcare.dentist',clinic:'healthcare.clinic_or_praxis',gym:'sport.fitness.fitness_centre',hotel:'accommodation.hotel',pet:'commercial.pet',clothes:'commercial.clothing',car_repair:'service.vehicle.repair.car'};
const states={AC:'Acre',AL:'Alagoas',AP:'Amapá',AM:'Amazonas',BA:'Bahia',CE:'Ceará',DF:'Distrito Federal',ES:'Espírito Santo',GO:'Goiás',MA:'Maranhão',MT:'Mato Grosso',MS:'Mato Grosso do Sul',MG:'Minas Gerais',PA:'Pará',PB:'Paraíba',PR:'Paraná',PE:'Pernambuco',PI:'Piauí',RJ:'Rio de Janeiro',RN:'Rio Grande do Norte',RS:'Rio Grande do Sul',RO:'Rondônia',RR:'Roraima',SC:'Santa Catarina',SP:'São Paulo',SE:'Sergipe',TO:'Tocantins'};
const clean=(s,n=200)=>String(s??'').slice(0,n);
const norm=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const json=(obj,status=200)=>new Response(JSON.stringify(obj),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
async function geo(path,params,key){
 const u=new URL('https://api.geoapify.com'+path);
 Object.entries(params).forEach(([k,v])=>u.searchParams.set(k,String(v)));
 u.searchParams.set('apiKey',key);
 const r=await fetch(u,{headers:{accept:'application/json'},signal:AbortSignal.timeout(14000)});
 if(!r.ok){const status=r.status;throw Object.assign(new Error(status===401||status===403?'Chave Geoapify inválida ou sem permissão':status===429||status===402?'Cota da Geoapify atingida':'Geoapify respondeu HTTP '+status),{status:status>=500?502:status});}
 return r.json();
}
export default async function handler(request){
 try{
  const key=process.env.GEOAPIFY_API_KEY;
  if(!key)return json({ready:false,error:'GEOAPIFY_API_KEY não configurada no Netlify'},503);
  const q=new URL(request.url).searchParams,action=q.get('action')||'health';
  if(action==='health')return json({ready:true,source:'Geoapify',message:'Function publicada; chave configurada.'});
  if(action==='probe'){
   const r=await geo('/v1/geocode/search',{text:'Queimados, Rio de Janeiro, Brasil',filter:'countrycode:br',limit:1,format:'json'},key);
   return json({verified:Array.isArray(r.results)&&r.results.length>0,source:'Geoapify'});
  }
  if(action==='details'){
   const id=q.get('placeId')||'';
   if(!/^[\w:-]{3,200}$/.test(id))return json({error:'ID de estabelecimento inválido'},400);
   const r=await geo('/v2/place-details',{id,features:'details'},key);
   const p=(r.features||[]).map(x=>x.properties||{}).find(x=>x.feature_type==='details')||r.features?.[0]?.properties||{};
   return json({website:clean(p.website||p.contact?.website||p.brand_details?.website,250),phone:clean(p.contact?.phone||p.phone,80)});
  }
  if(action!=='search')return json({error:'Ação inválida'},400);
  const state=(q.get('state')||'').toUpperCase(),city=(q.get('city')||'').trim(),segment=q.get('segment')||'',limit=Number(q.get('limit')||20);
  if(!states[state]||city.length<2||city.length>90||!categories[segment]||![20,40,60,100].includes(limit))return json({error:'Estado, município, segmento ou limite inválido'},400);
  const r=await geo('/v1/geocode/search',{text:`${city}, ${states[state]}, Brasil`,filter:'countrycode:br',limit:5,format:'json'},key);
  const candidates=r.results||[];
  const loc=candidates.find(p=>norm(p.city||p.name)===norm(city)&&(!p.state_code||p.state_code.toUpperCase()===state))
   ||candidates.find(p=>norm(p.city||p.name)===norm(city)&&norm(p.state)===norm(states[state]));
  if(!loc)return json({error:`Município ${city}/${state} não confirmado na Geoapify`},404);
  let filter;
  if(loc.place_id)filter='place:'+loc.place_id;
  else if(loc.bbox&&[loc.bbox.lon1,loc.bbox.lat1,loc.bbox.lon2,loc.bbox.lat2].every(x=>Number.isFinite(Number(x))))filter='rect:'+ [loc.bbox.lon1,loc.bbox.lat1,loc.bbox.lon2,loc.bbox.lat2].join(',');
  else return json({error:'Limites geográficos não disponíveis para a cidade'},422);
  const places=await geo('/v2/places',{categories:categories[segment],filter,limit,lang:'pt'},key);
  const seen=new Set();
  const results=(places.features||[]).map(f=>{
   const p=f.properties||{},c=f.geometry?.coordinates||[];
   const lat=Number(p.lat??c[1]),lon=Number(p.lon??c[0]);
   return {id:clean(p.place_id,170),placeId:clean(p.place_id,170),name:clean(p.name,130),address:clean(p.formatted||p.address_line2,250),city:clean(p.city||p.county||city,100),state:clean(p.state_code||state,70),phone:clean(p.contact?.phone||p.phone,80),website:clean(p.website||p.contact?.website||p.brand_details?.website,250),lat:Number.isFinite(lat)?lat:null,lon:Number.isFinite(lon)?lon:null};
  }).filter(p=>{if(!p.name)return false;const id=p.placeId||p.name+'|'+p.address;if(seen.has(id))return false;seen.add(id);return true});
  return json({source:'Geoapify / OpenStreetMap',state,city,segment,count:results.length,center:Number.isFinite(Number(loc.lat))?{lat:Number(loc.lat),lon:Number(loc.lon),city,state}:null,results});
 }catch(e){return json({error:e.name==='TimeoutError'?'Tempo limite da fonte excedido':e.message||'Falha na pesquisa'},e.status>=400&&e.status<600?e.status:502)}
}
