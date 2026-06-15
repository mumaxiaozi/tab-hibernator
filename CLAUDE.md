# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Tab Hibernator (标签页休眠助手) — a Chrome Manifest V3 extension that automatically discards inactive tabs to free memory. Written in vanilla JavaScript with no build system, bundler, or dependencies.

## Development

**Loading the extension:** Open `chrome://extensions`, enable Developer Mode, click "Load unpacked" and point to this project directory. No build step needed.

**Testing:** No automated tests exist. Manual testing only — load the extension, open tabs, wait for auto-discard, verify whitelist and threshold settings in the popup.

**Linting:** No linter or formatter configured. Follow existing code style: Chinese comments, 2-space indent, async/await patterns.

## Architecture

Two main components communicate via `chrome.runtime.sendMessage`:

- **background.js** — Service worker. Runs always. Tracks tab activity timestamps, checks every 1 minute via `chrome.alarms` and discards tabs exceeding the threshold. Handles messages from popup (`discard-all`, `discard-tab`, `reload-tab`, `get-access-map`).

- **popup.js + popup.html + popup.css** — Extension popup UI. Renders tab list with status badges (active/discarded/idle), stats panel, threshold selector, whitelist editor. Sends actions to background via IPC.

## Storage Design

- **chrome.storage.local** — `lastAccessMap`: `{tabId: timestamp}` map updated on every tab switch/page load. High-frequency writes, not synced across devices.
- **chrome.storage.sync** — `threshold` (minutes, default 15) and `whitelist` (array of domain strings). Synced across Chrome profiles.

## Whitelist Matching

Supports exact hostname match and suffix match. Prefix `.` means "all subdomains" (`.example.com` matches `sub.example.com` and `example.com`). Built-in protected URLs (`chrome://`, `chrome-extension://`, `edge://`, `about:`, `devtools://`) are never discarded regardless of whitelist.

## Tab Skip Rules

Tabs are skipped from discard if: active, pinned, audible (playing media), already discarded, protected URL, or whitelisted.

## UI Language

All user-facing strings are in Simplified Chinese (zh-CN). Keep new UI text in Chinese to match existing style.
