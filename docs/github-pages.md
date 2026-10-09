# публикация на GitHub Pages

корень репозитория уже подготовлен как статический сайт: точка входа — `index.html`, сборка не нужна.

## включить Pages

1. создай пустой репозиторий на GitHub и загрузи содержимое этой папки в ветку `main`;
2. открой **Settings → Pages**;
3. в разделе **Build and deployment** выбери **Deploy from a branch**;
4. укажи ветку `main` и папку `/ (root)`;
5. сохрани настройку и подожди, пока GitHub покажет адрес сайта.

файл `.nojekyll` уже лежит в корне, поэтому GitHub Pages отдаёт папки и файлы проекта без лишней обработки.

## локально перед публикацией

```bash
node --test tests/core.test.js
node --check app.js
node --check extension/popup.js
node scripts/sync-tasks.js
python3 -m http.server 8000
```

после запуска открой <http://127.0.0.1:8000> и проверь старт, таймер, настройки, импорт и мобильную ширину.
