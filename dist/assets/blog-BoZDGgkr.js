import{i as b,d as u,a as C,g as A,h as I,u as $,y as S,q as k,c as T,w as h,z as B,l as E}from"./firebase-init-Gac7rvr-.js";/* empty css                   */import{s as L,f as v,a as M,c as R}from"./home-DxPM4LiW.js";async function H(){L();const r=new URLSearchParams(window.location.search).get("id"),e=document.getElementById("blogArticleContainer");if(e){if(!r){s(e,"No article ID provided in the URL.");return}if(!b||!u){s(e,"Firebase is not configured yet. Connect Firebase in Settings to load this article.");return}try{const i=C(u,"posts",r),n=await A(i);if(!n.exists()){s(e,"Article not found. It may have been deleted or moved.");return}const a=n.data();if(a.status!=="published"&&!localStorage.getItem("animoro_admin_user")){s(e,"This article is currently saved as a draft and is not public.");return}U(i,r,a.views||0),q(a),P(e,r,a),_(a.category,r)}catch(i){I(i,"get",`posts/${r}`),s(e,"Unable to load article. Please check your network connection.")}}}async function U(t,r,e){const i=`animoro_viewed_${r}`;if(!sessionStorage.getItem(i))try{await $(t,{views:S(1)}),sessionStorage.setItem(i,"true");const n=document.getElementById("articleViewCount");n&&(n.textContent=v(e+1)+" views")}catch(n){console.warn("Could not increment view count:",n)}}function q(t){document.title=`${t.title} — Animoro`;const r=document.querySelector('meta[name="description"]');r&&r.setAttribute("content",t.excerpt||t.title);let e=document.querySelector('meta[property="og:title"]');e&&e.setAttribute("content",t.title);let i=document.querySelector('meta[property="og:description"]');i&&i.setAttribute("content",t.excerpt||t.title);let n=document.querySelector('meta[property="og:image"]');n&&t.coverImage&&n.setAttribute("content",t.coverImage)}function c(t){return String(t??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}function p(t){if(!t||typeof t!="string")return"";const r=t.trim();return r&&(r.startsWith("data:image/")||/^https?:\/\//i.test(r))?r:""}function f(t,r){return t?`<figure class="article-inline-image-wrap"><img src="${c(t)}" alt="${c(r)}" loading="lazy" /></figure>`:""}function z(t,r,e){if(!r)return t;const i=document.createElement("div");i.innerHTML=t||"";const n=Array.from(i.children),a=document.createElement("div");a.innerHTML=f(r,e);const o=a.firstElementChild,l=Math.ceil(n.length/2);return n[l]?i.insertBefore(o,n[l]):i.append(o),i.innerHTML}function D(t){t&&(t.innerHTML=`
    <p style="padding: 24px; color: var(--text-muted); text-align: center; margin: 0;">
      Cover image could not be loaded. The saved URL may not be a direct image link or may block external websites.
    </p>
  `)}function P(t,r,e){const i=(e.tags||[]).map(g=>`<span class="tag-chip">#${c(g)}</span>`).join(""),n=window.location.href,a=p(e.coverImage),o=p(e.middleImage),l=p(e.endingImage),w=z(e.content||"",o,e.title||"Article image"),x=f(l,e.title||"Article image");t.innerHTML=`
    <header class="article-header">
      <div class="article-header-meta">
        <a href="category.html?category=${encodeURIComponent(e.category||"Anime")}" class="badge-category" style="margin-left: 0;">
          ${c(e.category||"General")}
        </a>
        <span style="color: var(--text-muted); font-size: 0.85rem;">•</span>
        <span style="color: var(--text-secondary); font-size: 0.85rem;">${M(e.publishedAt||e.createdAt)}</span>
      </div>

      <h1 class="article-page-title">${c(e.title||"Untitled Article")}</h1>
      
      ${e.excerpt?`<p class="article-excerpt-lead">${c(e.excerpt)}</p>`:""}

      <div class="article-author-bar">
        <div class="article-author-details">
          <div class="article-author-avatar-lg">
            ${(e.authorName||"A")[0].toUpperCase()}
          </div>
          <div>
            <div style="font-weight: 700; color: var(--text-primary);">${c(e.authorName||"Animoro Editor")}</div>
            <div style="font-size: 0.78rem; color: var(--text-muted);">Published in ${c(e.category||"Anime")}</div>
          </div>
        </div>

        <div style="display: flex; align-items: center; gap: 16px;">
          <div id="articleViewCount" style="display: flex; align-items: center; gap: 6px; color: var(--text-secondary); font-weight: 500;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
            <span>${v(e.views)} views</span>
          </div>
        </div>
      </div>
    </header>

    ${a?`
      <div class="article-cover-wrap">
        <img class="article-cover-img" alt="${c(e.title||"Article cover")}" referrerpolicy="no-referrer" />
      </div>
    `:""}

    <main class="article-content-container" id="articleBody">
      ${w}
      ${x}

      ${i?`<div class="article-tags-wrap"><span style="font-weight: 600; color: var(--text-muted); font-size: 0.85rem;">TAGS:</span> ${i}</div>`:""}

      <div class="article-share-bar">
        <span style="font-weight: 600; font-size: 0.88rem; color: var(--text-muted);">SHARE ARTICLE:</span>
        <button class="share-btn" id="copyShareBtn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
          <span id="copyBtnText">Copy Link</span>
        </button>
        <a class="share-btn" href="https://twitter.com/intent/tweet?text=${encodeURIComponent(e.title)}&url=${encodeURIComponent(n)}" target="_blank" rel="noopener noreferrer">
          Twitter / X
        </a>
        <a class="share-btn" href="https://reddit.com/submit?url=${encodeURIComponent(n)}&title=${encodeURIComponent(e.title)}" target="_blank" rel="noopener noreferrer">
          Reddit
        </a>
      </div>
    </main>
  `;const d=t.querySelector(".article-cover-img");d&&(d.src=a,d.onerror=()=>{const g=d.closest(".article-cover-wrap");D(g)});const y=document.getElementById("copyShareBtn"),m=document.getElementById("copyBtnText");y&&m&&y.addEventListener("click",async()=>{try{await navigator.clipboard.writeText(window.location.href),m.textContent="Copied!",setTimeout(()=>{m.textContent="Copy Link"},2500)}catch{m.textContent="Link copied"}})}async function _(t,r){const e=document.getElementById("relatedArticlesContainer");if(!(!e||!t||!u))try{const i=k(T(u,"posts"),h("status","==","published"),h("category","==",t),B(4)),a=(await E(i)).docs.filter(o=>o.id!==r).slice(0,3);if(a.length===0){const o=document.getElementById("relatedSection");o&&(o.style.display="none");return}e.innerHTML="",a.forEach(o=>{e.appendChild(R(o.id,o.data()))})}catch(i){console.warn("Could not load related articles:",i)}}function s(t,r){t.innerHTML=`
    <div class="empty-state" style="margin: 60px auto; max-width: 600px;">
      <div class="empty-state-icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
      </div>
      <h2 class="empty-state-title">Article Not Available</h2>
      <p class="empty-state-desc">${r}</p>
      <div style="margin-top: 24px;">
        <a href="index.html" class="btn-cta">Return to Homepage</a>
      </div>
    </div>
  `}document.addEventListener("DOMContentLoaded",H);
