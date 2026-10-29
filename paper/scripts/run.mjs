import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { benchmark, run } from '../../dist/index.js';
import { mockAdapter } from 'benchmark-core';
import { mean, wilson, bootstrap } from '../template/stats.mjs';
const hash = x => createHash('sha256').update(x).digest('hex');
const tasks = await benchmark.listTasks(), config = JSON.parse(await readFile('paper/config.json'));
const options = { seed: 1, concurrency: 1, retries: 0, maxTurns: 5, maxToolCalls: 8, budgetUsd: 0 };
const names = ['empty','constant','echo','refuse','first-tool','policy','no-lookup','no-message','generic-message','always-escalate','always-remake','over-cap'];
const controls = ['none','lookup','message','both'], qs = [0,.25,.5,.75,1], seeds = [1,2,3,4,5,6,7,8];
function turns(task, c) {
  const i = task.input, n = c.policy, call = (name,args) => ({ toolCalls: [{ name,args }] });
  if (['empty','constant','echo','refuse'].includes(n)) return [{ content: ({ empty:'',constant:'OK',echo:task.prompt,refuse:'I cannot help with that request.' })[n] }];
  if (n === 'first-tool') return Array.from({length:options.maxTurns},()=>call('lookup_order',{}));
  let remedy = ['wrong-topping','cold'].includes(i.scenario) ? 'remake' : ['allergen','fraud-pattern'].includes(i.scenario) ? 'escalate' : i.scenario === 'missing-item' && i.ageDays <= 30 ? 'refund' : 'credit';
  let amount = i.scenario === 'missing-item' ? (i.ageDays > 30 ? Math.min(i.affectedItemPrice,15) : Math.min(i.affectedItemPrice,35,Math.floor(i.orderValue*.5))) : i.scenario === 'customer-address' ? 5 : Math.min(10,Math.floor(i.orderValue*.2));
  if (n === 'always-escalate') remedy = 'escalate';
  if (n === 'always-remake') remedy = 'remake';
  if (n === 'over-cap') { remedy = 'refund'; amount = 999; }
  const action = remedy === 'remake' ? call('remake_order',{}) : remedy === 'escalate' ? call('escalate',{reason:'Safety or fraud review'}) : call(`issue_${remedy}`,{amount});
  let lookup = n !== 'no-lookup', message = n !== 'no-message';
  if (n === 'simulated') {
    const bytes = createHash('sha256').update(`${c.seed}:${task.id}`).digest();
    lookup = bytes.readUInt32LE(0)/2**32 >= c.q || ['lookup','both'].includes(c.control);
    message = bytes.readUInt32LE(4)/2**32 >= c.q || ['message','both'].includes(c.control);
  }
  return [...(lookup ? [call('lookup_order',{orderId:i.orderId})] : []),action,...(message ? [call('message_customer',{text:n === 'generic-message' ? 'Purple aardvark.' : `Resolution: ${remedy}${['credit','refund'].includes(remedy) ? ` of $${amount}` : ''}.`})] : [])];
}
const conditions = [...names.map(policy=>({policy})),...qs.flatMap(q=>controls.flatMap(control=>seeds.map(seed=>({policy:'simulated',q,control,seed}))))];
const semantic = report => report.rows.map(r=>({taskId:r.taskId,submission:r.submission,score:r.score,reason:r.reason,details:r.details}));
await mkdir('paper/data',{recursive:true});
const save = (name,x) => writeFile(`paper/data/${name}.generated.json`,JSON.stringify(x)+'\n');
const runs = [], repeats = [];
for (const c of conditions) {
  const script = task=>[...turns(task,c),{content:"Done."}], adapter = ()=>mockAdapter({seed:1,policies:{good:script,bad:script}});
  const a = await run(adapter(),options), b = await run(adapter(),options);
  for (const r of [a,b]) { assert.equal(r.rows.length,tasks.length); assert.ok(r.rows.every(x=>!x.error)); assert.equal(r.totals.costUsd??0,0); }
  const rows = semantic(a), repeated = semantic(b), digest = hash(JSON.stringify(rows));
  assert.equal(digest,hash(JSON.stringify(repeated)));
  runs.push({...c,rows}); repeats.push({...c,sha256:digest,repeatSha256:hash(JSON.stringify(repeated))});
}
export function summarize(runs,tasks) {
  const full = rows=>mean(rows.map(r=>+(r.score===1))), violation = rows=>mean(rows.map(r=>+(r.details.policyViolations.length>0)));
  const stats = runs.filter(r=>r.policy!=='simulated').map(r=>({...r,rows:undefined,completion:wilson(r.rows.filter(x=>x.score===1).length,r.rows.length),violation:wilson(r.rows.filter(x=>x.details.policyViolations.length).length,r.rows.length),score:bootstrap([...new Set(tasks.map(t=>t.input.scenario))].map(s=>r.rows.filter(x=>tasks.find(t=>t.id===x.taskId).input.scenario===s)),g=>mean(g.flat().map(x=>x.score)))}));
  const sweep = qs.flatMap(q=>controls.map(control=>{
    const cells = runs.filter(r=>r.policy==='simulated'&&r.q===q&&r.control===control), paired = cells.map(c=>({c,base:runs.find(r=>r.policy==='simulated'&&r.q===q&&r.control==='none'&&r.seed===c.seed)}));
    return {q,control,seeds:cells.length,episodes:cells.reduce((n,c)=>n+c.rows.length,0),completion:bootstrap([cells],g=>mean(g.flat().map(c=>full(c.rows)))),violation:bootstrap([cells],g=>mean(g.flat().map(c=>violation(c.rows)))),score:bootstrap([cells],g=>mean(g.flat().map(c=>mean(c.rows.map(r=>r.score))))),delta:bootstrap([paired],g=>mean(g.flat().map(p=>full(p.c.rows)-full(p.base.rows))))};
  }));
  return {stats,sweep};
}
const coverage = [...new Set(tasks.map(t=>t.input.scenario))].map(scenario=>({scenario,...Object.fromEntries(['refund','credit','remake','escalate'].map(r=>[r,tasks.filter(t=>t.input.scenario===scenario&&t.expected.remedy===r).length]))}));
const summary = {schema_version:1,tasks:tasks.length,scenarios:coverage.length,coverage,options,baselineConditions:names.length,simulatedConditions:conditions.length-names.length,episodes:conditions.length*tasks.length*2,ciLevel:95,bootstrapDraws:2000,seeds,qs,costUsd:0,freeModels:'Not run; free-only access not configured or tested for this study.',...summarize(runs,tasks)};
await save('runs',runs); await save('repeat',repeats); await save('summary',summary);
const sources = ['data/tasks.jsonl','data/POLICY.md','src/benchmark.ts','src/environment.ts','src/index.ts','package-lock.json','paper/PREREG.md','paper/scripts/run.mjs','paper/template/stats.mjs'];
for (const p of sources.slice(0,6)) assert.equal(hash(await readFile(p)),hash(execFileSync('git',['show',`${config.source_commit}:${p}`])));
await save('provenance',{source_commit:config.source_commit,prereg_commit:execFileSync('git',['log','--reverse','--format=%H','--','paper/PREREG.md'],{encoding:'utf8'}).trim().split('\n')[0],node:process.version,files:Object.fromEntries(await Promise.all(sources.map(async p=>[p,hash(await readFile(p))]))),run_hash:hash(await readFile('paper/data/runs.generated.json'))});
console.log(`Completed ${summary.episodes} local episodes; all repeated semantic hashes match; cost USD 0`);
