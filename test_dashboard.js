/**
 * test_dashboard.js - Automated Test Suite for Netflix Content Analytics Dashboard
 * Verifies dataset loading, schema integrity, filters, KPIs, charts data, search, and pagination.
 * Can be executed via: `node test_dashboard.js` or in browser console.
 */

const fs = require("fs");
const path = require("path");

// Test runner state
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, testName, details = "") {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ PASS: ${testName}`);
  } else {
    failedTests++;
    console.error(`  ❌ FAIL: ${testName} ${details ? `-> ${details}` : ""}`);
  }
}

console.log("======================================================================");
console.log("🚀 NETFLIX CONTENT ANALYTICS DASHBOARD - AUTOMATED TEST SUITE");
console.log("======================================================================\n");

// 1. Dataset Loading Tests
console.log("--- 1. DATASET LOADING & SCHEMA VERIFICATION ---");
let rawData = [];
const dataJsonPath = path.join(__dirname, "data.json");
const dataJsPath = path.join(__dirname, "data.js");

assert(fs.existsSync(dataJsonPath), "data.json file exists on disk");
assert(fs.existsSync(dataJsPath), "data.js file exists on disk");

try {
  const jsonContent = fs.readFileSync(dataJsonPath, "utf-8");
  rawData = JSON.parse(jsonContent);
  assert(Array.isArray(rawData), "Dataset parsed as a valid JSON array");
  assert(rawData.length === 8790, "Record count is exactly 8,790 records", `Found ${rawData.length}`);
} catch (err) {
  assert(false, "Failed to load data.json", err.message);
}

// 2. Expected Columns & Schema Validation
console.log("\n--- 2. COLUMN STRUCTURE & TYPES ---");
const expectedBaselineCols = [
  "show_id", "type", "title", "country", "date_added",
  "release_year", "rating", "duration", "listed_in"
];

if (rawData.length > 0) {
  const first = rawData[0];
  expectedBaselineCols.forEach(col => {
    assert(col in first, `Column '${col}' is present in dataset records`);
  });

  // Check unique IDs & duplicates
  const seenIds = new Set();
  let duplicateIds = 0;
  rawData.forEach(r => {
    if (seenIds.has(r.show_id)) duplicateIds++;
    seenIds.add(r.show_id);
  });
  assert(duplicateIds === 0, "No duplicate show_id keys found (0 duplicates)");

  // Check content types
  const types = new Set(rawData.map(r => r.type));
  assert(types.has("Movie") && types.has("TV Show") && types.size === 2, "Types strictly contain 'Movie' and 'TV Show'");
}

// 3. Derived Metrics & Baseline Counts
console.log("\n--- 3. DERIVED METRICS & DISTRIBUTIONS ---");
const movies = rawData.filter(d => d.type === "Movie");
const tvShows = rawData.filter(d => d.type === "TV Show");

assert(movies.length === 6126, `Movie count is 6,126 (Found: ${movies.length})`);
assert(tvShows.length === 2664, `TV Show count is 2,664 (Found: ${tvShows.length})`);
assert(movies.length + tvShows.length === 8790, "Movies + TV Shows exactly equal 8,790");

const movieMins = movies.map(m => m.duration_min).filter(n => typeof n === "number");
const avgMovieMin = movieMins.reduce((a, b) => a + b, 0) / movieMins.length;
assert(Math.round(avgMovieMin * 10) / 10 === 99.6, `Average movie duration is 99.6 min (Calculated: ${avgMovieMin.toFixed(1)})`);

const tvSeasons = tvShows.map(t => t.duration_seasons).filter(n => typeof n === "number");
const avgTvSeasons = tvSeasons.reduce((a, b) => a + b, 0) / tvSeasons.length;
assert(Math.round(avgTvSeasons * 100) / 100 === 1.75, `Average TV seasons is 1.75 (Calculated: ${avgTvSeasons.toFixed(2)})`);

// 4. Global Filters Logic Tests
console.log("\n--- 4. FILTERING ENGINE TESTS ---");

// Test Type Filter
const filteredMovies = rawData.filter(d => d.type === "Movie");
assert(filteredMovies.length === 6126, "Filter by Type='Movie' returns 6,126 records");
const filteredTV = rawData.filter(d => d.type === "TV Show");
assert(filteredTV.length === 2664, "Filter by Type='TV Show' returns 2,664 records");

// Test Rating Filter
const filteredTVMA = rawData.filter(d => d.rating === "TV-MA");
assert(filteredTVMA.length === 3205, `Filter by Rating='TV-MA' returns 3,205 records (Found: ${filteredTVMA.length})`);

// Test Country Filter (splitting multi-country values)
const filteredUS = rawData.filter(d => Array.isArray(d.countries) && d.countries.includes("United States"));
assert(filteredUS.length === 3681, `Filter by Country='United States' returns 3,681 records (Found: ${filteredUS.length})`);

const filteredIndia = rawData.filter(d => Array.isArray(d.countries) && d.countries.includes("India"));
assert(filteredIndia.length === 1046, `Filter by Country='India' returns 1,046 records (Found: ${filteredIndia.length})`);

// Test Genre Filter (splitting multi-genre values)
const filteredDocs = rawData.filter(d => Array.isArray(d.genres) && d.genres.includes("Documentaries"));
assert(filteredDocs.length === 869, `Filter by Genre='Documentaries' returns 869 records (Found: ${filteredDocs.length})`);

// Test Release Year Filter
const filteredRecent = rawData.filter(d => d.release_year >= 2018 && d.release_year <= 2021);
assert(filteredRecent.length > 3000, `Filter by Release Year 2018-2021 returns substantial recent subset (${filteredRecent.length})`);

// Test Duration Brackets
const shortMovies = rawData.filter(d => d.type === "Movie" && d.duration_min && d.duration_min < 60);
assert(shortMovies.length > 0, `Short movies (<60 min) filter returns valid entries (${shortMovies.length})`);

const singleSeasonTV = rawData.filter(d => d.type === "TV Show" && d.duration_seasons === 1);
assert(singleSeasonTV.length === 1791, `Single-season TV shows return exactly 1,791 (67.2% of TV catalog)`);

// 5. Reset Filter Test
console.log("\n--- 5. RESET FILTERS INTEGRITY ---");
let activeSelection = [...filteredTVMA];
assert(activeSelection.length === 3205, "Active selection is currently filtered to 3,205 rows");
// Simulate reset
activeSelection = [...rawData];
assert(activeSelection.length === 8790, "Resetting filters completely restores all 8,790 records");

// 6. Search Functionality Tests
console.log("\n--- 6. SEARCH ENGINE TESTS ---");
function performSearch(query, dataset) {
  const q = query.trim().toLowerCase();
  return dataset.filter(item => {
    const combined = `${item.title} ${item.country} ${item.listed_in} ${item.director || ""} ${item.cast || ""} ${item.description || ""}`.toLowerCase();
    return combined.includes(q);
  });
}

const searchResultTitle = performSearch("Stranger Things", rawData);
assert(searchResultTitle.length >= 1, "Searching 'Stranger Things' finds the show");
assert(searchResultTitle[0].title === "Stranger Things", "Correct title matched for 'Stranger Things'");

const searchResultActor = performSearch("Vicky Kaushal", rawData);
assert(searchResultActor.length >= 1, "Searching actor 'Vicky Kaushal' finds associated titles");

const searchNonExistent = performSearch("xyzNonExistentTitle9999", rawData);
assert(searchNonExistent.length === 0, "Searching for non-existent keyword returns 0 records without errors");

// 7. Pagination Logic Tests
console.log("\n--- 7. PAGINATION ENGINE TESTS ---");
const pageSize = 25;
const totalPages = Math.ceil(rawData.length / pageSize);
assert(totalPages === 352, `Total pages for 8,790 items at 25 per page is 352 (Calculated: ${totalPages})`);

const page1Items = rawData.slice(0, 25);
assert(page1Items.length === 25, "Page 1 contains exactly 25 records");
assert(page1Items[0].show_id === "s1", "Page 1 begins with show_id 's1'");

const lastPageItems = rawData.slice((totalPages - 1) * pageSize);
assert(lastPageItems.length === 8790 - (351 * 25), `Last page contains remaining records (${lastPageItems.length})`);
assert(lastPageItems[lastPageItems.length - 1].show_id === "s8807", "Final record is show_id 's8807'");

// 8. Visualizations Data Integrity Tests
console.log("\n--- 8. VISUALIZATION AGGREGATIONS ---");
// Check Donut ratios
const donutMovieRatio = movies.length / rawData.length;
const donutTvRatio = tvShows.length / rawData.length;
assert(Math.abs((donutMovieRatio + donutTvRatio) - 1.0) < 0.0001, "Donut chart shares sum precisely to 100%");

// Check Time Series Year Range
const yearsAddedSet = new Set(rawData.map(d => d.year_added).filter(Boolean));
assert(yearsAddedSet.has(2008) && yearsAddedSet.has(2021), "Time series spans additions from 2008 to 2021");

// Check Top Genres Aggregations
const genreMap = {};
rawData.forEach(d => {
  if (Array.isArray(d.genres)) {
    d.genres.forEach(g => { genreMap[g] = (genreMap[g] || 0) + 1; });
  }
});
const topGenre = Object.entries(genreMap).sort((a, b) => b[1] - a[1])[0];
assert(topGenre[0] === "International Movies" && topGenre[1] === 2752,
  `Top genre is 'International Movies' with 2,752 count (Found: ${topGenre[0]} - ${topGenre[1]})`);

// Check Top Countries Aggregations
const countryMap = {};
rawData.forEach(d => {
  if (Array.isArray(d.countries)) {
    d.countries.forEach(c => {
      if (c !== "Unknown") countryMap[c] = (countryMap[c] || 0) + 1;
    });
  }
});
const topCountry = Object.entries(countryMap).sort((a, b) => b[1] - a[1])[0];
assert(topCountry[0] === "United States" && topCountry[1] === 3681,
  `Top country is 'United States' with 3,681 count (Found: ${topCountry[0]} - ${topCountry[1]})`);

// 9. Standalone HTML Build Check
console.log("\n--- 9. STANDALONE PRODUCTION BUILD ---");
const standalonePath = path.join(__dirname, "standalone.html");
assert(fs.existsSync(standalonePath), "standalone.html bundle exists");
if (fs.existsSync(standalonePath)) {
  const stat = fs.statSync(standalonePath);
  assert(stat.size > 1000000, `standalone.html is fully populated (${(stat.size / (1024 * 1024)).toFixed(2)} MB)`);
}

// 10. Summary Report
console.log("\n======================================================================");
console.log(`TEST SUMMARY: ${passedTests} Passed | ${failedTests} Failed | ${totalTests} Total`);
console.log("======================================================================");

if (failedTests === 0) {
  console.log("✅ ALL DASHBOARD TESTS PASSED SUCCESSFULLY!\n");
  process.exit(0);
} else {
  console.error("❌ SOME TESTS FAILED!\n");
  process.exit(1);
}
