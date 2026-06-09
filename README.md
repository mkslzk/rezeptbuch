# 🍳 MOCA — My Own Cooking App

*Dein persönliches deutsches Rezeptbuch – mit KI, Einkaufsliste und Preisvergleich.*

[English below](#english)

---

## ✨ Features

| | |
|---|---|
| 📱 | **Progressive Web App** – läuft überall, funktioniert offline |
| 🤖 | **KI-Rezept-Extraktion** – Rezepte von TikTok & Instagram per URL importieren |
| 🛒 | **Intelligente Einkaufsliste** – sortiert nach Laden, mit Preisvergleich |
| 🔍 | **Volltextsuche** – inkl. Zutaten, Zeitfiltern und Sortierung |
| 🏷️ | **Kategorien & Tags** – einfach organisieren |
| ⭐ | **Bewertungen** – 1–5 Sterne |
| ⏱️ | **Zeitplanung** – Prep-Time, Cook-Time, Gesamt |
| 📦 | **OFF-Preisvergleich** – aktuelle Angebote direkt an Zutaten |

---

## 🚀 Quick Start

### Mit Docker (empfohlen)

```bash
git clone https://github.com/mkslzk/moca.git
cd moca
docker compose up -d
# Öffne http://localhost:3001
```

### Ohne Docker

```bash
# Backend
cd server && npm install && npm start

# Frontend (anderes Terminal)
cd client && npm install && npm run dev
```

---

## ⚙️ Setup

Beim ersten Start öffnet sich der **Setup-Assistent** – dort kannst du:

- 🌈 **Theme** wählen
- 🤖 **KI-Provider** einrichten (Ollama, OpenRouter, OpenAI, Anthropic, Gemini, MiniMax, Custom)
- 📍 **Postleitzahl** für den OFF-Scraper
- 🛒 **Läden** auswählen

### KI-Provider (optional)

| Anbieter | Beschreibung |
|---|---|
| **Ollama** (Standard) | Lokal, kostenlos, privacy-first |
| OpenRouter | 100+ Modelle |
| OpenAI | GPT-4o, GPT-4o-mini |
| Anthropic | Claude Sonnet, Claude Opus |
| Google Gemini | Gemini Flash, Gemini Pro |
| MiniMax | Text-01 |
| Custom | Beliebiger OpenAI-kompatibler Endpunkt |

#### Ollama installieren (lokal)

```bash
# macOS / Linux
curl -fsSL https://ollama.com/install.sh | sh
ollama pull llama3.2
```

---

## 🐳 Docker

```bash
# Image bauen
docker build -t moca .

# Oder docker-compose
docker compose up -d
```

**Volume** für Daten-Persistenz: `./data:/app/server/src/data`

---

## 📁 Projektstruktur

```
moca/
├── client/                  # React Frontend (Vite)
│   └── src/
│       ├── components/      # UI-Komponenten
│       ├── pages/           # Seiten (Home, Recipe, ShoppingList, …)
│       ├── config/          # Themes, Zutaten-Listen
│       └── context/         # ThemeContext
├── server/                 # Express Backend
│   └── src/
│       ├── routes/          # API Endpoints
│       ├── services/        # LLM, OFF-Scraper
│       └── data/            # SQLite DB, JSON-Configs
├── docs/                   # Dokumentation
├── docker-compose.yml
└── Dockerfile
```

---

## 🛠️ Tech Stack

**Frontend:** React 18 · Vite · CSS Variables · PWA

**Backend:** Node.js · Express · SQLite (better-sqlite3) · Playwright

**KI:** Ollama / OpenAI-kompatible APIs · Anthropic · Google Gemini · MiniMax

---

## 📝 Lizenz

MIT License – frei nutzbar und veränderbar.

---

***

# 🍳 MOCA — My Own Cooking App

*Your personal German recipe book – with AI extraction, smart shopping list and price comparison.*

---

## ✨ Features

| | |
|---|---|
| 📱 | **Progressive Web App** – works everywhere, offline-capable |
| 🤖 | **AI Recipe Extraction** – import recipes from TikTok & Instagram via URL |
| 🛒 | **Smart Shopping List** – sorted by store, with price comparison |
| 🔍 | **Full-text Search** – by ingredients, time filters, sorting |
| 🏷️ | **Categories & Tags** – easy organization |
| ⭐ | **Ratings** – 1–5 stars |
| ⏱️ | **Time Planning** – prep, cook, total |
| 📦 | **OFF Price Comparison** – current offers attached to ingredients |

---

## 🚀 Quick Start

### With Docker (recommended)

```bash
git clone https://github.com/mkslzk/moca.git
cd moca
docker compose up -d
# Open http://localhost:3001
```

### Without Docker

```bash
# Backend
cd server && npm install && npm start

# Frontend (separate terminal)
cd client && npm install && npm run dev
```

---

## ⚙️ Setup

On first launch, the **Setup Wizard** guides you through:

- 🌈 Choose a **theme**
- 🤖 Configure your **AI provider** (Ollama, OpenRouter, OpenAI, Anthropic, Gemini, MiniMax, Custom)
- 📍 Set your **postal code** for the OFF price scraper
- 🛒 Select your preferred **stores**

### AI Providers (optional)

| Provider | Description |
|---|---|
| **Ollama** (default) | Local, free, privacy-first |
| OpenRouter | 100+ models |
| OpenAI | GPT-4o, GPT-4o-mini |
| Anthropic | Claude Sonnet, Claude Opus |
| Google Gemini | Gemini Flash, Gemini Pro |
| MiniMax | Text-01 |
| Custom | Any OpenAI-compatible endpoint |

#### Install Ollama (local)

```bash
# macOS / Linux
curl -fsSL https://ollama.com/install.sh | sh
ollama pull llama3.2
```

---

## 🐳 Docker

```bash
# Build image
docker build -t moca .

# Or use docker-compose
docker compose up -d
```

**Volume** for data persistence: `./data:/app/server/src/data`

---

## 📁 Project Structure

```
moca/
├── client/                  # React Frontend (Vite)
│   └── src/
│       ├── components/      # UI Components
│       ├── pages/           # Pages (Home, Recipe, ShoppingList, …)
│       ├── config/          # Themes, Ingredient Lists
│       └── context/         # ThemeContext
├── server/                 # Express Backend
│   └── src/
│       ├── routes/          # API Endpoints
│       ├── services/        # LLM, OFF Scraper
│       └── data/            # SQLite DB, JSON Configs
├── docs/                   # Documentation
├── docker-compose.yml
└── Dockerfile
```

---

## 🛠️ Tech Stack

**Frontend:** React 18 · Vite · CSS Variables · PWA

**Backend:** Node.js · Express · SQLite (better-sqlite3) · Playwright

**AI:** Ollama / OpenAI-compatible APIs · Anthropic · Google Gemini · MiniMax

---

## 📝 License

MIT License – free to use and modify.

---

*Made with ❤️ for home cooks everywhere. 🍳*