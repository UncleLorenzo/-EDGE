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
    { href: "/trade.html", label: "Trade" },
    { href: "/whales.html", label: "Whales" },
    { href: "/feed.html", label: "Feed" },
    { href: "/conviction.html", label: "Conviction" },
    { href: "/arb.html", label: "ARB" },
    { href: "/buzz.html", label: "Buzz" },
    { href: "/edge.html", label: "Edge" },
    // Rug Radar (/tracker.html) lives in the footer now — plenty of those tools
    // out there, not a primary destination. Token is LOCKED (launch TBA), so the
    // nav-right CTA is "Join Waitlist" (→ /waitlist); /token.html holds the full
    // locked tokenomics, still reachable via the footer "Tokenomics" link.
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
      "/whales.html": "◉", "/yup.html": "◫", "/tracker.html": "⚠", "/token.html": "$", "/feed.html": "≋",
      "/trade.html": "◎",
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
        '<a class="cta-buy" href="/waitlist">Join Waitlist</a>';
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

// ── Waitlist modal ───────────────────────────────────────────────────────
// The "Join Waitlist" CTA used to navigate to /waitlist — a full page with its
// own header, which felt jarring (Rob: "goes right to a new page with different
// headers"). Instead, ANY link to /waitlist now opens the signup in-place as an
// overlay on the current page (same header, no navigation). Reuses the exact
// backend (/api/waitlist/join + /api/waitlist/stats). The full page stays one
// click away via the modal's footer link + direct navigation.
(function () {
  "use strict";
  if (typeof window === "undefined" || typeof document === "undefined") return;

  var SOL_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  var ETH_RE = /^0x[a-fA-F0-9]{40}$/;
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  var SITE = "https://www.thepolyedge.com";
  var built = false, lastTrigger = null;

  function css() {
    return [
      "#wlModal{position:fixed;inset:0;z-index:10000;display:none;align-items:center;justify-content:center;padding:20px;font-family:inherit}",
      "#wlModal.wl-open{display:flex}",
      "#wlModal .wl-bd{position:absolute;inset:0;background:rgba(3,3,6,.78);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);animation:wlFade .2s ease}",
      "#wlModal .wl-card{position:relative;width:100%;max-width:440px;max-height:92vh;overflow:auto;background:var(--void-2,#0c0c10);border:1px solid var(--border-bright,rgba(196,255,0,.2));border-radius:20px;padding:30px 26px 20px;box-shadow:0 30px 80px rgba(0,0,0,.6),0 0 60px rgba(196,255,0,.06);animation:wlPop .26s cubic-bezier(.16,1,.3,1)}",
      "@keyframes wlFade{from{opacity:0}to{opacity:1}}",
      "@keyframes wlPop{from{opacity:0;transform:translateY(16px) scale(.97)}to{opacity:1;transform:none}}",
      "#wlModal .wl-x{position:absolute;top:14px;right:14px;width:32px;height:32px;border-radius:9px;border:1px solid var(--border,rgba(245,245,240,.08));background:transparent;color:var(--muted,#6B6B73);font-size:20px;line-height:1;cursor:pointer;transition:.15s}",
      "#wlModal .wl-x:hover{color:var(--white,#F5F5F0);border-color:var(--border-bright,rgba(196,255,0,.2))}",
      "#wlModal .wl-lock{display:inline-flex;align-items:center;gap:7px;font-family:'JetBrains Mono',ui-monospace,monospace;font-size:10.5px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--lime,#C4FF00);border:1px solid var(--border-bright,rgba(196,255,0,.2));border-radius:100px;padding:5px 12px;background:rgba(196,255,0,.05);margin-bottom:14px}",
      "#wlModal h2{margin:0 0 8px;font-size:25px;line-height:1.05;letter-spacing:-.01em;color:var(--white,#F5F5F0);font-weight:800}",
      "#wlModal h2 span{color:var(--lime,#C4FF00)}",
      "#wlModal .wl-sub{margin:0 0 16px;font-size:13.5px;line-height:1.5;color:var(--muted,#6B6B73)}",
      "#wlModal .wl-sub b{color:var(--white,#F5F5F0);font-weight:600}",
      "#wlModal .wl-count{display:flex;align-items:center;gap:8px;font-family:'JetBrains Mono',ui-monospace,monospace;font-size:12px;color:var(--muted,#6B6B73);margin-bottom:18px}",
      "#wlModal .wl-count b{color:var(--lime,#C4FF00);font-size:13px}",
      "#wlModal .wl-dot{width:7px;height:7px;border-radius:50%;background:var(--lime,#C4FF00);box-shadow:0 0 8px var(--lime,#C4FF00);animation:wlPulse 1.6s infinite}",
      "@keyframes wlPulse{0%,100%{opacity:1}50%{opacity:.4}}",
      "#wlModal .wl-label{display:block;font-family:'JetBrains Mono',ui-monospace,monospace;font-size:10.5px;letter-spacing:.04em;text-transform:uppercase;color:var(--muted,#6B6B73);margin:0 0 6px}",
      "#wlModal .wl-row{display:flex;gap:8px;margin:0 0 14px}",
      "#wlModal .wl-input{width:100%;background:var(--void-3,#141418);border:1px solid var(--border,rgba(245,245,240,.08));border-radius:11px;padding:12px 13px;color:var(--white,#F5F5F0);font-size:14px;font-family:'JetBrains Mono',ui-monospace,monospace;outline:none;transition:.15s;margin:0;box-sizing:border-box}",
      "#wlModal .wl-row .wl-input{flex:1;min-width:0}",
      "#wlModal #wlEmail{margin:0 0 16px}",
      "#wlModal .wl-input:focus{border-color:var(--lime,#C4FF00);box-shadow:0 0 0 3px rgba(196,255,0,.1)}",
      "#wlModal .wl-input::placeholder{color:#4a4a52}",
      "#wlModal .wl-connect{flex:0 0 auto;background:var(--void-4,#1c1c22);border:1px solid var(--border-bright,rgba(196,255,0,.2));border-radius:11px;padding:0 14px;color:var(--lime,#C4FF00);font-size:12.5px;font-weight:700;cursor:pointer;white-space:nowrap;transition:.15s}",
      "#wlModal .wl-connect:hover{background:rgba(196,255,0,.08)}",
      "#wlModal .wl-submit{width:100%;background:var(--lime,#C4FF00);color:#050507;border:none;border-radius:12px;padding:14px;font-size:14.5px;font-weight:800;cursor:pointer;margin-top:2px;transition:.15s;font-family:inherit}",
      "#wlModal .wl-submit:hover{transform:translateY(-1px);box-shadow:0 10px 26px rgba(196,255,0,.28)}",
      "#wlModal .wl-submit:disabled{opacity:.6;cursor:default;transform:none;box-shadow:none}",
      "#wlModal .wl-msg{min-height:15px;margin-top:10px;font-size:12px;font-family:'JetBrains Mono',ui-monospace,monospace;text-align:center}",
      "#wlModal .wl-msg.err{color:var(--magenta,#FF006E)}",
      "#wlModal .wl-msg.ok{color:var(--lime,#C4FF00)}",
      "#wlModal .wl-foot{display:block;text-align:center;margin-top:14px;font-size:12px;color:var(--muted,#6B6B73);text-decoration:none}",
      "#wlModal .wl-foot:hover{color:var(--lime,#C4FF00)}",
      "#wlModal .wl-success{text-align:center;padding:8px 0 4px}",
      "#wlModal .wl-badge{font-family:'JetBrains Mono',ui-monospace,monospace;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--lime,#C4FF00);margin-bottom:8px}",
      "#wlModal .wl-pos{font-size:46px;font-weight:800;color:var(--white,#F5F5F0);line-height:1}",
      "#wlModal .wl-pos::before{content:'#';color:var(--lime,#C4FF00);font-size:30px;vertical-align:6px;margin-right:1px}",
      "#wlModal .wl-possub{font-size:12px;color:var(--muted,#6B6B73);font-family:'JetBrains Mono',ui-monospace,monospace;margin:8px 0 18px}",
      "#wlModal .wl-actions{display:flex;flex-direction:column;gap:9px}",
      "#wlModal .wl-share,#wlModal .wl-more{display:block;text-decoration:none;border-radius:11px;padding:12px;font-size:13px;font-weight:700}",
      "#wlModal .wl-share{background:var(--lime,#C4FF00);color:#050507}",
      "#wlModal .wl-more{border:1px solid var(--border,rgba(245,245,240,.08));color:var(--white,#F5F5F0)}",
      "#wlModal .wl-more:hover{border-color:var(--border-bright,rgba(196,255,0,.2))}",
      "html.wl-lock-scroll,body.wl-lock-scroll{overflow:hidden}",
      "@media (max-width:480px){#wlModal{padding:0;align-items:flex-end}#wlModal .wl-card{max-width:none;border-radius:20px 20px 0 0;max-height:94vh;animation:wlSheet .28s cubic-bezier(.16,1,.3,1)}@keyframes wlSheet{from{transform:translateY(100%)}to{transform:none}}}",
    ].join("");
  }

  function setMsg(t, cls) {
    var el = document.getElementById("wlMsg");
    if (!el) return;
    el.textContent = t || "";
    el.className = "wl-msg" + (cls ? " " + cls : "");
  }

  function loadCount() {
    fetch("/api/waitlist/stats").then(function (r) { return r.json(); }).then(function (d) {
      var el = document.getElementById("wlCount");
      if (el && d && typeof d.count === "number") el.textContent = d.count.toLocaleString();
    }).catch(function () {});
  }

  function showSuccess(pos, already) {
    var m = document.getElementById("wlModal");
    m.querySelector("#wlForm").style.display = "none";
    var foot = m.querySelector(".wl-foot"); if (foot) foot.style.display = "none";
    m.querySelector("#wlSuccess").hidden = false;
    m.querySelector("#wlPos").textContent = pos != null ? pos : "—";
    if (already) m.querySelector(".wl-badge").textContent = "✓ Already in";
    var txt = encodeURIComponent("Just claimed my spot on the $EDGE waitlist — Day-Zero allocation for the sharpest prediction-market terminal. 🔒 launch TBA.");
    m.querySelector("#wlShareX").href = "https://x.com/intent/tweet?text=" + txt + "&url=" + encodeURIComponent(SITE + "/waitlist");
  }

  function onSubmit(e) {
    e.preventDefault();
    var m = document.getElementById("wlModal");
    var wallet = m.querySelector("#wlWallet").value.trim();
    var email = m.querySelector("#wlEmail").value.trim() || null;
    if (!wallet) return setMsg("Wallet required for the airdrop.", "err");
    if (!SOL_RE.test(wallet) && !ETH_RE.test(wallet)) return setMsg("Use a Solana (base58) or 0x… ETH address.", "err");
    if (email && !EMAIL_RE.test(email)) return setMsg("That email looks off.", "err");
    var btn = m.querySelector("#wlSubmit");
    var orig = btn.textContent;
    btn.disabled = true; btn.textContent = "Claiming…"; setMsg("Submitting…", "");
    var referredBy = new URLSearchParams(location.search).get("ref") || null;
    fetch("/api/waitlist/join", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wallet: wallet, email: email, referredBy: referredBy }),
    }).then(function (r) {
      return r.json().then(function (d) { if (!r.ok) throw new Error(d && d.detail || ("HTTP " + r.status)); return d; });
    }).then(function (d) {
      showSuccess(d.position, d.already_joined);
    }).catch(function (err) {
      btn.disabled = false; btn.textContent = orig;
      setMsg(String(err && err.message || err), "err");
    });
  }

  function build() {
    if (built) return;
    built = true;
    var style = document.createElement("style");
    style.id = "wl-modal-css";
    style.textContent = css();
    document.head.appendChild(style);

    var m = document.createElement("div");
    m.id = "wlModal";
    m.setAttribute("aria-hidden", "true");
    m.innerHTML =
      '<div class="wl-bd" data-wl-close></div>' +
      '<div class="wl-card" role="dialog" aria-modal="true" aria-labelledby="wlTitle">' +
        '<button class="wl-x" type="button" aria-label="Close" data-wl-close>×</button>' +
        '<span class="wl-lock">🔒 Token locked · Launch TBA</span>' +
        '<h2 id="wlTitle">Join the <span>Waitlist</span></h2>' +
        '<p class="wl-sub">Lock your spot for the $EDGE launch — get the alert the second it drops, plus <b>Day-Zero allocation</b> for early ops.</p>' +
        '<div class="wl-count"><span class="wl-dot"></span><b id="wlCount">—</b> operators already in</div>' +
        '<form id="wlForm" novalidate>' +
          '<label class="wl-label" for="wlWallet">Solana / ETH wallet · for airdrop</label>' +
          '<div class="wl-row">' +
            '<input id="wlWallet" class="wl-input" type="text" placeholder="paste wallet or 0x… ETH" spellcheck="false" autocapitalize="off" autocorrect="off" required>' +
            '<button type="button" class="wl-connect" id="wlConnect">Connect</button>' +
          '</div>' +
          '<label class="wl-label" for="wlEmail">Email · optional, launch alert only</label>' +
          '<input id="wlEmail" class="wl-input" type="email" placeholder="op@edge.example" spellcheck="false">' +
          '<button type="submit" class="wl-submit" id="wlSubmit">Claim my spot</button>' +
          '<div class="wl-msg" id="wlMsg"></div>' +
        '</form>' +
        '<div class="wl-success" id="wlSuccess" hidden>' +
          '<div class="wl-badge">✓ You’re in</div>' +
          '<div class="wl-pos" id="wlPos">—</div>' +
          '<div class="wl-possub">on the $EDGE waitlist · Day-Zero candidate</div>' +
          '<div class="wl-actions">' +
            '<a class="wl-share" id="wlShareX" target="_blank" rel="noopener">Share on X →</a>' +
            '<a class="wl-more" href="/waitlist">Open full waitlist + prediction game →</a>' +
          '</div>' +
        '</div>' +
        '<a class="wl-foot" href="/waitlist">Prefer the full page? Open it →</a>' +
      '</div>';
    document.body.appendChild(m);

    m.addEventListener("click", function (e) {
      if (e.target.closest("[data-wl-close]")) { e.preventDefault(); close(); }
    });
    var connect = m.querySelector("#wlConnect");
    connect.addEventListener("click", function () {
      if (!window.solana || !window.solana.isPhantom) { setMsg("No Phantom detected — paste your wallet instead.", "err"); return; }
      window.solana.connect().then(function (resp) {
        var pk = resp && resp.publicKey && resp.publicKey.toString && resp.publicKey.toString();
        if (pk) { m.querySelector("#wlWallet").value = pk; setMsg("Connected ✓", "ok"); }
      }).catch(function () { setMsg("Connection cancelled.", "err"); });
    });
    m.querySelector("#wlForm").addEventListener("submit", onSubmit);
  }

  function open() {
    build();
    var m = document.getElementById("wlModal");
    document.documentElement.classList.remove("elite-drawer-open"); // close mobile drawer if open
    m.classList.add("wl-open");
    m.setAttribute("aria-hidden", "false");
    document.documentElement.classList.add("wl-lock-scroll");
    document.body.classList.add("wl-lock-scroll");
    loadCount();
    // focus the wallet field only while the form is showing (not the success state)
    setTimeout(function () { var w = m.querySelector("#wlWallet"); if (w && m.querySelector("#wlSuccess").hidden) w.focus(); }, 60);
  }

  function close() {
    var m = document.getElementById("wlModal");
    if (!m) return;
    m.classList.remove("wl-open");
    m.setAttribute("aria-hidden", "true");
    document.documentElement.classList.remove("wl-lock-scroll");
    document.body.classList.remove("wl-lock-scroll");
    if (lastTrigger && lastTrigger.focus) { try { lastTrigger.focus(); } catch (_) {} }
  }

  // Intercept any click on a /waitlist link → open the overlay instead of
  // navigating. Capture phase so we beat the drawer's own link handler.
  document.addEventListener("click", function (e) {
    var a = e.target && e.target.closest ? e.target.closest("a") : null;
    if (!a || a.closest("#wlModal")) return;            // let in-modal links navigate
    var href = a.getAttribute("href") || "";
    if (!/^\/waitlist(\.html)?(\?|#|$)/.test(href)) return;
    if (/^\/waitlist(\.html)?\/?$/.test(location.pathname)) return; // already on the full page
    e.preventDefault();
    lastTrigger = a;
    open();
  }, true);

  // Escape closes
  document.addEventListener("keydown", function (e) {
    var m = document.getElementById("wlModal");
    if (e.key === "Escape" && m && m.classList.contains("wl-open")) close();
  });
})();
