export class RequestError extends Error {constructor(public code:string,message:string){super(message);}}
export async function api<T=any>(path:string,body?:unknown,method?:'GET'|'POST'|'PUT'|'DELETE'):Promise<T>{
 try{const requestMethod=method??(body===undefined?'GET':'POST');const r=await fetch('/api'+path,{method:requestMethod,headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});if(r.status===204)return undefined as T;const json=await r.json();if(!r.ok)throw new RequestError(json.error?.code||'INTERNAL',json.error?.message||'Service error');return json;}catch(e){if(e instanceof RequestError)throw e;throw new RequestError('CONNECTION','无法连接本地服务，请检查电脑与网络');}
}
