// Elite shared client behavior.
// - Auto-injects a mobile hamburger drawer on ≤768px so the nav doesn't
//   crush against the JOIN WAITLIST CTA at small widths.
// - Single source of truth — every page just adds <script defer src="…"></script>
//   and inherits.
//
// Strategy: leave the desktop DOM untouched. On mobile, inject a hamburger
// button + transparent overlay; when toggled, slide the existing <nav> in
// from the right as a full-height drawer. CSS in elite.css owns the
// presentation; this file owns the behavior.

// ── Canonical nav — ONE source of truth for the menu ─────────────────────
// The nav used to be hardcoded in every page's HTML, so items drifted (a new
// feature like YUP! showed on some pages and vanished on others). This rebuilds
// the nav <ul> from a single list on EVERY page, so every feature is always
// listed, same order, everywhere. Add a feature here once → it's site-wide.
// Runs first (before the drawer + active-state logic below).
(function () {
  "use strict";
  if (typeof document === "undefined") return;
  var NAV = [
    { href: "/yup.html", label: "YUP!" },
    { href: "/live.html", label: "Live" },
    { href: "/whales.html", label: "Whales" },
    { href: "/conviction.html", label: "Conviction" },
    { href: "/arb.html", label: "ARB" },
    { href: "/buzz.html", label: "Buzz" },
    { href: "/edge.html", label: "Edge" },
    // Rug Radar (/tracker.html) lives in the footer now — plenty of those tools
    // out there, not a primary destination. Token lives under the "Buy $EDGE"
    // button (nav-right); token launch is TBD.
  ];
  function normalizeNav() {
    var header = document.querySelector("header.site-nav") || document.querySelector("header.elite-nav") || document.querySelector("header");
    if (!header) return;
    var ul = header.querySelector("nav ul");
    if (!ul) return;
    ul.innerHTML = NAV.map(function (n) {
      return '<li><a href="' + n.href + '">' + n.label + "</a></li>";
    }).join("");
  }
  // Rug Radar lives in the footer now — append it to the footer's link row
  // (whichever page has one) so it stays reachable without a menu slot.
  function normalizeFooter() {
    var footer = document.querySelector("footer");
    if (!footer) return;
    // Canonical X account — the official handle is @gopolyedge. Only rewrite
    // profile links (ending in a handle), never share-intent/search URLs.
    var x = footer.querySelector('a[href*="x.com/"], a[href*="twitter.com/"]');
    if (x && /(x|twitter)\.com\/[a-z0-9_]+\/?$/i.test(x.getAttribute("href") || "")) x.href = "https://x.com/gopolyedge";
    if (footer.querySelector('a[href="/tracker.html"]')) return;
    // append next to the existing footer links, whatever the layout
    var anchors = footer.querySelectorAll("a");
    var linkRow = anchors.length ? anchors[anchors.length - 1].parentElement : footer;
    var a = document.createElement("a");
    a.href = "/tracker.html";
    a.textContent = "Rug Radar";
    linkRow.appendChild(a);
  }
  function normalize() { normalizeNav(); normalizeFooter(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", normalize);
  else normalize();
})();

(function () {
  "use strict";

  if (typeof window === "undefined" || typeof document === "undefined") return;

  function init() {
    const header = document.querySelector("header");
    if (!header) return;
    const nav = header.querySelector("nav");
    if (!nav) return;

    // Avoid double-injection if script runs twice
    if (header.dataset.eliteInited) return;
    header.dataset.eliteInited = "1";

    // ── Build hamburger button ──────────────────────────────────────
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "elite-hamburger";
    toggle.setAttribute("aria-label", "Open menu");
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-controls", "elite-drawer");
    toggle.innerHTML = `
      <span class="elite-hamburger-bar"></span>
      <span class="elite-hamburger-bar"></span>
      <span class="elite-hamburger-bar"></span>
    `;
    // Place hamburger just before the nav so the visual order on mobile is
    // logo · hamburger · CTA, with nav becoming a drawer (positioned absolute).
    header.insertBefore(toggle, nav);

    // Wrap nav with the drawer attributes
    nav.id = "elite-drawer";
    nav.classList.add("elite-drawer");

    // ── Backdrop overlay (clicking dismisses) ───────────────────────
    const backdrop = document.createElement("div");
    backdrop.className = "elite-backdrop";
    backdrop.setAttribute("aria-hidden", "true");
    document.body.appendChild(backdrop);

    // ── Open / close handlers ───────────────────────────────────────
    function setOpen(open) {
      document.documentElement.classList.toggle("elite-drawer-open", open);
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
      if (open) {
        backdrop.classList.add("show");
        // Trap focus inside the drawer for a11y
        const firstLink = nav.querySelector("a");
        if (firstLink) setTimeout(() => firstLink.focus(), 50);
      } else {
        backdrop.classList.remove("show");
        toggle.focus();
      }
    }

    toggle.addEventListener("click", () => {
      const isOpen = document.documentElement.classList.contains("elite-drawer-open");
      setOpen(!isOpen);
    });

    backdrop.addEventListener("click", () => setOpen(false));

    // Click any link inside the drawer → close the drawer first so the
    // navigation feels intentional (no flash of overlay during page transition)
    nav.addEventListener("click", (e) => {
      if (e.target.closest("a")) setOpen(false);
    });

    // Escape closes
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && document.documentElement.classList.contains("elite-drawer-open")) {
        setOpen(false);
      }
    });

    // When viewport grows past mobile breakpoint, ensure drawer is closed
    const mq = window.matchMedia("(min-width: 769px)");
    const handleMq = () => {
      if (mq.matches) setOpen(false);
    };
    if (mq.addEventListener) mq.addEventListener("change", handleMq);
    else if (mq.addListener) mq.addListener(handleMq); // Safari fallback
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

// ── Premium glass nav: scroll state, scroll-progress, active page, ⌘K chip ──
// Skin + behavior for the shared header. Pairs with the `header.elite-nav`
// styles in elite.css. Non-structural — never touches header height.
(function () {
  "use strict";
  if (typeof window === "undefined" || typeof document === "undefined") return;

  function initNav() {
    const header = document.querySelector("header");
    if (!header || header.dataset.eliteNav) return;
    header.dataset.eliteNav = "1";
    header.classList.add("elite-nav");

    // Active-page indicator — mark the nav link matching this page
    const path = location.pathname.replace(/\/index\.html$/, "/");
    header.querySelectorAll("nav a").forEach((a) => {
      const href = a.getAttribute("href") || "";
      if (!href || href === "#") return;
      const hp = href.replace(/\/index\.html$/, "/");
      if (hp === path) a.classList.add("is-active");
    });

    // Feature glyphs — injected into each nav link (hidden on the desktop rail,
    // shown as leading icons on the mobile drawer rows via elite.css)
    const NAV_ICONS = {
      "/edge.html": "▲", "/arb.html": "⇄", "/buzz.html": "◆", "/live.html": "⚡", "/conviction.html": "✦",
      "/whales.html": "◉", "/yup.html": "◫", "/tracker.html": "⚠", "/token.html": "$",
      "/dashboard.html": "▤", "/about.html": "◈",
    };
    header.querySelectorAll("nav ul a").forEach((a) => {
      const href = (a.getAttribute("href") || "").split("?")[0];
      const ico = NAV_ICONS[href];
      if (ico && !a.querySelector(".nav-ico")) {
        const s = document.createElement("span");
        s.className = "nav-ico";
        s.setAttribute("aria-hidden", "true");
        s.textContent = ico;
        a.insertBefore(s, a.firstChild);
      }
    });

    // Drawer primary actions — Dashboard (home base) + Buy, pinned at the foot
    // of the mobile drawer (hidden on desktop via elite.css)
    const navEl = header.querySelector("nav");
    if (navEl && !navEl.querySelector(".elite-drawer-cta")) {
      const cta = document.createElement("div");
      cta.className = "elite-drawer-cta";
      cta.innerHTML =
        '<div class="elite-drawer-live"><span class="live-dot"></span>Live · markets open</div>' +
        '<a class="cta-dash" href="/dashboard.html">▤ Open Dashboard</a>' +
        '<a class="cta-buy" href="/token.html">Buy $EDGE</a>';
      navEl.appendChild(cta);
    }

    // ⌘K chip — only where the nav-right CTA cluster exists (keeps minimal
    // headers like the dashboard untouched). Triggers the global palette.
    const navRight = header.querySelector(".nav-right");
    if (navRight && !navRight.querySelector(".elite-cmdk")) {
      const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform);
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "elite-cmdk";
      chip.setAttribute("aria-label", "Open command palette");
      chip.innerHTML = '<span aria-hidden="true">⌕</span><kbd>' + (isMac ? "⌘" : "Ctrl ") + "K</kbd>";
      chip.addEventListener("click", () => {
        document.dispatchEvent(
          new KeyboardEvent("keydown", { key: "k", metaKey: isMac, ctrlKey: !isMac, bubbles: true })
        );
      });
      navRight.insertBefore(chip, navRight.firstChild);
    }

    // Scroll state + progress. The class toggle is SYNCHRONOUS (instant, robust
    // even if rAF is throttled); only the progress var is rAF-throttled.
    let ticking = false;
    function onScroll() {
      const y = window.scrollY || document.documentElement.scrollTop || 0;
      header.classList.toggle("is-scrolled", y > 10);
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const docH = document.documentElement.scrollHeight - window.innerHeight;
        const p = docH > 0 ? Math.min(1, Math.max(0, (window.scrollY || 0) / docH)) : 0;
        header.style.setProperty("--scroll-progress", p.toFixed(4));
        ticking = false;
      });
    }
    // Apply the initial state WITHOUT animating, so a scrolled-position page
    // load (or back/forward restore) doesn't flash the header into place.
    header.style.transition = "none";
    onScroll();
    void header.offsetHeight;
    header.style.transition = "";
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initNav);
  } else {
    initNav();
  }
})();
