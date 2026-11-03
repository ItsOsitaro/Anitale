globalThis.__graph={
 7000:{t:'Saga Special',k:'Special',e:1,y:2015,r:[['Sequel',[7001]]]},
 7001:{t:'Saga S1',k:'TV',e:12,y:2018,r:[['Prequel',[7000]],['Sequel',[7003]],['Alternative version',[7006]]]},
 7003:{t:'Saga Movie',k:'Movie',e:1,y:2019,r:[['Prequel',[7001]],['Sequel',[7002]],['Adaptation',[9200],'manga']]},
 7002:{t:'Saga S2',k:'TV',e:24,y:2020,r:[['Prequel',[7003]],['Side story',[7004]]]},
 7004:{t:'Saga Gaiden',k:'OVA',e:2,y:2021,r:[['Parent story',[7002]]]},
 7006:{t:'Saga Remake',k:'TV',e:12,y:2022,r:[['Alternative version',[7001]]]},
 9301:{t:'Solo Leveling',k:'TV',e:12,y:2024,r:[['Sequel',[9501]]]},
 9501:{t:'Demon Slayer',k:'TV',e:26,y:2019,r:[['Prequel',[9301]]]},
};
import http from 'node:http'; import zlib from 'node:zlib';
const PORT=Number(process.env.PORT||4010); const hits={}; globalThis.mode={};
// 1x1 png
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==','base64');
const img=(id)=>({jpg:{image_url:`http://127.0.0.1:${PORT}/img/${id}.png`,small_image_url:'',large_image_url:`http://127.0.0.1:${PORT}/img/${id}.png`},webp:{image_url:'',large_image_url:''}});
const anime=(id)=>({mal_id:id,url:`https://myanimelist.net/anime/${id}`,images:img(id),title:`Mock Romaji ${id}`,title_english:`Mock Anime ${id}`,title_japanese:'モック',title_synonyms:['Mocky'],type:'TV',source:'Manga',episodes:12,status:'Currently Airing',airing:true,aired:{string:'Oct 2026 to ?',prop:{from:{day:1,month:10,year:2026}}},duration:'24 min per ep',rating:'PG-13',score:7.89,scored_by:12345,rank:321,popularity:99,members:5555,favorites:77,synopsis:'A mock synopsis.\n\n[Written by MAL Rewrite]',season:'fall',year:2026,broadcast:{day:'Saturdays',time:'23:00',timezone:'Asia/Tokyo',string:'Saturdays at 23:00 (JST)'},producers:[{name:'Prod A'}],licensors:[],studios:[{name:'Studio X'}],genres:[{name:'Action'},{name:'Ecchi'},{name:'Fantasy'}],explicit_genres:[],themes:[{name:'Isekai'},{name:'Hentai'}],demographics:[{name:'Shounen'}],external:[{name:'Official Site',url:'https://example.com'}],streaming:[{name:'Crunchyroll',url:'https://crunchyroll.com'}]});
const manga=(id)=>({mal_id:id,url:`https://myanimelist.net/manga/${id}`,images:img(id),title:`Mock Manga Romaji ${id}`,title_english:`Mock Manga ${id}`,type:'Manga',chapters:null,volumes:5,status:'Publishing',publishing:true,published:{string:'2025 to ?',prop:{from:{year:2025}}},score:8.1,synopsis:'Manga synopsis.',genres:[{name:'Drama'},{name:'Erotica'}],themes:[],demographics:[{name:'Seinen'}],authors:[{name:'Author Z'}],serializations:[{name:'Mag Q'}]});
const send=(res,code,body,extra={})=>{res.writeHead(code,{'content-type':'application/json',...extra});res.end(JSON.stringify(body));};
http.createServer((req,res)=>{
  const u=new URL(req.url,'http://x'); const p=u.pathname; hits[p]=(hits[p]||0)+1;
  if (p==='/__hits') return send(res,200,hits);
  if (p==='/__mode'){ globalThis.mode=JSON.parse(u.searchParams.get('v')||'{}'); return send(res,200,globalThis.mode); }
  if (p.startsWith('/img/')) { res.writeHead(200,{'content-type':'image/png'}); return res.end(PNG); }
  const m=globalThis.mode;
  if (m.status) { const s=m.status; if (m.retryAfter) return send(res,s,{status:s,type:'Err',message:'x'},{'retry-after':String(m.retryAfter)}); return send(res,s,{status:s,type:'Err',message:'blocked by test',error:'x',path:p}); }
  if (m.once429 && !globalThis.did429) { globalThis.did429=true; return send(res,429,{status:429,type:'RateLimitException',message:'slow down'},{'retry-after':'1'}); }
  if (m.garbage) { res.writeHead(200,{'content-type':'text/html'}); return res.end('<html>nope</html>'); }
  let mm;
  if (p==='/v1/seasons/now') return send(res,200,{data:[{...anime(9301),type:'TV'},{...anime(9302),type:'Music'},{...anime(9303),type:'TV',genres:[{name:'Hentai'}]},{...anime(9304),type:'Movie'}],pagination:{last_visible_page:1,has_next_page:false}});
  if (p==='/v1/anime'||p==='/v1/manga') {
    const bad=[...u.searchParams.keys()].filter(k=>!['q','limit','page','sfw','sfw-strict'].includes(k)); if (bad.length) return send(res,400,{status:400,type:'BadRequestException',message:`unknown parameter ${bad[0]}`});
    const q=u.searchParams.get('q')||''; if (q==='nomatch') return send(res,200,{data:[],pagination:{last_visible_page:1,has_next_page:false}});
    const mk=p.endsWith('anime')?anime:manga; const base=p.endsWith('anime')?9100:9200;
    return send(res,200,{data:[mk(base+1),{...mk(base+2),mal_id:null}],pagination:{last_visible_page:1,has_next_page:false}});
  }
  if ((mm=/^\/v1\/(anime|manga)\/(\d+)\/full$/.exec(p))) { const id=Number(mm[2]); if (id===404404) return send(res,404,{status:404,type:'ResourceNotFoundException',message:'nf'}); const base=(mm[1]==='anime'?anime:manga)(id); const g=globalThis.__graph?.[id]; if(g) Object.assign(base,{title:g.t,title_english:g.t,type:g.k,episodes:g.e,aired:{prop:{from:{year:g.y,month:g.m||1,day:1}}},year:g.y,relations:g.r.map(([relation,ids,type])=>({relation,entry:ids.map(i=>({mal_id:i,type:type||'anime',name:'x'}))}))}); return send(res,200,{data:base}); }
  if ((mm=/^\/v1\/(anime|manga)\/(\d+)\/(characters|relations|recommendations|videos|themes|staff|episodes|pictures)$/.exec(p))) {
    const kind=mm[3], id=Number(mm[2]); if (id===404404) return send(res,404,{status:404,type:'X',message:'nf'});
    if (globalThis.mode.noExtras) return send(res,403,{status:403,type:'Blocked',message:'blocked'});
    if (kind==='episodes') { const pg=Number(u.searchParams.get('page')||1); const n=pg===1?100:20; return send(res,200,{data:[...Array(n)].map((_,i)=>({mal_id:(pg-1)*100+i+1,title:`Episode title ${(pg-1)*100+i+1}`,title_japanese:'話',aired:'2024-01-0'+((i%9)+1)+'T00:00:00+00:00',filler:i===3,recap:false})),pagination:{has_next_page:pg===1}}); }
    if (kind==='pictures') return send(res,200,{data:[...Array(8)].map((_,i)=>(img(4000+i)))});
    if (kind==='characters') return send(res,200,{data:[...Array(20)].map((_,i)=>({character:{mal_id:100+i,name:`Char ${i}`,images:img(100+i)},role:i<3?'Main':'Supporting',favorites:100-i,voice_actors:mm[1]==='anime'?[{person:{mal_id:500+i,name:`VA ${i}`,images:img(500+i)},language:'English'},{person:{mal_id:600+i,name:`Seiyuu ${i}`,images:img(600+i)},language:'Japanese'}]:undefined}))});
    if (kind==='relations') return send(res,200,{data:[{relation:'Sequel',entry:[{mal_id:9501,type:'anime',name:'Mock Sequel'}]},{relation:'Adaptation',entry:[{mal_id:9200,type:'manga',name:'Mock Source Manga'}]},{relation:'Other',entry:[{mal_id:1,type:'novel',name:'skip'}]}]});
    if (kind==='recommendations') return send(res,200,{data:[...Array(12)].map((_,i)=>({entry:{mal_id:9600+i,title:`Rec ${i}`,images:img(9600+i)},votes:i}))});
    if (kind==='videos') return send(res,200,{data:{promo:[{title:'PV 1',trailer:{youtube_id:'abc123XYZ_-',embeddable:true}},{title:'PV 2',trailer:{youtube_id:'def456XYZ_-',embeddable:true}}],episodes:[],music_videos:[{title:'OP full',video:{youtube_id:'mus123XYZ_-'},meta:{title:'OP full',author:'Band'}}]}});
    if (kind==='staff') return send(res,200,{data:[...Array(30)].map((_,i)=>({person:{mal_id:700+i,name:`Staff ${i}`},positions:i%5===0?['Director','Storyboard']:i%7===0?['Music']:['Key Animation']}))});
    if (kind==='staff') return send(res,200,{data:[{person:{mal_id:700,name:'Director San'},positions:['Director','Episode Director']},{person:{mal_id:701,name:'Key Anim'},positions:['Key Animation']},{person:{mal_id:702,name:'Composer Kun'},positions:['Music']}]});
    if (kind==='themes') return send(res,200,{data:{openings:['1: "Op Song" by Band (eps 1-12)'],endings:['1: "End Song" by Singer']}});
  }
  if (p==='/v1/top/characters') {
    const pg=Number(u.searchParams?.get('page')||1); if(globalThis.__failTop) return send(res,500,{});
    return send(res,200,{data:[...Array(25)].map((_,i)=>{const n=(pg-1)*25+i+1;return {mal_id:3000+n,name:`Top Char ${n}`,name_kanji:'名',favorites:100000-n*100,images:img(3000+n)};})});
  }
  if ((mm=/^\/v1\/manga\/(\d+)$/.exec(p))) return send(res,200,{data:{mal_id:Number(mm[1]),serializations:Number(mm[1])===7002?[]:[{name:'Weekly Shonen Jump'},{name:'Jump Giga'}]}});
  if (p==='/v1/characters' || p==='/v1/people') {
    const q=(u.searchParams?.get('q')||'').toLowerCase(); if(globalThis.__failSearch) return send(res,500,{});
    const rows=[{mal_id:41,name:'Frieren Hero',name_kanji:'勇者',favorites:900,images:img(41)},{mal_id:42,name:'Hero Mage',favorites:50,images:img(42)}].filter(r=>r.name.toLowerCase().includes(q));
    return send(res,200,{data:p==='/v1/people'?rows.map(r=>({...r,given_name:'Taro',family_name:'Yamada'})).filter(r=>r.name.toLowerCase().includes(q)):rows});
  }
  if ((mm=/^\/v1\/(characters|people)\/(\d+)\/full$/.exec(p))) {
    const id=Number(mm[2]); if (id===404404) return send(res,404,{status:404,type:'X',message:'nf'});
    const A=(i)=>({mal_id:i,title:`Anime ${i}`,images:img(i)});
    if (mm[1]==='characters') return send(res,200,{data:{mal_id:id,name:`Hero ${id}`,name_kanji:'主人公',nicknames:['Ace','Boss'],favorites:4321,about:'A brave hero.\n\nLoves ramen. (Source: Wiki)',images:img(id),anime:[{role:'Main',anime:A(9301)},{role:'Supporting',anime:A(777)}],manga:[{role:'Main',manga:{mal_id:9200,title:'Mock Manga',images:img(9200)}}],voices:[{person:{mal_id:800,name:'Seiyuu Ja',images:img(800)},language:'Japanese'},{person:{mal_id:801,name:'VA En',images:img(801)},language:'English'}]}});
    return send(res,200,{data:{mal_id:id,name:`Person ${id}`,given_name:'Taro',family_name:'Yamada',alternate_names:['Yama'],birthday:'1980-05-01T00:00:00+00:00',favorites:99,about:'Voice actor and director.',images:img(id),voices:[{role:'Main',anime:A(9301),character:{mal_id:100,name:'Hero 100',images:img(100)}}],anime:[{position:'Director',anime:A(9501)}],manga:[]}});
  }
  send(res,404,{status:404,type:'NotFoundException',message:'route'});
}).listen(PORT,'127.0.0.1');
