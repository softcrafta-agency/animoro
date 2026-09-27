import{i as C,d,q as h,e as p,w as m,o as v,j as y,h as L}from"./firebase-init-xl6DJwYG.js";/* empty css                   */import{s as b,c as A}from"./home-C4I244j8.js";let u=[],E=!1;async function M(){b();const t=document.getElementById("searchInput");document.getElementById("searchResultsContainer"),document.getElementById("searchResultsCount");const e=new URLSearchParams(window.location.search).get("q")||"";t&&(t.value=e,t.addEventListener("input",s=>{f(s.target.value.trim())})),await B(),e&&f(e)}async function B(){if(!(!C||!d))try{let t,a=!1;try{const e=h(p(d,"posts"),m("status","==","published"),v("publishedAt","desc"));t=await y(e)}catch(e){console.warn("Ordered query failed in search, falling back to simple status query:",e);const s=h(p(d,"posts"),m("status","==","published"));t=await y(s),a=!0}u=t.docs.map(e=>({id:e.id,...e.data()})),a&&u.sort((e,s)=>{var o,i,c,l;const n=((i=(o=e.publishedAt)==null?void 0:o.toDate)==null?void 0:i.call(o))||new Date(e.publishedAt||e.createdAt||0);return(((l=(c=s.publishedAt)==null?void 0:c.toDate)==null?void 0:l.call(c))||new Date(s.publishedAt||s.createdAt||0))-n}),E=!0}catch(t){L(t,"list","posts")}}function f(t){const a=document.getElementById("searchResultsContainer"),e=document.getElementById("searchResultsCount");if(!a)return;if(!t){a.innerHTML=`
      <div class="empty-state" style="grid-column: 1 / -1;">
        <p class="empty-state-desc">Type keywords above to search across titles, categories, authors, and tags.</p>
      </div>
    `,e&&(e.textContent="");return}const s=t.toLowerCase(),n=u.filter(r=>{const o=(r.title||"").toLowerCase().includes(s),i=(r.excerpt||"").toLowerCase().includes(s),c=(r.category||"").toLowerCase().includes(s),l=(r.authorName||"").toLowerCase().includes(s),g=(r.tags||[]).some(w=>w.toLowerCase().includes(s));return o||i||c||l||g});if(e&&(e.textContent=`Found ${n.length} article${n.length===1?"":"s"} for "${t}"`),n.length===0){a.innerHTML=`
      <div class="empty-state" style="grid-column: 1 / -1;">
        <div class="empty-state-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
        </div>
        <h3 class="empty-state-title">No articles found.</h3>
        <p class="empty-state-desc">Try another search.</p>
      </div>
    `;return}a.innerHTML="",n.forEach(r=>{a.appendChild(A(r.id,r))})}document.addEventListener("DOMContentLoaded",M);
