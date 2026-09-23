import {spawn} from 'node:child_process';
import path from 'node:path';
const python=path.resolve(process.platform==='win32'?'.venv/Scripts/python.exe':'.venv/bin/python');
const backend=spawn(python,['-m','uvicorn','backend.main:app','--host','127.0.0.1','--port','8000'],{stdio:'inherit',windowsHide:true});
const frontend=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--hostname','127.0.0.1','-p','3000'],{stdio:'inherit',windowsHide:true});
let stopping=false;function stop(){if(stopping)return;stopping=true;backend.kill();frontend.kill();}
for(const child of [backend,frontend]){child.on('error',error=>{console.error(error.message);stop();process.exitCode=1;});child.on('exit',code=>{stop();process.exitCode=code||0;});}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
