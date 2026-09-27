import{i as $,d,q as h,c as g,o as T,l as p,b as S,w as A,h as w,u as q,a as B,m as z,n as D,e as M,t as F}from"./firebase-init-Gac7rvr-.js";import{r as P,a as H}from"./auth-DUH04vjC.js";import{f as E,a as x}from"./home-DxPM4LiW.js";let l=[],v="all",b="";async function O(a=()=>{}){var t,i;const e=document.getElementById("adminPostsTableBody");if(e){if(!$||!d){e.innerHTML=`
      <tr>
        <td colspan="8" style="text-align: center; padding: 36px; color: var(--text-secondary);">
          Firebase has not been configured with VITE_FIREBASE_* environment variables. Add the values and redeploy.
        </td>
      </tr>
    `,a({total:0,published:0,draft:0,featured:0,totalViews:0});return}e.innerHTML=`
    <tr>
      <td colspan="8" style="text-align: center; padding: 28px; color: var(--text-muted);">
        Fetching articles from Cloud Firestore...
      </td>
    </tr>
  `;try{let r;try{const n=h(g(d,"posts"),T("createdAt","desc"));r=await p(n)}catch(n){console.warn("Query with orderBy failed, attempting fallback collection query:",n);try{const o=h(g(d,"posts"));r=await p(o)}catch(o){const c=(t=S)==null?void 0:t.currentUser;if(c){console.warn("Full collection query failed, trying authorId query fallback:",o);try{const u=h(g(d,"posts"),A("authorId","==",c.uid));r=await p(u)}catch(u){console.warn("Author query failed, attempting published status query:",u);const m=h(g(d,"posts"),A("status","==","published"));r=await p(m)}}else throw o}}l=r.docs.map(n=>({id:n.id,...n.data()})),l.sort((n,o)=>{const c=u=>{const m=u.createdAt||u.publishedAt;return m?m.toDate?m.toDate().getTime():new Date(m).getTime():0};return c(o)-c(n)});const s={total:l.length,published:l.filter(n=>n.status==="published").length,draft:l.filter(n=>n.status==="draft").length,featured:l.filter(n=>n.featured===!0).length,totalViews:l.reduce((n,o)=>n+(o.views||0),0)};a(s,l),y(),I()}catch(r){w(r,"list","posts");try{a({total:0,published:0,draft:0,featured:0,totalViews:0},[])}catch(n){console.warn("Could not fire stats callback on error:",n)}const s=((i=r==null?void 0:r.message)==null?void 0:i.includes("permission"))||(r==null?void 0:r.code)==="permission-denied";e.innerHTML=`
      <tr>
        <td colspan="8" style="text-align: center; padding: 36px 20px; color: var(--text-primary);">
          <div style="max-width: 620px; margin: 0 auto;">
            <div style="font-size: 1.1rem; font-weight: 700; color: #f87171; margin-bottom: 8px;">
              ${s?"Firestore Permission Denied (firestore.rules)":"Unable to load articles"}
            </div>
            <p style="color: var(--text-secondary); font-size: 0.9rem; line-height: 1.6; margin-bottom: 16px;">
              ${s?"Your Firebase Firestore database rejected the read request for the 'posts' collection. To resolve this, ensure the project's <strong>firestore.rules</strong> are deployed in your Firebase Console (Rules tab).":(r==null?void 0:r.message)||"An error occurred while fetching posts from Cloud Firestore."}
            </p>
            <div style="display: flex; gap: 12px; justify-content: center; flex-wrap: wrap;">
              <a href="#settings" class="btn-cta" style="padding: 8px 16px; font-size: 0.85rem;" onclick="document.querySelector('[data-tab=settings]')?.click()">
                Copy Firestore Rules in Settings &rarr;
              </a>
              <button class="action-btn-sm" style="padding: 8px 16px; font-size: 0.85rem;" onclick="window.location.reload()">
                Retry Connection
              </button>
            </div>
          </div>
        </td>
      </tr>
    `}}}function V(){const a=document.querySelectorAll(".post-filter-btn");a.forEach(t=>{t.addEventListener("click",()=>{a.forEach(i=>i.classList.remove("active")),t.classList.add("active"),v=t.getAttribute("data-filter"),y()})});const e=document.getElementById("postsSearchInput");e&&e.addEventListener("input",t=>{b=t.target.value.toLowerCase().trim(),y()})}function y(){const a=document.getElementById("adminPostsTableBody");if(!a)return;let e=l;if(v==="published"?e=e.filter(t=>t.status==="published"):v==="draft"?e=e.filter(t=>t.status==="draft"):v==="featured"&&(e=e.filter(t=>t.featured===!0)),b&&(e=e.filter(t=>(t.title||"").toLowerCase().includes(b)||(t.category||"").toLowerCase().includes(b))),e.length===0){a.innerHTML=`
      <tr>
        <td colspan="8" style="text-align: center; padding: 40px; color: var(--text-muted);">
          No articles match the current filter or search criteria.
        </td>
      </tr>
    `;return}a.innerHTML=e.map(t=>{const i=t.status==="published";return`
      <tr data-id="${t.id}">
        <td>
          <img class="table-thumb" src="${t.coverImage||"https://images.unsplash.com/photo-1578632767115-351597cf2477?auto=format&fit=crop&w=120&q=80"}" alt="${t.title}" />
        </td>
        <td>
          <div style="font-weight: 600; color: var(--text-primary); max-width: 280px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
            ${t.title}
          </div>
          <div style="font-size: 0.75rem; color: var(--text-muted); font-family: var(--font-mono);">
            /blog/${t.slug||t.id}
          </div>
        </td>
        <td>
          <span style="font-size: 0.8rem; font-weight: 600; color: var(--text-secondary);">${t.category||"Anime"}</span>
        </td>
        <td>
          <span class="status-pill ${i?"published":"draft"}">
            ${t.status||"draft"}
          </span>
        </td>
        <td>
          <button class="action-btn-sm toggle-featured-btn" data-id="${t.id}" data-featured="${t.featured?"true":"false"}" title="Toggle Featured in Hero Slider">
            ${t.featured?"⭐ Yes (# "+(t.featuredOrder||1)+")":"☆ No"}
          </button>
        </td>
        <td>
          <span style="font-family: var(--font-mono); font-weight: 600;">${E(t.views)}</span>
        </td>
        <td>
          <span style="font-size: 0.8rem;">${x(t.publishedAt||t.createdAt)}</span>
        </td>
        <td>
          <div class="table-actions">
            <a href="admin-post-editor.html?id=${t.id}" class="action-btn-sm" title="Edit Article">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
              Edit
            </a>
            ${i?`
              <a href="blog.html?id=${t.id}" target="_blank" class="action-btn-sm" title="View Published Article">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
              </a>
            `:""}
            <button class="action-btn-sm delete delete-post-btn" data-id="${t.id}" data-title="${t.title}" title="Delete Article">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </div>
        </td>
      </tr>
    `}).join(""),R()}function R(){document.querySelectorAll(".delete-post-btn").forEach(a=>{a.addEventListener("click",e=>{const t=e.currentTarget.getAttribute("data-id"),i=e.currentTarget.getAttribute("data-title");j(t,i)})}),document.querySelectorAll(".toggle-featured-btn").forEach(a=>{a.addEventListener("click",async e=>{const t=e.currentTarget.getAttribute("data-id"),i=e.currentTarget.getAttribute("data-featured")==="true";await k(t,!i)})})}async function k(a,e){if(d)try{await q(B(d,"posts",a),{featured:e,featuredOrder:e?1:99});const t=l.find(i=>i.id===a);t&&(t.featured=e,t.featuredOrder=e?1:99),y(),I()}catch(t){w(t,"update",`posts/${a}`),alert("Could not update featured status. Check permissions.")}}function I(){const a=document.getElementById("featuredSliderManagerList");if(!a)return;const e=l.filter(t=>t.featured===!0).sort((t,i)=>(t.featuredOrder||1)-(i.featuredOrder||1));if(e.length===0){a.innerHTML=`
      <div class="empty-state" style="padding: 32px 16px;">
        <h4 class="empty-state-title">No Articles in Hero Slider</h4>
        <p class="empty-state-desc">Click the ⭐ icon in the Posts table to add stories to the homepage slider.</p>
      </div>
    `;return}a.innerHTML=e.map((t,i)=>`
    <div style="display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); margin-bottom: 10px;">
      <div style="display: flex; align-items: center; gap: 14px;">
        <span style="font-weight: 800; color: var(--accent-crimson); font-family: var(--font-display);">Slide ${i+1}</span>
        <img src="${t.coverImage||"https://images.unsplash.com/photo-1578632767115-351597cf2477?auto=format&fit=crop&w=100&q=80"}" style="width: 50px; height: 36px; object-fit: cover; border-radius: var(--radius-sm);" />
        <div>
          <div style="font-weight: 600; color: var(--text-primary); font-size: 0.9rem;">${t.title}</div>
          <div style="font-size: 0.78rem; color: var(--text-muted);">${t.category||"Anime"}</div>
        </div>
      </div>
      <div style="display: flex; align-items: center; gap: 10px;">
        <button class="action-btn-sm toggle-featured-btn" data-id="${t.id}" data-featured="true" style="color: #ef4444; border-color: rgba(239,68,68,0.3);">
          Remove from Slider
        </button>
      </div>
    </div>
  `).join(""),a.querySelectorAll(".toggle-featured-btn").forEach(t=>{t.addEventListener("click",async i=>{const r=i.currentTarget.getAttribute("data-id");await k(r,!1)})})}function j(a,e){const t=document.getElementById("deletePostModal"),i=document.getElementById("deletePostModalTitle"),r=document.getElementById("confirmDeletePostBtn"),s=document.getElementById("cancelDeletePostBtn");if(!t){confirm(`Are you sure you want to delete "${e}"? This cannot be undone.`)&&C(a);return}i&&(i.textContent=`"${e}"`),t.classList.add("show");const n=async()=>{r.removeEventListener("click",n),s.removeEventListener("click",o),t.classList.remove("show"),await C(a)},o=()=>{r.removeEventListener("click",n),s.removeEventListener("click",o),t.classList.remove("show")};r.addEventListener("click",n),s.addEventListener("click",o)}async function C(a){if(d)try{await z(B(d,"posts",a)),l=l.filter(e=>e.id!==a),y(),I()}catch(e){w(e,"delete",`posts/${a}`),alert("Delete failed. Make sure you have administrator permissions.")}}function N(a,e){const t=document.getElementById(a);if(!t)return;if(!e||e.length===0){t.innerHTML=`
      <div class="empty-state" style="padding: 40px 16px;">
        <h4 class="empty-state-title">No Performance Data Yet</h4>
        <p class="empty-state-desc">Articles published and viewed by readers will be graphed here with real view counts.</p>
      </div>
    `;return}const i=[...e].sort((n,o)=>(o.views||0)-(n.views||0)).slice(0,6),r=Math.max(...i.map(n=>n.views||0),1),s=i.map((n,o)=>{const c=n.views||0,u=Math.max(Math.round(c/r*100),4),m=(n.title||"Untitled").length>24?(n.title||"").substring(0,24)+"...":n.title;return`
      <div style="display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px;">
        <div style="display: flex; justify-content: space-between; font-size: 0.84rem;">
          <span style="color: var(--text-primary); font-weight: 600;">${o+1}. ${m}</span>
          <span style="color: var(--accent-crimson); font-family: var(--font-mono); font-weight: 700;">${c} view${c===1?"":"s"}</span>
        </div>
        <div style="width: 100%; height: 10px; background: rgba(255,255,255,0.05); border-radius: 9999px; overflow: hidden;">
          <div style="width: ${u}%; height: 100%; background: linear-gradient(90deg, var(--accent-crimson), #f43f5e); border-radius: 9999px; transition: width 0.6s cubic-bezier(0.16, 1, 0.3, 1);"></div>
        </div>
      </div>
    `}).join("");t.innerHTML=`
    <div style="padding: 10px 0;">
      ${s}
    </div>
  `}async function U(){P(async a=>{_(a),Q(),V(),W(),G();const e=document.getElementById("adminLogoutBtn");e&&e.addEventListener("click",H),await Y()})}function _(a){const e=document.getElementById("adminUserEmail");e&&(e.textContent=a?a.email:"Setup Mode")}function Q(){const a=document.querySelectorAll(".admin-nav-item"),e=document.querySelectorAll(".admin-tab-pane"),t=document.getElementById("adminViewTitle");function i(s){if(a.forEach(n=>{n.classList.toggle("active",n.getAttribute("data-tab")===s)}),e.forEach(n=>{n.style.display=n.id===`tab-${s}`?"block":"none"}),t){const n={overview:"Dashboard Overview",posts:"Articles Management",categories:"Categories Manager",slider:"Featured Slider Manager",contacts:"Contact Inquiries",settings:"System Settings"};t.textContent=n[s]||"Dashboard"}window.location.hash=s}a.forEach(s=>{s.addEventListener("click",()=>{const n=s.getAttribute("data-tab");i(n)})});const r=window.location.hash.replace("#","")||"overview";i(r)}async function Y(){await O((a,e)=>{f("kpiTotalPosts",a.total),f("kpiTotalViews",E(a.totalViews)),f("kpiPublished",a.published),f("kpiDrafts",a.draft),f("kpiFeatured",a.featured),N("analyticsChartContainer",e.filter(t=>t.status==="published")),K(e)}),L(),X()}function f(a,e){const t=document.getElementById(a);t&&(t.textContent=e!==void 0?e:"0")}function K(a){const e=document.getElementById("topPerformingTableBody");if(!e)return;const t=a.filter(i=>i.status==="published").sort((i,r)=>(r.views||0)-(i.views||0)).slice(0,5);if(t.length===0){e.innerHTML=`
      <tr>
        <td colspan="6" style="text-align: center; padding: 28px; color: var(--text-muted);">
          No published articles to display. Published articles will be ranked here by real reader views.
        </td>
      </tr>
    `;return}e.innerHTML=t.map((i,r)=>`
    <tr>
      <td style="font-weight: 800; color: var(--accent-crimson);">#${r+1}</td>
      <td>
        <div style="font-weight: 600; color: var(--text-primary);">${i.title}</div>
      </td>
      <td>${i.category||"Anime"}</td>
      <td style="font-family: var(--font-mono); font-weight: 700; color: #fff;">${E(i.views)} views</td>
      <td>${x(i.publishedAt||i.createdAt)}</td>
      <td><span class="status-pill published">Published</span></td>
    </tr>
  `).join("")}function W(){const a=document.getElementById("addCategoryForm");a&&a.addEventListener("submit",async e=>{e.preventDefault();const t=document.getElementById("newCategoryName"),i=document.getElementById("newCategoryDesc"),r=t.value.trim(),s=i.value.trim();if(r){if(!d){alert("Firebase is not connected yet.");return}try{await D(g(d,"categories"),{name:r,slug:r.toLowerCase().replace(/\s+/g,"-"),description:s,createdAt:M()}),t.value="",i.value="",L(),alert(`Category "${r}" added successfully.`)}catch(n){w(n,"create","categories"),alert("Could not add category: "+n.message)}}})}async function L(){const a=document.getElementById("categoriesTableBody");if(!(!a||!d))try{const e=await p(g(d,"categories"));if(f("kpiCategories",e.size),e.empty){a.innerHTML=`
        <tr>
          <td colspan="4" style="text-align: center; padding: 24px; color: var(--text-muted);">
            No custom categories registered in Firestore yet.
          </td>
        </tr>
      `;return}a.innerHTML=e.docs.map(t=>{const i=t.data();return`
        <tr>
          <td style="font-weight: 600; color: var(--text-primary);">${i.name}</td>
          <td style="font-family: var(--font-mono); font-size: 0.82rem; color: var(--text-muted);">${i.slug}</td>
          <td>${i.description||"—"}</td>
          <td>${x(i.createdAt)}</td>
        </tr>
      `}).join("")}catch(e){console.warn("Could not load categories collection:",e)}}async function X(){const a=document.getElementById("contactsTableBody");if(!(!a||!d))try{const e=h(g(d,"contacts"),T("createdAt","desc")),t=await p(e);if(t.empty){a.innerHTML=`
        <tr>
          <td colspan="5" style="text-align: center; padding: 32px; color: var(--text-muted);">
            No inquiries received yet. Messages sent via contact.html will appear here.
          </td>
        </tr>
      `;return}a.innerHTML=t.docs.map(i=>{const r=i.data();return`
        <tr>
          <td><span style="font-size: 0.8rem;">${x(r.createdAt)}</span></td>
          <td style="font-weight: 600; color: var(--text-primary);">${r.name}</td>
          <td><a href="mailto:${r.email}" style="color: var(--accent-crimson);">${r.email}</a></td>
          <td style="font-weight: 600;">${r.subject||"—"}</td>
          <td style="max-width: 320px; font-size: 0.84rem; color: var(--text-secondary);">${r.message}</td>
        </tr>
      `}).join("")}catch(e){console.warn("Could not load contact messages:",e)}}function G(){const a=document.getElementById("testFirebaseBtn"),e=document.getElementById("testConnectionResult");e&&($?(e.textContent="Firebase is configured from VITE_FIREBASE_* environment variables.",e.style.color="#34d399"):(e.textContent="Firebase config is not available yet. Add the VITE_FIREBASE_* values in .env or Vercel and redeploy.",e.style.color="#fbbf24")),a&&a.addEventListener("click",async()=>{e.textContent="Testing connection to Cloud Firestore...",e.style.color="var(--text-muted)";const s=await F();e.textContent=s.message,e.style.color=s.success?"#34d399":"#f87171"});const t=document.getElementById("copyFirestoreRulesBtn"),i=document.getElementById("firestoreRulesPre"),r=`rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Global Helpers
    function isSignedIn() {
      return request.auth != null;
    }

    function isAdmin() {
      return isSignedIn() && (
        request.auth.uid == 'X5WFM4C88cecVqry3wr4luIIVAv1' ||
        (request.auth.token.email != null && (
          request.auth.token.email == 'softcrafta@gmail.com' ||
          request.auth.token.email == 'Softcrafta@gmail.com' ||
          request.auth.token.email.lower() == 'softcrafta@gmail.com'
        ))
      );
    }

    function isSuperOrDocAdmin() {
      return isAdmin() || (isSignedIn() && exists(/databases/$(database)/documents/admins/$(request.auth.uid)));
    }

    function incoming() {
      return request.resource.data;
    }

    function existing() {
      return resource.data;
    }

    function isValidPost(data) {
      return data.title is string && data.title.size() > 0 && data.title.size() <= 200 &&
             data.slug is string && data.slug.size() > 0 && data.slug.size() <= 200 &&
             data.content is string && data.content.size() > 0 && data.content.size() <= 100000 &&
             data.category is string && data.category.size() <= 100 &&
             (data.status == 'draft' || data.status == 'published') &&
             (!('excerpt' in data) || (data.excerpt is string && data.excerpt.size() <= 1000)) &&
             (!('coverImage' in data) || data.coverImage == null || (data.coverImage is string && data.coverImage.size() <= 250000)) &&
             (!('middleImage' in data) || data.middleImage == null || (data.middleImage is string && data.middleImage.size() <= 250000)) &&
             (!('endingImage' in data) || data.endingImage == null || (data.endingImage is string && data.endingImage.size() <= 250000)) &&
             (!('tags' in data) || data.tags is list) &&
             (!('featured' in data) || data.featured is bool) &&
             (!('featuredOrder' in data) || data.featuredOrder is number) &&
             (!('views' in data) || data.views is number) &&
             (!('authorId' in data) || (data.authorId is string && data.authorId.size() <= 128)) &&
             (!('authorEmail' in data) || (data.authorEmail is string && data.authorEmail.size() <= 200)) &&
             (!('authorName' in data) || (data.authorName is string && data.authorName.size() <= 100));
    }

    // Posts Collection
    match /posts/{postId} {
      allow get: if (resource.data.status == 'published') ||
                    isSuperOrDocAdmin() ||
                    (isSignedIn() && resource.data.authorId == request.auth.uid);
      allow list: if (resource.data.status == 'published') ||
                     isAdmin() ||
                     (isSignedIn() && resource.data.authorId == request.auth.uid);
      allow create: if isSuperOrDocAdmin() || (isSignedIn() && incoming().authorId == request.auth.uid);
      allow update: if isSuperOrDocAdmin() ||
                       (isSignedIn() && resource.data.authorId == request.auth.uid) ||
                       (resource.data.status == 'published' &&
                        incoming().diff(existing()).affectedKeys().hasOnly(['views']) &&
                        incoming().views == existing().views + 1);
      allow delete: if isSuperOrDocAdmin() || (isSignedIn() && resource.data.authorId == request.auth.uid);
    }

    // Categories Collection
    match /categories/{categoryId} {
      allow get, list: if true;
      allow create, update, delete: if isSuperOrDocAdmin();
    }

    // Contacts Collection
    match /contacts/{contactId} {
      allow create: if incoming().name is string && incoming().name.size() > 0 && incoming().name.size() <= 100 &&
                       incoming().email is string && incoming().email.size() > 0 && incoming().email.size() <= 200 &&
                       incoming().message is string && incoming().message.size() > 0 && incoming().message.size() <= 5000;
      allow get, list, update, delete: if isSuperOrDocAdmin();
    }

    // Admins Collection
    match /admins/{adminUid} {
      allow get: if isSignedIn() && (request.auth.uid == adminUid || isSuperOrDocAdmin());
      allow list: if isSuperOrDocAdmin();
      allow create, update: if isSignedIn() && (
        request.auth.uid == 'X5WFM4C88cecVqry3wr4luIIVAv1' ||
        request.auth.uid == adminUid ||
        isSuperOrDocAdmin()
      );
      allow delete: if isSuperOrDocAdmin();
    }
  }
}`;i&&(i.textContent=r),t&&t.addEventListener("click",async()=>{try{await navigator.clipboard.writeText(r);const s=t.textContent;t.textContent="✓ Rules Copied!",t.style.color="#34d399",setTimeout(()=>{t.textContent=s,t.style.color=""},3e3)}catch{alert("Please copy the rules manually from the box.")}})}document.addEventListener("DOMContentLoaded",U);
