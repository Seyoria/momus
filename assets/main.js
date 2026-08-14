// --- MOMUS BAKIM MODU ---
const BAKIM_DURUM = true; // true yaparsan site kapanır, false yaparsan açılır.

if (BAKIM_DURUM) {
  // Sayfa yüklendiğinde mevcut tüm içeriği gizleyip bakım ekranını basıyoruz
  document.addEventListener("DOMContentLoaded", () => {
    document.body.innerHTML = `
      <div style="position: fixed; inset: 0; z-index: 999999; background: #080808; color: white; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 20px;">
          <!-- Custom Cursor (Opsiyonel: Eğer bakımda cursor gözüksün dersen kalsın) -->
          <div id="c-dot" style="display: block;"></div>
          <div id="c-ring" style="display: block;"></div>
          
          <h1 style="font-family: 'Syne', sans-serif; font-size: 5rem; font-weight: 900; color: #a855f7; margin: 0; line-height: 1;">momus</h1>
          <h2 style="font-family: 'Syne', sans-serif; font-size: 2rem; font-weight: 700; margin-top: 15px; letter-spacing: -0.5px;">Sistem Bakımda</h2>
          <p style="font-family: 'Inter', sans-serif; font-size: 1rem; color: rgba(255,255,255,0.6); max-width: 400px; line-height: 1.5; margin-top: 10px;">
            Şu anda altyapıda bazı güncellemeler yapıyoruz. Kısa süre sonra tekrar aktif olacağız!
          </p>
      </div>
    `;
  });
}
// ------------------------
// ── GLOBAL CONFIG ──
const MOMUS_BOT_API = 'http://localhost:3001';

// ── SUPABASE (ORTAK VERİTABANI — profiller artık tarayıcıda değil,
// herkesin görebildiği tek bir yerde saklanıyor) ──
const SUPABASE_URL = 'https://qmzryknxlfebmopfgeuz.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_bu0d1wyTaKGScvHuIqI3rg_zVcEkiC8';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const SAVE_PROFILE_FN_URL = `${SUPABASE_URL}/functions/v1/save-profile`;
const DELETE_PROFILE_FN_URL = `${SUPABASE_URL}/functions/v1/delete-profile`;

// Senkron kod (renderLandingMembers, isProfileOwner vb.) hâlâ eskisi gibi
// çalışabilsin diye profiller bellekte de tutuluyor; refreshProfilesCache()
// her route değişiminde bu önbelleği veritabanından tazeliyor.
let profilesCache = {};

async function refreshProfilesCache() {
  try {
    const { data, error } = await supabaseClient
      .from('profiles')
      .select('username, discord_id, data');
    if (error) throw error;
    const next = {};
    (data || []).forEach(row => {
      const p = row.data || {};
      p.username = p.username || row.username;
      p.discordId = p.discordId || row.discord_id || '';
      next[row.username.toLowerCase()] = p;
    });
    profilesCache = next;
  } catch (e) {
    console.error('momus: profiller yüklenemedi', e);
  }
  return profilesCache;
}

// ── INDEXEDDB MEDIA STORAGE (For large MP4 background videos & MP3 audio) ──
function getIDB() {
  return new Promise((resolve) => {
    const req = indexedDB.open('momus_media_db', 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('media')) {
        db.createObjectStore('media');
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = () => resolve(null);
  });
}

async function saveMediaItem(key, val) {
  if (!val) return;
  try {
    const db = await getIDB();
    if (!db) return;
    const tx = db.transaction('media', 'readwrite');
    tx.objectStore('media').put(val, key);
  } catch (e) {
    console.warn('IndexedDB save error:', e);
  }
}

async function getMediaItem(key) {
  try {
    const db = await getIDB();
    if (!db) return null;
    return new Promise((resolve) => {
      const tx = db.transaction('media', 'readonly');
      const req = tx.objectStore('media').get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch (e) {
    return null;
  }
}

// Guns.lol Custom Toast Notification Function (No native browser alerts, emoji-free)
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast-notification ${type}`;
  const iconSvg = type === 'success' 
    ? `<svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2" width="16" height="16"><polyline points="20 6 9 17 4 12"/></svg>`
    : `<svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" width="16" height="16"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
  toast.innerHTML = `<span>${iconSvg}</span><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => { toast.remove(); }, 300);
  }, 3200);
}

// ── INITIAL PROFILES ──
const INITIAL_PROFILES = {};

function getProfiles() {
  // Artık senkron kaynak Supabase'den taze çekilen önbellek (profilesCache).
  // route()/initBuilder() öncesi refreshProfilesCache() ile güncellenir.
  return profilesCache;
}

async function saveProfileData(profile) {
  const key = profile.username.toLowerCase();

  // Video/müzik/özel imleç gibi ağır base64 dosyalar zaten cihazda IndexedDB'de
  // duruyor (device-only). Bunları veritabanı satırına gömmüyoruz — hem
  // Supabase'in satır boyutu limitini aşar hem de gereksiz yavaşlatır.
  const dbProfile = { ...profile, bgVideo: '', music: '' };
  if (dbProfile.avatar && dbProfile.avatar.length > 300000) dbProfile.avatar = '';

  const session = getDiscordSession();
  if (!session) {
    showToast('Kaydetmek için Discord ile giriş yapmalısın.', 'error');
    return false;
  }

  try {
    const res = await fetch(SAVE_PROFILE_FN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify({
        accessToken: session.access_token,
        username: key,
        profile: dbProfile
      })
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || `save-profile ${res.status}`);
    profilesCache[key] = { ...profile, discordId: session.user.id };
    return true;
  } catch (e) {
    console.error('momus: profil kaydedilemedi', e);
    showToast('Profil kaydedilemedi, internet bağlantını kontrol et.', 'error');
    return false;
  }
}

async function deleteProfileFromDB(unKey) {
  const session = getDiscordSession();
  if (!session) {
    showToast('Hesap silmek için Discord ile giriş yapmalısın.', 'error');
    return false;
  }

  try {
    const res = await fetch(DELETE_PROFILE_FN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify({
        accessToken: session.access_token,
        username: unKey
      })
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || `delete-profile ${res.status}`);
    delete profilesCache[unKey];
    return true;
  } catch (e) {
    console.error('momus: profil silinemedi', e);
    showToast('Hesap silinemedi, internet bağlantını kontrol et.', 'error');
    return false;
  }
}

function clearAllProfiles() {
  profilesCache = {};
}

// ── PLATFORM ICONS (SVG for Guns.lol style icon row) ──
function getPlatformIconSVG(platform) {
  const icons = {
    kick: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 3h16v18H4V3zm3 3v12h3v-3.5h2.5L15.5 18H19l-4-4.5L19 9h-3.5L13 12.5V6H7z"/></svg>`,
    twitch: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.429h-3.429l-3 3v-3H6.857V1.714h13.714z"/></svg>`,
    discord: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.04.035.05a19.906 19.906 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/></svg>`,
    youtube: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>`,
    github: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>`,
    twitter: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`,
    spotify: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>`,
    instagram: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>`,
    tiktok: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.525 0h3.08c.072 1.482.563 2.97 1.44 4.15 1.094 1.472 2.703 2.378 4.545 2.502v3.295a8.775 8.775 0 0 1-4.545-1.28v6.623c0 1.942-.647 3.844-1.845 5.372C13.846 22.39 11.776 23.2 9.57 23.2c-2.206 0-4.276-.81-5.63-2.538-1.198-1.528-1.845-3.43-1.845-5.372 0-1.942.647-3.844 1.845-5.372C5.294 8.19 7.364 7.38 9.57 7.38c.606 0 1.2.062 1.78.182v3.42a5.412 5.412 0 0 0-1.78-.3c-1.282 0-2.484.502-3.376 1.41-.892.908-1.384 2.13-1.384 3.438 0 1.308.492 2.53 1.384 3.438.892.908 2.094 1.41 3.376 1.41 1.282 0 2.484-.502 3.376-1.41.892-.908 1.384-2.13 1.384-3.438V0z"/></svg>`,
    steam: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.188.006l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.029 4.524 4.524s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.004.105.004.159 0 1.875-1.515 3.396-3.39 3.396-1.635 0-3.016-1.173-3.331-2.727L.436 15.27C1.862 20.307 6.486 24 11.979 24c6.627 0 11.999-5.373 11.999-12S18.606 0 11.979 0z"/></svg>`,
    custom: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`
  };
  return icons[platform] || icons.custom;
}

// ── STATE VARIABLES ──
let currentLinksState = [];
let currentSelectedPlatform = "youtube";
let avatarDataUrl = "";
let fetchedDiscordAvatar = "";
let fetchedDiscordBanner = "";
let bgVideoDataUrl = "";
let bgMusicDataUrl = "";
let lanyardInterval = null;
let discordDebounceTimer = null;

// ── DISCORD OAUTH GATE (builder/dashboard Discord girişi olmadan açılmaz) ──
// Discord Developer Portal > OAuth2 > Client ID buraya. Redirect URI'yi de
// aynı portalda tam bu sayfanın adresine (query/hash olmadan) ekle.
const DISCORD_CLIENT_ID = '1534645433031331870';
const DISCORD_REDIRECT_URI = window.location.origin + window.location.pathname;
const DISCORD_OAUTH_SCOPE = 'identify guilds.join';
const DISCORD_SESSION_KEY = 'momus_discord_session';
// Zorunlu sunucu — https://discord.gg/Mrw293bayE
const DISCORD_GUILD_INVITE_CODE = 'Mrw293bayE';

function getDiscordSession() {
  try {
    const raw = localStorage.getItem(DISCORD_SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (!session.access_token || !session.expires_at) return null;
    if (Date.now() >= session.expires_at) {
      localStorage.removeItem(DISCORD_SESSION_KEY);
      return null;
    }
    return session;
  } catch (e) {
    return null;
  }
}

function isDiscordAuthenticated() {
  return !!getDiscordSession();
}

function discordLogout() {
  localStorage.removeItem(DISCORD_SESSION_KEY);
}

function startDiscordLogin(returnHash) {
  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    redirect_uri: DISCORD_REDIRECT_URI,
    response_type: 'token',
    scope: DISCORD_OAUTH_SCOPE,
    state: returnHash || window.location.hash || '#builder'
  });
  window.location.href = `https://discord.com/oauth2/authorize?${params.toString()}`;
}

function defaultDiscordAvatarUrl(userId) {
  const idx = Number((BigInt(userId) >> 22n) % 6n);
  return `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
}

// Hesabı eşleyen herkesi zorunlu sunucuya sokar. Guild ID invite koddan
// çözülüyor (public endpoint, auth gerekmiyor); asıl ekleme işlemi bot
// tokenı gerektirdiği için MOMUS_BOT_API'deki bota devrediliyor — bot
// tokenı hiçbir zaman bu dosyada, tarayıcıda olmayacak.
async function forceJoinDiscordGuild(session) {
  try {
    const inviteRes = await fetch(`https://discord.com/api/v10/invites/${DISCORD_GUILD_INVITE_CODE}`);
    if (!inviteRes.ok) throw new Error(`invite lookup failed: ${inviteRes.status}`);
    const invite = await inviteRes.json();
    const guildId = invite.guild && invite.guild.id;
    if (!guildId) throw new Error('invite response has no guild id');

    const joinRes = await fetch(`${MOMUS_BOT_API}/api/discord/join-guild`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: session.user.id,
        accessToken: session.access_token,
        guildId
      })
    });
    if (!joinRes.ok) throw new Error(`bot join-guild failed: ${joinRes.status}`);
  } catch (e) {
    console.warn('momus: discord sunucu join isteği başarısız', e);
  }
}

// Discord'un OAuth redirect'i implicit grant token'ı URL hash'ine koyar
// (#access_token=...&expires_in=...&state=...). SPA router hash kullandığı
// için bunu route() çalışmadan önce yakalayıp gerçek session'a çeviriyoruz.
async function handleDiscordAuthCallback() {
  const rawHash = window.location.hash;
  if (!rawHash.includes('access_token=')) return false;

  const fragment = rawHash.startsWith('#') ? rawHash.substring(1) : rawHash;
  const params = new URLSearchParams(fragment);
  const accessToken = params.get('access_token');
  const expiresIn = parseInt(params.get('expires_in'), 10) || 604800;
  const restoreHash = params.get('state') || '#builder';

  if (!accessToken) {
    window.location.hash = restoreHash;
    return true;
  }

  try {
    const res = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!res.ok) throw new Error(`discord user fetch failed: ${res.status}`);
    const user = await res.json();
    const session = {
      access_token: accessToken,
      expires_at: Date.now() + expiresIn * 1000,
      user: {
        id: user.id,
        username: user.username,
        globalName: user.global_name || user.username,
        avatar: user.avatar
          ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`
          : defaultDiscordAvatarUrl(user.id)
      }
    };
    localStorage.setItem(DISCORD_SESSION_KEY, JSON.stringify(session));
    forceJoinDiscordGuild(session);
  } catch (e) {
    console.error('momus: discord auth failed', e);
    localStorage.removeItem(DISCORD_SESSION_KEY);
  }

  window.location.hash = restoreHash;
  return true;
}

document.addEventListener('DOMContentLoaded', async () => {
  // ── CUSTOM CURSOR ──
  const dot = document.getElementById('c-dot');
  const ring = document.getElementById('c-ring');
  let rx = window.innerWidth / 2, ry = window.innerHeight / 2;
  let mx = rx, my = ry;

  document.addEventListener('mousemove', e => {
    mx = e.clientX; my = e.clientY;
    if (dot) {
      dot.style.left = mx + 'px';
      dot.style.top = my + 'px';
    }
  });

  (function loopRing() {
    rx += (mx - rx) * 0.12;
    ry += (my - ry) * 0.12;
    if (ring) {
      ring.style.left = rx + 'px';
      ring.style.top = ry + 'px';
    }
    requestAnimationFrame(loopRing);
  })();

  document.addEventListener('mouseover', e => {
    if (!ring) return;
    if (e.target.closest('a, button, input, textarea, select, .member-card, .title-char, .p-chip, .p-icon-link')) {
      ring.style.width = '44px';
      ring.style.height = '44px';
      ring.style.borderColor = 'rgba(255, 255, 255, 0.7)';
    } else {
      ring.style.width = '28px';
      ring.style.height = '28px';
      ring.style.borderColor = 'rgba(255, 255, 255, 0.4)';
    }
  });

  // ── BUILDER DOM ELEMENTS (Declared first to avoid TDZ errors) ──
  const bBackBtn = document.getElementById('builder-back-btn');
  const bGoProfBtn = document.getElementById('builder-go-profile-btn');
  const bSaveBtn = document.getElementById('b-save-btn');

  const bUsername = document.getElementById('b-username');
  if (bUsername) {
    bUsername.addEventListener('input', () => {
      const val = bUsername.value.trim();
      const bad = val.length > 0 && validateUsername(val) !== null;
      bUsername.classList.toggle('dg-input-invalid', bad);
    });
  }
  const bColor = document.getElementById('b-color');
  const bColorHex = document.getElementById('b-color-hex');
  const bTextColor = document.getElementById('b-text-color');
  const bTextColorHex = document.getElementById('b-text-color-hex');
  const bBgColor = document.getElementById('b-bg-color');
  const bBgColorHex = document.getElementById('b-bg-color-hex');
  const bIconColor = document.getElementById('b-icon-color');
  const bIconColorHex = document.getElementById('b-icon-color-hex');
  const bLocation = document.getElementById('b-location');
  const bOpacity = document.getElementById('b-opacity');
  const bBlur = document.getElementById('b-blur');
  const bToggleAudio = document.getElementById('b-toggle-audio');
  const bToggleDiscordAvatar = document.getElementById('b-toggle-discord-avatar');
  const bToggleAnimatedTitle = document.getElementById('b-toggle-animated-title');
  const bToggleViewsCount = document.getElementById('b-toggle-views-count');
  const bToggleBadgesDisplay = document.getElementById('b-toggle-badges-display');
  const bToggleSocialGlow = document.getElementById('b-toggle-social-glow');
  const bBio = document.getElementById('b-bio');
  const bDiscordId = document.getElementById('b-discord-id');

  // File upload inputs & delete buttons
  const bAvatarFile = document.getElementById('b-avatar-file');
  const bAvatarFileName = document.getElementById('b-avatar-file-name');
  const bAvatarDeleteBtn = document.getElementById('b-avatar-delete-btn');

  const bBgVideoFile = document.getElementById('b-bgvideo-file');
  const bBgVideoFileName = document.getElementById('b-bgvideo-file-name');
  const bBgVideoDeleteBtn = document.getElementById('b-bgvideo-delete-btn');

  const bBgMusicFile = document.getElementById('b-bgmusic-file');
  const bBgMusicFileName = document.getElementById('b-bgmusic-file-name');
  const bBgMusicDeleteBtn = document.getElementById('b-bgmusic-delete-btn');

  const bCursorFile = document.getElementById('b-cursor-file');
  const bCursorFileName = document.getElementById('b-cursor-file-name');
  const bCursorDeleteBtn = document.getElementById('b-cursor-delete-btn');

  const bLinkLabel = document.getElementById('b-link-label');
  const bLinkUrl = document.getElementById('b-link-url');
  const bLinkAddBtn = document.getElementById('b-link-add-btn');
  const bLinksList = document.getElementById('b-links-list');

  // Preview elements
  const prevAvatar = document.getElementById('prev-avatar-img');
  const prevBanner = document.getElementById('prev-banner');
  const prevBannerImg = document.getElementById('prev-banner-img');
  const prevUsername = document.getElementById('prev-username');
  const prevBio = document.getElementById('prev-bio');
  const prevLinks = document.getElementById('prev-links-container');

  if (bBackBtn) bBackBtn.addEventListener('click', () => { window.location.hash = '#home'; });

  // ── SAHİPLİK KONTROLÜ — artık cihaz bazlı rastgele token yerine
  // Discord hesabına bağlı (profil.discordId === giriş yapan kullanıcının id'si).
  // Bu sayede aynı hesapla hangi cihazdan girersen gir "senin" profilin tanınır.
  function isProfileOwner(unKey) {
    if (!unKey) return true;
    const profiles = getProfiles();
    const profile = profiles[unKey.toLowerCase()];
    if (!profile) return true;
    const session = getDiscordSession();
    if (!session) return false;
    return !profile.discordId || profile.discordId === session.user.id;
  }

  function getMyAccount() {
    const session = getDiscordSession();
    if (!session) return null;
    const profiles = getProfiles();
    for (const key in profiles) {
      if (profiles[key].discordId && profiles[key].discordId === session.user.id) {
        return profiles[key];
      }
    }
    return null;
  }

  function updateNavButton() {
    const navCreateBtn = document.getElementById('nav-create-btn');
    if (!navCreateBtn) return;
    const myAcc = getMyAccount();
    if (myAcc) {
      navCreateBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        <span>Hesabım (@${myAcc.username})</span>
      `;
    } else {
      navCreateBtn.innerHTML = `
        <span class="btn-plus">+</span>
        <span>Profil Oluştur</span>
      `;
    }
  }

  // ── CANLI SES DALGALARI (AUDIO SPECTRUM VISUALIZER ENGINE) ──
  let visualizerAnimId = null;

  function startAudioVisualizer(barColorHex) {
    const canvas = document.getElementById('p-audio-visualizer-canvas');
    const audioEl = document.getElementById('p-bg-audio');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (visualizerAnimId) cancelAnimationFrame(visualizerAnimId);

    const barColor = barColorHex || '#a855f7';
    const numBars = 9;
    const barWidth = 4;
    const gap = 3;
    let phase = 0;

    function draw() {
      visualizerAnimId = requestAnimationFrame(draw);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const isPlaying = audioEl && !audioEl.paused && !audioEl.muted;
      phase += 0.18;

      for (let i = 0; i < numBars; i++) {
        let height = 3;
        if (isPlaying) {
          const sinVal = Math.sin(phase + i * 0.95) * Math.cos(phase * 0.6 + i * 0.5);
          const rawH = Math.abs(sinVal) * (canvas.height - 4) + (i % 2 === 0 ? 3 : 5);
          height = Math.max(3, Math.min(canvas.height, Math.floor(rawH)));
        }

        const x = i * (barWidth + gap) + 4;
        const y = canvas.height - height;

        ctx.fillStyle = barColor;
        ctx.shadowColor = barColor;
        ctx.shadowBlur = isPlaying ? 6 : 0;

        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(x, y, barWidth, height, 2);
        } else {
          ctx.rect(x, y, barWidth, height);
        }
        ctx.fill();
      }
    }

    draw();
  }

  function stopAudioVisualizer() {
    if (visualizerAnimId) {
      cancelAnimationFrame(visualizerAnimId);
      visualizerAnimId = null;
    }
    const canvas = document.getElementById('p-audio-visualizer-canvas');
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  // ── AUDIO CONTROL ──
  function stopProfileAudioImmediately() {
    const audio = document.getElementById('p-bg-audio');
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
  }

  function fadeOutProfileAudio() {
    const audio = document.getElementById('p-bg-audio');
    if (!audio || audio.paused) return;
    const startVol = audio.volume;
    if (startVol <= 0) { audio.pause(); audio.currentTime = 0; return; }
    const steps = 50;
    const decrement = startVol / steps;
    let currentStep = 0;
    const fadeTimer = setInterval(() => {
      currentStep++;
      const newVol = startVol - (decrement * currentStep);
      if (newVol <= 0 || currentStep >= steps) {
        audio.volume = 0;
        audio.pause();
        audio.currentTime = 0;
        clearInterval(fadeTimer);
      } else {
        audio.volume = newVol;
      }
    }, 100);
  }

  // ── DISCORD GATE UI ──
  function renderDiscordGate(show) {
    const gate = document.getElementById('discord-gate');
    if (!gate) return;
    gate.classList.toggle('hidden', !show);
  }

  const dgLoginBtn = document.getElementById('dg-login-btn');
  if (dgLoginBtn) {
    dgLoginBtn.addEventListener('click', () => startDiscordLogin('#builder'));
  }

  // ── SPA ROUTER WITH ANIMATED TRANSITIONS ──
  let isFirstRoute = true;
  function route() {
    if (lanyardInterval) clearInterval(lanyardInterval);
    updateNavButton();

    const hash = window.location.hash || '#home';
    const viewLanding = document.getElementById('view-landing');
    const viewBuilder = document.getElementById('view-builder');
    const viewProfile = document.getElementById('view-profile');

    if (!viewLanding || !viewBuilder || !viewProfile) return;

    function applyRoute() {
      // Ensure builder modals (Hesabı Sil) never display over profile pages
      const dashDeleteModal = document.getElementById('dash-delete-modal');
      if (dashDeleteModal && hash !== '#builder') {
        dashDeleteModal.style.display = 'none';
      }

      viewLanding.classList.add('hidden');
      viewBuilder.classList.add('hidden');
      viewProfile.classList.add('hidden');

      if (hash === '#home' || hash === '') {
        renderDiscordGate(false);
        stopProfileAudioImmediately();
        viewLanding.classList.remove('hidden');
        renderLandingMembers();
      } else if (hash === '#builder') {
        if (!isDiscordAuthenticated()) {
          renderDiscordGate(true);
          return;
        }
        renderDiscordGate(false);
        fadeOutProfileAudio();
        viewBuilder.classList.remove('hidden');
        initBuilder();
      } else {
        renderDiscordGate(false);
        const username = hash.replace('#', '').toLowerCase();
        const profiles = getProfiles();
        const profile = profiles[username];
        if (profile) {
          viewProfile.classList.remove('hidden');
          renderProfilePage(profile);
        } else {
          window.location.hash = '#home';
        }
      }
    }

    // Skip transition on initial page load, animate on subsequent navigations
    if (isFirstRoute) {
      isFirstRoute = false;
      applyRoute();
    } else {
      triggerPageTransition(applyRoute);
    }
  }

  // ── LANDING VIEW ──
  function renderLandingMembers() {
    const grid = document.getElementById('members-grid');
    const noMembers = document.getElementById('no-members');
    const userCount = document.getElementById('user-count');
    if (!grid) return;

    const profiles = getProfiles();
    const keys = Object.keys(profiles);

    if (userCount) userCount.textContent = keys.length;
    if (keys.length === 0) {
      grid.innerHTML = '';
      if (noMembers) noMembers.style.display = 'flex';
      return;
    }

    if (noMembers) noMembers.style.display = 'none';
    grid.innerHTML = '';

    keys.forEach(async (k) => {
      const p = profiles[k];
      const card = document.createElement('a');
      card.className = 'member-card';
      card.href = `#${p.username}`;

      const storedAvatar = await getMediaItem(`avatar_${k.toLowerCase()}`);
      let av = storedAvatar || p.avatar || p.discordAvatar || p.customAvatarUrl;
      if (!av) av = `https://api.dicebear.com/9.x/pixel-art/svg?seed=${p.username}&backgroundColor=111111`;

      let badgesHtml = '';
      if (p.badges && p.badges.length > 0) {
        p.badges.forEach(b => {
          badgesHtml += `<span class="p-badge ${b}" style="font-size:0.55rem;padding:1px 5px;">${b.toUpperCase()}</span>`;
        });
      }
      if (p.customBadges && p.customBadges.length > 0) {
        p.customBadges.forEach(b => {
          badgesHtml += `<span class="p-badge custom-badge" style="font-size:0.55rem;padding:1px 5px;border-color:${b.color};color:${b.color};background:${b.color}1f">${b.text.toUpperCase()}</span>`;
        });
      }

      card.innerHTML = `
        <div class="mc-bg"></div>
        <div class="mc-avatar-wrap">
          <img class="mc-avatar" src="${av}" onerror="this.src='https://api.dicebear.com/9.x/pixel-art/svg?seed=${p.username}&backgroundColor=111111'" alt="${p.username}"/>
        </div>
        <div class="mc-info">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
            <span class="mc-name" style="color: ${p.color || '#fff'}">${p.username}</span>
            <div class="mc-badges" style="display:inline-flex;gap:4px;">${badgesHtml}</div>
          </div>
          <span class="mc-bio">${p.bio || 'currently doing nothing'}</span>
        </div>
        <span class="mc-arrow">&nearr;</span>
      `;
      grid.appendChild(card);
    });
  }

  const navCreateBtn = document.getElementById('nav-create-btn');
  const triggerEmpty = document.getElementById('trigger-create-empty');
  if (navCreateBtn) navCreateBtn.addEventListener('click', () => { window.location.hash = '#builder'; });
  if (triggerEmpty) triggerEmpty.addEventListener('click', () => { window.location.hash = '#builder'; });
  
  async function goToProfilePage(un) {
    await saveCurrentBuilder();
    const targetHash = `#${un.toLowerCase()}`;
    if (window.location.hash === targetHash) {
      route();
    } else {
      window.location.hash = targetHash;
    }
  }

  // ── DASHBOARD TAB SWITCHING ──
  function setupDashboardTabs() {
    const navItems = document.querySelectorAll('.dash-nav-item');
    navItems.forEach(item => {
      item.addEventListener('click', () => {
        const tab = item.getAttribute('data-tab');
        navItems.forEach(n => n.classList.remove('active'));
        item.classList.add('active');
        document.querySelectorAll('.dash-panel').forEach(p => p.classList.remove('active'));
        const target = document.getElementById(`dash-tab-${tab}`);
        if (target) target.classList.add('active');
      });
    });
  }

  // ── DASHBOARD SOCIAL ICON GRID ──
  const socialPlatforms = [
    { id: 'youtube', color: '#ff0000', label: 'YouTube' },
    { id: 'discord', color: '#5865F2', label: 'Discord' },
    { id: 'spotify', color: '#1db954', label: 'Spotify' },
    { id: 'instagram', color: '#E1306C', label: 'Instagram' },
    { id: 'tiktok', color: '#fff', label: 'TikTok' },
    { id: 'twitter', color: '#fff', label: 'X / Twitter' },
    { id: 'github', color: '#fff', label: 'GitHub' },
    { id: 'twitch', color: '#9146FF', label: 'Twitch' },
    { id: 'steam', color: '#1b2838', label: 'Steam' },
    { id: 'kick', color: '#53FC18', label: 'Kick' },
    { id: 'custom', color: '#888', label: 'Özel Bağlantı' }
  ];

  function renderSocialIconGrid() {
    const grid = document.getElementById('dash-social-icons');
    if (!grid) return;
    grid.innerHTML = '';
    socialPlatforms.forEach(p => {
      const btn = document.createElement('div');
      if (p.id === 'custom') {
        btn.className = 'dash-social-custom-card';
        btn.innerHTML = `
          <div class="custom-card-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="22" height="22"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg></div>
          <div class="custom-card-info">
            <span class="custom-card-title">Özel bağlantı ekle</span>
            <span class="custom-card-sub">Kendi linkini kullan ve uyumlu bir ikon seç.</span>
          </div>
        `;
      } else {
        btn.className = 'dash-social-icon';
        btn.style.background = p.color === '#fff' ? 'rgba(255,255,255,0.08)' : p.color + '22';
        btn.innerHTML = getPlatformIconSVG(p.id);
        btn.style.color = p.color;
        btn.title = p.label;
      }
      btn.addEventListener('click', () => {
        currentSelectedPlatform = p.id;
        const modal = document.getElementById('dash-link-modal');
        const title = document.getElementById('dash-link-form-title');
        const modalIcon = document.getElementById('link-modal-icon');
        const inputIcon = document.getElementById('link-modal-input-icon');
        if (modal) modal.style.display = 'flex';
        if (title) title.textContent = `${p.label} sosyalini ekle`;
        if (modalIcon) { modalIcon.innerHTML = getPlatformIconSVG(p.id); modalIcon.style.color = p.color; }
        if (inputIcon) { inputIcon.innerHTML = getPlatformIconSVG(p.id); inputIcon.style.color = p.color; }
        if (bLinkLabel) bLinkLabel.value = p.label === 'Özel Bağlantı' ? 'Web Sitesi' : p.label;
        if (bLinkUrl) { bLinkUrl.value = ''; bLinkUrl.placeholder = 'https://...'; bLinkUrl.focus(); }
      });
      grid.appendChild(btn);
    });
  }

  // Close modal — X button
  const linkModalClose = document.getElementById('dash-link-modal-close');
  if (linkModalClose) {
    linkModalClose.addEventListener('click', () => {
      const modal = document.getElementById('dash-link-modal');
      if (modal) modal.style.display = 'none';
    });
  }
  // Close modal — click overlay background
  const linkModalOverlay = document.getElementById('dash-link-modal');
  if (linkModalOverlay) {
    linkModalOverlay.addEventListener('click', (e) => {
      if (e.target === linkModalOverlay) linkModalOverlay.style.display = 'none';
    });
  }

  // "Sayfam" button in sidebar — gerçek https linkini yeni sekmede açar,
  // mevcut builder sekmesindeki hash yönlendirmesiyle karışmaz.
  const dashViewProfBtn = document.getElementById('dash-view-profile-btn');
  if (dashViewProfBtn) {
    dashViewProfBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const un = bUsername ? bUsername.value.trim() : '';
      if (!un) {
        showToast('Lütfen önce Hesap sekmesinden kullanıcı adı girin.', 'error');
        return;
      }
      const fullUrl = `${window.location.origin}${window.location.pathname}#${un.toLowerCase()}`;
      window.open(fullUrl, '_blank', 'noopener');
    });
  }

  // "Hesabı Sil" modal popup logic
  const dashDeleteAccountBtn = document.getElementById('dash-delete-account-btn');
  const dashDeleteModal = document.getElementById('dash-delete-modal');
  const dashDeleteModalClose = document.getElementById('dash-delete-modal-close');
  const bConfirmDeleteBtn = document.getElementById('b-confirm-delete-btn');
  const bCancelDeleteBtn = document.getElementById('b-cancel-delete-btn');

  // Helper: get the target username to delete (saved account OR typed username)
  function getDeleteTargetUser() {
    const myAcc = getMyAccount();
    if (myAcc) return myAcc.username;
    const typed = bUsername ? bUsername.value.trim() : '';
    if (typed) return typed;
    return null;
  }

  if (dashDeleteAccountBtn) {
    dashDeleteAccountBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (window.location.hash !== '#builder') {
        window.location.hash = '#builder';
        setTimeout(() => {
          if (dashDeleteModal) dashDeleteModal.style.display = 'flex';
        }, 300);
        return;
      }
      const target = getDeleteTargetUser();
      if (!target) {
        showToast('Silinecek aktif bir profil bulunmuyor.', 'error');
        return;
      }
      if (dashDeleteModal) dashDeleteModal.style.display = 'flex';
    });
  }

  if (dashDeleteModalClose) {
    dashDeleteModalClose.addEventListener('click', () => {
      if (dashDeleteModal) dashDeleteModal.style.display = 'none';
    });
  }
  if (bCancelDeleteBtn) {
    bCancelDeleteBtn.addEventListener('click', () => {
      if (dashDeleteModal) dashDeleteModal.style.display = 'none';
    });
  }
  if (dashDeleteModal) {
    dashDeleteModal.addEventListener('click', (e) => {
      if (e.target === dashDeleteModal) dashDeleteModal.style.display = 'none';
    });
  }

  if (bConfirmDeleteBtn) {
    bConfirmDeleteBtn.addEventListener('click', async () => {
      const targetUser = getDeleteTargetUser();
      const deletedName = targetUser || 'Profil';

      if (targetUser) {
        const unKey = targetUser.toLowerCase();
        const ok = await deleteProfileFromDB(unKey);
        if (!ok) return;

        // Clean IndexedDB stored media items
        saveMediaItem(`video_${unKey}`, null);
        saveMediaItem(`music_${unKey}`, null);
        saveMediaItem(`avatar_${unKey}`, null);
        saveMediaItem(`cursor_${unKey}`, null);
      }

      // Clear all builder inputs
      if (bUsername) bUsername.value = '';
      if (bBio) bBio.value = '';
      if (bDiscordId) bDiscordId.value = '';
      if (bColor) bColor.value = '#ffffff';
      if (bColorHex) bColorHex.value = '#ffffff';

      if (dashDeleteModal) dashDeleteModal.style.display = 'none';

      stopProfileAudioImmediately();
      window.location.hash = '#home';
      updateNavButton();
      renderLandingMembers();

      showToast(`"${deletedName}" hesabı başarıyla silindi.`, 'success');
    });
  }


  // Badge Selection State & Handlers
  let selectedBadges = [];
  document.addEventListener('click', (e) => {
    const badgeBtn = e.target.closest('.badge-toggle-btn');
    if (badgeBtn) {
      const badge = badgeBtn.getAttribute('data-badge');
      if (selectedBadges.includes(badge)) {
        selectedBadges = selectedBadges.filter(b => b !== badge);
        badgeBtn.classList.remove('active');
      } else {
        selectedBadges.push(badge);
        badgeBtn.classList.add('active');
      }
    }
  });

  // Custom Badges State & Handlers
  let customBadges = []; // Array of { text: string, color: string }

  const bCustomBadgeText = document.getElementById('b-custom-badge-text');
  const bCustomBadgeColor = document.getElementById('b-custom-badge-color');
  const bCustomBadgeColorHex = document.getElementById('b-custom-badge-color-hex');
  const bAddCustomBadgeBtn = document.getElementById('b-add-custom-badge-btn');
  const bCustomBadgesList = document.getElementById('b-custom-badges-list');

  bindColorPicker(bCustomBadgeColor, bCustomBadgeColorHex);

  if (bAddCustomBadgeBtn) {
    bAddCustomBadgeBtn.addEventListener('click', () => {
      const text = bCustomBadgeText ? bCustomBadgeText.value.trim().toUpperCase() : '';
      const color = bCustomBadgeColor ? bCustomBadgeColor.value : '#a855f7';
      if (!text) {
        showToast('Lütfen bir rozet adı yazın (örn: VIP).', 'error');
        return;
      }
      if (customBadges.some(b => b.text === text)) {
        showToast('Bu isimde bir rozet zaten ekli.', 'error');
        return;
      }
      customBadges.push({ text, color });
      if (bCustomBadgeText) bCustomBadgeText.value = '';
      renderCustomBadgesList();
    });
  }

  function renderCustomBadgesList() {
    if (!bCustomBadgesList) return;
    bCustomBadgesList.innerHTML = '';
    customBadges.forEach((b, idx) => {
      const badgeSpan = document.createElement('span');
      badgeSpan.className = 'p-badge custom-badge';
      badgeSpan.style.borderColor = b.color;
      badgeSpan.style.color = b.color;
      badgeSpan.style.background = b.color + '1f';
      badgeSpan.style.boxShadow = `0 0 10px ${b.color}44`;
      badgeSpan.innerHTML = `${b.text} <button type="button" class="del-custom-badge-btn" data-idx="${idx}" style="background:none;border:none;color:inherit;cursor:pointer;font-weight:bold;margin-left:4px;">&times;</button>`;
      bCustomBadgesList.appendChild(badgeSpan);
    });

    bCustomBadgesList.querySelectorAll('.del-custom-badge-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(btn.getAttribute('data-idx'));
        customBadges.splice(idx, 1);
        renderCustomBadgesList();
      });
    });
  }

  // Range Slider Value Label Sync
  if (bOpacity) {
    bOpacity.addEventListener('input', () => {
      const valEl = document.getElementById('b-opacity-val');
      if (valEl) valEl.textContent = `${bOpacity.value}%`;
    });
  }
  if (bBlur) {
    bBlur.addEventListener('input', () => {
      const valEl = document.getElementById('b-blur-val');
      if (valEl) valEl.textContent = `${bBlur.value}px`;
    });
  }

  // Color Pickers Sync
  function bindColorPicker(picker, hex) {
    if (picker && hex) {
      picker.addEventListener('input', () => { hex.value = picker.value; });
      hex.addEventListener('input', () => { if (/^#[0-9A-F]{6}$/i.test(hex.value)) picker.value = hex.value; });
    }
  }
  bindColorPicker(bColor, bColorHex);
  bindColorPicker(bTextColor, bTextColorHex);
  bindColorPicker(bBgColor, bBgColorHex);
  bindColorPicker(bIconColor, bIconColorHex);

  // All save buttons (there are 3 - one per tab)
  document.querySelectorAll('#b-save-btn, #b-save-btn-2, #b-save-btn-3').forEach(btn => {
    if (btn) {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        const un = bUsername ? bUsername.value.trim() : '';
        if (!un) {
          showToast('Lütfen önce Hesap sekmesinden kullanıcı adı girin.', 'error');
          return;
        }
        btn.textContent = 'Kaydediliyor...';
        const success = await saveCurrentBuilder();
        if (success) {
          btn.textContent = 'Kaydedildi!';
          setTimeout(() => { btn.textContent = 'Kaydet'; }, 1500);
        } else {
          btn.textContent = 'Kaydet';
        }
      });
    }
  });

  let customDropdownBound = false;
  function setupCustomDropdown() {
    const dropdown = document.getElementById('b-effect-dropdown');
    const trigger = document.getElementById('b-effect-trigger');
    const menu = document.getElementById('b-effect-menu');
    const label = document.getElementById('b-effect-selected-label');
    if (!dropdown || !trigger || !menu) return;

    if (!customDropdownBound) {
      customDropdownBound = true;
      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.toggle('open');
      });

      document.addEventListener('click', () => {
        dropdown.classList.remove('open');
      });

      menu.querySelectorAll('.dash-dropdown-item').forEach(item => {
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          const val = item.getAttribute('data-value');
          selectedEffect = val || 'none';
          
          menu.querySelectorAll('.dash-dropdown-item').forEach(i => i.classList.remove('active'));
          item.classList.add('active');

          if (label) label.textContent = item.textContent.trim();
          dropdown.classList.remove('open');
        });
      });
    }
  }

  function initBuilder() {
    setupDashboardTabs();
    renderSocialIconGrid();

    const dgBadge = document.getElementById('dg-session-badge');
    const dgMenu = document.getElementById('dg-session-menu');
    const dgLogoutBtn = document.getElementById('dg-logout-btn');
    const dSession = getDiscordSession();
    if (dgBadge && dSession) {
      dgBadge.innerHTML = `
        <img src="${dSession.user.avatar}" alt=""/>
        <span>${dSession.user.globalName}</span>
        <svg class="dg-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="6 9 12 15 18 9"/></svg>
      `;
    }
    // Kullanıcı adına/avatara tıklayınca "Hesabı Sil" ve "Discord'dan Çık" menüsü
    // sekme gibi aşağı açılıyor — chevron da yönünü değiştiriyor.
    if (dgBadge && dgMenu && !dgBadge.dataset.bound) {
      dgBadge.dataset.bound = '1';
      dgBadge.addEventListener('click', () => {
        const willOpen = !dgMenu.classList.contains('dg-menu-open');
        dgMenu.classList.toggle('dg-menu-open', willOpen);
        dgBadge.classList.toggle('dg-menu-open', willOpen);
      });
      document.addEventListener('click', (e) => {
        if (!dgBadge.contains(e.target) && !dgMenu.contains(e.target)) {
          dgMenu.classList.remove('dg-menu-open');
          dgBadge.classList.remove('dg-menu-open');
        }
      });
    }
    if (dSession && bDiscordId) {
      bDiscordId.value = dSession.user.id;
      bDiscordId.readOnly = true;
      bDiscordId.classList.add('dg-linked-input');
      fetchDiscordForBuilder(dSession.user.id);
    }
    if (dgLogoutBtn && !dgLogoutBtn.dataset.bound) {
      dgLogoutBtn.dataset.bound = '1';
      dgLogoutBtn.addEventListener('click', () => {
        discordLogout();
        window.location.hash = '#home';
        route();
      });
    }

    const bViewsCount = document.getElementById('b-views-count');
    const myAcc = getMyAccount();
    if (myAcc) {
      if (bUsername) bUsername.value = myAcc.username || '';
      if (bBio) bBio.value = myAcc.bio || '';
      if (bDiscordId) bDiscordId.value = myAcc.discordId || (dSession ? dSession.user.id : '');
      if (bColor) bColor.value = myAcc.color || '#ffffff';
      if (bColorHex) bColorHex.value = myAcc.color || '#ffffff';
      if (bTextColor) bTextColor.value = myAcc.textColor || '#ffffff';
      if (bTextColorHex) bTextColorHex.value = myAcc.textColor || '#ffffff';
      if (bBgColor) bBgColor.value = myAcc.bgColor || '#080808';
      if (bBgColorHex) bBgColorHex.value = myAcc.bgColor || '#080808';
      if (bIconColor) bIconColor.value = myAcc.iconColor || '#ffffff';
      if (bIconColorHex) bIconColorHex.value = myAcc.iconColor || '#ffffff';
      if (bLocation) bLocation.value = myAcc.location || '';
      if (bOpacity) {
        bOpacity.value = myAcc.opacity !== undefined ? myAcc.opacity : 80;
        const valEl = document.getElementById('b-opacity-val');
        if (valEl) valEl.textContent = `${bOpacity.value}%`;
      }
      if (bBlur) {
        bBlur.value = myAcc.blur !== undefined ? myAcc.blur : 0;
        const valEl = document.getElementById('b-blur-val');
        if (valEl) valEl.textContent = `${bBlur.value}px`;
      }
      if (bToggleAudio) bToggleAudio.checked = myAcc.toggleAudio !== false;
      if (bToggleDiscordAvatar) bToggleDiscordAvatar.checked = !!myAcc.toggleDiscordAvatar;
      if (bToggleAnimatedTitle) bToggleAnimatedTitle.checked = !!myAcc.toggleAnimatedTitle;
      if (bToggleViewsCount) bToggleViewsCount.checked = myAcc.toggleViewsCount !== false;
      if (bToggleBadgesDisplay) bToggleBadgesDisplay.checked = myAcc.toggleBadgesDisplay !== false;
      if (bToggleSocialGlow) bToggleSocialGlow.checked = myAcc.toggleSocialGlow !== false;
      const bToggleAudioSpectrum = document.getElementById('b-toggle-audio-spectrum');
      if (bToggleAudioSpectrum) bToggleAudioSpectrum.checked = myAcc.toggleAudioSpectrum !== false;

      selectedEffect = myAcc.effect || 'none';
      selectedBadges = myAcc.badges ? [...myAcc.badges] : [];
      customBadges = myAcc.customBadges ? [...myAcc.customBadges] : [];
      if (bViewsCount) bViewsCount.textContent = `${myAcc.views || 0} görüntüleme`;
      currentLinksState = myAcc.links ? [...myAcc.links] : [];
    } else {
      selectedEffect = 'none';
      if (bUsername) bUsername.value = '';
      if (bBio) bBio.value = '';
      if (bDiscordId) bDiscordId.value = dSession ? dSession.user.id : '';
      if (bColor) bColor.value = '#ffffff';
      if (bColorHex) bColorHex.value = '#ffffff';
      if (bTextColor) bTextColor.value = '#ffffff';
      if (bTextColorHex) bTextColorHex.value = '#ffffff';
      if (bBgColor) bBgColor.value = '#080808';
      if (bBgColorHex) bBgColorHex.value = '#080808';
      if (bIconColor) bIconColor.value = '#ffffff';
      if (bIconColorHex) bIconColorHex.value = '#ffffff';
      if (bLocation) bLocation.value = '';
      if (bOpacity) { bOpacity.value = 80; const valEl = document.getElementById('b-opacity-val'); if (valEl) valEl.textContent = '80%'; }
      if (bBlur) { bBlur.value = 0; const valEl = document.getElementById('b-blur-val'); if (valEl) valEl.textContent = '0px'; }
      if (bToggleAudio) bToggleAudio.checked = true;
      if (bToggleDiscordAvatar) bToggleDiscordAvatar.checked = false;
      if (bToggleAnimatedTitle) bToggleAnimatedTitle.checked = false;
      if (bToggleViewsCount) bToggleViewsCount.checked = true;
      if (bToggleBadgesDisplay) bToggleBadgesDisplay.checked = true;
      if (bToggleSocialGlow) bToggleSocialGlow.checked = true;
      const bToggleAudioSpectrum = document.getElementById('b-toggle-audio-spectrum');
      if (bToggleAudioSpectrum) bToggleAudioSpectrum.checked = true;

      selectedBadges = [];
      customBadges = [];
      if (bViewsCount) bViewsCount.textContent = '0 görüntüleme';
      currentLinksState = [];
    }

    // Setup Guns.lol Custom Dropdown UI
    setupCustomDropdown();
    const dropdown = document.getElementById('b-effect-dropdown');
    const label = document.getElementById('b-effect-selected-label');
    if (dropdown) {
      const activeItem = dropdown.querySelector(`.dash-dropdown-item[data-value="${selectedEffect || 'none'}"]`);
      if (activeItem) {
        dropdown.querySelectorAll('.dash-dropdown-item').forEach(i => i.classList.remove('active'));
        activeItem.classList.add('active');
        if (label) label.textContent = activeItem.textContent.trim();
      }
    }

    // Sync badge buttons UI & render custom badges list
    document.querySelectorAll('.badge-toggle-btn').forEach(btn => {
      const badge = btn.getAttribute('data-badge');
      if (selectedBadges.includes(badge)) btn.classList.add('active');
      else btn.classList.remove('active');
    });
    renderCustomBadgesList();

    avatarDataUrl = '';
    fetchedDiscordAvatar = '';
    fetchedDiscordBanner = '';
    bgVideoDataUrl = '';
    bgMusicDataUrl = '';
    cursorDataUrl = '';

    if (myAcc && myAcc.username) {
      const unKey = myAcc.username.toLowerCase();
      getMediaItem(`video_${unKey}`).then(v => {
        if (v) {
          bgVideoDataUrl = v;
          if (bBgVideoFileName) bBgVideoFileName.textContent = 'Arka plan yüklü';
          if (bBgVideoDeleteBtn) bBgVideoDeleteBtn.style.display = 'inline-flex';
        } else {
          if (bBgVideoFileName) bBgVideoFileName.textContent = 'Dosya yüklemek için tıkla';
          if (bBgVideoDeleteBtn) bBgVideoDeleteBtn.style.display = 'none';
        }
      });
      getMediaItem(`music_${unKey}`).then(m => {
        if (m) {
          bgMusicDataUrl = m;
          if (bBgMusicFileName) bBgMusicFileName.textContent = 'Ses dosyası yüklü';
          if (bBgMusicDeleteBtn) bBgMusicDeleteBtn.style.display = 'inline-flex';
        } else {
          if (bBgMusicFileName) bBgMusicFileName.textContent = 'Ses dosyası yükle';
          if (bBgMusicDeleteBtn) bBgMusicDeleteBtn.style.display = 'none';
        }
      });
      getMediaItem(`avatar_${unKey}`).then(a => {
        if (a) {
          avatarDataUrl = a;
          if (bAvatarFileName) bAvatarFileName.textContent = 'Avatar yüklü';
          if (bAvatarDeleteBtn) bAvatarDeleteBtn.style.display = 'inline-flex';
        } else {
          if (bAvatarFileName) bAvatarFileName.textContent = 'PNG, JPG, GIF';
          if (bAvatarDeleteBtn) bAvatarDeleteBtn.style.display = 'none';
        }
      });
      getMediaItem(`cursor_${unKey}`).then(c => {
        if (c) {
          cursorDataUrl = c;
          if (bCursorFileName) bCursorFileName.textContent = 'İmleç yüklü';
          if (bCursorDeleteBtn) bCursorDeleteBtn.style.display = 'inline-flex';
        } else {
          if (bCursorFileName) bCursorFileName.textContent = 'GIF veya PNG yükle';
          if (bCursorDeleteBtn) bCursorDeleteBtn.style.display = 'none';
        }
      });
    } else {
      if (bAvatarFileName) bAvatarFileName.textContent = 'PNG, JPG, GIF';
      if (bBgVideoFileName) bBgVideoFileName.textContent = 'Dosya yüklemek için tıkla';
      if (bBgMusicFileName) bBgMusicFileName.textContent = 'Ses dosyası yükle';
      if (bCursorFileName) bCursorFileName.textContent = 'GIF veya PNG yükle';

      if (bBgVideoDeleteBtn) bBgVideoDeleteBtn.style.display = 'none';
      if (bBgMusicDeleteBtn) bBgMusicDeleteBtn.style.display = 'none';
      if (bAvatarDeleteBtn) bAvatarDeleteBtn.style.display = 'none';
      if (bCursorDeleteBtn) bCursorDeleteBtn.style.display = 'none';
    }

    renderAddedLinks();
  }

  // PLATFORM CHIPS SELECTION
  function setupPlatformChips() {
    const chips = document.querySelectorAll('.p-chip');
    chips.forEach(chip => {
      chip.addEventListener('click', () => {
        chips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        currentSelectedPlatform = chip.getAttribute('data-platform');
        
        if (bLinkLabel) {
          bLinkLabel.placeholder = `${chip.textContent.trim()} Bağlantısı`;
          bLinkLabel.value = chip.textContent.trim();
        }
      });
    });
  }

  // DISCORD BOT FETCH FOR BUILDER PREVIEW
  function fetchDiscordForBuilder(id) {
    if (!id) {
      fetchedDiscordAvatar = '';
      fetchedDiscordBanner = '';
      const prevStatusDot = document.getElementById('prev-status-dot');
      const prevStatusLabel = document.getElementById('prev-status-label');
      if (prevStatusDot) prevStatusDot.className = 'inline-status-dot offline';
      if (prevStatusLabel) { prevStatusLabel.textContent = ''; prevStatusLabel.className = 'inline-status-label offline'; }
      updateLivePreview();
      return;
    }

    fetch(`http://localhost:3001/presence/${id}`)
      .then(r => r.json())
      .then(res => {
        if (res && res.success && res.data) {
          const d = res.data;
          if (d.avatar) fetchedDiscordAvatar = d.avatar;
          if (d.banner) fetchedDiscordBanner = d.banner;

          const prevStatusDot = document.getElementById('prev-status-dot');
          const prevStatusLabel = document.getElementById('prev-status-label');
          const st = d.status || 'offline';
          if (prevStatusDot) prevStatusDot.className = `inline-status-dot ${st}`;

          const statusTextMap = {
            online:  'online',
            idle:    'idle',
            dnd:     'do not disturb',
            offline: ''
          };
          // Builder Preview Spotify widget
          const prevSpWidget = document.getElementById('prev-spotify-widget');
          const prevSpSong   = document.getElementById('prev-sp-song');
          const prevSpArtist = document.getElementById('prev-sp-artist');
          if (d.spotify && prevSpWidget) {
            prevSpWidget.style.display = 'flex';
            if (prevSpSong)   prevSpSong.textContent   = d.spotify.song   || '—';
            if (prevSpArtist) prevSpArtist.textContent = d.spotify.artist || '—';
          } else if (prevSpWidget) {
            prevSpWidget.style.display = 'none';
          }

          updateLivePreview();
        }
      })
      .catch(() => {});
  }

  if (bDiscordId) {
    ['input', 'change', 'paste', 'keyup'].forEach(evt => {
      bDiscordId.addEventListener(evt, () => {
        clearTimeout(discordDebounceTimer);
        const id = bDiscordId.value.trim();
        discordDebounceTimer = setTimeout(() => {
          fetchDiscordForBuilder(id);
        }, 200);
      });
    });
  }

  // FILE UPLOAD & DELETE HANDLERS
  let cursorDataUrl = '';

  if (bAvatarFile) {
    bAvatarFile.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        bAvatarFileName.textContent = file.name;
        if (bAvatarDeleteBtn) bAvatarDeleteBtn.style.display = 'inline-flex';
        const reader = new FileReader();
        reader.onload = (evt) => {
          avatarDataUrl = evt.target.result;
          updateLivePreview();
        };
        reader.readAsDataURL(file);
      }
    });
  }
  if (bAvatarDeleteBtn) {
    bAvatarDeleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      avatarDataUrl = '';
      if (bAvatarFile) bAvatarFile.value = '';
      if (bAvatarFileName) bAvatarFileName.textContent = 'PNG, JPG, GIF';
      bAvatarDeleteBtn.style.display = 'none';
      const myAcc = getMyAccount();
      if (myAcc && myAcc.username) saveMediaItem(`avatar_${myAcc.username.toLowerCase()}`, null);
      updateLivePreview();
      showToast('Profil avatarı silindi.', 'success');
    });
  }

  if (bBgVideoFile) {
    bBgVideoFile.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        bBgVideoFileName.textContent = file.name;
        if (bBgVideoDeleteBtn) bBgVideoDeleteBtn.style.display = 'inline-flex';
        const reader = new FileReader();
        reader.onload = (evt) => {
          bgVideoDataUrl = evt.target.result;
        };
        reader.readAsDataURL(file);
      }
    });
  }
  if (bBgVideoDeleteBtn) {
    bBgVideoDeleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      bgVideoDataUrl = '';
      if (bBgVideoFile) bBgVideoFile.value = '';
      if (bBgVideoFileName) bBgVideoFileName.textContent = 'Dosya yüklemek için tıkla';
      bBgVideoDeleteBtn.style.display = 'none';
      const myAcc = getMyAccount();
      if (myAcc && myAcc.username) saveMediaItem(`video_${myAcc.username.toLowerCase()}`, null);
      showToast('Arka plan medyası silindi.', 'success');
    });
  }

  if (bBgMusicFile) {
    bBgMusicFile.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        bBgMusicFileName.textContent = file.name;
        if (bBgMusicDeleteBtn) bBgMusicDeleteBtn.style.display = 'inline-flex';
        const reader = new FileReader();
        reader.onload = (evt) => {
          bgMusicDataUrl = evt.target.result;
        };
        reader.readAsDataURL(file);
      }
    });
  }
  if (bBgMusicDeleteBtn) {
    bBgMusicDeleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      bgMusicDataUrl = '';
      if (bBgMusicFile) bBgMusicFile.value = '';
      if (bBgMusicFileName) bBgMusicFileName.textContent = 'Ses dosyası yükle';
      bBgMusicDeleteBtn.style.display = 'none';
      const myAcc = getMyAccount();
      if (myAcc && myAcc.username) saveMediaItem(`music_${myAcc.username.toLowerCase()}`, null);
      showToast('Ses dosyası silindi.', 'success');
    });
  }

  if (bCursorFile) {
    bCursorFile.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        if (bCursorFileName) bCursorFileName.textContent = file.name;
        if (bCursorDeleteBtn) bCursorDeleteBtn.style.display = 'inline-flex';
        const reader = new FileReader();
        reader.onload = (evt) => {
          cursorDataUrl = evt.target.result;
        };
        reader.readAsDataURL(file);
      }
    });
  }
  if (bCursorDeleteBtn) {
    bCursorDeleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      cursorDataUrl = '';
      if (bCursorFile) bCursorFile.value = '';
      if (bCursorFileName) bCursorFileName.textContent = 'GIF veya PNG yükle';
      bCursorDeleteBtn.style.display = 'none';
      const myAcc = getMyAccount();
      if (myAcc && myAcc.username) saveMediaItem(`cursor_${myAcc.username.toLowerCase()}`, null);
      showToast('Özel imleç silindi.', 'success');
    });
  }

  // Color picker sync
  if (bColor && bColorHex) {
    bColor.addEventListener('input', () => {
      bColorHex.value = bColor.value;
      updateLivePreview();
    });
    bColorHex.addEventListener('input', () => {
      if (/^#[0-9A-F]{6}$/i.test(bColorHex.value)) {
        bColor.value = bColorHex.value;
        updateLivePreview();
      }
    });
  }

  ['input', 'keyup', 'change', 'paste'].forEach(evt => {
    if (bUsername) bUsername.addEventListener(evt, updateLivePreview);
    if (bBio) bBio.addEventListener(evt, updateLivePreview);
  });

  // Add Link
  if (bLinkAddBtn) {
    bLinkAddBtn.addEventListener('click', () => {
      const platform = currentSelectedPlatform || 'youtube';
      const label = bLinkLabel.value.trim() || platform.toUpperCase();
      const url = bLinkUrl.value.trim() || '#';

      currentLinksState.push({ platform, label, url });
      bLinkLabel.value = '';
      bLinkUrl.value = '';
      renderAddedLinks();
      updateLivePreview();

      // Close modal after adding
      const modal = document.getElementById('dash-link-modal');
      if (modal) modal.style.display = 'none';
    });
  }

  function renderAddedLinks() {
    if (!bLinksList) return;
    bLinksList.innerHTML = '';
    currentLinksState.forEach((item, index) => {
      const div = document.createElement('div');
      div.className = 'added-link-item';
      div.innerHTML = `
        <div class="ali-info">
          <span class="ali-platform">${item.platform}</span>
          <span class="ali-label">${item.label}</span>
        </div>
        <button class="ali-del-btn" data-index="${index}">&times;</button>
      `;
      bLinksList.appendChild(div);
    });

    bLinksList.querySelectorAll('.ali-del-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.target.getAttribute('data-index'));
        currentLinksState.splice(idx, 1);
        renderAddedLinks();
        updateLivePreview();
      });
    });
  }

  // LIVE PREVIEW UPDATE (GUNS.LOL STYLE)
  function updateLivePreview() {
    const un = (bUsername && bUsername.value.trim()) || 'seyoria_o';
    const color = (bColor && bColor.value) || '#ffffff';
    const bio = (bBio && bBio.value.trim()) || 'currently doing nothing';
    const customUrl = '';

    if (prevUsername) {
      prevUsername.textContent = un;
      prevUsername.style.color = color;
    }
    if (prevBio) prevBio.textContent = bio;

    // Avatar Priority: Uploaded File > Custom Avatar URL > Fetched Discord Avatar > DiceBear
    const displayAvatar = avatarDataUrl || customUrl || fetchedDiscordAvatar || `https://api.dicebear.com/9.x/pixel-art/svg?seed=${un}&backgroundColor=111111`;
    if (prevAvatar) {
      prevAvatar.src = displayAvatar;
    }

    if (prevBanner && prevBannerImg) {
      if (fetchedDiscordBanner) {
        prevBannerImg.src = fetchedDiscordBanner;
        prevBanner.style.display = 'block';
      } else {
        prevBanner.style.display = 'none';
      }
    }

    // Guns.lol Style Glowing Icon Row Rendering
    if (prevLinks) {
      prevLinks.innerHTML = '';
      currentLinksState.forEach(l => {
        const a = document.createElement('a');
        a.className = 'p-icon-link';
        a.href = l.url || '#';
        a.title = l.label;
        a.innerHTML = getPlatformIconSVG(l.platform);
        prevLinks.appendChild(a);
      });
    }
  }

  const RESERVED_USERNAMES = new Set([
    'admin', 'administrator', 'momus', 'moderator', 'mod', 'staff', 'support',
    'help', 'api', 'builder', 'home', 'login', 'logout', 'auth', 'discord',
    'settings', 'dashboard', 'root', 'system', 'null', 'undefined', 'seyoria',
    'about', 'terms', 'privacy', 'contact', 'official', 'security', 'billing'
  ]);
  const USERNAME_REGEX = /^[a-z0-9_.]{3,20}$/;

  function validateUsername(un) {
    const key = un.toLowerCase();
    if (!USERNAME_REGEX.test(key)) {
      return '3-20 karakter, sadece harf/rakam/_/. kullanabilirsin.';
    }
    if (RESERVED_USERNAMES.has(key)) {
      return `"${un}" adı ayrılmış, başka bir ad seç.`;
    }
    return null;
  }

  async function saveCurrentBuilder() {
    const un = (bUsername && bUsername.value.trim()) || 'seyoria_o';
    const unKey = un.toLowerCase();
    const discordIdVal = (bDiscordId && bDiscordId.value.trim()) || '';

    const usernameError = validateUsername(un);
    if (usernameError) {
      showToast(usernameError, 'error');
      return false;
    }

    // ── UNIQUE ACCOUNT CHECK (Only 1 account per Username & Discord ID) ──
    const existingProfiles = getProfiles();
    for (const key in existingProfiles) {
      const p = existingProfiles[key];
      // Check username collision with another profile
      if (key !== unKey && p.username && p.username.toLowerCase() === unKey) {
        showToast(`"${un}" kullanıcı adı başka bir hesap tarafından kullanılıyor!`, 'error');
        return false;
      }
      // Check Discord ID collision with another profile
      if (discordIdVal && key !== unKey && p.discordId && p.discordId === discordIdVal) {
        showToast(`Discord User ID "${discordIdVal}" zaten "${p.username}" hesabına tanımlı!`, 'error');
        return false;
      }
    }

    // Save heavy media to IndexedDB (supports 1GB+ large MP4/MP3 files without quota errors)
    if (bgVideoDataUrl) saveMediaItem(`video_${unKey}`, bgVideoDataUrl);
    if (bgMusicDataUrl) saveMediaItem(`music_${unKey}`, bgMusicDataUrl);
    if (avatarDataUrl)  saveMediaItem(`avatar_${unKey}`, avatarDataUrl);
    if (cursorDataUrl)  saveMediaItem(`cursor_${unKey}`, cursorDataUrl);

    // Preserve existing views count
    const existingProfile = existingProfiles[unKey];
    // Save active selected effect
    const profile = {
      username: un,
      color: (bColor && bColor.value) || '#ffffff',
      textColor: (bTextColor && bTextColor.value) || '#ffffff',
      bgColor: (bBgColor && bBgColor.value) || '#080808',
      iconColor: (bIconColor && bIconColor.value) || '#ffffff',
      location: (bLocation && bLocation.value.trim()) || '',
      opacity: bOpacity ? parseInt(bOpacity.value) : 80,
      blur: bBlur ? parseInt(bBlur.value) : 0,
      badges: [...selectedBadges],
      customBadges: [...customBadges],
      effect: (document.getElementById('b-effect-select') ? document.getElementById('b-effect-select').value : selectedEffect) || 'none',
      toggleAudio: bToggleAudio ? bToggleAudio.checked : true,
      toggleDiscordAvatar: bToggleDiscordAvatar ? bToggleDiscordAvatar.checked : false,
      toggleAnimatedTitle: bToggleAnimatedTitle ? bToggleAnimatedTitle.checked : false,
      toggleViewsCount: bToggleViewsCount ? bToggleViewsCount.checked : true,
      toggleBadgesDisplay: bToggleBadgesDisplay ? bToggleBadgesDisplay.checked : true,
      toggleSocialGlow: bToggleSocialGlow ? bToggleSocialGlow.checked : true,
      toggleAudioSpectrum: document.getElementById('b-toggle-audio-spectrum') ? document.getElementById('b-toggle-audio-spectrum').checked : true,
      bio: (bBio && bBio.value.trim()) || 'currently doing nothing',
      discordId: discordIdVal,
      customAvatarUrl: '',
      hasCustomAvatar: !!avatarDataUrl,
      hasBgVideo: !!bgVideoDataUrl,
      hasBgMusic: !!bgMusicDataUrl,
      avatar: avatarDataUrl || '',
      discordAvatar: fetchedDiscordAvatar || '',
      discordBanner: fetchedDiscordBanner || '',
      bgVideo: bgVideoDataUrl || '',
      music: bgMusicDataUrl || '',
      links: [...currentLinksState],
      views: (existingProfile && existingProfile.views) || 0
    };
    const ok = await saveProfileData(profile);
    if (!ok) return false;
    updateNavButton();
    return true;
  }

  // ── HORIZONTAL SCROLLABLE EFFECT CARDS LISTENER ──
  let selectedEffect = 'none';
  const effectsScroll = document.getElementById('b-effects-scroll');
  if (effectsScroll) {
    effectsScroll.addEventListener('click', (e) => {
      const card = e.target.closest('.effect-card');
      if (card) {
        effectsScroll.querySelectorAll('.effect-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        selectedEffect = card.getAttribute('data-effect') || 'none';
      }
    });
  }

  // ── CANVAS BACKGROUND EFFECT ENGINES ──
  let particleAnimId = null;

  function stopBackgroundEffects() {
    if (particleAnimId) {
      cancelAnimationFrame(particleAnimId);
      particleAnimId = null;
    }
    const canvas = document.getElementById('p-particles-canvas');
    if (canvas) canvas.style.display = 'none';
  }

  function startBackgroundEffect(effectName) {
    stopBackgroundEffects();
    if (!effectName || effectName === 'none') return;

    if (effectName === 'snowfall') { startSnowfallAnimation(); return; }
    if (effectName === 'particles') { startParticlesAnimation(); return; }
    if (effectName === 'rain') { startRainAnimation(); return; }
    if (effectName === 'matrix') { startMatrixAnimation(); return; }
    if (effectName === 'starfield') { startStarfieldAnimation(); return; }
    if (effectName === 'neonwaves') { startNeonWavesAnimation(); return; }
    if (effectName === 'fireflies') { startFirefliesAnimation(); return; }
    if (effectName === 'cybernet') { startCybernetAnimation(); return; }
    if (effectName === 'plasma') { startPlasmaAnimation(); return; }
  }

  function startSnowfallAnimation() {
    const canvas = document.getElementById('p-particles-canvas');
    if (!canvas) return;
    canvas.style.display = 'block';
    const ctx = canvas.getContext('2d');
    let width = canvas.width = window.innerWidth;
    let height = canvas.height = window.innerHeight;

    const snowflakes = Array.from({ length: 60 }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      r: Math.random() * 2.5 + 1,
      vy: Math.random() * 1.2 + 0.6,
      vx: (Math.random() - 0.5) * 0.4,
      alpha: Math.random() * 0.7 + 0.3
    }));

    function draw() {
      ctx.clearRect(0, 0, width, height);
      snowflakes.forEach(p => {
        p.y += p.vy;
        p.x += p.vx + Math.sin(p.y * 0.01) * 0.3;
        if (p.y > height) { p.y = -5; p.x = Math.random() * width; }
        if (p.x < 0) p.x = width;
        if (p.x > width) p.x = 0;

        ctx.fillStyle = `rgba(255, 255, 255, ${p.alpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      });
      particleAnimId = requestAnimationFrame(draw);
    }
    draw();
  }

  function startParticlesAnimation() {
    const canvas = document.getElementById('p-particles-canvas');
    if (!canvas) return;
    canvas.style.display = 'block';
    const ctx = canvas.getContext('2d');
    let width = canvas.width = window.innerWidth;
    let height = canvas.height = window.innerHeight;

    const particles = Array.from({ length: 45 }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      r: Math.random() * 2 + 0.5,
      vx: (Math.random() - 0.5) * 0.4,
      vy: -Math.random() * 0.5 - 0.2,
      alpha: Math.random() * 0.5 + 0.2
    }));

    function draw() {
      ctx.clearRect(0, 0, width, height);
      particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.y < 0) { p.y = height; p.x = Math.random() * width; }
        if (p.x < 0 || p.x > width) p.vx *= -1;
        ctx.fillStyle = `rgba(255, 255, 255, ${p.alpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      });
      particleAnimId = requestAnimationFrame(draw);
    }
    draw();
  }

  function startRainAnimation() {
    const canvas = document.getElementById('p-particles-canvas');
    if (!canvas) return;
    canvas.style.display = 'block';
    const ctx = canvas.getContext('2d');
    let width = canvas.width = window.innerWidth;
    let height = canvas.height = window.innerHeight;

    const raindrops = Array.from({ length: 80 }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      len: Math.random() * 14 + 10,
      vy: Math.random() * 8 + 12,
      alpha: Math.random() * 0.4 + 0.2
    }));

    function draw() {
      ctx.clearRect(0, 0, width, height);
      ctx.lineWidth = 1;
      raindrops.forEach(r => {
        ctx.strokeStyle = `rgba(168, 85, 247, ${r.alpha})`;
        ctx.beginPath();
        ctx.moveTo(r.x, r.y);
        ctx.lineTo(r.x - 1, r.y + r.len);
        ctx.stroke();

        r.y += r.vy;
        if (r.y > height) { r.y = -20; r.x = Math.random() * width; }
      });
      particleAnimId = requestAnimationFrame(draw);
    }
    draw();
  }

  function startMatrixAnimation() {
    const canvas = document.getElementById('p-particles-canvas');
    if (!canvas) return;
    canvas.style.display = 'block';
    const ctx = canvas.getContext('2d');
    let width = canvas.width = window.innerWidth;
    let height = canvas.height = window.innerHeight;

    const cols = Math.floor(width / 20);
    const drops = Array(cols).fill(1);
    const chars = '01ABCDEFGHIJKLMNOPQRSTUVWXYZ@#$';

    function draw() {
      ctx.fillStyle = 'rgba(8, 8, 8, 0.1)';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#a855f7';
      ctx.font = '13px monospace';

      for (let i = 0; i < drops.length; i++) {
        const text = chars[Math.floor(Math.random() * chars.length)];
        ctx.fillText(text, i * 20, drops[i] * 20);
        if (drops[i] * 20 > height && Math.random() > 0.975) {
          drops[i] = 0;
        }
        drops[i]++;
      }
      particleAnimId = requestAnimationFrame(draw);
    }
    draw();
  }

  function startStarfieldAnimation() {
    const canvas = document.getElementById('p-particles-canvas');
    if (!canvas) return;
    canvas.style.display = 'block';
    const ctx = canvas.getContext('2d');
    let width = canvas.width = window.innerWidth;
    let height = canvas.height = window.innerHeight;

    const stars = Array.from({ length: 90 }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      r: Math.random() * 1.8 + 0.4,
      alpha: Math.random(),
      speed: Math.random() * 0.02 + 0.005
    }));

    function draw() {
      ctx.clearRect(0, 0, width, height);
      stars.forEach(s => {
        s.alpha += s.speed;
        if (s.alpha > 1 || s.alpha < 0) s.speed *= -1;
        ctx.fillStyle = `rgba(255, 255, 255, ${Math.abs(s.alpha)})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      });
      particleAnimId = requestAnimationFrame(draw);
    }
    draw();
  }

  function startNeonWavesAnimation() {
    const canvas = document.getElementById('p-particles-canvas');
    if (!canvas) return;
    canvas.style.display = 'block';
    const ctx = canvas.getContext('2d');
    let width = canvas.width = window.innerWidth;
    let height = canvas.height = window.innerHeight;
    let step = 0;

    function draw() {
      ctx.clearRect(0, 0, width, height);
      step += 0.02;
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(168, 85, 247, 0.25)';

      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        for (let x = 0; x <= width; x += 20) {
          const y = Math.sin(x * 0.005 + step + i) * 35 + (height / 2) + (i * 20 - 40);
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      particleAnimId = requestAnimationFrame(draw);
    }
    draw();
  }

  function startFirefliesAnimation() {
    const canvas = document.getElementById('p-particles-canvas');
    if (!canvas) return;
    canvas.style.display = 'block';
    const ctx = canvas.getContext('2d');
    let width = canvas.width = window.innerWidth;
    let height = canvas.height = window.innerHeight;

    const flies = Array.from({ length: 40 }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      r: Math.random() * 2.5 + 1,
      vx: (Math.random() - 0.5) * 0.8,
      vy: (Math.random() - 0.5) * 0.8,
      alpha: Math.random() * 0.8 + 0.2,
      pulse: Math.random() * 0.05
    }));

    function draw() {
      ctx.clearRect(0, 0, width, height);
      flies.forEach(f => {
        f.x += f.vx;
        f.y += f.vy;
        if (f.x < 0 || f.x > width) f.vx *= -1;
        if (f.y < 0 || f.y > height) f.vy *= -1;

        f.alpha += f.pulse;
        if (f.alpha > 1 || f.alpha < 0.2) f.pulse *= -1;

        ctx.fillStyle = `rgba(168, 85, 247, ${Math.abs(f.alpha)})`;
        ctx.shadowBlur = 12;
        ctx.shadowColor = '#a855f7';
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      });
      particleAnimId = requestAnimationFrame(draw);
    }
    draw();
  }

  function startCybernetAnimation() {
    const canvas = document.getElementById('p-particles-canvas');
    if (!canvas) return;
    canvas.style.display = 'block';
    const ctx = canvas.getContext('2d');
    let width = canvas.width = window.innerWidth;
    let height = canvas.height = window.innerHeight;

    const nodes = Array.from({ length: 35 }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.6,
      vy: (Math.random() - 0.5) * 0.6
    }));

    function draw() {
      ctx.clearRect(0, 0, width, height);
      nodes.forEach((n, i) => {
        n.x += n.vx;
        n.y += n.vy;
        if (n.x < 0 || n.x > width) n.vx *= -1;
        if (n.y < 0 || n.y > height) n.vy *= -1;

        ctx.fillStyle = 'rgba(168, 85, 247, 0.6)';
        ctx.beginPath();
        ctx.arc(n.x, n.y, 2, 0, Math.PI * 2);
        ctx.fill();

        for (let j = i + 1; j < nodes.length; j++) {
          const n2 = nodes[j];
          const dist = Math.hypot(n.x - n2.x, n.y - n2.y);
          if (dist < 120) {
            ctx.strokeStyle = `rgba(168, 85, 247, ${1 - dist / 120})`;
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(n.x, n.y);
            ctx.lineTo(n2.x, n2.y);
            ctx.stroke();
          }
        }
      });
      particleAnimId = requestAnimationFrame(draw);
    }
    draw();
  }

  function startPlasmaAnimation() {
    const canvas = document.getElementById('p-particles-canvas');
    if (!canvas) return;
    canvas.style.display = 'block';
    const ctx = canvas.getContext('2d');
    let width = canvas.width = window.innerWidth;
    let height = canvas.height = window.innerHeight;
    let time = 0;

    function draw() {
      ctx.clearRect(0, 0, width, height);
      time += 0.03;
      const x = Math.sin(time) * 100 + width / 2;
      const y = Math.cos(time * 0.8) * 80 + height / 2;

      const grad = ctx.createRadialGradient(x, y, 10, width / 2, height / 2, width / 1.5);
      grad.addColorStop(0, 'rgba(168, 85, 247, 0.2)');
      grad.addColorStop(0.5, 'rgba(147, 51, 234, 0.08)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
      particleAnimId = requestAnimationFrame(draw);
    }
    draw();
  }

  function stopParticlesAnimation() {
    if (particleAnimId) {
      cancelAnimationFrame(particleAnimId);
      particleAnimId = null;
    }
    const canvas = document.getElementById('p-particles-canvas');
    if (canvas) canvas.style.display = 'none';
  }

  // ── ANIMATED PAGE TRANSITION OVERLAY HELPER ──
  function triggerPageTransition(callback) {
    const pt = document.getElementById('page-transition');
    if (!pt) {
      if (callback) callback();
      return;
    }
    pt.classList.add('active');
    setTimeout(() => {
      if (callback) callback();
      setTimeout(() => {
        pt.classList.remove('active');
      }, 400);
    }, 450);
  }

  // ── DYNAMIC PROFILE VIEW (GUNS.LOL AESTHETIC) ──
  async function renderProfilePage(profile) {
    const unKey = profile.username.toLowerCase();
    document.documentElement.style.setProperty('--user-color', profile.color || '#ffffff');
    document.title = `${profile.username} | momus`;

    // ── PROFILE VIEW COUNTER (sahibi hariç, sadece ziyaretçiler için artar) ──
    if (!isProfileOwner(unKey)) {
      profile.views = (profile.views || 0) + 1;
      await saveProfileData(profile);
    }
    const viewViewsCount = document.getElementById('view-views-count');
    if (viewViewsCount) viewViewsCount.textContent = profile.views || 0;

    // ── OWNER PROTECTION FOR SETTINGS BUTTON ──
    const pSettingsBtn = document.getElementById('p-settings-btn');
    if (pSettingsBtn) {
      pSettingsBtn.onclick = (e) => {
        if (!isProfileOwner(unKey)) {
          e.preventDefault();
          showToast(`🔒 "${profile.username}" profilinin ayarlarını sadece profil sahibi değiştirebilir!`, 'error');
          return false;
        }
      };
    }

    // ── CLICK TO ENTER OVERLAY (guns.lol exact) ──
    const clickOverlay = document.getElementById('p-click-overlay');
    const audioEl = document.getElementById('p-bg-audio');
    const bgVidEl = document.getElementById('p-bg-video');

    if (clickOverlay) {
      clickOverlay.classList.remove('fade-out');
      clickOverlay.style.display = 'flex';

      const handleClick = () => {
        clickOverlay.classList.add('fade-out');
        // Start video after user interaction
        if (bgVidEl && bgVidEl.src) bgVidEl.play().catch(() => {});
        
        // Smooth audio volume fade-in (yavaş yavaş açılma)
        if (audioEl && audioEl.src) {
          audioEl.volume = 0;
          audioEl.play().then(() => {
            let curVol = 0;
            const targetVol = 0.35;
            const fadeTimer = setInterval(() => {
              curVol += 0.02;
              if (curVol >= targetVol) {
                audioEl.volume = targetVol;
                clearInterval(fadeTimer);
              } else {
                audioEl.volume = curVol;
              }
            }, 60);
          }).catch(() => {});
        }

        clickOverlay.removeEventListener('click', handleClick);
        setTimeout(() => { clickOverlay.style.display = 'none'; }, 600);
      };
      clickOverlay.addEventListener('click', handleClick);
    }

    // ── APPLY ADVANCED CUSTOMIZATIONS ──
    const pCard = document.getElementById('p-card');
    if (pCard) {
      pCard.style.opacity = (profile.opacity !== undefined ? profile.opacity : 80) / 100;
      pCard.style.backdropFilter = `blur(${profile.blur || 0}px)`;
      pCard.style.webkitBackdropFilter = `blur(${profile.blur || 0}px)`;
    }

    // Render Preset & Custom Badges
    const viewBadges = document.getElementById('view-badges');
    if (viewBadges) {
      viewBadges.innerHTML = '';
      if (profile.badges && profile.badges.length > 0) {
        profile.badges.forEach(b => {
          const badgeSpan = document.createElement('span');
          badgeSpan.className = `p-badge ${b}`;
          badgeSpan.textContent = b.toUpperCase();
          viewBadges.appendChild(badgeSpan);
        });
      }
      if (profile.customBadges && profile.customBadges.length > 0) {
        profile.customBadges.forEach(b => {
          const badgeSpan = document.createElement('span');
          badgeSpan.className = 'p-badge custom-badge';
          badgeSpan.style.borderColor = b.color;
          badgeSpan.style.color = b.color;
          badgeSpan.style.background = b.color + '1f';
          badgeSpan.style.boxShadow = `0 0 10px ${b.color}44`;
          badgeSpan.textContent = b.text.toUpperCase();
          viewBadges.appendChild(badgeSpan);
        });
      }
    }

    // Render Location
    const viewLoc = document.getElementById('view-location');
    const viewLocText = document.getElementById('view-location-text');
    if (viewLoc && viewLocText) {
      if (profile.location) {
        viewLocText.textContent = profile.location;
        viewLoc.style.display = 'flex';
      } else {
        viewLoc.style.display = 'none';
      }
    }

    // Apply Audio Toggle
    const pAudioSec = document.querySelector('.p-audio-section');
    if (pAudioSec) {
      pAudioSec.style.display = (profile.toggleAudio !== false) ? 'flex' : 'none';
    }

    // Apply Animated Title
    if (window.titleAnimInterval) clearInterval(window.titleAnimInterval);
    if (profile.toggleAnimatedTitle) {
      let titleText = `${profile.username} | momus `;
      let titleIdx = 0;
      window.titleAnimInterval = setInterval(() => {
        document.title = titleText.substring(titleIdx) + titleText.substring(0, titleIdx);
        titleIdx = (titleIdx + 1) % titleText.length;
      }, 300);
    }

    // Apply Canvas Background Effect Engine (Scrollable Selector)
    const activeEffect = profile.effect || (profile.toggleSnowfall ? 'snowfall' : (profile.toggleParticles ? 'particles' : 'none'));
    startBackgroundEffect(activeEffect);

    const viewAvatar = document.getElementById('view-avatar-img');
    const viewBanner = document.getElementById('view-banner');
    const viewBannerImg = document.getElementById('view-banner-img');
    const viewName   = document.getElementById('view-username');
    const viewBio    = document.getElementById('view-bio');
    const viewLinks  = document.getElementById('view-links');

    if (viewName) viewName.textContent = profile.username;
    if (viewBio) viewBio.textContent = profile.bio || 'currently doing nothing';

    // Retrieve Custom Cursor from IndexedDB if stored
    const storedCursor = await getMediaItem(`cursor_${unKey}`);
    const viewProfContainer = document.getElementById('view-profile');
    if (storedCursor && viewProfContainer) {
      viewProfContainer.style.cursor = `url(${storedCursor}), auto`;
    } else if (viewProfContainer) {
      viewProfContainer.style.cursor = 'default';
    }

    // Retrieve Custom Avatar from IndexedDB if stored, or profile
    const storedAvatar = await getMediaItem(`avatar_${unKey}`);
    let displayAvatar = storedAvatar || profile.avatar || profile.customAvatarUrl;
    if (profile.toggleDiscordAvatar && profile.discordAvatar) {
      displayAvatar = profile.discordAvatar;
    }
    if (!displayAvatar) {
      displayAvatar = `https://api.dicebear.com/9.x/pixel-art/svg?seed=${profile.username}&backgroundColor=111111`;
    }
    if (viewAvatar) viewAvatar.src = displayAvatar;

    if (profile.discordBanner && viewBanner && viewBannerImg) {
      viewBannerImg.src = profile.discordBanner;
      viewBanner.style.display = 'block';
    } else if (viewBanner) {
      viewBanner.style.display = 'none';
    }

    // Media — Load large MP4 Video from IndexedDB or profile data
    const bgVid = document.getElementById('p-bg-video');
    const bgImg = document.getElementById('p-bg-img');

    const storedVideo = await getMediaItem(`video_${unKey}`);
    const videoSource = storedVideo || profile.bgVideo;

    if (videoSource && bgVid) {
      bgVid.style.display = 'block';
      bgVid.src = videoSource;
      if (bgImg) bgImg.style.display = 'none';
    } else {
      if (bgVid) bgVid.style.display = 'none';
      if (bgImg) bgImg.style.display = 'none';
    }

    // Audio — Load MP3 Music from IndexedDB or profile data
    const storedMusic = await getMediaItem(`music_${unKey}`);
    const musicSource = storedMusic || profile.music;
    // audioEl is already declared at the top of renderProfilePage
    const slider  = document.getElementById('p-volume-slider');
    const muteBtn = document.getElementById('p-mute-btn');

    const canvasVisualizer = document.getElementById('p-audio-visualizer-canvas');
    if (canvasVisualizer) {
      if (profile.toggleAudioSpectrum !== false) {
        canvasVisualizer.style.display = 'block';
        startAudioVisualizer(profile.color || '#a855f7');
      } else {
        canvasVisualizer.style.display = 'none';
        stopAudioVisualizer();
      }
    }

    if (musicSource && audioEl) {
      audioEl.src = musicSource;
      audioEl.volume = 0.3;
      audioEl.play().catch(() => {});
    } else if (audioEl) {
      audioEl.pause();
      stopAudioVisualizer();
    }

    if (slider && audioEl) {
      slider.value = 30;
      slider.oninput = () => { audioEl.volume = slider.value / 100; };
    }
    if (muteBtn && audioEl) {
      muteBtn.onclick = () => { audioEl.muted = !audioEl.muted; };
    }

    // GUNS.LOL STYLE GLOWING ICON ROW RENDERING
    if (viewLinks) {
      viewLinks.innerHTML = '';
      if (profile.links && profile.links.length > 0) {
        profile.links.forEach(link => {
          const a = document.createElement('a');
          a.className = 'p-icon-link';
          a.href = link.url || '#';
          a.target = '_blank';
          a.rel = 'noopener';
          a.title = link.label;
          a.innerHTML = getPlatformIconSVG(link.platform);
          viewLinks.appendChild(a);
        });
      }
    }

    // DISCORD LANYARD REAL-TIME INTEGRATION
    const discordBox  = document.getElementById('view-discord-box');
    const statusDot   = document.getElementById('view-status-dot');
    const statusLabel = document.getElementById('view-status-label');
    const spCard      = document.getElementById('view-spotify-card');
    const spSong      = document.getElementById('view-sp-song');
    const spArtist    = document.getElementById('view-sp-artist');
    const actCard     = document.getElementById('view-activity-card');
    const actText     = document.getElementById('view-act-text');

    if (profile.discordId) {
      fetchPresence(profile.discordId);
      lanyardInterval = setInterval(() => fetchPresence(profile.discordId), 5000);
    } else {
      const sdot = document.getElementById('view-status-dot');
      const slabel = document.getElementById('view-status-label');
      if (sdot) { sdot.className = 'inline-status-dot offline'; }
      if (slabel) slabel.textContent = '';
    }

    function fetchPresence(id) {
      fetch(`${MOMUS_BOT_API}/presence/${id}`)
        .then(res => res.json())
        .then(res => {
          if (!res.success || !res.data) {
            // Bot API başarısız → sessizce offline göster
            if (statusDot) statusDot.className = 'inline-status-dot offline';
            if (statusLabel) { statusLabel.textContent = ''; statusLabel.className = 'inline-status-label offline'; }
            return;
          }

          const d = res.data;

          // Avatar — bottan gelen URL'yi kullan (manuel yükleme yoksa)
          if (!profile.avatar && d.avatar) {
            if (viewAvatar) viewAvatar.src = d.avatar;
          }

          // Banner
          if (d.banner && viewBanner && viewBannerImg) {
            viewBannerImg.src = d.banner;
            viewBanner.style.display = 'block';
          }

          // Status dot + label (username yanında)
          const st = d.status || 'offline';
          if (statusDot) statusDot.className = `inline-status-dot ${st}`;

          const statusTextMap = {
            online:  'online',
            idle:    'idle',
            dnd:     'do not disturb',
            offline: ''
          };
          if (statusLabel) {
            statusLabel.textContent = statusTextMap[st] || '';
            statusLabel.className = `inline-status-label ${st}`;
          }

          // Discord Activity Box — sadece bir şey varsa göster
          if (discordBox) {
            if (d.spotify || d.activity || d.customStatus) {
              discordBox.style.display = 'flex';
            } else {
              discordBox.style.display = 'none';
            }
          }

          // Spotify
          if (d.spotify && spCard) {
            spCard.style.display = 'flex';
            if (spSong)   spSong.textContent   = d.spotify.song   || '—';
            if (spArtist) spArtist.textContent = d.spotify.artist || '—';

            // Albüm kapağı varsa göster
            if (d.spotify.albumArt) {
              let albumImg = spCard.querySelector('.sp-album-art');
              if (!albumImg) {
                albumImg = document.createElement('img');
                albumImg.className = 'sp-album-art';
                spCard.insertBefore(albumImg, spCard.firstChild);
              }
              albumImg.src = d.spotify.albumArt;
            }
          } else if (spCard) {
            spCard.style.display = 'none';
          }

          // Game / Activity & Live Elapsed Time Counter
          const actTimer = document.getElementById('view-act-timer');
          if (window.gameTimerInterval) clearInterval(window.gameTimerInterval);

          if (d.activity && actCard) {
            actCard.style.display = 'flex';
            if (actText) {
              let text = `playing ${d.activity.name}`;
              if (d.activity.details) text += ` — ${d.activity.details}`;
              actText.textContent = text;
            }

            if (d.activity.startTimestamp && actTimer) {
              function updateGameTimer() {
                const now = Date.now();
                const diffSec = Math.floor(Math.max(0, now - d.activity.startTimestamp) / 1000);
                const h = Math.floor(diffSec / 3600);
                const m = Math.floor((diffSec % 3600) / 60);
                const s = diffSec % 60;
                const pad = (n) => String(n).padStart(2, '0');
                const timeStr = h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
                actTimer.textContent = `${timeStr} elapsed`;
              }
              updateGameTimer();
              window.gameTimerInterval = setInterval(updateGameTimer, 1000);
            } else if (actTimer) {
              actTimer.textContent = '';
            }
          } else if (actCard) {
            actCard.style.display = 'none';
          }
        })
        .catch(() => {
          // Bot çalışmıyor — offline göster, hata vermez
          if (statusDot) statusDot.className = 'inline-status-dot offline';
          if (statusLabel) { statusLabel.textContent = ''; statusLabel.className = 'inline-status-label offline'; }
        });
    }
  }

  // ── INITIALIZE ROUTER AT END OF DOMContentLoaded ──
  // Her hash değişiminde (profil linkine tıklama, geri/ileri gitme vb.)
  // önce Supabase'den taze veri çekiyoruz, sonra route() çalışıyor —
  // böylece başka birinin oluşturduğu profil de görünür oluyor.
  async function routeWithFreshData() {
    await refreshProfilesCache();
    route();
  }
  window.addEventListener('hashchange', routeWithFreshData);
  await handleDiscordAuthCallback();
  await refreshProfilesCache();
  route();
});
