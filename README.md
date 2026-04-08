# ByteHost

ByteHost to prywatny panel webowy do hostowania botow Discord i serwerow Minecraft dla jednego operatora. Aplikacja dziala na realnych plikach i prawdziwych procesach PM2, bez mockow, bez logowania i bez rejestracji.

## Stack

- Backend: Node.js, Express, SQLite (`better-sqlite3`), PM2, Multer
- Frontend: React + Vite
- Storage:
  - `storage/bots/{botId}`
  - `storage/tmp`
  - `storage/logs`

## Funkcje

- tworzenie bota Discord z archiwum `ZIP` lub `RAR`
- tworzenie serwera Minecraft z `JAR`, `ZIP` albo `RAR`, albo jako pusty workspace bez pliku
- automatyczne wykrywanie:
  - bota Discord:
    - jezyka `Node.js`, `TypeScript`, `Python`
    - pliku startowego
    - komendy startowej
- serwera Minecraft:
    - pliku `JAR`
    - komendy `java -jar ... nogui`
    - pustego workspace, jesli plik dodasz dopiero pozniej
- reczna korekta:
  - jezyka
  - pliku startowego
  - komendy startowej
  - publicznego hosta i portu Minecraft
- realne uruchamianie uslug przez `PM2`
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
  - liczba uslug
- limity per-usluga:
  - RAM
  - CPU
- file manager:
  - przegladanie folderow
  - edycja plikow tekstowych
  - tworzenie plikow
  - tworzenie folderow
  - upload plikow
  - usuwanie plikow i folderow
  - edycja `.env`
- logi live przez polling API

## Uruchomienie na Ubuntu Server

### 1. Wymagania systemowe

```bash
sudo apt update
sudo apt install -y curl unzip unrar python3 python3-pip build-essential openjdk-21-jre-headless
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

## Minecraft i publiczny dostep

- Panel potrafi uruchomic serwer Minecraft, zarzadzac plikami, logami i PM2.
- Pole `Adres publiczny` w panelu jest informacyjne i sluzy do pokazania operatorowi, pod jakim adresem gracze maja wejsc.
- Aby gracze z internetu faktycznie polaczyli sie z serwerem Minecraft, musisz jeszcze wystawic publiczny ruch TCP dla portu gry, np. przez publiczne IP z przekierowaniem portu albo tunel TCP do Minecrafta.
- `Cloudflare Tunnel` z HTTP do panelu webowego ByteHost nie wystawia automatycznie samego portu gry Minecraft.

## Wazne uwagi

- RAR wymaga polecenia `unrar` dostepnego na serwerze.
- Minecraft wymaga zainstalowanej Javy na Ubuntu.
- `.env` jest traktowany jak zwykly plik tekstowy. Panel go nie parsuje i nie przechowuje tokenow.
- Dla projektow Node/TypeScript uzywany jest `npm`, `yarn` lub `pnpm` zaleznosci od lockfile.
- Dla projektow Python instalacja korzysta z `requirements.txt`, jesli istnieje.
- Dla serwerow Minecraft zaznaczenie akceptacji EULA pozwala panelowi zapisac `eula=true` przed startem.
- Scheduler sprawdza wygasanie i crash loop co `60s` domyslnie.

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
- `POST /api/bots/:id/archive`
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

- backend JS sprawdzony skladniowo przez `node --check`
- frontend produkcyjny zbudowany przez `npm run build`

Na tym komputerze pelne `npm install` z natywnym buildem `better-sqlite3` moze wymagac lokalnego toolchaina. Docelowym srodowiskiem dla ByteHost pozostaje Ubuntu Server z Node LTS.
