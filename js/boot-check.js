(function () {
  var splash = document.getElementById("splash");
  var msg = document.getElementById("splashMsg");
  if (!splash) return;

  function fail(text) {
    if (!document.getElementById("splash")) return;
    msg.textContent = text;
    splash.classList.add("fail");
  }

  if (location.protocol === "file:") {
    fail("Страница открыта двойным кликом (file://) — так Firebase не работает. " +
         "Запусти START.bat (Windows) или start.sh (Mac/Linux) из папки Pik. " +
         "Либо выполни в папке: python -m http.server 8000 — и открой http://localhost:8000");
    return;
  }

  window.addEventListener("error", function (e) {
    var t = e.target;
    if (t && (t.tagName === "SCRIPT" || t.tagName === "LINK") && (t.src || t.href)) {
      fail("Не загрузился файл: " + (t.src || t.href) + ". Проверь интернет и блокировщики рекламы (Firebase грузится с gstatic.com).");
    } else if (e.message) {
      fail("Ошибка в коде: " + e.message);
    }
  }, true);

  window.addEventListener("unhandledrejection", function (e) {
    var r = e.reason || {};
    fail("Ошибка: " + (r.code || r.message || r));
  });

  setTimeout(function () {
    fail("Не удалось выполнить вход за 8 секунд. Проверь интернет, отключи блокировщик рекламы и открой консоль (F12 → Console) — там будет причина.");
  }, 8000);
})();
