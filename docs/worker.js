import {pipeline,env} from './vendor/transformers.min.js';
env.allowLocalModels=false; env.useBrowserCache=true;
env.backends.onnx.wasm.wasmPaths=new URL('./vendor/',self.location).href;
env.backends.onnx.wasm.numThreads=1;
let asr;
const MODEL='Xenova/whisper-base';
async function load(){ if(!asr) asr=await pipeline('automatic-speech-recognition',MODEL,{dtype:'q8',device:'wasm',progress_callback:p=>postMessage({type:'progress',p})}); return asr;}
onmessage=async e=>{
  try{
    if(e.data.type==='load'){await load();postMessage({type:'ready'});return;}
    const a=await load();
    const out=await a(e.data.audio,{language:'chinese',task:'transcribe',chunk_length_s:30,stride_length_s:5});
    postMessage({type:'result',text:out.text,id:e.data.id});
  }catch(err){postMessage({type:'error',msg:String(err),id:e.data.id});}
};
