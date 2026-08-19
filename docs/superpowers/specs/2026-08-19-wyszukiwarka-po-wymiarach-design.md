# Wyszukiwarka łożysk po wymiarach — design

Data: 2026-08-19
Sklep: stozek.pl (platforma Shoper)

## Cel

Zastąpić płatną wyszukiwarkę po wymiarach (d/D/B + tolerancja) własnym, darmowym
rozwiązaniem osadzonym na stozek.pl. Dane wymiarów już istnieją w Shoperze jako
cechy produktu.

## Ograniczenie platformy

Shoper to hosting SaaS — nie pozwala uruchamiać własnego kodu serwerowego (PHP/inne)
na koncie sklepu. Strony CMS przyjmują tylko statyczny HTML/CSS/JS. Dlatego dane
trzeba przygotować poza Shoperem i serwować statycznie.

## Architektura — 3 komponenty

1. **Skrypt synchronizujący** (Node.js), uruchamiany cyklicznie przez GitHub Actions
   (harmonogram, np. raz na dobę w nocy).
   - Woła Shoper REST API (endpointy produktów i cech), stronicowo.
   - Token API trzymany jako sekret w GitHub Actions, nigdy w kodzie/repo.
   - Mapuje cechy produktu na d / D / B (patrz „Ustalenia z realnego API” —
     `attributes["3"]["20"|"21"|"16"]`).
   - Filtruje produkty po `category_id` do zbioru kategorii łożysk
     (patrz „Ustalenia z realnego API”) — filtrowanie po stronie skryptu,
     bo API nie wspiera filtrowania w zapytaniu.
   - Pomija produkty bez kompletu trzech wymiarów (licznik pominiętych w logu joba).
   - Przy błędzie API: **nie nadpisuje** poprzedniego pliku danych, job kończy się
     czerwonym statusem w GitHub Actions.
   - Zapisuje wynik jako `data.json`: `{id, name, url, price, d, D, B}` per
     produkt (bez zdjęcia — poza zakresem MVP).

2. **Statyczny hosting danych** — GitHub Pages, publikuje `data.json` z repo
   (branch/folder skonfigurowany pod Pages). W pełni darmowe, automatyczne po
   każdym pushu ze skryptu synchronizującego.

3. **Widget wyszukiwarki** — czysty HTML/CSS/JS, wklejany jako strona CMS w
   Shoperze na stozek.pl.
   - Formularz: średnica wewnętrzna (d), średnica zewnętrzna (D), szerokość (B),
     tolerancja (jedna wspólna wartość dla wszystkich trzech wymiarów).
   - Przy wejściu na stronę pobiera `data.json` raz (cache w przeglądarce),
     dalej wyszukiwanie działa w 100% lokalnie w JS — bez zapytań serwerowych
     przy każdej zmianie pól.

## Przepływ danych

```
GitHub Actions (cron)
  → Shoper REST API (produkty + cechy, stronicowo)
  → mapowanie cech → {id, nazwa, url, cena, zdjęcie, d, D, B}
  → pominięcie niekompletnych rekordów
  → data.json
  → commit + push
  → GitHub Pages publikuje automatycznie
  → widget na stozek.pl pobiera data.json przy wejściu użytkownika
```

## Logika dopasowania

Dla każdego wpisanego wymiaru (d/D/B — puste pole pomijane w filtrze):

```
dopasowanie ⇔ |wartość_produktu − wartość_wpisana| ≤ tolerancja
```

- Wymaga przynajmniej jednego wypełnionego pola wymiaru — inaczej widget prosi
  o wpisanie choć jednego, zamiast zwracać cały katalog.
- Wyniki sortowane rosnąco po sumie odchyłek bezwzględnych (najbliższe dopasowania
  na górze listy).
- Każdy wynik: nazwa produktu, wymiary, cena, link do strony produktu
  na stozek.pl. Bez miniatury (API nie zwraca zdjęcia w prosty sposób —
  poza zakresem MVP, patrz sekcja „Ustalenia z realnego API”).

## Obsługa błędów

| Sytuacja | Zachowanie |
|---|---|
| Błąd/limit Shoper API podczas syncu | zachowaj stary `data.json`, job czerwony |
| Produkt bez kompletu d/D/B | pomiń po cichu, zlicz w logu |
| Widget nie może pobrać `data.json` | komunikat „wyszukiwarka chwilowo niedostępna” |
| Brak wpisanego żadnego wymiaru | prośba o wpisanie choć jednego pola |
| Brak wyników dla podanych kryteriów | czytelny komunikat „brak łożysk w tym zakresie” |

## Testy

- Testy jednostkowe parsera Shoper → JSON (na przykładowej/fixture'owej
  odpowiedzi API): poprawna ekstrakcja d/D/B, poprawne pomijanie niekompletnych
  produktów.
- Testy jednostkowe logiki dopasowania w JS: dokładne trafienie, granica
  tolerancji (równa dokładnie), brakujące dane wejściowe, puste pola, brak
  wyników, sortowanie po odchyłce.
- Ręczny test end-to-end: prawdziwe dane z Shoper API → wygenerowany `data.json`
  → widget lokalnie → porównanie wyników z obecną płatną wyszukiwarką na
  kilku przykładowych łożyskach.

## Ustalenia z realnego API (potwierdzone ręcznie przez Postman, 2026-08-19)

- **Auth:** `Authorization: Bearer <token>` bezpośrednio na zasobach (token z
  panelu Shoper, bez wymiany przez `/webapi/rest/auth`).
- **Lista produktów:** `GET https://www.stozek.pl/webapi/rest/products?page=N&limit=50`.
  Odpowiedź: `{ count, pages, page, list: [...] }`. `pages` = liczba stron przy
  danym `limit` — używać jej do sterowania pętlą paginacji (nie zakładać
  sztywno 412 stron).
- **Filtrowanie po kategorii nie działa:** parametr `category_id` w query
  jest ignorowany (zwraca cały katalog, count 20553), parametr `filters`
  (JSON) zwraca `{"error":"invalid_request","error_description":"Resource
  not found"}` niezależnie od zapisu. Wniosek: pobierać cały katalog
  stronicowo i filtrować po `category_id` **po stronie skryptu**.
- **Kategorie łożysk** (z `GET /webapi/rest/categories?limit=50`):
  `138` Łożyska (rodzic), `139` Baryłkowe, `140` Kulkowe, `141` Samochodowe,
  `142` Stożkowe, `143` Ślizgowe, `144` Walcowe i igiełkowe. `category_id`
  na produkcie przychodzi jako string (np. `"142"`).
- **Pole produktu → mapowanie:**
  - `product_id` → id
  - `translations.pl_PL.name` → nazwa
  - `translations.pl_PL.permalink` → link do produktu
  - `stock.price` → cena
  - `attributes["3"]["20"]` → d (Wymiar wewnętrzny), potwierdzone etykietą w panelu
  - `attributes["3"]["21"]` → D (Wymiar zewnętrzny), potwierdzone etykietą w panelu
  - `attributes["3"]["16"]` → B (Grubość), potwierdzone etykietą w panelu
  - Zweryfikowano na realnym produkcie: „32012 X FAG” (kategoria 142) →
    d=60, D=95, B=23 — zgodne ze specyfikacją fizyczną tego łożyska.
  - Grupa cech `"3"` jest **reużywana w wielu niepowiązanych kategoriach**
    (szyny liniowe, wpusty pryzmatyczne) z innym znaczeniem tych samych ID —
    dlatego filtrowanie po `category_id` (po stronie skryptu) jest konieczne,
    nie wystarczy sama obecność `attributes["3"]`.
- **`main_image` puste (`null`)** na wszystkich sprawdzonych przykładach —
  endpoint listy/produktu nie zwraca zdjęcia w prosty sposób. Zdjęcie
  produktu wychodzi poza zakres MVP — widget wyników działa bez miniatur.
