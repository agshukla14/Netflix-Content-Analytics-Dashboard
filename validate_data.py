"""
validate_data.py - Netflix Dataset Comprehensive Validation Script
Validates cleaned_netflix_titles(1).csv data integrity, types, nulls, and distributions.
"""

import sys
import os
import csv
from datetime import datetime
from collections import Counter

# Set console encoding to UTF-8 on Windows
if sys.platform.startswith("win"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

def validate_dataset(filepath="cleaned_netflix_titles(1).csv"):
    print("=" * 70)
    print("NETFLIX CONTENT DATASET VALIDATION REPORT")
    print("=" * 70)
    print(f"Target File: {filepath}")

    if not os.path.exists(filepath):
        print(f"❌ ERROR: File not found at '{filepath}'")
        return False, {}

    try:
        with open(filepath, mode="r", encoding="utf-8", errors="replace") as f:
            reader = csv.DictReader(f)
            headers = reader.fieldnames
            rows = list(reader)
    except Exception as e:
        print(f"❌ ERROR: Failed to read CSV: {e}")
        return False, {}

    total_records = len(rows)
    num_columns = len(headers) if headers else 0

    print(f"✓ File successfully loaded.")
    print(f"✓ Total Records: {total_records:,}")
    print(f"✓ Total Columns: {num_columns} -> {headers}")

    if total_records == 0:
        print("❌ ERROR: Dataset contains 0 rows.")
        return False, {}

    # Expected required baseline columns
    baseline_cols = ['show_id', 'type', 'title', 'country', 'date_added', 'release_year', 'rating', 'duration', 'listed_in']
    missing_baseline = [col for col in baseline_cols if col not in headers]
    if missing_baseline:
        print(f"❌ ERROR: Missing essential columns: {missing_baseline}")
        return False, {}

    # Check for row duplicates and ID uniqueness
    seen_ids = set()
    duplicate_ids = 0
    seen_rows = set()
    duplicate_rows = 0

    # Null value tracking
    null_counts = {col: 0 for col in headers}
    total_nulls = 0

    # Type / Content checks
    type_counts = Counter()
    release_years = []
    years_added = []
    ratings = Counter()
    movie_durations = []
    tv_seasons = []
    all_genres = []
    all_countries = []

    date_parse_errors = 0
    year_parse_errors = 0

    for idx, r in enumerate(rows, start=1):
        # Full row duplicate check
        row_tuple = tuple(r.get(c, "") for c in headers)
        if row_tuple in seen_rows:
            duplicate_rows += 1
        seen_rows.add(row_tuple)

        # ID duplicate check
        show_id = r.get("show_id", "").strip()
        if show_id in seen_ids:
            duplicate_ids += 1
        seen_ids.add(show_id)

        # Null tracking (empty, NA, Unknown, null, none)
        for col in headers:
            val = (r.get(col) or "").strip()
            # In Netflix datasets, Unknown country and NA director/cast indicate missing data
            if not val or val.lower() in ("na", "null", "nan", "unknown", "none"):
                # Exception: title "Unknown" is the literal name of a 2011 film
                if col == "title" and val == "Unknown":
                    pass
                else:
                    null_counts[col] += 1
                    total_nulls += 1

        # Type validation
        content_type = r.get("type", "").strip()
        if content_type in ("Movie", "TV Show"):
            type_counts[content_type] += 1
        else:
            print(f"  ⚠️ Row {idx}: Unexpected content type '{content_type}'")

        # Release year validation
        ry_str = r.get("release_year", "").strip()
        try:
            ry = int(ry_str)
            if 1900 <= ry <= 2030:
                release_years.append(ry)
            else:
                print(f"  ⚠️ Row {idx}: Anomaly in release year '{ry}'")
        except ValueError:
            year_parse_errors += 1

        # Date added validation
        da_str = r.get("date_added", "").strip()
        if da_str:
            try:
                # Handle formats like "September 25, 2021"
                dt = datetime.strptime(da_str, "%B %d, %Y")
                years_added.append(dt.year)
            except Exception:
                try:
                    # Alternative format
                    dt = datetime.strptime(da_str, "%d-%b-%y")
                    years_added.append(dt.year)
                except Exception:
                    date_parse_errors += 1

        # Rating
        rating = r.get("rating", "").strip()
        if rating:
            ratings[rating] += 1

        # Duration
        dur = r.get("duration", "").strip()
        if content_type == "Movie":
            if "min" in dur:
                try:
                    m_min = int(dur.replace("min", "").strip())
                    movie_durations.append(m_min)
                except ValueError:
                    pass
        elif content_type == "TV Show":
            if "Season" in dur:
                try:
                    s_count = int(dur.split()[0].strip())
                    tv_seasons.append(s_count)
                except ValueError:
                    pass

        # Country splitting
        country_str = r.get("country", "").strip()
        if country_str and country_str != "Unknown":
            for c in country_str.split(","):
                c_clean = c.strip()
                if c_clean:
                    all_countries.append(c_clean)

        # Genre splitting
        genre_str = r.get("listed_in", "").strip()
        if genre_str:
            for g in genre_str.split(","):
                g_clean = g.strip()
                if g_clean:
                    all_genres.append(g_clean)

    # Print Detailed Statistics
    print("\n--- VALIDATION SUMMARY ---")
    print(f"• Total Records Validated: {total_records:,}")
    print(f"• Full Duplicate Rows: {duplicate_rows}")
    print(f"• Duplicate show_ids: {duplicate_ids}")
    print(f"• Total Missing/Null/Unknown Values: {total_nulls:,}")
    print("• Null Counts By Column:")
    for col, cnt in null_counts.items():
        pct = (cnt / total_records) * 100
        print(f"   - {col:14s}: {cnt:5d} ({pct:5.2f}%)")

    print("\n--- CONTENT METRICS ---")
    movies_cnt = type_counts["Movie"]
    tv_cnt = type_counts["TV Show"]
    movie_pct = (movies_cnt / total_records) * 100 if total_records else 0
    tv_pct = (tv_cnt / total_records) * 100 if total_records else 0
    print(f"• Movies: {movies_cnt:,} ({movie_pct:.1f}%)")
    print(f"• TV Shows: {tv_cnt:,} ({tv_pct:.1f}%)")

    if release_years:
        print(f"• Release Year Range: {min(release_years)} - {max(release_years)}")
    if years_added:
        print(f"• Year Added Range: {min(years_added)} - {max(years_added)}")
        print(f"• Date Parse Errors: {date_parse_errors}")

    if movie_durations:
        avg_m = sum(movie_durations) / len(movie_durations)
        print(f"• Movie Durations: Avg = {avg_m:.1f} min | Min = {min(movie_durations)} min | Max = {max(movie_durations)} min")

    if tv_seasons:
        avg_s = sum(tv_seasons) / len(tv_seasons)
        print(f"• TV Show Seasons: Avg = {avg_s:.2f} Seasons | Min = {min(tv_seasons)} | Max = {max(tv_seasons)} Seasons")

    print(f"\n• Unique Ratings ({len(ratings)}): {', '.join(sorted(ratings.keys()))}")
    print(f"• Unique Countries (split): {len(set(all_countries))}")
    print(f"• Unique Genres (split): {len(set(all_genres))}")

    top_countries = Counter(all_countries).most_common(5)
    print(f"• Top 5 Countries: {', '.join(f'{c} ({n})' for c, n in top_countries)}")

    top_genres = Counter(all_genres).most_common(5)
    print(f"• Top 5 Genres: {', '.join(f'{g} ({n})' for g, n in top_genres)}")

    # Validation criteria checks
    is_valid = (
        total_records > 0 and
        duplicate_rows == 0 and
        duplicate_ids == 0 and
        date_parse_errors == 0 and
        year_parse_errors == 0 and
        movies_cnt + tv_cnt == total_records
    )

    badge = f"Validated: {total_records:,} Records | {total_nulls:,} Nulls | {duplicate_rows} Duplicates"
    print("\n" + "=" * 70)
    if is_valid:
        print(f"✅ DATASET VALIDATION PASSED SUCCESSFULLY!")
        print(f"Badge: \"{badge}\"")
    else:
        print(f"❌ DATASET VALIDATION FAILED WITH ERRORS.")
    print("=" * 70)

    stats = {
        "records": total_records,
        "columns": num_columns,
        "column_names": headers,
        "nulls": total_nulls,
        "duplicates": duplicate_rows,
        "movies": movies_cnt,
        "tv_shows": tv_cnt,
        "unique_countries": len(set(all_countries)),
        "unique_ratings": len(ratings),
        "unique_genres": len(set(all_genres)),
        "min_year": min(release_years) if release_years else None,
        "max_year": max(release_years) if release_years else None,
        "avg_movie_duration": round(sum(movie_durations) / len(movie_durations), 1) if movie_durations else 0,
        "avg_tv_seasons": round(sum(tv_seasons) / len(tv_seasons), 2) if tv_seasons else 0,
        "badge": badge
    }

    return is_valid, stats

if __name__ == "__main__":
    csv_file = sys.argv[1] if len(sys.argv) > 1 else "cleaned_netflix_titles(1).csv"
    valid, stats = validate_dataset(csv_file)
    sys.exit(0 if valid else 1)
