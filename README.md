# ByteHost

ByteHost to realny panel webowy do hostowania botow Discord i serwerow gier. Boty Discord dzialaja przez PM2, a serwery gier sa uruchamiane w izolowanych kontenerach Docker. Aplikacja pracuje na prawdziwych plikach, procesach i SQLite, a nie na mockach. Panel ma logowanie JWT, role owner/user i publiczna rejestracje kont z aktywacja przez ownera.

## Stack

- Backend: Node.js, Express, SQLite (`better-sqlite3`), PM2, Docker, Multer
- Frontend: React + Vite
- Storage:
  - `storage/bots/{botId}`
  - `storage/backups/{botId}`
  - `storage/tmp`
  - `storage/logs`

## Funkcje

- boty Discord:
  - upload `ZIP` albo `RAR`
  - auto-detekcja jezyka, pliku startowego i komendy
  - start/stop/restart przez PM2
- serwery gier:
  - uruchamianie przez Docker
  - osobny kontener, port, limity RAM/CPU i logi dla kazdej uslugi
  - PM2 nie jest uzywany do gier
- serwery Minecraft:
  - upload `JAR`, `ZIP` albo `RAR`
  - mozliwosc utworzenia pustego workspace bez pliku
  - automatyczne pobieranie oficjalnego `server.jar` dla wybranej wersji
  - `EULA`, automatyczny publiczny host i automatyczny port, limity zasobow
- serwery FiveM:
  - mozliwosc utworzenia serwera bez uploadu pliku
  - automatyczne pobieranie oficjalnego artefaktu `FXServer` dla Linuxa
  - automatyczne pobieranie `cfx-server-data`
  - generowanie `server.cfg`
  - automatyczny przydzial publicznego portu
  - automatyczne wykrycie publicznego hosta albo host z `.env`
  - ustawienia `sv_licenseKey`, `sv_maxclients`, `OneSync`, `tags`, `locale`, `project name`
  - upload `ZIP` albo `RAR` jako gotowy pakiet resources/modow/pluginow
- file manager:
  - przegladanie folderow
  - edycja plikow tekstowych
  - tworzenie plikow i folderow
  - upload plikow
  - usuwanie plikow i folderow
  - edycja `.env`
- backupy uslug:
  - tworzenie snapshotow
  - przywracanie kopii
  - usuwanie backupow
- limity:
  - globalne: RAM, CPU, storage, liczba uslug
  - per konto: liczba uslug, RAM, CPU, storage
  - per usluga: RAM, CPU
- system kont:
  - JWT auth
  - hasla hashowane `bcrypt`
  - owner tworzony przy pierwszym starcie z `.env`
  - publiczna rejestracja z aktywacja przez ownera
  - tryb podgladu dla nieaktywowanych kont
- monitoring:
  - live logi
  - statusy `ONLINE`, `OFFLINE`, `ERROR`, `CRASH LOOP`
  - auto restart
  - scheduler kont i crash loop

## Uruchomienie na Ubuntu Server

### 1. Wymagania systemowe

```bash
sudo apt update
sudo apt install -y curl unzip unrar xz-utils python3 python3-pip build-essential openjdk-21-jre-headless
curl -fsSL https://get.docker.com | sudo sh
sudo systemctl enable --now docker
```

Zainstaluj Node.js LTS, najlepiej `20.x` albo `22.x`.

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
```

PM2 jest wymagane dla botow Discord, a Docker dla Minecraft/FiveM/CS2/Terraria/Unturned/Project Zomboid.

### 2. Konfiguracja projektu

```bash
cp .env.example .env
npm install
```

Najwazniejsze pola w `.env`:

- `PUBLIC_GAME_HOST`
  - opcjonalny host pokazywany graczom, np. `mc.bytehost.online`
  - jesli puste, ByteHost sprobuje wykryc publiczne IPv4
- `MINECRAFT_DEFAULT_PORT`
  - domyslny port Minecraft
- `MINECRAFT_PORT_RANGE_START`
- `MINECRAFT_PORT_RANGE_END`
  - zakres, z ktorego ByteHost automatycznie wybiera wolny port dla nowych serwerow Minecraft
- `FIVEM_DEFAULT_PORT`
  - domyslny port FiveM
- `FIVEM_PORT_RANGE_START`
- `FIVEM_PORT_RANGE_END`
  - zakres, z ktorego ByteHost automatycznie wybiera wolny port dla nowych serwerow FiveM
- `OWNER_EMAIL`
- `OWNER_PASSWORD`
  - dane pierwszego ownera
- `BYTEHOST_DOCKER_IMAGE_*`
  - obrazy Docker uzywane do uruchamiania serwerow gier
  - domyslnie ByteHost uzywa obrazow `ghcr.io/pterodactyl/yolks`

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

## Publiczny dostep do gier

- Panel webowy moze dzialac przez `Cloudflare Tunnel`.
- Minecraft i FiveM to osobny ruch gry, nie zwykle HTTP.
- Aby gracze z internetu weszli na serwer Minecraft, musisz wystawic publiczny ruch TCP dla portu gry.
- ByteHost moze zapisac ten sam port rowniez w `server.properties`, zeby wiele serwerow Minecraft moglo dzialac na jednym hoście.
- Aby gracze weszli na serwer FiveM, musisz przekierowac ten sam port gry dla `TCP` i `UDP` na routerze do maszyny z ByteHost.
- Serwery FiveM wymagaja poprawnego `sv_licenseKey` przed startem publicznym.
- `Cloudflare Tunnel` od panelu nie wystawia automatycznie portu Minecraft ani FiveM.

## Wazne uwagi

- `RAR` wymaga polecenia `unrar`.
- FiveM wymaga `tar` i `xz-utils`.
- Minecraft i serwery gier uruchamiane sa w Dockerze. Java na hoscie jest nadal przydatna do lokalnych narzedzi, ale runtime gry dziala w kontenerze.
- `.env` jest traktowany jak zwykly plik tekstowy. Panel go nie parsuje i nie przechowuje tokenow.
- Dla Node/TypeScript uzywany jest `npm`, `yarn` albo `pnpm`, zaleznosci od lockfile.
- Dla projektow Python instalacja korzysta z `requirements.txt`, jesli istnieje.
- Resources, pluginy i skrypty FiveM wrzucasz przez File Manager albo aktualizacje `ZIP/RAR`.

## API

### Auth

- `POST /api/auth/login`
- `POST /api/auth/register`
- `GET /api/auth/me`

### Bots / Services

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
- `GET /api/bots/:id/backups`
- `POST /api/bots/:id/backups`
- `POST /api/bots/:id/backups/:backupId/restore`
- `DELETE /api/bots/:id/backups/:backupId`

### Admin

- `GET /api/admin/users`
- `POST /api/admin/users`
- `PATCH /api/admin/users/:id`
- `DELETE /api/admin/users/:id`

### System

- `GET /api/system/stats`
- `GET /api/system/minecraft-versions`
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
  backups/
  logs/
  tmp/
```

## Weryfikacja lokalna

- backend JS sprawdzony przez `node --check`
- frontend produkcyjny zbudowany przez `npm run build`

Na tym komputerze lokalne `npm install` z natywnym buildem `better-sqlite3` moze wymagac toolchaina systemowego. Docelowym srodowiskiem dla ByteHost pozostaje Ubuntu Server z Node LTS.
