// Package only runtime code; never include .env, SQLite data or node_modules.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const out = path.resolve('dist');
fs.rmSync(out, {recursive:true, force:true});
fs.mkdirSync(out, {recursive:true});
for (const name of ['server.js','db.js','utils.js','public','package.json','package-lock.json','.env.example']) {
  fs.cpSync(name, path.join(out,name), {recursive:true});
}
let sha = process.env.GITHUB_SHA;
if (!sha) { try { sha = execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(); } catch { sha = 'uncommitted'; } }
let workingTreeDirty = null;
try { workingTreeDirty = Boolean(execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim()); } catch {}
fs.writeFileSync(path.join(out,'BUILD.json'), JSON.stringify({working_tree_dirty:workingTreeDirty, version:require('../package.json').version, source_commit:sha, built_at:new Date().toISOString(), node:process.version},null,2));
const files=[];
function walk(dir) { for(const entry of fs.readdirSync(dir,{withFileTypes:true})) { const p=path.join(dir,entry.name); if(entry.isDirectory()) walk(p); else files.push(p); } }
walk(out);
fs.writeFileSync(path.join(out,'SHA256SUMS'),files.sort().map(p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')+'  '+path.relative(out,p).split(path.sep).join('/')).join('\n')+'\n');
console.log(`Built ${files.length} runtime files in dist/`);
