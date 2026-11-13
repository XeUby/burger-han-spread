# Начало работы для каждого участника

Репозиторий: https://github.com/XeUby/burger-han-spread

## Ваша задача

| Участник | Issue | Ветка | Файлы |
|---|---|---|---|
| Doni / derzetta | [#1](https://github.com/XeUby/burger-han-spread/issues/1) | feature/pricing | pricing.py, tests/test_pricing_*.py |
| yerzham | [#2](https://github.com/XeUby/burger-han-spread/issues/2) | feature/dispatch | dispatching.py, tests/test_dispatch_*.py |
| Yera (ник ожидается) | [#3](https://github.com/XeUby/burger-han-spread/issues/3) | feature/notes | notes.py, tests/test_notes.py |
| Boris / XeUby | [#4](https://github.com/XeUby/burger-han-spread/issues/4) | feature/reliability | интеграция, запуск, общие тесты |

Роли можно поменять по договорённости. Не редактируйте одновременно общие файлы. Новые поля Policy и интеграционные изменения согласуйте в issue.

## 1. Получите свою копию

**Без приглашения:** откройте репозиторий → Fork → создайте копию в своём аккаунте. Клонируйте свой fork через Code → HTTPS. Добавьте основной репозиторий как upstream:

```sh
git remote add upstream https://github.com/XeUby/burger-han-spread.git
git fetch upstream
git switch -c feature/pricing upstream/main
```

Замените `feature/pricing` на ветку из своей строки. Если локальная ветка уже существует, используйте `git switch feature/pricing`.

**После принятия приглашения на запись:** можно клонировать основной репозиторий и переключиться на подготовленную ветку:

```sh
git clone https://github.com/XeUby/burger-han-spread.git
cd burger-han-spread
git switch feature/pricing
```

У каждого отдельная локальная папка. Не используйте одну папку на общем диске для нескольких моделей.

## 2. Установите окружение

Нужен Python 3.12. В папке проекта:

```sh
python setup_dev.py
```

Скрипт создаст .venv, установит зависимости и создаст .env из шаблона, если файла ещё нет. Windows: если команда python недоступна, попробуйте `py -3.12 setup_dev.py`.

Командный ключ возьмите у Boris приватно и вставьте в .env. Он нужен только для симуляций. Для unit-тестов ключ не требуется. Не вставляйте его в issue, PR, screenshots или публичный чат.

Windows:

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
.\.venv\Scripts\python.exe run.py --seed spread-1
```

macOS/Linux:

```sh
.venv/bin/python -m unittest discover -s tests -v
.venv/bin/python run.py --seed spread-1
```

## 3. Дайте своей модели задачу

Скопируйте текст и замените номер задачи:

> Работаем над https://github.com/XeUby/burger-han-spread, задача #1 (замени на свою). Прочитай AGENTS.md, CONTRIBUTING.md, docs/TEAM.md, issue и docs/RULES.md. Подготовь окружение и работай только в моей feature-ветке. Если нет write-доступа, используй мой fork и PR в основной репозиторий. Меняй только файлы своей задачи; общие интерфейсы согласуй с интегратором. Сначала измерь текущую версию, потом сравни изменение на тех же seed. Не раскрывай .env, не удаляй чужие миры, не запускай --board или --final. Сделай тесты и PR с точными результатами и ограничениями. Не заявляй об улучшении без измерений.

## 4. Проверяйте честно

- На текущей main измерьте spread-1, burger-validation-1, burger-validation-2. Сохраните world ID и commit.
- После изменения повторите те же seed. `--baseline` — исходный SDK starter, а не предыдущая командная версия. Для сравнения с main используйте main без этого флага.
- Для серии: `python benchmark.py --workers 2 --seeds spread-1 burger-validation-1 burger-validation-2` (из активированной .venv).
- Не более двух одновременных миров на участника; лимит команды — восемь. Зависшие миры тоже занимают места.
- Сохраняйте все результаты, включая неудачные: маржа, число заказов, своевременность, ошибки действий.
- Порог 90% нужен в каждой неделе, а не только в среднем. Финальные проверки на новых seed делает интегратор.
- `benchmark.py` использует Policy текущей ветки. При сравнении отдельных CLI-настроек используйте одинаковые флаги `run.py` и записывайте их.

## 5. Отправьте результат

```sh
git add pricing.py tests/test_pricing_example.py docs/experiments/pricing.md
git commit -m "Improve order selection with measured supply constraints"
git push -u origin feature/pricing
```

Имена файлов и сообщение замените на реальные. Перед commit выполните `git diff --cached` и убедитесь, что там только ваша работа.

На GitHub создайте Pull Request: base repository `XeUby/burger-han-spread`, base branch `main`, compare — ваша ветка (в fork или общем repo). В описании укажите `Closes #1` с номером своей задачи. Заполните шаблон PR.

CI выполняет unit-тесты и проверку Python на push/PR. Симуляции в CI не запускаются, командный ключ туда не передаётся. Для PR из fork GitHub может запросить у владельца разрешение первого запуска workflow.

Boris проверяет результаты и объединяет PR по одному. После объединения синхронизируйте main и создайте новую ветку для следующей задачи. Не делайте force-push в общие ветки и не меняйте main напрямую.

## Доступ

Fork и Pull Request доступны для публичного репозитория без write-приглашения. Для прямой записи Boris должен открыть Settings → Collaborators → Add people, пригласить нужный GitHub-аккаунт; участник принимает приглашение. На момент подготовки приглашения не отправлены. Правило «main только через PR» пока организационное: серверная защита ветки не настроена.
