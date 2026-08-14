/* ============================================================
   profile.js — momus profil sayfası mantığı
   CONFIG her profil index.html içinde tanımlanır
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {

  // ── CONFIG KONTROLÜ ──
  if (typeof CONFIG === 'undefined') {
    console.error('momus: CONFIG bulunamadı!');
    return;
  }

  // ── CSS DEĞİŞKENİ: kullanıcı rengi ──
  document.documentElement.style.setProperty('--user-color', CONFIG.color || '#ffffff');

  // ── AVATAR ──
  const avatarEl = document.getElementById('p-avatar');
  if (avatarEl) {
    avatarEl.src = CONFIG.avatar || '';
    avatarEl.onerror = () => {
      avatarEl.src = `https://api.dicebear.com/9.x/pixel-art/svg?seed=${CONFIG.username}&backgroundColor=111111`;
    };
  }

  // ── USERNAME ──
  const unEl = document.getElementById('p-username');
  if (unEl) {
    unEl.textContent = CONFIG.username || 'kullanici';
    document.title = `${CONFIG.username} | momus`;
  }

  // ── BIO ──
  const bioEl = document.getElementById('p-bio');
  if (bioEl) bioEl.textContent = CONFIG.bio || '';

  // ── ARKA PLAN ──
  const bgVideo = document.getElementById('bg-video');
  const bgImg   = document.getElementById('bg-img');

  if (CONFIG.bgVideo && bgVideo) {
    bgVideo.style.display = 'block';
    const src = document.createElement('source');
    src.src = CONFIG.bgVideo;
    src.type = 'video/mp4';
    bgVideo.appendChild(src);
    bgVideo.load();
    bgImg && (bgImg.style.display = 'none');
  } else if (CONFIG.bgImage && bgImg) {
    bgImg.style.display = 'block';
    bgImg.src = CONFIG.bgImage;
    bgVideo && (bgVideo.style.display = 'none');
  } else {
    // Gradient fallback
    const bgContainer = document.getElementById('bg-media');
    if (bgContainer) {
      bgContainer.style.background = `
        radial-gradient(ellipse at 30% 40%, rgba(30,30,30,0.9) 0%, transparent 60%),
        radial-gradient(ellipse at 70% 60%, rgba(20,20,20,0.8) 0%, transparent 60%),
        #080808
      `;
    }
    bgVideo && (bgVideo.style.display = 'none');
    bgImg   && (bgImg.style.display   = 'none');
  }

  // ── LİNK BUTONLARI ──
  const linksContainer = document.getElementById('p-links');
  if (linksContainer && CONFIG.links && CONFIG.links.length > 0) {
    linksContainer.innerHTML = '';
    CONFIG.links.forEach(link => {
      const a = document.createElement('a');
      a.href = link.url || '#';
      a.target = '_blank';
      a.rel = 'noopener';
      a.className = 'p-link-btn';
      a.innerHTML = `
        ${link.icon ? `<img class="btn-icon" src="${link.icon}" alt="" />` : iconSVG(link.type)}
        <span>${link.label}</span>
        <span class="btn-arrow">↗</span>
      `;
      linksContainer.appendChild(a);
    });
  }

  // ── SES / MÜZİK ──
  const audioEl   = document.getElementById('bg-audio');
  const slider    = document.getElementById('volume-slider');
  const muteBtn   = document.getElementById('mute-btn');
  const muteIcon  = document.getElementById('mute-icon');

  if (CONFIG.music && audioEl) {
    const src = document.createElement('source');
    src.src = CONFIG.music;
    src.type = 'audio/mpeg';
    audioEl.appendChild(src);
    audioEl.volume = 0.3;
    audioEl.loop = true;
    audioEl.load();

    // Sayfa etkileşiminden sonra müziği başlat
    const startAudio = () => {
      audioEl.play().catch(() => {});
      document.removeEventListener('click', startAudio);
      document.removeEventListener('keydown', startAudio);
    };
    document.addEventListener('click', startAudio);
    document.addEventListener('keydown', startAudio);
  }

  // Ses kaydırıcı
  if (slider && audioEl) {
    slider.value = 30;
    slider.addEventListener('input', () => {
      audioEl.volume = slider.value / 100;
      // Slider doluluk efekti
      slider.style.background = `linear-gradient(to right, rgba(255,255,255,0.7) 0%, rgba(255,255,255,0.7) ${slider.value}%, rgba(255,255,255,0.12) ${slider.value}%, rgba(255,255,255,0.12) 100%)`;
      if (audioEl.muted && slider.value > 0) {
        audioEl.muted = false;
        updateMuteIcon(false);
      }
    });
    // Başlangıç doluluk
    slider.style.background = `linear-gradient(to right, rgba(255,255,255,0.7) 0%, rgba(255,255,255,0.7) 30%, rgba(255,255,255,0.12) 30%, rgba(255,255,255,0.12) 100%)`;
  }

  // Mute butonu
  if (muteBtn && audioEl) {
    muteBtn.addEventListener('click', () => {
      audioEl.muted = !audioEl.muted;
      updateMuteIcon(audioEl.muted);
    });
  }

  function updateMuteIcon(muted) {
    if (!muteIcon) return;
    muteIcon.innerHTML = muted
      ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>`;
  }

  // ── CURSOR ──
  const dot  = document.getElementById('c-dot');
  const rng  = document.getElementById('c-ring');
  let rx = window.innerWidth/2, ry = window.innerHeight/2;
  let mx = rx, my = ry;

  document.addEventListener('mousemove', e => {
    mx = e.clientX; my = e.clientY;
    dot.style.left = mx + 'px';
    dot.style.top  = my + 'px';
  });
  ;(function loopRing() {
    rx += (mx - rx) * 0.1;
    ry += (my - ry) * 0.1;
    rng.style.left = rx + 'px';
    rng.style.top  = ry + 'px';
    requestAnimationFrame(loopRing);
  })();

  document.addEventListener('mouseover', e => {
    if (e.target.closest('a, button, .p-link-btn, #volume-slider')) {
      rng.style.width  = '46px';
      rng.style.height = '46px';
    } else {
      rng.style.width  = '30px';
      rng.style.height = '30px';
    }
  });

});

// ── YARDIMCI: Link tipi SVG ikonları ──
function iconSVG(type) {
  const icons = {
    discord: `<svg class="btn-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.04.035.05a19.906 19.906 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/></svg>`,
    youtube: `<svg class="btn-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>`,
    twitter: `<svg class="btn-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`,
    instagram:`<svg class="btn-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>`,
    steam:   `<svg class="btn-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.188.006l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.029 4.524 4.524s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.004.105.004.159 0 1.875-1.515 3.396-3.39 3.396-1.635 0-3.016-1.173-3.331-2.727L.436 15.27C1.862 20.307 6.486 24 11.979 24c6.627 0 11.999-5.373 11.999-12S18.606 0 11.979 0z"/></svg>`,
    github:  `<svg class="btn-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>`,
    link:    `<svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`,
  };
  return icons[type] || icons.link;
}
