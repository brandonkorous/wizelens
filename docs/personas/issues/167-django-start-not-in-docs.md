# 167 — The Python docs' start command stops a Django app with a settings error

**Status:** fixed
**Severity:** major
**Found by:** P06 Ifeoma, act 6 (sending the Ostrava Bikes Django shop to its project, by the Python docs)
**Surface:** Site › Docs › Python
**Filed:** 2026-10-28
**Fixed:** 2026-10-28
**Confirmed by:** P06 Ifeoma at Site › Docs › Python, 1440 light, 17:17

## What happened

The page says Django works "with no code change" and shows only `opentelemetry-instrument uvicorn app:app`. Run the
same way, `opentelemetry-instrument python manage.py runserver` stopped at once with "CommandError: You must set
settings.ALLOWED_HOSTS if DEBUG is False", though the settings file sets it. The Django instrumentation loads
Django before `manage.py` names the settings, so it ran on empty settings. Nothing on the page says why. The
body-capture row also said "after the OpenTelemetry one", a middleware the reader never added.

## Where it lives

`site/content/docs/python.md`, "Start with opentelemetry-instrument" and "Request and response bodies".

## Fix

A Django paragraph and command: set `DJANGO_SETTINGS_MODULE`, use `runserver --noreload`, and the same for Gunicorn
or uWSGI; it names the error a reader sees without it. The middleware row says the instrumentation puts its own first.

## Confirmation

- 17:16, Ifeoma: the Ostrava shop started with the page's command (`DJANGO_SETTINGS_MODULE=shop.settings
  OTEL_SERVICE_NAME=ostrava-shop opentelemetry-instrument python manage.py runserver 127.0.0.1:5302 --noreload`), with
  no settings error; its requests and log lines reached the Ostrava project.
- 17:17, Ifeoma: the rebuilt Python docs page shows the Django paragraph, the error it prevents, and the command with
  its Copy button.
