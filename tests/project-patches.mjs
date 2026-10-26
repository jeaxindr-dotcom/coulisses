// Tests légers des copies : aucun navigateur, aucun studio, aucun décodage de média réel.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const atelier=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const base=path.join(atelier,'.cache/revue-astra/projets-copies');
if (!fs.existsSync(path.join(base, 'lesson0', '.git')) || !fs.existsSync('C:/Users/owner/Desktop/Youtube/AItelier/remotion/node_modules/esbuild')) {
  console.log('(sauté : copies locales de validation ou dépendances du moteur absentes)\n0 ok, 0 ko'); process.exit(0);
}
const req=createRequire('C:/Users/owner/Desktop/Youtube/AItelier/remotion/package.json');
const esbuild=req('esbuild');
const results={date:new Date().toISOString(),tests:[]};
const note=(name,before,after)=>results.tests.push({test:name,avant:before,apres:after});
const source=(project,file,old=false)=>old?execFileSync('git',['show',':'+file],{cwd:path.join(base,project),encoding:'utf8'}):fs.readFileSync(path.join(base,project,file),'utf8');
const js=(s,loader='ts')=>esbuild.transformSync(s,{loader,format:'cjs',target:'es2022'}).code;
const moduleOf=(s,imports={})=>{const module={exports:{}};vm.runInNewContext(js(s),{module,exports:module.exports,require:n=>{if(!(n in imports))throw Error(n);return imports[n];},Promise,Map,Set,Error});return module.exports;};

// Le vrai corps du hook reçoit une image qui ne termine pas, puis est démonté immédiatement.
for(const project of ['lesson0','brambleshire','uchuchan']){
 const run=old=>{
  const s=source(project,'src/engine/Stage.tsx',old);
  const begin=s.indexOf('export function useEpisodeAssets('),end=s.indexOf('// Watchers Tower',begin);
  const text=s.slice(begin,end).replace('export function','function')+'\nglobalThis.hook=useEpisodeAssets;';
  const handles=new Set(),blocks=new Set();let sequence=0,effect;
  const api={delayRender:()=>{const n=++sequence;handles.add(n);return n;},continueRender:n=>handles.delete(n),cancelRender:e=>{throw e;}};
  const buffer={delayPlayback:()=>{const n=++sequence;blocks.add(n);return{unblock:()=>blocks.delete(n)};}};
  const sandbox={...api,useDelayRender:()=>api,useBufferState:()=>buffer,useRemotionEnvironment:()=>({isPlayer:false}),useMemo:f=>f(),useState:x=>[typeof x==='function'?x():x,()=>{}],useEffect:f=>{effect=f;},loadImage:()=>new Promise(()=>{}),staticFile:x=>x,console,buildCutout(){},buildLayered(){}};
  vm.runInNewContext(js(text),sandbox);sandbox.hook({sets:{a:{flats:[{url:'pending',id:'a',kind:'far'}]}},props:{},characters:{}},{});
  const cleanup=effect();cleanup();return{handles:handles.size,attentes:blocks.size};
 };
 const before=run(true),after=run(false);assert.equal(before.handles,1);assert.deepEqual(after,{handles:0,attentes:0});note(project+' : démontage pendant chargement',before,after);
}

// Le corps exact de l'effet SceneReact reste suspendu sur les polices, puis est nettoyé.
for(const old of [true,false]){
 const s=source('aitelier','src/scenes/SceneReact.tsx',old);
 const begin=s.indexOf('  useLayoutEffect(() => {',s.indexOf('// préparation :'));
 const end=s.indexOf('  // à chaque image :',begin);
 const snippet=s.slice(begin,end);const handles=new Set([1]),blocks=new Set();let cleanup;
 const api={delayRender:()=>{handles.add(2);handles.delete(1);return 2;},continueRender:n=>handles.delete(n),cancelRender:()=>{}};
 const buffer={delayPlayback:()=>{blocks.add(1);return{unblock:()=>blocks.delete(1)};}};
 const scope={...api,buffer,useLayoutEffect:f=>{cleanup=f();},racines:{current:[]},instances:{current:[]},generation:{current:0},generationPrete:{current:-1},libererPreparation:{current:null},attenteImage:{current:null},setPret(){},setErreur(){},nom:'copie',G:1,html:'',css:'',adressesImages:()=>[],document:{fonts:{ready:new Promise(()=>{})}},env:{isRendering:false},attente:1,Promise,console};
 vm.runInNewContext(js(snippet),scope);cleanup();
 if(old) {assert.equal(handles.size,1);results.sceneReactAvant={handles:handles.size};}
 else {assert.equal(handles.size,0);assert.equal(blocks.size,0);note('SceneReact : démontage pendant préparation',results.sceneReactAvant,{handles:0,attentes:0});}
}
delete results.sceneReactAvant;

// Les modules réels montaient des milliers d'éléments img. Le chemin aperçu ne les crée plus.
const helper=moduleOf(source('aitelier','src/scenes/bobine-apercu.ts'));
for(const name of ['i16-clips','panneau-s17-01','s11-01','s15-01']){
 const counts=[];
 for(const old of [true,false]){
  let count=0;const module={exports:{}};
  const mote={apercu:true,DUREE:30,C:()=>10,B0:()=>10,B1:()=>20,MOT:()=>10,$:()=>({appendChild:()=>count++}),chemin:x=>x};
  const s=source('aitelier',`src/runs/2026-10-24_deepseek-1017-meta/scenes/${name}.tsx`,old);
  vm.runInNewContext(js(s,'tsx'),{module,exports:module.exports,require:()=>helper,document:{createElement:()=>({})},console});
  module.exports.scene(mote).construire();counts.push(count);
 }
 assert.ok(counts[0]>=588);assert.equal(counts[1],0);note(name+' : img montées à construire()',counts[0],counts[1]);
}

// Aller-retour lointain, préchargement, capacité et libération de la bobine avec images simulées.
let active=new Set(),max=0;
class ImageFausse{
 naturalWidth=960;naturalHeight=540;complete=false;
 set src(value){this.url=value;active.add(this);max=Math.max(max,active.size);queueMicrotask(()=>{if(!active.has(this))return;this.complete=true;this.onload?.();});}
 get src(){return this.url;}
 removeAttribute(){active.delete(this);this.url='';}
}
const bobine=helper.bobineApercu('copie/',900,()=>new ImageFausse());
const get=async i=>{for(let t=0;t<5;t++){try{return bobine[i];}catch(e){if(e instanceof Promise)await e;else throw e;}}throw Error('Attente sans fin');};
for(const i of [0,1,2,100,899,0,300,301,302,899,0]){const im=await get(i);assert.match(im.src,new RegExp('f'+String(i+1).padStart(4,'0')+'\\.jpg$'));assert.ok(active.size<=12);}
await Promise.resolve();assert.ok(active.size<=12);assert.ok(max<=12);bobine.dispose();assert.equal(active.size,0);note('Bobine : sauts, fenêtre et démontage',{imagesPotentielles:900},{imagesRetenuesMax:12,pointeConstruction:max,imagesApresDemontage:active.size});

// Le flou temporel est conservé au rendu, mais une seule copie du DOM suffit dans le Player.
const flouCopies=(old,isRendering)=>{const s=source('aitelier','src/scenes/SceneReact.tsx',old),expr=s.match(/const G = (sansFlou[^;]+);/)[1];return vm.runInNewContext(expr,{sansFlou:false,env:{isRendering},flou:{G:8}});};
assert.equal(flouCopies(true,false),8);assert.equal(flouCopies(false,false),1);assert.equal(flouCopies(false,true),8);note('Flou temporel : copies du DOM',{apercu:8,rendu:8},{apercu:1,rendu:8});

// Le pilote Uchu libérait déjà delayRender ; le patch ajoute l'attente de lecture attribuée à ce pilote.
for(const old of [true,false]){
 const s=source('uchuchan','src/chain/components/runtime.ts',old),begin=s.indexOf('  useLayoutEffect(() => {'),end=s.indexOf('  useLayoutEffect(() => { apply(t)',begin);
 const handles=new Set(),blocks=new Set();let cleanup;
 const scope={useLayoutEffect:f=>{cleanup=f();},delayRender:()=>{handles.add(1);return 1;},continueRender:n=>handles.delete(n),cancelRender(){},buffer:{delayPlayback:()=>{blocks.add(1);return{unblock:()=>blocks.delete(1)};}},base:'copie',C:{},urls:[],ensureFonts:()=>new Promise(()=>{}),preloadImage(){},tl:{current:null},root:{current:null},Promise};
 vm.runInNewContext(js(s.slice(begin,end)),scope);const waiting=blocks.size;cleanup();assert.equal(handles.size,0);assert.equal(blocks.size,0);assert.equal(waiting,old?0:1);
 if(!old)note('Uchu : pilote de page et attente de lecture',{attentesLecture:0,handlesApresDemontage:0},{attentesLecturePendantChargement:1,attentesApresDemontage:0,handlesApresDemontage:0});
}

// Identité React du vrai JSX de Lesson 0, en isolant Live et Freeze du moteur 3D.
{
 const rreq=createRequire('C:/Users/owner/Desktop/Youtube/Jap for Eng/06_Theatre/06_Remotion/package.json'),React=rreq('react'),Reconciler=rreq('react-reconciler');
 const noop=()=>{};let mounted=0,unmounted=0;
 const Live=()=>{React.useEffect(()=>{mounted++;return()=>unmounted++;},[]);return null;},Freeze=({children})=>children;
 const cfg={now:Date.now,getRootHostContext:()=>({}),getChildHostContext:()=>({}),prepareForCommit:()=>null,resetAfterCommit:noop,shouldSetTextContent:()=>false,createInstance:()=>({}),createTextInstance:()=>({}),appendInitialChild:noop,finalizeInitialChildren:()=>false,appendChild:noop,appendChildToContainer:noop,removeChild:noop,removeChildFromContainer:noop,clearContainer:noop,supportsMutation:true,isPrimaryRenderer:true,supportsPersistence:false,supportsHydration:false,getPublicInstance:x=>x,getCurrentUpdatePriority:()=>32,setCurrentUpdatePriority:noop,resolveUpdatePriority:()=>32,maySuspendCommit:()=>false,preloadInstance:()=>true,startSuspendingCommit:noop,suspendInstance:noop,waitForCommitToBeReady:()=>null,NotPendingTransition:null,HostTransitionContext:React.createContext(null),scheduleTimeout:setTimeout,cancelTimeout:clearTimeout,noTimeout:-1,supportsMicrotasks:true,scheduleMicrotask:queueMicrotask,resetFormInstance:noop,requestPostPaintCallback:noop,detachDeletedInstance:noop};
 const R=Reconciler(cfg),root=R.createContainer({},0,null,false,null,'',console.error,console.error,console.error,null);
 const render=node=>{R.updateContainerSync(node,root,null,null);R.flushSyncWork();R.flushPassiveEffects();};
 const counts=[];
 for(const old of [true,false]){
  const s=source('lesson0','src/lesson0/Lesson0Montage.tsx',old),line=s.split(/\r?\n/).find(l=>l.includes('<Freeze frame={n - 1}'));
  const expr=old?line.trim().slice(1,-1):line.trim();
  const compiled=esbuild.transformSync(`globalThis.result=(${expr});`,{loader:'jsx',jsxFactory:'React.createElement',jsxFragment:'React.Fragment'}).code;
  mounted=unmounted=0;for(const t of [0,1]){const context={React,Live,Freeze,t,s:{t1:1},n:30,id:'L0A'};vm.runInNewContext(compiled,context);render(context.result);}counts.push({montages:mounted,demontages:unmounted});render(null);
 }
 assert.equal(counts[0].montages,2);assert.equal(counts[1].montages,1);assert.equal(counts[1].demontages,0);note('Lesson 0 : identité React à la sortie',counts[0],counts[1]);
}

// Baux du cache : partage, pas d'éviction d'une ressource utilisée, puis éviction et annulation.
const {createPreviewCache}=moduleOf(source('brambleshire','src/engine/preview-cache.ts'));
const cache=createPreviewCache(100);let builds=0,disposed=0;
const build=async()=>{builds++;return{data:{ok:true},bytes:80,dispose:()=>disposed++};};
const a=cache.acquire('a',build),a2=cache.acquire('a',build);await Promise.all([a.promise,a2.promise]);assert.equal(builds,1);
const b=cache.acquire('b',build);await b.promise;assert.equal(disposed,0);a.release();a2.release();assert.equal(disposed,1);b.release();assert.ok(cache.stats().bytes<=100);
let finish;const c=cache.acquire('c',async()=>{await new Promise(r=>finish=r);return{data:{},bytes:80,dispose:()=>disposed++};});await Promise.resolve();c.release();finish();await assert.rejects(c.promise,/annulée/);assert.equal(disposed,2);note('Cache : partage, budget, annulation',{cache:'absent'},{constructionsPartagees:1,ressourcesLiberees:disposed,octetsInactifs:cache.stats().bytes});

// Syntaxe de tous les fichiers modifiés et contrats visibles.
let checked=0;
for(const project of ['lesson0','brambleshire','aitelier','uchuchan']){
 const dir=path.join(base,project);
 const tracked=execFileSync('git',['-c','core.autocrlf=false','diff','--name-only'],{cwd:dir,encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean);
 const added=execFileSync('git',['ls-files','--others','--exclude-standard'],{cwd:dir,encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean);
 for(const f of [...tracked,...added].filter(x=>/\.tsx?$/.test(x))){esbuild.transformSync(fs.readFileSync(path.join(dir,f),'utf8'),{loader:f.endsWith('.tsx')?'tsx':'ts',target:'es2022'});checked++;}
}
assert.match(source('lesson0','src/coulisses-timeline.ts'),/reviewAudio: \{ src: L0\.MEDIA\.mix, offsetFrames: 0, volume: 1 \}/);
assert.match(source('lesson0','src/lesson0/Lesson0Montage.tsx'),/<Freeze frame=\{n - 1\} active=\{t >= s\.t1\}>/);
assert.match(source('aitelier','src/scenes/SceneReact.tsx'),/sansFlou \|\| !env\.isRendering \? 1 : flou\.G/);
for(const [p,f] of [['lesson0','src/lesson0/Lesson0Montage.tsx'],['aitelier','src/montage/Montage.tsx'],['uchuchan','src/mix/S23Short.tsx'],['uchuchan','src/chain/components/UchuPage.tsx']])assert.ok(!/<(?:OffthreadVideo|Html5Video)\s+(?!pauseWhenBuffering)/.test(source(p,f).split(/\r?\n/).filter(l=>!l.trim().startsWith('//')).join('\n')));
note('Syntaxe et contrats',null,{fichiersSyntaxeValidee:checked,masterLesson0:'L0.MEDIA.mix',renduFinalFlouConserve:true});
fs.writeFileSync(path.join(atelier,'.cache/revue-astra/patchs-projets/validation.json'),JSON.stringify(results,null,2)+'\n');
console.log(JSON.stringify(results,null,2));
console.log(`${results.tests.length} ok, 0 ko`);
