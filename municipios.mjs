export default async function handler(request){
 const uf=(new URL(request.url).searchParams.get('uf')||'').toUpperCase();
 if(!/^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$/.test(uf))return new Response(JSON.stringify({error:'UF inválida'}),{status:400,headers:{'content-type':'application/json'}});
 try{
  const r=await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios?orderBy=nome`,{signal:AbortSignal.timeout(12000)});
  if(!r.ok)throw Error('IBGE indisponível');
  return new Response(await r.text(),{headers:{'content-type':'application/json; charset=utf-8','cache-control':'public, max-age=86400'}});
 }catch(e){return new Response(JSON.stringify({error:e.message}),{status:502,headers:{'content-type':'application/json'}})}
}
