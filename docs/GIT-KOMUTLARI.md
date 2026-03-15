# GitHub'a Push — Komutlar

Bu proje **tek repo**: kök klasör `portfoliodesk-web` (içinde api, backend, frontend, vercel.json).

---

## 1. GitHub'da yeni repo oluştur

- https://github.com/new
- **Repository name:** `portfoliodesk-web` (veya istediğin isim)
- **Public** seç
- README, .gitignore **ekleme** (zaten projede var)
- **Create repository** tıkla

---

## 2. Remote ekle ve push

Proje klasöründe (portfoliodesk-web):

```bash
cd /home/suleyman/Masaüstü/Projelerim/Web/PortfolioDesk/portfoliodesk-web

git remote add origin https://github.com/KULLANICI_ADIN/portfoliodesk-web.git
git push -u origin main
```

`KULLANICI_ADIN` yerine kendi GitHub kullanıcı adını yaz (örn. `suleymanakin`).

---

## Sonraki push'lar

```bash
cd /home/suleyman/Masaüstü/Projelerim/Web/PortfolioDesk/portfoliodesk-web
git add -A
git commit -m "Mesaj"
git push
```

---

## Vercel

Repo kökü artık doğrudan proje olduğu için Vercel'de **Root Directory** boş bırakılır; ekstra ayar gerekmez.
