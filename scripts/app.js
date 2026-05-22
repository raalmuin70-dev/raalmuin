(() => {
  "use strict";

  /*
   * CONFIG
   * Ubah bagian ini kalau endpoint Google Apps Script, nama sekolah,
   * atau asset loader berubah.
   */
  const GOOGLE_CONTENT_ENDPOINT = "https://script.google.com/macros/s/AKfycbxKOFU-1ON69QSVfocnuIeZnbucn3wng0VQqtggP7c1EMxzThkSjSBbCWcm4q8O6KE4Ew/exec";
  const SCHOOL_NAME = "Raudhatul Athfal Al Mu'in";
  const LOADER_LOGO = "assets/loading_logo.webp";

  /*
   * FALLBACK DATA
   * Data ini muncul kalau Google Apps Script gagal dibaca atau website
   * sedang dibuka langsung lewat file lokal.
   */
  const fallbackGallery = [
    {
      title: "Kegiatan belajar bersama guru",
      label: "Foto utama",
      image: "",
      featured: true
    },
    {
      title: "Sentra Qur'an",
      label: "Foto 1",
      image: ""
    },
    {
      title: "Bermain kreatif",
      label: "Foto 2",
      image: ""
    },
    {
      title: "Kegiatan outdoor",
      label: "Foto 3",
      image: ""
    }
  ];

  const fallbackAchievements = [
    {
      title: "Juara 1 Lomba Mewarnai Kecamatan",
      student: "Aisyah Putri",
      date: "12 Mei 2026",
      category: "Seni",
      description: "Aisyah meraih juara 1 setelah menampilkan karya bertema masjid dan lingkungan bersih.",
      image: ""
    },
    {
      title: "Finalis Hafalan Surat Pendek",
      student: "Muhammad Rayyan",
      date: "28 April 2026",
      category: "Tahfidz",
      description: "Rayyan masuk final lomba hafalan surat pendek tingkat TK se-kecamatan.",
      image: ""
    },
    {
      title: "Penghargaan Anak Mandiri Pekan Ini",
      student: "Nabila Khairunnisa",
      date: "19 April 2026",
      category: "Adab",
      description: "Nabila mendapat apresiasi karena konsisten membantu teman dan merapikan alat belajar.",
      image: ""
    }
  ];

  /*
   * DOM CACHE
   * Semua selector dikumpulkan di satu tempat supaya gampang dicari
   * kalau class/id di HTML berubah.
   */
  const dom = {
    form: document.querySelector("#registration-form"),
    header: document.querySelector(".site-header"),
    menuToggle: document.querySelector(".menu-toggle"),
    navLinks: document.querySelectorAll("[data-nav-link]"),
    sections: document.querySelectorAll("#program, #guru, #kegiatan, #galeri, #prestasi, #jadwal, #pendaftaran"),
    backToTop: document.querySelector(".back-to-top"),
    formStatus: document.querySelector(".form-status"),
    counters: document.querySelectorAll("[data-count]"),
    achievementList: document.querySelector("#achievement-list"),
    galleryList: document.querySelector("#gallery-list"),
    pageLoader: document.querySelector("#page-loader")
  };

  /*
   * HELPERS
   * Fungsi kecil yang dipakai berulang untuk format teks, urutan data,
   * keamanan HTML, dan konversi link Google Drive.
   */
  const wait = (duration) => new Promise((resolve) => window.setTimeout(resolve, duration));
  const getNewestFirst = (items, limit) => items.slice(-limit).reverse();

  const escapeHtml = (value) => String(value || "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  }[char]));

  const toPascalCase = (value) => String(value || "")
    .trim()
    .toLocaleLowerCase("id-ID")
    .replace(/(^|\s|-)(\p{L})/gu, (match, separator, letter) => `${separator}${letter.toLocaleUpperCase("id-ID")}`);

  const toLowerCaseText = (value) => String(value || "")
    .trim()
    .toLocaleLowerCase("id-ID");

  const getDriveImageUrl = (url) => {
    if (!url) return "";
    const match = url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=)([^/?&]+)/);
    return match ? `https://drive.google.com/thumbnail?id=${match[1]}&sz=w1200` : url;
  };

  /*
   * REVEAL ANIMATION
   * Elemen dengan class .reveal-item akan muncul saat masuk viewport.
   */
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      revealObserver.unobserve(entry.target);
    });
  }, { threshold: 0.16 });

  const observeRevealItems = (root = document) => {
    root.querySelectorAll(".reveal-item").forEach((item) => revealObserver.observe(item));
  };

  const renderContentState = (target, title, message, variant = "empty") => {
    const markerMarkup = variant === "loading"
      ? `<span class="section-loader-mark" aria-hidden="true"><img src="${LOADER_LOGO}" alt="" width="1043" height="1043" loading="lazy" decoding="async"></span>`
      : `<span aria-hidden="true"></span>`;

    target.innerHTML = `
      <div class="content-state content-state-${variant} reveal-item">
        ${markerMarkup}
        <strong>${escapeHtml(title)}</strong>
        <p>${escapeHtml(message)}</p>
      </div>
    `;

    observeRevealItems(target);
  };

  /*
   * IMAGE FALLBACK
   * Kalau foto dari Drive gagal tampil, gambar diganti placeholder teks
   * agar ukuran card tetap rapi.
   */
  const createImageMarkup = (imageUrl, altText, fallbackText) => {
    if (!imageUrl) return `<span>${escapeHtml(fallbackText)}</span>`;

    return `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(altText)}" loading="lazy" decoding="async" data-fallback="${escapeHtml(fallbackText)}">`;
  };

  const bindImageFallbacks = (target) => {
    target.querySelectorAll("img[data-fallback]").forEach((image) => {
      image.addEventListener("error", () => {
        const fallback = document.createElement("span");
        fallback.textContent = image.dataset.fallback || "Foto";
        fallback.className = "image-fallback";
        image.replaceWith(fallback);
      }, { once: true });
    });
  };

  /*
   * PRESTASI RENDERER
   * Menampilkan maksimal 3 prestasi terbaru. Title, murid, tanggal,
   * dan kategori dipaksa Pascal Case agar input guru tetap rapi.
   */
  const renderAchievements = (items, options = {}) => {
    const normalizedItems = items.length ? items : (options.useFallback ? fallbackAchievements : []);

    if (!normalizedItems.length) {
      renderContentState(dom.achievementList, "Belum Ada Prestasi", "Berita prestasi akan tampil setelah guru mengisi Form Prestasi.");
      return;
    }

    const visibleItems = getNewestFirst(normalizedItems, 3);

    dom.achievementList.innerHTML = visibleItems.map((item, index) => {
      const imageUrl = getDriveImageUrl(item.image || "");
      const titleText = toPascalCase(item.title);
      const studentText = toPascalCase(item.student);
      const dateText = toPascalCase(item.date);
      const categoryText = toPascalCase(item.category);
      const imageMarkup = createImageMarkup(imageUrl, `Foto prestasi ${studentText}`, categoryText);

      return `
        <article class="achievement-card reveal-item" style="--delay: ${index * 80}ms">
          <div class="achievement-media">${imageMarkup}</div>
          <div class="achievement-content">
            <div class="achievement-meta">
              <span>${escapeHtml(categoryText)}</span>
              <time>${escapeHtml(dateText)}</time>
            </div>
            <h3>${escapeHtml(titleText)}</h3>
            <strong>${escapeHtml(studentText)}</strong>
            <p>${escapeHtml(item.description)}</p>
          </div>
        </article>
      `;
    }).join("");

    bindImageFallbacks(dom.achievementList);
    observeRevealItems(dom.achievementList);
  };

  /*
   * GALERI RENDERER
   * Foto utama diambil dari item terbaru dengan featured=true.
   * Foto kecil mengambil 3 input terbaru yang bukan featured.
   */
  const renderGallery = (items, options = {}) => {
    const usingFallback = !items.length && options.useFallback;
    const normalizedItems = items.length ? items : (usingFallback ? fallbackGallery : []);

    if (!normalizedItems.length) {
      renderContentState(dom.galleryList, "Belum Ada Galeri", "Foto kegiatan akan tampil setelah guru mengisi Form Galeri.");
      return;
    }

    const featuredItems = normalizedItems.filter((item) => item.featured);
    const featuredItem = featuredItems.at(-1) || normalizedItems[0] || fallbackGallery[0];
    const smallCandidates = normalizedItems.filter((item) => item !== featuredItem && !item.featured);
    const smallItems = usingFallback ? smallCandidates.slice(0, 3) : getNewestFirst(smallCandidates, 3);

    const createPhotoCard = (item, index, isFeatured = false) => {
      const imageUrl = getDriveImageUrl(item.image || "");
      const titleText = toPascalCase(item.title);
      const labelText = toLowerCaseText(item.label || (isFeatured ? "Foto utama" : `Foto ${index + 1}`));
      const imageMarkup = createImageMarkup(imageUrl, titleText, labelText);

      return `
        <figure class="photo-card ${isFeatured ? "photo-card-large" : ""} reveal-item" style="--delay: ${index * 80}ms">
          <div class="photo-frame ${isFeatured ? "" : "small"}">${imageMarkup}</div>
          <figcaption>
            <span class="photo-label">${escapeHtml(labelText)}</span>
            <strong>${escapeHtml(titleText)}</strong>
          </figcaption>
        </figure>
      `;
    };

    dom.galleryList.innerHTML = `
      ${createPhotoCard(featuredItem, 0, true)}
      <div class="photo-grid">
        ${smallItems.map((item, index) => createPhotoCard(item, index + 1)).join("")}
      </div>
    `;

    bindImageFallbacks(dom.galleryList);
    observeRevealItems(dom.galleryList);
  };

  /*
   * CONTENT LOADER
   * Data Google Form dibaca lewat Apps Script. Kalau gagal, website
   * tetap menampilkan fallback lokal supaya section tidak kosong.
   */
  const loadRemoteContent = async () => {
    renderContentState(dom.galleryList, SCHOOL_NAME, "memuat foto dari galeri.....", "loading");
    renderContentState(dom.achievementList, SCHOOL_NAME, "memuat data dan foto prestasi.....", "loading");

    if (GOOGLE_CONTENT_ENDPOINT) {
      try {
        const [response] = await Promise.all([
          fetch(GOOGLE_CONTENT_ENDPOINT),
          wait(450)
        ]);

        if (!response.ok) throw new Error("Google content endpoint gagal dimuat");

        const data = await response.json();
        renderGallery(data.gallery || []);
        renderAchievements(data.achievements || []);
        return;
      } catch {
        renderGallery([], { useFallback: true });
        renderAchievements([], { useFallback: true });
        return;
      }
    }

    if (location.protocol === "file:") {
      renderGallery([], { useFallback: true });
      renderAchievements([], { useFallback: true });
      return;
    }

    try {
      const [galleryResponse, achievementResponse] = await Promise.all([
        fetch("data/gallery.json"),
        fetch("data/achievements.json"),
        wait(450)
      ]);

      if (!galleryResponse.ok || !achievementResponse.ok) {
        throw new Error("Data konten belum tersedia");
      }

      renderGallery(await galleryResponse.json());
      renderAchievements(await achievementResponse.json());
    } catch {
      renderGallery([], { useFallback: true });
      renderAchievements([], { useFallback: true });
    }
  };

  const waitForPageLoad = () => {
    if (document.readyState === "complete") return Promise.resolve();
    return new Promise((resolve) => window.addEventListener("load", resolve, { once: true }));
  };

  /*
   * PAGE LOADER
   * Loading layar awal ditahan minimal 750ms supaya transisinya terasa.
   */
  const hidePageLoader = () => {
    Promise.all([waitForPageLoad(), wait(750)]).then(() => {
      document.body.classList.remove("is-loading");
      dom.pageLoader.classList.add("is-hidden");
    });
  };

  /*
   * NAVIGATION
   * Mengatur menu mobile, active state navbar, dan tombol kembali ke atas.
   */
  const updateActiveNav = () => {
    let currentSection = "";

    dom.sections.forEach((section) => {
      if (section.getBoundingClientRect().top <= 170) currentSection = section.id;
    });

    dom.navLinks.forEach((link) => {
      const isActive = link.getAttribute("href") === `#${currentSection}`;
      link.classList.toggle("is-active", isActive);
      if (isActive) {
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
      }
    });
  };

  const initNavigation = () => {
    dom.menuToggle.addEventListener("click", () => {
      const isOpen = dom.header.classList.toggle("is-menu-open");
      dom.menuToggle.setAttribute("aria-expanded", String(isOpen));
      dom.menuToggle.setAttribute("aria-label", isOpen ? "Tutup menu" : "Buka menu");
    });

    dom.navLinks.forEach((link) => {
      link.addEventListener("click", () => {
        dom.header.classList.remove("is-menu-open");
        dom.menuToggle.setAttribute("aria-expanded", "false");
        dom.menuToggle.setAttribute("aria-label", "Buka menu");
      });
    });

    window.addEventListener("scroll", () => {
      dom.backToTop.classList.toggle("is-visible", window.scrollY > 520);
      updateActiveNav();
    }, { passive: true });

    dom.backToTop.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

    updateActiveNav();
  };

  /*
   * HERO COUNTERS
   * Angka di hero dianimasikan sekali saat masuk viewport.
   */
  const initCounters = () => {
    const countObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting || entry.target.dataset.done) return;
        entry.target.dataset.done = "true";

        const target = Number(entry.target.dataset.count);
        const suffix = entry.target.dataset.suffix || "";
        const duration = 900;
        const start = performance.now();

        const tick = (now) => {
          const progress = Math.min((now - start) / duration, 1);
          const eased = 1 - Math.pow(1 - progress, 3);
          entry.target.textContent = `${Math.round(target * eased)}${suffix}`;
          if (progress < 1) requestAnimationFrame(tick);
        };

        requestAnimationFrame(tick);
        countObserver.unobserve(entry.target);
      });
    }, { threshold: 0.6 });

    dom.counters.forEach((counter) => countObserver.observe(counter));
  };

  /*
   * REGISTRATION FORM
   * Form pendaftaran hanya membuat pesan WhatsApp, tidak menyimpan data.
   */
  const initRegistrationForm = () => {
    dom.form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!dom.form.reportValidity()) return;

      const data = new FormData(dom.form);
      const nama = String(data.get("nama")).trim();
      const whatsapp = String(data.get("whatsapp")).trim();
      const usia = data.get("usia");
      const message = [
        "Assalamu'alaikum, saya ingin daftar kunjungan TK Raudhatul Athfal Al Mu'in.",
        `Nama orang tua: ${nama}`,
        `Nomor WhatsApp: ${whatsapp}`,
        `Usia anak: ${usia}`
      ].join("\n");

      dom.formStatus.textContent = "Membuka WhatsApp dengan pesan pendaftaran...";
      window.open(`https://wa.me/6287868181033?text=${encodeURIComponent(message)}`, "_blank");
    });
  };

  /*
   * APP START
   * Urutan inisialisasi utama website.
   */
  const initApp = () => {
    hidePageLoader();
    observeRevealItems();
    window.setTimeout(() => document.querySelectorAll(".reveal-item").forEach((item) => item.classList.add("is-visible")), 700);
    initNavigation();
    initCounters();
    initRegistrationForm();
    loadRemoteContent();
  };

  initApp();
})();
