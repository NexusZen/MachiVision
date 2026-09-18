export const runtime='nodejs';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;if(!/^[a-f0-9]{32}$/.test(id))return new Response('Invalid media ID',{status:400});
 try{const headers:HeadersInit={};const range=request.headers.get('range');if(range)headers.Range=range;
 const response=await fetch(`${process.env.ANALYSIS_API||'http://127.0.0.1:8000'}/api/media/${id}`,{headers});
 const output=new Headers();for(const key of ['content-type','content-length','content-range','accept-ranges']){const value=response.headers.get(key);if(value)output.set(key,value);}output.set('Cache-Control','private, max-age=3600');
 return new Response(response.body,{status:response.status,headers:output});
 }catch{return new Response('Video service unavailable',{status:503});}
}
