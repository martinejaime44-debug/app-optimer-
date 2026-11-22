import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';

const $ = id => document.getElementById(id);
const MB = 1_000_000;
const els = {
  input:$('fileInput'), zone:$('dropzone'), choose:$('chooseBtn'), swap:$('swapBtn'),
  selected:$('selection'), fileName:$('fileName'), fileMeta:$('fileMeta'),
  original:$('originalSize'), note:$('sourceNote'), size:$('targetSlider'),
  sizeValue:$('targetNumber'), keep:$('keep1080'), estimate:$('estimate'),
  start:$('startBtn'), startLabel:$('startLabel'), progress:$('progressCard'),
  percent:$('progressPercent'), fill:$('progressFill'), stage:$('stage'),
  detail:$('progressDetail'), cancel:$('cancelBtn'), result:$('result'),
  resultTitle:$('resultTitle'), resultText:$('resultText'), before:$('beforeSize'),
  after:$('afterSize'), saved:$('savedSize'), download:$('downloadBtn'),
  error:$('errorBox'),
};
let selectedFile=null;
let videoMeta=null;
let currentObjectURL=null;
let downloadObjectURL=null;
let ffmpeg=null;
let busy=false;
let cancelled=false;
let mode='balanced';
let durationSeconds=0;

const prettyBytes = (bytes) => {
  if (!Number.isFinite(bytes)) return '—';
  if (bytes >= MB) return (bytes / MB).toLocaleString('es-MX',{maximumFractionDigits:1})+' MB';
  return (bytes / 1000).toLocaleString('es-MX',{maximumFractionDigits:1})+' KB';
};
const prettyTime = s => Number.isFinite(s) ? Math.floor(s/60)+':'+String(Math.floor(s%60)).padStart(2,'0') : '—';
const percent = val => Math.round(Math.max(0, Math.min(1,val))*100)+'%';
const targetMB = () => Number(els.size.value);
const setError = msg => { els.error.textContent=msg;els.error.classList.toggle('show',Boolean(msg)); };
const setProgress = (value, stage, description) => {
  if (Number.isFinite(value)) {els.percent.textContent=percent(value);els.fill.style.width=percent(value);}
  if (stage)els.stage.textContent=stage;
  if(description)els.detail.textContent=description;
};
const disposeDownload = () => { if(downloadObjectURL)URL.revokeObjectURL(downloadObjectURL);downloadObjectURL=null;els.result.classList.remove('show'); };
const setBusy = v => {
  busy=v;els.input.disabled=v;els.start.disabled=v||!selectedFile;
  els.size.disabled=v;els.keep.disabled=v;
  document.querySelectorAll('.option').forEach(btn=>btn.disabled=v);
  els.choose.disabled=v;els.swap.disabled=v;
  els.zone.setAttribute('aria-disabled',String(v));
  els.startLabel.textContent=v?'Comprimiendo video…':selectedFile?'Comprimir mi video':'Selecciona un video primero';
};
function getVideoInfo(file) {
  return new Promise((resolve,reject)=>{
    const v=document.createElement('video');v.preload='metadata';v.muted=true;
    const object=URL.createObjectURL(file);
    const timeout=setTimeout(()=>end(new Error('No se pudo leer la información de este video. Intenta un MP4 compatible.')),25000);
    function end(error,data){clearTimeout(timeout);v.removeAttribute('src');v.load();URL.revokeObjectURL(object);error?reject(error):resolve(data);}
    v.onloadedmetadata=()=>end(null,{duration:v.duration,width:v.videoWidth,height:v.videoHeight});
    v.onerror=()=>end(new Error('El navegador no reconoce este formato de video. Convierte primero a MP4 o WebM compatible.'));
    v.src=object;
  });
}
function refreshEstimate(){
  const target=targetMB();
  els.sizeValue.textContent=target;
  els.size.style.setProperty('--percent',((target-50)/450)*100+'%');
  const duration=videoMeta?.duration||300;
  const audioKbps=128;
  const bitrate=Math.max(150,Math.floor((target * MB * 8 * .95 / duration / 1000)-audioKbps));
  const resolution=videoMeta?videoMeta.width+' × '+videoMeta.height:'1080p';
  els.estimate.innerHTML='<b>Estimación:</b> '+(videoMeta?'Video de '+prettyTime(duration)+' · '+resolution+'. ':'Para un video de 5 minutos. ')+
    'Video a ~'+(bitrate/1000).toFixed(2)+' Mb/s y audio AAC de 128 kb/s. '+
    'La compresión reduce detalles en escenas complejas; no garantiza calidad idéntica.';
}
async function selectFile(file){
  if(!file||busy)return;
  setError('');disposeDownload();
  if(!file.type.startsWith('video/')&&!/\.(mp4|m4v|mov|mkv|webm|avi)$/i.test(file.name)){
    setError('Selecciona un video en MP4, MOV, MKV, WebM o AVI.');return;
  }
  if(file.size<1000){setError('El archivo parece estar vacío.');return;}
  selectedFile=file;videoMeta=null;
  els.selected.classList.add('show');els.fileName.textContent=file.name;
  els.fileMeta.textContent='Leyendo duración y resolución…';els.original.textContent=prettyBytes(file.size);
  els.note.textContent='Revisando archivo';els.start.disabled=true;refreshEstimate();
  try{
    const meta=await getVideoInfo(file);
    if(selectedFile!==file)return;
    if(!Number.isFinite(meta.duration)||meta.duration<=0||!meta.width)throw new Error('No se pudo obtener la duración o resolución del video.');
    videoMeta=meta;
    els.fileMeta.textContent=prettyTime(meta.duration)+' · '+meta.width+' × '+meta.height;
    els.note.textContent='Listo para comprimir';els.start.disabled=false;
    refreshEstimate();els.startLabel.textContent='Comprimir mi video';
  }catch(err){
    if(selectedFile!==file)return;
    els.fileMeta.textContent='Metadatos no disponibles';
    els.note.textContent='Formato no compatible';
    setError(err.message);
  }
}
els.input.addEventListener('change',()=>{selectFile(els.input.files[0]);});
els.choose.addEventListener('click',e=>{e.stopPropagation();els.input.click();});
els.swap.addEventListener('click',()=>els.input.click());
els.zone.addEventListener('click',e=>{if(!busy&&e.target!==els.choose)els.input.click();});
els.zone.addEventListener('keydown',e=>{if(!busy&&(e.key==='Enter'||e.key===' ')){e.preventDefault();els.input.click();}});
['dragenter','dragover'].forEach(event=>els.zone.addEventListener(event,e=>{e.preventDefault();if(!busy)els.zone.classList.add('drag');}));
['dragleave','drop'].forEach(event=>els.zone.addEventListener(event,e=>{e.preventDefault();els.zone.classList.remove('drag');}));
els.zone.addEventListener('drop',e=>{if(!busy&&e.dataTransfer.files[0])selectFile(e.dataTransfer.files[0]);});
els.size.addEventListener('input',refreshEstimate);
els.keep.addEventListener('change',refreshEstimate);
document.querySelectorAll('.option').forEach(btn=>btn.addEventListener('click',()=>{
  mode=btn.dataset.mode;
  document.querySelectorAll('.option').forEach(b=>b.classList.toggle('active',b===btn));
}));
function outputDimensions(){
  const {width,height}=videoMeta;
  if(els.keep.checked&&Math.max(width,height)<=1920&&Math.min(width,height)<=1080){
    return null; // preserve exact original resolution
  }
  if(els.keep.checked){
    const scale=Math.min(1,1920/Math.max(width,height),1080/Math.min(width,height));
    if(scale===1)return null;
    const newWidth=Math.max(2,Math.floor(width*scale/2)*2);
    const newHeight=Math.max(2,Math.floor(height*scale/2)*2);
    return newWidth+':'+newHeight;
  }
  // optional smaller video for better quality at low bitrates
  const scale=Math.min(1,1280/Math.max(width,height),720/Math.min(width,height));
  if(scale===1)return null;
  return Math.max(2,Math.floor(width*scale/2)*2)+':'+Math.max(2,Math.floor(height*scale/2)*2);
}
async function initFFmpeg(){
  if(ffmpeg?.loaded)return ffmpeg;
  // FFmpeg WASM core is downloaded only after the user starts compression.
  const engine=new FFmpeg();
  engine.on('progress',({progress,time})=>{
    if(!busy)return;
    // Progress is the current ffmpeg pass, not the entire process.
    const byTime=Number.isFinite(time)&&videoMeta?.duration ? (time/1_000_000)/videoMeta.duration : 0;
    const p=Number.isFinite(byTime)&&byTime>0?byTime:progress;
    setProgress(Math.min(.97, Math.max(0,p)), 'Comprimiendo video…', 'Mantén esta pestaña abierta. El procesamiento puede tardar.');
  });
  const coreURL='https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd/ffmpeg-core.js';
  const wasmURL='https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd/ffmpeg-core.wasm';
  const base='https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.15/dist/umd/814.ffmpeg.js';
  const core=await toBlobURL(coreURL,'text/javascript');
  const wasm=await toBlobURL(wasmURL,'application/wasm');
  // Worker from same origin via blob wrapper to support GitHub Pages and CDNs.
  const worker=await toBlobURL(base,'text/javascript');
  await engine.load({coreURL:core,wasmURL:wasm,classWorkerURL:worker});
  ffmpeg=engine;return engine;
}
async function runCompression(){
  if(busy||!selectedFile||!videoMeta)return;
  disposeDownload();setError('');cancelled=false;
  setBusy(true);els.progress.classList.add('show');
  setProgress(0,'Preparando compresor…','Descargando motor de compresión, si es la primera vez.');
  let engine; const original=selectedFile;
  try{
    if(!window.WebAssembly||!window.Worker)throw Error('Este navegador no admite el motor de compresión. Actualiza Chrome o Edge.');
    if(original.size>1_000_000_000)throw Error('Este compresor web puede quedarse sin memoria con archivos de más de 1 GB. Para archivos tan grandes, utiliza FFmpeg en tu computadora.');
    engine=await initFFmpeg();
    if(cancelled)return;
    setProgress(.01,'Cargando video…','Los archivos grandes requieren memoria RAM adicional.');
    const data=new Uint8Array(await original.arrayBuffer());
    if(cancelled)return;
    await engine.writeFile('input-video',data);
    const totalSeconds=videoMeta.duration;
    const selectedTarget=targetMB()*MB;
    const audioKbps=128;
    let videoKbps=Math.floor((selectedTarget*.94*8/totalSeconds/1000)-audioKbps);
    if(videoKbps<100)throw Error('El tamaño escogido es demasiado pequeño para esta duración. Sube el límite en MB.');
    // If original is already smaller than goal, avoid destructive re-encoding.
    if(original.size<=selectedTarget && /\.mp4$/i.test(original.name)){
      els.progress.classList.remove('show');
      const url=URL.createObjectURL(original);downloadObjectURL=url;
      showResult(original.size,original.size,url,'El archivo ya cumple el límite; no hace falta recomprimirlo.');
      return;
    }
    const preset={quality:'slow',balanced:'medium',fast:'veryfast'}[mode];
    const scale=outputDimensions();
    let outputBytes,outputName='video-comprimido.mp4';
    for(let attempt=0;attempt<3;attempt++){
      if(cancelled)return;
      setProgress(0,'Comprimiendo video'+(attempt?' · ajuste '+(attempt+1):'')+'…','Calidad '+mode+' · objetivo: '+targetMB()+' MB. Puede tardar varios minutos.');
      const args=['-hide_banner','-y','-i','input-video','-map','0:v:0','-map','0:a:0?','-c:v','libx264',
        '-preset',preset,'-b:v',videoKbps+'k','-maxrate',Math.ceil(videoKbps*1.15)+'k',
        '-bufsize',Math.ceil(videoKbps*2)+'k','-pix_fmt','yuv420p',
        '-c:a','aac','-b:a',audioKbps+'k','-ac','2','-movflags','+faststart'];
      if(scale)args.push('-vf','scale='+scale);
      args.push('-f','mp4','output.mp4');
      const code=await engine.exec(args);
      if(cancelled)return;
      if(code!==0)throw Error('FFmpeg no pudo procesar este video (código '+code+'). Comprueba que el archivo no esté dañado.');
      outputBytes=await engine.readFile('output.mp4');
      if(outputBytes.length<=selectedTarget||attempt===2)break;
      const ratio=selectedTarget/outputBytes.length;
      videoKbps=Math.max(100,Math.floor(videoKbps*ratio*.93));
      await engine.deleteFile('output.mp4');
    }
    if(cancelled)return;
    const blob=new Blob([outputBytes],{type:'video/mp4'});
    const url=URL.createObjectURL(blob);downloadObjectURL=url;
    const isWithin=blob.size<=selectedTarget;
    showResult(original.size,blob.size,url,isWithin?
      'MP4 optimizado. Compara la calidad con el original antes de eliminarlo.':
      'El resultado supera el límite solicitado. La tasa real varió durante la codificación; prueba un límite menor.');
    if(!isWithin)setError('El video quedó por encima de '+targetMB()+' MB. La compresión por bitrate no garantiza un tamaño exacto para todos los archivos.');
    els.progress.classList.remove('show');
    try{await engine.deleteFile('input-video');await engine.deleteFile('output.mp4');}catch{}
  }catch(err){
    if(!cancelled){
      const message=String(err?.message||err);
      setError(/memory|allocation|out of bounds/i.test(message)?
        'No hay memoria suficiente para comprimir este archivo en el navegador. Cierra pestañas, prueba con un video menor o utiliza FFmpeg para escritorio.':
        'No se pudo comprimir: '+message);
    }
    els.progress.classList.remove('show');
    if(engine){try{await engine.deleteFile('input-video');}catch{}}
  }finally{setBusy(false);}
}
function showResult(before,after,url,text){
  els.result.classList.add('show');
  els.resultTitle.textContent=after<=targetMB()*MB?'¡Tu video está listo!':'Tu video se comprimió';
  els.resultText.textContent=text;
  els.before.textContent=prettyBytes(before);
  els.after.textContent=prettyBytes(after);
  els.saved.textContent=before>after?percent((before-after)/before):'0%';
  els.download.href=url;
  els.download.download=selectedFile.name.replace(/\.[^.]+$/,'')+'-nitido.mp4';
}
els.start.addEventListener('click',runCompression);
els.cancel.addEventListener('click',()=>{
  cancelled=true;
  if(ffmpeg){ffmpeg.terminate();ffmpeg=null;}
  els.progress.classList.remove('show');
  setBusy(false);
  setError('Compresión cancelada.');
});
refreshEstimate();
