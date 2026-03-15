# GitHub'a Push — Komutlar

Terminalde **sırayla** çalıştır. Repo kökü: `Projelerim/Web` (PortfolioDesk’in bir üst klasörü).

---

## 1. Repo köküne geç

```bash
cd /home/suleyman/Masaüstü/Projelerim/Web
```

---

## 2. Tüm değişiklikleri ekle (PortfolioDesk + silinen dosyalar)

```bash
git add -A
```

---

## 3. Commit

```bash
git commit -m "PortfolioDesk Web: Vercel kurulumu, frontend + backend"
```

---

## 4. GitHub’da repo yoksa

- https://github.com/new → **Repository name** (örn. `portfoliodesk-web` veya `Web`)
- **Create repository** (README ekleme, .gitignore ekleme)
- Sonraki adımda GitHub’ın gösterdiği **remote** komutunu kullanacaksın.

**İlk kez bağlıyorsan:**

```bash
git remote add origin https://github.com/KULLANICI_ADIN/REPO_ADI.git
```

`KULLANICI_ADIN` ve `REPO_ADI` yerine kendi GitHub kullanıcı adın ve repo adını yaz.

**Zaten `origin` varsa (farklı repo için):**

```bash
git remote set-url origin https://github.com/KULLANICI_ADIN/REPO_ADI.git
```

---

## 5. Push

```bash
git branch -M main
git push -u origin main
```

Dal adın `master` ise ve onu kullanmak istiyorsan:

```bash
git push -u origin master
```

---

## Kısa özet (repo hazırsa)

```bash
cd /home/suleyman/Masaüstü/Projelerim/Web
git add -A
git commit -m "PortfolioDesk Web: Vercel kurulumu"
git push -u origin main
```

Vercel’de projeyi import ederken **Root Directory** olarak `PortfolioDesk/portfoliodesk-web` seç; böylece sadece bu proje deploy edilir.
