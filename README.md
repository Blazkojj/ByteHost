# ByteHost

ByteHost to prywatny panel webowy do hostowania botów Discord dla jednego użytkownika. Aplikacja działa na realnych plikach i prawdziwych procesach PM2, bez mocków, bez logowania i bez rejestracji.

## Stack

- Backend: Node.js, Express, SQLite (`better-sqlite3`), PM2, Multer
- Frontend: React + Vite
- Storage:
  - `storage/bots/{botId}`
  - `storage/tmp`
  - `storage/logs`

## Funkcje

- tworzenie bota z archiwum `ZIP` lub `RAR`
- automatyczne wykrywanie:
  - języka: `Node.js`, `TypeScript`, `Python`
  - pliku startowego
  - komendy startowej
- ręczna korekta:
  - języka
  - pliku startowego
  - komendy startowej
- realne uruchamianie botów przez `PM2`
- auto restart z:
  - `autorestart`
  - `restart_delay`
  - `max_restarts`
- wykrywanie `CRASH LOOP`
- scheduler wygasania `expires_at`
- limity globalne:
  - RAM
  - CPU
  - storage
  - liczba botów
- limity per-bot:
  - RAM
  - CPU
- file manager:
  - przeglądanie folderów
  - edycja plików tekstowych
  - tworzenie plików
  - tworzenie folderów
  - upload plików
  - usuwanie plików i folderów
  - edycja `.env`
- logi live przez polling API

## Uruchomienie na Ubuntu Server

### 1. Wymagania systemowe

```bash
sudo apt update
sudo apt install -y curl unzip unrar python3 python3-pip build-essential
```

Zainstaluj Node.js LTS, najlepiej `20.x` lub `22.x`.

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
```

### 2. Konfiguracja projektu

```bash
cp .env.example .env
npm install
```

### 3. Development

```bash
npm run dev
```

- frontend: `http://localhost:5173`
- backend API: `http://localhost:3000`

### 4. Produkcja

```bash
npm run build
npm start
```

Lub pod PM2:

```bash
pm2 start ecosystem.config.cjs
pm2 save
```

## Ważne uwagi

- RAR wymaga polecenia `unrar` dostępnego na serwerze.
- `.env` jest traktowany jak zwykły plik tekstowy. Panel go nie parsuje i nie przechowuje tokenów.
- Dla projektów Node/TypeScript używany jest `npm`, `yarn` lub `pnpm` zależnie od lockfile.
- Dla projektów Python instalacja korzysta z `requirements.txt`, jeśli istnieje.
- Scheduler sprawdza wygasanie i crash loop co `60s` domyślnie.

## API

### Bots

- `GET /api/bots`
- `POST /api/bots`
- `GET /api/bots/:id`
- `PATCH /api/bots/:id`
- `DELETE /api/bots/:id`
- `POST /api/bots/:id/start`
- `POST /api/bots/:id/stop`
- `POST /api/bots/:id/restart`
- `POST /api/bots/:id/install`
- `POST /api/bots/:id/upload`
- `GET /api/bots/:id/logs`
- `GET /api/bots/:id/files`
- `POST /api/bots/:id/files`
- `PATCH /api/bots/:id/files`
- `DELETE /api/bots/:id/files`
- `PATCH /api/bots/:id/env`

### System

- `GET /api/system/stats`
- `PATCH /api/system/limits`

## Struktura

```text
server/
  config.js
  index.js
  lib/
  routes/
src/
  components/
  pages/
storage/
  bots/
  logs/
  tmp/
```

## Weryfikacja lokalna

- backend JS sprawdzony składniowo przez `node --check`
- frontend produkcyjny zbudowany przez `npm run build`

Na tym komputerze pełne `npm install` z natywnym buildem `better-sqlite3` nie przeszło przez lokalny `Node 25` i brak toolchaina Visual Studio. Docelowym środowiskiem dla ByteHost jest Ubuntu Server z Node LTS, gdzie moduł powinien zostać zbudowany poprawnie po `npm install`.
