import {existsSync,readdirSync,readFileSync} from 'node:fs';
import {dirname,relative,resolve} from 'node:path';

const root=process.cwd(),files=[];
function walk(directory){for(const entry of readdirSync(directory,{withFileTypes:true})){if(entry.name==='.git'||entry.name==='node_modules')continue;const target=resolve(directory,entry.name);entry.isDirectory()?walk(target):files.push(target)}}
walk(root);

const missing=[];
for(const file of files.filter(name=>/\.(?:html|js)$/.test(name))){
  const source=readFileSync(file,'utf8');
  const patterns=file.endsWith('.html')?[/(?:href|src)="([^"]+)"/g]:[/\bfrom\s+['"]([^'"]+)['"]/g,/\bimport\s+['"]([^'"]+)['"]/g];
  for(const pattern of patterns){
    for(const match of source.matchAll(pattern)){
      const reference=match[1];
      if(!reference.startsWith('.')||reference.includes('${'))continue;
      const clean=decodeURIComponent(reference.split(/[?#]/)[0]);
      if(!existsSync(resolve(dirname(file),clean)))missing.push(`${relative(root,file)} -> ${reference}`);
    }
  }
}

if(missing.length){console.error(`Missing relative targets:\n${missing.join('\n')}`);process.exit(1)}
console.log(`Relative path check passed (${files.filter(name=>/\.(?:html|js)$/.test(name)).length} files).`);
