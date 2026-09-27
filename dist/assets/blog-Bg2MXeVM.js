import{i as h,d as m,a as v,g as y,h as f,u as w,r as x,q as b,c as C,w as g,v as A,j as I}from"./firebase-init-C3KedycE.js";/* empty css                   */import{s as $,f as p,a as S,c as k}from"./home-yGCf56Is.js";async function B(){$();const r=new URLSearchParams(window.location.search).get("id"),e=document.getElementById("blogArticleContainer");if(e){if(!r){s(e,"No article ID provided in the URL.");return}if(!h||!m){s(e,"Firebase is not configured yet. Connect Firebase in Settings to load this article.");return}try{const i=v(m,"posts",r),n=await y(i);if(!n.exists()){s(e,"Article not found. It may have been deleted or moved.");return}const o=n.data();if(o.status!=="published"&&!localStorage.getItem("animoro_admin_user")){s(e,"This article is currently saved as a draft and is not public.");return}T(i,r,o.views||0),E(o),U(e,r,o),q(o.category,r)}catch(i){f(i,"get",`posts/${r}`),s(e,"Unable to load article. Please check your network connection.")}}}async function T(t,r,e){const i=`animoro_viewed_${r}`;if(!sessionStorage.getItem(i))try{await w(t,{views:x(1)}),sessionStorage.setItem(i,"true");const n=document.getElementById("articleViewCount");n&&(n.textContent=p(e+1)+" views")}catch(n){console.warn("Could not increment view count:",n)}}function E(t){document.title=`${t.title} — Animoro`;const r=document.querySelector('meta[name="description"]');r&&r.setAttribute("content",t.excerpt||t.title);let e=document.querySelector('meta[property="og:title"]');e&&e.setAttribute("content",t.title);let i=document.querySelector('meta[property="og:description"]');i&&i.setAttribute("content",t.excerpt||t.title);let n=document.querySelector('meta[property="og:image"]');n&&t.coverImage&&n.setAttribute("content",t.coverImage)}function c(t){return String(t??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}function L(t){if(!t||typeof t!="string")return"";const r=t.trim();return r&&(r.startsWith("data:image/")||/^https?:\/\//i.test(r))?r:""}function R(t){t&&(t.innerHTML=`
    <p style="padding: 24px; color: var(--text-muted); text-align: center; margin: 0;">
      Cover image could not be loaded. The saved URL may not be a direct image link or may block external websites.
    </p>
  `)}function U(t,r,e){const i=(e.tags||[]).map(d=>`<span class="tag-chip">#${c(d)}</span>`).join(""),n=window.location.href,o=L(e.coverImage);t.innerHTML=`
    <header class="article-header">
      <div class="article-header-meta">
        <a href="category.html?category=${encodeURIComponent(e.category||"Anime")}" class="badge-category" style="margin-left: 0;">
          ${c(e.category||"General")}
        </a>
        <span style="color: var(--text-muted); font-size: 0.85rem;">•</span>
        <span style="color: var(--text-secondary); font-size: 0.85rem;">${S(e.publishedAt||e.createdAt)}</span>
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
            <span>${p(e.views)} views</span>
          </div>
        </div>
      </div>
    </header>

    ${o?`
      <div class="article-cover-wrap">
        <img class="article-cover-img" alt="${c(e.title||"Article cover")}" referrerpolicy="no-referrer" />
      </div>
    `:""}

    <main class="article-content-container" id="articleBody">
      ${e.content||""}

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
  `;const a=t.querySelector(".article-cover-img");a&&(a.src=o,a.onerror=()=>{const d=a.closest(".article-cover-wrap");R(d)});const u=document.getElementById("copyShareBtn"),l=document.getElementById("copyBtnText");u&&l&&u.addEventListener("click",async()=>{try{await navigator.clipboard.writeText(window.location.href),l.textContent="Copied!",setTimeout(()=>{l.textContent="Copy Link"},2500)}catch{l.textContent="Link copied"}})}async function q(t,r){const e=document.getElementById("relatedArticlesContainer");if(!(!e||!t||!m))try{const i=b(C(m,"posts"),g("status","==","published"),g("category","==",t),A(4)),o=(await I(i)).docs.filter(a=>a.id!==r).slice(0,3);if(o.length===0){const a=document.getElementById("relatedSection");a&&(a.style.display="none");return}e.innerHTML="",o.forEach(a=>{e.appendChild(k(a.id,a.data()))})}catch(i){console.warn("Could not load related articles:",i)}}function s(t,r){t.innerHTML=`
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
  `}document.addEventListener("DOMContentLoaded",B);
