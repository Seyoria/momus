<div align="center">
  <img src="https://img.shields.io/badge/Platform-Bio%20Link-a855f7?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgcng9IjI4IiBmaWxsPSIjMGUwZTBlIi8+PHRleHQgeD0iNTAiIHk9IjY4IiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiIgZm9udC13ZWlnaHQ9IjkwMCIgZm9udC1zaXplPSI1NSIgZmlsbD0iI2E4NTVmNyIgdGV4dC1hbmNob3I9Im1pZGRsZSI+bTwvdGV4dD48L3N2Zz4=&logoColor=white" alt="Platform"/>
  <img src="https://img.shields.io/badge/Supabase-Backend-3ecf8e?style=for-the-badge&logo=supabase&logoColor=white" alt="Supabase"/>
  <img src="https://img.shields.io/badge/Discord.js-v14-5865f2?style=for-the-badge&logo=discord&logoColor=white" alt="Discord.js"/>

  <br/><br/>

  <h1>✦ momus</h1>
  <p><strong>Yeni Nesil, Fütüristik Bio-Link Platformu</strong></p>
  <p>
    <a href="https://seyoria.github.io/momus/">Canlı Site</a> •
    <a href="https://discord.gg/U3eKc9NBPx">Discord Topluluğu</a>
  </p>
</div>

---

## Proje Hakkında

**momus**, kişisel bağlantılarını, sosyal medya hesaplarını ve Discord canlı durumunu (aktivite, Spotify, oyunlar) tek bir fütüristik sayfada toplayan gelişmiş bio-link platformudur.

Tamamen statik frontend (GitHub Pages) + Supabase bulut veritabanı + Discord botu mimarisi üzerine kurulmuştur.

---

## Temel Özellikler

### Profil ve Özelleştirme
- **Sürükle-Bırak Dashboard** — Hesap, Özelleştir, Linkler sekmeli modern panel
- **Arka Plan Desteği** — GIF, MP4 video, görsel (20MB limit, direkt yükleme)
- **Profil Müziği** — Otomatik çalan arka plan müziği + ses dalgası görselleştirici
- **Canlı Efekt Motoru** — Kar, yağmur, matrix, siber ağ, yıldızlar, neon dalgaları, ateş böcekleri
- **Özel Avatar** — Kırpma ve yükleme desteği
- **Profil Opaklığı ve Bulanıklığı** — Slider ile ayarlanabilir
- **QR Kod Üretici** — Profilini anında paylaş

### Discord Entegrasyonu
- **Canlı Discord Durumu** — Bot üzerinden gerçek zamanlı aktivite, Spotify, oyun bilgileri
- **Discord Banner** — Profil kartında Discord banner gösterimi
- **Çevrimiçi Durumu** — Online, idle, DND, offline göstergesi
- **Sunucu Katılım Uyarısı** — Kayıt sırasında Discord sunucusuna katılma zorunluluğu bildirimi

### Güvenlik ve Gizlilik
- **HTTPS Zorunluluğu** — Otomatik HTTP → HTTPS yönlendirme
- **Anti-Spam Koruması** — Rate limiter ile form spam engelleme (1.5s cooldown)
- **SHA-256 PIN Doğrulama** — Admin paneli güvenli hash ile korunur
- **VirusTotal Link Tarayıcı** — Profil linklerini zararlı yazılıma karşı kontrol eder
- **Gizlilik Politikası ve Kullanım Koşulları** — Yasal modal sayfaları
- **Çerez Onay Bandı** — KVKK uyumlu cookie consent banner
- **Ban ve IP Engelleme** — Admin panelinden kullanıcı yasaklama

### Kullanıcı Deneyimi
- **Özel 404 Sayfası** — "Kullanıcı Bulunamadı" gradient tasarımlı sayfa
- **Mobil Uyumlu** — Tüm sayfalarda responsive tasarım
- **Custom Cursor** — Özel imleç efekti
- **Toast Bildirimleri** — İşlem sonuçları için anlık bildirimler
- **Profil Görüntülenme Sayacı** — Her profil ziyareti kaydedilir

---

## Mimari

```
momus/
├── index.html              # Ana SPA dosyası (tüm view'lar)
├── README.md
└── assets/
    ├── main.css            # Tüm stiller (glassmorphism, animasyonlar)
    └── main.js             # SPA router, builder, admin paneli, Supabase

momus-bot/                  # Discord Botu (ayrı repo, Render'da deploy)
├── index.js                # Express API + Discord.js v14
└── package.json
```

### SPA Hash Routing
| Route | Sayfa |
|-------|-------|
| `#home` | Ana sayfa (landing) |
| `#builder` | Dashboard (profil düzenleyici) |
| `#{username}` | Kullanıcı profil sayfası |
| `#momus-admin` | Admin paneli (PIN korumalı) |
| `#privacy` | Gizlilik politikası |
| `#terms` | Kullanım koşulları |
| Bilinmeyen hash | 404 sayfası |

---

## Teknoloji Yığını

| Katman | Teknoloji |
|--------|-----------|
| **Frontend** | Vanilla HTML5, CSS3 (Glassmorphism, Custom Properties), ES6+ JavaScript |
| **Veritabanı** | [Supabase](https://supabase.com/) PostgreSQL |
| **Dosya Depolama** | Supabase Storage (`momus-media` bucket) |
| **Yerel Önbellek** | IndexedDB |
| **Discord Bot** | Node.js, Express, Discord.js v14 |
| **Hosting** | GitHub Pages (frontend), Render (bot) |

---

## Discord Bot API Endpoints

| Method | Endpoint | Açıklama |
|--------|----------|----------|
| `GET` | `/api/discord/user/:id` | Kullanıcı bilgilerini çeker |
| `GET` | `/api/discord/presence/:id` | Canlı durum ve aktivite bilgisi |
| `POST` | `/api/discord/send-changelog` | Changelog kanalına duyuru gönderir |
| `POST` | `/api/discord/send-dm` | Kullanıcıya DM gönderir |
| `POST` | `/api/discord/log` | Log kanalına mesaj gönderir |

---

## Hızlı Başlangıç

1. **Siteye git:** [seyoria.github.io/momus](https://seyoria.github.io/momus/)
2. **"Profil Oluştur"** butonuna tıkla
3. **Discord ile giriş yap** — Discord hesabınla oturum aç
4. **Discord sunucusuna katıl** — [discord.gg/Mrw293bayE](https://discord.gg/Mrw293bayE) (bot verilerinin çalışması için zorunlu)
5. **Profilini düzenle** — Dashboard'dan arka plan, müzik, linkler ekle
6. **Kaydet ve paylaş** — `seyoria.github.io/momus/#kullaniciadin`

> **Not:** Discord sunucumuza katılmazsanız bot verilerinizi çekemez ve profiliniz düzgün görünmez.

---

## Lisans

Bu proje tüm hakları saklıdır. &copy; 2026 momus — seyoria.
