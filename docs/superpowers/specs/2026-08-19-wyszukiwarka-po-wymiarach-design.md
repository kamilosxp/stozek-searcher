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
   - Mapuje cechy produktu na d / D / B (dokładne nazwy/ID cech w panelu Shoper
     ustalane podczas implementacji — do zweryfikowania w API).
   - Pomija produkty bez kompletu trzech wymiarów (licznik pominiętych w logu joba).
   - Przy błędzie API: **nie nadpisuje** poprzedniego pliku danych, job kończy się
     czerwonym statusem w GitHub Actions.
   - Zapisuje wynik jako `data.json`.

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
- Każdy wynik: nazwa produktu, wymiary, cena, miniatura, link do strony produktu
  na stozek.pl.

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

## Otwarte kwestie do rozwiązania w implementacji

- Dokładne nazwy/ID cech w Shoperze przechowujących d, D, B (do sprawdzenia
  przez API po uzyskaniu tokena).
- Dokładny endpoint/parametry Shoper REST API do pobierania cech produktu
  (może wymagać osobnego wywołania per produkt lub batch).
