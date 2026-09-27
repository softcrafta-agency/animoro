import{i as $,d as l,q as v,e as g,w as c,v as b,j as m,h as B,o as M,x as H}from"./firebase-init-xl6DJwYG.js";let u=[],d=0,x=null,k=null,E=!1;const w=6;function S(e){return e?(e.toDate?e.toDate():new Date(e)).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}):"Recent"}function C(e){const t=e||0;return t>=1e6?(t/1e6).toFixed(1)+"M":t>=1e3?(t/1e3).toFixed(1)+"K":t.toString()}async function q(){const e=document.getElementById("heroSliderContainer");if(e){if(!$||!l){L(e,"Configure Firebase in Settings to load featured stories from your database.");return}try{const t=v(g(l,"posts"),c("status","==","published"),c("featured","==",!0),b(5));let i=await m(t),r=!1;if(i.empty){const s=v(g(l,"posts"),c("status","==","published"),b(3));i=await m(s),r=!0}if(i.empty){L(e,"No featured anime stories yet. Mark published articles as featured in the Admin panel.");return}u=i.docs.map(s=>({id:s.id,...s.data()})),r?u.sort((s,a)=>{var p,y,h,T;const n=((y=(p=s.publishedAt)==null?void 0:p.toDate)==null?void 0:y.call(p))||new Date(s.publishedAt||s.createdAt||0);return(((T=(h=a.publishedAt)==null?void 0:h.toDate)==null?void 0:T.call(h))||new Date(a.publishedAt||a.createdAt||0))-n}):u.sort((s,a)=>(s.featuredOrder||99)-(a.featuredOrder||99)),F(e,u),N(e),f()}catch(t){B(t,"list","posts"),L(e,"Unable to load featured stories. Please verify your Firestore connection.")}}}function L(e,t){e.innerHTML=`
    <div class="empty-state" style="height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center;">
      <div class="empty-state-icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
        </svg>
      </div>
      <h3 class="empty-state-title">No Featured Stories</h3>
      <p class="empty-state-desc">${t}</p>
    </div>
  `}function F(e,t){const i=t.map((s,a)=>`
    <div class="slider-slide ${a===0?"active":""}" data-index="${a}">
      <img class="slide-bg" src="${s.coverImage||"https://images.unsplash.com/photo-1578632767115-351597cf2477?auto=format&fit=crop&w=1600&q=80"}" alt="${s.title}" loading="lazy" />
      <div class="slide-overlay"></div>
      <div class="slide-content">
        <span class="badge-featured">Featured Story</span>
        <span class="badge-category">${s.category||"Anime"}</span>
        <h2 class="slide-title">
          <a href="blog.html?id=${s.id}">${s.title}</a>
        </h2>
        <p class="slide-excerpt">${s.excerpt||""}</p>
        <div class="slide-meta">
          <div class="slide-meta-item">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
            <span>${s.authorName||"Animoro Editor"}</span>
          </div>
          <div class="slide-meta-item">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
            <span>${S(s.publishedAt||s.createdAt)}</span>
          </div>
          <div class="slide-meta-item">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
            <span>${C(s.views)} views</span>
          </div>
        </div>
        <a href="blog.html?id=${s.id}" class="btn-cta">
          Read Article
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
        </a>
      </div>
    </div>
  `).join(""),r=t.map((s,a)=>`
    <button class="slider-dot ${a===0?"active":""}" data-index="${a}" aria-label="Go to slide ${a+1}"></button>
  `).join("");e.innerHTML=`
    <div class="slider-track" id="sliderTrack">
      ${i}
    </div>
    <button class="slider-arrow slider-prev" id="sliderPrev" aria-label="Previous Slide">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"></polyline></svg>
    </button>
    <button class="slider-arrow slider-next" id="sliderNext" aria-label="Next Slide">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>
    </button>
    <div class="slider-dots" id="sliderDots">
      ${r}
    </div>
  `}function o(e){if(!u.length)return;const t=document.querySelectorAll(".slider-slide"),i=document.querySelectorAll(".slider-dot");e>=u.length&&(e=0),e<0&&(e=u.length-1),t.forEach((r,s)=>r.classList.toggle("active",s===e)),i.forEach((r,s)=>r.classList.toggle("active",s===e)),d=e}function f(){D(),x=setInterval(()=>{o(d+1)},5e3)}function D(){x&&(clearInterval(x),x=null)}function N(e){const t=document.getElementById("sliderPrev"),i=document.getElementById("sliderNext"),r=document.querySelectorAll(".slider-dot");t&&t.addEventListener("click",()=>{o(d-1),f()}),i&&i.addEventListener("click",()=>{o(d+1),f()}),r.forEach(n=>{n.addEventListener("click",A=>{const p=parseInt(A.currentTarget.getAttribute("data-index"),10);o(p),f()})}),e.addEventListener("mouseenter",D),e.addEventListener("mouseleave",f),window.addEventListener("keydown",n=>{n.key==="ArrowLeft"?o(d-1):n.key==="ArrowRight"&&o(d+1)});let s=0,a=0;e.addEventListener("touchstart",n=>{s=n.changedTouches[0].screenX},{passive:!0}),e.addEventListener("touchend",n=>{a=n.changedTouches[0].screenX,s-a>50?o(d+1):a-s>50&&o(d-1)},{passive:!0})}async function z(){const e=document.getElementById("latestArticlesContainer"),t=document.getElementById("loadMoreArticlesBtn");if(e){if(!$||!l){e.innerHTML=`
      <div class="empty-state" style="grid-column: 1 / -1;">
        <div class="empty-state-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
        </div>
        <h3 class="empty-state-title">No Stories Yet</h3>
        <p class="empty-state-desc">Connect Firebase and publish articles via the Admin Dashboard to see real content here.</p>
      </div>
    `,t&&(t.style.display="none");return}try{let i,r=!1;try{const a=v(g(l,"posts"),c("status","==","published"),M("publishedAt","desc"),b(w));i=await m(a)}catch(a){console.warn("Ordered query for latest articles failed, trying status filter:",a);const n=v(g(l,"posts"),c("status","==","published"));i=await m(n),r=!0}if(i.empty){e.innerHTML=`
        <div class="empty-state" style="grid-column: 1 / -1;">
          <div class="empty-state-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path></svg>
          </div>
          <h3 class="empty-state-title">No stories yet.</h3>
          <p class="empty-state-desc">Fresh anime content is coming soon.</p>
        </div>
      `,t&&(t.style.display="none");return}let s=[...i.docs];r&&(s.sort((a,n)=>{var y,h;const A=(y=a.data().publishedAt)!=null&&y.toDate?a.data().publishedAt.toDate().getTime():a.data().publishedAt?new Date(a.data().publishedAt).getTime():0;return((h=n.data().publishedAt)!=null&&h.toDate?n.data().publishedAt.toDate().getTime():n.data().publishedAt?new Date(n.data().publishedAt).getTime():0)-A}),s=s.slice(0,w)),k=s[s.length-1],e.innerHTML="",s.forEach(a=>{e.appendChild(I(a.id,a.data()))}),t&&(t.style.display=!r&&i.docs.length===w?"inline-flex":"none",t.addEventListener("click",P))}catch(i){B(i,"list","posts"),e.innerHTML=`
      <div class="empty-state" style="grid-column: 1 / -1;">
        <h3 class="empty-state-title">Unable to load articles</h3>
        <p class="empty-state-desc">Please check your Firebase connection and permissions.</p>
      </div>
    `}}}async function P(){if(!k||E||!l)return;E=!0;const e=document.getElementById("loadMoreArticlesBtn");e&&(e.textContent="Loading...");try{const t=v(g(l,"posts"),c("status","==","published"),M("publishedAt","desc"),H(k),b(w)),i=await m(t),r=document.getElementById("latestArticlesContainer");i.empty||(k=i.docs[i.docs.length-1],i.forEach(s=>{r.appendChild(I(s.id,s.data()))})),e&&(e.textContent="Load More Stories",i.docs.length<w&&(e.style.display="none"))}catch(t){B(t,"list","posts")}finally{E=!1}}function I(e,t){const i=document.createElement("article");return i.className="article-card",i.innerHTML=`
    <a href="blog.html?id=${e}" class="card-img-wrap">
      <img class="card-img" src="${t.coverImage||"https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?auto=format&fit=crop&w=800&q=80"}" alt="${t.title}" loading="lazy" />
      <span class="card-category-badge">${t.category||"General"}</span>
      <span class="card-views-badge">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
        ${C(t.views)}
      </span>
    </a>
    <div class="card-body">
      <div class="card-meta">
        <span>${S(t.publishedAt||t.createdAt)}</span>
      </div>
      <h3 class="card-title">
        <a href="blog.html?id=${e}">${t.title}</a>
      </h3>
      <p class="card-excerpt">${t.excerpt||""}</p>
      <div class="card-footer">
        <div class="author-info">
          <div class="author-avatar">${(t.authorName||"A")[0].toUpperCase()}</div>
          <span>${t.authorName||"Animoro Editor"}</span>
        </div>
        <a href="blog.html?id=${e}" style="color: var(--accent-crimson); font-weight: 600; display: flex; align-items: center; gap: 4px;">
          Read
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
        </a>
      </div>
    </div>
  `,i}async function R(){const e=document.getElementById("trendingList");if(e){if(!$||!l){e.innerHTML=`
      <div class="empty-state" style="padding: 32px 16px;">
        <p class="empty-state-desc">Trending stories will appear as readers discover Animoro.</p>
      </div>
    `;return}try{let t,i=!1;try{const s=v(g(l,"posts"),c("status","==","published"),M("views","desc"),b(5));t=await m(s)}catch(s){console.warn("Trending posts query with orderBy failed, using status filter:",s);const a=v(g(l,"posts"),c("status","==","published"));t=await m(a),i=!0}if(t.empty){e.innerHTML=`
        <div class="empty-state" style="padding: 32px 16px;">
          <p class="empty-state-desc">Trending stories will appear as readers discover Animoro.</p>
        </div>
      `;return}let r=[...t.docs];i&&(r.sort((s,a)=>(a.data().views||0)-(s.data().views||0)),r=r.slice(0,5)),e.innerHTML=r.map((s,a)=>{const n=s.data();return`
        <div class="trending-item">
          <span class="trending-rank">0${a+1}</span>
          <img class="trending-thumb" src="${n.coverImage||"https://images.unsplash.com/photo-1578632767115-351597cf2477?auto=format&fit=crop&w=200&q=80"}" alt="${n.title}" loading="lazy" />
          <div class="trending-info">
            <span class="trending-category">${n.category||"Anime"}</span>
            <h4 class="trending-title">
              <a href="blog.html?id=${s.id}">${n.title}</a>
            </h4>
            <div class="trending-views">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
              <span>${C(n.views)} views</span>
            </div>
          </div>
        </div>
      `}).join("")}catch(t){B(t,"list","posts"),e.innerHTML=`
      <div class="empty-state" style="padding: 24px 16px;">
        <p class="empty-state-desc">Trending stories will appear as readers discover Animoro.</p>
      </div>
    `}}}function j(){const e=document.getElementById("hamburgerBtn"),t=document.getElementById("mobileNavDrawer"),i=document.getElementById("mobileBackdrop"),r=document.getElementById("drawerCloseBtn");if(!e||!t||!i)return;function s(){t.classList.add("open"),i.classList.add("show"),document.body.style.overflow="hidden"}function a(){t.classList.remove("open"),i.classList.remove("show"),document.body.style.overflow=""}e.addEventListener("click",s),i.addEventListener("click",a),r&&r.addEventListener("click",a)}document.addEventListener("DOMContentLoaded",()=>{j(),q(),z(),R()});export{S as a,I as c,C as f,j as s};
