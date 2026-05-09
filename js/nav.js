(function(){
  /* ── PWA: inject manifest + register service worker ── */
  (function pwaInit() {
    // Inject <link rel="manifest"> into <head> if not already present
    if (!document.querySelector('link[rel="manifest"]')) {
      const link = document.createElement('link');
      link.rel   = 'manifest';
      link.href  = '/manifest.json';
      document.head.appendChild(link);
    }

    // Theme color meta
    if (!document.querySelector('meta[name="theme-color"]')) {
      const meta = document.createElement('meta');
      meta.name    = 'theme-color';
      meta.content = '#cc0000';
      document.head.appendChild(meta);
    }

    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
    }

    // Install prompt handling
    let deferredPrompt = null;

    window.addEventListener('beforeinstallprompt', e => {
      e.preventDefault();
      deferredPrompt = e;
      const btn   = document.getElementById('pwaInstallBtn');
      const btnMb = document.getElementById('pwaInstallMobile');
      if (btn)   btn.style.display   = 'flex';
      if (btnMb) btnMb.style.display = '';
    });

    window.addEventListener('appinstalled', () => {
      deferredPrompt = null;
      const btn   = document.getElementById('pwaInstallBtn');
      const btnMb = document.getElementById('pwaInstallMobile');
      if (btn)   btn.style.display   = 'none';
      if (btnMb) btnMb.style.display = 'none';
    });

    window.pwaInstall = function() {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(({ outcome }) => {
        deferredPrompt = null;
        if (outcome === 'accepted') {
          const btn = document.getElementById('pwaInstallBtn');
          if (btn) btn.style.display = 'none';
        }
      });
    };
  })();
  const page     = (location.pathname.split('/').pop() || '').toLowerCase();
  const q        = new URLSearchParams(location.search);
  const type     = (q.get('type') || '').toLowerCase();
  const userEmail = sessionStorage.getItem('userEmail') || '';
  const userName  = sessionStorage.getItem('userName')  || '';
  const userPhoto = sessionStorage.getItem('userPhoto') || '';
  const username  = userName || (userEmail ? userEmail.split('@')[0] : 'User');

  const active = {
    home:     page.includes('home'),
    explore:  page.includes('explore'),
    platform: page.includes('platform') || page.includes('watch'),
    update:   page.includes('update'),
    friends:  page.includes('friends'),
    calendar: page.includes('calendar'),
    import:   page.includes('import'),
    stats:    page.includes('stats'),
  };

  const links = [
    { href: 'explore.html',  label: 'Explore',         icon: 'fa-compass',       key: 'explore'  },
    { href: 'home.html',     label: 'Home',            icon: 'fa-house',         key: 'home'     },
    { href: 'platform.html', label: 'Platform',        icon: 'fa-circle-play',   key: 'platform' },
    { href: 'update.html',   label: 'Update Wishlist', icon: 'fa-pen-to-square', key: 'update'   },
    { href: 'friends.html',  label: 'Friends',         icon: 'fa-user-group',    key: 'friends'  },
    { href: 'calendar.html', label: 'Calendar',        icon: 'fa-calendar-days', key: 'calendar' },
    { href: 'import.html',   label: 'Import',          icon: 'fa-file-import',   key: 'import'   },
    { href: 'stats.html',    label: 'Stats',           icon: 'fa-chart-bar',     key: 'stats'    },
  ];

  const logoSvg = `
    <svg width="30" height="26" viewBox="0 0 30 26" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id="spineG" x1="15" y1="0" x2="15" y2="26" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stop-color="#ff6b6b"/>
          <stop offset="50%"  stop-color="#ff0000"/>
          <stop offset="100%" stop-color="#b80000"/>
        </linearGradient>
        <filter id="spineGlow" x="-80%" y="-20%" width="260%" height="140%">
          <feGaussianBlur stdDeviation="1.5" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      <!-- Left page -->
      <path d="M1 3 Q1 1 3 1 L13 1 L13 25 Q11 24 9 24 L3 24 Q1 24 1 22 Z" fill="#1c1c1c" stroke="rgba(255,255,255,0.12)" stroke-width="0.8"/>
      <line x1="4"  y1="7"  x2="10" y2="7"  stroke="rgba(255,255,255,0.35)" stroke-width="1.2" stroke-linecap="round"/>
      <line x1="4"  y1="11" x2="10" y2="11" stroke="rgba(255,255,255,0.18)" stroke-width="0.9" stroke-linecap="round"/>
      <line x1="4"  y1="15" x2="10" y2="15" stroke="rgba(255,255,255,0.18)" stroke-width="0.9" stroke-linecap="round"/>
      <line x1="4"  y1="19" x2="8"  y2="19" stroke="rgba(255,255,255,0.18)" stroke-width="0.9" stroke-linecap="round"/>
      <!-- Right page -->
      <path d="M29 3 Q29 1 27 1 L17 1 L17 25 Q19 24 21 24 L27 24 Q29 24 29 22 Z" fill="#1c1c1c" stroke="rgba(255,255,255,0.12)" stroke-width="0.8"/>
      <line x1="20" y1="7"  x2="26" y2="7"  stroke="rgba(255,255,255,0.35)" stroke-width="1.2" stroke-linecap="round"/>
      <line x1="20" y1="11" x2="26" y2="11" stroke="rgba(255,255,255,0.18)" stroke-width="0.9" stroke-linecap="round"/>
      <line x1="20" y1="15" x2="26" y2="15" stroke="rgba(255,255,255,0.18)" stroke-width="0.9" stroke-linecap="round"/>
      <line x1="20" y1="19" x2="24" y2="19" stroke="rgba(255,255,255,0.18)" stroke-width="0.9" stroke-linecap="round"/>
      <!-- Spine -->
      <rect x="13" y="0" width="4" height="26" rx="1" fill="url(#spineG)" filter="url(#spineGlow)"/>
    </svg>
  `;

  const navHtml = `
    <a href="home.html" class="nav-brand" aria-label="Home">
      ${logoSvg}
      <span class="nav-brand-text">My E-Library</span>
    </a>

    <div class="nav-links">
      ${links.map(l => {
        const hasBadge = l.key === 'friends' && parseInt(sessionStorage.getItem('friendReqCount') || '0') > 0;
        return `
        <a href="${l.href}" class="nav-link ${active[l.key] ? 'active' : ''}">
          <span style="position:relative;display:inline-flex;align-items:center;">
            <i class="fa-solid ${l.icon}"></i>
            ${hasBadge ? `<span class="nav-badge-dot"></span>` : ''}
          </span>
          <span>${l.label}</span>
        </a>`;
      }).join('')}
    </div>

    <div class="nav-right">
      <button id="navSearchBtn" title="Search Library" style="display:flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:10px;border:1px solid #1a1a1a;background:transparent;color:#777;cursor:pointer;transition:all .15s;flex-shrink:0;">
        <i class="fa-solid fa-magnifying-glass" style="font-size:13px;pointer-events:none;"></i>
      </button>
      <button id="pwaInstallBtn" onclick="pwaInstall()" title="Install App" style="display:none;align-items:center;gap:6px;padding:6px 13px;border-radius:10px;border:1px solid rgba(255,0,0,0.3);background:rgba(255,0,0,0.1);color:#ff9999;font-family:'Bungee',Arial,sans-serif;font-size:11px;cursor:pointer;transition:all .15s;">
        <i class="fa-solid fa-download"></i> <span class="nav-install-label">Install</span>
      </button>
      <div class="nav-user" id="navUserChip" role="button" tabindex="0" title="My Profile">
        <span class="nav-user-avatar">
          ${userPhoto
            ? `<img src="${userPhoto}" alt="pfp" class="nav-avatar-img">`
            : `<i class="fa-solid fa-circle-user"></i>`}
        </span>
        <span class="nav-user-label">${username}</span>
        <i class="fa-solid fa-chevron-down" style="font-size:9px;opacity:.4;margin-left:2px;"></i>
      </div>
      <a id="logoutBtn" href="#" class="nav-logout" title="Logout" aria-label="Logout">
        <i class="fa-solid fa-right-from-bracket"></i>
        <span class="nav-logout-label">Logout</span>
      </a>
      <button class="hamburger" id="navHamburger" aria-label="Menu" aria-expanded="false">
        <span></span><span></span><span></span>
      </button>
    </div>
  `;

  const mobileHtml = `
    <div class="nav-mobile-user" id="navMobileUserChip" role="button" style="cursor:pointer;">
      ${userPhoto
        ? `<img src="${userPhoto}" alt="pfp" class="nav-avatar-img" style="width:22px;height:22px;">`
        : `<i class="fa-solid fa-circle-user"></i>`}
      ${username}
    </div>
    ${links.map(l => {
      const hasBadge = l.key === 'friends' && parseInt(sessionStorage.getItem('friendReqCount') || '0') > 0;
      return `
      <a href="${l.href}" class="nav-mobile-link ${active[l.key] ? 'active' : ''}">
        <span style="position:relative;display:inline-flex;align-items:center;">
          <i class="fa-solid ${l.icon}"></i>
          ${hasBadge ? `<span class="nav-badge-dot"></span>` : ''}
        </span> ${l.label}
      </a>`;
    }).join('')}
    <a id="logoutMobile" href="#" class="nav-mobile-link nav-mobile-logout">
      <i class="fa-solid fa-right-from-bracket"></i> Logout
    </a>
    <a id="pwaInstallMobile" href="#" onclick="event.preventDefault();pwaInstall();" class="nav-mobile-link" style="display:none;color:rgba(255,153,153,0.8);">
      <i class="fa-solid fa-download"></i> Install App
    </a>
  `;

  const container = document.getElementById('app-nav');
  if (container) {
    container.classList.add('nav');
    container.innerHTML = navHtml;
  }

  const mobileEl = document.createElement('div');
  mobileEl.id = 'navMobile';
  mobileEl.className = 'nav-mobile';
  mobileEl.innerHTML = mobileHtml;
  if (container) container.insertAdjacentElement('afterend', mobileEl);

  const searchBarEl = document.createElement('div');
  searchBarEl.id = 'navSearchBar';
  searchBarEl.style.cssText = 'display:none;position:sticky;top:60px;z-index:69;background:#080808;border-bottom:1px solid #1a1a1a;padding:10px 20px;';
  searchBarEl.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;max-width:640px;margin:0 auto;">
      <div style="flex:1;display:flex;align-items:center;gap:8px;background:#0f0f0f;border:1px solid #222;border-radius:12px;padding:10px 14px;transition:border-color .15s;">
        <i class="fa-solid fa-magnifying-glass" style="color:#555;font-size:12px;flex-shrink:0;"></i>
        <input id="navSearchInput" type="text" placeholder="Search your library..." autocomplete="off"
          style="flex:1;border:none;outline:none;background:transparent;color:#fff;font-family:'Bungee',Arial,sans-serif;font-size:13px;">
      </div>
      <button id="navSearchClose" style="background:none;border:none;color:#555;font-size:16px;cursor:pointer;padding:4px 8px;line-height:1;transition:color .12s;" title="Close">
        <i class="fa-solid fa-xmark"></i>
      </button>
    </div>
  `;
  mobileEl.insertAdjacentElement('afterend', searchBarEl);

  const onReady = () => {
    function doLogout(e) {
      e.preventDefault();
      if (typeof window.__authSignOut === 'function') {
        window.__authSignOut();
      } else {
        sessionStorage.removeItem('userEmail');
        location.href = 'login.html';
      }
    }

    const logoutBtn    = document.getElementById('logoutBtn');
    const logoutMobile = document.getElementById('logoutMobile');
    if (logoutBtn)    logoutBtn.addEventListener('click', doLogout);
    if (logoutMobile) logoutMobile.addEventListener('click', doLogout);

    function openProfile() {
      if (typeof window.__openProfile === 'function') window.__openProfile();
    }
    const userChip       = document.getElementById('navUserChip');
    const mobileUserChip = document.getElementById('navMobileUserChip');
    if (userChip)       userChip.addEventListener('click', openProfile);
    if (mobileUserChip) mobileUserChip.addEventListener('click', openProfile);

    const navSearchBtn   = document.getElementById('navSearchBtn');
    const navSearchBar   = document.getElementById('navSearchBar');
    const navSearchInput = document.getElementById('navSearchInput');
    const navSearchClose = document.getElementById('navSearchClose');
    if (navSearchBtn && navSearchBar) {
      navSearchBtn.addEventListener('click', () => {
        const isHidden = navSearchBar.style.display === 'none' || navSearchBar.style.display === '';
        navSearchBar.style.display = isHidden ? 'block' : 'none';
        if (isHidden && navSearchInput) navSearchInput.focus();
      });
      if (navSearchClose) {
        navSearchClose.addEventListener('click', () => { navSearchBar.style.display = 'none'; });
      }
      if (navSearchInput) {
        navSearchInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            const val = navSearchInput.value.trim();
            if (val) location.href = 'home.html?q=' + encodeURIComponent(val);
            else navSearchBar.style.display = 'none';
          }
          if (e.key === 'Escape') navSearchBar.style.display = 'none';
        });
      }
    }

    const hamburger = document.getElementById('navHamburger');
    const navMobile = document.getElementById('navMobile');
    if (hamburger && navMobile) {
      hamburger.addEventListener('click', () => {
        const open = navMobile.classList.toggle('open');
        hamburger.classList.toggle('open', open);
        hamburger.setAttribute('aria-expanded', open);
      });
      navMobile.querySelectorAll('a').forEach(a => {
        a.addEventListener('click', () => {
          navMobile.classList.remove('open');
          hamburger.classList.remove('open');
        });
      });
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onReady);
  } else { onReady(); }
})();
