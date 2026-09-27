import{i as v,d as c,q as y,e as h,w as r,o as b,j as f,h as A}from"./firebase-init-xl6DJwYG.js";/* empty css                   */import{s as C,c as E}from"./home-C4I244j8.js";const k={"Anime News":"Breaking news, seasonal announcements, studio updates, and production insights.",Reviews:"Critical analyses, spoiler-free breakdowns, and in-depth episodic reviews.",Rankings:"Community top tier lists, best-of-season countdowns, and iconic character rankings.",Guides:"Watch orders, beginner roadmaps, lore explanations, and manga reading companions.",Recommendations:"Handpicked anime recommendations curated by genre, mood, and storytelling caliber.",Manga:"Manga chapter discussions, adaptations comparison, and light novel spotlights.","Seasonal Anime":"Previews, schedules, and essential guides for current and upcoming anime seasons."};async function M(){C();const t=new URLSearchParams(window.location.search).get("category")||"Anime News",d=document.getElementById("categoryTitle"),l=document.getElementById("categoryDescription"),s=document.getElementById("categoryArticlesContainer");if(d&&(d.textContent=t),l&&(l.textContent=k[t]||`Explore all editorial coverage, analysis, and stories in ${t}.`),document.title=`${t} — Animoro`,!!s){if(!v||!c){s.innerHTML=`
      <div class="empty-state" style="grid-column: 1 / -1;">
        <h3 class="empty-state-title">No articles found</h3>
        <p class="empty-state-desc">Configure Firebase in the Admin panel to load stories in this category.</p>
      </div>
    `;return}try{let a,p=!1;try{const e=y(h(c,"posts"),r("status","==","published"),r("category","==",t),b("publishedAt","desc"));a=await f(e)}catch(e){console.warn("Compound index query failed for category, using fallback query:",e);const n=y(h(c,"posts"),r("status","==","published"),r("category","==",t));a=await f(n),p=!0}if(a.empty){s.innerHTML=`
        <div class="empty-state" style="grid-column: 1 / -1;">
          <div class="empty-state-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path></svg>
          </div>
          <h3 class="empty-state-title">No stories yet</h3>
          <p class="empty-state-desc">No articles published in ${t} yet. Fresh content is coming soon.</p>
        </div>
      `;return}let m=a.docs.map(e=>({id:e.id,...e.data()}));p&&m.sort((e,n)=>{var i,u,o,g;const w=((u=(i=e.publishedAt)==null?void 0:i.toDate)==null?void 0:u.call(i))||new Date(e.publishedAt||e.createdAt||0);return(((g=(o=n.publishedAt)==null?void 0:o.toDate)==null?void 0:g.call(o))||new Date(n.publishedAt||n.createdAt||0))-w}),s.innerHTML="",m.forEach(e=>{s.appendChild(E(e.id,e))})}catch(a){A(a,"list","posts"),s.innerHTML=`
      <div class="empty-state" style="grid-column: 1 / -1;">
        <h3 class="empty-state-title">Unable to load category</h3>
        <p class="empty-state-desc">Please verify your Firestore index configuration.</p>
      </div>
    `}}}document.addEventListener("DOMContentLoaded",M);
