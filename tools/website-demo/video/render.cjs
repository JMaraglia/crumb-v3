const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');
(async()=>{const b=await chromium.launch(); const p=await b.newPage({viewport:{width:720,height:1280}});
 await p.goto('file:///tmp/vid/index.html');
 await p.evaluate(()=>Promise.all(['home','home-mid','itinerary','customers','cust','notes','todo','checkins','prospects','prospect','cal','wrapup'].map(n=>{const i=new Image();i.src='img/'+n+'.png';return i.decode();})));
 const arg = process.argv[2]||'';
 if (arg.startsWith('still:')) { for (const T of arg.slice(6).split(',').map(Number)) { await p.evaluate((T)=>render(T),T); await p.screenshot({path:`/tmp/vid/st-${T}.png`}); } await b.close(); return; }
 const sc = await p.evaluate(()=>SCENES.map(s=>[s.s,s.e]));
 const only = arg ? arg.split(',').map(Number) : null; const list=[];
 for (let i=0;i<sc.length;i++){
  const name=`/tmp/vid/s${String(i).padStart(2,'0')}.mp4`; list.push(`file '${name}'`);
  if (only && !only.includes(i)) continue;
  const f0=Math.round(sc[i][0]*30), f1=Math.round(sc[i][1]*30), tmp=name.replace('.mp4','.tmp.mp4');
  const ff=spawn('ffmpeg',['-y','-v','error','-f','image2pipe','-framerate','30','-c:v','mjpeg','-i','-','-c:v','libx264','-crf','18','-preset','veryfast','-pix_fmt','yuv420p','-r','30',tmp]);
  for (let f=f0;f<f1;f++){ await p.evaluate((T)=>render(T),f/30); const buf=await p.screenshot({type:'jpeg',quality:92}); if(!ff.stdin.write(buf)) await new Promise(r=>ff.stdin.once('drain',r)); }
  ff.stdin.end(); await new Promise((res,rej)=>ff.on('close',c=>c===0?res():rej(new Error('ffmpeg '+c))));
  fs.renameSync(tmp,name); console.log('scene',i,f1-f0);
 }
 fs.writeFileSync('/tmp/vid/list.txt',list.join('\n')+'\n'); await b.close();})();
