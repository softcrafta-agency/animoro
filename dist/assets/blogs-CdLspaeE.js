import{i as k,d as v,w as h,o as S,v as M,x as F,q as C,e as D,j as T,h as P}from"./firebase-init-xl6DJwYG.js";/* empty css                   */import{s as x,c as H}from"./home-C4I244j8.js";let i="all",p="latest",m=null,b=!1;const A=9;async function q(){x();const t=new URLSearchParams(window.location.search).get("category");t&&(i=t),I(),y(!0)}function I(){const a=document.querySelectorAll(".filter-pill");a.forEach(e=>{e.getAttribute("data-category")===i&&(a.forEach(l=>l.classList.remove("active")),e.classList.add("active")),e.addEventListener("click",()=>{a.forEach(l=>l.classList.remove("active")),e.classList.add("active"),i=e.getAttribute("data-category"),y(!0)})});const t=document.getElementById("sortFilterSelect");t&&t.addEventListener("change",e=>{p=e.target.value,y(!0)});const s=document.getElementById("loadMoreBlogsBtn");s&&s.addEventListener("click",()=>y(!1))}async function y(a=!1){const t=document.getElementById("blogsGridContainer"),s=document.getElementById("loadMoreBlogsBtn");if(!(!t||b)){if(a&&(m=null,t.innerHTML=`
      <div class="empty-state" style="grid-column: 1 / -1;">
        <p class="empty-state-desc">Loading anime stories from Animoro...</p>
      </div>
    `),!k||!v){t.innerHTML=`
      <div class="empty-state" style="grid-column: 1 / -1;">
        <div class="empty-state-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path></svg>
        </div>
        <h3 class="empty-state-title">No Stories Published Yet</h3>
        <p class="empty-state-desc">Connect Firebase in Settings and publish your first article from the Admin Panel.</p>
      </div>
    `,s&&(s.style.display="none");return}b=!0,s&&(s.textContent="Loading stories...");try{let e="publishedAt",f="desc";p==="popular"?(e="views",f="desc"):p==="oldest"&&(e="publishedAt",f="asc");let l=[h("status","==","published"),S(e,f),M(A)];i&&i!=="all"&&l.unshift(h("category","==",i)),m&&!a&&l.push(F(m));let c,g=!1;try{const o=C(D(v,"posts"),...l);c=await T(o)}catch(o){console.warn("Ordered query in blogs.js failed, attempting status fallback:",o);const d=[h("status","==","published")];i&&i!=="all"&&d.push(h("category","==",i)),d.push(M(50));const r=C(D(v,"posts"),...d);c=await T(r),g=!0}if(a&&(t.innerHTML=""),c.empty&&a){t.innerHTML=`
        <div class="empty-state" style="grid-column: 1 / -1;">
          <h3 class="empty-state-title">No stories found</h3>
          <p class="empty-state-desc">There are no articles published in this category yet. Check back soon!</p>
        </div>
      `,s&&(s.style.display="none");return}let n=[...c.docs];g&&(n.sort((o,d)=>{var w,B;const r=o.data(),u=d.data();if(p==="popular")return(u.views||0)-(r.views||0);const L=(w=r.publishedAt)!=null&&w.toDate?r.publishedAt.toDate().getTime():r.publishedAt?new Date(r.publishedAt).getTime():0,E=(B=u.publishedAt)!=null&&B.toDate?u.publishedAt.toDate().getTime():u.publishedAt?new Date(u.publishedAt).getTime():0;return p==="oldest"?L-E:E-L}),n=n.slice(0,A)),n.length>0&&(m=n[n.length-1],n.forEach(o=>{t.appendChild(H(o.id,o.data()))})),s&&(s.textContent="Load More Articles",s.style.display=!g&&c.docs.length===A?"inline-flex":"none")}catch(e){P(e,"list","posts"),a&&(t.innerHTML=`
        <div class="empty-state" style="grid-column: 1 / -1;">
          <h3 class="empty-state-title">Unable to load stories</h3>
          <p class="empty-state-desc">Please verify your Firebase configuration and Firestore index rules.</p>
        </div>
      `)}finally{b=!1}}}document.addEventListener("DOMContentLoaded",q);
