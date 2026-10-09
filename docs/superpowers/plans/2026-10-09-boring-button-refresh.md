# Boring Button refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** привести офлайн-антискролл к цельному голосу Chebaturkin Style, убрать рассинхрон сайта и расширения, усилить доступность и подготовить проект к публикации на GitHub Pages.

**Architecture:** сохраняем статическую архитектуру без сборщика и сети. `tasks.json` остаётся источником заданий, `scripts/sync-tasks.js` синхронизирует сайт и расширение; общий `core.js` отвечает за нормализацию и хранение. Тексты интерфейса и расширения становятся единым набором коротких действий со строчными началами и обращением на «ты».

**Tech Stack:** HTML, CSS, vanilla JavaScript, Manifest V3, Node.js test runner, Playwright для ручного smoke-теста.

---

### Task 1: редакторский и продуктовый аудит

**Files:**
- Modify: `index.html`, `extension/popup.html` — видимые тексты, метаданные и доступные названия.
- Modify: `app.js`, `extension/popup.js` — сообщения, ошибки, aria-тексты и fallback-задачи.
- Modify: `tasks.json` — названия и инструкции встроенных задач.
- Modify: `README.md`, `extension/README.md`, `AGENT_PROMPT.md` — описание, установка, приватность и GitHub Pages.

- [ ] Составить единый словарь интерфейса: «дай задачу», «сделано», «пропустить», «ещё одну», «мои задачи», «свои задачи».
- [ ] Убрать искусственную капитализацию в авторских строках, сохранив бренды, коды и технические имена.
- [ ] Переписать 40 задач так, чтобы действие начиналось с глагола и не обещало лишнего.
- [ ] Синхронизировать `tasks.js` и `extension/tasks.js` из `tasks.json`.

### Task 2: надёжность состояния и импортов

**Files:**
- Modify: `core.js`, `app.js`, `extension/popup.js`.
- Test: `tests/core.test.js`.

- [ ] Ограничить импорт по размеру до 1 МБ до чтения текста.
- [ ] Привести ошибки импорта к одному понятному сообщению и не показывать сырые ошибки парсера.
- [ ] Не доверять данным из `localStorage`: сохранять только нормализованное состояние и безопасно восстанавливать активную сессию.
- [ ] Добавить тесты для размера/пустого импорта, дубликатов и граничной длительности.

### Task 3: единая визуальная система

**Files:**
- Modify: `styles.css`, `extension/styles.css`.
- Modify: `index.html`, `extension/popup.html` при необходимости для классов и семантики.

- [ ] Сохранить bone/paper/ink/red/blue, но выровнять ритм, размеры текста, состояния hover/pressed/focus и мобильную сетку.
- [ ] Добавить `prefers-reduced-motion`, лучшее состояние завершённого таймера и более ясную иерархию настроек.
- [ ] Проверить ширины 320, 390, 740 и desktop без горизонтального скролла.

### Task 4: GitHub-ready материалы

**Files:**
- Create: `.nojekyll`.
- Modify: `README.md`, `extension/README.md`.
- Create: `docs/github-pages.md` — короткая инструкция включения Pages и публикации.

- [ ] Объяснить, что корень проекта уже является статическим сайтом для Pages.
- [ ] Описать приватность без рекламных или сетевых обещаний сверх фактов.
- [ ] Сохранить точные команды локальной проверки и установки расширения.

### Task 5: проверка

**Files:**
- No code changes unless a check finds a defect.

- [ ] Запустить `node --test tests/core.test.js`.
- [ ] Запустить `node --check app.js`, `node --check extension/popup.js`, `node scripts/sync-tasks.js`.
- [ ] Запустить локальный сервер и Playwright smoke-тест: старт, задача, пауза, продолжение, ещё одна, настройки, импорт/ошибка.
- [ ] Проверить итоговый diff и отсутствие рассинхрона задач.
