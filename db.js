let _config = null;

async function loadConfig() {
  if (_config) return _config;
  let api = {}, file = {};
  try { const r = await fetch('/api/config'); if (r.ok) api = await r.json(); } catch(e) {}
  try { const r = await fetch('config/git_config.json'); if (r.ok) file = await r.json(); } catch(e) {}
  const apiTok = String(api.github_token || '').trim();
  const fileTok = String(file.github_token || '').trim();
  _config = {
    github_token: (apiTok && apiTok !== 'YOUR_GITHUB_TOKEN') ? apiTok : fileTok,
    github_owner: file.github_owner || '',
    github_repo: file.github_repo || '',
    data_file_path: file.data_file_path || 'data/posts.json',
    admin_password: api.admin_password || file.admin_password || 'admin1234'
  };
  return _config;
}

function isAdmin() { return sessionStorage.getItem('isAdmin') === 'true'; }
function requireAdmin() { if (!isAdmin()) { window.location.href = 'admin.html'; return false; } return true; }
function handleAgentLogin(event) { if (event) event.preventDefault(); window.location.href = 'admin.html'; }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function isSafeImageSource(src) { const value=String(src||'').trim(); return /^(?:https?:\/\/|blob:|\/|\.{1,2}\/|[A-Za-z0-9가-힣_-]+\/)[^\s)]+$/i.test(value); }
function inlineMarkdown(value) {
  let out = escapeHtml(value);
  const code = [];
  out = out.split('`').map((part, i) => i % 2 ? `\u0000${code.push(part)-1}\u0000` : part).join('');
  out = out.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (match, alt, src) => isSafeImageSource(src) ? `<img alt="${alt}" src="${src}" loading="lazy">` : match);
  out = out.replace(/\[([^\]]+)\]\(((?:https?:\/\/|mailto:)[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/~~([^~]+)~~/g, '<del>$1</del>').replace(/\*([^*]+)\*/g, '<em>$1</em>');
  out = out.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${code[Number(i)]}</code>`);
  return out;
}
function renderMarkdown(src) {
  const lines = String(src || '').replace(/\r\n?/g, '\n').split('\n');
  const html = []; let paragraph = []; let list = null; let quote = [];
  const flush = () => { if (paragraph.length) { html.push(`<p>${inlineMarkdown(paragraph.join('\n')).replace(/\n/g,'<br>')}</p>`); paragraph=[]; } if (list) { html.push(`</${list}>`); list=null; } if (quote.length) { html.push(`<blockquote>${quote.map(x=>`<p>${inlineMarkdown(x)}</p>`).join('')}</blockquote>`); quote=[]; } };
  for (const line of lines) {
    if (/^```/.test(line)) { flush(); const block=[]; while (lines.length) { const next = lines.shift(); if (next === undefined || /^```/.test(next)) break; block.push(next); } html.push(`<pre><code>${escapeHtml(block.join('\n'))}</code></pre>`); continue; }
    if (/^\s*$/.test(line)) { flush(); continue; }
    if (/^---+$/.test(line.trim())) { flush(); html.push('<hr>'); continue; }
    const heading = line.match(/^(#{1,3})\s+(.+)$/); if (heading) { flush(); html.push(`<h${heading[1].length}>${inlineMarkdown(heading[2])}</h${heading[1].length}>`); continue; }
    if (/^>\s?/.test(line)) { if (paragraph.length || list) flush(); quote.push(line.replace(/^>\s?/,'')); continue; }
    const bullet = line.match(/^\s*[-*]\s+(.+)$/); const ordered = line.match(/^\s*\d+\.\s+(.+)$/);
    if (bullet || ordered) { if (paragraph.length || quote.length) flush(); const tag=ordered?'ol':'ul'; if (list !== tag) { if (list) html.push(`</${list}>`); html.push(`<${tag}>`); list=tag; } html.push(`<li>${inlineMarkdown((bullet||ordered)[1])}</li>`); continue; }
    if (list || quote.length) flush(); paragraph.push(line);
  }
  flush(); return html.join('');
}
function markdownToText(src) { return String(src || '').replace(/```[\s\S]*?```/g,'').replace(/!\[.*?\]\(.*?\)/g,'').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/^#{1,6}\s+/gm,'').replace(/^\s*[-*>]\s?/gm,'').replace(/[*_~`]/g,'').replace(/\n+/g,' ').trim(); }
function firstMarkdownImage(src) { const match=String(src||'').match(/!\[[^\]]*\]\(([^)\s]+)\)/); return match && isSafeImageSource(match[1]) ? match[1] : ''; }
async function getPosts() { const cfg=await loadConfig(); const url=`https://api.github.com/repos/${encodeURIComponent(cfg.github_owner)}/${encodeURIComponent(cfg.github_repo)}/contents/${cfg.data_file_path}`; const headers={Accept:'application/vnd.github+json'}; if(cfg.github_token && cfg.github_token!=='YOUR_GITHUB_TOKEN') headers.Authorization='token '+String(cfg.github_token).replace(/\s+/g,''); try { const r=await fetch(url,{headers}); if(r.ok){const data=await r.json(); const raw=decodeURIComponent(escape(atob(data.content.replace(/\n/g,'')))); return JSON.parse(raw);} } catch(e) {} try { const r=await fetch(cfg.data_file_path); if(r.ok)return await r.json(); } catch(e) {} return []; }
async function savePosts(posts) { const cfg=await loadConfig(); if(!cfg.github_owner || !cfg.github_repo || !cfg.github_token || cfg.github_token==='YOUR_GITHUB_TOKEN') throw new Error('GitHub 설정이 완료되지 않았습니다.'); const url=`https://api.github.com/repos/${encodeURIComponent(cfg.github_owner)}/${encodeURIComponent(cfg.github_repo)}/contents/${cfg.data_file_path}`; const headers={Accept:'application/vnd.github+json', 'Content-Type':'application/json', Authorization:'token '+String(cfg.github_token).replace(/\s+/g,'')}; let sha; const current=await fetch(url,{headers}); if(current.ok) sha=(await current.json()).sha; const bytes=new TextEncoder().encode(JSON.stringify(posts,null,2)+'\n'); let binary=''; bytes.forEach(b=>binary+=String.fromCharCode(b)); const body={message:'chore: update posts',content:btoa(binary)}; if(sha)body.sha=sha; const r=await fetch(url,{method:'PUT',headers,body:JSON.stringify(body)}); if(!r.ok) throw new Error(`저장 실패: ${await r.text()}`); return true; }
async function uploadImage(file) { const cfg=await loadConfig(); if(!cfg.github_owner || !cfg.github_repo || !cfg.github_token || cfg.github_token==='YOUR_GITHUB_TOKEN') throw new Error('GitHub 설정이 완료되지 않았습니다.'); const safeName=String(file.name||'image.png').normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g,'-').replace(/^-+|-+$/g,'').toLowerCase()||'image.png'; const path=`data/${new Date().toISOString().slice(0,10)}-${Date.now()}-${safeName}`; const url=`https://api.github.com/repos/${encodeURIComponent(cfg.github_owner)}/${encodeURIComponent(cfg.github_repo)}/contents/${path}`; const headers={Accept:'application/vnd.github+json','Content-Type':'application/json',Authorization:'token '+String(cfg.github_token).replace(/\s+/g,'')}; const bytes=new Uint8Array(await file.arrayBuffer()); let binary=''; bytes.forEach(b=>binary+=String.fromCharCode(b)); const r=await fetch(url,{method:'PUT',headers,body:JSON.stringify({message:`content: upload ${safeName}`,content:btoa(binary)})}); if(!r.ok) throw new Error(`이미지 업로드 실패: ${await r.text()}`); return path; }
async function createPost(post) { const posts=await getPosts(); const next={...post,id:post.id||`${Date.now()}`,date:post.date||new Date().toISOString().slice(0,10)}; posts.unshift(next); await savePosts(posts); return next; }
async function updatePost(post) { const posts=await getPosts(); const index=posts.findIndex(x=>String(x.id)===String(post.id)); if(index<0)throw new Error('게시글을 찾을 수 없습니다.'); posts[index]={...posts[index],...post}; await savePosts(posts); return posts[index]; }
async function deletePost(id) { const posts=await getPosts(); await savePosts(posts.filter(x=>String(x.id)!==String(id))); }
window.loadConfig=loadConfig; window.isAdmin=isAdmin; window.requireAdmin=requireAdmin; window.handleAgentLogin=handleAgentLogin; window.renderMarkdown=renderMarkdown; window.markdownToText=markdownToText; window.firstMarkdownImage=firstMarkdownImage; window.getPosts=getPosts; window.createPost=createPost; window.updatePost=updatePost; window.deletePost=deletePost; window.uploadImage=uploadImage;
