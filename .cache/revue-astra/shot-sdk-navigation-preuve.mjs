// Reproduction légère : événements synthétiques, classes réelles du SDK.
// Aucun navigateur lancé et aucune écriture dans le SDK ou dans un projet.
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const path = require('node:path');
const sdk = 'C:/Users/owner/Desktop/Youtube/music/Brambleshire/Théatre/06_Remotion/node_modules/@remotion/renderer/dist';
const {EventEmitter} = require(path.join(sdk,'browser/EventEmitter.js'));
const {NetworkManager} = require(path.join(sdk,'browser/NetworkManager.js'));
const {LifecycleWatcher} = require(path.join(sdk,'browser/LifecycleWatcher.js'));
const {FrameManagerEmittedEvents} = require(path.join(sdk,'browser/FrameManager.js'));
const {gotoPageOrThrow} = require(path.join(sdk,'goto-page-or-throw.js'));
async function scenario(extraInfoAvantFin) {
 const client = new EventEmitter();
 const manager = new EventEmitter();
 const frame = {_lifecycleEvents:new Set(), childFrames:()=>[], _hasStartedLoading:true};
 manager._client=client; manager.frame=id=>id==='f' ? frame : null;
 const network = new NetworkManager(client,manager,false,'error');
 manager.networkManager=()=>network;
 const watcher=new LifecycleWatcher(manager,frame,'load',1000);
 const page={goto:async()=>{await watcher.newDocumentNavigationPromise(); watcher.dispose(); return watcher.navigationResponse();}};
 const result=gotoPageOrThrow(page,'http://127.0.0.1:4240/index.html',1000);
 client.emit('Network.requestWillBeSent',{requestId:'r',loaderId:'r',frameId:'f',type:'Document',request:{url:'http://127.0.0.1:4240/index.html'}});
 client.emit('Network.responseReceived',{requestId:'r',hasExtraInfo:true,response:{status:200}});
 if(extraInfoAvantFin) client.emit('Network.responseReceivedExtraInfo',{requestId:'r',statusCode:200});
 manager.emit(FrameManagerEmittedEvents.FrameNavigated,frame);
 frame._lifecycleEvents.add('load');
 manager.emit(FrameManagerEmittedEvents.LifecycleEvent,frame);
 const [response,error]=await result;
 const statutAvant=response?.status() ?? null;
 if(!extraInfoAvantFin) client.emit('Network.responseReceivedExtraInfo',{requestId:'r',statusCode:200});
 const statutApres=watcher.navigationResponse()?.status() ?? null;
 return {extraInfoAvantFin,statutAvant,erreur:error?.message??null,statutApres};
}
(async()=>{
 const etats=await Promise.all(Array.from({length:30},(_,i)=>4170+i).map(async port=>{
  try { const reponse=await fetch('http://127.0.0.1:'+port+'/api/status',{signal:AbortSignal.timeout(600)}); if(!reponse.ok)return null; const s=await reponse.json(); return ['render','export','shot'].filter(k=>s[k]?.state==='running').map(k=>({port,type:k})); }catch{return null;}
 }));
 const actifs=etats.flat().filter(Boolean); if(actifs.length){console.log(JSON.stringify({testNonLance:true,actifs}));return;}
 console.log(JSON.stringify({preuve:'séquence synthétique, classes réelles du SDK 4.0.535, aucun navigateur',resultats:[await scenario(false),await scenario(true)]},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
