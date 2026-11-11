const LIMIT=1800000;
function decodeEntities(s){return String(s||'').replace(/&quot;/g,'"').replace(/&#39;|&#x27;/g,"'").replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')}
function findTikTokCaption(html){
const scripts=html.match(/<script[^>]*>[\s\S]*?<\/script>/gi)||[];
for(const script of scripts){
if(!script.includes('__UNIVERSAL_DATA_FOR_REHYDRATION__')&&!script.includes('SIGI_STATE'))continue;
const start=script.indexOf('>'),end=script.lastIndexOf('</script>');
if(start<0||end<0)continue;
try{
const data=JSON.parse(script.slice(start+1,end)),captions=[];
function visit(v,depth){
if(depth>20||!v||typeof v!=='object')return;
if(Array.isArray(v)){for(const x of v.slice(0,100))visit(x,depth+1);return}
if(typeof v.desc==='string'&&v.desc.length>15)captions.push(v.desc);
for(const [key,value] of Object.entries(v)){
if(depth<4||['itemInfo','itemStruct','itemModule','ItemModule','__DEFAULT_SCOPE__','webapp.video-detail','video','itemList','items','data'].includes(key))visit(value,depth+1)
}
}
visit(data,0);
if(captions.length)return captions.sort((x,y)=>y.length-x.length)[0]
}catch{}
}
return ''
}
function findRecipe(value){let found=null;function walk(x){if(!x||typeof x!=='object'||found)return;if(Array.isArray(x)){x.forEach(walk);return}let types=[].concat(x['@type']||[]);if(types.includes('Recipe')){found=x;return}if(x['@graph'])walk(x['@graph'])}walk(value);return found}
function meta(html,name){const tags=html.match(/<meta\s[^>]*>/gi)||[];for(const tag of tags){const attrs={};for(const m of tag.matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/g))attrs[m[1].toLowerCase()]=m[3];if(attrs.property===name||attrs.name===name)return attrs.content||''}return ''}
export default async function handler(req,res){
res.setHeader('Cache-Control','no-store');
if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
try{
const link=req.body?.url;if(typeof link!=='string'||link.length>2000)throw Error('Invalid link');
const u=new URL(link);if(u.protocol!=='https:')throw Error('Only HTTPS links are supported');
const host=u.hostname.toLowerCase();
if(!/^[a-z0-9.-]+$/.test(host)||!host.includes('.')||host==='localhost'||host.endsWith('.local')||host.endsWith('.internal')||/^(127|10|0|192\.168|169\.254|172\.(1[6-9]|2[0-9]|3[01]))\./.test(host))throw Error('Unsupported host');
const response=await fetch(u.href,{headers:{'User-Agent':'Mozilla/5.0 MyRecipes/1.0','Accept':'text/html'},signal:AbortSignal.timeout(8000),redirect:'error'});
if(!response.ok)throw Error('The website did not allow access (HTTP '+response.status+')');
if(Number(response.headers.get('content-length')||0)>LIMIT)throw Error('Page too large');
const html=(await response.text()).slice(0,LIMIT);let recipe=null;
for(const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){try{recipe=findRecipe(JSON.parse(m[1]));if(recipe)break}catch{}}
let caption=(host==='www.tiktok.com'||host==='tiktok.com')?findTikTokCaption(html):'';let steps=recipe?.recipeInstructions||[];if(Array.isArray(steps))steps=steps.map(x=>typeof x==='string'?x:x.text||'').join('\n');
if((host==='www.tiktok.com'||host==='tiktok.com')&&!caption){try{const embed=await fetch('https://www.tiktok.com/oembed?url='+encodeURIComponent(u.href),{signal:AbortSignal.timeout(5000),headers:{'Accept':'application/json'}});if(embed.ok){const data=await embed.json();if(typeof data.title==='string'&&data.title.length>25)caption=data.title}}catch{}}
return res.status(200).json({title:recipe?.name||meta(html,'og:title')||'',ingredients:Array.isArray(recipe?.recipeIngredient)?recipe.recipeIngredient.join('\n'):'',instructions:recipe?String(steps):decodeEntities(caption||meta(html,'og:description')||meta(html,'description')||''),source:u.href,method:recipe?'structured-recipe':caption?'full-caption':'public-metadata',videoAnalyzed:false});
}catch(e){return res.status(422).json({error:e.message||'Could not access this link'})}
}