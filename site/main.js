/**
 * Locale behavior for the portfolio site (site/).
 *
 * Classic script (no build, no module) loaded AFTER i18n.js, so it can read the
 * global `I18N` dictionary. Responsibilities (behavior only):
 *   1. Resolve the initial locale from `localStorage['portfolio.locale']`
 *      (guard: only `es` | `en`, otherwise `es`).
 *   2. Sync `<html lang>` and apply the dictionary:
 *        [data-i18n]       -> textContent
 *        [data-i18n-html]  -> innerHTML
 *        [data-i18n-title] -> document.title
 *        [data-i18n-meta]  -> meta[name=description] content
 *   3. Wire the two-button toggle: persist, re-apply, and keep aria-pressed /
 *      the active `btn-primary` class in sync.
 *   4. (Optional) Highlight the nav link of the section in view.
 *
 * Default markup is Spanish, so the page stays readable with JS disabled.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'portfolio.locale';
  var DEFAULT_LOCALE = 'es';
  var LOCALES = ['es', 'en'];

  function isLocale(value) {
    return LOCALES.indexOf(value) !== -1;
  }

  function readStoredLocale() {
    var stored = null;
    try {
      stored = window.localStorage.getItem(STORAGE_KEY);
    } catch (err) {
      stored = null; /* storage unavailable (e.g. private mode) */
    }
    return isLocale(stored) ? stored : DEFAULT_LOCALE;
  }

  function storeLocale(locale) {
    try {
      window.localStorage.setItem(STORAGE_KEY, locale);
    } catch (err) {
      /* locale still applies for the current session */
    }
  }

  function dictionaryFor(locale) {
    if (typeof I18N !== 'undefined' && I18N && I18N[locale]) {
      return I18N[locale];
    }
    return null;
  }

  function valueFor(dict, key) {
    if (dict && Object.prototype.hasOwnProperty.call(dict, key)) {
      return dict[key];
    }
    console.warn('[i18n] missing key: ' + key);
    return null;
  }

  function syncToggle(locale) {
    document.querySelectorAll('[data-locale]').forEach(function (btn) {
      var active = btn.getAttribute('data-locale') === locale;
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      btn.classList.toggle('btn-primary', active);
    });
  }

  function applyLocale(locale) {
    var dict = dictionaryFor(locale);
    document.documentElement.lang = locale;

    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var value = valueFor(dict, el.getAttribute('data-i18n'));
      if (value !== null) {
        el.textContent = value;
      }
    });

    document.querySelectorAll('[data-i18n-html]').forEach(function (el) {
      var value = valueFor(dict, el.getAttribute('data-i18n-html'));
      if (value !== null) {
        el.innerHTML = value;
      }
    });

    document.querySelectorAll('[data-i18n-title]').forEach(function (el) {
      var value = valueFor(dict, el.getAttribute('data-i18n-title'));
      if (value !== null) {
        document.title = value;
      }
    });

    document.querySelectorAll('[data-i18n-meta]').forEach(function (el) {
      var value = valueFor(dict, el.getAttribute('data-i18n-meta'));
      if (value !== null) {
        el.setAttribute('content', value);
      }
    });

    syncToggle(locale);
  }

  function onToggleClick(event) {
    var locale = event.currentTarget.getAttribute('data-locale');
    if (!isLocale(locale)) {
      return;
    }
    storeLocale(locale);
    applyLocale(locale);
  }

  function initToggle() {
    document.querySelectorAll('[data-locale]').forEach(function (btn) {
      btn.addEventListener('click', onToggleClick);
    });
  }

  function initActiveNav() {
    if (typeof IntersectionObserver === 'undefined') {
      return;
    }

    var links = {};
    document.querySelectorAll('.nav a[href^="#"]').forEach(function (a) {
      links[a.getAttribute('href').slice(1)] = a;
    });

    var sections = document.querySelectorAll('main section[id]');
    if (!sections.length) {
      return;
    }

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) {
            return;
          }
          Object.keys(links).forEach(function (id) {
            links[id].classList.remove('active');
          });
          if (links[entry.target.id]) {
            links[entry.target.id].classList.add('active');
          }
        });
      },
      { rootMargin: '-72px 0px -60% 0px', threshold: 0 }
    );

    sections.forEach(function (section) {
      observer.observe(section);
    });
  }

  function init() {
    applyLocale(readStoredLocale());
    initToggle();
    initActiveNav();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
