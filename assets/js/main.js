/* =============================================================
   Kurry Tranzit Logist — interface layer
   Smooth single-page scrolling, header, reveal animations,
   counters, card tilt, contact form.
   ============================================================= */
(function () {
  "use strict";

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var canHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  var root = document.documentElement;

  /* -------------------------------------------------------------
     1. Smooth scrolling (one continuous page, no reloads)
  ------------------------------------------------------------- */
  var header = document.querySelector("[data-header]");
  var headerOffset = function () {
    return (header ? header.offsetHeight : 70) + 14;
  };

  var tweenId = 0;
  function scrollToY(targetY, done) {
    var startY = window.pageYOffset || document.documentElement.scrollTop;
    var maxY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    var endY = clamp(targetY, 0, maxY);
    var dist = endY - startY;
    cancelAnimationFrame(tweenId);

    if (reduced || Math.abs(dist) < 2) {
      window.scrollTo(0, endY);
      if (done) done();
      return;
    }

    // temporarily switch off the CSS smooth behaviour so our tween
    // is the only thing driving the scroll position
    root.style.scrollBehavior = "auto";
    var duration = clamp(Math.abs(dist) * 0.42, 480, 1150);
    var start = performance.now();

    function step(now) {
      var p = clamp((now - start) / duration, 0, 1);
      var eased = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; // easeInOutCubic
      window.scrollTo(0, startY + dist * eased);
      if (p < 1) {
        tweenId = requestAnimationFrame(step);
      } else {
        root.style.scrollBehavior = "";
        if (done) done();
      }
    }
    tweenId = requestAnimationFrame(step);
  }

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  document.addEventListener("click", function (e) {
    var link = e.target.closest ? e.target.closest('a[href^="#"]') : null;
    if (!link) return;
    var hash = link.getAttribute("href");
    if (!hash || hash === "#" || link.hasAttribute("data-no-scroll")) return;
    var target = document.querySelector(hash);
    if (!target) return;

    e.preventDefault();
    closeMenu();
    var y = target.getBoundingClientRect().top + (window.pageYOffset || document.documentElement.scrollTop) - headerOffset();
    scrollToY(y);
    if (history.replaceState) history.replaceState(null, "", hash);
  });

  /* -------------------------------------------------------------
     2. Header, progress bar, back-to-top
  ------------------------------------------------------------- */
  var progressBar = document.querySelector("[data-progress-bar]");
  var toTop = document.querySelector("[data-to-top]");
  var ticking = false;

  function onScrollFrame() {
    var y = window.pageYOffset || document.documentElement.scrollTop;

    if (header) header.classList.toggle("is-stuck", y > 12);
    if (toTop) toTop.classList.toggle("is-visible", y > 620);

    if (progressBar) {
      var max = document.documentElement.scrollHeight - window.innerHeight;
      progressBar.style.width = (max > 0 ? clamp(y / max, 0, 1) * 100 : 0) + "%";
    }
    ticking = false;
  }
  function requestScroll() {
    if (!ticking) { ticking = true; requestAnimationFrame(onScrollFrame); }
  }
  window.addEventListener("scroll", requestScroll, { passive: true });
  window.addEventListener("resize", requestScroll, { passive: true });
  onScrollFrame();

  if (toTop) {
    toTop.addEventListener("click", function () { scrollToY(0); });
  }

  /* -------------------------------------------------------------
     3. Mobile menu
  ------------------------------------------------------------- */
  var burger = document.querySelector("[data-menu-toggle]");
  var menu = document.querySelector("[data-mobile-menu]");

  function closeMenu() {
    if (!menu || menu.hidden) return;
    menu.hidden = true;
    if (burger) { burger.setAttribute("aria-expanded", "false"); burger.setAttribute("aria-label", "Menyuni ochish"); }
    if (header) header.classList.remove("is-open");
    document.documentElement.style.overflow = "";
  }
  function openMenu() {
    if (!menu) return;
    menu.hidden = false;
    if (burger) { burger.setAttribute("aria-expanded", "true"); burger.setAttribute("aria-label", "Menyuni yopish"); }
    if (header) header.classList.add("is-open");
    document.documentElement.style.overflow = "hidden";
  }
  if (burger && menu) {
    burger.addEventListener("click", function () {
      if (menu.hidden) openMenu(); else closeMenu();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeMenu();
    });
    window.addEventListener("resize", function () {
      if (window.innerWidth > 900) closeMenu();
    });
  }

  /* -------------------------------------------------------------
     4. Reveal on scroll + active section tracking
  ------------------------------------------------------------- */
  var revealables = Array.prototype.slice.call(document.querySelectorAll("[data-reveal]"));
  var heroAnims = Array.prototype.slice.call(document.querySelectorAll("[data-hero-anim]"));

  // stagger delays inside grids
  revealables.forEach(function (el) {
    var parent = el.parentElement;
    if (!parent) return;
    var siblings = Array.prototype.filter.call(parent.children, function (n) { return n.hasAttribute && n.hasAttribute("data-reveal"); });
    if (siblings.length > 1) {
      var i = siblings.indexOf(el);
      el.style.setProperty("--reveal-delay", Math.min(i * 75, 420) + "ms");
    }
  });

  if ("IntersectionObserver" in window && !reduced) {
    var revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        revealObserver.unobserve(entry.target);
        startCounters(entry.target);
      });
    }, { threshold: 0.14, rootMargin: "0px 0px -6% 0px" });
    revealables.forEach(function (el) { revealObserver.observe(el); });
  } else {
    revealables.forEach(function (el) { el.classList.add("is-visible"); });
  }

  // active nav link
  var sections = Array.prototype.slice.call(document.querySelectorAll("[data-section]"));
  var navLinks = Array.prototype.slice.call(document.querySelectorAll("[data-nav]"));
  function setActive(id) {
    navLinks.forEach(function (a) {
      if (a.getAttribute("data-nav") === id) a.classList.add("is-active");
      else a.classList.remove("is-active");
    });
  }
  if ("IntersectionObserver" in window) {
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) setActive(entry.target.id);
      });
    }, { rootMargin: "-45% 0px -50% 0px", threshold: 0 });
    sections.forEach(function (s) { spy.observe(s); });
  }

  // hero intro
  function revealHero() { root.classList.add("is-ready"); }
  if (reduced) revealHero();
  else {
    window.addEventListener("load", revealHero, { once: true });
    setTimeout(revealHero, 1400); // failsafe if a resource is slow
  }

  /* -------------------------------------------------------------
     5. Animated numbers
  ------------------------------------------------------------- */
  function startCounters(scope) {
    var list = (scope && scope.querySelectorAll) ? scope.querySelectorAll("[data-count]") : [];
    if (scope && scope.hasAttribute && scope.hasAttribute("data-count")) list = [scope].concat(Array.prototype.slice.call(list));
    Array.prototype.forEach.call(list, function (el) {
      if (el.dataset.counted) return;
      el.dataset.counted = "1";
      var target = parseFloat(el.getAttribute("data-count")) || 0;
      var decimals = parseInt(el.getAttribute("data-decimals") || "0", 10);
      var suffix = el.getAttribute("data-suffix") || "";
      if (reduced) { el.textContent = target.toFixed(decimals) + suffix; return; }
      var duration = 1500;
      var start = performance.now();
      (function tick(now) {
        var p = clamp((now - start) / duration, 0, 1);
        var eased = 1 - Math.pow(1 - p, 3);
        el.textContent = (target * eased).toFixed(decimals) + suffix;
        if (p < 1) requestAnimationFrame(tick);
      })(start);
    });
  }
  window.addEventListener("load", function () {
    var hero = document.querySelector(".hero");
    if (hero) startCounters(hero);
  });

  /* -------------------------------------------------------------
     6. Subtle 3D tilt on cards
  ------------------------------------------------------------- */
  if (canHover && !reduced) {
    Array.prototype.forEach.call(document.querySelectorAll("[data-tilt]"), function (el) {
      var raf = null, tx = 0, ty = 0;

      function apply() {
        raf = null;
        el.style.transform = "perspective(900px) rotateX(" + tx.toFixed(2) + "deg) rotateY(" + ty.toFixed(2) + "deg) translateZ(0)";
      }
      el.addEventListener("pointermove", function (e) {
        if (el.hasAttribute("data-reveal") && !el.classList.contains("is-visible")) return;
        var r = el.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width - 0.5;
        var py = (e.clientY - r.top) / r.height - 0.5;
        tx = -py * 7;
        ty = px * 8;
        if (!raf) raf = requestAnimationFrame(apply);
      });
      el.addEventListener("pointerleave", function () {
        tx = 0; ty = 0;
        if (!raf) raf = requestAnimationFrame(apply);
      });
    });
  }

  /* -------------------------------------------------------------
     7. Contact form
  ------------------------------------------------------------- */
  var form = document.querySelector("[data-contact-form]");
  if (form) {
    var successBox = form.querySelector("[data-form-success]");
    var copyBtn = form.querySelector("[data-copy-message]");
    var lastMessage = "";

    function setError(input, message) {
      var field = input.closest(".field");
      var slot = form.querySelector('[data-error-for="' + input.id + '"]');
      if (field) field.classList.toggle("has-error", !!message);
      if (slot) slot.textContent = message || "";
      input.setAttribute("aria-invalid", message ? "true" : "false");
    }

    function validate() {
      var ok = true;
      var name = form.elements["name"];
      var phone = form.elements["phone"];

      if (!name.value.trim()) { setError(name, "Ism-familiyani kiriting"); ok = false; }
      else setError(name, "");

      var digits = phone.value.replace(/[^\d+]/g, "");
      if (!digits) { setError(phone, "Telefon raqamini kiriting"); ok = false; }
      else if (digits.replace(/\D/g, "").length < 9) { setError(phone, "Raqam to‘liq yozilmagan"); ok = false; }
      else setError(phone, "");

      return ok;
    }

    Array.prototype.forEach.call(form.querySelectorAll("input"), function (input) {
      input.addEventListener("input", function () {
        if (input.closest(".field").classList.contains("has-error")) validate();
      });
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!validate()) {
        var bad = form.querySelector(".has-error input");
        if (bad) bad.focus();
        return;
      }

      var d = form.elements;
      lastMessage = [
        "Kurry Tranzit Logist — so‘rov",
        "Ism: " + d["name"].value.trim(),
        "Telefon: " + d["phone"].value.trim(),
        "Yuk turi: " + d["type"].value,
        "Yo‘nalish: " + (d["route"].value.trim() || "ko‘rsatilmagan"),
        "Hajm: " + (d["weight"].value.trim() || "ko‘rsatilmagan"),
        "Xabar: " + (d["message"].value.trim() || "—")
      ].join("\n");

      if (successBox) {
        successBox.hidden = false;
        successBox.scrollIntoView({ block: "nearest", behavior: reduced ? "auto" : "smooth" });
      }
    });

    if (copyBtn) {
      copyBtn.addEventListener("click", function () {
        var done = function () {
          copyBtn.textContent = "Nusxalandi ✓";
          setTimeout(function () { copyBtn.textContent = "Xabar matnini nusxalash"; }, 2200);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(lastMessage).then(done, fallbackCopy);
        } else {
          fallbackCopy();
        }
        function fallbackCopy() {
          var ta = document.createElement("textarea");
          ta.value = lastMessage;
          ta.setAttribute("readonly", "");
          ta.style.position = "fixed";
          ta.style.opacity = "0";
          document.body.appendChild(ta);
          ta.select();
          try { document.execCommand("copy"); done(); } catch (err) { /* ignore */ }
          document.body.removeChild(ta);
        }
      });
    }
  }

  /* -------------------------------------------------------------
     8. Misc
  ------------------------------------------------------------- */
  Array.prototype.forEach.call(document.querySelectorAll("[data-year]"), function (el) {
    el.textContent = String(new Date().getFullYear());
  });
})();
