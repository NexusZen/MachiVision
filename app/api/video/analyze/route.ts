export const runtime='nodejs';
export const maxDuration=300;
export async function POST(request:Request){
 if(Number(request.headers.get('content-length')||0)>101*1024*1024)return Response.json({error:'Maximum upload size is 100 MB.'},{status:413});
 try{const data=await request.formData(),file=data.get('file');
 if(!(file instanceof File)||file.size>100*1024*1024)return Response.json({error:'Choose an MP4 or WebM up to 100 MB.'},{status:400});
 const response=await fetch(`${process.env.ANALYSIS_API||'http://127.0.0.1:8000'}/api/video/analyze`,{method:'POST',body:data,signal:AbortSignal.timeout(300000)});
 return new Response(response.body,{status:response.status,headers:{'Content-Type':'application/json'}});
 }catch{return Response.json({error:'Video analysis is unavailable. Start both services with npm run dev:all, then retry.'},{status:503});}
}
