"""
export_json.py - Converts cleaned_netflix_titles(1).csv into data.js and data.json
Ensures the dashboard works seamlessly when opened via file:// or via local server.
"""

import sys
import os
import csv
import json
from datetime import datetime

# UTF-8 stdout on Windows
if sys.platform.startswith("win"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

def parse_dataset(csv_path="cleaned_netflix_titles(1).csv"):
    if not os.path.exists(csv_path):
        print(f"Error: {csv_path} not found.")
        sys.exit(1)

    records = []
    with open(csv_path, mode="r", encoding="utf-8", errors="replace") as f:
        reader = csv.DictReader(f)
        for r in reader:
            content_type = r.get("type", "").strip()
            dur_str = r.get("duration", "").strip()
            dur_min = None
            dur_seasons = None
            if content_type == "Movie" and "min" in dur_str:
                try:
                    dur_min = int(dur_str.replace("min", "").strip())
                except ValueError:
                    dur_min = None
            elif content_type == "TV Show" and "Season" in dur_str:
                try:
                    dur_seasons = int(dur_str.split()[0].strip())
                except ValueError:
                    dur_seasons = None

            # Date added parsing
            da_str = r.get("date_added", "").strip()
            year_added = None
            month_added = None
            if da_str:
                try:
                    dt = datetime.strptime(da_str, "%B %d, %Y")
                    year_added = dt.year
                    month_added = dt.month
                except Exception:
                    try:
                        dt = datetime.strptime(da_str, "%d-%b-%y")
                        year_added = dt.year
                        month_added = dt.month
                    except Exception:
                        pass

            # Release year
            ry_str = r.get("release_year", "").strip()
            try:
                release_year = int(ry_str)
            except ValueError:
                release_year = None

            # Split genres
            genre_str = r.get("listed_in", "").strip()
            genres = [g.strip() for g in genre_str.split(",") if g.strip()] if genre_str else []

            # Split countries
            country_str = r.get("country", "").strip()
            countries = [c.strip() for c in country_str.split(",") if c.strip() and c.strip() != "Unknown"] if country_str else []

            item = {
                "show_id": r.get("show_id", "").strip(),
                "type": content_type,
                "title": r.get("title", "").strip(),
                "country": country_str if country_str else "Unknown",
                "countries": countries,
                "date_added": da_str,
                "year_added": year_added,
                "month_added": month_added,
                "release_year": release_year,
                "rating": r.get("rating", "").strip(),
                "duration": dur_str,
                "duration_min": dur_min,
                "duration_seasons": dur_seasons,
                "listed_in": genre_str,
                "genres": genres,
            }

            # Optional columns
            if "director" in r:
                item["director"] = r.get("director", "").strip()
            if "cast" in r:
                item["cast"] = r.get("cast", "").strip()
            if "description" in r:
                item["description"] = r.get("description", "").strip()

            records.append(item)

    return records

def export_all():
    records = parse_dataset("cleaned_netflix_titles(1).csv")
    print(f"Parsed {len(records):,} records from cleaned_netflix_titles(1).csv")

    # Write data.json
    with open("data.json", "w", encoding="utf-8") as f:
        json.dump(records, f, ensure_ascii=False)
    print("Created data.json")

    # Write data.js for file:// execution
    js_content = "// Pre-bundled Netflix Dataset for Standalone Client Execution\n"
    js_content += f"window.NETFLIX_DATA = {json.dumps(records, ensure_ascii=False)};\n"
    with open("data.js", "w", encoding="utf-8") as f:
        f.write(js_content)
    print("Created data.js")

if __name__ == "__main__":
    export_all()
