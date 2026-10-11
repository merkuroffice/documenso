#!/usr/bin/env python3
# The house rules for text, checked on what a change adds. The same file sits in
# every repository of merkuroffice; change it in all of them at once.
#
#   no em or en dash anywhere          use a comma, a colon, brackets or a new sentence
#   no comma before "und"              "A und B", never "A, und B"
#   real umlauts, no transliteration   "für", not "fuer"
#   no AI attribution                  in commit messages, PR title and PR body
#
# Only added lines count, so text that was there before blocks nothing; it is
# fixed when somebody touches it. A line that has to break a rule on purpose
# (a test, a quotation) carries "standards: ignore".
#
#   BASE=origin/main HEAD=HEAD python3 .github/scripts/check-standards.py
#
# In CI, BASE and HEAD come from the event, PR_TITLE and PR_BODY from the pull
# request. Exit code 1 lists every finding first.

import os
import re
import subprocess
import sys

ZERO = "0" * 40
SELF = ".github/scripts/check-standards.py"
SKIP_FILES = re.compile(r"(^|/)(package-lock\.json|.*\.lock|.*\.min\.(js|css)|.*\.(png|jpe?g|gif|ico|pdf|woff2?|ttf|otf|eot|zip|gz))$")

DASH = re.compile("[—–]")
COMMA_UND = re.compile(r",\s+und\b")
# Whole words only: a token that is part of an identifier, a key or a path
# (aenderungenAusfuehren, funktionen_geaendert, z.tueren, /zurueck) is data, not
# text, and stays untouched.
TRANSLITERATED = {
    "fuer", "ueber", "koennen", "koennte", "koennten", "muessen", "muesste", "moeglich",
    "moeglichkeit", "moeglichst", "waehrend", "groesse", "groesser", "pruefen", "prueft", "pruefung",
    "geprueft", "gruesse", "natuerlich", "spaeter", "naechste", "naechsten", "schoen", "aendern",
    "aenderung", "geaendert", "oeffnen", "oeffnet", "geoeffnet", "buero", "bueros", "schluessel",
    "ausfuehren", "gefuehrt", "hoeren", "waere", "haette", "wuerde", "wuerden", "zurueck",
    "ueberweisung", "rueckfrage", "loeschen", "geloescht", "fuehren", "fruehestens", "spaetestens",
}
TOKEN = re.compile(r"[\wÄÖÜäöüß./-]+")
AI = re.compile(r"co-authored-by:[^\n]*(claude|anthropic)|generated with \[?claude|\U0001F916", re.I)


def git(*args):
    return subprocess.run(["git", *args], capture_output=True, text=True, check=True).stdout


def resolve_range():
    base, head = os.environ.get("BASE", "").strip(), os.environ.get("HEAD", "").strip() or "HEAD"
    if not base or base == ZERO or subprocess.run(["git", "cat-file", "-e", base + "^{commit}"],
                                                  capture_output=True).returncode != 0:
        # A new branch or a first push: everything since the root.
        base = git("rev-list", "--max-parents=0", head).split()[-1]
    return base, head


def added_lines(base, head):
    diff = git("diff", "-U0", "--no-color", "--no-ext-diff", base, head)
    path, line = None, 0
    for raw in diff.splitlines():
        if raw.startswith("+++ "):
            path = None if raw == "+++ /dev/null" else raw[6:]
        elif raw.startswith("@@"):
            line = int(re.search(r"\+(\d+)", raw).group(1))
        elif raw.startswith("+") and path:
            yield path, line, raw[1:]
            line += 1


def check_text(path, line, text):
    if path == SELF or SKIP_FILES.search(path) or "standards: ignore" in text:
        return []
    found = []
    if DASH.search(text):
        found.append("Gedankenstrich (U+2014 oder U+2013): Komma, Doppelpunkt, Klammern oder neuer Satz")
    if COMMA_UND.search(text):
        found.append("Komma vor \"und\"")
    words = {t.lower().strip(".-/") for t in TOKEN.findall(text) if not re.search(r"[_/]|\w\.\w", t)} & TRANSLITERATED
    if words:
        found.append("Umschreibung statt Umlaut: " + ", ".join(sorted(words)))
    return found


def main():
    base, head = resolve_range()
    findings = []
    for path, line, text in added_lines(base, head):
        for message in check_text(path, line, text):
            findings.append(f"::error file={path},line={line}::{message}")

    for sha in git("rev-list", f"{base}..{head}").split():
        body = git("log", "-1", "--format=%B", sha)
        if AI.search(body):
            findings.append(f"::error::Commit {sha[:7]} trägt einen KI-Vermerk (Co-Authored-By: Claude, \"Generated with Claude\" oder 🤖)")
    for name in ("PR_TITLE", "PR_BODY"):
        if AI.search(os.environ.get(name, "")):
            findings.append(f"::error::{'Titel' if name == 'PR_TITLE' else 'Beschreibung'} des Pull Requests trägt einen KI-Vermerk")

    for f in findings:
        print(f)
    commits = len(git("rev-list", f"{base}..{head}").split())
    short = lambda ref: git("rev-parse", "--short", ref).strip()
    print(f"Geprüft: {short(base)}..{short(head)}, {commits} Commit(s), {len(findings)} Fund(e).")
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main())
