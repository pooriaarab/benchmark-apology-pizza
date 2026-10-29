import assert from 'node:assert/strict';
import { readFile,writeFile,readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { benchmark } from '../../dist/index.js';
import { mean,wilson,bootstrap } from '../template/stats.mjs';
const load=async n=>JSON.parse(await readFile(`paper/data/${n}.generated.json`)), hash=x=>createHash('sha256').update(x).digest('hex');
const runs=await load('runs'), repeats=await load('repeat'), s=await load('summary'), provenance=await load('provenance'), tasks=await benchmark.listTasks();
for(const [p,digest] of Object.entries(provenance.files)) assert.equal(hash(await readFile(p)),digest,p);
assert.equal(hash(await readFile('paper/data/runs.generated.json')),provenance.run_hash);
for(const [i,run] of runs.entries()) {
  assert.deepEqual(run.rows.map(r=>r.taskId),tasks.map(t=>t.id));
  assert.equal(hash(JSON.stringify(run.rows)),repeats[i].sha256); assert.equal(repeats[i].sha256,repeats[i].repeatSha256);
  for(const row of run.rows) { const actual=await benchmark.score(tasks.find(t=>t.id===row.taskId),row.submission); assert.equal(actual.score,row.score); assert.deepEqual(actual.details,row.details); }
}
for(const stat of s.stats) {
  const rows=runs.find(r=>r.policy===stat.policy).rows;
  assert.deepEqual(stat.completion,wilson(rows.filter(r=>r.score===1).length,rows.length));
  assert.deepEqual(stat.violation,wilson(rows.filter(r=>r.details.policyViolations.length).length,rows.length));
  const groups=[...new Set(tasks.map(t=>t.input.scenario))].map(sc=>rows.filter(r=>tasks.find(t=>t.id===r.taskId).input.scenario===sc));
  assert.deepEqual(stat.score,bootstrap(groups,g=>mean(g.flat().map(r=>r.score))));
}
for(const cell of s.sweep) {
  const a=runs.filter(r=>r.policy==='simulated'&&r.q===cell.q&&r.control===cell.control), full=r=>mean(r.rows.map(x=>+(x.score===1)));
  assert.deepEqual(cell.completion,bootstrap([a],g=>mean(g.flat().map(full))));
  const paired=a.map(r=>({a:full(r),b:full(runs.find(x=>x.policy==='simulated'&&x.q===r.q&&x.seed===r.seed&&x.control==='none'))}));
  assert.deepEqual(cell.delta,bootstrap([paired],g=>mean(g.flat().map(x=>x.a-x.b))));
}
const meta=JSON.parse(await readFile('paper/meta.json')), tex=await readFile('paper/paper.tex','utf8');
assert.ok(meta.abstract.length<=1920&&/^[\x00-\x7f]*$/.test(meta.abstract)); assert.ok(!tex.includes('—'));
const text=execFileSync('pdftotext',[`paper/${meta.artifact_name}`,'-'],{encoding:'utf8'}), info=execFileSync('pdfinfo',[`paper/${meta.artifact_name}`],{encoding:'utf8'}), pages=Number(info.match(/Pages:\s+(\d+)/)[1]);
assert.ok(pages>=8); assert.ok(!text.includes('??')); assert.ok(text.includes('Purple aardvark')); assert.equal((text.match(/Figure \d:/g)||[]).length,3);
const log=await readFile('paper/paper.log','utf8'); assert.ok(!/Overfull|undefined references|undefined citations/.test(log));
const evidence={status:'passed',pages,figures:3,uniqueEpisodes:runs.reduce((n,r)=>n+r.rows.length,0),repeatedEpisodes:s.episodes,rawRegrade:true,summaryAgreement:true,repeatHashes:true,pdf_sha256:hash(await readFile(`paper/${meta.artifact_name}`)),template_hashes:Object.fromEntries(await Promise.all((await readdir('paper/template')).map(async p=>[p,hash(await readFile(`paper/template/${p}`))])))};
await writeFile('paper/data/verification.generated.json',JSON.stringify(evidence,null,2)+'\n'); console.log(JSON.stringify(evidence));
