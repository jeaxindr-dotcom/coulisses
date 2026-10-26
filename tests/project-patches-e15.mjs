// Validation de la sélection sur les données E15 copiées ; aucun PNG/WAV, navigateur ou rendu n'est chargé.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const atelier=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const root=path.join(atelier,'.cache/revue-astra/projets-copies/brambleshire');
if (!fs.existsSync(path.join(root, 'src/episodes/e15.ts')) || !fs.existsSync('C:/Users/owner/Desktop/Youtube/music/Brambleshire/Théatre/06_Remotion/node_modules/esbuild')) {
  console.log('(sauté : copie locale E15 ou dépendances du moteur absentes)\n0 ok, 0 ko'); process.exit(0);
}
const req=createRequire('C:/Users/owner/Desktop/Youtube/music/Brambleshire/Théatre/06_Remotion/package.json');
const esbuild=req('esbuild');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const evaluate=(code,extra={})=>{const module={exports:{}};vm.runInNewContext(code,{module,exports:module.exports,require:req,console,...extra});return module.exports;};
const compile=s=>esbuild.transformSync(s,{loader:'tsx',format:'cjs',target:'es2022'}).code;
let episode=read('src/episodes/e15.ts');
const durations={INTRO_DUR:6.2,VALLEY_LINE_DUR:6.5,VIADUCT_SUNSET_DUR:7,HOME_SNOW_DUR:7,HOOK_TAIL:0.7};
episode=episode.replace(/^import \{ (\w+) \} from '(?:\.\.\/shots\/\w+|\.\.\/WorldHook)';.*$/gm,(_m,n)=>`const ${n} = ${durations[n]};`);
const built=esbuild.buildSync({stdin:{contents:episode,resolveDir:path.join(root,'src/episodes'),loader:'ts'},bundle:true,platform:'node',format:'cjs',write:false});
const {buildE15,E15_ASSETS,CHARACTER_SCALE}=evaluate(built.outputFiles[0].text);
const tl=buildE15();
const timeline=evaluate(compile(read('src/engine/timeline.ts')));
const railway=evaluate(compile(read('src/engine/railway.tsx')));
const stage=read('src/engine/Stage.tsx');
function fn(name){const marker=new RegExp(`(?:export )?function ${name}\\(`),start=stage.search(marker);assert.ok(start>=0);const tail=stage.slice(start),next=tail.slice(1).search(/\n(?:export )?(?:function|const) /);return tail.slice(0,next<0?undefined:next+1);}
const selectCode=compile([fn('previewSelection'),fn('actorWorld'),fn('rideAt'),fn('onPlatformAt'),fn('setFactor')].join('\n'));
const {previewSelection}=evaluate(selectCode,{...timeline,...railway,INTRO:JSON.parse(read('src/shots/series-intro-layout.json')),VALLEY:JSON.parse(read('src/shots/valley-line-layout.json')),VIADUCT:JSON.parse(read('src/shots/viaduct-sunset-layout.json')),HOME:JSON.parse(read('src/shots/home-snow-layout.json')),TOWER_LIFT:6.5,wobbled:(x,y)=>[x,y],wobbleAt:()=>0,offstage:(_k,x)=>[x,0],trainSetShift:()=>0});
const count=a=>({decors:Object.values(a.sets).reduce((n,s)=>n+s.flats.length,0),accessoires:Object.values(a.props).reduce((n,p)=>n+Object.keys(p.variants).length,0),poses:Object.values(a.characters).reduce((n,c)=>n+Object.keys(c.poses).length,0)});
const total=x=>x.decors+x.accessoires+x.poses;
const whole=count(E15_ASSETS),samples=[];
const times=[0,...Array.from({length:19},(_,i)=>(i+1)*tl.duration/20),...tl.cutaways.flatMap(c=>[Math.max(0,c.t-1/30),c.t,c.t+1/30,c.t+c.dur-1/30])];
let selectionMs=0;
for(const t of times){const start=performance.now(),selected=previewSelection(E15_ASSETS,CHARACTER_SCALE,tl,t);selectionMs+=performance.now()-start;const n=count(selected);samples.push({t:+t.toFixed(3),...n,total:total(n)});assert.ok(total(n)<total(whole),'La sélection ne doit pas revenir au jeu intégral sur E15');
 for(const w of tl.sets)if(w.inT<t&&w.outT+w.outDur>t)assert.ok(selected.sets[w.id],'Décor présent pendant son passage');
}
// Apparition d'un seul centième de seconde entre les échantillons : ne pas l'omettre.
const micro={...tl,actors:{micro:[{kind:'show',t:0.025},{kind:'hide',t:0.035}]},sets:[],props:[],scrolls:[],trains:[],floats:[],gusts:[],cutaways:[],rides:{},onPlatform:{}};
const selected=previewSelection({sets:{},props:{},characters:{micro:{poses:{neutral:'x'}}}}, {},micro,0);assert.ok(selected.characters.micro);
const result={date:new Date().toISOString(),type:'Sélection et comptes numériques, aucune mesure GPU/FPS',dureeE15:tl.duration,avant:{...whole,total:total(whole)},apres:{minimum:Math.min(...samples.map(x=>x.total)),maximum:Math.max(...samples.map(x=>x.total)),echantillons:samples.length,selectionMs:+selectionMs.toFixed(2),moyenneMs:+(selectionMs/samples.length).toFixed(2)},echantillons:samples};
fs.writeFileSync(path.join(atelier,'.cache/revue-astra/patchs-projets/validation-e15.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({...result,echantillons:undefined},null,2));
console.log('1 ok, 0 ko');
