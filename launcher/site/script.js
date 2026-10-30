(function () {
  var stage = document.querySelector(".stage");
  var screen = document.getElementById("monitor");
  var options = Array.prototype.slice.call(document.querySelectorAll(".option"));
  var enter = document.getElementById("enter");
  var enterLabel = document.getElementById("enter-label");
  var status = document.getElementById("status");
  var pad = document.querySelector(".controller");
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  var current = 0;
  var leaving = false;

  function name(i) {
    return "Version " + options[i].getAttribute("data-v").toUpperCase();
  }

  function select(i) {
    current = i;
    options.forEach(function (o, n) {
      if (n === i) o.setAttribute("aria-current", "true");
      else o.removeAttribute("aria-current");
    });
    var changed = stage.getAttribute("data-sel") !== options[i].getAttribute("data-v");
    stage.setAttribute("data-sel", options[i].getAttribute("data-v"));
    if (changed && !reduced.matches) {
      pad.classList.remove("ping");
      void pad.getBoundingClientRect();
      pad.classList.add("ping");
    }
    enter.href = options[i].href;
    enterLabel.textContent = "Enter " + name(i);
    status.textContent = name(i) + " selected";
  }

  // Move toward the screen, then load the site as an ordinary page.
  function go(event) {
    if (leaving || event.defaultPrevented || event.button > 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (reduced.matches) return; // plain navigation, no animation
    var href = event.currentTarget.href;
    event.preventDefault();
    leaving = true;
    var s = stage.getBoundingClientRect();
    var m = screen.getBoundingClientRect();
    var zoom = Math.max(1.2, Math.min(2.4, window.innerWidth / m.width));
    stage.style.setProperty("--zoom", zoom);
    stage.style.setProperty("--ox", m.left + m.width / 2 - s.left + "px");
    stage.style.setProperty("--oy", m.top + m.height / 2 - s.top + "px");
    pad.classList.remove("ping");
    pad.classList.add("press");
    document.body.classList.add("leaving");
    stage.classList.add("entering");
    setTimeout(function () {
      window.location.href = href;
    }, 400);
  }

  options.forEach(function (o, i) {
    o.addEventListener("focus", function () { select(i); });
    o.addEventListener("pointerenter", function (e) { if (e.pointerType === "mouse") select(i); });
    o.addEventListener("click", go);
  });
  enter.addEventListener("click", go);

  document.addEventListener("keydown", function (e) {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    var active = document.activeElement;
    if (!(screen.contains(active) || active === document.body)) return;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      var next = e.key === "ArrowLeft" ? 0 : options.length - 1;
      e.preventDefault();
      select(next);
      options[next].focus({ preventScroll: true });
    } else if (e.key === "Enter" && active === document.body) {
      e.preventDefault();
      options[current].click();
    }
  });

  // Returning with the browser's Back button should show the page, not the zoom.
  window.addEventListener("pageshow", function (e) {
    if (!e.persisted) return;
    leaving = false;
    stage.classList.remove("entering");
    pad.classList.remove("press");
    document.body.classList.remove("leaving");
  });
})();
