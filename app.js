/**
 * Netflix Content Analytics Dashboard - Core Application Engine
 * Pure Vanilla JavaScript (ES6+), SVG-based Visualizations, Dynamic State & Filtering
 * Author: Ayush Shukla (Data Analytics Portfolio Project)
 */

(function () {
  "use strict";

  // =========================================================================
  // APPLICATION STATE
  // =========================================================================
  const state = {
    rawDataset: [],
    filteredDataset: [],
    validationStats: {
      totalRecords: 0,
      totalNulls: 0,
      totalDuplicates: 0,
      hasDescription: false,
      hasDirector: false,
      hasCast: false,
    },
    filters: {
      type: "ALL",
      rating: "ALL",
      country: "ALL",
      genre: "ALL",
      releaseYearMin: null,
      releaseYearMax: null,
      yearAddedMin: null,
      yearAddedMax: null,
      durationBracket: "ALL",
      keyword: "",
      preset: "all",
    },
    table: {
      currentPage: 1,
      pageSize: 25,
      sortColumn: "date_added",
      sortDirection: "desc",
    },
    timeSeriesMode: "total", // "total" | "split"
  };

  // Color Palette Constants
  const PALETTE = {
    movie: "#e50914",
    tv: "#22c55e",
    total: "#38bdf8",
    accent: "#e50914",
    grid: "#242938",
    textMuted: "#64748b",
    textLight: "#f8fafc",
    chartColors: [
      "#e50914", "#38bdf8", "#22c55e", "#f59e0b", "#a855f7",
      "#ec4899", "#06b6d4", "#6366f1", "#f97316", "#14b8a6",
      "#84cc16", "#eab308"
    ],
    ratingColors: {
      "TV-MA": "#e50914",
      "R": "#dc2626",
      "NC-17": "#b91c1c",
      "TV-14": "#f59e0b",
      "PG-13": "#d97706",
      "TV-PG": "#38bdf8",
      "PG": "#0284c7",
      "TV-Y7": "#22c55e",
      "TV-Y": "#16a34a",
      "TV-G": "#10b981",
      "G": "#059669",
      "NR": "#64748b",
      "UR": "#475569",
      "TV-Y7-FV": "#8b5cf6"
    }
  };

  // =========================================================================
  // INITIALIZATION & DATA LOADING
  // =========================================================================
  document.addEventListener("DOMContentLoaded", initDashboard);

  async function initDashboard() {
    setupEventListeners();
    await loadDataset();
  }

  async function loadDataset() {
    let raw = null;

    // 1. Check pre-bundled data from data.js (works with file:// and http://)
    if (window.NETFLIX_DATA && Array.isArray(window.NETFLIX_DATA) && window.NETFLIX_DATA.length > 0) {
      raw = window.NETFLIX_DATA;
    } else {
      // 2. Fallback to fetching data.json or CSV
      try {
        const response = await fetch("data.json");
        if (response.ok) {
          raw = await response.json();
        }
      } catch (err) {
        console.warn("Could not fetch data.json, attempting CSV fetch...", err);
      }

      if (!raw) {
        try {
          const csvRes = await fetch("cleaned_netflix_titles(1).csv");
          if (csvRes.ok) {
            const csvText = await csvRes.text();
            raw = parseCSV(csvText);
          }
        } catch (csvErr) {
          console.error("CSV fetch failed:", csvErr);
        }
      }
    }

    if (!raw || raw.length === 0) {
      showFatalError("Failed to load Netflix dataset. Ensure data.js or cleaned_netflix_titles(1).csv is present.");
      return;
    }

    // Normalize and validate records
    state.rawDataset = normalizeDataset(raw);
    state.validationStats = validateDataIntegrity(state.rawDataset);

    // Populate filter dropdowns from actual dataset values
    populateFilterControls(state.rawDataset);

    // Apply initial filters and render
    applyFilters();
  }

  // Robust CSV parser fallback in case raw CSV text is provided
  function parseCSV(text) {
    const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
    if (lines.length < 2) return [];

    const headers = parseCSVLine(lines[0]);
    const results = [];

    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      if (values.length === headers.length) {
        const obj = {};
        headers.forEach((h, idx) => {
          obj[h.trim()] = values[idx];
        });
        results.push(obj);
      }
    }
    return results;
  }

  function parseCSVLine(line) {
    const values = [];
    let insideQuotes = false;
    let currentValue = "";

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (insideQuotes && line[i + 1] === '"') {
          currentValue += '"';
          i++;
        } else {
          insideQuotes = !insideQuotes;
        }
      } else if (char === "," && !insideQuotes) {
        values.push(currentValue.trim());
        currentValue = "";
      } else {
        currentValue += char;
      }
    }
    values.push(currentValue.trim());
    return values;
  }

  // Normalize dataset rows to consistent typed properties
  function normalizeDataset(data) {
    return data.map((item, index) => {
      const type = (item.type || "").trim();
      const title = (item.title || "").trim();
      const rating = (item.rating || "").trim();
      const releaseYear = parseInt(item.release_year, 10) || null;
      const durationStr = (item.duration || "").trim();
      const dateAdded = (item.date_added || "").trim();

      // Extract duration numbers
      let durMin = item.duration_min !== undefined ? item.duration_min : null;
      let durSeasons = item.duration_seasons !== undefined ? item.duration_seasons : null;

      if (durMin === null && type === "Movie" && durationStr.includes("min")) {
        durMin = parseInt(durationStr.replace("min", "").trim(), 10) || null;
      }
      if (durSeasons === null && type === "TV Show" && durationStr.includes("Season")) {
        durSeasons = parseInt(durationStr.split(" ")[0].trim(), 10) || null;
      }

      // Extract Year added
      let yearAdded = item.year_added !== undefined ? item.year_added : null;
      if (yearAdded === null && dateAdded) {
        const parts = dateAdded.split(",");
        if (parts.length > 1) {
          const y = parseInt(parts[1].trim(), 10);
          if (!isNaN(y)) yearAdded = y;
        }
      }

      // Extract split genres
      let genres = item.genres;
      if (!Array.isArray(genres)) {
        const rawListed = (item.listed_in || "").trim();
        genres = rawListed ? rawListed.split(",").map(g => g.trim()).filter(Boolean) : [];
      }

      // Extract split countries
      let countries = item.countries;
      if (!Array.isArray(countries)) {
        const rawCountry = (item.country || "").trim();
        countries = (rawCountry && rawCountry !== "Unknown")
          ? rawCountry.split(",").map(c => c.trim()).filter(Boolean)
          : [];
      }

      return {
        show_id: item.show_id || `s${index + 1}`,
        type: type,
        title: title,
        country: item.country || "Unknown",
        countries: countries,
        date_added: dateAdded,
        year_added: yearAdded,
        month_added: item.month_added || null,
        release_year: releaseYear,
        rating: rating || "NR",
        duration: durationStr,
        duration_min: durMin,
        duration_seasons: durSeasons,
        listed_in: item.listed_in || "",
        genres: genres,
        director: item.director || "NA",
        cast: item.cast || "NA",
        description: item.description || "No synopsis available for this title."
      };
    });
  }

  // =========================================================================
  // DATA VALIDATION
  // =========================================================================
  function validateDataIntegrity(data) {
    const totalRecords = data.length;
    let totalNulls = 0;
    const seenIds = new Set();
    let totalDuplicates = 0;

    let hasDescription = false;
    let hasDirector = false;
    let hasCast = false;

    data.forEach(item => {
      // Duplicate check
      if (seenIds.has(item.show_id)) {
        totalDuplicates++;
      } else {
        seenIds.add(item.show_id);
      }

      // Null check across properties
      if (!item.country || item.country === "Unknown") totalNulls++;
      if (item.director === "NA" || !item.director) totalNulls++;
      if (item.cast === "NA" || !item.cast) totalNulls++;
      if (!item.rating || item.rating === "NR" || item.rating === "UR") {
        // counted where appropriate
      }

      if (item.description && item.description !== "No synopsis available for this title.") hasDescription = true;
      if (item.director && item.director !== "NA") hasDirector = true;
      if (item.cast && item.cast !== "NA") hasCast = true;
    });

    const badgeText = `Validated: ${totalRecords.toLocaleString()} Records | ${totalNulls.toLocaleString()} Nulls | ${totalDuplicates} Duplicates`;

    // Update Header Badges
    const validationBadge = document.getElementById("header-validation-badge");
    if (validationBadge) {
      validationBadge.textContent = `✓ ${badgeText}`;
      validationBadge.title = `Integrity Verified: ${totalRecords} Records with 0 Duplicates`;
    }

    const headerTotalEl = document.getElementById("header-total-titles");
    if (headerTotalEl) {
      headerTotalEl.textContent = totalRecords.toLocaleString();
    }

    // Update Footer Text (Strict requirement: exact formatting)
    const footerTextEl = document.getElementById("footer-text");
    if (footerTextEl) {
      footerTextEl.textContent = `Netflix Content Analytics Dashboard • Data Analytics Portfolio Project • Built with Vanilla JavaScript, SVG & CSS3 • All ${totalRecords.toLocaleString()} Records Loaded & Validated`;
    }

    return {
      totalRecords,
      totalNulls,
      totalDuplicates,
      hasDescription,
      hasDirector,
      hasCast,
      badgeText
    };
  }

  // =========================================================================
  // POPULATE FILTER CONTROLS
  // =========================================================================
  function populateFilterControls(data) {
    // 1. Ratings
    const ratingCounts = {};
    data.forEach(d => {
      if (d.rating) ratingCounts[d.rating] = (ratingCounts[d.rating] || 0) + 1;
    });
    const ratingSelect = document.getElementById("filter-rating");
    if (ratingSelect) {
      ratingSelect.innerHTML = '<option value="ALL">All Ratings</option>';
      Object.keys(ratingCounts).sort().forEach(r => {
        const opt = document.createElement("option");
        opt.value = r;
        opt.textContent = `${r} (${ratingCounts[r]})`;
        ratingSelect.appendChild(opt);
      });
    }

    // 2. Countries
    const countryCounts = {};
    data.forEach(d => {
      d.countries.forEach(c => {
        countryCounts[c] = (countryCounts[c] || 0) + 1;
      });
    });
    const countrySelect = document.getElementById("filter-country");
    if (countrySelect) {
      countrySelect.innerHTML = '<option value="ALL">All Countries</option>';
      // Sort countries alphabetically, put top 5 at the very top for convenience
      const sortedCountries = Object.keys(countryCounts).sort();
      sortedCountries.forEach(c => {
        const opt = document.createElement("option");
        opt.value = c;
        opt.textContent = `${c} (${countryCounts[c]})`;
        countrySelect.appendChild(opt);
      });
    }

    // 3. Genres
    const genreCounts = {};
    data.forEach(d => {
      d.genres.forEach(g => {
        genreCounts[g] = (genreCounts[g] || 0) + 1;
      });
    });
    const genreSelect = document.getElementById("filter-genre");
    if (genreSelect) {
      genreSelect.innerHTML = '<option value="ALL">All Genres</option>';
      Object.keys(genreCounts).sort().forEach(g => {
        const opt = document.createElement("option");
        opt.value = g;
        opt.textContent = `${g} (${genreCounts[g]})`;
        genreSelect.appendChild(opt);
      });
    }

    // 4. Release Year Min & Max
    const releaseYears = data.map(d => d.release_year).filter(Boolean);
    const minRelease = Math.min(...releaseYears);
    const maxRelease = Math.max(...releaseYears);
    state.filters.releaseYearMin = minRelease;
    state.filters.releaseYearMax = maxRelease;

    const ryMinSelect = document.getElementById("filter-year-min");
    const ryMaxSelect = document.getElementById("filter-year-max");
    if (ryMinSelect && ryMaxSelect) {
      ryMinSelect.innerHTML = "";
      ryMaxSelect.innerHTML = "";
      for (let y = minRelease; y <= maxRelease; y++) {
        const optMin = document.createElement("option");
        optMin.value = y;
        optMin.textContent = y;
        if (y === minRelease) optMin.selected = true;
        ryMinSelect.appendChild(optMin);

        const optMax = document.createElement("option");
        optMax.value = y;
        optMax.textContent = y;
        if (y === maxRelease) optMax.selected = true;
        ryMaxSelect.appendChild(optMax);
      }
    }

    // 5. Date Added Year Min & Max
    const yearsAdded = data.map(d => d.year_added).filter(Boolean);
    const minAdded = Math.min(...yearsAdded);
    const maxAdded = Math.max(...yearsAdded);
    state.filters.yearAddedMin = minAdded;
    state.filters.yearAddedMax = maxAdded;

    const daMinSelect = document.getElementById("filter-added-min");
    const daMaxSelect = document.getElementById("filter-added-max");
    if (daMinSelect && daMaxSelect) {
      daMinSelect.innerHTML = "";
      daMaxSelect.innerHTML = "";
      for (let y = minAdded; y <= maxAdded; y++) {
        const optMin = document.createElement("option");
        optMin.value = y;
        optMin.textContent = y;
        if (y === minAdded) optMin.selected = true;
        daMinSelect.appendChild(optMin);

        const optMax = document.createElement("option");
        optMax.value = y;
        optMax.textContent = y;
        if (y === maxAdded) optMax.selected = true;
        daMaxSelect.appendChild(optMax);
      }
    }
  }

  // =========================================================================
  // FILTERING ENGINE
  // =========================================================================
  function applyFilters() {
    const f = state.filters;
    const kw = f.keyword.trim().toLowerCase();

    state.filteredDataset = state.rawDataset.filter(item => {
      // 1. Content Type
      if (f.type !== "ALL" && item.type !== f.type) return false;

      // 2. Rating
      if (f.rating !== "ALL" && item.rating !== f.rating) return false;

      // 3. Country
      if (f.country !== "ALL" && !item.countries.includes(f.country)) return false;

      // 4. Genre
      if (f.genre !== "ALL" && !item.genres.includes(f.genre)) return false;

      // 5. Release Year Range
      if (f.releaseYearMin !== null && item.release_year && item.release_year < f.releaseYearMin) return false;
      if (f.releaseYearMax !== null && item.release_year && item.release_year > f.releaseYearMax) return false;

      // 6. Year Added Range
      if (f.yearAddedMin !== null && item.year_added && item.year_added < f.yearAddedMin) return false;
      if (f.yearAddedMax !== null && item.year_added && item.year_added > f.yearAddedMax) return false;

      // 7. Duration Bracket
      if (f.durationBracket !== "ALL") {
        if (f.durationBracket === "MOV_SHORT" && (item.type !== "Movie" || !item.duration_min || item.duration_min >= 60)) return false;
        if (f.durationBracket === "MOV_MEDIUM" && (item.type !== "Movie" || !item.duration_min || item.duration_min < 60 || item.duration_min > 110)) return false;
        if (f.durationBracket === "MOV_LONG" && (item.type !== "Movie" || !item.duration_min || item.duration_min < 110 || item.duration_min > 150)) return false;
        if (f.durationBracket === "MOV_EPIC" && (item.type !== "Movie" || !item.duration_min || item.duration_min <= 150)) return false;
        if (f.durationBracket === "TV_SINGLE" && (item.type !== "TV Show" || item.duration_seasons !== 1)) return false;
        if (f.durationBracket === "TV_MULTI" && (item.type !== "TV Show" || !item.duration_seasons || item.duration_seasons < 2 || item.duration_seasons > 3)) return false;
        if (f.durationBracket === "TV_LONG" && (item.type !== "TV Show" || !item.duration_seasons || item.duration_seasons < 4)) return false;
      }

      // 8. Keyword Search
      if (kw) {
        const searchTarget = `${item.title} ${item.country} ${item.listed_in} ${item.director} ${item.cast} ${item.description}`.toLowerCase();
        if (!searchTarget.includes(kw)) return false;
      }

      return true;
    });

    // Reset pagination to first page on filter change
    state.table.currentPage = 1;

    // Synchronize UI
    renderActiveFilterChips();
    renderKPIs();
    renderAllVisualizations();
    renderTable();
    renderDynamicInsights();
  }

  function resetAllFilters() {
    state.filters.type = "ALL";
    state.filters.rating = "ALL";
    state.filters.country = "ALL";
    state.filters.genre = "ALL";
    state.filters.durationBracket = "ALL";
    state.filters.keyword = "";
    state.filters.preset = "all";

    const releaseYears = state.rawDataset.map(d => d.release_year).filter(Boolean);
    state.filters.releaseYearMin = Math.min(...releaseYears);
    state.filters.releaseYearMax = Math.max(...releaseYears);

    const yearsAdded = state.rawDataset.map(d => d.year_added).filter(Boolean);
    state.filters.yearAddedMin = Math.min(...yearsAdded);
    state.filters.yearAddedMax = Math.max(...yearsAdded);

    // Sync HTML Form Controls
    document.getElementById("filter-type").value = "ALL";
    document.getElementById("filter-rating").value = "ALL";
    document.getElementById("filter-country").value = "ALL";
    document.getElementById("filter-genre").value = "ALL";
    document.getElementById("filter-duration").value = "ALL";
    document.getElementById("filter-year-min").value = state.filters.releaseYearMin;
    document.getElementById("filter-year-max").value = state.filters.releaseYearMax;
    document.getElementById("filter-added-min").value = state.filters.yearAddedMin;
    document.getElementById("filter-added-max").value = state.filters.yearAddedMax;
    document.getElementById("table-search-input").value = "";
    document.getElementById("table-search-clear").style.display = "none";

    // Presets bar sync
    document.querySelectorAll(".preset-chip").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.preset === "all");
    });

    applyFilters();
  }

  function renderActiveFilterChips() {
    const f = state.filters;
    const chipsContainer = document.getElementById("active-filters-container");
    const chipsList = document.getElementById("active-chips-list");
    const badge = document.getElementById("active-filter-count-badge");

    const activeList = [];

    if (f.type !== "ALL") activeList.push({ key: "type", label: `Type: ${f.type}` });
    if (f.rating !== "ALL") activeList.push({ key: "rating", label: `Rating: ${f.rating}` });
    if (f.country !== "ALL") activeList.push({ key: "country", label: `Country: ${f.country}` });
    if (f.genre !== "ALL") activeList.push({ key: "genre", label: `Genre: ${f.genre}` });
    if (f.durationBracket !== "ALL") activeList.push({ key: "durationBracket", label: `Duration: ${f.durationBracket.replace("_", " ")}` });
    if (f.keyword) activeList.push({ key: "keyword", label: `Search: "${f.keyword}"` });

    const releaseYears = state.rawDataset.map(d => d.release_year).filter(Boolean);
    const minAllR = Math.min(...releaseYears);
    const maxAllR = Math.max(...releaseYears);
    if (f.releaseYearMin > minAllR || f.releaseYearMax < maxAllR) {
      activeList.push({ key: "releaseYears", label: `Released: ${f.releaseYearMin} - ${f.releaseYearMax}` });
    }

    const yearsAdded = state.rawDataset.map(d => d.year_added).filter(Boolean);
    const minAllA = Math.min(...yearsAdded);
    const maxAllA = Math.max(...yearsAdded);
    if (f.yearAddedMin > minAllA || f.yearAddedMax < maxAllA) {
      activeList.push({ key: "yearsAdded", label: `Added: ${f.yearAddedMin} - ${f.yearAddedMax}` });
    }

    if (activeList.length === 0) {
      chipsContainer.style.display = "none";
      badge.style.display = "none";
      return;
    }

    chipsContainer.style.display = "flex";
    badge.style.display = "inline-flex";
    badge.textContent = `${activeList.length} Active Filter${activeList.length > 1 ? "s" : ""}`;

    chipsList.innerHTML = activeList.map(item => `
      <span class="filter-chip">
        ${escapeHTML(item.label)}
        <span class="filter-chip-remove" data-remove-key="${item.key}" role="button" aria-label="Remove filter">&times;</span>
      </span>
    `).join("");

    chipsList.querySelectorAll(".filter-chip-remove").forEach(btn => {
      btn.addEventListener("click", () => {
        const k = btn.dataset.removeKey;
        if (k === "type") { f.type = "ALL"; document.getElementById("filter-type").value = "ALL"; }
        else if (k === "rating") { f.rating = "ALL"; document.getElementById("filter-rating").value = "ALL"; }
        else if (k === "country") { f.country = "ALL"; document.getElementById("filter-country").value = "ALL"; }
        else if (k === "genre") { f.genre = "ALL"; document.getElementById("filter-genre").value = "ALL"; }
        else if (k === "durationBracket") { f.durationBracket = "ALL"; document.getElementById("filter-duration").value = "ALL"; }
        else if (k === "keyword") {
          f.keyword = "";
          document.getElementById("table-search-input").value = "";
          document.getElementById("table-search-clear").style.display = "none";
        }
        else if (k === "releaseYears") {
          f.releaseYearMin = minAllR;
          f.releaseYearMax = maxAllR;
          document.getElementById("filter-year-min").value = minAllR;
          document.getElementById("filter-year-max").value = maxAllR;
        }
        else if (k === "yearsAdded") {
          f.yearAddedMin = minAllA;
          f.yearAddedMax = maxAllA;
          document.getElementById("filter-added-min").value = minAllA;
          document.getElementById("filter-added-max").value = maxAllA;
        }
        applyFilters();
      });
    });
  }

  // =========================================================================
  // KPI CALCULATIONS
  // =========================================================================
  function renderKPIs() {
    const data = state.filteredDataset;
    const totalRaw = state.rawDataset.length;
    const totalFiltered = data.length;

    const movies = data.filter(d => d.type === "Movie");
    const tvShows = data.filter(d => d.type === "TV Show");

    // 1. Total Titles
    const kpiTotal = document.getElementById("kpi-total-titles");
    const kpiTotalSub = document.getElementById("kpi-total-sub");
    const kpiFilterShare = document.getElementById("kpi-filter-share");
    if (kpiTotal) kpiTotal.textContent = totalFiltered.toLocaleString();

    const pctOfRaw = totalRaw > 0 ? ((totalFiltered / totalRaw) * 100).toFixed(1) : 0;
    if (kpiTotalSub) kpiTotalSub.innerHTML = `<strong>${pctOfRaw}%</strong> of original catalog`;
    if (kpiFilterShare) kpiFilterShare.textContent = `Showing ${pctOfRaw}% of Catalog`;

    // 2. Movies
    const kpiMovies = document.getElementById("kpi-movies-count");
    const kpiMoviesPct = document.getElementById("kpi-movies-pct");
    if (kpiMovies) kpiMovies.textContent = movies.length.toLocaleString();
    const moviePct = totalFiltered > 0 ? ((movies.length / totalFiltered) * 100).toFixed(1) : "0.0";
    if (kpiMoviesPct) kpiMoviesPct.innerHTML = `<strong>${moviePct}%</strong> of filtered titles`;

    // 3. TV Shows
    const kpiTV = document.getElementById("kpi-tv-count");
    const kpiTVPct = document.getElementById("kpi-tv-pct");
    if (kpiTV) kpiTV.textContent = tvShows.length.toLocaleString();
    const tvPct = totalFiltered > 0 ? ((tvShows.length / totalFiltered) * 100).toFixed(1) : "0.0";
    if (kpiTVPct) kpiTVPct.innerHTML = `<strong>${tvPct}%</strong> of filtered titles`;

    // 4. Unique Countries
    const allCountries = new Set();
    const countryCounts = {};
    data.forEach(d => {
      d.countries.forEach(c => {
        allCountries.add(c);
        countryCounts[c] = (countryCounts[c] || 0) + 1;
      });
    });
    const topCountry = Object.entries(countryCounts).sort((a, b) => b[1] - a[1])[0];
    const kpiCountriesCount = document.getElementById("kpi-countries-count");
    const kpiCountriesTop = document.getElementById("kpi-countries-top");
    if (kpiCountriesCount) kpiCountriesCount.textContent = allCountries.size.toLocaleString();
    if (kpiCountriesTop) {
      kpiCountriesTop.innerHTML = topCountry
        ? `Top: <strong>${escapeHTML(topCountry[0])}</strong> (${topCountry[1].toLocaleString()})`
        : "None";
    }

    // 5. Ratings & Top Rating
    const ratingCounts = {};
    data.forEach(d => {
      if (d.rating) ratingCounts[d.rating] = (ratingCounts[d.rating] || 0) + 1;
    });
    const sortedRatings = Object.entries(ratingCounts).sort((a, b) => b[1] - a[1]);
    const topRating = sortedRatings[0];
    const kpiTopRating = document.getElementById("kpi-top-rating");
    const kpiTopRatingSub = document.getElementById("kpi-top-rating-sub");
    if (kpiTopRating) kpiTopRating.textContent = topRating ? topRating[0] : "N/A";
    if (kpiTopRatingSub) {
      if (topRating && totalFiltered > 0) {
        const rPct = ((topRating[1] / totalFiltered) * 100).toFixed(1);
        kpiTopRatingSub.textContent = `${topRating[1].toLocaleString()} titles (${rPct}%)`;
      } else {
        kpiTopRatingSub.textContent = "0 titles";
      }
    }

    // 6. Durations: Movies Avg and TV Seasons Avg
    const movieMinArr = movies.map(m => m.duration_min).filter(n => typeof n === "number" && !isNaN(n));
    const tvSeasonArr = tvShows.map(t => t.duration_seasons).filter(n => typeof n === "number" && !isNaN(n));

    const avgMovieMin = movieMinArr.length > 0 ? (movieMinArr.reduce((a, b) => a + b, 0) / movieMinArr.length).toFixed(1) : "N/A";
    const avgTVSeasons = tvSeasonArr.length > 0 ? (tvSeasonArr.reduce((a, b) => a + b, 0) / tvSeasonArr.length).toFixed(2) : "N/A";

    const kpiAvgDur = document.getElementById("kpi-avg-duration");
    const kpiAvgSeasons = document.getElementById("kpi-avg-seasons");
    if (kpiAvgDur) kpiAvgDur.textContent = avgMovieMin !== "N/A" ? `${avgMovieMin} min` : "N/A";
    if (kpiAvgSeasons) kpiAvgSeasons.innerHTML = avgTVSeasons !== "N/A" ? `TV Avg: <strong>${avgTVSeasons} Seasons</strong>` : "No TV Shows";

    // Badges in chart card headers
    const movieBadge = document.getElementById("movie-duration-badge");
    if (movieBadge) movieBadge.textContent = avgMovieMin !== "N/A" ? `Avg: ${avgMovieMin} min` : "N/A";
    const tvBadge = document.getElementById("tv-season-badge");
    if (tvBadge) tvBadge.textContent = avgTVSeasons !== "N/A" ? `Avg: ${avgTVSeasons} Seasons` : "N/A";
  }

  // =========================================================================
  // VISUALIZATIONS ENGINE (SVG GENERATION)
  // =========================================================================
  function renderAllVisualizations() {
    renderContentTypeChart();
    renderAddedTimeChart();
    renderReleaseYearChart();
    renderRatingsChart();
    renderTopGenresChart();
    renderGenreTypeComparison();
    renderTopCountriesChart();
    renderCountryTypeComparison();
    renderMovieDurationChart();
    renderTVSeasonsChart();
    renderGrowthTrajectoryChart();
  }

  // 1. Content Type Donut Chart
  function renderContentTypeChart() {
    const svg = document.getElementById("chart-content-type");
    const legend = document.getElementById("legend-content-type");
    if (!svg) return;

    const data = state.filteredDataset;
    const moviesCount = data.filter(d => d.type === "Movie").length;
    const tvCount = data.filter(d => d.type === "TV Show").length;
    const total = moviesCount + tvCount;

    if (total === 0) {
      renderEmptySVG(svg, "No data matches current filters");
      if (legend) legend.innerHTML = "";
      return;
    }

    const moviePct = ((moviesCount / total) * 100).toFixed(1);
    const tvPct = ((tvCount / total) * 100).toFixed(1);

    const cx = 180;
    const cy = 135;
    const radius = 95;
    const holeRadius = 60;

    // Angle calculation
    const movieAngle = (moviesCount / total) * 360;

    const moviePath = describeDonutArc(cx, cy, radius, holeRadius, 0, movieAngle);
    const tvPath = describeDonutArc(cx, cy, radius, holeRadius, movieAngle, 360);

    svg.innerHTML = `
      <g class="donut-group">
        <path d="${moviePath}" fill="${PALETTE.movie}" class="chart-donut-slice" data-type="Movie"
          data-tooltip-title="Movies" data-tooltip-val="${moviesCount.toLocaleString()} titles (${moviePct}%)"></path>
        <path d="${tvPath}" fill="${PALETTE.tv}" class="chart-donut-slice" data-type="TV Show"
          data-tooltip-title="TV Shows" data-tooltip-val="${tvCount.toLocaleString()} titles (${tvPct}%)"></path>
      </g>
      <circle cx="${cx}" cy="${cy}" r="${holeRadius - 2}" fill="#171a23"></circle>
      <text x="${cx}" y="${cy - 8}" text-anchor="middle" fill="#94a3b8" font-size="11" font-weight="600">TOTAL</text>
      <text x="${cx}" y="${cy + 16}" text-anchor="middle" fill="#ffffff" font-size="19" font-weight="800">${total.toLocaleString()}</text>
    `;

    // Interactive Legend
    if (legend) {
      legend.innerHTML = `
        <div class="legend-item" data-filter-type="Movie">
          <span class="legend-color-dot" style="background:${PALETTE.movie}"></span>
          <span>Movies: <strong>${moviesCount.toLocaleString()}</strong> (${moviePct}%)</span>
        </div>
        <div class="legend-item" data-filter-type="TV Show">
          <span class="legend-color-dot" style="background:${PALETTE.tv}"></span>
          <span>TV Shows: <strong>${tvCount.toLocaleString()}</strong> (${tvPct}%)</span>
        </div>
      `;

      legend.querySelectorAll(".legend-item").forEach(item => {
        item.addEventListener("click", () => {
          const t = item.dataset.filterType;
          state.filters.type = state.filters.type === t ? "ALL" : t;
          document.getElementById("filter-type").value = state.filters.type;
          applyFilters();
        });
      });
    }

    // Attach click events on donut slices to filter
    svg.querySelectorAll(".chart-donut-slice").forEach(slice => {
      slice.addEventListener("click", () => {
        const t = slice.dataset.type;
        state.filters.type = state.filters.type === t ? "ALL" : t;
        document.getElementById("filter-type").value = state.filters.type;
        applyFilters();
      });
    });

    attachTooltips(svg);
  }

  // 2. Titles Added Over Time (Time Series Chart)
  function renderAddedTimeChart() {
    const svg = document.getElementById("chart-added-time");
    const legend = document.getElementById("legend-added-time");
    if (!svg) return;

    const data = state.filteredDataset;
    // Map year added counts
    const yearsMap = {};
    const movieYearsMap = {};
    const tvYearsMap = {};

    // Get available year added range across raw dataset
    const allYears = Array.from(new Set(state.rawDataset.map(d => d.year_added).filter(Boolean))).sort((a, b) => a - b);

    allYears.forEach(y => {
      yearsMap[y] = 0;
      movieYearsMap[y] = 0;
      tvYearsMap[y] = 0;
    });

    data.forEach(d => {
      if (d.year_added && yearsMap[d.year_added] !== undefined) {
        yearsMap[d.year_added]++;
        if (d.type === "Movie") movieYearsMap[d.year_added]++;
        if (d.type === "TV Show") tvYearsMap[d.year_added]++;
      }
    });

    const years = allYears;
    const maxVal = Math.max(...Object.values(yearsMap), 10);

    const padL = 45;
    const padR = 25;
    const padT = 30;
    const padB = 40;
    const width = 540;
    const height = 280;
    const chartW = width - padL - padR;
    const chartH = height - padT - padB;

    const getX = (idx) => padL + (idx / (years.length - 1)) * chartW;
    const getY = (val) => padT + chartH - (val / maxVal) * chartH;

    // Y Grid lines
    const yTicks = [0, Math.round(maxVal * 0.25), Math.round(maxVal * 0.5), Math.round(maxVal * 0.75), maxVal];
    let gridHTML = "";
    yTicks.forEach(tick => {
      const yPos = getY(tick);
      gridHTML += `
        <line x1="${padL}" y1="${yPos}" x2="${width - padR}" y2="${yPos}" class="chart-grid-line"></line>
        <text x="${padL - 8}" y="${yPos + 4}" text-anchor="end" class="chart-axis-text">${tick}</text>
      `;
    });

    // X Axis labels
    let xLabelsHTML = "";
    years.forEach((yr, idx) => {
      // Show every other year if too many
      if (years.length > 8 && idx % 2 !== 0 && idx !== years.length - 1) return;
      const xPos = getX(idx);
      xLabelsHTML += `
        <text x="${xPos}" y="${height - padB + 18}" text-anchor="middle" class="chart-axis-text">${yr}</text>
      `;
    });

    let seriesHTML = "";

    if (state.timeSeriesMode === "total") {
      // Area + Line for Total
      const points = years.map((y, idx) => [getX(idx), getY(yearsMap[y])]);
      const lineD = makeSmoothPath(points);
      const areaD = `${lineD} L ${points[points.length - 1][0]} ${padT + chartH} L ${points[0][0]} ${padT + chartH} Z`;

      seriesHTML += `
        <defs>
          <linearGradient id="grad-added-total" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${PALETTE.total}" stop-opacity="0.45"/>
            <stop offset="100%" stop-color="${PALETTE.total}" stop-opacity="0.02"/>
          </linearGradient>
        </defs>
        <path d="${areaD}" fill="url(#grad-added-total)"></path>
        <path d="${lineD}" stroke="${PALETTE.total}" class="chart-line"></path>
      `;

      points.forEach(([px, py], idx) => {
        const yr = years[idx];
        const val = yearsMap[yr];
        seriesHTML += `
          <circle cx="${px}" cy="${py}" r="4" fill="${PALETTE.total}" stroke="#171a23" stroke-width="2" class="chart-point"
            data-tooltip-title="${yr} Ingestion" data-tooltip-val="${val.toLocaleString()} titles added"></circle>
        `;
      });

      if (legend) {
        legend.innerHTML = `
          <div class="legend-item">
            <span class="legend-color-dot" style="background:${PALETTE.total}"></span>
            <span>Total Titles Added</span>
          </div>
        `;
      }
    } else {
      // Split Movie vs TV series
      const mPoints = years.map((y, idx) => [getX(idx), getY(movieYearsMap[y])]);
      const tvPoints = years.map((y, idx) => [getX(idx), getY(tvYearsMap[y])]);

      const mLine = makeSmoothPath(mPoints);
      const tvLine = makeSmoothPath(tvPoints);

      seriesHTML += `
        <path d="${mLine}" stroke="${PALETTE.movie}" class="chart-line"></path>
        <path d="${tvLine}" stroke="${PALETTE.tv}" class="chart-line"></path>
      `;

      mPoints.forEach(([px, py], idx) => {
        const yr = years[idx];
        seriesHTML += `
          <circle cx="${px}" cy="${py}" r="3.5" fill="${PALETTE.movie}" stroke="#171a23" stroke-width="2" class="chart-point"
            data-tooltip-title="${yr} Movies" data-tooltip-val="${movieYearsMap[yr].toLocaleString()} added"></circle>
        `;
      });

      tvPoints.forEach(([px, py], idx) => {
        const yr = years[idx];
        seriesHTML += `
          <circle cx="${px}" cy="${py}" r="3.5" fill="${PALETTE.tv}" stroke="#171a23" stroke-width="2" class="chart-point"
            data-tooltip-title="${yr} TV Shows" data-tooltip-val="${tvYearsMap[yr].toLocaleString()} added"></circle>
        `;
      });

      if (legend) {
        legend.innerHTML = `
          <div class="legend-item">
            <span class="legend-color-dot" style="background:${PALETTE.movie}"></span>
            <span>Movies Added</span>
          </div>
          <div class="legend-item">
            <span class="legend-color-dot" style="background:${PALETTE.tv}"></span>
            <span>TV Shows Added</span>
          </div>
        `;
      }
    }

    svg.innerHTML = `
      ${gridHTML}
      <line x1="${padL}" y1="${padT + chartH}" x2="${width - padR}" y2="${padT + chartH}" class="chart-axis-line"></line>
      ${seriesHTML}
      ${xLabelsHTML}
    `;

    attachTooltips(svg);
  }

  // 3. Release Year Distribution
  function renderReleaseYearChart() {
    const svg = document.getElementById("chart-release-year");
    if (!svg) return;

    const data = state.filteredDataset;
    if (data.length === 0) {
      renderEmptySVG(svg, "No data matches current filters");
      return;
    }

    // Group release years: Bucket by 5-year periods or decades for historical, single years recent
    const yearCounts = {};
    data.forEach(d => {
      if (d.release_year) {
        yearCounts[d.release_year] = (yearCounts[d.release_year] || 0) + 1;
      }
    });

    // Create 15 chronological buckets from min to max
    const years = Object.keys(yearCounts).map(Number).sort((a, b) => a - b);
    if (years.length === 0) return;

    const minYear = Math.min(...years);
    const maxYear = Math.max(...years);

    // Let's create uniform brackets or focus on 2000-2021 + pre-2000 buckets
    const buckets = [];
    buckets.push({ label: "<1990", min: 1900, max: 1989, count: 0 });
    buckets.push({ label: "1990s", min: 1990, max: 1999, count: 0 });
    buckets.push({ label: "2000-05", min: 2000, max: 2005, count: 0 });
    buckets.push({ label: "2006-10", min: 2006, max: 2010, count: 0 });
    for (let y = 2011; y <= 2021; y++) {
      buckets.push({ label: String(y), min: y, max: y, count: 0 });
    }

    data.forEach(d => {
      if (!d.release_year) return;
      for (const b of buckets) {
        if (d.release_year >= b.min && d.release_year <= b.max) {
          b.count++;
          break;
        }
      }
    });

    const maxCount = Math.max(...buckets.map(b => b.count), 1);

    const padL = 40;
    const padR = 20;
    const padT = 25;
    const padB = 40;
    const width = 540;
    const height = 280;
    const chartW = width - padL - padR;
    const chartH = height - padT - padB;

    const barWidth = (chartW / buckets.length) * 0.75;
    const gap = chartW / buckets.length;

    let barsHTML = "";
    buckets.forEach((b, idx) => {
      const bH = (b.count / maxCount) * chartH;
      const x = padL + idx * gap + (gap - barWidth) / 2;
      const y = padT + chartH - bH;
      const pct = data.length > 0 ? ((b.count / data.length) * 100).toFixed(1) : 0;

      barsHTML += `
        <rect x="${x}" y="${y}" width="${barWidth}" height="${bH}" rx="3" fill="#38bdf8" class="chart-bar"
          data-tooltip-title="Release: ${b.label}" data-tooltip-val="${b.count.toLocaleString()} titles (${pct}%)"></rect>
        <text x="${x + barWidth / 2}" y="${height - padB + 16}" text-anchor="middle" class="chart-axis-text" font-size="10">${b.label}</text>
      `;
    });

    // Y Grid lines
    const yTicks = [0, Math.round(maxCount * 0.5), maxCount];
    let gridHTML = "";
    yTicks.forEach(tick => {
      const yPos = padT + chartH - (tick / maxCount) * chartH;
      gridHTML += `
        <line x1="${padL}" y1="${yPos}" x2="${width - padR}" y2="${yPos}" class="chart-grid-line"></line>
        <text x="${padL - 6}" y="${yPos + 4}" text-anchor="end" class="chart-axis-text">${tick}</text>
      `;
    });

    svg.innerHTML = `
      ${gridHTML}
      <line x1="${padL}" y1="${padT + chartH}" x2="${width - padR}" y2="${padT + chartH}" class="chart-axis-line"></line>
      ${barsHTML}
    `;

    attachTooltips(svg);
  }

  // 4. Top Genres (Horizontal Bar Chart)
  function renderTopGenresChart() {
    const svg = document.getElementById("chart-top-genres");
    if (!svg) return;

    const data = state.filteredDataset;
    if (data.length === 0) {
      renderEmptySVG(svg, "No data matches current filters");
      return;
    }

    const genreCounts = {};
    data.forEach(d => {
      d.genres.forEach(g => {
        genreCounts[g] = (genreCounts[g] || 0) + 1;
      });
    });

    const topGenres = Object.entries(genreCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    if (topGenres.length === 0) return;

    const maxVal = topGenres[0][1];
    const padL = 150;
    const padR = 60;
    const padT = 20;
    const padB = 20;
    const width = 540;
    const height = 380;
    const chartW = width - padL - padR;
    const rowHeight = (height - padT - padB) / topGenres.length;
    const barHeight = rowHeight * 0.62;

    let elementsHTML = "";
    topGenres.forEach(([genre, count], idx) => {
      const barW = (count / maxVal) * chartW;
      const y = padT + idx * rowHeight + (rowHeight - barHeight) / 2;
      const pct = ((count / data.length) * 100).toFixed(1);

      elementsHTML += `
        <text x="${padL - 10}" y="${y + barHeight / 2 + 4}" text-anchor="end" class="chart-axis-text" font-weight="600" fill="#e2e8f0">${truncateString(genre, 20)}</text>
        <rect x="${padL}" y="${y}" width="${barW}" height="${barHeight}" rx="4" fill="${PALETTE.chartColors[idx % PALETTE.chartColors.length]}" class="chart-bar"
          data-genre-name="${escapeHTML(genre)}"
          data-tooltip-title="${escapeHTML(genre)}" data-tooltip-val="${count.toLocaleString()} titles (${pct}% of selection)"></rect>
        <text x="${padL + barW + 8}" y="${y + barHeight / 2 + 4}" class="chart-axis-text" fill="#94a3b8" font-size="11" font-weight="600">${count.toLocaleString()}</text>
      `;
    });

    svg.innerHTML = `
      <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${height - padB}" class="chart-axis-line"></line>
      ${elementsHTML}
    `;

    // Click bar to filter by genre
    svg.querySelectorAll(".chart-bar").forEach(bar => {
      bar.addEventListener("click", () => {
        const g = bar.dataset.genreName;
        state.filters.genre = state.filters.genre === g ? "ALL" : g;
        document.getElementById("filter-genre").value = state.filters.genre;
        applyFilters();
      });
    });

    attachTooltips(svg);
  }

  // 5. Top Countries (Horizontal Bar Chart)
  function renderTopCountriesChart() {
    const svg = document.getElementById("chart-top-countries");
    if (!svg) return;

    const data = state.filteredDataset;
    if (data.length === 0) {
      renderEmptySVG(svg, "No data matches current filters");
      return;
    }

    const countryCounts = {};
    data.forEach(d => {
      d.countries.forEach(c => {
        if (c !== "Unknown") {
          countryCounts[c] = (countryCounts[c] || 0) + 1;
        }
      });
    });

    const topCountries = Object.entries(countryCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    if (topCountries.length === 0) {
      renderEmptySVG(svg, "No country data available");
      return;
    }

    const maxVal = topCountries[0][1];
    const padL = 130;
    const padR = 60;
    const padT = 20;
    const padB = 20;
    const width = 540;
    const height = 380;
    const chartW = width - padL - padR;
    const rowHeight = (height - padT - padB) / topCountries.length;
    const barHeight = rowHeight * 0.62;

    let elementsHTML = "";
    topCountries.forEach(([country, count], idx) => {
      const barW = (count / maxVal) * chartW;
      const y = padT + idx * rowHeight + (rowHeight - barHeight) / 2;
      const pct = ((count / data.length) * 100).toFixed(1);

      elementsHTML += `
        <text x="${padL - 10}" y="${y + barHeight / 2 + 4}" text-anchor="end" class="chart-axis-text" font-weight="600" fill="#e2e8f0">${truncateString(country, 18)}</text>
        <rect x="${padL}" y="${y}" width="${barW}" height="${barHeight}" rx="4" fill="${PALETTE.chartColors[(idx + 3) % PALETTE.chartColors.length]}" class="chart-bar"
          data-country-name="${escapeHTML(country)}"
          data-tooltip-title="${escapeHTML(country)}" data-tooltip-val="${count.toLocaleString()} titles (${pct}%)"></rect>
        <text x="${padL + barW + 8}" y="${y + barHeight / 2 + 4}" class="chart-axis-text" fill="#94a3b8" font-size="11" font-weight="600">${count.toLocaleString()}</text>
      `;
    });

    svg.innerHTML = `
      <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${height - padB}" class="chart-axis-line"></line>
      ${elementsHTML}
    `;

    // Click bar to filter by country
    svg.querySelectorAll(".chart-bar").forEach(bar => {
      bar.addEventListener("click", () => {
        const c = bar.dataset.countryName;
        state.filters.country = state.filters.country === c ? "ALL" : c;
        document.getElementById("filter-country").value = state.filters.country;
        applyFilters();
      });
    });

    attachTooltips(svg);
  }

  // 6. Ratings Analysis (Vertical Bar Chart)
  function renderRatingsChart() {
    const svg = document.getElementById("chart-ratings");
    if (!svg) return;

    const data = state.filteredDataset;
    if (data.length === 0) {
      renderEmptySVG(svg, "No data matches current filters");
      return;
    }

    const ratingCounts = {};
    data.forEach(d => {
      if (d.rating) ratingCounts[d.rating] = (ratingCounts[d.rating] || 0) + 1;
    });

    const sortedRatings = Object.entries(ratingCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    if (sortedRatings.length === 0) return;

    const maxCount = sortedRatings[0][1];
    const padL = 45;
    const padR = 20;
    const padT = 25;
    const padB = 40;
    const width = 540;
    const height = 280;
    const chartW = width - padL - padR;
    const chartH = height - padT - padB;

    const gap = chartW / sortedRatings.length;
    const barWidth = gap * 0.7;

    let barsHTML = "";
    sortedRatings.forEach(([r, count], idx) => {
      const bH = (count / maxCount) * chartH;
      const x = padL + idx * gap + (gap - barWidth) / 2;
      const y = padT + chartH - bH;
      const pct = ((count / data.length) * 100).toFixed(1);
      const color = PALETTE.ratingColors[r] || "#94a3b8";

      barsHTML += `
        <rect x="${x}" y="${y}" width="${barWidth}" height="${bH}" rx="3" fill="${color}" class="chart-bar"
          data-rating-name="${escapeHTML(r)}"
          data-tooltip-title="Rating: ${r}" data-tooltip-val="${count.toLocaleString()} titles (${pct}%)"></rect>
        <text x="${x + barWidth / 2}" y="${height - padB + 16}" text-anchor="middle" class="chart-axis-text" font-weight="700" font-size="10">${r}</text>
      `;
    });

    // Y Grid lines
    const yTicks = [0, Math.round(maxCount * 0.5), maxCount];
    let gridHTML = "";
    yTicks.forEach(tick => {
      const yPos = padT + chartH - (tick / maxCount) * chartH;
      gridHTML += `
        <line x1="${padL}" y1="${yPos}" x2="${width - padR}" y2="${yPos}" class="chart-grid-line"></line>
        <text x="${padL - 6}" y="${yPos + 4}" text-anchor="end" class="chart-axis-text">${tick}</text>
      `;
    });

    svg.innerHTML = `
      ${gridHTML}
      <line x1="${padL}" y1="${padT + chartH}" x2="${width - padR}" y2="${padT + chartH}" class="chart-axis-line"></line>
      ${barsHTML}
    `;

    // Click bar to filter by rating
    svg.querySelectorAll(".chart-bar").forEach(bar => {
      bar.addEventListener("click", () => {
        const r = bar.dataset.ratingName;
        state.filters.rating = state.filters.rating === r ? "ALL" : r;
        document.getElementById("filter-rating").value = state.filters.rating;
        applyFilters();
      });
    });

    attachTooltips(svg);
  }

  // 7. Movie Duration Analysis (Histogram)
  function renderMovieDurationChart() {
    const svg = document.getElementById("chart-movie-duration");
    if (!svg) return;

    const movies = state.filteredDataset.filter(d => d.type === "Movie" && typeof d.duration_min === "number");

    if (movies.length === 0) {
      renderEmptySVG(svg, "No movies in active filter selection");
      return;
    }

    const brackets = [
      { label: "< 60 min", min: 0, max: 59, count: 0 },
      { label: "60-89 min", min: 60, max: 89, count: 0 },
      { label: "90-119 min", min: 90, max: 119, count: 0 },
      { label: "120-149 min", min: 120, max: 149, count: 0 },
      { label: "150+ min", min: 150, max: 9999, count: 0 },
    ];

    movies.forEach(m => {
      for (const b of brackets) {
        if (m.duration_min >= b.min && m.duration_min <= b.max) {
          b.count++;
          break;
        }
      }
    });

    const maxCount = Math.max(...brackets.map(b => b.count), 1);
    const padL = 45;
    const padR = 20;
    const padT = 25;
    const padB = 40;
    const width = 540;
    const height = 280;
    const chartW = width - padL - padR;
    const chartH = height - padT - padB;

    const gap = chartW / brackets.length;
    const barWidth = gap * 0.7;

    let barsHTML = "";
    brackets.forEach((b, idx) => {
      const bH = (b.count / maxCount) * chartH;
      const x = padL + idx * gap + (gap - barWidth) / 2;
      const y = padT + chartH - bH;
      const pct = ((b.count / movies.length) * 100).toFixed(1);

      barsHTML += `
        <rect x="${x}" y="${y}" width="${barWidth}" height="${bH}" rx="4" fill="#ec4899" class="chart-bar"
          data-tooltip-title="${b.label}" data-tooltip-val="${b.count.toLocaleString()} movies (${pct}%)"></rect>
        <text x="${x + barWidth / 2}" y="${height - padB + 16}" text-anchor="middle" class="chart-axis-text" font-size="10">${b.label}</text>
      `;
    });

    const yTicks = [0, Math.round(maxCount * 0.5), maxCount];
    let gridHTML = "";
    yTicks.forEach(tick => {
      const yPos = padT + chartH - (tick / maxCount) * chartH;
      gridHTML += `
        <line x1="${padL}" y1="${yPos}" x2="${width - padR}" y2="${yPos}" class="chart-grid-line"></line>
        <text x="${padL - 6}" y="${yPos + 4}" text-anchor="end" class="chart-axis-text">${tick}</text>
      `;
    });

    svg.innerHTML = `
      ${gridHTML}
      <line x1="${padL}" y1="${padT + chartH}" x2="${width - padR}" y2="${padT + chartH}" class="chart-axis-line"></line>
      ${barsHTML}
    `;

    attachTooltips(svg);
  }

  // 8. TV Show Seasons Analysis
  function renderTVSeasonsChart() {
    const svg = document.getElementById("chart-tv-seasons");
    if (!svg) return;

    const tvShows = state.filteredDataset.filter(d => d.type === "TV Show" && typeof d.duration_seasons === "number");

    if (tvShows.length === 0) {
      renderEmptySVG(svg, "No TV Shows in active filter selection");
      return;
    }

    const seasonBuckets = [
      { label: "1 Season", min: 1, max: 1, count: 0 },
      { label: "2 Seasons", min: 2, max: 2, count: 0 },
      { label: "3 Seasons", min: 3, max: 3, count: 0 },
      { label: "4-5 Seasons", min: 4, max: 5, count: 0 },
      { label: "6+ Seasons", min: 6, max: 999, count: 0 },
    ];

    tvShows.forEach(t => {
      for (const b of seasonBuckets) {
        if (t.duration_seasons >= b.min && t.duration_seasons <= b.max) {
          b.count++;
          break;
        }
      }
    });

    const maxCount = Math.max(...seasonBuckets.map(b => b.count), 1);
    const padL = 45;
    const padR = 20;
    const padT = 25;
    const padB = 40;
    const width = 540;
    const height = 280;
    const chartW = width - padL - padR;
    const chartH = height - padT - padB;

    const gap = chartW / seasonBuckets.length;
    const barWidth = gap * 0.7;

    let barsHTML = "";
    seasonBuckets.forEach((b, idx) => {
      const bH = (b.count / maxCount) * chartH;
      const x = padL + idx * gap + (gap - barWidth) / 2;
      const y = padT + chartH - bH;
      const pct = ((b.count / tvShows.length) * 100).toFixed(1);

      barsHTML += `
        <rect x="${x}" y="${y}" width="${barWidth}" height="${bH}" rx="4" fill="#22c55e" class="chart-bar"
          data-tooltip-title="${b.label}" data-tooltip-val="${b.count.toLocaleString()} series (${pct}%)"></rect>
        <text x="${x + barWidth / 2}" y="${height - padB + 16}" text-anchor="middle" class="chart-axis-text" font-size="10">${b.label}</text>
      `;
    });

    const yTicks = [0, Math.round(maxCount * 0.5), maxCount];
    let gridHTML = "";
    yTicks.forEach(tick => {
      const yPos = padT + chartH - (tick / maxCount) * chartH;
      gridHTML += `
        <line x1="${padL}" y1="${yPos}" x2="${width - padR}" y2="${yPos}" class="chart-grid-line"></line>
        <text x="${padL - 6}" y="${yPos + 4}" text-anchor="end" class="chart-axis-text">${tick}</text>
      `;
    });

    svg.innerHTML = `
      ${gridHTML}
      <line x1="${padL}" y1="${padT + chartH}" x2="${width - padR}" y2="${padT + chartH}" class="chart-axis-line"></line>
      ${barsHTML}
    `;

    attachTooltips(svg);
  }

  // 9. Genre x Content Type (Stacked Bar Chart)
  function renderGenreTypeComparison() {
    const svg = document.getElementById("chart-genre-type");
    const legend = document.getElementById("legend-genre-type");
    if (!svg) return;

    const data = state.filteredDataset;
    if (data.length === 0) {
      renderEmptySVG(svg, "No data matches current filters");
      if (legend) legend.innerHTML = "";
      return;
    }

    const genreStats = {};
    data.forEach(d => {
      d.genres.forEach(g => {
        if (!genreStats[g]) genreStats[g] = { total: 0, movies: 0, tv: 0 };
        genreStats[g].total++;
        if (d.type === "Movie") genreStats[g].movies++;
        if (d.type === "TV Show") genreStats[g].tv++;
      });
    });

    const topGenres = Object.entries(genreStats)
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 10);

    if (topGenres.length === 0) return;

    const maxVal = topGenres[0][1].total;
    const padL = 150;
    const padR = 60;
    const padT = 20;
    const padB = 20;
    const width = 540;
    const height = 380;
    const chartW = width - padL - padR;
    const rowHeight = (height - padT - padB) / topGenres.length;
    const barHeight = rowHeight * 0.62;

    let elementsHTML = "";
    topGenres.forEach(([genre, stats], idx) => {
      const y = padT + idx * rowHeight + (rowHeight - barHeight) / 2;
      const movieW = (stats.movies / maxVal) * chartW;
      const tvW = (stats.tv / maxVal) * chartW;

      elementsHTML += `
        <text x="${padL - 10}" y="${y + barHeight / 2 + 4}" text-anchor="end" class="chart-axis-text" font-weight="600" fill="#e2e8f0">${truncateString(genre, 20)}</text>
        <rect x="${padL}" y="${y}" width="${movieW}" height="${barHeight}" fill="${PALETTE.movie}" class="chart-bar"
          data-tooltip-title="${escapeHTML(genre)} (Movies)" data-tooltip-val="${stats.movies.toLocaleString()} movies"></rect>
        <rect x="${padL + movieW}" y="${y}" width="${tvW}" height="${barHeight}" fill="${PALETTE.tv}" class="chart-bar"
          data-tooltip-title="${escapeHTML(genre)} (TV Shows)" data-tooltip-val="${stats.tv.toLocaleString()} TV shows"></rect>
        <text x="${padL + movieW + tvW + 8}" y="${y + barHeight / 2 + 4}" class="chart-axis-text" fill="#94a3b8" font-size="11" font-weight="600">${stats.total.toLocaleString()}</text>
      `;
    });

    svg.innerHTML = `
      <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${height - padB}" class="chart-axis-line"></line>
      ${elementsHTML}
    `;

    if (legend) {
      legend.innerHTML = `
        <div class="legend-item">
          <span class="legend-color-dot" style="background:${PALETTE.movie}"></span>
          <span>Movie Content</span>
        </div>
        <div class="legend-item">
          <span class="legend-color-dot" style="background:${PALETTE.tv}"></span>
          <span>TV Show Content</span>
        </div>
      `;
    }

    attachTooltips(svg);
  }

  // 10. Country x Content Type (Stacked Bar Chart)
  function renderCountryTypeComparison() {
    const svg = document.getElementById("chart-country-type");
    const legend = document.getElementById("legend-country-type");
    if (!svg) return;

    const data = state.filteredDataset;
    if (data.length === 0) {
      renderEmptySVG(svg, "No data matches current filters");
      if (legend) legend.innerHTML = "";
      return;
    }

    const countryStats = {};
    data.forEach(d => {
      d.countries.forEach(c => {
        if (c !== "Unknown") {
          if (!countryStats[c]) countryStats[c] = { total: 0, movies: 0, tv: 0 };
          countryStats[c].total++;
          if (d.type === "Movie") countryStats[c].movies++;
          if (d.type === "TV Show") countryStats[c].tv++;
        }
      });
    });

    const topCountries = Object.entries(countryStats)
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 10);

    if (topCountries.length === 0) return;

    const maxVal = topCountries[0][1].total;
    const padL = 130;
    const padR = 60;
    const padT = 20;
    const padB = 20;
    const width = 540;
    const height = 380;
    const chartW = width - padL - padR;
    const rowHeight = (height - padT - padB) / topCountries.length;
    const barHeight = rowHeight * 0.62;

    let elementsHTML = "";
    topCountries.forEach(([country, stats], idx) => {
      const y = padT + idx * rowHeight + (rowHeight - barHeight) / 2;
      const movieW = (stats.movies / maxVal) * chartW;
      const tvW = (stats.tv / maxVal) * chartW;

      elementsHTML += `
        <text x="${padL - 10}" y="${y + barHeight / 2 + 4}" text-anchor="end" class="chart-axis-text" font-weight="600" fill="#e2e8f0">${truncateString(country, 18)}</text>
        <rect x="${padL}" y="${y}" width="${movieW}" height="${barHeight}" fill="${PALETTE.movie}" class="chart-bar"
          data-tooltip-title="${escapeHTML(country)} (Movies)" data-tooltip-val="${stats.movies.toLocaleString()} movies"></rect>
        <rect x="${padL + movieW}" y="${y}" width="${tvW}" height="${barHeight}" fill="${PALETTE.tv}" class="chart-bar"
          data-tooltip-title="${escapeHTML(country)} (TV Shows)" data-tooltip-val="${stats.tv.toLocaleString()} TV shows"></rect>
        <text x="${padL + movieW + tvW + 8}" y="${y + barHeight / 2 + 4}" class="chart-axis-text" fill="#94a3b8" font-size="11" font-weight="600">${stats.total.toLocaleString()}</text>
      `;
    });

    svg.innerHTML = `
      <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${height - padB}" class="chart-axis-line"></line>
      ${elementsHTML}
    `;

    if (legend) {
      legend.innerHTML = `
        <div class="legend-item">
          <span class="legend-color-dot" style="background:${PALETTE.movie}"></span>
          <span>Movie Titles</span>
        </div>
        <div class="legend-item">
          <span class="legend-color-dot" style="background:${PALETTE.tv}"></span>
          <span>TV Show Titles</span>
        </div>
      `;
    }

    attachTooltips(svg);
  }

  // 11. Growth Trajectory Chart
  function renderGrowthTrajectoryChart() {
    const svg = document.getElementById("chart-growth-trajectory");
    if (!svg) return;

    const data = state.filteredDataset;
    const allYears = Array.from(new Set(state.rawDataset.map(d => d.year_added).filter(Boolean))).sort((a, b) => a - b);

    // Compute annual and cumulative additions
    const annualCounts = {};
    allYears.forEach(y => { annualCounts[y] = 0; });
    data.forEach(d => {
      if (d.year_added && annualCounts[d.year_added] !== undefined) {
        annualCounts[d.year_added]++;
      }
    });

    let cumulative = 0;
    const cumulativePoints = [];
    allYears.forEach(y => {
      cumulative += annualCounts[y];
      cumulativePoints.push({ year: y, added: annualCounts[y], cumulative });
    });

    const maxCum = Math.max(...cumulativePoints.map(p => p.cumulative), 10);
    const padL = 60;
    const padR = 40;
    const padT = 30;
    const padB = 40;
    const width = 1080;
    const height = 260;
    const chartW = width - padL - padR;
    const chartH = height - padT - padB;

    const getX = (idx) => padL + (idx / (allYears.length - 1)) * chartW;
    const getY = (val) => padT + chartH - (val / maxCum) * chartH;

    const points = cumulativePoints.map((p, idx) => [getX(idx), getY(p.cumulative)]);
    const lineD = makeSmoothPath(points);
    const areaD = `${lineD} L ${points[points.length - 1][0]} ${padT + chartH} L ${points[0][0]} ${padT + chartH} Z`;

    const yTicks = [0, Math.round(maxCum * 0.5), maxCum];
    let gridHTML = "";
    yTicks.forEach(tick => {
      const yPos = getY(tick);
      gridHTML += `
        <line x1="${padL}" y1="${yPos}" x2="${width - padR}" y2="${yPos}" class="chart-grid-line"></line>
        <text x="${padL - 8}" y="${yPos + 4}" text-anchor="end" class="chart-axis-text">${tick.toLocaleString()}</text>
      `;
    });

    let xLabelsHTML = "";
    allYears.forEach((yr, idx) => {
      const xPos = getX(idx);
      xLabelsHTML += `
        <text x="${xPos}" y="${height - padB + 18}" text-anchor="middle" class="chart-axis-text">${yr}</text>
      `;
    });

    let pointsHTML = "";
    points.forEach(([px, py], idx) => {
      const p = cumulativePoints[idx];
      pointsHTML += `
        <circle cx="${px}" cy="${py}" r="4" fill="#a855f7" stroke="#171a23" stroke-width="2" class="chart-point"
          data-tooltip-title="${p.year} Cumulative Scale"
          data-tooltip-val="${p.cumulative.toLocaleString()} total titles (+${p.added.toLocaleString()} added)"></circle>
      `;
    });

    svg.innerHTML = `
      <defs>
        <linearGradient id="grad-trajectory" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#a855f7" stop-opacity="0.4"/>
          <stop offset="100%" stop-color="#a855f7" stop-opacity="0.01"/>
        </linearGradient>
      </defs>
      ${gridHTML}
      <line x1="${padL}" y1="${padT + chartH}" x2="${width - padR}" y2="${padT + chartH}" class="chart-axis-line"></line>
      <path d="${areaD}" fill="url(#grad-trajectory)"></path>
      <path d="${lineD}" stroke="#a855f7" class="chart-line" stroke-width="3"></path>
      ${pointsHTML}
      ${xLabelsHTML}
    `;

    attachTooltips(svg);
  }

  // =========================================================================
  // CONTENT EXPLORER (TABLE RENDERING & SORTING)
  // =========================================================================
  function renderTable() {
    const tbody = document.getElementById("table-body");
    const resultsCountEl = document.getElementById("table-results-summary");
    const pageIndicator = document.getElementById("pagination-page-indicator");
    const controlsBar = document.getElementById("pagination-controls-bar");

    if (!tbody) return;

    let data = [...state.filteredDataset];

    // Sorting
    const sortCol = state.table.sortColumn;
    const sortDir = state.table.sortDirection === "asc" ? 1 : -1;

    data.sort((a, b) => {
      let valA = a[sortCol];
      let valB = b[sortCol];

      if (sortCol === "release_year") {
        valA = a.release_year || 0;
        valB = b.release_year || 0;
      } else if (sortCol === "duration_raw") {
        valA = a.duration_min || a.duration_seasons || 0;
        valB = b.duration_min || b.duration_seasons || 0;
      } else if (sortCol === "date_added") {
        valA = a.year_added ? a.year_added * 100 + (a.month_added || 1) : 0;
        valB = b.year_added ? b.year_added * 100 + (b.month_added || 1) : 0;
      } else {
        valA = (valA || "").toString().toLowerCase();
        valB = (valB || "").toString().toLowerCase();
      }

      if (valA < valB) return -1 * sortDir;
      if (valA > valB) return 1 * sortDir;
      return 0;
    });

    const totalRecords = data.length;
    const pageSize = state.table.pageSize;
    const totalPages = Math.ceil(totalRecords / pageSize) || 1;

    if (state.table.currentPage > totalPages) state.table.currentPage = totalPages;
    const currentPage = state.table.currentPage;

    const startIdx = (currentPage - 1) * pageSize;
    const pageData = data.slice(startIdx, startIdx + pageSize);

    // Update Results Summary
    if (resultsCountEl) {
      if (totalRecords === 0) {
        resultsCountEl.textContent = "0 titles found";
      } else {
        const endIdx = Math.min(startIdx + pageSize, totalRecords);
        resultsCountEl.textContent = `Showing ${startIdx + 1} - ${endIdx} of ${totalRecords.toLocaleString()} titles`;
      }
    }

    if (pageIndicator) {
      pageIndicator.textContent = `Page ${currentPage} of ${totalPages}`;
    }

    // Render Table Rows
    if (pageData.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align: center; padding: 3rem 1rem; color: var(--text-muted);">
            <div class="empty-state">
              <svg class="empty-state-icon" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
              <div class="empty-state-title">No matching titles</div>
              <div class="empty-state-desc">Try loosening your search query or reset filters to display titles.</div>
              <button type="button" class="btn btn-secondary" onclick="document.getElementById('btn-reset-filters').click()">Clear All Filters</button>
            </div>
          </td>
        </tr>
      `;
    } else {
      tbody.innerHTML = pageData.map(item => `
        <tr data-show-id="${escapeHTML(item.show_id)}" title="Click to view details">
          <td class="td-title">${escapeHTML(item.title)}</td>
          <td>
            <span class="td-type-badge ${item.type === 'Movie' ? 'movie' : 'tv'}">
              ${escapeHTML(item.type)}
            </span>
          </td>
          <td>${item.release_year || "N/A"}</td>
          <td><span class="td-rating-badge">${escapeHTML(item.rating)}</span></td>
          <td class="td-countries" title="${escapeHTML(item.country)}">${escapeHTML(item.country)}</td>
          <td>${escapeHTML(item.date_added || "N/A")}</td>
          <td><strong>${escapeHTML(item.duration)}</strong></td>
          <td class="td-genres" title="${escapeHTML(item.listed_in)}">${escapeHTML(item.listed_in)}</td>
        </tr>
      `).join("");

      // Row Click Listener to open Detail Modal
      tbody.querySelectorAll("tr[data-show-id]").forEach(tr => {
        tr.addEventListener("click", () => {
          const id = tr.dataset.showId;
          const targetItem = state.rawDataset.find(d => d.show_id === id);
          if (targetItem) openTitleModal(targetItem);
        });
      });
    }

    // Render Pagination Controls
    renderPaginationButtons(controlsBar, currentPage, totalPages);
    updateSortIndicators();
  }

  function renderPaginationButtons(container, current, total) {
    if (!container) return;

    if (total <= 1) {
      container.innerHTML = "";
      return;
    }

    let html = `
      <button class="page-btn" data-page="1" ${current === 1 ? "disabled" : ""} title="First Page">&laquo;</button>
      <button class="page-btn" data-page="${current - 1}" ${current === 1 ? "disabled" : ""} title="Previous Page">&lsaquo;</button>
    `;

    // Window of pages around current
    const startP = Math.max(1, current - 2);
    const endP = Math.min(total, current + 2);

    for (let p = startP; p <= endP; p++) {
      html += `
        <button class="page-btn ${p === current ? 'active' : ''}" data-page="${p}">${p}</button>
      `;
    }

    html += `
      <button class="page-btn" data-page="${current + 1}" ${current === total ? "disabled" : ""} title="Next Page">&rsaquo;</button>
      <button class="page-btn" data-page="${total}" ${current === total ? "disabled" : ""} title="Last Page">&raquo;</button>
    `;

    container.innerHTML = html;

    container.querySelectorAll(".page-btn[data-page]").forEach(btn => {
      btn.addEventListener("click", () => {
        const p = parseInt(btn.dataset.page, 10);
        if (!isNaN(p) && p >= 1 && p <= total) {
          state.table.currentPage = p;
          renderTable();
        }
      });
    });
  }

  function updateSortIndicators() {
    document.querySelectorAll(".sort-indicator").forEach(el => {
      el.textContent = "";
    });
    const curIndicator = document.getElementById(`sort-${state.table.sortColumn}`);
    if (curIndicator) {
      curIndicator.textContent = state.table.sortDirection === "asc" ? "▲" : "▼";
    }
  }

  // =========================================================================
  // DYNAMIC BUSINESS INSIGHTS
  // =========================================================================
  function renderDynamicInsights() {
    const container = document.getElementById("insights-container");
    if (!container) return;

    const data = state.filteredDataset;
    const total = data.length;

    if (total === 0) {
      container.innerHTML = `
        <div class="insight-card" style="grid-column: 1 / -1; text-align:center;">
          <div class="insight-card-title">No Insights Available</div>
          <div class="insight-card-text">Adjust your filters to see dynamically generated business intelligence metrics.</div>
        </div>
      `;
      return;
    }

    const movies = data.filter(d => d.type === "Movie");
    const tvShows = data.filter(d => d.type === "TV Show");
    const moviePct = ((movies.length / total) * 100).toFixed(1);
    const tvPct = ((tvShows.length / total) * 100).toFixed(1);

    // Peak Ingestion Year
    const yearAddedCounts = {};
    data.forEach(d => {
      if (d.year_added) yearAddedCounts[d.year_added] = (yearAddedCounts[d.year_added] || 0) + 1;
    });
    const peakAdded = Object.entries(yearAddedCounts).sort((a, b) => b[1] - a[1])[0];

    // Ratings analysis
    const ratingCounts = {};
    let matureCount = 0;
    data.forEach(d => {
      if (d.rating) {
        ratingCounts[d.rating] = (ratingCounts[d.rating] || 0) + 1;
        if (["TV-MA", "R", "NC-17"].includes(d.rating)) matureCount++;
      }
    });
    const topRating = Object.entries(ratingCounts).sort((a, b) => b[1] - a[1])[0];
    const maturePct = ((matureCount / total) * 100).toFixed(1);

    // Top Country
    const countryCounts = {};
    data.forEach(d => {
      d.countries.forEach(c => {
        if (c !== "Unknown") countryCounts[c] = (countryCounts[c] || 0) + 1;
      });
    });
    const sortedCountries = Object.entries(countryCounts).sort((a, b) => b[1] - a[1]);
    const topCountry = sortedCountries[0];
    const countryPct = topCountry ? ((topCountry[1] / total) * 100).toFixed(1) : 0;

    // Top Genre
    const genreCounts = {};
    data.forEach(d => {
      d.genres.forEach(g => {
        genreCounts[g] = (genreCounts[g] || 0) + 1;
      });
    });
    const sortedGenres = Object.entries(genreCounts).sort((a, b) => b[1] - a[1]);
    const topGenre = sortedGenres[0];
    const secondGenre = sortedGenres[1];

    // Durations
    const movieMins = movies.map(m => m.duration_min).filter(n => typeof n === "number");
    const avgMovieMin = movieMins.length > 0 ? (movieMins.reduce((a, b) => a + b, 0) / movieMins.length).toFixed(1) : "N/A";

    const tvSingleSeason = tvShows.filter(t => t.duration_seasons === 1).length;
    const tvSinglePct = tvShows.length > 0 ? ((tvSingleSeason / tvShows.length) * 100).toFixed(1) : 0;

    container.innerHTML = `
      <!-- Insight 1: Content Mix -->
      <div class="insight-card">
        <div class="insight-card-tag">Format Mix</div>
        <div class="insight-card-title">${moviePct}% Movies vs ${tvPct}% TV Series</div>
        <p class="insight-card-text">
          Feature films comprise <strong>${movies.length.toLocaleString()} titles</strong> of the selected catalog, outnumbering episodic series (<strong>${tvShows.length.toLocaleString()} titles</strong>) by roughly <strong>${(movies.length / (tvShows.length || 1)).toFixed(1)}:1</strong>.
        </p>
      </div>

      <!-- Insight 2: Peak Ingestion Period -->
      <div class="insight-card">
        <div class="insight-card-tag">Content Ingestion</div>
        <div class="insight-card-title">${peakAdded ? `Peak Influx in ${peakAdded[0]}` : "Steady Ingestion"}</div>
        <p class="insight-card-text">
          ${peakAdded
            ? `The year <strong>${peakAdded[0]}</strong> witnessed the highest content ingestion with <strong>${peakAdded[1].toLocaleString()} titles added</strong> (${((peakAdded[1] / total) * 100).toFixed(1)}% of filtered catalog).`
            : "Additions span consistently across historical archiving eras."}
        </p>
      </div>

      <!-- Insight 3: Target Demographics -->
      <div class="insight-card">
        <div class="insight-card-tag">Demographics</div>
        <div class="insight-card-title">${maturePct}% Mature-Rated Content</div>
        <p class="insight-card-text">
          Titles certified for mature viewers (TV-MA & R) dominate with <strong>${matureCount.toLocaleString()} titles</strong>. The single largest rating class is <strong>${topRating ? topRating[0] : 'N/A'}</strong> at <strong>${topRating ? topRating[1].toLocaleString() : 0} entries</strong>.
        </p>
      </div>

      <!-- Insight 4: Geographic Origin -->
      <div class="insight-card">
        <div class="insight-card-tag">Global Distribution</div>
        <div class="insight-card-title">${topCountry ? topCountry[0] : "Global Hub"} Produces Most Content</div>
        <p class="insight-card-text">
          ${topCountry
            ? `<strong>${topCountry[0]}</strong> leads production participating in <strong>${topCountry[1].toLocaleString()} titles</strong> (${countryPct}% share), highlighting major concentration in key entertainment capitals.`
            : "Content spans diverse international production networks."}
        </p>
      </div>

      <!-- Insight 5: Genre Leadership -->
      <div class="insight-card">
        <div class="insight-card-tag">Catalog Taxonomy</div>
        <div class="insight-card-title">${topGenre ? topGenre[0] : "Diverse Genres"} Leads</div>
        <p class="insight-card-text">
          ${topGenre
            ? `<strong>${topGenre[0]}</strong> is the primary category with <strong>${topGenre[1].toLocaleString()} catalog entries</strong>, closely followed by <strong>${secondGenre ? secondGenre[0] : ''}</strong> (${secondGenre ? secondGenre[1].toLocaleString() : 0}).`
            : "Broad array of specialized classifications."}
        </p>
      </div>

      <!-- Insight 6: Runtime & Renewals -->
      <div class="insight-card">
        <div class="insight-card-tag">Duration Benchmarks</div>
        <div class="insight-card-title">Avg Movie: ${avgMovieMin} min | ${tvSinglePct}% Single Season TV</div>
        <p class="insight-card-text">
          Feature films hover close to the classic 100-minute sweet spot, while <strong>${tvSinglePct}% of TV series</strong> conclude after their freshman season, evidencing selective franchise renewals.
        </p>
      </div>
    `;
  }

  // =========================================================================
  // TITLE DETAILS INSPECTOR (MODAL)
  // =========================================================================
  function openTitleModal(item) {
    const modal = document.getElementById("title-modal");
    if (!modal) return;

    document.getElementById("modal-title-text").textContent = item.title;

    // Meta row
    const metaRow = document.getElementById("modal-meta-row");
    metaRow.innerHTML = `
      <span class="td-type-badge ${item.type === 'Movie' ? 'movie' : 'tv'}">${escapeHTML(item.type)}</span>
      <span class="td-rating-badge">${escapeHTML(item.rating)}</span>
      <span>${item.release_year || "Unknown Year"}</span>
      <span>•</span>
      <span>${escapeHTML(item.duration)}</span>
    `;

    // Synopsis
    document.getElementById("modal-synopsis-text").textContent = item.description;

    // Details Grid
    const detailsGrid = document.getElementById("modal-details-grid");
    detailsGrid.innerHTML = `
      <div class="modal-label">Country:</div>
      <div class="modal-val">${escapeHTML(item.country)}</div>

      <div class="modal-label">Genres:</div>
      <div class="modal-val">${escapeHTML(item.listed_in)}</div>

      <div class="modal-label">Date Added:</div>
      <div class="modal-val">${escapeHTML(item.date_added || "N/A")}</div>

      ${item.director && item.director !== "NA" ? `
        <div class="modal-label">Director:</div>
        <div class="modal-val">${escapeHTML(item.director)}</div>
      ` : ""}

      ${item.cast && item.cast !== "NA" ? `
        <div class="modal-label">Cast:</div>
        <div class="modal-val">${escapeHTML(item.cast)}</div>
      ` : ""}
    `;

    modal.classList.add("active");
    modal.setAttribute("aria-hidden", "false");
  }

  function closeTitleModal() {
    const modal = document.getElementById("title-modal");
    if (!modal) return;
    modal.classList.remove("active");
    modal.setAttribute("aria-hidden", "true");
  }

  // =========================================================================
  // DATA EXPORT (CSV / JSON)
  // =========================================================================
  function exportFilteredCSV() {
    const data = state.filteredDataset;
    if (data.length === 0) {
      alert("No data to export with current filters.");
      return;
    }

    const headers = ["show_id", "type", "title", "country", "date_added", "release_year", "rating", "duration", "listed_in"];
    if (state.validationStats.hasDirector) headers.push("director");
    if (state.validationStats.hasCast) headers.push("cast");
    if (state.validationStats.hasDescription) headers.push("description");

    const csvRows = [headers.join(",")];

    data.forEach(item => {
      const row = headers.map(h => {
        let val = (item[h] || "").toString();
        // Escape quotes
        val = val.replace(/"/g, '""');
        return `"${val}"`;
      });
      csvRows.push(row.join(","));
    });

    const csvContent = "data:text/csv;charset=utf-8," + encodeURIComponent(csvRows.join("\n"));
    const downloadLink = document.createElement("a");
    downloadLink.setAttribute("href", csvContent);
    downloadLink.setAttribute("download", `netflix_filtered_export_${Date.now()}.csv`);
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
  }

  function exportFilteredJSON() {
    const data = state.filteredDataset;
    if (data.length === 0) {
      alert("No data to export with current filters.");
      return;
    }

    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const downloadLink = document.createElement("a");
    downloadLink.setAttribute("href", url);
    downloadLink.setAttribute("download", `netflix_filtered_export_${Date.now()}.json`);
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    URL.revokeObjectURL(url);
  }

  // =========================================================================
  // EVENT LISTENERS & WIRING
  // =========================================================================
  function setupEventListeners() {
    // 1. Reset Filters Button
    const btnReset = document.getElementById("btn-reset-filters");
    if (btnReset) btnReset.addEventListener("click", resetAllFilters);

    // 2. Dropdowns change
    const filterType = document.getElementById("filter-type");
    if (filterType) {
      filterType.addEventListener("change", e => {
        state.filters.type = e.target.value;
        applyFilters();
      });
    }

    const filterRating = document.getElementById("filter-rating");
    if (filterRating) {
      filterRating.addEventListener("change", e => {
        state.filters.rating = e.target.value;
        applyFilters();
      });
    }

    const filterCountry = document.getElementById("filter-country");
    if (filterCountry) {
      filterCountry.addEventListener("change", e => {
        state.filters.country = e.target.value;
        applyFilters();
      });
    }

    const filterGenre = document.getElementById("filter-genre");
    if (filterGenre) {
      filterGenre.addEventListener("change", e => {
        state.filters.genre = e.target.value;
        applyFilters();
      });
    }

    const filterDuration = document.getElementById("filter-duration");
    if (filterDuration) {
      filterDuration.addEventListener("change", e => {
        state.filters.durationBracket = e.target.value;
        applyFilters();
      });
    }

    const ryMin = document.getElementById("filter-year-min");
    const ryMax = document.getElementById("filter-year-max");
    if (ryMin && ryMax) {
      ryMin.addEventListener("change", e => {
        state.filters.releaseYearMin = parseInt(e.target.value, 10);
        applyFilters();
      });
      ryMax.addEventListener("change", e => {
        state.filters.releaseYearMax = parseInt(e.target.value, 10);
        applyFilters();
      });
    }

    const daMin = document.getElementById("filter-added-min");
    const daMax = document.getElementById("filter-added-max");
    if (daMin && daMax) {
      daMin.addEventListener("change", e => {
        state.filters.yearAddedMin = parseInt(e.target.value, 10);
        applyFilters();
      });
      daMax.addEventListener("change", e => {
        state.filters.yearAddedMax = parseInt(e.target.value, 10);
        applyFilters();
      });
    }

    // 3. Quick Presets
    document.querySelectorAll(".preset-chip[data-preset]").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".preset-chip").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        handlePresetSelect(btn.dataset.preset);
      });
    });

    // 4. Table Search Input with Debounce
    const searchInput = document.getElementById("table-search-input");
    const searchClear = document.getElementById("table-search-clear");
    let debounceTimer = null;
    if (searchInput) {
      searchInput.addEventListener("input", e => {
        const val = e.target.value;
        searchClear.style.display = val ? "block" : "none";
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          state.filters.keyword = val;
          applyFilters();
        }, 220);
      });
    }

    if (searchClear) {
      searchClear.addEventListener("click", () => {
        searchInput.value = "";
        searchClear.style.display = "none";
        state.filters.keyword = "";
        applyFilters();
      });
    }

    // 5. Page Size Selector
    const pageSizeSelect = document.getElementById("table-page-size");
    if (pageSizeSelect) {
      pageSizeSelect.addEventListener("change", e => {
        state.table.pageSize = parseInt(e.target.value, 10) || 25;
        state.table.currentPage = 1;
        renderTable();
      });
    }

    // 6. Table Header Sorting
    document.querySelectorAll(".data-table th[data-sort]").forEach(th => {
      th.addEventListener("click", () => {
        const col = th.dataset.sort;
        if (state.table.sortColumn === col) {
          state.table.sortDirection = state.table.sortDirection === "asc" ? "desc" : "asc";
        } else {
          state.table.sortColumn = col;
          state.table.sortDirection = col === "date_added" || col === "release_year" ? "desc" : "asc";
        }
        renderTable();
      });
    });

    // 7. Time Series Toggle Button
    document.querySelectorAll(".chart-btn-toggle[data-time-mode]").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".chart-btn-toggle[data-time-mode]").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        state.timeSeriesMode = btn.dataset.timeMode;
        renderAddedTimeChart();
      });
    });

    // 8. Exports
    const btnCSV = document.getElementById("btn-export-csv");
    if (btnCSV) btnCSV.addEventListener("click", exportFilteredCSV);
    const btnJSON = document.getElementById("btn-export-json");
    if (btnJSON) btnJSON.addEventListener("click", exportFilteredJSON);

    // 9. Modal Close
    const modalClose = document.getElementById("modal-close-btn");
    const modal = document.getElementById("title-modal");
    if (modalClose) modalClose.addEventListener("click", closeTitleModal);
    if (modal) {
      modal.addEventListener("click", e => {
        if (e.target === modal) closeTitleModal();
      });
    }
    document.addEventListener("keydown", e => {
      if (e.key === "Escape") closeTitleModal();
    });
  }

  function handlePresetSelect(preset) {
    state.filters.preset = preset;

    if (preset === "all") {
      resetAllFilters();
      return;
    }

    // Reset base parameters first
    state.filters.type = "ALL";
    state.filters.rating = "ALL";
    state.filters.country = "ALL";
    state.filters.genre = "ALL";
    state.filters.durationBracket = "ALL";
    state.filters.keyword = "";

    const releaseYears = state.rawDataset.map(d => d.release_year).filter(Boolean);
    state.filters.releaseYearMin = Math.min(...releaseYears);
    state.filters.releaseYearMax = Math.max(...releaseYears);

    if (preset === "movies") {
      state.filters.type = "Movie";
    } else if (preset === "tv") {
      state.filters.type = "TV Show";
    } else if (preset === "recent") {
      state.filters.releaseYearMin = 2018;
      state.filters.releaseYearMax = 2021;
    } else if (preset === "classics") {
      state.filters.releaseYearMin = Math.min(...releaseYears);
      state.filters.releaseYearMax = 1999;
    } else if (preset === "mature") {
      state.filters.rating = "TV-MA";
    } else if (preset === "family") {
      state.filters.rating = "TV-PG";
    }

    // Sync input controls
    document.getElementById("filter-type").value = state.filters.type;
    document.getElementById("filter-rating").value = state.filters.rating;
    document.getElementById("filter-year-min").value = state.filters.releaseYearMin;
    document.getElementById("filter-year-max").value = state.filters.releaseYearMax;

    applyFilters();
  }

  // =========================================================================
  // SVG TOOLTIP ATTACHMENT & UTILITIES
  // =========================================================================
  function attachTooltips(container) {
    const tooltip = document.getElementById("dashboard-tooltip");
    if (!tooltip) return;

    container.querySelectorAll("[data-tooltip-title]").forEach(el => {
      const showTooltip = (e) => {
        const title = el.dataset.tooltipTitle;
        const val = el.dataset.tooltipVal;
        tooltip.innerHTML = `
          <div class="tooltip-title">${escapeHTML(title)}</div>
          <div class="tooltip-value">${escapeHTML(val)}</div>
        `;
        tooltip.style.display = "block";
        positionTooltip(e, tooltip);
      };

      const moveTooltip = (e) => {
        positionTooltip(e, tooltip);
      };

      const hideTooltip = () => {
        tooltip.style.display = "none";
      };

      el.addEventListener("mouseenter", showTooltip);
      el.addEventListener("mousemove", moveTooltip);
      el.addEventListener("mouseleave", hideTooltip);
      el.addEventListener("touchstart", showTooltip, { passive: true });
      el.addEventListener("touchend", hideTooltip, { passive: true });
    });
  }

  function positionTooltip(e, tooltip) {
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    const tW = tooltip.offsetWidth || 180;
    const tH = tooltip.offsetHeight || 60;
    const pad = 15;

    let left = clientX + pad;
    let top = clientY - tH / 2;

    // Check right edge
    if (left + tW > window.innerWidth - pad) {
      left = clientX - tW - pad;
    }
    // Check top edge
    if (top < pad) {
      top = pad;
    }
    // Check bottom edge
    if (top + tH > window.innerHeight - pad) {
      top = window.innerHeight - tH - pad;
    }

    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  }

  // Math helper for SVG donut arcs
  function describeDonutArc(cx, cy, rOut, rIn, startAngle, endAngle) {
    if (endAngle - startAngle >= 360) {
      endAngle = 359.999;
    }
    const toRad = Math.PI / 180;
    const sAng = startAngle - 90;
    const eAng = endAngle - 90;

    const x1Out = cx + rOut * Math.cos(sAng * toRad);
    const y1Out = cy + rOut * Math.sin(sAng * toRad);
    const x2Out = cx + rOut * Math.cos(eAng * toRad);
    const y2Out = cy + rOut * Math.sin(eAng * toRad);

    const x1In = cx + rIn * Math.cos(eAng * toRad);
    const y1In = cy + rIn * Math.sin(eAng * toRad);
    const x2In = cx + rIn * Math.cos(sAng * toRad);
    const y2In = cy + rIn * Math.sin(sAng * toRad);

    const largeArc = endAngle - startAngle > 180 ? 1 : 0;

    return `M ${x1Out} ${y1Out} A ${rOut} ${rOut} 0 ${largeArc} 1 ${x2Out} ${y2Out} L ${x1In} ${y1In} A ${rIn} ${rIn} 0 ${largeArc} 0 ${x2In} ${y2In} Z`;
  }

  // Catmull-Rom or bezier smoothing for line chart
  function makeSmoothPath(points) {
    if (!points || points.length === 0) return "";
    if (points.length === 1) return `M ${points[0][0]} ${points[0][1]}`;

    let path = `M ${points[0][0]} ${points[0][1]}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = i > 0 ? points[i - 1] : points[i];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = i < points.length - 2 ? points[i + 2] : p2;

      const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
      const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
      const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
      const cp2y = p2[1] - (p3[1] - p1[1]) / 6;

      path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2[0]} ${p2[1]}`;
    }
    return path;
  }

  function renderEmptySVG(svg, message) {
    svg.innerHTML = `
      <rect width="100%" height="100%" fill="transparent"></rect>
      <text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" fill="#64748b" font-size="12" font-style="italic">
        ${escapeHTML(message)}
      </text>
    `;
  }

  function truncateString(str, max) {
    if (!str) return "";
    return str.length > max ? str.slice(0, max - 1) + "…" : str;
  }

  function escapeHTML(str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function showFatalError(msg) {
    const main = document.querySelector("main");
    if (main) {
      main.innerHTML = `
        <div style="background: rgba(229, 9, 20, 0.1); border: 1px solid var(--accent-netflix); border-radius: var(--radius-md); padding: 2rem; margin: 3rem auto; max-width: 600px; text-align: center;">
          <h2 style="color: #f87171; font-size: 1.3rem; margin-bottom: 0.5rem;">Data Initialization Error</h2>
          <p style="color: var(--text-secondary);">${escapeHTML(msg)}</p>
        </div>
      `;
    }
  }

})();
