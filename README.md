# 🍳 MOCA

Dein persönliches deutsches MOCA – mit KI-gestützter Rezept-Extraktion aus TikTok/Instagram, automatischer Preisvergleich und smarter Einkaufsliste.

## ✨ Features

- **📱 Progressive Web App** – läuft auf jedem Gerät, funktioniert auch offline
- **🤖 KI-Rezept-Extraktion** – füge Rezepte von TikTok/Instagram per URL hinzu
- **🛒 Intelligente Einkaufsliste** – automatisch sortiert nach Laden, mit Preisvergleich
- **🔍 Volltextsuche** – finde Rezepte schnell, inkl. Zutaten und Zeitfiltern
- **🏷️ Kategorien & Tags** – organisiere deine Rezepte
- **⭐ Bewertungen** – 1-5 Sterne für jedes Rezept
- **⏱️ Zeitplanung** – Prep-Time, Cook-Time, gesamt
- **📦 OFF-Scraper** – aktuelle Angebote direkt zu Zutaten anzeigen

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

## ⚙️ Konfiguration

```bash
cp .env.example .env
```

### KI-Provider (optional)

| Provider | Beschreibung |
|---|---|
| **Ollama** (Standard) | Lokal, kostenlos |
| OpenRouter | 100+ Modelle |
| OpenAI | GPT-4o, GPT-4o-mini |
| Anthropic | Claude |
| Google Gemini | Gemini Flash/Pro |
| MiniMax | Text-01 |
| Custom | OpenAI-kompatibler Endpunkt |

## 🐳 Docker

```bash
docker compose up -d
```

## 📁 Struktur

```
client/     React Frontend (Vite)
server/     Express Backend (SQLite)
docs/       Dokumentation
```

## 🛠️ Stack

React 18 + Vite · Express · SQLite · Playwright · Ollama/OpenAI APIs

## 📝 Lizenz

MIT

---

Made with ❤️ für Hobbyköche. 🍳