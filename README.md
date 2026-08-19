# Wyszukiwarka łożysk po wymiarach — stozek.pl

## Jednorazowa konfiguracja

1. **Sekret API** — Settings → Secrets and variables → Actions → New repository
   secret → nazwa `SHOPER_API_TOKEN`, wartość: token z panelu Shoper
   (Ustawienia → API).
2. **Repo musi być publiczne** (Settings → General → Danger Zone → Change
   visibility) — to warunek darmowego GitHub Pages.
3. **GitHub Pages** — Settings → Pages → Source: "Deploy from a branch" →
   Branch: `main`, folder `/docs` → Save.
4. Po pierwszym uruchomieniu workflow (patrz niżej), sprawdź że
   `https://<twoj-user>.github.io/<repo>/data.json` zwraca dane.

## Ręczne uruchomienie synchronizacji

Actions → "Sync bearing dimensions" → Run workflow.

## Wklejenie widgetu na stozek.pl

W panelu Shoper stwórz nową stronę CMS, wklej zawartość `widget/index.html`.
W pliku podmień `DATA_URL` na `https://<twoj-user>.github.io/<repo>/data.json`.
